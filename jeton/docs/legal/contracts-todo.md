# Contracts & legal documents to draft later

Planning doc. Each item: purpose, outline, who signs, and links to software
requirements (`app-requirements.md`, IDs "R-..."). All templates need a
lawyer's review. Languages: FR/NL/EN (BE), FR/EN (FR).

## 1. Guest terms of sale / CGV / algemene voorwaarden (tokens)
**Purpose:** B2C terms for buying/using tokens. **Signed by:** accepted by sale
(sign at cashdesk + balance page + receipt).
Outline: 1 Organizer identity (name, address, ASBL/company no., VAT no.,
contact). 2 Definition of token and tag; price per token; items priced in
tokens with euro equivalents. 3 Where tokens are valid (this event only; no
transfers). 4 Payment methods; no surcharge. 5 Refund/expiry policy
(`consumer-and-gdpr.md` §1: chosen option). 6 Lost/damaged tag. 7 Offline
spending limits (blocked/flagged balance). 8 Tips: voluntary. 9 Alcohol age
rules. 10 Liability, disputes, mediation, governing law, consumer rights.
11 Privacy pointer. 12 Changes of terms.
Feeds: R-CONS-1..4.

## 2. Vendor / stand agreement with token settlement
**Purpose:** needed only if stands are third-party. **Signed by:** organizer +
vendor. Outline: scope and pitches; goods/services allowed; prices set by
organizer; VAT roles (who is the supplier; voucher chain, `vat-tokens.md` §6);
settlement (tokens redeemed x token value less commission/fee; timing;
reconciliation statement from Z-reports; dispute window); self-billing clause;
allergen/hygiene (FASFC/AFSCA, DGCCRF) responsibilities; alcohol licence;
cash-register obligations of vendor (BE GKS / FR software); insurance;
termination; no right to hold funds; audit rights.
Feeds: R-VEND-1..3.

## 3. Staff / volunteer agreement
**Purpose:** roles, PIN confidentiality, cash handling, tips rule, data
protection. **Signed by:** organizer + staff/volunteer. Outline: role &
permissions (admin/cashier/vendor/auditor); device & PIN rules; cash float
responsibility (variance policy); tips policy (pooling, no direct tipping into
pockets, distribution key); volunteer status (BE volunteer law 3 July 2005 +
allowance caps; FR bénévolat; employees vs students vs flexi-job in BE) [À
VALIDER]; confidentiality; GDPR notice; code of conduct (alcohol, minors).
Feeds: R-STAFF-1..3, R-TIP-*.

## 4. SumUp / Wero / Bancontact merchant setup checklist
**Purpose:** merchant contracts in the organizer's name. Checklist:
legal entity & bank account (IBAN) in the organizer's name; KYC docs (statutes,
UBO, ID); SumUp account (Solo readers, online checkout) with pricing quoted
(BE ~1.69 % / FR ~1.75 % to be confirmed); payout schedule; Bancontact Company
/ Wero merchant onboarding (via Bancontact Company or acquirer; QR on
terminal); test transactions before event; chargeback process; reconciliation
exports format; connectivity plan (4G/Wi-Fi backup). No Jeton ownership of
accounts. Feeds: R-PAY-*.

## 5. Venue / site agreement clauses
Clauses: permission to sell food/alcohol; municipal/prefecture event & alcohol
temporary licence (BE: buvette permit; FR: licence temporaire de débit de
boissons, art. L3334-2 CSP) [À VALIDER]; connectivity/power; cash storage;
security; capacity; waste; insurance; sound; hygiene authority; VAT/tax
invoicing of rent; data/CCTV; force majeure (event cancelled -> refund of
tokens: policy!). Feeds: event cancellation flow R-CONS-5.

## 6. Data Processing Agreement (hosting / Jeton operator)
Art. 28 GDPR outline: subject-matter, duration, nature and purpose; categories
of data (tag ids, order history, staff identifiers, logs); controller
instructions; confidentiality; security measures (Annex: encryption, access
control, backup, hash-chain integrity); sub-processors list (cloud host, DNS,
e-mail); assistance with data-subject rights; breach notice within 24 h;
audit; deletion/return at end; EU data location. Feeds: R-GDPR-*.

## 7. Privacy notice
One page, FR/NL/EN: controller, data, purposes, bases, retention (ledger 10
years; logs 12 months), rights, contact, authority (CNIL/APD). Also staff
version. Feeds: R-GDPR-1,2.

## 8. Software editor documents (France)
- **Attestation individuelle de conformité** (editor -> user) template
  stating compliance with the four conditions + software name/version + hash
  of the build; maintain a *conformity dossier* (see `cash-register-compliance.md`).
- Software licence terms (organizer).
- Optional: NF525/LNE certification project budget if law requires.

## 9. Other
- Event insurance (RC), cash-in-transit.
- Tip-pool policy (can be part of §3).
- Accountant engagement letter (VAT/accounting scope, exports).
- Refund request form.
- Incident/breach register (GDPR).

## Requirements fed back to the software
See `app-requirements.md`. Notably: configurable refund/expiry policy,
T&C acceptance record (version), organizer legal data on receipts, vendor
statements, staff roles/tips pools, DPA-related logs retention.
