"use strict";

// Wohnradar-Mietkennzahlen: gleiche Regressionsformel wie im bestehenden Testtool.
// Die Modelldaten liegen wie bei haus.html im Verzeichnis daten/.
const MODELL_DATEI = "daten/mietmodell_plz_parameter.json";
const ORTE_DATEI = "daten/mietkennzahlen_orte.json";

async function starteMietkennzahlen() {
    const $ = id => document.getElementById(id);
    const status = $('status');
    const placeInput = $('placeInput');
    const suggestionsEl = $('suggestions');
    const areaInput = $('area');
    const areaOutput = $('areav');
    let areaSelected = false;
    const resultShell = $('resultShell');
    const resultPlace = $('resultPlace');
    const resultValues = $('resultValues');
    const resultPlaceholder = $('resultPlaceholder');
    const desktopButton = $('estimateButtonDesktop');
    const mobileButton = $('estimateButtonMobile');
    const mobileMode = window.matchMedia('(max-width: 840px)');
    const formatCHF = value => Math.round(value).toLocaleString('de-CH');
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    let model = null;
    let places = [];
    let selectedPlz = null;
    let ortssuche = null;

    // Unveränderte Formel des bisherigen Mietpreis-Testtools:
    // Jahresmiete in CHF/m² = beta0 + beta1*ln(A) + beta2*ln(A)^2.
    function estimate(beta, area) {
        const x = Math.log(area);
        return beta[0] + beta[1] * x + beta[2] * x * x;
    }

    function setStatus(message, isError = false) {
        status.textContent = message;
        status.classList.toggle('is-error', isError);
    }

    function setButtonsReady(ready) {
        desktopButton.disabled = !ready;
        mobileButton.disabled = !ready;
    }

    function invalidateSelection() {
        selectedPlz = null;
        resultShell.classList.remove('has-estimate');
        resultValues.hidden = true;
        resultPlaceholder.hidden = false;
        resultPlace.textContent = '';
    }

    function calculate() {
        if (!model) {
            setStatus('Die Mietpreisdaten sind noch nicht verfügbar.', true);
            return;
        }
        if (!selectedPlz || !model[selectedPlz]) {
            setStatus('Bitte zuerst eine Ortschaft aus den Vorschlägen auswählen.', true);
            $('placeHint').textContent = 'Bitte eine Ortschaft aus den Vorschlägen auswählen.';
            placeInput.focus();
            return;
        }
        const area = Number(areaInput.value);
        if (!areaSelected || !Number.isFinite(area) || area < 30 || area > 180) {
            setStatus('Bitte die Wohnfläche mit dem Schieberegler einstellen (30 bis 180 m²).', true);
            areaInput.focus();
            return;
        }
        // Der Wert wird über den Schieberegler in ganzen Quadratmetern gewählt.
        const betas = model[selectedPlz];
        const q20 = estimate(betas.q20, area);
        const q50 = estimate(betas.q50, area);
        const q80 = estimate(betas.q80, area);
        if (![q20, q50, q80].every(Number.isFinite)) {
            setStatus('Für diese Eingaben konnte kein gültiger Wert berechnet werden.', true);
            return;
        }
        const fmtAnnual = value => `${formatCHF(value)} CHF`;
        const fmtMonthly = value => `${formatCHF(value * area / 12)} CHF`;
        for (const [name, price] of [['q20', q20], ['q50', q50], ['q80', q80]]) {
            $(`${name}sqm`).textContent = fmtAnnual(price);
            $(`${name}rent`).textContent = fmtMonthly(price);
        }
        const ort = places.find(p => p.plz === selectedPlz)?.ort || '';
        const showArea = area.toLocaleString('de-CH', {maximumFractionDigits: 1});
        resultPlace.textContent = `Wohnung mit ${showArea} m² Wohnfläche in ${selectedPlz} ${ort}`;
        resultValues.hidden = false;
        resultPlaceholder.hidden = true;
        resultShell.classList.add('has-estimate');
        setStatus('');
        if (mobileMode.matches) {
            window.scrollTo({top: 0, behavior: 'smooth'});
        }
    }

    // Identisches Grundprinzip wie beim Hausrechner:
    // Ergebnis auf Mobilgeräten oberhalb des Eingabeformulars.
    const resultAnchor = document.createComment('Desktop-Position der Mietkennzahlen');
    resultShell.parentNode.insertBefore(resultAnchor, resultShell);
    function arrangeResult() {
        const header = document.querySelector('.wrap > header');
        if (mobileMode.matches && header) header.insertAdjacentElement('afterend', resultShell);
        else resultAnchor.parentNode.insertBefore(resultShell, resultAnchor.nextSibling);
    }
    arrangeResult();
    window.addEventListener('resize', arrangeResult);

    // Wohnfläche wie beim Hausrechner: erst eine bewusste Reglerbedienung zählt.
    function updateArea() {
        areaSelected = true;
        areaOutput.textContent = `${Number(areaInput.value).toLocaleString('de-CH')} m²`;
        areaOutput.classList.remove('wr-not-selected');
        if (status.classList.contains('is-error')) setStatus('');
    }
    areaInput.addEventListener('input', updateArea);
    areaInput.addEventListener('change', updateArea);
    desktopButton.addEventListener('click', calculate);
    mobileButton.addEventListener('click', calculate);
    $('adjustButton').addEventListener('click', () => {
        document.querySelector('main .card').scrollIntoView({behavior: 'smooth', block: 'start'});
    });
    $('reset').addEventListener('click', () => {
        invalidateSelection();
        ortssuche?.close();
        placeInput.value = '';
        areaInput.value = areaInput.min;
        areaSelected = false;
        areaOutput.textContent = 'Bitte einstellen';
        areaOutput.classList.add('wr-not-selected');
        $('placeHint').textContent = '';
        setStatus('');
        if (mobileMode.matches) window.scrollTo({top: 0, behavior: 'smooth'});
    });

    try {
        const [modelResponse, orteResponse] = await Promise.all([
            fetch(MODELL_DATEI), fetch(ORTE_DATEI)
        ]);
        if (!modelResponse.ok) throw new Error(`Modelldaten (HTTP ${modelResponse.status})`);
        if (!orteResponse.ok) throw new Error(`Ortsnamen (HTTP ${orteResponse.status})`);
        const [rawModel, ortData] = await Promise.all([modelResponse.json(), orteResponse.json()]);
        model = rawModel;
        places = Object.entries(model).map(([plz]) => {
            const item = ortData[plz] || {};
            const ort = item.ort || plz;
            const aliases = item.alias || [];
            return {plz, ort, search: [ort, ...aliases].map(normalize)};
        });
        const { initOrtssuche } = await import(new URL('javascript_dateien/ortssuche.js?v=20261119-1', document.baseURI).href);
        ortssuche = initOrtssuche({
            places,
            isSelected: () => !!selectedPlz,
            onSelect: plz => {
                if (!model || !model[plz]) return;
                selectedPlz = plz;
                $('placeHint').textContent = '';
                // Neue Ortsauswahl: erneut ausdrücklich «Berechnen» drücken.
                resultShell.classList.remove('has-estimate');
                resultValues.hidden = true;
                resultPlaceholder.hidden = false;
                resultPlace.textContent = '';
            },
            onEdit: value => {
                invalidateSelection();
                $('placeHint').textContent = value.trim() ? 'Ort oder PLZ auswählen' : '';
            },
            onClear: () => {
                invalidateSelection();
                $('placeHint').textContent = '';
            }
        });
        setButtonsReady(true);
        setStatus('');
    } catch (error) {
        console.error('Wohnradar-Mietkennzahlen: Fehler beim Laden', error);
        setButtonsReady(false);
        setStatus('Mietpreisdaten konnten nicht geladen werden. Bitte die Website über einen Webserver aufrufen und die Dateien im Ordner daten prüfen.', true);
    }
}

starteMietkennzahlen();
