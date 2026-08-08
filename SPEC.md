# japanMap — Technische Spezifikation

> Open-World-Map in Three.js als Basis für ein späteres Browser-Game
> (Racing / Drifting / Erkundung). Stand: 2026-07-26.

---

## 1. Kernentscheidungen

| Bereich | Entscheidung |
|---|---|
| **Stack** | Vanilla Three.js + TypeScript + Vite |
| **Renderer** | WebGL2 + `pmndrs/postprocessing` |
| **Zielplattform** | Desktop, maximale Qualität. Kein Tablet/Mobile-Support (v1) |
| **Map-Größe** | 3072 × 3072 m (~9,4 km²) |
| **Art-Direction** | Low-Poly-Geometrie + PBR-Shading. Licht > Texturen |
| **Beleuchtung** | Eine feste Stimmung: **Blaue Stunde nach Regen** |
| **Content** | Hybrid: prozedurales Terrain + Spline-Straßen + CC0-Kitbash-Landmarks |
| **Assets** | Ausschließlich CC0 / kostenlos |
| **Ambition** | Ernstes Projekt — saubere Systeme vor schnellen Ergebnissen |

### Leitprinzip

> **Der Look entsteht im Renderer, nicht in der Geometrie.**

Bewusst flache, kantige Formen ohne Albedo-Texturen. Die Qualität kommt aus
HDRI-basiertem IBL, Reflexionen auf nassem Asphalt, Emissive-Neon, Höhennebel
und Color-Grading. Das ist gleichzeitig die günstigste Art, gut auszusehen —
und die einzige, die ohne Asset-Budget funktioniert.

---

## 2. Die Welt

### 2.1 Zonen-Layout (3072 × 3072 m)

```
         N
  ┌──────────────────┬──────────────────┐
  │  BERG / TŌGE     │   WALD + TEMPEL  │
  │  Serpentinen     │   Torii-Pfad     │
  │  Höhe 0→450 m    │   Höhe ~150 m    │
  ├──────────────────┼──────────────────┤
  │  REISFELDER      │   STADT          │
  │  Dorf, Fluss     │   Neon, dicht    │
  │  Höhe ~20 m      │   ~800×800 m     │
  ├──────────────────┴──────────────────┤
  │  KÜSTE — Hafen, Strandstraße, Meer  │
  └─────────────────────────────────────┘
         S
```

> **Stand P8.9, gemessen.** Der Hafen liegt bei x = 790 und hat seit P8.9 ein
> **Fischerdorf**: neun Hütten 25…81 m vom Wasser, Netzgestelle, Bootsrampe,
> zweiter Steg, sechs Boote an zwei Anlegern. Erschlossen über den
> `kuestenpfad` (317 m ab Ringstraße); die Hütten liegen 25…131 m von seiner
> Achse. Der Leuchtturm bleibt ein eigener Fixpunkt bei x = −180, also
> **977 m** entfernt — die beiden sind nie im selben Bild.
>
> Der **Torii-Pfad** im Nordosten ist seit P8.9 ein vollständiger Sandō: neun
> Torii im 16-m-Raster über 150 m, zwanzig Laternen, Chōzuya und Glockenturm,
> und die Tempelhalle steht 2 m hinter dem letzten Wegpunkt. Bis dahin lag sie
> 300 m neben dem Weg.

Jede Zone ~1,5 km Kantenlänge → bei 120 km/h ca. 45 s Durchfahrt. Das reicht
für einen echten Ortswechsel.

**Verbindungen:** Eine Ringstraße verbindet alle Zonen. Der Bergpass ist eine
Stichstraße mit Serpentinen (Drift-Strecke). Ein Küstenhighway läuft im Süden.
Der Höhenunterschied von 450 m ist der stärkste Hebel, damit 3 km groß wirken.

