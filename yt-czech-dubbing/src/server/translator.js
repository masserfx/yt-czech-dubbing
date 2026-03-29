const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_FREE_URL = 'https://api-free.deepl.com/v2/translate';
const DEEPL_PRO_URL = 'https://api.deepl.com/v2/translate';

/**
 * Translate an array of caption segments to Czech.
 * Uses DeepL API with batching for efficiency.
 *
 * @param {Array<{text: string, offset: number, duration: number}>} captions
 * @param {Function} onProgress - callback(done, total)
 * @returns {Array<{text: string, originalText: string, offset: number, duration: number}>}
 */
async function translateCaptions(captions, onProgress = null) {
  // Check if captions are already in Czech (basic heuristic)
  const sampleText = captions.slice(0, 5).map(c => c.text).join(' ');
  if (looksLikeCzech(sampleText)) {
    console.log('[Translator] Captions appear to be already in Czech');
    return captions;
  }

  if (!DEEPL_API_KEY) {
    console.warn('[Translator] No DEEPL_API_KEY set, falling back to free translation');
    return translateWithFallback(captions, onProgress);
  }

  const translated = [];
  const batchSize = 20; // DeepL supports up to 50 texts per request

  for (let i = 0; i < captions.length; i += batchSize) {
    const batch = captions.slice(i, i + batchSize);
    const texts = batch.map(c => c.text);

    try {
      const results = await translateDeepL(texts);

      for (let j = 0; j < batch.length; j++) {
        translated.push({
          ...batch[j],
          originalText: batch[j].text,
          text: results[j] || batch[j].text
        });
      }
    } catch (err) {
      console.error('[Translator] DeepL batch failed:', err.message);
      // Keep originals for failed batch
      for (const cap of batch) {
        translated.push({ ...cap, originalText: cap.text });
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + batchSize, captions.length), captions.length);
    }
  }

  return translated;
}

/**
 * Translate texts using DeepL API.
 */
async function translateDeepL(texts) {
  const isFreePlan = DEEPL_API_KEY.endsWith(':fx');
  const url = isFreePlan ? DEEPL_FREE_URL : DEEPL_PRO_URL;

  const body = new URLSearchParams();
  for (const t of texts) {
    body.append('text', t);
  }
  body.append('target_lang', 'CS');
  body.append('source_lang', 'EN');

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`DeepL API error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return data.translations.map(t => t.text);
}

/**
 * Fallback translation using Google Translate unofficial endpoint.
 */
async function translateWithFallback(captions, onProgress) {
  const translated = [];

  for (let i = 0; i < captions.length; i++) {
    const cap = captions[i];
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=cs&dt=t&q=${encodeURIComponent(cap.text)}`;
      const resp = await fetch(url);
      const data = await resp.json();

      const translatedText = data[0]
        ? data[0].map(item => item[0]).filter(Boolean).join('')
        : cap.text;

      translated.push({
        ...cap,
        originalText: cap.text,
        text: translatedText
      });
    } catch {
      translated.push({ ...cap, originalText: cap.text });
    }

    if (onProgress && i % 10 === 0) {
      onProgress(i + 1, captions.length);
    }

    // Rate limit: 100ms between requests
    if (i < captions.length - 1) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return translated;
}

/**
 * Simple heuristic to detect Czech text.
 */
function looksLikeCzech(text) {
  const czechChars = /[ěščřžýáíéúůďťň]/i;
  const czechWords = /\b(je|na|se|to|že|ale|nebo|jak|byl|jeho|jsou|byl|pro|tak|kde|když)\b/i;
  return czechChars.test(text) && czechWords.test(text);
}

module.exports = { translateCaptions };
