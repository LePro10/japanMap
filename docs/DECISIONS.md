# Entscheidungen

> Eine Zeile Entscheidung, ein paar Zeilen Warum, verworfene Alternativen.
> Neue Entscheidungen unten anhängen. Wird eine Entscheidung umgeworfen: nicht
> löschen, sondern als **ersetzt durch Dxx** markieren.

## D01 — Engine: Unity 6 (URP) statt Three.js · 2026-10-07

**Warum:** Der Prototyp (≈ 95 000 Zeilen TypeScript in 10 Wochen) hat rund ein
Drittel seines Codes in Dinge gesteckt, die eine Engine mitbringt — Physik und
Kollision (≈ 8 200 Zeilen, Quelle der meisten Bugs), Renderweg, Shader,
Vegetations-Streaming, Kamera, Debug-Werkzeuge. Ein Probelauf (ein Agent, eine
Sitzung, Unity-MCP + Blender-MCP) hat in kurzer Zeit eine stimmige Szene mit
eigenen Assets und Menü gebaut. Unity bringt außerdem Asset Store, NavMesh,
Splines, Cinemachine, Terrain, ein offizielles CrazyGames-SDK.

**Verworfen:**
- *Three.js weiter (aufgeräumt, + Rapier/Jolt):* kleinster Download, schnellste
  Schleife — aber das Eigenbau-Muster bleibt, und Optik hängt an selbst
  gebauten Systemen.
- *Babylon.js:* Web-nativ mit Havok-Physik, aber kein vollwertiger Editor,
  kein Asset Store, keine Gelände-/Straßenwerkzeuge.
- *Godot:* im Web nur der einfache Renderer, kein C# im Web, großer Grunddownload.
- *Unreal:* kein Web-Export.
- *PlayCanvas:* Web-nativ mit offiziellem MCP, aber schwache Physik, Projekt im Cloud-Editor.

**Preis, bewusst akzeptiert:** größerer Download (Handy-Startseite ≤ 20 MB wird
Arbeit, siehe D04), langsamere Schleife (Kompilieren, Web-Build in Minuten),
iOS-Risiko (CrazyGames schaltet Unity-Spiele auf iOS zunächst ab).

## D02 — Plattform: Browser zuerst (CrazyGames), Steam später optional · 2026-10-07

**Warum:** Spieler kommen über die Plattform, ohne Marketing; Einnahmen über
Werbung (60 % Anteil). Auf Steam konkurriert ein Japan-Open-World-Fahrspiel
direkt mit *Forza Horizon 6* (Japan, seit 19.05.2026), *Tokyo Xtreme Racer* und
*JDM: Japanese Drift Master*; der Median-Umsatz eines Indie-Spiels dort ist
gering. Unity kann später ohne Neubau auch für Desktop bauen.

## D03 — Unity-Projekt liegt im Repo-Wurzelordner, Prototyp unter `legacy/threejs/` · 2026-10-07

**Warum:** Ein Repo, ein Pull. Agenten finden die Unity-Standardstruktur dort,
wo sie sie erwarten. Der Prototyp bleibt lesbar (Verhalten, Zahlen, Lagen) und
lauffähig (für den GLB-Export der Orte), bis er nicht mehr gebraucht wird.
Seine 48 000-Token-`CLAUDE.md` heißt dort `WORKFLOW-LEGACY.md`, damit sie
nicht automatisch geladen wird.

## D04 — Startdownload über Addressables klein halten · 2026-10-07

**Warum:** CrazyGames misst den Startdownload bis zum ersten `gameplayStart`.
Für die Handy-Startseite gilt ≤ 20 MB. Darum von Anfang an: kleiner Boot,
Startgebiet zuerst, Rest der Welt im Hintergrund nachladen. Das muss die
Architektur ab Phase 1 erlauben, nicht erst in Phase 10.

## D05 — Oberfläche mit UI Toolkit · 2026-10-07

**Warum:** UXML/USS sind Textdateien nach dem Vorbild von HTML/CSS — für einen
Agenten lesbar, änderbar und vergleichbar, anders als uGUI-Prefabs mit
Objekthierarchien im Szenen-YAML. Der Prototyp hatte seine Oberfläche bereits
in DOM/CSS. *Prüfen in Phase 1/9:* Leistung und Touch auf dem Handy im Web.

## D06 — Sprache: Code Englisch, Doku Deutsch, Spiel Englisch · 2026-10-07

**Warum:** Unity-Ökosystem, Asset Store und Trainingsdaten sind Englisch; der
Eigentümer liest Deutsch; das Publikum ist international.

## D07 — Binärdateien über Git LFS · 2026-10-07

**Warum:** Modelle, Texturen, Ton und `.blend`-Dateien blähen Git sonst auf.
Regeln in `.gitattributes`, nur für `Assets/` und `ArtSource/` (der Prototyp
bleibt unberührt). **Achtung Kontingent:** GitHub-LFS hat ein Speicher- und
Bandbreitenlimit — Größe von `Assets/` im Blick behalten, Rohquellen > 50 MB
nicht einchecken.

## D08 — Agenten verbessern ihren Arbeitsablauf selbst · 2026-10-07

**Warum:** Der Prototyp hat Fehlerlehren als Geschichten in einer immer
längeren `CLAUDE.md` gesammelt (am Ende 48 000 Tokens, bei jedem Start
geladen) — Wissen, das niemand mehr lesen konnte. Neu: jede Lehre wird zu einer
**Vorkehrung** (Test > Werkzeug > Skill > Regel), mit einer Zeile in
`docs/LESSONS.md`; `CLAUDE.md` hat ein festes Budget von 150 Zeilen.

## D09 — Pakete in Phase 1 · 2026-10-07

Jedes Paket mit einem Satz Begründung. Neues Paket = neue Zeile hier.

