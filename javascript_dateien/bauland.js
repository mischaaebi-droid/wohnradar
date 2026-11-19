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
 * Bebauungsvarianten 0.39 / 0.50 / 0.65 und Mikrolage +/-20%
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

  let resultReleased = false;
  let placeSelected = false;

  let plz = DATA['5400']
    ? '5400'
    : places[0].plz;


  // ==========================================================
  // 2. BAULAND-BERECHNUNG – UNVERÄNDERT
  // ==========================================================

  function calc() {

    const d = DATA[plz];

    if (!d || !resultReleased || !placeSelected) return;

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

    
    // Progressive Korrektur der Baulandpreise
    // Zuschlag zwischen 7 und 15 Prozent

    const korrekturStufen = [
      [4000, 1.09],
      [6000, 1.1],
      [8000, 1.11],
      [10000, 1.13],
      [12000, 1.14],
      [15000, 1.16],
      [20000, 1.17]
    ];

    function baulandKorrektur(preis) {
      if (preis <= 4000) return 1.09;
      if (preis >= 20000) return 1.17;

      for (let i = 1; i < korrekturStufen.length; i++) {
        const [p2, f2] = korrekturStufen[i];
        const [p1, f1] = korrekturStufen[i - 1];

        if (preis <= p2) {
          const anteil = (preis - p1) / (p2 - p1);
          return f1 + anteil * (f2 - f1);
        }
      }

      return 1.15;
    }

    const base = p * share *
      ({single: .39, medium: .50, multi: .65}[type] ?? .39) *
      baulandKorrektur(p);


    $('estimate').textContent =
      fmt(base) + ' CHF/m²';

    $('low').textContent =
      fmt(base * .8) + ' CHF/m²';

    $('high').textContent =
      fmt(base * 1.2) + ' CHF/m²';


    $('apartmentPrice').textContent =
      'CHF ' + fmt(p) + '/m²';
  }


  // ==========================================================
  // 3. ORTSSUCHE – GEMEINSAME DATEI: ortssuche.js
  // ==========================================================

  const placeInput = $('placeInput');
  const placeHint = $('placeHint');
  const { initOrtssuche } = await import(new URL('javascript_dateien/ortssuche.js?v=20261119-1', document.baseURI).href);
  const ortssuche = initOrtssuche({
    places,
    isSelected: () => placeSelected,
    onSelect: p => {
      if (!DATA[p]) return;
      plz = p;
      placeSelected = true;
      placeHint.textContent = '';
      calc();
    },
    onEdit: value => {
      placeSelected = false;
      placeHint.textContent = value.trim() ? 'Ort oder PLZ auswählen' : '';
    },
    onClear: () => {
      placeSelected = false;
      placeHint.textContent = '';
    }
  });

  // ==========================================================
    // 5. ÜBRIGE BEDIENELEMENTE – UNVERÄNDERT
  // ==========================================================

  // Wechsel zwischen drei Ausnützungsstufen.

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

  function clearResult() {
    resultReleased = false;
    placeSelected = false;
    ['estimate', 'low', 'high'].forEach(id => { $(id).textContent = '—'; });

    $('apartmentPrice').textContent = '';
    placeInput.value = '';
    placeHint.textContent = '';
    document.querySelector('input[name="landType"][value="single"]').checked = true;
  }

  $('reset').addEventListener('click', clearResult);
  const uxReset = $('uxReset');


  document.addEventListener('wr:adjust-start', () => {
    resultReleased = false;
  });

  // Schätzung erst nach bewusster Ortswahl und Klick auf "Verkehrswert bestimmen".
  document.addEventListener('click', event => {
    if (!event.target.closest('#estimateButtonDesktop, #estimateButtonMobile')) return;
    if (!placeSelected) {
      event.preventDefault();
      event.stopImmediatePropagation();
      placeHint.textContent = 'Bitte wählen Sie zuerst einen Ort aus der Vorschlagsliste.';
      placeInput.focus();
      return;
    }
    resultReleased = true;
    calc();
    document.dispatchEvent(new CustomEvent('wr:estimate-success'));
  }, true);


  // ==========================================================
  // 7. INITIALISIERUNG
  // ==========================================================

  // Beim Start weder einen Ort vorbelegen noch einen Preis berechnen.
  clearResult();

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