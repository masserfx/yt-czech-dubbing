/**
 * TTSEngine - Text-to-Speech engine for Czech dubbing.
 * Uses the Web Speech API (SpeechSynthesis) which is free and built into Chrome.
 */
class TTSEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.czechVoice = null;
    this.queue = [];
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.volume = 0.9;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.onSpeakStart = null;
    this.onSpeakEnd = null;
    this._initVoice();
  }

  /**
   * Initialize and find the best Czech voice available.
   */
  _initVoice() {
    const findCzechVoice = () => {
      const voices = this.synth.getVoices();
      // Prefer Czech voices
      this.czechVoice = voices.find(v => v.lang === 'cs-CZ') ||
                        voices.find(v => v.lang.startsWith('cs')) ||
                        voices.find(v => v.lang === 'sk-SK') || // Slovak as fallback
                        voices.find(v => v.lang.startsWith('sk'));

      if (this.czechVoice) {
        console.log(`[CzechDub] Using voice: ${this.czechVoice.name} (${this.czechVoice.lang})`);
      } else {
        console.warn('[CzechDub] No Czech voice found. Available voices:', voices.map(v => `${v.name} (${v.lang})`));
      }
    };

    // Voices may load asynchronously
    if (this.synth.getVoices().length > 0) {
      findCzechVoice();
    }
    this.synth.onvoiceschanged = findCzechVoice;
  }

  /**
   * Get list of available Czech/Slovak voices.
   */
  getAvailableVoices() {
    return this.synth.getVoices().filter(v =>
      v.lang.startsWith('cs') || v.lang.startsWith('sk')
    );
  }

  /**
   * Set the voice to use by name.
   */
  setVoice(voiceName) {
    const voices = this.synth.getVoices();
    const voice = voices.find(v => v.name === voiceName);
    if (voice) {
      this.czechVoice = voice;
    }
  }

  /**
   * Speak a single text string.
   * Returns a promise that resolves when speaking is complete.
   */
  speak(text, options = {}) {
    return new Promise((resolve, reject) => {
      if (!text || text.trim().length === 0) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);

      if (this.czechVoice) {
        utterance.voice = this.czechVoice;
        utterance.lang = this.czechVoice.lang;
      } else {
        utterance.lang = 'cs-CZ';
      }

      utterance.volume = options.volume ?? this.volume;
      utterance.rate = options.rate ?? this.rate;
      utterance.pitch = options.pitch ?? this.pitch;

      utterance.onstart = () => {
        this.isSpeaking = true;
        if (this.onSpeakStart) this.onSpeakStart(text);
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        if (this.onSpeakEnd) this.onSpeakEnd(text);
        resolve();
      };

      utterance.onerror = (event) => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        if (event.error === 'canceled' || event.error === 'interrupted') {
          resolve(); // Not a real error
        } else {
          console.warn('[CzechDub] TTS error:', event.error);
          resolve(); // Don't reject, just skip
        }
      };

      this.currentUtterance = utterance;

      // Chrome has a bug where synthesis stops after ~15s
      // Workaround: keep the synthesis alive
      this._keepAlive();

      this.synth.speak(utterance);
    });
  }

  /**
   * Workaround for Chrome's SpeechSynthesis bug where it stops after ~15s.
   */
  _keepAlive() {
    if (this._keepAliveInterval) return;
    this._keepAliveInterval = setInterval(() => {
      if (this.synth.speaking) {
        this.synth.pause();
        this.synth.resume();
      } else {
        clearInterval(this._keepAliveInterval);
        this._keepAliveInterval = null;
      }
    }, 10000);
  }

  /**
   * Schedule a caption to be spoken at a specific time.
   */
  scheduleCaption(caption, getCurrentTime) {
    this.queue.push({
      caption,
      spoken: false
    });
  }

  /**
   * Stop all speech immediately.
   */
  stop() {
    this.synth.cancel();
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.queue = [];
    if (this._keepAliveInterval) {
      clearInterval(this._keepAliveInterval);
      this._keepAliveInterval = null;
    }
  }

  /**
   * Pause speech.
   */
  pause() {
    this.synth.pause();
  }

  /**
   * Resume speech.
   */
  resume() {
    this.synth.resume();
  }

  /**
   * Set playback parameters.
   */
  setVolume(vol) { this.volume = Math.max(0, Math.min(1, vol)); }
  setRate(rate) { this.rate = Math.max(0.5, Math.min(2, rate)); }
  setPitch(pitch) { this.pitch = Math.max(0.5, Math.min(2, pitch)); }

  /**
   * Check if the browser supports Czech TTS.
   */
  isCzechSupported() {
    const voices = this.synth.getVoices();
    return voices.some(v => v.lang.startsWith('cs') || v.lang.startsWith('sk'));
  }

  /**
   * Estimate the duration of speaking a text at the current rate.
   * Rough estimate: ~150 words per minute for Czech.
   */
  estimateDuration(text) {
    const words = text.split(/\s+/).length;
    const wpm = 150 * this.rate;
    return (words / wpm) * 60;
  }
}

window.TTSEngine = TTSEngine;