> **Stand P8.11, gemessen am 2026-08-01.** Der Bergpass hat **9 Kehren** auf
> 2616 m, Mindestradius 17,95 m, Steigung 10,7 %, kleinster Achsabstand 10,8 m,
> keine Selbstschnitte. Der Graben 24 m seitlich liegt im Median bei 10,8 m, im
> 95. Perzentil bei 43,7 m, und überschreitet 50 m auf 60 m Strecke.
>
> **Die Kehren kamen nicht aus dem Gelände, sondern aus einem Sicherheitsfaktor
> der Verrundung.** Er warf Ecken weg, deren Radius `minRadius · 1,3` nicht
> hielt — eine Zahl, die am Ring geeicht war und für den Pass Ecken mit 15…18 m
> Radius löschte, die dessen Vorgabe (≥ 15 m) erfüllen. Mit `floorFactor: 1.2`
> für `mountain` überleben sie; der Ring behält 1,3. Die Messreihe über acht
> Werte steht in PLAN.md bei der Abnahmezeile.
>
> Der Erdbau wird dabei **besser**: Graben-Median 20,9 → 10,8 m, die Strecke
> über 50 m Grabentiefe 242 → 60 m. Enger wird der Achsabstand: 17,2 → 10,8 m,
> also 2,3 m zwischen zwei Kehrenschenkeln bei 8,5 m Fahrbahnbreite.
>
> ~~Stand P8.5: 7 Kehren auf 2408 m, Achsabstand 17,2 m.~~
> Vorher standen hier 3 Kehren auf 3003 m (2026-07-31 aus `roads.json`
> abgelesen), davor 2 auf 2983 m aus einem noch älteren Lauf. Die Zahl ist im
> Terrain-Durchgang P8.5 gestiegen — **welcher der drei Eingriffe sie bewirkt
> hat, ist nicht zuzuordnen**: die Erosion koppelt jede Geländeänderung über
> die ganze Karte (Messung in PLAN.md 8.5). Gemessen ist nur, dass ohne das
> Flussbett 5 Kehren entstehen.
>
> ~~**Damit fehlt weiterhin eine Kehre auf „≥ 8".** Der Abstand ist 7 zu 8,
> nicht mehr 3 zu 8.~~ **Erledigt am 2026-08-01 mit 9 Kehren** — und die
> fehlende Kehre lag nicht am Gelände, sondern am Verrundungs-Boden, siehe
> oben. Der Satz stand hier zwei Tage und hat in die falsche Richtung gezeigt:
> er legte nahe, das Höhenfeld müsse noch etwas hergeben.
>
> Hier stand bis zum 2026-07-26, die Vorgabe widerspreche sich selbst und das
> Höhenfeld gebe keine Kehren her. Beides war falsch: die Trassierung fand die
> Kehren die ganze Zeit, drei Stufen der Nachbearbeitung löschten sie, und nach
> deren Reparatur sind **acht** Kehren gebaut worden. Sie legen dabei rund
> 300 × 250 m Massiv um 50 bis 150 m tiefer — ein Steinbruch, kein Bergpass.
>
> Der Grund ist Geometrie: auf einem 45-%-Hang liegen zwei Serpentinenschenkel
> horizontal weiter auseinander, als die Fahrbahnhöhen es bei 11 % zulassen; die
> Differenz muss das Gelände tragen. ~~**Die Vorgabe braucht eine längere,
> flachere Flanke.**~~
>
> **Das war die Diagnose bis P8.5a, und sie ist widerlegt.** Gemessen liegt das
> mittlere Gefälle der Südflanke bereits bei 25 % — genau dem Zielwert. Die
> „45 %" waren eine Beobachtung an *einem* Hang. Was Serpentinen verhindert, ist
> die **Traverse** quer zur Falllinie: Median 104 %, auf 84 % ihrer Länge über
> 30 %. Eine Variantenserie über Gratamplitude und Reiszonenlage erreichte
> bestenfalls 44 % / 61 % und kostete dafür 38 % der Gipfelhöhe. Die Flanke
> flacher zu machen löst das Problem also nicht.
>
> Gebaut wurde stattdessen eine **Bank** entlang der Trasse (P8.5a): sie kappt
> im Korridor, was über dem Querschnittsmedian steht. Der Anschnitt über der
> Fahrbahn fällt damit von 41,5 auf 23,7 m im Median, der Extremwert von 185,4
> auf 90,7 m, und der Anteil über 50 m von 42 auf 15 %. Der Steinbruch ist damit
> kleiner, aber nicht weg. Messwerte und die vier verworfenen Gegenmittel in
> PLAN.md, „Wie der Bergpass zu seinen Kehren kam" und P8.5a.

### 2.2 Terrain

- **Quelle:** Prozedural generiert (Simplex/FBM + Erosions-Pass + Zonen-Masken),
  aber **einmalig gebacken** in eine 16-bit-Heightmap (2048², ≈1,5 m/px).
  Deterministisch, versionierbar, von Hand nacheditierbar.
