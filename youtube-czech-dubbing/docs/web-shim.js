/**
 * web-shim.js
 *
 * Lets the same code that powers the Chrome extension run as a plain
 * web page on iPhone / Android Safari / desktop browser. Polyfills:
 *
 *   - chrome.storage.local  → localStorage
 *   - chrome.storage.onChanged.addListener → no-op
 *   - chrome.runtime.sendMessage → direct fetch into the matching API
 *
 * The supported messages mirror background.js handlers:
 *   - synthesize-gemini-tts
 *   - synthesize-azure-tts
 *   - gemini-audio-translate
 *   - translate-deepl
 *   - synthesize-edge-tts → not supported (needs DNR header rewrite)
 *
 * Failures return { success: false, error: ... } just like the extension
 * background does, so the rest of the code stays unchanged.
 */
(function () {
  if (window.chrome?.storage?.local) return; // already in extension context

  // ───────── chrome.storage.local ─────────
  const STORAGE_PREFIX = 'aura:';
  const storageLocal = {
    async get(keys) {
      const out = {};
      const arr = !keys
        ? Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX)).map(k => k.slice(STORAGE_PREFIX.length))
        : (typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys));
      for (const k of arr) {
        const raw = localStorage.getItem(STORAGE_PREFIX + k);
        if (raw != null) {
          try { out[k] = JSON.parse(raw); } catch { out[k] = raw; }
        } else if (typeof keys === 'object' && !Array.isArray(keys) && keys != null && k in keys) {
          out[k] = keys[k];
        }
      }
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items || {})) {
        localStorage.setItem(STORAGE_PREFIX + k, JSON.stringify(v));
      }
    },
    async remove(keys) {
      const arr = typeof keys === 'string' ? [keys] : keys;
      for (const k of arr) localStorage.removeItem(STORAGE_PREFIX + k);
    }
  };

  // ───────── chrome.runtime.sendMessage → direct API ─────────
  async function sendMessage(msg) {
    try {
      switch (msg?.type) {
        case 'synthesize-gemini-tts':
          return await directGeminiTTS(msg);
        case 'synthesize-azure-tts':
          return await directAzureTTS(msg);
        case 'gemini-audio-translate':
          return await directGeminiAudioTranslate(msg);
        case 'translate-deepl':
          return await directDeepL(msg);
        case 'translate-google':
          return await directGoogleTranslate(msg);
        case 'translate-gemini':
          return await directGeminiTranslate(msg);
        case 'translate-mymemory':
          return await directMyMemory(msg);
        case 'translate-libre':
          return { success: false, error: 'LibreTranslate není ve webové verzi.' };
        case 'translate-claude':
          return { success: false, error: 'Claude vyžaduje proxy — vyberte Gemini nebo Google Translate.' };
        case 'synthesize-edge-tts':
          return { success: false, error: 'Edge TTS není ve webové verzi (vyžaduje extension). Vyberte Gemini TTS nebo systémový hlas.' };
        case 'ping':
          return { success: true };
        case 'open-live-translate':
          return { success: true };
        default:
          return { success: false, error: 'Unsupported message type in web shim: ' + msg?.type };
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  // ───────── direct API implementations ─────────

  async function directGeminiTTS({ text, apiKey, voice = 'Aoede', rate = 1.0, lang = 'cs-CZ' }) {
    if (!apiKey) throw new Error('No Gemini API key');
    if (!text || !text.trim()) throw new Error('Empty text');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${apiKey}`;
    const tone = rate > 1.4 ? 'fluently and clearly, slightly faster pace' :
                 rate < 0.85 ? 'calmly and deliberately, slightly slower pace' :
                 'naturally, in a clear conversational tone';
    const styleHint = `Read the following ${lang.startsWith('cs') ? 'Czech' : ''} text ${tone}: `;
    const body = {
      contents: [{ parts: [{ text: styleHint + text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
      }
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Gemini TTS HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`);
    const data = await res.json();
    const part = data?.candidates?.[0]?.content?.parts?.[0];
    const inline = part?.inlineData || part?.inline_data;
    const pcmBase64 = inline?.data;
    if (!pcmBase64) throw new Error('Gemini TTS returned no audio data');
    const mime = inline?.mimeType || inline?.mime_type || '';
    const rateMatch = mime.match(/rate=(\d+)/);
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
    const audioBase64 = pcmBase64ToWavBase64(pcmBase64, sampleRate, 1, 16);
    return { success: true, audioBase64 };
  }

  async function directAzureTTS({ text, apiKey, region = 'westeurope', voice, lang = 'cs-CZ', rate = 1.0, pitch = 1.0 }) {
    if (!apiKey) throw new Error('Chybí Azure Speech klíč');
    const ratePct = `${Math.round((rate - 1) * 100)}%`;
    const pitchPct = `${Math.round((pitch - 1) * 100)}%`;
    const xmlLang = lang.includes('-') ? lang : `${lang}-${lang.toUpperCase()}`;
    const ssml =
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xmlLang}">` +
        `<voice name="${voice}"><prosody rate="${ratePct}" pitch="${pitchPct}">${escapeXml(text)}</prosody></voice>` +
      `</speak>`;
    const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'AuraLive/1.0'
      },
      body: ssml
    });
    if (!res.ok) throw new Error(`Azure TTS HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`);
    const buf = await res.arrayBuffer();
    return { success: true, audioBase64: arrayBufferToBase64(buf) };
  }

  async function directGeminiAudioTranslate({ apiKey, audioBase64, mimeType, sourceLang, targetLang }) {
    if (!apiKey) throw new Error('No Gemini API key');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
    const langHint = (!sourceLang || sourceLang === 'auto')
      ? 'Detect the spoken language automatically.'
      : `The audio is in ${sourceLang}.`;
    const targetName = ({
      cs: 'Czech', sk: 'Slovak', pl: 'Polish', hu: 'Hungarian',
      de: 'German', en: 'English', fr: 'French', es: 'Spanish',
      sv: 'Swedish', da: 'Danish', nb: 'Norwegian', fi: 'Finnish'
    })[targetLang] || targetLang;
    const promptText =
      `You are a real-time interpreter. ${langHint}\n` +
      `Transcribe the speech literally, then translate to ${targetName}.\n` +
      `Return ONLY a single JSON object on one line, no prose, no markdown:\n` +
      `{"original":"<verbatim transcript>","translated":"<${targetName} translation>","sourceLang":"<BCP-47>"}\n` +
      `If the audio contains no speech, return {"original":"","translated":"","sourceLang":""}.`;
    const body = {
      contents: [{
        parts: [
          { text: promptText },
          { inlineData: { mimeType: mimeType || 'audio/webm', data: audioBase64 } }
        ]
      }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Gemini ASR HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`);
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }
    return {
      success: true,
      original: (parsed?.original || '').trim(),
      translated: (parsed?.translated || '').trim(),
      sourceLang: parsed?.sourceLang || sourceLang || ''
    };
  }

  async function directGoogleTranslate({ text, sourceLang, targetLang = 'cs' }) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang || 'auto'}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}`);
    const data = await res.json();
    if (data && data[0]) {
      const translated = data[0].filter(Boolean).map(it => it[0]).join('');
      return { success: true, translated };
    }
    return { success: false, error: 'No translation in Google response' };
  }

  async function directGeminiTranslate({ text, sourceLang, apiKey, targetLang = 'cs' }) {
    if (!apiKey) throw new Error('Chybí Gemini API klíč');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
    const targetName = ({
      cs: 'Czech', sk: 'Slovak', pl: 'Polish', hu: 'Hungarian',
      de: 'German', en: 'English', fr: 'French', es: 'Spanish',
      sv: 'Swedish', da: 'Danish', nb: 'Norwegian', fi: 'Finnish'
    })[targetLang] || targetLang;
    const prompt =
      `Translate the following text to ${targetName}. ` +
      `Return only the translated text, no explanations, no quotes.\n\n` +
      `Text: ${text}`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 }
    };
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Gemini Translate HTTP ${res.status}: ${(await res.text()).slice(0,240)}`);
    const data = await res.json();
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { success: true, translated: out.trim() };
  }

  async function directMyMemory({ text, sourceLang, targetLang = 'cs' }) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang || 'en'}|${targetLang}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
    const data = await res.json();
    return { success: true, translated: data?.responseData?.translatedText || '' };
  }

  async function directDeepL({ text, sourceLang, apiKey, targetLang = 'CS' }) {
    if (!apiKey) throw new Error('Chybí DeepL klíč');
    const isPro = !apiKey.endsWith(':fx');
    const url = isPro ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate';
    const params = new URLSearchParams({ text, target_lang: targetLang.toUpperCase() });
    if (sourceLang) params.set('source_lang', sourceLang.toUpperCase());
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    if (!res.ok) throw new Error(`DeepL HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`);
    const data = await res.json();
    return { success: true, translated: data?.translations?.[0]?.text || '' };
  }

  // ───────── helpers ─────────

  function pcmBase64ToWavBase64(pcmBase64, sampleRate, channels, bitsPerSample) {
    const binary = atob(pcmBase64);
    const pcm = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) pcm[i] = binary.charCodeAt(i);
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    const dataSize = pcm.length;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE'); writeStr(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true); view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true); writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    new Uint8Array(buffer, 44).set(pcm);
    return arrayBufferToBase64(buffer);
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  function escapeXml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  // ───────── install global ─────────
  window.chrome = {
    storage: {
      local: storageLocal,
      onChanged: { addListener: () => {} }
    },
    runtime: {
      sendMessage: (msg, cb) => {
        const p = sendMessage(msg);
        if (typeof cb === 'function') p.then(cb, e => cb({ success: false, error: e?.message }));
        return p;
      },
      onMessage: { addListener: () => {} },
      lastError: null,
      getURL: (path) => new URL(path, location.href).toString()
    }
  };
})();
