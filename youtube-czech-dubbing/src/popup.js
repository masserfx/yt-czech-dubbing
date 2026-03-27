/**
 * Popup script - Controls for the Czech Dubbing extension.
 */

let currentStatus = 'idle';
let activeTabId = null;

/**
 * Initialize popup.
 */
async function init() {
  // Get the active YouTube tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
    document.getElementById('controlsSection').innerHTML =
      '<div class="no-video">Otevřete YouTube video pro aktivaci dabingu.</div>';
    document.getElementById('settingsSection').style.display = 'none';
    document.getElementById('statusText').textContent = 'Žádné YouTube video';
    return;
  }

  activeTabId = tab.id;

  // Get current status
  try {
    const response = await sendMessage({ type: 'get-status' });
    if (response) {
      updateStatus(response.status, response.message);
    }
  } catch (e) {
    updateStatus('idle', 'Připraveno');
  }

  // Load voices
  loadVoices();

  // Load saved settings
  loadSettings();

  // Load usage stats
  loadUsageStats();
}

/**
 * Toggle dubbing on/off.
 */
async function toggleDubbing() {
  const btn = document.getElementById('btnToggle');
  const btnText = document.getElementById('btnText');

  if (currentStatus === 'playing' || currentStatus === 'ready') {
    // Stop
    btn.disabled = true;
    await sendMessage({ type: 'stop-dubbing' });
    updateStatus('idle', 'Zastaveno');
    btn.disabled = false;
  } else {
    // Start
    btn.disabled = true;
    btnText.textContent = 'Spouštím...';
    updateStatus('loading', 'Spouštím dabing...');

    const response = await sendMessage({ type: 'start-dubbing' });

    btn.disabled = false;
    if (response && response.success) {
      updateStatus('playing', 'Dabing aktivní');
    } else {
      updateStatus('error', 'Nepodařilo se spustit');
    }
  }
}

/**
 * Update a setting.
 */
function updateSetting(setting, value) {
  const settings = {};

  switch (setting) {
    case 'ttsVolume':
      settings.ttsVolume = parseInt(value) / 100;
      document.getElementById('volumeValue').textContent = `${value}%`;
      break;
    case 'ttsRate':
      settings.ttsRate = parseInt(value) / 100;
      document.getElementById('rateValue').textContent = `${(parseInt(value) / 100).toFixed(1)}x`;
      break;
    case 'ttsPitch':
      settings.ttsPitch = parseInt(value) / 100;
      document.getElementById('pitchValue').textContent = (parseInt(value) / 100).toFixed(1);
      break;
    case 'ttsMaxRate':
      settings.ttsMaxRate = parseInt(value) / 100;
      document.getElementById('maxRateValue').textContent = `${(parseInt(value) / 100).toFixed(1)}x`;
      break;
    case 'originalVolume':
      settings.reducedOriginalVolume = parseInt(value) / 100;
      document.getElementById('origVolValue').textContent = `${value}%`;
      break;
    case 'muteOriginal':
      settings.muteOriginal = value;
      break;
    case 'translatorEngine':
      settings.translatorEngine = value;
      document.getElementById('apiKeyGroup').style.display = value === 'claude' ? 'block' : 'none';
      loadUsageStats();
      break;
    case 'anthropicApiKey':
      settings.anthropicApiKey = value;
      break;
  }

  sendMessage({ type: 'update-settings', settings });
  saveSettings();
}

/**
 * Set TTS voice.
 */
function setVoice(voiceName) {
  if (voiceName) {
    sendMessage({ type: 'set-voice', voiceName });
  }
}

/**
 * Load available voices.
 */
