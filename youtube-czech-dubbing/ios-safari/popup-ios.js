(function () {
  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const setStatus = (msg) => { statusEl.textContent = msg; };

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function isYouTubeTab(tab) {
    if (!tab?.url) return false;
    return /^https?:\/\/([a-z0-9-]+\.)?youtube\.com\//.test(tab.url);
  }

  async function restore() {
    const st = await chrome.storage.local.get([
      'ios_targetLang', 'ios_voicePreset', 'geminiKey', 'azureKey'
    ]);
    if (st.ios_targetLang) $('targetLang').value = st.ios_targetLang;
    if (st.ios_voicePreset) $('voicePreset').value = st.ios_voicePreset;
    if (st.geminiKey) $('geminiKey').value = st.geminiKey;
    if (st.azureKey) $('azureKey').value = st.azureKey;
  }

  async function persistPrefs() {
    await chrome.storage.local.set({
      ios_targetLang: $('targetLang').value,
      ios_voicePreset: $('voicePreset').value
    });
  }

  async function sendToContent(msg) {
    const tab = await getActiveTab();
    if (!isYouTubeTab(tab)) {
      throw new Error('Otevři nejdřív video na youtube.com');
    }
    return chrome.tabs.sendMessage(tab.id, msg);
  }

  $('startBtn').addEventListener('click', async () => {
    try {
      await persistPrefs();
      setStatus('Startuji dabing…');
      const res = await sendToContent({
        type: 'start-dubbing',
        targetLang: $('targetLang').value,
        voicePreset: $('voicePreset').value,
        source: 'ios-popup'
      });
      if (res?.success) {
        setStatus('Dabing spuštěn.');
      } else {
        try {
          const s = await sendToContent({ type: 'get-status' });
          setStatus('Selhalo: ' + (s?.message || res?.error || 'bez detailu (controller=' + (res ? 'ok' : 'null') + ')'));
        } catch (e2) {
          setStatus('Start selhal: ' + (res?.error || e2.message || 'bez detailu'));
        }
      }
    } catch (e) {
      setStatus('Chyba: ' + (e.message || e));
    }
  });

  $('stopBtn').addEventListener('click', async () => {
    try {
      await sendToContent({ type: 'stop-dubbing' });
      setStatus('Dabing zastaven.');
    } catch (e) {
      setStatus('Chyba: ' + (e.message || e));
    }
  });

  $('saveKeysBtn').addEventListener('click', async () => {
    await chrome.storage.local.set({
      geminiKey: $('geminiKey').value.trim(),
      azureKey: $('azureKey').value.trim()
    });
    setStatus('Klíče uloženy.');
  });

  restore();
})();
