/* Booking page logic - 5-step flow with live pricing + CRM */
(function() {
  'use strict';

  const RATES = {
    XS: { nightly:1200000, weekly:980000,  monthly:750000,  name:'Compact Studio',     size:'25-30 m2', maxGuests:4 },
    S:  { nightly:1650000, weekly:1350000, monthly:1050000, name:'Standard Studio',    size:'35-40 m2', maxGuests:4 },
    M:  { nightly:2100000, weekly:1750000, monthly:1350000, name:'Spacious Apartment', size:'45-55 m2', maxGuests:6 },
    L:  { nightly:2800000, weekly:2300000, monthly:1800000, name:'Long-Stay Suite',    size:'65-75 m2', maxGuests:8 },
  };

  // Percent lookup for known codes (used as a fallback when a voucher row has no
  // parseable discount). Validation is account-based: a code only applies if it
  // exists as an active voucher in the logged-in user's account. The discount is
  // a percent off the room subtotal (after the length-of-stay rate); add-ons are
  // never discounted.
  const VOUCHERS = {
    WELCOME15: { percent: 15, label: '15% off your first stay' }
  };

  // Public welcome codes handed out by the homepage popup (A/B test) and the
  // finder. These redeem for ANY guest at checkout, no account needed, so the
  // voucher the popup promises is actually usable. Percent codes discount the
  // room subtotal; "freeExtra" codes make the named add-on free (its price is
  // added then subtracted, so the perk shows on the receipt and the total nets
  // out). Account-bound vouchers still work through the existing chip/lookup path.
  const WELCOME_CODES = {
    WELCOME15:   { percent: 15,          label: '15% off your first stay' },
    STAY20:      { percent: 20,          label: '20% off your stay' },
    WELCOMERIDE: { freeExtra: 'airport', label: 'Free airport pickup' },
    WELCOMEPACK: { freeExtra: 'welcome', label: 'Free welcome pack' },
    EARLYBIRD:   { freeExtra: 'early',   label: 'Free early check-in' },
    SAVE500:     { flat: 500000,         label: '500,000 VND off' }
  };

  // The voucher wallet shown in the picker (showcase: every guest "has" these).
  // Each code MUST exist in WELCOME_CODES above so it actually redeems.
  // Order matters (this is the on-screen order). The two percent "Member"
  // vouchers require a logged-in account and are mutually exclusive (group
  // "discount"); the rest stack freely. Every badge reads "01 available" (the
  // quantity the guest holds), the discount itself is in the title/description.
  const WALLET = [
    { code: 'WELCOME15',   icon: '🎁', title: 'Welcome 15',     desc: '15% off your first stay',       badge: '01 available', tag: 'Member', requiresLogin: true, group: 'discount' },
    { code: 'STAY20',      icon: '🏷️', title: 'Long-stay 20', desc: '20% off your room total',   badge: '01 available', tag: 'Member', requiresLogin: true, group: 'discount' },
    { code: 'SAVE500',     icon: '💸', title: '500K off',       desc: '500,000 VND off your stay',      badge: '01 available' },
    { code: 'WELCOMERIDE', icon: '✈️', title: 'Airport pickup', desc: 'Free pickup from Tan Son Nhat',  badge: '01 available' },
    { code: 'WELCOMEPACK', icon: '🎉', title: 'Welcome pack',   desc: 'Local snacks and a SIM, on us',  badge: '01 available' },
    { code: 'EARLYBIRD',   icon: '🌅', title: 'Early check-in', desc: 'Free early check-in from 09:00', badge: '01 available' }
  ];
  function walletItem(code) { return WALLET.find(function (w) { return w.code === code; }); }
  var _walletLoggedIn = false;   // resolved when the wallet opens, used by the toggle

  // Single source of truth for how much a voucher takes off. Used by the glass
  // receipt, the legacy sidebar and the saved booking so they never disagree.
  // How much a SINGLE voucher takes off.
  function singleVoucherDiscount(v, roomSubtotal) {
    if (!v) return 0;
    if (v.percent) return Math.round(roomSubtotal * v.percent / 100);
    if (v.freeExtra) {
      const ex = state.extras.find(x => x.key === v.freeExtra);
      return ex ? ex.price : 0;   // only discounts when that add-on is in the order
    }
    if (v.flat) return v.flat;
    return 0;
  }
  // Total from ALL applied vouchers, capped so the booking total never goes below zero.
  function voucherDiscountFor(roomSubtotal) {
    let disc = 0;
    (state.vouchers || []).forEach(v => { disc += singleVoucherDiscount(v, roomSubtotal); });
    return Math.min(disc, roomSubtotal + state.extrasTotal);
  }
  // Build a voucher object from a known code.
  function voucherObjFromCode(code) {
    const wc = WELCOME_CODES[code];
    if (!wc) return null;
    if (wc.freeExtra) return { code: code, freeExtra: wc.freeExtra, label: wc.label };
    if (wc.flat) return { code: code, flat: wc.flat, label: wc.label };
    return { code: code, percent: wc.percent, label: wc.label };
  }
  // Replace the applied set with these codes (the wallet "Apply selected").
  // Enforces group exclusivity: at most one voucher per group (e.g. one percent
  // discount), so two discounts can never both land.
  function setVoucherCodes(codes) {
    state.vouchers = [];
    const groupsUsed = {};
    (codes || []).forEach(code => {
      const w = walletItem(code);
      if (w && w.group) { if (groupsUsed[w.group]) return; groupsUsed[w.group] = true; }
      const v = voucherObjFromCode(code);
      if (!v) return;
      if (v.freeExtra) ensureExtraSelected(v.freeExtra);
      state.vouchers.push(v);
    });
    reconcileVoucherExtras();
    updateSidebar();
  }
  // Add one voucher to the applied set (dedup by code). Used by the typed input
  // and account chips so they stack alongside wallet picks. Honors group
  // exclusivity: adding a discount-group voucher drops any other in that group.
  function addVoucher(v) {
    if (!v || state.vouchers.some(x => x.code === v.code)) return;
    const w = walletItem(v.code);
    if (w && w.group) {
      state.vouchers = state.vouchers.filter(function (x) { const xw = walletItem(x.code); return !(xw && xw.group === w.group); });
    }
    if (v.freeExtra) ensureExtraSelected(v.freeExtra);
    state.vouchers.push(v);
    updateSidebar();
  }

  // Ensure an add-on is selected (used when a "free extra" voucher is applied so
  // the perk appears in the order and can be subtracted). Mirrors toggleExtra.
  function ensureExtraSelected(key) {
    if (state.extras.some(x => x.key === key)) return;
    const card = document.querySelector('.extra-card[data-extra="' + key + '"]');
    if (!card) return;
    card.classList.add('selected');
    const price = parseInt(card.dataset.price, 10) || 0;
    const nameEl = card.querySelector('.extra-name');
    // viaVoucher: this add-on was added BY a free-extra voucher, so it is removed
    // again if that voucher is removed (a manually-picked add-on has no such flag).
    state.extras.push({ key: key, name: nameEl ? nameEl.textContent : key, price: price, viaVoucher: true });
    state.extrasTotal = state.extras.reduce((s, x) => s + x.price, 0);
  }

  // Drop any voucher-added add-on that is no longer backed by a selected free-extra
  // voucher, so clearing such a voucher also clears the add-on it brought in.
  function reconcileVoucherExtras() {
    const covered = state.vouchers.filter(v => v.freeExtra).map(v => v.freeExtra);
    state.extras = state.extras.filter(x => {
      if (x.viaVoucher && covered.indexOf(x.key) === -1) {
        const card = document.querySelector('.extra-card[data-extra="' + x.key + '"]');
        if (card) card.classList.remove('selected');
        return false;
      }
      return true;
    });
    state.extrasTotal = state.extras.reduce((s, x) => s + x.price, 0);
  }

  function extraName(key) {
    const el = document.querySelector('.extra-card[data-extra="' + key + '"] .extra-name');
    return el ? el.textContent.toLowerCase() : 'add-on';
  }

  const TODAY = new Date(); TODAY.setHours(0,0,0,0);
  const BOOKED_DATES = new Set();

  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const M_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const formatDate = d => `${d.getDate()} ${M_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  const formatVND = n => n.toLocaleString('vi-VN') + ' VND';

  const _p = new URLSearchParams(window.location.search);
  const _parseDate = s => { if(!s) return null; const d=new Date(s); d.setHours(0,0,0,0); return isNaN(d)?null:d; };

  const state = {
    room: ['XS','S','M','L'].includes(_p.get('room')) ? _p.get('room') : 'XS',
    checkin: _parseDate(_p.get('ci')),
    checkout: _parseDate(_p.get('co')),
    selectingCheckin: true,
    nights: 0,
    totalPrice: 0,
    extrasTotal: 0,
    appliedRate: 'nightly',
    guests: parseInt(_p.get('guests'), 10) || 1,
    extras: [],
    vouchers: [],         // applied vouchers: [{ code, percent|freeExtra|flat, label, id? }]
    voucherDiscount: 0,
    calMonthOffset: 0,    // single-month calendar navigation
  };
  window.state = state; // exposed for other helpers if needed

  // ============================================================
  // CINEMATIC SHELL: scenes + bottom controls + glass receipt
  // The live form/pricing logic below is unchanged; these helpers drive the
  // new visual shell (booking-v2.css + booking.html) around it.
  // ============================================================
  var cur = 1;
  var SCENE_NAMES = ['The Room', 'The Dates', 'The Extras', 'The Guest', 'The Welcome'];
  var NUMERALS = ['I', 'II', 'III', 'IV', 'V'];
  var SHORT_NAMES = { XS: 'Compact', S: 'Standard', M: 'Spacious', L: 'Long-Stay' };
  var fmtInt = function (n) { return Math.round(n).toLocaleString('vi-VN'); };

  function updateControls() {
    var set = function (id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };
    set('psCur', cur);
    set('psName', SCENE_NAMES[cur - 1]);
    set('navChap', NUMERALS[cur - 1]);
    set('navChapName', SCENE_NAMES[cur - 1]);
    var pbar = document.getElementById('pbar'); if (pbar) pbar.style.setProperty('--p', (cur / 5) * 100 + '%');
    var back = document.getElementById('btnBack'); if (back) back.disabled = (cur === 1);
    var controls = document.getElementById('controls');
    var receipt = document.getElementById('receipt');
    var next = document.getElementById('btnNext');
    if (cur === 5) {
      if (controls) controls.style.display = 'none';
      if (receipt) receipt.style.display = 'none';
    } else {
      if (controls) controls.style.display = '';
      if (receipt) receipt.style.display = '';
      if (next) {
        next.innerHTML = (cur === 4) ? 'Confirm my reservation &rarr;' : 'Continue &rarr;';
        next.disabled = (cur === 2 && (!state.checkin || !state.checkout));
      }
    }
  }

  // Mirror the live pricing into the sticky glass receipt (the visible sidebar).
  function updateReceipt() {
    var r = RATES[state.room];
    var setT = function (id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };
    var nm = document.getElementById('rcName'); if (nm) nm.innerHTML = 'The <em>' + SHORT_NAMES[state.room] + '</em>';
    setT('rcMeta', state.room + ' · ' + r.size.replace('m2', 'm²') + ' · up to ' + r.maxGuests + ' guests');
    setT('rcGv', state.guests);
    setT('rcArrival', state.checkin ? formatDate(state.checkin) : 'Select date');
    setT('rcDeparture', state.checkout ? formatDate(state.checkout) : 'Select date');
    setT('rcNights', state.nights || '-');
    var lines = document.getElementById('rcLines');
    var total = null;
    if (state.checkin && state.checkout && state.nights > 0) {
      var rate, label = '', pct = 0;
      if (state.nights >= 28) { rate = r.monthly; label = 'Monthly tier'; pct = Math.round((1 - r.monthly / r.nightly) * 100); }
      else if (state.nights >= 7) { rate = r.weekly; label = 'Weekly tier'; pct = Math.round((1 - r.weekly / r.nightly) * 100); }
      else { rate = r.nightly; }
      var subtotal = rate * state.nights;
      var vDisc = voucherDiscountFor(subtotal);
      total = subtotal + state.extrasTotal - vDisc;
      var html = '<div class="l"><span>' + fmtInt(rate) + ' × ' + state.nights + ' night' + (state.nights > 1 ? 's' : '') + '</span><span class="v">' + fmtInt(subtotal) + '</span></div>';
      if (pct > 0) html += '<div class="l disc"><span>' + label + ' unlocked</span><span class="v">-' + pct + '%</span></div>';
      if (state.extrasTotal > 0) html += '<div class="l"><span>Add-ons</span><span class="v">+ ' + fmtInt(state.extrasTotal) + '</span></div>';
      (state.vouchers || []).forEach(function (v) { var d = singleVoucherDiscount(v, subtotal); if (d > 0) { var vlabel = v.label || ('Voucher ' + v.code); html += '<div class="l disc"><span>' + vlabel + '</span><span class="v">-' + fmtInt(d) + '</span></div>'; } });
      if (lines) lines.innerHTML = html;
    } else if (lines) {
      lines.innerHTML = '<div class="l"><span>Select your dates</span><span class="v">-</span></div>';
    }
    var rt = document.getElementById('rcTotal');
    if (rt) {
      rt.textContent = (total != null) ? fmtInt(total) : '-';
      if (total != null) { rt.classList.remove('pulse'); void rt.offsetWidth; rt.classList.add('pulse'); setTimeout(function () { rt.classList.remove('pulse'); }, 320); }
    }
  }

  window.bookingNext = function () { if (cur === 4) { window.submitBooking(); } else { window.goToStep(cur + 1); } };
  window.bookingBack = function () { window.goToStep(cur - 1); };
  window.calNav = function (dir) {
    var off = (state.calMonthOffset || 0) + dir;
    if (off < 0) off = 0; if (off > 11) off = 11;
    state.calMonthOffset = off;
    buildCalendars();
  };

  // ============================================================
  // LIVE AVAILABILITY (real booked dates from Supabase)
  // Reads the public apartment_availability view (room + dates only, no guest
  // data) and blocks the booked nights per room in the calendar. A booking from
  // checkin to checkout occupies the nights checkin..(checkout - 1); the checkout
  // day itself stays open for a new arrival (standard hotel turnover).
  // ============================================================
  var AVAIL = {}; // room -> [{ checkin, checkout }]
  function applyRoomAvailability() {
    BOOKED_DATES.clear();
    var ranges = AVAIL[state.room] || [];
    ranges.forEach(function (rg) {
      var d = new Date(rg.checkin + 'T00:00:00');
      var end = new Date(rg.checkout + 'T00:00:00');
      if (isNaN(d) || isNaN(end)) return;
      while (d < end) { BOOKED_DATES.add(dateKey(d)); d.setDate(d.getDate() + 1); }
    });
  }
  function loadAvailability() {
    if (!window.sb) return;
    window.sb.from('apartment_availability').select('room,checkin,checkout').then(function (res) {
      if (res.error || !res.data) return;
      AVAIL = {};
      res.data.forEach(function (row) {
        if (!row.room || !row.checkin || !row.checkout) return;
        (AVAIL[row.room] = AVAIL[row.room] || []).push({ checkin: row.checkin, checkout: row.checkout });
      });
      applyRoomAvailability();
      buildCalendars();
    }, function () { /* offline or blocked: leave the calendar fully open */ });
  }

  // --- Functional micro-interactions + mobile sticky booking bar (booking mode) ---
  function shakeField(el, markInvalid) {
    if (!el) return;
    if (markInvalid && el.classList && el.classList.contains('form-input')) el.classList.add('invalid');
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
    setTimeout(function () { el.classList.remove('shake'); }, 450);
  }
  // Set the sidebar total and pulse it when the figure actually changes.
  function setSidebarTotal(text) {
    var el = document.getElementById('sb-total');
    if (!el) return;
    var changed = el.textContent !== text;
    el.textContent = text;
    if (changed) { el.classList.remove('price-pulse'); void el.offsetWidth; el.classList.add('price-pulse'); setTimeout(function () { el.classList.remove('price-pulse'); }, 480); }
  }
  function activeForwardBtn() {
    var panel = document.querySelector('.step-panel.active');
    return panel ? panel.querySelector('.btn-next') : null;
  }
  function stickyStepLabel() {
    var panel = document.querySelector('.step-panel.active');
    var id = panel ? panel.id : '';
    if (id === 'panel-4') return 'Confirm booking';
    return 'Continue';
  }
  function updateStickyBar() {
    var bar = document.getElementById('stickyBookBar');
    if (!bar || bar.getAttribute('data-sticky-mode') !== 'booking') return;
    var panel = document.querySelector('.step-panel.active');
    if ((panel && panel.id === 'panel-5') || window.__bookingDone) {
      bar.classList.remove('is-visible'); bar.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('has-sticky-bar');
      return;
    }
    var amountEl = document.getElementById('stickyBookAmount');
    var cta = document.getElementById('stickyBookCta');
    var wrap = document.getElementById('sb-pricing-wrap');
    var totalTxt = (document.getElementById('sb-total') || {}).textContent || '';
    var hasTotal = wrap && wrap.style.display !== 'none' && totalTxt && totalTxt !== '-';
    if (amountEl) amountEl.textContent = hasTotal ? totalTxt : 'Select dates';
    if (cta) {
      var fwd = activeForwardBtn();
      cta.textContent = stickyStepLabel();
      cta.disabled = !!(fwd && fwd.disabled);
    }
  }
  window.__updateStickyBar = updateStickyBar;
  function bindStickyBar() {
    var bar = document.getElementById('stickyBookBar');
    if (!bar || bar.getAttribute('data-sticky-mode') !== 'booking') return;
    var cta = document.getElementById('stickyBookCta');
    if (cta) cta.addEventListener('click', function () {
      var fwd = activeForwardBtn();
      if (fwd && !fwd.disabled) fwd.click();
      if (window.ipartmentTrack) window.ipartmentTrack('funnel', 'sticky_cta_click', { meta: { path: location.pathname } });
    });
    function onScroll() {
      if (window.__bookingDone) { updateStickyBar(); return; }
      if (window.scrollY > 260) { bar.classList.add('is-visible'); bar.setAttribute('aria-hidden', 'false'); document.body.classList.add('has-sticky-bar'); }
      else { bar.classList.remove('is-visible'); bar.setAttribute('aria-hidden', 'true'); document.body.classList.remove('has-sticky-bar'); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    updateStickyBar();
  }

  window.goToStep = function(n) {
    if (n < 1 || n > 5) return;
    if (n >= 3 && (!state.checkin || !state.checkout)) return;
    cur = n;
    document.querySelectorAll('.scene').forEach(function (s) { s.classList.toggle('active', +s.dataset.scene === n); });
    updateControls();
    // Every chapter starts at its top: reset the scene's own scroll (scenes
    // scroll internally on desktop) and the page scroll (mobile).
    var sc = document.querySelector('.scene[data-scene="' + n + '"]');
    if (sc) sc.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Tuck the mobile receipt sheet away between chapters.
    var rec = document.getElementById('receipt');
    if (rec) rec.classList.remove('sheet-open');
    if (window.ipartmentTrack) window.ipartmentTrack('funnel', 'step_' + n, { meta: { room: state.room, nights: state.nights } });
  };

  window.selectRoom = function(btn) {
    document.querySelectorAll('.room-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.room = btn.dataset.room;
    // Re-point the calendar to this room's real booked dates.
    applyRoomAvailability();
    // If the current selection now overlaps a booked night for this room, clear it.
    if (state.checkin && state.checkout) {
      var cdt = new Date(state.checkin), conflict = false;
      while (cdt < state.checkout) { if (BOOKED_DATES.has(dateKey(cdt))) { conflict = true; break; } cdt.setDate(cdt.getDate() + 1); }
      if (conflict) {
        state.checkin = null; state.checkout = null; state.nights = 0; state.totalPrice = 0; state.selectingCheckin = true;
        if (window.ipartmentToast) window.ipartmentToast('Those dates are booked for the ' + state.room + ' apartment. Please pick new dates.');
      }
    }
    const maxG = RATES[state.room].maxGuests;
    if (state.guests > maxG) state.guests = maxG;
    document.getElementById('guest-count-display').textContent = state.guests;
    document.getElementById('guest-max-hint').textContent = `Max ${maxG} for ${state.room}`;
    updateRateTiers();
    updateSidebar();
    if (state.checkin && state.checkout) recalcPricing();
    buildCalendars();
  };

  function updateRateTiers() {
    const r = RATES[state.room];
    document.getElementById('selected-room-label').textContent = `${state.room} - ${r.name}`;
    const tiers = [
      { label:'1-6 nights', price:r.nightly, unit:'per night', active:state.nights<7 && state.nights>0 },
      { label:'7-27 nights', price:r.weekly, unit:'per night', sub:`Save ${Math.round((1-r.weekly/r.nightly)*100)}%`, active:state.nights>=7 && state.nights<28 },
      { label:'28+ nights', price:r.monthly, unit:'per night', sub:`Save ${Math.round((1-r.monthly/r.nightly)*100)}%`, active:state.nights>=28 },
    ];
    document.getElementById('rate-tiers-display').innerHTML = tiers.map(t => `
      <div class="rate-tier ${t.active?'active':''}">
        <div class="rate-tier-label">${t.label}</div>
        <div class="rate-tier-price">${formatVND(t.price)}</div>
        <div class="rate-tier-unit">${t.unit}</div>
        ${t.sub ? `<div style="font-size:11px;color:var(--green);font-weight:700;margin-top:4px;">${t.sub}</div>` : ''}
      </div>
    `).join('');
  }

  // Single month with prev/next nav (fits the narrow cinematic glass panel).
  function buildCalendars() {
    const container = document.getElementById('calendar-container');
    if (!container) return;
    const base = new Date(TODAY.getFullYear(), TODAY.getMonth() + (state.calMonthOffset || 0), 1);
    container.innerHTML = '';
    container.appendChild(buildMonth(base));
  }

  function buildMonth(firstDay) {
    const year = firstDay.getFullYear(), month = firstDay.getMonth();
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const dayNames = ['M','T','W','T','F','S','S'];
    const div = document.createElement('div');
    div.className = 'cal-month';
    const off = state.calMonthOffset || 0;
    const atMin = off <= 0, atMax = off >= 11;
    let html = '<div class="cal-head"><div class="m">' + monthNames[month] + ' <em>' + year + '</em></div>'
      + '<div class="arrows">'
      + '<span ' + (atMin ? 'style="opacity:0.25;pointer-events:none;"' : 'onclick="calNav(-1)"') + '>&lsaquo;</span>'
      + '<span ' + (atMax ? 'style="opacity:0.25;pointer-events:none;"' : 'onclick="calNav(1)"') + '>&rsaquo;</span>'
      + '</div></div><div class="cal">';
    dayNames.forEach(d => html += `<div class="cal-lbl">${d}</div>`);
    let startDay = firstDay.getDay(); startDay = startDay === 0 ? 6 : startDay - 1;
    for (let i = 0; i < startDay; i++) html += `<div class="cal-day cal-empty"></div>`;
    const daysInMonth = new Date(year, month+1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day); d.setHours(0,0,0,0);
      const key = dateKey(d);
      const isPast = d < TODAY;
      const isBooked = BOOKED_DATES.has(key);
      const isToday = d.getTime() === TODAY.getTime();
      const isCI = state.checkin && d.getTime() === state.checkin.getTime();
      const isCO = state.checkout && d.getTime() === state.checkout.getTime();
      const inRange = state.checkin && state.checkout && d > state.checkin && d < state.checkout;
      let cls = 'cal-day';
      if (isToday) cls += ' today';
      if (isPast) cls += ' dis';
      else if (isBooked) cls += ' booked';
      else {
        if (isCI) cls += ' in';
        if (isCO) cls += ' out';
        if (inRange) cls += ' range';
      }
      const clickable = !isPast && !isBooked;
      html += `<div class="${cls}" ${clickable ? `onclick="onDayClick('${key}')"` : ''}>${day}</div>`;
    }
    // Pad to a full 6-week grid (42 cells) so every month is the same height
    // and the prev/next arrows never jump when navigating.
    const totalCells = startDay + daysInMonth;
    for (let i = totalCells; i < 42; i++) html += '<div class="cal-day cal-empty"></div>';
    html += '</div>';
    div.innerHTML = html;
    return div;
  }

  window.onDayClick = function(key) {
    const d = new Date(key); d.setHours(0,0,0,0);
    if (state.selectingCheckin || !state.checkin) {
      state.checkin = d; state.checkout = null; state.selectingCheckin = false;
      document.getElementById('avail-notice').style.display = 'none';
    } else {
      if (d <= state.checkin) { state.checkin = d; state.checkout = null; buildCalendars(); updateSidebar(); return; }
      let hasBooked = false; const cur = new Date(state.checkin); cur.setDate(cur.getDate()+1);
      while (cur < d) { if (BOOKED_DATES.has(dateKey(cur))) { hasBooked = true; break; } cur.setDate(cur.getDate()+1); }
      if (hasBooked) {
        document.getElementById('avail-notice').style.display = 'block';
        state.checkout = null; buildCalendars(); updateSidebar(); return;
      }
      state.checkout = d; state.selectingCheckin = true;
      recalcPricing();
      document.getElementById('btn-step2-next').disabled = false;
    }
    buildCalendars(); updateSidebar();
  };

  function recalcPricing() {
    if (!state.checkin || !state.checkout) return;
    const nights = Math.round((state.checkout - state.checkin) / 86400000);
    state.nights = nights;
    const r = RATES[state.room];
    let ratePerNight, tierLabel, discountPct = 0;
    if (nights >= 28) { ratePerNight = r.monthly; tierLabel = 'Monthly rate (28+ nights)'; discountPct = Math.round((1-r.monthly/r.nightly)*100); state.appliedRate = 'monthly'; }
    else if (nights >= 7) { ratePerNight = r.weekly; tierLabel = 'Weekly rate (7+ nights)'; discountPct = Math.round((1-r.weekly/r.nightly)*100); state.appliedRate = 'weekly'; }
    else { ratePerNight = r.nightly; tierLabel = 'Standard nightly rate'; state.appliedRate = 'nightly'; }
    const subtotal = ratePerNight * nights;
    const fullPrice = r.nightly * nights;
    const saving = fullPrice - subtotal;
    state.totalPrice = subtotal;

    let rows = `
      <div class="pricing-row"><span>${formatVND(ratePerNight)} x ${nights} night${nights>1?'s':''}</span><span>${formatVND(subtotal)}</span></div>
      <div class="pricing-row" style="font-size:12px;color:#888;"><span>${tierLabel}</span><span></span></div>
    `;
    if (saving > 0) rows += `<div class="pricing-row discount"><span>Discount (${discountPct}% off)</span><span>-${formatVND(saving)}</span></div>`;
    rows += `<div class="pricing-row total"><span>Total</span><span>${formatVND(subtotal)}</span></div>`;
    document.getElementById('pricing-rows').innerHTML = rows;
    document.getElementById('date-pricing-panel').style.display = 'block';

    const savingsMsg = document.getElementById('savings-msg');
    if (saving > 0) { savingsMsg.style.display = 'block'; savingsMsg.textContent = `You are saving ${formatVND(saving)} compared to the standard nightly rate.`; }
    else if (nights >= 5) {
      savingsMsg.style.display = 'block'; savingsMsg.style.background='#fffde7'; savingsMsg.style.borderColor='#fef08a'; savingsMsg.style.color='#713f12';
      savingsMsg.textContent = `Tip: stay ${7-nights} more night${7-nights>1?'s':''} to unlock the weekly rate and save ${Math.round((1-r.weekly/r.nightly)*100)}%.`;
    } else { savingsMsg.style.display = 'none'; }
    updateRateTiers(); updateSidebar();
  }

  window.changeBookingGuests = function(delta) {
    const maxG = RATES[state.room].maxGuests;
    state.guests = Math.max(1, Math.min(maxG, state.guests + delta));
    document.getElementById('guest-count-display').textContent = state.guests;
    updateSidebar();
  };

  window.toggleExtra = function(card) {
    card.classList.toggle('selected');
    const extra = card.dataset.extra;
    const price = parseInt(card.dataset.price, 10);
    if (card.classList.contains('selected')) {
      state.extras.push({ key: extra, name: card.querySelector('.extra-name').textContent, price });
    } else {
      state.extras = state.extras.filter(x => x.key !== extra);
    }
    state.extrasTotal = state.extras.reduce((s, x) => s + x.price, 0);
    updateSidebar();
  };

  function showPromoMsg(text, ok) {
    const msg = document.getElementById('promo-msg');
    if (!msg) return;
    msg.textContent = text;
    msg.style.display = text ? 'block' : 'none';
    msg.className = ok ? 'promo-ok' : 'promo-err';
  }

  // Apply a promo code. Vouchers are account-bound: a code only works if it
  // exists as an active voucher in the logged-in user's account. The database
  // RLS already scopes voucher reads to the owner, so a code you do not own is
  // simply never found. Called by the Apply button (no args) or a voucher chip
  // (code, voucherId, percent).
  window.applyPromo = async function(codeArg, voucherId, percentArg) {
    const input = document.getElementById('promo-input');
    const code = (codeArg || (input ? input.value : '') || '').trim().toUpperCase();
    if (!code) { showPromoMsg('Enter a promo code.', false); return; }

    // Public welcome codes (from the homepage popup / finder) redeem for everyone,
    // no account required. A voucher chip passes voucherId, so only treat a code
    // as a public welcome code when it is NOT coming from an account chip.
    if (!voucherId && WELCOME_CODES[code]) {
      if (state.vouchers.some(v => v.code === code)) { showPromoMsg(code + ' is already applied.', true); return; }
      const wm = walletItem(code);
      if (wm && wm.requiresLogin) {
        const u = window.ipartmentAuth ? await window.ipartmentAuth.getUser() : null;
        if (!u) {
          const pm = document.getElementById('promo-msg');
          if (pm) { pm.style.display = 'block'; pm.className = 'promo-err'; pm.innerHTML = 'Please <a href="#" onclick="window.ipartmentOpenAuth(\'login\');return false;">log in or create an account</a> to use this voucher.'; }
          return;
        }
      }
      const wc = WELCOME_CODES[code];
      addVoucher(voucherObjFromCode(code));   // also selects the free add-on and refreshes the receipt
      if (input) input.value = '';
      if (wc.freeExtra) showPromoMsg(code + ' added: your ' + extraName(wc.freeExtra) + ' is on us.', true);
      else if (wc.flat) showPromoMsg(code + ' added: ' + formatVND(wc.flat) + ' off your stay.', true);
      else showPromoMsg(code + ' added: ' + wc.percent + '% off your stay.', true);
      return;
    }

    // Must be logged in - vouchers live in your account
    const user = window.ipartmentAuth ? await window.ipartmentAuth.getUser() : null;
    if (!user) {
      const msg = document.getElementById('promo-msg');
      if (msg) {
        msg.style.display = 'block'; msg.className = 'promo-err';
        msg.innerHTML = 'Vouchers are saved to your account. <a href="#" onclick="window.ipartmentOpenAuth(\'login\');return false;">Log in</a> to use one.';
      }
      return;
    }

    // A chip passed its own voucher id (already known to belong to this account).
    // Otherwise look the code up among this account's active vouchers.
    let match = null;
    if (voucherId) {
      const pct = parseInt(percentArg, 10) || (VOUCHERS[code] && VOUCHERS[code].percent) || 0;
      if (pct) match = { id: voucherId, code, percent: pct };
    } else {
      // Scoped to THIS user's vouchers explicitly. RLS already does this for
      // normal accounts, but an admin can read every voucher, so without the
      // filter an admin would match (and later consume) someone else's row.
      const res = await window.sb.from('vouchers').select('id,code,discount,status').eq('status', 'active').eq('code', code).eq('user_id', user.id);
      if (!res.error && res.data && res.data.length) {
        const v = res.data[0];
        const pct = parseInt((v.discount || '').replace(/[^0-9]/g, ''), 10) || (VOUCHERS[v.code] && VOUCHERS[v.code].percent) || 0;
        if (pct) match = { id: v.id, code: v.code, percent: pct };
      }
    }

    if (!match) {
      showPromoMsg('That code is not in your account.', false);
      return;
    }
    if (state.vouchers.some(v => v.code === match.code)) { showPromoMsg(match.code + ' is already applied.', true); return; }
    addVoucher({ code: match.code, percent: match.percent, id: match.id });
    if (input) input.value = '';
    showPromoMsg(match.code + ' added: ' + match.percent + '% off your stay.', true);
  };

  window.removePromo = function() {
    state.vouchers = [];
    reconcileVoucherExtras();
    const input = document.getElementById('promo-input');
    if (input) input.value = '';
    showPromoMsg('', true);
    updateSidebar();
  };

  // ---- Voucher wallet picker -----------------------------------------------
  // A tappable menu of the vouchers the guest holds, so they pick one instead of
  // typing a code. Every code routes through applyPromo, so all of them redeem.
  function voucherWalletEsc(e) { if (e.key === 'Escape') window.closeVoucherWallet(); }
  // From the member-voucher notice: close the wallet and pop the sign-in modal in
  // place, so the guest never leaves the booking (no lost progress).
  window.voucherLoginPrompt = function() {
    window.closeVoucherWallet();
    if (window.ipartmentOpenAuth) window.ipartmentOpenAuth('login');
    else if (window.ipartmentToast) window.ipartmentToast('Sign in from the menu to use member vouchers.');
  };
  function updateWalletApplyCount() {
    var n = document.querySelectorAll('#voucher-overlay .voucher-card.selected').length;
    var btn = document.querySelector('#voucher-overlay .voucher-apply-btn');
    if (btn) btn.textContent = n ? ('Apply ' + n + ' voucher' + (n > 1 ? 's' : '')) : 'Apply';
  }
  window.toggleWalletCard = function(btn) {
    var code = btn.getAttribute('data-code');
    var item = walletItem(code) || {};
    // Member vouchers need a logged-in account: show the inline red notice and
    // do not select (so a logged-out guest cannot apply them).
    if (item.requiresLogin && !_walletLoggedIn) { btn.classList.add('show-notice'); return; }
    var willSelect = !btn.classList.contains('selected');
    if (willSelect && item.group) {
      // mutual exclusivity: only one voucher per group (e.g. one percent discount)
      [].forEach.call(document.querySelectorAll('#voucher-overlay .voucher-card.selected[data-group="' + item.group + '"]'), function(c) { if (c !== btn) c.classList.remove('selected'); });
    }
    btn.classList.remove('show-notice');
    btn.classList.toggle('selected');
    updateWalletApplyCount();
  };
  window.clearWalletSelection = function() {
    [].forEach.call(document.querySelectorAll('#voucher-overlay .voucher-card.selected'), function(c) { c.classList.remove('selected'); });
    updateWalletApplyCount();
  };
  window.applyWalletSelection = function() {
    var sel = document.querySelectorAll('#voucher-overlay .voucher-card.selected');
    var codes = [].map.call(sel, function(c) { return c.getAttribute('data-code'); });
    setVoucherCodes(codes);   // replaces the applied set with the chosen vouchers; all redeem
    showPromoMsg(codes.length ? (codes.length + ' voucher' + (codes.length > 1 ? 's' : '') + ' applied.') : 'Vouchers cleared.', true);
    window.closeVoucherWallet();
  };
  window.openVoucherWallet = async function() {
    if (document.getElementById('voucher-overlay')) return;
    try { _walletLoggedIn = !!(window.ipartmentAuth && await window.ipartmentAuth.getUser()); } catch (e) { _walletLoggedIn = false; }
    var applied = (state.vouchers || []).map(function(v) { return v.code; });
    var cards = WALLET.map(function(v) {
      var on = applied.indexOf(v.code) > -1;
      var attrs = 'data-code="' + v.code + '"' + (v.group ? ' data-group="' + v.group + '"' : '');
      return '<button type="button" class="voucher-card' + (on ? ' selected' : '') + '" ' + attrs + ' onclick="toggleWalletCard(this)">'
        + '<span class="vc-row">'
        + '<span class="vc-check" aria-hidden="true"></span>'
        + '<span class="vc-icon">' + v.icon + '</span>'
        + '<span class="vc-text"><span class="vc-title">' + v.title + (v.tag ? ' <span class="vc-tag">' + v.tag + '</span>' : '') + '</span>'
        + '<span class="vc-desc">' + v.desc + '</span></span>'
        + '<span class="vc-badge">' + v.badge + '</span>'
        + '</span>'
        + (v.requiresLogin ? '<span class="vc-notice">Please <span class="vc-notice-link" onclick="event.stopPropagation();voucherLoginPrompt()">log in or create an account</span> to use this voucher.</span>' : '')
        + '</button>';
    }).join('');
    var html = '<div class="voucher-overlay" id="voucher-overlay" role="dialog" aria-modal="true" aria-label="Your vouchers">'
      + '<div class="voucher-modal">'
      + '<button class="voucher-close" type="button" aria-label="Close" onclick="closeVoucherWallet()">&times;</button>'
      + '<div class="voucher-head"><h3>Your vouchers</h3><p>Pick the ones you want, then apply. The two member discounts cannot be combined.</p></div>'
      + '<div class="voucher-list">' + cards + '</div>'
      + '<div class="voucher-foot"><button type="button" class="voucher-clear" onclick="clearWalletSelection()">Clear</button><button type="button" class="voucher-apply-btn" onclick="applyWalletSelection()">Apply</button></div>'
      + '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    var ov = document.getElementById('voucher-overlay');
    requestAnimationFrame(function() { ov.classList.add('open'); });
    setTimeout(function() { ov.classList.add('open'); }, 60);
    ov.addEventListener('click', function(e) { if (e.target === ov) window.closeVoucherWallet(); });
    document.addEventListener('keydown', voucherWalletEsc);
    updateWalletApplyCount();
  };
  window.closeVoucherWallet = function() {
    var ov = document.getElementById('voucher-overlay');
    if (!ov) return;
    ov.classList.remove('open');
    document.removeEventListener('keydown', voucherWalletEsc);
    setTimeout(function() { if (ov && ov.parentNode) ov.remove(); }, 300);
  };

  // The voucher UI is the WALLET ("Choose from my vouchers" -> glass panel).
  // The old inline chip list that used to render under the button is gone: it
  // duplicated the wallet, looked off-brand, and (queried without a user filter)
  // showed an admin viewer every account's vouchers in the system.

  function updateSidebar() {
    const r = RATES[state.room];
    document.getElementById('sb-room').textContent = state.room;
    document.getElementById('sb-room-name').textContent = `${r.name} - ${r.size}`;
    document.getElementById('sb-guests').textContent = state.guests + (state.guests === 1 ? ' guest' : ' guests');

    document.getElementById('sb-checkin').textContent = state.checkin ? formatDate(state.checkin) : '-';

    if (state.checkout) {
      document.getElementById('sb-checkout').textContent = formatDate(state.checkout);
      document.getElementById('sb-nights-badge').textContent = `${state.nights} night${state.nights>1?'s':''} - ${state.room}`;
      let ratePerNight, label, discountPct = 0;
      if (state.nights >= 28) { ratePerNight = r.monthly; label = 'Monthly rate'; discountPct = Math.round((1-r.monthly/r.nightly)*100); }
      else if (state.nights >= 7) { ratePerNight = r.weekly; label = 'Weekly rate'; discountPct = Math.round((1-r.weekly/r.nightly)*100); }
      else { ratePerNight = r.nightly; label = 'Nightly rate'; }
      document.getElementById('sb-rate').textContent = formatVND(ratePerNight);
      document.getElementById('sb-nights-label').textContent = `x ${state.nights} night${state.nights>1?'s':''}`;
      document.getElementById('sb-subtotal').textContent = formatVND(ratePerNight * state.nights);
      // Voucher: percent off the room subtotal only (add-ons excluded)
      const voucherRow = document.getElementById('sb-voucher-row');
      state.voucherDiscount = voucherDiscountFor(state.totalPrice);
      if (state.vouchers.length && state.voucherDiscount > 0 && voucherRow) {
        voucherRow.style.display = 'flex';
        const vlabel = state.vouchers.length === 1 ? (state.vouchers[0].label || `Voucher ${state.vouchers[0].code}`) : `${state.vouchers.length} vouchers`;
        document.getElementById('sb-voucher-label').textContent = vlabel;
        document.getElementById('sb-voucher-val').textContent = '-' + formatVND(state.voucherDiscount);
      } else if (voucherRow) {
        voucherRow.style.display = 'none';
      }
      const grandTotal = state.totalPrice + state.extrasTotal - state.voucherDiscount;
      setSidebarTotal(formatVND(grandTotal));
      const discRow = document.getElementById('sb-discount-row');
      if (discountPct > 0) {
        discRow.style.display = 'flex';
        document.getElementById('sb-discount-label').textContent = `${label} (-${discountPct}%)`;
        document.getElementById('sb-discount-val').textContent = `-${formatVND((r.nightly - ratePerNight) * state.nights)}`;
      } else discRow.style.display = 'none';
      const extrasRow = document.getElementById('sb-extras-row');
      if (state.extrasTotal > 0) {
        extrasRow.style.display = 'flex';
        document.getElementById('sb-extras-val').textContent = '+ ' + formatVND(state.extrasTotal);
      } else extrasRow.style.display = 'none';
      document.getElementById('sb-pricing-wrap').style.display = 'block';
      document.getElementById('sb-empty-msg').style.display = 'none';
      const badge = document.getElementById('sb-tier-badge');
      if (state.nights >= 28) { badge.style.display = 'block'; badge.textContent = `Monthly rate applied - saving ${discountPct}% vs standard.`; }
      else if (state.nights >= 7) { badge.style.display = 'block'; badge.textContent = `Weekly rate applied - saving ${discountPct}% vs standard.`; }
      else badge.style.display = 'none';
    } else {
      document.getElementById('sb-checkout').textContent = 'Select check-out';
      document.getElementById('sb-nights-badge').textContent = 'Check-out not selected';
      state.voucherDiscount = 0;
      const voucherRow = document.getElementById('sb-voucher-row');
      if (voucherRow) voucherRow.style.display = 'none';
    }
    if (window.__updateStickyBar) window.__updateStickyBar();
    updateReceipt();
    updateControls();
  }

  // Entry point from the "Confirm Booking Request" button. Validates the inline
  // form (name + email + terms). If the guest also ticked "save to an account",
  // create it first, then place the booking. The email is captured right on the
  // form, no popup and no second step.
  window.submitBooking = async function() {
    const val = id => { const el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
    const first = val('guest-first');
    const email = val('guest-email');
    const terms = document.getElementById('terms-check').checked;
    const showMsg = (t, ok) => {
      const el = document.getElementById('guest-msg');
      if (!el) { if (t) alert(t); return; }
      el.textContent = t || ''; el.style.display = t ? 'block' : 'none';
      el.style.color = ok ? '#166534' : '#c0392b';
    };

    // A failed check must be SEEN: scroll the offending field into the middle
    // of the screen and toast it. (Before this, the shake + message could
    // happen entirely off-screen, so tapping Confirm looked like it did
    // nothing, especially on phones.)
    const reveal = (el, msg) => {
      try { if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      if (msg && window.ipartmentToast) window.ipartmentToast(msg);
    };
    if (!state.checkin || !state.checkout) {
      if (window.ipartmentToast) window.ipartmentToast('Please choose your dates first.');
      window.goToStep(2);
      return;
    }
    if (!first) { showMsg('Please enter your first name.', false); shakeField(document.getElementById('guest-first'), true); reveal(document.getElementById('guest-first'), 'Please enter your first name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMsg('Please enter a valid email so we can send your confirmation.', false); shakeField(document.getElementById('guest-email'), true); reveal(document.getElementById('guest-email'), 'Please enter a valid email.'); return; }
    if (!terms) { showMsg('Please agree to the Terms and Conditions to proceed.', false); shakeField(document.querySelector('.terms'), false); reveal(document.querySelector('.terms'), 'Please tick the agreement box to confirm.'); return; }
    showMsg('');

    // Optional: create a free account during booking (inline, no popup).
    const makeAcct = document.getElementById('guest-make-acct');
    if (makeAcct && makeAcct.checked && window.ipartmentAuth) {
      const pass = val('guest-pass');
      if (pass.length < 8) { showMsg('Your password needs at least 8 characters, or untick the account box to book as a guest.', false); return; }
      const btn = document.getElementById('btnNext');
      const orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Creating account...'; }
      try {
        await window.ipartmentAuth.signUp({ firstName: first, lastName: '', email: email, phone: val('guest-phone'), password: pass });
        try { window.ipartmentCRM.add('users', { first: first, last: '', email: email, phone: val('guest-phone'), type: 'Account signup (booking)' }); } catch (_) {}
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = orig; }
        const m = (err && err.message) || '';
        if (/already registered|already exists|user already/i.test(m)) showMsg('That email already has an account. Untick the box to book as a guest, or log in first.', false);
        else showMsg(m || 'Could not create the account. Untick the box to book as a guest.', false);
        return;
      }
    }

    finalizeBooking();
  };

  function finalizeBooking() {
    const val = id => { const el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
    const first = val('guest-first');
    const last = val('guest-last');
    const email = val('guest-email');
    const phone = val('guest-phone');
    const nat = val('guest-nationality');
    const purpose = val('guest-purpose');
    const notes = val('guest-notes');

    const r = RATES[state.room];
    const voucherDiscount = voucherDiscountFor(state.totalPrice);
    const total = state.totalPrice + state.extrasTotal - voucherDiscount;
    const stamped = window.ipartmentCRM.add('bookings', {
      room: state.room, roomName: r.name, roomSize: r.size,
      checkin: dateKey(state.checkin), checkout: dateKey(state.checkout),
      nights: state.nights, guests: state.guests,
      rate: state.appliedRate, ratePerNight: state.totalPrice/state.nights,
      subtotal: state.totalPrice, extras: state.extras, extrasTotal: state.extrasTotal,
      voucherCode: state.vouchers.map(v => v.code).join(', '), voucherDiscount,
      total,
      guest: { first, last, email, phone, nationality: nat, purpose, notes },
      status: 'pending_confirmation'
    });
    window.ipartmentCRM.add('leads', {
      type: 'booking_request', email, phone, name: `${(first + ' ' + last).trim()}`, bookingRef: stamped.id
    });

    // Save EVERY booking to Supabase (the source of truth). Account holders get
    // their user_id; guests are stored with a null user_id and their contact in
    // guests_detail. Admins see all bookings either way.
    if (window.sb) {
      const appliedVouchers = state.vouchers.slice();
      // getProfile (not getUser) so the account's saved stay preference can be
      // stamped onto the booking row itself; profile.id is the auth user id.
      const getUser = window.ipartmentAuth ? window.ipartmentAuth.getProfile() : Promise.resolve(null);
      Promise.resolve(getUser).then(function (u) {
        window.sb.from('bookings').insert({
          user_id: u ? u.id : null,
          booking_ref: stamped.id,
          room: state.room,
          room_name: r.name,
          checkin: dateKey(state.checkin),
          checkout: dateKey(state.checkout),
          nights: state.nights,
          guests: state.guests,
          guests_detail: { name: (first + ' ' + last).trim(), email: email, phone: phone, nationality: nat, purpose: purpose, notes: notes, stay_preference: (u && u.stay_preference) || null },
          extras: state.extras,
          rate: state.appliedRate,
          subtotal: state.totalPrice,
          extras_total: state.extrasTotal,
          voucher_code: appliedVouchers.length ? appliedVouchers.map(v => v.code).join(', ') : null,
          voucher_discount: voucherDiscount,
          total: total,
          status: 'requested'
        }).then(function (res) {
          if (res.error) console.warn('[ipartment] booking save failed:', res.error.message);
        });
        // Mark any redeemed account vouchers as used
        if (u) {
          appliedVouchers.filter(function (v) { return v.id; }).forEach(function (av) {
            window.sb.from('vouchers').update({ status: 'used' }).eq('id', av.id).then(function (r2) {
              if (r2.error) console.warn('[ipartment] voucher mark-used failed:', r2.error.message);
            });
          });
        }
      });
    }

    const ref = stamped.id;
    document.getElementById('conf-ref').textContent = ref;
    document.getElementById('conf-email-display').textContent = email;
    document.getElementById('conf-details').innerHTML = `
      <div class="conf-row"><span class="cl">Reference</span><span class="cv">${ref}</span></div>
      <div class="conf-row"><span class="cl">Guest</span><span class="cv">${(first + ' ' + last).trim()}</span></div>
      <div class="conf-row"><span class="cl">Apartment</span><span class="cv">Category ${state.room} - ${r.name}</span></div>
      <div class="conf-row"><span class="cl">Check-in</span><span class="cv">${formatDate(state.checkin)}</span></div>
      <div class="conf-row"><span class="cl">Check-out</span><span class="cv">${formatDate(state.checkout)}</span></div>
      <div class="conf-row"><span class="cl">Duration</span><span class="cv">${state.nights} night${state.nights>1?'s':''}</span></div>
      <div class="conf-row"><span class="cl">Guests</span><span class="cv">${state.guests}</span></div>
      <div class="conf-row"><span class="cl">Rate applied</span><span class="cv">${state.appliedRate.charAt(0).toUpperCase()+state.appliedRate.slice(1)} rate</span></div>
      ${state.extras.length ? `<div class="conf-row"><span class="cl">Add-ons</span><span class="cv">${state.extras.map(x=>x.name).join(', ')}</span></div>` : ''}
      ${state.vouchers.length ? `<div class="conf-row"><span class="cl">Voucher${state.vouchers.length>1?'s':''}</span><span class="cv">${state.vouchers.map(v=>v.code).join(', ')} (-${formatVND(voucherDiscount)})</span></div>` : ''}
      <div class="conf-row"><span class="cl">Total</span><span class="cv">${formatVND(total)}</span></div>
      <div class="conf-row"><span class="cl">Contact</span><span class="cv">${email}</span></div>
    `;
    window.__bookingDone = true;
    window.goToStep(5);
    window.ipartmentToast('Booking request submitted!');
  };

  // If the visitor is signed in, prefill their contact details and skip the
  // guest email gate entirely - their email is already on file.
  async function prefillFromAccount() {
    if (!window.ipartmentAuth) return;
    let profile = null;
    try { profile = await window.ipartmentAuth.getProfile(); } catch (e) { return; }
    if (!profile) return; // guest - leave the compact form + popup gate as-is
    const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    set('guest-first', profile.first_name);
    set('guest-email', profile.email);
    set('guest-phone', profile.phone);
    // Stay preference sync, account -> booking: their saved default lands in the
    // "make your stay perfect" box ready to send (still editable), and the
    // "save as default" tick becomes available for the reverse direction.
    set('pref-perfect', profile.stay_preference);
    const defWrap = document.getElementById('pref-default-wrap');
    if (defWrap) defWrap.style.display = '';
    const banner = document.getElementById('guest-known');
    if (banner) {
      banner.style.display = 'block';
      banner.innerHTML = 'Booking as <strong>' + (profile.first_name || 'your account') + '</strong> (' + (profile.email || '') + ').';
    }
    const fields = document.getElementById('guest-fields'); if (fields) fields.style.display = 'none';
    const nudge = document.getElementById('guest-account-nudge'); if (nudge) nudge.style.display = 'none';
    const title = document.getElementById('guest-step-title'); if (title) title.textContent = 'Confirm your booking.';
    const sub = document.getElementById('guest-step-sub'); if (sub) sub.textContent = 'We have your details from your account. Review your stay and confirm.';
  }

  // Post-booking preference + demand form (zero-party data + market validation).
  // Captures arrival/drink/wishes and which not-yet-offered services they want.
  function initPrefForm() {
    const form = document.getElementById('pref-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const v = id => { const el = document.getElementById(id); return el ? (el.value || '').trim() : ''; };
      const wishlist = Array.prototype.map.call(document.querySelectorAll('#pref-wishlist input:checked'), c => c.value);
      const bookingRef = (document.getElementById('conf-ref') || {}).textContent || '';
      if (window.ipartmentTrack) {
        window.ipartmentTrack('preferences', 'submitted', { meta: { bookingRef: bookingRef, arrival: v('pref-arrival'), drink: v('pref-drink'), perfect: v('pref-perfect'), wishlist: wishlist } });
      }
      // Booking -> account sync: with the box ticked, this answer becomes the
      // saved default in Account Settings (and prefills the next booking).
      const tick = document.getElementById('pref-default-save');
      if (tick && tick.checked && window.ipartmentAuth && window.sb) {
        window.ipartmentAuth.getUser().then(function (u) {
          if (!u) return;
          return window.sb.from('profiles').update({ stay_preference: v('pref-perfect') }).eq('id', u.id);
        }).then(function (res) {
          if (res && !res.error && window.ipartmentToast) window.ipartmentToast('Saved as your default stay preference.');
        }).catch(function () {});
      }
      const msg = document.getElementById('pref-msg');
      if (msg) { msg.style.display = 'block'; msg.textContent = 'Thank you. We have noted this and your stay will be set up around it.'; }
      Array.prototype.forEach.call(form.elements, el => { el.disabled = true; });
    });
  }

  // On narrow screens the live receipt docks as a slim total bar above the
  // controls; tapping it expands the full breakdown as a bottom sheet.
  function initReceiptSheet() {
    const rec = document.getElementById('receipt');
    if (!rec) return;
    rec.addEventListener('click', function (e) {
      if (window.innerWidth > 1000) return;        // desktop: receipt floats, no sheet
      if (e.target.closest('a, button, input')) return;
      rec.classList.toggle('sheet-open');
    });
  }

  // Replace the two native selects on the confirmation form with glass
  // dropdowns (the native popup menu is unstylable browser chrome). The
  // hidden <select> stays as the value store so the submit code is untouched.
  function glassifySelect(sel) {
    if (!sel || sel._glass) return;
    sel._glass = true;
    const wrap = document.createElement('div');
    wrap.className = 'gsel';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'gsel-btn';
    btn.innerHTML = '<span class="gsel-label"></span><span class="gsel-chev">&#9662;</span>';
    wrap.appendChild(btn);
    const menu = document.createElement('div');
    menu.className = 'gsel-menu';
    wrap.appendChild(menu);
    const label = () => {
      const o = sel.options[sel.selectedIndex];
      btn.querySelector('.gsel-label').textContent = o ? o.text : '';
    };
    const rebuild = () => {
      menu.innerHTML = '';
      Array.prototype.forEach.call(sel.options, o => {
        const it = document.createElement('button');
        it.type = 'button';
        it.className = 'gsel-opt' + (o.value === sel.value ? ' active' : '');
        it.textContent = o.text;
        it.addEventListener('click', e => {
          e.stopPropagation();
          sel.value = o.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          label(); wrap.classList.remove('open');
        });
        menu.appendChild(it);
      });
    };
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (wrap.classList.contains('open')) { wrap.classList.remove('open'); return; }
      document.querySelectorAll('.gsel.open').forEach(g => g.classList.remove('open'));
      rebuild(); wrap.classList.add('open');
    });
    document.addEventListener('click', () => wrap.classList.remove('open'));
    // form.elements disabling (after the pref form submits) should grey the
    // visible button too
    new MutationObserver(() => { btn.disabled = sel.disabled; }).observe(sel, { attributes: true, attributeFilter: ['disabled'] });
    label();
  }

  // INIT
  document.addEventListener('DOMContentLoaded', () => {
    initReceiptSheet();
    glassifySelect(document.getElementById('pref-arrival'));
    glassifySelect(document.getElementById('pref-drink'));
    document.querySelectorAll('.room-btn').forEach(b => b.classList.toggle('selected', b.dataset.room === state.room));
    if (state.checkin && state.checkout && state.checkout > state.checkin) {
      const n = Math.round((state.checkout - state.checkin) / 86400000);
      state.nights = n;
      const r = RATES[state.room];
      if (n >= 28) { state.appliedRate = 'monthly'; state.totalPrice = r.monthly * n; }
      else if (n >= 7) { state.appliedRate = 'weekly'; state.totalPrice = r.weekly * n; }
      else { state.appliedRate = 'nightly'; state.totalPrice = r.nightly * n; }
      document.getElementById('btn-step2-next').disabled = false;
      setTimeout(() => window.goToStep(2), 0);
    }
    const maxG = RATES[state.room].maxGuests;
    document.getElementById('guest-max-hint').textContent = `Max ${maxG} for ${state.room}`;
    document.getElementById('guest-count-display').textContent = state.guests;
    buildCalendars();
    updateRateTiers();
    updateSidebar();
    if (state.checkin && state.checkout) { recalcPricing(); document.getElementById('date-pricing-panel').style.display = 'block'; }
    loadAvailability();
    prefillFromAccount();
    initPrefForm();
    bindStickyBar();
    ['guest-first', 'guest-email'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', function () { el.classList.remove('invalid'); });
    });

    // Optional account checkbox reveals the password field
    const makeAcct = document.getElementById('guest-make-acct');
    if (makeAcct) {
      makeAcct.addEventListener('change', function () {
        const pw = document.getElementById('guest-pass-wrap');
        if (pw) pw.style.display = makeAcct.checked ? 'block' : 'none';
      });
    }

    if (window.ipartmentTrack) window.ipartmentTrack('funnel', 'step_1', { meta: { room: state.room } });

    // Exit-intent: if a visitor moves to leave mid-booking, ask one kind question
    document.addEventListener('mouseout', function (e) {
      if (e.clientY <= 0 && !e.relatedTarget && !window.__bookingDone && window.ipartmentExitSurvey) {
        window.ipartmentExitSurvey('booking_exit');
      }
    });
  });
})();
