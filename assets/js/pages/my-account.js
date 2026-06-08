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
    document.querySelectorAll('.pane').forEach(function (p) { p.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    var pane = document.getElementById('pane-' + name);
    if (pane) pane.classList.add('active');
    var btn = document.querySelector('.tab-btn[data-tab="' + name + '"]');
    if (btn) btn.classList.add('active');
    if (name === 'bookings') renderBookings();
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
    var res = await sb.from('bookings').select('*').order('created_at', { ascending: false });
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
            '<span class="status ' + statusClass(b.status) + '">' + esc(statusLabel(b.status)) + '</span>' +
          '</div>' +
          '<div class="booking-total-col">' +
            '<div class="total">' + fmtVND(b.total) + '</div>' +
          '</div>' +
        '</div>';
    }).join('');
  }

  function statusLabel(s) {
    if (s === 'confirmed') return 'Confirmed';
    if (s === 'cancelled') return 'Cancelled';
    return 'Pending Confirmation';
  }

  function statusClass(s) {
    if (s === 'confirmed') return 'status-confirmed';
    if (s === 'cancelled') return 'status-cancelled';
    return 'status-pending';
  }

  // ---- Vouchers ----
  async function renderVouchers() {
    var list = document.getElementById('vouchers-list');
    if (!list) return;
    if (!profile) { list.innerHTML = emptyCard('Log in to see your vouchers.', 'Browse Apartments', 'accommodation.html'); return; }
    list.innerHTML = '<p class="list-loading">Loading your vouchers...</p>';
    var res = await sb.from('vouchers').select('*').order('created_at', { ascending: false });
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
