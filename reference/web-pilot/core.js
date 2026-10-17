'use strict';
/* Naseyan POS — shared core: data access, money math, loyalty engine, stock, UI helpers. */
const N = window.N = {
  db: null, user: null, dl: null,
  cfg: {}, outlets: {}, cats: {}, items: {}, mods: {}, staff: {}, promos: {}, stampcards: {}, missions: {},
  loaded: {}, listeners: new Set(), acts: {}, openModals: [],
};
N.closeAll = () => N.openModals.slice().forEach(m => m.close());

/* ---------- small utils ---------- */
N.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
N.rpn = n => Math.round(n || 0).toLocaleString('id-ID');
N.rp = n => (n < 0 ? '−Rp ' : 'Rp ') + Math.abs(Math.round(n || 0)).toLocaleString('id-ID');
N.uid = (n = 10) => { const a = 'abcdefghijkmnpqrstuvwxyz23456789'; let s = ''; for (const x of crypto.getRandomValues(new Uint8Array(n))) s += a[x % a.length]; return s; };
N.pad = (n, l = 2) => String(n).padStart(l, '0');
N.dkey = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + N.pad(d.getMonth() + 1) + N.pad(d.getDate()); };
N.mkey = (t = Date.now()) => N.dkey(t).slice(0, 6);
N.dparse = k => new Date(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8));
N.dlabel = (k, o = { weekday: 'short', day: 'numeric', month: 'short' }) => N.dparse(k).toLocaleDateString('en-GB', o);
N.addDays = (k, n) => { const d = N.dparse(k); d.setDate(d.getDate() + n); return N.dkey(d); };
N.dayRange = (a, b) => { const out = []; for (let k = a; k <= b; k = N.addDays(k, 1)) out.push(k); return out; };
N.hm = t => { const d = new Date(t); return N.pad(d.getHours()) + ':' + N.pad(d.getMinutes()); };
N.dt = t => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
N.mins = t => Math.max(0, Math.floor((Date.now() - t) / 60000));
N.ago = t => { const m = N.mins(t); return m < 1 ? 'just now' : m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; };
N.toInput = k => k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6);
N.fromInput = v => (v || '').replace(/-/g, '');
N.ls = {
  get(k, d) { try { const v = localStorage.getItem('nsy.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('nsy.' + k, JSON.stringify(v)); } catch { } },
  del(k) { try { localStorage.removeItem('nsy.' + k); } catch { } },
};
N.phone = s => { let d = String(s || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '62' + d.slice(1); else if (d.startsWith('8')) d = '62' + d; return d; };
N.phoneFmt = p => p ? '+' + p.replace(/^(\d{2})(\d{3})(\d{4})(\d+)$/, '$1 $2-$3-$4') : '';
N.sortBy = (arr, f) => arr.slice().sort((a, b) => { const x = f(a), y = f(b); return x < y ? -1 : x > y ? 1 : 0; });
N.clone = o => JSON.parse(JSON.stringify(o));
N.sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- icons ---------- */
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12l5 5L20 7"/>',
  minus: '<path d="M5 12h14"/>', back: '<path d="M15 6l-6 6 6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  table: '<path d="M3 8h18M6 8v11M18 8v11M3 13h18"/>',
  qr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h3v3h-3zM20 14v6h-6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c1-3.5 3.5-5 6-5s5 1.5 6 5M16 4.6a3.5 3.5 0 0 1 0 6.8M21 20c-.6-2.6-2-4.2-4-4.8"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  chart: '<path d="M5 20V11M11 20V5M17 20v-7M3 20h18"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8C10.5 4.5 6.5 4 6.5 6.5S10 8 12 8c2 0 5.5 1 5.5-1.5S13.5 4.5 12 8"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  store: '<path d="M4 11v9h16v-9M3 9l2-5h14l2 5c0 1.6-1.3 2.6-3 2.6S15 10.6 15 9c0 1.6-1.3 2.6-3 2.6S9 10.6 9 9c0 1.6-1.3 2.6-3 2.6S3 10.6 3 9z"/>',
  coffee: '<path d="M4 9h12v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3"/>',
  chef: '<path d="M7 14.5A4 4 0 1 1 8.6 7a4 4 0 0 1 6.8 0A4 4 0 1 1 17 14.5V20H7zM7 17h10"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8zM7.5 7.5h.01"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
  refund: '<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
  flag: '<path d="M5 21V4h12l-2 4 2 4H5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  scale: '<path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0zM8 21h8"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  bag: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
  bike: '<circle cx="6" cy="16" r="3"/><circle cx="18" cy="16" r="3"/><path d="M6 16l4-7h5l3 7M9 6h3"/>',
};
N.ic = (n, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------- config & reference data ---------- */
N.DEF = {
  brand: 'Naseyan',
  pays: [
    { id: 'cash', n: 'Cash' }, { id: 'qris', n: 'QRIS' }, { id: 'debit', n: 'Debit card' }, { id: 'credit', n: 'Credit card' },
    { id: 'gopay', n: 'GoPay' }, { id: 'ovo', n: 'OVO' }, { id: 'shopeepay', n: 'ShopeePay' }, { id: 'dana', n: 'DANA' }, { id: 'transfer', n: 'Bank transfer' },
  ],
  ch: { gofood: { n: 'GoFood', mk: 20 }, grab: { n: 'GrabFood', mk: 20 }, shopee: { n: 'ShopeeFood', mk: 15 } },
  loyalty: { on: true, earn: 10000, value: 100, min: 50 },
  footer: 'Thank you for visiting Naseyan.',
  appUrl: '',
};
N.conf = () => {
  const c = N.cfg || {};
  return {
    ...N.DEF, ...c,
    ch: { ...N.DEF.ch, ...(c.ch || {}) },
    loyalty: { ...N.DEF.loyalty, ...(c.loyalty || {}) },
    pays: c.pays?.length ? c.pays : N.DEF.pays,
  };
};
N.CH = { counter: 'Takeaway', table: 'Dine-in', qr: 'QR order', gofood: 'GoFood', grab: 'GrabFood', shopee: 'ShopeeFood' };
N.chName = ch => N.conf().ch[ch]?.n || N.CH[ch] || ch;
N.isDelivery = ch => ch === 'gofood' || ch === 'grab' || ch === 'shopee';
N.payName = id => id?.startsWith('ch:') ? N.chName(id.slice(3)) : (N.conf().pays.find(p => p.id === id)?.n || id);
N.ROLES = {
  cashier: { n: 'Cashier', p: ['sell', 'pay', 'shift', 'cust', 'qr', 'soldout'] },
  barista: { n: 'Barista / Cook', p: ['sell', 'station', 'soldout'] },
  supervisor: { n: 'Supervisor', p: ['sell', 'pay', 'shift', 'cust', 'qr', 'soldout', 'station', 'approve', 'cashio'] },
  manager: { n: 'Manager', p: ['*'] },
};
N.can = (s, p) => { const r = s && N.ROLES[s.role]; return !!r && (r.p.includes('*') || r.p.includes(p)); };
N.staffAt = (s, o) => !s.outlets?.length || s.outlets.includes(o);
N.itemsSorted = (all = false) => Object.values(N.items).filter(i => all || i.active !== false).sort((a, b) =>
  ((N.cats[a.cat]?.sort ?? 99) - (N.cats[b.cat]?.sort ?? 99)) || ((a.sort ?? 99) - (b.sort ?? 99)) || String(a.name).localeCompare(b.name));
N.catsSorted = () => Object.values(N.cats).sort((a, b) => ((a.sort ?? 99) - (b.sort ?? 99)) || String(a.name).localeCompare(b.name));
N.outletsSorted = () => Object.values(N.outlets).filter(o => o.active !== false).sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
N.avail = (item, o) => item.active !== false && item.avail?.[o] !== false;

/* pricing */
N.markup = (p, ch) => { const mk = N.conf().ch[ch]?.mk; return mk ? Math.ceil(p * (1 + mk / 100) / 500) * 500 : p; };
N.price = (item, o, ch) => N.markup(item.prices?.[o] ?? item.price ?? 0, ch);

/* ---------- order math ---------- */
N.promoBase = (p, lines) => lines.filter(l => !p.cats?.length || p.cats.includes(l.c)).reduce((s, l) => s + l.p * l.q, 0);
N.promoAmt = (p, lines) => {
  const base = N.promoBase(p, lines); if (!base) return 0;
  let a = p.k === 'pct' ? Math.round(base * (p.v || 0) / 100) : Math.min(p.v || 0, base);
  if (p.max) a = Math.min(a, p.max);
  return a;
};
N.promoCheck = (p, order, sub) => {
  if (!p || p.active === false) return 'Promo is switched off';
  const now = new Date(), k = N.dkey();
  if (p.start && k < p.start) return 'Starts ' + N.dlabel(p.start);
  if (p.end && k > p.end) return 'Ended ' + N.dlabel(p.end);
  if (p.days?.length && !p.days.includes(now.getDay())) return 'Not valid today';
  const hm = N.pad(now.getHours()) + ':' + N.pad(now.getMinutes());
  if (p.from && p.to && (hm < p.from || hm > p.to)) return `Valid ${p.from}–${p.to}`;
  if (p.outlets?.length && !p.outlets.includes(order.o)) return 'Not valid at this outlet';
  if (p.chans?.length && !p.chans.includes(order.ch)) return 'Not valid for ' + N.chName(order.ch);
  if (p.min && sub < p.min) return 'Minimum spend ' + N.rp(p.min);
  if (!N.promoBase(p, order.lines || [])) return 'No eligible items in the order';
  return '';
};
N.rewardAmt = (r, lines, sub) => {
  if (!r) return 0;
  const elig = lines.filter(l => !r.cats?.length || r.cats.includes(l.c));
  let a = 0;
  if (r.k === 'free') a = elig.reduce((m, l) => Math.max(m, l.p), 0);
  else if (r.k === 'amt') a = Math.min(r.v || 0, sub);
  else if (r.k === 'pct') a = Math.round(elig.reduce((s, l) => s + l.p * l.q, 0) * (r.v || 0) / 100);
  if (r.max) a = Math.min(a, r.max);
  return a;
};
N.totals = order => {
  const out = N.outlets[order.o] || {}, L = N.conf().loyalty;
  const lines = order.lines || [];
  const sub = lines.reduce((s, l) => s + l.p * l.q, 0);
  const parts = [];
  if (order.promo) {
    const def = N.promos[order.promo.id];
    const a = def ? N.promoAmt(def, lines) : (order.promo.a || 0);
    parts.push({ k: 'promo', l: order.promo.l, a });
  }
  if (order.md) parts.push({ k: 'manual', l: order.md.l || (order.md.k === 'pct' ? `Discount ${order.md.v}%` : 'Discount'), a: order.md.k === 'pct' ? Math.round(sub * order.md.v / 100) : order.md.v });
  if (order.rw) parts.push({ k: 'reward', l: order.rw.l, a: N.rewardAmt(order.rw, lines, sub) });
  if (order.pr) parts.push({ k: 'points', l: `${order.pr} points`, a: order.pr * L.value });
  let disc = 0;
  for (const p of parts) { p.a = Math.max(0, Math.min(p.a, sub - disc)); disc += p.a; }
  const net = sub - disc;
  const dine = order.ch === 'table' || order.ch === 'qr';
  const svc = dine ? Math.round(net * (out.svc || 0) / 100) : 0;
  const rate = out.tax || 0;
  let tax, tot;
  if (out.taxIncl) { tot = net + svc; tax = Math.round(tot - tot / (1 + rate / 100)); }
  else { tax = Math.round((net + svc) * rate / 100); tot = net + svc + tax; }
  return { sub, parts, disc, net, svc, tax, tot };
};
N.finalize = order => {
  const t = N.totals(order);
  order.sub = t.sub; order.disc = t.disc; order.da = t.parts.filter(p => p.a > 0).map(p => ({ k: p.k, l: p.l, a: p.a }));
  order.net = t.net; order.svc = t.svc; order.tax = t.tax; order.tot = t.tot;
  if (order.promo) order.promo.a = t.parts.find(p => p.k === 'promo')?.a || 0;
  return order;
};
N.blankOrder = (o, dev, ch = 'counter') => ({
  id: N.uid(12), no: '', o, ch, st: 'draft', tbl: null, name: '', lines: [], cust: null, cname: '',
  md: null, promo: null, rw: null, pr: 0, pays: [], tend: 0, chg: 0, by: null, ct: Date.now(), pt: null,
  shift: null, dev, note: '', vl: [], void: null, refund: null, pe: 0, loc: null,
});

/* ---------- data access ---------- */
const wqs = {};
N.wq = (key, fn) => { const p = (wqs[key] || Promise.resolve()).then(fn, fn); wqs[key] = p.catch(() => { }); return p; };
N.retry = async fn => { try { return await fn(); } catch (e) { if (e?.code === 'unavailable') { await N.sleep(400 + Math.random() * 600); return fn(); } throw e; } };
N.errMsg = e => ({
  quota_exceeded: 'The store database is full. Archive old data in Back office → Settings.',
  invalid_argument: 'This account cannot change store data. Ask the owner for Contributor access.',
  revoked: 'Access to the store data was removed.', resource_exhausted: 'Too many requests. Wait a moment and try again.',
}[e?.code] || (e?.message || 'Could not save. Check the connection and try again.'));
const ensured = new Set();
N.ensureDoc = async (ref, init) => {
  if (ensured.has(ref.path)) return;
  for (let i = 0; i < 6; i++) {
    const s = await N.retry(() => ref.get());
    if (s.exists) { ensured.add(ref.path); return; }
    const l = await ref.acquire({ holder: N.uid(), ttlMs: 4000 });
    if (l.acquired) {
      const s2 = await ref.get();
      if (!s2.exists) await ref.set(init);
      ensured.add(ref.path); return;
    }
    await N.sleep(700);
  }
  throw { code: 'unavailable', message: 'Could not prepare the day record. Try again.' };
};
N.dayRef = (o, d, dev) => N.db.doc(`outlets/${o}/days/${d}/devs/${dev}`);
N.dayCol = (o, d) => N.db.collection(`outlets/${o}/days/${d}/devs`);
N.saveOrder = async order => {
  const { o, d, dev } = order.loc;
  const ref = N.dayRef(o, d, dev);
  await N.ensureDoc(ref, { o, d, dev, orders: {} });
  const body = N.clone(order);
  delete body.dn; // bar/kitchen done-flags are owned by the ticket screens (patchOrder)
  await N.wq(ref.path, () => N.retry(() => ref.update({ orders: { [order.id]: body } })));
  if (d < N.dkey()) N.markStale(o, d);
};
N.patchOrder = async (order, patch) => {
  const { o, d, dev } = order.loc;
  const ref = N.dayRef(o, d, dev);
  await N.wq(ref.path, () => N.retry(() => ref.update({ orders: { [order.id]: N.clone(patch) } })));
  if (d < N.dkey()) N.markStale(o, d);
};
N.markStale = async (o, d) => { try { const r = N.db.doc(`outlets/${o}/sum/${d}`); const s = await r.get(); if (s.exists) await r.update({ stale: true }); } catch { } };
N.flatten = snap => { const list = []; for (const doc of snap.docs) { const os = doc.data()?.orders || {}; for (const k in os) list.push(os[k]); } return list; };
N.watchDay = (o, d, cb) => N.dayCol(o, d).onSnapshot(s => cb(N.flatten(s)), e => N.toast('Live order updates stopped: ' + N.errMsg(e), 'bad'));
N.loadDay = async (o, d) => N.flatten(await N.retry(() => N.dayCol(o, d).get()));

/* ---------- summaries ---------- */
N.summarize = (orders, o, d) => {
  const s = { o, d, at: Date.now(), n: 0, sub: 0, disc: 0, net: 0, svc: 0, tax: 0, tot: 0, ch: {}, pay: {}, hr: {}, items: {}, cats: {}, voids: 0, voidAmt: 0, ref: 0, refAmt: 0, cust: 0, open: 0, pe: 0, pr: 0, stale: false };
  for (const x of orders) {
    if (x.st === 'paid') {
      s.n++; s.sub += x.sub || 0; s.disc += x.disc || 0; s.net += x.net || 0; s.svc += x.svc || 0; s.tax += x.tax || 0; s.tot += x.tot || 0;
      const c = s.ch[x.ch] || (s.ch[x.ch] = { n: 0, net: 0 }); c.n++; c.net += x.net || 0;
      for (const p of x.pays || []) s.pay[p.m] = (s.pay[p.m] || 0) + p.a;
      const h = new Date(x.pt || x.ct).getHours(); s.hr[h] = (s.hr[h] || 0) + (x.net || 0);
      for (const l of x.lines || []) {
        const it = s.items[l.i] || (s.items[l.i] = { n: l.n, c: l.c, q: 0, a: 0 }); it.q += l.q; it.a += l.p * l.q;
        const ct = s.cats[l.c || '-'] || (s.cats[l.c || '-'] = { q: 0, a: 0 }); ct.q += l.q; ct.a += l.p * l.q;
      }
      if (x.cust) s.cust++;
      s.pe += x.pe || 0; s.pr += x.pr || 0;
    } else if (x.st === 'refund') { s.ref++; s.refAmt += x.tot || 0; }
    else if (x.st === 'void') { if ((x.lines || []).length) { s.voids++; s.voidAmt += x.tot || 0; } }
    else if (x.st === 'open' || x.st === 'new') s.open++;
  }
  return s;
};
N.getSum = async (o, d) => {
  const today = N.dkey();
  if (d >= today) return N.summarize(await N.loadDay(o, d), o, d);
  const ref = N.db.doc(`outlets/${o}/sum/${d}`);
  const snap = await N.retry(() => ref.get());
  if (snap.exists && !snap.data().stale) return snap.data();
  const s = N.summarize(await N.loadDay(o, d), o, d);
  try { await ref.set(s); } catch { }
  return s;
};
N.sumRange = async (outlets, from, to, onProgress) => {
  const res = [], today = N.dkey();
  for (const o of outlets) {
    const have = {};
    const q = await N.retry(() => N.db.collection(`outlets/${o}/sum`).where('d', '>=', from).where('d', '<=', to).get());
    for (const doc of q.docs) { const v = doc.data(); if (!v.stale) have[v.d] = v; }
    const days = N.dayRange(from, to > today ? today : to);
    let i = 0;
    for (const d of days) {
      res.push(have[d] || await N.getSum(o, d));
      onProgress && onProgress(++i, days.length * outlets.length);
    }
  }
  return res;
};
N.mergeSums = sums => {
  const m = N.summarize([], '*', '*');
  for (const s of sums) {
    for (const k of ['n', 'sub', 'disc', 'net', 'svc', 'tax', 'tot', 'voids', 'voidAmt', 'ref', 'refAmt', 'cust', 'open', 'pe', 'pr']) m[k] += s[k] || 0;
    for (const [k, v] of Object.entries(s.ch || {})) { const c = m.ch[k] || (m.ch[k] = { n: 0, net: 0 }); c.n += v.n; c.net += v.net; }
    for (const [k, v] of Object.entries(s.pay || {})) m.pay[k] = (m.pay[k] || 0) + v;
    for (const [k, v] of Object.entries(s.hr || {})) m.hr[k] = (m.hr[k] || 0) + v;
    for (const [k, v] of Object.entries(s.items || {})) { const it = m.items[k] || (m.items[k] = { n: v.n, c: v.c, q: 0, a: 0 }); it.q += v.q; it.a += v.a; }
    for (const [k, v] of Object.entries(s.cats || {})) { const c = m.cats[k] || (m.cats[k] = { q: 0, a: 0 }); c.q += v.q; c.a += v.a; }
  }
  return m;
};

/* ---------- stock (item count) ---------- */
N.invRef = o => N.db.doc(`outlets/${o}/meta/inv`);
N.stock = async (o, liveToday) => {
  const snap = await N.retry(() => N.invRef(o).get());
  const inv = snap.exists ? snap.data() : { counts: {}, moves: {} };
  const tracked = Object.values(N.items).filter(i => i.track && i.active !== false);
  const res = {};
  const today = N.dkey();
  const floor = N.addDays(today, -62);
  let minDay = today;
  for (const it of tracked) {
    const c = inv.counts?.[it.id];
    res[it.id] = { id: it.id, name: it.name, counted: !!c, base: c?.q || 0, at: c?.at || 0, in: 0, adj: 0, sold: 0, low: it.low || 0, stale: false };
    if (c) { let dk = N.dkey(c.at); if (dk < floor) { dk = floor; res[it.id].stale = true; } if (dk < minDay) minDay = dk; }
  }
  for (const m of Object.values(inv.moves || {})) {
    const r = res[m.i]; if (!r || !r.counted || m.at <= r.at) continue;
    if (m.r === 'receive' || m.r === 'transfer-in') r.in += m.q; else r.adj += m.q;
  }
  const needRaw = new Set(Object.values(res).filter(r => r.counted).map(r => N.dkey(r.at)));
  for (const d of N.dayRange(minDay, today)) {
    let orders = null;
    if (d === today) orders = liveToday || await N.loadDay(o, d);
    else if (needRaw.has(d)) orders = await N.loadDay(o, d);
    if (orders) {
      for (const x of orders) if (x.st === 'paid') for (const l of x.lines || []) { const r = res[l.i]; if (r?.counted && (x.pt || 0) > r.at) r.sold += l.q; }
    } else {
      const s = await N.getSum(o, d);
      for (const [id, v] of Object.entries(s.items || {})) { const r = res[id]; if (r?.counted && N.dkey(r.at) < d) r.sold += v.q; }
    }
  }
  for (const r of Object.values(res)) r.qty = r.counted ? r.base + r.in + r.adj - r.sold : null;
  return { res, inv, version: snap };
};

/* ---------- loyalty engine ---------- */
N.isoWeek = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const w1 = new Date(d.getFullYear(), 0, 4); return d.getFullYear() + '-' + N.pad(1 + Math.round(((d - w1) / 864e5 - 3 + (w1.getDay() + 6) % 7) / 7)); };
N.period = per => per === 'week' ? 'w' + N.isoWeek(Date.now()) : per === 'all' ? 'all' : 'm' + N.mkey();
N.periodLabel = per => per === 'week' ? 'this week' : per === 'all' ? 'all time' : 'this month';
N.missionLive = m => { const k = N.dkey(); return m.active !== false && (!m.start || k >= m.start) && (!m.end || k <= m.end); };
N.missionQty = (m, lines) => {
  const el = lines.filter(l => (!m.cats?.length || m.cats.includes(l.c)) && (!m.items?.length || m.items.includes(l.i)));
  return el;
};
N.custRef = p => N.db.doc('custs/' + p);
N.getCust = async p => { const s = await N.retry(() => N.custRef(p).get()); return s.exists ? { id: s.id, ...s.data() } : null; };
N.rewardLabel = r => r.l || (r.k === 'free' ? 'Free item' : r.k === 'pct' ? r.v + '% off' : N.rp(r.v) + ' off');

N.applyLoyalty = async order => {
  if (!order.cust) return null;
  const ref = N.custRef(order.cust);
  return N.wq(ref.path, async () => {
    const snap = await N.retry(() => ref.get()); if (!snap.exists) return null;
    const c = N.clone(snap.data());
    const L = N.conf().loyalty, now = Date.now();
    const out = { pe: 0, stamps: [], missions: [], rewards: [] };
    c.points = (c.points || 0) - (order.pr || 0);
    if (L.on) out.pe = Math.floor((order.net || 0) / (L.earn || 10000));
    c.points += out.pe;
    c.life = c.life || { spend: 0, visits: 0 }; c.life.spend += order.net || 0; c.life.visits += 1; c.last = now;
    c.rewards = (c.rewards || []).filter(r => !(order.rw && r.id === order.rw.id) && (!r.exp || r.exp > now));
    c.stamps = c.stamps || {};
    for (const sc of Object.values(N.stampcards)) {
      if (sc.active === false) continue;
      let q = (order.lines || []).filter(l => sc.cats?.includes(l.c) || sc.items?.includes(l.i)).reduce((s, l) => s + l.q, 0);
      if (sc.one) q = Math.min(q, 1);
      if (!q) continue;
      let cur = (c.stamps[sc.id] || 0) + q;
      out.stamps.push(`${sc.name} +${q}`);
      while (sc.need > 0 && cur >= sc.need) {
        cur -= sc.need;
        const r = { id: N.uid(8), ...(sc.reward || { k: 'free' }), src: sc.name, at: now, exp: sc.expDays ? now + sc.expDays * 864e5 : null };
        r.l = r.l || sc.name + ' reward';
        c.rewards.push(r); out.rewards.push(r.l);
      }
      c.stamps[sc.id] = cur;
    }
    c.mis = c.mis || {};
    for (const m of Object.values(N.missions)) {
      if (!N.missionLive(m)) continue;
      const key = m.id + '_' + N.period(m.per);
      const st = c.mis[key] || { p: 0, ids: [] };
      if (st.done) continue;
      const el = N.missionQty(m, order.lines || []);
      if (m.metric === 'visits') st.p += 1;
      else if (m.metric === 'spend') st.p += order.net || 0;
      else if (m.metric === 'qty') st.p += el.reduce((s, l) => s + l.q, 0);
      else if (m.metric === 'distinct') { for (const l of el) if (!st.ids.includes(l.i)) st.ids.push(l.i); st.p = st.ids.length; }
      st.t = now;
      if (st.p >= (m.target || 1)) {
        st.done = now; out.missions.push(m.name);
        const rw = m.reward || { k: 'points', v: 0 };
        if (rw.k === 'points') { c.points += rw.v || 0; out.rewards.push(`${rw.v} bonus points`); }
        else { const r = { id: N.uid(8), ...rw, src: m.name, at: now, exp: m.expDays ? now + m.expDays * 864e5 : null }; r.l = r.l || m.name + ' reward'; c.rewards.push(r); out.rewards.push(r.l); }
      }
      c.mis[key] = st;
    }
    for (const k of Object.keys(c.mis)) if ((c.mis[k].t || 0) < now - 120 * 864e5) delete c.mis[k];
    c.hist = [{ t: now, no: order.no, o: order.o, tot: order.tot, pe: out.pe, pr: order.pr || 0, note: out.rewards.join(', ') }, ...(c.hist || [])].slice(0, 40);
    await N.retry(() => ref.set(c));
    return out;
  });
};
N.reverseLoyalty = async (order, why) => {
  if (!order.cust) return;
  const ref = N.custRef(order.cust);
  await N.wq(ref.path, async () => {
    const snap = await ref.get(); if (!snap.exists) return;
    const c = N.clone(snap.data());
    c.points = (c.points || 0) + (order.pr || 0) - (order.pe || 0);
    if (c.life) { c.life.spend -= order.net || 0; c.life.visits = Math.max(0, c.life.visits - 1); }
    c.hist = [{ t: Date.now(), no: order.no, o: order.o, tot: -(order.tot || 0), pe: -(order.pe || 0), pr: -(order.pr || 0), note: why }, ...(c.hist || [])].slice(0, 40);
    await ref.set(c);
  });
};

/* ---------- shifts & attendance ---------- */
N.shiftRef = (o, m) => N.db.doc(`outlets/${o}/shifts/${m}`);
N.saveShift = async (o, sh) => {
  const ref = N.shiftRef(o, N.mkey(sh.open));
  await N.ensureDoc(ref, { o, m: N.mkey(sh.open), s: {} });
  await N.wq(ref.path, () => N.retry(() => ref.update({ s: { [sh.id]: N.clone(sh) } })));
};
N.attRef = (sid, m = N.mkey()) => N.db.doc(`att/${sid}_${m}`);
N.clock = async (staff, o) => {
  const ref = N.attRef(staff.id);
  return N.wq(ref.path, async () => {
    const s = await N.retry(() => ref.get());
    const doc = s.exists ? N.clone(s.data()) : { sid: staff.id, m: N.mkey(), d: {} };
    const k = N.dkey(); const day = doc.d[k] || [];
    const last = day[day.length - 1];
    let action;
    if (last && !last.out) { last.out = Date.now(); action = 'out'; }
    else { day.push({ in: Date.now(), out: null, o }); action = 'in'; }
    doc.d[k] = day;
    await N.retry(() => ref.set(doc));
    return { action, day };
  });
};

/* ---------- PIN ---------- */
N.hash = async (sid, pin) => {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('nsy|' + sid + '|' + pin));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
};
N.findByPin = async (pin, filter) => {
  for (const s of Object.values(N.staff)) {
    if (s.active === false || (filter && !filter(s))) continue;
    if (s.pin && await N.hash(s.id, pin) === s.pin) return s;
  }
  return null;
};

/* ---------- UI helpers ---------- */
N.toast = (msg, kind = '') => {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 5000 : 2600);
};
N.modal = ({ title, body = '', foot = '', cls = '', sticky = false, onClose }) => {
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  scrim.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true"><div class="modal-h"><h2 class="grow">${title}</h2><button class="btn ghost sm" data-close aria-label="Close">${N.ic('x')}</button></div><div class="modal-b"></div><div class="modal-f"></div></div>`;
  const m = {
    el: scrim, closed: false,
    body(h) { scrim.querySelector('.modal-b').innerHTML = h; return m; },
    foot(h) { const f = scrim.querySelector('.modal-f'); f.innerHTML = h; f.hidden = !h; return m; },
    title(h) { scrim.querySelector('.modal-h h2').innerHTML = h; return m; },
    $(s) { return scrim.querySelector(s); },
    close() { if (m.closed) return; m.closed = true; scrim.remove(); N.openModals = N.openModals.filter(x => x !== m); onClose && onClose(); },
  };
  N.openModals.push(m);
  m.body(body); m.foot(foot);
  scrim.addEventListener('click', e => { if ((!sticky && e.target === scrim) || e.target.closest('[data-close]')) m.close(); });
  document.getElementById('modal-root').appendChild(scrim);
  setTimeout(() => scrim.querySelector('[autofocus]')?.focus(), 30);
  return m;
};
N.confirm = (title, msg, { ok = 'Confirm', danger = false } = {}) => new Promise(res => {
  let v = false;
  const m = N.modal({ title, cls: 'narrow', body: `<p>${msg}</p>`, foot: `<button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger fill' : 'primary'}" data-ok>${ok}</button>`, onClose: () => res(v) });
  m.$('[data-ok]').onclick = () => { v = true; m.close(); };
});
/* fields: [{id, label, type:'text'|'number'|'select'|'textarea'|'date'|'check', value, opts:[[v,l]], req, ph, full}] */
N.form = (title, fields, { ok = 'Save', cls = '', note = '', validate } = {}) => new Promise(res => {
  let out = null;
  const body = (note ? `<p class="muted">${note}</p>` : '') + `<form class="grid2" id="nform" novalidate>${fields.map(N.fieldHtml).join('')}</form><div class="pin-err" id="nform-err"></div>`;
  const m = N.modal({ title, cls, body, foot: `<button class="btn" data-close type="button">Cancel</button><button class="btn primary" data-ok type="button">${ok}</button>`, sticky: true, onClose: () => res(out) });
  const submit = () => {
    const v = N.readFields(m.el, fields);
    for (const f of fields) if (f.req && (v[f.id] === '' || v[f.id] == null || (typeof v[f.id] === 'number' && isNaN(v[f.id])))) { m.$('#nform-err').textContent = `Fill in ${f.label}.`; return; }
    const err = validate && validate(v);
    if (err) { m.$('#nform-err').textContent = err; return; }
    out = v; m.close();
  };
  m.$('[data-ok]').onclick = submit;
  m.$('#nform').onsubmit = e => { e.preventDefault(); submit(); };
});
N.fieldHtml = f => {
  const id = 'f_' + f.id, full = f.full || f.type === 'textarea' || f.type === 'checks' ? ' style="grid-column:1/-1"' : '';
  const v = f.value ?? '';
  if (f.type === 'check') return `<label class="check"${full}><input type="checkbox" id="${id}" ${v ? 'checked' : ''}> ${N.esc(f.label)}</label>`;
  if (f.type === 'checks') return `<div class="field"${full}><span>${N.esc(f.label)}</span><div class="row wrap">${f.opts.map(([ov, ol]) => `<label class="check"><input type="checkbox" name="${id}" value="${N.esc(ov)}" ${(v || []).includes(ov) ? 'checked' : ''}> ${N.esc(ol)}</label>`).join('')}</div>${f.help ? `<small class="muted">${N.esc(f.help)}</small>` : ''}</div>`;
  let ctl;
  if (f.type === 'select') ctl = `<select class="input" id="${id}">${f.opts.map(([ov, ol]) => `<option value="${N.esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${N.esc(ol)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') ctl = `<textarea class="input" id="${id}" placeholder="${N.esc(f.ph || '')}">${N.esc(v)}</textarea>`;
  else ctl = `<input class="input${f.type === 'number' ? ' num' : ''}" id="${id}" type="${f.type === 'number' ? 'number' : f.type || 'text'}" ${f.type === 'number' ? 'inputmode="numeric" step="any"' : ''} value="${N.esc(v)}" placeholder="${N.esc(f.ph || '')}" ${f.auto ? 'autofocus' : ''}>`;
  return `<label class="field"${full}><span>${N.esc(f.label)}</span>${ctl}${f.help ? `<small class="muted">${N.esc(f.help)}</small>` : ''}</label>`;
};
N.readFields = (root, fields) => {
  const v = {};
  for (const f of fields) {
    const id = 'f_' + f.id;
    if (f.type === 'check') v[f.id] = root.querySelector('#' + id).checked;
    else if (f.type === 'checks') v[f.id] = [...root.querySelectorAll(`[name="${id}"]:checked`)].map(x => x.value);
    else if (f.type === 'number') { const raw = root.querySelector('#' + id).value; v[f.id] = raw === '' ? (f.req ? NaN : null) : Number(raw); }
    else if (f.type === 'date') v[f.id] = N.fromInput(root.querySelector('#' + id).value);
    else v[f.id] = root.querySelector('#' + id).value.trim();
  }
  return v;
};
N.pin = ({ title, sub = '', verify }) => new Promise(res => {
  let v = '', out = null, busy = false;
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button type="button" data-k="${k}">${k}</button>`).join('') + `<button type="button" data-k="c" aria-label="Clear">C</button><button type="button" data-k="0">0</button><button type="button" data-k="ok" style="font-family:var(--f-ui);font-size:1rem;font-weight:700;background:var(--accent);color:var(--accent-ink);border-color:var(--accent)">OK</button>`;
  const m = N.modal({ title, cls: 'narrow', sticky: true, body: `${sub ? `<p class="muted" style="text-align:center">${sub}</p>` : ''}<div class="pin-dots"></div><div class="pin-err"></div><div class="keypad">${keys}</div>`, onClose: () => { document.removeEventListener('keydown', onKey); res(out); } });
  const dots = () => { m.$('.pin-dots').innerHTML = Array.from({ length: Math.max(4, v.length) }, (_, i) => `<b class="${i < v.length ? 'on' : ''}"></b>`).join(''); };
  const go = async () => {
    if (busy || v.length < 4) { if (v.length < 4) m.$('.pin-err').textContent = 'Enter at least 4 digits.'; return; }
    busy = true;
    try { const r = await verify(v); if (r) { out = r; m.close(); return; } m.$('.pin-err').textContent = 'PIN not recognised.'; }
    catch (e) { m.$('.pin-err').textContent = typeof e === 'string' ? e : N.errMsg(e); }
    v = ''; dots(); busy = false;
  };
  const press = k => { m.$('.pin-err').textContent = ''; if (k === 'c') v = ''; else if (k === 'ok') return go(); else if (k === 'bs') v = v.slice(0, -1); else if (v.length < 6) v += k; dots(); };
  const onKey = e => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('bs'); else if (e.key === 'Enter') press('ok'); };
  document.addEventListener('keydown', onKey);
  m.$('.keypad').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
  dots();
});
N.copy = async (text, el) => {
  try { await navigator.clipboard.writeText(text); N.toast('Copied'); }
  catch { if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } N.toast('Copy blocked here. The text is selected, copy it manually.'); }
};
N.csv = rows => rows.map(r => r.map(c => { const s = String(c ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
N.download = async (filename, text) => {
  if (!N.dl) N.dl = await claude.use('downloads');
  if (!N.dl) return N.toast('Downloads are not available in this view.', 'bad');
  try { await N.dl.save({ filename, data: text }); } catch (e) { if (e?.code !== 'declined') N.toast('Download failed: ' + (e?.message || e?.code), 'bad'); }
};

/* ---------- action delegation ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = N.acts[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-chg]');
  if (el) { const fn = N.acts[el.dataset.chg]; if (fn) fn(el, e); }
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-inp]');
  if (el) { const fn = N.acts[el.dataset.inp]; if (fn) fn(el, e); }
});

/* ---------- boot data ---------- */
N.COLS = ['cfg', 'outlets', 'cats', 'items', 'mods', 'staff', 'promos', 'stampcards', 'missions'];
let emitQueued = false;
N.emit = () => { if (emitQueued) return; emitQueued = true; requestAnimationFrame(() => { emitQueued = false; N.listeners.forEach(f => { try { f(); } catch (err) { console.error(err); } }); }); };
N.connect = () => new Promise(async (resolve, reject) => {
  N.db = await claude.use('db');
  if (!N.db) return reject('nodb');
  N.user = await claude.use('user');
  let pending = new Set(N.COLS);
  for (const col of N.COLS) {
    N.db.collection(col).onSnapshot(snap => {
      const map = {};
      for (const d of snap.docs) map[d.id] = { id: d.id, ...d.data() };
      if (col === 'cfg') N.cfg = map.main || {}; else N[col] = map;
      if (pending) { pending.delete(col); if (!pending.size) { pending = null; resolve(); } }
      else N.emit();
    }, e => { if (pending) reject(e); else N.toast('Lost connection to ' + col + ': ' + N.errMsg(e), 'bad'); });
  }
});
