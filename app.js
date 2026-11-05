/* =====================================================================
   Shreedeep Solutions — Attendance & Payroll  app.js  v2.0
   Modes: admin (partners), staff (own phone), kiosk (office PC)
   ===================================================================== */
'use strict';
const VERSION = '3.0';
const ROOT = 'att';
const EG = window.Engine;
const { pad, r2, istDate, istHM, addDays, addMonths, daysIn, mkOf, dsDow, toMin, arr } = EG;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ---------------- tiny helpers ---------------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = id => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
const monthName = mk => MON[+mk.slice(5) - 1] + ' ' + mk.slice(0, 4);
const fmtDate = ds => ds ? ds.slice(8) + '-' + ds.slice(5, 7) + '-' + ds.slice(0, 4) : '';
const fmtDateDow = ds => ds ? fmtDate(ds) + ' (' + DOW[dsDow(ds)] + ')' : '';
const fmtDT = ms => ms ? fmtDate(istDate(ms)) + ' ' + istHM(ms) : '';
const inr = n => '₹ ' + Math.round(n || 0).toLocaleString('en-IN');
const num = n => Math.round(n || 0).toLocaleString('en-IN');
const fmtH = h => { if (!h) return ''; const m = Math.round(h * 60); return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm'; };
const uid8 = () => Math.random().toString(36).slice(2, 10);
function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 2800); }
function numWords(n) {
  n = Math.round(Math.abs(n || 0)); if (n === 0) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = x => x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '');
  const three = x => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '');
  const out = []; const cr = Math.floor(n / 1e7); n %= 1e7; const lk = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1e3); n %= 1e3;
  if (cr) out.push(three(cr) + ' Crore'); if (lk) out.push(two(lk) + ' Lakh'); if (th) out.push(two(th) + ' Thousand'); if (n) out.push(three(n));
  return out.join(' ');
}
function distM(lat1, lon1, lat2, lon2) {
  const R = 6371000, t = x => x * Math.PI / 180; const dLat = t(lat2 - lat1), dLon = t(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(lat1)) * Math.cos(t(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
function randToken(n) { const a = new Uint8Array(n || 18); crypto.getRandomValues(a); return Array.from(a, b => ('0' + b.toString(16)).slice(-2)).join(''); }
async function getIP() {
  const tryF = async (u, json) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 5000); try { const r = await fetch(u, { signal: c.signal, cache: 'no-store' }); return json ? (await r.json()).ip : (await r.text()).trim(); } finally { clearTimeout(t); } };
  try { return await tryF('https://api.ipify.org?format=json', true); } catch (e) { }
  try { return await tryF('https://ipv4.icanhazip.com', false); } catch (e) { }
  return '';
}
function fileToDataURL(file, maxW, quality) {
  return new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onerror = () => rej(new Error('Could not read file'));
    rd.onload = () => {
      if (!maxW || !/^image\//.test(file.type)) return res(rd.result);
      const img = new Image(); img.onload = () => {
        const sc = Math.min(1, maxW / img.width); const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', quality || 0.7));
      }; img.onerror = () => res(rd.result); img.src = rd.result;
    };
    rd.readAsDataURL(file);
  });
}

/* ---------------- global state ---------------- */
const APP = { mode: null, view: null, sub: null, date: null, month: null, modal: null, pending: false, locked: false, lastAct: Date.now(), online: navigator.onLine, charts: [], uid: null, sid: null, me: null, demo: false };
let FB = null, DATA = {}, E = null, SUBS = [], serverOffset = 0;
const nowMs = () => Date.now() + serverOffset;
const ACT = {}, CHG = {}, VIEWS = {}, AFTER = [];

/* ---------------- Firebase layer ---------------- */
async function loadFirebase() {
  const c = window.CFG.firebase;
  if (c.apiKey && c.databaseURL) {
    for (const f of ['app', 'auth', 'database']) await loadScript(`https://www.gstatic.com/firebasejs/10.12.2/firebase-${f}-compat.js`);
  } else { APP.demo = true; await loadScript('mock-firebase.js'); }
}
function fbApp(name) {
  const ex = firebase.apps.find(a => a.name === name);
  const app = ex || firebase.initializeApp(window.CFG.firebase, name);
  const o = { name, app, auth: app.auth(), db: app.database() };
  o.db.ref('.info/serverTimeOffset').on('value', s => { serverOffset = s.val() || 0; });
  o.db.ref('.info/connected').on('value', s => { const on = !!s.val(); if (on !== APP.fbOnline) { APP.fbOnline = on; renderOfflineBar(); } });
  return o;
}
const TS = () => firebase.database.ServerValue.TIMESTAMP;
const ref = p => FB.db.ref(ROOT + (p ? '/' + p : ''));
const dbSet = (p, v) => ref(p).set(v === undefined ? null : v);
const dbUpdate = o => ref().update(o);
const dbPushKey = p => ref(p).push().key;
const dbOnce = async p => (await ref(p).once('value')).val();
function setIn(obj, path, v) {
  let o = obj; for (let i = 0; i < path.length - 1; i++) { if (typeof o[path[i]] !== 'object' || o[path[i]] === null) o[path[i]] = {}; o = o[path[i]]; }
  const k = path[path.length - 1];
  if (v == null) { if (path.length === 1) o[k] = k === 'settings' ? null : {}; else delete o[k]; } else o[k] = v;
}
const SUBCACHE = {};
function sub(path, target, query) {
  let r = ref(path); if (query) r = query(r);
  const key = path + '|' + (target || []).join('/');
  const cb = s => {
    const v = s.val(); const js = JSON.stringify(v);
    if (SUBCACHE[key] === js) return; // nothing really changed → no repaint
    SUBCACHE[key] = js; setIn(DATA, target || path.split('/'), v); scheduleRender();
  };
  r.on('value', cb, err => { console.warn('read denied', path, err.message); });
  SUBS.push(() => { r.off('value', cb); delete SUBCACHE[key]; });
}
function unsubAll() { SUBS.forEach(f => { try { f(); } catch (e) { } }); SUBS = []; DATA = {}; }
async function log(action, detail) {
  try { await ref('log').push({ at: TS(), by: (APP.me && APP.me.name) || APP.mode || 'system', action, detail: String(detail || '').slice(0, 500) }); } catch (e) { }
}

/* ---------------- render loop ---------------- */
let renderTimer = null;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(() => { if (editingNow()) { APP.pending = true; return; } render(); }, 60); }
function editingNow() {
  const a = document.activeElement;
  return a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) && !['button', 'checkbox', 'file', 'radio'].includes(a.type) && (a.closest('main') || a.closest('#modal'));
}
document.addEventListener('focusout', () => setTimeout(() => { if (APP.pending && !editingNow()) { APP.pending = false; render(); } }, 80));
function rebuild() { E = EG.create(DATA, nowMs()); }
function render() {
  rebuild();
  APP.charts.forEach(c => { try { c.destroy(); } catch (e) { } }); APP.charts = [];
  const fn = { admin: renderAdmin, staff: renderStaff, kiosk: renderKiosk }[APP.mode] || renderLanding;
  APP._painted = false;
  try { fn(); if (!APP._painted) APP.shellKey = null; } catch (e) { console.error(e); APP.shellKey = null; $('#app').innerHTML = `<div class="center card"><div class="err">Something went wrong: ${esc(e.message)}</div><button class="btn" onclick="location.reload()">Reload</button></div>`; }
  if (APP.modal && APP.modal.refresh) { try { APP.modal.refresh(); } catch (e) { } }
  AFTER.splice(0).forEach(f => { try { f(); } catch (e) { console.warn(e); } });
  renderOfflineBar();
  cacheData();
}
/* Paint keeps the app shell (sidebar / tab bar / header) and only swaps the content.
   Data updates keep the scroll position; changing section scrolls to top. */
function paint(shellKey, shellFn, mainHTML) {
  const app = $('#app');
  const same = APP.shellKey === shellKey && document.getElementById('main');
  APP._painted = true;
  if (!same) { app.innerHTML = shellFn(); APP.shellKey = shellKey; }
  const main = document.getElementById('main');
  const viewKey = APP.mode + '|' + APP.view + '|' + (APP.sub || '');
  const keep = same && APP.viewKey === viewKey;
  const y = window.scrollY, my = main.scrollTop;
  const tws = Array.from(main.querySelectorAll('.tw,.keep-scroll')).map(t => [t.scrollLeft, t.scrollTop]);
  main.innerHTML = mainHTML;
  if (keep) {
    window.scrollTo(0, y); main.scrollTop = my;
    Array.from(main.querySelectorAll('.tw,.keep-scroll')).forEach((t, i) => { if (tws[i]) { t.scrollLeft = tws[i][0]; t.scrollTop = tws[i][1]; } });
  } else if (APP.viewKey) window.scrollTo(0, 0);
  APP.viewKey = viewKey;
  $$('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.v === APP.view || (b.dataset.v === 'more' && APP.moreViews && APP.moreViews.includes(APP.view))));
  $$('[data-badge]').forEach(el => { const n = (APP.badges || {})[el.dataset.badge] || 0; el.textContent = n; el.classList.toggle('hidden', !n); });
  $$('[data-title]').forEach(el => { el.textContent = APP.title || ''; });
}
function renderOfflineBar() {
  let b = $('#offbar');
  const off = !navigator.onLine || APP.fbOnline === false;
  if (off && !b) { b = document.createElement('div'); b.id = 'offbar'; b.className = 'offline'; document.body.prepend(b); }
  if (b) { if (off) b.textContent = 'Offline — showing last saved data. Changes will sync when internet returns. Check-in needs internet.'; else b.remove(); }
}
window.addEventListener('online', renderOfflineBar); window.addEventListener('offline', renderOfflineBar);
function cacheData() {
  if (!APP.mode || APP.mode === 'kiosk') return;
  clearTimeout(cacheData._t);
  cacheData._t = setTimeout(() => { try { const d = Object.assign({}, DATA); delete d.assets; delete d.log; localStorage.setItem('ss_att_cache_' + APP.mode, JSON.stringify(d)); } catch (e) { } }, 1500);
}
function loadCache(mode) { try { const d = JSON.parse(localStorage.getItem('ss_att_cache_' + mode) || 'null'); if (d) DATA = d; } catch (e) { } }

/* ---------------- modal ---------------- */
function openModal(html, opts) { APP.modal = Object.assign({ html }, opts || {}); showModal(); }
const IC = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  tray: '<path d="M3 13l3-8h12l3 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  rupee: '<path d="M7 4h11M7 9h11M7 4c6 0 8 1.7 8 4.5S13 13 8 13l8 8"/>',
  chart: '<path d="M5 20V11M11 20V5M17 20v-6M3 20h18"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17.5 14c2.4 0 4 1.6 4.3 4.5"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M11 18h2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  leave: '<path d="M3 21h18M12 21V10"/><path d="M12 10C9.5 6 5.5 5.5 3 7.5c3.3-.2 6.3.4 9 2.5zM12 10c2.5-4 6.5-4.5 9-2.5-3.3-.2-6.3.4-9 2.5z"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v.01M14 20.5h.01M17.5 21H21v-3.5"/>',
  moon: '<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.6 6.6 0 0 0 10 10z"/>',
  out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
  chat: '<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1.1-4.4A8.5 8.5 0 1 1 20.5 12z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
};
const ic = n => `<svg class="i" viewBox="0 0 24 24">${IC[n] || ''}</svg>`;
function showModal() {
  const m = $('#modal'); if (!APP.modal) return closeModal();
  const h = APP.modal.build ? APP.modal.build() : APP.modal.html;
  m.innerHTML = `<div class="box ${APP.modal.wide ? 'wide' : ''}">${h}</div>`; m.classList.remove('hidden');
  if (APP.modal.after) APP.modal.after();
}
function closeModal() { const m = $('#modal'); if (APP.modal && APP.modal.onClose) APP.modal.onClose(); APP.modal = null; m.classList.add('hidden'); m.innerHTML = ''; }
document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal' && !(APP.modal && APP.modal.sticky)) closeModal(); });
ACT.closeModal = () => closeModal();

/* ---------------- events ---------------- */
document.addEventListener('click', async e => {
  APP.lastAct = Date.now();
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const fn = ACT[b.dataset.act]; if (!fn) return;
  e.preventDefault();
  try { if (APP.mode) rebuild(); await fn(b, e); } catch (err) { console.error(err); toast('Error: ' + (err.code === 'PERMISSION_DENIED' || /permission/i.test(err.message) ? 'not allowed' : err.message)); }
});
document.addEventListener('change', async e => {
  const el = e.target.closest('[data-chg]'); if (!el) return;
  const fn = CHG[el.dataset.chg]; if (!fn) return;
  try { if (APP.mode) rebuild(); await fn(el, e); } catch (err) { console.error(err); toast('Error: ' + err.message); }
});
['keydown', 'touchstart', 'mousemove'].forEach(ev => document.addEventListener(ev, () => { APP.lastAct = Date.now(); }, { passive: true }));

/* ---------------- theme (dark mode) ---------------- */
function applyTheme() {
  const t = localStorage.getItem('ss_att_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#000000' : '#f2f2f7';
}
ACT.toggleTheme = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('ss_att_theme', t); applyTheme(); render(); };
applyTheme();

/* ---------------- PWA: service worker, install, push ---------------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; scheduleRender(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast('App installed'); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const inAppBrowser = () => /\bwv\b|FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat/i.test(navigator.userAgent) || (isIOS() && !/Safari/i.test(navigator.userAgent) && !navigator.standalone);
function installButtonHTML(big) {
  if (isStandalone()) return '<span class="ok">✓ Installed as app</span>';
  return `<button class="btn ${big ? 'big' : 's'} o" data-act="install">${ic('down')} Install app</button>`;
}
ACT.install = async () => {
  if (installEvt) { installEvt.prompt(); const c = await installEvt.userChoice; installEvt = null; if (c.outcome === 'accepted') toast('Installing…'); render(); return; }
  const https = location.protocol === 'https:' || location.hostname === 'localhost';
  const ua = navigator.userAgent; const android = /android/i.test(ua); const edge = /Edg\//.test(ua); const chrome = /Chrome\//.test(ua) && !edge;
  let steps;
  if (!https) steps = ['This page is not opened from the website. Open the <b>https://</b> link of the app (GitHub Pages) — a downloaded file or preview can never be installed.'];
  else if (inAppBrowser()) steps = ['You are inside another app\'s browser (WhatsApp / Instagram etc.), which cannot install apps.', 'Tap <b>⋮</b> (or the compass/Safari icon) → <b>Open in Chrome</b> / <b>Open in Safari</b>.', 'Then tap Install again.'];
  else if (isIOS()) steps = ['Open this page in <b>Safari</b> (Chrome on iPhone cannot install).', 'Tap the <b>Share</b> button (square with ↑ arrow) at the bottom.', 'Scroll and tap <b>Add to Home Screen</b> → <b>Add</b>.', 'Open “SS Attendance” from your home screen.'];
  else if (android) steps = ['Tap <b>⋮</b> (top-right in Chrome).', 'Tap <b>Install app</b> or <b>Add to Home screen</b> → <b>Install</b>.', 'If you only see “Add shortcut”, update Chrome from Play Store and reload this page once.'];
  else if (chrome || edge) steps = ['Click the <b>install icon</b> at the right end of the address bar (monitor with ↓ arrow).', 'Or menu <b>⋮ → Cast, save and share → Install page as app</b> (Chrome) / <b>Apps → Install this site</b> (Edge).'];
  else steps = ['Use Google Chrome or Microsoft Edge on computers, Chrome on Android, Safari on iPhone.'];
  openModal(`<h3>Install the app</h3><div class="steps">${steps.map((t, i) => `<div class="step"><span class="n">${i + 1}</span><div>${t}</div></div>`).join('')}</div>
    <p class="muted" style="margin-top:14px">After installing, the app opens full-screen like any other app and can send notifications.</p><button class="btn g" data-act="closeModal">OK</button>`);
};
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js', { scope: './' }).catch(e => console.warn('SW', e));

function b64ToU8(b64) { const p = '='.repeat((4 - b64.length % 4) % 4); const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); }
async function enablePush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return toast(isIOS() ? 'On iPhone, install the app to Home Screen first, then enable notifications from inside it.' : 'This browser does not support notifications', 5000);
  if (!window.CFG.vapidPublicKey) return toast('Notifications are not configured yet (VAPID key missing — see README)', 5000);
  const perm = await Notification.requestPermission(); if (perm !== 'granted') return toast('Notifications were blocked');
  const reg = await navigator.serviceWorker.ready;
  let s = await reg.pushManager.getSubscription();
  if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(window.CFG.vapidPublicKey) });
  const key = btoa(s.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(-40);
  await dbSet(`pushSubs/${FB.auth.currentUser.uid}/${key}`, { sub: JSON.stringify(s), role: APP.mode, sid: APP.sid || '', name: (APP.me && APP.me.name) || '', at: TS() });
  localStorage.setItem('ss_att_push_' + APP.mode, '1');
  toast('Notifications enabled on this device');
  render();
}
ACT.enablePush = () => enablePush();
const pushOn = () => localStorage.getItem('ss_att_push_' + APP.mode) === '1' && 'Notification' in window && Notification.permission === 'granted';

/* ---------------- camera: QR scan & selfie ---------------- */
async function openCamera(facing) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Camera not available. Open the app over https.');
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
}
function stopStream(s) { if (s) s.getTracks().forEach(t => t.stop()); }
function scanQR() {
  return new Promise((resolve, reject) => {
    let stream = null, done = false;
    openModal(`<h3>Scan the QR on the office screen</h3><div class="cam"><video id="qv" playsinline muted></video><div class="frame"></div></div>
      <p class="muted">Point the camera at the QR shown on the office computer.</p><button class="btn g" data-act="camCancel">Cancel</button>`,
      { sticky: true, onClose: () => { done = true; stopStream(stream); } });
    ACT.camCancel = () => { done = true; stopStream(stream); closeModal(); reject(new Error('cancelled')); };
    openCamera('environment').then(s => {
      stream = s; const v = $('#qv'); if (!v) return stopStream(s); v.srcObject = s; v.play();
      const c = document.createElement('canvas'); const g = c.getContext('2d', { willReadFrequently: true });
      const tick = () => {
        if (done) return;
        if (v.readyState >= 2 && window.jsQR) {
          c.width = Math.min(640, v.videoWidth); c.height = Math.round(c.width * v.videoHeight / v.videoWidth);
          g.drawImage(v, 0, 0, c.width, c.height);
          const img = g.getImageData(0, 0, c.width, c.height);
          const code = window.jsQR(img.data, c.width, c.height, { inversionAttempts: 'dontInvert' });
          if (code && code.data) { done = true; stopStream(stream); closeModal(); return resolve(code.data); }
        }
        requestAnimationFrame(tick);
      };
      tick();
    }).catch(err => { closeModal(); reject(new Error('Camera permission needed to scan: ' + err.message)); });
  });
}
function takeSelfie(title) {
  return new Promise((resolve, reject) => {
    let stream = null, done = false;
    openModal(`<h3>${esc(title || 'Selfie')}</h3><div class="cam"><video id="sv" playsinline muted style="transform:scaleX(-1)"></video><div class="cd" id="scd"></div></div>
      <p class="muted">Look at the camera. Photo is taken automatically.</p><button class="btn g" data-act="camCancel">Cancel</button>`,
      { sticky: true, onClose: () => { done = true; stopStream(stream); } });
    ACT.camCancel = () => { done = true; stopStream(stream); closeModal(); reject(new Error('cancelled')); };
    openCamera('user').then(s => {
      stream = s; const v = $('#sv'); if (!v) return stopStream(s); v.srcObject = s; v.play();
      let n = 3; const cd = $('#scd'); cd.textContent = n;
      const iv = setInterval(() => {
        if (done) return clearInterval(iv);
        n--; if (n > 0) { cd.textContent = n; return; }
        clearInterval(iv);
        const w = 240, h = Math.round(w * (v.videoHeight || 320) / (v.videoWidth || 240));
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h);
        const url = c.toDataURL('image/jpeg', 0.6);
        done = true; stopStream(stream); closeModal(); resolve(url);
      }, 900);
    }).catch(err => { closeModal(); reject(new Error('Front camera needed for selfie: ' + err.message)); });
  });
}
function getGPS() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }), () => res(null), { enableHighAccuracy: true, timeout: 9000, maximumAge: 30000 });
  });
}

/* ---------------- common bits ---------------- */
const codeTag = (c, title) => `<span class="code c-${c}" title="${esc(title || (EG.CODES[c] && EG.CODES[c].label) || c)}">${c === 'PEND' ? '…' : ['FUT', 'NJ', 'NT'].includes(c) ? '·' : c}</span>`;
const codeLabel = c => (EG.CODES[c] && EG.CODES[c].label) || c;
const legendHTML = () => `<div class="legend">${['P', 'H', 'A', 'NR', 'UL', 'SL', 'WO', 'HO', 'PEND'].map(c => codeTag(c) + ' ' + codeLabel(c)).join(' &nbsp; ')}</div>`;
const staffIds = (incInactive) => Object.entries(DATA.staff || {}).filter(([, u]) => incInactive || u.active !== false)
  .sort((a, b) => String(a[1].empId || a[1].name).localeCompare(String(b[1].empId || b[1].name))).map(([id]) => id);
const sName = sid => ((DATA.staff || {})[sid] || {}).name || '(removed)';
function monthPicker(extra) {
  return `<button class="btn g s" data-act="monShift" data-n="-1">◀</button><input type="month" value="${APP.month}" data-chg="pickMonth"><button class="btn g s" data-act="monShift" data-n="1">▶</button>${extra || ''}`;
}
ACT.monShift = b => { APP.month = addMonths(APP.month, +b.dataset.n); render(); };
CHG.pickMonth = el => { if (el.value) { APP.month = el.value; render(); } };
ACT.dayShift = b => { APP.date = addDays(APP.date, +b.dataset.n); render(); };
CHG.pickDate = el => { if (el.value) { APP.date = el.value; render(); } };
ACT.goToday = () => { APP.date = istDate(nowMs()); render(); };
function settingsDefaults() { return Object.assign({}, EG.DEFAULTS, DATA.settings || {}); }

/* ---------------- landing / routing ---------------- */
function renderLanding() {
  $('#app').innerHTML = `<div class="center">
    <div style="text-align:center;margin-bottom:22px"><img class="applogo" src="icons/icon-192.png" alt=""><h1>Attendance</h1><div class="muted">Shreedeep Solutions · v${VERSION}</div></div>
    ${APP.demo ? '<div class="warn">DEMO mode — Firebase is not connected, data stays in this browser only.</div>' : ''}
    <div class="list">
      <button class="li" data-act="go" data-m="staff"><span class="ib" style="background:var(--tint);color:#fff">${ic('people')}</span><div class="grow"><b>Staff</b><div class="muted">My attendance, daily report, leave</div></div><span class="chev">${ic('chev')}</span></button>
      <button class="li" data-act="go" data-m="admin"><span class="ib" style="background:var(--blue);color:#fff">${ic('grid')}</span><div class="grow"><b>Admin</b><div class="muted">Partners only</div></div><span class="chev">${ic('chev')}</span></button>
      <button class="li" data-act="go" data-m="kiosk"><span class="ib" style="background:var(--gray);color:#fff">${ic('qr')}</span><div class="grow"><b>Office QR screen</b><div class="muted">Set up the office computer</div></div><span class="chev">${ic('chev')}</span></button>
    </div>
    <div style="text-align:center;display:flex;gap:8px;justify-content:center">${installButtonHTML()}<button class="btn s g" data-act="toggleTheme">${ic('moon')} Appearance</button></div></div>`;
}
ACT.go = b => startMode(b.dataset.m);
ACT.switchMode = () => { localStorage.removeItem('ss_att_mode'); unsubAll(); APP.mode = null; closeModal(); history.replaceState(null, '', location.pathname); render(); };
async function startMode(mode) {
  unsubAll(); APP.mode = mode; APP.view = null; localStorage.setItem('ss_att_mode', mode);
  APP.date = istDate(nowMs()); APP.month = APP.date.slice(0, 7);
  if (mode !== 'kiosk') loadCache(mode);
  FB = fbApp(mode);
  if (mode === 'admin') return bootAdmin();
  if (mode === 'staff') return bootStaff();
  if (mode === 'kiosk') return bootKiosk();
}
async function boot() {
  try { await loadFirebase(); } catch (e) { $('#app').innerHTML = `<div class="center card"><div class="err">${esc(e.message)}. Check your internet connection.</div><button class="btn" onclick="location.reload()">Retry</button></div>`; return; }
  const q = new URLSearchParams(location.search);
  let mode = q.has('kiosk') ? 'kiosk' : q.has('admin') ? 'admin' : q.has('staff') || location.hash.startsWith('#p=') ? 'staff' : localStorage.getItem('ss_att_mode');
  if (mode) startMode(mode); else render();
}
window.addEventListener('load', boot);
/* =====================================================================
   KIOSK — office PC shows a QR that changes every 15 seconds
   ===================================================================== */
