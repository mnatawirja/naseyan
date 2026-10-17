/**
 * Naseyan Cloud Functions (2nd gen, Jakarta region).
 * Everything that must not be trusted to a tablet or a customer's phone lives here:
 * staff PIN sign-in, supervisor approvals, loyalty, QR-order pricing, daily summaries.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentWritten, onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { randomBytes } from 'node:crypto';
import { applyLoyalty, reverseLoyalty, type Customer, type Mission, type StampCard } from './loyalty';
import { totals, type Line, type LoyaltyConfig, type Outlet } from './money';
import { hashPin, PIN_RE, verifyPin, weakPin } from './pin';
import { summarize, type OrderForSummary } from './summary';

initializeApp();
setGlobalOptions({ region: 'asia-southeast2', maxInstances: 10 });
const db = getFirestore();
const TZ = 'Asia/Jakarta';

/* ---------- helpers ---------- */
type Role = 'cashier' | 'barista' | 'supervisor' | 'manager' | 'owner';
const RANK: Record<Role, number> = { barista: 1, cashier: 2, supervisor: 3, manager: 4, owner: 5 };
function requireRole(req: CallableRequest, min: Role): { uid: string; role: Role; outlets: string[] | 'all' } {
  const t = req.auth?.token as { role?: Role; outlets?: string[] | 'all' } | undefined;
  if (!req.auth || !t?.role || RANK[t.role] < RANK[min]) throw new HttpsError('permission-denied', `Needs ${min} access.`);
  return { uid: req.auth.uid, role: t.role, outlets: t.outlets ?? [] };
}
const newId = () => randomBytes(6).toString('base64url');
const memberCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(randomBytes(6), b => a[b % a.length]).join(''); };
const localParts = (ms: number) => {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date(ms));
  const g = (t: string) => f.find(p => p.type === t)!.value;
  return { date: `${g('year')}${g('month')}${g('day')}`, hour: Number(g('hour')) % 24 };
};
/** A Date whose local getters read Jakarta wall-clock time (for promo/mission rules). */
const jakartaNow = (ms = Date.now()) => new Date(new Date(ms).toLocaleString('en-US', { timeZone: TZ }));

async function loyaltyConfig() {
  const cfg = (await db.doc('config/main').get()).data() || {};
  const loyalty: LoyaltyConfig = { on: true, earnPer: 10000, pointValue: 100, minRedeem: 50, ...(cfg.loyalty || {}) };
  const stampCards = (await db.collection('stampCards').where('active', '==', true).get()).docs.map(d => ({ id: d.id, ...d.data() }) as StampCard);
  const missions = (await db.collection('missions').where('active', '==', true).get()).docs.map(d => ({ id: d.id, ...d.data() }) as Mission);
  return { loyalty, stampCards, missions, channels: (cfg.channels || {}) as Record<string, { markupPct?: number }> };
}

/* ---------- devices & staff sign-in ---------- */
/** Manager registers a tablet for an outlet. The secret is shown once and stored on the tablet. */
export const registerDevice = onCall(async req => {
  const me = requireRole(req, 'manager');
  const { outletId, label } = req.data as { outletId: string; label: string };
  if (!outletId || !(await db.doc(`outlets/${outletId}`).get()).exists) throw new HttpsError('invalid-argument', 'Unknown outlet.');
  const secret = randomBytes(24).toString('base64url');
  const ref = db.collection('devices').doc();
  await ref.set({ outletId, label: label || 'Till', active: true, createdAt: Date.now(), createdBy: me.uid, failCount: 0, lockedUntil: 0 });
  await db.doc(`deviceSecrets/${ref.id}`).set(await hashPin(secret));
  return { deviceId: ref.id, deviceSecret: secret };
});

