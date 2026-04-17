# VoiceDub AI — B2B Hub & Pitch

Kompletní B2B prezentace + funkční finanční model + cinematic demo pro investorský pitch.

## Rychlý start

```bash
cd b2b-hub
npm install
node server.js
```

Otevři **http://localhost:3847/**

## Stránky

| URL | Co to je |
|-----|----------|
| `/` | Dashboard — tým, zprávy, úkoly, reporty (live DB) |
| `/pitch.html` | **🔷 Investor pitch** — Apple-style scroll, živý finanční model s 5 slidery |
| `/demo.html` | **🎬 Cinematic demo** — scroll-driven animace (GSAP + Lenis smooth-scroll) |
| `/landing.html` | B2C landing page |
| `/pricing.html` | Pricing kalkulačka vs. konkurence |
| `/api-docs.html` | REST API specifikace (plán Q3 2026) |
| `/use-cases.html` | 5 use case scénářů s SVG ilustracemi |

## Klíčové dokumenty v DB

Otevři dashboard a přepni na **Reports**:

1. **Tržní analýza Q2 2026** — globální $1.16B, CEE SAM €8-12M, konkurence
2. **Finanční model 2026-2028** — unit economics, 24-mes forecast, CAC/LTV
3. **Tech stack BOM** — Gemini, Azure TTS, Cloudflare, Veo 3.1, ceny
4. **Go-to-market strategie** — freemium → enterprise, LinkedIn ABM
5. **Kritická analýza** — rizika, oponentura předpokladů
6. **Revidovaná strategie** — e-learning first, enterprise-first pricing

## Volitelné: cinematic assety přes AI

### Generování keyframes (Nano Banana 2 / Gemini Flash Image)

Free tier: **500 req/den** bez kreditní karty.

```bash
export GEMINI_API_KEY=<klíč z aistudio.google.com/app/apikey>
node generate-keyframes.js
```

Vytvoří `public/keyframes/scene-{1..5}.png` — cinematic hero shoty pro každou scénu dema.

### Generování cinematic clipu (Veo 3.1 Lite)

Free tier: **~10 videí/den** přes AI Studio.

```bash
export GEMINI_API_KEY=<klíč>
node generate-veo-clip.js
```

Vytvoří `public/videos/hero-clip.mp4` (8 s, 720p, cinematic motion).

> **Pozn.**: Veo 3.1 Lite může být v preview-access. Pokud není v API dostupný, demo.html funguje s CSS animacemi jako fallback.

## Live finanční model (pitch.html)

Slidery:
- **Nových zákazníků / měsíc** (1-50)
- **Průměrný tier** (Starter €79 / Business €249 / Enterprise €999)
- **Churn** (1-10 % měs.)
- **Horizont** (3-36 měsíců)
- **CAC** (€50-500)

Okamžitě přepočítá: MRR, ARR, aktivní zákazníci, gross margin, LTV, LTV/CAC, payback, kumulativní zisk.

## Cinematic demo (demo.html)

5-scénový scrolljack:

1. **Upload** — pan-in na video mockup
2. **Transcribe** — živě běžící waveform + streaming captions
3. **Translate** — cyklicky rotující EN → CS/SK/PL/HU
4. **Voices** — 4 voice cards s audio-level animacemi
5. **Result** — studio vs. VoiceDub timer comparison

Technologie: GSAP 3 + ScrollTrigger + Lenis smooth-scroll (vše CDN, zdarma).

## Data model

SQLite schema (`b2b-hub.db`):
- **tasks** — úkoly s agentem, prioritou, stavem
- **messages** — týmová komunikace (announcement, challenge, response, data, update)
- **reports** — strukturované dokumenty s verzováním

## Seed scripts

```bash
node seed-data.js      # původní strategie (Q1 2026)
node seed-critic.js    # oponentura Kritika
node seed-2026.js      # aktualizace Q2 2026 s reálnými tržními daty
```

## Licencování & compliance

- **AI Act (srpen 2026)**: AI-generated obsah je označený, demo.html i pitch.html mají footer disclosure
- **GDPR**: žádná osobní data v DB (pouze agent names + markdown)
- **Free tier AI nástroje**: Gemini Flash-Lite + Flash Image, Veo 3.1 Lite, Edge TTS

## Roadmap pro vlastní produkci

1. Export `pitch.html` do PDF (Chrome print → PDF, deset slidů A4 landscape)
2. Deploy na Cloudflare Pages (statické, free)
3. Doména `voicedub.ai` + SSL
4. Analytics: PostHog free tier, 1M events/mes
