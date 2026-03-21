/**
 * TTSEngine - Text-to-Speech engine for Czech dubbing.
 * Uses the Web Speech API (SpeechSynthesis) built into Chrome.
 * Actively searches for Czech voices including Google online voices.
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
    this.voiceReady = false;
    this._initVoice();
  }

  /**
   * Initialize and find the best Czech voice available.
   * Chrome loads Google online voices asynchronously.
   */
  _initVoice() {
    const findCzechVoice = () => {
      const voices = this.synth.getVoices();
      if (voices.length === 0) return;

      // Log all available voices for debugging
      const czechVoices = voices.filter(v => v.lang.startsWith('cs') || v.lang.startsWith('sk'));
      console.log(`[CzechDub TTS] Total voices: ${voices.length}, Czech/Slovak: ${czechVoices.length}`);
      if (czechVoices.length > 0) {
        console.log('[CzechDub TTS] Available Czech voices:', czechVoices.map(v => `${v.name} (${v.lang})`).join(', '));
      }

      // Priority: Zuzana Premium/Enhanced > Zuzana > Google Czech > any Czech > Slovak
      this.czechVoice =
        voices.find(v => v.lang.startsWith('cs') && /zuzana/i.test(v.name) && /premium|enhanced|profi|hq/i.test(v.name)) ||
        voices.find(v => v.lang.startsWith('cs') && /zuzana/i.test(v.name)) ||
        voices.find(v => v.lang === 'cs-CZ' && /premium|enhanced|hq/i.test(v.name)) ||
        voices.find(v => v.lang === 'cs-CZ' && v.name.includes('Google')) ||
        voices.find(v => v.lang === 'cs-CZ') ||
        voices.find(v => v.lang.startsWith('cs')) ||
        voices.find(v => v.lang === 'sk-SK') ||
        voices.find(v => v.lang.startsWith('sk')) ||
        null;

      if (this.czechVoice) {
        console.log(`[CzechDub TTS] Selected voice: ${this.czechVoice.name} (${this.czechVoice.lang}), local=${this.czechVoice.localService}`);
        this.voiceReady = true;
      } else {
        console.warn('[CzechDub TTS] NO Czech voice found! TTS will use lang="cs-CZ" hint.');
        console.warn('[CzechDub TTS] Available voices:', voices.map(v => `${v.name} (${v.lang})`).join(', '));
        // Still mark as ready - we'll use lang hint
        this.voiceReady = true;
      }
    };

    // Voices may load asynchronously - try immediately and on change
    const voices = this.synth.getVoices();
    if (voices.length > 0) {
      findCzechVoice();
    }
    this.synth.onvoiceschanged = () => {
      findCzechVoice();
    };

    // Force voice loading by requesting voices multiple times
    setTimeout(() => {
      if (!this.voiceReady) findCzechVoice();
    }, 500);
    setTimeout(() => {
      if (!this.voiceReady) findCzechVoice();
    }, 2000);
  }

  /**
   * Wait until voices are loaded.
   */
  async waitForVoice() {
    if (this.voiceReady) return;
    return new Promise(resolve => {
      const check = () => {
        if (this.voiceReady) {
          resolve();
          return;
        }
        const voices = this.synth.getVoices();
        if (voices.length > 0) {
          this.voiceReady = true;
          resolve();
          return;
        }
        setTimeout(check, 200);
      };
      check();
      // Max wait 3 seconds
      setTimeout(() => {
        this.voiceReady = true;
        resolve();
      }, 3000);
    });
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
   * Check if Czech voice is available and return info.
   */
  getVoiceInfo() {
    if (this.czechVoice) {
      return {
        available: true,
        name: this.czechVoice.name,
        lang: this.czechVoice.lang,
        isCzech: this.czechVoice.lang.startsWith('cs')
      };
    }
    return {
      available: false,
      name: null,
      lang: 'cs-CZ',
      isCzech: false
    };
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

      // Always set Czech language
      utterance.lang = 'cs-CZ';

      if (this.czechVoice) {
        utterance.voice = this.czechVoice;
        utterance.lang = this.czechVoice.lang;
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
          resolve();
        } else {
          console.warn('[CzechDub TTS] Error:', event.error);
          resolve();
        }
      };

      this.currentUtterance = utterance;

      // Chrome bug workaround: synthesis stops after ~15s
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

  pause() {
    this.synth.pause();
  }

  resume() {
    this.synth.resume();
  }

  setVolume(vol) { this.volume = Math.max(0, Math.min(1, vol)); }
  setRate(rate) { this.rate = Math.max(0.5, Math.min(2, rate)); }
  setPitch(pitch) { this.pitch = Math.max(0.5, Math.min(2, pitch)); }

  isCzechSupported() {
    const voices = this.synth.getVoices();
    return voices.some(v => v.lang.startsWith('cs') || v.lang.startsWith('sk'));
  }

  /**
   * Estimate speech duration at current rate.
   * ~150 words per minute for Czech.
   */
  estimateDuration(text) {
    const words = text.split(/\s+/).length;
    const wpm = 150 * this.rate;
    return (words / wpm) * 60;
  }
}

window.TTSEngine = TTSEngine;
