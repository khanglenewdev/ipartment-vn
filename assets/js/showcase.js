/* ============================================================
   Library showcase: filtering + the "Your build" recipe engine.
   Reads window.LIB (the library data dumped by showcase.njk).
   ============================================================ */
(function () {
  'use strict';
  var LIB = window.LIB || {};
  var goals = (LIB.goals && LIB.goals.items) || [];
  var niches = (LIB.niches && LIB.niches.items) || [];
  var sections = (LIB.sections && LIB.sections.items) || [];
  var functions = (LIB.functions && LIB.functions.items) || [];

  var sectionOrder = sections.map(function (s) { return s.id; });
  var sectionById = {}; sections.forEach(function (s) { sectionById[s.id] = s; });
  var goalById = {}; goals.forEach(function (g) { goalById[g.id] = g; });
  var nicheById = {}; niches.forEach(function (n) { nicheById[n.id] = n; });
  var fnById = {}; functions.forEach(function (f) { fnById[f.id] = f; });

  var state = { niche: '', goals: [] };

  var nicheSelect = document.getElementById('nicheSelect');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.sc-chip[data-goal]'));
  var resetBtn = document.getElementById('resetBtn');

  function intersects(listStr, set) {
    if (!set.length) return true; // no goal filter = show all
    var parts = (listStr || '').split(/\s+/);
    for (var i = 0; i < set.length; i++) { if (parts.indexOf(set[i]) !== -1) return true; }
    return false;
  }
  function nicheMatch(listStr) {
    if (!state.niche) return true;
    var parts = (listStr || '').split(/\s+/);
    return parts.indexOf('all') !== -1 || parts.indexOf(state.niche) !== -1;
  }

  // ---- filter the catalog ----
  function applyFilter() {
    document.querySelectorAll('.sc-variant').forEach(function (card) {
      var show = intersects(card.getAttribute('data-goals'), state.goals) && nicheMatch(card.getAttribute('data-niches'));
      card.classList.toggle('is-hidden', !show);
    });
    document.querySelectorAll('.sc-function').forEach(function (card) {
      var show = intersects(card.getAttribute('data-goals'), state.goals);
      card.classList.toggle('is-hidden', !show);
    });
    // hide a section block if it has no visible variants
    document.querySelectorAll('.sc-section-block[data-sectiontype]').forEach(function (block) {
      var any = block.querySelector('.sc-variant:not(.is-hidden)');
      block.style.display = any ? '' : 'none';
    });
  }

  // ---- recommend a variant for a section type given chosen goals ----
  function recommendVariant(sectionId) {
    var sec = sectionById[sectionId];
    if (!sec || !sec.variants.length) return null;
    if (state.goals.length) {
      for (var i = 0; i < sec.variants.length; i++) {
        var v = sec.variants[i];
        for (var j = 0; j < state.goals.length; j++) {
          if ((v.goals || []).indexOf(state.goals[j]) !== -1) return v;
        }
      }
    }
    // fallback: a built variant, else the first
    for (var k = 0; k < sec.variants.length; k++) { if (sec.variants[k].built) return sec.variants[k]; }
    return sec.variants[0];
  }

  function uniq(arr) { var s = {}, o = []; arr.forEach(function (x) { if (x && !s[x]) { s[x] = 1; o.push(x); } }); return o; }

  // ---- build the recipe ----
  function buildRecipe() {
    var niche = nicheById[state.niche];
    var sub = document.getElementById('buildSub');
    var pagesEl = document.getElementById('buildPages');
    var secsEl = document.getElementById('buildSections');
    var fnsEl = document.getElementById('buildFunctions');

    // pages
    if (niche) {
      pagesEl.innerHTML = niche.pages.map(function (p) { return '<li>' + p + '</li>'; }).join('');
    } else {
      pagesEl.innerHTML = '<li class="sc-build-empty">Pick a niche</li>';
    }

    // gather section types + function ids
    var secSet = [], fnSet = [];
    state.goals.forEach(function (gid) {
      var g = goalById[gid];
      if (g) { secSet = secSet.concat(g.sections || []); fnSet = fnSet.concat(g.functions || []); }
    });
    if (niche) { secSet = secSet.concat(niche.sectionsSpecial || []); fnSet = fnSet.concat(niche.functions || []); }
    secSet = uniq(secSet); fnSet = uniq(fnSet);

    // order sections canonically
    var orderedSecs = sectionOrder.filter(function (id) { return secSet.indexOf(id) !== -1; });

    if (orderedSecs.length) {
      secsEl.innerHTML = orderedSecs.map(function (id) {
        var sec = sectionById[id]; var rec = recommendVariant(id);
        return '<li>' + (sec ? sec.label : id) + '<span class="v">' + (rec ? rec.name : '') + '</span></li>';
      }).join('');
    } else {
      secsEl.innerHTML = '<li class="sc-build-empty">Pick goals</li>';
    }

    if (fnSet.length) {
      fnsEl.innerHTML = fnSet.map(function (id) {
        var f = fnById[id];
        return '<li>' + (f ? f.name : id) + '<span class="v">' + (f ? (f.built ? 'built' : 'spec') : '') + '</span></li>';
      }).join('');
    } else {
      fnsEl.innerHTML = '<li class="sc-build-empty">Pick goals</li>';
    }

    // subtitle
    var bits = [];
    if (niche) bits.push(niche.label);
    if (state.goals.length) bits.push(state.goals.map(function (g) { return goalById[g] ? goalById[g].label : g; }).join(' + '));
    sub.textContent = bits.length
      ? 'Recommended plan for: ' + bits.join('  /  ')
      : 'Pick a niche and goals above to assemble a recommended plan.';
  }

  function refresh() { applyFilter(); buildRecipe(); }

  // ---- events ----
  nicheSelect.addEventListener('change', function () { state.niche = this.value; refresh(); });
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var g = chip.getAttribute('data-goal');
      var i = state.goals.indexOf(g);
      if (i === -1) { state.goals.push(g); chip.classList.add('on'); }
      else { state.goals.splice(i, 1); chip.classList.remove('on'); }
      refresh();
    });
  });
  resetBtn.addEventListener('click', function () {
    state.niche = ''; state.goals = [];
    nicheSelect.value = '';
    chips.forEach(function (c) { c.classList.remove('on'); });
    refresh();
  });

  refresh();
})();
