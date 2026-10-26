"use strict";

/*
 * WOHNRADAR – MIETRECHNER
 *
 * Mietmodell und Nebenkosten:
 *   daten/mietmodell_plz_mit_nebenkosten.json
 *
 * Ortsnamen:
 *   daten/immobilienpreise.json
 *
 * Erwartete Struktur der kombinierten JSON:
 *
 * {
 *   "mietmodell": {
 *     "5400": {
 *       "q20": [...],
 *       "q50": [...],
 *       "q80": [...]
 *     }
 *   },
 *   "nebenkosten": {
 *     "beta": [a, b, c],
 *     "plz_korrektur": {
 *       "5400": ...
 *     }
 *   }
 * }
 */

async function starteMietrechner() {

  const $ = id => document.getElementById(id);

  const money = n =>
    Math.round(n).toLocaleString("de-CH") + " CHF";

  function text(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
  }

  async function ladeJSON(path) {
    const response = await fetch(path);

    if (!response.ok) {
      throw new Error(
        path + ": HTTP " + response.status
      );
    }

    return response.json();
  }

  /* =====================================================
     1. DATEN LADEN
     ===================================================== */

  const [COMBINED, DATA] = await Promise.all([
    ladeJSON("daten/mietmodell_plz_mit_nebenkosten.json"),
    ladeJSON("daten/immobilienpreise.json")
  ]);

  const MODEL = COMBINED.mietmodell;
  const NK_MODEL = COMBINED.nebenkosten;

  if (!MODEL || !NK_MODEL) {
    throw new Error(
      "Die kombinierte JSON enthält nicht alle Modelldaten."
    );
  }

  if (
    !Array.isArray(NK_MODEL.beta) ||
    NK_MODEL.beta.length !== 3
  ) {
    throw new Error(
      "Die Nebenkostenparameter fehlen oder sind ungültig."
    );
  }

  const NK_KORREKTUREN =
    NK_MODEL.plz_korrektur || {};

  /* =====================================================
     2. ORTSSUCHE
     ===================================================== */

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  const places = Object.keys(MODEL).map(plz => {
    const ort = DATA[plz]?.ort || "";

    return {
      plz,
      ort,
      norm: normalize(plz + " " + ort)
    };
  });

  if (!places.length) {
    throw new Error(
      "Das Mietmodell enthält keine Postleitzahlen."
    );
  }

  const defaultZip = MODEL["5400"]
    ? "5400"
    : places[0].plz;

  let selection = defaultZip;

  let parking = {
    garage: 0,
    outside: 0
  };

  let placeFocused = false;
  let activeSuggestion = -1;

  const selected = {
    location: "normal",
    condition: "normal",
    apartmentType: "standard"
  };

  function ortsname(plz) {
    return DATA[plz]?.ort || "";
  }

  /* =====================================================
     3. MIETPREISMODELL
     ===================================================== */

  function estimate(beta, area) {
    const x = Math.log(area);

    return (
      beta[0] +
      beta[1] * x +
      beta[2] * x * x
    );
  }

  const locationFactor = {
    poor: 0.94,
    normal: 1,
    good: 1.06
  };

  const conditionFactor = {
    old: 0.92,
    normal: 1,
    new: 1.08
  };

  const parkingAddition = {
    garage: 130,
    outside: 65
  };

  function exteriorPremium(type, area) {

    if (area <= 0) {
      return type === "attic" ? 0.04 : 0;
    }

    if (type === "standard") {
      return (
        0.01 +
        0.01 * (1 - Math.exp(-area / 6))
      );
    }

    if (type === "attic") {
      return (
        0.04 +
        0.11 * (1 - Math.exp(-area / 14))
      );
    }

    return (
      0.01 +
      0.055 * (1 - Math.exp(-area / 14))
    );
  }

  /* =====================================================
     4. NEBENKOSTENMODELL
     ===================================================== */

  function berechneNebenkosten(area, plz) {

    const [a, b, c] = NK_MODEL.beta;

    const korrektur = Number(
      NK_KORREKTUREN[plz] ?? 0
    );

    const nebenkosten =
      a +
      b * area +
      c * area * area +
      korrektur;

    return Math.max(0, nebenkosten);
  }

  /* =====================================================
     5. ERGEBNIS BERECHNEN
     ===================================================== */

  function refresh() {

    const area = Number($("living").value);

    const balconyArea =
      Number($("balconyArea").value);

    const outdoorArea =
      Number($("outdoorArea").value);

    text("livingv", area + " m²");

    text(
      "balconyAreav",
      balconyArea + " m²"
    );

    text(
      "outdoorAreav",
      outdoorArea + " m²"
    );

    const p = MODEL[selection];

    if (!p) return;

    /*
     * Die Modellkoeffizienten liefern
     * Nettomieten in CHF/m²/Jahr.
     *
     * Umrechnung:
     * CHF/m²/Jahr × Wohnfläche / 12
     */

    const net = q =>
      estimate(p[q], area) * area / 12;

    const base = net("q50");

    const factor =
      locationFactor[selected.location] *
      conditionFactor[selected.condition];

    const quality =
      base * (factor - 1);

    const type = selected.apartmentType;

    const exteriorFactor = exteriorPremium(
      type,
      type === "standard"
        ? balconyArea
        : outdoorArea
    );

    const exterior =
      base * exteriorFactor;

    /*
     * Nettomiete der Wohnung:
     * ohne Nebenkosten und ohne Parkplätze
     */

    const wohnungsNetto = Math.max(
      0,
      base * (factor + exteriorFactor)
    );

    /*
     * Geschätzte monatliche Nebenkosten
     * gemäss Jupyter-Modell.
     */

    const nebenkosten =
      berechneNebenkosten(
        area,
        selection
      );

    /*
     * Parkplätze separat ausweisen.
     */

    const garageBetrag =
      parking.garage *
      parkingAddition.garage;

    const aussenBetrag =
      parking.outside *
      parkingAddition.outside;

    /*
     * Bruttomiete inklusive Parkierung.
     */

    const brutto =
      wohnungsNetto +
      nebenkosten +
      garageBetrag +
      aussenBetrag;

    /* -------------------------------------
       RESULTATEBOX
       ------------------------------------- */

    text(
      "netout",
      money(wohnungsNetto)
    );

    text(
      "utilitiesout",
      "+" + money(nebenkosten)
    );

    text(
      "garageLabel",
      `Einstellhallenplätze (${parking.garage})`
    );

    text(
      "garageout",
      "+" + money(garageBetrag)
    );

    text(
      "outsideLabel",
      `Aussenparkplätze (${parking.outside})`
    );

    text(
      "outsideout",
      "+" + money(aussenBetrag)
    );

    text(
      "estimate",
      money(brutto)
    );

    /* -------------------------------------
       STATUSANZEIGE
       ------------------------------------- */

    $("status").classList.remove("error");

    text(
      "status",
      `PLZ ${selection}` +
      (
        ortsname(selection)
          ? " · " + ortsname(selection)
          : ""
      ) +
      ` · ${area} m²` +
      ` · Nebenkosten mit PLZ-Korrektur`
    );
  }

  /* =====================================================
     6. HINWEIS UNTER DER ORTSEINGABE
     ===================================================== */

  let placeHint = $("placeHint");

  if (!placeHint) {

    placeHint =
      document.createElement("div");

    placeHint.id = "placeHint";
    placeHint.className = "hint";

    $("suggestions").insertAdjacentElement(
      "afterend",
      placeHint
    );
  }

  /* =====================================================
     7. ORTSVORSCHLÄGE
     ===================================================== */

  function closeSuggestions() {

    $("suggestions").classList.add("hide");

    $("placeInput").setAttribute(
      "aria-expanded",
      "false"
    );

    $("placeInput").removeAttribute(
      "aria-activedescendant"
    );

    activeSuggestion = -1;
  }

  function suggestions() {

    const raw = normalize(
      $("placeInput").value
    );

    const list = $("suggestions");

    if (!placeFocused || !raw) {
      closeSuggestions();
      return;
    }

    const matches = places
      .filter(p =>
        p.plz.startsWith(raw) ||
        normalize(p.ort).startsWith(raw) ||
        p.norm.includes(" " + raw) ||
        p.norm === raw
      )
      .sort((a, b) => {

        const aStarts =
          normalize(a.ort).startsWith(raw) ||
          a.plz.startsWith(raw);

        const bStarts =
          normalize(b.ort).startsWith(raw) ||
          b.plz.startsWith(raw);

        return (
          Number(bStarts) -
          Number(aStarts) ||
          a.ort.localeCompare(b.ort, "de") ||
          a.plz.localeCompare(b.plz)
        );
      })
      .slice(0, 12);

    list.replaceChildren();

    activeSuggestion = -1;

    $("placeInput").removeAttribute(
      "aria-activedescendant"
    );

    matches.forEach((p, index) => {

      const button =
        document.createElement("button");

      button.type = "button";

      button.id =
        "suggest_" + index;

      button.dataset.plz = p.plz;

      button.setAttribute(
        "role",
        "option"
      );

      button.setAttribute(
        "aria-selected",
        "false"
      );

      button.append(
        document.createTextNode(
          p.ort || "PLZ " + p.plz
        )
      );

      if (p.ort) {

        const small =
          document.createElement("small");

        small.textContent =
          "PLZ " + p.plz;

        button.append(small);
      }

      button.addEventListener(
        "pointerdown",
        event => {
          event.preventDefault();
        }
      );

      button.addEventListener(
        "click",
        () => {
          choose(p.plz);
        }
      );

      list.append(button);
    });

    list.classList.toggle(
      "hide",
      matches.length === 0
    );

    $("placeInput").setAttribute(
      "aria-expanded",
      String(matches.length > 0)
    );
  }

  function choose(plz) {

    if (!MODEL[plz]) return;

    selection = plz;

    $("placeInput").value =
      plz +
      (
        ortsname(plz)
          ? " " + ortsname(plz)
          : ""
      );

    closeSuggestions();

    placeHint.textContent = "";

    refresh();
  }

  function highlightSuggestion(index) {

    const buttons = [
      ...$("suggestions")
        .querySelectorAll("button")
    ];

    if (!buttons.length) return;

    activeSuggestion =
      (index + buttons.length) %
      buttons.length;

    buttons.forEach((button, i) => {

      button.setAttribute(
        "aria-selected",
        String(i === activeSuggestion)
      );
    });

    const active =
      buttons[activeSuggestion];

    $("placeInput").setAttribute(
      "aria-activedescendant",
      active.id
    );

    active.scrollIntoView({
      block: "nearest"
    });
  }

  /* =====================================================
     8. ORTSEINGABE – EVENTS
     ===================================================== */

  $("placeInput").addEventListener(
    "focus",
    () => {

      placeFocused = true;

      $("placeInput").select();

      suggestions();
    }
  );

  $("placeInput").addEventListener(
    "input",
    () => {

      suggestions();

      placeHint.textContent =
        $("placeInput").value.trim()
          ? "Ort oder PLZ auswählen"
          : "";
    }
  );

  $("clearPlace").addEventListener(
    "click",
    () => {

      $("placeInput").value = "";

      $("placeInput").focus();

      closeSuggestions();

      placeHint.textContent =
        "Ortschaft oder PLZ eingeben";
    }
  );

  $("placeInput").addEventListener(
    "keydown",
    event => {

      if (
        (
          event.key === "ArrowDown" ||
          event.key === "ArrowUp"
        ) &&
        $("suggestions")
          .classList.contains("hide")
      ) {
        suggestions();
      }

      const buttons = [
        ...$("suggestions")
          .querySelectorAll("button")
      ];

      const visible =
        !$("suggestions")
          .classList.contains("hide");

      if (
        event.key === "ArrowDown" &&
        visible &&
        buttons.length
      ) {

        event.preventDefault();

        highlightSuggestion(
          activeSuggestion + 1
        );

      } else if (
        event.key === "ArrowUp" &&
        visible &&
        buttons.length
      ) {

        event.preventDefault();

        highlightSuggestion(
          activeSuggestion < 0
            ? buttons.length - 1
            : activeSuggestion - 1
        );

      } else if (
        event.key === "Enter" &&
        visible &&
        buttons.length
      ) {

        event.preventDefault();

        choose(
          buttons[
            Math.max(
              0,
              activeSuggestion
            )
          ].dataset.plz
        );

        $("placeInput").blur();

      } else if (
        event.key === "Escape"
      ) {

        closeSuggestions();

        $("placeInput").blur();
      }
    }
  );

  $("placeInput").addEventListener(
    "blur",
    () => {

      placeFocused = false;

      setTimeout(() => {

        if (placeFocused) return;

        closeSuggestions();

        const expected =
          selection +
          (
            ortsname(selection)
              ? " " + ortsname(selection)
              : ""
          );

        if (
          $("placeInput").value.trim() &&
          $("placeInput").value.trim() !==
            expected
        ) {

          placeHint.textContent =
            "Bitte einen Ort aus den Vorschlägen wählen";
        }

      }, 160);
    }
  );

  /* =====================================================
     9. AUSSENFLÄCHEN
     ===================================================== */

  function updateExterior() {

    const type =
      selected.apartmentType;

    $("balconyField").classList.toggle(
      "hide",
      type !== "standard"
    );

    $("outdoorField").classList.toggle(
      "hide",
      type === "standard"
    );

    $("outdoorField")
      .querySelector("label")
      .textContent =
        type === "garden"
          ? "Gartenfläche"
          : "Terrassenfläche";

    $("outdoorNote").textContent =
      type === "standard"
        ? "Balkon: Zuschlag nach Fläche und lokalem Mietniveau."
        : type === "attic"
          ? "Attika: Typen- und Terrassenzuschlag gemeinsam, maximal rund 15 %."
          : "Garten: Die ersten Quadratmeter zählen besonders stark; danach flacht der Zuschlag ab.";
  }

  /* =====================================================
     10. REGLER
     ===================================================== */

  for (const id of [
    "living",
    "balconyArea",
    "outdoorArea"
  ]) {

    $(id).addEventListener(
      "input",
      refresh
    );
  }

  /* =====================================================
     11. AUSWAHLKNÖPFE
     ===================================================== */

  for (const id of [
    "location",
    "condition",
    "apartmentType"
  ]) {

    $(id).addEventListener(
      "click",
      event => {

        const button =
          event.target.closest(
            "button[data-value]"
          );

        if (!button) return;

        selected[id] =
          button.dataset.value;

        $(id)
          .querySelectorAll("button")
          .forEach(item => {

            item.classList.toggle(
              "active",
              item === button
            );
          });

        if (
          id === "apartmentType"
        ) {
          updateExterior();
        }

        refresh();
      }
    );
  }

  /* =====================================================
     12. PARKPLÄTZE
     ===================================================== */

  document
    .querySelectorAll("[data-count]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const [key, delta] =
            button.dataset.count.split(":");

          parking[key] = Math.max(
            0,
            Math.min(
              5,
              parking[key] +
              Number(delta)
            )
          );

          text(
            key + "v",
            parking[key]
          );

          refresh();
        }
      );
    });

  /* =====================================================
     13. ZURÜCKSETZEN
     ===================================================== */

  $("reset").addEventListener(
    "click",
    () => {

      for (const id of [
        "location",
        "condition",
        "apartmentType"
      ]) {

        selected[id] =
          id === "apartmentType"
            ? "standard"
            : "normal";

        $(id)
          .querySelectorAll("button")
          .forEach(button => {

            button.classList.toggle(
              "active",
              button.dataset.value ===
                selected[id]
            );
          });
      }

      parking = {
        garage: 0,
        outside: 0
      };

      text("garagev", "0");
      text("outsidev", "0");

      $("living").value = 80;
      $("balconyArea").value = 0;
      $("outdoorArea").value = 0;

      updateExterior();

      choose(defaultZip);
    }
  );

  /* =====================================================
     14. STARTANZEIGE
     ===================================================== */

  updateExterior();

  choose(defaultZip);
}

/* =======================================================
   FEHLERBEHANDLUNG
   ======================================================= */

starteMietrechner().catch(error => {

  console.error(
    "Mietrechner:",
    error
  );

  const estimate =
    document.getElementById(
      "estimate"
    );

  const status =
    document.getElementById(
      "status"
    );

  if (estimate) {

    estimate.textContent =
      "Daten nicht verfügbar";
  }

  if (status) {

    status.classList.add(
      "error"
    );

    status.textContent =
      "Der Mietrechner konnte nicht geladen werden: " +
      error.message;
  }
});