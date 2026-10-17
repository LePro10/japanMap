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

## D34 — Ton: Schleifen-Mix statt Synthese, Stellvertreter aus dem Prototyp-Synthesizer, eigene Lautstärkegruppen · 2026-10-10

**Grenzen geprüft (Regel 3, Unity-Handbuch „Audio in Web“):** im Browser nur AudioSource-Grundfunktionen (Lautstärke,
Tonhöhe, Schleife, 3D), AudioMixer **nur Lautstärke**, keine Effekte/Filter, kein `OnAudioFilterRead`, AAC verändert die
ersten 1024 Samples (Knacken am Schleifenpunkt). Darum: **Motor als Schleifen-Mix** (`EngineSound`: je Auto Leerlauf + 4
Drehzahlstufen × Last/Schub, Nachbarstufen überblendet und auf die Drehzahl gestimmt), gespeist vom **Getriebe** (`Gearbox`,
legacy Gearbox.ts, ASTRA-§6-Tabelle; wirkt auf keine Kraft). Tuning hörbar als **Ebenen**, nicht als Transposition (Street:
Ansaug-Ebene eine Oktave höher, Sport: tiefere Last-Ebene, kräftigeres Abblasen). Jede Schleife beginnt mit 1024 Samples
Stille und trägt `smpl`-Schleifenpunkte dahinter (Handbuch-Rezept; im Editor gemessen: Neustart bei der Schleifenmarke).
**Klänge:** keine Aufnahmen vorhanden, keine ungeprüften KI-Töne → **Stellvertreter** offline gerendert aus dem eigenen
Synthesizer des Prototyps (`Tools/legacy-export/render-audio.mts` = legacy src/audio/dsp, `render-shots.mjs` = oneShots.ts
im Headless-Chrome), Name `SFX_STANDIN_*`; eine Aufnahme gleichen Namens in `Art/Audio/` ersetzt ihn ohne Code. **Regler:**
fünf Gruppen + Stumm (`SoundMix`) als eigene Verstärkung je Quelle statt AudioMixer — im Browser könnte der Mixer ohnehin nur
Lautstärke, und sein Asset lässt sich aus Code nicht anlegen. Pause: `AudioListener.pause` (UI-Töne ausgenommen).
**Download:** +1,42 MB (22 kHz, kurze Schleifen); Phase 10 lädt die neun nicht gefahrenen Motorbänke nach.

## D35 — CrazyGames-SDK komplett: Plattform-Schnittstelle in Core, Spielpausen aus dem UI-Stapel, „Choose progress“ selbst · 2026-10-10

**Standard (Regel 3):** CrazyGames-Unity-SDK 5.33 (D31) für alles; eigener Code nur, wo das SDK nichts anbietet.
**Schnittstelle:** `Core.Platform.GamePlatform` (Werbung, gameplayStart/Stop, happytime, Nutzer, Portal-Stumm) — das Spiel
kennt das SDK nicht (Module hängen nur an Core); `Platform.CrazyPortal` setzt sie um, sonst `OfflinePlatform` (Editor:
simulierte Werbung `Fill/Unfilled/Off` für Tests und `play.mjs ads …`; Browser außerhalb CrazyGames: Werbung aus).
**Laden:** `loadingStart/Stop` gibt es für Unity nicht (Doku: „not supported for Unity“, der Unity-Lader ist das Laden).
**gameplayStart/Stop** wird aus dem Zustand abgeleitet statt an jeder Stelle gerufen: Spiel läuft = Welt bereit
(`WorldReady`, PlayerProgress) **und** UI-Stapel leer (Menü, Garage, Fotomodus, Blätter liegen alle darauf) **und**
`timeScale > 0` **und** keine Werbung — eine Regel, die neue Bildschirme automatisch richtig behandelt. **Ton:** Portal-
`muteAudio` (Einstellung + Änderungs-Hörer) und laufende Werbung schalten über `SoundMix` stumm (für Unity-Einreichungen
stummt CrazyGames ohnehin selbst; doppelt schadet nicht). **Werbung (ASTRA §12):** nur Rewarded; Ergebnis-Bonus fest +300 nach
Ereignis ≥ 45 s, Leihwagen 10 min (oder 600 Sparks) erst nach der Probefahrt des Autos; Regeln auf **aktiver Spielzeit**
(`AdPolicy`, Werte in `Data/Gameplay/AdSettings.asset`): erst nach 5 min Spielzeit, höchstens 1 Rewarded je 5 min,
Ergebnis-Bonus 3 je 30 min, Leih-Werbung 1 je 20 min. Kein Angebot auf dem Fahr-HUD; das Ergebnis bleibt stehen, bis
gewählt ist. Keine Werbung = „No ad available“ einmal, nichts gutgeschrieben, nichts abgezogen. **Keine Midgame-Werbung**
(ASTRA erlaubt eine, verlangt sie nicht — vorerst weggelassen, zu wenig Nutzen gegen Absprung-Risiko). Leihwagen:
Wallet eingefroren (auch bei der Probefahrt, ASTRA §9), Warnung 30 s vorher, danach 20 s zum Anhalten, dann bremst das
Auto selbst (`HoldStill`), nie Tausch bei Tempo; ein Ereignis beendet ihn am Ort. **„Choose progress“:** das SDK hat keinen
Konflikt-Dialog (Doku: beim Login wird ein vorhandener Konto-Stand geladen — der Gast-Stand wäre stumm weg). Darum
spiegelt `MirroredStore` jeden Konto-Speicherstand mit Besitzer auf das Gerät (PlayerPrefs); `SaveSync.Reconcile` vergleicht
beim Start und nach Login: Konto leer → Gerät hochladen; beide da, verschieden, Gerät ≥ 1 min Spiel, nicht nur ältere Kopie
desselben Spielers → Blatt mit Autos/Sparks/Spielzeit/Datum, ganze Kopie behalten, die andere als **Wiederherstellung**
(Settings → Progress, umschaltbar). Bis zur Wahl wird nicht gespeichert. Prüfung: `PlatformRulesTests` (5),
`PlatformTests` (3, echter Rennen-/Probefahrt-Weg), Browser `Tools/sdk-web.mjs` (echtes SDK auf localhost). Offen bis
QA-Tool/Live: Werbung im echten Rahmen, Login-Ablauf mit echtem Konto.

