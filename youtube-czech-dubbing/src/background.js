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
        ttsRate: 1.1,
        ttsVolume: 0.95,
        ttsPitch: 1.0,
        reducedOriginalVolume: 0.15,
        muteOriginal: false
      }
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
    translateMyMemory(msg.text, msg.sourceLang)
      .then(result => sendResponse({ success: true, translated: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (msg.type === 'translate-libre') {
    translateLibre(msg.text, msg.sourceLang)
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

  if (msg.type === 'translate-google') {
    translateGoogle(msg.text, msg.sourceLang)
      .then(result => sendResponse({ success: true, translated: result }))
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
 * Get YouTube cookies as a Cookie header string.
 */
async function getYouTubeCookies() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.youtube.com' });
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } catch (e) {
    console.warn('[CzechDub:BG] Failed to get YouTube cookies:', e);
    return '';
  }
}

/**
 * Download and parse captions from a YouTube caption track URL.
 * Uses YouTube cookies for authentication.
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
async function translateMyMemory(text, sourceLang) {
  const langPair = `${sourceLang}|cs`;
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
async function translateLibre(text, sourceLang) {
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
          target: 'cs',
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

  // Extract captionTracks from ytInitialPlayerResponse
  let captionTracks = null;
  const playerRespMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|const|let|<\/script)/s);
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

      if (text && text.length > 20) {
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
      }
      console.log('[CzechDub:BG] baseUrl fetch returned empty, trying innertube /get_transcript...');
    }
  }

  // Fallback: innertube /get_transcript
  // Extract transcript params from ytInitialData in page HTML
  let transcriptParams = null;
  const initDataMatch = html.match(/ytInitialData\s*=\s*(\{.+?\});\s*(?:var|const|let|<\/script)/s);
  if (initDataMatch) {
    try {
      const initData = JSON.parse(initDataMatch[1]);
      transcriptParams = findDeepValue(initData, 'getTranscriptEndpoint', 'params');
    } catch (e) {
      console.warn('[CzechDub:BG] Failed to parse ytInitialData:', e.message);
    }
  }

  if (!transcriptParams) {
    // Try /next endpoint
    console.log('[CzechDub:BG] No params in page, calling /youtubei/v1/next...');
    const nextResp = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20250320.01.00' } },
        videoId: videoId
      })
    });
    const nextData = await nextResp.json();
    transcriptParams = findDeepValue(nextData, 'getTranscriptEndpoint', 'params');
  }

  if (!transcriptParams) {
    throw new Error('No transcript params found — video may not have a transcript');
  }

  console.log('[CzechDub:BG] Got transcript params, calling /get_transcript...');

  const transcriptResp = await fetch('https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: '2.20250320.01.00' } },
      params: transcriptParams
    })
  });
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
async function translateGoogle(text, sourceLang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=cs&dt=t&q=${encodeURIComponent(text)}`;
  const resp = await fetch(url);
  const data = await resp.json();

  if (data && data[0]) {
    return data[0].map(item => item[0]).join('');
  }
  return null;
}
