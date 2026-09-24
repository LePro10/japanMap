# Neo-Tokio — Neubau der Hauptstadt (Lane `agent/tokyo`, ab 2026-09-23)

Ziel: die Stadt vom generischen Prototypen (organische WP6-Straßen, Asphalt
überall, Kästen) zu einer dichten, erkundbaren Tokio-Collage im Forza-Sinn —
Scramble, Kabukichō, Yokochō, Ginza, Akiba, Wohnrand, Hafen, Hochstraße — mit
weichem Übergang zur Natur. **Minimal darf danach nicht teurer sein als davor.**

Referenzen: `C:\Users\Leandro\Downloads\ref` (+ `web/_manifest.json`, CC-Lizenzen).
Nichts davon wird ins Projekt kopiert; es sind Vorlagen, keine Assets.

## Phase 0 — Messbasis und Randbedingungen

### Randbedingungen, im Code nachgesehen

| Befund | Stelle | Folge |
|---|---|---|
| Die Stadtzone wird **vor** der Erosion eingeebnet; flacher Kern ≈ 520 m, Vorfeld mit 5,5 m Relief + 6 m Anstieg | `tools/bake-terrain.mjs` l.319 (`ZONES.city`, `CITY_CORE`, `CITY_APRON`) | Zone **nicht** anfassen (Erosion würfelt sonst die ganze Karte neu, vgl. 66,82 % in CLAUDE.md). Kern nach der Erosion einebnen wie `padCity` (l.2241) |
| `RoadGround.height(x, z)` hat keine Höhe als Eingabe | `src/game/RoadGround.ts` l.266 | Hochstraße mit Unterführung braucht eine zweite Bodenebene — zuerst Prüfstand, dann Geometrie |
| `CollisionWorld` bildet „Brücke mit Unterführung" ausdrücklich nicht ab | `src/game/CollisionWorld.ts` l.30 | dito |
| Verfolgerkamera weicht nur dem Gelände aus | `src/game/ChaseCamera.ts` l.491 | In Häuserschluchten sitzt die Kamera in der Wand → Gebäudekästen mitprüfen |
| Vegetationsausblendung hängt am alten 360-m-Kasten und den Terrassen | `src/world/scatter/scatterChunk.ts` l.192, l.237 | Ein gemeinsames Urbanitätsfeld `u(x,z)` statt fünf Einzelregeln |
| `assets/generated` ist im Git versioniert, die Lane hat eine eigene Kopie | `git ls-files assets/generated` (55 Dateien) | Neu backen in der Lane ist für den Hauptordner folgenlos |
| Himmel = `industrial_sunset_02` (Sonne 2,23°), IBL = `rooftop_night_2k` | `src/core/AssetManifest.ts` l.150 | Für die blaue Stunde liegt ein Nacht-HDRI schon im Bestand |

### Nachbarn, um die herum geplant wird

| Ort | Lage (x \| z) | Bemerkung |
|---|---|---|
| Commons (Spawn, Lobby, `sakura-bowl`) | 550 \| 510 | direkt südlich des alten Kerns — der neue Kern darf ihn nicht überbauen |
| Tideglass | 810 \| … | Region östlich |
| Bellwood / Wald | 790 \| −760 | nördlich |
| Tempel | 820 \| −940 | nördlich |
| `ridge-kicker` | 814,8 \| −514 | Schanze nördlich |
| `coast-kicker` | 392,8 \| 791 | südlich |

### Was an der alten Stadt hängt (am Ende abhaken)

- Straßen-IDs: `stadt` (Rennen `neon-circuit`, `events.config.ts` l.130; `navigationMapData.ts` l.36;
  `wp6-profile.mjs`, `wp6-traversal.mjs`), `zufahrt`, alle `URBAN_ROUTES` in `tools/wp6-layout.mjs`
  (`wp6-layout.test.mjs`, `resolveTrims.ts`, `RoadNetwork.ts` l.316)
- `CITY_DISTRICT` / `inCityDistrict` / `districtBlend` / `CITY_*`: `DriveSystem`, `RoadGround`,
  `PlanarReflection`, `CityCrossing`, `CityGenerator`, `CityInteriorLayout`, `CityPlaces`,
  `scatterChunk`, `bake-terrain`, `gen-roads`, `wp6-profile`, `wp6-roads`, `bench/city-pavement`
