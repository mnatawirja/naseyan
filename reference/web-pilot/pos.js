'use strict';
/* Naseyan POS — tablet point of sale, bar/kitchen ticket screens and table QR ordering. */
const P = window.P = {
  dev: null, staff: null, shift: null, live: [], liveToday: [], cur: null, cat: 'all', q: '',
  stock: null, subs: [], day: null, idleTimer: null, seenNew: new Set(), audio: null,
};
const esc = N.esc, ic = N.ic;

/* ---------- shared bits ---------- */
P.outlet = () => N.outlets[P.dev?.o] || {};
P.appr = () => ({ on: true, discPct: 10, ...(P.outlet().appr || {}) });
P.beep = () => {
  try {
    P.audio = P.audio || new (window.AudioContext || window.webkitAudioContext)();
    const a = P.audio, t = a.currentTime;
    [0, .18].forEach((d, i) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = i ? 1046 : 784; g.gain.setValueAtTime(.0001, t + d); g.gain.exponentialRampToValueAtTime(.25, t + d + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d + .16); o.connect(g).connect(a.destination); o.start(t + d); o.stop(t + d + .18); });
  } catch { }
};
P.unsubAll = () => { P.subs.forEach(u => { try { u(); } catch { } }); P.subs = []; };
P.watchLive = onChange => {
  const o = P.dev.o, today = N.dkey(), yest = N.addDays(today, -1);
  P.day = today;
  let a = [], b = [];
  const push = () => { P.liveToday = a; P.live = [...b.filter(x => x.st === 'open' || x.st === 'new'), ...a]; onChange(); };
  P.subs.push(N.watchDay(o, today, l => { a = l; push(); }));
  P.subs.push(N.watchDay(o, yest, l => { b = l; push(); }));
};
P.dayTick = restart => setInterval(() => { if (P.day && N.dkey() !== P.day) restart(); }, 60000);

/* modifier picker, shared with QR ordering */
P.pickMods = (item, ch, o, { title } = {}) => new Promise(res => {
  const groups = (item.mods || []).map(id => N.mods[id]).filter(Boolean);
  let q = 1, out = null;
  const sel = {};
  groups.forEach(g => { sel[g.id] = (g.min > 0 && (g.max || 1) === 1 && g.opts?.length) ? [0] : []; });
  const m = N.modal({ title: title || esc(item.name), sticky: false, onClose: () => res(out) });
  const price = () => N.price(item, o, ch) + groups.reduce((s, g) => s + sel[g.id].reduce((t, i) => t + N.markup(g.opts[i].p || 0, ch), 0), 0);
  const render = () => {
    m.body(`${item.desc ? `<p class="muted">${esc(item.desc)}</p>` : ''}
      ${groups.map(g => `<div class="col gap-s"><div class="row"><h3>${esc(g.name)}</h3><span class="badge ${g.min ? 'car' : ''}">${g.min ? 'Required' : 'Optional'}${(g.max || 1) > 1 ? ` · up to ${g.max}` : ''}</span></div>
        <div class="pay-grid">${g.opts.map((op, i) => `<button type="button" data-g="${g.id}" data-i="${i}" class="${sel[g.id].includes(i) ? 'on' : ''}">${esc(op.n)}${op.p ? `<br><small class="num">+${N.rpn(N.markup(op.p, ch))}</small>` : ''}</button>`).join('')}</div></div>`).join('')}
      <label class="field"><span>Note for the bar or kitchen</span><input class="input" id="pm-note" placeholder="e.g. extra hot, no ice"></label>
      <div class="row"><span class="grow eyebrow">Quantity</span><button class="btn sm" type="button" data-q="-1">${ic('minus')}</button><b class="num" style="min-width:30px;text-align:center;font-size:1.2rem">${q}</b><button class="btn sm" type="button" data-q="1">${ic('plus')}</button></div>`);
    m.foot(`<span class="grow num" style="font-weight:700;font-size:1.1rem">${N.rp(price() * q)}</span><button class="btn primary lg" type="button" data-add>Add to order</button>`);
  };
  render();
  m.el.addEventListener('click', e => {
    const b = e.target.closest('[data-g]');
    if (b) {
      const g = N.mods[b.dataset.g], i = +b.dataset.i, max = g.max || 1, s = sel[g.id];
      const note = m.$('#pm-note')?.value || '';
      if (s.includes(i)) { if (!(max === 1 && g.min)) s.splice(s.indexOf(i), 1); }
      else if (max === 1) { s.length = 0; s.push(i); }
      else if (s.length < max) s.push(i);
      render(); m.$('#pm-note').value = note; return;
    }
    const qb = e.target.closest('[data-q]');
    if (qb) { const note = m.$('#pm-note').value; q = Math.max(1, q + +qb.dataset.q); render(); m.$('#pm-note').value = note; return; }
    if (e.target.closest('[data-add]')) {
      for (const g of groups) if ((g.min || 0) > sel[g.id].length) { N.toast(`Choose ${g.name}`, 'bad'); return; }
      const picked = groups.flatMap(g => sel[g.id].map(i => g.opts[i]));
      out = { q, m: picked.map(p => p.n).join(', '), mp: picked.reduce((s, p) => s + (p.p || 0), 0), note: m.$('#pm-note').value.trim() };
      m.close();
    }
  });
});
P.makeLine = (item, o, ch, { q = 1, m = '', mp = 0, note = '' } = {}) => ({
  k: N.uid(8), i: item.id, n: item.name, c: item.cat, st: N.cats[item.cat]?.station || 'bar',
  q, bp: item.prices?.[o] ?? item.price ?? 0, mp, p: N.markup(item.prices?.[o] ?? item.price ?? 0, ch) + N.markup(mp, ch), m, note, sent: null,
});
P.lineKey = l => [l.i, l.m, l.note].join('|');
P.addLine = (order, line) => {
  const same = order.lines.find(x => !x.sent && P.lineKey(x) === P.lineKey(line));
  if (same) same.q += line.q; else order.lines.push(line);
};
P.reprice = order => { for (const l of order.lines) if (!l.sent) l.p = N.markup(l.bp, order.ch) + N.markup(l.mp, order.ch); };
P.isReady = x => (x.lines || []).length > 0 && x.lines.every(l => l.sent && (x.dn || {})[l.k]);

/* receipt text */
P.receipt = (x, loyalty) => {
  const W = 32, out = N.outlets[x.o] || {}, c = N.conf();
  const L = (a, b = '') => { a = String(a); b = String(b); const sp = W - a.length - b.length; return sp >= 1 ? a + ' '.repeat(sp) + b : a + '\n' + ' '.repeat(Math.max(0, W - b.length)) + b; };
  const C = s => { s = String(s); const p = Math.max(0, Math.floor((W - s.length) / 2)); return ' '.repeat(p) + s; };
  const hr = '-'.repeat(W);
  const r = [C(c.brand.toUpperCase()), C(out.name || ''), ...(out.addr ? [C(out.addr)] : []), hr,
    L('No ' + (x.no || '-'), N.dt(x.pt || x.ct)), L(N.chName(x.ch) + (x.tbl ? ' · ' + x.tbl : ''), (N.staff[x.by]?.name || '').split(' ')[0]), ...(x.name ? [L('For: ' + x.name)] : []), hr];
  for (const l of x.lines || []) { r.push(L(`${l.q} x ${l.n}`, N.rpn(l.p * l.q))); if (l.m) r.push('   ' + l.m); if (l.note) r.push('   "' + l.note + '"'); }
  r.push(hr, L('Subtotal', N.rpn(x.sub)));
  for (const d of x.da || []) r.push(L(d.l, '-' + N.rpn(d.a)));
  if (x.svc) r.push(L(`Service ${out.svc || ''}%`, N.rpn(x.svc)));
  if (x.tax) r.push(L(`${out.taxName || 'PB1'} ${out.tax || ''}%${out.taxIncl ? ' (incl.)' : ''}`, N.rpn(x.tax)));
  r.push(L('TOTAL', N.rpn(x.tot)));
  for (const p of x.pays || []) r.push(L(N.payName(p.m), N.rpn(p.m === 'cash' && x.tend ? x.tend : p.a)));
  if (x.chg) r.push(L('Change', N.rpn(x.chg)));
  if (x.st === 'void') r.push(hr, C('*** VOID ***'));
  if (x.st === 'refund') r.push(hr, C('*** REFUNDED ***'));
  if (x.cust) { r.push(hr, L('Member', N.phoneFmt(x.cust))); if (x.pe) r.push(L('Points earned', '+' + x.pe)); if (x.pr) r.push(L('Points used', '-' + x.pr)); if (loyalty?.rewards?.length) r.push('Unlocked: ' + loyalty.rewards.join(', ')); }
  r.push(hr, C(c.footer || ''));
  return r.join('\n');
};

/* ============ POS ============ */
P.start = (root, dev) => {
  P.dev = dev; P.root = root; P.unsubAll();
  const o = dev.o;
  root.innerHTML = `<div class="pos"><header class="topbar" id="pos-top"></header><div class="pos-main"><section class="menu-pane" id="pos-menu"></section><aside class="docket" id="pos-docket"></aside></div></div>`;
  P.watchLive(() => { P.onLive(); });
  const shiftUnsub = N.shiftRef(o, N.mkey()).onSnapshot(s => {
    const all = Object.values(s.data()?.s || {});
    P.shift = all.find(x => x.dev === dev.code && !x.close) || null;
    P.renderTop();
  }, () => { });
  P.subs.push(shiftUnsub);
  clearInterval(P.tick); P.tick = P.dayTick(() => P.start(root, dev));
  N.listeners.clear(); N.listeners.add(() => { P.renderTop(); P.renderMenu(true); P.renderDocket(); });
  P.newOrder();
  P.renderAll();
  P.lock();
};
P.onLive = () => {
  const fresh = P.live.filter(x => x.st === 'new' && !P.seenNew.has(x.id));
  if (fresh.length && P.staff) { fresh.forEach(x => P.seenNew.add(x.id)); P.beep(); N.toast(`New QR order from ${fresh[0].tbl || 'a table'}`); }
  else fresh.forEach(x => P.seenNew.add(x.id));
  if (P.cur?.st && P.cur.st !== 'draft') {
    const upd = P.live.find(x => x.id === P.cur.id);
    if (upd && (upd.st === 'paid' || upd.st === 'void' || upd.st === 'refund')) { N.toast(`Order ${upd.no} was closed on another device`); P.newOrder(); }
  }
  P.renderTop(); P.renderDocket();
};
P.renderAll = () => { P.renderTop(); P.renderMenu(); P.renderDocket(); };

