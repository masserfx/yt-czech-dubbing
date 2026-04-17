/**
 * OpenAI translator adapter — secondary fallback.
 *
 * GPT-4o-mini: $ 0.15 / 1M input, $ 0.60 / 1M output. Srovnatelně levný
 * s Gemini 2.0-flash-lite, ale bez free tier. Používáme jen když Gemini
 * i DeepL selžou (429/5xx) nebo API klíče chybí.
 *
 * Docs: https://platform.openai.com/docs/api-reference/chat
 *
 * Kontrakt stejný jako gemini.js:
 *   translateBatch(segments, targetLang, { apiKey, glossary }) → string[]
 */

const MODEL = 'gpt-4o-mini';

const LANG_NAMES = {
  cs: 'Czech (čeština)',
  sk: 'Slovak (slovenčina)',
  pl: 'Polish (polski)',
  hu: 'Hungarian (magyar)',
};

export async function translateBatch(segments, targetLang, { apiKey, glossary = {} } = {}) {
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  if (!LANG_NAMES[targetLang]) throw new Error(`OpenAI unsupported target: ${targetLang}`);

  const glossaryBlock = Object.keys(glossary).length
    ? `\nGlossary (keep these terms unchanged):\n${Object.entries(glossary).map(([k, v]) => `- ${k} → ${v}`).join('\n')}\n`
    : '';

  const prompt = `You are a professional dubbing translator for corporate e-learning and training videos.
Translate the following numbered segments into ${LANG_NAMES[targetLang]}.

Rules:
- Preserve the speaker's tone (professional, instructional)
- Keep numbered format exactly: "1) ..." "2) ..." etc.
- Natural spoken rhythm — these will be read aloud by TTS
- Preserve brand names, product names, technical terms
- Contractions and natural speech patterns — not literal translation
${glossaryBlock}
Segments to translate:
${segments.map((s, i) => `${i + 1}) ${s}`).join('\n')}

Output the numbered translations only, no preamble, no commentary.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty OpenAI response');

  // Parse stejný formát jako Gemini.
  const out = [];
  const lines = text.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\)\s*(.+)$/);
    if (m) out[parseInt(m[1], 10) - 1] = m[2].trim();
  }
  if (out.filter(Boolean).length !== segments.length) {
    return lines.map((l) => l.replace(/^\d+\)\s*/, '').trim());
  }
  return out;
}
