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
    fetchTranscriptJson3(msg.url)
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
 * Fetch transcript in JSON3 format from YouTube timedtext API.
 * Runs in service worker context — not affected by uBlock.
 */
async function fetchTranscriptJson3(url) {
  console.log(`[CzechDub:BG] Fetching transcript: ${url.substring(0, 200)}`);

  const resp = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Referer': 'https://www.youtube.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    }
  });

  console.log(`[CzechDub:BG] Transcript response: status=${resp.status}`);

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const text = await resp.text();
  console.log(`[CzechDub:BG] Transcript body: ${text.length} chars, first 200: ${text.substring(0, 200)}`);

  if (!text || text.length < 20) {
    throw new Error('Empty transcript response');
  }

  const data = JSON.parse(text);

  if (!data.events) {
    console.warn('[CzechDub:BG] No events in transcript. Keys:', Object.keys(data).join(', '));
    throw new Error('No events in transcript data');
  }

  const segments = data.events
    .filter(event => event.segs && event.segs.length > 0)
    .map(event => ({
      start: (event.tStartMs || 0) / 1000,
      duration: (event.dDurationMs || 0) / 1000,
      text: event.segs.map(s => s.utf8 || '').join('').trim()
    }))
    .filter(seg => seg.text.length > 0 && seg.text !== '\n');

  console.log(`[CzechDub:BG] Parsed ${segments.length} transcript segments`);
  return segments;
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
