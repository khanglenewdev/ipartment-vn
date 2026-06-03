/* ============================================================
   ipartment - HIGH-TECH BEHAVIOR LAYER
   Loaded after main.js. Wires up the advanced visual effects.
   ============================================================ */
(function() {
  'use strict';

  // PRELOADER (auto-hide on load complete)
  function initPreloader() {
    if (document.querySelector('.preloader')) return;
    const pl = document.createElement('div');
    pl.className = 'preloader';
    pl.innerHTML = `
      <div class="preloader-logo">i<span>partment</span></div>
      <div class="preloader-bar"></div>
      <div class="preloader-credit">Penguin &amp; Mun Business Digital Presence</div>
    `;
    document.body.appendChild(pl);
    window.addEventListener('load', () => {
      setTimeout(() => {
        pl.classList.add('hidden');
        setTimeout(() => pl.remove(), 700);
      }, 850);
    });
    // safety: hide after 3s no matter what
    setTimeout(() => {
      pl.classList.add('hidden');
      setTimeout(() => pl.remove(), 700);
    }, 3000);
  }

  // SCROLL PROGRESS BAR
  function initScrollProgress() {
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    document.body.appendChild(bar);
    let ticking = false;
    function update() {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
      bar.style.setProperty('--progress', pct + '%');
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  // RIPPLE EFFECT on .btn and similar
  function initRipple() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.btn, .btn-next, .btn-submit, .btn-book');
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      const size = Math.max(r.width, r.height);
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - r.left - size/2) + 'px';
      ripple.style.top = (e.clientY - r.top - size/2) + 'px';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    });
  }

  // MAGNETIC BUTTON (subtle pull on hover)
  function initMagnetic() {
    // Skip on touch devices
    if (window.matchMedia('(pointer: coarse)').matches) return;
    document.querySelectorAll('.magnetic').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width/2;
        const y = e.clientY - r.top - r.height/2;
        el.style.transform = `translate(${x*0.18}px, ${y*0.22}px)`;
      });
      el.addEventListener('mouseleave', () => el.style.transform = '');
    });
  }

  // LIVE ACTIVITY BADGE (simulated bookings)
  const ACTIVITIES = [
    { name: 'Anna from Berlin', action: 'booked the L Suite', delay: 6000 },
    { name: 'Michael in Tokyo', action: 'reserved Studio S for 2 weeks', delay: 8000 },
    { name: 'Sophie from Paris', action: 'is viewing the M apartment', delay: 7000 },
    { name: 'David in Sydney', action: 'unlocked the 38% long-stay rate', delay: 9000 },
    { name: 'A guest from Singapore', action: 'joined for the monthly rate', delay: 7500 },
    { name: 'A corporate team', action: 'requested 6 units (M and L)', delay: 8500 },
  ];
  function initActivity() {
    if (sessionStorage.getItem('ipartment_activity_off')) return;
    let idx = Math.floor(Math.random() * ACTIVITIES.length);
    const badge = document.createElement('div');
    badge.className = 'activity-badge';
    badge.innerHTML = `
      <span class="pulse"></span>
      <span class="txt"></span>
      <button class="close-act" aria-label="Close">&times;</button>
    `;
    document.body.appendChild(badge);
    const txt = badge.querySelector('.txt');
    badge.querySelector('.close-act').addEventListener('click', () => {
      badge.classList.remove('show');
      sessionStorage.setItem('ipartment_activity_off', '1');
    });

    function rotate() {
      if (sessionStorage.getItem('ipartment_activity_off')) return;
      const a = ACTIVITIES[idx];
      txt.innerHTML = `<strong>${a.name}</strong> ${a.action}`;
      badge.classList.add('show');
      setTimeout(() => {
        badge.classList.remove('show');
        idx = (idx + 1) % ACTIVITIES.length;
        setTimeout(rotate, 4000);
      }, a.delay);
    }
    setTimeout(rotate, 5000);
  }

  // INJECT MARQUEE TICKER (under header, on most pages)
  function injectMarquee() {
    if (document.querySelector('.marquee') || document.body.hasAttribute('data-marquee-off')) return;
    const items = [
      { txt: '500 Mbps Fibre Wi-Fi in every apartment' },
      { txt: 'Digital self check-in 24/7' },
      { txt: 'Smart lock entry via app' },
      { txt: 'Smart climate + lighting controls' },
      { txt: '<strong>Live</strong> from Thao Dien, HCMC' },
      { txt: 'Metro Line 1 station 3 min walk' },
      { txt: 'Built on the European serviced apartment standard' },
      { txt: 'Up to 38% off for 28+ night stays' },
    ];
    const m = document.createElement('div');
    m.className = 'marquee';
    const all = items.concat(items); // duplicate for seamless loop
    m.innerHTML = `
      <div class="marquee-track">
        ${all.map(i => `<span class="marquee-item"><span class="dot"></span>${i.txt}</span>`).join('')}
      </div>
    `;
    // Insert right after the site header
    const header = document.querySelector('.site-header');
    if (header && header.parentNode) header.parentNode.insertBefore(m, header.nextSibling);
  }

  // PARALLAX BG IMAGES (very subtle)
  function initParallax() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = document.querySelectorAll('.parallax-img');
    if (!els.length) return;
    let ticking = false;
    function update() {
      els.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const speed = parseFloat(el.dataset.speed || '0.2');
        const offset = (r.top + r.height/2 - window.innerHeight/2) * -speed;
        el.style.transform = `translateY(${offset}px)`;
      });
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  // TILT CARD on mouse move
  function initTilt() {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    document.querySelectorAll('.tilt-card').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateY(${x*6}deg) rotateX(${-y*6}deg) translateY(-4px)`;
      });
      el.addEventListener('mouseleave', () => el.style.transform = '');
    });
  }

  // INIT - marquee + activity disabled per user feedback
  document.addEventListener('DOMContentLoaded', () => {
    initPreloader();
    initScrollProgress();
    initRipple();
    initMagnetic();
    initParallax();
    initTilt();
  });
})();