## D36 — Start ≤ 20 MB: Addressables für Orte, Welt-Teile und Autos; Gelände als gzip-Datei; Crunch; Shader-Varianten · 2026-10-10

**Gemessen** (Werkzeug `Tools/sdk-web.mjs`: Bytes auf der Leitung bis zum ersten `gameplayStart`, echtes SDK auf localhost):
**58,6 → 18,9 MB** (der alte Größenbericht rechnete MiB als „MB“: 55,9 war 58,6). Schritte, je ein Regler und ein Build:
Autos + 7 Orte als Addressables (44,9) · Crunch für alle eigenen/PolyHaven-Texturen, Qualität 50 (36,7) · URP-Vorlage-
Funktionen aus, die nichts nutzt — Licht-Cookies, Licht-Ebenen, Zusatzlicht-Schatten, LOD-Überblendung, gemessen: 0 von
798 Lichtern, 0 von 1 765 LOD-Gruppen (32,1) · eigene Shader-Regeln für Web: Terrain-Add-Pass (≤ 4 Schichten),
`DOTS_INSTANCING_ON` (kein BRG auf WebGL2), Varianten ohne Nebel (das Spiel hat immer Nebel) (31,2) · Welt-Teile streamen:
Straßenkacheln außerhalb 350 m vom Start, Props, Orts-NavMeshes, Vegetation (23,1) · Gelände als Datei (21,5) · Startauto
streamt auch (20,5) · Boden-Normal-Maps 512 px (18,9). **Ohne Wirkung, trotzdem behalten:** Unity-Splash aus (±0 MB, aber
Sekunden bis Spiel; das Logo blieb bis 2026-10-11 trotzdem drin — erst `showUnityLogo = false` nimmt es raus, −0,04 MB), „Optimize Mesh Data“ (Start ±0, Bündel −1,2 MB). **Warum so:** Unity packt `data.unity3d` für Web
immer mit LZ4 (Doku: Standard für WebGL, nicht abschaltbar), Brotli außen findet darin fast nichts — nur weniger Inhalt
hilft. **Gelände:** 16-bit-Höhen schrumpfen unter LZ4 kaum (8 MB); `TerrainPayload` schreibt Höhen als Rest einer
Ebenen-Vorhersage (Byte-Ebenen), Splat/Gras/Löcher als Differenzen, verlustfrei (Test), gzip 3,9 MB; der Browser entpackt
mit `DecompressionStream` (jslib), ungepackte Kopie für alte Browser. Der Build lässt in Game.unity einen 33²-Platzhalter
derselben Geländedaten (`StreamedTerrainBuild`), `StreamedTerrain` füllt ihn vor allem anderen; Boot wartet darauf
(`IBootGate.Required`, ohne Zeitlimit). **Verworfen:** LZMA-Bündel (Browser: „format 1 not supported“), .NET-`GZipStream`
(bekannter Einfrier-Fehler in Unity-6-Web-Release). **Laufzeit:** `ContentStreamer` lädt nach dem ersten gameplayStart
(oder 8 s Menü) eins nach dem anderen, nächstgelegen zuerst, dann Autos + Motorbänke; ein Auto ohne Modell fährt mit
grauem Platzhalter-Körper (`PendingModel`), Physik unberührt. Lokal mit GPU: alle 58 Szenen 2 s nach dem Start; gesamt
63 MB auf der Leitung, 104 Dateien. Im Editor öffnen die ausgelagerten Szenen mit Game.unity (`PlaceScenesInEditor`),
Werkzeuge/Tests sehen die ganze Welt (`MapScene.Part/Parts`); `MapImport.ImportAll` lagert am Ende neu aus.
**Release-Builds bauen sauber** (Cache übersprang einmal neue Shader-Regeln). Risiko: Wer in den ersten Sekunden auf eine
noch fehlende Straßenkachel fährt, fährt auf dem Gelände darunter — mit gedrosseltem Netz in Phase 11 prüfen.