P.renderTop = () => {
  const el = document.getElementById('pos-top'); if (!el) return;
  const out = P.outlet(), s = P.staff;
  const qrNew = P.live.filter(x => x.st === 'new').length;
  const open = P.live.filter(x => x.st === 'open').length;
  el.innerHTML = `<div class="mark">${esc(N.conf().brand)}<i>.</i></div>
    <div class="who"><b>${esc(out.name || 'Outlet')}</b><span>Till ${esc(P.dev.code)} · ${P.shift ? 'Shift open ' + N.hm(P.shift.open) : 'No shift open'}</span></div>
    <div class="row right wrap gap-s">
      <button class="btn sm" data-act="pos-tables">${ic('table')} Tables${open ? ` <span class="badge">${open}</span>` : ''}</button>
      <button class="btn sm" data-act="pos-qr">${ic('qr')} QR orders${qrNew ? ` <span class="badge dot">${qrNew}</span>` : ''}</button>
      <button class="btn sm" data-act="pos-orders">${ic('receipt')} Orders</button>
      <button class="btn sm" data-act="pos-more">${ic('sliders')} More</button>
      ${s ? `<div class="who" style="padding:0 6px"><b>${esc(s.name)}</b><span>${esc(N.ROLES[s.role]?.n || '')}</span></div>` : ''}
      <button class="btn sm" data-act="pos-lock" aria-label="Lock till">${ic('lock')}</button>
    </div>`;
};

P.renderMenu = (keepSearch) => {
  const el = document.getElementById('pos-menu'); if (!el) return;
  if (!keepSearch || !el.querySelector('#pos-search')) {
    el.innerHTML = `<div class="row"><div class="grow" style="position:relative"><input class="input" id="pos-search" data-inp="pos-search" placeholder="Search menu" value="${esc(P.q)}" autocomplete="off" style="padding-left:36px"><span style="position:absolute;left:11px;top:12px;color:var(--muted)">${ic('search')}</span></div></div><div class="cats" id="pos-cats"></div><div class="items" id="pos-items"></div>`;
  }
  const cats = N.catsSorted();
  el.querySelector('#pos-cats').innerHTML = [`<button class="cat ${P.cat === 'all' ? 'on' : ''}" data-act="pos-cat" data-id="all">All</button>`, ...cats.map(c => `<button class="cat ${P.cat === c.id ? 'on' : ''}" data-act="pos-cat" data-id="${c.id}">${esc(c.name)}</button>`)].join('');
  const q = P.q.toLowerCase(), o = P.dev.o, ch = P.cur?.ch || 'counter';
  const items = N.itemsSorted().filter(i => (P.cat === 'all' || i.cat === P.cat) && (!q || i.name.toLowerCase().includes(q)));
  el.querySelector('#pos-items').innerHTML = items.length ? items.map(i => {
    const out = !N.avail(i, o), st = P.stock?.[i.id];
    const tag = out ? '<span class="badge bad tag">Sold out</span>' : st && st.qty != null ? `<span class="badge tag ${st.qty <= 0 ? 'bad' : st.qty <= st.low ? 'warn' : ''}">${st.qty} left</span>` : '';
    return `<button class="item ${out ? 'out' : ''}" style="--c:${esc(N.cats[i.cat]?.color || 'var(--accent)')}" data-act="pos-add" data-id="${i.id}">${tag}<b>${esc(i.name)}</b><span class="p">${N.rpn(N.price(i, o, ch))}${(i.mods || []).length ? ' · options' : ''}</span></button>`;
  }).join('') : `<div class="empty" style="grid-column:1/-1">${Object.keys(N.items).length ? 'No menu items match.' : 'The menu is empty. Add categories and items in Back office → Menu.'}</div>`;
};

P.renderDocket = () => {
  const el = document.getElementById('pos-docket'); if (!el || !P.cur) return;
  const x = P.cur, t = N.totals(x), out = P.outlet();
  const saved = x.st !== 'draft';
  const chans = ['counter', 'table', 'gofood', 'grab', 'shopee'];
  const lines = x.lines.length ? x.lines.map((l, idx) => `<div class="line ${l.sent ? 'sent' : ''}">
      <div class="q"><button data-act="pos-q" data-i="${idx}" data-d="-1" aria-label="Less">−</button><span>${l.q}</span><button data-act="pos-q" data-i="${idx}" data-d="1" aria-label="More">+</button></div>
      <div class="nm" data-act="pos-line" data-i="${idx}" style="cursor:pointer"><b>${esc(l.n)}</b>${l.m ? `<small>${esc(l.m)}</small>` : ''}${l.note ? `<small>“${esc(l.note)}”</small>` : ''}</div>
      <div class="amt">${N.rpn(l.p * l.q)}</div></div>`).join('')
    : `<div class="empty" style="margin:16px">Tap menu items to start an order.</div>`;
  const chips = [
    x.cust ? `<button class="chip" data-act="pos-cust">${ic('user')} ${esc(x.cname || N.phoneFmt(x.cust))}</button>` : '',
    ...t.parts.map(p => `<button class="chip car" data-act="${p.k === 'promo' || p.k === 'manual' ? 'pos-disc' : 'pos-cust'}">${ic(p.k === 'reward' ? 'gift' : p.k === 'points' ? 'star' : 'tag')} ${esc(p.l)}</button>`),
  ].join('');
  el.innerHTML = `<div class="docket-h">
      <div class="row"><div class="grow"><div class="eyebrow">${saved ? 'Order ' + esc(x.no) : 'New order'}</div><h2>${x.tbl ? 'Table ' + esc(x.tbl) : esc(N.chName(x.ch))}</h2></div>
        <button class="btn sm ghost" data-act="pos-new" title="Start a new order">${ic('plus')} New</button></div>
      <div class="seg" role="tablist">${chans.map(c => `<button class="${x.ch === c || (c === 'table' && x.ch === 'qr') ? 'on' : ''}" data-act="pos-ch" data-ch="${c}">${c === 'counter' ? 'Takeaway' : c === 'table' ? 'Dine-in' : N.chName(c)}</button>`).join('')}</div>
      <div class="row">
        ${x.ch === 'table' || x.ch === 'qr' ? `<button class="btn sm" data-act="pos-pick-table">${ic('table')} ${x.tbl ? 'Table ' + esc(x.tbl) : 'Choose table'}</button>` : ''}
        <input class="input grow" id="pos-name" data-inp="pos-name" value="${esc(x.name)}" placeholder="${N.isDelivery(x.ch) ? 'Driver / booking ID' : 'Customer name'}" style="min-height:36px">
        <button class="btn sm" data-act="pos-cust">${ic('user')} Member</button>
      </div>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
    </div>
    <div class="docket-lines">${lines}</div>
    <div class="docket-f">
      <div class="tot">
        <span>Subtotal</span><span class="num">${N.rpn(t.sub)}</span>
        ${t.parts.filter(p => p.a).map(p => `<span class="muted">${esc(p.l)}</span><span class="num">−${N.rpn(p.a)}</span>`).join('')}
        ${t.svc ? `<span class="muted">Service ${out.svc}%</span><span class="num">${N.rpn(t.svc)}</span>` : ''}
        ${t.tax ? `<span class="muted">${esc(out.taxName || 'PB1')} ${out.tax}%${out.taxIncl ? ' incl.' : ''}</span><span class="num">${N.rpn(t.tax)}</span>` : ''}
        <span class="grand">Total</span><span class="num grand">${N.rp(t.tot)}</span>
      </div>
      <div class="row">
        <button class="btn" data-act="pos-disc" ${x.lines.length ? '' : 'disabled'}>${ic('tag')} Discount</button>
        ${saved ? `<button class="btn danger" data-act="pos-void">Void</button>` : ''}
        <button class="btn grow" data-act="pos-send" ${x.lines.some(l => !l.sent) ? '' : 'disabled'}>${x.ch === 'counter' ? 'Hold & send' : 'Send to bar'}</button>
      </div>
      <button class="btn primary lg block" data-act="pos-pay" ${x.lines.length && N.can(P.staff, 'pay') ? '' : 'disabled'}>${N.can(P.staff, 'pay') || !P.staff ? 'Pay ' + N.rp(t.tot) : 'Payment needs a cashier'}</button>
    </div>`;
};

/* ---------- session ---------- */
P.lock = () => {
  P.staff = null; P.renderAll();
  N.closeAll();
  const out = P.outlet();
  const m = N.modal({
    title: `${esc(N.conf().brand)} · ${esc(out.name || '')}`, cls: 'narrow', sticky: true,
    body: `<p class="muted">Till ${esc(P.dev.code)} is locked. Sign in with your staff PIN.</p>
      <button class="btn primary lg block" data-signin>${ic('user')} Sign in</button>
      <button class="btn lg block" data-clock>${ic('clock')} Clock in / out</button>`,
    foot: `<button class="btn ghost sm" data-switch>${ic('grid')} Device setup</button>`,
  });
  m.$('[data-close]').hidden = true;
  m.$('[data-signin]').onclick = async () => {
    const s = await N.pin({ title: 'Sign in', sub: 'Enter your PIN', verify: pin => N.findByPin(pin, s => N.staffAt(s, P.dev.o)) });
    if (!s) return;
    m.close(); P.signedIn(s);
  };
  m.$('[data-clock]').onclick = async () => {
    const s = await N.pin({ title: 'Clock in / out', sub: 'Enter your PIN', verify: pin => N.findByPin(pin) });
    if (!s) return;
    try { const r = await N.clock(s, P.dev.o); N.toast(`${s.name} clocked ${r.action} at ${N.hm(Date.now())}`); }
    catch (e) { N.toast(N.errMsg(e), 'bad'); }
  };
  m.$('[data-switch]').onclick = async () => {
    const s = await N.pin({ title: 'Manager PIN', sub: 'Required to change this device', verify: pin => N.findByPin(pin, s => s.role === 'manager') });
    if (!s) return; m.close(); P.unsubAll(); clearInterval(P.tick); window.App.launcher(true);
  };
};
P.signedIn = async s => {
  P.staff = s; P.renderAll(); P.armIdle();
  P.refreshStock();
  if (N.can(s, 'shift') && !P.shift) {
    const v = await N.form('Open shift', [{ id: 'float', label: 'Opening cash in drawer (Rp)', type: 'number', value: P.outlet().float ?? 500000, req: true, auto: true }], { ok: 'Open shift', cls: 'narrow', note: `No shift is open on till ${esc(P.dev.code)}. Count the cash float before you start.` });
    if (v) {
      const sh = { id: N.uid(10), dev: P.dev.code, by: s.id, open: Date.now(), float: v.float, close: null, io: [] };
      try { await N.saveShift(P.dev.o, sh); P.shift = sh; P.renderTop(); N.toast('Shift opened'); } catch (e) { N.toast(N.errMsg(e), 'bad'); }
    }
  }
};
P.armIdle = () => {
  const reset = () => { clearTimeout(P.idleTimer); if (P.staff) P.idleTimer = setTimeout(() => { if (P.staff && !document.querySelector('.scrim')) P.lock(); }, (P.outlet().idleMin || 10) * 60000); };
  if (!P.idleArmed) { ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, reset, { passive: true })); P.idleArmed = true; }
  reset();
};
P.guard = perm => {
  if (!P.staff) { P.lock(); return false; }
  if (perm && !N.can(P.staff, perm)) { N.toast(`${N.ROLES[P.staff.role]?.n || 'This role'} can't do that.`, 'bad'); return false; }
  return true;
};
P.approve = async what => {
  if (!P.appr().on || N.can(P.staff, 'approve')) return P.staff;
  return N.pin({ title: 'Supervisor approval', sub: esc(what), verify: pin => N.findByPin(pin, s => N.can(s, 'approve') && N.staffAt(s, P.dev.o)) });
};
P.refreshStock = async () => {
  if (!Object.values(N.items).some(i => i.track)) { P.stock = null; return; }
  try { const r = await N.stock(P.dev.o, P.liveToday); P.stock = r.res; P.renderMenu(true); } catch { }
};

