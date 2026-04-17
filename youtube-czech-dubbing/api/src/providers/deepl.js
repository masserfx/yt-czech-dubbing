/**
 * DeepL translator adapter — fallback provider.
 *
 * DeepL má nejvyšší kvalitu pro CEE (CS/PL/HU), ale drahý (€ 5.49 / 1M znaků)
 * a nepodporuje glossary v free tier. Používáme jako primary fallback pro
 * kvalitu, secondary za Gemini (cena/limit).
 *
 * Docs: https://developers.deepl.com/docs/api-reference/translate
 *
 * Kontrakt:
 *   translateBatch(segments, targetLang, { apiKey, glossary }) → string[]
 */

const LANG_MAP = {
  cs: 'CS',
  sk: 'SK',
  pl: 'PL',
  hu: 'HU',
  en: 'EN-US',
};

export async function translateBatch(segments, targetLang, { apiKey, glossary = {} } = {}) {
  if (!apiKey) throw new Error('DEEPL_API_KEY missing');
  if (!LANG_MAP[targetLang]) throw new Error(`DeepL unsupported target: ${targetLang}`);

  // DeepL API free endpoint = api-free.deepl.com, paid = api.deepl.com.
  // Paid klíč končí ':fx' NENÍ, free končí ':fx'. Detekujeme podle suffixu.
  const isFree = apiKey.endsWith(':fx');
  const base = isFree ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const url = `${base}/v2/translate`;

  // Pre-process glossary: nahradíme termíny placeholdery, pak zpátky po překladu.
  const glossaryKeys = Object.keys(glossary);
  const processed = segments.map((s) => {
    let out = s;
    glossaryKeys.forEach((term, i) => {
      out = out.replace(new RegExp(`\\b${term}\\b`, 'gi'), `__GLOSS${i}__`);
    });
    return out;
  });

  const form = new URLSearchParams();
  form.append('target_lang', LANG_MAP[targetLang]);
  form.append('preserve_formatting', '1');
  form.append('formality', 'prefer_more'); // firemní tón
  processed.forEach((s) => form.append('text', s));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!res.ok) {
    throw new Error(`DeepL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = await res.json();
  return data.translations.map((t) => {
    let restored = t.text;
    glossaryKeys.forEach((term, i) => {
      const target = glossary[term] || term;
      restored = restored.replace(new RegExp(`__GLOSS${i}__`, 'g'), target);
    });
    return restored;
  });
}
