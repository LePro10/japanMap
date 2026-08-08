# japanMap — Aufbau

Diese Datei beantwortet **wo etwas steht und was mit was redet**. Sie ist die
Übersicht, die es bis zum 2026-08-08 nicht gab: die Begründungen stehen
ausführlich in den Dateien selbst, aber wer neu dazukommt, musste sich die Karte
aus 126 Quelldateien selbst zeichnen.

Abgrenzung zu den anderen Dokumenten — bei Widersprüchen gilt jeweils die
speziellere Quelle:

| Datei | beantwortet | gilt bei Widerspruch |
|---|---|---|
| [SPEC.md](SPEC.md) | **was** gebaut wird und warum so | — |
| [PLAN.md](PLAN.md) | **in welcher Reihenfolge**, und woran man Fertigkeit erkennt | vor SPEC |
| [CLAUDE.md](CLAUDE.md) | **wie** hier gearbeitet und gemessen wird | — |
| ARCHITECTURE.md | **wo** etwas steht und **was mit was redet** | die Quelldatei |

> **Zahlen in dieser Datei stammen aus Läufen** und tragen ihr Datum. Wo eine
> Zahl nicht frisch ist, steht das dabei — dieselbe Regel wie überall sonst hier.

---

## 1. Die zwei Hälften: Werkzeuge und Renderer

Das Projekt zerfällt in zwei Programme, die sich nur über Dateien kennen.

```
 tools/*.mjs                assets/generated/            src/**
 reines Node-ESM      →     erzeugte Daten         →     Browser, TypeScript
 kein three-Rendering       nie eingecheckt              lädt nur, erzeugt nichts
```

**Alles unter `assets/generated/` ist erzeugt** und steht in `.gitignore`. Es
entsteht aus Seed und Werkzeugen mit `npm run world` und ist bitgleich
reproduzierbar. Von Hand editiert wird dort nie.

Die Kette ist **zirkulär und wird durch zweimaliges Backen aufgelöst** — der
Straßengenerator braucht ein Höhenfeld, der Baker braucht die Straßen. Warum
`npm run roads` allein keine gültige Messung ist, steht in CLAUDE.md unter „Der
Bake-Kreislauf"; `meta.json` führt seit P3 ein `carved`-Flag und der Generator
verweigert in diesem Fall den Dienst.

```
npm run world
 └─ bake:clean → sun → roads → bake → shade        (~40 s)
```

| Werkzeug | erzeugt |
|---|---|
| `tools/bake-terrain.mjs` | `height.r16` (2048², 16 bit), `zones.png`, `normal.png`, `meta.json` |
| `tools/hdri-sun.mjs` | Sonnenstand aus dem Himmels-HDRI |
| `tools/gen-roads.mjs` | `roads.json` — Kontrollpunkte **und** abgetastete Mittellinie |
| `tools/bake-shadows.mjs` | `shade.png` (Horizontwinkel, Verdeckerentfernung, Himmelssicht) |
| `tools/gen-props.mjs` | `assets/props.json` |
| `tools/process-assets.mjs` | `assets/generated/models/*.glb` aus `assets/source/models` |
| `tools/inspect-map.mjs` | Prüfbericht + Schummerung als PNG, **erzeugt nichts für die Laufzeit** |

**Geteilte Mathematik lebt in `.mjs` mit Typen daneben.** Kurvenauswertung
brauchen Werkzeug *und* Renderer, und zwei Implementierungen wären zwei Kurven:
`src/world/roads/splineSampler.mjs` plus `.d.mts`. Dasselbe Muster für
`src/config/city.mjs` und `src/config/palette.mjs`.

---

## 2. Der Kern: Engine, Systeme, Bus

`src/core/` kennt **kein** einziges Weltsystem. Die Abhängigkeit läuft nur in
eine Richtung.

