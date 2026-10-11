# Tips (fooien / pourboires)

Planning doc, not legal advice. Checked **2026-10-10**. [À VALIDER] = to confirm.

## 1. France

- **Exemption status (as of 2026-10-10):** the temporary exemption of tips from
  income tax and social contributions for employees earning up to **1.6 SMIC**
  (tips voluntarily paid by customers, cash or card) was **extended to
  31 Dec 2028** by article 5 of the **Loi de finances pour 2026 (loi n° 2026-103
  du 19 février 2026)**, per secondary source Legifiscal. There was a gap in
  early 2026 (budget adopted late); the administration instructed that card
  tips be excluded from withholding tax from 1 Jan 2026 until promulgation.
  The social-contribution exemption was voted in the PLFSS 2026. [À VALIDER on
  Légifrance: LF 2026 art. 5, LFSS 2026]
  - https://www.legifiscal.fr/actualites-fiscales/4292-plf-2026-amendement-proroge-exoneration-pourboires-2028.html
  - https://www.legifiscal.fr/impots-personnels/impot-revenu/pourboires-exoneration-ir-cotisations-sociales.html
  - https://www.brut.media/fr/articles/la-defiscalisation-des-pourboires-prolongee-jusquau-vote-du-budget-2026
  - https://hayot-expertise.fr/blog/loi-finances-2026-restauration-tva-pourboires-charges
- Conditions to design around: tip is **voluntary** (not imposed "service
  compris"), paid by customer, received by a **salaried** employee; employer
  must declare amounts (DSN) even if exempt; threshold on annual pay <= 1.6 SMIC.
  Volunteers (bénévoles) receive no wage -> distributing tips to them is not a
  salary matter but remains a grey area (benefit in kind / disguised pay?) [À VALIDER].
- Employer duties: Code du travail art. L3244-1 et seq. — tips remitted to
  the employer or a "tronc" must be paid out fully to the staff; the
  distribution key must be transparent. Keep it documented.
- VAT: a **voluntary** tip is not consideration for the supply -> **outside
  VAT base**. A mandatory/inclusive "service" amount is part of the price and
  taxable. The app's tip is voluntary and separate: OK.

## 2. Belgium

- Tips are **remuneration** (bezoldiging/rémunération) for employees: they count
  for personal income tax and for social security (RSZ/ONSS). In horeca a
  **flat-rate** remuneration scheme exists (forfaitaire bezoldiging) so actual
  tips are largely deemed covered; tips above flat-rate are "forfait only" [À VALIDER].
- A parliamentary bill (DOC 56 0740) would exempt tips from personal income
  tax and remove them from the social-security wage base, effective 1 Jan of
  the year after publication; **no confirmation it was adopted** as of
  2026-10-10 [À VALIDER].
  - https://www.lachambre.be/doc/flwb/pdf/56/0740/56K0740003.pdf
- Volunteers (vrijwilligers/volontaires): tips cannot be paid as "wage". The
  volunteer allowance regime (flat expense allowance; daily/yearly caps,
  indexed annually — ~EUR 40/day, ~EUR 1,600/year in 2025; 2026 values to
  confirm) is the only safe channel; tips distributed to volunteers count
  against these caps [À VALIDER]. Safer product design: tips fund a collective
  pot (party, donation to the ASBL), not individuals.
- VAT: voluntary tip outside the VAT base (same as FR).

## 3. Product consequences (token tips)

BRIEF decision 6: a tip is an extra token amount on an order posted to a
tips account. Legal implications:

1. **Tip is a transfer of purchasing power, not revenue.** Posting:
   debit `tag:<id>` / credit `tips:<stand|staff>` (not `stand:<id>` revenue).
2. **Payout** of tips to staff must turn tokens into euros: debit `tips:*` /
   credit `cashdesk:*` (cash payout) or bank. The organizer funds the payout
   from cash received from token sales (this is effectively a redemption of
   tokens for cash -> counts as a "refund-like" cash-out; keep it small and
   documented to preserve the limited-network posture, see `payment-regulation.md`).
3. **Tips accrued but not paid out at event close**: ledger shows liability
   `tips_payable`. Decision: pay staff / donate / retain (retention would be
   revenue of the organizer -> VAT? no; but then not a "tip"; avoid).
4. **Tip tokens redeemed by staff for goods**: allowed only through normal
   purchase (then it is a regular VAT sale paid with tip tokens). Prefer
   forbidding: tips can only be paid out as cash/bank.
5. **Pooling & distribution key**: configurable per event (equal split by
   hours worked, per stand, or direct-to-staff). Record `tip_pool_id`,
   participants (staff pseudonymous ID), shares, payout date, signature.
6. **Reporting**: tips per stand/staff/day: count, euro value; payout log;
   outstanding. FR: totals needed for DSN if staff are employees; BE: for
   payroll/social secretariat. The report must be separate from revenue and
   the VAT summary.
7. **Never mix**: a tip must not reduce the VAT base nor the price; the UI shows
   tip as separate line, optional, default 0 (no pre-ticked / no default tip —
   consumer-law "dark patterns" and "voluntary" test). Max tip cap configurable.
8. **Cash tips** given directly to staff: out of app scope; policy in staff
   agreement.
