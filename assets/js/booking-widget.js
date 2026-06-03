/* ============================================================
   ipartment - Shared Booking Bar Widget
   Drop-in: <div data-booking-bar></div>
   Renders a sticky check-in/check-out + apartment + guests bar
   that links to results.html with URL params.
   ============================================================ */
(function() {
  'use strict';

  const APT_DATA = [
    {id:'XS', name:'Compact Studio',   size:'25-30 m²', price:'From 1,200,000 ₫', maxGuests:4},
    {id:'S',  name:'Standard Studio',  size:'35-40 m²', price:'From 1,650,000 ₫', maxGuests:4},
    {id:'M',  name:'Spacious Apartment', size:'45-55 m²', price:'From 2,100,000 ₫', maxGuests:6},
    {id:'L',  name:'Long-Stay Suite',    size:'65-75 m²', price:'From 2,800,000 ₫', maxGuests:8},
  ];
  window.ipartmentAPT = APT_DATA;

  const TODAY = new Date();
  TODAY.setHours(0,0,0,0);

  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function fmtShort(d) {
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d.getDate()} ${M[d.getMonth()]}`;
  }

  function renderBookingBar(host) {
    host.innerHTML = `
      <div class="booking-bar" data-booking-bar-root>
        <div class="booking-field" data-field="checkin">
          <label>Check-in</label>
          <span class="bf-val placeholder" data-bf-checkin>Select date</span>
          <div class="bb-dropdown" data-dd-date>
            <div class="mini-cal-wrap">
              <div class="mini-cal-header">
                <button type="button" class="mini-cal-nav" data-cal-prev>&#8249;</button>
                <span class="mini-cal-title" data-cal-title></span>
                <button type="button" class="mini-cal-nav" data-cal-next>&#8250;</button>
              </div>
              <div class="mini-grid" data-cal-grid></div>
            </div>
            <div class="promo-msg" data-promo-msg style="display:none;"></div>
            <div style="padding:0 20px 16px;">
              <button type="button" data-confirm-dates style="width:100%;background:var(--black-pure);color:var(--yellow);border:none;padding:11px;font-weight:700;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer;font-family:var(--font-body);">OK - Confirm Dates</button>
            </div>
          </div>
        </div>

        <div class="booking-field" data-field="checkout">
          <label>Check-out</label>
          <span class="bf-val placeholder" data-bf-checkout>Select date</span>
        </div>

        <div class="booking-field" data-field="apt">
          <label>Apartment Type</label>
          <span class="bf-val" data-bf-apt>XS - Compact Studio</span>
          <div class="bb-dropdown" data-dd-apt>
            <div class="apt-options" data-apt-options></div>
          </div>
        </div>

        <div class="booking-field" data-field="guests" style="border-right:none;">
          <label>Guests</label>
          <span class="bf-val" data-bf-guests>1 Guest</span>
          <div class="bb-dropdown dd-right" data-dd-guests>
            <div class="guest-wrap">
              <div class="guest-row">
                <div>
                  <div class="guest-label">Guests</div>
                  <div class="guest-sub" data-guest-sub>Max guests for this apartment</div>
                </div>
                <div class="guest-controls">
                  <button type="button" class="guest-btn" data-guest-minus>-</button>
                  <span class="guest-num" data-guest-count>1</span>
                  <button type="button" class="guest-btn" data-guest-plus>+</button>
                </div>
              </div>
              <button type="button" class="guest-apply" data-guest-apply>Apply</button>
              <div data-guest-upsell style="display:none;margin-top:10px;padding:8px 10px;background:#fff8e1;border-left:3px solid #FFED00;font-size:11px;font-weight:600;color:#7a5c00;line-height:1.5;"></div>
            </div>
          </div>
        </div>

        <button type="button" class="btn btn-primary" data-bb-search>Check my dates</button>
      </div>
    `;
  }

  function initBookingBar(host) {
    renderBookingBar(host);
    const state = {
      checkin: null,
      checkout: null,
      selecting: 'checkin',
      room: 'XS',
      guests: 1,
      calOffset: 0,
    };

    const $ = sel => host.querySelector(sel);
    const $$ = sel => host.querySelectorAll(sel);

    function closeDropdowns() {
      $$('.bb-dropdown').forEach(d => d.classList.remove('open'));
    }

    function toggleDropdown(name) {
      const sel = name === 'date' ? '[data-dd-date]' : name === 'apt' ? '[data-dd-apt]' : '[data-dd-guests]';
      const drop = $(sel);
      const isOpen = drop.classList.contains('open');
      closeDropdowns();
      if (!isOpen) {
        drop.classList.add('open');
        if (name === 'date') renderCal();
        if (name === 'apt') rebuildApt();
        if (name === 'guests') updateGuestSub();
      }
    }

    function renderCal() {
      const base = new Date(TODAY.getFullYear(), TODAY.getMonth() + state.calOffset, 1);
      const mNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const dNames = ['Mo','Tu','We','Th','Fr','Sa','Su'];
      $('[data-cal-title]').textContent = `${mNames[base.getMonth()]} ${base.getFullYear()}`;

      const grid = $('[data-cal-grid]');
      let html = dNames.map(d => `<div class="mini-day-lbl">${d}</div>`).join('');

      let startDay = base.getDay();
      startDay = startDay === 0 ? 6 : startDay - 1;
      for (let i = 0; i < startDay; i++) html += `<div class="mini-day md-empty"></div>`;

      const daysInMonth = new Date(base.getFullYear(), base.getMonth()+1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(base.getFullYear(), base.getMonth(), day);
        d.setHours(0,0,0,0);
        const isPast = d < TODAY;
        const isToday = d.getTime() === TODAY.getTime();
        const isCI = state.checkin && d.getTime() === state.checkin.getTime();
        const isCO = state.checkout && d.getTime() === state.checkout.getTime();
        const inRange = state.checkin && state.checkout && d > state.checkin && d < state.checkout;
        let cls = 'mini-day';
        if (isToday) cls += ' md-today';
        if (isPast) cls += ' md-disabled';
        else {
          if (isCI && isCO) cls += ' md-checkin md-checkout';
          else if (isCI) cls += ' md-checkin';
          else if (isCO) cls += ' md-checkout';
          else if (inRange) cls += ' md-inrange';
        }
        html += `<div class="${cls}" data-day="${isPast ? '' : dateKey(d)}">${day}</div>`;
      }
      grid.innerHTML = html;
      renderPromo();
    }

    function renderPromo() {
      const msg = $('[data-promo-msg]');
      if (!state.checkin || !state.checkout) { msg.style.display = 'none'; return; }
      const nights = Math.round((state.checkout - state.checkin) / 86400000);
      if (nights >= 28) {
        msg.style.display = 'block';
        msg.className = 'promo-msg unlocked';
        msg.innerHTML = "You've unlocked the 38% long-stay rate!";
      } else if (nights >= 7) {
        const left = 28 - nights;
        msg.style.display = 'block';
        msg.className = 'promo-msg unlocked';
        msg.innerHTML = '18% weekly rate unlocked! ' + left + ' more night' + (left===1?'':'s') + ' until 38% off.';
      } else {
        const toWeekly = 7 - nights;
        msg.style.display = 'block';
        msg.className = 'promo-msg nudge';
        msg.innerHTML = 'Add ' + toWeekly + ' more night' + (toWeekly===1?'':'s') + ' to unlock 18% off.';
      }
    }

    function onDayClick(key) {
      const d = new Date(key); d.setHours(0,0,0,0);
      if (state.selecting === 'checkin' || !state.checkin) {
        state.checkin = d; state.checkout = null; state.selecting = 'checkout';
      } else {
        if (d <= state.checkin) {
          state.checkin = d; state.checkout = null; state.selecting = 'checkout';
        } else {
          state.checkout = d; state.selecting = 'checkin';
        }
      }
      $('[data-bf-checkin]').textContent = state.checkin ? fmtShort(state.checkin) : 'Select date';
      $('[data-bf-checkin]').classList.toggle('placeholder', !state.checkin);
      $('[data-bf-checkout]').textContent = state.checkout ? fmtShort(state.checkout) : 'Select date';
      $('[data-bf-checkout]').classList.toggle('placeholder', !state.checkout);
      renderCal();
    }

    function rebuildApt() {
      const sel = APT_DATA.find(a => a.id === state.room);
      const others = APT_DATA.filter(a => a.id !== state.room);
      const container = $('[data-apt-options]');
      const html = [buildAptOpt(sel, true), '<div style="height:1px;background:#e5e5e5;margin:4px 0;"></div>']
        .concat(others.map(a => buildAptOpt(a, false))).join('');
      container.innerHTML = html;
      // Clamp guests
      const maxG = sel.maxGuests;
      if (state.guests > maxG) {
        state.guests = maxG;
        $('[data-guest-count]').textContent = state.guests;
        $('[data-bf-guests]').textContent = state.guests + (state.guests === 1 ? ' Guest' : ' Guests');
      }
      updateGuestSub();
    }

    function buildAptOpt(a, sel) {
      return `<div class="apt-opt${sel?' selected':''}" data-room="${a.id}">
        <div class="apt-opt-cat">${a.id}</div>
        <div class="apt-opt-info">
          <div class="apt-opt-name">${a.name}</div>
          <div class="apt-opt-size">${a.size} · up to ${a.maxGuests} guests</div>
        </div>
        <div class="apt-opt-price">${a.price}</div>
      </div>`;
    }

    function selectApt(roomId) {
      state.room = roomId;
      const a = APT_DATA.find(x => x.id === roomId);
      $('[data-bf-apt]').textContent = `${roomId} - ${a.name}`;
      rebuildApt();
      closeDropdowns();
    }

    function updateGuestSub() {
      const apt = APT_DATA.find(a => a.id === state.room);
      const maxG = apt ? apt.maxGuests : 4;
      $('[data-guest-sub]').textContent = 'Max ' + maxG + ' for this apartment';
      const hint = $('[data-guest-upsell]');
      if (state.guests >= maxG && state.room !== 'L') {
        const larger = (state.room === 'XS' || state.room === 'S') ? 'Apartment M or larger' : 'Suite L';
        const nextMax = (state.room === 'XS' || state.room === 'S') ? 6 : 8;
        hint.textContent = 'Need more space? Consider ' + larger + ' (up to ' + nextMax + ' guests).';
        hint.style.display = 'block';
      } else {
        hint.style.display = 'none';
      }
    }

    function changeGuests(delta) {
      const apt = APT_DATA.find(a => a.id === state.room);
      const maxG = apt ? apt.maxGuests : 4;
      state.guests = Math.max(1, Math.min(maxG, state.guests + delta));
      $('[data-guest-count]').textContent = state.guests;
      updateGuestSub();
    }

    function applyGuests() {
      $('[data-bf-guests]').textContent = state.guests + (state.guests === 1 ? ' Guest' : ' Guests');
      closeDropdowns();
    }

    function search() {
      const params = new URLSearchParams();
      params.set('room', state.room);
      params.set('guests', state.guests);
      if (state.checkin) params.set('ci', dateKey(state.checkin));
      if (state.checkout) params.set('co', dateKey(state.checkout));
      window.location.href = 'results.html?' + params.toString();
    }

    // Bind events (delegation)
    host.addEventListener('click', e => {
      const t = e.target;

      // Field click - open dropdown
      const field = t.closest('[data-field]');
      if (field && !t.closest('.bb-dropdown')) {
        const name = field.dataset.field;
        e.stopPropagation();
        if (name === 'checkin' || name === 'checkout') toggleDropdown('date');
        else if (name === 'apt') toggleDropdown('apt');
        else if (name === 'guests') toggleDropdown('guests');
        return;
      }

      // Cal nav
      if (t.matches('[data-cal-prev]')) { e.stopPropagation(); state.calOffset = Math.max(0, state.calOffset - 1); renderCal(); return; }
      if (t.matches('[data-cal-next]')) { e.stopPropagation(); state.calOffset = Math.min(11, state.calOffset + 1); renderCal(); return; }

      // Day click
      const day = t.closest('[data-day]');
      if (day && day.dataset.day) { e.stopPropagation(); onDayClick(day.dataset.day); return; }

      // Confirm dates
      if (t.matches('[data-confirm-dates]')) { e.stopPropagation(); closeDropdowns(); return; }

      // Apt option
      const aptOpt = t.closest('[data-room]');
      if (aptOpt && t.closest('[data-dd-apt]')) { e.stopPropagation(); selectApt(aptOpt.dataset.room); return; }

      // Guests
      if (t.matches('[data-guest-minus]')) { e.stopPropagation(); changeGuests(-1); return; }
      if (t.matches('[data-guest-plus]')) { e.stopPropagation(); changeGuests(1); return; }
      if (t.matches('[data-guest-apply]')) { e.stopPropagation(); applyGuests(); return; }

      // Dropdowns swallow clicks
      if (t.closest('.bb-dropdown')) { e.stopPropagation(); return; }

      // Search button
      if (t.matches('[data-bb-search]') || t.closest('[data-bb-search]')) { e.stopPropagation(); search(); return; }
    });

    document.addEventListener('click', () => closeDropdowns());

    // Initial render
    rebuildApt();
    updateGuestSub();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-booking-bar]').forEach(initBookingBar);
  });
})();