## D37 — Eigenes Web-Template; Speicher gemessen statt geschätzt; Handy-Texturen (ASTC) erst nach Gerätetest · 2026-10-10

**Template** `Assets/WebGLTemplates/JapanMap` (aus Unitys „Minimal“): Leinwand füllt den Rahmen, nichts markierbar, kein
Langdruck-Menü, kein Scrollen (CrazyGames-Vorgaben), **Pixelverhältnis 1 auf iOS und Handys mit ≤ 4 GB**
(`navigator.deviceMemory`), sonst höchstens 2 (`?dpr=` für Tests), Fehler als Hinweis in der Seite statt `alert()`,
`window.unityInstance` für Messungen (`GetMetricsInfo`). **Speicher** (alles nachgeladen, `sdk-web --stream --mem`):
Hoch 592 MiB WASM-Heap (505 benutzt), Niedrig 493 (441); JS-Heap 50–90 MiB — Budgets 1,5 GB / 768 MB eingehalten.
Chromebook-Profil (CPU ÷4, Niedrig): 4,2 s bis gameplayStart, 60 fps (Mac-GPU; die schwache Chromebook-GPU prüft nur ein
echtes Gerät). **Safari:** WebKit 26.6 (Playwright) lädt, entpackt das Gelände, streamt alles, SDK grün. **Höchstgrenze
WASM** bleibt 2048 MiB (gebraucht ~600). **Handy-Texturen:** Handy-GPUs können kein DXT; Unity entpackt dann in Software
(läuft, mehr Speicher). Unitys Weg wäre ein zweiter Build mit ASTC und eigene Addressables-Bündel je Format — erst wenn ein
echtes Android-Handy (Phase 11) zu viel Speicher oder lange Ladezeit zeigt. iOS schaltet CrazyGames für Unity-Spiele ohnehin
erst nach genug Spielen frei.

## D38 — Qualität automatisch (Erstwahl nach GPU + Messung im Spiel, nur abwärts); WebGPU vorerst nicht; „Hoch zu teuer“ war der Bildschirmtakt · 2026-10-10

**Auto** (Standard; Unity hat dafür nichts fürs Web, Adaptive Performance nur Android): Erstwahl nach Gerät — Handy und
Software-/Handy-GPUs Niedrig, Intel-Grafik (ohne Arc) Mittel, sonst Hoch; dann im echten Spiel (nicht im Menü, nicht während
des Nachladens) 4 s Anlauf + 6 s Messung, Median unter 45 fps → eine Stufe runter, nie hoch (kein Pendeln); Ergebnis gemerkt.
Werte in `Data/Core/QualityCalibration.asset`. Settings: Auto / Hoch / Mittel / Niedrig (Hand-Wahl schaltet Auto ab),
„Recalibrate“. Gemessen im Browser: M4 → Hoch, 59 fps, bleibt; SwiftShader → Niedrig; CPU ÷8 → 22 fps → Mittel.
**WebGPU** (Unity 6.6, mit WebGL2-Rückfall): baut und startet (19,6 MB Start nach Gras-Datei), zeichnet aber **nichts** —
WebGPU-Validierung „Invalid BindGroup Universal Render Pipeline/Lit“, jedes Bild schwarz; die zunächst gemessenen 115 fps
waren leere Bilder. Darum WebGL2; `WebBuild.BatchWebGpu` baut den Versuch nach `Builds/WebGPU` für einen späteren Neuversuch
(Phase 12). `sdk-web` wertet WebGPU-Validierung als Fehler, `--probe` liest ein Bild zurück (`DevTools/FrameProbe`, rot wenn
schwarz). **„Hoch kostet zu viel“ (Phase 9: 56 fps):** Jede Einstellung (Hoch, ohne Baumschatten, lodBias 1,5, MSAA 1,
2 Kaskaden, 80 m Schatten, Mittel) lief entweder bei ~57 fps mit 36-ms-Ausreißern oder bei 133–147 fps — die 57er sind der
60-Hz-Takt, der im Test-Chrome nicht immer abschaltbar ist, nicht die Kosten. Kein Regler wirkte über das Streuen hinaus →
nach Regel 5 nichts geändert (Wald-Schatten, lodBias 2 bleiben); `sdk-web` markiert gedeckelte Läufe („CAPPED“).
Regler bleiben als URL-Messhilfen: `?treeshadows=0 ?lodbias= ?msaa= ?cascades= ?shadowdist=`. **Start** nach dieser
Aufgabe: 18,4 MB (Gras/Reis als eigene Datei nach gameplayStart, Built-in-Shader und unbenutzte Post-Varianten raus).

