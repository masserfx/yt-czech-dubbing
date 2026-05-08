/**
 * ui-zoom.js
 *
 * Per-view zoom controller used by both sidepanel and popup. The browser does
 * not honour Cmd/Ctrl +/-/0 inside extension surfaces, so we implement the
 * same gesture ourselves by writing the chromium-only `zoom` property to the
 * root element.
 *
 * Zoom is stored per-extension (single key) so sidepanel and popup share it.
 */
(function () {
  const STORAGE_KEY = 'uiZoomLevel';
  const LEVELS = [0.70, 0.80, 0.90, 1.00, 1.10, 1.20, 1.35, 1.50];
  const DEFAULT_LEVEL = 1.00;

  class UiZoom {
    constructor() {
      this.level = DEFAULT_LEVEL;
      this._toastTimer = null;
    }

    async init() {
      await this._load();
      this._apply();
      this._bindKeys();
      this._bindButtons();
      this._listenStorage();
    }

    increase() {
      const next = LEVELS.find(l => l > this.level + 1e-6);
      if (next != null) this._setLevel(next);
    }

    decrease() {
      const lower = [...LEVELS].reverse().find(l => l < this.level - 1e-6);
      if (lower != null) this._setLevel(lower);
    }

    reset() {
      this._setLevel(DEFAULT_LEVEL);
    }

    // ───────────────────────── internals ─────────────────────────

    _setLevel(level) {
      const clamped = Math.max(LEVELS[0], Math.min(LEVELS[LEVELS.length - 1], level));
      if (Math.abs(clamped - this.level) < 1e-6) return;
      this.level = clamped;
      this._apply();
      this._persist();
      this._toast(`${Math.round(clamped * 100)}%`);
    }

    _apply() {
      // chromium-specific: scales the entire viewport like Cmd/Ctrl +/-.
      document.documentElement.style.zoom = this.level;
      document.documentElement.dataset.zoomLevel = String(this.level);
      this._updateLabel();
    }

    _updateLabel() {
      document.querySelectorAll('[data-zoom-label]').forEach(el => {
        el.textContent = `${Math.round(this.level * 100)}%`;
      });
      document.querySelectorAll('[data-zoom-action="dec"]').forEach(btn => {
        btn.disabled = this.level <= LEVELS[0] + 1e-6;
      });
      document.querySelectorAll('[data-zoom-action="inc"]').forEach(btn => {
        btn.disabled = this.level >= LEVELS[LEVELS.length - 1] - 1e-6;
      });
    }

    async _load() {
      try {
        if (chrome?.storage?.local) {
          const r = await chrome.storage.local.get(STORAGE_KEY);
          if (typeof r[STORAGE_KEY] === 'number') {
            this.level = r[STORAGE_KEY];
            return;
          }
        }
      } catch (_) {}
      try {
        const v = parseFloat(localStorage.getItem(STORAGE_KEY));
        if (!Number.isNaN(v) && v > 0) this.level = v;
      } catch (_) {}
    }

    async _persist() {
      try {
        if (chrome?.storage?.local) {
          await chrome.storage.local.set({ [STORAGE_KEY]: this.level });
          return;
        }
      } catch (_) {}
      try { localStorage.setItem(STORAGE_KEY, String(this.level)); } catch (_) {}
    }

    _listenStorage() {
      try {
        chrome?.storage?.onChanged?.addListener?.((changes, area) => {
          if (area === 'local' && changes[STORAGE_KEY]) {
            const next = changes[STORAGE_KEY].newValue;
            if (typeof next === 'number' && Math.abs(next - this.level) > 1e-6) {
              this.level = next;
              this._apply();
            }
          }
        });
      } catch (_) {}
    }

    _bindKeys() {
      window.addEventListener('keydown', (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (!mod) return;
        // Cmd/Ctrl + "+" (also "=") → zoom in
        if (e.key === '+' || e.key === '=' || e.code === 'Equal' || e.code === 'NumpadAdd') {
          e.preventDefault();
          this.increase();
          return;
        }
        // Cmd/Ctrl + "-" → zoom out
        if (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          this.decrease();
          return;
        }
        // Cmd/Ctrl + "0" → reset
        if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault();
          this.reset();
        }
      });
    }

    _bindButtons() {
      document.querySelectorAll('[data-zoom-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const action = btn.dataset.zoomAction;
          if (action === 'inc') this.increase();
          else if (action === 'dec') this.decrease();
          else if (action === 'reset') this.reset();
        });
      });
    }

    _toast(text) {
      let el = document.getElementById('zoomToast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'zoomToast';
        el.className = 'zoom-toast';
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.classList.add('visible');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove('visible'), 900);
    }
  }

  const zoom = new UiZoom();
  window.uiZoom = zoom;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => zoom.init());
  } else {
    zoom.init();
  }
})();
