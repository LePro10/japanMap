# Status

> Nur der **aktuelle** Stand — keine Geschichte (die steht in `git log`).
> Wird am Ende jeder Sitzung aktualisiert. Unter 80 Zeilen halten.

**Stand:** 2026-10-07 · **Phase:** 2 abgeschlossen, **Phase 3 (Fahren) ist als Nächstes dran**

## Phase 2 — Die Karte ✅

Alles per Menü `JapanMap/Map/Import All` (Regler: `Data/Map/MapImportSettings.asset`).

- [x] 0. Terrain-Shader im Web geklärt (sichtbar; `WebBuild` scheitert jetzt bei komplett gestrippten Shadern)
- [x] 1. Terrain: 1 Kachel 3 km, 2049², Instancing (D14, gemessen). Checkpoints max. 0,034 m
- [x] 2. Splatmap aus `zones.png`, 4 Poly-Haven-Layer (CC0, `Assets/ThirdParty/LICENSES.md`)
- [x] 3. Wasser: Meer 0 m, Reisfelder 0,10 m (Prototyp-Wert), Fluss
- [x] 4. Straßen: 152 Straßen, Leitplanken, Hochstraße mit Pfeilern, Stadt-Bodenplatte (29,97 m)
- [x] 5. Props: 977 Platzhalter, Drehformel `180 − rot` an der Tempeltreppe geprüft
- [x] 6. Blickpunkte: 39 aus dem Prototyp, `Go To…`, Capture je Blickpunkt, `ViewpointBench`
- [x] 7. Kollision: Terrain, Straßen, Props; Strahl- und Fall-Tests

**Abnahme**
- Checkpoints ≤ 0,1 m: ✅ max. 0,034 m. Straßen auf dem Gelände: Median ≤ 2,4 cm, |p95| ≤ 9 cm je Typ.
- Bilder: `Captures/gate-p2-high.png` (6 Blickpunkte neben den alten Bildern), `gate-p2-low.png`. Lage stimmt.
- Zweimal importieren: Daten-Assets byte-gleich, Weltinhalt (3 051 Objekte) identisch (Test `ImportAll_TwiceGivesIdenticalMap`).
- Tests: EditMode 37/37, PlayMode 2/2 (MCP). Web-Rauchprobe Release + Development GREEN, 0 Konsolenfehler.
- **FPS auf deinem Rechner: offen** → „Für dich" Punkt 1.

## Messwerte (M4, Editor, Stufe Hoch, `ViewpointBench`)

| Blickpunkt | Draw Calls | davon ohne Props | Dreiecke |
|---|---|---|---|
| start / stadt | 1 991 / 1 977 | 167 / 195 | 0,9 / 1,2 M |
| pass / reisfeld | 900 / 1 277 | 78 / 138 | 1,2 / 1,4 M |
| tempel / kueste | 236 / 1 249 | 59 / 51 | 0,2 / 0,1 M |

## Web-Build

| Datum | Typ | Gesamt | wasm | data | Boot (lokal) |
|---|---|---|---|---|---|
| 2026-10-07 | Release, leere Szene | 7,75 MB | 5,18 MB | 2,39 MB | 0,9 s |
| 2026-10-07 | Release, ganze Karte | 25,81 MB | 5,28 MB | 20,34 MB | 1,6 s |

## Phase 3 — Fahren (als Nächstes)

