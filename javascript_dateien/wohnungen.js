
"use strict";

/*
 * WOHNRADAR – Eigentumswohnungen
 * Datenbasis: RealAdvisor-PLZ-Medianpreise aus wohnungspreise.json.
 */

async function starteWohnungswert() {

    const antwort = await fetch('daten/wohnungspreise.json');

    if (!antwort.ok) {
        throw new Error('Wohnungspreise konnten nicht geladen werden');
    }

    const DATA = await antwort.json();
    const $ = id => document.getElementById(id);
    const fmt = n => Math.round(n).toLocaleString('de-CH');
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const YEAR = 2026;

    // ==========================================================
    // MODELLPARAMETER
    // ==========================================================

    const PARTS = [
        {id:'kitchen',label:'Küche',cost:26000,life:30,exp:.55},
        {id:'bath',label:'Bad und WC',cost:29000,life:30,exp:.50},
        {id:'interior',label:'Innenausbau (Böden, Malerarbeiten, Türen)',cost:34000,life:30,exp:.85},
        {id:'windows',label:'Fenster',cost:18000,life:35,exp:.65},
        {id:'heat',label:'Heizung / Haustechnik (Wohnungsanteil)',cost:11500,life:25,exp:.65},
        {id:'water',label:'Sanitärleitungen (Wohnungsanteil)',cost:11000,life:50,exp:.65},
        {id:'electric',label:'Elektroinstallationen',cost:14000,life:40,exp:.70}
    ];

    const DEFAULT_AGES = {
        kitchen:15,
        bath:16,
        interior:14,
        windows:22,
        heat:14,
        water:25,
        electric:24
    };

    const METRICS = [
        {
            id:'view',
            label:'Aussicht',
            names:['Schlecht','Eingeschränkt','Durchschnittlich','Schön','Sehr schön','Herausragend'],
            values:[-6,-3,0,3,6,10],
            def:2
        },
        {
            id:'access',
            label:'Geschäfte, Schulen und ÖV',
            names:['Sehr schlecht','Eher schlecht','Durchschnittlich','Gut','Sehr gut'],
            values:[-6,-3,0,2,4],
            def:2
        },
        {
            id:'noise',
            label:'Ruhe / Lärmbelastung',
            names:['Extrem laut','Stark belastet','Verkehrslärm','Durchschnittlich','Ruhig','Sehr ruhig'],
            values:[-8,-5,-2,0,2,4],
            def:3
        },
        {
            id:'quality',
            label:'Bauqualität und Wohnkomfort',
            names:['Einfach','Eher einfach','Durchschnittlich','Gehoben','Sehr hochwertig'],
            values:[-7,-3,0,4,8],
            def:2
        },
        {
            id:'light',
            label:'Besonnung / Tageslicht',
            names:['Sehr schlecht','Eher schlecht','Durchschnittlich','Gut','Sehr gut'],
            values:[-5,-2,0,2,4],
            def:2
        }
    ];

    // ==========================================================
    // STATUS
    // ==========================================================

    const S = {
        plz: DATA['5400'] ? '5400' : Object.keys(DATA)[0],
        garage: 0,
        outside: 0,
        mode: 'normal',
        renovations: {},
        placeSelected: false,
        estimateRequested: false,
        livingConfirmed: false,
        landConfirmed: false,
        floorConfirmed: false
    };

    function normalize(t) {
        return String(t)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    const places = Object.entries(DATA).map(([plz, d]) => ({
        plz,
        ort: d.ort,
        norm: normalize(plz + ' ' + d.ort)
    }));

    // ==========================================================
    // RENOVATIONEN
    // ==========================================================

    const CONDITION_LABELS = [
        'Sehr schlecht', 'Schlecht', 'Mittel', 'Gut', 'Sehr gut', 'Neuwertig'
    ];

    function renovationYears(mode, b) {
        const out = {};
        const buildingAge = YEAR - b;
        for (const p of PARTS) {
            const normalAge = Math.min(buildingAge, DEFAULT_AGES[p.id]);
            const newAge = Math.min(buildingAge, 4);
            let age;
            switch (Number(mode)) {
                case 0: age = buildingAge; break;
                case 1: age = (buildingAge + normalAge) / 2; break;
                case 2: age = normalAge; break;
                case 3: age = (normalAge + newAge) / 2; break;
                case 4: age = newAge; break;
                case 5: age = 0; break;
                default: age = normalAge;
            }
            out[p.id] = YEAR - Math.round(age);
        }
        return out;
    }

    function renderRenos() {

        const b = +$('built').value;

        $('ageFields').innerHTML = PARTS.map(p => {

            const yr = clamp(
                S.renovations[p.id] ?? b,
                b,
                YEAR
            );

            return `
                <div class="reno">
                    <div class="rangehead">
                        <label for="reno_${p.id}">${p.label}</label>
                        <output id="renov_${p.id}">
                            ${yr === b ? 'Seit Baujahr (' + b + ')' : yr}
                        </output>
                    </div>
                    <input
                        type="range"
                        id="reno_${p.id}"
                        min="${b}"
                        max="${YEAR}"
                        step="1"
                        value="${yr}"
                        data-reno="${p.id}"
                    >
                </div>
            `;

        }).join('');

        document.querySelectorAll('[data-reno]').forEach(el => {

            el.addEventListener('input', () => {

                S.renovations[el.dataset.reno] = +el.value;

                $('renov_' + el.dataset.reno).textContent =
                    +el.value === b
                        ? 'Seit Baujahr (' + b + ')'
                        : el.value;

                calc();
            });
        });
    }

    function setMode(mode) {
        S.mode = Number(mode);
        $('condition').value = S.mode;
        $('conditionv').textContent = CONDITION_LABELS[S.mode];
        S.renovations = renovationYears(S.mode, +$('built').value);
        renderRenos();
        calc();
    }

    // ==========================================================
    // LAGE- UND KOMFORTREGLER
    // ==========================================================

    $('sliders').innerHTML = METRICS.map(s => `
        <div class="range">
            <div class="rangehead">
                <label for="${s.id}">${s.label}</label>
                <output id="${s.id}v"></output>
            </div>
            <input
                id="${s.id}"
                type="range"
                min="0"
                max="${s.values.length - 1}"
                value="0"
                step="1"
            >
        </div>
    `).join('');

    // ==========================================================
    // ORTSSUCHE
    // ==========================================================

    const placeInput = $('placeInput');
    const suggestionList = $('suggestions');
    const placeHint = $('placeHint');

    const mobilePlaceMode = window.matchMedia('(max-width: 840px)');

    let placeFocused = false;
    let activeSuggestion = -1;
    let selectingPlace = false;
    let keyboardTimer = null;

    placeInput.value = '';
    placeInput.placeholder = 'Ort oder PLZ eingeben';
    placeInput.setAttribute('autocomplete', 'off');

    // Pflichtangaben: Fehler erst nach einem Schätzversuch anzeigen.
    placeInput.setAttribute('aria-describedby', 'placeHint');
    function clearPlaceError() {
        placeInput.classList.remove('wr-place-invalid');
        placeInput.removeAttribute('aria-invalid');
        placeHint.classList.remove('wr-place-error');
        placeHint.removeAttribute('role');
    }
    function showPlaceError() {
        placeInput.classList.add('wr-place-invalid');
        placeInput.setAttribute('aria-invalid', 'true');
        placeHint.classList.add('wr-place-error');
        placeHint.setAttribute('role', 'alert');
        placeHint.textContent = 'Bitte wählen Sie eine Ortschaft oder Postleitzahl aus der Vorschlagsliste.';
    }
    function clearRangeError(id) {
        const el = $(id), hint = $(id + 'Hint');
        el.classList.remove('wr-range-invalid');
        el.removeAttribute('aria-invalid');
        hint.hidden = true;
        hint.textContent = '';
    }
    function showRangeError(id, message) {
        const el = $(id), hint = $(id + 'Hint');
        el.classList.add('wr-range-invalid');
        el.setAttribute('aria-invalid', 'true');
        hint.textContent = message;
        hint.hidden = false;
    }
    function showRequiredLabels() {
        for (const id of ['living','land','floor']) {
            const out = $(id + 'v');
            if (!S[id + 'Confirmed']) {
                out.textContent = 'Bitte einstellen';
                out.classList.add('wr-not-selected');
            } else {
                out.classList.remove('wr-not-selected');
            }
        }
    }
    function confirmRequired(id) {
        S[id + 'Confirmed'] = true;
        clearRangeError(id);
        calc();
    }
    function scrollToInvalid(el) {
        const header = document.querySelector('.wrap > header');
        const headHeight = header ? header.getBoundingClientRect().height : 0;
        const offset = headHeight + 28;
        const top = window.scrollY + el.getBoundingClientRect().top - offset;
        window.scrollTo({top:Math.max(0,top), behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    }


    function closeSuggestions() {

        clearTimeout(keyboardTimer);

        suggestionList.classList.add('hide');
        suggestionList.style.display = 'none';

        placeInput.setAttribute('aria-expanded', 'false');
        placeInput.removeAttribute('aria-activedescendant');

        activeSuggestion = -1;
    }

    function showSuggestions() {

        suggestionList.classList.remove('hide');
        suggestionList.style.display = 'block';
        suggestionList.style.visibility = 'visible';
        suggestionList.style.opacity = '1';

        placeInput.setAttribute('aria-expanded', 'true');
    }

    function choose(plz) {

        if (!DATA[plz]) return;

        selectingPlace = false;

        S.plz = plz;
        S.placeSelected = true;
        clearPlaceError();

        placeInput.value = plz + ' ' + DATA[plz].ort;

        closeSuggestions();

        placeHint.textContent = '';
        placeInput.blur();

        calc();
    }

    function suggestions() {

        const raw = normalize(placeInput.value);

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

                return Number(bb) - Number(aa) ||
                    a.ort.localeCompare(b.ort, 'de');
            })
            .slice(0, 12);

        suggestionList.replaceChildren();

        activeSuggestion = -1;
        placeInput.removeAttribute('aria-activedescendant');

        if (!matches.length) {
            closeSuggestions();
            return;
        }

        matches.forEach((p, i) => {

            const btn = document.createElement('button');

            btn.type = 'button';
            btn.setAttribute('role', 'option');
            btn.setAttribute('aria-selected', 'false');

            btn.id = 'suggest_' + i;
            btn.dataset.plz = p.plz;

            btn.append(document.createTextNode(p.ort + ' '));

            const small = document.createElement('small');
            small.textContent = 'PLZ ' + p.plz;

            btn.append(small);

            btn.addEventListener(
                'pointerdown',
                e => e.preventDefault()
            );

            btn.addEventListener('click', () => choose(p.plz));

            suggestionList.append(btn);
        });

        showSuggestions();

        // Smartphone: Tastatur nach 700 ms schliessen,
        // Vorschlagsliste aber geöffnet lassen.

        if (mobilePlaceMode.matches) {

            clearTimeout(keyboardTimer);

            keyboardTimer = setTimeout(() => {

                if (
                    document.activeElement === placeInput &&
                    !suggestionList.classList.contains('hide') &&
                    suggestionList.querySelector('button')
                ) {

                    selectingPlace = true;
                    placeInput.blur();

                    requestAnimationFrame(() => {
                        if (selectingPlace) {
                            showSuggestions();
                        }
                    });
                }

            }, 700);
        }
    }

    function highlightSuggestion(i) {

        const buttons = [
            ...suggestionList.querySelectorAll('button')
        ];

        if (!buttons.length) return;

        activeSuggestion =
            (i + buttons.length) % buttons.length;

        buttons.forEach((b, j) => {
            b.setAttribute(
                'aria-selected',
                String(j === activeSuggestion)
            );
        });

        const activeButton = buttons[activeSuggestion];

        placeInput.setAttribute(
            'aria-activedescendant',
            activeButton.id
        );

        activeButton.scrollIntoView({
            block: 'nearest'
        });
    }

    // ==========================================================
    // BEWERTUNG
    // ==========================================================

    function calc() {

        const d = DATA[S.plz];

        if (!d) return;

        const w = +$('living').value;
        const balcony = +$('land').value;
        const b = +$('built').value;
        const m = d.median;

        const floor = +$('floor').value;
        const lift = $('lift').value === 'yes';

        const type = document.querySelector(
            'input[name=apartmentType]:checked'
        ).value;

        $('livingv').textContent = fmt(w) + ' m²';
        $('landv').textContent = fmt(balcony) + ' m²';
        $('builtv').textContent = b;

        $('floorv').textContent =
            floor === 0 ? 'Erdgeschoss' : floor + '. Stock';
        showRequiredLabels();

        $('garagev').textContent = S.garage;
        $('outsidev').textContent = S.outside;

        // ------------------------------------------------------
        // GRUNDWERT
        // ------------------------------------------------------

        const base =
            m * w * Math.pow(w / 100, -.035);

        // ------------------------------------------------------
        // BALKON / TERRASSE
        // ------------------------------------------------------

        const effectiveBalcony =
            Math.min(balcony, 40) +
            Math.max(0, balcony - 40) * .35;

        const balconyValue =
            m * .22 * effectiveBalcony;

        // ------------------------------------------------------
        // ALTER UND RENOVATIONEN
        // ------------------------------------------------------

        let ageDed = 0;
        let referenceAgeDed = 0;

        for (const p of PARTS) {

            const cost =
                p.cost *
                Math.pow(w / 100, p.exp) *
                Math.pow(m / 10000, .18);

            const renovated = clamp(
                Number(S.renovations[p.id] ?? b) || b,
                b,
                YEAR
            );

            ageDed += cost *
                clamp(
                    (YEAR - renovated) / p.life,
                    0,
                    1
                );

            referenceAgeDed += cost *
                clamp(
                    DEFAULT_AGES[p.id] / p.life,
                    0,
                    1
                );
        }

        const gross =
            base +
            balconyValue +
            referenceAgeDed;

        const afterAge =
            Math.max(0, gross - ageDed);

        // ------------------------------------------------------
        // WOHNUNGSTYP
        // ------------------------------------------------------

        const typePct = {
            standard: 0,
            attic: 8,
            garden: 2
        }[type];

        // ------------------------------------------------------
        // STOCKWERK UND LIFT
        // ------------------------------------------------------

        const floorPct = lift
            ? clamp((floor - 2) * .7, -1.4, 4)
            : (
                floor <= 2
                    ? clamp((floor - 2) * .7, -1.4, 0)
                    : -Math.min(7, (floor - 2) * 1.8)
            );

        const liftPct =
            lift ? 0 : (floor >= 2 ? -1.5 : 0);

        // ------------------------------------------------------
        // MIKROLAGE UND QUALITÄT
        // ------------------------------------------------------

        let micro = 0;
        let quality = 0;

        for (const s of METRICS) {

            const i = +$(s.id).value;

            $(s.id + 'v').textContent = s.names[i];

            if (s.id === 'quality') {
                quality = s.values[i];
            } else {
                micro += s.values[i];
            }
        }

        micro = clamp(micro, -20, 20);

        const adjusted =
            afterAge *
            (
                1 +
                (
                    typePct +
                    floorPct +
                    liftPct +
                    micro +
                    quality
                ) / 100
            );

        // ======================================================
        // GARAGEN UND AUSSENPARKPLÄTZE – KORRIGIERT
        // ======================================================

        const gp = clamp(
            32000 + .35 * (m - 10000),
            25000,
            42000
        );

        const ap = clamp(
            12000 + .25 * (m - 10000),
            7000,
            19000
        );

        // 0 Garagen = CHF 0
        // 1 Garage  = 1 × Einzelpreis
        // 2 Garagen = 2 × Einzelpreis
        // usw.

        const garageAdjustment = S.garage * gp;

        const outsideAdjustment = S.outside * ap;

        // ======================================================
        // KALIBRIERUNG – UNVERÄNDERT
        // ======================================================

        const ageFactor =
            b < 1980 ? .88455 :
            b < 2000 ? .90010 :
            b < 2015 ? 1.02600 :
            1.03701;

        // Bisherige Referenzstufen erhalten: 0=alt, 2=normal, 5=neu.
        // Dazwischen liegende Stufen werden sanft interpoliert.
        const renovationWeight = [0.5, 0.75, 1, 0.65, 0.25, 0][S.mode] ?? 1;

        const calibratedAgeFactor =
            1 + (ageFactor - 1) * renovationWeight;

        const generalFactor = 1 / 1.034;

        const largeHomeWeight =
            clamp((w - 220) / 80, 0, 1);

        const largeHomeFactor =
            1 +
            largeHomeWeight *
            ((1.034 / .9132) - 1);

        const rawResult =
            (adjusted * .94) *
            calibratedAgeFactor +
            garageAdjustment +
            outsideAdjustment;

        const result = Math.max(
            0,
            rawResult *
            generalFactor *
            largeHomeFactor
        );

        // ======================================================
        // VERKEHRSWERT – ERST NACH KLICK ANZEIGEN
        // ======================================================

        $('estimate').textContent =
            S.placeSelected && S.livingConfirmed && S.landConfirmed && S.floorConfirmed && S.estimateRequested
                ? 'CHF ' + fmt(result)
                : 'CHF 0';

        // ------------------------------------------------------
        // ALTERSABZUG
        // ------------------------------------------------------

        $('ageout').textContent =
            '− CHF ' + fmt(ageDed);

        // ------------------------------------------------------
        // ANZAHL GARAGEN
        // ------------------------------------------------------

        $('garageLabel').textContent =
            S.garage + ' ' +
            (
                S.garage === 1
                    ? 'Garagenplatz'
                    : 'Garagenplätze'
            );

        // ------------------------------------------------------
        // ANZAHL AUSSENPARKPLÄTZE
        // ------------------------------------------------------

        $('outsideLabel').textContent =
            S.outside + ' ' +
            (
                S.outside === 1
                    ? 'Aussenparkplatz'
                    : 'Aussenparkplätze'
            );

        // ------------------------------------------------------
        // GARAGENWERT
        // ------------------------------------------------------

        $('garageout').textContent =
            '+ CHF ' + fmt(garageAdjustment);

        // ------------------------------------------------------
        // AUSSENPARKPLATZWERT
        // ------------------------------------------------------

        $('outsideout').textContent =
            '+ CHF ' + fmt(outsideAdjustment);
    }

    // ==========================================================
    // EREIGNISSE DER ORTSSUCHE
    // ==========================================================

    placeInput.addEventListener('focus', () => {

        selectingPlace = false;
        placeFocused = true;

        closeSuggestions();

        placeInput.value = '';
        placeInput.placeholder = '';

        if (!placeInput.classList.contains('wr-place-invalid')) placeHint.textContent = '';
    });

    placeInput.addEventListener('input', () => {

        // Neue Eingabe: bisherige Ortsauswahl ungültig.
        S.placeSelected = false;
        S.estimateRequested = false;

        calc();

        if (!placeInput.classList.contains('wr-place-invalid')) {
            placeHint.textContent = placeInput.value.trim() ? 'Ort oder PLZ auswählen' : '';
        }

        suggestions();
    });

    $('clearPlace').addEventListener('click', () => {

        selectingPlace = false;

        closeSuggestions();

        placeInput.value = '';

        S.placeSelected = false;
        S.estimateRequested = false;

        calc();

        if (!placeInput.classList.contains('wr-place-invalid')) placeHint.textContent = 'Ortschaft oder PLZ eingeben';

        placeInput.focus();
    });

    placeInput.addEventListener('keydown', e => {

        const buttons = [
            ...suggestionList.querySelectorAll('button')
        ];

        if (e.key === 'ArrowDown' && buttons.length) {

            e.preventDefault();
            highlightSuggestion(activeSuggestion + 1);

        } else if (e.key === 'ArrowUp' && buttons.length) {

            e.preventDefault();

            highlightSuggestion(
                activeSuggestion < 0
                    ? buttons.length - 1
                    : activeSuggestion - 1
            );

        } else if (e.key === 'Enter' && buttons.length) {

            e.preventDefault();

            choose(
                buttons[Math.max(0, activeSuggestion)].dataset.plz
            );

        } else if (e.key === 'Escape') {

            selectingPlace = false;
            closeSuggestions();
            placeInput.blur();
        }
    });

    placeInput.addEventListener('blur', () => {

        placeInput.placeholder = 'Ort oder PLZ eingeben';

        if (!selectingPlace) {
            clearTimeout(keyboardTimer);
        }

        placeFocused = false;

        setTimeout(() => {

            if (!selectingPlace) {
                closeSuggestions();
            }

            if (
                !selectingPlace &&
                placeInput.value.trim() &&
                placeInput.value.trim() !==
                    S.plz + ' ' + DATA[S.plz].ort
            ) {

                if (!placeInput.classList.contains('wr-place-invalid')) {
                    placeHint.textContent = 'Bitte einen Ort aus den Vorschlägen wählen';
                }
            }

        }, 160);
    });

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
    // EREIGNISSE DER REGLER
    // ==========================================================

    [
        'lift',
        ...METRICS.map(s => s.id)
    ].forEach(id => {

        $(id).addEventListener('input', calc);
    });

    // Erst nach bewusster Bedienung sind die drei Regler bestätigt.
    // Pointerup erlaubt auch den Mindestwert (etwa 0 m² Balkon),
    // selbst wenn die Reglerposition unverändert bleibt.
    ['living','land','floor'].forEach(id => {
        const slider = $(id);
        slider.addEventListener('input', () => confirmRequired(id));
        slider.addEventListener('pointerup', () => confirmRequired(id));
        slider.addEventListener('keyup', e => {
            if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) confirmRequired(id);
        });
    });

    document.querySelectorAll(
        'input[name=apartmentType]'
    ).forEach(el => {

        el.addEventListener('change', calc);
    });

    $('built').addEventListener('input', () => {

        S.renovations = renovationYears(
            S.mode,
            +$('built').value
        );

        renderRenos();
        calc();
    });

    $('condition').addEventListener('input', () => setMode($('condition').value));

    // ==========================================================
    // GARAGEN- UND PARKPLATZZÄHLER
    // ==========================================================

    document.querySelectorAll('[data-count]').forEach(btn => {

        btn.addEventListener('click', () => {

            const [k, v] = btn.dataset.count.split(':');

            S[k] = clamp(
                S[k] + Number(v),
                0,
                8
            );

            calc();
        });
    });

    // ==========================================================
    // SCHÄTZEN-BUTTON
    // ==========================================================

    function showEstimate() {
        // Sämtliche fehlenden Angaben markieren und zum ersten Fehler scrollen.
        if (!S.placeSelected) showPlaceError(); else clearPlaceError();
        for (const [id, label] of [
            ['living','Wohnfläche'], ['land','Balkon- / Terrassenfläche'],
            ['floor','Stockwerk']
        ]) {
            if (!S[id + 'Confirmed']) showRangeError(id, 'Bitte ' + label + ' einstellen.');
            else clearRangeError(id);
        }
        const missing = !S.placeSelected || !S.livingConfirmed ||
                        !S.landConfirmed || !S.floorConfirmed;
        if (missing) {
            const first = !S.placeSelected ? 'placeInput' :
                !S.livingConfirmed ? 'living' : !S.landConfirmed ? 'land' : 'floor';
            scrollToInvalid($(first));
            return;
        }
        S.estimateRequested = true;
        calc();
        const resultShell = $('resultShell');
        if (resultShell) resultShell.classList.add('has-estimate');
        if (window.matchMedia('(max-width: 840px)').matches) {
            window.scrollTo({top:0,behavior:'smooth'});
        }
    }

    // Beide Buttons unterstützen.
    // Fehlende HTML-Elemente verursachen keinen Fehler.

    ['estimateButtonDesktop', 'estimateButtonMobile'].forEach(id => {

        const button = $(id);

        if (button) {
            button.addEventListener('click', showEstimate);
        }
    });

    // ==========================================================
    // ZURÜCKSETZEN
    // ==========================================================

    $('reset').addEventListener('click', () => {

        $('living').value = $('living').min;
        $('land').value = $('land').min;
        $('built').value = 1995;
        $('floor').value = $('floor').min;
        $('lift').value = 'yes';

        document.querySelector(
            'input[name=apartmentType][value=standard]'
        ).checked = true;

        METRICS.forEach(s => {
            $(s.id).value = s.def;
        });

        // Garagen und Parkplätze zurücksetzen.
        S.garage = 0;
        S.outside = 0;

        // Interne PLZ zurücksetzen.
        S.plz = DATA['5400']
            ? '5400'
            : Object.keys(DATA)[0];

        // Schätzung zurücksetzen.
        S.placeSelected = false;
        S.estimateRequested = false;
        S.livingConfirmed = false;
        S.landConfirmed = false;
        S.floorConfirmed = false;
        clearPlaceError();
        ['living','land','floor'].forEach(clearRangeError);

        setMode(2);

        placeInput.value = '';
        placeHint.textContent = '';

        const resultShell = $('resultShell');

        if (resultShell) {
            resultShell.classList.remove('has-estimate');
        }

        calc();

        // Verkehrswert bleibt CHF 0.
        $('estimate').textContent = 'CHF 0';
    });

    // ==========================================================
    // INITIALISIERUNG
    // ==========================================================

    setMode(2);

    S.placeSelected = false;
    S.estimateRequested = false;

    placeInput.value = '';
    placeHint.textContent = '';

    calc();

    $('estimate').textContent = 'CHF 0';
}

// ============================================================
// FEHLERBEHANDLUNG
// ============================================================

starteWohnungswert().catch(error => {

    console.error(
        'Wohnungswert: Datenfehler',
        error
    );

    const out = document.getElementById('estimate');

    if (out) {
        out.textContent = 'CHF 0';
    }

    const hint = document.getElementById('placeHint');

    if (hint) {
        hint.textContent =
            'Wohnungspreise konnten nicht geladen werden. ' +
            'Bitte die Seite über einen Webserver öffnen.';
    }
});
