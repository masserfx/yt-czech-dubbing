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

    if (event.data?.type === 'CZECH_DUB_FETCH_TRANSCRIPT') {
      handleFetchTranscript(event.data.requestId, event.data.videoId);
    }
  });

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

  /**
   * Fetch full transcript data using innertube API or captionTracks baseUrl.
   * This runs in MAIN world so we have access to ytInitialPlayerResponse and original fetch.
   */
  function handleFetchTranscript(requestId, videoId) {
    console.log('[CzechDub:PageScript] Fetching full transcript for:', videoId);

    // Strategy 1: Get captionTracks baseUrl from player response
    var captionTracks = null;

    try {
      // Try player API first
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

    if (captionTracks && captionTracks.length > 0) {
      console.log('[CzechDub:PageScript] Found ' + captionTracks.length + ' caption tracks');
      captionTracks.forEach(function(t) {
        console.log('[CzechDub:PageScript]   Track: ' + t.languageCode + ' (' + (t.name?.simpleText || t.kind || '') + ')');
      });

      // Prefer English manual > English ASR > first track
      var track = captionTracks.find(function(t) { return t.languageCode === 'en' && t.kind !== 'asr'; })
        || captionTracks.find(function(t) { return t.languageCode === 'en'; })
        || captionTracks[0];

      var baseUrl = track.baseUrl;
      // Request JSON3 format for easier parsing
      if (baseUrl.indexOf('fmt=') === -1) {
        baseUrl += '&fmt=json3';
      } else {
        baseUrl = baseUrl.replace(/fmt=[^&]+/, 'fmt=json3');
      }

      console.log('[CzechDub:PageScript] Fetching transcript from baseUrl (json3):', baseUrl.substring(0, 200));

      _originalFetch(baseUrl)
        .then(function(resp) {
          console.log('[CzechDub:PageScript] Transcript fetch status:', resp.status);
          return resp.text();
        })
        .then(function(text) {
          console.log('[CzechDub:PageScript] Transcript response length:', text.length);

          if (!text || text.length < 20) {
            // baseUrl fetch failed, try innertube approach
            console.log('[CzechDub:PageScript] baseUrl returned empty, trying innertube...');
            return fetchTranscriptViaInnertube(requestId, videoId);
          }

          try {
            var data = JSON.parse(text);
            var segments = parseJson3Transcript(data, track.languageCode);
            console.log('[CzechDub:PageScript] Parsed ' + segments.length + ' transcript segments');

            window.postMessage({
              type: 'CZECH_DUB_TRANSCRIPT_DATA',
              requestId: requestId,
              success: true,
              segments: segments,
              sourceLang: track.languageCode
            }, '*');
          } catch (parseErr) {
            console.error('[CzechDub:PageScript] Failed to parse transcript JSON:', parseErr);
            fetchTranscriptViaInnertube(requestId, videoId);
          }
        })
        .catch(function(err) {
          console.error('[CzechDub:PageScript] baseUrl fetch error:', err.message);
          fetchTranscriptViaInnertube(requestId, videoId);
        });
    } else {
      // No captionTracks — try innertube directly
      console.log('[CzechDub:PageScript] No captionTracks found, trying innertube...');
      fetchTranscriptViaInnertube(requestId, videoId);
    }
  }

  /**
   * Parse JSON3 format transcript into segments with timestamps.
   */
  function parseJson3Transcript(data, lang) {
    if (!data.events) return [];

    return data.events
      .filter(function(event) { return event.segs && event.segs.length > 0; })
      .map(function(event) {
        var text = event.segs.map(function(s) { return s.utf8 || ''; }).join('').trim();
        return {
          start: (event.tStartMs || 0) / 1000,
          duration: (event.dDurationMs || 0) / 1000,
          text: text
        };
      })
      .filter(function(seg) { return seg.text.length > 0 && seg.text !== '\n'; });
  }

  /**
   * Fallback: Fetch transcript via innertube /get_transcript endpoint.
   * Requires getting params from ytInitialData or /next endpoint.
   */
  function fetchTranscriptViaInnertube(requestId, videoId) {
    console.log('[CzechDub:PageScript] Trying innertube /get_transcript...');

    // Try to get transcript params from ytInitialData
    var params = null;

    try {
      var panels = window.ytInitialData?.engagementPanels;
      if (panels) {
        for (var i = 0; i < panels.length; i++) {
          var panel = panels[i];
          var panelId = panel?.engagementPanelSectionListRenderer?.panelIdentifier;
          if (panelId === 'engagement-panel-searchable-transcript') {
            // Deep search for getTranscriptEndpoint.params
            params = findDeepKey(panel, 'getTranscriptEndpoint')?.params;
            if (params) break;
          }
        }
      }
    } catch (e) {
      console.warn('[CzechDub:PageScript] Failed to extract params from ytInitialData:', e);
    }

    if (!params) {
      // Fallback: call /next to get params
      console.log('[CzechDub:PageScript] No params in ytInitialData, calling /next...');

      var clientVersion = '2.20250320.01.00';
      try {
        clientVersion = window.ytcfg?.get?.('INNERTUBE_CLIENT_VERSION') || clientVersion;
      } catch (e) {}

      _originalFetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: clientVersion } },
          videoId: videoId
        })
      })
        .then(function(r) { return r.json(); })
        .then(function(nextData) {
          params = findDeepKey(nextData, 'getTranscriptEndpoint')?.params;
          if (params) {
            callGetTranscript(requestId, videoId, params, clientVersion);
          } else {
            console.warn('[CzechDub:PageScript] No getTranscriptEndpoint found in /next response');
            sendTranscriptError(requestId, 'No transcript params found');
          }
        })
        .catch(function(err) {
          console.error('[CzechDub:PageScript] /next fetch error:', err);
          sendTranscriptError(requestId, err.message);
        });
      return;
    }

    var clientVersion2 = '2.20250320.01.00';
    try {
      clientVersion2 = window.ytcfg?.get?.('INNERTUBE_CLIENT_VERSION') || clientVersion2;
    } catch (e) {}

    callGetTranscript(requestId, videoId, params, clientVersion2);
  }

  /**
   * Call /youtubei/v1/get_transcript with params.
   */
  function callGetTranscript(requestId, videoId, params, clientVersion) {
    console.log('[CzechDub:PageScript] Calling /get_transcript with params...');

    _originalFetch('https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: clientVersion } },
        params: params
      })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        console.log('[CzechDub:PageScript] /get_transcript response keys:', Object.keys(data).join(', '));

        var segments = parseInnertubeTranscript(data);
        if (segments.length > 0) {
          console.log('[CzechDub:PageScript] Got ' + segments.length + ' transcript segments via innertube');
          window.postMessage({
            type: 'CZECH_DUB_TRANSCRIPT_DATA',
            requestId: requestId,
            success: true,
            segments: segments,
            sourceLang: 'en'
          }, '*');
        } else {
          sendTranscriptError(requestId, 'No segments in innertube response');
        }
      })
      .catch(function(err) {
        console.error('[CzechDub:PageScript] /get_transcript error:', err);
        sendTranscriptError(requestId, err.message);
      });
  }

  /**
   * Parse innertube /get_transcript response.
   */
  function parseInnertubeTranscript(data) {
    var segments = [];

    try {
      var body = data?.actions?.[0]?.updateEngagementPanelAction
        ?.content?.transcriptRenderer?.body?.transcriptBodyRenderer;

      if (!body) {
        // Alternative structure
        body = data?.actions?.[0]?.updateEngagementPanelAction
          ?.content?.transcriptRenderer?.content?.transcriptSearchPanelRenderer
          ?.body?.transcriptSegmentListRenderer;
      }

      var cueGroups = body?.cueGroups || [];

      for (var i = 0; i < cueGroups.length; i++) {
        var group = cueGroups[i];
        var cues = group?.transcriptCueGroupRenderer?.cues || [];

        for (var j = 0; j < cues.length; j++) {
          var cue = cues[j]?.transcriptCueRenderer;
          if (cue) {
            var text = cue.cue?.simpleText || '';
            var startMs = parseInt(cue.startOffsetMs || '0', 10);
            var durMs = parseInt(cue.durationMs || '0', 10);

            if (text.trim()) {
              segments.push({
                start: startMs / 1000,
                duration: durMs / 1000,
                text: text.trim()
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('[CzechDub:PageScript] Parse innertube transcript error:', e);
    }

    return segments;
  }

  /**
   * Deep search for a key in a nested object.
   */
  function findDeepKey(obj, key, maxDepth) {
    if (maxDepth === undefined) maxDepth = 10;
    if (!obj || typeof obj !== 'object' || maxDepth <= 0) return null;

    if (obj[key] !== undefined) return obj;

    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var result = findDeepKey(obj[keys[i]], key, maxDepth - 1);
      if (result) return result;
    }
    return null;
  }

  function sendTranscriptError(requestId, error) {
    window.postMessage({
      type: 'CZECH_DUB_TRANSCRIPT_DATA',
      requestId: requestId,
      success: false,
      error: error
    }, '*');
  }

  console.log('[CzechDub:PageScript] MAIN world script loaded (original fetch saved)');
})();