## D39 — Straßenprofile: Senken und Kuppen nicht enger als der Straßentyp erlaubt · 2026-10-10

**Warum:** Auf dem Ring bei (541, −710) / (508, −738) ging die Steigung mit einem Senken-Radius von **46 m** in die Ebene
über; bei 110 km/h sind das ~2,6 g zusätzlich, jede Karosserie setzte auf (offen seit Phase 8). Der Prototyp hat mehrere
solcher Knicke (Ring 43–62 m, „Kuppen-Knicke“ in STATUS). **Wie:** `RoadProfile` beim Laden der Straßen (eine Stelle für
Mesh, Gelände-Aushub und Laufzeit-Netz): jede Station, die enger biegt als `minVerticalRadius` ihres Typs
(`MapImportSettings`: highway 300 m, Rennstrecken 300 m, city 80, mountain 150, village 100, dirt 80, Pfad aus), wird
schrittweise zur Grenze hin ausgeglichen; nur die Höhe ändert sich, der Verlauf bleibt. Nebenstraßen, die eine geglättete
Straße treffen, übernehmen deren Änderung und lassen sie über 20 m auslaufen (keine Stufe an Kreuzungen); Fußwege bleiben
exakt. Das Gelände hebt sich unter schnellen Straßen bis 1 m an die Fahrbahn heran (`carveGapFill`), Brücken bleiben.
**Gemessen:** größte Höhenänderung < 1,5 m (Ring 0,74), Straßen-Gelände-Abstand Ring |p95| 0,139 m (wie vorher),
`RingDipTests`: mit den alten Daten 8 Aufsetzer mit Stößen bis 1 600, mit Glättung keiner (86–118 km/h). Kleine Verbesserung
nach Regel 15 (Strecke wiedererkennbar, nur weicher).

## D40 — Mit AdBlocker: kein toter Werbe-Knopf, Hinweis statt Popup; Töne vorgeladen · 2026-10-11

CrazyGames (Werbe-Regeln): Spieler mit AdBlocker nie blockieren oder benachteiligen, keine Rewarded-Knöpfe, die nichts
tun, Hinweis ohne Popup. Bisher stand „Watch ad …“ auch mit AdBlocker da und sagte erst nach dem Klick „No ad
available“. Jetzt meldet die Plattform `AdBlocked` (SDK `AdblockStatus.Present`); dann sind die Werbe-Angebote aus, auf
der Autoseite steht „Ad options are off while an ad blocker is active.“, das Leihen für Sparks bleibt. Ergebnis-Bonus
erscheint einfach nicht (er ist ein Extra). Geprüft: `PlatformTests.AdBlocker_…`, im Browser `sdk-web.mjs --adblock`.
Töne: `preloadAudioData` an für alle Clips (vorher entpackte der erste Abspielvorgang jedes Tons den Clip: 1–1,5 ms
Ruckler beim ersten Bruch/Aufprall; Smash-Kosten 2,35 → 1,2 ms). Kostet Ladezeit, keine Download-Größe.

## Offen (in der genannten Phase entscheiden)

- **Unity-Version:** 6.6 (wie im Probelauf) oder auf die nächste LTS (6.7) gehen,
  sobald verfügbar (Phase 1 oder 10).
- **Spielname:** Arbeitstitel „japanMap"; der Probelauf schlug „Ameagari" vor.

## D41 — Spielname „Ameagari Drive“, Autonamen ohne Markenkürzel · 2026-10-11

Der Eigentümer hat gewählt: **Ameagari Drive** („nach dem Regen“ + was man tut). Steht in
`ProjectSetup.ProductName` (Build-Titel), Cover und Videos. Autonamen verlieren die Kürzel, die auf echte
Modelle zeigen (CrazyGames: eigene Namen); Optik und Fahrwerte bleiben: Hachi 86 → **Hachi H8**,
Kumo STi 22 → **Kumo S22**, Raiden GT-R34 → **Raiden R4**, Suprema RZ → **Suprema Z7**, Rotor FD → **Rotor R7**,
Hanami SF-26 → **Hanami S26** (SF-26 = Ferraris F1-Wagen). Gespeichert wird die Auto-ID, Spielstände bleiben
gültig. Wache: `StoreNamesTests` (Marken-/Kürzelliste), `ProjectSettingsTests.ProductName_IsTheStoreName`.

## D42 — Midgame-Werbung an echten Pausen (löst „keine Midgame“ aus D35 ab) · 2026-10-11

