/**
 * Side Panel — Dubbing controls + Gemini AI Chat.
 * Communicates with content scripts via chrome.tabs.sendMessage
 * and with background.js for API calls.
 */

let activeTabId = null;
let pageContext = null; // { title, paragraphs, summary, meta, audioElements, isYouTube }
let chatHistory = []; // [{role: 'user'|'model', parts: [{text}]}]
let geminiApiKey = null;
let aiBackend = 'gemini'; // 'gemini' | 'ollama'
let ollamaUrl = 'http://localhost:11434';
let ollamaModel = '';
let currentLang = 'cs';
let ttsEnabled = false;
let voiceDialogueListening = false; // true when auto-listening after TTS
let voiceSilenceTimer = null;       // timer for silence detection
let chatPaused = false;             // pauses voice dialogue loop

// Session token tracking
let sessionUsage = { input: 0, output: 0, cost: 0, requests: 0 };

// ── Localization ────────────────────────────────────────

const i18n = {
  cs: {
    tabDubbing: 'Dabing', tabChat: 'Chat AI', tabSettings: 'Nastavení',
    loading: 'Načítání...', unsupported: 'Nepodporovaná stránka',
    startDub: 'Spustit dabing', dubArticle: 'Dabovat článek',
    starting: 'Spouštím...', stop: 'Zastavit', ready: 'Připraveno',
    injecting: 'Injektuji skripty...', errorStart: 'Nepodařilo se spustit',
    summary: 'Shrnutí', fullArticle: 'Celý článek',
    chatWelcome: 'Zeptejte se na cokoliv o obsahu stránky.',
    chatEngine: 'Používám Gemini Flash-Lite pro rychlé odpovědi.',
    chatPlaceholder: 'Zeptejte se... (drž mezerník = hlas)',
    chip1: 'O čem je tento článek?', chip2: 'Shrň hlavní body', chip3: 'Co je nejdůležitější?',
    noApiKey: 'Nastavte Gemini API klíč v záložce Nastavení.',
    noOllamaModel: 'Vyberte Ollama model v Nastavení. Je Ollama spuštěná?',
    chatError: 'Chyba komunikace s AI.',
    recording: 'Naslouchám...', micDenied: 'Mikrofon zamítnut',
    micDeniedFull: 'Mikrofon zamítnut — povolte v nastavení',
    holdSpace: 'Držte mezerník',
    // Settings
    langLabel: 'Jazyk dabingu', translatorLabel: 'Překladač',
    deeplKey: 'DeepL API klíč', claudeKey: 'Anthropic API klíč',
    geminiKey: 'Gemini API klíč (Chat AI)', geminiHint: 'Flash-Lite: free tier k dispozici',
    volumeLabel: 'Hlasitost dabingu', rateLabel: 'Rychlost řeči',
    origVolLabel: 'Hlasitost originálu', muteOrig: 'Úplně ztlumit originál',
    ttsLabel: 'Hlasový engine (TTS)', azureKey: 'Azure Speech klíč',
    regionLabel: 'Region', voiceLabel: 'Hlas',
    paragraphs: 'odstavců', aiSummary: 'AI shrnutí', audio: 'audio',
    article: 'Článek',
    getDeepL: 'Získat DeepL API klíč (500k zn./měs. zdarma)',
    getClaude: 'Získat Claude API klíč (console.anthropic.com)',
    getGemini: 'Získat Gemini API klíč (Google AI Studio)',
    getAzure: 'Získat Azure Speech klíč (portal.azure.com)',
    ttsOn: 'Hlasový dialog zapnut', ttsOff: 'Hlasový dialog vypnut',
    copiedToClipboard: 'Zkopírováno do schránky', pasteInNotes: 'vložte do Poznámek',
    dialogPaused: 'Dialog pozastaven',
  },
  sk: {
    tabDubbing: 'Dabing', tabChat: 'Chat AI', tabSettings: 'Nastavenia',
    loading: 'Načítavam...', unsupported: 'Nepodporovaná stránka',
    startDub: 'Spustiť dabing', dubArticle: 'Dabovať článok',
    starting: 'Spúšťam...', stop: 'Zastaviť', ready: 'Pripravené',
    injecting: 'Injektujem skripty...', errorStart: 'Nepodarilo sa spustiť',
    summary: 'Zhrnutie', fullArticle: 'Celý článok',
    chatWelcome: 'Spýtajte sa čokoľvek o obsahu stránky.',
    chatEngine: 'Používam Gemini Flash-Lite pre rýchle odpovede.',
    chatPlaceholder: 'Spýtajte sa... (drž medzerník = hlas)',
    chip1: 'O čom je tento článok?', chip2: 'Zhrň hlavné body', chip3: 'Čo je najdôležitejšie?',
    noApiKey: 'Nastavte Gemini API kľúč v záložke Nastavenia.',
    noOllamaModel: 'Vyberte Ollama model v Nastaveniach. Je Ollama spustená?',
    chatError: 'Chyba komunikácie s AI.',
    recording: 'Počúvam...', micDenied: 'Mikrofón zamietnutý',
    micDeniedFull: 'Mikrofón zamietnutý — povoľte v nastaveniach',
    holdSpace: 'Držte medzerník',
    langLabel: 'Jazyk dabingu', translatorLabel: 'Prekladač',
    deeplKey: 'DeepL API kľúč', claudeKey: 'Anthropic API kľúč',
    geminiKey: 'Gemini API kľúč (Chat AI)', geminiHint: 'Flash-Lite: free tier k dispozícii',
    volumeLabel: 'Hlasitosť dabingu', rateLabel: 'Rýchlosť reči',
    origVolLabel: 'Hlasitosť originálu', muteOrig: 'Úplne stlmiť originál',
    ttsLabel: 'Hlasový engine (TTS)', azureKey: 'Azure Speech kľúč',
    regionLabel: 'Región', voiceLabel: 'Hlas',
    paragraphs: 'odsekov', aiSummary: 'AI zhrnutie', audio: 'audio',
    article: 'Článok',
    getDeepL: 'Získať DeepL API kľúč (500k zn./mes. zadarmo)',
    getClaude: 'Získať Claude API kľúč (console.anthropic.com)',
    getGemini: 'Získať Gemini API kľúč (Google AI Studio)',
    getAzure: 'Získať Azure Speech kľúč (portal.azure.com)',
    ttsOn: 'Hlasový dialóg zapnutý', ttsOff: 'Hlasový dialóg vypnutý',
    copiedToClipboard: 'Skopírované do schránky', pasteInNotes: 'vložte do Poznámok',
    dialogPaused: 'Dialóg pozastavený',
  },
  pl: {
    tabDubbing: 'Dubbing', tabChat: 'Chat AI', tabSettings: 'Ustawienia',
    loading: 'Ładowanie...', unsupported: 'Nieobsługiwana strona',
    startDub: 'Uruchom dubbing', dubArticle: 'Dubbinguj artykuł',
    starting: 'Uruchamiam...', stop: 'Zatrzymaj', ready: 'Gotowe',
    injecting: 'Wstrzykuję skrypty...', errorStart: 'Nie udało się uruchomić',
    summary: 'Streszczenie', fullArticle: 'Cały artykuł',
    chatWelcome: 'Zapytaj o cokolwiek dotyczącego treści strony.',
    chatEngine: 'Używam Gemini Flash-Lite dla szybkich odpowiedzi.',
    chatPlaceholder: 'Zapytaj... (przytrzymaj spację = głos)',
    chip1: 'O czym jest ten artykuł?', chip2: 'Podsumuj główne punkty', chip3: 'Co jest najważniejsze?',
    noApiKey: 'Ustaw klucz Gemini API w zakładce Ustawienia.',
    noOllamaModel: 'Wybierz model Ollama w Ustawieniach. Czy Ollama działa?',
    chatError: 'Błąd komunikacji z AI.',
    recording: 'Słucham...', micDenied: 'Mikrofon odrzucony',
    micDeniedFull: 'Mikrofon odrzucony — zezwól w ustawieniach',
    holdSpace: 'Przytrzymaj spację',
    langLabel: 'Język dubbingu', translatorLabel: 'Tłumacz',
    deeplKey: 'Klucz API DeepL', claudeKey: 'Klucz API Anthropic',
    geminiKey: 'Klucz API Gemini (Chat AI)', geminiHint: 'Flash-Lite: darmowy tier dostępny',
    volumeLabel: 'Głośność dubbingu', rateLabel: 'Szybkość mowy',
    origVolLabel: 'Głośność oryginału', muteOrig: 'Całkowicie wycisz oryginał',
    ttsLabel: 'Silnik głosowy (TTS)', azureKey: 'Klucz Azure Speech',
    regionLabel: 'Region', voiceLabel: 'Głos',
    paragraphs: 'akapitów', aiSummary: 'AI podsumowanie', audio: 'audio',
    article: 'Artykuł',
    getDeepL: 'Uzyskaj klucz DeepL API (500k zn./mies. za darmo)',
    getClaude: 'Uzyskaj klucz Claude API (console.anthropic.com)',
    getGemini: 'Uzyskaj klucz Gemini API (Google AI Studio)',
    getAzure: 'Uzyskaj klucz Azure Speech (portal.azure.com)',
    ttsOn: 'Dialog głosowy włączony', ttsOff: 'Dialog głosowy wyłączony',
    copiedToClipboard: 'Skopiowano do schowka', pasteInNotes: 'wklej do Notatek',
    dialogPaused: 'Dialog wstrzymany',
  },
  hu: {
    tabDubbing: 'Szinkron', tabChat: 'Chat AI', tabSettings: 'Beállítások',
    loading: 'Betöltés...', unsupported: 'Nem támogatott oldal',
    startDub: 'Szinkron indítása', dubArticle: 'Cikk szinkronizálása',
    starting: 'Indítás...', stop: 'Leállítás', ready: 'Kész',
    injecting: 'Szkriptek injektálása...', errorStart: 'Nem sikerült elindítani',
    summary: 'Összefoglaló', fullArticle: 'Teljes cikk',
    chatWelcome: 'Kérdezzen bármit az oldal tartalmáról.',
    chatEngine: 'Gemini Flash-Lite-ot használok a gyors válaszokhoz.',
    chatPlaceholder: 'Kérdezzen... (tartsa a szóközt = hang)',
    chip1: 'Miről szól ez a cikk?', chip2: 'Foglald össze a fő pontokat', chip3: 'Mi a legfontosabb?',
    noApiKey: 'Állítsa be a Gemini API kulcsot a Beállítások fülön.',
    noOllamaModel: 'Válasszon Ollama modellt a Beállításokban. Fut az Ollama?',
    chatError: 'Hiba az AI kommunikációban.',
    recording: 'Hallgatom...', micDenied: 'Mikrofon megtagadva',
    micDeniedFull: 'Mikrofon megtagadva — engedélyezze a beállításokban',
    holdSpace: 'Tartsa a szóközt',
    langLabel: 'Szinkron nyelve', translatorLabel: 'Fordító',
    deeplKey: 'DeepL API kulcs', claudeKey: 'Anthropic API kulcs',
    geminiKey: 'Gemini API kulcs (Chat AI)', geminiHint: 'Flash-Lite: ingyenes szint elérhető',
    volumeLabel: 'Szinkron hangereje', rateLabel: 'Beszédsebesség',
    origVolLabel: 'Eredeti hangereje', muteOrig: 'Eredeti teljes némítása',
    ttsLabel: 'Hang motor (TTS)', azureKey: 'Azure Speech kulcs',
    regionLabel: 'Régió', voiceLabel: 'Hang',
    paragraphs: 'bekezdés', aiSummary: 'AI összefoglaló', audio: 'audio',
    article: 'Cikk',
    getDeepL: 'DeepL API kulcs beszerzése (500k kar./hó ingyen)',
    getClaude: 'Claude API kulcs beszerzése (console.anthropic.com)',
    getGemini: 'Gemini API kulcs beszerzése (Google AI Studio)',
    getAzure: 'Azure Speech kulcs beszerzése (portal.azure.com)',
    ttsOn: 'Hangos párbeszéd bekapcsolva', ttsOff: 'Hangos párbeszéd kikapcsolva',
    copiedToClipboard: 'Másolva a vágólapra', pasteInNotes: 'illessze be a Jegyzetekbe',
    dialogPaused: 'Párbeszéd szüneteltetve',
  },
  en: {
    tabDubbing: 'Dubbing', tabChat: 'Chat AI', tabSettings: 'Settings',
    loading: 'Loading...', unsupported: 'Unsupported page',
    startDub: 'Start dubbing', dubArticle: 'Dub article',
    starting: 'Starting...', stop: 'Stop', ready: 'Ready',
    injecting: 'Injecting scripts...', errorStart: 'Failed to start',
    summary: 'Summary', fullArticle: 'Full article',
    chatWelcome: 'Ask anything about the page content.',
    chatEngine: 'Using Gemini Flash-Lite for fast answers.',
    chatPlaceholder: 'Ask... (hold spacebar = voice)',
    chip1: 'What is this article about?', chip2: 'Summarize the main points', chip3: 'What is most important?',
    noApiKey: 'Set Gemini API key in the Settings tab.',
    noOllamaModel: 'Select an Ollama model in Settings. Is Ollama running?',
    chatError: 'AI communication error.',
    recording: 'Listening...', micDenied: 'Microphone denied',
    micDeniedFull: 'Microphone denied — allow in browser settings',
    holdSpace: 'Hold spacebar',
    langLabel: 'Dubbing language', translatorLabel: 'Translator',
    deeplKey: 'DeepL API key', claudeKey: 'Anthropic API key',
    geminiKey: 'Gemini API key (Chat AI)', geminiHint: 'Flash-Lite: free tier available',
    volumeLabel: 'Dubbing volume', rateLabel: 'Speech rate',
    origVolLabel: 'Original volume', muteOrig: 'Completely mute original',
    ttsLabel: 'Voice engine (TTS)', azureKey: 'Azure Speech key',
    regionLabel: 'Region', voiceLabel: 'Voice',
    paragraphs: 'paragraphs', aiSummary: 'AI summary', audio: 'audio',
    article: 'Article',
    getDeepL: 'Get DeepL API key (500k chars/mo free)',
    getClaude: 'Get Claude API key (console.anthropic.com)',
    getGemini: 'Get Gemini API key (Google AI Studio)',
    getAzure: 'Get Azure Speech key (portal.azure.com)',
    ttsOn: 'Voice dialogue on', ttsOff: 'Voice dialogue off',
    copiedToClipboard: 'Copied to clipboard', pasteInNotes: 'paste in Notes',
    dialogPaused: 'Dialogue paused',
  },
};

