/**
 * Side Panel — Dubbing controls + Gemini AI Chat.
 * Communicates with content scripts via chrome.tabs.sendMessage
 * and with background.js for API calls.
 */

let activeTabId = null;
let pageContext = null; // { title, paragraphs, summary, meta, audioElements, isYouTube }
let chatHistory = []; // [{role: 'user'|'model', parts: [{text}]}]
let geminiApiKey = null;

// ── Initialization ──────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await detectPage();
  bindEvents();
});

async function detectPage() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) return;
  activeTabId = tab.id;

  const isYouTube = tab.url?.includes('youtube.com/watch');
  const isWeb = tab.url?.startsWith('http');

  document.getElementById('contextTitle').textContent = tab.title || tab.url;

  if (isYouTube) {
    setContextBadges([{ text: 'YouTube', cls: '' }]);
    pageContext = { isYouTube: true, title: tab.title, url: tab.url };
    document.getElementById('btnDubText').textContent = 'Spustit dabing';
    // Try get status from content script
    try {
      const resp = await chrome.tabs.sendMessage(activeTabId, { type: 'get-status' });
      if (resp) updateDubStatus(resp.status, resp.message);
    } catch (e) {}
  } else if (isWeb) {
    document.getElementById('btnDubText').textContent = 'Dabovat článek';
    // Try to get article context
    try {
      const resp = await chrome.tabs.sendMessage(activeTabId, { type: 'article-get-status' });
      if (resp?.isArticle) {
        updateDubStatus(resp.status, resp.message);
      }
    } catch (e) {
      // Content script not yet injected — that's OK
    }
    pageContext = { isYouTube: false, title: tab.title, url: tab.url };
    setContextBadges([{ text: 'Článek', cls: '' }]);
  } else {
    document.getElementById('contextTitle').textContent = 'Nepodporovaná stránka';
    document.getElementById('btnDub').disabled = true;
  }
}

// ── Tab Switching ───────────────────────────────────────

function bindEvents() {
  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // Dubbing
  document.getElementById('btnDub').addEventListener('click', toggleDubbing);
  document.getElementById('btnStop').addEventListener('click', () => sendToTab({ type: pageContext?.isYouTube ? 'stop-dubbing' : 'article-stop' }));
  document.getElementById('btnPrev').addEventListener('click', () => sendToTab({ type: 'article-prev' }));
  document.getElementById('btnNext').addEventListener('click', () => sendToTab({ type: 'article-next' }));
  document.getElementById('btnModeSummary').addEventListener('click', () => sendToTab({ type: 'article-mode', mode: 'summary' }));
  document.getElementById('btnModeFull').addEventListener('click', () => sendToTab({ type: 'article-mode', mode: 'full' }));

  // Chat
  document.getElementById('btnSend').addEventListener('click', sendChatMessage);
  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
  // Auto-resize textarea
  document.getElementById('chatInput').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
  });
  // Suggestion chips
  document.querySelectorAll('.chat-suggestion').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('chatInput').value = chip.dataset.q;
      sendChatMessage();
    });
  });

  // Settings
  document.getElementById('btnSettings').addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="settings"]').classList.add('active');
    document.getElementById('tab-settings').classList.add('active');
  });
  document.getElementById('btnRefresh').addEventListener('click', () => {
    extractPageContext();
  });

  bindSettingsEvents();
  bindVoiceInput();

  // API key links — open in new tab
  document.querySelectorAll('.api-link[data-url]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: link.dataset.url });
    });
  });

  // Listen for status updates from content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'status-update') {
      updateDubStatus(msg.status, msg.message);
    }
    if (msg.type === 'article-context') {
      receiveArticleContext(msg);
    }
  });
}

// ── Dubbing ─────────────────────────────────────────────

