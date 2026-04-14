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

  const isYouTube = tab?.url?.includes('youtube.com/watch');
  const isArticlePage = tab?.url && !tab.url.includes('youtube.com') && (tab.url.startsWith('https://') || tab.url.startsWith('http://'));

  if (!isYouTube && !isArticlePage) {
    const noVideoDiv = document.createElement('div');
    noVideoDiv.className = 'no-video';
    noVideoDiv.textContent = 'Otevřete YouTube video nebo článek pro aktivaci dabingu.';
    const controlsSection = document.getElementById('controlsSection');
    controlsSection.textContent = '';
    controlsSection.appendChild(noVideoDiv);
    document.getElementById('settingsSection').style.display = 'none';
    document.getElementById('statusText').textContent = 'Žádná stránka k dabingu';
    return;
  }

  // Article mode: show article-specific controls
  if (isArticlePage) {
    document.getElementById('btnText').textContent = 'Dabovat článek';
    document.getElementById('btnToggle').onclick = () => toggleArticleDubbing(tab.id);
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

  // Load saved settings (must be before loadUsageStats so engine is set)
  await loadSettings();

  // Load usage stats
  loadUsageStats();
}

/**
 * Toggle article dubbing — injects scripts and starts article player.
 */
async function toggleArticleDubbing(tabId) {
  const btn = document.getElementById('btnToggle');
  const btnText = document.getElementById('btnText');

  if (currentStatus === 'playing' || currentStatus === 'ready') {
    btn.disabled = true;
    await chrome.tabs.sendMessage(tabId, { type: 'article-stop' });
    updateStatus('idle', 'Zastaveno');
    btn.disabled = false;
  } else {
    btn.disabled = true;
    btnText.textContent = 'Spouštím...';
    updateStatus('loading', 'Injektuji skripty...');

    // Inject article scripts via background
    const resp = await chrome.runtime.sendMessage({ type: 'inject-article-scripts', tabId });
    btn.disabled = false;

    if (resp?.success) {
      updateStatus('ready', 'Článek připraven');
    } else {
      updateStatus('error', resp?.error || 'Nepodařilo se spustit');
    }
  }
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
      document.getElementById('deeplKeyGroup').style.display = value === 'deepl' ? 'block' : 'none';
      document.getElementById('chromeAiNote').style.display = value === 'chromeai' ? 'block' : 'none';
      loadUsageStats();
      break;
    case 'anthropicApiKey':
      settings.anthropicApiKey = value;
      break;
    case 'deeplApiKey':
      settings.deeplApiKey = value;
      break;
    case 'ttsEngine':
      settings.ttsEngine = value;
      if (value === 'edge-male') {
        settings.ttsEngine = 'edge';
        settings.edgeTtsVoice = 'cs-CZ-AntoninNeural';
      } else if (value === 'edge-female') {
        settings.ttsEngine = 'edge';
        settings.edgeTtsVoice = 'cs-CZ-VlastaNeural';
      }
      document.getElementById('azureTtsGroup').style.display = value === 'azure' ? 'block' : 'none';
      break;
    case 'azureTtsKey':
      settings.azureTtsKey = value;
      break;
    case 'azureTtsRegion':
      settings.azureTtsRegion = value;
      break;
    case 'azureTtsVoice':
      settings.azureTtsVoice = value;
      break;
    case 'targetLanguage':
      settings.targetLanguage = value;
      // Update header flag
      const flags = { cs: '🇨🇿', sk: '🇸🇰', pl: '🇵🇱', hu: '🇭🇺' };
      document.getElementById('headerFlag').textContent = flags[value] || '🌍';
      break;
    case 'serviceMode':
      settings.serviceMode = value;
      document.getElementById('serviceConfigGroup').style.display = value === 'service' ? 'block' : 'none';
      break;
    case 'serviceApiEndpoint':
      settings.serviceApiEndpoint = value;
      break;
    case 'serviceAuthToken':
      settings.serviceAuthToken = value;
      break;
    case 'serviceOrganizationId':
      settings.serviceOrganizationId = value;
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
    // Persist browser voice selection
    chrome.storage.local.get('popupSettings', (result) => {
      const settings = result.popupSettings || {};
      settings.browserVoiceName = voiceName;
      chrome.storage.local.set({ popupSettings: settings });
    });
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
  const voiceSelect = document.getElementById('voiceSelect');
  const settings = {
    ttsVolume: document.getElementById('ttsVolume').value,
    ttsRate: document.getElementById('ttsRate').value,
    ttsMaxRate: document.getElementById('ttsMaxRate').value,
    ttsPitch: document.getElementById('ttsPitch').value,
    originalVolume: document.getElementById('originalVolume').value,
    muteOriginal: document.getElementById('muteOriginal').checked,
    targetLanguage: document.getElementById('targetLanguage').value,
    translatorEngine: document.getElementById('translatorEngine').value,
    anthropicApiKey: document.getElementById('anthropicApiKey').value,
    deeplApiKey: document.getElementById('deeplApiKey').value,
    ttsEngine: (() => {
      const v = document.getElementById('ttsEngine').value;
      return (v === 'edge-male' || v === 'edge-female') ? 'edge' : v;
    })(),
    edgeTtsVoice: (() => {
      const v = document.getElementById('ttsEngine').value;
      if (v === 'edge-female') return 'cs-CZ-VlastaNeural';
      return 'cs-CZ-AntoninNeural';
    })(),
    azureTtsKey: document.getElementById('azureTtsKey').value,
    azureTtsRegion: document.getElementById('azureTtsRegion').value,
    azureTtsVoice: document.getElementById('azureTtsVoice').value,
    browserVoiceName: voiceSelect.value || undefined,
    serviceMode: document.getElementById('serviceMode').value,
    serviceApiEndpoint: document.getElementById('serviceApiEndpoint').value,
    serviceAuthToken: document.getElementById('serviceAuthToken').value,
    serviceOrganizationId: document.getElementById('serviceOrganizationId').value
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
        document.getElementById('deeplKeyGroup').style.display = s.translatorEngine === 'deepl' ? 'block' : 'none';
        document.getElementById('chromeAiNote').style.display = s.translatorEngine === 'chromeai' ? 'block' : 'none';
      }
      if (s.anthropicApiKey) {
        document.getElementById('anthropicApiKey').value = s.anthropicApiKey;
      }
      if (s.deeplApiKey) {
        document.getElementById('deeplApiKey').value = s.deeplApiKey;
      }
      if (s.ttsEngine) {
        let displayEngine = s.ttsEngine;
        if (s.ttsEngine === 'edge') {
          displayEngine = (s.edgeTtsVoice && s.edgeTtsVoice.includes('Vlasta')) ? 'edge-female' : 'edge-male';
        }
        document.getElementById('ttsEngine').value = displayEngine;
        document.getElementById('azureTtsGroup').style.display = s.ttsEngine === 'azure' ? 'block' : 'none';
      }
      if (s.azureTtsKey) {
        document.getElementById('azureTtsKey').value = s.azureTtsKey;
      }
      if (s.azureTtsRegion) {
        document.getElementById('azureTtsRegion').value = s.azureTtsRegion;
      }
      if (s.azureTtsVoice) {
        document.getElementById('azureTtsVoice').value = s.azureTtsVoice;
      }
      if (s.targetLanguage) {
        document.getElementById('targetLanguage').value = s.targetLanguage;
        const flags = { cs: '🇨🇿', sk: '🇸🇰', pl: '🇵🇱', hu: '🇭🇺' };
        document.getElementById('headerFlag').textContent = flags[s.targetLanguage] || '🇨🇿';
      }
      if (s.serviceMode) {
        document.getElementById('serviceMode').value = s.serviceMode;
        document.getElementById('serviceConfigGroup').style.display = s.serviceMode === 'service' ? 'block' : 'none';
      }
      if (s.serviceApiEndpoint) {
        document.getElementById('serviceApiEndpoint').value = s.serviceApiEndpoint;
      }
      if (s.serviceAuthToken) {
        document.getElementById('serviceAuthToken').value = s.serviceAuthToken;
      }
      if (s.serviceOrganizationId) {
        document.getElementById('serviceOrganizationId').value = s.serviceOrganizationId;
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

// Initialize on load and bind all event listeners (no inline handlers — MV3 CSP)
document.addEventListener('DOMContentLoaded', () => {
  // Main toggle button
  document.getElementById('btnToggle').addEventListener('click', toggleDubbing);

  // Range sliders
  document.getElementById('ttsVolume').addEventListener('input', (e) => updateSetting('ttsVolume', e.target.value));
  document.getElementById('ttsRate').addEventListener('input', (e) => updateSetting('ttsRate', e.target.value));
  document.getElementById('ttsMaxRate').addEventListener('input', (e) => updateSetting('ttsMaxRate', e.target.value));
  document.getElementById('ttsPitch').addEventListener('input', (e) => updateSetting('ttsPitch', e.target.value));
  document.getElementById('originalVolume').addEventListener('input', (e) => updateSetting('originalVolume', e.target.value));

  // Selects
  document.getElementById('voiceSelect').addEventListener('change', (e) => setVoice(e.target.value));
  document.getElementById('translatorEngine').addEventListener('change', (e) => updateSetting('translatorEngine', e.target.value));

  // Checkbox
  document.getElementById('muteOriginal').addEventListener('change', (e) => updateSetting('muteOriginal', e.target.checked));

  // API keys
  document.getElementById('anthropicApiKey').addEventListener('change', (e) => updateSetting('anthropicApiKey', e.target.value));
  document.getElementById('deeplApiKey').addEventListener('change', (e) => updateSetting('deeplApiKey', e.target.value));

  // TTS engine
  document.getElementById('ttsEngine').addEventListener('change', (e) => updateSetting('ttsEngine', e.target.value));
  document.getElementById('azureTtsKey').addEventListener('change', (e) => updateSetting('azureTtsKey', e.target.value));
  document.getElementById('azureTtsRegion').addEventListener('change', (e) => updateSetting('azureTtsRegion', e.target.value));
  document.getElementById('azureTtsVoice').addEventListener('change', (e) => updateSetting('azureTtsVoice', e.target.value));

  // Language picker
  document.getElementById('targetLanguage').addEventListener('change', (e) => updateSetting('targetLanguage', e.target.value));

  // Service mode
  document.getElementById('serviceMode').addEventListener('change', (e) => updateSetting('serviceMode', e.target.value));
  document.getElementById('serviceApiEndpoint').addEventListener('change', (e) => updateSetting('serviceApiEndpoint', e.target.value));
  document.getElementById('serviceAuthToken').addEventListener('change', (e) => updateSetting('serviceAuthToken', e.target.value));
  document.getElementById('serviceOrganizationId').addEventListener('change', (e) => updateSetting('serviceOrganizationId', e.target.value));

  // Reset usage
  document.getElementById('btnResetUsage').addEventListener('click', resetUsage);

  // Init popup state
  init();
});