// Fallback chain: exact lang → en → cs
function t(key) {
  return (i18n[currentLang] || {})[key] || i18n.en[key] || i18n.cs[key] || key;
}

function applyLanguage(lang) {
  currentLang = lang || 'cs';
  document.documentElement.lang = currentLang;

  // Tabs
  document.querySelector('[data-tab="dubbing"]').lastChild.textContent = ' ' + t('tabDubbing');
  document.querySelector('[data-tab="chat"]').lastChild.textContent = ' ' + t('tabChat');
  document.querySelector('[data-tab="settings"]').lastChild.textContent = ' ' + t('tabSettings');

  // Dubbing
  document.getElementById('btnModeSummary').textContent = t('summary');
  document.getElementById('btnModeFull').textContent = t('fullArticle');
  document.getElementById('dubStatus').textContent = t('ready');

  // Chat
  const welcome = document.querySelector('.chat-welcome');
  if (welcome) {
    const textDiv = welcome.querySelectorAll('div')[1];
    if (textDiv) {
      textDiv.textContent = '';
      textDiv.appendChild(document.createTextNode(t('chatWelcome')));
      textDiv.appendChild(document.createElement('br'));
      textDiv.appendChild(document.createTextNode(t('chatEngine')));
    }
  }
  document.getElementById('chatInput').placeholder = t('chatPlaceholder');
  const chips = document.querySelectorAll('.chat-suggestion');
  if (chips[0]) { chips[0].textContent = t('chip1'); chips[0].dataset.q = t('chip1'); }
  if (chips[1]) { chips[1].textContent = t('chip2'); chips[1].dataset.q = t('chip2'); }
  if (chips[2]) { chips[2].textContent = t('chip3'); chips[2].dataset.q = t('chip3'); }

  // Voice hint
  const hint = document.querySelector('.voice-hint');
  if (hint) hint.textContent = t('holdSpace');

  // Settings labels (data-i18n mapped)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
}

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
    document.getElementById('btnDubText').textContent = t('startDub');
    // Try get status from content script
    try {
      const resp = await chrome.tabs.sendMessage(activeTabId, { type: 'get-status' });
      if (resp) updateDubStatus(resp.status, resp.message);
    } catch (e) {}
  } else if (isWeb) {
    document.getElementById('btnDubText').textContent = t('dubArticle');
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
    setContextBadges([{ text: t('article'), cls: '' }]);
  } else {
    document.getElementById('contextTitle').textContent = t('unsupported');
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
    refreshUsageStats();
  });
  document.getElementById('btnRefresh').addEventListener('click', () => {
    extractPageContext();
  });

  bindSettingsEvents();
  bindVoiceInput();
  bindTtsToggle();
  bindChatActions();

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
    btnText.textContent = t('starting');
    const resp = await sendToTab({ type: 'start-dubbing' });
    btn.disabled = false;
    if (resp?.success) {
      updateDubStatus('playing', t('tabDubbing'));
    } else {
      updateDubStatus('error', t('errorStart'));
    }
  } else {
    // Article: inject scripts first, then they auto-start
    btn.disabled = true;
    btnText.textContent = t('starting');
    updateDubStatus('loading', t('injecting'));

    const resp = await chrome.runtime.sendMessage({ type: 'inject-article-scripts', tabId: activeTabId });
    btn.disabled = false;
    if (resp?.success) {
      updateDubStatus('ready', t('ready'));
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
    btnText.textContent = t('stop');
    setSvgIcon(btnIcon, '#ico-stop');
  } else {
    btn.className = 'dub-btn';
    btnText.textContent = pageContext?.isYouTube ? t('startDub') : t('dubArticle');
    setSvgIcon(btnIcon, '#ico-play');
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
          paragraphs,
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
      if (ctx.paragraphCount > 0) badges.push({ text: `${ctx.paragraphCount} ${t('paragraphs')}`, cls: '' });
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
    badges.push({ text: `${msg.paragraphs} ${t('paragraphs')}`, cls: '' });
    if (msg.hasSummary) badges.push({ text: t('aiSummary'), cls: 'ai' });
    if (msg.audioCount > 0) badges.push({ text: `${msg.audioCount} ${t('audio')}`, cls: 'audio' });
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

  // Show action bar after first message
  document.getElementById('chatActions').classList.add('visible');

  if (chatPaused) {
    // Queue message visually but don't send
    appendChatMessage('user', text);
    input.value = '';
    input.style.height = 'auto';
    return;
  }

  // Validate backend config
  if (aiBackend === 'gemini' && !geminiApiKey) {
    appendChatMessage('bot', t('noApiKey'), true);
    return;
  }
  if (aiBackend === 'ollama' && !ollamaModel) {
    appendChatMessage('bot', t('noOllamaModel'), true);
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

  // Build chat history (Gemini format — also used by Ollama adapter)
  chatHistory.push({ role: 'user', parts: [{ text }] });

  try {
    const chatMsg = aiBackend === 'ollama'
      ? { type: 'ollama-chat', baseUrl: ollamaUrl, model: ollamaModel,
          systemInstruction: buildSystemPrompt(), history: chatHistory.slice(0, -1), message: text }
      : { type: 'gemini-chat', apiKey: geminiApiKey,
          systemInstruction: buildSystemPrompt(), history: chatHistory.slice(0, -1), message: text };
    const response = await chrome.runtime.sendMessage(chatMsg);

    hideTypingIndicator();

    if (response?.success && response.text) {
      appendChatMessage('bot', response.text);
      chatHistory.push({ role: 'model', parts: [{ text: response.text }] });
      // Update token tracking
      if (response.usage) {
        sessionUsage.input += response.usage.input;
        sessionUsage.output += response.usage.output;
        sessionUsage.cost += response.usage.cost;
        sessionUsage.requests++;
        updateTokenBar();
      }
      // TTS: speak the response if voice dialogue is enabled
      if (ttsEnabled) {
        speakText(response.text);
      }
    } else {
      appendChatMessage('bot', response?.error || t('chatError'), true);
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
  const langNames = {
    cs: 'česky', sk: 'slovensky', pl: 'po polsku', hu: 'maďarsky',
    en: 'in English', de: 'auf Deutsch', fr: 'en français', es: 'en español',
    pt: 'em português', it: 'in italiano', nl: 'in het Nederlands',
    ru: 'по-русски', uk: 'українською', ja: '日本語で', ko: '한국어로',
    zh: '用中文', 'zh-TW': '用繁體中文', ar: 'بالعربية', hi: 'हिंदी में',
    tr: 'Türkçe', sv: 'på svenska', da: 'på dansk', nb: 'på norsk',
    fi: 'suomeksi', el: 'στα ελληνικά', ro: 'în română', bg: 'на български',
    th: 'เป็นภาษาไทย', vi: 'bằng tiếng Việt', id: 'dalam Bahasa Indonesia'
  };

  let prompt = `Jsi AI asistent integrovaný do Chrome rozšíření pro dabing a překlad článků. Odpovídej ${langNames[lang] || 'česky'}, stručně a přesně.`;

  if (pageContext?.paragraphs?.length) {
    // Number paragraphs for citation references
    const numbered = pageContext.paragraphs
      .slice(0, 500) // max 500 paragraphs
      .map((p, i) => `[${i + 1}] ${p}`)
      .join('\n\n');
    const content = numbered.substring(0, 100000);

    prompt += `\n\nNíže je očíslovaný obsah navštívené stránky. Odpovídej VÝHRADNĚ na základě tohoto obsahu. Nepřidávej informace ze svého tréninku ani z jiných zdrojů. Pokud odpověď nelze odvodit z přiloženého textu, řekni to otevřeně.`;
    prompt += `\n\nKe každému tvrzení přidej citaci ve formátu [N] odkazující na číslo odstavce, ze kterého informace pochází. Příklad: "Společnost dosáhla růstu 20 % [3]. Hlavním faktorem byl export [5][7]."`;
    prompt += `\n\nKontext stránky:\nTitulek: ${pageContext.title || ''}\nURL: ${pageContext.url || ''}\nPopis: ${pageContext.description || ''}\n\nObsah:\n${content}`;
  } else if (pageContext?.textContent) {
    const content = pageContext.textContent.substring(0, 100000);
    prompt += `\n\nNíže je obsah navštívené stránky. Odpovídej VÝHRADNĚ na základě tohoto obsahu. Nepřidávej informace ze svého tréninku ani z jiných zdrojů. Pokud odpověď nelze odvodit z přiloženého textu, řekni to otevřeně.`;
    prompt += `\n\nKontext stránky:\nTitulek: ${pageContext.title || ''}\nURL: ${pageContext.url || ''}\nPopis: ${pageContext.description || ''}\n\nObsah:\n${content}`;
  } else {
    prompt += `\nNemáš k dispozici obsah stránky. Upozorni uživatele, že nejprve musí otevřít stránku s obsahem.`;
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

  if (isError || role === 'user') {
    bubble.textContent = text;
  } else {
    bubble.appendChild(renderMarkdown(text));
  }

  msgDiv.appendChild(bubble);
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

/** Lightweight Markdown to DOM renderer (XSS-safe, no innerHTML) */
function renderMarkdown(md) {
  const frag = document.createDocumentFragment();
  const lines = md.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = codeLines.join('\n');
      pre.appendChild(code);
      frag.appendChild(pre);
      continue;
    }

    // Heading
    const hm = line.match(/^(#{1,4})\s+(.+)/);
    if (hm) {
      const h = document.createElement('h' + Math.min(hm[1].length + 1, 5));
      appendInlineFmt(h, hm[2]);
      frag.appendChild(h);
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const ul = document.createElement('ul');
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const li = document.createElement('li');
        appendInlineFmt(li, lines[i].replace(/^\s*[-*]\s+/, ''));
        ul.appendChild(li);
        i++;
      }
      frag.appendChild(ul);
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const ol = document.createElement('ol');
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        const li = document.createElement('li');
        appendInlineFmt(li, lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        ol.appendChild(li);
        i++;
      }
      frag.appendChild(ol);
      continue;
    }

    // Empty line
    if (line.trim() === '') { i++; continue; }

    // Paragraph — collect consecutive text lines
    const p = document.createElement('p');
    const pLines = [];
    while (i < lines.length && lines[i].trim() !== '' &&
           !lines[i].trimStart().startsWith('```') &&
           !/^#{1,4}\s/.test(lines[i]) &&
           !/^\s*[-*]\s+/.test(lines[i]) &&
           !/^\s*\d+[.)]\s+/.test(lines[i])) {
      pLines.push(lines[i]);
      i++;
    }
    appendInlineFmt(p, pLines.join(' '));
    frag.appendChild(p);
  }
  return frag;
}

/** Render **bold**, *italic*, `code`, [N] citations as safe DOM nodes */
function appendInlineFmt(el, text) {
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(\d+)\])/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) { // eslint-disable-line
    if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[2]) { const s = document.createElement('strong'); s.textContent = m[2]; el.appendChild(s); }
    else if (m[3]) { const s = document.createElement('em'); s.textContent = m[3]; el.appendChild(s); }
    else if (m[4]) { const s = document.createElement('code'); s.textContent = m[4]; el.appendChild(s); }
    else if (m[5]) { el.appendChild(createCitationBadge(parseInt(m[5]))); }
    last = m.index + m[0].length;
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
}

/** Create a clickable citation badge [N] with tooltip showing source paragraph */
function createCitationBadge(num) {
  const badge = document.createElement('span');
  badge.className = 'citation-badge';
  badge.textContent = num;
  badge.dataset.cite = num;

  // Get source paragraph text
  const paragraphs = pageContext?.paragraphs;
  const srcText = paragraphs?.[num - 1];

  if (srcText) {
    badge.addEventListener('mouseenter', (e) => {
      showCitationTooltip(e.target, num, srcText);
    });
    badge.addEventListener('mouseleave', () => {
      hideCitationTooltip();
    });
    badge.addEventListener('click', () => {
      // Scroll to paragraph in active tab
      if (activeTabId) {
        chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          func: (text) => {
            for (const el of document.querySelectorAll('p, h1, h2, h3, h4, blockquote, li')) {
              if (el.textContent.trim() === text) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.transition = 'background 0.3s';
                el.style.background = 'rgba(52, 152, 219, 0.25)';
                setTimeout(() => { el.style.background = ''; }, 2000);
                break;
              }
            }
          },
          args: [srcText]
        });
      }
    });
  }

  return badge;
}

