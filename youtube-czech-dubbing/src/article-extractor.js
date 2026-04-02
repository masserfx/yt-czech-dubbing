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
   * Walks the DOM tree sequentially to preserve reading order and detect
   * interruptions (images, videos, embeds) between text blocks.
   */
  _extractParagraphs(root) {
    const result = [];
    const seen = new Set();
    const mediaAncestors = new Set(); // track media containers to skip their children

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        // Skip hidden elements (entire subtree)
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }
        // Skip nav/footer/aside/comments (entire subtree)
        if (node.matches('nav, footer, aside, .comments, [role="navigation"], .social-share, .related-posts')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      const tag = node.tagName;

      // Check if we're inside a media ancestor → skip
      let insideMedia = false;
      for (const ancestor of mediaAncestors) {
        if (ancestor.contains(node)) { insideMedia = true; break; }
      }

      // Detect media/embed interruptions
      if (this._isMediaElement(node) && !insideMedia) {
        mediaAncestors.add(node);
        const desc = this._getMediaDescription(node);
        if (result.length > 0 && result[result.length - 1].type !== 'break') {
          result.push({
            text: desc || '',
            type: 'break',
            element: node,
            mediaType: this._getMediaType(node)
          });
        }
        continue;
      }

      if (insideMedia) continue;

      // Only process text-bearing elements
      if (!this._isTextElement(tag)) continue;

      const text = node.textContent.trim();
      if (text.length < 20) continue;
      if (seen.has(text)) continue;
      seen.add(text);

      const type = tag.match(/^H[2-6]$/) ? 'heading' :
                   tag === 'BLOCKQUOTE' ? 'quote' :
                   tag === 'LI' ? 'list-item' :
                   tag === 'FIGCAPTION' ? 'caption' : 'paragraph';

      result.push({ text, type, element: node });
    }

    // Clean up trailing/consecutive breaks
    return this._cleanResults(result);
  }

  /**
   * Check if an element is a media/embed that interrupts text flow.
   */
  _isMediaElement(node) {
    const tag = node.tagName;
    if (['IMG', 'VIDEO', 'AUDIO', 'IFRAME', 'CANVAS', 'SVG'].includes(tag)) return true;
    if (tag === 'FIGURE') return true;

    // Common media container patterns
    const cl = (node.className || '') + ' ' + (node.id || '');
    if (/video|player|embed|chart|graph|infographic|gallery|carousel|slider/i.test(cl)) {
      // Only if it's a container (has minimal direct text)
      const directText = this._getDirectTextLength(node);
      if (directText < 50) return true;
    }
    return false;
  }

  /**
   * Get a human-readable description of a media element for TTS.
   */
  _getMediaDescription(node) {
    const tag = node.tagName;

    if (tag === 'IMG' || tag === 'FIGURE') {
      const img = tag === 'IMG' ? node : node.querySelector('img');
      const alt = img?.alt?.trim();
      const caption = node.querySelector('figcaption')?.textContent?.trim();
      return caption || (alt && alt.length > 5 ? alt : null);
    }

    if (tag === 'VIDEO' || tag === 'AUDIO') {
      return null; // skip description, just mark as break
    }

    if (tag === 'IFRAME') {
      const src = node.src || '';
      if (/youtube|vimeo/i.test(src)) return null;
    }

    return null;
  }

  /**
   * Classify media type for the break marker.
   */
  _getMediaType(node) {
    const tag = node.tagName;
    if (tag === 'IMG' || tag === 'FIGURE') return 'image';
    if (tag === 'VIDEO') return 'video';
    if (tag === 'AUDIO') return 'audio';
    if (tag === 'IFRAME') return 'embed';
    if (tag === 'SVG' || tag === 'CANVAS') return 'graphic';
    const cl = (node.className || '').toLowerCase();
    if (/chart|graph/i.test(cl)) return 'chart';
    return 'media';
  }

  _isTextElement(tag) {
    return ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'LI', 'FIGCAPTION'].includes(tag);
  }

  /**
   * Get only the direct text content length (not from child elements).
   */
  _getDirectTextLength(node) {
    let len = 0;
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        len += child.textContent.trim().length;
      }
    }
    return len;
  }

  /**
   * Clean extracted results: remove trailing breaks, merge consecutive breaks.
   */
  _cleanResults(items) {
    const cleaned = [];
    for (const item of items) {
      if (item.type === 'break') {
        // Skip consecutive breaks
        if (cleaned.length > 0 && cleaned[cleaned.length - 1].type === 'break') continue;
        // Only include breaks that have a description (image alt/caption)
        if (!item.text) continue;
      }
      cleaned.push(item);
    }
    // Remove trailing breaks
    while (cleaned.length > 0 && cleaned[cleaned.length - 1].type === 'break') {
      cleaned.pop();
    }
    return cleaned;
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
