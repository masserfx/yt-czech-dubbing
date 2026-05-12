/**
 * live-translate-page.js
 *
 * Glue between live-translate.html DOM and LiveTranslate orchestrator.
 * Handles language pickers, mic device selection, settings panel, and
 * incremental rendering of the transcript.
 */
(function () {
  const live = new LiveTranslate();
  let transcriptEl, emptyStateEl, micBtn, micState, vuFill, interimEl,
      sourceSel, targetSel, settingsToggle, settingsEl, micDeviceSel,
      outputDeviceSel, sttEngineSel,
      translatorSel, ttsSel, geminiVoiceSel, geminiVoiceGroup,
      apiKeyGroup, apiKeyLabel, apiKeyInput, openaiKeyGroup,
      openaiApiKeyInput, toast, headerStatus;

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();

  let booted = false;
  async function init() {
    if (booted) return; booted = true;

    transcriptEl = document.getElementById('transcript');
    emptyStateEl = document.getElementById('emptyState');
    micBtn = document.getElementById('btnMic');
    micState = document.getElementById('micState');
    vuFill = document.getElementById('vuFill');
    interimEl = document.getElementById('interimText');
    sourceSel = document.getElementById('sourceLang');
    targetSel = document.getElementById('targetLang');
    settingsToggle = document.getElementById('btnSettings');
    settingsEl = document.getElementById('settings');
    micDeviceSel = document.getElementById('micDevice');
    outputDeviceSel = document.getElementById('outputDevice');
    sttEngineSel = document.getElementById('sttEngineSel');
    translatorSel = document.getElementById('translatorEngine');
    ttsSel = document.getElementById('ttsEngine');
    geminiVoiceSel = document.getElementById('geminiTtsVoice');
    geminiVoiceGroup = document.getElementById('geminiTtsVoiceGroup');
    apiKeyGroup = document.getElementById('apiKeyGroup');
    apiKeyLabel = document.getElementById('apiKeyLabel');
    apiKeyInput = document.getElementById('apiKeyInput');
    openaiKeyGroup = document.getElementById('openaiKeyGroup');
    openaiApiKeyInput = document.getElementById('openaiApiKeyInput');
    toast = document.getElementById('toast');
    headerStatus = document.getElementById('headerStatus');

    if (!LiveTranslate.isSupported()) {
      showToast('Web Speech API není v tomto prohlížeči podporováno');
      micBtn.classList.add('error');
      micState.textContent = 'Prohlížeč nepodporuje rozpoznávání řeči';
      micState.classList.add('error');
      micBtn.disabled = true;
    }

    for (const l of STTEngine.availableLangs()) {
      const opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = `${l.flag} ${l.name}`;
      sourceSel.appendChild(opt);
    }

    await restorePrefs();

    live.onState = handleState;
    live.onLevel = (rms) => { vuFill.style.width = `${Math.round(rms * 100)}%`; };
    live.onInterim = (text) => { interimEl.textContent = text; };
    live.onTranscriptChange = renderTranscript;

    micBtn.addEventListener('click', toggleMic);
    sourceSel.addEventListener('change', () => { live.setSourceLang(sourceSel.value); savePrefs(); });
    targetSel.addEventListener('change', () => { live.setTargetLang(targetSel.value); savePrefs(); });

    // Swap source ↔ target. Source uses BCP-47 (en-US), target uses short
    // codes (en) — convert in both directions.
    const btnSwap = document.getElementById('btnSwap');
    if (btnSwap) {
      btnSwap.addEventListener('click', () => {
        const SHORT_TO_BCP47 = {
          en: 'en-US', cs: 'cs-CZ', sk: 'sk-SK', pl: 'pl-PL', hu: 'hu-HU',
          de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', nl: 'nl-NL',
          sv: 'sv-SE', da: 'da-DK', nb: 'nb-NO', fi: 'fi-FI', pt: 'pt-PT',
          ru: 'ru-RU', uk: 'uk-UA', tr: 'tr-TR', ja: 'ja-JP', ko: 'ko-KR',
          zh: 'zh-CN', ar: 'ar-SA', hi: 'hi-IN'
        };
        const oldSourceShort = (sourceSel.value || '').split('-')[0];
        const oldTargetShort = targetSel.value;
        const newSourceBcp = SHORT_TO_BCP47[oldTargetShort] || (oldTargetShort + '-' + oldTargetShort.toUpperCase());

        const hasOpt = (sel, val) => [...sel.options].some(o => o.value === val);

        // Apply if both options exist; otherwise notify the user.
        const sourceOk = hasOpt(sourceSel, newSourceBcp);
        const targetOk = hasOpt(targetSel, oldSourceShort);
        if (!sourceOk || !targetOk) {
          showToast(`Nelze prohodit směr — některý z jazyků není v opačném dropdownu (${!sourceOk ? newSourceBcp : oldSourceShort}).`);
          return;
        }
        sourceSel.value = newSourceBcp;
        targetSel.value = oldSourceShort;
        sourceSel.dispatchEvent(new Event('change'));
        targetSel.dispatchEvent(new Event('change'));
        // Visual feedback
        btnSwap.classList.add('flash');
        setTimeout(() => btnSwap.classList.remove('flash'), 600);
      });
    }
    settingsToggle.addEventListener('click', () => {
      settingsEl.classList.toggle('open');
      if (settingsEl.classList.contains('open') && micDeviceSel.options.length <= 1) {
        loadMicDevices();
      }
    });

    // Theme toggle. Inline pre-paint script in HTML <head> already applied
    // any saved value; this just flips it and persists. Default is dark.
    const btnTheme = document.getElementById('btnTheme');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme');
        const next = cur === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('auraTheme', next); } catch (_) {}
      });
    }
    micDeviceSel.addEventListener('change', () => { live.setMicDevice(micDeviceSel.value || null); savePrefs(); });
    if (outputDeviceSel) {
      outputDeviceSel.addEventListener('change', () => {
        live.tts.setOutputDevice(outputDeviceSel.value || null);
        savePrefs();
      });
    }
    if (sttEngineSel) {
      sttEngineSel.addEventListener('change', () => {
        live.setSttEngine(sttEngineSel.value);
        updateOpenAIKeyVisibility();
        savePrefs();
      });
    }
    translatorSel.addEventListener('change', () => { applyTranslatorEngine(); savePrefs(); });
    ttsSel.addEventListener('change', () => { applyTtsEngine(); savePrefs(); });
    geminiVoiceSel.addEventListener('change', () => { live.tts._geminiVoice = geminiVoiceSel.value; savePrefs(); });
    apiKeyInput.addEventListener('change', () => {
      savePrefs();
      applyTranslatorEngine();
      applyTtsEngine();
      live.setGeminiKey(apiKeyInput.value);
    });
    if (openaiApiKeyInput) {
      openaiApiKeyInput.addEventListener('change', () => {
        savePrefs();
        updateOpenAIKeyVisibility();
      });
    }

    applyTranslatorEngine();
    applyTtsEngine();
    updateOpenAIKeyVisibility();
    requestWakeLock();
  }

  function handleState(state, msg) {
    if (state === 'listening') {
      micBtn.classList.add('listening');
      micBtn.classList.remove('error');
      micState.classList.remove('error');
      micState.textContent = 'Poslouchám';
      headerStatus.textContent = 'Aktivní překlad';
    } else if (state === 'translating') {
      micState.textContent = 'Překládám…';
    } else if (state === 'speaking') {
      micState.textContent = 'Mluvím…';
    } else if (state === 'idle') {
      micBtn.classList.remove('listening', 'error');
      micState.classList.remove('error');
      micState.textContent = 'Klikněte pro spuštění';
      headerStatus.textContent = 'Připravený poslouchat';
      interimEl.textContent = '';
    } else if (state === 'error') {
      micBtn.classList.add('error');
      micBtn.classList.remove('listening');
      micState.classList.add('error');
      micState.textContent = msg || 'Chyba';
      headerStatus.textContent = 'Chyba';
      showToast(msg || 'Nastala chyba');
    }
  }

  // iOS Safari requires TTS / audio playback to be unlocked inside a
  // user-gesture handler — otherwise speechSynthesis is silent and
  // HTMLAudioElement.play() rejects with NotAllowedError. Call this from
  // the START click. Idempotent.
  let _audioUnlocked = false;
  function unlockAudioOnIOS() {
    if (_audioUnlocked) return;
    _audioUnlocked = true;
    try {
      // 1. Prime speechSynthesis with a near-silent utterance so the engine
      //    is "user-gesture authorized" for subsequent calls outside gesture.
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.rate = 1;
      window.speechSynthesis.speak(u);
    } catch (_) {}
    try {
      // 2. Pre-create a shared <audio> element and play 1 frame of silence
      //    to lift the auto-play lock for cloud TTS (data:/blob: playback).
      let a = window.__auraUnlockedAudio;
      if (!a) {
        a = document.createElement('audio');
        a.setAttribute('playsinline', '');
        a.setAttribute('webkit-playsinline', '');
        a.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
        document.body.appendChild(a);
        window.__auraUnlockedAudio = a;
      }
      // 0.1s of silent WAV (44.1kHz mono, 1 sample of 0)
      a.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
      a.volume = 1.0;
      a.muted = false;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        const ctx = window.__auraAudioCtx || new Ctx();
        window.__auraAudioCtx = ctx;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      }
    } catch (_) {}
    console.log('[LivePage] audio unlocked for iOS Safari');
  }

  async function toggleMic() {
    if (live.isRunning()) {
      live.stop();
      return;
    }

    // Unlock audio NOW — we're inside the click handler, which is the only
    // moment iOS Safari accepts speechSynthesis.speak() and audio.play().
    unlockAudioOnIOS();

    // Make sure engine config from the UI is what gets used (init() shouldn't
    // clobber, but be defensive and re-apply right before the start).
    applyTranslatorEngine();
    applyTtsEngine();

    // Sanity check: warn early if the picked engine needs a key we don't have.
    const tEng = translatorSel.value;
    const ttsEng = ttsSel.value;
    const key = (apiKeyInput.value || '').trim();
    if ((tEng === 'gemini' || tEng === 'deepl' || tEng === 'claude') && !key) {
      showToast(`Chybí ${tEng === 'gemini' ? 'Gemini' : tEng === 'deepl' ? 'DeepL' : 'Anthropic'} API klíč`);
    }
    if (ttsEng === 'gemini' && !(key || live.tts._geminiKey)) {
      showToast('Chybí Gemini API klíč pro TTS — přepínám na systémový hlas');
      ttsSel.value = 'browser';
      applyTtsEngine();
    }
    if (sttEngineSel?.value === 'openai' && !(openaiApiKeyInput?.value || '').trim()) {
      showToast('Chybí OpenAI API klíč pro Realtime Whisper');
      return;
    }

    const ok = await live.start();
    if (!ok) showToast('Nepodařilo se spustit poslouchání');

    // The orchestrator's init may have re-touched some translator/tts state;
    // re-apply our explicit choice once more to be safe.
    applyTranslatorEngine();
    applyTtsEngine();
    console.log('[LivePage] start: translator=', translatorSel.value,
                ' tts=', ttsSel.value,
                ' geminiKey=', !!live.tts._geminiKey,
                ' translatorGemini=', !!live.translator._geminiApiKey);
  }

  function renderTranscript(entries) {
    if (!entries.length) {
      if (!emptyStateEl.parentElement) transcriptEl.appendChild(emptyStateEl);
      else emptyStateEl.style.display = 'flex';
      transcriptEl.querySelectorAll('.entry').forEach(n => n.remove());
      return;
    }
    if (emptyStateEl.parentElement) emptyStateEl.remove();

    const seen = new Set();
    for (const e of entries) {
      seen.add(e.id);
      let node = transcriptEl.querySelector(`[data-entry-id="${e.id}"]`);
      if (!node) {
        node = buildEntryNode(e);
        transcriptEl.insertBefore(node, transcriptEl.firstChild);
      } else {
        updateEntryNode(node, e);
      }
    }
    transcriptEl.querySelectorAll('.entry').forEach(n => {
      if (!seen.has(n.dataset.entryId)) n.remove();
    });
  }

  function buildEntryNode(e) {
    const node = document.createElement('div');
    node.className = `entry ${e.status}`;
    node.dataset.entryId = e.id;

    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    const langCode = (e.sourceLang || '').split('-')[0].toUpperCase();
    const langSpan = document.createElement('span');
    langSpan.textContent = langCode || '—';
    const dot = document.createElement('span');
    dot.className = 'entry-meta-status';
    dot.textContent = statusLabel(e.status);
    const time = document.createElement('span');
    time.style.marginLeft = 'auto';
    time.style.color = 'var(--text-muted)';
    time.textContent = fmtTime(e.at);
    meta.appendChild(langSpan);
    meta.appendChild(dot);
    meta.appendChild(time);

    const orig = document.createElement('div');
    orig.className = 'entry-original';
    orig.textContent = '“' + e.original + '”';

    const tr = document.createElement('div');
    tr.className = 'entry-translated' + (e.translated ? '' : ' placeholder');
    tr.textContent = e.translated || '…';

    node.appendChild(meta);
    node.appendChild(orig);
    node.appendChild(tr);
    return node;
  }

  function updateEntryNode(node, e) {
    node.className = `entry ${e.status}`;
    const meta = node.querySelector('.entry-meta-status');
    if (meta) meta.textContent = statusLabel(e.status);
    const tr = node.querySelector('.entry-translated');
    if (tr) {
      tr.textContent = e.translated || '…';
      tr.classList.toggle('placeholder', !e.translated);
    }
  }

  function statusLabel(s) {
    switch (s) {
      case 'translating': return 'překládám';
      case 'speaking': return 'mluvím';
      case 'spoken': return 'řečeno';
      case 'ready': return 'hotovo';
      case 'error': return 'chyba';
      default: return s;
    }
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function applyTranslatorEngine() {
    const eng = translatorSel.value;
    live.translator._engine = eng;
    const key = (apiKeyInput.value || '').trim();
    if (eng === 'gemini') {
      live.translator._geminiApiKey = key;
      apiKeyGroup.style.display = 'flex';
      apiKeyLabel.textContent = 'Gemini API klíč';
    } else if (eng === 'deepl') {
      live.translator._deeplApiKey = key;
      apiKeyGroup.style.display = 'flex';
      apiKeyLabel.textContent = 'DeepL API klíč';
    } else if (eng === 'claude') {
      live.translator._anthropicApiKey = key;
      apiKeyGroup.style.display = 'flex';
      apiKeyLabel.textContent = 'Anthropic API klíč';
    } else {
      if (ttsSel.value === 'gemini') {
        apiKeyGroup.style.display = 'flex';
        apiKeyLabel.textContent = 'Gemini API klíč (sdílen s TTS)';
      } else {
        apiKeyGroup.style.display = 'none';
      }
    }
  }

  function applyTtsEngine() {
    const v = ttsSel.value;
    geminiVoiceGroup.style.display = v === 'gemini' ? 'flex' : 'none';
    if (v === 'edge-male') {
      live.tts._ttsEngine = 'edge';
      live.setEdgeGender('male');
    } else if (v === 'edge-female') {
      live.tts._ttsEngine = 'edge';
      live.setEdgeGender('female');
    } else if (v === 'gemini') {
      live.tts._ttsEngine = 'gemini';
      live.tts._geminiKey = (apiKeyInput.value || '').trim()
        || live.tts._geminiKey
        || live.translator._geminiApiKey;
      live.tts._geminiVoice = geminiVoiceSel.value || 'Aoede';
      apiKeyGroup.style.display = 'flex';
      apiKeyLabel.textContent = translatorSel.value === 'gemini'
        ? 'Gemini API klíč (sdílen s překladačem)'
        : 'Gemini API klíč (TTS)';
    } else {
      live.tts._ttsEngine = v;
    }
  }

  function updateOpenAIKeyVisibility() {
    if (!openaiKeyGroup) return;
    openaiKeyGroup.style.display = sttEngineSel?.value === 'openai' ? 'flex' : 'none';
  }

  const PREFS_KEY = 'liveTranslatePrefs';

  async function restorePrefs() {
    try {
      const r = await chrome.storage.local.get([PREFS_KEY, 'popupSettings']);
      const p = r[PREFS_KEY] || {};
      const popupSettings = r.popupSettings || {};
      if (p.sourceLang) sourceSel.value = p.sourceLang;
      if (p.targetLang) targetSel.value = p.targetLang;
      if (p.translatorEngine) translatorSel.value = p.translatorEngine;
      if (p.ttsEngine) ttsSel.value = p.ttsEngine;
      if (p.geminiVoice) geminiVoiceSel.value = p.geminiVoice;
      if (p.apiKey) apiKeyInput.value = p.apiKey;
      if (openaiApiKeyInput) openaiApiKeyInput.value = p.openaiApiKey || popupSettings.openaiApiKey || '';
      if (p.sttEngine && sttEngineSel) sttEngineSel.value = p.sttEngine;
      live.setSourceLang(sourceSel.value);
      live.setTargetLang(targetSel.value);
      live.setSttEngine(sttEngineSel?.value || 'webspeech');
      live.setGeminiKey(apiKeyInput.value);
      updateOpenAIKeyVisibility();
      // Apply persisted output sink even before user opens settings drawer
      if (p.outputDeviceId) live.tts.setOutputDevice(p.outputDeviceId);
    } catch (_) {}
  }

  async function savePrefs() {
    try {
      const openaiApiKey = (openaiApiKeyInput?.value || '').trim();
      const { popupSettings } = await chrome.storage.local.get('popupSettings');
      await chrome.storage.local.set({
        [PREFS_KEY]: {
          sourceLang: sourceSel.value,
          targetLang: targetSel.value,
          translatorEngine: translatorSel.value,
          ttsEngine: ttsSel.value,
          sttEngine: sttEngineSel?.value || 'webspeech',
          geminiVoice: geminiVoiceSel.value,
          apiKey: apiKeyInput.value,
          openaiApiKey,
          micDeviceId: micDeviceSel?.value || '',
          outputDeviceId: outputDeviceSel?.value || ''
        },
        popupSettings: {
          ...(popupSettings || {}),
          openaiApiKey,
        }
      });
    } catch (_) {}
  }

  async function loadMicDevices() {
    // Populate both input + output device pickers in one go (one permission
    // prompt covers both).
    const inputs = await STTEngine.listInputDevices();
    const outputs = await STTEngine.listOutputDevices();

    const fillSelect = (sel, devices, builtinPrefix) => {
      sel.replaceChildren();
      const def = document.createElement('option');
      def.value = '';
      def.textContent = 'Výchozí (systém)';
      sel.appendChild(def);
      for (const d of devices) {
        const opt = document.createElement('option');
        opt.value = d.id;
        const isBt = /AirPods|Bluetooth|BT|Hands.?Free/i.test(d.label);
        opt.textContent = (isBt ? '🎧 ' : builtinPrefix) + d.label;
        sel.appendChild(opt);
      }
    };
    fillSelect(micDeviceSel, inputs, '🎙 ');
    if (outputDeviceSel) fillSelect(outputDeviceSel, outputs, '🔊 ');

    try {
      const r = await chrome.storage.local.get(PREFS_KEY);
      const p = r[PREFS_KEY] || {};
      if (p.micDeviceId) micDeviceSel.value = p.micDeviceId;
      if (p.outputDeviceId && outputDeviceSel) {
        outputDeviceSel.value = p.outputDeviceId;
        live.tts.setOutputDevice(p.outputDeviceId || null);
      }
    } catch (_) {}
  }

  let toastTimer;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 4500);
  }

  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (_) {}
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && live.isRunning()) {
        try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
      }
    });
  }
})();