async function checkDevice(deviceId: string, deviceSecret: string) {
  const dref = db.doc(`devices/${deviceId}`);
  const [d, s] = await Promise.all([dref.get(), db.doc(`deviceSecrets/${deviceId}`).get()]);
  if (!d.exists || !s.exists || !d.data()!.active) throw new HttpsError('permission-denied', 'This device is not registered. Ask a manager to set it up.');
  if (!(await verifyPin(deviceSecret, s.data() as { salt: string; hash: string }))) throw new HttpsError('permission-denied', 'This device is not registered.');
  const dev = d.data()!;
  if (dev.lockedUntil > Date.now()) throw new HttpsError('resource-exhausted', 'Too many wrong PINs. Wait 5 minutes.');
  return { dref, dev };
}
async function findStaffByPin(pin: string, outletId: string, minRole?: Role) {
  const staff = await db.collection('staff').where('active', '==', true).get();
  for (const doc of staff.docs) {
    const s = doc.data();
    if (minRole && RANK[s.role as Role] < RANK[minRole]) continue;
    if (s.outlets?.length && !s.outlets.includes(outletId)) continue;
    const sec = await db.doc(`staffSecrets/${doc.id}`).get();
    if (sec.exists && (await verifyPin(pin, sec.data() as { salt: string; hash: string }))) return { id: doc.id, ...s } as { id: string; role: Role; name: string; outlets?: string[] };
  }
  return null;
}
async function recordFail(dref: FirebaseFirestore.DocumentReference) {
  await db.runTransaction(async tx => {
    const n = ((await tx.get(dref)).data()?.failCount || 0) + 1;
    tx.update(dref, n >= 5 ? { failCount: 0, lockedUntil: Date.now() + 5 * 60000 } : { failCount: n });
  });
}

/** Staff PIN sign-in on a registered tablet. Returns a Firebase custom token carrying role and outlet claims. */
export const staffSignIn = onCall(async req => {
  const { deviceId, deviceSecret, pin } = req.data as { deviceId: string; deviceSecret: string; pin: string };
  if (!PIN_RE.test(pin || '')) throw new HttpsError('invalid-argument', 'PIN must be 6 digits.');
  const { dref, dev } = await checkDevice(deviceId, deviceSecret);
  const s = await findStaffByPin(pin, dev.outletId);
  if (!s) { await recordFail(dref); throw new HttpsError('unauthenticated', 'PIN not recognised.'); }
  await dref.update({ failCount: 0, lastSignIn: Date.now(), lastStaffId: s.id });
  const token = await getAuth().createCustomToken(`staff_${s.id}`, { role: s.role, staffId: s.id, outlets: [dev.outletId], deviceId });
  return { token, staff: { id: s.id, name: s.name, role: s.role } };
});

/** Supervisor approval for voids, refunds, removed items and large discounts. The order stores the approval id. */
export const approve = onCall(async req => {
  const me = requireRole(req, 'barista');
  const { deviceId, deviceSecret, pin, action, orderId, detail } = req.data as Record<string, string>;
  const { dref, dev } = await checkDevice(deviceId, deviceSecret);
  const s = await findStaffByPin(pin, dev.outletId, 'supervisor');
  if (!s) { await recordFail(dref); throw new HttpsError('unauthenticated', 'Supervisor PIN not recognised.'); }
  const ref = await db.collection('approvals').add({ action, orderId: orderId || null, detail: detail || '', approverId: s.id, requestedBy: me.uid, outletId: dev.outletId, deviceId, at: Date.now() });
  return { approvalId: ref.id, approver: { id: s.id, name: s.name } };
});

export const setStaffPin = onCall(async req => {
  requireRole(req, 'manager');
  const { staffId, pin } = req.data as { staffId: string; pin: string };
  if (!PIN_RE.test(pin || '') || weakPin(pin)) throw new HttpsError('invalid-argument', 'Use 6 digits that are not easy to guess.');
  if (!(await db.doc(`staff/${staffId}`).get()).exists) throw new HttpsError('not-found', 'Staff member not found.');
  const others = await db.collection('staff').get();
  for (const o of others.docs) {
    if (o.id === staffId) continue;
    const sec = await db.doc(`staffSecrets/${o.id}`).get();
    if (sec.exists && (await verifyPin(pin, sec.data() as { salt: string; hash: string }))) throw new HttpsError('already-exists', 'Another staff member uses this PIN.');
  }
  await db.doc(`staffSecrets/${staffId}`).set(await hashPin(pin));
  await db.doc(`staff/${staffId}`).update({ pinSet: true, pinUpdatedAt: Date.now() });
  return { ok: true };
});

