# VAT on tokens (BE + FR)

Planning doc, not legal advice. Checked **2026-10-10**. [À VALIDER] = to confirm.

## 1. Legal basis

EU Directive **2016/1065** (art. 30a–30b of Directive 2006/112/EC) on vouchers:
- **Single-purpose voucher (SPV)**: place of supply AND VAT due are known at
  issue -> VAT due when the voucher is **sold/transferred** (and not again at
  redemption).
- **Multi-purpose voucher (MPV)**: otherwise -> **no VAT at issue/top-up; VAT
  due when goods/services are actually supplied in exchange for the voucher.**
- Recital 12: the directive does **not** address unredeemed MPVs where the seller
  keeps the money (breakage) — member states/general VAT principles apply.
- Belgium: law of 11 Feb 2019 (vouchers issued after 31 Dec 2018) +
  administrative FAQ 7 Dec 2018.
- France: art. 256 septies CGI (ex-256 ter) + BOFiP BOI-TVA-CHAMP-10-10-10 (vouchers).
  BOFiP says a card valid in shops all at the same rate and same country can be a
  single-purpose voucher.

Sources:
- https://eur-lex.europa.eu/eli/dir/2016/1065/oj/eng (checked 2026-10-10)
- https://www.lexgo.be/en/news-and-articles/3829-new-eu-directive-on-vat-and-vouchers
- https://www.tiberghien.com/en/628/new-eu-directive-on-vat-and-vouchers (BE: never used -> no VAT due)
- https://www.legifiscal.fr/actualites-fiscales/2188-tva-traitement-bons.html and https://bofip.impots.gouv.fr (BOI-TVA-CHAMP-10-10-10)

## 2. Qualification of Jeton tokens

| Situation | Qualification | VAT timing |
|---|---|---|
| Event sells drinks 21 % + food 12 % + merch 21 % (BE) or 10 % / 20 % / 5.5 % (FR) | **MPV** (rates not all known at top-up) | At redemption, per order line |
| Event where *every* possible purchase has the same rate (e.g. only alcohol-free drinks at 10 % FR) | Possibly **SPV** | At top-up (!) |
| Tokens also accepted by third-party vendors | MPV chain (see §6) + payment-law risk | Complex |

Consequence for software: **per event flag `voucher_type = multi | single`**.
Default `multi` (BRIEF decision 5). If `single`, VAT must be booked at top-up
and redemption must not generate VAT again. Recommend: the admin UI warns when
all items of an event share one VAT category. Most events (mixed menu +
alcohol) are MPV.

Not e-money: BOFiP lists "monnaie électronique" and meal vouchers as outside the
"bon" definition (so the VAT voucher regime is for vouchers, not e-money). The
legal qualification (voucher vs e-money) is covered in `payment-regulation.md`;
the design goal is to be a voucher, not e-money.

## 3. Rates by country (as of 2026-10-10) — VAT categories mapping

### Belgium (event in BE)
| App VAT category | Rate | Notes |
|---|---|---|
| `BE_FOOD_ONSITE` (meals served for on-site consumption; restaurant/catering service) | **12 %** | Restaurant & catering services at 12 % (not takeaway). |
| `BE_FOOD_TAKEAWAY` (cold/hot food as goods, takeaway) | **6 %** | The planned increase of takeaway meals 6 % -> 12 % from 1 Mar 2026 was **withdrawn after Council of State opinion** (EY update). Re-check before each event. [À VALIDER] |
| `BE_DRINK_SOFT_ONSITE` (non-alcoholic drink served as part of restaurant/catering service) | **21 %** | A reduction to 12 % was announced then **withdrawn until further notice** (EY). [À VALIDER] — status uncertain, sources conflict. |
| `BE_DRINK_SOFT_GOODS` (sealed non-alcoholic drink sold as goods, e.g. bottle of water takeaway) | **6 %** | Goods rate for water/soft drinks. [À VALIDER] |
| `BE_ALCOHOL` (beer > 0.5 % ABV, other drinks > 1.2 % ABV) | **21 %** | On site or takeaway. |
| `BE_ICECREAM_ONSITE` | **12 %** if served as restaurant service, **6 %** if sold as takeaway goods | Ice-cream stand serving cones to walk away: typically goods at 6 % [À VALIDER]. |
| `BE_MERCH` | **21 %** | |
| `BE_ZERO` | 0 % | Reserve; for exempt activities. |

Sources: https://cm.twobirds.com/en/insights/2026/belgium/belgium-increases-vat-in-the-hospitality,-food-and-leisure-sectors-as-of-march-2026 ;
https://www.ey.com/en_be/technical/tax/tax-alerts/2026/belgian-vat-rates-changes-coming-up-recent-clarifications-and-updates ;
https://www.accountable.eu/en-be/blog/vat-rates-in-belgium/ (all checked 2026-10-10; secondary).