const KIOSK = { approved: null, token: '', prev: '', ip: '', ipAt: 0, nextAt: 0, timer: null, lastErr: '', lastSeen: {}, wake: null, svg: '' };
const ROTATE_MS = 15000;

async function bootKiosk() {
  render();
  FB.auth.onAuthStateChanged(async u => {
    if (!u) { try { await FB.auth.signInAnonymously(); } catch (e) { KIOSK.lastErr = 'Sign-in failed: ' + e.message + ' (enable Anonymous sign-in in Firebase)'; render(); } return; }
    APP.uid = u.uid;
    ref('kiosks/' + u.uid).on('value', s => {
      KIOSK.approved = !!s.val(); KIOSK.name = (s.val() || {}).name || 'Office';
      if (KIOSK.approved) startKioskLoop(); else { stopKioskLoop(); requestKiosk(); }
      render();
    }, err => { KIOSK.lastErr = err.message; render(); });
  });
}
async function requestKiosk() {
  try { await dbSet('kioskRequests/' + APP.uid, { code: APP.uid.slice(-6).toUpperCase(), at: TS(), ua: navigator.userAgent.slice(0, 140), name: 'Office PC' }); } catch (e) { KIOSK.lastErr = e.message; }
}
function startKioskLoop() {
  if (KIOSK.timer) return;
  sub('settings'); sub('staff'); sub('punches', ['punches'], r => r);
  rotate();
  KIOSK.timer = setInterval(() => { if (Date.now() >= KIOSK.nextAt) rotate(); else updateKioskClock(); }, 1000);
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { KIOSK.wake = w; }).catch(() => { }); } catch (e) { }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.wakeLock && APP.mode === 'kiosk') navigator.wakeLock.request('screen').catch(() => { }); });
}
function stopKioskLoop() { clearInterval(KIOSK.timer); KIOSK.timer = null; }
async function rotate() {
  KIOSK.nextAt = Date.now() + ROTATE_MS;
  if (!KIOSK.ip || Date.now() - KIOSK.ipAt > 300000) { const ip = await getIP(); if (ip) { KIOSK.ip = ip; KIOSK.ipAt = Date.now(); } }
  const tok = randToken(18);
  try {
    await dbSet('kioskState/' + APP.uid, { token: tok, prev: KIOSK.token || tok, ip: KIOSK.ip || '', at: TS() });
    KIOSK.prev = KIOSK.token; KIOSK.token = tok; KIOSK.lastErr = '';
    const url = location.origin + location.pathname + '#p=' + APP.uid + '.' + tok;
    if (window.qrcode) { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); KIOSK.svg = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
    else KIOSK.svg = '<div style="padding:60px">QR library not loaded</div>';
  } catch (e) { KIOSK.lastErr = 'Cannot publish QR (' + e.message + ')'; KIOSK.svg = ''; }
  if (APP.mode === 'kiosk') renderKiosk();
}
function updateKioskClock() {
  const c = $('#kclock'); if (c) c.textContent = istHM(nowMs()) + ':' + pad(new Date(nowMs() + 330 * 60000).getUTCSeconds());
  const p = $('#kprog'); if (p) p.style.width = Math.max(0, (KIOSK.nextAt - Date.now()) / ROTATE_MS * 100) + '%';
}
function renderKiosk() {
  const app = $('#app');
  if (KIOSK.approved === false || KIOSK.approved === null) {
    app.innerHTML = `<div class="kiosk"><div class="card center" style="text-align:center">
      <h1>Office QR screen</h1>
      ${KIOSK.lastErr ? `<div class="err">${esc(KIOSK.lastErr)}</div>` : ''}
      ${APP.uid ? `<p>Ask an admin to open <b>Devices</b> and approve this screen.</p><p style="font-size:40px;font-weight:800;letter-spacing:4px;color:var(--m2)">${APP.uid.slice(-6).toUpperCase()}</p><p class="muted">Keep this page open. It starts automatically once approved.</p>` : '<p>Connecting…</p>'}
      <p><a href="#" data-act="switchMode">Not the office PC? Go back</a></p></div></div>`;
    return;
  }
  const t = istDate(nowMs());
  const feed = [];
  Object.entries(DATA.punches || {}).forEach(([sid, ps]) => Object.values(ps || {}).forEach(p => { if (p && p.at && istDate(p.at) === t) feed.push({ sid, p }); }));
  feed.sort((a, b) => b.p.at - a.p.at);
  const latest = feed[0];
  if (latest && latest.p.at > (KIOSK.lastFlash || 0) && nowMs() - latest.p.at < 20000) {
    KIOSK.lastFlash = latest.p.at;
    const w = { in: 'checked in', out: 'checked out', bout: 'started break', bin: 'back from break' }[latest.p.type];
    KIOSK.flash = `✓ ${sName(latest.sid)} ${w} ${istHM(latest.p.at)}`; setTimeout(() => { KIOSK.flash = ''; renderKiosk(); }, 6000);
  }
  const inNow = E ? E.todayBoard().filter(x => x.r.inOffice).length : 0;
  app.innerHTML = `<div class="kiosk">
    ${KIOSK.flash ? `<div class="flash">${esc(KIOSK.flash)}</div>` : ''}
    <div style="text-align:center"><div class="muted" style="font-size:16px">${esc((DATA.settings || {}).company || 'Shreedeep Solutions')} · ${fmtDateDow(t)}</div>
    <div class="clock" id="kclock">${istHM(nowMs())}</div></div>
    ${KIOSK.lastErr ? `<div class="err">${esc(KIOSK.lastErr)}</div>` : ''}
    <div class="qr">${KIOSK.svg || '<div style="width:300px;height:300px;display:flex;align-items:center;justify-content:center">Preparing…</div>'}</div>
    <div class="prog"><div id="kprog" style="width:100%"></div></div>
    <div style="font-size:18px;font-weight:700">Scan with your phone to check in / out</div>
    <div class="muted">Code changes every 15 seconds · phone must be on office Wi-Fi · In office now: <b>${inNow}</b></div>
    <div class="feed">${feed.slice(0, 10).map(f => `<span>${esc(sName(f.sid))} · ${{ in: 'IN', out: 'OUT', bout: 'BREAK', bin: 'BACK' }[f.p.type]} ${istHM(f.p.at)}</span>`).join('')}</div>
    <div class="muted" style="margin-top:10px">${esc(KIOSK.name)} · network ${esc(KIOSK.ip || '…')} · <a href="#" data-act="kioskFull">Full screen</a></div>
  </div>`;
  updateKioskClock();
}
ACT.kioskFull = () => { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || (() => { })).call(d); };
/* =====================================================================
   STAFF PHONE APP — iOS style
   Tabs: Today · Report · Leave · Calendar · More
   ===================================================================== */
const ST8 = { mapped: null, req: null, busy: false, pendingP: null, upl: '', thumbsOpen: false };

async function bootStaff() {
  if (location.hash.startsWith('#p=')) { ST8.pendingP = location.hash.slice(3); history.replaceState(null, '', location.pathname + location.search); }
  render();
  FB.auth.onAuthStateChanged(async u => {
    if (!u) { try { await FB.auth.signInAnonymously(); } catch (e) { ST8.err = 'Sign-in failed: ' + e.message; render(); } return; }
    APP.uid = u.uid;
    ref('deviceMap/' + u.uid).on('value', s => {
      const sid = s.val();
      if (sid && sid !== APP.sid) { APP.sid = sid; ST8.mapped = true; subscribeStaff(sid); if (ST8.pendingP) { const p = ST8.pendingP; ST8.pendingP = null; setTimeout(() => punchFlow(p), 400); } }
      else if (!sid) { ST8.mapped = false; APP.sid = null; sub('staff'); ref('deviceRequests/' + u.uid).on('value', r => { ST8.req = r.val(); render(); }); }
      render();
    }, err => { ST8.err = err.message; render(); });
  });
}
function subscribeStaff(sid) {
  ['settings', 'staff', 'locks', 'notices', 'leaveCal'].forEach(p => sub(p));
  ['staffPrivate', 'punches', 'overrides', 'requests', 'adjust', 'reports'].forEach(n => sub(n + '/' + sid));
  ref('locks').on('value', s => { Object.keys(s.val() || {}).forEach(mk => { if (!ST8['snap' + mk]) { ST8['snap' + mk] = 1; sub(`snapshots/${mk}/${sid}`); } }); });
}

const STAFF_TABS = [['home', 'clock', 'Today'], ['report', 'doc', 'Report'], ['leave', 'leave', 'Leave'], ['cal', 'cal', 'Calendar'], ['more', 'more', 'More']];
function renderStaff() {
  const app = $('#app');
  if (ST8.err) { app.innerHTML = `<div class="center"><div class="err">${esc(ST8.err)}</div><button class="btn" onclick="location.reload()">Retry</button> <button class="btn g" data-act="switchMode">Back</button></div>`; return; }
  if (ST8.mapped === null) { app.innerHTML = `<div class="center" style="text-align:center"><img class="applogo" src="icons/icon-192.png"><div class="muted">Connecting…</div></div>`; return; }
  if (!ST8.mapped) return renderRegister();
  APP.me = (DATA.staff || {})[APP.sid] || { name: '…' };
  if (!APP.view) APP.view = 'home';
  APP.moreViews = ['pay', 'notices'];
  const newNotices = Object.values(DATA.notices || {}).filter(n => n.at > (+localStorage.getItem('ss_att_seen_notice') || 0)).length;
  const rs = E.reportStatus(APP.sid, E.today); const td = E.day(APP.sid, E.today);
  APP.badges = { more: newNotices, report: (td.in && !rs.ok) ? 1 : 0 };
  APP.title = APP.me.name;
  const views = { home: sHome, report: sReport, leave: sLeave, cal: sCal, more: sMore, pay: sPay, notices: sNotices };
  paint('staff|' + APP.sid, () => `
    <div class="phone">
     <div class="topbar"><div class="t"><span data-title></span><div class="sub">${esc(APP.me.designation || '')} ${APP.me.empId ? '· ' + esc(APP.me.empId) : ''}</div></div>
       <button class="ib" data-act="toggleTheme" title="Appearance">${ic('moon')}</button></div>
     <main id="main"></main>
     <nav class="tabbar">${STAFF_TABS.map(t => `<button data-nav data-v="${t[0]}" data-act="sTab">${ic(t[1])}${t[2]}<span class="bdg hidden" data-badge="${t[0]}"></span></button>`).join('')}</nav>
    </div>`, (views[APP.view] || sHome)());
}
ACT.sTab = b => { APP.view = b.dataset.v; if (APP.view === 'more') localStorage.setItem('ss_att_seen_notice', String(nowMs())); render(); };
ACT.sGo = b => { APP.view = b.dataset.v; render(); };

/* ---------- device registration ---------- */
function renderRegister() {
  const list = staffIds(); const req = ST8.req;
  $('#app').innerHTML = `<div class="center">
   <div style="text-align:center;margin-bottom:18px"><img class="applogo" src="icons/icon-192.png"><h1>Register this phone</h1>
   <div class="muted">Attendance will work only from this phone.</div></div>
   ${APP.demo ? '<div class="warn">DEMO mode.</div>' : ''}
   ${req ? `<div class="card" style="text-align:center"><div style="font-size:40px">⏳</div><b>Waiting for approval</b><p class="muted">Request sent for <b>${esc(sName(req.sid))}</b>. Keep this page open or come back later.<br>Device code <b>${esc(APP.uid.slice(-6).toUpperCase())}</b></p><button class="btn g" data-act="regAgain">Change name</button></div>`
    : `<div class="card"><div class="form"><label class="full">Your name<select id="r_sid"><option value="">Select…</option>${list.map(id => `<option value="${id}">${esc(sName(id))} ${(DATA.staff[id] || {}).empId ? '(' + esc(DATA.staff[id].empId) + ')' : ''}</option>`).join('')}</select></label></div>
       <p class="muted">You'll take a selfie so the admin can confirm it's you.</p><button class="btn big" data-act="regSend">Take selfie &amp; send request</button></div>`}
   <div style="text-align:center;display:flex;gap:8px;justify-content:center">${installButtonHTML()}<button class="btn s g" data-act="switchMode">Back</button></div></div>`;
}
ACT.regSend = async () => {
  const sid = val('r_sid'); if (!sid) return toast('Select your name');
  let selfie = ''; try { selfie = await takeSelfie('Registration selfie'); } catch (e) { if (e.message !== 'cancelled') toast(e.message); return; }
  await dbSet('deviceRequests/' + APP.uid, { sid, at: TS(), ua: navigator.userAgent.slice(0, 160), selfie, code: APP.uid.slice(-6).toUpperCase() });
  await log('device-request', sName(sid) + ' requested phone approval');
  toast('Request sent to admin');
};
ACT.regAgain = async () => { await dbSet('deviceRequests/' + APP.uid, null); ST8.req = null; render(); };

