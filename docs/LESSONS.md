# Lehren und Vorkehrungen

> Jede Zeile: was passiert ist → welche **Vorkehrung** es künftig verhindert.
> Eine Lehre ohne Vorkehrung ist nur eine Geschichte. Format und Ablauf:
> Skill `retro`. Neueste oben. Bei mehr als 60 Zeilen: ähnliche Einträge
> zusammenfassen (die Vorkehrung bleibt, der Text wird kürzer).

| Datum | Phase | Was passiert ist | Vorkehrung (wo) | Art |
|---|---|---|---|---|
| 2026-10-08 | 4 | Unity verwarf beim FBX-Import 395 sich selbst schneidende Polygone in 29 Gebäuden (Löcher), nur als Warnung | `LibraryImporter` meldet sie je Mesh im Import-Bericht; Skill `blender-asset` „ohne Löcher" | Werkzeug |
| 2026-10-08 | 4 | URP-Validierung schaltete `_EMISSION` beim Reimport ab (GI-Flag None) — Schilder wären dunkel | `RealtimeEmissive` im Importer; Test `AtlasMaterials_KeepEmissionAfterUrpValidation` | Test |
| 2026-10-08 | 4 | Terrain-Bäume: 44 500 Draw Calls, 30 Mio. Dreiecke; Gras im Coverage-Modus 7,6/m² statt 2,5 | `VegetationRenderer` (D18), Test `Terrain_HasNoTreeInstances`; Dichte-Messung im Tooltip | Test |
| 2026-10-08 | 4 | ViewpointBench maß seit Phase 3 an jedem Blickpunkt das Auto-Bild (Cinemachine) | Bench schaltet Kamera-Rigs ab und meldet, wenn die Kamera nicht am Blickpunkt steht | Werkzeug |
| 2026-10-08 | 4 | Sonnenscheibe + Bloom ohne Clamp füllte im Browser das halbe Bild; kein Blickpunkt sah zur Sonne | `bloomClamp` im LookProfile, Blickpunkt `stadt-sonne` | Werkzeug |
| 2026-10-08 | 4 | Post-Processing war an der Kamera aus — Phase 1–3 maß FPS ohne Nachbearbeitung | `LookTests.Scene_HasTheProfileApplied` prüft `renderPostProcessing` | Test |
| 2026-10-08 | 4 | Rote Herbst-Ahorne und Bonbon-Punkte im Fernblick erst im Fahrerbild aufgefallen | Rauchprobe-Bild (Fahrerblick) bei jeder Optik-Änderung ansehen; Anteil als Regler `variantWeights` | Ablauf |
| 2026-10-08 | 4 | JSON von Hand escapen für MCP-C#; Tests starten und abfragen von Hand | `Tools/unity-exec.mjs`, `Tools/unity-test.mjs`, `Tools/unity-run.mjs` (Batch) | Werkzeug |
| 2026-10-08 | Asset | Mehrere Lektionen der Asset-Sitzung (BMesh-Fallen, Atlas-Ränder, verirrte Teile, Blender-5-Ikosphären) | stehen mit Vorkehrung in `ArtSource/STATUS.md` „Gefunden" und `ArtSource/STYLE-KIT.md` | Skill |
| 2026-10-07 | Asset | Stil-Kit Runde 1 zu flach (Kura 22 %, Automat 14 % des Budgets), gestreckte Texturen | Skill `blender-asset` „Qualitäts-Schleife", Zielbereich 40–80 % in ART-DIRECTION.md, Streck-Warnung in `ArtSource/build.py` | Skill/Werkzeug |
| 2026-10-07 | — | Rückmeldungen des Menschen mussten jedem Agenten neu gesagt werden | CLAUDE.md Regel 16, Skill `retro` Schritt 1 | Regel |
| 2026-10-07 | 2 | Zweite Sitzung committete parallel (D13 doppelt vergeben); ein `commit -a` hätte fremde Dateien mitgenommen | `CLAUDE.md` Regel 13: nur eigene Pfade committen, DECISIONS-Nummer neu lesen | Regel |
| 2026-10-07 | 2 | Neuer Default im ScriptableObject-Code (Torii als Tor) kam im vorhandenen Asset nicht an | Hinweis im Kopf von `MapImportSettings`: das Asset ist die Wahrheit | Ablauf |
| 2026-10-07 | 2 | Beim Umbau einer Testdatei fielen drei Splat-Tests still weg (34 statt 37); nur die Zahl verriet es | Sperrklinke `Tools/test-count.json` in `verify.mjs`, Schritt im Skill `unity-verify` | Werkzeug |
| 2026-10-07 | 2 | Stadtplatte als 2 Riesendreiecke (1000 m) → PhysX-Warnung, instabile Kollision; erst der PlayMode-Fall-Test zeigte sie | Test `Colliders_HaveNoHugeTriangles` (Kanten < 100 m) | Test |
| 2026-10-07 | 2 | Re-Import mit `EditorUtility.CopySerialized` in ein Mesh-Asset: Daten neu, Bild alt (Grafikpuffer nicht erneuert) — Pfeiler fehlten im Bild, obwohl im Mesh | `MeshAssets.Save` befüllt über die Mesh-API (Test `MeshAssets_SaveTwice…`); Skill `unity-verify`, Falle ergänzt | Werkzeug |
| 2026-10-07 | 2 | Warnung „All SubShaders stripped“ war nur notiert, nicht geprüft — ein gestrippter Shader ist im Browser unsichtbar, im Editor aber da | `WebBuild` sammelt die Warnungen und scheitert bei unbekannten Shadern (`WebBuildTests`) | Werkzeug |
| 2026-10-07 | 1 | Editor per `kill` beendet, MCP-Server lief verwaist weiter; der nächste Editor meldete sich nicht an | Skill `unity-verify`, Falle "Editor schließen" | Skill |
| 2026-10-07 | 1 | Web-Player liefert „Draw Calls"/„Batches" als 0, obwohl gezeichnet wird — eine falsche Budgetzahl | Overlay zeigt „n/a" (`StatsOverlay.Snapshot.Count`), Test in `FrameTimeStatsTests` | Test |
| 2026-10-07 | 1 | Capture im Editor ohne gespeicherte Szene schrieb `Captures/.png` | Fallback-Name in `Capture.FromMenu` | Werkzeug |
| 2026-10-07 | 1 | Rauchprobe meldete Unitys absichtlich abgebrochenen Brotli-Stream als Fehler | Filter nur für `ERR_ABORTED` auf `*.unityweb` in `Tools/smoke.mjs` | Werkzeug |
| 2026-10-07 | 1 | Web-Server (launch.json) und Unity-MCP wollten beide Port 8080 | `Tools/serve-web.mjs` auf 8090, launch.json angepasst | Werkzeug |
| 2026-10-07 | 1 | Editor per AppleScript schließen griff nicht; Unity-MCP verbindet sich nicht in eine laufende Sitzung; Batch-PlayMode rendert nicht (Zähler 0) | Skill `unity-verify`, „Bekannte Fallen" | Skill |
| 2026-10-07 | 0 | Prototyp-Anleitung wuchs auf 48 000 Tokens Fehlergeschichten und wurde bei jedem Start geladen | `CLAUDE.md` hat Budget 150 Zeilen; Lehren nur hier, als Zeile | Regel |
| 2026-10-07 | 0 | Vier KI-Werkzeuge und zwölf parallele Agent-Zweige erzeugten Widersprüche | `CLAUDE.md` Regel 13: ein Agent zur Zeit auf `master` | Regel |
| 2026-10-07 | 0 | Doku widersprach dem Code (`npm run roads` „ohne `--wp6`", obwohl längst mit) | Phasen-Tor Schritt 5: Doku-gegen-Code-Prüfung | Ablauf |
| 2026-10-07 | 0 | Prototyp baute Physik, Kollision und Renderweg selbst (≈ 29 000 Zeilen, Hauptquelle der Bugs) | `CLAUDE.md` Regel 3: Standard vor Eigenbau, Begründung in DECISIONS.md | Regel |
| 2026-10-08 | 3 | Rigidbody vor dem Collider gebaut → fast keine Trägheit, Auto drehte bei jedem Federstoß wild | `VehicleController.Build`: `ResetInertiaTensor()` nach dem Collider; Prüfstand `VehicleBenchTests` misst es mit | Test |
| 2026-10-08 | 3 | Landung aus 6 m: ContinuousDynamic fing den 21-cm-Schritt nicht ab; Speculative bremste dafür an Fahrbahnkanten (118 → 40 km/h) | `ArcadeTuning.collisionMode` + `bodyContactOffset` als Regler, beide gemessen; Tests Landung + Ringfahrt | Test |
| 2026-10-08 | 3 | Port vergaß die Luft-Lageregel des Prototyps → Nase kippte an Kuppen, Landung mit der Stoßstange | `airLevelRate`/`airAttitudeResponse`; Abnahmefahrt `AcceptanceDriveTests` | Test |
| 2026-10-08 | 3 | Karten-Abnahme prüfte nur Median/p95 → Gelände ragte an 800 Stellen bis 4 m durch Straßen | `TerrainCarve` im Gelände-Import; Test `Terrain_NeverPokesThroughARoad` | Test |
| 2026-10-08 | 3 | Absenken lag im Straßen-Import, ein Test importierte nur das Gelände → Absenkung still verloren | Schritt in `TerrainImporter.Import` verlegt: jeder Weg zum Gelände gleich | Test |
| 2026-10-08 | 3 | Straßenenden lagen als Rampe auf anderen Straßen (bellwood-edge 3,4 m über dem Ring) und stoppten Autos | `RoadImporter.OverlapRun` kürzt solche Enden (Entscheidung nach Rohgelände) | Test |
| 2026-10-08 | 3 | Fehler in der Spur war im ersten Ringtest nicht zu finden („Auto bleibt stehen") | Abnahmefahrt schreibt Sekundenspur + harte Karosserie-Kontakte (`BodyContactLog`) nach `Captures/` | Werkzeug |
| 2026-10-08 | 3 | MCP-Werkzeuge fehlten, weil der Editor nach Sitzungsstart kam | HTTP-Helfer wie im Skill `unity-verify` beschrieben; Skill um fertiges Skript ergänzt | Skill |
| 2026-10-08 | 3 | Prototyp-Prüfstände ließen sich nicht starten (kein `three`), Zeit fürs Herausfinden | Rezept im Skill `legacy-port`; Ausgaben in `SourceData/bench/` | Skill |
| 2026-10-08 | 3 | Mensch: Auto rammt mit der Front in Senken/Kanten und stoppt abrupt | Kollisionsbox höher und kürzer (`ArcadeTuning.bodyUnderLift`, `bodyLengthShare`); Ringfahrt zählt harte Karosserie-Stöße (3 → 0) | Test |
| 2026-10-08 | 5 | Zehn Fahrzeugmodelle als Ausstellung: 1,23 Mio. Dreiecke, 1 212 Draw Calls an einem Ort | Test `EveryPlace_StaysInItsTriangleBudget` (≤ 600 k je Ort); Bench je Ort mit `Tools/bench.mjs` (Hoch + Niedrig in einem Lauf) | Test |
| 2026-10-08 | 5 | Stellvertreter-Modell (Fischmarkthalle als Autohaus) sah erst im Nahbild falsch aus | Je Ort Nahbilder mit fester Kamera vor dem Commit; Bench-Werkzeug statt Handschritte | Werkzeug |

Arten: **Test** (automatisch geprüft) · **Werkzeug** (Skript übernimmt den
Schritt) · **Skill** (Ablauf angepasst) · **Regel** (CLAUDE.md) · **Ablauf**
(Phasen-Tor / Sitzungsablauf).
