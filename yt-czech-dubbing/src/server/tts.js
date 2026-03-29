const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { ensureDir } = require('./utils');

const execFileAsync = promisify(execFile);

const PIPER_PATH = process.env.PIPER_PATH || 'piper';
const PIPER_MODEL = process.env.PIPER_MODEL || '';

/**
 * Generate a full Czech audio track from translated captions.
 * Uses Piper TTS to generate speech for each segment,
 * then FFmpeg to assemble them with correct timing.
 *
 * @param {string} videoId
 * @param {Array<{text: string, offset: number, duration: number}>} captions
 * @param {string} tmpDir
 * @param {Function} onProgress
 * @returns {string} Path to the final audio file
 */
async function generateAudio(videoId, captions, tmpDir, onProgress = null) {
  const workDir = path.join(tmpDir, videoId);
  await ensureDir(workDir);

  // Check if Piper is available
  const usePiper = await isPiperAvailable();

  // Step 1: Generate individual WAV files for each caption
  const segments = [];

  for (let i = 0; i < captions.length; i++) {
    const cap = captions[i];
    if (!cap.text || cap.text.trim().length === 0) continue;

    const wavPath = path.join(workDir, `seg_${i.toString().padStart(4, '0')}.wav`);

    try {
      if (usePiper) {
        await generateWithPiper(cap.text, wavPath);
      } else {
        // Fallback: generate silence placeholder
        // In production, use Google Cloud TTS or Azure TTS
        await generateSilence(wavPath, cap.duration);
        console.warn(`[TTS] Piper not available, generated silence for segment ${i}`);
      }

      segments.push({
        index: i,
        wavPath,
        offset: cap.offset,
        duration: cap.duration,
        text: cap.text
      });
    } catch (err) {
      console.error(`[TTS] Failed to generate segment ${i}:`, err.message);
    }

    if (onProgress) {
      onProgress(i + 1, captions.length);
    }
  }

  // Step 2: Assemble into final audio with correct timing
  const outputPath = path.join(tmpDir, `${videoId}_czech.mp3`);
  await assembleAudio(segments, outputPath, workDir);

  // Cleanup individual WAV files
  for (const seg of segments) {
    try { fs.unlinkSync(seg.wavPath); } catch {}
  }
  try { fs.rmdirSync(workDir); } catch {}

  return outputPath;
}

/**
 * Generate speech using Piper TTS.
 */
async function generateWithPiper(text, outputPath) {
  const args = ['--output_file', outputPath];
  if (PIPER_MODEL) {
    args.push('--model', PIPER_MODEL);
  }

  await new Promise((resolve, reject) => {
    const proc = require('child_process').spawn(PIPER_PATH, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Piper exited ${code}: ${stderr}`));
    });
    proc.on('error', reject);

    // Send text via stdin
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

/**
 * Generate a silence WAV file (fallback when TTS unavailable).
 */
async function generateSilence(outputPath, durationSec) {
  const duration = Math.max(0.1, durationSec || 1);
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', `anullsrc=r=22050:cl=mono`,
      '-t', duration.toString(),
      '-q:a', '9',
      outputPath
    ]);
  } catch {
    // Create a minimal WAV file if ffmpeg is not available
    const header = createWavHeader(22050, Math.floor(duration * 22050));
    fs.writeFileSync(outputPath, header);
  }
}

/**
 * Create a minimal WAV file header with silence.
 */
function createWavHeader(sampleRate, numSamples) {
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);      // chunk size
  buffer.writeUInt16LE(1, 20);       // PCM
  buffer.writeUInt16LE(1, 22);       // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32);       // block align
  buffer.writeUInt16LE(16, 34);      // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  // Data is already zero (silence)

  return buffer;
}

/**
 * Assemble individual audio segments into a single timed audio track.
 * Uses FFmpeg to place each segment at the correct offset.
 */
async function assembleAudio(segments, outputPath, workDir) {
  if (segments.length === 0) {
    throw new Error('No audio segments to assemble');
  }

  // Calculate total duration (last segment end)
  const totalDuration = Math.max(
    ...segments.map(s => s.offset + s.duration)
  ) + 1; // +1s buffer

  // Create FFmpeg filter complex to position each segment
  const inputs = [];
  const filterParts = [];

  // Start with silence base track
  inputs.push('-f', 'lavfi', '-i', `anullsrc=r=22050:cl=mono`);
  inputs.push('-t', totalDuration.toString());

  for (let i = 0; i < segments.length; i++) {
    inputs.push('-i', segments[i].wavPath);
  }

  // Build amerge filter: delay each segment to its offset
  let currentMix = '[0:a]';
  for (let i = 0; i < segments.length; i++) {
    const delayMs = Math.round(segments[i].offset * 1000);
    const inputLabel = `[${i + 1}:a]`;
    const delayedLabel = `[d${i}]`;
    const mixLabel = i < segments.length - 1 ? `[m${i}]` : '';

    filterParts.push(`${inputLabel}adelay=${delayMs}|${delayMs}${delayedLabel}`);

    if (i < segments.length - 1) {
      filterParts.push(`${currentMix}${delayedLabel}amix=inputs=2:duration=longest${mixLabel}`);
      currentMix = mixLabel;
    } else {
      filterParts.push(`${currentMix}${delayedLabel}amix=inputs=2:duration=longest`);
    }
  }

  const filterComplex = filterParts.join(';');

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      ...inputs,
      '-filter_complex', filterComplex,
      '-ac', '1',
      '-ar', '22050',
      '-b:a', '64k',
      outputPath
    ], { timeout: 300000 }); // 5 minute timeout
  } catch (err) {
    // Fallback: simple concatenation without timing
    console.warn('[TTS] Complex FFmpeg filter failed, using simple concat:', err.message);
    await simpleConcatAudio(segments, outputPath, workDir);
  }
}

/**
 * Simple audio concatenation fallback.
 */
async function simpleConcatAudio(segments, outputPath, workDir) {
  const listPath = path.join(workDir, 'concat.txt');
  const listContent = segments
    .map(s => `file '${s.wavPath}'`)
    .join('\n');
  fs.writeFileSync(listPath, listContent);

  await execFileAsync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0',
    '-i', listPath,
    '-b:a', '64k',
    outputPath
  ]);
}

/**
 * Check if Piper TTS binary is available.
 */
async function isPiperAvailable() {
  try {
    await execFileAsync(PIPER_PATH, ['--version']);
    return true;
  } catch {
    return false;
  }
}

module.exports = { generateAudio };
