/**
 * sidepanel-news.js
 * 
 * News Feed logic for the extension sidepanel.
 * Handles topic selection, feed display, and article playback integration.
 */

class NewsFeedManager {
  constructor() {
    this.api = new PodcastNewsClient();
    this.rss = (typeof RssFetcher !== 'undefined') ? new RssFetcher() : null;
    this.clientTopics = (typeof NEWS_FEED_TOPICS !== 'undefined') ? NEWS_FEED_TOPICS : [];
    this.userId = null;
    this.topics = [];
    this.backendAvailable = false;
    this.selectedTopicIds = [];
    this.articles = [];
    this.topicArticleCounts = new Map();
    this.currentArticlePlayer = null;
    this._targetLanguage = DEFAULT_LANGUAGE;
  }

  async init() {
    console.log('[NewsFeed] ========== INITIALIZING NEWS FEED ==========');
    console.log('[NewsFeed] API Base URL:', this.api.baseUrl);
    console.log('[NewsFeed] Client-side catalog topics:', this.clientTopics.length);

    await this.loadTargetLanguage();
    await this.loadUser();
    await this.loadTopics();
    await this.loadPreferences();
    this.bindEvents();

    console.log('[NewsFeed] Initialized successfully (backend:', this.backendAvailable, ')');
  }

  /**
   * Load user from storage or create new user. If the backend is unreachable
   * we proceed without a userId — the feed then runs purely on RSS fallbacks.
   */
  async loadUser() {
    try {
      const result = await chrome.storage.local.get('newsUserId');
      if (result.newsUserId) {
        try {
          const user = await this.api.getUser(result.newsUserId);
          this.userId = user.id;
          console.log('[NewsFeed] Loaded user:', this.userId);
          return;
        } catch (error) {
          if (!/404/.test(error.message || '')) throw error;
          console.warn('[NewsFeed] Stored news user is invalid, creating a new one:', error.message);
          await chrome.storage.local.remove('newsUserId');
        }
      }

      const username = 'user_' + Math.random().toString(36).slice(2, 11);
      const user = await this.api.createUser(username);
      this.userId = user.id;
      await chrome.storage.local.set({ newsUserId: this.userId });
      console.log('[NewsFeed] Created new user:', this.userId);
    } catch (error) {
      console.warn('[NewsFeed] Backend user unavailable, will run RSS-only:', error.message);
      this.userId = null;
    }
  }

  /**
   * Load topics. Backend is preferred (it carries summarised, translated
   * articles); when it's down or empty we fall back to the client-side
   * catalog so the user still sees a populated topic list.
   */
  async loadTopics() {
    let backendTopics = [];
    try {
      backendTopics = await this.api.getTopics();
      this.backendAvailable = Array.isArray(backendTopics);
    } catch (error) {
      console.warn('[NewsFeed] Backend topics unavailable, using client catalog:', error.message);
      this.backendAvailable = false;
    }

    const merged = this._mergeTopicLists(backendTopics, this.clientTopics);
    this.topics = merged;
    this.renderTopics();
    console.log('[NewsFeed] Topics loaded — backend:', backendTopics.length, '| client:', this.clientTopics.length, '| merged:', merged.length);
  }

  /**
   * Backend topics win on overlapping slugs (their IDs are positive and tied
   * to backend articles). Client topics fill the gaps.
   */
  _mergeTopicLists(backendTopics, clientTopics) {
    const bySlug = new Map();
    for (const t of (backendTopics || [])) {
      if (!t || !t.slug) continue;
      bySlug.set(t.slug, { ...t });
    }
    for (const t of (clientTopics || [])) {
      if (!bySlug.has(t.slug)) {
        bySlug.set(t.slug, { ...t });
      } else {
        // Attach client sources so RSS fallback works even when backend serves the topic.
        const merged = bySlug.get(t.slug);
        merged.sources = merged.sources || t.sources;
      }
    }
    return Array.from(bySlug.values());
  }

