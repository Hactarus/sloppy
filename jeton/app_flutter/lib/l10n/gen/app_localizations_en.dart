// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

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
  String get cancel => 'Cancel';

  @override
  String get ok => 'OK';

  @override
  String get retry => 'Retry';

  @override
  String get dismiss => 'Dismiss';

  @override
  String get language => 'Language';

  @override
  String get menu => 'Menu';

  @override
  String get logout => 'Log out';

  @override
  String get online => 'Online';

  @override
  String get offline => 'Offline';

  @override
  String get noData => 'No data';

  @override
  String get inactive => 'inactive';

  @override
  String get trainingBanner => 'TEST / TRAINING - no real money';

  @override
  String get enrollTitle => 'Enrol this device';

  @override
  String get enrollHint => 'Enter the 8-character code from the admin console.';

  @override
  String get enrollCode => 'Enrolment code';

  @override
  String get deviceName => 'Device name';

  @override
  String get enrollButton => 'Enrol';

  @override
  String get demoHint =>
      'Demo mode (no backend): code DEMO2026. PINs: admin 1111, cashier 2222, bar 3333, fries 4444, audit 5555.';

  @override
  String get loginTitle => 'Who are you?';

  @override
  String pinTitle(String name) {
    return 'PIN for $name';
  }

  @override
  String get roleAdmin => 'Administrator';

  @override
  String get roleCashier => 'Cashier';

  @override
  String get roleVendor => 'Vendor';

  @override
  String get roleAuditor => 'Auditor';

  @override
  String homeTitle(String name) {
    return 'Hello $name';
  }

  @override
  String get menuHome => 'Home';

  @override
  String get menuPos => 'Sell';

  @override
  String get menuCashier => 'Cash desk';

  @override
  String get menuEncode => 'Encode tags';

  @override
  String get menuAdmin => 'Admin';

  @override
  String get menuQueue => 'Offline queue';

  @override
  String pillOffline(int count) {
    return 'offline · $count pending';
  }

  @override
  String pillSyncing(int count) {
    return '$count to sync';
  }

  @override
  String pillRejected(int count) {
    return '$count rejected';
  }

  @override
  String get syncNow => 'Sync now';

  @override
  String get queueEmpty => 'Nothing waiting to sync.';

  @override
  String syncFlags(String flags) {
    return 'Server flagged: $flags';
  }

  @override
  String get categoryAll => 'All';

  @override
  String get noCatalog => 'No catalog available.';

  @override
  String get quantity => 'Quantity';

  @override
  String qtyLabel(int qty) {
    return 'quantity $qty';
  }

  @override
  String get total => 'Total';

  @override
  String get clear => 'Clear';

  @override
  String get repeatLast => 'Repeat last order';

  @override
  String get pay => 'Pay';

  @override
  String get tipLabel => 'Tip (optional)';

  @override
  String get tipNone => 'No tip';

  @override
  String get tapTag => 'Hold the tag to the phone';

  @override
  String get ageCheckTitle => 'Age check';

  @override
  String ageCheckBody(int age) {
    return 'Confirm you checked the customer\'s age (minimum $age).';
  }

  @override
  String get ageChecked => 'Age checked';

  @override
  String get paid => 'Paid';

  @override
  String newBalance(String tokens) {
    return 'New balance: $tokens';
  }

  @override
  String receiptNo(int n) {
    return 'Receipt no. $n';
  }

  @override
  String get savedOffline => 'Saved offline';

  @override
  String savedOfflineBody(String ref) {
    return 'Will sync automatically. Ref. $ref';
  }

  @override
  String offlineCapLeft(int n) {
    return 'Offline limit left on this tag: $n';
  }

  @override
  String get paymentFailed => 'Payment failed';

  @override
  String errInsufficientBalance(String balance, String required) {
    return 'Not enough tokens (balance $balance, needed $required)';
  }

  @override
  String get errTagUidMismatch =>
      'Tag does not match - possible copy. Refused.';

  @override
  String get errTagNotFound => 'Unknown tag';

  @override
  String get errTagBlocked => 'This tag is blocked';

  @override
  String get errTagNotActive => 'Tag not activated';

  @override
  String get errTagAlreadyEnrolled => 'Tag already enrolled';

  @override
  String get errPriceMismatch =>
      'Prices changed. Check the basket and try again.';

  @override
  String get errAgeCheck => 'Age check required';

  @override
  String get errTip => 'Tip not allowed or too high';

  @override
  String get errForbidden => 'Not allowed for this account or stand';

  @override
  String get errSessionExpired => 'Session expired - log in again';

  @override
  String get errDeviceRevoked => 'This device was revoked';

  @override
  String get errEventClosed => 'Event is not open';

  @override
  String get errWrongPin => 'Wrong PIN';

  @override
  String get errPinLocked => 'Too many attempts - locked for 15 minutes';

  @override
  String get errEnrollCode => 'Code invalid, expired or already used';

  @override
  String errLimit(String limit, String wouldBe) {
    return 'Limit exceeded (limit $limit, would be $wouldBe)';
  }

  @override
  String get errRefRequired => 'Payment reference required';

  @override
  String get errRefUsed => 'Payment reference already used';

  @override
  String get errAmount => 'Invalid amount';

  @override
  String get errRateLimited => 'Too many requests - wait a moment';

  @override
  String get errDuplicate => 'Operation id already used with other data';

  @override
  String errOfflineCap(String cap, String spent) {
    return 'Offline limit reached for this tag ($spent/$cap tokens). Go online.';
  }

  @override
  String get errNfcUnavailable => 'NFC is off or unavailable on this device';

  @override
  String get errNfc => 'Tag read failed - hold still and retry';

  @override
  String get errReadback => 'Write verification failed';

  @override
  String get errNetwork => 'No connection to the server';

  @override
  String errGeneric(String code) {
    return 'Something went wrong ($code)';
  }

  @override
  String get tabTopup => 'Top-up';

  @override
  String get tabCashout => 'Refund';

  @override
  String get tapTagFirst => 'Read a tag to start';

  @override
  String get readTag => 'Read tag';

  @override
  String get otherTag => 'Other tag';

  @override
  String get amountTokens => 'Tokens';

  @override
  String get payMethod => 'Payment method';

  @override
  String get methodCash => 'Cash';

  @override
  String get methodSumupCard => 'SumUp card';

  @override
  String get methodSumupOnline => 'SumUp online (QR)';

  @override
  String get methodWero => 'Wero';

  @override
  String get methodBancontact => 'Bancontact / Payconiq';

  @override
  String get extRef => 'Payment reference';

  @override
  String confirmTopup(String amount) {
    return 'Confirm top-up ($amount)';
  }

  @override
  String topupDone(int tokens) {
    return '+$tokens tokens';
  }

  @override
  String get refundAll => 'Refund whole balance';

  @override
  String cashoutDone(String amount) {
    return 'Refunded $amount';
  }

  @override
  String get encodeStart => 'Start';

  @override
  String get encodeStop => 'Stop';

  @override
  String encodeCounter(int n, int total) {
    return '$n / $total';
  }

  @override
  String get encodeWaiting => 'Tap the next tag';

  @override
  String encodeOk(String code) {
    return 'Tag …$code ready';
  }

  @override
  String get encodeProtected => 'password protected';

  @override
  String get encodeNoProtection => 'no password set (chip or browser limit)';

  @override
  String get encodeWebLimit =>
      'Browser mode: URL is written, but password protection needs the Android app.';

  @override
  String get tabCatalog => 'Catalog';

  @override
  String get tabDevices => 'Devices';

  @override
  String get tabReports => 'Reports';

  @override
  String catalogInfo(int version, String price) {
    return 'Catalog v$version · 1 token = $price';
  }

  @override
  String get newEnrollCode => 'New enrolment code';

  @override
  String get liability => 'Outstanding tokens';

  @override
  String liabilityDetail(int wallets, int negative) {
    return '$wallets wallets with balance, $negative negative';
  }

  @override
  String get topupsByMethod => 'Top-ups by method';

  @override
  String get salesByItem => 'Sales by item';

  @override
  String get guestTitle => 'Your Jeton balance';

  @override
  String guestWorth(String amount) {
    return 'worth $amount';
  }

  @override
  String get guestNotFound => 'Tag not found';

  @override
  String get guestBlocked => 'This tag is blocked. Please see the cash desk.';

  @override
  String get recentActivity => 'Recent activity';

  @override
  String guestRefundUntil(String date) {
    return 'Refundable until $date';
  }

  @override
  String guestExpiry(String date) {
    return 'Tokens expire $date';
  }

  @override
  String guestOrganizer(String name, String number) {
    return 'Organised by $name ($number)';
  }

  @override
  String get policy => 'Policy';

  @override
  String get kindTopup => 'Top-up';

  @override
  String get kindPromo => 'Free tokens';

  @override
  String get kindSale => 'Purchase';

  @override
  String get kindRefund => 'Order refund';

  @override
  String get kindCashout => 'Refund';

  @override
  String get kindReplacement => 'Tag replaced';

  @override
  String get kindOther => 'Adjustment';
}
