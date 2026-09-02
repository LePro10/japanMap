# japanMap — Technische Spezifikation

> Open-World-Map in Three.js als Basis für ein späteres Browser-Game
> (Racing / Drifting / Erkundung). Stand: 2026-07-26.

---

## 1. Kernentscheidungen

| Bereich | Entscheidung |
|---|---|
| **Stack** | Vanilla Three.js + TypeScript + Vite |
| **Renderer** | WebGL2 + `pmndrs/postprocessing` |
| **Zielplattform** | ~~Desktop, maximale Qualität. Kein Tablet/Mobile-Support (v1)~~ **Seit P12: Desktop *und* Touch.** Fingersteuerung, geräteabhängiger Pixelfaktor und eine Stufenleiter, die 4,4× spannt statt 1,6× |
| **Map-Größe** | 3072 × 3072 m (~9,4 km²) |
| **Art-Direction** | Low-Poly-Geometrie + PBR-Shading. Licht > Texturen |
| **Beleuchtung** | Eine feste Stimmung: **Blaue Stunde nach Regen** |
| **Content** | Hybrid: prozedurales Terrain + Spline-Straßen + CC0-Kitbash-Landmarks |
| **Assets** | Ausschließlich CC0 / kostenlos |
| **Ambition** | Ernstes Projekt — saubere Systeme vor schnellen Ergebnissen |

### Was für ein Spiel das ist — seit P22

