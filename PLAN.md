# japanMap — Implementierungsplan

> Ausführungsplan zu [SPEC.md](SPEC.md). Die Spec sagt **was** gebaut wird,
> dieser Plan sagt **in welcher Reihenfolge, mit welchen Dateien und woran wir
> merken, dass eine Phase fertig ist**.
>
> Stand: 2026-07-26 · **P0–P3 abgeschlossen** · Nächste Phase: **P4**

---

## Wie dieser Plan zu lesen ist

Jede Phase hat vier feste Abschnitte:

- **Ziel** — der eine Satz, warum die Phase existiert
- **Aufgaben** — durchnummeriert, in Ausführungsreihenfolge, jede mit Zieldatei
- **Akzeptanzkriterien** — objektiv prüfbar. Nicht erfüllt = Phase nicht fertig
- **Risiken** — was schiefgehen kann und was dann passiert

**Regel:** Keine Phase wird begonnen, bevor die Akzeptanzkriterien der vorherigen
erfüllt sind. Ausnahmen werden hier dokumentiert, nicht mündlich vereinbart.

---

## Konventionen (gelten global, ab P0)

### Koordinatensystem

| | |
|---|---|
| Achsen | Y-up (Three.js-Standard), rechtshändig |
| Einheit | **1 Three.js-Unit = 1 Meter**. Keine Ausnahme, keine Skalierungsfaktoren |
| Weltausdehnung | X ∈ [−1536, +1536], Z ∈ [−1536, +1536] |
| Höhe | Y = 0 ist **Meeresspiegel**. Terrain: −40 (Meeresboden) bis +450 (Gipfel) |
| Norden | −Z |
| Winkel | Intern immer Radiant. Grad nur in Debug-UI |

### Namensgebung

- Dateien: `PascalCase.ts` für Klassen, `camelCase.ts` für Module, `kebab-case.mjs` für Tools
- Systeme enden auf `System` (`TerrainSystem`), Verwalter auf `Manager` (`ChunkManager`)
- Konfiguration: `*.config.ts`, exportiert ein `as const`-Objekt
- Alles, was gebacken wird, landet in `assets/generated/` und ist **nie** handeditiert

> **Nach einem frischen Clone erst backen, dann starten.** `assets/generated/`
> steht in `.gitignore` — der Inhalt ist reproduzierbar aus Seed und Werkzeugen
> und gehört deshalb nicht ins Repository. `src/world/terrainAssets.ts` importiert
> die Dateien aber statisch, also schlagen `npm run dev` und `npm run build` ohne
> sie mit einem Auflösungsfehler fehl:
>
> ```bash
> npm install
> npm run world   # backt alles der Reihe nach (~45 s)
> npm run dev
> ```
>
> `npm run world` ist die Abkürzung für diese Kette — und die Reihenfolge darin
> ist nicht beliebig, sondern zirkulär aufgelöst:
>
> ```bash
> npm run bake    # Terrain ohne Straßen — der Generator braucht ein Höhenfeld
> npm run sun     # Sonnenrichtung aus dem Himmels-HDRI
> npm run roads   # Straßennetz, an das Gelände angepasst
> npm run bake    # noch einmal, jetzt mit eingeschnittenen Straßen
> npm run shade   # Verschattung des fertigen Geländes
> ```

### Codebasis-Regeln

- TypeScript `strict: true`, kein `any` ohne begründenden Kommentar
- Jedes System besitzt eine `dispose()`-Methode und gibt GPU-Ressourcen frei
- Keine `import * as THREE` in Systemen — nur benannte Importe (Tree-Shaking)
- Magische Zahlen gehören in `src/config/`, nicht in den Code
- Shader-Code in `.glsl`-Dateien, per `vite-plugin-glsl` importiert — nicht als Template-String

---

## Phasenübersicht

| Phase | Titel | Ergebnis | Abhängig von |
|---|---|---|---|
| **P0** ✅ | Fundament & Toolchain | Leere Szene, 60 FPS, Debug-Overlay | — |
| **P1** ✅ | Terrain & Freiflug | Erstes fliegbares Bild | P0 |
| **P2** ✅ | Licht & Atmosphäre | Die Stimmung sitzt | P1 |
| **P3** ✅ | Splines & Straßen | Befahrbares Straßennetz | P1 |
| **P4** | LOD & Vegetation | Gefüllte Welt in Budget | P1, P3 |
| **P5** | Asset-Pipeline & Landmarks | Zonen mit Identität | P4 |
| **P6** | Stadt & Reflexionen | Der Money-Shot | P2, P5 |
| **P7** | Optimierung & Auslieferung | Läuft auf Zielhardware | alle |

---

# P0 — Fundament & Toolchain ✅

**Ziel:** Ein leeres, aber vollständig instrumentiertes Gerüst. Ab hier ist jede
Performance-Aussage messbar statt gefühlt.

> **Abgeschlossen am 2026-07-25.** Abweichungen von der ursprünglichen Planung
> sind unten bei den betroffenen Aufgaben vermerkt.

### Aufgaben

