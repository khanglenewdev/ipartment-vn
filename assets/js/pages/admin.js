/* Admin CRM page logic - gated by a Supabase admin account */
const Auth = window.ipartmentAuth;
const sb = window.sb;
let currentTab = 'leads';
// Whether the current viewer is an admin. The overview KPIs are public, but the
// detailed per-tab data is shown only when this is true.
let _adminView = false;
// Search/filter state for the filterable tabs: loadAll fills these caches, then
// the render*Table() functions re-render from them whenever a filter changes,
// without refetching anything.
let _bkCache = [], _bkProfById = {}, _bkPrefByRef = {};
let _ldCache = [], _apCache = [];
// Dashboard data, stashed by loadAll so renderDashboard() can re-run freely.
let _dashFunnel = [], _dashExit = [], _dashChat = [], _dashStats = { visitors: 0, views: 0, users: 0 };
const LOCKED_NOTE = '<div class="locked-note"><span class="locked-ico">&#128274;</span><span>For security reasons, only admin accounts can view this data.</span></div>';

function showDash() {
  document.getElementById('dash').style.display = 'block';
  document.getElementById('link-logout').style.display = 'inline';
  loadAll();
}

// Admin access is account-based now: there is no separate admin login page.
// Anyone who is not a signed-in admin is sent to My Account, where they can
// log in normally; admins find the Admin tab there and land back here.
function sendToAccount() {
  window.location.replace('my-account.html');
}

document.getElementById('link-logout').addEventListener('click', e => {
  e.preventDefault();
  window.ipartmentConfirmLogout(async () => {
    await Auth.signOut();
    sendToAccount();
  });
});

document.querySelectorAll('.tab-btn-admin').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tab-btn-admin').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  b.classList.add('active');
  document.getElementById('tab-' + b.dataset.tab).classList.add('active');
  currentTab = b.dataset.tab;
}));