/** Owner grants back-office access to an email account (managers, finance). */
export const setUserRole = onCall(async req => {
  requireRole(req, 'owner');
  const { email, role, outlets } = req.data as { email: string; role: Role | null; outlets: string[] | 'all' };
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, role ? { role, outlets: outlets ?? 'all' } : {});
  await db.doc(`backofficeUsers/${user.uid}`).set({ email, role, outlets: outlets ?? 'all', updatedAt: Date.now() });
  return { uid: user.uid };
});

/* ---------- orders: pricing check, loyalty, summaries ---------- */
export const onOrderWritten = onDocumentWritten('orders/{orderId}', async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const ref = event.data?.after.ref;
  if (!after || !ref) return;

  // 1. QR orders come from customers' phones: re-price every line from the menu before staff see the total.
  if (after.channel === 'qr' && after.status === 'new' && !after.priceChecked) {
    const outlet = (await db.doc(`outlets/${after.outletId}`).get()).data() as Outlet;
    const lines: Line[] = [];
    for (const l of after.lines as Line[]) {
      const item = (await db.doc(`items/${l.itemId}`).get()).data();
      if (!item || item.active === false || item.availability?.[after.outletId] === false) continue;
      const base = item.outletPrices?.[after.outletId] ?? item.price;
      let modPrice = 0; const names: string[] = [];
      for (const ref of l.optionRefs || []) {
        if (!(item.modifierGroupIds || []).includes(ref.groupId)) continue;
        const g = (await db.doc(`modifierGroups/${ref.groupId}`).get()).data();
        const opt = g?.options?.[ref.index];
        if (opt) { modPrice += opt.price || 0; names.push(opt.name); }
      }
      lines.push({ ...l, name: item.name, categoryId: item.categoryId, basePrice: base, modPrice, mods: names.join(', '), unitPrice: base + modPrice, qty: Math.max(1, Math.min(20, Math.round(l.qty))) });
    }
    const { loyalty } = await loyaltyConfig();
    const t = totals({ lines, channel: 'qr', outlet, discounts: {}, loyalty });
    await ref.update({ lines, subtotal: t.subtotal, discount: 0, net: t.net, service: t.service, tax: t.tax, total: t.total, priceChecked: true });
    return;
  }

  // 2. Paid with a member attached: apply points, stamps and missions once.
  if (after.status === 'paid' && after.customerId && !after.loyalty?.applied) {
    const { loyalty, stampCards, missions } = await loyaltyConfig();
    const cref = db.doc(`customers/${after.customerId}`);
    await db.runTransaction(async tx => {
      const [o, c] = await Promise.all([tx.get(ref), tx.get(cref)]);
      if (o.data()?.loyalty?.applied || !c.exists) return;
      try {
        const out = applyLoyalty({ customer: c.data() as Customer, order: { id: o.id, number: after.number, outletId: after.outletId, net: after.net, total: after.total, lines: after.lines, pointsRedeemed: after.pointsRedeemed || 0, rewardUsedId: after.discounts?.reward?.id || null }, config: loyalty, stampCards, missions, now: jakartaNow(), newId });
        tx.set(cref, out.customer, { merge: true });
        tx.set(cref.collection('ledger').doc(o.id), out.ledger);
        tx.update(ref, { loyalty: { applied: true, ...out.result } });
      } catch (e) {
        tx.update(ref, { loyalty: { applied: true, error: (e as Error).message, pointsEarned: 0 } });
      }
    });
  }

  // 3. Refunded: reverse points once.
  if (before?.status === 'paid' && after.status === 'refunded' && after.customerId && after.loyalty?.applied && !after.loyalty?.reversed) {
    const cref = db.doc(`customers/${after.customerId}`);
    await db.runTransaction(async tx => {
      const [o, c] = await Promise.all([tx.get(ref), tx.get(cref)]);
      if (o.data()?.loyalty?.reversed || !c.exists) return;
      const out = reverseLoyalty(c.data() as Customer, { id: o.id, number: after.number, outletId: after.outletId, net: after.net, total: after.total, lines: after.lines, pointsRedeemed: after.pointsRedeemed || 0, pointsEarned: after.loyalty?.pointsEarned || 0 }, new Date());
      tx.set(cref, out.customer, { merge: true });
      tx.set(cref.collection('ledger').doc(o.id + '_refund'), out.ledger);
      tx.update(ref, { 'loyalty.reversed': true });
    });
  }

  // 4. Changes to an earlier day make that day's summary stale.
  if (after.businessDate && after.businessDate < localParts(Date.now()).date) {
    await db.doc(`summaries/${after.outletId}_${after.businessDate}`).set({ stale: true }, { merge: true });
  }
});

