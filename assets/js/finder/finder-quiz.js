/* ============================================================
   ipartment Apartment Finder Quiz (NO AI)
   A short, tappable quiz that recommends XS / S / M / L from a
   transparent scoring table, deep links into the real booking flow
   pre-filled, and softly captures a rich lead. Reuses the existing
   backend: window.ipartmentCRM (leads) + window.ipartmentTrack (events).
   No em dashes or en dashes anywhere.
   ============================================================ */
(function () {
  'use strict';

  // Room facts mirror assets/js/pages/results.js (one source of truth there).
  var ROOMS = {
    XS: { name: 'Compact Studio', size: '25-30 m2', maxGuests: 4, nightly: 1200000 },
    S:  { name: 'Standard Studio', size: '35-40 m2', maxGuests: 4, nightly: 1650000 },
    M:  { name: 'Spacious Apartment', size: '45-55 m2', maxGuests: 6, nightly: 2100000 },
    L:  { name: 'Long-Stay Suite', size: '65-75 m2', maxGuests: 8, nightly: 2800000 }
  };
  var ORDER = ['XS', 'S', 'M', 'L'];

  // ---- the 4 questions (all tappable, no typing to get a result) ----
  var QUESTIONS = [
    { key: 'who', en: 'Who is coming?', vi: 'Ai sẽ đến ở?', opts: [
      { k: 'just',   en: 'Just me',               vi: 'Chỉ mình tôi',        guests: 1 },
      { k: 'two',    en: 'Two of us',             vi: 'Hai người',           guests: 2 },
      { k: 'family', en: 'Family or small group', vi: 'Gia đình hoặc nhóm nhỏ', guests: 3 },
      { k: 'bigger', en: 'A bigger group',        vi: 'Một nhóm đông hơn',   guests: 5 }
    ] },
    { key: 'long', en: 'How long are you staying?', vi: 'Bạn ở trong bao lâu?', opts: [
      { k: 'fewnights', en: 'A few nights',    vi: 'Vài đêm' },
      { k: 'week',      en: 'About a week',    vi: 'Khoảng một tuần' },
      { k: 'fewweeks',  en: 'A few weeks',     vi: 'Vài tuần' },
      { k: 'month',     en: 'A month or more', vi: 'Một tháng trở lên' }
    ] },
    { key: 'purpose', en: 'What is the stay mainly for?', vi: 'Chuyến đi chủ yếu để làm gì?', opts: [
      { k: 'holiday',  en: 'A holiday or short trip',     vi: 'Nghỉ dưỡng hoặc đi chơi ngắn ngày' },
      { k: 'remote',   en: 'Working or studying',         vi: 'Làm việc hoặc học tập' },
      { k: 'reloc',    en: 'Relocating or settling in',   vi: 'Chuyển đến sống hoặc an cư' },
      { k: 'business', en: 'A business trip',             vi: 'Công tác' }
    ] },
    { key: 'priority', en: 'What matters most to you?', vi: 'Điều gì quan trọng nhất với bạn?', opts: [
      { k: 'value', en: 'Best value',                   vi: 'Giá tốt nhất' },
      { k: 'space', en: 'Space and comfort',            vi: 'Không gian và sự thoải mái' },
      { k: 'work',  en: 'A great work setup',           vi: 'Góc làm việc tốt' },
      { k: 'home',  en: 'Feeling at home for a long stay', vi: 'Cảm giác như nhà cho kỳ dài hạn' }
    ] }
  ];

  // ---- transparent scoring (read it, predict every result) ----
  var SCORE = {
    who:      { just: { XS: 2, S: 1 }, two: { S: 2, M: 1 }, family: { M: 2, L: 1 }, bigger: { L: 3 } },
    long:     { fewnights: { XS: 1, S: 1 }, week: { S: 1, M: 1 }, fewweeks: { M: 2, L: 1 }, month: { L: 3, M: 1 } },
    purpose:  { holiday: { XS: 1, S: 1 }, remote: { M: 2 }, reloc: { L: 3 }, business: { M: 1, S: 1 } },
    priority: { value: { XS: 2, S: 1 }, space: { M: 2, L: 1 }, work: { M: 2 }, home: { L: 3 } }
  };

  // pre-written reason per recommended category
  var REASON = {
    XS: { en: 'For a short, simple stay, the Compact Studio is the smart-value pick: a clever layout, a proper workspace, and everything you need without paying for space you will not use.',
          vi: 'Cho một kỳ ngắn và gọn gàng, Compact Studio là lựa chọn đáng giá: bố trí thông minh, có góc làm việc, đủ mọi thứ cần thiết mà không trả tiền cho phần diện tích thừa.' },
    S:  { en: 'The Standard Studio is our most popular pick: a real seating and dining area and a full kitchen, ideal for a comfortable stay of a week or two.',
          vi: 'Standard Studio là lựa chọn được ưa chuộng nhất: có khu vực tiếp khách, bàn ăn và bếp đầy đủ, lý tưởng cho kỳ nghỉ một đến hai tuần thoải mái.' },
    M:  { en: 'The Spacious Apartment gives you designated zones to work, cook, eat and rest, with a home office and fast Wi-Fi. The right fit for remote work or a small family.',
          vi: 'Spacious Apartment có các khu vực riêng để làm việc, nấu ăn, ăn uống và nghỉ ngơi, kèm góc văn phòng và Wi-Fi nhanh. Phù hợp cho làm việc từ xa hoặc gia đình nhỏ.' },
    L:  { en: 'The Long-Stay Suite gives you a separate bedroom, a real living room and a family kitchen. Built for longer, settled stays with the whole group.',
          vi: 'Long-Stay Suite có phòng ngủ riêng, phòng khách thực thụ và bếp gia đình. Được thiết kế cho kỳ dài hạn, an cư cùng cả nhóm.' }
  };

  // ---- bilingual UI chrome ----
  var T = {
    en: {
      title: 'Find my apartment', step: 'Question', of: 'of', back: 'Back',
      resultEyebrow: 'Your best fit', recFor: 'Suits', upTo: 'Sleeps up to', from: 'From', perNight: 'per night',
      discountWeek: 'Stays of 7 nights or more unlock the weekly rate, about 18 percent off.',
      discountMonth: 'Stays of 28 nights or more unlock the monthly rate, up to 38 percent off.',
      ctaBook: 'See it and book my stay', doubt: 'No payment until we confirm. Free cancellation. No account needed.',
      captureTitle: 'Want the exact rate for your dates?',
      captureSub: 'Leave an email or phone and our team will send a tailored rate. Either is fine, never spam, delete anytime.',
      capturePh: 'Email or phone', send: 'Send', bad: 'That does not look quite right, mind checking it?',
      thanks: 'Thank you. We will send your tailored rate shortly.',
      seeAll: 'See all apartments', retake: 'Retake the quiz', privacy: 'See our <a href="legal.html#privacy" target="_blank" rel="noopener">Privacy Policy</a>.',
      whenTitle: 'When are you thinking of staying?', whenOpts: ['This month', 'Next month', 'Just exploring'], skip: 'Skip'
    },
    vi: {
      title: 'Tìm căn hộ cho tôi', step: 'Câu hỏi', of: 'trên', back: 'Quay lại',
      resultEyebrow: 'Phù hợp nhất với bạn', recFor: 'Phù hợp', upTo: 'Ở tối đa', from: 'Từ', perNight: 'mỗi đêm',
      discountWeek: 'Ở từ 7 đêm trở lên được mở giá theo tuần, giảm khoảng 18 phần trăm.',
      discountMonth: 'Ở từ 28 đêm trở lên được mở giá theo tháng, giảm tới 38 phần trăm.',
      ctaBook: 'Xem và đặt phòng', doubt: 'Không thanh toán cho đến khi xác nhận. Miễn phí hủy. Không cần tài khoản.',
      captureTitle: 'Muốn nhận giá chính xác cho ngày của bạn?',
      captureSub: 'Để lại email hoặc số điện thoại, đội ngũ của chúng tôi sẽ gửi báo giá riêng. Cái nào cũng được, không spam, xóa bất cứ lúc nào.',
      capturePh: 'Email hoặc số điện thoại', send: 'Gửi', bad: 'Hình như chưa đúng, bạn kiểm tra lại giúp nhé?',
      thanks: 'Cảm ơn bạn. Chúng tôi sẽ gửi báo giá riêng sớm.',
      seeAll: 'Xem tất cả căn hộ', retake: 'Làm lại', privacy: 'Xem <a href="legal.html#privacy" target="_blank" rel="noopener">Chính sách bảo mật</a>.',
      whenTitle: 'Bạn dự định ở vào khi nào?', whenOpts: ['Tháng này', 'Tháng sau', 'Chỉ đang tìm hiểu'], skip: 'Bỏ qua'
    }
  };

  var lang = (document.documentElement.lang || 'en').toLowerCase().indexOf('vi') === 0 ? 'vi' : 'en';
  var answers = {}, cur = 0, overlay = null, completed = false, captured = false, dateHint = null;

  function t() { return T[lang]; }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function track(name, meta) { try { if (window.ipartmentTrack) window.ipartmentTrack('finder', name, meta ? { meta: meta } : undefined); } catch (e) {} }
  function fmtVnd(n) { return n.toLocaleString('en-US').replace(/,/g, '.') + ' VND'; }

  function compute() {
    var s = { XS: 0, S: 0, M: 0, L: 0 };
    Object.keys(answers).forEach(function (qkey) {
      var map = SCORE[qkey] && SCORE[qkey][answers[qkey]];
      if (map) Object.keys(map).forEach(function (cat) { s[cat] += map[cat]; });
    });
    var longStay = (answers.long === 'fewweeks' || answers.long === 'month');
    // pick top, tie-break by larger (long stays) or smaller (value)
    var winner = ORDER[0];
    ORDER.forEach(function (cat) {
      if (s[cat] > s[winner]) winner = cat;
      else if (s[cat] === s[winner] && cat !== winner) {
        var biggerThanWinner = ORDER.indexOf(cat) > ORDER.indexOf(winner);
        if (longStay ? biggerThanWinner : !biggerThanWinner) winner = cat;
      }
    });
    // capacity: never recommend a room too small for the group
    var guests = guestCount();
    while (ROOMS[winner].maxGuests < guests && ORDER.indexOf(winner) < ORDER.length - 1) {
      winner = ORDER[ORDER.indexOf(winner) + 1];
    }
    return { rec: winner, scores: s, longStay: longStay, guests: guests };
  }
  function guestCount() {
    var optList = QUESTIONS[0].opts, key = answers.who;
    for (var i = 0; i < optList.length; i++) if (optList[i].k === key) return optList[i].guests;
    return 2;
  }
  function discountKey() {
    if (answers.long === 'month') return 'month';
    if (answers.long === 'week' || answers.long === 'fewweeks') return 'week';
    return null;
  }

  // ---- rendering ----
  function open() {
    if (overlay) return;
    answers = {}; cur = 0; completed = false; captured = false; dateHint = null;
    lang = (document.documentElement.lang || 'en').toLowerCase().indexOf('vi') === 0 ? 'vi' : 'en';
    overlay = el('div', 'fq-overlay'); overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', t().title);
    overlay.innerHTML = '<div class="fq-panel"><button class="fq-close" aria-label="Close">&times;</button><div class="fq-progress"><span class="fq-progress-bar"></span></div><div class="fq-body"></div></div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('open'); });
    overlay.querySelector('.fq-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', esc);
    track('start');
    renderQuestion();
  }
  function esc(e) { if (e.key === 'Escape') close(); }
  function close() {
    if (!overlay) return;
    if (!completed) track('abandon', { lastQ: cur + 1 });
    document.removeEventListener('keydown', esc);
    overlay.classList.remove('open');
    var o = overlay; overlay = null;
    setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 300);
  }
  function setProgress(frac) { var b = overlay.querySelector('.fq-progress-bar'); if (b) b.style.width = Math.round(frac * 100) + '%'; }

  function renderQuestion() {
    var q = QUESTIONS[cur];
    setProgress(cur / QUESTIONS.length);
    var body = overlay.querySelector('.fq-body');
    var html = '<div class="fq-step">' + t().step + ' ' + (cur + 1) + ' ' + t().of + ' ' + QUESTIONS.length + '</div>'
      + '<h2 class="fq-q">' + (lang === 'vi' ? q.vi : q.en) + '</h2><div class="fq-opts"></div>';
    if (cur > 0) html += '<button type="button" class="fq-back">' + t().back + '</button>';
    body.innerHTML = html;
    var opts = body.querySelector('.fq-opts');
    q.opts.forEach(function (o) {
      var b = el('button', 'fq-opt'); b.type = 'button'; b.textContent = (lang === 'vi' ? o.vi : o.en);
      b.addEventListener('click', function () {
        answers[q.key] = o.k;
        track('answer', { q: cur + 1, key: q.key, value: o.k });
        if (cur < QUESTIONS.length - 1) { cur++; renderQuestion(); }
        else { renderResult(); }
      });
      opts.appendChild(b);
    });
    var back = body.querySelector('.fq-back');
    if (back) back.addEventListener('click', function () { if (cur > 0) { cur--; renderQuestion(); } });
  }

  function renderResult() {
    completed = true;
    setProgress(1);
    var r = compute(), room = ROOMS[r.rec];
    track('result', { recommended: r.rec, party: answers.who, length: answers.long, purpose: answers.purpose, priority: answers.priority });
    var dk = discountKey();
    var discountLine = dk === 'month' ? t().discountMonth : (dk === 'week' ? t().discountWeek : '');
    var deep = 'booking.html?room=' + r.rec + '&guests=' + r.guests;
    var body = overlay.querySelector('.fq-body');
    body.innerHTML =
      '<div class="fq-result">'
      + '<div class="fq-rec-eyebrow">' + t().resultEyebrow + '</div>'
      + '<div class="fq-rec-name">' + room.name + ' <span class="fq-rec-tag">' + r.rec + '</span></div>'
      + '<div class="fq-rec-facts">' + room.size + ' &middot; ' + t().upTo + ' ' + room.maxGuests + ' &middot; ' + t().from + ' ' + fmtVnd(room.nightly) + ' ' + t().perNight + '</div>'
      + '<p class="fq-rec-reason">' + (lang === 'vi' ? REASON[r.rec].vi : REASON[r.rec].en) + '</p>'
      + (discountLine ? '<p class="fq-rec-discount">' + discountLine + '</p>' : '')
      + '<a class="fq-cta" href="' + deep + '">' + t().ctaBook + '</a>'
      + '<p class="fq-doubt">' + t().doubt + '</p>'
      + '<div class="fq-capture"></div>'
      + '<div class="fq-secondary"><a href="accommodation.html">' + t().seeAll + '</a><button type="button" class="fq-retake">' + t().retake + '</button></div>'
      + '</div>';
    body.querySelector('.fq-cta').addEventListener('click', function () { track('cta_book_click', { recommended: r.rec }); });
    body.querySelector('.fq-retake').addEventListener('click', function () { answers = {}; cur = 0; completed = false; renderQuestion(); });
    renderCapture(body.querySelector('.fq-capture'), r);
  }

  function renderCapture(holder, r) {
    holder.innerHTML = '<div class="fq-cap-title">' + t().captureTitle + '</div>'
      + '<div class="fq-cap-sub">' + t().captureSub + '</div>'
      + '<div class="fq-cap-row"><input class="fq-cap-input" type="text" placeholder="' + t().capturePh + '" autocomplete="off" inputmode="email" /><button type="button" class="fq-cap-send">' + t().send + '</button></div>'
      + '<div class="fq-cap-privacy">' + t().privacy + '</div><div class="fq-cap-msg"></div>';
    var input = holder.querySelector('.fq-cap-input'), btn = holder.querySelector('.fq-cap-send'), msg = holder.querySelector('.fq-cap-msg');
    function submit() {
      var v = (input.value || '').trim();
      var email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
      var digits = v.replace(/[^0-9]/g, '');
      var phone = (!email && digits.length >= 8 && digits.length <= 15) ? v : null;
      if (!email && !phone) { msg.textContent = t().bad; msg.className = 'fq-cap-msg show'; return; }
      submitLead(r, email, phone);
      holder.innerHTML = '<div class="fq-cap-thanks">' + t().thanks + '</div>';
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  }

  function submitLead(r, email, phone) {
    captured = true;
    track('capture_done', { field: email ? 'email' : 'phone' });
    try {
      if (window.ipartmentCRM && window.ipartmentCRM.add) {
        window.ipartmentCRM.add('leads', {
          type: 'finder_quiz', email: email || null, phone: phone || null, source: 'finder_quiz',
          meta: { recommended: r.rec, party: answers.who, length: answers.long, purpose: answers.purpose, priority: answers.priority, dateHint: dateHint, lang: lang }
        });
      }
    } catch (e) { /* CRM swallows storage errors; never block the UI */ }
  }

  window.ipartmentFinder = { open: open };

  function init() {
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest && e.target.closest('[data-finder-open]');
      if (trigger) { e.preventDefault(); open(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