  /**
   * Resolve sources for a given topic id by checking the merged catalog.
   */
  _sourcesForTopic(topicId) {
    const topic = this.topics.find(t => t.id === topicId);
    if (topic && Array.isArray(topic.sources) && topic.sources.length) {
      return { topic, sources: topic.sources };
    }
    // Fallback: match by slug across the client catalog (backend topic without sources).
    if (topic) {
      const clientMatch = this.clientTopics.find(t => t.slug === topic.slug);
      if (clientMatch) {
        return { topic: { ...topic, sources: clientMatch.sources }, sources: clientMatch.sources };
      }
    }
    return { topic: null, sources: [] };
  }

  /**
   * Load user preferences from storage
   */
  async loadPreferences() {
    try {
      let preferencesNeedSync = false;
      const result = await chrome.storage.local.get('newsSelectedTopics');
      const hasStoredPreferences = Array.isArray(result.newsSelectedTopics);
      if (hasStoredPreferences) {
        this.selectedTopicIds = result.newsSelectedTopics;
      } else {
        // Default: AI-adjacent + world news so the user sees content immediately.
        const defaults = ['claude', 'ai', 'llm', 'tech', 'world'];
        this.selectedTopicIds = this.topics
          .filter(t => defaults.includes(t.slug))
          .map(t => t.id);
        preferencesNeedSync = true;
      }
      
      // Update checkboxes
      this.updateTopicCheckboxes();

      // Always sync stored topics back to backend user before loading feed.
      if (preferencesNeedSync || hasStoredPreferences) {
        await this.savePreferences();
      }
      
      // Load feed
      await this.loadFeed();
      
      console.log('[NewsFeed] Loaded preferences:', this.selectedTopicIds);
    } catch (error) {
      console.error('[NewsFeed] Failed to load preferences:', error);
    }
  }

  /**
   * Save preferences to local storage; sync to backend if reachable. We
   * tolerate backend failures so the feed remains usable in RSS-only mode.
   */
  async savePreferences() {
    await chrome.storage.local.set({ newsSelectedTopics: this.selectedTopicIds });
    if (!this.userId) {
      console.log('[NewsFeed] Saved preferences locally (no backend user):', this.selectedTopicIds);
      return;
    }
    try {
      await this.loadTargetLanguage();
      await this.api.updatePreferences(this.userId, this.selectedTopicIds, this._targetLanguage);
      console.log('[NewsFeed] Saved preferences:', this.selectedTopicIds);
    } catch (error) {
      console.warn('[NewsFeed] Backend pref sync failed (kept local):', error.message);
    }
  }

  /**
   * Load feed. Strategy:
   *   1. If backend user exists, ask /api/feed/ for personalised articles.
   *   2. If empty, ask /api/feed/trending/ as a fallback.
   *   3. For every selected topic that still has zero articles, fetch RSS
   *      sources from the client catalog and merge them in.
   *   4. After rendering, mark topics that contributed nothing so the user
   *      can spot dead categories.
   */
  async loadFeed() {
    const feedContainer = document.getElementById('newsFeed');
    if (!feedContainer) return;
    this._setLoadingState(feedContainer, 'Loading feed...');

    let backendArticles = [];
    if (this.userId) {
      try {
        const response = await this.api.getFeed(this.userId, 20);
        backendArticles = response.articles || [];
      } catch (error) {
        console.warn('[NewsFeed] Backend feed failed:', error.message);
        this.backendAvailable = false;
      }
    }

    if (backendArticles.length === 0 && this.selectedTopicIds.length > 0 && this.backendAvailable) {
      try {
        const fallback = await this.api.getTrending(50, 168);
        const fallbackArticles = fallback.articles || [];
        backendArticles = fallbackArticles.filter(article =>
          Array.isArray(article.topics) && article.topics.some(topic => this.selectedTopicIds.includes(topic.id))
        );
        console.log('[NewsFeed] Trending fallback returned:', backendArticles.length, 'articles');
      } catch (error) {
        console.warn('[NewsFeed] Trending fallback failed:', error.message);
      }
    }

    const coveredSlugs = new Set();
    for (const a of backendArticles) {
      for (const t of (a.topics || [])) {
        if (t && t.slug) coveredSlugs.add(t.slug);
      }
    }

    const rssTargets = [];
    for (const topicId of this.selectedTopicIds) {
      const { topic, sources } = this._sourcesForTopic(topicId);
      if (!topic || !sources.length) continue;
      if (coveredSlugs.has(topic.slug)) continue;
      rssTargets.push(topic);
    }

    let rssArticles = [];
    if (rssTargets.length && this.rss) {
      console.log('[NewsFeed] Fetching RSS for', rssTargets.length, 'topic(s):', rssTargets.map(t => t.slug).join(', '));
      try {
        rssArticles = await this.rss.fetchTopics(rssTargets);
        console.log('[NewsFeed] RSS returned', rssArticles.length, 'article(s)');
      } catch (error) {
        console.warn('[NewsFeed] RSS fetch error:', error.message);
      }
    }

    this.articles = this._dedupe([...backendArticles, ...rssArticles]);
    this._recomputeTopicCounts();
    this.renderFeed();
    this._refreshTopicEmptyState();
    console.log('[NewsFeed] Loaded feed: backend', backendArticles.length, '+ RSS', rssArticles.length, '=', this.articles.length, 'articles');
  }

