# Cash-register / POS compliance (BE GKS-SCE, FR anti-fraud software)

Planning doc, not legal advice. Checked **2026-10-10**. [À VALIDER] = to confirm.

## 1. Belgium — Geregistreerd kassasysteem (GKS) / Système de caisse enregistreuse (SCE), "white box"

- Applies to **horeca** operators (restaurants, caterers, cafés, also
  pop-up restaurants and, per Securex, temporary restaurants during
  festivals/events) whose **turnover from meals served on site exceeds
  EUR 25,000 per establishment per year** (takeaway, delivery and drinks are
  excluded from the threshold calculation). Fines for lack of compliant system
  (draft figures): EUR 1,500 / 3,000 / 5,000 for successive infringements
  [À VALIDER]. Council of State confirmed the threshold in 2018.
  - https://news.belgium.be (several FPS Finance releases), https://www.securex.be/fr/lex4you/employeur/actualites/la-caisse-blanche-lors-des-festivals-et-evenements
  - https://copeps.fr/actualites/caisse-enregistreuse-horeca-spf-finances/
- Technical: a **Fiscal Data Module (FDM / "white box")** certified by FPS
  Finance, connected to the POS, signs each ticket; **GKS 2.0** moves to
  automatic transmission to the tax administration; deadlines for the
  transition: tolerance until **31 Mar 2026** with stricter control from Apr 2026
  in one source, **30 Jun 2026** in another; final dates [À VALIDER] (see
  https://www.fiscal-requirements.com/news/5318-belgium-defines-final-deadlines-for-hospitality-sector-fiscal-cash-register-upgrades
  and https://www.fiskaly.com/blog/gks-2-0-fdm-requirements-belgium). Another
  source indicates 1 July 2028 for other establishments [À VALIDER].
- **Applicability to Jeton events:**
  - A drinks-only bar: no obligation (drinks excluded from the threshold).
  - A meal service (sit-down dinner, hot food) with > EUR 25k meals turnover
    by an operator in horeca: obligation. A one-off charity dinner raising
    < EUR 25k: likely out of scope; occasional events relief (feasts "eetfestijn")
    historically recognized [À VALIDER — could not locate official text].
  - Anyone covered would need a certified GKS/FDM; **Jeton as a software is not
    certified** and certifying (hardware white box, certified registration
    system, installation by registered installer) is out of scope for v1.
- **Decision for v1:** Jeton declares in its docs that it is **not a
  certified GKS**. Organizers who exceed the threshold must use a certified
  Belgian system for meal sales (or ask FPS Finance for an event-specific
  arrangement). The product still produces receipts that are not "fiscal
  tickets". Add an event-level flag `be_gks_required` that blocks Jeton's
  "sales receipt" labelling and shows a warning. [À VALIDER]
- The BE "KB 2020-?" rule: sales through electronic payment tokens/vouchers may
  still require registration of the underlying sale in the GKS, meaning each
  redemption (meal sold for tokens) is a registered sale; top-ups are not.

## 2. France — Anti-fraud cash software (art. 286 I 3° bis CGI)

- Applies to **VAT-liable persons (assujettis) who record customer payments
  using a software or POS system** (caisse). Not applicable to persons not
  subject to VAT (including non-lucrative associations and franchise-en-base
  operators) — [À VALIDER] case by case (franchise en base exempt as non-assujettis for
  the purpose; micro-entrepreneurs are excluded if never VAT-liable).
- Four conditions: **inaltérabilité, sécurisation, conservation, archivage**
  of data (ticket-level data, sequential numbering, grand totals, period
  closures (daily, monthly, annual), traceability of cancellations/corrections,
  prohibition of data modification, archives).
- Proof of compliance: either **certification** by an accredited body (NF525
  via AFNOR, or LNE certificate) or the editor's **individual attestation**.
  Fine: EUR 7,500 per non-compliant system (and VAT recovery risk) — secondary
  sources [À VALIDER].
- **Law change timeline (key uncertainty):**
  - LF 2025 (law of 15 Feb 2025, art. 105) removed the editor's self-attestation:
    only accredited-body certification would be valid; effective date postponed
    to **31 Aug 2026** (tolerance; sources: Fiducial, InfoCert).
  - LF 2026 (loi n° 2026-103 of 19 Feb 2026, art. 125 per BoostMyShop) is
    reported to have **cancelled that removal**, so both certification and
    attestation are valid again. One vendor (myPOS) still claims certification
    mandatory from 1 Sept 2026, contradicted by others (likely confusing with
    e-invoicing on 1 Sept 2026). **Net position: attestation by the editor is
    likely still valid; confirm on Légifrance/BOFiP.** [À VALIDER]
  - https://www.fiducial.fr/Articles-et-dossiers/Suppression-de-l-attestation-de-conformite-des-logiciels-et-systemes-de-caisse
  - https://www.boostmyshop.com/en/resources/articles/nf525-logiciel-de-caisse-ecommerce
  - https://infocert.org/wp-content/uploads/2025/03/FLYER-OBLIGATION-CERTIFICATION-NF525-FR-1.pdf
  - https://www.mypos.com/fr-fr/blog/guide-entreprise/logiciels-de-caisse-certifies (conflicting)
  - https://independant.io/norme-nf525/ ; https://questions.assemblee-nationale.fr/dyn/17/questions/QANR5L17QE7756.pdf
  - Primary: BOI-TVA-DECLA-30-10-30 (BOFiP, "logiciels de caisse") — to consult.
- **Decision for v1 (France):** Jeton is designed to be *compliant*, and the
  editor (the Jeton owner) issues an **individual attestation** per
  organizer/version (template in `contracts-todo.md`), without NF525 certification.
  If law reverts to mandatory certification, budget for NF525/LNE (several
  thousand EUR) as a project. [À VALIDER]

## 3. What the app must implement (derived requirements)

Summarized from the French conditions + BE audit needs; all feed `app-requirements.md`:

| Principle | Implementation |
|---|---|
| Inalterability | Append-only ledger; DB triggers/permissions forbid UPDATE/DELETE; corrections by reversal only; each journal row carries `hash = SHA-256(canonical(row) \|\| prev_hash)` per event; chain verification tool. |
| Sequential numbering | Gapless per-event, per-stand **receipt number** and **Z number** (separate from UUIDv7 ids); gaps detectable. BRIEF's UUID alone is not sufficient: add `seq_no`. |
| Grand totals (totaux perpétuels) | Per stand: running cumulative gross total (since event start, and an absolute total across events for the organizer) stored in each Z-report and each receipt row. |
| Period closures | Daily Z (per stand), event close; monthly/annual closure for organizers running permanent shops [N/A for single events, store anyway]. |
| Traceability of cancellations | Voids = reversal journal with reason code + user. Reprint of receipt marked "DUPLICATA / COPY" and logged. |
| Training mode | If a training mode exists it must be separate (marked "TEST", not in ledger totals) or disabled in production. |
| Security | Signed hash chain; keys held server-side; HSM not required; time from server UTC; device clock mismatch logged. |
| Archive | Closure produces an immutable archive (CSV + hash + signature) retained >= 10 years; export format open. |
| Documentation | Keep a "dossier de conformité" (architecture, hash algorithm, procedures) to support the attestation. |
| Traceability of software version | Each journal row stores `app_version`, `device_id`, `staff_id`. |

Receipts: each order produces a ticket with: event/organizer legal name + VAT
no. (if liable), date/time, receipt number, lines with VAT category, total by
VAT rate, tip separate, payment = "Jetons". Top-up receipt states "bon
multi-usage" (no VAT).
