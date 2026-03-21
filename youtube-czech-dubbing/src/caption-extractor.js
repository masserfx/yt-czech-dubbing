/**
 * CaptionExtractor - Extracts captions from YouTube videos.
 *
 * Strategy: Instead of downloading caption files (blocked by uBlock Origin),
 * we enable YouTube's built-in captions/translation via the player API
 * and read caption text directly from the DOM using MutationObserver.
 *
 * Deduplication: YouTube shows captions in "rollup" mode — multiple visual
 * lines are visible simultaneously. New lines appear at the bottom, old ones
 * scroll up and disappear. We track individual visual lines and only emit
 * each unique line ONCE, when it first appears as a new bottom line.
 */
class CaptionExtractor {
  constructor() {
    this.currentVideoId = null;
    this.captionObserver = null;
    this.onCaption = null; // callback: (text) => void
    // Track emitted lines to avoid duplicates
    this._emittedLines = new Set();
    // Track the last few raw line snapshots to detect stability
    this._lastSnapshot = '';
    this._stableCount = 0;
    this._pendingLine = null;    // line waiting to be emitted after stabilizing
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
    this._lastSnapshot = '';

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
   * YouTube caption DOM structure:
   *   .ytp-caption-window-container
   *     .caption-window
   *       .captions-text
   *         .caption-visual-line   ← Line 1 (older, scrolling up)
   *           .ytp-caption-segment
   *         .caption-visual-line   ← Line 2 (newest, just appeared)
   *           .ytp-caption-segment
   *
   * Strategy: Read individual visual lines. Only emit NEW lines that
   * haven't been spoken yet. Each line grows word-by-word (rollup),
   * so we wait for a line to stabilize before emitting.
   */
  _checkCaptionText() {
    // Read individual visual lines, not all segments combined
    const visualLines = document.querySelectorAll('.caption-visual-line');

    // Fallback: if no visual lines found, try reading segments directly
    let lines = [];
    if (visualLines.length > 0) {
      visualLines.forEach(line => {
        const segments = line.querySelectorAll('.ytp-caption-segment');
        let lineText = '';
        segments.forEach(seg => {
          const t = seg.textContent.trim();
          if (t) lineText += (lineText ? ' ' : '') + t;
        });
        lineText = this._cleanText(lineText);
        if (lineText && lineText.length >= 3) {
          lines.push(lineText);
        }
      });
    } else {
      // Fallback: read all segments as one line
      const segments = document.querySelectorAll('.ytp-caption-segment');
      let lineText = '';
      segments.forEach(seg => {
        const t = seg.textContent.trim();
        if (t) lineText += (lineText ? ' ' : '') + t;
      });
      lineText = this._cleanText(lineText);
      if (lineText && lineText.length >= 3) {
        lines.push(lineText);
      }
    }

    if (lines.length === 0) return;

    // Create a snapshot of current state to detect changes
    const snapshot = lines.join('|||');
    if (snapshot === this._lastSnapshot) {
      this._stableCount++;
      // After 3 stable checks (~600ms), emit pending line
      if (this._stableCount === 3 && this._pendingLine) {
        this._emitNewLine(this._pendingLine);
        this._pendingLine = null;
      }
      return;
    }

    this._lastSnapshot = snapshot;
    this._stableCount = 0;

    // Find the LAST (bottom/newest) visual line — that's the one growing
    const bottomLine = lines[lines.length - 1];

    // Check if this bottom line is new (not yet emitted)
    if (bottomLine && !this._isAlreadyEmitted(bottomLine)) {
      // Set as pending — will emit after it stabilizes
      this._pendingLine = bottomLine;

      // Max wait: emit after 4s even if still growing
      clearTimeout(this._maxWaitTimer);
      this._maxWaitTimer = setTimeout(() => {
        if (this._pendingLine) {
          this._emitNewLine(this._pendingLine);
          this._pendingLine = null;
        }
      }, 4000);
    }
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
   * Check if a line has already been emitted (or is very similar to one).
   */
  _isAlreadyEmitted(lineText) {
    // Exact match
    if (this._emittedLines.has(lineText)) return true;

    // Check if this line is a substring of, or contains, an already emitted line
    // This handles word-by-word growth: "Hello" → "Hello world" → "Hello world today"
    for (const emitted of this._emittedLines) {
      // If the emitted line starts with this text (this is a shorter version)
      if (emitted.startsWith(lineText)) return true;
      // If this text starts with emitted (emitted was a prefix — this grew)
      // Don't mark as emitted, we want to emit the longer version
    }

    return false;
  }

  /**
   * Emit a new unique line to the callback.
   */
  _emitNewLine(lineText) {
    if (!lineText || lineText.length < 3) return;
    if (this._isAlreadyEmitted(lineText)) return;

    // Add to emitted set (keep last 20 to prevent memory growth)
    this._emittedLines.add(lineText);
    if (this._emittedLines.size > 20) {
      const first = this._emittedLines.values().next().value;
      this._emittedLines.delete(first);
    }

    this._emitCaption(lineText);
  }

  /**
   * Emit a finalized caption to the callback.
   */
  _emitCaption(text) {
    if (!text || text.length < 3) return;
    console.log(`[CzechDub] Caption: "${text.substring(0, 100)}"`);
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
    this._emittedLines.clear();
    this._lastSnapshot = '';
    this._stableCount = 0;
    this._pendingLine = null;
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