/* ---------- order editing ---------- */
P.newOrder = () => { P.cur = N.blankOrder(P.dev.o, P.dev.code, 'counter'); P.renderDocket(); P.renderMenu(true); };
P.nextNo = () => {
  const k = `seq.${P.dev.o}.${P.dev.code}.${N.dkey()}`;
  const mine = P.liveToday.filter(x => x.dev === P.dev.code && x.no?.startsWith(P.dev.code + '-')).map(x => +x.no.split('-')[1] || 0);
  const n = Math.max(N.ls.get(k, 0), ...mine, 0) + 1;
  N.ls.set(k, n);
  return P.dev.code + '-' + N.pad(n, 3);
};
P.persist = async (x, patch) => {
  if (!x.loc) x.loc = { o: x.o, d: N.dkey(x.ct), dev: x.dev === 'qr' ? 'qr' : x.dev };
  if (!x.no) x.no = P.nextNo();
  N.finalize(x);
  await N.saveOrder(x);
};
P.load = id => {
  const x = P.live.find(o => o.id === id); if (!x) return;
  P.cur = N.clone(x); P.cur.vl = P.cur.vl || []; P.renderDocket(); P.renderMenu(true);
};

Object.assign(N.acts, {
  'pos-search': el => { P.q = el.value; P.renderMenu(true); },
  'pos-cat': el => { P.cat = el.dataset.id; P.renderMenu(true); },
  'pos-name': el => { if (P.cur) P.cur.name = el.value; },
  'pos-lock': () => P.lock(),
  'pos-new': async () => {
    if (P.cur.st === 'draft' && P.cur.lines.length && !(await N.confirm('Discard this order?', 'The items have not been sent or paid.', { ok: 'Discard', danger: true }))) return;
    P.newOrder();
  },
  'pos-add': async el => {
    if (!P.guard('sell')) return;
    const item = N.items[el.dataset.id], x = P.cur;
    if (!N.avail(item, P.dev.o)) return N.toast(`${item.name} is sold out at this outlet.`, 'bad');
    const st = P.stock?.[item.id];
    if (st?.qty != null && st.qty <= 0) N.toast(`Stock shows 0 ${item.name} left. Check the shelf.`, 'bad');
    let opt = {};
    if ((item.mods || []).length) { opt = await P.pickMods(item, x.ch, x.o); if (!opt) return; }
    P.addLine(x, P.makeLine(item, x.o, x.ch, opt)); P.renderDocket();
  },
  'pos-q': async el => {
    const x = P.cur, l = x.lines[+el.dataset.i], d = +el.dataset.d;
    if (!l) return;
    if (d > 0) { if (l.sent) P.addLine(x, { ...N.clone(l), k: N.uid(8), q: 1, sent: null }); else l.q++; return P.renderDocket(); }
    if (l.sent) {
      const ok = await P.approve(`Remove 1 × ${l.n} that was already sent`);
      if (!ok) return;
      x.vl.push({ n: l.n, q: 1, p: l.p, by: P.staff.id, ok: ok.id, at: Date.now() });
    }
    l.q--; if (l.q <= 0) x.lines.splice(+el.dataset.i, 1);
    if (l.sent && x.st !== 'draft') { try { await P.persist(x); } catch (e) { N.toast(N.errMsg(e), 'bad'); } }
    P.renderDocket();
  },
  'pos-line': async el => {
    const x = P.cur, i = +el.dataset.i, l = x.lines[i];
    if (l.sent) return N.toast('This item was already sent. Use − to remove it.');
    const v = await N.form(esc(l.n), [{ id: 'q', label: 'Quantity', type: 'number', value: l.q, req: true }, { id: 'note', label: 'Note for the bar or kitchen', value: l.note }], { ok: 'Update', cls: 'narrow' });
    if (!v) return;
    if (v.q <= 0) x.lines.splice(i, 1); else { l.q = Math.round(v.q); l.note = v.note; }
    P.renderDocket();
  },
  'pos-ch': async el => {
    const x = P.cur, ch = el.dataset.ch;
    if (x.lines.some(l => l.sent) && N.isDelivery(ch) !== N.isDelivery(x.ch)) return N.toast('Items were already sent. Start a new order for delivery.', 'bad');
    x.ch = ch === 'table' && x.ch === 'qr' ? 'qr' : ch;
    if (ch !== 'table') x.tbl = null;
    P.reprice(x);
    if (x.promo && N.promoCheck(N.promos[x.promo.id], x, N.totals(x).sub)) { x.promo = null; N.toast('Promo removed: not valid for this order type.'); }
    P.renderDocket(); P.renderMenu(true);
    if (ch === 'table' && !x.tbl) N.acts['pos-pick-table']();
  },
  'pos-pick-table': async () => {
    const tbls = P.outlet().tables || [];
    if (!tbls.length) return N.toast('No tables set up. Add them in Back office → Outlets.', 'bad');
    const busy = new Set(P.live.filter(o => (o.st === 'open' || o.st === 'new') && o.tbl && o.id !== P.cur.id).map(o => o.tbl));
    const m = N.modal({ title: 'Choose table', body: `<div class="tables">${tbls.map(t => `<button class="tbl ${busy.has(t) ? 'busy' : ''}" data-t="${esc(t)}"><b>${esc(t)}</b><span class="small muted">${busy.has(t) ? 'Has an open bill' : 'Free'}</span></button>`).join('')}</div>` });
    m.el.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; P.cur.tbl = b.dataset.t; if (P.cur.ch !== 'qr') P.cur.ch = 'table'; P.reprice(P.cur); m.close(); P.renderDocket(); });
  },
  'pos-send': async () => {
    if (!P.guard('sell')) return;
    const x = P.cur;
    if ((x.ch === 'table') && !x.tbl) return N.acts['pos-pick-table']();
    const now = Date.now();
    const wasDraft = x.st === 'draft';
    x.lines.forEach(l => { if (!l.sent) l.sent = now; });
    if (wasDraft) { x.st = 'open'; x.by = P.staff.id; x.shift = P.shift?.id || null; x.ct = now; }
    try { await P.persist(x); N.toast(`Order ${x.no} sent`); P.newOrder(); }
    catch (e) { if (wasDraft) x.st = 'draft'; x.lines.forEach(l => { if (l.sent === now) l.sent = null; }); N.toast(N.errMsg(e), 'bad'); P.renderDocket(); }
  },
  'pos-void': async () => {
    const x = P.cur;
    const why = await N.form(`Void order ${esc(x.no)}`, [{ id: 'why', label: 'Reason', type: 'select', opts: [['Customer cancelled', 'Customer cancelled'], ['Wrong order', 'Wrong order'], ['Duplicate', 'Duplicate'], ['Test order', 'Test order'], ['Other', 'Other']], value: 'Customer cancelled' }, { id: 'note', label: 'Note (optional)' }], { ok: 'Void order', cls: 'narrow' });
    if (!why) return;
    const ok = x.lines.some(l => l.sent) ? await P.approve(`Void order ${x.no}`) : P.staff;
    if (!ok) return;
    x.st = 'void'; x.void = { why: why.why + (why.note ? ': ' + why.note : ''), by: P.staff.id, ok: ok.id, at: Date.now() };
    try { await P.persist(x); N.toast(`Order ${x.no} voided`); P.newOrder(); } catch (e) { N.toast(N.errMsg(e), 'bad'); }
  },
  'pos-disc': () => P.discount(),
  'pos-cust': () => P.customer(),
  'pos-pay': () => P.pay(),
  'pos-tables': () => P.tables(),
  'pos-qr': () => P.qrQueue(),
  'pos-orders': () => P.orders(),
  'pos-more': () => P.more(),
});

/* ---------- discounts & promos ---------- */
P.discount = () => {
  if (!P.guard('sell')) return;
  const x = P.cur, sub = N.totals(x).sub;
  const promos = Object.values(N.promos).filter(p => p.active !== false && !p.code);
  const m = N.modal({ title: 'Discount' });
  const render = () => {
    m.body(`<div class="col gap-s"><h3>Promos</h3>
      ${promos.length ? `<div class="list">${promos.map(p => { const why = N.promoCheck(p, x, sub); const on = x.promo?.id === p.id; return `<button class="li" data-promo="${p.id}" ${why && !on ? 'disabled style="opacity:.55;cursor:default"' : ''}><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${why || (p.k === 'pct' ? p.v + '% off' : N.rp(p.v) + ' off') + (p.min ? ' · min ' + N.rp(p.min) : '')}</div></div>${on ? '<span class="badge acc">Applied</span>' : why ? '' : `<span class="num">−${N.rpn(N.promoAmt(p, x.lines))}</span>`}</button>`; }).join('')}</div>` : '<p class="muted">No promos are running.</p>'}
      </div>
      <div class="col gap-s"><h3>Voucher code</h3><div class="row"><input class="input grow" id="d-code" placeholder="e.g. NASEYAN10" style="text-transform:uppercase"><button class="btn" data-code>Apply</button></div></div>
      <div class="col gap-s"><h3>Manual discount</h3><div class="row wrap"><div class="seg" id="d-kind"><button class="${x.md?.k !== 'amt' ? 'on' : ''}" data-k="pct">%</button><button class="${x.md?.k === 'amt' ? 'on' : ''}" data-k="amt">Rp</button></div><input class="input num" id="d-val" type="number" inputmode="numeric" style="width:130px" value="${x.md?.v ?? ''}"><input class="input grow" id="d-label" placeholder="Reason, e.g. Staff meal" value="${esc(x.md?.l || '')}"></div>
      <p class="small muted">Above ${P.appr().discPct}% of the bill needs supervisor approval.</p></div>`);
    m.foot(`${x.promo || x.md ? '<button class="btn danger" data-clear>Remove discounts</button>' : ''}<span class="grow"></span><button class="btn primary" data-man>Apply manual discount</button>`);
  };
  render();
  m.el.addEventListener('click', async e => {
    const pb = e.target.closest('[data-promo]');
    if (pb && !pb.disabled) { const p = N.promos[pb.dataset.promo]; x.promo = x.promo?.id === p.id ? null : { id: p.id, l: p.name, a: 0 }; P.renderDocket(); return render(); }
    const kb = e.target.closest('#d-kind [data-k]');
    if (kb) { m.el.querySelectorAll('#d-kind button').forEach(b => b.classList.toggle('on', b === kb)); return; }
    if (e.target.closest('[data-code]')) {
      const code = m.$('#d-code').value.trim().toUpperCase();
      const p = Object.values(N.promos).find(p => p.code && p.code.toUpperCase() === code);
      if (!p) return N.toast('Code not found', 'bad');
      const why = N.promoCheck(p, x, sub); if (why) return N.toast(why, 'bad');
      x.promo = { id: p.id, l: p.name, a: 0 }; P.renderDocket(); return render();
    }
    if (e.target.closest('[data-clear]')) { x.promo = null; x.md = null; P.renderDocket(); return render(); }
    if (e.target.closest('[data-man]')) {
      const k = m.$('#d-kind .on').dataset.k, v = Number(m.$('#d-val').value), l = m.$('#d-label').value.trim();
      if (!v || v < 0) return N.toast('Enter a discount amount', 'bad');
      if (k === 'pct' && v > 100) return N.toast('Percent cannot exceed 100', 'bad');
      if (!l) return N.toast('Add a reason for the discount', 'bad');
      const pct = k === 'pct' ? v : v / Math.max(1, sub) * 100;
      let ok = P.staff;
      if (pct > P.appr().discPct) { ok = await P.approve(`${k === 'pct' ? v + '%' : N.rp(v)} discount: ${l}`); if (!ok) return; }
      x.md = { k, v, l: `${l} (${k === 'pct' ? v + '%' : N.rpn(v)})`, by: P.staff.id, ok: ok.id };
      P.renderDocket(); m.close();
    }
  });
};