function showCitationTooltip(anchor, num, text) {
  hideCitationTooltip();
  const tip = document.createElement('div');
  tip.className = 'citation-tooltip';
  tip.id = 'citationTooltip';

  const header = document.createElement('div');
  header.className = 'citation-tooltip-header';
  header.textContent = `[${num}]`;
  tip.appendChild(header);

  const body = document.createElement('div');
  body.className = 'citation-tooltip-body';
  body.textContent = text.length > 300 ? text.substring(0, 300) + '…' : text;
  tip.appendChild(body);

  document.body.appendChild(tip);

  // Position near badge
  const rect = anchor.getBoundingClientRect();
  tip.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 260)) + 'px';
  tip.style.top = (rect.bottom + 6) + 'px';
}

function hideCitationTooltip() {
  document.getElementById('citationTooltip')?.remove();
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

// ── Voice Input (via offscreen SpeechRecognition) ───────
// SpeechRecognition doesn't work in chrome-extension:// pages.
// We run it in an offscreen document and relay results via messages.

let isRecording = false;
let spaceHeld = false;
let audioContext = null;
let analyser = null;
let micStream = null;
let vizAnimFrame = null;
let recordingStart = 0;

const bcp47Map = {
  cs: 'cs-CZ', sk: 'sk-SK', pl: 'pl-PL', hu: 'hu-HU', en: 'en-US',
  de: 'de-DE', fr: 'fr-FR', es: 'es-ES', pt: 'pt-PT', it: 'it-IT',
  nl: 'nl-NL', ru: 'ru-RU', uk: 'uk-UA', ja: 'ja-JP', ko: 'ko-KR',
  zh: 'zh-CN', 'zh-TW': 'zh-TW', ar: 'ar-SA', hi: 'hi-IN', tr: 'tr-TR',
  sv: 'sv-SE', da: 'da-DK', nb: 'nb-NO', fi: 'fi-FI', el: 'el-GR',
  ro: 'ro-RO', bg: 'bg-BG', th: 'th-TH', vi: 'vi-VN', id: 'id-ID'
};

function bindVoiceInput() {
  // Button hold
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

  // Listen for voice results from offscreen document (via background relay)
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'voice-result') {
      const input = document.getElementById('chatInput');
      if (msg.final) {
        input.value = (input.value ? input.value + ' ' : '') + msg.final.trim();
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        // Voice dialogue: reset/start 2s auto-send timer after each final chunk
        if (voiceSilenceTimer) clearTimeout(voiceSilenceTimer);
        if (voiceDialogueListening && input.value.trim()) {
          voiceSilenceTimer = setTimeout(() => {
            voiceSilenceTimer = null;
            if (isRecording) stopRecording();
          }, 2000);
        }
      }
      if (msg.interim) {
        input.placeholder = msg.interim + '...';
        // Reset silence timer while user is still speaking
        if (voiceSilenceTimer) {
          clearTimeout(voiceSilenceTimer);
          voiceSilenceTimer = null;
        }
      }
    }
    if (msg.type === 'voice-started') {
      console.log('[Voice] Recognition started in offscreen');
    }
    if (msg.type === 'voice-ended') {
      if (isRecording && spaceHeld) {
        // Manual PTT: restart while held
        const lang = document.getElementById('targetLanguage').value;
        chrome.runtime.sendMessage({
          type: 'inject-voice-recognition',
          tabId: activeTabId,
          lang: bcp47Map[lang] || 'cs-CZ'
        });
      } else if (isRecording && voiceDialogueListening) {
        // Voice dialogue: recognition ended (silence/timeout)
        const input = document.getElementById('chatInput');
        if (input.value.trim()) {
          // Has text — if no silence timer running, send after short pause
          if (!voiceSilenceTimer) {
            voiceSilenceTimer = setTimeout(() => {
              voiceSilenceTimer = null;
              if (isRecording) stopRecording();
            }, 1500);
          }
          // else: timer already ticking from voice-result, let it finish
        } else {
          // No text yet — restart listening (keep waiting for user to speak)
          const lang = document.getElementById('targetLanguage').value;
          chrome.runtime.sendMessage({
            type: 'inject-voice-recognition',
            tabId: activeTabId,
            lang: bcp47Map[lang] || 'cs-CZ'
          });
        }
      } else if (isRecording) {
        stopRecording();
      }
    }
    if (msg.type === 'voice-error') {
      console.warn('[Voice] Error from offscreen:', msg.error);
      if (msg.error === 'not-allowed') {
        document.getElementById('chatInput').placeholder = t('micDeniedFull');
      }
      voiceDialogueListening = false;
      stopRecording();
    }
  });
}

