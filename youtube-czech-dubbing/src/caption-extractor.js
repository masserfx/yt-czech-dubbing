/**
 * CaptionExtractor - Reads captions from YouTube's Transcript panel.
 *
 * Strategy: Instead of reading rollup captions from the video player DOM
 * (which causes duplication), we read the Transcript panel which has clean,
 * complete, timestamped segments. We then translate them and synchronize
 * playback with the video's currentTime.
 *
 * Transcript DOM structure:
 *   ytd-transcript-segment-renderer
 *     .segment-start-offset  → timestamp text like "40:11"
 *     .segment-text          → segment text
 */
class CaptionExtractor {
  constructor() {
    this.currentVideoId = null;
    this.onCaption = null; // callback: (text) => void
    this._segments = [];        // [{start: seconds, text: string, translated: string}]
    this._currentIndex = -1;    // index of last spoken segment
    this._syncInterval = null;  // polling interval for time sync
    this._videoElement = null;
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
   * Open YouTube's Transcript panel and read all segments.
   * Returns array of {start: seconds, text: string}.
   */
  async openAndReadTranscript() {
    console.log('[CzechDub] Opening transcript panel...');

    // First check if transcript is already open
    let segments = this._readTranscriptDOM();
    if (segments.length > 0) {
      console.log(`[CzechDub] Transcript already open, found ${segments.length} segments`);
      return segments;
    }

    // Try to open transcript panel via page-script (MAIN world)
    const opened = await this._requestOpenTranscript();
    if (!opened) {
      console.warn('[CzechDub] Could not open transcript panel');
      return [];
    }

    // Wait for transcript segments to render
    for (let i = 0; i < 20; i++) {
      await this._sleep(300);
      segments = this._readTranscriptDOM();
      if (segments.length > 0) {
        console.log(`[CzechDub] Transcript loaded: ${segments.length} segments`);
        return segments;
      }
    }

    console.warn('[CzechDub] Transcript panel opened but no segments found');
    return [];
  }

  /**
   * Read transcript segments from the DOM.
   */
  _readTranscriptDOM() {
    const renderers = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (renderers.length === 0) return [];

    const segments = [];
    renderers.forEach(renderer => {
      const timestampEl = renderer.querySelector('.segment-timestamp');
      const textEl = renderer.querySelector('.segment-text');

      if (!timestampEl || !textEl) return;

      const timestampText = timestampEl.textContent.trim();
      const text = textEl.textContent.trim();

      if (!text || text.length < 1) return;

      const startSeconds = this._parseTimestamp(timestampText);
      segments.push({
        start: startSeconds,
        text: text,
        translated: null
      });
    });

    return segments;
  }

  /**
   * Parse timestamp like "40:11" or "1:02:30" to seconds.
   */
  _parseTimestamp(ts) {
    const parts = ts.split(':').map(p => parseInt(p.trim(), 10));
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parseInt(ts, 10) || 0;
  }

  /**
   * Store translated segments and start time-synced playback.
   * Calls onCaption(text) when video reaches each segment's timestamp.
   */
  startSyncedPlayback(segments, videoElement, callback) {
    this.stopObserving();

    this._segments = segments;
    this._videoElement = videoElement;
    this.onCaption = callback;
    this._currentIndex = -1;

    // Find starting index based on current video time
    const currentTime = videoElement.currentTime || 0;
    this._currentIndex = this._findSegmentIndex(currentTime) - 1;

    console.log(`[CzechDub] Starting synced playback: ${segments.length} segments, starting near index ${this._currentIndex + 1}`);

    // Poll video time every 250ms
    this._syncInterval = setInterval(() => {
      this._syncWithVideo();
    }, 250);
  }

  /**
   * Find the segment index for a given time.
   */
  _findSegmentIndex(time) {
    for (let i = 0; i < this._segments.length; i++) {
      if (this._segments[i].start > time) {
        return Math.max(0, i - 1);
      }
    }
    return this._segments.length - 1;
  }

  /**
   * Check video time and emit the appropriate segment.
   */
  _syncWithVideo() {
    if (!this._videoElement || !this.onCaption) return;
    if (this._videoElement.paused) return;

    const currentTime = this._videoElement.currentTime;
    const targetIndex = this._findSegmentIndex(currentTime);

    // Only emit if we've moved to a new segment
    if (targetIndex > this._currentIndex) {
      this._currentIndex = targetIndex;
      const segment = this._segments[targetIndex];
      if (segment) {
        const textToSpeak = segment.translated || segment.text;
        if (textToSpeak && textToSpeak.length >= 2) {
          console.log(`[CzechDub] Segment ${targetIndex}: "${textToSpeak.substring(0, 80)}" @ ${segment.start}s`);
          this.onCaption(textToSpeak);
        }
      }
    }
  }

  /**
   * Handle video seek — reset current index.
   */
  onSeek() {
    if (this._videoElement) {
      const currentTime = this._videoElement.currentTime;
      this._currentIndex = this._findSegmentIndex(currentTime) - 1;
      console.log(`[CzechDub] Seeked to ${currentTime}s, reset to index ${this._currentIndex + 1}`);
    }
  }

  /**
   * Enable YouTube captions with Czech translation via player API.
   * (Kept for compatibility, but we now prefer transcript-based approach)
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

  // Legacy method kept for compatibility
  startObserving(callback) {
    this.onCaption = callback;
  }

  /**
   * Stop everything.
   */
  stopObserving() {
    if (this._syncInterval) {
      clearInterval(this._syncInterval);
      this._syncInterval = null;
    }
    this.onCaption = null;
    this._segments = [];
    this._currentIndex = -1;
    this._videoElement = null;
  }

  /**
   * Request transcript panel to be opened via page-script (MAIN world).
   */
  _requestOpenTranscript() {
    return new Promise((resolve) => {
      const requestId = 'czechdub_transcript_' + Date.now();

      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== 'CZECH_DUB_TRANSCRIPT_RESULT') return;
        if (event.data?.requestId !== requestId) return;

        window.removeEventListener('message', handler);
        clearTimeout(timeout);
        resolve(event.data.success);
      };
      window.addEventListener('message', handler);

      window.postMessage({
        type: 'CZECH_DUB_OPEN_TRANSCRIPT',
        requestId: requestId
      }, '*');

      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(false);
      }, 5000);
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

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

window.CaptionExtractor = CaptionExtractor;
