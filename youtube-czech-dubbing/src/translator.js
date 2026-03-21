/**
 * Translator - Translates text to Czech using free translation APIs.
 * All API calls go through background.js service worker to bypass CSP.
 * Uses MyMemory Translation API (free, no API key needed, 5000 chars/day)
 * with fallback to LibreTranslate and Google Translate.
 */
class Translator {
  constructor() {
    this.cache = new Map();
    this.rateLimitDelay = 100; // ms between requests
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

    // Try MyMemory API first (free, no key needed)
    translated = await this._translateMyMemory(text, sourceLang);

    // Fallback to LibreTranslate
    if (!translated) {
      translated = await this._translateLibre(text, sourceLang);
    }

    // Last resort: Google Translate unofficial endpoint
    if (!translated) {
      translated = await this._translateGoogle(text, sourceLang);
    }

    if (translated) {
      this.cache.set(cacheKey, translated);
      return translated;
    }

    return text; // Return original if all translation fails
  }

  /**
   * Translate an array of caption objects in batches.
   * Returns new array with translated text.
   */
  async translateCaptions(captions, sourceLang = 'en', onProgress = null) {
    const translated = [];
    const batchSize = 5;

    for (let i = 0; i < captions.length; i += batchSize) {
      const batch = captions.slice(i, i + batchSize);

      // Combine batch into single text for more efficient translation
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
        onProgress(Math.min(i + batchSize, captions.length), captions.length);
      }
    }

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
