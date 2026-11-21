/* =====================================================================
   Shreedeep Solutions — Attendance automatic jobs (GitHub Actions)
   Runs every 10 minutes in office hours + 11 PM on month-end days.
   - Push alerts: late check-in, not checked in, long break, leave/correction requests, notices, birthdays
   - 9:30 reminders to staff who have not checked in, morning summary to admins
   - Month-end PDF report emailed to partners at ~11 PM on the last day (#75)
   - Reminder to finalise & lock last month's salary (#82)
   - Payslip PDFs emailed to staff after a month is locked (#45)
   - Weekly ranking (Wed–Mon) saved every Tuesday (#74)
   - Selfies older than 90 days deleted (keeps the free Firebase plan small)
   ===================================================================== */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EG = require(path.join(__dirname, '..', 'engine.js'));
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const webpush = require('web-push');
const PDFDocument = require('pdfkit');

const env = process.env;
const DRY = env.DRY_RUN === '1';
const NOW = env.FAKE_NOW ? +env.FAKE_NOW : Date.now();
const ROOT = 'att';
const IST = EG.istParts(NOW);
const today = EG.istDate(NOW);
const hm = IST.h * 60 + IST.mi;
const log = (...a) => console.log('[jobs]', ...a);

let db, D;
async function loadData() {
  if (env.LOCAL_DATA) { const fs = await import('fs'); D = JSON.parse(fs.readFileSync(env.LOCAL_DATA, 'utf8')).att; return; }
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: env.FIREBASE_DB_URL });
  db = admin.database();
  D = {};
  const nodes = ['settings', 'staff', 'staffPrivate', 'punches', 'overrides', 'requests', 'adjust', 'locks', 'snapshots', 'pushSubs', 'notices', 'jobState', 'admins', 'assets', 'kioskState', 'kiosks', 'reports', 'deviceMap', 'swaps', 'userMap', 'remPrefs'];
  await Promise.all(nodes.map(async n => { D[n] = (await db.ref(`${ROOT}/${n}`).once('value')).val(); }));
}
const write = async (p, v) => { if (DRY || !db) { log('WRITE', p, JSON.stringify(v).slice(0, 120)); return; } await db.ref(`${ROOT}/${p}`).set(v); };

/* ---------------- push ---------------- */
let pushReady = false;
function initPush() {
  if (env.VAPID_PUBLIC && env.VAPID_PRIVATE) { webpush.setVapidDetails('mailto:' + (env.GMAIL_USER || 'admin@example.com'), env.VAPID_PUBLIC, env.VAPID_PRIVATE); pushReady = true; }
  else log('VAPID keys not set — push disabled');
}
/* A device's role is checked against the database, never taken from what the phone wrote */
const subsOf = filter => {
  const out = [];
  Object.entries(D.pushSubs || {}).forEach(([uid, m]) => Object.entries(m || {}).forEach(([key, s]) => {
    if (!s) return;
    const isAdmin = !!(D.admins || {})[uid]; const sid = (D.deviceMap || {})[uid] || '';
    const real = Object.assign({}, s, { role: isAdmin ? 'admin' : sid ? 'staff' : 'none', sid });
    if (real.role !== 'none' && filter(real, uid)) out.push({ uid, key, s: real });
  }));
  return out;
};
/* Office 2.3: quiet hours (default 21:00–08:00 IST) — nothing is pushed then, except the last daily-report reminder (deadline 11:59 pm) */
function quietNow() {
  const st = D.settings || {}; const qs = EG.toMin(st.quietStart || '21:00'), qe = EG.toMin(st.quietEnd || '08:00');
  return qs > qe ? (hm >= qs || hm < qe) : (hm >= qs && hm < qe);
}
async function push(targets, title, body, tag) {
  const url = env.APP_URL || './index.html';
  if (quietNow() && tag !== 'rep') { log('quiet hours — not sent:', title); return; }
  for (const t of targets) {
    if (DRY || !pushReady) { log('PUSH', t.s.role, t.s.name, '|', title, '|', body); continue; }
    try { await webpush.sendNotification(JSON.parse(t.s.sub), JSON.stringify({ title, body, tag, url })); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await write(`pushSubs/${t.uid}/${t.key}`, null); else log('push error', e.statusCode, e.body || e.message); }
  }
}
/* Office 2.4 — one bell: every alert also lands in the person's notification list in the app */
const uidOfSid = sid => Object.keys(D.userMap || {}).find(u => D.userMap[u] === sid) || null;
async function toInbox(uids, title, body, tag) {
  if (!db || DRY || !uids.length) return; let fs; try { fs = admin.firestore(); } catch (e) { return; }
  for (const uid of uids) { try { await fs.collection('users').doc(uid).collection('inbox').add({ title, body, ev: 'att', kind: 'att', tag: tag || '', read: false, at: admin.firestore.FieldValue.serverTimestamp(), src: 'jobs' }); } catch (e) { log('inbox', uid, e.message); } }
}
const toAdmins = (t, b, tag) => { const q = quietNow(); return push(subsOf(s => s.role === 'admin'), t, b, tag).then(() => q ? null : toInbox(Object.keys(D.admins || {}), t, b, tag)); };
/* Office 2.3: each person can switch off reminder kinds (Settings → Reminders): rem, lunch, out, rep, due */
const remOff = (sid, tag) => !!(D.remPrefs && D.remPrefs[sid] && D.remPrefs[sid][tag] === false);
/* staff who picked हिंदी get the reminders in Hindi */
const HI = [
  [/^Good morning ☀️$/, 'सुप्रभात ☀️'], [/^Office starts at (\S+)\. Scan the office QR when you reach\.$/, 'ऑफिस $1 बजे शुरू होता है। पहुँचते ही ऑफिस का QR स्कैन करें।'],
  [/^🍱 Lunch time$/, '🍱 लंच का समय'], [/^Lunch is (\S+)–(\S+)\. .*$/, 'लंच $1–$2 है। जाते समय QR स्कैन करके “Start break” चुनें।'],
  [/^⏰ Lunch time is over$/, '⏰ लंच का समय ख़त्म'], [/^Back at your desk\? .*$/, 'सीट पर वापस? QR स्कैन करके “End break” चुनें।'],
  [/^Office time is over$/, 'ऑफिस का समय ख़त्म'], [/^It is (\S+)\. Scan the QR when you leave.*$/, '$1 बज गए। जाते समय QR स्कैन करें — चेक-आउट न भूलें।'],
  [/^🌙 Still in office\?$/, '🌙 अभी ऑफिस में हैं?'], [/^Explain any gaps, post your wrap-up.*$/, 'खाली समय का कारण बताएँ, दिन का सार लिखें और जाते समय “Check out” स्कैन करें।'],
  [/^Not checked in yet$/, 'अभी चेक-इन नहीं हुआ'], [/^Office started at (\S+)\. .*$/, 'ऑफिस $1 बजे शुरू हुआ। पहुँचते ही QR स्कैन करें।'],
  [/^Forgot to check out\?$/, 'चेक-आउट भूल गए?'], [/^You are still checked in\. .*$/, 'आप अभी भी चेक-इन हैं। जाते समय QR स्कैन करें — नहीं तो आधा दिन गिना जा सकता है।'],
  [/^Daily report pending$/, 'रोज़ की रिपोर्ट बाकी'], [/^⏰ Last reminder: daily report$/, '⏰ आख़िरी याद: रोज़ की रिपोर्ट'], [/^Break over$/, 'ब्रेक ख़त्म'],
  [/^Request (approved|rejected)$/, (m, x) => x === 'approved' ? 'अनुरोध मंज़ूर' : 'अनुरोध नामंज़ूर'],
];
const hiText = x => { for (const [re, to] of HI) if (re.test(x)) return x.replace(re, to); return x; };
/* nothing for a person on their weekly off / holiday / approved leave (except the answer to their own request) */
let E0 = null;
const offToday = sid => { try { const r = E0 && E0.day(sid, today); return !!(r && r.off && !r.in); } catch (e) { return false; } };
const isHi = sid => !!(D.remPrefs && D.remPrefs[sid] && D.remPrefs[sid].lang === 'hi');
const toStaff = (sid, t, b, tag) => toStaff0(sid, t, b, tag).then(r => { if (!(offToday(sid) && tag !== 'dec') && !remOff(sid, tag) && !quietNow()) { const u = uidOfSid(sid); if (u) return toInbox([u], isHi(sid) ? hiText(t) : t, isHi(sid) ? hiText(b) : b, tag); } return r; });
const toStaff0 = (sid, t, b, tag) => (offToday(sid) && tag !== 'dec') ? Promise.resolve(log('off today', sid, tag)) : isHi(sid) && !remOff(sid, tag) ? push(subsOf(s => s.role === 'staff' && s.sid === sid), hiText(t), hiText(b), tag) : remOff(sid, tag) ? Promise.resolve(log('off by choice', sid, tag)) : push(subsOf(s => s.role === 'staff' && s.sid === sid), t, b, tag);
const toAll = (t, b, tag) => push(subsOf(() => true), t, b, tag);