/** Every new member gets a short code for the till. */
export const onCustomerCreated = onDocumentCreated('customers/{id}', async event => {
  const snap = event.data; if (!snap || snap.data().code) return;
  for (let i = 0; i < 5; i++) {
    const code = memberCode();
    if ((await db.collection('customers').where('code', '==', code).limit(1).get()).empty) { await snap.ref.update({ code }); return; }
  }
});

async function buildSummary(outletId: string, date: string) {
  const q = await db.collection('orders').where('outletId', '==', outletId).where('businessDate', '==', date).get();
  const s = summarize(q.docs.map(d => d.data() as OrderForSummary), ms => localParts(ms).hour);
  await db.doc(`summaries/${outletId}_${date}`).set({ outletId, date, builtAt: Date.now(), stale: false, ...s });
  return s;
}
export const rebuildSummary = onCall(async req => {
  requireRole(req, 'manager');
  const { outletId, date } = req.data as { outletId: string; date: string };
  return buildSummary(outletId, date);
});
export const nightlySummaries = onSchedule({ schedule: 'every day 03:00', timeZone: TZ }, async () => {
  const yesterday = localParts(Date.now() - 864e5).date;
  const outlets = await db.collection('outlets').where('active', '==', true).get();
  for (const o of outlets.docs) await buildSummary(o.id, yesterday);
  const stale = await db.collection('summaries').where('stale', '==', true).limit(200).get();
  for (const s of stale.docs) await buildSummary(s.data().outletId, s.data().date);
});

/** Manager adjusts a member's points or gives a reward. Every change is written to the member's ledger. */
export const adjustMember = onCall(async req => {
  const me = requireRole(req, 'manager');
  const { customerId, points, reason, reward } = req.data as { customerId: string; points?: number; reason: string; reward?: { kind: 'free' | 'amt' | 'pct'; value: number; maxValue?: number; label: string; categoryIds?: string[]; validDays?: number } };
  if (!reason?.trim()) throw new HttpsError('invalid-argument', 'Give a reason.');
  const cref = db.doc(`customers/${customerId}`);
  await db.runTransaction(async tx => {
    const c = await tx.get(cref);
    if (!c.exists) throw new HttpsError('not-found', 'Member not found.');
    const d = c.data() as Customer;
    const upd: Partial<Customer> = {};
    if (points) upd.points = (d.points || 0) + Math.round(points);
    if (reward) {
      const now = Date.now();
      upd.rewards = [...(d.rewards || []), { id: newId(), kind: reward.kind, value: reward.value, maxValue: reward.maxValue, label: reward.label, categoryIds: reward.categoryIds || [], source: 'Manual', createdAt: now, expiresAt: reward.validDays ? now + reward.validDays * 864e5 : null }];
    }
    tx.update(cref, upd);
    tx.set(cref.collection('ledger').doc(), { at: Date.now(), orderId: '', orderNumber: '', outletId: '', total: 0, points: Math.round(points || 0), note: `${reward ? 'Reward: ' + reward.label + '. ' : ''}${reason} (by ${me.uid})` });
  });
  return { ok: true };
});
