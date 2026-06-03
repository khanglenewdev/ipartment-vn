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

function renderSummary() {
  document.getElementById('sum-checkin').textContent = state.checkin ? formatDate(state.checkin) : 'Select dates';
  document.getElementById('sum-checkout').textContent = state.checkout ? formatDate(state.checkout) : 'Select dates';
  document.getElementById('sum-guests').textContent = state.guests + (state.guests === 1 ? ' guest' : ' guests');
  document.getElementById('sum-nights').textContent = state.nights > 0 ? `${state.nights} night${state.nights>1?'s':''}` : 'No dates selected';
}

function renderNoDates() {
  const el = document.getElementById('no-dates-section');
  if (state.nights === 0) {
    el.innerHTML = `<div class="no-dates-banner"><p>You have not selected dates yet. Showing standard nightly rates. <strong>Choose dates</strong> on the homepage to see weekly (18% off) and monthly (38% off) discounts.</p><a href="index.html">Pick dates</a></div>`;
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
    document.getElementById('results-list').innerHTML = `<div class="empty"><div class="ico">&#128269;</div><h3>No matches for <em>${state.guests} guests</em></h3><p>Try reducing your guest count or contact us for custom options.</p><a href="index.html" class="btn btn-primary">Edit search</a></div>`;
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

renderSummary();
renderNoDates();
renderTierInfo();
renderResults();
