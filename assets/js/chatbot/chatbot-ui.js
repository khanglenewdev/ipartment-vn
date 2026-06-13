/* ============================================================
   ipartment chatbot - widget UI + conversation state machine
   States: WELCOME (topic chips) -> TOPIC (5 featured questions) ->
   ANSWER (answer + related + CTA) -> CAPTURE (value-first lead).
   Free text runs the engine cascade at ANY state and coexists with
   the guided chips. Depends on: chatbot-engine.js, chatbot-capture.js,
   window.ipartmentTrack. No em dashes or en dashes anywhere.
   ============================================================ */
(function () {
  'use strict';

  var E = window.ipartmentChatEngine;
  var C = window.ipartmentChatCapture;
  if (!E || !C) { if (window.console) console.warn('[chatbot] engine/capture missing'); return; }

  // ---- bilingual UI chrome (the library carries the answer content) ----
  var T = {
    en: {
      sub: 'Online now', placeholder: 'Type your question...',
      talkHuman: 'Talk to a human', findApt: 'Find my apartment', back: 'Back to topics', skip: 'Skip',
      ask: 'Anything else I can help with?',
      more: 'What else may I help you with?',
      stPivot: 'I could happily chat all day, but let me actually be useful. 😺 Here is what I can help with:',
      ctaBook: 'Start my booking', ctaQuote: 'Get my quote', ctaView: 'Show me the apartments',
      miss: 'That is a good question, and I would rather get it exactly right than guess. Our team can follow up personally, usually within a couple of hours. Would you like me to have them reach out?',
      offer: 'I would love to make sure you get the right answer. Our team can follow up personally, usually within a couple of hours. Would you like me to have them reach out?',
      yes: 'Yes, please', no: 'No thanks',
      askContact: 'Great. What is the best email or phone number to reach you? Either is fine. We will only use it to help with your stay, never spam you, and you can ask us to delete it anytime.',
      contactPh: 'Email or phone', send: 'Send',
      bad: 'That does not look quite right. Mind checking the email or phone?',
      thanks: 'Thank you. Someone from our team will reach out shortly. Anything else I can help with right now?',
      declined: 'No problem at all. I am right here if you change your mind. What else can I help with?',
      privacy: 'Used only to help with your stay. See our <a href="legal.html#privacy" target="_blank" rel="noopener">Privacy Policy</a>.',
      qWhen: 'Roughly when are you thinking of staying?', qWhenO: ['This month', 'Next month', 'Just exploring'],
      qWho: 'How many people?', qWhoO: ['1', '2', '3 plus', 'A group'],
      qLong: 'How long, roughly?', qLongO: ['A few nights', 'A week or two', 'A month plus'],
      nudge: 'Questions about a stay? Tap to ask, I am happy to help.',
      loading: 'One moment, getting things ready...',
      offline: 'I am having trouble loading right now. You can reach the team directly on the Contact page.'
    },
    vi: {
      sub: 'Đang trực tuyến', placeholder: 'Nhập câu hỏi của bạn...',
      talkHuman: 'Gặp nhân viên', findApt: 'Tìm căn hộ cho tôi', back: 'Về danh mục', skip: 'Bỏ qua',
      ask: 'Tôi có thể giúp gì thêm không?',
      more: 'Bạn cần tôi hỗ trợ gì thêm không?',
      stPivot: 'Mình tám cả ngày cũng được, nhưng để mình giúp việc thật sự nào. 😺 Đây là những gì mình có thể hỗ trợ:',
      ctaBook: 'Bắt đầu đặt phòng', ctaQuote: 'Nhận báo giá riêng', ctaView: 'Xem căn hộ',
      miss: 'Câu hỏi hay đấy, và tôi muốn trả lời thật chính xác thay vì đoán. Đội ngũ của chúng tôi có thể liên hệ trực tiếp, thường trong vài giờ. Bạn có muốn chúng tôi liên hệ không?',
      offer: 'Tôi muốn chắc chắn bạn nhận được câu trả lời đúng. Đội ngũ của chúng tôi có thể liên hệ trực tiếp, thường trong vài giờ. Bạn có muốn chúng tôi liên hệ không?',
      yes: 'Có, làm ơn', no: 'Không, cảm ơn',
      askContact: 'Tuyệt vời. Email hoặc số điện thoại nào tiện nhất để liên hệ bạn? Cái nào cũng được. Chúng tôi chỉ dùng để hỗ trợ kỳ nghỉ của bạn, không bao giờ gửi spam, và bạn có thể yêu cầu xóa bất cứ lúc nào.',
      contactPh: 'Email hoặc số điện thoại', send: 'Gửi',
      bad: 'Hình như chưa đúng. Bạn kiểm tra lại email hoặc số điện thoại giúp nhé?',
      thanks: 'Cảm ơn bạn. Đội ngũ của chúng tôi sẽ liên hệ sớm. Tôi có thể giúp gì thêm ngay bây giờ không?',
      declined: 'Không sao cả. Tôi vẫn ở đây nếu bạn đổi ý. Tôi có thể giúp gì khác?',
      privacy: 'Chỉ dùng để hỗ trợ kỳ nghỉ của bạn. Xem <a href="legal.html#privacy" target="_blank" rel="noopener">Chính sách bảo mật</a>.',
      qWhen: 'Bạn dự định ở vào khoảng thời gian nào?', qWhenO: ['Tháng này', 'Tháng sau', 'Chỉ đang tìm hiểu'],
      qWho: 'Bao nhiêu người?', qWhoO: ['1', '2', '3 trở lên', 'Một nhóm'],
      qLong: 'Ở trong bao lâu?', qLongO: ['Vài đêm', 'Một hai tuần', 'Một tháng trở lên'],
      nudge: 'Có thắc mắc về kỳ nghỉ? Nhấn để hỏi, tôi sẵn lòng giúp.',
      loading: 'Chờ một chút...',
      offline: 'Hiện tôi đang gặp trục trặc khi tải. Bạn có thể liên hệ đội ngũ qua trang Liên hệ.'
    }
  };

  // ---- state ----
  var lang = (document.documentElement.lang || 'en').toLowerCase().indexOf('vi') === 0 ? 'vi' : 'en';
  var state = 'WELCOME';
  var openedOnce = false;
  var greetedLangs = {}; // which languages have already seen the full greeting

  // ---- cat personality lives ONLY in the proactive nudge bubble (the mascot is
  // a cat). The chat itself stays straight and helpful. A random line is picked
  // each time the nudge pops. ----
  var CAT_NUDGES = {
    en: [
      'Meow~ questions about a stay? Tap me, I am happy to help. 🐾',
      'Psst, house cat here. 🐱 Need a paw with booking or the apartments? Tap to ask.',
      'Mrrp! I batted a question loose just for you. Tap if you need a hand with your stay.',
      'Nya~ I am awake (mostly). Tap me for anything about ipartment.',
      'Meow. I knocked your questions off the shelf. Tap and I will fetch the answers. 🐾',
      'Purr... still curled up by the window. Tap if you want help picking an apartment.',
      'Hey, the resident cat again. 🐈 Dates, prices, sizes, ask me anything about your stay.',
      'Mew! I already counted the comfy spots. Tap and I will help you book the best one.'
    ],
    vi: [
      'Meo~ có thắc mắc về kỳ nghỉ? Chạm vào tôi nhé, tôi sẵn lòng giúp. 🐾',
      'Suỵt, mèo nhà đây. 🐱 Cần giúp đặt phòng hay tìm căn hộ? Chạm để hỏi.',
      'Mrrp! Tôi vừa hất một câu hỏi ra cho bạn. Chạm nếu cần giúp về kỳ nghỉ.',
      'Nya~ Tôi đang thức (gần như vậy). Chạm vào tôi để hỏi bất cứ điều gì về ipartment.',
      'Meo. Tôi vừa hất mấy câu hỏi của bạn xuống. Chạm vào tôi, tôi sẽ tìm câu trả lời. 🐾',
      'Gừ gừ... vẫn đang cuộn tròn bên cửa sổ. Chạm nếu bạn muốn được giúp chọn căn hộ.',
      'Này, mèo cư dân đây. 🐈 Ngày ở, giá, diện tích, hỏi tôi bất cứ điều gì về kỳ nghỉ.',
      'Meo! Tôi đã đếm sẵn mấy chỗ êm ái rồi. Chạm để tôi giúp bạn đặt căn tốt nhất.'
    ]
  };
  function catNudge() { var p = CAT_NUDGES[lang] || CAT_NUDGES.en; return p[Math.floor(Math.random() * p.length)]; }
  var launcher, panel, scrollEl, input, sendBtn, langWrap, nudgeEl, dotEl;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- tiny dom helpers ----
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function t() { return T[lang]; }
  function scrollBottom() { if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function linkify(s) {
    var h = esc(s);
    h = h.replace(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi, '<a href="mailto:$1">$1</a>');
    h = h.replace(/(\bhttps?:\/\/[^\s<]+)/gi, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + '</a>'; });
    return h;
  }

  // ---- message + chip rendering ----
  function addUser(text) { var m = el('div', 'ipc-msg user'); m.textContent = text; scrollEl.appendChild(m); scrollBottom(); }
  // Show the typing dots for a beat before each bot message. Default is 2.34s;
  // a caller can pass a custom duration (the "anything else?" line uses 4.67s).
  // Reduced-motion users get a near-instant reply instead of a long wait.
  function botMsg(html, done, delayMs) {
    var typing = el('div', 'ipc-typing', '<span></span><span></span><span></span>');
    scrollEl.appendChild(typing); scrollBottom();
    var delay = reduceMotion ? 120 : (delayMs || 2340);
    setTimeout(function () {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      var m = el('div', 'ipc-msg bot'); m.innerHTML = html; scrollEl.appendChild(m); scrollBottom();
      if (done) done();
    }, delay);
  }
  function addChips(items) {
    var wrap = el('div', 'ipc-chips');
    items.forEach(function (it) {
      if (!it) return;
      var b = el('button', 'ipc-chip' + (it.cls ? ' ' + it.cls : '')); b.type = 'button'; b.textContent = it.label;
      b.addEventListener('click', function () { it.onClick(); });
      wrap.appendChild(b);
    });
    scrollEl.appendChild(wrap); scrollBottom(); return wrap;
  }
  function addCta(label, opts) {
    var node;
    if (opts.href) { node = el('a', 'ipc-cta' + (opts.cls ? ' ' + opts.cls : '')); node.href = opts.href; }
    else { node = el('button', 'ipc-cta' + (opts.cls ? ' ' + opts.cls : '')); node.type = 'button'; }
    node.textContent = label;
    if (opts.onClick) node.addEventListener('click', opts.onClick);
    scrollEl.appendChild(node); scrollBottom();
  }

  // ---- conversation: WELCOME ----
  function topicMenuChips() {
    var chips = E.topics().map(function (tp) {
      return { label: (lang === 'vi' ? tp.label_vi : tp.label_en) || tp.category, cls: 'ipc-topic', onClick: function () { gotoTopic(tp); } };
    });
    if (window.ipartmentFinder) chips.push({ label: t().findApt, cls: 'ipc-topic', onClick: function () { C.track('finder_open'); close(); window.ipartmentFinder.open(); } });
    chips.push({ label: t().talkHuman, cls: 'ipc-back', onClick: function () { offerCapture({ intent: 'human' }, true); } });
    return chips;
  }
  function gotoWelcome(skipGreeting) {
    state = 'WELCOME';
    var greet = skipGreeting ? t().ask : (E.welcome(lang) || t().ask);
    if (!skipGreeting) greetedLangs[lang] = 1;
    botMsg(linkify(greet), function () { addChips(topicMenuChips()); });
  }
  // Small talk. Quick greetings/thanks land on the topic menu. The conversational
  // "easter egg" replies (kind 'convo') stay chatty: the bot just replies (each
  // line already nudges back toward the stay) and keeps the input open, with a
  // light "back to topics" escape. After a few convo turns in a row it gently
  // pivots to the menu so it never loops forever.
  var smalltalkStreak = 0;
  var ST_DELAY = 1000;  // small talk gets a snappy 1s typing beat, not the full 2.34s
  function renderSmalltalk(kind, reply) {
    state = 'WELCOME';
    if (kind === 'convo') {
      smalltalkStreak++;
      if (smalltalkStreak >= 3) {
        smalltalkStreak = 0;
        botMsg(linkify(reply), function () {
          botMsg(linkify(t().stPivot), function () { addChips(topicMenuChips()); }, ST_DELAY);
        }, ST_DELAY);
        return;
      }
      botMsg(linkify(reply), function () {
        addChips([{ label: t().back, cls: 'ipc-back', onClick: function () { smalltalkStreak = 0; gotoWelcome(true); } }]);
      }, ST_DELAY);
      return;
    }
    smalltalkStreak = 0;
    botMsg(linkify(reply), function () {
      if (kind === 'bye') { addChips([{ label: t().back, cls: 'ipc-back', onClick: function () { gotoWelcome(true); } }]); return; }
      addChips(topicMenuChips());
    }, ST_DELAY);
  }

  // Philosophical "wise cat" reply: a serious, considered block, then a self-
  // deprecating "but what do I know, I'm just a cat" line ~2s later, as if the
  // cat caught itself being profound. Counts toward the small-talk streak so a
  // long philosophy session still gently pivots back to the topic menu.
  function renderWise(reply, tail) {
    state = 'WELCOME';
    smalltalkStreak++;
    var pivot = smalltalkStreak >= 3;
    if (pivot) smalltalkStreak = 0;
    botMsg(linkify(reply), function () {
      botMsg(linkify(tail), function () {
        if (pivot) {
          botMsg(linkify(t().stPivot), function () { addChips(topicMenuChips()); }, ST_DELAY);
        } else {
          addChips([{ label: t().back, cls: 'ipc-back', onClick: function () { smalltalkStreak = 0; gotoWelcome(true); } }]);
        }
      }, 2000);   // the "but what do I know, I'm just a cat" line lands ~2s after the wise block
    }, 4780);     // a long, considered typing beat (4.78s) so the wise answer feels deliberated
  }

  // ---- TOPIC: 5 featured question chips ----
  function gotoTopic(tp) {
    state = 'TOPIC';
    C.track('topic_open', { topic: tp.category });
    var intro = (lang === 'vi' ? tp.intro_vi : tp.intro_en) || '';
    botMsg(linkify(intro), function () {
      var qs = E.byFeatured(tp.category);
      var chips = qs.map(function (q) {
        return { label: (lang === 'vi' ? q.q_vi : q.q_en), onClick: function () { addUser(lang === 'vi' ? q.q_vi : q.q_en); gotoAnswer(q, 'chip'); } };
      });
      chips.push({ label: t().back, cls: 'ipc-back', onClick: function () { gotoWelcome(true); } });
      addChips(chips);
    });
  }

  // ---- ANSWER ----
  function gotoAnswer(entry, via) {
    state = 'ANSWER';
    C.track('answer_hit', { id: entry.id, via: via });
    var ans = lang === 'vi' ? entry.a_vi : entry.a_en;
    botMsg(linkify(ans), function () {
      // primary CTA from the entry's cta tag
      if (entry.cta === 'book') {
        addCta(t().ctaBook, { href: 'booking.html', onClick: function () { C.track('cta_book_click', { id: entry.id }); } });
      } else if (entry.cta === 'accommodation') {
        addCta(t().ctaView, { href: 'accommodation.html', cls: 'terracotta', onClick: function () { C.track('cta_quote_click', { id: entry.id, kind: 'view' }); } });
      } else if (entry.cta === 'quote') {
        addCta(t().ctaQuote, { cls: 'terracotta', onClick: function () { C.track('cta_quote_click', { id: entry.id }); offerCapture({ intent: 'quote', question: entry.q_en }, true); } });
      } else if (entry.cta === 'lead') {
        // a natural capture moment: offer, do not force
        addCta(t().ctaQuote, { cls: 'terracotta', onClick: function () { offerCapture({ intent: 'lead', question: entry.q_en }, true); } });
      }
      // After answering, gently ask if there is anything else, then show
      // related follow-up chips + back.
      var rel = (entry._suggest || E.related(entry.id)) || [];
      botMsg(linkify(t().more), function () {
        var chips = rel.slice(0, 3).map(function (q) {
          return { label: (lang === 'vi' ? q.q_vi : q.q_en), onClick: function () { addUser(lang === 'vi' ? q.q_vi : q.q_en); gotoAnswer(q, 'related'); } };
        });
        chips.push({ label: t().back, cls: 'ipc-back', onClick: function () { gotoWelcome(true); } });
        addChips(chips);
      }, 4670);  // longer typing pause before the "anything else?" nudge
    });
  }

  // ---- free text (works at any state) ----
  function onText(text) {
    text = (text || '').trim(); if (!text) return;
    addUser(text);
    C.track('question', { q: text, lang: lang });
    if (!E.ready) { botMsg(linkify(t().offline)); return; }
    var r = E.match(text, lang);
    if (r.status === 'joke') { C.track('joke', { q: text }); renderJoke(r.joke); return; }
    if (r.status === 'cat') { C.track('cat', { q: text }); renderCat(r.cat); return; }
    if (r.status === 'smalltalk') { C.track('smalltalk', { kind: r.kind, intent: r.intentId || null }); renderSmalltalk(r.kind, r.reply); return; }
    if (r.status === 'wise') { C.track('smalltalk', { kind: 'wise', intent: r.intentId || null }); renderWise(r.reply, r.tail); return; }
    if (r.status === 'hit') { smalltalkStreak = 0; r.entry._suggest = r.suggestions; gotoAnswer(r.entry, 'text'); }
    else { C.track('answer_miss', { q: text }); offerCapture({ intent: 'help', question: text }, false); }
  }

  function renderJoke(joke) {
    state = 'ANSWER';
    botMsg(linkify(lang === 'vi' ? joke.vi : joke.en), function () {
      addChips([
        { label: lang === 'vi' ? 'Kể nữa đi' : 'One more', onClick: function () { var nxt = lang === 'vi' ? 'Kể nữa đi' : 'One more'; addUser(nxt); C.track('joke', { again: true }); renderJoke(E.joke()); } },
        { label: t().back, cls: 'ipc-back', onClick: function () { gotoWelcome(true); } }
      ]);
    });
  }

  function renderCat(cat) {
    state = 'ANSWER';
    botMsg(linkify(lang === 'vi' ? cat.vi : cat.en), function () {
      addChips([
        { label: 'Pspsps', onClick: function () { addUser('Pspsps'); C.track('cat', { again: true }); renderCat(E.cat()); } },
        { label: t().back, cls: 'ipc-back', onClick: function () { gotoWelcome(true); } }
      ]);
    });
  }

  // ---- CAPTURE: value-first, one question at a time ----
  function offerCapture(ctx, fromButton) {
    state = 'CAPTURE';
    if (C.hasCaptured()) { botMsg(linkify(t().thanks), function () { maybeQualify(ctx); }); return; }
    C.track('capture_shown', ctx.intent ? { intent: ctx.intent } : null);
    // From a CTA (e.g. "Get my quote" after a useful answer) or "talk to a human"
    // the visitor already showed clear intent, so skip the soft "shall the team
    // reach out?" confirmation and go straight to asking for contact. The
    // "I would love to make sure you get the right answer" line is reserved for
    // the no-clear-answer path, where the bot is the one offering to follow up.
    if (fromButton) { askContact(ctx); return; }
    botMsg(linkify(t().offer), function () {
      addChips([
        { label: t().yes, onClick: function () { askContact(ctx); } },
        { label: t().no, cls: 'ipc-back', onClick: function () { botMsg(linkify(t().declined), function () { gotoWelcome(true); }); } }
      ]);
    });
  }
  function askContact(ctx) {
    botMsg(linkify(t().askContact), function () {
      var wrap = el('div', 'ipc-capture');
      var field = el('input'); field.type = 'text'; field.placeholder = t().contactPh; field.setAttribute('autocomplete', 'off'); field.setAttribute('inputmode', 'email');
      var btn = el('button'); btn.type = 'button'; btn.textContent = t().send;
      wrap.appendChild(field); wrap.appendChild(btn); scrollEl.appendChild(wrap);
      var priv = el('div', 'ipc-privacy', t().privacy); scrollEl.appendChild(priv);
      scrollBottom(); try { field.focus(); } catch (e) {}
      function submit() {
        var v = field.value;
        var res = C.validateContact(v);
        if (!res.ok) { botMsg(linkify(t().bad)); return; }
        addUser(v); wrap.remove(); priv.remove();
        ctx.email = res.email; ctx.phone = res.phone;
        C.submitLead(res, ctx);
        botMsg(linkify(t().thanks), function () { maybeQualify(ctx); });
      }
      btn.addEventListener('click', submit);
      field.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    });
  }
  // optional gentle qualification, only for booking/quote intent, each skippable
  function maybeQualify(ctx) {
    if (ctx.intent !== 'book' && ctx.intent !== 'quote' && ctx.intent !== 'lead') { return gotoWelcome(true); }
    qStep(ctx, 'qWhen', 'qWhenO', 'dates', function () {
      qStep(ctx, 'qWho', 'qWhoO', 'party', function () {
        qStep(ctx, 'qLong', 'qLongO', 'length', function () {
          if (ctx.dates || ctx.party || ctx.length) C.submitQualification(ctx);
          gotoWelcome(true);
        });
      });
    });
  }
  function qStep(ctx, qKey, oKey, field, next) {
    botMsg(linkify(t()[qKey]), function () {
      var chips = t()[oKey].map(function (o) { return { label: o, onClick: function () { addUser(o); ctx[field] = o; next(); } }; });
      chips.push({ label: t().skip, cls: 'ipc-back', onClick: function () { next(); } });
      addChips(chips);
    });
  }

  // ---- open / close / language ----
  function open() {
    panel.classList.add('open'); document.body.classList.add('ipc-chat-open');
    launcher.classList.add('ipc-open-state', 'ipc-pulse-off');
    launcher.classList.remove('ipc-pulse', 'ipc-has-nudge'); hideNudge();
    setLauncherIcon(true);
    if (!openedOnce) {
      openedOnce = true;
      C.track('open');
      if (E.ready) { gotoWelcome(false); }
      else { botMsg(linkify(t().loading)); E.load().then(function (ok) { if (ok) gotoWelcome(false); else botMsg(linkify(t().offline)); }); }
    }
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 350);
  }
  function close() { panel.classList.remove('open'); document.body.classList.remove('ipc-chat-open'); launcher.classList.remove('ipc-open-state'); setLauncherIcon(false); }
  function toggle() { panel.classList.contains('open') ? close() : open(); }
  function setLang(l) {
    if (l === lang) return; lang = l;
    langWrap.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-l') === l); });
    input.placeholder = t().placeholder;
    // Re-introduce the menu in the new language. Greet in FULL only the first
    // time a language is shown; after that just offer a light follow-up, so the
    // greeting does not spam every time the guest toggles EN/VI.
    if (openedOnce) gotoWelcome(!!greetedLangs[lang]);
  }

  // ---- proactive nudge (repeats on intent pages: pops every 30s, shows 5s) ----
  function maybeNudge() {
    var page = (location.pathname.split('/').pop() || '').toLowerCase();
    if (page.indexOf('accommodation') < 0 && page.indexOf('booking') < 0) return;
    var GAP = 30000, VISIBLE = 5000;
    (function cycle() {
      setTimeout(function () {
        cycle();   // re-arm so a new bubble appears every GAP ms
        // skip this round if the chat is open or a bubble is still on screen
        if (panel.classList.contains('open') || nudgeEl) return;
        launcher.classList.add('ipc-has-nudge');
        nudgeEl = el('div', 'ipc-nudge', '<button class="ipc-nudge-x" aria-label="Dismiss">&times;</button>' + esc(catNudge()));
        document.body.appendChild(nudgeEl);
        clearBottomBars();   // line the bubble up with the launcher's current (possibly lifted) position
        requestAnimationFrame(function () { nudgeEl.classList.add('show'); });
        nudgeEl.addEventListener('click', function (e) { if (e.target.classList.contains('ipc-nudge-x')) { hideNudge(); launcher.classList.remove('ipc-has-nudge'); return; } open(); });
        // auto-dismiss after 5s if the guest does not interact, then it re-pops next cycle.
        setTimeout(function () { hideNudge(); launcher.classList.remove('ipc-has-nudge'); }, VISIBLE);
      }, GAP);
    })();
  }
  function hideNudge() { if (nudgeEl) { nudgeEl.classList.remove('show'); var n = nudgeEl; setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 300); nudgeEl = null; } }

  // ---- icons ----
  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>';
  // The mascot. Save the cat image to this path; until it exists the launcher
  // and avatar fall back to a chat icon / penguin so nothing looks broken.
  var MASCOT_SRC = 'assets/img/chatbot-cat.png';
  function mascotImg(fallbackHtml, holder) {
    var im = new Image(); im.src = MASCOT_SRC; im.alt = ''; im.className = 'ipc-face';
    im.onerror = function () { holder.innerHTML = fallbackHtml; };
    return im;
  }
  function setLauncherIcon(isOpen) {
    var ic = launcher.querySelector('.ipc-ic'); ic.innerHTML = '';
    if (isOpen) { ic.innerHTML = ICON_CLOSE; launcher.classList.remove('ipc-face-mode'); }
    else { ic.appendChild(mascotImg(ICON_CHAT, ic)); launcher.classList.add('ipc-face-mode'); }
  }

  // ---- build DOM ----
  function build() {
    launcher = el('button', 'ipc-launcher ipc-pulse'); launcher.type = 'button'; launcher.setAttribute('aria-label', 'Open chat');
    launcher.innerHTML = '<span class="ipc-ic"></span><span class="ipc-dot"></span>';
    launcher.addEventListener('click', toggle);
    setLauncherIcon(false);

    panel = el('div', 'ipc-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'ipartment help chat');
    var head = el('div', 'ipc-head');
    var avatar = el('div', 'ipc-avatar'); avatar.appendChild(mascotImg('🐧', avatar)); head.appendChild(avatar);
    var titles = el('div', 'ipc-head-titles', '<div class="ipc-name">ipartment</div><div class="ipc-sub">' + esc(t().sub) + '</div>');
    head.appendChild(titles);
    langWrap = el('div', 'ipc-lang');
    langWrap.innerHTML = '<button type="button" data-l="en" class="' + (lang === 'en' ? 'active' : '') + '">EN</button><button type="button" data-l="vi" class="' + (lang === 'vi' ? 'active' : '') + '">VI</button>';
    langWrap.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { setLang(b.getAttribute('data-l')); }); });
    head.appendChild(langWrap);
    var closeBtn = el('button', 'ipc-close'); closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', 'Close'); closeBtn.innerHTML = ICON_CLOSE;
    closeBtn.addEventListener('click', close); head.appendChild(closeBtn);
    panel.appendChild(head);

    scrollEl = el('div', 'ipc-scroll'); panel.appendChild(scrollEl);

    var form = el('form', 'ipc-input');
    input = el('input'); input.type = 'text'; input.placeholder = t().placeholder; input.setAttribute('autocomplete', 'off'); input.setAttribute('aria-label', 'Type your question');
    sendBtn = el('button', 'ipc-send'); sendBtn.type = 'submit'; sendBtn.setAttribute('aria-label', 'Send'); sendBtn.innerHTML = ICON_SEND;
    form.appendChild(input); form.appendChild(sendBtn);
    form.addEventListener('submit', function (e) { e.preventDefault(); var v = input.value; input.value = ''; onText(v); });
    panel.appendChild(form);

    document.body.appendChild(launcher);
    document.body.appendChild(panel);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) close(); });

    // Lift the launcher (and panel) above any wide fixed bar anchored to the
    // bottom of the page (the booking page #controls bar, a sticky mobile book
    // bar, etc.) so it never covers a Continue / primary button.
    setTimeout(clearBottomBars, 600);
    setTimeout(clearBottomBars, 1600);
    window.addEventListener('resize', clearBottomBars);
  }

  function clearBottomBars() {
    if (!launcher) return;
    var mobile = window.innerWidth <= 560;
    var base = mobile ? 16 : 22;
    var top = null;
    Array.prototype.slice.call(document.querySelectorAll('footer,nav,div,section')).forEach(function (e) {
      if (e === panel || e === launcher || panel.contains(e)) return;
      var s = window.getComputedStyle(e);
      if (s.position !== 'fixed' && s.position !== 'sticky') return;
      if (s.display === 'none' || s.visibility === 'hidden') return;
      var b = e.getBoundingClientRect();
      if (b.height < 24 || b.height > 160) return;
      if (b.width < window.innerWidth * 0.5) return;
      // "at the bottom" must allow for STACKED bars: on the booking page the live
      // receipt docks as a full-width bar sitting on top of the controls footer,
      // so its bottom edge is ~90px up, not flush. An 80px window missed it and
      // the launcher landed on the receipt. 170px catches a bar stacked above an
      // ~84px footer while still ignoring genuinely mid-page fixed elements.
      if (b.bottom < window.innerHeight - 170) return;
      if (top === null || b.top < top) top = b.top;
    });
    var lift = (top !== null) ? Math.max(base, Math.round(window.innerHeight - top) + 14) : base;
    launcher.style.bottom = lift + 'px';
    if (nudgeEl) nudgeEl.style.bottom = (lift + 82) + 'px';
    // On desktop the panel floats just above the launcher; lift it too. On
    // mobile the panel is laid out by CSS (near full-screen) so leave it alone.
    if (!mobile && top !== null) {
      panel.style.bottom = (lift + 68) + 'px';
      panel.style.maxHeight = Math.max(360, window.innerHeight - (lift + 68) - 16) + 'px';
    } else if (!mobile) {
      panel.style.bottom = ''; panel.style.maxHeight = '';
    } else {
      panel.style.bottom = ''; panel.style.maxHeight = '';
    }
  }

  function init() {
    var page = (location.pathname.split('/').pop() || '').toLowerCase();
    if (page.indexOf('admin') === 0) return; // no customer chat on the admin dashboard
    build();
    E.load(); // warm the index in the background
    maybeNudge();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
