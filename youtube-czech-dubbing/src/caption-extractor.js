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
    // iOS: page-script is not injected, so fall back to native <video>.textTracks.
    // The user must have CC enabled in YouTube player for tracks to appear.
    if (typeof window !== 'undefined' && window.__CZECHDUB_FORCE_DOM_CAPTIONS__) {
      const video = document.querySelector('video');
      const tt = video?.textTracks;
      const hasNativeTracks = tt && tt.length > 0;
      console.log(`[CzechDub:iOS] hasCaptions via textTracks: ${hasNativeTracks ? tt.length : 0} tracks`);
      // Even if no textTracks yet, proceed if a <video> element exists — user may enable CC mid-playback.
      // Return true to let startObserving attach listeners.
      return !!video;
    }
    const tracks = await this._requestTracksFromPageScript();
    return tracks && tracks.length > 0;
  }

  /**
   * Enable YouTube captions with Czech translation via player API.
   */
  async enableCaptions(targetLang = 'cs') {
    // iOS Safari: no MAIN-world page-script, user must enable CC manually.
    // Also, origin may be m.youtube.com where www.youtube.com postMessage target is rejected.
    if (typeof window !== 'undefined' && window.__CZECHDUB_FORCE_DOM_CAPTIONS__) {
      console.log(`[CzechDub:iOS] skip enableCaptions — user must enable CC manually in player`);
      return true;
    }
    console.log(`[CzechDub] Enabling ${targetLang} captions via player API...`);

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
        targetLang: targetLang
      }, 'https://www.youtube.com');

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

    // iOS: listen to native <video>.textTracks cuechange events (no MAIN-world access).
    if (typeof window !== 'undefined' && window.__CZECHDUB_FORCE_DOM_CAPTIONS__) {
      this._startNativeTextTrackObserver(callback);
      return;
    }

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
        if (oldText && oldText.length >= 3 && !this._isDuplicate(oldText)) {
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
   * Check if text is a duplicate or prefix of recently emitted text.
   * Handles ASR captions where lines grow word-by-word.
   */
  _isDuplicate(text) {
    if (this._emittedTexts.has(text)) return true;

    // Check if this text is a prefix of a recently emitted line
    // or if a recently emitted line is a prefix of this text
    for (const emitted of this._emittedTexts) {
      // Skip if text is a short prefix of something we already emitted
      if (emitted.startsWith(text) && text.length < emitted.length) return true;
      // Skip if we already emitted a prefix and this is the full version
      // (emit the full version, remove the prefix)
      if (text.startsWith(emitted) && emitted.length < text.length) {
        this._emittedTexts.delete(emitted);
        return false; // Not a duplicate — it's the extended version
      }
    }
    return false;
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
    if (this._nativeTrackListeners) {
      for (const { track, handler } of this._nativeTrackListeners) {
        try { track.removeEventListener('cuechange', handler); } catch (e) {}
      }
      this._nativeTrackListeners = null;
    }
    this.onCaption = null;
    this._visibleLines = new Map();
    this._emittedTexts.clear();
  }

  /**
   * iOS fallback: use native HTMLVideoElement.textTracks.
   * Attaches cuechange listeners to every non-disabled track.
   * Retries attaching while no track is ready yet (YouTube loads them lazily).
   */
  _startNativeTextTrackObserver(callback) {
    this._nativeTrackListeners = [];
    const attach = () => {
      const video = document.querySelector('video');
      if (!video || !video.textTracks || video.textTracks.length === 0) return false;

      let attached = 0;
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (track.kind !== 'subtitles' && track.kind !== 'captions') continue;
        // iOS Safari needs mode = 'hidden' to fire cuechange without rendering the cue.
        if (track.mode === 'disabled') track.mode = 'hidden';
        const handler = () => {
          const cues = track.activeCues;
          if (!cues || cues.length === 0) return;
          const text = Array.from(cues).map(c => c.text || '').join(' ').trim();
          if (!text) return;
          if (this._emittedTexts.has(text)) return;
          this._emittedTexts.add(text);
          // Bound the dedupe set
          if (this._emittedTexts.size > 200) {
            const first = this._emittedTexts.values().next().value;
            this._emittedTexts.delete(first);
          }
          if (this.onCaption) this.onCaption(text);
        };
        track.addEventListener('cuechange', handler);
        this._nativeTrackListeners.push({ track, handler });
        attached++;
      }
      if (attached > 0) {
        console.log(`[CzechDub:iOS] attached cuechange to ${attached} textTracks`);
        return true;
      }
      return false;
    };

    if (attach()) return;

    // Retry: YouTube may add tracks after CC toggle
    console.log('[CzechDub:iOS] no textTracks yet, polling...');
    let attempts = 0;
    this._pollInterval = setInterval(() => {
      if (attach()) {
        clearInterval(this._pollInterval);
        this._pollInterval = null;
        return;
      }
      if (++attempts > 20) {
        clearInterval(this._pollInterval);
        this._pollInterval = null;
        console.warn('[CzechDub:iOS] no textTracks after 10s — falling back to DOM observer');
        this._startDomCaptionFallback(callback);
      }
    }, 500);
  }

  /**
   * iOS DOM fallback: mobile YouTube (m.youtube.com) often doesn't expose <track>
   * elements. Instead captions are rendered in DOM. We probe common selectors and,
   * if none match, install a broad MutationObserver on the player + periodic scan
   * of any element whose class mentions "caption" or "subtitle".
   */
  _startDomCaptionFallback(callback) {
    this.onCaption = callback;
    const probeSelectors = [
      '.caption-visual-line',
      '.ytp-caption-segment',
      '.captions-text',
      '.caption-window'
    ];
    const foundMatches = probeSelectors.map(sel => ({
      sel, n: document.querySelectorAll(sel).length
    })).filter(x => x.n > 0);
    console.log('[CzechDub:iOS] DOM probe:', JSON.stringify(foundMatches));

    const container = document.querySelector('.ytp-caption-window-container')
      || document.querySelector('.caption-window')
      || document.querySelector('#movie_player')
      || document.querySelector('.html5-video-player')
      || document.body;

    // Reuse desktop emit-on-disappear logic: tracks .caption-visual-line elements,
    // emits final text only when a line DISAPPEARS from DOM. Prevents duplicates
    // caused by rolling captions growing word-by-word.
    this._setupObserver(container);
    console.log('[CzechDub:iOS] DOM fallback using desktop emit-on-disappear logic');
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
      const lang = result.detectedLang || 'en';
      console.log(`[CzechDub] Got ${result.segments.length} transcript segments from page (lang: ${lang})`);
      return {
        segments: result.segments,
        sourceLang: lang
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
      }, 'https://www.youtube.com');

      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 5000); // fast timeout — quick XHR test, fall back to DOM mode
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
      }, 'https://www.youtube.com');

      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve([]);
      }, 3000);
    });
  }
}

window.CaptionExtractor = CaptionExtractor;