```
Engine
 ├── renderer, scene, camera          (three)
 ├── bus: EventBus<AppEvents>         → src/core/events.ts
 ├── resources: ResourceManager       → Ladefortschritt, Texturbuchhaltung
 ├── loop: RenderLoop                 → beginFrame / fixedUpdate / update / render
 └── #systems: System[]               → in Registrierreihenfolge
```

Ein **System** ist die einzige Erweiterungsstelle (`src/core/System.ts`):

```ts
interface System {
  readonly name: string;
  init?(context: EngineContext): void | Promise<void>;
  fixedUpdate?(dt: number): void;
  update?(dt: number, alpha: number): void;
  resize?(width: number, height: number): void;
  dispose(): void;                    // Pflicht — gibt GPU-Ressourcen frei
}
```

`dispose()` ist nicht optional. Das Akzeptanzkriterium aus P0 lautet, dass
`japanMap.engine.dispose()` alles freigibt; `Engine.dispose()` räumt **rückwärts**
ab, weil ein spät hinzugefügtes System von einem frühen abhängen kann.

### Die Reihenfolge ist dreifach bedeutsam

Sie steht als Kommentarblock in `boot()` (`src/main.ts`) und ist keine
Geschmacksfrage:

1. **`init()` läuft nacheinander.** `terrain:ready` wird *während* der
   Initialisierung des TerrainSystems gesendet — wer den Sampler will, muss
   vorher registriert sein.
2. **Der Atmosphärenblock wird beim Konstruieren weitergereicht**, nicht per
   Ereignis: Terrain und Wasser brauchen ihn schon beim Bauen ihrer Materialien.
3. **`update()` läuft in derselben Reihenfolge.** Die Kamera bewegt sich zuerst,
   danach richten Sonne, Wasserebene und Bodenmarkierung sich daran aus.

Daraus folgt die tatsächliche Registrierreihenfolge:

```
FreeFlyController → AtmosphereSystem → LightingRig → WaterSystem
  → ScatterSystem  ┐ vor Terrain und Straßen: hören auf terrain:ready / roads:ready
  → PropSystem     │
  → RicePaddy      │
  → CitySystem     ┘
  → NeonSystem       (hört auf city:ready, vorher nichts zu tun)
  → TerrainSystem    sendet terrain:ready
  → RoadSystem       sendet roads:ready
  → PlanarReflection nach allem, was Geometrie einbringt, vor PostFX
  → PostFXPipeline   setzt den Presenter
  → LookController   zuletzt: look:apply erreicht nur Angemeldete
  → QualitySystem    danach: sendet die Stufe genau einmal beim Start
```

### Der Ereignisvertrag

Alle Ereignisse stehen an **einer** Stelle (`src/core/events.ts`), damit die
Typprüfung zeigt, wer sendet und wer hört. Die wichtigsten:

| Ereignis | trägt | Reihenfolge kritisch? |
|---|---|---|
| `terrain:ready` | `TerrainSampler`, Höhen-Uniforms | **ja** — genau einmal, während `init()` |
| `roads:ready` | `RoadNetwork`, Belagsmaterial | **ja** — dito |
| `props:ready` | `PropClearance` | **ja** — dito |
| `city:ready` | Schilder-Anker, Stadt-Uniforms | nein — Neon baut erst darauf hin |
| `engine:warmedup` | — | wer die Programmzahl **senkt**, wartet darauf |
| `quality:changed` | Stufe | jedes System wendet seinen Anteil selbst an |
| `look:apply` / `look:collect` | `LookState` | Controller kennt kein System |
| `engine:loading` | Schritt/Gesamt/Beschriftung | Balken des Ladebildschirms |

**Warum die Systeme sich über den Bus finden und nicht über Importe:** die
Streuung braucht `distanceToNearestRoad()` je Pflanze, soll aber das RoadSystem
nicht kennen. Dasselbe für Sampler, Freihaltekreise und Stadt-Uniforms. Der Preis
ist die Reihenfolgenbedingung oben, der Gewinn ist, dass jedes System einzeln
entfernbar bleibt.