function fmtDate(s) {
  try { return new Date(s).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
  catch (e) { return s; }
}

function buildTable(headers, rows, emptyMsg) {
  if (!rows.length) return `<div class="empty-tbl"><strong>No data yet</strong>${emptyMsg ? '<p>'+emptyMsg+'</p>' : ''}</div>`;
  return `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function leadTypeTag(type) {
  if (type === 'welcome_popup_voucher') return '<span class="tag-pill popup">Popup</span>';
  if (type === 'newsletter_signup') return '<span class="tag-pill newsletter">Newsletter</span>';
  if (type === 'booking_request') return '<span class="tag-pill booking">Booking</span>';
  if (type === 'career_application') return '<span class="tag-pill career">Career</span>';
  if (type === 'stay_request') return '<span class="tag-pill booking">Stay request</span>';
  return `<span class="tag-pill">${type || '-'}</span>`;
}

// ===== BOOKINGS TAB: search + filters =====================================
function escp(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function truncate(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

// Same lifecycle derivation the My Account page shows the guest, so both
// sides of the system tell one story: cancelled, checked out (dates passed),
// staying (today inside the stay), confirmed, or pending confirmation.
function bkLiveStatus(b) {
  if (b.status === 'cancelled') return 'cancelled';
  const d = new Date(), p = n => (n < 10 ? '0' : '') + n;
  const t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  if (b.checkout && b.checkout <= t) return 'checked out';
  if (b.checkin && b.checkin <= t && (!b.checkout || t < b.checkout)) return 'staying';
  return b.status === 'confirmed' ? 'confirmed' : 'pending confirmation';
}

// Collect everything we know about how to host this booking's guest, merged
// most-specific-first (this booking's answers, then the snapshot stamped on the
// booking, then the account defaults).
function bkPrefData(b) {
  const gd = b.guests_detail || {};
  const prof = b.user_id ? (_bkProfById[b.user_id] || {}) : {};
  const ev = _bkPrefByRef[b.booking_ref] || {};
  const stay = (ev.perfect || '').trim() || ((gd.stay_preference || '') + '').trim() || (prof.stay_preference || '').trim();
  const room = (prof.preferred_category || '').trim();
  return {
    room: (room && !/^no preference$/i.test(room)) ? room : '',
    stay: stay,
    arrival: (ev.arrival || '').trim(),
    drink: (ev.drink || '').trim(),
    wishlist: Array.isArray(ev.wishlist) ? ev.wishlist : [],
    guest: gd.name || '-'
  };
}

// The table cell shows a compact summary; long requests are cut short and the
// cell opens a modal with the full detail (wired by delegation in initAdminUx).
function bkPrefCell(b) {
  const p = bkPrefData(b);
  if (!p.room && !p.stay && !p.arrival && !p.drink && !p.wishlist.length) return '-';
  const bits = [];
  if (p.room) bits.push(`Room: ${escp(p.room)}`);
  if (p.stay) bits.push(`Stay: ${escp(truncate(p.stay, 34))}`);
  if (!p.stay && (p.arrival || p.drink || p.wishlist.length)) bits.push('Prep notes');
  return `<button type="button" class="pref-more" data-ref="${escp(b.booking_ref || '')}" title="View full preference">` +
    `<small>${bits.join('<br/>')}</small><span class="pref-open-tag">view</span></button>`;
}

// Full-preference modal: everything known about hosting this guest, readable.
function openPrefModal(ref) {
  const b = _bkCache.find(x => x.booking_ref === ref);
  if (!b) return;
  const p = bkPrefData(b);
  const old = document.getElementById('pref-modal-overlay');
  if (old) old.remove();
  const rows = [];
  if (p.room) rows.push(['Preferred apartment', p.room]);
  if (p.stay) rows.push(['Stay preference', p.stay]);
  if (p.arrival) rows.push(['Estimated arrival', p.arrival]);
  if (p.drink) rows.push(['Coffee or tea', p.drink]);
  if (p.wishlist.length) rows.push(['Interested in (future services)', p.wishlist.join(', ')]);
  const ov = document.createElement('div');
  ov.className = 'pref-modal-overlay'; ov.id = 'pref-modal-overlay';
  ov.innerHTML = `
    <div class="pref-modal" role="dialog" aria-modal="true" aria-label="Guest preference">
      <button type="button" class="pm-close" aria-label="Close">&times;</button>
      <h3>${escp(p.guest)}</h3>
      <div class="pm-sub">${escp(ref)} &middot; ${escp(b.checkin || '-')} to ${escp(b.checkout || '-')}</div>
      ${rows.map(r => `<div class="pm-row"><div class="pm-k">${escp(r[0])}</div><div class="pm-v">${escp(r[1])}</div></div>`).join('')}
    </div>`;
  document.body.appendChild(ov);
  const close = () => { ov.classList.remove('open'); document.removeEventListener('keydown', onKey); setTimeout(() => ov.remove(), 220); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  ov.querySelector('.pm-close').addEventListener('click', close);
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => ov.classList.add('open'));
}

// Fill the apartment + status dropdowns from the values actually present in the
// data (so a new status never needs a code change). Keeps the current selection
// when it still exists.
function populateBookingFilterOptions() {
  const uniq = arr => Array.from(new Set(arr.filter(Boolean)));
  fillSelectOptions('bk-room', uniq(_bkCache.map(b => (b.room || '').toLowerCase())).sort(), v => v.toUpperCase());
  // filter on the LIVE status (what the column actually shows), not the raw field
  fillSelectOptions('bk-status', uniq(_bkCache.map(b => bkLiveStatus(b))).sort(), v => v);
}

function bookingMatchesFilters(b, f) {
  const gd = b.guests_detail || {};
  if (f.q) {
    const hay = [b.booking_ref, gd.name, gd.email, gd.phone, b.room, b.room_name]
      .map(x => (x || '') + '').join(' ').toLowerCase();
    if (hay.indexOf(f.q) < 0) return false;
  }
  if (f.room && (b.room || '').toLowerCase() !== f.room) return false;
  if (f.status && bkLiveStatus(b) !== f.status) return false;
  if (f.date) {
    // checkin/checkout are stored as YYYY-MM-DD strings, so plain string
    // comparison is correct date ordering.
    const ci = b.checkin || '', co = b.checkout || '';
    if (f.dateMode === 'checkin') { if (ci !== f.date) return false; }
    else if (f.dateMode === 'checkout') { if (co !== f.date) return false; }
    else if (f.dateMode === 'created') { if ((b.created_at || '').slice(0, 10) !== f.date) return false; }
    else { if (!(ci && co && ci <= f.date && f.date < co)) return false; } // staying on (checkout day is free again)
  }
  return true;
}

function renderBookingsTable() {
  const tbl = document.getElementById('tbl-bookings');
  if (!tbl || !_adminView) return;
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const f = {
    q: val('bk-search').trim().toLowerCase(),
    room: val('bk-room'),
    status: val('bk-status'),
    date: val('bk-date'),
    dateMode: val('bk-date-mode') || 'staying'
  };
  const rows = _bkCache.filter(b => bookingMatchesFilters(b, f));
  const countEl = document.getElementById('bk-count');
  if (countEl) countEl.textContent = (rows.length === _bkCache.length)
    ? `${_bkCache.length} booking${_bkCache.length === 1 ? '' : 's'}`
    : `${rows.length} of ${_bkCache.length} bookings`;
  const anyFilter = f.q || f.room || f.status || f.date;
  tbl.innerHTML = buildTable(
    ['Ref', 'Guest', 'Apartment', 'Dates', 'Nights', 'Total', 'Preference', 'Status', 'Created'],
    rows.map(b => {
      const gd = b.guests_detail || {};
      // always show the actual email (from the booking itself, falling back to
      // the linked account's profile); a small pill marks account holders
      const prof = b.user_id ? (_bkProfById[b.user_id] || {}) : {};
      const email = gd.email || prof.email || '-';
      const acctPill = b.user_id ? ' <span class="tag-pill booking">account</span>' : '';
      return [
        b.booking_ref || (b.id || '').slice(0, 8),
        `${escp(gd.name || '-')}${acctPill}<br/><small class="bk-email">${escp(email)}</small>`,
        `${b.room || ''}, ${b.room_name || ''}`,
        `${b.checkin || '-'} to ${b.checkout || '-'}`,
        b.nights || '-',
        `${(b.total || 0).toLocaleString('vi-VN')} VND`,
        bkPrefCell(b),
        bkLiveStatus(b),
        fmtDate(b.created_at)
      ];
    }),
    anyFilter ? 'No bookings match these filters. Try clearing them.' : 'Bookings appear here when a guest completes the booking flow.'
  );
}

// ===== LEADS TAB: search + filters ========================================
const LEAD_TYPE_LABELS = { welcome_popup_voucher: 'Popup', newsletter_signup: 'Newsletter', booking_request: 'Booking', career_application: 'Career' };
function populateLeadFilterOptions() {
  fillSelectOptions('ld-type',
    Array.from(new Set(_ldCache.map(l => l.type).filter(Boolean))).sort(),
    v => LEAD_TYPE_LABELS[v] || v.replace(/_/g, ' '));
}
function renderLeadsTable() {
  const tbl = document.getElementById('tbl-leads');
  if (!tbl || !_adminView) return;
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const f = { q: val('ld-search').trim().toLowerCase(), type: val('ld-type'), date: val('ld-date') };
  const rows = _ldCache.filter(l => {
    if (f.q) {
      const hay = [l.name, l.email, l.phone, l.booking_ref, l.applied_role, l.voucher_code, l.source_page]
        .map(x => (x || '') + '').join(' ').toLowerCase();
      if (hay.indexOf(f.q) < 0) return false;
    }
    if (f.type && l.type !== f.type) return false;
    if (f.date && (l.created_at || '').slice(0, 10) !== f.date) return false;
    return true;
  });
  const countEl = document.getElementById('ld-count');
  if (countEl) countEl.textContent = (rows.length === _ldCache.length)
    ? `${_ldCache.length} lead${_ldCache.length === 1 ? '' : 's'}`
    : `${rows.length} of ${_ldCache.length} leads`;
  tbl.innerHTML = buildTable(
    ['Date', 'Type', 'Name / Email', 'Phone', 'Source / Notes'],
    rows.map(l => [
      fmtDate(l.created_at),
      leadTypeTag(l.type),
      `${l.name || ''}<br/><small style="color:#999;">${l.email || ''}</small>`,
      l.phone || '-',
      // stay requests show WHAT was asked for; other leads keep their context
      (l.type === 'stay_request' && l.meta)
        ? `${escp(((l.meta.requests || []).join(', ') || 'Request') + (l.meta.note ? ' - "' + l.meta.note + '"' : ''))}<br/><small style="color:#999;">Ref: ${escp(l.booking_ref || '-')}</small>`
        : (l.booking_ref ? `Ref: ${l.booking_ref}` : l.applied_role ? `Role: ${l.applied_role}` : l.voucher_code || l.source_page || '-')
    ]),
    (f.q || f.type || f.date) ? 'No leads match these filters. Try clearing them.' : 'Leads appear here when visitors fill the welcome popup, newsletter, or any contact form.'
  );
}

// ===== APPLICATIONS TAB: search + filters =================================
function populateAppFilterOptions() {
  fillSelectOptions('ap-role',
    Array.from(new Set(_apCache.map(a => a.role).filter(Boolean))).sort(),
    v => v);
}
function renderApplicationsTable() {
  const tbl = document.getElementById('tbl-applications');
  if (!tbl || !_adminView) return;
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const f = { q: val('ap-search').trim().toLowerCase(), role: val('ap-role'), date: val('ap-date') };
  const rows = _apCache.filter(a => {
    if (f.q) {
      const hay = [a.first_name, a.last_name, a.email, a.phone, a.role]
        .map(x => (x || '') + '').join(' ').toLowerCase();
      if (hay.indexOf(f.q) < 0) return false;
    }
    if (f.role && a.role !== f.role) return false;
    if (f.date && (a.created_at || '').slice(0, 10) !== f.date) return false;
    return true;
  });
  const countEl = document.getElementById('ap-count');
  if (countEl) countEl.textContent = (rows.length === _apCache.length)
    ? `${_apCache.length} application${_apCache.length === 1 ? '' : 's'}`
    : `${rows.length} of ${_apCache.length} applications`;
  tbl.innerHTML = buildTable(
    ['Date', 'Role', 'Name', 'Contact', 'Experience'],
    rows.map(a => [
      fmtDate(a.created_at), a.role || '-', `${a.first_name || ''} ${a.last_name || ''}`.trim() || '-',
      `${a.email || ''}<br/><small style="color:#999;">${a.phone || ''}</small>`, a.years_experience || '-'
    ]),
    (f.q || f.role || f.date) ? 'No applications match these filters. Try clearing them.' : 'Job applications submitted via the Career page.'
  );
}

// Shared option filler for the filter dropdowns: keeps the "All ..." first
// option, rebuilds the rest from live data, keeps the selection when possible,
// and refreshes the custom glass dropdown label.
function fillSelectOptions(id, values, labelFn) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const current = sel.value;
  const all = sel.querySelector('option').outerHTML;
  sel.innerHTML = all + values.map(v => `<option value="${escp(v)}">${escp(labelFn(v))}</option>`).join('');
  if (values.indexOf(current) > -1) sel.value = current;
  if (sel._admRefresh) sel._admRefresh();
}

// ===== CUSTOM GLASS CONTROLS (replace the Chrome-default popups) ==========
// Strategy: the native <select> / <input type=date> stay in the DOM as hidden
// value stores, so every existing read (val('bk-room')) and listener keeps
// working; the visible UI is a glass button + glass panel that writes back to
// the native control and fires its change event. Panels are near-opaque with
// NO backdrop-filter, per the house halo rule.
function closeAdmPanels(except) {
  document.querySelectorAll('.adm-dd.open').forEach(d => { if (d !== except) d.classList.remove('open'); });
}
function initAdmSelect(sel) {
  if (!sel || sel._adm) return;
  sel._adm = true;
  const wrap = document.createElement('div');
  wrap.className = 'adm-dd';
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'bk-input adm-dd-btn';
  btn.innerHTML = '<span class="adm-dd-label"></span><span class="adm-dd-chev">&#9662;</span>';
  wrap.appendChild(btn);
  const menu = document.createElement('div');
  menu.className = 'adm-dd-menu';
  wrap.appendChild(menu);
  const label = () => {
    const o = sel.options[sel.selectedIndex];
    btn.querySelector('.adm-dd-label').textContent = o ? o.text : '';
  };
  const rebuild = () => {
    menu.innerHTML = '';
    Array.prototype.forEach.call(sel.options, o => {
      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'adm-dd-opt' + (o.value === sel.value ? ' active' : '');
      it.textContent = o.text;
      it.addEventListener('click', () => {
        sel.value = o.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        label();
        wrap.classList.remove('open');
      });
      menu.appendChild(it);
    });
  };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (wrap.classList.contains('open')) { wrap.classList.remove('open'); return; }
    closeAdmPanels(wrap); rebuild(); wrap.classList.add('open');
  });
  sel._admRefresh = label;
  label();
}
function initAdmDate(inp) {
  if (!inp || inp._adm) return;
  inp._adm = true;
  const ph = inp.getAttribute('data-ph') || 'Any date';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = n => (n < 10 ? '0' : '') + n;
  const wrap = document.createElement('div');
  wrap.className = 'adm-dd adm-dp';
  inp.parentNode.insertBefore(wrap, inp);
  wrap.appendChild(inp);
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'bk-input adm-dd-btn';
  btn.innerHTML = '<span class="adm-dd-label"></span><span class="adm-dd-chev">&#128197;</span>';
  wrap.appendChild(btn);
  const menu = document.createElement('div');
  menu.className = 'adm-dd-menu adm-dp-panel';
  wrap.appendChild(menu);
  let view = new Date();
  const label = () => {
    const v = inp.value;
    const el = btn.querySelector('.adm-dd-label');
    if (!v) { el.textContent = ph; el.classList.add('is-ph'); return; }
    const p = v.split('-');
    el.textContent = `${parseInt(p[2], 10)} ${MONTHS[parseInt(p[1], 10) - 1]} ${p[0]}`;
    el.classList.remove('is-ph');
  };
  const setValue = v => {
    inp.value = v;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    label();
    wrap.classList.remove('open');
  };
  const render = () => {
    const y = view.getFullYear(), m = view.getMonth();
    const startDow = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first grid
    const dim = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    let html = `<div class="adm-dp-head">` +
      `<button type="button" class="adm-dp-nav" data-nav="-1" aria-label="Previous month">&#8249;</button>` +
      `<span class="adm-dp-title">${MONTHS[m]} ${y}</span>` +
      `<button type="button" class="adm-dp-nav" data-nav="1" aria-label="Next month">&#8250;</button></div>` +
      `<div class="adm-dp-grid">` +
      ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => `<span class="adm-dp-dow">${d}</span>`).join('');
    for (let i = 0; i < startDow; i++) html += '<span></span>';
    for (let d = 1; d <= dim; d++) {
      const key = `${y}-${pad(m + 1)}-${pad(d)}`;
      const cls = 'adm-dp-day' + (key === inp.value ? ' sel' : '') + (key === todayKey ? ' today' : '');
      html += `<button type="button" class="${cls}" data-date="${key}">${d}</button>`;
    }
    html += `</div><div class="adm-dp-foot"><button type="button" class="adm-dp-clear">Clear date</button></div>`;
    menu.innerHTML = html;
    menu.querySelectorAll('.adm-dp-nav').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      view = new Date(view.getFullYear(), view.getMonth() + parseInt(b.dataset.nav, 10), 1);
      render();
    }));
    menu.querySelectorAll('.adm-dp-day').forEach(b => b.addEventListener('click', () => setValue(b.dataset.date)));
    menu.querySelector('.adm-dp-clear').addEventListener('click', () => setValue(''));
  };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (wrap.classList.contains('open')) { wrap.classList.remove('open'); return; }
    closeAdmPanels(wrap);
    view = inp.value ? new Date(inp.value + 'T00:00:00') : new Date();
    render(); wrap.classList.add('open');
  });
  inp._admRefresh = label;
  label();
}

