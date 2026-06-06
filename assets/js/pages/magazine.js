/* Magazine - dynamic rendering, category filter, keyword search, newsletter */
(function() {
  'use strict';

  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const escapeAttr = s => escapeHtml(s);

  function featuredCard(featured) {
    const tag = featured.tag || 'Featured';
    const dateLine = [featured.date, featured.source].filter(Boolean).join(', ');
    const isExternal = featured.url && /^https?:\/\//.test(featured.url);
    const readLabel = featured.media === 'video' ? 'Watch the video' : 'Read article';
    return `
      <a href="${escapeAttr(featured.url || '#')}" ${isExternal ? 'target="_blank" rel="noopener"' : ''} class="featured-card">
        <div class="featured-img" style="background-image:url('${escapeAttr(featured.image)}');"></div>
        <div class="featured-text">
          <span class="tag" style="margin-bottom:18px;align-self:flex-start;">${escapeHtml(tag)}</span>
          <h2>${escapeHtml(featured.title)}</h2>
          <p>${escapeHtml(featured.excerpt)}</p>
          <div class="featured-meta">
            <span>${escapeHtml(dateLine)}</span>
            ${isExternal ? `<span class="read">${escapeHtml(readLabel)} &#8599;</span>` : ''}
          </div>
        </div>
      </a>
    `;
  }

  // Renders up to two featured stories side by side (compact dark cards).
  function renderFeatured(featuredList) {
    const slot = document.getElementById('featured-slot');
    const section = document.getElementById('featured-section');
    const list = (featuredList || []).filter(Boolean);
    // Nothing featured? Hide the whole Feature section (no awkward gap).
    if (!list.length) {
      if (section) section.style.display = 'none';
      if (slot) slot.innerHTML = '';
      return;
    }
    if (section) section.style.display = '';
    slot.innerHTML = '<div class="featured-grid' + (list.length === 1 ? ' featured-grid-single' : '') + '">' +
      list.map(featuredCard).join('') + '</div>';
  }

  function renderGrid(articles) {
    const grid = document.getElementById('article-grid');
    grid.innerHTML = articles.map(a => {
      const tag = a.tag || a.category || 'Article';
      const isExternal = a.url && /^https?:\/\//.test(a.url);
      const meta = a.date || '';
      return `
        <a href="${escapeAttr(a.url || '#')}" ${isExternal ? 'target="_blank" rel="noopener"' : ''} class="article-card" data-cat="${escapeAttr(a.category)}" data-keywords="${escapeAttr((a.keywords || '') + ' ' + (a.title || '') + ' ' + (a.source || ''))}">
          <div class="article-img-wrap"><img class="article-img" src="${escapeAttr(a.image)}" alt="${escapeAttr(a.title)}" loading="lazy" /></div>
          <div class="article-body">
            <span class="tag">${escapeHtml(tag)}</span>
            <h3 class="article-title">${escapeHtml(a.title)}</h3>
            <p class="article-excerpt">${escapeHtml(a.excerpt)}</p>
            ${meta ? `<p class="article-meta">${escapeHtml(meta)}</p>` : ''}
            ${a.source ? `<p class="article-source">${escapeHtml(a.source)} ${isExternal ? '&#8599;' : ''}</p>` : ''}
          </div>
        </a>
      `;
    }).join('');
  }

  function applyFilter() {
    const activeCat = document.querySelector('.cat-nav button.active').dataset.cat;
    const q = (document.getElementById('mag-search').value || '').toLowerCase().trim();
    let visible = 0;
    document.querySelectorAll('.article-card').forEach(card => {
      const cat = card.dataset.cat;
      const keywords = (card.dataset.keywords || '').toLowerCase();
      const title = card.querySelector('.article-title').textContent.toLowerCase();
      const matchesCat = activeCat === 'all' || cat === activeCat;
      const matchesQ = !q || keywords.includes(q) || title.includes(q);
      const show = matchesCat && matchesQ;
      card.classList.toggle('hide', !show);
      if (show) visible++;
    });
    document.getElementById('empty-state').style.display = visible ? 'none' : 'block';
  }

  function render() {
    const all = window.ipartmentLoadArticles ? window.ipartmentLoadArticles() : [];
    // Up to two featured stories (category === 'featured' OR featured: true).
    const featured = all.filter(a => a.featured === true || a.category === 'featured').slice(0, 2);
    const rest = all.filter(a => !featured.includes(a));
    renderFeatured(featured);
    renderGrid(rest);
    applyFilter();
  }

  // ── Init ──
  document.addEventListener('DOMContentLoaded', () => {
    render();

    document.querySelectorAll('.cat-nav button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-nav button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilter();
      });
    });

    document.getElementById('mag-search').addEventListener('input', applyFilter);

    document.getElementById('newsletter-form').addEventListener('submit', e => {
      e.preventDefault();
      const email = document.getElementById('news-email').value.trim();
      if (!email) return;
      window.ipartmentCRM.add('leads', { type: 'newsletter_signup', email });
      window.ipartmentToast('Subscribed. Watch your inbox.');
      e.target.reset();
    });

    // Re-render if the admin panel updates articles (same browser, cross-tab)
    window.addEventListener('storage', e => {
      if (['ipartment_magazine_articles', 'ipartment_magazine_hidden', 'ipartment_magazine_edited'].includes(e.key)) {
        render();
      }
    });
  });
})();
