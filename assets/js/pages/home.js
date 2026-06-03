/* Home page - testimonial carousel + map init */
(function() {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.ipartmentInitMap) {
      window.ipartmentInitMap('home-map', { scrollWheelZoom: false, openPopup: true });
    }

    // ── Functional hero booking card with a custom Liquid Glass calendar ──
    (function initHeroBooking() {
      const form = document.getElementById('heroBook');
      if (!form) return;
      const ciInput = document.getElementById('hb-ci');   // hidden, holds ISO
      const coInput = document.getElementById('hb-co');
      const ciDisp = document.getElementById('hb-ci-disp');
      const coDisp = document.getElementById('hb-co-disp');
      const ciField = document.getElementById('hb-ci-field');
      const coField = document.getElementById('hb-co-field');
      const cal = document.getElementById('hb-cal');
      const guests = document.getElementById('hb-guests');
      const apt = document.getElementById('hb-apt');
      const priceEl = document.getElementById('hb-price');
      const FROM = { '': '1.2M', XS: '1.2M', S: '1.65M', M: '2.1M', L: '2.8M' };
      const MAXG = { '': 8, XS: 4, S: 4, M: 6, L: 8 };
      const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const MS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const DN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
      const pad = n => String(n).padStart(2, '0');
      const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const fmt = d => `${d.getDate()} ${MS[d.getMonth()]}`;
      const today = new Date(); today.setHours(0, 0, 0, 0);

      function refreshPrice() {
        if (!priceEl || !apt) return;
        priceEl.innerHTML = FROM[apt.value] + '<span class="cur">&#8363;</span>';
        const max = MAXG[apt.value] || 8;
        if (guests) Array.from(guests.options).forEach(o => { o.disabled = parseInt(o.value, 10) > max; });
        if (guests && parseInt(guests.value, 10) > max) guests.value = String(max);
        if (guests) guests.dispatchEvent(new Event('change'));
      }
      if (apt) apt.addEventListener('change', refreshPrice);

      // ----- custom glass calendar (range select) -----
      let view = new Date(today.getFullYear(), today.getMonth(), 1);
      let ci = null, co = null;
      function syncFields() {
        ciInput.value = ci ? iso(ci) : '';
        coInput.value = co ? iso(co) : '';
        ciDisp.textContent = ci ? fmt(ci) : 'Add date';
        ciDisp.classList.toggle('placeholder', !ci);
        coDisp.textContent = co ? fmt(co) : 'Add date';
        coDisp.classList.toggle('placeholder', !co);
      }
      function render() {
        let h = '<div class="hb-cal-head"><div class="hb-cal-title">' + MN[view.getMonth()] + ' <em>' + view.getFullYear() + '</em></div>'
          + '<div class="hb-cal-nav"><button type="button" data-nav="-1" aria-label="Previous month">&#8249;</button><button type="button" data-nav="1" aria-label="Next month">&#8250;</button></div></div><div class="hb-cal-grid">';
        DN.forEach(d => h += '<div class="hb-cal-lbl">' + d + '</div>');
        const start = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
        for (let i = 0; i < start; i++) h += '<div class="hb-day hb-empty"></div>';
        const dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
        for (let day = 1; day <= dim; day++) {
          const d = new Date(view.getFullYear(), view.getMonth(), day); d.setHours(0, 0, 0, 0);
          let cls = 'hb-day';
          if (d < today) cls += ' dis';
          else {
            if (ci && d.getTime() === ci.getTime()) cls += ' in';
            if (co && d.getTime() === co.getTime()) cls += ' out';
            if (ci && co && d > ci && d < co) cls += ' range';
          }
          if (d.getTime() === today.getTime()) cls += ' today';
          h += '<button type="button" class="' + cls + '" data-d="' + (d < today ? '' : iso(d)) + '">' + day + '</button>';
        }
        // Pad to a full 6-week grid (42 cells) so the calendar height is constant
        // and the prev/next arrows never jump between short and long months.
        for (let i = start + dim; i < 42; i++) h += '<div class="hb-day hb-empty"></div>';
        h += '</div><div class="hb-cal-foot"><button type="button" data-clear>Clear</button><button type="button" data-today>Today</button><button type="button" data-done>Done</button></div>';
        cal.innerHTML = h;
      }
      function closeCal() { cal.hidden = true; }
      const closers = [closeCal];               // every popover registers its close fn
      function closeAll() { closers.forEach(fn => fn()); }
      function openCal() {
        closeAll(); render(); cal.hidden = false; cal.classList.remove('up');
        // flip upward if opening downward would run past the bottom of the screen
        const r = cal.getBoundingClientRect();
        if (r.bottom > window.innerHeight - 10) cal.classList.add('up');
      }
      function parseISO(s) { const p = s.split('-'); const d = new Date(+p[0], +p[1] - 1, +p[2]); d.setHours(0, 0, 0, 0); return d; }
      function pick(d) {
        if (!ci || (ci && co)) { ci = d; co = null; }
        else if (d.getTime() <= ci.getTime()) { ci = d; co = null; }
        else { co = d; }
        syncFields(); render();
        // Do not auto-close on a complete range; the guest closes it with Done,
        // a click outside, or by tapping the field again.
      }
      [ciField, coField].forEach(f => f && f.addEventListener('click', e => {
        e.stopPropagation();
        if (cal.hidden) openCal(); else closeCal();
      }));
      cal.addEventListener('click', e => {
        e.stopPropagation();
        const nav = e.target.closest('[data-nav]');
        if (nav) { view = new Date(view.getFullYear(), view.getMonth() + parseInt(nav.dataset.nav, 10), 1); render(); return; }
        const d = e.target.closest('.hb-day[data-d]');
        if (d && d.dataset.d) { pick(parseISO(d.dataset.d)); return; }
        if (e.target.closest('[data-clear]')) { ci = null; co = null; syncFields(); render(); return; }
        if (e.target.closest('[data-today]')) { view = new Date(today.getFullYear(), today.getMonth(), 1); render(); return; }
        if (e.target.closest('[data-done]')) { closeCal(); return; }
      });

      // ----- custom glass dropdowns (guests / apartment), backed by the hidden <select> -----
      function initDropdown(fieldId, sel, dispId, popId) {
        const field = document.getElementById(fieldId);
        const disp = document.getElementById(dispId);
        const pop = document.getElementById(popId);
        if (!field || !sel || !disp || !pop) return;
        function sync() { const o = sel.options[sel.selectedIndex]; disp.textContent = o ? o.textContent : ''; }
        function close() { pop.hidden = true; field.classList.remove('open'); }
        function open() {
          closeAll();
          pop.innerHTML = Array.from(sel.options).map((o, i) =>
            '<button type="button" class="hb-opt' + (i === sel.selectedIndex ? ' sel' : '') + (o.disabled ? ' dis' : '') + '" data-i="' + i + '">' + o.textContent + '</button>'
          ).join('');
          pop.hidden = false; field.classList.add('open'); pop.classList.remove('up');
          const r = pop.getBoundingClientRect();
          if (r.bottom > window.innerHeight - 10) pop.classList.add('up');
        }
        closers.push(close);
        field.addEventListener('click', e => { if (e.target.closest('.hb-pop')) return; e.stopPropagation(); if (pop.hidden) open(); else close(); });
        pop.addEventListener('click', e => {
          e.stopPropagation();
          const b = e.target.closest('.hb-opt[data-i]');
          if (!b || b.classList.contains('dis')) return;
          sel.selectedIndex = parseInt(b.dataset.i, 10);
          sel.dispatchEvent(new Event('change'));
          sync(); close();
        });
        sel.addEventListener('change', sync);
        sync();
      }
      initDropdown('hb-guests-field', guests, 'hb-guests-disp', 'hb-guests-pop');
      initDropdown('hb-apt-field', apt, 'hb-apt-disp', 'hb-apt-pop');

      document.addEventListener('click', closeAll);

      form.addEventListener('submit', e => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (apt && apt.value) params.set('room', apt.value);
        if (guests) params.set('guests', guests.value);
        if (ciInput.value) params.set('ci', ciInput.value);
        if (coInput.value) params.set('co', coInput.value);
        if (window.ipartmentTrack) window.ipartmentTrack('funnel', 'hero_book_search', { meta: { room: apt ? apt.value : '', hasDates: !!(ciInput.value && coInput.value) } });
        window.location.href = 'results.html?' + params.toString();
      });
    })();

    // Testimonial auto-rotate
    const slides = document.querySelectorAll('.testimonial-slide');
    const dots = document.querySelectorAll('.testimonial-dot');
    if (!slides.length) return;
    let idx = 0;
    let timer;
    function go(i) {
      slides.forEach((s, j) => s.classList.toggle('active', j === i));
      dots.forEach((d, j) => d.classList.toggle('active', j === i));
      idx = i;
    }
    function startTimer() {
      clearInterval(timer);
      timer = setInterval(() => go((idx + 1) % slides.length), 6000);
    }
    dots.forEach(d => d.addEventListener('click', () => { go(parseInt(d.dataset.idx)); startTimer(); }));

    const prev = document.getElementById('testimonial-prev');
    const next = document.getElementById('testimonial-next');
    if (prev) prev.addEventListener('click', () => { go((idx - 1 + slides.length) % slides.length); startTimer(); });
    if (next) next.addEventListener('click', () => { go((idx + 1) % slides.length); startTimer(); });

    startTimer();
  });
})();
