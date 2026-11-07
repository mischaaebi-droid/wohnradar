/* Wohnradar: mobiler Scroll-Hinweis und dauerhaft sichtbares Ergebnis. */
(() => {
  'use strict';
  const init = () => {
    const mobileButton = document.getElementById('estimateButtonMobile');
    const desktopButton = document.getElementById('estimateButtonDesktop');
    const shell = document.getElementById('resultShell');
    const header = document.querySelector('.wrap > header');
    const cue = document.getElementById('wrScrollCue');
    if (!shell) return;
    document.body.classList.add('wr-mobile-valuation');

    let scrolled = window.scrollY > 8;
    const hideCue = () => {
      if (!cue || scrolled) return;
      scrolled = true;
      cue.classList.add('is-hidden');
      window.removeEventListener('scroll', onScroll);
    };
    const onScroll = () => { if (Math.abs(window.scrollY) > 8) hideCue(); };
    if (cue) {
      if (scrolled) cue.classList.add('is-hidden');
      else window.addEventListener('scroll', onScroll, { passive: true });
    }

    let hasBeenEstimated = false;
    let resetting = false;
    const updateHeader = () => {
      if (!header) return;
      const bottom = Math.max(0, header.getBoundingClientRect().bottom);
      document.body.style.setProperty('--wr-header-bottom', `${Math.ceil(bottom)}px`);
    };
    const updateHeight = () => {
      updateHeader();
      if (!hasBeenEstimated) return;
      const height = shell.getBoundingClientRect().height;
      if (height > 0) document.body.style.setProperty('--wr-result-height', `${Math.ceil(height)}px`);
    };
    const activate = () => {
      if (resetting || !shell.classList.contains('has-estimate')) return;
      hasBeenEstimated = true;
      document.body.classList.add('wr-result-pinned');
      hideCue();
      requestAnimationFrame(updateHeight);
    };
    const reset = () => {
      resetting = true;
      hasBeenEstimated = false;
      document.body.classList.remove('wr-result-pinned');
      document.body.style.removeProperty('--wr-result-height');
      requestAnimationFrame(() => { resetting = false; });
    };

    // Nachjustieren darf «has-estimate» entfernen, ohne die Box zu verstecken.
    const observer = new MutationObserver(() => {
      if (shell.classList.contains('has-estimate')) activate();
      else if (hasBeenEstimated) updateHeight();
    });
    observer.observe(shell, { attributes: true, attributeFilter: ['class'] });
    activate();

    [mobileButton, desktopButton].filter(Boolean).forEach(button => {
      button.addEventListener('click', () => requestAnimationFrame(activate));
    });
    ['reset', 'uxReset'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.addEventListener('click', reset, { capture: true });
    });
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    const sizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateHeight) : null;
    if (sizeObserver) { sizeObserver.observe(shell); if (header) sizeObserver.observe(header); }
    window.addEventListener('resize', updateHeight, { passive: true });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else init();
})();
