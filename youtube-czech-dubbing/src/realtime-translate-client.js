/**
 * OpenAI Realtime translation client for live audio-to-audio dubbing.
 *
 * This runs when direct OpenAI Realtime mode is enabled. It requests a
 * short-lived client secret through the extension background worker, then
 * connects directly to OpenAI's WebRTC translation endpoint.
 */
class RealtimeTranslateClient {
  constructor(openaiClient = null) {
    this._openaiClient = openaiClient || (typeof OpenAIRealtimeClient !== 'undefined' ? new OpenAIRealtimeClient() : null);
    this._pc = null;
    this._events = null;
    this._audioEl = null;
    this._sourceStream = null;
    this._remoteStream = null;
    this._translatedTranscript = '';
    this._sourceTranscript = '';
    this._translatedParts = new Map();
    this._sourceParts = new Map();
    this._completedTranslatedParts = new Set();
    this._volume = 0.95;
    this._muted = false;
  }

  isSupported(videoElement) {
    return !!(videoElement && (videoElement.captureStream || videoElement.mozCaptureStream) && window.RTCPeerConnection);
  }

  isActive() {
    return !!this._pc;
  }

  setVolume(volume) {
    this._volume = Number.isFinite(volume) ? volume : this._volume;
    if (this._audioEl) this._audioEl.volume = this._volume;
  }

  setMuted(muted) {
    this._muted = !!muted;
    if (this._audioEl) this._audioEl.muted = this._muted;
  }

