/* Wohnradar: gut greifbare Schieberegler, ohne Sprünge beim Tippen auf den Balken.
   Original-input bleibt für Tastatur/Screenreader und die bestehende Berechnung erhalten. */
(() => {
  'use strict';
  const THUMB_DIAMETER = 22; // sichtbarer Kreis
  const GRIP_DIAMETER = 44;  // unsichtbare Trefferfläche auf Smartphones

  function protect(slider) {
    if (slider.dataset.wrSliderProtected === '1') return;
    slider.dataset.wrSliderProtected = '1';

    const wrapper = document.createElement('span');
    wrapper.className = 'wr-slider-control';
    wrapper.style.cssText = 'display:block;position:relative;width:100%;height:44px;';
    slider.parentNode.insertBefore(wrapper, slider);
    wrapper.appendChild(slider);

    slider.style.pointerEvents = 'none';
    slider.style.position = 'absolute';
    slider.style.left = '0';
    slider.style.top = '50%';
    slider.style.transform = 'translateY(-50%)';
    slider.style.margin = '0';

    // Nur über dem Schiebekreis liegt eine bedienbare Fläche.
    // Anders als beim alten Overlay bleibt der Balken frei für normales Scrollen.
    const grip = document.createElement('span');
    grip.className = 'wr-slider-grip';
    grip.setAttribute('aria-hidden', 'true');
    grip.style.cssText = [
      'position:absolute', 'top:0', 'height:44px',
      'width:' + GRIP_DIAMETER + 'px',
      'touch-action:none', 'cursor:grab',
      'user-select:none', '-webkit-user-select:none',
      '-webkit-tap-highlight-color:transparent'
    ].join(';');
    wrapper.appendChild(grip);

    function geometry() {
      const rect = slider.getBoundingClientRect();
      const min = Number(slider.min || 0);
      const max = Number(slider.max || 100);
      const value = Number(slider.value);
      const reversed = getComputedStyle(slider).direction === 'rtl';
      const travel = Math.max(1, rect.width - THUMB_DIAMETER);
      const fraction = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
      const position = reversed ? 1 - fraction : fraction;
      return { rect, min, max, reversed, travel,
        center: rect.left + THUMB_DIAMETER / 2 + position * travel };
    }

    function placeGrip() {
      const g = geometry();
      grip.style.left = (g.center - g.rect.left - GRIP_DIAMETER / 2) + 'px';
    }

    function changeAt(x) {
      const g = geometry();
      let fraction = Math.max(0, Math.min(1,
        (x - g.rect.left - THUMB_DIAMETER / 2) / g.travel));
      if (g.reversed) fraction = 1 - fraction;
      const step = slider.step === 'any' ? 0 : Number(slider.step || 1);
      let value = g.min + fraction * (g.max - g.min);
      if (step > 0) value = g.min + Math.round((value - g.min) / step) * step;
      value = Math.min(g.max, Math.max(g.min, value));
      if (Number(slider.value) !== value) {
        slider.value = String(value);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      }
      placeGrip();
    }

    let active = null;
    let moved = false;
    let startX = 0;
    let startCenter = 0;

    grip.addEventListener('pointerdown', event => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      active = event.pointerId;
      startX = event.clientX;
      startCenter = geometry().center;
      moved = false;
      slider.focus({ preventScroll: true });
      grip.setPointerCapture(event.pointerId);
      grip.style.cursor = 'grabbing';
      event.preventDefault();
    });

    grip.addEventListener('pointermove', event => {
      if (event.pointerId !== active) return;
      if (Math.abs(event.clientX - startX) > 2) moved = true;
      if (moved) changeAt(startCenter + event.clientX - startX);
      event.preventDefault();
    });

    function finish(event) {
      if (event.pointerId !== active) return;
      if (event.type === 'pointerup') {
        // Bestehende Flächenbestätigung in haeuser.js weiterhin auslösen.
        if (typeof PointerEvent === 'function') {
          slider.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true, pointerType: event.pointerType
          }));
        } else {
          slider.dispatchEvent(new Event('pointerup', { bubbles: true }));
        }
        if (moved) slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
      active = null;
      grip.style.cursor = 'grab';
      placeGrip();
    }
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
    grip.addEventListener('lostpointercapture', event => {
      if (active === event.pointerId) {
        active = null;
        grip.style.cursor = 'grab';
      }
    });
    slider.addEventListener('input', placeGrip);
    slider.addEventListener('change', placeGrip);
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(placeGrip).observe(wrapper);
    } else {
      window.addEventListener('resize', placeGrip, { passive: true });
    }
    placeGrip();
  }

  function init() {
    const protectAll = () => document.querySelectorAll(
      'input[type="range"]:not([data-wr-slider-protected="1"])'
    ).forEach(protect);
    protectAll();
    new MutationObserver(protectAll).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else init();
})();