async function startRecording() {
  if (isRecording || !activeTabId) return;
  isRecording = true;
  // Barge-in: cancel TTS when user starts speaking
  if (ttsEnabled) {
    window.speechSynthesis.cancel();
    document.getElementById('btnTts').classList.remove('speaking');
  }
  document.getElementById('btnVoice').classList.add('recording');
  document.getElementById('chatInput').placeholder = t('recording');

  // Inject SpeechRecognition into the active tab (web pages have full mic access)
  const lang = document.getElementById('targetLanguage').value;
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'inject-voice-recognition',
      tabId: activeTabId,
      lang: bcp47Map[lang] || 'cs-CZ'
    });
    if (!result?.ok) {
      console.warn('[Voice] Injection failed:', result?.error);
      isRecording = false;
      document.getElementById('btnVoice').classList.remove('recording');
      document.getElementById('chatInput').placeholder = t('micDeniedFull');
      return;
    }
  } catch (e) {
    console.warn('[Voice] Injection error:', e);
    isRecording = false;
    document.getElementById('btnVoice').classList.remove('recording');
    return;
  }

  if (!isRecording) return;

  // Try to get local mic for visualizer (best-effort)
  try {
    if (!micStream || !micStream.active) {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    startVisualizer();
  } catch (e) {
    // Visualizer won't work but voice recognition still runs in the tab
    console.log('[Voice] Visualizer mic unavailable (non-fatal)');
  }
}

