/* ============================================================
   ipartment Vietnam - Shared Site Behavior
   Loaded by every page. Handles: CRM storage, welcome popup,
   scroll reveal, mobile nav, back-to-top, toasts.
   ============================================================ */
(function() {
  'use strict';

  // ============================================================
  // MICROSOFT CLARITY - free session replay + heatmaps
  // Baked default is empty. Paste a project ID in the admin Integration tab
  // (per-browser), or hardcode CLARITY_DEFAULT_ID to enable it for everyone.
  // ============================================================
  var CLARITY_DEFAULT_ID = '';
  function getClarityId() {
    try { var o = localStorage.getItem('ipartment_clarity_id'); if (o && o.trim()) return o.trim(); } catch (e) {}
    return CLARITY_DEFAULT_ID;
  }
  (function loadClarity() {
    var id = getClarityId();
    if (!id || window.clarity) return;
    (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",id);
  })();
  window.ipartmentSetClarity = function(id) { try { localStorage.setItem('ipartment_clarity_id', (id || '').trim()); } catch (e) {} };
  window.ipartmentGetClarity = getClarityId;

  // ============================================================
  // CRM - localStorage-based customer data layer
  // ============================================================
  const CRM = window.ipartmentCRM = {
    KEYS: {
      leads: 'ipartment_leads',
      bookings: 'ipartment_bookings',
      users: 'ipartment_users',
      sessions: 'ipartment_sessions',
      wishlist: 'ipartment_wishlist',
      applications: 'ipartment_applications',
    },

    _read(key) {
      try { return JSON.parse(localStorage.getItem(key) || '[]'); }
      catch (e) { return []; }
    },
    _write(key, arr) {
      try { localStorage.setItem(key, JSON.stringify(arr)); return true; }
      catch (e) { console.warn('[CRM] write failed', e); return false; }
    },
    _id() { return 'IPT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); },

    // Generic add - any type of record
    add(type, record) {
      const arr = this._read(this.KEYS[type] || type);
      const stamped = Object.assign({
        id: this._id(),
        createdAt: new Date().toISOString(),
        source: window.location.pathname.split('/').pop() || 'index.html'
      }, record);
      arr.push(stamped);
      this._write(this.KEYS[type] || type, arr);
      // Supabase is the source of truth. localStorage above is a local cache.
      this._sendSupabase(type, stamped);
      // Webhook now only triggers emails (Brevo) via Make - no longer stores data.
      this._sendWebhook(type, stamped);
      return stamped;
    },

    // Write the capture to Supabase (the source of truth). Bookings are handled
    // directly in booking.js (they need user_id + full field mapping). Accounts
    // live in profiles via the auth trigger, so 'users' is not duplicated here.
    _sendSupabase(type, record) {
      if (!window.sb) return;
      try {
        if (type === 'leads') {
          window.sb.from('leads').insert({
            type: record.type || null,
            name: record.name || null,
            email: record.email || null,
            phone: record.phone || null,
            voucher_code: record.voucher || record.voucherCode || null,
            offer_variant: record.offerVariant || null,
            booking_ref: record.bookingRef || null,
            applied_role: record.appliedRole || null,
            source_page: record.source || null,
            // Backward-compatible meta: existing callers pass promoValue only and
            // still get { promoValue }; new callers (the chatbot) pass an explicit
            // meta object and get it stored; if both are present they merge.
            meta: (function () {
              var m = record.meta || null;
              if (record.promoValue) { m = Object.assign({}, m, { promoValue: record.promoValue }); }
              return m;
            })()
          }).then(function () {}, function () {});
        } else if (type === 'applications') {
          window.sb.from('applications').insert({
            role: record.role || record.appliedRole || null,
            first_name: record.first || null,
            last_name: record.last || null,
            email: record.email || null,
            phone: record.phone || null,
            years_experience: record.years || null,
            link: record.link || null,
            message: record.message || record.notes || null
          }).then(function () {}, function () {});
        }
      } catch (e) { /* never block UX on storage */ }
    },

    list(type) { return this._read(this.KEYS[type] || type); },
    clear(type) { this._write(this.KEYS[type] || type, []); },
    clearAll() { Object.values(this.KEYS).forEach(k => localStorage.removeItem(k)); },

    // ── WEBHOOK INTEGRATION ──
    // Default Make.com webhook baked into the site so EVERY visitor's
    // submission fires it (not just the admin's browser). The admin panel
    // can still override this per-browser via setWebhook().
    DEFAULT_WEBHOOK: 'https://hook.eu1.make.com/wloue5ukgywnd4ftjsjz4uqjxspxygv2',
    setWebhook(url) { localStorage.setItem('ipartment_webhook_url', url || ''); },
    getWebhook() {
      const override = localStorage.getItem('ipartment_webhook_url');
      // An admin can blank it out intentionally by saving "" - respect that only if the key exists and is empty on purpose.
      if (override && override.trim()) return override.trim();
      return this.DEFAULT_WEBHOOK;
    },
    _sendWebhook(type, record) {
      const url = this.getWebhook();
      if (!url) return;
      // Fire-and-forget. Standard CORS POST (no-cors was removed - it silently
      // mangled the JSON body, which is why early webhook tests looked empty).
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, source: 'ipartment-website', record })
        }).catch(() => {});
      } catch (e) { /* swallow */ }
    },
    // Test the webhook with a small ping payload
    testWebhook() {
      const url = this.getWebhook();
      if (!url) return Promise.reject(new Error('No webhook URL set'));
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'test', source: 'ipartment-website', record: { ping: 'hello from ipartment', at: new Date().toISOString() } })
      });
    },

    // Export everything as JSON for download (used by admin page)
    exportAll() {
      const out = {};
      Object.entries(this.KEYS).forEach(([name, key]) => { out[name] = this._read(key); });
      out.exportedAt = new Date().toISOString();
      return out;
    },

    // Export specific type as CSV
    exportCSV(type) {
      const rows = this.list(type);
      if (!rows.length) return '';
      const flat = rows.map(r => this._flatten(r));
      const headers = Array.from(new Set(flat.flatMap(o => Object.keys(o))));
      const escape = v => {
        if (v === null || v === undefined) return '';
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      };
      return [headers.join(',')].concat(flat.map(r => headers.map(h => escape(r[h])).join(','))).join('\n');
    },
    _flatten(obj, prefix = '') {
      const out = {};
      Object.entries(obj).forEach(([k, v]) => {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, this._flatten(v, key));
        else out[key] = Array.isArray(v) ? v.join('; ') : v;
      });
      return out;
    },

    // Track simple page-view session (for analytics flavor)
    track() {
      const sessions = this._read(this.KEYS.sessions);
      sessions.push({
        page: window.location.pathname,
        time: new Date().toISOString(),
        ref: document.referrer || 'direct',
        ua: navigator.userAgent.slice(0, 80)
      });
      // Keep last 200
      if (sessions.length > 200) sessions.splice(0, sessions.length - 200);
      this._write(this.KEYS.sessions, sessions);
      // Mirror to Supabase (source of truth) as a pageview event
      if (window.ipartmentTrack) window.ipartmentTrack('pageview', null, { meta: { path: window.location.pathname, ref: document.referrer || 'direct' } });
    }
  };

  // ============================================================
  // WELCOME POPUP - first-visit CTA capture
  // ============================================================
  function initWelcomePopup() {
    // Skip on admin-only pages: no public visitor will land here, and it's annoying for the team
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('admin')) return;
    // Once per access: show the welcome offer a single time per browser session.
    // If the visitor closes the site and opens it again (a fresh session), it
    // shows once more, but it never repeats within the same visit.
    try { if (sessionStorage.getItem('ipartment_welcome_shown') === '1') return; } catch (e) {}
    setTimeout(showWelcomePopup, 1400);
  }

  // ============================================================
  // WELCOME OFFER A/B TEST
  // Each visitor is randomly assigned one offer (persisted), so we can measure
  // which offer actually wins the most emails. Exposure + conversion are logged
  // to the events table (type 'ab'). You stop guessing whether 15% is the best.
  // ============================================================
  var OFFERS = {
    pct15:  { line1: 'VOUCHER', accent: '15% OFF', sub: 'On your first stay - plus early access to new apartments and Thao Dien city guides.', code: 'WELCOME15', promo: '15% off first stay' },
    pickup: { line1: 'FREE', accent: 'Airport Pickup', sub: 'On your first stay we collect you from Tan Son Nhat, plus our Thao Dien city guides.', code: 'WELCOMERIDE', promo: 'Free airport pickup' },
    pack:   { line1: 'FREE', accent: 'Welcome Pack', sub: 'Local snacks, a SIM card and coffee waiting in your apartment on arrival.', code: 'WELCOMEPACK', promo: 'Free welcome pack' }
  };
  var _offerVariant = null;
  function getOfferVariant() {
    var keys = Object.keys(OFFERS);
    var v = null;
    try { v = localStorage.getItem('ipartment_offer_variant'); } catch (e) {}
    if (!v || !OFFERS[v]) { v = keys[Math.floor(Math.random() * keys.length)]; try { localStorage.setItem('ipartment_offer_variant', v); } catch (e) {} }
    return v;
  }

  function buildPopupMarkup() {
    if (document.getElementById('cta-overlay')) return;
    // Always the 15% member voucher, to match the "Welcome 15" voucher in the
    // booking wallet (the A/B variants are retired for the showcase).
    _offerVariant = 'pct15';
    const offer = OFFERS[_offerVariant] || OFFERS.pct15;
    const html = `
      <div class="cta-overlay" id="cta-overlay" role="dialog" aria-modal="true" aria-label="Welcome offer">
        <div class="cta-popup">
          <button class="cta-close" id="cta-close" aria-label="Close">&times;</button>
          <div class="cta-visual">
            <div class="cta-visual-content">
              <span class="cta-visual-eyebrow">Welcome offer · Thao Dien</span>
              <h2>Your second home<br/>in Saigon.</h2>
              <p>Hotel-comfort serviced apartments designed for people who actually live here.</p>
            </div>
          </div>
          <div class="cta-form" id="cta-form-side">
            <div class="cta-form-eyebrow">Sign up now &amp; get</div>
            <h3>${offer.line1}<br/><span class="accent">${offer.accent}</span></h3>
            <p class="sub">${offer.sub}</p>
            <p style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--terracotta);margin:-16px 0 24px;">For first-time guests only</p>
            <form id="cta-form">
              <div class="field">
                <input type="text" id="cta-firstname" placeholder="First name (optional)" />
              </div>
              <div class="field">
                <input type="email" id="cta-email" placeholder="Enter your email address" required />
              </div>
              <div class="row">
                <select class="country-code" id="cta-cc">
                  <option value="+84">🇻🇳 +84</option>
                  <option value="+1">🇺🇸 +1</option>
                  <option value="+44">🇬🇧 +44</option>
                  <option value="+49">🇩🇪 +49</option>
                  <option value="+33">🇫🇷 +33</option>
                  <option value="+65">🇸🇬 +65</option>
                  <option value="+81">🇯🇵 +81</option>
                  <option value="+82">🇰🇷 +82</option>
                  <option value="+61">🇦🇺 +61</option>
                </select>
                <input type="tel" id="cta-phone" placeholder="Phone number (optional)" />
              </div>
              <button type="submit" class="submit">Get my voucher</button>
              <p style="margin-top:12px;font-size:12px;color:#4ade80;font-weight:600;line-height:1.5;">&#10003; No spam, just your code and the occasional Thao Dien guide. No account needed.</p>
              <p class="disclaimer">By signing up you agree to receive emails from ipartment Vietnam. Unsubscribe anytime. <a href="legal.html#privacy" style="color:#555;">Privacy policy</a>.</p>
            </form>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function showWelcomePopup() {
    try { if (sessionStorage.getItem('ipartment_welcome_shown') === '1') return; } catch (e) {}
    // Never stack on top of another popup (exit survey or auth modal).
    if (document.getElementById('exit-survey') || document.querySelector('.auth-overlay.open')) return;
    buildPopupMarkup();
    const overlay = document.getElementById('cta-overlay');
    if (!overlay) return;
    try { sessionStorage.setItem('ipartment_welcome_shown', '1'); } catch (e) {}
    // Reveal next frame for the fade; the timeout is a fallback in case rAF is
    // throttled (e.g. the tab is not currently visible). classList.add is idempotent.
    requestAnimationFrame(() => overlay.classList.add('open'));
    setTimeout(() => overlay.classList.add('open'), 60);
    document.body.setAttribute('data-popup-open', '');
    if (window.ipartmentTrack) window.ipartmentTrack('ab', 'exposure', { variant: _offerVariant });

    document.getElementById('cta-close').addEventListener('click', closeWelcomePopup);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeWelcomePopup(); });
    document.addEventListener('keydown', escClose);
    document.getElementById('cta-form').addEventListener('submit', handlePopupSubmit);
  }

  function escClose(e) {
    if (e.key === 'Escape') closeWelcomePopup();
  }

  function closeWelcomePopup() {
    const overlay = document.getElementById('cta-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.removeAttribute('data-popup-open');
    document.removeEventListener('keydown', escClose);
    setTimeout(() => overlay.remove(), 400);
    // Previously this chained straight into the exit survey on dismiss, which
    // felt like being ambushed right after closing a popup. The survey is now
    // reserved for genuine exit intent (see initExitIntent), so we do not fire
    // it here anymore.
  }

  function handlePopupSubmit(e) {
    e.preventDefault();
    const firstName = document.getElementById('cta-firstname').value.trim();
    const email = document.getElementById('cta-email').value.trim();
    const cc = document.getElementById('cta-cc').value;
    const phone = document.getElementById('cta-phone').value.trim();
    if (!email) return;
    window.__ctaConverted = true;
    const offer = OFFERS[_offerVariant] || OFFERS.pct15;

    CRM.add('leads', {
      type: 'welcome_popup_voucher',
      name: firstName,
      email,
      phone: phone ? `${cc} ${phone}` : '',
      voucher: offer.code,
      promoValue: offer.promo,
      offerVariant: _offerVariant
    });
    // Record which offer variant won this email
    if (window.ipartmentTrack) window.ipartmentTrack('ab', 'conversion', { variant: _offerVariant });

    const formSide = document.getElementById('cta-form-side');
    formSide.innerHTML = `
      <div class="cta-success show">
        <div class="check">&#10003;</div>
        <h3>Your offer is on the way</h3>
        <p>Check <strong>${escapeHtml(email)}</strong> for your <strong>${escapeHtml(offer.code)}</strong> code (${escapeHtml(offer.promo)}), valid on your first stay. We saved your details to follow up.</p>
        <button type="button" class="submit" style="margin-top:24px;max-width:240px;" onclick="document.getElementById('cta-close').click()">Start exploring</button>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ============================================================
  // EXIT-INTENT MICRO-SURVEY - one kind question on the way out.
  // Positively framed ("what is holding you back" beats "why didn't you buy").
  // Shows once per session as a subtle bottom card. Logs to the events table.
  // ============================================================
  function exitSurveyShown() { try { return sessionStorage.getItem('ipartment_exit_survey') === '1'; } catch (e) { return false; } }

  window.ipartmentExitSurvey = function(context) {
    // Show at most ONCE per session, and never stack on another popup. This is
    // the main "make it less sensitive" guard: once it has appeared, it will
    // not come back no matter how the visitor moves the mouse or navigates.
    if (exitSurveyShown()) return;
    if (document.getElementById('exit-survey')) return;                                                       // one is already showing
    if (document.querySelector('.cta-overlay.open') || document.querySelector('.auth-overlay.open')) return;  // another popup is up
    try { sessionStorage.setItem('ipartment_exit_survey', '1'); } catch (e) {}
    const html = `
      <div class="exit-survey" id="exit-survey" role="dialog" aria-label="Quick question">
        <button class="exit-survey-close" id="exit-survey-close" aria-label="Close">&times;</button>
        <div class="exit-survey-body" id="exit-survey-body">
          <div class="exit-survey-q">Before you go, what is holding you back today?</div>
          <div class="exit-survey-opts">
            <button type="button" data-r="price">The price</button>
            <button type="button" data-r="dates">Dates did not work</button>
            <button type="button" data-r="more_info">I need more info</button>
            <button type="button" data-r="browsing">Just browsing</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const card = document.getElementById('exit-survey');
    requestAnimationFrame(() => card.classList.add('open'));
    setTimeout(() => card.classList.add('open'), 60);
    document.getElementById('exit-survey-close').addEventListener('click', closeExitSurvey);
    card.querySelectorAll('.exit-survey-opts button').forEach(b => {
      b.addEventListener('click', () => recordExitReason(b.dataset.r, context));
    });
  };

  function recordExitReason(reason, context) {
    if (window.ipartmentTrack) window.ipartmentTrack('exit_survey', reason, { meta: { context: context || '' } });
    const body = document.getElementById('exit-survey-body');
    if (!body) return;
    body.innerHTML = `
      <div class="exit-survey-q">Thanks. What offer would have made you book?</div>
      <input type="text" id="exit-survey-offer" placeholder="e.g. free airport pickup, 20% off..." />
      <div class="exit-survey-opts">
        <button type="button" class="primary" id="exit-survey-send">Send</button>
        <button type="button" id="exit-survey-skip">No thanks</button>
      </div>`;
    document.getElementById('exit-survey-send').addEventListener('click', () => {
      const v = (document.getElementById('exit-survey-offer').value || '').trim();
      if (v && window.ipartmentTrack) window.ipartmentTrack('exit_survey', 'offer_wish', { meta: { reason: reason, offer: v } });
      thankExit();
    });
    document.getElementById('exit-survey-skip').addEventListener('click', thankExit);
  }

  function thankExit() {
    const body = document.getElementById('exit-survey-body');
    if (body) body.innerHTML = '<div class="exit-survey-q">Thank you. That genuinely helps us.</div>';
    setTimeout(closeExitSurvey, 1400);
  }

  function closeExitSurvey() {
    const card = document.getElementById('exit-survey');
    if (!card) return;
    card.classList.remove('open');
    setTimeout(() => card.remove(), 300);
  }

  // Global exit-intent: whenever the cursor leaves the top of the viewport, ask
  // the one kind question. Showcase mode lets it re-trigger each time; the guard
  // inside ipartmentExitSurvey prevents stacking. Skipped on admin and once a
  // booking is done.
  function initExitIntent() {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('admin')) return;
    // Desktop only: "cursor leaves the top of the window" is not a real gesture
    // on touch, where it would misfire constantly.
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;

    // Deliberately not sensitive. The survey only arms after the visitor has
    // spent real time on the page AND scrolled at least once, so it cannot fire
    // the moment someone lands and flicks the mouse toward the tabs or address
    // bar. With the once-per-session guard inside ipartmentExitSurvey, normal
    // navigating no longer triggers it.
    let armed = false, engaged = false;
    window.addEventListener('scroll', function () { engaged = true; }, { passive: true, once: true });
    setTimeout(function () { armed = true; }, 30000); // at least 30s on the page

    document.addEventListener('mouseout', function (e) {
      if (!armed || !engaged) return;
      if (e.clientY > 0 || e.relatedTarget) return;     // only a genuine exit over the TOP edge
      if (window.__bookingDone || !window.ipartmentExitSurvey) return;
      window.ipartmentExitSurvey('page_exit');
    });
  }

  // ============================================================
  // SCROLL REVEAL - IntersectionObserver
  // ============================================================
  function initScrollReveal() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-zoom').forEach(el => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-zoom').forEach(el => io.observe(el));
  }

  // ============================================================
  // COUNT-UP NUMBERS (used on hero stats / about page)
  // ============================================================
  function initCountUp() {
    const els = document.querySelectorAll('[data-count]');
    if (!els.length) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    els.forEach(el => io.observe(el));
  }

  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const decimals = (el.dataset.count.split('.')[1] || '').length;
    const suffix = el.dataset.suffix || '';
    const duration = parseInt(el.dataset.duration || '1500', 10);
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = target * eased;
      el.textContent = val.toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = target.toFixed(decimals) + suffix;
    }
    requestAnimationFrame(step);
  }

  // ============================================================
  // MOBILE NAV TOGGLE
  // ============================================================
  function initMobileNav() {
    const toggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('nav.site-nav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
  }

  // ============================================================
  // BACK TO TOP
  // ============================================================
  function initBackToTop() {
    const btn = document.querySelector('.back-to-top');
    if (!btn) return;
    window.addEventListener('scroll', () => {
      btn.classList.toggle('show', window.scrollY > 600);
    }, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // ============================================================
  // TOAST helper (used by other scripts)
  // ============================================================
  window.ipartmentToast = function(message, duration = 3200) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = message;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => t.classList.remove('show'), duration);
  };

  // ============================================================
  // PASSWORD VISIBILITY TOGGLE - adds a sneak-peek eye to every password box
  // ============================================================
  var EYE_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  window.ipartmentAddPasswordEyes = function (root) {
    (root || document).querySelectorAll('input[type="password"]').forEach(function (inp) {
      if (inp.dataset.pwEye) return;
      inp.dataset.pwEye = '1';
      var wrap = document.createElement('span');
      wrap.className = 'pw-wrap';
      inp.parentNode.insertBefore(wrap, inp);
      wrap.appendChild(inp);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pw-eye';
      btn.setAttribute('aria-label', 'Show password');
      btn.innerHTML = EYE_OPEN;
      wrap.appendChild(btn);
      btn.addEventListener('click', function () {
        var reveal = inp.type === 'password';
        inp.type = reveal ? 'text' : 'password';
        btn.innerHTML = reveal ? EYE_OFF : EYE_OPEN;
        btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
      });
    });
  };

  // ============================================================
  // "RATE OUR WEBSITE" feedback panel (footer) - warm, glass, stored in Supabase
  // ============================================================
  window.ipartmentOpenFeedback = function () {
    if (document.getElementById('fb-overlay')) return;
    var html = ''
      + '<div class="fb-overlay" id="fb-overlay" role="dialog" aria-modal="true" aria-label="Rate my website">'
      + '  <div class="fb-panel">'
      + '    <button class="fb-close" id="fb-close" aria-label="Close">&times;</button>'
      + '    <div class="fb-glow"></div>'
      + '    <div class="fb-body" id="fb-body">'
      + '      <div class="fb-emoji">&#128150;</div>'
      + '      <h2>Rate my <em>website</em></h2>'
      + '      <p class="fb-intro">This website was built by me, <strong>dev Penguin</strong>, at Penguin &amp; Mun Business Digital Presence. If you have an idea on how I can make it better, please let me know down below &#128150;&#128150;</p>'
      + '      <form id="fb-form" autocomplete="off">'
      + '        <label class="fb-label">How would you rate it?</label>'
      + '        <div class="fb-stars" id="fb-stars" data-val="0" role="radiogroup" aria-label="Star rating">'
      + '          <button type="button" class="fb-star" data-v="1" aria-label="1 star">&#9733;</button>'
      + '          <button type="button" class="fb-star" data-v="2" aria-label="2 stars">&#9733;</button>'
      + '          <button type="button" class="fb-star" data-v="3" aria-label="3 stars">&#9733;</button>'
      + '          <button type="button" class="fb-star" data-v="4" aria-label="4 stars">&#9733;</button>'
      + '          <button type="button" class="fb-star" data-v="5" aria-label="5 stars">&#9733;</button>'
      + '        </div>'
      + '        <label class="fb-label" for="fb-comment">Your thoughts</label>'
      + '        <textarea class="fb-input" id="fb-comment" rows="4" placeholder="Every comment is much appreciated, feel free to tell me"></textarea>'
      + '        <label class="fb-label" for="fb-email">Like what I build?</label>'
      + '        <input class="fb-input" id="fb-email" type="email" placeholder="Leave your email and I will reach out &#128149;" />'
      + '        <p class="fb-thanks">Thank you for taking the time, it genuinely means the world to me &#128039;&#128150;</p>'
      + '        <div class="fb-msg" id="fb-msg"></div>'
      + '        <button type="submit" class="fb-send">Send &#128172;</button>'
      + '      </form>'
      + '    </div>'
      + '  </div>'
      + '</div>';
    document.body.insertAdjacentHTML('beforeend', html);
    var overlay = document.getElementById('fb-overlay');
    requestAnimationFrame(function () { overlay.classList.add('open'); });
    setTimeout(function () { overlay.classList.add('open'); }, 60);
    var close = function () { overlay.classList.remove('open'); document.removeEventListener('keydown', esc); setTimeout(function () { overlay.remove(); }, 300); };
    function esc(e) { if (e.key === 'Escape') close(); }
    document.getElementById('fb-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', esc);
    setTimeout(function () { var t = document.getElementById('fb-comment'); if (t) t.focus(); }, 360);
    var fbStars = document.getElementById('fb-stars');
    function fbPaint(n) { fbStars.querySelectorAll('.fb-star').forEach(function (s, i) { s.classList.toggle('on', i < n); }); }
    fbStars.addEventListener('click', function (e) { var b = e.target.closest('.fb-star'); if (!b) return; fbStars.dataset.val = b.dataset.v; fbPaint(+b.dataset.v); });
    fbStars.addEventListener('mouseover', function (e) { var b = e.target.closest('.fb-star'); if (b) fbPaint(+b.dataset.v); });
    fbStars.addEventListener('mouseleave', function () { fbPaint(parseInt(fbStars.dataset.val, 10) || 0); });
    document.getElementById('fb-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var comment = (document.getElementById('fb-comment').value || '').trim();
      var email = (document.getElementById('fb-email').value || '').trim();
      var rating = parseInt(fbStars.dataset.val, 10) || null;
      var msg = document.getElementById('fb-msg');
      if (!comment && !email && !rating) { msg.textContent = 'Tap a star or type a little something first.'; msg.className = 'fb-msg show'; return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'That email looks a little off, mind checking it?'; msg.className = 'fb-msg show'; return; }
      msg.textContent = ''; msg.className = 'fb-msg';
      var btn = e.target.querySelector('.fb-send');
      btn.disabled = true; btn.textContent = 'Sending...';
      var payload = { rating: rating, comment: comment || null, email: email || null, source_page: (location.pathname.split('/').pop() || 'index.html') };
      var done = function () {
        var body = document.getElementById('fb-body');
        if (!body) return;
        body.innerHTML = '<div class="fb-success"><div class="fb-emoji">&#127881;</div><h2>Sent with <em>love</em></h2><p>Thank you so much. Every note helps me build something better. &#128150;</p><button type="button" class="fb-send" id="fb-done">You are welcome</button></div>';
        var d = document.getElementById('fb-done'); if (d) d.addEventListener('click', close);
      };
      if (window.sb) { window.sb.from('site_feedback').insert(payload).then(done, done); }
      else { done(); }
    });
  };

  // ============================================================
  // INTERACTIVE MAP (Leaflet) - lazy attach
  // Address: fake pin at Xuan Thuy St, Thao Dien, District 2
  // ============================================================
  window.ipartmentInitMap = function(targetId, opts = {}) {
    const el = document.getElementById(targetId);
    if (!el || typeof L === 'undefined') return null;
    // Real-ish Thao Dien coordinates
    const center = opts.center || [10.8027, 106.7361];
    const defaultZoom = opts.zoom || 16;
    const map = L.map(targetId, {
      center,
      zoom: defaultZoom,
      scrollWheelZoom: opts.scrollWheelZoom !== false,
      zoomControl: opts.zoomControl !== false,
      attributionControl: true,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      inertia: true,
      inertiaDeceleration: 2400,
      easeLinearity: 0.18
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: '',
      html: '<div class="ipart-pin-pulse"></div><div class="ipart-pin"></div>',
      iconSize: [38, 42],
      iconAnchor: [19, 38],
      popupAnchor: [0, -36]
    });

    const marker = L.marker(center, { icon: pinIcon }).addTo(map);
    marker.bindPopup(`
      <strong>ipartment Vietnam</strong><br/>
      Xuan Thuy St, Thao Dien<br/>
      District 2, Ho Chi Minh City
    `);
    if (opts.openPopup) marker.openPopup();

    // Recenter button - smoothly flies back to the pin
    if (opts.recenterButton !== false) {
      const RecenterCtrl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function() {
          const btn = L.DomUtil.create('button', 'leaflet-bar map-recenter-btn');
          btn.type = 'button';
          btn.title = 'Recenter on ipartment';
          btn.setAttribute('aria-label', 'Recenter on ipartment');
          btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
          L.DomEvent.disableClickPropagation(btn);
          L.DomEvent.on(btn, 'click', () => {
            map.flyTo(center, defaultZoom, { animate: true, duration: 1.1, easeLinearity: 0.2 });
            setTimeout(() => marker.openPopup(), 1150);
          });
          return btn;
        }
      });
      new RecenterCtrl().addTo(map);
    }
    return map;
  };

  // ============================================================
  // AUTH MODAL - tabbed signup/login window (backed by Supabase)
  // Session state lives in Supabase via supabase-client.js; this just
  // renders the modal UI and delegates to window.ipartmentAuth.
  // ============================================================
  window.ipartmentOpenAuth = function(initialTab) {
    if (document.querySelector('.auth-overlay')) return;
    const tab = initialTab === 'login' ? 'login' : 'signup';
    const html = `
      <div class="auth-overlay" id="auth-overlay" role="dialog" aria-modal="true">
        <div class="auth-modal">
          <button class="auth-close" id="auth-close" aria-label="Close">&times;</button>
          <div class="auth-tabs">
            <button class="auth-tab" data-auth-tab="signup">Sign Up</button>
            <button class="auth-tab" data-auth-tab="login">Log In</button>
          </div>
          <div class="auth-body">
            <div class="auth-pane" id="auth-pane-signup">
              <h2>Create your account.</h2>
              <p class="auth-sub">Book faster, manage stays, save favourites.</p>
              <form id="auth-signup-form" autocomplete="off">
                <div class="form-row">
                  <div class="form-group"><label class="form-label">First Name</label><input class="form-input" type="text" id="auth-su-first" required /></div>
                  <div class="form-group"><label class="form-label">Last Name</label><input class="form-input" type="text" id="auth-su-last" required /></div>
                </div>
                <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="auth-su-email" required /></div>
                <div class="form-group"><label class="form-label">Phone (optional)</label><input class="form-input" type="tel" id="auth-su-phone" /></div>
                <div class="form-group"><label class="form-label">Password</label><input class="form-input" type="password" id="auth-su-pass" placeholder="Min. 8 characters" required /></div>
                <div class="form-group"><label class="form-label">Confirm Password</label><input class="form-input" type="password" id="auth-su-pass2" placeholder="Type it again" required />
                  <div class="auth-remember-note" id="auth-remember-note">Burn this one into memory. There is no easy reset here, forget it and you will have to pass a quiz to earn your way back in. (Trust me, it is a whole thing.)</div>
                </div>
                <label class="auth-terms"><input type="checkbox" id="auth-su-terms" required /> I agree to the <a href="legal.html#terms" target="_blank">Terms</a> and <a href="legal.html#privacy" target="_blank">Privacy Policy</a></label>
                <div class="auth-msg" id="auth-su-msg" style="display:none;"></div>
                <button type="submit" class="auth-submit">Create Account</button>
              </form>
            </div>
            <div class="auth-pane" id="auth-pane-login">
              <h2>Welcome back.</h2>
              <p class="auth-sub">Log in to manage your bookings.</p>
              <form id="auth-login-form" autocomplete="off">
                <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="auth-li-email" required /></div>
                <div class="form-group"><label class="form-label">Password</label><input class="form-input" type="password" id="auth-li-pass" required /></div>
                <div class="auth-msg" id="auth-li-msg" style="display:none;"></div>
                <button type="submit" class="auth-submit">Log In</button>
              </form>
              <button type="button" class="auth-forgot" id="auth-forgot-link">Forgot your password?</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('auth-overlay');
    requestAnimationFrame(() => overlay.classList.add('open'));
    showAuthTab(tab);
    document.getElementById('auth-close').addEventListener('click', closeAuth);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeAuth(); });
    document.addEventListener('keydown', authEsc);
    overlay.querySelectorAll('[data-auth-tab]').forEach(b => b.addEventListener('click', () => showAuthTab(b.dataset.authTab)));
    document.getElementById('auth-signup-form').addEventListener('submit', handleSignup);
    document.getElementById('auth-login-form').addEventListener('submit', handleLogin);
    const forgotLink = document.getElementById('auth-forgot-link');
    if (forgotLink) forgotLink.addEventListener('click', function () {
      const li = document.getElementById('auth-li-email');
      const pre = li ? li.value : '';
      closeAuth();
      if (window.ipartmentOpenPasswordQuiz) window.ipartmentOpenPasswordQuiz(pre);
    });
    // Funny "remember it" notice the moment they reach the confirm-password box.
    const pass2 = document.getElementById('auth-su-pass2');
    const note = document.getElementById('auth-remember-note');
    if (pass2 && note) {
      const reveal = function () { note.classList.add('show'); };
      pass2.addEventListener('focus', reveal);
      pass2.addEventListener('input', reveal);
    }
    window.ipartmentAddPasswordEyes(overlay);
  };

  // ============================================================
  // FORGOT PASSWORD = THE QUIZ (a playful, class-showcase reset; no email).
  // Records the answers and sets a new password via the quiz_password_reset RPC.
  // The quiz is the only gate, so this is intentionally not real security.
  // ============================================================
  function quizScaleHtml(id, lowLabel, highLabel) {
    var btns = '';
    for (var i = 1; i <= 10; i++) btns += '<button type="button" data-v="' + i + '">' + i + '</button>';
    return '<div class="quiz-scale" id="' + id + '" data-val="">' + btns + '</div>'
      + '<div class="quiz-ends"><span>1 - ' + lowLabel + '</span><span>10 - ' + highLabel + '</span></div>';
  }

  window.ipartmentOpenPasswordQuiz = function (prefillEmail) {
    if (document.getElementById('quiz-overlay')) return;
    const html = `
      <div class="auth-overlay" id="quiz-overlay" role="dialog" aria-modal="true">
        <div class="auth-modal quiz-modal">
          <button class="auth-close" id="quiz-close" aria-label="Close">&times;</button>
          <div class="auth-body">
            <h2>Forgot your password?</h2>
            <p class="auth-sub">No email, no hassle. Pass the quiz, set a new password, you are back in.</p>
            <div class="quiz-note">Confession: I had a full email-based password reset built, automation and all. For a showcase this small, a quiz is just funnier. (It is taste, not a bug.)</div>
            <form id="quiz-form" autocomplete="off">
              <div class="form-group"><label class="form-label">Your account email *</label><input class="form-input" type="email" id="quiz-email" required /></div>
              <div class="form-group"><label class="form-label">Your name *</label><input class="form-input" type="text" id="quiz-name" required /></div>
              <div class="quiz-q"><label class="form-label">How much do you like my website? *</label>${quizScaleHtml('quiz-likes', 'not at all', 'Đủ wow rồi đó')}</div>
              <div class="quiz-q"><label class="form-label">How handsome is the dev of this website? *</label>${quizScaleHtml('quiz-dev', 'Hơi hơi', 'Heavenly')}</div>
              <div class="form-group"><label class="form-label">Is there any way I can improve this website?</label><textarea class="form-input" id="quiz-improve" rows="2" placeholder="Optional, but I am genuinely listening"></textarea></div>
              <div class="form-group"><label class="form-label">Set a new password *</label><input class="form-input" type="password" id="quiz-newpass" placeholder="Min. 8 characters" required /></div>
              <div class="form-group"><label class="form-label">Confirm new password *</label><input class="form-input" type="password" id="quiz-newpass2" placeholder="Type it again" required /></div>
              <div class="auth-msg" id="quiz-msg" style="display:none;"></div>
              <button type="submit" class="auth-submit">Reset my password</button>
              <button type="button" class="auth-forgot" id="quiz-back-login">Back to login</button>
            </form>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const overlay = document.getElementById('quiz-overlay');
    requestAnimationFrame(() => overlay.classList.add('open'));
    setTimeout(() => overlay.classList.add('open'), 60);
    if (prefillEmail) document.getElementById('quiz-email').value = prefillEmail;
    const close = function () { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 300); };
    document.getElementById('quiz-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    const backLogin = document.getElementById('quiz-back-login');
    if (backLogin) backLogin.addEventListener('click', function () { close(); if (window.ipartmentOpenAuth) window.ipartmentOpenAuth('login'); });
    overlay.querySelectorAll('.quiz-scale').forEach(function (scale) {
      scale.addEventListener('click', function (e) {
        const b = e.target.closest('button[data-v]'); if (!b) return;
        scale.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        scale.dataset.val = b.dataset.v;
      });
    });
    document.getElementById('quiz-form').addEventListener('submit', handleQuizSubmit);
    window.ipartmentAddPasswordEyes(overlay);
  };

  async function handleQuizSubmit(e) {
    e.preventDefault();
    const email = (document.getElementById('quiz-email').value || '').trim();
    const name = (document.getElementById('quiz-name').value || '').trim();
    const likes = document.getElementById('quiz-likes').dataset.val;
    const dev = document.getElementById('quiz-dev').dataset.val;
    const improve = (document.getElementById('quiz-improve').value || '').trim();
    const newpass = document.getElementById('quiz-newpass').value;
    const show = (t, kind) => {
      const m = document.getElementById('quiz-msg');
      if (!m) return;
      m.textContent = t || ''; m.style.display = t ? 'block' : 'none';
      m.style.color = kind === 'error' ? '#f87171' : '#4ade80';
      m.style.fontSize = '13px'; m.style.margin = '4px 0 0';
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { show('Enter a valid email.', 'error'); return; }
    if (!name) { show('Your name is required.', 'error'); return; }
    if (!likes) { show('Please answer how much you like the website.', 'error'); return; }
    if (!dev) { show('Please rate the dev. Be honest (or kind).', 'error'); return; }
    if (newpass.length < 8) { show('Your new password needs at least 8 characters.', 'error'); return; }
    var newpass2El = document.getElementById('quiz-newpass2');
    if (newpass2El && newpass !== newpass2El.value) { show('Those passwords do not match. Type them the same way.', 'error'); return; }
    if (!window.sb) { show('Service not loaded. Refresh and try again.', 'error'); return; }
    const btn = e.target.querySelector('.auth-submit');
    const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Grading your quiz...';
    try {
      const res = await window.sb.rpc('quiz_password_reset', {
        p_email: email, p_name: name, p_likes: parseInt(likes, 10), p_dev: parseInt(dev, 10), p_improve: improve, p_new_password: newpass
      });
      if (res.error) throw res.error;
      if (res.data && res.data.updated) {
        const body = document.querySelector('#quiz-overlay .auth-body');
        if (body) body.innerHTML = '<div class="auth-success"><div class="check">&#10003;</div><h2>You passed.</h2><p>Your password is updated. Log in with your new one.</p><button type="button" class="auth-submit" style="margin-top:18px;max-width:220px;" id="quiz-to-login">Back to login</button></div>';
        const toLogin = document.getElementById('quiz-to-login');
        if (toLogin) toLogin.addEventListener('click', function () { const o = document.getElementById('quiz-overlay'); if (o) o.remove(); if (window.ipartmentOpenAuth) window.ipartmentOpenAuth('login'); });
      } else {
        btn.disabled = false; btn.textContent = orig;
        show('We could not find an account with that email. Double-check it.', 'error');
      }
    } catch (err) {
      btn.disabled = false; btn.textContent = orig;
      show((err && err.message) || 'Something went wrong. Please try again.', 'error');
    }
  }

  function showAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.authTab === tab));
    document.querySelectorAll('.auth-pane').forEach(p => p.classList.toggle('active', p.id === 'auth-pane-' + tab));
  }

  function authEsc(e) { if (e.key === 'Escape') closeAuth(); }
  function closeAuth() {
    const overlay = document.getElementById('auth-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.removeEventListener('keydown', authEsc);
    setTimeout(() => overlay.remove(), 320);
  }

  function authMsg(id, text, kind) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
    el.style.color = kind === 'error' ? '#f87171' : '#4ade80';
    el.style.fontSize = '13px';
    el.style.margin = '4px 0 0';
  }

  function friendlyAuthError(err) {
    const m = (err && err.message) || 'Something went wrong. Please try again.';
    if (/already registered|already exists|user already/i.test(m)) return 'That email already has an account. Try logging in instead.';
    if (/invalid login credentials/i.test(m)) return 'Incorrect email or password.';
    if (/password should be at least|at least 6/i.test(m)) return 'Password is too short. Use at least 6 characters.';
    if (/email.*confirm/i.test(m)) return m;
    return m;
  }

  async function handleSignup(e) {
    e.preventDefault();
    const first = document.getElementById('auth-su-first').value.trim();
    const last = document.getElementById('auth-su-last').value.trim();
    const email = document.getElementById('auth-su-email').value.trim();
    const phone = document.getElementById('auth-su-phone').value.trim();
    const pass = document.getElementById('auth-su-pass').value;
    const pass2El = document.getElementById('auth-su-pass2');
    const pass2 = pass2El ? pass2El.value : pass;
    if (!first || !email || !pass) return;
    if (pass.length < 8) { authMsg('auth-su-msg', 'Password needs at least 8 characters.', 'error'); return; }
    if (pass !== pass2) { authMsg('auth-su-msg', 'Those passwords do not match. Try again.', 'error'); return; }
    if (!window.ipartmentAuth) { authMsg('auth-su-msg', 'Auth service not loaded. Refresh and try again.', 'error'); return; }
    const btn = e.target.querySelector('.auth-submit');
    const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Creating account...';
    authMsg('auth-su-msg', '');
    try {
      await window.ipartmentAuth.signUp({ firstName: first, lastName: last, email, phone, password: pass });
      // Mirror the signup as a CRM lead so it still flows to Airtable / Make
      try { CRM.add('users', { first, last, email, phone, type: 'Account signup' }); } catch (_) {}
      showAuthSuccess(`Welcome, ${first}.`, 'Your account is ready. Redirecting to your dashboard...');
      setTimeout(() => { window.location.href = 'my-account.html'; }, 1200);
    } catch (err) {
      btn.disabled = false; btn.textContent = orig;
      authMsg('auth-su-msg', friendlyAuthError(err), 'error');
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('auth-li-email').value.trim();
    const pass = document.getElementById('auth-li-pass').value;
    if (!email || !pass) return;
    if (!window.ipartmentAuth) { authMsg('auth-li-msg', 'Auth service not loaded. Refresh and try again.', 'error'); return; }
    const btn = e.target.querySelector('.auth-submit');
    const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Logging in...';
    authMsg('auth-li-msg', '');
    try {
      await window.ipartmentAuth.signIn({ email, password: pass });
      showAuthSuccess('Welcome back.', 'Redirecting to your dashboard...');
      setTimeout(() => { window.location.href = 'my-account.html'; }, 1000);
    } catch (err) {
      btn.disabled = false; btn.textContent = orig;
      authMsg('auth-li-msg', friendlyAuthError(err), 'error');
    }
  }

  function showAuthSuccess(title, msg) {
    const body = document.querySelector('.auth-body');
    const tabs = document.querySelector('.auth-tabs');
    if (tabs) tabs.style.display = 'none';
    body.innerHTML = `<div class="auth-success"><div class="check">&#10003;</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(msg)}</p></div>`;
  }

  // ============================================================
  // STICKY MOBILE BOOKING BAR (browse mode)
  // The #stickyBookBar in "browse" mode is a persistent Check-Availability CTA
  // that reveals after the hero scrolls past. The "booking" mode variant on
  // booking.html is driven by booking.js (it mirrors the live total + step).
  // ============================================================
  function initStickyBar() {
    var bar = document.getElementById('stickyBookBar');
    if (!bar) return;
    if (bar.getAttribute('data-sticky-mode') === 'booking') return; // booking.js owns that one
    var revealAfter = 400; // px scrolled past the hero
    function onScroll() {
      if (window.scrollY > revealAfter) {
        bar.classList.add('is-visible');
        bar.setAttribute('aria-hidden', 'false');
        document.body.classList.add('has-sticky-bar');
      } else {
        bar.classList.remove('is-visible');
        bar.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('has-sticky-bar');
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    var cta = bar.querySelector('.sticky-book-cta');
    if (cta && window.ipartmentTrack) {
      cta.addEventListener('click', function () {
        window.ipartmentTrack('funnel', 'sticky_cta_click', { meta: { path: location.pathname } });
      });
    }
  }

  // ============================================================
  // HONEST SOCIAL PROOF (real data only - never fabricated)
  // Shows "Booked N times this week" ONLY if Supabase returns a real count > 0.
  // Anonymous visitors are blocked from reading bookings by row-level security,
  // so this correctly shows NOTHING until a public aggregate (a count RPC/view)
  // is exposed on purpose. Fake counters are explicitly rejected (and are being
  // fined by regulators in 2026), so "real or nothing" is the rule.
  // ============================================================
  function initSocialProof() {
    var el = document.getElementById('socialProofPill');
    if (!el || !window.sb) return;
    try {
      var since = new Date(Date.now() - 7 * 86400000).toISOString();
      window.sb.from('bookings')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since)
        .then(function (res) {
          var n = res && typeof res.count === 'number' ? res.count : 0;
          if (n > 0) {
            el.textContent = '🔥 Booked ' + n + (n === 1 ? ' time' : ' times') + ' this week';
            el.hidden = false;
          }
        }, function () { /* RLS blocked or offline: show nothing, never invent */ });
    } catch (e) { /* never block UX on social proof */ }
  }

  // ============================================================
  // NAV BEHAVIOR
  // - scroll-to-bottom: when a page's sticky filter (magazine cat-nav, results
  //   summary-strip) sticks to the top, the floating pill drops to the bottom so
  //   it never covers the filter; it returns to the top when scrolled back up.
  // - hide/show: a glassy left chevron on the pill slides it out of the way (left
  //   at the top, down at the bottom); a glassy peek arrow at that corner brings
  //   it back.
  // - educational tag: relocated to the top-right with a close X (it still
  //   returns on reload / navigation, it just can be dismissed for the view).
  // ============================================================
  function initNavBehavior() {
    var header = document.querySelector('.site-header');
    var pill = document.querySelector('.site-header-main');
    if (!header || !pill) return;

    // Educational tag -> own fixed element (moved out of the header so the
    // header's hide/move transforms never drag it along), with a close X.
    var edu = header.querySelector('.site-header-edu');
    if (edu && edu.parentNode === header) {
      document.body.appendChild(edu);
      var ex = document.createElement('button');
      ex.type = 'button'; ex.className = 'edu-close'; ex.setAttribute('aria-label', 'Dismiss notice');
      ex.innerHTML = '&times;';
      ex.addEventListener('click', function () { edu.classList.add('edu-hidden'); });
      edu.appendChild(ex);
    }

    // Hide button (left chevron) at the start of the pill.
    if (!pill.querySelector('.nav-hide')) {
      var hideBtn = document.createElement('button');
      hideBtn.type = 'button'; hideBtn.className = 'nav-hide'; hideBtn.setAttribute('aria-label', 'Hide menu');
      hideBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
      pill.insertBefore(hideBtn, pill.firstChild);
      hideBtn.addEventListener('click', function () { document.body.classList.add('nav-hidden'); });
    }

    // Peek button to bring the nav back when hidden.
    var peek = document.createElement('button');
    peek.type = 'button'; peek.className = 'nav-peek'; peek.setAttribute('aria-label', 'Show menu');
    peek.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
    document.body.appendChild(peek);
    peek.addEventListener('click', function () { document.body.classList.remove('nav-hidden'); });

    // Scroll-to-bottom past a sticky filter (only on pages that have one).
    var filter = document.querySelector('[data-nav-dodge], .cat-nav, .summary-strip');
    if (filter) {
      var onScroll = function () {
        document.body.classList.toggle('nav-bottom', filter.getBoundingClientRect().top <= 1);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      onScroll();
    }
  }

  // ============================================================
  // INIT
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    CRM.track();
    initWelcomePopup();
    initScrollReveal();
    initCountUp();
    initMobileNav();
    initNavBehavior();
    initBackToTop();
    initStickyBar();
    initSocialProof();
    initExitIntent();
    if (window.ipartmentAddPasswordEyes) window.ipartmentAddPasswordEyes(document);
    // "Rate my website" button (with an attention-drawing animated cursor) under the logo in every footer
    document.querySelectorAll('.footer-brand').forEach(function (fb) {
      if (fb.querySelector('.footer-rate-wrap')) return;
      var wrap = document.createElement('div');
      wrap.className = 'footer-rate-wrap';
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'footer-rate-btn';
      b.innerHTML = 'Rate my website &#128150;';
      b.addEventListener('click', function () { if (window.ipartmentOpenFeedback) window.ipartmentOpenFeedback(); });
      wrap.appendChild(b);
      var cur = document.createElement('span');
      cur.className = 'rate-cursor'; cur.setAttribute('aria-hidden', 'true');
      cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" stroke="#0a0a0a" stroke-width="1.2" stroke-linejoin="round"><path d="M5 2.5 L5 19 L9.3 14.6 L12.2 21 L14.8 19.9 L11.9 13.6 L18 13.4 Z"/></svg>';
      wrap.appendChild(cur);
      fb.appendChild(wrap);
    });
    // Account-link gating + logged-in nav state is handled by supabase-client.js
  });

  // Mark current nav link active based on URL
  document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('nav.site-nav a').forEach(a => {
      const href = a.getAttribute('href');
      if (href === path || (path === '' && href === 'index.html')) {
        if (!a.classList.contains('nav-cta')) a.classList.add('active');
      }
    });
  });
})();
