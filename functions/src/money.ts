/**
 * Order money rules. Shared truth for bills, discounts, service charge and tax.
 * All amounts are whole rupiah (integers). The Flutter app has a Dart port of this
 * file (app/lib/core/money.dart); keep both in step and keep the tests in step too.
 */

export type Channel = 'counter' | 'table' | 'qr' | 'gofood' | 'grab' | 'shopee';
export const DELIVERY: Channel[] = ['gofood', 'grab', 'shopee'];
export const isDelivery = (ch: Channel) => DELIVERY.includes(ch);
export const isDineIn = (ch: Channel) => ch === 'table' || ch === 'qr';

export interface Line {
  key: string;          // unique per line, used by bar/kitchen done-flags
  itemId: string;
  name: string;
  categoryId: string;
  station: 'bar' | 'kitchen';
  qty: number;
  basePrice: number;    // outlet price before channel markup
  modPrice: number;     // sum of chosen option prices before markup
  unitPrice: number;    // what the customer pays per unit, after markup
  mods: string;         // "Oat milk, Less sweet"
  note: string;
  sentAt: number | null;
  optionRefs?: { groupId: string; index: number }[]; // which options were picked, so the server can re-price
}

export interface Promo {
  id: string; name: string; active: boolean;
  kind: 'pct' | 'amt'; value: number; maxDiscount?: number; minSpend?: number;
  code?: string; categoryIds?: string[]; days?: number[]; from?: string; to?: string;
  channels?: Channel[]; outletIds?: string[]; startDate?: string | null; endDate?: string | null;
}

export interface Reward {
  id: string; kind: 'free' | 'amt' | 'pct'; value: number; maxValue?: number;
  categoryIds?: string[]; label: string; source?: string; createdAt?: number; expiresAt?: number | null;
}

export interface Outlet {
  tax: number; taxName?: string; taxIncluded?: boolean; service: number;
}

export interface LoyaltyConfig { on: boolean; earnPer: number; pointValue: number; minRedeem: number }

export interface Discounts {
  promo?: { id: string; label: string } | null;
  manual?: { kind: 'pct' | 'amt'; value: number; label: string; byStaff: string; approvedBy: string } | null;
  reward?: Reward | null;
  pointsRedeemed?: number;
}

export interface DiscountPart { kind: 'promo' | 'manual' | 'reward' | 'points'; label: string; amount: number }

export interface Totals {
  subtotal: number; parts: DiscountPart[]; discount: number; net: number; service: number; tax: number; total: number;
}

const round = (n: number) => Math.round(n);

/** Delivery platforms charge commission, so delivery prices carry a markup rounded up to Rp 500. */
export function markup(price: number, markupPct: number | undefined): number {
  if (!markupPct) return price;
  return Math.ceil((price * (1 + markupPct / 100)) / 500) * 500;
}

export function promoBase(p: Pick<Promo, 'categoryIds'>, lines: Line[]): number {
  return lines.filter(l => !p.categoryIds?.length || p.categoryIds.includes(l.categoryId)).reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

export function promoAmount(p: Promo, lines: Line[]): number {
  const base = promoBase(p, lines);
  if (!base) return 0;
  let a = p.kind === 'pct' ? round((base * p.value) / 100) : Math.min(p.value, base);
  if (p.maxDiscount) a = Math.min(a, p.maxDiscount);
  return a;
}

/** Returns '' when the promo applies, otherwise the reason it does not. `now` is local (WIB) time. */
export function promoBlockReason(p: Promo, ctx: { outletId: string; channel: Channel; lines: Line[]; now: Date }): string {
  if (!p.active) return 'Promo is switched off';
  const d = ctx.now;
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  if (p.startDate && day < p.startDate) return 'Not started yet';
  if (p.endDate && day > p.endDate) return 'Ended';
  if (p.days?.length && !p.days.includes(d.getDay())) return 'Not valid today';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (p.from && p.to && (hm < p.from || hm > p.to)) return `Valid ${p.from}–${p.to}`;
  if (p.outletIds?.length && !p.outletIds.includes(ctx.outletId)) return 'Not valid at this outlet';
  if (p.channels?.length && !p.channels.includes(ctx.channel)) return 'Not valid for this order type';
  const sub = ctx.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  if (p.minSpend && sub < p.minSpend) return `Minimum spend Rp ${p.minSpend}`;
  if (!promoBase(p, ctx.lines)) return 'No eligible items';
  return '';
}

export function rewardAmount(r: Reward | null | undefined, lines: Line[], subtotal: number): number {
  if (!r) return 0;
  const eligible = lines.filter(l => !r.categoryIds?.length || r.categoryIds.includes(l.categoryId));
  let a = 0;
  if (r.kind === 'free') a = eligible.reduce((m, l) => Math.max(m, l.unitPrice), 0);
  else if (r.kind === 'amt') a = Math.min(r.value, subtotal);
  else a = round((eligible.reduce((s, l) => s + l.unitPrice * l.qty, 0) * r.value) / 100);
  if (r.maxValue) a = Math.min(a, r.maxValue);
  return a;
}

/**
 * Bill maths, in this order: promo → manual discount → reward → points.
 * Discounts are capped so the bill never goes below zero.
 * Service charge applies to dine-in only, on the net amount.
 * Tax (PB1) applies to net + service, either added on top or already included in prices.
 */
export function totals(args: { lines: Line[]; channel: Channel; outlet: Outlet; discounts: Discounts; promoDef?: Promo | null; loyalty: LoyaltyConfig }): Totals {
  const { lines, channel, outlet, discounts, promoDef, loyalty } = args;
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const parts: DiscountPart[] = [];
  if (discounts.promo && promoDef) parts.push({ kind: 'promo', label: discounts.promo.label, amount: promoAmount(promoDef, lines) });
  if (discounts.manual) {
    const m = discounts.manual;
    parts.push({ kind: 'manual', label: m.label, amount: m.kind === 'pct' ? round((subtotal * m.value) / 100) : m.value });
  }
  if (discounts.reward) parts.push({ kind: 'reward', label: discounts.reward.label, amount: rewardAmount(discounts.reward, lines, subtotal) });
  if (discounts.pointsRedeemed) parts.push({ kind: 'points', label: `${discounts.pointsRedeemed} points`, amount: discounts.pointsRedeemed * loyalty.pointValue });
  let discount = 0;
  for (const p of parts) { p.amount = Math.max(0, Math.min(p.amount, subtotal - discount)); discount += p.amount; }
  const net = subtotal - discount;
  const service = isDineIn(channel) ? round((net * (outlet.service || 0)) / 100) : 0;
  const rate = outlet.tax || 0;
  let tax: number, total: number;
  if (outlet.taxIncluded) { total = net + service; tax = round(total - total / (1 + rate / 100)); }
  else { tax = round(((net + service) * rate) / 100); total = net + service + tax; }
  return { subtotal, parts: parts.filter(p => p.amount > 0), discount, net, service, tax, total };
}
