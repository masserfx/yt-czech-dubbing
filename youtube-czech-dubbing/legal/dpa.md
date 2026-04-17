# Data Processing Agreement (DPA)

**Mezi:**
- **Processor:** VoiceDub s.r.o., [IČO TBD], [sídlo TBD], ČR (dále "**Processor**")
- **Controller:** [Customer legal name], [Customer IČO / reg. č.], [Customer address] (dále "**Controller**")

**Platné od:** datum podpisu Master Service Agreement ("MSA")
**Verze:** 1.0 · 2026-04-17

---

## 1. Předmět zpracování

Tato DPA se uzavírá dle čl. 28 GDPR a upravuje zpracování osobních údajů Controllerem při využívání VoiceDub API / Chrome Extension pro AI-driven překlad a syntézu řeči.

## 2. Definice

- **Osobní údaje** — per GDPR čl. 4(1), typicky: jména, tituly, emailové adresy, hlasové záznamy v source material
- **Subprocessor** — třetí strana zapojená Processorem do zpracování (viz § 9)
- **Data Subject** — fyzická osoba, jejíž údaje jsou zpracovávány (typicky účastník firemního školení)

## 3. Role stran

| Strana | Role |
|--------|------|
| Controller (Customer) | **data controller** per čl. 4(7) GDPR — určuje účel a prostředky zpracování |
| VoiceDub | **data processor** per čl. 4(8) GDPR — zpracovává pouze podle písemných pokynů Controlleru |

## 4. Povaha a účel zpracování

- **Povaha:** automatická translation + TTS synthesis, audio storage, job tracking
- **Účel:** dodání překládaných a nadabovaných audio stop Controllerovi
- **Kategorie osobních údajů:** pracovní identifikátory zaměstnanců (jméno, pozice, tým) obsažené v source contentu; hlasové charakteristiky Azure Neural preset voices (not real people)
- **Kategorie subjektů:** zaměstnanci Controlleru + osoby viditelně identifikované v source materiálu
- **Doba uložení:** 90 dní pro completed jobs (audio v R2), 30 dní pro job logy; Controller může požádat o dřívější delete přes API (DELETE /v1/jobs/:id)

## 5. Povinnosti Processora

Processor:

1. Zpracovává osobní údaje **výhradně** podle zdokumentovaných pokynů Controlleru (submitted jobs přes API jsou pokyn per se);
2. Zajistí, že personál s přístupem k datům je vázán důvěrností;
3. Implementuje technická a organizační opatření dle čl. 32 GDPR — viz příloha A;
4. Nepoužívá data k trénování modelů (žádný customer content neopouští tenant scope pro ML training);
5. Pomáhá Controlleru plnit povinnosti vůči data subjects (čl. 12–22 GDPR) — přístup, oprava, výmaz;
6. Oznamuje data breach do **24 hodin** od zjištění (striktnější než 72h limit čl. 33 GDPR);
7. Na konci smlouvy vrátí nebo vymaže všechna osobní data do **30 dnů** (písemně potvrzeno);
8. Zpřístupní Controlleru veškeré informace nutné k prokázání compliance (audit rights, viz § 10).

## 6. Práva a povinnosti Controlleru

Controller:

1. Odpovídá za právní titul ke zpracování (čl. 6 GDPR — typicky legitimate interest pro školení zaměstnanců nebo explicit consent);
2. Informuje data subjects o zpracování dle čl. 13/14 GDPR (privacy notice musí zmínit VoiceDub jako processora);
3. Nesmí nahrávat source content obsahující sensitive data (čl. 9 GDPR: zdravotní data, biometrie, politické názory) bez předchozí písemné dohody se Processorem a DPIA;
4. Odpovídá za AUP compliance (viz [aup.md](./aup.md)).

## 7. International transfers (SCCs)

Subprocessoři Google (Gemini API) a Microsoft (Azure TTS) provozují servery v EU i USA. Pro transfers mimo EU/EEA aplikujeme:

