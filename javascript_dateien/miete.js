"use strict";

/*
 * WOHNRADAR – MIETRECHNER
 *
 * Mietmodell und Nebenkosten:
 *   daten/mietmodell_plz_mit_nebenkosten.json
 *
 * Ortsnamen:
 *   daten/immobilienpreise.json
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

    const premium = exteriorPremium(
      selected.apartmentType,
      selected.apartmentType === "standard"
        ? balconyArea
        : outdoorArea
    );

    const netto =
      base * factor * (1 + premium);

    const nebenkosten =
      berechneNebenkosten(area, selection);

    const garageBetrag =
      parking.garage * parkingAddition.garage;

    const aussenBetrag =
      parking.outside * parkingAddition.outside;

    const brutto =
      netto +
      nebenkosten +
      garageBetrag +
      aussenBetrag;

    text("netRent", money(netto));

    text(
      "utilities",
      money(nebenkosten)
    );

    text(
      "garageLabel",
      `Garagenplätze (${parking.garage})`
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
     7. EINHEITLICHE ORTSSUCHE
     ===================================================== */

  const placeInput = $("placeInput");
  const suggestionList = $("suggestions");

  const mobilePlaceMode =
    window.matchMedia("(max-width: 840px)");

  let selectingPlace = false;
  let keyboardTimer = null;

  placeInput.value = "";
  placeInput.placeholder = "Ort oder PLZ eingeben";
  placeInput.setAttribute("autocomplete", "off");

  function closeSuggestions() {

    clearTimeout(keyboardTimer);

    suggestionList.classList.add("hide");
    suggestionList.style.display = "none";

    placeInput.setAttribute(
      "aria-expanded",
      "false"
    );

    placeInput.removeAttribute(
      "aria-activedescendant"
    );

    activeSuggestion = -1;
  }

  function showSuggestions() {

    suggestionList.classList.remove("hide");

    suggestionList.style.display = "block";
    suggestionList.style.visibility = "visible";
    suggestionList.style.opacity = "1";

    placeInput.setAttribute(
      "aria-expanded",
      "true"
    );
  }

  function choose(plz) {

    if (!MODEL[plz]) return;

    selectingPlace = false;
    selection = plz;

    placeInput.value =
      plz + " " + ortsname(plz);

    placeHint.textContent = "";

    closeSuggestions();
    placeInput.blur();

    refresh();
  }

  function suggestions() {

    const q = normalize(placeInput.value);

    if (!placeFocused || q.length < 3) {
      closeSuggestions();
      return;
    }

    const matches = places
      .filter(p =>
        p.plz.startsWith(q) ||
        normalize(p.ort).startsWith(q) ||
        p.norm.includes(" " + q)
      )
      .sort((a, b) => {

        const aa =
          a.plz.startsWith(q) ||
          normalize(a.ort).startsWith(q);

        const bb =
          b.plz.startsWith(q) ||
          normalize(b.ort).startsWith(q);

        return (
          Number(bb) - Number(aa) ||
          a.ort.localeCompare(b.ort, "de")
        );
      })
      .slice(0, 12);

    suggestionList.replaceChildren();
    activeSuggestion = -1;

    if (!matches.length) {
      closeSuggestions();
      return;
    }

    matches.forEach((p, i) => {

      const button =
        document.createElement("button");

      button.type = "button";
      button.id = "suggest_" + i;
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
        document.createTextNode(p.ort + " ")
      );

      const small =
        document.createElement("small");

      small.textContent = "PLZ " + p.plz;

      button.append(small);

      button.addEventListener(
        "pointerdown",
        e => e.preventDefault()
      );

      button.addEventListener(
        "click",
        () => choose(p.plz)
      );

      suggestionList.append(button);
    });

    showSuggestions();

    /* -------------------------------------
       SMARTPHONE: 700 MS TIPP-PAUSE
       ------------------------------------- */

    if (mobilePlaceMode.matches) {

      clearTimeout(keyboardTimer);

      keyboardTimer = setTimeout(() => {

        if (
          document.activeElement === placeInput &&
          !suggestionList.classList.contains("hide") &&
          suggestionList.querySelector("button")
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

  function highlightSuggestion(index) {

    const buttons = [
      ...suggestionList.querySelectorAll("button")
    ];

    if (!buttons.length) return;

    activeSuggestion =
      (index + buttons.length) % buttons.length;

    buttons.forEach((b, i) => {

      b.setAttribute(
        "aria-selected",
        String(i === activeSuggestion)
      );
    });

    placeInput.setAttribute(
      "aria-activedescendant",
      buttons[activeSuggestion].id
    );

    buttons[activeSuggestion].scrollIntoView({
      block: "nearest"
    });
  }

  /* =====================================================
     8. EREIGNISSE DER ORTSSUCHE
     ===================================================== */

  placeInput.addEventListener("focus", () => {

    selectingPlace = false;
    placeFocused = true;

    closeSuggestions();

    // Neue Suche: Feld sofort leeren.
    placeInput.value = "";
    placeInput.placeholder = "";

    placeHint.textContent = "";
  });

  placeInput.addEventListener("input", () => {

    placeHint.textContent =
      placeInput.value.trim()
        ? "Ort oder PLZ auswählen"
        : "";

    suggestions();
  });

  $("clearPlace").addEventListener(
    "click",
    () => {

      selectingPlace = false;

      closeSuggestions();

      placeInput.value = "";
      placeHint.textContent = "";

      placeInput.focus();
    }
  );

  placeInput.addEventListener(
    "keydown",
    e => {

      const buttons = [
        ...suggestionList.querySelectorAll("button")
      ];

      if (
        e.key === "ArrowDown" &&
        buttons.length
      ) {

        e.preventDefault();

        highlightSuggestion(
          activeSuggestion + 1
        );

      } else if (
        e.key === "ArrowUp" &&
        buttons.length
      ) {

        e.preventDefault();

        highlightSuggestion(
          activeSuggestion < 0
            ? buttons.length - 1
            : activeSuggestion - 1
        );

      } else if (
        e.key === "Enter" &&
        buttons.length
      ) {

        e.preventDefault();

        choose(
          buttons[
            Math.max(0, activeSuggestion)
          ].dataset.plz
        );

      } else if (e.key === "Escape") {

        selectingPlace = false;

        closeSuggestions();
        placeInput.blur();
      }
    }
  );

  placeInput.addEventListener(
    "blur",
    () => {

      placeInput.placeholder =
        "Ort oder PLZ eingeben";

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
            selection + " " + ortsname(selection)
        ) {

          placeHint.textContent =
            "Bitte einen Ort aus den Vorschlägen wählen";
        }

      }, 160);
    }
  );

  document.addEventListener(
    "pointerdown",
    e => {

      if (
        !placeInput.contains(e.target) &&
        !suggestionList.contains(e.target) &&
        !$("clearPlace").contains(e.target)
      ) {

        selectingPlace = false;
        closeSuggestions();
      }
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

        if (id === "apartmentType") {
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
              parking[key] + Number(delta)
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

      // Nach Reset nur Platzhalter anzeigen.
      placeInput.value = "";
      placeHint.textContent = "";
    }
  );

  /* =====================================================
     14. STARTANZEIGE
     ===================================================== */

  updateExterior();

  choose(defaultZip);

  // Intern ist die Standard-PLZ für die Berechnung
  // vorhanden. Das Eingabefeld bleibt leer.
  placeInput.value = "";
  placeHint.textContent = "";
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
    document.getElementById("estimate");

  if (estimate) {
    estimate.textContent =
      "Daten nicht verfügbar";
  }

  const status =
    document.getElementById("status");

  if (status) {
    status.classList.add("error");
    status.textContent =
      "Mietpreisdaten konnten nicht geladen werden.";
  }
});