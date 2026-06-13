/* ============================================================
   ipartment Vietnam - Supabase client + auth layer
   Loaded on every page AFTER the supabase-js CDN script and
   BEFORE main.js. Exposes window.sb (raw client) and
   window.ipartmentAuth (high-level helpers used across pages).
   ============================================================ */
(function () {
  'use strict';

  // Public project config. The publishable (anon) key is SAFE to expose in
  // client code - all real protection lives in the database RLS policies.
  var SUPABASE_URL = 'https://xfokwekprzotmxywcblx.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_EohmODmIvdGqCnzdZvGwdA_qP_L7vin';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[ipartment] supabase-js failed to load from CDN.');
    return;
  }

  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.sb = sb;

  // Small in-memory cache so we do not refetch the profile on every call
  var _profileCache = null;

  var Auth = window.ipartmentAuth = {
    client: sb,

    async getSession() {
      var res = await sb.auth.getSession();
      return res.data ? res.data.session : null;
    },

    async getUser() {
      var s = await this.getSession();
      return s ? s.user : null;
    },

    // Returns the profile row for the logged-in user (cached). null if logged out.
    async getProfile(force) {
      if (_profileCache && !force) return _profileCache;
      var user = await this.getUser();
      if (!user) { _profileCache = null; return null; }
      var res = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (res.error) { console.warn('[ipartment] profile load failed', res.error.message); }
      _profileCache = res.data ? Object.assign({ email: user.email }, res.data) : { id: user.id, email: user.email, role: 'user' };
      return _profileCache;
    },

    async isAdmin() {
      var p = await this.getProfile();
      return !!(p && p.role === 'admin');
    },

    // Create an account. Auto signs in afterwards so the user is logged in
    // immediately (works whether or not email confirmation is enabled).
    async signUp(opts) {
      var res = await sb.auth.signUp({
        email: opts.email,
        password: opts.password,
        options: {
          data: {
            first_name: opts.firstName || '',
            last_name: opts.lastName || '',
            phone: opts.phone || ''
          }
        }
      });
      if (res.error) throw res.error;
      _profileCache = null;
      // If no session came back (email-confirmation flow), try an immediate sign-in.
      if (!res.data.session) {
        var si = await sb.auth.signInWithPassword({ email: opts.email, password: opts.password });
        if (si.error) {
          var e = new Error('Account created. Please check your email to confirm before logging in.');
          e.needsConfirm = true;
          throw e;
        }
      }
      return res.data;
    },

    async signIn(opts) {
      var res = await sb.auth.signInWithPassword({ email: opts.email, password: opts.password });
      if (res.error) throw res.error;
      _profileCache = null;
      return res.data;
    },

    async signOut() {
      _profileCache = null;
      await sb.auth.signOut();
    },

    onChange(cb) {
      return sb.auth.onAuthStateChange(function (_evt, session) {
        _profileCache = null;
        try { cb(session); } catch (e) { /* noop */ }
      });
    }
  };

  // ============================================================
  // Lightweight analytics: funnel steps, exit-survey answers, A/B exposure.
  // Writes to the append-only events table. Fire-and-forget, never blocks UX.
  // ============================================================
  function sessionId() {
    var k = 'ipartment_sid';
    var v = localStorage.getItem(k);
    if (!v) { v = 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); localStorage.setItem(k, v); }
    return v;
  }
  window.ipartmentTrack = function (type, name, opts) {
    opts = opts || {};
    try {
      sb.from('events').insert({
        type: type,
        name: name || null,
        session_id: sessionId(),
        variant: opts.variant || null,
        page: (location.pathname.split('/').pop() || 'index.html'),
        meta: opts.meta || null
      }).then(function () {}, function () {});
    } catch (e) { /* never block UX on analytics */ }
  };

  // ============================================================
  // NAV: reflect logged-in state + gate the My Account link
  // ============================================================
  async function refreshNavState() {
    var profile = null;
    try { profile = await Auth.getProfile(); } catch (e) { /* offline / logged out */ }

    document.querySelectorAll('a[href="my-account.html"]').forEach(function (a) {
      // Replace any earlier (localStorage-era) handlers by cloning the node
      var clone = a.cloneNode(true);
      a.parentNode.replaceChild(clone, a);
      clone.addEventListener('click', function (e) {
        if (profile) return; // logged in - go straight to dashboard
        e.preventDefault();
        if (window.ipartmentOpenAuth) window.ipartmentOpenAuth('login');
      });
      // The label tells the truth about what a click does: logged out it opens
      // the login modal, so it reads "Log in"; logged in it reads "My Account"
      // with a small green signed-in dot. Never the guest's name (clean nav).
      if (!clone.classList.contains('nav-cta')) {
        clone.textContent = profile ? 'My Account' : 'Log in';
        if (profile) {
          var dot = document.createElement('span');
          dot.className = 'nav-dot';
          dot.setAttribute('aria-label', 'Signed in');
          clone.appendChild(dot);
        }
      }
    });

    // Homepage hero: a quiet "welcome back" pill for signed-in guests, in the
    // same pill row as "Now Open" so the hero stays composed.
    var wb = document.getElementById('welcomeBackPill');
    if (wb) {
      if (profile) {
        var fn = (profile.first_name || '').trim();
        wb.innerHTML = '<span class="dot dot-member"></span>Welcome back' + (fn ? ', ' + fn.replace(/[<>&"]/g, '') : '') + '';
        wb.hidden = false;
      } else {
        wb.hidden = true;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', refreshNavState);
  Auth.onChange(function () { refreshNavState(); });
})();