- **EU Commission Standard Contractual Clauses** (Decision 2021/914, Modules 2+3) — součást subprocessor agreements
- **Transfer Impact Assessment** (TIA) per Schrems II — viz [legal/tia.md](./tia.md)
- **EU-US Data Privacy Framework** — Google i Microsoft jsou certifikováni (status k 2026-04-17)

Processor garantuje, že žádný transfer neproběhne do země bez adekvátního mechanismu per čl. 44–49 GDPR.

## 8. Technical and Organisational Measures (příloha A)

| Kategorie | Opatření |
|-----------|----------|
| Šifrování v tranzitu | TLS 1.3 minimum (všechny API endpointy) |
| Šifrování v klidu | R2 AES-256 server-side; D1 encryption-at-rest |
| Access control | Per-tenant API keys, Cloudflare KV s ACL; tenant_id guard v každém handleru |
| Audit logs | 365 dní retention v D1 (usage table); append-only |
| Backup & DR | R2 bucket replication CZ↔DE; RTO 4h, RPO 1h |
| Vulnerability mgmt | Dependabot + weekly npm audit + annual 3rd-party pentest |
| Incident response | On-call rotation 24/7 pro Business+ tier; runbook [internal] |
| Pseudonymizace | tenant_id je opaque UUID, ne email (per čl. 32 odst. 1 písm. a) |

## 9. Subprocessors

Processor využívá následující subprocessory k 2026-04-17. Controller s tím výslovně souhlasí podpisem této DPA. Změny (přidání / odebrání) oznamujeme **30 dní předem** emailem na kontakt uvedený v MSA. Controller má právo objektově opt-out (podstatná změna = ukončit MSA bez sankce).

| Subprocessor | Role | Lokalita zpracování | Právní režim |
|--------------|------|---------------------|--------------|
| Cloudflare, Inc. | Hosting (Workers, R2, D1, KV) | EU + USA | SCC + DPF |
| Google Ireland Ltd. (Gemini API) | Překlad | EU + USA | SCC + DPF |
| Microsoft Ireland Ltd. (Azure TTS) | TTS syntéza | EU | Intra-EU, no transfer |
| DeepL SE | Překlad (fallback) | Německo | Intra-EU |
| OpenAI Ireland Ltd. | Překlad (fallback) | EU + USA | SCC + DPF |

## 10. Audit rights

Controller má právo, maximálně 1× ročně (nebo kdykoli po materiálním incidentu), provést audit Processora:

- Prostřednictvím **nezávislého třetího auditora** (písemně notifikován 30 dní předem)
- Náklady auditu nese Controller, pokud audit neprokáže materiální non-compliance (pak Processor)
- Scope: technical a organisational measures per čl. 32 GDPR
- Processor poskytne výsledky SOC 2 Type II / ISO 27001 auditu (plánováno pro 2027), pokud jsou dostupné, jako substitute

## 11. Liability

Liability mezi stranami vychází z MSA. Pro porušení GDPR platí čl. 82 — data subject může uplatňovat nárok přímo vůči kterékoli straně; vnitřní rozdělení:

- Processor nese odpovědnost za porušení svých povinností per § 5 této DPA
- Controller nese odpovědnost za porušení svých povinností per § 6 a za legality source contentu

## 12. Ukončení

Po ukončení MSA:

- Processor vymaže veškerá customer data do 30 dní (vyjma backup, který cyklicky expiruje do 90 dní)
- Controller obdrží **export JSONL** všech non-audio metadata (job list, usage logs) do 7 dní
- Písemné potvrzení delete dle čl. 28(3)(g) GDPR

## 13. Governing law

Česká republika, Městský soud v Praze. GDPR aplikovatelné per čl. 3.

---

**Podpisy:**

Processor: _______________________ Datum: __________
           (VoiceDub s.r.o., jednatel)

Controller: _______________________ Datum: __________
            ([Customer name, role])