/* ---------- customer & loyalty ---------- */
P.custCard = (c, x) => {
  const L = N.conf().loyalty;
  const cards = Object.values(N.stampcards).filter(s => s.active !== false);
  const mis = Object.values(N.missions).filter(N.missionLive);
  const rewards = (c.rewards || []).filter(r => !r.exp || r.exp > Date.now());
  return `<div class="cust-card">
    <div class="row"><div class="grow"><h2>${esc(c.name || 'Member')}</h2><p class="small muted mono">${N.phoneFmt(c.id)}${c.code ? ' · code ' + esc(c.code) : ''}${c.pin ? '' : ' · <span style="color:var(--warn)">no PIN</span>'}</p></div>
      <div style="text-align:right"><div class="num" style="font-size:1.6rem;font-weight:700">${N.rpn(c.points || 0)}</div><div class="small muted">points · worth ${N.rp((c.points || 0) * L.value)}</div></div></div>
    <p class="small muted">${c.life?.visits || 0} visits · ${N.rp(c.life?.spend || 0)} lifetime spend${c.last ? ' · last visit ' + N.dt(c.last) : ''}</p>
    ${cards.map(sc => { const n = c.stamps?.[sc.id] || 0; return `<div class="col gap-s"><div class="row"><b class="grow small">${esc(sc.name)}</b><span class="small muted">${n}/${sc.need}</span></div><div class="stamps">${Array.from({ length: sc.need }, (_, i) => `<i class="${i < n ? 'on' : ''}">${i < n ? '✓' : i + 1}</i>`).join('')}</div></div>`; }).join('')}
    ${mis.length ? `<div class="col gap-s"><b class="small">Missions ${'' }</b>${mis.map(m => { const st = c.mis?.[m.id + '_' + N.period(m.per)] || { p: 0 }; const pct = Math.min(100, Math.round(st.p / (m.target || 1) * 100)); return `<div class="col" style="gap:4px"><div class="row small"><span class="grow">${esc(m.name)} <span class="muted">· ${N.periodLabel(m.per)}</span></span><span class="muted num">${st.done ? 'Done' : (m.metric === 'spend' ? N.rpn(st.p) + ' / ' + N.rpn(m.target) : st.p + ' / ' + m.target)}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`; }).join('')}</div>` : ''}
    ${rewards.length ? `<div class="col gap-s"><b class="small">Rewards ready</b>${rewards.map(r => `<div class="row"><span class="grow">${ic('gift')} ${esc(N.rewardLabel(r))}${r.exp ? ` <span class="small muted">until ${N.dt(r.exp)}</span>` : ''}</span>${x ? (x.rw?.id === r.id ? `<button class="btn sm" data-unuse>Remove</button>` : `<button class="btn sm" data-use="${r.id}">Use</button>`) : ''}</div>`).join('')}</div>` : ''}
  </div>`;
};
P.customer = () => {
  if (!P.guard('sell')) return;
  const x = P.cur, L = N.conf().loyalty;
  const m = N.modal({ title: 'Member', cls: '' });
  let c = null;
  const search = async input => {
    const raw = String(input || '').trim().replace(/^NSY:/i, '');
    const isCode = /^[A-Za-z0-9]{6,8}$/.test(raw) && /[A-Za-z]/.test(raw);
    const p = N.phone(raw);
    if (!isCode && p.length < 9) return N.toast('Enter a phone number or member code', 'bad');
    m.body('<p class="muted">Looking up member…</p>');
    try {
      if (isCode) { const q = await N.db.collection('custs').where('code', '==', raw.toUpperCase()).limit(1).get(); c = q.empty ? null : { id: q.docs[0].id, ...q.docs[0].data() }; if (!c) { N.toast('No member with that code', 'bad'); return ask(); } }
      else c = await N.getCust(p);
    } catch (e) { N.toast(N.errMsg(e), 'bad'); }
    if (c) { x.cust = c.id; x.cname = c.name || ''; if (!x.name) x.name = c.name || ''; P.renderDocket(); show(); }
    else register(p);
  };
  const ask = () => {
    m.body(`<label class="field"><span>Phone number or member code</span><input class="input num" id="c-phone" inputmode="text" autocapitalize="characters" placeholder="0812 3456 7890 or K7QX2M" autofocus></label><p class="small muted">Members find their code on the Naseyan Rewards page.</p>`);
    m.foot(`<button class="btn primary" data-find>${ic('search')} Find member</button>`);
    setTimeout(() => m.$('#c-phone')?.focus(), 30);
    m.$('#c-phone').onkeydown = e => { if (e.key === 'Enter') search(e.target.value); };
  };
  const register = p => {
    m.body(`<div class="note acc">No member with ${N.phoneFmt(p)} yet. Register them now to earn points on this order.</div>
      <div class="grid2"><label class="field"><span>Name</span><input class="input" id="c-name" autofocus></label><label class="field"><span>Birthday (optional)</span><input class="input" id="c-bday" type="date"></label></div>
      <label class="field"><span>Member PIN, 6 digits (optional, customer types it)</span><input class="input num" id="c-pin" type="password" inputmode="numeric" maxlength="6" placeholder="Lets them sign in to Naseyan Rewards"></label>
      <label class="check"><input type="checkbox" id="c-ok" checked> Customer agrees to receive Naseyan promos by WhatsApp</label>`);
    m.foot(`<button class="btn" data-back>Back</button><button class="btn primary" data-reg="${p}">Register & attach</button>`);
  };
  const show = () => {
    const sub = N.totals(x).sub;
    m.body(P.custCard(c, x) + (L.on ? `<div class="col gap-s"><h3>Redeem points</h3><p class="small muted">${L.value} rupiah per point, minimum ${L.min} points.</p><div class="row"><input class="input num grow" id="c-pts" type="number" inputmode="numeric" value="${x.pr || ''}" placeholder="Points to use"><button class="btn" data-max>Max</button><button class="btn primary" data-redeem>Apply</button></div></div>` : ''));
    m.foot(`<button class="btn danger" data-detach>Remove member</button><button class="btn" data-setpin>${ic('lock')} ${c.pin ? 'Reset' : 'Set'} member PIN</button><span class="grow"></span><button class="btn primary" data-close>Done</button>`);
    m.el.querySelector('[data-max]')?.addEventListener('click', () => { m.$('#c-pts').value = Math.min(c.points || 0, Math.floor(sub / L.value)); });
  };
  if (x.cust) { m.body('<p class="muted">Loading member…</p>'); N.getCust(x.cust).then(v => { c = v; if (c) show(); else ask(); }).catch(() => ask()); } else ask();
  m.el.addEventListener('click', async e => {
    if (e.target.closest('[data-find]')) return search(m.$('#c-phone').value);
    if (e.target.closest('[data-back]')) return ask();
    const rb = e.target.closest('[data-reg]');
    if (rb) {
      const name = m.$('#c-name').value.trim(); if (!name) return N.toast('Enter the customer name', 'bad');
      const pin = m.$('#c-pin').value.trim();
      if (pin && !/^\d{6}$/.test(pin)) return N.toast('Member PIN must be 6 digits', 'bad');
      const doc = { name, phone: rb.dataset.reg, bday: N.fromInput(m.$('#c-bday').value) || null, optin: m.$('#c-ok').checked, joined: Date.now(), joinedAt: P.dev.o, points: 0, life: { spend: 0, visits: 0 }, stamps: {}, mis: {}, rewards: [], hist: [], pin: pin ? await N.memberHash(rb.dataset.reg, pin) : null, code: await N.newMemberCode() };
      try { await N.custRef(rb.dataset.reg).set(doc); c = { id: rb.dataset.reg, ...doc }; x.cust = c.id; x.cname = name; if (!x.name) x.name = name; P.renderDocket(); show(); N.toast('Member registered'); }
      catch (err) { N.toast(N.errMsg(err), 'bad'); }
      return;
    }
    const ub = e.target.closest('[data-use]');
    if (ub) { const r = c.rewards.find(r => r.id === ub.dataset.use); x.rw = { id: r.id, l: N.rewardLabel(r), k: r.k, v: r.v, cats: r.cats || [], max: r.max || 0 }; P.renderDocket(); return show(); }
    if (e.target.closest('[data-unuse]')) { x.rw = null; P.renderDocket(); return show(); }
    if (e.target.closest('[data-redeem]')) {
      const v = Math.floor(Number(m.$('#c-pts').value) || 0);
      if (!v) { x.pr = 0; P.renderDocket(); return show(); }
      if (v < L.min) return N.toast(`Minimum ${L.min} points`, 'bad');
      if (v > (c.points || 0)) return N.toast('Not enough points', 'bad');
      if (v * L.value > N.totals({ ...x, pr: 0 }).sub) return N.toast('Points exceed the bill', 'bad');
      x.pr = v; P.renderDocket(); N.toast(`${v} points applied`); return show();
    }
    if (e.target.closest('[data-setpin]')) {
      const v = await N.form(`${c.pin ? 'Reset' : 'Set'} PIN for ${esc(c.name)}`, [{ id: 'a', label: 'New 6-digit PIN (customer types it)', type: 'text', req: true, auto: true }, { id: 'b', label: 'Repeat PIN', type: 'text', req: true }], { cls: 'narrow', ok: 'Save PIN', note: 'Hand the tablet to the customer. They use this PIN with their phone number on the Naseyan Rewards page.', validate: v => !/^\d{6}$/.test(v.a) ? 'The PIN must be 6 digits' : v.a !== v.b ? 'The PINs do not match' : '' });
      if (!v) return;
      try { const h = await N.memberHash(c.id, v.a); await N.custRef(c.id).update({ pin: h, ...(c.code ? {} : { code: await N.newMemberCode() }) }); c = await N.getCust(c.id); show(); N.toast('Member PIN saved'); } catch (err) { N.toast(N.errMsg(err), 'bad'); }
      return;
    }
    if (e.target.closest('[data-detach]')) { x.cust = null; x.cname = ''; x.rw = null; x.pr = 0; P.renderDocket(); m.close(); }
  });
};

