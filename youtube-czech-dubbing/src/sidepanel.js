/**
 * Side Panel — Dubbing controls + Gemini AI Chat.
 * Communicates with content scripts via chrome.tabs.sendMessage
 * and with background.js for API calls.
 */

let activeTabId = null;
let pageContext = null; // { title, paragraphs, summary, meta, audioElements, isYouTube }
let chatHistory = []; // [{role: 'user'|'model', parts: [{text}]}]
let geminiApiKey = null;
let currentLang = 'cs';

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

  if (!geminiApiKey) {
    appendChatMessage('bot', t('noApiKey'), true);
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

/** Render **bold**, *italic*, `code` as safe DOM nodes */
function appendInlineFmt(el, text) {
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) { // eslint-disable-line
    if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[2]) { const s = document.createElement('strong'); s.textContent = m[2]; el.appendChild(s); }
    else if (m[3]) { const s = document.createElement('em'); s.textContent = m[3]; el.appendChild(s); }
    else if (m[4]) { const s = document.createElement('code'); s.textContent = m[4]; el.appendChild(s); }
    last = m.index + m[0].length;
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
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
      }
      if (msg.interim) {
        input.placeholder = msg.interim + '...';
      }
    }
    if (msg.type === 'voice-started') {
      console.log('[Voice] Recognition started in offscreen');
    }
    if (msg.type === 'voice-ended') {
      // Offscreen recognition ended (e.g. silence timeout) — restart if still held
      if (isRecording && spaceHeld) {
        const lang = document.getElementById('targetLanguage').value;
        chrome.runtime.sendMessage({
          type: 'offscreen-start-recognition',
          lang: bcp47Map[lang] || 'cs-CZ'
        });
      } else if (isRecording) {
        stopRecording();
      }
    }
    if (msg.type === 'voice-error') {
      console.warn('[Voice] Error from offscreen:', msg.error);
      if (msg.error === 'not-allowed') {
        document.getElementById('chatInput').placeholder = t('micDeniedFull');
      }
      stopRecording();
    }
  });
}

async function startRecording() {
  if (isRecording || !activeTabId) return;
  isRecording = true;
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

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

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

    // Apply UI language
    applyLanguage(s.targetLanguage);
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
  applyLanguage(s.targetLanguage);
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
