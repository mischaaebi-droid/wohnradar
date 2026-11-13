

(() => {
  'use strict';

  function protect(slider) {
    if (slider.dataset.thumbProtected) return;
    slider.dataset.thumbProtected = 'true';

    slider.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary) return;

      const rect = slider.getBoundingClientRect();
      const min = Number(slider.min || 0);
      const max = Number(slider.max || 100);
      const value = Number(slider.value);

      // Passend zum unten definierten Kreis-Durchmesser
      const diameter = 22;
      const radius = diameter / 2;

      const fraction = max > min
        ? (value - min) / (max - min)
        : 0;

      const rtl = getComputedStyle(slider).direction === 'rtl';
      const position = rtl ? 1 - fraction : fraction;

      const center = rect.left + radius
        + position * Math.max(0, rect.width - diameter);

      // Nur Berührungen direkt am Kreis zulassen
      if (Math.abs(event.clientX - center) > radius) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  function init() {
    document.querySelectorAll('input[type="range"]')
      .forEach(protect);

    // Auch später dynamisch erzeugte Regler schützen
    const observer = new MutationObserver(() => {
      document.querySelectorAll('input[type="range"]')
        .forEach(protect);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
