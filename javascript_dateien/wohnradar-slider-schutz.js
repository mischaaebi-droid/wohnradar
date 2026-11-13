
(() => {
  'use strict';

  const THUMB_SIZE = 22;
  const TOUCH_RADIUS = 16;

  function protect(slider) {
    if (slider.dataset.thumbProtected) return;
    slider.dataset.thumbProtected = 'true';

    function isOnThumb(clientX, tolerance) {
      const rect = slider.getBoundingClientRect();
      const min = Number(slider.min || 0);
      const max = Number(slider.max || 100);
      const value = Number(slider.value);

      const fraction = max > min
        ? (value - min) / (max - min)
        : 0;

      const direction = getComputedStyle(slider).direction;
      const position = direction === 'rtl'
        ? 1 - fraction
        : fraction;

      const radius = THUMB_SIZE / 2;

      const center = rect.left + radius
        + position * Math.max(0, rect.width - THUMB_SIZE);

      return Math.abs(clientX - center) <= tolerance;
    }

    // Desktop: Mausklicks ausserhalb des Kreises blockieren
    slider.addEventListener('pointerdown', event => {
      if (!event.isPrimary) return;

      const tolerance = event.pointerType === 'touch'
        ? TOUCH_RADIUS
        : THUMB_SIZE / 2;

      if (!isOnThumb(event.clientX, tolerance)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);

    // Smartphones: Berührungen des Balkens blockieren
    slider.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) return;

      const touch = event.touches[0];

      if (!isOnThumb(touch.clientX, TOUCH_RADIUS)) {
        if (event.cancelable) event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, { capture: true, passive: false });
  }

  function init() {
    function protectAll() {
      document.querySelectorAll('input[type="range"]')
        .forEach(protect);
    }

    protectAll();

    // Auch dynamisch erzeugte Schieberegler schützen
    const observer = new MutationObserver(protectAll);

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