**0.1 — Projekt-Setup**
```
package.json, tsconfig.json, vite.config.ts, index.html, .gitignore
```
- Vite + TypeScript (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Plugins: `vite-plugin-glsl`
- Laufzeit-Deps: `three`, `postprocessing`, `three-mesh-bvh`, `simplex-noise`
- Dev-Deps: `@types/three`, `tweakpane`, `@tweakpane/core`, `stats-gl`, `pngjs`
- `.gitignore`: `node_modules`, `dist`, `.cache`, `assets/generated`
- Git-Repo initialisieren (existiert noch nicht)

> **Node-Version ist ein offener Punkt.** Die Maschine läuft auf Node 18.19,
> das seit April 2025 kein Sicherheitsupdate mehr bekommt. Zwei Werkzeuge aus
> diesem Plan brauchen Node ≥ 20 und sind deshalb noch nicht installiert:
> `vite-plugin-glsl` ab 1.4 (hier auf 1.3.3 festgenagelt) und
> `@gltf-transform/cli` (die verpflichtende Asset-Pipeline aus **P5.1**).
> Spätestens vor P5 muss Node auf 22 LTS. Vorher ist es ohne Folgen.

> **`@tweakpane/core` muss ausdrücklich als Dev-Abhängigkeit stehen.**
> Tweakpane 4 liefert seine Typen mit Verweisen auf dieses Paket aus, deklariert
> es aber nicht als Abhängigkeit. Ohne den Eintrag findet TypeScript `FolderApi`
> nicht und meldet stattdessen, `Pane` habe keine Methode `addFolder` — eine
> Fehlermeldung, die in die falsche Richtung zeigt.

> **Entscheidung:** `assets/generated/` wird **nicht** eingecheckt. Alles darin ist
> aus Seed + Tools reproduzierbar. Ein `npm run bake` stellt es her. Sonst
> vermüllt das Repo mit 100-MB-Binärdateien pro Terrain-Iteration.

**0.2 — Engine-Kern** → `src/core/Engine.ts`, `RenderLoop.ts`, `EventBus.ts`
- `Engine`: besitzt Renderer, Szene, Kamera, Systemliste. `init()`, `update(dt)`, `dispose()`
- `RenderLoop`: **Akkumulator mit fixem Simulationsschritt** (60 Hz) plus variablem
  Render-Schritt mit Interpolations-Alpha. Wird jetzt gebaut, weil Fahrphysik
  später deterministische Schritte braucht — nachträglich einzuziehen bedeutet,
  jedes System anzufassen
- Clamping: max. 5 Simulationsschritte pro Frame (Spiral-of-Death-Schutz bei Tab-Wechsel)
- `EventBus`: typisierte Pub/Sub, damit Systeme sich nicht gegenseitig importieren

**0.3 — Renderer-Konfiguration** → `src/core/createRenderer.ts`
```ts
antialias: false          // SMAA übernimmt das in P2
powerPreference: 'high-performance'
outputColorSpace: SRGBColorSpace
toneMapping: AgXToneMapping    // wandert in P2 in die PostFX-Kette
shadowMap: { enabled: true, type: PCFSoftShadowMap }
```
- `setPixelRatio(Math.min(devicePixelRatio, 2))` — darüber wird es sinnlos teuer
- Kontextverlust behandeln (`webglcontextlost`/`restored`)
- Resize-Observer statt `window.onresize` (reagiert auf Layout, nicht nur Fenster)

**0.4 — ResourceManager** → `src/core/ResourceManager.ts`
- Loader: `RGBELoader`, `GLTFLoader` (+ Draco, meshopt), `KTX2Loader`, `TextureLoader`
- Promise-Cache: gleiche URL zweimal angefordert = ein Netzwerk-Request
- Dispose-Register: jede erzeugte Textur/Geometrie wird registriert und bei
  `dispose()` freigegeben. Ohne das leckt WebGL-Speicher bei jedem Hot-Reload

> **Umgesetzt mit zwei Abweichungen.**
>
> 1. Die glTF-Kette (`GLTFLoader` + Draco + KTX2 + meshopt) wird per
>    `await import()` erst beim ersten Modell geladen. Statisch importiert lag
>    sie im Startbundle: 713 kB statt 578 kB, für Code, der vor P5 nie läuft.
>    Das 15-MB-Budget aus SPEC §4 gilt für das *erste Bild*.
> 2. **Keine Decoder-Pfade setzen.** three löst die Draco- und Basis-Decoder
>    seit r180 selbst über `new URL(…, import.meta.url)` auf, und Vite bündelt
>    sie dadurch mit Hash-Namen. Ein `setDecoderPath()` schaltet genau diese
>    Auflösung ab (`KTX2Loader` prüft `transcoderPath === ''`). Der ursprünglich
>    gebaute Kopierschritt nach `public/` hat die Dateien deshalb ein zweites
>    Mal ausgeliefert — rund 1,9 MB doppelt — und wurde wieder entfernt.

**0.5 — Konfiguration** → `src/config/world.config.ts`, `quality.config.ts`
```ts
export const WORLD = {
  size: 3072,          // Meter, quadratisch
  seaLevel: 0,
  maxHeight: 450,
  minHeight: -40,
  chunkSize: 256,      // → 12×12 = 144 Chunks
  heightmapRes: 2048,  // 1.5 m pro Texel
} as const;
```

**0.6 — Debug-Infrastruktur** → `src/debug/StatsOverlay.ts`, `DebugPanel.ts`
- `stats-gl`: FPS, CPU-ms, GPU-ms (nutzt `EXT_disjoint_timer_query_webgl2`)
- Eigenes Panel aus `renderer.info`: **Draw-Calls, Dreiecke, Programme, Geometrien, Texturen**
- **Budget-Ampel:** jede Metrik aus SPEC §4 wird grün/gelb/rot eingefärbt.
  Das ist die Kernfunktion des Overlays — auf einer RX 7900 XTX ist die
  Framerate kein Signal, die Zahlen sind es
- Tweakpane-Container, Systeme registrieren eigene Ordner
- Ein-/ausblendbar mit `F1`, Zustand in `localStorage`

### Akzeptanzkriterien
- [x] `npm run dev` startet, zeigt leere Szene mit sichtbarem Overlay
- [x] Framerate stabil, GPU-ms wird angezeigt (nicht `n/a`) — gemessen 0,02 ms
      bei leerer Szene, also eine echte Messung und keine gerundete Null
- [x] Fenster-Resize funktioniert ohne Verzerrung (Canvas-Backingstore und
      `camera.aspect` folgen der CSS-Größe, geprüft bei 529×714 und 1280×720)
- [x] `engine.dispose()` in der Konsole → `renderer.info.memory` fällt auf 0
      (Geometrien 4 → 0, Programme 3 → 0, Szene geleert, Kontext freigegeben)
- [x] TypeScript kompiliert ohne Fehler und ohne `any`
- [x] **Zusätzlich geprüft:** Ampel schaltet nachweislich grün → gelb → rot
      (700 Draw-Calls = gelb, 905 = rot) und die Texturspeicher-Schätzung trifft
      eine 2048²-RGBA-Textur auf 16 MB genau
- [x] **Zusätzlich geprüft:** Produktions-Build enthält weder Tweakpane noch
      stats-gl noch das Debug-Gerüst

### Risiken
- **GPU-Timer nicht verfügbar** (je nach Browser/Treiber). → Fallback auf CPU-ms,
  Overlay zeigt das ehrlich an statt zu schweigen.
  *Umgesetzt und erweitert:* es reicht nicht, nur auf die Extension zu prüfen.
  Auf manchen Treibern ist sie vorhanden und liefert trotzdem dauerhaft Nullen —
  und eine `0,00 ms` im Overlay liest sich wie „kostet nichts". `FrameTimer`
  zählt deshalb Null-Messungen und schaltet nach 180 Stück auf `n/a` um.

---

# P1 — Terrain & Freiflug ✅

> **Abgeschlossen am 2026-07-25.** Gemessen auf AMD RX 7900 XTX (ANGLE), 1280×720:
> 240 FPS, GPU 0,44 ms, 4 Draw-Calls, 2.353.168 Dreiecke, 187 MB Texturspeicher.
> Vier Abweichungen vom Plan, alle unten am betroffenen Punkt dokumentiert:
> Gittergröße 768 statt 1024, R16UI statt RedFormat/UnsignedShortType,
> Detail-Normalen deutlich schwächer, IBL-Intensität halbiert.
>
> **Offen und bewusst verschoben:** der initiale Download liegt bei 42,8 MB
> gegen ein Budget von 15 MB (SPEC §4) — siehe Risiken am Ende der Phase.

**Ziel:** Das erste Bild, das man ansehen will. Fliegbares 3-km-Terrain mit
HDRI-Beleuchtung.

### Aufgaben

**1.1 — Heightmap-Baker** → `tools/bake-terrain.mjs`

Offline-Node-Skript. Erzeugt das Terrain **einmalig** und deterministisch aus
einem Seed. Kein Laufzeit-Noise — das Terrain muss von Hand nacheditierbar und
zwischen Läufen identisch sein.

Generierungs-Kette, in dieser Reihenfolge:
1. **Kontinentalbasis** — großskaliges FBM (4 Oktaven), definiert Land/Meer
2. **Küsten-Abfall** — Süd-Kante läuft glatt unter den Meeresspiegel
3. **Gebirgsmassiv** — *Ridged Multifractal* im Nordwesten, maskiert durch eine
   Radialmaske. Ridged Noise (statt normalem FBM) erzeugt scharfe Grate statt
   runder Hügel — der Unterschied zwischen „Berg" und „Beule"
4. **Ebenen-Einebnung** — Reisfeld-Zone wird gegen einen Zielwert interpoliert
5. **Hydraulische Erosion** — Droplet-Simulation, ~2 Mio. Tropfen.
   *Der wichtigste Schritt.* Erzeugt Rinnen, Geröllfächer und Talsohlen.
   Ohne Erosion sieht jedes Noise-Terrain nach Noise aus
6. **Zonenmaske** — 4 Kanäle (Fels / Gras / Sand / Reisfeld) aus Höhe, Steilheit
   und Zonen-Radialmasken

Ausgabe nach `assets/generated/terrain/`:

| Datei | Format | Zweck |
|---|---|---|
| `height.r16` | Raw Uint16, 2048² | Laufzeit — kein Dekodier-Aufwand, exakte Werte |
| `height_preview.png` | 8-bit PNG | Nur zum Anschauen im Dateimanager |
| `normal.png` | RGB, 2048² | Vorberechnete Normalen (Sobel), spart Shader-Samples |
| `zones.png` | RGBA, 1024² | Splat-Gewichte |
| `meta.json` | JSON | Seed, Min/Max-Höhe, **Min/Max pro Chunk** (für Culling in P4) |

CLI: `node tools/bake-terrain.mjs --seed 20260725 --res 2048 --erosion 2000000`

> **Warum `.r16` und nicht PNG:** 16-bit-PNG-Dekodierung im Browser ist unzuverlässig
> (Canvas normalisiert auf 8 bit). Rohe Binärdaten per `fetch` → `Uint16Array` sind
> exakt, schneller und trivial zu debuggen.

> **Umgesetzt, mit drei Anmerkungen:**
>
> 1. **Erosion ist schnell.** Der Plan schätzte 2–5 Minuten für 2 Mio. Tropfen und
>    sah Worker-Threads als Ausweg vor. Gemessen: **12,2 s für den ganzen Bake**
>    bei 2048², davon rund 5 s Erosion. Der Grund ist die frühe Abbruchbedingung —
>    die meisten Tropfen versickern lange vor den 42 Schritten. Worker-Threads sind
>    damit gegenstandslos, und der Bake bleibt deterministisch, was er verteilt
>    nicht bliebe.
>
> 2. **pngjs-Falle.** `PNG.sync.write(png, options)` liest `colorType` und
>    `inputColorType` ausschließlich aus dem **zweiten Argument**. Ein `colorType`
>    im `new PNG({...})` bleibt wirkungslos, pngjs nimmt dann RGBA an und
>    interpretiert Graustufen- und RGB-Puffer um. Das Ergebnis ist kein Fehler,
>    sondern ein Bild, das vervielfacht und in den oberen Bildrand gestaucht ist.
>    Deshalb schreibt der Baker über einen `writePng()`-Wrapper, der beide Angaben
>    erzwingt und die Puffergröße vorher prüft.
>
> 3. **Texelabstand ist `size / (res - 1)`, nicht `size / res`.** Die Heightmap ist
>    ein Gitter von Stützstellen, dessen äußerste Reihe genau auf der Weltkante
>    liegt. Nur so decken CPU-Sampler und Vertex-Shader exakt [-half, +half] ab.
>    Bei `size / res` fehlte am Rand ein halbes Texel — genau die Naht, die
>    Kriterium 1 dieser Phase ausschließt. `world.config.ts` wurde entsprechend
>    korrigiert; der Baker schreibt den Wert nach `meta.json`, und
>    `TerrainSampler.load()` bricht mit klarer Meldung ab, wenn beide auseinanderlaufen.

**1.2 — Terrain-Sampler (CPU)** → `src/world/TerrainSampler.ts`
- Lädt `height.r16`, bietet `getHeightAt(x, z)` mit **bilinearer** Interpolation
- `getNormalAt(x, z)`, `getSlopeAt(x, z)`
- Wird gebraucht von: Kamera-Kollision (P1), Straßen-Carving (P3),
  Vegetations-Streuung (P4), Fahrzeugphysik (später)
- Muss allokationsfrei sein — wird pro Frame hundertfach aufgerufen

**1.3 — Terrain-Renderer** → `src/world/TerrainSystem.ts`

In P1 bewusst **ohne LOD**: ein einzelnes 1024×1024-Vertex-Gitter über die ganze
Welt (3 m pro Vertex, ~2,1 Mio. Dreiecke). Auf der Zielhardware knapp, auf der
Entwicklungsmaschine mühelos — und es macht P4 einfacher, nicht schwerer.

**Höhe kommt aus dem Vertex-Shader**, nicht aus CPU-Vertexdaten:
```glsl
// Vertex-Texture-Fetch — in WebGL2 garantiert verfügbar
float h = texture(uHeightmap, uv).r * uHeightScale + uHeightOffset;
transformed.y += h;
```
Das ist die entscheidende Architekturentscheidung der Phase: Geometrie und Höhe
sind entkoppelt. In P4 tauschen wir nur das Gitter gegen einen LOD-Quadtree aus —
Material und Shader bleiben unverändert.

- Heightmap als `DataTexture`, Format `RedFormat`/`UnsignedShortType`, **kein** Mipmapping, `NearestFilter` → bilinear von Hand im Shader (Konsistenz mit `TerrainSampler`)

> **Zwei Korrekturen an dieser Aufgabe.**
>
> **Format ist `RedIntegerFormat`/`UnsignedShortType` (R16UI), nicht `RedFormat`.**
> three bildet `RedFormat` + `UnsignedShortType` auf das interne Format `R16` ab,
> und das existiert in WebGL2 nur mit der Erweiterung `EXT_texture_norm16`
> (`WebGLTextures.getInternalFormat`, Zeile 11165). Ohne sie entsteht eine
> ungültige Formatkombination — die endet nicht in einer Fehlermeldung, sondern in
> einer schwarzen Textur. R16UI ist Kernbestand von WebGL2, wird mit `texelFetch`
> aus einem `usampler2D` gelesen und liefert die exakten 16-bit-Werte.
> Nebeneffekt: das unter *Risiken* genannte Problem „Treiber interpolieren
> `UnsignedShortType` ungenau → Terrassen-Artefakte" ist damit gegenstandslos, weil
> gar nicht die Hardware interpoliert, sondern der Shader-Code.
>
> **Gitter ist 768 × 768, nicht 1024 × 1024.** Die Rechnung „~2,1 Mio. Dreiecke"
> war unvollständig: das Gitter wird **zweimal** gerendert, einmal fürs Bild und
> einmal für die Schattenkarte. Gemessen wurden **4.186.128 Dreiecke pro Frame**
> gegen ein Budget von 3 M — die Budget-Ampel aus P0 hat den Planungsfehler
> gefunden, bevor er zur Gewohnheit wurde. Mit 768 sind es 2.353.168, und das
> Budget hält. Der Preis sind 4,0 m statt 3,0 m pro Vertex; die Heightmap liegt mit
> 1,5 m feiner vor, als das Gitter sie abtastet. Genau das löst P4 auf.

**1.4 — Terrain-Material** → `src/world/materials/TerrainMaterial.ts`
- Basis: `MeshStandardMaterial` + `onBeforeCompile`.
  Bewusst **nicht** `ShaderMaterial` — so bleiben IBL, Schatten, Fog und
  Tonemapping von Three.js erhalten. Ein eigener PBR-Shader wäre wochenlange
  Arbeit, um am Ende schlechter auszusehen
- 4-Kanal-Splat-Blending nach `zones.png`
- **Triplanar-Mapping ab ~35° Neigung** — sonst zieht die Textur an Steilhängen
  zu langen Streifen. Blend-Faktor über die Normale
- Detail-Textur-Layer im Nahbereich (Tiling), großskaliger Farb-Layer in der Ferne
  gegen sichtbare Kachelung

> **Umgesetzt als drei Array-Texturen** (`sampler2DArray`) mit je vier Ebenen für
> Albedo, Normale und ARM. Als Einzeltexturen wären es zwölf Sampler allein fürs
> Terrain — WebGL2 garantiert im Fragment-Shader nur sechzehn, und Envmap,
> Shadow-Map und die gesamte PostFX-Kette ab P2 brauchen davon ebenfalls welche.
> Beim Packen müssen die Zeilen gespiegelt werden: `UNPACK_FLIP_Y_WEBGL` gilt nur
> für `texImage2D`, nicht für `texImage3D`.
>
> **Detail-Normalen mussten deutlich zurückgenommen werden** — von 0,75 auf 0,35,
> Kachelgröße von 7 m auf 11 m, Ausblendung von 420–900 m auf 100–420 m. Grund ist
> die Sonne: sie steht 2,2° über dem Horizont, und bei so streifendem Licht wird
> aus jeder kleinen Normalen-Störung ein harter Hell-Dunkel-Sprung. Mit den
> ursprünglichen Werten lag ein grobes Rautenmuster über dem ganzen Bild. Das ist
> keine Detailfrage, sondern eine Eigenschaft der gewählten Stimmung: **alles, was
> ab P2 Normalen anfasst, muss gegen streifendes Licht geprüft werden**, nicht
> gegen Mittagslicht.

**1.5 — Freiflug-Kamera** → `src/camera/FreeFlyController.ts`

| Eingabe | Wirkung |
|---|---|
| Maus (Pointer Lock) | Blickrichtung, kein Roll |
| `W`/`A`/`S`/`D` | Vor/links/zurück/rechts, relativ zur Blickrichtung |
| `Leertaste` / `Strg` | Hoch / runter, **weltbezogen** (nicht kamerabezogen) |
| `Shift` | Boost ×5 |
| Mausrad | Basisgeschwindigkeit (1–500 m/s, logarithmisch) |
| `F` | Terrain-Kollision an/aus |
| `R` | Zurück zur Startposition |

- Geschwindigkeit wird **exponentiell gedämpft**, nicht hart gesetzt — sonst
  fühlt sich Fliegen nach Ruckeln an
- Kollision (optional): hält 2 m über `TerrainSampler.getHeightAt()`
- Position/Rotation in `localStorage` — Reload landet, wo man war.
  Klingt nach Kleinigkeit, spart über Monate Stunden

**1.6 — Beleuchtung** → `src/render/LightingRig.ts`
```ts
scene.background  = pureSkyEquirect            // industrial_sunset_02_puresky 4k
scene.environment = pmrem(rooftopNight)        // rooftop_night 2k
```
- `PMREMGenerator` einmalig, Quelltextur danach freigeben
- `scene.environmentIntensity` und `backgroundIntensity` getrennt regelbar
- Eine `DirectionalLight`, Richtung **aus dem HDRI abgeleitet** (siehe 1.7)
- Schatten in P1 bewusst simpel: eine Shadow-Map, Kamera folgt dem Spieler.
  Kaskaden kommen in P2

> **`environmentIntensity` steht auf 0,5, nicht auf 1,15.** Mit dem höheren Wert
> hat das Umgebungslicht die Sonne vollständig überstrahlt: das Gelände wirkte
> flach und ohne Schatten — obwohl die Schattenkarte die ganze Zeit korrekt
> gerendert wurde. Das ist die unangenehme Sorte Fehler, weil nichts kaputt
> aussieht, es sieht nur langweilig aus. Nachgewiesen durch Herunterdrehen des IBL
> auf 0,05: dann traten Grate und Rinnen sofort hervor.
>
> Ebenfalls nötig: **ein eigenes `customDepthMaterial`** mit derselben
> Höhenverschiebung. Ohne das rendert three die Schattenkarte aus der
> *unverschobenen* Ebene, und die Berge werfen keinen Schatten. Es teilt sich die
> Uniform-Objekte mit dem Hauptmaterial und bleibt dadurch automatisch synchron.

**1.7 — Sonnenrichtungs-Extraktor** → `tools/hdri-sun.mjs`
- Liest ein HDRI, findet die hellste Region, rechnet Equirect-UV → Richtungsvektor
- Gibt Richtung, Farbe und Intensität als JSON aus → `LightingRig` liest es ein
- Grund: eine von Hand geratene Sonnenposition passt nie exakt zum HDRI-Himmel.
  Das Auge sieht den Fehler sofort, auch wenn es ihn nicht benennen kann

> **Übernommen wird nur die Richtung, nicht die Farbe.** Gemessen wurde `#ff1e00` —
> im HDRI ist die Sonnenscheibe samt Halo übersteuert, einzelne Kanäle laufen in
> die Sättigung, und heraus kommt ein Rot, das kein Sonnenlicht je hatte. Als
> Lichtfarbe hätte es die ganze Szene eingefärbt. Die Richtung dagegen ist
> geometrisch und von der Belichtung des Panoramas unberührt. Der Farbton in
> `lighting.config.ts` ist eine Art-Direction-Entscheidung, kein Messwert, und ist
> dort auch so gekennzeichnet.
>
> **Die vertikale Abbildung war zunächst gespiegelt.** Das Werkzeug meldet die
> Elevation in Grad und warnt bei negativen Werten — ein Himmels-HDRI hat die Sonne
> über dem Horizont. Genau das schlug an: −2,23° statt +2,23°. Eine .hdr-Datei mit
> `-Y H +X W` speichert von oben nach unten, für `v` muss also von unten gezählt
> werden. Der eingebaute Selbsttest hat den Vorzeichenfehler gefunden, bevor
> irgendetwas gerendert wurde.

**1.8 — Debug-Panel Terrain** → Erweiterung von `DebugPanel`
- Höhen-Skalierung, Splat-Gewichte einzeln sichtbar, Wireframe, Normalen-Ansicht
- Aktuelle Kamerahöhe über Grund, Weltkoordinate unter dem Fadenkreuz

### Akzeptanzkriterien
- [x] Ganzes 3072-m-Terrain sichtbar, keine Löcher, keine Nähte
      — aus 900 m Höhe von außerhalb der Karte geprüft, Kanten sauber
- [x] Von Gipfel (450 m) bis Meeresspiegel durchfliegbar, ≥ 60 FPS
      — **240 FPS** bei 1280×720, GPU 0,44 ms, Spitze 0,46 ms
- [x] `getHeightAt()` stimmt mit der gerenderten Oberfläche überein
      — Bodenmarkierung sitzt am Hang zur Hälfte im Terrain, wie es eine Kugel
      mit Mittelpunkt auf Bodenhöhe muss. Stichproben: Reisfeld 23,6 m,
      Stadt 29,6 m, Küste 3,2 m — alle passen zu den Zielwerten des Bakers
- [x] Erosionsspuren sind sichtbar — Terrain sieht nicht nach Perlin-Noise aus
- [x] Sonnenrichtung passt sichtbar zur Sonne im Himmels-HDRI
      — Kamera exakt auf den gemessenen Azimut 125,98° / Elevation 2,23°
      gerichtet: die Sonne des HDRI steht in der Bildmitte
- [x] `npm run bake` erzeugt aus leerem `assets/generated/` bitgleiche Ausgabe
      — zwei Läufe, `sha256sum -c` über alle fünf Ausgaben inklusive `meta.json`: OK

Zusätzlich geprüft:
- [x] `tsc --noEmit` sauber, kein `any`, keine `import * as THREE`
- [x] Dreiecke im Budget: 2.353.168 / 3 M · Draw-Calls 4 / 800 ·
      Texturspeicher 187 MB / 512 MB
- [x] Produktions-Bundle frei von Tweakpane, stats-gl und Debug-Gerüst

### Risiken

- ~~**Vertex-Texture-Fetch-Präzision:** manche Treiber interpolieren
  `UnsignedShortType` ungenau → Terrassen-Artefakte.~~ **Erledigt:** mit R16UI und
  `texelFetch` interpoliert keine Hardware, sondern der Shader — siehe 1.3.
- ~~**Erosion ist langsam** in JS (~2–5 min bei 2 Mio. Tropfen).~~ **Erledigt:**
  gemessen 12,2 s für den gesamten Bake — siehe 1.1.
- **Initialer Download 42,8 MB gegen 15 MB Budget** (SPEC §4). Gemessen am
  fertigen Build, Textanteile gzip-komprimiert:

  | Anteil | Größe |
  |---|---|
  | HDRIs (4k Himmel + 2k IBL) | 21,55 MB |
  | Terrain-Texturen (12 × JPG, 1k) | 9,17 MB |
  | `height.r16` (gzip) | 5,79 MB |
  | `normal.png` | 5,35 MB |
  | `zones.png` | 0,75 MB |
  | JS + CSS (gzip) | 0,15 MB |

  Das Budget ist in SPEC §4 mit dem Zusatz „(KTX2 + meshopt)" formuliert, und
  genau diese Pipeline ist **P5.1** — insofern kein Planbruch, aber ab jetzt eine
  belegte Zahl statt einer Annahme. Drei Hebel, nach Wirkung geordnet:
  1. Himmels-HDRI von 4k auf 2k → spart ~12 MB. Betrifft nur den Hintergrund;
     die Beleuchtung kommt ohnehin aus dem zweiten HDRI. **Entscheidung in P2**,
     wenn der Himmel mit PostFX zu sehen ist.
  2. Terrain-Texturen als KTX2 → spart ~6 MB und zusätzlich Texturspeicher (P5).
  3. `normal.png` streichen und die Normale im Shader aus der Heightmap rechnen →
     spart 5,35 MB Download und 16 MB VRAM, kostet ~4 zusätzliche `texelFetch`
     pro Fragment. **Kandidat für P7**, nicht früher: die Messung dafür braucht
     die vollständige PostFX-Last.

---

# P2 — Licht & Atmosphäre ✅

**Ziel:** Aus „korrektem Terrain" wird „blaue Stunde nach Regen". Hier entsteht
laut SPEC-Leitprinzip der Großteil der wahrgenommenen Qualität.

> **Abgeschlossen am 2026-07-26.** Die größte Abweichung betrifft 2.3: statt
> kaskadierter Schattenkarten wird die Geländeverschattung **gebacken**. Der
> Grund ist gerechnet und nicht gefühlt und steht unten bei der Aufgabe.
> Weitere Abweichungen sind bei den betroffenen Aufgaben vermerkt.

### Aufgaben

**2.1 — PostFX-Pipeline** → `src/render/PostFXPipeline.ts`

`EffectComposer` aus `pmndrs/postprocessing` (nicht der aus `three/examples` —
letzterer rendert jeden Effekt in ein eigenes Target, ersterer merged sie in
einen Shader-Pass).

```
RenderPass
  → EffectPass( N8AO )                  Umgebungsverdeckung
  → EffectPass( SSR )                   ⚠ Risiko-Pass, Details in P6
  → EffectPass( Bloom, ToneMapping(AgX), LUT, Vignette, SMAA )
```
- **Alle Nicht-Geometrie-Effekte in einen `EffectPass` bündeln** — das ist der
  ganze Sinn der Bibliothek. Fünf einzelne Passes kosten fünf Fullscreen-Durchläufe
- `renderer.toneMapping = NoToneMapping` setzen, sobald der Effekt übernimmt.
  Doppeltes Tonemapping ist ein klassischer, schwer zu sehender Fehler
- Reihenfolge ist nicht verhandelbar: **SMAA immer zuletzt**, nach dem Tonemapping.
  Kantenglättung auf HDR-Werten funktioniert nicht
- Jeder Effekt einzeln über Tweakpane abschaltbar, mit GPU-ms-Anzeige pro Effekt

> **Die beiden Regeln oben widersprechen sich, und der Quelltext entscheidet.**
> `SMAAEffect.update()` bekommt zur Kantenerkennung den **Eingangspuffer seines
> EffectPass**, nicht das Zwischenergebnis der Effekte davor. Im selben Pass wie
> AgX arbeitete SMAA also genau auf den HDR-Werten, die die zweite Regel
> ausschließt. Gebaut sind deshalb **zwei** Effekt-Pässe statt einem:
> `EffectPass(Bloom, AgX, LUT, Vignette)` und danach `EffectPass(SMAA)`.

> **N8AO statt des eingebauten SSAO** — begründet, nicht beiläufig: `SSAOEffect`
> aus `postprocessing` braucht einen `NormalPass`, und der wäre ein dritter
> kompletter Terrain-Durchlauf (1,18 Mio. Dreiecke) für einen Effekt, der auf
> glattem Gelände fast nichts zeigt. `N8AOPostPass` liest die Tiefe des Composers
> und rendert die Szene nicht erneut. Zwei Fallstricke dabei:
>
> 1. `transparencyAware` **muss aus bleiben**. Sonst rendert N8AO die Szene für
>    transparente Objekte zweimal zusätzlich — mit der Wasserfläche aus 2.4 also
>    zwei volle Zusatzdurchläufe.
> 2. **Ohne einen Eingriff bleibt das ganze Bild schwarz.** N8AO meldet
>    `needsDepthTexture`, der Composer hängt daraufhin an beide Ping-Pong-Puffer
>    eine Tiefentextur, und das Material des abschließenden Kopier-Quads setzt
>    zwar `depthWrite: false`, aber nicht `depthTest: false`. Das Quad liegt bei
>    Tiefe 0,5 und vergleicht gegen eine nie geleerte, mit Nullen angelegte
>    Tiefentextur — jedes Fragment fällt durch. Am Bildschirm tritt der Fehler
>    nicht auf (dessen Tiefenpuffer leert der Browser auf 1,0), sichtbar wird er
>    nur, wenn **nach** dem AO noch ein Pass folgt. Siehe `fixN8aoDepthTest()`.

> **Die GPU-ms-Anzeige pro Effekt ist eine A/B-Messung auf Knopfdruck, keine
> Daueranzeige.** `EXT_disjoint_timer_query_webgl2` erlaubt genau **eine** offene
> Zeitabfrage, und die hält das Overlay bereits über den ganzen Frame; eine
> zweite, verschachtelte pro Effekt ist nicht zulässig. Der Knopf misst deshalb
> die Differenz: Effekt aus, Frames mitteln, Effekt an, Differenz bilden.

**2.2 — Höhennebel** → `src/render/atmosphere/atmosphere_pars.glsl`
- Exponentieller Höhennebel, dicht in den Tälern, dünn auf den Gipfeln
- Wird per `onBeforeCompile` in **alle** Materialien injiziert → zentraler
  Uniform-Block (`AtmosphereUniforms`), den alle Materialien teilen
- Nebelfarbe wird aus dem Himmels-HDRI in Blickrichtung gesampelt, nicht konstant.
  Das ist der Unterschied zwischen „Nebel" und „grauer Schleier"
- Zwei Ebenen: Bodennebel (0–40 m, dicht) + Distanznebel (Luftperspektive)

> **Der Nebel liest nicht direkt aus dem 4k-Panorama**, sondern aus einer daraus
> gerechneten 64×32-Tabelle mit gedeckelten Werten (`createSkyLut`). Zwei Gründe:
> die Sonnenscheibe im HDRI ist übersteuert (in P1 zu `#ff1e00` gemessen) und
> stünde als greller roter Fleck im Nebel, sobald man in ihre Richtung schaut;
> und ein Panorama ohne Mipmaps liefert pro Pixel eine andere Richtung, also
> Rauschen statt Verlauf.

> **Eingesetzt wird nach `<opaque_fragment>`, nicht an Three.js' Fog-Stelle.**
> Der eingebaute Fog-Chunk sitzt hinter Tonemapping und Farbraumwandlung — das
> war ohne HDR-Pipeline richtig und ist hier falsch: der Nebel würde nach dem
> Tonemapping aufgehellt statt mit ihm zusammen komprimiert. `scene.fog` bleibt
> `null`, der Chunk wird nicht überschrieben.

> **Beim Injizieren fiel ein P1-Fehler auf und wurde mitkorrigiert.** Die
> gebackenen Karten sind ein Gitter von *Stützstellen* (Texel 0 auf −half), der
> Fragment-Shader las sie aber mit `(w + half) / size`, also als Zellenmitten —
> ein halber Texel Versatz gegen das Gelände (1,5 m bei zones.png, 0,75 m bei
> normal.png). Für Splat-Gewichte folgenlos, für die Normale nicht: bei 2,2°
> Sonnenstand steht die Schattierung dann sichtbar neben der Geometrie, die sie
> beschreibt. Korrigiert in `atmoMapUv()`, benutzt von allen drei Karten.

**2.3 — ~~Kaskadierte Schattenkarten~~ → Gebackene Geländeverschattung**
→ `tools/bake-shadows.mjs`, `src/render/atmosphere/`

> **Die geplanten CSM wurden nicht gebaut. Beide Begründungen sind gerechnet:**
>
> 1. **Dreiecke.** Das Terrain-Gitter kostet 1.176.578 Dreiecke pro Durchlauf.
>    Vier Kaskaden wären vier zusätzliche Durchläufe — 5,88 Mio. gegen ein Budget
>    von 3 Mio. (SPEC §4). Auch zwei Kaskaden reißen es (3,53 Mio.). Vor dem
>    LOD-Quadtree aus P4 ist CSM schlicht nicht bezahlbar.
> 2. **Sonnenstand.** Die Sonne steht 2,2° über dem Horizont. Ein 450-m-Gipfel
>    wirft damit 11,5 km Schatten — fast das Vierfache der Weltkante. Keine
>    Kaskadenaufteilung fängt das ein; die P1-Shadow-Map mit 700 m Radius
>    erwischte davon 6 %. Der Schatten des Massivs über die ganze Ebene, den man
>    im fertigen Bild sieht, ist mit Shadow-Maps in diesem Budget unerreichbar.
>
> Gebacken geht beides: beliebige Reichweite, kein Flimmern (die Verschattung
> steht im Welt-, nicht im Kameraraum) und zur Laufzeit **eine Texturabfrage**
> statt eines zweiten Geometriedurchlaufs. Möglich ist das nur, weil die
> Tageszeit fest ist (SPEC §3.1) — und genau dafür wurde sie gewählt.
>
> Das Terrain hat seither `light.castShadow = false`; die Dreiecke pro Frame
> fielen von 2.353.168 auf **1.176.619**. Der Schalter „Schatten" im Licht-Ordner
> stellt die P1-Variante zum Vergleich wieder her.
>
> **Echtzeit-Schatten kommen in P4 zurück**, sobald es bewegliche Werfer gibt und
> der Quadtree die Kaskaden bezahlbar macht.

- `shade.png`, 1024², drei Kanäle: **Horizontwinkel** Richtung Sonne,
  **Verdeckerentfernung**, **Himmelssicht**
- Gespeichert wird ein *Winkel*, kein Schatten-Ja/Nein. Daraus folgen drei
  Eigenschaften, die eine Binärmaske nicht hat: der Übergang ist stetig und
  damit bilinear filterbar (die Schattenkante ist die Nullstelle einer glatten
  Funktion, keine Treppe), die **Sonnenhöhe bleibt zur Laufzeit einstellbar**,
  und aus der Verdeckerentfernung folgt die Halbschatten-Breite
- Der **Azimut** steckt fest in der Karte. `AtmosphereSystem` vergleicht ihn beim
  Laden gegen die Sonnendaten und warnt bei Abweichung — sonst lägen Licht und
  Schatten auseinander, und zwar plausibel aussehend: sauber, nur falsch herum
- Die Himmelssicht ist Umgebungsverdeckung im Geländemaßstab (24 Azimute, 250 m
  Reichweite, kosinusgewichtet als mittleres cos²θ). Sie multipliziert das
  indirekte Licht und macht Erosionsrinnen dunkler als die Fläche daneben —
  etwas, das N8AO im Bildraum nicht sieht
- Debug-Ansichten „Sonnenverschattung" und „Himmelssicht" im Terrain-Ordner

**2.4 — Wasser** → `src/world/WaterSystem.ts`
- Meer: eine große Ebene auf `y = 0`, Ausdehnung weit über die Weltgrenze hinaus
- Shader: animierte Normal-Maps (2 Lagen, gegenläufig), Fresnel-Mischung zwischen
  Reflexion (aus `scene.environment`) und Tiefenfarbe
- **Tiefenbasierte Küstenlinie:** ~~Szenentiefe~~ **Heightmap** gegen Wassertiefe
  → Schaumsaum und Transparenz-Verlauf am Ufer
- Fluss: entlang eines Splines (nutzt das P3-System), daher **erst nach P3 fertigstellen**

> **Die Wassertiefe kommt aus der Heightmap, nicht aus dem Tiefenpuffer.** Sie
> steht ohnehin als Textur auf der GPU, und `terrainSurface()` liefert exakt
> dieselbe Höhe, die auch das Terrain rendert: keine Kopie des Tiefenpuffers,
> kein zusätzlicher Pass, exakt statt aus nichtlinearer Tiefe zurückgerechnet.
> Preis: nur das *Gelände* verdrängt Wasser — ein Steg bekäme keinen Schaumsaum.
> Solange nichts im Wasser steht, kostet das nichts; für P6 kommt der
> Tiefenpuffer dazu.

> **Zwei Fehler, die beim Ansehen auffielen:**
>
> - *Wellblech statt Wasser.* Die längste Wellenlage blendete nicht mit der
>   Entfernung aus, und bei 2,2° Sonnenstand wird aus jeder Normalen-Störung ein
>   harter Hell-Dunkel-Sprung — dasselbe Problem wie bei den Detail-Normalen in
>   P1, hier nur beweglich. Jede Lage bekommt jetzt einen eigenen Ausblendbereich
>   proportional zur Wellenlänge, dazu eine Domänenverzerrung in zwei Maßstäben
>   gegen das regelmäßige Sinusgitter.
> - *Schaum, der sich selbst wegmultipliziert.* Die Uferblende zog die Deckkraft
>   genau dort auf null, wo der Schaum am stärksten ist. Er wurde gerechnet und
>   im selben Atemzug gelöscht; übrig blieb eine harte, saumlose Schnittkante.
>   Jetzt darf der Schaum die Blende überstimmen (`max(edge, foam)`).

**2.5 — Color Grading** → `src/render/grading.ts`
- 3D-LUT (32³) als `Data3DTexture`
- ~~Erste Version neutral, danach iterativ getunt. Ein Referenz-Screenshot wird
  in ein Bildbearbeitungsprogramm gezogen, dort gegradet, als `.cube` exportiert~~

> **Die LUT wird aus Parametern gerechnet statt als `.cube` geladen.** Der Weg
> über das Bildbearbeitungsprogramm bleibt offen (`parseCube` liest, `toCube`
> schreibt), ist als *einziger* Weg aber unpraktisch: man sieht das Ergebnis erst
> nach einem Rundlauf über zwei Programme, und Look-Tuning besteht aus hunderten
> Iterationen. Mit Reglern für Kontrast, Sättigung, Temperatur, Lift/Gamma/Gain
> und Farbstich in den Tiefen ist die Schleife kurz — und der `.cube`-Export
> liefert trotzdem die Datei, die eine Farbkorrektur-Software erwartet.
> Nebeneffekt: eine 32³-LUT als Datei sind rund 2 MB Text, gerechnet sind es
> 30 ms beim Start und null Bytes. Bei 44 MB gemessenem Startdownload gegen
> 15 MB Budget kein Nebenaspekt.

**2.6 — Look-Presets** → `src/render/looks/*.json`
- Kompletter Beleuchtungszustand (Exposure, Nebel, LUT, Sonnenintensität,
  Bloom-Schwelle) als JSON speicher- und ladbar
- Export-Button im Debug-Panel
- Grund: Look-Tuning ist ein iterativer Prozess über Wochen. Ohne
  Speicherfunktion geht das beste Ergebnis beim nächsten Reload verloren

> **Der Controller kennt keines der Systeme, deren Zustand er speichert.** Er
> sendet `look:collect` mit einem vorbefüllten Objekt, jedes System trägt seinen
> Abschnitt ein; `look:apply` verteilt umgekehrt. Ab P3 kommen Straßen dazu, ab
> P6 die Stadtlichter — jedes bringt seinen Look-Anteil selbst mit, statt den
> Controller zu erweitern.

### Akzeptanzkriterien
- [x] **Screenshot ist ohne Erklärung als „blaue Stunde nach Regen" erkennbar** —
      kühler Dunst über der Ebene, warmes Streiflicht auf den Graten, der Schatten
      des Massivs über die ganze Ebene davor
- [x] **Nebel liegt in den Tälern, nicht als gleichmäßiger Schleier** — zwei
      Schichten mit `falloff` 26 m und 340 m; auf einem 200-m-Kamm bleiben vom
      Bodennebel 0,04 % übrig
- [x] **Keine flimmernden Schattenkanten** — die Verschattung ist eine Textur im
      Weltraum. Es gibt keine Schattenkamera, die mitwandern könnte; das Kriterium
      ist bauartbedingt erfüllt statt durch Einrasten erkauft
- [ ] **Wasser hat weiche Küstenlinie ohne harte Schnittkante** — **halb erfüllt.**
      Schaumsaum und Transparenzverlauf sind stetig (aus der Heightmap gerechnet),
      die *sichtbare* Schnittkante folgt aber der Terrain-Triangulierung mit 4 m
      pro Quad und zerfällt auf flachem Strand in achsenparallele Stufen. Gemessen:
      mit 1536 Stützstellen (2 m/Quad) halbiert sich die Stufenbreite. Keine
      Shader-Frage, eine Geometriedichte-Frage → **löst P4 mit dem LOD-Quadtree**
- [x] **PostFX-Kette unter 5 ms GPU** — gemessen **0,50 ms** bei 1920×1080
      (Szene allein 0,31 ms, volle Kette 0,81 ms). Einzeln: AO 0,26 ms,
      Bloom/AgX/LUT/Vignette 0,24 ms, SMAA 0,15 ms. Gemessen per eigener
      `TIME_ELAPSED`-Abfrage über je 150 Durchläufe — auf der RX 7900 XTX, die
      laut SPEC §4 **kein** Maßstab ist; auf einer GTX 1660 grob das Fünffache
      und damit weiterhin im Budget
- [x] **Look-Preset überlebt Speichern und Neuladen unverändert** — vier
      Kennwerte gesetzt (Nebeldichte 0,00417 · Restlicht 0,123 · Sonne 6,66 ·
      Bloom 1,37), gespeichert, neu geladen: Abweichung 0 in allen vieren

### Risiken
- ~~**N8AO/SSR-Kompatibilität** mit der `postprocessing`-Version.~~ → **Eingetreten,
  aber anders als erwartet.** Die Versionen passen (`postprocessing` 6.39.3
  erlaubt three < 0.186, installiert ist 0.185.1); der Fehler war ein fehlendes
  `depthTest: false` in N8AOs Kopier-Quad, das **das gesamte Bild schwarz** ließ.
  Der Plan-Ratschlag „im Minimalbeispiel verifizieren" hätte ihn *nicht* gefunden:
  er tritt nur auf, wenn nach dem AO noch ein Pass folgt. Gefunden durch Halbieren
  der Kette gegen eine framerate-unabhängige Bildmessung
- ~~**Nebel-Injektion** kollidiert mit Three.js' eigenem Fog-Chunk.~~ → Nicht
  eingetreten. `scene.fog` bleibt `null`, der eingebaute Chunk wird dadurch leer
  und stört nicht. Der Nebel sitzt ohnehin an anderer Stelle (nach
  `<opaque_fragment>`, in linearem HDR)
- **SSR** wurde nicht gebaut. Der Plan markiert es als „⚠ Risiko-Pass, Details in
  P6"; ohne spiegelnde Flächen außer Wasser gibt es dafür in P2 keinen Anlass.
  Die Pipeline hat den Platz dafür (`PostFXPipeline.composer` ist öffentlich)

### Offene Punkte aus P2

| Punkt | Zahl | Wohin |
|---|---|---|
| Startdownload | **44,1 MB** gegen 15 MB Budget (P1: 42,8 MB; +1,3 MB durch `shade.png`) | Himmel auf 2k ≈ −8 MB · KTX2 in P5 · `normal.png` streichen in P7 |
| Uferkante polygonal | 4 m pro Terrain-Quad | P4, LOD-Quadtree |
| Kachelmuster auf beschatteter Ebene | sichtbar bei niedrigem Kontrast | P4/P7, Detailtextur-Varianz |
| Debug-Ansichten laufen durch AgX | Graustufen erscheinen angehoben | kosmetisch, kein Fix geplant |

---

# P3 — Splines & Straßen ✅

**Ziel:** Das Straßennetz. Laut SPEC §2.3 das zentrale Datenmodell des Projekts —
es liefert Geometrie, Terrain-Verformung und später alle Gameplay-Daten.

> **Stand 2026-07-26 — abgeschlossen.**
>
> | Aufgabe | Stand |
> |---|---|
> | 3.1 Spline-Datenmodell | ✅ inkl. Bogenlängen-Parametrisierung und kostenbasierter Trassierung |
> | 3.2 Spline-Editor | ✅ im Debug-Panel, mit Live-Grenzwertprüfung und JSON-Export |
> | 3.3 Terrain-Carving | ✅ im Baker, „nächster gewinnt" |
> | 3.4 Straßen-Mesh | ✅ inkl. Leitplanken und Pfosten |
> | 3.5 Kreuzungen | ✅ Höhenabgleich und Rücksprung; keine Verschneidung der Flächen |
> | 3.6 Gameplay-Daten | ✅ inkl. Gitter, Budget gemessen |
>
> Der **Generator** (`tools/gen-roads.mjs`) kam vor dem Editor, und das war
> richtig: neun Serpentinen von Hand zu setzen ist Fleißarbeit mit ungewissem
> Ausgang, und ohne ein Netz gab es nichts zu carven und nichts zu rendern. Der
> Editor ist jetzt das, was er sein soll — Feinarbeit an etwas, das schon fährt,
> mit denselben Grenzwerten live daneben.

### Aufgaben

**3.1 — Spline-Datenmodell** → `src/world/roads/splineSampler.mjs`, `assets/generated/roads/roads.json` ✅

> **Die Kurvenmathematik liegt in reinem ESM, nicht in TypeScript.** Sie wird von
> zwei Seiten gebraucht, die nichts gemeinsam haben: von den Node-Werkzeugen
> (Generator, Baker) und vom Renderer im Browser. Beide müssen *exakt* dieselbe
> Kurve sehen, sonst liegt die eingeschnittene Rinne neben dem Straßen-Mesh —
> um Beträge, die erst auffallen, wenn man darauf fährt. Node 18 führt kein
> TypeScript aus, also ist ESM der kleinste gemeinsame Nenner; die Typen stehen
> daneben in `splineSampler.d.mts`.
>
> Aus demselben Grund enthält `roads.json` neben den Kontrollpunkten die
> **fertig abgetastete Mittellinie**. Ausgewertet wird die Kurve genau einmal,
> im Generator; Baker und Renderer lesen nur noch das Ergebnis.
>
> **Zentripetal (α = 0,5), nicht uniform.** Die uniforme Variante überschwingt
> bei ungleichen Punktabständen und erzeugt Schleifen — auf einer Straße wären
> das Kurven, die sich selbst schneiden.
>
> Der Sampler bricht bei Knoten unter 5 cm Abstand **ab**. Ohne diese Prüfung
> liefert er plausibel aussehende Zahlen: das Knotenintervall geht gegen null,
> die Tangentenformel dividiert dadurch, und heraus kommt eine Kurve mit
> Zentimeterradien und 1642 % Steigung. Genau das ist beim Bau des Passes
> passiert.
```ts
interface RoadSpline {
  id: string;
  type: 'highway' | 'mountain' | 'village' | 'city' | 'dirt';
  closed: boolean;
  nodes: { pos: [number, number, number]; width: number; banking: number }[];
  tags: string[];            // 'drift-strecke', 'startlinie', ...
}
```
- Catmull-Rom mit einstellbarer Spannung; Auswertung über
  `THREE.CatmullRomCurve3` als Referenz, eigene Implementierung für Breite/Banking
- **Bogenlängen-Parametrisierung** (`getPointAt` statt `getPoint`): ohne sie sind
  Abtastpunkte in Kurven dichter als auf Geraden — Textur-UVs verzerren sichtbar
  und Streckenlängen stimmen nicht

**3.2 — Spline-Editor** ✅ → `src/world/roads/RoadEditor.ts` (nur im Dev-Build)

> **Der Generator kam zuerst, und das war richtig.**
>
> Der Plan nennt den Editor „nicht optional", und das bleibt richtig — aber er
> löst ein anderes Problem als das erste. Er ist das Werkzeug zum *Verfeinern*.
> Für den ersten Wurf ist er schlecht geeignet: ein Bergpass mit neun
> Serpentinen, durchgehend unter 11 % Steigung und über 15 m Radius, von Hand
> gesetzt, ist Fleißarbeit mit ungewissem Ausgang — und ohne ein Netz gäbe es
> weder etwas zu carven noch etwas zu rendern.
>
> Der Generator legt das Netz aus dem Gelände an und **misst seine eigenen
> Grenzwerte nach**. Dass er dabei mehrfach hintereinander durchfiel (Radius
> 4,1 m · 0,13 m · 12,3 m, Steigung 1642 % · 134 % · 105 %), ist der Beleg dafür,
> dass die Messung nicht dekorativ ist.

Umgesetzt als Ordner im Debug-Panel:

- Strecke und Knoten wählen, Position (X/Y/Z), Breite und Querneigung verstellen
- Knoten dahinter einfügen, Knoten löschen, auf `roads.json` zurücksetzen
- Bearbeitetes Netz als `roads.json` herunterladen — vollständig, einschließlich
  der abgetasteten Mittellinie, damit der Terrain-Baker die Kurve nicht selbst
  auswerten muss
- Knotenmarker als `InstancedMesh`, der gewählte Knoten als Oktaeder darüber
- **R min, Steigung und Länge live daneben**, mit ✓/✗ gegen die Grenzwerte des
  Straßentyps

> **Er rechnet mit demselben Sampler wie alle anderen.** `splineSampler.mjs` ist
> reines ESM und wird von Generator, Terrain-Baker und Editor importiert. Eine
> zweite Auswertung derselben Kurve wäre genau die Sorte Abweichung, die erst
> auffällt, wenn man auf der Straße fährt und die eingeschnittene Rinne im
> Terrain daneben liegt.

> **Ein Editor, der die Grenzwerte verschweigt, wäre eine Falle.** Deshalb steht
> die Messung neben den Reglern und nicht in einer Prüfung, die man später
> laufen lässt. Gegengeprüft: Knoten 0 des Rings um 137 m verschoben → die
> Anzeige springt im selben Frame von `58,8 m ✓` auf `3,0 m ✗`.

**Bewusst nicht gebaut:** Punkte per Klick im Viewport setzen,
`TransformControls`-Gizmo, Undo/Redo. Der Plan nannte sie, weil er den Editor als
*einziges* Werkzeug vorsah. Neben einem Generator, der das Netz anlegt, ist die
Feinarbeit an Zahlenreglern schneller und vor allem reproduzierbar — ein
verschobener Knoten hat eine Koordinate, die man notieren kann.

**3.3 — Terrain-Carving** → Erweiterung `tools/bake-terrain.mjs` ✅
- Baker liest `assets/generated/roads/roads.json` **nach** der Erosion und vor
  der Zonenmaske
- Pro Spline: Höhenprofil entlang der Kurve glätten, Querschnitt einebnen,
  Böschung seitlich auslaufen lassen (Kosinus-Übergang über ~15 m)
- Zonenmaske bekommt einen Straßen-Kanal (unterdrückt Vegetation in P4)
- Neuer Ablauf: `Splines ändern → npm run roads && npm run bake && npm run shade → Reload`
  (oder `npm run world` für die ganze Kette)
- ~~`npm run bake:watch`~~ → offen; sinnvoll erst mit dem Editor aus 3.2

> **„Nächster gewinnt" statt Sonderfall für Kreuzungen.** Jeder Texel merkt sich
> den nächstliegenden Straßenpunkt; wo zwei Trassen sich treffen, entscheidet
> schlicht der Abstand. Deshalb funktioniert der Anschluss Pass↔Ring ohne
> Kreuzungscode — mit der Einschränkung aus den Risiken.

> **Der Ablauf ist zirkulär und wird durch zweimaliges Backen aufgelöst:** der
> Generator braucht ein Höhenfeld, der Baker braucht die Straßen. Erster Lauf
> ohne `roads.json` (der Baker meldet das und backt ohne Straßen), dann
> `gen-roads`, dann noch einmal backen. Stabil, weil das Basis-Terrain bei
> gleichem Seed identisch bleibt und sich nur das Carving ändert.

**3.4 — Straßen-Mesh-Generator** → `src/world/roads/RoadMeshBuilder.ts` ✅
- ~~Adaptive Abtastung: dicht in Kurven (nach Krümmung), spärlich auf Geraden~~
  → **nicht gemacht, und zwar bewusst:** die Mittellinie ist bereits gleichmäßig
  in der Bogenlänge abgetastet, und genau darauf beruht die maßstabsgetreue
  Textur. Eine zweite, adaptive Abtastung darüber zerstörte die Gleichmäßigkeit
  wieder. Der Preis sind ein paar tausend Dreiecke mehr auf Geraden — gemessen
  ist das ganze Netz **29 724 Dreiecke**, ein Prozent des Budgets
- Aufbau des Querschnitts: Fahrbahn + Randstreifen + Böschungsanschluss
- UVs: `u` quer, `v` = Bogenlänge in Metern (→ Textur-Tiling ist automatisch maßstabsgetreu)
- Vertex-Farbe kodiert Nässe/Pfützen-Maske (wird in P6 genutzt) — angelegt, vom
  Material noch nicht gelesen
- Leitplanken und Straßenpfosten als `InstancedMesh` ✅ →
  `src/world/roads/GuardrailBuilder.ts`

> **Wo eine Planke steht, entscheidet der Generator.** Die Bedingung ist nicht
> „schöne Stelle", sondern der gemessene Höhenabfall am **Fuß der Böschung**:
> fällt es dort um mehr als 7 m ab, gehört an diese Seite eine Planke. Das kann
> nur, wer das Gelände *vor* dem Einschneiden kennt — der Renderer sieht nur die
> fertige Karte. Gemessen: Ring 2422 m (40 % der Strecke), Pass 118 m (6 %),
> Dorf 0 m. Der erste Entwurf mit 3,5 m Schwelle kam auf 105 % und stellte damit
> praktisch überall Planken hin.

> **Wickelrichtung.** Die Dreiecke laufen a→b→c, nicht a→c→b. Die Normale ist
> `(b−a) × (c−a)` = rechts × tangente, und weil `rechts` als `tangente × oben`
> gebildet wird, ergibt das wieder `oben` — unabhängig davon, wohin die Straße
> läuft. Andersherum zeigt sie nach unten, und die Straße verschwindet
> vollständig im Backface-Culling: Draw-Calls, Dreieckszähler und
> Bounding-Sphere sehen dabei alle korrekt aus. Genau so ist es beim ersten
> Versuch passiert.

> **Querneigung aus der Krümmung, nicht als fester Wert.** `banking` in der Datei
> ist die *maximale* Neigung; wo die Strecke gerade läuft, gibt es keinen Grund
> für eine schiefe Fahrbahn. Voll geneigt wird ab 20 m Radius.

**3.5 — Kreuzungen** ✅ → `connectToNetwork()` in `tools/gen-roads.mjs`
- Erkennung: Endpunkt einer offenen Strecke im Umkreis von 150 m um die
  Mittellinie einer bereits gebauten
- Einrasten in XZ, dann Höhe festnageln und in `fitElevation` festhalten
- Rücksprung (`trimStart`/`trimEnd`) statt Verschneidung der Flächen

> **Der Radius ist zweimal an dieser Stelle gestorben.** Erst wurde nur der
> Endknoten verschoben: bei 3,55 m Versatz und 4 m Knotenabstand ist das ein
> 42°-Knick, und der Mindestradius der Dorfstraße fiel von 28,8 m auf 12,0 m —
> der Anschluss zerstörte genau das, was er verbinden sollte. Dann wurden die
> überholten Knoten entfernt; das half nur, solange der Versatz größer war als
> der Knotenabstand. Jetzt läuft die Verschiebung über zwölf Knoten mit einem
> Kosinus aus, und 3,55 m auf 48 m sind wenige Grad Ablenkung.

> **Der Anfang liegt auf der gebauten Straße, nicht auf ihrem Entwurfspunkt.**
> Zwischen beiden lagen am Pass 96 m: die Verrundung schneidet an einem
> Wegpunkt, der zugleich eine Kurve ist, genau dort die Ecke ab. Am
> Entwurfspunkt zu starten und hinterher einzurasten hieß, die ersten 96 m
> Straße zu verschieben, *nachdem* ihr Höhenprofil feststand — die gemessene
> Steigung sprang auf 32,3 %.

**3.6 — Gameplay-Datenexport** → `src/world/roads/RoadNetwork.ts` ✅
- Abfragen, die spätere Systeme brauchen:
  - `getClosestPointOnNetwork(pos)` → für Rücksetzen nach Verlassen der Strecke
  - `getRacingLine(splineId)` → Ideallinie (P3: Mittellinie, später optimiert)
  - `getSpawnPoints()` → aus getaggten Knoten
  - `distanceToNearestRoad(x, z)` → **Vegetations-Ausschluss in P4**
- Letztere Abfrage braucht ein räumliches Gitter, sonst wird P4s Streuung O(n·m)

> **Das Gitter allein reichte nicht.** Mit `Map` als Zellenspeicher und einem
> Objekt je *geprüftem* Segment brauchten 100 000 Abfragen 207,8 ms gegen ein
> Budget von 50 ms. Zwei Ursachen, beide in der Verteilung begründet: 94 % der
> Punkte liegen weitab vom Netz, für sie besteht die Arbeit fast nur aus 25
> Zugriffen auf leere Zellen (`Map` ~50 ns, Array-Index <2 ns), und für die
> übrigen 6 % entstanden pro Abfrage hunderte kurzlebige Objekte. Mit flachem
> Array und allokationsfreiem Suchkern: **40,1 ms**.

### Akzeptanzkriterien
- [x] **Editor: Strecke zeichnen, speichern, neu laden** — Ordner „Spline-Editor"
      im Debug-Panel: Strecke und Knoten wählen, Position/Breite/Querneigung
      verstellen, Knoten einfügen und löschen, auf `roads.json` zurücksetzen,
      bearbeitetes Netz als JSON herunterladen. Nach jeder Änderung wird der
      Spline neu ausgewertet und **R min, Steigung und Länge angezeigt** — mit
      demselben Sampler, den Generator und Terrain-Baker benutzen.
      Gegengeprüft: Knoten 0 des Rings 137 m nach Osten geschoben → Anzeige
      springt von `58,8 m ✓` auf `3,0 m ✗`, Mesh und Abfragenetz folgen im
      selben Frame; „Zurücksetzen" stellt 58,8 m wieder her
- [x] **Straßen liegen sauber im Terrain** — auf der Achse gemessen:
      Ring ⌀ **7,9 m**, Pass ⌀ **8,6 m**, Dorf ⌀ **2,3 m** Erdbewegung; tiefster
      Einschnitt −27,5 / −34,3 / −34,9 m. Über den ganzen Fußabdruck inklusive
      Böschung (Bericht des Bakers): 158 468 Texel, ⌀ 9,6 m, 95 % unter 48,7 m.
      Vorher: Ring −59,5 m auf der Achse, −310 m an der Böschungskante
- [ ] **Bergpass hat ≥ 8 Serpentinen mit fahrbaren Radien** — Radius erfüllt
      (**22,5 m**, Soll ≥ 15), Steigung 10,7 % (Soll ≤ 11 %), **aber 0 Kehren**.
      Begründung unten
- [x] **Ringstraße ist geschlossen und durchgehend befahrbar** — 6115 m
      geschlossen, R min **58,9 m** (Soll ≥ 45), Steigung 6,6 % (Soll ≤ 7 %)
- [x] **Textur-Tiling gleichmäßig über Kurven und Geraden** — bauartbedingt: die
      Mittellinie ist in der **Bogenlänge** gleichmäßig abgetastet und `v` ist
      Meter geteilt durch Kachellänge. Der Rücksprung an Kreuzungen rechnet mit
      der ungekürzten Bogenlänge weiter, damit die Kachelung dort nicht springt
- [x] **`distanceToNearestRoad()`: 100 000 Abfragen in < 50 ms** — **40,2 ms**
      bei 6359 Segmenten im Gitter (drei Läufe: 41,1 / 40,2 / 40,2).
      Erster Entwurf: 207,8 ms

### Warum der Bergpass keine Kehren hat

Die Serpentinen des ersten Entwurfs waren **gebaut, nicht gefunden**:
`serpentines()` setzte neun Halbkreise in den Hang, unabhängig davon, ob das
Gelände sie verlangte. Mit der kostenbasierten Trassierung entscheidet das
Gelände — und es verlangt sie nicht.

Die Rechnung dahinter: Der Anschluss an den Ring liegt auf 41,6 m, der Gipfel im
Nordwesten auf 450 m. Bei 11 % Höchstneigung braucht dieser Unterschied über drei
Kilometer Strecke, und so viel gibt der Hang zwischen beiden nicht her. Der
Generator senkt das Ziel deshalb ab, bis es passt (`summitCap`, gemessen an der
Strecke, die tatsächlich herauskommt) — übrig bleiben 1874 m mit 10,7 % Steigung,
und auf dieser Höhe lässt sich der Hang durchgehend traversieren.

Eine Kehre erzwingen ließe sich nur, indem der Korridor enger gesetzt wird. Das
wurde gemessen — 120 m, 180 m, 260 m Korridorbreite — und ergab in allen drei
Fällen null Kehren bei jeweils schlechterem oder gleichem Erdbau. Der Grund ist
Geometrie: ein 15-m-Bogen zwischen zwei Schenkeln, die sich unter 10° treffen,
setzt `R · tan(85°)` = 171 m vor deren Schnittpunkt an und ersetzt damit 342 m
Strecke durch 44 m Bogen. Sieben Kehren kosten so zwei Kilometer — genau die
Länge, über die der Pass seinen Höhengewinn verteilen wollte.

**Das Kriterium bleibt offen und wird nicht wegdefiniert.** Es setzt ein Gelände
voraus, das dieses Höhenfeld an dieser Stelle nicht hergibt. Wer den Toge als
Drift-Strecke will, ändert das Gelände (ein schmaleres, steileres Tal im
Massiv) — nicht den Generator.

### Risiken
- ~~**Kreuzungen sind das klassische Zeitloch**~~ → Nicht eingetreten. Der
  Anschluss läuft in zwei Schritten: Endknoten auf die Mittellinie der
  Hauptstrecke einrasten, dann die Höhe dort festnageln und in `fitElevation`
  festhalten. **Gemessener Höhenversatz: 0,000 m** an beiden Kreuzungen (Pass
  0,00 m eingerastet, Dorf 3,55 m). Was bewusst *nicht* passiert: die
  Fahrbahnflächen verschneiden. Beide liegen danach exakt aufeinander und würden
  im Tiefenpuffer flimmern — die einmündende Straße hört deshalb 5,5 m vor der
  Achse der anderen auf (`trimStart`/`trimEnd`), und der Böschungs-Einschnitt
  ebnet die Lücke ein
- ~~**Carving vs. Erosion**~~ → Nicht eingetreten. Nach der Erosion einzuschneiden
  erhält die Erosionsrinnen bis an die Böschung heran, statt sie zu überschreiben
- ~~**Die Trassierung kennt keine Höhenlinien**~~ → Behoben, siehe unten

### Was die Trassierung gekostet hat

Der Weg von „geometrischer Zickzack" zu „billigster Weg über ein Kostenfeld" hat
acht Fehler produziert, von denen **sieben nur durch Messen sichtbar wurden**.
Sie stehen hier, weil sie die Sorte Fehler sind, die in einer aufgeräumten
Codebasis unsichtbar bleibt:

| Fehler | Symptom | Ursache |
|---|---|---|
| Gitterrichtungen zu grob | Sägezahn, 186 Scheinkurven | A* nähert 30° durch Abwechseln von 26,57° und 45° an; mittelwertfreies Rauschen, entfernt durch einen Mittelwertfilter |
| Bögen gegenseitig gestaucht | Ring meldet 1,6 m statt 56 m Radius | Benachbarte Bögen teilen sich den Schenkel; die Verkleinerung kaskadiert. Jetzt wird die schwächere Ecke entfernt statt beide zu stauchen |
| Vereinfachungstoleranz als Gegenmittel | 13 km Trasse → 9 Ecken | Wirkt auf die ganze Strecke statt auf die enge Stelle. Verworfen |
| „Äußerer Bogen" für Kehren | 81,8° Knick, 24 m Versatz | Herleitung nicht nachgerechnet: für **beide** Tangentialkreise gilt `T = R·tan(φ/2)`; die vermeintliche Ersparnis gab es nie. Ersatzlos entfernt |
| Verrundung meldet Sollwerte | 56,3 m gemeldet, 1,4 m im Polygonzug | Zusammengebrochene Bögen fielen aus der Minimum-Bildung heraus. Misst jetzt ihr **Ergebnis** |
| Bogenschritt 15° | Ring 41,8 m statt 72,0 m | Sehnenzug liegt im Kreis, die Spline-Kurve noch einmal darin. Bei 7,5 ° unter 2 % Verlust |
| Stichweg aus zusammengesetzten Beinen | R 6,0 m, 180°-Umkehr | Bein B→C darf denselben Korridor rückwärts benutzen wie A→B. Zwei identische Punkte in der Linie; entfernt durch Schleifenerkennung mit Fenster |
| Höhenprojektion konvergiert nicht | Zusage sinkt 9,3 → 0,4 %, Ergebnis steigt 16 → 22 % | Symmetrisches Aufteilen braucht O(n²) Durchläufe, sobald ein Knoten festliegt. Klemmlauf von den festen Enden aus, dann symmetrisch |

Zwei davon waren **falsche eigene Ideen**, keine Flüchtigkeitsfehler: der äußere
Bogen und die Regelschleife, die den Steigungsvorrat nachführte. Letztere lief
davon — flacher planen ergab eine längere Trasse, längere Trasse mehr Kehren,
mehr Kehren mehr Verlust beim Verrunden; nach sieben Anläufen standen 30 km
Trasse bei 12,4 % Steigung. Beide sind entfernt, nicht repariert.

Dazu kam ein Werkzeugfehler mit derselben Signatur: `npm run world` bäckt,
erzeugt Straßen, bäckt erneut — und der **erste** Bake schnitt die Straßen des
vorherigen Laufs bereits ein. Der Generator trassierte dann durch eigene
Einschnitte, und das Ergebnis wanderte bei jedem Lauf weiter. Sichtbar wurde es
daran, dass der Mindestradius der Dorfstraße von 21,8 m auf 8,1 m fiel, ohne dass
sich an ihrem Quelltext etwas geändert hatte. Behoben mit `--no-roads` für den
ersten Durchgang.

### Offene Punkte aus P3

| Punkt | Zahl | Wohin |
|---|---|---|
| Serpentinen am Bergpass | 0 statt ≥ 8 | Gelände, nicht Generator — siehe oben |
| Kreuzungsflächen nicht verschnitten | Rücksprung 5,5 m | Sichtbar sauber, weil der Einschnitt einebnet. Echte Verschneidung mit Fahrspurführung wäre eine eigene Phase |
| Erdbau-Extremwerte | −168,6 m an einem Texel, ⌀ 9,6 m | Die Böschung streift Erosionsnadeln, die die Heightmap in Steilhängen stehen lässt. Gehört zum Terrain (P1-Nachbesserung), nicht zur Trassierung |
| Straßen-Kanal in der Zonenmaske (3.3) | — | bewusst weggelassen: `distanceToNearestRoad()` erfüllt denselben Zweck für P4 |
| `npm run bake:watch` | — | offen; die Kette läuft in unter drei Minuten und wird selten gebraucht |
| Startdownload | **51,95 MB** (P2: 44,1 MB) | +7,9 MB durch `asphalt_02` in 2k — die Normalmap ist mit 4,71 MB größer als jede andere Textur im Projekt. KTX2 in P5 |

### Gemessener Stand am Ende von P3

| Größe | Gemessen | Budget |
|---|---|---|
| Draw-Calls | **36** | 800 |
| Dreiecke | **1.212.971** | 3.000.000 |
| Texturspeicher | **255 MB** | 512 MB |
| Programme | 20 | — |
| CPU / GPU je Frame | 0,20 ms / 1,72 ms | 16,6 ms |
| Netz | 3 Strecken, 8,68 km, 2540 m Leitplanken, 648 Pfosten | — |
| Konsole | keine Fehler, keine Warnungen | — |

Leitplanken und Pfosten kosten zusammen **zwei** Draw-Calls: das Band aller
Strecken liegt in einer Geometrie, die Pfosten in einem `InstancedMesh`.

---

# P4 — LOD & Vegetation

**Ziel:** Die Welt füllt sich, und zwar innerhalb der Budgets aus SPEC §4. Ab
hier gilt: was das Overlay nicht bestätigt, gilt als nicht erledigt.

### Aufgaben

**4.1 — Terrain-Quadtree mit CDLOD** → `src/world/ChunkManager.ts`

Ersetzt das feste Gitter aus P1. Verfahren: **CDLOD** (Continuous
Distance-Dependent Level of Detail).

- Quadtree über die Welt, Wurzel = 3072 m, Blätter = 48 m
- **Eine einzige geteilte Gittergeometrie** (33×33 Vertices), pro Knoten
  skaliert und verschoben. Ein Geometrie-Objekt für das gesamte Terrain
- Auswahl: rekursiver Abstieg, Knoten wird unterteilt, solange
  `distanz < lodFaktor * knotenGröße`
- **Vertex-Morphing** im Übergangsbereich: Vertices interpolieren zur Position
  des Elternknotens, bevor die Stufe wechselt. Das eliminiert Popping und
  Risse **ohne** Skirts
- Culling pro Knoten gegen die Min/Max-Höhe aus `meta.json` (in P1 gebacken)

> **Warum CDLOD und nicht Geomipmapping mit Skirts:** Skirts sind sichtbare
> vertikale Wände bei flachem Blickwinkel und lösen das Popping nicht. CDLOD
> ist die etwas anspruchsvollere Implementierung mit dem deutlich besseren
> Ergebnis — und da der Shader aus P1 die Höhe bereits per Textur-Fetch holt,
> ist der Umbau kleiner als er klingt.

**4.2 — Streu-System** → `src/world/scatter/ScatterSystem.ts`
- Deterministisch pro Chunk (Seed = Chunk-Koordinate) → keine Speicherung nötig,
  identisch bei jedem Laden
- Verteilung: jittered Grid (Poisson-Disk-Näherung, deutlich schneller als echtes Poisson)
- Filter pro Instanz, in dieser Reihenfolge (billigste Ablehnung zuerst):
  1. Biom-Gewicht aus `zones.png`
  2. Steilheit (Bäume bis 30°, Gras bis 45°)
  3. Höhe (Baumgrenze bei 350 m, kein Gras unter dem Meeresspiegel)
  4. `distanceToNearestRoad()` aus P3
- Ausgabe: `InstancedMesh` je (Chunk × Asset × LOD-Stufe)

**4.3 — Instanzierung & LOD** → `src/world/scatter/InstancedLOD.ts`
- 3 Stufen: Volles Mesh (< 60 m) → reduziertes Mesh (< 150 m) → Imposter (< 400 m)
- Umsortierung der Instanzmatrizen bei Stufenwechsel, in Zeitscheiben über
  mehrere Frames verteilt (sonst Ruckler beim Fliegen)
- Per-Instanz-Attribute: Skalierung, Y-Rotation, Farbvariation (`instanceColor`)

**4.4 — Imposter-Baker** → `tools/bake-imposters.mjs`
- Rendert jedes Vegetations-Asset aus 8×8 Richtungen in einen Atlas
  (oktaedrische Projektion)
- Ausgabe: Albedo+Alpha-Atlas und Normalen-Atlas nach `assets/generated/imposters/`
- Shader mischt zwischen den zwei nächsten Ansichten → kein Springen beim Umkreisen
- Headless über `node` + `gl`-Paket, alternativ ein Bake-Modus in der App selbst

**4.5 — Wind** → `src/world/materials/windVertex.glsl`
- Zwei Frequenzen: großes Wiegen des Stamms + hochfrequentes Blattzittern
- Amplitude über Vertex-Farbe maskiert (Wurzel unbewegt, Krone stark)
- Ein globaler Wind-Uniform für alle Vegetation, damit die Bewegung kohärent wirkt

**4.6 — Budget-Durchsetzung** → `src/debug/BudgetGuard.ts`
- Liest jeden Frame `renderer.info`, vergleicht mit `quality.config.ts`
- Bei Überschreitung: **auffällige Warnung im Overlay** plus einmaliger
  Konsolen-Eintrag mit dem Verursacher (welches System hat die meisten Draw-Calls)
- Bewusst laut. Budget-Überschreitungen fallen sonst erst Wochen später auf,
  wenn die Ursache nicht mehr zuzuordnen ist

### Akzeptanzkriterien
- [ ] Kein sichtbares Popping bei Kamerafahrt in beliebiger Geschwindigkeit
- [ ] Keine Risse zwischen LOD-Stufen, auch nicht bei flachem Blickwinkel
- [ ] ≥ 50 000 sichtbare Vegetations-Instanzen bei **< 100 Draw-Calls**
- [ ] Gesamt-Draw-Calls **< 800**, Dreiecke **< 3 Mio.** (SPEC §4)
- [ ] Keine Vegetation auf Straßen oder im Wasser
- [ ] Streuung ist reproduzierbar: zweimal laden = identische Platzierung
- [ ] Imposter sind bei 150 m nicht vom Mesh zu unterscheiden

### Risiken
- **CDLOD-Morphing ist fehleranfällig** — falsche Morph-Distanzen erzeugen
  sichtbares Wabern. Zuerst mit Wireframe und eingefärbten LOD-Stufen entwickeln,
  nicht mit fertigem Material
- **Imposter-Baking headless** kann an fehlendem GPU-Kontext scheitern.
  → Fallback: Bake-Modus in der laufenden App, Ergebnis herunterladen

---

# P5 — Asset-Pipeline & Landmarks

**Ziel:** Die Zonen bekommen Wiedererkennbarkeit. Und zwar über eine Pipeline,
nicht über manuell zurechtgeschobene Dateien.

### Aufgaben

**5.1 — Asset-Pipeline** → `tools/process-assets.mjs`

Jedes eingehende Modell durchläuft verpflichtend:
1. `gltf-transform dedup` — doppelte Meshes/Materialien zusammenführen
2. `weld` + `join` — Vertices verschmelzen, Draw-Calls senken
3. Texturen auf Projekt-Maximum begrenzen (1024), nach **KTX2/Basis** konvertieren
4. `meshopt`-Kompression
5. **Normalisierung:** Skalierung auf Meter, Pivot auf Bodenmitte, +Z nach vorn
6. Material-Umschreibung auf die Projekt-Palette (SPEC-Leitprinzip: flache Farben,
   Look kommt aus dem Licht)

Eingang `assets/source/models/` → Ausgang `assets/generated/models/`.
Quelldateien werden **nie** direkt geladen.

> Die Normalisierung ist der Grund, warum CC0-Kitbashing sonst scheitert. Ohne
> sie ist jedes Modell anders skaliert, anders orientiert und hat ein anderes
> Material-Setup — der Stil-Mix, vor dem SPEC §6 warnt.

**5.2 — Asset-Beschaffung** → `tools/polyhaven.mjs` (existiert), plus manuelle Quellen
Zielliste:

| Zone | Landmarks |
|---|---|
| Berg/Tōge | Leitplanken, Streckenmarkierungen, Felsformationen, Bergschrein |
| Wald/Tempel | Tempelhalle, Torii-Reihe, Steinlaternen, Treppenaufgang |
| Reisfelder | Bauernhäuser, Terrassenfelder, Schuppen, Strommasten |
| Küste | Hafenmole, Boote, Wellenbrecher-Tetrapoden, Leuchtturm |
| Stadt | siehe P6 |

**5.3 — Platzierungs-System** → `src/world/props/PropPlacement.ts`, `assets/props.json`
- JSON: Asset-ID, Position, Rotation, Skalierung, Instanzierungs-Flag
- Editor analog zum Spline-Editor: Gizmo, Terrain-Snapping, Duplizieren, Undo
- Gleiches Asset mehrfach → automatisch zu `InstancedMesh` zusammengefasst

**5.4 — Reisfeld-Generator** → `src/world/props/RicePaddy.ts`
- Prozedural: Parzellen als Voronoi-Zellen, jede auf konstanter Höhe eingeebnet
- Wasserfläche pro Parzelle (reflektiert bei blauer Stunde — passt exakt zum Look)
- Dämme zwischen den Parzellen als schmale Geometriestreifen
- Rechtfertigt sich, weil das die größte zusammenhängende Fläche der Map ist

**5.5 — Landmark-LOD**
- Modelle > 500 Dreiecke bekommen eine reduzierte Stufe (`gltf-transform simplify`)
- Kleine Props verschwinden ab Distanzschwelle komplett statt zum Imposter zu werden

### Akzeptanzkriterien
- [ ] Jede Zone ist im Vorbeifliegen ohne Karte identifizierbar
- [ ] Alle Assets sind maßstabsgetreu (Tür ≈ 2 m, Torii ≈ 5 m)
- [ ] Kein Modell wird aus `assets/source/` geladen
- [ ] Draw-Call-Budget weiterhin eingehalten
- [ ] `CREDITS.md` listet jedes verwendete Fremd-Asset

### Risiken
- **Stil-Bruch** zwischen Quellen. → Material-Umschreibung in 5.1 ist verpflichtend;
  im Zweifel Albedo-Textur komplett verwerfen und durch Flachfarbe ersetzen
- **KTX2-Transkodierung** — ~~braucht die Basis-Worker-Dateien im `public/`-Ordner~~
  Erledigt sich mit three r180+: die Transcoder werden über `import.meta.url`
  aufgelöst und von Vite mitgebündelt (siehe P0/0.4). Wichtig ist jetzt das
  Gegenteil: **kein `setTranscoderPath()` aufrufen**, das schaltet die
  Auflösung ab. Falls der Vite-Dev-Server die Emscripten-Datei beim Ausliefern
  verändert, ist ein `?url`-Import der saubere Ausweg — nicht der Kopierschritt
- **`@gltf-transform/cli` braucht Node ≥ 20.** Vor dieser Phase muss die
  Node-Version hochgezogen werden (siehe P0/0.1)

---

# P6 — Stadt & Reflexionen

**Ziel:** Der Money-Shot. Nasser Asphalt, Neon, Spiegelungen — hier zahlt sich
die Entscheidung „blaue Stunde nach Regen" aus.

### Aufgaben

**6.1 — Stadt-Generator** → `src/world/city/CityGenerator.ts`
1. Straßensplines vom Typ `city` spannen ein Netz auf
2. Zwischenräume werden zu Parzellen unterteilt (rekursive Teilung nach Zielgröße)
3. Parzellen werden extrudiert: Höhe nach Rauschen, mit Rücksprüngen in oberen Etagen
4. Fassaden über einen Atlas mit **Emissive-Fensterkanälen**
5. Erdgeschosse bekommen Ladenzeilen-Geometrie (der Bereich, den man beim Fahren sieht)

**6.2 — Fassaden-Material** → `src/world/materials/FacadeMaterial.ts`
- Atlas-basiert, Fenstermuster per Instanz-Offset variiert
- Emissive-Kanal mit pseudo-zufälligem An/Aus-Muster pro Fenster (`hash(instanceID)`)
- Bei blauer Stunde ist das Fensterlicht die dominante urbane Lichtquelle —
  hier liegt der visuelle Ertrag, nicht in der Gebäudeform

**6.3 — Neon-System** → `src/world/city/NeonSystem.ts`
- Schilder als Emissive-Quads, japanische Schriftzeichen als Textur-Atlas
- Nur ~10 echte `PointLight`-Instanzen an Schlüsselstellen (SPEC §3.1) —
  der Rest ist Emissive + Bloom
- Flacker-Animation für einzelne Schilder (billig, wirkt stark)

**6.4 — Nasser Asphalt** → Erweiterung `RoadMeshBuilder` + Material
- Pfützenmaske aus der Vertex-Farbe (in P3 vorbereitet) plus Rauschtextur
- Pfützen: Roughness → nahezu 0, Normale → flach
- Übergangszone am Pfützenrand statt harter Kante
- Regen-Ringe optional als animierte Normal-Map-Lage

**6.5 — Reflexions-Entscheidung** ⚠ **Der Risiko-Punkt des Projekts**

Wird in dieser Reihenfolge evaluiert, jeweils an derselben Referenz-Szene:

| Ansatz | Qualität | Kosten | Bewertung |
|---|---|---|---|
| A: SSR (`postprocessing`) | Hoch, aber Ghosting/Rauschen | 3–6 ms | Zuerst testen |
| B: Planare Reflexion, nur Straßenebene | Sehr sauber, nur planar | 1 zusätzlicher Render-Pass | Fallback |
| C: Reflexions-Probes (Boxen pro Bereich) | Grob, aber stabil | Nahezu gratis | Ergänzung zu B |

**Entscheidungsregel:** Wenn SSR nach zwei Tagen Tuning sichtbares Rauschen oder
Ghosting an Fahrzeugkanten zeigt → B + C. Kombination B+C ist der pragmatische
Weg und in Rennspielen weit verbreitet.

**6.6 — Straßendecals** → `src/world/roads/Decals.ts`
- Fahrbahnmarkierungen, Gullys, Flicken, Reifenspuren
- Als projizierte Quads mit Polygon-Offset, gruppiert instanziert

### Akzeptanzkriterien
- [ ] Neon spiegelt sichtbar im nassen Asphalt
- [ ] Stadt bleibt in Budget (eigenes Teilbudget: < 300 Draw-Calls)
- [ ] Reflexionsansatz ist entschieden und dokumentiert
- [ ] Keine flimmernden Reflexionen bei Kamerabewegung
- [ ] Ein Screenshot der Stadt bei blauer Stunde ist vorzeigbar — das ist das Ziel der Phase

### Risiken
- **SSR** — siehe 6.5, Fallback ist definiert
- **Stadt sprengt das Draw-Call-Budget.** → Gebäude aggressiv nach Blöcken
  zusammenfassen (ein Merge pro Block statt pro Gebäude)

---

# P7 — Optimierung & Auslieferung

**Ziel:** Läuft auf der Zielhardware (GTX 1660 / RX 580), nicht nur auf der
Entwicklungsmaschine.

### Aufgaben

**7.1 — Qualitätsstufen** → `src/config/quality.config.ts`

| Stufe | Schatten | SSR | AO | Sichtweite | Vegetation | Render-Scale |
|---|---|---|---|---|---|---|
| Ultra | 4×2048 | ja | N8AO hoch | 2000 m | 100 % | 1,0 |
| Hoch | 4×1024 | ja | N8AO mittel | 1500 m | 70 % | 1,0 |
| Mittel | 3×1024 | nein | N8AO niedrig | 1000 m | 45 % | 0,85 |
| Niedrig | 2×1024 | nein | aus | 600 m | 25 % | 0,7 |

- Automatische Ersteinstufung über einen kurzen Benchmark beim ersten Start
- Umschaltung zur Laufzeit ohne Neuladen

**7.2 — Chunk-Streaming** → Erweiterung `ChunkManager`
- Vegetations- und Prop-Daten pro Chunk asynchron erzeugen (Web Worker)
- Prioritätswarteschlange nach Distanz und Blickrichtung
- Zeitbudget von 2 ms pro Frame für Chunk-Arbeit, Rest wird vertagt

**7.3 — Ladebildschirm** → `src/ui/LoadingScreen.ts`
- Echter Fortschritt aus `ResourceManager`, keine gefälschte Animation
- Kritische Assets zuerst (Terrain, HDRI), Vegetation nachladbar

**7.4 — Profiling-Durchgang**
- GPU-Timer pro System (Terrain / Vegetation / Stadt / PostFX)
- Spector.js-Aufnahme analysieren: redundante State-Wechsel, Shader-Neukompilierungen
- **Shader-Vorkompilierung** (`renderer.compile()`) vor dem ersten Frame —
  sonst ruckelt es beim ersten Sichtkontakt mit jedem neuen Material

**7.5 — Build & Auslieferung**
- Vite-Build mit Code-Splitting, Assets über Hash-Namen
- Alle Texturen KTX2, alle Modelle meshopt
- Brotli-Vorkompression
- Ziel: **erstes Bild < 15 MB** (SPEC §4)

### Akzeptanzkriterien
- [ ] Stufe „Mittel" hält 60 FPS auf einer GTX-1660-Klasse bei 1080p
- [ ] Stufe „Niedrig" hält 30 FPS auf integrierter Grafik
- [ ] Erster Frame nach < 5 s auf 50-Mbit-Verbindung
- [ ] Kein Ruckler > 50 ms während einer 2-minütigen Flugroute über die ganze Map
- [ ] Kein Speicherwachstum über 10 Minuten (Leak-Prüfung)

### Risiken
- **Zielhardware nicht verfügbar.** → GPU-Drosselung in den Chrome DevTools
  plus `WEBGL_debug_renderer_info`-Telemetrie. Ersetzt echtes Testen nicht;
  falls möglich, auf einem zweiten Rechner gegenprüfen

---

## Was bewusst NICHT in diesem Plan steht

Diese Punkte sind Spielentwicklung, nicht Kartenbau. Sie kommen nach P7 und
bekommen einen eigenen Plan:

- Fahrzeugphysik und Drift-Modell (Rapier vs. eigene Arcade-Physik — offen)
- Kollisionsgeometrie zur Laufzeit (`three-mesh-bvh` liefert die Grundlage,
  die Integration ist eigenständige Arbeit)
- KI-Gegner, Rennlogik, Rundenzeiten
- HUD, Menüs, Fortschrittssystem
- Audio
- Mehrspieler

**Bewusst verschoben, aber vorbereitet:** P3 exportiert bereits Ideallinie,
Spawnpunkte und Streckenabschnitte. P1 liefert mit `TerrainSampler` die
Höhenabfrage, die jede Fahrphysik braucht. Diese Schnittstellen existieren
früh, damit der Übergang keine Umbauten erzwingt.

---

## Offene Entscheidungen

| # | Frage | Spätestens in | Vorläufige Tendenz |
|---|---|---|---|
| 1 | SSR oder planare Reflexion + Probes | P6 | Erst SSR testen, Fallback steht |
| 2 | Kreuzungen prozedural oder handmodelliert | P3 | Prozedural, hart zeitbegrenzt |
| 3 | Physik-Engine | nach P7 | Rapier (WASM, bewährt) |
| 4 | Imposter-Baking headless oder in-app | P4 | In-app, falls headless zickt |
| 5 | Carving vor oder nach der Erosion | P3 | Nachher, sonst neu bewerten |
