/**
 * OpenAIRealtimeSTT
 *
 * STT engine backed by OpenAI Realtime transcription sessions
 * (`gpt-realtime-whisper`). It mirrors the small callback contract used by
 * STTEngine so LiveTranslate can switch between Web Speech, Gemini audio, and
 * OpenAI realtime transcription.
 */
class OpenAIRealtimeSTT {
  constructor(openaiClient = null) {
    this._openaiClient = openaiClient || (typeof OpenAIRealtimeClient !== 'undefined' ? new OpenAIRealtimeClient() : null);
    this.lang = 'en-US';
    this.deviceId = null;
    this.isRunning = false;

    this._pc = null;
    this._events = null;
    this._stream = null;
    this._audioCtx = null;
    this._analyser = null;
    this._levelTimer = null;
    this._transcripts = new Map();

    this.onInterim = null;
    this.onFinal = null;
    this.onError = null;
    this.onStateChange = null;
    this.onLevel = null;
  }

  static isSupported() {
    return !!(typeof window !== 'undefined' &&
      window.RTCPeerConnection &&
      navigator.mediaDevices?.getUserMedia);
  }

  setLang(code) {
    this.lang = code || this.lang;
  }

  setDeviceId(id) {
    this.deviceId = id || null;
  }

  async start() {
    if (!OpenAIRealtimeSTT.isSupported()) {
      this.onError?.('OpenAI Realtime STT není v tomto prohlížeči podporované');
      return false;
    }
    if (this.isRunning) return true;
    if (!this._openaiClient) {
      this.onError?.('OpenAI Realtime klient není dostupný');
      return false;
    }

    await this._openaiClient.loadConfig?.();
    if (!this._openaiClient.isEnabled?.()) {
      this.onError?.('Pro OpenAI Realtime Whisper nastavte OpenAI API klíč v hlavním nastavení');
      return false;
    }

    const session = await this._openaiClient.createRealtimeTranscriptionClientSecret(this.lang);
    if (!session?.value) {
      const detail = this._openaiClient.lastError?.();
      this.onError?.(detail
        ? 'OpenAI Realtime Whisper secret není dostupný: ' + detail
        : 'OpenAI Realtime Whisper secret není dostupný');
      return false;
    }

    try {
      const constraints = this.deviceId
        ? { audio: { deviceId: { exact: this.deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
        : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
      this._stream = await navigator.mediaDevices.getUserMedia(constraints);
      this._startLevelMeter(this._stream);

      const pc = new RTCPeerConnection();
      this._pc = pc;
      this._stream.getAudioTracks().forEach((track) => pc.addTrack(track, this._stream));

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          this.onError?.(`OpenAI Realtime STT connection ${pc.connectionState}`);
        }
      };

      const events = pc.createDataChannel('oai-events');
      this._events = events;
      events.onopen = () => {
        this.isRunning = true;
        this.onStateChange?.('listening');
      };
      events.onmessage = ({ data }) => this._handleEvent(data);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.value}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });

      if (!response.ok) {
        throw new Error(`OpenAI realtime STT call failed: ${(await response.text()).slice(0, 300)}`);
      }

      await pc.setRemoteDescription({
        type: 'answer',
        sdp: await response.text(),
      });

      this.isRunning = true;
      this.onStateChange?.('listening');
      return true;
    } catch (e) {
      this.stop();
      this.onError?.('OpenAI Realtime Whisper chyba: ' + (e?.message || e));
      return false;
    }
  }

  stop() {
    if (this._events) {
      try { this._events.close(); } catch (_) {}
      this._events = null;
    }
    if (this._pc) {
      try { this._pc.close(); } catch (_) {}
      this._pc = null;
    }
    if (this._stream) {
      for (const track of this._stream.getTracks()) {
        try { track.stop(); } catch (_) {}
      }
      this._stream = null;
    }
    this._stopLevelMeter();
    this._transcripts.clear();
    this.isRunning = false;
    this.onLevel?.(0);
    this.onStateChange?.('idle');
  }

  _handleEvent(data) {
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }

    if (event.type === 'conversation.item.input_audio_transcription.delta') {
      const key = event.item_id || 'current';
      const next = (this._transcripts.get(key) || '') + (event.delta || '');
      this._transcripts.set(key, next);
      if (next.trim()) this.onInterim?.(next.trim());
      return;
    }

    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      const key = event.item_id || 'current';
      const transcript = (event.transcript || this._transcripts.get(key) || '').trim();
      this._transcripts.delete(key);
      this.onInterim?.('');
      if (transcript) this.onFinal?.(transcript, this.lang);
      return;
    }

    if (event.type === 'input_audio_buffer.speech_started') {
      this.onStateChange?.('listening');
      return;
    }

    if (event.type === 'error') {
      this.onError?.(event.error?.message || 'OpenAI Realtime STT error');
    }
  }

  _startLevelMeter(stream) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this._audioCtx = new Ctx();
      const source = this._audioCtx.createMediaStreamSource(stream);
      this._analyser = this._audioCtx.createAnalyser();
      this._analyser.fftSize = 1024;
      source.connect(this._analyser);
      const data = new Uint8Array(this._analyser.fftSize);
      this._levelTimer = setInterval(() => {
        this._analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) {
          const centered = (v - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / data.length);
        this.onLevel?.(Math.min(1, rms * 3));
      }, 80);
    } catch (_) {
      this._stopLevelMeter();
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
    this._analyser = null;
  }
}

if (typeof window !== 'undefined') window.OpenAIRealtimeSTT = OpenAIRealtimeSTT;
if (typeof globalThis !== 'undefined' && typeof module === 'undefined') {
  globalThis.OpenAIRealtimeSTT = OpenAIRealtimeSTT;
}
