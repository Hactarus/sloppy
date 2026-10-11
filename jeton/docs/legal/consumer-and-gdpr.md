# Consumer rules (token sales, refunds, expiry) and GDPR

Planning doc, not legal advice. Checked **2026-10-10**. [À VALIDER] = to confirm.
Few primary sources could be fetched; legal articles cited from knowledge and
must be verified.

## 1. Consumer law for token sales

Face-to-face sales at the event: no distance-selling right of withdrawal.
Online top-up (SumUp online checkout / remote purchase): distance contract.
- Right of withdrawal (14 days) — EU Dir. 2011/83: **exception for leisure
  services for a specific date** (BE CDE art. VI.53; FR C. conso L221-28 12°) and
  for digital content once performance begins; tokens bought for a specific
  event date plausibly fall within the leisure exception, but an online
  pre-purchase of tokens before the event is safer treated as "withdrawable until
  event start" [À VALIDER]. Software: online pre-sale (if ever added) needs
  withdrawal handling; v1 sells on site only.
- **Unfair terms**: a blanket "tokens are non-refundable and expire at the end of
  the event" clause may be challenged as unfair/unbalanced in B2C (BE CDE
  art. VI.82 ff.; FR C. conso L212-1, abusive clauses list) [À VALIDER].
  Industry practice for festivals is "non-refundable after the event, refundable
  at the refund desk during the event / within X days". Decide one of:
  1. **Refund on request** (during event + N days, to original payment method,
     or by cash if paid cash up to event end) — lowest legal risk, but moves
     closer to e-money redeemability (`payment-regulation.md`) and removes
     breakage income.
  2. **Non-refundable, valid only during the event**, clearly disclosed before
     purchase (sign at the cashdesk, receipt, public balance page, T&C) —
     common, moderate risk; allow refund of small leftover amounts on request
     as goodwill.
  3. **Donation** of leftover tokens to a cause (opt-in at the end).
  Recommendation: option 1 for amounts above a small threshold (e.g. > 3
  tokens) + option 2 for the rest, clearly displayed. Gentle design pillar
  (never feel cheated) fits. [À VALIDER by lawyer]
- **Price display**: token price, per-item price in tokens AND euro (VAT incl.),
  allergen info (EU 1169/2011 — Reg. FIC; BE/FR allergen display for
  non-prepacked food), alcohol sale rules (BE: no spirits < 18, beer/wine
  16+ ; FR: 18+ for all alcohol) -> alcohol age check flag on items.
- **Information to display at the event** (cashdesk and on receipts/page):
  organizer legal name + address + company/ASBL number + VAT no.; token price;
  refund/expiry policy; how to check balance; complaint contact; ODR/mediation
  info (BE: Service de médiation pour le consommateur; FR: médiateur de la
  consommation — a mediator must be offered to consumers by professionals in FR;
  non-profit one-off events: check applicability) [À VALIDER].
- **Receipts**: provide on request, VAT breakdown, tips separate.
- **Lost tags**: policy: tag blocked on request; transfer of balance to a new tag
  only after proof (staff discretion, logged). Without personal data, proof is
  weak -> define rule: balance moved only if the claimant states the last
  payment details/phone-shown history [À VALIDER].
- **Minors**: alcohol limits, parent consent for online top-up (not in v1).
- **Promo/free tokens**: expiry allowed without consumer issue (no payment).
- **Accessibility / language**: T&C available FR/NL/EN; in Belgium
  language laws apply to consumer information (FR in Wallonia, NL in Flanders,
  both in Brussels, BE: Code droit économique art. VI.2 language) [À VALIDER].

## 2. GDPR (Regulation 2016/679) — "GDPR-light by design"

Authorities: CNIL (FR) https://www.cnil.fr ; APD-GBA (BE)
https://www.autoriteprotectiondonnees.be. Consulted 2026-10-10 conceptually; no
specific document fetched.

### What personal data exists even though tags are anonymous?
| Data | Personal data? | Handling |
|---|---|---|
| `tag_code` + balance + order history | Pseudonymous identifier; personal data **if linkable** to a person (e.g. via payment reference, CCTV, device). Treat as personal-data-adjacent. | Random 96-bit id, no name/e-mail/phone; keep retention minimal. |
| Public balance page `https://host/t/<tag_code>` | Anyone holding the tag sees history. | Show only balance + last N purchases (no stand staff names); rate-limit; `noindex`; HTTPS only; no third-party trackers/cookies. |
| Payment references (SumUp tx id, Wero ref) linked to top-up | Link a tag to a payer's card/bank transaction -> **personal data** (indirectly). | Store only PSP transaction id and method; **no card number, no IBAN, no payer name**. Reconciliation done with PSP reports on the organizer side. |
| Refund by bank transfer | IBAN + name = personal data | Collected only at refund desk; store in a separate refund table/with encryption, delete after statutory period; or refund only to original method. |
| Staff: name, PIN (hashed), role, device id | Personal data (employees/volunteers) | Legal basis: legitimate interest / contract; informed in staff agreement; PIN stored hashed (argon2), never logged. |
| Audit/security logs (IP, user agent, device id, timestamps) | Personal data | Retain 12 months (suggest), restricted to admin/auditor. |
| Online top-up e-mail receipts | Personal data | Only if feature added: opt-in, delete after 30 days / use PSP receipts. |
| NFC hardware UID | Device identifier bound to tag | Treated as secret; hashed in exports. |

### Principles
- **Roles**: the organizer is the **controller**; the Jeton operator/hosting
  provider is a **processor** -> Data Processing Agreement (art. 28) in
  `contracts-todo.md`. If the Jeton owner also runs the instance, written
  controller-processor contract still needed.
- **Legal basis**: performance of the contract (token sale) for transaction
  data; legal obligation (accounting) for ledger retention 10 years; legitimate
  interest for fraud prevention/logs.
- **Tension: ledger immutability vs erasure (art. 17)**: erasure does not apply
  to data needed for legal obligations (art. 17(3)(b)). Design so the ledger holds
  **no direct identifiers**; if any are accidentally entered (e.g. free-text
  notes), they sit in a separate `notes`/`refund_contact` table that can be
  purged, and ledger rows only reference ids. **No free-text personal data in
  hashed ledger rows.**
- **Records of processing (art. 30)** — template for the organizer; **DPIA** not
  expected (no large-scale profiling), [À VALIDER].
- **Data retention schedule**: ledger 10 years (fiscal); refund contact data 6
  months after event; security logs 12 months; test data purged.
- **Data subject rights**: since guests are anonymous, identification is only
  via the physical tag; procedure: tag holder shows tag -> access to history
  via balance page. Document in privacy notice (art. 11: no obligation to
  identify further).
- **Transparency**: short privacy notice posted at cashdesk + link on balance
  page (what is stored, controller identity, rights, retention, contact, CNIL/APD).
  Layered notice FR/NL/EN.
- **Hosting**: EU region; DPA with provider; encryption at rest + in transit;
  backups encrypted; access log.
- **Cookies**: the balance page and app use no tracking; strictly necessary
  only -> no consent banner.
- **Breach**: 72h notification plan to CNIL/APD (`contracts-todo.md`).
- **Cross-border**: BE/FR both EU; no transfers outside EU unless PSP (SumUp is
  UK/EU entity; its own controller role).
- **CCTV at cashdesk**: out of scope; separate regime (BE camera law, FR CNIL).
