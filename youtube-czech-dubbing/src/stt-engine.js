/**
 * stt-engine.js
 *
 * Web Speech API wrapper for live speech-to-text. Continuous mode with
 * auto-restart (Chrome / Safari end the session after ~60s silence) and
 * interim/final result fan-out.
 *
 * Browser support:
 *   - Chrome / Edge / Opera: window.webkitSpeechRecognition (Google cloud, free)
 *   - Safari macOS 14.1+ / iOS Safari 14.5+: window.SpeechRecognition (on-device)
 *   - Firefox: not supported — caller falls back to OpenAI Realtime / Whisper
 *
 * Languages: BCP-47 locales. Apple supports a subset (~50). For "auto-detect"
 * we round-trip through the translator's lang-detect path — STT itself can't
 * truly detect; we ship with the user's last-picked source language.
 */

class STTEngine {
  constructor() {
    this.lang = 'en-US';
    this.continuous = true;
    this.interim = true;
    this.deviceId = null;            // null = system default
    this.isRunning = false;

    this._rec = null;
    this._intentToRun = false;
    this._restartTimer = null;
    this._lastResultAt = 0;
    this._silenceStallTimer = null;
    this._SILENCE_STALL_MS = 8000;   // restart if no result for this long

    // Callbacks
    this.onInterim = null;           // (text) — preview while speaking
    this.onFinal = null;             // (text, lang) — committed sentence
    this.onError = null;             // (msg)
    this.onStateChange = null;       // ('listening'|'idle'|'restarting')
  }

  static isSupported() {
    return !!(typeof window !== 'undefined' &&
             (window.SpeechRecognition || window.webkitSpeechRecognition));
  }

  static availableLangs() {
    // Curated subset — what most browsers reliably handle. Source-language
    // dropdown in the UI uses this list.
    return [
      { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
      { code: 'en-GB', name: 'English (UK)', flag: '🇬🇧' },
      { code: 'de-DE', name: 'Deutsch',       flag: '🇩🇪' },
      { code: 'fr-FR', name: 'Français',      flag: '🇫🇷' },
      { code: 'es-ES', name: 'Español',       flag: '🇪🇸' },
      { code: 'it-IT', name: 'Italiano',      flag: '🇮🇹' },
      { code: 'nl-NL', name: 'Nederlands',    flag: '🇳🇱' },
      { code: 'pl-PL', name: 'Polski',        flag: '🇵🇱' },
      { code: 'sk-SK', name: 'Slovenčina',    flag: '🇸🇰' },
      { code: 'cs-CZ', name: 'Čeština',       flag: '🇨🇿' },
      { code: 'hu-HU', name: 'Magyar',        flag: '🇭🇺' },
      { code: 'ru-RU', name: 'Русский',       flag: '🇷🇺' },
      { code: 'uk-UA', name: 'Українська',    flag: '🇺🇦' },
      { code: 'tr-TR', name: 'Türkçe',        flag: '🇹🇷' },
      { code: 'pt-PT', name: 'Português',     flag: '🇵🇹' },
      { code: 'pt-BR', name: 'Português (BR)',flag: '🇧🇷' },
      { code: 'ja-JP', name: '日本語',         flag: '🇯🇵' },
      { code: 'ko-KR', name: '한국어',         flag: '🇰🇷' },
      { code: 'zh-CN', name: '中文',           flag: '🇨🇳' },
      { code: 'ar-SA', name: 'العربية',       flag: '🇸🇦' },
      { code: 'hi-IN', name: 'हिन्दी',          flag: '🇮🇳' }
    ];
  }

  static async listInputDevices() {
    try {
      // Trigger permission so labels are populated; without it most browsers
      // hide device names for privacy.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      const all = await navigator.mediaDevices.enumerateDevices();
      return all
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ id: d.deviceId, label: d.label || 'Microphone' }));
    } catch (e) {
      console.warn('[STT] listInputDevices failed:', e?.message || e);
      return [];
    }
  }

  static async listOutputDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({ id: d.deviceId, label: d.label || 'Speaker' }));
    } catch (_) {
      return [];
    }
  }

  setLang(code) {
    this.lang = code;
    if (this._rec) this._rec.lang = code;
  }

  setDeviceId(id) {
    this.deviceId = id;
  }

  /**
   * Start continuous recognition. Idempotent — multiple calls are no-ops.
   */
  start() {
    if (!STTEngine.isSupported()) {
      this.onError?.('Speech recognition not supported in this browser');
      return false;
    }
    if (this.isRunning) return true;

    this._intentToRun = true;
    this._spawnRecognition();
    return true;
  }

  stop() {
    this._intentToRun = false;
    this._clearRestartTimer();
    this._clearSilenceStallTimer();
    if (this._rec) {
      try { this._rec.stop(); } catch (_) {}
      this._rec = null;
    }
    this.isRunning = false;
    this.onStateChange?.('idle');
  }

  _spawnRecognition() {
    const Klass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Klass) {
      this.onError?.('SpeechRecognition class missing');
      return;
    }

    const rec = new Klass();
    rec.lang = this.lang;
    rec.continuous = this.continuous;
    rec.interimResults = this.interim;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.isRunning = true;
      this._lastResultAt = Date.now();
      this._scheduleSilenceStallCheck();
      this.onStateChange?.('listening');
    };

    rec.onresult = (event) => {
      this._lastResultAt = Date.now();
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = (result[0]?.transcript || '').trim();
        if (!text) continue;
        if (result.isFinal) {
          this.onFinal?.(text, this.lang);
        } else {
          interimChunk = (interimChunk + ' ' + text).trim();
        }
      }
      if (interimChunk) this.onInterim?.(interimChunk);
    };

    rec.onerror = (event) => {
      const code = event.error || 'unknown';
      // 'no-speech' / 'aborted' are routine on long silences; just restart.
      const transient = code === 'no-speech' || code === 'aborted' || code === 'audio-capture';
      if (!transient) this.onError?.(`STT error: ${code}`);
      console.log('[STT] error:', code);
    };

    rec.onend = () => {
      this.isRunning = false;
      this.onStateChange?.('restarting');
      // Auto-restart while user wants to keep listening
      if (this._intentToRun) this._scheduleRestart();
      else this.onStateChange?.('idle');
    };

    try {
      rec.start();
      this._rec = rec;
    } catch (e) {
      console.warn('[STT] start threw:', e?.message || e);
      // 'InvalidStateError' fires if rec is still alive — schedule restart instead
      this._scheduleRestart();
    }
  }

  _scheduleRestart() {
    this._clearRestartTimer();
    this._restartTimer = setTimeout(() => {
      if (this._intentToRun) this._spawnRecognition();
    }, 250);
  }

  _clearRestartTimer() {
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
  }

  _scheduleSilenceStallCheck() {
    this._clearSilenceStallTimer();
    this._silenceStallTimer = setInterval(() => {
      if (!this._intentToRun) return this._clearSilenceStallTimer();
      const idle = Date.now() - this._lastResultAt;
      if (idle > this._SILENCE_STALL_MS && this._rec) {
        try { this._rec.stop(); } catch (_) {}
        // onend → _scheduleRestart fires
      }
    }, 2000);
  }

  _clearSilenceStallTimer() {
    if (this._silenceStallTimer) {
      clearInterval(this._silenceStallTimer);
      this._silenceStallTimer = null;
    }
  }
}

if (typeof window !== 'undefined') window.STTEngine = STTEngine;