/* ---------- payment ---------- */
P.pay = async () => {
  if (!P.guard('pay')) return;
  const x = P.cur;
  if (!x.lines.length) return;
  if (x.ch === 'table' && !x.tbl) return N.acts['pos-pick-table']();
  if (!P.shift) return N.toast('Open a shift first: More → Open shift.', 'bad');
  if (x.promo) { const why = N.promoCheck(N.promos[x.promo.id], x, N.totals(x).sub); if (why) { x.promo = null; P.renderDocket(); return N.toast('Promo removed: ' + why, 'bad'); } }
  x.tend = 0;
  const t = N.totals(x), pays = [];
  let method = N.isDelivery(x.ch) ? 'ch:' + x.ch : 'cash', tend = 0;
  const methods = N.isDelivery(x.ch) ? [{ id: 'ch:' + x.ch, n: N.chName(x.ch) }] : N.conf().pays;
  const m = N.modal({ title: `Payment · ${esc(x.no || 'new order')}`, sticky: true });
  const paid = () => pays.reduce((s, p) => s + p.a, 0);
  const render = () => {
    const due = t.tot - paid();
    const quick = [due, ...[20000, 50000, 100000, 200000].filter(v => v > due).slice(0, 2), Math.ceil(due / 50000) * 50000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 4);
    m.body(`<div class="row"><div class="grow"><div class="eyebrow">${due > 0 ? 'Amount due' : 'Paid in full'}</div><div class="big-due">${N.rp(Math.max(0, due))}</div></div><div style="text-align:right" class="small muted">Total ${N.rp(t.tot)}<br>${x.cust ? 'Member ' + esc(x.cname || N.phoneFmt(x.cust)) : 'No member attached'}</div></div>
      ${pays.length ? `<div class="list">${pays.map((p, i) => `<div class="li" style="cursor:default"><span class="grow">${esc(N.payName(p.m))}${p.ref ? ` <span class="small muted">ref ${esc(p.ref)}</span>` : ''}</span><span class="num">${N.rpn(p.a)}</span><button class="btn ghost sm" data-rm="${i}" aria-label="Remove">${ic('x')}</button></div>`).join('')}</div>` : ''}
      ${due > 0 ? `<div class="pay-grid">${methods.map(p => `<button data-m="${p.id}" class="${method === p.id ? 'on' : ''}">${esc(p.n)}</button>`).join('')}</div>
      <div class="grid2"><label class="field"><span>${method === 'cash' ? 'Cash received' : 'Amount'}</span><input class="input num" id="p-amt" type="number" inputmode="numeric" value="${due}"></label>
      ${method !== 'cash' ? `<label class="field"><span>Reference (optional)</span><input class="input" id="p-ref" placeholder="Approval code / last 4 digits"></label>` : `<div class="field"><span>Quick cash</span><div class="row wrap gap-s">${quick.map(v => `<button class="btn sm" data-quick="${v}">${N.rpn(v)}</button>`).join('')}</div></div>`}</div>
      <p class="small muted">Take the payment on the ${method === 'cash' ? 'drawer' : 'EDC, QRIS stand or app'} first, then record it here.</p>` : `${tend > 0 ? `<div class="note acc" style="font-size:1.1rem">Change: <b class="num">${N.rp(tend)}</b></div>` : ''}`}`);
    m.foot(`<button class="btn" data-close>Cancel</button><span class="grow"></span>${due > 0 ? `<button class="btn" data-addpay>Add payment</button><button class="btn primary lg" data-finish>Record & complete</button>` : `<button class="btn primary lg" data-complete>Complete sale</button>`}`);
  };
  const add = () => {
    const due = t.tot - paid();
    const amt = Math.round(Number(m.$('#p-amt').value) || 0);
    if (amt <= 0) { N.toast('Enter an amount', 'bad'); return false; }
    if (method !== 'cash' && amt > due) { N.toast('Non-cash payment cannot exceed the amount due', 'bad'); return false; }
    const applied = Math.min(amt, due);
    if (method === 'cash') { x.tend = (x.tend || 0) + amt; tend = Math.max(0, amt - due); }
    pays.push({ m: method, a: applied, ref: m.$('#p-ref')?.value.trim() || '' });
    return true;
  };
  render();
  m.el.addEventListener('click', async e => {
    const mb = e.target.closest('[data-m]'); if (mb) { method = mb.dataset.m; render(); return; }
    const qb = e.target.closest('[data-quick]'); if (qb) { m.$('#p-amt').value = qb.dataset.quick; return; }
    const rb = e.target.closest('[data-rm]'); if (rb) { const p = pays.splice(+rb.dataset.rm, 1)[0]; if (p.m === 'cash') { x.tend = 0; tend = 0; } render(); return; }
    if (e.target.closest('[data-addpay]')) { if (add()) render(); return; }
    if (e.target.closest('[data-finish]')) { if (!add()) return; render(); if (t.tot - paid() > 0) return; return finish(); }
    if (e.target.closest('[data-complete]')) return finish();
  });
  let busy = false;
  const finish = async () => {
    if (busy) return; busy = true;
    const btn = m.$('[data-complete],[data-finish]'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const now = Date.now();
    const wasDraft = x.st === 'draft';
    x.pays = pays; x.chg = tend; x.tend = x.tend || 0;
    x.lines.forEach(l => { if (!l.sent) l.sent = now; });
    x.st = 'paid'; x.pt = now; x.by = x.by || P.staff.id; x.cashier = P.staff.id; x.shift = P.shift.id;
    if (wasDraft) x.ct = now;
    try {
      await P.persist(x);
      let loy = null;
      if (x.cust) { try { loy = await N.applyLoyalty(x); if (loy?.pe) { x.pe = loy.pe; await N.patchOrder(x, { pe: loy.pe }); } } catch (err) { N.toast('Sale saved, but points could not update: ' + N.errMsg(err), 'bad'); } }
      m.close();
      P.showReceipt(x, loy, true);
      P.newOrder();
      setTimeout(P.refreshStock, 800);
    } catch (err) {
      x.st = wasDraft ? 'draft' : 'open'; x.pt = null; busy = false;
      N.toast(N.errMsg(err), 'bad'); render();
    }
  };
};
P.showReceipt = (x, loy, fresh) => {
  const text = P.receipt(x, loy);
  const m = N.modal({
    title: fresh ? `Paid · ${esc(x.no)}` : `Receipt · ${esc(x.no)}`,
    body: `${fresh && x.chg ? `<div class="note acc" style="font-size:1.15rem;text-align:center">Change due <b class="num">${N.rp(x.chg)}</b></div>` : ''}
      ${loy && (loy.pe || loy.rewards.length || loy.stamps.length) ? `<div class="note acc small">${loy.pe ? `+${loy.pe} points. ` : ''}${loy.stamps.join(' · ')}${loy.rewards.length ? `<br><b>Unlocked:</b> ${esc(loy.rewards.join(', '))}` : ''}</div>` : ''}
      <pre class="receipt" id="rcpt">${esc(text)}</pre>`,
    foot: `<button class="btn" data-copy>${ic('copy')} Copy for WhatsApp</button><span class="grow"></span><button class="btn primary" data-close>${fresh ? 'Next order' : 'Close'}</button>`,
  });
  m.$('[data-copy]').onclick = () => N.copy(text, m.$('#rcpt'));
};

/* ---------- tables, QR queue, orders ---------- */
P.tables = () => {
  const tbls = P.outlet().tables || [];
  const open = P.live.filter(x => x.st === 'open');
  const byT = {}; open.filter(x => x.tbl).forEach(x => (byT[x.tbl] = byT[x.tbl] || []).push(x));
  const parked = open.filter(x => !x.tbl);
  const m = N.modal({ title: 'Tables & open bills', cls: 'wide' });
  m.body(`${tbls.length ? `<div class="tables">${tbls.map(t => { const os = byT[t] || []; const tot = os.reduce((s, x) => s + (x.tot || 0), 0); return `<button class="tbl ${os.length ? 'busy' : ''}" data-t="${esc(t)}"><b>${esc(t)}</b>${os.length ? `<span class="num small">${N.rpn(tot)}</span><span class="small muted">${os.length > 1 ? os.length + ' bills · ' : ''}${N.ago(Math.min(...os.map(x => x.ct)))}</span>` : '<span class="small muted">Free</span>'}</button>`; }).join('')}</div>` : '<p class="muted">No tables set up for this outlet.</p>'}
    <h3>Open takeaway & delivery orders</h3>
    ${parked.length ? `<div class="list">${parked.map(x => `<button class="li" data-id="${x.id}"><b class="mono">${esc(x.no)}</b><span class="grow">${esc(N.chName(x.ch))}${x.name ? ' · ' + esc(x.name) : ''}</span><span class="small muted">${N.ago(x.ct)}</span><span class="num">${N.rpn(x.tot)}</span></button>`).join('')}</div>` : '<p class="muted small">None.</p>'}`);
  m.el.addEventListener('click', e => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (id) { m.close(); return P.load(id); }
    const t = e.target.closest('[data-t]')?.dataset.t; if (!t) return;
    const os = byT[t] || [];
    if (os.length === 1) { m.close(); return P.load(os[0].id); }
    if (os.length > 1) { m.body(`<h3>Table ${esc(t)}</h3><div class="list">${os.map(x => `<button class="li" data-id="${x.id}"><b class="mono">${esc(x.no)}</b><span class="grow">${esc(x.name || '')}</span><span class="num">${N.rpn(x.tot)}</span></button>`).join('')}</div>`); return; }
    m.close(); P.newOrder(); P.cur.ch = 'table'; P.cur.tbl = t; P.renderDocket();
  });
};
P.qrQueue = () => {
  if (!P.guard('qr')) return;
  const m = N.modal({ title: 'QR orders', cls: 'wide' });
  const render = () => {
    const list = P.live.filter(x => x.st === 'new').sort((a, b) => a.ct - b.ct);
    m.body(list.length ? list.map(x => `<div class="panel"><div class="panel-h"><b class="mono">${esc(x.no)}</b><span class="badge car">${esc(x.tbl ? 'Table ' + x.tbl : 'Pickup')}</span><span class="grow">${esc(x.name || '')}${x.cust ? ` <span class="small muted">${N.phoneFmt(x.cust)}</span>` : ''}</span><span class="small muted">${N.ago(x.ct)}</span></div>
      ${(x.lines || []).map(l => `<div class="row small"><b class="num">${l.q}×</b><span class="grow">${esc(l.n)}${l.m ? ` <span class="muted">· ${esc(l.m)}</span>` : ''}${l.note ? ` <em class="muted">“${esc(l.note)}”</em>` : ''}</span><span class="num">${N.rpn(l.p * l.q)}</span></div>`).join('')}
      ${x.note ? `<p class="small">Note: ${esc(x.note)}</p>` : ''}
      <div class="row"><b class="num grow">${N.rp(x.tot)}</b><button class="btn danger sm" data-rej="${x.id}">Reject</button><button class="btn primary" data-acc="${x.id}">Accept & send</button></div></div>`).join('') : '<div class="empty">No QR orders waiting.</div>');
  };
  render();
  const iv = setInterval(() => { if (m.closed) clearInterval(iv); else render(); }, 4000);
  m.el.addEventListener('click', async e => {
    const a = e.target.closest('[data-acc]'), r = e.target.closest('[data-rej]');
    const id = (a || r)?.dataset.acc || (a || r)?.dataset.rej; if (!id) return;
    const x = N.clone(P.live.find(o => o.id === id)); if (!x) return;
    if (a) { const now = Date.now(); x.st = 'open'; x.by = P.staff.id; x.shift = P.shift?.id || null; x.lines.forEach(l => { l.sent = l.sent || now; }); x.acc = now; }
    else { const v = await N.form('Reject QR order', [{ id: 'why', label: 'Reason shown to staff', value: 'Item unavailable' }], { ok: 'Reject', cls: 'narrow' }); if (!v) return; x.st = 'void'; x.void = { why: 'QR rejected: ' + v.why, by: P.staff.id, ok: P.staff.id, at: Date.now() }; }
    try { N.finalize(x); await N.saveOrder(x); N.toast(a ? `Order ${x.no} sent to the bar` : 'Order rejected'); setTimeout(render, 300); } catch (err) { N.toast(N.errMsg(err), 'bad'); }
  });
};
P.orders = () => {
  const m = N.modal({ title: 'Today’s orders', cls: 'wide' });
  let tab = 'open', q = '';
  const render = () => {
    const all = P.live.slice().sort((a, b) => (b.pt || b.ct) - (a.pt || a.ct));
    const f = all.filter(x => (tab === 'all' || (tab === 'open' ? x.st === 'open' || x.st === 'new' : tab === 'paid' ? x.st === 'paid' : x.st === 'void' || x.st === 'refund')) && (!q || (x.no + ' ' + x.name + ' ' + (x.tbl || '')).toLowerCase().includes(q)));
    const tabs = [['open', 'Open'], ['paid', 'Paid'], ['void', 'Void & refunds'], ['all', 'All']];
    m.body(`<div class="row wrap"><div class="seg">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><input class="input grow" id="o-q" placeholder="Search number, name or table" value="${esc(q)}" style="min-width:180px"></div>
      ${f.length ? `<div class="list">${f.map(x => `<button class="li" data-id="${x.id}"><b class="mono" style="min-width:60px">${esc(x.no)}</b><span class="grow">${esc(N.chName(x.ch))}${x.tbl ? ' · ' + esc(x.tbl) : ''}${x.name ? ' · ' + esc(x.name) : ''}<br><span class="small muted">${N.hm(x.pt || x.ct)} · ${esc(N.staff[x.cashier || x.by]?.name || '')}</span></span>${P.badge(x)}<span class="num">${N.rpn(x.tot)}</span></button>`).join('')}</div>` : '<div class="empty">No orders here.</div>'}`);
    const inp = m.$('#o-q'); inp.oninput = () => { q = inp.value.toLowerCase(); const pos = inp.selectionStart; render(); const n = m.$('#o-q'); n.focus(); n.setSelectionRange(pos, pos); };
  };
  render();
  m.el.addEventListener('click', e => {
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; return render(); }
    const id = e.target.closest('[data-id]')?.dataset.id; if (id) { m.close(); P.orderDetail(id); }
  });
};
P.badge = x => {
  if (x.st === 'paid') return `<span class="badge ok">Paid</span>`;
  if (x.st === 'void') return `<span class="badge bad">Void</span>`;
  if (x.st === 'refund') return `<span class="badge bad">Refunded</span>`;
  if (x.st === 'new') return `<span class="badge car">Waiting</span>`;
  return P.isReady(x) ? `<span class="badge acc">Ready</span>` : `<span class="badge warn">Open</span>`;
};
P.orderDetail = id => {
  const x = P.live.find(o => o.id === id); if (!x) return;
  const m = N.modal({ title: `Order ${esc(x.no)}` });
  m.body(`<div class="row wrap">${P.badge(x)}<span class="muted small">${esc(N.chName(x.ch))}${x.tbl ? ' · Table ' + esc(x.tbl) : ''} · ${N.dt(x.ct)}</span></div>
    ${x.void ? `<div class="note">Voided: ${esc(x.void.why)} · by ${esc(N.staff[x.void.by]?.name || '')}${x.void.ok !== x.void.by ? ', approved by ' + esc(N.staff[x.void.ok]?.name || '') : ''}</div>` : ''}
    ${x.refund ? `<div class="note">Refunded ${N.rp(x.tot)} by ${esc(N.payName(x.refund.m))}: ${esc(x.refund.why)} · approved by ${esc(N.staff[x.refund.ok]?.name || '')}</div>` : ''}
    <pre class="receipt" id="rcpt">${esc(P.receipt(x))}</pre>
    ${(x.vl || []).length ? `<p class="small muted">Removed after sending: ${x.vl.map(v => `${v.q}× ${esc(v.n)} (approved by ${esc(N.staff[v.ok]?.name || '')})`).join(', ')}</p>` : ''}`);
  m.foot(`<button class="btn" data-copy>${ic('copy')} Copy</button><span class="grow"></span>
    ${x.st === 'open' || x.st === 'new' ? `<button class="btn primary" data-load>Open in till</button>` : ''}
    ${x.st === 'paid' ? `<button class="btn danger" data-refund>${ic('refund')} Refund</button>` : ''}`);
  m.el.addEventListener('click', async e => {
    if (e.target.closest('[data-copy]')) return N.copy(P.receipt(x), m.$('#rcpt'));
    if (e.target.closest('[data-load]')) { m.close(); return P.load(x.id); }
    if (e.target.closest('[data-refund]')) { m.close(); P.refund(x); }
  });
};
P.refund = async x => {
  if (!P.guard('pay')) return;
  if (!P.shift) return N.toast('Open a shift first.', 'bad');
  const methods = [...new Set((x.pays || []).map(p => p.m))];
  const v = await N.form(`Refund ${esc(x.no)} · ${N.rp(x.tot)}`, [
    { id: 'why', label: 'Reason', type: 'select', opts: [['Wrong item', 'Wrong item'], ['Quality complaint', 'Quality complaint'], ['Charged twice', 'Charged twice'], ['Customer cancelled', 'Customer cancelled'], ['Other', 'Other']], value: 'Quality complaint' },
    { id: 'm', label: 'Refund method', type: 'select', opts: [...methods, ...(methods.includes('cash') ? [] : ['cash'])].map(id => [id, N.payName(id)]), value: methods[0] },
    { id: 'note', label: 'Note', full: true },
  ], { ok: 'Refund in full', note: 'Full refunds only. Points earned on this order are taken back and points used are returned.' });
  if (!v) return;
  const ok = P.appr().on ? await N.pin({ title: 'Supervisor approval', sub: `Refund ${esc(x.no)} · ${N.rp(x.tot)}`, verify: pin => N.findByPin(pin, s => N.can(s, 'approve') && N.staffAt(s, P.dev.o)) }) : P.staff;
  if (!ok) return;
  const y = N.clone(x);
  y.st = 'refund'; y.refund = { why: v.why + (v.note ? ': ' + v.note : ''), m: v.m, by: P.staff.id, ok: ok.id, at: Date.now(), shift: P.shift.id, dev: P.dev.code };
  try { await N.saveOrder(y); await N.reverseLoyalty(y, 'Refund ' + y.no); N.toast(`Refunded ${N.rp(y.tot)} by ${N.payName(v.m)}`); }
  catch (e) { N.toast(N.errMsg(e), 'bad'); }
};

