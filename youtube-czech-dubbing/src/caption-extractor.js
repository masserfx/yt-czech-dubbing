/**
 * CaptionExtractor - Extracts captions/subtitles from YouTube videos.
 * Uses YouTube's internal player data and TimedText API.
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
   * YouTube embeds caption data in the page's ytInitialPlayerResponse.
   */
  async getCaptionTracks() {
    const videoId = this.getVideoId();
    if (!videoId) return [];

    try {
      // Try to get captions from the page's embedded player response
      const playerResponse = this._getPlayerResponse();
      if (playerResponse) {
        const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks && tracks.length > 0) {
          return tracks;
        }
      }

      // Fallback: fetch from the video info endpoint
      return await this._fetchCaptionTracksFromPage(videoId);
    } catch (err) {
      console.warn('[CzechDub] Failed to get caption tracks:', err);
      return [];
    }
  }

  /**
   * Try to extract ytInitialPlayerResponse from the page.
   */
  _getPlayerResponse() {
    try {
      // Access via the YouTube player API
      const player = document.querySelector('#movie_player');
      if (player && player.getPlayerResponse) {
        return player.getPlayerResponse();
      }

      // Try window variable
      if (window.ytInitialPlayerResponse) {
        return window.ytInitialPlayerResponse;
      }
    } catch (e) {
      // Content scripts can't directly access page JS variables
    }

    // Extract from page source via script tags
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent;
        if (text.includes('ytInitialPlayerResponse')) {
          const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
          if (match) {
            return JSON.parse(match[1]);
          }
        }
      }
    } catch (e) {
      console.warn('[CzechDub] Could not parse player response from page');
    }

    return null;
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
      const match = html.match(/"captions":\s*(\{.+?"playerCaptionsTracklistRenderer".+?\})\s*,\s*"/s);
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