**Der Mensch:** „Midgame-Werbung eigentlich schon“ (Einnahmen). **Wo:** nur an Pausen, die der Spieler selbst wählt:
Ergebnis verlassen („Free drive“/„Retry“ — die Werbung kommt vor dem Neustart, nie im Lauf) und Reise (die Werbung
deckt die Ankunft, das Nachladen läuft weiter). Nie auf dem Fahr-HUD, nie ungefragt mitten im Fahren. **Taktung**
(`AdSettings.asset`, aktive Spielzeit wie D35): nicht in den ersten 3 min der Sitzung, höchstens 1 je 3 min, und 3 min
Abstand zu einer Rewarded-Werbung; Schalter `midgame` = aus. Das SDK taktet zusätzlich selbst. **Weg:**
`IGamePlatform.RequestMidgame` → `GamePlatform.ShowMidgame` (pausiert + stumm wie Rewarded, `done` kommt immer) →
`RewardedOffers.AtBreak`. Ohne Werbung/AdBlock: geht sofort weiter. **Prüfung:** `PlatformRulesTests.Midgame_…`,
`PlatformTests.Midgame_AtTravel_…`. Im Basic Launch zeigt CrazyGames keine Werbung; echte Prüfung im QA-Tool (Demo-Werbung).

## D43 — „First Drive“ zurück, Handy = klein **und** Touch, Start wartet aufs Auto · 2026-10-11

**Anlass:** Handy-Bilder des Menschen (Schwarz, Kiste als Auto, Anzeigen übereinander, kein Intro) und „Wo ist unser
Intro mit den Jumps hin?“. **Intro:** Das Prototyp-Intro (`FirstDrive.ts`, `intro.config.ts`) war nie portiert. Jetzt
`Gameplay/Intro/FirstDrive` + `IntroOverlay`, Werte in `Data/Gameplay/IntroSettings.asset` (unverändert aus dem
Prototyp): neuer Spieler (Spielstand ohne `intro:first-drive`, < 60 s Spielzeit) startet im rollenden Auto 150 m vor
dem wieder gebauten **Coast Kicker** (Ramps.asset, 4,2 m, Anlauf/Landung baumfrei über `clearBefore/After`), Spurhilfe
auf dem Anlauf, Zeitlupe 0,16 in der Luft, Doppeltipp-Rolle, Drift als Wende, Heimweg zur Sakura Commons; 3.000 Sparks
(reicht für das erste Teil, nicht für das Mame K). Jede Stufe geht nach einer Frist allein weiter; Tab halten / SKIP →
Reise zur Commons im Auto. Verkehr hält Abstand zur Linie (`TrafficSystem.KeepOut`). Das ist die Abhilfe zu H2 (Start im
Auto) — vom Menschen ausdrücklich verlangt, darum ohne weitere Rückfrage. **Handy-Form:** `UiPanel` rechnete mit
`window.devicePixelRatio` (2,6/3), die Seite zeichnet mit höchstens 2 (iOS 1) → UI 1,3–3× zu groß; jetzt der Faktor des
Canvas. Und „Handy“ heißt jetzt kurze Seite < 600 **und** Touch — der CrazyGames-Rahmen 907×510 auf kleinen
Bildschirmen bekam vorher das Handy-Layout ohne MENU-Knopf und ohne Tasten-Einblendung. **Start:** Ladebildschirm deckt
alles bis zum ersten gameplayStart; die Welt gilt erst mit dem echten Startauto als bereit (≤ 12 s, Auto hält still).
Ehrlich gezählt: 20,9 MB bis gameplayStart (vorher 18,4 + Kiste); die Auto-Shader liegen dafür in `CarShared`, sonst zog
das Auto 4,4 MB Gebäude mit. Rest über 20 MB = Startauto mit 176 000 Eckpunkten → Asset-Sitzung (≤ 40 000).
**Wachen:** `UiLayoutProbe` + `sizes-web` mit Android/iPhone-Profilen (rot bei Überlappung), `SceneLinkTests`,
`IntroTests`, WebBuild bricht bei Splash-Logo oder Baumdaten im Start ab.

## D44 — Politur 2026-10-13: Freigaben, nasse Straße, Spiegel

**Freigabe des Menschen** („alles komplett autonom durchimplementieren … eigene Ideen einbringen“): die drei offenen
Fragen aus [POLISH.md](POLISH.md) §4 gelten als entschieden — Berge dürfen grün/bewaldet werden (Lage bleibt),
Tagesbonus/Tagesaufgabe und kleine Preisanpassungen sind erlaubt, Schriften unter OFL.

**Nasse Straße = eigener Shader** (`Art/Shaders/WetSurface.shader`), weil URP Lit keine Pfützenmaske kann und Shader
Graph für Agenten schlecht wartbar ist: erzeugt aus URP-17-`Lit.shader` (gleiche Eigenschaften, SRP-Batcher-fähig),
plus Pfützen aus Welt-Rauschen (Prototyp `road_puddles.glsl`), Fahrbahnmarkierungen und Bankett aus einem
Straßen-Datenkanal (UV3, `RoadImporter`) — Markierungen kosten so keinen Draw Call. Bei einem URP-Update die drei
Kopien neu erzeugen (Kommentar in den Dateien); `LookTests` wacht über Shader und Datenkanal.

