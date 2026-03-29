/**
 * YouTube Czech Dubbing - Frontend Application
 * Handles YouTube iframe player, audio sync, and subtitle display.
 */

let ytPlayer = null;
let dubAudio = null;
let subtitles = [];
let currentVideoId = null;
let syncInterval = null;

// YouTube IFrame API callback
function onYouTubeIframeAPIReady() {
  console.log('[App] YouTube IFrame API ready');
}

/**
 * Start the dubbing process.
 */
async function startDubbing() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;

  const btn = document.getElementById('dubBtn');
  btn.disabled = true;
  btn.textContent = 'Zpracovavam...';

  showStatus('processing', 'Odesilam pozadavek...');

  try {
    // Request dubbing
    const resp = await fetch('/api/dub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    currentVideoId = data.videoId;

    if (data.status === 'done') {
      onDubbingComplete(data);
    } else {
      pollStatus(data.videoId);
    }
  } catch (err) {
    showStatus('error', `Chyba: ${err.message}`);
    btn.disabled = false;
    btn.textContent = 'Dabovat';
  }
}

/**
 * Poll the server for job status.
 */
async function pollStatus(videoId) {
  const poll = async () => {
    try {
      const resp = await fetch(`/api/status/${videoId}`);
      const data = await resp.json();

      const stepNames = {
        captions: 'Stahuji titulky',
        translating: 'Prekladam do cestiny',
        generating_audio: 'Generuji cesky hlas',
        complete: 'Hotovo!'
      };

      const stepName = stepNames[data.step] || data.step;
      showStatus('processing', `${stepName}... ${data.progress}%`);
      setProgress(data.progress);

      if (data.status === 'done') {
        onDubbingComplete(data);
        return;
      }

      if (data.status === 'error') {
        showStatus('error', `Chyba: ${data.error}`);
        resetButton();
        return;
      }

      // Continue polling
      setTimeout(poll, 1000);
    } catch (err) {
      showStatus('error', `Chyba pripojeni: ${err.message}`);
      resetButton();
    }
  };

  poll();
}

/**
 * Called when dubbing is complete - load player and audio.
 */
async function onDubbingComplete(data) {
  showStatus('done', 'Cesky dabing pripraven!');

  // Load subtitles
  try {
    const resp = await fetch(`/api/subtitles/${data.videoId}`);
    subtitles = await resp.json();
  } catch {
    subtitles = [];
  }

  // Show player
  document.getElementById('playerSection').classList.add('active');

  // Create YouTube player
  if (ytPlayer) {
    ytPlayer.destroy();
  }

  ytPlayer = new YT.Player('ytPlayer', {
    videoId: data.videoId,
    playerVars: {
      autoplay: 0,
      controls: 1,
      modestbranding: 1,
      rel: 0
    },
    events: {
      onReady: () => onPlayerReady(data.videoId),
      onStateChange: onPlayerStateChange
    }
  });

  resetButton();
}

/**
 * YouTube player ready - set up audio.
 */
function onPlayerReady(videoId) {
  // Set original volume low
  const origVol = document.getElementById('origVolume').value;
  ytPlayer.setVolume(parseInt(origVol));

  // Create audio element for Czech dubbing
  if (dubAudio) {
    dubAudio.pause();
    dubAudio.src = '';
  }

  dubAudio = new Audio(`/api/audio/${videoId}`);
  dubAudio.volume = document.getElementById('dubVolume').value / 100;
  dubAudio.preload = 'auto';

  console.log('[App] Player ready, audio loaded');
}

/**
 * Handle YouTube player state changes.
 */
function onPlayerStateChange(event) {
  switch (event.data) {
    case YT.PlayerState.PLAYING:
      syncAndPlay();
      break;
    case YT.PlayerState.PAUSED:
      pauseAudio();
      break;
    case YT.PlayerState.ENDED:
      pauseAudio();
      break;
  }
}

/**
 * Sync Czech audio with video and start playback.
 */
function syncAndPlay() {
  if (!dubAudio || !ytPlayer) return;

  const videoTime = ytPlayer.getCurrentTime();
  dubAudio.currentTime = videoTime;
  dubAudio.play().catch(err => {
    console.warn('[App] Audio play failed:', err);
  });

  // Start subtitle sync
  startSubtitleSync();

  document.getElementById('playPauseBtn').textContent = 'Pause';
}

/**
 * Pause the Czech audio.
 */
function pauseAudio() {
  if (dubAudio) {
    dubAudio.pause();
  }
  stopSubtitleSync();
  document.getElementById('playPauseBtn').textContent = 'Play';
}

/**
 * Toggle play/pause.
 */
function togglePlayPause() {
  if (!ytPlayer) return;

  const state = ytPlayer.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

/**
 * Start subtitle synchronization loop.
 */
function startSubtitleSync() {
  stopSubtitleSync();

  syncInterval = setInterval(() => {
    if (!ytPlayer) return;

    const currentTime = ytPlayer.getCurrentTime();

    // Re-sync audio if drift > 300ms
    if (dubAudio && Math.abs(dubAudio.currentTime - currentTime) > 0.3) {
      dubAudio.currentTime = currentTime;
    }

    // Find current subtitle
    const current = subtitles.find(s =>
      currentTime >= s.offset && currentTime < s.offset + s.duration
    );

    const textEl = document.getElementById('subtitleText');
    const origEl = document.getElementById('subtitleOriginal');

    if (current) {
      textEl.textContent = current.text;
      origEl.textContent = current.originalText || '';
    } else {
      textEl.textContent = '';
      origEl.textContent = '';
    }
  }, 150);
}

/**
 * Stop subtitle sync.
 */
function stopSubtitleSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Update dubbing volume.
 */
function updateDubVolume(value) {
  if (dubAudio) {
    dubAudio.volume = value / 100;
  }
}

/**
 * Update original video volume.
 */
function updateOrigVolume(value) {
  if (ytPlayer) {
    ytPlayer.setVolume(parseInt(value));
  }
}

// UI Helpers

function showStatus(type, message) {
  const bar = document.getElementById('statusBar');
  const text = document.getElementById('statusText');
  const spinner = document.getElementById('statusSpinner');

  bar.className = `status-bar active ${type}`;
  text.textContent = message;
  spinner.style.display = type === 'processing' ? 'block' : 'none';
}

function setProgress(pct) {
  document.getElementById('progressFill').style.width = `${pct}%`;
}

function resetButton() {
  const btn = document.getElementById('dubBtn');
  btn.disabled = false;
  btn.textContent = 'Dabovat';
}

// Allow Enter key to submit
document.getElementById('urlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startDubbing();
});
