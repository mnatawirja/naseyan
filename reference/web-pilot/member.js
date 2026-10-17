'use strict';
/* Naseyan Rewards — member-facing page: sign in, card, rewards, history, profile, self sign-up. */
const M = window.M = { c: null, tab: 'card', unsub: null };
(() => {
const esc = N.esc, ic = N.ic;
N.memberHash = (phone, pin) => N.hash('m' + phone, pin);
N.newMemberCode = async () => {
  for (let i = 0; i < 5; i++) {
    const code = N.uid(6).toUpperCase();
    const q = await N.db.collection('custs').where('code', '==', code).limit(1).get();
    if (q.empty) return code;
  }
  return N.uid(8).toUpperCase();
};
const LOCK_KEY = 'm.fails';
const locked = () => { const f = N.ls.get(LOCK_KEY, { n: 0, t: 0 }); return f.n >= 5 && Date.now() - f.t < 5 * 60000 ? Math.ceil((5 * 60000 - (Date.now() - f.t)) / 60000) : 0; };
const fail = () => { const f = N.ls.get(LOCK_KEY, { n: 0, t: 0 }); const n = Date.now() - f.t > 5 * 60000 ? 1 : f.n + 1; N.ls.set(LOCK_KEY, { n, t: Date.now() }); };
const shell = inner => `<div class="mem">${inner}</div>`;
const brand = () => `<div class="mem-brand"><div class="mark" data-mbrand>${esc(N.conf().brand)}<i>.</i></div><span class="eyebrow">Rewards</span></div>`;
/* hidden staff exit: tap the logo 5 times within 3 seconds, then manager PIN */
let taps = [];
document.addEventListener('click', e => {
  if (!e.target.closest('[data-mbrand]')) return;
  const now = Date.now(); taps = [...taps.filter(t => now - t < 3000), now];
  if (taps.length >= 5) { taps = []; App.unlockMember(); }
});

M.start = root => {
  M.root = root;
  N.listeners.clear(); N.listeners.add(() => { if (M.c) M.draw(); });
  const s = N.ls.get('member');
  if (s?.p && s?.h) return M.resume(s);
  M.signin();
};
M.resume = async s => {
  M.root.innerHTML = shell(`${brand()}<p class="muted">Opening your card…</p>`);
  try { const c = await N.getCust(s.p); if (c?.pin && c.pin === s.h) return M.enter(c); } catch { }
  N.ls.del('member'); M.signin();
};
M.enter = c => {
  M.c = c; N.ls.set('member', { p: c.id, h: c.pin });
  if (M.unsub) M.unsub();
  M.unsub = N.custRef(c.id).onSnapshot(s => { if (!s.exists || s.data().pin !== N.ls.get('member')?.h) return M.signout(true); M.c = { id: s.id, ...s.data() }; M.draw(); }, () => { });
  if (!c.code) N.newMemberCode().then(code => N.custRef(c.id).update({ code })).catch(() => { });
  M.draw();
};
M.signout = (silent) => { if (M.unsub) M.unsub(); M.unsub = null; M.c = null; N.ls.del('member'); M.signin(); if (silent === true) N.toast('Please sign in again.'); };

/* ---------- sign in & join ---------- */
M.signin = () => {
  M.root.innerHTML = shell(`${brand()}
    <div class="mem-hero"><h1>Your Naseyan card</h1><p class="muted">Check points, stamps and rewards. Sign in with the phone number you gave at the counter.</p></div>
    <form class="col" id="m-in" novalidate>
      <label class="field"><span>Phone number</span><input class="input num" id="m-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0812 3456 7890" value="${esc(N.ls.get('m.lastPhone', ''))}"></label>
      <label class="field"><span>6-digit PIN</span><input class="input num" id="m-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" placeholder="••••••"></label>
      <div class="pin-err" id="m-err"></div>
      <button class="btn primary lg block" type="submit">Sign in</button>
    </form>
    <div class="mem-foot"><p>New to Naseyan Rewards?</p><button class="btn block" id="m-join">${ic('star')} Join now, it’s free</button>
    <p class="small muted">Forgot your PIN or never set one? Ask our staff at the counter to set a new PIN for you.</p></div>`);
  const err = t => { M.root.querySelector('#m-err').textContent = t; };
  M.root.querySelector('#m-join').onclick = () => M.join();
  M.root.querySelector('#m-in').onsubmit = async e => {
    e.preventDefault();
    const lk = locked(); if (lk) return err(`Too many tries. Wait ${lk} minute${lk > 1 ? 's' : ''} and try again.`);
    const p = N.phone(M.root.querySelector('#m-phone').value), pin = M.root.querySelector('#m-pin').value.trim();
    if (p.length < 9) return err('Enter the phone number you registered with.');
    if (!/^\d{6}$/.test(pin)) return err('Your PIN has 6 digits.');
    N.ls.set('m.lastPhone', M.root.querySelector('#m-phone').value);
    const btn = M.root.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Checking…';
    try {
      const c = await N.getCust(p);
      if (!c) { btn.disabled = false; btn.textContent = 'Sign in'; return err('No member with this number. Tap “Join now” to register.'); }
      if (!c.pin) { btn.disabled = false; btn.textContent = 'Sign in'; return err('This membership has no PIN yet. Ask our staff at the counter to set one.'); }
      if (await N.memberHash(p, pin) !== c.pin) { fail(); btn.disabled = false; btn.textContent = 'Sign in'; return err('Phone number or PIN is wrong.'); }
      N.ls.del(LOCK_KEY); M.enter(c);
    } catch (ex) { btn.disabled = false; btn.textContent = 'Sign in'; err(N.errMsg(ex)); }
  };
};
M.join = () => {
  const L = N.conf().loyalty;
  M.root.innerHTML = shell(`${brand()}
    <div class="mem-hero"><h1>Join Naseyan Rewards</h1><p class="muted">Earn 1 point for every ${N.rp(L.earn)} you spend at any Naseyan outlet. Collect stamps, finish missions, unlock free drinks.</p></div>
    <form class="col" id="m-join" novalidate>
      <label class="field"><span>Phone number (WhatsApp)</span><input class="input num" id="j-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0812 3456 7890"></label>
      <label class="field"><span>Your name</span><input class="input" id="j-name" autocomplete="given-name"></label>
      <label class="field"><span>Birthday (optional)</span><input class="input" id="j-bday" type="date"></label>
      <div class="grid2"><label class="field"><span>Create a 6-digit PIN</span><input class="input num" id="j-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
      <label class="field"><span>Repeat PIN</span><input class="input num" id="j-pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label></div>
      <label class="check"><input type="checkbox" id="j-optin" checked> Send me Naseyan promos on WhatsApp</label>
      <div class="pin-err" id="j-err"></div>
      <button class="btn primary lg block" type="submit">Create my card</button>
      <button class="btn ghost block" type="button" id="j-back">I already have a card</button>
    </form>`);
  const err = t => { M.root.querySelector('#j-err').textContent = t; };
  M.root.querySelector('#j-back').onclick = () => M.signin();
  M.root.querySelector('#m-join').onsubmit = async e => {
    e.preventDefault();
    const v = id => M.root.querySelector(id).value.trim();
    const p = N.phone(v('#j-phone')), name = v('#j-name'), pin = v('#j-pin');
    if (p.length < 9) return err('Enter a valid phone number.');
    if (!name) return err('Enter your name.');
    if (!/^\d{6}$/.test(pin)) return err('The PIN must be 6 digits.');
    if (/^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return err('Choose a PIN that is harder to guess.');
    if (pin !== v('#j-pin2')) return err('The two PINs do not match.');
    const btn = M.root.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const ex = await N.getCust(p);
      if (ex) { btn.disabled = false; btn.textContent = 'Create my card'; return err(ex.pin ? 'This number is already a member. Go back and sign in.' : 'This number is already a member. Ask our staff at the counter to set your PIN.'); }
      const doc = { name, phone: p, bday: N.fromInput(v('#j-bday')) || null, optin: M.root.querySelector('#j-optin').checked, joined: Date.now(), joinedAt: 'web', points: 0, life: { spend: 0, visits: 0 }, stamps: {}, mis: {}, rewards: [], hist: [], pin: await N.memberHash(p, pin), code: await N.newMemberCode() };
      await N.custRef(p).set(doc);
      N.toast('Welcome to Naseyan Rewards!');
      M.enter({ id: p, ...doc });
    } catch (ex2) { btn.disabled = false; btn.textContent = 'Create my card'; err(N.errMsg(ex2)); }
  };
};

/* ---------- signed-in views ---------- */
M.draw = () => {
  const c = M.c; if (!c) return;
  const tabs = [['card', 'Card', 'grid'], ['rewards', 'Rewards', 'gift'], ['history', 'History', 'receipt'], ['profile', 'Profile', 'user']];
  M.root.innerHTML = `<div class="mem mem-in">${brand()}<div id="m-view"></div></div>
    <nav class="mem-nav">${tabs.map(([k, l, i]) => `<button class="${M.tab === k ? 'on' : ''}" data-mtab="${k}">${ic(i)}<span>${l}</span></button>`).join('')}</nav>`;
  M.root.querySelectorAll('[data-mtab]').forEach(b => b.onclick = () => { M.tab = b.dataset.mtab; M.draw(); window.scrollTo(0, 0); });
  const v = M.root.querySelector('#m-view');
  ({ card: M.vCard, rewards: M.vRewards, history: M.vHistory, profile: M.vProfile })[M.tab](v, c);
};
const rewardsReady = c => (c.rewards || []).filter(r => !r.exp || r.exp > Date.now());
M.vCard = (v, c) => {
  const L = N.conf().loyalty;
  const cards = Object.values(N.stampcards).filter(s => s.active !== false);
  const mis = Object.values(N.missions).filter(N.missionLive);
  const rw = rewardsReady(c);
  v.innerHTML = `<section class="mem-card">
      <div class="row"><div class="grow"><span class="eyebrow">Member</span><h2>${esc(c.name)}</h2></div><span class="mem-code mono">${esc(c.code || '······')}</span></div>
      <div class="mem-pts"><b class="num">${N.rpn(c.points || 0)}</b><span>points · worth ${N.rp((c.points || 0) * L.value)}</span></div>
      <div class="row small"><span class="grow">${c.life?.visits || 0} visits</span><span>Since ${c.joined ? new Date(c.joined).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'}</span></div>
    </section>
    <section class="mem-sec"><div class="row"><h3 class="grow">Show at the counter</h3></div>
      <div class="mem-qr"><div id="m-qr"></div><div class="col" style="gap:4px"><span class="small muted">Member code</span><b class="mono" style="font-size:1.6rem;letter-spacing:.12em">${esc(c.code || '…')}</b><span class="small muted">or tell the cashier your phone number</span></div></div></section>
    ${rw.length ? `<button class="mem-sec mem-alert" data-mtab2="rewards">${ic('gift')} <span class="grow"><b>${rw.length} reward${rw.length > 1 ? 's' : ''} ready to use</b><br><span class="small">${esc(rw.slice(0, 2).map(N.rewardLabel).join(', '))}</span></span>${ic('back', 'flip')}</button>` : ''}
    ${cards.map(sc => { const n = c.stamps?.[sc.id] || 0; return `<section class="mem-sec"><div class="row"><h3 class="grow">${esc(sc.name)}</h3><span class="small muted">${n} of ${sc.need}</span></div>
      <div class="stamps big">${Array.from({ length: sc.need }, (_, i) => `<i class="${i < n ? 'on' : ''}">${i < n ? '✓' : i === sc.need - 1 ? '★' : ''}</i>`).join('')}</div>
      <p class="small muted">${sc.need - n} more ${(sc.cats || []).map(id => N.cats[id]?.name || '').filter(Boolean).join(' or ').toLowerCase() || 'purchases'} for ${esc(N.rewardLabel(sc.reward || {}))}.</p></section>`; }).join('')}
    ${mis.length ? `<section class="mem-sec"><h3>Missions</h3>${mis.map(m => { const st = c.mis?.[m.id + '_' + N.period(m.per)] || { p: 0 }; const pct = Math.min(100, Math.round(st.p / (m.target || 1) * 100)); return `<div class="col" style="gap:6px"><div class="row"><b class="grow">${esc(m.name)}</b>${st.done ? '<span class="badge ok">Done</span>' : `<span class="small muted num">${m.metric === 'spend' ? N.rpn(st.p) + ' / ' + N.rpn(m.target) : st.p + ' / ' + m.target}</span>`}</div>${m.desc ? `<span class="small muted">${esc(m.desc)} · reward: ${m.reward?.k === 'points' ? m.reward.v + ' points' : esc(N.rewardLabel(m.reward || {}))}</span>` : ''}<div class="bar"><i style="width:${pct}%"></i></div></div>`; }).join('')}<p class="small muted">Missions reset ${[...new Set(mis.map(m => N.periodLabel(m.per).replace('this ', 'every ')))].join(' or ')}.</p></section>` : ''}`;
  v.querySelector('[data-mtab2]')?.addEventListener('click', () => { M.tab = 'rewards'; M.draw(); });
  try { if (c.code) new QRCode(v.querySelector('#m-qr'), { text: 'NSY:' + c.code, width: 112, height: 112, correctLevel: QRCode.CorrectLevel.M, colorDark: '#111', colorLight: '#fff' }); } catch { }
};
M.vRewards = (v, c) => {
  const L = N.conf().loyalty, rw = rewardsReady(c);
  const promos = Object.values(N.promos).filter(p => p.active !== false && (!p.end || p.end >= N.dkey()));
  v.innerHTML = `<section class="mem-sec"><h3>Ready to use</h3>${rw.length ? rw.map(r => `<div class="mem-voucher"><div class="grow"><b>${esc(N.rewardLabel(r))}</b><div class="small muted">${r.src ? 'From ' + esc(r.src) : ''}${r.exp ? ' · use by ' + new Date(r.exp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</div></div>${ic('gift')}</div>`).join('') + '<p class="small muted">Tell the cashier you want to use a reward when you pay.</p>' : '<p class="muted">No rewards yet. Keep collecting stamps and finishing missions.</p>'}</section>
    <section class="mem-sec"><h3>Use your points</h3><p>You have <b class="num">${N.rpn(c.points || 0)}</b> points. Each point is worth ${N.rp(L.value)} off your bill${L.min ? `, from ${L.min} points` : ''}.</p>${(c.points || 0) >= L.min ? `<p class="small muted">Ask the cashier to redeem points before you pay.</p>` : `<div class="bar"><i style="width:${Math.min(100, Math.round((c.points || 0) / L.min * 100))}%"></i></div><p class="small muted">${L.min - (c.points || 0)} more points until you can redeem.</p>`}</section>
    ${promos.length ? `<section class="mem-sec"><h3>Running now</h3>${promos.map(p => `<div class="mem-voucher"><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${[p.k === 'pct' ? p.v + '% off' : N.rp(p.v) + ' off', p.cats?.length ? p.cats.map(id => N.cats[id]?.name).filter(Boolean).join(', ') : '', p.from && p.to ? p.from + '–' + p.to : '', p.min ? 'min. ' + N.rp(p.min) : ''].filter(Boolean).join(' · ')}</div></div>${p.code ? `<span class="mono badge car">${esc(p.code)}</span>` : ''}</div>`).join('')}</section>` : ''}
    <section class="mem-sec"><h3>How it works</h3><ul class="mem-list"><li>Earn 1 point for every ${N.rp(L.earn)} spent, after discounts.</li><li>Show your member code or phone number before paying.</li>${Object.values(N.stampcards).filter(s => s.active !== false).map(s => `<li>${esc(s.name)}: ${s.need} stamps unlock ${esc(N.rewardLabel(s.reward || {}))}.</li>`).join('')}<li>Points and rewards work at every Naseyan outlet.</li></ul></section>`;
};
M.vHistory = (v, c) => {
  const h = c.hist || [];
  v.innerHTML = `<section class="mem-sec"><h3>Your visits</h3>${h.length ? `<div class="list">${h.map(x => { const net = (x.pe || 0) - (x.pr || 0); return `<div class="li" style="cursor:default"><div class="grow"><b>${x.no ? 'Order ' + esc(x.no) : esc(x.note || 'Account update')}</b><div class="small muted">${N.dt(x.t)}${x.o && N.outlets[x.o] ? ' · ' + esc(N.outlets[x.o].name) : ''}${x.no && x.note ? ' · ' + esc(x.note) : ''}</div></div><div style="text-align:right">${x.tot ? `<div class="num small">${N.rp(x.tot)}</div>` : ''}${net ? `<span class="badge ${net > 0 ? 'ok' : 'car'}">${net > 0 ? '+' : ''}${net} pts</span>` : ''}</div></div>`; }).join('')}</div><p class="small muted">Shows your last ${h.length} visits.</p>` : '<p class="muted">No visits yet. Your purchases appear here after you pay as a member.</p>'}</section>`;
};
M.vProfile = (v, c) => {
  v.innerHTML = `<section class="mem-sec"><h3>Your details</h3>
      <label class="field"><span>Name</span><input class="input" id="p-name" value="${esc(c.name)}"></label>
      <label class="field"><span>Phone</span><input class="input num" value="${esc(N.phoneFmt(c.id))}" disabled></label>
      <label class="field"><span>Birthday</span><input class="input" id="p-bday" type="date" value="${c.bday ? N.toInput(c.bday) : ''}"></label>
      <label class="check"><input type="checkbox" id="p-optin" ${c.optin ? 'checked' : ''}> Send me Naseyan promos on WhatsApp</label>
      <button class="btn primary" id="p-save">Save changes</button></section>
    <section class="mem-sec"><h3>Change PIN</h3>
      <div class="grid3"><label class="field"><span>Current PIN</span><input class="input num" id="p-old" type="password" inputmode="numeric" maxlength="6"></label><label class="field"><span>New PIN</span><input class="input num" id="p-new" type="password" inputmode="numeric" maxlength="6"></label><label class="field"><span>Repeat new PIN</span><input class="input num" id="p-new2" type="password" inputmode="numeric" maxlength="6"></label></div>
      <div class="pin-err" id="p-err"></div><button class="btn" id="p-pin">Update PIN</button></section>
    <section class="mem-sec"><button class="btn block" id="p-out">${ic('out')} Sign out</button><p class="small muted">To change your phone number or close your membership, talk to our staff.</p></section>`;
  const write = async patch => { try { await N.custRef(c.id).update(patch); return true; } catch (e) { N.toast(N.errMsg(e), 'bad'); return false; } };
  v.querySelector('#p-save').onclick = async () => {
    const name = v.querySelector('#p-name').value.trim(); if (!name) return N.toast('Name cannot be empty', 'bad');
    if (await write({ name, bday: N.fromInput(v.querySelector('#p-bday').value) || null, optin: v.querySelector('#p-optin').checked })) N.toast('Saved');
  };
  v.querySelector('#p-pin').onclick = async () => {
    const err = t => { v.querySelector('#p-err').textContent = t; };
    const o = v.querySelector('#p-old').value, n = v.querySelector('#p-new').value;
    if (await N.memberHash(c.id, o) !== c.pin) return err('Current PIN is wrong.');
    if (!/^\d{6}$/.test(n)) return err('The new PIN must be 6 digits.');
    if (n !== v.querySelector('#p-new2').value) return err('The new PINs do not match.');
    const h = await N.memberHash(c.id, n);
    N.ls.set('member', { p: c.id, h });
    if (await write({ pin: h })) { err(''); N.toast('PIN updated'); }
  };
  v.querySelector('#p-out').onclick = () => M.signout();
};
})();
