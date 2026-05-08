/**
 * gemini-audio-stt.js
 *
 * STT + translation via Gemini 3.1 Flash audio input. Replaces the Web Speech
 * API for Live Translate when running in `chrome-extension://` origin where
 * Chrome's cloud STT refuses to return final transcripts.
 *
 * Pipeline per chunk:
 *   1. MediaRecorder captures audio while user speaks (webm/opus)
 *   2. Browser-side VAD (Web Audio Analyser RMS) decides when to commit a
 *      chunk: silence ≥ 800ms after speech triggers stop+upload
 *   3. Audio bytes → background.js → Gemini generateContent with prompt
 *      "Transcribe in {sourceLang}, translate to {targetLang}, JSON out"
 *   4. Response parsed → emits onFinal with both original + translated text
 *
 * Public interface mirrors STTEngine so LiveTranslate can swap engines.
 *   start(), stop(), setLang(), setDeviceId()
 *   onInterim, onFinal(text, lang, translated?), onError, onStateChange,
 *   onLevel
 *   isRunning, lang, deviceId
 */

class GeminiAudioSTT {
  constructor() {
    this.lang = 'auto';                // 'auto' lets Gemini detect
    this.targetLang = 'cs';
    this.deviceId = null;
    this.isRunning = false;
    this.apiKey = null;

    // VAD tuning — tighter for snappier real-time feel
    this.SILENCE_THRESHOLD = 0.025;    // RMS below = silent
    this.SILENCE_HANGOVER_MS = 400;    // commit chunk after this much silence
    this.MIN_SPEECH_MS = 250;          // ignore micro-bursts shorter than this
    this.MAX_CHUNK_MS = 10000;         // hard chunk cut at 10s

    this._stream = null;
    this._audioCtx = null;
    this._analyser = null;
    this._levelTimer = null;
    this._recorder = null;
    this._chunks = [];
    this._speechStartedAt = 0;
    this._lastSoundAt = 0;
    this._inSpeech = false;
    this._chunkCounter = 0;
    this._intentToRun = false;

    // Callbacks (set by orchestrator)
    this.onInterim = null;
    this.onFinal = null;            // (originalText, sourceLang, translatedText)
    this.onError = null;
    this.onStateChange = null;
    this.onLevel = null;
  }

  static isSupported() {
    return !!(typeof window !== 'undefined' &&
              navigator?.mediaDevices?.getUserMedia &&
              window.MediaRecorder &&
              window.AudioContext);
  }

  setLang(code) { this.lang = code; }
  setTargetLang(code) { this.targetLang = code; }
  setDeviceId(id) { this.deviceId = id; }
  setApiKey(key) { this.apiKey = key; }

  async start() {
    if (!GeminiAudioSTT.isSupported()) {
      this.onError?.('Browser nepodporuje MediaRecorder + AudioContext');
      return false;
    }
    if (!this.apiKey) {
      this.onError?.('Chybí Gemini API klíč pro audio STT');
      return false;
    }
    if (this.isRunning) return true;

    this._intentToRun = true;
    try {
      const constraints = this.deviceId
        ? { audio: { deviceId: { exact: this.deviceId }, echoCancellation: true, noiseSuppression: true } }
        : { audio: { echoCancellation: true, noiseSuppression: true } };
      this._stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      this.onError?.('Nepodařilo se získat mikrofon: ' + (e?.message || e));
      return false;
    }

    this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // iOS Safari requires explicit resume() inside the user-gesture path
    if (this._audioCtx.state === 'suspended') {
      try { await this._audioCtx.resume(); } catch (_) {}
    }
    const source = this._audioCtx.createMediaStreamSource(this._stream);
    this._analyser = this._audioCtx.createAnalyser();
    this._analyser.fftSize = 1024;
    this._analyser.smoothingTimeConstant = 0.6;
    source.connect(this._analyser);

    this._startVadLoop();
    this._startNewRecorder();
    this.isRunning = true;
    this.onStateChange?.('listening');
    console.log('[GAS] started — VAD + MediaRecorder running');
    return true;
  }

