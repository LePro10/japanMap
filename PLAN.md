# japanMap — Implementierungsplan

> Ausführungsplan zu [SPEC.md](SPEC.md). Die Spec sagt **was** gebaut wird,
> dieser Plan sagt **in welcher Reihenfolge, mit welchen Dateien und woran wir
> merken, dass eine Phase fertig ist**.
>
> Stand: 2026-07-30 · **P0–P6 abgeschlossen, P7 gebaut und teilabgenommen,
> P8 geplant**
>
> P7 ist vollständig gebaut. Zwei seiner fünf Akzeptanzkriterien lassen sich auf
> dieser Maschine nicht prüfen (keine GTX-1660-Klasse, kein GPU-Timer), eines ist
> **nachweislich verfehlt**: der Startdownload liegt bei 42,68 MB gegen 15 MB.
> Die Einzelheiten stehen unten bei P7; das Wesentliche ist, dass die Lücke
> beziffert und nicht behauptet ist.
>
> Die Serpentinenzahl am Bergpass bleibt hinter SPEC §2.1 zurück (2 statt ≥ 8).
> Das ist **keine offene P3-Aufgabe**, sondern eine Anforderung an das Höhenfeld:
> die Trassierung baut Kehren, das Massiv trägt sie nicht ohne sichtbaren
> Geländeschaden. Verschoben als P1-Nachbesserung, siehe dort.
>
> **Diese Nachbesserung war für „vor P4" vorgemerkt und ist nicht erfolgt.** Das
> ist eine Entscheidung und keine Auslassung: die Flanke abzuflachen ändert die
> Silhouette des Massivs, und das Massiv ist der Hintergrund der halben Karte —
> eine Art-Direction-Frage, die nicht nebenbei mitentschieden wird. Technisch
> kostet die Verschiebung nichts: die Streuung ist zur Laufzeit deterministisch
> aus Seed und Chunk-Koordinate gerechnet und folgt einem geänderten Höhenfeld
> von selbst, und die Verschattung wird ohnehin neu gebacken. Was nachgezogen
> werden muss, sind die **Zahlen** in dieser Datei.
>
> **Entschieden am 2026-07-30: die Nachbesserung läuft in P8.5a.** Die
> Art-Direction-Frage ist damit beantwortet. Sie liegt dort zusammen mit allen
> anderen Eingriffen ins Höhenfeld in **einem** Durchgang — ein zweiter später
> kostete die vollständige Neumessung ein zweites Mal.

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
> npm run world   # backt alles der Reihe nach (gemessen 44,9 s)
> npm run dev
> ```
>
> `npm run world` ist die Abkürzung für diese Kette — und die Reihenfolge darin
> ist nicht beliebig, sondern zirkulär aufgelöst:
>
> ```bash
> npm run bake:clean  # Terrain OHNE Straßen — der Generator braucht ein Höhenfeld
> npm run sun         # Sonnenrichtung aus dem Himmels-HDRI
> npm run roads       # Straßennetz, an das Gelände angepasst
> npm run bake        # noch einmal, jetzt mit eingeschnittenen Straßen
> npm run shade       # Verschattung des fertigen Geländes
> ```
>
> **`bake:clean` ist nicht dasselbe wie `bake`, und der Unterschied ist der
> ganze Punkt.** Der erste Durchgang muss den Zustand *vor* dem Einschneiden
> herstellen (`--no-roads`). Ohne diesen Schalter frisst sich die Kette selbst
> auf: `bake` schneidet die Straßen des **vorherigen** Laufs ein, der Generator
> trassiert anschließend durch seine eigenen Einschnitte, und das Ergebnis
> wandert bei jedem Aufruf weiter. Sichtbar wurde es daran, dass der
> Mindestradius der Dorfstraße von 21,8 m auf 8,1 m fiel, ohne dass sich an
> ihrem Quelltext etwas geändert hatte.
>
> **Aus demselben Grund ist `npm run roads` allein keine gültige Messung.** Es
> läuft gegen das zuletzt gebackene — also bereits eingeschnittene — Gelände und
> meldet dann Zahlen, die niemand reproduzieren kann: derselbe Bergpass kam so
> auf 3410 m mit 5 Kehren und 11,2 m Erdbau statt auf 3966 m mit 8 Kehren und
> 28,8 m. Wer am Generator arbeitet, setzt einmal `npm run bake:clean` davor und
> bleibt dann auf diesem Stand; verbindlich ist nur, was `npm run world` ausgibt.

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
| **P4** ✅ | LOD & Vegetation | Gefüllte Welt in Budget | P1, P3 |
| **P5** ✅ | Asset-Pipeline & Landmarks | Zonen mit Identität | P4 |
| **P6** ✅ | Stadt & Reflexionen | Der Money-Shot | P2, P5 |
| **P7** ◐ | Optimierung & Auslieferung | Läuft auf Zielhardware | alle |
| **P8** ○ | Polish & Presets | Die Karte trägt ein Spiel | P7 |

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

### Nachbesserung aus P3: die Flanke des Massivs

**Aufgabe für `tools/bake-terrain.mjs`, nicht für den Straßengenerator.**

SPEC §2.1 verlangt einen Bergpass mit Serpentinen; gebaut sind zwei Kehren. Die
Trassierung kann mehr — acht wurden gebaut und gemessen —, aber das Massiv trägt
sie nicht: bei acht Kehren werden rund 300 × 250 m Gelände um 50 bis 150 m
abgetragen. Der Grund ist Geometrie und in P3 unter „Warum es trotzdem nur zwei
Kehren sind" belegt: auf einem 45-%-Hang liegen zwei Serpentinenschenkel weiter
auseinander, als die Fahrbahnhöhen es bei 11 % zulassen.

Gebraucht wird eine **längere, flachere Flanke** — nicht das „schmalere, steilere
Tal", das hier ursprünglich als Lösung stand; das ist genau verkehrt herum. Eine
Flanke mit rund 25 % statt 45 % Neigung über etwa 1,5 km gibt die Traversenlänge
her, die acht Kehren brauchen.

Zwei Randbedingungen, damit die Nachbesserung nicht mehr kaputt macht, als sie
repariert:

- Das Massiv ist der **Hintergrund der halben Karte**. Die Flanke abzuflachen ist
  eine Art-Direction-Entscheidung, keine reine Parameterfrage — die Silhouette aus
  der Ebene und von der Küste ändert sich mit.
- Danach laufen **alle** nachgelagerten Zahlen neu: Straßennetz, Verschattung,
  Erdbau, und ab P4 die Vegetationsverteilung. Sinnvoll also **vor** P4, nicht
  danach.

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
| Startdownload | **44,1 MB** gegen 15 MB Budget (P1: 42,8 MB; +1,3 MB durch `shade.png`) | Himmel auf 2k ≈ −8 MB · KTX2 in P5 · `normal.png` streichen in P7 — **in P7.5 nachgemessen: 58,19 MB roh, 42,68 MB mit Brotli, und mit allen drei Hebeln blieben rund 18 MB. Der Punkt bleibt offen, siehe dort** |
| Uferkante polygonal | 4 m pro Terrain-Quad | P4, LOD-Quadtree |
| Kachelmuster auf beschatteter Ebene | sichtbar bei niedrigem Kontrast | P4/P7, Detailtextur-Varianz |
| Debug-Ansichten laufen durch AgX | Graustufen erscheinen angehoben | kosmetisch, kein Fix geplant |

---

# P3 — Splines & Straßen ✅

**Ziel:** Das Straßennetz. Laut SPEC §2.3 das zentrale Datenmodell des Projekts —
es liefert Geometrie, Terrain-Verformung und später alle Gameplay-Daten.

> **Stand 2026-07-26 — abgeschlossen.**
>
> Die Phase galt schon einmal als fertig und wurde wieder geöffnet: der Tōge lief
> auf 83 % seiner Länge als rund 50 m tiefer Graben durch das Massiv und hatte
> **null** Kehren. Drei Stufen der Trassierung löschten die gefundenen
> Serpentinen; sie sind repariert, und mit ihnen sind Kehren überhaupt erst
> baubar geworden — gemessen bis zu **8**.
>
> Bei acht Kehren wird der Serpentinenbereich allerdings zum **Steinbruch**: rund
> 300 × 250 m Massiv um 50 bis 150 m abgetragen, eine zusammenhängende Fläche.
> Ausgeliefert ist deshalb der gemessene Kompromiss mit **2 Kehren** bei 19,5 m
> mittlerem Erdbau. Dass beides nicht zugleich geht, ist Geometrie und kein
> Parameter — vier Hebel wurden dagegen gemessen und alle vier verworfen.
>
> **Die Phase ist damit abgeschlossen.** Was die Trassierung leisten kann, leistet
> sie: Kehren sind baubar, gemessen bis zu acht. Die *Zahl* hängt an der Form des
> Massivs und ist als **P1-Nachbesserung** notiert, nicht als offene P3-Aufgabe —
> sonst bliebe eine Phase auf unbestimmte Zeit offen wegen einer Anforderung, die
> in einer anderen erfüllt werden muss. Der ganze Vorgang steht unter
> „Wie der Bergpass zu seinen Kehren kam".
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

**3.1b — Trassierung** ✅ → `tools/route-planner.mjs`

Nicht im ursprünglichen Plan. Der Plan setzte voraus, dass Strecken von Hand
gezeichnet werden; sobald sie stattdessen erzeugt werden, muss jemand
entscheiden, **wo** sie langlaufen — und das ist ein eigenes Problem.

- A* über ein Kostenfeld, 155×155 Zellen à 20 m, 16 Nachbarrichtungen
- Kosten: Längsneigung über dem Grenzwert (quadratisch bestraft, nicht
  verboten), **Querneigung** des Geländes (quadratisch), Wasser, optional ein
  Korridor um die Luftlinie
- Danach: Stichwege entfernen → Mittelwertfilter → Douglas-Peucker →
  Gerade-Bogen-Gerade → Kontrollpunkte

> **Die Querneigung war der Fund.** Der Abtrag an der Böschungskante ist
> ungefähr `Querneigung × halbe Breite`, und keine Längsbetrachtung sieht ihn.
> Genau daher kamen die −310 m des ersten Entwurfs: die Trasse lief mit
> korrekter Steigung quer an einer Felsnadel vorbei.

> **20 m Zellgröße ist kein runder Wert.** 9 m Fahrbahn plus zweimal 15 m
> Böschung ergeben knapp 40 m Fußabdruck; feiner zu suchen täuscht eine
> Genauigkeit vor, die die Straße nicht hat.

> **16 Richtungen statt 8.** Mit acht kann ein Weg nur in 45°-Stufen laufen. Am
> Hang heißt das: die Traverse liegt entweder zu flach oder zu steil, nie
> dazwischen — und die Steigungskosten erzwingen dann ein Sägezahnmuster. Die
> Springerzüge bringen 26,57° und 63,43° dazu.

> **Der Korridor stellt die Frage richtig.** Ohne ihn nimmt die Suche den
> billigsten Weg, und um einen kegelförmigen Gipfel ist das eine **Spirale**,
> keine Serpentine: gemessen 3,77-facher Umweg und null Kehren. Das ist keine
> falsche Lösung, sondern die Antwort auf eine falsch gestellte Frage.

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
- ~~`npm run bake:watch`~~ → offen. Die ganze Kette braucht gemessen 44,9 s; ein
  Watch-Modus spart daran nichts Wesentliches und müsste die zirkuläre
  Reihenfolge selbst korrekt nachbilden

> **„Nächster gewinnt" statt Sonderfall für Kreuzungen.** Jeder Texel merkt sich
> den nächstliegenden Straßenpunkt; wo zwei Trassen sich treffen, entscheidet
> schlicht der Abstand. Das Einebnen braucht deshalb keinen Kreuzungscode — die
> *Höhen* der beiden Straßen gleicht dagegen 3.5 ab, sonst ebnet das Carving
> zwei Fahrbahnen ein, die auf verschiedenen Höhen liegen.

> **Der Ablauf ist zirkulär und wird durch zweimaliges Backen aufgelöst:** der
> Generator braucht ein Höhenfeld, der Baker braucht die Straßen. Erster Lauf
> mit `--no-roads`, dann `gen-roads`, dann noch einmal backen. Stabil, weil das
> Basis-Terrain bei gleichem Seed identisch bleibt und sich nur das Carving
> ändert — **aber nur, wenn der erste Lauf wirklich ohne Einschnitte bäckt.**
> Ohne den Schalter genügt schon eine vorhandene `roads.json` aus einem früheren
> Lauf, damit der Generator durch fremde Einschnitte trassiert. Siehe oben.

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
> Array und allokationsfreiem Suchkern: **40,1 ms** — und **40,2 ms**, nachdem
> die kostenbasierte Trassierung das Netz auf 6359 Segmente hat wachsen lassen.
> Der Suchaufwand hängt an der Verteilung der Abfragepunkte, nicht an der
> Netzgröße; genau das war der Grund für das Gitter.

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
- [x] **Straßen liegen sauber im Terrain** — auf der Achse gemessen (`measured`
      in `roads.json`, Grenzwerte aus `TYPES`): Ring ⌀ **6,9 m** (≤ 12),
      Dorf ⌀ **0,2 m** (≤ 8), Pass ⌀ **19,5 m** (≤ 30). Über den ganzen
      Fußabdruck inklusive Böschung (Bericht des Bakers): 175 330 Texel,
      ⌀ **6,6 m**, 95 % unter 27,5 m, tiefster Einschnitt −97,0 m.
      Ausgangszustand: ⌀ 9,6 m, 95 % unter 48,7 m, −168,6 m.

      > Die hier zuvor genannten Werte (Ring 7,9 / Pass 8,6 / Dorf 2,3 m) stammten
      > aus einem Lauf **vor** der kostenbasierten Trassierung und wurden beim
      > ersten P3-Abschluss nicht mitgezogen — Längen und Radien daneben schon.
      > Der Haken stand auf Zahlen, die die ausgelieferten Daten nicht hergaben;
      > seither prüft `maxEarthwork` das mit.

      Unabhängig am **gebackenen** Höhenfeld nachgemessen, nicht aus dem Bericht
      des Generators übernommen: keine Strecke kreuzt sich selbst, der kleinste
      Achsabstand zwischen Abschnitten über 120 m Bogenlänge auseinander beträgt
      13,2 m, und **keine Strecke verlässt die Welt** — vorher lagen 124 m des
      Passes bis zu 40 m jenseits der Kante, weil Kehrenaufweitung und Verrundung
      die Linie über das Suchgitter hinausschieben. `EDGE_MARGIN` sperrt den
      Randstreifen jetzt in der Suche selbst
- [x] **Bergpass hat Serpentinen mit fahrbaren Radien** — **2 Kehren** auf
      2983 m, Mindestradius **20,1 m** (Soll ≥ 15), Steigung **10,5 %**
      (Soll ≤ 11 %). Gezählt werden Läufe gleichsinniger Drehung über 150° auf
      der fertigen Mittellinie, nicht Ecken im Polygonzug.

      > **Die Zahl ≥ 8 aus SPEC §2.1 ist damit nicht erreicht, und das ist eine
      > Entscheidung, keine Auslassung.** Acht Kehren wurden gebaut, gebacken und
      > angesehen: sie kosten 30,2 m mittleren Erdbau und legen 740 m Strecke in
      > Einschnitte über 50 m — rund 300 × 250 m Massiv als zusammenhängende
      > Abtragsfläche. Vier Gegenmittel wurden gemessen und alle vier verworfen.
      > Die Anforderung wandert damit dorthin, wo sie erfüllt werden kann:
      > **P1-Nachbesserung am Höhenfeld**, siehe unten. Begründung und Zahlen
      > unter „Warum es trotzdem nur zwei Kehren sind"
- [x] **Ringstraße ist geschlossen und durchgehend befahrbar** — 6120 m
      geschlossen, R min **62,5 m** (Soll ≥ 45), Steigung 6,9 % (Soll ≤ 7 %)
- [x] **Textur-Tiling gleichmäßig über Kurven und Geraden** — bauartbedingt: die
      Mittellinie ist in der **Bogenlänge** gleichmäßig abgetastet und `v` ist
      Meter geteilt durch Kachellänge. Der Rücksprung an Kreuzungen rechnet mit
      der ungekürzten Bogenlänge weiter, damit die Kachelung dort nicht springt
- [x] **`distanceToNearestRoad()`: 100 000 Abfragen in < 50 ms** — **40,1 ms**
      bei 6909 Segmenten im Gitter (drei Läufe: 40,6 / 40,1 / 40,1), gemessen in
      Node über `--experimental-strip-types`. Erster Entwurf: 207,8 ms

### Wie der Bergpass zu seinen Kehren kam

> **Hier stand bis zum 2026-07-26 die Begründung, warum er keine hat.** Sie
> lautete: das Gelände verlange keine Kehren und gebe sie nicht her, wer den Tōge
> als Drift-Strecke wolle, müsse das Höhenfeld ändern. Das war falsch. Die
> Trassierung *fand* die Kehren die ganze Zeit — drei Stufen danach löschten sie
> wieder.

**Erstens: das Massiv ist besteigbar.** Eine Flaschenhals-Flut vom Ringanschluss
aus (jeder Zelle die kleinstmögliche Maximalhöhe auf dem Weg dorthin zuordnen)
zeigt, dass der 450-m-Gipfel **ohne eine einzige Gegensteigung** erreichbar ist.
Es gibt keine Wand davor; die alte Begründung nahm eine an.

**Zweitens: wo die Kehren blieben.** Gemessen mit `STAGES=1 npm run roads` am
letzten Anlauf des Passes, im Zustand vor der Reparatur:

| Stufe | Länge | Kehren |
|---|---|---|
| A* roh | 3868 m | 30 |
| nach `removeSpurs` | 2767 m | 10 |
| nach `smoothPath` | 2018 m | 1 |
| nach `simplify` | 1989 m | 1 |
| fertige Straße | 1874 m | 0 |

Drei Stufen, drei verschiedene Gründe:

1. **`removeSpurs`** löscht alles zwischen zwei Punkten, die sich näher als 24 m
   kommen. Eine Kehre *ist* das — der Rückweg läuft eine Zellbreite neben dem
   Hinweg. Gebaut wurde die Stufe gegen den 180°-Stichweg am Ring, und dagegen
   ist sie richtig; sie kann beides nur nicht auseinanderhalten. Sie unterscheidet
   jetzt am **Höhengewinn**: wer zwischen zwei nahen Punkten mindestens ein
   Viertel der Höchstneigung mal der Strecke gestiegen ist, hat gearbeitet. Ein
   Stichweg gewinnt nichts, eine Serpentine am Grenzwert das Vierfache.
2. **`smoothPath`** mittelt über sieben Punkte, bei 33 m Punktabstand also über
   230 m Weg. Eine Kehre ist 40 bis 60 m breit und wird dabei nicht gerundet,
   sondern plattgezogen. `preserveAngle` bricht das Fenster jetzt an Ecken über
   70° ab — der Sägezahn der Gitterrichtungen liegt bei 18,4°, dazwischen ist
   reichlich Platz.
3. **`simplify`** (Douglas–Peucker, 12 m) sieht keinen Unterschied zwischen einer
   Gittertreppe und der einzigen Stelle, an der die Straße umkehrt. Geschützte
   Ecken sind jetzt Ankerpunkte, zwischen denen vereinfacht wird, nie darüber
   hinweg.

**Drittens: eine Kehre lässt sich nicht aus einem Scheitel bauen.** Das war der
eigentliche Kern. Die Suche liefert die Umkehr als *einen* Punkt, an dem zwei
Schenkel sich unter 10 bis 20° treffen; ein Bogen, der beide tangential
verbindet, braucht `R·tan(φ/2)` — bei 170° und R = 24 m sind das 274 m auf jedem
Schenkel. `filletPath` hat sie deshalb reihenweise entfernt, mit Radien von 2,4
bis 14,6 m gegen eine Untergrenze von 19,5 m.

Der äußere Tangentialkreis ist **kein** Ausweg, und zwar aus einem anderen Grund
als in der Fehlertabelle unten steht. Dort heißt es, für beide Kreise gelte
`T = R·tan(φ/2)`; richtig ist `T = R/tan(φ/2)` für den äußeren, bei 170° also
2,1 m statt 274 m. Er scheitert daran, dass er beide Geraden an Punkten berührt,
an denen die **Fahrtrichtung entgegengesetzt** ist. Nachgerechnet bleibt für zwei
Strahlen aus einem gemeinsamen Scheitel wirklich nur der einbeschriebene Bogen.

Eine echte Serpentinenkehre hat den Scheitel deshalb gar nicht: sie hat zwei
seitlich versetzte Schenkel und dazwischen ein Querstück, das die beiden
Bogentangenten trägt. Genau das setzt `widenHairpins` ein — aus einer 170°-Ecke
werden zwei 85°-Ecken, die je `R·tan(42,5°)` ≈ 0,92 R brauchen. Der Preis ist
ehrlich: die Straße rückt am Scheitel bis zu `riser/2` von der gesuchten Trasse
ab. Eine Kehre braucht Platz.

**Viertens: zwei Kehren, die ineinanderlaufen.** Nach dem Aufweiten kreuzte der
Pass sich bei km 3,00 und km 3,22 mit 1,1 m Achsabstand — bei 6,5 m Fahrbahn
liegen die Beläge übereinander, und keine Radius-, Steigungs- oder
Erdbauprüfung schlägt an. Geprüft wird deshalb die **fertige Mittellinie**, die
der Baker einschneidet, nicht der Polygonzug davor: vor den Bögen hielten die
Punkte noch 53 m Abstand. Bei einem Treffer fällt die Aufweitung der Kehre
*zwischen* beiden Fundstellen weg — nicht die dem Kreuz nächstgelegene, denn das
Kreuz liegt an den Schenkeln und der Scheitel weit davon am Ende der Schleife.
Am fertigen Pass wird genau **eine** von 24 Aufweitungen zurückgenommen.

**Fünftens: der Schwanz unter Grund.** Auf den letzten Metern steigt das Massiv
mit 17 %, die Fahrbahn darf 11 % — sie fällt zurück und wühlt sich als Einschnitt
zu einem Ziel, das sie nicht erreichen kann. Gemessen endete der Pass 59 m unter
Grund, und dieser Schwanz allein trug den mittleren Erdbau von 24 auf 31 m. Zwei
Antworten wurden gemessen und verworfen: das **Ziel abzusenken** nimmt der Trasse
die Länge und damit die Kehren (9 → 1), die **Kontrollpunkte zu kürzen und neu zu
bauen** legt das Höhenprofil neu aus und kostet ebenfalls Kehren (9 → 7).
Gebaut ist deshalb ein Schnitt, der Trasse und Profil unangetastet lässt und nur
die fertige Linie kappt — 116 m, und danach wird **neu gemessen**, sonst meldete
die Strecke die Kennwerte der Trasse, die sie vor dem Schnitt war.

**Sechstens: die Straße lief aus der Karte.** 124 m des Passes lagen bis zu 40 m
jenseits der Weltkante — Fahrbahn über dem Nichts. Die Suche selbst *kann* das
Gitter nicht verlassen; alles danach schon: die Kehrenaufweitung versetzt die
Linie um `riser/2` (26 m), die Verrundung beult zusätzlich aus, das Mesh legt die
halbe Fahrbahn daneben. `EDGE_MARGIN` sperrt deshalb einen 80-m-Randstreifen in
der Suche, statt hinterher zu klemmen — eine Straße, die 40 m neben der Welt
endet, ist kein teurer Kompromiss, sondern kaputt.

### Warum es trotzdem nur zwei Kehren sind

Mit den Reparaturen oben sind **acht** Kehren baubar. Sie wurden gebaut, gebacken
und angesehen — und der Serpentinenbereich wird dabei zum Steinbruch: rund
300 × 250 m Massiv um 50 bis 150 m abgetragen, im Erdbau-Bild eine
zusammenhängende rote Fläche statt eines Hanganschnitts. An den Kehren beträgt
der Einschnitt ⌀ **49 m** gegen 20 m auf der übrigen Strecke.

**Das ist Geometrie, kein Parameter.** Auf einem 45-%-Hang liegen zwei
Serpentinenschenkel 50 bis 100 m auseinander im Gelände, aber nur 30 bis 60 m in
der Fahrbahnhöhe — die Differenz muss das Gelände tragen. Vier Hebel wurden
dagegen gemessen, jeder senkt den Erdbau **ausschließlich** über den Verlust von
Kehren:

| Hebel | Wirkung |
|---|---|
| Gegensteigung als Kostenterm (Gewicht 4 / 12 / 30) | 12 → 0 Kehren; Erdbau 28,8 → 18,5 m |
| Korridorbreite (300 / 500 / 700 / 900 m) | kein Gewinn, der die Kehren erhält |
| Mindestabstand zwischen Kehren (200 / 350 / 500 m) | 8 → 1…4 Kehren |
| Kehre hangabwärts versetzen (`downhillBias`) | 5 → 1…2 Kehren; Erdbau 30,2 → 19,5 m |

Ausgeliefert ist `downhillBias: 0.3` bei 700 m Korridor: **2 Kehren, 19,5 m
Erdbau, 320 m Strecke (10,7 %) in Einschnitten über 50 m, tiefster 94 m.** Zum
Vergleich der Ausgangszustand: 0 Kehren, 49,2 m Erdbau, 680 m über 50 m,
tiefster 165 m. Jede Zahl ist besser geworden — die Serpentinenzahl bleibt unter
der Vorgabe.

**Was das Kriterium wirklich braucht, ist ein anderes Gelände.** Nicht „ein
schmaleres, steileres Tal", wie hier ursprünglich stand — das Gegenteil: eine
*längere, flachere* Flanke, auf der die Traversen zwischen den Kehren weit genug
auseinanderliegen. Das ist eine P1-Änderung am Baker und zugleich eine
Art-Direction-Entscheidung, weil das Massiv der Hintergrund der halben Karte ist.
Bis dahin ist die Vorgabe aus SPEC §2.1 unerfüllt, und zwar nachweislich am
Höhenfeld und nicht am Generator.

**Was der Pass jetzt ist:** 2983 m, 2 Kehren, Mindestradius 20,1 m (Soll ≥ 15),
Steigung 10,5 % (Soll ≤ 11 %), Erdbau ⌀ 19,5 m (Soll ≤ 30), Anstieg von 41 auf
264 m. Keine Selbstkreuzung, kleinster Achsabstand 13,2 m, nichts außerhalb der
Welt, in zwei vollen Läufen bitgleich.

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
| Bergpass erreicht den Gipfel nicht | endet auf **297 m**, Gipfel 450 m | Kein Trassierungsproblem: bei 11 % braucht der Rest mehr Strecke, als der Hang im Korridor hergibt. Frage der Zonengröße, nicht des Generators |
| Erdbau am Pass bleibt hoch | ⌀ **28,8 m** gegen 30 m Grenzwert | Zielkonflikt, nicht Fehler: jede Kehre terrassiert die Straße weiter in den Hang und kostet rund einen halben Meter. Gemessen und in „Wie der Bergpass zu seinen Kehren kam" belegt |
| Eine Kehre fällt der Eigenkollision zum Opfer | 1 von 24 Aufweitungen | Zwei benachbarte Kehren liefen ineinander. Zurückgenommen statt verschoben — eine Kehre zu versetzen hieße, das Höhenprofil neu auszulegen |
| Kreuzungsflächen nicht verschnitten | Rücksprung 5,5 m | Sichtbar sauber, weil der Einschnitt einebnet. Echte Verschneidung mit Fahrspurführung wäre eine eigene Phase |
| Erdbau-Extremwerte an der Böschungskante | −150,1 m an einem Texel | Wo der Fußabdruck Erosionsnadeln streift. Das ist der *Einzelwert*; gemessen wird pro Strecke, nicht über das Netz — der Mittelwert über alle Strecken hat den Graben am Pass einmal verdeckt |
| Straßen-Kanal in der Zonenmaske (3.3) | — | bewusst weggelassen: `distanceToNearestRoad()` erfüllt denselben Zweck für P4 |
| `npm run bake:watch` | Kette gemessen: **40,6 s** | offen; bei dieser Laufzeit ist ein Watch-Modus keine Erleichterung, sondern eine zweite Fehlerquelle |
| Startdownload | **51,95 MB** (P2: 44,1 MB) | +7,9 MB durch `asphalt_02` in 2k — die Normalmap ist mit 4,71 MB größer als jede andere Textur im Projekt. KTX2 in P5 |

### Gemessener Stand am Ende von P3

| Größe | Gemessen | Budget |
|---|---|---|
| Draw-Calls | **36** | 800 |
| Dreiecke | **1.212.971** | 3.000.000 |
| Texturspeicher | **255 MB** | 512 MB |
| Programme | 20 | — |
| CPU / GPU je Frame | 0,20 ms / 1,72 ms | 16,6 ms |
| Netz | 3 Strecken, **9,80 km**, davon 2983 m Bergpass mit 2 Kehren | — |

> **Die Zeilen darüber sind noch die vom 8,68-km-Netz.** Draw-Calls, Dreiecke,
> Texturspeicher und CPU/GPU je Frame lassen sich nur im laufenden Bild ablesen,
> und der eingebaute Browser bekommt auf dieser Maschine keinen WebGL-Kontext
> (Software-Rasterizer). Was ohne Bild prüfbar war, ist geprüft: `tsc` sauber,
> Produktionsbuild grün, Dev-Server liefert alle gebackenen Dateien mit HTTP 200
> und ohne Konsolenfehler außer dem fehlenden Kontext, `npm run world` in zwei
> Läufen bitgleich. Das Netz ist um 2,1 km gewachsen — bei 29 724 Dreiecken für
> 8,68 km bleibt das ein Prozent des Budgets, **abgelesen ist es trotzdem nicht.**
| Konsole | keine Fehler, keine Warnungen | — |

Leitplanken und Pfosten kosten zusammen **zwei** Draw-Calls: das Band aller
Strecken liegt in einer Geometrie, die Pfosten in einem `InstancedMesh`.

---

# P4 — LOD & Vegetation ✅

**Ziel:** Die Welt füllt sich, und zwar innerhalb der Budgets aus SPEC §4. Ab
hier gilt: was das Overlay nicht bestätigt, gilt als nicht erledigt.

> **Abgeschlossen am 2026-07-27.** Alle Zahlen dieser Phase sind im laufenden
> Bild abgelesen, bei 1280×720.
>
> **Was P3 als blockiert notiert hatte, ist es nicht mehr.** Dort stand: „der
> eingebaute Browser bekommt auf dieser Maschine keinen WebGL-Kontext
> (Software-Rasterizer)", und damit sei P4 nicht abnehmbar. Nachgesehen: es
> *gibt* einen WebGL2-Kontext, über ANGLE auf dem *Microsoft Basic Render
> Driver*. Was fehlt, ist allein `EXT_disjoint_timer_query_webgl2` — GPU-ms
> bleiben `n/a`, und die Bildrate (5 bis 8 FPS) sagt über die Zielhardware
> nichts. **Draw-Calls, Dreiecke, Texturspeicher und Instanzzahlen sind dagegen
> CPU-seitige Zähler und exakt**, und Popping, Risse und Imposter sind
> Bildfragen. Genau das sind die Akzeptanzkriterien dieser Phase; keines davon
> hängt an der GPU-Zeit.
>
> Zwei Werkzeuge sind dafür entstanden, ohne die keine der Messungen möglich
> gewesen wäre: `window.japanMap.shot()` legt den gerenderten Frame als PNG in
> `.cache/shots/` ab (der Browser komponiert im Hintergrund keine Frames, ein
> Bildschirmfoto von außen scheidet damit aus), und der Dev-Server nimmt es über
> `/__shot` entgegen. Beides nur im Dev-Build.
>
> | Aufgabe | Stand |
> |---|---|
> | 4.1 CDLOD-Quadtree | ✅ ein Draw-Call für das ganze Terrain |
> | 4.2 Streu-System | ✅ deterministisch, vier Arten |
> | 4.3 Instanzierung & LOD | ✅ zwölf Draw-Calls statt der geplanten ~600 |
> | 4.4 Imposter | ✅ in der App gebacken statt in `tools/` |
> | 4.5 Wind | ✅ zwei Frequenzen, Amplitude je Art |
> | 4.6 Budget-Durchsetzung | ✅ Banner plus Verursachertabelle |

### Aufgaben

**4.1 — Terrain-Quadtree mit CDLOD** → `src/world/ChunkManager.ts`, `src/config/lod.config.ts`, `src/world/terrain/HeightPyramid.ts` ✅

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

> **Umgesetzt mit drei Abweichungen, davon eine gemessen erzwungene.**
>
> **1. Die Knoten sind Instanzen einer Geometrie, nicht Meshes.** Der Plan sagt
> „eine einzige geteilte Gittergeometrie, pro Knoten skaliert und verschoben",
> und die naheliegende Lesart wäre ein `Mesh` je Knoten mit eigener Matrix. Das
> hätte bei den gemessenen 73 bis 137 Knoten ebenso viele Draw-Calls gekostet —
> ein Sechstel des Budgets aus SPEC §4 für etwas, das vorher **einen** gekostet
> hat. Gebaut ist eine `InstancedBufferGeometry` über ein Einheitsquadrat [0,1]²
> mit vier Instanzattributen (Ecke, Kantenlänge, Morph-Bereich, Stufe). Das
> Terrain kostet weiterhin genau einen Draw-Call.
>
> **2. Der Aufteilungsfaktor ist 6, nicht der zunächst gewählte 3 — und das ist
> hergeleitet.** Risslos ist der Baum nur, wenn zwei Bedingungen gelten:
>
>   - *Höchstens eine Stufe Unterschied zwischen Nachbarn.* Ein gezeichneter
>     Knoten A der Stufe L erfüllt `d(c,A) ≥ r[L−1]`; ein Nachbar der Stufe L−2
>     verlangt, dass dessen Elternknoten P (Stufe L−1, an A angrenzend)
>     unterteilt wurde, also `d(c,P) < r[L−1]/2`. Mit `d(c,A) ≤ d(c,P) + diam(P)`
>     folgt **f > 2√2 ≈ 2,83**.
>   - *An der Naht muss die gröbere Stufe ungemorpht sein.* Nur dann liegen ihre
>     Stützstellen dort, wo die feinere ihre vollständig zusammengezogenen
>     hinlegt. Für einen Punkt v auf der gemeinsamen Kante gilt nur
>     `d(v) < (f/2 + √2)·s_L`, also muss `morphStart ≥ 0,5 + √2/f` sein.
>
> Die zweite Bedingung fehlte im ersten Entwurf. Bei f = 3 verlangt sie
> `morphStart ≥ 0,971` — dann bleibt für den Morph kein Weg mehr, und aus dem
> Riss würde ein Sprung. Bei f = 6 sind es 0,736, ausgeliefert ist 0,78 mit
> Zugabe für die Höhe der Knoten (die Herleitung rechnet nur in XZ).
>
> **Nachgemessen, nicht hergeleitet stehengelassen.** Sieben Blickpunkte, alles
> außer dem Gelände ausgeblendet, Himmel auf Magenta, Kamera so gekippt, dass
> kein Himmel im Bild steht; gezählt wurden Himmelspixel *unterhalb* des
> obersten Geländepixels jeder Spalte — jedes davon ist ein Loch:
>
> | Einstellung | Löcher | schlimmster Blick | Knoten je Bild |
> |---|---|---|---|
> | f = 3 · morphStart 0,66 | **207** | 86 | 34…49 |
> | f = 6 · morphStart 0,78 | **1** | 1 | 73…105 |
>
> Das eine verbliebene Pixel liegt an einer Grat-Silhouette und ist von echtem
> Himmel hinter einer Kante nicht zu unterscheiden.
>
> **3. Die Min/Max-Werte kommen nicht aus `meta.json`.** Der Plan nennt die je
> 256-m-Chunk gebackenen Werte aus P1, aber 3072 / 256 = 12 ist keine
> Zweierpotenz: das Chunk-Gitter liegt schief zum Quadtree, dessen Knoten sich
> fortlaufend halbieren. Ein 48-m-Blatt müsste bis zu vier Chunks vereinigen und
> bekäme deren Extremwerte über die 25-fache Fläche zugeschlagen. `HeightPyramid`
> rechnet die Hülle stattdessen einmal beim Laden direkt über das Höhenfeld —
> O(n) über die Heightmap, gemessen 34 ms — und legt sie exakt auf die
> Knotengrenzen.
>
> Nebenwirkung, die P2 als offenen Punkt notiert hatte: die **Uferkante** folgte
> mit 4 m pro Terrain-Quad der Triangulierung und zerfiel auf flachem Strand in
> Stufen. Ein Blattknoten hat jetzt 1,5 m pro Vertex — genau den Texelabstand
> der Heightmap. Damit ist der Punkt erledigt, wie dort vorhergesagt.

**4.2 — Streu-System** → `src/world/scatter/ScatterSystem.ts` ✅
- Deterministisch pro Chunk (Seed = Chunk-Koordinate) → keine Speicherung nötig,
  identisch bei jedem Laden
- Verteilung: jittered Grid (Poisson-Disk-Näherung, deutlich schneller als echtes Poisson)
- Filter pro Instanz, in dieser Reihenfolge (billigste Ablehnung zuerst):
  1. Biom-Gewicht aus `zones.png`
  2. Steilheit (Bäume bis 30°, Gras bis 45°)
  3. Höhe (Baumgrenze bei 350 m, kein Gras unter dem Meeresspiegel)
  4. `distanceToNearestRoad()` aus P3
- Ausgabe: ~~`InstancedMesh` je (Chunk × Asset × LOD-Stufe)~~ → je (Asset × LOD),
  siehe 4.3

> **Die Streuzelle ist 64 m, nicht `WORLD.chunkSize`.** Das Sichtfeld der
> Vegetation endet bei rund 520 m; mit 256-m-Kacheln wären das 5 × 5 Chunks — zu
> grob, um mit dem Frustum sinnvoll zu cullen. Mit 64 m sind es rund 140 im
> Umkreis, von denen das Frustum etwa ein Drittel behält.

> **Die Zonenmaske wird ein zweites Mal dekodiert, statt nachgebildet.**
> `zones.png` liegt seit P1 als Textur auf der GPU, die Streuung läuft aber auf
> der CPU. Sie kostet dort gemessen 21 ms und 4 MB. Die Alternative wäre, das
> Biom aus Höhe und Neigung *nachzurechnen* — also dieselbe Regel ein zweites Mal
> aufzuschreiben, mit der sicheren Aussicht, dass beide Fassungen auseinander­
> laufen. Genau diese Sorte Doppelimplementierung hat in P3 die eingeschnittene
> Rinne neben das Straßen-Mesh gelegt.

> **Aus dem Biom-Gewicht wird eine Wahrscheinlichkeit, kein Ja/Nein.** Das ist
> der Unterschied zwischen einem Waldrand und einer ausgestanzten Kante: an der
> Grenze zwischen Gras und Fels stehen immer weniger Bäume, statt dass die letzte
> Reihe wie mit dem Lineal gezogen endet.

> **Gras wächst auch in der Reisfeldzone.** Reis *ist* ein Gras, und die
> Reisfeldzone ist die größte zusammenhängende Fläche der Karte (SPEC §2.1). Sie
> leer zu lassen, bis P5 dort Parzellen baut, hieße: das größte Stück Karte
> bleibt kahl.

**4.3 — Instanzierung & LOD** → `src/world/scatter/InstancedLOD.ts` ✅
- 3 Stufen: Volles Mesh → reduziertes Mesh → Imposter. Grenzen **je Art**, nicht
  global: 80/180/520 m für Bäume, 30/70/160 m für Gras
- Umsortierung der Instanzmatrizen in Zeitscheiben über mehrere Frames verteilt
- Per-Instanz: Skalierung und Y-Rotation in der Matrix, Farbvariation
  ~~(`instanceColor`)~~ **gerechnet aus einem Hash der Instanzposition**

> **Ein `InstancedMesh` je Art und Stufe, nicht je Chunk.** Der Plan schrieb
> „je (Chunk × Asset × LOD)", und das ist mit dem Draw-Call-Budget derselben
> Phase nicht vereinbar: rund 50 sichtbare Chunks × 4 Arten × 3 Stufen sind
> **600 Draw-Calls** allein für Vegetation, gegen ein Teilbudget von 100.
> Zusammengefasst sind es **zwölf** — gemessen. Der Preis ist genau die
> Umsortierung, die derselbe Abschnitt ohnehin verlangt.

> **`instanceColor` wäre ein zweites Attribut**, das bei jedem Umsortieren
> mitkopiert werden müsste. Bei 50 000 Instanzen und einem Umbau alle vier Frames
> ist das messbar; der Positions-Hash kostet drei Rechenschritte, ist ortsfest
> und braucht keinen Speicher. Er liegt in `vegetation_tint.glsl`, weil **zwei**
> Materialien ihn brauchen — Mesh und Imposter. Getrennt gerechnet wäre der
> Stufenwechsel ein Farbsprung, und zwar ein leiser, der als „Imposter sehen
> anders aus" durchgeht.

> **Zeitscheibe und Chunk-Erzeugung sind getrennt gedeckelt.** Einsortieren heißt
> eine Matrix schreiben, Erzeugen heißt rund 6700 Kandidaten filtern. Ohne die
> zweite Bremse kostet der erste Frame in einem neuen Gebiet 48 Streuungen auf
> einmal — ein Ruckler an genau der Stelle, an der man gerade beschleunigt.
>
> **Der zweite Deckel war zuerst eine Stückzahl (4 Chunks), und das war zu grob.**
> Gemessen über 25 Frames: Median **0,70 ms** — Spitze aber **11,7 ms** gegen
> 16,6 ms Frame-Budget. Die Stückzahl zu senken wäre die naheliegende und die
> schlechtere Antwort: sie deckelt nur, solange die Kosten je Chunk konstant
> bleiben, und die hängen an der Zellgröße der dichtesten Art. Gebaut ist ein
> **Zeitbudget** von 2 ms plus garantiert einem Chunk — sonst bliebe die Streuung
> bei einem langsamen Frame ganz stehen.
>
> **Das Budget allein hat nicht gereicht, weil ein einzelner Chunk teurer war als
> das ganze Budget.** Die Füllphase kostete danach **12,7 ms im Median**, und
> weder das Zeitbudget noch eine kleinere Zeitscheibe (48 → 16 Chunks) haben
> daran etwas geändert. Die Ursache lag woanders und war eine
> Verschwendung dritter Art: **ein Chunk auf 400 m Entfernung streute 6400
> Gras-Kandidaten, obwohl Gras nur bis 160 m gezeichnet wird.** Über den ganzen
> Vegetations-Umkreis waren das 1,33 Mio. Gras-Kandidaten statt 125 000 — 98 %
> der Arbeit für Instanzen, die nie in einen Puffer wandern.
>
> Ein Chunk streut deshalb nur die Arten, die auf seiner Entfernung überhaupt
> gezeichnet werden; die Maske steht im Chunk, und weil jede Art einen eigenen
> Zufallsstrom hat, ist ein Nachstreuen bei Annäherung bitgleich. Gemessen, CPU
> des Streu-Systems je Frame:
>
> | Zustand | Median | Mittel | Spitze |
> |---|---|---|---|
> | Füllphase, ohne Artenmaske | 12,70 ms | 12,90 ms | 35,2 ms |
> | Füllphase, mit Artenmaske | **0,40 ms** | 2,57 ms | 26,2 ms |
> | eingeschwungen, mit Artenmaske | **0,10 ms** | 0,29 ms | 3,5 ms |
>
> Die 26,2 ms in der Füllphase sind ein einzelner Frame, der einen Nahchunk mit
> Gräsern erzeugt — auf einer Maschine, deren Frames im Software-Rasterizer
> ohnehin über 600 ms brauchen. Auf Hardware mit GPU wäre das anders zu bewerten;
> hier ist es nicht trennbar, und deshalb steht der Median vorn.

**4.4 — Imposter** → `src/world/scatter/ImposterAtlas.ts`, `src/world/materials/ImposterMaterial.ts` ✅
- Rendert jedes Vegetations-Asset aus 8×8 Richtungen in einen Atlas
  (oktaedrische Projektion, **Halbkugel**)
- Ausgabe: Albedo+Alpha-Atlas und Normalen-Atlas, ~~nach
  `assets/generated/imposters/`~~ → als Render-Target zur Laufzeit
- Shader mischt zwischen den zwei nächsten Ansichten → kein Springen beim Umkreisen
- ~~Headless über `node` + `gl`-Paket~~ → **Bake in der laufenden App**

> **Gebacken wird in der Anwendung, nicht in `tools/`.** Das ist der im Plan
> vorgesehene Rückfall („Offene Entscheidungen", Punkt 4), und er ist hier der
> bessere Weg — aus drei Gründen, von denen der dritte den Ausschlag gab:
>
>  1. `gl` ist ein natives Modul und braucht eine Build-Kette, die auf dieser
>     Maschine nicht steht.
>  2. Der Atlas wäre eine Datei mehr im Startdownload, der mit 51,95 MB bereits
>     das 15-MB-Budget aus SPEC §4 um mehr als das Dreifache reißt. Gerechnet
>     kostet er **null Bytes**.
>  3. Die Modelle entstehen selbst prozedural. Ein offline gebackener Atlas wäre
>     die Ableitung einer Quelle, die es als Datei nicht gibt — er könnte
>     veralten, ohne dass es jemand merkt. Ab P5 kommen echte glTF-Modelle, und
>     dann ändert sich diese Rechnung; die Asset-Pipeline aus 5.1 ist der richtige
>     Ort dafür.

> **Halbkugel statt Kugel.** Eine volle Oktaeder-Abbildung verteilt 64 Zellen auf
> 4π; die untere Hälfte zeigt Bäume von unten und wird nie gebraucht. Auf die
> Halbkugel verteilt sind es doppelt so viele Zellen pro Raumwinkel, also der
> halbe Winkelfehler zum Nulltarif — rund 22° zwischen Nachbaransichten.

> **Das Quad ist zylindrisch ausgerichtet, nicht kameraorientiert.** Seine
> Y-Achse bleibt die Weltachse nach oben. Ein voll kameraorientiertes Quad ist
> beim Blick von oben falsch: der Baum kippt mit, legt sich in den Hang und hebt
> seinen Fuß in die Luft. Die Neigung des Blicks steckt in der Wahl der
> Atlas-Zelle.

> **Die Normale wird im Objektraum gebacken**, nicht im Sichtraum der
> Aufnahmekamera — der wäre je Zelle ein anderes Bezugssystem. Zur Laufzeit
> genügt die Y-Drehung der Instanz. Ohne gebackene Normale wäre jeder Imposter
> eine flache Scheibe, und ein Wald aus flachen Scheiben ist bei 2,2°
> Sonnenstand entweder ganz hell oder ganz dunkel.

**4.5 — Wind** → `src/world/shaders/vegetation_wind.vert.glsl` ✅
- Zwei Frequenzen: großes Wiegen des Stamms + hochfrequentes Blattzittern
- Amplitude maskiert ~~über Vertex-Farbe~~ **über ein eigenes Attribut `aWind`**
- Ein globaler Wind-Uniform für alle Vegetation, damit die Bewegung kohärent wirkt

> **Nicht die Vertex-Farbe.** `MeshStandardMaterial` multipliziert mit
> `vertexColors` das Albedo — der Wurzelbereich wäre dann schwarz. Die Maske hat
> mit Farbe nichts zu tun und bekommt deshalb ein eigenes Attribut. Sie ist
> **quadratisch** in der Höhe, nicht linear: ein Stamm biegt sich wie ein
> eingespannter Balken, und linear sieht aus, als kippe der ganze Baum.

> **Der Ausschlag hängt an der Art, die Zeit am globalen Block.** Ein
> Grasbüschel und eine Fichte im gleichen Maß zu bewegen sieht bei einem von
> beiden falsch aus — 0,16 m am Halm sind viel, 0,16 m an einer 8-m-Fichte sind
> nichts. Die Zeitbasis dagegen muss geteilt sein, sonst wiegen sich die Bäume
> desselben Hangs gegeneinander.

**4.6 — Budget-Durchsetzung** → `src/debug/BudgetGuard.ts` ✅
- Liest jeden Frame `renderer.info`, vergleicht mit `quality.config.ts`
- Bei Überschreitung: **auffällige Warnung im Overlay** plus einmaliger
  Konsolen-Eintrag mit dem Verursacher (welches System hat die meisten Draw-Calls)
- Bewusst laut. Budget-Überschreitungen fallen sonst erst Wochen später auf,
  wenn die Ursache nicht mehr zuzuordnen ist

> **Eine Metrik muss 30 Frames über dem Limit liegen, bevor der Guard
> anschlägt.** Nicht null: der erste Frame nach einem Materialwechsel, einem
> Resize oder dem Imposter-Bake sieht anders aus als der Dauerzustand, und eine
> Warnung, die bei jedem Reload aufblitzt, liest irgendwann keiner mehr. Sinkt
> die Metrik zurück ins Budget, wird der Konsolen-Eintrag wieder freigegeben —
> sonst bliebe eine reparierte Überschreitung für den Rest der Sitzung stumm.

> **Die Aufschlüsselung ist als Schätzung gekennzeichnet.** Sie zählt, was
> sichtbar ist und Geometrie hat, ohne Frustum-Culling und ohne den zweiten
> Durchlauf für eine Schattenkarte; ihre Summe weicht deshalb von
> `renderer.info.render.calls` ab. Für „wer ist der größte Posten" reicht das,
> für die absolute Zahl gilt weiterhin das Overlay.

### Akzeptanzkriterien
- [x] **Kein sichtbares Popping bei Kamerafahrt in beliebiger Geschwindigkeit** —
      bauartbedingt, und die Bauart ist geprüft: die Debug-Ansicht „Morph-Faktor"
      zeigt den Übergang als stetigen Verlauf, und die Bedingung dafür
      (`morphStart ≥ 0,5 + √2/f`) ist bei 4.1 hergeleitet. Ein Sprung wäre nur
      möglich, wenn ein Knoten die Stufe wechselt, *bevor* er vollständig
      zusammengezogen ist — genau das schließt die Ungleichung aus
- [x] **Keine Risse zwischen LOD-Stufen, auch nicht bei flachem Blickwinkel** —
      **1 Loch-Pixel** über sieben Blickpunkte à 1162 Spalten, alle mit nach
      unten gekippter Kamera ohne Himmel im Bild. Das Verfahren steht bei 4.1;
      zum Vergleich lieferte der erste Entwurf mit f = 3 an denselben Punkten
      **207**
- [x] **≥ 50 000 sichtbare Vegetations-Instanzen bei < 100 Draw-Calls** —
      **50 203** Instanzen bei **28** Draw-Calls für Vegetation (vier Arten à
      drei Formvarianten mal zwei Mesh-Stufen, plus ein geteilter Imposter je
      Art). An einem zweiten Blickpunkt in der Wiesenzone **62 429**
- [x] **Gesamt-Draw-Calls < 800, Dreiecke < 3 Mio.** — **64 / 800** und
      **567 815 / 3 000 000** am dichtesten Blickpunkt der Karte. Dazu
      **287 MB / 512 MB** Texturspeicher (P3: 255 MB; +32 MB durch die acht
      Imposter-Atlanten, genau wie gerechnet)

      > Vor den Formvarianten waren es 48 Draw-Calls und 537 587 Dreiecke. Die
      > Varianten kosten 16 Draw-Calls und 5,6 % Dreiecke; der Texturspeicher
      > bleibt unverändert, weil die Imposter sich einen Atlas je Art teilen
- [x] **Keine Vegetation auf Straßen oder im Wasser** — über alle 50 211
      Instanzen: **0** mit weniger als 7 m Achsabstand, kleinster gemessener
      Abstand exakt **7,00 m** (der Grenzwert der Gräser); tiefste Instanz
      **22,84 m** über dem Meeresspiegel
- [x] **Streuung ist reproduzierbar: zweimal laden = identische Platzierung** —
      Chunk-Cache vollständig verworfen und neu gestreut; die ordnungs­unabhängige
      Summe über Position, Maßstab und Drehung aller 50 211 Instanzen ist
      **bitgleich** (n, s₁, s₂, s₃ in allen vier Stellen identisch)
- [x] **Imposter sind bei 150 m nicht vom Mesh zu unterscheiden** — geprüft mit
      **identischen Instanzmatrizen**, nicht mit zwei verschiedenen Wäldern: am
      einzelnen Baum aus **24 m** — siebenmal näher als der Imposter je zum
      Einsatz kommt — bleiben **6,5 % Breite** und **9,7 % Höhe** Unterschied in
      der Hüllbox

      > Die Freistellschwelle stellte sich dabei als fast wirkungslos heraus
      > (0,3 → 0,8 ändert die Deckung um 4 %), womit die Begründung fiel, die im
      > Code stand. Der Unterschied kommt daher, dass ein 5,4-m-Baum auf 180 m
      > nur 19 Pixel hoch ist: dort besteht das **Mesh** aus Dreiecken unterhalb
      > der Pixelgröße und fällt in Lücken, während der Imposter eine gefilterte
      > Textur ist. An dieser Stelle ist der Imposter nicht schlechter, sondern
      > besser abgetastet

Zusätzlich geprüft:
- [x] **Wind bewegt Geometrie** — bei Stärke 0 sind zwei aufeinanderfolgende
      Frames **pixelgleich** (0 von 256 000), bei Stärke 2,5 unterscheiden sich
      **51 189** Pixel

      > **Diese Zeile hat einen Fehler verdeckt und ist der Grund, warum sie
      > jetzt zweigeteilt ist.** Gemessen wurde an einem Nahblickpunkt, ohne die
      > LOD-Stufen zu trennen — und der Wind hing allein im Mesh-Material. Drei
      > Viertel der sichtbaren Instanzen (37 459 von 50 211) waren Imposter und
      > standen still. Nachgeholt mit ausgeblendeten Mesh-Stufen: bei Stärke 0
      > zwei pixelgleiche Frames, bei 2,5 **56 205 von 400 000** Pixeln
      > Unterschied. Wer eine Eigenschaft für „alle" prüft, muss über alle
      > messen, nicht über die, die gerade im Bild sind
- [x] **BudgetGuard schlägt an** — mit 900 künstlichen Draw-Calls erscheint bei
      948 / 800 nach 30 Frames „BUDGET ÜBERSCHRITTEN — Draw-Calls 948 / 800"
      samt Verursachertabelle; nach dem Entfernen der Last fällt der Zähler auf
      48 und das Banner verschwindet
- [x] `tsc --noEmit` sauber, Produktionsbuild grün
- [x] **Speicherfreigabe** (Kriterium aus P0) — `ScatterSystem.dispose()` gibt
      genau frei, was es angelegt hat: 9 Geometrien (4 Arten × 2 Stufen plus
      Imposter-Quad), 8 Texturen (4 Atlanten × 2) und 2 Programme. Nach
      `engine.dispose()` bleiben insgesamt 1 Geometrie, 1 Textur und 5 Programme
      stehen — nachweislich **nicht** aus P4, weil die Einzelfreigabe oben
      vollständig aufgeht
- [x] **CPU-Kosten der Streuung** — eingeschwungen **0,10 ms** je Frame im
      Median (Mittel 0,29 · 95. Perzentil 2,3 · Spitze 3,5), in der Füllphase
      0,40 ms im Median. Der Weg dahin ging über drei Anläufe und ist bei 4.3
      samt Tabelle festgehalten; der wirksame Schritt war, dass ein Chunk nur die
      Arten streut, die auf seiner Entfernung gezeichnet werden

### Gemessener Stand am Ende von P4

| Größe | Gemessen | Budget |
|---|---|---|
| Draw-Calls | **64** (davon 28 Vegetation, 1 Terrain) | 800 |
| Dreiecke | **567 815** | 3 000 000 |
| Texturspeicher | **287 MB** | 512 MB |
| Programme | 22 | — |
| Quadtree-Knoten | 73…137 je Blick | — |
| Vegetations-Instanzen | **50 203** (Spitze 62 429) | ≥ 50 000 gefordert |
| CPU Streuung je Frame | **0,10 ms** (Median, eingeschwungen) | 16,6 ms Frame |
| GPU je Frame | **nicht messbar** — kein Timer auf dem Software-Rasterizer | 16,6 ms |
| Konsole | keine Fehler, keine Warnungen außer der Timer-Notiz | — |

Zum Vergleich der Stand am Ende von P3: 36 Draw-Calls, 1 212 971 Dreiecke,
255 MB. Das Terrain kostet jetzt **ein Fünftel** der Dreiecke bei zweieinhalbfach
feinerer Abtastung im Nahbereich, und der Rest ist Vegetation.

### Nach der Abnahme: Formvarianz

Die Abnahme prüft Zahlen, und die Zahlen stimmten — aber jede Kiefer war
dieselbe Kiefer, variiert nur über Maßstab, Y-Drehung und einen Farb-Hash. In
einem Bestand ist das sofort zu sehen. Drei Hebel dagegen, nach Wirkung je
Draw-Call geordnet:

| Hebel | Kosten | Gemessene Spanne |
|---|---|---|
| Seitenverhältnis je Instanz | **null** — steht in der Instanzmatrix | 0,46 … 1,74 |
| Neigung je Instanz (Scherung der Y-Spalte) | **null** — ebenso | bis 15° |
| Drei Formvarianten je Art | 16 Draw-Calls, +5,6 % Dreiecke | — |

Die ersten beiden sind gratis, weil die Matrix ohnehin geschrieben wird; erst
der dritte kostet etwas. Die Reihenfolge ist deshalb keine Geschmacksfrage.

> **Alle Varianten einer Art sind auf dieselbe Höhe normiert.** Die Variante darf
> die *Form* ändern, nicht die Größe — die kommt aus der Instanzmatrix. Ohne die
> Normierung spränge ein hoher Baum beim Wechsel auf den Imposter, weil sich alle
> Varianten einen Atlas teilen.

> **Die Imposter teilen sich einen Atlas je Art.** Sie übernehmen ab 180 m, und
> dort ist ein Baum rund 19 Pixel hoch — die Form ist nicht mehr auflösbar. Drei
> Atlanten wären dreimal derselbe Fleck bei dreifachem Texturspeicher, und der
> bleibt deshalb bei 287 MB.

> **Der Imposter-Shader liest waagerechte und senkrechte Skalierung getrennt.**
> Die Y-Spalte als einzigen Maßstab zu nehmen war richtig, solange die Matrix
> uniform skaliert war; mit gestreutem Seitenverhältnis machte es breite Büsche
> zu hohen.

### Risiken
- **CDLOD-Morphing ist fehleranfällig** — falsche Morph-Distanzen erzeugen
  sichtbares Wabern. Zuerst mit Wireframe und eingefärbten LOD-Stufen entwickeln,
  nicht mit fertigem Material.
  → **Eingetreten, und der Ratschlag war richtig.** Die Ansichten „LOD-Stufen"
  und „Morph-Faktor" haben den Fehler gezeigt, bevor er als Riss auffiel: mit
  f = 3 war das Morph-Bild fast durchgehend weiß, also überall vollständig
  gemorpht. Das ist für sich nicht falsch — ein voll gemorphter Knoten *ist* die
  nächstgröbere Stufe —, aber es heißt, dass die Nähte nicht dort liegen, wo die
  Rechnung sie annimmt. Der Riss war die Folge, nicht die Ursache
- ~~**Imposter-Baking headless** kann an fehlendem GPU-Kontext scheitern.~~
  → **Eingetreten wie vorhergesagt**, und der Rückfall ist gebaut. Siehe 4.4

### Nach der Abnahme: Streulicht durch Blätter

Nicht im Plan, aber aus der Beleuchtung dieser Karte zwingend. Bei 2,2°
Sonnenstand steht die Sonne fast waagerecht hinter allem, was man von der Ebene
aus ansieht; ohne Streulicht ist jeder Baum im Gegenlicht eine schwarze
Silhouette. Für ein undurchsichtiges Material ist das richtig, für Laub falsch.

**Der erste Entwurf war messbar wirkungslos.** Er setzte auf eine schmale
Blickrichtungs-Keule (`pow(dot, 3)`). Gemessen über 125 336 maskierte
Vegetationspixel — die Maske aus der Differenz gegen ein Bild mit ausgeblendeter
Vegetation, weil der Mittelwert über das ganze Bild im Himmel ertrinkt:

| Fassung | Mittel über Vegetationspixel | größte Einzelaufhellung |
|---|---|---|
| Keule `pow(dot,3)` × Umschlingung | **+0,03 %** | 63,7 |
| Umschlingung² × (0,3 + 0,7·dot²) | **+0,66 %** | 112,1 |

Die Keule trifft nur ein paar Dutzend Pixel um die Sonnenscheibe. Tragend ist die
**Umschlingung**: die abgewandte Seite bekommt grundsätzlich etwas ab, die
Blickrichtung verstärkt es nur.

> **Das Vorzeichen der Blickrichtung ist gemessen, nicht hergeleitet.** Aus den
> Konventionen von `vViewPosition` (zeigt zum Betrachter) und
> `directionalLights[].direction` (zeigt zur Lichtquelle) folgt das Gegenteil
> dessen, was die Messung zeigt. Welche der beiden anders liegt als angenommen,
> ist für das Ergebnis gleichgültig — aber die Herleitung stehenzulassen, ohne
> sie zu prüfen, hätte den Effekt lautlos abgeschaltet.

> **Eine Messung, die im Himmel ertrinkt, ist keine Messung.** Die ersten fünf
> Anläufe mittelten die Helligkeit über das ganze Bild und meldeten „keine
> Wirkung" — bei 31 % Vegetationsanteil und einem Effekt auf einem Bruchteil
> davon war das nicht auflösbar. Erst die Maske hat die Frage beantwortet.

Der Anteil hängt am Look-Zustand (P2 / 2.6): das System trägt Windstärke und
Streulicht selbst in `look:collect` ein und liest sie aus `look:apply` zurück.
Streudichte und LOD-Grenzen bleiben bewusst draußen — sie sind
Leistungsparameter der Qualitätsstufe.

### Nach der Abnahme: Bodenverdeckung

Der letzte offene Punkt aus P4, und der Grund, warum Bäume trotz Formvarianz und
Wind noch aufgeklebt wirkten. **Die Diagnose in der Tabelle unten war falsch
formuliert** und steht deshalb durchgestrichen dort: sie nannte einen
„Kontaktschatten". Ein Schatten ist es nicht — bei 2,23° Sonnenstand wirft ein
9 m hoher Baum einen rund 230 m langen Schatten quer über den Hang, und ein
runder Fleck unter dem Stamm wäre als Sonnenschatten schlicht falsch. Was fehlt,
ist **Umgebungsverdeckung**: die Krone nimmt dem Boden unter sich den Himmel
weg. Das ist sonnenunabhängig und damit eine ganz andere, billigere Aufgabe.

Sie hat zwei Hälften, und die eine allein reicht nicht:

| Anteil | wo | Kosten | geänderte Pixel | mittlere Verdunkelung dort |
|---|---|---|---|---|
| Fleck auf dem Boden | `GroundAoMaterial` | **1 Draw-Call**, 32 Dreiecke je Fleck | 56 824 (6,2 %) | **24,6 %** |
| Verdeckung am Pflanzenfuß | `vegetation_base_ao.glsl` | keine, drei Rechenschritte im Fragment | 95 741 (10,4 %) | **11,0 %** |
| beides | | | 147 273 (16,0 %) | **14,8 %** |

Gemessen an einem Waldhang, 1280 × 720, alle vier Zustände aus **derselben**
eingefrorenen Streuung — ein Kontrollpaar aus zwei identischen Aufnahmen ergab
0 abweichende Pixel. Ohne dieses Einfrieren war die Messung wertlos: der
laufende Durchlauf sortiert zwischen zwei Aufnahmen Instanzen um, und der erste
Vergleich meldete daraufhin 49 923 „geänderte" Pixel bei **−0,25 %** mittlerer
Verdunkelung — also Rauschen in der Größenordnung des Effekts.

> **Warum zwei Hälften.** Der Fleck liegt *hinter* der Pflanze und fällt am
> Stamm durch den Tiefentest; er kann die Pflanze nicht erreichen. Umgekehrt
> steht im Vordergrund Gras vor dem Boden, das der Fleck ebenfalls nicht
> verdunkelt. Mit dem Fleck allein stünde der Baum in einer Schattenpfütze,
> statt darin zu verschwinden. Die beiden Pixelmengen überschneiden sich
> gemessen nur zu 5 292 von 152 565 — sie treffen fast disjunkte Bildbereiche.

> **Der Fleck folgt dem Gelände, statt darauf zu liegen.** Seine 5 × 5
> Stützstellen holen ihre Höhe aus derselben Heightmap und mit demselben
> Shader-Block wie das Terrain (`terrain_height.glsl`). Ein ebenes Quad mit
> `polygonOffset` wäre kürzer und stünde am Hang schräg im Boden.

> **Der Stufenwechsel bei 180 m ist dadurch nicht schlechter geworden.** Geprüft
> nach der Lehre aus dem Wind — nicht am Nahblickpunkt, sondern über beide
> Stufen: derselbe Kiefernbestand einmal als Mesh und einmal als Imposter
> gezeichnet (`lodDistances[1]` zur Laufzeit umgestellt), verglichen über die
> 476 516 Pixel, die in **beiden** Aufnahmen Kiefer sind.
>
> | | Mesh | Imposter | Abweichung |
> |---|---|---|---|
> | ohne Fußverdeckung | 42,33 | 41,53 | **−1,89 %** |
> | mit Fußverdeckung | 41,70 | 41,14 | **−1,35 %** |
>
> Der Sprung war schon vorher da (er kommt aus der Filterung des Atlas) und ist
> mit der Verdeckung eher kleiner. Beide Pfade rufen dieselbe Funktion mit
> demselben Uniform auf; die Maske ist im Imposter deshalb ebenfalls
> **quadriert**, damit sie deckungsgleich mit `aWind` im Mesh ist.

Kosten am dichtesten gemessenen Blickpunkt: **+1 Draw-Call** (64 → 65) und
**+34 656 Dreiecke** (1083 Flecken × 32) gegen ein Budget von 3 000 000. Kein
zusätzlicher Texturspeicher. Die meisten Flecken in einem Durchlauf waren
**1168 von 4096** Pufferplätzen, bei einer Kamera in 33 m Höhe über dichtem
Bestand mit Blick nach unten.

> **Warum kein gebackenes Verdeckungsbild.** Naheliegend, weil die Streuung
> deterministisch ist — aber die Streudichte hängt an der Qualitätsstufe
> (`vegetationDensity`, 0,25 bis 1,0). Eine gebackene Karte wäre auf drei von
> vier Stufen falsch, und die Kopplung liefe vom Terrain-Baker in
> TypeScript-Code des Renderers hinein.

### Offene Punkte aus P4

| Punkt | Zahl | Wohin |
|---|---|---|
| GPU-Zeit nicht messbar | `EXT_disjoint_timer_query_webgl2` fehlt auf dem Software-Rasterizer | P7, Profiling auf Hardware mit Timer |
| Vegetation ist prozedural | 4 Arten à 3 Formvarianten, ~100 Dreiecke je Modell | P5.1, Asset-Pipeline mit echten Modellen |
| ~~Vegetation wirft und empfängt keinen Schatten~~ | `castShadow` und `receiveShadow` bleiben aus | **Erledigt, aber anders als angekündigt** — hier stand „kein Kontaktschatten am Stammfuß". Das war die falsche Kategorie: bei 2,23° Sonnenstand ist der Schatten eines 9-m-Baums 230 m lang, ein Fleck unter dem Stamm wäre als Sonnenschatten falsch. Gefehlt hat **Umgebungsverdeckung**, und die braucht die Sonne gar nicht. Siehe „Nach der Abnahme: Bodenverdeckung" |
| Imposter mischen 2 von 4 Nachbarn | Winkelfehler bis 11° | offen; bilinear über alle vier wäre der doppelte Aufwand für die zweite Hälfte eines Fehlers, den man bei 180 m nicht sieht |
| Imposter-Atlas ohne Mipmaps | Silhouette 6,5 % breiter als das Mesh | offen; Mipmaps über einen Atlas bluten zellenübergreifend, das braucht eine eigene Lösung |
| Kein Echtzeitschatten | P2 hatte ihn „für P4, sobald es bewegliche Werfer gibt" angekündigt | verschoben: es gibt noch keine beweglichen Werfer. Vegetation wirft keinen — bei 50 000 Instanzen wäre das ein zweiter Geometriedurchlauf im dreistelligen Draw-Call-Bereich |
| ~~Streuung nicht im Worker~~ | eingeschwungen 0,10 ms je Frame, Füllphase 0,40 ms — Spitze aber 26,2 ms, wenn ein Nahchunk mit Gräsern erzeugt wird | **Erledigt in P7.2.** Die Spitze auf dem Hauptthread fällt auf 0,7–4,2 ms, einzelne Chunks kosten im Worker weiterhin bis 25,8 ms — nur eben dort. Der Rest ist nicht die Streuung, sondern das Einsortieren in die LOD-Puffer |

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

- [x] **Jede Zone ist im Vorbeifliegen ohne Karte identifizierbar.** Vier
      Blickpunkte, vier Bilder in `.cache/shots/p5_zone_*.png`:

      | Zone | woran man sie erkennt |
      |---|---|
      | Wald/Tempel | Torii-Reihe auf dem freigeräumten Zugangsweg, Tempelhalle auf dem Rücken, Steinlaternen paarweise |
      | Reisfelder | Voronoi-Parzellen mit Dämmen bis zum Massiv, Strommastenreihe, Gehöfte |
      | Küste | Wellenbrecher aus 372 Tetrapoden über 300 m, Steg, Boote, Leuchtturm |
      | Berg/Tōge | Hokora auf dem Pass, 158 Streckenmarkierungen in den Kehren, Felsformationen |

- [x] **Alle Assets sind maßstabsgetreu.** Gemessen aus den Hüllboxen der
      erzeugten Geometrie: Torii **5,19 m** hoch (Abnahme nennt ≈ 5 m), Tür am
      Bauernhaus **2,00 m** (nennt ≈ 2 m), Strommast 9,00 m, Leuchtturm
      13,56 m, Steinlaterne 2,24 m. Die Fremdmodelle behalten ihren
      photogrammetrisch vermessenen Maßstab; nur `boulder_01` wird skaliert,
      und warum, steht in seiner Rezeptur.

- [x] **Kein Modell wird aus `assets/source/` geladen.** Der Renderer kennt den
      Ordner nicht: `propAssets.ts` bündelt ausschließlich
      `assets/generated/models/*.glb` über `import.meta.glob`. `assets/source/`
      steht in `.gitignore` und existiert auf einem frischen Auschecken gar
      nicht — das Werkzeug nennt dann den Befehl, mit dem man es füllt.

- [x] **Draw-Call-Budget weiterhin eingehalten.** Gemessen an denselben vier
      Blickpunkten, 1280 × 720:

      | Blickpunkt | Draw-Calls | Dreiecke |
      |---|---|---|
      | Tempel | 67 | 442 059 |
      | Reisfeld | 62 | 372 171 |
      | Bergpass | 60 | 226 359 |
      | Küste | 47 | 287 293 |
      | Budget (SPEC §4) | **800** | **3 000 000** |

      Texturspeicher **302,7 MB** von 512 MB — plus 15,7 MB gegen P4, und die
      stecken vollständig in den sechs 1k-Texturen des Stegs, dem einzigen
      Asset, das seine Textur behalten darf.

- [x] **`CREDITS.md` listet jedes verwendete Fremd-Asset.** Vier Modelle,
      alle CC0, alle von `tools/polyhaven.mjs` selbst eingetragen.

### Was P5 anders gemacht hat als geplant

> **Die Landmarks sind prozedural, nicht eingekauft.** Der Katalog von Poly
> Haven wurde vollständig durchsucht (400 Assets): **null Treffer** für Torii,
> Schrein, Tempel oder Steinlaterne — die vier „Laternen" dort sind eine
> Sturmlaterne, eine Deckslaterne, ein Kronleuchter und eine indische Diya.
> Genau die fehlenden Stücke tragen aber die erste Abnahmezeile. Zwölf
> Landmarks entstehen deshalb in `landmarkMeshes.ts`, zusammen 2104 Dreiecke.
>
> Die Pipeline aus 5.1 ist dadurch **nicht** überflüssig geworden: sie
> verarbeitet die Felsen und den Steg, wo echte Geometrie besser ist als
> gerechnete, und dort zeigt sie ihren Wert in einer Zahl —
> `coastal_cliff_04` kommt mit 1 537 926 Dreiecken aus dem Netz und verlässt
> die Kette mit 2 499 in 14 kB.

> **KTX2 fehlt.** 5.1 nennt es unter Schritt 3. Der Basis-Encoder liegt nicht
> als Bibliothek vor, sondern als externes Programm (`toktx`), das hier nicht
> installiert ist. Texturen werden auf 1024 begrenzt und als JPEG geschrieben.
> Der Rest gehört zu P7.5 („alle Texturen KTX2"), wo er ohnehin steht — und
> betrifft genau ein Asset, weil alle anderen ihre Textur gegen eine
> Palettenfarbe tauschen.

> **Die Tempelhalle reißt die 500er-Schwelle aus 5.5 — um vier Dreiecke.** Sie
> bekommt trotzdem keine zweite Stufe: die Schwelle ist für Fremdmodelle
> gedacht, die fünfstellig anfangen, und ein zusätzlicher Draw-Call, um 300
> Dreiecke gegen ein Budget von 3 000 000 zu sparen, ist ein schlechtes
> Geschäft. Die Zahl stehenzulassen ist ehrlicher, als die Halle um vier
> Dreiecke zu beschneiden, damit die Regel formal stimmt.

> **Der Editor schreibt nicht selbst.** Wie der Spline-Editor aus P3
> exportiert er `props.json` als Download; die Datei wandert von Hand nach
> `assets/`. Ein Schreib-Endpunkt wäre bequemer und würde beim ersten
> Fehlgriff die einzige Quelle überschreiben.

### Was das Bild an P5 korrigiert hat

Vier Dinge sahen auf dem Papier richtig aus und im Bild nicht:

1. **Bäume wuchsen durch die Tempelhalle.** Die Streuung aus P4 kennt Straßen
   und Zonen, aber keine Gebäude. Neu ist `PropClearance`, ein Raster aus 152
   Freihaltekreisen, das `scatterChunk` als letzten Filter abfragt.
2. **Das Torii stand längs zum Weg** statt quer — im Bild ein roter Pfosten.
3. **Der Wellenbrecher war kein Bauwerk**, sondern 322 einzeln über 1600 m
   verstreute Tetrapoden. Jetzt 372 auf 300 m in drei versetzten Reihen.
4. **Das Walmdach der Tempelhalle war quadratisch** (gemessen 14,00 × 14,00 m
   über einem Bau von 13,2 × 10,6 m): die Stauchung wurde vor der Drehung
   angewandt und drehte sich mit.

Und zwei Regeln des Generators waren Annahmen statt Messungen. Beide lieferten
**null** Ergebnisse, bis nachgemessen wurde:

- „Streckenmarkierungen nur an der Talseite" — gemessen liegt das Gelände
  5,5 m neben der Passachse im Median **+0,09 m** über ihr, weil der Erdbau aus
  P3 beidseitig eine ebene Schulter anlegt. Eine Talseite gibt es dort nicht.
  Die Regel setzt jetzt auf die Krümmung.
- „Leuchtturm auf einer Klippe" — über alle 301 Stützpunkte der Uferlinie liegt
  die Höhe 12 m landeinwärts im Median bei **0,02 m** und im Maximum bei
  0,57 m. Diese Küste ist ein Flachstrand.

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

# P6 — Stadt & Reflexionen ✅

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
- [x] **Neon spiegelt sichtbar im nassen Asphalt.** Gemessen mit einer Maske:
      Spiegelung an gegen aus, gezählt werden Pixel mit einer Summendifferenz
      über 3.

      | Blickpunkt | Pixel | Anteil | Ø Differenz | Spitze |
      |---|---|---|---|---|
      | `stadt-neon` | 7779 | 0,84 % | **111,6** | 382 |
      | `stadt-strasse` | 170 467 | 18,5 % | 38,8 | 290 |

      > **Nach P8.1 und P8.2 nachgeprüft, nicht angenommen.** Beide Phasen
      > fassen die Qualitätsstufen an, und die P6-Zahlen liegen alle auf Ultra.
      > Nachgemessen mit demselben Verfahren:
      >
      > | Blickpunkt | Pixel | Anteil | Ø Differenz | Spitze |
      > |---|---|---|---|---|
      > | `stadt-neon` | 7671 | 0,83 % | 113,1 | 382 |
      > | `stadt-strasse` | 170 437 | 18,49 % | 38,8 | 293 |
      >
      > Der Rest­unterschied (1,4 % am Money-Shot) kommt aus dem Schalter: die
      > erste Messung nahm den Debug-Umschalter (`plane.y = 0`), die
      > Nachprüfung `uReflectStrength = 0`. Beides bedeutet „keine Spiegelung",
      > der Weg dorthin ist ein anderer.

      Das Kriterium ist damit erfüllt: 111,6 mittlere Differenz auf knapp einem
      Prozent des Bildes ist kein Rauschen, das ist der Neonschriftzug in der
      Pfütze. Und im Straßenzug, wo die Kamera zwischen den Pfützen steht, ist
      fast ein Fünftel des Bildes betroffen.

      > **Diese Zahlen sind neu gemessen, und die alten standen daneben.** Die
      > erste Abnahme nannte 8113 Pixel (0,88 %) bei Ø 120,5 sowie 336 578 Pixel
      > (36,5 %) bei Ø 42,5. Am Money-Shot ist der Unterschied klein — die
      > Pfützen liegen im unteren Bildteil, den der Viewport-Fehler aus P7
      > stehen ließ. Im Straßenzug halbiert sich der Anteil (36,5 % → 18,5 %),
      > und das passt genau zum Mechanismus: das damalige Bild zeigte nur die
      > unteren 70 % des Frames, also überproportional **Fahrbahn**. Ein
      > Flächenanteil, gemessen auf einem beschnittenen Bild, ist ein
      > Flächenanteil an etwas anderem.
      >
      > Die Zahl für `stadt-neon` stand davor schon einmal bei 9981 Pixeln und
      > wurde im Polish-Durchgang mit der Nässe nachgezogen. Dreimal dieselbe
      > Zeile, dreimal ein anderer Wert — jedes Mal, weil sich etwas geändert
      > hat, von dem sie abhängt. Genau dafür wird sie neu gemessen.
- [x] **Stadt bleibt in Budget.** 25 Blöcke + Bürgersteige + Bodenplatte = 27,
      dazu 1 Aufruf für alle 297 Neonschilder: **28 von 300.** Die 3373
      Straßendecals zählen nicht dazu — sie liegen auf dem ganzen Netz, nicht in
      der Stadt (ihr eines Instanz-Mesh steht im Gesamtbudget).

      Die Zahl steht seit dem Polish-Durchgang **im Overlay und im BudgetGuard**,
      nicht mehr in einer einmaligen Handzählung: `davon Stadt 28 / 300` neben
      `Draw-Calls 164 / 800`. Gezählt wird ohne Frustum-Culling, also für den
      Fall, dass der ganze Distrikt im Bild steht — ein Budget soll die Bauweise
      prüfen, nicht die Blickrichtung.

      Am ganzen Bild gemessen (Budget 800 / 3 000 000):

      | Blickpunkt | Draw-Calls | Dreiecke |
      |---|---|---|
      | stadt-neon | 97 | 605 487 |
      | stadt-strasse | 88 | 643 247 |
      | stadt | **158** | **701 111** |
      | stadt-luft | 110 | 465 439 |
      | stadt-fern | 156 | 557 943 |
      | Tempel / Pass / Küste | 41 / 39 / 45 | 427 035 / 184 967 / 328 501 |

      Texturspeicher **308 MB von 512** (P5: 302,7 MB; dazu kamen der
      Neon-Atlas mit 4 MB und der Decal-Atlas mit 1 MB). Der Spiegelpuffer
      (640 × 360 HalfFloat, 1,8 MB) läuft nicht über die Szene und steht nicht
      in dieser Zahl.

      > Die Dreieckszahlen sind gegenüber der ersten Abnahme um 68 gestiegen:
      > das sind die 34 Decals der vier Fußgängerüberwege aus dem
      > Polish-Durchgang. Die Draw-Calls sind unverändert — sie liegen im
      > selben instanzierten Mesh.
      >
      > **Vom Viewport-Fehler aus P7 sind diese Zahlen nicht betroffen**, und
      > das ist geprüft und nicht angenommen: Draw-Calls, Dreiecke und
      > Texturspeicher sind CPU-Zähler aus `renderer.info`. Der Viewport
      > entscheidet, **wohin** gezeichnet wird, nicht **ob**. Betroffen war
      > alles, was am fertigen Bild gemessen wurde — davon steht eine Messung
      > in dieser Phase, siehe „Ein Befund aus dem Polish-Durchgang".
- [x] **Reflexionsansatz ist entschieden und dokumentiert** — siehe unten und
      `src/render/PlanarReflection.ts`. **B + C**, entschieden durch Messung.
- [x] **Keine flimmernden Reflexionen bei Kamerabewegung.** Zweimal derselbe
      Frame: **133 geänderte Pixel (0,014 %)**, und die stammen vom
      Neon-Flackern, nicht von der Spiegelung — sie hat keinen zeitlichen
      Anteil. Bei 0,25 m Kamerafahrt ändert sich das Bild **innerhalb der
      Spiegelmaske** (7866 Pixel) im Mittel um **60,1**, im übrigen Bild um
      **42,6**; Spitze 359 gegen 489. Der Faktor **1,41** ist das, was ein
      Spiegelbild geometrisch tun **muss** — die virtuelle Quelle liegt hinter
      der Ebene, die Parallaxe ist doppelt.

      > Auch hier stehen neue Zahlen: die erste Abnahme nannte 90 Pixel, 45,3
      > gegen 25,3 und Faktor 1,8. Sie wurden am beschnittenen Bild abgelesen
      > (siehe Viewport-Fehler unten). Die **Aussage** ist dieselbe geblieben —
      > ein ruhiger Frame bleibt ruhig, und die Spiegelmaske bewegt sich
      > stärker als der Rest —, der Faktor fällt von 1,8 auf 1,41. Was sich
      > nicht ändern kann, ist die Richtung: unter 1 wäre die Spiegelung
      > geometrisch falsch.

      > **Nach P8.1 und P8.2 nachgeprüft:** Standbild **0 geänderte Pixel**,
      > Maske 7644 Pixel, Bewegung 61,0 gegen 42,6 — Faktor **1,43**. Der
      > Außenwert ist auf die Nachkommastelle derselbe, der Innenwert 1,5 %
      > höher (andere Maskendefinition, siehe oben).
      >
      > Das Standbild ist von 133 Pixeln auf **0** gefallen, und das ist keine
      > Verbesserung durch P8: die Nachprüfung hat 60 Frames vorgefüllt, bevor
      > sie gemessen hat. Die 133 stammen also mit einiger Wahrscheinlichkeit
      > aus der noch nachlaufenden Streuung und nicht vom Neon-Flackern, wie es
      > oben steht. **Nicht bewiesen** — dafür müsste man die Streuung
      > gezielt anhalten und erneut messen.
- [x] **Screenshot vorzeigbar** — `japanMap.view('stadt-neon')`, Bild in
      `.cache/shots/p6_nach_viewportfix_stadt_neon.png`: Geschäftsstraße mit
      hochkanten Kanban über der Fahrbahn, nasser Asphalt mit Pfützen, Neon
      darin, das Massiv am Ende der Straße.

      > Das alte Abnahmebild `p6_abnahme_moneyshot.png` ist **beschnitten** —
      > wie alle 64 P6-Bilder. Es bleibt liegen, weil es zur Geschichte des
      > Fehlers gehört; vorzeigbar ist das neue.

> **Nachtrag aus P7: alle Bildmessungen dieser Phase sind nachgezogen.** Ein
> Viewport-Fehler im Imposter-Bake ließ die Postprocessing-Kette in ein 1024er
> Quadrat blitten — der Canvas zeigte damit die unteren 70 % des Frames,
> waagerecht auf 80 % gestaucht. Betroffen war jede Zahl, die aus Pixeln kam;
> nicht betroffen war jede Zahl aus `renderer.info`. Beide Gruppen sind oben
> gekennzeichnet. Der Fehler selbst steht in `ImposterAtlas.bake`.

> **Die Kette ist reproduzierbar.** Zwei Läufe `npm run world` liefern
> bitgleiche `height.r16`, `zones.png`, `roads.json` und `paddy.png`.
> `npm run inspect` meldet für alle fünf Strecken 0 Selbstschnitte.
>
> Eine Zahl dort ist neu und **gewollt**: `stadt` und `zufahrt` liegen im Mittel
> 0,94 m bzw. 0,56 m über dem Gelände statt darin. Das ist die Einebnung aus
> Schritt 5d — der Distrikt liegt auf 29,00 m, die Fahrbahn auf 29,94 m, und
> dazwischen liegt die Bodenplatte der Stadt. Der Prüfer misst gegen das
> Höhenfeld und kennt die Platte nicht.

### Die Reflexions-Entscheidung (offene Entscheidung Nr. 1)

**Entschieden: B + C.** Planare Spiegelung an der Stadtebene, ergänzt durch die
HDRI-Umgebungskarte aus P2 — die *ist* eine Reflexions-Probe, nur eine einzige
und global; sie liefert Himmel, Horizont und Berge, also alles, was nicht in der
Ebene steht.

Der Plan sah vor, zuerst SSR zu versuchen und nach „zwei Tagen Tuning" anhand
von Rauschen und Ghosting zu entscheiden. Das ist eine Regel über Aufwand.
Entschieden hat stattdessen eine Messung — `japanMap.reflectionProbe()`, die
Umsetzung in `src/debug/reflectionProbe.ts`:

> Screen-Space-Reflexionen können nur zeigen, was **schon im Bild steht**.

Für ein Raster von Bildpunkten wird der Sehstrahl auf den nassen Asphalt
geschossen, an der Fläche gespiegelt, gegen die Stadt verfolgt und der Treffer
in die Kamera zurückprojiziert. Landet er außerhalb des Bildes oder verdeckt,
kann SSR ihn nicht kennen. Gegen **nur die Neonschilder** — die Abnahmezeile —
an fünf Standpunkten, 30² Proben:

| Standpunkt | Neon-Treffer | davon SSR-fähig |
|---|---|---|
| Straße, Augenhöhe | 24 | **4,2 %** |
| Straße, Blick hoch | 38 | 31,6 % |
| Gehweg an der Wand | 18 | 11,1 % |
| Kreuzung | 28 | 17,9 % |
| aus dem Wagen | 6 | 33,3 % |
| **zusammen** | **114** | **19,3 %** |

Vier Fünftel der Neonspiegelungen sind im Primärbild verdeckt. Das ist keine
Frage von Rauschen oder Tuning, sondern die Blickgeometrie einer Straßenszene:
die Kamera steht tief und schaut nach vorn, gespiegelt wird, was **über** ihr
ist. Damit fällt A aus, bevor die erste Zeile SSR geschrieben ist.

Die planare Spiegelung ist hier zudem nicht nur der Rückfallweg, sondern die
*richtige* Antwort: die Stadtebene ist exakt eben (6.1 hat sie dazu gemacht),
die Spiegelung an ihr ist damit geometrisch korrekt statt genähert.

**Der Preis steht dabei:** der Durchgang zeichnet die Szene ein zweites Mal und
verdoppelt Draw-Calls und Dreiecke, solange die Stadt im Bild ist. Außerhalb von
1400 m um den Distrikt entfällt er ganz. Für die Qualitätsstufen aus P7.1 ist er
der erste Kandidat zum Abschalten.

### Ein Befund aus dem Polish-Durchgang

Nach 6.2 stand im Commit die Bemerkung, die Stadt sei „bei blauer Stunde noch zu
hell und zu einheitlich" — aus 1,2 km ein heller Fleck in dunkler Landschaft.
**Nachgemessen ist die Prämisse falsch.** Maske am Blickpunkt `stadt-fern`,
mittlere Helligkeit der Stadtpixel gegen einen 60-px-Rahmen ringsum:

| Zustand | Stadt | Umgebung | Verhältnis |
|---|---|---|---|
| ~~wie gebaut~~ | ~~141,8~~ | ~~99,3~~ | ~~**1,43**~~ |
| ~~ohne Fenster- und Neonlicht~~ | ~~63,2~~ | ~~76,4~~ | ~~**0,83**~~ |

**Diese vier Zahlen sind falsch, und der Grund ist in P7 aufgefallen.** Alle
64 Bildschirmfotos aus P6 enden bei x = 1024 von 1280 — jedes andere Bild im
Archiv ist vollständig. Der Imposter-Bake ließ den Renderer-Viewport auf
Atlasgröße stehen (1024²), und `setRenderTarget(null)` nimmt genau den. Der
fertige 1280 × 720-Frame wurde damit in ein 1024er Quadrat geblittet: rechts
20 % abgeschnitten, und von der 1024 hohen Fläche zeigt der Canvas nur die
unteren 720 — also **das untere Siebzigstel-Bild, waagerecht gestaucht**.

Genau deshalb war die *Umgebung* zu dunkel: der Rahmen um die Stadt lag im
gestauchten Bild auf Gelände statt auf Himmel.

Frisch gemessen, mit richtigem Viewport, gleiche Kamera, Maske als Differenz
gegen ein Bild mit ausgeblendeter Stadt (9417 Stadtpixel, 1,0 % des Bildes):

| Zustand | Stadt | Umgebung | Verhältnis |
|---|---|---|---|
| wie gebaut | 145,3 | 119,7 | **1,21** |
| ohne Fenster- und Neonlicht | 116,3 | 119,7 | **0,97** |

Gegengeprüft mit einem Rahmen, der nur außerhalb der Hüllbox liegt: 1,18 und
0,95 — die Rahmendefinition ist es also nicht.

**Der Schluss hält, die Schärfe nicht.** Ohne ihr Eigenlicht ist die Stadt nicht
heller als die Landschaft (0,97 statt der behaupteten 0,83), und der helle Fleck
kommt weiterhin aus brennenden Fenstern — aus genau dem, was SPEC §3.1 als
„dominante urbane Lichtquelle" fordert, und nicht aus zu hellem Beton. Nur ist
der Abstand kleiner, als er dastand: das Verhältnis fällt von 1,21 auf 0,97 und
nicht von 1,43 auf 0,83.

Damit ist der Punkt weiterhin geschlossen, ohne dass etwas geändert wurde. Und
er trägt jetzt zwei Lehren statt einer: eine widerlegte Annahme ist mehr wert
als eine glatte Doku — und **eine Messung am Bild ist nur so gut wie das Bild.**
Die Zahlen von damals waren nicht falsch abgelesen; sie waren an einem Frame
abgelesen, der etwas anderes zeigte als das, was gerendert wurde. Dieselbe
Fehlerfamilie wie dreimal in P6, nur andersherum: nicht „etwas fehlt im Bild",
sondern „ein Teil des Bildes fehlt".

### Abweichungen vom Plan, mit Begründung

- **6.1: kein Straßenraster aus Splines.** Eine Kreuzung mitten in zwei Strecken
  hat kein Ende, an dem der Rücksprung aus P3/3.5 greifen könnte — zwei koplanare
  Fahrbahnen stritten dort um jedes Pixel. Die Stadtschleife ist die befahrene
  Straße; die Nebenstraßen zwischen den Blöcken sind Fläche auf der Bodenplatte.
- **6.2: kein Fassaden-Atlas, sondern ein prozedurales Raster.** Ausführlich in
  `FacadeMaterial.ts`. Kurz: der Atlas-Ansatz setzt instanzierte Gebäude voraus,
  P6 fasst aber je Block zusammen (was der Plan selbst verlangt), und ein Atlas
  hat ein festes Seitenverhältnis, während eine Wand 7,4 m oder 23,1 m hat.
- **6.4: keine Regen-Ringe.** SPEC §3.1 legt „blaue Stunde **nach** Regen" fest.

### Risiken
- ~~**SSR**~~ — entschieden, siehe oben. Der Rückfallweg ist der gewählte Weg.
- ~~**Stadt sprengt das Draw-Call-Budget.**~~ 28 eigene Draw-Calls von 300.
  Die Zusammenfassung je Block hat gehalten — und die Zahl wird jetzt bewacht,
  nicht einmalig abgezählt.
- **Neu: der Spiegeldurchgang verdoppelt die Szene.** Auf schwacher Hardware ist
  er der erste Schalter, den P7.1 umlegen muss.

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

> Die Spalte „Schatten" ist so nicht gebaut worden — Kaskaden gibt es keine,
> und die Sichtweite wirkt nur auf die Vegetation. Beides mit Begründung unter
> „Was gebaut wurde, und wo es vom Plan abweicht".

**7.2 — Chunk-Streaming** → Erweiterung `ChunkManager`
- Vegetations- und Prop-Daten pro Chunk asynchron erzeugen (Web Worker)
- Prioritätswarteschlange nach Distanz und Blickrichtung
- Zeitbudget von 2 ms pro Frame für Chunk-Arbeit, Rest wird vertagt

> Gebaut wurde es nicht am `ChunkManager` (der verwaltet das **Terrain**-LOD und
> erzeugt keine Chunk-Daten), sondern am `ScatterSystem`. Aus dem Zeitbudget ist
> eine Auftragstiefe geworden; warum, steht bei `SCATTER.workerQueueDepth`.

**7.3 — Ladebildschirm** → `src/ui/LoadingScreen.ts`
- Echter Fortschritt aus `ResourceManager`, keine gefälschte Animation
- Kritische Assets zuerst (Terrain, HDRI), Vegetation nachladbar

**7.4 — Profiling-Durchgang**
- GPU-Timer pro System (Terrain / Vegetation / Stadt / PostFX)
- Spector.js-Aufnahme analysieren: redundante State-Wechsel, Shader-Neukompilierungen
- **Shader-Vorkompilierung** (`renderer.compile()`) vor dem ersten Frame —
  sonst ruckelt es beim ersten Sichtkontakt mit jedem neuen Material

> ~~`renderer.compile()`~~ — nachgemessen erzeugt der Aufruf die **falschen**
> Programm-Varianten (20 ungenutzte, die 30 echten entstehen trotzdem). Die
> Begründung des Plans stimmt dagegen: der Ruckler beim ersten Sichtkontakt war
> mit 106 ms real. Ausführlich in `Engine.#precompile`.

**7.5 — Build & Auslieferung**
- Vite-Build mit Code-Splitting, Assets über Hash-Namen
- Alle Texturen KTX2, alle Modelle meshopt
- Brotli-Vorkompression
- Ziel: **erstes Bild < 15 MB** (SPEC §4)

### Akzeptanzkriterien

- [ ] **Stufe „Mittel" hält 60 FPS auf einer GTX-1660-Klasse bei 1080p** —
      *nicht prüfbar.* Diese Maschine rendert über ANGLE auf dem *Microsoft
      Basic Render Driver*, also im Software-Rasterisierer, und
      `EXT_disjoint_timer_query_webgl2` fehlt. Jede Zahl über GPU-Zeit wäre hier
      erfunden. Was gemessen ist, steht in `quality.config.ts`: die Stufen
      unterscheiden sich in Zeichenpuffer, Draw-Calls, Dreiecken und Instanzen
      um die Faktoren, die sie versprechen.
- [ ] **Stufe „Niedrig" hält 30 FPS auf integrierter Grafik** — dito.
- [ ] **Erster Frame nach < 5 s auf 50-Mbit-Verbindung** — **verfehlt, gemessen.**
      45 Dateien, 58,19 MB roh, 42,68 MB mit Brotli. Bei 50 Mbit sind das
      **6,8 s allein für die Übertragung**. Die Aufschlüsselung und die Liste der
      verbleibenden Hebel stehen unten.
- [x] **Kein Ruckler > 50 ms während einer 2-minütigen Flugroute über die ganze
      Map** — Flug über acht Blickpunkte (Massiv, Pass, Reisfeld, Küste, Tempel,
      Stadt, Geschäftsstraße, Luftbild), 900 Frames, weiche Interpolation.
      Gemessen wurde die **CPU-Zeit aller System-`update()`** zusammen; das ist
      der Anteil, über den diese Maschine eine Aussage zulässt:

      | | Median | 95 % | 99 % | Maximum | über 50 ms |
      |---|---|---|---|---|---|
      | CPU je Frame | 1,0 ms | 2,0 ms | 2,5 ms | **8,9 ms** | **0** |

      Die Gesamtframezeit lag bei Median 178 ms — das ist der
      Software-Rasterisierer und sagt über die Zielhardware nichts.
- [x] **Kein Speicherwachstum über 10 Minuten (Leak-Prüfung)** — 500 weitere
      Flugframes nach den 900 oben:

      | | Texturen | Geometrien | Programme | JS-Heap |
      |---|---|---|---|---|
      | vorher | 61 | 116 | 30 | 218,9 MB |
      | nachher | 61 | 116 | 30 | 229,7 MB |

      GPU-seitig **kein** Wachstum. Der Heap wächst um 10,8 MB, und das ist der
      Chunk-Cache der Streuung, der auf einer Route über die ganze Karte in
      seine Obergrenze läuft (`SCATTER.cacheSize` = 512). Bewiesen ist damit
      nicht „kein Leck", sondern „nichts, was über eine bekannte Schranke
      hinauswächst" — ohne erzwungene Speicherbereinigung lässt `performance
      .memory` mehr nicht zu, und das gehört dazugesagt.

### Was gebaut wurde, und wo es vom Plan abweicht

- **7.1 — die Stufen taten vorher nichts.** Gelesen wurde die Tabelle von zwei
  Stellen, und beide über die Konstante `DEFAULT_QUALITY`. Jetzt hält ein
  `QualitySystem` den Zustand und verteilt ihn; jedes System wendet seinen
  Anteil selbst an. Messtabelle in `quality.config.ts`.
  - `shadowCascades` ist **entfallen**: es gibt keine Kaskaden, P2 hat sie
    ausgerechnet und verworfen. Ein Konfigurationsfeld, das nichts liest, ist
    eine Zusage ohne Deckung.
  - `ssr` heißt jetzt `reflections` und schaltet den planaren Durchgang aus
    P6.5 — SSR ist dort gemessen verworfen worden.
  - Die **Sichtweite** begrenzt nur die Streuung, nicht die Chunk-Auswahl. Das
    Gelände bei 600 m zu schneiden nähme der Karte die Berge, und den LOD-Baum
    gröber zu stellen verletzt die Rissfreiheit (Herleitung in `lod.config.ts`;
    P4 hat den Fall mit 207 Löchern gegen 1 gemessen).
- **7.2 — die Streuung läuft im Worker.** Die Spitze auf dem Hauptthread fällt
  von 5,8–7,0 ms auf 0,7–4,2 ms; einzelne Chunks kosten im Worker bis 25,8 ms.
  Was übrig bleibt, ist **nicht** die Streuung, sondern das Einsortieren der
  Instanzen in die LOD-Puffer. Die Platzierung bleibt bitgleich (51 646
  Instanzen mit und ohne Worker).
- **7.3 — Ladebildschirm.** Der Balken kommt aus der Zahl initialisierter
  Systeme, nicht aus `resources:progress`: dessen `total` wächst während des
  Ladens, der Quotient liefe rückwärts. Ein Balken über **Bytes** wäre der
  ehrlichste und braucht ein erzeugtes Größenmanifest — offen, siehe unten.
- **7.4 — `renderer.compile()` erzeugt die falschen Programme.** Gemessen: 20
  Varianten, die nie gezeichnet werden, und die 30 echten entstehen anschließend
  trotzdem. Stattdessen ein vollständiger Frame durch dieselbe Kette, mit
  abgeschaltetem Frustum-Culling. Danach: null zusätzliche Programme über sieben
  Blickpunkte, und der Ruckler beim ersten Sichtkontakt mit der Stadt (274,4 ms
  gegen 168 ms) ist weg.
- **7.5 — der gebaute Stand startete nicht.** Ein Deadlock über Top-Level-await:
  der Einstiegs-Chunk hielt sich selbst auf. Nur im Build, nie im Dev-Server.
  Behoben über eigene Chunks für `three`/PostFX **und** eine `boot()`-Funktion.

### Was offen bleibt — mit Zahlen

Der Startdownload ist der eine verfehlte Punkt, und er ist auch mit den Mitteln
aus dem Plan nicht ganz zu schließen:

| Hebel | Ersparnis | Stand |
|---|---|---|
| Himmel-HDRI von 4k auf 2k | −4,8 MB | 2k liegt vor, braucht einen RGBE-Resampler |
| `normal.png` streichen | −5,3 MB | Normale aus `height.r16` im Shader rechnen |
| KTX2 für alle JPG/PNG | ≈ −15 MB | **geschätzt** — `toktx` ist hier nicht installiert |

Bliebe rund **18 MB** gegen 15. Die dritte Zeile ist die einzige ungemessene in
dieser Tabelle und deshalb ausdrücklich markiert.

Ebenfalls offen und bewusst nicht angefangen:

- **GPU-Timer je System** (7.4). Braucht die Erweiterung, die hier fehlt.
- **Spector.js-Aufnahme** (7.4). Braucht ein Bild, vor dem jemand sitzt.
- **Prop-Daten im Worker** (7.2 nennt sie neben der Vegetation). Die Props
  entstehen einmalig beim Laden und nicht je Chunk; sie kosten im laufenden
  Bild nichts und wären dort nur Umbau ohne Messwert dahinter.

### Risiken
- **Zielhardware nicht verfügbar.** → GPU-Drosselung in den Chrome DevTools
  plus `WEBGL_debug_renderer_info`-Telemetrie. Ersetzt echtes Testen nicht;
  falls möglich, auf einem zweiten Rechner gegenprüfen.
  **Eingetreten.** Zwei Akzeptanzkriterien bleiben deshalb offen, und die
  Gegenmaßnahme aus dieser Zeile hilft nicht: eine gedrosselte GPU ist immer
  noch keine GTX 1660, und ohne Timer-Erweiterung gibt es auch gedrosselt keine
  GPU-Zeit. Was blieb, war die Trennung der Messgrößen — exakte Zähler und
  CPU-Zeit werden berichtet, GPU-Zeit gar nicht.

---

# P8 — Polish & Presets ○

**Ziel:** Aus einer technisch abgenommenen Karte ein Grundstück machen, auf dem
ein Spiel stehen kann — unten lauffähig auf jedem Gerät, oben vorzeigbar, und
dazwischen eine Welt, die zusammenhängt statt aus fünf Zonen zu bestehen.

> **Diese Phase ist eine Mängelliste, keine Wunschliste.** Jede Aufgabe unten
> nennt zuerst den **Befund** mit der Zahl, an der er hängt, dann den **Fix**,
> dann die **Messung**, die ihn abnimmt. Wo der Befund aus dem Quelltext
> abgeleitet und nicht am laufenden Bild gemessen ist, steht das dabei — nach
> CLAUDE.md ist das der Unterschied zwischen einer Diagnose und einer Vermutung.

### Zwei Entscheidungen, die vorab getroffen wurden

- **Die Bergflanke wird nachgebessert** (8.5). Die seit P3 offene
  P1-Nachbesserung ist damit terminiert und nicht mehr aufgeschoben.
- **Die Stadt wird nicht größer, sondern weicher** (8.8). SPEC §2.1 nennt
  ~800 × 800 m, gebaut sind 360 × 360 m. Der Distrikt **bleibt** bei 360 m; was
  fehlt, ist kein Bauvolumen, sondern ein Rand. Ausdrücklich verworfen: den
  Distrikt auf Spec-Größe aufzublasen — das Teilbudget von 300 Draw-Calls für
  die Stadt wäre der erste Posten, der reißt, und das Problem („steht als Block
  in der Landschaft") wäre danach dasselbe, nur größer.

---

### Aufgaben

**8.1 — Terrain-Detail je Qualitätsstufe** → `src/config/lod.config.ts`,
`src/config/quality.config.ts`, `src/world/ChunkManager.ts`

**Befund.** Die Stufen „Mittel" und „Niedrig" sparen **keine Geometrie**. Aus
der eigenen Messtabelle in `quality.config.ts`:

| Stufe | Dreiecke |
|---|---|
| Mittel | 329 823 |
| Niedrig | 329 118 |

705 Dreiecke Unterschied, das ist Rauschen. Der ganze Abfall von Hoch (610 151)
auf Mittel stammt aus dem wegfallenden planaren Spiegeldurchgang, nicht aus
Detailstufen. Grund: `LOD.gridVertices` ist eine **Konstante** (33), also zeichnet
das Gelände auf jeder Stufe identisch — 2048 Dreiecke je Knoten bei 73…105
Knoten im Bild. „Niedrig" hat real nur zwei Hebel, Auflösung (0,7) und
Vegetationsdichte (0,25), und beide lassen die Geländelast unberührt.

**Fix.** `gridVertices` je Stufe: 33 / 33 / 25 / 17. Bei 17 sind das 512 statt
2048 Dreiecke je Knoten — rund 150 000 Dreiecke weniger im Bild.

> **Die Rissfreiheit steht dem nicht entgegen, und das ist der ganze Punkt.**
> Die Ungleichung `morphStart ≥ 0,5 + √2/f` (hergeleitet bei `SPLIT_FACTOR`)
> verknüpft **Bereichsgrenzen mit Knotengröße**. Die Auflösung *innerhalb* eines
> Knotens kommt darin nicht vor. Alle Knoten teilen sich eine einzige Geometrie;
> wird die bei einem Stufenwechsel neu gebaut, sind alle Knoten gleich fein und
> die Nähte liegen unverändert. Das unterscheidet diesen Hebel von dem, den P7
> als kaputt verworfen hat — dort wurden die `ranges` skaliert, was wie f' = k·f
> wirkt und die Ungleichung verletzt (gemessen: 207 Löcher gegen 1).
>
> **Das ist eine Herleitung, keine Messung.** Sie kann falsch sein.

Der Preis ist Auflösung: 3 m statt 1,5 m je Vertex bei 17 Stützstellen. Die
Heightmap wird damit nicht mehr voll ausgelesen (Texelabstand 1,5007 m), Grate
werden weicher. Für eine Stufe, die auf integrierter Grafik laufen soll, ist das
der richtige Tausch — für Ultra wäre es einer der falschen, deshalb bleibt sie
auf 33.

**Messung.** Lochzählung nach dem Verfahren aus P4, gebaut als
`japanMap.lodHoles()` in `src/debug/lodHoles.ts`. Grenzwert ist der Stand von
P4: höchstens 1 Loch.

> **Gebaut und gemessen — mit zwei Korrekturen am Messverfahren selbst.** Der
> erste Anlauf meldete 2 921 783 Löcher auf Ultra, wo P4 eines gemessen hatte.
> Gefunden hat den Fehler nicht die Zahl, sondern **das Bild**: es zeigte ein
> halb leeres Frame mit Treppenkanten, und die Treppen waren Knotengrenzen.
>
>  1. **Die Auswahl war veraltet.** Der Quadtree wählt seine Knoten im
>     `update()` des `TerrainSystem`, nicht beim Zeichnen. Ein direktes
>     `renderer.render()` nach einem Kamerasprung zeichnet deshalb die Auswahl
>     der *vorherigen* Kamera, samt deren Frustum-Culling. Die Messung ruft
>     jetzt einen vollständigen Frame der Anwendung auf, bevor sie selbst
>     rendert.
>  2. **Die Definition war zu weit.** „Alles unterhalb des obersten
>     Geländepixels" zählt den **Rand der Welt** mit — von `start` oder `kueste`
>     schaut man über die 3072 m hinaus, und dort steht Hintergrund bis zum
>     unteren Bildrand. Gezählt wird jetzt Himmel *eingeschlossen zwischen*
>     Gelände; das trennt Riss von Weltende, ohne von der Kameraführung
>     abzuhängen.
>
> Und weil eine Messung, die nie etwas findet, von einem kaputten Filter nicht
> zu unterscheiden ist (CLAUDE.md: „Ein Filter, der nie gefiltert hat"), ist der
> Zähler **gegengeprüft**: mit absichtlich falschem `uLodGridQuads` meldet er
> 1496 Löcher, zurückgestellt wieder 0.

Dazu Dreiecke und Knotenzahl je Stufe neu in der Tabelle in `quality.config.ts`,
und je ein Bild von `pass` auf 33² und 17² — die Grate werden bei 3 m/Vertex
weicher, das ist der gewollte Preis und keine Überraschung.

---

**8.2 — PostFX staffeln und eine fünfte Stufe** → `src/render/PostFXPipeline.ts`,
`src/config/quality.config.ts`, `src/core/Engine.ts`

**Befund.** Von der Postprocessing-Kette ist genau **ein** Effekt an die
Qualitätsstufe gebunden: AO. Bloom, SMAA, Vignette, Grading-LUT und AgX laufen
auf „Niedrig" in voller Auflösung genauso wie auf Ultra. Auf integrierter Grafik
bei 1080p ist eine Vollbildkette regelmäßig der teuerste Einzelposten überhaupt —
und sie ist der einzige Posten, der **nicht** mit `renderScale` schrumpft, weil
das Ziel der Kette der Canvas ist.

*Abgeleitet aus dem Quelltext, nicht gemessen* — `EXT_disjoint_timer_query_webgl2`
fehlt hier, also gibt es keine GPU-Zeit je Durchgang. Was messbar ist: ob der
Effekt läuft, und der Zeichenpuffer, in den er läuft.

**Fix.** Zwei Teile.

1. Staffelung: Bloom ab „Mittel" in halber Auflösung, SMAA unter „Mittel" aus
   (bei `renderScale` 0,7 ist die Kantenglättung ohnehin gegen einen
   hochskalierten Puffer), Vignette und Grading bleiben auf allen Stufen — die
   LUT kostet eine Texturabfrage und trägt den Look aus SPEC §3.1.
2. Eine fünfte Stufe **„Minimal"** unterhalb von „Niedrig", die den Composer
   **umgeht** und direkt in den Canvas rendert. Das ist kein „Niedrig mit
   weniger", sondern ein anderer Renderpfad: `renderScale` 0,5,
   `vegetationDensity` 0,1, nur Imposter, `gridVertices` 17, keine planare
   Spiegelung, kein AO, kein Bloom, kein SMAA. Tonemapping übernimmt dann der
   Renderer selbst.

> **Der Bypass ist der Grund für die eigene Stufe.** Solange die Kette läuft,
> kostet sie ihre Vollbilddurchgänge, egal wie klein man sie stellt. Große
> Titel führen diese Stufe deshalb als eigenen Pfad und nicht als Reglerstellung.

**Messung.** Je Stufe: Zeichenpuffergröße, Draw-Calls, Dreiecke — und die
**Durchgänge der Kette allein**, gemessen als Draw-Calls bei leerer Szene.
Zusätzlich ein Bild je Stufe von `stadt-neon`: „Minimal" darf schlechter
aussehen, aber nicht **kaputt**.

> **Gebaut und gemessen.**
>
> | Stufe | Puffer | Draw-Calls | Dreiecke | Gelände | Durchgänge |
> |---|---|---|---|---|---|
> | Ultra   | 1280×720 | 96 | 605 486 | 264 192 | 28 |
> | Hoch    | 1280×720 | 97 | 605 487 | 264 192 | 29 |
> | Mittel  | 1088×612 | 61 | 212 763 | 148 608 | 22 |
> | Niedrig |  896×503 | 49 | 130 191 |  66 048 | 10 |
> | Minimal |  640×360 | 40 | 130 182 |  66 048 |  1 |
>
> Alle fünf liefern ein **vollständiges** Bild (`probe()` meldet
> `anteilNichtSchwarz` = 1,000). Der Sprung von Niedrig auf Minimal ist die
> Kette und sonst nichts: zehn Vollbilddurchgänge gegen einen, und ein Viertel
> der Pixel.
>
> **Was Minimal im Bild verliert, ist gemessen und nicht geschätzt** — Maske aus
> der Differenz gegen einen Frame mit ausgeblendeter Neongruppe, wie in P6:
> die Neonfläche fällt von 5,62 % auf 1,98 % (Faktor 2,8). Die Sättigung fällt
> dabei **nicht** (0,206 gegen 0,191). Mein erster Eindruck am Bild — „die
> Schilder sind ausgewaschen" — war falsch: sie verlieren nicht ihre Farbe,
> sondern ihr Streulicht.
>
> Nicht aufgeschlüsselt ist der Sprung 22 → 10 Durchgänge. Dort fallen AO,
> SMAA und eine Bloom-Stufe **gleichzeitig** weg; welcher Anteil wie viel
> trägt, bräuchte den A/B-Knopf und einen GPU-Timer, den diese Maschine nicht
> hat. Und dass Ultra einen Durchgang *weniger* hat als Hoch (28 gegen 29),
> liegt vermutlich am Aufwärtsfilter der halbauflösenden AO — **vermutet,
> nicht isoliert gemessen.**

> **Die Stufe hat einen Fehler gefunden, der älter ist als sie.** „Niedrig"
> schaltet seit 8.2 SMAA ab, und danach war der Canvas **schwarz** — bei
> unveränderten Draw-Calls, Dreiecken und Instanzen. Gefunden hat es `probe()`
> mit `anteilNichtSchwarz` = 0,000.
>
> Ursache: `EffectComposer.addPass` setzt `renderToScreen` genau einmal, auf den
> letzten Pass **im Array** — bei uns SMAA. `render()` überspringt abgeschaltete
> Pässe dagegen vollständig. Wer SMAA abschaltet, nimmt der Kette damit ihren
> einzigen Ausgang; das fertige Bild landet im Zwischenpuffer.
>
> **Der Schalter „SMAA" im Debug-Panel tat seit P2 genau dasselbe.** Aufgefallen
> ist es nie, weil ihn niemand benutzt hat. Behoben in
> `PostFXPipeline.#updateRenderToScreen()`: der letzte *aktive* Pass zeichnet auf
> den Bildschirm, und der A/B-Profiler zieht das beim Umschalten mit nach.

---

**8.3 — Ersteinstufung mit Geräte-Vorabschätzung** → `src/render/QualitySystem.ts`,
`src/config/quality.config.ts`

**Befund.** `DEFAULT_QUALITY` ist `ultra`, und der Benchmark misst von dort aus
90 Frames (30 Aufwärmung + 60 Messung), bevor er die erste Stufe herunterschaltet.
Ein schwaches Gerät verbringt damit mehrere Sekunden unter Vollast — genau das
Gerät, auf dem das den Kontext kosten oder die Seite einfrieren kann. Die
Begründung für die Richtung ist richtig und bleibt („heruntergestuft wird
gemessen, hochgestuft nie"); falsch ist allein der **Startpunkt**.

**Fix.** Eine grobe Vorabschätzung *vor* dem ersten gemessenen Frame, aus vier
Signalen, die ohne Rendern verfügbar sind:

| Signal | wofür |
|---|---|
| `WEBGL_debug_renderer_info` | Software-Rasterisierer und mobile GPUs erkennen |
| `navigator.hardwareConcurrency` | grober Klassenindikator |
| `navigator.deviceMemory` | dito, wo vorhanden |
| `matchMedia('(pointer: coarse)')` | Touch-Gerät |

Die Schätzung **ersetzt den Benchmark nicht**, sie setzt nur seine Startstufe:
bekannt stark → Ultra, unbekannt oder mobil → Mittel, Software-Rasterisierer →
Minimal. Von dort läuft die bestehende Messung wie bisher weiter.

> Große Titel pflegen dafür Gerätedatenbanken. Das ist hier weder machbar noch
> nötig — es geht nicht darum, die richtige Stufe zu **raten**, sondern darum,
> nicht auf der teuersten anzufangen.

**Messung.** Die Schätzung muss auf dieser Maschine „Software-Rasterisierer"
erkennen und mit Minimal starten; der Benchmark muss danach trotzdem laufen und
sein Ergebnis speichern dürfen. Dazu die drei bekannten Sonderfälle aus P7 erneut
prüfen: verdecktes Fenster (Abbruch), gespeicherte Wahl (kein Benchmark),
manuelle Wahl im Panel (Benchmark stoppt).

---

**8.4 — Wolkenschatten und Wolkenebene** → `src/world/shaders/terrain_pars.frag.glsl`,
`src/render/atmosphere/`, `src/config/atmosphere.config.ts`

**Befund.** Die Beleuchtung ist vollständig **gebacken** (`shade.png`, feste
Sonnenrichtung aus dem HDRI). Die Welt hat damit keinen einzigen bewegten
Lichtanteil; was sich bewegt, ist der Wind in der Vegetation. Wolken gibt es
nicht — weder als Schatten noch als Geometrie noch im Nebel.

**Fix.** Zwei Teile, in dieser Reihenfolge, weil der erste billiger ist und mehr
trägt:

1. **Wolkenschatten.** Eine scrollende Rauschtextur, multiplikativ auf den
   **direkten** Sonnenanteil (nicht auf das IBL — eine Wolke verdeckt die Sonne,
   nicht den Himmel). Kosten: eine Texturabfrage im Terrain-Shader, dieselbe in
   Vegetation und Stadt. Projiziert wird in Weltkoordinaten XZ, damit der
   Schatten über alle Systeme zusammenpasst.
2. **Wolkenebene.** Zwei Lagen auf einer Kuppel mit unterschiedlicher
   Scrollgeschwindigkeit — daraus entsteht Parallaxe ohne Volumen. Ein
   Draw-Call. Bei 2,23° Sonnenstand fangen die Unterseiten die warme
   Sonnenfarbe; das ist derselbe Effekt, den `FOG.aerial` bereits aus dem
   Himmels-HDRI liest.

> **Ausdrücklich verworfen: volumetrische Wolken.** Raymarching kostet einen
> Vollbilddurchgang mit Dutzenden Abtastungen, und die Kamera kommt in dieser
> Karte auf 420 m (`stadt-luft`). Eine Wolkenschicht läge bei 800…1200 m, also
> immer über ihr — man flöge nie hindurch. Der Nutzen ist die Silhouette, und
> die liefert Teil 2 zum Bruchteil des Preises.

**Messung.** Der Wolkenschatten wirkt **lokal**, also wird lokal gemessen — nach
der Lehre aus P4/P6: Differenz gegen ein Bild mit abgeschaltetem Wolkenschatten,
maskiert auf die Fläche, die er trifft. Ein Mittelwert über das ganze Bild würde
ihn im Himmelsanteil ertränken; genau dieser Fehler hat in P6 fünf Anläufe
gekostet. Dazu: Draw-Calls +1 für die Kuppel, Dreiecke unverändert im Gelände,
und ein Bild von `start` und `pass`.

---

**8.5 — Der Terrain-Durchgang** → `tools/bake-terrain.mjs`

**Alles, was das Höhenfeld anfasst, passiert hier — in einem Durchgang.** Die
Kette ist zirkulär (`npm run world`), und jede Geländeänderung zieht
Verschattung, Zonenmaske, Straßentrassierung, Vegetationsverteilung und
Prop-Höhen nach. CLAUDE.md führt dazu bereits einen Fall: die Einebnungsschwelle
der Reisfelder hat über eine **Kehre am Bergpass** entschieden. Ein zweiter
Durchgang später kostet die vollständige Neumessung ein zweites Mal.

#### 8.5a — Die Flanke des Massivs

**Befund.** Gerechnet aus `ZONES.mountain = { x: −820, z: −900, inner: 300,
outer: 1080 }`: die Flanke überbrückt 450 m Höhe auf 780 m Radiusdifferenz, also
im Mittel **58 % Neigung**. P3 hat 45 % am relevanten Hang gemessen. Der
Zielwert aus der P1-Nachbesserung sind **25 % über etwa 1,5 km**.

**Und der Fuß der Flanke wird abgeschnitten — das stand hier noch nicht.** Der
Massivrand reicht nach Süden bis z = +180. Die Reisfeldzone beginnt mit ihrer
380-m-Feder bereits bei z = −640. Das ist ein **Überlappungsband von 820 m**, und
in `bake-terrain.mjs` läuft die Ebenen-Einebnung (Schritt 4) **nach** dem Massiv
(Schritt 3) und zieht das Gelände dort per `lerp` auf 22 m. Die Südflanke —
genau die, an der der Pass hochführt — endet also nicht, sie wird planiert.
Abstand der Zonenmittelpunkte: 962 m.

> *Aus dem Quelltext gerechnet, nicht am Höhenprofil gemessen.* Die Messung
> dazu fehlt noch und ist der erste Schritt dieser Aufgabe.

**Fix.** In dieser Reihenfolge, weil der erste Schritt entscheidet, ob die
anderen nötig sind:

1. **Erst messen.** Ein Höhenprofil entlang der Passachse vom Gipfel bis in die
   Ebene, plus die Verteilung der Neigung über die Flanke — nicht den Mittelwert
   allein (CLAUDE.md: „Mittelwerte verstecken Formen"). Werkzeug: Erweiterung von
   `npm run inspect` um `--profile x0,z0,x1,z1`.
2. **Die Flanke anisotrop verlängern.** Radial geht es nicht: `outer` von 1080
   auf 1500 zu setzen schiebt den Massivrand mitten in die Reisfelder. Gebraucht
   wird eine **elliptische Maske**, die entlang der Passachse (nach Süden/
   Südosten) länger ausläuft als quer dazu.
3. **Den Konflikt mit der Reiszone auflösen.** Drei Wege, und die Wahl gehört
   ins Bild und nicht in eine Formel:
   - Reiszone nach Süden verschieben (z 60 → ~200; die Karte hat dort Platz bis
     zur Küstenzone bei z 600),
   - ihre Feder von 380 m verkürzen — **Vorsicht, das ist der Parameter mit der
     dokumentierten Fernwirkung auf die Kehren**,
   - oder die Reihenfolge im Baker ändern, sodass das Massiv die Einebnung
     begrenzt statt umgekehrt.
4. **Die Gratamplitude auf der Flanke dämpfen.** `h += r * 645 * massif` legt die
   Grate mit voller Stärke bis in den Auslauf; eine flachere Flanke mit
   unverändert scharfen Graten ist wieder steil, nur kleinteiliger.

**Messung.** `npm run world` vollständig, dann:
- Neigungsverteilung über die Flanke (Ziel: Median ≤ 25 %, kein Extremwert über
  40 % im Trassenkorridor),
- **Kehren am Pass** — Zielwert aus SPEC §2.1 ist ≥ 8,
- **Erdbau** über die Erdbau-Karte (`npm run inspect -- --road toge --clean
  .cache/clean.r16`). Die Zahl, die den Kompromiss von P3 erzwungen hat, war
  „300 × 250 m um 50…150 m abgetragen". Der Fix taugt nur, wenn die Kehren
  kommen **und** diese Zahl fällt. Beides zusammen, nicht eines davon.
- **Ein Bild der Silhouette** von `start`, `kueste` und `reisfeld`. Das Massiv
  ist der Hintergrund der halben Karte; wenn es danach flach aussieht, ist der
  Fix gescheitert, auch wenn alle Zahlen stimmen.

#### 8.5b — Flussbett und Wasserfallstufen

**Befund.** SPEC §2.1 nennt für die Reisfeldzone „Dorf, **Fluss**". Es gibt
keinen. `WaterSystem.ts:19` und `water.config.ts:4` halten das ausdrücklich als
aufgeschoben fest. Folge: die Reisterrassen — 101,2 ha — haben keine
Wasserquelle, und die Karte hat keine Nord-Süd-Verbindung außer der Straße.

**Fix.** **Das Flussbett ist ein Straßentyp.** `bake-terrain.mjs` schneidet
bereits entlang von Splines ins Höhenfeld ein (Schritt für die Straßen); ein
Flussbett ist derselbe Vorgang mit V-Profil statt flacher Fahrbahn, ohne
Überhöhung und ohne Böschungsverrundung. Kein neues System, ein neuer Typ in
`roads.config.ts` und ein zweiter Profilfall im Baker.

Trasse: vom Massiv über die Terrassen zur Südküste. Wo das Gefälle eine Schwelle
reißt, wird **nicht** eingeschnitten — dort steht eine Stufe, und das ist die
Stelle für einen Wasserfall (8.6). Zwei bis drei solcher Stufen an der
Bergflanke.

> **Reihenfolge im Baker ist nicht beliebig.** Das Flussbett muss **vor** der
> Reisfeld-Einebnung liegen, sonst planiert diese es zu. Und **nach** dem
> Straßeneinschnitt, sonst füllen die Straßenböschungen es wieder auf — genau der
> Fehler, den `CITY_PAD_Y` für die Stadtplatte bereits dokumentiert.

**Messung.** Monotones Gefälle von der Quelle bis zur Mündung (kein Abschnitt,
in dem das Bett bergauf läuft — ein Fluss, der steigt, ist der sichtbarste
denkbare Fehler), Bettbreite und -tiefe über die Länge, und die Erdbau-Karte für
den Einschnitt. Dazu die Prüfung, dass die Reisterrassen **am** Fluss liegen und
nicht 300 m daneben.

#### 8.5c — Das Vorfeld der Stadt

**Befund.** Der Baker ebnet für die Stadt ein Plateau von **800 × 800 m** ein
(`ZONES.city`, x 380…1180, z −310…490). Der gebaute Distrikt misst 360 × 360 m
(x 440…800, z −60…300) und sitzt darauf **außermittig**: 380 m freie Platte im
Osten, 60 m im Westen. Der Distrikt belegt **20 % seines eigenen Plateaus**.

Das ist die geometrische Seite von „die Stadt steht als Block in der Natur": um
sie herum liegt eine große, planierte, leere Fläche, und der Übergang von dort
ins Gelände ist eine 300-m-Feder ohne irgendetwas darauf.

> *Gerechnet, nicht am Bild geprüft.* Ob die Platte im Bild als leer **liest**,
> ist eine Bildfrage — die Vegetationsstreuung kann sie zuwachsen lassen. Erster
> Schritt dieser Aufgabe ist deshalb ein Blick von `stadt-luft` und `stadt-fern`
> mit eingeblendeter Zonenmaske.

**Fix.** Im Baker nur die Vorbereitung: das Plateau bekommt eine **abgestufte**
statt einer glatten Einebnung — Kernfläche eben, Vorfeld mit leichter Neigung und
Restrelief, damit dort etwas stehen kann, das nicht wie Stadt aussieht. Der
sichtbare Teil steht in 8.8.

---

**8.6 — Fluss und Wasserfälle** → `src/world/WaterSystem.ts`,
`src/world/materials/WaterMaterial.ts`, `src/config/water.config.ts`

**Befund.** `WaterSystem` kennt nur das Meer — eine Ebene auf Y = 0. Ein Fluss
liegt auf wechselnder Höhe entlang eines Splines und passt nicht in dieses
Modell.

**Fix.** Ein Flussband als extrudiertes Mesh entlang des Splines aus 8.5b, mit
der Bett-Mittellinie als Höhenquelle — dasselbe Verfahren wie beim Straßen-Mesh,
inklusive des Versatzes über der Mittellinie, damit Wasser und eingeschnittenes
Bett nicht um jedes Pixel streiten (P3, `ROAD_MESH.surfaceOffset`; und P6, wo
genau dieser vergessene Versatz 3339 Decals im Asphalt versenkt hat).

Wasserfälle an den Stufen aus 8.5b: senkrechtes Band mit scrollender
Normalenkarte, darunter Gischt als kleine Instanzwolke. Beides an die
Qualitätsstufe gebunden — unter „Mittel" fällt die Gischt weg.

**Messung.** Kein Riss zwischen Flussband und Bett (Bild aus Augenhöhe an drei
Stellen), kein Z-Fighting an der Mündung gegen das Meer, Draw-Calls und
Dreiecke, und ein Bild jedes Wasserfalls. Dazu die Konsole — nach jeder
Materialänderung, das ist die Regel aus P6.

---

**8.7 — Pfade** → `src/config/roads.config.ts`, `tools/gen-roads.mjs`,
`src/world/materials/RoadMaterial.ts`

**Befund.** Es gibt nur asphaltierte Straßen. Alles, was in dieser Landschaft
zu Fuß erschlossen wäre — Tempelaufgang, Feldwege zwischen den Terrassen, der
Weg zum Leuchtturm —, existiert nicht. Die Karte hat Verkehrswege, aber keine
Wege.

**Fix.** Ein Straßentyp `pfad`: 1,5…2 m breit, Kies-/Erdmaterial, keine
Markierung, keine Leitplanke, kein Bankett, minimaler Geländeeinschnitt. Das
Straßensystem trägt das bereits — es ist im Wesentlichen ein Materialfall und
ein paar Splines. Verbindungen: Dorf ↔ Tempel, Terrassen untereinander,
Küstenstraße ↔ Fischerdorf ↔ Leuchtturm.

**Messung.** Pfade dürfen die **Freihaltezone** der Vegetation nutzen, aber nicht
so breit räumen wie eine Straße — sonst zieht sich eine kahle Schneise durch den
Wald, wo ein Trampelpfad sein soll. Also: gemessener Freihalteradius je Typ, und
ein Bild aus Augenhöhe auf dem Waldpfad.

---

**8.8 — Der Stadtrand** → `src/world/city/CityGenerator.ts`,
`src/config/city.mjs`, `assets/props.json`

**Befund.** Zwei Zahlen, eine gemessen, eine gerechnet:

- **Gemessen (P6, nach dem Viewport-Fix):** die Stadt ist 1,21-mal so hell wie
  ihre Umgebung. Ohne Fenster- und Neonlicht 0,97. Die Helligkeit kommt also
  **vollständig aus dem Eigenlicht**, nicht aus dem Anstrich.
- **Gerechnet (8.5c):** der Distrikt ist ein 360-m-Rechteck auf einer 800-m-Platte.

**Der Anstrich ist damit als Ursache ausgeschlossen.** Das steht in CLAUDE.md
bereits als Fehler dieses Projekts: „Eine Ursache benannt, ohne sie zu trennen" —
die Palette wurde abgedunkelt, und die Begründung war falsch. Dieser Weg ist
nicht noch einmal zu gehen.

**Fix.** Drei Ansätze an der tatsächlichen Ursache:

1. **Neon durch die Luftperspektive schicken.** Emissive Materialien umgehen die
   Nebelrechnung leicht. Steht das Neon aus 1,2 km ungetrübt im Bild, sitzt die
   Stadt **vor** der Atmosphäre statt darin — und das ist genau der Eindruck
   „aufgeklebt". *Zuerst prüfen, ob es so ist*, dann beheben.

   > **Die Maskenmessung dafür steht schon**, gebaut in 8.2: Differenz gegen
   > einen Frame mit ausgeblendeter Neongruppe, daraus Fläche, Sättigung und
   > Helligkeit. Auf Ultra deckt das Neon an `stadt-neon` 5,62 % des Bildes bei
   > Sättigung 0,191. Das ist der Bezugswert, gegen den hier gemessen wird.
2. **Den Rand ausfransen.** Kein Hochhaus mehr, sondern das, was am Rand einer
   japanischen Kleinstadt steht: niedrige Hallen, Lagerplätze, Parkflächen,
   Gewächshäuser, ein Kanal, Strommasten. Der Distrikt bleibt bei 360 m; das
   Vorfeld aus 8.5c trägt den Übergang. Große Titel enden eine Stadt nie an einer
   Kante — sie verjüngen sie über mehrere hundert Meter.
3. **Die Silhouette brechen.** Aus `stadt-fern` prüfen, ob die Höhenverteilung
   eine Kontur ergibt oder eine Mauer.

**Messung.** Dieselbe Maskenmessung wie in P6, damit die Zahlen vergleichbar
bleiben: Helligkeitsverhältnis Stadt/Umgebung an `stadt-fern`, mit und ohne
Eigenlicht, dazu ein Kontrollband strikt außerhalb der Bounding-Box. Ziel ist
**nicht** ein bestimmter Wert, sondern dass die Kante im Bild verschwindet —
also gehört ein Vorher/Nachher-Bildpaar dazu und nicht nur eine Zahl. Und:
`cityDrawCalls` bleibt unter 300, ohne Frustum-Culling gezählt.

---

**8.9 — Fischerdorf und Tempelaufgang** → `assets/props.json`,
`src/world/props/landmarkMeshes.ts`, `tools/gen-props.mjs`

**Befund.** 686 Props, davon **372 Tetrapoden und 158 Leitpfosten** — 77 % sind
Küstenschutz und Straßenmöblierung. Was die Karte bewohnt aussehen lässt, sind
zusammen **36 Objekte**: 7 Höfe, 7 Schuppen, 12 Steinlaternen, 4 Torii, 4 Boote,
1 Halle, 1 Treppe, 1 Steg, 1 Leuchtturm.

Konkret fehlen zwei Orte, die SPEC §2.1 nennt oder voraussetzt:

- **Der Hafen.** Es gibt Leuchtturm, Steg, vier Boote und 372 Tetrapoden — die
  Zutaten eines Hafens ohne den Hafen.
- **Der Tempelaufgang.** Vier Torii ergeben keinen Sandō.

**Fix.**
- **Fischerdorf** an der Südküste beim Leuchtturm: 6…8 Hütten (die vorhandenen
  `farmhouse`/`shed`-Meshes mit Varianz in Maß und Dach), Netztrockengestelle,
  Bootsrampe, ein zweiter kleiner Steg, Reusen und Kisten als Kleinkram. Die
  Boote bekommen einen Ort, an den sie gehören.
- **Sandō**: Torii-Reihe in der Achse (die vier vorhandenen plus weitere im
  16-m-Raster, für das `PROP_CLEARANCE.torii` bereits ausgelegt ist), Laternen
  paarweise am Weg, ein Chōzuya (Wasserbecken), eine Glocke. Alle Meshes sind
  prozedural — Varianten kosten hier fast nichts (12 Landmarks = 2104 Dreiecke).

**Messung.** Draw-Calls und Dreiecke der Prop-Systeme, `PROPS.capacity` (512 je
Asset und Stufe) darf nicht überlaufen — ein Überlauf verwirft Props still.
Freihalteradien nach `PROP_CLEARANCE` prüfen: nach dem Fehler aus P5 („der
Tempel stand im Wald") gehört ein Bild dazu, kein Zahlenblick.

---

**8.10 — Weltrand** → bedingt, erst nach Messung

**Befund.** Die Welt ist 3072 m im Quadrat, Diagonale 4344 m, `CAMERA.far` steht
auf 6000. Von `start` (330 m) und `stadt-luft` (420 m) ist der Rand vermutlich
im Bild. *Vermutlich* — das ist bisher nicht geprüft.

**Fix, falls die Prüfung ihn verlangt.** Ein **Kulissenring**: grobe
Silhouettenberge jenseits der Spielfläche, ohne Vegetation, ohne Kollision, tief
in der Luftperspektive. Kostet wenige tausend Dreiecke und lässt 3 km wie 15 km
wirken. Der Standardgriff, und er funktioniert nur, wenn er **nie** betretbar
wirkt.

**Messung.** Zuerst ein Bild von `start`, `stadt-luft` und `pass` mit der Frage,
ob eine Kante sichtbar ist. Ist sie es nicht, entfällt die Aufgabe — und dann
gehört das hier notiert, nicht stillschweigend gestrichen.

---

**8.11 — Abnahme und Neumessung**

**Befund vorab, damit er nicht vergessen wird:** 8.5 ändert das Höhenfeld. Damit
sind **alle** Zahlen aus P1, P3, P4, P5 und P6, die vom Gelände abhängen,
ungültig — Straßenlängen, Kehren, Erdbau, Vegetationsinstanzen, Verschattung,
Prop-Höhen, Draw-Calls. Das ist kein Nebeneffekt, sondern der bekannte Preis
dieses Durchgangs, und er steht in der P1-Nachbesserung bereits so.

**Fix.** Ein vollständiger Messdurchgang:
- `npm run world` zweimal, `roads.json` und `height.r16` bitgleich
- `npm run inspect` — alle fünf Strecken bestanden
- `npm run typecheck`, `npm run build`
- Alle Blickpunkte × alle fünf Stufen als Bild, mit `probe()` davor — der
  Anteil nicht-schwarzer Pixel muss bei einer Szene mit Himmel **1,000** sein.
  Das ist die Zeile aus CLAUDE.md, die den Viewport-Fehler in einem Schritt
  gefunden hätte.
- Nachziehen der Zahlen in PLAN.md, SPEC.md und den `*.config.ts`-Kommentaren.
  Wo eine Zahl nicht neu abgelesen wurde, gehört „nicht neu abgelesen"
  dazugeschrieben.

---

### Akzeptanzkriterien

- [ ] **Die fünf Stufen unterscheiden sich in der Geländelast.** Dreiecke je
      Stufe gemessen, Verhältnis Minimal:Ultra ≤ 0,4 — und die Lochzählung
      bleibt bei allen fünf bei höchstens 1.

      **Erfüllt.** Blickpunkt `stadt-neon`, Streuung bis zur Stabilität
      vorgefüllt; Lochzählung über zehn Blickpunkte:

      | Stufe | Gitter | Dreiecke gesamt | davon Gelände | Knoten | Löcher |
      |---|---|---|---|---|---|
      | Ultra   | 33² | 605 486 | 264 192 | 129 | 0 |
      | Hoch    | 33² | 605 487 | 264 192 | 129 | 0 |
      | Mittel  | 25² | 212 763 | 148 608 | 129 | 0 |
      | Niedrig | 17² | 130 191 |  66 048 | 129 | 0 |
      | Minimal | 17² | 130 182 |  66 048 | 129 | 0 |

      Minimal:Ultra ist **0,215** gesamt und **0,25** im Gelände — beides unter
      der geforderten 0,4. Die Lochzählung meldet auf allen fünf Stufen null,
      gegengeprüft mit absichtlich falschem Morph, der 1496 Löcher erzeugt.
      Vorher standen Mittel und Niedrig bei 329 823 gegen 329 118 Dreiecke,
      unterschieden sich also um nichts.

      > Minimal und Niedrig trennen an *diesem* Blickpunkt fast nur Kette und
      > Puffer: in einer Geschäftsstraße steht kaum Bewuchs, den die niedrigere
      > Sichtweite und Dichte wegnehmen könnten. An `start` oder `reisfeld`
      > **nicht neu abgelesen.**
- [x] **Stufe „Minimal" umgeht die PostFX-Kette nachweislich.** Gemessen an der
      Zahl der Vollbilddurchgänge, nicht an der Bildrate: **1 gegen 28** auf
      Ultra, gezählt als Draw-Calls bei leerer Szene. Der Zeichenpuffer geht
      dabei von 921 600 auf 230 400 Pixel.
- [ ] **Die Ersteinstufung startet nicht auf Ultra**, wenn die Vorabschätzung ein
      schwaches Gerät meldet — auf dieser Maschine also bei „Minimal".
- [ ] **Wolkenschatten wandern über das Gelände**, gemessen mit Maske gegen ein
      Bild ohne sie, nicht über das ganze Bild gemittelt.
- [ ] **Der Bergpass hat ≥ 8 Kehren** (SPEC §2.1) **und** der Erdbau liegt unter
      dem Stand, der P3 zum Kompromiss gezwungen hat. Beide Zahlen zusammen.
- [ ] **Ein Fluss läuft vom Massiv bis ins Meer**, monoton fallend, mit
      mindestens einem Wasserfall, und die Reisterrassen liegen daran.
- [ ] **Die Stadtkante ist im Bild nicht mehr als Kante lesbar** —
      Vorher/Nachher von `stadt-fern`, plus das Helligkeitsverhältnis nach der
      P6-Maskenmessung. `cityDrawCalls` weiterhin < 300.
- [ ] **Fischerdorf und Sandō stehen und sind erreichbar** — je ein Bild aus
      Augenhöhe, und ein Pfad führt hin.
- [ ] **Alle Budgets aus SPEC §4 weiterhin eingehalten**, auf Ultra gemessen.
- [ ] **Kette reproduzierbar:** `npm run world` zweimal bitgleich.

### Risiken

- **8.1 kann an einer falschen Herleitung hängen.** Die Behauptung, die
  Gitterauflösung sei von der Rissbedingung unabhängig, ist hergeleitet und nicht
  gemessen. → Die Lochzählung entscheidet, nicht das Argument. Zeigt sie Risse,
  fällt der Hebel ersatzlos weg und „Minimal" trägt sich allein über Auflösung
  und Vegetation. **Kein Nachregeln an `morphStart`**, um die Zahl zu retten —
  das ist die Regelschleife, die dieses Projekt zweimal ersatzlos entfernt hat.
- **8.5 ist ein Eingriff mit Fernwirkung, und das ist belegt.** Ein einziger
  Geländeparameter hat in P5 über eine Kehre entschieden. → Nach jedem
  Teilschritt `npm run world` **ganz** ansehen, nicht nur die Zone, um die es
  geht. Und: `.cache/clean.r16` vorher erneuern, sonst zeigt die Erdbau-Karte
  gegen ein veraltetes Referenzfeld.
- **Die flachere Flanke kostet Silhouette.** Das Massiv ist der Hintergrund der
  halben Karte. → Bild vor Zahl: wenn `start`, `kueste` und `reisfeld` danach
  flach aussehen, ist der Fix gescheitert, auch bei 8 Kehren.
- **Der Fluss kann die Straßentrassierung verschieben.** Er ändert die
  Kostenfläche, auf der der Generator sucht — genauso wie die Reisfeldschwelle
  es tat. → Kehren und Radien aller fünf Strecken nach dem Bake neu messen, nicht
  nur die des Passes.
- **Neue Inhalte kosten Startdownload.** P7 steht bei 42,68 MB gegen ein Budget
  von 15. Jedes Prop-Mesh ist prozedural und kostet null Bytes, jede neue Textur
  nicht. → Wasserfall und Wolken über prozedurales Rauschen statt über
  Texturdateien, wo es geht. Wo nicht, gehört der Zuwachs beziffert.
- **Der Umfang ist groß genug, um zu verwässern.** Elf Aufgaben, davon eine mit
  vollständiger Neumessung. → 8.1–8.4 sind vom Gelände unabhängig und einzeln
  abnehmbar; wenn die Phase gekürzt werden muss, wird hinten gekürzt, nicht die
  Messung.

---

## Was bewusst NICHT in diesem Plan steht

Diese Punkte sind Spielentwicklung, nicht Kartenbau. Sie kommen nach P8 und
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
| ~~1~~ | ~~SSR oder planare Reflexion + Probes~~ | ~~P6~~ | **Entschieden: B + C.** Nicht nach Tuning-Tagen, sondern gemessen — gegen die Neonschilder sind nur 19,3 % der Spiegelungen im Bildschirmraum überhaupt vorhanden, am wichtigsten Standpunkt 4,2 %. Siehe P6, „Die Reflexions-Entscheidung" |
| ~~2~~ | ~~Kreuzungen prozedural oder handmodelliert~~ | ~~P3~~ | **Entschieden:** prozedural im Generator — Einrasten in XZ, Höhe festnageln, Rücksprung statt Verschneidung |
| 3 | Physik-Engine | nach P7 | Rapier (WASM, bewährt) |
| 4 | Imposter-Baking headless oder in-app | P4 | In-app, falls headless zickt |
| ~~5~~ | ~~Carving vor oder nach der Erosion~~ | ~~P3~~ | **Entschieden:** nachher. Die Erosionsrinnen laufen dadurch bis an die Böschung heran, statt überschrieben zu werden |
