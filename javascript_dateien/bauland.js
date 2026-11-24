"use strict";

/*
 * WOHNRADAR – Bauland
 *
 * Daten: wohnungspreise.json (Ausgabe), immobilienpreise.json (EFH),
 * mietmodell_plz_mit_nebenkosten.json (Nettomiete 100 m²),
 * gemeinde_einwohner.json / gemeinde_dichte.json (BFS-Gemeinde),
 * plz_gemeinde.json (geografische Zuordnung PLZ -> BFS-Gemeinde).
 *
 * Validierte Gemeindekorrektur (ohne Ober-/Untergrenzen):
 * F(E,D)=0.859*(E/4000)^0.088*(D/500)^0.1383
 * P=0.7*EFH_m2+0.3*(Nettomiete_100m2_pro_m2_Jahr/0.03)
 *
 * Bevölkerungsdaten: einheitlich BFS STATPOP 2025 (2110 Gemeinden, Stand 01.01.2026).
 * Bei unzuordenbaren PLZ oder fehlenden Immobilienmarktdaten: Fallback-Preisberechnung.
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

  // Gemeinde- und Postleitzahl-Daten werden statisch ausgeliefert.
  // Im Produktionsbetrieb sämtliche 5 JSON-Dateien ins Verzeichnis daten/ legen.
  const quelle = [
    'daten/immobilienpreise.json',
    'daten/mietmodell_plz_mit_nebenkosten.json',
    'daten/gemeinde_einwohner.json',
    'daten/gemeinde_dichte.json',
    'daten/plz_gemeinde.json'
  ];

  const datenAntworten = await Promise.all(quelle.map(p => fetch(p)));
  for (let i = 0; i < datenAntworten.length; i++) {
    if (!datenAntworten[i].ok) throw new Error(quelle[i] + ' nicht geladen');
  }
  const [EFH_DATA, MIETMODELL, EINWOHNER, DICHTEN, PLZ_GEMEINDE] =
    await Promise.all(datenAntworten.map(r => r.json()));

  function nettomiete100(proPlz) {
    const koeff = MIETMODELL.mietmodell?.[proPlz]?.q50;
    if (!Array.isArray(koeff) || koeff.length !== 3) return NaN;
    const a = Math.log(100);  // Referenzwohnung 100 m²
    return Number(koeff[0]) + Number(koeff[1]) * a + Number(koeff[2]) * a * a;
  }

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

    // Beste getestete Baulandformel: EFH-/Mietpreis-Mischindex und Gemeindefaktor.
    // Alle 2110 Gemeinden: einheitlich BFS STATPOP 2025.
    // Bei nicht zuordenbaren PLZ oder fehlenden Immobilienwerten gilt die bisherige Preisberechnung.
    const bfs = PLZ_GEMEINDE[plz];
    const einw = Number(EINWOHNER[bfs]?.einwohner);
    const dichte = Number(DICHTEN[bfs]?.einwohner_pro_km2);
    const efh = Number(EFH_DATA[plz]?.median);
    const miete = nettomiete100(plz);
    const mitGemeindefaktor = Number.isFinite(einw) && einw > 0 &&
      Number.isFinite(dichte) && dichte > 0 &&
      Number.isFinite(efh) && efh > 0 &&
      Number.isFinite(miete) && miete > 0;

    const p = mitGemeindefaktor
      ? .7 * efh + .3 * miete / .03
      : Number(d.median);

    const gemeindefaktor = mitGemeindefaktor
      ? .859 * Math.pow(einw / 4000, .088) * Math.pow(dichte / 500, .1383)
      : 1;

    if (!Number.isFinite(p) || p <= 0) return;

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
      baulandKorrektur(p) * gemeindefaktor;

    // Nachvollziehbarkeit für technische Qualitätssicherung.
    // Wichtig: Keine unvollständigen Demografiewerte als 0 interpretieren.
    $('estimate').dataset.baulandModell = mitGemeindefaktor
      ? 'einwohner-dichte-efh-miete'
      : 'fallback-bisherige-formel';

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