#!/usr/bin/env node
/**
 * Generuje cinematic keyframes přes Gemini 2.5 Flash Image API (free tier 500 req/den).
 * Použití:
 *   export GEMINI_API_KEY=<klíč z aistudio.google.com>
 *   node generate-keyframes.js
 *
 * Obrázky se ukládají do public/keyframes/scene-N.png a demo.html je automaticky použije.
 */
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash-image'; // free tier 500 req/day
const OUT_DIR = path.join(__dirname, 'public', 'keyframes');

// Scénáře pro cinematic demo — každý frame má Apple-style aesthetic
const SCENES = [
  {
    name: 'scene-1-upload',
    prompt: 'Cinematic 16:9 hero shot, Apple-style aesthetic. A modern corporate e-learning video thumbnail floating in deep black space with subtle blue-purple nebula glow behind. The video preview shows a professional instructor at a futuristic cybersecurity dashboard. Minimalist, premium, product photography quality. 4K, sharp focus, dramatic lighting, no text overlay.'
  },
  {
    name: 'scene-2-transcribe',
    prompt: 'Cinematic 16:9 macro shot of luminous audio waveforms being processed by AI, flowing particles of light transitioning from raw waveform on the left to clean transcribed text fragments on the right. Deep black background, blue-purple gradient glow, Apple product launch aesthetic. Abstract, ethereal, technological sublime. No text, just visualization.'
  },
  {
    name: 'scene-3-translate',
    prompt: 'Cinematic 16:9 shot of flowing ribbons of translucent light connecting European flags of Czech Republic, Slovakia, Poland, Hungary. Each flag is dissolved into abstract particle streams. Center: a glowing neural network core in blue-purple-pink gradient. Apple aesthetic, product photography, premium, minimal. No visible text.'
  },
  {
    name: 'scene-4-voices',
    prompt: 'Cinematic 16:9 image of four floating spherical orbs representing synthetic voices, each with a national color glow: Czech (red-blue), Slovak (blue), Polish (red-white), Hungarian (red-green). Orbs emit concentric sound-wave rings of energy. Deep black cinematic backdrop, studio lighting, Apple product reveal style. Premium, minimalist.'
  },
  {
    name: 'scene-5-result',
    prompt: 'Cinematic 16:9 hero shot of a final polished video player hovering in deep space, emitting a gradient gold-to-blue glow. The player shows completion checkmarks. Background: clock hands dissolving into light particles, symbolizing speed. Apple launch reveal aesthetic, premium product photography, 4K sharp, no text.'
  },
];

async function generateImage(scene) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: scene.prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'] },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
  }
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imgPart) throw new Error('No image in response: ' + JSON.stringify(json).slice(0, 300));
  return Buffer.from(imgPart.inlineData.data, 'base64');
}

async function main() {
  if (!API_KEY) {
    console.error('\n❌ GEMINI_API_KEY není nastavený.');
    console.error('\nZískejte klíč zdarma na: https://aistudio.google.com/app/apikey');
    console.error('Pak spusťte:  export GEMINI_API_KEY=<klíč>  &&  node generate-keyframes.js\n');
    process.exit(1);
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`🎬 Generuji ${SCENES.length} cinematic keyframes přes ${MODEL}...\n`);
  for (const scene of SCENES) {
    const outPath = path.join(OUT_DIR, `${scene.name}.png`);
    if (fs.existsSync(outPath)) {
      console.log(`⏭  ${scene.name} už existuje — přeskakuji`);
      continue;
    }
    try {
      console.log(`🎨 ${scene.name}...`);
      const buf = await generateImage(scene);
      fs.writeFileSync(outPath, buf);
      console.log(`✅ ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
      await new Promise(r => setTimeout(r, 500)); // rate-limit friendly
    } catch (e) {
      console.error(`❌ ${scene.name}: ${e.message}`);
    }
  }
  console.log(`\n🎬 Hotovo. Otevři http://localhost:3847/demo.html`);
}

main().catch(e => { console.error(e); process.exit(1); });