- `urbanLots` / `CITY_ENVELOPE`: `roads.config`, `RoadSystem`, `CityExperienceSystem`, `CitySystem`,
  `cityPlacesLayout`, `scatterChunk`, `bake-terrain`, `gen-roads`, `wp6-traversal`
- Regionen/Karte: `navigationMapRegions.ts` (`neon` bei 620), `navigationMapData.ts`
  (Landmarke `stadt`, Diner-Pin), `tools/gen-navigation-map.mjs` (tönt den alten Kasten)
- Blickpunkte `stadt*` in `src/debug/viewpoints.ts`; `tools/polish-visual.mjs`
- `tools/gen-props.mjs` l.879–986 (Lagerhallen- und Mauerring um 620 | 120)
- Prüfprogramme: `test-city.mjs`, `city-street-layout.test.mts`, `city-architecture.test.mts`,
  `wp4-city.test.mts`, `city-interiors.test.mts`, `test-city-places.mts`,
  `city-experience-runtime.mjs`, `sakura-lod.test.mts`, `navigation-map.test.mjs`
- Toter Code: `CityCrowd.ts` (keine Verwendung) — Kandidat für die Menschengruppen

> Nachtrag: die Lane `agent/tokyo` ist auf Wunsch des Auftraggebers aufgegeben;
> gearbeitet wird im Hauptordner (Port 5180).

### Messbasis (2026-09-23, vor dem Umbau)

Maschine: **AMD Radeon iGPU (0x164E)**, ANGLE/D3D11, Timer vorhanden. GPU-ms
sind hier nicht belastbar (Ausreißer 400–850 ms bei unfertiger Streuung) —
Maßstab sind die Zähler. Ladebildschirm auf dieser Maschine **10,7 s**, davon
Aufwärmframe 53 Programme in 6,0 s (jedes neue Material kostet Ladezeit).

`japanMap.report({mode:'driven', frames:60})`, ganzes Bild, 1280 × 720:

| Blickpunkt | Minimal DC / Dreiecke | Medium | Ultra |
|---|---|---|---|
| `stadt` | 231 / 673k | 283 / 707k | 661 / 1363k |
| `stadt-strasse` | 167 / 474k | 220 / 490k | 499 / 891k |
| `stadt-neon` | 171 / 474k | 221 / 485k | 499 / 885k |
| `stadt-luft` | 201 / 521k | 236 / 529k | 688 / 981k |
| `stadt-rand` | 221 / 641k | 259 / 683k | 677 / 1351k |
| `start` | 222 / 555k | 239 / 559k | 477 / 1000k |

Anteil der Stadt, Minimal @ `stadt-neon` (Gruppe ausgeblendet, Hauptdurchgang):
`Stadt` 33 DC / 40k · `Neon Basin streets` 27 / 11k · **`Walk-in city interiors`
27 / 31k** (von der Straße aus unsichtbar gezeichnet) · Plätze 3 · Kreuzung 3 ·
Neon 2 — zusammen **95 DC / ~104k Dreiecke**, dazu die Stadtstraßen in `Straßen`.

Bilder: `.cache/shots/report_*_{minimal…ultra}.png`.

### Budget für den Neubau

Auftraggeber (2026-09-23): nur iGPU, keine Messmatrix — **Minimal bleibt etwa
gleich, Ultra darf steigen**, aber nicht so, dass Ultra eine Spitzenkarte braucht.

| Stufe | Ziel an den Stadt-Blickpunkten |
|---|---|
| Minimal | Gesamt-DC und Dreiecke ≤ Messbasis + 10 % |
| Ultra | ≤ Messbasis + 40 % (grob ≤ 950 DC, ≤ 1,9 M Dreiecke) |

Hebel, die das tragen: Innenräume nur in der Nähe zeichnen (27 DC gespart),
Zellen-Zusammenfassung mit Fern-Hülle, Instanzen statt Einzelmeshes.

### Probe blaue Stunde