**Spiegel:** Tokyo bekommt die Planarspiegelung des Prototyps (`World/PlanarReflection`, halbe Auflösung Hoch, ⅓
Mittel, aus auf Niedrig, nur über der Stadtplatte) — SSR hatte im Prototyp nur 19 % der Neons erfasst; URPs neues SSR
ist experimentell (Define) und nicht für WebGL gedacht. Alle Orte bekommen gebackene Box-Reflection-Probes in ihrer
eigenen Szene (`ReflectionProbeBaker`, 31 Stück, je ~160 KB DXT5-crunched, laden mit dem Ort), sonst spiegeln
Pfützen nur den hellen Himmel und wirken wie Eis.

## D45 — Figuren, Tiere, Verkehr aus Asset-Sprint 6 · 2026-10-16

- **Figuren = Humanoid + Animator** (Unity-Standard): jeder Körper eigener Avatar (Kinder haben andere
  Proportionen; „Copy From Other“ scheiterte an der Hierarchie), die 14 Clips aus `SM_Hito_Anims.fbx` laufen
  auf allen. Ein Animator-Zustand je Clip; `HitoFigure` wählt den Clip und passt die Wiedergabe an die
  Laufgeschwindigkeit an (statt Blend Tree: Spieler läuft 4,4–7,5 m/s, Clips sind für 1,35/4,2 m/s gemacht).
  Offscreen: `CullUpdateTransforms`.
- **Wer was spielt** steht im Asset `Data/Life/FigureSet` (Rollen, Gewichte, Handprops, Tiere), nicht im Code.
  Passanten: nach dem Regen ~24 % mit offenem Schirm (`WalkUmbrella`), ~24 % mit zugeklapptem.
- **Verkehr:** 10 eigene Modelle (Gewichte + Radstand in `TrafficSettings`), Lack = Kopie von `M_TrafficPaint`
  je Farbe des Mix (geteilt, bleibt im SRP-Batcher), Kollisionsbox aus den Modellmaßen.
- Die Kisten-Figur `StandInFigure` ist gelöscht.

## D46 — Session 2026-10-17: Burst, Stunts, Zerbrechen, Menü, Ton, Navi, Straßen, Cockpit

Auftrag des Menschen (eine Sitzung, autonom). Was gewählt wurde und warum:
- **Nitro-Burst (Shift doppelt)**: der ganze Tank als Kick (Δv über 0,16 s) + abklingender Schub. Gleiches
  Δv-Budget wie langsam verbrannt — nur sofort; braucht 25 % Tank. Regler in `ArcadeTuning` (Nitro burst).
