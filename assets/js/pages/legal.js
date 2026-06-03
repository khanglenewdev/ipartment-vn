/* Legal - scroll-spy sidebar */
const anchors = document.querySelectorAll('.legal-side-nav a[data-anchor]');
const ids = Array.from(anchors).map(a => a.getAttribute('href').slice(1));
function updateActive() {
  let active = ids[0];
  const offset = window.innerHeight * 0.35;
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top < offset) active = id;
  });
  anchors.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + active));
}
window.addEventListener('scroll', updateActive, { passive: true });
updateActive();
