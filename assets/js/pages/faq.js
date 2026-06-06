/* FAQ - accordion + filter */
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const answer = item.querySelector('.faq-answer');
    const isOpen = item.classList.contains('open');
    item.parentElement.querySelectorAll('.faq-item').forEach(i => {
      i.classList.remove('open');
      i.querySelector('.faq-answer').style.maxHeight = '0';
    });
    if (!isOpen) {
      item.classList.add('open');
      answer.style.maxHeight = answer.scrollHeight + 'px';
    }
  });
});
setTimeout(() => {
  const def = document.querySelector('.faq-item.open');
  if (def) def.querySelector('.faq-answer').style.maxHeight = def.querySelector('.faq-answer').scrollHeight + 'px';
}, 100);

function applyFilter() {
  const activeCat = document.querySelector('.faq-tab.active').dataset.cat;
  const q = (document.getElementById('faq-search').value || '').toLowerCase().trim();
  let anyVisible = false;
  document.querySelectorAll('.faq-category').forEach(cat => {
    let catVisible = false;
    const matchCat = activeCat === 'all' || cat.dataset.cat === activeCat;
    cat.querySelectorAll('.faq-item').forEach(item => {
      const kw = (item.dataset.keywords || '').toLowerCase();
      const qText = item.querySelector('.faq-question').textContent.toLowerCase();
      // Token AND match: every word in the query must appear somewhere in the
      // keywords or question, so multi-word searches ("cat litter") still match.
      const hay = kw + ' ' + qText;
      const matchQ = !q || q.split(/\s+/).every(w => hay.includes(w));
      const show = matchCat && matchQ;
      item.classList.toggle('hide', !show);
      if (show) { catVisible = true; anyVisible = true; }
    });
    cat.classList.toggle('hide', !catVisible);
  });
  document.getElementById('faq-empty').classList.toggle('show', !anyVisible);
}

document.querySelectorAll('.faq-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.faq-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    applyFilter();
  });
});
document.getElementById('faq-search').addEventListener('input', applyFilter);
