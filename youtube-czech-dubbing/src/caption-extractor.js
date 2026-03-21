/**
 * CaptionExtractor - Extracts captions from YouTube videos.
 *
 * Strategy: Instead of downloading caption files (blocked by uBlock Origin),
 * we enable YouTube's built-in captions/translation via the player API
 * and read caption text directly from the DOM using MutationObserver.
 *
 * Deduplication: YouTube shows rollup captions where text grows word-by-word.
 * We wait for a complete line change (stable text that differs from previous)
 * and only emit text that hasn't been spoken yet.
 */
class CaptionExtractor {
  constructor() {
    this.currentVideoId = null;
    this.captionObserver = null;
    this.onCaption = null; // callback: (text) => void
    this._lastRawText = '';
    this._lastEmittedText = '';
    this._currentLineText = '';
    this._stableText = '';       // text that stopped changing
    this._stableCount = 0;       // how many checks text stayed the same
    this._lineStartTime = 0;
    this._debounceTimer = null;
    this._maxWaitTimer = null;
  }

  getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v');
  }

  /**
   * Check if captions are available for this video.
   */
  async hasCaptions() {
    const tracks = await this._requestTracksFromPageScript();
    return tracks && tracks.length > 0;
  }

  /**
   * Enable YouTube captions with Czech translation via player API.
   * Returns true if captions were enabled successfully.
   */
  async enableCzechCaptions() {
    console.log('[CzechDub] Enabling Czech captions via player API...');

    return new Promise((resolve) => {
      const requestId = 'czechdub_enable_' + Date.now();

      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== 'CZECH_DUB_ENABLE_RESULT') return;
        if (event.data?.requestId !== requestId) return;

        window.removeEventListener('message', handler);
        clearTimeout(timeout);

        console.log(`[CzechDub] Enable captions result: ${event.data.success} - ${event.data.message}`);
        resolve(event.data.success);
      };
      window.addEventListener('message', handler);

      window.postMessage({
        type: 'CZECH_DUB_ENABLE_CAPTIONS',
        requestId: requestId,
        targetLang: 'cs'
      }, '*');

      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        console.warn('[CzechDub] Enable captions timed out');
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Start observing YouTube's caption DOM for text changes.
   * Calls onCaption(text) whenever a new caption appears.
   */
  startObserving(callback) {
    // Stop any existing observer first (but don't clear the new callback)
    this.stopObserving();

    this.onCaption = callback;
    this._lastRawText = '';

    // YouTube renders captions in .ytp-caption-window-container
    // The actual text is in .ytp-caption-segment elements
    const findCaptionContainer = () => {
      // Try multiple possible selectors
      const container = document.querySelector('.ytp-caption-window-container')
        || document.querySelector('.caption-window')
        || document.querySelector('#movie_player .captions-text');

      if (container) {
        console.log('[CzechDub] Found caption container:', container.className);
        this._setupObserver(container);
        return true;
      }
      return false;
    };

    // Caption container might not exist yet — watch for it
    if (!findCaptionContainer()) {
      console.log('[CzechDub] Caption container not found yet, watching for it...');

      const playerContainer = document.querySelector('#movie_player')
        || document.querySelector('.html5-video-player')
        || document.body;

      this.captionObserver = new MutationObserver((mutations) => {
        if (findCaptionContainer()) {
          // Found it — the _setupObserver call above replaces this observer
        }
      });

      this.captionObserver.observe(playerContainer, {
        childList: true,
        subtree: true
      });

      // Also set up a polling fallback
      this._pollInterval = setInterval(() => {
        this._checkCaptionText();
      }, 200);
    }
  }

  /**
   * Set up MutationObserver on the caption container.
   */
  _setupObserver(container) {
    // Disconnect any existing observer
    if (this.captionObserver) {
      this.captionObserver.disconnect();
    }

    this.captionObserver = new MutationObserver(() => {
      this._checkCaptionText();
    });

    this.captionObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style']
    });

    // Also poll as backup (some caption changes might not trigger mutations)
    if (this._pollInterval) clearInterval(this._pollInterval);
    this._pollInterval = setInterval(() => {
      this._checkCaptionText();
    }, 200);

    console.log('[CzechDub] Caption observer started');
  }

  /**
   * Check for new caption text in the DOM.
   *
   * Strategy: YouTube captions grow word-by-word (rollup). We wait for
   * the text to stabilize (same text for 2+ checks = ~400ms) before
   * emitting. When a completely new line appears, we emit the previous
   * stable line. We deduplicate by removing any overlap with the
   * previously emitted text.
   */
  _checkCaptionText() {
    const segments = document.querySelectorAll('.ytp-caption-segment');
    if (segments.length === 0) return;

    let fullText = '';
    segments.forEach(seg => {
      const t = seg.textContent.trim();
      if (t) fullText += (fullText ? ' ' : '') + t;
    });

    if (!fullText || fullText.length === 0) return;

    // Filter out YouTube UI text
    fullText = fullText.replace(/\s*(Angličtina|Čeština|English)\s*\(.*?\)\s*>>\s*\S+/g, '').trim();
    fullText = fullText.replace(/\s*Nastavení\s+můž.*/g, '').trim();

    if (!fullText || fullText.length < 3) return;

    // Same as last check — text is stable
    if (fullText === this._lastRawText) {
      this._stableCount++;
      // After 2 stable checks (~400ms), emit if not yet emitted
      if (this._stableCount === 2 && this._currentLineText && this._currentLineText !== this._lastEmittedText) {
        this._emitDeduped(this._currentLineText);
      }
      return;
    }

    const prevText = this._lastRawText;
    this._lastRawText = fullText;
    this._stableCount = 0;

    // Detect if this is a NEW line vs text growing on the same line
    const isNewLine = prevText && !fullText.startsWith(prevText.substring(0, Math.min(15, prevText.length)));

    if (isNewLine) {
      // Previous line is complete — emit it if not yet emitted
      if (this._currentLineText && this._currentLineText !== this._lastEmittedText) {
        this._emitDeduped(this._currentLineText);
      }
      // Start tracking the new line
      this._currentLineText = fullText;
      this._lineStartTime = Date.now();

      // Max wait: emit after 4s even if text keeps changing
      clearTimeout(this._maxWaitTimer);
      this._maxWaitTimer = setTimeout(() => {
        if (this._currentLineText && this._currentLineText !== this._lastEmittedText) {
          this._emitDeduped(this._currentLineText);
        }
      }, 4000);
    } else {
      // Text is growing on the same line
      this._currentLineText = fullText;

      // If accumulating for 5+ seconds, emit what we have
      if (this._lineStartTime && (Date.now() - this._lineStartTime) > 5000) {
        if (this._currentLineText !== this._lastEmittedText) {
          this._emitDeduped(this._currentLineText);
          this._lineStartTime = Date.now();
        }
      }
    }
  }

  /**
   * Emit caption text, removing any overlap with the previously emitted text.
   * This prevents Zuzana from repeating phrases that were already spoken.
   */
  _emitDeduped(text) {
    if (!text || text.length < 3) return;

    let newText = text;

    // If we have a previous emission, find and remove overlap
    if (this._lastEmittedText) {
      const overlap = this._findOverlap(this._lastEmittedText, text);
      if (overlap.length > 5) {
        // Remove the overlapping prefix from the new text
        newText = text.substring(overlap.length).trim();
      }
    }

    // Don't emit very short remnants (likely just partial words)
    if (!newText || newText.length < 3) return;

    this._emitCaption(newText);
  }

  /**
   * Find the longest suffix of `prev` that is a prefix of `current`.
   * Returns the overlapping portion.
   */
  _findOverlap(prev, current) {
    const prevWords = prev.split(/\s+/);
    const currentWords = current.split(/\s+/);

    // Try progressively shorter suffixes of prev as prefix of current
    for (let start = 0; start < prevWords.length; start++) {
      const suffix = prevWords.slice(start).join(' ');
      if (current.startsWith(suffix) && suffix.length > 5) {
        return suffix;
      }
    }

    // Also try: does current start with any tail portion of prev?
    // Word-level matching for partial overlaps
    for (let i = 1; i < Math.min(prevWords.length, currentWords.length); i++) {
      const prevTail = prevWords.slice(-i).join(' ');
      const currentHead = currentWords.slice(0, i).join(' ');
      if (prevTail === currentHead && prevTail.length > 5) {
        return prevTail;
      }
    }

    return '';
  }

  /**
   * Emit a finalized caption to the callback.
   */
  _emitCaption(text) {
    if (!text || text.length < 3) return;
    this._lastEmittedText = text;
    console.log(`[CzechDub] Caption ready: "${text.substring(0, 100)}"`);
    if (this.onCaption) {
      this.onCaption(text);
    }
  }

  /**
   * Stop observing captions.
   */
  stopObserving() {
    if (this.captionObserver) {
      this.captionObserver.disconnect();
      this.captionObserver = null;
    }
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    this.onCaption = null;
    this._lastRawText = '';
    this._lastEmittedText = '';
    this._currentLineText = '';
    this._stableText = '';
    this._stableCount = 0;
    this._lineStartTime = 0;
    clearTimeout(this._debounceTimer);
    clearTimeout(this._maxWaitTimer);
  }

  /**
   * Request caption track list from page-script.
   */
  _requestTracksFromPageScript() {
    return new Promise((resolve) => {
      const requestId = 'czechdub_tracks_' + Date.now();

      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== 'CZECH_DUB_CAPTION_TRACKS') return;
        if (event.data?.requestId !== requestId) return;

        window.removeEventListener('message', handler);
        clearTimeout(timeout);
        resolve(event.data.tracks || []);
      };
      window.addEventListener('message', handler);

      window.postMessage({
        type: 'CZECH_DUB_REQUEST_TRACKS',
        requestId: requestId
      }, '*');

      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve([]);
      }, 3000);
    });
  }
}

window.CaptionExtractor = CaptionExtractor;