/* ---------------- email ---------------- */
let mailer = null;
function initMail() { if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) mailer = nodemailer.createTransport({ service: 'gmail', auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD } }); else log('Gmail not set — email disabled'); }
async function email(to, subject, text, attachments) {
  if (!to) return false;
  if (DRY || !mailer) { log('EMAIL', to, '|', subject, '|', (attachments || []).map(a => a.filename + ' ' + a.content.length + 'B').join(', ')); if (DRY && attachments) { const fs = await import('fs'); attachments.forEach(a => fs.writeFileSync(path.join(__dirname, 'out-' + a.filename), a.content)); } return true; }
  await mailer.sendMail({ from: `"${(D.settings || {}).company || 'Shreedeep Solutions'}" <${env.GMAIL_USER}>`, to, subject, text, attachments });
  return true;
}

/* ---------------- PDF helpers (black & white) ---------------- */
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = mk => MON[+mk.slice(5) - 1] + ' ' + mk.slice(0, 4);
const fmtDate = ds => ds ? ds.slice(8) + '-' + ds.slice(5, 7) + '-' + ds.slice(0, 4) : '';
const num = n => Math.round(n || 0).toLocaleString('en-IN');
const RS = 'Rs. ';
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
function pdfBuffer(build, opts) {
  return new Promise(res => { const doc = new PDFDocument(Object.assign({ size: 'A4', margin: 36 }, opts || {})); const ch = []; doc.on('data', c => ch.push(c)); doc.on('end', () => res(Buffer.concat(ch))); build(doc); doc.end(); });
}
function letterhead(doc) {
  const st = Object.assign({}, EG.DEFAULTS, D.settings || {});
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right, x = doc.page.margins.left;
  doc.font('Helvetica-Bold').fontSize(18).text(st.company.toUpperCase(), x, doc.page.margins.top, { width: w, align: 'center' });
  doc.font('Helvetica').fontSize(9).text(st.address, { width: w, align: 'center' }).text(`Ph: ${st.phones}  |  ${st.email}  |  ${st.website}`, { width: w, align: 'center' });
  doc.moveDown(0.3); const y = doc.y; doc.moveTo(x, y).lineTo(x + w, y).lineWidth(1.5).stroke(); doc.moveDown(0.6);
}
function table(doc, cols, rows, opt) {
  opt = opt || {}; const x0 = doc.page.margins.left; const total = cols.reduce((t, c) => t + c.w, 0); const fs = opt.fontSize || 9; const rh = opt.rowH || fs + 8;
  const drawRow = (cells, bold) => {
    if (doc.y + rh > doc.page.height - doc.page.margins.bottom) doc.addPage();
    let x = x0; const y = doc.y;
    cells.forEach((c, i) => { doc.rect(x, y, cols[i].w, rh).lineWidth(0.5).stroke(); doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs).text(String(c == null ? '' : c), x + 3, y + 4, { width: cols[i].w - 6, align: cols[i].a || 'left', lineBreak: false, ellipsis: true }); x += cols[i].w; });
    doc.y = y + rh; doc.x = x0;
  };
  if (opt.head !== false) drawRow(cols.map(c => c.h), true);
  rows.forEach(r => drawRow(r, r._bold));
  doc.moveDown(0.5); return total;
}
function signature(doc, signed, who) {
  const st = Object.assign({}, EG.DEFAULTS, D.settings || {}); const a = D.assets || {};
  const people = who === 'both' ? [['deepali', 'Deepali Vernekar'], ['shriraj', 'Shriraj Kinekar']] : who === 'shriraj' ? [['shriraj', 'Shriraj Kinekar']] : [['deepali', 'Deepali Vernekar']];
  const right = doc.page.width - doc.page.margins.right; const bw = 150 * people.length + 20; const bx = right - bw;
  if (doc.y > doc.page.height - 150) doc.addPage();
  const y0 = doc.y + 20;
  doc.font('Helvetica').fontSize(10).text('Employee signature', doc.page.margins.left, y0 + 70);
  doc.text('For ' + st.company, bx, y0, { width: bw, align: 'center' });
  const img = (k, x, y, w, h) => { const d = a[k]; if (!signed || !d) return; try { doc.image(Buffer.from(d.split(',')[1], 'base64'), x, y, { fit: [w, h], align: 'center' }); } catch (e) { } };
  img('stamp', bx + bw / 2 - 35, y0 + 10, 70, 70);
  people.forEach(([k, n], i) => { const cx = bx + 10 + i * 150; img('sign_' + k, cx + 15, y0 + 18, 120, 40); doc.font('Helvetica-Bold').text(n, cx, y0 + 62, { width: 150, align: 'center' }); doc.font('Helvetica').text('Partner', cx, y0 + 75, { width: 150, align: 'center' }); });
  doc.y = y0 + 100;
}
function payslipPDF(sid, mk, s) {
  const u = (D.staff || {})[sid] || {}; const c = s.counts || {}; const st = Object.assign({}, EG.DEFAULTS, D.settings || {});
  return pdfBuffer(doc => {
    letterhead(doc);
    doc.font('Helvetica-Bold').fontSize(12).text('SALARY SLIP — ' + monthName(mk).toUpperCase(), { align: 'center', underline: true }); doc.moveDown(0.6);
    table(doc, [{ h: '', w: 110 }, { h: '', w: 150 }, { h: '', w: 110 }, { h: '', w: 153 }], [['Employee', u.name, 'Employee ID', u.empId || ''], ['Designation', u.designation || '', 'Days in month', s.D]], { head: false });
    table(doc, ['Present', 'Half', 'Absent', 'No report', 'Leave', 'Off/Hol', 'Late', 'Paid days', 'LOP'].map(h => ({ h, w: 58, a: 'center' })),
      [[c.P || 0, c.H || 0, c.A || 0, c.NR || 0, (c.UL || 0) + (c.SL || 0), (c.WO || 0) + (c.HO || 0), s.late || 0, s.paidDays, s.lop]]);
    const lopAmt = Math.max(0, Math.round(s.monthly - s.earned));
    table(doc, [{ h: 'Earnings', w: 190 }, { h: 'Rs.', w: 71, a: 'right' }, { h: 'Deductions', w: 190 }, { h: 'Rs.', w: 72, a: 'right' }], [
      ['Monthly salary (fixed)', num(s.monthly), `Loss of pay (${s.lop} days)`, num(lopAmt)],
      [`Off-day working (${s.ot || 0} day)`, num(s.otAmt), 'Advance recovery', num(s.advance)],
      ['Arrears', num(s.arrears ? s.arrears.total : 0), 'Other deductions', num(s.other)],
      ['Bonus / Incentive', num((s.bonus || 0) + (s.incentive || 0)), '', ''],
      Object.assign(['NET PAY', num(s.net), '', ''], { _bold: true })]);
    doc.font('Helvetica-Bold').fontSize(10).text(`Net pay Rs. ${num(s.net)} (Rupees ${numWords(s.net)} Only)`); doc.moveDown(0.3);
    signature(doc, true, st.signatory);
    doc.fontSize(7).text('Computer-generated from the attendance system.', doc.page.margins.left);
  });
}
function monthReportPDF(mk) {
  const e = EG.create(D, NOW); const ids = Object.keys(D.staff || {}).filter(s => D.staff[s].active !== false).sort((a, b) => String(D.staff[a].empId).localeCompare(String(D.staff[b].empId)));
  return pdfBuffer(doc => {
    letterhead(doc);
    doc.font('Helvetica-Bold').fontSize(12).text('MONTHLY ATTENDANCE & SALARY REPORT — ' + monthName(mk).toUpperCase(), { align: 'center' }); doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(8).text(`Generated ${fmtDate(today)} ${EG.istHM(NOW)} IST. ${e.isLocked(mk) ? 'Month is locked.' : 'Provisional — month not yet locked.'}`, { align: 'center' }); doc.moveDown(0.6);
    let tot = 0;
    const rows = ids.map(sid => { const s = e.salary(sid, mk); const m = e.month(sid, mk); const c = m.counts; tot += s.net; return [D.staff[sid].name, c.P || 0, c.H || 0, (c.UL || 0) + (c.SL || 0), (c.A || 0) + (c.NR || 0), m.late, Math.round(m.hours), s.paidDays, s.lop, num(s.net)]; });
    rows.push(Object.assign(['TOTAL', '', '', '', '', '', '', '', '', num(tot)], { _bold: true }));
    table(doc, [{ h: 'Staff', w: 120 }, { h: 'Present', w: 42, a: 'center' }, { h: 'Half', w: 36, a: 'center' }, { h: 'Leave', w: 38, a: 'center' }, { h: 'Abs/NR', w: 42, a: 'center' }, { h: 'Late', w: 34, a: 'center' }, { h: 'Hours', w: 40, a: 'center' }, { h: 'Paid days', w: 50, a: 'center' }, { h: 'LOP', w: 36, a: 'center' }, { h: 'Net Rs.', w: 85, a: 'right' }], rows);
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Flags this month'); doc.font('Helvetica').fontSize(8.5);
    let any = false;
    ids.forEach(sid => { const m = e.month(sid, mk); Object.values(m.days).forEach(r => { if (r.flags.length || r.missingOut) { any = true; doc.text(`${D.staff[sid].name} · ${fmtDate(r.ds)} · ${r.flags.join('; ')}`); } }); });
    if (!any) doc.text('None.');
    // register page
    doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 });
    doc.font('Helvetica-Bold').fontSize(11).text('ATTENDANCE REGISTER — ' + monthName(mk).toUpperCase(), { align: 'center' }); doc.moveDown(0.4);
    const Dn = EG.daysIn(mk); const cols = [{ h: 'Staff', w: 95 }]; for (let d = 1; d <= Dn; d++) cols.push({ h: String(d), w: 21, a: 'center' }); cols.push({ h: 'Paid', w: 30, a: 'center' });
    table(doc, cols, ids.map(sid => { const m = e.month(sid, mk); const r = [D.staff[sid].name]; for (let d = 1; d <= Dn; d++) { const x = m.days[d].code; r.push(['FUT', 'NJ', 'NT', 'PEND'].includes(x) ? '' : x); } r.push(e.salary(sid, mk).paidDays); return r; }), { fontSize: 6.5, rowH: 14 });
    doc.fontSize(7).text('P Present · H Half · A Absent · NR No daily report (unpaid) · UL Leave (unpaid) · SL Sick leave (unpaid) · WO Weekly off · HO Holiday');
  });
}

