/**
 * Translator - Translates text to Czech using free translation APIs.
 * Uses MyMemory Translation API (free, no API key needed, 5000 chars/day)
 * with fallback to LibreTranslate public instances.
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
   * MyMemory Translation API - Free, no API key required.
   * Limit: 5000 chars/day without key, 50000 with free key.
   */
  async _translateMyMemory(text, sourceLang) {
    try {
      const langPair = `${sourceLang}|cs`;
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langPair)}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        const result = data.responseData.translatedText;
        // MyMemory returns "MYMEMORY WARNING" when quota exceeded
        if (result.includes('MYMEMORY WARNING') || result.includes('QUOTA')) {
          return null;
        }
        return result;
      }
    } catch (e) {
      console.warn('[CzechDub] MyMemory translation failed:', e);
    }
    return null;
  }

  /**
   * LibreTranslate - Free open source translation.
   * Uses public instances.
   */
  async _translateLibre(text, sourceLang) {
    const instances = [
      'https://libretranslate.de',
      'https://translate.argosopentech.com',
      'https://translate.terraprint.co'
    ];

    for (const instance of instances) {
      try {
        const resp = await fetch(`${instance}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: text,
            source: sourceLang,
            target: 'cs',
            format: 'text'
          })
        });

        if (!resp.ok) continue;

        const data = await resp.json();
        if (data.translatedText) {
          return data.translatedText;
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  /**
   * Google Translate unofficial endpoint (fallback).
   */
  async _translateGoogle(text, sourceLang) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=cs&dt=t&q=${encodeURIComponent(text)}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data && data[0]) {
        return data[0].map(item => item[0]).join('');
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
