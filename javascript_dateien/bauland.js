"use strict";

/*
 * WOHNRADAR – Bauland
 *
 * Gemeinsame Datenbasis: wohnungspreise.json.
 *
 * Logarithmische Formel aus der Gemeindekalibrierung:
 * Anteil = clamp(0.3212595 + 0.2652819 * ln(P / 10000), 0.0625, 0.625)
 *
 * Baulandpreis/m² = P * Anteil * Ausnützungsannahme
 *
 * Ursprünglich validierte Formel: Faktor 0.5;
 * Bebauungsvarianten 0.65 / 0.35 und Mikrolage +/-20%
 * sind NICHT separat empirisch validiert.
 */

async function starteBauland() {

  // ==========================================================
  // 1. DATEN LADEN
  // ==========================================================

  const antwort = await fetch('daten/wohnungspreise.json');

  if (!antwort.ok) {
    throw new Error('Wohnungspreise konnten nicht geladen werden');
  }

  const DATA = await antwort.json();

  const $ = id => document.getElementById(id);

  const fmt = n =>
    Math.round(n).toLocaleString('de-CH');

  const normalize = t =>
    String(t)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const places = Object.entries(DATA)
    .filter(([, d]) =>
      Number.isFinite(+d.median) &&
      +d.median > 0
    )
    .map(([plz, d]) => ({
      plz,
      ort: d.ort,
      norm: normalize(plz + ' ' + d.ort)
    }));

  let plz = DATA['5400']
    ? '5400'
    : places[0].plz;


  // ==========================================================
  // 2. BAULAND-BERECHNUNG – UNVERÄNDERT
  // ==========================================================

  function calc() {

    const d = DATA[plz];

    if (!d) return;

    const type = document.querySelector(
      'input[name="landType"]:checked'
    ).value;

    const p = +d.median;

    const share = Math.max(
      .0625,
      Math.min(
        .625,
        .3212595 + .2652819 * Math.log(p / 10000)
      )
    );

    const base = p * share *
      (type === 'multi' ? .65 : .35);

    $('estimate').textContent =
      'CHF ' + fmt(base);

    $('low').textContent =
      'CHF ' + fmt(base * .8);

    $('high').textContent =
      'CHF ' + fmt(base * 1.2);

    $('buildLabel').textContent =
      type === 'multi'
        ? 'Mehrfamilienhaus'
        : 'Einfamilienhaus';

    $('apartmentPrice').textContent =
      'CHF ' + fmt(p) + '/m²';
  }


  // ==========================================================
  // 3. ORTSSUCHE – EINHEITLICH MIT DEN ANDEREN RECHNERN
  // ==========================================================

  const placeInput = $('placeInput');
  const suggestionList = $('suggestions');
  const placeHint = $('placeHint');

  const mobilePlaceMode =
    window.matchMedia('(max-width: 840px)');

  let placeFocused = false;
  let activeSuggestion = -1;
  let selectingPlace = false;
  let keyboardTimer = null;

  // Beim Start nur den Platzhalter anzeigen.
  // Die Standardgemeinde bleibt intern für die Berechnung.

  placeInput.value = '';

  placeInput.placeholder = 'Ort oder PLZ eingeben';

  placeInput.setAttribute('autocomplete', 'off');


  // ----------------------------------------------------------
  // Vorschläge schliessen
  // ----------------------------------------------------------

  function closeSuggestions() {

    clearTimeout(keyboardTimer);

    suggestionList.classList.add('hide');

    suggestionList.style.display = 'none';

    placeInput.setAttribute(
      'aria-expanded',
      'false'
    );

    placeInput.removeAttribute(
      'aria-activedescendant'
    );

    activeSuggestion = -1;
  }


  // ----------------------------------------------------------
  // Vorschläge anzeigen
  // ----------------------------------------------------------

  function showSuggestions() {

    suggestionList.classList.remove('hide');

    suggestionList.style.display = 'block';

    suggestionList.style.visibility = 'visible';

    suggestionList.style.opacity = '1';

    placeInput.setAttribute(
      'aria-expanded',
      'true'
    );
  }


  // ----------------------------------------------------------
  // Gemeinde auswählen
  // ----------------------------------------------------------

  function choose(p) {

    if (!DATA[p]) return;

    selectingPlace = false;

    plz = p;

    placeInput.value =
      p + ' ' + DATA[p].ort;

    placeHint.textContent = '';

    closeSuggestions();

    placeInput.blur();

    calc();
  }


  // ----------------------------------------------------------
  // Passende Gemeinden suchen
  // ----------------------------------------------------------

  function suggestions() {

    const raw = normalize(placeInput.value);

    // Vorschläge erst ab drei Zeichen.

    if (!placeFocused || raw.length < 3) {

      closeSuggestions();

      return;
    }

    const matches = places
      .filter(p =>
        p.plz.startsWith(raw) ||
        normalize(p.ort).startsWith(raw) ||
        p.norm.includes(' ' + raw)
      )
      .sort((a, b) => {

        const aa =
          normalize(a.ort).startsWith(raw) ||
          a.plz.startsWith(raw);

        const bb =
          normalize(b.ort).startsWith(raw) ||
          b.plz.startsWith(raw);

        return (
          Number(bb) - Number(aa) ||
          a.ort.localeCompare(b.ort, 'de')
        );
      })
      .slice(0, 12);

    suggestionList.replaceChildren();

    activeSuggestion = -1;

    placeInput.removeAttribute(
      'aria-activedescendant'
    );

    // Keine Treffer: Tastatur bleibt offen.

    if (!matches.length) {

      closeSuggestions();

      return;
    }


    // --------------------------------------------------------
    // Vorschlagsschaltflächen erzeugen
    // --------------------------------------------------------

    matches.forEach((p, i) => {

      const button =
        document.createElement('button');

      button.type = 'button';

      button.id = 'suggest_' + i;

      button.dataset.plz = p.plz;

      button.setAttribute(
        'role',
        'option'
      );

      button.setAttribute(
        'aria-selected',
        'false'
      );

      button.append(
        document.createTextNode(p.ort + ' ')
      );

      const small =
        document.createElement('small');

      small.textContent = 'PLZ ' + p.plz;

      button.append(small);

      // Verhindert, dass beim Antippen
      // die Vorschlagsliste verschwindet.

      button.addEventListener(
        'pointerdown',
        e => e.preventDefault()
      );

      button.addEventListener(
        'click',
        () => choose(p.plz)
      );

      suggestionList.append(button);
    });

    showSuggestions();


    // --------------------------------------------------------
    // SMARTPHONE: 700 MILLISEKUNDEN TIPP-PAUSE
    // --------------------------------------------------------

    if (mobilePlaceMode.matches) {

      // Bei jeder weiteren Eingabe beginnt
      // die Wartezeit von vorne.

      clearTimeout(keyboardTimer);

      keyboardTimer = setTimeout(() => {

        // Tastatur nur schliessen, wenn
        // das Suchfeld noch aktiv ist
        // und passende Vorschläge vorhanden sind.

        if (
          document.activeElement === placeInput &&
          !suggestionList.classList.contains('hide') &&
          suggestionList.querySelector('button')
        ) {

          selectingPlace = true;

          // Smartphone-Tastatur schliessen.

          placeInput.blur();

          // Vorschläge bleiben sichtbar.

          requestAnimationFrame(() => {

            if (selectingPlace) {
              showSuggestions();
            }
          });
        }

      }, 700);
    }
  }


  // ----------------------------------------------------------
  // Vorschläge mit Tastatur auswählen
  // ----------------------------------------------------------

  function highlightSuggestion(index) {

    const buttons = [
      ...suggestionList.querySelectorAll('button')
    ];

    if (!buttons.length) return;

    activeSuggestion =
      (index + buttons.length) % buttons.length;

    buttons.forEach((button, i) => {

      button.setAttribute(
        'aria-selected',
        String(i === activeSuggestion)
      );
    });

    const activeButton =
      buttons[activeSuggestion];

    placeInput.setAttribute(
      'aria-activedescendant',
      activeButton.id
    );

    activeButton.scrollIntoView({
      block: 'nearest'
    });
  }


  // ==========================================================
  // 4. EREIGNISSE DER ORTSSUCHE
  // ==========================================================

  // ----------------------------------------------------------
  // Suchfeld antippen
  // ----------------------------------------------------------

  placeInput.addEventListener('focus', () => {

    selectingPlace = false;

    placeFocused = true;

    closeSuggestions();

    // Sofort leeres Eingabefeld.
    // Auch eine zuvor ausgewählte Gemeinde
    // wird für die neue Suche entfernt.

    placeInput.value = '';

    placeInput.placeholder = '';

    placeHint.textContent = '';
  });


  // ----------------------------------------------------------
  // Während der Eingabe
  // ----------------------------------------------------------

  placeInput.addEventListener('input', () => {

    placeHint.textContent =
      placeInput.value.trim()
        ? 'Ort oder PLZ auswählen'
        : '';

    suggestions();
  });


  // ----------------------------------------------------------
  // Suchfeld löschen
  // ----------------------------------------------------------

  $('clearPlace').addEventListener('click', () => {

    selectingPlace = false;

    closeSuggestions();

    placeInput.value = '';

    placeHint.textContent = '';

    placeInput.focus();
  });


  // ----------------------------------------------------------
  // Tastaturbedienung auf Desktop
  // ----------------------------------------------------------

  placeInput.addEventListener('keydown', e => {

    const buttons = [
      ...suggestionList.querySelectorAll('button')
    ];

    if (
      e.key === 'ArrowDown' &&
      buttons.length
    ) {

      e.preventDefault();

      highlightSuggestion(
        activeSuggestion + 1
      );

    } else if (
      e.key === 'ArrowUp' &&
      buttons.length
    ) {

      e.preventDefault();

      highlightSuggestion(
        activeSuggestion < 0
          ? buttons.length - 1
          : activeSuggestion - 1
      );

    } else if (
      e.key === 'Enter' &&
      buttons.length
    ) {

      e.preventDefault();

      choose(
        buttons[
          Math.max(0, activeSuggestion)
        ].dataset.plz
      );

    } else if (
      e.key === 'Escape'
    ) {

      selectingPlace = false;

      closeSuggestions();

      placeInput.blur();
    }
  });


  // ----------------------------------------------------------
  // Fokusverlust
  // ----------------------------------------------------------

  placeInput.addEventListener('blur', () => {

    // Platzhalter nach Verlassen
    // des Eingabefeldes wiederherstellen.

    placeInput.placeholder =
      'Ort oder PLZ eingeben';

    if (!selectingPlace) {
      clearTimeout(keyboardTimer);
    }

    placeFocused = false;

    setTimeout(() => {

      // Nach dem automatischen Schliessen
      // der Smartphone-Tastatur bleibt
      // die Vorschlagsliste geöffnet.

      if (!selectingPlace) {
        closeSuggestions();
      }

      if (
        !selectingPlace &&
        placeInput.value.trim() &&
        placeInput.value.trim() !==
          plz + ' ' + DATA[plz].ort
      ) {

        placeHint.textContent =
          'Bitte einen Ort aus den Vorschlägen wählen';
      }

    }, 160);
  });


  // ----------------------------------------------------------
  // Ausserhalb der Suche tippen
  // ----------------------------------------------------------

  document.addEventListener('pointerdown', e => {

    if (
      !placeInput.contains(e.target) &&
      !suggestionList.contains(e.target) &&
      !$('clearPlace').contains(e.target)
    ) {

      selectingPlace = false;

      closeSuggestions();
    }
  });


  // ==========================================================
  // 5. ÜBRIGE BEDIENELEMENTE – UNVERÄNDERT
  // ==========================================================

  // Wechsel zwischen Einfamilienhaus
  // und Mehrfamilienhaus.

  document.querySelectorAll(
    'input[name="landType"]'
  ).forEach(el => {

    el.addEventListener(
      'change',
      calc
    );
  });


  // ==========================================================
  // 6. RECHNER ZURÜCKSETZEN
  // ==========================================================

  $('reset').addEventListener('click', () => {

    document.querySelector(
      'input[name="landType"][value="multi"]'
    ).checked = true;

    choose(
      DATA['5400']
        ? '5400'
        : places[0].plz
    );

    // Nach dem Zurücksetzen nur
    // den Platzhalter anzeigen.

    placeInput.value = '';

    placeHint.textContent = '';
  });


  // ==========================================================
  // 7. INITIALISIERUNG
  // ==========================================================

  // Standardgemeinde intern für die Berechnung setzen.

  choose(plz);

  // Im Suchfeld soll zu Beginn
  // keine Gemeinde stehen.

  placeInput.value = '';

  placeHint.textContent = '';
}


// ============================================================
// 8. FEHLERBEHANDLUNG – UNVERÄNDERT
// ============================================================

starteBauland().catch(error => {

  console.error(
    'Bauland:',
    error
  );

  document.getElementById(
    'estimate'
  ).textContent =
    'Daten nicht verfügbar';

  document.getElementById(
    'placeHint'
  ).textContent =
    'Daten konnten nicht geladen werden. Bitte die Seite über einen Webserver öffnen.';
});