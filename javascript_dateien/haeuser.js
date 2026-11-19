'use strict';

// ==================================================
// IMMOBILIENPREISDATEN LADEN
// ==================================================

async function ladeImmobilienpreise() {
    const antwort = await fetch('daten/immobilienpreise.json');

    if (!antwort.ok) {
        throw new Error(
            `Immobilienpreisdaten konnten nicht geladen werden (HTTP ${antwort.status}).`
        );
    }

    return antwort.json();
}

async function starteHauswert() {

    // ==================================================
    // DATEN, HILFSFUNKTIONEN UND MODELLPARAMETER
    // ==================================================

    const DATA = await ladeImmobilienpreise();

    const $ = id => document.getElementById(id);

    const fmt = n =>
        Math.round(n).toLocaleString('de-CH');

    const clamp = (x, a, b) =>
        Math.max(a, Math.min(b, x));

    const YEAR = 2026;

    const PARTS = [
        {
            id: 'kitchen',
            label: 'Küche',
            k: 30000,
            a: .5,
            b: .25,
            l: 30,
            lo: 20000,
            hi: 50000
        },
        {
            id: 'bath',
            label: 'Bäder und WC',
            k: 40000,
            a: .4,
            b: .15,
            l: 30,
            lo: 24000,
            hi: 64000
        },
        {
            id: 'interior',
            label: 'Innenausbau (Böden, Malerarbeiten, Türen)',
            k: 65000,
            a: .9,
            b: .05,
            l: 30
        },
        {
            id: 'windows',
            label: 'Fenster',
            k: 35000,
            a: .8,
            b: .05,
            l: 35
        },
        {
            id: 'heat',
            label: 'Heizung',
            k: 35000,
            a: .6,
            b: .05,
            l: 25
        },
        {
            id: 'water',
            label: 'Wasser- und Abwasserleitungen',
            k: 30000,
            a: .7,
            b: .05,
            l: 50
        },
        {
            id: 'electric',
            label: 'Elektroinstallationen',
            k: 25000,
            a: .75,
            b: .05,
            l: 40
        },
        {
            id: 'roof',
            label: 'Dach',
            k: 50000,
            a: .8,
            b: .05,
            l: 50
        },
        {
            id: 'facade',
            label: 'Fassade (ohne Dämmung)',
            k: 35000,
            a: .8,
            b: .05,
            l: 40
        }
    ];

    const METRICS = [
        {
            id: 'view',
            label: 'Aussicht',
            names: [
                'Schlecht',
                'Eingeschränkt',
                'Durchschnittlich',
                'Schön',
                'Sehr schön',
                'Herausragend'
            ],
            values: [-4, -2, 0, 3, 5, 8],
            def: 2
        },
		
		
		
	{
    id: 'access',
    label: 'Geschäfte, Schulen und ÖV',
    names: [
        'Sehr schlecht',
        'Schlecht',
        'Durchschnittlich',
        'Gut',
        'Sehr gut',
        'Hervorragend'
    ],
    values: [-4, -3, 0, 2, 3, 4],
    def: 2
},	
   
   
   
   
   
        {
            id: 'noise',
            label: 'Ruhe / Lärmbelastung',
            names: [
                'Extrem laut',
                'Stark belastet',
				 'Durchschnittlich',
                'Eher ruhig',
                'Ruhig',
                'Sehr ruhig'
            ],
            values: [-4, -2.5, -1.5, 0, 2, 4],
            def: 2
        },


{
    id: 'quality',
    label: 'Bauqualität und Wohnkomfort',
    names: [
        'Sehr einfach',
        'Einfach',
        'Durchschnittlich',
        'Gehoben',
        'Sehr gehoben',
        'Luxuriös'
    ],
    values: [-4, -2, 0, 2, 3, 4],
    def: 2
},










    ];

    // ==================================================
    // ZUSTAND DER ANWENDUNG
    // ==================================================

    const S = {
        plz: '5400',
        garage: 0,
        outside: 0,
        mode: 'normal',
        renovations: {},

        // NEU: Wurde eine Gemeinde ausgewählt?
        placeSelected: false,

        // NEU: Wurde bereits auf "Schätzen" geklickt?
        estimateRequested: false,
        livingConfirmed: false,
        landConfirmed: false
    };

    const places = Object.entries(DATA).map(([plz, d]) => ({
        plz,
        ort: d.ort,
        norm: (plz + ' ' + d.ort)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
    }));


    // ==================================================
    // RENOVATIONSJAHRE
    // ==================================================

    const CONDITION_LABELS = [
        'Sehr schlecht',
        'Schlecht',
        'Mittel',
        'Gut',
        'Sehr gut',
        'Neuwertig'
    ];

    // Mittel entspricht dem bisherigen Modus "normal".
    // Sehr schlecht entspricht "old", sehr gut etwa "new".
    // Die Zwischenstufen verteilen die angenommenen Bauteilalter.
    function renovationsFor(mode, b) {
        const result = {};
        const buildingAge = YEAR - b;
        const normalAges = {
            kitchen: 18, bath: 20, interior: 15,
            windows: 25, heat: 15, water: 30,
            electric: 30, roof: 35, facade: 30
        };

        for (const p of PARTS) {
            const normalAge = Math.min(buildingAge, normalAges[p.id]);
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

            result[p.id] = YEAR - Math.round(age);
        }

        return result;
    }


    // ==================================================
    // DETAILREGLER FÜR RENOVATIONEN
    // ==================================================

    function renderRenos() {

        let b = +$('built').value;

        $('ageFields').innerHTML = PARTS.map(p => {

            let yr = clamp(
                S.renovations[p.id] ?? b,
                b,
                YEAR
            );

            return `
                <div class="reno">
                    <div class="rangehead">
                        <label for="reno_${p.id}">
                            ${p.label}
                        </label>

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

                let b = +$('built').value;

                $('renov_' + el.dataset.reno).textContent =
                    +el.value === b
                        ? 'Seit Baujahr (' + b + ')'
                        : el.value;

                calc();
            });

        });
    }


    // ==================================================
    // ZUSTAND DES HAUSES
    // ==================================================

    function setMode(mode) {
        S.mode = Number(mode);
        $('condition').value = S.mode;
        $('conditionv').textContent = CONDITION_LABELS[S.mode];
        S.renovations = renovationsFor(S.mode, +$('built').value);
        renderRenos();
        calc();
    }


    // ==================================================
    // LAGE- UND KOMFORTREGLER
    // ==================================================

    $('sliders').innerHTML = METRICS.map(s => `
        <div class="range">
            <div class="rangehead">
                <label for="${s.id}">
                    ${s.label}
                </label>

                <output id="${s.id}v"></output>
            </div>

            <input
                id="${s.id}"
                type="range"
                min="0"
                max="${s.values.length - 1}"
                value="${s.def}"
                step="1"
            >
        </div>
    `).join('');


    // ==================================================
    // ORTSSUCHE
    // ==================================================

    const placeInput = $('placeInput');
    placeInput.placeholder = 'Ort oder PLZ eingeben';
    placeInput.setAttribute('autocomplete', 'off');

    // Validierung: Die interne Standard-PLZ ist keine Benutzerauswahl.
    // Die Fehlermeldung erscheint erst nach einem Schätzversuch.
    const placeHint = $('placeHint');
    placeInput.setAttribute('aria-describedby', 'placeHint');

    function showPlaceError() {
        placeInput.classList.add('wr-place-invalid');
        placeInput.setAttribute('aria-invalid', 'true');
        placeHint.classList.add('wr-place-error');
        placeHint.setAttribute('role', 'alert');
        placeHint.textContent =
            'Bitte wählen Sie eine Ortschaft oder Postleitzahl aus der Vorschlagsliste.';

        // Kein Fokus: Auf Smartphones soll die Tastatur nicht ungefragt öffnen.
        const header = document.querySelector('.wrap > header');
        const headerHeight = header ? header.getBoundingClientRect().height : 0;
        const offset = headerHeight + 20;
        const target = window.scrollY +
            placeInput.getBoundingClientRect().top - offset;
        window.scrollTo({
            top: Math.max(0, target),
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'auto' : 'smooth'
        });
    }

    function clearPlaceError() {
        placeInput.classList.remove('wr-place-invalid');
        placeInput.removeAttribute('aria-invalid');
        placeHint.classList.remove('wr-place-error');
        placeHint.removeAttribute('role');
    }



    // Flächenregler behalten ihre echten Mindestwerte, sind aber zunächst
    // nicht bestätigt. Erst eine bewusste Bedienung übernimmt den Wert.
    function clearRangeError(id) {
        const slider = $(id);
        const hint = $(id + 'Hint');
        slider.classList.remove('wr-range-invalid');
        slider.removeAttribute('aria-invalid');
        hint.hidden = true;
        hint.textContent = '';
    }

    function showRangeError(id, message) {
        const slider = $(id);
        const hint = $(id + 'Hint');
        slider.classList.add('wr-range-invalid');
        slider.setAttribute('aria-invalid', 'true');
        hint.textContent = message;
        hint.hidden = false;
    }

    function confirmRange(id) {
        S[id + 'Confirmed'] = true;
        clearRangeError(id);
        $(id + 'v').classList.remove('wr-not-selected');
        $(id + 'v').textContent = fmt(Number($(id).value)) + ' m²';
        calc();
    }

    function updateAreaLabels() {
        for (const id of ['living', 'land']) {
            const output = $(id + 'v');
            if (!S[id + 'Confirmed']) {
                output.textContent = 'Bitte auswählen';
                output.classList.add('wr-not-selected');
            } else {
                output.textContent = fmt(Number($(id).value)) + ' m²';
                output.classList.remove('wr-not-selected');
            }
        }
    }

    function scrollToInvalid(element) {
        const header = document.querySelector('.wrap > header');
        const headerHeight = header ? header.getBoundingClientRect().height : 0;
        const target = window.scrollY + element.getBoundingClientRect().top - headerHeight - 25;
        window.scrollTo({
            top: Math.max(0, target),
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
    }

    // Gemeinsame Orts-/PLZ-Suche. Alle Schätzformeln bleiben unverändert.
    const { initOrtssuche } = await import(new URL('javascript_dateien/ortssuche.js?v=20261119-1', document.baseURI).href);
    const ortssuche = initOrtssuche({
        places,
        isSelected: () => S.placeSelected,
        hasError: () => placeInput.classList.contains('wr-place-invalid'),
        onSelect: plz => {
            if (!DATA[plz]) return;
            S.plz = plz;
            S.placeSelected = true;
            clearPlaceError();
            placeHint.textContent = '';
            calc();
        },
        onEdit: value => {
            S.placeSelected = false;
            S.estimateRequested = false;
            if (!placeInput.classList.contains('wr-place-invalid'))
                placeHint.textContent = value.trim() ? 'Ort oder PLZ auswählen' : '';
            calc();
        },
        onClear: () => {
            S.placeSelected = false;
            S.estimateRequested = false;
            calc();
            if (!placeInput.classList.contains('wr-place-invalid'))
                placeHint.textContent = 'Ortschaft oder PLZ eingeben';
        }
    });

    // ==================================================
    // VERKEHRSWERT BERECHNEN
    // ==================================================

    function calc() {

        const d = DATA[S.plz];

        if (!d) return;

        const w = +$('living').value;
        const g = +$('land').value;
        const b = +$('built').value;
        const m = d.median;

        // Eingabewerte anzeigen
        updateAreaLabels();
        $('builtv').textContent = b === 1910 ? '1910 oder älter' : b;

        $('garagev').textContent = S.garage;
        $('outsidev').textContent = S.outside;


        // ----------------------------------------------
        // ALTERSABZUG
        // ----------------------------------------------

        let ageDed = 0;

        for (const p of PARTS) {

            let cost = p.k *
                Math.pow(w / 180, p.a) *
                Math.pow(m / 10000, p.b);

            cost = clamp(
                cost,
                p.lo ?? 0,
                p.hi ?? Infinity
            );

            let renovated = clamp(
                Number(S.renovations[p.id] ?? b) || b,
                b,
                YEAR
            );

            ageDed += cost *
                clamp(
                    (YEAR - renovated) / p.l,
                    0,
                    1
                );
        }


        // ----------------------------------------------
        // GRUNDWERT
        // ----------------------------------------------

        const effectiveLand = Math.max(40, g);

        const ref = m * w *
            Math.pow(w / 180, -.426) *
            Math.pow(effectiveLand / 590, .145) *
            1.18;


        // ----------------------------------------------
        // RESTALTER
        // ----------------------------------------------

        const residualAge = -Math.min(
            3.5,
            Math.max(0, YEAR - b - 15) * .045
        );


        // ----------------------------------------------
        // HAUSTYP
        // ----------------------------------------------

        const typePct = {
            free: 2.5,
            end: -2,
            mid: -6
        }[
            document.querySelector(
                'input[name=houseType]:checked'
            ).value
        ];


        // ----------------------------------------------
        // MIKROLAGE UND QUALITÄT
        // ----------------------------------------------

        let micro = 0;
        let quality = 0;

        for (const s of METRICS) {

            const index = +$(s.id).value;

            $(s.id + 'v').textContent =
                s.names[index];

            if (s.id === 'quality') {

                quality = s.values[index];

            } else {

                micro += s.values[index];
            }
        }

        micro = clamp(micro, -20, 20);


        // ----------------------------------------------
        // ANGEPASSTER HAUSWERT
        // ----------------------------------------------

        const afterAge = Math.max(
            0,
            ref - ageDed
        );

        const adjusted = afterAge *
            (
                1 +
                (
                    typePct +
                    micro +
                    quality +
                    residualAge
                ) / 100
            );


        // ----------------------------------------------
        // GARAGEN UND AUSSENPARKPLÄTZE
        // ----------------------------------------------

        // Einzelpreis einer Garage
        const gp = clamp(
            33000 + .5 * (m - 10000),
            28000,
            38000
        );

        // Einzelpreis eines Aussenparkplatzes
        const ap = clamp(
            12000 + .6 * (m - 10000),
            8000,
            18000
        );

        // KORRIGIERT:
        // Anzahl × Einzelpreis
        //
        // 0 Garagen = CHF 0
        // 1 Garage  = 1 × gp
        // 2 Garagen = 2 × gp
        //
        // Gleiches Prinzip für Aussenparkplätze.

        const garageAdjustment = S.garage * gp;

        const outsideAdjustment = S.outside * ap;

        const park =
            garageAdjustment + outsideAdjustment;


        // ----------------------------------------------
        // TOTAL VERKEHRSWERT
        // ----------------------------------------------

        const result = Math.max(
            0,
            adjusted + park
        );


        // ----------------------------------------------
        // ERGEBNIS ANZEIGEN
        // ----------------------------------------------

        // NEU:
        // Vor dem ersten Klick auf "Schätzen"
        // wird immer CHF 0 angezeigt.
        //
        // Auch eine Ortsauswahl allein reicht nicht.
        //
        // Nach dem ersten Klick werden Änderungen
        // an den Reglern sofort berücksichtigt.

        if (
            S.placeSelected &&
            S.estimateRequested
        ) {

            $('estimate').textContent =
                'CHF ' + fmt(result);

        } else {

            $('estimate').textContent = 'CHF 0';
        }


        // Altersabzug
        $('ageout').textContent =
            '− CHF ' + fmt(ageDed);


        // ----------------------------------------------
        // ANZAHL GARAGEN ANZEIGEN
        // ----------------------------------------------

        $('garageLabel').textContent =
            S.garage + ' ' +
            (
                S.garage === 1
                    ? 'Garagenplatz'
                    : 'Garagenplätze'
            );


        // ----------------------------------------------
        // ANZAHL AUSSENPARKPLÄTZE ANZEIGEN
        // ----------------------------------------------

        $('outsideLabel').textContent =
            S.outside + ' ' +
            (
                S.outside === 1
                    ? 'Aussenparkplatz'
                    : 'Aussenparkplätze'
            );


        // ----------------------------------------------
        // GARAGENWERT ANZEIGEN
        // ----------------------------------------------

        $('garageout').textContent =
            (garageAdjustment >= 0 ? '+ ' : '− ') +
            'CHF ' +
            fmt(Math.abs(garageAdjustment));


        // ----------------------------------------------
        // AUSSENPARKPLATZWERT ANZEIGEN
        // ----------------------------------------------

        $('outsideout').textContent =
            (outsideAdjustment >= 0 ? '+ ' : '− ') +
            'CHF ' +
            fmt(Math.abs(outsideAdjustment));
    }


    // ==================================================
    // EREIGNISSE: ORTSSUCHE – siehe ortssuche.js

    // ==================================================
        // EREIGNISSE: REGLER
    // ==================================================

    // Auch ein Tippen auf den Startwert bestätigt diesen ausdrücklich.
    // input deckt Ziehen sowie Tastaturbedienung ab; pointerup zusätzlich
    // das Anklicken des Reglers ohne Wertänderung.
    ['living', 'land'].forEach(id => {
        $(id).addEventListener('input', () => confirmRange(id));
        $(id).addEventListener('pointerup', () => confirmRange(id));
    });

    METRICS.forEach(s => {
        $(s.id).addEventListener('input', calc);
    });


    document.querySelectorAll(
        'input[name=houseType]'
    ).forEach(el => {

        el.addEventListener('change', calc);

    });


    $('built').addEventListener('input', () => {

        S.renovations = renovationsFor(
            S.mode,
            +$('built').value
        );

        renderRenos();

        calc();
    });


    $('condition').addEventListener('input', () => {
        setMode($('condition').value);
    });


    // ==================================================
    // EREIGNISSE: GARAGEN UND PARKPLÄTZE
    // ==================================================

    document.querySelectorAll(
        '[data-count]'
    ).forEach(btn => {

        btn.addEventListener('click', () => {

            const [k, v] =
                btn.dataset.count.split(':');

            // Anzahl zwischen 0 und 8 begrenzen.
            // Funktioniert in beide Richtungen.
            S[k] = clamp(
                S[k] + Number(v),
                0,
                8
            );

            calc();
        });
    });


    // ==================================================
    // RESULTATBOX: DESKTOP UND SMARTPHONE
    // ==================================================

    const resultShell = $('resultShell');

    const resultAnchor =
        document.createComment(
            'Desktop-Position der Resultate'
        );

    resultShell.parentNode.insertBefore(
        resultAnchor,
        resultShell
    );

    const mobileMode =
        window.matchMedia('(max-width: 840px)');


    function arrangeResult() {

        if (mobileMode.matches) {

            document.querySelector('header')
                .insertAdjacentElement(
                    'afterend',
                    resultShell
                );

        } else {

            resultAnchor.parentNode.insertBefore(
                resultShell,
                resultAnchor.nextSibling
            );
        }
    }


    arrangeResult();

    window.addEventListener(
        'resize',
        arrangeResult
    );


    // ==================================================
    // SCHÄTZEN-BUTTON
    // ==================================================

    document.addEventListener('wr:adjust-start', () => {
        S.estimateRequested = false;
        calc();
    });

    function showEstimate() {

        // Die Ortsauswahl sowie beide Flächen müssen bewusst erfolgen.
        // Alle fehlenden Angaben werden markiert; zum ersten Fehler scrollen.
        if (!S.placeSelected) showPlaceError();
        else clearPlaceError();

        if (!S.livingConfirmed) {
            showRangeError('living', 'Bitte wählen Sie die Wohnfläche.');
        } else clearRangeError('living');

        if (!S.landConfirmed) {
            showRangeError('land', 'Bitte wählen Sie die Parzellenfläche.');
        } else clearRangeError('land');

        if (!S.placeSelected || !S.livingConfirmed || !S.landConfirmed) {
            if (S.placeSelected) {
                scrollToInvalid($(S.livingConfirmed ? 'land' : 'living'));
            }
            return;
        }

        // NEU:
        // Erst jetzt darf der Verkehrswert erscheinen.
        S.estimateRequested = true;
        document.dispatchEvent(new CustomEvent('wr:estimate-success'));

        calc();

        resultShell.classList.add(
            'has-estimate'
        );

        if (mobileMode.matches) {

            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
    }


    $('estimateButtonDesktop').addEventListener(
        'click',
        showEstimate
    );

    $('estimateButtonMobile').addEventListener(
        'click',
        showEstimate
    );


    // ==================================================
    // EINGABEN ANPASSEN
    // ==================================================



    // ==================================================
    // ZURÜCKSETZEN
    // ==================================================

    $('reset').addEventListener('click', () => {

        // Schieberegler zurücksetzen.
        $('living').value = $('living').min;
        $('land').value = $('land').min;
        $('built').value = $('built').min;

        // Haustyp zurücksetzen.
        document.querySelector(
            'input[name=houseType][value=free]'
        ).checked = true;

        // Lage- und Komfortregler zurücksetzen.
        METRICS.forEach(s => {
    $(s.id).value = s.def;
});

        // Garagen und Parkplätze zurücksetzen.
        S.garage = 0;
        S.outside = 0;

        // NEU:
        // Keine Gemeinde ausgewählt.
        // Noch keine Schätzung angefordert.
        S.placeSelected = false;
        S.estimateRequested = false;
        S.livingConfirmed = false;
        S.landConfirmed = false;
        clearRangeError('living');
        clearRangeError('land');

        // Gebäudezustand zurücksetzen.
        setMode(2);

        // Renovationsregler zurücksetzen.
        document.querySelectorAll(
            '[data-reno]'
        ).forEach(el => {

            el.value = el.min;

            S.renovations[el.dataset.reno] =
                Number(el.min);
        });

        // Interne Standard-PLZ beibehalten,
        // aber nicht als ausgewählt markieren.
        S.plz = DATA['5400']
            ? '5400'
            : Object.keys(DATA)[0];

        // Ortseingabe leeren.
        clearPlaceError();
        placeInput.value = '';

        $('placeHint').textContent = '';

        // Alle Anzeigen aktualisieren.
        // Verkehrswert bleibt CHF 0.
        calc();

        resultShell.classList.remove(
            'has-estimate'
        );

        if (mobileMode.matches) {

            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }
    });


    // ==================================================
    // INITIALISIERUNG
    // ==================================================

    // Sämtliche Schieber am linken Anschlag.
    setMode(2);


    // Zu Beginn wurde noch keine Gemeinde gewählt
    // und noch keine Schätzung angefordert.
    S.placeSelected = false;
    S.estimateRequested = false;
    S.livingConfirmed = false;
    S.landConfirmed = false;

    calc();

    // Ortseingabe leer anzeigen.
    placeInput.value = '';

    $('placeHint').textContent = '';

    // Verkehrswert explizit auf null setzen.
    $('estimate').textContent = 'CHF 0';

}


// ==================================================
// ANWENDUNG STARTEN
// ==================================================

starteHauswert().catch(fehler => {

    console.error(
        'Hauswert: Fehler beim Laden der Preisdaten',
        fehler
    );

    const ausgabe =
        document.getElementById('estimate');

    if (ausgabe) {

        ausgabe.textContent =
            'Daten nicht verfügbar';
    }

    const hinweis =
        document.getElementById('placeHint');

    if (hinweis) {

        hinweis.textContent =
            'Immobilienpreise konnten nicht geladen werden. ' +
            'Bitte die Seite über einen Webserver öffnen.';
    }
});