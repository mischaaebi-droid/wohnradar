
/* Wohnradar – Fixbutton und einmaliger Scroll-Hinweis auf kleinen Displays.
   Verwendet ausschliesslich die vorhandenen Rechner-Buttons und Ergebnis-Klassen.
   Es werden keine Bewertungsmodelle oder Berechnungseingaben verändert. */
(() => {
  'use strict';

  const init = () => {
    const mobileButton = document.getElementById('estimateButtonMobile');
    const resultShell = document.getElementById('resultShell');
    const cue = document.getElementById('wrScrollCue');
    if (!mobileButton || !resultShell || !cue) return;

    document.body.classList.add('wr-mobile-valuation');

    let scrolled = window.scrollY > 8;
    const hideCue = () => {
      if (scrolled) return;
      scrolled = true;
      cue.classList.add('is-hidden');
      window.removeEventListener('scroll', onScroll);
    };
    const onScroll = () => {
      if (Math.abs(window.scrollY) > 8) hideCue();
    };
    if (scrolled) cue.classList.add('is-hidden');
    else window.addEventListener('scroll', onScroll, { passive: true });

    const syncEstimateState = () => {
      const estimated = resultShell.classList.contains('has-estimate');
      // Der fixierte Bewertungsbutton bleibt auch nach einer Schätzung sichtbar.
      if (estimated) {
        cue.classList.add('is-hidden');
        scrolled = true;
        window.removeEventListener('scroll', onScroll);
      }
    };

    // Diese Klasse wird von der bestehenden Ergebnissteuerung gesetzt/entfernt.
    const observer = new MutationObserver(syncEstimateState);
    observer.observe(resultShell, {
      attributes: true,
      attributeFilter: ['class']
    });
    syncEstimateState();

    // Sicherheitsabgleich auch beim Klick.
    mobileButton.addEventListener('click', () => {
      requestAnimationFrame(syncEstimateState);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
