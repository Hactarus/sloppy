# Jeton — Legal & tax overview (BE + FR)

Status: planning document, **not legal advice**. Research date: **2026-10-10**.
Everything marked **[À VALIDER]** must be confirmed by an accountant / lawyer
before go-live. Many sources below are secondary (law-firm notes, vendor blogs)
because primary sites (finances.belgium.be, impots.gouv.fr, Légifrance) could
not be fetched directly during research; primary-source confirmation is itself
an open action.

Files in this folder: `vat-tokens.md`, `income-and-bookkeeping.md`, `tips.md`,
`cash-register-compliance.md`, `payment-regulation.md`, `consumer-and-gdpr.md`,
`contracts-todo.md`, `app-requirements.md` (numbered requirements for the
backend team — the actionable output).

## 1. Key model assumptions (from BRIEF.md)

- Guest buys **tokens** at a fixed price (default EUR 2.00) by cash / SumUp
  card / Wero / Bancontact. Tokens are spent at stands; tag holds no balance.
- **Working assumption: the organizer is the single issuer AND the single
  seller** (stands are run by the organizer, its staff or volunteers). This is
  the safest model for VAT, payment regulation and cash-register rules.
  Third-party vendors keeping their own revenue changes the analysis in three
  places (VAT: art. 30b/30c-type voucher chain; payment regulation: limited
  network; contracts) — see `vat-tokens.md` §6 and `payment-regulation.md` §4.

## 2. Decision tree

### Step 1 — Country of the event
Rates, cash-register rules and bookkeeping follow the **country where the event
takes place** (the supply of food/drink is taxed where performed). One event =
one country in the data model (BRIEF agrees). A cross-border organizer
(e.g. BE ASBL running an event in FR) is subject to **French** VAT/cash rules for
that event and may need a French VAT registration [À VALIDER].

### Step 2 — Is the organizer a VAT-liable person?

| Organizer | Belgium | France |
|---|---|---|
| **Non-profit** (ASBL/VZW; association loi 1901) | VAT applies "with or without profit motive" (art. 4 Code TVA): even one event/yr can make the ASBL liable unless the small-business franchise (< EUR 25,000 turnover, not for horeca bound to a cash register) applies. [À VALIDER] | Association is VAT-liable only if its activity is **lucrative** (4P test: product, public, price, publicity; "gestion désintéressée" fails). Franchise for accessory lucrative activities (ceiling stated EUR 81,051 for 2026) and the **6 yearly fundraising events exemption** (manifestations de bienfaisance / de soutien) may exempt buvette revenue from VAT, corporate tax and CET. [À VALIDER] |
| **Company** (SRL/SA; SAS/SARL) | Fully liable; normal VAT regime. | Fully liable. |
| **Natural person / occasional** (BE) | Occasional/hobby is not a thing for VAT if repeated supply for consideration: treated as independent; franchise < EUR 25k possible; income taxed as "divers revenus" only if truly occasional and not professional [À VALIDER]. | **Micro-entrepreneur**: VAT franchise en base (EUR 85,000 goods / EUR 37,500 services, tolerance 93,500 / 41,250 — secondary source) [À VALIDER]; income in micro-BIC. |

Output of step 2 drives: (a) whether VAT is charged/reported at all, (b) whether
French cash-software rules apply (only to VAT-liable persons recording
payments, art. 286 I 3° bis CGI), (c) whether a Belgian white-box can be
required. **The software must support a `vat_regime` per event/organizer:**
`standard` | `franchise` (no VAT charged, mention on receipt) | `exempt_event`
(FR 6-events) — the VAT category data is still captured so the accountant can
switch.

### Step 3 — Event country x organizer type quick matrix

| Event in → / Organizer ↓ | Belgium | France |
|---|---|---|
| BE ASBL, one-off party | VAT check (art. 4, franchise <25k). Horeca white box only if turnover of *meals* > EUR 25k per establishment and no relief for occasional events [À VALIDER]. Tips: only if employees. | French VAT registration likely required [À VALIDER]; cash software rules if VAT-liable. |
| BE company (catering, bar) | Standard VAT; GKS/SCE white box if horeca activity above threshold. | Same as above, French rules. |
| BE natural person | Franchise/occasional analysis. | Foreign taxable person: French rules, high risk — require an adviser. |
| FR association loi 1901 | Foreign taxable person; Belgian VAT identification likely [À VALIDER]. | 6-events exemption or franchise; if lucrative -> VAT + NF525 attestation. |
| FR company | Belgian VAT registration or representative [À VALIDER]. | Standard VAT + cash software compliance. |
| FR micro-entrepreneur | Foreign; get adviser. | Franchise en base likely; cash software rules normally not applicable if no VAT. |

## 3. What is the same everywhere (design anchors)

1. Tokens are sold without VAT only if they are **multi-purpose vouchers**;
   VAT is due at redemption per line (`vat-tokens.md`). If the event has
   effectively one VAT rate (e.g. only 21 % drinks) tokens may be **single-purpose**
   and VAT is due at top-up — the event needs a flag.
2. Tips are separate from revenue, voluntary, outside the VAT base.
3. Everything must be reconstructable by the accountant: immutable, ordered,
   hash-chained, exported (`income-and-bookkeeping.md`).
4. Unused tokens: refund policy decided and disclosed **before** sale
   (`consumer-and-gdpr.md`).
5. Payment-services: stay inside the limited-network exclusion (closed event
   area, no cash-out beyond refund of unused tokens, no wallet-to-wallet transfer)
   (`payment-regulation.md`).

## 4. Open questions to resolve first (top of the lawyer/accountant list)

1. Which organizer types will actually use Jeton? (Drives everything.)
2. Do third-party vendors keep their own sales? (Strongly prefer: no.)
3. Is breakage (unredeemed tokens) kept by the organizer or refunded? (VAT +
   consumer law.)
4. BE white-box applicability to occasional events [À VALIDER].
5. FR: attestation vs certification path for Jeton as editor
   (`cash-register-compliance.md`).

## Sources checked (all consulted 2026-10-10)
See each document. Primary sites to confirm against:
- https://finances.belgium.be/fr/entreprises/tva , https://fisconetplus.be
- https://www.impots.gouv.fr , https://bofip.impots.gouv.fr , https://www.legifrance.gouv.fr
- https://eur-lex.europa.eu , https://www.nbb.be , https://acpr.banque-france.fr
- https://www.cnil.fr , https://www.autoriteprotectiondonnees.be
