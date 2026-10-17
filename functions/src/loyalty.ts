/**
 * Loyalty engine: points, stamp cards and missions. Runs only on the server
 * (Cloud Function on order paid / refunded), so a tablet cannot award points.
 * Pure functions: given a customer and an order, return the new customer state.
 */
import type { Line, LoyaltyConfig, Reward } from './money';

export interface StampCard {
  id: string; name: string; active: boolean; stampsNeeded: number; categoryIds: string[];
  onePerOrder: boolean; reward: Omit<Reward, 'id'>; rewardValidDays?: number | null;
}
export type MissionMetric = 'visits' | 'spend' | 'qty' | 'distinct';
export interface Mission {
  id: string; name: string; description?: string; active: boolean; metric: MissionMetric; target: number;
  period: 'week' | 'month' | 'all'; categoryIds?: string[]; startDate?: string | null; endDate?: string | null;
  reward: { kind: 'points'; value: number } | (Omit<Reward, 'id'>); rewardValidDays?: number | null;
}
export interface MissionProgress { progress: number; itemIds: string[]; doneAt?: number; updatedAt: number }

export interface Customer {
  name: string; phone: string; points: number;
  lifetime: { spend: number; visits: number };
  stamps: Record<string, number>;
  missions: Record<string, MissionProgress>; // key: `${missionId}_${periodKey}`
  rewards: Reward[];
  lastVisitAt?: number;
}

export interface PaidOrder {
  id: string; number: string; outletId: string; net: number; total: number; lines: Line[];
  pointsRedeemed: number; rewardUsedId?: string | null;
}

export interface LoyaltyResult { pointsEarned: number; stamps: string[]; missionsCompleted: string[]; rewardsUnlocked: string[] }
export interface LedgerEntry { at: number; orderId: string; orderNumber: string; outletId: string; total: number; points: number; note: string }

const pad = (n: number) => String(n).padStart(2, '0');
export function isoWeek(d: Date): string {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const w1 = new Date(t.getFullYear(), 0, 4);
  const week = 1 + Math.round(((t.getTime() - w1.getTime()) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return `${t.getFullYear()}-${pad(week)}`;
}
export function periodKey(period: Mission['period'], now: Date): string {
  if (period === 'week') return 'w' + isoWeek(now);
  if (period === 'all') return 'all';
  return `m${now.getFullYear()}${pad(now.getMonth() + 1)}`;
}
const dayKey = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
export const missionLive = (m: Mission, now: Date) => {
  const k = dayKey(now);
  return m.active && (!m.startDate || k >= m.startDate) && (!m.endDate || k <= m.endDate);
};

export function applyLoyalty(args: {
  customer: Customer; order: PaidOrder; config: LoyaltyConfig; stampCards: StampCard[]; missions: Mission[];
  now: Date; newId: () => string;
}): { customer: Customer; result: LoyaltyResult; ledger: LedgerEntry } {
  const { order, config, stampCards, missions, now, newId } = args;
  const c: Customer = structuredClone(args.customer);
  const t = now.getTime();
  const result: LoyaltyResult = { pointsEarned: 0, stamps: [], missionsCompleted: [], rewardsUnlocked: [] };

  if (order.pointsRedeemed > c.points) throw new Error('POINTS_EXCEED_BALANCE');
  c.points -= order.pointsRedeemed;
  if (config.on) result.pointsEarned = Math.floor(order.net / config.earnPer);
  c.points += result.pointsEarned;
  c.lifetime.spend += order.net;
  c.lifetime.visits += 1;
  c.lastVisitAt = t;
  c.rewards = c.rewards.filter(r => r.id !== order.rewardUsedId && (!r.expiresAt || r.expiresAt > t));

  for (const sc of stampCards) {
    if (!sc.active || sc.stampsNeeded < 1) continue;
    let q = order.lines.filter(l => sc.categoryIds.includes(l.categoryId)).reduce((s, l) => s + l.qty, 0);
    if (sc.onePerOrder) q = Math.min(q, 1);
    if (!q) continue;
    let cur = (c.stamps[sc.id] || 0) + q;
    result.stamps.push(`${sc.name} +${q}`);
    while (cur >= sc.stampsNeeded) {
      cur -= sc.stampsNeeded;
      const r: Reward = { ...sc.reward, id: newId(), source: sc.name, createdAt: t, expiresAt: sc.rewardValidDays ? t + sc.rewardValidDays * 864e5 : null };
      c.rewards.push(r); result.rewardsUnlocked.push(r.label);
    }
    c.stamps[sc.id] = cur;
  }

  for (const m of missions) {
    if (!missionLive(m, now)) continue;
    const key = `${m.id}_${periodKey(m.period, now)}`;
    const st: MissionProgress = c.missions[key] || { progress: 0, itemIds: [], updatedAt: t };
    if (st.doneAt) continue;
    const el = order.lines.filter(l => !m.categoryIds?.length || m.categoryIds.includes(l.categoryId));
    if (m.metric === 'visits') st.progress += 1;
    else if (m.metric === 'spend') st.progress += order.net;
    else if (m.metric === 'qty') st.progress += el.reduce((s, l) => s + l.qty, 0);
    else { for (const l of el) if (!st.itemIds.includes(l.itemId)) st.itemIds.push(l.itemId); st.progress = st.itemIds.length; }
    st.updatedAt = t;
    if (st.progress >= m.target) {
      st.doneAt = t; result.missionsCompleted.push(m.name);
      if (m.reward.kind === 'points') { c.points += m.reward.value; result.rewardsUnlocked.push(`${m.reward.value} bonus points`); }
      else {
        const r: Reward = { ...(m.reward as Omit<Reward, 'id'>), id: newId(), source: m.name, createdAt: t, expiresAt: m.rewardValidDays ? t + m.rewardValidDays * 864e5 : null };
        c.rewards.push(r); result.rewardsUnlocked.push(r.label);
      }
    }
    c.missions[key] = st;
  }
  for (const k of Object.keys(c.missions)) if (c.missions[k].updatedAt < t - 120 * 864e5) delete c.missions[k];

  const ledger: LedgerEntry = { at: t, orderId: order.id, orderNumber: order.number, outletId: order.outletId, total: order.total, points: result.pointsEarned - order.pointsRedeemed, note: result.rewardsUnlocked.join(', ') };
  return { customer: c, result, ledger };
}

/** Full refund: take back points earned, return points used. Stamps and missions are not reversed. */
export function reverseLoyalty(customer: Customer, order: PaidOrder & { pointsEarned: number }, now: Date): { customer: Customer; ledger: LedgerEntry } {
  const c: Customer = structuredClone(customer);
  c.points = c.points + order.pointsRedeemed - order.pointsEarned;
  c.lifetime.spend -= order.net;
  c.lifetime.visits = Math.max(0, c.lifetime.visits - 1);
  return { customer: c, ledger: { at: now.getTime(), orderId: order.id, orderNumber: order.number, outletId: order.outletId, total: -order.total, points: order.pointsRedeemed - order.pointsEarned, note: 'Refund' } };
}
