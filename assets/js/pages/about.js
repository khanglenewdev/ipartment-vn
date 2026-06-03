/* About page - just init the map */
document.addEventListener('DOMContentLoaded', () => {
  if (window.ipartmentInitMap) {
    window.ipartmentInitMap('about-map', { zoom: 15, openPopup: false });
  }
});