function stopRecording(cancelDialogue = false) {
  if (!isRecording) return;
  isRecording = false;

  if (voiceSilenceTimer) {
    clearTimeout(voiceSilenceTimer);
    voiceSilenceTimer = null;
  }
  if (cancelDialogue) {
    voiceDialogueListening = false;
  }

  document.getElementById('btnVoice').classList.remove('recording');
  document.getElementById('chatInput').placeholder = t('chatPlaceholder');

  // Stop recognition in the active tab
  if (activeTabId) {
    chrome.runtime.sendMessage({ type: 'stop-voice-recognition', tabId: activeTabId });
  }
  stopVisualizer();

  // Auto-send if there's text
  const input = document.getElementById('chatInput');
  if (input.value.trim()) {
    sendChatMessage();
  } else {
    // No text and dialogue mode — stop the loop
    voiceDialogueListening = false;
  }
}

// ── Audio Visualizer ────────────────────────────────────

function startVisualizer() {
  if (!micStream) return;

  recordingStart = Date.now();
  document.getElementById('voiceViz').classList.add('active');

  // Set up Web Audio analyser
  if (!audioContext) audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.7;

  const source = audioContext.createMediaStreamSource(micStream);
  source.connect(analyser);

  const canvas = document.getElementById('voiceCanvas');
  const ctx = canvas.getContext('2d');

  function draw() {
    if (!isRecording) return;
    vizAnimFrame = requestAnimationFrame(draw);

    // Update timer
    const elapsed = Math.floor((Date.now() - recordingStart) / 1000);
    document.getElementById('voiceTime').textContent = elapsed + 's';

    // Get frequency data
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.clearRect(0, 0, w, h);

    // Draw waveform bars
    const barCount = 40;
    const barWidth = (w / barCount) * 0.6;
    const gap = (w / barCount) * 0.4;
    const step = Math.floor(bufferLength / barCount);

    for (let i = 0; i < barCount; i++) {
      // Average a range of frequencies for each bar
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += dataArray[i * step + j] || 0;
      }
      const val = sum / step / 255;
      const barH = Math.max(2, val * h * 0.9);

      // Color gradient from blue to red based on intensity
      const r = Math.floor(52 + val * 179);
      const g = Math.floor(152 - val * 100);
      const b = Math.floor(219 - val * 160);

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.roundRect(
        i * (barWidth + gap) + gap / 2,
        (h - barH) / 2,
        barWidth,
        barH,
        barWidth / 2
      );
      ctx.fill();
    }
  }

  draw();
}

