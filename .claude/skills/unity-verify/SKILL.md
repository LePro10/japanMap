---
name: unity-verify
description: How to check that a Unity change actually works - compile, console, tests, screenshots - and how to check the environment. Use after every code, scene, prefab or asset change, before saying something is done, and at the start of Phase 1.
---

# Prüfen in Unity

„Fertig" heißt: kompiliert, Konsole ohne Fehler, Tests grün, und bei allem
Sichtbaren ein Bild angesehen. Ungeprüftes wird als ungeprüft gemeldet.

## Zwei Wege — je nachdem, ob der Editor offen ist

| Editor offen (Normalfall) | Editor zu |
|---|---|
| Über **Unity-MCP**: Skript speichern → Kompilierung abwarten → Konsole lesen → Tests starten → Play / Bild | **Batchmode** über die Werkzeuge in `Tools/` (Phase 1) |

Batchmode auf ein Projekt, das der Editor offen hat, scheitert (Projekt
gesperrt). Nicht den Editor schließen, ohne den Menschen zu fragen.

## Reihenfolge nach einer Änderung

1. **Kompilieren abwarten**, dann Konsole lesen: 0 Fehler. Warnungen aus
   eigenem Code ernst nehmen.
2. **Tests** der betroffenen Module (EditMode zuerst, schnell; PlayMode für
   Laufzeitverhalten). Neue Logik bekommt einen Test, Bugfixes einen Test,
   der vorher rot war.
3. **Bild** bei allem Sichtbaren: von einem festen Blickpunkt (ab Phase 2),
   klein (≈ 1024 px), und **ansehen** — Zahlen allein haben im Prototyp
   mehrfach grobe Fehler durchgelassen.
4. **Play-Modus-Konsole** nach ein paar Sekunden Laufzeit: Fehler, die erst
   zur Laufzeit kommen (NullReference, fehlende Referenzen).
5. Bei Leistungsfragen: Debug-Overlay / Profiler am Blickpunkt, Vorher und
   Nachher am **selben** Ort.

## Umgebung prüfen (Beginn Phase 1 und nach Rechnerwechsel)

- Unity-Version und Pfad zu `Unity.exe` (Hub: `Editor/<version>/Editor/Unity.exe`),
  Web-Modul installiert (`PlaybackEngines/WebGLSupport`).
- `git lfs version` funktioniert, `git lfs install` wurde ausgeführt.
- Unity-MCP antwortet (Tools auflisten), Blender-MCP antwortet
  (`get_addon_status`).
- Grafikkarte notieren (Leistungsangaben gelten nur für diesen Rechner).

Fehlt etwas: genaue Anleitung in STATUS.md „Für dich", dann stoppen.

## Bekannte Fallen

- Nach dem Anlegen/Umbenennen von Skripten erst Kompilierung abwarten, bevor
  Komponenten hinzugefügt werden — sonst „script class not found".
- `.meta`-Dateien gehören zum Asset; nie einzeln löschen.
- Mit abgeschaltetem Domain Reload bleiben statische Felder zwischen
  Play-Sitzungen erhalten → statische Zustände explizit zurücksetzen.

(Ergänzen, sobald neue Fallen auftauchen — Skill `retro`.)