async function toggleDubbing() {
  const btn = document.getElementById('btnDub');
  const btnText = document.getElementById('btnDubText');

  if (pageContext?.isYouTube) {
    btn.disabled = true;
    btnText.textContent = 'Spouštím...';
    const resp = await sendToTab({ type: 'start-dubbing' });
    btn.disabled = false;
    if (resp?.success) {
      updateDubStatus('playing', 'Dabing aktivní');
    } else {
      updateDubStatus('error', 'Nepodařilo se spustit');
    }
  } else {
    // Article: inject scripts first, then they auto-start
    btn.disabled = true;
    btnText.textContent = 'Spouštím...';
    updateDubStatus('loading', 'Injektuji skripty...');

    const resp = await chrome.runtime.sendMessage({ type: 'inject-article-scripts', tabId: activeTabId });
    btn.disabled = false;
    if (resp?.success) {
      updateDubStatus('ready', 'Článek připraven');
      // Request context extraction for chat
      setTimeout(() => extractPageContext(), 1000);
    } else {
      updateDubStatus('error', resp?.error || 'Chyba');
    }
  }
}

function updateDubStatus(status, message) {
  document.getElementById('dubStatus').textContent = message || status;
  const btn = document.getElementById('btnDub');
  const btnText = document.getElementById('btnDubText');
  const btnIcon = document.getElementById('btnDubIcon');

  if (status === 'playing' || status === 'ready') {
    btn.className = 'dub-btn stop';
    btnText.textContent = 'Zastavit';
    btnIcon.textContent = '\u25A0';
  } else {
    btn.className = 'dub-btn';
    btnText.textContent = pageContext?.isYouTube ? 'Spustit dabing' : 'Dabovat článek';
    btnIcon.textContent = '\u25B6';
  }
}

// ── Page Context Extraction ─────────────────────────────

async function extractPageContext() {
  if (!activeTabId) return;

  try {
    // Inject extraction script and get context back
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      func: () => {
        // This runs in the page context
        const title = document.title;
        const metaDesc = document.querySelector('meta[property="og:description"]')?.content
          || document.querySelector('meta[name="description"]')?.content || '';

        // Gather visible text
        const paragraphs = [];
        const seen = new Set();
        for (const el of document.querySelectorAll('p, h1, h2, h3, h4, blockquote, li')) {
          const text = el.textContent.trim();
          if (text.length < 20 || seen.has(text)) continue;
          seen.add(text);
          paragraphs.push(text);
        }

        return {
          title,
          description: metaDesc,
          url: location.href,
          textContent: paragraphs.join('\n\n'),
          paragraphCount: paragraphs.length
        };
      }
    });

    if (results?.[0]?.result) {
      const ctx = results[0].result;
      pageContext = { ...pageContext, ...ctx };
      document.getElementById('contextTitle').textContent = ctx.title;

      const badges = [];
      if (ctx.paragraphCount > 0) badges.push({ text: `${ctx.paragraphCount} odstavců`, cls: '' });
      if (ctx.description) badges.push({ text: 'Meta popis', cls: '' });
      setContextBadges(badges);

      // Initialize chat system message with context
      chatHistory = [];
      console.log(`[SidePanel] Page context: ${ctx.paragraphCount} paragraphs, ${ctx.textContent.length} chars`);
    }
  } catch (e) {
    console.warn('[SidePanel] Context extraction failed:', e);
  }
}

function receiveArticleContext(msg) {
  if (msg.paragraphs) {
    pageContext = { ...pageContext, ...msg };
    const badges = [];
    badges.push({ text: `${msg.paragraphs} odstavců`, cls: '' });
    if (msg.hasSummary) badges.push({ text: 'AI shrnutí', cls: 'ai' });
    if (msg.audioCount > 0) badges.push({ text: `${msg.audioCount} audio`, cls: 'audio' });
    setContextBadges(badges);
  }
}

function setContextBadges(badges) {
  const container = document.getElementById('contextMeta');
  container.textContent = '';
  for (const b of badges) {
    const span = document.createElement('span');
    span.className = 'context-badge' + (b.cls ? ' ' + b.cls : '');
    span.textContent = b.text;
    container.appendChild(span);
  }
}

