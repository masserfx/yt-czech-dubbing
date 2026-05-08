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
    this.stt = new STTEngine();
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
    return STTEngine.isSupported();
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
  }

  setTargetLang(code) {
    this.targetLang = code;
    this.translator._targetLang = code;
    this.translator._langConfig = getLanguageConfig(code);
    this.tts.setTargetLanguage(code);
  }

  setMicDevice(deviceId) {
    this.stt.setDeviceId(deviceId);
  }

  async start() {
    await this.init();
    this.transcript = [];
    this.onTranscriptChange?.(this.transcript);
    // Skip the parallel getUserMedia VU-meter stream — on Chrome desktop it
    // can prevent webkitSpeechRecognition's own audio capture from kicking in
    // (silent failure: onstart never fires). Visual feedback now comes from
    // STT speech events (see _wireSpeechLevels below).
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
    this.tts.stop();
    this._speakQueue = [];
    this._isSpeaking = false;
    if (typeof this._stopLevelMeter === 'function') this._stopLevelMeter();
    this.onLevel?.(0);
    this.onState?.('idle');
  }

  // ───────────── pipeline ─────────────

  _wireSTT() {
    this.stt.onInterim = (text) => {
      this.onInterim?.(text);
    };
    this.stt.onFinal = (text, lang) => {
      console.log('[Live] STT final:', JSON.stringify(text), 'lang=', lang);
      const entry = {
        id: Date.now() + ':' + Math.random().toString(36).slice(2, 8),
        original: text,
        sourceLang: lang,
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
