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
  const nodes = ['settings', 'staff', 'staffPrivate', 'punches', 'overrides', 'requests', 'adjust', 'locks', 'snapshots', 'pushSubs', 'notices', 'jobState', 'admins', 'assets', 'kioskState', 'kiosks', 'reports', 'deviceMap'];
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
async function push(targets, title, body, tag) {
  const url = env.APP_URL || './index.html';
  for (const t of targets) {
    if (DRY || !pushReady) { log('PUSH', t.s.role, t.s.name, '|', title, '|', body); continue; }
    try { await webpush.sendNotification(JSON.parse(t.s.sub), JSON.stringify({ title, body, tag, url })); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await write(`pushSubs/${t.uid}/${t.key}`, null); else log('push error', e.statusCode, e.body || e.message); }
  }
}
const toAdmins = (t, b, tag) => push(subsOf(s => s.role === 'admin'), t, b, tag);
const toStaff = (sid, t, b, tag) => push(subsOf(s => s.role === 'staff' && s.sid === sid), t, b, tag);
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

/* ---------------- main ---------------- */
(async () => {
  try {
    await loadData(); initPush(); initMail();
    if (!D.settings) { log('No settings yet — nothing to do'); return; }
    const e = EG.create(D, NOW);
    log('IST', today, EG.istHM(NOW));
    await taskAlerts(e);
    await taskMorning(e);
    await taskMonthEnd(e);
    await taskLockReminder();
    await taskPayslips();
    await taskWeekly(e);
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