// ── Chat with Gemini ────────────────────────────────────

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  if (!geminiApiKey) {
    appendChatMessage('bot', 'Nastavte Gemini API klíč v záložce Nastavení.', true);
    return;
  }

  // Extract page context on first message if not yet done
  if (!pageContext?.textContent) {
    await extractPageContext();
  }

  input.value = '';
  input.style.height = 'auto';
  appendChatMessage('user', text);
  showTypingIndicator();

  // Build chat history for Gemini
  chatHistory.push({ role: 'user', parts: [{ text }] });

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'gemini-chat',
      apiKey: geminiApiKey,
      systemInstruction: buildSystemPrompt(),
      history: chatHistory.slice(0, -1), // all except current
      message: text
    });

    hideTypingIndicator();

    if (response?.success && response.text) {
      appendChatMessage('bot', response.text);
      chatHistory.push({ role: 'model', parts: [{ text: response.text }] });
    } else {
      appendChatMessage('bot', response?.error || 'Chyba komunikace s AI.', true);
      chatHistory.pop(); // remove failed user message
    }
  } catch (e) {
    hideTypingIndicator();
    appendChatMessage('bot', 'Chyba: ' + e.message, true);
    chatHistory.pop();
  }
}

function buildSystemPrompt() {
  const lang = document.getElementById('targetLanguage').value;
  const langNames = { cs: 'česky', sk: 'slovensky', pl: 'po polsku', hu: 'maďarsky' };

  let prompt = `Jsi AI asistent integrovaný do Chrome rozšíření pro dabing a překlad článků. Odpovídej ${langNames[lang] || 'česky'}, stručně a přesně.`;

  if (pageContext?.textContent) {
    // Truncate to ~100k chars to fit context window
    const content = pageContext.textContent.substring(0, 100000);
    prompt += `\n\nKontext stránky:\nTitulek: ${pageContext.title || ''}\nURL: ${pageContext.url || ''}\nPopis: ${pageContext.description || ''}\n\nObsah:\n${content}`;
  }

  return prompt;
}

function appendChatMessage(role, text, isError = false) {
  const container = document.getElementById('chatMessages');
  // Remove welcome message if present
  const welcome = container.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg ' + role;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble' + (isError ? ' error' : '');
  bubble.textContent = text;
  msgDiv.appendChild(bubble);
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function showTypingIndicator() {
  const container = document.getElementById('chatMessages');
  const typing = document.createElement('div');
  typing.className = 'chat-msg bot';
  typing.id = 'typingIndicator';
  const bubble = document.createElement('div');
  bubble.className = 'chat-typing';
  for (let i = 0; i < 3; i++) {
    bubble.appendChild(document.createElement('span'));
  }
  typing.appendChild(bubble);
  container.appendChild(typing);
  container.scrollTop = container.scrollHeight;
}

function hideTypingIndicator() {
  document.getElementById('typingIndicator')?.remove();
}

// ── Voice Input (SpeechRecognition) ─────────────────────

let recognition = null;
let isRecording = false;
let spaceHeld = false;
let micPermissionGranted = false;

function bindVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('[Voice] SpeechRecognition API not available');
    document.getElementById('btnVoice').style.display = 'none';
    return;
  }

  // Button click — toggle
  document.getElementById('btnVoice').addEventListener('mousedown', () => startRecording());
  document.getElementById('btnVoice').addEventListener('mouseup', () => stopRecording());
  document.getElementById('btnVoice').addEventListener('mouseleave', () => { if (isRecording) stopRecording(); });

  // Hold spacebar — only when chat input is NOT focused
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !spaceHeld && document.activeElement !== document.getElementById('chatInput')) {
      e.preventDefault();
      spaceHeld = true;
      startRecording();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && spaceHeld) {
      spaceHeld = false;
      stopRecording();
    }
  });
}

