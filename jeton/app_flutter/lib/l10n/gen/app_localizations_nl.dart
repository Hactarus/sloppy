// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Dutch Flemish (`nl`).
class AppLocalizationsNl extends AppLocalizations {
  AppLocalizationsNl([String locale = 'nl']) : super(locale);

  @override
  String get appTitle => 'Jeton';

  @override
  String tokensCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count tokens',
      one: '1 token',
    );
    return '$_temp0';
  }

  @override
  String get cancel => 'Annuleren';

  @override
  String get ok => 'OK';

  @override
  String get retry => 'Opnieuw';

  @override
  String get dismiss => 'Negeren';

  @override
  String get language => 'Taal';

  @override
  String get menu => 'Menu';

  @override
  String get logout => 'Afmelden';

  @override
  String get online => 'Online';

  @override
  String get offline => 'Offline';

  @override
  String get noData => 'Geen gegevens';

  @override
  String get inactive => 'inactief';

  @override
  String get trainingBanner => 'TEST / OPLEIDING - geen echt geld';

  @override
  String get enrollTitle => 'Dit toestel registreren';

  @override
  String get enrollHint => 'Voer de code van 8 tekens uit de beheerconsole in.';

  @override
  String get enrollCode => 'Registratiecode';

  @override
  String get deviceName => 'Naam van het toestel';

  @override
  String get enrollButton => 'Registreren';

  @override
  String get demoHint =>
      'Demomodus (zonder server): code DEMO2026. PIN: beheer 1111, kassa 2222, bar 3333, frituur 4444, audit 5555.';

  @override
  String get loginTitle => 'Wie ben je?';

  @override
  String pinTitle(String name) {
    return 'PIN van $name';
  }

  @override
  String get roleAdmin => 'Beheerder';

  @override
  String get roleCashier => 'Kassier';

  @override
  String get roleVendor => 'Verkoper';

  @override
  String get roleAuditor => 'Auditor';

  @override
  String homeTitle(String name) {
    return 'Hallo $name';
  }

  @override
  String get menuHome => 'Start';

  @override
  String get menuPos => 'Verkopen';

  @override
  String get menuCashier => 'Kassa';

  @override
  String get menuEncode => 'Tags coderen';

  @override
  String get menuAdmin => 'Beheer';

  @override
  String get menuQueue => 'Offline wachtrij';

  @override
  String pillOffline(int count) {
    return 'offline · $count in wachtrij';
  }

  @override
  String pillSyncing(int count) {
    return '$count te synchroniseren';
  }

  @override
  String pillRejected(int count) {
    return '$count geweigerd';
  }

  @override
  String get syncNow => 'Nu synchroniseren';

  @override
  String get queueEmpty => 'Niets te synchroniseren.';

  @override
  String syncFlags(String flags) {
    return 'Door server gemarkeerd: $flags';
  }

  @override
  String get categoryAll => 'Alles';

  @override
  String get noCatalog => 'Geen catalogus beschikbaar.';

  @override
  String get quantity => 'Aantal';

  @override
  String qtyLabel(int qty) {
    return 'aantal $qty';
  }

  @override
  String get total => 'Totaal';

  @override
  String get clear => 'Wissen';

  @override
  String get repeatLast => 'Laatste bestelling herhalen';

  @override
  String get pay => 'Betalen';

  @override
  String get tipLabel => 'Fooi (optioneel)';

  @override
  String get tipNone => 'Geen';

  @override
  String get tapTag => 'Houd de tag tegen de telefoon';

  @override
  String get ageCheckTitle => 'Leeftijdscontrole';

  @override
  String ageCheckBody(int age) {
    return 'Bevestig dat je de leeftijd van de klant hebt gecontroleerd (minimum $age).';
  }

  @override
  String get ageChecked => 'Leeftijd gecontroleerd';

  @override
  String get paid => 'Betaald';

  @override
  String newBalance(String tokens) {
    return 'Nieuw saldo: $tokens';
  }

  @override
  String receiptNo(int n) {
    return 'Ticket nr. $n';
  }

  @override
  String get savedOffline => 'Offline opgeslagen';

  @override
  String savedOfflineBody(String ref) {
    return 'Wordt automatisch gesynchroniseerd. Ref. $ref';
  }

  @override
  String offlineCapLeft(int n) {
    return 'Resterende offline limiet op deze tag: $n';
  }

  @override
  String get paymentFailed => 'Betaling mislukt';

  @override
  String errInsufficientBalance(String balance, String required) {
    return 'Onvoldoende tokens (saldo $balance, nodig $required)';
  }

  @override
  String get errTagUidMismatch =>
      'Tag komt niet overeen - mogelijke kopie. Geweigerd.';

  @override
  String get errTagNotFound => 'Onbekende tag';

  @override
  String get errTagBlocked => 'Deze tag is geblokkeerd';

  @override
  String get errTagNotActive => 'Tag niet geactiveerd';

  @override
  String get errTagAlreadyEnrolled => 'Tag al geregistreerd';

  @override
  String get errPriceMismatch =>
      'Prijzen gewijzigd. Controleer het mandje en probeer opnieuw.';

  @override
  String get errAgeCheck => 'Leeftijdscontrole vereist';

  @override
  String get errTip => 'Fooi niet toegestaan of te hoog';

  @override
  String get errForbidden => 'Niet toegestaan voor dit account of deze stand';

  @override
  String get errSessionExpired => 'Sessie verlopen - meld je opnieuw aan';

  @override
  String get errDeviceRevoked => 'Dit toestel is ingetrokken';

  @override
  String get errEventClosed => 'Evenement is niet open';

  @override
  String get errWrongPin => 'Verkeerde PIN';

  @override
  String get errPinLocked => 'Te veel pogingen - 15 minuten geblokkeerd';

  @override
  String get errEnrollCode => 'Code ongeldig, verlopen of al gebruikt';

  @override
  String errLimit(String limit, String wouldBe) {
    return 'Limiet overschreden (limiet $limit, zou worden $wouldBe)';
  }

  @override
  String get errRefRequired => 'Betalingsreferentie vereist';

  @override
  String get errRefUsed => 'Betalingsreferentie al gebruikt';

  @override
  String get errAmount => 'Ongeldig bedrag';

  @override
  String get errRateLimited => 'Te veel verzoeken - even wachten';

  @override
  String get errDuplicate => 'Operatie-id al gebruikt met andere gegevens';

  @override
  String errOfflineCap(String cap, String spent) {
    return 'Offline limiet bereikt voor deze tag ($spent/$cap tokens). Ga online.';
  }

  @override
  String get errNfcUnavailable =>
      'NFC staat uit of is niet beschikbaar op dit toestel';

  @override
  String get errNfc => 'Tag lezen mislukt - houd stil en probeer opnieuw';

  @override
  String get errReadback => 'Schrijfverificatie mislukt';

  @override
  String get errNetwork => 'Geen verbinding met de server';

  @override
  String errGeneric(String code) {
    return 'Er ging iets mis ($code)';
  }

  @override
  String get tabTopup => 'Opladen';

  @override
  String get tabCashout => 'Terugbetaling';

  @override
  String get tapTagFirst => 'Lees een tag om te starten';

  @override
  String get readTag => 'Tag lezen';

  @override
  String get otherTag => 'Andere tag';

  @override
  String get amountTokens => 'Tokens';

  @override
  String get payMethod => 'Betaalmethode';

  @override
  String get methodCash => 'Contant';

  @override
  String get methodSumupCard => 'SumUp kaart';

  @override
  String get methodSumupOnline => 'SumUp online (QR)';

  @override
  String get methodWero => 'Wero';

  @override
  String get methodBancontact => 'Bancontact / Payconiq';

  @override
  String get extRef => 'Betalingsreferentie';

  @override
  String confirmTopup(String amount) {
    return 'Opladen bevestigen ($amount)';
  }

  @override
  String topupDone(int tokens) {
    return '+$tokens tokens';
  }

  @override
  String get refundAll => 'Volledig saldo terugbetalen';

  @override
  String cashoutDone(String amount) {
    return 'Terugbetaald $amount';
  }

  @override
  String get encodeStart => 'Starten';

  @override
  String get encodeStop => 'Stoppen';

  @override
  String encodeCounter(int n, int total) {
    return '$n / $total';
  }

  @override
  String get encodeWaiting => 'Houd de volgende tag erbij';

  @override
  String encodeOk(String code) {
    return 'Tag …$code klaar';
  }

  @override
  String get encodeProtected => 'met wachtwoord beveiligd';

  @override
  String get encodeNoProtection =>
      'geen wachtwoord (chip- of browserbeperking)';

  @override
  String get encodeWebLimit =>
      'Browsermodus: de URL wordt geschreven, maar wachtwoordbeveiliging vereist de Android-app.';

  @override
  String get tabCatalog => 'Catalogus';

  @override
  String get tabDevices => 'Toestellen';

  @override
  String get tabReports => 'Rapporten';

  @override
  String catalogInfo(int version, String price) {
    return 'Catalogus v$version · 1 token = $price';
  }

  @override
  String get newEnrollCode => 'Nieuwe registratiecode';

  @override
  String get liability => 'Uitstaande tokens';

  @override
  String liabilityDetail(int wallets, int negative) {
    return '$wallets wallets met saldo, $negative negatief';
  }

  @override
  String get topupsByMethod => 'Opladingen per methode';

  @override
  String get salesByItem => 'Verkoop per artikel';

  @override
  String get guestTitle => 'Je Jeton-saldo';

  @override
  String guestWorth(String amount) {
    return 'waarde $amount';
  }

  @override
  String get guestNotFound => 'Tag niet gevonden';

  @override
  String get guestBlocked => 'Deze tag is geblokkeerd. Ga naar de kassa.';

  @override
  String get recentActivity => 'Recente activiteit';

  @override
  String guestRefundUntil(String date) {
    return 'Terugbetaalbaar tot $date';
  }

  @override
  String guestExpiry(String date) {
    return 'Tokens vervallen op $date';
  }

  @override
  String guestOrganizer(String name, String number) {
    return 'Georganiseerd door $name ($number)';
  }

  @override
  String get policy => 'Voorwaarden';

  @override
  String get kindTopup => 'Opladen';

  @override
  String get kindPromo => 'Gratis tokens';

  @override
  String get kindSale => 'Aankoop';

  @override
  String get kindRefund => 'Terugbetaling bestelling';

  @override
  String get kindCashout => 'Terugbetaling';

  @override
  String get kindReplacement => 'Tag vervangen';

  @override
  String get kindOther => 'Aanpassing';
}
