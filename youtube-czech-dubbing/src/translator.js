/**
 * Translator - Translates text to Czech using free translation APIs.
 * All API calls go through background.js service worker to bypass CSP.
 * Uses MyMemory Translation API (free, no API key needed, 5000 chars/day)
 * with fallback to LibreTranslate and Google Translate.
 */
class Translator {
  constructor() {
    this.cache = new Map();
    this.rateLimitDelay = 50; // ms between requests
    this.lastRequestTime = 0;
  }

  /**
   * Translate a single text string to Czech.
   */
  async translate(text, sourceLang = 'en') {
    if (!text || text.trim().length === 0) return '';

    const cacheKey = `${sourceLang}:${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Rate limiting
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.rateLimitDelay) {
      await this._sleep(this.rateLimitDelay - elapsed);
    }
    this.lastRequestTime = Date.now();

    let translated = null;

    // Google Translate first (best quality for Czech)
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

    return text; // Return original if all translation fails
  }

  /**
   * Translate an array of caption segments in context-aware batches.
   * Keeps original segment structure (timestamps) for synchronized playback,
   * but translates in larger batches joined by ||| for better context.
   */
  async translateCaptions(captions, sourceLang = 'en', onProgress = null) {
    const translated = [];
    const maxCharsPerBatch = 3000;
    let i = 0;

    while (i < captions.length) {
      // Build batch up to maxCharsPerBatch
      const batch = [];
      let charCount = 0;
      while (i < captions.length && (charCount + captions[i].text.length < maxCharsPerBatch || batch.length === 0)) {
        batch.push(captions[i]);
        charCount += captions[i].text.length + 5;
        i++;
      }

      // Translate batch as single text with ||| separators
      const combinedText = batch.map(c => c.text).join(' ||| ');
      const translatedCombined = await this.translate(combinedText, sourceLang);
      const translatedParts = translatedCombined.split(/\s*\|\|\|\s*/);

      for (let j = 0; j < batch.length; j++) {
        translated.push({
          ...batch[j],
          originalText: batch[j].text,
          text: translatedParts[j] || batch[j].text
        });
      }

      if (onProgress) {
        onProgress(Math.min(i, captions.length), captions.length);
      }
    }

    console.log(`[CzechDub] Translated ${captions.length} segments in ${Math.ceil(captions.length * 20 / maxCharsPerBatch)} batches`);
    return translated;
  }

  /**
   * MyMemory Translation API via background worker.
   */
  async _translateMyMemory(text, sourceLang) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'translate-mymemory',
        text,
        sourceLang
      });
      if (response?.success && response.translated) {
        return response.translated;
      }
    } catch (e) {
      console.warn('[CzechDub] MyMemory translation failed:', e);
    }
    return null;
  }

  /**
   * LibreTranslate via background worker.
   */
  async _translateLibre(text, sourceLang) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'translate-libre',
        text,
        sourceLang
      });
      if (response?.success && response.translated) {
        return response.translated;
      }
    } catch (e) {
      console.warn('[CzechDub] LibreTranslate translation failed:', e);
    }
    return null;
  }

  /**
   * Google Translate via background worker.
   */
  async _translateGoogle(text, sourceLang) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'translate-google',
        text,
        sourceLang
      });
      if (response?.success && response.translated) {
        return response.translated;
      }
    } catch (e) {
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
