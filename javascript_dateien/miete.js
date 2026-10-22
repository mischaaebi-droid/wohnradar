"use strict";

/* WOHNRADAR – Mietrechner */

const MODEL_FILE = "daten/mietmodell_plz_parameter.json";
const PLACE_FILE = "daten/mietorte.json";

let MODEL = null;
let PLACES = {};
let selection = "5400";
let parking = { garage: 0, outside: 0 };
let activeSuggestion = -1;

const selected = {
  location: "normal",
  condition: "normal",
  apartmentType: "standard"
};

const $ = id => document.getElementById(id);

const money = n =>
  Math.round(n).toLocaleString("de-CH") + " CHF";

const text = (id, value) => {
  $(id).textContent = value;
};

/* Mietmodell und Zuschläge */

function estimate(beta, area) {
  const x = Math.log(area);
  return beta[0] + beta[1] * x + beta[2] * x * x;
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
    return 0.01 + 0.01 * (1 - Math.exp(-area / 6));
  }

  if (type === "attic") {
    return 0.04 + 0.11 * (1 - Math.exp(-area / 14));
  }

  return 0.01 + 0.055 * (1 - Math.exp(-area / 14));
}

/* Ergebnis berechnen */

function refresh() {
  const area = Number($("living").value);
  const balconyArea = Number($("balconyArea").value);
  const outdoorArea = Number($("outdoorArea").value);

  text("livingv", area + " m²");
  text("balconyAreav", balconyArea + " m²");
  text("outdoorAreav", outdoorArea + " m²");

  if (!MODEL) return;

  if (!selection || !MODEL[selection]) {
    text("status", "Bitte einen Ort oder eine PLZ aus den Vorschlägen wählen.");
    text("estimate", "—");

    for (const id of [
      "baseout",
      "qualityout",
      "typeout",
      "parkingout",
      "low",
      "high"
    ]) {
      text(id, "—");
    }

    return;
  }

  const parameters = MODEL[selection];

  const net = quantile =>
    estimate(parameters[quantile], area) * area / 12;

  const base = net("q50");

  const factor =
    locationFactor[selected.location] *
    conditionFactor[selected.condition];

  const quality = base * (factor - 1);
  const type = selected.apartmentType;

  const exteriorFactor = exteriorPremium(
    type,
    type === "standard" ? balconyArea : outdoorArea
  );

  const exterior = base * exteriorFactor;

  const park =
    parking.garage * parkingAddition.garage +
    parking.outside * parkingAddition.outside;

  const adjusted = value =>
    value * (factor + exteriorFactor) + park;

  const result = adjusted(base);
  const low = adjusted(net("q20"));
  const high = adjusted(net("q80"));

  text("estimate", money(Math.max(0, result)));
  text("baseout", money(base));

  text(
    "qualityout",
    (quality >= 0 ? "+" : "−") + money(Math.abs(quality))
  );

  text("typeout", "+" + money(exterior));
  text("parkingout", "+" + money(park));

  // Quantilkurven können sich kreuzen: Werte für die Anzeige sortieren.
  text("low", money(Math.min(low, high, result)));
  text("high", money(Math.max(low, high, result)));

  $("status").classList.remove("error");

  text(
    "status",
    `PLZ ${selection}` +
    (PLACES[selection] ? " · " + PLACES[selection] : "") +
    ` · ${area} m² · ohne Nebenkosten`
  );
}

/* Ortssuche */

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-CH")
    .trim();
}

function closeSuggestions() {
  $("suggestions").classList.add("hide");
  $("placeInput").setAttribute("aria-expanded", "false");
  $("placeInput").removeAttribute("aria-activedescendant");
  activeSuggestion = -1;
}

function suggestionItems(value) {
  const query = normalize(value);

  if (!query || !MODEL) return [];

  const words = query.split(/\s+/);

  return Object.keys(MODEL)
    .filter(zip => {
      const combined = normalize(zip + " " + (PLACES[zip] || ""));
      return words.every(word => combined.includes(word));
    })
    .sort((a, b) => {
      const nameA = normalize(PLACES[a] || "");
      const nameB = normalize(PLACES[b] || "");

      const priorityA =
        a.startsWith(query) || nameA.startsWith(query);

      const priorityB =
        b.startsWith(query) || nameB.startsWith(query);

      return (
        Number(priorityB) - Number(priorityA) ||
        nameA.localeCompare(nameB, "de") ||
        a.localeCompare(b)
      );
    })
    .slice(0, 12);
}

