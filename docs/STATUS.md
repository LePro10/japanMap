# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-07 · **Phase:** 2 (Die Karte) läuft

## Phase 2 — Die Karte

- [x] 0. Terrain-Shader im Web geklärt: Probe-Terrain (URP Terrain/Lit) im Web-Build sichtbar, Rauchprobe GREEN. Die Warnung „All SubShaders stripped" betrifft nur Unitys Debug-Shader `Hidden/Core/Debug*`. `WebBuild` schlägt jetzt fehl, wenn ein anderer Shader komplett gestrippt wird (`WebBuildTests`).
- [x] 1. Terrain-Importer (`JapanMap/Map/Import Terrain`, Regler in `Data/Map/MapImportSettings.asset`): 5 Checkpoints, größte Abweichung 0,034 m; Gipfel 450 m an der erwarteten Stelle; Draufsicht = Vorschau (Norden oben). Zweimal importieren → identisch (`MapImportTests`). Kachelung entschieden: **eine Kachel** (DECISIONS D14, gemessen mit `ViewpointBench`). Web-Build mit ganzer Karte: sichtbar, Rauchprobe GREEN.
- [x] 2. Splatmap aus `zones.png` → 4 Terrain-Layer (Fels/Gras/Sand/Reisfeld, Kachelgrößen aus dem Prototyp), Poly-Haven-Texturen (CC0) unter `Assets/ThirdParty/PolyHaven` mit `LICENSES.md`; Normalmaps/Max. 1024 px per Import-Regel (`TextureImportRules`). Draufsicht = `zones.png`; Test: dominante Schicht an drei Punkten. Noch ohne Mask-Map/Triplanar (Optik → Phase 4).
- [x] 3. Wasser (`JapanMap/Map/Import Water`): Meer auf 0 m, Reisfeld-Wasser aus `paddy.png` (29 Kacheln à 256 m, 16 k Dreiecke), Fluss als Band mit der Spiegel-Logik des Prototyps (730 Dreiecke). Reisfeld-Wassertiefe **0,10 m** wie im Prototyp (`props.config` PADDY_WATER.depth; bei den 0,30 m aus der Bake-Meta „ersoff" dort das Auto). Test: alle Wasserflächen zeigen nach oben. Ränder treppig, Material schlicht → Phase 4.
- [x] 4. Straßen-Importer (`JapanMap/Map/Import Roads`): 152 Straßen in 24 Kacheln à 512 m (127 k Dreiecke), Querschnitt/Querneigung/Kürzung an Einmündungen wie im Prototyp, Leitplanken mit Pfosten (an Einmündungen unterbrochen), Stadt-Bodenplatte auf 29,97 m, Hochstraße mit Deck und Pfeilern/Portal-Jochen (vereinfacht nach `ViaductSystem`). Passung Mittellinie − Gelände je Typ: Median ≤ 2,4 cm, |p95| ≤ 9 cm (Test). Alle Collider als MeshCollider.
- [ ] 5. Props-Importer
- [x] 6. Blickpunkte: 39 aus dem Prototyp (z gespiegelt) in `Data/Map/Viewpoints.asset`; Menü `JapanMap/Viewpoints/Go To…`, `Capture All`; `node Tools/capture.mjs --viewpoint <name|all>` bzw. MCP `ViewpointTools.Capture("pass")`. Test: kein Blickpunkt unter dem Gelände. Vergleich mit alten Bildern: `node Tools/montage.mjs` (neu). Kamera: FOV 60, near 0,5, far 6000 wie im Prototyp; Phase-1-Platzhalter (Boden, Würfel, Kugel) entfernt.
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

## Gefunden (später)

- Terrain allein bis 1,3 M Dreiecke (Reisfeld-Blick) — über dem Budget „Niedrig" (800 k). `pixelError` je Qualitätsstufe setzen (10 halbiert) → Phase 10.

- Hochstraße: Brüstungen und Pfeiler-Feinheiten des Prototyps fehlen; 6 winzige Faltungen an zwei engen Stadtecken (< 1 m²) → Phase 5 (Stadt).
- Stadt-Bodenplatte ist nur Platte + senkrechte Kante, ohne die 24-m-Böschung des Prototyps → Phase 5.

## Für dich (Mensch)

1. **Neue Claude-Sitzung** für Phase 2 starten, mit **offenem Unity-Editor**
   (Projekt `japanMap` aus dem Hub). Dann verbindet sich der Unity-MCP von
   selbst. Im Fenster „MCP for Unity" musst du nichts klicken.
2. **Blender** öffnen und im Add-on „Blender MCP" den Server starten — ist
   erst ab Phase 4 nötig, beim Start dieser Sitzung war Blender nicht erreichbar.
3. **Optional, 2 Minuten:** einmal selbst ins Projekt schauen — `Boot.unity`
   öffnen, Play drücken, F1 drücken: oben links erscheinen FPS, Dreiecke, Speicher.
4. Commits liegen lokal; **Push** nur, wenn du es sagst.
