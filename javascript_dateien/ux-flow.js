"use strict";
/* Wohnradar: drei klar getrennte Bedienzustände. Bewertungsformeln bleiben in den Rechnern. */
(() => {
  const $ = id => document.getElementById(id);
  const shell = $('resultShell');
  const desktop = $('estimateButtonDesktop');
  const mobileButton = $('estimateButtonMobile');
  const adjust = $('adjustButton');
  const reset = $('uxReset') || (document.body.classList.contains('wr-haus') ? $('reset') : null);
  const pair = shell?.querySelector('.post-estimate-actions');
  const mobileBar = document.querySelector('.mobile-estimate-action');
  const main = document.querySelector('.layout main');
  const header = document.querySelector('.wrap > header');
  if (!shell || !desktop || !mobileButton || !adjust || !reset || !pair || !mobileBar || !main || !header) return;

  // Die ursprüngliche Position des Ergebnisses und der Buttons merken.
  const shellAnchor = document.createComment('Ergebnis: Desktopposition');
  shell.parentNode.insertBefore(shellAnchor, shell);
  const pairAnchor = document.createComment('Aktionsbuttons: Desktopposition');
  pair.parentNode.insertBefore(pairAnchor, pair);
  const narrow = window.matchMedia('(max-width:840px)');
  let state = 'initial';
  const originalLabel = desktop.textContent.trim();
  const againLabel = originalLabel.replace(' bestimmen', ' neu berechnen');

  const hint = document.createElement('p');
  hint.className = 'wr-adjust-hint';
  hint.setAttribute('role', 'status');
  hint.textContent = 'Sie können jetzt alle Angaben nachjustieren.';
  // Direkt am Anfang der Eingabekarte, vor der Ortsauswahl.
  const firstCard = main.querySelector('.card');
  if (firstCard) firstCard.prepend(hint);

  function render() {
    shell.classList.toggle('has-estimate', state === 'done');
    shell.classList.toggle('wr-adjusting', state === 'adjust');
    shell.classList.toggle('wr-initial', state === 'initial');
    document.body.classList.toggle('wr-result-pinned', state === 'done');
    hint.hidden = state !== 'adjust';
    desktop.textContent = mobileButton.textContent = state === 'adjust' ? againLabel : originalLabel;
    if (narrow.matches) {
      mobileBar.classList.toggle('wr-show-pair', state === 'done');
    }
  }
  function arrange() {
    if (narrow.matches) {
      header.insertAdjacentElement('afterend', shell);
      mobileBar.appendChild(pair);
    } else {
      shellAnchor.parentNode.insertBefore(shell, shellAnchor.nextSibling);
      pairAnchor.parentNode.insertBefore(pair, pairAnchor.nextSibling);
    }
    render();
  }
  arrange();
  window.addEventListener('resize', arrange);

  document.addEventListener('wr:estimate-success', () => {
    state = 'done';
    render();
    if (narrow.matches) window.scrollTo({top:0,behavior:'smooth'});
  });

  adjust.addEventListener('click', () => {
    state = 'adjust';
    document.dispatchEvent(new CustomEvent('wr:adjust-start'));
    render();
    if (narrow.matches) {
      main.querySelector('.card')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
  });

  reset.addEventListener('click', () => {
    // Bei den übrigen Rechnern löst der sichtbare Knopf den verborgenen Reset aus.
    const original = $('reset');
    if (original && original !== reset) original.click();
    state = 'initial';
    render();
    if (narrow.matches) window.scrollTo({top:0,behavior:'smooth'});
  });
})();
