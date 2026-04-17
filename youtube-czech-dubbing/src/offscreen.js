// Offscreen document: SpeechRecognition + mic access + Edge TTS WebSocket
console.log('[Offscreen] Document loaded and ready');

let recognition = null;
let micStream = null;

// ── Edge TTS via port-based communication (reliable) ──
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'edge-tts') return;

  port.onMessage.addListener(async (msg) => {
    console.log('[Offscreen] Edge TTS request via port, voice:', msg.voice);
    try {
      const audioBase64 = await synthesizeEdgeTTS(msg.text, msg.voice, msg.rate, msg.pitch, msg.gec);
      console.log('[Offscreen] Edge TTS success:', audioBase64.length, 'chars');
      port.postMessage({ success: true, audioBase64 });
    } catch (err) {
      console.error('[Offscreen] Edge TTS error:', err.message);
      port.postMessage({ success: false, error: err.message });
    }
  });
});

// ── Message-based handlers (mic, speech recognition) ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'offscreen-request-mic') {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => { micStream = stream; sendResponse({ granted: true }); })
      .catch(err => sendResponse({ granted: false, error: err.message }));
    return true;
  }

  if (msg.type === 'offscreen-start-recognition') {
    startRecognition(msg.lang || 'cs-CZ');
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'offscreen-stop-recognition') {
    stopRecognition();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

// ── Speech Recognition ──
function startRecognition(lang) {
  stopRecognition();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    chrome.runtime.sendMessage({ type: 'voice-error', error: 'SpeechRecognition not available' });
    return;
  }
  if (!micStream || !micStream.active) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => { micStream = stream; doStart(SR, lang); })
      .catch(err => chrome.runtime.sendMessage({ type: 'voice-error', error: err.message }));
  } else {
    doStart(SR, lang);
  }
}

function doStart(SR, lang) {
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang;
  recognition.onresult = (event) => {
    let interim = '', final = '';
    for (let i = 0; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t; else interim += t;
    }
    chrome.runtime.sendMessage({ type: 'voice-result', final, interim });
  };
  recognition.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    chrome.runtime.sendMessage({ type: 'voice-error', error: e.error });
  };
  recognition.onend = () => chrome.runtime.sendMessage({ type: 'voice-ended' });
  try {
    recognition.start();
    chrome.runtime.sendMessage({ type: 'voice-started' });
  } catch (e) {
    chrome.runtime.sendMessage({ type: 'voice-error', error: e.message });
  }
}

function stopRecognition() {
  if (recognition) { try { recognition.abort(); } catch (e) {} recognition = null; }
}

// ── Edge TTS WebSocket synthesis ──
const EDGE_TTS_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_TTS_GEC_VERSION = '1-143.0.3650.75';
const EDGE_TTS_BASE = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function synthesizeEdgeTTS(text, voice = 'cs-CZ-AntoninNeural', rate = 1.0, pitch = 1.0, gec = '') {
  if (!text || text.trim().length === 0) throw new Error('Empty text');

  const connectionId = crypto.randomUUID().replace(/-/g, '');
  const wssUrl = `${EDGE_TTS_BASE}?TrustedClientToken=${EDGE_TTS_TOKEN}&ConnectionId=${connectionId}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${EDGE_TTS_GEC_VERSION}`;
  console.log('[Edge TTS] Connecting WebSocket with GEC auth...');

  return new Promise((resolve, reject) => {
    const requestId = connectionId;
    const ws = new WebSocket(wssUrl);
    const audioChunks = [];
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) { resolved = true; ws.close(); reject(new Error('Edge TTS timeout (15s)')); }
    }, 15000);

    ws.onopen = () => {
      console.log(`[Edge TTS] Connected! voice=${voice}`);
      const ts = new Date().toISOString();
      ws.send(
        `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      );

      const rateStr = rate !== 1.0 ? `${Math.round((rate - 1) * 100)}%` : '+0%';
      const pitchStr = pitch !== 1.0 ? `${Math.round((pitch - 1) * 50)}%` : '+0%';
      const xmlLang = voice.substring(0, 5) || 'cs-CZ';
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${xmlLang}'><voice name='${voice}'><prosody rate='${rateStr}' pitch='${pitchStr}'>${escapeXml(text)}</prosody></voice></speak>`;
      ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n${ssml}`);
    };

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          clearTimeout(timeout);
          resolved = true;
          ws.close();
          if (audioChunks.length === 0) { reject(new Error('No audio chunks')); return; }
          const blob = new Blob(audioChunks, { type: 'audio/mpeg' });
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let bin = '';
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          console.log(`[Edge TTS] Done: ${audioChunks.length} chunks, ${bytes.length} bytes`);
          resolve(btoa(bin));
        }
      } else if (event.data instanceof Blob) {
        const buffer = await event.data.arrayBuffer();
        const view = new DataView(buffer);
        const headerLen = view.getUint16(0);
        if (buffer.byteLength > 2 + headerLen) audioChunks.push(buffer.slice(2 + headerLen));
      } else if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        const headerLen = view.getUint16(0);
        if (event.data.byteLength > 2 + headerLen) audioChunks.push(event.data.slice(2 + headerLen));
      }
    };

    ws.onerror = (err) => {
      console.error('[Edge TTS] WebSocket error:', err);
      clearTimeout(timeout);
      if (!resolved) { resolved = true; reject(new Error('Edge TTS WebSocket error')); }
    };

    ws.onclose = (event) => {
      console.log(`[Edge TTS] WebSocket closed: code=${event.code}, chunks=${audioChunks.length}`);
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        if (audioChunks.length > 0) {
          const blob = new Blob(audioChunks, { type: 'audio/mpeg' });
          blob.arrayBuffer().then(buffer => {
            const bytes = new Uint8Array(buffer);
            let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            resolve(btoa(bin));
          });
        } else {
          reject(new Error(`Edge TTS closed: code=${event.code}`));
        }
      }
    };
  });
}