function selectPlace(zip) {
  if (!MODEL?.[zip]) return;

  selection = zip;

  $("placeInput").value =
    zip + (PLACES[zip] ? " " + PLACES[zip] : "");

  closeSuggestions();
  refresh();
}

function showSuggestions() {
  const matches = suggestionItems($("placeInput").value);
  const root = $("suggestions");

  root.replaceChildren();
  activeSuggestion = -1;
  $("placeInput").removeAttribute("aria-activedescendant");

  for (const [index, zip] of matches.entries()) {
    const button = document.createElement("button");

    button.type = "button";
    button.id = "rent-suggestion-" + index;
    button.dataset.zip = zip;

    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");

    button.textContent = PLACES[zip] || zip;

    if (PLACES[zip]) {
      const detail = document.createElement("small");
      detail.textContent = "PLZ " + zip;
      button.append(detail);
    }

    // Das Eingabefeld beim Anklicken des Vorschlags fokussiert halten.
    button.addEventListener("mousedown", event => {
      event.preventDefault();
    });

    button.addEventListener("click", () => {
      selectPlace(zip);
    });

    root.append(button);
  }

  root.classList.toggle("hide", matches.length === 0);

  $("placeInput").setAttribute(
    "aria-expanded",
    String(matches.length > 0)
  );
}

function highlightSuggestion(index) {
  const buttons = [
    ...$("suggestions").querySelectorAll("button")
  ];

  if (!buttons.length) return;

  activeSuggestion =
    (index + buttons.length) % buttons.length;

  buttons.forEach((button, i) => {
    button.setAttribute(
      "aria-selected",
      String(i === activeSuggestion)
    );
  });

  const active = buttons[activeSuggestion];

  $("placeInput").setAttribute(
    "aria-activedescendant",
    active.id
  );

  active.scrollIntoView({ block: "nearest" });
}

$("placeInput").addEventListener("focus", () => {
  $("placeInput").select();
  showSuggestions();
});

$("placeInput").addEventListener("input", () => {
  selection = "";
  showSuggestions();
  refresh();
});

$("placeInput").addEventListener("keydown", event => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();

    if ($("suggestions").classList.contains("hide")) {
      showSuggestions();
    }

    const buttons = $("suggestions").querySelectorAll("button");

    if (event.key === "ArrowDown") {
      highlightSuggestion(activeSuggestion + 1);
    } else {
      highlightSuggestion(
        activeSuggestion < 0
          ? buttons.length - 1
          : activeSuggestion - 1
      );
    }

    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();

    if ($("suggestions").classList.contains("hide")) return;

    const buttons = [
      ...$("suggestions").querySelectorAll("button")
    ];

    const button = buttons[Math.max(0, activeSuggestion)];

    if (button) {
      selectPlace(button.dataset.zip);
    }

    return;
  }

  if (event.key === "Escape") {
    closeSuggestions();
  }
});

$("placeInput").addEventListener("blur", () => {
  setTimeout(() => {
    if (document.activeElement !== $("placeInput")) {
      closeSuggestions();
    }
  }, 180);
});

$("clearPlace").addEventListener("click", () => {
  $("placeInput").value = "";
  selection = "";

  closeSuggestions();
  $("placeInput").focus();
  refresh();
});

/* Aussenflächen passend zum Wohnungstyp anzeigen */

function updateExterior() {
  const type = selected.apartmentType;

  $("balconyField").classList.toggle(
    "hide",
    type !== "standard"
  );

  $("outdoorField").classList.toggle(
    "hide",
    type === "standard"
  );

  $("outdoorField").querySelector("label").textContent =
    type === "garden" ? "Gartenfläche" : "Terrassenfläche";

  $("outdoorNote").textContent =
    type === "standard"
      ? "Balkon: Zuschlag nach Fläche und lokalem Mietniveau."
      : type === "attic"
        ? "Attika: Typen- und Terrassenzuschlag gemeinsam, maximal rund 15 %."
        : "Garten: die ersten Quadratmeter zählen besonders stark; danach flacht der Zuschlag ab.";
}

