/* Results page logic - search summary + room cards */
const ROOMS = [
  { id: 'XS', name: 'Compact Studio', size: '25-30 m²', maxGuests: 4, nightly: 1200000, weekly: 980000, monthly: 750000,
    desc: 'Compact and highly functional. Smart layout, custom-built workspace, kitchenette, premium bedding.',
    img: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=900&q=80',
    amenities: ['Workspace', 'Kitchenette', 'Wi-Fi 300 Mbps', 'Blackout curtains', 'Weekly cleaning'] },
  { id: 'S', name: 'Standard Studio', size: '35-40 m²', maxGuests: 4, badge: 'Popular',
    nightly: 1650000, weekly: 1350000, monthly: 1050000,
    desc: 'Proper seating and dining area. Full kitchen with oven and dishwasher. Built for mid-term stays.',
    img: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=900&q=80',
    amenities: ['Workspace alcove', 'Full kitchen', 'Smart TV', 'Bi-weekly cleaning', 'Window seat'] },
  { id: 'M', name: 'Spacious Apartment', size: '45-55 m²', maxGuests: 6,
    nightly: 2100000, weekly: 1750000, monthly: 1350000,
    desc: 'Designated zones for life. Work, cook, eat, rest. Bathtub plus walk-in rainfall shower.',
    img: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&q=80',
    amenities: ['Home office', 'Full kitchen + dishwasher', 'Bathtub', 'Smart home', 'Weekly + linen'] },
  { id: 'L', name: 'Long-Stay Suite', size: '65-75 m²', maxGuests: 8, badge: 'Best For Long-Stay',
    nightly: 2800000, weekly: 2300000, monthly: 1800000,
    desc: 'Separate bedroom, expansive living room, family-sized kitchen. Built for serious long-term living.',
    img: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=900&q=80',
    amenities: ['Separate bedroom', 'Family kitchen', 'Double bathroom', '2x weekly cleaning', 'Priority service'] },
];

const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const M_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const formatDate = d => `${d.getDate()} ${M_NAMES[d.getMonth()]} ${d.getFullYear()}`;
const formatVND = n => n.toLocaleString('vi-VN') + ' VND';
const _parseDate = s => { if(!s) return null; const d=new Date(s); d.setHours(0,0,0,0); return isNaN(d)?null:d; };

const params = new URLSearchParams(window.location.search);
const state = {
  checkin: _parseDate(params.get('ci')),
  checkout: _parseDate(params.get('co')),
  guests: parseInt(params.get('guests'), 10) || 1,
  preferRoom: params.get('room') || null,
  nights: 0,
  sort: 'recommended'
};
if (state.checkin && state.checkout) {
  state.nights = Math.round((state.checkout - state.checkin) / 86400000);
}

const ROOM_BY_ID = {}; ROOMS.forEach(r => { ROOM_BY_ID[r.id] = r; });
function roomLabel() {
  if (!state.preferRoom || !ROOM_BY_ID[state.preferRoom]) return 'Any size';
  return state.preferRoom + ' - ' + ROOM_BY_ID[state.preferRoom].name;
}

function renderSummary() {
  document.getElementById('sum-checkin').textContent = state.checkin ? formatDate(state.checkin) : 'Select dates';
  document.getElementById('sum-checkout').textContent = state.checkout ? formatDate(state.checkout) : 'Select dates';
  document.getElementById('sum-guests').textContent = state.guests + (state.guests === 1 ? ' guest' : ' guests');
  const rm = document.getElementById('sum-room'); if (rm) rm.textContent = roomLabel();
  document.getElementById('sum-nights').textContent = state.nights > 0 ? `${state.nights} night${state.nights>1?'s':''}` : 'No dates selected';
}

// Recompute everything after an edit on the search bar, and keep the URL in sync
// (so a refresh or share keeps the selection) without ever leaving the page.
function recompute() {
  state.nights = (state.checkin && state.checkout) ? Math.round((state.checkout - state.checkin) / 86400000) : 0;
  renderSummary(); renderNoDates(); renderTierInfo(); renderResults(); updateUrl();
}
function updateUrl() {
  const p = new URLSearchParams();
  if (state.checkin) p.set('ci', dateKey(state.checkin));
  if (state.checkout) p.set('co', dateKey(state.checkout));
  p.set('guests', state.guests);
  if (state.preferRoom) p.set('room', state.preferRoom);
  try { history.replaceState(null, '', 'results.html?' + p.toString()); } catch (e) {}
}