### France (event in FR, mainland)
| App VAT category | Rate | Notes |
|---|---|---|
| `FR_FOOD_ONSITE` (food served/eaten on site, or sold ready for immediate consumption) | **10 %** | Includes takeaway of ready-to-eat items "à consommer immédiatement". |
| `FR_FOOD_PACKAGED` (packaged food not for immediate consumption) | **5.5 %** | |
| `FR_DRINK_SOFT_IMMEDIATE` (non-alcoholic served in glass/cup) | **10 %** | |
| `FR_DRINK_SOFT_PACKAGED` (sealed bottle/can taken away for later) | **5.5 %** | Sources conflict between 5.5 % and 10 % for sealed bottles; majority 5.5 %. [À VALIDER] |
| `FR_ALCOHOL` | **20 %** | On site or takeaway (10 % on-site only in Corsica — out of scope). |
| `FR_ICECREAM_IMMEDIATE` | **10 %** (cone/cup eaten now) | Prepackaged ice cream -> 5.5 % [À VALIDER]. |
| `FR_MERCH` | **20 %** | |
| `FR_EXEMPT` | 0 % / "TVA non applicable" | 6-events exemption, franchise. |

Sources: https://hayot-expertise.fr/blog/loi-finances-2026-restauration-tva-pourboires-charges ;
https://propulsebyca.fr/tva/restauration ; https://www.swim.legal/blog/tva-restauration-taux-applicable (secondary, checked 2026-10-10).
Primary: BOFiP BOI-TVA-LIQ-30-20-10 (restauration) — **to consult** [À VALIDER].

**Implementation note:** the rate table must be data, keyed `(country, category, valid_from)` — Belgium has changed rates repeatedly in 2026. The event snapshots the rate at event start; admin can override only before the first sale (otherwise: reversal + correction).

## 4. VAT computation rules for the app

- Item prices are **VAT-inclusive in tokens** (token = EUR 2.00 by default;
  price in tokens may be fractional? BRIEF says integer tokens -> keep integer;
  see `app-requirements.md` R-VAT-3 for sub-token pricing).
- Per order: gross euro value = tokens x token_price_cents. Group lines by VAT
  rate; per rate: `vat = round_half_up(gross * rate / (100 + rate))` computed
  **per rate group per order** (not per line) — to be approved by accountant [À VALIDER].
- Tip lines are **outside** VAT base.
- Promo (free) tokens: sales paid with promo tokens still generate a stand
  supply. VAT base for supplies financed by free tokens is debatable (free gift
  by the organizer vs. consideration) [À VALIDER]. Software must report them
  separately so the accountant can decide.
- Voids/refunds of orders generate negative VAT via reversal entries.

## 5. Unused tokens (breakage) & refunds

- **MPV, never redeemed, organizer keeps cash:** no supply occurs -> **no VAT due
  on the breakage** (BE commentary: "if never used, VAT never becomes due").
  Source: Tiberghien above. FR: no supply, no VAT; but income is recognized
  (for corporate tax) when the right expires/event closes — accountant to book
  as other income [À VALIDER].
- **Refund of unused tokens:** money returned, no VAT effect (no supply took
  place). Booking: debit `tag:<id>` / credit `refunds` and cash/bank.
- **Do not** issue VAT invoices/credit notes for token top-ups. Receipts for
  top-ups say "bon multi-usage / meervoudige bon — pas de TVA à l'émission".
- Software must **never** treat breakage as VAT revenue. The `breakage` account
  must be reported as "non-VAT income, closing balance of outstanding tokens"
  with count and euro value.
- Edge: if the organizer later refuses refunds + keeps breakage, consumer law
  conditions apply (`consumer-and-gdpr.md`).

## 6. Third-party vendors (not the base case)

If vendors are separate taxable persons selling for their own account against
tokens: under art. 30b the vendor's taxable amount = consideration received for
the voucher (minus VAT); any intermediary (organizer) distributing the voucher
for another supplier is deemed to supply an own service (commission). Requires
per-vendor settlement reports and VAT breakdown **per vendor**. The ledger
(stand accounts + settlement) supports this, but legal treatment, invoicing
(self-billing) and payment-law risk all need an adviser. Recommendation: for
v1, forbid in the product ("all stands belong to the organizer entity") or
mark `vendor_entity_id` and produce vendor statements as an advanced option.
[À VALIDER]

## 7. Receipts / invoices

- B2C: a receipt (ticket) with VAT breakdown on demand; not an invoice.
- B2B request (BE) / invoice obligation (FR when customer asks, B2B): rare at
  events; support "invoice on request" manual process in `contracts-todo.md`.
- French e-invoicing/e-reporting reform (from 1 Sept 2026 for large/mid
  companies receiving; 2027 for SMEs issuing) concerns B2B; B2C sales may need
  **e-reporting** of aggregated transactions [À VALIDER]. The CSV export should
  contain daily totals by VAT rate to feed it.
  Source: https://www.legifiscal.fr (e-invoicing, vouchers case 25) — secondary.