**`look:collect` läuft rückwärts:** der Sender legt ein vorbefülltes Objekt bei,
jedes System überschreibt **nur seinen eigenen Abschnitt**. So bringt ein neues
System seinen Look-Anteil selbst mit.

---

## 3. Die Welt

```
src/world/
├── TerrainSystem      CDLOD-Quadtree, Vertex-Morphing        → ChunkManager, HeightPyramid
├── TerrainSampler     Höhenabfrage auf der CPU               ← die zweite Höhenquelle, siehe §5
├── RoadSystem         Mesh, Decals, Leitplanken              → RoadNetwork (Abfragen)
├── WaterSystem        Meer + Fluss
├── scatter/           Vegetation: Worker, Chunks, LOD, Imposter
├── props/             Landmarks, Reisfelder, Freihaltekreise
├── city/              Generator, Blöcke, Neon
└── materials/         alle Materialien, alle mit `declaredTextures`
```

### Vegetation — der aufwändigste Teilbaum

```
ScatterSystem
 ├── ScatterWorkerClient ─── Worker ─── scatterChunk()   Platzierung, deterministisch
 ├── InstancedLOD × Art      3 Stufen: volles Mesh / reduziert / Imposter
 ├── ImposterAtlas × Art     oktaedrischer 8×8-Atlas, zur Laufzeit gebacken
 ├── GroundAoDecals          ein Draw-Call für alle Arten
 └── ZoneMap                 Splat-Gewichte aus zones.png
```

Drei Eigenschaften, die man kennen muss, bevor man hier etwas anfasst:

- **Nichts wird gespeichert.** Ein Chunk entsteht aus Seed und Chunk-Koordinate;
  „zweimal laden = identische Platzierung" ist keine geprüfte Eigenschaft,
  sondern eine, die nicht anders sein kann. Der Cache darf jederzeit fallen.
- **Der Durchlauf ist eine Zeitscheibe.** Sichtbare Chunks werden am Anfang
  eingesammelt, über mehrere Frames abgearbeitet und erst am Ende gemeinsam
  sichtbar gemacht (`SCATTER.chunksPerFrame`).
- **`streaming` fragt die Arbeit, nicht das Ergebnis.** Wer auf „fertig geladen"
  warten will, fragt `ScatterSystem.streaming` — eine unveränderte Instanzzahl
  ist *kein* Beweis, weil „unverändert bei null" genauso aussieht wie „fertig".
  Das hat P10.0 gelernt, siehe PLAN.md.

### Die Straßen sind das wichtigste Datenmodell

`roads.json` wird **dreifach** genutzt (SPEC §2.3): sichtbare Geometrie,
Terrain-Carving beim Bake, und Gameplay-Daten. Deshalb steht dort neben den
Kontrollpunkten die **fertig abgetastete Mittellinie** — Baker und Renderer
dürfen die Kurve nicht beide auswerten, sonst liegt die eingeschnittene Rinne
neben dem Mesh.

`RoadNetwork` ist die Abfrageseite und zugleich die **Übergabefläche zum Spiel**
(gemessen in P8.11):

| Methode | Stand |
|---|---|
| `getHeightAt(x, z)` (via `TerrainSampler`) | da |
| `getRacingLine(id)` | da — `ring` 3048 Punkte, `toge` 1245 |
| `getSpawnPoints()` | da — 4 Punkte, alle auf der Fahrbahn, ≤ 3 cm über Grund |
| `getSectors(id, n)` | da seit P8.11 — Tor aus Punkt, Richtung, halber Breite |
| `isOnRoad` / `distanceToNearestRoad` | da, gitterbeschleunigt |

**Niemand ruft sie auf.** Das ist der Ausgangspunkt von P9.

---

## 4. Der Renderweg