/* ---------------- tasks ---------------- */
const JS = () => D.jobState || (D.jobState = {});
const doneToday = k => ((JS().done || {})[today] || {})[k];
async function markDone(k) { JS().done = JS().done || {}; (JS().done[today] = JS().done[today] || {})[k] = NOW; await write(`jobState/done/${today}/${k}`, NOW); }

async function taskAlerts(e) {
  const since = JS().lastNotify || NOW - 15 * 60000;
  const staffIds = Object.keys(D.staff || {}).filter(s => D.staff[s].active !== false);
  const st0 = Object.assign({}, EG.DEFAULTS, D.settings || {});
  // new punches → late alert
  for (const sid of staffIds) {
    Object.values((D.punches || {})[sid] || {}).forEach(p => { p._sid = sid; });
    for (const p of Object.values((D.punches || {})[sid] || {})) {
      if (!p || p.at <= since || p.at > NOW) continue;
      const r = e.day(sid, EG.istDate(p.at));
      if (p.type === 'in' && r.late && r.punches[0] && r.punches[0].at === p.at) await toAdmins('Late check-in', `${D.staff[sid].name} checked in at ${EG.istHM(p.at)} (${r.lateMin} min late)`, 'late-' + sid);
      if (p.gpsFar) await toAdmins('Check-in far from office', `${D.staff[sid].name} · ${EG.istHM(p.at)} · ${p.dist} m away`, 'far-' + sid);
    }
  }
  // today: not checked in, long break, still in office late
  for (const sid of staffIds) {
    const r = e.day(sid, today); const sh = e.shiftOf(sid); const ss = EG.toMin(sh.start), se = EG.toMin(sh.end);
    // Shreedeep Office 2.2: gentle reminders — check in, lunch (break) start / end, check out
    const off = r.off && !r.in;
    if (!off && r.code === 'PEND' && hm >= ss && hm < ss + 20 && !doneToday('rem0_' + sid)) { await toStaff(sid, 'Good morning ☀️', `Office starts at ${sh.start}. Scan the office QR when you reach.`, 'rem'); await markDone('rem0_' + sid); }
    { const ls = EG.toMin(st0.lunchStart || '14:00'), le = EG.toMin(st0.lunchEnd || EG.minToHM(ls + (sh.brk || 60)));
      const hadBreak = (r.punches || []).some(p => p.type === 'bout');
      if (r.inOffice && !r.onBreak && !hadBreak && hm >= ls && hm < le && !doneToday('lun1_' + sid)) { await toStaff(sid, '🍱 Lunch time', `Lunch is ${EG.minToHM(ls)}–${EG.minToHM(le)}. Scan the QR and choose “Start break” when you go.`, 'lunch'); await markDone('lun1_' + sid); }
      if (r.onBreak && hm >= le && !doneToday('lun2_' + sid)) { await toStaff(sid, '⏰ Lunch time is over', 'Back at your desk? Scan the QR and choose “End break”.', 'lunch'); await markDone('lun2_' + sid); } }
    if (r.inOffice && !r.onBreak && hm >= se && hm < se + 30 && !doneToday('out0_' + sid)) { await toStaff(sid, 'Office time is over', `It is ${sh.end}. Scan the QR when you leave — don’t forget to check out.`, 'out'); await markDone('out0_' + sid); }
    // Office 2.3: 6:30 PM — still checked in? finish the wrap-up and check out
    if (r.inOffice && !r.onBreak && hm >= se + 30 && hm < se + 75 && !doneToday('out1_' + sid)) { await toStaff(sid, '🌙 Still in office?', 'Explain any gaps, post your wrap-up and scan “Check out” before you leave.', 'out'); await markDone('out1_' + sid); }
    if (r.code === 'PEND' && hm >= ss + 30 && hm < se && !doneToday('rem_' + sid)) { await toStaff(sid, 'Not checked in yet', `Office started at ${sh.start}. Scan the QR at the office when you arrive.`, 'rem'); await markDone('rem_' + sid); }
    if (r.code === 'PEND' && hm >= ss + 120 && hm < se && !doneToday('abs_' + sid)) { await toAdmins('Not checked in', `${D.staff[sid].name} has not checked in by ${EG.minToHM(ss + 120)} and has no approved leave`, 'abs-' + sid); await markDone('abs_' + sid); }
    if (r.onBreak && sh.brk && r.breakMin > sh.brk + 10 && !doneToday('brk_' + sid)) { await toAdmins('Long break', `${D.staff[sid].name} on break for ${r.breakMin} min`, 'brk-' + sid); await toStaff(sid, 'Break over', `You have been on break ${r.breakMin} min (allowed ${sh.brk}). Scan "End break".`, 'brk'); await markDone('brk_' + sid); }
    const st = Object.assign({}, EG.DEFAULTS, D.settings || {});
    if (st.reportRequired && r.in && !r.report.ok) {
      const what = r.report.uploaded ? 'Your report is uploaded but not sent — tap “Send to WhatsApp” in the app.' : 'Upload your reporting PDF + photos in the app and send them to the WhatsApp group.';
      if (hm >= Math.max(se, 19 * 60) && !doneToday('rep1_' + sid)) { await toStaff(sid, 'Daily report pending', what + ' Today counts only after that (deadline 11:59 pm).', 'rep'); await markDone('rep1_' + sid); }
      if (hm >= 22 * 60 && !doneToday('rep2_' + sid)) { await toStaff(sid, '⏰ Last reminder: daily report', what + ' Window closes at 11:59 pm.', 'rep'); await markDone('rep2_' + sid); }
    }
    if (r.inOffice && !r.onBreak && hm >= se + 75 && !doneToday('out_' + sid)) { await toStaff(sid, 'Forgot to check out?', 'You are still checked in. Scan the QR when you leave — otherwise it may count as a half day.', 'out'); await markDone('out_' + sid); }
  }
  // new requests
  for (const [sid, rs] of Object.entries(D.requests || {})) for (const r of Object.values(rs || {})) {
    if (!r || r.status !== 'pending' || !(r.at > since)) continue;
    const n = (D.staff[sid] || {}).name || sid;
    await toAdmins(r.kind === 'leave' ? 'Leave request' : 'Correction request', r.kind === 'leave' ? `${n}: ${EG.LEAVE_TYPES[r.leaveType] || r.leaveType} ${fmtDate(r.from)}${r.to && r.to !== r.from ? ' to ' + fmtDate(r.to) : ''} — ${r.reason || ''}` : `${n}: ${fmtDate(r.date)} ${r.in || '-'}–${r.out || '-'} — ${r.reason || ''}`, 'req');
  }
  // decisions → staff
  for (const [sid, rs] of Object.entries(D.requests || {})) for (const r of Object.values(rs || {})) {
    if (!r || r.status === 'pending' || !(r.decidedAt > since)) continue;
    await toStaff(sid, `Request ${r.status}`, `${r.kind === 'leave' ? (EG.LEAVE_TYPES[r.leaveType] || '') + ' ' + fmtDate(r.from) : 'Correction ' + fmtDate(r.date)} — ${r.status}${r.comment ? ': ' + r.comment : ''}`, 'dec');
  }
  // notices → everyone
  for (const n of Object.values(D.notices || {})) if (n && n.at > since) await toAll('📢 ' + n.title, n.body || '', 'notice');
  // device approval requests etc. are visible in the app; no push needed
}
async function taskMorning(e) {
  if (hm < 9 * 60 + 45 || hm > 13 * 60 || doneToday('morning')) return;
  const b = e.todayBoard(); const notIn = b.filter(x => x.r.code === 'PEND').map(x => D.staff[x.sid].name.split(' ')[0]);
  const late = b.filter(x => x.r.late).map(x => D.staff[x.sid].name.split(' ')[0]);
  const isOff = b.length && b.every(x => x.r.off && !x.r.in);
  const y = EG.addDays(today, -1);
  const noRep = Object.keys(D.staff || {}).filter(sid => D.staff[sid].active !== false && e.day(sid, y).code === 'NR').map(sid => D.staff[sid].name.split(' ')[0]);
  if (noRep.length) await toAdmins('No daily report yesterday', `${noRep.join(', ')} did not send the daily report — day not counted`, 'norep');
  if (!isOff) await toAdmins('Attendance at ' + EG.istHM(NOW), `In: ${b.filter(x => x.r.in).length}/${b.length}` + (notIn.length ? ` · Not in: ${notIn.join(', ')}` : '') + (late.length ? ` · Late: ${late.join(', ')}` : ''), 'morning');
  // birthdays / anniversaries
  const md = today.slice(5);
  for (const sid of Object.keys(D.staff || {})) {
    const u = D.staff[sid], p = (D.staffPrivate || {})[sid] || {}; if (u.active === false) continue;
    if (p.dob && p.dob.slice(5) === md) { await toAdmins('🎂 Birthday today', `${u.name}'s birthday is today`, 'bday'); await toStaff(sid, '🎂 Happy birthday!', `Warm wishes from ${(D.settings || {}).company || 'the team'}`, 'bday'); }
    if (u.joinDate && u.joinDate.slice(5) === md && u.joinDate.slice(0, 4) < today.slice(0, 4)) await toAdmins('🎉 Work anniversary', `${u.name} completes ${+today.slice(0, 4) - +u.joinDate.slice(0, 4)} year(s) today`, 'anniv');
  }
  await markDone('morning');
}
async function taskMonthEnd(e) {
  const tomorrow = EG.addDays(today, 1);
  if (tomorrow.slice(8) !== '01' || hm < 22 * 60 + 30) return;
  const mk = today.slice(0, 7); if ((JS().monthReport || {})[mk]) return;
  const st = Object.assign({}, EG.DEFAULTS, D.settings || {});
  const pdf = await monthReportPDF(mk);
  const to = String(st.reportEmails || '').split(/[,;\s]+/).filter(Boolean).join(',');
  const ids = Object.keys(D.staff || {}).filter(s => D.staff[s].active !== false);
  const total = ids.reduce((t, sid) => t + e.salary(sid, mk).net, 0);
  if (to) await email(to, `Attendance & salary report — ${monthName(mk)}`, `Attached: attendance and provisional salary report for ${monthName(mk)}.\nTotal net salary: Rs. ${num(total)}\n\nPlease review corrections and lock the month in the app (Salary → Finalise & lock).`, [{ filename: `Attendance_Report_${mk}.pdf`, content: pdf }]);
  await toAdmins('Month-end report', `${monthName(mk)} report ${to ? 'emailed' : 'ready (add report emails in Settings)'} · total net Rs. ${num(total)}`, 'monthend');
  await write(`jobState/monthReport/${mk}`, NOW); await write('jobState/lastReport', monthName(mk));
}
async function taskLockReminder() {
  const day = +today.slice(8); if (day > 5 || hm < 10 * 60 || doneToday('lockrem')) return;
  const prev = EG.addMonths(today.slice(0, 7), -1); if ((D.locks || {})[prev]) return;
  if ((D.settings || {}).trackStart && prev < D.settings.trackStart.slice(0, 7)) return;
  await toAdmins('Finalise salary', `${monthName(prev)} is not locked yet. Review and lock it in Salary so payslips go out.`, 'lockrem');
  const to = String((D.settings || {}).reportEmails || '').split(/[,;\s]+/).filter(Boolean).join(',');
  if (to && day === 1) await email(to, `Reminder: lock ${monthName(prev)} salary`, `${monthName(prev)} salary is still open in the attendance app. Please review corrections and lock it (Salary → Finalise & lock).`);
  await markDone('lockrem');
}
async function taskPayslips() {
  for (const [mk, l] of Object.entries(D.locks || {})) {
    if (!l || l.emailed || !(D.snapshots || {})[mk]) continue;
    let sent = 0;
    for (const [sid, s] of Object.entries(D.snapshots[mk])) {
      const p = (D.staffPrivate || {})[sid] || {}; if (!p.email) continue;
      const pdf = await payslipPDF(sid, mk, s);
      await email(p.email, `Salary slip — ${monthName(mk)}`, `Dear ${(D.staff[sid] || {}).name},\n\nPlease find attached your salary slip for ${monthName(mk)}.\nNet pay: Rs. ${num(s.net)}\n\nRegards,\n${(D.settings || {}).company || 'Shreedeep Solutions'}`, [{ filename: `Payslip_${mk}_${(D.staff[sid] || {}).empId || sid}.pdf`, content: pdf }]);
      await toStaff(sid, 'Payslip ready', `${monthName(mk)} net pay Rs. ${num(s.net)}. Check your email or the app.`, 'payslip');
      sent++;
    }
    await write(`locks/${mk}/emailed`, NOW);
    log('payslips', mk, sent);
  }
}
async function taskWeekly(e) {
  if (IST.dow !== 2 || hm < 9 * 60 || doneToday('weekly')) return; // Tuesday
  const ws = EG.addDays(today, -6); // previous Wednesday
  const scores = e.weekScores(ws);
  const obj = {}; scores.forEach(s => { obj[s.sid] = { rank: s.rank, score: s.score, attPct: s.attPct, punctPct: s.punctPct, late: s.late, hours: s.hours }; });
  await write(`weeklyScores/${ws}`, obj);
  if (scores.length) await toAdmins('Weekly attendance ranking', scores.slice(0, 3).map(s => `${s.rank}. ${s.name.split(' ')[0]} ${s.score}`).join(' · '), 'weekly');
  await markDone('weekly');
}
async function taskCleanup() {
  if (!db || DRY || hm < 22 * 60 || doneToday('cleanup')) return;
  const cutoff = NOW - 90 * 86400000; let n = 0;
  for (const [sid, ps] of Object.entries(D.punches || {})) for (const [pid, p] of Object.entries(ps || {})) if (p && p.hasSelfie && p.at < cutoff) { await db.ref(`${ROOT}/selfies/${sid}/${pid}`).remove(); n++; }
  // daily report files: keep N days (they are also in the WhatsApp group)
  const keep = +((D.settings || {}).reportKeepDays) || 45; const cut = EG.addDays(today, -keep); let f = 0;
  for (const [sid, days] of Object.entries(D.reports || {})) for (const [ds, rp] of Object.entries(days || {})) {
    if (ds >= cut || !rp || rp.purged) continue;
    const ids = Object.keys(rp.photos || {}).concat(rp.pdf && rp.pdf.fid ? [rp.pdf.fid] : []);
    for (const fid of ids) { await db.ref(`${ROOT}/reportFiles/${sid}/${fid}`).remove(); f++; }
    await db.ref(`${ROOT}/reports/${sid}/${ds}/purged`).set(true);
  }
  if (f) log('report files removed', f);
  // keep jobState/done small
  for (const d of Object.keys(JS().done || {})) if (d < EG.addDays(today, -10)) await write(`jobState/done/${d}`, null);
  await markDone('cleanup'); if (n) log('selfies removed', n);
}

