/* ============================================================
   ipartment chatbot - matching engine (NO AI)
   Loads the 200-question library, normalises + synonym-expands the
   input, and runs an ordered cascade (exact -> keyword/idf -> Fuse
   fuzzy -> miss). Every answer returned is verbatim library text.
   Depends on window.Fuse (assets/js/chatbot/fuse.min.js loaded first).
   No em dashes or en dashes anywhere by project rule.
   ============================================================ */
(function () {
  'use strict';

  var DATA_URL = 'assets/js/data/faq-200.json';

  // ---- tunables (kept here so they are easy to re-tune from misses) ----
  var FUZZY_THRESHOLD = 0.45;   // gate (a): strict fuzzy score that auto-hits (0 best, 1 worst)
  var FUSE_INDEX_THRESHOLD = 0.6; // how loosely Fuse surfaces candidates (paths b/c then filter them)
  var KW_RARE_IDF     = 3.0;    // a shared token is "distinctive" at/above this idf
  var KW_MIN_SHARED   = 2;      // distinctive keyword path needs this many shared tokens
  var KW_OK_FUSE      = 0.78;   // gate (c): one distinctive keyword can hit if fuzzy is at least this plausible
  var SUGGEST_FLOOR   = 0.30;   // min combined similarity for a follow-up suggestion

  // ---- normalisation: lowercase, strip accents (incl Vietnamese d-stroke) ----
  function normalise(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip combining diacritics
      .replace(/đ/g, 'd')                           // Vietnamese d-stroke does not decompose
      .replace(/[^a-z0-9\s]/g, ' ')                      // drop punctuation
      .replace(/\s+/g, ' ')
      .trim();
  }
  function tokens(s) { return normalise(s).split(' ').filter(function (t) { return t.length >= 2; }); }
  function uniq(a) { var seen = {}, out = []; a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out; }
  // light singular stem so "dogs" matches "dog", "rates" matches "rate", etc.
  function stem(t) { return (t.length >= 4 && t.charAt(t.length - 1) === 's' && t.slice(-2) !== 'ss') ? t.slice(0, -1) : t; }
  function withStems(arr) { var out = []; arr.forEach(function (t) { out.push(t); var s = stem(t); if (s !== t) out.push(s); }); return out; }

  // ---- synonym expansion: append real phrases when a variant is present ----
  // key = phrase to append (tokenised later); values = variants that trigger it.
  var SYNONYMS = {
    'price': ['cost', 'rate', 'fee', 'how much', 'pricing', 'charge', 'expensive', 'cheap', 'budget'],
    'wifi internet': ['internet', 'network', 'connection', 'online', 'mbps', 'wi fi'],
    'pet': ['dog', 'cat', 'animal', 'pets'],
    'check in': ['arrival', 'arrive', 'arriving', 'early check'],
    'check out': ['departure', 'depart', 'leaving', 'late check'],
    'parking': ['park', 'car', 'motorbike', 'scooter', 'garage', 'bike'],
    'monthly long stay': ['long stay', 'monthly', 'extended', 'relocation', 'relocate', 'long term'],
    'book': ['booking', 'reserve', 'reservation'],
    'contact': ['phone', 'email', 'call', 'reach', 'talk', 'human', 'person', 'agent', 'someone'],
    'location thao dien': ['where', 'address', 'area', 'district', 'neighbourhood', 'neighborhood', 'metro', 'located'],
    'cancel refund': ['cancellation', 'refund', 'cancelling', 'canceling'],
    'cleaning': ['clean', 'housekeeping', 'laundry'],
    'kitchen': ['cook', 'cooking', 'stove', 'fridge', 'kitchenette'],
    'discount': ['promo', 'promotion', 'voucher', 'coupon', 'deal']
  };
  // Precompile word-boundary matchers so "car" does not fire inside "scarf".
  var SYN_RULES = [];
  Object.keys(SYNONYMS).forEach(function (append) {
    SYNONYMS[append].concat(normalise(append)).forEach(function (variant) {
      var v = normalise(variant);
      if (!v) return;
      SYN_RULES.push({ append: append, re: new RegExp('(^|\\s)' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)') });
    });
  });
  function expand(qn) {
    var extra = [];
    SYN_RULES.forEach(function (r) {
      if (r.re.test(qn) && extra.indexOf(r.append) === -1) extra.push(r.append);
    });
    return extra.length ? (qn + ' ' + extra.join(' ')) : qn;
  }

  // ---- joke easter egg ----
  // When a guest asks for a joke (English or Vietnamese), serve one from a small
  // rotating set in the spirit of current Vietnamese internet humour. Clean and
  // brand-safe; edit JOKES freely (each entry has an en and a vi line).
  var JOKE_RE = /(\bjokes?\b|make me laugh|cheer me up|something funny|say something funny|tell me a joke|chuyen cuoi|chuyen hai|chuyen vui|ke mot chuyen|ke 1 chuyen|cho toi cuoi|lam toi cuoi|noi gi vui|tau hai|ke joke)/;
  var JOKES = [
    { en: "Why do not fish play basketball? They are afraid of the net.", vi: "Tại sao cá không chơi bóng rổ? Vì nó sợ lưới." },
    { en: "In Saigon, 'I will be there in 5 minutes' means: brew a coffee, drink it, then brew another one.", vi: "Ở Sài Gòn, '5 phút nữa tới' nghĩa là: pha ly cà phê, uống xong, rồi pha thêm ly nữa." },
    { en: "I told everyone my apartment has a million dollar view. Turns out it looks straight into my neighbor's living room.", vi: "Tôi khoe căn hộ của mình 'view triệu đô'. Hóa ra là nhìn thẳng vào phòng khách nhà hàng xóm." },
    { en: "I am on a diet. Today I only had a little of everything. In total, it was a lot.", vi: "Tôi đang ăn kiêng. Hôm nay chỉ ăn mỗi thứ một ít. Cộng lại thành rất nhiều." },
    { en: "I am not addicted to coffee. I just do not function without it.", vi: "Tôi không nghiện cà phê đâu. Chỉ là thiếu nó thì tôi không hoạt động được thôi." },
    { en: "Payday is like Saigon weather. Sunny for a moment, then it pours.", vi: "Ngày lương về giống thời tiết Sài Gòn: nắng được một lúc rồi mưa ngay." },
    { en: "My crush asked what food I like. I said: wedding cake.", vi: "Crush hỏi tôi thích ăn món gì. Tôi trả lời: cơm cưới." },
    { en: "Deadlines are like an ex. They come back right when you finally feel happy.", vi: "Deadline giống người yêu cũ: cứ quay lại đúng lúc bạn vừa thấy vui." },
    { en: "The only thing faster than me running to a sale is the wifi at ipartment.", vi: "Thứ duy nhất chạy nhanh hơn tôi khi nghe có sale chính là wifi ở ipartment." },
    { en: "Monday called. It said it is on the way and there is nothing you can do.", vi: "Thứ Hai vừa gọi. Nó bảo đang trên đường tới và bạn không cản được đâu." },
    { en: "I love sleeping. My life tends to fall apart whenever I am awake.", vi: "Tôi mê ngủ lắm. Tại đời tôi cứ hễ thức dậy là y như rằng có chuyện." },
    { en: "I bought a plant to feel responsible. Now I have a dead plant and trust issues.", vi: "Tôi mua một cây xanh để tập có trách nhiệm. Giờ tôi có thêm một cây chết và niềm tin lung lay." },
    { en: "I followed my heart. It led me to the fridge. Twice.", vi: "Tôi nghe theo con tim. Nó dẫn tôi tới cái tủ lạnh. Hai lần." },
    { en: "My phone is at 1 percent and still braver than me.", vi: "Điện thoại tôi còn 1 phần trăm pin mà vẫn gan hơn tôi." },
    { en: "Why does the cat love sitting on the laptop? To keep an eye on the mouse.", vi: "Tại sao mèo thích nằm trên laptop? Để canh chừng con chuột." }
  ];
  var jokeIdx = Math.floor(Math.random() * JOKES.length);
  function nextJoke() { jokeIdx = (jokeIdx + 1) % JOKES.length; return JOKES[jokeIdx]; }

  // ---- state ----
  var raw = null;          // parsed JSON
  var entries = [];        // augmented entries (with normalised fields + token sets)
  var byIdMap = {};
  var df = {};             // document frequency per token
  var N = 0;
  var fuse = null;

  function idf(t) { return Math.log(N / (1 + (df[t] || 0))); }

  function buildIndex() {
    entries = raw.entries.map(function (e) {
      var a = Object.assign({}, e);
      a._q_en = normalise(e.q_en);
      a._q_vi = normalise(e.q_vi);
      a._kw = normalise(e.keywords);
      a._a_en = normalise(e.a_en);
      a._tokens = uniq(withStems(tokens(e.keywords).concat(tokens(e.q_en)).concat(tokens(e.q_vi))));
      a._set = {}; a._tokens.forEach(function (t) { a._set[t] = 1; });
      return a;
    });
    N = entries.length;
    df = {};
    entries.forEach(function (e) { e._tokens.forEach(function (t) { df[t] = (df[t] || 0) + 1; }); });
    byIdMap = {};
    entries.forEach(function (e) { byIdMap[e.id] = e; });
    fuse = new window.Fuse(entries, {
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
      keys: [
        { name: '_q_en', weight: 0.5 },
        { name: '_q_vi', weight: 0.5 },
        { name: '_kw', weight: 0.35 },
        { name: '_a_en', weight: 0.1 }
      ],
      threshold: FUSE_INDEX_THRESHOLD
    });
  }

  // ---- keyword/idf scoring ----
  function keywordScores(qTokens) {
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i], score = 0, shared = 0, hasRare = false, maxIdf = 0;
      for (var j = 0; j < qTokens.length; j++) {
        var t = qTokens[j];
        if (e._set[t]) { var w = idf(t); score += w; shared++; if (w >= KW_RARE_IDF) hasRare = true; if (w > maxIdf) maxIdf = w; }
      }
      if (shared) out.push({ entry: e, score: score, shared: shared, hasRare: hasRare, maxIdf: maxIdf });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  // ---- build the ranked candidate set for a query ----
  function analyze(text) {
    var qn = normalise(text);
    if (!qn || qn.length < 2) return null;
    var baseTokens = uniq(withStems(tokens(qn)));
    var qx = expand(baseTokens.join(' '));
    var qTokens = uniq(withStems(tokens(qx)));

    var exact = null;
    for (var i = 0; i < entries.length; i++) {
      if (qn === entries[i]._q_en || qn === entries[i]._q_vi) { exact = entries[i]; break; }
    }

    var kw = keywordScores(qTokens);
    var maxKw = kw.length ? kw[0].score : 0;
    var fz = fuse.search(qx).slice(0, 8); // [{ item, score }]

    var cand = {};
    function bump(e, fuseScore, k) {
      var c = cand[e.id] || { entry: e, fuse: 1, kw: 0, shared: 0, hasRare: false, maxIdf: 0 };
      if (fuseScore != null && fuseScore < c.fuse) c.fuse = fuseScore;
      if (k && k.score > c.kw) { c.kw = k.score; c.shared = k.shared; c.hasRare = k.hasRare; c.maxIdf = k.maxIdf; }
      cand[e.id] = c;
    }
    fz.forEach(function (r) { bump(r.item, r.score, null); });
    kw.slice(0, 8).forEach(function (k) { bump(k.entry, null, k); });

    var list = Object.keys(cand).map(function (id) {
      var c = cand[id];
      c.combined = (1 - c.fuse) * 0.7 + (maxKw ? (c.kw / maxKw) : 0) * 0.3;
      return c;
    });
    list.sort(function (a, b) { return b.combined - a.combined; });

    // Best distinctive-keyword candidate, taken from the FULL keyword list so a
    // rare token (e.g. "pool", "pay") is not crowded out of the top-N by entries
    // that merely share common words. Ranked by rarest shared token, then score.
    var kb = null;
    for (var ki = 0; ki < kw.length; ki++) {
      var k = kw[ki];
      if (!k.hasRare) continue;
      k._fuse = cand[k.entry.id] ? cand[k.entry.id].fuse : 1;
      // prefer the strongest total keyword score; tie-break by closer fuzzy, then rarity
      if (!kb
        || k.score > kb.score
        || (k.score === kb.score && k._fuse < kb._fuse)
        || (k.score === kb.score && k._fuse === kb._fuse && k.maxIdf > kb.maxIdf)) kb = k;
    }
    var kbCand = kb ? { entry: kb.entry, fuse: kb._fuse, kw: kb.score, shared: kb.shared, hasRare: true, maxIdf: kb.maxIdf } : null;

    return { qn: qn, qx: qx, qTokens: qTokens, exact: exact, list: list, kb: kbCand };
  }

  // ---- the cascade decision: strong fuzzy OR a distinctive keyword ----
  function match(text, lang) {
    if (JOKE_RE.test(normalise(text))) return { status: 'joke', joke: nextJoke(), score: 0, via: 'joke', suggestions: [] };
    var a = analyze(text);
    if (!a) return { status: 'miss', entry: null, score: 1, via: null, suggestions: [] };
    if (a.exact) return { status: 'hit', entry: a.exact, score: 0, via: 'exact', suggestions: relatedEntries(a.exact.id, 3) };
    if (!a.list.length) return { status: 'miss', entry: null, score: 1, via: null, suggestions: [] };

    var fb = a.list[0];  // fuzzy-leaning best (top combined score)
    var kb = a.kb;       // best DISTINCTIVE-keyword candidate (from the full kw list)

    // Prefer a strong fuzzy match; otherwise fall to the distinctive-keyword
    // candidate (which may be a different, more on-topic entry than the
    // fuzzy-best). Every keyword path REQUIRES a rare token, so generic overlaps
    // (only common words shared, e.g. "rooftop helipad") never win and go to capture.
    var chosen = null, via = null;
    if (fb.fuse <= FUZZY_THRESHOLD) { chosen = fb; via = 'fuzzy'; }
    else if (kb && kb.shared >= KW_MIN_SHARED) { chosen = kb; via = 'keyword'; }       // (b) 2+ overlap incl. a distinctive token
    else if (kb && kb.fuse <= KW_OK_FUSE) { chosen = kb; via = 'keyword'; }             // (c) 1 distinctive token + plausible fuzzy

    if (!chosen) {
      return { status: 'miss', entry: null, score: fb.fuse, via: null, suggestions: [],
        _dbg: { fbId: fb.entry.id, fbFuse: +fb.fuse.toFixed(3), kbId: kb ? kb.entry.id : null, kbShared: kb ? kb.shared : 0, kbFuse: kb ? +kb.fuse.toFixed(3) : null, kbMaxIdf: kb ? +kb.maxIdf.toFixed(2) : null } };
    }
    var suggestions = a.list.filter(function (c) { return c.entry.id !== chosen.entry.id && c.combined >= SUGGEST_FLOOR; })
      .slice(0, 3).map(function (c) { return c.entry; });
    if (suggestions.length < 2) suggestions = relatedEntries(chosen.entry.id, 3);
    return { status: 'hit', entry: chosen.entry, score: chosen.fuse, via: via, suggestions: suggestions };
  }

  // ---- menu / library helpers ----
  function order() { return (raw && raw.category_order) || []; }
  function categories() {
    var counts = {};
    entries.forEach(function (e) { counts[e.category] = (counts[e.category] || 0) + 1; });
    return order().map(function (c) { return { name: c, count: counts[c] || 0 }; });
  }
  function byCategory(cat) { return entries.filter(function (e) { return e.category === cat; }); }
  function byFeatured(cat) {
    return entries.filter(function (e) { return e.category === cat && e.featured; })
      .sort(function (a, b) { return (a.featured_order || 99) - (b.featured_order || 99); })
      .slice(0, 5);
  }
  function byId(id) { return byIdMap[id] || null; }
  function topics() {
    var t = (raw && raw.topics) || [];
    var rank = {}; order().forEach(function (c, i) { rank[c] = i; });
    return t.slice().sort(function (a, b) { return (rank[a.category] == null ? 99 : rank[a.category]) - (rank[b.category] == null ? 99 : rank[b.category]); });
  }
  function welcome(lang) { var w = (raw && raw.welcome) || {}; return (lang === 'vi' ? w.vi : w.en) || w.en || ''; }
  function relatedEntries(id, n) {
    var self = byIdMap[id]; if (!self) return [];
    var sibs = entries.filter(function (e) { return e.id !== id && e.category === self.category; });
    // prefer featured siblings first, then by featured_order, then natural order
    sibs.sort(function (a, b) {
      if (!!b.featured - !!a.featured) return (!!b.featured) - (!!a.featured);
      return (a.featured_order || 99) - (b.featured_order || 99);
    });
    return sibs.slice(0, n || 3);
  }

  // ---- public API ----
  window.ipartmentChatEngine = {
    ready: false,
    loadError: null,
    load: function () {
      var self = this;
      if (self._loading) return self._loading;
      self._loading = fetch(DATA_URL)
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (json) {
          raw = json; buildIndex(); self.ready = true; return true;
        })
        .catch(function (err) {
          self.loadError = err; self.ready = false;
          if (window.console) console.warn('[chatbot] library load failed:', err && err.message);
          return false;
        });
      return self._loading;
    },
    match: match,
    joke: nextJoke,
    categories: categories,
    byCategory: byCategory,
    byFeatured: byFeatured,
    byId: byId,
    topics: topics,
    welcome: welcome,
    related: function (id) { return relatedEntries(id, 3); },
    // exposed for tuning/tests only
    _normalise: normalise,
    _expand: expand,
    _debug: function (text) { var a = analyze(text); if (!a) return null; return { qx: a.qx, top: a.list.slice(0, 6).map(function (c) { return { id: c.entry.id, q: c.entry.q_en.slice(0, 42), fuse: +c.fuse.toFixed(3), kw: +c.kw.toFixed(2), shared: c.shared, hasRare: c.hasRare, maxIdf: +c.maxIdf.toFixed(2), combined: +c.combined.toFixed(3) }; }) }; },
    _find: function (sub) { sub = normalise(sub); return entries.filter(function (e) { return e._kw.indexOf(sub) > -1 || e._q_en.indexOf(sub) > -1; }).map(function (e) { return { id: e.id, q: e.q_en, kw: e.keywords }; }); }
  };
})();
