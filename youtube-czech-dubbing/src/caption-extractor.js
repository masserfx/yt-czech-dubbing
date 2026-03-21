/**
 * CaptionExtractor - Downloads and manages captions for YouTube videos.
 *
 * Strategy: Get caption track URLs from YouTube player API (via page-script
 * in MAIN world), then download the JSON3 caption data via background.js
 * service worker (which bypasses uBlock Origin blocking). The result is
 * clean, timestamped segments that can be translated and synced with video.
 */
class CaptionExtractor {
  constructor() {
    this.currentVideoId = null;
    this.onCaption = null; // callback: (text) => void
    this._segments = [];        // [{start: seconds, duration: seconds, text: string}]
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
    const tracks = await this._getTrackList();
    return tracks && tracks.length > 0;
  }

  /**
   * Download caption segments via background worker.
   * Returns array of {start: seconds, duration: seconds, text: string}.
   */
  async downloadCaptions() {
    console.log('[CzechDub] Downloading captions...');

    // Get caption tracks from YouTube player API
    const tracks = await this._getTrackList();
    if (!tracks || tracks.length === 0) {
      console.warn('[CzechDub] No caption tracks available');
      return [];
    }

    console.log(`[CzechDub] Found ${tracks.length} caption tracks:`);
    tracks.forEach((t, i) => {
      console.log(`[CzechDub]   ${i}: ${t.languageCode} (${t.kind || 'manual'}) - ${t.name?.simpleText || t.vssId || ''}`);
    });

    // Pick the best track: prefer English manual > English ASR > any
    const track =
      tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr') ||
      tracks.find(t => t.languageCode === 'en') ||
      tracks[0];

    if (!track || !track.baseUrl) {
      console.warn('[CzechDub] No usable caption track found');
      return [];
    }

    console.log(`[CzechDub] Using track: ${track.languageCode} (${track.kind || 'manual'})`);

    // Add JSON3 format parameter to the URL
    let url = track.baseUrl;
    if (!url.includes('fmt=')) {
      url += (url.includes('?') ? '&' : '?') + 'fmt=json3';
    }

    // Fetch via background worker (bypasses uBlock)
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'fetch-captions',
        url: url
      });

      if (response?.success && response.data) {
        const segments = response.data;
        console.log(`[CzechDub] Downloaded ${segments.length} caption segments`);
        if (segments.length > 0) {
          console.log(`[CzechDub] First: "${segments[0].text}" @ ${segments[0].start}s`);
          console.log(`[CzechDub] Last: "${segments[segments.length - 1].text}" @ ${segments[segments.length - 1].start}s`);
        }
        return segments;
      } else {
        console.warn('[CzechDub] Caption fetch failed:', response?.error);
      }
    } catch (e) {
      console.error('[CzechDub] Caption fetch error:', e);
    }

    return [];
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
   * Legacy methods kept for fallback compatibility.
   */
  async enableCzechCaptions() {
    return new Promise((resolve) => {
      const requestId = 'czechdub_enable_' + Date.now();
      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== 'CZECH_DUB_ENABLE_RESULT') return;
        if (event.data?.requestId !== requestId) return;
        window.removeEventListener('message', handler);
        clearTimeout(timeout);
        resolve(event.data.success);
      };
      window.addEventListener('message', handler);
      window.postMessage({ type: 'CZECH_DUB_ENABLE_CAPTIONS', requestId, targetLang: 'cs' }, '*');
      const timeout = setTimeout(() => { window.removeEventListener('message', handler); resolve(false); }, 5000);
    });
  }

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
   * Get caption track list from page-script (MAIN world).
   * Returns tracks with baseUrl for downloading.
   */
  _getTrackList() {
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
