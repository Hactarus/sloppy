import '../models/models.dart';

/// Seed data shared by the fake API and the mock NFC service.
class DemoTag {
  final String code, uid;
  final int balance;
  const DemoTag(this.code, this.uid, this.balance);
  String get url => 'https://jeton.example/t/$code';
}

const demoTags = <DemoTag>[
  DemoTag('0123456789ABCDEFGHJ0', '04A1B2C3D4E5F6', 20),
  DemoTag('1123456789ABCDEFGHJG', '04A1B2C3D4E5F7', 8),
  DemoTag('2123456789ABCDEFGHJ0', '04A1B2C3D4E5F8', 3),
  DemoTag('3123456789ABCDEFGHJG', '04A1B2C3D4E5F9', 0),
  DemoTag('4123456789ABCDEFGHJ0', '04A1B2C3D4E5FA', 50),
];

const demoEventId = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0000';
const demoBarId = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0001';
const demoFoodId = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0002';
const demoCashdeskId = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0003';

/// (id, display name, role, pin, standId)
const demoStaff = <(String, String, String, String, String?)>[
  ('0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0a01', 'Alice (admin)', Roles.admin, '1111', null),
  ('0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0a02', 'Bob (caisse)', Roles.cashier, '2222', demoCashdeskId),
  ('0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0a03', 'Chloe (bar)', Roles.vendor, '3333', demoBarId),
  ('0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0a04', 'Dan (frites)', Roles.vendor, '4444', demoFoodId),
  ('0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0a05', 'Eva (audit)', Roles.auditor, '5555', null),
];

Catalog demoCatalog(int version) {
  const catDrinks = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0c01';
  const catFood = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0c02';
  const catIce = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0c03';
  Item it(int n, String stand, String cat, String name, int price, String vat,
          String icon, String color,
          {Json? i18n, int? minAge}) =>
      Item(
          id: '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f1${n.toString().padLeft(3, '0')}',
          standId: stand,
          categoryId: cat,
          name: name,
          nameI18n: i18n,
          priceTokens: price,
          vatCategory: vat,
          icon: icon,
          color: color,
          minAge: minAge,
          sortOrder: n);
  return Catalog(
    const EventConfig(
        id: demoEventId,
        name: 'Fête du Quartier',
        termsVersion: 'tos-2026-07',
        status: 'open'),
    version,
    const [
      Stand(demoBarId, 'Bar', 'stand', {'fr': 'Bar', 'nl': 'Bar', 'en': 'Bar'}, 1, true),
      Stand(demoFoodId, 'Frites', 'stand', {'fr': 'Friterie', 'nl': 'Frituur', 'en': 'Fries'}, 2, true),
      Stand(demoCashdeskId, 'Caisse', 'cashdesk', null, 3, true),
    ],
    const [
      Category(catDrinks, 'Boissons', {'fr': 'Boissons', 'nl': 'Dranken', 'en': 'Drinks'}, 1, true),
      Category(catFood, 'Nourriture', {'fr': 'Nourriture', 'nl': 'Eten', 'en': 'Food'}, 2, true),
      Category(catIce, 'Glaces', {'fr': 'Glaces', 'nl': 'IJs', 'en': 'Ice cream'}, 3, true),
    ],
    [
      it(1, demoBarId, catDrinks, 'Pils 25cl', 1, 'ALCOHOL', 'beer', '#F4B400',
          i18n: {'fr': 'Bière 25cl', 'nl': 'Pils 25cl', 'en': 'Beer 25cl'}, minAge: 16),
      it(2, demoBarId, catDrinks, 'Pils 50cl', 2, 'ALCOHOL', 'beer', '#F4B400',
          i18n: {'fr': 'Bière 50cl', 'nl': 'Pils 50cl', 'en': 'Beer 50cl'}, minAge: 16),
      it(3, demoBarId, catDrinks, 'Vin', 2, 'ALCOHOL', 'wine', '#B3261E',
          i18n: {'fr': 'Vin', 'nl': 'Wijn', 'en': 'Wine'}, minAge: 16),
      it(4, demoBarId, catDrinks, 'Cola', 1, 'DRINK_SOFT', 'soda', '#5D4037',
          i18n: {'fr': 'Soda', 'nl': 'Frisdrank', 'en': 'Soft drink'}),
      it(5, demoBarId, catDrinks, 'Eau', 1, 'DRINK_SOFT', 'water', '#1A73E8',
          i18n: {'fr': 'Eau', 'nl': 'Water', 'en': 'Water'}),
      it(6, demoBarId, catDrinks, 'Cafe', 1, 'DRINK_SOFT', 'coffee', '#6D4C41',
          i18n: {'fr': 'Café', 'nl': 'Koffie', 'en': 'Coffee'}),
      it(7, demoFoodId, catFood, 'Frites', 3, 'FOOD', 'fries', '#F9AB00',
          i18n: {'fr': 'Frites', 'nl': 'Frietjes', 'en': 'Fries'}),
      it(8, demoFoodId, catFood, 'Hot-dog', 3, 'FOOD', 'hotdog', '#D84315',
          i18n: {'fr': 'Hot-dog', 'nl': 'Hotdog', 'en': 'Hot dog'}),
      it(9, demoFoodId, catFood, 'Burger', 4, 'FOOD', 'burger', '#8D6E63',
          i18n: {'fr': 'Burger', 'nl': 'Burger', 'en': 'Burger'}),
      it(10, demoFoodId, catIce, 'Glace', 2, 'ICE_CREAM', 'icecream', '#EC407A',
          i18n: {'fr': 'Glace', 'nl': 'IJsje', 'en': 'Ice cream'}),
    ],
  );
}
