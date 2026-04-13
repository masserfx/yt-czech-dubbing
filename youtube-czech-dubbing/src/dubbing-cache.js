/**
 * DubbingCache - Persistent cache for translated dubbing segments.
 * Uses IndexedDB to store translated segments per video, so dubbing
 * doesn't need to re-translate on repeated views.
 */
class DubbingCache {
  constructor() {
    this._db = null;
    this._dbName = 'CzechDubCache';
    this._storeName = 'translations';
    this._version = 1;
  }

  /**
   * Open (or create) the IndexedDB database.
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

  /**
   * Build a unique cache key from video ID and target language.
   */
  _makeId(videoId, targetLang) {
    return `${videoId}:${targetLang}`;
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