/* Regler und Auswahlknöpfe */

for (const id of ["living", "balconyArea", "outdoorArea"]) {
  $(id).addEventListener("input", refresh);
}

for (const id of ["location", "condition", "apartmentType"]) {
  $(id).addEventListener("click", event => {
    const button = event.target.closest("button[data-value]");

    if (!button) return;

    selected[id] = button.dataset.value;

    $(id).querySelectorAll("button").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    if (id === "apartmentType") {
      updateExterior();
    }

    refresh();
  });
}

document.querySelectorAll("[data-count]").forEach(button => {
  button.addEventListener("click", () => {
    const [key, delta] = button.dataset.count.split(":");

    parking[key] = Math.max(
      0,
      Math.min(5, parking[key] + Number(delta))
    );

    text(key + "v", parking[key]);
    refresh();
  });
});

/* Zurücksetzen */

$("reset").addEventListener("click", () => {
  for (const id of ["location", "condition", "apartmentType"]) {
    selected[id] =
      id === "apartmentType" ? "standard" : "normal";

    $(id).querySelectorAll("button").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.value === selected[id]
      );
    });
  }

  parking = { garage: 0, outside: 0 };

  text("garagev", "0");
  text("outsidev", "0");

  $("living").value = 80;
  $("balconyArea").value = 0;
  $("outdoorArea").value = 0;

  updateExterior();
  closeSuggestions();

  if (MODEL) {
    selectPlace(MODEL["5400"] ? "5400" : Object.keys(MODEL)[0]);
  } else {
    refresh();
  }
});

/* Daten laden */

async function loadJson(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(path + ": HTTP " + response.status);
  }

  return response.json();
}

async function start() {
  updateExterior();
  refresh();

  const [modelResult, placesResult] = await Promise.allSettled([
    loadJson(MODEL_FILE),
    loadJson(PLACE_FILE)
  ]);

  if (modelResult.status === "rejected") {
    console.error("Mietmodell konnte nicht geladen werden:", modelResult.reason);

    $("status").classList.add("error");

    text(
      "status",
      "Mietmodell konnte nicht geladen werden. Prüfe daten/mietmodell_plz_parameter.json und öffne die Seite über einen Webserver."
    );

    return;
  }

  const model = modelResult.value;

  if (
    !model ||
    typeof model !== "object" ||
    Array.isArray(model) ||
    Object.keys(model).length === 0 ||
    !Object.values(model).every(parameters =>
      parameters &&
      ["q20", "q50", "q80"].every(key =>
        Array.isArray(parameters[key]) &&
        parameters[key].length >= 3 &&
        parameters[key].slice(0, 3).every(Number.isFinite)
      )
    )
  ) {
    $("status").classList.add("error");

    text(
      "status",
      "Die Mietmodelldatei hat nicht das erwartete Format."
    );

    return;
  }

  MODEL = model;

  let placesAvailable = false;

  if (placesResult.status === "fulfilled") {
    const places = placesResult.value;

    if (
      places &&
      typeof places === "object" &&
      !Array.isArray(places) &&
      Object.values(places).every(name => typeof name === "string")
    ) {
      PLACES = places;
      placesAvailable = Object.keys(MODEL).some(zip => PLACES[zip]);
    }
  } else {
    console.warn(
      "Ortsnamen konnten nicht geladen werden:",
      placesResult.reason
    );
  }

  // Eine bereits begonnene Eingabe beim Abschluss des Ladens erhalten.
  if (selection === "") {
    refresh();
  } else {
    selectPlace(MODEL["5400"] ? "5400" : Object.keys(MODEL)[0]);
  }

  if (document.activeElement === $("placeInput")) {
    showSuggestions();
  }

  if (!placesAvailable) {
    $("status").classList.add("error");

    text(
      "status",
      "Ortssuche nicht verfügbar. Bitte daten/mietorte.json prüfen. Die Suche über PLZ funktioniert."
    );
  }
}

start().catch(error => {
  console.error("Mietrechner:", error);
  $("status").classList.add("error");
  text("status", "Der Mietrechner konnte nicht gestartet werden.");
});