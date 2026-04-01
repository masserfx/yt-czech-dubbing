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

    // Azure TTS settings
    this._ttsEngine = 'browser'; // 'browser' or 'azure'
    this._azureKey = null;
    this._azureRegion = null;
    this._azureVoice = 'cs-CZ-VlastaNeural';
    this._currentAudio = null;

    this._initVoice();
    this._loadTTSSettings();
  }

  async _loadTTSSettings() {
    try {
      const result = await chrome.storage.local.get('popupSettings');
      if (result.popupSettings) {
        this._ttsEngine = result.popupSettings.ttsEngine || 'browser';
        this._azureKey = result.popupSettings.azureTtsKey || null;
        this._azureRegion = result.popupSettings.azureTtsRegion || 'westeurope';
        this._azureVoice = result.popupSettings.azureTtsVoice || 'cs-CZ-VlastaNeural';
      }
    } catch (e) {}
  }

  /**
   * Initialize and find the best Czech voice available.
   * Chrome loads Google online voices asynchronously.
   * macOS premium voices may be named with parenthetical qualifiers.
   */
  _initVoice() {
    const isPremiumVoice = (name) => {
      // macOS names premium voices various ways (Czech locale: "prémiový")
      return /premium|prémiov|enhanced|vylepšen|profi|hq|\(.*kvalit/i.test(name);
    };

    const findCzechVoice = () => {
      const voices = this.synth.getVoices();
      if (voices.length === 0) return;

      // Log ALL Czech/Slovak voices with full details
      const czechVoices = voices.filter(v => v.lang.startsWith('cs') || v.lang.startsWith('sk'));
      console.log(`[CzechDub TTS] Total voices: ${voices.length}, Czech/Slovak: ${czechVoices.length}`);
      czechVoices.forEach(v => {
        console.log(`[CzechDub TTS]   - "${v.name}" lang=${v.lang} local=${v.localService} default=${v.default}`);
      });

      // Priority: Zuzana Premium/Enhanced > any Premium Czech > Zuzana > Google Czech > any Czech > Slovak
      const best =
        voices.find(v => v.lang.startsWith('cs') && /zuzana/i.test(v.name) && isPremiumVoice(v.name)) ||
        voices.find(v => v.lang.startsWith('cs') && isPremiumVoice(v.name)) ||
        voices.find(v => v.lang.startsWith('cs') && /zuzana/i.test(v.name)) ||
        voices.find(v => v.lang === 'cs-CZ' && v.name.includes('Google')) ||
        voices.find(v => v.lang === 'cs-CZ') ||
        voices.find(v => v.lang.startsWith('cs')) ||
        voices.find(v => v.lang === 'sk-SK') ||
        voices.find(v => v.lang.startsWith('sk')) ||
        null;

      // Only upgrade voice — never downgrade from premium to standard
      if (best) {
        const bestIsPremium = isPremiumVoice(best.name);
        const currentIsPremium = this.czechVoice && isPremiumVoice(this.czechVoice.name);

        if (!this.czechVoice || bestIsPremium || !currentIsPremium) {
          this.czechVoice = best;
        }
        console.log(`[CzechDub TTS] Selected voice: "${this.czechVoice.name}" (${this.czechVoice.lang}), local=${this.czechVoice.localService}`);
        this.voiceReady = true;
      } else {
        console.warn('[CzechDub TTS] NO Czech voice found! TTS will use lang="cs-CZ" hint.');
        this.voiceReady = true;
      }
    };

    // Voices may load asynchronously - try immediately and on change
    const voices = this.synth.getVoices();
    if (voices.length > 0) {
      findCzechVoice();
    }
    // Re-run on voiceschanged — premium voices may arrive later
    this.synth.onvoiceschanged = () => {
      findCzechVoice();
    };

    // Force voice loading with multiple retries
    setTimeout(() => findCzechVoice(), 500);
    setTimeout(() => findCzechVoice(), 1500);
    setTimeout(() => findCzechVoice(), 3000);
  }

  /**
   * Wait until voices are loaded. Re-triggers voice selection to
   * ensure premium voices that load late are picked up.
   */
  async waitForVoice() {
    if (this.voiceReady && this.czechVoice) return;
    return new Promise(resolve => {
      const check = () => {
        if (this.voiceReady && this.czechVoice) {
          resolve();
          return;
        }
        const voices = this.synth.getVoices();
        if (voices.length > 0) {
          this._initVoice();
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
    if (!text || text.trim().length === 0) return Promise.resolve();

    // Use Azure TTS if configured
    if (this._ttsEngine === 'azure' && this._azureKey) {
      return this._speakAzure(text, options);
    }

    return this._speakBrowser(text, options);
  }

  _speakBrowser(text, options) {
    return new Promise((resolve, reject) => {
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

  async _speakAzure(text, options) {
    try {
      this.isSpeaking = true;
      if (this.onSpeakStart) this.onSpeakStart(text);

      const response = await chrome.runtime.sendMessage({
        type: 'synthesize-azure-tts',
        text,
        apiKey: this._azureKey,
        region: this._azureRegion,
        voice: this._azureVoice,
        rate: options.rate ?? this.rate,
        pitch: options.pitch ?? this.pitch
      });

      if (!response?.success) {
        console.warn('[CzechDub TTS] Azure error:', response?.error);
        // Fallback to browser TTS
        return this._speakBrowser(text, options);
      }

      // Play base64 audio
      const audio = new Audio(`data:audio/mp3;base64,${response.audioBase64}`);
      audio.volume = options.volume ?? this.volume;
      this._currentAudio = audio;

      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = () => {
          console.warn('[CzechDub TTS] Azure audio playback error');
          resolve();
        };
        audio.play().catch(() => resolve());
      });
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return;
      console.warn('[CzechDub TTS] Azure TTS failed, falling back to browser:', e);
      return this._speakBrowser(text, options);
    } finally {
      this.isSpeaking = false;
      this._currentAudio = null;
      if (this.onSpeakEnd) this.onSpeakEnd(text);
    }
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
    if (this._currentAudio) {
      this._currentAudio.pause();
      this._currentAudio = null;
    }
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
