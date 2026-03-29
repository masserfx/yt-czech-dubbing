const { YoutubeTranscript } = require('youtube-transcript');

/**
 * Extract captions from a YouTube video.
 * Tries Czech first, falls back to English, then any available language.
 *
 * @param {string} videoId - YouTube video ID
 * @returns {Array<{text: string, offset: number, duration: number}>}
 */
async function extractCaptions(videoId) {
  // Try Czech captions first
  for (const lang of ['cs', 'en', null]) {
    try {
      const config = lang ? { lang } : {};
      const transcript = await YoutubeTranscript.fetchTranscript(videoId, config);

      if (transcript && transcript.length > 0) {
        console.log(`[Captions] Got ${transcript.length} segments (lang: ${lang || 'auto'})`);
        return transcript.map(item => ({
          text: cleanText(item.text),
          offset: item.offset / 1000, // ms to seconds
          duration: item.duration / 1000
        }));
      }
    } catch (err) {
      console.warn(`[Captions] Failed for lang=${lang}:`, err.message);
    }
  }

  return [];
}

/**
 * Clean caption text - remove HTML tags and normalize whitespace.
 */
function cleanText(text) {
  return text
    .replace(/<[^>]*>/g, '')    // Remove HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { extractCaptions };