- **LOD:** CDLOD-Quadtree mit Vertex-Morphing zwischen den Stufen. Wurzel
  3072 m, Blätter 48 m, sieben Stufen. ~~Chunk = 256 m, 12 × 12 = 144 Chunks,
  LOD0 = 2 m/Vertex nah → LOD3 = 16 m/Vertex fern.~~ Gebaut ab P4: 33 × 33
  Stützstellen je Knoten, also **1,5 m/Vertex** auf der feinsten Stufe — genau
  der Texelabstand der Heightmap — bis 96 m/Vertex auf der Wurzel. Die 256-m-
  Chunks bleiben als Einheit für die *Vegetations*-Streuung erhalten (dort 64 m),
  nicht für das Terrain-Gitter: 3072 / 256 = 12 ist keine Zweierpotenz und liegt
  damit schief zu einem Quadtree.
- **Materialien:** Splat-Blending über 4 Kanäle (Fels / Gras / Sand / Reisfeld),
  gesteuert von Höhe, Steilheit und Zonen-Maske. Triplanar-Mapping an Steilhängen.
- **Culling:** Frustum-Culling pro Chunk + Occlusion durch Berge (später).

### 2.3 Straßen

Straßen sind **das wichtigste Datenmodell im Projekt** — sie werden dreifach genutzt:

1. Sichtbare Geometrie (extrudiertes Mesh entlang Spline)
2. Terrain-Carving (Heightmap wird beim Bake entlang des Splines geglättet)
3. Gameplay-Daten: Racing-Line, KI-Pfade, Spawnpunkte, Streckenabschnitte

**Format:** Zentripetale Catmull-Rom-Splines in JSON (Kontrollpunkte + Breite +
Bankwinkel + Typ), dazu die fertig abgetastete Mittellinie: Baker und Renderer
sollen die Kurve **nicht beide auswerten**, sonst liegt die eingeschnittene
Rinne im Terrain neben dem Mesh. Ein In-Browser-Spline-Editor kommt in M3 — von
Hand JSON zu
tippen skaliert nicht.

### 2.4 Vegetation & Props

- Poisson-Disk-Sampling mit Dichtekarten pro Biom, Ausschlusszone um Straßen
- `InstancedMesh` gruppiert nach ~~(Chunk × Asset × LOD)~~ **(Asset × LOD)** —
  je Chunk wären es rund 600 Draw-Calls gegen ein Teilbudget von 100, siehe
  PLAN.md P4 / 4.3
- Billboard-Imposter ab ~150 m Distanz (gebaut: 180 m für Bäume, oktaedrischer
  8 × 8-Atlas über der Halbkugel, zur Laufzeit gebacken)
- Vier Arten à **drei Formvarianten**, dazu Seitenverhältnis und Neigung je
  Instanz. Die beiden letzten kosten nichts — sie stehen in der Instanzmatrix
- Ziel: ~50.000 Instanzen sichtbar bei < 100 Draw-Calls.
  **Gemessen: 50.203 bei 28** (Vegetation) bzw. 64 Draw-Calls für die ganze Szene

---

## 3. Rendering

### 3.1 Beleuchtung — "Blaue Stunde nach Regen"

**Zwei HDRIs statt einem.** `scene.background` und `scene.environment` dürfen in
Three.js unterschiedliche Texturen sein. Wir nutzen das: ein „PureSky"-HDRI als
sichtbarer Himmel (unverbaut, hochauflösend) und ein zweites, an einer echten
Straße bei blauer Stunde aufgenommenes HDRI für die Beleuchtung — dessen
Lichtfarben (Natriumdampf-Gelb gegen Dämmerungs-Violett) sind das, was den
Materialien den Look gibt. Ein reines Himmels-HDRI beleuchtet zu flach.

