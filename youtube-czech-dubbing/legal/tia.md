# Transfer Impact Assessment (TIA) — Schrems II

**Processor:** VoiceDub s.r.o.
**Verze:** 1.0 · 2026-04-17
**Scope:** transfers customer personal data z EU/EEA do USA přes subprocessory Google (Gemini), Microsoft (Azure), OpenAI, Cloudflare

---

## 1. Účel TIA

Per CJEU Schrems II (C-311/18), samotné SCCs nejsou dostatečné — controller/processor musí posoudit, zda úroveň ochrany v destination country odpovídá EU standardu. Tato TIA dokumentuje analýzu a supplementary measures.

## 2. Destination country: USA

### 2.1 Legal framework (2026)

- **EU-US Data Privacy Framework (DPF)** — účinný od 2023-07-10, certifikovaní DPF-providers mají adequacy decision per čl. 45 GDPR
- **FISA 702 + EO 12333** — vládní access k datům; limitováno DPF mechanismem (redress via Data Protection Review Court)
- **Schrems III pending** — noyb.eu žaloba, ale DPF platný dokud CJEU nerozhodne jinak

### 2.2 Status subprocessorů

| Subprocessor | DPF certifikován | Server location options | Opt-out EU-only |
|--------------|------------------|-------------------------|-----------------|
| Cloudflare | ✅ (Cloudflare, Inc.) | EU regions available | Ano (Workers paid plan) |
| Google (Gemini) | ✅ (Google LLC) | us-central (default) + eu-west | **Není** pro Gemini API v0.1 |
| Microsoft (Azure TTS) | ✅ (Microsoft Corp) | westeurope region locked | Ano — naše default |
| OpenAI | ✅ (OpenAI, LLC) | us-central | Zatím ne, roadmap Q3 2026 |
| DeepL | n/a (Germany-based) | DE-only | n/a |

## 3. Risk analysis

### 3.1 Data categories at transfer

- **Nízké riziko:** job metadata (tenant_id, lang codes, timestamps) — pseudonymizováno
- **Střední riziko:** source text snippets (firemní školení — typicky není sensitive per čl. 9)
- **Vyšší riziko:** embedded jména zaměstnanců v source contentu

Žádná special category data per čl. 9 GDPR se nesmí přenášet (zakázáno v AUP § 2.3, technicky enforcement přes content filter — roadmap v0.2).

### 3.2 Likelihood government access

Per Microsoft Transparency Report Q4 2025: < 0.01 % enterprise accounts requested per rok.
Pro customer contentu zpracovávaný přes Gemini API: Google zveřejňuje aggregate data ve Transparency Report; pro enterprise API customers je likelihood < 0.001 %.

**Závěr:** likelihood is **low**, impact is **medium** (firemní, ne citlivá data).

## 4. Supplementary measures

### 4.1 Technické

1. **Minimalizace:** pouze necessary text segmenty se posílají na LLM — audio neprochází Gemini, jen Azure
2. **Pseudonymizace:** tenant_id je opaque UUID, ne identifikátor (čl. 4(5))
3. **End-to-end encryption in transit:** TLS 1.3, pinned certs, HSTS preload
4. **DeepL fallback:** Enterprise tier může vynutit EU-only translator (`force_eu_only: true` v API) — Gemini + OpenAI skip
5. **Data residency option:** Business+ tier může vybrat `region: 'eu-only'` — R2 locked na EU, Gemini skipped, jen DeepL + Azure EU

### 4.2 Organizační

1. **Vendor due diligence:** annual review DPF status + transparency reports
2. **Incident notification:** 24h SLA (striktnější než GDPR 72h)
3. **Employee training:** annual GDPR + Schrems II refresher
4. **Sub-processor notification:** 30-day advance notice pro material changes

### 4.3 Smluvní

1. **SCCs Module 2 (Controller-to-Processor)** s každým US subprocessorem
2. **Government Access Disclosure Policy:** zveřejníme všechny government access requests v annual report (bez narušení gag orders)
3. **Data subject redress:** [privacy@voicedub.ai](mailto:privacy@voicedub.ai) s 30-day SLA

## 5. Závěr

Transfer do USA je **legitimní** za podmínek:

- Subprocessor je DPF-certifikován (✅ ověřeno pro všechny v § 2.2)
- Aplikujeme supplementary measures per § 4
- Customer dostane opt-out `region: 'eu-only'` v Business+ tiers

Pro customer v regulovaném sektoru (banking, healthcare, government), doporučujeme **explicitně zvolit `eu-only`** a uzavřít specifickou dodatečnou smlouvu (Data Residency Addendum).

## 6. Review cadence

TIA reviewujeme:
- **Annually** (každé výročí verze)
- Po materiálních právních změnách (Schrems III rozsudek, DPF revoke, nové enforcement EDPB)
- Po přidání nového subprocessora

## 7. Approvals

| Role | Jméno | Podpis | Datum |
|------|-------|--------|-------|
| CEO VoiceDub | TBD | | |
| DPO (external, pověřený) | TBD | | |
| Legal counsel | TBD | | |
