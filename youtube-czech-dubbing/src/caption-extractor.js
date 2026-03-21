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

    // Build JSON3 URL — replace existing fmt or add fmt=json3
    let url = track.baseUrl;
    if (url.includes('fmt=')) {
      url = url.replace(/fmt=[^&]+/, 'fmt=json3');
    } else {
      url += (url.includes('?') ? '&' : '?') + 'fmt=json3';
    }

    // Try multiple fetch methods

    // Method 1: Fetch via page-script's ORIGINAL fetch (saved before uBlock patches it)
    // This is the most reliable method — uses the real fetch function
    let segments = await this._fetchCaptionsViaPageScript(url);
    if (segments.length > 0) return segments;

    // Method 2: Also try XML format via page-script
    segments = await this._fetchCaptionsViaPageScript(track.baseUrl);
    if (segments.length > 0) return segments;

    // Method 3: Fetch directly from content script (ISOLATED world)
    segments = await this._fetchCaptionsDirectly(url);
    if (segments.length > 0) return segments;

    // Method 4: Fetch via background service worker
    segments = await this._fetchCaptionsViaBackground(url);
    if (segments.length > 0) return segments;

    console.warn('[CzechDub] All caption fetch methods failed');
    return [];
  }

  /**
   * Fetch captions via page-script's original fetch (saved before uBlock patches it).
   * The page-script runs at document_start and saves window.fetch reference
   * before uBlock's content script runs and replaces it.
   */
  async _fetchCaptionsViaPageScript(url) {
    return new Promise((resolve) => {
      const requestId = 'czechdub_captions_' + Date.now();

      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== 'CZECH_DUB_CAPTIONS_DATA') return;
        if (event.data?.requestId !== requestId) return;

        window.removeEventListener('message', handler);
        clearTimeout(timeout);

        if (event.data.success && event.data.data) {
          const text = event.data.data;
          console.log(`[CzechDub] Page-script fetch: ${text.length} chars, format: ${event.data.format}`);

          let segments = [];
          if (event.data.format === 'json3') {
            segments = this._parseJSON3(text);
          } else {
            segments = this._parseXML(text);
          }
          resolve(segments);
        } else {
          console.warn('[CzechDub] Page-script fetch failed:', event.data.error);
          resolve([]);
        }
      };

      window.addEventListener('message', handler);

      window.postMessage({
        type: 'CZECH_DUB_FETCH_CAPTIONS',
        requestId: requestId,
        url: url
      }, '*');

      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        console.warn('[CzechDub] Page-script fetch timed out');
        resolve([]);
      }, 10000);
    });
  }

  /**
   * Fetch captions directly from content script (ISOLATED world).
   * uBlock can't intercept this because it only patches MAIN world's fetch.
   */
  async _fetchCaptionsDirectly(url) {
    try {
      console.log(`[CzechDub] Direct fetch: ${url.substring(0, 120)}...`);
      const resp = await fetch(url, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      console.log(`[CzechDub] Direct fetch response: ${resp.status} ${resp.statusText}`);

      if (!resp.ok) return [];

      const text = await resp.text();
      console.log(`[CzechDub] Direct fetch body: ${text.length} chars, starts: ${text.substring(0, 100)}`);

      if (!text || text.length < 10) return [];

      // JSON3 format
      if (text.trim().startsWith('{')) {
        return this._parseJSON3(text);
      }

      // XML format (srv3)
      if (text.trim().startsWith('<?xml') || text.trim().startsWith('<transcript') || text.trim().startsWith('<timedtext')) {
        return this._parseXML(text);
      }

      return [];
    } catch (e) {
      console.warn('[CzechDub] Direct fetch failed:', e.message);
      return [];
    }
  }

  /**
   * Fetch captions via background service worker.
   */
  async _fetchCaptionsViaBackground(url) {
    try {
      console.log('[CzechDub] Background worker fetch...');
      const response = await chrome.runtime.sendMessage({
        type: 'fetch-captions',
        url: url
      });

      if (response?.success && response.data && response.data.length > 0) {
        console.log(`[CzechDub] Background worker returned ${response.data.length} segments`);
        return response.data;
      }
      console.warn('[CzechDub] Background worker: no data -', response?.error || 'empty');
    } catch (e) {
      console.warn('[CzechDub] Background worker fetch failed:', e.message);
    }
    return [];
  }

  /**
   * Fetch captions in XML format (default YouTube format without fmt param).
   */
  async _fetchCaptionsXML(url) {
    try {
      console.log('[CzechDub] XML fetch...');
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) return [];

      const text = await resp.text();
      if (!text || text.length < 10) return [];

      return this._parseXML(text);
    } catch (e) {
      console.warn('[CzechDub] XML fetch failed:', e.message);
      return [];
    }
  }

  /**
   * Parse JSON3 caption format.
   */
  _parseJSON3(text) {
    try {
      const data = JSON.parse(text);
      if (!data.events) {
        console.warn('[CzechDub] JSON3: no events. Keys:', Object.keys(data).join(', '));
        return [];
      }

      const segments = data.events
        .filter(event => event.segs && event.segs.length > 0)
        .map(event => ({
          start: (event.tStartMs || 0) / 1000,
          duration: (event.dDurationMs || 0) / 1000,
          text: event.segs.map(s => s.utf8 || '').join('').trim()
        }))
        .filter(seg => seg.text.length > 0);

      console.log(`[CzechDub] Parsed ${segments.length} JSON3 segments`);
      return segments;
    } catch (e) {
      console.warn('[CzechDub] JSON3 parse error:', e.message);
      return [];
    }
  }

  /**
   * Parse XML caption format (srv3 / timedtext).
   */
  _parseXML(text) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      const textElements = doc.querySelectorAll('text');

      const segments = [];
      textElements.forEach(el => {
        const start = parseFloat(el.getAttribute('start') || '0');
        const dur = parseFloat(el.getAttribute('dur') || '0');
        const content = el.textContent.trim()
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"');

        if (content.length > 0) {
          segments.push({ start, duration: dur, text: content });
        }
      });

      console.log(`[CzechDub] Parsed ${segments.length} XML segments`);
      return segments;
    } catch (e) {
      console.warn('[CzechDub] XML parse error:', e.message);
      return [];
    }
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