function renderNoDates() {
  const el = document.getElementById('no-dates-section');
  if (state.nights === 0) {
    el.innerHTML = `<div class="no-dates-banner"><p>You have not selected dates yet. Showing standard nightly rates. <strong>Pick your dates</strong> to unlock the weekly (18% off) and monthly (38% off) rates.</p><button type="button" onclick="document.getElementById('field-checkin').click()">Pick dates</button></div>`;
  } else el.innerHTML = '';
}

function renderTierInfo() {
  const el = document.getElementById('tier-info-section');
  if (state.nights === 0) { el.innerHTML = ''; return; }
  if (state.nights >= 28) {
    el.innerHTML = `<div class="tier-info"><div class="tier-info-icon">&#127881;</div><div class="tier-info-text"><strong>Monthly rate unlocked</strong>. Your selected stay (${state.nights} nights) qualifies for up to 38% off our standard rate, applied automatically below.</div></div>`;
  } else if (state.nights >= 7) {
    const remaining = 28 - state.nights;
    el.innerHTML = `<div class="tier-info"><div class="tier-info-icon">&#10003;</div><div class="tier-info-text"><strong>Weekly rate unlocked (18% off)</strong>. Add ${remaining} more night${remaining>1?'s':''} to unlock the monthly rate (38% off).</div></div>`;
  } else {
    const remaining = 7 - state.nights;
    el.innerHTML = `<div class="tier-info"><div class="tier-info-icon">&#128161;</div><div class="tier-info-text"><strong>Tip:</strong> Stay ${remaining} more night${remaining>1?'s':''} to unlock the weekly rate (18% off) automatically.</div></div>`;
  }
}

function applicableRate(room) {
  if (state.nights >= 28) return { rate: room.monthly, tier: 'monthly', discount: Math.round((1-room.monthly/room.nightly)*100) };
  if (state.nights >= 7) return { rate: room.weekly, tier: 'weekly', discount: Math.round((1-room.weekly/room.nightly)*100) };
  return { rate: room.nightly, tier: 'nightly', discount: 0 };
}

