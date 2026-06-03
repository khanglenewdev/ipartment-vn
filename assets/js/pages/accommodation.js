/* Accommodation page - filter chips + gallery rotators */
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const filter = chip.dataset.filter;
    document.querySelectorAll('.apt-section').forEach(sec => {
      if (filter === 'all' || sec.dataset.cat === filter) sec.classList.remove('hide');
      else sec.classList.add('hide');
    });
  });
});

(function() {
  const galleryState = {};
  document.querySelectorAll('[data-gallery]').forEach(track => {
    const id = track.dataset.gallery;
    galleryState[id] = { idx: 0, count: track.querySelectorAll('.apt-gallery-slide').length };
    setInterval(() => goGallery(id, (galleryState[id].idx + 1) % galleryState[id].count), 5000 + (id.charCodeAt(0) * 200));
  });

  function goGallery(id, idx) {
    const track = document.querySelector(`[data-gallery="${id}"]`);
    if (!track) return;
    track.querySelectorAll('.apt-gallery-slide').forEach((s, i) => s.classList.toggle('active', i === idx));
    document.querySelectorAll(`[data-gallery-go="${id}"]`).forEach(d => d.classList.toggle('active', parseInt(d.dataset.idx) === idx));
    galleryState[id].idx = idx;
  }

  document.addEventListener('click', e => {
    if (e.target.matches('[data-gallery-prev]')) {
      const id = e.target.dataset.galleryPrev;
      goGallery(id, (galleryState[id].idx - 1 + galleryState[id].count) % galleryState[id].count);
    }
    if (e.target.matches('[data-gallery-next]')) {
      const id = e.target.dataset.galleryNext;
      goGallery(id, (galleryState[id].idx + 1) % galleryState[id].count);
    }
    if (e.target.matches('[data-gallery-go]')) {
      goGallery(e.target.dataset.galleryGo, parseInt(e.target.dataset.idx));
    }
  });
})();