/* ---------- more menu: shift, cash, clock, stock, sold out ---------- */
P.more = () => {
  const s = P.staff;
  const items = [
    ['clock', 'Clock in / out', 'clock', true],
    ['box', 'Sold-out items', 'soldout', N.can(s, 'soldout')],
    ['scale', 'Stock levels', 'stock', true],
    ['cash', 'Cash in / out', 'cashio', !!P.shift],
    ['receipt', P.shift ? 'Close shift' : 'Open shift', 'shift', N.can(s, 'shift')],
    ['coffee', 'Switch to bar screen', 'bar', N.can(s, 'station') || s?.role === 'manager'],
    ['chef', 'Switch to kitchen screen', 'kitchen', N.can(s, 'station') || s?.role === 'manager'],
    ['grid', 'Back office', 'bo', s?.role === 'manager'],
  ].filter(i => i[3]);
  const m = N.modal({ title: 'More', cls: 'narrow', body: `<div class="list">${items.map(([i, l, k]) => `<button class="li" data-k="${k}">${ic(i)}<span class="grow">${l}</span></button>`).join('')}</div>` });
  m.el.addEventListener('click', async e => {
    const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
    m.close();
    if (k === 'clock') { try { const r = await N.clock(s, P.dev.o); N.toast(`${s.name} clocked ${r.action} at ${N.hm(Date.now())}`); } catch (err) { N.toast(N.errMsg(err), 'bad'); } }
    if (k === 'soldout') P.soldOut();
    if (k === 'stock') P.stockView();
    if (k === 'cashio') P.cashIO();
    if (k === 'shift') P.shift ? P.closeShift() : P.signedIn(s);
    if (k === 'bar' || k === 'kitchen') { P.unsubAll(); clearInterval(P.tick); const dev = { ...P.dev, mode: k }; N.ls.set('dev', dev); window.App.route(); }
    if (k === 'bo') { P.unsubAll(); clearInterval(P.tick); window.App.openBO(s); }
  });
};
P.soldOut = () => {
  const o = P.dev.o;
  const m = N.modal({ title: 'Sold-out items', cls: 'wide' });
  const render = () => m.body(`<p class="muted small">Switch an item off when it runs out at ${esc(P.outlet().name)}. It greys out on every till here and on the QR menu.</p>
    <div class="list">${N.itemsSorted().map(i => `<label class="li"><span class="grow">${esc(i.name)} <span class="small muted">${esc(N.cats[i.cat]?.name || '')}</span></span>${N.avail(i, o) ? '<span class="badge ok">Available</span>' : '<span class="badge bad">Sold out</span>'}<input type="checkbox" data-id="${i.id}" ${N.avail(i, o) ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent)"></label>`).join('')}</div>`);
  render();
  m.el.addEventListener('change', async e => {
    const id = e.target.dataset.id; if (!id) return;
    try { await N.db.doc('items/' + id).update({ avail: { [o]: e.target.checked } }); } catch (err) { N.toast(N.errMsg(err), 'bad'); }
    setTimeout(render, 250);
  });
};
P.stockView = async () => {
  const m = N.modal({ title: 'Stock levels', body: '<p class="muted">Counting…</p>' });
  try {
    const r = await N.stock(P.dev.o, P.liveToday); P.stock = r.res;
    const rows = Object.values(r.res);
    m.body(rows.length ? `<p class="small muted">On hand = last stock count + deliveries − sales since then. Record deliveries and counts in Back office → Inventory.</p><div class="list">${rows.map(x => `<div class="li" style="cursor:default"><span class="grow">${esc(x.name)}</span>${x.qty == null ? '<span class="badge">Not counted yet</span>' : `<span class="badge ${x.qty <= 0 ? 'bad' : x.qty <= x.low ? 'warn' : 'ok'}">${x.qty <= 0 ? 'Out' : x.qty <= x.low ? 'Low' : 'OK'}</span><b class="num" style="min-width:40px;text-align:right">${x.qty}</b>`}</div>`).join('')}</div>` : '<div class="empty">No items are stock-tracked. Turn on stock tracking per item in Back office → Menu.</div>');
    P.renderMenu(true);
  } catch (e) { m.body(`<div class="note">${esc(N.errMsg(e))}</div>`); }
};
P.cashIO = async () => {
  const v = await N.form('Cash in / out', [
    { id: 't', label: 'Type', type: 'select', opts: [['out', 'Cash out (petty cash, supplier)'], ['in', 'Cash in (top up float)']], value: 'out' },
    { id: 'a', label: 'Amount (Rp)', type: 'number', req: true },
    { id: 'why', label: 'Reason', req: true, full: true, ph: 'e.g. Bought ice from supplier' },
  ], { ok: 'Record', cls: 'narrow' });
  if (!v) return;
  const ok = N.can(P.staff, 'cashio') ? P.staff : await P.approve(`Cash ${v.t} ${N.rp(v.a)}: ${v.why}`);
  if (!ok) return;
  const sh = N.clone(P.shift); sh.io = [...(sh.io || []), { t: v.t, a: v.a, why: v.why, by: P.staff.id, ok: ok.id, at: Date.now() }];
  try { await N.saveShift(P.dev.o, sh); P.shift = sh; N.toast('Recorded'); } catch (e) { N.toast(N.errMsg(e), 'bad'); }
};
P.shiftStats = (sh, orders) => {
  const pay = {}; let n = 0, net = 0, cashSales = 0, refundsCash = 0, refunds = 0, voids = 0, disc = 0;
  for (const x of orders) {
    if ((x.st === 'paid' || x.st === 'refund') && x.shift === sh.id) {
      n++; net += x.net || 0; disc += x.disc || 0;
      for (const p of x.pays || []) { pay[p.m] = (pay[p.m] || 0) + p.a; if (p.m === 'cash') cashSales += p.a; }
    }
    if (x.st === 'refund' && x.refund?.shift === sh.id) { refunds += x.tot || 0; if (x.refund.m === 'cash') refundsCash += x.tot || 0; }
    if (x.st === 'void' && x.shift === sh.id) voids++;
  }
  const cin = (sh.io || []).filter(i => i.t === 'in').reduce((s, i) => s + i.a, 0), cout = (sh.io || []).filter(i => i.t === 'out').reduce((s, i) => s + i.a, 0);
  return { pay, n, net, disc, cashSales, refunds, refundsCash, voids, cin, cout, expected: (sh.float || 0) + cashSales - refundsCash + cin - cout };
};
P.closeShift = async () => {
  const sh = P.shift; if (!sh) return;
  const orders = [...P.live, ...P.liveToday.filter(x => !P.live.includes(x))];
  const openHere = P.live.filter(x => x.st === 'open' && x.shift === sh.id);
  const st = P.shiftStats(sh, orders);
  const m = N.modal({ title: 'Close shift', sticky: true });
  m.body(`${openHere.length ? `<div class="note">${openHere.length} open bill(s) from this shift are still unpaid. They stay open for the next shift.</div>` : ''}
    <div class="kpis"><div class="kpi"><span class="eyebrow">Orders</span><b>${st.n}</b></div><div class="kpi"><span class="eyebrow">Net sales</span><b>${N.rpn(st.net)}</b></div><div class="kpi"><span class="eyebrow">Refunds</span><b>${N.rpn(st.refunds)}</b></div></div>
    <div class="tbl-wrap"><table class="t"><tbody>${Object.entries(st.pay).map(([k, v]) => `<tr><td>${esc(N.payName(k))}</td><td class="n">${N.rpn(v)}</td></tr>`).join('') || '<tr><td class="muted">No payments</td><td></td></tr>'}</tbody></table></div>
    <div class="tbl-wrap"><table class="t"><tbody>
      <tr><td>Opening float</td><td class="n">${N.rpn(sh.float)}</td></tr><tr><td>+ Cash sales</td><td class="n">${N.rpn(st.cashSales)}</td></tr>
      <tr><td>− Cash refunds</td><td class="n">${N.rpn(st.refundsCash)}</td></tr><tr><td>+ Cash in / − cash out</td><td class="n">${N.rpn(st.cin - st.cout)}</td></tr>
      <tr><td><b>Expected in drawer</b></td><td class="n"><b>${N.rpn(st.expected)}</b></td></tr></tbody></table></div>
    <div class="grid2"><label class="field"><span>Counted cash (Rp)</span><input class="input num" id="s-count" type="number" inputmode="numeric" autofocus></label><label class="field"><span>Note</span><input class="input" id="s-note"></label></div>
    <div id="s-var" class="pin-err"></div>`);
  m.foot(`<button class="btn" data-close>Cancel</button><button class="btn primary" data-closeshift>Close shift</button>`);
  m.$('#s-count').oninput = e => { const d = (Number(e.target.value) || 0) - st.expected; m.$('#s-var').textContent = e.target.value === '' ? '' : d === 0 ? 'Drawer balances.' : `${d > 0 ? 'Over' : 'Short'} by ${N.rp(Math.abs(d))}`; m.$('#s-var').style.color = d === 0 ? 'var(--ok)' : 'var(--bad)'; };
  m.$('[data-closeshift]').onclick = async () => {
    const raw = m.$('#s-count').value; if (raw === '') return N.toast('Count the drawer and enter the amount', 'bad');
    const counted = Number(raw);
    const y = { ...N.clone(sh), close: Date.now(), closeBy: P.staff.id, counted, expected: st.expected, note: m.$('#s-note').value.trim(), stats: { n: st.n, net: st.net, pay: st.pay, refunds: st.refunds, voids: st.voids } };
    try { await N.saveShift(P.dev.o, y); P.shift = null; m.close(); N.toast(`Shift closed. ${counted - st.expected === 0 ? 'Drawer balanced.' : (counted > st.expected ? 'Over ' : 'Short ') + N.rp(Math.abs(counted - st.expected))}`); P.lock(); }
    catch (e) { N.toast(N.errMsg(e), 'bad'); }
  };
};

/* ============ Bar / kitchen ticket screen ============ */
P.station = (root, dev) => {
  P.dev = dev; P.root = root; P.unsubAll();
  const stn = dev.mode;
  const recent = [];
  root.innerHTML = `<div class="station"><header class="topbar"><div class="mark">${esc(N.conf().brand)}<i>.</i></div><div class="who"><b>${stn === 'bar' ? 'Bar' : 'Kitchen'} tickets</b><span>${esc(P.outlet().name || '')}</span></div><div class="row right wrap gap-s"><span class="small muted" id="st-count"></span><button class="btn sm" data-act="st-recall">${ic('refund')} Recall</button><button class="btn sm" data-act="st-exit">${ic('grid')} Exit</button></div></header><div class="board" id="st-board"></div></div>`;
  let known = null, armed = false;
  const tickets = () => {
    const out = [];
    for (const x of P.live) {
      if (!(x.st === 'open' || x.st === 'paid')) continue;
      const groups = {};
      for (const l of x.lines || []) if (l.st === stn && l.sent) (groups[l.sent] = groups[l.sent] || []).push(l);
      for (const [sent, ls] of Object.entries(groups)) if (ls.some(l => !(x.dn || {})[l.k])) out.push({ x, sent: +sent, ls });
    }
    return out.sort((a, b) => a.sent - b.sent);
  };
  const render = () => {
    const ts = tickets();
    const keys = new Set(ts.map(t => t.x.id + t.sent));
    if (known && armed && [...keys].some(k => !known.has(k))) P.beep();
    known = keys;
    document.getElementById('st-count').textContent = `${ts.length} open ticket${ts.length === 1 ? '' : 's'}`;
    document.getElementById('st-board').innerHTML = ts.length ? ts.map(t => {
      const mins = N.mins(t.sent), dn = t.x.dn || {};
      return `<article class="tkt ${mins >= 12 ? 'very' : mins >= 7 ? 'late' : ''}"><div class="tkt-h"><span class="no">${esc(t.x.no)}</span><span class="grow small">${esc(t.x.tbl ? 'Table ' + t.x.tbl : N.chName(t.x.ch))}${t.x.name ? ' · ' + esc(t.x.name) : ''}</span><span class="badge">${mins}m</span></div>
        <ul>${t.ls.map(l => `<li class="${dn[l.k] ? 'done' : ''}" data-act="st-line" data-o="${t.x.id}" data-k="${l.k}"><span class="qn">${l.q}×</span><div class="grow"><b>${esc(l.n)}</b>${l.m ? `<small>${esc(l.m)}</small>` : ''}${l.note ? `<em>${esc(l.note)}</em>` : ''}</div></li>`).join('')}</ul>
        <div style="padding:8px 12px 12px"><button class="btn primary block" data-act="st-bump" data-o="${t.x.id}" data-s="${t.sent}">${ic('check')} Done</button></div></article>`;
    }).join('') : `<div class="empty" style="grid-column:1/-1">No open ${stn} tickets. New orders appear here the moment the till sends them.</div>`;
  };
  const mark = async (x, keys, val) => {
    const dn = {}; keys.forEach(k => { dn[k] = val; });
    try { await N.patchOrder(x, { dn }); } catch (e) { N.toast(N.errMsg(e), 'bad'); }
  };
  N.acts['st-line'] = el => { const x = P.live.find(o => o.id === el.dataset.o); if (!x) return; const cur = (x.dn || {})[el.dataset.k]; mark(x, [el.dataset.k], cur ? 0 : Date.now()); };
  N.acts['st-bump'] = el => { const x = P.live.find(o => o.id === el.dataset.o); if (!x) return; const ks = x.lines.filter(l => l.st === stn && String(l.sent) === el.dataset.s).map(l => l.k); recent.unshift({ x, ks, at: Date.now() }); recent.length = Math.min(recent.length, 12); mark(x, ks, Date.now()); };
  N.acts['st-recall'] = () => {
    const m = N.modal({ title: 'Recall a ticket', body: recent.length ? `<div class="list">${recent.map((r, i) => `<button class="li" data-i="${i}"><b class="mono">${esc(r.x.no)}</b><span class="grow">${r.ks.length} item(s)</span><span class="small muted">${N.hm(r.at)}</span></button>`).join('')}</div>` : '<div class="empty">Nothing bumped on this screen yet.</div>' });
    m.el.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const r = recent.splice(+b.dataset.i, 1)[0]; const x = P.live.find(o => o.id === r.x.id) || r.x; mark(x, r.ks, 0); m.close(); });
  };
  N.acts['st-exit'] = async () => {
    const s = await N.pin({ title: 'Staff PIN', sub: 'Leave the ticket screen', verify: pin => N.findByPin(pin) });
    if (!s) return; P.unsubAll(); clearInterval(P.tick); clearInterval(P.stTick);
    if (N.can(s, 'sell')) { N.ls.set('dev', { ...dev, mode: 'pos' }); window.App.route(); } else window.App.launcher(true);
  };
  P.watchLive(render);
  clearInterval(P.stTick); P.stTick = setInterval(render, 30000);
  clearInterval(P.tick); P.tick = P.dayTick(() => P.station(root, dev));
  N.listeners.clear(); N.listeners.add(render);
  const m = N.modal({ title: `${stn === 'bar' ? 'Bar' : 'Kitchen'} screen`, cls: 'narrow', body: '<p>Tap start so this screen can chime when a new ticket arrives.</p>', foot: '<button class="btn primary lg block" data-close>Start</button>', onClose: () => { armed = true; P.beep(); } });
  render();
};

