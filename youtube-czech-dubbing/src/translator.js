/**
 * Translator - Translates text using free translation APIs.
 * All API calls go through background.js service worker to bypass CSP.
 * Supports multiple target languages (cs, sk, pl, hu).
 */
class Translator {
  constructor() {
    this.cache = new Map();
    this.rateLimitDelay = 50; // ms between requests (Google)
    this._deeplRateLimitDelay = 300; // ms between DeepL requests (free tier: ~5/s)
    this.lastRequestTime = 0;
    this._contextInvalidated = false;
    this._engine = 'google'; // 'google', 'claude', or 'deepl'
    this._anthropicApiKey = null;
    this._deeplApiKey = null;
    this._targetLang = DEFAULT_LANGUAGE;
    this._langConfig = getLanguageConfig(DEFAULT_LANGUAGE);
    this._serviceClient = null; // injected by DubbingController for B2B mode
  }

  /**
   * Load translation engine settings from storage.
   */
  async loadSettings() {
    try {
      const result = await chrome.storage.local.get('popupSettings');
      if (result.popupSettings) {
        this._engine = result.popupSettings.translatorEngine || 'google';
        this._anthropicApiKey = result.popupSettings.anthropicApiKey || null;
        this._deeplApiKey = result.popupSettings.deeplApiKey || null;
        this._targetLang = result.popupSettings.targetLanguage || DEFAULT_LANGUAGE;
        this._langConfig = getLanguageConfig(this._targetLang);
      }
    } catch (e) {}
    console.log(`[CzechDub] Translation engine: ${this._engine}, target: ${this._targetLang}`);
  }

