/// Bill maths. Dart port of functions/src/money.ts — keep both identical and keep
/// test/money_test.dart in step with functions/src/money.test.ts.
/// All amounts are whole rupiah.
library;

enum Channel { counter, table, qr, gofood, grab, shopee }

extension ChannelX on Channel {
  bool get isDelivery => this == Channel.gofood || this == Channel.grab || this == Channel.shopee;
  bool get isDineIn => this == Channel.table || this == Channel.qr;
}

class Line {
  Line({
    required this.key,
    required this.itemId,
    required this.name,
    required this.categoryId,
    required this.station,
    required this.qty,
    required this.basePrice,
    required this.modPrice,
    required this.unitPrice,
    this.mods = '',
    this.note = '',
    this.sentAt,
    this.optionRefs = const [],
  });
  final String key, itemId, name, categoryId, station, mods, note;
  int qty;
  final int basePrice, modPrice, unitPrice;
  int? sentAt;
  final List<({String groupId, int index})> optionRefs;
  int get amount => unitPrice * qty;

  Map<String, Object?> toJson() => {
        'key': key, 'itemId': itemId, 'name': name, 'categoryId': categoryId, 'station': station,
        'qty': qty, 'basePrice': basePrice, 'modPrice': modPrice, 'unitPrice': unitPrice,
        'mods': mods, 'note': note, 'sentAt': sentAt,
        'optionRefs': [for (final r in optionRefs) {'groupId': r.groupId, 'index': r.index}],
      };
}

class Promo {
  Promo({required this.id, required this.name, required this.kind, required this.value, this.active = true,
      this.maxDiscount = 0, this.minSpend = 0, this.categoryIds = const [], this.days = const [],
      this.from, this.to, this.channels = const [], this.outletIds = const [], this.startDate, this.endDate});
  final String id, name, kind; // kind: 'pct' | 'amt'
  final int value, maxDiscount, minSpend;
  final bool active;
  final List<String> categoryIds, outletIds;
  final List<int> days;
  final List<Channel> channels;
  final String? from, to, startDate, endDate;
}

class Reward {
  Reward({required this.id, required this.kind, required this.value, required this.label, this.maxValue = 0, this.categoryIds = const []});
  final String id, kind, label; // kind: 'free' | 'amt' | 'pct'
  final int value, maxValue;
  final List<String> categoryIds;
}

class OutletTax {
  const OutletTax({required this.tax, required this.service, this.taxIncluded = false});
  final num tax, service;
  final bool taxIncluded;
}

class DiscountPart {
  DiscountPart(this.kind, this.label, this.amount);
  final String kind, label;
  int amount;
}

class Totals {
  Totals(this.subtotal, this.parts, this.discount, this.net, this.service, this.tax, this.total);
  final int subtotal, discount, net, service, tax, total;
  final List<DiscountPart> parts;
}

int markup(int price, num markupPct) =>
    markupPct == 0 ? price : ((price * (1 + markupPct / 100)) / 500).ceil() * 500;

int promoBase(Promo p, List<Line> lines) =>
    lines.where((l) => p.categoryIds.isEmpty || p.categoryIds.contains(l.categoryId)).fold(0, (s, l) => s + l.amount);

int promoAmount(Promo p, List<Line> lines) {
  final base = promoBase(p, lines);
  if (base == 0) return 0;
  var a = p.kind == 'pct' ? (base * p.value / 100).round() : (p.value < base ? p.value : base);
  if (p.maxDiscount > 0 && a > p.maxDiscount) a = p.maxDiscount;
  return a;
}

int rewardAmount(Reward? r, List<Line> lines, int subtotal) {
  if (r == null) return 0;
  final el = lines.where((l) => r.categoryIds.isEmpty || r.categoryIds.contains(l.categoryId));
  var a = switch (r.kind) {
    'free' => el.fold(0, (m, l) => l.unitPrice > m ? l.unitPrice : m),
    'amt' => r.value < subtotal ? r.value : subtotal,
    _ => (el.fold(0, (s, l) => s + l.amount) * r.value / 100).round(),
  };
  if (r.maxValue > 0 && a > r.maxValue) a = r.maxValue;
  return a;
}

/// promo → manual → reward → points, each capped so the bill never goes below zero.
Totals totals({
  required List<Line> lines,
  required Channel channel,
  required OutletTax outlet,
  Promo? promo,
  ({String kind, int value, String label})? manual,
  Reward? reward,
  int pointsRedeemed = 0,
  int pointValue = 100,
}) {
  final subtotal = lines.fold(0, (s, l) => s + l.amount);
  final parts = <DiscountPart>[
    if (promo != null) DiscountPart('promo', promo.name, promoAmount(promo, lines)),
    if (manual != null)
      DiscountPart('manual', manual.label, manual.kind == 'pct' ? (subtotal * manual.value / 100).round() : manual.value),
    if (reward != null) DiscountPart('reward', reward.label, rewardAmount(reward, lines, subtotal)),
    if (pointsRedeemed > 0) DiscountPart('points', '$pointsRedeemed points', pointsRedeemed * pointValue),
  ];
  var discount = 0;
  for (final p in parts) {
    final room = subtotal - discount;
    p.amount = p.amount < 0 ? 0 : (p.amount > room ? room : p.amount);
    discount += p.amount;
  }
  final net = subtotal - discount;
  final service = channel.isDineIn ? (net * outlet.service / 100).round() : 0;
  int tax, total;
  if (outlet.taxIncluded) {
    total = net + service;
    tax = (total - total / (1 + outlet.tax / 100)).round();
  } else {
    tax = ((net + service) * outlet.tax / 100).round();
    total = net + service + tax;
  }
  return Totals(subtotal, parts.where((p) => p.amount > 0).toList(), discount, net, service, tax, total);
}
