const express = require('express');
const path = require('path');
const { extractCaptions } = require('./captions');
const { translateCaptions } = require('./translator');
const { generateAudio } = require('./tts');
const { ensureDir } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;
const TMP_DIR = process.env.TMP_DIR || path.join(__dirname, '../../tmp');

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Store jobs in memory (use Redis for production)
const jobs = new Map();

/**
 * POST /api/dub
 * Start dubbing process for a YouTube video.
 * Body: { url: "https://youtube.com/watch?v=..." }
 */
app.post('/api/dub', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  // Check if we already have this video processed
  const existing = jobs.get(videoId);
  if (existing && existing.status === 'done') {
    return res.json(existing);
  }

  // Start processing in background
  const job = { videoId, status: 'processing', step: 'captions', progress: 0 };
  jobs.set(videoId, job);
  res.json(job);

  // Process asynchronously
  processVideo(videoId, job).catch(err => {
    console.error(`[DUB] Error processing ${videoId}:`, err);
    job.status = 'error';
    job.error = err.message;
  });
});

/**
 * GET /api/status/:videoId
 * Check the status of a dubbing job.
 */
app.get('/api/status/:videoId', (req, res) => {
  const job = jobs.get(req.params.videoId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

/**
 * GET /api/audio/:videoId
 * Serve the generated Czech audio file.
 */
app.get('/api/audio/:videoId', (req, res) => {
  const job = jobs.get(req.params.videoId);
  if (!job || job.status !== 'done') {
    return res.status(404).json({ error: 'Audio not ready' });
  }
  res.sendFile(path.resolve(job.audioPath));
});

/**
 * GET /api/subtitles/:videoId
 * Serve the Czech subtitles as JSON.
 */
app.get('/api/subtitles/:videoId', (req, res) => {
  const job = jobs.get(req.params.videoId);
  if (!job || !job.czechCaptions) {
    return res.status(404).json({ error: 'Subtitles not ready' });
  }
  res.json(job.czechCaptions);
});

/**
 * Process a video: extract captions, translate, generate TTS audio.
 */
async function processVideo(videoId, job) {
  await ensureDir(TMP_DIR);

  // Step 1: Extract captions
  job.step = 'captions';
  job.progress = 10;
  console.log(`[DUB] Extracting captions for ${videoId}...`);
  const captions = await extractCaptions(videoId);
  if (!captions || captions.length === 0) {
    throw new Error('No captions available for this video');
  }
  console.log(`[DUB] Got ${captions.length} caption segments`);
  job.progress = 25;

  // Step 2: Translate to Czech
  job.step = 'translating';
  job.progress = 30;
  console.log(`[DUB] Translating ${captions.length} segments to Czech...`);
  const czechCaptions = await translateCaptions(captions, (done, total) => {
    job.progress = 30 + Math.round((done / total) * 30);
  });
  job.czechCaptions = czechCaptions;
  console.log(`[DUB] Translation complete`);
  job.progress = 60;

  // Step 3: Generate Czech audio
  job.step = 'generating_audio';
  job.progress = 65;
  console.log(`[DUB] Generating Czech audio...`);
  const audioPath = await generateAudio(videoId, czechCaptions, TMP_DIR, (done, total) => {
    job.progress = 65 + Math.round((done / total) * 30);
  });
  job.progress = 95;

  // Done
  job.status = 'done';
  job.step = 'complete';
  job.progress = 100;
  job.audioPath = audioPath;
  console.log(`[DUB] Video ${videoId} ready: ${audioPath}`);
}

/**
 * Extract video ID from various YouTube URL formats.
 */
function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.slice(1);
    }
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v');
    }
  } catch {
    // Try bare video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }
  }
  return null;
}

app.listen(PORT, () => {
  console.log(`[DUB] Server running on http://localhost:${PORT}`);
});