/* ---------- TODAY ---------- */
function reportChip(rs, d) {
  if (rs.ok) return `<span class="ok">✓ Report sent ${istHM(rs.shared)}</span>`;
  if (rs.uploaded) return `<span class="flag">Report uploaded — not sent to WhatsApp</span>`;
  if (rs.any) return `<span class="flag">Report incomplete</span>`;
  return d && d.in ? `<span class="bad">Daily report pending</span>` : '';
}
function timeLeft() { const p = EG.istParts(nowMs()); const m = 24 * 60 - (p.h * 60 + p.mi); return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm'; }
function sHome() {
  const sid = APP.sid, t = E.today, r = E.day(sid, t), st = E.S;
  let state = 'Not checked in', sub = '', col = 'var(--mut)';
  if (r.off && !r.in) { state = r.off === 'HO' ? 'Holiday' : 'Weekly off'; sub = E.holidayName(t); }
  if (r.leave && !r.in) state = codeLabel(r.code);
  if (r.in && !r.out) { state = r.onBreak ? 'On break' : 'In office'; sub = 'since ' + r.in; col = r.onBreak ? 'var(--orange)' : 'var(--green)'; }
  if (r.in && r.out) { state = 'Checked out'; sub = r.in + ' – ' + r.out + ' · ' + fmtH(r.hours); col = 'var(--tint2)'; }
  const m = E.month(sid, mkOf(t)); const rs = r.report;
  const tl = r.punches.map(p => `<li><span class="dot" style="background:${{ in: 'var(--green)', out: 'var(--red)', bout: 'var(--orange)', bin: 'var(--blue)' }[p.type]}"></span><div style="flex:1">${{ in: 'Check in', out: 'Check out', bout: 'Break start', bin: 'Break end' }[p.type]}${p.reason ? `<div class="muted">${esc(p.reason)}</div>` : ''}</div><b>${istHM(p.at)}</b>${p.gpsFar ? ' <span class="flag">far</span>' : ''}</li>`).join('');
  const needRep = st.reportRequired && r.in;
  const notices = Object.values(DATA.notices || {}).sort((a, b) => b.at - a.at).slice(0, 1);
  return `
  <div class="card hero"><div class="muted">${fmtDateDow(t)}</div><div class="t" style="color:${col}">${esc(state)}</div><div class="muted">${esc(sub)}</div>
    <div style="margin-top:6px">${r.late ? `<span class="flag">Late by ${r.lateMin} min</span>` : ''} ${r.breakOver ? `<span class="flag">Break ${r.breakMin} min</span>` : ''}</div>
    <div style="margin-top:16px"><button class="btn big" data-act="punch">${ic('qr')} Scan office QR</button></div>
    <div class="muted" style="margin-top:8px">Point at the QR on the office computer · office Wi-Fi only</div></div>
  ${needRep ? `<div class="list"><button class="li" data-act="sGo" data-v="report"><span class="ib" style="background:${rs.ok ? 'var(--green)' : 'var(--purple)'};color:#fff">${ic(rs.ok ? 'check' : 'doc')}</span>
     <div class="grow"><b>Daily report</b><div class="muted">${rs.ok ? 'Sent to WhatsApp at ' + istHM(rs.shared) : `PDF + photos, send before 11:59 pm · ${timeLeft()} left`}</div></div><span class="chev">${ic('chev')}</span></button></div>` : ''}
  ${needRep && !rs.ok ? `<div class="warn"><b>Today won't count</b> until your daily report PDF and photos are uploaded and sent to the WhatsApp group.</div>` : ''}
  ${tl ? `<div class="sec-h">Today</div><div class="card" style="padding:4px 16px"><ul class="timeline">${tl}</ul></div>` : ''}
  <div class="sec-h">${MON[+t.slice(5, 7) - 1]}</div>
  <div class="stats"><div class="stat"><b>${m.presentDays}</b><span>Present days</span></div><div class="stat"><b>${m.late}</b><span>Late marks</span></div><div class="stat"><b>${m.noReport}</b><span>Days without report</span></div></div>
  ${notices.map(n => `<div class="card"><b>📢 ${esc(n.title)}</b><div class="muted">${fmtDT(n.at)}</div><div>${esc(n.body || '')}</div></div>`).join('')}
  <div class="list"><div class="li"><div class="grow">Office time</div><span class="muted">${esc(E.shiftOf(sid).start)}–${esc(E.shiftOf(sid).end)}</span></div>
   <button class="li" data-act="correctionForm"><div class="grow">Forgot to scan? Request correction</div><span class="chev">${ic('chev')}</span></button></div>`;
}

/* ---------- PUNCH FLOW ---------- */
ACT.punch = async () => {
  if (!navigator.onLine) return toast('No internet — connect to office Wi-Fi');
  let data; try { data = await scanQR(); } catch (e) { if (e.message !== 'cancelled') toast(e.message, 4500); return; }
  const m = String(data).match(/#p=([^.\s]+)\.([a-f0-9]+)/i);
  if (!m) return toast('That is not the office attendance QR');
  punchFlow(m[1] + '.' + m[2]);
};
async function punchFlow(p) {
  if (ST8.busy) return; ST8.busy = true;
  const [kiosk, token] = p.split('.');
  const step = s => { openModal(`<div style="text-align:center;padding:10px"><div class="spin"></div><h3>Recording attendance</h3><p class="muted">${esc(s)}</p></div>`, { sticky: true }); };
  try {
    if (!kiosk || !token) throw new Error('Invalid QR');
    step('Checking office network…');
    const ip = await getIP();
    try { await dbSet('claims/' + APP.uid, { kiosk, token, ip: ip || '', at: TS() }); }
    catch (e) { throw new Error('Not accepted. The QR may have expired, or your phone is not on the office Wi-Fi (switch off mobile data). Scan again.'); }
    const st = E.S;
    let gps = null, dist = null, far = false;
    if (st.gpsMode !== 'off') {
      step('Getting your location…');
      gps = await getGPS();
      if (gps && st.officeLat && st.officeLng) { dist = distM(gps.lat, gps.lng, +st.officeLat, +st.officeLng); far = dist > (+st.gpsRadius || 150) + Math.min(gps.acc || 0, 100); }
      if (st.gpsMode === 'block' && (!gps || far)) throw new Error(gps ? `You are ${dist} m from the office. Check-in allowed only at the office.` : 'Location permission is required. Allow location and try again.');
    }
    closeModal();
    let selfie = '';
    if (st.selfieRequired !== false) { try { selfie = await takeSelfie('Selfie for attendance'); } catch (e) { if (e.message === 'cancelled') { ST8.busy = false; return; } throw e; } }
    rebuild();
    const r = E.day(APP.sid, E.today); const last = r.punches[r.punches.length - 1]; const lastType = last ? last.type : null;
    let options;
    if (!lastType) options = [['in', 'Check in', 'gr']];
    else if (lastType === 'bout') options = [['bin', 'End break', '']];
    else if (lastType === 'out') options = [['in', 'Check in again (came back)', 'gr']];
    else options = [['out', 'Check out', 'r'], ['bout', 'Start break', 'o']];
    const type = await new Promise(res => {
      openModal(`<div style="text-align:center">${selfie ? `<img src="${selfie}" style="width:96px;height:96px;border-radius:50%;object-fit:cover">` : ''}<h3 style="margin-top:8px">${esc(APP.me.name)}</h3><div class="muted">${istHM(nowMs())}</div></div>
        <div style="display:grid;gap:10px;margin-top:14px">${options.map(o => `<button class="btn big ${o[2]}" data-act="pickPunch" data-t="${o[0]}">${o[1]}</button>`).join('')}
        <button class="btn big g" data-act="pickPunch" data-t="">Cancel</button></div>`, { sticky: true });
      ACT.pickPunch = b => { closeModal(); res(b.dataset.t); };
    });
    if (!type) { ST8.busy = false; return; }
    let reason = '';
    const sh = E.shiftOf(APP.sid);
    if (type === 'out' && !r.off && toMin(istHM(nowMs())) < toMin(sh.end) - (+st.earlyGraceMins || 0)) {
      reason = await new Promise(res => {
        openModal(`<h3>Leaving before ${esc(sh.end)}</h3><p class="muted">A reason is required.</p><textarea id="er" rows="3" style="width:100%" placeholder="e.g. Society visit at Ghansoli"></textarea>
          <div style="display:grid;gap:8px;margin-top:12px"><button class="btn big" data-act="erOk">Submit</button><button class="btn big g" data-act="erNo">Cancel</button></div>`, { sticky: true });
        ACT.erOk = () => { const v = val('er'); if (v.length < 3) return toast('Please write a reason'); closeModal(); res(v); };
        ACT.erNo = () => { closeModal(); res(null); };
      });
      if (reason === null) { ST8.busy = false; return; }
    }
    step('Saving…');
    const key = dbPushKey('punches/' + APP.sid);
    const rec = { type, at: TS(), kiosk, ip: ip || '', dev: navigator.userAgent.slice(0, 60) };
    if (gps) { rec.lat = +gps.lat.toFixed(6); rec.lng = +gps.lng.toFixed(6); rec.acc = gps.acc; if (dist != null) rec.dist = dist; if (far) rec.gpsFar = true; } else if (st.gpsMode !== 'off') rec.gpsNone = true;
    if (reason) rec.reason = reason;
    if (selfie) rec.hasSelfie = true;
    try { await dbSet(`punches/${APP.sid}/${key}`, rec); } catch (e) { throw new Error('Took too long — scan the QR again.'); }
    if (selfie) { try { await dbSet(`selfies/${APP.sid}/${key}`, selfie); } catch (e) { } }
    const saved = await dbOnce(`punches/${APP.sid}/${key}`);
    const w = { in: 'Checked in', out: 'Checked out', bout: 'Break started', bin: 'Break ended' }[type];
    const needRep = type === 'out' && st.reportRequired && !E.reportStatus(APP.sid, E.today).ok;
    openModal(`<div style="text-align:center"><div style="width:74px;height:74px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;margin:6px auto 10px">${ic('check').replace('class="i"', 'class="i" style="width:40px;height:40px;stroke-width:2.6"')}</div>
      <h3>${w}</h3><div style="font-size:34px;font-weight:700">${saved ? istHM(saved.at) : ''}</div>
      ${far ? `<div class="flag">Recorded ${dist} m away from office — admin will see this</div>` : ''}
      ${needRep ? `<div class="warn" style="margin-top:12px;text-align:left">Now upload your daily report and send it to the WhatsApp group — today counts only after that.</div><button class="btn big" data-act="goReport">Open daily report</button>` : ''}
      <button class="btn big g" style="margin-top:8px" data-act="closeModal">Done</button></div>`);
  } catch (e) {
    openModal(`<h3>Not recorded</h3><div class="err">${esc(e.message)}</div><div style="display:grid;gap:8px"><button class="btn big" data-act="punch">Scan again</button><button class="btn big g" data-act="closeModal">Close</button></div>`);
  } finally { ST8.busy = false; }
}
ACT.goReport = () => { closeModal(); APP.view = 'report'; render(); };

/* ---------- DAILY REPORT (PDF + photos → WhatsApp group) ---------- */
const FILES = {}; // fid → dataURL kept in memory for instant sharing
const IDB = {
  db: null,
  open() { if (this.db) return Promise.resolve(this.db); return new Promise(res => { try { const r = indexedDB.open('ss_att_files', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => res(null); } catch (e) { res(null); } }); },
  async get(k) { const db = await this.open(); if (!db) return null; return new Promise(res => { const q = db.transaction('f').objectStore('f').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); },
  async put(k, v) { const db = await this.open(); if (!db) return; return new Promise(res => { const t = db.transaction('f', 'readwrite'); t.objectStore('f').put(v, k); t.oncomplete = res; t.onerror = res; }); },
  async del(k) { const db = await this.open(); if (!db) return; db.transaction('f', 'readwrite').objectStore('f').delete(k); }
};
async function fileData(sid, fid) {
  if (FILES[fid]) return FILES[fid];
  let d = await IDB.get(fid);
  if (!d) { d = await dbOnce(`reportFiles/${sid}/${fid}`); if (d) IDB.put(fid, d); }
  if (d) FILES[fid] = d;
  return d;
}
function todayReport() { return ((DATA.reports || {})[APP.sid] || {})[E.today] || {}; }
function preloadReportFiles() {
  const rp = todayReport(); const ids = [rp.pdf && rp.pdf.fid].concat(Object.keys(rp.photos || {})).filter(Boolean);
  let changed = false;
  Promise.all(ids.filter(id => !FILES[id]).map(id => fileData(APP.sid, id).then(() => { changed = true; }))).then(() => { if (changed && APP.view === 'report') render(); });
}
function sReport() {
  const st = E.S, t = E.today, rp = todayReport(), rs = E.reportStatus(APP.sid, t), d = E.day(APP.sid, t);
  AFTER.push(preloadReportFiles);
  const photos = Object.entries(rp.photos || {}).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  const max = ST8.thumbsOpen ? photos.length : 7;
  const thumbs = photos.slice(0, max).map(([fid]) => `<button class="th" data-act="viewPhoto" data-fid="${fid}">${FILES[fid] ? `<img src="${FILES[fid]}" alt="">` : ''}</button>`).join('')
    + (photos.length > max ? `<button class="th more" data-act="thumbsMore">+${photos.length - max}</button>` : '');
  const can = !!(navigator.canShare && navigator.share);
  const ready = rs.uploaded;
  const past = []; for (let i = 1; i <= 6; i++) { const ds = addDays(t, -i); const r = E.day(APP.sid, ds); if (r.in) past.push([ds, r]); }
  return `<div class="bar"><h2>Daily report</h2></div>
  <div class="muted" style="margin:-8px 0 12px">${fmtDateDow(t)} · send before <b>11:59 pm</b> · ${timeLeft()} left</div>
  ${!d.in && st.reportRequired ? '<div class="info">Check in at the office first. The report is needed for every day you work.</div>' : ''}
  <div class="card"><div class="steps">
    <div class="step ${rs.pdf ? 'done' : ''}"><span class="n">${rs.pdf ? '✓' : 1}</span><div style="flex:1"><b>Reporting PDF</b></div></div>
    ${rp.pdf ? `<div class="filerow"><span class="ic">PDF</span><div style="flex:1;min-width:0"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${esc(rp.pdf.name)}</div><div class="muted">${Math.round((rp.pdf.size || 0) / 1024)} KB · ${rp.pdf.at ? istHM(rp.pdf.at) : ''}</div></div>
       <label class="btn s g">Replace<input type="file" accept="application/pdf" class="hidden" data-chg="repPdf"></label></div>`
    : `<label class="btn o" style="width:100%">${ic('doc')} Attach PDF<input type="file" accept="application/pdf" class="hidden" data-chg="repPdf"></label>`}
    <div class="step ${photos.length >= (+st.reportMinPhotos || 0) && photos.length ? 'done' : ''}" style="margin-top:6px"><span class="n">${photos.length >= (+st.reportMinPhotos || 1) ? '✓' : 2}</span><div style="flex:1"><b>Photos</b> <span class="muted">${photos.length} added${st.reportMinPhotos ? ' · min ' + st.reportMinPhotos : ''}</span></div></div>
    ${photos.length ? `<div class="thumbs">${thumbs}</div>${ST8.thumbsOpen && photos.length > 7 ? '<button class="btn s g" data-act="thumbsMore" style="margin-top:6px">Show less</button>' : ''}` : ''}
    <div style="display:flex;gap:8px"><label class="btn o" style="flex:1">${ic('photo')} Add photos<input type="file" accept="image/*" multiple class="hidden" data-chg="repPhotos"></label>
      <label class="btn o" style="flex:1">${ic('plus')} Camera<input type="file" accept="image/*" capture="environment" class="hidden" data-chg="repPhotos"></label></div>
    ${ST8.upl ? `<div class="muted">${esc(ST8.upl)}</div>` : ''}
    <div class="step ${rs.shared ? 'done' : ''}" style="margin-top:6px"><span class="n">${rs.shared ? '✓' : 3}</span><div style="flex:1"><b>Send to WhatsApp group</b>${rs.shared ? `<div class="muted">Sent at ${istHM(rs.shared)}${!rs.sharedAll ? ' · new files added after — send again' : ''}</div>` : ''}</div></div>
    <button class="btn big wa" data-act="repShare" ${ready ? '' : 'disabled'}>${ic('chat')} Send PDF + ${photos.length} photo${photos.length === 1 ? '' : 's'} to WhatsApp</button>
    <div class="muted" style="text-align:center">In WhatsApp choose the group <b>${esc(st.waGroupName)}</b> (name is copied — paste in search)</div>
    ${!can ? '<div class="warn">This browser cannot send files to WhatsApp. Open the app on your phone (Chrome on Android, Safari on iPhone).</div>' : ''}
  </div></div>
  ${rs.ok ? `<div class="ok" style="display:block;padding:10px 12px;border-radius:12px;font-size:14px">✓ Today's report is complete — your attendance counts.</div>` : ''}
  ${past.length ? `<div class="sec-h">Last days</div><div class="list">${past.map(([ds, r]) => `<div class="li"><div class="grow">${fmtDateDow(ds)}</div>${r.report.ok ? '<span class="ok">Sent</span>' : r.code === 'NR' ? '<span class="bad">Missed — day not counted</span>' : '<span class="muted">—</span>'}</div>`).join('')}</div>` : ''}`;
}
ACT.thumbsMore = () => { ST8.thumbsOpen = !ST8.thumbsOpen; render(); };
function reportGuard() {
  const t = E.today; const p = EG.istParts(nowMs());
  if (p.h === 23 && p.mi >= 59) { toast('Too late — the report window closes at 11:59 pm'); return false; }
  return t;
}
CHG.repPdf = async el => {
  const f = el.files[0]; el.value = ''; if (!f) return; const ds = reportGuard(); if (!ds) return;
  if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) return toast('Please choose a PDF file');
  if (f.size > 3 * 1024 * 1024) return toast('PDF is larger than 3 MB — please compress it');
  ST8.upl = 'Uploading PDF…'; render();
  try {
    const data = await fileToDataURL(f);
    const fid = dbPushKey('reportFiles/' + APP.sid);
    await dbSet(`reportFiles/${APP.sid}/${fid}`, data); FILES[fid] = data; IDB.put(fid, data);
    const old = todayReport().pdf;
    await dbSet(`reports/${APP.sid}/${ds}/pdf`, { name: f.name.slice(0, 120), size: f.size, fid, at: TS() });
    if (old && old.fid && old.fid !== fid) { dbSet(`reportFiles/${APP.sid}/${old.fid}`, null).catch(() => { }); IDB.del(old.fid); delete FILES[old.fid]; }
    toast('PDF uploaded');
  } catch (e) { toast('Upload failed: ' + e.message); }
  ST8.upl = ''; render();
};
CHG.repPhotos = async el => {
  const files = Array.from(el.files || []); el.value = ''; if (!files.length) return; const ds = reportGuard(); if (!ds) return;
  let n = 0;
  for (const f of files) {
    if (!/^image\//.test(f.type)) continue;
    n++; ST8.upl = `Uploading photo ${n} of ${files.length}…`; render();
    try {
      const data = await fileToDataURL(f, 1280, 0.72);
      const fid = dbPushKey('reportFiles/' + APP.sid);
      await dbSet(`reportFiles/${APP.sid}/${fid}`, data); FILES[fid] = data; IDB.put(fid, data);
      await dbSet(`reports/${APP.sid}/${ds}/photos/${fid}`, { at: TS(), kb: Math.round(data.length * 0.75 / 1024) });
    } catch (e) { toast('Photo upload failed: ' + e.message); }
  }
  ST8.upl = ''; toast(n + ' photo' + (n === 1 ? '' : 's') + ' added'); render();
};
ACT.viewPhoto = b => {
  const fid = b.dataset.fid;
  openModal(`<div style="text-align:center">${FILES[fid] ? `<img src="${FILES[fid]}" style="max-width:100%;max-height:65vh;border-radius:12px">` : '<p class="muted">Loading…</p>'}</div>
   <div style="display:grid;gap:8px;margin-top:12px"><button class="btn big r" data-act="delPhoto" data-fid="${fid}">Remove photo</button><button class="btn big g" data-act="closeModal">Close</button></div>`);
};
ACT.delPhoto = async b => {
  const fid = b.dataset.fid; closeModal();
  await dbSet(`reports/${APP.sid}/${E.today}/photos/${fid}`, null); dbSet(`reportFiles/${APP.sid}/${fid}`, null).catch(() => { }); IDB.del(fid); delete FILES[fid];
  toast('Photo removed');
};
function dataURLtoFile(d, name) {
  const [h, b64] = d.split(','); const type = (h.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new File([u8], name, { type });
}
ACT.repShare = async () => {
  const st = E.S, ds = E.today, rp = todayReport(), d = E.day(APP.sid, ds);
  const photos = Object.entries(rp.photos || {}).sort((a, b) => (a[1].at || 0) - (b[1].at || 0)).map(([fid]) => fid);
  const ids = [rp.pdf && rp.pdf.fid].concat(photos).filter(Boolean);
  const missing = ids.filter(id => !FILES[id]);
  if (missing.length) { toast('Preparing files… tap Send again in a moment'); preloadReportFiles(); return; }
  const nm = (APP.me.name || 'staff').replace(/[^a-z0-9]+/gi, '_');
  const files = [dataURLtoFile(FILES[rp.pdf.fid], rp.pdf.name && /\.pdf$/i.test(rp.pdf.name) ? rp.pdf.name : `Report_${nm}_${ds}.pdf`)]
    .concat(photos.map((fid, i) => dataURLtoFile(FILES[fid], `Report_${nm}_${ds}_${i + 1}.jpg`)));
  const text = `📋 Daily report — ${APP.me.name}${APP.me.empId ? ' (' + APP.me.empId + ')' : ''} — ${fmtDateDow(ds)}${d.in ? `\nIn ${d.in}${d.out ? ' · Out ' + d.out : ''}` : ''}`;
  if (!(navigator.canShare && navigator.share && navigator.canShare({ files }))) {
    return openModal(`<h3>Can't send from this browser</h3><p>Open the attendance app on your <b>phone</b> — Chrome on Android or Safari on iPhone — and tap Send there.</p><button class="btn big g" data-act="closeModal">OK</button>`);
  }
  try { navigator.clipboard && navigator.clipboard.writeText(st.waGroupName).catch(() => { }); } catch (e) { }
  try {
    await navigator.share({ files, text, title: 'Daily report' });
    await dbSet(`reports/${APP.sid}/${ds}/shared/${dbPushKey('x')}`, TS());
    await log('report-sent', `${APP.me.name} · ${ds} · PDF + ${photos.length} photos`);
    toast('Recorded as sent ✓');
  } catch (e) {
    if (e.name === 'AbortError') toast('Not sent — today counts only after you send it'); else toast('Could not open sharing: ' + e.message, 4500);
  }
};

/* ---------- corrections ---------- */
ACT.correctionForm = () => {
  const y = addDays(E.today, -1);
  openModal(`<h3>Request correction</h3><p class="muted">Admin will check and approve. Use only if you forgot to scan or the scan failed.</p>
   <div class="form"><label class="full">Date<input type="date" id="c_date" value="${y}" max="${E.today}"></label>
   <label>Actual in time<input type="time" id="c_in"></label><label>Actual out time<input type="time" id="c_out"></label>
   <label class="full">Reason<textarea id="c_reason" rows="3" placeholder="e.g. Phone battery dead, came at 9:05"></textarea></label></div>
   <div style="display:grid;gap:8px;margin-top:14px"><button class="btn big" data-act="sendCorrection">Send request</button><button class="btn big g" data-act="closeModal">Cancel</button></div>`);
};
ACT.sendCorrection = async () => {
  const date = val('c_date'), inT = val('c_in'), outT = val('c_out'), reason = val('c_reason');
  if (!date || (!inT && !outT) || reason.length < 5) return toast('Date, at least one time and a reason are needed');
  if (inT && outT && toMin(outT) <= toMin(inT)) return toast('Out time must be after in time');
  const id = dbPushKey('requests/' + APP.sid);
  await dbSet(`requests/${APP.sid}/${id}`, { kind: 'correction', date, in: inT, out: outT, reason, status: 'pending', at: TS() });
  await log('correction-request', `${APP.me.name} · ${date} · ${inT || '-'}–${outT || '-'} · ${reason}`);
  closeModal(); toast('Request sent');
};

/* ---------- LEAVE (unpaid only) ---------- */
function sLeave() {
  const sid = APP.sid;
  const reqs = Object.entries((DATA.requests || {})[sid] || {}).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  const bl = Object.values(E.S.blackouts || {}).filter(b => (b.to || b.from) >= E.today);
  return `<div class="bar"><h2>Leave</h2></div>
  <div class="info">All leave is unpaid. Apply in advance so the team can plan.</div>
  <div class="card"><h3>Apply</h3>
   <div class="form">
    <label>Type<select id="l_type">${Object.entries(EG.LEAVE_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="ck" style="margin-top:20px">Half day <input type="checkbox" id="l_half"></label>
    <label>From<input type="date" id="l_from" value="${E.today}"></label>
    <label>To<input type="date" id="l_to" value="${E.today}"></label>
    <label class="full">Reason<textarea id="l_reason" rows="2"></textarea></label>
    <label class="full">Medical note (sick leave over ${E.S.sickNoteDays} days)<input type="file" id="l_file" accept="image/*,application/pdf"></label>
   </div>
   ${bl.length ? `<div class="warn" style="margin-top:10px">No leave (except sick leave) during: ${bl.map(b => `${esc(b.label || 'Busy period')} ${fmtDate(b.from)}–${fmtDate(b.to || b.from)}`).join('; ')}</div>` : ''}
   <button class="btn big" style="margin-top:12px" data-act="applyLeave">Submit request</button></div>
  <div class="sec-h">My requests</div>
  ${reqs.length ? `<div class="list">${reqs.map(([id, r]) => `<div class="li"><div class="grow">${r.kind === 'leave' ? `<b>${EG.LEAVE_TYPES[r.leaveType] || 'Leave'}</b>${r.half ? ' (half)' : ''}<div class="muted">${fmtDate(r.from)}${r.to && r.to !== r.from ? ' → ' + fmtDate(r.to) : ''} · ${esc(r.reason || '')}</div>` : `<b>Correction</b><div class="muted">${fmtDate(r.date)} ${r.in || '-'}–${r.out || '-'} · ${esc(r.reason || '')}</div>`}${r.comment ? `<div class="muted">Admin: ${esc(r.comment)}</div>` : ''}</div>
   ${r.status === 'approved' ? '<span class="ok">Approved</span>' : r.status === 'rejected' ? '<span class="bad">Rejected</span>' : '<span class="muted">Pending</span>'}</div>`).join('')}</div>` : '<div class="card muted">No requests yet.</div>'}
  <div class="sec-h">Team calendar</div><div class="card">${teamCalendar(APP.month)}</div>`;
}
function teamCalendar(mk) {
  const D = daysIn(mk); const map = {};
  Object.entries(DATA.leaveCal || {}).forEach(([sid, rs]) => Object.values(rs || {}).forEach(r => {
    if (!r || r.status === 'rejected' || r.status === 'cancelled') return;
    EG.daysBetween(r.from, r.to || r.from).forEach(ds => { if (mkOf(ds) === mk) (map[ds] = map[ds] || []).push({ sid, r }); });
  }));
  const first = dsDow(mk + '-01');
  let h = `<div class="bar">${monthPicker()}</div><div class="cal">` + DOW.map(d => `<div class="hd">${d[0]}</div>`).join('') + '<div style="visibility:hidden"></div>'.repeat(first);
  for (let d = 1; d <= D; d++) { const ds = mk + '-' + pad(d); const l = map[ds] || []; h += `<div class="${ds === istDate(nowMs()) ? 'tdy' : ''}"><div class="dn">${d}</div>${l.map(x => `<div style="color:${x.r.status === 'approved' ? 'var(--blue)' : 'var(--mut)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sName(x.sid).split(' ')[0])}${x.r.status !== 'approved' ? '?' : ''}</div>`).join('')}</div>`; }
  return h + '</div><p class="muted">Blue = approved · grey with ? = pending</p>';
}
ACT.applyLeave = async () => {
  const type = val('l_type'), half = val('l_half'), from = val('l_from'); const to = half ? from : val('l_to'); const reason = val('l_reason');
  if (!from || !to || to < from) return toast('Check the dates');
  if (reason.length < 3) return toast('Please write a reason');
  const days = EG.daysBetween(from, to).filter(ds => !E.dayDefault(ds)).length * (half ? 0.5 : 1);
  if (!days) return toast('Those days are already off/holidays');
  if (type !== 'SL' && E.inBlackout(from, to).length) return toast('Leave is not allowed in that busy period. Talk to admin.', 4500);
  const f = $('#l_file').files[0]; let attachment = '';
  if (type === 'SL' && days > (+E.S.sickNoteDays || 2) && !f) return toast(`Sick leave over ${E.S.sickNoteDays} days needs a medical note`);
  if (f) { if (f.size > 3e6) return toast('File too large (max 3 MB)'); attachment = await fileToDataURL(f, 1100, 0.6); if (attachment.length > 450000) return toast('File still too large — take a clearer photo'); }
  const id = dbPushKey('requests/' + APP.sid);
  const req = { kind: 'leave', leaveType: type, from, to, half: !!half, days, reason, status: 'pending', at: TS() };
  if (attachment) req.attachment = attachment;
  await dbSet(`requests/${APP.sid}/${id}`, req);
  await dbSet(`leaveCal/${APP.sid}/${id}`, { from, to, type, half: !!half, status: 'pending' });
  await log('leave-request', `${APP.me.name} · ${type} ${from}→${to} (${days} d) · ${reason}`);
  toast('Leave request sent'); render();
};

/* ---------- CALENDAR ---------- */
function sCal() {
  const sid = APP.sid, mk = APP.month; const m = E.month(sid, mk);
  const first = dsDow(mk + '-01');
  let cal = DOW.map(d => `<div class="hd">${d[0]}</div>`).join('') + '<div style="visibility:hidden"></div>'.repeat(first);
  for (let d = 1; d <= m.D; d++) { const r = m.days[d]; cal += `<div class="${r.ds === E.today ? 'tdy' : ''}"><div class="dn">${d}</div>${codeTag(r.code)}<div class="muted" style="font-size:10px">${r.in || ''}${r.out ? '–' + r.out : ''}</div></div>`; }
  return `<div class="bar"><h2>Calendar</h2></div><div class="bar">${monthPicker()}</div>
  <div class="stats"><div class="stat"><b>${m.presentDays}</b><span>Present</span></div><div class="stat"><b>${(m.counts.A || 0) + (m.counts.NR || 0)}</b><span>Absent / no report</span></div>
   <div class="stat"><b>${m.late}</b><span>Late</span></div><div class="stat"><b>${fmtH(m.hours) || '0h'}</b><span>Hours</span></div></div>
  <div class="card"><div class="cal">${cal}</div></div>${legendHTML()}`;
}

/* ---------- MORE / PAYSLIPS / NOTICES ---------- */
function sMore() {
  const n = Object.values(DATA.notices || {}).length;
  return `<div class="bar"><h2>More</h2></div>
   <div class="list">
    <button class="li" data-act="sGo" data-v="pay"><span class="ib" style="background:var(--green);color:#fff">${ic('rupee')}</span><div class="grow">Payslips</div><span class="chev">${ic('chev')}</span></button>
    <button class="li" data-act="sGo" data-v="notices"><span class="ib" style="background:var(--orange);color:#fff">${ic('bell')}</span><div class="grow">Notices &amp; holidays</div><span class="muted">${n || ''}</span><span class="chev">${ic('chev')}</span></button>
   </div>
   <div class="list">
    <div class="li"><div class="grow">Install app</div>${installButtonHTML()}</div>
    <div class="li"><div class="grow">Notifications</div>${pushOn() ? '<span class="ok">On</span>' : '<button class="btn s o" data-act="enablePush">Turn on</button>'}</div>
    <button class="li" data-act="toggleTheme"><div class="grow">Appearance</div><span class="muted">${document.documentElement.dataset.theme === 'dark' ? 'Dark' : 'Light'}</span></button>
   </div>
   <p class="muted" style="text-align:center">Registered to ${esc(APP.me.name)} · device ${esc(APP.uid.slice(-6).toUpperCase())} · v${VERSION}</p>`;
}
function sPay() {
  const sid = APP.sid;
  const months = Object.keys(DATA.locks || {}).sort().reverse().filter(mk => DATA.snapshots && DATA.snapshots[mk] && DATA.snapshots[mk][sid]);
  return `<div class="bar"><button class="btn s g" data-act="sGo" data-v="more">‹ More</button></div><div class="bar"><h2>Payslips</h2></div>
   ${months.length ? `<div class="list">${months.map(mk => { const s = DATA.snapshots[mk][sid]; return `<button class="li" data-act="myPayslip" data-mk="${mk}"><div class="grow">${monthName(mk)}<div class="muted">${s.paidDays}/${s.D} paid days</div></div><b>${inr(s.net)}</b><span class="chev">${ic('chev')}</span></button>`; }).join('')}</div>` : '<div class="card muted">Payslips appear here once the admin finalises the month.</div>'}`;
}
ACT.myPayslip = b => { const mk = b.dataset.mk; const s = Object.assign({ u: DATA.staff[APP.sid] }, DATA.snapshots[mk][APP.sid]); printDocs([payslipDoc(APP.sid, mk, s, false)]); };
function sNotices() {
  const notices = Object.values(DATA.notices || {}).sort((a, b) => b.at - a.at).slice(0, 30);
  const hol = Object.entries(E.S.holidays || {}).filter(([d]) => d >= E.today).sort().slice(0, 15);
  return `<div class="bar"><button class="btn s g" data-act="sGo" data-v="more">‹ More</button></div><div class="bar"><h2>Notices</h2></div>
   ${notices.length ? `<div class="list">${notices.map(n => `<div class="li"><div class="grow"><b>${esc(n.title)}</b><div>${esc(n.body || '')}</div><div class="muted">${fmtDT(n.at)}</div></div></div>`).join('')}</div>` : '<div class="card muted">No notices.</div>'}
   <div class="sec-h">Upcoming holidays</div>
   ${hol.length ? `<div class="list">${hol.map(([d, n]) => `<div class="li"><div class="grow">${esc(n)}</div><span class="muted">${fmtDateDow(d)}</span></div>`).join('')}</div>` : '<div class="card muted">None listed.</div>'}`;
}
/* =====================================================================
   ADMIN — login, setup, dashboard, today, register, corrections
   ===================================================================== */
const AD = { state: 'loading', err: '', setupNeeded: false };

async function bootAdmin() {
  render();
  FB.auth.onAuthStateChanged(async u => {
    if (!u || u.isAnonymous) { AD.state = 'login'; APP.me = null; render(); return; }
    APP.uid = u.uid; AD.state = 'checking'; render();
    try {
      let me = await dbOnce('admins/' + u.uid).catch(() => null);
      if (!me) {
        // first admin ever? rules allow this only when no admins exist
        try { await dbSet('admins/' + u.uid, { email: u.email, name: u.displayName || localStorage.getItem('ss_att_signup_name') || u.email.split('@')[0], since: TS(), owner: true }); me = await dbOnce('admins/' + u.uid); AD.setupNeeded = true; }
        catch (e) {
          await dbSet('adminRequests/' + u.uid, { email: u.email, name: localStorage.getItem('ss_att_signup_name') || u.email, at: TS() }).catch(() => { });
          AD.state = 'pending'; render(); return;
        }
      }
      APP.me = me; AD.state = 'ready';
      ['settings', 'staff', 'staffPrivate', 'punches', 'overrides', 'requests', 'adjust', 'locks', 'snapshots', 'leaveCal', 'deviceMap', 'deviceRequests',
        'kiosks', 'kioskRequests', 'admins', 'reports', 'adminRequests', 'notices', 'pendingOverrides', 'assets', 'jobState'].forEach(p => sub(p));
      sub('log', ['log'], r => r.orderByChild('at').limitToLast(400));
      ref('admins/' + u.uid).on('value', s => { if (!s.val()) { toast('Admin access removed'); FB.auth.signOut(); } else APP.me = s.val(); });
      startIdleWatch(); pollKiosk();
      render();
    } catch (e) { AD.err = e.message; AD.state = 'login'; render(); }
  });
}

/* QR screen status: checked once a minute (a live subscription repainted every 15 s) */
function pollKiosk() {
  clearInterval(AD.kT);
  const run = async () => {
    if (APP.mode !== 'admin' || AD.state !== 'ready') return;
    const ks = await dbOnce('kioskState').catch(() => null) || {};
    const on = Object.entries(ks).filter(([k, x]) => (DATA.kiosks || {})[k] && x && nowMs() - x.at < 90000).length;
    DATA.kioskState = ks;
    if (on !== AD.kOn) { AD.kOn = on; if (['dash', 'devices'].includes(APP.view)) scheduleRender(); }
  };
  run(); AD.kT = setInterval(run, 60000);
}

/* ---------- login / signup ---------- */
function renderAdminLogin() {
  const signup = AD.signup;
  $('#app').innerHTML = `<div class="center"><div style="text-align:center;margin-bottom:16px"><img class="applogo" src="icons/icon-192.png"><h1>Admin ${signup ? 'sign-up' : 'login'}</h1>
    <div class="muted">Shreedeep Solutions · Attendance &amp; Payroll</div></div><div class="card">
    ${APP.demo ? '<div class="warn">DEMO mode — any email/password works; data stays in this browser.</div>' : ''}
    ${AD.err ? `<div class="err">${esc(AD.err)}</div>` : ''}
    <div class="form">
      ${signup ? '<label class="full">Your name<input id="a_name" placeholder="Deepali Vernekar"></label>' : ''}
      <label class="full">Email<input id="a_email" type="email" autocomplete="username"></label>
      <label class="full">Password<input id="a_pass" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}"></label>
    </div>
    <button class="btn big" style="margin-top:14px" data-act="${signup ? 'adminSignup' : 'adminLogin'}">${signup ? 'Create account' : 'Log in'}</button>
    <p class="muted">${signup ? '<a href="#" data-act="toggleSignup">Have an account? Login</a>' : '<a href="#" data-act="toggleSignup">New partner? Create admin account</a> · <a href="#" data-act="forgotPw">Forgot password</a>'}</p>
    <p class="muted">The very first account becomes the owner. Later accounts need approval from an existing admin.</p>
    <p class="muted"><a href="#" data-act="switchMode">← Back</a></p></div></div>`;
  const p = $('#a_pass'); if (p) p.addEventListener('keydown', e => { if (e.key === 'Enter') (signup ? ACT.adminSignup : ACT.adminLogin)(); });
}
ACT.toggleSignup = () => { AD.signup = !AD.signup; AD.err = ''; render(); };
ACT.adminLogin = async () => { AD.err = ''; try { await FB.auth.signInWithEmailAndPassword(val('a_email'), $('#a_pass').value); } catch (e) { AD.err = friendlyAuth(e); render(); } };
ACT.adminSignup = async () => {
  AD.err = ''; const name = val('a_name'); if (name.length < 3) return toast('Enter your name');
  localStorage.setItem('ss_att_signup_name', name);
  try { const c = await FB.auth.createUserWithEmailAndPassword(val('a_email'), $('#a_pass').value); if (c.user.updateProfile) await c.user.updateProfile({ displayName: name }); } catch (e) { AD.err = friendlyAuth(e); render(); }
};
ACT.forgotPw = async () => { const em = val('a_email'); if (!em) return toast('Type your email first'); try { await FB.auth.sendPasswordResetEmail(em); toast('Password reset email sent'); } catch (e) { toast(friendlyAuth(e)); } };
ACT.adminLogout = async () => { await FB.auth.signOut(); unsubAll(); AD.state = 'login'; render(); };
function friendlyAuth(e) {
  const c = e.code || ''; if (/wrong-password|invalid-credential|user-not-found/.test(c)) return 'Wrong email or password';
  if (/weak-password/.test(c)) return 'Password must be at least 6 characters'; if (/email-already/.test(c)) return 'This email already has an account — login instead';
  if (/invalid-email/.test(c)) return 'Invalid email'; if (/too-many/.test(c)) return 'Too many attempts — wait a few minutes'; return e.message;
}

/* ---------- idle auto-lock ---------- */
function startIdleWatch() {
  clearInterval(AD.idleT);
  AD.idleT = setInterval(() => {
    if (APP.mode !== 'admin' || APP.locked || AD.state !== 'ready') return;
    const mins = +settingsDefaults().idleLockMins || 0; if (!mins) return;
    if (Date.now() - APP.lastAct > mins * 60000) { APP.locked = true; closeModal(); render(); }
  }, 15000);
}
function renderLock() {
  $('#app').innerHTML = `<div class="center card"><h1>🔒 Locked</h1><p class="muted">Locked after ${settingsDefaults().idleLockMins} minutes of no activity.</p>
   <div class="form"><label class="full">Password for ${esc(FB.auth.currentUser.email)}<input id="u_pw" type="password"></label></div>
   <p><button class="btn" data-act="unlock">Unlock</button> <button class="btn g" data-act="adminLogout">Logout</button></p></div>`;
  const p = $('#u_pw'); p.focus(); p.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.unlock(); });
}
ACT.unlock = async () => {
  const u = FB.auth.currentUser;
  try { const cred = firebase.auth.EmailAuthProvider.credential(u.email, $('#u_pw').value); await u.reauthenticateWithCredential(cred); APP.locked = false; APP.lastAct = Date.now(); render(); }
  catch (e) { toast(friendlyAuth(e)); }
};

