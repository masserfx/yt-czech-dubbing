/**
 * Page Script - Runs in YouTube's MAIN world (has access to page JS variables).
 * Communicates with the content script via window.postMessage.
 * Declared with "world": "MAIN" in manifest.json to bypass CSP restrictions.
 */
(function () {
  'use strict';

  // Listen for caption track requests from the content script
  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (event.data?.type !== 'CZECH_DUB_REQUEST_TRACKS') return;

    var requestId = event.data.requestId;
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
    } catch (e) {
      console.warn('[CzechDub:PageScript] Player API failed:', e);
    }

    // Method 2: Try ytInitialPlayerResponse
    if (!tracks || tracks.length === 0) {
      try {
        if (window.ytInitialPlayerResponse &&
          window.ytInitialPlayerResponse.captions &&
          window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer) {
          tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks || null;
        }
      } catch (e) {}
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
      } catch (e) {}
    }

    // Method 4: Parse script tags
    if (!tracks || tracks.length === 0) {
      try {
        var scripts = document.querySelectorAll('script');
        for (var i = 0; i < scripts.length; i++) {
          var text = scripts[i].textContent;
          if (text && text.indexOf('ytInitialPlayerResponse') !== -1) {
            var match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*var/s);
            if (!match) {
              match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
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
      } catch (e) {}
    }

    console.log('[CzechDub:PageScript] Found tracks:', tracks ? tracks.length : 0);

    window.postMessage({
      type: 'CZECH_DUB_CAPTION_TRACKS',
      requestId: requestId,
      tracks: tracks || []
    }, '*');
  });

  console.log('[CzechDub:PageScript] MAIN world script loaded');
})();
