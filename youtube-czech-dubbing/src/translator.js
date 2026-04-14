/**
 * Translator - Translates text using multiple engines.
 * Priority: Chrome AI (free, on-device) → DeepL/Claude (paid) → Google → MyMemory → Libre.
 * All external API calls go through background.js service worker to bypass CSP.
 * Chrome AI Translator runs directly in content script (on-device, no network).
 */
class Translator {
  constructor() {
    this.cache = new Map();
    this.rateLimitDelay = 50; // ms between requests (Google)
    this._deeplRateLimitDelay = 300; // ms between DeepL requests (free tier: ~5/s)
    this.lastRequestTime = 0;
    this._contextInvalidated = false;
    this._engine = 'google'; // 'chromeai', 'google', 'claude', 'deepl', or 'gemini'
    this._anthropicApiKey = null;
    this._deeplApiKey = null;
    this._geminiApiKey = null;
    this._targetLang = DEFAULT_LANGUAGE;
    this._langConfig = getLanguageConfig(DEFAULT_LANGUAGE);
    this._serviceClient = null; // injected by DubbingController for B2B mode

    // Chrome AI Translator (on-device, free)
    this._chromeAIAvailable = null; // null = unchecked, true/false
    this._chromeAITranslator = null; // cached translator instance
    this._chromeAITranslatorPair = null; // 'en→cs' key for cached instance
    this._chromeAIDisabled = false;
    this._chromeAIDetector = null; // LanguageDetector instance

    // Status callback for model download progress
    this.onStatusChange = null;
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
        this._geminiApiKey = result.popupSettings.geminiApiKey || null;
        this._targetLang = result.popupSettings.targetLanguage || DEFAULT_LANGUAGE;
        this._langConfig = getLanguageConfig(this._targetLang);
      }
    } catch (e) {}
    // Pre-check Chrome AI availability when selected
    if (this._engine === 'chromeai') {
      this._checkChromeAIAvailability();
    }
    console.log(`[CzechDub] Translation engine: ${this._engine}, target: ${this._targetLang}`);
  }

  /**
   * Translate a single text string to the configured target language.
   */
  async translate(text, sourceLang = 'en') {
    if (!text || text.trim().length < 2) return '';
    if (this._contextInvalidated) return text;

    const cacheKey = `${sourceLang}:${this._targetLang}:${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    let translated = await this._translateRaw(text, sourceLang);

    if (translated) {
      // Reject translation error messages that leak through as "translations"
      if (/prosím.*vložte.*text|please.*enter.*text|enter.*text.*translate/i.test(translated)) {
        console.warn('[CzechDub] Rejected error response from translation engine:', translated.substring(0, 80));
        return text; // Return original
      }
      translated = this._phoneticize(translated, sourceLang);
      translated = this._cleanTranslatedOutput(translated);
      this.cache.set(cacheKey, translated);
      return translated;
    }

    return text;
  }

  /**
   * Core translation dispatch — tries engines in priority order.
   */
  async _translateRaw(text, sourceLang) {
    // Service mode: delegate to centralized API
    if (this._serviceClient?.isServiceMode()) {
      const result = await this._serviceClient.translate(text, sourceLang, this._targetLang, this._engine);
      if (result) return result;
    }

    // Chrome AI: highest priority free engine (on-device, no rate limit)
    if (this._engine === 'chromeai' && !this._chromeAIDisabled) {
      const available = await this._checkChromeAIAvailability();
      if (available) {
        const result = await this._translateChromeAI(text, sourceLang);
        if (result) { this._lastEngine = 'chromeai'; return result; }
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

    // Use DeepL if configured
    if (this._engine === 'deepl' && this._deeplApiKey && !this._deeplDisabled) {
      const result = await this._translateDeepL(text, sourceLang);
      if (result) { this._lastEngine = 'deepl'; return result; }
    }

    // Use Claude if configured
    if (this._engine === 'claude' && this._anthropicApiKey && !this._claudeDisabled) {
      const result = await this._translateClaude(text, sourceLang);
      if (result) { this._lastEngine = 'claude'; return result; }
    }

    // Use Gemini Flash-Lite if configured
    if (this._engine === 'gemini' && this._geminiApiKey && !this._geminiDisabled) {
      const result = await this._translateGemini(text, sourceLang);
      if (result) { this._lastEngine = 'gemini'; return result; }
    }

    // Google Translate
    let translated = await this._translateGoogle(text, sourceLang);
    if (translated) { this._lastEngine = 'google'; return translated; }

    // Fallback to MyMemory
    translated = await this._translateMyMemory(text, sourceLang);
    if (translated) return translated;

    // Last resort: LibreTranslate
    return await this._translateLibre(text, sourceLang);
  }

  /**
   * Post-process translated text: replace English words/names
   * with phonetic spelling for correct Czech TTS pronunciation.
   */
  _phoneticize(text, sourceLang) {
    if (sourceLang === this._targetLang) return text;

    // Static dictionary: English → Czech phonetic approximation
    // Covers common tech terms, brand names, and words that stay untranslated
    const phoneticMap = [
      // Tech brands & products
      [/\bGoogle\b/g, 'Gůgl'],
      [/\bYouTube\b/g, 'Jútyúb'],
      [/\bPixel\b/g, 'Piksl'],
      [/\bGemini\b/g, 'Džemynaj'],
      [/\bChrome\b/g, 'Króum'],
      [/\bAndroid\b/g, 'Endrojd'],
      [/\biPhone\b/g, 'Ajfoun'],
      [/\biPad\b/g, 'Ajped'],
      [/\bMacBook\b/g, 'Mekbuk'],
      [/\bWindows\b/g, 'Vindous'],
      [/\bLinux\b/g, 'Linuks'],
      [/\bNetflix\b/g, 'Netfliks'],
      [/\bSpotify\b/g, 'Spotifaj'],
      [/\bOpenAI\b/g, 'Oupen ej aj'],
      [/\bChatGPT\b/g, 'Čet džípítý'],
      [/\bClaude\b/g, 'Klód'],
      [/\bAnthropic\b/g, 'Entropik'],
      [/\bTesla\b/g, 'Tezla'],
      [/\bApple\b/g, 'Epl'],
      [/\bMicrosoft\b/g, 'Majkrosoft'],
      [/\bAmazon\b/g, 'Emezn'],
      [/\bFacebook\b/g, 'Fejsbuk'],
      [/\bInstagram\b/g, 'Instagrem'],
      [/\bTikTok\b/g, 'Tiktok'],
      [/\bTwitter\b/g, 'Tviter'],
      [/\bSlack\b/g, 'Slek'],
      [/\bZoom\b/g, 'Zúm'],
      [/\bNotion\b/g, 'Noušn'],
      [/\bFigma\b/g, 'Figma'],
      [/\bGitHub\b/g, 'Githab'],
      [/\bStack Overflow\b/g, 'Stek Ouvr-flou'],
      [/\bNotebookLM\b/g, 'Noutbuk el em'],
      [/\bDeepL\b/g, 'Dípl'],

      // Common English terms in tech articles
      [/\bhighlights?\b/gi, (m) => m[0] === 'H' ? 'Hajlajts' : 'hajlajts'],
      [/\bfeatures?\b/gi, (m) => m[0] === 'F' ? 'Fíčrs' : 'fíčrs'],
      [/\bupdates?\b/gi, (m) => m[0] === 'U' ? 'Apdejts' : 'apdejts'],
      [/\bsettings?\b/gi, (m) => m[0] === 'S' ? 'Setynks' : 'setynks'],
      [/\bdownload\b/gi, (m) => m[0] === 'D' ? 'Daunloud' : 'daunloud'],
      [/\bupload\b/gi, (m) => m[0] === 'U' ? 'Aploud' : 'aploud'],
      [/\bstreaming\b/gi, 'strímink'],
      [/\bpodcast\b/gi, (m) => m[0] === 'P' ? 'Podkást' : 'podkást'],
      [/\bnewsletter\b/gi, 'njúzletr'],
      [/\bonline\b/gi, 'onlajn'],
      [/\boffline\b/gi, 'oflajn'],
      [/\bsmart\b/gi, 'smárt'],
      [/\bscreenshot\b/gi, 'skrínšot'],
      [/\bwidget\b/gi, 'vidžet'],
      [/\bcloud\b/gi, (m) => m[0] === 'C' ? 'Klaud' : 'klaud'],
      [/\bshare\b/gi, 'šér'],
      [/\bfeedback\b/gi, 'fídbek'],
      [/\bdesign\b/gi, 'dyzajn'],
      [/\blayout\b/gi, 'lejaut'],
      [/\bdashboard\b/gi, 'dešbórd'],
      [/\bworkflow\b/gi, 'vorkflou'],
      [/\bplaylist\b/gi, 'plejlist'],
      [/\bawesome\b/gi, (m) => m[0] === 'A' ? 'Ósam' : 'ósam'],
      [/\bcool\b/gi, 'kůl'],
      [/\bnight\s*mode\b/gi, 'najt moud'],
      [/\bdark\s*mode\b/gi, 'dárk moud'],
      [/\bscroll\b/gi, 'skroul'],
      [/\bswipe\b/gi, 'svajp'],
      [/\btouchscreen\b/gi, 'tačskrín'],
      [/\bbluetooth\b/gi, 'blútůs'],
      [/\bwi-?fi\b/gi, 'vajfaj'],

      // AI terms
      [/\bAI\b/g, 'ej aj'],
      [/\bmachine learning\b/gi, 'mašín lérnyng'],
      [/\bdeep learning\b/gi, 'díp lérnyng'],
      [/\bprompt\b/gi, (m) => m[0] === 'P' ? 'Promt' : 'promt'],
      [/\bchatbot\b/gi, 'četbot'],
    ];

    let result = text;
    for (const [pattern, replacement] of phoneticMap) {
      result = result.replace(pattern, replacement);
    }

    return result;
  }

  /**
   * Post-translation cleanup — remove filler word translations that engines
   * sometimes produce despite prompt instructions.
   * Currently handles Czech and Slovak; other languages pass through unchanged.
   */
  _cleanTranslatedOutput(text) {
    if (!text) return text;

    if (this._targetLang === 'cs') {
      text = text
        // Czech filler translations at sentence start
        .replace(/^(Víte|Myslím|Vlastně|Tak|Teda|No|Prostě|Jako),?\s+/i, '')
        // Mid-sentence "víte" as standalone filler (not "víte, co/jak/že")
        .replace(/,\s*víte,\s*(?!co\b|jak\b|že\b)/gi, ', ')
        // Trailing "že jo" / "no ne" filler
        .replace(/,?\s*(že jo|no ne)\s*[.?]?\s*$/i, '.')
        // Clean artifacts
        .replace(/\s{2,}/g, ' ')
        .replace(/^\s*[,;]\s*/, '')
        .trim();
    } else if (this._targetLang === 'sk') {
      text = text
        .replace(/^(Viete|Myslím|Vlastne|Tak|Teda|No|Proste|Ako),?\s+/i, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/^\s*[,;]\s*/, '')
        .trim();
    }

    return text;
  }

  /**
   * Translate caption segments: clean ASR errors, merge into sentences,
   * translate as whole sentences, return sentence-level segments for TTS.
   */
  async translateCaptions(captions, sourceLang = 'en', onProgress = null) {
    // Step 1: Clean ASR errors in original text, filter empty segments
    const cleaned = captions.map(c => ({
      ...c,
      text: this._cleanASR(c.text)
    })).filter(c => c.text && c.text.trim().length >= 2);

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
      console.log(`[CzechDub] Raw translation (first 200): "${translatedCombined.substring(0, 200)}"`);
      const translatedParts = translatedCombined.split(new RegExp(`\\s*${SEP}\\s*`, 'i'));

      if (translatedParts.length !== batch.length) {
        console.warn(`[CzechDub] Separator mismatch: expected ${batch.length} parts, got ${translatedParts.length}. Falling back to per-segment translation.`);
        for (const group of batch) {
          const translatedText = await this.translate(group.text, sourceLang);
          const cleanText = (translatedText || group.text).replace(sepCleanRegex, ' ').trim();
          const { speaker, text: strippedText } = SpeakerDetector.parseTag(cleanText);
          result.push({
            start: group.start,
            duration: group.duration,
            originalText: group.text,
            text: strippedText,
            speaker
          });
        }
      } else {
        for (let j = 0; j < batch.length; j++) {
          const group = batch[j];
          const cleanText = (translatedParts[j] || group.text).replace(sepCleanRegex, ' ').trim();
          const { speaker, text: strippedText } = SpeakerDetector.parseTag(cleanText);
          result.push({
            start: group.start,
            duration: group.duration,
            originalText: group.text,
            text: strippedText,
            speaker
          });
        }
      }

      if (onProgress) {
        onProgress(Math.min(i, groups.length), groups.length);
      }
    }

    // Apply heuristic speaker detection for segments without LLM tags
    SpeakerDetector.detectHeuristics(result);

    const withSpeaker = result.filter(s => s.speaker).length;
    if (withSpeaker > 0) {
      console.log(`[CzechDub] Speaker detection: ${withSpeaker}/${result.length} segments tagged`);
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
      // Stutter/repetition: "I I I think" → "I think"
      .replace(/\b(\w+)(\s+\1){1,}\b/gi, '$1')
      // Filler phrases (longer first to avoid partial matches)
      .replace(/\b(you know what|and things like that|at the end of the day|to be honest|you know|I mean|kind of|sort of|or something|or whatever|and stuff|basically|literally),?\s*/gi, '')
      // Hesitation sounds
      .replace(/\b(uh-huh|uh huh|mm-hmm|mm hmm|ehmm|uhm|hmm|mhm|huh|ugh|uh|um|er|ah|eh)\b,?\s*/gi, '')
      // Discourse markers at sentence start
      .replace(/^(So|Well|Now|Anyway|Look),?\s+/i, '')
      .replace(/((?:^|[.!?])\s*)Actually,?\s+/gi, '$1')
      // "like" only as filler (with comma context)
      .replace(/,\s*like,\s*/gi, ', ')
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
   * Gemini Flash-Lite translation via background worker.
   */
  async _translateGemini(text, sourceLang) {
    try {
      const response = await this._sendMessage({
        type: 'translate-gemini',
        text,
        sourceLang,
        targetLang: this._targetLang,
        geminiPrompt: this._langConfig.geminiPrompt,
        apiKey: this._geminiApiKey
      });
      if (response?.success && response.translated) {
        return response.translated;
      }
      if (response?.error) {
        console.warn('[CzechDub] Gemini translation error:', response.error);
        if (response.error.includes('API_KEY_INVALID') ||
            response.error.includes('PERMISSION_DENIED') ||
            response.error.includes('403')) {
          this._geminiDisabled = true;
          console.warn('[CzechDub] Gemini disabled for this session, falling back to Google Translate');
        }
      }
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) return null;
      console.warn('[CzechDub] Gemini translation failed:', e);
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

  /**
   * Check if Chrome AI Translator API is available (Chrome 131+).
   */
  async _checkChromeAIAvailability() {
    if (this._chromeAIAvailable !== null) return this._chromeAIAvailable;

    try {
      if (!self.translation?.canTranslate) {
        this._chromeAIAvailable = false;
        return false;
      }
      const result = await self.translation.canTranslate({
        sourceLanguage: 'en',
        targetLanguage: this._targetLang
      });
      // 'readily' = model loaded, 'after-download' = needs download, 'no' = unsupported
      this._chromeAIAvailable = (result === 'readily' || result === 'after-download');
      console.log(`[CzechDub] Chrome AI Translator: ${result} (en→${this._targetLang})`);
      return this._chromeAIAvailable;
    } catch (e) {
      console.warn('[CzechDub] Chrome AI check failed:', e);
      this._chromeAIAvailable = false;
      return false;
    }
  }

  /**
   * Get or create a Chrome AI Translator instance for the given language pair.
   * Caches the instance and reports model download progress via onStatusChange.
   */
  async _getChromeAITranslator(sourceLang) {
    const pairKey = `${sourceLang}→${this._targetLang}`;
    if (this._chromeAITranslator && this._chromeAITranslatorPair === pairKey) {
      return this._chromeAITranslator;
    }

    // Destroy previous instance if language pair changed
    if (this._chromeAITranslator?.destroy) {
      this._chromeAITranslator.destroy();
      this._chromeAITranslator = null;
    }

    const options = {
      sourceLanguage: sourceLang,
      targetLanguage: this._targetLang
    };

    // Check availability for this specific pair
    const canTranslate = await self.translation.canTranslate(options);
    if (canTranslate === 'no') {
      console.warn(`[CzechDub] Chrome AI: pair ${pairKey} not supported`);
      return null;
    }

    // Create translator — may trigger model download
    if (canTranslate === 'after-download' && this.onStatusChange) {
      this.onStatusChange('loading', `Stahuji AI model (${pairKey})...`);
    }

    const translator = await self.translation.createTranslator(options);

    // Monitor download progress if available
    if (translator.ondownloadprogress !== undefined) {
      translator.ondownloadprogress = (e) => {
        if (this.onStatusChange && e.total > 0) {
          const pct = Math.round((e.loaded / e.total) * 100);
          this.onStatusChange('loading', `AI model ${pairKey}: ${pct}%`);
        }
      };
      // Wait for the translator to be ready
      await translator.ready;
    }

    this._chromeAITranslator = translator;
    this._chromeAITranslatorPair = pairKey;
    console.log(`[CzechDub] Chrome AI Translator ready: ${pairKey}`);
    return translator;
  }

  /**
   * Translate text using Chrome AI on-device Translator.
   */
  async _translateChromeAI(text, sourceLang) {
    try {
      const translator = await this._getChromeAITranslator(sourceLang);
      if (!translator) return null;

      const result = await translator.translate(text);
      return result || null;
    } catch (e) {
      console.warn('[CzechDub] Chrome AI translation failed:', e);
      // Disable for this session on persistent errors
      if (e.name === 'NotSupportedError' || e.message?.includes('not supported')) {
        this._chromeAIDisabled = true;
        console.warn('[CzechDub] Chrome AI disabled for this session');
      }
      return null;
    }
  }

  /**
   * Detect source language using Chrome AI LanguageDetector (Chrome 129+).
   * Returns BCP-47 language code or null.
   */
  async _detectLanguageChromeAI(text) {
    try {
      if (!self.translation?.createDetector && !self.LanguageDetector) return null;

      if (!this._chromeAIDetector) {
        if (self.LanguageDetector?.create) {
          this._chromeAIDetector = await self.LanguageDetector.create();
        } else if (self.translation?.createDetector) {
          this._chromeAIDetector = await self.translation.createDetector();
        } else {
          return null;
        }
      }

      const results = await this._chromeAIDetector.detect(text);
      if (results?.length > 0 && results[0].confidence > 0.5) {
        return results[0].detectedLanguage;
      }
    } catch (e) {
      console.warn('[CzechDub] Chrome AI language detection failed:', e);
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