| Element | Umsetzung |
|---|---|
| Sichtbarer Himmel | `industrial_sunset_02_puresky` 4k → `scene.background` |
| Ambient / IBL | `rooftop_night` 2k → `PMREMGenerator` → `scene.environment` |
| Key-Light | 1 × `DirectionalLight`, sehr flach, kühl-blau. Wirft **keinen** Echtzeitschatten — siehe „Schatten" |
| Neon / Laternen | Emissive-Materialien + Bloom. Echte `PointLight` nur an ~10 Schlüsselstellen |
| Nasser Asphalt | Niedrige Roughness + Roughness-Variation-Map + SSR |
| Nebel | Custom Height-Fog im Shader (dichter in den Tälern) |
| Schatten | **Gebackene Geländeverschattung** (`shade.png`, 1024², Horizontwinkel + Verdeckerentfernung + Himmelssicht). ~~CSM 4 × 2048~~ — in P2 verworfen: vier Kaskaden kosten 5,88 Mio. Dreiecke gegen 3 Mio. Budget, und bei 2,2° Sonnenstand wirft ein 450-m-Gipfel 11,5 km Schatten, die keine Kaskadenaufteilung einfängt. Echtzeitschatten kommen in P4 zurück, sobald es bewegliche Werfer gibt |

**Kein Tag-Nacht-Zyklus.** Das erlaubt später gebackene Lightmaps und
Reflexions-Probes — dort liegt der größte Qualitätssprung.

### 3.2 Postprocessing-Kette

```
Render → N8AO → [SSR] → Bloom → AgX-Tonemapping → LUT → Vignette → SMAA
```

Gebaut ist das ab P2 in **zwei** Effekt-Pässen: `EffectPass(Bloom, AgX, LUT,
Vignette)`, danach `EffectPass(SMAA)`. Beides in einem Pass gebündelt bekäme SMAA
zur Kantenerkennung den *Eingangspuffer* des Passes, also HDR-Werte — und
Kantenglättung vor dem Tonemapping funktioniert nicht. **N8AO statt GTAO**, weil
`SSAOEffect` einen `NormalPass` und damit einen dritten Terrain-Durchlauf
bräuchte. SSR und DoF sind vorgesehen, aber nicht gebaut.

⚠️ **Risiko:** SSR ist in `pmndrs/postprocessing` der teuerste und zickigste
Pass (Ghosting, Rauschen an Kanten). Fallback wenn es nicht trägt: planare
Reflexion nur für die Straßenebene + Reflexions-Probes. Wird in M6 evaluiert.

---

## 4. Performance-Budgets

**Kalibrierungs-Ziel: GTX 1660 / RX 580 @ 1080p, 60 FPS.**

Die Entwicklungsmaschine hat eine **RX 7900 XTX** — auf der läuft praktisch
alles flüssig. Sie ist als Maßstab unbrauchbar. Verbindlich sind die Zahlen
unten, abgelesen im Debug-Overlay, nicht das Bauchgefühl beim Fliegen.

| Metrik | Budget |
|---|---|
| Draw-Calls / Frame | < 800 |
| Dreiecke / Frame | < 3 M |
| Texturspeicher | < 512 MB |
| Initialer Download | < 15 MB (KTX2 + meshopt) |
| Frame-Time-Budget | 16,6 ms → davon max. 5 ms Postprocessing |

**Quality-Presets** skalieren: ~~Schattenauflösung, SSR an/aus,~~ N8AO-Stufe,
~~Sichtweite~~, Vegetationsdichte, Render-Scale. Von Anfang an eingebaut —
nachträglich einzuziehen ist teuer.

> **Stand P10.1, gemessen.** Es sind **fünf** Stufen (Minimal kam in P8.2 dazu),
> und drei Posten dieser Aufzählung stimmen so nicht mehr:
>
> - **Schattenauflösung** wirkt nur im Vergleichsfall — Echtzeitschatten sind
>   seit P2 aus, die gebackene Geländeverschattung hat sie ersetzt.
> - **SSR** heißt `reflections` und schaltet den planaren Durchgang aus P6.5;
>   SSR selbst ist gemessen verworfen (offene Entscheidung 1).
> - **Sichtweite** war bis P10.1 ein Deckel in Metern und damit auf vier von
>   fünf Stufen **wirkungslos** — die größte Artenreichweite ist 520 m, der
>   Deckel lag darüber. Ersetzt durch zwei Faktoren: `vegetationRange` (wie weit
>   wird gezeichnet) und `lodBias` (wie teuer). Herleitung in `quality.config.ts`.
>
> Dazugekommen sind `terrainGridVertices` (P8.1 — der einzige Hebel an der
> Geländelast) und `postFx` (P8.2 — auf „Minimal" ein anderer Renderpfad, kein
> Regler).

---

## 5. Projektstruktur