// ===== TOOLBAR WIRING =====================================================
function wireToolbar(ids, render, clearId, defaults) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  const clear = document.getElementById(clearId);
  if (clear) clear.addEventListener('click', () => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = (defaults && defaults[id] != null) ? defaults[id] : '';
      if (el._admRefresh) el._admRefresh();
    });
    render();
  });
}
function initAdminUx() {
  // glass replacements for every native filter control
  ['bk-room', 'bk-status', 'bk-date-mode', 'ld-type', 'ap-role'].forEach(id => initAdmSelect(document.getElementById(id)));
  ['bk-date', 'ld-date', 'ap-date'].forEach(id => initAdmDate(document.getElementById(id)));
  document.addEventListener('click', () => closeAdmPanels());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAdmPanels(); });
  wireToolbar(['bk-search', 'bk-room', 'bk-status', 'bk-date', 'bk-date-mode'], renderBookingsTable, 'bk-clear', { 'bk-date-mode': 'staying' });
  wireToolbar(['ld-search', 'ld-type', 'ld-date'], renderLeadsTable, 'ld-clear');
  wireToolbar(['ap-search', 'ap-role', 'ap-date'], renderApplicationsTable, 'ap-clear');
  // clicking a preference summary opens the full-detail modal
  const bkTbl = document.getElementById('tbl-bookings');
  if (bkTbl) bkTbl.addEventListener('click', e => {
    const b = e.target.closest('.pref-more');
    if (b) openPrefModal(b.dataset.ref);
  });
}
initAdminUx();

// Overview KPIs come from a public aggregate-counts RPC (totals only, no PII),
// so the headline shows real numbers to everyone, even logged out. The detailed
// rows below stay protected by row-level security (admin accounts only).
async function loadPublicKPIs() {
  try {
    const res = await sb.rpc('crm_public_counts');
    if (res.error || !res.data) return;
    const d = res.data;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const n = x => Number(x || 0).toLocaleString('en-US');
    set('kpi-visitors', n(d.visitors));
    set('kpi-visitors-sub', n(d.pageviews) + ' page views');
    set('kpi-leads', n(d.leads));
    set('kpi-leads-sub', n(d.lead_emails) + ' unique emails');
    set('kpi-bookings', n(d.bookings));
    set('kpi-users', n(d.users));
    set('kpi-applications', n(d.applications));
  } catch (e) { console.warn('[admin] public counts failed', e); }
}

