import 'package:flutter_test/flutter_test.dart';
import 'package:naseyan/core/money.dart';

Line line({String itemId = 'i', String cat = 'kopi', int price = 28000, int qty = 1}) => Line(
    key: 'k', itemId: itemId, name: 'Item', categoryId: cat, station: 'bar', qty: qty,
    basePrice: price, modPrice: 0, unitPrice: price);

void main() {
  const outlet = OutletTax(tax: 10, service: 5);
  final lines = [line(itemId: 'a', price: 30000, qty: 2), line(itemId: 'b', cat: 'makanan', price: 25000)];

  test('same result as the server for the full discount stack', () {
    final t = totals(
      lines: lines,
      channel: Channel.table,
      outlet: outlet,
      promo: Promo(id: 'p', name: 'Pagi', kind: 'pct', value: 20, maxDiscount: 10000, categoryIds: ['kopi']),
      manual: (kind: 'amt', value: 5000, label: 'Staff'),
      reward: Reward(id: 'r', kind: 'free', value: 0, label: 'Free food', categoryIds: ['makanan']),
      pointsRedeemed: 50,
    );
    expect(t.subtotal, 85000);
    expect(t.parts.map((p) => p.amount).toList(), [10000, 5000, 25000, 5000]);
    expect(t.net, 40000);
    expect(t.service, 2000);
    expect(t.tax, 4200);
    expect(t.total, 46200);
  });

  test('no service charge on takeaway', () {
    final t = totals(lines: lines, channel: Channel.counter, outlet: outlet);
    expect(t.service, 0);
    expect(t.total, 93500);
  });

  test('delivery markup rounds up to Rp 500', () {
    expect(markup(28000, 20), 34000);
    expect(markup(25000, 15), 29000);
  });
}