/* ---------- setup wizard ---------- */
function renderSetup() {
  const t = istDate(nowMs());
  $('#app').innerHTML = `<div class="center card"><h1>First-time setup</h1>
   <p class="muted">You are the owner admin. Your partner can sign up later and you approve them in Devices.</p>
   <div class="form">
    <label class="full">Firm name<input id="w_company" value="Shreedeep Solutions"></label>
    <label class="full">Start counting attendance from<input type="date" id="w_start" value="${t}"></label>
    <label class="full ck">Add current staff (Pratibha, Sanya, Raj, Vaishnavi) <input type="checkbox" id="w_seed" checked></label>
   </div><p><button class="btn" data-act="doSetup">Finish setup</button></p></div>`;
}
ACT.doSetup = async () => {
  const start = val('w_start') || istDate(nowMs());
  const upd = {};
  upd.settings = Object.assign({}, EG.DEFAULTS, { company: val('w_company') || 'Shreedeep Solutions', trackStart: start });
  if (val('w_seed')) {
    [['SS-00001', 'Pratibha Yadav', 'Billing Executive'], ['SS-00002', 'Sanya Kori', 'Accounts Executive'], ['SS-00003', 'Raj Bhagat', 'Logistics-cum-Marketing Executive'], ['SS-00004', 'Vaishnavi Kolhe', 'Admin Assistant']]
      .forEach(([emp, name, des]) => { const id = 's' + emp.slice(3); upd['staff/' + id] = { empId: emp, name, designation: des, active: true }; upd['staffPrivate/' + id] = { salary: 0 }; });
  }
  await dbUpdate(upd); AD.setupNeeded = false; await log('setup', 'Initial setup'); toast('Setup complete'); render();
};

/* ---------- shell ---------- */
function adminCounts() {
  let req = 0; Object.values(DATA.requests || {}).forEach(rs => Object.values(rs || {}).forEach(r => { if (r && r.status === 'pending') req++; }));
  req += Object.values(DATA.pendingOverrides || {}).filter(p => p && p.byUid !== APP.uid).length;
  const dev = Object.keys(DATA.deviceRequests || {}).length + Object.keys(DATA.kioskRequests || {}).length + Object.keys(DATA.adminRequests || {}).length;
  return { req, dev };
}
const ADMIN_NAV = [['dash', 'grid', 'Dashboard'], ['today', 'clock', 'Today'], ['register', 'cal', 'Register'], ['dailyrep', 'doc', 'Daily Reports'], ['requests', 'tray', 'Requests'],
  ['salary', 'rupee', 'Salary'], ['reports', 'chart', 'Analytics'], ['staff', 'people', 'Staff'], ['devices', 'phone', 'Devices'], ['letters', 'mail', 'Letters'], ['settings', 'gear', 'Settings'], ['log', 'list', 'Activity Log']];
const ADMIN_TABS = ['dash', 'today', 'dailyrep', 'requests'];
function renderAdmin() {
  const app = $('#app');
  const centerMsg = h => { app.innerHTML = `<div class="center" style="text-align:center"><img class="applogo" src="icons/icon-192.png">${h}</div>`; };
  if (AD.state === 'loading' || AD.state === 'checking') return centerMsg('<div class="muted">Checking access…</div>');
  if (AD.state === 'login') return renderAdminLogin();
  if (AD.state === 'pending') return centerMsg(`<h1>Waiting for approval</h1><p class="muted">Your admin request was sent. An existing admin must approve it in <b>Devices</b>.</p><button class="btn g" data-act="adminLogout">Logout</button>`);
  if (APP.locked) return renderLock();
  if (AD.setupNeeded || !DATA.settings) { if (DATA.settings === undefined && !AD.setupNeeded) { centerMsg('<div class="muted">Loading…</div>'); setTimeout(() => { if (!DATA.settings) { AD.setupNeeded = true; render(); } }, 2500); return; } return renderSetup(); }
  const c = adminCounts();
  if (!APP.view) APP.view = 'dash';
  APP.moreViews = ADMIN_NAV.map(n => n[0]).filter(v => !ADMIN_TABS.includes(v));
  APP.badges = { requests: c.req, devices: c.dev, more: c.dev, dailyrep: 0 };
  APP.title = (ADMIN_NAV.find(n => n[0] === APP.view) || ADMIN_NAV[0])[2];
  const st = settingsDefaults();
  paint('admin|' + APP.uid, () => `
   <div class="shell">
    <aside class="side">
      <div class="brand"><img src="icons/icon-192.png" class="logo" alt=""><div><b>${esc(st.company)}</b><span>Attendance &amp; Payroll</span></div></div>
      ${ADMIN_NAV.map(n => `<button class="nav" data-nav data-v="${n[0]}" data-act="aTab">${ic(n[1])}<span>${n[2]}</span><span class="bdg hidden" data-badge="${n[0]}"></span></button>`).join('')}
      <div class="foot"><b>${esc(APP.me.name)}</b>${APP.demo ? ' <span class="flag">DEMO</span>' : ''}<br>${esc(FB.auth.currentUser.email)}
        <div style="display:flex;gap:6px;margin-top:8px"><button class="btn s g" data-act="toggleTheme">${ic('moon')}</button><button class="btn s g" data-act="adminLogout">${ic('out')} Log out</button></div></div>
    </aside>
    <div class="content">
      <div class="topbar adm"><img src="icons/icon-192.png" style="width:28px;height:28px;border-radius:7px"><div class="t" data-title></div><button class="ib" data-act="toggleTheme">${ic('moon')}</button><button class="ib" data-act="adminLogout">${ic('out')}</button></div>
      <main id="main"></main>
    </div>
   </div>
   <nav class="tabbar adm">${ADMIN_TABS.map(v => { const n = ADMIN_NAV.find(x => x[0] === v); return `<button data-nav data-v="${v}" data-act="aTab">${ic(n[1])}${n[2] === 'Daily Reports' ? 'Reports' : n[2]}<span class="bdg hidden" data-badge="${v}"></span></button>`; }).join('')}
     <button data-nav data-v="more" data-act="adminMore">${ic('more')}More<span class="bdg hidden" data-badge="more"></span></button></nav>`,
  (VIEWS[APP.view] || VIEWS.dash)());
}
ACT.adminMore = () => {
  openModal(`<h3>More</h3><div class="list">${ADMIN_NAV.filter(n => !ADMIN_TABS.includes(n[0])).map(n => `<button class="li" data-act="aTab" data-v="${n[0]}">${ic(n[1])}<div class="grow">${n[2]}</div>${n[0] === 'devices' && adminCounts().dev ? `<span class="bdg">${adminCounts().dev}</span>` : ''}<span class="chev">${ic('chev')}</span></button>`).join('')}</div>`);
};
ACT.aTab = b => { APP.view = b.dataset.v; closeModal(); render(); };

/* ---------- DASHBOARD ---------- */
VIEWS.dash = function () {
  AFTER.push(drawCharts);
  const board = E.todayBoard(); const t = E.today;
  const cnt = { in: 0, out: 0, pend: 0, leave: 0, late: 0, off: 0, absent: 0, norep: 0 };
  board.forEach(({ r }) => {
    if (r.inOffice) cnt.in++; else if (r.in && r.out) cnt.out++;
    if (r.code === 'PEND') cnt.pend++; if (['SL', 'UL'].includes(r.code) && !r.in) cnt.leave++; if (r.in && !r.report.ok) cnt.norep++;
    if (r.late) cnt.late++; if (r.off && !r.in) cnt.off++;
  });
  const kioskOn = Object.entries(DATA.kioskState || {}).filter(([k, s]) => (DATA.kiosks || {})[k] && s && nowMs() - s.at < 90000).length;
  const ev = upcomingEvents(10);
  const c = adminCounts();
  const job = DATA.jobState || {};
  return `<div class="bar"><h2>Dashboard</h2>${pushOn() ? '<span class="ok">Alerts on</span>' : `<button class="btn s o" data-act="enablePush">${ic('bell')} Enable alerts</button>`} ${installButtonHTML()}</div>
  <div class="muted" style="margin:-8px 0 14px">${fmtDateDow(t)}</div>
  ${!kioskOn ? `<div class="warn">Office QR screen is <b>offline</b>. Open the app on the office PC with <b>?kiosk</b> (Devices tab has the link).</div>` : ''}
  ${c.req ? `<div class="warn"><b>${c.req}</b> request(s) waiting — <a href="#" data-act="aTab" data-v="requests">open Requests</a></div>` : ''}
  ${c.dev ? `<div class="warn"><b>${c.dev}</b> device / admin approval(s) waiting — <a href="#" data-act="aTab" data-v="devices">open Devices</a></div>` : ''}
  <div class="stats">
   <div class="stat"><b>${cnt.in}</b><span>In office now</span></div><div class="stat"><b>${cnt.out}</b><span>Checked out</span></div>
   <div class="stat"><b>${cnt.pend}</b><span>Not in yet</span></div><div class="stat"><b>${cnt.leave}</b><span>On leave</span></div>
   <div class="stat"><b>${cnt.late}</b><span>Late today</span></div><div class="stat"><b>${cnt.norep}</b><span>Report pending</span></div><div class="stat"><b style="color:${kioskOn ? 'var(--green)' : 'var(--red)'}">${kioskOn ? 'Online' : 'Offline'}</b><span>QR screen</span></div></div>
  <div class="grid2">
   <div class="card"><h3>Today</h3>${board.length ? `<table>${board.map(({ sid, r }) => `<tr><td><b>${esc(sName(sid))}</b></td><td>${codeTag(r.code)}</td><td>${r.in || ''}${r.out ? ' – ' + r.out : r.inOffice ? (r.onBreak ? ' · on break' : ' · in office') : ''}</td><td>${r.late ? `<span class="flag">late ${r.lateMin}m</span>` : ''}${r.in ? reportChip(r.report, r) : ''}</td></tr>`).join('')}</table>` : '<p class="muted">No staff yet.</p>'}</div>
   <div class="card"><h3>Coming up</h3>${ev.length ? ev.map(e => `<div>${e.icon} <b>${esc(e.text)}</b> <span class="muted">${e.when}</span></div>`).join('') : '<p class="muted">No birthdays, anniversaries or holidays in the next 10 days.</p>'}
    <h3 style="margin-top:14px">Automatic jobs</h3><div class="muted">Last run: ${job.lastRun ? fmtDT(job.lastRun) : 'never (set up GitHub Actions — see README)'}${job.lastError ? ' · <span class="flag">' + esc(job.lastError) + '</span>' : ''}</div></div>
  </div>
  <div class="grid2"><div class="card"><h3>Attendance % — last 6 months</h3><canvas id="chAtt" height="180"></canvas></div>
   <div class="card"><h3>Salary cost — last 12 months</h3><canvas id="chSal" height="180"></canvas></div></div>`;
};
function upcomingEvents(days) {
  const out = []; const t = E.today;
  for (let i = 0; i <= days; i++) {
    const ds = addDays(t, i); const md = ds.slice(5); const when = i === 0 ? 'today' : i === 1 ? 'tomorrow' : fmtDateDow(ds);
    staffIds().forEach(sid => {
      const p = (DATA.staffPrivate || {})[sid] || {}, u = DATA.staff[sid];
      if (p.dob && p.dob.slice(5) === md) out.push({ icon: '🎂', text: `${u.name}'s birthday`, when });
      if (u.joinDate && u.joinDate.slice(5) === md && u.joinDate.slice(0, 4) < ds.slice(0, 4)) out.push({ icon: '🎉', text: `${u.name} — ${+ds.slice(0, 4) - +u.joinDate.slice(0, 4)} year(s) with us`, when });
    });
    if (E.holidayName(ds)) out.push({ icon: '🏖', text: E.holidayName(ds), when });
  }
  return out;
}
function drawCharts() {
  if (!window.Chart) return;
  const css = getComputedStyle(document.documentElement); const ink = css.getPropertyValue('--mut').trim(); const m2 = css.getPropertyValue('--tint2').trim();
  Chart.defaults.color = ink;
  const a = $('#chAtt');
  if (a) {
    const months = []; for (let i = 5; i >= 0; i--) months.push(addMonths(mkOf(E.today), -i));
    const ds = staffIds().map((sid, i) => ({ label: sName(sid).split(' ')[0], data: months.map(mk => { const s = E.rangeStats(sid, mk + '-01', mk + '-' + pad(daysIn(mk))); return s.workDays ? s.attPct : null; }), backgroundColor: ['#8b1e2f', '#007aff', '#34c759', '#ff9500', '#af52de', '#30b0c7'][i % 6], borderRadius: 6 }));
    APP.charts.push(new Chart(a, { type: 'bar', data: { labels: months.map(mk => MON[+mk.slice(5) - 1].slice(0, 3)), datasets: ds }, options: { scales: { y: { min: 0, max: 100 } }, plugins: { legend: { position: 'bottom' } } } }));
  }
  const s = $('#chSal');
  if (s) {
    const months = []; for (let i = 11; i >= 0; i--) months.push(addMonths(mkOf(E.today), -i));
    const data = months.map(mk => staffIds(true).reduce((t, sid) => t + (mk >= (E.S.trackStart || '').slice(0, 7) ? E.salary(sid, mk).net : 0), 0) || (mk < (E.S.trackStart || '').slice(0, 7) ? null : 0));
    APP.charts.push(new Chart(s, { type: 'line', data: { labels: months.map(mk => MON[+mk.slice(5) - 1].slice(0, 3) + ' ' + mk.slice(2, 4)), datasets: [{ label: 'Net salary', data, borderColor: m2, backgroundColor: m2, tension: .25 }] }, options: { plugins: { legend: { display: false } } } }));
  }
}

/* ---------- TODAY (live, any date) ---------- */
VIEWS.today = function () {
  const ds = APP.date; const ids = staffIds(true).filter(id => DATA.staff[id].active !== false || (E.day(id, ds).punches.length));
  return `<div class="bar"><h2>Today</h2><button class="btn g s" data-act="dayShift" data-n="-1">◀</button><input type="date" value="${ds}" data-chg="pickDate"><button class="btn g s" data-act="dayShift" data-n="1">▶</button><button class="btn o s" data-act="goToday">Today</button></div>
  <div class="muted" style="margin:-6px 0 10px">${fmtDateDow(ds)} ${E.dayDefault(ds) === 'HO' ? '· Holiday: ' + esc(E.holidayName(ds)) : E.dayDefault(ds) === 'WO' ? '· Weekly off' : ''} ${E.isLocked(mkOf(ds)) ? '<span class="locked">MONTH LOCKED</span>' : ''}</div>
  <div class="tw"><table><tr><th>Staff</th><th>Status</th><th>In</th><th>Out</th><th>Hours</th><th>Break</th><th>Daily report</th><th>Scans (tap 📷 for selfie)</th><th>Notes</th><th></th></tr>
  ${ids.map(sid => { const r = E.day(sid, ds); return `<tr><td><b>${esc(sName(sid))}</b></td><td>${codeTag(r.code)} <span class="muted">${esc(codeLabel(r.code))}</span></td>
   <td>${r.in || ''}${r.late ? `<br><span class="flag">late ${r.lateMin}m</span>` : ''}</td><td>${r.out || (r.inOffice ? '<span class="ok">in office</span>' : '')}${r.early ? '<br><span class="flag">early</span>' : ''}</td>
   <td>${fmtH(r.hours)}</td><td>${r.breakMin ? r.breakMin + 'm' : ''}</td>
   <td>${r.report.any ? `<button class="btn s g" data-act="openReport" data-sid="${sid}" data-ds="${ds}">${ic('doc')} ${r.report.pdf ? 'PDF' : ''}${r.report.photos ? ' + ' + r.report.photos + ' photos' : ''}</button><br>` : ''}${r.in ? reportChip(r.report, r) : ''}</td>
   <td class="wrap">${r.punches.map(p => `<span class="chip">${{ in: 'IN', out: 'OUT', bout: 'BRK', bin: 'BACK' }[p.type]} ${istHM(p.at)}${p.hasSelfie ? ` <a href="#" data-act="selfie" data-sid="${sid}" data-pid="${p.id}">📷</a>` : ''}${p.gpsFar ? ' ⚠' : ''}</span>`).join(' ')}</td>
   <td class="wrap">${r.earlyReason ? 'Early: ' + esc(r.earlyReason) + '<br>' : ''}${r.flags.map(f => `<span class="flag">${esc(f)}</span>`).join('')}${r.override ? `<div class="muted">Corrected: ${esc(r.override.reason)} (${esc(r.override.by || '')})</div>` : ''}</td>
   <td><button class="btn o s" data-act="dayEdit" data-sid="${sid}" data-ds="${ds}">Correct</button></td></tr>`; }).join('')}
  </table></div>`;
};
ACT.selfie = async b => {
  openModal('<h3>Selfie</h3><p>Loading…</p>');
  const img = await dbOnce(`selfies/${b.dataset.sid}/${b.dataset.pid}`);
  const p = (((DATA.punches || {})[b.dataset.sid]) || {})[b.dataset.pid] || {};
  openModal(`<h3>${esc(sName(b.dataset.sid))} — ${fmtDT(p.at)}</h3>${img ? `<img src="${img}" style="width:100%;max-width:360px;border-radius:12px">` : '<p class="muted">No selfie stored (may be cleaned up after 90 days).</p>'}
   <p class="muted">Network ${esc(p.ip || '?')} · ${p.dist != null ? p.dist + ' m from office' : 'no GPS'}${p.acc ? ' (±' + p.acc + ' m)' : ''} · ${esc(p.dev || '')}</p><button class="btn g" data-act="closeModal">Close</button>`);
};