// For non-admins, fill every detail container with the security note instead of
// data. Only sets innerHTML (never removes the elements), so an admin signing in
// re-renders cleanly.
function renderLockedTabs() {
  const note = LOCKED_NOTE;
  ['bookings-toolbar', 'leads-toolbar', 'applications-toolbar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const tableNote = '<tbody><tr><td>' + note + '</td></tr></tbody>';
  ['tbl-leads','tbl-users','tbl-bookings','tbl-vouchers','tbl-applications','tbl-sessions','tbl-quiz','tbl-feedback','tbl-chatbot-miss','tbl-chatbot-leads','tbl-chatbot-all'].forEach(function(id){ const el = document.getElementById(id); if (el) el.innerHTML = tableNote; });
  ['sessions-summary','chatbot-summary','finder-summary','funnel-view','mag-list','dash-view'].forEach(function(id){ const el = document.getElementById(id); if (el) el.innerHTML = note; });
}

async function loadAll() {
  // Headline KPIs are public and always real.
  await loadPublicKPIs();
  // The in-depth per-tab data is admin only.
  let isAdminUser = false;
  try { isAdminUser = await Auth.isAdmin(); } catch (e) {}
  _adminView = isAdminUser;
  if (!isAdminUser) { renderLockedTabs(); return; }

  // Everything below is read from Supabase, the single source of truth.
  let profiles = [], bookings = [], vouchers = [], leads = [], apps = [], pageviews = [], quiz = [], chatEvents = [], finderEvents = [], prefEvents = [], totalViewsExact = null;
  try {
    const [pr, br, vr, lr, ar, sv, cv, qz, fb, ce, fe, pe, fu, ee] = await Promise.all([
      sb.from('profiles').select('*').order('created_at', { ascending: false }),
      sb.from('bookings').select('*').order('created_at', { ascending: false }),
      sb.from('vouchers').select('*').order('created_at', { ascending: false }),
      sb.from('leads').select('*').order('created_at', { ascending: false }),
      sb.from('applications').select('*').order('created_at', { ascending: false }),
      sb.from('events').select('session_id,page,meta,created_at').eq('type', 'pageview').order('created_at', { ascending: false }).limit(1000),
      sb.from('events').select('*', { count: 'exact', head: true }).eq('type', 'pageview'),
      sb.from('password_quiz').select('*').order('created_at', { ascending: false }),
      sb.from('site_feedback').select('*').order('created_at', { ascending: false }),
      sb.from('events').select('name,meta,created_at').eq('type', 'chatbot').order('created_at', { ascending: false }).limit(3000),
      sb.from('events').select('name,meta,created_at').eq('type', 'finder').order('created_at', { ascending: false }).limit(3000),
      sb.from('events').select('meta,created_at').eq('type', 'preferences').order('created_at', { ascending: false }).limit(2000),
      sb.from('events').select('name,session_id').eq('type', 'funnel').limit(5000),
      sb.from('events').select('name,meta,created_at').eq('type', 'exit_survey').order('created_at', { ascending: false }).limit(1000)
    ]);
    profiles = pr.data || []; bookings = br.data || []; vouchers = vr.data || [];
    leads = lr.data || []; apps = ar.data || []; pageviews = sv.data || [];
    quiz = qz.data || []; chatEvents = ce.data || []; finderEvents = fe.data || [];
    prefEvents = pe.data || [];
    totalViewsExact = (cv && typeof cv.count === 'number') ? cv.count : null;
    [pr, br, vr, lr, ar, sv, cv, qz, fb, ce, fe, pe, fu, ee].forEach(r => { if (r.error) console.warn('[admin] load:', r.error.message); });
    window.__feedback = fb.data || [];
    _dashFunnel = fu.data || []; _dashExit = ee.data || [];
  } catch (e) { console.warn('[admin] supabase load failed', e); }

  // KPI cards are already populated by loadPublicKPIs() above. Below we only
  // build the detailed per-tab views from the admin-readable rows.

  // VISITORS detail: unique browser sessions + total page views, from the events table.
  // A "visitor" is a unique session_id (one per browser). Total views is an exact
  // server-side count; unique/today figures use the most recent 1000 page views.
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const uniqueVisitors = new Set(pageviews.map(p => p.session_id).filter(Boolean)).size;
  const totalViews = (totalViewsExact != null) ? totalViewsExact : pageviews.length;
  const recentToday = pageviews.filter(p => new Date(p.created_at) >= startToday);
  const visitorsToday = new Set(recentToday.map(p => p.session_id).filter(Boolean)).size;
  const viewsToday = recentToday.length;
  _dashChat = chatEvents;
  _dashStats = { visitors: uniqueVisitors, views: totalViews, visitorsToday: visitorsToday, users: profiles.length };
  const sumEl = document.getElementById('sessions-summary');
  if (sumEl) {
    const stat = (v, l) => `<div class="mini-stat"><div class="v">${v.toLocaleString('en-US')}</div><div class="l">${l}</div></div>`;
    const note = (totalViewsExact != null && totalViewsExact > pageviews.length)
      ? `Total page views is exact. Unique-visitor and "today" figures are based on the most recent ${pageviews.length.toLocaleString('en-US')} page views.`
      : 'A visitor is a unique browser session. For full historical traffic across devices, turn on Microsoft Clarity or connect a web-analytics tool (see the playbook).';
    sumEl.innerHTML =
      stat(uniqueVisitors, 'Unique visitors') +
      stat(totalViews, 'Total page views') +
      stat(visitorsToday, 'Visitors today') +
      stat(viewsToday, 'Views today') +
      `<div class="note">${note}</div>`;
  }

  // Leads (Supabase) - cached, then rendered through the search/filter toolbar
  _ldCache = leads;
  populateLeadFilterOptions();
  const ldToolbar = document.getElementById('leads-toolbar');
  if (ldToolbar) ldToolbar.style.display = '';
  renderLeadsTable();

  // Accounts (Supabase profiles)
  document.getElementById('tbl-users').innerHTML = buildTable(
    ['Joined', 'Name', 'Email', 'Role', 'Phone'],
    profiles.map(u => [
      fmtDate(u.created_at),
      `${u.first_name || ''} ${u.last_name || ''}`.trim() || '-',
      u.email || '-',
      u.role === 'admin' ? '<span class="tag-pill booking">Admin</span>' : 'User',
      u.phone || '-'
    ]),
    'Registered accounts appear here when visitors sign up on the main site.'
  );

  // Bookings (Supabase) - guest contact comes from guests_detail.
  // The Preference column merges three sources, most specific first:
  //  - the "make your stay perfect" answer submitted for THIS booking
  //    (events table, type preferences, matched by booking ref),
  //  - the stay preference stamped into guests_detail at booking time,
  //  - the account's saved defaults (profiles.stay_preference + preferred_category).
  _bkProfById = {};
  profiles.forEach(p => { _bkProfById[p.id] = p; });
  _bkPrefByRef = {};
  prefEvents.forEach(ev => {
    const m = ev.meta || {};
    if (m.bookingRef && !_bkPrefByRef[m.bookingRef]) _bkPrefByRef[m.bookingRef] = m; // newest first
  });
  _bkCache = bookings;
  populateBookingFilterOptions();
  const bkToolbar = document.getElementById('bookings-toolbar');
  if (bkToolbar) bkToolbar.style.display = '';
  renderBookingsTable();

  // Vouchers (Supabase)
  document.getElementById('tbl-vouchers').innerHTML = buildTable(
    ['Issued', 'Code', 'Label', 'Discount', 'Status'],
    vouchers.map(v => [fmtDate(v.created_at), v.code, v.label || '-', v.discount || '-', v.status || '-']),
    'Vouchers are auto-issued on signup and appear here.'
  );

  // Applications (Supabase) - cached, then rendered through the toolbar
  _apCache = apps;
  populateAppFilterOptions();
  const apToolbar = document.getElementById('applications-toolbar');
  if (apToolbar) apToolbar.style.display = '';
  renderApplicationsTable();

  // Page views (Supabase events)
  document.getElementById('tbl-sessions').innerHTML = buildTable(
    ['Time', 'Page', 'Referrer'],
    pageviews.slice(0, 100).map(s => [fmtDate(s.created_at), (s.meta && s.meta.path) || s.page || '-', (s.meta && s.meta.ref) || '-']),
    'Page views are tracked anonymously to show visitor flow.'
  );

  // Forgot-password quiz answers (Supabase)
  document.getElementById('tbl-quiz').innerHTML = buildTable(
    ['Date', 'Email', 'Name', 'Likes the site', 'Dev looks', 'Improvement idea'],
    quiz.map(q => [
      fmtDate(q.created_at), q.email || '-', q.name || '-',
      (q.likes_score != null ? q.likes_score + '/10' : '-'),
      (q.dev_score != null ? q.dev_score + '/10' : '-'),
      q.improve || '-'
    ]),
    'Answers from the playful forgot-password quiz land here. Surprisingly useful feedback.'
  );

  // Website feedback ("Rate my website" footer panel)
  const feedback = window.__feedback || [];
  document.getElementById('tbl-feedback').innerHTML = buildTable(
    ['Date', 'Rating', 'Comment', 'Email (service interest)', 'Page'],
    feedback.map(f => [
      fmtDate(f.created_at), (f.rating ? f.rating + '/5' : '-'), f.comment || '-', f.email || '-', f.source_page || '-'
    ]),
    'Feedback left via the footer "Rate my website" panel will appear here, plus emails from people interested in what we build.'
  );

  // Chatbot: funnel summary + top unanswered questions + recent chatbot leads
  (function renderChatbot() {
    const ev = chatEvents || [];
    const cnt = n => ev.filter(e => e.name === n).length;
    const opens = cnt('open'), qs = cnt('question'), hits = cnt('answer_hit'), misses = cnt('answer_miss');
    const capShown = cnt('capture_shown'), capDone = cnt('capture_done');
    const answered = hits + misses;
    const hitRate = answered ? Math.round(hits / answered * 100) : 0;
    const capRate = capShown ? Math.round(capDone / capShown * 100) : 0;
    const stat = (label, val) => '<span style="display:inline-block;margin:0 22px 12px 0;"><strong style="font-family:var(--font-heading,serif);font-size:24px;color:#fff;display:block;line-height:1;">' + val + '</strong><span style="font-family:var(--font-mono,monospace);font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.55);">' + label + '</span></span>';
    const sum = document.getElementById('chatbot-summary');
    if (sum) sum.innerHTML = stat('Chats opened', opens) + stat('Questions asked', qs) + stat('Answered', hits + ' / ' + hitRate + '%') + stat('Unanswered', misses) + stat('Leads captured', capDone + (capShown ? ' / ' + capRate + '%' : ''));

    // group answer_miss by normalised question so repeats stack into one row
    const groups = {};
    ev.filter(e => e.name === 'answer_miss').forEach(e => {
      const q = ((e.meta && e.meta.q) || '').trim();
      if (!q) return;
      const key = q.toLowerCase().replace(/\s+/g, ' ');
      if (!groups[key]) groups[key] = { q, n: 0, last: e.created_at };
      groups[key].n++;
      if (e.created_at > groups[key].last) groups[key].last = e.created_at;
    });
    const ranked = Object.values(groups).sort((a, b) => b.n - a.n || (b.last > a.last ? 1 : -1)).slice(0, 50);
    document.getElementById('tbl-chatbot-miss').innerHTML = buildTable(
      ['Times asked', 'Question the library could not answer', 'Last asked'],
      ranked.map(g => [g.n, g.q, fmtDate(g.last)]),
      'No unanswered questions yet. When a visitor types something the library cannot answer confidently, it lands here so you can add it.'
    );

    const cbLeads = (leads || []).filter(l => l.type === 'chatbot_capture' || l.type === 'chatbot_qualify');
    document.getElementById('tbl-chatbot-leads').innerHTML = buildTable(
      ['Date', 'Email', 'Phone', 'Triggering question', 'Page'],
      cbLeads.map(l => [fmtDate(l.created_at), l.email || '-', l.phone || '-', (l.meta && l.meta.question) || '-', (l.meta && l.meta.page) || l.source_page || '-']),
      'Leads captured by the chatbot will appear here, each with the question that prompted them.'
    );

    // Finder quiz funnel + the recommendation mix
    const fev = finderEvents || [];
    const fc = n => fev.filter(e => e.name === n).length;
    const recMix = {};
    fev.filter(e => e.name === 'result').forEach(e => { const r = e.meta && e.meta.recommended; if (r) recMix[r] = (recMix[r] || 0) + 1; });
    const recStr = ['XS', 'S', 'M', 'L'].filter(k => recMix[k]).map(k => k + ': ' + recMix[k]).join('   ') || 'none yet';
    const fsum = document.getElementById('finder-summary');
    if (fsum) fsum.innerHTML = stat('Quizzes started', fc('start')) + stat('Completed', fc('result')) + stat('Booking clicks', fc('cta_book_click')) + stat('Leads captured', fc('capture_done')) + stat('Abandoned', fc('abandon')) + '<div style="margin-top:6px;font-family:var(--font-mono,monospace);font-size:11px;letter-spacing:0.06em;color:rgba(255,255,255,0.6);">RECOMMENDED MIX &nbsp;&nbsp; ' + recStr + '</div>';

    // EVERYTHING guests ask, not only the misses. What people ask is what they
    // care about, whether or not the bot answered: this is the listening layer.
    const allQ = {};
    ev.filter(e => e.name === 'question').forEach(e => {
      const q = ((e.meta && e.meta.q) || '').trim();
      if (!q) return;
      const key = q.toLowerCase().replace(/\s+/g, ' ');
      if (!allQ[key]) allQ[key] = { q, n: 0, last: e.created_at };
      allQ[key].n++;
      if (e.created_at > allQ[key].last) allQ[key].last = e.created_at;
    });
    const missKeys = new Set(Object.keys(groups));
    const allRanked = Object.values(allQ).sort((a, b) => b.n - a.n || (b.last > a.last ? 1 : -1)).slice(0, 100);
    const tblAll = document.getElementById('tbl-chatbot-all');
    if (tblAll) tblAll.innerHTML = buildTable(
      ['Times asked', 'Question', 'Bot answered?', 'Last asked'],
      allRanked.map(g => [g.n, g.q, missKeys.has(g.q.toLowerCase().replace(/\s+/g, ' ')) ? '<span style="color:#f87171;">missed</span>' : '<span style="color:#4ade80;">answered</span>', fmtDate(g.last)]),
      'Every question typed into the chat will appear here, answered or not. What guests ask is what they care about.'
    );
  })();

  renderDashboard();
}

window.downloadJSON = function() {
  const data = window.ipartmentCRM.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ipartment-crm-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

window.downloadCSV = function() {
  const csv = window.ipartmentCRM.exportCSV(currentTab);
  if (!csv) { window.ipartmentToast('No data to export in this tab.'); return; }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ipartment-${currentTab}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

window.clearAll = function() {
  window.ipartmentCRM.clearAll();
  loadAll();
  window.ipartmentToast('All data cleared.');
};

window.loadAll = loadAll;

// ── WEBHOOK / AIRTABLE INTEGRATION CONTROLS ──
function refreshWebhookStatus() {
  const url = window.ipartmentCRM.getWebhook();
  const statusEl = document.getElementById('webhook-status');
  const inputEl = document.getElementById('webhook-url-input');
  if (!statusEl || !inputEl) return;
  if (url) {
    statusEl.innerHTML = `<span style="color:var(--green);">&#10003; Connected.</span> Every new record is forwarded to Make.`;
    inputEl.value = url;
  } else {
    statusEl.innerHTML = `<span style="color:rgba(255,255,255,0.5);">Not connected.</span> Data only stores in this browser until you add a webhook.`;
  }
}

window.saveWebhook = function() {
  const url = document.getElementById('webhook-url-input').value.trim();
  if (url && !/^https?:\/\//.test(url)) {
    window.ipartmentToast('Webhook URL must start with https://');
    return;
  }
  window.ipartmentCRM.setWebhook(url);
  refreshWebhookStatus();
  window.ipartmentToast(url ? 'Webhook saved.' : 'Webhook cleared.');
};

window.testWebhook = function() {
  const url = window.ipartmentCRM.getWebhook();
  if (!url) { window.ipartmentToast('Set a webhook URL first.'); return; }
  window.ipartmentCRM.testWebhook();
  window.ipartmentToast('Test ping sent. Check your Make scenario for activity.');
};

window.clearWebhook = function() {
  if (!confirm('Disconnect the webhook?')) return;
  window.ipartmentCRM.setWebhook('');
  document.getElementById('webhook-url-input').value = '';
  refreshWebhookStatus();
  window.ipartmentToast('Webhook disconnected.');
};

// ── MICROSOFT CLARITY ──
function refreshClarityStatus() {
  const statusEl = document.getElementById('clarity-status');
  const inputEl = document.getElementById('clarity-id-input');
  if (!statusEl || !inputEl) return;
  const id = window.ipartmentGetClarity ? window.ipartmentGetClarity() : '';
  if (id) {
    statusEl.innerHTML = '<span style="color:var(--green);">&#10003; Clarity is on</span> (project ' + id + '). Reload a page to start recording.';
    inputEl.value = id;
  } else {
    statusEl.innerHTML = '<span style="color:rgba(255,255,255,0.5);">Not connected.</span> Paste a project ID to turn on session replay and heatmaps.';
  }
}

window.saveClarity = function() {
  const id = (document.getElementById('clarity-id-input').value || '').trim();
  if (window.ipartmentSetClarity) window.ipartmentSetClarity(id);
  refreshClarityStatus();
  window.ipartmentToast(id ? 'Clarity ID saved. Reload to start recording.' : 'Clarity ID cleared.');
};

window.clearClarity = function() {
  if (window.ipartmentSetClarity) window.ipartmentSetClarity('');
  document.getElementById('clarity-id-input').value = '';
  refreshClarityStatus();
  window.ipartmentToast('Clarity removed.');
};

// Refresh status when the integration tab is opened
document.querySelectorAll('.tab-btn-admin').forEach(b => {
  b.addEventListener('click', () => {
    if (b.dataset.tab === 'integration') { refreshWebhookStatus(); refreshClarityStatus(); }
    if (b.dataset.tab === 'magazine') renderMagazineList();
    if (b.dataset.tab === 'funnel') renderFunnel();
  if (b.dataset.tab === 'dash') renderDashboard();
  });
});

// ── BUSINESS DASHBOARD ──
// The first thing the owner sees: not tables, but the business at a glance
// plus a "needs your attention" list of concrete next actions. Built entirely
// from the data loadAll already fetched; re-renders instantly on tab open.
function renderDashboard() {
  const wrap = document.getElementById('dash-view');
  if (!wrap) return;
  if (!_adminView) { wrap.innerHTML = LOCKED_NOTE; return; }
  const bk = _bkCache.filter(b => b.status !== 'cancelled');
  const fmtM = v => v >= 1e6 ? (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + 'M' : (v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(v));
  const revenue = bk.reduce((s, b) => s + (b.total || 0), 0);
  const now = new Date();
  const monthKey = d => d.getFullYear() + '-' + (d.getMonth() + 1);
  const revThisMonth = bk.filter(b => monthKey(new Date(b.created_at)) === monthKey(now)).reduce((s, b) => s + (b.total || 0), 0);
  const nights = bk.reduce((s, b) => s + (b.nights || 0), 0);
  const pending = _bkCache.filter(b => bkLiveStatus(b) === 'pending confirmation');
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const leads7 = _ldCache.filter(l => new Date(l.created_at) >= weekAgo).length;

  // funnel conversion ring (unique sessions step 1 -> step 5)
  const sets = {};
  _dashFunnel.forEach(r => { (sets[r.name] = sets[r.name] || new Set()).add(r.session_id); });
  const s1 = (sets.step_1 || new Set()).size, s5 = (sets.step_5 || new Set()).size;
  const convPct = s1 ? Math.round(s5 / s1 * 100) : 0;

  // booked revenue by month, last 6
  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ k: monthKey(d), lbl: d.toLocaleString('en-GB', { month: 'short' }), v: 0 }); }
  bk.forEach(b => { const m = months.find(x => x.k === monthKey(new Date(b.created_at))); if (m) m.v += (b.total || 0); });
  const maxM = Math.max(1, ...months.map(m => m.v));

  // lead sources
  const srcCount = {};
  _ldCache.forEach(l => { const lbl = LEAD_TYPE_LABELS[l.type] || (l.type || 'other').replace(/_/g, ' '); srcCount[lbl] = (srcCount[lbl] || 0) + 1; });
  const srcs = Object.entries(srcCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxSrc = Math.max(1, ...srcs.map(s => s[1]));

  // exit reasons + top chat questions + top miss
  const rl = { price: 'The price', dates: 'Dates did not work', more_info: 'Needed more info', confusing: 'Website was confusing', browsing: 'Just browsing' };
  const exitCount = {};
  _dashExit.forEach(e => { if (e.name && e.name !== 'detail' && e.name !== 'offer_wish') exitCount[e.name] = (exitCount[e.name] || 0) + 1; });
  const exits = Object.entries(exitCount).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const qCount = {};
  _dashChat.filter(e => e.name === 'question').forEach(e => { const q = ((e.meta && e.meta.q) || '').trim(); if (!q) return; const k = q.toLowerCase().replace(/\s+/g, ' '); (qCount[k] = qCount[k] || { q, n: 0 }).n++; });
  const topQ = Object.values(qCount).sort((a, b) => b.n - a.n).slice(0, 4);
  const missCount = {};
  _dashChat.filter(e => e.name === 'answer_miss').forEach(e => { const q = ((e.meta && e.meta.q) || '').trim(); if (q) { const k = q.toLowerCase(); (missCount[k] = missCount[k] || { q, n: 0 }).n++; } });
  const topMiss = Object.values(missCount).sort((a, b) => b.n - a.n)[0];
  const stayReqs = _ldCache.filter(l => l.type === 'stay_request').slice(0, 3);

  // decisions, not data: what should the owner DO right now
  const attention = [];
  pending.slice(0, 3).forEach(b => attention.push({ ico: '&#128203;', txt: '<b>Confirm booking ' + escp(b.booking_ref || '') + '</b>, ' + escp((b.guests_detail || {}).name || 'guest') + ', check-in ' + escp(b.checkin || '') + ', awaiting your confirmation', tab: 'bookings' }));
  stayReqs.forEach(l => attention.push({ ico: '&#128718;', txt: '<b>Stay request</b>, ' + escp(((l.meta || {}).requests || []).join(', ') || 'see details') + ' (' + escp(l.booking_ref || '-') + ')', tab: 'leads' }));
  if (topMiss) attention.push({ ico: '&#128049;', txt: '<b>Teach the chatbot</b>, "' + escp(topMiss.q) + '" was asked ' + topMiss.n + 'x with no answer in the library', tab: 'chatbot' });
  if (exits.length) attention.push({ ico: '&#128682;', txt: '<b>Top exit reason:</b> ' + escp(rl[exits[0][0]] || exits[0][0]) + ' (' + exits[0][1] + 'x). Worth a closer look.', tab: 'funnel' });

  // Each block is a doorway to the tab that holds its detail. The corner arrow
  // lights up on hover (the glow now means "click to open"). data-gotab says
  // where it leads.
  const arrow = '<span class="dc-arrow" aria-hidden="true">&rarr;</span>';
  const kpi = (lbl, val, sub, tab) => '<div class="dc dc-kpi dc-click" data-gotab="' + tab + '"><div class="dc-lbl">' + lbl + '</div><div class="dc-val">' + val + '</div><div class="dc-sub">' + (sub || '') + '</div>' + arrow + '</div>';
  const bars = months.map(m => '<div class="dch-col"><div class="dch-bar" style="height:' + Math.max(4, Math.round(m.v / maxM * 100)) + '%"><span>' + (m.v ? fmtM(m.v) : '') + '</span></div><div class="dch-lbl">' + m.lbl + '</div></div>').join('');
  const srcBars = srcs.length ? srcs.map(s => '<div class="dcs-row"><span class="dcs-lbl">' + escp(s[0]) + '</span><div class="dcs-track"><div class="dcs-fill" style="width:' + Math.round(s[1] / maxSrc * 100) + '%"></div></div><span class="dcs-n">' + s[1] + '</span></div>').join('') : '<p class="dc-empty">No leads yet.</p>';

  wrap.innerHTML =
    '<div class="dash-grid">' +
      kpi('Revenue booked', fmtM(revenue) + ' ₫', revThisMonth ? fmtM(revThisMonth) + ' ₫ this month' : 'all time', 'bookings') +
      kpi('Nights sold', nights, 'across ' + bk.length + ' booking' + (bk.length === 1 ? '' : 's'), 'bookings') +
      kpi('Bookings', _bkCache.length, pending.length ? (pending.length + ' awaiting confirmation') : 'none pending', 'bookings') +
      kpi('Leads', _ldCache.length, leads7 + ' in the last 7 days', 'leads') +
      kpi('Visitors', _dashStats.visitors, _dashStats.views + ' page views', 'sessions') +
      '<div class="dc dc-wide dc-click" data-gotab="bookings"><div class="dc-lbl">Booked revenue by month</div><div class="dch">' + bars + '</div>' + arrow + '</div>' +
      '<div class="dc dc-click" data-gotab="funnel"><div class="dc-lbl">Booking conversion</div><div class="dc-ring" style="--p:' + convPct + '"><div class="dc-ring-hole"><b>' + convPct + '%</b><span>visit &rarr; book</span></div></div>' + arrow + '</div>' +
      '<div class="dc dc-click" data-gotab="leads"><div class="dc-lbl">Where leads come from</div>' + srcBars + arrow + '</div>' +
      '<div class="dc dc-wide"><div class="dc-lbl">Needs your attention</div>' +
        (attention.length ? attention.map(a => '<div class="dc-attn-row"><span class="dc-attn-ico">' + a.ico + '</span><span class="dc-attn-txt">' + a.txt + '</span><button type="button" class="dc-go" data-tab="' + a.tab + '">Open</button></div>').join('') : '<p class="dc-empty">All clear. Nothing is waiting on you right now.</p>') +
      '</div>' +
      '<div class="dc dc-click" data-gotab="funnel"><div class="dc-lbl">Why visitors leave</div>' +
        (exits.length ? exits.map(e2 => '<div class="dcs-row"><span class="dcs-lbl">' + escp(rl[e2[0]] || e2[0]) + '</span><div class="dcs-track"><div class="dcs-fill" style="width:' + Math.round(e2[1] / exits[0][1] * 100) + '%"></div></div><span class="dcs-n">' + e2[1] + '</span></div>').join('') : '<p class="dc-empty">No exit answers yet. The survey shows on desktop when the cursor leaves the top of the page (after 30 seconds and a scroll), and a record is written the moment a visitor taps a reason.</p>') +
        arrow +
      '</div>' +
      '<div class="dc dc-click" data-gotab="chatbot"><div class="dc-lbl">What guests ask the most</div>' +
        (topQ.length ? topQ.map(q => '<div class="dcs-row"><span class="dcs-lbl dcs-q">' + escp(q.q) + '</span><span class="dcs-n">' + q.n + 'x</span></div>').join('') : '<p class="dc-empty">No chat questions yet.</p>') +
        arrow +
      '</div>' +
    '</div>';
  const gotoTab = name => { const t = document.querySelector('.tab-btn-admin[data-tab="' + name + '"]'); if (t) t.click(); };
  wrap.querySelectorAll('.dc-go').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); gotoTab(b.dataset.tab); }));
  wrap.querySelectorAll('.dc-click').forEach(c => {
    c.setAttribute('tabindex', '0');
    c.setAttribute('role', 'button');
    c.addEventListener('click', e => { if (e.target.closest('.dc-go')) return; gotoTab(c.dataset.gotab); });
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); gotoTab(c.dataset.gotab); } });
  });
}