  _setLoadingState(container, message) {
    container.replaceChildren();
    const div = document.createElement('div');
    div.className = 'news-loading';
    div.textContent = message;
    container.appendChild(div);
  }

  _dedupe(articles) {
    const seen = new Map();
    for (const a of articles) {
      if (!a) continue;
      const k = (a.url || '').split('?')[0].replace(/\/$/, '') || `id:${a.id}`;
      if (!seen.has(k)) seen.set(k, a);
    }
    return Array.from(seen.values()).sort((a, b) => {
      const ta = Date.parse(a.published_at) || 0;
      const tb = Date.parse(b.published_at) || 0;
      return tb - ta;
    });
  }

  _recomputeTopicCounts() {
    this.topicArticleCounts.clear();
    for (const article of this.articles) {
      for (const t of (article.topics || [])) {
        if (!t) continue;
        const key = t.slug || t.id;
        if (!key) continue;
        this.topicArticleCounts.set(key, (this.topicArticleCounts.get(key) || 0) + 1);
      }
    }
  }

  _refreshTopicEmptyState() {
    const container = document.getElementById('newsTopics');
    if (!container) return;
    const labels = container.querySelectorAll('.news-topic-checkbox');
    labels.forEach((label) => {
      const cb = label.querySelector('input[type="checkbox"]');
      if (!cb) return;
      const topicId = parseInt(cb.value, 10);
      const topic = this.topics.find(t => t.id === topicId);
      if (!topic) return;
      const count = this.topicArticleCounts.get(topic.slug) || this.topicArticleCounts.get(topic.id) || 0;
      const isSelected = this.selectedTopicIds.includes(topicId);
      label.classList.toggle('news-topic-empty', isSelected && count === 0);
      let badge = label.querySelector('.news-topic-count');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'news-topic-count';
        label.appendChild(badge);
      }
      badge.textContent = count > 0 ? String(count) : '0';
      badge.dataset.empty = String(count === 0);
    });
  }

  /**
   * Render topics as checkboxes
   */
  renderTopics() {
    const container = document.getElementById('newsTopics');
    if (!container) return;
    
    container.innerHTML = '';
    
    for (const topic of this.topics) {
      const label = document.createElement('label');
      label.className = 'news-topic-checkbox';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = topic.id;
      checkbox.checked = this.selectedTopicIds.includes(topic.id);
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          if (!this.selectedTopicIds.includes(topic.id)) {
            this.selectedTopicIds.push(topic.id);
          }
        } else {
          this.selectedTopicIds = this.selectedTopicIds.filter(id => id !== topic.id);
        }
        this.onTopicsChanged();
      });
      
      const icon = document.createElement('span');
      icon.className = 'news-topic-icon';
      icon.textContent = topic.icon;
      
      const name = document.createElement('span');
      name.className = 'news-topic-name';
      name.textContent = topic.name;
      
      label.appendChild(checkbox);
      label.appendChild(icon);
      label.appendChild(name);
      container.appendChild(label);
    }
  }

  /**
   * Update topic checkboxes to match selected state
   */
  updateTopicCheckboxes() {
    const checkboxes = document.querySelectorAll('#newsTopics input[type="checkbox"]');
    checkboxes.forEach(cb => {
      cb.checked = this.selectedTopicIds.includes(parseInt(cb.value));
    });
  }

  /**
   * Render feed articles
   */
  renderFeed() {
    const container = document.getElementById('newsFeed');
    if (!container) return;

    container.replaceChildren();

    if (this.articles.length === 0) {
      const selectedTopics = this.topics
        .filter(topic => this.selectedTopicIds.includes(topic.id))
        .map(topic => topic.name);
      const hint = selectedTopics.length > 0
        ? `Žádné nové články pro ${selectedTopics.join(', ')}`
        : 'Vyberte alespoň jedno téma';

      const wrap = document.createElement('div');
      wrap.className = 'news-empty';

      const icon = document.createElement('div');
      icon.className = 'news-empty-icon';
      icon.textContent = '📰';

      const text = document.createElement('div');
      text.className = 'news-empty-text';
      text.textContent = 'No articles found';

      const hintEl = document.createElement('div');
      hintEl.className = 'news-empty-hint';
      hintEl.textContent = hint;

      wrap.appendChild(icon);
      wrap.appendChild(text);
      wrap.appendChild(hintEl);
      container.appendChild(wrap);
      return;
    }

    for (const article of this.articles) {
      const item = this.createArticleElement(article);
      container.appendChild(item);
    }
  }

  /**
   * Create article element
   */
  createArticleElement(article) {
    const item = document.createElement('div');
    item.className = 'news-article';
    item.dataset.articleId = article.id;
    
    // Title
    const title = document.createElement('div');
    title.className = 'news-article-title';
    title.textContent = article.title;
    
    // Meta (source + date)
    const meta = document.createElement('div');
    meta.className = 'news-article-meta';
    
    const source = document.createElement('span');
    source.className = 'news-article-source';
    source.textContent = article.source;
    
    const date = document.createElement('span');
    date.className = 'news-article-date';
    date.textContent = this.formatDate(article.published_at);
    
    meta.appendChild(source);
    meta.appendChild(document.createTextNode(' • '));
    meta.appendChild(date);
    
    // Summary preview
    const summary = document.createElement('div');
    summary.className = 'news-article-summary';
    summary.textContent = this.getLocalizedSummary(article) || article.description || '';
    
    // Play button
    const playBtn = document.createElement('button');
    playBtn.className = 'news-article-play';
    playBtn.innerHTML = '<svg class="icon"><use href="#ico-play"/></svg> Play';
    playBtn.addEventListener('click', () => this.playArticle(article));
    
    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(summary);
    item.appendChild(playBtn);
    
    return item;
  }

  /**
   * Format date for display
   */
  formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
  }

  /**
   * Play article using ArticlePlayer
   */
  async playArticle(article) {
    console.log('[NewsFeed] Playing article:', article.id, article.title);
    
    try {
      await this.loadTargetLanguage();

      // Check if ArticlePlayer is available
      if (typeof ArticlePlayer === 'undefined') {
        throw new Error('ArticlePlayer class not loaded. Please reload the extension.');
      }
      
      // Stop current playback if any
      if (this.currentArticlePlayer) {
        console.log('[NewsFeed] Destroying existing player...');
        this.currentArticlePlayer.destroy();
        this.currentArticlePlayer = null;
      }
      
      // Fetch full article data if needed
      let fullArticle = article;
      if (!article.content && !article.content_html && !article.content_en) {
        console.log('[NewsFeed] Fetching full article...');
        fullArticle = await this.api.getArticle(article.id);
      }
      
      console.log('[NewsFeed] Full article data:', fullArticle);
      
      // Transform backend article format to ArticlePlayer format
      const articleData = this.transformArticleData(fullArticle);
      console.log('[NewsFeed] Transformed article data:', articleData);
      
      // Reuse the same translation and speech engines as the main dubbing flow.
      console.log('[NewsFeed] Creating translator, TTS, and lang config...');
      const translator = await this.createTranslator();
      const tts = await this.createTTS();
      const langConfig = this.createLangConfig();
      
      // Create and initialize ArticlePlayer
      console.log('[NewsFeed] Creating ArticlePlayer instance...');
      this.currentArticlePlayer = new ArticlePlayer();
      
      console.log('[NewsFeed] Initializing ArticlePlayer...');
      await this.currentArticlePlayer.init(articleData, translator, tts, langConfig);
      
      // Start playback
      console.log('[NewsFeed] Starting playback...');
      this.currentArticlePlayer.play();
      
      console.log('[NewsFeed] Playback started successfully');
      
    } catch (error) {
      console.error('[NewsFeed] Failed to play article:', error);
      this.showError('Failed to play article: ' + error.message);
    }
  }

  /**
   * Transform backend article data to ArticlePlayer format
   */
  transformArticleData(article) {
    const localizedSummary = this.getLocalizedSummary(article);
    const sourceSummary = article.summary_en || article.summary || article.description || localizedSummary;
    const content = article.content_html || article.content || article.content_en || '';

    // Parse content into paragraphs
    const paragraphs = [];
    
    // Add title as heading
    if (article.title) {
      paragraphs.push({
        text: article.title,
        type: 'heading',
        element: null
      });
    }
    
    // Add summary if available
    if (sourceSummary) {
      paragraphs.push({
        text: sourceSummary,
        type: 'summary-text',
        element: null
      });
    }
    
    // Parse content HTML or plain text
    if (article.content_html) {
      // Parse HTML content into paragraphs
      const parser = new DOMParser();
      const doc = parser.parseFromString(article.content_html, 'text/html');
      
      // Extract text from paragraphs, headings, etc.
      const elements = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, li');
      for (const el of elements) {
        const text = el.textContent.trim();
        if (text.length > 20) {
          paragraphs.push({
            text: text,
            type: el.tagName.toLowerCase().startsWith('h') ? 'heading' : 'paragraph',
            element: null
          });
        }
      }
    } else if (content) {
      // Split plain text content into paragraphs
      const lines = content.split('\n').filter(l => l.trim().length > 20);
      for (const line of lines) {
        paragraphs.push({
          text: line.trim(),
          type: 'paragraph',
          element: null
        });
      }
    }
    
    // If we have TTS audio URL from backend, we could use it
    // For now, we'll use Web Speech API via the TTS engine
    
    return {
      title: article.title,
      url: article.url,
      paragraphs: paragraphs,
      summary: {
        sections: sourceSummary ? [{
          title: 'Summary',
          text: sourceSummary,
          source: 'backend'
        }] : [],
        hasAISummary: !!sourceSummary
      },
      meta: {
        description: localizedSummary || article.description || sourceSummary,
        author: article.source,
        publishedAt: article.published_at
      },
      audioElements: []
    };
  }

  /**
   * Handle topic selection change
   */
  async onTopicsChanged() {
    await this.savePreferences();
    await this.loadFeed();
  }

  /**
   * Bind UI events. The refresh button performs a hard refresh: it busts the
   * RSS cache, re-pulls topics (so newly-published backend topics appear),
   * and re-renders the feed.
   */
  bindEvents() {
    const refreshBtn = document.getElementById('newsRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }
  }

  async refresh() {
    const btn = document.getElementById('newsRefreshBtn');
    if (btn) btn.classList.add('refreshing');
    try {
      if (this.rss) this.rss.invalidateAll();
      this.articles = [];
      this.topicArticleCounts.clear();
      await this.loadTopics();
      this.updateTopicCheckboxes();
      await this.loadFeed();
    } catch (error) {
      console.error('[NewsFeed] Refresh failed:', error);
      this.showError('Refresh failed: ' + error.message);
    } finally {
      if (btn) btn.classList.remove('refreshing');
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    const feedContainer = document.getElementById('newsFeed');
    if (!feedContainer) return;
    feedContainer.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'news-error';
    const icon = document.createElement('div');
    icon.className = 'news-error-icon';
    icon.textContent = '⚠️';
    const text = document.createElement('div');
    text.className = 'news-error-text';
    text.textContent = message;
    wrap.appendChild(icon);
    wrap.appendChild(text);
    feedContainer.appendChild(wrap);
  }

  /**
   * Create translator instance (uses background script for API calls)
   */
  async createTranslator() {
    if (typeof Translator === 'undefined') {
      throw new Error('Translator class not loaded');
    }

    const translator = new Translator();
    await translator.loadSettings();
    translator._targetLang = this._targetLanguage;
    translator._langConfig = getLanguageConfig(this._targetLanguage);
    return translator;
  }

  /**
   * Create TTS instance using the shared extension TTS engine
   */
  async createTTS() {
    if (typeof TTSEngine === 'undefined') {
      throw new Error('TTSEngine class not loaded');
    }

    const tts = new TTSEngine();
    await tts._loadTTSSettings();
    tts.setTargetLanguage(this._targetLanguage);
    await tts.waitForVoice();
    return tts;
  }

  /**
   * Create language config
   */
  createLangConfig() {
    const langConfig = getLanguageConfig(this._targetLanguage);
    return {
      flag: langConfig.flag,
      bcp47: langConfig.bcp47,
      uiStrings: {
        translating: langConfig.uiStrings?.translating || 'Překládám',
        active: langConfig.uiStrings?.active || 'Dabing aktivní'
      }
    };
  }

  /**
   * Load current target language from shared popup settings.
   */
  async loadTargetLanguage() {
    try {
      const { popupSettings } = await chrome.storage.local.get('popupSettings');
      this._targetLanguage = popupSettings?.targetLanguage || DEFAULT_LANGUAGE;
    } catch (error) {
      console.warn('[NewsFeed] Failed to load target language, using default:', error);
      this._targetLanguage = DEFAULT_LANGUAGE;
    }
    return this._targetLanguage;
  }

  /**
   * Pick the best summary field for the active target language.
   */
  getLocalizedSummary(article) {
    if (!article) return '';
    if (this._targetLanguage === 'cs') {
      return article.summary_cs || article.summary_en || article.summary || '';
    }
    return article.summary_en || article.summary_cs || article.summary || '';
  }

  /**
   * Get flag emoji for language code
   */
  getFlagForLang(lang) {
    const flags = {
      cs: '🇨🇿', sk: '🇸🇰', pl: '🇵🇱', hu: '🇭🇺',
      en: '🇬🇧', de: '🇩🇪', fr: '🇫🇷', es: '🇪🇸'
    };
    return flags[lang] || '🌍';
  }

  /**
   * Get BCP-47 code for language
   */
  getBcp47ForLang(lang) {
    const map = {
      cs: 'cs-CZ', sk: 'sk-SK', pl: 'pl-PL', hu: 'hu-HU',
      en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES'
    };
    return map[lang] || 'cs-CZ';
  }
}

// Initialize when DOM is ready
let newsFeedManager = null;

function initNewsFeed() {
  console.log('[NewsFeed] initNewsFeed() called!');
  
  if (!newsFeedManager) {
    console.log('[NewsFeed] Creating new NewsFeedManager...');
    newsFeedManager = new NewsFeedManager();
    newsFeedManager.init().catch(error => {
      console.error('[NewsFeed] Initialization failed:', error);
    });
  } else {
    console.log('[NewsFeed] Manager already exists, skipping init');
  }
}

// Export for use in sidepanel.html
window.NewsFeedManager = NewsFeedManager;
window.initNewsFeed = initNewsFeed;