Nur im Browser (Himmels-HDRI gekappt/gekühlt, Look-Parameter), Bilder
`.cache/shots/bh0-*` (heute), `bh1-*`, `bh2-*`. Befund: Gebirge und Ferne werden
kühler, Fenster und Neon tragen mehr — **das Himmelsbild bestimmen aber
Wolkenschicht und Dunst**, nicht das HDRI. Umsetzung daher in Phase 7 über
Wolken-, Dunst- und Look-Werte zusammen; das HDRI allein reicht nicht.

## Phase 1 — Raster und Gelände (2026-09-23)

**Gebaut**

- `src/config/tokyoLayout.mjs`: Raster (29 Straßen, 4 Klassen 7…24 m), Stadtkurs
  `stadt` (1476 m, vier 90°-Ecken R 15,8 m + Diagonale in die Scramble),
  Außenanschlüsse, Viertel, Wahrzeichen, `urbanity(x, z)`.
- `CITY_DISTRICT` ist der Kern: Vereinigung aus x 300…1300 / z −160…450 und
  x 300…1040 / z −250…−160. Im Nordosten steigt das Gelände auf 45…55 m —
  erste Fassung mit rechteckigem Kern maß dort **bis 22 m Einschnitt**; statt
  Stützmauer wird der Hang Park unter dem Turm.
- `bake:clean` ebnet weiter nur den alten 360-m-Kasten ein
  (`LEGACY_PAD_DISTRICT`) — so trassiert `gen-roads` den Ring auf bitgleichem
  Gelände. Der Kern wird erst im echten Bake nach dem Einschneiden eingeebnet.
- `wp6-roads.mjs`: Raster vor dem Außennetz; unter der Ring-Hochstraße keine
  Kreuzungsknoten (`atGrade`); Planken des Rings nur im ebenerdigen Kernstück
  entfernt.
- **Zweite Bodenebene**: `RoadNetwork.closestPoint/distanceToNearestRoad` nehmen
  eine Bezugshöhe (`ROAD_LAYER_SPAN` 4,5 m), `RoadGround.refresh` die
  Fahrzeughöhe. Der ±6-m-Deckel der Fahrbahnkorrektur gilt nur noch für ferne
  Treffer.

**Gemessen**

| Prüfung | Ergebnis |
|---|---|
| Bergpass, Dorf, Needle Circuit, Pfade | bitgleich zum Stand davor |
| Ring, Lage | **0,000 m** Abweichung (geometrisch, nicht indexweise — der erste Vergleich meldete 4 m, weil neue Einmündungen andere Stützpunkte einfügen) |
| Ring, Höhe | +2,2 m am Südrand des Kerns (ebenerdiges Stück auf Stadthöhe gelegt, sonst 0,6…2,2 m Stufe zu den Stadtstraßen) |
| Höhenfeld außerhalb Kern + 60 m | 5,61 % der Texel geändert, > 1 m: 1,77 % — nur Stadtrand (Bild `.cache/shots/tokyo-heightdiff.png`), Rest der Karte schwarz |
| Erste Fassung Anschlüsse NO | `east-lantern-road` **−20,6 m**, `beacon-road` −14,3 m (Graben über gekoppelte Knoten) → Stichstraßen entfernt, danach +5,0 / +5,0 m, mittlerer Erdbau unverändert (8,65 statt 8,89 m) |
| Selbstschnitte (`npm run inspect`) | 0 |
| Unter dem Ring (Aoi-dōri, x 895→1034) | Auto durchgehend **30,50 m**, Ring 8 m darüber |
| Auf dem Ring (z = 0) | vorher 37,5 m (Deckel), jetzt 42,4…43,2 m auf 41,9 m Fahrbahn |

**Offen / bekannt**

- Der Ring hat auf dem Hochstraßenstück abschnittsweise keine Planke — ein
  geradeaus fahrendes Auto fiel bei z ≈ −15 herunter. Brüstungen mit Kollision
  gehören in Phase 6.
- Der alte `CityGenerator` läuft noch und meldet die Platte bei (1283, −250)
  als 21,8 m unter Gelände — er prüft die umschließende Box, nicht die
  Teilkästen. Wird in Phase 2/3 ersetzt.

## Phase 2–4 — Straßenraum, Häuser, Teilstück Scramble (2026-09-23)

**Gebaut**