function stopVisualizer() {
  document.getElementById('voiceViz').classList.remove('active');
  if (vizAnimFrame) {
    cancelAnimationFrame(vizAnimFrame);
    vizAnimFrame = null;
  }
  if (analyser) {
    analyser.disconnect();
    analyser = null;
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

    // AI backend
    if (s.aiBackend) {
      document.getElementById('aiBackend').value = s.aiBackend;
      aiBackend = s.aiBackend;
      updateAiBackendUI(s.aiBackend);
    }
    if (s.ollamaUrl) {
      document.getElementById('ollamaUrl').value = s.ollamaUrl;
      ollamaUrl = s.ollamaUrl;
    }
    if (s.ollamaModel) ollamaModel = s.ollamaModel;

    // Apply UI language
    applyLanguage(s.targetLanguage);

    // Auto-load Ollama models if backend is ollama
    if (aiBackend === 'ollama') refreshOllamaModels();
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
    aiBackend: document.getElementById('aiBackend').value,
    ollamaUrl: document.getElementById('ollamaUrl').value,
    ollamaModel: document.getElementById('ollamaModel').value,
  };
  geminiApiKey = s.geminiApiKey;
  aiBackend = s.aiBackend;
  ollamaUrl = s.ollamaUrl;
  ollamaModel = s.ollamaModel;
  chrome.storage.local.set({ popupSettings: s });
  applyLanguage(s.targetLanguage);
}