```
Systeme zeichnen in scene
        ↓
PlanarReflection   zeichnet die Szene ein zweites Mal (nur wenn Stufe ≥ Hoch)
        ↓
Engine.#present    ← von PostFXPipeline gesetzt
        ↓
EffectPass(Bloom, AgX, LUT, Vignette) → EffectPass(SMAA) → Canvas
```

Vier Dinge, an denen dieses Projekt sich schon geschnitten hat:

1. **SMAA steht allein im zweiten Pass.** Zusammengebündelt bekäme es den
   *Eingangspuffer*, also HDR-Werte — Kantenglättung vor dem Tonemapping
   funktioniert nicht.
2. **Wer einen Pass abschaltet, muss wissen, wer danach auf den Bildschirm
   zeichnet.** `postprocessing` setzt `renderToScreen` genau einmal, auf den
   letzten Pass **im Array**. SMAA abzuschalten nahm der Kette ihren einzigen
   Ausgang, und das fertige Bild landete im Zwischenpuffer (P8.2).
3. **Stufe „Minimal" ist kein Regler, sondern ein anderer Renderpfad.** Der
   Composer wird umgangen, das Tonemapping übernimmt der Renderer. Gemessen
   kostet der Wechsel dorthin **17 zusätzliche Shader-Übersetzungen** (31→50
   Programme, `live`-Lauf 2026-08-07) — für einen Stufenregler im Spiel
   relevant.
4. **Der Aufwärmframe läuft auf der höchsten Stufe**, danach wird
   heruntergeschaltet. Eine niedrige Stufe braucht *weniger* Programme; wer auf
   ihr aufwärmt, bekommt die fehlenden später als Ruckler.

`renderer.compile()` wird **nicht** benutzt — nachgemessen erzeugt es 20
Varianten, die nie gezeichnet werden, und die 30 echten entstehen trotzdem.
Stattdessen ein vollständiger Frame durch dieselbe Kette mit abgeschaltetem
Frustum-Culling (`Engine.#precompile`).

---

## 5. Die zwei Höhenquellen — der wichtigste Fallstrick

Es gibt **zwei** Antworten auf „wie hoch ist das Gelände hier", und sie sind
nicht identisch:

| | `TerrainSampler.getHeightAt(x, z)` | das gerenderte CDLOD-Gitter |
|---|---|---|
| wo | CPU, bilinear aus `height.r16` | GPU, Auslenkung im Vertex-Shader |
| Genauigkeit | exakt am Texel | **Sehne** zwischen zwei Stützstellen |
| aus einem Skript messbar | ja | **nein** — die CPU-Geometrie ist das flache Einheitsgitter |

Zwischen zwei Gitterpunkten liegt eine Gerade über der Kurve. Das hat bereits
dreimal Zeit gekostet:

- Die **Stadtplatte** lag 3 cm über dem Höhenfeld — sauber aus 14 641 Proben
  gerechnet — und trotzdem unter dem *gerenderten* Gelände.
- Die **Uferlinie** steht als Treppe im Bild; der Wasser-Shader rechnet seine
  Tiefe gegen das Feld, während im Bild die Sehne steht. Offen, siehe PLAN.md.
- Die **Bodenverdeckungs-Flecken** brauchen deshalb `GROUND_AO.lift`.

**Regel:** Wer etwas auf das Gelände setzt, benutzt den Sampler *und* einen
Versatz. Wer prüft, ob es richtig liegt, muss das **gerenderte** Gitter meinen —
und das geht nur am Bild, nicht im Skript. Für P9 ist entschieden: das Fahrzeug
fährt auf dem Sampler, das Gitter ist die Näherung.

---

## 6. Qualitätsstufen — wer was liest

`QualitySystem` hält den Zustand und sendet `quality:changed`. **Jedes System
wendet seinen Anteil selbst an**; die Engine kennt die Tabelle nur für den
Pixelfaktor.

