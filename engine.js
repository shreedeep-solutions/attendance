/* =====================================================================
   Shreedeep Solutions — Attendance & Payroll ENGINE  v3.0
   Pure calculation code shared by the web app (browser) and the
   GitHub Actions jobs (Node). All dates are handled in IST.
   v3: no paid leave / comp-off; a working day counts only when the
       daily report (PDF + photos) is uploaded and sent the same day.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const IST = 330 * 60000;
  const pad = n => String(n).padStart(2, '0');
  const r2 = n => Math.round((n || 0) * 100) / 100;
  function istParts(ms) { const d = new Date(ms + IST); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() }; }
  const istDate = ms => { const p = istParts(ms); return p.y + '-' + pad(p.m) + '-' + pad(p.d); };
  const istHM = ms => { const p = istParts(ms); return pad(p.h) + ':' + pad(p.mi); };
  const mkOf = ds => ds.slice(0, 7);
  const dsDow = ds => { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const addDays = (ds, n) => { const [y, m, d] = ds.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); };
  const daysIn = mk => { const [y, m] = mk.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
  const addMonths = (mk, n) => { const [y, m] = mk.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1); };
  const toMin = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const minToHM = m => (m == null || isNaN(m) || !isFinite(m)) ? '' : pad(Math.floor(m / 60)) + ':' + pad(Math.round(m % 60));
  const arr = v => Array.isArray(v) ? v : Object.values(v || {});
  const daysBetween = (a, b) => { const out = []; let d = a; let i = 0; while (d <= b && i < 800) { out.push(d); d = addDays(d, 1); i++; } return out; };
  const fyOf = mk => { const y = +mk.slice(0, 4), m = +mk.slice(5); return m >= 4 ? y : y - 1; };

  const DEFAULTS = {
    company: 'Shreedeep Solutions', address: 'Sector-8, Airoli, Navi Mumbai',
    phones: '90042 64282 / 90042 62639', email: 'shreedeepsolutions@gmail.com', website: 'www.shreedeepsolutions.com',
    shiftStart: '09:00', shiftEnd: '18:00', graceMins: 15, earlyGraceMins: 0, breakMins: 60,
    fullHours: 8, halfHours: 4, missingOutAs: 'H', latesPerHalfDay: 0,
    weeklyOff: [2], holidays: {}, blackouts: {}, payOffDayWork: true, sickNoteDays: 2,
    reportRequired: true, reportMinPhotos: 1, reportShareRequired: true, reportKeepDays: 45,
    waGroupName: 'Shreedeep Reporting- Staff & Student',
    requireSameNetwork: true, gpsMode: 'flag', officeLat: null, officeLng: null, gpsRadius: 150, selfieRequired: true,
    idleLockMins: 15, oldEditDays: 7, secondAdminApproval: true,
    trackStart: '', reportEmails: '', bonusPercent: 8.33, bonusCeiling: 7000, signatory: 'deepali'
  };

  const CODES = {
    P:   { label: 'Present', paid: 1 },
    H:   { label: 'Half day', paid: 0.5 },
    A:   { label: 'Absent', paid: 0 },
    NR:  { label: 'No daily report', paid: 0 },
    UL:  { label: 'Leave (unpaid)', paid: 0 },
    SL:  { label: 'Sick leave (unpaid)', paid: 0 },
    WO:  { label: 'Weekly off', paid: 1 },
    HO:  { label: 'Holiday', paid: 1 },
    PEND:{ label: 'Not checked in yet', paid: 1 },
    FUT: { label: 'Upcoming', paid: 1 },
    NJ:  { label: 'Not employed', paid: 0 },
    NT:  { label: 'Before tracking started', paid: 1 }
  };
  const OVERRIDE_CODES = ['P', 'H', 'A', 'UL', 'SL', 'WO', 'HO'];
  const LEAVE_TYPES = { UL: 'Leave (unpaid)', SL: 'Sick leave (unpaid)' };

  /* Build an engine over a data snapshot.
     D = { settings, staff, staffPrivate, punches, overrides, requests, reports, adjust, locks, snapshots } */
  function create(D, nowMs) {
    D = D || {};
    const now = nowMs || Date.now();
    const S = Object.assign({}, DEFAULTS, D.settings || {});
    const today = istDate(now);
    const staff = D.staff || {}, priv = D.staffPrivate || {};
    const overrides = D.overrides || {}, adjust = D.adjust || {}, locks = D.locks || {}, snaps = D.snapshots || {};
    const reports = D.reports || {};
    const woSet = new Set(arr(S.weeklyOff).map(Number));
    const hol = S.holidays || {};
    const cache = { day: {}, month: {} };

    const pbd = {};
    Object.entries(D.punches || {}).forEach(([sid, ps]) => {
      const m = pbd[sid] = {};
      Object.entries(ps || {}).forEach(([pid, p]) => {
        if (!p || typeof p.at !== 'number') return;
        const ds = istDate(p.at); (m[ds] = m[ds] || []).push(Object.assign({ id: pid }, p));
      });
      Object.values(m).forEach(l => l.sort((a, b) => a.at - b.at));
    });
    const leaveDay = {};
    Object.entries(D.requests || {}).forEach(([sid, rs]) => {
      Object.entries(rs || {}).forEach(([rid, r]) => {
        if (!r || r.kind !== 'leave' || r.status !== 'approved' || !r.from) return;
        const type = LEAVE_TYPES[r.leaveType] ? r.leaveType : 'UL';
        daysBetween(r.from, r.to || r.from).forEach(ds => { (leaveDay[sid] = leaveDay[sid] || {})[ds] = { type, half: !!r.half, rid, reason: r.reason || '' }; });
      });
    });

    const dayDefault = ds => hol[ds] ? 'HO' : woSet.has(dsDow(ds)) ? 'WO' : null;
    const holidayName = ds => hol[ds] || '';
    const shiftOf = sid => { const u = staff[sid] || {}; return { start: u.shiftStart || S.shiftStart, end: u.shiftEnd || S.shiftEnd, brk: +(u.breakMins || S.breakMins) || 0 }; };

    /* Daily report: counts only for files uploaded (server time) on that same IST date */
    function reportStatus(sid, ds) {
      const rp = (reports[sid] || {})[ds] || {};
      const pdfOk = !!(rp.pdf && rp.pdf.at && istDate(rp.pdf.at) === ds);
      const photos = Object.values(rp.photos || {}).filter(p => p && p.at && istDate(p.at) === ds);
      const shares = Object.values(rp.shared || {}).filter(t => typeof t === 'number' && istDate(t) === ds).sort();
      const uploaded = pdfOk && photos.length >= (+S.reportMinPhotos || 0);
      const lastUpload = Math.max(pdfOk ? rp.pdf.at : 0, ...photos.map(p => p.at), 0);
      const sharedAfter = shares.filter(t => t >= lastUpload - 60000);
      const sent = shares.length > 0;
      const ok = uploaded && (!S.reportShareRequired || sent);
      return { pdf: pdfOk ? rp.pdf : null, photos: photos.length, shared: sent ? shares[shares.length - 1] : null, sharedAll: !!sharedAfter.length, uploaded, ok, any: pdfOk || photos.length > 0 };
    }

    function applyCode(r, code) {
      const c = CODES[code] || CODES.A;
      r.code = code; r.paid = c.paid;
      if (r.off && (code === 'P' || code === 'H')) { r.paid = 1; if (S.payOffDayWork) r.ot = code === 'P' ? 1 : 0.5; r.flags.push('Worked on ' + (r.off === 'HO' ? 'holiday' : 'weekly off')); }
      if (r.off && (code === 'UL' || code === 'SL')) r.paid = 1;
      return r;
    }

    function day(sid, ds) {
      const key = sid + '|' + ds; if (cache.day[key]) return cache.day[key];
      const u = staff[sid] || {};
      const r = { ds, sid, code: '', paid: 0, ot: 0, in: null, out: null, hours: 0, breakMin: 0,
        late: false, lateMin: 0, early: false, earlyReason: '', breakOver: false, missingOut: false, inOffice: false, onBreak: false,
        flags: [], off: null, leave: null, override: null, punches: [], provisional: false, report: null, reportPending: false };
      cache.day[key] = r;
      if ((u.joinDate && ds < u.joinDate) || (u.leftDate && ds > u.leftDate)) { r.code = 'NJ'; return r; }
      if (S.trackStart && ds < S.trackStart) { r.code = 'NT'; r.paid = 1; return r; }
      const def = dayDefault(ds); r.off = def;
      const ps = (pbd[sid] && pbd[sid][ds]) || []; r.punches = ps;
      const inP = ps.find(p => p.type === 'in');
      let outP = null;
      if (inP) { const outs = ps.filter(p => p.type === 'out' && p.at > inP.at); outP = outs.length ? outs[outs.length - 1] : null; }
      let bStart = null, bTot = 0;
      ps.forEach(p => { if (p.type === 'bout') bStart = p.at; if (p.type === 'bin' && bStart) { bTot += p.at - bStart; bStart = null; } });
      if (bStart) { if (outP && outP.at > bStart) bTot += outP.at - bStart; else if (ds === today) { bTot += now - bStart; r.onBreak = true; } }
      r.breakMin = Math.round(bTot / 60000);
      r.in = inP ? istHM(inP.at) : null; r.out = outP ? istHM(outP.at) : null;
      if (outP && outP.reason) r.earlyReason = outP.reason;
      ps.forEach(p => { if (p.gpsFar) r.flags.push('Far from office (' + p.dist + ' m) at ' + istHM(p.at)); if (p.gpsNone) r.flags.push('No GPS at ' + istHM(p.at)); });
      const ov = overrides[sid] && overrides[sid][ds];
      if (ov && ov.status !== 'pending') {
        r.override = ov;
        if ('in' in ov) r.in = ov.in || null;
        if ('out' in ov) r.out = ov.out || null;
        if (ov.earlyReason) r.earlyReason = ov.earlyReason;
      }
      if (r.in && r.out) { const h = (toMin(r.out) - toMin(r.in)) / 60; r.hours = h > 0 ? h : 0; }
      const sh = shiftOf(sid);
      if (r.in && !def) { const lm = toMin(r.in) - toMin(sh.start); if (lm > (+S.graceMins || 0)) { r.late = true; r.lateMin = lm; } }
      if (r.out && !def && toMin(r.out) < toMin(sh.end) - (+S.earlyGraceMins || 0)) r.early = true;
      if (sh.brk && r.breakMin > sh.brk) { r.breakOver = true; r.flags.push('Break ' + r.breakMin + ' min (allowed ' + sh.brk + ')'); }
      r.report = reportStatus(sid, ds);

      let work = 0;
      if (r.in && r.out) work = r.hours >= +S.fullHours ? 1 : r.hours >= +S.halfHours ? 0.5 : 0;
      else if (r.in && !r.out) {
        if (ds < today) { r.missingOut = true; work = S.missingOutAs === 'P' ? 1 : S.missingOutAs === 'A' ? 0 : 0.5; r.flags.push('No check-out'); }
        else { r.provisional = true; r.inOffice = true; work = 1; }
      }
      // admin correction wins over everything (report rule included)
      if (ov && ov.status && ov.status !== 'pending' && OVERRIDE_CODES.includes(ov.status)) return applyCode(r, ov.status);
      // daily report rule
      const needReport = S.reportRequired && r.in && work > 0 && !(ov && ov.skipReport);
      if (needReport && !r.report.ok) {
        if (ds < today) { r.flags.push(r.report.uploaded ? 'Report not sent to WhatsApp' : 'No daily report'); if (def) { r.code = def; r.paid = 1; return r; } r.code = 'NR'; r.paid = 0; return r; }
        r.reportPending = true; r.provisional = true;
      }
      if (def) {
        if (r.in && work > 0) { r.code = work === 1 ? 'P' : 'H'; r.paid = 1; if (S.payOffDayWork && !r.provisional) r.ot = work; r.flags.push('Worked on ' + (def === 'HO' ? 'holiday' : 'weekly off')); }
        else { r.code = def; r.paid = 1; }
        return r;
      }
      const lv = leaveDay[sid] && leaveDay[sid][ds];
      if (lv) {
        r.leave = lv;
        if (!lv.half) return applyCode(r, lv.type);
        r.code = work >= 0.5 ? 'H' : lv.type; r.paid = work >= 0.5 ? 0.5 : 0; return r;
      }
      if (r.in) { r.code = r.inOffice ? 'P' : work === 1 ? 'P' : work === 0.5 ? 'H' : 'A'; r.paid = r.inOffice ? 1 : work; return r; }
      if (ds > today) { r.code = 'FUT'; r.paid = 1; r.provisional = true; return r; }
      if (ds === today) { r.code = 'PEND'; r.paid = 1; r.provisional = true; return r; }
      r.code = 'A'; r.paid = 0; return r;
    }

    function month(sid, mk) {
      const key = sid + '|' + mk; if (cache.month[key]) return cache.month[key];
      const Dn = daysIn(mk);
      const m = { mk, D: Dn, days: {}, counts: {}, paid: 0, ot: 0, late: 0, lateMin: 0, early: 0, breakOver: 0, missingOut: 0, noReport: 0, hours: 0, provisional: 0, workDays: 0, presentDays: 0, flags: 0 };
      for (let d = 1; d <= Dn; d++) {
        const ds = mk + '-' + pad(d); const r = day(sid, ds);
        m.days[d] = r; m.counts[r.code] = (m.counts[r.code] || 0) + 1;
        m.paid += r.paid; m.ot += r.ot; m.hours += r.hours;
        if (r.late) { m.late++; m.lateMin += r.lateMin; }
        if (r.early) m.early++; if (r.breakOver) m.breakOver++; if (r.missingOut) m.missingOut++; if (r.code === 'NR') m.noReport++;
        if (r.provisional) m.provisional++; if (r.flags.length) m.flags++;
        if (!r.off && !['NJ', 'NT', 'FUT', 'PEND'].includes(r.code)) m.workDays++;
        if ((r.code === 'P' || r.code === 'H') && !r.off) m.presentDays += r.code === 'P' ? 1 : 0.5;
      }
      m.paid = r2(m.paid); m.ot = r2(m.ot);
      return (cache.month[key] = m);
    }
    function rate(sid, mk) {
      const p = priv[sid] || {}; const rev = p.revisions || {};
      const keys = Object.keys(rev).filter(k => k <= mk).sort();
      return keys.length ? +rev[keys[keys.length - 1]] || 0 : +p.salary || 0;
    }
    const snapshot = (sid, mk) => (snaps[mk] && snaps[mk][sid]) || null;
    const isLocked = mk => !!locks[mk];
    function arrearsFor(sid, mk) {
      const lines = []; let total = 0;
      Object.keys(snaps).filter(m => m < mk && isLocked(m)).sort().forEach(m => {
        const s = snapshot(sid, m); if (!s || (s.arrearsPaidIn && s.arrearsPaidIn !== mk)) return;
        const diff = (rate(sid, m) - (+s.monthly || 0)) * (+s.paidDays || 0) / (+s.D || 30);
        if (Math.abs(diff) >= 1) { lines.push({ mk: m, amount: Math.round(diff) }); total += Math.round(diff); }
      });
      return { total, lines };
    }
    function salary(sid, mk, opts) {
      opts = opts || {};
      if (!opts.live && isLocked(mk)) { const s = snapshot(sid, mk); if (s) return Object.assign({ frozen: true, u: staff[sid] || {} }, s); }
      const u = staff[sid] || {}; const m = month(sid, mk);
      const monthly = rate(sid, mk); const perDay = monthly / m.D;
      const lpd = +S.latesPerHalfDay || 0;
      const lateDays = lpd > 0 ? Math.floor(m.late / lpd) * 0.5 : 0;
      const paidDays = r2(Math.max(0, m.paid - lateDays));
      const adj = (adjust[sid] && adjust[sid][mk]) || {};
      const earned = Math.round(perDay * paidDays), otAmt = Math.round(perDay * m.ot);
      const arrears = arrearsFor(sid, mk);
      const bonus = Math.round(+adj.bonus || 0), incentive = Math.round(+adj.incentive || 0);
      const advance = Math.round(+adj.advance || 0), other = Math.round(+adj.other || 0);
      const gross = earned + otAmt + arrears.total + bonus + incentive;
      const ded = advance + other;
      return { frozen: false, u, mk, monthly, perDay: r2(perDay), D: m.D, paidDays, lop: r2(m.D - paidDays), lateDays, late: m.late,
        ot: m.ot, otAmt, earned, arrears, bonus, incentive, advance, other, gross, ded, net: gross - ded,
        counts: m.counts, presentDays: m.presentDays, hours: r2(m.hours), provisional: m.provisional, missingOut: m.missingOut, noReport: m.noReport, adjNote: adj.note || '' };
    }
    function snapshotFor(sid, mk) {
      const s = salary(sid, mk, { live: true });
      const o = {}; ['monthly', 'D', 'paidDays', 'lop', 'late', 'lateDays', 'ot', 'otAmt', 'earned', 'arrears', 'bonus', 'incentive', 'advance', 'other', 'gross', 'ded', 'net', 'counts', 'presentDays', 'hours', 'adjNote', 'perDay', 'noReport', 'missingOut'].forEach(k => { o[k] = s[k]; });
      return JSON.parse(JSON.stringify(o));
    }

    /* ---------- reports ---------- */
    function rangeStats(sid, from, to) {
      const st = { from, to, workDays: 0, present: 0, half: 0, absent: 0, leave: 0, noReport: 0, late: 0, lateMin: 0, early: 0, hours: 0, hoursDays: 0, arr: [], dep: [], absByDow: [0, 0, 0, 0, 0, 0, 0], workByDow: [0, 0, 0, 0, 0, 0, 0], paid: 0, days: 0, reportsSent: 0 };
      daysBetween(from, to).forEach(ds => {
        if (ds > today) return;
        const r = day(sid, ds); if (r.code === 'NJ' || r.code === 'NT') return;
        st.days++; st.paid += r.paid;
        if (r.report && r.report.ok) st.reportsSent++;
        if (r.off && !r.in) return;
        const dw = dsDow(ds);
        if (!r.off) { st.workDays++; st.workByDow[dw]++; }
        if (r.code === 'P') st.present++; else if (r.code === 'H') st.half++;
        else if (r.code === 'UL' || r.code === 'SL') st.leave++;
        else if (r.code === 'A' || r.code === 'NR') { st.absent++; st.absByDow[dw]++; if (r.code === 'NR') st.noReport++; }
        if (r.late) { st.late++; st.lateMin += r.lateMin; }
        if (r.early) st.early++;
        if (r.hours) { st.hours += r.hours; st.hoursDays++; }
        if (r.in && !r.off) st.arr.push(toMin(r.in));
        if (r.out && !r.off) st.dep.push(toMin(r.out));
      });
      const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
      st.avgIn = minToHM(avg(st.arr)); st.avgOut = minToHM(avg(st.dep));
      st.attPct = st.workDays ? r2((st.present + st.half * 0.5) / st.workDays * 100) : 0;
      st.punctPct = (st.present + st.half) ? r2((1 - st.late / (st.present + st.half)) * 100) : 0;
      st.avgHours = st.hoursDays ? r2(st.hours / st.hoursDays) : 0;
      st.hours = r2(st.hours);
      const rateAll = st.workDays ? st.absent / st.workDays : 0;
      st.pattern = [];
      st.absByDow.forEach((n, i) => { if (n >= 2 && st.workByDow[i] && n / st.workByDow[i] >= 2 * rateAll) st.pattern.push(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]); });
      return st;
    }
    function weekStartFor(ds) { let d = ds; for (let i = 0; i < 7 && dsDow(d) !== 3; i++) d = addDays(d, -1); return d; }
    function weekScores(weekStart) {
      const end = addDays(weekStart, 5);
      return Object.keys(staff).filter(sid => staff[sid].active !== false).map(sid => {
        const st = rangeStats(sid, weekStart, end);
        const score = r2(st.attPct * 0.7 + st.punctPct * 0.3);
        return { sid, name: staff[sid].name, empId: staff[sid].empId || '', attPct: st.attPct, punctPct: st.punctPct, late: st.late, hours: st.hours, absent: st.absent, noReport: st.noReport, score };
      }).sort((a, b) => b.score - a.score).map((x, i) => Object.assign(x, { rank: i + 1 }));
    }
    function bonusFor(sid, fy, pct, ceiling) {
      const months = []; let total = 0, days = 0;
      for (let i = 0; i < 12; i++) {
        const mk = addMonths(fy + '-04', i); if (mk > mkOf(today)) break;
        const s = salary(sid, mk); const base = ceiling > 0 ? Math.min(s.monthly, ceiling) : s.monthly;
        const amt = base * (s.paidDays / s.D);
        months.push({ mk, base, paidDays: s.paidDays, D: s.D, amount: Math.round(amt) });
        total += amt; days += s.paidDays;
      }
      return { months, wages: Math.round(total), days: r2(days), eligible: days >= 30, bonus: days >= 30 ? Math.round(total * pct / 100) : 0 };
    }
    function leaveOverlap(from, to, exceptSid) {
      const out = [];
      Object.entries(leaveDay).forEach(([sid, m]) => { if (sid === exceptSid) return; Object.keys(m).forEach(ds => { if (ds >= from && ds <= to) out.push({ sid, ds, type: m[ds].type }); }); });
      return out;
    }
    function inBlackout(from, to) { return Object.values(S.blackouts || {}).filter(b => b && b.from && !(to < b.from || from > (b.to || b.from))); }
    function todayBoard() { return Object.keys(staff).filter(sid => staff[sid].active !== false).map(sid => ({ sid, r: day(sid, today) })); }

    return { S, today, now, staff, priv, day, month, rate, salary, snapshotFor, arrearsFor, isLocked, snapshot, reportStatus,
      rangeStats, weekStartFor, weekScores, bonusFor, leaveOverlap, inBlackout, todayBoard, dayDefault, holidayName, shiftOf, leaveDay };
  }

  return { create, DEFAULTS, CODES, OVERRIDE_CODES, LEAVE_TYPES, istDate, istHM, istParts, mkOf, dsDow, addDays, daysIn, addMonths, toMin, minToHM, daysBetween, fyOf, pad, r2, arr };
});
