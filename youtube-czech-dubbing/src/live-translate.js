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
    await this.translator.loadSettings();
    await this.tts._loadTTSSettings();
    this.translator._targetLang = this.targetLang;
    this.translator._langConfig = getLanguageConfig(this.targetLang);
    this.tts.setTargetLanguage(this.targetLang);
    await this.tts.waitForVoice();
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
    await this._startLevelMeter();
    const ok = this.stt.start();
    if (ok) this.onState?.('listening');
    return ok;
  }

  stop() {
    this.stt.stop();
    this.tts.stop();
    this._speakQueue = [];
    this._isSpeaking = false;
    this._stopLevelMeter();
    this.onState?.('idle');
  }

  // ───────────── pipeline ─────────────

  _wireSTT() {
    this.stt.onInterim = (text) => {
      this.onInterim?.(text);
    };
    this.stt.onFinal = (text, lang) => {
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
    this.stt.onError = (msg) => this.onState?.('error', msg);
    this.stt.onState = (state) => {
      // Don't override 'speaking' state with STT 'listening' transitions
      if (this._isSpeaking) return;
      this.onState?.(state === 'listening' ? 'listening' : 'idle');
    };
  }

  async _translate(entry) {
    const sourceShort = entry.sourceLang.split('-')[0];
    if (sourceShort === this.targetLang) {
      // Same language — skip translation, still speak it (hearing-aid mode)
      entry.translated = entry.original;
      entry.status = 'ready';
      this.onTranscriptChange?.(this.transcript);
      this._enqueueSpeak(entry);
      return;
    }
    try {
      const translated = await this.translator.translate(entry.original, sourceShort);
      entry.translated = translated || entry.original;
      entry.status = 'ready';
      this.onTranscriptChange?.(this.transcript);
      this._enqueueSpeak(entry);
    } catch (e) {
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

    // Prefetch next while we play current
    const next = this._speakQueue[0];
    if (next?.translated && this.tts.prefetch) {
      try { this.tts.prefetch(next.translated); } catch (_) {}
    }

    try {
      await this.tts.speak(entry.translated);
      entry.status = 'spoken';
    } catch (e) {
      entry.status = 'error';
      entry.error = e?.message || String(e);
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
