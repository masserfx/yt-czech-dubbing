# VoiceDub — Legal Pack

Tato složka obsahuje smluvní a compliance dokumenty nezbytné před prvním pilotem.
Všechno jsou **drafts v1.0** a musí projít review licencovaným právníkem (CZ + EU GDPR) před podpisem.

## Struktura

| Soubor | Účel | Kdy podepsat |
|--------|------|--------------|
| [`aup.md`](./aup.md) | Acceptable Use Policy — co zákazník NESMÍ dělat | Součást TOS, akceptováno přes API activation |
| [`dpa.md`](./dpa.md) | Data Processing Agreement (GDPR čl. 28) | Při podpisu MSA s enterprise customerem |
| [`tia.md`](./tia.md) | Transfer Impact Assessment (Schrems II) | Interní compliance, poskytnuto customerovi na vyžádání |

## Roadmap dalších dokumentů (pre-series-A)

- [ ] **MSA (Master Service Agreement)** — hlavní commercial contract, pricing, SLA, liability caps
- [ ] **TOS (Terms of Service)** — click-through pro self-service tiers (Free, Starter, Business)
- [ ] **Privacy Policy** — GDPR čl. 13/14 disclosures pro voicedub.ai
- [ ] **AI-Content Disclosure Undertaking** — Enterprise-only, pokud disable watermark
- [ ] **Data Residency Addendum** — pro regulované sektory (banking, healthcare)
- [ ] **Security Whitepaper** — technical controls, pro vendor security questionnaires

## Workflow pro první pilot

```
1. NDA (mutual, 3-page standard) ─────────► podpis při discovery call
2. Pilot Agreement (1 page, 30-day paid POC) ► podpis po voice demo
3. DPA (tento repo)                          ► podpis před první job
4. AUP (akceptováno click-through)           ► automatic při activation
5. TIA (informativní, poskytnuto read-only)  ► součást onboardingu
```

## Kontakty

- **DPO / compliance:** privacy@voicedub.ai
- **Abuse reporting:** abuse@voicedub.ai (24h SLA)
- **Legal counsel:** TBD (doporučený: partner-level při CZ law firm se EU GDPR specializací)

## Disclaimer

Tyto dokumenty jsou **drafts napsané pro interní pre-launch review**. NESMÍ být použity k podpisu s customerem bez právní review. Použití na vlastní riziko.
