/**
 * live-translate.js
 *
 * Orchestrator for live simultaneous translation: AirPods mic → Web Speech
 * API STT → Gemini/DeepL/etc translator → Gemini/Edge TTS → AirPods speaker.
 *
 * Designed for business-meeting / conversation scenarios where the user wears
 * Bluetooth earbuds and needs near-real-time Czech audio of whatever the
 * other party said. Also doubles as a hearing-aid layer for HoH users.
 *
 * Pipeline contract:
 *   1. STT emits final sentence chunks (interim shown live in UI only)
 *   2. Each final chunk goes to translator.translate(text, sourceLang, 'cs')
 *      — translation is short, latency ~300-800ms with Gemini Flash-Lite
 *   3. Translated text is queued and played via tts.speak(text)
 *      — prefetch pump warms the next chunk while current plays
 *
 * The same TTSEngine + Translator instances used by YouTube dubbing get
 * reused, so the prefetch cache, audio cache (P2) and rate-limit pacing
 * all carry over for free.
 */

class LiveTranslate {
  constructor() {
    // Default to Web Speech API (free, low-latency); can be swapped to
    // Gemini-audio or OpenAI Realtime Whisper at runtime when Web Speech
    // misbehaves in chrome-extension:// origin.
    this.sttEngineName = 'webspeech';
    this.stt = new STTEngine();
    this._geminiStt = null; // lazy-instantiated
    this._openaiStt = null; // lazy-instantiated
    this._openaiRealtimeClient = null;
    this.translator = new Translator();
    this.tts = new TTSEngine();

    this.sourceLang = 'en-US';
    this.targetLang = 'cs';
    this._uiStrings = getLanguageConfig('cs').uiStrings || {};

    // Recent transcript log: [{ original, translated, at, status }]
    this.transcript = [];
    this.MAX_TRANSCRIPT = 60;

    // Pending translations waiting for TTS playback
    this._speakQueue = [];
    this._isSpeaking = false;

    // UI hooks (page wires these)
    this.onTranscriptChange = null;  // (transcript[]) — re-render history
    this.onInterim = null;            // (text) — live preview
    this.onState = null;              // ('idle'|'listening'|'translating'|'speaking'|'error', message?)
    this.onLevel = null;              // (rms 0..1) — VU meter

    // Audio level monitoring (separate from STT — purely cosmetic)
    this._audioCtx = null;
    this._levelTimer = null;
    this._micStream = null;

    this._wireSTT();
  }

  static isSupported() {
    return STTEngine.isSupported()
      || (typeof GeminiAudioSTT !== 'undefined' && GeminiAudioSTT.isSupported?.())
      || (typeof OpenAIRealtimeSTT !== 'undefined' && OpenAIRealtimeSTT.isSupported?.());
  }

  async init() {
    // Translator loads its own settings from chrome.storage (DeepL/Claude
    // keys, Gemini key for translation). The TTS engine configuration is
    // managed by the page (applyTtsEngine) — DON'T call tts._loadTTSSettings
    // here, it would clobber the engine/voice/key the user just picked
    // in the Live UI with whatever YouTube dubbing has stored.
    await this.translator.loadSettings();
    this.translator._targetLang = this.targetLang;
    this.translator._langConfig = getLanguageConfig(this.targetLang);
    this.tts.setTargetLanguage(this.targetLang);
    await this.tts.waitForVoice();
    console.log('[Live] init done. translator engine=', this.translator._engine,
                ' tts engine=', this.tts._ttsEngine,
                ' tts voice=', this.tts._edgeVoice || this.tts._geminiVoice || 'system');
  }

  setSourceLang(code) {
    this.sourceLang = code;
    this.stt.setLang(code);
    if (this._geminiStt) this._geminiStt.setLang(code);
    if (this._openaiStt) this._openaiStt.setLang(code);
  }

  setTargetLang(code) {
    this.targetLang = code;
    this.translator._targetLang = code;
    this.translator._langConfig = getLanguageConfig(code);
    this.tts.setTargetLanguage(code);
    // Re-derive Edge TTS voice for the new target (if user is on Edge)
    if (this.tts._ttsEngine === 'edge' && this._edgeGender) {
      this._applyEdgeVoiceForTarget();
    }
    if (this._geminiStt) this._geminiStt.setTargetLang(code);
  }

  /**
   * Pick Edge / Microsoft Neural voice for current target language by gender.
   * Without this, "edge-male" / "edge-female" UI options were hard-coded to
   * Czech voices regardless of target — Swedish target spoke Czech.
   */
  setEdgeGender(gender) {
    this._edgeGender = gender;
    this._applyEdgeVoiceForTarget();
  }