  stop() {
    this._intentToRun = false;
    this._stopVadLoop();
    if (this._recorder && this._recorder.state !== 'inactive') {
      try { this._recorder.stop(); } catch (_) {}
    }
    this._recorder = null;
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop());
      this._stream = null;
    }
    if (this._audioCtx) {
      try { this._audioCtx.close(); } catch (_) {}
      this._audioCtx = null;
    }
    this._analyser = null;
    this._chunks = [];
    this._inSpeech = false;
    this.isRunning = false;
    this.onLevel?.(0);
    this.onStateChange?.('idle');
    console.log('[GAS] stopped');
  }

  // ───────────── VAD loop ─────────────

  _startVadLoop() {
    const data = new Uint8Array(this._analyser.fftSize);
    this._levelTimer = setInterval(() => {
      if (!this._analyser) return;
      this._analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      this.onLevel?.(Math.min(1, rms * 4));

      const now = Date.now();
      const isSound = rms > this.SILENCE_THRESHOLD;

      if (isSound) {
        this._lastSoundAt = now;
        if (!this._inSpeech) {
          this._inSpeech = true;
          this._speechStartedAt = now;
          this.onInterim?.('…');
        }
      } else if (this._inSpeech) {
        const silentFor = now - this._lastSoundAt;
        if (silentFor >= this.SILENCE_HANGOVER_MS) {
          const speechMs = this._lastSoundAt - this._speechStartedAt;
          this._inSpeech = false;
          this.onInterim?.('');
          if (speechMs >= this.MIN_SPEECH_MS) {
            this._commitChunk('vad-silence');
          } else {
            // too short — drop and restart fresh
            this._restartRecorder('too-short');
          }
        }
      } else if (this._inSpeech &&
                 (now - this._speechStartedAt) > this.MAX_CHUNK_MS) {
        // Long monologue — chunk every MAX_CHUNK_MS
        this._inSpeech = false;
        this._speechStartedAt = now;
        this._commitChunk('max-len');
        this._inSpeech = true;
      }
    }, 80);
  }

  _stopVadLoop() {
    if (this._levelTimer) {
      clearInterval(this._levelTimer);
      this._levelTimer = null;
    }
  }

  // ───────────── Recorder lifecycle ─────────────

  _startNewRecorder() {
    if (!this._stream) return;
    // Pick a mime supported by the current browser. iOS Safari only supports
    // audio/mp4 (AAC). Chrome/Firefox/Android prefer webm/opus. Gemini Flash
    // accepts both.
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/mp4;codecs=mp4a.40.2',
      'audio/aac'
    ];
    let mimeType = '';
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) {
        mimeType = c;
        break;
      }
    }
    console.log('[GAS] recorder mime →', mimeType || '(default)');

    this._chunks = [];
    const opts = mimeType ? { mimeType } : {};
    try {
      this._recorder = new MediaRecorder(this._stream, opts);
    } catch (e) {
      console.warn('[GAS] MediaRecorder create failed:', e?.message || e);
      this._recorder = new MediaRecorder(this._stream);
    }

    this._recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this._chunks.push(e.data);
    };
    this._recorder.onstop = () => {
      const blobs = this._chunks;
      this._chunks = [];
      const mt = this._recorder?.mimeType || 'audio/webm';
      // Spawn next recorder immediately so we don't miss the next utterance
      if (this._intentToRun) this._startNewRecorder();
      if (blobs.length === 0) return;
      const blob = new Blob(blobs, { type: mt });
      this._sendToGemini(blob, mt);
    };
    try {
      // Slice every 200ms so blobs arrive promptly
      this._recorder.start(200);
    } catch (e) {
      console.warn('[GAS] recorder.start failed:', e?.message || e);
    }
  }

  _commitChunk(reason) {
    if (!this._recorder || this._recorder.state === 'inactive') return;
    console.log('[GAS] committing chunk —', reason);
    try { this._recorder.stop(); } catch (_) {}
  }

  _restartRecorder(reason) {
    if (!this._recorder || this._recorder.state === 'inactive') return;
    console.log('[GAS] restart recorder —', reason);
    try { this._recorder.stop(); } catch (_) {}
  }

  // ───────────── Gemini upload ─────────────

  async _sendToGemini(blob, mimeType) {
    const id = ++this._chunkCounter;
    const sizeKb = Math.round(blob.size / 1024);
    console.log(`[GAS] chunk#${id} → Gemini  ${sizeKb} KB  ${mimeType}`);

    try {
      const audioBase64 = await this._blobToBase64(blob);
      const t0 = performance.now();
      const response = await chrome.runtime.sendMessage({
        type: 'gemini-audio-translate',
        apiKey: this.apiKey,
        audioBase64,
        mimeType,
        sourceLang: this.lang,
        targetLang: this.targetLang
      });
      const dt = Math.round(performance.now() - t0);
      console.log(`[GAS] chunk#${id} ← Gemini ${dt}ms`, response);

      if (!response?.success) {
        if (this.onError) this.onError(`Gemini audio: ${response?.error || 'neznámá chyba'}`);
        return;
      }
      const { original, translated, sourceLang } = response;
      if (!original) {
        console.log(`[GAS] chunk#${id} returned no transcript — silent / non-speech audio`);
        return;
      }
      this.onFinal?.(original, sourceLang || this.lang, translated || '');
    } catch (e) {
      console.warn('[GAS] sendMessage failed:', e?.message || e);
      this.onError?.('Gemini audio chyba: ' + (e?.message || e));
    }
  }

  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result || '';
        const base64 = String(dataUrl).split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
}

if (typeof window !== 'undefined') window.GeminiAudioSTT = GeminiAudioSTT;
