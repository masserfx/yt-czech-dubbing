/**
 * CaptionExtractor - Extracts captions/subtitles from YouTube videos.
 * Uses YouTube's internal player data and TimedText API.
 *
 * Note: Content scripts run in an isolated world and cannot directly access
 * page JavaScript variables. We inject a script into the page's MAIN world
 * to extract player response data.
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
   * Extract caption tracks from YouTube's internal player response.
   * Injects a script into the page context to access YouTube's JS variables.
   */
  async getCaptionTracks() {
    const videoId = this.getVideoId();
    if (!videoId) return [];

    try {
      // Primary method: inject into page context to get player response
      const tracks = await this._getTracksViaPageInjection();
      if (tracks && tracks.length > 0) {
        return tracks;
      }

      // Fallback: re-fetch page HTML and parse caption data
      return await this._fetchCaptionTracksFromPage(videoId);
    } catch (err) {
      console.warn('[CzechDub] Failed to get caption tracks:', err);
      return [];
    }
  }

  /**
   * Inject a script into the page's MAIN world to access YouTube's
   * player response data. Communication happens via postMessage.
   */
  _getTracksViaPageInjection() {
    return new Promise((resolve) => {
      const requestId = 'czechdub_' + Date.now() + '_' + Math.random().toString(36).slice(2);

      // Listen for the response from the injected script
      const handler = (event) => {
        if (event.source !== window) return;
        if (event.data?.type !== 'CZECH_DUB_CAPTION_TRACKS') return;
        if (event.data?.requestId !== requestId) return;

        window.removeEventListener('message', handler);
        resolve(event.data.tracks || []);
      };
      window.addEventListener('message', handler);

      // Inject script into the page's main world
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          var tracks = null;

          // Method 1: Try the player API
          try {
            var player = document.querySelector('#movie_player');
            if (player && typeof player.getPlayerResponse === 'function') {
              var resp = player.getPlayerResponse();
              if (resp && resp.captions && resp.captions.playerCaptionsTracklistRenderer) {
                tracks = resp.captions.playerCaptionsTracklistRenderer.captionTracks || null;
              }
            }
          } catch(e) {}

          // Method 2: Try ytInitialPlayerResponse
          if (!tracks || tracks.length === 0) {
            try {
              if (window.ytInitialPlayerResponse &&
                  window.ytInitialPlayerResponse.captions &&
                  window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer) {
                tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks || null;
              }
            } catch(e) {}
          }

          // Method 3: Try ytplayer.config
          if (!tracks || tracks.length === 0) {
            try {
              if (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args) {
                var playerResponse = JSON.parse(window.ytplayer.config.args.raw_player_response || '{}');
                if (playerResponse.captions && playerResponse.captions.playerCaptionsTracklistRenderer) {
                  tracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks || null;
                }
              }
            } catch(e) {}
          }

          // Method 4: Search through script tags for ytInitialPlayerResponse
          if (!tracks || tracks.length === 0) {
            try {
              var scripts = document.querySelectorAll('script');
              for (var i = 0; i < scripts.length; i++) {
                var text = scripts[i].textContent;
                if (text && text.indexOf('ytInitialPlayerResponse') !== -1) {
                  var match = text.match(/ytInitialPlayerResponse\\s*=\\s*(\\{.+?\\});\\s*var/s);
                  if (!match) {
                    match = text.match(/ytInitialPlayerResponse\\s*=\\s*(\\{.+?\\});/s);
                  }
                  if (match) {
                    var parsed = JSON.parse(match[1]);
                    if (parsed.captions && parsed.captions.playerCaptionsTracklistRenderer) {
                      tracks = parsed.captions.playerCaptionsTracklistRenderer.captionTracks || null;
                      break;
                    }
                  }
                }
              }
            } catch(e) {}
          }

          window.postMessage({
            type: 'CZECH_DUB_CAPTION_TRACKS',
            requestId: '${requestId}',
            tracks: tracks || []
          }, '*');
        })();
      `;
      document.documentElement.appendChild(script);
      script.remove();

      // Timeout after 3 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
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

      // Try multiple regex patterns
      let match = html.match(/"captions":\s*(\{.+?"playerCaptionsTracklistRenderer".+?\})\s*,\s*"/s);
      if (!match) {
        match = html.match(/"captions":\s*(\{.+?"playerCaptionsTracklistRenderer".+?\})\s*,/s);
      }

      if (match) {
        const captionsData = JSON.parse(match[1]);
        return captionsData.playerCaptionsTracklistRenderer?.captionTracks || [];
      }
    } catch (e) {
      console.warn('[CzechDub] Fallback caption fetch failed:', e);
    }
    return [];
  }

  /**
   * Download and parse captions from a track URL.
   * Returns array of {start, duration, text} objects.
   */
  async downloadCaptions(trackUrl) {
    try {
      // Request JSON3 format for structured data
      const url = new URL(trackUrl);
      url.searchParams.set('fmt', 'json3');

      const resp = await fetch(url.toString());
      const data = await resp.json();

      if (!data.events) return [];

      return data.events
        .filter(event => event.segs && event.segs.length > 0)
        .map(event => ({
          start: (event.tStartMs || 0) / 1000,
          duration: (event.dDurationMs || 0) / 1000,
          text: event.segs.map(s => s.utf8 || '').join('').trim()
        }))
        .filter(caption => caption.text.length > 0);
    } catch (err) {
      console.error('[CzechDub] Failed to download captions:', err);
      return [];
    }
  }

  /**
   * Get the best available caption track.
   * Prefers: manual captions > auto-generated > any available
   * Prefers English as source language for better translation quality.
   */
  async getBestCaptions() {
    const tracks = await this.getCaptionTracks();
    if (tracks.length === 0) return null;

    console.log(`[CzechDub] Found ${tracks.length} caption tracks:`,
      tracks.map(t => `${t.languageCode} (${t.kind || 'manual'})`).join(', '));

    // Check if Czech captions already exist
    const czechTrack = tracks.find(t =>
      t.languageCode === 'cs' && !t.kind
    );

    // Prefer English manual captions
    const enManual = tracks.find(t =>
      t.languageCode === 'en' && t.kind !== 'asr'
    );

    // Then English auto-generated
    const enAuto = tracks.find(t =>
      t.languageCode === 'en' && t.kind === 'asr'
    );

    // Then any manual captions
    const anyManual = tracks.find(t => t.kind !== 'asr');

    // Then any auto-generated
    const anyAuto = tracks.find(t => t.kind === 'asr');

    const selectedTrack = czechTrack || enManual || enAuto || anyManual || anyAuto || tracks[0];

    console.log(`[CzechDub] Selected track: ${selectedTrack.languageCode} (${selectedTrack.kind || 'manual'})`);

    const captions = await this.downloadCaptions(selectedTrack.baseUrl);

    return {
      captions,
      language: selectedTrack.languageCode,
      isAutoGenerated: selectedTrack.kind === 'asr',
      isCzech: selectedTrack.languageCode === 'cs',
      trackName: selectedTrack.name?.simpleText || selectedTrack.languageCode
    };
  }
}

// Export for use in other scripts
window.CaptionExtractor = CaptionExtractor;
