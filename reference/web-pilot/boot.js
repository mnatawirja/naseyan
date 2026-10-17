'use strict';
/* Routing between launcher, POS, ticket screens, back office and table QR ordering. */
const App = window.App = { root: document.getElementById('app') };

App.isMemberEntry = () => /^#(member|rewards)$/.test(location.hash) || (() => { try { return localStorage.getItem('nsy.memberLock') === 'true'; } catch { return false; } })();
App.fail = msg => {
  const mem = App.isMemberEntry();
  App.root.innerHTML = `<div class="boot"><div class="col" style="align-items:center;max-width:440px"><div class="mark">Naseyan<i>.</i>${mem ? ' Rewards' : 'POS'}</div><p>${mem ? 'Naseyan Rewards is not available right now. Please ask our staff.' : msg}</p></div></div>`;
};
if (App.isMemberEntry()) {
  document.title = 'Naseyan Rewards';
  App.root.innerHTML = '<div class="boot"><div class="col" style="align-items:center"><div class="mark">Naseyan<i>.</i> Rewards</div><p class="muted">Loading your card…</p></div></div>';
}

App.route = () => {
  N.closeAll(); N.listeners.clear();
  const h = (location.hash || '').slice(1);
  if (h === 'member' || h === 'rewards') N.ls.set('memberLock', true);
  if (App.memberLocked()) {
    if (h !== 'member' && h !== 'rewards') { try { history.replaceState(null, '', '#member'); } catch { } }
    document.title = 'Naseyan Rewards';
    return M.start(App.root);
  }
  const qr = h.match(/^qr\.([A-Za-z0-9_~-]+)\.(\d+)$/);
  if (qr) return P.qrOrder(App.root, qr[1], +qr[2]);
  if (!Object.values(N.staff).some(s => s.role === 'manager')) return App.setup();
  const dev = N.ls.get('dev');
  if (!dev || !N.outlets[dev.o] || !dev.mode) return App.launcher();
  if (dev.mode === 'pos') return P.start(App.root, dev);
  if (dev.mode === 'bar' || dev.mode === 'kitchen') return P.station(App.root, dev);
  if (dev.mode === 'bo') return App.openBO();
  App.launcher();
};

/* A device opened on the member link stays in Rewards until a manager unlocks it. */
App.memberLocked = () => !!N.ls.get('memberLock', false);
App.unlockMember = async () => {
  const s = await N.pin({ title: 'Staff only', sub: 'Manager PIN to leave the member page', verify: pin => N.findByPin(pin, s => s.role === 'manager') });
  if (!s) return;
  N.ls.del('memberLock'); N.ls.del('member');
  try { history.replaceState(null, '', location.pathname + location.search); } catch { }
  document.title = 'Naseyan POS';
  App.launcher(true);
};