- **Stunts**: Lufttricks drehen exakt um eine Achse und werden nur gestartet, wenn sie vor dem Aufsetzen fertig
  werden (Landezeit aus Höhe + Fallgeschwindigkeit). Boden: Kickflip (geradeaus), 360 (Lenken), 180 (Lenken +
  Bremse); Luft: Rolle, Backflip (Bremse). Landehilfe dreht die Fahrt bis 70° zur Nase. **Spielregel geändert**:
  der Doppeltipp ohne Lenken war ein 360, ist jetzt ein Kickflip (Mensch: „immer nur einmal drehen").
- **Zerbrechen**: das Objekt selbst fällt (eigenes Mesh als Körper, Baum kippt am Fuß) statt Kisten.
- **Menü**: Leiste oben + Glas-Spalte links, Cyan statt Tan/Braun; Autofotos im echten Open Bay zur Laufzeit
  (`CarPortraits`, kein Download).
- **Ton**: eigener Synthesizer `Tools/render-sounds.mjs` (Eigenbau, weil keine freien Aufnahmen ohne Download/
  Zustimmung vorliegen und der alte Prototyp-Render nicht mehr lief). Echte Aufnahmen ersetzen ihn per Dateiname.
- **Navi**: eigener Graph + A* (`RouteGraph`) — das NavMesh ist für Fußgänger, Unity hat keine Straßen-Routen.
- **Straßen**: Einmündungen nicht mehr 14 m vor der Hauptstraße abgeschnitten; Gelände unter dem Kiesrand
  abgesenkt (kein Sägezahn); Reiswasser läuft unter den Damm (weiches Ufer statt eckiger Kante).
- **Nass nur auf Flachem** (Shader): steile Flächen trocken — schwarze Bänder mit weißem Schein weg.
- **Nachtrag (Rückmeldung 2026-10-17):** Lufttricks per Doppeltipp Leertaste: Lenken = Rolle, S = Backflip, W = Frontflip,
  Lenken+S = Korkenzieher, nichts = Helikopter (flache 360); zwei Tricks in einem Sprung = Combo ×1,5. Rollen/Salti
  (auch der Kickflip) landen in Absprungrichtung. Burst-Stärke ∝ Tankanteil² (halb = alter voller Burst, voll = doppelt);
  Nitro lädt überall ×0,7, im Rennen nochmals ×0,7 und der Burst ×0,65 (`ArcadeTuning` „Nitro balance").
  Straßen: Normalen über Segmentnähte geglättet (keine Querbänder), weniger/weichere Pfützen (`Look.asset`),
  Kreuzungen ohne Linien, Seitenstraße endet unter der Hauptfahrbahn statt davor, Kiesrand blendet in Bodenfarbe.

## D47 — Schaden am Auto und Zerbrechen mit dem eigenen Modell · 2026-10-17

Wunsch des Menschen: Delle genau dort, wo das Auto trifft, so stark wie der Aufprall („wie BeamNG"); Bäume
splittern statt umzufallen; Laternen, Schilder, Zäune passend; Rad kann abfallen; sichtbarer Schaden wirkt aufs
Fahren, aber kein innerer Schaden; nie nervig — Reparatur gratis und sofort.

- **Kein Soft-Body, sondern ein Verformungsfeld je Aufprall** (`CarBodyDeformer`, eigener Code: Unity hat keine
  Karosserie-Verformung, Asset-Store-Pakete zielen auf Desktop und eigene Fahrphysik). Unity-Physik liefert Ort,
  Richtung und Impuls (`OnCollisionEnter/Stay`, 3 Schritte gesammelt); Härte = Impuls/Masse (Δv), damit leichte und
  schwere Autos gleich verbeulen. Knautschebene „Tiefe hinter der eigenen Oberfläche" (nicht hinter dem kürzeren
  Physik-Kasten), weicher Knick, Falten aus glattem Rauschen, Ausbeulen von Haube/Kotflügeln, Tiefe wächst
  quadratisch (Baum 60 ≈ 0,13 m, Wand 60 ≈ 0,23 m, Wand 110 ≈ 0,7 m), schmale Dinge drücken tiefer.
  **Kein Käfig nötig:** Die Karosserie hat nur ~13 000 Ecken (das „176 000" in STATUS ist das ganze Auto mit allen
  Tuning-Varianten, gemessen 44 000) — das Feld läuft direkt, verteilt auf Bilder (≤ 1 ms je Bild).
- **Normalen** = modellierte Normale, gedreht wie ihre Flächen (Kanten bleiben wie modelliert).
- **Kratzer/Glas** als Decal-Netz aus den Lack-/Glasflächen am Treffpunkt, Textur zur Laufzeit gezeichnet
  (0 Byte Download); Scheiben brechen bei Δv ≥ 13 heraus.
- **Räder:** Feld am Reifen ≥ 4 cm → verbogen (eiert, zieht ≤ 7 % Lenkung); ≥ 10 cm und Δv ≥ 20 m/s → ab (rollt
  davon, Ecke sitzt auf der Nabe, schleift mit Reibung und Funken, zieht 12 % zur Seite — über die Lenkung, weil das
  Arcade-Gierverhalten die Reibung sonst aufhebt). Motor/Lenkung/Leistung bleiben heil.
- **Nur das Auto des Spielers** (Rennen der Gegner bleiben unverändert). Reparatur: Respawn, neues Auto/Garage,
  Taste **T** (neu, Gamepad Steuerkreuz links), REPAIR-Knopf oben in der Mitte nur bei echtem Schaden.
- **Kleinkram zählt kaum:** `BreakableSettings.carDamage` = Anteil der Anfahrgeschwindigkeit, den das Auto spürt,
  wenn das Ding nachgibt (Leitpfosten 0,03, Bank 0,06, Fahrrad 0,08, Laterne 0,35, Automat 0,45, Baum 0,55, Hütte 0,6).
- **Zerbrechen mit dem eigenen Modell** (`MeshCutter`): Stamm auf Stoßstangenhöhe geschnitten (Flächen am Schnitt
  geteilt), Splitterkranz, Stumpf bleibt, Krone fällt; Laterne knickt und klappt am Gelenk um (ab 65 km/h bricht
  sie ab); Bank/Gestell in Latten; **Spielregel geändert (klein):** Plastik-Leitpfosten brechen nicht mehr, sie
  federn zurück (wie echte). Dafür sind 31 Bibliotheksmodelle lesbar (+5,6 MB Speicher, kein Download).
- Bekannt/offen: Türen und Haube fallen nicht ab (Loft-Karosserie hätte Löcher) — stattdessen hängt die Stoßstange
  nach harten Front-/Heckaufprallen an einer Seite herunter. Gegner/Verkehr bekommen keinen Schaden.

## D48 — Titelbildschirm, Ladeseite mit echtem Fortschritt, Menü als Kacheln mit Sperren · 2026-10-17

Anlass: Mensch findet das Menü „grottenschlecht", will Lade-, Titel- und Hauptmenü wie große Rennspiele. Stil: [UI-STYLE.md](UI-STYLE.md).
- **Titel = die echte Welt** (`Gameplay/Menu/TitleScreen`, von `GameMenu` zur Laufzeit gebaut — keine Szenenänderung):
  Kamera kreist ums Auto, START GAME (neu → Wischblende ins Intro) / CONTINUE (Spielstand → Kamera fliegt zum Auto,
  sofort fahrbar) + Settings über dem Titel. Einmal je Sitzung; Editor/Tests ohne Titel (`RunInEditor`), `?title=off/on`.
  Kein gerendertes Bild: kostet 0 MB und zeigt, was der Spieler bekommt. Regler in `IntroSettings` („Title screen").
- **gameplayStart erst nach dem Titel** (`Core/Ui/StartFlow`, `GamePlatform.ShouldPlay`): ein Titel ist keine
  Spielzeit (CrazyGames). Die Ladeseite geht dafür schon mit dem Titel (`PageBridge`), nicht erst beim gameplayStart.
  Startdownload unverändert — die Welt lädt vor dem Titel. Web-Werkzeuge messen mit `?title=off`, `smoke` prüft den Titel.
- **Ladeseite** bleibt HTML/CSS (steht vor Unitys Dateien, 0 Bytes extra): Bewegung statt Balken, Fortschritt in
  Stufen (Unity-Dateien 70 %, dann Boot-Tore/Szene/Startauto über `JapanMapLoadProgress`).
- **Menü**: Kacheln (`MenuTiles`) statt Karten mit Knöpfen; eigene Fokus-Navigation nach Lage (UI Toolkits Ring ist
  linear, sein Event-System wird an der Wurzel abgefangen, damit ein Druck genau einmal wirkt).
- **Freischalten**: `Core/Unlocks` (`FeatureId`, `IUnlockQuery`, Standard `AllUnlocked`). Menüs fragen nur ab und
  zeigen gesperrt statt zu verstecken; die Karriere (nächste Runde) setzt `Unlocks.Query`.

## D50 — Karriere: langer Einstieg mit Freischaltungen nach dem Intro · 2026-10-18

Anlass: Mensch will einen langen, nie langweiligen, überspringbaren Einstieg, der jede Funktion kennenlernen lässt
(„der wichtigste Teil, dass der User dranbleibt"). Entwurf, Recherche und Tabelle: [CAREER.md](CAREER.md).
- **Kette als Daten** (`Data/Gameplay/Career.asset`, `Gameplay/Career/CareerSettings`): 20 Schritte in 9 Kapiteln,
  je Ziel, Text für Tasten **und** Touch, Sparks, Freischaltungen, Wegpunkt, Startgeld-Flag, geschätzte Dauer.
  Zustand nur Claims im Spielstand (`career:<id>`, `career:on`, `career:done`), jeder Schritt sofort gespeichert.
- **Abhaken über echte Ereignisse/Fakten** (`DriftScorer.ChainEnded`, `StuntScorer.Count`, Telemetrie Burst/Tempo,
  Käufe in `purchases`, beendete Veranstaltungen, `Travel.Travelled`, `PhotoMode.LastPhoto`, Menü-Seite offen,
  `AutoDrive.Current`). Wer etwas vorher schon getan hat, bekommt den Schritt sofort.
- **Keine Sackgasse:** Kaufschritte füllen einmal bis zum günstigsten Kauf auf; ohne Auto-Drive (Agent A) wird der
  Schritt übersprungen; `CareerChain.Problems()` (EditMode) verbietet Schritte, die auf später freigeschaltete Dinge warten.
- **Gebaut zur Laufzeit von `FirstDrive`** (über `IntroSettings.career`) — keine Szenenänderung. Setzt `Unlocks.Query`,
  schaltet den alten `NextGoalGuide` während der Karriere ab (eine Stimme).
- **Alte Spielstände gelten als fertig** (es gibt noch keine Spieler); Editor/Tests ohne Karriere außer mit
  `CareerSystem.RunInEditor`; `?career=off/on`, `?unlock=all` = fertig.
- **Überspringen** im Titel (SKIP TUTORIAL, zweiter Druck bestätigt) und auf der Play-Seite (Bestätigungsblatt):
  alles frei + 3.000 Sparks, Intro gilt als gesehen.
- **Wirtschaft:** 5.400 Sparks einmalig (≤ 2 Sitzungen, kein Schritt über der kleinsten Rennprämie), Tabelle in
  ECONOMY.md von `EconomySim` erzeugt. Rennen sind weiter ohne Freischaltung fahrbar (Beacons in der Welt); gesperrt
  sind nur Menü-Wege — bewusst, damit Neugier nie bestraft wird.