function renderResults() {
  let rooms = ROOMS.filter(r => r.maxGuests >= state.guests);
  if (state.sort === 'price-asc') rooms.sort((a,b) => a.nightly - b.nightly);
  else if (state.sort === 'price-desc') rooms.sort((a,b) => b.nightly - a.nightly);
  else if (state.sort === 'size') rooms.sort((a,b) => parseInt(b.size) - parseInt(a.size));
  else if (state.preferRoom) {
    rooms = rooms.sort((a, b) => (a.id === state.preferRoom ? -1 : b.id === state.preferRoom ? 1 : 0));
  }

  const sub = document.getElementById('results-sub');
  if (state.nights > 0) sub.textContent = `${rooms.length} apartments available for ${state.nights} night${state.nights>1?'s':''}, ${state.guests} guest${state.guests>1?'s':''}`;
  else sub.textContent = `${rooms.length} apartments available. Pick dates to see total pricing`;

  if (!rooms.length) {
    document.getElementById('results-list').innerHTML = `<div class="empty"><div class="ico">&#128269;</div><h3>No matches for <em>${state.guests} guests</em></h3><p>Try reducing your guest count above, or contact us for custom options.</p><button type="button" class="btn btn-primary" onclick="document.getElementById('field-guests').click()">Adjust guests</button></div>`;
    return;
  }

  document.getElementById('results-list').innerHTML = rooms.map(r => {
    const { rate, tier, discount } = applicableRate(r);
    const total = state.nights > 0 ? rate * state.nights : null;
    const fullPrice = state.nights > 0 ? r.nightly * state.nights : null;
    return `
      <div class="room-result-card">
        <div class="room-img-block">
          <img src="${r.img}" alt="${r.name}" />
          ${r.badge ? `<span class="room-img-badge">${r.badge}</span>` : ''}
          <div class="room-img-size">${r.size}. Up to ${r.maxGuests} guests</div>
        </div>
        <div class="room-body">
          <div class="room-cat">${r.id}</div>
          <div class="room-name">${r.name}</div>
          ${discount > 0 ? `<div class="room-promo-line">${discount}% off, ${tier} rate applied</div>` : ''}
          <p class="room-desc">${r.desc}</p>
          <div class="room-amenities">
            ${r.amenities.map(a => `<span class="amenity-tag">${a}</span>`).join('')}
          </div>
          <div class="room-footer">
            <div class="room-pricing">
              <div class="rate-label">${state.nights > 0 ? `${tier === 'monthly' ? 'Monthly' : tier === 'weekly' ? 'Weekly' : 'Nightly'} rate per night` : 'Standard nightly'}</div>
              <div class="rate-main">${formatVND(rate)}</div>
              ${total !== null ? `
                <div class="rate-total">Total: ${formatVND(total)}</div>
                ${fullPrice && fullPrice > total ? `<div class="rate-original">${formatVND(fullPrice)}</div>` : ''}
                ${discount > 0 ? `<div class="rate-discount">Save ${discount}%</div>` : ''}
              ` : '<div class="rate-unit">+ longer stay discounts</div>'}
            </div>
            <div>
              <a href="booking.html?room=${r.id}${state.checkin ? `&ci=${dateKey(state.checkin)}` : ''}${state.checkout ? `&co=${dateKey(state.checkout)}` : ''}&guests=${state.guests}" class="btn-book">Book my stay</a>
              <a href="accommodation.html#${r.id.toLowerCase()}" class="btn-details">View Full Details</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.sortResults = function(s) {
  state.sort = s;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === s));
  renderResults();
};

// ============================================================
// EDITABLE SEARCH BAR - dates calendar, guests, room - all inline, the guest
// never leaves the page. The calendar uses a FIXED 6-week (42-cell) grid so its
// height never changes (the prev/next arrows do not jump), it does NOT auto-close
// after the second pick, and it commits only on Confirm.
// ============================================================
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const calState = { month: null, tempCi: null, tempCo: null };

function closePop() {
  const pop = document.getElementById('summary-pop');
  if (pop) { pop.hidden = true; pop.innerHTML = ''; pop.removeAttribute('data-kind'); }
  document.querySelectorAll('.summary-field.active').forEach(f => f.classList.remove('active'));
  document.removeEventListener('mousedown', outsideClose, true);
}
function outsideClose(e) {
  const strip = document.getElementById('summary-strip');
  if (strip && !strip.contains(e.target)) closePop();
}
function openPop(kind, field) {
  const pop = document.getElementById('summary-pop');
  if (!pop) return;
  if (!pop.hidden && pop.dataset.kind === kind) { closePop(); return; }
  document.querySelectorAll('.summary-field.active').forEach(f => f.classList.remove('active'));
  if (field) field.classList.add('active');
  pop.dataset.kind = kind;
  if (kind === 'dates') { calState.tempCi = state.checkin; calState.tempCo = state.checkout; calState.month = startMonth(); pop.innerHTML = calendarHtml(); paintCalendar(); }
  else if (kind === 'guests') pop.innerHTML = guestsHtml();
  else if (kind === 'room') pop.innerHTML = roomHtml();
  pop.hidden = false;
  setTimeout(() => document.addEventListener('mousedown', outsideClose, true), 0);
}

function startMonth() {
  const d = state.checkin ? new Date(state.checkin) : new Date(TODAY);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function calendarHtml() {
  return '<div class="cal-pop">'
    + '<div class="cal-head"><button type="button" class="cal-nav" data-cal="prev" aria-label="Previous month">&#8249;</button>'
    + '<span class="cal-title" id="cal-title"></span>'
    + '<button type="button" class="cal-nav" data-cal="next" aria-label="Next month">&#8250;</button></div>'
    + '<div class="cal-dows"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>'
    + '<div class="cal-grid" id="cal-grid"></div>'
    + '<div class="cal-foot"><span class="cal-hint" id="cal-hint"></span>'
    + '<div class="cal-foot-btns"><button type="button" class="cal-clear" data-cal="clear">Clear</button>'
    + '<button type="button" class="cal-confirm" data-cal="confirm">Confirm dates</button></div></div></div>';
}
function paintCalendar() {
  const grid = document.getElementById('cal-grid'); if (!grid) return;
  const m = calState.month;
  document.getElementById('cal-title').textContent = MONTHS_FULL[m.getMonth()] + ' ' + m.getFullYear();
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7;          // Monday-first
  let html = '';
  for (let i = 0; i < 42; i++) {                        // fixed 6-week grid -> constant height
    const day = new Date(m.getFullYear(), m.getMonth(), 1 - startDow + i);
    const inMonth = day.getMonth() === m.getMonth();
    const past = day < TODAY;
    let cls = 'cal-day';
    if (!inMonth) cls += ' cal-out';
    if (calState.tempCi && day.getTime() === calState.tempCi.getTime()) cls += ' cal-ci';
    if (calState.tempCo && day.getTime() === calState.tempCo.getTime()) cls += ' cal-co';
    if (calState.tempCi && calState.tempCo && day > calState.tempCi && day < calState.tempCo) cls += ' cal-inrange';
    html += '<button type="button" class="' + cls + '"' + ((past || !inMonth) ? ' disabled' : '') + ' data-day="' + dateKey(day) + '">' + day.getDate() + '</button>';
  }
  grid.innerHTML = html;
  const hint = document.getElementById('cal-hint');
  if (hint) {
    if (!calState.tempCi) hint.textContent = 'Pick your check-in date';
    else if (!calState.tempCo) hint.textContent = 'Now pick your check-out date';
    else { const n = Math.round((calState.tempCo - calState.tempCi) / 86400000); hint.textContent = n + ' night' + (n > 1 ? 's' : '') + ' selected'; }
  }
}
function guestsHtml() {
  return '<div class="mini-pop"><div class="mini-row"><span>Guests</span><div class="mini-step"><button type="button" data-g="-1" aria-label="Fewer">&minus;</button><span id="g-val">' + state.guests + '</span><button type="button" data-g="1" aria-label="More">+</button></div></div><p class="mini-note">Up to 8 guests across our apartments.</p></div>';
}
function roomHtml() {
  const opts = [{ id: '', name: 'Any size' }].concat(ROOMS.map(r => ({ id: r.id, name: r.id + ' - ' + r.name })));
  return '<div class="mini-pop room-pop">' + opts.map(o => '<button type="button" class="rp-opt' + ((state.preferRoom || '') === o.id ? ' sel' : '') + '" data-room="' + o.id + '">' + o.name + '</button>').join('') + '</div>';
}

document.getElementById('summary-pop').addEventListener('click', function (e) {
  const cal = e.target.closest('[data-cal]');
  if (cal) {
    const a = cal.dataset.cal;
    if (a === 'prev') { calState.month = new Date(calState.month.getFullYear(), calState.month.getMonth() - 1, 1); paintCalendar(); }
    else if (a === 'next') { calState.month = new Date(calState.month.getFullYear(), calState.month.getMonth() + 1, 1); paintCalendar(); }
    else if (a === 'clear') { calState.tempCi = null; calState.tempCo = null; paintCalendar(); }
    else if (a === 'confirm') { state.checkin = calState.tempCi; state.checkout = calState.tempCo; closePop(); recompute(); }
    return;
  }
  const dayBtn = e.target.closest('.cal-day');
  if (dayBtn && !dayBtn.disabled) {
    const d = _parseDate(dayBtn.dataset.day);
    if (!calState.tempCi || calState.tempCo) { calState.tempCi = d; calState.tempCo = null; }   // start fresh
    else if (d <= calState.tempCi) { calState.tempCi = d; calState.tempCo = null; }              // earlier click resets check-in
    else { calState.tempCo = d; }                                                                // valid second click sets check-out
    paintCalendar();                                                                             // never auto-closes
    return;
  }
  const g = e.target.closest('[data-g]');
  if (g) {
    state.guests = Math.max(1, Math.min(8, state.guests + parseInt(g.dataset.g, 10)));
    const gv = document.getElementById('g-val'); if (gv) gv.textContent = state.guests;
    recompute();
    return;
  }
  const rp = e.target.closest('.rp-opt');
  if (rp) { state.preferRoom = rp.dataset.room || null; closePop(); recompute(); return; }
});

document.querySelectorAll('.summary-field').forEach(function (f) {
  f.addEventListener('click', function () { openPop(f.dataset.edit, f); });
});

renderSummary();
renderNoDates();
renderTierInfo();
renderResults();
