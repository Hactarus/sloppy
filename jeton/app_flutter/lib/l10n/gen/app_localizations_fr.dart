// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appTitle => 'Jeton';

  @override
  String tokensCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count jetons',
      one: '1 jeton',
      zero: '0 jeton',
    );
    return '$_temp0';
  }

  @override
  String get cancel => 'Annuler';

  @override
  String get ok => 'OK';

  @override
  String get retry => 'Réessayer';

  @override
  String get dismiss => 'Ignorer';

  @override
  String get language => 'Langue';

  @override
  String get menu => 'Menu';

  @override
  String get logout => 'Se déconnecter';

  @override
  String get online => 'En ligne';

  @override
  String get offline => 'Hors ligne';

  @override
  String get noData => 'Aucune donnée';

  @override
  String get inactive => 'inactif';

  @override
  String get trainingBanner => 'TEST / FORMATION - pas d\'argent réel';

  @override
  String get enrollTitle => 'Enregistrer cet appareil';

  @override
  String get enrollHint =>
      'Saisissez le code à 8 caractères de la console d\'administration.';

  @override
  String get enrollCode => 'Code d\'enregistrement';

  @override
  String get deviceName => 'Nom de l\'appareil';

  @override
  String get enrollButton => 'Enregistrer';

  @override
  String get demoHint =>
      'Mode démo (sans serveur) : code DEMO2026. PIN : admin 1111, caisse 2222, bar 3333, frites 4444, audit 5555.';

  @override
  String get loginTitle => 'Qui êtes-vous ?';

  @override
  String pinTitle(String name) {
    return 'PIN de $name';
  }

  @override
  String get roleAdmin => 'Administrateur';

  @override
  String get roleCashier => 'Caissier';

  @override
  String get roleVendor => 'Vendeur';

  @override
  String get roleAuditor => 'Auditeur';

  @override
  String homeTitle(String name) {
    return 'Bonjour $name';
  }

  @override
  String get menuHome => 'Accueil';

  @override
  String get menuPos => 'Vendre';

  @override
  String get menuCashier => 'Caisse';

  @override
  String get menuEncode => 'Encoder les tags';

  @override
  String get menuAdmin => 'Admin';

  @override
  String get menuQueue => 'File hors ligne';

  @override
  String pillOffline(int count) {
    return 'hors ligne · $count en attente';
  }

  @override
  String pillSyncing(int count) {
    return '$count à synchroniser';
  }

  @override
  String pillRejected(int count) {
    return '$count rejetée(s)';
  }

  @override
  String get syncNow => 'Synchroniser';

  @override
  String get queueEmpty => 'Rien à synchroniser.';

  @override
  String syncFlags(String flags) {
    return 'Signalé par le serveur : $flags';
  }

  @override
  String get categoryAll => 'Tout';

  @override
  String get noCatalog => 'Aucun catalogue disponible.';

  @override
  String get quantity => 'Quantité';

  @override
  String qtyLabel(int qty) {
    return 'quantité $qty';
  }

  @override
  String get total => 'Total';

  @override
  String get clear => 'Vider';

  @override
  String get repeatLast => 'Répéter la dernière commande';

  @override
  String get pay => 'Payer';

  @override
  String get tipLabel => 'Pourboire (facultatif)';

  @override
  String get tipNone => 'Aucun';

  @override
  String get tapTag => 'Approchez le tag du téléphone';

  @override
  String get ageCheckTitle => 'Contrôle d\'âge';

  @override
  String ageCheckBody(int age) {
    return 'Confirmez avoir vérifié l\'âge du client (minimum $age).';
  }

  @override
  String get ageChecked => 'Âge vérifié';

  @override
  String get paid => 'Payé';

  @override
  String newBalance(String tokens) {
    return 'Nouveau solde : $tokens';
  }

  @override
  String receiptNo(int n) {
    return 'Ticket n° $n';
  }

  @override
  String get savedOffline => 'Enregistré hors ligne';

  @override
  String savedOfflineBody(String ref) {
    return 'Sera synchronisé automatiquement. Réf. $ref';
  }

  @override
  String offlineCapLeft(int n) {
    return 'Limite hors ligne restante sur ce tag : $n';
  }

  @override
  String get paymentFailed => 'Paiement refusé';

  @override
  String errInsufficientBalance(String balance, String required) {
    return 'Solde insuffisant (solde $balance, requis $required)';
  }

  @override
  String get errTagUidMismatch => 'Tag non conforme - copie possible. Refusé.';

  @override
  String get errTagNotFound => 'Tag inconnu';

  @override
  String get errTagBlocked => 'Ce tag est bloqué';

  @override
  String get errTagNotActive => 'Tag non activé';

  @override
  String get errTagAlreadyEnrolled => 'Tag déjà enregistré';

  @override
  String get errPriceMismatch =>
      'Les prix ont changé. Vérifiez le panier et réessayez.';

  @override
  String get errAgeCheck => 'Contrôle d\'âge requis';

  @override
  String get errTip => 'Pourboire non autorisé ou trop élevé';

  @override
  String get errForbidden => 'Non autorisé pour ce compte ou ce stand';

  @override
  String get errSessionExpired => 'Session expirée - reconnectez-vous';

  @override
  String get errDeviceRevoked => 'Cet appareil a été révoqué';

  @override
  String get errEventClosed => 'L\'événement n\'est pas ouvert';

  @override
  String get errWrongPin => 'PIN incorrect';

  @override
  String get errPinLocked => 'Trop d\'essais - bloqué 15 minutes';

  @override
  String get errEnrollCode => 'Code invalide, expiré ou déjà utilisé';

  @override
  String errLimit(String limit, String wouldBe) {
    return 'Limite dépassée (limite $limit, serait $wouldBe)';
  }

  @override
  String get errRefRequired => 'Référence de paiement requise';

  @override
  String get errRefUsed => 'Référence de paiement déjà utilisée';

  @override
  String get errAmount => 'Montant invalide';

  @override
  String get errRateLimited => 'Trop de requêtes - patientez';

  @override
  String get errDuplicate =>
      'Identifiant d\'opération déjà utilisé avec d\'autres données';

  @override
  String errOfflineCap(String cap, String spent) {
    return 'Limite hors ligne atteinte pour ce tag ($spent/$cap jetons). Reconnectez-vous.';
  }

  @override
  String get errNfcUnavailable =>
      'NFC désactivé ou indisponible sur cet appareil';

  @override
  String get errNfc =>
      'Lecture du tag échouée - gardez-le en place et réessayez';

  @override
  String get errReadback => 'Vérification d\'écriture échouée';

  @override
  String get errNetwork => 'Pas de connexion au serveur';

  @override
  String errGeneric(String code) {
    return 'Une erreur est survenue ($code)';
  }

  @override
  String get tabTopup => 'Recharge';

  @override
  String get tabCashout => 'Remboursement';

  @override
  String get tapTagFirst => 'Lisez un tag pour commencer';

  @override
  String get readTag => 'Lire un tag';

  @override
  String get otherTag => 'Autre tag';

  @override
  String get amountTokens => 'Jetons';

  @override
  String get payMethod => 'Mode de paiement';

  @override
  String get methodCash => 'Espèces';

  @override
  String get methodSumupCard => 'Carte SumUp';

  @override
  String get methodSumupOnline => 'SumUp en ligne (QR)';

  @override
  String get methodWero => 'Wero';

  @override
  String get methodBancontact => 'Bancontact / Payconiq';

  @override
  String get extRef => 'Référence du paiement';

  @override
  String confirmTopup(String amount) {
    return 'Confirmer la recharge ($amount)';
  }

  @override
  String topupDone(int tokens) {
    return '+$tokens jetons';
  }

  @override
  String get refundAll => 'Rembourser tout le solde';

  @override
  String cashoutDone(String amount) {
    return 'Remboursé $amount';
  }

  @override
  String get encodeStart => 'Démarrer';

  @override
  String get encodeStop => 'Arrêter';

  @override
  String encodeCounter(int n, int total) {
    return '$n / $total';
  }

  @override
  String get encodeWaiting => 'Présentez le tag suivant';

  @override
  String encodeOk(String code) {
    return 'Tag …$code prêt';
  }

  @override
  String get encodeProtected => 'protégé par mot de passe';

  @override
  String get encodeNoProtection =>
      'pas de mot de passe (limite puce ou navigateur)';

  @override
  String get encodeWebLimit =>
      'Mode navigateur : l\'URL est écrite, mais la protection par mot de passe nécessite l\'app Android.';

  @override
  String get tabCatalog => 'Catalogue';

  @override
  String get tabDevices => 'Appareils';

  @override
  String get tabReports => 'Rapports';

  @override
  String catalogInfo(int version, String price) {
    return 'Catalogue v$version · 1 jeton = $price';
  }

  @override
  String get newEnrollCode => 'Nouveau code d\'enregistrement';

  @override
  String get liability => 'Jetons en circulation';

  @override
  String liabilityDetail(int wallets, int negative) {
    return '$wallets portefeuilles avec solde, $negative négatifs';
  }

  @override
  String get topupsByMethod => 'Recharges par mode';

  @override
  String get salesByItem => 'Ventes par article';

  @override
  String get guestTitle => 'Votre solde Jeton';

  @override
  String guestWorth(String amount) {
    return 'valeur $amount';
  }

  @override
  String get guestNotFound => 'Tag introuvable';

  @override
  String get guestBlocked =>
      'Ce tag est bloqué. Merci de vous rendre à la caisse.';

  @override
  String get recentActivity => 'Activité récente';

  @override
  String guestRefundUntil(String date) {
    return 'Remboursable jusqu\'au $date';
  }

  @override
  String guestExpiry(String date) {
    return 'Jetons valables jusqu\'au $date';
  }

  @override
  String guestOrganizer(String name, String number) {
    return 'Organisé par $name ($number)';
  }

  @override
  String get policy => 'Conditions';

  @override
  String get kindTopup => 'Recharge';

  @override
  String get kindPromo => 'Jetons offerts';

  @override
  String get kindSale => 'Achat';

  @override
  String get kindRefund => 'Remboursement de commande';

  @override
  String get kindCashout => 'Remboursement';

  @override
  String get kindReplacement => 'Tag remplacé';

  @override
  String get kindOther => 'Ajustement';
}