```
src/
├── core/          Engine, RenderLoop, ResourceManager, EventBus
├── world/         TerrainSystem, ChunkManager, RoadSystem, Scatter, Water
├── render/        PostFXPipeline, LightingRig, MaterialLibrary, QualityPresets
├── camera/        FreeFlyController  (später: VehicleCamera, PhotoMode)
├── debug/         StatsOverlay, Tweakpane-Panels, FreezeCulling-View
└── config/        world.config.ts, quality.config.ts, roads.config.ts, …

assets/            hdri/, textures/  — eingecheckte Quellen
assets/generated/  heightmap, Verschattung, roads.json — nie eingecheckt,
                   reproduzierbar aus Seed und tools/ (`npm run world`)

tools/             Heightmap-Baker, Schatten-Baker, Straßen-Generator,
                   Trassierung, Sonnenstand aus HDRI, Poly-Haven-Download
```

### Bibliotheken

`three` · `postprocessing` (pmndrs) · `three-mesh-bvh` (Raycasting/Kollision) ·
`simplex-noise` · `tweakpane` · `stats-gl` · `gltf-transform` (Build-Pipeline)

---

## 6. Asset-Quellen (alle CC0)

### Automatisiert: `tools/polyhaven.mjs`

Poly Haven hat eine offene API — Suchen und Laden ist skriptbar und im Projekt
als CLI hinterlegt. Kein manuelles Herunterklicken, Assets sind reproduzierbar.

```bash
node tools/polyhaven.mjs search hdris --cat skies,sunrise-sunset
node tools/polyhaven.mjs preview rooftop_night      # → .cache/polyhaven-previews/
node tools/polyhaven.mjs get hdris rooftop_night --res 2k
node tools/polyhaven.mjs get textures asphalt_02 --res 2k --maps Diffuse,nor_gl,arm
```

Downloads sind idempotent (vorhandene Dateien werden übersprungen) und
`assets/CREDITS.md` wird automatisch gepflegt.

**Texturen immer als `Diffuse` + `nor_gl` + `arm` holen.** `nor_gl` ist die
OpenGL-Normalmap (WebGL braucht die, nicht `nor_dx`), und `arm` packt
AO/Roughness/Metalness in eine einzige Textur — ein Sampler statt drei.

### Bereits im Projekt

| Asset | Verwendung |
|---|---|
| `industrial_sunset_02_puresky` (4k) | **Skybox** — tiefblauer Himmel, warme Sonne am Horizont, kein Bodenmüll |
| `rooftop_night` (2k) | **IBL / `scene.environment`** — violette Dämmerung + Natriumdampf-Lampen |
| `evening_road_01_puresky` (2k) | Alternative Skybox — dramatische Wolkenbänder, liest sich stark nach Regen |
| `asphalt_02` (2k) | Straßenbelag |

### Weitere Quellen (manuell)

| Quelle | Wofür |
|---|---|
| **Quaternius** | Ultimate Nature Pack, Gebäude — passt exakt zum Stil |
| **Poly Pizza** | CC0-Suchmaschine für Low-Poly-Modelle |
| **ambientCG** | Ergänzende PBR-Texturen: Beton, Fels |

**Stil-Konsistenz-Regel:** Kein Modell kommt in die Map, bevor es durch den
Normalisierungs-Schritt lief (einheitliche Skalierung, Material auf
`MeshStandardMaterial` mit Projekt-Palette, Draco/meshopt-komprimiert).
Kitbashing aus verschiedenen Gratis-Quellen scheitert sonst am Stil-Mix.

---

## 7. Meilensteine

| # | Inhalt | Ergebnis |
|---|---|---|
| **P0** | Vite/TS-Setup, Engine-Skelett, Render-Loop, Debug-Overlay mit Budget-Ampel | Messbares Fundament |
| **P1** | Heightmap-Baker, Terrain-Renderer, Free-Fly-Kamera, HDRI-Licht | **Erstes fliegbares Bild** |
| **P2** | Postprocessing-Pipeline, Höhennebel, gebackene Verschattung, Wasser, Color-Grading | Die Stimmung sitzt |
| **P3** | Spline-System, Spline-Editor, Terrain-Carving, Straßen-Meshes | Befahrbares Straßennetz |
| **P4** ✅ | CDLOD-Quadtree, Vegetations-Streuung, Instancing, Imposter | Welt füllt sich, Budgets greifen |
| **P5** ✅ | Asset-Pipeline, Landmarks: Tempel, Torii, Dorf, Reisfelder | Zonen bekommen Identität |
| **P6** ✅ | Stadt-Generator, Emissive-Neon, nasser Asphalt, Reflexions-Entscheidung | Der Money-Shot |
| **P7** ◐ | Quality-Presets, Streaming, Ladebildschirm, Profiling | Auslieferbar |
| **P8** ✅ | Politur: Stufen im Gelände, PostFX-Staffelung, Wolken, Terrain-Durchgang, Fluss, Pfade, Fischerdorf, Sandō, Stadtrand, Weltrand | Die Karte trägt ein Spiel |
| **P9** ○ | Die Fahrschicht — Kollision, Fahrzeug, Rundenlogik | Ein Auto fährt eine Runde |
| **P10** ◐ | Stufen, Regler, Auslieferung | Die Stufen tun, was sie versprechen |

