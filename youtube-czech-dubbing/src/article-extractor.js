/**
 * ArticleExtractor — Readability-style DOM parser for blog/news articles.
 * Extracts main article content as structured paragraphs with metadata.
 * Lightweight heuristic approach — no external dependencies.
 */
class ArticleExtractor {
  constructor() {
    this._minParagraphLength = 40;
    this._minArticleLength = 200;
  }

  /**
   * Check if the current page likely contains a readable article.
   * Quick heuristic — checks for article-like DOM structure.
   */
  isArticlePage() {
    const indicators = [
      'article', '[role="article"]', '[itemprop="articleBody"]',
      '.post-content', '.entry-content', '.article-body', '.article-content',
      '.story-body', '.post-body', 'main article', '.blog-post',
      '[data-testid="article-body"]'
    ];
    for (const sel of indicators) {
      if (document.querySelector(sel)) return true;
    }

    // Fallback: check for substantial <p> content
    const paragraphs = document.querySelectorAll('p');
    let longParagraphs = 0;
    for (const p of paragraphs) {
      if (p.textContent.trim().length > 100) longParagraphs++;
      if (longParagraphs >= 3) return true;
    }
    return false;
  }

  /**
   * Extract the main article content from the page.
   * Returns { title, paragraphs: [{text, element}], audioElements: [] }
   */
  extract() {
    const title = this._extractTitle();
    const contentRoot = this._findContentRoot();

    if (!contentRoot) {
      return { title, paragraphs: [], audioElements: [] };
    }

    const paragraphs = this._extractParagraphs(contentRoot);
    const audioElements = this._findAudioElements();

    return { title, paragraphs, audioElements };
  }

  /**
   * Extract the article title.
   */
  _extractTitle() {
    const selectors = [
      'h1[itemprop="headline"]', 'article h1', 'main h1',
      '.post-title', '.entry-title', '.article-title',
      'h1.title', 'header h1', 'h1'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 5) {
        return el.textContent.trim();
      }
    }
    return document.title || '';
  }

  /**
   * Find the main content root element using scoring heuristics.
   */
  _findContentRoot() {
    // Try semantic selectors first
    const selectors = [
      'article [itemprop="articleBody"]', '[itemprop="articleBody"]',
      'article .post-content', 'article .entry-content',
      '.article-body', '.article-content', '.post-content',
      '.entry-content', '.story-body', '.post-body',
      '[data-testid="article-body"]', 'article', 'main article',
      '[role="article"]', 'main'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && this._getTextLength(el) > this._minArticleLength) {
        return el;
      }
    }

    // Scoring fallback: find the div/section with the most <p> text
    const candidates = document.querySelectorAll('div, section');
    let bestEl = null;
    let bestScore = 0;

    for (const el of candidates) {
      const paragraphs = el.querySelectorAll(':scope > p, :scope > div > p');
      if (paragraphs.length < 2) continue;

      let score = 0;
      for (const p of paragraphs) {
        const len = p.textContent.trim().length;
        if (len > this._minParagraphLength) score += len;
      }

      // Penalize elements that are too close to <body>
      if (el.parentElement === document.body) score *= 0.5;
      // Penalize very nested elements
      if (this._getDepth(el) > 10) score *= 0.7;
      // Bonus for semantic class names
      if (/content|article|post|story|entry|blog/i.test(el.className)) score *= 1.5;
      // Penalty for nav/sidebar/footer patterns
      if (/nav|sidebar|footer|comment|widget|ad-|promo/i.test(el.className + ' ' + el.id)) score *= 0.1;

      if (score > bestScore) {
        bestScore = score;
        bestEl = el;
      }
    }

    return bestEl;
  }

  /**
   * Extract structured paragraphs from the content root.
   */
  _extractParagraphs(root) {
    const result = [];
    const seen = new Set();

    // Collect text-bearing elements
    const elements = root.querySelectorAll('p, h2, h3, h4, blockquote, li');

    for (const el of elements) {
      const text = el.textContent.trim();
      if (text.length < 20) continue;
      if (seen.has(text)) continue;
      seen.add(text);

      // Skip hidden elements
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      // Skip elements inside nav/footer/aside
      if (el.closest('nav, footer, aside, .comments, [role="navigation"]')) continue;

      const type = el.tagName.match(/^H[2-4]$/) ? 'heading' :
                   el.tagName === 'BLOCKQUOTE' ? 'quote' :
                   el.tagName === 'LI' ? 'list-item' : 'paragraph';

      result.push({ text, type, element: el });
    }

    return result;
  }

  /**
   * Find audio/video elements on the page (e.g., NotebookLM players).
   */
  _findAudioElements() {
    const results = [];

    // Native <audio> elements
    for (const el of document.querySelectorAll('audio')) {
      results.push({
        type: 'audio',
        element: el,
        src: el.src || el.querySelector('source')?.src || null
      });
    }

    // Native <video> elements
    for (const el of document.querySelectorAll('video')) {
      results.push({
        type: 'video',
        element: el,
        src: el.src || el.querySelector('source')?.src || null
      });
    }

    // Embedded iframes (SoundCloud, Spotify, etc.)
    for (const el of document.querySelectorAll('iframe')) {
      const src = el.src || '';
      if (/soundcloud|spotify|podbean|anchor\.fm|notebooklm/i.test(src)) {
        results.push({ type: 'embed', element: el, src });
      }
    }

    // Custom audio players (common patterns)
    const playerSelectors = [
      '[data-audio-url]', '[data-audio-src]', '[data-podcast-url]',
      '.audio-player', '.podcast-player', '.audio-embed'
    ];
    for (const sel of playerSelectors) {
      for (const el of document.querySelectorAll(sel)) {
        const src = el.dataset.audioUrl || el.dataset.audioSrc || el.dataset.podcastUrl || null;
        results.push({ type: 'custom-player', element: el, src });
      }
    }

    return results;
  }

  _getTextLength(el) {
    return el.textContent.trim().length;
  }

  _getDepth(el) {
    let depth = 0;
    let node = el;
    while (node.parentElement) {
      depth++;
      node = node.parentElement;
    }
    return depth;
  }
}

window.ArticleExtractor = ArticleExtractor;