/* ---------- REGISTER ---------- */
VIEWS.register = function () {
  const mk = APP.month, D = daysIn(mk), t = E.today;
  const ids = staffIds(true).filter(id => DATA.staff[id].active !== false || E.month(id, mk).presentDays);
  let head = '<tr><th class="nm">Staff</th>';
  for (let d = 1; d <= D; d++) { const ds = mk + '-' + pad(d); const def = E.dayDefault(ds); head += `<th class="${ds === t ? 'today' : def === 'HO' ? 'hol' : def === 'WO' ? 'off' : ''}" title="${esc(E.holidayName(ds))}">${d}<br>${DOW[dsDow(ds)][0]}</th>`; }
  head += '<th>P</th><th>½</th><th>Lv</th><th>A/NR</th><th>Late</th><th>Hrs</th><th>Paid</th><th>LOP</th></tr>';
  const rows = ids.map(sid => {
    const m = E.month(sid, mk); const s = E.salary(sid, mk, { live: true });
    let tr = `<tr><td class="nm"><b>${esc(sName(sid))}</b><br><span class="muted">${esc(DATA.staff[sid].empId || '')}</span></td>`;
    for (let d = 1; d <= D; d++) { const r = m.days[d]; tr += `<td class="cell ${r.flags.length || r.late ? 'fl' : ''}" data-act="dayEdit" data-sid="${sid}" data-ds="${r.ds}" title="${esc(fmtDateDow(r.ds) + ' · ' + codeLabel(r.code) + (r.in ? ' · ' + r.in + '–' + (r.out || '') : '') + (r.late ? ' · late ' + r.lateMin + 'm' : '') + (r.flags.length ? ' · ' + r.flags.join(', ') : ''))}">${codeTag(r.code)}</td>`; }
    const c = m.counts; return tr + `<td>${c.P || 0}</td><td>${c.H || 0}</td><td>${(c.SL || 0) + (c.UL || 0)}</td><td>${(c.A || 0) + (c.NR || 0)}</td><td>${m.late}</td><td>${Math.round(m.hours)}</td><td><b>${s.paidDays}</b></td><td>${s.lop}</td></tr>`;
  }).join('');
  return `<div class="bar"><h2>Register</h2>${monthPicker()} ${E.isLocked(mk) ? '<span class="locked">LOCKED</span>' : ''}
    <button class="btn o s" data-act="printRegister">Print</button><button class="btn s" data-act="exportMonth">Export Excel</button></div>
   <div class="tw"><table class="reg">${head}${rows}</table></div>${legendHTML()}
   <p class="muted">Everything here is automatic from QR scans, daily reports and approved leave. NR = checked in but no daily report sent that day (not paid). Orange ring = flag. Tap a cell to see punches or correct with a reason.</p>`;
};

/* ---------- day detail + override ---------- */
ACT.dayEdit = b => {
  const sid = b.dataset.sid, ds = b.dataset.ds;
  openModal('', {
    build: () => {
      const r = E.day(sid, ds); const ov = (DATA.overrides[sid] || {})[ds] || {};
      const pend = Object.entries(DATA.pendingOverrides || {}).find(([, p]) => p.sid === sid && p.ds === ds);
      const locked = E.isLocked(mkOf(ds));
      return `<h3>${esc(sName(sid))} — ${fmtDateDow(ds)}</h3>
       <p>${codeTag(r.code)} <b>${esc(codeLabel(r.code))}</b> · ${r.in || '--'} → ${r.out || '--'} ${r.hours ? '· ' + fmtH(r.hours) : ''} ${r.late ? `<span class="flag">late ${r.lateMin}m</span>` : ''}</p>
       ${r.flags.map(f => `<span class="flag">${esc(f)}</span>`).join(' ')}
       <div class="card" style="margin-top:8px"><b>Scans</b>${r.punches.length ? `<ul class="timeline">${r.punches.map(p => `<li>${{ in: 'Check in', out: 'Check out', bout: 'Break start', bin: 'Break end' }[p.type]} <b>${istHM(p.at)}</b> ${p.hasSelfie ? `<a href="#" data-act="selfie" data-sid="${sid}" data-pid="${p.id}">📷 selfie</a>` : ''} <span class="muted">${p.dist != null ? p.dist + ' m' : ''} ${esc(p.reason || '')}</span></li>`).join('')}</ul>` : '<p class="muted">No scans this day.</p>'}</div>
       ${r.leave ? `<p>Approved leave: <b>${esc(EG.LEAVE_TYPES[r.leave.type])}</b>${r.leave.half ? ' (half)' : ''}</p>` : ''}
       <div class="card" style="margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><b>Daily report</b> ${r.in ? reportChip(r.report, r) : '<span class="muted">not needed (no check-in)</span>'}
         ${r.report.any ? `<button class="btn s g" data-act="openReport" data-sid="${sid}" data-ds="${ds}">${ic('doc')} Open</button>` : ''}</div>
       ${pend ? `<div class="warn">A correction is waiting for second-admin approval (${esc(pend[1].by)}).</div>` : ''}
       ${locked ? '<div class="warn">Month is locked — unlock in Salary to correct.</div>' : `
       <div class="form"><div class="sec">Correct this day (reason required)</div>
        <label>Status<select id="o_status"><option value="">Auto (from times / leave)</option>${EG.OVERRIDE_CODES.map(c => `<option value="${c}" ${ov.status === c ? 'selected' : ''}>${c} — ${codeLabel(c)}</option>`).join('')}</select></label>
        <label>&nbsp;<span class="muted">Leave blank to keep scanned times</span></label>
        <label>In time<input type="time" id="o_in" value="${esc(ov.in || '')}"></label><label>Out time<input type="time" id="o_out" value="${esc(ov.out || '')}"></label>
        <label class="full ck">Accept this day without the daily report <input type="checkbox" id="o_skip" ${ov.skipReport ? 'checked' : ''}></label>
        <label class="full">Reason<input id="o_reason" value="${esc(ov.reason || '')}" placeholder="e.g. Society visit at Ghansoli, approved by Deepali"></label></div>
       <p style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="saveOverride" data-sid="${sid}" data-ds="${ds}">Save correction</button>
        ${r.override ? `<button class="btn g" data-act="removeOverride" data-sid="${sid}" data-ds="${ds}">Remove correction</button>` : ''}`}
        <button class="btn g" data-act="closeModal">Close</button></p>`;
    }, refresh: showModal
  });
};
ACT.saveOverride = async b => {
  const sid = b.dataset.sid, ds = b.dataset.ds;
  const status = val('o_status'), inT = val('o_in'), outT = val('o_out'), reason = val('o_reason');
  if (reason.length < 3) return toast('Reason is required');
  const skip = val('o_skip');
  if (!status && !inT && !outT && !skip) return toast('Choose a status, enter times or accept without report');
  if (inT && outT && toMin(outT) <= toMin(inT)) return toast('Out must be after In');
  const o = { reason, by: APP.me.name, byUid: APP.uid, at: TS() };
  if (status) o.status = status; if (inT) o.in = inT; if (outT) o.out = outT; if (skip) o.skipReport = true;
  const st = settingsDefaults(); const old = ds < addDays(E.today, -(+st.oldEditDays || 0));
  const otherAdmins = Object.keys(DATA.admins || {}).filter(u => u !== APP.uid).length;
  if (old && st.secondAdminApproval && otherAdmins) {
    const id = dbPushKey('pendingOverrides');
    await dbSet('pendingOverrides/' + id, { sid, ds, data: o, reason, by: APP.me.name, byUid: APP.uid, at: TS() });
    await log('override-pending', `${sName(sid)} · ${ds} · ${status || ''} ${inT}-${outT} · ${reason} (needs 2nd admin)`);
    closeModal(); return toast(`Older than ${st.oldEditDays} days — sent to the other admin for approval`, 4000);
  }
  await dbSet(`overrides/${sid}/${ds}`, o);
  await log('override', `${sName(sid)} · ${ds} · ${status || 'auto'} ${inT || ''}-${outT || ''} · ${reason}`);
  toast('Correction saved');
};
ACT.removeOverride = async b => {
  const sid = b.dataset.sid, ds = b.dataset.ds; const reason = prompt('Reason for removing the correction?'); if (!reason || reason.length < 3) return;
  await dbSet(`overrides/${sid}/${ds}`, null); await log('override-removed', `${sName(sid)} · ${ds} · ${reason}`); toast('Removed');
};

/* ---------- DAILY REPORTS viewer (admin) ---------- */
const AFILES = {};
async function adminFile(sid, fid) { if (AFILES[fid]) return AFILES[fid]; const d = await dbOnce(`reportFiles/${sid}/${fid}`); if (d) AFILES[fid] = d; return d; }
function openDataURL(d, name) {
  const [h, b64] = d.split(','); const type = (h.match(/data:([^;]+)/) || [])[1]; const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([u8], { type })); const w = window.open(url, '_blank');
  if (!w) { const a = document.createElement('a'); a.href = url; a.download = name || 'file'; a.click(); }
}
VIEWS.dailyrep = function () {
  const ds = APP.date; const ids = staffIds();
  const need = []; const rows = ids.map(sid => {
    const r = E.day(sid, ds); const rp = ((DATA.reports || {})[sid] || {})[ds] || {};
    const photos = Object.keys(rp.photos || {});
    photos.concat(rp.pdf ? [rp.pdf.fid] : []).forEach(fid => { if (!AFILES[fid]) need.push([sid, fid]); });
    return `<div class="card"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px"><b style="font-size:16px">${esc(sName(sid))}</b>${codeTag(r.code)}
      <span class="muted">${r.in ? 'In ' + r.in + (r.out ? ' · Out ' + r.out : '') : 'No check-in'}</span><span style="flex:1"></span>${r.in ? reportChip(r.report, r) : ''}</div>
      ${rp.pdf ? `<div class="filerow" style="margin-bottom:8px"><span class="ic">PDF</span><div style="flex:1;min-width:0"><div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(rp.pdf.name)}</div><div class="muted">uploaded ${rp.pdf.at ? fmtDT(rp.pdf.at) : ''}</div></div><button class="btn s g" data-act="openPdf" data-sid="${sid}" data-fid="${rp.pdf.fid}" data-name="${esc(rp.pdf.name)}">Open</button></div>` : ''}
      ${photos.length ? `<div class="thumbs">${photos.map(fid => `<button class="th" data-act="adminPhoto" data-sid="${sid}" data-fid="${fid}">${AFILES[fid] ? `<img src="${AFILES[fid]}">` : ''}</button>`).join('')}</div>` : ''}
      ${!rp.pdf && !photos.length ? '<div class="muted">Nothing uploaded.</div>' : ''}</div>`;
  }).join('');
  if (need.length) AFTER.push(() => { Promise.all(need.slice(0, 40).map(([sid, fid]) => adminFile(sid, fid))).then(() => { if (APP.view === 'dailyrep') scheduleRender(); }); });
  const sent = ids.filter(sid => E.day(sid, ds).report.ok).length, worked = ids.filter(sid => E.day(sid, ds).in).length;
  return `<div class="bar"><h2>Daily Reports</h2><button class="btn g s" data-act="dayShift" data-n="-1">‹</button><input type="date" value="${ds}" data-chg="pickDate"><button class="btn g s" data-act="dayShift" data-n="1">›</button><button class="btn o s" data-act="goToday">Today</button></div>
   <div class="muted" style="margin:-8px 0 14px">${fmtDateDow(ds)} · ${sent} of ${worked} who worked have sent their report · deadline 11:59 pm · WhatsApp group “${esc(E.S.waGroupName)}”</div>${rows || '<div class="card muted">No staff.</div>'}
   <p class="muted">Files are kept for ${E.S.reportKeepDays} days (they are also in the WhatsApp group), then removed automatically to keep Firebase free.</p>`;
};
ACT.openReport = b => { APP.date = b.dataset.ds; APP.view = 'dailyrep'; closeModal(); render(); };
ACT.openPdf = async b => { toast('Opening…'); const d = await adminFile(b.dataset.sid, b.dataset.fid); if (!d) return toast('File no longer stored'); openDataURL(d, b.dataset.name); };
ACT.adminPhoto = async b => { const d = await adminFile(b.dataset.sid, b.dataset.fid); if (!d) return toast('File no longer stored'); openModal(`<div style="text-align:center"><img src="${d}" style="max-width:100%;max-height:75vh;border-radius:12px"></div><button class="btn big g" style="margin-top:12px" data-act="closeModal">Close</button>`); };
/* =====================================================================
   ADMIN — requests (leave, corrections, 2nd-admin approvals), devices, staff
   ===================================================================== */
VIEWS.requests = function () {
  const pend = [], done = [];
  Object.entries(DATA.requests || {}).forEach(([sid, rs]) => Object.entries(rs || {}).forEach(([rid, r]) => { if (!r) return; (r.status === 'pending' ? pend : done).push({ sid, rid, r }); }));
  pend.sort((a, b) => (a.r.at || 0) - (b.r.at || 0)); done.sort((a, b) => (b.r.decidedAt || b.r.at || 0) - (a.r.decidedAt || a.r.at || 0));
  const po = Object.entries(DATA.pendingOverrides || {});
  const reqRow = ({ sid, rid, r }, actions) => {
    let what, warn = '';
    if (r.kind === 'leave') {
      const ov = E.leaveOverlap(r.from, r.to || r.from, sid);
      const others = [...new Set(ov.map(o => sName(o.sid)))];
      const bl = E.inBlackout(r.from, r.to || r.from);
      what = `<b>${esc(EG.LEAVE_TYPES[r.leaveType] || 'Leave (unpaid)')}</b>${r.half ? ' (half day)' : ''} · ${fmtDate(r.from)}${r.to && r.to !== r.from ? ' → ' + fmtDate(r.to) : ''} · ${r.days || ''} day(s)`;
      if (others.length) warn += `<span class="flag">Also off: ${esc(others.join(', '))}</span> `;
      if (bl.length) warn += `<span class="flag">Busy period: ${esc(bl.map(b => b.label).join(', '))}</span> `;
      if (r.attachment) warn += `<a href="#" data-act="viewAttach" data-sid="${sid}" data-rid="${rid}">📎 View document</a>`;
    } else what = `<b>Correction</b> · ${fmtDateDow(r.date)} · in ${r.in || '-'} / out ${r.out || '-'}<div class="muted">Scanned: ${(() => { const d = E.day(sid, r.date); return (d.punches.map(p => p.type.toUpperCase() + ' ' + istHM(p.at)).join(', ')) || 'nothing'; })()}</div>`;
    return `<tr><td><b>${esc(sName(sid))}</b><div class="muted">${fmtDT(r.at)}</div></td><td class="wrap">${what}<div>${esc(r.reason || '')}</div>${warn}${r.comment ? `<div class="muted">Comment: ${esc(r.comment)} — ${esc(r.decidedBy || '')}</div>` : ''}</td><td>${actions}</td></tr>`;
  };
  return `<div class="bar"><h2>Requests</h2></div>
   <div class="card"><h3>Waiting (${pend.length + po.filter(([, p]) => p.byUid !== APP.uid).length})</h3>
   ${pend.length ? `<div class="tw"><table><tr><th>Staff</th><th>Request</th><th></th></tr>${pend.map(x => reqRow(x, `<input id="cm_${x.rid}" placeholder="Comment (optional)" style="width:160px"><br><button class="btn gr s" data-act="decide" data-ok="1" data-sid="${x.sid}" data-rid="${x.rid}">Approve</button> <button class="btn r s" data-act="decide" data-ok="0" data-sid="${x.sid}" data-rid="${x.rid}">Reject</button>`)).join('')}</table></div>` : '<p class="muted">No leave or correction requests waiting.</p>'}
   ${po.length ? `<h3 style="margin-top:14px">Corrections needing a second admin</h3><div class="tw"><table><tr><th>Day</th><th>Change</th><th>By</th><th></th></tr>${po.map(([id, p]) => `<tr><td>${esc(sName(p.sid))}<br>${fmtDateDow(p.ds)}</td><td class="wrap">${esc(p.data.status || 'auto')} ${esc(p.data.in || '')}–${esc(p.data.out || '')}<div>${esc(p.reason)}</div></td><td>${esc(p.by)}<div class="muted">${fmtDT(p.at)}</div></td>
     <td>${p.byUid === APP.uid ? '<span class="muted">Waiting for the other admin</span> <button class="btn g s" data-act="poCancel" data-id="' + id + '">Withdraw</button>' : `<button class="btn gr s" data-act="poOk" data-id="${id}">Approve</button> <button class="btn r s" data-act="poNo" data-id="${id}">Reject</button>`}</td></tr>`).join('')}</table></div>` : ''}
   </div>
   <div class="card"><h3>Recent decisions</h3>${done.length ? `<div class="tw"><table><tr><th>Staff</th><th>Request</th><th>Status</th></tr>${done.slice(0, 40).map(x => reqRow(x, x.r.status === 'approved' ? '<span class="ok">Approved</span>' : `<span class="flag">${esc(x.r.status)}</span>`)).join('')}</table></div>` : '<p class="muted">None yet.</p>'}</div>`;
};
ACT.viewAttach = b => { const r = DATA.requests[b.dataset.sid][b.dataset.rid]; const a = r.attachment || ''; openModal(`<h3>Document</h3>${a.startsWith('data:image') ? `<img src="${a}" style="max-width:100%">` : `<a href="${a}" download="document.pdf" class="btn">Download PDF</a>`}<p><button class="btn g" data-act="closeModal">Close</button></p>`); };
ACT.decide = async b => {
  const sid = b.dataset.sid, rid = b.dataset.rid, ok = b.dataset.ok === '1'; const r = DATA.requests[sid][rid];
  const comment = val('cm_' + rid);
  if (!ok && !comment && !confirm('Reject without a comment?')) return;
  const status = ok ? 'approved' : 'rejected';
  const upd = {};
  upd[`requests/${sid}/${rid}/status`] = status; upd[`requests/${sid}/${rid}/comment`] = comment; upd[`requests/${sid}/${rid}/decidedBy`] = APP.me.name; upd[`requests/${sid}/${rid}/decidedAt`] = TS();
  if (r.kind === 'leave') upd[`leaveCal/${sid}/${rid}`] = { from: r.from, to: r.to || r.from, type: r.leaveType, half: !!r.half, status };
  if (r.kind === 'correction' && ok) {
    const o = { reason: 'Correction request: ' + (r.reason || '') + (comment ? ' · ' + comment : ''), by: APP.me.name, byUid: APP.uid, at: TS() };
    if (r.in) o.in = r.in; if (r.out) o.out = r.out;
    const ex = (DATA.overrides[sid] || {})[r.date]; if (ex) { if (!r.in && ex.in) o.in = ex.in; if (!r.out && ex.out) o.out = ex.out; }
    upd[`overrides/${sid}/${r.date}`] = o;
  }
  await dbUpdate(upd);
  await log('request-' + status, `${sName(sid)} · ${r.kind} ${r.kind === 'leave' ? r.leaveType + ' ' + r.from + '→' + (r.to || r.from) : r.date} ${comment ? '· ' + comment : ''}`);
  toast(ok ? 'Approved' : 'Rejected');
};
ACT.poOk = async b => {
  const p = DATA.pendingOverrides[b.dataset.id]; if (p.byUid === APP.uid) return toast('Another admin must approve');
  const o = Object.assign({}, p.data, { reason: p.reason + ' (approved by ' + APP.me.name + ')', approvedBy: APP.me.name });
  await dbUpdate({ [`overrides/${p.sid}/${p.ds}`]: o, [`pendingOverrides/${b.dataset.id}`]: null });
  await log('override-approved', `${sName(p.sid)} · ${p.ds} · by ${p.by}, approved by ${APP.me.name}`); toast('Approved');
};
ACT.poNo = async b => { const p = DATA.pendingOverrides[b.dataset.id]; await dbSet('pendingOverrides/' + b.dataset.id, null); await log('override-rejected', `${sName(p.sid)} · ${p.ds} · by ${p.by}`); toast('Rejected'); };
ACT.poCancel = async b => { await dbSet('pendingOverrides/' + b.dataset.id, null); toast('Withdrawn'); };

/* ---------- DEVICES ---------- */
VIEWS.devices = function () {
  const dr = Object.entries(DATA.deviceRequests || {}), kr = Object.entries(DATA.kioskRequests || {}), ar = Object.entries(DATA.adminRequests || {});
  const kiosks = Object.entries(DATA.kiosks || {});
  const kioskURL = location.origin + location.pathname + '?kiosk';
  return `<div class="bar"><h2>Devices &amp; access</h2></div>
  <div class="card"><h3>Staff phones waiting for approval</h3>${dr.length ? `<div class="tw"><table><tr><th>Selfie</th><th>Says they are</th><th>Phone</th><th></th></tr>${dr.map(([uid, r]) => `<tr><td>${r.selfie ? `<img class="selfie" src="${r.selfie}">` : ''}</td><td><b>${esc(sName(r.sid))}</b><div class="muted">code ${esc(r.code || uid.slice(-6).toUpperCase())} · ${fmtDT(r.at)}</div>${(DATA.staffPrivate[r.sid] || {}).device ? '<span class="flag">Replaces their current phone</span>' : ''}</td><td class="wrap muted">${esc(r.ua || '')}</td>
    <td><button class="btn gr s" data-act="devOk" data-uid="${uid}">Approve</button> <button class="btn r s" data-act="devNo" data-uid="${uid}">Reject</button></td></tr>`).join('')}</table></div>` : '<p class="muted">None.</p>'}
   <p class="muted">Each staff member can use only one approved phone. Approving a new phone switches off the old one.</p></div>
  <div class="card"><h3>Office QR screens</h3>
   <p>Open this link on the office PC: <b>${esc(kioskURL)}</b> <button class="btn g s" data-act="copyText" data-t="${esc(kioskURL)}">Copy</button></p>
   ${kr.length ? `<div class="tw"><table><tr><th>Code</th><th>Browser</th><th></th></tr>${kr.map(([uid, r]) => `<tr><td><b style="font-size:18px">${esc(r.code)}</b><div class="muted">${fmtDT(r.at)}</div></td><td class="wrap muted">${esc(r.ua || '')}</td><td><input id="kn_${uid}" value="Office PC" style="width:120px"> <button class="btn gr s" data-act="kioskOk" data-uid="${uid}">Approve</button> <button class="btn r s" data-act="kioskNo" data-uid="${uid}">Reject</button></td></tr>`).join('')}</table></div>` : ''}
   ${kiosks.length ? `<table>${kiosks.map(([uid, k]) => { const s = (DATA.kioskState || {})[uid]; const on = s && nowMs() - s.at < 60000; return `<tr><td>${on ? '🟢' : '🔴'} <b>${esc(k.name)}</b></td><td class="muted">${s ? 'last seen ' + fmtDT(s.at) + ' · network ' + esc(s.ip || '?') : 'never'}</td><td><button class="btn g s" data-act="kioskRemove" data-uid="${uid}">Remove</button></td></tr>`; }).join('')}</table>` : '<p class="muted">No QR screen approved yet.</p>'}</div>
  <div class="card"><h3>Registered staff phones</h3><table>${staffIds(true).map(sid => { const d = (DATA.staffPrivate[sid] || {}).device; return `<tr><td><b>${esc(sName(sid))}</b></td><td class="muted wrap">${d ? esc(d.ua || '') + '<br>approved ' + fmtDT(d.approvedAt) + ' by ' + esc(d.by || '') : 'No phone registered'}</td><td>${d ? `<button class="btn g s" data-act="devRevoke" data-sid="${sid}">Revoke</button>` : ''}</td></tr>`; }).join('')}</table></div>
  <div class="card"><h3>Admins</h3>${ar.length ? `<div class="warn">Waiting: ${ar.map(([uid, r]) => `<b>${esc(r.name)}</b> (${esc(r.email)}) <button class="btn gr s" data-act="adminOk" data-uid="${uid}">Approve as admin</button> <button class="btn r s" data-act="adminNo" data-uid="${uid}">Reject</button>`).join('<br>')}</div>` : ''}
   <table>${Object.entries(DATA.admins || {}).map(([uid, a]) => `<tr><td><b>${esc(a.name)}</b>${a.owner ? ' <span class="ok">owner</span>' : ''}</td><td class="muted">${esc(a.email)}</td><td>${uid !== APP.uid ? `<button class="btn g s" data-act="adminRemove" data-uid="${uid}">Remove</button>` : '<span class="muted">you</span>'}</td></tr>`).join('')}</table>
   <p class="muted">Partners sign up at the Admin login (“New partner? Create admin account”) and appear here for approval.</p></div>`;
};
ACT.copyText = async b => { try { await navigator.clipboard.writeText(b.dataset.t); toast('Copied'); } catch (e) { prompt('Copy this:', b.dataset.t); } };
ACT.devOk = async b => {
  const uid = b.dataset.uid; const r = DATA.deviceRequests[uid];
  const old = (DATA.staffPrivate[r.sid] || {}).device;
  const upd = { [`deviceMap/${uid}`]: r.sid, [`staffPrivate/${r.sid}/device`]: { uid, ua: r.ua || '', approvedAt: TS(), by: APP.me.name }, [`deviceRequests/${uid}`]: null };
  if (old && old.uid && old.uid !== uid) upd[`deviceMap/${old.uid}`] = null;
  await dbUpdate(upd); await log('device-approved', `${sName(r.sid)} phone approved${old ? ' (replaced old phone)' : ''}`); toast('Phone approved');
};
ACT.devNo = async b => { const r = DATA.deviceRequests[b.dataset.uid]; await dbSet('deviceRequests/' + b.dataset.uid, null); await log('device-rejected', sName(r.sid)); };
ACT.devRevoke = async b => { const sid = b.dataset.sid; const d = DATA.staffPrivate[sid].device; if (!confirm('Revoke ' + sName(sid) + "'s phone? They will need to register again.")) return; await dbUpdate({ [`deviceMap/${d.uid}`]: null, [`staffPrivate/${sid}/device`]: null }); await log('device-revoked', sName(sid)); };
ACT.kioskOk = async b => { const uid = b.dataset.uid; await dbUpdate({ [`kiosks/${uid}`]: { name: val('kn_' + uid) || 'Office PC', approvedAt: TS(), by: APP.me.name }, [`kioskRequests/${uid}`]: null }); await log('kiosk-approved', val('kn_' + uid)); toast('QR screen approved'); };
ACT.kioskNo = async b => { await dbSet('kioskRequests/' + b.dataset.uid, null); };
ACT.kioskRemove = async b => { if (!confirm('Remove this QR screen?')) return; await dbUpdate({ [`kiosks/${b.dataset.uid}`]: null, [`kioskState/${b.dataset.uid}`]: null }); await log('kiosk-removed', b.dataset.uid); };
ACT.adminOk = async b => { const uid = b.dataset.uid, r = DATA.adminRequests[uid]; await dbUpdate({ [`admins/${uid}`]: { email: r.email, name: r.name, since: TS(), by: APP.me.name }, [`adminRequests/${uid}`]: null }); await log('admin-approved', r.name); toast('Admin approved'); };
ACT.adminNo = async b => { await dbSet('adminRequests/' + b.dataset.uid, null); };
ACT.adminRemove = async b => { const a = DATA.admins[b.dataset.uid]; if (!confirm('Remove admin access for ' + a.name + '?')) return; await dbSet('admins/' + b.dataset.uid, null); await log('admin-removed', a.name); };

