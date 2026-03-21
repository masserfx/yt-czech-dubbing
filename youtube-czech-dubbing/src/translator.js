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
   * Translate caption segments: clean ASR errors, merge into sentences,
   * translate with full context, then split back for synchronized playback.
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
    const translatedGroups = [];
    let i = 0;

    while (i < groups.length) {
      const batch = [];
      let charCount = 0;
      while (i < groups.length && (charCount + groups[i].text.length < maxCharsPerBatch || batch.length === 0)) {
        batch.push(groups[i]);
        charCount += groups[i].text.length + 5;
        i++;
      }

      const combinedText = batch.map(g => g.text).join(' ||| ');
      const translatedCombined = await this.translate(combinedText, sourceLang);
      const translatedParts = translatedCombined.split(/\s*\|\|\|\s*/);

      for (let j = 0; j < batch.length; j++) {
        translatedGroups.push({
          ...batch[j],
          translatedText: translatedParts[j] || batch[j].text
        });
      }

      if (onProgress) {
        onProgress(Math.min(i, groups.length), groups.length);
      }
    }

    // Step 4: Split translated groups back into timed segments
    const result = [];
    for (const group of translatedGroups) {
      const segments = group.segments;
      const translatedText = group.translatedText;

      if (segments.length === 1) {
        result.push({ ...segments[0], originalText: segments[0].text, text: translatedText });
      } else {
        // Split translation proportionally by original text length
        const words = translatedText.split(/\s+/);
        const totalOrigLen = segments.reduce((s, seg) => s + seg.text.length, 0);
        let wordIndex = 0;

        for (let k = 0; k < segments.length; k++) {
          const seg = segments[k];
          const ratio = seg.text.length / totalOrigLen;
          const wordCount = Math.max(1, Math.round(words.length * ratio));
          const segWords = words.slice(wordIndex, wordIndex + wordCount);
          wordIndex += wordCount;

          // Last segment gets remaining words
          if (k === segments.length - 1) {
            segWords.push(...words.slice(wordIndex));
          }

          result.push({
            ...seg,
            originalText: seg.text,
            text: segWords.join(' ')
          });
        }
      }
    }

    console.log(`[CzechDub] Translated ${result.length} segments via ${translatedGroups.length} groups`);
    return result;
  }

  /**
   * Clean common ASR (auto-generated subtitle) errors.
   */
  _cleanASR(text) {
    return text
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
      .replace(/\b(uh|um|er|ah)\b/gi, '')
      // Clean up double spaces
      .replace(/\s{2,}/g, ' ')
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
