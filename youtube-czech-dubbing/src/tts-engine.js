/**
 * TTSEngine - Text-to-Speech engine for YouTube dubbing.
 * Uses Web Speech API (SpeechSynthesis) built into Chrome.
 * Supports multiple languages with automatic voice selection.
 */
class TTSEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.selectedVoice = null;
    this.queue = [];
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.volume = 0.9;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.onSpeakStart = null;
    this.onSpeakEnd = null;
    this.voiceReady = false;

    // Language config
    this._targetLang = DEFAULT_LANGUAGE;
    this._langConfig = getLanguageConfig(DEFAULT_LANGUAGE);

    // Azure/Edge TTS settings
    this._ttsEngine = 'browser'; // 'browser', 'azure', or 'edge'
    this._azureKey = null;
    this._azureRegion = null;
    this._azureVoice = 'cs-CZ-VlastaNeural';
    this._edgeVoice = 'cs-CZ-AntoninNeural';
    this._currentAudio = null;

    // Service mode
    this._serviceClient = null;

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
        this._azureVoice = result.popupSettings.azureTtsVoice || this._langConfig.azureVoices[0]?.id || 'cs-CZ-VlastaNeural';
        this._edgeVoice = result.popupSettings.edgeTtsVoice || this._langConfig.azureVoices[0]?.id || 'cs-CZ-AntoninNeural';
        if (result.popupSettings.targetLanguage) {
          this._targetLang = result.popupSettings.targetLanguage;
          this._langConfig = getLanguageConfig(this._targetLang);
        }
      }
    } catch (e) {}
  }

  /**
   * Set target language and re-select voice.
   */
  setTargetLanguage(langCode) {
    this._targetLang = langCode;
    this._langConfig = getLanguageConfig(langCode);
    this.selectedVoice = null;
    this.voiceReady = false;
    this._azureVoice = this._langConfig.azureVoices[0]?.id || this._azureVoice;
    this._edgeVoice = this._langConfig.azureVoices[0]?.id || this._edgeVoice;
    this._initVoice();
  }

  /**
   * Initialize and find the best voice for the configured language.
   */
  _initVoice() {
    const isPremiumVoice = (name) => {
      return /premium|prémiov|enhanced|vylepšen|profi|hq|\(.*kvalit/i.test(name);
    };

    const findBestVoice = () => {
      const voices = this.synth.getVoices();
      if (voices.length === 0) return;

      const langConfig = this._langConfig;
      const fallbackLangs = langConfig.voiceFallbackLangs;
      const priorityPatterns = langConfig.voicePriority;

      // Filter voices matching any of the fallback language prefixes
      const matchingVoices = voices.filter(v =>
        fallbackLangs.some(lang => v.lang === lang || v.lang.startsWith(lang.split('-')[0]))
      );

      console.log(`[Dub TTS] Total voices: ${voices.length}, ${langConfig.name} matching: ${matchingVoices.length}`);
      matchingVoices.forEach(v => {
        console.log(`[Dub TTS]   - "${v.name}" lang=${v.lang} local=${v.localService}`);
      });

      // Try priority patterns first (premium, specific names)
      let best = null;
      for (const pattern of priorityPatterns) {
        best = matchingVoices.find(v => pattern.test(v.name) && isPremiumVoice(v.name));
        if (best) break;
      }
      if (!best) {
        for (const pattern of priorityPatterns) {
          best = matchingVoices.find(v => pattern.test(v.name));
          if (best) break;
        }
      }
      // Fallback: any voice for primary language
      if (!best) best = matchingVoices.find(v => v.lang === langConfig.bcp47);
      if (!best) best = matchingVoices.find(v => v.lang.startsWith(langConfig.code));
      // Last resort: any matching voice
      if (!best && matchingVoices.length > 0) best = matchingVoices[0];

      if (best) {
        const bestIsPremium = isPremiumVoice(best.name);
        const currentIsPremium = this.selectedVoice && isPremiumVoice(this.selectedVoice.name);
        if (!this.selectedVoice || bestIsPremium || !currentIsPremium) {
          this.selectedVoice = best;
        }
        console.log(`[Dub TTS] Selected: "${this.selectedVoice.name}" (${this.selectedVoice.lang})`);
        this.voiceReady = true;
      } else {
        console.warn(`[Dub TTS] No voice found for ${langConfig.name}! Using lang="${langConfig.bcp47}" hint.`);
        this.voiceReady = true;
      }
    };

    const voices = this.synth.getVoices();
    if (voices.length > 0) findBestVoice();
    this.synth.onvoiceschanged = () => findBestVoice();
    setTimeout(() => findBestVoice(), 500);
    setTimeout(() => findBestVoice(), 1500);
    setTimeout(() => findBestVoice(), 3000);
  }

  async waitForVoice() {
    if (this.voiceReady && this.selectedVoice) return;
    return new Promise(resolve => {
      const check = () => {
        if (this.voiceReady && this.selectedVoice) { resolve(); return; }
        const voices = this.synth.getVoices();
        if (voices.length > 0) { this._initVoice(); resolve(); return; }
        setTimeout(check, 200);
      };
      check();
      setTimeout(() => { this.voiceReady = true; resolve(); }, 3000);
    });
  }

  /**
   * Get list of available voices for the configured language.
   */
  getAvailableVoices() {
    const fallbackLangs = this._langConfig.voiceFallbackLangs;
    return this.synth.getVoices().filter(v =>
      fallbackLangs.some(lang => v.lang === lang || v.lang.startsWith(lang.split('-')[0]))
    );
  }

  setVoice(voiceName) {
    const voices = this.synth.getVoices();
    const voice = voices.find(v => v.name === voiceName);
    if (voice) this.selectedVoice = voice;
  }

  getVoiceInfo() {
    if (this.selectedVoice) {
      return {
        available: true,
        name: this.selectedVoice.name,
        lang: this.selectedVoice.lang,
        isTargetLang: this.selectedVoice.lang.startsWith(this._targetLang)
      };
    }
    return {
      available: false,
      name: null,
      lang: this._langConfig.bcp47,
      isTargetLang: false
    };
  }

  // Back-compat alias
  get czechVoice() { return this.selectedVoice; }

  speak(text, options = {}) {
    if (!text || text.trim().length === 0) return Promise.resolve();

    // Service mode: use centralized TTS API
    if (this._serviceClient?.isServiceMode()) {
      return this._speakService(text, options);
    }

    if (this._ttsEngine === 'azure' && this._azureKey) {
      return this._speakAzure(text, options);
    }
    if (this._ttsEngine === 'edge') {
      return this._speakEdge(text, options);
    }
    return this._speakBrowser(text, options);
  }

  async _speakService(text, options) {
    try {
      this.isSpeaking = true;
      if (this.onSpeakStart) this.onSpeakStart(text);

      const audioBase64 = await this._serviceClient.synthesize(text, this._targetLang, this._azureVoice);
      if (audioBase64) {
        await this._playBase64Audio(audioBase64, options);
        return;
      }
      // Fallback to browser TTS
      return this._speakBrowser(text, options);
    } catch (e) {
      console.warn('[Dub TTS] Service TTS failed, falling back:', e);
      return this._speakBrowser(text, options);
    } finally {
      this.isSpeaking = false;
      this._currentAudio = null;
      if (this.onSpeakEnd) this.onSpeakEnd(text);
    }
  }

  _speakBrowser(text, options) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this._langConfig.bcp47;

      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
        utterance.lang = this.selectedVoice.lang;
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
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          console.warn('[Dub TTS] Error:', event.error);
        }
        resolve();
      };

      this.currentUtterance = utterance;
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
        lang: this._langConfig.bcp47,
        rate: options.rate ?? this.rate,
        pitch: options.pitch ?? this.pitch
      });

      if (!response?.success) {
        console.warn('[Dub TTS] Azure error:', response?.error);
        return this._speakBrowser(text, options);
      }

      await this._playBase64Audio(response.audioBase64, options);
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return;
      console.warn('[Dub TTS] Azure TTS failed, falling back to browser:', e);
      return this._speakBrowser(text, options);
    } finally {
      this.isSpeaking = false;
      this._currentAudio = null;
      if (this.onSpeakEnd) this.onSpeakEnd(text);
    }
  }

  async _speakEdge(text, options) {
    try {
      this.isSpeaking = true;
      if (this.onSpeakStart) this.onSpeakStart(text);

      const response = await chrome.runtime.sendMessage({
        type: 'synthesize-edge-tts',
        text,
        voice: this._edgeVoice,
        rate: options.rate ?? this.rate,
        pitch: options.pitch ?? this.pitch
      });

      if (!response?.success) {
        console.warn('[Dub TTS] Edge TTS error:', response?.error);
        return this._speakBrowser(text, options);
      }

      await this._playBase64Audio(response.audioBase64, options);
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return;
      console.warn('[Dub TTS] Edge TTS failed, falling back to browser:', e);
      return this._speakBrowser(text, options);
    } finally {
      this.isSpeaking = false;
      this._currentAudio = null;
      if (this.onSpeakEnd) this.onSpeakEnd(text);
    }
  }

  async _playBase64Audio(audioBase64, options) {
    const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
    audio.volume = options.volume ?? this.volume;
    this._currentAudio = audio;

    await new Promise((resolve) => {
      audio.onended = resolve;
      audio.onerror = () => { console.warn('[Dub TTS] Audio playback error'); resolve(); };
      audio.play().catch(() => resolve());
    });
  }

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

  stop() {
    this.synth.cancel();
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.queue = [];
    if (this._currentAudio) { this._currentAudio.pause(); this._currentAudio = null; }
    if (this._keepAliveInterval) { clearInterval(this._keepAliveInterval); this._keepAliveInterval = null; }
  }

  pause() { this.synth.pause(); }
  resume() { this.synth.resume(); }

  setVolume(vol) { this.volume = Math.max(0, Math.min(1, vol)); }
  setRate(rate) { this.rate = Math.max(0.5, Math.min(2, rate)); }
  setPitch(pitch) { this.pitch = Math.max(0.5, Math.min(2, pitch)); }

  isTargetLanguageSupported() {
    const fallbackLangs = this._langConfig.voiceFallbackLangs;
    return this.synth.getVoices().some(v =>
      fallbackLangs.some(lang => v.lang === lang || v.lang.startsWith(lang.split('-')[0]))
    );
  }

  estimateDuration(text) {
    const words = text.split(/\s+/).length;
    const wpm = (this._langConfig.wordsPerMinute || 140) * this.rate;
    return (words / wpm) * 60;
  }
}

window.TTSEngine = TTSEngine;
