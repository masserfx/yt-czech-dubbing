/**
 * SpeakerDetector - Detects speaker roles (male/female/child/narrator)
 * from subtitle text using heuristics and LLM tag parsing.
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
   * Used as fallback when LLM tags are not available (e.g. Google Translate).
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

    // >> prefix indicates speaker change (common in CC)
    // Can't determine gender from >> alone, return null

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
}

window.SpeakerDetector = SpeakerDetector;
