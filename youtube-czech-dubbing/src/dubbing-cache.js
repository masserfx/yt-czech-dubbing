/**
 * DubbingCache - Persistent cache for translated dubbing segments.
 * Uses IndexedDB to store translated segments per video, so dubbing
 * doesn't need to re-translate on repeated views.
 */
class DubbingCache {
  // Bump this when translation quality changes (prompts, cleanup) to invalidate old cache
  static CACHE_VERSION = 3;

  constructor() {
    this._db = null;
    this._dbName = 'CzechDubCache';
    this._storeName = 'translations';
    this._audioStoreName = 'audio';
    this._version = 2;
    // Cap audio storage to avoid unbounded growth (typical ~500KB/segment WAV)
    this._AUDIO_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
    this._AUDIO_MAX_RECORDS = 5000;                    // ~2.5 GB upper bound
  }

  /**
   * Open (or create) the IndexedDB database.
   * v1: translations only
   * v2: + audio store (synthesized WAV/MP3 base64 per segment)
   */
  async _open() {
    if (this._db) return this._db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this._dbName, this._version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this._storeName)) {
          const store = db.createObjectStore(this._storeName, { keyPath: 'id' });
          store.createIndex('videoId', 'videoId', { unique: false });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(this._audioStoreName)) {
          const audio = db.createObjectStore(this._audioStoreName, { keyPath: 'id' });
          audio.createIndex('videoId', 'videoId', { unique: false });
          audio.createIndex('savedAt', 'savedAt', { unique: false });
          audio.createIndex('voiceKey', 'voiceKey', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this._db = event.target.result;
        resolve(this._db);
      };

      request.onerror = (event) => {
        console.warn('[DubbingCache] IndexedDB open failed:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // ───────────── audio cache (P2) ─────────────

  _audioId(videoId, engine, voice, text) {
    // Composite key: same sentence under same voice/engine in same video.
    // Cross-video reuse intentionally not done — keeps eviction per-video clean.
    return `${videoId}|${engine}|${voice}|${this._hashText(text)}`;
  }

  _hashText(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  /**
   * Persist a freshly-synthesized audio sample for a segment.
   */
  async saveAudio(videoId, engine, voice, text, audioBase64, meta = {}) {
    if (!videoId || !engine || !voice || !text || !audioBase64) return false;
    try {
      const db = await this._open();
      const tx = db.transaction(this._audioStoreName, 'readwrite');
      const store = tx.objectStore(this._audioStoreName);
      store.put({
        id: this._audioId(videoId, engine, voice, text),
        videoId,
        engine,
        voice,
        voiceKey: `${engine}|${voice}`,
        text,
        rate: meta.rate ?? 1,
        pitch: meta.pitch ?? 1,
        audioBase64,
        savedAt: Date.now()
      });
      return new Promise((resolve) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      console.warn('[DubbingCache] saveAudio failed:', e?.message || e);
      return false;
    }
  }

  /**
   * Load every cached audio sample for a videoId/engine/voice triplet.
   * Returns array of {text, audioBase64, rate, pitch} suitable for
   * TTSEngine.prewarmFromCache().
   */
  async loadAudioForVideo(videoId, engine, voice) {
    try {
      const db = await this._open();
      const tx = db.transaction(this._audioStoreName, 'readonly');
      const store = tx.objectStore(this._audioStoreName);
      const idx = store.index('voiceKey');
      const range = IDBKeyRange.only(`${engine}|${voice}`);
      return new Promise((resolve) => {
        const out = [];
        const req = idx.openCursor(range);
        req.onsuccess = (ev) => {
          const cursor = ev.target.result;
          if (cursor) {
            const r = cursor.value;
            if (r.videoId === videoId) out.push(r);
            cursor.continue();
          } else {
            resolve(out);
          }
        };
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      console.warn('[DubbingCache] loadAudioForVideo failed:', e?.message || e);
      return [];
    }
  }

  /**
   * Drop audio entries older than maxAgeMs and trim total record count to
   * audioMaxRecords. Cheap LRU; runs lazily.
   */
  async pruneAudio() {
    try {
      const db = await this._open();
      const tx = db.transaction(this._audioStoreName, 'readwrite');
      const store = tx.objectStore(this._audioStoreName);
      const idx = store.index('savedAt');
      const cutoff = Date.now() - this._AUDIO_MAX_AGE_MS;
      let removed = 0;
      await new Promise((resolve) => {
        idx.openCursor(IDBKeyRange.upperBound(cutoff)).onsuccess = (ev) => {
          const cur = ev.target.result;
          if (cur) { cur.delete(); removed++; cur.continue(); }
          else resolve();
        };
      });
      // Hard cap by count (oldest first)
      const countReq = store.count();
      await new Promise((resolve) => { countReq.onsuccess = resolve; });
      if (countReq.result > this._AUDIO_MAX_RECORDS) {
        const overflow = countReq.result - this._AUDIO_MAX_RECORDS;
        let trimmed = 0;
        await new Promise((resolve) => {
          idx.openCursor().onsuccess = (ev) => {
            const cur = ev.target.result;
            if (cur && trimmed < overflow) { cur.delete(); trimmed++; cur.continue(); }
            else resolve();
          };
        });
        removed += trimmed;
      }
      if (removed) console.log(`[DubbingCache] Pruned ${removed} audio entries`);
    } catch (e) {
      console.warn('[DubbingCache] pruneAudio failed:', e?.message || e);
    }
  }

  /**
   * Build a unique cache key from video ID and target language.
   */
  _makeId(videoId, targetLang) {
    return `${videoId}:${targetLang}:v${DubbingCache.CACHE_VERSION}`;
  }

  /**
   * Extract YouTube video ID from the current URL.
   */
  static getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v') || null;
  }

  /**
   * Save translated segments for a video.
   * @param {string} videoId - YouTube video ID
   * @param {string} targetLang - Target language code (e.g. 'cs')
   * @param {Array} segments - Translated segments with start, duration, text, originalText
   * @param {string} sourceLang - Original language of the video
   * @param {string} engine - Translation engine used
   */
  async save(videoId, targetLang, segments, sourceLang, engine) {
    try {
      const db = await this._open();
      const tx = db.transaction(this._storeName, 'readwrite');
      const store = tx.objectStore(this._storeName);

      const record = {
        id: this._makeId(videoId, targetLang),
        videoId,
        targetLang,
        sourceLang,
        engine,
        segments: segments.map(s => ({
          start: s.start,
          duration: s.duration,
          text: s.text,
          originalText: s.originalText || ''
        })),
        segmentCount: segments.length,
        savedAt: Date.now(),
        videoTitle: document.title.replace(' - YouTube', '').trim()
      };

      store.put(record);

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          console.log(`[DubbingCache] Saved ${segments.length} segments for ${videoId} (${targetLang})`);
          resolve(true);
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[DubbingCache] Save failed:', e);
      return false;
    }
  }

  /**
   * Load cached translated segments for a video.
   * @returns {Object|null} - { segments, sourceLang, engine, savedAt, videoTitle } or null
   */
  async load(videoId, targetLang) {
    try {
      const db = await this._open();
      const tx = db.transaction(this._storeName, 'readonly');
      const store = tx.objectStore(this._storeName);
      const request = store.get(this._makeId(videoId, targetLang));

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const record = request.result;
          if (record) {
            console.log(`[DubbingCache] Loaded ${record.segmentCount} cached segments for ${videoId} (${targetLang})`);
            resolve(record);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('[DubbingCache] Load failed:', e);
      return null;
    }
  }

  /**
   * Check if a cached translation exists for a video.
   */
  async has(videoId, targetLang) {
    const record = await this.load(videoId, targetLang);
    return record !== null;
  }

  /**
   * Delete cached translation for a specific video.
   */
  async delete(videoId, targetLang) {
    try {
      const db = await this._open();
      const tx = db.transaction(this._storeName, 'readwrite');
      const store = tx.objectStore(this._storeName);
      store.delete(this._makeId(videoId, targetLang));

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          console.log(`[DubbingCache] Deleted cache for ${videoId} (${targetLang})`);
          resolve(true);
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[DubbingCache] Delete failed:', e);
      return false;
    }
  }

  /**
   * Get all cached videos (for UI listing).
   * @returns {Array} - [{ videoId, targetLang, videoTitle, savedAt, segmentCount, engine }]
   */
  async listAll() {
    try {
      const db = await this._open();
      const tx = db.transaction(this._storeName, 'readonly');
      const store = tx.objectStore(this._storeName);
      const request = store.getAll();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const records = request.result || [];
          // Return summary without full segments
          resolve(records.map(r => ({
            videoId: r.videoId,
            targetLang: r.targetLang,
            videoTitle: r.videoTitle,
            savedAt: r.savedAt,
            segmentCount: r.segmentCount,
            engine: r.engine,
            sourceLang: r.sourceLang
          })).sort((a, b) => b.savedAt - a.savedAt));
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('[DubbingCache] List failed:', e);
      return [];
    }
  }

  /**
   * Clear all cached translations.
   */
  async clearAll() {
    try {
      const db = await this._open();
      const tx = db.transaction(this._storeName, 'readwrite');
      const store = tx.objectStore(this._storeName);
      store.clear();

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => {
          console.log('[DubbingCache] All cache cleared');
          resolve(true);
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('[DubbingCache] Clear failed:', e);
      return false;
    }
  }

  /**
   * Get total number of cached videos.
   */
  async count() {
    try {
      const db = await this._open();
      const tx = db.transaction(this._storeName, 'readonly');
      const store = tx.objectStore(this._storeName);
      const request = store.count();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      return 0;
    }
  }
}

window.DubbingCache = DubbingCache;
