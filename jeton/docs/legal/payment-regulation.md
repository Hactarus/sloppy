# Payment-services regulation (PSD2 / PSD3 / e-money) and payment methods

Planning doc, not legal advice. Checked **2026-10-10**. [À VALIDER] = to confirm.

## 1. The risk

Jeton tokens are prepaid, redeemable value held for the guest. Taken alone this
looks like **electronic money** (EMD2, Directive 2009/110/EC) or a payment
service (PSD2 2015/2366) which requires a licence (BNB/NBB in Belgium, ACPR in
France). BRIEF's "no real money stored" is accurate only in the sense that the
**organizer** holds the cash — legally the liability to guests is still there.
The safe harbour is the **limited-network exclusion**, PSD2 art. 3(k).

## 2. Limited-network exclusion (art. 3(k) PSD2)

Instruments qualify if they can be used only:
1. to acquire goods/services in the **premises of the issuer**, or
2. within a **limited network of service providers** with a direct commercial
   agreement with a professional issuer, or
3. for a very limited range of goods/services.

EBA Guidelines on the limited network exclusion (EBA/GL/2022/02) tighten the
interpretation (e.g. geographic limit: a shopping centre or event site is
usually ok; "limited" in terms of number of acceptance points is assessed per
case). Source: https://loyensloeff.com/insights/news--events/news/eba-guidelines-on-the-limited-network-exclusion-under-psd2 ;
https://www.eba.europa.eu/eba-response/26938 (checked 2026-10-10).

**Notification threshold:** issuers relying on (ii) or (iii) must **notify the
competent authority when annual payment transactions exceed EUR 1 million**
(art. 37(2) PSD2), the authority then decides whether the exclusion applies.
- Belgium: NBB (Law of 11 March 2018 on payment services). France: ACPR
  (Code monétaire et financier L511-7 / L521-3). [À VALIDER on national
  provisions; I could not retrieve NBB/ACPR pages.]
- An event with ~1000 tags x ~EUR 40 average = ~EUR 40k -> far below EUR 1m.
  But an organizer running many events per year should track the 12-month
  total of token redemptions: **the app reports it** (R-REG-1).

**PSD3/PSR status (2026-10-10):** the final compromise texts were published by
the Council on 23 April 2026 (secondary source); formal adoption expected
mid/late 2026, applicability about late 2027. Exclusions are carried into the
PSR; no confirmed change to the limited-network exclusion identified.
[À VALIDER] — re-check at go-live.
- https://www.williamfry.com/knowledge/psd3-psr-final-compromise-texts-are-published/
- https://www.simmons-simmons.com/en/publications/cmanzeyn1009cvch0q9u61uva/relevant-exclusions-under-the-psd3-psr

## 3. Safe operating model (design constraints)

To stay a "voucher in a closed event", Jeton must:
1. Tokens **spendable only inside one event area** operated by the issuer
   (organizer) — no cross-event balances (event-scoped `tag` wallets; BRIEF
   says accounts are per event: keep).
2. **No wallet-to-wallet transfers** between guests, **no peer-to-peer**, no
   cash withdrawal at will. Cash-out is limited to **refund of unused tokens
   to the original payer** under a stated policy (a voluntary refund is not, by
   itself, redeemability "on request at par" of e-money, but a generous refund
   right pushes towards e-money qualification [À VALIDER]).
3. No interest, no loyalty-to-money conversion, no stored personal wallets
   across events.
4. **Funds flow:** guest money goes straight to the **organizer's own** account
   (cash, SumUp merchant account of the organizer, Wero/Bancontact merchant of
   the organizer). Jeton the software never receives or holds funds; hosting
   provider is not in the money flow. The software owner must not be a
   payment intermediary (if the software owner uses its own SumUp account for
   others' events = payment facilitator problem: **forbidden**; each organizer
   has its own merchant contracts).
5. **Cap on balance**: configurable max balance per tag (suggest EUR 200 /
   100 tokens) and max top-up per transaction; supports AML/e-money thresholds
   (e-money simplified due diligence thresholds are EUR 150/250) [À VALIDER].