App.launcher = async (trusted = false) => {
  N.closeAll(); N.listeners.clear();
  const dev = N.ls.get('dev') || {};
  const outlets = N.outletsSorted();
  App.root.innerHTML = `<div class="launch"><div class="launch-in">
    <div><div class="mark" style="font-size:1.6rem">${N.esc(N.conf().brand)}<i>.</i></div><h1 style="margin-top:6px">Set up this device</h1><p class="muted" style="margin-top:6px">Pick what this tablet does. You can change it later from the till with a manager PIN.</p></div>
    <div class="grid2">
      <label class="field"><span>Outlet</span><select class="input" id="l-outlet">${outlets.map(o => `<option value="${o.id}" ${dev.o === o.id ? 'selected' : ''}>${N.esc(o.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Till letter</span><select class="input" id="l-code">${'ABCDEFGH'.split('').map(c => `<option ${dev.code === c ? 'selected' : ''}>${c}</option>`).join('')}</select><small class="muted">Each till at one outlet needs its own letter. Order numbers start with it.</small></label>
    </div>
    <div class="tiles">
      <button class="tile" data-mode="pos">${N.ic('cash')}<b>Point of sale</b><span class="small muted">Take counter, table, QR and delivery orders. Payments, shifts, members.</span></button>
      <button class="tile" data-mode="bar">${N.ic('coffee')}<b>Bar ticket screen</b><span class="small muted">Shows drink tickets as they are sent. Tap to mark done.</span></button>
      <button class="tile" data-mode="kitchen">${N.ic('chef')}<b>Kitchen ticket screen</b><span class="small muted">Shows food tickets as they are sent.</span></button>
      <button class="tile" data-mode="bo">${N.ic('chart')}<b>Back office</b><span class="small muted">Reports, menu, stock, loyalty, staff, outlets.</span></button>
    </div>
    ${outlets.length ? '' : '<div class="note">No outlets yet. Open Back office → Outlets to add one.</div>'}
  </div></div>`;
  App.root.querySelectorAll('[data-mode]').forEach(b => b.onclick = async () => {
    const mode = b.dataset.mode;
    if (mode === 'bo') return App.openBO();
    const o = App.root.querySelector('#l-outlet').value, code = App.root.querySelector('#l-code').value;
    if (!o) return N.toast('Add an outlet first', 'bad');
    if (!trusted) {
      const s = await N.pin({ title: 'Manager PIN', sub: 'Required to set up a device', verify: pin => N.findByPin(pin, s => s.role === 'manager') });
      if (!s) return;
    }
    N.ls.set('dev', { o, code, mode });
    App.route();
  });
};

App.openBO = async staff => {
  N.closeAll();
  if (!staff) {
    App.root.innerHTML = `<div class="boot"><div class="col" style="align-items:center"><div class="mark">${N.esc(N.conf().brand)}<i>.</i> Back office</div><p class="muted">Sign in with a manager PIN.</p><button class="btn primary" id="bo-signin">${N.ic('lock')} Sign in</button><button class="btn ghost sm" id="bo-back">Back</button></div></div>`;
    const ask = async () => {
      const s = await N.pin({ title: 'Back office', sub: 'Manager PIN', verify: pin => N.findByPin(pin, s => s.role === 'manager') });
      if (s) B.start(App.root, s);
    };
    App.root.querySelector('#bo-signin').onclick = ask;
    App.root.querySelector('#bo-back').onclick = () => { const d = N.ls.get('dev'); if (d?.mode === 'bo') N.ls.set('dev', { ...d, mode: null }); App.route(); };
    ask();
    return;
  }
  B.start(App.root, staff);
};
App.leaveBO = () => {
  const d = N.ls.get('dev');
  if (d?.mode === 'bo') N.ls.set('dev', { ...d, mode: null });
  App.route();
};

App.setup = () => {
  App.root.innerHTML = `<div class="launch"><div class="launch-in panel" style="max-width:560px">
    <div class="mark" style="font-size:1.4rem">Naseyan<i>.</i>POS</div><h1>First-time setup</h1>
    <p class="muted">Create the brand, the first outlet and the first manager. Everything else is done in Back office.</p>
    <form id="setup" class="grid2" novalidate>
      <label class="field"><span>Brand name</span><input class="input" id="s-brand" value="Naseyan"></label>
      <label class="field"><span>First outlet</span><input class="input" id="s-outlet" placeholder="e.g. Naseyan Senopati"></label>
      <label class="field"><span>Manager name</span><input class="input" id="s-name"></label>
      <label class="field"><span>Manager PIN (4–6 digits)</span><input class="input num" id="s-pin" inputmode="numeric" maxlength="6"></label>
      <button class="btn primary lg" style="grid-column:1/-1" type="submit">Create</button>
    </form></div></div>`;
  App.root.querySelector('#setup').onsubmit = async e => {
    e.preventDefault();
    const v = id => App.root.querySelector(id).value.trim();
    const pin = v('#s-pin');
    if (!v('#s-outlet') || !v('#s-name') || !/^\d{4,6}$/.test(pin)) return N.toast('Fill in every field. The PIN must be 4 to 6 digits.', 'bad');
    try {
      const oid = 'o' + N.uid(5), sid = 's' + N.uid(6);
      await N.db.doc('cfg/main').set({ ...N.DEF, brand: v('#s-brand') || 'Naseyan' });
      await N.db.doc('outlets/' + oid).set({ name: v('#s-outlet'), code: 'O1', tax: 10, taxName: 'PB1', svc: 0, taxIncl: false, tables: ['T1', 'T2', 'T3', 'T4'], appr: { on: true, discPct: 10 }, float: 500000, active: true });
      await N.db.doc('staff/' + sid).set({ name: v('#s-name'), role: 'manager', pin: await N.hash(sid, pin), outlets: [], active: true });
      N.toast('Setup complete');
    } catch (err) { N.toast(N.errMsg(err), 'bad'); }
  };
};

(async () => {
  try { await N.connect(); }
  catch (e) {
    return App.fail(e === 'nodb'
      ? 'Store data is not available here. Open this app on claude.ai while signed in to an account that has access to it.'
      : 'Could not load store data: ' + N.esc(N.errMsg(e)));
  }
  N.listeners.add(() => { });
  let last = null;
  const rerouteIfNeeded = () => {
    const sig = Object.values(N.staff).some(s => s.role === 'manager');
    if (last === false && sig) App.route();
    last = sig;
  };
  setInterval(rerouteIfNeeded, 1500);
  App.route();
  window.addEventListener('hashchange', App.route);
})();