function bindSettingsEvents() {
  const autoSave = () => saveSettings();
  const ids = ['targetLanguage', 'translatorEngine', 'anthropicApiKey', 'deeplApiKey',
    'geminiApiKey', 'ttsVolume', 'ttsRate', 'originalVolume', 'muteOriginal',
    'ttsEngine', 'azureTtsKey', 'azureTtsRegion', 'azureTtsVoice',
    'aiBackend', 'ollamaUrl', 'ollamaModel'];
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

  // AI backend toggle
  document.getElementById('aiBackend').addEventListener('change', (e) => {
    updateAiBackendUI(e.target.value);
    if (e.target.value === 'ollama') refreshOllamaModels();
    autoSave();
  });

  // Ollama refresh button
  document.getElementById('btnOllamaRefresh').addEventListener('click', () => refreshOllamaModels());
}

// ── Ollama / AI Backend ─────────────────────────────────

function updateAiBackendUI(backend) {
  document.getElementById('geminiKeyGroup').style.display = backend === 'gemini' ? 'block' : 'none';
  document.getElementById('ollamaGroup').style.display = backend === 'ollama' ? 'block' : 'none';
}

async function refreshOllamaModels() {
  const select = document.getElementById('ollamaModel');
  const status = document.getElementById('ollamaStatus');
  const url = document.getElementById('ollamaUrl').value || 'http://localhost:11434';

  select.textContent = '';
  const loading = document.createElement('option');
  loading.value = '';
  loading.textContent = 'Načítám...';
  select.appendChild(loading);
  status.textContent = 'Ollama: připojuji...';

  try {
    // Request permission for localhost if needed
    try {
      await chrome.permissions.request({ origins: [`${url}/*`] });
    } catch (e) { /* optional permission may already be granted */ }

    const response = await chrome.runtime.sendMessage({
      type: 'ollama-list-models',
      baseUrl: url
    });

    select.textContent = '';

    if (response?.success && response.models?.length) {
      for (const m of response.models) {
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = `${m.name} (${m.size}, ${m.quant})`;
        select.appendChild(opt);
      }
      // Restore saved selection
      if (ollamaModel) select.value = ollamaModel;
      if (!select.value && response.models.length) {
        select.value = response.models[0].name;
        ollamaModel = select.value;
      }
      status.textContent = `Ollama: ${response.models.length} modelů dostupných`;
      status.style.color = '#27ae60';
    } else {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Žádné modely';
      select.appendChild(empty);
      status.textContent = 'Ollama: žádné modely (ollama pull gemma4)';
      status.style.color = '#e67e22';
    }
  } catch (e) {
    select.textContent = '';
    const err = document.createElement('option');
    err.value = '';
    err.textContent = 'Ollama nedostupná';
    select.appendChild(err);
    status.textContent = 'Ollama: nedostupná — spusťte Ollama aplikaci';
    status.style.color = '#e74c3c';
  }
}

// ── Helpers ──────────────────────────────────────────────

function setSvgIcon(container, href) {
  container.textContent = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', href);
  svg.appendChild(use);
  container.appendChild(svg);
}

async function sendToTab(msg) {
  if (!activeTabId) return null;
  try {
    return await chrome.tabs.sendMessage(activeTabId, msg);
  } catch (e) {
    console.warn('[SidePanel] sendToTab failed:', e);
    return null;
  }
}

// ── Token Bar ───────────────────────────────────────────

function updateTokenBar() {
  const bar = document.getElementById('tokenBar');
  const info = document.getElementById('tokenInfo');
  const costEl = document.getElementById('tokenCost');

  bar.classList.add('visible');

  const total = sessionUsage.input + sessionUsage.output;
  if (total > 1000) {
    info.textContent = (total / 1000).toFixed(1) + 'k tokenů';
  } else {
    info.textContent = total + ' tokenů';
  }

  if (sessionUsage.cost < 0.001) {
    costEl.textContent = 'Free tier';
    costEl.classList.remove('paid');
  } else {
    costEl.textContent = '$' + sessionUsage.cost.toFixed(4);
    costEl.classList.add('paid');
  }
}

