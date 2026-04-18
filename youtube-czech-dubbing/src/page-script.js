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

  // CRITICAL: Save references and hook XHR/fetch BEFORE uBlock patches them.
  // This script runs at document_start, before any other content scripts.
  var _originalFetch = window.fetch.bind(window);

  // Intercept timedtext responses from YouTube's own player requests.
  // When the player loads captions, we capture the response data.
  var _capturedTimedtext = {};
  var _capturedVideoId = null;
  var _origXHROpen = XMLHttpRequest.prototype.open;
  var _origXHRSend = XMLHttpRequest.prototype.send;

  function _getCurrentVideoId() {
    try {
      var m = window.location.href.match(/[?&]v=([^&#]+)/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  XMLHttpRequest.prototype.open = function(method, url) {
    this._czechdub_url = (typeof url === 'string') ? url : '';
    return _origXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    var self = this;
    var url = self._czechdub_url || '';
    if (url.indexOf('timedtext') !== -1 || url.indexOf('api/timedtext') !== -1) {
      var origOnReadyStateChange = self.onreadystatechange;
      self.addEventListener('readystatechange', function() {
        if (self.readyState === 4 && self.responseText && self.responseText.length > 10) {
          _capturedTimedtext[url] = self.responseText;
          _capturedTimedtext['_latest'] = self.responseText;
          _capturedTimedtext['_latestUrl'] = url;
          _capturedVideoId = _getCurrentVideoId();
          console.log('[CzechDub:PageScript] CAPTURED timedtext response:', self.responseText.length, 'bytes from', url.substring(0, 100));
        }
      });
    }
    return _origXHRSend.apply(this, arguments);
  };

  // Also intercept fetch for timedtext
  window.fetch = function() {
    var url = arguments[0];
    if (typeof url === 'string' && (url.indexOf('timedtext') !== -1)) {
      return _originalFetch.apply(window, arguments).then(function(response) {
        var cloned = response.clone();
        cloned.text().then(function(text) {
          if (text && text.length > 10) {
            _capturedTimedtext[url] = text;
            _capturedTimedtext['_latest'] = text;
            _capturedTimedtext['_latestUrl'] = url;
            _capturedVideoId = _getCurrentVideoId();
            console.log('[CzechDub:PageScript] CAPTURED fetch timedtext:', text.length, 'bytes');
          }
        });
        return response;
      });
    }
    return _originalFetch.apply(window, arguments);
  };

  // Reset captured timedtext on SPA navigation — but only when videoId actually
  // changes. YouTube fires yt-navigate-finish for same-page events too (hash
  // updates, panel toggles) and dropping our cache there forces a manual
  // timedtext fetch that often returns empty (ad blocker / cookie / IP limit).
  document.addEventListener('yt-navigate-finish', function() {
    var currentVideoId = _getCurrentVideoId();
    if (_capturedVideoId && currentVideoId && currentVideoId === _capturedVideoId) {
      // Same video — keep cached data
      return;
    }
    _capturedTimedtext = {};
    _capturedVideoId = null;
    console.log('[CzechDub:PageScript] Cleared captured timedtext on navigation (videoId changed)');
  });

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
      }, 'https://www.youtube.com');
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
    console.log('[CzechDub:PageScript] Fetching transcript...');

    // Check if we already captured timedtext from YouTube's own player
    if (_capturedTimedtext['_latest']) {
      console.log('[CzechDub:PageScript] Using CAPTURED timedtext data:', _capturedTimedtext['_latest'].length, 'bytes');
      _processTimedtextResponse(_capturedTimedtext['_latest'], requestId);
      return;
    }
    console.log('[CzechDub:PageScript] No captured timedtext yet, trying direct fetch...');

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
      }, 'https://www.youtube.com');
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
      }, 'https://www.youtube.com');
      return;
    }

    // baseUrl has a signature covering params in sparams= (ip,ipbits,expire,v,ei,caps,opi,exp,xoaf).
    // lang= is NOT in sparams, so adding it won't break the signature.
    // fmt= might break things, so we only add lang= and accept default XML format.
    var url = track.baseUrl;
    if (url.indexOf('lang=') === -1) {
      url += '&lang=' + (track.languageCode || 'en');
    }

    console.log('[CzechDub:PageScript] Track:', track.languageCode, 'kind:', track.kind || 'manual');
    console.log('[CzechDub:PageScript] URL (with lang):', url.substring(0, 180));
    console.log('[CzechDub:PageScript] Trying timedtext XHR...');
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.withCredentials = true;
      xhr.timeout = 3000;
      xhr.onload = function() {
        console.log('[CzechDub:PageScript] XHR status:', xhr.status, 'length:', xhr.responseText.length);
        if (xhr.status === 200 && xhr.responseText.length > 0) {
          console.log('[CzechDub:PageScript] Timedtext received via XHR');
          _processTimedtextResponse(xhr.responseText, requestId);
        } else {
          // XHR empty — try fetch as fallback
          console.log('[CzechDub:PageScript] XHR empty, trying fetch...');
          _originalFetch(url, { credentials: 'include' })
            .then(function(resp) {
              console.log('[CzechDub:PageScript] Fetch status:', resp.status);
              return resp.text();
            })
            .then(function(text) {
              console.log('[CzechDub:PageScript] Fetch response length:', text.length, 'preview:', text.substring(0, 100));
              if (text.length > 0) {
                _processTimedtextResponse(text, requestId);
              } else {
                _sendTranscriptFailure(requestId, 'Timedtext empty (ad blocker?)');
              }
            })
            .catch(function(err) {
              _sendTranscriptFailure(requestId, 'Fetch error: ' + err.message);
            });
        }
      };
      xhr.onerror = function() {
        _sendTranscriptFailure(requestId, 'XHR error');
      };
      xhr.ontimeout = function() {
        _sendTranscriptFailure(requestId, 'XHR timeout');
      };
      xhr.send();
    } catch (e) {
      _sendTranscriptFailure(requestId, e.message);
    }
  }

  function _processTimedtextResponse(text, requestId) {
    try {
      var segments;
      if (text.charAt(0) === '{') {
        segments = _parseTimedTextJson3(JSON.parse(text));
      } else {
        segments = _parseTimedTextXml(text);
      }
      // Detect language from captured URL parameters and content
      var capturedUrl = _capturedTimedtext['_latestUrl'] || '';
      var detectedLang = null;

      // 1. Check tlang= (auto-translate target language) — most reliable
      var tlangMatch = capturedUrl.match(/[?&]tlang=([a-z]{2})/);
      if (tlangMatch) {
        detectedLang = tlangMatch[1];
      }

      // 2. Check lang= (source track language) when no tlang
      if (!detectedLang) {
        var langMatch = capturedUrl.match(/[?&]lang=([a-z]{2})/);
        if (langMatch) {
          detectedLang = langMatch[1];
        }
      }

      // 3. Fallback: detect from content — check for diacritics (CS/SK/PL/HU)
      if (!detectedLang && segments.length > 0) {
        var sampleText = segments.slice(0, Math.min(10, segments.length)).map(function(s) { return s.text; }).join(' ');
        var czechChars = (sampleText.match(/[áčďéěíňóřšťúůýž]/gi) || []).length;
        var slovakChars = (sampleText.match(/[ľôŕĺ]/gi) || []).length;
        var polishChars = (sampleText.match(/[ąćęłńśźż]/gi) || []).length;
        if (sampleText.length > 0) {
          if ((czechChars / sampleText.length) > 0.03) detectedLang = 'cs';
          else if ((slovakChars / sampleText.length) > 0.02) detectedLang = 'sk';
          else if ((polishChars / sampleText.length) > 0.02) detectedLang = 'pl';
        }
      }

      console.log('[CzechDub:PageScript] Parsed ' + segments.length + ' timedtext segments, detectedLang: ' + (detectedLang || 'en'));

      window.postMessage({
        type: 'CZECH_DUB_TRANSCRIPT_PARAMS',
        requestId: requestId,
        success: segments.length > 0,
        segments: segments,
        detectedLang: detectedLang || null
      }, 'https://www.youtube.com');
    } catch (err) {
      _sendTranscriptFailure(requestId, err.message);
    }
  }

  function _sendTranscriptFailure(requestId, error) {
    console.log('[CzechDub:PageScript] Transcript not available:', error);
    window.postMessage({
      type: 'CZECH_DUB_TRANSCRIPT_PARAMS',
      requestId: requestId,
      success: false,
      error: error
    }, 'https://www.youtube.com');
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
    }, 'https://www.youtube.com');
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
    }, 'https://www.youtube.com');
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
        }, 'https://www.youtube.com');
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
                }, 'https://www.youtube.com');
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
            }, 'https://www.youtube.com');
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
        }, 'https://www.youtube.com');
      } else {
        console.warn('[CzechDub:PageScript] No transcript button found');
        window.postMessage({
          type: 'CZECH_DUB_TRANSCRIPT_RESULT',
          requestId: requestId,
          success: false
        }, 'https://www.youtube.com');
      }
    } catch (e) {
      console.error('[CzechDub:PageScript] Open transcript error:', e);
      window.postMessage({
        type: 'CZECH_DUB_TRANSCRIPT_RESULT',
        requestId: requestId,
        success: false
      }, 'https://www.youtube.com');
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
          }, 'https://www.youtube.com');
          return;
        }

        window.postMessage({
          type: 'CZECH_DUB_CAPTIONS_DATA',
          requestId: requestId,
          success: true,
          data: text,
          format: text.trim().startsWith('{') ? 'json3' : 'xml'
        }, 'https://www.youtube.com');
      })
      .catch(function(err) {
        console.error('[CzechDub:PageScript] Caption fetch error:', err.message);
        window.postMessage({
          type: 'CZECH_DUB_CAPTIONS_DATA',
          requestId: requestId,
          success: false,
          error: err.message
        }, 'https://www.youtube.com');
      });
  }

  console.log('[CzechDub:PageScript] MAIN world script loaded (original fetch saved)');
})();