  /**
   * Translate a single text string to the configured target language.
   */
  async translate(text, sourceLang = 'en') {
    if (!text || text.trim().length === 0) return '';
    if (this._contextInvalidated) return text;

    const cacheKey = `${sourceLang}:${this._targetLang}:${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Service mode: delegate to centralized API
    if (this._serviceClient?.isServiceMode()) {
      const result = await this._serviceClient.translate(text, sourceLang, this._targetLang, this._engine);
      if (result) {
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    // Rate limiting — use engine-specific delay
    const delay = (this._engine === 'deepl') ? this._deeplRateLimitDelay : this.rateLimitDelay;
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < delay) {
      await this._sleep(delay - elapsed);
    }
    this.lastRequestTime = Date.now();

    let translated = null;

    // Use DeepL if configured
    if (this._engine === 'deepl' && this._deeplApiKey && !this._deeplDisabled) {
      translated = await this._translateDeepL(text, sourceLang);
      if (translated) {
        this.cache.set(cacheKey, translated);
        return translated;
      }
    }

    // Use Claude if configured and not disabled by previous error
    if (this._engine === 'claude' && this._anthropicApiKey && !this._claudeDisabled) {
      translated = await this._translateClaude(text, sourceLang);
      if (translated) {
        this.cache.set(cacheKey, translated);
        return translated;
      }
      // Fall through to Google on Claude failure
    }

    // Google Translate
    translated = await this._translateGoogle(text, sourceLang);

    // Fallback to MyMemory
    if (!translated) {
      translated = await this._translateMyMemory(text, sourceLang);
    }

    // Last resort: LibreTranslate
    if (!translated) {
      translated = await this._translateLibre(text, sourceLang);
    }

    if (translated) {
      this.cache.set(cacheKey, translated);
      return translated;
    }

    return text;
  }

  /**
   * Translate caption segments: clean ASR errors, merge into sentences,
   * translate as whole sentences, return sentence-level segments for TTS.
   */
  async translateCaptions(captions, sourceLang = 'en', onProgress = null) {
    // Step 1: Clean ASR errors in original text
    const cleaned = captions.map(c => ({
      ...c,
      text: this._cleanASR(c.text)
    }));

    // Step 2: Merge into sentence groups for better translation
    const groups = this._groupIntoSentences(cleaned);
    console.log(`[CzechDub] ${captions.length} segments → ${groups.length} sentence groups`);

    // Step 3: Translate groups in batches
    const maxCharsPerBatch = 4000;
    const result = [];
    let i = 0;

    while (i < groups.length) {
      if (this._contextInvalidated) break;

      const batch = [];
      let charCount = 0;
      while (i < groups.length && (charCount + groups[i].text.length < maxCharsPerBatch || batch.length === 0)) {
        batch.push(groups[i]);
        charCount += groups[i].text.length + 5;
        i++;
      }

      const SEP = 'XSEP9F3A';
      const sepCleanRegex = /\s*X\s*S\s*E\s*P\s*9\s*F\s*3\s*A\s*/gi;
      const combinedText = batch.map(g => g.text).join(` ${SEP} `);
      const translatedCombined = await this.translate(combinedText, sourceLang);
      const translatedParts = translatedCombined.split(new RegExp(`\\s*${SEP}\\s*`, 'i'));

      if (translatedParts.length !== batch.length) {
        console.warn(`[CzechDub] Separator mismatch: expected ${batch.length} parts, got ${translatedParts.length}. Falling back to per-segment translation.`);
        for (const group of batch) {
          const translatedText = await this.translate(group.text, sourceLang);
          result.push({
            start: group.start,
            duration: group.duration,
            originalText: group.text,
            text: (translatedText || group.text).replace(sepCleanRegex, ' ').trim()
          });
        }
      } else {
        for (let j = 0; j < batch.length; j++) {
          const group = batch[j];
          result.push({
            start: group.start,
            duration: group.duration,
            originalText: group.text,
            text: (translatedParts[j] || group.text).replace(sepCleanRegex, ' ').trim()
          });
        }
      }

      if (onProgress) {
        onProgress(Math.min(i, groups.length), groups.length);
      }
    }

    console.log(`[CzechDub] Translated ${result.length} sentence groups`);
    return result;
  }

  /**
   * Clean common ASR (auto-generated subtitle) errors.
   */
  _cleanASR(text) {
    return text
      // Remove speaker change markers (>> or >>)
      .replace(/>{1,2}\s*/g, '')
      // Remove [Music], [Applause], etc.
      .replace(/\[.*?\]/g, '')
      // Fix common misrecognitions
      .replace(/\bclawed?\s*code\b/gi, 'Claude Code')
      .replace(/\bcloud\s*code\b/gi, 'Claude Code')
      .replace(/\bclaud\s*code\b/gi, 'Claude Code')
      .replace(/\bopen\s*claw\b/gi, 'OpenClaw')
      .replace(/\benropic\b/gi, 'Anthropic')
      .replace(/\benthropic\b/gi, 'Anthropic')
      .replace(/\bentropic\b/gi, 'Anthropic')
      .replace(/\banthropic\b/gi, 'Anthropic')
      // Remove filler words
      .replace(/\b(uh|um|er|ah|like,?)\b/gi, '')
      // Clean up double spaces and leading/trailing punctuation
      .replace(/\s{2,}/g, ' ')
      .replace(/^\s*[,;]\s*/, '')
      .trim();
  }

  /**
   * Group segments into sentences (combine until sentence boundary).
   * Each group has: text (combined), segments (original with timestamps).
   */
  _groupIntoSentences(segments) {
    const groups = [];
    let buffer = '';
    let groupSegs = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg.text) continue;

      groupSegs.push(seg);
      buffer += (buffer ? ' ' : '') + seg.text;

      const isSentenceEnd = /[.!?][""]?\s*$/.test(buffer);
      const isLong = buffer.length > 150;
      const isLast = i === segments.length - 1;

      if (isSentenceEnd || isLong || isLast) {
        groups.push({
          text: buffer.trim(),
          segments: [...groupSegs],
          start: groupSegs[0].start,
          duration: (seg.start + (seg.duration || 2)) - groupSegs[0].start
        });
        buffer = '';
        groupSegs = [];
      }
    }

    return groups;
  }

  /**
   * MyMemory Translation API via background worker.
   */
  async _sendMessage(msg) {
    if (this._contextInvalidated) return null;
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) {
        this._contextInvalidated = true;
        this._showReloadBanner();
        return null;
      }
      throw e;
    }
  }

  _showReloadBanner() {
    if (document.getElementById('czech-dub-reload-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'czech-dub-reload-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#d32f2f;color:#fff;padding:12px 20px;font-size:15px;text-align:center;font-family:sans-serif;cursor:pointer;';
    banner.textContent = '⚠️ Rozšíření Czech Dubbing bylo aktualizováno — klikněte zde pro reload stránky';
    banner.addEventListener('click', () => location.reload());
    document.body.appendChild(banner);
  }

  /**
   * Claude Haiku 4.5 translation via background worker.
   */
  async _translateClaude(text, sourceLang) {
    try {
      const response = await this._sendMessage({
        type: 'translate-claude',
        text,
        sourceLang,
        targetLang: this._targetLang,
        claudePrompt: this._langConfig.claudePrompt,
        apiKey: this._anthropicApiKey
      });
      if (response?.success && response.translated) {
        return response.translated;
      }
      if (response?.error) {
        console.warn('[CzechDub] Claude translation error:', response.error);
        // Disable Claude for this session on permanent errors
        if (response.error.includes('credit balance') ||
            response.error.includes('invalid x-api-key') ||
            response.error.includes('authentication_error')) {
          this._claudeDisabled = true;
          console.warn('[CzechDub] Claude disabled for this session, using Google Translate');
        }
      }
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return null;
      console.warn('[CzechDub] Claude translation failed:', e);
    }
    return null;
  }

  /**
   * DeepL translation via background worker.
   */
  async _translateDeepL(text, sourceLang) {
    try {
      const response = await this._sendMessage({
        type: 'translate-deepl',
        text,
        sourceLang,
        targetLang: this._langConfig.translationCodes.deepl,
        apiKey: this._deeplApiKey
      });
      if (response?.success && response.translated) {
        return response.translated;
      }
      if (response?.error) {
        console.warn('[CzechDub] DeepL translation error:', response.error);
        if (response.error.includes('Quota') || response.error.includes('403') || response.error.includes('456')) {
          this._deeplDisabled = true;
          console.warn('[CzechDub] DeepL disabled for this session (quota/auth), using Google Translate');
        }
      }
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return null;
      console.warn('[CzechDub] DeepL translation failed:', e);
    }
    return null;
  }

  async _translateMyMemory(text, sourceLang) {
    try {
      const response = await this._sendMessage({
        type: 'translate-mymemory',
        text,
        sourceLang,
        targetLang: this._langConfig.translationCodes.mymemory
      });
      if (response?.success && response.translated) {
        return response.translated;
      }
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return null;
      console.warn('[CzechDub] MyMemory translation failed:', e);
    }
    return null;
  }

  /**
   * LibreTranslate via background worker.
   */
  async _translateLibre(text, sourceLang) {
    try {
      const response = await this._sendMessage({
        type: 'translate-libre',
        text,
        sourceLang,
        targetLang: this._langConfig.translationCodes.libre
      });
      if (response?.success && response.translated) {
        return response.translated;
      }
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return null;
      console.warn('[CzechDub] LibreTranslate translation failed:', e);
    }
    return null;
  }

  /**
   * Google Translate via background worker.
   */
  async _translateGoogle(text, sourceLang) {
    try {
      const response = await this._sendMessage({
        type: 'translate-google',
        text,
        sourceLang,
        targetLang: this._langConfig.translationCodes.google
      });
      if (response?.success && response.translated) {
        return response.translated;
      }
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return null;
      console.warn('[CzechDub] Google translate fallback failed:', e);
    }
    return null;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clearCache() {
    this.cache.clear();
  }
}

window.Translator = Translator;
