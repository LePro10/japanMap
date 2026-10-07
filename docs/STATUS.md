# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-07 · **Phase:** 2 (Die Karte) läuft

## Phase 2 — Die Karte

- [x] 0. Terrain-Shader im Web geklärt: Probe-Terrain (URP Terrain/Lit) im Web-Build sichtbar, Rauchprobe GREEN. Die Warnung „All SubShaders stripped" betrifft nur Unitys Debug-Shader `Hidden/Core/Debug*`. `WebBuild` schlägt jetzt fehl, wenn ein anderer Shader komplett gestrippt wird (`WebBuildTests`).
- [x] 1. Terrain-Importer (`JapanMap/Map/Import Terrain`, Regler in `Data/Map/MapImportSettings.asset`): 5 Checkpoints, größte Abweichung 0,034 m; Gipfel 450 m an der erwarteten Stelle; Draufsicht = Vorschau (Norden oben). Zweimal importieren → identisch (`MapImportTests`). **Kachelung noch offen** — Messung braucht Blickpunkte (Aufgabe 6 vorgezogen).
- [ ] 2. Splatmap
- [ ] 3. Wasser
- [ ] 4. Straßen-Importer
- [ ] 5. Props-Importer
- [ ] 6. Blickpunkte
- [ ] 7. Kollision

## Phase 1 — Fundament ✅

- [x] 1. Umgebung: Unity 6000.6.4f1 + Web-Modul, Git LFS 3.8.0 (neu installiert), Node 26, Apple M4 / 16 GB, Metal 4
- [x] 2. Projekt im Repo-Wurzelordner (URP-Vorlage per CLI, 42 s)
- [x] 3. Einstellungen (`ProjectSetup.Apply`, abgesichert durch `ProjectSettingsTests`)
- [x] 4. Pakete (Begründung: DECISIONS D09)
- [x] 5. Module `JapanMap.*` mit je einer `.asmdef`
- [x] 6. Werkzeuge: verify, capture, build-web, serve-web, smoke, measure-loop (CLAUDE.md „Befehle")
- [x] 7. F1-Overlay `StatsOverlay` (nur Editor/Development)
- [x] 8. `Boot.unity` (Bootstrapper → QualitySystem → StatsOverlay) + `Game.unity`
- [x] 9. Qualitätsstufen High / Medium / Low mit eigenen URP-Assets
- [x] 10. Schleife gemessen (unten)

**Abnahme:** `verify` GREEN (EditMode 15/15, PlayMode 1/1); Gegenprobe mit
absichtlich falschem Test und Kompilierfehler → RED. Bild `Captures/Game.png`
angesehen. Web-Build im Headless-Chrome: 0 Konsolenfehler, Boot nach 0,9 s
(lokal). Alle Befehle aus CLAUDE.md einmal ausgeführt, auch über den MCP.

## Messwerte der Arbeitsschleife (M4, 2026-10-07)

| Schritt | Dauer |
|---|---|
| Editor-Start ohne Änderung (Batchmode) | 5,6 s |
| … mit einer geänderten Skriptdatei | 6,0 s (Kompilieren ≈ 0,4 s) |
| Play Mode betreten | 0,07–0,11 s (Domain Reload aus; an: 1,2 s) |
| `verify` gesamt (EditMode / PlayMode) | 13–15 s (6–9 s / 6 s); über MCP EditMode 0,4 s |
| `capture` | 6–10 s |
| Web-Build Release / Development | 82–150 s / 22–38 s |

## Web-Build

| Datum | Typ | Gesamt | wasm | data |
|---|---|---|---|---|
| 2026-10-07 | Release, leere Szene | 7,75 MB | 5,18 MB | 2,39 MB |

## Gefunden (nebenbei bemerkt, noch nicht behoben — CLAUDE.md Regel 14)

- —

## Offene Probleme

- **Draw Calls im Browser nicht messbar:** Der Web-Player meldet sie als 0
  (Overlay zeigt „n/a"). Draw-Call-Budgets im offenen Editor messen.
- Die Web-Seite ist noch Unitys Standardvorlage (960 × 600 mit Fußleiste) → eigene Vorlage spätestens Phase 9/10.
- Zwölf alte Agent-Zweige `agent/*` (Worktrees unter `../japanMap.worktrees/`)
  gehören zum Prototyp. Nicht mergen. Löschen entscheidet der Mensch.
- Achsen-Umrechnung der Props-Drehung (`SourceData/legacy/README.md`) ist
  gerechnet, nicht im Bild geprüft → Phase 2, Aufgabe 5.
- `legacy/threejs/node_modules` fehlt (war nicht da) — `npm ci` dort erst, wenn der Prototyp gebraucht wird.

## Für dich (Mensch)

1. **Neue Claude-Sitzung** für Phase 2 starten, mit **offenem Unity-Editor**
   (Projekt `japanMap` aus dem Hub). Dann verbindet sich der Unity-MCP von
   selbst. Im Fenster „MCP for Unity" musst du nichts klicken.
2. **Blender** öffnen und im Add-on „Blender MCP" den Server starten — ist
   erst ab Phase 4 nötig, beim Start dieser Sitzung war Blender nicht erreichbar.
3. **Optional, 2 Minuten:** einmal selbst ins Projekt schauen — `Boot.unity`
   öffnen, Play drücken, F1 drücken: oben links erscheinen FPS, Dreiecke, Speicher.
4. Commits liegen lokal; **Push** nur, wenn du es sagst.
