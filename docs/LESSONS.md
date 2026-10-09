# Lehren und Vorkehrungen

> Jede Zeile: was passiert ist → welche **Vorkehrung** es künftig verhindert.
> Eine Lehre ohne Vorkehrung ist nur eine Geschichte. Format und Ablauf:
> Skill `retro`. Neueste oben. Bei mehr als 60 Zeilen: ähnliche Einträge
> zusammenfassen (die Vorkehrung bleibt, der Text wird kürzer).

| Datum | Phase | Was passiert ist | Vorkehrung (wo) | Art |
|---|---|---|---|---|
| 2026-10-09 | 6 | Blickpunkt-Bilder und Bench zeigten keine Arbeiter/Leute: das Leben folgt dem Spieler, nicht der Kamera | `play.mjs view` nimmt die Figur mit; Skill `unity-verify`: Kosten am Ort per `place` + `stats` | Werkzeug |
| 2026-10-09 | 6 | Zwei ScriptableObjects in einer Datei: Assets verloren ihr Skript, Läden wurden still nicht gebaut; zwei UIDocuments auf einem Objekt → NullReference | `ScriptFileTests` (eine Klasse je Datei); Panels als Unterobjekte; `play.mjs` meldet Konsolenfehler des Laufs | Test |
| 2026-10-08 | 6 | Tastatur-Tests mal grün, mal rot (Unity im Hintergrund sperrt die Tastatur; Gerät kam deaktiviert) | Tests/PlayScript: `IgnoreFocus` + Game-View-Fokus aus, Gerät danach anlegen und einschalten; Skill `unity-verify` | Test |
| 2026-10-08 | 6 | Werkzeuge maßen alten Code, liefen in den Testläufer oder warteten 3 min auf Kompilierfehler | `lib/fresh.mjs` kompiliert vor bench/play/exec/test, wartet bis 20 s auf Edit-Modus; `play.mjs` bricht bei Kompilierfehlern ab; neu `play.mjs` (echtes Spiel, Tasten, Bilder, Proben) | Werkzeug |
| 2026-10-08 | 6 | Fußgänger auf der Fahrbahn (Gelände ragt durch Straße); Szene +3,7 MB durch URP-Lichtdaten an 385 Instanzen; Python-Ersetzung mit leerem Suchtext | NavMesh schneidet Fahrbahnen nach Straßennetz aus + 10-min-Test; Bibliotheks-Lichter mit URP-Daten (`LibraryTests`); `assert old in s` | Test |
| 2026-10-08 | 5 | `unity-exec`/`unity-test` liefen dreimal auf altem Code (Änderung nicht kompiliert); erste Abhilfe kompilierte während eines laufenden Spiels (NullReference) | `Tools/lib/fresh.mjs`: kompiliert vor jedem Aufruf, nie im Play-Modus | Werkzeug |
| 2026-10-08 | 5 | Brüstungen gebaut für einen offenen STATUS-Punkt, der längst erledigt war (Leitplanken auf allen Viadukten) | Skill `unity-verify`: offenen Punkt erst im Bild bestätigen, dann bauen | Skill |
| 2026-10-08 | 5 | Leitplanken als Einzelstücke mit Lücken: Modelle mit Ursprung am Ende (Zäune, Planken) wurden symmetrisch vermessen und versetzt gesetzt | Echte Grundfläche + Mittelpunkt je Modell (`CentreOf`), Platzierung gleicht den Versatz aus; Prüfungen und Einebnen nehmen den Mittelpunkt | Werkzeug |
| 2026-10-08 | 5 | Reisfeldwasser lag quer über der neuen Dorfstraße (Maske älter als die Orte) | Maske wird unter Ortsstraßen und Hausflächen trocken (`PlaceImporter.Dry`) | Werkzeug |
| 2026-10-08 | 5 | Prototyp-TypeScript lief nicht im Node-Strip-Modus (Parameter-Properties, `@/…mjs`) | Eigener Lader `Tools/legacy-export/alias-loader.mjs` übersetzt mit esbuild aus dem Prototyp | Werkzeug |
| 2026-10-08 | 5 | Schatten-Abschalten „ohne Wirkung" gemessen — Asset nicht gespeichert, Play lud es neu | Für Bench-Versuche Asset `SetDirty` + `SaveAssets`; gleiche Zahlen bis auf die letzte Stelle = Versuch prüfen (LEGACY-MAP Lehre 5) | Skill |
| 2026-10-08 | 5 | Boden unter Orten wurde bei jedem Orts-Import erneut eingeebnet (± 0,85 m) | Einebnen nur im Gelände-Import vom Rohgelände; „Places/Import All" = ganzer Import (4 s); Fingerabdruck zweier Importe gleich | Werkzeug |
| 2026-10-08 | 5 | `RoadNetwork.width` war die Typbreite (8 m) statt der Straßenbreite (5–24 m); Häusertest schlug 143× falsch an, Geländetest sah nur 8 m | Netzbreite = eigene Breite; Test `Terrain_NeverPokesThroughARoad` tastet jetzt die volle Breite ab (fand 3 Stellen am Straßenanfang) | Test |
| 2026-10-08 | 5 | Stellvertreter-Modell (Fischmarkthalle als Autohaus) sah erst im Nahbild falsch aus | Je Ort Nahbilder mit fester Kamera vor dem Commit; Bench-Werkzeug statt Handschritte | Werkzeug |
| 2026-10-08 | 5 | Zehn Fahrzeugmodelle als Ausstellung: 1,23 Mio. Dreiecke, 1 212 Draw Calls an einem Ort | Test `EveryPlace_StaysInItsTriangleBudget` (≤ 600 k je Ort); Bench je Ort mit `Tools/bench.mjs` (Hoch + Niedrig in einem Lauf) | Test |
| 2026-10-08 | 5 | Neue Ortsstraßen: 34 % Steigung über Buckel, Damm einer Seitenstraße 0,92 m über der Hauptstraße, Mesh-Knick am Stoß zweier Splines | Profil wie Prototyp (≤ 11 %), erst Dämme dann Einschnitte, Einmündungshöhe übernehmen, Stoß runden — `Terrain_NeverPokesThroughARoad`, `Roads_SurfacesFaceUp` | Test |
| 2026-10-08 | 4 | Unity verwarf beim FBX-Import 395 sich selbst schneidende Polygone in 29 Gebäuden (Löcher), nur als Warnung | `LibraryImporter` meldet sie je Mesh im Import-Bericht; Skill `blender-asset` „ohne Löcher" | Werkzeug |
| 2026-10-08 | 4 | URP-Validierung schaltete `_EMISSION` beim Reimport ab (GI-Flag None) — Schilder wären dunkel | `RealtimeEmissive` im Importer; Test `AtlasMaterials_KeepEmissionAfterUrpValidation` | Test |
| 2026-10-08 | 4 | Terrain-Bäume: 44 500 Draw Calls, 30 Mio. Dreiecke; Gras im Coverage-Modus 7,6/m² statt 2,5 | `VegetationRenderer` (D18), Test `Terrain_HasNoTreeInstances`; Dichte-Messung im Tooltip | Test |
| 2026-10-08 | 4 | Messaufbau falsch: Bench maß das Auto-Bild (Cinemachine), Phase 1–3 maß FPS ohne Post-Processing | Bench schaltet Kamera-Rigs ab und prüft die Kameralage; `LookTests.Scene_HasTheProfileApplied` prüft `renderPostProcessing` | Werkzeug/Test |
| 2026-10-08 | 4 | Erst im Fahrerbild aufgefallen: Sonne + Bloom füllte das halbe Bild, Herbst-Ahorne als Bonbon-Punkte | `bloomClamp`, Blickpunkt `stadt-sonne`, Regler `variantWeights`; Rauchprobe-Bild bei jeder Optik-Änderung ansehen | Werkzeug/Ablauf |
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
| 2026-10-07 | 1 | Capture ohne gespeicherte Szene schrieb `Captures/.png`; Web-Server und MCP wollten Port 8080; Rauchprobe hielt Unitys abgebrochenen Brotli-Stream für einen Fehler | Fallback-Name in `Capture.FromMenu`; `serve-web.mjs` auf 8090; Filter `ERR_ABORTED` auf `*.unityweb` in `smoke.mjs` | Werkzeug |
| 2026-10-07 | 1 | Editor per AppleScript schließen griff nicht; Unity-MCP verbindet sich nicht in eine laufende Sitzung; Batch-PlayMode rendert nicht (Zähler 0) | Skill `unity-verify`, „Bekannte Fallen" | Skill |
| 2026-10-07 | 0 | Prototyp: 48 000 Tokens Anleitung bei jedem Start, zwölf parallele Agent-Zweige, Doku gegen Code widersprüchlich | `CLAUDE.md` ≤ 150 Zeilen, Lehren nur hier; Regel 13 ein Agent zur Zeit; Phasen-Tor Schritt 5 Doku-gegen-Code | Regel |
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

Arten: **Test** (automatisch geprüft) · **Werkzeug** (Skript übernimmt den
Schritt) · **Skill** (Ablauf angepasst) · **Regel** (CLAUDE.md) · **Ablauf**
(Phasen-Tor / Sitzungsablauf).