**Aktueller Stand (2026-08-08): P0–P6 und P8 abgeschlossen. P7 bleibt auf ◐**
— zwei seiner Kriterien sind ohne Zielhardware nicht prüfbar, eines
(Startdownload) ist gemessen verfehlt. **P10 ist zu zwei Aufgaben von vier
gebaut** (10.0 Messlauf, 10.1 Stufenkopplung); 10.2 (Spieler-Oberfläche) und
10.3/10.4 stehen aus. **P9 ist geplant und nicht gebaut.**

Die Budgets aus §4 sind auf Ultra mit vorgefüllter Streuung nachgemessen:
**173 Draw-Calls** von 800, **958 068 Dreiecke** von 3 000 000,
**307,8 MB** Texturspeicher von 512. Die Kette ist bitgleich reproduzierbar.

> **Zu den drei Zahlen gehört ihr Datum: sie stammen aus der P8-Abnahme vom
> 2026-08-01** und sind seitdem **nicht neu abgelesen**. Der Messlauf vom
> 2026-08-07 nennt für dieselben Budgets an anderen Blickpunkten bis zu
> 681 120 Dreiecke und 165 Draw-Calls — beides weiterhin weit im Budget, aber
> es sind andere Zahlen an anderen Orten, und sie ersetzen die obigen nicht.

> Der ursprüngliche Satz „Nächste Phase: P5" stand hier bis P8.11 und war seit
> P5 falsch. Er ist stehen geblieben, weil niemand die Zeile beim Abschluss
> einer Phase mitgeführt hat — dieselbe Sorte Fehler wie die Zahlen aus einem
> Lauf, den es nicht mehr gibt. **Am 2026-08-08 ist derselbe Fehler ein zweites
> Mal gefunden worden**, diesmal in der Tabelle darüber: sie trug bei P5 bis P8
> keine Haken, obwohl alle vier abgenommen waren. Deshalb steht die Statuszeile
> jetzt ausgeschrieben darunter — eine Tabelle mit Häkchen wird beim
> Phasenabschluss übersehen, ein Satz nicht.

Die **P1-Nachbesserung am Höhenfeld** war für „vor P4" vorgemerkt und ist nicht
erfolgt: die Flanke abzuflachen ändert die Silhouette des Massivs, und das
Massiv ist der Hintergrund der halben Karte — eine Art-Direction-Entscheidung,
die nicht nebenbei mitgetroffen wird. Technisch kostet die Verschiebung nichts,
weil die Vegetations-Streuung zur Laufzeit aus Seed und Chunk-Koordinate
gerechnet wird und einem geänderten Höhenfeld von selbst folgt.

Bekannte offene Punkte, Stand 2026-08-08:

- **Startdownload 43,48 MB** gegen die 15 MB aus §4 — frisch gemessen aus
  `dist/` (53 Dateien, Brotli wo vorhanden, Sourcemaps nicht mitgezählt).
  ~~51,95 MB~~ stand hier bis P10 und stammte aus einem Lauf vor den Props aus
  P8.9. **Die Hälfte steckt in fünf Dateien:** Himmels-HDRI 7,01 · `normal.png`
  5,49 · `nor_gl.jpg` 4,71 · `height.r16` 4,40 · IBL-HDRI 4,13 MB. Rund 9,1 MB
  sind Normalmaps im **JPEG**-Format, was sie nicht nur groß, sondern falsch
  macht — Chromasubsampling zerstört Normalen. Reduktionspfad in
  [PLAN.md](PLAN.md) unter P10.4.
