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

    // Azure TTS settings
    this._ttsEngine = 'browser'; // 'browser' or 'azure'
    this._azureKey = null;
    this._azureRegion = null;
    this._azureVoice = 'cs-CZ-VlastaNeural';
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

  /**
   * Detect English segments in translated text.
   * Returns array of {text, lang} where lang is 'en' or target language code.
   * English detection: proper nouns, brand names, quoted phrases, known EN words.
   */
  _detectLanguageSegments(text) {
    const targetLang = this._targetLang;
    const segments = [];

    // Pattern: English segments are typically:
    // 1. Quoted strings ("Be Internet Awesome")
    // 2. Capitalized multi-word names (Google Pixel, Gemini Nano)
    // 3. Known English terms that often stay untranslated
    // 4. Words that are clearly not in target language (no diacritics, Latin-only patterns)

    // Split text preserving the separators
    // Regex matches: quoted strings, capitalized sequences (2+ words), or remaining text
    const parts = text.split(
      /(\"[^\"]+\"|„[^"]+"|\"[^\"]+\"|\u201E[^\u201C]+\u201C|(?:[A-Z][a-zA-Z'-]*(?:\s+(?:of|the|for|and|in|on|by|with|to|a|an|is|are|be|at|or|&)\s+|\s+)[A-Z][a-zA-Z'-]*(?:(?:\s+(?:of|the|for|and|in|on|by|with|to|a|an|is|are|be|at|or|&)\s+|\s+)[A-Za-z'-]+)*))/g
    );

    for (const part of parts) {
      if (!part) continue;

      // Check if this part is likely English
      const isEnglish = this._isLikelyEnglish(part, targetLang);

      if (segments.length > 0 && segments[segments.length - 1].lang === (isEnglish ? 'en' : targetLang)) {
        // Merge with previous segment of same language
        segments[segments.length - 1].text += part;
      } else {
        segments.push({ text: part, lang: isEnglish ? 'en' : targetLang });
      }
    }

    return segments;
  }

  /**
   * Heuristic: is this text fragment likely English?
   */
  _isLikelyEnglish(text, targetLang) {
    const trimmed = text.trim();
    if (trimmed.length < 2) return false;

    // Quoted strings are likely English (names, titles)
    if (/^[\"„"\u201E].*[\""\u201C\"]$/.test(trimmed)) return true;

    // Capitalized multi-word phrase (2+ words starting with caps) = likely brand/name
    if (/^[A-Z][a-zA-Z'-]+(\s+[A-Za-z'-]+){1,}$/.test(trimmed) && !/[ěščřžýáíéúůďťňľôĺŕąćęłńóśźżöőüű]/.test(trimmed)) {
      return true;
    }

    // Known English tech/brand terms that stay untranslated
    const enTerms = /\b(Highlights?|Overview|Features?|Updates?|Settings?|Download|Upload|Streaming|Podcast|Newsletter|Blog|Online|Offline|Smart|Share|Cloud|App|Screen|Display|Widget|Pixel|Gemini|Chrome|Android|iPhone|iPad|MacBook|Windows|Linux|Bluetooth|Wi-Fi|GPS|HDR|AI|API|SDK|URL|USB|NFC|QR|FAQ|VPN|DNS|CSS|HTML|RGB|LED|OLED|AMOLED|RAM|SSD|CPU|GPU)\b/i;
    if (enTerms.test(trimmed) && trimmed.split(/\s+/).length <= 5 && !/[ěščřžýáíéúůďťňľôĺŕąćęłńóśźżöőüű]/.test(trimmed)) {
      return true;
    }

    return false;
  }

  /**
   * Find best English voice for mixed-language speech.
   */
  _getEnglishVoice() {
    if (this._cachedEnVoice) return this._cachedEnVoice;
    const voices = this.synth.getVoices();
    // Prefer premium/enhanced English voices
    this._cachedEnVoice = voices.find(v => v.lang === 'en-US' && /premium|enhanced/i.test(v.name))
      || voices.find(v => v.lang === 'en-US')
      || voices.find(v => v.lang === 'en-GB')
      || voices.find(v => v.lang.startsWith('en'));
    return this._cachedEnVoice;
  }

  _speakBrowser(text, options) {
    // Detect language segments for mixed CZ/EN pronunciation
    const segments = this._detectLanguageSegments(text);
    const hasEnglish = segments.some(s => s.lang === 'en');
    const enVoice = hasEnglish ? this._getEnglishVoice() : null;

    if (!hasEnglish || !enVoice) {
      // Single-language: speak as before
      return this._speakBrowserSingle(text, options);
    }

    // Multi-language: chain utterances with voice switching
    console.log(`[Dub TTS] Mixed-language: ${segments.length} segments`, segments.map(s => `[${s.lang}] "${s.text.substring(0, 30)}"`));
    return this._speakBrowserSegments(segments, enVoice, options);
  }

  _speakBrowserSingle(text, options) {
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

  async _speakBrowserSegments(segments, enVoice, options) {
    this.isSpeaking = true;
    if (this.onSpeakStart) this.onSpeakStart(segments.map(s => s.text).join(''));

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg.text.trim()) continue;

      await new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(seg.text);

        if (seg.lang === 'en') {
          utterance.voice = enVoice;
          utterance.lang = enVoice.lang;
        } else {
          if (this.selectedVoice) {
            utterance.voice = this.selectedVoice;
            utterance.lang = this.selectedVoice.lang;
          } else {
            utterance.lang = this._langConfig.bcp47;
          }
        }

        utterance.volume = options.volume ?? this.volume;
        utterance.rate = options.rate ?? this.rate;
        utterance.pitch = options.pitch ?? this.pitch;

        utterance.onend = () => resolve();
        utterance.onerror = (event) => {
          if (event.error !== 'canceled' && event.error !== 'interrupted') {
            console.warn(`[Dub TTS] Segment error [${seg.lang}]:`, event.error);
          }
          resolve();
        };

        this.currentUtterance = utterance;
        this.synth.speak(utterance);
      });
    }

    this.isSpeaking = false;
    this.currentUtterance = null;
    if (this.onSpeakEnd) this.onSpeakEnd('');
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
