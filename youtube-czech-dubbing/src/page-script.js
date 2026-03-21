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
   * Fetch full transcript by downloading timedtext directly from caption track baseUrl.
   * This works because we're in MAIN world with YouTube's cookies.
   */
  function handleGetTranscriptParams(requestId) {
    console.log('[CzechDub:PageScript] Fetching transcript via timedtext...');

    // Get caption tracks from player API
    var tracks = null;
    try {
      var player = document.querySelector('#movie_player');
      if (player && typeof player.getPlayerResponse === 'function') {
        var resp = player.getPlayerResponse();
        if (resp?.captions?.playerCaptionsTracklistRenderer) {
          tracks = resp.captions.playerCaptionsTracklistRenderer.captionTracks;
        }
      }
    } catch (e) {}

    if (!tracks) {
      try {
        if (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer) {
          tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
        }
      } catch (e) {}
    }

    if (!tracks || tracks.length === 0) {
      console.log('[CzechDub:PageScript] No caption tracks found');
      window.postMessage({
        type: 'CZECH_DUB_TRANSCRIPT_PARAMS',
        requestId: requestId,
        success: false,
        error: 'No caption tracks'
      }, '*');
      return;
    }

    console.log('[CzechDub:PageScript] Caption tracks:', tracks.length);

    // Find best English track (prefer manual over ASR)
    var track = tracks.find(function(t) { return t.languageCode === 'en' && t.kind !== 'asr'; })
             || tracks.find(function(t) { return t.languageCode === 'en'; })
             || tracks[0];

    if (!track || !track.baseUrl) {
      console.log('[CzechDub:PageScript] No usable track with baseUrl');
      window.postMessage({
        type: 'CZECH_DUB_TRANSCRIPT_PARAMS',
        requestId: requestId,
        success: false,
        error: 'No track baseUrl'
      }, '*');
      return;
    }

    // Add fmt=json3 for JSON output with timestamps
    var url = track.baseUrl;
    if (url.indexOf('fmt=') === -1) {
      url += '&fmt=json3';
    }

    // Timedtext URLs are blocked by uBlock — use transcript panel DOM instead
    console.log('[CzechDub:PageScript] Timedtext blocked, opening transcript panel to read from DOM...');
    _openTranscriptAndRead(requestId);
  }

  /**
   * Open YouTube's transcript panel and read segments from the DOM.
   * This bypasses uBlock because YouTube loads the data itself.
   */
  function _openTranscriptAndRead(requestId) {
    // Check if transcript panel already open
    var panel = document.querySelector('ytd-transcript-renderer');
    if (panel) {
      console.log('[CzechDub:PageScript] Transcript panel already open');
      _waitAndReadTranscript(requestId, 0);
      return;
    }

    // Find and click the "Show transcript" button
    // Method 1: Direct transcript button in description
    var buttons = document.querySelectorAll('button, ytd-button-renderer');
    var transcriptButton = null;
    for (var i = 0; i < buttons.length; i++) {
      var btnText = buttons[i].textContent.toLowerCase().trim();
      if (btnText.includes('transcript') || btnText.includes('přepis') || btnText.includes('zobrazit přepis') || btnText === 'show transcript') {
        transcriptButton = buttons[i];
        break;
      }
    }

    if (transcriptButton) {
      console.log('[CzechDub:PageScript] Clicking transcript button');
      transcriptButton.click();
      _waitAndReadTranscript(requestId, 0);
      return;
    }

    // Method 2: Open via three-dot menu
    var menuButton = document.querySelector('ytd-video-primary-info-renderer ytd-menu-renderer yt-icon-button') ||
                     document.querySelector('#actions ytd-menu-renderer button') ||
                     document.querySelector('#top-level-buttons-computed + ytd-menu-renderer button') ||
                     document.querySelector('#info #menu button');

    // Try finding the "..." button more broadly
    if (!menuButton) {
      var allMenuBtns = document.querySelectorAll('ytd-menu-renderer button[aria-label]');
      for (var k = 0; k < allMenuBtns.length; k++) {
        var label = allMenuBtns[k].getAttribute('aria-label') || '';
        if (label.toLowerCase().includes('action') || label.toLowerCase().includes('more') || label.toLowerCase().includes('další') || label === '...') {
          menuButton = allMenuBtns[k];
          break;
        }
      }
    }

    if (menuButton) {
      console.log('[CzechDub:PageScript] Clicking menu button to find transcript...');
      menuButton.click();

      setTimeout(function() {
        var menuItems = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item');
        var found = false;
        for (var j = 0; j < menuItems.length; j++) {
          var itemText = menuItems[j].textContent.toLowerCase().trim();
          if (itemText.includes('transcript') || itemText.includes('přepis')) {
            menuItems[j].click();
            console.log('[CzechDub:PageScript] Clicked transcript in menu');
            found = true;
            _waitAndReadTranscript(requestId, 0);
            break;
          }
        }
        if (!found) {
          document.body.click(); // close menu
          console.warn('[CzechDub:PageScript] Transcript option not found in menu');
          _sendTranscriptFailure(requestId, 'Transcript option not found');
        }
      }, 1000);
      return;
    }

    console.warn('[CzechDub:PageScript] No transcript button/menu found');
    _sendTranscriptFailure(requestId, 'No transcript button found');
  }

  /**
   * Wait for transcript segments to appear in DOM, then read them.
   */
  function _waitAndReadTranscript(requestId, attempt) {
    if (attempt > 20) { // 20 * 500ms = 10s max wait
      _sendTranscriptFailure(requestId, 'Transcript panel did not load');
      return;
    }

    setTimeout(function() {
      var segments = _readTranscriptFromDOM();
      if (segments && segments.length > 0) {
        console.log('[CzechDub:PageScript] Read ' + segments.length + ' segments from transcript panel');
        console.log('[CzechDub:PageScript] First: "' + segments[0].text + '" at ' + segments[0].start.toFixed(1) + 's');

        // Close transcript panel to clean up UI
        var closeBtn = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] #visibility-button button');
        if (closeBtn) closeBtn.click();

        window.postMessage({
          type: 'CZECH_DUB_TRANSCRIPT_PARAMS',
          requestId: requestId,
          success: true,
          segments: segments
        }, '*');
      } else {
        _waitAndReadTranscript(requestId, attempt + 1);
      }
    }, 500);
  }

  /**
   * Read transcript segments from the open transcript panel DOM.
   */
  function _readTranscriptFromDOM() {
    var segments = [];

    // YouTube transcript panel segment selectors
    var segmentEls = document.querySelectorAll(
      'ytd-transcript-segment-renderer, ' +
      'yt-transcript-segment-renderer, ' +
      '[target-id="engagement-panel-searchable-transcript"] .segment'
    );

    for (var i = 0; i < segmentEls.length; i++) {
      var el = segmentEls[i];

      // Extract timestamp
      var timeEl = el.querySelector('.segment-timestamp, [class*="timestamp"], .ytd-transcript-segment-renderer[class*="time"]');
      var textEl = el.querySelector('.segment-text, [class*="segment-text"], yt-formatted-string');

      if (!timeEl && !textEl) {
        // Try reading directly from the element's children
        var children = el.children;
        if (children.length >= 2) {
          timeEl = children[0];
          textEl = children[1];
        }
      }

      var timeStr = timeEl ? timeEl.textContent.trim() : '';
      var text = textEl ? textEl.textContent.trim() : el.textContent.trim();

      // Parse timestamp "0:00" or "1:23:45" to seconds
      var startSeconds = _parseTimestamp(timeStr);

      if (text && text.length > 0) {
        segments.push({
          start: startSeconds,
          duration: 0, // will be calculated from next segment
          text: text
        });
      }
    }

    // Calculate durations from gaps between segments
    for (var j = 0; j < segments.length - 1; j++) {
      segments[j].duration = segments[j + 1].start - segments[j].start;
    }
    if (segments.length > 0) {
      segments[segments.length - 1].duration = 5; // default for last segment
    }

    return segments;
  }

  function _parseTimestamp(str) {
    if (!str) return 0;
    var parts = str.split(':').map(function(p) { return parseInt(p, 10) || 0; });
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }

  function _sendTranscriptFailure(requestId, error) {
    console.error('[CzechDub:PageScript] Transcript error:', error);
    window.postMessage({
      type: 'CZECH_DUB_TRANSCRIPT_PARAMS',
      requestId: requestId,
      success: false,
      error: error
    }, '*');
  }

  /**
   * Parse YouTube's json3 timedtext format into segments.
   */
  function _parseTimedTextJson3(data) {
    var segments = [];
    if (!data || !data.events) return segments;

    for (var i = 0; i < data.events.length; i++) {
      var event = data.events[i];
      // Skip events without text segments (e.g. line breaks, formatting)
      if (!event.segs) continue;

      var text = '';
      for (var j = 0; j < event.segs.length; j++) {
        var seg = event.segs[j];
        if (seg.utf8) text += seg.utf8;
      }

      text = text.trim();
      if (!text || text === '\n') continue;

      var startMs = event.tStartMs || 0;
      var durMs = event.dDurationMs || 0;

      segments.push({
        start: startMs / 1000,
        duration: durMs / 1000,
        text: text
      });
    }

    return segments;
  }

  /**
   * Parse /get_transcript response into segments.
   */
  function _parseTranscriptResponse(data) {
    var segments = [];
    // Find cueGroups anywhere in the response
    var cueGroups = _findDeepArray(data, 'cueGroups');
    if (!cueGroups) return segments;

    for (var i = 0; i < cueGroups.length; i++) {
      var cues = cueGroups[i]?.transcriptCueGroupRenderer?.cues || [];
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
    return segments;
  }

  /**
   * Parse YouTube's XML timedtext format (default without fmt param).
   */
  function _parseTimedTextXml(xmlText) {
    var segments = [];
    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlText, 'text/xml');
    var textNodes = doc.querySelectorAll('text');

    for (var i = 0; i < textNodes.length; i++) {
      var node = textNodes[i];
      var start = parseFloat(node.getAttribute('start')) || 0;
      var dur = parseFloat(node.getAttribute('dur')) || 0;
      var text = node.textContent.trim();
      if (text) {
        segments.push({ start: start, duration: dur, text: text });
      }
    }
    return segments;
  }

  function _findDeepArray(obj, key, maxDepth) {
    if (maxDepth === undefined) maxDepth = 15;
    if (!obj || typeof obj !== 'object' || maxDepth <= 0) return null;
    if (Array.isArray(obj[key])) return obj[key];
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var result = _findDeepArray(obj[keys[i]], key, maxDepth - 1);
      if (result) return result;
    }
    return null;
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