  _applyEdgeVoiceForTarget() {
    const cfg = getLanguageConfig(this.targetLang) || {};
    const voices = cfg.azureVoices || [];
    const want = this._edgeGender || 'male';
    const match = voices.find(v => v.gender === want) || voices[0];
    if (match?.id) {
      this.tts._edgeVoice = match.id;
      console.log('[Live] edge voice for', this.targetLang, want, '→', match.id);
    }
  }

  setMicDevice(deviceId) {
    this.stt.setDeviceId(deviceId);
    if (this._geminiStt) this._geminiStt.setDeviceId(deviceId);
    if (this._openaiStt) this._openaiStt.setDeviceId(deviceId);
  }

  /**
   * Switch STT engine. 'webspeech' uses Web Speech API (default, free,
   * low-latency on https:// origins). 'gemini' uses MediaRecorder + Gemini
   * audio input. 'openai' uses Realtime Whisper via direct OpenAI API.
   */
  setSttEngine(name) {
    if (name !== 'webspeech' && name !== 'gemini' && name !== 'openai') return;
    if (this.sttEngineName === name) return;
    if (this.stt.isRunning) this.stt.stop();
    if (this._geminiStt?.isRunning) this._geminiStt.stop();
    if (this._openaiStt?.isRunning) this._openaiStt.stop();
    this.sttEngineName = name;
    if (name === 'gemini' && !this._geminiStt) {
      this._geminiStt = new GeminiAudioSTT();
      this._wireGeminiStt();
    }
    if (name === 'openai' && !this._openaiStt) {
      this._ensureOpenAIStt();
    }
    console.log('[Live] STT engine →', name);
  }

  setGeminiKey(key) {
    if (this._geminiStt) this._geminiStt.setApiKey(key);
  }

  /** Pick the active STT instance based on current engine name. */
  _activeStt() {
    if (this.sttEngineName === 'gemini' && this._geminiStt) return this._geminiStt;
    if (this.sttEngineName === 'openai' && this._openaiStt) return this._openaiStt;
    return this.stt;
  }

  isRunning() {
    return !!(this.stt.isRunning || this._geminiStt?.isRunning || this._openaiStt?.isRunning);
  }

  async start() {
    await this.init();
    this.transcript = [];
    this.onTranscriptChange?.(this.transcript);

    if (this.sttEngineName === 'gemini') {
      if (!this._geminiStt) {
        this._geminiStt = new GeminiAudioSTT();
        this._wireGeminiStt();
      }
      this._geminiStt.setLang(this.sourceLang);
      this._geminiStt.setTargetLang(this.targetLang);
      const key = this.tts._geminiKey || this.translator._geminiApiKey;
      this._geminiStt.setApiKey(key);
      const ok = await this._geminiStt.start();
      if (ok) this.onState?.('listening');
      return ok;
    }

    if (this.sttEngineName === 'openai') {
      const openaiStt = this._ensureOpenAIStt();
      if (!openaiStt) {
        this.onState?.('error', 'OpenAI Realtime Whisper není v tomto buildu dostupný');
        return false;
      }
      openaiStt.setLang(this.sourceLang);
      const ok = await openaiStt.start();
      if (ok) this.onState?.('listening');
      return ok;
    }

    // Web Speech path — drive level meter from STT speech events instead of
    // a parallel mic stream (otherwise webkitSpeechRecognition silently
    // refuses to start its own audio capture).
    this._wireSpeechLevels();
    const ok = this.stt.start();
    if (ok) this.onState?.('listening');
    return ok;
  }

  /**
   * Drive the VU meter from STT speech events instead of a parallel mic
   * stream. Less precise than RMS but doesn't fight SpeechRecognition for
   * the mic device. Hooks `onspeechstart` / `onspeechend` on the recognizer.
   */
  _wireSpeechLevels() {
    let interval = null;
    let target = 0;
    let displayed = 0;
    const tick = () => {
      displayed += (target - displayed) * 0.25;
      this.onLevel?.(Math.max(0.04, displayed));
    };
    // Replace earlier installed handlers
    const origSpawn = this.stt._spawnRecognition.bind(this.stt);
    this.stt._spawnRecognition = function () {
      const rv = origSpawn();
      if (this._rec) {
        const prevSS = this._rec.onspeechstart;
        const prevSE = this._rec.onspeechend;
        this._rec.onspeechstart = (...a) => {
          target = 0.85;
          if (!interval) interval = setInterval(tick, 60);
          if (prevSS) prevSS(...a);
        };
        this._rec.onspeechend = (...a) => {
          target = 0;
          setTimeout(() => {
            if (target === 0) {
              if (interval) { clearInterval(interval); interval = null; }
            }
          }, 600);
          if (prevSE) prevSE(...a);
        };
      }
      return rv;
    };
  }

