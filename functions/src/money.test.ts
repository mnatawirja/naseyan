import { describe, expect, it } from 'vitest';
import { markup, promoAmount, promoBlockReason, totals, type Line, type Promo } from './money';

const line = (o: Partial<Line>): Line => ({ key: 'k', itemId: 'i', name: 'Item', categoryId: 'kopi', station: 'bar', qty: 1, basePrice: 0, modPrice: 0, unitPrice: 0, mods: '', note: '', sentAt: null, ...o });
const loyalty = { on: true, earnPer: 10000, pointValue: 100, minRedeem: 50 };
const outlet = { tax: 10, service: 5 };

describe('totals', () => {
  const lines = [line({ itemId: 'a', categoryId: 'kopi', unitPrice: 30000, qty: 2 }), line({ itemId: 'b', categoryId: 'makanan', unitPrice: 25000 })];
  const promo: Promo = { id: 'p', name: 'Pagi', active: true, kind: 'pct', value: 20, maxDiscount: 10000, categoryIds: ['kopi'] };

  it('applies promo, manual, reward and points in order, then service and tax', () => {
    const t = totals({ lines, channel: 'table', outlet, loyalty, promoDef: promo, discounts: {
      promo: { id: 'p', label: 'Pagi' },
      manual: { kind: 'amt', value: 5000, label: 'Staff', byStaff: 's', approvedBy: 's' },
      reward: { id: 'r', kind: 'free', value: 0, label: 'Free food', categoryIds: ['makanan'] },
      pointsRedeemed: 50,
    } });
    expect(t.subtotal).toBe(85000);
    expect(t.parts.map(p => p.amount)).toEqual([10000, 5000, 25000, 5000]); // promo capped at 10k
    expect(t.net).toBe(40000);
    expect(t.service).toBe(2000);
    expect(t.tax).toBe(4200);
    expect(t.total).toBe(46200);
  });
  it('charges no service on takeaway', () => {
    const t = totals({ lines, channel: 'counter', outlet, loyalty, discounts: {} });
    expect(t.service).toBe(0);
    expect(t.total).toBe(93500);
  });
  it('never discounts below zero', () => {
    const t = totals({ lines, channel: 'counter', outlet, loyalty, discounts: { manual: { kind: 'pct', value: 100, label: 'x', byStaff: 's', approvedBy: 's' }, pointsRedeemed: 999 } });
    expect(t.net).toBe(0);
    expect(t.total).toBe(0);
  });
  it('backs tax out when prices include it', () => {
    const t = totals({ lines: [line({ unitPrice: 11000 })], channel: 'counter', outlet: { tax: 10, service: 0, taxIncluded: true }, loyalty, discounts: {} });
    expect(t.total).toBe(11000);
    expect(t.tax).toBe(1000);
  });
});

describe('promos', () => {
  const lines = [line({ unitPrice: 30000, categoryId: 'kopi' })];
  it('is blocked outside its hours', () => {
    const p: Promo = { id: 'p', name: 'Pagi', active: true, kind: 'pct', value: 20, from: '07:00', to: '10:00' };
    expect(promoBlockReason(p, { outletId: 'o', channel: 'counter', lines, now: new Date(2026, 9, 17, 8, 30) })).toBe('');
    expect(promoBlockReason(p, { outletId: 'o', channel: 'counter', lines, now: new Date(2026, 9, 17, 14, 0) })).toMatch('Valid');
  });
  it('respects minimum spend and channels', () => {
    const p: Promo = { id: 'p', name: 'V', active: true, kind: 'pct', value: 10, minSpend: 50000, channels: ['counter'] };
    expect(promoBlockReason(p, { outletId: 'o', channel: 'counter', lines, now: new Date() })).toMatch('Minimum');
    expect(promoBlockReason({ ...p, minSpend: 0 }, { outletId: 'o', channel: 'gofood', lines, now: new Date() })).toMatch('order type');
  });
  it('caps amount promos at the eligible base', () => {
    expect(promoAmount({ id: 'p', name: 'x', active: true, kind: 'amt', value: 50000 }, lines)).toBe(30000);
  });
});

describe('delivery markup', () => {
  it('rounds up to the next Rp 500', () => {
    expect(markup(28000, 20)).toBe(34000);
    expect(markup(25000, 15)).toBe(29000);
    expect(markup(25000, 0)).toBe(25000);
  });
});
