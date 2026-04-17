/**
 * Gemini 2.5 Flash překlad do cílového CEE jazyka.
 * Kontextový batch překlad s zachováním mluvčích a firemní terminologie.
 */
const MODEL = 'gemini-2.5-flash';

const LANG_NAMES = {
  cs: 'Czech (čeština)',
  sk: 'Slovak (slovenčina)',
  pl: 'Polish (polski)',
  hu: 'Hungarian (magyar)',
};

export async function translateBatch(segments, targetLang, { apiKey, glossary = {} } = {}) {
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');
  if (!LANG_NAMES[targetLang]) throw new Error(`Unsupported target: ${targetLang}`);

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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty Gemini response');

  // Parse back to array
  const out = [];
  const lines = text.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\)\s*(.+)$/);
    if (m) out[parseInt(m[1], 10) - 1] = m[2].trim();
  }
  // Pokud parsing nevyšel (např. multi-line segments), vrať raw split
  if (out.filter(Boolean).length !== segments.length) {
    return lines.map(l => l.replace(/^\d+\)\s*/, '').trim());
  }
  return out;
}
