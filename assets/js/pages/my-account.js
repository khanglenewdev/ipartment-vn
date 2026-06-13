/* ============================================================
   My Account dashboard - backed by Supabase.
   Shows the logged-in user's profile, bookings and vouchers.
   Redirects to the login modal if there is no session.
   ============================================================ */
(function () {
  'use strict';

  var Auth = window.ipartmentAuth;
  var sb = window.sb;
  var profile = null;

  function fmtDate(s) {
    if (!s) return '-';
    try {
      return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return s; }
  }
  function fmtVND(n) { return (Number(n) || 0).toLocaleString('vi-VN') + ' VND'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- Tabs ----
  window.showTab = function (name) {
    if (name === 'logout') { window.ipartmentConfirmLogout(window.logout); return; }
    if (name === 'admin') { window.location.href = 'admin.html'; return; }
    document.querySelectorAll('.pane').forEach(function (p) { p.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    var pane = document.getElementById('pane-' + name);
    if (pane) pane.classList.add('active');
    var btn = document.querySelector('.tab-btn[data-tab="' + name + '"]');
    if (btn) btn.classList.add('active');
    if (name === 'bookings') renderBookings();
    if (name === 'assistant') renderAssistant();
    if (name === 'vouchers') renderVouchers();
    if (name === 'settings') fillSettings();
  };

  document.querySelectorAll('.tab-btn').forEach(function (b) {
    b.addEventListener('click', function () { window.showTab(b.dataset.tab); });
  });

  function renderUserState() {
    var nameEl = document.getElementById('sb-name');
    var roleEl = document.getElementById('sb-role');
    if (profile) {
      var fn = (profile.first_name || '').trim();
      nameEl.textContent = fn ? ('Hi, ' + fn) : 'Hi there';
      roleEl.textContent = profile.role === 'admin' ? (profile.email + ' (admin)') : profile.email;
    } else {
      nameEl.textContent = 'Hi, Guest';
      roleEl.textContent = 'Log in to manage your stays.';
    }
    // The Admin tab is the private door to the dashboard: visible only when the
    // logged-in profile carries the admin role (the dashboard itself re-checks
    // the role server-side, so this is convenience, not the security).
    var adminTab = document.getElementById('tab-admin');
    if (adminTab) adminTab.style.display = (profile && profile.role === 'admin') ? '' : 'none';
  }

  window.logout = async function () {
    try { await Auth.signOut(); } catch (e) { /* noop */ }
    window.ipartmentToast('Logged out.');
    setTimeout(function () { window.location.href = 'index.html'; }, 700);
  };

  function fillSettings() {
    if (!profile) return;
    document.getElementById('st-first').value = profile.first_name || '';
    document.getElementById('st-last').value = profile.last_name || '';
    document.getElementById('st-email').value = profile.email || '';
    document.getElementById('st-phone').value = profile.phone || '';
    var stayPref = document.getElementById('st-stay-pref');
    if (stayPref) stayPref.value = profile.stay_preference || '';
    var pref = document.getElementById('st-pref');
    if (pref && profile.preferred_category) {
      Array.prototype.forEach.call(pref.options, function (o) {
        if (o.value === profile.preferred_category || o.text === profile.preferred_category) pref.value = o.value;
      });
    }
  }

  var settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!profile) { window.ipartmentToast('Please log in first.'); return; }
      var update = {
        first_name: document.getElementById('st-first').value.trim(),
        last_name: document.getElementById('st-last').value.trim(),
        phone: document.getElementById('st-phone').value.trim(),
        stay_preference: document.getElementById('st-stay-pref') ? document.getElementById('st-stay-pref').value.trim() : null,
        preferred_category: document.getElementById('st-pref') ? document.getElementById('st-pref').value : null
      };
      var res = await sb.from('profiles').update(update).eq('id', profile.id).select().maybeSingle();
      if (res.error) { window.ipartmentToast('Could not save: ' + res.error.message); return; }
      profile = Object.assign(profile, res.data || update);
      renderUserState();
      window.ipartmentToast('Settings saved.');
    });
  }

  // ---- Bookings ----
  async function renderBookings() {
    var list = document.getElementById('bookings-list');
    if (!list) return;
    if (!profile) {
      list.innerHTML = emptyCard('Log in to see your bookings.', 'Book a Stay', 'booking.html');
      return;
    }
    list.innerHTML = '<p class="list-loading">Loading your bookings...</p>';
    // Explicitly scoped to the signed-in user. RLS already limits normal
    // accounts to their own rows, but an admin can read everything, so without
    // this filter the admin's "My Bookings" showed other guests' stays.
    var res = await sb.from('bookings').select('*').eq('user_id', profile.id).order('created_at', { ascending: false });
    if (res.error) { list.innerHTML = '<p class="list-error">Could not load bookings: ' + esc(res.error.message) + '</p>'; return; }
    var rows = res.data || [];
    if (!rows.length) {
      list.innerHTML = emptyCard('You have not booked a stay yet.', 'Book a Stay', 'booking.html');
      return;
    }
    list.innerHTML = rows.map(function (b) {
      var extras = Array.isArray(b.extras) ? b.extras.map(function (x) { return x && x.name ? x.name : x; }).filter(Boolean) : [];
      var ref = b.booking_ref || b.id.slice(0, 8).toUpperCase();
      return '' +
        '<div class="booking-card">' +
          '<div>' +
            '<div class="ref">Booking ' + esc(ref) + '</div>' +
            '<div class="title">Category ' + esc(b.room || '') + ', ' + esc(b.room_name || '') + '</div>' +
            '<div class="meta">' + fmtDate(b.checkin) + ' to ' + fmtDate(b.checkout) + '. ' +
              (b.nights || 0) + ' night' + ((b.nights || 0) > 1 ? 's' : '') + '. ' +
              (b.guests || 1) + ' guest' + ((b.guests || 1) > 1 ? 's' : '') +
              (extras.length ? '<br/>Add-ons: ' + esc(extras.join(', ')) : '') +
            '</div>' +
            (function () { var st = liveStatus(b); return '<span class="status ' + st[1] + '">' + esc(st[0]) + '</span>'; })() +
          '</div>' +
          '<div class="booking-total-col">' +
            '<div class="total">' + fmtVND(b.total) + '</div>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  // The tag follows the LIFE of the booking, not just the stored field:
  // cancelled stays cancelled; once checkout has passed it is Checked out;
  // between checkin and checkout it is Staying; otherwise the stored status
  // decides between Confirmed and Pending Confirmation. checkin/checkout are
  // YYYY-MM-DD strings, so string comparison is correct date ordering.
  function todayKey() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function liveStatus(b) {
    if (b.status === 'cancelled') return ['Cancelled', 'status-cancelled'];
    var t = todayKey();
    if (b.checkout && b.checkout <= t) return ['Checked out', 'status-done'];
    if (b.checkin && b.checkin <= t && (!b.checkout || t < b.checkout)) return ['Staying', 'status-staying'];
    if (b.status === 'confirmed') return ['Confirmed', 'status-confirmed'];
    return ['Pending Confirmation', 'status-pending'];
  }

  // ---- Stay Assistant ----
  // One place for everything a guest needs DURING a stay: see the stay at a
  // glance, request help in two taps, and reach a human instantly. Requests
  // write to the leads table (type stay_request) so they land in the same
  // admin inbox as every other contact, plus an analytics event.
  var ASSIST_REQUESTS = [
    { id: 'cleaning', ico: '\u{1F9F9}', label: 'Room cleaning' },
    { id: 'towels', ico: '\u{1F9FA}', label: 'Fresh towels and linens' },
    { id: 'toiletries', ico: '\u{1F9F4}', label: 'Toiletries refill' },
    { id: 'maintenance', ico: '\u{1F527}', label: 'Something needs fixing' },
    { id: 'late-checkout', ico: '\u{1F552}', label: 'Late check-out' },
    { id: 'bedding', ico: '\u{1F6CF}️', label: 'Extra bedding or pillows' }
  ];
  function reqHistory() {
    try { return JSON.parse(localStorage.getItem('ipartment_stay_requests') || '[]'); } catch (e) { return []; }
  }
  function pushReqHistory(entry) {
    var h = reqHistory(); h.unshift(entry);
    try { localStorage.setItem('ipartment_stay_requests', JSON.stringify(h.slice(0, 10))); } catch (e) {}
  }

  async function renderAssistant() {
    var body = document.getElementById('assistant-body');
    if (!body) return;
    if (!profile) {
      body.innerHTML = emptyCard('Log in to use the Stay Assistant.', 'Book a Stay', 'booking.html');
      return;
    }
    body.innerHTML = '<p class="list-loading">Checking your stay...</p>';
    var res = await sb.from('bookings').select('*').eq('user_id', profile.id).order('checkin', { ascending: true });
    if (res.error) { body.innerHTML = '<p class="list-error">Could not load your stay: ' + esc(res.error.message) + '</p>'; return; }
    var t = todayKey();
    var rows = (res.data || []).filter(function (b) { return b.status !== 'cancelled'; });
    // the stay that matters NOW: one you are inside of, else the next upcoming
    var stay = rows.find(function (b) { return b.checkin && b.checkin <= t && b.checkout && t < b.checkout; })
            || rows.find(function (b) { return b.checkin && b.checkin > t; })
            || null;
    if (!stay) {
      body.innerHTML = emptyCard('No current or upcoming stay on this account. The assistant wakes up when you have one.', 'Book a Stay', 'booking.html');
      return;
    }
    var st = liveStatus(stay);
    var staying = st[0] === 'Staying';
    var total = stay.nights || Math.max(1, Math.round((new Date(stay.checkout) - new Date(stay.checkin)) / 86400000));
    var night = staying ? Math.min(total, Math.max(1, Math.round((new Date(t) - new Date(stay.checkin)) / 86400000) + 1)) : 0;
    var daysUntil = staying ? 0 : Math.max(0, Math.round((new Date(stay.checkin) - new Date(t)) / 86400000));
    var pct = staying ? Math.round(((night - 1) / Math.max(1, total)) * 100) : 0;

    var chips = ASSIST_REQUESTS.map(function (r) {
      return '<button type="button" class="as-chip" data-id="' + r.id + '" data-label="' + esc(r.label) + '">' +
        '<span class="as-chip-ico">' + r.ico + '</span><span>' + esc(r.label) + '</span><span class="as-chip-tick">&#10003;</span></button>';
    }).join('');

    var hist = reqHistory().filter(function (h) { return h.ref === stay.booking_ref; });
    var histHtml = hist.length
      ? '<div class="as-history"><div class="as-history-title">Recent requests (this device)</div>' +
        hist.slice(0, 4).map(function (h) {
          return '<div class="as-history-row"><span>' + esc(h.items.join(', ') + (h.note ? (h.items.length ? ' + ' : '') + 'note' : '')) + '</span><span class="as-history-time">' + esc(h.time) + '</span></div>';
        }).join('') + '</div>'
      : '';

    body.innerHTML =
      '<div class="as-card as-stay">' +
        '<div class="as-stay-head">' +
          '<div>' +
            '<div class="as-ref">' + esc(stay.booking_ref || '') + '</div>' +
            '<div class="as-room">Category ' + esc(stay.room || '') + ', ' + esc(stay.room_name || '') + '</div>' +
            '<div class="as-dates">' + fmtDate(stay.checkin) + ' to ' + fmtDate(stay.checkout) + ' &middot; ' + total + ' night' + (total > 1 ? 's' : '') + '</div>' +
          '</div>' +
          '<span class="status ' + st[1] + '">' + esc(st[0]) + '</span>' +
        '</div>' +
        '<div class="as-progress"><div class="as-progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="as-progress-lbl">' + (staying
          ? 'Night ' + night + ' of ' + total + '. Enjoying Thao Dien?'
          : (daysUntil === 0 ? 'Check-in is today. See you soon!' : 'Starts in ' + daysUntil + ' day' + (daysUntil > 1 ? 's' : '') + '. We are getting your place ready.')) + '</div>' +
      '</div>' +

      '<div class="as-card">' +
        '<h3 class="as-h">Need a hand? <em>Tap what you need.</em></h3>' +
        '<div class="as-grid">' + chips + '</div>' +
        '<textarea id="as-note" class="as-note" rows="2" placeholder="Anything else? Tell us in a sentence (optional)..."></textarea>' +
        '<button type="button" class="as-send" id="as-send">Send request</button>' +
        '<p class="as-promise">Goes straight to the team. During the day we usually respond within 30 minutes.</p>' +
        histHtml +
      '</div>' +

      '<div class="as-card">' +
        '<h3 class="as-h">Stay <em>essentials.</em></h3>' +
        '<div class="as-ess"><span class="as-ess-k">Wi-Fi</span><span class="as-ess-v">ipartment-home &middot; password <b>thaodien2026</b></span></div>' +
        '<div class="as-ess"><span class="as-ess-k">Check-in</span><span class="as-ess-v">From 14:00, self check-in 24/7 (code in your confirmation email)</span></div>' +
        '<div class="as-ess"><span class="as-ess-k">Check-out</span><span class="as-ess-v">By 11:00, just close the door behind you</span></div>' +
        '<div class="as-ess"><span class="as-ess-k">Address</span><span class="as-ess-v">Xuan Thuy St, Thao Dien, Ho Chi Minh City</span></div>' +
      '</div>' +

      '<div class="as-card">' +
        '<h3 class="as-h">Prefer a <em>human?</em></h3>' +
        '<div class="as-human">' +
          '<a class="as-human-btn" href="tel:+84779488070"><span>&#128222;</span> Call us</a>' +
          '<button type="button" class="as-human-btn" id="as-chat"><span>&#128172;</span> Chat now</button>' +
          '<a class="as-human-btn" href="mailto:khangle.forwork@gmail.com"><span>&#9993;</span> Email</a>' +
        '</div>' +
      '</div>';

    // chip toggling + send
    body.querySelectorAll('.as-chip').forEach(function (c) {
      c.addEventListener('click', function () { c.classList.toggle('selected'); });
    });
    var chatBtn = document.getElementById('as-chat');
    if (chatBtn) chatBtn.addEventListener('click', function () {
      var l = document.querySelector('.ipc-launcher');
      if (l) l.click(); else window.location.href = 'faq.html';
    });
    var sendBtn = document.getElementById('as-send');
    if (sendBtn) sendBtn.addEventListener('click', async function () {
      var items = Array.prototype.map.call(body.querySelectorAll('.as-chip.selected'), function (c) { return c.dataset.label; });
      var note = (document.getElementById('as-note').value || '').trim();
      if (!items.length && !note) { window.ipartmentToast('Tap at least one request, or write us a note.'); return; }
      sendBtn.disabled = true; sendBtn.textContent = 'Sending...';
      var payload = {
        type: 'stay_request',
        name: ((profile.first_name || '') + ' ' + (profile.last_name || '')).trim() || null,
        email: profile.email || null,
        phone: profile.phone || null,
        booking_ref: stay.booking_ref || null,
        source_page: 'my-account',
        meta: { requests: items, note: note || null }
      };
      var ins = await sb.from('leads').insert(payload);
      if (window.ipartmentTrack) window.ipartmentTrack('stay_request', 'submitted', { meta: { ref: stay.booking_ref, requests: items, hasNote: !!note } });
      sendBtn.disabled = false; sendBtn.textContent = 'Send request';
      if (ins.error) { window.ipartmentToast('Could not send right now: ' + ins.error.message); return; }
      pushReqHistory({ ref: stay.booking_ref, items: items, note: note, time: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) });
      body.querySelectorAll('.as-chip.selected').forEach(function (c) { c.classList.remove('selected'); });
      document.getElementById('as-note').value = '';
      window.ipartmentToast('Request sent. We are on it!');
      renderAssistant();   // refresh the history list
    });
  }

  // ---- Vouchers ----
  async function renderVouchers() {
    var list = document.getElementById('vouchers-list');
    if (!list) return;
    if (!profile) { list.innerHTML = emptyCard('Log in to see your vouchers.', 'Browse Apartments', 'accommodation.html'); return; }
    list.innerHTML = '<p class="list-loading">Loading your vouchers...</p>';
    var res = await sb.from('vouchers').select('*').eq('user_id', profile.id).order('created_at', { ascending: false });
    if (res.error) { list.innerHTML = '<p class="list-error">Could not load vouchers: ' + esc(res.error.message) + '</p>'; return; }
    var rows = res.data || [];
    if (!rows.length) { list.innerHTML = emptyCard('No vouchers yet. Watch your inbox for offers.', 'Browse Apartments', 'accommodation.html'); return; }
    list.innerHTML = rows.map(function (v) {
      var used = v.status !== 'active';
      return '' +
        '<div class="booking-card voucher-card' + (used ? ' is-used' : '') + '">' +
          '<div>' +
            '<div class="ref">' + esc(v.label || 'Voucher') + '</div>' +
            '<div class="title voucher-code">' + esc(v.code) + '</div>' +
            '<div class="meta">' + esc(v.discount || '') + (v.expires_at ? ' &middot; expires ' + fmtDate(v.expires_at) : ' &middot; no expiry') + '</div>' +
            '<span class="status ' + (used ? 'status-cancelled' : 'status-confirmed') + '">' + (used ? esc(v.status) : 'Active') + '</span>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  function emptyCard(msg, cta, href) {
    return '<div class="empty-card"><div class="ico">&#x1F3E0;</div><p>' + esc(msg) + '</p>' +
      '<a href="' + href + '" class="btn btn-primary">' + esc(cta) + '</a></div>';
  }

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', async function () {
    profile = await Auth.getProfile();
    if (!profile) {
      renderUserState();
      if (window.ipartmentOpenAuth) window.ipartmentOpenAuth('login');
      return;
    }
    renderUserState();
    if (window.location.hash === '#bookings') window.showTab('bookings');
    renderBookings();
  });
})();
