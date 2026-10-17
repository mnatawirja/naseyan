'use strict';
/* Naseyan back office — reports, menu, stock, members, loyalty, staff, outlets, settings. */
const B = window.B = { staff: null, page: 'dash', outlet: 'all', range: 'today', from: null, to: null, tab: {} };
(() => {
const esc = N.esc, ic = N.ic;
const COLORS = [['#1C664C', 'Pandan'], ['#B8701F', 'Caramel'], ['#7A4E2D', 'Espresso'], ['#3A6EA5', 'Blue'], ['#9A3B5B', 'Berry'], ['#5E6B2F', 'Matcha'], ['#C2412D', 'Chili'], ['#6B5CA5', 'Taro']];
const NAV = [
  ['Sales', [['dash', 'Overview', 'chart'], ['orders', 'Orders', 'receipt'], ['recon', 'Reconciliation', 'scale'], ['shifts', 'Shifts & cash', 'cash']]],
  ['Catalog', [['menu', 'Menu', 'coffee'], ['inv', 'Inventory', 'box']]],
  ['Members', [['custs', 'Customers', 'users'], ['loyalty', 'Loyalty & promos', 'star']]],
  ['Team', [['staff', 'Staff', 'user'], ['att', 'Attendance', 'clock']]],
  ['Setup', [['outlets', 'Outlets & QR', 'store'], ['settings', 'Settings', 'sliders']]],
];

B.start = (root, staff) => {
  B.staff = staff; B.root = root;
  root.innerHTML = `<div class="bo"><nav class="side" id="bo-side"></nav><main class="sheet" id="bo-main"></main></div>`;
  N.listeners.clear(); N.listeners.add(() => { if (B.live[B.page]) B.render(); });
  B.render();
};
B.live = { menu: 1, loyalty: 1, staff: 1, outlets: 1, settings: 1 }; // pages that redraw on reference-data changes
B.go = p => { B.page = p; B.render(); window.scrollTo(0, 0); };
B.render = () => {
  document.getElementById('bo-side').innerHTML = `<div class="brand"><div class="mark">${esc(N.conf().brand)}<i>.</i></div><div class="small muted">Back office · ${esc(B.staff.name)}</div></div>
    ${NAV.map(([g, ps]) => `<div class="grp">${g}</div>${ps.map(([k, l, i]) => `<button class="nav ${B.page === k ? 'on' : ''}" data-act="bo-go" data-p="${k}">${ic(i)} ${l}</button>`).join('')}`).join('')}
    <div class="grp"></div><button class="nav" data-act="bo-exit">${ic('out')} Exit back office</button>`;
  const main = document.getElementById('bo-main');
  const keepScroll = window.scrollY;
  (B.pages[B.page] || B.pages.dash)(main);
  if (B.live[B.page]) window.scrollTo(0, keepScroll);
};
Object.assign(N.acts, {
  'bo-go': el => B.go(el.dataset.p),
  'bo-exit': () => { N.listeners.clear(); App.leaveBO(); },
});
const head = (title, sub, actions = '') => `<div class="sheet-h"><div class="grow"><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="toolbar">${actions}</div></div>`;
const outletSel = (id, val, all = true) => `<select class="input" id="${id}">${all ? `<option value="all">All outlets</option>` : ''}${N.outletsSorted().map(o => `<option value="${o.id}" ${val === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
const firstOutlet = () => (B.outlet !== 'all' && N.outlets[B.outlet]) ? B.outlet : N.outletsSorted()[0]?.id;
const yesNo = v => v ? '<span class="badge ok">Yes</span>' : '<span class="badge">No</span>';
const save = async (path, data, msg = 'Saved') => { try { await N.db.doc(path).set(data); N.toast(msg); return true; } catch (e) { N.toast(N.errMsg(e), 'bad'); return false; } };
const del = async (path, label) => { if (!(await N.confirm('Delete ' + label + '?', 'This cannot be undone.', { ok: 'Delete', danger: true }))) return false; try { await N.db.doc(path).delete(); N.toast('Deleted'); return true; } catch (e) { N.toast(N.errMsg(e), 'bad'); return false; } };
const catOpts = () => N.catsSorted().map(c => [c.id, c.name]);
const outletOpts = () => N.outletsSorted().map(o => [o.id, o.name]);
const chanOpts = () => Object.keys(N.CH).map(k => [k, N.chName(k)]);
const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];

/* ---------- charts ---------- */
const nice = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
const short = v => v >= 1e9 ? (v / 1e9).toFixed(1).replace('.0', '') + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1).replace('.0', '') + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v));
B.barChart = (data, { h = 200, label = d => d.l } = {}) => {
  const W = 720, H = h, pl = 44, pr = 8, pt = 12, pb = 26;
  const max = nice(Math.max(1, ...data.map(d => d.v)));
  const iw = W - pl - pr, ih = H - pt - pb, bw = iw / Math.max(1, data.length);
  const every = Math.ceil(data.length / 12);
  const peak = data.reduce((m, d, i) => d.v > (data[m]?.v ?? -1) ? i : m, 0);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">`;
  for (let i = 0; i <= 4; i++) { const y = pt + ih - ih * i / 4; s += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end">${short(max * i / 4)}</text>`; }
  data.forEach((d, i) => {
    const bh = ih * d.v / max, x = pl + i * bw + bw * .15, y = pt + ih - bh;
    s += `<rect x="${x}" y="${y}" width="${bw * .7}" height="${Math.max(0, bh)}" rx="3" fill="${i === peak && d.v > 0 ? 'var(--accent)' : 'var(--accent-soft)'}"><title>${esc(label(d))}: ${N.rp(d.v)}</title></rect>`;
    if (i % every === 0) s += `<text x="${pl + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(d.l)}</text>`;
  });
  return `<div class="chart">${s}</svg></div>`;
};
B.hbars = (rows, fmt = N.rpn) => {
  const max = Math.max(1, ...rows.map(r => r.v));
  return rows.length ? `<div class="col gap-s">${rows.map(r => `<div class="hbar"><span>${esc(r.l)}</span><div class="trk"><i style="width:${Math.round(r.v / max * 100)}%"></i></div><span class="num">${fmt(r.v)}</span></div>`).join('')}</div>` : '<p class="muted small">No data.</p>';
};

/* ---------- date range ---------- */
const rangeOf = () => {
  const t = N.dkey();
  switch (B.range) {
    case 'yesterday': return [N.addDays(t, -1), N.addDays(t, -1)];
    case '7': return [N.addDays(t, -6), t];
    case '30': return [N.addDays(t, -29), t];
    case 'month': return [t.slice(0, 6) + '01', t];
    case 'custom': return [B.from || t, B.to || t];
    default: return [t, t];
  }
};
const rangeBar = () => {
  const [a, b] = rangeOf();
  return `${outletSel('r-outlet', B.outlet)}<div class="seg">${[['today', 'Today'], ['yesterday', 'Yesterday'], ['7', '7 days'], ['30', '30 days'], ['month', 'This month'], ['custom', 'Custom']].map(([k, l]) => `<button data-act="bo-range" data-r="${k}" class="${B.range === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${B.range === 'custom' ? `<input class="input" type="date" id="r-from" value="${N.toInput(a)}"><input class="input" type="date" id="r-to" value="${N.toInput(b)}"><button class="btn" data-act="bo-range-apply">Apply</button>` : ''}`;
};
Object.assign(N.acts, {
  'bo-range': el => { B.range = el.dataset.r; B.render(); },
  'bo-range-apply': () => { B.from = N.fromInput(document.getElementById('r-from').value); B.to = N.fromInput(document.getElementById('r-to').value); if (B.from > B.to) [B.from, B.to] = [B.to, B.from]; if (N.dayRange(B.from, B.to).length > 92) return N.toast('Pick 92 days or fewer', 'bad'); B.render(); },
});
const bindOutlet = (main, id = 'r-outlet') => { const s = main.querySelector('#' + id); if (s) s.onchange = () => { B.outlet = s.value; B.render(); }; };

B.pages = {};

/* ================= Overview ================= */
B.pages.dash = async main => {
  const [a, b] = rangeOf();
  main.innerHTML = head('Overview', `${N.dlabel(a, { day: 'numeric', month: 'short', year: 'numeric' })}${a !== b ? ' – ' + N.dlabel(b, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`, `<button class="btn" data-act="bo-dash-csv">${ic('download')} Export CSV</button>`) +
    `<div class="toolbar">${rangeBar()}</div><div id="dash-body"><div class="empty">Loading sales…</div></div>`;
  bindOutlet(main);
  const outlets = B.outlet === 'all' ? N.outletsSorted().map(o => o.id) : [B.outlet];
  if (!outlets.length) { main.querySelector('#dash-body').innerHTML = '<div class="empty">Add an outlet first.</div>'; return; }
  let sums;
  try { sums = await N.sumRange(outlets, a, b, (i, n) => { const el = main.querySelector('#dash-body .empty'); if (el && n > 3) el.textContent = `Loading sales… ${i}/${n} days`; }); }
  catch (e) { main.querySelector('#dash-body').innerHTML = `<div class="note">${esc(N.errMsg(e))}</div>`; return; }
  if (B.page !== 'dash') return;
  B.lastSums = sums;
  const m = N.mergeSums(sums);
  const single = a === b;
  const byDay = N.dayRange(a, b > N.dkey() ? N.dkey() : b).map(d => ({ l: N.dlabel(d, { day: 'numeric', month: 'short' }), v: sums.filter(s => s.d === d).reduce((t, s) => t + s.net, 0) }));
  const hours = Array.from({ length: 24 }, (_, h) => ({ l: N.pad(h), v: m.hr[h] || 0 })).filter((d, i, arr) => arr.slice(0, i + 1).some(x => x.v) && arr.slice(i).some(x => x.v));
  const items = Object.entries(m.items).map(([id, v]) => ({ id, ...v })).sort((x, y) => y.a - x.a);
  const cats = Object.entries(m.cats).map(([id, v]) => ({ l: N.cats[id]?.name || 'Other', v: v.a, q: v.q })).sort((x, y) => y.v - x.v);
  const perOutlet = outlets.length > 1 ? outlets.map(o => ({ l: N.outlets[o]?.name || o, v: sums.filter(s => s.o === o).reduce((t, s) => t + s.net, 0) })).sort((x, y) => y.v - x.v) : null;
  main.querySelector('#dash-body').outerHTML = `<div class="col gap-l">
    <div class="kpis">
      <div class="kpi"><span class="eyebrow">Net sales</span><b>${N.rpn(m.net)}</b><span class="small muted">after discounts, before service & tax</span></div>
      <div class="kpi"><span class="eyebrow">Orders</span><b>${N.rpn(m.n)}</b><span class="small muted">${m.open ? m.open + ' still open' : 'all closed'}</span></div>
      <div class="kpi"><span class="eyebrow">Average bill</span><b>${N.rpn(m.n ? m.net / m.n : 0)}</b><span class="small muted">net per order</span></div>
      <div class="kpi"><span class="eyebrow">Discounts</span><b>${N.rpn(m.disc)}</b><span class="small muted">${m.sub ? (m.disc / m.sub * 100).toFixed(1) : 0}% of gross</span></div>
      <div class="kpi"><span class="eyebrow">Refunds & voids</span><b>${N.rpn(m.refAmt + m.voidAmt)}</b><span class="small muted">${m.ref} refunds · ${m.voids} voids</span></div>
      <div class="kpi"><span class="eyebrow">Member orders</span><b>${m.n ? Math.round(m.cust / m.n * 100) : 0}%</b><span class="small muted">${N.rpn(m.pe)} pts earned · ${N.rpn(m.pr)} used</span></div>
    </div>
    <div class="panel"><div class="panel-h"><h2 class="grow">${single ? 'Sales by hour' : 'Net sales by day'}</h2><span class="small muted">Highest bar in dark green</span></div>${B.barChart(single ? hours : byDay)}</div>
    <div class="split">
      <div class="panel"><h2>By channel</h2>${B.hbars(Object.entries(m.ch).map(([k, v]) => ({ l: `${N.chName(k)} (${v.n})`, v: v.net })).sort((x, y) => y.v - x.v))}</div>
      <div class="panel"><h2>By payment method</h2>${B.hbars(Object.entries(m.pay).map(([k, v]) => ({ l: N.payName(k), v })).sort((x, y) => y.v - x.v))}</div>
      <div class="panel"><h2>By category</h2>${B.hbars(cats)}</div>
      ${perOutlet ? `<div class="panel"><h2>By outlet</h2>${B.hbars(perOutlet)}</div>` : `<div class="panel"><h2>Collected</h2><div class="tbl-wrap"><table class="t"><tbody><tr><td>Gross item sales</td><td class="n">${N.rpn(m.sub)}</td></tr><tr><td>− Discounts</td><td class="n">${N.rpn(m.disc)}</td></tr><tr><td>+ Service charge</td><td class="n">${N.rpn(m.svc)}</td></tr><tr><td>+ Tax</td><td class="n">${N.rpn(m.tax)}</td></tr><tr><td><b>Total collected</b></td><td class="n"><b>${N.rpn(m.tot)}</b></td></tr></tbody></table></div></div>`}
    </div>
    <div class="panel"><h2>Best sellers</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>Item</th><th>Category</th><th class="n">Qty</th><th class="n">Sales</th><th class="n">Share</th></tr></thead><tbody>
      ${items.slice(0, 15).map((it, i) => `<tr><td class="mono">${i + 1}</td><td>${esc(it.n)}</td><td class="muted">${esc(N.cats[it.c]?.name || '')}</td><td class="n">${it.q}</td><td class="n">${N.rpn(it.a)}</td><td class="n">${m.sub ? (it.a / m.sub * 100).toFixed(1) : 0}%</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No sales in this period yet.</td></tr>'}
    </tbody></table></div></div></div>`;
};
N.acts['bo-dash-csv'] = () => {
  const s = B.lastSums || []; if (!s.length) return N.toast('Nothing to export yet', 'bad');
  const rows = [['Date', 'Outlet', 'Orders', 'Gross', 'Discounts', 'Net sales', 'Service', 'Tax', 'Total collected', 'Refunds', 'Voids', ...N.conf().pays.map(p => p.n), 'GoFood', 'GrabFood', 'ShopeeFood']];
  for (const x of s) rows.push([x.d, N.outlets[x.o]?.name || x.o, x.n, x.sub, x.disc, x.net, x.svc, x.tax, x.tot, x.refAmt, x.voidAmt, ...N.conf().pays.map(p => x.pay?.[p.id] || 0), x.pay?.['ch:gofood'] || 0, x.pay?.['ch:grab'] || 0, x.pay?.['ch:shopee'] || 0]);
  const [a, b] = rangeOf();
  N.download(`naseyan-sales-${a}-${b}.csv`, N.csv(rows));
};

/* ================= Orders ================= */
B.pages.orders = async main => {
  const o = firstOutlet();
  B.ordDay = B.ordDay || N.dkey();
  B.ordF = B.ordF || { st: 'all', q: '' };
  main.innerHTML = head('Orders', 'Every order for one outlet and day, including voids and refunds.', `<button class="btn" data-act="bo-ord-csv">${ic('download')} Export CSV</button>`) +
    `<div class="toolbar">${outletSel('o-outlet', o, false)}<input class="input" type="date" id="o-day" value="${N.toInput(B.ordDay)}"><div class="seg">${[['all', 'All'], ['paid', 'Paid'], ['open', 'Open'], ['void', 'Void'], ['refund', 'Refunded']].map(([k, l]) => `<button data-act="bo-ord-st" data-s="${k}" class="${B.ordF.st === k ? 'on' : ''}">${l}</button>`).join('')}</div><input class="input" id="o-q" placeholder="Search number, name, member" value="${esc(B.ordF.q)}"></div><div id="o-body"><div class="empty">Loading orders…</div></div>`;
  main.querySelector('#o-outlet').onchange = e => { B.outlet = e.target.value; B.render(); };
  main.querySelector('#o-day').onchange = e => { B.ordDay = N.fromInput(e.target.value) || N.dkey(); B.render(); };
  main.querySelector('#o-q').oninput = e => { B.ordF.q = e.target.value.toLowerCase(); draw(); };
  if (!o) return main.querySelector('#o-body').innerHTML = '<div class="empty">Add an outlet first.</div>';
  try { B.ordList = (await N.loadDay(o, B.ordDay)).sort((x, y) => (y.pt || y.ct) - (x.pt || x.ct)); } catch (e) { main.querySelector('#o-body').innerHTML = `<div class="note">${esc(N.errMsg(e))}</div>`; return; }
  const draw = () => {
    const f = B.ordList.filter(x => (B.ordF.st === 'all' || x.st === B.ordF.st || (B.ordF.st === 'open' && x.st === 'new')) && (!B.ordF.q || [x.no, x.name, x.cust, x.cname, x.tbl].join(' ').toLowerCase().includes(B.ordF.q)));
    const tot = f.filter(x => x.st === 'paid').reduce((s, x) => s + x.tot, 0);
    main.querySelector('#o-body').innerHTML = `<p class="small muted">${f.length} orders · ${N.rp(tot)} paid total</p><div class="tbl-wrap"><table class="t"><thead><tr><th>No</th><th>Time</th><th>Type</th><th>Customer</th><th>Staff</th><th>Status</th><th class="n">Total</th></tr></thead><tbody>
      ${f.map(x => `<tr class="click" data-act="bo-ord" data-id="${x.id}"><td class="mono">${esc(x.no)}</td><td class="mono">${N.hm(x.pt || x.ct)}</td><td>${esc(N.chName(x.ch))}${x.tbl ? ' · ' + esc(x.tbl) : ''}</td><td>${esc(x.cname || x.name || '')}${x.cust ? ' <span class="badge acc">Member</span>' : ''}</td><td>${esc(N.staff[x.cashier || x.by]?.name || '')}</td><td>${P.badge(x)}</td><td class="n">${N.rpn(x.tot)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No orders.</td></tr>'}</tbody></table></div>`;
  };
  draw();
};
Object.assign(N.acts, {
  'bo-ord-st': el => { B.ordF.st = el.dataset.s; B.render(); },
  'bo-ord': el => {
    const x = B.ordList.find(o => o.id === el.dataset.id); if (!x) return;
    const tl = [['Created', x.ct, x.by], ['Accepted (QR)', x.acc], ['Paid', x.pt, x.cashier], ['Voided', x.void?.at, x.void?.by], ['Refunded', x.refund?.at, x.refund?.by]].filter(r => r[1]);
    const m = N.modal({ title: `Order ${esc(x.no)}`, body: `<div class="row wrap">${P.badge(x)}<span class="small muted">${esc(N.outlets[x.o]?.name || '')} · till ${esc(x.dev)}</span></div>
      <div class="tbl-wrap"><table class="t"><tbody>${tl.map(([l, t, s]) => `<tr><td>${l}</td><td class="mono">${N.dt(t)}</td><td>${esc(N.staff[s]?.name || '')}</td></tr>`).join('')}</tbody></table></div>
      ${x.md ? `<p class="small">Manual discount: ${esc(x.md.l)} · by ${esc(N.staff[x.md.by]?.name || '')}${x.md.ok !== x.md.by ? ', approved by ' + esc(N.staff[x.md.ok]?.name || '') : ''}</p>` : ''}
      ${x.void ? `<div class="note">Void reason: ${esc(x.void.why)} · approved by ${esc(N.staff[x.void.ok]?.name || '')}</div>` : ''}
      ${x.refund ? `<div class="note">Refund by ${esc(N.payName(x.refund.m))}: ${esc(x.refund.why)} · approved by ${esc(N.staff[x.refund.ok]?.name || '')}</div>` : ''}
      ${(x.vl || []).length ? `<div class="note">Items removed after sending: ${x.vl.map(v => `${v.q}× ${esc(v.n)} (approved by ${esc(N.staff[v.ok]?.name || '')})`).join(', ')}</div>` : ''}
      <pre class="receipt" id="rcpt">${esc(P.receipt(x))}</pre>`, foot: `<button class="btn" data-copy>${ic('copy')} Copy receipt</button>` });
    m.$('[data-copy]').onclick = () => N.copy(P.receipt(x), m.$('#rcpt'));
  },
  'bo-ord-csv': () => {
    const list = B.ordList || []; if (!list.length) return N.toast('No orders to export', 'bad');
    const rows = [['Order', 'Date', 'Time', 'Outlet', 'Till', 'Channel', 'Table', 'Customer', 'Member phone', 'Status', 'Items', 'Gross', 'Discount', 'Net', 'Service', 'Tax', 'Total', 'Payments', 'Cashier', 'Void/refund reason']];
    for (const x of list) rows.push([x.no, B.ordDay, N.hm(x.pt || x.ct), N.outlets[x.o]?.name, x.dev, N.chName(x.ch), x.tbl || '', x.cname || x.name || '', x.cust || '', x.st, (x.lines || []).map(l => `${l.q}x ${l.n}${l.m ? ' (' + l.m + ')' : ''}`).join('; '), x.sub, x.disc, x.net, x.svc, x.tax, x.tot, (x.pays || []).map(p => N.payName(p.m) + ' ' + p.a).join('; '), N.staff[x.cashier || x.by]?.name || '', x.void?.why || x.refund?.why || '']);
    N.download(`naseyan-orders-${N.outlets[firstOutlet()]?.code || 'outlet'}-${B.ordDay}.csv`, N.csv(rows));
  },
});

/* ================= Reconciliation ================= */
B.pages.recon = async main => {
  const o = firstOutlet();
  B.recDay = B.recDay || N.addDays(N.dkey(), -1);
  main.innerHTML = head('Payment reconciliation', 'Match what the till recorded against what actually arrived: bank settlements for QRIS and cards, e-wallet and delivery payouts, and cash deposited.') +
    `<div class="toolbar">${outletSel('rc-outlet', o, false)}<input class="input" type="date" id="rc-day" value="${N.toInput(B.recDay)}"></div><div id="rc-body"><div class="empty">Loading…</div></div>`;
  main.querySelector('#rc-outlet').onchange = e => { B.outlet = e.target.value; B.render(); };
  main.querySelector('#rc-day').onchange = e => { B.recDay = N.fromInput(e.target.value); B.render(); };
  if (!o) return;
  const d = B.recDay;
  let sum, rec, hist;
  try {
    sum = await N.getSum(o, d);
    const rs = await N.db.doc(`outlets/${o}/recon/${d}`).get(); rec = rs.exists ? rs.data() : { m: {}, status: 'open' };
    hist = (await N.db.collection(`outlets/${o}/recon`).where('d', '>=', N.addDays(N.dkey(), -30)).get()).docs.map(x => x.data());
  } catch (e) { main.querySelector('#rc-body').innerHTML = `<div class="note">${esc(N.errMsg(e))}</div>`; return; }
  const refundsByM = {};
  try { for (const x of await N.loadDay(o, d)) if (x.st === 'refund') refundsByM[x.refund?.m] = (refundsByM[x.refund?.m] || 0) + x.tot; } catch { }
  const methods = [...new Set([...Object.keys(sum.pay || {}), ...Object.keys(rec.m || {})])];
  const rows = methods.map(k => ({ k, sys: (sum.pay?.[k] || 0) - (refundsByM[k] || 0), set: rec.m?.[k]?.a, ref: rec.m?.[k]?.ref || '' }));
  const doneDays = new Set(hist.filter(h => h.status === 'done').map(h => h.d));
  main.querySelector('#rc-body').outerHTML = `<div class="col gap-l">
    ${d >= N.dkey() ? '<div class="note">This day is still trading. Reconcile it after closing.</div>' : ''}
    <div class="panel"><div class="panel-h"><h2 class="grow">${N.dlabel(d, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>${rec.status === 'done' ? `<span class="badge ok">Reconciled by ${esc(N.staff[rec.by]?.name || '')}</span>` : '<span class="badge warn">Not reconciled</span>'}</div>
    ${rows.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Method</th><th class="n">Till recorded (net of refunds)</th><th class="n">Actually received</th><th class="n">Difference</th><th>Settlement ref / note</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(N.payName(r.k))}</td><td class="n">${N.rpn(r.sys)}</td><td class="n"><input class="input num" style="max-width:150px;text-align:right" data-rc="${r.k}" type="number" value="${r.set ?? ''}" placeholder="${r.sys}"></td><td class="n" id="rcv-${r.k.replace(':', '_')}">${r.set == null ? '—' : diff(r.set - r.sys)}</td><td><input class="input" data-rcref="${r.k}" value="${esc(r.ref)}"></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">No payments recorded on this day.</div>'}
    <label class="field"><span>Note</span><input class="input" id="rc-note" value="${esc(rec.note || '')}"></label>
    <div class="row"><span class="grow small muted">Bank settlements usually arrive one or two working days later. Enter the amount for this trading day.</span><button class="btn" data-act="bo-rc-save" data-s="open">Save draft</button><button class="btn primary" data-act="bo-rc-save" data-s="done">${ic('check')} Mark reconciled</button></div></div>
    <div class="panel"><h2>Last 30 days</h2><div class="row wrap gap-s">${N.dayRange(N.addDays(N.dkey(), -30), N.addDays(N.dkey(), -1)).reverse().map(k => `<button class="badge ${doneDays.has(k) ? 'ok' : 'warn'}" style="border:0;cursor:pointer;padding:6px 10px" data-act="bo-rc-day" data-d="${k}">${N.dlabel(k, { day: 'numeric', month: 'short' })}</button>`).join('')}</div><p class="small muted">Green days are reconciled.</p></div></div>`;
  main.querySelectorAll('[data-rc]').forEach(inp => inp.oninput = () => { const r = rows.find(x => x.k === inp.dataset.rc); const cell = main.querySelector('#rcv-' + r.k.replace(':', '_')); cell.innerHTML = inp.value === '' ? '—' : diff(Number(inp.value) - r.sys); });
  B.recRows = rows;
};
const diff = v => v === 0 ? '<span class="badge ok">0</span>' : `<span class="badge ${Math.abs(v) < 1000 ? 'warn' : 'bad'}">${v > 0 ? '+' : '−'}${N.rpn(Math.abs(v))}</span>`;
Object.assign(N.acts, {
  'bo-rc-day': el => { B.recDay = el.dataset.d; B.render(); },
  'bo-rc-save': async el => {
    const o = firstOutlet(), d = B.recDay, m = {};
    document.querySelectorAll('[data-rc]').forEach(inp => { const k = inp.dataset.rc; const ref = document.querySelector(`[data-rcref="${k}"]`).value.trim(); m[k] = { a: inp.value === '' ? null : Number(inp.value), ref }; });
    if (el.dataset.s === 'done' && Object.values(m).some(v => v.a == null)) return N.toast('Enter the received amount for every method first', 'bad');
    if (await save(`outlets/${o}/recon/${d}`, { o, d, m, note: document.getElementById('rc-note').value.trim(), status: el.dataset.s, by: B.staff.id, at: Date.now() }, el.dataset.s === 'done' ? 'Day reconciled' : 'Draft saved')) B.render();
  },
});

/* ================= Shifts ================= */
B.pages.shifts = async main => {
  const o = firstOutlet();
  B.shMonth = B.shMonth || N.mkey();
  main.innerHTML = head('Shifts & cash', 'Opening float, cash movements and the closing count for every till.') +
    `<div class="toolbar">${outletSel('sh-outlet', o, false)}<input class="input" type="month" id="sh-m" value="${B.shMonth.slice(0, 4)}-${B.shMonth.slice(4)}"></div><div id="sh-body"><div class="empty">Loading…</div></div>`;
  main.querySelector('#sh-outlet').onchange = e => { B.outlet = e.target.value; B.render(); };
  main.querySelector('#sh-m').onchange = e => { B.shMonth = e.target.value.replace('-', ''); B.render(); };
  if (!o) return;
  let list = [];
  try { const s = await N.shiftRef(o, B.shMonth).get(); list = Object.values(s.data()?.s || {}).sort((a, b) => b.open - a.open); } catch (e) { return main.querySelector('#sh-body').innerHTML = `<div class="note">${esc(N.errMsg(e))}</div>`; }
  const totVar = list.filter(s => s.close).reduce((t, s) => t + (s.counted - s.expected), 0);
  main.querySelector('#sh-body').outerHTML = `<div class="col gap-l"><div class="kpis"><div class="kpi"><span class="eyebrow">Shifts</span><b>${list.length}</b></div><div class="kpi"><span class="eyebrow">Still open</span><b>${list.filter(s => !s.close).length}</b></div><div class="kpi"><span class="eyebrow">Net over / short</span><b>${totVar >= 0 ? '' : '−'}${N.rpn(Math.abs(totVar))}</b></div></div>
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Till</th><th>Opened</th><th>Closed</th><th>Staff</th><th class="n">Float</th><th class="n">Cash in/out</th><th class="n">Expected</th><th class="n">Counted</th><th class="n">Over/short</th><th>Note</th></tr></thead><tbody>
    ${list.map(s => { const io = (s.io || []).reduce((t, i) => t + (i.t === 'in' ? i.a : -i.a), 0); return `<tr class="click" data-act="bo-shift" data-id="${s.id}"><td class="mono">${esc(s.dev)}</td><td class="mono">${N.dt(s.open)}</td><td class="mono">${s.close ? N.dt(s.close) : '<span class="badge warn">Open</span>'}</td><td>${esc(N.staff[s.by]?.name || '')}${s.closeBy && s.closeBy !== s.by ? ' → ' + esc(N.staff[s.closeBy]?.name || '') : ''}</td><td class="n">${N.rpn(s.float)}</td><td class="n">${io ? N.rpn(io) : '—'}</td><td class="n">${s.close ? N.rpn(s.expected) : '—'}</td><td class="n">${s.close ? N.rpn(s.counted) : '—'}</td><td class="n">${s.close ? diff(s.counted - s.expected) : ''}</td><td class="small">${esc(s.note || '')}</td></tr>`; }).join('') || '<tr><td colspan="10" class="muted">No shifts this month.</td></tr>'}
    </tbody></table></div></div>`;
  B.shList = list;
};
N.acts['bo-shift'] = el => {
  const s = B.shList.find(x => x.id === el.dataset.id); if (!s) return;
  N.modal({ title: `Till ${esc(s.dev)} · ${N.dt(s.open)}`, body: `${s.stats ? `<div class="tbl-wrap"><table class="t"><tbody><tr><td>Orders</td><td class="n">${s.stats.n}</td></tr><tr><td>Net sales</td><td class="n">${N.rpn(s.stats.net)}</td></tr>${Object.entries(s.stats.pay || {}).map(([k, v]) => `<tr><td>${esc(N.payName(k))}</td><td class="n">${N.rpn(v)}</td></tr>`).join('')}<tr><td>Refunds</td><td class="n">${N.rpn(s.stats.refunds)}</td></tr><tr><td>Voids</td><td class="n">${s.stats.voids}</td></tr></tbody></table></div>` : '<p class="muted">Shift is still open.</p>'}
    <h3>Cash movements</h3>${(s.io || []).length ? `<div class="tbl-wrap"><table class="t"><tbody>${s.io.map(i => `<tr><td class="mono">${N.hm(i.at)}</td><td>${i.t === 'in' ? 'In' : 'Out'}: ${esc(i.why)}</td><td>${esc(N.staff[i.by]?.name || '')}</td><td class="n">${N.rpn(i.a)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">None.</p>'}` });
};

/* ================= Menu ================= */
B.pages.menu = main => {
  const tab = B.tab.menu || 'items';
  main.innerHTML = head('Menu', 'Prices are before tax. Delivery prices add each platform’s markup automatically (see Settings).',
    tab === 'items' ? `<button class="btn primary" data-act="bo-item" data-id="">${ic('plus')} Add item</button>` : tab === 'cats' ? `<button class="btn primary" data-act="bo-cat" data-id="">${ic('plus')} Add category</button>` : `<button class="btn primary" data-act="bo-mod" data-id="">${ic('plus')} Add option group</button>`) +
    `<div class="seg">${[['items', 'Items'], ['cats', 'Categories'], ['mods', 'Options']].map(([k, l]) => `<button data-act="bo-tab" data-pg="menu" data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="menu-body"></div>`;
  const body = main.querySelector('#menu-body');
  if (tab === 'items') {
    const items = N.itemsSorted(true);
    body.innerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Item</th><th>Category</th><th>Station</th><th class="n">Price</th><th>Options</th><th>Stock</th><th>On QR menu</th><th>Status</th></tr></thead><tbody>
      ${items.map(i => `<tr class="click" data-act="bo-item" data-id="${i.id}"><td><b>${esc(i.name)}</b>${Object.keys(i.prices || {}).length ? ' <span class="badge">outlet prices</span>' : ''}</td><td>${esc(N.cats[i.cat]?.name || '—')}</td><td class="muted">${N.cats[i.cat]?.station === 'kitchen' ? 'Kitchen' : 'Bar'}</td><td class="n">${N.rpn(i.price)}</td><td class="small muted">${(i.mods || []).map(m => esc(N.mods[m]?.name || '')).join(', ')}</td><td>${i.track ? `<span class="badge acc">Tracked</span>` : '<span class="muted small">—</span>'}</td><td>${yesNo(!i.hideQr)}</td><td>${i.active === false ? '<span class="badge">Hidden</span>' : '<span class="badge ok">Selling</span>'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">No items yet. Add a category first, then items.</td></tr>'}</tbody></table></div>`;
  } else if (tab === 'cats') {
    body.innerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Order</th><th>Category</th><th>Tickets go to</th><th class="n">Items</th></tr></thead><tbody>
      ${N.catsSorted().map(c => `<tr class="click" data-act="bo-cat" data-id="${c.id}"><td class="mono">${c.sort ?? ''}</td><td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${esc(c.color || 'var(--accent)')};margin-right:8px"></span>${esc(c.name)}</td><td>${c.station === 'kitchen' ? 'Kitchen screen' : 'Bar screen'}</td><td class="n">${Object.values(N.items).filter(i => i.cat === c.id).length}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No categories yet.</td></tr>'}</tbody></table></div>`;
  } else {
    body.innerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Option group</th><th>Rule</th><th>Choices</th><th class="n">Used by</th></tr></thead><tbody>
      ${Object.values(N.mods).sort((a, b) => a.name.localeCompare(b.name)).map(g => `<tr class="click" data-act="bo-mod" data-id="${g.id}"><td><b>${esc(g.name)}</b></td><td class="small">${g.min ? 'Required' : 'Optional'}, pick ${g.max > 1 ? 'up to ' + g.max : 'one'}</td><td class="small muted">${(g.opts || []).map(o => esc(o.n) + (o.p ? ' +' + N.rpn(o.p) : '')).join(', ')}</td><td class="n">${Object.values(N.items).filter(i => (i.mods || []).includes(g.id)).length} items</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No option groups yet.</td></tr>'}</tbody></table></div>`;
  }
};
N.acts['bo-tab'] = el => { B.tab[el.dataset.pg] = el.dataset.t; B.render(); };
N.acts['bo-item'] = async el => {
  const id = el.dataset.id, it = N.items[id] || { active: true, price: 0, mods: [], prices: {} };
  if (!N.catsSorted().length) return N.toast('Add a category first', 'bad');
  const outs = N.outletsSorted();
  const v = await N.form(id ? 'Edit ' + esc(it.name) : 'Add item', [
    { id: 'name', label: 'Name', value: it.name, req: true, auto: true },
    { id: 'cat', label: 'Category', type: 'select', opts: catOpts(), value: it.cat },
    { id: 'price', label: 'Price (Rp)', type: 'number', value: it.price, req: true },
    { id: 'sort', label: 'Sort order', type: 'number', value: it.sort ?? '' },
    { id: 'desc', label: 'Description (shown on QR menu)', type: 'textarea', value: it.desc || '' },
    { id: 'mods', label: 'Option groups', type: 'checks', opts: Object.values(N.mods).map(g => [g.id, g.name]), value: it.mods || [] },
    ...outs.map(o => ({ id: 'p_' + o.id, label: `Price at ${o.name} (blank = standard)`, type: 'number', value: it.prices?.[o.id] ?? '' })),
    { id: 'track', label: 'Track stock count (bottled drinks, pastries)', type: 'check', value: it.track },
    { id: 'low', label: 'Low-stock alert at', type: 'number', value: it.low ?? 5 },
    { id: 'qr', label: 'Show on table QR menu', type: 'check', value: !it.hideQr },
    { id: 'active', label: 'Selling (untick to hide everywhere)', type: 'check', value: it.active !== false },
    ...(id ? [{ id: '_del', label: 'Delete this item permanently', type: 'check' }] : []),
  ], { cls: 'wide' });
  if (!v) return;
  if (v._del) return del('items/' + id, it.name);
  const prices = {}; outs.forEach(o => { if (v['p_' + o.id] != null) prices[o.id] = v['p_' + o.id]; });
  const doc = { name: v.name, cat: v.cat, price: v.price, sort: v.sort, desc: v.desc, mods: v.mods, prices, track: v.track, low: v.low || 0, hideQr: !v.qr, active: v.active, avail: it.avail || {} };
  await save('items/' + (id || 'i' + N.uid(7)), doc);
};
N.acts['bo-cat'] = async el => {
  const id = el.dataset.id, c = N.cats[el.dataset.id] || { station: 'bar', color: COLORS[0][0] };
  const v = await N.form(id ? 'Edit category' : 'Add category', [
    { id: 'name', label: 'Name', value: c.name, req: true, auto: true },
    { id: 'station', label: 'Tickets go to', type: 'select', opts: [['bar', 'Bar screen'], ['kitchen', 'Kitchen screen']], value: c.station },
    { id: 'color', label: 'Colour on the till', type: 'select', opts: COLORS, value: c.color },
    { id: 'sort', label: 'Sort order', type: 'number', value: c.sort ?? '' },
    ...(id ? [{ id: '_del', label: 'Delete this category', type: 'check' }] : []),
  ], { cls: 'narrow' });
  if (!v) return;
  if (v._del) { if (Object.values(N.items).some(i => i.cat === id)) return N.toast('Move or delete its items first', 'bad'); return del('cats/' + id, c.name); }
  delete v._del;
  await save('cats/' + (id || 'c' + N.uid(6)), v);
};
N.acts['bo-mod'] = async el => {
  const id = el.dataset.id, g = N.mods[id] || { min: 0, max: 1, opts: [] };
  const v = await N.form(id ? 'Edit option group' : 'Add option group', [
    { id: 'name', label: 'Name', value: g.name, req: true, auto: true, ph: 'e.g. Milk' },
    { id: 'min', label: 'Minimum choices (0 = optional)', type: 'number', value: g.min },
    { id: 'max', label: 'Maximum choices', type: 'number', value: g.max },
    { id: 'opts', label: 'Choices, one per line as Name = extra price', type: 'textarea', value: (g.opts || []).map(o => `${o.n} = ${o.p || 0}`).join('\n'), ph: 'Fresh milk = 0\nOat milk = 8000' },
    ...(id ? [{ id: '_del', label: 'Delete this option group', type: 'check' }] : []),
  ], { validate: v => v.opts.split('\n').filter(s => s.trim()).length ? '' : 'Add at least one choice' });
  if (!v) return;
  if (v._del) { if (Object.values(N.items).some(i => (i.mods || []).includes(id))) return N.toast('Remove it from items first', 'bad'); return del('mods/' + id, g.name); }
  const opts = v.opts.split('\n').map(s => s.trim()).filter(Boolean).map(s => { const [n, p] = s.split('='); return { n: n.trim(), p: Math.max(0, Number((p || '0').replace(/[^\d]/g, '')) || 0) }; });
  await save('mods/' + (id || 'm' + N.uid(6)), { name: v.name, min: Math.max(0, v.min || 0), max: Math.max(1, v.max || 1), opts });
};

/* ================= Inventory ================= */
B.pages.inv = async main => {
  const o = firstOutlet();
  main.innerHTML = head('Inventory', 'Item counts for stock-tracked products. On hand = last count + deliveries ± adjustments − sales since the count.') +
    `<div class="toolbar">${outletSel('iv-outlet', o, false)}</div><div id="iv-body"><div class="empty">Counting…</div></div>`;
  main.querySelector('#iv-outlet').onchange = e => { B.outlet = e.target.value; B.render(); };
  if (!o) return;
  let r;
  try { r = await N.stock(o); } catch (e) { return main.querySelector('#iv-body').innerHTML = `<div class="note">${esc(N.errMsg(e))}</div>`; }
  if (B.page !== 'inv') return;
  B.inv = r;
  const rows = Object.values(r.res).sort((a, b) => a.name.localeCompare(b.name));
  const moves = Object.entries(r.inv.moves || {}).map(([id, m]) => ({ id, ...m })).sort((a, b) => b.at - a.at).slice(0, 40);
  main.querySelector('#iv-body').outerHTML = `<div class="col gap-l">
    ${rows.some(x => !x.counted) ? '<div class="note">Some tracked items have never been counted. Do a stock count to start tracking them.</div>' : ''}
    ${rows.some(x => x.stale) ? '<div class="note">Some counts are older than 62 days. Count again so sales history stays accurate.</div>' : ''}
    <div class="tbl-wrap"><table class="t"><thead><tr><th>Item</th><th>Last count</th><th class="n">Counted</th><th class="n">+ Received</th><th class="n">± Adjusted</th><th class="n">− Sold</th><th class="n">On hand</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map(x => `<tr><td><b>${esc(x.name)}</b></td><td class="mono small">${x.counted ? N.dt(x.at) : '—'}</td><td class="n">${x.counted ? x.base : '—'}</td><td class="n">${x.in || ''}</td><td class="n">${x.adj || ''}</td><td class="n">${x.sold || ''}</td><td class="n"><b>${x.qty ?? '—'}</b></td><td>${x.qty == null ? '<span class="badge">Not counted</span>' : x.qty <= 0 ? '<span class="badge bad">Out</span>' : x.qty <= x.low ? '<span class="badge warn">Low</span>' : '<span class="badge ok">OK</span>'}</td>
      <td><div class="row gap-s"><button class="btn sm" data-act="bo-inv" data-k="receive" data-i="${x.id}" ${x.counted ? '' : 'disabled'}>Receive</button><button class="btn sm" data-act="bo-inv" data-k="adjust" data-i="${x.id}" ${x.counted ? '' : 'disabled'}>Waste / adjust</button><button class="btn sm" data-act="bo-inv" data-k="count" data-i="${x.id}">Count</button></div></td></tr>`).join('') || '<tr><td colspan="9" class="muted">No items are stock-tracked. Turn on “Track stock count” for an item in Menu.</td></tr>'}
    </tbody></table></div>
    <div class="panel"><h2>Recent stock movements</h2>${moves.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>When</th><th>Item</th><th>Type</th><th class="n">Qty</th><th>Reason</th><th>By</th></tr></thead><tbody>${moves.map(m => `<tr><td class="mono small">${N.dt(m.at)}</td><td>${esc(N.items[m.i]?.name || m.i)}</td><td>${m.r === 'receive' ? 'Received' : 'Adjusted'}</td><td class="n">${m.q > 0 ? '+' : ''}${m.q}</td><td>${esc(m.why || '')}</td><td>${esc(N.staff[m.by]?.name || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">None yet.</p>'}</div></div>`;
};
N.acts['bo-inv'] = async el => {
  const o = firstOutlet(), i = el.dataset.i, k = el.dataset.k, it = N.items[i], cur = B.inv?.res?.[i];
  const f = k === 'count' ? [{ id: 'q', label: `Counted on shelf now${cur?.qty != null ? ` (system says ${cur.qty})` : ''}`, type: 'number', req: true, auto: true }]
    : k === 'receive' ? [{ id: 'q', label: 'Quantity received', type: 'number', req: true, auto: true }, { id: 'why', label: 'Supplier / delivery note' }]
    : [{ id: 'q', label: 'Change (negative for waste, e.g. −2)', type: 'number', req: true, auto: true }, { id: 'why', label: 'Reason', type: 'select', opts: [['Waste / expired', 'Waste / expired'], ['Damaged', 'Damaged'], ['Staff meal', 'Staff meal'], ['Transfer out', 'Transfer out'], ['Transfer in', 'Transfer in'], ['Correction', 'Correction']], value: 'Waste / expired' }];
  const v = await N.form(`${k === 'count' ? 'Stock count' : k === 'receive' ? 'Receive stock' : 'Adjust stock'} · ${esc(it.name)}`, f, { cls: 'narrow' });
  if (!v) return;
  const ref = N.invRef(o);
  try {
    await N.ensureDoc(ref, { counts: {}, moves: {} });
    if (k === 'count') await ref.update({ counts: { [i]: { q: v.q, at: Date.now(), by: B.staff.id } } });
    else await ref.update({ moves: { [N.uid(8)]: { i, q: v.q, r: k === 'receive' ? 'receive' : 'adjust', why: v.why || '', at: Date.now(), by: B.staff.id } } });
    N.toast('Stock updated'); B.render();
  } catch (e) { N.toast(N.errMsg(e), 'bad'); }
};

/* ================= Customers ================= */
B.pages.custs = async main => {
  B.cF = B.cF || { q: '', sort: 'last' };
  main.innerHTML = head('Customers', 'Members who registered at the till or on the QR menu.', `<button class="btn" data-act="bo-cust-csv">${ic('download')} Export CSV</button><button class="btn primary" data-act="bo-cust-add">${ic('plus')} Add member</button>`) +
    `<div class="toolbar"><input class="input" id="cu-q" placeholder="Search name or phone" value="${esc(B.cF.q)}"><select class="input" id="cu-sort">${[['last', 'Last visit'], ['spend', 'Lifetime spend'], ['visits', 'Visits'], ['points', 'Points'], ['joined', 'Newest']].map(([k, l]) => `<option value="${k}" ${B.cF.sort === k ? 'selected' : ''}>Sort: ${l}</option>`).join('')}</select></div><div id="cu-body"><div class="empty">Loading members…</div></div>`;
  try { B.custs = (await N.db.collection('custs').limit(1000).get()).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { return main.querySelector('#cu-body').innerHTML = `<div class="note">${esc(N.errMsg(e))}</div>`; }
  const draw = () => {
    const q = B.cF.q.toLowerCase(), key = { last: c => c.last || 0, spend: c => c.life?.spend || 0, visits: c => c.life?.visits || 0, points: c => c.points || 0, joined: c => c.joined || 0 }[B.cF.sort];
    const list = B.custs.filter(c => !q || (c.name + ' ' + c.id).toLowerCase().includes(q)).sort((a, b) => key(b) - key(a));
    const pts = B.custs.reduce((s, c) => s + (c.points || 0), 0);
    main.querySelector('#cu-body').innerHTML = `<div class="kpis" style="margin-bottom:14px"><div class="kpi"><span class="eyebrow">Members</span><b>${N.rpn(B.custs.length)}</b></div><div class="kpi"><span class="eyebrow">Active last 30 days</span><b>${N.rpn(B.custs.filter(c => (c.last || 0) > Date.now() - 30 * 864e5).length)}</b></div><div class="kpi"><span class="eyebrow">Points outstanding</span><b>${N.rpn(pts)}</b><span class="small muted">worth ${N.rp(pts * N.conf().loyalty.value)}</span></div><div class="kpi"><span class="eyebrow">WhatsApp opt-in</span><b>${N.rpn(B.custs.filter(c => c.optin).length)}</b></div></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>Name</th><th>Phone</th><th class="n">Points</th><th class="n">Visits</th><th class="n">Spend</th><th>Last visit</th><th>Rewards</th></tr></thead><tbody>
      ${list.slice(0, 300).map(c => `<tr class="click" data-act="bo-cust" data-id="${c.id}"><td><b>${esc(c.name)}</b></td><td class="mono">${N.phoneFmt(c.id)}</td><td class="n">${N.rpn(c.points)}</td><td class="n">${c.life?.visits || 0}</td><td class="n">${N.rpn(c.life?.spend)}</td><td class="mono small">${c.last ? N.dt(c.last) : '—'}</td><td>${(c.rewards || []).length ? `<span class="badge car">${c.rewards.length}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No members yet. Register customers from the till’s Member button.</td></tr>'}</tbody></table></div>${list.length > 300 ? '<p class="small muted">Showing the first 300. Search to narrow down.</p>' : ''}`;
  };
  main.querySelector('#cu-q').oninput = e => { B.cF.q = e.target.value; draw(); };
  main.querySelector('#cu-sort').onchange = e => { B.cF.sort = e.target.value; draw(); };
  draw();
};
Object.assign(N.acts, {
  'bo-cust': async el => {
    let c = await N.getCust(el.dataset.id); if (!c) return;
    const m = N.modal({ title: esc(c.name), cls: 'wide' });
    const draw = () => {
      m.body(P.custCard(c) + `<h3>History</h3>${(c.hist || []).length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>When</th><th>Order</th><th>Outlet</th><th class="n">Total</th><th class="n">Points</th><th>Note</th></tr></thead><tbody>${c.hist.map(h => `<tr><td class="mono small">${N.dt(h.t)}</td><td class="mono">${esc(h.no || '')}</td><td>${esc(N.outlets[h.o]?.name || '')}</td><td class="n">${h.tot ? N.rpn(h.tot) : ''}</td><td class="n">${(h.pe || 0) - (h.pr || 0) > 0 ? '+' : ''}${(h.pe || 0) - (h.pr || 0) || ''}</td><td class="small">${esc(h.note || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">No visits yet.</p>'}
        <p class="small muted">Joined ${c.joined ? N.dt(c.joined) : '—'}${c.bday ? ' · Birthday ' + N.dlabel(c.bday, { day: 'numeric', month: 'long' }) : ''} · ${c.optin ? 'Opted in to WhatsApp promos' : 'No WhatsApp opt-in'}</p>`);
      m.foot(`<button class="btn danger" data-del>Delete</button><span class="grow"></span><button class="btn" data-edit>${ic('edit')} Edit</button>${c.pin ? '<button class="btn" data-resetpin>Clear PIN</button>' : ''}<button class="btn" data-gift>${ic('gift')} Give reward</button><button class="btn primary" data-pts>${ic('star')} Adjust points</button>`);
    };
    draw();
    const write = async (mut, note) => {
      try {
        await N.wq('custs/' + c.id, async () => { const s = await N.custRef(c.id).get(); const d = N.clone(s.data()); mut(d); d.hist = [{ t: Date.now(), no: '', o: '', tot: 0, pe: 0, pr: 0, note: note + ' · ' + B.staff.name }, ...(d.hist || [])].slice(0, 40); await N.custRef(c.id).set(d); });
        c = await N.getCust(c.id); draw(); N.toast('Saved');
      } catch (e) { N.toast(N.errMsg(e), 'bad'); }
    };
    m.el.addEventListener('click', async e => {
      if (e.target.closest('[data-pts]')) { const v = await N.form('Adjust points', [{ id: 'n', label: 'Points to add (negative to remove)', type: 'number', req: true, auto: true }, { id: 'why', label: 'Reason', req: true }], { cls: 'narrow' }); if (v) write(d => { d.points = (d.points || 0) + v.n; }, `${v.n > 0 ? '+' : ''}${v.n} points: ${v.why}`); }
      if (e.target.closest('[data-gift]')) { const v = await N.form('Give a reward', rewardFields({ k: 'free' }, true), { cls: '' }); if (v) write(d => { d.rewards = [...(d.rewards || []), { id: N.uid(8), k: v.rk, v: v.rv || 0, max: v.rmax || 0, cats: v.rcats, l: v.rl || '', src: 'Manual', at: Date.now(), exp: v.exp ? Date.now() + v.exp * 864e5 : null }]; }, 'Reward given: ' + (v.rl || v.rk)); }
      if (e.target.closest('[data-edit]')) { const v = await N.form('Edit member', [{ id: 'name', label: 'Name', value: c.name, req: true }, { id: 'bday', label: 'Birthday', type: 'date', value: c.bday ? N.toInput(c.bday) : '' }, { id: 'optin', label: 'Opted in to WhatsApp promos', type: 'check', value: c.optin }], { cls: 'narrow' }); if (v) write(d => { d.name = v.name; d.bday = v.bday || null; d.optin = v.optin; }, 'Profile edited'); }
      if (e.target.closest('[data-resetpin]')) { if (await N.confirm('Clear member PIN?', 'The member is signed out of Naseyan Rewards until staff set a new PIN at the till.', { ok: 'Clear PIN', danger: true })) write(d => { d.pin = null; }, 'PIN cleared'); }
      if (e.target.closest('[data-del]')) { if (await del('custs/' + c.id, c.name)) { m.close(); B.render(); } }
    });
  },
  'bo-cust-add': async () => {
    const v = await N.form('Add member', [{ id: 'phone', label: 'Phone', req: true, auto: true, ph: '0812…' }, { id: 'name', label: 'Name', req: true }, { id: 'bday', label: 'Birthday', type: 'date' }, { id: 'optin', label: 'Opted in to WhatsApp promos', type: 'check', value: true }], { cls: 'narrow' });
    if (!v) return;
    const p = N.phone(v.phone); if (p.length < 9) return N.toast('Phone number looks too short', 'bad');
    if (await N.getCust(p)) return N.toast('A member with this phone already exists', 'bad');
    if (await save('custs/' + p, { name: v.name, phone: p, bday: v.bday || null, optin: v.optin, joined: Date.now(), points: 0, life: { spend: 0, visits: 0 }, stamps: {}, mis: {}, rewards: [], hist: [] }, 'Member added')) B.render();
  },
  'bo-cust-csv': () => {
    const rows = [['Name', 'Phone', 'Points', 'Visits', 'Lifetime spend', 'Last visit', 'Joined', 'Birthday', 'WhatsApp opt-in']];
    for (const c of B.custs || []) rows.push([c.name, '+' + c.id, c.points || 0, c.life?.visits || 0, c.life?.spend || 0, c.last ? new Date(c.last).toISOString().slice(0, 10) : '', c.joined ? new Date(c.joined).toISOString().slice(0, 10) : '', c.bday || '', c.optin ? 'yes' : 'no']);
    N.download('naseyan-members.csv', N.csv(rows));
  },
});

/* ================= Loyalty & promos ================= */
const rewardFields = (r = {}, withExp) => [
  { id: 'rk', label: 'Reward type', type: 'select', opts: [['free', 'Free item (cheapest-to-highest eligible item)'], ['amt', 'Rupiah off the bill'], ['pct', 'Percent off eligible items'], ...(withExp === 'mission' ? [['points', 'Bonus points']] : [])], value: r.k || 'free' },
  { id: 'rv', label: 'Value (Rp, % or points; ignored for free item)', type: 'number', value: r.v ?? '' },
  { id: 'rmax', label: 'Maximum value in Rp (0 = no cap)', type: 'number', value: r.max ?? '' },
  { id: 'rl', label: 'Reward name shown to staff and customer', value: r.l || '', ph: 'e.g. Free Kopi Susu' },
  { id: 'rcats', label: 'Reward applies to', type: 'checks', opts: catOpts(), value: r.cats || [], help: 'Leave all unticked for any item.' },
  ...(withExp === true ? [{ id: 'exp', label: 'Expires after (days, blank = never)', type: 'number', value: '' }] : []),
];
B.pages.loyalty = main => {
  const tab = B.tab.loyalty || 'points', L = N.conf().loyalty;
  const add = { stamps: ['bo-stamp', 'Add stamp card'], missions: ['bo-mission', 'Add mission'], promos: ['bo-promo', 'Add promo'] }[tab];
  main.innerHTML = head('Loyalty & promos', 'Points, stamp cards and missions run automatically when a member is attached to a paid order.', add ? `<button class="btn primary" data-act="${add[0]}" data-id="">${ic('plus')} ${add[1]}</button>` : '') +
    `<div class="seg">${[['points', 'Points'], ['stamps', 'Stamp cards'], ['missions', 'Missions'], ['promos', 'Promos & vouchers']].map(([k, l]) => `<button data-act="bo-tab" data-pg="loyalty" data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="ly-body"></div>`;
  const body = main.querySelector('#ly-body');
  if (tab === 'points') {
    body.innerHTML = `<div class="panel" style="max-width:640px"><div class="panel-h"><h2 class="grow">Points rules</h2>${L.on ? '<span class="badge ok">On</span>' : '<span class="badge">Off</span>'}</div>
      <p>Members earn <b>1 point per ${N.rp(L.earn)}</b> of net spend. Each point is worth <b>${N.rp(L.value)}</b> when redeemed, from <b>${L.min} points</b>.</p>
      <p class="small muted">That gives back ${(L.value / L.earn * 100).toFixed(1)}% of spend. Delivery orders earn points only when the cashier attaches a member.</p>
      <div><button class="btn" data-act="bo-points">${ic('edit')} Change rules</button></div></div>`;
  } else if (tab === 'stamps') {
    const cards = Object.values(N.stampcards);
    body.innerHTML = cards.length ? `<div class="split">${cards.map(s => `<div class="panel"><div class="panel-h"><h2 class="grow">${esc(s.name)}</h2>${s.active === false ? '<span class="badge">Paused</span>' : '<span class="badge ok">Running</span>'}</div>
      <div class="stamps">${Array.from({ length: s.need }, (_, i) => `<i>${i + 1}</i>`).join('')}</div>
      <p class="small">Collect ${s.need} stamps from ${(s.cats || []).map(c => esc(N.cats[c]?.name || '')).join(', ') || 'selected items'}${s.one ? ', one stamp per order' : ', one stamp per item'}. Reward: <b>${esc(N.rewardLabel(s.reward || {}))}</b>${s.expDays ? `, valid ${s.expDays} days` : ''}.</p>
      <div><button class="btn sm" data-act="bo-stamp" data-id="${s.id}">${ic('edit')} Edit</button></div></div>`).join('')}</div>` : '<div class="empty">No stamp cards yet. A common one: buy 9 coffees, get the 10th free.</div>';
  } else if (tab === 'missions') {
    const ms = Object.values(N.missions);
    const metric = { visits: 'visits', spend: 'Rupiah spent', qty: 'items bought', distinct: 'different items tried' };
    body.innerHTML = ms.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Mission</th><th>Goal</th><th>Resets</th><th>Reward</th><th>Dates</th><th>Status</th></tr></thead><tbody>${ms.map(m => `<tr class="click" data-act="bo-mission" data-id="${m.id}"><td><b>${esc(m.name)}</b>${m.desc ? `<div class="small muted">${esc(m.desc)}</div>` : ''}</td><td>${m.metric === 'spend' ? N.rp(m.target) : m.target} ${metric[m.metric]}${m.cats?.length ? ' in ' + m.cats.map(c => esc(N.cats[c]?.name || '')).join(', ') : ''}</td><td>${N.periodLabel(m.per).replace('this ', 'every ')}</td><td>${m.reward?.k === 'points' ? (m.reward.v + ' points') : esc(N.rewardLabel(m.reward || {}))}</td><td class="small mono">${m.start ? N.dlabel(m.start) : 'now'} → ${m.end ? N.dlabel(m.end) : 'open'}</td><td>${N.missionLive(m) ? '<span class="badge ok">Live</span>' : '<span class="badge">Off</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No missions yet. Example: visit 4 times this month, get 200 bonus points.</div>';
  } else {
    const ps = Object.values(N.promos);
    body.innerHTML = ps.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Promo</th><th>Discount</th><th>Conditions</th><th>Code</th><th>Status</th></tr></thead><tbody>${ps.map(p => { const why = N.promoCheck(p, { o: '', ch: '', lines: [{ c: (p.cats || [])[0], p: 1, q: 1 }] }, 1e12); return `<tr class="click" data-act="bo-promo" data-id="${p.id}"><td><b>${esc(p.name)}</b></td><td>${p.k === 'pct' ? p.v + '%' : N.rp(p.v)}${p.cats?.length ? ' on ' + p.cats.map(c => esc(N.cats[c]?.name || '')).join(', ') : ''}${p.max ? ' (max ' + N.rpn(p.max) + ')' : ''}</td><td class="small">${[p.min ? 'Min ' + N.rp(p.min) : '', p.days?.length ? DAYS.filter(d => p.days.includes(d[0])).map(d => d[1]).join(' ') : '', p.from && p.to ? p.from + '–' + p.to : '', p.chans?.length ? p.chans.map(N.chName).join(', ') : '', p.outlets?.length ? p.outlets.map(o => N.outlets[o]?.name).join(', ') : ''].filter(Boolean).join(' · ') || 'None'}</td><td class="mono">${esc(p.code || 'Listed on till')}</td><td>${p.active === false ? '<span class="badge">Off</span>' : why && !/outlet|valid for|Minimum/.test(why) ? `<span class="badge warn">${esc(why)}</span>` : '<span class="badge ok">On</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">No promos yet.</div>';
  }
};
Object.assign(N.acts, {
  'bo-points': async () => {
    const L = N.conf().loyalty;
    const v = await N.form('Points rules', [
      { id: 'on', label: 'Points programme is on', type: 'check', value: L.on },
      { id: 'earn', label: 'Spend needed for 1 point (Rp)', type: 'number', value: L.earn, req: true },
      { id: 'value', label: 'Value of 1 point when redeemed (Rp)', type: 'number', value: L.value, req: true },
      { id: 'min', label: 'Minimum points to redeem', type: 'number', value: L.min, req: true },
    ], { cls: 'narrow', validate: v => v.earn < 1000 ? 'Earn rate looks too low; use at least Rp 1.000 per point.' : '' });
    if (!v) return;
    await save('cfg/main', { ...N.cfg, loyalty: v });
  },
  'bo-stamp': async el => {
    const id = el.dataset.id, s = N.stampcards[id] || { need: 10, active: true, reward: { k: 'free' } };
    const v = await N.form(id ? 'Edit stamp card' : 'Add stamp card', [
      { id: 'name', label: 'Name', value: s.name, req: true, auto: true, ph: 'Coffee card' },
      { id: 'need', label: 'Stamps to fill the card', type: 'number', value: s.need, req: true },
      { id: 'cats', label: 'Earn stamps on', type: 'checks', opts: catOpts(), value: s.cats || [] },
      { id: 'one', label: 'Only one stamp per order', type: 'check', value: s.one },
      ...rewardFields(s.reward),
      { id: 'expDays', label: 'Reward valid for (days, blank = no expiry)', type: 'number', value: s.expDays ?? '' },
      { id: 'active', label: 'Running', type: 'check', value: s.active !== false },
      ...(id ? [{ id: '_del', label: 'Delete this stamp card (members lose collected stamps)', type: 'check' }] : []),
    ], { cls: 'wide', validate: v => !v.cats.length ? 'Pick at least one category that earns stamps' : v.need < 2 ? 'A card needs at least 2 stamps' : '' });
    if (!v) return;
    if (v._del) return del('stampcards/' + id, s.name);
    await save('stampcards/' + (id || 'st' + N.uid(6)), { name: v.name, need: v.need, cats: v.cats, one: v.one, expDays: v.expDays, active: v.active, reward: { k: v.rk, v: v.rv || 0, max: v.rmax || 0, l: v.rl, cats: v.rcats } });
  },
  'bo-mission': async el => {
    const id = el.dataset.id, m = N.missions[id] || { metric: 'visits', per: 'month', target: 4, active: true, reward: { k: 'points', v: 100 } };
    const v = await N.form(id ? 'Edit mission' : 'Add mission', [
      { id: 'name', label: 'Name', value: m.name, req: true, auto: true, ph: 'Regular of the month' },
      { id: 'desc', label: 'Description for staff', value: m.desc || '', ph: 'Visit 4 times in a month' },
      { id: 'metric', label: 'Goal type', type: 'select', opts: [['visits', 'Number of visits'], ['spend', 'Total spend (Rp)'], ['qty', 'Number of items bought'], ['distinct', 'Different items tried']], value: m.metric },
      { id: 'target', label: 'Target', type: 'number', value: m.target, req: true },
      { id: 'per', label: 'Progress resets', type: 'select', opts: [['month', 'Every month'], ['week', 'Every week'], ['all', 'Never (one-time)']], value: m.per },
      { id: 'cats', label: 'Only count items from', type: 'checks', opts: catOpts(), value: m.cats || [], help: 'For item goals. Leave empty for any item.' },
      ...rewardFields(m.reward, 'mission'),
      { id: 'expDays', label: 'Voucher valid for (days)', type: 'number', value: m.expDays ?? '' },
      { id: 'start', label: 'Starts', type: 'date', value: m.start ? N.toInput(m.start) : '' },
      { id: 'end', label: 'Ends', type: 'date', value: m.end ? N.toInput(m.end) : '' },
      { id: 'active', label: 'Live', type: 'check', value: m.active !== false },
      ...(id ? [{ id: '_del', label: 'Delete this mission', type: 'check' }] : []),
    ], { cls: 'wide' });
    if (!v) return;
    if (v._del) return del('missions/' + id, m.name);
    const ok = await save('missions/' + (id || 'ms' + N.uid(6)), { name: v.name, desc: v.desc, metric: v.metric, target: v.target, per: v.per, cats: v.cats, expDays: v.expDays, start: v.start || null, end: v.end || null, active: v.active, reward: { k: v.rk, v: v.rv || 0, max: v.rmax || 0, l: v.rl, cats: v.rcats } });
  },
  'bo-promo': async el => {
    const id = el.dataset.id, p = N.promos[id] || { k: 'pct', v: 10, active: true };
    const v = await N.form(id ? 'Edit promo' : 'Add promo', [
      { id: 'name', label: 'Name', value: p.name, req: true, auto: true, ph: 'Pagi Hemat 20%' },
      { id: 'k', label: 'Discount type', type: 'select', opts: [['pct', 'Percent'], ['amt', 'Rupiah amount']], value: p.k },
      { id: 'v', label: 'Discount value', type: 'number', value: p.v, req: true },
      { id: 'max', label: 'Maximum discount (Rp, 0 = no cap)', type: 'number', value: p.max ?? '' },
      { id: 'min', label: 'Minimum spend (Rp)', type: 'number', value: p.min ?? '' },
      { id: 'code', label: 'Voucher code (blank = shown in the till list)', value: p.code || '' },
      { id: 'cats', label: 'Only on', type: 'checks', opts: catOpts(), value: p.cats || [], help: 'Leave empty for the whole bill.' },
      { id: 'days', label: 'Days', type: 'checks', opts: DAYS, value: p.days || [], help: 'Leave empty for every day.' },
      { id: 'from', label: 'From time (HH:MM)', value: p.from || '', ph: '07:00' },
      { id: 'to', label: 'To time (HH:MM)', value: p.to || '', ph: '10:00' },
      { id: 'chans', label: 'Order types', type: 'checks', opts: chanOpts(), value: p.chans || [] },
      { id: 'outlets', label: 'Outlets', type: 'checks', opts: outletOpts(), value: p.outlets || [] },
      { id: 'start', label: 'Starts', type: 'date', value: p.start ? N.toInput(p.start) : '' },
      { id: 'end', label: 'Ends', type: 'date', value: p.end ? N.toInput(p.end) : '' },
      { id: 'active', label: 'On', type: 'check', value: p.active !== false },
      ...(id ? [{ id: '_del', label: 'Delete this promo', type: 'check' }] : []),
    ], { cls: 'wide', validate: v => (v.from && !/^\d\d:\d\d$/.test(v.from)) || (v.to && !/^\d\d:\d\d$/.test(v.to)) ? 'Times must look like 07:00' : v.k === 'pct' && v.v > 100 ? 'Percent cannot exceed 100' : '' });
    if (!v) return;
    if (v._del) return del('promos/' + id, p.name);
    delete v._del;
    await save('promos/' + (id || 'pr' + N.uid(6)), { ...v, days: v.days.map(Number), code: v.code.toUpperCase(), start: v.start || null, end: v.end || null });
  },
});

/* ================= Staff ================= */
B.pages.staff = main => {
  const list = Object.values(N.staff).sort((a, b) => (a.active === false) - (b.active === false) || a.name.localeCompare(b.name));
  main.innerHTML = head('Staff', 'Everyone signs in to the till with their own PIN. Roles decide what they can do.', `<button class="btn primary" data-act="bo-staff" data-id="">${ic('plus')} Add staff</button>`) +
    `<div class="tbl-wrap"><table class="t"><thead><tr><th>Name</th><th>Role</th><th>Outlets</th><th>PIN</th><th>Status</th></tr></thead><tbody>
    ${list.map(s => `<tr class="click" data-act="bo-staff" data-id="${s.id}"><td><b>${esc(s.name)}</b></td><td>${esc(N.ROLES[s.role]?.n || s.role)}</td><td class="small">${s.outlets?.length ? s.outlets.map(o => esc(N.outlets[o]?.name || '')).join(', ') : 'All outlets'}</td><td>${s.pin ? '<span class="badge ok">Set</span>' : '<span class="badge bad">Missing</span>'}</td><td>${s.active === false ? '<span class="badge">Inactive</span>' : '<span class="badge ok">Active</span>'}</td></tr>`).join('')}</tbody></table></div>
    <div class="panel"><h2>What each role can do</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>Role</th><th>Take orders</th><th>Payments & shifts</th><th>Bar/kitchen screen</th><th>Approve voids, refunds, big discounts</th><th>Back office</th></tr></thead><tbody>
    ${Object.entries(N.ROLES).map(([k, r]) => `<tr><td><b>${r.n}</b></td>${['sell', 'pay', 'station', 'approve', 'bo'].map(p => `<td>${(k === 'manager' || (p !== 'bo' && N.can({ role: k }, p))) ? ic('check') : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
};
N.acts['bo-staff'] = async el => {
  const id = el.dataset.id, s = N.staff[id] || { role: 'cashier', active: true, outlets: [] };
  const sid = id || 's' + N.uid(6);
  const v = await N.form(id ? 'Edit ' + esc(s.name) : 'Add staff', [
    { id: 'name', label: 'Name', value: s.name, req: true, auto: true },
    { id: 'role', label: 'Role', type: 'select', opts: Object.entries(N.ROLES).map(([k, r]) => [k, r.n]), value: s.role },
    { id: 'pin', label: id ? 'New PIN (blank = keep current)' : 'PIN (4–6 digits)', ph: '••••' },
    { id: 'outlets', label: 'Works at', type: 'checks', opts: outletOpts(), value: s.outlets || [], help: 'Leave empty for all outlets.' },
    { id: 'active', label: 'Active (untick when someone leaves)', type: 'check', value: s.active !== false },
  ], {
    validate: v => {
      if (v.pin && !/^\d{4,6}$/.test(v.pin)) return 'PIN must be 4 to 6 digits';
      if (!id && !v.pin) return 'Set a PIN for the new staff member';
      if (id === B.staff.id && v.role !== 'manager') return 'You cannot remove your own manager role';
      return '';
    },
  });
  if (!v) return;
  let pin = s.pin;
  if (v.pin) {
    for (const o of Object.values(N.staff)) if (o.id !== sid && o.pin && await N.hash(o.id, v.pin) === o.pin) return N.toast('Another staff member already uses this PIN. Choose a different one.', 'bad');
    pin = await N.hash(sid, v.pin);
  }
  await save('staff/' + sid, { name: v.name, role: v.role, outlets: v.outlets, active: v.active, pin });
};

/* ================= Attendance ================= */
B.pages.att = async main => {
  B.attM = B.attM || N.mkey();
  main.innerHTML = head('Attendance', 'Clock-ins from the till. Hours count only completed in/out pairs.', `<button class="btn" data-act="bo-att-csv">${ic('download')} Export CSV</button>`) +
    `<div class="toolbar"><input class="input" type="month" id="at-m" value="${B.attM.slice(0, 4)}-${B.attM.slice(4)}"></div><div id="at-body"><div class="empty">Loading…</div></div>`;
  main.querySelector('#at-m').onchange = e => { B.attM = e.target.value.replace('-', ''); B.render(); };
  const staff = Object.values(N.staff).sort((a, b) => a.name.localeCompare(b.name));
  const rows = [];
  try { for (const s of staff) { const d = await N.attRef(s.id, B.attM).get(); rows.push({ s, d: d.exists ? d.data().d || {} : {} }); } }
  catch (e) { return main.querySelector('#at-body').innerHTML = `<div class="note">${esc(N.errMsg(e))}</div>`; }
  B.attRows = rows;
  const hrs = d => Object.values(d).flat().reduce((t, p) => t + (p.out ? (p.out - p.in) / 36e5 : 0), 0);
  main.querySelector('#at-body').outerHTML = `<div class="tbl-wrap"><table class="t"><thead><tr><th>Staff</th><th>Role</th><th class="n">Days</th><th class="n">Hours</th><th>Last clock</th><th>Now</th></tr></thead><tbody>
    ${rows.map(({ s, d }) => { const days = Object.keys(d).sort(); const lastDay = d[days[days.length - 1]] || []; const last = lastDay[lastDay.length - 1]; return `<tr class="click" data-act="bo-att" data-id="${s.id}"><td><b>${esc(s.name)}</b></td><td>${esc(N.ROLES[s.role]?.n || '')}</td><td class="n">${days.length}</td><td class="n">${hrs(d).toFixed(1)}</td><td class="mono small">${last ? N.dt(last.out || last.in) : '—'}</td><td>${last && !last.out && days[days.length - 1] === N.dkey() ? '<span class="badge ok">Clocked in</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
};
Object.assign(N.acts, {
  'bo-att': el => {
    const r = B.attRows.find(x => x.s.id === el.dataset.id); if (!r) return;
    const days = Object.keys(r.d).sort().reverse();
    N.modal({ title: esc(r.s.name), body: days.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>Day</th><th>In</th><th>Out</th><th>Outlet</th><th class="n">Hours</th></tr></thead><tbody>${days.flatMap(k => r.d[k].map(p => `<tr><td>${N.dlabel(k)}</td><td class="mono">${N.hm(p.in)}</td><td class="mono">${p.out ? N.hm(p.out) : '<span class="badge warn">Missing</span>'}</td><td>${esc(N.outlets[p.o]?.name || '')}</td><td class="n">${p.out ? ((p.out - p.in) / 36e5).toFixed(1) : ''}</td></tr>`)).join('')}</tbody></table></div>` : '<div class="empty">No clock-ins this month.</div>' });
  },
  'bo-att-csv': () => {
    const rows = [['Staff', 'Date', 'In', 'Out', 'Outlet', 'Hours']];
    for (const { s, d } of B.attRows || []) for (const k of Object.keys(d).sort()) for (const p of d[k]) rows.push([s.name, k, N.hm(p.in), p.out ? N.hm(p.out) : '', N.outlets[p.o]?.name || '', p.out ? ((p.out - p.in) / 36e5).toFixed(2) : '']);
    N.download(`naseyan-attendance-${B.attM}.csv`, N.csv(rows));
  },
});

/* ================= Outlets ================= */
B.pages.outlets = main => {
  const list = Object.values(N.outlets).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  main.innerHTML = head('Outlets & QR', 'Tax, service charge, tables and approval rules per outlet.', `<button class="btn primary" data-act="bo-outlet" data-id="">${ic('plus')} Add outlet</button>`) +
    `<div class="tbl-wrap"><table class="t"><thead><tr><th>Code</th><th>Outlet</th><th>Tax</th><th>Service</th><th>Tables</th><th>Approvals</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map(o => `<tr><td class="mono">${esc(o.code || '')}</td><td><b>${esc(o.name)}</b><div class="small muted">${esc(o.addr || '')}</div></td><td>${esc(o.taxName || 'PB1')} ${o.tax || 0}%${o.taxIncl ? ' incl.' : ''}</td><td>${o.svc || 0}% dine-in</td><td>${(o.tables || []).length}</td><td class="small">${(o.appr?.on ?? true) ? `On · discounts over ${o.appr?.discPct ?? 10}%` : 'Off'}</td><td>${o.active === false ? '<span class="badge">Closed</span>' : '<span class="badge ok">Open</span>'}</td>
      <td><div class="row gap-s"><button class="btn sm" data-act="bo-outlet" data-id="${o.id}">${ic('edit')} Edit</button><button class="btn sm" data-act="bo-qr" data-id="${o.id}" ${(o.tables || []).length ? '' : 'disabled'}>${ic('qr')} Table QR</button></div></td></tr>`).join('') || '<tr><td colspan="8" class="muted">No outlets yet.</td></tr>'}</tbody></table></div>
    <div class="note acc small">Table QR codes open the ordering page only for people signed in to claude.ai with access to this app. Until the native app exists, place a tablet at the table or use them for staff testing.</div>`;
};
N.acts['bo-outlet'] = async el => {
  const id = el.dataset.id, o = N.outlets[id] || { tax: 10, taxName: 'PB1', svc: 0, tables: [], appr: { on: true, discPct: 10 }, float: 500000, active: true, idleMin: 10 };
  const v = await N.form(id ? 'Edit ' + esc(o.name) : 'Add outlet', [
    { id: 'name', label: 'Outlet name', value: o.name, req: true, auto: true },
    { id: 'code', label: 'Short code', value: o.code || '', ph: 'SNP' },
    { id: 'addr', label: 'Address (printed on receipts)', value: o.addr || '', full: true },
    { id: 'taxName', label: 'Tax name', value: o.taxName || 'PB1' },
    { id: 'tax', label: 'Tax rate %', type: 'number', value: o.tax },
    { id: 'taxIncl', label: 'Menu prices already include tax', type: 'check', value: o.taxIncl },
    { id: 'svc', label: 'Service charge % (dine-in only)', type: 'number', value: o.svc },
    { id: 'tables', label: 'Tables, separated by commas', value: (o.tables || []).join(', '), full: true, ph: 'T1, T2, T3, Bar 1' },
    { id: 'float', label: 'Default opening float (Rp)', type: 'number', value: o.float },
    { id: 'idleMin', label: 'Lock till after idle minutes', type: 'number', value: o.idleMin ?? 10 },
    { id: 'apprOn', label: 'Supervisor PIN for voids, refunds and big discounts', type: 'check', value: o.appr?.on ?? true },
    { id: 'discPct', label: 'Discounts above this % need approval', type: 'number', value: o.appr?.discPct ?? 10 },
    { id: 'active', label: 'Outlet is open', type: 'check', value: o.active !== false },
  ], { cls: 'wide' });
  if (!v) return;
  const tables = [...new Set(v.tables.split(',').map(s => s.trim()).filter(Boolean))];
  await save('outlets/' + (id || 'o' + N.uid(5)), { name: v.name, code: v.code.toUpperCase(), addr: v.addr, taxName: v.taxName || 'PB1', tax: v.tax || 0, taxIncl: v.taxIncl, svc: v.svc || 0, tables, float: v.float || 0, idleMin: v.idleMin || 10, appr: { on: v.apprOn, discPct: v.discPct ?? 10 }, active: v.active });
};
N.acts['bo-qr'] = el => {
  const o = N.outlets[el.dataset.id], base = N.conf().appUrl;
  const m = N.modal({ title: `Table QR · ${esc(o.name)}`, cls: 'wide' });
  if (!base) return m.body('<div class="note">Add the app link in Settings first. QR codes point to that link.</div>');
  m.body(`<p class="small muted">Screenshot or copy each code for printing. Each opens the menu for that table.</p><div class="qr-tiles">${o.tables.map((t, i) => `<div class="qr-tile"><div id="qr-${i}"></div><b>Table ${esc(t)}</b><span class="mono small" style="word-break:break-all">#qr.${esc(o.id)}.${i}</span></div>`).join('')}</div>`);
  o.tables.forEach((t, i) => { try { new QRCode(m.$('#qr-' + i), { text: `${base.split('#')[0]}#qr.${o.id}.${i}`, width: 140, height: 140, correctLevel: QRCode.CorrectLevel.M }); } catch { m.$('#qr-' + i).textContent = 'QR library not loaded'; } });
};

/* ================= Settings ================= */
B.pages.settings = main => {
  const c = N.conf();
  main.innerHTML = head('Settings', 'Brand, receipts, payment methods and delivery platforms.') + `<div class="split">
    <div class="panel"><h2>Brand & receipt</h2><div class="tbl-wrap"><table class="t"><tbody><tr><td>Brand name</td><td>${esc(c.brand)}</td></tr><tr><td>Receipt footer</td><td>${esc(c.footer)}</td></tr><tr><td>App link</td><td class="small mono" style="word-break:break-all">${esc(c.appUrl || 'Not set')}</td></tr><tr><td>Member page</td><td class="small mono" style="word-break:break-all">${c.appUrl ? esc(c.appUrl.split('#')[0] + '#member') : 'Set the app link first'}</td></tr></tbody></table></div><div class="row wrap"><button class="btn" data-act="bo-set-brand">${ic('edit')} Edit</button>${c.appUrl ? `<button class="btn" data-act="bo-member-qr">${ic('qr')} Member page QR</button>` : ''}</div></div>
    <div class="panel"><h2>Payment methods</h2><p class="small muted">Shown as buttons on the payment screen. Payments are recorded only; take them on the EDC, QRIS stand or app.</p><div class="chips">${c.pays.map(p => `<span class="chip">${esc(p.n)}</span>`).join('')}</div><div><button class="btn" data-act="bo-set-pays">${ic('edit')} Edit</button></div></div>
    <div class="panel"><h2>Delivery platforms</h2><div class="tbl-wrap"><table class="t"><thead><tr><th>Platform</th><th class="n">Price markup</th></tr></thead><tbody>${Object.entries(c.ch).map(([k, v]) => `<tr><td>${esc(v.n)}</td><td class="n">${v.mk}%</td></tr>`).join('')}</tbody></table></div><p class="small muted">Menu prices for delivery orders are raised by the markup and rounded up to the next Rp 500, to cover platform commission.</p><div><button class="btn" data-act="bo-set-ch">${ic('edit')} Edit</button></div></div>
    <div class="panel"><h2>This device</h2><p class="small">${(() => { const d = N.ls.get('dev'); return d?.o ? `${esc(N.outlets[d.o]?.name || '')} · till ${esc(d.code)} · ${esc(d.mode || 'not set')}` : 'Not set up as a till.'; })()}</p><div><button class="btn" data-act="bo-device">${ic('grid')} Change device setup</button></div></div>
  </div>`;
};
Object.assign(N.acts, {
  'bo-set-brand': async () => {
    const c = N.conf();
    const v = await N.form('Brand & receipt', [{ id: 'brand', label: 'Brand name', value: c.brand, req: true }, { id: 'footer', label: 'Receipt footer', value: c.footer, full: true }, { id: 'appUrl', label: 'App link (claude.ai/artifact/…) used in table QR codes', value: c.appUrl, full: true }]);
    if (v) await save('cfg/main', { ...N.cfg, ...v });
  },
  'bo-set-pays': async () => {
    const c = N.conf();
    const v = await N.form('Payment methods', [{ id: 'list', label: 'One per line as code = Name. Keep “cash” for drawer counts.', type: 'textarea', value: c.pays.map(p => `${p.id} = ${p.n}`).join('\n') }], { validate: v => /^cash\s*=/m.test(v.list) ? '' : 'Keep the cash line' });
    if (!v) return;
    const pays = v.list.split('\n').map(s => s.trim()).filter(Boolean).map(s => { const [id, ...n] = s.split('='); return { id: id.trim().toLowerCase().replace(/[^a-z0-9]/g, ''), n: n.join('=').trim() || id.trim() }; }).filter(p => p.id);
    await save('cfg/main', { ...N.cfg, pays });
  },
  'bo-set-ch': async () => {
    const c = N.conf();
    const v = await N.form('Delivery platforms', Object.entries(c.ch).flatMap(([k, x]) => [{ id: k + '_n', label: 'Name', value: x.n }, { id: k + '_mk', label: 'Markup %', type: 'number', value: x.mk }]));
    if (!v) return;
    const ch = {}; for (const k of Object.keys(c.ch)) ch[k] = { n: v[k + '_n'] || c.ch[k].n, mk: v[k + '_mk'] || 0 };
    await save('cfg/main', { ...N.cfg, ch });
  },
  'bo-member-qr': () => {
    const url = N.conf().appUrl.split('#')[0] + '#member';
    const m = N.modal({ title: 'Naseyan Rewards QR', cls: 'narrow', body: `<div class="qr-tile"><div id="mqr"></div><b>Scan to see your points</b><span class="mono small" style="word-break:break-all">${esc(url)}</span></div><p class="small muted">Put this on the counter or on receipts. Only people signed in to claude.ai with access to this app can open it during the pilot.</p>` });
    try { new QRCode(m.$('#mqr'), { text: url, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M }); } catch { }
  },
  'bo-device': () => { N.listeners.clear(); App.launcher(true); },
});
})();