  stop() {
    this.stt.stop();
    if (this._geminiStt?.isRunning) this._geminiStt.stop();
    if (this._openaiStt?.isRunning) this._openaiStt.stop();
    this.tts.stop();
    this._speakQueue = [];
    this._isSpeaking = false;
    if (typeof this._stopLevelMeter === 'function') this._stopLevelMeter();
    this.onLevel?.(0);
    this.onState?.('idle');
  }

  // ───────────── pipeline ─────────────

  /**
   * Wire GeminiAudioSTT callbacks. Gemini returns both transcript AND
   * translation in one call, so we skip the translator step entirely and
   * push the entry directly to the speak queue.
   */
  _wireGeminiStt() {
    if (!this._geminiStt) return;
    this._geminiStt.onLevel = (rms) => this.onLevel?.(rms);
    this._geminiStt.onInterim = (text) => this.onInterim?.(text);
    this._geminiStt.onError = (msg) => {
      console.warn('[Live] Gemini STT error:', msg);
      this.onState?.('error', msg);
    };
    this._geminiStt.onStateChange = (state) => {
      if (this._isSpeaking) return;
      this.onState?.(state === 'listening' ? 'listening' : 'idle');
    };
    this._geminiStt.onFinal = (original, sourceLang, translated) => {
      console.log('[Live] Gemini final:', JSON.stringify(original.slice(0, 80)),
                  '→', JSON.stringify((translated || '').slice(0, 80)));
      const entry = {
        id: Date.now() + ':' + Math.random().toString(36).slice(2, 8),
        original,
        sourceLang: sourceLang || this.sourceLang,
        translated: translated || original,
        status: translated ? 'ready' : 'speaking',
        at: Date.now()
      };
      this.transcript.unshift(entry);
      if (this.transcript.length > this.MAX_TRANSCRIPT) {
        this.transcript.length = this.MAX_TRANSCRIPT;
      }
      this.onTranscriptChange?.(this.transcript);
      if (entry.translated) this._enqueueSpeak(entry);
    };
  }

  _ensureOpenAIStt() {
    if (typeof OpenAIRealtimeSTT === 'undefined') return null;
    if (!this._openaiRealtimeClient && typeof OpenAIRealtimeClient !== 'undefined') {
      this._openaiRealtimeClient = new OpenAIRealtimeClient();
    }
    if (!this._openaiStt) {
      this._openaiStt = new OpenAIRealtimeSTT(this._openaiRealtimeClient);
      this._wireOpenAIStt();
    }
    return this._openaiStt;
  }

  _wireOpenAIStt() {
    if (!this._openaiStt) return;
    this._openaiStt.onLevel = (rms) => this.onLevel?.(rms);
    this._openaiStt.onInterim = (text) => this.onInterim?.(text);
    this._openaiStt.onError = (msg) => {
      console.warn('[Live] OpenAI STT error:', msg);
      this.onState?.('error', msg);
    };
    this._openaiStt.onStateChange = (state) => {
      if (this._isSpeaking) return;
      this.onState?.(state === 'listening' ? 'listening' : 'idle');
    };
    this._openaiStt.onFinal = (text, lang) => {
      console.log('[Live] OpenAI STT final:', JSON.stringify(text), 'lang=', lang);
      this._handleTranscriptFinal(text, lang);
    };
  }

  _wireSTT() {
    this.stt.onInterim = (text) => {
      this.onInterim?.(text);
    };
    this.stt.onFinal = (text, lang) => {
      console.log('[Live] STT final:', JSON.stringify(text), 'lang=', lang);
      this._handleTranscriptFinal(text, lang);
    };
    this.stt.onError = (msg) => {
      console.warn('[Live] STT error:', msg);
      this.onState?.('error', msg);
    };
    this.stt.onStateChange = (state) => {
      if (this._isSpeaking) return;
      this.onState?.(state === 'listening' ? 'listening' : 'idle');
    };
  }

