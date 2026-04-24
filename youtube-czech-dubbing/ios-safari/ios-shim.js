(function () {
  'use strict';
  // Flags consumed by content.js / tts-engine.js / dubbing-controller.js
  window.__CZECHDUB_IOS__ = true;
  window.__CZECHDUB_NO_OFFSCREEN__ = true;     // play TTS audio inline
  window.__CZECHDUB_NO_PAGESCRIPT__ = true;    // no MAIN-world XHR capture
  window.__CZECHDUB_FORCE_DOM_CAPTIONS__ = true;

  // iOS Safari requires a user-gesture to unlock speechSynthesis and HTMLAudioElement.
  // Listen for first touch/click and fire a silent utterance + silent audio to "prime" both.
  let unlocked = false;
  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;
    try {
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {}
    try {
      // ── TTS playback element ────────────────────────────────────────────
      // Single persistent <audio> element attached to DOM. tts-engine.js
      // reuses this so later play() calls are not blocked by iOS auto-play.
      const a = document.createElement('audio');
      a.setAttribute('playsinline', '');
      a.setAttribute('webkit-playsinline', '');
      a.preload = 'auto';
      a.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
      (document.body || document.documentElement).appendChild(a);
      a.src = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgP////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAnGWj+MDAAAAAAAAAAAAAAAAAAAAAP/7UGQAAAPAAAGkAAAAIAAANIAAAARAAAaQAAAAgAAA0gAAABETAAAMA';
      a.volume = 0;
      a.play().then(() => { a.pause(); a.currentTime = 0; a.volume = 1; }).catch(() => {});
      window.__czechdubUnlockedAudio = a;

      // ── Web Audio boost chain (2.5× gain headroom) ──────────────────────
      let ctx = null;
      let gain = null;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          ctx = new AC();
          if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
          const source = ctx.createMediaElementSource(a);
          gain = ctx.createGain();
          gain.gain.value = 2.5;
          source.connect(gain);
          gain.connect(ctx.destination);
          window.__czechdubAudioCtx = ctx;
          window.__czechdubGainNode = gain;
          console.log('[CzechDub:iOS] WebAudio boost chain attached (gain=2.5x)');
        }
      } catch (e) {
        console.warn('[CzechDub:iOS] WebAudio boost chain failed:', e?.message || e);
      }

      // NOTE: Silent background keep-alive loop was removed in v9 — it conflicted
      // with TTS playback on iOS Safari (concurrent audio streams from the same
      // origin caused the TTS element to go silent). Reliable screen-off audio
      // on iOS requires a different approach (YT Premium handles its own
      // background audio; TTS dub will pause when screen locks).

      // NOTE: MediaSession API and visibilitychange handler were removed in v10
      // — they interfered with TTS playback rate on iOS Safari (utterances came
      // out sped-up / spelled out letter-by-letter). Background audio when
      // screen locks is a known iOS limitation for web extensions; YouTube
      // Premium handles its own background audio, our TTS dub pauses on lock.
    } catch (e) {}
    window.__CZECHDUB_AUDIO_UNLOCKED__ = true;
    console.log('[CzechDub:iOS] audio context unlocked');
    const ov = document.getElementById('czechdub-ios-unlock');
    if (ov) ov.remove();
  }
  ['touchstart', 'click', 'pointerdown'].forEach((ev) => {
    document.addEventListener(ev, unlockAudio, { capture: true, once: false, passive: true });
  });

  // Blocking overlay that prompts user to tap the page — needed because
  // iOS Safari won't play speechSynthesis from a popup-triggered code path.
  // Shown when dubbing starts but audio has not yet been unlocked.
  function showUnlockOverlay() {
    if (unlocked) return;
    if (document.getElementById('czechdub-ios-unlock')) return;
    const ov = document.createElement('div');
    ov.id = 'czechdub-ios-unlock';
    ov.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483646',
      'background:rgba(0,0,0,0.85)', 'color:#fff',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'font:600 18px/1.4 -apple-system,sans-serif',
      'text-align:center', 'padding:24px',
      'pointer-events:auto'
    ].join(';');
    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:48px;margin-bottom:16px';
    icon.textContent = '🔊';
    const title = document.createElement('div');
    title.style.cssText = 'margin-bottom:8px';
    title.textContent = 'Klepněte pro zapnutí dabingu';
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:14px;opacity:0.8;max-width:300px';
    hint.textContent = 'iOS Safari vyžaduje jeden dotyk stránky před přehráváním zvuku.';
    ov.appendChild(icon);
    ov.appendChild(title);
    ov.appendChild(hint);
    document.body.appendChild(ov);
  }
  window.__CZECHDUB_SHOW_UNLOCK__ = showUnlockOverlay;

  // Build stamp — bump on every edit, verify in Safari console after sync.
  // If you don't see this exact string, Safari is serving stale cache;
  // disable+re-enable the extension in iOS Settings → Safari → Extensions.
  window.__CZECHDUB_BUILD__ = 'ios-shim-2026-04-18-keep-queue-v11';
  console.log('[CzechDub:iOS] shim active — DOM caption mode, chronological queue ('
    + window.__CZECHDUB_BUILD__ + ')');

  // On-screen diagnostic overlay (iOS-only). Shows last 8 log lines in a fixed panel.
  // Toggle by tapping it. Activated automatically on YouTube pages.
  function installDiagOverlay() {
    if (document.getElementById('czechdub-ios-diag')) return;
    const el = document.createElement('div');
    el.id = 'czechdub-ios-diag';
    el.style.cssText = [
      'position:fixed', 'z-index:2147483647',
      'top:env(safe-area-inset-top,0)', 'left:0', 'right:0',
      'max-height:35vh', 'overflow:auto',
      'background:rgba(0,0,0,0.75)', 'color:#0f0',
      'font:11px/1.3 -apple-system,monospace',
      'padding:4px 6px', 'pointer-events:auto',
      'white-space:pre-wrap', 'word-break:break-word'
    ].join(';');
    el.textContent = '[CzechDub:iOS] ready — tap to hide';
    let hidden = false;
    el.addEventListener('click', () => {
      hidden = !hidden;
      el.style.display = hidden ? 'none' : '';
    }, { passive: true });
    const append = document.body ? () => document.body.appendChild(el)
                                 : () => window.addEventListener('DOMContentLoaded', () => document.body.appendChild(el), { once: true });
    append();
    const lines = [];
    const write = (level, args) => {
      const s = '[' + new Date().toISOString().slice(11,19) + '] ' + args.map(a => {
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); }
      }).join(' ');
      lines.push(s);
      if (lines.length > 30) lines.shift();
      el.textContent = lines.join('\n');
      el.scrollTop = el.scrollHeight;
    };
    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origErr = console.error.bind(console);
    console.log = function (...a) { origLog(...a); if (a[0]?.toString().includes('CzechDub')) write('log', a); };
    console.warn = function (...a) { origWarn(...a); if (a[0]?.toString().includes('CzechDub')) write('warn', a); };
    console.error = function (...a) { origErr(...a); write('err', a); };
    window.addEventListener('error', (e) => write('err', ['WindowError:', e.message, e.filename, e.lineno]));
    window.addEventListener('unhandledrejection', (e) => write('err', ['UnhandledRej:', e.reason?.message || e.reason]));
  }
  if (location.hostname.endsWith('youtube.com')) {
    installDiagOverlay();
  }
})();
