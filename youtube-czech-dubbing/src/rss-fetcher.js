/**
 * rss-fetcher.js
 *
 * Lightweight RSS / Atom feed fetcher used as fallback when the news backend
 * is unavailable. Parses XML via DOMParser (no external deps), normalises
 * RSS 2.0 and Atom 1.0 entries into the same article shape consumed by
 * sidepanel-news.js.
 *
 * The fetcher caches successful responses for FETCH_TTL_MS to avoid hammering
 * publishers when the user toggles topics rapidly. Failed fetches are negative-
 * cached for FAIL_TTL_MS so we don't retry obvious dead sources every reload.
 */

class RssFetcher {
  constructor() {
    this._cache = new Map();
    this._failCache = new Map();
    this.FETCH_TTL_MS = 5 * 60 * 1000;   // 5 min positive cache
    this.FAIL_TTL_MS  = 2 * 60 * 1000;   // 2 min negative cache
    this.PER_SOURCE_LIMIT = 10;
    this.FETCH_TIMEOUT_MS = 8000;
  }

  invalidateAll() {
    this._cache.clear();
    this._failCache.clear();
  }

  async fetchSource(source, topicMeta = {}) {
    const cacheKey = source.url;
    const cached = this._cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < this.FETCH_TTL_MS) {
      return cached.articles.map(a => ({ ...a, topics: this._mergeTopics(a.topics, topicMeta) }));
    }
    const failed = this._failCache.get(cacheKey);
    if (failed && (Date.now() - failed.ts) < this.FAIL_TTL_MS) {
      return [];
    }