  async start(videoElement, targetLanguage, callbacks = {}) {
    const { onTranslatedText, onSourceText, onStatus } = callbacks;

    await this._openaiClient?.loadConfig?.();
    if (!this._openaiClient?.isRealtimePreferred?.()) {
      throw new Error('Realtime translation not enabled');
    }
    if (!this.isSupported(videoElement)) {
      throw new Error('captureStream or RTCPeerConnection not supported');
    }

    const session = await this._openaiClient.createRealtimeClientSecret(targetLanguage);
    if (!session?.value) {
      throw new Error('Realtime client secret unavailable');
    }

    const stream = typeof videoElement.captureStream === 'function'
      ? videoElement.captureStream()
      : videoElement.mozCaptureStream();
    const audioTracks = stream?.getAudioTracks?.() || [];
    if (audioTracks.length === 0) {
      throw new Error('Video stream has no audio track');
    }

    const pc = new RTCPeerConnection();
    this._pc = pc;
    this._sourceStream = stream;
    this._translatedTranscript = '';
    this._sourceTranscript = '';

    const translatedAudio = new Audio();
    translatedAudio.autoplay = true;
    translatedAudio.playsInline = true;
    translatedAudio.volume = this._volume;
    translatedAudio.muted = this._muted;
    this._audioEl = translatedAudio;

    pc.ontrack = ({ streams }) => {
      if (!streams?.[0]) return;
      this._remoteStream = streams[0];
      translatedAudio.srcObject = streams[0];
    };

    audioTracks.forEach((track) => pc.addTrack(track, stream));

    const events = pc.createDataChannel('oai-events');
    this._events = events;
    events.onopen = () => onStatus?.('connected');
    events.onmessage = ({ data }) => {
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }

      if (this._handleTranslatedTranscriptEvent(event, onTranslatedText)) {
        return;
      }

      if (this._handleSourceTranscriptEvent(event, onSourceText)) {
        return;
      }

      if (event.type === 'error') {
        onStatus?.('error', event.error?.message || 'Realtime translation error');
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const response = await fetch('https://api.openai.com/v1/realtime/translations/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.value}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    });

    if (!response.ok) {
      throw new Error(`OpenAI realtime call failed: ${(await response.text()).slice(0, 300)}`);
    }

    await pc.setRemoteDescription({
      type: 'answer',
      sdp: await response.text(),
    });

    onStatus?.('ready');
    return {
      expiresAt: session.expires_at || null,
      model: session.model || 'gpt-realtime-translate',
    };
  }

  stop() {
    if (this._events) {
      try { this._events.close(); } catch (e) {}
      this._events = null;
    }

    if (this._pc) {
      try { this._pc.close(); } catch (e) {}
      this._pc = null;
    }

    if (this._audioEl) {
      try { this._audioEl.pause(); } catch (e) {}
      this._audioEl.srcObject = null;
      this._audioEl = null;
    }

    if (this._sourceStream) {
      for (const track of this._sourceStream.getTracks()) {
        try { track.stop(); } catch (e) {}
      }
      this._sourceStream = null;
    }

    this._remoteStream = null;
    this._translatedTranscript = '';
    this._sourceTranscript = '';
    this._translatedParts.clear();
    this._sourceParts.clear();
    this._completedTranslatedParts.clear();
  }

  _eventPartKey(event, kind) {
    return [
      kind,
      event.response_id || '',
      event.item_id || '',
      event.output_index ?? '',
      event.content_index ?? '',
    ].join(':');
  }

  _deltaText(event) {
    if (typeof event.delta === 'string') return event.delta;
    if (typeof event.delta?.transcript === 'string') return event.delta.transcript;
    if (typeof event.text === 'string') return event.text;
    if (typeof event.transcript === 'string') return event.transcript;
    return '';
  }

  _handleTranslatedTranscriptEvent(event, onTranslatedText) {
    const type = event?.type;
    const isOutputDelta =
      type === 'response.output_audio_transcript.delta' ||
      type === 'response.output_text.delta' ||
      type === 'session.output_transcript.delta';
    const isOutputDone =
      type === 'response.output_audio_transcript.done' ||
      type === 'response.output_text.done' ||
      type === 'session.output_transcript.completed';

    if (isOutputDelta) {
      const delta = this._deltaText(event);
      if (!delta) return true;
      const key = this._eventPartKey(event, 'out');
      this._completedTranslatedParts.delete(key);
      const next = (this._translatedParts.get(key) || '') + delta;
      this._translatedParts.set(key, next);
      this._translatedTranscript = next;
      onTranslatedText?.(next, event);
      return true;
    }

    if (isOutputDone) {
      const key = this._eventPartKey(event, 'out');
      const transcript = (
        event.transcript ||
        event.text ||
        this._translatedParts.get(key) ||
        this._translatedTranscript ||
        ''
      ).trim();
      this._translatedParts.delete(key);
      this._completedTranslatedParts.add(key);
      this._translatedTranscript = '';
      if (transcript) {
        onTranslatedText?.(transcript, { ...event, final: true });
      }
      return true;
    }

    if (type === 'response.content_part.done' && event.part?.type === 'audio' && event.part?.transcript) {
      const key = this._eventPartKey(event, 'out');
      if (this._completedTranslatedParts.has(key)) return true;
      this._completedTranslatedParts.add(key);
      onTranslatedText?.(event.part.transcript, { ...event, final: true });
      return true;
    }

    return false;
  }

  _handleSourceTranscriptEvent(event, onSourceText) {
    const type = event?.type;
    const isInputDelta =
      type === 'conversation.item.input_audio_transcription.delta' ||
      type === 'session.input_transcript.delta';
    const isInputDone =
      type === 'conversation.item.input_audio_transcription.completed' ||
      type === 'session.input_transcript.completed';

    if (isInputDelta) {
      const delta = this._deltaText(event);
      if (!delta) return true;
      const key = this._eventPartKey(event, 'in');
      const next = (this._sourceParts.get(key) || '') + delta;
      this._sourceParts.set(key, next);
      this._sourceTranscript = next;
      onSourceText?.(next, event);
      return true;
    }

    if (isInputDone) {
      const key = this._eventPartKey(event, 'in');
      const transcript = (
        event.transcript ||
        this._sourceParts.get(key) ||
        this._sourceTranscript ||
        ''
      ).trim();
      this._sourceParts.delete(key);
      this._sourceTranscript = '';
      if (transcript) {
        onSourceText?.(transcript, { ...event, final: true });
      }
      return true;
    }

    return false;
  }
}

if (typeof window !== 'undefined') {
  window.RealtimeTranslateClient = RealtimeTranslateClient;
}
if (typeof globalThis !== 'undefined' && typeof module === 'undefined') {
  globalThis.RealtimeTranslateClient = RealtimeTranslateClient;
}
