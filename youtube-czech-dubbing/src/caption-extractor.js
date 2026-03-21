/**
 * CaptionExtractor - Reads captions from YouTube's video player DOM.
 *
 * Strategy: YouTube shows rolling captions with multiple .caption-visual-line
 * elements visible at once. Each line grows word-by-word, then eventually
 * disappears from the DOM as new lines appear.
 *
 * We track visible lines by reference. When a line DISAPPEARS from the DOM,
 * it's complete — we emit its final text. This guarantees:
 * - No partial words (line is complete when emitted)
 * - No duplicates (each line emitted exactly once on disappear)
 * - Correct ordering (lines emitted in the order they disappear)
 */
class CaptionExtractor {
  constructor() {
    this.currentVideoId = null;
    this.captionObserver = null;
    this.onCaption = null;
    // Track currently visible lines: Map<element, text>
    this._visibleLines = new Map();
    // Track emitted texts to avoid rare duplicates
    this._emittedTexts = new Set();
    this._pollInterval = null;
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
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Start observing YouTube's caption DOM.
   * Uses the "emit on disappear" strategy.
   */
  startObserving(callback) {
    this.stopObserving();

    this.onCaption = callback;
    this._visibleLines = new Map();
    this._emittedTexts.clear();

    const findCaptionContainer = () => {
      const container = document.querySelector('.ytp-caption-window-container')
        || document.querySelector('.caption-window')
        || document.querySelector('#movie_player .captions-text');

      if (container) {
        console.log('[CzechDub] Found caption container');
        this._setupObserver(container);
        return true;
      }
      return false;
    };

    if (!findCaptionContainer()) {
      console.log('[CzechDub] Caption container not found yet, watching...');

      const playerContainer = document.querySelector('#movie_player')
        || document.querySelector('.html5-video-player')
        || document.body;

      this.captionObserver = new MutationObserver(() => {
        findCaptionContainer();
      });

      this.captionObserver.observe(playerContainer, {
        childList: true,
        subtree: true
      });

      this._pollInterval = setInterval(() => {
        this._checkLines();
      }, 300);
    }
  }

  /**
   * Set up MutationObserver on the caption container.
   */
  _setupObserver(container) {
    if (this.captionObserver) {
      this.captionObserver.disconnect();
    }

    this.captionObserver = new MutationObserver(() => {
      this._checkLines();
    });

    this.captionObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    });

    if (this._pollInterval) clearInterval(this._pollInterval);
    this._pollInterval = setInterval(() => {
      this._checkLines();
    }, 300);

    console.log('[CzechDub] Caption observer started (emit-on-disappear mode)');
  }

  /**
   * Core logic: track visible caption lines.
   * When a line disappears from DOM, emit its text.
   */
  _checkLines() {
    // Get all currently visible caption visual lines
    const currentLineElements = document.querySelectorAll('.caption-visual-line');

    // Build a set of currently visible elements
    const currentSet = new Set();
    const currentTexts = new Map();

    currentLineElements.forEach(el => {
      currentSet.add(el);
      // Read text from segments within this line
      const segments = el.querySelectorAll('.ytp-caption-segment');
      let text = '';
      segments.forEach(seg => {
        const t = seg.textContent.trim();
        if (t) text += (text ? ' ' : '') + t;
      });
      text = this._cleanText(text);
      if (text) {
        currentTexts.set(el, text);
      }
    });

    // Check which previously visible lines have DISAPPEARED
    for (const [el, oldText] of this._visibleLines) {
      if (!currentSet.has(el)) {
        // This line disappeared — emit its last known text
        if (oldText && oldText.length >= 3 && !this._emittedTexts.has(oldText)) {
          this._emittedTexts.add(oldText);
          this._emitCaption(oldText);

          // Keep emitted set bounded
          if (this._emittedTexts.size > 50) {
            const first = this._emittedTexts.values().next().value;
            this._emittedTexts.delete(first);
          }
        }
      }
    }

    // Update visible lines with current state
    // Always update text for existing lines (they grow word-by-word)
    this._visibleLines = currentTexts;
  }

  /**
   * Clean caption text — remove YouTube UI artifacts.
   */
  _cleanText(text) {
    if (!text) return '';
    text = text.replace(/\s*(Angličtina|Čeština|English)\s*\(.*?\)\s*>>\s*\S+/g, '').trim();
    text = text.replace(/\s*Nastavení\s+můž.*/g, '').trim();
    return text;
  }

  /**
   * Emit a caption to the callback.
   */
  _emitCaption(text) {
    if (!text || text.length < 3) return;
    console.log(`[CzechDub] Caption: "${text.substring(0, 100)}"`);
    if (this.onCaption) {
      this.onCaption(text);
    }
  }

  /**
   * Stop observing.
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
    this._visibleLines = new Map();
    this._emittedTexts.clear();
  }

  /**
   * Handle video seek — clear tracking state.
   */
  onSeek() {
    this._visibleLines = new Map();
    this._emittedTexts.clear();
  }

  /**
   * Fetch the full transcript (all segments with timestamps) from the page-script.
   * Returns an array of {start, duration, text} or null on failure.
   */
  /**
   * Fetch full transcript. Strategy:
   * 1. Ask page-script for transcript params from ytInitialData (no network call)
   * 2. If params found, send to background.js for /get_transcript call
   * 3. If no params, send videoId to background.js for full HTML-based extraction
   */
  async fetchFullTranscript() {
    const videoId = this.getVideoId();
    if (!videoId) return null;

    console.log(`[CzechDub] Fetching transcript for video: ${videoId}`);

    // Ask page-script to extract params from ytInitialData and call /get_transcript
    // This runs in MAIN world (page context) with full YouTube cookies
    const result = await this._getTranscriptFromPage();

    if (result?.success && result.segments?.length > 0) {
      console.log(`[CzechDub] Got ${result.segments.length} transcript segments from page`);
      return {
        segments: result.segments,
        sourceLang: 'en'
      };
    }

    console.warn('[CzechDub] Transcript from page failed:', result?.error || 'no segments');
    return null;
  }

  /**
   * Ask page-script to fetch transcript directly from YouTube (has cookies).
   */
  _getTranscriptFromPage() {
    return new Promise((resolve) => {
      const requestId = 'czechdub_params_' + Date.now();

      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== 'CZECH_DUB_TRANSCRIPT_PARAMS') return;
        if (event.data?.requestId !== requestId) return;

        window.removeEventListener('message', handler);
        clearTimeout(timeout);
        resolve(event.data);
      };
      window.addEventListener('message', handler);

      window.postMessage({
        type: 'CZECH_DUB_GET_TRANSCRIPT_PARAMS',
        requestId: requestId
      }, '*');

      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 15000); // longer timeout — page-script needs to call /get_transcript
    });
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
