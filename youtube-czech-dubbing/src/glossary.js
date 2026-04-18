/**
 * Glossary — per-channel translation overrides stored in chrome.storage.local.
 *
 * Storage layout:
 *   glossaries: { [channelId]: { name, entries: [{source, target, keep}], updatedAt } }
 *
 * Application:
 *   - LLM engines (Gemini, Claude, OpenAI): prompt injection via buildPromptInstruction().
 *     Gives the model exact translations to respect. Cleanest and works with context.
 *   - Non-LLM engines (Google, Chrome AI): regex substitution via applyPre/applyPost.
 *     Replace source → target before translate, preserve "keep original" tokens.
 */
class Glossary {
  constructor() {
    this._channelId = null;
    this._channelName = null;
    this._entries = [];
  }

  isActive() {
    return !!this._channelId && this._entries.length > 0;
  }

  getChannelId() { return this._channelId; }
  getChannelName() { return this._channelName; }
  getEntries() { return [...this._entries]; }

  /**
   * Load glossary for a given channel. Sets active state.
   * Passes channelName for future display; caller supplies from DOM scrape.
   */
  async loadForChannel(channelId, channelName) {
    this._channelId = channelId || null;
    this._channelName = channelName || null;
    this._entries = [];
    if (!channelId) return;
    try {
      const { glossaries } = await chrome.storage.local.get('glossaries');
      const entry = glossaries?.[channelId];
      if (entry?.entries) this._entries = entry.entries;
      if (entry?.name && !channelName) this._channelName = entry.name;
    } catch (_) {}
  }

  async addEntry(source, target, keep = false) {
    if (!this._channelId || !source) return;
    source = source.trim();
    target = (target || '').trim();
    if (!source) return;
    const existing = this._entries.findIndex(e => e.source.toLowerCase() === source.toLowerCase());
    const row = { source, target: target || source, keep: !!keep };
    if (existing >= 0) this._entries[existing] = row;
    else this._entries.push(row);
    await this._persist();
  }

  async removeEntry(source) {
    if (!this._channelId) return;
    const before = this._entries.length;
    this._entries = this._entries.filter(e => e.source.toLowerCase() !== source.toLowerCase());
    if (this._entries.length !== before) await this._persist();
  }

  async _persist() {
    if (!this._channelId) return;
    try {
      const { glossaries = {} } = await chrome.storage.local.get('glossaries');
      glossaries[this._channelId] = {
        name: this._channelName || this._channelId,
        entries: this._entries,
        updatedAt: new Date().toISOString()
      };
      await chrome.storage.local.set({ glossaries });
    } catch (e) {
      console.warn('[Glossary] persist failed:', e.message);
    }
  }

  /**
   * Build natural-language instruction for LLM prompts (Gemini, Claude, OpenAI).
   * Kept short: every token costs latency. Empty string if no entries.
   */
  buildPromptInstruction() {
    if (!this.isActive()) return '';
    const lines = this._entries.map(e => {
      if (e.keep) return `- "${e.source}" → keep as "${e.source}" (do not translate)`;
      return `- "${e.source}" → "${e.target}"`;
    });
    return `\n\nGlossary (strictly apply these translations):\n${lines.join('\n')}`;
  }

  /**
   * Regex-based pre-substitution for non-LLM engines (Google, Chrome AI).
   * Protects "keep original" terms by wrapping in a placeholder that survives translation.
   * Returns { text: modified, placeholders: Map } — pass placeholders to applyPost.
   */
  applyPre(text) {
    const placeholders = new Map();
    if (!this.isActive()) return { text, placeholders };

    let modified = text;
    let idx = 0;
    for (const entry of this._entries) {
      if (!entry.keep) continue;
      const token = `\u2063X${idx}\u2063`; // invisible separators, unlikely in normal text
      const re = new RegExp(`\\b${escapeRegex(entry.source)}\\b`, 'gi');
      if (re.test(modified)) {
        placeholders.set(token, entry.source);
        modified = modified.replace(re, token);
        idx++;
      }
    }
    return { text: modified, placeholders };
  }

  /**
   * Post-translation: restore protected terms + apply preferred translations.
   */
  applyPost(translated, placeholders) {
    if (!translated) return translated;
    let out = translated;
    if (placeholders && placeholders.size > 0) {
      for (const [token, orig] of placeholders) {
        out = out.split(token).join(orig);
      }
    }
    // Preferred translations: substitute in the translated output using word boundary.
    // This is best-effort — LLM engines already handle this via prompt, so only useful for Google/ChromeAI.
    for (const entry of this._entries) {
      if (entry.keep) continue;
      if (!entry.source || !entry.target || entry.source === entry.target) continue;
      // Replace source word with target in the translated output, case-insensitive.
      const re = new RegExp(`\\b${escapeRegex(entry.source)}\\b`, 'gi');
      out = out.replace(re, entry.target);
    }
    return out;
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (typeof window !== 'undefined') {
  window.Glossary = Glossary;
}
