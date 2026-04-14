/**
 * SpeakerDetector - Detects speaker roles (male/female/child/narrator)
 * from subtitle text using heuristics and LLM classification.
 *
 * Speaker tags: [M] male, [F] female, [C] child, [N] narrator
 */
class SpeakerDetector {
  /**
   * Parse speaker tag from translated text.
   * LLM adds [M]/[F]/[C]/[N] prefix during translation.
   * Returns { speaker, text } with tag stripped.
   */
  static parseTag(text) {
    if (!text) return { speaker: null, text: text || '' };
    const match = text.match(/^\s*\[(M|F|C|N)\]\s*/);
    if (match) {
      return { speaker: match[1], text: text.slice(match[0].length) };
    }
    return { speaker: null, text };
  }

  /**
   * Detect speaker from original (English) caption text using heuristics.
   * Used as fallback when LLM is not available (e.g. Google Translate).
   */
  static detectFromText(text) {
    if (!text) return null;

    // YouTube CC speaker labels: [Man], [Woman], [Narrator], [Speaker 1], etc.
    const ccLabel = text.match(/^\[([^\]]+)\]/);
    if (ccLabel) {
      const label = ccLabel[1].toLowerCase();
      if (/woman|female|girl|she/i.test(label)) return 'F';
      if (/man|male|boy|he|guy/i.test(label)) return 'M';
      if (/child|kid|baby/i.test(label)) return 'C';
      if (/narrator|announcer|host|voiceover/i.test(label)) return 'N';
    }

    // WebVTT speaker tag: <v Speaker Name>
    const vTag = text.match(/<v\s+([^>]+)>/);
    if (vTag) {
      const name = vTag[1].toLowerCase();
      if (/woman|female|girl|she|her/i.test(name)) return 'F';
      if (/man|male|boy|he|his|guy/i.test(name)) return 'M';
    }

    return null;
  }

  /**
   * Apply heuristic detection to an array of segments.
   * Only sets speaker on segments where heuristics are confident.
   */
  static detectHeuristics(segments) {
    for (const seg of segments) {
      if (!seg.speaker && seg.originalText) {
        seg.speaker = SpeakerDetector.detectFromText(seg.originalText);
      }
    }
    return segments;
  }

  /**
   * Detect speakers via LLM (Gemini) — one API call for all segments.
   * Sends original English text, gets back M/F/C/N per line.
   * @param {Array} segments - translated segments with originalText
   * @param {string} apiKey - Gemini API key
   * @returns {Promise<Array>} segments with speaker field set
   */
  static async detectViaLLM(segments, apiKey) {
    if (!apiKey || segments.length === 0) return segments;

    // Collect original texts for detection
    const lines = segments.map(s => s.originalText || s.text || '');
    // Skip if too few segments or all empty
    if (lines.filter(l => l.trim().length > 0).length < 2) return segments;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'detect-speakers',
        lines,
        apiKey
      });

      if (response?.success && response.roles?.length > 0) {
        const roles = response.roles;
        for (let i = 0; i < Math.min(segments.length, roles.length); i++) {
          if (roles[i] && !segments[i].speaker) {
            segments[i].speaker = roles[i];
          }
        }
        const tagged = segments.filter(s => s.speaker).length;
        console.log(`[Speaker] LLM detected ${tagged}/${segments.length} speaker roles`);
      }
    } catch (e) {
      if (!e.message?.includes('Extension context invalidated')) {
        console.warn('[Speaker] LLM detection failed:', e.message);
      }
    }

    return segments;
  }
}

window.SpeakerDetector = SpeakerDetector;