  _handleTranscriptFinal(text, lang) {
    const entry = {
      id: Date.now() + ':' + Math.random().toString(36).slice(2, 8),
      original: text,
      sourceLang: lang || this.sourceLang,
      translated: '',
      status: 'translating',
      at: Date.now()
    };
    this.transcript.unshift(entry);
    if (this.transcript.length > this.MAX_TRANSCRIPT) {
      this.transcript.length = this.MAX_TRANSCRIPT;
    }
    this.onTranscriptChange?.(this.transcript);
    this._translate(entry);
  }

  async _translate(entry) {
    const sourceShort = entry.sourceLang.split('-')[0];
    if (sourceShort === this.targetLang) {
      console.log('[Live] same source/target — skipping translation (hearing-aid mode)');
      entry.translated = entry.original;
      entry.status = 'ready';
      this.onTranscriptChange?.(this.transcript);
      this._enqueueSpeak(entry);
      return;
    }
    try {
      console.log('[Live] translating', sourceShort, '→', this.targetLang,
                  ' engine=', this.translator._engine,
                  ' text=', JSON.stringify(entry.original.slice(0, 80)));
      const translated = await this.translator.translate(entry.original, sourceShort);
      console.log('[Live] translated:', JSON.stringify((translated || '').slice(0, 80)));
      if (!translated || !translated.trim()) {
        throw new Error('Překlad vrátil prázdný výsledek (' + this.translator._engine + ')');
      }
      entry.translated = translated;
      entry.status = 'ready';
      this.onTranscriptChange?.(this.transcript);
      this._enqueueSpeak(entry);
    } catch (e) {
      console.warn('[Live] translation failed:', e?.message || e);
      entry.translated = '';
      entry.status = 'error';
      entry.error = e?.message || String(e);
      this.onTranscriptChange?.(this.transcript);
      this.onState?.('error', `Překlad selhal: ${entry.error}`);
    }
  }

  _enqueueSpeak(entry) {
    if (!entry.translated) return;
    this._speakQueue.push(entry);
    // Prefetch next-after-next while current speaks
    const peek = this._speakQueue[1];
    if (peek?.translated && this.tts.prefetch) {
      try { this.tts.prefetch(peek.translated); } catch (_) {}
    }
    this._processSpeak();
  }

  async _processSpeak() {
    if (this._isSpeaking) return;
    if (this._speakQueue.length === 0) return;

    const entry = this._speakQueue.shift();
    this._isSpeaking = true;
    entry.status = 'speaking';
    this.onTranscriptChange?.(this.transcript);
    this.onState?.('speaking');

    const next = this._speakQueue[0];
    if (next?.translated && this.tts.prefetch) {
      try { this.tts.prefetch(next.translated); } catch (_) {}
    }

    console.log('[Live] speaking via', this.tts._ttsEngine,
                JSON.stringify(entry.translated.slice(0, 80)));
    try {
      await this.tts.speak(entry.translated);
      entry.status = 'spoken';
      console.log('[Live] speak done');
    } catch (e) {
      console.warn('[Live] speak failed:', e?.message || e);
      entry.status = 'error';
      entry.error = e?.message || String(e);
      this.onState?.('error', `TTS selhalo: ${entry.error}`);
    } finally {
      this._isSpeaking = false;
      this.onTranscriptChange?.(this.transcript);
      if (this._speakQueue.length > 0) {
        this._processSpeak();
      } else {
        this.onState?.(this.stt.isRunning ? 'listening' : 'idle');
      }
    }
  }

  // ───────────── audio level meter ─────────────

  async _startLevelMeter() {
    try {
      const constraints = this.stt.deviceId
        ? { audio: { deviceId: { exact: this.stt.deviceId } } }
        : { audio: true };
      this._micStream = await navigator.mediaDevices.getUserMedia(constraints);
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = this._audioCtx.createMediaStreamSource(this._micStream);
      const analyser = this._audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      this._levelTimer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.min(1, Math.sqrt(sum / data.length) * 4);
        this.onLevel?.(rms);
      }, 80);
    } catch (e) {
      console.warn('[Live] level meter unavailable:', e?.message || e);
    }
  }

  _stopLevelMeter() {
    if (this._levelTimer) {
      clearInterval(this._levelTimer);
      this._levelTimer = null;
    }
    if (this._audioCtx) {
      try { this._audioCtx.close(); } catch (_) {}
      this._audioCtx = null;
    }
    if (this._micStream) {
      this._micStream.getTracks().forEach(t => t.stop());
      this._micStream = null;
    }
    this.onLevel?.(0);
  }
}

if (typeof window !== 'undefined') window.LiveTranslate = LiveTranslate;