// ── BOOKING FUNNEL (Supabase events) ──
async function renderFunnel() {
  const wrap = document.getElementById('funnel-view');
  if (!wrap) return;
  if (!_adminView) { wrap.innerHTML = LOCKED_NOTE; return; }
  wrap.innerHTML = '<p style="color:rgba(255,255,255,0.5);">Loading...</p>';
  const [fres, eres, ares, pres] = await Promise.all([
    sb.from('events').select('name,session_id').eq('type', 'funnel'),
    sb.from('events').select('name,meta').eq('type', 'exit_survey'),
    sb.from('events').select('name,variant').eq('type', 'ab'),
    sb.from('events').select('meta').eq('type', 'preferences')
  ]);
  if (fres.error) { wrap.innerHTML = '<p style="color:#f87171;">Could not load funnel: ' + fres.error.message + '</p>'; return; }
  const rows = fres.data || [];
  const steps = ['step_1', 'step_2', 'step_3', 'step_4', 'step_5'];
  const labels = ['1. Viewed booking', '2. Picked dates', '3. Saw add-ons', '4. Entered details', '5. Confirmed'];
  const sets = steps.map(() => new Set());
  rows.forEach(r => { const idx = steps.indexOf(r.name); if (idx > -1) sets[idx].add(r.session_id); });
  const n = sets.map(s => s.size);
  const top = n[0] || 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let html = '';
  if (!rows.length) {
    html += '<div class="empty-tbl"><strong>No funnel data yet</strong><p>Visit the booking page and step through it to see the funnel populate.</p></div>';
  } else {
    html += '<div style="max-width:680px;">';
    for (let i = 0; i < steps.length; i++) {
      const c = n[i];
      const w = Math.round((c / top) * 100);
      let drop = '';
      if (i > 0 && n[i - 1] > 0) drop = ' <span style="color:#f87171;">(-' + Math.round((1 - c / n[i - 1]) * 100) + '%)</span>';
      html += '<div style="margin-bottom:14px;">'
        + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;"><span style="font-weight:600;">' + labels[i] + '</span><span>' + c + drop + '</span></div>'
        + '<div style="background:rgba(255,255,255,0.12);height:24px;"><div style="background:var(--yellow);height:24px;width:' + w + '%;min-width:2px;"></div></div>'
        + '</div>';
    }
    const conv = top ? ((n[4] / top) * 100).toFixed(1) : '0';
    html += '<p style="margin-top:18px;font-size:14px;"><strong>Overall conversion:</strong> ' + conv + '% of booking-page visitors complete a booking.</p>';
    html += '<p style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:8px;">Counts are unique sessions that reached each step.</p></div>';
  }

  // Exit-survey: why visitors leave (and what offer would have won them).
  // The section ALWAYS renders: when there is no data yet it explains how the
  // survey works instead of silently vanishing (which read as "not recorded").
  const ex = (eres && !eres.error && eres.data) ? eres.data : [];
  const rl = { price: 'The price', dates: 'Dates did not work', more_info: 'Needed more info', confusing: 'Website was confusing', browsing: 'Just browsing' };
  if (!ex.length) {
    html += '<div style="max-width:680px;margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;">'
      + '<h3 style="font-family:var(--font-heading);font-size:20px;font-weight:900;margin-bottom:12px;">Why visitors leave</h3>'
      + '<p style="font-size:13px;color:rgba(255,255,255,0.55);line-height:1.7;">No exit answers recorded yet. The exit survey appears on DESKTOP only (a cursor leaving the top of the window is not a gesture on phones), after the visitor has been on the page 30 seconds and scrolled, at most once per session. A record is written the moment they tap a reason; the follow-up answer is saved with it.</p></div>';
  }
  if (ex.length) {
    const reasons = {}; const details = [];
    ex.forEach(r => {
      // new reason-tailored answers
      if (r.name === 'detail') { if (r.meta && r.meta.answer) details.push({ reason: r.meta.reason, answer: r.meta.answer }); }
      // older "what offer" answers (kept so existing data still shows)
      else if (r.name === 'offer_wish') { if (r.meta && r.meta.offer) details.push({ reason: r.meta.reason, answer: r.meta.offer }); }
      else if (r.name) reasons[r.name] = (reasons[r.name] || 0) + 1;
    });
    html += '<div style="max-width:680px;margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;">';
    html += '<h3 style="font-family:var(--font-heading);font-size:20px;font-weight:900;margin-bottom:12px;">Why visitors leave</h3>';
    const keys = Object.keys(reasons);
    if (keys.length) html += '<table style="width:100%;"><tbody>' + keys.map(k => '<tr><td style="padding:6px 0;">' + (rl[k] || esc(k)) + '</td><td style="text-align:right;font-weight:700;">' + reasons[k] + '</td></tr>').join('') + '</tbody></table>';
    if (details.length) {
      html += '<h4 style="font-family:var(--font-heading);font-size:16px;font-weight:900;margin:18px 0 8px;">What they told us</h4>';
      html += '<ul style="margin-left:18px;font-size:13px;color:rgba(255,255,255,0.7);line-height:1.8;list-style:none;padding-left:0;">'
        + details.slice(0, 50).map(d => '<li style="margin-bottom:7px;"><span style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:var(--yellow);">' + esc(rl[d.reason] || d.reason || 'Other') + '</span><br>' + esc(d.answer) + '</li>').join('')
        + '</ul>';
    }
    html += '</div>';
  }

  // A/B test: which welcome offer wins the most emails
  const ab = (ares && !ares.error && ares.data) ? ares.data : [];
  if (ab.length) {
    const exp = {}, conv = {};
    ab.forEach(r => {
      if (!r.variant) return;
      if (r.name === 'exposure') exp[r.variant] = (exp[r.variant] || 0) + 1;
      else if (r.name === 'conversion') conv[r.variant] = (conv[r.variant] || 0) + 1;
    });
    const vl = { pct15: '15% off', pickup: 'Free airport pickup', pack: 'Free welcome pack' };
    // The pickup and welcome-pack variants are RETIRED (the popup always shows
    // the 15% member voucher now), so only live offers appear here.
    const RETIRED = ['pickup', 'pack'];
    const variants = Array.from(new Set(Object.keys(exp).concat(Object.keys(conv)))).filter(v => RETIRED.indexOf(v) < 0);
    html += '<div style="max-width:680px;margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;">';
    html += '<h3 style="font-family:var(--font-heading);font-size:20px;font-weight:900;margin-bottom:12px;">Welcome offer performance</h3>';
    html += '<table style="width:100%;font-size:13px;"><thead><tr><th style="text-align:left;padding-bottom:6px;">Offer</th><th style="text-align:right;">Shown</th><th style="text-align:right;">Emails</th><th style="text-align:right;">Rate</th></tr></thead><tbody>';
    let best = null;
    variants.forEach(v => {
      const e = exp[v] || 0, c = conv[v] || 0, rate = e ? (c / e * 100) : 0;
      if (e > 0 && (best === null || rate > best.rate)) best = { v: v, rate: rate };
      html += '<tr><td style="padding:6px 0;">' + (vl[v] || esc(v)) + '</td><td style="text-align:right;">' + e + '</td><td style="text-align:right;">' + c + '</td><td style="text-align:right;font-weight:700;">' + rate.toFixed(1) + '%</td></tr>';
    });
    html += '</tbody></table>';
    if (best && best.rate > 0) html += '<p style="margin-top:10px;font-size:13px;"><strong>Conversion to email:</strong> ' + best.rate.toFixed(1) + '% of visitors who see the offer claim it.</p>';
    html += '<p style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:6px;">The welcome popup now always shows the 15% member voucher; the early A/B variants (airport pickup, welcome pack) were retired.</p>';
    html += '</div>';
  }

  // Demand signals: which not-yet-offered services guests want most (market validation)
  const prefs = (pres && !pres.error && pres.data) ? pres.data : [];
  if (prefs.length) {
    const demand = {}, perfects = [];
    prefs.forEach(r => {
      const m = r.meta || {};
      (m.wishlist || []).forEach(s => { demand[s] = (demand[s] || 0) + 1; });
      if (m.perfect) perfects.push(m.perfect);
    });
    const ranked = Object.keys(demand).sort((a, b) => demand[b] - demand[a]);
    html += '<div style="max-width:680px;margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;">';
    html += '<h3 style="font-family:var(--font-heading);font-size:20px;font-weight:900;margin-bottom:6px;">Demand signals (what to build next)</h3>';
    html += '<p style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:12px;">Services guests asked us to add, ranked. This is market validation before you spend a dong.</p>';
    if (ranked.length) {
      const maxD = demand[ranked[0]] || 1;
      html += ranked.map(s => {
        const c = demand[s], w = Math.round((c / maxD) * 100);
        return '<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span style="font-weight:600;">' + esc(s) + '</span><span>' + c + '</span></div><div style="background:rgba(255,255,255,0.12);height:18px;"><div style="background:var(--terracotta);height:18px;width:' + w + '%;min-width:2px;"></div></div></div>';
      }).join('');
    }
    if (perfects.length) {
      html += '<h4 style="font-family:var(--font-heading);font-size:16px;font-weight:900;margin:18px 0 8px;">What would make their stay perfect</h4>';
      html += '<ul style="margin-left:18px;font-size:13px;color:rgba(255,255,255,0.7);line-height:1.7;">' + perfects.slice(0, 40).map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>';
    }
    html += '</div>';
  }
  wrap.innerHTML = html;
}
window.renderFunnel = renderFunnel;

