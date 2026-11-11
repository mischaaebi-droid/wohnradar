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
    const resultShell = $('resultShell');
    const resultPlace = $('resultPlace');
    const resultValues = $('resultValues');
    const resultPlaceholder = $('resultPlaceholder');
    const desktopButton = $('estimateButtonDesktop');
    const mobileButton = $('estimateButtonMobile');
    const mobileMode = window.matchMedia('(max-width: 840px)');
    const formatCHF = value => Math.round(value).toLocaleString('de-CH');
    const normalize = value => String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    let model = null;
    let places = [];
    let selectedPlz = null;
    let activeSuggestion = -1;
    let placeFocused = false;
    let choosing = false;
    let blurTimer = null;

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

    function closeSuggestions() {
        suggestionsEl.classList.add('hide');
        placeInput.setAttribute('aria-expanded', 'false');
        placeInput.removeAttribute('aria-activedescendant');
        activeSuggestion = -1;
    }

    function invalidateSelection() {
        selectedPlz = null;
        resultShell.classList.remove('has-estimate');
        resultValues.hidden = true;
        resultPlaceholder.hidden = false;
        resultPlace.textContent = '';
    }

    function choose(plz) {
        if (!model || !model[plz]) return;
        const info = places.find(p => p.plz === plz);
        selectedPlz = plz;
        choosing = true;
        placeInput.value = `${plz} ${info ? info.ort : ''}`.trim();
        $('placeHint').textContent = '';
        closeSuggestions();
        placeInput.blur();
        choosing = false;
        // Eine neue Ortsauswahl erfordert einen bewussten Klick auf "Berechnen".
        resultShell.classList.remove('has-estimate');
        resultValues.hidden = true;
        resultPlaceholder.hidden = false;
        resultPlace.textContent = '';
    }

    function getMatches(raw) {
        if (raw.length < 2) return [];
        const exactPLZ = /^\d{2,4}$/.test(raw);
        return places.filter(place => {
            if (place.plz.startsWith(raw)) return true;
            if (exactPLZ) return false;
            return place.search.some(name => name.startsWith(raw) || name.includes(' ' + raw));
        }).sort((a, b) => {
            const aStart = a.plz.startsWith(raw) || a.search.some(name => name.startsWith(raw));
            const bStart = b.plz.startsWith(raw) || b.search.some(name => name.startsWith(raw));
            return Number(bStart) - Number(aStart) ||
                   a.ort.localeCompare(b.ort, 'de-CH') || a.plz.localeCompare(b.plz);
        }).slice(0, 12);
    }

    function showSuggestions() {
        const raw = normalize(placeInput.value);
        if (!placeFocused || raw.length < 2) {
            closeSuggestions();
            return;
        }
        const matches = getMatches(raw);
        suggestionsEl.replaceChildren();
        matches.forEach((p, i) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.id = `suggest_${i}`;
            button.dataset.plz = p.plz;
            button.setAttribute('role', 'option');
            button.setAttribute('aria-selected', 'false');
            button.append(document.createTextNode(`${p.ort} `));
            const small = document.createElement('small');
            small.textContent = `PLZ ${p.plz}`;
            button.appendChild(small);
            button.addEventListener('pointerdown', ev => ev.preventDefault());
            button.addEventListener('click', () => choose(p.plz));
            suggestionsEl.appendChild(button);
        });
        suggestionsEl.classList.toggle('hide', matches.length === 0);
        placeInput.setAttribute('aria-expanded', String(matches.length > 0));
        activeSuggestion = -1;
    }

    function highlightSuggestion(i) {
        const buttons = [...suggestionsEl.querySelectorAll('button')];
        if (!buttons.length) return;
        activeSuggestion = (i + buttons.length) % buttons.length;
        buttons.forEach((button, n) => button.setAttribute('aria-selected', String(n === activeSuggestion)));
        placeInput.setAttribute('aria-activedescendant', buttons[activeSuggestion].id);
        buttons[activeSuggestion].scrollIntoView({block: 'nearest'});
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
        if (!areaInput.value.trim() || !Number.isFinite(area) || area < 30 || area > 180) {
            setStatus('Bitte eine Wohnfläche zwischen 30 und 180 m² eingeben.', true);
            areaInput.focus();
            return;
        }
        // Nur ein Dezimalzeichen wie im ursprünglichen Testtool erlaubt.
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
        resultPlace.textContent = `${selectedPlz} ${ort} · ${showArea} m²`;
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

    placeInput.addEventListener('focus', () => {
        if (blurTimer !== null) clearTimeout(blurTimer);
        if (!choosing) {
            placeFocused = true;
            selectedPlz = null;
            placeInput.value = '';
            resultShell.classList.remove('has-estimate');
            resultValues.hidden = true;
            resultPlaceholder.hidden = false;
            resultPlace.textContent = '';
            showSuggestions();
        }
    });
    placeInput.addEventListener('input', () => {
        if (blurTimer !== null) clearTimeout(blurTimer);
        invalidateSelection();
        $('placeHint').textContent = placeInput.value.trim() ? 'Ort oder PLZ auswählen' : '';
        showSuggestions();
    });
    placeInput.addEventListener('keydown', ev => {
        const buttons = [...suggestionsEl.querySelectorAll('button')];
        if (ev.key === 'ArrowDown' && buttons.length) {
            ev.preventDefault();
            highlightSuggestion(activeSuggestion + 1);
        } else if (ev.key === 'ArrowUp' && buttons.length) {
            ev.preventDefault();
            highlightSuggestion(activeSuggestion < 0 ? buttons.length - 1 : activeSuggestion - 1);
        } else if (ev.key === 'Enter') {
            if (buttons.length) {
                ev.preventDefault();
                choose(buttons[Math.max(0, activeSuggestion)].dataset.plz);
            } else if (selectedPlz) {
                ev.preventDefault();
                calculate();
            }
        } else if (ev.key === 'Escape') {
            closeSuggestions();
            placeInput.blur();
        }
    });
    placeInput.addEventListener('blur', () => {
        placeFocused = false;
        blurTimer = window.setTimeout(closeSuggestions, 160);
    });
    $('clearPlace').addEventListener('click', () => {
        invalidateSelection();
        placeInput.value = '';
        $('placeHint').textContent = '';
        placeInput.focus();
    });
    document.addEventListener('pointerdown', ev => {
        if (!placeInput.contains(ev.target) && !suggestionsEl.contains(ev.target) && !$('clearPlace').contains(ev.target)) {
            closeSuggestions();
        }
    });
    areaInput.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            calculate();
        }
    });
    desktopButton.addEventListener('click', calculate);
    mobileButton.addEventListener('click', calculate);
    $('adjustButton').addEventListener('click', () => {
        document.querySelector('main .card').scrollIntoView({behavior: 'smooth', block: 'start'});
    });
    $('reset').addEventListener('click', () => {
        invalidateSelection();
        closeSuggestions();
        placeInput.value = '';
        areaInput.value = '';
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
        setButtonsReady(true);
        setStatus('');
    } catch (error) {
        console.error('Wohnradar-Mietkennzahlen: Fehler beim Laden', error);
        setButtonsReady(false);
        setStatus('Mietpreisdaten konnten nicht geladen werden. Bitte die Website über einen Webserver aufrufen und die Dateien im Ordner daten prüfen.', true);
    }
}

starteMietkennzahlen();
