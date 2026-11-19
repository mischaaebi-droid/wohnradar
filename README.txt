WOHNRADAR – ZENTRALE ORTSSUCHE
Version: 19. November 2026

INHALT
=======
Neue zentrale Suchdateien:
  javascript_dateien/ortssuche.js   (NEU)
  javascript_dateien/ortssuche.css  (NEU)

Angepasste Rechner-Dateien:
  javascript_dateien/haeuser.js
  javascript_dateien/wohnungen.js
  javascript_dateien/miete.js
  javascript_dateien/bauland.js
  javascript_dateien/mietkennzahlen.js

Angepasste HTML-Dateien (ausschliesslich neue Cache-Version der JS-Datei):
  haus.html
  wohnungen.html
  miete.html

INSTALLATION
============
1. Alle Dateien aus diesem ZIP in dieselben Pfade des GitHub-Repositories
   hochladen und die bestehenden Dateien ersetzen. Das Verzeichnis
   javascript_dateien/ortssuche.js und ortssuche.css sind neue Dateien.

2. Für bauland.html und mietkennzahlen.html (HTML-Dateien wurden nicht
   hochgeladen) bitte ebenfalls die Cache-Version der jeweiligen JS-Datei
   im <script src="...">-Tag ändern:

   javascript_dateien/bauland.js?v=orts20261119
   javascript_dateien/mietkennzahlen.js?v=orts20261119

   Falls der jeweilige Skript-Tag derzeit keine ?v=...-Angabe hat, diese
   einfach anhängen. Kein weiterer Script-Tag für ortssuche.js nötig.

3. GitHub Pages aktualisieren lassen und auf einem echten Smartphone
   im normalen Browser (nicht nur in Desktop-Gerätesimulation) testen.

BEDIENUNG
=========
- Vorschläge ab dem zweiten Zeichen (PLZ oder Ortsname), ohne Wartezeit.
- Smartphone: separater Suchbildschirm mit Eingabefeld ganz oben.
- Tastatur bleibt offen, solange der Benutzer tippt – kein Tastatur-Timer.
- Nach bewusster Auswahl wird der Suchbildschirm geschlossen.
- Maximal 6 Vorschläge mobil und maximal 10 auf dem Desktop.
- Keine automatische Auswahl des ersten Vorschlags via Enter.
- Eine unterbrochene Eingabe bleibt beim erneuten Öffnen erhalten.
- Eine bereits ausgewählte Ortschaft kann überschrieben werden.
- Die Berechnungsmodelle wurden nicht geändert.

EINSTELLUNGEN
=============
Im Kopf von javascript_dateien/ortssuche.js:
  minCharacters: 2,
  mobileResults: 6,
  desktopResults: 10

HINWEISE
========
Die beiden nicht mitgelieferten HTML-Dateien bauland.html und
mietkennzahlen.html konnten nicht automatisch bearbeitet werden.
Die drei anderen HTML-Dateien wurden bewusst nur für das Verhindern
veralteter JavaScript-Versionen (Cache-Busting) geändert.

Automatisierte Funktionstests in mobilem und Desktop-Chromium für
alle fünf Rechner waren erfolgreich. Das Verhalten der Bildschirmtastatur
auf iOS/Safari muss zusätzlich auf einem echten Gerät überprüft werden.
