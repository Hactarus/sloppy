import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';
import 'app_localizations_nl.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'gen/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('fr'),
    Locale('nl'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'Jeton'**
  String get appTitle;

  /// No description provided for @tokensCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 token} other{{count} tokens}}'**
  String tokensCount(int count);

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @ok.
  ///
  /// In en, this message translates to:
  /// **'OK'**
  String get ok;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// No description provided for @dismiss.
  ///
  /// In en, this message translates to:
  /// **'Dismiss'**
  String get dismiss;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @menu.
  ///
  /// In en, this message translates to:
  /// **'Menu'**
  String get menu;

  /// No description provided for @logout.
  ///
  /// In en, this message translates to:
  /// **'Log out'**
  String get logout;

  /// No description provided for @online.
  ///
  /// In en, this message translates to:
  /// **'Online'**
  String get online;

  /// No description provided for @offline.
  ///
  /// In en, this message translates to:
  /// **'Offline'**
  String get offline;

  /// No description provided for @noData.
  ///
  /// In en, this message translates to:
  /// **'No data'**
  String get noData;

  /// No description provided for @inactive.
  ///
  /// In en, this message translates to:
  /// **'inactive'**
  String get inactive;

  /// No description provided for @trainingBanner.
  ///
  /// In en, this message translates to:
  /// **'TEST / TRAINING - no real money'**
  String get trainingBanner;

  /// No description provided for @enrollTitle.
  ///
  /// In en, this message translates to:
  /// **'Enrol this device'**
  String get enrollTitle;

  /// No description provided for @enrollHint.
  ///
  /// In en, this message translates to:
  /// **'Enter the 8-character code from the admin console.'**
  String get enrollHint;

  /// No description provided for @enrollCode.
  ///
  /// In en, this message translates to:
  /// **'Enrolment code'**
  String get enrollCode;

  /// No description provided for @deviceName.
  ///
  /// In en, this message translates to:
  /// **'Device name'**
  String get deviceName;

  /// No description provided for @enrollButton.
  ///
  /// In en, this message translates to:
  /// **'Enrol'**
  String get enrollButton;

  /// No description provided for @demoHint.
  ///
  /// In en, this message translates to:
  /// **'Demo mode (no backend): code DEMO2026. PINs: admin 1111, cashier 2222, bar 3333, fries 4444, audit 5555.'**
  String get demoHint;

  /// No description provided for @loginTitle.
  ///
  /// In en, this message translates to:
  /// **'Who are you?'**
  String get loginTitle;

  /// No description provided for @pinTitle.
  ///
  /// In en, this message translates to:
  /// **'PIN for {name}'**
  String pinTitle(String name);

  /// No description provided for @roleAdmin.
  ///
  /// In en, this message translates to:
  /// **'Administrator'**
  String get roleAdmin;

  /// No description provided for @roleCashier.
  ///
  /// In en, this message translates to:
  /// **'Cashier'**
  String get roleCashier;

  /// No description provided for @roleVendor.
  ///
  /// In en, this message translates to:
  /// **'Vendor'**
  String get roleVendor;

  /// No description provided for @roleAuditor.
  ///
  /// In en, this message translates to:
  /// **'Auditor'**
  String get roleAuditor;

  /// No description provided for @homeTitle.
  ///
  /// In en, this message translates to:
  /// **'Hello {name}'**
  String homeTitle(String name);

  /// No description provided for @menuHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get menuHome;

  /// No description provided for @menuPos.
  ///
  /// In en, this message translates to:
  /// **'Sell'**
  String get menuPos;

  /// No description provided for @menuCashier.
  ///
  /// In en, this message translates to:
  /// **'Cash desk'**
  String get menuCashier;

  /// No description provided for @menuEncode.
  ///
  /// In en, this message translates to:
  /// **'Encode tags'**
  String get menuEncode;

  /// No description provided for @menuAdmin.
  ///
  /// In en, this message translates to:
  /// **'Admin'**
  String get menuAdmin;

  /// No description provided for @menuQueue.
  ///
  /// In en, this message translates to:
  /// **'Offline queue'**
  String get menuQueue;

  /// No description provided for @pillOffline.
  ///
  /// In en, this message translates to:
  /// **'offline · {count} pending'**
  String pillOffline(int count);

  /// No description provided for @pillSyncing.
  ///
  /// In en, this message translates to:
  /// **'{count} to sync'**
  String pillSyncing(int count);

  /// No description provided for @pillRejected.
  ///
  /// In en, this message translates to:
  /// **'{count} rejected'**
  String pillRejected(int count);

  /// No description provided for @syncNow.
  ///
  /// In en, this message translates to:
  /// **'Sync now'**
  String get syncNow;

  /// No description provided for @queueEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nothing waiting to sync.'**
  String get queueEmpty;

  /// No description provided for @syncFlags.
  ///
  /// In en, this message translates to:
  /// **'Server flagged: {flags}'**
  String syncFlags(String flags);

  /// No description provided for @categoryAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get categoryAll;

  /// No description provided for @noCatalog.
  ///
  /// In en, this message translates to:
  /// **'No catalog available.'**
  String get noCatalog;

  /// No description provided for @quantity.
  ///
  /// In en, this message translates to:
  /// **'Quantity'**
  String get quantity;

  /// No description provided for @qtyLabel.
  ///
  /// In en, this message translates to:
  /// **'quantity {qty}'**
  String qtyLabel(int qty);

  /// No description provided for @total.
  ///
  /// In en, this message translates to:
  /// **'Total'**
  String get total;

  /// No description provided for @clear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get clear;

  /// No description provided for @repeatLast.
  ///
  /// In en, this message translates to:
  /// **'Repeat last order'**
  String get repeatLast;

  /// No description provided for @pay.
  ///
  /// In en, this message translates to:
  /// **'Pay'**
  String get pay;

  /// No description provided for @tipLabel.
  ///
  /// In en, this message translates to:
  /// **'Tip (optional)'**
  String get tipLabel;

  /// No description provided for @tipNone.
  ///
  /// In en, this message translates to:
  /// **'No tip'**
  String get tipNone;

  /// No description provided for @tapTag.
  ///
  /// In en, this message translates to:
  /// **'Hold the tag to the phone'**
  String get tapTag;

  /// No description provided for @ageCheckTitle.
  ///
  /// In en, this message translates to:
  /// **'Age check'**
  String get ageCheckTitle;

  /// No description provided for @ageCheckBody.
  ///
  /// In en, this message translates to:
  /// **'Confirm you checked the customer\'s age (minimum {age}).'**
  String ageCheckBody(int age);

  /// No description provided for @ageChecked.
  ///
  /// In en, this message translates to:
  /// **'Age checked'**
  String get ageChecked;

  /// No description provided for @paid.
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get paid;

  /// No description provided for @newBalance.
  ///
  /// In en, this message translates to:
  /// **'New balance: {tokens}'**
  String newBalance(String tokens);

  /// No description provided for @receiptNo.
  ///
  /// In en, this message translates to:
  /// **'Receipt no. {n}'**
  String receiptNo(int n);

  /// No description provided for @savedOffline.
  ///
  /// In en, this message translates to:
  /// **'Saved offline'**
  String get savedOffline;

  /// No description provided for @savedOfflineBody.
  ///
  /// In en, this message translates to:
  /// **'Will sync automatically. Ref. {ref}'**
  String savedOfflineBody(String ref);

  /// No description provided for @offlineCapLeft.
  ///
  /// In en, this message translates to:
  /// **'Offline limit left on this tag: {n}'**
  String offlineCapLeft(int n);

  /// No description provided for @paymentFailed.
  ///
  /// In en, this message translates to:
  /// **'Payment failed'**
  String get paymentFailed;

  /// No description provided for @errInsufficientBalance.
  ///
  /// In en, this message translates to:
  /// **'Not enough tokens (balance {balance}, needed {required})'**
  String errInsufficientBalance(String balance, String required);

  /// No description provided for @errTagUidMismatch.
  ///
  /// In en, this message translates to:
  /// **'Tag does not match - possible copy. Refused.'**
  String get errTagUidMismatch;

  /// No description provided for @errTagNotFound.
  ///
  /// In en, this message translates to:
  /// **'Unknown tag'**
  String get errTagNotFound;

  /// No description provided for @errTagBlocked.
  ///
  /// In en, this message translates to:
  /// **'This tag is blocked'**
  String get errTagBlocked;

  /// No description provided for @errTagNotActive.
  ///
  /// In en, this message translates to:
  /// **'Tag not activated'**
  String get errTagNotActive;

  /// No description provided for @errTagAlreadyEnrolled.
  ///
  /// In en, this message translates to:
  /// **'Tag already enrolled'**
  String get errTagAlreadyEnrolled;

  /// No description provided for @errPriceMismatch.
  ///
  /// In en, this message translates to:
  /// **'Prices changed. Check the basket and try again.'**
  String get errPriceMismatch;

  /// No description provided for @errAgeCheck.
  ///
  /// In en, this message translates to:
  /// **'Age check required'**
  String get errAgeCheck;

  /// No description provided for @errTip.
  ///
  /// In en, this message translates to:
  /// **'Tip not allowed or too high'**
  String get errTip;

  /// No description provided for @errForbidden.
  ///
  /// In en, this message translates to:
  /// **'Not allowed for this account or stand'**
  String get errForbidden;

  /// No description provided for @errSessionExpired.
  ///
  /// In en, this message translates to:
  /// **'Session expired - log in again'**
  String get errSessionExpired;

  /// No description provided for @errDeviceRevoked.
  ///
  /// In en, this message translates to:
  /// **'This device was revoked'**
  String get errDeviceRevoked;

  /// No description provided for @errEventClosed.
  ///
  /// In en, this message translates to:
  /// **'Event is not open'**
  String get errEventClosed;

  /// No description provided for @errWrongPin.
  ///
  /// In en, this message translates to:
  /// **'Wrong PIN'**
  String get errWrongPin;

  /// No description provided for @errPinLocked.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts - locked for 15 minutes'**
  String get errPinLocked;

  /// No description provided for @errEnrollCode.
  ///
  /// In en, this message translates to:
  /// **'Code invalid, expired or already used'**
  String get errEnrollCode;

  /// No description provided for @errLimit.
  ///
  /// In en, this message translates to:
  /// **'Limit exceeded (limit {limit}, would be {wouldBe})'**
  String errLimit(String limit, String wouldBe);

  /// No description provided for @errRefRequired.
  ///
  /// In en, this message translates to:
  /// **'Payment reference required'**
  String get errRefRequired;

  /// No description provided for @errRefUsed.
  ///
  /// In en, this message translates to:
  /// **'Payment reference already used'**
  String get errRefUsed;

  /// No description provided for @errAmount.
  ///
  /// In en, this message translates to:
  /// **'Invalid amount'**
  String get errAmount;

  /// No description provided for @errRateLimited.
  ///
  /// In en, this message translates to:
  /// **'Too many requests - wait a moment'**
  String get errRateLimited;

  /// No description provided for @errDuplicate.
  ///
  /// In en, this message translates to:
  /// **'Operation id already used with other data'**
  String get errDuplicate;

  /// No description provided for @errOfflineCap.
  ///
  /// In en, this message translates to:
  /// **'Offline limit reached for this tag ({spent}/{cap} tokens). Go online.'**
  String errOfflineCap(String cap, String spent);

  /// No description provided for @errNfcUnavailable.
  ///
  /// In en, this message translates to:
  /// **'NFC is off or unavailable on this device'**
  String get errNfcUnavailable;

  /// No description provided for @errNfc.
  ///
  /// In en, this message translates to:
  /// **'Tag read failed - hold still and retry'**
  String get errNfc;

  /// No description provided for @errReadback.
  ///
  /// In en, this message translates to:
  /// **'Write verification failed'**
  String get errReadback;

  /// No description provided for @errNetwork.
  ///
  /// In en, this message translates to:
  /// **'No connection to the server'**
  String get errNetwork;

  /// No description provided for @errGeneric.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong ({code})'**
  String errGeneric(String code);

  /// No description provided for @tabTopup.
  ///
  /// In en, this message translates to:
  /// **'Top-up'**
  String get tabTopup;

  /// No description provided for @tabCashout.
  ///
  /// In en, this message translates to:
  /// **'Refund'**
  String get tabCashout;

  /// No description provided for @tapTagFirst.
  ///
  /// In en, this message translates to:
  /// **'Read a tag to start'**
  String get tapTagFirst;

  /// No description provided for @readTag.
  ///
  /// In en, this message translates to:
  /// **'Read tag'**
  String get readTag;

  /// No description provided for @otherTag.
  ///
  /// In en, this message translates to:
  /// **'Other tag'**
  String get otherTag;

  /// No description provided for @amountTokens.
  ///
  /// In en, this message translates to:
  /// **'Tokens'**
  String get amountTokens;

  /// No description provided for @payMethod.
  ///
  /// In en, this message translates to:
  /// **'Payment method'**
  String get payMethod;

  /// No description provided for @methodCash.
  ///
  /// In en, this message translates to:
  /// **'Cash'**
  String get methodCash;

  /// No description provided for @methodSumupCard.
  ///
  /// In en, this message translates to:
  /// **'SumUp card'**
  String get methodSumupCard;

  /// No description provided for @methodSumupOnline.
  ///
  /// In en, this message translates to:
  /// **'SumUp online (QR)'**
  String get methodSumupOnline;

  /// No description provided for @methodWero.
  ///
  /// In en, this message translates to:
  /// **'Wero'**
  String get methodWero;

  /// No description provided for @methodBancontact.
  ///
  /// In en, this message translates to:
  /// **'Bancontact / Payconiq'**
  String get methodBancontact;

  /// No description provided for @extRef.
  ///
  /// In en, this message translates to:
  /// **'Payment reference'**
  String get extRef;

  /// No description provided for @confirmTopup.
  ///
  /// In en, this message translates to:
  /// **'Confirm top-up ({amount})'**
  String confirmTopup(String amount);

  /// No description provided for @topupDone.
  ///
  /// In en, this message translates to:
  /// **'+{tokens} tokens'**
  String topupDone(int tokens);

  /// No description provided for @refundAll.
  ///
  /// In en, this message translates to:
  /// **'Refund whole balance'**
  String get refundAll;

  /// No description provided for @cashoutDone.
  ///
  /// In en, this message translates to:
  /// **'Refunded {amount}'**
  String cashoutDone(String amount);

  /// No description provided for @encodeStart.
  ///
  /// In en, this message translates to:
  /// **'Start'**
  String get encodeStart;

  /// No description provided for @encodeStop.
  ///
  /// In en, this message translates to:
  /// **'Stop'**
  String get encodeStop;

  /// No description provided for @encodeCounter.
  ///
  /// In en, this message translates to:
  /// **'{n} / {total}'**
  String encodeCounter(int n, int total);

  /// No description provided for @encodeWaiting.
  ///
  /// In en, this message translates to:
  /// **'Tap the next tag'**
  String get encodeWaiting;

  /// No description provided for @encodeOk.
  ///
  /// In en, this message translates to:
  /// **'Tag …{code} ready'**
  String encodeOk(String code);

  /// No description provided for @encodeProtected.
  ///
  /// In en, this message translates to:
  /// **'password protected'**
  String get encodeProtected;

  /// No description provided for @encodeNoProtection.
  ///
  /// In en, this message translates to:
  /// **'no password set (chip or browser limit)'**
  String get encodeNoProtection;

  /// No description provided for @encodeWebLimit.
  ///
  /// In en, this message translates to:
  /// **'Browser mode: URL is written, but password protection needs the Android app.'**
  String get encodeWebLimit;

  /// No description provided for @tabCatalog.
  ///
  /// In en, this message translates to:
  /// **'Catalog'**
  String get tabCatalog;

  /// No description provided for @tabDevices.
  ///
  /// In en, this message translates to:
  /// **'Devices'**
  String get tabDevices;

  /// No description provided for @tabReports.
  ///
  /// In en, this message translates to:
  /// **'Reports'**
  String get tabReports;

  /// No description provided for @catalogInfo.
  ///
  /// In en, this message translates to:
  /// **'Catalog v{version} · 1 token = {price}'**
  String catalogInfo(int version, String price);

  /// No description provided for @newEnrollCode.
  ///
  /// In en, this message translates to:
  /// **'New enrolment code'**
  String get newEnrollCode;

  /// No description provided for @liability.
  ///
  /// In en, this message translates to:
  /// **'Outstanding tokens'**
  String get liability;

  /// No description provided for @liabilityDetail.
  ///
  /// In en, this message translates to:
  /// **'{wallets} wallets with balance, {negative} negative'**
  String liabilityDetail(int wallets, int negative);

  /// No description provided for @topupsByMethod.
  ///
  /// In en, this message translates to:
  /// **'Top-ups by method'**
  String get topupsByMethod;

  /// No description provided for @salesByItem.
  ///
  /// In en, this message translates to:
  /// **'Sales by item'**
  String get salesByItem;

  /// No description provided for @guestTitle.
  ///
  /// In en, this message translates to:
  /// **'Your Jeton balance'**
  String get guestTitle;

  /// No description provided for @guestWorth.
  ///
  /// In en, this message translates to:
  /// **'worth {amount}'**
  String guestWorth(String amount);

  /// No description provided for @guestNotFound.
  ///
  /// In en, this message translates to:
  /// **'Tag not found'**
  String get guestNotFound;

  /// No description provided for @guestBlocked.
  ///
  /// In en, this message translates to:
  /// **'This tag is blocked. Please see the cash desk.'**
  String get guestBlocked;

  /// No description provided for @recentActivity.
  ///
  /// In en, this message translates to:
  /// **'Recent activity'**
  String get recentActivity;

  /// No description provided for @guestRefundUntil.
  ///
  /// In en, this message translates to:
  /// **'Refundable until {date}'**
  String guestRefundUntil(String date);

  /// No description provided for @guestExpiry.
  ///
  /// In en, this message translates to:
  /// **'Tokens expire {date}'**
  String guestExpiry(String date);

  /// No description provided for @guestOrganizer.
  ///
  /// In en, this message translates to:
  /// **'Organised by {name} ({number})'**
  String guestOrganizer(String name, String number);

  /// No description provided for @policy.
  ///
  /// In en, this message translates to:
  /// **'Policy'**
  String get policy;

  /// No description provided for @kindTopup.
  ///
  /// In en, this message translates to:
  /// **'Top-up'**
  String get kindTopup;

  /// No description provided for @kindPromo.
  ///
  /// In en, this message translates to:
  /// **'Free tokens'**
  String get kindPromo;

  /// No description provided for @kindSale.
  ///
  /// In en, this message translates to:
  /// **'Purchase'**
  String get kindSale;

  /// No description provided for @kindRefund.
  ///
  /// In en, this message translates to:
  /// **'Order refund'**
  String get kindRefund;

  /// No description provided for @kindCashout.
  ///
  /// In en, this message translates to:
  /// **'Refund'**
  String get kindCashout;

  /// No description provided for @kindReplacement.
  ///
  /// In en, this message translates to:
  /// **'Tag replaced'**
  String get kindReplacement;

  /// No description provided for @kindOther.
  ///
  /// In en, this message translates to:
  /// **'Adjustment'**
  String get kindOther;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'fr', 'nl'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
    case 'nl':
      return AppLocalizationsNl();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
