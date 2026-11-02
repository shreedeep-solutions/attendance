/* DEMO backend — used only when no Firebase config is set.
   Mimics the small part of the Firebase compat SDK the app uses and stores
   everything in this browser's localStorage. NOT secure; for trying the app. */
(function () {
  const DBK = 'ss_att_demo_db', USK = 'ss_att_demo_users';
  const load = k => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } };
  let db = load(DBK);
  const listeners = [];
  const norm = p => String(p || '').split('/').filter(Boolean);
  const get = (o, parts) => { for (const k of parts) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : o; };
  const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
  function resolveTS(v, now) { if (v && typeof v === 'object') { if (v['.sv'] === 'timestamp') return now; const o = Array.isArray(v) ? [] : {}; for (const k in v) { const r = resolveTS(v[k], now); if (r != null) o[k] = r; } return Object.keys(o).length || Array.isArray(o) ? o : null; } return v; }
  function setAt(parts, v) {
    if (!parts.length) { db = v || {}; return; }
    let o = db; const stack = [];
    for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) { if (v == null) return; o[parts[i]] = {}; } stack.push([o, parts[i]]); o = o[parts[i]]; }
    const last = parts[parts.length - 1];
    if (v == null) delete o[last]; else o[last] = v;
    for (let i = stack.length - 1; i >= 0; i--) { const [p, k] = stack[i]; if (p[k] && typeof p[k] === 'object' && !Object.keys(p[k]).length) delete p[k]; else break; }
  }
  const save = () => { localStorage.setItem(DBK, JSON.stringify(db)); };
  function notify(paths) {
    listeners.slice().forEach(l => {
      const hit = paths.some(p => { const a = l.parts.join('/'), b = p.join('/'); return a === b || b.startsWith(a + '/') || a.startsWith(b + '/') || a === '' || b === ''; });
      if (hit) l.cb(snap(l.parts));
    });
  }
  window.addEventListener('storage', e => { if (e.key === DBK) { db = load(DBK); notify([[]]); } });
  function snap(parts) { const v = clone(get(db, parts)); return { val: () => v, exists: () => v != null, key: parts[parts.length - 1] || null }; }
  function denied() { const e = new Error('PERMISSION_DENIED: Permission denied'); e.code = 'PERMISSION_DENIED'; return e; }
  // a few rules emulated so the demo behaves like the real thing
  function check(parts, v, authUid, now) {
    const p = parts.join('/');
    if (/^att\/admins\/[^/]+$/.test(p) && v != null && !get(db, ['att', 'admins', authUid])) {
      const admins = get(db, ['att', 'admins']); if (admins && Object.keys(admins).length && !admins[authUid]) throw denied();
    }
    const m = p.match(/^att\/claims\/([^/]+)$/);
    if (m && v) {
      const ks = get(db, ['att', 'kioskState', v.kiosk]); const st = get(db, ['att', 'settings']) || {};
      if (!get(db, ['att', 'kiosks', v.kiosk]) || !ks || now - ks.at > 45000 || (v.token !== ks.token && v.token !== ks.prev)) throw denied();
      if (st.requireSameNetwork && v.ip !== ks.ip) throw denied();
      if (!get(db, ['att', 'deviceMap', authUid])) throw denied();
    }
    const pm = p.match(/^att\/punches\/([^/]+)\/([^/]+)$/);
    if (pm && v) { const c = get(db, ['att', 'claims', authUid]); if (!c || c.kiosk !== v.kiosk || now - c.at > 180000 || get(db, parts)) throw denied(); }
  }
  let pushN = 0;
  const pushKey = () => '-' + Date.now().toString(36) + (pushN++).toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 7);
  function Ref(parts, app) {
    const r = {
      key: parts[parts.length - 1] || null,
      child: p => Ref(parts.concat(norm(p)), app),
      orderByChild: () => r, limitToLast: () => r, startAt: () => r, endAt: () => r, equalTo: () => r,
      on(ev, cb, err) {
        const p = parts.join('/');
        if (p === '.info/serverTimeOffset') { setTimeout(() => cb({ val: () => 0 }), 0); return cb; }
        if (p === '.info/connected') { setTimeout(() => cb({ val: () => true }), 0); return cb; }
        listeners.push({ parts, cb, app }); setTimeout(() => cb(snap(parts)), 0); return cb;
      },
      off(ev, cb) { for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].cb === cb && listeners[i].parts.join('/') === parts.join('/')) listeners.splice(i, 1); },
      once() { return Promise.resolve(snap(parts)); },
      set(v) {
        return new Promise((res, rej) => {
          const now = Date.now(); const val = resolveTS(clone(v), now);
          try { check(parts, val, app._auth.currentUser && app._auth.currentUser.uid, now); } catch (e) { return rej(e); }
          setAt(parts, val); save(); notify([parts]); res();
        });
      },
      update(obj) {
        return new Promise((res, rej) => {
          const now = Date.now(); const ps = [];
          try { Object.keys(obj).forEach(k => check(parts.concat(norm(k)), resolveTS(clone(obj[k]), now), app._auth.currentUser && app._auth.currentUser.uid, now)); } catch (e) { return rej(e); }
          Object.keys(obj).forEach(k => { const pp = parts.concat(norm(k)); setAt(pp, resolveTS(clone(obj[k]), now)); ps.push(pp); });
          save(); notify(ps); res();
        });
      },
      remove() { return r.set(null); },
      push(v) { const c = Ref(parts.concat([pushKey()]), app); if (v === undefined) return c; const p = c.set(v); c.then = p.then.bind(p); return c; }
    };
    return r;
  }
  function Auth(name) {
    const SK = 'ss_att_demo_session_' + name; const subs = [];
    const a = {
      currentUser: null,
      onAuthStateChanged(cb) { subs.push(cb); setTimeout(() => cb(a.currentUser), 0); return () => { }; },
      _set(u) { a.currentUser = u ? mkUser(u) : null; if (u) localStorage.setItem(SK, JSON.stringify(u)); else localStorage.removeItem(SK); subs.forEach(cb => cb(a.currentUser)); },
      async signInAnonymously() { const u = { uid: 'anon' + Math.random().toString(36).slice(2, 12), isAnonymous: true }; a._set(u); return { user: a.currentUser }; },
      async signInWithEmailAndPassword(email, pw) { const us = load(USK); const u = us[String(email).toLowerCase()]; if (!u) throw Object.assign(new Error('No account'), { code: 'auth/user-not-found' }); if (u.pw !== pw) throw Object.assign(new Error('Wrong password'), { code: 'auth/wrong-password' }); a._set({ uid: u.uid, email: u.email, displayName: u.displayName, isAnonymous: false }); return { user: a.currentUser }; },
      async createUserWithEmailAndPassword(email, pw) {
        if (!/^\S+@\S+\.\S+$/.test(email)) throw Object.assign(new Error('bad email'), { code: 'auth/invalid-email' });
        if (!pw || pw.length < 6) throw Object.assign(new Error('weak'), { code: 'auth/weak-password' });
        const us = load(USK); const k = email.toLowerCase(); if (us[k]) throw Object.assign(new Error('exists'), { code: 'auth/email-already-in-use' });
        us[k] = { uid: 'u' + Math.random().toString(36).slice(2, 12), email, pw }; localStorage.setItem(USK, JSON.stringify(us));
        a._set({ uid: us[k].uid, email, isAnonymous: false }); return { user: a.currentUser };
      },
      async signOut() { a._set(null); },
      async sendPasswordResetEmail() { }
    };
    function mkUser(u) {
      return Object.assign({}, u, {
        async updateProfile(p) { const us = load(USK); const k = (u.email || '').toLowerCase(); if (us[k]) { us[k].displayName = p.displayName; localStorage.setItem(USK, JSON.stringify(us)); } u.displayName = p.displayName; },
        async reauthenticateWithCredential(c) { const us = load(USK); const x = us[(u.email || '').toLowerCase()]; if (!x || x.pw !== c.pw) throw Object.assign(new Error('wrong'), { code: 'auth/wrong-password' }); }
      });
    }
    try { const s = JSON.parse(localStorage.getItem(SK) || 'null'); if (s) a.currentUser = mkUser(s); } catch (e) { }
    return a;
  }
  const apps = [];
  window.firebase = {
    apps,
    initializeApp(cfg, name) {
      name = name || '[DEFAULT]';
      const app = { name, _auth: null }; app._auth = Auth(name);
      app.auth = () => app._auth; app.database = () => ({ ref: p => Ref(norm(p), app) });
      apps.push(app); return app;
    }
  };
  window.firebase.auth = { EmailAuthProvider: { credential: (email, pw) => ({ email, pw }) } };
  window.firebase.database = { ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } } };
})();