| Paket | Version | Warum |
|---|---|---|
| URP | 17.6.0 | Renderweg für Web und Handy; Qualitätsstufen als URP-Assets |
| Input System | 1.20.1 | Tastatur, Gamepad und Touch über einen Weg; altes Input ist abgeschaltet |
| Cinemachine | 3.1.7 | Verfolger- und Fotokamera ohne Eigenbau (Phase 3/9) |
| Splines | 2.9.1 | Straßen aus `roads.json` als Splines (Phase 2) |
| AI Navigation | 2.0.15 | NavMesh für Fußgänger und Verkehr (Phase 6) |
| Addressables | 4.1.1 | Welt nachladen statt im Startpaket (D04) |
| Test Framework | 1.8.0 | EditMode-/PlayMode-Tests für `Tools/verify` |
| MCP for Unity (CoplayDev) | Git `main` | Agent steuert den offenen Editor; Stand im `packages-lock.json` festgehalten |
| Rider / Visual Studio | — | nur Editor, kostet im Build nichts |

**Entfernt** aus der URP-Vorlage: Visual Scripting, Collab, Timeline und die
Module XR, Tilemap, 2D-Physik, Cloth, Video, Vector Graphics, Adaptive
Performance, Android JNI, Analytics. Was ein Paket davon wieder braucht, holt
der Paketmanager als Abhängigkeit nach.

## D10 — Domain Reload beim Play aus · 2026-10-07

**Warum:** gemessen mit `node Tools/measure-loop.mjs`: Play-Eintritt 1,17 / 1,19 s
mit Domain Reload, 0,11 / 0,07 s ohne. **Preis:** statische Felder überleben
zwischen zwei Play-Sitzungen. Jede Klasse mit statischem Zustand setzt ihn in
einer `[RuntimeInitializeOnLoadMethod(SubsystemRegistration)]`-Methode zurück
(Vorbild: `Bootstrapper.ResetStatics`).

## D11 — Agenten-Werkzeuge in Node, Logik in C# · 2026-10-07

**Warum:** Die Werkzeuge unter `Tools/` müssen auf macOS und Windows laufen
(das Projekt hat schon einmal den Rechner gewechselt); Node ≥ 22 ist ohnehin
da. Was Unity-Wissen braucht (Bild rendern, bauen, Einstellungen), steckt in
Editor-Skripten unter `Assets/_Project/Editor/` und ist damit auch über den MCP
und das Menü erreichbar — die Node-Skripte starten nur, warten und fassen das
Ergebnis in einer Zeile zusammen.

## D12 — Entwickler-Overlay mit IMGUI, nicht UI Toolkit · 2026-10-07

**Warum:** Das F1-Overlay (`StatsOverlay`) existiert nur im Editor und in
Development-Builds; IMGUI braucht dafür kein Asset und keine Panel-Settings.
D05 (UI Toolkit) gilt für alles, was ein Spieler sieht.

## D13 — Alle Assets selbst in Blender bauen, kein Kauf · 2026-10-07

**Warum:** Wunsch des Eigentümers; ein einheitlicher eigener Stil statt
gemischter Fremd-Packs. Die gesichteten Packs lagen entweder zu Low-Poly
(*POLY Japan*) oder zu realistisch und für den Browser zu schwer (*Japanese
City*, 5,5 GB). **Folge:** Die Asset-Produktion ist der größte Arbeitsblock
des Projekts. Deshalb beginnt sie früh und parallel (PLAN.md „Asset-Sprint"),
mit einem Stil-Kit vor der Massenproduktion. Ausnahme bleiben freie
Texturen (Poly Haven, CC0) für Gelände und Materialien.

## D14 — Terrain als eine Kachel (3 km, 2049²), GPU-Instancing an · 2026-10-07

**Warum:** gemessen mit `ViewpointBench` an sechs Blickpunkten (Editor, M4, Stufe Hoch):
Draw Calls 43–59 bei 1 Kachel, 43–105 bei 2 × 2, 63–198 bei 4 × 4; Dreiecke in
allen Fällen gleich (100 k–1,3 M). Kacheln brächten nur Streaming, und die
Höhendaten sind 8 MB. Ohne Instancing 200–2 550 Draw Calls → Instancing bleibt an
(im Web-Build geprüft: sichtbar, 0 Fehler). `pixelError` 5; 10 halbiert die
Dreiecke (57–587 k) → Kandidat für die Stufe Niedrig (Phase 10).
Regler: `Data/Map/MapImportSettings.asset`.

## D15 — Fahrphysik: Rigidbody + Raycast-Federung + portiertes Arcade-Modell · 2026-10-07

**Entscheidung:** PhysX-Rigidbody mit vier Raycast-Federn trägt das Auto, PhysX
macht alle Kollisionen. Die waagerechte Fahrdynamik ist das Arcade-Modell des
Prototyps (`arcadeDynamics.ts`), nach C# portiert (`Scripts/Vehicles/ArcadeDynamics.cs`,
ohne Unity-Abhängigkeit). Es liefert Beschleunigungen und die Gierrate; der
Controller setzt sie als Kraft bzw. Drehgeschwindigkeit um und liest die Gierrate
vor jedem Schritt vom Körper zurück (so drehen Wandstöße das Auto). Die ~8 000
Zeilen Eigenbau-Kollision des Prototyps entfallen.

**Gemessen** (Hachi 86 = Kite-S-Zahlen, gleiche Proben, `Captures/`):

| | Prototyp | Raycast + Arcade | WheelCollider, gleiche Kräfte |
|---|---|---|---|
| 0–100 km/h | 7,18 s | 7,20 s | 10,66 s (Radschlupf) |
| Bremsweg 100→0 | 37,9 m | 37,9 m | 59,7 m |
| Lenkantwort 90 km/h (0,2 / 1,0) | 4,3 / 21,7 °/s | 4,3 / 21,6 °/s | 37,3 / 19,2 °/s, 50° Schwimmwinkel bei 0,2 = Dreher |
| Handbremsdrift 80 km/h | 42° Spitze, fängt in 0,3 s | 42° / 0,3 s | 160° = Dreher |