/* ---------- STAFF (#42 revisions, #57 dob, #59 assets, #62 shifts, #48 join/leave) ---------- */
VIEWS.staff = function () {
  const ids = staffIds(true);
  return `<div class="bar"><h2>Staff</h2><button class="btn" data-act="editStaff" data-sid="">+ Add staff</button></div>
  <div class="tw"><table><tr><th>Name</th><th>Emp ID</th><th>Designation</th><th class="n">Salary now</th><th>Timing</th><th>Joined</th><th>Phone</th><th>Status</th><th></th></tr>
  ${ids.map(sid => { const u = DATA.staff[sid], p = DATA.staffPrivate[sid] || {}; const sh = E.shiftOf(sid); return `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.empId || '')}</td><td>${esc(u.designation || '')}</td>
   <td class="n">${inr(E.rate(sid, mkOf(E.today)))}${!E.rate(sid, mkOf(E.today)) ? '<br><span class="flag">set salary</span>' : ''}</td><td>${sh.start}–${sh.end}</td><td>${fmtDate(u.joinDate)}</td>
   <td>${p.device ? '✅' : '<span class="muted">not registered</span>'}</td><td>${u.active === false ? 'Inactive' + (u.leftDate ? ' (left ' + fmtDate(u.leftDate) + ')' : '') : 'Active'}</td>
   <td><button class="btn o s" data-act="editStaff" data-sid="${sid}">Edit</button></td></tr>`; }).join('')}</table></div>
  <p class="muted">Admins / partners are not staff — they have no attendance or salary here.</p>`;
};
ACT.editStaff = b => {
  const sid = b.dataset.sid || '';
  const u = sid ? DATA.staff[sid] : { active: true }; const p = sid ? (DATA.staffPrivate[sid] || {}) : {};
  const st = settingsDefaults();
  const revs = Object.entries(p.revisions || {}).sort();
  const assets = Object.entries(p.assets || {});
  openModal(`<h3>${sid ? 'Edit ' + esc(u.name) : 'Add staff'}</h3>
   <div class="form">
    <div class="sec">Profile</div>
    <label>Full name<input id="f_name" value="${esc(u.name || '')}"></label><label>Employee ID<input id="f_emp" value="${esc(u.empId || '')}" placeholder="SS-00005"></label>
    <label>Designation<input id="f_des" value="${esc(u.designation || '')}"></label><label>Mobile (for WhatsApp)<input id="f_mob" value="${esc(p.mobile || '')}" inputmode="tel"></label>
    <label>Email (payslips are emailed here)<input id="f_email" type="email" value="${esc(p.email || '')}"></label><label>Date of birth<input type="date" id="f_dob" value="${esc(p.dob || '')}"></label>
    <label>Address<input id="f_addr" value="${esc(p.address || '')}"></label><label>Joining date<input type="date" id="f_join" value="${esc(u.joinDate || '')}"></label>
    <label>Last working day (if left)<input type="date" id="f_left" value="${esc(u.leftDate || '')}"></label><label class="ck" style="margin-top:20px">Active <input type="checkbox" id="f_act" ${u.active !== false ? 'checked' : ''}></label>
    <div class="sec">Timing (blank = office default ${st.shiftStart}–${st.shiftEnd}, break ${st.breakMins} min)</div>
    <label>Shift start<input type="time" id="f_ss" value="${esc(u.shiftStart || '')}"></label><label>Shift end<input type="time" id="f_se" value="${esc(u.shiftEnd || '')}"></label>
    <label>Break minutes<input type="number" id="f_bm" value="${esc(u.breakMins || '')}" min="0"></label><label></label>
    <div class="sec">Pay</div>
    <label>Starting monthly salary (₹)<input type="number" id="f_sal" value="${p.salary || 0}" min="0"></label><label></label>
    ${sid ? `<div class="sec">Salary revisions — arrears for locked months are added automatically</div>
    <div class="full">${revs.length ? `<table>${revs.map(([mk, a]) => `<tr><td>From ${monthName(mk)}</td><td class="n">${inr(a)}</td><td><button class="btn g s" data-act="delRev" data-sid="${sid}" data-mk="${mk}">Delete</button></td></tr>`).join('')}</table>` : '<span class="muted">No revisions yet.</span>'}
      <div class="bar" style="margin-top:6px"><input type="month" id="rv_mk" value="${mkOf(E.today)}"><input type="number" id="rv_amt" placeholder="New monthly salary"><button class="btn s" data-act="addRev" data-sid="${sid}">Add revision</button></div></div>
    <div class="sec">Assets issued</div>
    <div class="full">${assets.length ? `<table><tr><th>Item</th><th>Serial / note</th><th>Issued</th><th>Returned</th><th></th></tr>${assets.map(([id, a]) => `<tr><td>${esc(a.item)}</td><td>${esc(a.serial || '')}</td><td>${fmtDate(a.issued)}</td><td>${a.returned ? fmtDate(a.returned) : '<span class="flag">with staff</span>'}</td><td>${a.returned ? '' : `<button class="btn g s" data-act="assetReturn" data-sid="${sid}" data-id="${id}">Mark returned</button>`} <button class="btn g s" data-act="assetDel" data-sid="${sid}" data-id="${id}">✕</button></td></tr>`).join('')}</table>` : '<span class="muted">Nothing issued.</span>'}
      <div class="bar" style="margin-top:6px"><input id="as_item" placeholder="Item (laptop, keys, ID card)"><input id="as_ser" placeholder="Serial / note"><input type="date" id="as_dt" value="${E.today}"><button class="btn s" data-act="assetAdd" data-sid="${sid}">Add</button></div></div>` : ''}
   </div>
   <p style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="saveStaff" data-sid="${sid}">Save</button><button class="btn g" data-act="closeModal">Cancel</button>
   ${sid ? `<span style="flex:1"></span><button class="btn o" data-act="ffOpen" data-sid="${sid}">Full &amp; final</button>` : ''}</p>`, { wide: true });
};
ACT.saveStaff = async b => {
  let sid = b.dataset.sid; const isNew = !sid;
  const name = val('f_name'); if (!name) return toast('Name required');
  if (isNew) sid = 's' + (val('f_emp').replace(/[^0-9a-z]/gi, '') || uid8());
  if (isNew && DATA.staff[sid]) sid += uid8().slice(0, 3);
  const u = Object.assign({}, DATA.staff[sid] || {}, { name, empId: val('f_emp'), designation: val('f_des'), joinDate: val('f_join'), leftDate: val('f_left'), active: val('f_act'), shiftStart: val('f_ss'), shiftEnd: val('f_se'), breakMins: +val('f_bm') || '' });
  const p0 = DATA.staffPrivate[sid] || {};
  const upd = {};
  Object.keys(u).forEach(k => { if (u[k] === '' || u[k] == null) delete u[k]; });
  upd['staff/' + sid] = u;
  const pf = { mobile: val('f_mob'), email: val('f_email'), dob: val('f_dob'), address: val('f_addr'), salary: +val('f_sal') || 0 };
  Object.entries(pf).forEach(([k, v]) => { upd[`staffPrivate/${sid}/${k}`] = v === '' ? null : v; });
  await dbUpdate(upd);
  await log(isNew ? 'staff-add' : 'staff-edit', name + (p0.salary !== pf.salary && !isNew ? ` · starting salary ${p0.salary || 0} → ${pf.salary}` : ''));
  closeModal(); toast('Saved');
};
ACT.addRev = async b => { const sid = b.dataset.sid, mk = val('rv_mk'), amt = +val('rv_amt'); if (!mk || !(amt > 0)) return toast('Month and amount needed'); await dbSet(`staffPrivate/${sid}/revisions/${mk}`, amt); await log('salary-revision', `${sName(sid)} · from ${mk} · ₹${amt}`); ACT.editStaff({ dataset: { sid } }); toast('Revision added'); };
ACT.delRev = async b => { if (!confirm('Delete this revision?')) return; await dbSet(`staffPrivate/${b.dataset.sid}/revisions/${b.dataset.mk}`, null); await log('salary-revision-deleted', sName(b.dataset.sid) + ' ' + b.dataset.mk); ACT.editStaff({ dataset: { sid: b.dataset.sid } }); };
ACT.assetAdd = async b => { const sid = b.dataset.sid, item = val('as_item'); if (!item) return toast('Item name needed'); await dbSet(`staffPrivate/${sid}/assets/${dbPushKey('x')}`, { item, serial: val('as_ser'), issued: val('as_dt') || E.today }); await log('asset-issued', sName(sid) + ' · ' + item); ACT.editStaff({ dataset: { sid } }); };
ACT.assetReturn = async b => { await dbSet(`staffPrivate/${b.dataset.sid}/assets/${b.dataset.id}/returned`, E.today); ACT.editStaff({ dataset: { sid: b.dataset.sid } }); };
ACT.assetDel = async b => { if (!confirm('Delete this asset entry?')) return; await dbSet(`staffPrivate/${b.dataset.sid}/assets/${b.dataset.id}`, null); ACT.editStaff({ dataset: { sid: b.dataset.sid } }); };
/* =====================================================================
   ADMIN — salary, lock, payslips, bonus, full & final, annual register
   ===================================================================== */
VIEWS.salary = function () {
  const mk = APP.month; const lock = E.isLocked(mk);
  const ids = staffIds(true).filter(sid => DATA.staff[sid].active !== false || E.salary(sid, mk).paidDays > 0 && E.month(sid, mk).presentDays > 0 || (E.snapshot(sid, mk)));
  let tot = 0;
  const rows = ids.map(sid => {
    const s = E.salary(sid, mk); tot += s.net;
    const adj = ((DATA.adjust || {})[sid] || {})[mk] || {};
    const inp = f => `<input class="amt" type="number" min="0" step="1" value="${adj[f] || ''}" data-chg="adj" data-f="${f}" data-sid="${sid}" ${lock ? 'disabled' : ''}>`;
    const c = s.counts || {};
    return `<tr><td><b>${esc(sName(sid))}</b><div class="muted">${esc((DATA.staff[sid] || {}).empId || '')}</div></td>
     <td class="n">${inr(s.monthly)}${!s.monthly ? '<br><span class="flag">set salary</span>' : ''}</td>
     <td class="n">${(c.P || 0)} / ${c.H || 0} / ${(c.A || 0) + (c.UL || 0) + (c.SL || 0)}${s.noReport ? `<br><span class="flag">${s.noReport} no report</span>` : ''}${s.missingOut ? `<br><span class="flag">${s.missingOut} no check-out</span>` : ''}</td>
     <td class="n">${s.late}${s.lateDays ? `<br><span class="flag">−${s.lateDays}d</span>` : ''}</td>
     <td class="n">${s.ot || ''}</td>
     <td class="n"><b>${s.paidDays}</b>/${s.D}<div class="muted">LOP ${s.lop}</div></td>
     <td class="n">${inr(s.earned + s.otAmt)}${s.arrears && s.arrears.total ? `<div class="muted">+ arrears ${inr(s.arrears.total)}</div>` : ''}</td>
     <td class="n">${inp('bonus')}</td><td class="n">${inp('incentive')}</td><td class="n">${inp('advance')}</td><td class="n">${inp('other')}</td>
     <td class="n"><b>${inr(s.net)}</b></td>
     <td><button class="btn o s" data-act="payslip" data-sid="${sid}" data-signed="1">Signed</button> <button class="btn g s" data-act="payslip" data-sid="${sid}" data-signed="0">Unsigned</button> <button class="btn g s" data-act="waSlip" data-sid="${sid}">WhatsApp</button></td></tr>`;
  }).join('');
  const prov = ids.some(sid => E.month(sid, mk).provisional);
  return `<div class="bar"><h2>Salary — ${monthName(mk)}</h2>${monthPicker()}
    <button class="btn ${lock ? 'g' : ''} s" data-act="toggleLock">${lock ? '🔒 Locked — unlock' : 'Finalise &amp; lock month'}</button></div>
   <div class="bar"><button class="btn o s" data-act="payslipAll" data-signed="1">Print all (signed &amp; stamped)</button><button class="btn g s" data-act="payslipAll" data-signed="0">Print all (unsigned)</button>
    <button class="btn g s" data-act="exportSalary">Export Excel</button><button class="btn g s" data-act="bonusCalc">Diwali bonus</button><button class="btn g s" data-act="annualReg">Annual salary register</button></div>
   ${lock ? `<div class="ok" style="display:block;padding:8px;margin-bottom:10px">Locked by ${esc((DATA.locks[mk] || {}).by || '')} on ${fmtDT((DATA.locks[mk] || {}).at)}. Figures are frozen. ${DATA.locks[mk] && DATA.locks[mk].emailed ? 'Payslips emailed.' : 'Payslips will be emailed by the automatic job to staff with an email address.'}</div>` : ''}
   ${prov && !lock ? '<div class="warn">Provisional: the month is not over. Upcoming days are counted as paid until they happen.</div>' : ''}
   <div class="tw"><table><tr><th>Staff</th><th class="n">Monthly</th><th class="n">P / ½ / A</th><th class="n">Late</th><th class="n">Off-day</th><th class="n">Paid days</th><th class="n">Earned</th><th class="n">Bonus</th><th class="n">Incentive</th><th class="n">Advance</th><th class="n">Other ded.</th><th class="n">Net pay</th><th></th></tr>
   ${rows}<tr><td colspan="11" class="n"><b>Total</b></td><td class="n"><b>${inr(tot)}</b></td><td></td></tr></table></div>
   <p class="muted">Per day = monthly ÷ days in month. Weekly offs/holidays paid. No check-out = ${settingsDefaults().missingOutAs === 'H' ? 'half day' : settingsDefaults().missingOutAs === 'A' ? 'absent' : 'full day'} until corrected. No paid leave — all leave is unpaid. Days without a daily report (NR) are unpaid. ${E.S.payOffDayWork ? 'Work on a weekly off / holiday is paid as an extra day.' : ''}</p>`;
};
CHG.adj = async el => {
  const mk = APP.month; if (E.isLocked(mk)) return toast('Month is locked');
  const v = el.value === '' ? null : Math.max(0, Math.round(+el.value));
  await dbSet(`adjust/${el.dataset.sid}/${mk}/${el.dataset.f}`, v);
  await log('salary-adjust', `${sName(el.dataset.sid)} · ${mk} · ${el.dataset.f} = ${v || 0}`);
};
ACT.toggleLock = async () => {
  const mk = APP.month;
  if (E.isLocked(mk)) {
    if (!confirm('Unlock ' + monthName(mk) + '? Salary will be recalculated live.')) return;
    const upd = { [`locks/${mk}`]: null, [`snapshots/${mk}`]: null };
    Object.entries(DATA.snapshots || {}).forEach(([m, ss]) => Object.entries(ss || {}).forEach(([sid, s]) => { if (s.arrearsPaidIn === mk) upd[`snapshots/${m}/${sid}/arrearsPaidIn`] = null; }));
    await dbUpdate(upd); await log('unlock', mk); return toast('Unlocked');
  }
  const ids = staffIds(true).filter(sid => { const m = E.month(sid, mk); return DATA.staff[sid].active !== false || m.presentDays > 0; });
  const prov = ids.some(sid => E.month(sid, mk).provisional);
  if (!confirm(`Lock ${monthName(mk)}?${prov ? '\n\nWARNING: the month is not over yet.' : ''}\n\nAttendance corrections and salary for this month will be frozen and payslips released to staff.`)) return;
  const upd = { [`locks/${mk}`]: { by: APP.me.name, at: TS() } };
  ids.forEach(sid => {
    const s = E.snapshotFor(sid, mk); upd[`snapshots/${mk}/${sid}`] = s;
    (s.arrears.lines || []).forEach(l => { upd[`snapshots/${l.mk}/${sid}/arrearsPaidIn`] = mk; });
  });
  await dbUpdate(upd); await log('lock', `${mk} · total ${ids.reduce((t, sid) => t + upd[`snapshots/${mk}/${sid}`].net, 0)}`); toast('Month locked');
};

/* ---------- payslip ---------- */
function letterhead() {
  const st = settingsDefaults();
  return `<div class="lh"><h1>${esc(st.company).toUpperCase()}</h1><div>${esc(st.address)}</div><div>Ph: ${esc(st.phones)} · ${esc(st.email)} · ${esc(st.website)}</div></div>`;
}
function signBlock(signed, who) {
  const st = settingsDefaults(); const a = DATA.assets || {};
  const one = (key, name) => `<div class="one">${signed && a['sign_' + key] ? `<img class="sigimg" src="${a['sign_' + key]}">` : '<div class="blank"></div>'}<b>${name}</b><br>Partner</div>`;
  const people = who === 'both' ? [['deepali', 'Deepali Vernekar'], ['shriraj', 'Shriraj Kinekar']] : who === 'shriraj' ? [['shriraj', 'Shriraj Kinekar']] : [['deepali', 'Deepali Vernekar']];
  return `<div class="sigr">For ${esc(st.company)}${signed && a.stamp ? `<br><img class="stamp" src="${a.stamp}">` : ''}<div class="two">${people.map(p => one(p[0], p[1])).join('')}</div></div>`;
}
function payslipDoc(sid, mk, s, signed) {
  const u = s.u || DATA.staff[sid] || {}; const c = s.counts || {}; const st = settingsDefaults();
  const lopAmt = Math.max(0, Math.round(s.monthly - s.earned));
  return `<div class="doc">${letterhead()}<h2>SALARY SLIP — ${monthName(mk).toUpperCase()}</h2>
   <table><tr><td><b>Employee</b></td><td>${esc(u.name)}</td><td><b>Employee ID</b></td><td>${esc(u.empId || '')}</td></tr>
   <tr><td><b>Designation</b></td><td>${esc(u.designation || '')}</td><td><b>Days in month</b></td><td>${s.D}</td></tr></table>
   <table><tr><th>Present</th><th>Half days</th><th>Absent</th><th>No report</th><th>Leave (unpaid)</th><th>Off / holidays</th><th>Late</th><th>Paid days</th><th>LOP days</th></tr>
   <tr><td>${c.P || 0}</td><td>${c.H || 0}</td><td>${c.A || 0}</td><td>${c.NR || 0}</td><td>${(c.UL || 0) + (c.SL || 0)}</td><td>${(c.WO || 0) + (c.HO || 0)}</td><td>${s.late || 0}</td><td><b>${s.paidDays}</b></td><td>${s.lop}</td></tr></table>
   <table><tr><th style="width:38%">Earnings</th><th>₹</th><th style="width:38%">Deductions</th><th>₹</th></tr>
   <tr><td>Monthly salary (fixed)</td><td>${num(s.monthly)}</td><td>Loss of pay (${s.lop} days${s.lateDays ? ', incl. ' + s.lateDays + ' for late marks' : ''})</td><td>${num(lopAmt)}</td></tr>
   <tr><td>Off-day working (${s.ot || 0} day)</td><td>${num(s.otAmt)}</td><td>Advance recovery</td><td>${num(s.advance)}</td></tr>
   <tr><td>Arrears${s.arrears && s.arrears.lines && s.arrears.lines.length ? ' (' + s.arrears.lines.map(l => MON[+l.mk.slice(5) - 1].slice(0, 3)).join(', ') + ')' : ''}</td><td>${num(s.arrears ? s.arrears.total : 0)}</td><td>Other deductions</td><td>${num(s.other)}</td></tr>
   <tr><td>Bonus / Incentive</td><td>${num((s.bonus || 0) + (s.incentive || 0))}</td><td></td><td></td></tr>
   <tr><td class="net">Net pay</td><td class="net" colspan="3">${inr(s.net)} &nbsp; (Rupees ${numWords(s.net)} Only)</td></tr></table>
   ${s.adjNote ? `<div>Note: ${esc(s.adjNote)}</div>` : ''}
   <div class="sig"><div><div class="blank"></div>Employee signature</div>${signBlock(signed, st.signatory)}</div>
   <div class="muted" style="font-size:9px;margin-top:10px">Computer-generated from the attendance system${s.frozen ? ' (finalised)' : ' (provisional)'}.</div></div>`;
}
function printDocs(list) { $('#print-area').innerHTML = list.join(''); setTimeout(() => window.print(), 150); }
ACT.payslip = b => { const sid = b.dataset.sid; printDocs([payslipDoc(sid, APP.month, E.salary(sid, APP.month), b.dataset.signed === '1')]); };
ACT.payslipAll = b => printDocs(staffIds(true).filter(sid => DATA.staff[sid].active !== false || E.snapshot(sid, APP.month)).map(sid => payslipDoc(sid, APP.month, E.salary(sid, APP.month), b.dataset.signed === '1')));
ACT.waSlip = b => {
  const sid = b.dataset.sid; const s = E.salary(sid, APP.month); const p = DATA.staffPrivate[sid] || {};
  const mob = String(p.mobile || '').replace(/\D/g, '').slice(-10);
  const msg = `Dear ${sName(sid)},\nYour salary slip for ${monthName(APP.month)}:\nPaid days: ${s.paidDays}/${s.D} (LOP ${s.lop})\nNet pay: ${inr(s.net)}\nFull payslip is in the attendance app → Payslips.\n— ${settingsDefaults().company}`;
  window.open('https://wa.me/' + (mob ? '91' + mob : '') + '?text=' + encodeURIComponent(msg), '_blank');
};