- ~~**Bergpass: 2 Serpentinen statt ≥ 8, Gipfelhöhe 264 m statt 450 m.**~~
  **Erledigt am 2026-08-01: 9 Kehren auf 2616 m.** Die Ursache lag nicht am
  Höhenfeld, sondern an einem Sicherheitsfaktor der Verrundung, der am Ring
  geeicht war — siehe §2.1. Die Gipfelhöhe bleibt unter der Vorgabe und ist
  eine Art-Direction-Frage, keine Messlücke.
- **GPU-Zeit ist auf der Entwicklungsmaschine nicht messbar.** Der eingebaute
  Browser bekommt einen WebGL2-Kontext (ANGLE über den Microsoft Basic Render
  Driver), aber keine `EXT_disjoint_timer_query_webgl2`. Draw-Calls, Dreiecke,
  Texturspeicher und Instanzzahlen sind CPU-seitige Zähler und damit exakt; die
  Bildrate sagt dort über die Zielhardware nichts.

  > **Seit P10.0 gibt es dafür ein Werkzeug statt einer Ausrede.**
  > `japanMap.report()` fährt Blickpunkte × Stufen ab und schreibt eine Datei;
  > wer eine echte GPU hat, lässt ihn dort laufen. Der erste solche Lauf
  > (2026-08-07) liegt vor. **Er lief allerdings auf einer RX 7900 XTX — genau
  > der Karte, die dieser Abschnitt oben als „unbrauchbar als Maßstab" führt.**
  > Belastbar sind daraus das Verhältnis der Stufen untereinander und der
  > prozentuale Aufschlag eines Eingriffs, **nicht** Absolutwerte gegen die
  > Budgets. Eine Messung auf GTX-1660-Klasse fehlt weiterhin.
- **Es gibt keine Benutzeroberfläche im gebauten Stand.** Debug-Panel und
  `window.japanMap` hängen an `import.meta.env.DEV`; ein Besucher bekommt einen
  Canvas ohne Steuerungshinweis, ohne Einstellungen, ohne Pause. Die Stufe ist
  nach dem ersten Start nicht mehr änderbar. Vollständiger Durchgang in
  [PLAN.md](PLAN.md) unter P10.2, Aufgabenliste ebenda.

Ausführungsdetails, Dateilisten und Akzeptanzkriterien pro Phase: **[PLAN.md](PLAN.md)**.
Diese Tabelle ist die Kurzfassung — bei Widersprüchen gilt PLAN.md.
Wo etwas im Quelltext steht und was mit was redet: **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## 8. Offene Punkte

- ~~**SSR-Qualität** — Entscheidung in M6 (siehe 3.2)~~
  **Entschieden in P6, und zwar gemessen statt nach Tuning-Tagen:** gegen die
  Neonschilder stehen nur **19,3 %** der Spiegelungen überhaupt im
  Bildschirmraum, am wichtigsten Standpunkt **4,2 %**. SSR ist damit für diese
  Blickgeometrie strukturell ungeeignet; gebaut wurde eine **planare
  Spiegelung** für die Straßenebene. Das Konfigurationsfeld heißt seitdem
  `reflections`. Messung: `japanMap.reflectionProbe()`.
- ~~**Stadt-Geometrie** — prozeduraler Generator vs. handplatzierte Blöcke~~
  **Entschieden in P6: prozeduraler Generator.** Gebäude werden **je Block**
  zusammengefasst, nicht je Haus — sonst wären es bei 135 Gebäuden allein dafür
  135 Draw-Calls. Das Teilbudget `cityDrawCalls` (< 300) hält das nach.
- **Physik-Engine** — weiterhin offen (Rapier vs. eigene Arcade-Physik). Erst
  relevant wenn gefahren wird; `three-mesh-bvh` liefert die Kollisionsgeometrie
  unabhängig davon.
  > **Offen *und* ausdrücklich ungemessen.** Die Tendenz „Rapier" steht seit P0
  > ohne eine einzige Zahl daneben. P9.2 prüft sie an einem Prüfstand gegen eine
  > eigene Arcade-Physik, bevor irgendetwas gebaut wird — dieselbe Regel, die in
  > P6 eine monatelange Tendenz zu SSR gekippt hat.
- **Ton** — es gibt keinen, und das ist nirgends als Entscheidung vermerkt. Für
  eine Stimmung, die „blaue Stunde nach Regen" heißt, ist das ein großer
  fehlender Anteil. Gehört nach P10 entschieden: bewusst weglassen oder
  einplanen.
