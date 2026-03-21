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
   * Translate an array of caption objects.
   * First merges segments into sentences for better translation context,
   * then translates in efficient batches.
   */
  async translateCaptions(captions, sourceLang = 'en', onProgress = null) {
    // Step 1: Merge short segments into sentences for better translation
    const sentences = this._mergeIntoSentences(captions);
    console.log(`[CzechDub] Merged ${captions.length} segments into ${sentences.length} sentences`);

    // Step 2: Translate sentences in batches (~3000 chars each)
    const maxCharsPerBatch = 3000;
    const translatedSentences = [];
    let i = 0;

    while (i < sentences.length) {
      const batch = [];
      let charCount = 0;
      while (i < sentences.length && (charCount + sentences[i].text.length < maxCharsPerBatch || batch.length === 0)) {
        batch.push(sentences[i]);
        charCount += sentences[i].text.length + 5;
        i++;
      }

      const combinedText = batch.map(s => s.text).join(' ||| ');
      const translatedCombined = await this.translate(combinedText, sourceLang);
      const translatedParts = translatedCombined.split(/\s*\|\|\|\s*/);

      for (let j = 0; j < batch.length; j++) {
        translatedSentences.push({
          ...batch[j],
          originalText: batch[j].text,
          text: translatedParts[j] || batch[j].text
        });
      }

      if (onProgress) {
        onProgress(Math.min(i, sentences.length), sentences.length);
      }
    }

    return translatedSentences;
  }

  /**
   * Merge caption segments into sentences.
   * Combines adjacent short segments until a sentence boundary (.!?) is found.
   * Preserves start time from first segment, calculates total duration.
   */
  _mergeIntoSentences(captions) {
    const sentences = [];
    let buffer = '';
    let startTime = 0;
    let startIndex = 0;

    for (let i = 0; i < captions.length; i++) {
      const seg = captions[i];
      if (!buffer) {
        startTime = seg.start;
        startIndex = i;
      }

      buffer += (buffer ? ' ' : '') + seg.text;

      // Flush on sentence boundary or long buffer
      const isSentenceEnd = /[.!?][""]?\s*$/.test(buffer);
      const isLong = buffer.length > 200;
      const isLast = i === captions.length - 1;

      if (isSentenceEnd || isLong || isLast) {
        const endSeg = captions[i];
        sentences.push({
          start: startTime,
          duration: (endSeg.start + (endSeg.duration || 2)) - startTime,
          text: buffer.trim()
        });
        buffer = '';
      }
    }

    return sentences;
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
