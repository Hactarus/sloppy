# Income declaration & bookkeeping

Planning doc, not legal advice. Checked **2026-10-10**. [À VALIDER] = to confirm.

## 1. How event income is declared, by organizer type

| Organizer | Belgium | France |
|---|---|---|
| **Non-profit** | ASBL/VZW: income from a buvette is commercial. If the ASBL is VAT-liable (art. 4 Code TVA — an ASBL can become liable from a single event; franchise < EUR 25k otherwise) it files VAT returns. Corporate-side: ASBL pays *impôt des personnes morales* (ISOC-type light regime); commercial surplus mostly taxable only on specific income (e.g. > limits for commercial activity exceeding 'occasional') [À VALIDER]. Simplified accounting for small ASBL (accounting law: small/very small ASBL). | Association: if non-lucrative -> no VAT / IS / CET. If lucrative -> VAT + IS + CET, subject to the **franchise** (accessory lucrative activities, 2026 ceiling stated EUR 81,051 per secondary source) and the **6 manifestations de bienfaisance** exemption (receipts not counted). Declarations: CA3/CA12 (VAT) or franchise mention; form 2065 (IS) if lucrative [À VALIDER]. |
| **Company** | Revenue in the books; VAT quarterly/monthly return (grids 00-03 turnover by rate, 54 VAT due); corporate tax in annual accounts. | Revenue in books; CA3 monthly / CA12 annual; IS; bookkeeping (FEC). |
| **Natural person / micro** | BE occasional: "divers revenus" (code 1.... ) or professional income if not occasional; VAT franchise if < EUR 25k [À VALIDER]. | Micro-entrepreneur: turnover declared monthly/quarterly on autoentrepreneur.urssaf.fr; BIC vente de marchandises/restauration (abattement forfaitaire 71 % / 50 % in micro-BIC) [À VALIDER]. |

Sources (checked 2026-10-10):
- https://blog.forumforthefuture.be/fr/article/asbl-et-tva-en-2026-lassujettissement-simpose-plus-souvent-quon-ne-le-croit/32056
- https://www.legalplace.fr/guides/tva-association ; https://www.assistant-juridique.fr/activite_lucrative_franchise_impots.jsp
- https://copeps.fr/actualites/quelle-tva-pour-une-association/
- Primary to consult: https://finances.belgium.be ; https://bofip.impots.gouv.fr (BOI-IS-CHAMP-10-50-30 "6 manifestations").

## 2. What Jeton must give the accountant

Per event (and per stand, per day where relevant):

1. **Z-report** per stand per day (sequential number, opening/closing time,
   gross sales by VAT rate with net/VAT/gross, count of orders, voids, tips,
   token totals, cumulative grand total since event start).
2. **Sales by item / category / VAT rate** (euro cents; tokens).
3. **Top-ups by payment method**: cash, SumUp card (reader), SumUp online,
   Wero, Bancontact; counts, gross, fees (where known), refunds.
4. **Cash-desk reconciliation** per cash-desk session: opening float,
   expected cash (cash top-ups − cash refunds − payouts), counted cash,
   variance. Variance posts to a `cash_over_short` account (new: BRIEF lacks it;
   see app-requirements R-CASH-3).
5. **SumUp payouts reconciliation**: SumUp pays out net of fee (daily/weekly)
   to the organizer's bank account. The app imports (CSV upload) SumUp
   transaction/payout reports and matches per transaction id; shows gross,
   fee, net, payout date, unmatched items. Fees are an expense (VAT exempt on
   payment services) [À VALIDER].
6. **Wero / Bancontact settlement**: acquirer/PSP payout reports -> same
   reconciliation model (gross, fee, net, payout date).
7. **Outstanding token liability** at any timestamp (tokens x price) and at
   event close = refundable/breakage.
8. **Breakage report**: tokens expired/unclaimed, euro value, treatment chosen
   (retained income, donated, refunded later).
9. **Tips report**: per stand/staff, received, paid out, outstanding (`tips.md`).
10. **Promo tokens report**: issued/redeemed (no cash received).
11. **Journal export** (double-entry): journal id, timestamp, account, debit,
    credit, ref, hash, prev_hash -> CSV; additionally a FEC-compatible export
    (France, 18 columns per art. A47 A-1 LPF) and a generic CSV/Excel for BE
    bookkeeping software (Winbooks/Exact/Octopus: account codes mapping is
    configured by the accountant) [À VALIDER].
12. **Hash-chain verification tool** + signed "closing certificate" per day
    and per event (hash of last journal, totals).
13. **VAT summary** per period for the return: BE grids (00/01/02/03 turnover
    by rate; 54 VAT due) and FR CA3 lines (e.g. 08 20 %, 09 5.5 %, 9B 10 %) —
    a mapping table `vat_category -> return box` per country [À VALIDER].

## 3. Retention periods (software defaults)

| Data | BE | FR | Software default |
|---|---|---|---|
| Accounting books and supporting documents | 7 years (Code de droit économique art. III.88) | 10 years commercial (Code de commerce L123-22); 6 years fiscal right of communication (LPF L102 B) | **10 years** |
| VAT records | 10 years for invoices/records per Code TVA art. 60 §3 [À VALIDER] (older sources: 7) | 6 years (LPF L102 B) | 10 years |
| Cash register/POS data (FR) | — | 6 years archiving of tickets/data (art. L102 B LPF + BOI-CF-COM-10-80-20) | 10 years |
| GDPR-bound operational logs (IP, device) | — | — | 12 months (`consumer-and-gdpr.md`) |

Ledger data = fiscal data -> cannot be purged within the retention period even
if a GDPR request arrives (no personal data in ledger by design).

## 4. Period closure

- Z-report = daily closure per stand. **Event closure** closes the ledger for
  that event: no more journal rows except corrections flagged
  `post_closure_adjustment` by `admin` + `auditor` countersign.
- Hash chain per event; closure anchors final hash in a signed PDF/CSV the
  organizer stores. Optionally e-mail to accountant.

## 5. Recommended accountant workflow

1. Event close -> admin clicks "Close event" -> Z-reports and consolidated
   report generated, token liability computed.
2. Refund window (if policy) ends -> final breakage posting.
3. Import SumUp / Wero payout reports -> reconcile.
4. Export journal CSV (+FEC for FR) -> accountant books it.
5. Accountant declares VAT using the VAT summary.