- `TokyoGenerator.ts` ersetzt `generateCity` in `CitySystem`: Gitterzellen aus
  dem Raster → Bordsteinlinie je Seite (Einrückung = halbe Straßenbreite) →
  Gehweg nach Straßenklasse (Boulevard 5 m … Gasse 1,2 m) → Parzellen je
  Viertel (`STYLE`) → Baukörper mit dem alten Baukasten (`extrudeBuilding`,
  jetzt mit fester Etagenzahl). Zusammengefasst je 160-m-Kachel, zweimal:
  `full` und `shell` (Quader, gleiche Farbe und Fensterraster). Umschaltung in
  `CitySystem.update` nach `CITY_LOD.detailRange`.
- Sonderbauten (`SPECIAL_SITES`): runder Kaufhausturm in der Gabel
  Dōgenzaka/Bunkamura, 44-geschossiges Hochhaus an der Scramble, Bahnhof.
- `TokyoLandmarkSystem.ts`: Scramble-Diagonalen, zwei Videowände (erfundene
  Motive, Canvas, 5-s-Takt), Hochbahn x = 606 auf 9,8 m mit 32 Pfeilern und
  pendelndem Zug, Kabukichō-Tor, Minato Tower (150 m, Nordosthang).
- Schilder: der Generator wählt je Viertel (`SIGN_RULE`) und vergibt Stapelhöhen
  (`SignAnchor.stack`, bis 5 in Kabukichō). `NEON.capacity` 512 → 1600.
- Alte Innenräume, Plätze und die alte Kreuzung sind aus (`LEGACY_PLACES`), bis
  Phase 8 sie neu setzt.

**Gemessen**

| Prüfung | Ergebnis |
|---|---|
| Bestand | 103 Blöcke, 2837 Gebäude (vorher 334) |
| Erste Fassung: Straßen im Bild von oben 35…45 m breit | Ursache: die Einrückung tastete bis 3 m vor die Ecken und fand dort die Querstraße → nur das mittlere Seitenstück abtasten; danach Straßen 10…24 m |
| Aufbau im Browser | ~0,9 s, 90 000 Straßenabfragen |
| Stadtkurs `stadt` (driveProbe, 40 s) | 535 m, 48 km/h, **0 Kontakte, 0 Schritte neben der Fahrbahn** |
| Shuto-shita (driveProbe) | 132 Schritte neben der Fahrbahn — Knicke im Polygonzug; wird mit der Hochstraße gerundet |
| CPU je Physikschritt | Ring 0,8 ms, Stadt 1,5 ms (dichtere Kollisionszellen) |
| Minimal, Hauptdurchgang | 122…253 DC, 388…459k Dreiecke (Messbasis ganzes Bild: 167…231 DC / 474…673k) |
| Ultra, Hauptdurchgang | 190…255 DC, 444…980k Dreiecke (Messbasis 477…688 DC / 885k…1,36 M) |
| Straßenausstattung Ultra mit alten Reichweiten | 136 DC / 472k an der Meiji-dōri → Reichweiten halbiert |

Bilder: `.cache/shots/tokyo-slice-*.png`, `tokyo-p4-*.png`, `tokyo-p2b-*.png`.

**Offen**

- Props aus `assets/props.json` (alter Lagerhallenring) stehen auf neuen Straßen
  → `gen-props` mit Kernausschluss neu.
- Gehwege einfarbig, Asphalt mit groben Rissen — Straßenraum-Feinschliff.
- Hochstraßen-Brüstungen, Pfeiler unter dem Ring (Phase 6).
- Übergang zur Natur (Phase 5), blaue Stunde (Phase 7), Inhalte (Phase 8).

## v2 — nach der Abnahme des Teilstücks (2026-09-24)

### Was die Rückmeldung war, und ob der alte Plan sie abgedeckt hätte

Ehrlich: **nein, nur zur Hälfte.** Der Plan nach Phase 4 sah Feinschliff am
Straßenraum, den Übergang, die Hochstraße, die blaue Stunde und die Innenräume
vor. Die Rückmeldung zielte auf etwas darunter:

| Rückmeldung | im alten Plan? | Ursache |
|---|---|---|
| Gitter statisch, langweilig, repetitiv | nein | Generator v1 kannte nur achsparallele Zellen |
| Häuser auf der Straße, Glitches von vorher | teils (Props) | Rand-Ring der alten Stadt stand im neuen Kern, Werbewand der alten Kreuzung schwebte |
| Schilder links/rechts random und generisch | nein | 4 + 12 Wörter, ein Stil, gleicher Takt |
| Läden immer gleich | nein | ein Ladenmodul für alle |
| Parks, mal was anderes, leere Orte | nein | 121 WP6-Terrassen ohne Bebauung, keine Freiflächen |
| Asphalt „räudig", Beton überall | ja (Phase 2b) | Landstraßentextur, einfarbige Gehwege |

Deshalb v2 statt Weitermachen.

### Umgesetzt

- **Straßennetz v2** (`tokyoLayout.mjs`, Plan: `node tools/plot-tokyo.mjs [--baked]`):
  54 Straßen statt 31, Viertel mit eigener Handschrift — geschwungene
  Hanamichi-dōri, Gassen von 5 m (Golden Gai, Omoide, Takeshita), die Schräge
  der Denki-gai, gewundene Hangstraßen in Minato, strenges Ginza-Raster als
  Gegenpol. Hauptachsen, Stadtkurs und alle Außenanschlüsse unverändert.
  Gebacken mit der WP6-Kette; alle Straßen außerhalb des Kerns geometrisch
  unverändert bis auf `east-lantern-08` (Anfang 0,87 m versetzt, rastet an
  `minami-east` ein).
- **Generator v2** (`TokyoGenerator.ts`, `tokyoField.ts`): Bordstein- und
  Baulinienfeld auf 1-m-Gitter, Gehwege aus Höhenlinien (trianguliert, keine
  Stufen mehr), Häuser entlang der Baulinie **gedreht**, Lückenschluss, Hinterhof,
  Münzparkplätze. Gedrehte Kollision über `KIND_OBOX` in `CollisionWorld`.
- **Schilder v2** (`neonAtlas.ts`, `NeonSystem.ts`): 74 Felder in vier Bauarten
  (Leuchtkasten, weißer Kasten, Neon, Mieterverzeichnis), je Haus ein Programm
  aus Ladenschild, Hochkant-Schild einer Höhe, Etagenbändern, Dachtafel mit
  Gestell. Rückseiten lesen jetzt richtig herum.
- **Läden** (`CityStreetDress.ts`, `CityGraphicAtlas.ts`): zwölf Typen je
  Viertel gewichtet — Konbini, Izakaya mit Noren und Laternen, Ramen,
  Spielhalle, Mode, Elektronik, Drogerie, Café, Blumen, Bücher, Makler,
  Rollladen, Automatenecke. Wohnhäuser mit beleuchteter Glastür statt schwarzem
  Kasten, Fahrräder davor.
- **Freiflächen** (`TokyoOpenSpaceSystem.ts`): Nishi-Park mit Teich und
  Wegekreuz, Miyashita als Längspark an der Bahn, Taschenpark mit Spielplatz,
  Hikawa-Schrein mit Torii, Halle, Steinlaternen, Zaun, zwei Plätze, 39
  Münzparkplätze mit Autos, Automat und P-Schild.
- **Straßenmöbel** (`TokyoStreetFurnitureSystem.ts`): Laternen je Straßenklasse,
  Alleebäume an Boulevards, Betonmasten mit Leitungen in den Gassen, Ampeln an
  den Ecken ab 10 m. Folgt der Bordsteinlinie, nicht den Häusern.
- **Fassaden**: je Familie 4…6 Töne statt 2, Satteldächer mit Überstand,
  Ziegelton und geschlossenen Giebeln (die Giebel standen vorher offen).
- **Boden**: Gehwegpflaster im Läuferverband (Shader, Art 2), Risse im
  Stadtasphalt über Albedo, Verdeckung und Normale gedämpft.
- **Übergang** (`TokyoSuburbs.ts`): Wohnhäuser auf den 121 WP6-Terrassen,
  dichter und höher nah am Kern, außen locker mit Gärten; Blocksteinmauern,
  Gartenbäume.