/* ---------- Diwali bonus ---------- */
ACT.bonusCalc = () => {
  const st = settingsDefaults(); const fy = EG.fyOf(mkOf(E.today));
  openModal('', {
    wide: true, build: () => {
      const f = APP.bonusFY || fy, pct = APP.bonusPct || st.bonusPercent, ceil = APP.bonusCeil != null ? APP.bonusCeil : st.bonusCeiling;
      const rows = staffIds(true).map(sid => ({ sid, b: E.bonusFor(sid, f, +pct, +ceil) }));
      return `<h3>Diwali bonus calculator</h3><p class="muted">Bonus = % × wages earned in the financial year (salary capped at the ceiling, pro-rata to paid days). Eligible after 30 paid days — as in the Payment of Bonus Act (8.33% minimum, 20% maximum). Months before tracking started count as full months.</p>
       <div class="bar"><label>FY <select data-chg="bonusP" data-k="bonusFY">${[fy, fy - 1].map(y => `<option value="${y}" ${y == f ? 'selected' : ''}>${y}-${String(y + 1).slice(2)}</option>`).join('')}</select></label>
        <label>% <input type="number" step="0.01" min="0" value="${pct}" data-chg="bonusP" data-k="bonusPct" style="width:80px"></label>
        <label>Salary ceiling ₹/month (0 = actual salary) <input type="number" value="${ceil}" data-chg="bonusP" data-k="bonusCeil" style="width:90px"></label></div>
       <div class="tw"><table><tr><th>Staff</th><th class="n">Wages counted</th><th class="n">Paid days</th><th>Eligible</th><th class="n">Bonus</th></tr>
       ${rows.map(({ sid, b }) => `<tr><td>${esc(sName(sid))}</td><td class="n">${inr(b.wages)}</td><td class="n">${b.days}</td><td>${b.eligible ? '✅' : '—'}</td><td class="n"><b>${inr(b.bonus)}</b></td></tr>`).join('')}
       <tr><td colspan="4" class="n"><b>Total</b></td><td class="n"><b>${inr(rows.reduce((t, x) => t + x.b.bonus, 0))}</b></td></tr></table></div>
       <div class="bar" style="margin-top:10px">Add to salary of <input type="month" id="bn_mk" value="${APP.month}"> <button class="btn" data-act="bonusApply">Add as bonus</button><button class="btn g" data-act="bonusExport">Excel</button><button class="btn g" data-act="closeModal">Close</button></div>`;
    }
  });
};
CHG.bonusP = el => { APP[el.dataset.k] = +el.value; showModal(); };
function bonusRows() { const st = settingsDefaults(); const f = APP.bonusFY || EG.fyOf(mkOf(E.today)); return staffIds(true).map(sid => ({ sid, b: E.bonusFor(sid, f, +(APP.bonusPct || st.bonusPercent), +(APP.bonusCeil != null ? APP.bonusCeil : st.bonusCeiling)) })); }
ACT.bonusApply = async () => {
  const mk = val('bn_mk'); if (E.isLocked(mk)) return toast('That month is locked');
  const upd = {}; bonusRows().forEach(({ sid, b }) => { if (b.bonus) upd[`adjust/${sid}/${mk}/bonus`] = b.bonus; });
  if (!confirm(`Set bonus in ${monthName(mk)} salary for ${Object.keys(upd).length} staff? (replaces any bonus already entered there)`)) return;
  await dbUpdate(upd); await log('bonus', `Diwali bonus added to ${mk}`); closeModal(); APP.month = mk; APP.view = 'salary'; render(); toast('Bonus added');
};
ACT.bonusExport = () => xlsx([['Bonus', [['Emp ID', 'Name', 'Wages counted', 'Paid days', 'Eligible', 'Bonus']].concat(bonusRows().map(({ sid, b }) => [DATA.staff[sid].empId || '', sName(sid), b.wages, b.days, b.eligible ? 'Yes' : 'No', b.bonus]))]], 'Diwali_Bonus.xlsx');

