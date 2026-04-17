#!/usr/bin/env node
/**
 * Generuje cinematic video clip přes Veo 3.1 Lite API.
 * Free tier: ~10 videí/den přes Google AI Studio.
 * Použití:
 *   export GEMINI_API_KEY=<klíč z aistudio.google.com>
 *   node generate-veo-clip.js
 *
 * Output: public/videos/hero-clip.mp4 (8s, 720p)
 */
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'veo-3.1-lite'; // cost-effective, free tier via AI Studio
const OUT_DIR = path.join(__dirname, 'public', 'videos');

const PROMPT = `Cinematic hero shot, Apple product launch aesthetic. A corporate video thumbnail materializes in deep black space. Camera slowly pushes in (cinematic dolly-in). Subtle blue-purple-pink nebula particles drift around it. Soft ambient lighting, shallow depth of field. As camera approaches, audio waveforms emerge from the video and transform into flowing text in Czech, Slovak, Polish, Hungarian. 8 seconds, 720p, smooth 24fps, dramatic but minimal, no text overlays, premium product reveal.`;

async function startGeneration() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateVideo?key=${API_KEY}`;
  const body = {
    prompt: PROMPT,
    config: { duration: 8, resolution: '720p', aspectRatio: '16:9' },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Start ${res.status}: ${await res.text()}`);
  return res.json(); // { name: 'operations/...' }
}

async function pollOperation(operationName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${API_KEY}`;
  for (let i = 0; i < 60; i++) { // max ~10 min
    const res = await fetch(url);
    const json = await res.json();
    if (json.done) return json;
    console.log(`⏳ ${Math.round(((i + 1) / 60) * 100)}% — Veo generates video...`);
    await new Promise(r => setTimeout(r, 10000));
  }
  throw new Error('Timeout');
}

async function main() {
  if (!API_KEY) {
    console.error('\n❌ GEMINI_API_KEY není nastavený. Získejte zdarma: https://aistudio.google.com/app/apikey\n');
    process.exit(1);
  }
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`🎬 Start generování ${MODEL} clipu (~30-120s)...`);
  try {
    const op = await startGeneration();
    console.log(`✅ Operation: ${op.name}`);
    const result = await pollOperation(op.name);
    const videoUri = result.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error('No video in response');
    // Stáhni
    const videoRes = await fetch(videoUri + '?key=' + API_KEY);
    const buf = Buffer.from(await videoRes.arrayBuffer());
    const outPath = path.join(OUT_DIR, 'hero-clip.mp4');
    fs.writeFileSync(outPath, buf);
    console.log(`\n🎉 Hotovo: ${outPath} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Otevři http://localhost:3847/demo.html — clip se automaticky nahraje v hero sekci.`);
  } catch (e) {
    console.error(`❌ ${e.message}`);
    console.log(`\nℹ️  Pokud Veo 3.1 Lite není v free tieru aktivní pro váš účet, fallback = CSS animace v demo.html fungují nezávisle.`);
  }
}

main();
