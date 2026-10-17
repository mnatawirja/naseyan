import { describe, expect, it } from 'vitest';
import { applyLoyalty, isoWeek, periodKey, reverseLoyalty, type Customer, type Mission, type StampCard } from './loyalty';
import type { Line } from './money';

const line = (o: Partial<Line>): Line => ({ key: 'k', itemId: 'i', name: 'Item', categoryId: 'kopi', station: 'bar', qty: 1, basePrice: 0, modPrice: 0, unitPrice: 28000, mods: '', note: '', sentAt: null, ...o });
const config = { on: true, earnPer: 10000, pointValue: 100, minRedeem: 50 };
const blank = (): Customer => ({ name: 'Rina', phone: '6281234567890', points: 0, lifetime: { spend: 0, visits: 0 }, stamps: {}, missions: {}, rewards: [] });
const card: StampCard = { id: 'kopi', name: 'Kopi card', active: true, stampsNeeded: 10, categoryIds: ['kopi'], onePerOrder: false, reward: { kind: 'free', value: 0, maxValue: 36000, label: 'Free coffee', categoryIds: ['kopi'] }, rewardValidDays: 30 };
const visits: Mission = { id: 'reg', name: 'Regular', active: true, metric: 'visits', target: 4, period: 'month', reward: { kind: 'points', value: 200 } };
const taste: Mission = { id: 'taste', name: 'Taste explorer', active: true, metric: 'distinct', target: 3, period: 'month', categoryIds: ['kopi'], reward: { kind: 'amt', value: 20000, label: 'Rp 20.000 off' }, rewardValidDays: 14 };
let n = 0; const newId = () => 'r' + ++n;
const now = new Date(2026, 9, 17, 10);
const order = (o: Partial<{ net: number; lines: Line[]; pointsRedeemed: number; rewardUsedId: string }> = {}) => ({ id: 'o' + ++n, number: 'A-001', outletId: 'oa', net: 56000, total: 61600, lines: [line({ qty: 2 })], pointsRedeemed: 0, ...o });

describe('applyLoyalty', () => {
  it('earns 1 point per Rp 10.000 net and counts the visit', () => {
    const { customer, result } = applyLoyalty({ customer: blank(), order: order(), config, stampCards: [], missions: [], now, newId });
    expect(result.pointsEarned).toBe(5);
    expect(customer.points).toBe(5);
    expect(customer.lifetime).toEqual({ spend: 56000, visits: 1 });
  });
  it('fills a stamp card and issues the reward with expiry', () => {
    let c = blank(); c.stamps.kopi = 9;
    const { customer, result } = applyLoyalty({ customer: c, order: order(), config, stampCards: [card], missions: [], now, newId });
    expect(customer.stamps.kopi).toBe(1);
    expect(customer.rewards).toHaveLength(1);
    expect(customer.rewards[0].expiresAt).toBe(now.getTime() + 30 * 864e5);
    expect(result.rewardsUnlocked).toEqual(['Free coffee']);
  });
  it('completes a visits mission once per month and pays bonus points', () => {
    let c = blank();
    for (let i = 0; i < 5; i++) c = applyLoyalty({ customer: c, order: order(), config, stampCards: [], missions: [visits], now, newId }).customer;
    expect(c.points).toBe(5 * 5 + 200);
    expect(c.missions['reg_m202610'].doneAt).toBeDefined();
  });
  it('tracks distinct items for a taste mission', () => {
    let c = blank();
    for (const id of ['a', 'b', 'a', 'c']) c = applyLoyalty({ customer: c, order: order({ lines: [line({ itemId: id })] }), config, stampCards: [], missions: [taste], now, newId }).customer;
    expect(c.rewards.map(r => r.label)).toEqual(['Rp 20.000 off']);
  });
  it('removes the reward that was used and refuses to overspend points', () => {
    const c = blank(); c.points = 10; c.rewards = [{ id: 'x', kind: 'free', value: 0, label: 'Free coffee' }];
    const { customer } = applyLoyalty({ customer: c, order: order({ rewardUsedId: 'x' }), config, stampCards: [], missions: [], now, newId });
    expect(customer.rewards).toHaveLength(0);
    expect(() => applyLoyalty({ customer: c, order: order({ pointsRedeemed: 50 }), config, stampCards: [], missions: [], now, newId })).toThrow('POINTS_EXCEED_BALANCE');
  });
  it('reverses points on refund', () => {
    const c = blank(); c.points = 105; c.lifetime = { spend: 56000, visits: 1 };
    const { customer } = reverseLoyalty(c, { ...order({ pointsRedeemed: 50 }), pointsEarned: 5 }, now);
    expect(customer.points).toBe(150);
    expect(customer.lifetime.visits).toBe(0);
  });
});

describe('periods', () => {
  it('uses ISO weeks and calendar months', () => {
    expect(isoWeek(new Date(2026, 9, 17))).toBe('2026-42');
    expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-53');
    expect(periodKey('month', now)).toBe('m202610');
  });
});