/* ---------------- Office 2.3 jobs ---------------- */
/* 3 or more late check-ins in the last 7 days → tell the admins (once a week per person) */
async function taskLatePattern(e) {
  if (hm < 11 * 60 || doneToday('latepat')) return;
  const wk = EG.addDays(today, -((IST.dow + 4) % 7)); // week starts Wednesday (same as the ranking)
  const got = (JS().latePattern || {});
  for (const sid of Object.keys(D.staff || {}).filter(s => D.staff[s].active !== false)) {
    let n = 0; const days = [];
    for (let i = 0; i < 7; i++) { const ds = EG.addDays(today, -i); try { const r = e.day(sid, ds); if (r.late) { n++; days.push(fmtDate(ds).slice(0, 5)); } } catch (x) { } }
    if (n >= 3 && got[sid] !== wk) { await toAdmins('Late again and again', `${D.staff[sid].name} was late ${n} times in the last 7 days (${days.reverse().join(', ')}). A friendly word may help.`, 'latepat-' + sid); await write(`jobState/latePattern/${sid}`, wk); }
  }
  await markDone('latepat');
}
/* December: remind the admins to add next year's holidays (1st, 10th and 20th, until they are added) */
async function taskHolidayList() {
  if (IST.m !== 12 || ![1, 10, 20].includes(IST.d) || hm < 10 * 60 || doneToday('hollist')) return;
  const ny = String(IST.y + 1); const have = Object.keys((D.settings || {}).holidays || {}).filter(d => d.startsWith(ny)).length;
  if (have < 5) await toAdmins(`🗓 Add the ${ny} holiday list`, `Only ${have} holiday(s) for ${ny} are added. Open Leave & holidays → Office holidays and add next year's list (or import it).`, 'hollist');
  await markDone('hollist');
}
/* 5 PM: tasks due tomorrow → the person they are assigned to (TaskFlow / Office phone notification) */
async function taskDueTomorrow() {
  if (!db || hm < 17 * 60 || hm >= 18 * 60 || doneToday('duetom')) return;
  const tom = EG.addDays(today, 1);
  try {
    const fs = admin.firestore(); const by = {};
    for (const f of ['dueDate', 'hardDue']) {
      const snap = await fs.collection('tasks').where(f, '==', tom).get();
      snap.forEach(d => { const t = d.data(); if (t.status === 'done' || !t.assignedTo || (f === 'dueDate' && t.hardDue && t.hardDue !== tom)) return; (by[t.assignedTo] = by[t.assignedTo] || new Map()).set(d.id, t.title); });
    }
    const uMap = D.userMap || {};
    for (const [uid, m] of Object.entries(by)) {
      const sid = uMap[uid]; if (sid && remOff(sid, 'due')) continue;
      const u = await fs.doc('users/' + uid).get(); const tokens = (u.exists && u.data().fcmTokens) || []; if (!tokens.length) continue;
      const titles = [...m.values()]; const title = `📅 ${titles.length} task${titles.length > 1 ? 's' : ''} due tomorrow`; const body = titles.slice(0, 3).join(' · ') + (titles.length > 3 ? ` +${titles.length - 3} more` : '');
      if (DRY || quietNow()) { log('DUE', uid, title, body); continue; }
      const res = await admin.messaging().sendEachForMulticast({ tokens, notification: { title, body }, webpush: { fcmOptions: { link: (env.APP_URL || '/') + '#mine' } }, data: { url: (env.APP_URL || '/') + '#mine', kind: 'due' } });
      const bad = []; res.responses.forEach((r, i) => { if (!r.success && /registration-token-not-registered|invalid-argument/.test((r.error && r.error.code) || '')) bad.push(tokens[i]); });
      if (bad.length) await fs.doc('users/' + uid).update({ fcmTokens: tokens.filter(t => !bad.includes(t)) });
    }
  } catch (x) { log('due tomorrow skipped:', x.message); }
  await markDone('duetom');
}
/* Sunday night: full backup (Office data + attendance, without photos/selfies) + a simple Excel, emailed to the office */
async function taskWeeklyBackup() {
  if (IST.dow !== 0 || hm < 21 * 60 || doneToday('backup')) return;
  const to = env.BACKUP_TO || env.GMAIL_USER; if (!to || !db) { log('backup: no email / database'); return; }
  const zlib = require('zlib'); const XLSX = require('xlsx');
  const out = { made: new Date(NOW).toISOString(), att: {}, firestore: {} };
  const skip = new Set(['selfies', 'reportFiles', 'pushSubs', 'kioskState']);
  for (const [k, v] of Object.entries(D)) if (!skip.has(k)) out.att[k] = v;
  let fsOk = true;
  try {
    const fs = admin.firestore();
    const grab = async (ref, depth) => {
      const snap = await ref.get(); const res = {};
      for (const d of snap.docs) {
        const v = d.data(); res[d.id] = v;
        if (depth > 0) { const subs = await d.ref.listCollections(); for (const c of subs) { if (c.id === 'files') continue; (v.__sub = v.__sub || {})[c.id] = await grab(c, depth - 1); } }
      }
      return res;
    };
    const cols = await fs.listCollections();
    for (const c of cols) out.firestore[c.id] = await grab(c, ['hf_users', 'tasks'].includes(c.id) ? 1 : 0);
  } catch (x) { fsOk = false; log('backup firestore:', x.message); }
  const json = JSON.stringify(out, (k, v) => (v && typeof v === 'object' && typeof v.toDate === 'function') ? v.toDate().toISOString() : v);
  const gz = zlib.gzipSync(Buffer.from(json));
  const wb = XLSX.utils.book_new();
  const tasks = Object.entries(out.firestore.tasks || {}).map(([id, t]) => ({ ID: id, Title: t.title, Society: t.societyName || '', Assigned: (out.firestore.users && out.firestore.users[t.assignedTo] || {}).name || t.assignedTo || '', Status: t.status, Due: t.hardDue || t.dueDate || '', Created: String(t.createdAt || '').slice(0, 10), Done: String(t.completedAt || '').slice(0, 10) }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tasks.length ? tasks : [{ Note: 'No tasks' }]), 'Tasks');
  const socs = Object.entries(out.firestore.societies || {}).map(([id, s]) => ({ ID: id, Name: s.name, Area: s.area || '', Bills: s.billFreq || '', Phone: s.phone || '' }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(socs.length ? socs : [{ Note: 'No societies' }]), 'Societies');
  const e = EG.create(D, NOW); const mk = today.slice(0, 7);
  const att = Object.keys(D.staff || {}).filter(s => D.staff[s].active !== false).map(sid => { const m = e.month(sid, mk); const c = m.counts || {}; return { Staff: D.staff[sid].name, Present: c.P || 0, Half: c.H || 0, Absent: (c.A || 0) + (c.NR || 0), Late: m.late || 0, Hours: Math.round(m.hours || 0) }; });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(att.length ? att : [{ Note: 'No staff' }]), 'Attendance ' + mk);
  const xls = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const name = `ShreedeepOffice_backup_${today}`;
  if (gz.length > 20 * 1024 * 1024) log('backup larger than 20 MB — Excel only');
  await email(to, `Weekly backup — Shreedeep Office — ${fmtDate(today)}`,
    ['Weekly backup of Shreedeep Office (tasks, societies, time, habits, attendance).', '',
      `• ${name}.xlsx — easy to read in Excel`, `• ${name}.json.gz — full backup (keep it safe; it can be used to restore everything)`,
      fsOk ? '' : '⚠ The tasks part could not be read this week — check the FIREBASE_SERVICE_ACCOUNT secret is for the taskflow-shreedeep project.',
      '', 'Photos and selfies are not included.'].join('\n'),
    [{ filename: name + '.xlsx', content: xls }].concat(gz.length <= 20 * 1024 * 1024 ? [{ filename: name + '.json.gz', content: gz }] : []));
  await write('jobState/lastBackup', NOW);
  await markDone('backup');
}