/* ============ Table QR ordering (customer view) ============ */
P.qrOrder = (root, o, tblIdx) => {
  const out = N.outlets[o];
  const tbl = out?.tables?.[tblIdx];
  if (!out || tbl == null) { root.innerHTML = `<div class="boot"><div class="col" style="align-items:center"><div class="mark">${esc(N.conf().brand)}<i>.</i></div><p class="muted">This table code is not valid. Please ask our staff.</p></div></div>`; return; }
  P.dev = { o, code: 'qr' };
  const cart = { lines: [] };
  let cat = 'all', view = 'menu';
  const mineKey = 'qr.mine.' + o + '.' + N.dkey();
  let mine = N.ls.get(mineKey, []);
  let qrDoc = [];
  const ch = 'qr';
  const draw = () => {
    const x = { ...N.blankOrder(o, 'qr', ch), lines: cart.lines, tbl };
    const t = N.totals(x);
    const myOrders = qrDoc.filter(y => mine.includes(y.id)).sort((a, b) => b.ct - a.ct);
    const cats = N.catsSorted().filter(c => N.itemsSorted().some(i => i.cat === c.id && !i.hideQr));
    const items = N.itemsSorted().filter(i => !i.hideQr && (cat === 'all' || i.cat === cat));
    root.innerHTML = `<div class="qr"><div class="qr-head"><div class="mark">${esc(N.conf().brand)}<i>.</i></div><h1>Table ${esc(tbl)}</h1><p class="muted">${esc(out.name)} · Order here and we’ll bring it to your table. Pay at the counter or when we bring the bill.</p>
      ${myOrders.length ? `<div class="row wrap gap-s">${myOrders.map(y => `<span class="badge ${y.st === 'new' ? 'car' : P.isReady(y) ? 'ok' : y.st === 'void' ? 'bad' : 'acc'}">${esc(y.no)} · ${y.st === 'new' ? 'Waiting for staff' : y.st === 'void' ? 'Not accepted, please ask staff' : y.st === 'paid' ? 'Paid, thank you' : P.isReady(y) ? 'Ready' : 'Being prepared'}</span>`).join('')}</div>` : ''}</div>
      <div class="cats" style="position:sticky;top:env(safe-area-inset-top,0px);background:var(--bg);padding:8px 0;z-index:3"><button class="cat ${cat === 'all' ? 'on' : ''}" data-qcat="all">All</button>${cats.map(c => `<button class="cat ${cat === c.id ? 'on' : ''}" data-qcat="${c.id}">${esc(c.name)}</button>`).join('')}</div>
      <div>${items.map(i => { const ok = N.avail(i, o); const inCart = cart.lines.filter(l => l.i === i.id).reduce((s, l) => s + l.q, 0); return `<div class="qr-item"><div class="grow"><b>${esc(i.name)}</b>${i.desc ? `<p class="small muted">${esc(i.desc)}</p>` : ''}<p class="num small">${N.rp(N.price(i, o, ch))}</p></div>${ok ? `<button class="btn ${inCart ? 'primary' : ''}" data-qadd="${i.id}">${inCart ? inCart + ' in cart' : ic('plus') + ' Add'}</button>` : '<span class="badge bad">Sold out</span>'}</div>`; }).join('')}</div></div>
      ${cart.lines.length ? `<div class="qr-cart"><div class="in"><div class="grow"><b>${cart.lines.reduce((s, l) => s + l.q, 0)} item(s)</b><div class="small muted num">${N.rp(t.tot)} incl. service & tax</div></div><button class="btn primary lg" data-qcart>Review order</button></div></div>` : ''}`;
  };
  const review = () => {
    const x = { ...N.blankOrder(o, 'qr', ch), lines: cart.lines, tbl }, t = N.totals(x);
    const m = N.modal({ title: 'Your order', sticky: true });
    const render = () => {
      const t = N.totals({ ...x, lines: cart.lines });
      m.body(`${cart.lines.map((l, i) => `<div class="row"><div class="grow"><b>${esc(l.n)}</b>${l.m ? `<div class="small muted">${esc(l.m)}</div>` : ''}${l.note ? `<div class="small muted">“${esc(l.note)}”</div>` : ''}</div><button class="btn sm" data-dq="${i}" data-d="-1">−</button><b class="num">${l.q}</b><button class="btn sm" data-dq="${i}" data-d="1">+</button><span class="num" style="min-width:70px;text-align:right">${N.rpn(l.p * l.q)}</span></div>`).join('')}
        <div class="tot"><span>Subtotal</span><span class="num">${N.rpn(t.sub)}</span>${t.svc ? `<span class="muted">Service</span><span class="num">${N.rpn(t.svc)}</span>` : ''}${t.tax ? `<span class="muted">Tax</span><span class="num">${N.rpn(t.tax)}</span>` : ''}<span class="grand">Total</span><span class="num grand">${N.rp(t.tot)}</span></div>
        <div class="grid2"><label class="field"><span>Your name</span><input class="input" id="q-name" value="${esc(N.ls.get('qr.name', ''))}"></label><label class="field"><span>Member phone (optional)</span><input class="input num" id="q-phone" type="tel" inputmode="tel" placeholder="to earn points"></label></div>
        <label class="field"><span>Note for us (optional)</span><input class="input" id="q-note"></label>`);
      m.foot(`<button class="btn" data-close>Keep browsing</button><button class="btn primary lg" data-qsend ${cart.lines.length ? '' : 'disabled'}>Send order</button>`);
    };
    render();
    m.el.addEventListener('click', async e => {
      const b = e.target.closest('[data-dq]');
      if (b) { const l = cart.lines[+b.dataset.dq]; l.q += +b.dataset.d; if (l.q <= 0) cart.lines.splice(+b.dataset.dq, 1); const keep = { n: m.$('#q-name').value, ph: m.$('#q-phone').value, nt: m.$('#q-note').value }; render(); m.$('#q-name').value = keep.n; m.$('#q-phone').value = keep.ph; m.$('#q-note').value = keep.nt; draw(); return; }
      if (e.target.closest('[data-qsend]')) {
        const name = m.$('#q-name').value.trim(); if (!name) return N.toast('Please add your name', 'bad');
        N.ls.set('qr.name', name);
        const phone = N.phone(m.$('#q-phone').value);
        const y = { ...N.blankOrder(o, 'qr', ch), lines: N.clone(cart.lines), tbl, name, note: m.$('#q-note').value.trim(), st: 'new', ct: Date.now(), no: 'Q-' + N.uid(3).toUpperCase() };
        if (phone.length >= 9) { y.cust = phone; try { const c = await N.getCust(phone); if (c) y.cname = c.name; else y.cust = null; } catch { y.cust = null; } }
        y.loc = { o, d: N.dkey(), dev: 'qr' };
        N.finalize(y);
        const btn = m.$('[data-qsend]'); btn.disabled = true; btn.textContent = 'Sending…';
        try { await N.saveOrder(y); mine.push(y.id); N.ls.set(mineKey, mine); cart.lines = []; m.close(); N.toast('Order sent. Our staff will confirm it shortly.'); draw(); }
        catch (err) { btn.disabled = false; btn.textContent = 'Send order'; N.toast(N.errMsg(err), 'bad'); }
      }
    });
  };
  root.addEventListener('click', async e => {
    const c = e.target.closest('[data-qcat]'); if (c) { cat = c.dataset.qcat; return draw(); }
    const a = e.target.closest('[data-qadd]');
    if (a) {
      const item = N.items[a.dataset.qadd]; let opt = {};
      if ((item.mods || []).length) { opt = await P.pickMods(item, ch, o); if (!opt) return; }
      P.addLine(cart, P.makeLine(item, o, ch, opt)); N.toast(`${item.name} added`); return draw();
    }
    if (e.target.closest('[data-qcart]')) review();
  });
  N.dayRef(o, N.dkey(), 'qr').onSnapshot(s => { qrDoc = Object.values(s.data()?.orders || {}); draw(); }, () => { });
  N.listeners.clear(); N.listeners.add(draw);
  draw();
};