function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    const input = document.getElementById('chatInput');
    let interim = '';
    let final = '';
    for (let i = 0; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }
    if (final) {
      input.value = (input.value ? input.value + ' ' : '') + final.trim();
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    }
    if (interim) {
      input.placeholder = interim + '...';
    }
  };

  recognition.onend = () => {
    if (spaceHeld) {
      try { recognition.start(); } catch (e) {}
      return;
    }
    stopRecording();
  };

  recognition.onerror = (e) => {
    console.warn('[Voice] recognition error:', e.error, e.message);
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    if (e.error === 'not-allowed') {
      micPermissionGranted = false;
      document.getElementById('chatInput').placeholder = 'Mikrofon zamítnut — povolte v nastavení prohlížeče';
    }
    stopRecording();
  };
}

async function requestMicPermission() {
  if (micPermissionGranted) return true;
  try {
    // Extension pages need explicit getUserMedia to unlock mic for SpeechRecognition
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop tracks immediately — we just needed the permission grant
    stream.getTracks().forEach(t => t.stop());
    micPermissionGranted = true;
    console.log('[Voice] Microphone permission granted');
    return true;
  } catch (e) {
    console.warn('[Voice] Microphone permission denied:', e);
    document.getElementById('chatInput').placeholder = 'Mikrofon zamítnut — povolte v nastavení prohlížeče';
    return false;
  }
}

async function startRecording() {
  if (isRecording) return;

  // Request mic permission first (needed in extension context)
  const allowed = await requestMicPermission();
  if (!allowed) return;

  if (!recognition) initRecognition();

  isRecording = true;
  const lang = document.getElementById('targetLanguage').value;
  const langMap = { cs: 'cs-CZ', sk: 'sk-SK', pl: 'pl-PL', hu: 'hu-HU' };
  recognition.lang = langMap[lang] || 'cs-CZ';

  document.getElementById('btnVoice').classList.add('recording');
  document.getElementById('chatInput').placeholder = 'Naslouchám...';

  try {
    recognition.start();
    console.log('[Voice] Recording started, lang:', recognition.lang);
  } catch (e) {
    console.error('[Voice] Failed to start recognition:', e);
    isRecording = false;
    document.getElementById('btnVoice').classList.remove('recording');
  }
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  document.getElementById('btnVoice').classList.remove('recording');
  document.getElementById('chatInput').placeholder = 'Zeptejte se... (drž mezerník = hlas)';

  try { recognition.stop(); } catch (e) {}

  // Auto-send if there's text
  const input = document.getElementById('chatInput');
  if (input.value.trim()) {
    sendChatMessage();
  }
}

// ── Settings ────────────────────────────────────────────

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get('popupSettings');
    const s = result.popupSettings || {};
    if (s.targetLanguage) document.getElementById('targetLanguage').value = s.targetLanguage;
    if (s.translatorEngine) {
      document.getElementById('translatorEngine').value = s.translatorEngine;
      document.getElementById('apiKeyGroup').style.display = s.translatorEngine === 'claude' ? 'block' : 'none';
      document.getElementById('deeplKeyGroup').style.display = s.translatorEngine === 'deepl' ? 'block' : 'none';
    }
    if (s.anthropicApiKey) document.getElementById('anthropicApiKey').value = s.anthropicApiKey;
    if (s.deeplApiKey) document.getElementById('deeplApiKey').value = s.deeplApiKey;
    if (s.geminiApiKey) {
      document.getElementById('geminiApiKey').value = s.geminiApiKey;
      geminiApiKey = s.geminiApiKey;
    }
    if (s.ttsVolume) {
      document.getElementById('ttsVolume').value = s.ttsVolume;
      document.getElementById('volumeValue').textContent = s.ttsVolume + '%';
    }
    if (s.ttsRate) {
      document.getElementById('ttsRate').value = s.ttsRate;
      document.getElementById('rateValue').textContent = (parseInt(s.ttsRate) / 100).toFixed(1) + 'x';
    }
    if (s.originalVolume) {
      document.getElementById('originalVolume').value = s.originalVolume;
      document.getElementById('origVolValue').textContent = s.originalVolume + '%';
    }
    if (s.muteOriginal !== undefined) document.getElementById('muteOriginal').checked = s.muteOriginal;
    if (s.ttsEngine) {
      document.getElementById('ttsEngine').value = s.ttsEngine;
      document.getElementById('azureTtsGroup').style.display = s.ttsEngine === 'azure' ? 'block' : 'none';
    }
    if (s.azureTtsKey) document.getElementById('azureTtsKey').value = s.azureTtsKey;
    if (s.azureTtsRegion) document.getElementById('azureTtsRegion').value = s.azureTtsRegion;
    if (s.azureTtsVoice) document.getElementById('azureTtsVoice').value = s.azureTtsVoice;

    // Update header flag
    const flags = { cs: '\uD83C\uDDE8\uD83C\uDDFF', sk: '\uD83C\uDDF8\uD83C\uDDF0', pl: '\uD83C\uDDF5\uD83C\uDDF1', hu: '\uD83C\uDDED\uD83C\uDDFA' };
    document.getElementById('headerFlag').textContent = flags[s.targetLanguage] || '\uD83C\uDDE8\uD83C\uDDFF';
  } catch (e) {}
}