/* Society locations: short Google Maps links (maps.app.goo.gl) have no location inside them, so the app saves the link
   with geoPending=true and this job opens it here and writes lat/lng to the society. Runs every time (cheap). */
const OLC='23456789CFGHJMPQRVWX';
function olcDecode(code){code=code.toUpperCase().replace(/0+\+/,'+');const p=code.indexOf('+');if(p!==8)return null;const c=code.replace('+','');
  let lat=-90,lng=-180,res=20;for(let i=0;i<Math.min(10,c.length);i+=2){const a=OLC.indexOf(c[i]),b=OLC.indexOf(c[i+1]);if(a<0||b<0)return null;lat+=a*res;lng+=b*res;if(i<8)res/=20;}
  let hLat=res,hLng=res;if(c.length>10){let rl=res/5,rg=res/4;for(let i=10;i<c.length;i++){const d=OLC.indexOf(c[i]);if(d<0)return null;lat+=Math.floor(d/4)*rl;lng+=(d%4)*rg;hLat=rl;hLng=rg;rl/=5;rg/=4;}}
  return {lat:+(lat+hLat/2).toFixed(6),lng:+(lng+hLng/2).toFixed(6)};}
function olcRecover(short,refLat=19.1,refLng=73.0){short=short.toUpperCase();const p=short.indexOf('+');if(p>=8)return olcDecode(short);const pad=8-p;const res=Math.pow(20,2-pad/2);
  const rl=Math.round(refLat/res)*res,rg=Math.round(refLng/res)*res;
  const enc=(lat,lng)=>{let a=Math.min(Math.max(lat+90,0),179.999999),b=((lng+180)%360+360)%360,out='',r=20;for(let i=0;i<4;i++){const x=Math.floor(a/r),y=Math.floor(b/r);out+=OLC[x]+OLC[y];a-=x*r;b-=y*r;r/=20;}return out.slice(0,pad);};
  const full=enc(rl,rg)+short;const d=olcDecode(full.slice(0,8)+'+'+full.slice(9));if(!d)return null;
  // pick the nearest of the 3×3 neighbouring cells
  let best=d;const half=res/2;if(d.lat-refLat>half)best={...d,lat:+(d.lat-res).toFixed(6)};else if(refLat-d.lat>half)best={...d,lat:+(d.lat+res).toFixed(6)};
  if(best.lng-refLng>half)best={...best,lng:+(best.lng-res).toFixed(6)};else if(refLng-best.lng>half)best={...best,lng:+(best.lng+res).toFixed(6)};return best;}
