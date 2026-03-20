/**
 * CaptionExtractor - Extracts captions/subtitles from YouTube videos.
 * Communicates with page-script.js (running in MAIN world) via postMessage
 * to access YouTube's internal player data.
 */
class CaptionExtractor {
  constructor() {
    this.captions = [];
    this.currentVideoId = null;
  }

  /**
   * Get the current YouTube video ID from the URL.
   */
  getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v');
  }

  /**
   * Extract caption tracks by requesting them from the MAIN world page-script.
   */
  async getCaptionTracks() {
    const videoId = this.getVideoId();
    if (!videoId) return [];

    try {
      // Request tracks from page-script.js running in MAIN world
      const tracks = await this._requestTracksFromPageScript();
      if (tracks && tracks.length > 0) {
        console.log(`[CzechDub] Found ${tracks.length} caption tracks via page script`);
        return tracks;
      }

      // Fallback: re-fetch page HTML and parse caption data
      console.log('[CzechDub] Page script returned no tracks, trying page fetch fallback...');
      return await this._fetchCaptionTracksFromPage(videoId);
    } catch (err) {
      console.warn('[CzechDub] Failed to get caption tracks:', err);
      return [];
    }
  }

  /**
   * Request caption tracks from page-script.js via postMessage.
   */
  _requestTracksFromPageScript() {
    return new Promise((resolve) => {
      const requestId = 'czechdub_' + Date.now() + '_' + Math.random().toString(36).slice(2);

      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== 'CZECH_DUB_CAPTION_TRACKS') return;
        if (event.data?.requestId !== requestId) return;

        window.removeEventListener('message', handler);
        clearTimeout(timeout);
        resolve(event.data.tracks || []);
      };
      window.addEventListener('message', handler);

      // Send request to page-script.js
      window.postMessage({
        type: 'CZECH_DUB_REQUEST_TRACKS',
        requestId: requestId
      }, '*');

      // Timeout after 3 seconds
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        console.warn('[CzechDub] Page script request timed out');
        resolve([]);
      }, 3000);
    });
  }

  /**
   * Fallback: re-fetch the page HTML and parse caption data.
   */
  async _fetchCaptionTracksFromPage(videoId) {
    try {
      const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        credentials: 'include'
      });
      const html = await resp.text();
      console.log(`[CzechDub] Fetched page HTML: ${html.length} chars`);

      // Try to find ytInitialPlayerResponse JSON
      const playerRespMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|const|let|<\/script)/s);
      if (playerRespMatch) {
        try {
          const playerResp = JSON.parse(playerRespMatch[1]);
          const tracks = playerResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (tracks && tracks.length > 0) {
            console.log(`[CzechDub] Found ${tracks.length} tracks from ytInitialPlayerResponse`);
            return tracks;
          }
        } catch (e) {
          console.warn('[CzechDub] Failed to parse ytInitialPlayerResponse:', e.message);
        }
      }

      // Fallback: narrower regex for captions block
      const captionsMatch = html.match(/"captionTracks":\s*(\[.+?\])/s);
      if (captionsMatch) {
        try {
          const tracks = JSON.parse(captionsMatch[1]);
          console.log(`[CzechDub] Found ${tracks.length} tracks from captionTracks regex`);
          return tracks;
        } catch (e) {
          console.warn('[CzechDub] Failed to parse captionTracks:', e.message);
        }
      }

      console.warn('[CzechDub] No caption data found in page HTML');
    } catch (e) {
      console.warn('[CzechDub] Fallback caption fetch failed:', e);
    }
    return [];
  }

  /**
   * Download and parse captions from a track URL.
   * If targetLang is specified, uses YouTube's built-in translation.
   * Retries on 429 (rate limit) with exponential backoff.
   */
  async downloadCaptions(trackUrl, targetLang = null) {
    const url = new URL(trackUrl);
    url.searchParams.set('fmt', 'json3');

    if (targetLang) {
      url.searchParams.set('tlang', targetLang);
    }

    console.log(`[CzechDub] Caption URL: ${url.toString().substring(0, 120)}...`);

    const maxRetries = 3;
    const delays = [2000, 4000, 8000];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = delays[attempt - 1] || 8000;
          console.log(`[CzechDub] Retry ${attempt}/${maxRetries} after ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        }

        console.log(`[CzechDub] Downloading captions (tlang=${targetLang || 'none'}, attempt ${attempt + 1})...`);

        const resp = await fetch(url.toString(), {
          credentials: 'include',
          headers: {
            'Accept': 'application/json'
          }
        });

        console.log(`[CzechDub] Response: status=${resp.status}, type=${resp.headers.get('content-type')}`);

        if (resp.status === 429) {
          console.warn(`[CzechDub] Rate limited (429), will retry...`);
          if (attempt === maxRetries) {
            console.error('[CzechDub] Max retries reached on 429');
            return [];
          }
          continue;
        }

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const text = await resp.text();
        console.log(`[CzechDub] Response body length: ${text.length}, first 200 chars: ${text.substring(0, 200)}`);

        if (!text || text.trim().length === 0) {
          console.warn('[CzechDub] Empty response body');
          if (attempt < maxRetries) continue;
          return [];
        }

        // Check if response is HTML (error page) instead of JSON
        if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
          console.warn('[CzechDub] Got HTML instead of JSON - URL may be expired');
          if (attempt < maxRetries) continue;
          return [];
        }

        const data = JSON.parse(text);
        if (!data.events) {
          console.warn('[CzechDub] JSON parsed but no events found. Keys:', Object.keys(data).join(', '));
          return [];
        }

        console.log(`[CzechDub] Got ${data.events.length} caption events`);

        return data.events
          .filter(event => event.segs && event.segs.length > 0)
          .map(event => ({
            start: (event.tStartMs || 0) / 1000,
            duration: (event.dDurationMs || 0) / 1000,
            text: event.segs.map(s => s.utf8 || '').join('').trim()
          }))
          .filter(caption => caption.text.length > 0);
      } catch (err) {
        console.error(`[CzechDub] Caption download error (attempt ${attempt + 1}):`, err.message);
        if (attempt === maxRetries) return [];
      }
    }
    return [];
  }

  /**
   * Get the best available caption track, translated to Czech.
   * Uses YouTube's built-in &tlang=cs for server-side translation.
   */
  async getBestCaptions() {
    const tracks = await this.getCaptionTracks();
    if (tracks.length === 0) return null;

    console.log(`[CzechDub] Available tracks:`,
      tracks.map(t => `${t.languageCode} (${t.kind || 'manual'})`).join(', '));

    // Check if Czech manual captions exist
    const czechManual = tracks.find(t =>
      t.languageCode === 'cs' && t.kind !== 'asr'
    );

    if (czechManual) {
      console.log('[CzechDub] Using Czech manual captions directly');
      const captions = await this.downloadCaptions(czechManual.baseUrl);
      return {
        captions,
        language: 'cs',
        isAutoGenerated: false,
        isCzech: true,
        trackName: czechManual.name?.simpleText || 'cs'
      };
    }

    // Select best source track for translation
    const enManual = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
    const enAuto = tracks.find(t => t.languageCode === 'en' && t.kind === 'asr');
    const anyManual = tracks.find(t => t.kind !== 'asr');
    const anyAuto = tracks.find(t => t.kind === 'asr');
    const selectedTrack = enManual || enAuto || anyManual || anyAuto || tracks[0];

    console.log(`[CzechDub] Source track: ${selectedTrack.languageCode} (${selectedTrack.kind || 'manual'}), translating to Czech via YouTube...`);

    // Download with YouTube's built-in Czech translation
    const captions = await this.downloadCaptions(selectedTrack.baseUrl, 'cs');

    if (captions.length === 0) {
      console.log('[CzechDub] YouTube translation empty, trying raw captions...');
      const rawCaptions = await this.downloadCaptions(selectedTrack.baseUrl);
      return {
        captions: rawCaptions,
        language: selectedTrack.languageCode,
        isAutoGenerated: selectedTrack.kind === 'asr',
        isCzech: false,
        trackName: selectedTrack.name?.simpleText || selectedTrack.languageCode
      };
    }

    return {
      captions,
      language: selectedTrack.languageCode,
      isAutoGenerated: selectedTrack.kind === 'asr',
      isCzech: true,
      trackName: selectedTrack.name?.simpleText || selectedTrack.languageCode
    };
  }
}

window.CaptionExtractor = CaptionExtractor;