- [x] 1. Ansatz: Rigidbody + Raycast-Federung + portiertes Arcade-Modell (D15, gemessen gegen WheelCollider); Zuordnung Modelle ↔ Fahrwerte (D16)
- [x] 2. Hachi 86 (Kite-S-Werte) fahrbar inkl. Drift, Nitro, Respawn auf nächste Straße (R / Y / auf dem Dach)
- [x] 3. Eingabe: Tastatur (WASD/Pfeile, Leertaste, Shift, R, C, B), Gamepad (Trigger, Stick, A, X/RB, Y), Touch (Stick + DRIFT/NITRO, zwei Finger getestet)
- [x] 4. Kameras: Verfolger (Cinemachine, Drift-Blick, FOV, Zoom per Mausrad, Blick zurück) + Cockpit (C)
- [x] 5. Prüfstände als PlayMode-Tests: 13 Proben × 10 Autos + 4 Stunt-Proben = 134 grün (0–100, Endtempo, Bremsweg, Symmetrie, Ausrollen, Lenkantwort, Drift ohne Absicht, Handbremsdrift, Hang 20°, Landung 6 m, Wand)
- [x] 6. Alle zehn Autos als Datensätze (`Data/Vehicles/*.asset`, D16)
- [ ] 7. Fahrzeug-Optik

## Offene Probleme / Gefunden

- **`Placeholders/torii.prefab` ändert sich bei jedem EditMode-Lauf** (neue fileIDs durch den Import-Test) → nicht committen, Ursache im PropImporter suchen.
- **Car-Lab-Modelle schwer:** Hachi 137 k Dreiecke inkl. Tuning-Teilen, GLBs zusammen 31 MB (PNG) → LOD/Texturgröße in Phase 4/10, Autos per Addressables nachladen.
- **Wassertiefe** wird vom Fahrmodell noch nicht gemessen (Wasser hat keine Collider) → Aquaplaning/Furt fehlen bis Phase 4.

- **Draw Calls über Budget durch Platzhalter:** 977 Props × 2 Teile ≈ 1 800 Draw Calls (Budget 1 500 / Niedrig 400). Echte Modelle in Phase 4 mit Instancing/Zusammenfassen/LOD.
- **Download 25,8 MB** > Ziel Handy 20 MB: `data` 20 MB (Höhenfeld, Texturen, Straßen-Meshes) → Phase 10 (Kompression, Addressables).
- Terrain bis 1,4 M Dreiecke (Budget Niedrig 800 k): `pixelError` je Stufe (10 halbiert) → Phase 10.
- Hochstraße ohne Brüstungen; Stadtplatte ohne Böschung; 6 winzige Faltungen an zwei Stadtecken → Phase 5.
- Reisfeld-Wasserränder treppig, Materialien schlicht, kein Triplanar am Fels → Phase 4.
- Draw Calls im Browser nicht messbar (Web-Player meldet 0) → im Editor mit `ViewpointBench`.
- **Ungeprüft im Batchmode** (Editor war offen): Sperrklinke `Tools/test-count.json` in `verify.mjs` und `capture.mjs --viewpoint`. Beim nächsten Lauf mit geschlossenem Editor einmal ausführen.
- Web-Seite ist noch Unitys Standardvorlage → Phase 9/10.
- Zwölf alte Agent-Zweige `agent/*` gehören zum Prototyp. Löschen entscheidet der Mensch.

## Für dich (Mensch)

1. **Einmal durch die Karte fliegen und FPS ablesen (10 Min.):** Im Terminal
   `node Tools/serve-web.mjs` starten, in Chrome `http://localhost:8090`
   öffnen, ins Bild klicken, **F1** drücken → oben links steht die FPS-Zahl.
   Bitte die Zahl notieren (Startblick). Das ist der Development-Build.
   Danach im Unity-Editor `JapanMap/Viewpoints/Go To…` → z. B. `pass`,
   `reisfeld`, `kueste`, `stadt` wählen und im Scene-Fenster umsehen:
   **Stimmt die Karte?** (Lage von Bergen, Stadt, Reisfeldern, Küste, Straßen.)
   Graue/braune Kästen sind Platzhalter, rote Klötze zeigen deren Vorderseite.
2. **Blender** + Add-on „Blender MCP" erst ab Phase 4 bzw. für den Asset-Sprint nötig.
3. Commits liegen lokal; **Push** nur, wenn du es sagst.
