/** Daily sales summary per outlet, used by back-office reports. Rebuilt from orders, so it is always safe to recompute. */
export interface OrderForSummary {
  status: 'new' | 'open' | 'paid' | 'void' | 'refunded'; channel: string; paidAt?: number | null; createdAt: number;
  subtotal: number; discount: number; net: number; service: number; tax: number; total: number;
  payments?: { method: string; amount: number }[];
  lines?: { itemId: string; name: string; categoryId: string; qty: number; unitPrice: number }[];
  customerId?: string | null; loyalty?: { pointsEarned?: number } | null; pointsRedeemed?: number;
}
export interface DailySummary {
  orders: number; subtotal: number; discount: number; net: number; service: number; tax: number; total: number;
  byChannel: Record<string, { orders: number; net: number }>; byPayment: Record<string, number>; byHour: Record<string, number>;
  items: Record<string, { name: string; categoryId: string; qty: number; sales: number }>;
  voids: number; voidAmount: number; refunds: number; refundAmount: number; memberOrders: number; openOrders: number;
  pointsEarned: number; pointsRedeemed: number;
}
export function summarize(orders: OrderForSummary[], hourOf: (ms: number) => number): DailySummary {
  const s: DailySummary = { orders: 0, subtotal: 0, discount: 0, net: 0, service: 0, tax: 0, total: 0, byChannel: {}, byPayment: {}, byHour: {}, items: {}, voids: 0, voidAmount: 0, refunds: 0, refundAmount: 0, memberOrders: 0, openOrders: 0, pointsEarned: 0, pointsRedeemed: 0 };
  for (const o of orders) {
    if (o.status === 'paid') {
      s.orders++; s.subtotal += o.subtotal; s.discount += o.discount; s.net += o.net; s.service += o.service; s.tax += o.tax; s.total += o.total;
      const c = (s.byChannel[o.channel] ||= { orders: 0, net: 0 }); c.orders++; c.net += o.net;
      for (const p of o.payments || []) s.byPayment[p.method] = (s.byPayment[p.method] || 0) + p.amount;
      const h = String(hourOf(o.paidAt || o.createdAt)); s.byHour[h] = (s.byHour[h] || 0) + o.net;
      for (const l of o.lines || []) { const it = (s.items[l.itemId] ||= { name: l.name, categoryId: l.categoryId, qty: 0, sales: 0 }); it.qty += l.qty; it.sales += l.unitPrice * l.qty; }
      if (o.customerId) s.memberOrders++;
      s.pointsEarned += o.loyalty?.pointsEarned || 0; s.pointsRedeemed += o.pointsRedeemed || 0;
    } else if (o.status === 'refunded') { s.refunds++; s.refundAmount += o.total; }
    else if (o.status === 'void') { if ((o.lines || []).length) { s.voids++; s.voidAmount += o.total; } }
    else s.openOrders++;
  }
  return s;
}
