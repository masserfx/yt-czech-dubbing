#!/usr/bin/env node
/**
 * VoiceDub — investor pitch PDF export
 *
 * Renders b2b-hub/public/pitch.html → b2b-hub/dist/voicedub-pitch-<date>.pdf
 * pomocí Puppeteer headless Chromium. Automaticky expanduje interactive
 * calculator do statické tabulky (všechna čísla viditelná bez sliderů).
 *
 * Usage:
 *   cd b2b-hub
 *   npm install
 *   npm run pdf
 *
 * Output:
 *   dist/voicedub-pitch-2026-04-17.pdf  (A4, ~2–3 MB, 12–18 stran)
 */

const puppeteer = require('puppeteer');
const { resolve } = require('node:path');
const { mkdir, readFile } = require('node:fs/promises');
const { createServer } = require('node:http');

const PORT = 4999;
const DATE = new Date().toISOString().slice(0, 10);
const OUT = resolve(__dirname, `dist/voicedub-pitch-${DATE}.pdf`);

async function startStaticServer() {
  const publicDir = resolve(__dirname, 'public');
  const server = createServer(async (req, res) => {
    try {
      const url = req.url === '/' ? '/pitch.html' : req.url.split('?')[0];
      const path = resolve(publicDir, '.' + url);
      if (!path.startsWith(publicDir)) { res.statusCode = 403; return res.end('forbidden'); }
      const data = await readFile(path);
      const ext = path.split('.').pop();
      const mime = { html: 'text/html', css: 'text/css', js: 'application/javascript', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', json: 'application/json' }[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.end(data);
    } catch (e) { res.statusCode = 404; res.end('not found'); }
  });
  await new Promise(r => server.listen(PORT, r));
  return server;
}

async function main() {
  await mkdir(resolve(__dirname, 'dist'), { recursive: true });

  const server = await startStaticServer();
  console.log(`[server] http://localhost:${PORT}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1600, deviceScaleFactor: 2 });

  await page.goto(`http://localhost:${PORT}/pitch.html`, { waitUntil: 'networkidle0', timeout: 60_000 });

  // Zastav veškeré GSAP / ScrollTrigger animace → vše musí být "final state" pro print.
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation: none !important; transition: none !important; }
      [data-scroll], .scroll-trigger, .fade-in { opacity: 1 !important; transform: none !important; }
      body { background: #fff !important; color: #111 !important; }
      .calc-controls { display: none !important; }
      .calc-output::before {
        content: "Financial model (typical Business-tier customer, 40 seats, 18 mo horizon, 5% monthly churn)";
        display: block; font-weight: 600; font-size: 14px; color: #666; margin-bottom: 8px;
      }
      .lazy, [hidden], .hidden { display: block !important; visibility: visible !important; }
      section, .slide { break-inside: avoid; page-break-inside: avoid; }
      h1, h2 { break-after: avoid; page-break-after: avoid; }
      .bg-gradient-to-r { background: linear-gradient(90deg, #6366f1, #a855f7) !important; }
    `,
  });

  await new Promise(r => setTimeout(r, 1500));

  // Nastav default hodnoty kalkulátoru (pokud existují) — aby PDF ukazovalo realistický scénář.
  await page.evaluate(() => {
    const setSlider = (id, val) => {
      const el = document.querySelector('#' + id);
      if (!el) return;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setSlider('customers', 40);
    setSlider('tier', 2);
    setSlider('churn', 5);
    setSlider('horizon', 18);
    setSlider('cac', 600);
  });

  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' },
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:8px;width:100%;padding:0 10mm;color:#999;display:flex;justify-content:space-between;">
      <span>VoiceDub — Investor Pitch — ${DATE}</span>
      <span>voicedub.ai</span>
    </div>`,
    footerTemplate: `<div style="font-size:8px;width:100%;padding:0 10mm;color:#999;display:flex;justify-content:space-between;">
      <span>Confidential — pre-seed deck</span>
      <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`,
  });

  await browser.close();
  server.close();
  console.log(`\n✅ PDF uložen: ${OUT}`);
}

main().catch(err => {
  console.error('❌ Export selhal:', err);
  process.exit(1);
});