> **Bis P21 war dieses Projekt eine Karte mit einem Auto darauf.** Die Spec hat
> das nie anders behauptet („Open-World-Map … als Basis für ein späteres
> Browser-Game"), und die Beschwerde, die P22 ausgelöst hat, war die logische
> Folge davon: *„es ist nicht lustig."* Eine Basis ist kein Spiel.

Seit P22…P24 gibt es eine Antwort auf „und jetzt?":

| | |
|---|---|
| **Fahrmodell** | Arcade, kein Einspurmodell. Die Lenkung ist proportional, der Drift ist eine Entscheidung, es gibt Nitro und Luftsteuerung |
| **Veranstaltungen** | Sechs — vier Rennen mit drei KI-Gegnern, ein Zeitfahren, ein Driftlauf |
| **Wertung** | Driftkette mit Multiplikator bis ×5, verdoppelt in zwei Driftzonen |
| **Fortschritt** | ¥ aus Rennen, Drift und 90 Sammelstücken; drei Fahrzeuge zum Freischalten |
| **Spielgerät** | Sechs Sprungschanzen, zwei Kirschbaum-Driftzonen mit fallenden Blüten |
| **Orientierung** | Nordfeste Minikarte mit Straßennetz, Driftzonen, Schanzen und Gegnern; ein Richtungspfeil zum nächsten Kontrollpunkt (P25) |
| **Rückmeldung** | Meldetöne für Sammelstück, Kontrollpunkt und Rundenende; ein Aufsammel-Effekt am Stück selbst (P25) |
| **Sprache** | Die Spieler-Oberfläche ist **englisch**. Code, Kommentare und Doku bleiben deutsch |

Die letzte Zeile ist eine Entscheidung über die Reichweite und keine über den
Stil: CrazyGames' Publikum ist global, und eine deutschsprachige Oberfläche
kostet dort den größten Teil davon. Die Trennlinie verläuft am DOM — was in
`src/ui/` landet, ist englisch, was in einem Kommentar steht, nicht.

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
| ~~Initialer Download~~ | ~~< 15 MB (KTX2 + meshopt)~~ → siehe 4.1 |
| Frame-Time-Budget | 16,6 ms → davon max. 5 ms Postprocessing |

### 4.1 Die Zielplattform ist CrazyGames — und sie hat eigene Zahlen

**Beauftragt am 2026-08-18.** Damit ist die Download-Zeile nicht mehr ein
selbstgesetztes Ziel, sondern eine **Annahmebedingung**. Die 15 MB, die hier
seit P0 standen, hatten nie eine Herkunft; die Zahlen unten haben eine.

| Vorgabe (Stand 2026-08-18) | CrazyGames | japanMap | |
|---|---|---|---|
| Startdownload | ≤ 50 MB | **17,02 MB** | ✅ |
| **Startdownload für die Mobile-Homepage** | **≤ 20 MB** | **17,02 MB** | ✅ |
| Gesamtgröße | ≤ 250 MB | 61,15 MB | ✅ |
| Dateizahl | ≤ 1500 | 46 Anfragen | ✅ |
| Zeit bis zum Spielen | ≤ 20 s | **0,9 s** ⚠ warm, localhost | siehe unten |
| Browser | Chrome, Edge | ✅ | |
| Eingabe | Maus, Tastatur, Touch | ✅ seit P12.4 | |
| **CrazyGames-SDK** | **Pflicht für Full Launch** | **nicht integriert** | ⛔ |
| Ton, `muteAudio`-fähig | Pflicht für HTML5 | ✅ seit P16 | Anschluss steht |
| Chromebook, 4 GB RAM | muss flüssig laufen | **nicht geprüft** | ⚠ |

> **Der eine harte Blocker vor einem Upload ist das SDK.** Ohne es gibt es
> keinen Full Launch und keine Monetarisierung, und das Gesamtbudget fällt von
> 250 MB auf 50 MB (japanMap läge mit 61,15 MB dann **darüber**). Verlangt sind
> `loadingStart`/`loadingStop`, `gameplayStart`/`gameplayStop` und ein
> `muteAudio`-Rückruf, der Vorrang vor der Toneinstellung im Spiel hat.
>
> P16 hat die Tonschicht gebaut und dafür bereits geteilt: `AudioSystem`
> unterscheidet `#userMuted` (Menü) von `#externallyMuted` (SDK), und
> `setExternallyMuted()` ist die Anschlussstelle. Es fehlt nur noch das SDK
> selbst — bewusst, es war vom Auftrag für P16 ausgenommen.
>
> Zwei weitere QA-Punkte sind offen und billig: „Land directly in gameplay"
> (der Ablauf ist Ladebildschirm → „Starten" → Freiflug) und ein Lauf mit
> aktivem AdBlock.

> **Der eigentliche Gewinn von P15 steht in der zweiten Zeile.** Mit 40,83 MB
> war das Spiel über der 20-MB-Schwelle und damit von der **Mobile-Homepage
> ausgeschlossen** — die 50-MB-Grenze war nie das Problem. Der gestufte Start
> holt genau diese Schwelle, und zwar mit 3 MB Abstand.
>
> Was daraus folgt: **die 15-MB-Zeile ist gegenstandslos.** Sie weiter zu
> verfolgen hieße, gegen eine Zahl zu optimieren, die niemand verlangt. Der
> nächste Hebel (`height.r16` delta-kodiert, 5,76 MB) bleibt trotzdem
> aufgeschrieben — als Reserve für den Fall, dass die Schwelle sinkt oder
> Inhalt dazukommt, nicht als offene Aufgabe.

**Die Zeit bis zum Spielen: 0,9 s** am gebauten Stand, warm und über localhost.
Alle 46 Anfragen sind nach 0,71 s durch, der „Starten"-Knopf steht nach 0,9 s.
Aufgeschlüsselt über `engine.bootProfile` sind die Rechenkosten **1006 ms**:

| Schritt | ms |
|---|---|
| Shader übersetzen | 299 |
| RoadSystem | 209 |
| AtmosphereSystem | 162 |
| TerrainSystem | 135 |
| PropSystem | 67 |
| ScatterSystem | 52 |
| LightingRig | 46 |
| die übrigen elf zusammen | 36 |

> **Hier stand bis zum 2026-08-18 „8,61 s", und die Zahl war falsch gemessen.**
> Sie stammte aus einem Konsolenlauf, der nach dem Erscheinen des Knopfes
> pollte — gemessen hat er damit, **wann jemand hingesehen hat**, nicht wann der
> Knopf kam. Der richtige Wert stand die ganze Zeit in der Konsole: der
> Ladebildschirm schreibt seine eigene Dauer seit P13 (`Ladebildschirm: 0.9 s`).
>
> Daraus folgte auch eine falsche **Schlussfolgerung**, und die ist der teurere
> Teil: „Zeit bis zum Spielen ist die Zeile, die Sorgen macht — nicht der
> Download." Genau umgekehrt. Die Rechenzeit ist mit 1,0 s unauffällig; was auf
> einer langsamen Verbindung zählt, ist der Download.
>
> Lehre in einem Satz, und es ist dieselbe wie an sechs anderen Stellen dieser
> Doku: **wer eine Zeit misst, muss den Startpunkt besitzen.** Ein Beobachter,
> der von außen nachschaut, misst seinen eigenen Aufruf mit.

Was damit **weiterhin offen** ist, jetzt aber richtig eingeordnet:

1. **Der Download auf einer echten Verbindung.** 17,02 MB sind bei 10 Mbit/s
   rund 14 s, bei 5 Mbit/s rund 27 s — und dann sind die 20 s überschritten.
   Das ist der Posten, der die Zeile reißen kann, nicht die Rechenzeit.
2. **Ein Chromebook mit 4 GB RAM**, das CrazyGames ausdrücklich als Zielgerät
   nennt. Die 1006 ms sind auf einer RX 7900 XTX gemessen; dort ist es ein
   Vielfaches. `engine.bootProfile` steht genau dafür im Auslieferungsbau und
   nicht nur im Dev-Build — die Aufschlüsselung ist auf dem fremden Gerät
   ablesbar.

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
| **P9** ✅ | Die Fahrschicht — Kollision, Fahrzeug, Rundenlogik | Vollständig: 9.1/9.2 in P14, 9.3 am 2026-08-18. **Ein Auto fährt eine Runde**, 324,72 s auf dem Ring |
| **P10** ◐ | Stufen, Regler, Auslieferung | Die Stufen tun, was sie versprechen |
| **P11** ◐ | Sichtbarkeit & Dichte | Bäume bis 1200 m, Ausdünnung nach Entfernung statt Fläche, Boden trägt seine Farbe |
| **P12** ◐ | Handy, Touch und die echten Kosten | Fingersteuerung, A/B-Messstand, Stufenleiter spannt 4,4× statt 1,6× |
| **P13** ◐ | Startbildschirm, Reiter, Debug im Menü | Im laufenden Bild steht nichts von der Oberfläche |
| **P14** ◐ | Die Fahrschicht: Freeride | Ein Auto fährt alle acht Strecken, 0 cm Durchdringung |
| **P15** ✅ | Der gestufte Start | Erststart 40,83 → **17,02 MB** (Mobile-Schwelle 20), Wächter über der Bildrate, Nachladen im Hintergrund |

**Aktueller Stand (2026-08-18): P0–P6 und P8 abgeschlossen; P7 und P10–P15 auf
◐.** Die Karte trägt seit P14 ein Spiel — ein Auto fährt alle acht Strecken mit
0 cm Durchdringung —, und seit P15 lädt der Erststart **17,02 MB** statt 40,83.
Was in den ◐-Phasen offen ist, steht als Tabelle im Kopf von
[PLAN.md](PLAN.md); die Kurzfassung: es gibt **keinen Ton**, und vier Phasen in Folge lassen dieselbe Zeile offen — „auf
echter Zielhardware gemessen".

> ~~Aktueller Stand (2026-08-08)~~ stand hier bis zum 2026-08-18, also zehn Tage
> und fünf Phasen zu lange. Es ist **das dritte Mal**, dass eine Statuszeile
> dieses Projekts veraltet gefunden wird (siehe den Absatz darunter über
> „Nächste Phase: P5" und die Tabelle ohne Haken). Der Grund ist jedes Mal
> derselbe: die Zeile gehört keiner Phase, also zieht sie beim Phasenabschluss
> niemand nach. Die Tabelle darüber hat seit heute für **jede** Phase eine
> Zeile — eine fehlende fällt damit auf, eine veraltete Prosazeile nicht.

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
- ~~**GPU-Zeit ist auf der Entwicklungsmaschine nicht messbar.**~~ Der eingebaute
  Browser bekommt einen WebGL2-Kontext (ANGLE über den Microsoft Basic Render
  Driver), aber keine `EXT_disjoint_timer_query_webgl2`. Draw-Calls, Dreiecke,
  Texturspeicher und Instanzzahlen sind CPU-seitige Zähler und damit exakt; die
  Bildrate sagt dort über die Zielhardware nichts.

  > **Der Satz gilt für *eine* der Maschinen dieses Projekts, nicht für das
  > Projekt.** Am 2026-08-16 ist die Arbeit auf einen Rechner mit **RX 7900 XTX**
  > gewechselt; dort ist die Zeitabfrage vorhanden und liefert Werte. Eine
  > vorhandene Zeitabfrage ist allerdings noch keine Messung — wie unter diesen
  > Umständen richtig gemessen wird (interleavt, niedriges Perzentil, gemessenes
  > Rauschband), steht in CLAUDE.md und als Werkzeug in `japanMap.ab()`. Die
  > Karte bleibt als **Maßstab** unbrauchbar, siehe §4: belastbar sind
  > Verhältnisse, nicht Absolutwerte gegen die Budgets.

  > **Seit P10.0 gibt es dafür ein Werkzeug statt einer Ausrede.**
  > `japanMap.report()` fährt Blickpunkte × Stufen ab und schreibt eine Datei;
  > wer eine echte GPU hat, lässt ihn dort laufen. Der erste solche Lauf
  > (2026-08-07) liegt vor. **Er lief allerdings auf einer RX 7900 XTX — genau
  > der Karte, die dieser Abschnitt oben als „unbrauchbar als Maßstab" führt.**
  > Belastbar sind daraus das Verhältnis der Stufen untereinander und der
  > prozentuale Aufschlag eines Eingriffs, **nicht** Absolutwerte gegen die
  > Budgets. Eine Messung auf GTX-1660-Klasse fehlt weiterhin.
- ~~**Es gibt keine Benutzeroberfläche im gebauten Stand.** Debug-Panel und
  `window.japanMap` hängen an `import.meta.env.DEV`; ein Besucher bekommt einen
  Canvas ohne Steuerungshinweis, ohne Einstellungen, ohne Pause. Die Stufe ist
  nach dem ersten Start nicht mehr änderbar.~~
  **Erledigt in P10.2** (2026-08-10) mit `src/ui/PlayerUi.ts` — ohne
  `import.meta.env.DEV`. Steuerungshinweis, Pausenmenü an Escape, fünf
  Voreinstellungen plus acht Einzelreglern, „Neu einstufen" und die sechzehn
  Blickpunkte als Sprungliste; am Build gemessen, nicht am Dev-Server.
  **Fünf der zehn Befunde des Durchgangs bleiben offen**: Ton, `fatal()` ohne
  Rückweg, inhaltsloser Ladebildschirm, Ruckler beim Stufenwechsel (17
  zusätzliche Shader-Übersetzungen), kein Fotomodus. Vollständiger Durchgang und
  Abnahme in [PLAN.md](PLAN.md) unter P10.2.

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
- ~~**Physik-Engine** — weiterhin offen (Rapier vs. eigene Arcade-Physik).~~
  **Entschieden in P14: eigene Arcade-Physik.** Die Tendenz „Rapier" stand seit
  P0 ohne eine einzige Zahl daneben; entschieden hat am Ende nicht ein
  Prüfstandsvergleich, sondern die Anforderung. Verlangt war Arcade-Drift im
  Touge-Stil — „der Hinterwagen bricht auf Gasstoß aus und lässt sich mit
  Gegenlenken halten". Das ist eine Eigenschaft der **Reifenkennlinie**, und die
  schreibt man in drei Zeilen hin, statt sie einem Solver abzuringen.

  Was die Entscheidung an Zahlen trägt: **16,11 kB** minifiziert für Fahrmodell,
  Kollision, Kamera und Fahrzeuggeometrie zusammen (Rapier bringt WASM in einen
  Startdownload, der mit 51,95 MB schon weit über den 15 MB dieses Kapitels
  liegt), **0,003…0,022 ms** CPU je Simulationsschritt, **4 Draw-Calls und 1024
  Dreiecke** für das Fahrzeug im Bild. Der fixe Zeitschritt, den eine zweite
  Engine mitgebracht hätte, existiert seit P0 in `RenderLoop`.

  `three-mesh-bvh` bleibt **unbenutzt**, und auch das ist jetzt eine
  Entscheidung mit Begründung statt einer offenen Zeile: die Hindernisse dieser
  Karte sind achsparallele Rechtecke (Gebäude), Polygonzüge (Leitplanken) und
  Kreise (Props). Für jede dieser Formen gibt es eine geschlossene
  Distanzfunktion — und genau die braucht eine Kollisionsauflösung, während ein
  BVH einen Dreiecks*treffer* liefert. Ausführlich im Kopf von
  `src/game/CollisionWorld.ts`.
- **Ton** — es gibt keinen, und das ist nirgends als Entscheidung vermerkt. Für
  eine Stimmung, die „blaue Stunde nach Regen" heißt, ist das ein großer
  fehlender Anteil. Gehört nach P10 entschieden: bewusst weglassen oder
  einplanen.
