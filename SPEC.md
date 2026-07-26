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

Jede Zone ~1,5 km Kantenlänge → bei 120 km/h ca. 45 s Durchfahrt. Das reicht
für einen echten Ortswechsel.

**Verbindungen:** Eine Ringstraße verbindet alle Zonen. Der Bergpass ist eine
Stichstraße mit Serpentinen (Drift-Strecke). Ein Küstenhighway läuft im Süden.
Der Höhenunterschied von 450 m ist der stärkste Hebel, damit 3 km groß wirken.

> **Die Serpentinen stehen noch aus (Stand P3).** Der Bergpass fährt, hält
> Radius und Steigung, hat aber **null Kehren**. Das ist keine Auslassung im
> Bau, sondern ein Widerspruch in dieser Vorgabe: 408 Höhenmeter brauchen bei
> 11 % Höchstneigung über drei Kilometer Strecke, und der Hang zwischen
> Ringanschluss und Gipfel gibt sie nicht her. Solange das Höhenfeld so aussieht,
> lässt sich die Anforderung nicht erfüllen — nötig wäre ein schmaleres,
> steileres Tal im Massiv. Siehe PLAN.md, „Warum der Bergpass keine Kehren hat".

### 2.2 Terrain

- **Quelle:** Prozedural generiert (Simplex/FBM + Erosions-Pass + Zonen-Masken),
  aber **einmalig gebacken** in eine 16-bit-Heightmap (2048², ≈1,5 m/px).
  Deterministisch, versionierbar, von Hand nacheditierbar.
- **LOD:** Quadtree-Chunked-LOD mit Vertex-Morphing zwischen den Stufen.
  Chunk = 256 m. 12 × 12 = 144 Chunks.
  LOD0 = 2 m/Vertex nah → LOD3 = 16 m/Vertex fern.
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
- `InstancedMesh` gruppiert nach (Chunk × Asset × LOD)
- Billboard-Imposter ab ~150 m Distanz
- Ziel: ~50.000 Instanzen sichtbar bei < 100 Draw-Calls

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
| Key-Light | 1 × `DirectionalLight`, sehr flach, kühl-blau, mit CSM (4 Kaskaden) |
| Neon / Laternen | Emissive-Materialien + Bloom. Echte `PointLight` nur an ~10 Schlüsselstellen |
| Nasser Asphalt | Niedrige Roughness + Roughness-Variation-Map + SSR |
| Nebel | Custom Height-Fog im Shader (dichter in den Tälern) |
| Schatten | CSM 4 × 2048, Kaskaden bei 30 / 100 / 350 / 1200 m |

**Kein Tag-Nacht-Zyklus.** Das erlaubt später gebackene Lightmaps und
Reflexions-Probes — dort liegt der größte Qualitätssprung.

### 3.2 Postprocessing-Kette

```
Render → GTAO → SSR → Bloom → DoF(opt) → AgX-Tonemapping → LUT → SMAA → Vignette
```

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

**Quality-Presets** (Ultra / High / Medium / Low) skalieren: Schattenauflösung,
SSR an/aus, GTAO-Samples, Sichtweite, Vegetationsdichte, Render-Scale.
Von Anfang an eingebaut — nachträglich einzuziehen ist teuer.

---

## 5. Projektstruktur

```
src/
├── core/          Engine, RenderLoop, ResourceManager, EventBus
├── world/         TerrainSystem, ChunkManager, RoadSystem, Scatter, Water
├── render/        PostFXPipeline, LightingRig, MaterialLibrary, QualityPresets
├── camera/        FreeFlyController  (später: VehicleCamera, PhotoMode)
├── debug/         StatsOverlay, Tweakpane-Panels, FreezeCulling-View
├── config/        world.config.ts, quality.config.ts
└── assets/        heightmap, hdri, models, roads.json

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
| **P2** | Postprocessing-Pipeline, Höhennebel, CSM, Wasser, Color-Grading | Die Stimmung sitzt |
| **P3** | Spline-System, Spline-Editor, Terrain-Carving, Straßen-Meshes | Befahrbares Straßennetz |
| **P4** | CDLOD-Quadtree, Vegetations-Streuung, Instancing, Imposter | Welt füllt sich, Budgets greifen |
| **P5** | Asset-Pipeline, Landmarks: Tempel, Torii, Dorf, Reisfelder | Zonen bekommen Identität |
| **P6** | Stadt-Generator, Emissive-Neon, nasser Asphalt, Reflexions-Entscheidung | Der Money-Shot |
| **P7** | Quality-Presets, Streaming, Ladebildschirm, Profiling | Auslieferbar |

**Aktueller Stand: P0 und P1 abgeschlossen (2026-07-25). Nächste Phase: P2.**

Bekannte offene Budget-Abweichung: der initiale Download liegt bei 42,8 MB
gegen die 15 MB aus §4 — die dafür vorgesehene KTX2-Pipeline ist P5.1.
Aufschlüsselung und Reduktionspfad in [PLAN.md](PLAN.md), Risiken zu P1.

Ausführungsdetails, Dateilisten und Akzeptanzkriterien pro Phase: **[PLAN.md](PLAN.md)**.
Diese Tabelle ist die Kurzfassung — bei Widersprüchen gilt PLAN.md.

---

## 8. Offene Punkte

- **SSR-Qualität** — Entscheidung in M6 (siehe 3.2)
- **Physik-Engine** — noch offen (Rapier vs. eigene Arcade-Physik). Erst relevant
  wenn gefahren wird; `three-mesh-bvh` liefert die Kollisionsgeometrie unabhängig davon
- **Stadt-Geometrie** — prozeduraler Generator vs. handplatzierte Blöcke. Entscheidung in M6