function fmtTokens(n) {
  if (n > 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n > 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

async function refreshUsageStats() {
  // Session row
  document.getElementById('usageSessTokens').textContent = fmtTokens(sessionUsage.input + sessionUsage.output);
  document.getElementById('usageSessCost').textContent = sessionUsage.cost < 0.001 ? 'free' : '$' + sessionUsage.cost.toFixed(4);

  // Persisted stats from background
  try {
    const stats = await chrome.runtime.sendMessage({ type: 'get-usage-stats' });
    if (stats) {
      document.getElementById('usageTodayTokens').textContent = fmtTokens((stats.today?.input || 0) + (stats.today?.output || 0));
      document.getElementById('usageTodayCost').textContent = '$' + (stats.today?.cost || 0).toFixed(4);
      document.getElementById('usageWeekTokens').textContent = fmtTokens((stats.week?.input || 0) + (stats.week?.output || 0));
      document.getElementById('usageWeekCost').textContent = '$' + (stats.week?.cost || 0).toFixed(4);
      document.getElementById('usageMonthTokens').textContent = fmtTokens((stats.month?.input || 0) + (stats.month?.output || 0));
      document.getElementById('usageMonthCost').textContent = '$' + (stats.month?.cost || 0).toFixed(4);
    }
  } catch (e) {
    console.warn('[Usage] Stats load failed:', e);
  }
}

// ── Voice Dialogue (TTS output) ─────────────────────────

function stripMarkdown(md) {
  return md
    .replace(/```[\s\S]*?```/g, '')     // code blocks
    .replace(/`([^`]+)`/g, '$1')         // inline code
    .replace(/#{1,6}\s+/g, '')           // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // bold
    .replace(/\*([^*]+)\*/g, '$1')       // italic
    .replace(/^\s*[-*]\s+/gm, '')        // list items
    .replace(/^\s*\d+\.\s+/gm, '')       // ordered list items
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/\[\d+\]/g, '')               // citation references
    .replace(/\n{2,}/g, '. ')            // paragraph breaks → pause
    .replace(/\n/g, ' ')
    .trim();
}

function speakText(md) {
  const text = stripMarkdown(md);
  if (!text) return;

  window.speechSynthesis.cancel(); // stop any previous

  const utter = new SpeechSynthesisUtterance(text);
  const lang = document.getElementById('targetLanguage').value;
  utter.lang = bcp47Map[lang] || 'cs-CZ';
  utter.rate = parseFloat((parseInt(document.getElementById('ttsRate')?.value || '100') / 100).toFixed(1));
  utter.volume = parseFloat((parseInt(document.getElementById('ttsVolume')?.value || '80') / 100).toFixed(1));

  const btn = document.getElementById('btnTts');
  btn.classList.add('speaking');
  utter.onend = () => {
    btn.classList.remove('speaking');
    // Voice dialogue: auto-listen after TTS finishes (unless paused)
    if (ttsEnabled && !isRecording && !chatPaused) {
      voiceDialogueListening = true;
      startRecording();
    }
  };
  utter.onerror = () => btn.classList.remove('speaking');

  window.speechSynthesis.speak(utter);
}

function bindTtsToggle() {
  const btn = document.getElementById('btnTts');
  btn.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    btn.classList.toggle('active', ttsEnabled);
    btn.title = ttsEnabled ? t('ttsOn') : t('ttsOff');
    if (!ttsEnabled) {
      window.speechSynthesis.cancel();
      btn.classList.remove('speaking');
      voiceDialogueListening = false;
      if (isRecording) stopRecording(true);
    }
  });
}

// ── Chat Actions (pause, export, notes, share, copy) ────

function bindChatActions() {
  // Pause
  document.getElementById('btnPause').addEventListener('click', () => {
    chatPaused = !chatPaused;
    const btn = document.getElementById('btnPause');
    btn.classList.toggle('active', chatPaused);
    document.getElementById('pausedBanner').classList.toggle('visible', chatPaused);
    if (chatPaused) {
      // Stop voice dialogue loop
      window.speechSynthesis.cancel();
      document.getElementById('btnTts').classList.remove('speaking');
      voiceDialogueListening = false;
      if (isRecording) stopRecording(true);
    }
  });

  // Copy conversation to clipboard
  document.getElementById('btnCopy').addEventListener('click', () => {
    const md = exportConversationMarkdown();
    navigator.clipboard.writeText(md).then(() => {
      flashBtn('btnCopy');
    });
  });

  // Export as .md file download
  document.getElementById('btnExport').addEventListener('click', () => {
    const md = exportConversationMarkdown();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const title = (pageContext?.title || 'chat').replace(/[^a-zA-Z0-9áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ ]/g, '').trim().substring(0, 50);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title} - AI Chat.md`;
    a.click();
    URL.revokeObjectURL(url);
    flashBtn('btnExport');
  });

  // Save to Notes — copy to clipboard + open Notes app via applenotes: scheme
  document.getElementById('btnNotes').addEventListener('click', () => {
    const md = exportConversationMarkdown();
    navigator.clipboard.writeText(md).then(() => {
      // Try to open Apple Notes via URL scheme (works on macOS)
      const noteUrl = 'applenotes://';
      chrome.tabs.create({ url: noteUrl }).catch(() => {});
      flashBtn('btnNotes');
      showToast(t('copiedToClipboard') + ' — ' + t('pasteInNotes'));
    });
  });

  // Share via Web Share API
  document.getElementById('btnShare').addEventListener('click', async () => {
    const md = exportConversationMarkdown();
    const title = pageContext?.title || 'AI Chat';
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${title} - AI Chat`,
          text: md
        });
      } catch (e) {
        if (e.name !== 'AbortError') {
          // Fallback: copy to clipboard
          navigator.clipboard.writeText(md);
          flashBtn('btnShare');
        }
      }
    } else {
      // Fallback: copy
      navigator.clipboard.writeText(md);
      flashBtn('btnShare');
      showToast(t('copiedToClipboard'));
    }
  });
}

function exportConversationMarkdown() {
  const title = pageContext?.title || 'Konverzace';
  const url = pageContext?.url || '';
  const lines = [`# ${title}`, ''];
  if (url) lines.push(`> Zdroj: ${url}`, '');
  lines.push(`> ${new Date().toLocaleString()}`, '');

  const msgs = document.querySelectorAll('#chatMessages .chat-msg');
  for (const msg of msgs) {
    const isUser = msg.classList.contains('user');
    const bubble = msg.querySelector('.chat-bubble');
    if (!bubble) continue;
    const text = bubble.textContent.trim();
    if (isUser) {
      lines.push(`**Já:** ${text}`, '');
    } else {
      lines.push(`**AI:** ${text}`, '');
    }
  }

  // Token stats
  if (sessionUsage.requests > 0) {
    lines.push('---', '');
    lines.push(`*${sessionUsage.requests} dotazů, ${fmtTokens(sessionUsage.input + sessionUsage.output)} tokenů, ${sessionUsage.cost < 0.001 ? 'free tier' : '$' + sessionUsage.cost.toFixed(4)}*`);
  }

  return lines.join('\n');
}

function flashBtn(id) {
  const btn = document.getElementById(id);
  btn.classList.add('flash');
  setTimeout(() => btn.classList.remove('flash'), 1000);
}

function showToast(text) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:#27ae60;color:white;padding:6px 16px;border-radius:16px;font-size:12px;z-index:9999;opacity:0;transition:opacity 0.3s;';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}