// ── MAGAZINE CMS ──
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escAttr = escHtml;

function renderMagazineList() {
  const wrap = document.getElementById('mag-list');
  if (!wrap) return;
  if (!_adminView) { wrap.innerHTML = LOCKED_NOTE; return; }
  if (!window.ipartmentMagazine) {
    wrap.innerHTML = '<p style="color:rgba(255,255,255,0.5);">Article data file not loaded.</p>';
    return;
  }
  const all = window.ipartmentMagazine.getAllForAdmin();
  if (!all.length) {
    wrap.innerHTML = '<p style="color:rgba(255,255,255,0.5);">No articles. Click "Add new article" to create one.</p>';
    return;
  }
  // Sort: featured first, then user-added, then defaults
  all.sort((a, b) => {
    const aF = (a.featured === true || a.category === 'featured') ? 0 : 1;
    const bF = (b.featured === true || b.category === 'featured') ? 0 : 1;
    if (aF !== bF) return aF - bF;
    if (a._kind === 'user' && b._kind === 'default') return -1;
    if (a._kind === 'default' && b._kind === 'user') return 1;
    return 0;
  });

  wrap.innerHTML = all.map(a => {
    const kindPill = a._kind === 'user' ? '<span class="mag-kind-pill user">Custom</span>' : '<span class="mag-kind-pill default">Default</span>';
    const hiddenPill = a._hidden ? '<span class="mag-kind-pill hidden">Hidden</span>' : '';
    const featuredPill = (a.featured === true || a.category === 'featured') ? '<span class="mag-kind-pill featured">Featured</span>' : '';
    const isExternal = a.url && /^https?:\/\//.test(a.url);
    const cat = a.tag || a.category || '';
    return `
      <div class="mag-row ${a._hidden ? 'is-hidden' : ''}">
        <div class="thumb" style="background-image:url('${escAttr(a.image)}');"></div>
        <div class="info">
          <div class="tag-row">
            ${kindPill}
            ${featuredPill}
            ${hiddenPill}
            <span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--gray-mid);">${escHtml(cat)}</span>
          </div>
          <div class="title">${escHtml(a.title)}</div>
          <div class="meta">
            ${a.date ? '<span>' + escHtml(a.date) + '</span>' : ''}
            ${a.source ? '<span>' + escHtml(a.source) + '</span>' : ''}
            ${isExternal ? '<a href="' + escAttr(a.url) + '" target="_blank" rel="noopener" class="url-link">View link &#8599;</a>' : ''}
          </div>
        </div>
        <div class="actions">
          ${a._hidden
            ? `<button class="restore" onclick="restoreArticle('${escAttr(a.id)}')">Show again</button>`
            : `<button onclick="editArticle('${escAttr(a.id)}')">Edit</button>
               <button class="danger" onclick="removeArticle('${escAttr(a.id)}')">${a._kind === 'user' ? 'Delete' : 'Hide'}</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

window.openArticleEditor = function(article) {
  document.getElementById('art-id').value = (article && article.id) || '';
  document.getElementById('art-title').value = (article && article.title) || '';
  document.getElementById('art-excerpt').value = (article && article.excerpt) || '';
  document.getElementById('art-category').value = (article && article.category) || 'local';
  document.getElementById('art-date').value = (article && article.date) || '';
  document.getElementById('art-url').value = (article && article.url) || '';
  document.getElementById('art-source').value = (article && article.source) || '';
  document.getElementById('art-tag').value = (article && article.tag) || '';
  document.getElementById('art-image').value = (article && article.image) || '';
  document.getElementById('art-keywords').value = (article && article.keywords) || '';
  document.getElementById('art-featured').checked = !!(article && (article.featured === true || article.category === 'featured'));
  document.getElementById('art-modal-title').textContent = article ? 'Edit article' : 'Add new article';
  refreshImagePreview();
  document.getElementById('art-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeArticleEditor = function() {
  document.getElementById('art-modal').classList.remove('open');
  document.body.style.overflow = '';
};

window.editArticle = function(id) {
  const a = window.ipartmentMagazine.getById(id);
  if (a) window.openArticleEditor(a);
};

window.removeArticle = function(id) {
  const a = window.ipartmentMagazine.getById(id);
  if (!a) return;
  const isDefault = a._kind === 'default';
  const msg = isDefault
    ? `Hide "${a.title}" from the magazine page? (You can show it again later.)`
    : `Delete "${a.title}" permanently?`;
  if (!confirm(msg)) return;
  const res = window.ipartmentMagazine.remove(id);
  window.ipartmentToast(res.mode === 'deleted' ? 'Article deleted.' : 'Article hidden.');
  renderMagazineList();
};

window.restoreArticle = function(id) {
  window.ipartmentMagazine.restoreDefault(id);
  window.ipartmentToast('Article restored.');
  renderMagazineList();
};

function refreshImagePreview() {
  const url = document.getElementById('art-image').value.trim();
  const prev = document.getElementById('art-image-preview');
  if (url) {
    prev.style.backgroundImage = `url('${url.replace(/'/g, "\\'")}')`;
    prev.style.display = 'block';
  } else {
    prev.style.display = 'none';
  }
}

document.addEventListener('input', e => {
  if (e.target && e.target.id === 'art-image') refreshImagePreview();
});

document.addEventListener('click', e => {
  if (e.target && e.target.id === 'art-close') window.closeArticleEditor();
  if (e.target && e.target.id === 'art-modal') window.closeArticleEditor();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('art-modal').classList.contains('open')) window.closeArticleEditor();
});

document.getElementById('art-form').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('art-id').value.trim();
  const data = {
    title: document.getElementById('art-title').value.trim(),
    excerpt: document.getElementById('art-excerpt').value.trim(),
    category: document.getElementById('art-category').value,
    date: document.getElementById('art-date').value.trim(),
    url: document.getElementById('art-url').value.trim(),
    source: document.getElementById('art-source').value.trim(),
    tag: document.getElementById('art-tag').value.trim(),
    image: document.getElementById('art-image').value.trim(),
    keywords: document.getElementById('art-keywords').value.trim(),
    featured: document.getElementById('art-featured').checked,
  };
  // Auto-set tag from category if blank
  if (!data.tag) {
    data.tag = { local: 'Local Guide', regional: 'Regional', business: 'Business', news: 'News', featured: 'Featured' }[data.category] || 'Article';
  }
  if (!data.title || !data.excerpt || !data.image) {
    window.ipartmentToast('Title, excerpt and image URL are required.');
    return;
  }
  if (id) {
    window.ipartmentMagazine.update(id, data);
    window.ipartmentToast('Article updated.');
  } else {
    window.ipartmentMagazine.add(data);
    window.ipartmentToast('Article added.');
  }
  window.closeArticleEditor();
  renderMagazineList();
});

(async function initAdmin() {
  // Gate ON, account-based: a signed-in admin sees the dashboard; everyone
  // else is sent to My Account to log in (admins get back here via the Admin
  // tab there). The real protection stays in the database (RLS); this page
  // simply has nothing to show a non-admin.
  let redirected = false;
  async function gate() {
    let admin = false;
    try { admin = await Auth.isAdmin(); } catch (e) {}
    if (admin) { showDash(); }
    else if (!redirected) { redirected = true; sendToAccount(); }
  }
  await gate();
  // Re-check on auth changes so logging out mid-session leaves the page.
  try { Auth.onChange(function () { gate(); }); } catch (e) {}
})();