async function loadVoices() {
  try {
    const response = await sendMessage({ type: 'get-voices' });
    if (response && response.voices) {
      const select = document.getElementById('voiceSelect');
      select.innerHTML = '';

      if (response.voices.length === 0) {
        select.innerHTML = '<option value="">Žádné české hlasy</option>';
        return;
      }

      response.voices.forEach(voice => {
        const opt = document.createElement('option');
        opt.value = voice.name;
        opt.textContent = `${voice.name} (${voice.lang})`;
        if (voice.name === response.current) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn('Failed to load voices:', e);
  }
}

/**
 * Update the UI status.
 */
function updateStatus(status, message) {
  currentStatus = status;
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const btn = document.getElementById('btnToggle');
  const btnText = document.getElementById('btnText');

  dot.className = `status-dot ${status}`;
  text.textContent = message || status;

  if (btn) {
    if (status === 'playing' || status === 'ready') {
      btn.className = 'btn-main btn-stop';
      btnText.textContent = 'Zastavit dabing';
      btn.querySelector('span:first-child').textContent = '■';
    } else {
      btn.className = 'btn-main btn-start';
      btnText.textContent = 'Spustit český dabing';
      btn.querySelector('span:first-child').textContent = '▶';
    }
  }
}

/**
 * Send message to content script.
 */
async function sendMessage(msg) {
  if (!activeTabId) return null;
  try {
    return await chrome.tabs.sendMessage(activeTabId, msg);
  } catch (e) {
    console.warn('Message send failed:', e);
    return null;
  }
}

/**
 * Save settings to storage.
 */
function saveSettings() {
  const settings = {
    ttsVolume: document.getElementById('ttsVolume').value,
    ttsRate: document.getElementById('ttsRate').value,
    ttsMaxRate: document.getElementById('ttsMaxRate').value,
    ttsPitch: document.getElementById('ttsPitch').value,
    originalVolume: document.getElementById('originalVolume').value,
    muteOriginal: document.getElementById('muteOriginal').checked,
    translatorEngine: document.getElementById('translatorEngine').value,
    anthropicApiKey: document.getElementById('anthropicApiKey').value
  };
  chrome.storage.local.set({ popupSettings: settings });
}

/**
 * Load settings from storage.
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get('popupSettings');
    if (result.popupSettings) {
      const s = result.popupSettings;
      if (s.ttsVolume) {
        document.getElementById('ttsVolume').value = s.ttsVolume;
        document.getElementById('volumeValue').textContent = `${s.ttsVolume}%`;
      }
      if (s.ttsRate) {
        document.getElementById('ttsRate').value = s.ttsRate;
        document.getElementById('rateValue').textContent = `${(parseInt(s.ttsRate) / 100).toFixed(1)}x`;
      }
      if (s.ttsMaxRate) {
        document.getElementById('ttsMaxRate').value = s.ttsMaxRate;
        document.getElementById('maxRateValue').textContent = `${(parseInt(s.ttsMaxRate) / 100).toFixed(1)}x`;
      }
      if (s.ttsPitch) {
        document.getElementById('ttsPitch').value = s.ttsPitch;
        document.getElementById('pitchValue').textContent = (parseInt(s.ttsPitch) / 100).toFixed(1);
      }
      if (s.originalVolume) {
        document.getElementById('originalVolume').value = s.originalVolume;
        document.getElementById('origVolValue').textContent = `${s.originalVolume}%`;
      }
      if (s.muteOriginal !== undefined) {
        document.getElementById('muteOriginal').checked = s.muteOriginal;
      }
      if (s.translatorEngine) {
        document.getElementById('translatorEngine').value = s.translatorEngine;
        document.getElementById('apiKeyGroup').style.display = s.translatorEngine === 'claude' ? 'block' : 'none';
      }
      if (s.anthropicApiKey) {
        document.getElementById('anthropicApiKey').value = s.anthropicApiKey;
      }
    }
  } catch (e) {
    // Use defaults
  }
}

/**
 * Listen for status updates from content script.
 */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'status-update') {
    updateStatus(msg.status, msg.message);
  }
});

// --- Usage stats ---

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function formatCost(usd) {
  if (usd < 0.001) return '—';
  if (usd < 0.01) return '$' + usd.toFixed(4);
  if (usd < 1) return '$' + usd.toFixed(3);
  return '$' + usd.toFixed(2);
}

async function loadUsageStats() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'get-usage' });
    if (!resp?.success) return;
    const s = resp.stats;

    const rows = [
      ['Video', s.currentVideo],
      ['Day', s.today],
      ['Week', s.week],
      ['Month', s.month],
      ['Year', s.year],
      ['Total', s.total]
    ];

    for (const [key, data] of rows) {
      const tokens = data.input + data.output;
      document.getElementById('usage' + key).textContent = tokens > 0 ? formatTokens(tokens) : '—';
      document.getElementById('cost' + key).textContent = data.cost > 0 ? formatCost(data.cost) : '—';
    }

    // Show section only if Claude is selected or there's usage data
    const engine = document.getElementById('translatorEngine').value;
    document.getElementById('usageSection').style.display =
      (engine === 'claude' || s.total.requests > 0) ? 'block' : 'none';
  } catch (e) {
    // Background not available
  }
}

async function resetUsage() {
  if (!confirm('Smazat historii spotřeby tokenů?')) return;
  await chrome.runtime.sendMessage({ type: 'reset-usage' });
  loadUsageStats();
}

// Make resetUsage available to onclick
window.resetUsage = resetUsage;

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
