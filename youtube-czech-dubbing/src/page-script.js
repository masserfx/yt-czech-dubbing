/**
 * Page Script - Runs in YouTube's MAIN world (has access to page JS variables).
 * Communicates with the content script via window.postMessage.
 * Declared with "world": "MAIN" in manifest.json.
 *
 * Handles:
 * 1. Extracting caption track info from YouTube player
 * 2. Enabling captions and setting translation language via player API
 * 3. Reading captions from DOM (bypasses uBlock/CSP network blocking)
 */
(function () {
  'use strict';

  // CRITICAL: Save reference to original fetch BEFORE uBlock patches it.
  // This script runs at document_start, before any other content scripts.
  var _originalFetch = window.fetch.bind(window);

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;

    if (event.data?.type === 'CZECH_DUB_REQUEST_TRACKS') {
      handleTrackRequest(event.data.requestId);
    }

    if (event.data?.type === 'CZECH_DUB_ENABLE_CAPTIONS') {
      handleEnableCaptions(event.data.requestId, event.data.targetLang);
    }

    if (event.data?.type === 'CZECH_DUB_GET_PLAYER_TIME') {
      var player = document.querySelector('#movie_player');
      var time = player && typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : -1;
      window.postMessage({
        type: 'CZECH_DUB_PLAYER_TIME',
        requestId: event.data.requestId,
        time: time
      }, '*');
    }

    if (event.data?.type === 'CZECH_DUB_OPEN_TRANSCRIPT') {
      handleOpenTranscript(event.data.requestId);
    }

    if (event.data?.type === 'CZECH_DUB_DISABLE_CAPTIONS') {
      handleDisableCaptions();
    }

    if (event.data?.type === 'CZECH_DUB_FETCH_CAPTIONS') {
      handleFetchCaptions(event.data.requestId, event.data.url);
    }

    if (event.data?.type === 'CZECH_DUB_GET_TRANSCRIPT_PARAMS') {
      handleGetTranscriptParams(event.data.requestId);
    }

  });

  /**
   * Extract transcript params from ytInitialData (available in MAIN world).
   * No network call needed — data is already on the page.
   */
  function handleGetTranscriptParams(requestId) {
    console.log('[CzechDub:PageScript] Extracting transcript params from page data...');

    var params = null;

    // Try ytInitialData engagement panels
    try {
      var panels = window.ytInitialData?.engagementPanels;
      if (panels) {
        console.log('[CzechDub:PageScript] Found ' + panels.length + ' engagement panels');
        for (var i = 0; i < panels.length; i++) {
          var panel = panels[i];
          var panelId = panel?.engagementPanelSectionListRenderer?.panelIdentifier;
          console.log('[CzechDub:PageScript]   Panel: ' + panelId);

          if (panelId === 'engagement-panel-searchable-transcript') {
            // Deep search for getTranscriptEndpoint.params
            var found = _findDeepKey(panel, 'serializedShareEntity');
            // Try multiple possible locations for params
            params = _findDeepValue(panel, 'getTranscriptEndpoint', 'params');
            if (params) {
              console.log('[CzechDub:PageScript] Found transcript params in engagement panel');
              break;
            }
          }
        }
      } else {
        console.log('[CzechDub:PageScript] No engagementPanels in ytInitialData');
      }
    } catch (e) {
      console.warn('[CzechDub:PageScript] Error searching ytInitialData:', e);
    }

    // Also try to get caption tracks baseUrl for fallback
    var captionTracks = null;
    try {
      var player = document.querySelector('#movie_player');
      if (player && typeof player.getPlayerResponse === 'function') {
        var resp = player.getPlayerResponse();
        captionTracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      }
    } catch (e) {}

    if (!captionTracks) {
      try {
        captionTracks = window.ytInitialPlayerResponse
          ?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      } catch (e) {}
    }

    // Extract useful track info
    var trackInfo = null;
    if (captionTracks && captionTracks.length > 0) {
      var track = captionTracks.find(function(t) { return t.languageCode === 'en' && t.kind !== 'asr'; })
        || captionTracks.find(function(t) { return t.languageCode === 'en'; })
        || captionTracks[0];
      trackInfo = {
        baseUrl: track.baseUrl,
        lang: track.languageCode,
        kind: track.kind
      };
    }

    window.postMessage({
      type: 'CZECH_DUB_TRANSCRIPT_PARAMS',
      requestId: requestId,
      params: params,
      trackInfo: trackInfo
    }, '*');
  }

  function _findDeepValue(obj, key, subKey, maxDepth) {
    if (maxDepth === undefined) maxDepth = 15;
    if (!obj || typeof obj !== 'object' || maxDepth <= 0) return null;

    if (obj[key] !== undefined) {
      return subKey ? obj[key][subKey] : obj[key];
    }

    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var result = _findDeepValue(obj[keys[i]], key, subKey, maxDepth - 1);
      if (result !== null && result !== undefined) return result;
    }
    return null;
  }

  function _findDeepKey(obj, key, maxDepth) {
    if (maxDepth === undefined) maxDepth = 15;
    if (!obj || typeof obj !== 'object' || maxDepth <= 0) return null;
    if (obj[key] !== undefined) return obj;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var result = _findDeepKey(obj[keys[i]], key, maxDepth - 1);
      if (result) return result;
    }
    return null;
  }

  /**
   * Handle caption track list request.
   */
  function handleTrackRequest(requestId) {
    var tracks = null;

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

    if (!tracks || tracks.length === 0) {
      try {
        if (window.ytInitialPlayerResponse &&
          window.ytInitialPlayerResponse.captions &&
          window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer) {
          tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks || null;
        }
      } catch (e) {}
    }

    if (!tracks || tracks.length === 0) {
      try {
        var scripts = document.querySelectorAll('script');
        for (var i = 0; i < scripts.length; i++) {
          var text = scripts[i].textContent;
          if (text && text.indexOf('captionTracks') !== -1) {
            var match = text.match(/"captionTracks":\s*(\[.+?\])/s);
            if (match) {
              tracks = JSON.parse(match[1]);
              break;
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
  }

  /**
   * Enable captions on the YouTube player and optionally set translation language.
   * This makes YouTube render captions in the DOM which we can then read.
   */
  function handleEnableCaptions(requestId, targetLang) {
    console.log('[CzechDub:PageScript] Enabling captions, targetLang:', targetLang);

    try {
      var player = document.querySelector('#movie_player');
      if (!player) {
        sendResponse(requestId, false, 'No player found');
        return;
      }

      // Enable captions if not already on
      if (typeof player.getOption === 'function' && typeof player.setOption === 'function') {
        // Get current caption track list
        var trackList = player.getOption('captions', 'tracklist');
        console.log('[CzechDub:PageScript] Track list:', JSON.stringify(trackList)?.substring(0, 300));

        // Find a good source track (prefer English manual)
        var sourceTrack = null;
        if (trackList && trackList.length > 0) {
          sourceTrack = trackList.find(function(t) { return t.languageCode === 'cs' && t.kind !== 'asr'; })
            || trackList.find(function(t) { return t.languageCode === 'en' && t.kind !== 'asr'; })
            || trackList.find(function(t) { return t.languageCode === 'en'; })
            || trackList[0];
        }

        if (sourceTrack) {
          console.log('[CzechDub:PageScript] Setting caption track:', sourceTrack.languageCode);

          // Set the active caption track
          player.setOption('captions', 'track', {
            languageCode: sourceTrack.languageCode,
            kind: sourceTrack.kind || ''
          });

          // If source is not Czech, set translation to Czech
          if (targetLang && sourceTrack.languageCode !== targetLang) {
            console.log('[CzechDub:PageScript] Setting translation to:', targetLang);
            player.setOption('captions', 'translationLanguage', {
              languageCode: targetLang
            });
          }
        }

        // Make sure captions are visible
        if (typeof player.toggleSubtitles === 'function') {
          // Check if subtitles are currently on
          var isCaptionOn = player.getOption('captions', 'track');
          if (!isCaptionOn || !isCaptionOn.languageCode) {
            player.toggleSubtitles();
          }
        }

        // Alternatively, try unloadModule/loadModule for captions
        if (typeof player.loadModule === 'function') {
          player.loadModule('captions');
        }

        sendResponse(requestId, true, 'Captions enabled');
      } else {
        // Fallback: click the CC button
        var ccButton = document.querySelector('.ytp-subtitles-button');
        if (ccButton) {
          var isOn = ccButton.getAttribute('aria-pressed') === 'true';
          if (!isOn) {
            ccButton.click();
            console.log('[CzechDub:PageScript] Clicked CC button');
          }
          sendResponse(requestId, true, 'Captions enabled via CC button');
        } else {
          sendResponse(requestId, false, 'No caption controls found');
        }
      }
    } catch (e) {
      console.error('[CzechDub:PageScript] Enable captions error:', e);
      sendResponse(requestId, false, e.message);
    }
  }

  function sendResponse(requestId, success, message) {
    window.postMessage({
      type: 'CZECH_DUB_ENABLE_RESULT',
      requestId: requestId,
      success: success,
      message: message
    }, '*');
  }

  /**
   * Open the Transcript panel programmatically.
   * Clicks the "Show transcript" button in the video description area.
   */
  function handleOpenTranscript(requestId) {
    console.log('[CzechDub:PageScript] Opening transcript panel...');

    try {
      // Check if transcript panel is already open
      var existingPanel = document.querySelector('ytd-transcript-renderer');
      if (existingPanel) {
        console.log('[CzechDub:PageScript] Transcript panel already open');
        window.postMessage({
          type: 'CZECH_DUB_TRANSCRIPT_RESULT',
          requestId: requestId,
          success: true
        }, '*');
        return;
      }

      // Method 1: Click the "Show transcript" button in the engagement panels
      var transcriptButton = null;

      // Look for the transcript button in the description/engagement area
      var buttons = document.querySelectorAll('button, ytd-button-renderer');
      for (var i = 0; i < buttons.length; i++) {
        var btnText = buttons[i].textContent.toLowerCase().trim();
        if (btnText.includes('transcript') || btnText.includes('přepis') || btnText.includes('zobrazit přepis')) {
          transcriptButton = buttons[i];
          break;
        }
      }

      // Method 2: Try the three-dot menu → "Show transcript"
      if (!transcriptButton) {
        // Click the "..." menu button under the video
        var menuButton = document.querySelector('#button-shape > button[aria-label]') ||
                         document.querySelector('ytd-menu-renderer yt-icon-button') ||
                         document.querySelector('#top-level-buttons-computed + ytd-menu-renderer button');

        if (menuButton) {
          menuButton.click();
          console.log('[CzechDub:PageScript] Clicked menu button, waiting for transcript option...');

          // Wait for menu to render then click "Show transcript"
          setTimeout(function() {
            var menuItems = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item');
            for (var j = 0; j < menuItems.length; j++) {
              var itemText = menuItems[j].textContent.toLowerCase().trim();
              if (itemText.includes('transcript') || itemText.includes('přepis')) {
                menuItems[j].click();
                console.log('[CzechDub:PageScript] Clicked transcript menu item');

                window.postMessage({
                  type: 'CZECH_DUB_TRANSCRIPT_RESULT',
                  requestId: requestId,
                  success: true
                }, '*');
                return;
              }
            }

            // Close menu if transcript not found
            document.body.click();
            console.warn('[CzechDub:PageScript] Transcript option not found in menu');
            window.postMessage({
              type: 'CZECH_DUB_TRANSCRIPT_RESULT',
              requestId: requestId,
              success: false
            }, '*');
          }, 800);
          return;
        }
      }

      if (transcriptButton) {
        transcriptButton.click();
        console.log('[CzechDub:PageScript] Clicked transcript button');
        window.postMessage({
          type: 'CZECH_DUB_TRANSCRIPT_RESULT',
          requestId: requestId,
          success: true
        }, '*');
      } else {
        console.warn('[CzechDub:PageScript] No transcript button found');
        window.postMessage({
          type: 'CZECH_DUB_TRANSCRIPT_RESULT',
          requestId: requestId,
          success: false
        }, '*');
      }
    } catch (e) {
      console.error('[CzechDub:PageScript] Open transcript error:', e);
      window.postMessage({
        type: 'CZECH_DUB_TRANSCRIPT_RESULT',
        requestId: requestId,
        success: false
      }, '*');
    }
  }

  /**
   * Disable YouTube's visual captions (we use TTS instead).
   */
  function handleDisableCaptions() {
    try {
      var player = document.querySelector('#movie_player');
      if (player && typeof player.getOption === 'function') {
        var isCaptionOn = player.getOption('captions', 'track');
        if (isCaptionOn && isCaptionOn.languageCode) {
          if (typeof player.toggleSubtitles === 'function') {
            player.toggleSubtitles();
            console.log('[CzechDub:PageScript] Disabled visual captions');
          }
        }
      }
    } catch (e) {
      console.warn('[CzechDub:PageScript] Could not disable captions:', e);
    }
  }

  /**
   * Fetch caption data using the ORIGINAL fetch (saved before uBlock patches it).
   * This is the key trick: uBlock replaces window.fetch, but we saved the original.
   */
  function handleFetchCaptions(requestId, url) {
    console.log('[CzechDub:PageScript] Fetching captions with original fetch:', url.substring(0, 150));

    _originalFetch(url)
      .then(function(resp) {
        console.log('[CzechDub:PageScript] Caption fetch response:', resp.status);
        return resp.text();
      })
      .then(function(text) {
        console.log('[CzechDub:PageScript] Caption response: ' + text.length + ' chars');

        if (!text || text.length < 10) {
          window.postMessage({
            type: 'CZECH_DUB_CAPTIONS_DATA',
            requestId: requestId,
            success: false,
            error: 'Empty response'
          }, '*');
          return;
        }

        window.postMessage({
          type: 'CZECH_DUB_CAPTIONS_DATA',
          requestId: requestId,
          success: true,
          data: text,
          format: text.trim().startsWith('{') ? 'json3' : 'xml'
        }, '*');
      })
      .catch(function(err) {
        console.error('[CzechDub:PageScript] Caption fetch error:', err.message);
        window.postMessage({
          type: 'CZECH_DUB_CAPTIONS_DATA',
          requestId: requestId,
          success: false,
          error: err.message
        }, '*');
      });
  }

  console.log('[CzechDub:PageScript] MAIN world script loaded (original fetch saved)');
})();
