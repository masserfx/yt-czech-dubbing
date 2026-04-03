/**
 * Background Service Worker for YouTube Czech Dubbing extension.
 * Handles extension lifecycle events, inter-script communication,
 * and proxies all external API calls (translation, captions) to bypass CSP.
 */

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[CzechDub] Extension installed');

    // Set default settings
    chrome.storage.local.set({
      czechDubSettings: {
        ttsRate: 1.25,
        ttsMaxRate: 1.8,
        ttsVolume: 0.95,
        ttsPitch: 1.0,
        reducedOriginalVolume: 0.15,
        muteOriginal: false
      }
    });
  }
});

// Open side panel when clicking the extension icon
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ping') {
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'status-update') {
    // Forward status updates to popup (if open)
    return false;
  }

  if (msg.type === 'fetch-captions') {
    fetchCaptions(msg.url)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  if (msg.type === 'fetch-page-captions') {
    fetchPageCaptions(msg.videoId)
      .then(tracks => sendResponse({ success: true, tracks }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'translate-mymemory') {
    translateMyMemory(msg.text, msg.sourceLang, msg.targetLang || 'cs')
      .then(result => sendResponse({ success: true, translated: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'translate-libre') {
    translateLibre(msg.text, msg.sourceLang, msg.targetLang || 'cs')
      .then(result => sendResponse({ success: true, translated: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'fetch-transcript') {
    fetchTranscriptInnertube(msg.videoId)
      .then(segments => sendResponse({ success: true, segments }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'fetch-transcript-with-params') {
    fetchTranscriptWithParams(msg.params)
      .then(segments => sendResponse({ success: true, segments }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'translate-google') {
    translateGoogle(msg.text, msg.sourceLang, msg.targetLang || 'cs')
      .then(result => sendResponse({ success: true, translated: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'translate-claude') {
    translateClaude(msg.text, msg.sourceLang, msg.apiKey, msg.targetLang || 'cs', msg.claudePrompt)
      .then(result => sendResponse({ success: true, translated: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'translate-deepl') {
    translateDeepL(msg.text, msg.sourceLang, msg.apiKey, msg.targetLang || 'CS')
      .then(result => sendResponse({ success: true, translated: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'synthesize-azure-tts') {
    synthesizeAzureTTS(msg.text, msg.apiKey, msg.region, msg.voice, msg.rate, msg.pitch, msg.lang)
      .then(audioBase64 => sendResponse({ success: true, audioBase64 }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Service mode proxy handlers (B2B)
  if (msg.type === 'service-translate') {
    serviceTranslate(msg.endpoint, msg.authToken, msg.organizationId, msg.text, msg.sourceLang, msg.targetLang, msg.engine)
      .then(result => sendResponse({ success: true, translated: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'service-synthesize') {
    serviceSynthesize(msg.endpoint, msg.authToken, msg.organizationId, msg.text, msg.targetLang, msg.voice)
      .then(audioBase64 => sendResponse({ success: true, audioBase64 }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Gemini AI Chat
  if (msg.type === 'gemini-chat') {
    geminiChat(msg.apiKey, msg.systemInstruction, msg.history, msg.message)
      .then(text => sendResponse({ success: true, text }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Article dubbing: programmatic injection of article scripts
  if (msg.type === 'inject-article-scripts') {
    const tabId = sender.tab?.id || msg.tabId;
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' });
      return false;
    }
    chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'src/language-config.js',
        'src/translator.js',
        'src/tts-engine.js',
        'src/article-extractor.js',
        'src/article-player.js',
        'src/article-content.js'
      ]
    })
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Mic permission — open focused popup window so dialog appears on top
  if (msg.type === 'open-mic-permission') {
    chrome.windows.create({
      url: chrome.runtime.getURL('src/mic-permission.html'),
      type: 'popup',
      width: 420,
      height: 220,
      focused: true
    }, (win) => {
      const winId = win?.id;
      const listener = (innerMsg) => {
        if (innerMsg.type === 'mic-permission-result') {
          chrome.runtime.onMessage.removeListener(listener);
          if (winId) chrome.windows.remove(winId).catch(() => {});
          sendResponse({ granted: innerMsg.granted });
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      // Fallback: window closed without response
      chrome.windows.onRemoved.addListener(function onClose(closedId) {
        if (closedId === winId) {
          chrome.windows.onRemoved.removeListener(onClose);
          chrome.runtime.onMessage.removeListener(listener);
          sendResponse({ granted: false });
        }
      });
    });
    return true;
  }

  if (msg.type === 'get-usage') {
    getUsageStats()
      .then(stats => sendResponse({ success: true, stats }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'reset-usage') {
    chrome.storage.local.remove('claudeUsage')
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});

// Handle tab updates - notify content script when YouTube navigates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('youtube.com/watch')) {
    chrome.tabs.sendMessage(tabId, { type: 'tab-updated' }).catch(() => {
      // Content script may not be injected yet
    });
  }
});

// --- Proxy functions for external API calls ---

/**
 * Download and parse captions from a YouTube caption track URL.
 * Retries on 429 with exponential backoff.
 */
async function fetchCaptions(url) {
  const maxRetries = 3;
  const delays = [2000, 4000, 8000];

  console.log(`[CzechDub:BG] Caption URL: ${url.substring(0, 200)}`);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = delays[attempt - 1] || 8000;
      console.log(`[CzechDub:BG] Retry ${attempt}/${maxRetries} after ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }

    console.log(`[CzechDub:BG] Fetching captions (attempt ${attempt + 1})...`);

    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Referer': 'https://www.youtube.com/'
      }
    });

    console.log(`[CzechDub:BG] Response: status=${resp.status}, type=${resp.headers.get('content-type')}`);

    if (resp.status === 429) {
      console.warn(`[CzechDub:BG] Rate limited (429)`);
      if (attempt === maxRetries) throw new Error('Rate limited after max retries');
      continue;
    }

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const text = await resp.text();
    console.log(`[CzechDub:BG] Response length: ${text.length}, first 300: ${text.substring(0, 300)}`);

    if (!text || text.trim().length === 0) {
      if (attempt < maxRetries) continue;
      throw new Error('Empty response');
    }

    if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
      if (attempt < maxRetries) continue;
      throw new Error('Got HTML instead of JSON - URL may be expired');
    }

    const data = JSON.parse(text);
    if (!data.events) {
      console.warn('[CzechDub:BG] No events in response. Keys:', Object.keys(data).join(', '));
      return [];
    }

    console.log(`[CzechDub:BG] Got ${data.events.length} caption events`);

    return data.events
      .filter(event => event.segs && event.segs.length > 0)
      .map(event => ({
        start: (event.tStartMs || 0) / 1000,
        duration: (event.dDurationMs || 0) / 1000,
        text: event.segs.map(s => s.utf8 || '').join('').trim()
      }))
      .filter(caption => caption.text.length > 0);
  }
  return [];
}

/**
 * Fetch YouTube page HTML and extract caption tracks (fallback).
 */
async function fetchPageCaptions(videoId) {
  const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  const html = await resp.text();
  console.log(`[CzechDub:BG] Fetched page HTML: ${html.length} chars`);

  // Try ytInitialPlayerResponse
  const playerRespMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|const|let|<\/script)/s);
  if (playerRespMatch) {
    try {
      const playerResp = JSON.parse(playerRespMatch[1]);
      const tracks = playerResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks && tracks.length > 0) {
        console.log(`[CzechDub:BG] Found ${tracks.length} tracks from ytInitialPlayerResponse`);
        return tracks;
      }
    } catch (e) {
      console.warn('[CzechDub:BG] Failed to parse ytInitialPlayerResponse:', e.message);
    }
  }

  // Fallback regex
  const captionsMatch = html.match(/"captionTracks":\s*(\[.+?\])/s);
  if (captionsMatch) {
    try {
      const tracks = JSON.parse(captionsMatch[1]);
      console.log(`[CzechDub:BG] Found ${tracks.length} tracks from captionTracks regex`);
      return tracks;
    } catch (e) {
      console.warn('[CzechDub:BG] Failed to parse captionTracks:', e.message);
    }
  }

  return [];
}

/**
 * MyMemory Translation API
 */
async function translateMyMemory(text, sourceLang, targetLang = 'cs') {
  const langPair = `${sourceLang}|${targetLang}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langPair)}`;
  const resp = await fetch(url);
  const data = await resp.json();

  if (data.responseStatus === 200 && data.responseData?.translatedText) {
    const result = data.responseData.translatedText;
    if (result.includes('MYMEMORY WARNING') || result.includes('QUOTA')) {
      return null;
    }
    return result;
  }
  return null;
}

/**
 * LibreTranslate
 */
async function translateLibre(text, sourceLang, targetLang = 'cs') {
  const instances = [
    'https://libretranslate.de',
    'https://translate.argosopentech.com',
    'https://translate.terraprint.co'
  ];

  for (const instance of instances) {
    try {
      const resp = await fetch(`${instance}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: sourceLang,
          target: targetLang,
          format: 'text'
        })
      });

      if (!resp.ok) continue;

      const data = await resp.json();
      if (data.translatedText) {
        return data.translatedText;
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

/**
 * Fetch transcript using pre-extracted params from page context.
 * Only needs one API call: /get_transcript.
 */
async function fetchTranscriptWithParams(params) {
  console.log('[CzechDub:BG] Fetching transcript with pre-extracted params...');

  const resp = await fetch('https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Youtube-Client-Name': '1',
      'X-Youtube-Client-Version': '2.20250320.01.00',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/'
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20250320.01.00'
        }
      },
      params: params
    })
  });

  if (!resp.ok) {
    throw new Error(`/get_transcript returned HTTP ${resp.status}`);
  }

  const data = await resp.json();
  console.log('[CzechDub:BG] /get_transcript response keys:', Object.keys(data).join(', '));

  return parseInnertubeTranscript(data);
}

/**
 * Fetch transcript via YouTube innertube API.
 * Two-step process:
 * 1. Fetch page HTML to get captionTracks with proper baseUrl
 * 2. Fetch the baseUrl directly (with cookies from the HTML fetch context)
 * Falls back to /youtubei/v1/get_transcript if baseUrl fails.
 */
async function fetchTranscriptInnertube(videoId) {
  console.log(`[CzechDub:BG] Fetching transcript for video: ${videoId}`);

  // Step 1: Fetch video page HTML to extract captionTracks with full baseUrl
  const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const html = await pageResp.text();
  console.log(`[CzechDub:BG] Fetched page HTML: ${html.length} chars`);

  // Check if we got a real YouTube page
  if (html.length < 1000 || !html.includes('ytInitialPlayerResponse')) {
    console.warn('[CzechDub:BG] Page HTML too short or missing player data, trying /next directly...');
    return fetchTranscriptViaNext(videoId);
  }

  // Extract captionTracks from ytInitialPlayerResponse
  let captionTracks = null;
  const playerRespMatch = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s);
  if (playerRespMatch) {
    try {
      const playerResp = JSON.parse(playerRespMatch[1]);
      captionTracks = playerResp?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    } catch (e) {
      console.warn('[CzechDub:BG] Failed to parse player response:', e.message);
    }
  }

  if (!captionTracks) {
    // Fallback regex
    const captionsMatch = html.match(/"captionTracks":\s*(\[.+?\])/s);
    if (captionsMatch) {
      try {
        captionTracks = JSON.parse(captionsMatch[1]);
      } catch (e) {}
    }
  }

  if (captionTracks && captionTracks.length > 0) {
    console.log(`[CzechDub:BG] Found ${captionTracks.length} caption tracks`);
    captionTracks.forEach(t => {
      console.log(`[CzechDub:BG]   Track: ${t.languageCode} (${t.name?.simpleText || t.kind || 'unknown'}), baseUrl: ${t.baseUrl?.substring(0, 100)}`);
    });

    // Pick best track: English manual > English ASR > first
    const track = captionTracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
      || captionTracks.find(t => t.languageCode === 'en')
      || captionTracks[0];

    if (track?.baseUrl) {
      // baseUrl from HTML page response should have all necessary params including &lang=
      let url = track.baseUrl;
      // Ensure JSON3 format
      if (url.includes('fmt=')) {
        url = url.replace(/fmt=[^&]+/, 'fmt=json3');
      } else {
        url += '&fmt=json3';
      }

      console.log(`[CzechDub:BG] Fetching transcript baseUrl: ${url.substring(0, 250)}`);

      const resp = await fetch(url, {
        headers: {
          'Referer': 'https://www.youtube.com/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      const text = await resp.text();
      console.log(`[CzechDub:BG] Transcript baseUrl response: ${resp.status}, ${text.length} chars`);

      if (text && text.length > 20 && !text.trimStart().startsWith('<')) {
        try {
          const data = JSON.parse(text);
          if (data.events) {
            const segments = data.events
              .filter(event => event.segs && event.segs.length > 0)
              .map(event => ({
                start: (event.tStartMs || 0) / 1000,
                duration: (event.dDurationMs || 0) / 1000,
                text: event.segs.map(s => s.utf8 || '').join('').trim()
              }))
              .filter(seg => seg.text.length > 0 && seg.text !== '\n');

            console.log(`[CzechDub:BG] Got ${segments.length} transcript segments via baseUrl`);
            if (segments.length > 0) return segments;
          }
        } catch (e) {
          console.warn(`[CzechDub:BG] baseUrl response not JSON: ${text.substring(0, 100)}`);
        }
      }
      console.log('[CzechDub:BG] baseUrl fetch failed, trying innertube /get_transcript...');
    }
  }

  // Fallback: innertube /get_transcript via /next
  return fetchTranscriptViaNext(videoId);
}

/**
 * Fetch transcript via /youtubei/v1/next → /get_transcript chain.
 */
async function fetchTranscriptViaNext(videoId) {
  console.log('[CzechDub:BG] Fetching transcript via /next → /get_transcript...');

  const innertube = {
    clientName: 'WEB',
    clientVersion: '2.20250320.01.00'
  };

  const nextResp = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Youtube-Client-Name': '1',
      'X-Youtube-Client-Version': innertube.clientVersion,
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/'
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: innertube.clientName,
          clientVersion: innertube.clientVersion,
          hl: 'en',
          gl: 'US'
        }
      },
      videoId: videoId
    })
  });

  if (!nextResp.ok) {
    throw new Error(`/next returned HTTP ${nextResp.status}`);
  }

  const nextData = await nextResp.json();
  console.log('[CzechDub:BG] /next response keys:', Object.keys(nextData).join(', '));

  const transcriptParams = findDeepValue(nextData, 'getTranscriptEndpoint', 'params');

  if (!transcriptParams) {
    // Log what engagement panels we found
    const panels = nextData?.engagementPanels;
    if (panels) {
      console.log(`[CzechDub:BG] Found ${panels.length} engagement panels:`);
      panels.forEach((p, i) => {
        const id = p?.engagementPanelSectionListRenderer?.panelIdentifier || 'unknown';
        console.log(`[CzechDub:BG]   Panel ${i}: ${id}`);
      });
    } else {
      console.log('[CzechDub:BG] No engagement panels in /next response');
    }
    throw new Error('No transcript params found — video may not have a transcript');
  }

  console.log('[CzechDub:BG] Got transcript params, calling /get_transcript...');

  const transcriptResp = await fetch('https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Youtube-Client-Name': '1',
      'X-Youtube-Client-Version': innertube.clientVersion,
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/'
    },
    body: JSON.stringify({
      context: { client: { clientName: innertube.clientName, clientVersion: innertube.clientVersion } },
      params: transcriptParams
    })
  });

  if (!transcriptResp.ok) {
    throw new Error(`/get_transcript returned HTTP ${transcriptResp.status}`);
  }

  const transcriptData = await transcriptResp.json();
  console.log('[CzechDub:BG] /get_transcript response keys:', Object.keys(transcriptData).join(', '));

  return parseInnertubeTranscript(transcriptData);
}

/**
 * Parse innertube /get_transcript response into segments.
 */
function parseInnertubeTranscript(data) {
  const segments = [];

  // The transcript body can be in several nested locations
  const body = findDeepValue(data, 'transcriptSegmentListRenderer', null)
    || findDeepValue(data, 'transcriptBodyRenderer', null);

  if (!body) {
    // Try direct cueGroups search
    const cueGroups = findDeepArray(data, 'cueGroups');
    if (cueGroups) {
      return parseCueGroups(cueGroups);
    }
    console.warn('[CzechDub:BG] No transcript body found in response');
    throw new Error('No transcript body in response');
  }

  const cueGroups = body.cueGroups || [];
  return parseCueGroups(cueGroups);
}

function parseCueGroups(cueGroups) {
  const segments = [];
  for (const group of cueGroups) {
    const cues = group?.transcriptCueGroupRenderer?.cues || [];
    for (const cue of cues) {
      const renderer = cue?.transcriptCueRenderer;
      if (renderer) {
        const text = renderer.cue?.simpleText || '';
        const startMs = parseInt(renderer.startOffsetMs || '0', 10);
        const durMs = parseInt(renderer.durationMs || '0', 10);

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
  console.log(`[CzechDub:BG] Parsed ${segments.length} transcript segments via innertube`);
  if (segments.length === 0) throw new Error('No segments in transcript');
  return segments;
}

/**
 * Deep search for a key in a nested object, optionally return a sub-property.
 */
function findDeepValue(obj, key, subKey, maxDepth = 12) {
  if (!obj || typeof obj !== 'object' || maxDepth <= 0) return null;

  if (obj[key] !== undefined) {
    return subKey ? obj[key][subKey] : obj[key];
  }

  for (const k of Object.keys(obj)) {
    const result = findDeepValue(obj[k], key, subKey, maxDepth - 1);
    if (result !== null && result !== undefined) return result;
  }
  return null;
}

/**
 * Deep search for an array property.
 */
function findDeepArray(obj, key, maxDepth = 12) {
  if (!obj || typeof obj !== 'object' || maxDepth <= 0) return null;

  if (Array.isArray(obj[key])) return obj[key];

  for (const k of Object.keys(obj)) {
    const result = findDeepArray(obj[k], key, maxDepth - 1);
    if (result) return result;
  }
  return null;
}

/**
 * Google Translate unofficial endpoint
 */
async function translateGoogle(text, sourceLang, targetLang = 'cs') {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn('[translateGoogle] HTTP error:', resp.status);
      return null;
    }
    const data = await resp.json();

    if (data && data[0]) {
      return data[0].filter(Boolean).map(item => item[0]).join('');
    }
    return null;
  } catch (err) {
    console.error('[translateGoogle] error:', err);
    return null;
  }
}

/**
 * Claude Haiku 4.5 translation via Anthropic Messages API.
 * Sends batched sentences separated by ||| and gets Czech translations back.
 */
async function translateClaude(text, sourceLang, apiKey, targetLang = 'cs', claudePrompt = null) {
  if (!apiKey) throw new Error('No Anthropic API key');

  const systemPrompt = claudePrompt ||
    'Jsi překladač titulků z YouTube videí. Vrať POUZE přeložený text, nic jiného. Žádné komentáře, vysvětlení ani meta-text.';

  const LANG_NAMES = { cs: 'češtiny', sk: 'slovenčiny', pl: 'polszczyzny', hu: 'magyarra' };
  const langName = LANG_NAMES[targetLang] || targetLang;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Translate to fluent spoken ${langName}. Keep separator XSEP9F3A between parts (same number of parts before and after). Keep proper nouns (people, companies, products) in original.

${text}`
      }]
    })
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${err.substring(0, 200)}`);
  }

  const data = await resp.json();
  const translated = data.content?.[0]?.text?.trim();
  if (!translated) throw new Error('Empty response from Claude');

  // Track usage
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  trackClaudeUsage(inputTokens, outputTokens);

  return translated;
}

/**
 * DeepL Translation API (free tier: 500k chars/month)
 */
async function translateDeepL(text, sourceLang, apiKey, targetLang = 'CS') {
  if (!apiKey) throw new Error('No DeepL API key');

  // Free keys end with ':fx', use free endpoint
  const isFree = apiKey.endsWith(':fx');
  const baseUrl = isFree ? 'https://api-free.deepl.com' : 'https://api.deepl.com';

  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(`${baseUrl}/v2/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: [text],
        source_lang: sourceLang.toUpperCase(),
        target_lang: targetLang.toUpperCase(),
        formality: 'default'
      })
    });

    if (resp.status === 429) {
      // Rate limited — exponential backoff: 1s, 2s, 4s
      const backoff = Math.pow(2, attempt) * 1000;
      console.warn(`[CzechDub] DeepL 429 rate limited, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, backoff));
      lastError = new Error('DeepL API 429: Too Many Requests');
      continue;
    }

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`DeepL API ${resp.status}: ${err.substring(0, 200)}`);
    }

    const data = await resp.json();
    const translated = data.translations?.[0]?.text;
    if (!translated) throw new Error('Empty response from DeepL');
    return translated;
  }

  throw lastError || new Error('DeepL API: max retries exceeded');
}

/**
 * Azure Cognitive Services TTS
 * Returns base64-encoded audio (MP3).
 */
async function synthesizeAzureTTS(text, apiKey, region, voice, rate, pitch, lang) {
  if (!apiKey || !region) throw new Error('No Azure TTS key or region');

  const voiceName = voice || 'cs-CZ-VlastaNeural';
  const xmlLang = lang || voiceName.substring(0, 5) || 'cs-CZ';
  const rateStr = rate ? `${Math.round((rate - 1) * 100)}%` : '+0%';
  const pitchStr = pitch ? `${Math.round((pitch - 1) * 50)}%` : '+0%';

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xmlLang}">
  <voice name="${voiceName}">
    <prosody rate="${rateStr}" pitch="${pitchStr}">${escapeXml(text)}</prosody>
  </voice>
</speak>`;

  const resp = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
    },
    body: ssml
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Azure TTS ${resp.status}: ${err.substring(0, 200)}`);
  }

  const buffer = await resp.arrayBuffer();
  // Convert to base64 for transfer to content script
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function escapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Usage tracking ---

const HAIKU_INPUT_PRICE = 0.80;   // $ per 1M input tokens
const HAIKU_OUTPUT_PRICE = 4.00;  // $ per 1M output tokens

function calcCost(inputTokens, outputTokens) {
  return (inputTokens * HAIKU_INPUT_PRICE + outputTokens * HAIKU_OUTPUT_PRICE) / 1_000_000;
}

async function trackClaudeUsage(inputTokens, outputTokens) {
  const now = Date.now();
  const cost = calcCost(inputTokens, outputTokens);

  const result = await chrome.storage.local.get('claudeUsage');
  const usage = result.claudeUsage || { requests: [], totalInput: 0, totalOutput: 0, totalCost: 0 };

  usage.requests.push({ ts: now, input: inputTokens, output: outputTokens, cost });
  usage.totalInput += inputTokens;
  usage.totalOutput += outputTokens;
  usage.totalCost += cost;

  // Keep only last 90 days of individual requests (for daily/weekly/monthly stats)
  const cutoff = now - 90 * 24 * 60 * 60 * 1000;
  usage.requests = usage.requests.filter(r => r.ts > cutoff);

  await chrome.storage.local.set({ claudeUsage: usage });
}

async function getUsageStats() {
  const result = await chrome.storage.local.get('claudeUsage');
  const usage = result.claudeUsage || { requests: [], totalInput: 0, totalOutput: 0, totalCost: 0 };

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  const periods = {
    today: now - DAY,
    week: now - 7 * DAY,
    month: now - 30 * DAY,
    year: now - 365 * DAY
  };

  const stats = { total: { input: usage.totalInput, output: usage.totalOutput, cost: usage.totalCost, requests: usage.requests.length } };

  for (const [name, since] of Object.entries(periods)) {
    const filtered = usage.requests.filter(r => r.ts > since);
    stats[name] = {
      input: filtered.reduce((s, r) => s + r.input, 0),
      output: filtered.reduce((s, r) => s + r.output, 0),
      cost: filtered.reduce((s, r) => s + r.cost, 0),
      requests: filtered.length
    };
  }

  // Current video (last batch of requests within 60s)
  const recentCutoff = now - 60000;
  const recent = usage.requests.filter(r => r.ts > recentCutoff);
  stats.currentVideo = {
    input: recent.reduce((s, r) => s + r.input, 0),
    output: recent.reduce((s, r) => s + r.output, 0),
    cost: recent.reduce((s, r) => s + r.cost, 0),
    requests: recent.length
  };

  return stats;
}

// --- B2B Service Mode Proxy ---

async function serviceTranslate(endpoint, authToken, orgId, text, sourceLang, targetLang, engine) {
  const resp = await fetch(`${endpoint}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...(orgId ? { 'X-Organization-Id': orgId } : {})
    },
    body: JSON.stringify({ text, sourceLang, targetLang, engine })
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Service API ${resp.status}: ${err.substring(0, 200)}`);
  }
  const data = await resp.json();
  return data.translated || data.text;
}

async function serviceSynthesize(endpoint, authToken, orgId, text, targetLang, voice) {
  const resp = await fetch(`${endpoint}/synthesize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...(orgId ? { 'X-Organization-Id': orgId } : {})
    },
    body: JSON.stringify({ text, targetLang, voice })
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Service TTS ${resp.status}: ${err.substring(0, 200)}`);
  }
  const data = await resp.json();
  return data.audioBase64;
}

// --- Gemini AI Chat ---

async function geminiChat(apiKey, systemInstruction, history, message) {
  if (!apiKey) throw new Error('No Gemini API key');

  const MODEL = 'gemini-3.1-flash-lite-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const contents = [
    ...history,
    { role: 'user', parts: [{ text: message }] }
  ];

  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.7
    }
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API ${resp.status}: ${err.substring(0, 300)}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Prázdná odpověď od Gemini');

  return text;
}