/* ---------- Full & final settlement ---------- */
ACT.ffOpen = b => {
  const sid = b.dataset.sid; const u = DATA.staff[sid];
  APP.ff = { sid, lwd: u.leftDate || E.today, notice: 0, adv: 0, other: 0, bonus: 0 };
  openModal('', { wide: true, build: ffBuild });
};
function ffCalc() {
  const f = APP.ff; const sid = f.sid; const u = DATA.staff[sid];
  const tmp = JSON.parse(JSON.stringify(DATA)); tmp.staff[sid] = Object.assign({}, u, { leftDate: f.lwd });
  const e2 = EG.create(tmp, nowMs()); const mk = mkOf(f.lwd); const s = e2.salary(sid, mk, { live: true });
  const perDay = s.monthly / s.D;
  const noticeAmt = Math.round((+f.notice || 0) * perDay);
  const total = s.net + (+f.bonus || 0) - noticeAmt - (+f.adv || 0) - (+f.other || 0);
  const assets = Object.values((DATA.staffPrivate[sid] || {}).assets || {}).filter(a => !a.returned);
  return { s, mk, perDay, noticeAmt, total: Math.round(total), assets };
}
function ffBuild() {
  const f = APP.ff, c = ffCalc(); const u = DATA.staff[f.sid];
  const inp = (k, t) => `<input type="${t || 'number'}" value="${f[k]}" data-chg="ffP" data-k="${k}" style="width:${t === 'date' ? 150 : 90}px">`;
  return `<h3>Full &amp; final — ${esc(u.name)}</h3>
   <div class="bar">Last working day ${inp('lwd', 'date')}</div>
   <div class="bar">Bonus due ₹ ${inp('bonus')} · Notice shortfall days ${inp('notice')} · Advance pending ₹ ${inp('adv')} · Other deductions ₹ ${inp('other')}</div>
   ${c.assets.length ? `<div class="warn">Assets not returned: ${c.assets.map(a => esc(a.item)).join(', ')}</div>` : '<div class="ok" style="display:block;padding:6px;margin-bottom:8px">All assets returned</div>'}
   <table><tr><td>Salary for ${monthName(c.mk)} up to ${fmtDate(f.lwd)} (${c.s.paidDays} paid days)</td><td class="n">${inr(c.s.net)}</td></tr>
    <tr><td>Bonus</td><td class="n">${inr(f.bonus)}</td></tr>
    <tr><td>Less: notice shortfall (${f.notice} days)</td><td class="n">− ${inr(c.noticeAmt)}</td></tr>
    <tr><td>Less: advance / other</td><td class="n">− ${inr((+f.adv || 0) + (+f.other || 0))}</td></tr>
    <tr><td><b>Net payable</b></td><td class="n"><b>${inr(c.total)}</b></td></tr></table>
   <p style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn o" data-act="ffPrint" data-signed="1">Print (signed)</button><button class="btn g" data-act="ffPrint" data-signed="0">Print (unsigned)</button>
    <button class="btn r" data-act="ffMarkLeft">Mark as left on ${fmtDate(f.lwd)}</button><button class="btn g" data-act="closeModal">Close</button></p>`;
}
CHG.ffP = el => { APP.ff[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.type === 'date' ? el.value : +el.value || 0; showModal(); };
ACT.ffPrint = b => {
  const f = APP.ff, c = ffCalc(), u = DATA.staff[f.sid];
  printDocs([`<div class="doc">${letterhead()}<h2>FULL &amp; FINAL SETTLEMENT</h2>
   <table><tr><td><b>Employee</b></td><td>${esc(u.name)} (${esc(u.empId || '')})</td><td><b>Designation</b></td><td>${esc(u.designation || '')}</td></tr>
   <tr><td><b>Date of joining</b></td><td>${fmtDate(u.joinDate)}</td><td><b>Last working day</b></td><td>${fmtDate(f.lwd)}</td></tr></table>
   <table><tr><th>Particulars</th><th>₹</th></tr>
   <tr><td>Salary for ${monthName(c.mk)} (${c.s.paidDays} paid days)</td><td>${num(c.s.net)}</td></tr>
   <tr><td>Bonus</td><td>${num(f.bonus)}</td></tr>
   <tr><td>Less: notice period shortfall (${f.notice} days)</td><td>(${num(c.noticeAmt)})</td></tr>
   <tr><td>Less: advance / other recoveries</td><td>(${num((+f.adv || 0) + (+f.other || 0))})</td></tr>
   <tr><td class="net">Net amount payable</td><td class="net">${inr(c.total)}</td></tr></table>
   <p>(Rupees ${numWords(c.total)} Only)</p>
   <p>Company assets: ${c.assets.length ? 'Pending return — ' + c.assets.map(a => esc(a.item)).join(', ') : 'All returned.'}</p>
   <p>I have received the above amount in full and final settlement of all my dues and have no further claim against the firm.</p>
   <div class="sig"><div><div class="blank"></div>Employee signature<br>Date:</div>${signBlock(b.dataset.signed === '1', 'both')}</div></div>`]);
};
ACT.ffMarkLeft = async () => {
  const f = APP.ff; if (!confirm(`Mark ${sName(f.sid)} as left on ${fmtDate(f.lwd)}? Their phone access will be revoked.`)) return;
  const d = (DATA.staffPrivate[f.sid] || {}).device;
  const upd = { [`staff/${f.sid}/leftDate`]: f.lwd, [`staff/${f.sid}/active`]: false };
  if (d) { upd[`deviceMap/${d.uid}`] = null; upd[`staffPrivate/${f.sid}/device`] = null; }
  await dbUpdate(upd); await log('staff-left', sName(f.sid) + ' · ' + f.lwd); closeModal(); toast('Marked as left');
};

/* ---------- Annual salary register ---------- */
function annualData(fy) {
  const months = []; for (let i = 0; i < 12; i++) months.push(addMonths(fy + '-04', i));
  const ids = staffIds(true);
  const rows = ids.map(sid => { const vals = months.map(mk => (mk > mkOf(E.today) || mk < (E.S.trackStart || '0000').slice(0, 7)) ? null : E.salary(sid, mk)); return { sid, vals }; });
  return { months, rows };
}
ACT.annualReg = () => {
  const fy = APP.arFY || EG.fyOf(mkOf(E.today));
  openModal('', {
    wide: true, build: () => {
      const f = APP.arFY || fy; const d = annualData(f);
      return `<h3>Annual salary register — FY ${f}-${String(f + 1).slice(2)}</h3>
      <div class="bar"><select data-chg="arFY">${[fy, fy - 1, fy - 2].map(y => `<option value="${y}" ${y == f ? 'selected' : ''}>${y}-${String(y + 1).slice(2)}</option>`).join('')}</select>
       <button class="btn o s" data-act="arPrint">Print</button><button class="btn g s" data-act="arExport">Excel</button><button class="btn g s" data-act="closeModal">Close</button></div>
      <div class="tw"><table><tr><th>Staff</th>${d.months.map(mk => `<th class="n">${MON[+mk.slice(5) - 1].slice(0, 3)}</th>`).join('')}<th class="n">Total</th></tr>
      ${d.rows.map(r => `<tr><td>${esc(sName(r.sid))}</td>${r.vals.map(s => `<td class="n">${s ? num(s.net) : ''}</td>`).join('')}<td class="n"><b>${num(r.vals.reduce((t, s) => t + (s ? s.net : 0), 0))}</b></td></tr>`).join('')}
      <tr><td><b>Total</b></td>${d.months.map((mk, i) => `<td class="n"><b>${num(d.rows.reduce((t, r) => t + (r.vals[i] ? r.vals[i].net : 0), 0))}</b></td>`).join('')}<td class="n"><b>${num(d.rows.reduce((t, r) => t + r.vals.reduce((x, s) => x + (s ? s.net : 0), 0), 0))}</b></td></tr></table></div>`;
    }
  });
};
CHG.arFY = el => { APP.arFY = +el.value; showModal(); };
ACT.arPrint = () => {
  const f = APP.arFY || EG.fyOf(mkOf(E.today)); const d = annualData(f);
  printDocs([`<div class="doc small">${letterhead()}<h2>ANNUAL SALARY REGISTER — FY ${f}-${String(f + 1).slice(2)}</h2>
   <table><tr><th>Employee</th><th>Item</th>${d.months.map(mk => `<th>${MON[+mk.slice(5) - 1].slice(0, 3)}</th>`).join('')}<th>Total</th></tr>
   ${d.rows.map(r => ['monthly', 'paidDays', 'gross', 'ded', 'net'].map((k, i) => `<tr>${i === 0 ? `<td rowspan="5">${esc(sName(r.sid))}<br>${esc(DATA.staff[r.sid].empId || '')}</td>` : ''}<td>${{ monthly: 'Rate', paidDays: 'Paid days', gross: 'Gross', ded: 'Deductions', net: 'Net' }[k]}</td>${r.vals.map(s => `<td>${s ? (k === 'paidDays' ? s[k] : num(s[k])) : ''}</td>`).join('')}<td>${k === 'paidDays' || k === 'monthly' ? '' : num(r.vals.reduce((t, s) => t + (s ? s[k] : 0), 0))}</td></tr>`).join('')).join('')}
   </table><div class="sig"><div></div>${signBlock(false, 'both')}</div></div>`]);
};
ACT.arExport = () => {
  const f = APP.arFY || EG.fyOf(mkOf(E.today)); const d = annualData(f);
  const head = ['Emp ID', 'Name', 'Item'].concat(d.months.map(mk => monthName(mk)), ['Total']);
  const rows = [head]; d.rows.forEach(r => ['monthly', 'paidDays', 'gross', 'ded', 'net'].forEach(k => rows.push([DATA.staff[r.sid].empId || '', sName(r.sid), k].concat(r.vals.map(s => s ? s[k] : ''), [k === 'monthly' || k === 'paidDays' ? '' : r.vals.reduce((t, s) => t + (s ? s[k] : 0), 0)]))));
  xlsx([['Annual register', rows]], `Salary_Register_FY${f}.xlsx`);
};

/* ---------- Excel helpers ---------- */
function xlsx(sheets, fname) {
  if (!window.XLSX) return toast('Excel library not loaded (check internet)');
  const wb = XLSX.utils.book_new(); sheets.forEach(([n, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n.slice(0, 31)));
  XLSX.writeFile(wb, fname);
}
ACT.exportSalary = () => {
  const mk = APP.month;
  const rows = [['Emp ID', 'Name', 'Monthly', 'Per day', 'Days', 'Paid days', 'LOP', 'No report days', 'Late', 'Late cut', 'Off-day', 'Earned', 'Off-day pay', 'Arrears', 'Bonus', 'Incentive', 'Advance', 'Other', 'Net']];
  staffIds(true).forEach(sid => { const s = E.salary(sid, mk); rows.push([DATA.staff[sid].empId || '', sName(sid), s.monthly, s.perDay, s.D, s.paidDays, s.lop, s.noReport || 0, s.late, s.lateDays, s.ot, s.earned, s.otAmt, s.arrears ? s.arrears.total : 0, s.bonus, s.incentive, s.advance, s.other, s.net]); });
  xlsx([['Salary', rows]], `Salary_${mk}.xlsx`);
};
ACT.exportMonth = () => {
  const mk = APP.month, D = daysIn(mk);
  const reg = [['Emp ID', 'Name'].concat(Array.from({ length: D }, (_, i) => i + 1), ['Present', 'Half', 'Leave', 'Absent/No report', 'Late', 'Hours', 'Paid days', 'LOP'])];
  const det = [['Date', 'Day', 'Emp ID', 'Name', 'Status', 'In', 'Out', 'Hours', 'Break min', 'Late min', 'Early reason', 'Daily report', 'Flags', 'Correction']];
  staffIds(true).forEach(sid => {
    const m = E.month(sid, mk), s = E.salary(sid, mk, { live: true }), c = m.counts, u = DATA.staff[sid];
    reg.push([u.empId || '', u.name].concat(Array.from({ length: D }, (_, i) => { const x = m.days[i + 1].code; return ['FUT', 'NJ', 'NT', 'PEND'].includes(x) ? '' : x; }), [c.P || 0, c.H || 0, (c.SL || 0) + (c.UL || 0), (c.A || 0) + (c.NR || 0), m.late, r2(m.hours), s.paidDays, s.lop]));
    for (let d = 1; d <= D; d++) { const r = m.days[d]; if (['FUT', 'NJ', 'NT'].includes(r.code)) continue; det.push([fmtDate(r.ds), DOW[dsDow(r.ds)], u.empId || '', u.name, codeLabel(r.code), r.in || '', r.out || '', r2(r.hours) || '', r.breakMin || '', r.lateMin || '', r.earlyReason, r.report && r.report.ok ? 'Sent ' + istHM(r.report.shared) : (r.report && r.report.uploaded ? 'Uploaded, not sent' : ''), r.flags.join('; '), r.override ? r.override.reason : '']); }
  });
  xlsx([['Register', reg], ['Daily detail', det]], `Attendance_${mk}.xlsx`);
};
ACT.printRegister = () => {
  const mk = APP.month, D = daysIn(mk);
  let h = `<div class="doc small">${letterhead()}<h2>ATTENDANCE REGISTER — ${monthName(mk).toUpperCase()}</h2><table><tr><th>Staff</th>`;
  for (let d = 1; d <= D; d++) h += `<th>${d}</th>`; h += '<th>Paid</th><th>LOP</th></tr>';
  staffIds(true).forEach(sid => { const m = E.month(sid, mk), s = E.salary(sid, mk, { live: true }); h += `<tr><td style="text-align:left">${esc(sName(sid))}</td>`; for (let d = 1; d <= D; d++) { const c = m.days[d].code; h += `<td>${['FUT', 'NJ', 'NT', 'PEND'].includes(c) ? '' : c}</td>`; } h += `<td>${s.paidDays}</td><td>${s.lop}</td></tr>`; });
  h += `</table><p style="font-size:9px">P Present · H Half day · A Absent · NR No daily report (unpaid) · UL Leave (unpaid) · SL Sick leave (unpaid) · WO Weekly off · HO Holiday</p></div>`;
  printDocs([h]);
};
/* =====================================================================
   ADMIN — reports, letters, settings, log
   ===================================================================== */
const REPORTS = {
  reportsent: 'Daily report compliance',
  late: 'Late-comers ranking', arrival: 'Average arrival / departure', hours: 'Hours worked (week-wise)', pattern: 'Absence pattern',
  year: 'Year summary', weekly: 'Weekly ranking (Wed–Mon)', compare: 'Compare months', range: 'Custom date range', cost: 'Salary cost trend'
};
function monthRange(mk) { return [mk + '-01', mk + '-' + pad(daysIn(mk))]; }
function reportData(k) {
  const ids = staffIds(true).filter(sid => DATA.staff[sid].active !== false);
  const P = APP.rp = APP.rp || {};
  const mk = APP.month; const [mf, mt] = monthRange(mk);
  if (k === 'late') {
    const rows = ids.map(sid => { const s = E.rangeStats(sid, mf, mt); return [sName(sid), s.late, s.lateMin, s.late ? Math.round(s.lateMin / s.late) : 0, s.punctPct + '%']; }).sort((a, b) => b[1] - a[1] || b[2] - a[2]);
    return { title: 'Late-comers — ' + monthName(mk), head: ['Rank', 'Staff', 'Late days', 'Total late min', 'Avg late min', 'Punctuality'], rows: rows.map((r, i) => [i + 1].concat(r)), picker: 'month' };
  }
  if (k === 'reportsent') {
    return { title: 'Daily report compliance — ' + monthName(mk), head: ['Staff', 'Days worked', 'Reports sent', 'Days lost (no report)', 'Compliance %'], picker: 'month',
      rows: ids.map(sid => { const s = E.rangeStats(sid, mf, mt); const worked = s.present + s.half + s.noReport; return [sName(sid), worked, s.reportsSent, s.noReport, worked ? Math.round(s.reportsSent / worked * 100) + '%' : '']; }) };
  }
  if (k === 'arrival') {
    return { title: 'Arrival & departure — ' + monthName(mk), head: ['Staff', 'Shift', 'Avg arrival', 'Earliest', 'Latest', 'Avg departure', 'Early leaving days'], picker: 'month',
      rows: ids.map(sid => { const s = E.rangeStats(sid, mf, mt); const sh = E.shiftOf(sid); return [sName(sid), sh.start + '–' + sh.end, s.avgIn, EG.minToHM(Math.min(...s.arr)) || '', EG.minToHM(Math.max(...s.arr)) || '', s.avgOut, s.early]; }) };
  }
  if (k === 'hours') {
    const weeks = []; let w = E.weekStartFor(mf); while (w <= mt) { weeks.push(w); w = addDays(w, 7); }
    return { title: 'Hours worked — ' + monthName(mk) + ' (weeks Wed–Mon)', head: ['Staff'].concat(weeks.map(w => 'Week ' + fmtDate(w).slice(0, 5)), ['Month total', 'Avg/day']), picker: 'month',
      rows: ids.map(sid => { const ms = E.rangeStats(sid, mf, mt); return [sName(sid)].concat(weeks.map(w => r2(E.rangeStats(sid, w < mf ? mf : w, addDays(w, 6) > mt ? mt : addDays(w, 6)).hours)), [ms.hours, ms.avgHours]); }) };
  }
  if (k === 'pattern') {
    const from = addMonths(mk, -5) + '-01';
    return { title: `Absence pattern — ${monthName(addMonths(mk, -5))} to ${monthName(mk)}`, head: ['Staff', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Total', 'Pattern'], picker: 'month',
      note: 'Pattern = a weekday where absences are at least double the person\'s normal absence rate (and 2 or more times).',
      rows: ids.map(sid => { const s = E.rangeStats(sid, from, mt); const a = s.absByDow; return [sName(sid), a[1], a[2], a[3], a[4], a[5], a[6], a[0], s.absent, s.pattern.length ? '⚠ ' + s.pattern.join(', ') : '']; }) };
  }
  if (k === 'year') {
    const fy = P.fy || EG.fyOf(mk); const from = fy + '-04-01', to = (fy + 1) + '-03-31';
    return { title: `Year summary — FY ${fy}-${String(fy + 1).slice(2)}`, head: ['Staff', 'Working days', 'Present', 'Half', 'Leave', 'Absent', 'Late', 'Hours', 'Attendance %', 'Punctuality %'], picker: 'fy',
      rows: ids.map(sid => { const s = E.rangeStats(sid, from, to); return [sName(sid), s.workDays, s.present, s.half, s.leave, s.absent, s.late, s.hours, s.attPct, s.punctPct]; }) };
  }
  if (k === 'weekly') {
    const ws = P.week || E.weekStartFor(addDays(E.today, -1));
    return { title: `Weekly ranking — ${fmtDateDow(ws)} to ${fmtDateDow(addDays(ws, 5))}`, head: ['Rank', 'Staff', 'Attendance %', 'Punctuality %', 'Late', 'Absent', 'Hours', 'Score'], picker: 'week',
      note: 'Score = 70% attendance + 30% punctuality. Use this in your weekly staff ranking. The automatic job also saves it every Tuesday.',
      rows: E.weekScores(ws).map(x => [x.rank, x.name, x.attPct, x.punctPct, x.late, x.absent, x.hours, x.score]) };
  }
  if (k === 'compare') {
    const ms = P.months || [addMonths(mk, -2), addMonths(mk, -1), mk];
    const head = ['Staff']; ms.forEach(m => head.push(MON[+m.slice(5) - 1].slice(0, 3) + ' att%', 'late', 'hours', 'net ₹'));
    return { title: 'Compare months', head, picker: 'compare', months: ms,
      rows: ids.map(sid => { const r = [sName(sid)]; ms.forEach(m => { const [f, t] = monthRange(m); const s = E.rangeStats(sid, f, t); r.push(s.attPct, s.late, s.hours, E.salary(sid, m).net); }); return r; }) };
  }
  if (k === 'range') {
    const from = P.from || mf, to = P.to || mt;
    return { title: `Attendance ${fmtDate(from)} to ${fmtDate(to)}`, head: ['Staff', 'Working days', 'Present', 'Half', 'Leave', 'Absent', 'Late', 'Early', 'Hours', 'Avg in', 'Avg out', 'Att %'], picker: 'range', from, to,
      rows: ids.map(sid => { const s = E.rangeStats(sid, from, to); return [sName(sid), s.workDays, s.present, s.half, s.leave, s.absent, s.late, s.early, s.hours, s.avgIn, s.avgOut, s.attPct]; }) };
  }
  if (k === 'cost') {
    const months = []; for (let i = 11; i >= 0; i--) months.push(addMonths(mk, -i));
    const start = (E.S.trackStart || '0000').slice(0, 7);
    const all = staffIds(true);
    const rows = months.map(m => { const v = m < start ? null : all.reduce((t, sid) => t + E.salary(sid, m).net, 0); return [monthName(m), v == null ? '' : v, m < start ? '' : all.filter(sid => E.salary(sid, m).net > 0).length]; });
    return { title: 'Salary cost — 12 months to ' + monthName(mk), head: ['Month', 'Total net salary', 'Staff paid'], rows, picker: 'month', chart: true };
  }
}
VIEWS.reports = function () {
  const k = APP.sub && REPORTS[APP.sub] ? APP.sub : 'late'; APP.sub = k;
  const d = reportData(k); const P = APP.rp || {};
  let picker = '';
  if (d.picker === 'month') picker = monthPicker();
  if (d.picker === 'fy') { const fy = P.fy || EG.fyOf(APP.month); picker = `<select data-chg="rpSet" data-k="fy">${[0, 1, 2].map(i => EG.fyOf(mkOf(E.today)) - i).map(y => `<option value="${y}" ${y == fy ? 'selected' : ''}>FY ${y}-${String(y + 1).slice(2)}</option>`).join('')}</select>`; }
  if (d.picker === 'week') { const ws = P.week || E.weekStartFor(addDays(E.today, -1)); picker = `<button class="btn g s" data-act="rpWeek" data-n="-7">◀</button><span>Week from ${fmtDateDow(ws)}</span><button class="btn g s" data-act="rpWeek" data-n="7">▶</button>`; }
  if (d.picker === 'compare') picker = d.months.map((m, i) => `<input type="month" value="${m}" data-chg="rpMonth" data-i="${i}">`).join('');
  if (d.picker === 'range') picker = `<input type="date" value="${d.from}" data-chg="rpSet" data-k="from"> to <input type="date" value="${d.to}" data-chg="rpSet" data-k="to">`;
  if (d.chart) AFTER.push(() => { const c = $('#rpChart'); if (c && window.Chart) APP.charts.push(new Chart(c, { type: 'line', data: { labels: d.rows.map(r => r[0].slice(0, 3) + ' ' + r[0].slice(-2)), datasets: [{ label: 'Net salary', data: d.rows.map(r => r[1] === '' ? null : r[1]), borderColor: '#9b2c3a', backgroundColor: '#9b2c3a', tension: .25 }] }, options: { plugins: { legend: { display: false } } } })); });
  return `<div class="bar"><h2>Reports</h2></div>
   <div class="chips" style="margin-bottom:12px">${Object.entries(REPORTS).map(([kk, n]) => `<button class="chip ${kk === k ? 'on' : ''}" data-act="rpPick" data-k="${kk}">${n}</button>`).join('')}</div>
   <div class="bar"><b>${esc(d.title)}</b><span style="flex:1"></span>${picker}<button class="btn o s" data-act="rpPrint">Print</button><button class="btn s" data-act="rpExcel">Excel</button></div>
   ${d.note ? `<p class="muted">${esc(d.note)}</p>` : ''}
   ${d.chart ? '<div class="card"><canvas id="rpChart" height="110"></canvas></div>' : ''}
   <div class="tw"><table><tr>${d.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${d.rows.map(r => `<tr>${r.map(c => `<td>${typeof c === 'number' && c > 999 ? num(c) : esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
};
ACT.rpPick = b => { APP.sub = b.dataset.k; render(); };
CHG.rpSet = el => { APP.rp = APP.rp || {}; APP.rp[el.dataset.k] = el.dataset.k === 'fy' ? +el.value : el.value; render(); };
CHG.rpMonth = el => { APP.rp = APP.rp || {}; const ms = (APP.rp.months || reportData('compare').months).slice(); ms[+el.dataset.i] = el.value; APP.rp.months = ms; render(); };
ACT.rpWeek = b => { APP.rp = APP.rp || {}; APP.rp.week = addDays(APP.rp.week || E.weekStartFor(addDays(E.today, -1)), +b.dataset.n); render(); };
ACT.rpExcel = () => { const d = reportData(APP.sub); xlsx([[REPORTS[APP.sub], [[d.title], d.head].concat(d.rows)]], `Report_${APP.sub}.xlsx`); };
ACT.rpPrint = () => { const d = reportData(APP.sub); printDocs([`<div class="doc small">${letterhead()}<h2>${esc(d.title).toUpperCase()}</h2><table><tr>${d.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${d.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>${d.note ? `<p>${esc(d.note)}</p>` : ''}</div>`]); };

/* ---------- LETTERS ---------- */
const LETTERS = {
  offer: { name: 'Offer letter', subject: u => `Offer of employment — ${u.designation || ''}` },
  experience: { name: 'Experience certificate', subject: () => 'TO WHOM IT MAY CONCERN' },
  relieving: { name: 'Relieving letter', subject: () => 'Relieving letter' }
};
function letterBody(kind, sid) {
  const u = DATA.staff[sid] || {}, p = DATA.staffPrivate[sid] || {}, st = settingsDefaults(); const sh = E.shiftOf(sid);
  const sal = E.rate(sid, mkOf(u.joinDate || E.today)) || p.salary || 0; const firm = st.company;
  if (kind === 'offer') return `Dear ${u.name},\n\nWe are pleased to offer you the position of ${u.designation || '______'} at ${firm}, with effect from ${fmtDate(u.joinDate) || '__________'}.\n\nYour monthly salary will be ${inr(sal)} (Rupees ${numWords(sal)} Only). Office timings are ${sh.start} to ${sh.end} with a ${sh.brk}-minute break; the office remains closed on ${arr(st.weeklyOff).map(i => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]).join(', ')}.\n\nYou will be on probation for the first three months. Attendance is recorded through the office attendance system together with your daily work report, and salary is calculated on actual paid days. All leave is without pay.\n\nPlease sign and return a copy of this letter as your acceptance.\n\nWe welcome you to the ${firm} family.`;
  if (kind === 'experience') return `This is to certify that ${u.name} was employed with ${firm} as ${u.designation || '______'} from ${fmtDate(u.joinDate) || '__________'} to ${fmtDate(u.leftDate) || '__________'}.\n\nDuring this period we found ${u.name.split(' ')[0]} sincere, hard-working and dependable. ${u.name.split(' ')[0]} handled the assigned responsibilities in housing-society accounting and office work to our satisfaction.\n\nWe wish ${u.name.split(' ')[0]} every success in the future.`;
  return `Dear ${u.name},\n\nWith reference to your resignation, you are relieved from the services of ${firm} at the close of business hours on ${fmtDate(u.leftDate) || '__________'}.\n\nYour full and final settlement has been completed and all company assets have been returned.\n\nWe thank you for your contribution and wish you all the best.`;
}
VIEWS.letters = function () {
  const L = APP.lt = APP.lt || { kind: 'offer', sid: staffIds(true)[0] || '' };
  if (!L.text || L.key !== L.kind + L.sid) { L.text = L.sid ? letterBody(L.kind, L.sid) : ''; L.key = L.kind + L.sid; L.date = L.date || E.today; }
  return `<div class="bar"><h2>Letters</h2></div>
   <div class="card"><div class="form">
    <label>Letter<select data-chg="ltSet" data-k="kind">${Object.entries(LETTERS).map(([k, v]) => `<option value="${k}" ${L.kind === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
    <label>Staff<select data-chg="ltSet" data-k="sid">${staffIds(true).map(sid => `<option value="${sid}" ${L.sid === sid ? 'selected' : ''}>${esc(sName(sid))}</option>`).join('')}</select></label>
    <label>Letter date<input type="date" id="lt_date" value="${L.date}"></label><label>Signed by<select id="lt_who"><option value="both">Both partners</option><option value="deepali">Deepali Vernekar</option><option value="shriraj">Shriraj Kinekar</option></select></label>
    <label class="full">Text (edit freely before printing)<textarea id="lt_text" rows="16" style="width:100%">${esc(L.text)}</textarea></label></div>
    <p><button class="btn o" data-act="ltPrint" data-signed="1">Print signed &amp; stamped</button> <button class="btn g" data-act="ltPrint" data-signed="0">Print unsigned</button> <button class="btn g" data-act="ltReset">Reset text</button></p>
    <p class="muted">Data comes from the staff record (designation, joining / leaving date, salary, timing). Upload signatures and stamp in Settings.</p></div>`;
};
CHG.ltSet = el => { APP.lt[el.dataset.k] = el.value; APP.lt.key = ''; render(); };
ACT.ltReset = () => { APP.lt.key = ''; render(); };
ACT.ltPrint = b => {
  const L = APP.lt; const u = DATA.staff[L.sid] || {}; const text = $('#lt_text').value; L.text = text; L.date = val('lt_date');
  const subj = LETTERS[L.kind].subject(u);
  printDocs([`<div class="doc">${letterhead()}<div style="display:flex;justify-content:space-between"><div>Ref: SS/HR/${L.date.slice(0, 4)}/${esc(u.empId || '')}</div><div>Date: ${fmtDate(L.date)}</div></div>
   ${L.kind !== 'experience' ? `<p>To,<br><b>${esc(u.name)}</b><br>${esc((DATA.staffPrivate[L.sid] || {}).address || '')}</p>` : ''}
   <h2>${esc(subj)}</h2>${text.split(/\n\n+/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
   <div class="sig"><div>${L.kind === 'offer' ? '<div class="blank"></div>Accepted: ' + esc(u.name) + '<br>Date:' : ''}</div>${signBlock(b.dataset.signed === '1', val('lt_who'))}</div></div>`]);
  log('letter', LETTERS[L.kind].name + ' · ' + u.name);
};

/* ---------- SETTINGS ---------- */
const MH_HOLIDAYS = {
  2026: [['2026-01-26', 'Republic Day'], ['2026-02-15', 'Mahashivratri'], ['2026-02-19', 'Chhatrapati Shivaji Maharaj Jayanti'], ['2026-03-03', 'Holi (Second Day)'], ['2026-03-19', 'Gudhi Padwa'],
    ['2026-03-21', 'Ramzan-Id (Id-Ul-Fitr)'], ['2026-03-26', 'Ram Navami'], ['2026-03-31', 'Mahavir Janmakalyanak'], ['2026-04-03', 'Good Friday'], ['2026-04-14', 'Dr. Babasaheb Ambedkar Jayanti'],
    ['2026-05-01', 'Maharashtra Din / Buddha Pournima'], ['2026-05-28', 'Bakri Id (Id-Uz-Zuha)'], ['2026-06-26', 'Moharum'], ['2026-08-15', 'Independence Day / Parsi New Year'], ['2026-08-26', 'Id-E-Milad'],
    ['2026-09-14', 'Ganesh Chaturthi'], ['2026-10-02', 'Mahatma Gandhi Jayanti'], ['2026-10-20', 'Dasara'], ['2026-11-08', 'Diwali Amavasya (Laxmi Pujan)'], ['2026-11-10', 'Diwali (Bali Pratipada)'],
    ['2026-11-11', 'Bhaubeej (state offices only)'], ['2026-11-24', 'Guru Nanak Jayanti'], ['2026-12-25', 'Christmas']]
};
VIEWS.settings = function () {
  const st = settingsDefaults(); const wo = new Set(arr(st.weeklyOff).map(Number));
  const hol = Object.entries(st.holidays || {}).sort(); const bl = Object.entries(st.blackouts || {}).sort((a, b) => a[1].from.localeCompare(b[1].from));
  const a = DATA.assets || {}; const job = DATA.jobState || {};
  const f = (id, label, v, type, extra) => `<label>${label}<input id="${id}" type="${type || 'text'}" value="${esc(v == null ? '' : v)}" ${extra || ''}></label>`;
  return `<div class="bar"><h2>Settings</h2></div>
  <div class="card"><div class="form">
   <div class="sec">Firm (letterhead)</div>
   ${f('c_company', 'Firm name', st.company)}${f('c_address', 'Address', st.address)}${f('c_phones', 'Phones', st.phones)}${f('c_email', 'Email', st.email)}${f('c_web', 'Website', st.website)}
   <label>Payslip signed by<select id="c_sig"><option value="deepali" ${st.signatory === 'deepali' ? 'selected' : ''}>Deepali Vernekar</option><option value="shriraj" ${st.signatory === 'shriraj' ? 'selected' : ''}>Shriraj Kinekar</option><option value="both" ${st.signatory === 'both' ? 'selected' : ''}>Both partners</option></select></label>
   <div class="sec">Office timing &amp; day rules</div>
   ${f('c_ss', 'Office start', st.shiftStart, 'time')}${f('c_se', 'Office end', st.shiftEnd, 'time')}
   ${f('c_grace', 'Late after (minutes of grace)', st.graceMins, 'number', 'min="0"')}${f('c_egrace', 'Early-leaving grace (minutes)', st.earlyGraceMins, 'number', 'min="0"')}
   ${f('c_brk', 'Break allowed (minutes)', st.breakMins, 'number', 'min="0"')}${f('c_lpd', 'Late marks per ½-day cut (0 = off)', st.latesPerHalfDay, 'number', 'min="0"')}
   ${f('c_fh', 'Full day if hours ≥', st.fullHours, 'number', 'step="0.25"')}${f('c_hh', 'Half day if hours ≥ (below = absent)', st.halfHours, 'number', 'step="0.25"')}
   <label>No check-out counts as<select id="c_mo">${[['H', 'Half day'], ['A', 'Absent'], ['P', 'Full day']].map(o => `<option value="${o[0]}" ${st.missingOutAs === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>
   <label class="ck">Pay an extra day for working on weekly off / holiday <input type="checkbox" id="c_odw" ${st.payOffDayWork ? 'checked' : ''}></label>
   <label class="full">Weekly off<span>${DOW.map((d, i) => `<label class="ck" style="display:inline-flex;margin-right:10px">${d} <input type="checkbox" class="c_wo" value="${i}" ${wo.has(i) ? 'checked' : ''}></label>`).join('')}</span></label>
   ${f('c_track', 'Attendance counted from', st.trackStart, 'date')}<label></label>
   <div class="sec">Leave (all leave is unpaid)</div>
   ${f('c_snd', 'Sick leave needs medical note above (days)', st.sickNoteDays, 'number', 'min="0"')}<label></label>
   <div class="sec">Daily report (PDF + photos)</div>
   <label class="ck">Day counts only after the daily report is uploaded <input type="checkbox" id="c_rep_req" ${st.reportRequired ? 'checked' : ''}></label>
   <label class="ck">…and sent to the WhatsApp group <input type="checkbox" id="c_rep_share" ${st.reportShareRequired ? 'checked' : ''}></label>
   ${f('c_rep_min', 'Minimum photos', st.reportMinPhotos, 'number', 'min="0"')}${f('c_rep_keep', 'Keep files in app for (days)', st.reportKeepDays, 'number', 'min="7"')}
   <label class="full">WhatsApp group name<input id="c_wa" value="${esc(st.waGroupName)}"></label>
   <div class="sec">Anti-cheating checks</div>
   <label class="ck">Phone must be on the office internet (same network as QR screen) <input type="checkbox" id="c_net" ${st.requireSameNetwork ? 'checked' : ''}></label>
   <label class="ck">Selfie required at every scan <input type="checkbox" id="c_selfie" ${st.selfieRequired !== false ? 'checked' : ''}></label>
   <label>GPS check<select id="c_gps">${[['flag', 'Record & flag if far'], ['block', 'Block if far from office'], ['off', 'Off']].map(o => `<option value="${o[0]}" ${st.gpsMode === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>
   ${f('c_rad', 'Allowed distance from office (m)', st.gpsRadius, 'number', 'min="30"')}
   ${f('c_lat', 'Office latitude', st.officeLat)}${f('c_lng', 'Office longitude', st.officeLng)}
   <label class="full"><button class="btn g s" data-act="useMyLocation" style="width:max-content">📍 Use this device's current location as office location</button></label>
   <div class="sec">Admin security</div>
   ${f('c_idle', 'Auto-lock admin screen after (minutes, 0 = off)', st.idleLockMins, 'number', 'min="0"')}${f('c_old', 'Corrections older than (days) need 2nd admin', st.oldEditDays, 'number', 'min="0"')}
   <label class="ck">Require second admin for old corrections <input type="checkbox" id="c_2nd" ${st.secondAdminApproval ? 'checked' : ''}></label><label></label>
   <div class="sec">Automatic jobs (GitHub Actions)</div>
   <label class="full">Month-end report emails (comma separated)<input id="c_rep" value="${esc(st.reportEmails)}" placeholder="partner1@gmail.com, partner2@gmail.com"></label>
   ${f('c_bpct', 'Default bonus %', st.bonusPercent, 'number', 'step="0.01"')}${f('c_bceil', 'Bonus salary ceiling ₹', st.bonusCeiling, 'number')}
  </div><p><button class="btn" data-act="saveSettings">Save settings</button></p>
  <p class="muted">Jobs last ran: ${job.lastRun ? fmtDT(job.lastRun) : 'never'} ${job.lastReport ? '· last month-end report ' + esc(job.lastReport) : ''}</p></div>

  <div class="card"><h3>Holidays</h3>
   <div class="bar"><input type="date" id="h_d"><input id="h_n" placeholder="Holiday name"><label class="ck">Announce to staff <input type="checkbox" id="h_ann" checked></label><button class="btn s" data-act="addHoliday">Add</button>
    <button class="btn o s" data-act="importHolidays">Import Maharashtra holidays</button></div>
   ${hol.length ? `<table>${hol.map(([d, n]) => `<tr><td>${fmtDateDow(d)}</td><td>${esc(n)}</td><td><button class="btn g s" data-act="delHoliday" data-d="${d}">Remove</button></td></tr>`).join('')}</table>` : '<p class="muted">No holidays yet.</p>'}</div>

  <div class="card"><h3>Busy periods — no leave allowed except sick leave</h3>
   <div class="bar"><input id="b_l" placeholder="e.g. Audit season"><input type="date" id="b_f"><input type="date" id="b_t"><button class="btn s" data-act="addBlackout">Add</button></div>
   ${bl.length ? `<table>${bl.map(([id, b]) => `<tr><td>${esc(b.label)}</td><td>${fmtDate(b.from)} – ${fmtDate(b.to || b.from)}</td><td><button class="btn g s" data-act="delBlackout" data-id="${id}">Remove</button></td></tr>`).join('')}</table>` : '<p class="muted">None.</p>'}</div>

  <div class="card"><h3>Announcement to all staff</h3>
   <div class="form"><label class="full">Title<input id="n_t"></label><label class="full">Message<textarea id="n_b" rows="2"></textarea></label></div><p><button class="btn s" data-act="sendNotice">Send</button></p></div>

  <div class="card"><h3>Signatures &amp; stamp (for signed payslips / letters)</h3><p class="muted">PNG with transparent background works best. Visible to admins only.</p>
   <div class="grid">${[['sign_deepali', 'Deepali Vernekar — signature'], ['sign_shriraj', 'Shriraj Kinekar — signature'], ['stamp', 'Firm stamp']].map(([k, n]) => `<div><b>${n}</b><br>${a[k] ? `<img src="${a[k]}" style="height:60px;background:#fff;border:1px solid var(--line)"><br><button class="btn g s" data-act="delAsset" data-k="${k}">Remove</button>` : '<span class="muted">Not uploaded</span>'}<br><input type="file" accept="image/*" data-chg="upAsset" data-k="${k}"></div>`).join('')}</div></div>

  <div class="card"><h3>Backup</h3><button class="btn o s" data-act="backup">Download full backup (JSON)</button> <span class="muted">Selfies are not included.</span></div>`;
};
ACT.saveSettings = async () => {
  const fh = +val('c_fh'), hh = +val('c_hh'); if (!(hh > 0 && fh > hh)) return toast('Half-day hours must be less than full-day hours');
  const st = Object.assign({}, settingsDefaults(), {
    company: val('c_company'), address: val('c_address'), phones: val('c_phones'), email: val('c_email'), website: val('c_web'), signatory: val('c_sig'),
    shiftStart: val('c_ss'), shiftEnd: val('c_se'), graceMins: +val('c_grace') || 0, earlyGraceMins: +val('c_egrace') || 0, breakMins: +val('c_brk') || 0, latesPerHalfDay: +val('c_lpd') || 0,
    fullHours: fh, halfHours: hh, missingOutAs: val('c_mo'), payOffDayWork: val('c_odw'), weeklyOff: $$('.c_wo:checked').map(x => +x.value), trackStart: val('c_track'),
    sickNoteDays: +val('c_snd') || 0, reportRequired: val('c_rep_req'), reportShareRequired: val('c_rep_share'), reportMinPhotos: +val('c_rep_min') || 0, reportKeepDays: Math.max(7, +val('c_rep_keep') || 45), waGroupName: val('c_wa') || EG.DEFAULTS.waGroupName,
    requireSameNetwork: val('c_net'), selfieRequired: val('c_selfie'), gpsMode: val('c_gps'), gpsRadius: +val('c_rad') || 150, officeLat: val('c_lat') ? +val('c_lat') : null, officeLng: val('c_lng') ? +val('c_lng') : null,
    idleLockMins: +val('c_idle') || 0, oldEditDays: +val('c_old') || 0, secondAdminApproval: val('c_2nd'), reportEmails: val('c_rep'), bonusPercent: +val('c_bpct') || 8.33, bonusCeiling: +val('c_bceil') || 0
  });
  if (st.gpsMode !== 'off' && (!st.officeLat || !st.officeLng)) toast('Tip: set the office location for the GPS check', 4000);
  await dbSet('settings', st); await log('settings', 'Settings saved'); toast('Settings saved');
};
ACT.useMyLocation = async () => { toast('Getting location…'); const g = await getGPS(); if (!g) return toast('Location not available — allow location permission'); $('#c_lat').value = g.lat.toFixed(6); $('#c_lng').value = g.lng.toFixed(6); toast(`Got it (±${g.acc} m). Press Save settings.`); };
async function notice(title, body) { await ref('notices').push({ title, body, at: TS(), by: APP.me.name }); }
ACT.addHoliday = async () => { const d = val('h_d'), n = val('h_n'); if (!d || !n) return toast('Date and name needed'); await dbSet('settings/holidays/' + d, n); if (val('h_ann')) await notice('Holiday: ' + n, `Office closed on ${fmtDateDow(d)}.`); await log('holiday', d + ' ' + n); toast('Added'); };
ACT.delHoliday = async b => { await dbSet('settings/holidays/' + b.dataset.d, null); await log('holiday-removed', b.dataset.d); };
ACT.importHolidays = () => {
  const yrs = Object.keys(MH_HOLIDAYS); const have = settingsDefaults().holidays || {};
  openModal(`<h3>Maharashtra public holidays</h3><p class="muted">From the Government of Maharashtra notification (General Administration Department). Tick the ones your office will close for. The ${+yrs[yrs.length - 1] + 1} list is usually published in December — add it here then, or paste lines below.</p>
   ${yrs.map(y => `<b>${y}</b><div style="max-height:320px;overflow:auto">${MH_HOLIDAYS[y].map(([d, n]) => `<label class="ck" style="display:flex;gap:8px;padding:3px 0"><input type="checkbox" class="mh" value="${d}|${esc(n)}" ${have[d] ? 'disabled' : (dsDow(d) === 0 || arr(settingsDefaults().weeklyOff).map(Number).includes(dsDow(d)) ? '' : 'checked')}> ${fmtDateDow(d)} — ${esc(n)} ${have[d] ? '<span class="muted">(added)</span>' : ''}</label>`).join('')}</div>`).join('')}
   <label class="muted">Or paste lines like <code>2027-01-26 Republic Day</code><textarea id="mh_paste" rows="3" style="width:100%"></textarea></label>
   <p><button class="btn" data-act="doImportHol">Add selected</button> <button class="btn g" data-act="closeModal">Cancel</button></p>`);
};
ACT.doImportHol = async () => {
  const upd = {}; $$('.mh:checked').forEach(c => { const [d, n] = c.value.split('|'); upd['settings/holidays/' + d] = n; });
  val('mh_paste').split('\n').forEach(l => { const m = l.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/); if (m) upd['settings/holidays/' + m[1]] = m[2]; });
  if (!Object.keys(upd).length) return toast('Nothing selected');
  await dbUpdate(upd); await log('holiday-import', Object.keys(upd).length + ' holidays'); closeModal(); toast(Object.keys(upd).length + ' holidays added');
};
ACT.addBlackout = async () => { const l = val('b_l'), f = val('b_f'), t = val('b_t') || f; if (!l || !f || t < f) return toast('Label and dates needed'); await dbSet('settings/blackouts/' + dbPushKey('x'), { label: l, from: f, to: t }); await log('blackout', `${l} ${f}→${t}`); };
ACT.delBlackout = async b => { await dbSet('settings/blackouts/' + b.dataset.id, null); };
ACT.sendNotice = async () => { const t = val('n_t'), b = val('n_b'); if (!t) return toast('Title needed'); await notice(t, b); await log('notice', t); $('#n_t').value = ''; $('#n_b').value = ''; toast('Sent — staff will get it in the app and as a notification'); };
CHG.upAsset = async el => { const f = el.files[0]; if (!f) return; const d = await fileToDataURL(f, 500, 0.9); if (d.length > 200000) return toast('Image too large — use a smaller image'); await dbSet('assets/' + el.dataset.k, d); toast('Uploaded'); };
ACT.delAsset = async b => { await dbSet('assets/' + b.dataset.k, null); };
ACT.backup = () => { const d = Object.assign({}, DATA); delete d.assets; const blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `attendance-backup-${E.today}.json`; a.click(); log('backup', 'downloaded'); };

/* ---------- LOG ---------- */
VIEWS.log = function () {
  const items = Object.values(DATA.log || {}).sort((a, b) => b.at - a.at);
  const q = (APP.logQ || '').toLowerCase();
  const f = q ? items.filter(i => (i.by + ' ' + i.action + ' ' + i.detail).toLowerCase().includes(q)) : items;
  return `<div class="bar"><h2>Activity log</h2><input placeholder="Search…" value="${esc(APP.logQ || '')}" data-chg="logQ"></div>
   <div class="tw"><table><tr><th>When</th><th>By</th><th>Action</th><th>Detail</th></tr>${f.map(i => `<tr><td>${fmtDT(i.at)}</td><td>${esc(i.by)}</td><td>${esc(i.action)}</td><td class="wrap">${esc(i.detail)}</td></tr>`).join('')}</table></div>`;
};
CHG.logQ = el => { APP.logQ = el.value; render(); };