Alle zehn Autos treffen die Prototyp-Zahlen auf ~1 % (Ausnahme Hang: ~5 %
langsamer, weil PhysX die volle Hangabtriebskraft `g·sin θ` rechnet, der
Prototyp `g·sin θ·cos θ`).

**Verworfen:**
- *WheelCollider:* eigenes Reifenmodell (Schlupfkurven), das gegen das
  Arcade-Gefühl arbeitet — um es wiederzuerkennen, müsste man seine Reibung
  abschalten und die Kräfte selbst setzen; dann bleibt nur ein teurer Raycast.
  Braucht zusätzlich das Modul `com.unity.modules.vehicles`.
- *Asset-Store-Paket* (NWH, Edy's): kostet, eigenes Fahrgefühl statt des
  wiedererkennbaren; kein Kauf ohne Zustimmung.

**Nachgemessen in der Abnahmefahrt (2026-10-08):** Kollisionsmodus
`ContinuousDynamic` mit Kontaktabstand 0,25 m an der Karosserie. `Speculative`
erzeugte Geisterkontakte an Fahrbahn-Dreieckskanten (Senke auf dem Ring:
118 → 40 km/h), `ContinuousDynamic` allein ließ die Karosserie bei 6 m Fall
9 cm in den Boden. Dazu die Luft-Lageregel des Prototyps (Nicken/Rollen folgen
im Flug dem Boden darunter), sonst landet das Auto nach Kuppen mit der Nase.

**Preis:** Räder sind keine Collider (seitlich können Reifen in eine Wand
ragen); Schräglage/Nicken der Karosserie ist Optik (wie im Prototyp), der
physikalische Schwerpunkt liegt tiefer (`ArcadeTuning.physicsComHeightShare`),
damit das Auto nicht kippt.

## D16 — Zehn Car-Lab-Modelle, Fahrwerte aus der Spiel-Flotte des Prototyps · 2026-10-07

Der Prototyp hat zwei Flotten: die gefahrenen Datensätze (`vehicles.config.ts`,
Kite S … Needle 01, gemessen und abgestimmt) und die zehn neuen Car-Lab-Modelle
(Mame K … Hanami SF-26), die der Eigentümer als echte Autos wollte (legacy
TODO.md). **Zuordnung nach Rolle:** Mame K ← Pip 650, Hachi 86 ← Kite S,
Mini Hauler ← Skiff Mini, Yama Cruiser ← Cairn 4, Kumo STi ← Torrent R,
Kaze 35 Drift ← Ribbon R, Raiden GT-R34 ← Meridian GT, Suprema RZ ← Morrow 8,
Rotor FD ← Ember RS, Hanami SF-26 ← Needle 01. Fahrwerte, Masse und Leistung
kommen aus dem Datensatz (die Prüfstandszahlen sind der Maßstab), Aussehen und
Name vom Modell. Die PS-/kg-Angaben im Car-Lab-Datenblatt sind damit nur
Anzeige und werden in Phase 8 (Händler) angeglichen.
Startauto vorerst **Hachi 86** (im Prototyp war Kite S das Startauto).
Saat: Menü `JapanMap/Vehicles/Seed Fleet From Legacy` → `Data/Vehicles/*.asset`.

## D17 — Gelände unter Straßen absenken, überlappende Straßenenden kürzen · 2026-10-08

**Warum:** Die Phase-3-Abnahmefahrt blieb am Ring hängen. Gemessen: an 800
Spurpunkten auf 32 Straßen lag das Gelände (1,5-m-Raster) über der Fahrbahn,
am Ring an einer Felswand 4 m; 5 Straßenenden lagen als Rampe/Platte auf
anderen Straßen (bellwood-edge 70 m auf dem Ring, bis 3,4 m höher; die
Boxengassen-Einfahrt mit 0,3-m-Kante auf Karosseriehöhe). **Lösung:** Der
Gelände-Import senkt das Gelände unter Fahrbahn + Bankett auf 3 cm unter die
Mittellinie (45°-Böschung zurück, `MapImportSettings` „Terrain under roads“);
der Straßen-Import kürzt Enden, die auf einer anderen Straße entlanglaufen oder
sie in anderer Höhe (> 0,1 m) überdecken — außer unter einer Hochstraße. Ob
eine Straße Hochstraße ist, entscheidet das **Rohgelände**, nicht das
abgesenkte. Kleine Kartenkorrektur nach Regel 15 (Strecken bleiben, nur kaputte
Stellen weg). **Offen (Phase 5):** Höhenstufen an Kreuzungen (Stadtstraßen
treffen sich mit 0,1–2,5 m Unterschied) und 460 scharfe Kuppen-Knicke
(+7 % → −7 % auf 2 m).

## D18 — Vegetation: eigener Instanz-Renderer, vorläufige Bäume aus dem Editor · 2026-10-08

**Warum nicht Unitys Gelände-Bäume:** gemessen mit 77 000 Bäumen/Büschen
(LODGroup-Prefabs als Terrain-Trees): bis **44 500 Draw Calls und 30 Mio.
Dreiecke** je Bild (Budget Hoch 1 500 / 3 Mio.) — Unity zeichnet sie mit
URP einzeln. GPU Resident Drawer würde bündeln, läuft aber nicht unter
WebGL2. **Lösung:** `World/VegetationRenderer` — Bäume in 64-m-Feldern,
Sichtkegel je Feld, LOD je Baum nach Entfernung (× `lodBias` der Stufe),
je Baumart und LOD-Stufe ein `Graphics.RenderMeshInstanced` (Unity-API, geht
in WebGL2). Kollision nur für Stämme in Spielernähe (Kapsel-Pool). So
streute auch der Prototyp (`InstancedLOD`). Gras und Reis bleiben im
Terrain-Detail-System (instanziert, Dichte/Weite je Stufe).

**Fernstufe statt Billboard:** LOD2 ist ein Körper mit 20–90 Dreiecken.
Billboards bräuchten gerenderte Bildatlanten und Alpha — erst prüfen, wenn
die Dreiecke auf Niedrig nicht reichen.

**Vorläufige Modelle:** Bäume sind Aufgabe 4 des Asset-Sprints (noch nicht
dran). Bis dahin baut `Editor/Vegetation/TreeBuilder` einfache Zeder,
Ahorn, Kirsche, Bambus, Busch, Gras, Reis (Palette statt Atlas). Platzierung,
Dichte, LOD und Leistung hängen nicht am Modell; die Sprint-Bäume ersetzen
nur die Meshes (`VegetationData.prototypes`).

**Kleine Änderungen nach Regel 15:** Abstand zur Straße vom Fahrbahnrand
statt von der Mitte gemessen (wächst mit der Breite, wie Prototyp P8.7);
einige Kirschen und Bambushaine in tiefen Wiesen (im Prototyp nur in
Städten). Laubbäume meist grün, 10 % Herbstfarben als Akzent.

## D19 — Orte aus den Layout-Daten des Prototyps, gebaut aus der Bibliothek · 2026-10-08

**Weg:** `Tools/export-places.mjs` führt die Layout-Module des Prototyps
(`sakuraLobby.ts`, `koedoLayout.ts`, `kisoLayout.ts`, …) unverändert in einer
privaten Kopie aus und schreibt je Ort `SourceData/legacy/places/<ort>.json`
(Art, Lage, Drehung, Grundfläche, Bäume, Freiflächen, Start). In Unity ordnet
je Ort ein `PlaceKit` (`Data/Places/*.asset`) jeder Art Bibliotheksmodelle zu;
`Editor/Places/PlaceImporter` setzt sie unter `World/Places`. Kein
GLB-Blockout (PLAN Aufgabe 1): Gebäude sind im Prototyp zu einem Mesh
verschmolzen, ein GLB hätte keine Einzelhäuser und keine Arten. Die
Layout-Daten haben beides.

**Boden:** Unter Gebäuden wird das Gelände auf den Mittelwert der Grundfläche
eingeebnet und über 4 m zurückgeblendet (`PlaceGround`, Teil des
Terrain-Imports wie das Absenken unter Straßen). Höfe bekommen die
Gelände-Schicht „Sand“ als Kies (Unity-Terrain-Layer, kein eigenes Mesh).

**Vegetation:** Orte räumen Bäume frei (Kollider + Freiflächen des
Prototyps) und bringen ihre gesetzten Bäume (Kirschring der Commons usw.) als
Instanzen im selben Renderer mit — neue Baummodelle ersetzen sie mit (D18).

**Fehlende Modelle** werden nicht nachgebaut, sondern gemeldet
(Import-Bericht → STATUS „Für die Asset-Sitzung"). Stellvertreter aus der
Bibliothek nur, wo sie das Bild nicht verfälschen.

**Start (Regel 15, wie im Prototyp):** Das Spiel beginnt wieder in Sakura
Commons (Auto 4 m nördlich des Startpunkts, Blick nach Osten zur Ausfahrt),
nicht mehr auf der Stadtstraße. `PlayerCarSpawner.snapToRoad` aus, sonst
spränge das Auto auf die nächste Straße.

## D20 — Große Orte instanziert: Tokyo aus Fassadenmodulen, Hüllen in der Ferne · 2026-10-08

**Warum:** Tokyo hat im Prototyp 2 583 Häuser + 102 Vorstadthäuser (`generateTokyo`,
`generateSuburbs`, unverändert ausgeführt). Mit Fassadenmodulen sind das 3 321
Modelle — als GameObjects tausende Draw Calls. Der Prototyp verschmolz je
160-m-Kachel; verschmolzene Meshes würden hier den Download sprengen (jedes Haus
eine Kopie). **Lösung:** derselbe Instanz-Renderer wie die Bäume (D18), jetzt
`InstanceRenderer` mit `InstanceData` (Bäume: `VegetationData`, Orte:
`PlaceInstanceData` mit voller Matrix). Ganz Tokyo: 39 Prototypen, ≈ 60 Aufrufe.
Kollision: ein Box-Kollider je Prototyp-Haus (seine eigene Grundfläche/Höhe).

**Fassaden füllen:** Ein Haus des Prototyps (bis 54 m Front) wird mit gleich
breiten Modulen gefüllt; Modelle nach Höhe (± 25 %) und Breite (± 35 %)
gewählt und genau auf das Maß gestreckt; die Front sitzt auf der Baulinie,
überschüssige Tiefe geht nach hinten. Fassadenfamilie → Modelle im `PlaceKit`.

**Kosten über die Entfernung, nicht die Anzahl:** LOD0 bis 40 % der
Bibliotheks-Schwelle, ab 150 m (× lodBias) eine **Hülle** (Quader, 10
Dreiecke, Fensterraster mit jedem dritten Fenster beleuchtet — wie die „Hülle"
des Prototyps). Schatten wirft nur LOD0-Nähe und das mit dem LOD1-Mesh
(Instanz-Aufrufe werden nicht je Kaskade aussortiert). Sichtweite je Stufe in
`TerrainQuality.buildingDistance` (Hoch 2 500, Mittel 1 200, Niedrig 450 m).
Gemessen: Tokyo-Dreiecke an `stadt-neon` Hoch 12,9 M → 3,1 M, Niedrig ≤ 545 k.

**Nebenbefund (Regel 7):** `RoadNetwork` trug für jede Straße die Typbreite
(Stadt 8 m), echte Breiten 5–24 m. Absenken, Freiräumen und Prüfungen nutzen
jetzt die eigene Breite; dabei fiel auf, dass Straßenenden nicht weit genug
abgesenkt waren (bis 0,39 m Gelände über dem Asphalt).

## D21 — Orte bringen ihre eigenen Straßen mit (Damm und Einschnitt) · 2026-10-08

Der Prototyp baute einige Straßen im Ort selbst (Funaura: Straße von Stillwater
herunter; Mill Lane) — sie fehlen in `roads.json`, Funaura war ohne Zufahrt.
Orte exportieren sie als Kontrollpunkte (`roads` im Orts-JSON);
`Places/PlaceRoads` macht daraus normale Straßen für den Straßen-Import
(Mesh, Netz, Respawn): Höhe = Gelände über ± 20 m geglättet, höchstens 11 %
Steigung (wie der Prototyp), Ende auf fester Höhe (Kai 1,8 m). Weil sie nicht
im gebackenen Gelände eingeschnitten sind, **schüttet das Absenken unter ihnen
auch auf** (Damm, 45°-Böschung). Die gebackenen Straßen bleiben unberührt.

## D22 — Zu Fuß: CharacterController + Cinemachine, Gangart aus dem Prototyp · 2026-10-08

Körper ist Unitys **CharacterController** (Kollision, Stufen 0,38 m, Hang 57°), nicht
ein Rigidbody: eine Figur soll nicht kippen oder von Autos geschubst rutschen, und der
Controller bringt Stufen und Hanggrenze mit. Darauf liegt die Gangart aus `Walker.ts`
(Beschleunigung, Coyote-Sprung, Rutschen mit Schwung und Hang) — eigener Code, weil Unity
keine Rutsch-Bewegung hat; Zahlen in `Data/OnFoot/WalkerSettings.asset`. Kamera ist
Cinemachine **ThirdPersonFollow** (Arm, Dämpfung, Wand-Ausweichen); unser Rig dreht nur den
Drehpunkt. Abweichungen vom Prototyp (Regel 15): **Rutschen auf C** statt Strg (Strg+W
schließt im Browser den Tab); **Auto rufen** parkt ohne Straße in Reichweite auf ebenem,
trockenem, freiem Boden statt „kein Platz"; Gamepad: B = Ein/Aus, Steuerkreuz ↓ = Rufen.
Das Modul **Gameplay** darf `Vehicles` und `OnFoot` kennen (es verbindet beide); die
Physik-Ebenen stehen zentral in `Core/GameLayers` (Walker, Pedestrian, Debris sind nie
Boden für Räder und Kameras). Figur vorerst aus Grundformen (`StandInFigure`, vorläufig).

## D23 — Fußgänger: Unity-NavMesh je Ort, Fahrbahn exakt ausgeschnitten · 2026-10-08

Fußgänger sind **NavMeshAgents** (AI Navigation) statt der Bordstein-Schleifen des Prototyps:
sie gehen auf Gehwegen, Plätzen, im Commons-Hof und auf Dorfgrund und weichen einander aus.
Gebacken wird je Ort ein `NavMeshSurface` (Volumen = Ort + 25 m, Tokyo = Stadtplatte) aus den
Physik-Kollidern; Straßen-Meshes, Wasser und Tokyo-Hausdächer sind *Not Walkable*, dazu je
Straßenstück eine Modifier-Box mit genau der Fahrbahnbreite des Straßennetzes — sonst war Gelände,
das durch eine Straße ragt (commons-drive), begehbar. Die Abnahme prüft gegen dieselbe Definition
(`RoadNetwork.CarriagewayAt`). Das Backen ist letzter Schritt von „Map/Import All". Kosten: +1,6 MB
Download. Die Leute erscheinen wie im Prototyp nur um den Spieler (35–110 m, weg ab 160 m).
Rückstoß = Unity-Rigidbody mit Wurfimpuls (Prototyp-Zahlen), Auto verliert 5 %.
Stellvertreter-Figur als **ein Skinned Mesh** mit Farbpalette: 6 Einzelteile kosteten ~550 Draw Calls
für 48 Leute, jetzt ~40; Schatten nur bis 30 m. Tokyo-Kollider bleiben vorerst GameObjects: das
Backen braucht sie ohnehin, die Szene ist dadurch nicht gewachsen.

## D24 — Zerstörbares: Namensliste, statische Kollider, Bruchstücke als Rigidbodies · 2026-10-09

Was zerbricht, steht als Liste von Modellnamen in `Data/Life/BreakableSettings.asset` (Pfosten/Laternen,
Automaten, Gestelle/Zäune/Bänke, Schuppen/Fischerhütten); `SmashSystem` hängt beim Start an jedes passende
Objekt ein `Breakable` (1 175 Stück, 32 ms einmalig) — nichts wird in die Szene geschrieben. Der Treffer
kommt über Unitys Kollisionsmeldung des statischen Kolliders; Bruch nur, wenn Tempo *in die Fläche* und
Energie reichen (Prototyp `shouldBreak`, höchstens 2 je Schritt). Weil der Kollider das Auto in diesem
Schritt schon gebremst hat, bekommt es seine Geschwindigkeit vom Schrittanfang zurück, minus Prototyp-
Verlust. Tokyo-Stücke sind instanziert: ihre Instanzen werden ausgeblendet (1:1 je Kollider geprüft).
Bruchstücke: Pool von 64 Unity-Rigidbodies auf der Debris-Ebene, kollidieren nicht mit Autos/Leuten
(Prototyp: „kein neues Hindernis“), 7,5 s, dann versinken; das Objekt kommt nach 20 s außer Reichweite
(120 m) zurück. **Nur das Spielerauto** zerbricht etwas — NPC-Autos räumten sonst an Ecken die Stadt ab.
**Bäume** zerbrechen seit D25 (Pool-Kollider melden den Treffer). Vorläufig:
Bruchstücke sind Kästen in Artfarbe (vorzerlegte Meshes fehlen).

## D25 — Asset-Sprint 5b/5c, Flora, Scatter eingebaut; Türme nach Höhe, echte Fernstufe · 2026-10-09

Freigegeben (Mensch): 5b `Machi`, 5c `Koso`, dazu `Flora`/`Scatter` („entscheide du“). Eingebaut: Sakura
Autohaus + Werkstatt, Koedo Brauerei + moderne Häuser, Funaura Kei-Trucks, Tokyo **Türme** (Regel `minHeight 40`
je Fassaden-Familie: f3 Wohnen → Mansion, f5 Hotel → Hoteltürme, f4 Kino → Büro, sonst gemischt/Büro;
`fitFootprint` dehnt die Grundfläche um höchstens ±40 %, passt kein Turm, bleibt die Häuserzeile), Kino/Hotel-
Fronten, Izakaya (f2 Holz), Fertighäuser in den Vororten; der ganze Wald aus echten Bäumen, Orts-Bäume (Weide,
Kaki, Gartenkiefer, Shinboku) mit eigenem Modell; Leitpfosten, Tetrapoden, Gewächshäuser, Betonmauern, Nobori,
Jizō, Friedhof. Die **Markthalle** steht nicht in der allgemeinen Ladenliste (sie kam ~120-mal) — sie braucht
einen eigenen Ort. Zwei Fehler des Bibliotheks-Imports behoben: `_LOD2` wurde *in* LOD0 gezeichnet (Wald 20–45 M
Dreiecke statt 2,7–7 M), Flora war deckend statt Cutout. Bäume zerbrechen jetzt auch (Prototyp-Schwellen).

## D26 — Drift-Wertung nach ASTRA §5, eigener Code; Driftzonen Sakura Bowl + Rotor Court · 2026-10-09

Drift-Kette nach ASTRA §5 statt der Prototyp-Formel: 100 Punkte/s bei 30 km/h und 20°, Tempo bis 2× (100 km/h),
Winkel bis 1,5× (50°), über 70° kein Drift. Multiplikator in **Stufen nach Driftzeit 6/18/42/90 s** (Abstände
verdoppeln sich — der Wunsch aus TODO.md: ×5 ist ein langer Lauf), gilt nur für neu verdiente Punkte. 3 s
Verbindungszeit, Richtungswechsel +150, Crash (≥ 10 km/h Verlust, gemessen über 0,1 s) bucht 50 %, Streifen
kürzt die Verbindungszeit auf 0,5 s. Sparks: 100 Punkte = 1, höchstens 400 je 90 s. **Eigener Code**, weil Unity
dafür nichts hat (reine Spielregel). Zonen: Sakura Bowl (Prototyp, Kirschring) und **Rotor Court** an der offenen
Sternkreuzung westlich von Tokyo (ASTRA-Name; ersetzt die Harbour Pan des Prototyps, eine Hangwiese mit 8,5 m
Höhenunterschied). Anzeige vorläufig bis Phase 9; Sparks werden ab Phase 8 gespeichert.

## D27 — Schanzen als erzeugte Körper mit Fundament; Plätze per Suche; Stunt-Wertung · 2026-10-09

Die sechs Schanzen aus ASTRA §4 werden aus Daten (`Data/Gameplay/Ramps.asset`) als **ein starrer Körper**
gebaut (`RampBuilder`): gerade Grundlinie, an das Gelände angepasst (höchstens 5 % Neigung), Seitenwände bis
0,6 m unter den tiefsten Boden, dazu Landefläche und weiße Pfeile. Keine Geländeauflage (Lehre aus dem Prototyp).
**Eigener Code statt ProBuilder**, weil die Form aus Zahlen kommt und bei jeder Änderung gleich neu entstehen
soll. Die ASTRA-Plätze lagen auf dem Ring, im Reisfeld oder am Hang. Eine Suche (eben, frei, 40 m Anlauf, Straße
in der Nähe) hat sie um 25–206 m versetzt; Begründung je Schanze in den Daten. Vegetation wird entlang
Anlauf und Schanze ausgespart. Stunt-Wertung nach ASTRA §5 (Boden-180/360 nur im Stunt-Modus, Luft-360 +800,
saubere Landung, Wiederholung 50 %), dazu **eigene Sprungpunkte (10 je Meter)**, damit ein einfacher Sprung
etwas bringt. Prüfung: alle sechs Schanzen im PlayMode angefahren, 12–25 m Sprungweite.

## D28 — Rennen: Strecken aus ganzen Straßen, KI = `PathFollower`, Fortschritt über Bogenlänge · 2026-10-09

Acht Veranstaltungen (`Data/Gameplay/RaceEvents.asset`): die sechs des Prototyps (Coast Loop, Tōge Descent/
Climb, Neon Circuit, Ring Time Trial, Tōge Drift Run) und aus dem ASTRA-Katalog Needle Sprint und Open Seat
(Leihwagen Hanami). Weitere ASTRA-Veranstaltungen brauchen Straßen, die nicht gebaut sind (Harbour Outer Road,
Crosslight, Terrace Track, Breakyard); Coast Loop bleibt deshalb auf dem Ring. Fortschritt = Summe vorzeichen-
behafteter Schritte auf der Strecke (nie Differenz zweier Lagen), Kontrollpunkte als Kreise in Reihenfolge,
eine Runde zählt erst an der Linie und nach allen Punkten (`RaceProgress`, Tests an der Naht). **Eigener Code**:
Unity bietet keine Rennlogik; KI-Fahrer ist der vorhandene `PathFollower` (Phase 3) mit Spurversatz je Fahrer
(skaliert mit der Straßenbreite), Abstandhalten, Untersteuer-Gedächtnis und Zurücksetzen statt Teleport.
Keine versteckte Beschleunigung (ASTRA). Countdown hält jedes Auto (`VehicleController.HoldStill`); Verkehr ist
während des Rennens aus. Auszahlung nach ASTRA §8 (Platz 100/65/35/0 %, Medaillen), Sparks erst ab Phase 8
gespeichert. Abnahme: alle 8 KI gegen KI, 0 Rettungen, 0 Zurücksetzen, Runden auf ±2 m an der Linie.

## D29 — Wirtschaft simuliert: Rennen zahlen nach Dauer, Drift 50:1, Mame K kaufbar · 2026-10-09

**Warum:** Die Simulation (`EconomySim`, Tabelle `docs/ECONOMY.md`) mit den echten Quellen ergab mit den
ASTRA-Zahlen nur 1 743 Sparks je 10 min für Rennfahrer und 1 273 gemischt (Ziel 2 400–3 600). ASTRA rechnet mit
Rennen von 120–150 s; unsere dauern gemessen 62–238 s, dazu kommt die Anfahrt. **Lösung (zwei Regler):**
(1) Rennen zahlen nach Zeit: gewöhnliches Ergebnis = 5,5 Sparks je Sekunde Zyklus (Anfahrt 60 s + Karte 15 s +
Rennen + Ergebnis 10 s), 75 % Grundbetrag, Rest Platz/Medaille (`EconomySettings.eventSparksPerSecond`, Saat
„Economy/Seed Prices And Times“). Jedes Rennen liegt jetzt bei 328–330 Sparks/min, kein Ausreißer.
(2) Drift-Punkte 50 statt 100 je Spark; der Deckel 400 je 90 s bleibt (Driften allein max. 2 667 je 10 min).
Ergebnis: Rennfahrer 3 297, gemischt 2 451, geübter Drifter 2 206 („nähert sich“, wie ASTRA es will).
**Preise wie ASTRA §6** (Zuordnung D16). Ausnahme: Pip 650 war Belohnung von E01 Sakura Starter, das nicht
gebaut ist; bis dahin kostet **Mame K 2 400** und ist nach der ersten Sitzung kaufbar. Test `EconomyTests`
hält Spanne, Ausreißer und die Tabelle aktuell. **Eigener Code:** Unity hat keine Wirtschaftssimulation.

## D30 — Garage an der Open Bay; Tuning nach tuning.config.ts; Optik aus den Car-Lab-Optionen · 2026-10-09

**Garage:** Einfahrtszone vor dem Tor der Open Bay in Sakura (zu Fuß oder < 15 km/h), **E** öffnet. Das Auto
steht dann auf dem Hallenboden, eine Cinemachine-Kamera (Priorität über Fahr-/Laufkamera) zeigt es, Spieler-
Eingaben und Fahr-HUD sind aus (`PlayerModeController.SetSuspended`). Jede Änderung baut das **echte** Spielerauto
über `PlayerCarSpawner.SpawnAt` neu — was in der Halle steht, fährt hinaus. Blatt in UI Toolkit aus Code wie das HUD
(D05), vorläufig bis Phase 9. **Tuning:** `TuningSettings` mit den Faktoren und Preisen aus legacy `tuning.config.ts`
(immer vom Serienwert, nie gestapelt; Motor löst den Luftwiderstand, damit die Spitze genau +2/+4 % steigt).
Prüfstand `TuningBench` misst je Teil allein; Tabelle `docs/TUNING.md`. Gewicht und Karosserie bleiben (ASTRA).
**Optik:** die Modelle haben je 3 Felgen, 3 Aero-Kits und 3 Motorteile (`*_o0..2`, Car-Lab); Felgen 450, Kit 900,
Motorteil folgt der Motorstufe. Lack = ASTRA-Palette (12 Farben, 120 je Auto) als Uni-Lack: die Livery-Textur
weicht einer weißen, getönt per `MaterialPropertyBlock` — kostet keinen Download. Die zwei zusätzlichen Liverys
je Auto aus dem Car-Lab (20 Texturen, mehrere MB) erst mit Nachladen (Phase 10). **Eigener Code:** Unity hat kein
Garagen-/Shop-System; Cinemachine, UI Toolkit und der vorhandene Spawner sind Standard.

## D31 — Speichern: CrazyGames-SDK (nur Laufzeit) + lokaler Rückfall; ein JSON-Stand mit Backup · 2026-10-09

**Standard:** offizielles CrazyGames-Unity-SDK 5.33 (`Assets/ThirdParty/CrazySDK`), Datenmodul `CrazySDK.Data`
(wie PlayerPrefs, 1 MB, Konto-Sync bei CrazyGames). Übernommen nur der Laufzeitteil: ohne Demo und ohne
Editor-Bauwerkzeug (dessen DefineManager schreibt Projekt-Einstellungen); dazu eigene `CrazyGames.SDK.asmdef`
(das Paket hat keine, unsere Module könnten es sonst nicht nutzen). **Ablauf:** `CrazyGamesPlatform` (Boot-System,
`IBootGate`) startet das SDK, der Bootstrapper wartet höchstens 8 s darauf, dann liest `PlayerProgress` den Stand —
bei CrazyGames/localhost aus dem Datenmodul, sonst lokal (PlayerPrefs = IndexedDB). Antwortet das SDK nicht in
6 s: lokal weiter, Hinweis „sync pending“. **Seitensperre:** sie friert das Spiel auf fremden Adressen ein, auch auf
127.0.0.1 und einer WLAN-IP; `127.0.0.1` und `local` (*.local) sind freigegeben (`CrazyGamesSettings`), `serve-web --lan`
nennt die `.local`-Adresse. Auf diesen Testadressen startet das SDK nicht: seine Entwicklungs-Ebene über dem Spiel
ließ den Mausfang der Laufkamera mit Fehlerdialog scheitern. **Format:** ein JSON-Wert (`ProgressStore`), Version,
jeder Wert geprüft (`Sanitize`), letzter guter Stand als Backup, ein kaputter wird beiseitegelegt; Einmal-Belohnungen
über Claim-Ids (nie doppelt nach Neustart). Gespeichert wird nach Kauf, Belohnung, Fund, Parken (eigenes Auto, nicht
Leihwagen) — höchstens einmal je Sekunde; „Weiter“ setzt im gewählten Auto an der letzten Parkstelle fort (ASTRA §2).
Nicht umgesetzt: „Choose progress“ bei Konto-Konflikten (das Datenmodul synchronisiert selbst; Phase 10 mit dem
QA-Tool prüfen). Prüfung: `ProgressStoreTests`, `SaveRestartTests`, im Browser `Tools/save-web.mjs`.

## D32 — Rekorde, Meilensteine, Rekordbilder, Fotomodus; Ring-Ziel je Auto · 2026-10-10

**Rekorde** (`RecordKeeper`, ASTRA §11 + Wunsch „Analytics“ in legacy TODO.md): Höchsttempo (0,5 s gehalten auf dem
Boden), Flugzeit und Sprungweite nur bei sauberer Landung (Stunt-Wertung), längste gebuchte Driftkette, gefahrene
Strecke. Nur das eigene gewählte Auto zählt — Leihwagen (Open Seat) und Menüs nicht (ASTRA §9). 15 Meilensteine je
100 Sparks einmal (Claim-Id). **Rekordbild** 320 × 180 JPEG im eigenen Speicher-Schlüssel (nicht im Fortschritts-JSON,
ASTRA), aufgenommen beim nächsten ruhigen Moment (Auto steht 1 s), nicht im Rekord-Frame. **Rekorde-Blatt** (Tab):
Fahren mit Bildern, Meilensteine, je Veranstaltung beste Medaille und Bestzeit je Auto/Teile, Entdeckungs-Album —
vorläufig, in Phase 9 der Records-Reiter. **Fotomodus** (P): pausiert (timeScale 0), Cinemachine aus, freie Kamera
mit Leine 100 m / 40 m, WASD/QE/rechte Maustaste/Mausrad, Enter = PNG ohne HUD in 2560 px Breite (Handy 1920), im
Browser als Download (`JapanMapDownload.jslib`), Name `japanMap_Ort_Auto_Datum.png`. Touch-Bedienung erst Phase 9.
Produkt-Messungen (ASTRA §11 Analytics für Entwickler) nicht in Phase 8 — brauchen ein Ziel (CrazyGames/Backend).
**Ring-Zeitfahren:** Ziel je Auto = Autopilot-Zeit × 1,1 (`RingBenchmarkReport`, `RaceEventSet.benchByCar`) — wie
bisher beim Hachi (228 → 250 s). **Eigener Code:** Unity hat keine Rekord-/Fotomodus-Bausteine; Kamera, Render-
Texture und Input System sind Standard.

## D33 — Menü und Oberflächen-Maßstab: ein Menü aus Code + USS, CSS-Pixel, ESC-Stapel · 2026-10-10

**Menü** (`GameMenu`, ASTRA §10): sechs Ziele Play, Cars, Map, Records, Photo, Settings; ESC pausiert **alles**
(`timeScale` 0, `AudioListener.pause`, Spieler-Eingaben aus) — die Open Bay (E) öffnet dasselbe Menü auf Cars, aber
ohne Pause, weil sie ein Ort in der Welt ist. Desktop: Leiste links 184 px mit „Continue“ unten; Handy hochkant: Continue
über sechs Reitern unten; **Handy quer: schmale Leiste links** statt Reiterzeile (abweichend von ASTRA: 390 px Höhe
ließen der Seite sonst nur ~130 px). Die vorläufigen Blätter aus Phase 8 sind Seiten: Garage → Cars (Besitz/Autohaus,
Kaufen-Blatt mit Kontostand vorher/nachher, Tune, Appearance, Probefahrt 90 s; außerhalb der Halle erreicht eine
Änderung das Auto, sobald es steht), Rekorde → Records (Driving/Events/Discoveries). **Maßstab:** alle Dokumente teilen
eine Laufzeit-Kopie von `HudPanel.asset` in **CSS-Pixeln** (`UiPanel`: Gerätepixelverhältnis × Desktop-Anpassung ×
UI-Größe 90–130 %), damit ASTRAs Zahlen (48-px-Ziele, 16-px-Text, 112-px-Minikarte) direkt gelten; das Asset bleibt
unverändert. Sichere Ränder per jslib. **ESC-Stapel** (`UiStack`): jede offene Ebene legt ihr Schließen ab, ESC schließt
genau eine. **Standard:** UI Toolkit mit einem USS-Thema (`Data/UI/Game.uss`, über `RuntimeTheme.tss` für alle), Tasten-
Neubelegung mit dem Rebinding des Input Systems, Einstellungen in PlayerPrefs. **Eigener Code:** Unity hat kein
Spielmenü-Gerüst; die Seiten bauen sich aus Code (wie das HUD, D05), Symbole sind Painter2D-Stellvertreter.

## Offen (in der genannten Phase entscheiden)

- **Unity-Version:** 6.6 (wie im Probelauf) oder auf die nächste LTS (6.7) gehen,
  sobald verfügbar (Phase 1 oder 10).
- **Spielname:** Arbeitstitel „japanMap"; der Probelauf schlug „Ameagari" vor.