| Feld | wer liest es | Wirkung |
|---|---|---|
| `renderScale` | `Engine` | Größe des Zeichenpuffers |
| `terrainGridVertices` | `TerrainSystem` | Stützstellen je Knoten — der einzige Hebel an der Geländelast |
| `vegetationRange` | `ScatterSystem` | Faktor auf die Ferngrenze je Art (ab P10.1) |
| `lodBias` | `ScatterSystem` | Faktor auf die inneren LOD-Grenzen (ab P10.1) |
| `vegetationDensity` | `ScatterSystem` → Worker | Annahmequote der Streuung |
| `reflections` | `PlanarReflection` | zweiter Szenendurchgang an/aus |
| `ao`, `postFx` | `PostFXPipeline` | Kette und ihre Stufen |
| `shadowMapSize` | — | **wirkt nur im Vergleichsfall**, Echtzeitschatten sind seit P2 aus |

Zwei Regeln, die hier teuer erkauft sind:

- **`terrainGridVertices` darf nur Werte aus `GRID_VERTICES_ALLOWED` annehmen.**
  Den LOD-Baum stattdessen gröber zu stellen verletzt die Rissfreiheit — P4 hat
  den freien Fall mit **207 Löchern gegen 1** gemessen.
- **Die Instanzpuffer entstehen einmal beim Start**, die LOD-Grenzen hängen
  seitdem an der Stufe. Deshalb werden sie über den ungünstigsten Fall bemessen
  (`LOD_BIAS_MIN`) — sonst verwirft `InstancedLOD.push()` stillschweigend.

---

## 7. Was nur im Dev-Build existiert

Der Unterschied ist groß und für die UX entscheidend (siehe PLAN.md P10.2):

| | Dev (`npm run dev`) | Build (`npm run preview`) |
|---|---|---|
| Debug-Panel `F1`, Overlay | ja | **nein** |
| `window.japanMap.*` | ja | **nein** |
| Blickpunkte, `shot()`, `report()` | ja | **nein** |
| Editoren (Straßen, Props) | ja | **nein** |
| `SceneScaffold` (1056 Linien) | ja | **nein** |
| Endpunkte `/__shot`, `/__report` | ja (Vite-Plugin) | **nein** |
| Benutzeroberfläche | — | **es gibt keine** |

Beide Zweige hängen an `import.meta.env.DEV` und werden im Build
wegoptimiert — geprüft am 2026-08-07: `anteilNichtSchwarz` aus `debug/capture.ts`
kommt in `dist/assets/index-*.js` **null**mal vor.

**Der Messlauf** `japanMap.report()` ist das Werkzeug, mit dem dieses Projekt auf
fremder Hardware misst, weil die Entwicklungsmaschine keine GPU-Zeit liefert.
Zwei Betriebsarten, Einzelheiten in CLAUDE.md.

---

## 8. Wo neue Arbeit hingehört

| Vorhaben | Ort | Vorher lesen |
|---|---|---|
| Neues Weltsystem | `src/world/`, in `boot()` an der richtigen Stelle registrieren | §2, Reihenfolge |
| Neuer Regler am Bild | `LookState` + `look:apply`/`look:collect` | §2 |
| Neuer Regler an der Leistung | `quality.config.ts`, Leser trägt ihn selbst ein | §6 |
| Etwas auf dem Gelände platzieren | `TerrainSampler` + Versatz | **§5** |
| Fahrzeug, Kollision, Rundenlogik | neu `src/game/` | §3 Straßen, **§5** |
| Spieler-Oberfläche | `src/ui/`, **ohne** `import.meta.env.DEV` | §7 |
| Magische Zahl | `src/config/` — nie im Code | CLAUDE.md |
| Shader | `.glsl`-Datei, nie als Template-String | CLAUDE.md |

**Und die Regel, die über allem steht:** was nicht gemessen wurde, gilt als
nicht erledigt. Wie hier gemessen wird, steht in [CLAUDE.md](CLAUDE.md).