    try {
      const xml = await this._fetchXml(source.url);
      const articles = this._parseXml(xml, source, topicMeta);
      this._cache.set(cacheKey, { ts: Date.now(), articles });
      this._failCache.delete(cacheKey);
      return articles;
    } catch (error) {
      console.warn('[RssFetcher] failed', source.url, error.message);
      this._failCache.set(cacheKey, { ts: Date.now(), error: error.message });
      return [];
    }
  }

  async fetchSources(sources, topicMeta = {}) {
    const results = await Promise.all(sources.map(s => this.fetchSource(s, topicMeta)));
    return results.flat();
  }

  async fetchTopics(topics) {
    const tasks = [];
    for (const topic of topics) {
      const meta = {
        topicSlug: topic.slug,
        topicId: topic.id,
        topicName: topic.name,
        topicIcon: topic.icon
      };
      for (const src of (topic.sources || [])) {
        tasks.push(this.fetchSource(src, meta));
      }
    }
    const lists = await Promise.all(tasks);
    return this._dedupe(lists.flat());
  }

  // ───────────────────────── internals ─────────────────────────

  async _fetchXml(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        credentials: 'omit',
        headers: { 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  _parseXml(xmlText, source, topicMeta) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const parseErr = doc.querySelector('parsererror');
    if (parseErr) throw new Error('XML parse error');

    if (doc.documentElement.tagName.toLowerCase() === 'feed') {
      return this._parseAtom(doc, source, topicMeta);
    }
    return this._parseRss(doc, source, topicMeta);
  }

  _parseRss(doc, source, topicMeta) {
    const items = Array.from(doc.querySelectorAll('item')).slice(0, this.PER_SOURCE_LIMIT);
    return items.map((item, idx) => {
      const title = this._textOf(item, 'title');
      const link = this._textOf(item, 'link') || this._textOf(item, 'guid');
      const pubDate = this._textOf(item, 'pubDate') || this._textOf(item, 'date') || this._textOfNs(item, 'dc:date');
      const description = this._textOf(item, 'description') || '';
      const contentEncoded = this._textOfNs(item, 'content:encoded');
      const author = this._textOf(item, 'author') || this._textOfNs(item, 'dc:creator') || source.name;
      return this._buildArticle({
        title, link, pubDate, description, contentEncoded, author,
        source, topicMeta, idx
      });
    }).filter(Boolean);
  }

  _parseAtom(doc, source, topicMeta) {
    const entries = Array.from(doc.querySelectorAll('entry')).slice(0, this.PER_SOURCE_LIMIT);
    return entries.map((entry, idx) => {
      const title = this._textOf(entry, 'title');
      const linkEl = entry.querySelector('link[rel="alternate"]') || entry.querySelector('link');
      const link = linkEl ? (linkEl.getAttribute('href') || linkEl.textContent) : '';
      const pubDate = this._textOf(entry, 'updated') || this._textOf(entry, 'published');
      const summary = this._textOf(entry, 'summary') || '';
      const content = this._textOf(entry, 'content') || '';
      const author = entry.querySelector('author > name')?.textContent?.trim() || source.name;
      return this._buildArticle({
        title, link, pubDate,
        description: summary,
        contentEncoded: content,
        author,
        source, topicMeta, idx
      });
    }).filter(Boolean);
  }

  _buildArticle({ title, link, pubDate, description, contentEncoded, author, source, topicMeta }) {
    if (!title || !link) return null;
    const stripped = this._stripHtml(description) || this._stripHtml(contentEncoded).slice(0, 500);
    const id = this._stableId(link);
    const topics = topicMeta.topicSlug ? [{
      id: topicMeta.topicId,
      slug: topicMeta.topicSlug,
      name: topicMeta.topicName,
      icon: topicMeta.topicIcon
    }] : [];
    return {
      id,
      _clientSide: true,
      title: this._cleanTitle(title),
      url: link,
      source: source.name,
      author,
      published_at: this._normalizeDate(pubDate),
      summary: stripped.slice(0, 600),
      summary_en: stripped.slice(0, 600),
      summary_cs: '',
      description: stripped.slice(0, 240),
      content: this._stripHtml(contentEncoded || description || ''),
      content_html: contentEncoded || description || '',
      topics
    };
  }

  _dedupe(articles) {
    const seen = new Map();
    for (const a of articles) {
      const k = (a.url || '').split('?')[0].replace(/\/$/, '');
      if (!seen.has(k)) {
        seen.set(k, a);
      } else {
        const existing = seen.get(k);
        existing.topics = this._mergeTopics(existing.topics, ...a.topics);
      }
    }
    return Array.from(seen.values()).sort((a, b) => {
      const ta = Date.parse(a.published_at) || 0;
      const tb = Date.parse(b.published_at) || 0;
      return tb - ta;
    });
  }

  _mergeTopics(existing = [], ...incoming) {
    const out = Array.isArray(existing) ? [...existing] : [];
    const flat = incoming.flat ? incoming.flat() : [].concat(...incoming);
    for (const t of flat) {
      if (!t || !t.slug) continue;
      if (!out.find(x => x.slug === t.slug)) out.push(t);
    }
    return out;
  }

  _textOf(el, tag) {
    const child = el.getElementsByTagName(tag)[0];
    return child ? (child.textContent || '').trim() : '';
  }

  _textOfNs(el, qualifiedName) {
    const [prefix, local] = qualifiedName.split(':');
    const els = el.getElementsByTagName(qualifiedName);
    if (els && els.length) return (els[0].textContent || '').trim();
    const all = el.getElementsByTagName(local);
    for (const e of all) {
      if (e.prefix === prefix || e.namespaceURI) return (e.textContent || '').trim();
    }
    return '';
  }

  /**
   * Convert RSS HTML snippets to plain text without ever attaching the markup
   * to the live document. We parse with DOMParser into an isolated document
   * and read textContent — no innerHTML write paths, so no XSS vector.
   */
  _stripHtml(html) {
    if (!html) return '';
    try {
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
      return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    } catch {
      return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  _cleanTitle(t) {
    return (t || '').replace(/\s+/g, ' ').trim();
  }

  _normalizeDate(s) {
    if (!s) return new Date().toISOString();
    const d = new Date(s);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  }

  _stableId(url) {
    let h = 0;
    for (let i = 0; i < url.length; i++) {
      h = (h * 31 + url.charCodeAt(i)) | 0;
    }
    return -Math.abs(h) - 1000000;
  }
}

window.RssFetcher = RssFetcher;