function saveSettings() {
  const s = {
    targetLanguage: document.getElementById('targetLanguage').value,
    translatorEngine: document.getElementById('translatorEngine').value,
    anthropicApiKey: document.getElementById('anthropicApiKey').value,
    deeplApiKey: document.getElementById('deeplApiKey').value,
    geminiApiKey: document.getElementById('geminiApiKey').value,
    ttsVolume: document.getElementById('ttsVolume').value,
    ttsRate: document.getElementById('ttsRate').value,
    originalVolume: document.getElementById('originalVolume').value,
    muteOriginal: document.getElementById('muteOriginal').checked,
    ttsEngine: document.getElementById('ttsEngine').value,
    azureTtsKey: document.getElementById('azureTtsKey').value,
    azureTtsRegion: document.getElementById('azureTtsRegion').value,
    azureTtsVoice: document.getElementById('azureTtsVoice').value,
  };
  geminiApiKey = s.geminiApiKey;
  chrome.storage.local.set({ popupSettings: s });

  // Update header flag
  const flags = { cs: '\uD83C\uDDE8\uD83C\uDDFF', sk: '\uD83C\uDDF8\uD83C\uDDF0', pl: '\uD83C\uDDF5\uD83C\uDDF1', hu: '\uD83C\uDDED\uD83C\uDDFA' };
  document.getElementById('headerFlag').textContent = flags[s.targetLanguage] || '\uD83C\uDDE8\uD83C\uDDFF';
}

function bindSettingsEvents() {
  const autoSave = () => saveSettings();
  const ids = ['targetLanguage', 'translatorEngine', 'anthropicApiKey', 'deeplApiKey',
    'geminiApiKey', 'ttsVolume', 'ttsRate', 'originalVolume', 'muteOriginal',
    'ttsEngine', 'azureTtsKey', 'azureTtsRegion', 'azureTtsVoice'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('change', autoSave);
    if (el.type === 'range') el.addEventListener('input', () => {
      if (id === 'ttsVolume') document.getElementById('volumeValue').textContent = el.value + '%';
      if (id === 'ttsRate') document.getElementById('rateValue').textContent = (parseInt(el.value) / 100).toFixed(1) + 'x';
      if (id === 'originalVolume') document.getElementById('origVolValue').textContent = el.value + '%';
      autoSave();
    });
  });

  // Show/hide conditional fields
  document.getElementById('translatorEngine').addEventListener('change', (e) => {
    document.getElementById('apiKeyGroup').style.display = e.target.value === 'claude' ? 'block' : 'none';
    document.getElementById('deeplKeyGroup').style.display = e.target.value === 'deepl' ? 'block' : 'none';
  });
  document.getElementById('ttsEngine').addEventListener('change', (e) => {
    document.getElementById('azureTtsGroup').style.display = e.target.value === 'azure' ? 'block' : 'none';
  });
}

// ── Helpers ──────────────────────────────────────────────

async function sendToTab(msg) {
  if (!activeTabId) return null;
  try {
    return await chrome.tabs.sendMessage(activeTabId, msg);
  } catch (e) {
    console.warn('[SidePanel] sendToTab failed:', e);
    return null;
  }
}