function parseLatLng(v){let s=String(v||'').trim();if(!s)return null;try{s=decodeURIComponent(s);}catch(e){}s=s.replace(/\+/g,m=>m);
  const ok=(a,b)=>{a=+a;b=+b;return Math.abs(a)<=90&&Math.abs(b)<=180&&!(a===0&&b===0)?{lat:+a.toFixed(6),lng:+b.toFixed(6)}:null;};
  let m=s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);if(m)return ok(m[1],m[2]);                    // exact pin
  m=s.match(/[?&](?:q|ll|query|center|destination|daddr|sll)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);if(m)return ok(m[1],m[2]);
  m=s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);if(m)return ok(m[1],m[2]);                         // map centre
  m=s.match(/(?:^|[^\d.])(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/);if(m)return ok(m[1],m[2]); // "19.1551, 72.9949"
  m=s.match(/\b([23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,3})\b/i);if(m)return olcDecode(m[1]);
  m=s.match(/(?:^|[\s/=])([23456789CFGHJMPQRVWX]{4,6}\+[23456789CFGHJMPQRVWX]{2,3})\b/i);if(m)return olcRecover(m[1]);
  return null;}
const isMapLink=v=>/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i.test(String(v||'').trim());

async function readMapLink(link) {
  let url = String(link).trim(); const seen = [url];
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36', 'Accept-Language': 'en-IN,en' } });
    const loc = r.headers.get('location');
    if (loc) { url = new URL(loc, url).href; seen.push(url); const ll = parseLatLng(url); if (ll) return ll; continue; }
    const body = await r.text();
    for (const u of seen) { const ll = parseLatLng(u); if (ll) return ll; }
    const pats = [/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/, /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+),\d/, /\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/, /ll=(-?\d+\.\d+),(-?\d+\.\d+)/];
    for (const re of pats) { const m = body.match(re); if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { lat: +(+m[1]).toFixed(6), lng: +(+m[2]).toFixed(6) }; }
    return null;
  }
  return null;
}
async function taskSocietyGeo() {
  if (!db || DRY) return;
  let fs; try { fs = admin.firestore(); } catch (e) { return; }
  let snap; try { snap = await fs.collection('societies').where('geoPending', '==', true).limit(20).get(); } catch (e) { log('geo:', e.message); return; }
  for (const d of snap.docs) {
    const s = d.data(); const tries = (+s.geoTries || 0) + 1;
    try {
      const ll = s.mapLink ? await readMapLink(s.mapLink) : null;
      if (ll) { await d.ref.update({ lat: ll.lat, lng: ll.lng, geoPending: false, geoErr: null, geoTries: 0, locAt: new Date().toISOString() }); log('geo set', s.name, ll.lat, ll.lng); }
      else await d.ref.update(tries >= 3 ? { geoPending: false, geoErr: 'Could not read this link — open it, long-press the building, copy the numbers shown and paste them', geoTries: tries } : { geoTries: tries });
    } catch (e) { log('geo error', s.name, e.message); await d.ref.update(tries >= 3 ? { geoPending: false, geoErr: 'Could not open this link', geoTries: tries } : { geoTries: tries }).catch(() => { }); }
  }
}