- **Rand-Ring der Props** um den neuen Kern verlegt (`gen-props.mjs`), 0 Props
  im Kern (vorher 141). **Eingespleißt, nicht neu erzeugt:** ein voller
  `gen-props`-Lauf verschiebt auf dem heutigen Gelände das Fischerdorf um bis
  zu 40 m; `assets/props.json` trägt deshalb den alten Bestand bitgleich und nur
  den neuen Ring (237 Einträge) am Ende. Wer `gen-props` erneut laufen lässt,
  muss das wiederholen.

### Gemessen

| Größe | Wert |
|---|---|
| Häuser auf Fahrbahn (Grundfläche berührt G < 0) | **0** |
| Häuser Kern / Vororte | 2558 / (je Lauf im Log `[Stadt] … Vororte`) |
| Aufbau Stadt | 1,59 s (Feld 0,37 s, Front 0,76 s) — v1: 0,9 s |
| `driveProbe` 14 Stadtstraßen, 9 m/s | 0 Kontakte, 0 neben der Fahrbahn |
| `driveProbe` Stadtkurs, 16 m/s | 5 Kontaktschritte (0,19 cm), 0 neben der Fahrbahn |
| Minimal, 4 Blickpunkte | 81…226 DC, 441…694 k Dreiecke (Basis 167…231 / 474…673 k) |
| Ultra, 4 Blickpunkte | 202…541 DC, 0,93…1,72 M Dreiecke (Basis 477…688 / 0,89…1,36 M) |
| `typecheck`, `build`, `test:polish` | grün |

Die Blickpunkte des Vorher und Nachher sind **nicht** dieselben (die alte Stadt
steht nicht mehr); die Budgetzeilen sind ein Vergleich der Größenordnung, keine
A/B-Messung.

### Offen, bewusst

- Aufbau 1,6 s statt 0,9 s: gebaut und gedreht wird über zwei Puffer
  (`appendTransformed`), 780 ms für 2558 Häuser. Messbar verbesserbar, noch nicht
  getan.
- `sakamichi` bei 16 m/s: der Regler des Prüfstands schneidet die enge Kurve und
  bleibt an einer Hauswand hängen. Bei 9 m/s fahrbar. Die Kurve ist eng gewollt.
- Palette heller: der Befund „ohne Eigenlicht dunkler als die Umgebung" ist mit
  ihr nicht nachgemessen.
- Hochstraßen-Brüstungen, blaue Stunde, Minikarten-Tönung der Stadt: stehen
  aus (Phase 6–8).
- Kaiju auf dem Kino: aus Quadern gebaut und wieder entfernt — las sich als
  Kasten mit Zähnen. Braucht ein echtes Modell.

### Nachgezogen nach der ersten v2-Abnahme

- **Begehbare Läden wieder an**, verschoben (`INTERIOR_SITES` in
  `tokyoLayout.mjs`): Komorebi Diner an der Nishi-Shinjuku-Avenue
  (x 412…428, Eingang West), Kōji Corner Mart an der Aoi-dōri neben dem
  Kabukichō-Tor (x 572…584, Eingang Süd). Der Generator hält beide Flächen frei;
  Laufflächen und Kollision wandern mit, gezeichnet wird in alten Koordinaten und
  als Mesh verschoben. Im Bild geprüft, außen und innen.
- **Entdeckungskarte und Minikarte** mit den neuen Vierteln (Kabukichō, Golden
  Gai, Shibuya Scramble, Akiba, Ginza, Minato Hills, Outskirts …) und dem Namen
  „Neo Tokyo" statt „Neon Basin"; die Regions-id `neon` bleibt.
- **Sammelstücke**: das Stadtnetz ist aus dem Verteiler genommen (außer dem
  Stadtkurs), `PICKUPS.count` 90 → 110. Vorher 13 am Ring, danach 23
  (Rauchprobe verlangt > 20).
- **Rauchprobe** `node tools/smoke.mjs`: alle Punkte grün, Konsole sauber.
- Tests nachgezogen, weil sie die alte Stadt voraussetzten: `road-trims`
  (Vorrichtung hat den alten Bake-Fehler nicht mehr), `wp6-roads` (Mindestradius
  je Straßenklasse), `waypoint-route` (Ziel war die Mitte der alten Stadt).