6. Offline spending cap per tag (BRIEF default 10 tokens): fine.
7. **Third-party vendors**: if a vendor is a separate legal entity receiving
   payout from the organizer for tokens collected, we are closer to a
   limited network (ii) (needs commercial agreement with the issuer; counts
   toward the EUR 1m notification) and the organizer is in a quasi-payment
   role (settlement of funds on behalf of third parties = possible "money
   remittance" or "acquiring"). **For v1: stands = organizer's own activity.**
   If vendors are needed: sign vendor agreements (contracts-todo.md) and get
   written advice. [À VALIDER]
8. **AML**: organizer-level obligations limited; cash top-up above EUR 3,000
   (BE cash payment limit) / EUR 1,000 (FR consumer limit, resident)
   unrealistic. Keep per-transaction cap lower. [À VALIDER]

## 4. Payment methods for top-up (merchant setup)

All card/Wero/Bancontact flows are with a **licensed PSP in the organizer's
name**; the app only records the PSP transaction reference and status.

### SumUp
- Card readers (Solo/Air) and online checkout. Secondary sources: **Belgium
  1.69 % per transaction** (retailer listing Coolblue, undated), **France 1.75 %**
  per transaction (comparison sites), no subscription, pay-out typically next
  day (J+1) for France; reader prices from ~EUR 34-79 ex VAT (promotions vary).
  Official pricing page could not be fetched. [À VALIDER on sumup.com for BE/FR]
  - https://coolblue.be/en/product/900749/sumup-air-portable-card-reader-charging-dock.html
  - https://www.portail-autoentrepreneur.fr/academie/comparatifs/terminal-paiement/avis-sumup
  - https://www.comparateurbanque.com/?p=156969
- Fees are an expense of the organizer (not deducted from guest tokens: **token
  price is fixed regardless of payment method**; no surcharge; surcharging
  card payments is banned for consumer cards in EU anyway — IFR/PSD2 art. 62(4)).
- Chargebacks / disputed card top-ups: the app needs `topup_status` and a
  reversal path (tokens already spent -> negative balance flagged, BRIEF rule).
- SumUp's merchant must be the organizer (legal entity). Association: needs
  bank account in its name; natural person: personal merchant account (informal).

### Wero / Bancontact (Belgium) and Wero (France)
- Belgium: **Payconiq brand is being retired**; Bancontact Payconiq Company
  renamed **Bancontact Company** (spring 2026), app "Bancontact Pay". Former
  Payconiq merchants are migrated automatically to Bancontact + Wero
  acceptance, existing QR codes/terminals keep working, **prices frozen until
  end of 2026** (BNP Paribas Fortis, Bancontact press release). Wero
  point-of-sale was "expected in 2026"; online Wero rollout in Belgian banks
  rolls out through H2 2026 (Belfius first; Argenta, Crelan, Revolut later).
  - https://www.bnpparibasfortis.be/en/public/article/payconiq-wero-merchants
  - https://bancontact-company.prezly.com/bancontact-payconiq-company-opens-a-new-chapter-for-belgian-payments-with-the-bancontact-pay-brand
  - https://en.paperjam.lu/article/epi-rolls-out-wero-ecommerce-in-belgium
  - [À VALIDER] exact Wero POS/QR availability for small merchants/associations
    in BE and FR in Oct 2026, and onboarding route (via Bancontact Company or
    an acquirer/PSP). I did not find a confirmation for France merchants.
- Implementation: until confirmed, treat Wero/Bancontact as **a payment method
  recorded manually or by webhook**: the cashier confirms the instant payment
  seen on the merchant app (`payment_method = wero|bancontact`, `psp_ref`
  optional). Manual confirmation is a fraud risk -> require unique reference
  and reconcile with the bank statement.
- Instant-payment fees are generally lower than card; get a quote.

## 5. Summary of go/no-go gates

| Gate | Condition |
|---|---|
| Closed-loop single event, organizer = seller | Go |
| Multi-event wallet, cross-event balances | No-go (needs licence) |
| Transfers between guests / cash-out on demand | No-go |
| Third-party vendors settled with organizer funds | Legal review first |
| Organizer yearly token flow > EUR 1m | Notify NBB/ACPR |