/* Office 2.4 — the team board (who is in, on leave, birthdays) for My Day and the office screen,
   leave asked in Attendance shown in Tasks too, and birthdays typed by staff copied to Attendance */
/* Office 2.7.2: a person removed in Team (users/{uid}.disabled) cannot sign in anywhere —
   their Firebase login is switched off and their open sessions ended; "Reactivate" switches it back on. */
async function taskLogins() {
  if (!db) return; let fs; try { fs = admin.firestore(); } catch (e) { return; }
  let snap; try { snap = await fs.collection('users').get(); } catch (e) { log('logins', e.message); return; }
  for (const d of snap.docs) {
    const want = d.data().disabled === true;
    try {
      const u = await admin.auth().getUser(d.id);
      if (!!u.disabled === want) continue;
      if (DRY) { log('LOGIN', d.id, want ? 'switch off' : 'switch on'); continue; }
      await admin.auth().updateUser(d.id, { disabled: want });
      if (want) await admin.auth().revokeRefreshTokens(d.id);
      log('login', d.id, want ? 'switched off (removed)' : 'switched on (reactivated)');
    } catch (e) { if (e && e.code !== 'auth/user-not-found') log('logins', d.id, e.message); }
  }
}

async function taskBoard(e) {
  if (!db || DRY) return;
  const staff = D.staff || {}; const act = Object.keys(staff).filter(s => staff[s].active !== false);
  const inl = {}, lv = {}, bd = {};
  act.forEach(sid => { try { const r = e.day(sid, today); if (r.inOffice) inl[sid] = staff[sid].name; if (r.leave && !(r.in)) lv[sid] = staff[sid].name; } catch (x) { } });
  let users = {}; try { const fs = admin.firestore(); const snap = await fs.collection('users').get(); snap.forEach(d => { users[d.id] = d.data(); }); } catch (x) { users = null; }
  const md = today.slice(5);
  act.forEach(sid => { const p = (D.staffPrivate || {})[sid] || {}; if (p.dob && String(p.dob).slice(5) === md) bd[sid] = staff[sid].name; });
  if (users) Object.values(users).forEach(u => { if (u && !u.disabled && u.dob && String(u.dob).slice(5) === md && !Object.values(bd).includes(u.name)) bd['u_' + (u.uid || u.name)] = u.name; });
  const old = (JS().boardSig || ''); const sig = JSON.stringify([today, inl, lv, bd]);
  if (sig !== old) { await db.ref('att/board').update({ date: today, in: inl, leave: lv, bdays: bd, at: NOW }); await write('jobState/boardSig', sig); }
  // birthdays typed by staff in the app → attendance (only if attendance has none)
  if (users) for (const [uid, u] of Object.entries(users)) { const sid = (D.userMap || {})[uid]; if (!sid || !u.dob) continue; const p = (D.staffPrivate || {})[sid] || {}; if (!p.dob) { await db.ref(`att/staffPrivate/${sid}/dob`).set(u.dob); log('dob copied', sid); } }
  // leave from Attendance → Tasks leave list (so planning, calendar and the team leave calendar see it)
  if (users) {
    let fs; try { fs = admin.firestore(); } catch (x) { return; }
    const want = {};
    for (const [sid, m] of Object.entries(D.requests || {})) for (const [rid, r] of Object.entries(m || {})) {
      if (!r || r.kind !== 'leave' || !r.from) continue; if ((r.to || r.from) < EG.addDays(today, -40)) continue; const uid = uidOfSid(sid); if (!uid) continue;
      want['att_' + sid + '_' + rid] = { uid, name: (staff[sid] || {}).name || '', from: r.from, to: r.to || r.from, half: !!r.half, type: r.leaveType || 'leave', reason: r.reason || '', status: r.status === 'approved' ? 'approved' : r.status === 'rejected' ? 'rejected' : 'pending', src: 'att' };
    }
    const have = JS().leaveMirror || {}; const next = {};
    for (const [id, v] of Object.entries(want)) { const h = JSON.stringify(v); next[id] = h; if (have[id] !== h) { await fs.collection('leaves').doc(id).set({ ...v, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }); log('leave mirror', id, v.status); } }
    for (const id of Object.keys(have)) if (!next[id]) { await fs.collection('leaves').doc(id).delete().catch(() => { }); }
    if (JSON.stringify(have) !== JSON.stringify(next)) await write('jobState/leaveMirror', next);
  }
}

/* ---------------- main ---------------- */
(async () => {
  try {
    await loadData(); initPush(); initMail();
    if (!D.settings) { log('No settings yet — nothing to do'); return; }
    const e = EG.create(D, NOW); E0 = e;
    log('IST', today, EG.istHM(NOW));
    await taskAlerts(e);
    await taskMorning(e);
    await taskMonthEnd(e);
    await taskLockReminder();
    await taskPayslips();
    await taskWeekly(e);
    await taskLatePattern(e);
    await taskHolidayList();
    await taskDueTomorrow();
    await taskWeeklyBackup();
    await taskSocietyGeo();
    await taskBoard(e);
    await taskLogins();
    await taskCleanup();
    await write('jobState/lastNotify', NOW);
    await write('jobState/lastRun', NOW);
    await write('jobState/lastError', null);
    log('done');
  } catch (err) {
    console.error(err);
    try { await write('jobState/lastError', String(err.message || err).slice(0, 200)); await write('jobState/lastRun', NOW); } catch (e) { }
    process.exitCode = 1;
  } finally { if (db) await admin.app().delete(); }
})();
