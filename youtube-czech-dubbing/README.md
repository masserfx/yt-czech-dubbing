# YouTube Czech Dubbing

Chrome Extension (MV3) pro real-time dabing anglických YouTube videí do češtiny
(+ slovenštiny / polštiny / maďarštiny). B2B backend na Cloudflare Workers s
Gemini 2.5 Flash překladem a Azure Neural TTS syntézou.

Aktuální verze: **v3.0.0-a7** (manifest `v2.1.0`). Branch: `main`.

## Komponenty

| Adresář | Obsah |
|---------|-------|
| `src/` | Chrome Extension: content scripts, service worker, sidepanel, popup |
| `api/` | Cloudflare Worker (`voicedub-api.masserfx.workers.dev`) — REST API, D1, R2, KV |
| `.github/workflows/` | CI/CD — test, build, staging deploy, release |
| `legal/` | AI Act compliance: DPA, AUP, TIA |
| `outreach/` | B2B sales materiály (email, LinkedIn) |
| `b2b-hub/` | Separátní projekt — zákaznický portál |

## Rychlý start (extension)

```bash
git clone git@github.com:masserfx/youtube-czech-dubbing.git
cd youtube-czech-dubbing
bash build.sh   # vytvoří youtube-czech-dubbing-v2.1.0.zip
```

Nainstaluj do Chrome → `chrome://extensions` → Developer mode ON → Load unpacked
a vyber kořenový adresář (nebo rozbal `.zip`). Detaily v `INSTALL.md`.

### Režimy provozu

1. **Direct mode** (default) — klient volá Gemini + Web Speech API TTS lokálně.
   Potřebuje pouze Gemini API klíč nastavený v sidepanelu.
2. **VoiceDub B2B mode** — klient volá `voicedub-api.masserfx.workers.dev`
   (unified `/v1/dub` + cached `/v1/synthesize`). Aktivace v sidepanelu:
   `VoiceDub Mode` + `API Key` (`vd_live_...` nebo `vd_test_...`).

## Rychlý start (API)

```bash
cd api
npm install
npx wrangler dev --port 8787
```

Kompletní deploy, endpoint reference a cena viz [`api/README.md`](./api/README.md).

## Endpointy (stručně)

| Metoda | Path | Účel |
|--------|------|------|
| `POST` | `/v1/dub` | Překlad + syntéza v jednom volání (quick text / async URL) |
| `POST` | `/v1/synthesize` | TTS-only s R2 cache (transcript mode) |
| `GET`  | `/v1/voices?lang=cs` | Seznam Azure hlasů |
| `GET`  | `/v1/jobs/{id}` | Status async úlohy |
| `GET`  | `/v1/audio/{tenant}/{file}` | Audio download (per-tenant ACL) |
| `GET`  | `/v1/usage?period=today` | Tenant statistiky + rate-limit stav |
| `GET`  | `/v1/health` | Public health check |

## CI/CD

| Workflow | Trigger | Akce |
|----------|---------|------|
| `test-api.yml` | push/PR → `api/**` | `node --test` (26 testů) |
| `build-extension.yml` | push/PR → `src/**`, `manifest.json` | `bash build.sh` + upload artifact |
| `deploy-api-staging.yml` | push → `main`, paths `api/**` | D1 migrace + `wrangler deploy` + secret publish (env `staging`) |
| `release.yml` | tag `v*.*.*` | Draft GitHub Release s `.zip` |

Required GitHub secrets: `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `GEMINI_API_KEY`,
`DEEPL_API_KEY`, `OPENAI_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`,
`API_SIGNING_SECRET`.

## Architektura

```
┌──────────────────────┐       ┌──────────────────────────┐
│  Chrome Extension    │       │ Cloudflare Worker (edge) │
│  ─────────────────── │ HTTPS │  ──────────────────────  │
│  content.js          │──────►│  /v1/dub                 │
│  dubbing-controller  │       │  /v1/synthesize (cache)  │
│  voicedub-client     │       │  /v1/usage               │
│  sidepanel           │◄──────│                          │
│  background (SW)     │       │  D1 jobs · R2 audio · KV │
└──────────────────────┘       └──────────┬───────────────┘
                                          │
                               ┌──────────▼─────────┐
                               │ Gemini 2.5 Flash   │
                               │ DeepL / OpenAI     │ fallback
                               │ Azure Neural TTS   │
                               └────────────────────┘
```

Klíčová rozhodnutí:
- **Transcript mode** = primární cesta. Čte YouTube transcript panel, překládá
  přes Gemini, synchronizuje TTS s timestamp segments. `dubbing-controller.js`.
- **DOM caption mode** = fallback když transcript chybí. Sentence buffer +
  stale-skip guard + 1.25× playback rate proti desync.
- **AI Act čl. 50** (effective 2026-08-02) = session-level disclosure banner
  na klientu + per-segment `disable_watermark: true` (per-věta watermark by
  v live dubbingu byl absurdní).
- **Multi-provider fallback** = Gemini → DeepL → OpenAI na 429/5xx.
- **R2 TTS cache** = SHA-256 hash `voice|speed|pitch|wm|text`, opakované věty
  neúčtovány u Azure.

## Legal

- `legal/dpa.md` — Data Processing Agreement (GDPR čl. 28)
- `legal/aup.md` — Acceptable Use Policy
- `legal/tia.md` — Transfer Impact Assessment (EU → non-EU data flows)
- `legal/README.md` — index

## Rozšíření a PR

- Default branch: `main`. Feature branche: `feat/<popis>` nebo `release/<verze>`.
- `claude-progress.md` track pokračujících úkolů mezi session.
- Před commitem: `cd api && npm test` + `bash build.sh`.
- Chrome Web Store publish je ruční krok (task #25) — upload `.zip` přes
  Developer Dashboard.

## Kontakt

- Repo: <https://github.com/masserfx/youtube-czech-dubbing>
- API produkční endpoint: `voicedub-api.masserfx.workers.dev`
- Issues: GitHub Issues
