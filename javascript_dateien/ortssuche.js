/**
 * Wohnradar – gemeinsame Orts-/PLZ-Suche (Haus, Wohnungen, Miete,
 * Bauland und Mietkennzahlen). Keine automatische Tastaturschliessung.
 *
 * Auf Smartphones öffnet sich die Suche als eigener Bildschirm mit
 * Eingabe ganz oben; das ursprüngliche Eingabefeld bleibt im Formular.
 */

const BREAKPOINT = '(max-width: 840px)';
const CONFIG = Object.freeze({
  minCharacters: 2,
  mobileResults: 6,
  desktopResults: 10
});

// CSS automatisch laden: die HTML-Dateien brauchen keine neuen Tags.
if (!document.querySelector('link[data-wr-ortssuche]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.wrOrtssuche = '1';
  link.href = new URL('./ortssuche.css?v=20261119-1', import.meta.url).href;
  document.head.appendChild(link);
}

function normalisiere(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * @param {Object} options
 * @param {Array<{plz: string, ort: string, search?: string[]}>} options.places
 * @param {(plz: string) => void} options.onSelect
 * @param {(value: string) => void} options.onEdit
 * @param {() => void} options.onClear
 * @param {() => boolean} [options.isSelected]
 * @param {() => boolean} [options.hasError]
 */
export function initOrtssuche(options) {
  const input = document.getElementById('placeInput');
  const list = document.getElementById('suggestions');
  const clearButton = document.getElementById('clearPlace');
  const hint = document.getElementById('placeHint');
  if (!input || !list || !clearButton || !hint) {
    throw new Error('Ortssuche: Benötigtes Eingabefeld, Liste, Löschknopf oder Hinweis fehlt.');
  }

  const media = window.matchMedia(BREAKPOINT);
  const originalListParent = list.parentNode;
  const originalListNextSibling = list.nextSibling;
  const items = (options.places || []).map(entry => {
    const plz = String(entry.plz);
    const ort = String(entry.ort || '');
    const aliases = Array.isArray(entry.search) ? entry.search : [];
    const names = [ort, ...aliases].map(normalisiere).filter(Boolean);
    return { plz, ort, names };
  });
  let focused = false;
  let activeIndex = -1;
  let mobileOverlay = null;
  let mobileInput = null;
  let mobileHint = null;
  let overlayClearButton = null;
  let previousSelectedValue = '';

  input.value = '';
  input.placeholder = 'Ort oder PLZ eingeben';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');

  // Auf Smartphones beim Aufruf den tatsächlich sichtbaren Eingabedialog verwenden.
  function visibleInput() { return mobileInput || input; }

  function setExpanded(value) {
    input.setAttribute('aria-expanded', String(value));
    if (mobileInput) mobileInput.setAttribute('aria-expanded', String(value));
  }

  function closeSuggestions() {
    list.classList.add('hide');
    list.style.display = 'none';
    setExpanded(false);
    input.removeAttribute('aria-activedescendant');
    if (mobileInput) mobileInput.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function matchingPlaces(query) {
    if (query.length < CONFIG.minCharacters) return [];
    const isPLZ = /^\d+$/.test(query);
    return items.filter(place => {
      if (place.plz.startsWith(query)) return true;
      if (isPLZ) return false;
      return place.names.some(name => name.startsWith(query) || name.includes(' ' + query));
    }).sort((a, b) => {
      function rank(p) {
        if (p.plz === query) return 0;
        if (p.plz.startsWith(query)) return 1;
        if (p.names[0]?.startsWith(query)) return 2;
        if (p.names.some(n => n.startsWith(query))) return 3;
        return 4;
      }
      return rank(a) - rank(b) ||
        a.ort.localeCompare(b.ort, 'de-CH') ||
        a.plz.localeCompare(b.plz, 'de-CH');
    }).slice(0, mobileOverlay ? CONFIG.mobileResults : CONFIG.desktopResults);
  }

  function choose(plz) {
    const place = items.find(p => p.plz === String(plz));
    if (!place) return;
    previousSelectedValue = `${place.plz} ${place.ort}`.trim();
    input.value = previousSelectedValue;
    if (mobileInput) mobileInput.value = previousSelectedValue;
    if (typeof options.onSelect === 'function') options.onSelect(place.plz);
    hint.textContent = '';
    closeSuggestions();
    if (mobileOverlay) exitOverlay();
    else input.blur();
  }

  function highlight(index) {
    const buttons = [...list.querySelectorAll('button[data-plz]')];
    if (!buttons.length) return;
    activeIndex = (index + buttons.length) % buttons.length;
    buttons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === activeIndex));
    });
    const current = buttons[activeIndex];
    visibleInput().setAttribute('aria-activedescendant', current.id);
    current.scrollIntoView({block: 'nearest'});
  }

  function renderSuggestions() {
    const query = normalisiere(visibleInput().value);
    if (!focused || query.length < CONFIG.minCharacters) {
      closeSuggestions();
      return;
    }
    const matches = matchingPlaces(query);
    list.replaceChildren();
    activeIndex = -1;
    visibleInput().removeAttribute('aria-activedescendant');
    if (!matches.length) {
      closeSuggestions();
      return;
    }
    matches.forEach((place, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = `wr-place-option-${index}`;
      btn.dataset.plz = place.plz;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', 'false');
      btn.append(document.createTextNode(`${place.ort} `));
      const small = document.createElement('small');
      small.textContent = `PLZ ${place.plz}`;
      btn.append(small);
      // Kein Tastaturverlust zwischen Berühren des Vorschlags und Auswahl.
      btn.addEventListener('pointerdown', event => event.preventDefault());
      btn.addEventListener('click', () => choose(place.plz));
      list.append(btn);
    });
    list.classList.remove('hide');
    list.style.display = 'block';
    list.style.visibility = 'visible';
    list.style.opacity = '1';
    setExpanded(true);
  }

  function edit(value) {
    input.value = value;
    if (mobileInput && mobileInput.value !== value) mobileInput.value = value;
    if (value !== previousSelectedValue) previousSelectedValue = '';
    if (typeof options.onEdit === 'function') options.onEdit(value);
    if (mobileHint) mobileHint.textContent = value.trim() ? 'Bitte einen Ort aus der Liste auswählen' : 'Ortschaft oder Postleitzahl eingeben';
    renderSuggestions();
  }

  function clear() {
    input.value = '';
    if (mobileInput) mobileInput.value = '';
    previousSelectedValue = '';
    if (typeof options.onClear === 'function') options.onClear();
    if (mobileHint) mobileHint.textContent = 'Ortschaft oder Postleitzahl eingeben';
    closeSuggestions();
    if (mobileInput) mobileInput.focus();
    else input.focus();
  }

  function restoreList() {
    if (originalListNextSibling && originalListNextSibling.parentNode === originalListParent) {
      originalListParent.insertBefore(list, originalListNextSibling);
    } else originalListParent.appendChild(list);
  }

  function resizeOverlay() {
    if (!mobileOverlay) return;
    // Bei Wechsel in die Desktopansicht keine unsichtbare Modalsuche behalten.
    if (!media.matches) {
      exitOverlay();
      return;
    }
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height : window.innerHeight;
    const offset = viewport ? viewport.offsetTop : 0;
    mobileOverlay.style.setProperty('--wr-place-visible-height', `${Math.round(height)}px`);
    mobileOverlay.style.setProperty('--wr-place-visible-top', `${Math.round(offset)}px`);
  }

  function exitOverlay() {
    if (!mobileOverlay) return;
    const overlay = mobileOverlay;
    // Nicht direkt während des Fokuswechsels die Liste entfernen.
    mobileOverlay = null;
    focused = false;
    closeSuggestions();
    restoreList();
    window.visualViewport?.removeEventListener('resize', resizeOverlay);
    window.visualViewport?.removeEventListener('scroll', resizeOverlay);
    window.removeEventListener('resize', resizeOverlay);
    if (mobileInput) mobileInput.blur();
    overlay.remove();
    mobileInput = null;
    mobileHint = null;
    overlayClearButton = null;
    input.blur();
    if (input.value.trim() && !(options.isSelected?.() ?? false) && !(options.hasError?.() ?? false)) {
      hint.textContent = 'Bitte einen Ort aus den Vorschlägen wählen';
    }
  }

  function openOverlay() {
    if (mobileOverlay || !media.matches) return;
    const wasSelected = (options.isSelected?.() ?? false) && input.value.trim();
    const overlay = document.createElement('div');
    overlay.className = 'wr-place-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Ortschaft oder Postleitzahl auswählen');

    const toolbar = document.createElement('div');
    toolbar.className = 'wr-place-toolbar';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'wr-place-back';
    back.setAttribute('aria-label', 'Zurück zum Rechner');
    back.textContent = '←';
    back.addEventListener('click', exitOverlay);

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'wr-place-mobile-input';
    search.setAttribute('role', 'combobox');
    search.setAttribute('aria-label', 'PLZ, Ortschaft oder Gemeinde suchen');
    search.setAttribute('aria-autocomplete', 'list');
    search.setAttribute('aria-controls', list.id);
    search.setAttribute('aria-expanded', 'false');
    search.autocomplete = 'off';
    search.spellcheck = false;
    search.autocapitalize = 'off';
    search.enterKeyHint = 'done';
    search.placeholder = 'PLZ oder Ort eingeben';
    search.value = input.value;
    search.addEventListener('input', () => edit(search.value));
    search.addEventListener('keydown', handleKeydown);

    const clearMobile = document.createElement('button');
    clearMobile.type = 'button';
    clearMobile.className = 'wr-place-overlay-clear';
    clearMobile.setAttribute('aria-label', 'Eingabe löschen');
    clearMobile.textContent = '×';
    clearMobile.addEventListener('click', clear);

    const info = document.createElement('div');
    info.className = 'wr-place-overlay-hint';
    info.textContent = search.value ? 'Ort aus den Vorschlägen auswählen' : 'Ortschaft oder Postleitzahl eingeben';

    toolbar.append(back, search, clearMobile);
    overlay.append(toolbar, info);
    document.body.append(overlay);
    overlay.append(list);
    mobileOverlay = overlay;
    mobileInput = search;
    mobileHint = info;
    overlayClearButton = clearMobile;
    focused = true;
    resizeOverlay();
    window.visualViewport?.addEventListener('resize', resizeOverlay);
    window.visualViewport?.addEventListener('scroll', resizeOverlay);
    window.addEventListener('resize', resizeOverlay);
    renderSuggestions();
    search.focus({preventScroll: true});
    if (wasSelected) search.select();
    else search.setSelectionRange(search.value.length, search.value.length);
  }

  function handleKeydown(event) {
    const buttons = [...list.querySelectorAll('button[data-plz]')];
    if (event.key === 'ArrowDown' && buttons.length) {
      event.preventDefault();
      highlight(activeIndex + 1);
    } else if (event.key === 'ArrowUp' && buttons.length) {
      event.preventDefault();
      highlight(activeIndex < 0 ? buttons.length - 1 : activeIndex - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0 && buttons[activeIndex]) {
        choose(buttons[activeIndex].dataset.plz);
        return;
      }
      // Bei vollständig getippter PLZ/eindeutigem Ortsnamen ist Enter zulässig;
      // niemals einfach den erstbesten Treffer übernehmen.
      const query = normalisiere(visibleInput().value);
      const exact = items.filter(p => p.plz === query || p.names.some(n => n === query));
      if (exact.length === 1) choose(exact[0].plz);
      else if (mobileInput) mobileInput.blur(); // Explizit «Fertig»: Tastatur schliessen.
      else closeSuggestions();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (mobileOverlay) exitOverlay();
      else {
        closeSuggestions();
        input.blur();
      }
    }
  }

  input.addEventListener('focus', () => {
    if (media.matches) {
      openOverlay();
      return;
    }
    focused = true;
    if ((options.isSelected?.() ?? false) && input.value.trim()) input.select();
    renderSuggestions();
  });
  input.addEventListener('input', () => edit(input.value));
  input.addEventListener('keydown', handleKeydown);
  input.addEventListener('blur', () => {
    // Bei mobiler Suche liegt der Fokus bewusst im oberen Dialog.
    if (mobileOverlay) return;
    focused = false;
    closeSuggestions();
    if (input.value.trim() && !(options.isSelected?.() ?? false) && !(options.hasError?.() ?? false)) {
      hint.textContent = 'Bitte einen Ort aus den Vorschlägen wählen';
    }
  });
  clearButton.addEventListener('click', clear);
  document.addEventListener('pointerdown', event => {
    if (mobileOverlay) return;
    if (!input.contains(event.target) && !list.contains(event.target) && !clearButton.contains(event.target)) {
      closeSuggestions();
    }
  });

  return {
    close: () => mobileOverlay ? exitOverlay() : closeSuggestions(),
    clear,
    getCurrentValue: () => input.value
  };
}
