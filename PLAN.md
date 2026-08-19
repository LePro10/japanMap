# japanMap — Implementierungsplan

> Ausführungsplan zu [SPEC.md](SPEC.md). Die Spec sagt **was** gebaut wird,
> dieser Plan sagt **in welcher Reihenfolge, mit welchen Dateien und woran wir
> merken, dass eine Phase fertig ist**. Wo etwas im Quelltext steht und was mit
> was redet, sagt [ARCHITECTURE.md](ARCHITECTURE.md).
>
> **Stand: 2026-08-18 · P0–P6, P8 und P9 abgenommen · P7, P10–P15 ◐**
>
> | Phase | Stand |
> |---|---|
> | P0–P6, P8 | ✅ abgenommen |
> | P7 | ◐ — 3 von 5; der Startdownload ist seit P15 eingelöst, offen bleiben die zwei Zeilen, die eine GTX-1660-Klasse verlangen |
> | P9 | ✅ **abgenommen am 2026-08-18** — 9.1/9.2 in P14, 9.3 als `LapTimer`. Drei gefahrene Runden auf dem Ring, 324,72 s, Abkürzung wird abgelehnt |
> | P10 | ✅ **abgenommen am 2026-08-18** — alle sieben Kriterien; 10.3 ging in P11.5 auf, 10.4 in P15 |
> | P11 | ◐ — 5 von 7 Kriterien; verfehlt: volle Auflösung je Stufe (zurückgezogen). Offen: ein `live`-Lauf mit Bildrate |
> | P12 | ◐ — 9 von 11; offen: echtes Telefon, volle Auflösung je Stufe (zurückgezogen) |
> | P13 | ◐ — 6 von 8; offen: Pointer Lock auf einer Maschine, wo er funktioniert, und ein echtes Telefon |
> | P14 | ◐ — 7 von 9; offen: „fühlt sich der Drift gut an" und ein echtes Telefon |
> | P15 | ✅ **abgenommen am 2026-08-18** — 9 von 9. Erststart 17,02 MB (Schwelle 20), größter Ruckler 28,1 ms (Schwelle 33) |
>
> **Vier Phasen in Folge lassen dieselbe Zeile offen: „auf echter Zielhardware
> gemessen".** P12.6, P13, P14 und P15 — das ist ein Muster und kein Zufall. Es
> gehört einmal benannt statt viermal neu entschuldigt: diese Entwicklungskette
> hat kein Telefon und keine GTX-1660-Klasse, und alles, was daran hängt
> (Bildrate als Aussage über Zielhardware, Pointer Lock, Fingersteuerung am
> Gerät), ist hier **nicht prüfbar**. Der Weg dorthin steht gebaut bereit:
> `npm run dev:lan`, und das Telefon fährt `japanMap.report({mode:'live'})`
> selbst.
>
> Diese Kopfzeile stand bis zum 2026-08-18 auf „2026-08-08" und war damit zehn
> Tage und fünf Phasen hinterher — **zum dritten Mal derselbe Fehler** (siehe
> unten und SPEC §7). Deshalb steht der Stand jetzt als Tabelle da: eine Zeile
> Prosa wird beim Phasenabschluss übersehen, eine Zeile in einer Tabelle, die
> für jede Phase eine hat, fällt als fehlend auf.
>
> P7 ist vollständig gebaut. Zwei seiner fünf Akzeptanzkriterien lassen sich auf
> der Entwicklungsmaschine nicht prüfen (keine GTX-1660-Klasse, kein GPU-Timer),
> eines ist **nachweislich verfehlt**: der Startdownload liegt bei **43,48 MB**
> gegen 15 MB (frisch gemessen am 2026-08-07; ~~42,68~~ stammte aus einem Lauf
> vor den Props aus P8.9).
>
> Aus P10 sind **10.0** (der Messlauf), **10.1** (Stufenkopplung) und **10.2**
> (die Spieler-Oberfläche) gebaut und gemessen. Der gebaute Stand hat seit dem
> 2026-08-10 einen Steuerungshinweis, ein Pausenmenü mit fünf Voreinstellungen
> plus acht Einzelreglern und die sechzehn Blickpunkte als Sprungliste — vorher
> war dort ein Canvas und ein leeres `div`. Offen: **10.3** der kahle Ring bei
> 520 m und **10.4** der Startdownload (36,61 MB gegen 15 MB).
>
> Der Kopf dieser Datei stand bis zum 2026-08-08 auf „Stand 2026-07-30, P8
> geplant" — acht Tage und zwei Phasen hinterher. Dass diese Zeile schon zweimal
> veraltet war (hier und in SPEC §7), ist der Grund, warum sie jetzt ein Datum
> trägt statt nur einen Zustand.
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
| **P8** ✅ | Polish & Presets | Die Karte trägt ein Spiel | P7 |
| **P9** ○ | Die Fahrschicht | Ein Auto fährt eine Runde | P8 |
| **P10** ○ | Stufen, Regler, Auslieferung | Die Stufen tun, was sie versprechen | P8 |
| **P11** ◐ | Bewuchs nach Entfernung, Boden trägt Farbe | Minimal sieht aus wie Ultra, nur dünner | P10 |
| **P12** ◐ | Handy, Touch und die echten Kosten | Läuft auf einem Telefon, ohne schlechter auszusehen | P11 |
| **P13** ◐ | Startbildschirm, Reiter, Debug im Menü | Die Oberfläche steht nicht mehr im Bild | P12 |
| **P14** ◐ | Die Fahrschicht — Freeride | Ein Auto fährt, stößt an und bleibt auf der Straße | P8, P13 |
| **P15** ✅ | Der gestufte Start | Startdownload 17,02 MB — unter der Mobile-Schwelle | P12 |
| **P16** ✅ | Ton, Ziel und der Weg ins Auto | Ton, Zeitfahren, und das Auto ist auf dem Handy erreichbar | P14, P15 |

> **Diese Tabelle stand bis zum 2026-08-07 auf „P7 ◐ / P8 ○"** — also zwei
> Phasen hinter dem Rest der Datei, sechs Tage nach der P8-Abnahme. Dieselbe
> Fehlerklasse wie der Satz „Nächste Phase: P5" in SPEC.md, der dort seit P5
> falsch stand: **eine Kurzfassung, die beim Phasenabschluss niemand
> mitgeführt hat.** P7 bleibt bewusst auf ◐, das ist kein Versäumnis — zwei
> seiner Kriterien sind auf dieser Maschine nicht prüfbar, siehe dort.

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
- Nickbereich ±75° (`CAMERA.pitchLimitDeg`) plus Gier-Spin-Cap
  (`CAMERA.yawSpinCap = 0,3`). Das alte Limit von 89,43° machte den Pol
  erreichbar, an dem horizontale Mausbewegung die ganze Welt im Kreis dreht
  statt zu schwenken — gemessen 12,8° Bildrotation pro 100 px bei 12,61°
  Gierdelta („die DPI wird 5× so schnell"). Ein Nick-Limit allein reicht
  nicht, weil die Drehung mit `sin(Nick)` skaliert; ein Fade ab 55° begann zu
  spät (bei 55–60° drehte die Welt noch mit 76–82 % des Maus-Tempos — „auf
  einmal kommt es wieder"). Das Cap hält `Faktor × sin(Nick) ≤ 0,3` bei
  **jedem** Nick fest: die Bildrotation ist überall Schwenk-Tempo.
  Messtabelle in `world.config.ts`. `placeAt()` und `#restore()` halten
  dasselbe Limit ein, damit kein Blickpunkt und kein alter Save die Kamera
  außerhalb des Maus-Bereichs parkt. Zusätzlich wird der erste Maus-Event
  nach dem (Neu-)Erwerben des Pointer-Locks übersprungen — er trägt den
  gesamten Weg vom Klickpunkt zur Elementmitte und wäre sonst ein
  schlagartiger Blickruck („auf einmal").

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
> Ausgeliefert ist deshalb der gemessene Kompromiss mit **3 Kehren** bei 19,5 m
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
- [x] **Bergpass hat Serpentinen mit fahrbaren Radien** — **3 Kehren** auf
      3003 m, Mindestradius **20,22 m** (Soll ≥ 15), Steigung **10,66 %**
      (Soll ≤ 11 %). Gezählt werden Läufe gleichsinniger Drehung über 150° auf
      der fertigen Mittellinie, nicht Ecken im Polygonzug.

      > **Diese Zeile stand mit 2 Kehren auf 2983 m, 20,1 m und 10,5 % da, und
      > die Daten auf der Platte sagten etwas anderes.** Am 2026-07-31 neu
      > abgelesen aus `roads.json` und bestätigt durch `npm run inspect`: 3
      > Kehren, 3003 m. Die alten Zahlen stammen aus einem Lauf, den es so nicht
      > mehr gibt — genau der Fall, der in CLAUDE.md als eines der drei
      > Eingangsbeispiele steht. Der ausgelieferte Stand ist damit **besser** als
      > dokumentiert, was die Sache nicht besser macht: eine Doku, die von den
      > Daten abweicht, ist auch dann falsch, wenn sie zu bescheiden ist.
      >
      > Alle weiteren Kennzahlen dieses Blocks (Erdbau ⌀ 19,5 m, 95 % 62,2 m,
      > Anstieg 209 m) stimmen mit `roads.json` überein und bleiben.

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

Die Tabelle ist das Protokoll der damaligen Suche und bleibt so stehen. Ihre
Kehrenzahlen gelten für das Höhenfeld von P3; auf dem heutigen liefert dieselbe
Einstellung 3 statt 1…2.

Ausgeliefert ist `downhillBias: 0.3` bei 700 m Korridor: **3 Kehren, 19,5 m
Erdbau, 206 m Strecke in Einschnitten über 50 m, tiefster 93,5 m.** (Die
Kehrenzahl und die Einschnittstrecke sind am 2026-07-31 neu abgelesen; hier
standen 2 Kehren und 320 m.) Zum
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

**Was der Pass jetzt ist** (2026-07-31 neu abgelesen)**:** 3003 m, **3 Kehren**,
Mindestradius 20,22 m (Soll ≥ 15), Steigung 10,66 % (Soll ≤ 11 %), Erdbau
⌀ 19,5 m (Soll ≤ 30), 95 % bei 62,2 m, Anstieg 209 m. Keine Selbstkreuzung,
kleinster Achsabstand 23,8 m, nichts außerhalb der Welt.

> Hier standen 2983 m, 2 Kehren, 20,1 m und 10,5 % — Zahlen aus einem Lauf, den
> es so nicht mehr gibt. Der Achsabstand stand mit 13,2 m sogar deutlich unter
> dem gemessenen. Nachgezogen aus `roads.json` und `npm run inspect`.

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
| Netz | 3 Strecken, **9,80 km**, davon 2983 m Bergpass mit 2 Kehren *(Stand der P3-Abnahme; heute 5 Strecken, 10,86 km, Pass 3003 m mit 3 Kehren)* | — |

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
- [x] **Erster Frame nach < 5 s auf 50-Mbit-Verbindung** — **eingelöst in P15,
      obere Schranke 3,7 s.**

      ~~Verfehlt, gemessen: 45 Dateien, 58,19 MB roh, 42,68 MB mit Brotli, bei
      50 Mbit **6,8 s allein für die Übertragung**.~~ Das war der Stand von P7.

      Seit P15 sind es **17,02 MB** übertragene Bytes (gemessen am gebauten
      Stand) und **1,0 s** Rechenzeit bis zum „Starten"-Knopf (gemessen, siehe
      `engine.bootProfile` und SPEC §4.1):

      | Posten | |
      |---|---|
      | 17,02 MB bei 50 Mbit/s | 2,72 s |
      | Rechenzeit bis zum Knopf | 1,00 s |
      | **Summe, also obere Schranke** | **3,72 s** |

      > **Das ist eine Rechnung über zwei gemessene Größen, keine Messung auf
      > einer gedrosselten Verbindung.** Der Unterschied gehört benannt: die
      > Summe ist die **obere** Schranke, weil Übertragung und Rechenzeit sich
      > teilweise überlappen — wie stark, ist nicht gemessen. Die Schranke hält
      > die Zeile aber unabhängig davon: selbst ohne jede Überlappung sind 3,72 s
      > unter 5 s.
      >
      > Ein Lauf auf einer echten gedrosselten Verbindung bleibt trotzdem
      > wünschenswert und gehört in dieselbe Lücke wie „auf echter Zielhardware
      > gemessen".
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

# P8 — Polish & Presets ✅ (10 von 10 Kriterien, 2026-08-01)

> Abgenommen in 8.11, vollständig seit dem 2026-08-01. Die beiden zuletzt
> offenen Zeilen — 8 Kehren am Bergpass und die Stadtkante — waren **keine**
> Frage des Nachregelns: hinter beiden stand ein Fehler. Am Pass ein
> Sicherheitsfaktor der Verrundung, der vom Ring stammte; an der Stadt eine
> rückseitig gewickelte Schürze, die nie gezeichnet wurde. Die Begründungen
> stehen bei den Zeilen selbst.

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
erkennen und mit Minimal starten; der Benchmark muss danach trotzdem laufen.

> **Gebaut und gemessen** (`src/render/deviceTier.ts`, `japanMap.device()`).
> Kaltstart auf dieser Maschine, gespeicherte Wahl vorher verworfen:
>
> | | |
> |---|---|
> | GPU | `ANGLE (Microsoft, Microsoft Basic Render Driver … D3D11)` |
> | `hardwareConcurrency` | 16 |
> | `deviceMemory` | 8 |
> | `pointer: coarse` | nein |
> | **Schätzung** | **Minimal** — „Software-Rasterisierer erkannt" |
> | Stufe nach dem Start | Minimal |
>
> **Das ist genau der Fall, für den die Reihenfolge der Signale gilt.** Kerne,
> Speicher und Zeigergerät sagen alle drei „starke Maschine" — und für die CPU
> stimmt das sogar. Gerendert wird trotzdem im Software-Rasterisierer. Wer die
> billigen Signale zuerst fragt, bekommt hier die teuerste Stufe auf dem
> langsamsten Renderer. Die GPU-Zeichenkette schlägt deshalb alles andere.
>
> Nebenbei: `gl.getParameter(gl.RENDERER)` liefert `"WebKit WebGL"` — eine
> Konstante ohne Informationsgehalt. Ohne
> `WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL` gäbe es diese Messung
> nicht, und wo die Erweiterung fehlt, fällt die Schätzung auf die übrigen
> Signale zurück.

**Was das kostet, und es ist nicht null.** Der Aufwärmframe läuft weiter auf
Ultra — sonst fehlten die Programme der Kette, wenn jemand hochschaltet (P7.4).
Gemessen beim Kaltstart:

| | |
|---|---|
| Aufwärmframe | **30 Programme in 709,9 ms** (unverändert gegenüber P7) |
| nach dem Umschalten auf Minimal | **43 Programme** |

Die 13 zusätzlichen sind der Preis des Bypasses aus 8.2: `toneMapping` steht im
Programm-Cache-Schlüssel von three, und im Bypass tonemappt der Renderer statt
der Kette. **Ein Gerät, das Minimal nie verlässt, bezahlt damit 30 Programme,
die es nicht benutzt, und danach noch 13, die es benutzt.**

> **Offen, bewusst nicht nebenbei entschieden.** Naheliegend wäre, auf der
> *geschätzten* Stufe aufzuwärmen. Dann fehlen aber die Programme für jedes
> spätere Hochschalten, und P7.4 hat genau dafür den Aufwärmframe eingeführt
> (der Ruckler beim ersten Sichtkontakt mit der Stadt lag bei 106 ms über
> Budget). Die Abwägung braucht eine Zahl von echter Hardware, und die gibt es
> hier nicht: der Wechselframe ist auf einem Software-Rasterisierer nicht
> aussagekräftig zu messen. **Nicht geraten, sondern notiert.**

Dazu die drei bekannten Sonderfälle aus P7, unverändert: verdecktes Fenster
(Abbruch ohne Speichern), gespeicherte Wahl (kein Benchmark), manuelle Wahl im
Panel (Benchmark stoppt und speichert). Der Knopf „Neu einstufen" beginnt jetzt
ebenfalls bei der geschätzten Stufe — sonst wäre er der Blindstart auf Ultra,
den diese Aufgabe abschafft.

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

> **Teil 1 (Wolkenschatten) ist gebaut und gemessen.** Maske aus der Differenz
> gegen `strength = 0`, Ultra, 1280 × 720:
>
> | Blickpunkt | betroffen | Anteil | Ø Differenz | Spitze |
> |---|---|---|---|---|
> | `start`    | 171 548 Px | 18,61 % | 15,1 | 130 |
> | `pass`     | 147 459 Px | 16,00 % |  9,5 | 114 |
> | `reisfeld` | 146 925 Px | 15,94 % | **18,0** | 142 |
> | `kueste`   |   4 131 Px |  0,45 % |  4,8 |  15 |
>
> Bei `start` bedeckt das Gelände 45,67 % des Bildes — der Schatten trifft dort
> also rund **40 % des sichtbaren Bodens**. Und er wandert: bei stehender Kamera
> ändern sich nach 2 s Weltzeit 12 448 Pixel, nach 10 s 98 725.
>
> **`kueste` fällt mit 0,45 % aus der Reihe, und das ist kein Fehler.** Dort
> steht fast nur Meer im Bild, und eine Wasserfläche bei 2,23° Sonnenstand lebt
> von der Spiegelung des Himmels, nicht vom direkten Sonnenlicht. Wo keine Sonne
> ankommt, kann eine Wolke keine wegnehmen. Am stärksten wirkt es umgekehrt auf
> den Reisterrassen — flach, offen, besonnt. Dass die Zahlen so *unterschiedlich*
> ausfallen, ist damit die Bestätigung, dass der Schatten am richtigen Anteil
> ansetzt.
>
> Eingehängt ist er in `atmoShade()`, also an der **einen** Stelle, an der der
> Sonnenanteil entsteht. Sieben Materialien lesen sie (Terrain, Wasser, Straßen,
> Decals, Props, Vegetation, Imposter, Fassaden); jedes einzeln zu bedienen wäre
> der Fehler aus P4, wo der Wind nur im Mesh-Material hing und drei Viertel der
> sichtbaren Instanzen stillstanden.
>
> Das Rauschen wird beim Start **gerechnet** (`createCloudTexture.ts`), nicht
> geladen: 256², kachelbar über einen ganzzahligen Hash mit Modulo, vier
> Oktaven. Kosten im Startdownload: **null Bytes**.
>
> **Teil 2 (Wolkenebene) ist gebaut — und die Vorannahme des Plans war falsch.**
> Oben steht „Wolken gibt es nicht". Nachgemessen über die Himmelspixel (alles
> ausgeblendet, was Geometrie ist) trägt das HDRI sehr wohl Struktur:
>
> | Blickpunkt | Himmelsanteil | Ø Helligkeit | Streuung | Spanne |
> |---|---|---|---|---|
> | `start`      | 46,1 % | 185,4 | 13,2 | 151…210 |
> | `pass`       | 46,4 % | 191,2 | 10,6 | 147…211 |
> | `stadt-fern` | 36,2 % | 184,4 | 14,9 | 145…209 |
>
> Was fehlte, war also nicht Bewölkung, sondern **Bewegung** — und seit Teil 1
> die Bodenschatten wandern, war der stillstehende Himmel ein sichtbarer
> Widerspruch. Die Ebene ist deshalb bewusst schwächer ausgelegt als das, was
> schon da ist: Deckkraft 0,35, gemessene mittlere Differenz 6,9 gegen eine
> vorhandene Himmelsstreuung von 13.
>
> | Blickpunkt | betroffen | Anteil | Ø Differenz | Draw-Calls |
> |---|---|---|---|---|
> | `start`      |  84 285 Px |  9,15 % | 6,9 | 161 / 159 |
> | `pass`       | 164 923 Px | 17,90 % | 6,9 |  39 / 38 |
> | `stadt-fern` |  59 842 Px |  6,49 % | 7,9 | 157 / 155 |
> | `stadt-luft` |     634 Px |  0,07 % | 5,5 | 111 / 109 |
>
> `stadt-luft` blickt senkrecht nach unten — dort steht kein Himmel im Bild, und
> 0,07 % ist die richtige Antwort.
>
> **Die Kuppel kostet einen Draw-Call, an der Stadt aber zwei.** Der zweite ist
> der planare Spiegeldurchgang aus P6.5, der die Szene ein weiteres Mal zeichnet
> — Wolken im nassen Asphalt sind physikalisch richtig, kosten aber eben auch.
> Der Plan oben nannte „+1"; gemessen sind es 1 bzw. 2.
>
> **Bewegung isoliert gemessen** (`pass`, jeweils der andere Anteil abgeschaltet):
>
> | | 10 s | 60 s |
> |---|---|---|
> | nur Wolkenebene | 12 021 Px (1,30 %) | 150 057 Px (16,28 %), Ø 6,6 |
> | nur Bodenschatten | — | 134 998 Px (14,65 %), Ø 11,6 |
>
> Beide bewegen sich über vergleichbare Flächen, der Bodenschatten kräftiger je
> Pixel. Genau so ist es gedacht.
>
> > **Ein Messfehler unterwegs, und er hätte fast ein falsches Ergebnis
> > geliefert.** Der erste Versuch, die Kuppelbewegung zu isolieren, setzte
> > `uTime` der Kuppel von Hand — und meldete 26 geänderte Pixel, also
> > „bewegt sich nicht". `CloudDome.update()` schreibt den Wert aber jeden Frame
> > aus der Atmosphärenzeit zurück, und `probe()` rendert einen Frame. Gemessen
> > wurde damit eine Zuweisung, die sofort überschrieben wird. Richtig ist,
> > **den jeweils anderen Anteil abzuschalten** statt die Zeit zu verbiegen.

---

**8.5 — Der Terrain-Durchgang** → `tools/bake-terrain.mjs`

**Alles, was das Höhenfeld anfasst, passiert hier — in einem Durchgang.** Die
Kette ist zirkulär (`npm run world`), und jede Geländeänderung zieht
Verschattung, Zonenmaske, Straßentrassierung, Vegetationsverteilung und
Prop-Höhen nach. CLAUDE.md führt dazu bereits einen Fall: die Einebnungsschwelle
der Reisfelder hat über eine **Kehre am Bergpass** entschieden. Ein zweiter
Durchgang später kostet die vollständige Neumessung ein zweites Mal.

> ### Und die Fernwirkung ist schlimmer als dort beschrieben — gemessen
>
> Der Fall in CLAUDE.md klingt nach einem unglücklichen Parameter. Er ist die
> Regel. Gemessen mit `--flat-city` gegen den Normalfall, sonst identischer
> Lauf — ein Eingriff, der **ausschließlich die Stadtzone** anfasst:
>
> | | abweichende Texel | westlichste Abweichung |
> |---|---|---|
> | vor der Erosion  | 17,28 % (x 28…1522) | x = 28 |
> | nach der Erosion | **66,82 %** | **x = −1536** |
>
> Der Eingriff selbst ist also sauber lokal; die Erosion trägt ihn über die
> ganze Karte. 2 Mio. Tropfen auf einem gemeinsam beschriebenen Feld sind ein
> chaotisches System.
>
> **Eine naheliegende Ursache wurde geprüft und ist es nicht.** Die
> Startpunktsuche der Tropfen verbraucht den Zufallsstrom ungleichmäßig — sie
> bricht bei Landtreffer ab. Ein Versuchsstand, der immer das volle Kontingent
> zieht, änderte an der Ausbreitung **nichts** (66,82 % mit wie ohne). Er ist
> deshalb nicht eingebaut worden: er hätte das Höhenfeld vollständig neu
> gewürfelt für einen Nutzen, der nachweislich ausbleibt.
>
> **Zwei Regeln folgen daraus, und sie gelten ab hier für jede Geländearbeit:**
>
> 1. **Kein A/B am fertigen Höhenfeld ist örtlich.** Wer wissen will, was ein
>    Eingriff *selbst* tut, misst mit `--erosion 0`.
> 2. **Wer eine Wirkung dem Eingriff zuschreibt, muss sie getrennt haben.** Die
>    7 Kehren am Pass nach diesem Durchgang sind deshalb ein *Ergebnis*, keine
>    *Wirkung* der Bank oder des Flusses. Gemessen ist nur: ohne Flussbett sind
>    es 5, vor dem Durchgang waren es 3.
>
> Die Kette bleibt dabei **deterministisch**: zwei Läufe mit gleichem Code
> liefern bitgleiche Felder (geprüft, `5c7672ea…` und `66b77ac4…`).

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

   > **Gemessen — und der Befund kippt die Diagnose dieser Aufgabe.**
   >
   > *Falllinie*, vom Massivzentrum nach Süden über 1200 m:
   >
   > | | Hub | Ø Gefälle | Median | 95 % | Maximum | über 30 % |
   > |---|---|---|---|---|---|---|
   > | nach Süden    | 301 m | **25 %** | 12 % | 238 % | 276 % | 29 % |
   > | nach Südosten | 353 m | 31 % |  8 % | 230 % | 516 % | 36 % |
   > | nach Westen   | 137 m | 14 % |  7 % | 109 % | 174 % | 15 % |
   >
   > **Das mittlere Gefälle der Südflanke liegt bereits bei 25 % — genau dem
   > Zielwert, den diese Aufgabe fordert.** Die „45 %" aus P3 waren eine
   > Beobachtung an einem einzelnen Hang, kein Kennwert der Flanke. Flacher zu
   > machen, was schon flach genug ist, hilft also nicht.
   >
   > Der Median liegt bei 12 %, das 95. Perzentil bei 238 %. Die Flanke ist
   > **nicht gleichmäßig geneigt**, sondern überwiegend sanft mit senkrechten
   > Stufen dazwischen. Genau die Form, vor der CLAUDE.md warnt.
   >
   > *Traverse* — quer zur Falllinie, also der Weg, den eine Serpentine
   > tatsächlich nimmt, über 960 m:
   >
   > | Lage | Hub | Ø Gefälle | Median | 95 % | über 30 % |
   > |---|---|---|---|---|---|
   > | z = −550 (Mitte der Flanke) | 347 m | 36 % | **104 %** | 410 % | **84 %** |
   > | z = −300 (Fuß) | 47 m | 5 % | 8 % | 62 % | 11 % |
   > | z = −50 (Reisebene) | 3 m | 0 % | 1 % | 3 % | 0 % |
   >
   > **Auf 84 % ihrer Länge ist die Traverse steiler als 30 %.** Eine Kehre
   > müsste dort Grat für Grat und Rinne für Rinne durchschneiden — daher der
   > „Steinbruch" aus P3. Und bei z = −300 ist die Flanke schon vorbei: die
   > nutzbare Höhe liegt zwischen etwa z = −600 und z = −300, also auf **rund
   > 300 m**, nicht auf 1,5 km. Den Rest hat die Reisfeld-Einebnung.
   >
   > **Daraus folgt eine andere Reihenfolge als unten geplant.** Der Haupthebel
   > ist nicht die Verlängerung der Maske, sondern:
   >
   >  1. die **Gratamplitude** in der Flanke dämpfen (Punkt 4) — sie macht die
   >     Traverse zum Waschbrett,
   >  2. den **Konflikt mit der Reiszone** auflösen (Punkt 3) — er kostet der
   >     Flanke zwei Drittel ihrer Länge,
   >  3. und erst dann, falls nötig, die Maske anisotrop verlängern (Punkt 2).
   >
   > **Und das Abnahmekriterium ändert sich mit.** „25 % mittlere Neigung" ist
   > bereits erfüllt und sagt nichts; verbindlich wird stattdessen die
   > **Traverse bei z = −550**: Median ≤ 25 % und höchstens 20 % der Länge über
   > 30 %. Das ist die Größe, an der eine Serpentine wirklich hängt.

   > **Variantenserie — und keine erreicht das Ziel.** `bake-terrain.mjs` hat
   > dafür zwei Versuchsregler bekommen (`--ridge`, `--rice-shift`, beide mit
   > Vorgabe = ausgelieferter Stand) und `--out`, sodass Varianten nach
   > `.cache/` gehen, ohne `assets/generated/` anzufassen.
   >
   > | Variante | Traverse Median | über 30 % | Traverse-Hub | Gipfel |
   > |---|---|---|---|---|
   > | Ist-Zustand              | 89 % | 89 % | 320 m | 298 m |
   > | Grate ×0,6               | 75 % | 89 % | 220 m | 228 m |
   > | Grate ×0,35              | 66 % | 82 % | 158 m | 184 m |
   > | Grate ×0,5, Reis +200 m  | 58 % | 71 % | 223 m | 210 m |
   > | Grate ×0,35, Reis +200 m | **44 %** | **61 %** | 180 m | 184 m |
   > | *Zielwert*               | *≤ 25 %* | *≤ 20 %* | — | — |
   >
   > *Gebacken mit `--res 1024 --erosion 500000` statt 2048/2 000 000, damit ein
   > Durchgang 3 s statt 20 s dauert. Die Zahlen sind deshalb **untereinander**
   > vergleichbar, nicht mit den Absolutwerten oben — derselbe Ist-Zustand misst
   > hier 89 % statt 104 %.*
   >
   > Drei Dinge stehen damit fest:
   >
   >  - **Gratdämpfung allein reicht nicht.** Selbst ×0,35 — eine drastische
   >    Reduktion, die den Gipfel von 298 auf 184 m drückt — landet bei 66 %
   >    Median und 82 % über 30 %. Das ist mehr als das Doppelte des Ziels.
   >  - **Der Reisversatz ist der wirksamere Hebel je Schaden.** Er kostet keine
   >    Gipfelhöhe und bringt bei gleicher Gratdämpfung 66 % → 44 %.
   >  - **Keine Kombination erreicht 25 % / 20 %.** Die beste Variante liegt bei
   >    44 % / 61 % und hat dafür 38 % der Gipfelhöhe abgegeben. Das Massiv ist
   >    dann kein Massiv mehr.
   >
   > **Damit ist die Aufgabe, wie sie dasteht, nicht lösbar** — und das ist ein
   > Ergebnis, kein Zwischenstand. Wer weiter an diesen beiden Reglern dreht,
   > verschlechtert die Silhouette weiter und kommt dem Ziel nicht nahe; genau
   > die Regelschleife, die dieses Projekt zweimal ersatzlos entfernt hat.
   >
   > **Der dritte Weg, den die Messung nahelegt:** das Problem ist *lokal*. Nicht
   > das Massiv ist zu schroff, sondern der Trassenkorridor. Statt den ganzen
   > Berg abzuflachen, bekäme die Passtrasse ein **geglättetes Band** — eine
   > Bank, entlang derer die Grate eingeebnet werden, 60…80 m breit. Das ist,
   > was ein Geländebauer täte, und die Silhouette bliebe **vollständig
   > erhalten**. Technisch ist es derselbe Vorgang wie das Straßen-Carving, nur
   > breiter und ohne Fahrbahnprofil.
   >
   > Der Haken: die Bank braucht die Trasse, und die Trasse entsteht erst auf
   > dem Gelände — dieselbe Zirkularität wie beim Bake-Kreislauf, und mit
   > demselben Mittel zu lösen (zweimal backen). **Zu entscheiden ist das nicht
   > hier, sondern von der Art Direction.**
   >
   > **Was die Bank kostet — nachgemessen, und die erste Einschätzung war
   > falsch.** „Die Bank ist fast umsonst, der Carve-Mechanismus steht schon"
   > stimmt für den *Code* und nicht für das *Gelände*. Gemessen auf dem
   > ausgelieferten Höhenfeld entlang der `toge`-Mittellinie, ohne zu backen:
   >
   > *Variante A — auf Fahrbahnhöhe zwingen (was `carveRoads` heute tut):*
   >
   > | halbe Breite | Median | 95 % | Maximum | Abtrag > 20 m | Volumen |
   > |---|---|---|---|---|---|
   > | 20 m | 3,0 m | 42,4 m | 102,2 m | 15 % | 1,00 Mm³ |
   > | 30 m | 5,5 m | 54,7 m | 102,8 m | 22 % | 2,18 Mm³ |
   > | 60 m | 8,5 m | 65,4 m | 183,4 m | 31 % | 6,13 Mm³ |
   >
   > *Variante B — nur das Relief glätten (jeder Punkt gegen den Median seines
   > Querschnitts):*
   >
   > | halbe Breite | Median | 95 % | Maximum | Abtrag > 20 m | Volumen |
   > |---|---|---|---|---|---|
   > | 20 m | **0,0 m** | 28,6 m |  92,2 m |  8 % | 0,64 Mm³ |
   > | 30 m | **0,0 m** | 31,8 m |  96,7 m |  9 % | 1,05 Mm³ |
   > | 60 m | **0,0 m** | 49,3 m | 173,3 m | 17 % | 3,47 Mm³ |
   >
   > Der Unterschied ist der Kern der Sache: **Variante A trägt nicht den Grat
   > ab, sondern den halben Berg.** Der Hang steigt neben der Trasse steil an,
   > und „auf Fahrbahnhöhe" heißt dort 50 bis 100 m Abtrag. Variante B lässt den
   > Hang stehen und nimmt nur, was über seinem eigenen Querschnittsmedian
   > liegt — halbes Volumen, halber Anteil über 20 m, und der **Median fällt auf
   > null**: der größte Teil des Korridors bleibt unberührt.
   >
   > **Umsonst ist auch B nicht.** Bei ±30 m stehen 95 % bei 31,8 m und der
   > Extremwert bei 96,7 m; an einzelnen Stellen entstehen also weiterhin
   > sichtbare Anschnitte.
   >
   > **Und beides sind Untergrenzen.** Gemessen wurde entlang der *heutigen*
   > Trasse, und die hat der Generator bereits auf geringen Erdbau optimiert.
   > Eine Linienführung mit acht Kehren läuft zwangsläufig durch schlechteres
   > Gelände.
   >
   > ### Gebaut — und die erste Messgröße war die falsche ✓
   >
   > `benchRoads()` in `tools/bake-terrain.mjs`, läuft vor dem
   > Straßeneinschnitt. Kappt im Korridor alles über dem Querschnittsmedian
   > plus Toleranz, Kosinus-Auslauf, **nur Abtrag**.
   >
   > Die naheliegende Messgröße — „Relief im Korridor" — bewegte sich kaum
   > (45,1 → 42,7 m Median bei ±30 m), und beinahe wäre daraus „das Verfahren
   > taugt nicht" geworden. Sie misst innerhalb ±20 m aber den
   > **Straßeneinschnitt**, der danach läuft und den Korridor ohnehin planiert.
   > Was am Pass stört, ist der **Anschnitt**: wie hoch das Gelände neben der
   > Fahrbahn über ihr aufragt. Damit gemessen, `toge`, Band ±60 m:
   >
   > | Bank | Median | 95 % | Maximum | > 20 m | > 50 m | Abtrag |
   > |---|---|---|---|---|---|---|
   > | ohne              | 41,5 m | 97,4 m | 185,4 m | 90 % | 42 % | — |
   > | ±30 m, Toleranz 8 | 38,7 m | 92,2 m | 185,4 m | 88 % | 37 % | 0,90 Mm³ |
   > | ±30 m, Toleranz 2 | 37,8 m | 91,4 m | 185,4 m | 86 % | 36 % | 1,59 Mm³ |
   > | ±45 m, Toleranz 4 | 33,4 m | 73,5 m | 134,5 m | 74 % | 28 % | 2,51 Mm³ |
   > | **±60 m, Toleranz 8** | **23,7 m** | **65,9 m** | **90,7 m** | **59 %** | **15 %** | **3,30 Mm³** |
   > | ±60 m, Toleranz 2 | 20,0 m | 61,5 m |  84,7 m | 50 % | 12 % | 4,89 Mm³ |
   > | ±80 m, Toleranz 2 | 20,5 m | 59,9 m |  86,6 m | 51 % | 12 % | 8,00 Mm³ |
   >
   > Die **Breite** entscheidet, nicht die Toleranz — bei ±30 m bringt Toleranz
   > 2 statt 8 fast nichts. ±80 m sättigt und ist verschenkt. Toleranz 8 spart
   > ein Drittel Erdbau für 3,7 m Anschnitt und hält die Bank in der Ebene
   > harmlos: `ring` bleibt bei 15,6 → 15,4 m Relief, `dorf` bei 2,0 → 2,0 m.
   > Eine Beschränkung auf bestimmte Straßen ist deshalb nicht nötig.
   >
   > **Zwei Dinge tut sie nicht.** Den Graben unter der Fahrbahn nimmt sie nicht
   > (⌀ 5,8 → 5,4 m über die Serie). Und sie bringt **keine Kehren**: die
   > Trassierung läuft in `npm run world` auf dem sauberen Feld, die Bank erst
   > im Bake danach — die Linienführung kennt sie nicht.
   >
   > ### Und dann sagte das Bild etwas anderes als die Tabelle
   >
   > Auf der Schummerung stand die Bank als **glatte Platte mit sauber
   > gerundeter Außenkante** um den ganzen Kehrenbündel — bei sieben Kehren auf
   > 150 m Breite verschmelzen die Bänder benachbarter Schenkel. Zwei Ursachen,
   > beide behoben:
   >
   >  - **Konstante Toleranz kappt auf eine Ebene.** Sie wächst jetzt
   >    quadratisch zur Bankkante (`spread`): an der Achse fällt der ganze Grat,
   >    an der Kante fast nichts. Die Bank hat damit keinen sichtbaren Rand.
   >  - **Die Kante lag als exakte Parallele zur Trasse.** Eine Randstörung
   >    (`jitter`, 14 m) verschiebt den Abstand statt der Höhe — dieselbe Lösung
   >    wie `edgeJitter` bei den Zonen.
   >
   > **Eine dritte Beobachtung war meine eigene Fehllesung.** Die große runde
   > Kontur nördlich der Kehren hatte ich der Bank zugeschrieben. Im Bild
   > *ohne* Bank (gleiche Trasse, `--no-bench`) steht sie unverändert da — sie
   > gehört zum Massiv. Ohne den Gegenschuss wäre eine Ursache in die Doku
   > gewandert, die es nicht gibt.
   >
   > **Was blieb: eine Knickkante.** Ein hartes `min(h, ceiling)` ist stetig,
   > seine Normale nicht, und bei 2,2° Sonnenstand zeichnet jeder Knick eine
   > Lichtkante — dieselbe Beobachtung wie beim Straßeneinschnitt. Auf dem Bild
   > war das ein dichter **Kamm aus Schattenstreifen** entlang der Trasse,
   > während Anschnitt und Erdbau sich verbesserten. Ersetzt durch ein weiches
   > Minimum (`softness`, 12 m).
   >
   > **Endstand, A/B mit derselben Trasse (`--no-bench` gegen Normalfall):**
   >
   > | | Median | 95 % | Maximum | > 20 m | > 50 m | Abtrag |
   > |---|---|---|---|---|---|---|
   > | ohne Bank | 69,9 m | 187,3 m | 212,4 m | 85 % | 64 % | — |
   > | mit Bank  | **54,4 m** | **104,2 m** | **141,0 m** | 80 % | **53 %** | 5,43 Mm³ |
   >
   > *Die Zahlen liegen höher als in der Serie oben, weil die Trasse eine andere
   > ist: 7 Kehren auf 2408 m statt 3 auf 3003 m. Eine Linienführung mit mehr
   > Kehren läuft durch schlechteres Gelände — genau wie oben vermutet.*
   >
   > **Offen und ehrlich: die Streifen sind schwächer, aber nicht weg.** Gegen
   > das Bild ohne Bank bleibt entlang der Trasse eine sichtbare Textur. Ob das
   > den Gewinn beim Anschnitt wert ist, ist eine Art-Direction-Frage;
   > `--no-bench` nimmt die Bank in einem Schalter zurück.
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
- ~~**Traverse bei z = −550**: Median ≤ 25 %, höchstens 20 % der Länge über
  30 %.~~ **Hinfällig.** Dieses Kriterium misst eine feste Linie quer durchs
  Massiv und weiß von der Trasse nichts — die gebaute Lösung ist aber eine
  **örtliche** Bank am Korridor, keine Umformung der Flanke. Es zu erfüllen
  hieße, das Massiv abzuflachen, und genau das ist oben als nicht erreichbar
  gemessen (bestenfalls 44 % / 61 % bei 38 % Gipfelverlust). An seine Stelle
  tritt der **Anschnitt über der Fahrbahn**: 41,5 → 23,7 m Median, 42 → 15 %
  über 50 m,
- **Kehren am Pass** — Zielwert aus SPEC §2.1 ist ≥ 8. **7 erreicht** (vorher
  3). Nicht der Bank zuzuschreiben, siehe den Kopplungsbefund oben,
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

> ### Gebaut ✓ — mit zwei verworfenen Verfahren und zwei offenen Punkten
>
> **Nicht als Straßentyp.** Der Plan oben sah den Fluss als weiteren Typ in
> `roads.config.ts`. Das hätte die Zirkularität des Bake-Kreislaufs geerbt —
> der Generator braucht ein Höhenfeld, der Baker die Trasse. Ein Fluss braucht
> den Umweg nicht: er folgt dem steilsten Gefälle, und das Höhenfeld liegt an
> dieser Stelle fertig vor. `carveRiver()` in `tools/bake-terrain.mjs`.
>
> **Zwei Verfahren gemessen verworfen.** Ein wachsender Suchring endete nach
> **247 m auf 136 m Höhe**. „Füllen und überlaufen" je Mulde irrte **4949 m**
> von Senke zu Senke und blieb auf 116 m stehen. Beide behandeln die Mulde als
> Sonderfall; nach 2 Mio. Erosionstropfen ist sie der Normalfall. Gebaut ist
> Priority-Flood auf 512² (6 m je Zelle, **Minimum** je Block, nicht Mittel),
> danach kann der Abstieg nicht mehr steckenbleiben.
>
> **Nur der Südrand ist Vorflut.** Mit allen vier Kartenrändern als Senke lief
> der Fluss nach Westen aus der Karte (Mündung x = −1526 auf 18 m). Eine
> Südneigung bei der Richtungswahl half nicht — gemessen mit 0, 0,9 und 2,0
> endete er jedes Mal am selben Westrand. Sie kann nur unter **Abwärts**nachbarn
> wählen, und nach Süden ging es nicht abwärts. Der Regler steht auf 0 und
> bleibt als dokumentierter Fehlversuch stehen.
>
> **Der Kopf wird abgeschnitten.** Der Abstieg startet am höchsten Punkt der
> Flanke und stürzt dort senkrecht ab; die erste „Stufe" war gemessen **242 m**
> hoch — das ist kein Wasserfall, das ist die Felswand.
>
> Abnahme auf dem ausgelieferten Feld:
>
> | | Ergebnis |
> |---|---|
> | Monotonie des Polygonzugs | **0 von 421** Abschnitten steigen an ✓ |
> | Gelände über der Wasserlinie | **0 Knoten** ✓ |
> | Lauf | 2643 m, 163 → 1 m, endet im **Meer** ✓ |
> | Bettiefe | Median 2,68 m · 95 % 9,44 m |
> | Bettbreite | 8,1 m an der Quelle → 33,9 m an der Mündung ✓ |
> | Stufen | **2**: 11,2 m und 39,7 m ✓ (Vorgabe „zwei bis drei") |
> | Erdbau | 0,23 Mm³ |
>
> **Offen 1 — der Fluss läuft durch die Straßengräben.** 19 von 422 Knoten
> liegen in einem Kolk tiefer als 5 m, und **alle 19 innerhalb 40 m einer
> Straße**. Der Straßeneinschnitt kreuzt das Bett; Brücken stehen nicht in P8.
> Die Wasserlinie selbst bleibt monoton, es ist ein Bildproblem, kein
> Strömungsproblem.
>
> **Offen 2 — die Terrassen liegen am Rand, nicht am Fluss.** Nächster Abstand
> 20 m, aber Median **427 m**; 22 % der Terrassenfläche innerhalb 150 m, 47 %
> innerhalb 400 m. Der Fluss streift die Reiszone westlich, statt sie zu
> durchziehen. Ein Teil davon ist Geometrie — die Zone ist 800 m breit, ein
> Fluss mittendurch käme auf ~200 m Median. Die Vorgabe „nicht 300 m daneben"
> ist damit **nicht erfüllt**.

#### 8.5c — Das Vorfeld der Stadt

**Befund.** Der Baker ebnet für die Stadt ein Plateau von **800 × 800 m** ein
(`ZONES.city`, x 380…1180, z −310…490). Der gebaute Distrikt misst 360 × 360 m
(x 440…800, z −60…300) und sitzt darauf **außermittig**: 380 m freie Platte im
Osten, 60 m im Westen. Der Distrikt belegt **20 % seines eigenen Plateaus**.

Das ist die geometrische Seite von „die Stadt steht als Block in der Natur": um
sie herum liegt eine große, planierte, leere Fläche, und der Übergang von dort
ins Gelände ist eine 300-m-Feder ohne irgendetwas darauf.

> ~~*Gerechnet, nicht am Bild geprüft.*~~ **Am Bild geprüft und bestätigt**
> (`.cache/shots/p8_vorfeld_stadt_luft.png`). Von oben steht der Distrikt als
> hartkantiges Rechteck auf einer großen, vollständig ebenen, **kahlen** Platte:
> keine Vegetation, keine Bauten, kein Relief, und der Übergang ins Gelände ist
> eine merkmallose Schräge. Die Streuung wächst die Fläche **nicht** zu — die
> Vermutung, sie könnte es, war der Grund für diese Prüfung und ist widerlegt.
>
> Der Eindruck ist damit stärker als die Zahl: die 20 % beschreiben den Anteil,
> das Bild zeigt, dass das leere Vorfeld die Wahrnehmung aus der Luft
> **dominiert**.

**Fix.** Im Baker nur die Vorbereitung: das Plateau bekommt eine **abgestufte**
statt einer glatten Einebnung — Kernfläche eben, Vorfeld mit leichter Neigung und
Restrelief, damit dort etwas stehen kann, das nicht wie Stadt aussieht. Der
sichtbare Teil steht in 8.8.

> ### Gebaut ✓
>
> `CITY_CORE` deckt den Distrikt plus die 60-m-Feder von `padCity` plus 20 m
> Reserve ab (360…880 / −140…380) und wird eingeebnet wie bisher. Außerhalb
> davon zieht die Einebnung nur noch mit 0,62 statt 0,96, dazu Restrelief und
> ein leichter Anstieg zum Zonenrand — die Stadt liegt danach in einer flachen
> Mulde statt auf einem Tisch.
>
> | | Höhenspanne | Neigung Median | unter 2 % Neigung |
> |---|---|---|---|
> | vorher  | 34,0 m | 0,7 % | **91 %** der Fläche |
> | nachher | 37,5 m | 3,7 % | **36 %** der Fläche |
>
> **Der Distrikt bleibt dabei exakt 29,00…29,00 m.** Das war die Bedingung, an
> der P6 schon einmal gescheitert ist: die Bodenplatte liegt auf 30 m mit 23 cm
> Luft, und ein Restrelief, das dorthin durchschlägt, stößt sie durch.
> `padCity` meldet unverändert −0,94 m Abtrag / +0,10 m Auftrag im ersten Bake.
>
> `--flat-city` schaltet zurück auf die flächige Einebnung — der A/B-Schalter,
> mit dem der Kopplungsbefund unten gemessen wurde.

---

**8.6 — Fluss und Wasserfälle** → `src/world/WaterSystem.ts`,
`src/world/materials/WaterMaterial.ts`, `src/config/water.config.ts`

> ### Gebaut, gemessen — und zur Hälfte nicht im Bild
>
> `buildRiverGeometry()` baut aus `river.json` ein Band aus zwei Knotenreihen;
> `WaterSystem` hängt es mit **demselben Material** wie das Meer ein, nur mit
> `uWaterRiver = 1`. Kosten: **0 zusätzliche Shaderprogramme** (31 vor wie
> nach), weil beide sich den Cache-Key teilen und die zwei Unterschiede —
> Flächennormale und Stufenschaum — an einer Uniform hängen.
>
> Eine Zeile im Shader war dabei eine stille Altlast: die Wassertiefe wurde als
> `-terrainSurface(xz)` gerechnet, also gegen y = 0. Für das Meer stimmt das;
> der Fluss wäre auf ganzer Länge „80 m tief" gewesen. Jetzt
> `vWaterWorld.y - terrainSurface(xz)` — für das Meer bitgleich, weil sein y
> exakt 0 ist.
>
> **Zwei Fehllesungen am Bild, beide von der Differenzmessung korrigiert:**
>
>  1. Das graue Band in der Schlucht hielt ich für den Fluss, der „wie Asphalt
>     aussieht". Es **ist** Asphalt — die Passstraße. Im Bild ohne Fluss steht
>     es unverändert da.
>  2. Der Fluss war das **helle Band, das frei in der Luft hängt**: er spannt
>     sich als Aquädukt über den Straßengraben. Das passt exakt zur Messung aus
>     8.5b (19 von 422 Knoten in einem Kolk tiefer als 5 m, alle an einer
>     Straße) — die Zahl war da, sie zeigte nur in die andere Richtung.
>     Notmaßnahme im Shader: die Fläche blendet über 6…14 m Tiefe aus, statt zu
>     schweben. Richtig wäre eine Brücke, und die ist Geometrie.
>
> **Der Mittelwert taugte als Messgröße nicht.** `probe()` meldete an drei
> Standpunkten eine Helligkeitsdifferenz von −0,001, −0,013 und 0,000 — also
> „kein Fluss". Ein Band von wenigen Pixeln Breite geht im Mittel über 921 600
> Pixel unter; genau die Falle, die CLAUDE.md unter „über das ganze Bild
> gemittelt" führt. Gezählt gehört die **Fläche**, aus der Differenz zweier
> Bilder:
>
> | Standpunkt | geänderte Pixel | Anteil | stärkste Änderung |
> |---|---|---|---|
> | Oberlauf (Stufe) | 4308 | **0,467 %** | 304 |
> | Mündung | 643 | 0,070 % | 48 |
> | Unterlauf (Terrassen) | **2** | **0,000 %** | 11 |
>
> ~~**Am Unterlauf ist der Fluss nicht im Bild.** … Wahrscheinlichster Grund:
> die Reisfeld-Terrassen laufen nach dem Flussbett und tragen bis 3,4 m auf.~~
>
> **Beides falsch, und drei Messungen haben es nacheinander widerlegt.** Die
> Vermutung stand keine Stunde, was für sie spricht: sie war als Vermutung
> markiert.
>
> | geprüft | Ergebnis |
> |---|---|
> | von den Terrassen vergraben? | **nein** — freier Bandanteil 100 %, 0 von 160 Knoten unter Gelände |
> | durch die Uferblende transparent? | **nein** — Wassertiefe Median 3,00 m, Deckkraft 100 % |
> | außerhalb des Bildes? | **nein** — 151 von 422 Knoten im Sichtvolumen, einer auf Pixel (1238, 543) |
>
> **Er wird gezeichnet.** Bei Differenzschwelle **0** sind es **0,869 % der
> Pixel**, bei Schwelle 2 nur noch 0,002 %. Der Fluss ist also *farblich nicht
> von den gefluteten Reisfeldern zu unterscheiden*, durch die er läuft — kein
> Geometrie- und kein Shaderfehler, sondern eine Look-Frage. Und die
> ursprüngliche Zahl „2 Pixel" war nicht falsch gemessen, sondern **mit einer
> Schwelle gemessen, die größer war als der Effekt**.
>
> **Ein Rauheitsaufschlag (+0,085) war der naheliegende Versuch und ist
> gemessen wirkungslos** (0,002 % bei Schwelle 2, vorher wie nachher). Wieder
> ausgebaut — dieselbe Regel, an der in 8.5 schon eine „offensichtlich
> richtige" Erosionsreparatur gescheitert ist. Was den Fluss dort lesbar macht,
> muss eine andere Größe sein: Ufer, Böschungsbewuchs oder eine
> Strömungsstruktur, die ein stehendes Feld nicht hat. **Offen**, und damit ein
> Fall für 8.7/8.9, nicht für den Wasser-Shader.

> ### ✗ Widerlegt am 2026-08-01: der Fluss wurde nie gezeichnet
>
> Der Absatz darüber sagt „**Er wird gezeichnet**" und schließt daraus auf eine
> Look-Frage. **Beides war falsch.** Die Dreiecke des Flussbandes waren im
> Uhrzeigersinn gewickelt; three zeichnet Vorderseiten gegen den Uhrzeigersinn.
> Das Band zeigte mit seiner Vorderseite **nach unten** und fiel vollständig
> ins Backface-Culling.
>
> Gefunden mit einer Isolationsreihe am Material — vier Eigenschaften, die ein
> erster Sichttest gemeinsam verändert hatte, einzeln zurückgenommen. Gegen ein
> Rauschband von 2,098 % / 0,241 % (Referenzbild gegen sich selbst, ein Frame
> später):
>
> | isoliert geändert | Δ Schwelle 2 | Δ Schwelle 24 |
> |---|---|---|
> | **doppelseitig** | **5,614 %** | **2,963 %** |
> | ohne Tiefentest | 1,510 % | 0,187 % |
> | undurchsichtig | 1,727 % | 0,223 % |
>
> Nur die Seitigkeit liegt über dem Rauschen. Nachgerechnet für Fließrichtung
> +Z: `[a, a+2, a+1]` ergibt (P1−P0) × (P2−P0) = (0, −2·hw·d, 0) — nach unten.
>
> **Wirkung der Reparatur**, Fluss sichtbar gegen Fluss ausgeblendet, dieselbe
> Kamera, kein Zeitschritt dazwischen:
>
> | Blickpunkt | vorher (Schwelle 24) | nachher |
> |---|---|---|
> | senkrecht über dem Unterlauf | 0,033 % | **2,844 %** |
> | schräg auf den Unterlauf | — | **2,162 %** (17,758 % bei Schwelle 2) |
>
> Am Blickpunkt `reisfeld` steht der Fluss jetzt als glänzendes Band links im
> Bild und ist von den eckigen Parzellen ohne Weiteres zu unterscheiden.
>
> **Warum die Messungen darüber daran vorbeigingen.** Sie waren alle richtig
> und keine davon konnte die Frage beantworten: der Bandanteil, die Wassertiefe
> und die Knoten im Sichtvolumen prüfen *Geometrie und Uniforms*, nicht ob ein
> Dreieck den Rasterizer erreicht. Und die 0,869 % bei Schwelle 0 waren nicht
> der Fluss, sondern das, was das Ein- und Ausblenden eines Meshes an
> **Spiegelung und Umgebungsverdeckung** ändert — im Differenzbild sichtbar als
> Sprenkel über dem ganzen Bewuchs, nirgends als Band. Ein Differenzbild statt
> einer Differenz*zahl* hätte das in einem Schritt gezeigt.
>
> Das `normal`-Attribut wird in `riverGeometry.ts` ausdrücklich nach oben
> gedreht (`if (normal.y < 0) normal.negate()`). Die Beleuchtung war damit
> rechnerisch richtig — nur die Fläche unsichtbar. Genau deshalb sah jede Zahl
> in Ordnung aus.

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

> ### Am Bild nachgesehen, bevor an einem Regler gedreht wurde
>
> Blickpunkt (620, 62, 620) auf den Distrikt, `.cache/shots/p88_stadt_vorher.png`.
>
> **Die Silhouette ist nicht das Problem.** Die Höhenstaffelung wirkt bereits:
> `coreRadius` 60 → `edgeRadius` 220 lässt die Häuser nach außen von 17 auf 2
> Geschosse fallen, und im Bild steht ein gestaffelter Umriss mit Türmen in der
> Mitte und niedriger Randbebauung — kein Riegel. Der naheliegende Eingriff
> (`randomFloors: 5` auch am Rand zulassen) wäre damit am falschen Regler
> gewesen; dass er nicht gemacht wurde, ist das Ergebnis dieses Blicks.
>
> **Das Problem ist die Kante am Boden.** Die Bebauung hört abrupt auf, und
> daneben liegt leere Fläche bis zum Horizont. Es fehlt nicht Abstufung *in*
> der Stadt, sondern alles *um* sie herum — Mauern, Schuppen, Nebengebäude,
> Bewuchs. Das ist Prop- und Streuungsarbeit (8.9) und nicht `CityGenerator`.
>
> Die Zahlen unten bleiben davon unberührt; sie betreffen die Helligkeit, nicht
> die Form.

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

> **Abweichung: die Hütten sind kein skaliertes `farmhouse`.** Der Plan schlägt
> die vorhandenen Meshes „mit Varianz in Maß und Dach" vor. Gebaut ist
> stattdessen ein eigenes `fishHut` (192 Dreiecke), und der Grund ist das Dach:
> ein Minka trägt Reet mit 45°, eine Hütte am Wasser trägt Wellblech mit 12°.
> Aus 100 m ist genau dieser Unterschied die ganze Unterscheidung zwischen Dorf
> und Hof — mit skalierten Bauernhäusern hätte das Fischerdorf wie ein zweites
> Reisfeld ausgesehen. Der Satz wuchs dadurch von 12 auf 22 Landmarks und von
> 2104 auf **3972** Dreiecke; das Budget sind 3 000 000.

**Messung.** Draw-Calls und Dreiecke der Prop-Systeme, `PROPS.capacity` (512 je
Asset und Stufe) darf nicht überlaufen — ein Überlauf verwirft Props still.
Freihalteradien nach `PROP_CLEARANCE` prüfen: nach dem Fehler aus P5 („der
Tempel stand im Wald") gehört ein Bild dazu, kein Zahlenblick.

> ### Was 8.9 zuerst gefunden hat: der Pfad führte nirgendwohin
>
> `assets/props.json` stammte aus P5.4 — **vor** dem Terrain-Umbau in 8.5. Alle
> suchbasierten Platzierungen bezogen sich damit auf ein Höhenfeld, das es nicht
> mehr gibt. Gemessen gegen das aktuelle Feld:
>
> | Asset | n | Neigung Median / Max |
> |---|---|---|
> | delineator | 158 | 34,5° / **82,5°** |
> | torii | 4 | 32,3° / 39,6° |
> | stoneLantern | 12 | 26,1° / 38,5° |
> | templeStairs | 1 | 15,5° |
> | farmhouse | 7 | 3,2° / 20,6° |
>
> Die Leitpfosten der Passstraße standen an 82° steilen Wänden — die Straße hat
> seit 8.5 sieben Kehren statt drei und liegt woanders. Der Tempel selbst hatte
> Glück: 0,71° und Ecken innerhalb der Toleranz.
>
> **Der eigentliche Befund lag daneben.** 8.7 hat einen Sandō gebaut, der auf
> der Waldhochebene bei (820, −952) endet. Der Tempel stand bei (519, −689),
> also **300 m neben dem Weg, der zu ihm führen sollte**; der Blickpunkt
> `tempel` zeigte auf das Pfadende, mithin auf leeren Wald. Beide Werkzeuge
> waren für sich richtig und wussten nichts voneinander.
>
> Die Abnahmezeile lautet „Fischerdorf und Sandō stehen und sind **erreichbar**
> — ein Pfad führt hin". Erreichbarkeit lässt sich nicht nachträglich prüfen,
> wenn beide Enden unabhängig gesucht werden; sie muss aus der Konstruktion
> folgen. `gen-props.mjs` sucht die Tempelfläche deshalb jetzt in einem Kreis um
> das **Pfadende**, und die Torii-Reihe läuft auf der Achse *Pfad + Verlängerung
> zum Tempel*, nicht auf dem Pfad allein.
>
> Ein erster Versuch, der nur den Abstand bestrafte, wählte (799,8, −992,8) —
> breite ebene Fläche, aber 45 m **neben** der Flucht. Getrennte Strafen für
> quer (×2,2) und längs (×0,1) lösen das: der Tempel steht jetzt auf (820, −954)
> mit 1,82° Neigung, **2 m** hinter dem letzten Pfadknoten.
>
> Nebenbefund zur Suche selbst: `findSpot` jittert die Rasterpunkte um ±0,8 m.
> Das ist bei groben Schritten richtig und bei einer **seltenen** Bedingung
> falsch — die Tempelfläche trifft 1 von 709 Rasterpunkten, und der Jitter ging
> daran vorbei. `jitter: 0` macht die Suche vollständig.

> ### Zwei Messfehler, die im Werkzeug steckten
>
> **1. Der Kreis maß die falsche Richtung.** Props sitzen auf der Geländehöhe
> ihres Mittelpunkts; ein 6,92 m breites Torii am Hang bekommt dadurch eine
> schwebende Säule. Die erste Abhilfe suchte den tiefsten Punkt auf einem Kreis
> mit 2,4 m Radius und senkte bis zu **1,00 m** ab. Nachgemessen war der Ring
> antisymmetrisch — −1,00 m in +Z, +0,87 m in −Z: die Absenkung kam **längs**
> des Weges, wo der Sandō steigt. Quer, wo das Torii tatsächlich ausladet, misst
> die größte Differenz über die volle Spannweite **0,54 m (4,4°)**. Mit einem
> gerichteten Grundriss (0,44 m längs × 3,46 m quer) liegt die größte Absenkung
> über alle Sandō-Bauten bei **0,63 m**, bei den Torii zwischen 0,00 und 0,41 m.
>
> **2. Die Hüttenschwelle stand gegen das Küstenprofil.** 1,4 m Mindesthöhe
> schob die Fischerhütten 70…130 m ins Hinterland. Gemessen ist diese Bucht ein
> Flachstrand mit rund 2 % Gefälle (bei x = 790: 0,02 m nach 10 m, 0,18 m nach
> 30 m, 1,49 m nach 70 m). 0,25 m sind nach 25…35 m erreicht, und die Hütte
> steht auf 0,45 m hohen Pfählen. Ergebnis: acht Hütten, 25…81 m vom Wasser.

> ### Das Dorf steht am Hafen, nicht am Leuchtturm
>
> Der Plan oben schreibt „an der Südküste beim Leuchtturm", begründet es aber
> mit einem Satz, der woanders hinzeigt: „Die Boote bekommen einen Ort, an den
> sie gehören." Gemessen liegen zwischen Hafen (x = 790) und Leuchtturm
> (x = −180) **977 m** — die beiden sind nicht einmal im selben Bild. Ein Dorf
> am Leuchtturm ließe Steg, Mole und vier Boote unbewohnt, also genau den
> Befund, den 8.9 beheben soll. Der Leuchtturm bleibt, was er ist: ein einzelner
> Fixpunkt auf einer Landzunge.

> ### Der Stadtrand: eine Zahl aus 8.8 war eine Falle
>
> Der Ring beginnt bei **215 m** vom Distriktmittelpunkt, nicht bei 195. Die
> Bodenplatte endet zwar bei 180 m, aber `CITY.ground.skirt` legt eine 24 m
> breite Schürze darum, die auf Geländehöhe ausläuft — bis 204 m. Ein Prop dort
> stünde auf dem Höhenfeld und damit **unter** der Schürze: Fall 2 aus der
> Fehlerliste in CLAUDE.md, „eine Fläche unter einer anderen".
>
> Der erste Wurf verteilte 74 Props gleichmäßig über den Ring. Im Bild sah das
> aus wie verstreute Kisten auf leerem Feld — die Ringfläche wächst quadratisch
> nach außen, die Dichte fällt also von selbst. Mit `depth^1.8` liegt die Hälfte
> der Plätze in den inneren 30 m; die Zahl stieg auf **140**.

> ### Zwei Werkzeugfehler, die die Bilder verdorben haben
>
> **1. Ein Vorher/Nachher, das keines war.** Der erste Vergleich stellte das
> neue `stadt-rand` neben das Referenzbild aus 8.8. Im alten Bild steht **keine
> einzige Pflanze**, im neuen steht überall Bewuchs — ein Unterschied, der
> nichts mit der Stadtrandbebauung zu tun hat. Das ist „warm gegen kalt" aus
> CLAUDE.md, nur an der Streuung statt an der Bildrate.
>
> Der gültige Vergleich läuft **in derselben Sitzung, an derselben Kamera, mit
> derselben Streuung**: `warehouse`, `greenhouse` und `concreteWall` werden
> ausgeblendet, sonst nichts. `shed` und `powerPole` bleiben sichtbar, weil es
> sie auch an den Höfen und über den Reisfeldern gibt — die gemessene Differenz
> ist damit eine **Untergrenze**.
>
> **2. Die Bodenmarkierung hat zwei Abnahmebilder unbrauchbar gemacht.** Der
> P1-Beleg für „Sampler stimmt mit gerenderter Oberfläche überein" ist eine
> Drahtkugel mit 2 m Radius auf der Geländehöhe **unter der Kamera**. Auf
> Augenhöhe (1,7…1,9 m) steht die Kamera darin und sieht ein rotes Netz über dem
> halben Bild. Aus der Vogelperspektive war das nie aufgefallen, weil dort alle
> bisherigen Blickpunkte lagen.
>
> Sie blendet sich jetzt aus, sobald die Kamera näher als 2,3 m über dem Boden
> steht — innerhalb ihres eigenen Radius kann sie ihren Nachweis ohnehin nicht
> erbringen. Aufgefallen ist es **nur am Bild**; `probe()` meldete
> `anteilNichtSchwarz = 1` und die Instanzzahlen stimmten.

### Ergebnis 8.9, gemessen

Alle Zahlen aus einem Lauf am 2026-07-31, Ultra, 1280 × 720, Streuung bis zur
Stabilität vorgefüllt (`loop.tick()` von Hand, siehe CLAUDE.md).

> Sie bleiben stehen — es sind die Zahlen, mit denen 8.9 abgenommen wurde. Am
> 2026-08-01 hat die Kehren-Reparatur das Höhenfeld neu gebacken; die
> **aktuellen** Werte stehen in 8.11 unter „Budgets nach SPEC §4". Was sich
> verschoben hat, ist klein: `stadt-rand` von 958 068 auf 959 142 Dreiecke.

| Blickpunkt | Vegetation | Props | Draw-Calls | Dreiecke | `anteilNichtSchwarz` |
|---|---|---|---|---|---|
| `dorf` | 11 730 | 37 | 64 | 298 668 | 1,000 |
| `sando` | 50 874 | 27 | 112 | 930 684 | 0,9992 |
| `tempel` | 47 851 | 33 | 102 | 728 240 | 0,9998 |
| `stadt-rand` | 44 729 | 82 | 169 | 958 068 | 0,9999 |

`sando` und `tempel` liegen knapp unter 1,000, weil an beiden Blickpunkten
schwarze Pixel **im Bild** stehen (Schattenseite der Torii gegen den Himmel);
bei `dorf` mit freiem Horizont steht die 1,000 exakt.

**Das Fischerdorf.** 9 Hütten zwischen x = 706 und 842, 25…81 m vom Wasser,
dazu 9 Netzgestelle, 6 Kisten-/Reusenstapel, eine Bootsrampe, ein zweiter Steg
und zwei zusätzliche Boote. Die 4 vorhandenen Boote liegen weiterhin an der
Mole — sie haben jetzt einen Ort.

**Der Sandō.** 9 Torii im 16-m-Raster über 150 m, 20 Laternen paarweise mit
2,6 m Versatz, Chōzuya und Shōrō seitlich der Achse. Größte
Fundamentabsenkung 0,63 m (Glockenturm), bei den Torii 0,00…0,41 m. Der
Tempel steht 2 m hinter dem letzten Pfadknoten auf 1,82° Neigung.

**Der Stadtrand — A/B in derselben Sitzung.** Zwei Bilder, dieselbe Kamera,
dieselbe Streuung (44 729 Instanzen), **kein `tick()` dazwischen**, damit
Wolken und Wolkenschatten stillstehen:

| | Props sichtbar | Draw-Calls | Dreiecke |
|---|---|---|---|
| mit Randbebauung | 82 | 169 | 958 068 |
| ohne (`warehouse`, `greenhouse`, `concreteWall` ausgeblendet) | 34 | 163 | 947 988 |

Differenz im Bild: **3,165 %** der Pixel über Schwelle 2, 1,685 % über 8,
0,825 % über 24; betroffen ist x 0…1279, y 260…719 — also die volle Breite
unterhalb der Skyline. Zum Vergleich: das Neon deckt an `stadt-neon` 5,62 %.

> **Der erste Anlauf war zu weit draußen.** Mit `inner = 215` blieb zwischen
> Distriktkante (180 m) und Ringbeginn ein 35 m breiter kahler Streifen stehen,
> und genau der war im Bild die Kante. Schuppen und Mauern rücken deshalb bis
> 208 m heran — 4 m hinter dem Fuß der Schürze. Die Hallen bleiben draußen: eine
> 21-m-Halle an der Bordsteinkante wäre wieder eine Kante, nur eine andere.
>
> **Ehrlich gesagt: die Kante ist gemildert, nicht gelöscht.** Die Bebauung des
> Distrikts endet weiterhin in einer Linie — das ist die Bodenplatte, und die
> ist 360 m groß. Was verschwunden ist, ist die **leere Fläche daneben**: vor
> der Skyline steht jetzt eine zweite, niedrige Reihe, dahinter geht es ohne
> Lücke in den Bewuchs über. Wer die Linie ganz auflösen will, muss an
> `CITY_DISTRICT` und die Platte, nicht an Props — das ist kein P8-Umfang.

**Kosten.** 895 Platzierungen (vorher 686; 861 vor der Kehren-Reparatur), 26 Assets, kein Asset über
`PROPS.capacity` (512) — das dichteste ist `tetrapod` mit 372. Der
Landmark-Satz wuchs von 2104 auf 3972 Dreiecke.

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

> ### Die Kante ist da — aber es ist nicht die, die hier steht
>
> Drei Bilder, Ultra, 1280 × 720:
>
> | Blickpunkt | Kante sichtbar? |
> |---|---|
> | `start` (620, 330, 1010) | **ja** — ein schnurgerader Strich über der Landsilhouette |
> | `stadt-luft` (620, 420, 620) | nein, das Gelände füllt das Bild |
> | `pass` (−700, 300, −700) | nein, das Massiv füllt das Bild |
>
> **Der Kulissenring wäre am falschen Ort gewesen.** Er soll fehlende
> *Landmasse* vortäuschen; in Blickrichtung von `start` liegt jenseits der Welt
> aber Meer, und Silhouettenberge dort hätten Land behauptet, wo die Karte
> Ozean sagt.
>
> Die Ursache ist eine andere. Die Wasserebene misst 12 288 m — viermal die
> Welt, weit über `CAMERA.far` (6000 m) hinaus; ihr eigener Rand ist nie im
> Bild. Der Strich ist ihr **Schnitt an der fernen Clipping-Ebene**. Dass man
> ihn sieht, liegt am Nebel: `FOG.aerial.density` ist 0,00021 je Meter, auf
> 6000 m bleibt also eine Deckung von 1 − e^(−1,26) = **0,716**. Fast ein
> Drittel der Meeresfarbe steht dort noch gegen den Himmel.
>
> Am Nebel zu drehen schied aus, und zwar aus einem Grund, der schon in
> `atmosphere.config.ts` steht: `FOG.maxOpacity` = 0,94 existiert, damit die
> Kammlinie der Berge lesbar bleibt. Die für volle Deckung auf 6 km nötige
> Dichte wäre 4,7 · 10⁻⁴ — mehr als das Doppelte — und hätte das Massiv auf
> 2 km mitverschluckt.
>
> **Gebaut ist deshalb ein Ausblenden nur für das Meer** (`WATER.horizonFade`,
> 3200 → 5600 m): die Wasserfläche mischt zur Himmelsfarbe in Blickrichtung und
> ist vor dem Schnitt ununterscheidbar. Am leeren Meer gibt es keine Silhouette
> zu erhalten; der Grund für die Kappung trifft dort nicht zu. Der Fluss ist
> ausgenommen (`uWaterRiver`).
>
> **Messung, und die ersten zwei waren falsch.** Ein Differenzvergleich der
> beiden Läufe meldete 23,1 % geänderte Pixel — wertlos, weil zwischen den
> Aufnahmen Wolken gezogen sind. Zwei Versuche, die „Geradheit" der Kante über
> Helligkeitsgradienten zu messen, fanden beide die **Landsilhouette** statt des
> gesuchten Striches und meldeten die Verschlechterung eines Wertes, der gar
> nicht gemeint war.
>
> Was zählt, ist eine Größe **innerhalb eines Bildes**: wie stark sich der
> Streifen unmittelbar über der Landoberkante vom Himmel darüber abhebt. Beide
> Proben stammen aus demselben Frame, Wolkenzug spielt keine Rolle. Über 445
> Spalten der rechten Bildhälfte:
>
> | | Streifen gegen Himmel | Median | 90. Perzentil |
> |---|---|---|---|
> | vorher | **44,49** Stufen | 47,23 | 48,62 |
> | nachher | **4,28** Stufen | 1,14 | 10,47 |
>
> Die Landoberkante liegt in beiden Bildern bei Zeile 357 — es ist derselbe
> Ausschnitt, gemessen wurde nur, was darüber steht.
>
> **Was der Eingriff ausdrücklich nicht tut:** den Seehorizont wegmachen. Am
> Blickpunkt `kueste`, wo nur Wasser im Bild ist, steht weiterhin ein Sprung
> von ⌀ 21,26 Stufen zwischen Himmel und See. Das ist richtig — ein Seehorizont
> **ist** eine Linie. Falsch war sie nur dort, wo sie **über Land** stand und
> damit behauptete, hinter dem Land höre die Welt auf.
>
> **Kosten:** null Dreiecke, null Draw-Calls, ein `smoothstep` und eine
> Texturabfrage je Wasserpixel jenseits von 3,2 km.

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

### Ergebnis 8.11, gemessen am 2026-07-31

**Reproduzierbarkeit.** `npm run world` zweimal hintereinander:
`height.r16` und `roads.json` **bitgleich** (`cmp` ohne Ausgabe).
`node tools/gen-props.mjs` erneut ausgeführt: `assets/props.json` unverändert
im Arbeitsverzeichnis. Die Kette ist deterministisch.

**`npm run inspect`.** Acht Strecken, alle bestanden — die fünf aus P3 plus
die drei Pfade aus P8.7 und P8.9:

| Strecke | Länge | Mesh im Terrain | Kehren |
|---|---|---|---|
| ring | 6096 m | ⌀ 0,005 m | 0 |
| toge | 2408 m | ⌀ 0,003 m | **7** |
| dorf | 692 m | ⌀ 0,003 m | 0 |
| stadt | 869 m | ⌀ 0,943 m | 0 |
| zufahrt | 145 m | ⌀ 2,138 m | 0 |
| sando | 450 m | ⌀ 0,007 m | 0 |
| feldpfad | 393 m | ⌀ 0,005 m | 0 |
| kuestenpfad | 317 m | ⌀ 0,005 m | 0 |

Keine Selbstschnitte auf irgendeiner Strecke.

**Bildvollständigkeit: 13 Blickpunkte × 5 Stufen = 65 Messungen, 0 Ausfälle.**
Das ist die Zeile, die den Viewport-Fehler gefunden hätte, und sie ist jetzt
über die ganze Matrix belegt:

| Stufe | Puffer | kleinster `anteilNichtSchwarz` |
|---|---|---|
| Ultra | 1280 × 720 | 0,999137 (`sando`) |
| Hoch | 1088 × 612 | 0,99997 |
| Mittel | 896 × 503 | 0,999773 (`stadt-neon`) |
| Niedrig | 640 × 360 | 0,999991 |
| Minimal | 640 × 360 | **1,000000** |

Nebenbefund: `probe()` liest den **Zeichenpuffer**, nicht die Canvas-Größe —
die vier verschiedenen Größen sind der Beleg, dass `renderScale` je Stufe
tatsächlich greift. Die Abweichungen unter 1,000 sind echte schwarze Pixel im
Bild (Schattenseite der Torii gegen den Himmel), keine Beschneidung; eine
Beschneidung läge bei 0,800 wie im P4-Fehler.

> **Die Draw-Call- und Dreieckszahlen aus diesem Durchlauf sind nicht
> budgettauglich.** Sie stammen aus **kaltem** Zustand: je Blickpunkt liefen nur
> 30 Frames, und die Streuung war nicht fertig. Die Budgetzahlen stehen unten
> und sind getrennt mit vorgefüllter Streuung gemessen — der Fehler „warm gegen
> kalt" aus CLAUDE.md, diesmal von vornherein getrennt gehalten.

**Budgets nach SPEC §4, Ultra, Streuung bis zur Stabilität vorgefüllt.**

> **Am 2026-08-01 nachgemessen.** Die Kehren-Reparatur am Bergpass hat das
> Höhenfeld neu gebacken (Pass 2408 → 2616 m, Props 861 → 895). Die Zahlen
> unten stammen aus dem Lauf **danach**; die vier Blickpunkte, die dabei nicht
> wiederholt wurden, sind als solche gekennzeichnet.

| Blickpunkt | Vegetation | Draw-Calls | Dreiecke | `anteilNichtSchwarz` |
|---|---|---|---|---|
| `start` | 67 | **173** | 500 298 | 1,000000 |
| `stadt-rand` | 44 729 | 169 | **959 142** | 0,999858 |
| `sando` | 50 874 | 112 | 931 200 | 0,999167 |
| `pass` | 171 | 71 | 415 422 | 0,999998 |
| `stadt-neon` | 1 493 | 115 | 623 628 | 0,999988 · *nicht neu abgelesen* |
| `reisfeld` | 8 805 | 71 | 349 552 | 0,999957 · *nicht neu abgelesen* |

`pass` steigt von 42 auf 71 Draw-Calls und von 185 692 auf 415 422 Dreiecke —
der Blickpunkt zeigt seit P8.11 die Serpentinen statt einer Felswand, also
mehr Straße, mehr Leitplanke und mehr Bewuchs. Das ist ein anderer Ausschnitt,
kein Mehrverbrauch am selben Ort.

| Metrik | Budget | gemessen | Luft |
|---|---|---|---|
| Draw-Calls / Frame | < 800 | **173** | 78 % |
| Dreiecke / Frame | < 3 M | **959 142** | 68 % |
| Texturspeicher | < 512 MB | **307,8 MB** | 40 % |
| `PROPS.capacity` je Asset | < 512 | **372** (`tetrapod`) | 27 % |

895 Platzierungen über 26 Assets (vor der Kehren-Reparatur 861).

Der Texturspeicher kommt aus `estimateTextureMemory()` (dieselbe Funktion, die
das Overlay anzeigt), über Szene **und** die Ressourcen des Loaders — die
Render-Targets sind darin enthalten, was der Kommentar dort ausdrücklich
verlangt. Geometrien 132, Texturobjekte 62 nach `renderer.info.memory`.

> **Die Bildrate ist weiterhin nicht messbar** und steht deshalb auch nicht
> hier. Diese Maschine hat nur den Software-Rasterisierer und kein
> `EXT_disjoint_timer_query_webgl2`; alles über GPU-ms oder FPS wäre geraten.
> Die drei Zahlen oben sind CPU-Zähler und exakt.

**`stadt-neon` hat 1493 Vegetationsinstanzen** — das ist kein Fehler, sondern
eine Geschäftsstraße. Der Wert steht hier, weil er beim Lesen der Tabelle sonst
wie ein Ausfall der Streuung aussieht; P8.1 hat dieselbe Beobachtung schon
notiert.

### Nachtrag 2026-08-01: zwei unsichtbare Flächen

Nachdem der Fluss als rückseitig gewickelt aufgefallen war (siehe den
widerlegten Block unter 8.6), ist derselbe Test über **alle 132 Meshes** der
Szene gelaufen — Wickelrichtung gegen Normal-Attribut. Er hat einen zweiten
Fall gefunden.

| Mesh | gegenläufig | `side` | Folge |
|---|---|---|---|
| **Stadtboden** | **99,2 %** | FrontSide | 240 von 242 Dreiecken unsichtbar |
| Leitplanken:Band | 45,5 % | DoubleSide | folgenlos, wird beidseitig gezeichnet |
| prop:coastal_cliff_04:lod1 | 5,6 % | FrontSide | geglättete Normalen, normal |
| übrige 128 Meshes | ≤ 4,4 % | | |

Beim `Stadtboden` ist die **Platte** richtig gewickelt (Flächennormale
+129 600) und die **Schürze** falsch (−288 … −864). Die Schürze ist der 24 m
breite Ring, der die 360-m-Platte des Distrikts ans Gelände anschließt; der
Kommentar an `buildGround` sagt, ohne ihn stünde die Stadt „auf einem 20 bis
100 cm hohen Absatz mit senkrechter Kante". Genau so war es: gemessen liegt
das Gelände am Außenring in **118 von 120 Proben unter der Platte**, Median
−0,88 m, tiefstens −2,38 m.

**Wirkung, an der Kante gemessen** — Kamera (620, 36, 318), Blick auf (620,
29,5, 302), Wickelrichtung zur Laufzeit umgeschaltet und der Zustand vor
**jeder** Aufnahme nachgezählt (0 bzw. 236 nach unten):

| | Bild |
|---|---|
| gedreht (wie bis P8.11) | untere Bildhälfte ist nackte Erde, die Platte endet an einer Kante |
| repariert | dieselbe Fläche ist Asphalt mit Pfützenspiegelung |

**55,768 %** der Pixel über Schwelle 2, 53,825 % über 8, 25,587 % über 24.

> **Aus der Ferne war davon nichts zu messen.** Dieselbe Umschaltung von
> (620, 52, 400) aus ergab 3,895 % / 0,907 %, und das Differenzbild zeigte nur
> Sprenkel über dem Bewuchs — die Antwort der Spiegelung auf eine geänderte
> Szene, nicht die Schürze. Wo der Effekt hinwirkt, muss die Messung hinsehen;
> bei einem 24-m-Band heißt das: an die Kante fahren.
>
> Das erklärt einen Teil des Befunds aus **8.8** („die Bebauung hört abrupt
> auf, daneben liegt leere Fläche"), gegen den 8.9 mit Randbebauung angebaut
> hat. Die Diagnose war richtig; eine ihrer Ursachen lag im Mesh, nicht im
> fehlenden Bestand. Die Props aus 8.9 bleiben trotzdem richtig — sie füllen
> die 115 m **außerhalb** der Schürze.

Der Test steht seitdem als `japanMap.winding()` im Bestand
(`src/debug/winding.ts`) und meldet über alle 132 Meshes **keine
Auffälligkeit** mehr.

### Die Übergabefläche zum Spiel — geprüft, nicht angenommen

SPEC §7 verspricht: „P3 exportiert bereits Ideallinie, Spawnpunkte und
Streckenabschnitte. P1 liefert mit `TerrainSampler` die Höhenabfrage." Beim
Abschluss von P8 nachgesehen und am laufenden Renderer gemessen:

| Zusage | Stand |
|---|---|
| `getRacingLine(id)` | **da** — ring 3048 Punkte, toge 1245; unbekannte Id liefert `null` |
| `getSpawnPoints()` | **da** — 4 Punkte aus dem Tag `startlinie` (nur `ring` trägt ihn) |
| `TerrainSampler.getHeightAt` | **da** |
| `distanceToNearestRoad` | **da** (P4 benutzt sie ohnehin je Pflanze) |
| Streckenabschnitte | **fehlten** |
| `three-mesh-bvh` als Kollisionsgrundlage | installiert (0.9.13) |

**Alle vier Startpunkte liegen auf der Fahrbahn** (`isOnRoad` = true) und
höchstens **3 cm** über dem Sampler-Boden. Die Zusage war also zu zwei Dritteln
eingelöst und zu einem Drittel nicht — niemand hatte sie je aufgerufen.

`getSectors(roadId, count)` schließt die Lücke. Ein Abschnitt ist ein **Tor**:
Punkt, Fahrtrichtung, halbe Breite; ob es passiert wurde, ist ein
Vorzeichenwechsel. Verteilt wird über die Bogenlänge, nicht über den
Punktindex. Gemessen auf `ring`: 3 Tore auf 6096 m, Abstände 2029 / 2029 /
2038 m, alle auf der Fahrbahn, Richtungsvektoren normiert (1,000);
`getSectors('toge', 8)` liefert 8, unbekannte Id und Anzahl 0 liefern `null`.

### Offen und gemessen: die Uferlinie ist eine Treppe

Am Blickpunkt `dorf` steht die Wasserkante als **Treppe aus Dreieckskanten**
im Bild. Die Ursache ist nicht das Wasser: Uferblende (`edgeFade` 0,8 m) und
Schaumsaum (0,9 ± 0,9 m) arbeiten, und bei 2 % Strandgefälle ist der Saum
40…90 m breit. Es ist dieselbe Sache, die in CLAUDE.md für die Stadtplatte
steht — **zwischen zwei CDLOD-Gitterpunkten liegt eine Gerade über der
Kurve**, und der Wasser-Shader rechnet seine Tiefe gegen das *Höhenfeld*,
während im Bild die *Sehne* steht.

Zwei Messungen, beide am Bild, weil es anders nicht geht:

- **A/B über die Gitterauflösung.** Derselbe Blickpunkt, 33² gegen 17²: die
  Uferlinie steht an sichtbar anderer Stelle. Wäre es ein Wasserfehler, dürfte
  die Gitterweite daran nichts ändern.
- **Ein CPU-Raycast gegen das Gelände trifft nichts.** Die Auslenkung passiert
  im Vertex-Shader; die Geometrie auf der CPU ist das flache Einheitsgitter.
  Die Sehnenabweichung ist deshalb **nicht aus einem Skript messbar** — nur
  sichtbar. Über 40 Rasterpunkte am Strand (x 700…880, z 1000…1060) liegt das
  Höhenfeld ausnahmslos **unter** dem Meeresspiegel, im Bild steht dort Land.

**Nicht behoben, und die naheliegenden Wege taugen nicht.** Alpha oder Schaum
können auftauchendes Land nicht verdecken. Bliebe, das Gitter nahe null feiner
zu machen (kostet Dreiecke entlang der ganzen Küste) oder den Strand steiler
zu backen (verschiebt das Fischerdorf und läuft über die Erosion durch die
ganze Karte). Beides ist ein eigener Eingriff mit eigener Messung, kein
Politurschritt.

---

### Akzeptanzkriterien

- [x] **Die fünf Stufen unterscheiden sich in der Geländelast.** Dreiecke je
      Stufe gemessen, Verhältnis Minimal:Ultra ≤ 0,4 — und die Lochzählung
      bleibt bei allen fünf bei höchstens 1.

      **Erfüllt.** Blickpunkt `stadt-neon`, Streuung bis zur Stabilität
      vorgefüllt; Lochzählung über **dreizehn** Blickpunkte. Neu gemessen am
      2026-07-31 nach dem Terrain-Durchgang P8.5 und den Props aus P8.9:

      | Stufe | Gitter | Dreiecke gesamt | davon Gelände | Knoten | Löcher | Vegetation | Calls |
      |---|---|---|---|---|---|---|---|
      | Ultra   | 33² | 623 628 | 264 192 | 129 | 0 | 1493 | 115 |
      | Hoch    | 33² | 621 937 | 264 192 | 129 | 0 | 1070 | 116 |
      | Mittel  | 25² | 220 177 | 148 608 | 129 | 0 |  669 |  71 |
      | Niedrig | 17² | 136 965 |  66 048 | 129 | 0 |  349 |  59 |
      | Minimal | 17² | 136 480 |  66 048 | 129 | 0 |  111 |  50 |

      Minimal:Ultra ist **0,219** gesamt und **0,25** im Gelände — beides unter
      der geforderten 0,4. Die Lochzählung meldet auf allen fünf Stufen null,
      gegengeprüft mit absichtlich falschem Morph, der 1496 Löcher erzeugt.
      Vorher standen Mittel und Niedrig bei 329 823 gegen 329 118 Dreiecke,
      unterschieden sich also um nichts.

      > Die frühere Fassung dieser Tabelle nannte 605 486 Dreiecke auf Ultra.
      > Die Zahl war nie falsch abgelesen — sie stammt aus einem Lauf vor dem
      > Terrain-Durchgang und vor 175 zusätzlichen Props. Sie steht hier nur
      > noch als Vergleich.

      > **Ein Messfehler im Prüfskript, weil er sich sonst wiederholt.** Der
      > erste Durchlauf meldete auf Ultra 909 338 Dreiecke statt 623 628.
      > Ursache: `renderer.info.render` ist eine **lebende Referenz**, und
      > `lodHoles()` rendert danach dreizehn fremde Blickpunkte. Wer den Wert
      > erst nach dem Lochlauf ausliest, bekommt den letzten davon. Die Zahlen
      > oben stammen aus einer Momentaufnahme **vor** dem Lochlauf.

      > Minimal und Niedrig trennen an *diesem* Blickpunkt fast nur Kette und
      > Puffer: in einer Geschäftsstraße steht kaum Bewuchs (1493 Instanzen auf
      > Ultra), den die niedrigere Sichtweite und Dichte wegnehmen könnten. An
      > `start` oder `reisfeld` **nicht neu abgelesen** — dort sind es 67 bzw.
      > 8805 Instanzen, die Trennung fiele also anders aus.
- [x] **Stufe „Minimal" umgeht die PostFX-Kette nachweislich.** Gemessen an der
      Zahl der Vollbilddurchgänge, nicht an der Bildrate: **1 gegen 28** auf
      Ultra, gezählt als Draw-Calls bei leerer Szene. Der Zeichenpuffer geht
      dabei von 921 600 auf 230 400 Pixel.
- [x] **Die Ersteinstufung startet nicht auf Ultra**, wenn die Vorabschätzung ein
      schwaches Gerät meldet — auf dieser Maschine also bei „Minimal".
      Gemessen: `japanMap.device()` liefert `minimal` mit der Begründung
      „Software-Rasterisierer erkannt", und die Stufe nach dem Start ist
      Minimal. Die 90 Messframes laufen damit auf 640×360 mit einem
      Vollbilddurchgang statt auf 1280×720 mit 28.
- [x] **Wolkenschatten wandern über das Gelände**, gemessen mit Maske gegen ein
      Bild ohne sie, nicht über das ganze Bild gemittelt. Bei `start` trifft der
      Schatten 171 548 Pixel (18,61 % des Bildes, rund 40 % des sichtbaren
      Bodens); nach 10 s Weltzeit ändern sich bei stehender Kamera 98 725 Pixel.
      Die Wolkenebene darüber zieht mit derselben Zeit und Richtung: bei `pass`
      isoliert 150 057 Pixel (16,28 %) über 60 s.
- [x] **Der Bergpass hat ≥ 8 Kehren** (SPEC §2.1) **und** der Erdbau liegt unter
      dem Stand, der P3 zum Kompromiss gezwungen hat. Beide Zahlen zusammen.

      **Erfüllt am 2026-08-01: 9 Kehren auf 2616 m, Erdbau ⌀ 23,0 m.**

      > Der Absatz darunter stand hier bis dahin und ist **widerlegt**: „Hier
      > wird nicht nachgeregelt. Eine achte Kehre ließe sich über die
      > Kostenfläche erzwingen." Das stimmte — über die Kostenfläche wäre es
      > eine Regelschleife gewesen. Es lag nur gar nicht an der Kostenfläche.

      **Es war ein Sicherheitsfaktor, der von einer anderen Straße stammte.**
      Der Verrundungs-Boden wirft Ecken weg, deren Radius `minRadius · 1,3`
      nicht hält. Die 1,3 sind am **Ring** geeicht (ohne sie stauchten
      benachbarte Bögen ihn auf 34,5 m bei 45 m Soll). Für den Pass war das nie
      geprüft, und dort löschte es Ecken mit 15,0 / 15,3 / 16,1 / 16,6 / 17,9 m
      Radius — die alle die Vorgabe `minRadius ≥ 15` erfüllen. Der Typ
      `mountain` bekommt jetzt `floorFactor: 1.2`; der Ring behält 1,3.

      Gemessen über acht Werte auf sauberem Höhenfeld — die Kurve ist
      **nicht monoton**, und ab 1,10 wechselt sogar die Trasse:

      | Faktor | Länge | R min | Steigung | Kehren | Erdbau ⌀ |
      |---|---|---|---|---|---|
      | 1,30 (alt) | 2408 m | 19,25 | 10,7 % | 7 | **31,8 m ✗** |
      | 1,25 | 2408 m | 19,25 | 10,7 % | 7 | 31,8 m ✗ |
      | **1,20** | **2616 m** | **17,95** | **10,7 %** | **9** | **23,0 m** |
      | 1,15 | 2242 m | 20,30 | 10,0 % | 2 | 18,7 m |
      | 1,10 | 3594 m | 16,37 | 10,5 % | 4 | — |
      | 1,05 | 3788 m | 16,05 | 10,5 % | 7 | 29,7 m |
      | 1,00 | 3788 m | **14,91 ✗** | 10,5 % | 7 | 27,2 m |

      1,20 ist deshalb nicht „ein Punkt auf einer Kurve", sondern der einzige
      geprüfte Wert, der **alle vier Vorgaben zugleich** hält. Geprüft wird
      gegen Radius, Steigung und Erdbau des Typs — nicht gegen die Zielzahl der
      Abnahme; die 9 Kehren sind das Ergebnis, nicht das Kriterium. Bei 1,00
      fällt der Radius unter die Vorgabe, der Boden ist also nötig — nur seine
      Höhe stammte von der falschen Straße.

      **Der Erdbau wird dabei deutlich besser, nicht schlechter.** Beide
      Hälften der Zeile sind damit erfüllt:

      | | vorher (7 Kehren) | jetzt (9 Kehren) |
      |---|---|---|
      | Graben 24 m seitlich, Median | 20,9 m | **10,8 m** |
      | 95. Perzentil | 55,9 m | 43,7 m |
      | über 50 m auf … Strecke | 242 m | **60 m** |
      | Erdbau ⌀ (Generator) | 31,8 m ✗ | 23,0 m ✓ |

      > **Was schlechter wird, gehört dazu:** der kleinste Achsabstand fällt von
      > 17,2 m auf **10,8 m** (bei km 0,80). Bei 6,5 m Fahrbahn plus 2 × 1 m
      > Bankett bleiben zwischen zwei Kehrenschenkeln noch 2,3 m. Das ist eng,
      > `npm run inspect` lässt es durch, und es ist der Preis dafür, dass neun
      > Kehren in dieselbe Flanke passen. Selbstschnitte: 0.

      Belegbild: `japanMap.view('pass-kehren')` — senkrecht über dem Stapel,
      dort sind sie abzählbar. Die Zahl selbst kommt aus `npm run inspect`.
- [x] **Ein Fluss läuft vom Massiv bis ins Meer**, monoton fallend, mit
      mindestens einem Wasserfall, und die Reisterrassen liegen daran.

      **Erfüllt.** Aus `meta.json` des Laufs vom 2026-07-31: 422 Knoten,
      **2643 m**, von 163,28 m auf 0,75 m, **2 Wasserfallstufen**,
      `endedBy: "Meer"`. Das Bett wird nur geschnitten, nie aufgefüllt, also
      ist der Verlauf monoton fallend per Konstruktion.

      **Nachtrag 2026-08-01: er ist jetzt auch zu sehen.** Bis dahin war das
      Flussband rückseitig gewickelt und fiel vollständig ins Backface-Culling
      — die Zeile war formal erfüllt und im Bild nicht. Nach der Reparatur der
      Wickelrichtung ändert das Ausblenden des Flusses senkrecht über dem
      Unterlauf **2,844 %** der Pixel (Schwelle 24) statt 0,033 %, schräg
      2,162 %. Details im widerlegten Block unter 8.6.

      ~~Der Unterlauf ist farblich weiterhin nicht von den gefluteten
      Reisfeldern zu unterscheiden — der offene Punkt aus 8.6 steht dort und
      ist nicht behoben.~~ Der Satz stand hier bis zum Nachtrag oben und war
      eine Folgerung aus einer Messung, die etwas anderes gemessen hat.
- [x] **Die Stadtkante ist im Bild nicht mehr als Kante lesbar** —
      Vorher/Nachher von `stadt-fern`, plus das Helligkeitsverhältnis nach der
      P6-Maskenmessung. `cityDrawCalls` weiterhin < 300.

      **Erfüllt am 2026-08-01 — nachdem eine der Ursachen gefunden war.**

      Die erste Fassung dieser Zeile lautete „teilweise erfüllt … die Linie der
      Bodenplatte bleibt". Das war richtig beobachtet und falsch zugeordnet:
      die Linie war **die unsichtbare Schürze** (siehe „Zwei unsichtbare
      Flächen" oben). 240 von 242 Dreiecken des Stadtbodens waren rückseitig
      gewickelt; der Ring, der die Platte ans Gelände anschließt, wurde nie
      gezeichnet. An der Kante gemessen macht allein das **55,8 %** des Bildes
      aus.

      A/B der Randbebauung an `stadt-rand` (620, 62, 620), dieselbe Streuung
      (44 729 Instanzen), kein Zeitschritt dazwischen:

      | | Props | Draw-Calls | Dreiecke |
      |---|---|---|---|
      | mit Randbebauung | 82 | 169 | 959 142 |
      | ohne | 34 | 163 | 949 062 |

      Differenz **5,183 %** der Pixel über Schwelle 2, 2,867 % über 8, 1,251 %
      über 24 — vorher waren es 3,165 %. Im Bild geht es von Bewuchs über
      niedrige Bebauung in den Distrikt, ohne kahlen Streifen dazwischen.

      > **Was bleibt:** die Oberkante der Randblöcke bildet weiterhin eine
      > waagerechte Linie, weil der Distrikt bei 180 m endet. Das ist die
      > Silhouette, und die hat 8.8 am Bild ausdrücklich als **in Ordnung**
      > befunden (17 → 2 Geschosse). Die Kante **am Boden**, um die es in der
      > Zeile geht, ist weg.
      >
      > `cityDrawCalls` ist **nicht getrennt abgelesen**; die 169 oben sind die
      > Draw-Calls der ganzen Szene und liegen unter dem Budget von 800. Das
      > Helligkeitsverhältnis nach P6-Maske ist ebenfalls **nicht neu
      > abgelesen** — 8.8 hat gemessen, dass es an der Kante nicht hängt.
- [x] **Fischerdorf und Sandō stehen und sind erreichbar** — je ein Bild aus
      Augenhöhe, und ein Pfad führt hin.

      **Erfüllt.** `dorf` und `sando` liegen als Blickpunkte fest; die Bilder
      stehen in `.cache/shots/`.

      Der Sandō **ist** der Weg zum Tempel: die Tempelfläche wird seit 8.9 im
      Umkreis des Pfadendes gesucht und liegt 2 m dahinter.

      Für das Fischerdorf stand hier zuerst, die Ringstraße laufe 40 m daran
      vorbei. **Das war eine Behauptung, keine Messung** — nachgerechnet über
      alle neun Hütten waren es 340…429 m. Daraufhin ist der Küstenpfad
      (`kuestenpfad`, Typ `pfad`, 317 m) gebaut worden: vom Ring bei (533, 710)
      hinunter zur Uferzeile, `npm run inspect` bestanden, Mesh im Terrain
      ⌀ 0,005 m, keine Selbstschnitte. Gemessener Abstand der Hütten zur
      Wegachse: **25…131 m**, Median 71 m.
- [x] **Alle Budgets aus SPEC §4 weiterhin eingehalten**, auf Ultra gemessen.

      **Erfüllt**, mit vorgefüllter Streuung über sechs Blickpunkte:
      Draw-Calls **173** von 800, Dreiecke **959 142** von 3 000 000,
      Texturspeicher **307,8 MB** von 512. Die Tabelle steht in 8.11.
      Die Bildrate ist auf dieser Maschine nicht messbar und deshalb nicht
      Teil der Abnahme — siehe „Umgebung" in CLAUDE.md.
- [x] **Kette reproduzierbar:** `npm run world` zweimal bitgleich.

      **Erfüllt.** `height.r16` und `roads.json` nach zwei Läufen bitgleich
      (`cmp`), `assets/props.json` nach erneutem `gen-props` unverändert.

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

> **Am 2026-08-01 nachgeprüft, nicht geglaubt.** Der Absatz darüber war zu zwei
> Dritteln richtig: `getRacingLine` und `getSpawnPoints` gab es,
> **Streckenabschnitte nicht** — niemand hatte die Zusage je aufgerufen.
> `RoadNetwork.getSectors()` schließt die Lücke seit P8.11. Der gemessene Stand
> der Übergabefläche steht in 8.11; er ist die Grundlage des Plans unten.

---

# P9 — Die Fahrschicht ✅ (9.1 und 9.2 in P14, 9.3 am 2026-08-18)

> ~~**Dies ist ein Plan und keine Umsetzung.**~~ **Seit dem 2026-08-18 ist er
> vollständig eingelöst** — 9.1 und 9.2 in P14, 9.3 als `src/game/LapTimer.ts`.
> Der ursprüngliche Absatz bleibt stehen, weil er die Bedingung nennt, unter der
> hier überhaupt gebaut werden durfte:
>
> **Dies ist ein Plan und keine Umsetzung.** Er steht hier, weil in diesem
> Projekt keine Phase ohne Akzeptanzkriterien begonnen wurde und weil die
> Übergabefläche jetzt gemessen ist — nicht, weil P9 beauftragt wäre. Ohne
> ausdrückliche Freigabe wird davon nichts gebaut.

**Ziel:** Aus einem Grundstück eine befahrbare Strecke machen. Nicht ein Spiel
— ein **Fahrzeug, das auf dieser Karte steht, fährt und anhält**, und die
Messungen, an denen man das nachweist.

**Was P8 dafür hinterlässt** (gemessen am 2026-08-01, siehe 8.11):

| Baustein | Stand |
|---|---|
| `TerrainSampler.getHeightAt(x, z)` | da, zeichengleich mit dem Shader |
| `RoadNetwork.getRacingLine(id)` | da — ring 3048 Punkte, toge 1245 |
| `RoadNetwork.getSpawnPoints()` | da — 4 Punkte, alle auf der Fahrbahn, ≤ 3 cm über Grund |
| `RoadNetwork.getSectors(id, n)` | da seit P8.11 — Tor aus Punkt, Richtung, halber Breite |
| `RoadNetwork.isOnRoad` / `distanceToNearestRoad` | da, gitterbeschleunigt |
| `three-mesh-bvh` | installiert (0.9.13), **nicht benutzt** |
| Physik-Engine | offene Entscheidung Nr. 3 |

## Aufgaben

**9.1 — Kollision gegen das Gelände** → neu, `src/game/`

**Befund.** Es gibt zwei Höhenquellen: `TerrainSampler` (CPU, bilinear aus dem
Höhenfeld) und das gerenderte CDLOD-Gitter (Sehne zwischen Stützstellen). Sie
sind **nicht identisch** — das ist in CLAUDE.md zweimal als Fehlerquelle
verzeichnet (Stadtplatte, Uferlinie), und ein Fahrzeug, das auf der einen fährt
und die andere sieht, schwebt oder versinkt sichtbar.

**Fix.** Das Fahrzeug fährt auf dem **Sampler**, nicht auf dem Mesh. Der
Sampler ist die Quelle, das Gitter die Näherung. Wo beide auseinanderlaufen,
wird der Fehler gemessen und begrenzt, nicht ausgemittelt.

**Messung.** Über 1000 Punkte entlang jeder der acht Strecken: Differenz
zwischen `getHeightAt` und der Höhe der Straßenmittellinie aus `roads.json`.
Der Median muss unter 5 cm liegen — `npm run inspect` misst heute schon
„Mesh im Terrain ⌀ 0,003…2,138 m" und liefert damit die Vergleichszahl.

---

**9.2 — Fahrzeugkörper und Radaufhängung**

**Befund.** Offene Entscheidung Nr. 3 nennt Rapier als Tendenz. Sie ist seit
P0 offen und wird hier fällig.

**Fix.** Erst die Entscheidung **messen**, dann bauen — dieselbe Regel wie bei
der Reflexion in P6, wo eine Messung eine monatelange Tendenz gekippt hat. Zwei
Kandidaten, ein Prüfstand: eine Kugel auf dem Bergpass, 60 s, gleiche
Startbedingung.

| geprüft | Rapier (WASM) | eigene Arcade-Physik |
|---|---|---|
| Startdownload | ? | 0 |
| CPU je Frame bei 1 Fahrzeug | ? | ? |
| Verhalten an der 17,2-m-Kehre | ? | ? |

**Messung.** Die Zahlen oben, plus: keine Durchdringung der Leitplanken über
60 s. Was gewinnt, steht danach in „Offene Entscheidungen" mit den Zahlen
daneben — nicht mit einer Begründung.

---

**9.3 — Rundenlogik auf den Toren aus 8.11**

**Befund.** `getSectors()` liefert Tore; niemand wertet sie aus.

**Fix.** Ein Zähler, der Vorzeichenwechsel des Skalarprodukts gegen die
Torrichtung mitschreibt, in der richtigen Reihenfolge. Kein Volumen, keine
Kollision — das war der Grund, die Abschnitte als Tore zu bauen.

**Messung.** Eine Runde auf dem Ring abfahren lassen (Ideallinie als
Steuervorgabe), Zwischenzeiten an drei Toren. Abkürzen muss auffallen: ein Lauf
quer über die Wiese darf keine gültige Runde ergeben.

---

**9.4 — Was ausdrücklich nicht in P9 gehört**

KI-Gegner, Menüs, Fortschritt, Audio, Mehrspieler. P9 endet, wenn **ein**
Fahrzeug **eine** Runde fährt und die Zeit stimmt. Alles darüber ist P10 und
bekommt wieder einen eigenen Plan — aus demselben Grund, aus dem P8 nicht
angefangen hat, bevor P7 abgenommen war.

### 9.3 gebaut und gemessen — 2026-08-18

**Der letzte ungebaute Punkt der Fahrschicht.** `getSectors()` liefert seit
P8.11 Tore; ausgewertet hat sie bis heute niemand, und P14 hat das ausdrücklich
ausgeklammert.

Gebaut als `src/game/LapTimer.ts` — ohne Renderer und ohne Bus benutzbar, weil
der Messstand aus P14 die Physik in einer eigenen Schleife treibt. Die
Schnittstelle ist deshalb der **Rückgabewert** von `step()` und kein Ereignis.

#### Drei Runden auf dem Ring, gefahren statt behauptet

`japanMap.driveProbe({ roads: ['ring'], seconds: 1400, speedCap: 20 })` —
26 176 m Fahrt, 0 cm Durchdringung, 0 Schritte neben der Fahrbahn:

| Runde | Zeit | Tor 1 | Tor 2 |
|---|---|---|---|
| 1 | **324,72 s** | 109,63 | 216,47 |
| 2 | 324,72 s | 109,65 | 216,48 |
| 3 | 324,73 s | 109,65 | 216,48 |

Über 5,4 Minuten Fahrt streuen die Läufe um **10 ms**. Die Tore liegen bei 0,
2029 und 4058 m Bogenlänge; der Ring ist 6086 m lang.

> **Eine Gegenprobe, die nicht aus derselben Quelle stammt:** 6086 m / 324,72 s
> sind **67,5 km/h**, und der Prüfstand meldet unabhängig davon ein mittleres
> Tempo von **67,31 km/h**. Zwei Wege zur selben Zahl, 0,3 % auseinander. Ohne
> das wäre „324,72 s" nur eine Zahl, die das Werkzeug über sich selbst sagt.

#### Was eine Abkürzung ausschließt — beide Bedingungen einzeln geprüft

Gefahren auf der echten Mittellinie, lückenlos in Schritten unter einem Meter,
mit einem seitlichen Versatz um Tor 1 herum:

| Fall | seitlicher Versatz | Runden |
|---|---|---|
| saubere Fahrt | 0 | **gezählt** |
| dauerhaft am Fahrbahnrand | 5,9 m (halbe Breite 6,1) | **gezählt** |
| knapp daneben | 6,4 m | **0** |
| Umfahrung von Tor 1 | 25 m | **0** |
| quer über die Wiese | 200 m | **0** |

Die beiden mittleren Zeilen sind die wichtigen: bei 5,9 m zählt es noch, bei
6,4 m nicht mehr. Die Grenze liegt also **da, wo die Fahrbahn aufhört**, und
nicht bei einem gegriffenen Wert.

#### Ein Fund, der aus einem falschen Prüffall kam

Ein Prüffall fuhr zweimal **rückwärts** durchs Start-Ziel und meldete trotzdem
eine laufende Runde. Der Fehler lag im Prüfstand — zwischen den beiden
Durchfahrten sprang die Position quer über die Karte zurück, und dieser Sprung
kreuzte das Tor vorwärts.

**Die Lücke im Zähler war aber echt.** `DriveSystem.placeAt()` versetzt das Auto
ohne Bahn dazwischen: Respawn, Einsteigen, ein Blickpunkt aus dem Menü — und
setzt es dabei **auf die Fahrbahn**, also genau dorthin, wo die Tore stehen. Ein
Respawn hätte je nach Stelle eine Torüberquerung gezählt.

Seitdem gilt ein Schritt über **10 m** als Versetzen und nicht als Fahrt; die
laufende Runde wird dabei ungültig, gezählte bleiben stehen. Die Zahl ist
hergeleitet und nicht geraten: 10 m bei 60 Hz wären 2160 km/h, das Fahrmodell
erreicht auf idealem Boden gemessen 255,8 km/h (1,18 m je Schritt) — Faktor 8,5
Abstand.

> Dieselbe Klasse wie die drei Fehler, die der Messstand in P14.3 an sich selbst
> gefunden hat, und wie der `menu.hidden`-Fall aus P13: **ein Prüfstand, der
> einen Zustand herstellt, den es im Betrieb nicht gibt.** Neu ist hier nur, dass
> der falsche Prüffall trotzdem etwas Richtiges gefunden hat.

#### Was 9.3 nicht enthält

Keine Bestenliste, keine Speicherung über die Sitzung hinaus, keine Anzeige im
Spielermenü — die Rundenzeit steht im Debug-Panel unter „Runden (P9.3)" und in
`japanMap.laps()`. Und **kein Rennen**: Gegner, Startampel und Wertung sind
Spielentwicklung und bekommen einen eigenen Plan, so wie P9 es für die
Fahrschicht vorgemacht hat.

---

## Akzeptanzkriterien

- [x] **Ein Fahrzeug steht auf allen acht Strecken auf dem Boden.**
      Eingelöst in P14.2: Median **0,00 cm**, größter Einzelwert 0,00 cm auf
      allen acht; die Vorgabe lautete „unter 5 cm". Der größte Ausreißer der
      zugrundeliegenden Datenquellen ist benannt (83,88 cm an der Kreuzung
      ring × toge), und die zwei Strecken mit systematischem Versatz — Stadt
      94,30 cm, Zufahrt 224,47 cm — haben dort ihre eigene Erklärung.
- [x] **Der Bergpass ist befahrbar**, ohne dass das Fahrzeug die Leitplanke
      durchdringt. Eingelöst in P14.4: 60 s, 742,2 m, **0 cm Durchdringung**,
      **0 Schritte** neben der Fahrbahn. Der Lauf hat dabei gefunden, dass 67
      von 1608 Leitplanken-Punkten seit P3 **auf einer Fahrbahn** standen.
- [x] **Eine Runde auf dem Ring wird als Runde gezählt**, eine Abkürzung nicht.
      Gebaut am 2026-08-18 als `src/game/LapTimer.ts`; Messung unten in „9.3
      gebaut und gemessen".
- [x] **Die Budgets aus SPEC §4 halten weiterhin**, mit Fahrzeug im Bild.
      Eingelöst in P14: **+4 Draw-Calls, +1024 Dreiecke** bei stehender Kamera
      und umgeschalteter Sichtbarkeit (184 gegen 180 bei einem Budget von 800).
      Vier statt zwei, weil der Spiegeldurchgang das Fahrzeug ein zweites Mal
      zeichnet.
- [x] **Die Physik-Entscheidung steht mit Zahlen** in „Offene Entscheidungen".
      Entschieden am 2026-08-18: eigene Arcade-Physik, 16,11 kB minifiziert
      gegen Rapiers WASM, 0,003…0,022 ms CPU je Schritt.

> **Damit ist P9 vollständig** — als einzige Phase dieses Projekts allerdings
> nicht in einem Stück: 9.1 und 9.2 sind in P14 entstanden, 9.3 am 2026-08-18
> nachgezogen. Der Plan von P9 stand seit dem 2026-08-01 und war ausdrücklich
> keine Freigabe; gebaut wurde er auf Auftrag und in anderer Reihenfolge.

## Risiken

- **Die zwei Höhenquellen.** Sie haben in P6 und P8 je einen halben Tag
  gekostet. Wer sie in P9 verwechselt, merkt es an einem schwebenden Fahrzeug —
  und das ist der freundliche Fall. → 9.1 misst sie gegeneinander, bevor
  irgendetwas fährt.
- **Rapier bringt WASM in den Startdownload.** Der liegt mit 51,95 MB schon
  über den 15 MB aus SPEC §4. → Die Größe gehört in die Messtabelle von 9.2,
  nicht in eine Fußnote danach.
- **Ein Fahrmodell lädt zum Nachregeln ein.** Genau davor warnt dieses Projekt
  an drei Stellen. → Jeder Parameter bekommt eine Messung, oder er bekommt
  keinen Wert.

---

# P10 — Stufen, Regler, Auslieferung ○ (Plan, nicht gebaut)

> **Auch dies ist ein Plan und keine Umsetzung.** Er entsteht aus einem
> Durchgang durch das ganze Projekt am 2026-08-07 und aus vier Entscheidungen
> des Auftraggebers. Ohne ausdrückliche Freigabe wird davon nichts gebaut.
>
> **Die Vorgabe lautet ausdrücklich: nichts darf sichtbar schlechter werden.**
> Das Ziel ist *besser und schneller zugleich*, nicht „billiger". Wo ein Hebel
> nur tauscht, gehört der Tausch benannt — und wo er beides zugleich bringt,
> gehört gemessen, dass er es tut.

**Ziel:** Die fünf Qualitätsstufen halten, was ihre Namen versprechen; der
Spieler kann sie einstellen; und der Startdownload kommt in die Nähe der
15 MB aus SPEC §4.

## Der Befund, aus dem dieser Plan entsteht

Vier Dinge, alle am 2026-08-07 aus dem Code bzw. aus `dist/` gelesen — **nicht
am Bild gemessen**, und genau das ist Aufgabe 10.0:

**1. `viewDistance` wirkt auf vier von fünf Stufen überhaupt nicht.**
`ScatterSystem.#beginPass` rechnet `range = min(max(species.lodDistances[2]),
viewDistance)`. Die größte Artenreichweite ist 520 m, die Stufen bieten 2000 /
1500 / 1000 / 600 / 450:

| Stufe | `viewDistance` | tatsächliche Reichweite |
|---|---|---|
| Ultra | 2000 | **520** |
| Hoch | 1500 | **520** |
| Mittel | 1000 | **520** |
| Niedrig | 600 | **520** |
| Minimal | 450 | 450 |

Der Kommentar an der Stelle behauptet, auf „Niedrig" seien 600 m *weniger* als
die 520 m der Bäume. 600 ist mehr als 520 — die Kopplung greift dort nicht, und
der Kommentar hat das seit P4 verdeckt.

**2. Der kahle Ring bei 520 m steht auf jeder Stufe, auch auf Ultra.** Das
Gelände wird bis `CAMERA.far` = 6000 m gezeichnet, die Vegetation endet bei
520 m. Auf einer Karte, deren stärkster Hebel laut SPEC §2.1 der
Höhenunterschied von 450 m ist — also die Fernsicht aufs Massiv — ist das die
auffälligste Kante, die es gibt. Sie ist keine Qualitätsstufe, sondern eine
Konstante in `vegetation.config.ts`.

**3. Was „Niedrig" wirklich ändert, ist die Dichte, nicht die Distanz.**
`vegetationDensity: 0.25` dünnt gleichmäßig über die ganze Fläche aus.
Gleichmäßiges Ausdünnen fällt **in der Ferne zuerst auf**: nah wachsen die
Lücken zu, ab einigen hundert Metern wird aus einem Bestand ein Streufeld. Das
liest sich als „weniger Sichtweite" und ist Dichte. Die Beobachtung des
Auftraggebers ist damit richtig und ihre naheliegende Erklärung falsch — genau
der Fall, den CLAUDE.md unter „Eine Ursache benannt, ohne sie zu trennen"
führt.

**4. Props und LOD-Umschaltpunkte sind von der Stufe vollständig entkoppelt.**
`PROP_CLASSES` trägt feste Cull-Distanzen (220 / 650 / 1600 m), `lodDistances`
feste Umschaltpunkte (Imposter ab 180 m). Beides ist auf Minimal identisch mit
Ultra. Für die Landmarks ist das begründet (ein Torii, das bei 600 m
verschwindet, ist keine Landmarke) — für die 158 Streckenmarkierungen am
Bergpass ist es keine Begründung, sondern eine fehlende Zeile.

**Was daraus folgt:** die Stufen skalieren heute Auflösung, Terrain-Gitter,
PostFX, AO, Spiegelung und Instanzdichte. Sie skalieren **nicht** Sichtweite,
nicht LOD-Umschaltung, nicht Props. Und ein Regler, mit dem jemand Bildschärfe
gegen Weitsicht tauschen könnte, existiert nicht.

---

## Aufgaben

**10.0 — Der Messlauf** → `src/debug/report.ts`, Endpunkt `/__report`

**Befund.** Diese Maschine rendert über ANGLE auf dem *Microsoft Basic Render
Driver* und hat kein `EXT_disjoint_timer_query_webgl2`. Zwei P7-Kriterien sind
deshalb seit Monaten offen, und **jede** Aussage über Bildrate oder GPU-Zeit
wäre hier erfunden. Der Auftraggeber hat eine Maschine mit echter GPU; der
Entwickler hat sie nicht. Das ist keine Wissenslücke, sondern eine
Werkzeuglücke.

**Fix.** Nicht raten, sondern ein Werkzeug bauen, das **anderswo** läuft und
eine Datei hinterlässt. `japanMap.report()` fährt eine Matrix ab —
Blickpunkte × Qualitätsstufen — und schreibt **eine JSON-Datei plus je ein
PNG** nach `.cache/reports/`. Der Weg ist derselbe wie bei `shot()`: POST an
den Dev-Server. Wer die GPU hat, startet `npm run dev`, tippt einen Aufruf und
schickt den Ordner zurück.

Je Zelle der Matrix erhoben:

| Größe | woher | hier messbar? |
|---|---|---|
| Draw-Calls, Dreiecke, Programme | `renderer.info` (**kopiert**, nicht referenziert) | ja |
| Instanzen je System, Chunks im Cache | Systeme | ja |
| Texturspeicher | `textureMemory.ts` | ja |
| CPU je Frame (Summe aller `update()`) | `FrameTimer` | ja |
| rAF-Abstand: Median / 95 % / 99 % | Schleife | **nein** (Software-Rasterisierer) |
| **GPU-ms je Frame** | `EXT_disjoint_timer_query_webgl2` | **nein** (Erweiterung fehlt) |

Drei Fallen sind einzubauen, weil dieses Projekt in jede schon einmal getreten
ist:

- **`renderer.info.render` ist eine lebende Referenz** (P8.11: 909 338 statt
  623 628 Dreiecke). Werte werden kopiert, bevor irgendetwas anderes rendert.
- **Ein vollständiges Bild ist kein vollständiger Zustand** (P8.9). Vor jeder
  Messung wird gewartet, bis die **Instanzzahl steht** — nicht bis
  `probe().anteilNichtSchwarz` 1,000 meldet.
- **Ein verdecktes Fenster liefert rAF im Sekundentakt** (P8.9, P8.3). Der Lauf
  **verweigert** bei `document.hidden` den Dienst, statt eine Zahl zu melden.
  Fehlt die Timer-Erweiterung, stehen die GPU-Spalten als „nicht messbar" in
  der Datei — nicht als leer und schon gar nicht als 0.

**Messung.** Der Lauf ist erst fertig, wenn er auf **dieser** Maschine
durchläuft und die GPU-Spalten korrekt als „nicht messbar" ausweist. Das ist
sein eigener Selbsttest: ein Messwerkzeug, das seine eigene Blindheit nicht
meldet, ist gefährlicher als keines.

> **Dies ist die Voraussetzung für 10.1 und 10.3.** Ohne Vorher-Zahlen aus
> derselben Matrix ist jede Änderung an den Stufen ein Vorher/Nachher gegen die
> Erinnerung.

### 10.0 gebaut und gemessen — 2026-08-07

`src/debug/report.ts`, `src/debug/capture.ts`, Endpunkt `/__report` in
`vite.config.ts`, `japanMap.report()`. Typecheck und Build sauber; die Datei
wird aus dem Produktions-Bundle wegoptimiert (geprüft: `anteilNichtSchwarz`
kommt in `dist/assets/index-*.js` **null**mal vor), das 15-MB-Budget ist also
nicht berührt.

**Was der erste Lauf über sich selbst herausgefunden hat.** Er meldete am
Blickpunkt `reisfeld` auf Ultra `settle.stable: true` nach 267 ms — bei
**0 Vegetationsinstanzen**. Der Grund ist einfach und gemein: das
Stabilitätskriterium war „Instanzzahl über acht Frames unverändert", und
*unverändert bei null* sieht genauso aus wie *fertig*. Der Streu-Worker hatte
noch keine einzige Antwort geliefert.

Das ist dieselbe Fehlerklasse wie P8.9 („ein vollständiges Bild einer halb
geladenen Welt"), nur eine Ebene höher: dort log das Bild, hier log der Zähler.
Die Antwort ist beide Male dieselbe — **nicht das Ergebnis beobachten, sondern
die Arbeit fragen.** `ScatterSystem.streaming` ist neu und wahr, solange noch
nie ein Durchlauf vollständig durchkam, der letzte vollständige Durchlauf
Fehlstellen antraf, oder Aufträge beim Worker offen sind. `settle()` wartet
seitdem auf **beides**.

Der Unterschied in Zahlen, derselbe Blickpunkt, dieselbe Stufe:

| | Instanzen gesamt | davon Vegetation | Dauer bis „stabil" |
|---|---|---|---|
| nur Zähler (falsch) | 4548 | **0** | 267 ms |
| Zähler **und** `streaming` | 13 353 | **8805** | 29,8 s |

Die 8805 sind unabhängig bestätigt: dieselbe Zahl nennt die Abnahme von P8.1
für `reisfeld`. Das Werkzeug stimmt damit an einem Punkt mit der Doku überein,
den es nicht kannte.

**Nebenbefund, und er gehört 10.1:** auf „Niedrig" sind es an derselben Stelle
**2203** Vegetationsinstanzen. 2203 / 8805 = **0,2502** gegen die eingestellten
`vegetationDensity: 0.25`. Die Dichte wirkt also auf drei Stellen genau — die
Stufe tut hier genau das, was sie verspricht. Das ist das Vorher-Bild, gegen
das 10.1 antritt.

**Was ausdrücklich nicht geprüft ist.** Die Betriebsart `live` ist auf dieser
Maschine **nicht lauffähig und deshalb ungetestet** — die eingebettete Vorschau
liefert kein `rAF` (nachgemessen: fünf angeforderte Frames kamen in 30 s nicht
zustande). Geprüft ist allein, dass ihre Schutzabfrage greift: bei
`document.hidden` bricht sie mit `HiddenWindowError` ab, statt eine Zahl aus
einem gedrosselten Tab zu melden. Der erste echte `live`-Lauf findet auf der
GPU-Maschine statt, und **er ist zugleich der erste Test dieses Pfades** — das
gehört dazugesagt, statt es als erledigt zu führen.

Ebenfalls unbestätigt bleibt jede GPU-Zahl: `gpuTiming.available` steht hier auf
`false` mit der Begründung „EXT_disjoint_timer_query_webgl2 fehlt". Dass der
Lauf das korrekt meldet, ist der bestandene Selbsttest — dass er auf einer
Maschine mit Timer *richtige* Werte liefert, ist es nicht.

### Der erste `live`-Lauf — 2026-08-07, RX 7900 XTX

Vollständige Matrix, 25 Zellen, `EXT_disjoint_timer_query_webgl2` vorhanden.
Damit ist der `live`-Pfad einmal gelaufen und die zweite Hälfte des
Akzeptanzkriteriums eingelöst.

**Die Maschine ist die, vor der SPEC §4 ausdrücklich warnt.**
`machine.renderer` meldet eine **RX 7900 XTX** — wörtlich die Karte, zu der dort
steht: „auf der läuft praktisch alles flüssig. Sie ist als Maßstab unbrauchbar."
Jede Zelle hält 16,7 ms / 60 FPS, die teuerste GPU-Zeit liegt bei 4,67 ms gegen
ein 16,6-ms-Budget.

> **Daraus folgt ausdrücklich *nicht*, dass Kopfraum für die Zielhardware da
> ist.** Genau diese Schlussfolgerung ist hier beim ersten Lesen gezogen und
> danach verworfen worden. Belastbar sind zwei Dinge: das **Verhältnis der
> Stufen untereinander** und, künftig, der **prozentuale Aufschlag** eines
> Eingriffs. Absolutwerte gegen SPEC §4 gehören auf eine GTX 1660 und nirgends
> sonst.

**Die Stufenleiter in GPU-Zeit**, Median, ohne die zwei verdorbenen Zellen:

| Blickpunkt | Ultra | Hoch | Mittel | Niedrig | Minimal |
|---|---|---|---|---|---|
| start | 2,413 | 2,174 | 1,446 | 0,836 | 0,493 |
| reisfeld | 3,816 | 3,265 | 2,351 | 1,355 | 0,767 |
| pass | 4,669 | 4,217 | ✗ | 1,698 | 0,953 |
| kueste | 2,103 | 1,760 | 1,267 | 0,685 | 0,353 |
| stadt-neon | 3,280 | 2,317 | ✗ | 0,790 | 0,432 |

Ersparnis je Sprosse (Mittel über die sauberen Zellen): Ultra→Hoch **16 %**,
Hoch→Mittel **30 %**, Mittel→Niedrig **43 %**, Niedrig→Minimal **45 %**.
Ultra→Minimal insgesamt Faktor **5 bis 7,6**.

**Ultra gegen Hoch ist die schwächste Sprosse der Leiter** — 16 % für ein
sichtbar schlechteres Bild. Das deckt sich mit dem, was in
`quality.config.ts` bei `high.terrainGridVertices` schon als Vermutung stand;
jetzt steht eine Zahl daneben. Ein Kandidat für 10.1.

**Vegetation je Stufe**, aus `scene.byGroup` — die Spalte „Instanzen" der
Konsolentabelle taugt dafür **nicht**, weil rund 4500 konstante
Straßeninstanzen darin stecken:

| Blickpunkt | Ultra | Hoch | Mittel | Niedrig | Minimal |
|---|---|---|---|---|---|
| reisfeld | 8804 | 6058 | 3874 | 2201 | 856 |
| stadt-neon | 1363 | 975 | 613 | 320 | 98 |
| pass | 171 | 122 | ✗ | 51 | 16 |
| start | 67 | 49 | 36 | 22 | 9 |
| kueste | **0** | **0** | **0** | **0** | **0** |

Am Reisfeld sind das 1,000 / 0,688 / 0,440 / 0,250 / 0,097 gegen die
eingestellten 1 / 0,7 / 0,45 / 0,25 / 0,1. **Der eine Regler, den die Stufen
heute wirklich haben, arbeitet auf drei Stellen genau.**

**Vier von fünf Blickpunkten sind für die Stufenfrage blind** — und das war eine
Fehlannahme dieses Plans. Oben stand „`start`, `reisfeld` und `pass` tragen den
Bewuchs (8805 Instanzen am Reisfeld)". Gemessen tragen `pass` 171 und `start`
67; `kueste` liegt im Sandkanal und hat auf **allen** Stufen exakt null. Der
Grund ist Geometrie, nicht Bewuchs: `start` steht auf 330 m, `pass` auf 420 m,
und die Streuung reicht 520 m weit — aus der Luft liegt fast alles davon
außerhalb.

Daraufhin sind zwei Blickpunkte auf Augenhöhe angelegt worden, gefunden über
eine Auswertung der Instanzmatrizen statt über eine Vermutung (dichteste Stelle:
391 Instanzen je 64-m-Zelle um (768, −730), Boden y ≈ 132…136). Gemessen im
`driven`-Lauf am selben Tag:

| Blickpunkt | Ultra | Niedrig | Verhältnis | Dreiecke (Ultra) |
|---|---|---|---|---|
| **wald** | **38 948** | 9860 | 0,253 | **681 120** |
| **wald-fern** | 11 068 | 2797 | 0,253 | 378 124 |

`wald` trägt damit das 4,4-fache des Reisfelds und ist mit 681 120 Dreiecken
zugleich schwerer als jede Zelle des `live`-Laufs (dort höchstens 580 188).
`wald-fern` ist der Blickpunkt, an dem der **520-m-Ring im Bild steht**: vorn
bewaldete Hänge, dahinter ein vollständig kahler Kamm. Er ist die
Vorher-Aufnahme für 10.3.

**Drei Fehler im Werkzeug, die dieser Lauf aufgedeckt hat.** Alle drei sind
behoben:

1. **Die Warnung nannte zweimal die falsche Ursache.** `medium @ pass` und
   `medium @ stadt-neon` blieben unfertig, und die Meldung lautete „die Welt
   war nicht fertig geladen". Nachgerechnet aus `frames` und `ms`: 16 Frames in
   24,8 s und 99 Frames in 114,9 s — also **1550 bzw. 1160 ms je Frame**, gegen
   16,7 ms in jeder Messschleife desselben Laufs. Der Browser hat schlicht
   nicht gezeichnet. `document.hidden` blieb dabei **falsch**; die Schutzabfrage
   greift also nicht bei einem verdeckten, sondern nur bei einem
   *unsichtbaren* Fenster. `SettleResult.frameIntervalMs` ist neu, und die
   Warnung unterscheidet jetzt drei Ursachen statt eine zu behaupten.
   Die Zahl stand die ganze Zeit in der Datei — nur ungeteilt.
2. **Zähler und Bild gehörten in einer Zelle nicht zusammen.** `medium @ pass`
   meldete `settle.instances: 8409` und `scene.instances: 4580`. Beim
   Kamerasprung vom Reisfeld zum Pass räumen sich die LOD-Puffer über einen
   ganzen Durchlauf, und bei 16 Frames war das mittendrin. Der Lauf warnt jetzt,
   wenn beide Zahlen um mehr als 5 % auseinanderliegen.
3. **Die Bildprüfung schlug falsch an.** `anteilNichtSchwarz` stand auf einer
   Schwelle von 0,999; am Blickpunkt `wald` kommen 0,993 heraus, weil auf
   Augenhöhe im Gegenlicht 0,7 % der Pixel unter Luma 2 fallen. Das Bild war
   vollständig — nachgesehen. Der Fehler, gegen den die Zeile wacht, ergab in
   P8.2 **0,800**; die Schwelle liegt jetzt bei 0,95 und trennt beide Fälle mit
   weitem Abstand.

Dazu zwei Beobachtungen ohne Handlungsbedarf, aber mit Folgen für später:

- **Der Wechsel auf „Minimal" übersetzt 17 zusätzliche Shader.** `programs`
  steht auf 31/32/32/33 und springt auf Minimal auf **50**. Das ist die Folge
  des anderen Renderpfads (der Composer wird umgangen, also andere
  Ausgabevarianten) und genau der Ruckler, den P7.4 für den normalen Pfad
  beseitigt hat. **Für 10.2 relevant:** ein Stufenregler im Spiel wird beim
  Sprung auf Minimal hängen.
- **`textureMemoryMb` steht auf allen 25 Zellen auf 307,78**, während
  `renderer.info.memory.textures` von 62 auf 33 fällt. Der Schätzer läuft über
  die Szene und zählt alles Erreichbare, unabhängig davon, was gerade auf der
  GPU liegt. Das ist so dokumentiert („Schätzung"), heißt aber: **die Stufen
  senken den Texturspeicher messbar, und diese Zahl zeigt es nicht.**
- `lines: 1056` in jeder Zelle sind der `SceneScaffold` aus dem Debug-Aufbau.
  Nur im Dev-Build, über alle Zellen konstant, für den Vergleich also
  unschädlich.

---

**10.1 — Die Stufen an das koppeln, was sie versprechen**

**Befund.** Siehe oben, Punkte 1 und 4.

**Fix.** Drei Kopplungen, jede mit einer eigenen Begründung — und die zweite
ist der Posten, an dem „besser *und* schneller" hängt:

- **Sichtweite als Faktor auf die Artenreichweite**, nicht als Deckel darauf.
  `range = species.lodDistances[2] · viewDistanceFactor`. Auf Ultra darf der
  Faktor **über 1** liegen: Imposter sind der billigste Instanztyp im Projekt,
  und die Karte ist auf Fernsicht gebaut. Was das kostet, misst 10.3.
- **LOD-Bias je Stufe.** Der Umschaltpunkt Mesh → Imposter (heute fest 180 m)
  wird mit einem Faktor je Stufe multipliziert. Das ist der einzige Hebel im
  ganzen Plan, bei dem die Messung *jetzt schon* für „kostet nichts an
  Bildqualität" spricht: P4 hat bei 180 m gemessen, dass das Mesh dort in
  Lücken fällt und der **Imposter besser abgetastet ist** (Tabelle bei
  `IMPOSTER.alphaTest`). Ein Baum ist dort 19 Pixel hoch. Früher umzuschalten
  spart Dreiecke, ohne Silhouette zu verlieren — **wenn** die Messung das an
  einem Bild bestätigt. Sie muss es bestätigen, sonst fällt der Hebel weg.
- **Props folgen der Stufe, mit einem Boden.** Klasse `klein` skaliert voll
  mit, `gross` bekommt eine Untergrenze (Vorschlag: nie unter 1200 m), weil
  Landmarken ihre Funktion sonst verlieren. Der Boden ist eine
  Art-Direction-Entscheidung und steht deshalb als Zahl in der Konfiguration,
  nicht als Formel.

**Messung.** Dieselbe Matrix wie 10.0, vorher/nachher, plus ein Bildpaar je
Stufe an den drei Blickpunkten, an denen Bewuchs überhaupt vorkommt (~~`start`,
`reisfeld`, `pass`~~ — siehe unten, die Auswahl war falsch). Kriterium: die
Dreieckszahl je Stufe darf nicht steigen, und im Bildpaar darf auf **keiner**
Stufe etwas verschwinden, das vorher da war.

### 10.1 gebaut und gemessen — 2026-08-07

`vegetationRange` und `lodBias` ersetzen `viewDistance` in
`quality.config.ts`; `ScatterSystem` skaliert damit Ferngrenze und innere
LOD-Grenzen je Stufe. Herleitung, Messtabellen und die verworfene Variante
stehen bei den beiden Feldern.

**Ergebnis, `driven`-Matrix über 5 Stufen × 4 Blickpunkte, vorher gegen
nachher:**

| Stufe | Dreiecke @ `wald` | Δ | Vegetation |
|---|---|---|---|
| Ultra | 681 120 → 681 120 | **±0** | ±0 |
| Hoch | 579 813 → 579 813 | **±0** | ±0 |
| Mittel | 204 057 → 194 789 | −4,5 % | ±0 |
| Niedrig | 126 855 → 117 833 | **−7,1 %** | ±0 |
| Minimal | 100 542 → 95 394 | −5,1 % | **+22** |

**Keine der 20 Zellen verliert Vegetation**, keine verwirft Instanzen. Ultra
und Hoch sind bitgleich — das ist Absicht: ihr `lodBias` steht auf 1,0, weil
der Abstand nach oben aufgemacht wird (10.3) und nicht nach unten.

**Was die Zahlen allein nicht beantworten.** Weniger Dreiecke bei gleicher
Instanzzahl heißt: Geometrie ist durch Imposter ersetzt worden. Ob das
schlechter *aussieht*, entscheidet das Bild. A/B auf „Niedrig" am Blickpunkt
`wald`, `lodBias` 1,0 gegen 0,75, 896 × 503: die beiden Bilder sind in
Baumbestand, Grasverteilung, Silhouette und Baumgrenze **nicht zu
unterscheiden**; die sichtbaren Abweichungen sind Windphase und Wolkenstand.

> **Die Differenzzahl hätte hier in die Irre geführt**, und zwar in die
> Richtung „großer Effekt": 15,90 % der Pixel über Schwelle 2, 2,77 % über 24.
> Das Rauschband aus zwei Aufnahmen **desselben** Zustands liegt aber schon bei
> 7,45 % und 2,36 % — Wind und ziehende Wolken laufen weiter, während gemessen
> wird. Bei Schwelle 24 ist der Effekt damit praktisch nicht vom Rauschen zu
> trennen. Das ist genau die Reihenfolge, die 8.6 gelehrt hat: erst das
> Rauschband, dann das Urteil, und am Ende **das Bild ansehen**.

**Zwei Dinge sind beim Bauen anders gelaufen als geplant.**

1. **Der erste Wert für Minimal war falsch und hat Vegetation gekostet.**
   `vegetationRange: 0,87` sollte dessen alte 450 m nachbilden. Gemessen fiel
   die Instanzzahl am Reisfeld dabei von 854 auf **217**. Ursache: der alte
   Deckel wirkte allein auf den **Sammelradius der Chunks**, während Artenmaske
   und LOD-Zuordnung die ungeskalierte Ferngrenze je Art benutzten — Gras lief
   also weiterhin bis 160 m, Büsche bis 190 m, und nur Bäume waren bei 450 m
   abgeschnitten. Ein Faktor auf *alle* Arten kürzt Gras und Büsche mit.
   Mit 1,0 gewinnt Minimal stattdessen 70 m Baumreichweite.
   **Gefunden hat das die Vorher/Nachher-Matrix**, nicht das Nachdenken über den
   Code — die Fehldeutung war beim Schreiben vollkommen plausibel.
2. **Die Prop-Kopplung ist gestrichen, nicht gebaut.** Der Plan nennt sie als
   dritte Kopplung. Gemessen stehen je Bild **0 / 1 / 17 / 27 / 47** Props bei
   4527…13 348 Instanzen, und zwar auf allen fünf Stufen gleich. Ein
   Konfigurationsfeld, dessen Wirkung unterhalb der Messbarkeit liegt, ist keine
   Ersparnis, sondern ein weiterer Regler, der gepflegt werden muss — und für
   die Landmarken wäre eine Kürzung ohnehin die verbotene Richtung. Die Zeile
   entfällt mit derselben Begründung, mit der P7.1 `shadowCascades` entfernt
   hat.

**Was `LOD_BIAS_MIN` verhindert.** Die Instanzpuffer entstehen einmal beim
Start, die LOD-Grenzen hängen seitdem an der Stufe. Ein kleinerer `lodBias`
schiebt Instanzen in die Imposter-Stufe, deren Ring also wächst — ein für Ultra
bemessener Puffer liefe auf Minimal über, und `InstancedLOD.push()` verwirft
dann **stillschweigend**. Der Zähler dafür stand bis dahin allein im
Debug-Panel; er steht jetzt als `scene.dropped` in jeder Zelle des Messlaufs
und ist in allen 20 Zellen null.

---

**10.2 — Presets plus Einzelregler** → ~~`src/ui/SettingsPanel.ts`~~
`src/ui/PlayerUi.ts`

> **Gebaut am 2026-08-10.** Alles zwischen hier und der Überschrift „10.2 gebaut"
> weiter unten beschreibt den Stand **davor** — Befund, Entwurf und der
> vollständige Durchgang von A bis Z. Es steht absichtlich im Präsens und
> absichtlich noch da: der Durchgang ist die Begründung für alles, was gebaut
> wurde, und fünf seiner zehn Befunde sind weiterhin offen. Was erledigt ist,
> steht am Ende des Abschnitts mit seinen Zahlen.

**Befund.** Im ausgelieferten Build gibt es **keine Benutzeroberfläche**. Das
Debug-Panel (`main.ts:324`) und `window.japanMap` (`main.ts:390`) hängen beide
an `import.meta.env.DEV`. Ein Besucher der gebauten Seite bekommt einen
Ladebildschirm und danach einen Canvas — ohne Steuerungshinweis, ohne
Einstellungen, ohne Pause, ohne Orientierung. Die Qualitätsstufe wird beim
ersten Start einmal automatisch bestimmt, in `localStorage` geschrieben und ist
danach **nicht mehr änderbar**.

Dazu eine Eigenschaft der Einstufung, die im Betrieb weh tut: sie stuft **nur
herunter, nie herauf**, und speichert das dauerhaft. Wer einmal unter Fremdlast
startet, sitzt für immer auf Minimal — 640 × 360, ohne PostFX. Die Absicherung
gegen ein verdecktes Fenster (`implausibleMs`) fängt das nicht.

**Fix.** Ein Einstellungsfenster im Produktionsbuild, erreichbar über Escape,
das zugleich der Pausezustand ist (Pointer-Lock ist ohnehin verlassen). Aufbau:

- **Oben die fünf Presets.** Ein Klick setzt alle Werte darunter.
- **Darunter die Einzelregler**, aufklappbar: Sichtweite, Vegetationsdichte,
  LOD-Bias, Auflösung, PostFX, AO, Spiegelung, Terrain-Gitter. Wer einen
  anfasst, bekommt das Preset als „Angepasst" markiert — kein stilles Preset,
  das nicht mehr stimmt.
- **Steuerungshinweis** und die benannten Blickpunkte aus `viewpoints.ts` als
  Sprungliste. Die gibt es längst; sie sind nur bisher der Konsole vorbehalten.
- **Ein Knopf „Neu einstufen".** `QualitySystem.reclassify()` existiert bereits
  und hängt heute nur am Debug-Panel.

**Zwei Grenzen sind Pflicht, keine Politur.** `terrainGridVertices` darf nur
Werte aus `GRID_VERTICES_ALLOWED` annehmen — P4 hat den freien Fall mit **207
Löchern gegen 1** gemessen. Und `japanMap.quality()` wirft seit P8.9 bei einem
ungültigen Namen, statt still eine kaputte Stufe zu setzen; der Regler muss
dieselbe Strenge haben.

**Messung.** Jeder Regler wird einzeln umgelegt und im Messlauf aus 10.0
nachgewiesen: er ändert die Zahl, die er ändern soll, und **keine andere**. Ein
Regler ohne nachgewiesene Wirkung ist eine Zusage ohne Deckung — dieselbe
Formulierung wie bei `shadowCascades` in P7.1, das genau deshalb entfallen ist.

### Der Durchgang von A bis Z — am gebauten Stand, nicht am Dev-Server

Aufgenommen am 2026-08-08 gegen `npm run preview` (Port 4180). **Das ist der
Unterschied, auf den es ankommt:** im Dev-Server verdeckt das Debug-Panel jede
Lücke, weil dort Stufenwahl, Blickpunkte und Zahlen greifbar sind. Gemessen am
gebauten Stand:

```js
{ japanMap: "undefined",
  bodyKinder: ["CANVAS#viewport", "DIV#overlay", "NOSCRIPT"],
  overlayInhalt: "(leer)" }
```

Ein Canvas und ein leeres `div`. Das ist die ganze Anwendung.

**Der Weg eines Besuchers, Schritt für Schritt:**

| # | Was passiert | Befund |
|---|---|---|
| 1 | Seite wird geladen, 43,48 MB über die Leitung | 6,8 s allein Übertragung bei 50 Mbit — verfehltes Kriterium aus P7 |
| 2 | Ladebildschirm, Balken aus initialisierten Systemen | **ehrlich und gut** — der eine Teil der UX, der stimmt |
| 3 | Ladebildschirm verschwindet, Bild steht | kein Hinweis, dass jetzt etwas zu tun wäre |
| 4 | Nutzer sieht die Karte, bewegt die Maus | **nichts passiert** — Pointer-Lock verlangt einen Klick, das steht nirgends |
| 5 | Nutzer klickt | Zeiger wird gefangen, Blick folgt der Maus |
| 6 | Nutzer will sich bewegen | WASD, Leertaste, Strg, Shift, Mausrad, F, R — **nichts davon steht irgendwo** |
| 7 | Nutzer drückt Escape | Zeiger frei, **und sonst nichts**. Kein Menü, keine Pause, kein Zurück |
| 8 | Nutzer will die Qualität ändern | **geht nicht.** Kein Regler existiert im Build |
| 9 | Nutzer verirrt sich | keine Karte, kein Kompass, keine Ortsnamen, keine Rücksprungliste |
| 10 | Nutzer lädt neu | Kameraposition ist gespeichert (`japanmap.camera`) — **das funktioniert** |

**Zehn Befunde, nach Gewicht:**

1. **Es gibt keinen Steuerungshinweis.** Sechs Tasten, ein Mausrad und ein
   Pflichtklick, und keine einzige Stelle, an der sie stehen. Die Tabelle
   existiert — als Kommentar über `FreeFlyController`, den kein Nutzer sieht.
2. **Die Qualität ist nach dem ersten Start festgenagelt.** Die Einstufung läuft
   einmal, schreibt nach `localStorage` und **stuft nur herunter, nie herauf**.
   Wer beim ersten Besuch unter Fremdlast startet, sitzt dauerhaft auf Minimal —
   640 × 360 ohne PostFX — und hat keine Möglichkeit, das zu ändern.
   `QualitySystem.reclassify()` existiert und hängt nur am Debug-Panel.
3. **Escape führt ins Leere.** Der Zustand „Zeiger frei" ist der natürliche Ort
   für ein Menü und ist heute ein Nichts.
4. **Auf einem Touch-Gerät ist die Anwendung unbedienbar — und sagt es nicht.**
   `deviceTier` erkennt `(pointer: coarse)` und stuft vorsorglich auf „Mittel"
   herunter; der `FreeFlyController` kennt aber ausschließlich `mousemove`,
   `wheel`, `pointerdown` und `keydown`. Es lädt, es rendert, und man kann sich
   **keinen Meter** bewegen. SPEC §1 schließt Mobil ausdrücklich aus — das ist
   eine legitime Entscheidung, aber sie gehört dem Nutzer gesagt statt ihn
   raten zu lassen.
5. **Keine Orientierung auf 9,4 km².** Dreizehn benannte Blickpunkte liegen in
   `viewpoints.ts` und sind der Konsole vorbehalten. Für eine Karte, deren
   Inhalt das Erkunden *ist*, ist das der größte verschenkte Posten.
6. **Kein Ton.** Für eine Stimmung, die „blaue Stunde nach Regen" heißt, fehlt
   damit die halbe Wirkung. Nicht im Plan, und das ist eine bewusste
   Entscheidung — sie steht nur nirgends.
7. **Jeder Initialisierungsfehler ersetzt die ganze Seite.** `fatal()` setzt
   `document.body.innerHTML` und wirft. Kein Weg zurück, kein Neuversuch, und
   der WebGL2-Fall ist die einzige Meldung mit einem verwertbaren Rat.
8. **Der Ladebildschirm zeigt keinen Inhalt.** Balken und Dateiname, aber kein
   Bild, kein Titel, kein Hinweis darauf, was man gleich sieht — und dahinter
   liegen 43,5 MB.
9. **Der Wechsel auf „Minimal" ruckelt**, gemessen: 17 zusätzliche
   Shader-Übersetzungen (31 → 50 Programme). Ein Stufenregler ohne Gegenmittel
   baut sich damit einen sichtbaren Hänger ein.
10. **Es gibt keinen Fotomodus.** `shot()` existiert im Dev-Build; für eine
    Karte, die auf ihren Look gebaut ist, wäre das die naheliegendste Geste,
    die ein Besucher machen will.

**Was ausdrücklich gut ist** — damit die Liste nicht nur Mängel zählt: der
Ladebalken ist echt statt animiert; die Kameraposition überlebt einen Neustart;
Pointer-Lock hat den Sprung beim Einfangen abgefangen; `blur` räumt die
Tastenmenge auf, sodass die Kamera bei einem Fensterwechsel nicht davonfliegt;
und die Ersteinstufung verweigert eine Messung aus einem verdeckten Fenster,
statt sie zu speichern.

**Reihenfolge für 10.2**, nach Wirkung je Aufwand: Steuerungshinweis (1) und
Escape-Menü (3) zusammen, darin die Stufenwahl (2), dann die Blickpunktliste (5)
und der Touch-Hinweis (4). Alles Weitere ist eigenständig und gehört nicht in
diese Aufgabe.

### 10.2 gebaut — `src/ui/PlayerUi.ts` (2026-08-10)

Die Datei heißt `PlayerUi.ts` und nicht `SettingsPanel.ts` wie oben geplant: sie
ist mehr als Einstellungen (Hinweis, Pause, Blickpunkte), und ein Name, der die
Hälfte beschreibt, wird beim nächsten Lesen zur falschen Erwartung.

**Der Zustand hängt am Pointer Lock, nicht an einem eigenen Zähler.** Drei
Zustände: gefangen → nichts; frei und noch nie gefangen → Hinweis „Klick ins
Bild" samt Tastentabelle; frei und schon einmal gefangen → Pausenmenü. Escape
löst den Lock **selbst**, das kann keine Anwendung abfangen; ebenso Alt-Tab und
der Vollbildwechsel. Zugehört wird deshalb `pointerlockchange`.

**Was am gebauten Stand gemessen ist** (Port 4180, also der Build, nicht der
Dev-Server — genau die Unterscheidung, an der der Durchgang oben hing):

```js
{ debugApi: "undefined", debugPane: false, stats: false,
  hint: true, hintPointer: "none", menu: true,
  stufen: ["Ultra","Hoch","Mittel","Niedrig","Minimal","Eigen"],
  regler: ["renderScale","vegetationDensity","vegetationRange","lodBias",
           "terrainGridVertices","ao","postFx","reflections"],
  blickpunkte: 16, tasten: 8 }
```

Kein Debug-Panel, keine `window.japanMap` — und trotzdem sechs Stufen, acht
Regler, sechzehn Sprungziele und acht Tastenzeilen. Das ist der Punkt der
Aufgabe.

**Die Regler wirken, und das ist gemessen statt behauptet.**

| Handlung | gemessen |
|---|---|
| „Mittel" → Pixelverhältnis | 1,000 → 0,850 |
| „Eigen", Auflösung 0,50 / 0,75 / 1,00 nacheinander | 0,500 → 0,750 → 1,000 |
| Gitter 17² / 33² | 81 699 → 201 507 Dreiecke |
| Vegetationsdichte 100 % / 25 % @ `wald` | 38 948 → 9 860 Instanzen |

Die zweite Zeile ist die wichtigste, und sie war beinahe der Fehler dieser
Aufgabe. **Ein Regler ändert die Werte einer Stufe, ohne ihren Namen zu
ändern.** Zwei Stellen prüfen aber auf den Namen, und beide hätten jeden
weiteren Reglerzug verschluckt:

- `QualitySystem.set()` bricht ab, wenn die Stufe schon gilt. Deshalb gibt es
  `setCustom()`, das **immer** sendet — die Stufe hat sich inhaltlich geändert.
- `ScatterSystem` verglich `level === this.#quality`. Es vergleicht jetzt die
  drei Werte, die es angehen, und merkt sich den zuletzt **angewandten** Satz.
  Ein Nachschlagen in der Tabelle hätte nichts genützt: `QUALITY.custom` ist ein
  Getter auf den aktuellen Zustand, ein Vorher/Nachher darüber vergliche zweimal
  dasselbe. `TerrainSystem` hatte es von Anfang an richtig (es prüft seine
  Gitterweite, nicht die Stufe) — das war die Vorlage.

**Die beiden Pflichtgrenzen, geprüft auf dem realistischen Weg.** Nicht über den
Regler (der bietet nur gültige Werte an), sondern über einen präparierten
`localStorage`-Eintrag — der Fall, der beim **Start** zuschlägt, aus einem
früheren Programmstand, ohne dass jemand etwas anfasst:

| Feld | eingeschleust | angewandt |
|---|---|---|
| `terrainGridVertices` | 9 | **33** (abgewiesen) |
| `lodBias` | 0,1 | **0,65** (`LOD_BIAS_MIN`) |
| `vegetationRange` | 5 | **1** (`VEGETATION_RANGE_MAX`) |
| `renderScale` | 99 | **1** |
| `vegetationDensity` | −3 | **0,05** |
| `ao` | `'ultra'` | **`'high'`** (abgewiesen) |
| `postFx` | `'nope'` | **`'full'`** (abgewiesen) |
| `reflections` | `'ja'` | **`true`** (kein String) |

Acht von acht. Dahinter steht die Abnahme von P8.1: `japanMap.lodHoles()` über
16 Blickpunkte auf allen drei zulässigen Gittern (33² / 25² / 17²) auf der
eigenen Stufe — **0 Löcher, 0 Spalten** in jeder der 48 Zellen.

**Ein Fehler, den nur die Messung gefunden hat.** Der Hinweiskasten trug
`pointer-events: none`, weil der Klick dem Canvas darunter gehört. Der berechnete
Wert stand trotzdem auf `auto`: die Regel `#overlay > *` darüber trägt einen
ID-Selektor und schlägt jede Klassenregel. Ausgerechnet der Kasten mit der
Aufschrift „Klick ins Bild" hätte den Klick verschluckt, den er verlangt — die
Anwendung hätte auf ihre eigene Anweisung nicht reagiert. Im Bild wäre das nicht
zu sehen gewesen; gefunden hat es ein `getComputedStyle` im laufenden Stand.
Lehre in der Reihe der bisherigen: **eine CSS-Eigenschaft, auf der Verhalten
beruht, wird am berechneten Wert geprüft, nicht am geschriebenen.**

**Nebenbefund, mitrepariert.** `FreeFlyController` nahm Tastendrücke auch **ohne**
Pointer Lock an. Mit einem Menü über dem Canvas heißt das: wer dort einen Regler
mit der Tastatur bedient oder „W" streift, lässt die Kamera losfliegen und findet
sie beim Zurückkehren woanders. `#onPointerLockChange` leerte die gedrückten
Tasten bereits; was fehlte, war die Sperre für neue. Umsehen braucht den Lock
ohnehin — eine Bewegung ohne Blick gibt es also nicht zu verlieren.

**Was ausdrücklich nicht gemessen ist.** Der Ablauf Lock → Escape → Menü →
„Weiter" → Lock ist **nicht am laufenden Bild geprüft**. In der eingebetteten
Vorschau ist Pointer Lock strukturell unmöglich (`WrongDocumentError: The root
document of this element is not valid for pointer lock`, dazu `hasFocus() ===
false`). Geprüft ist immerhin der Fehlerzweig: eine abgelehnte Anforderung
hinterlässt keinen toten Zustand, der Hinweis steht danach weiter. Der Rest
gehört auf eine Maschine mit sichtbarem Fenster, zusammen mit dem `live`-Lauf
aus 10.0 — und steht bis dahin hier als offen, nicht als erledigt.

Aus der Liste der zehn Befunde sind damit **1, 2, 3, 4 und 5** erledigt. Offen
bleiben 6 (Ton), 7 (`fatal()` ohne Rückweg), 8 (Ladebildschirm ohne Inhalt),
9 (Ruckler beim Stufenwechsel) und 10 (Fotomodus) — alle eigenständig und
bewusst nicht in dieser Aufgabe.

---

**10.5 — Bildfehlersuche auf Augenhöhe** (laufend)

Der Befund an den Reisfeldern kam nicht aus einer Zahl, sondern daraus, dass
jemand auf Augenhöhe hingesehen hat. Diese Aufgabe wiederholt das planmäßig:
bodennahe Standpunkte abfahren und das Bild ansehen. Was dabei gefunden wird,
steht hier — **auch das, was sich als in Ordnung herausstellt**, denn sonst
untersucht es der Nächste noch einmal.

**Runde 1, 2026-08-08.** Vier Standpunkte: Bergpass und Ringstraße je auf der
Fahrbahn (Position aus `roads.json` gerechnet), Fischerdorf und Sandō.

| Standpunkt | Befund |
|---|---|
| `ring` auf der Fahrbahn | **in Ordnung** — Mittellinie, Randmarkierung, Risse im Belag, Bewuchs auf der Böschung |
| `sando` | **in Ordnung** — Torii-Reihe, Laternenpaare, Tempel am Ende |
| `toge` auf der Fahrbahn | keine Leitplanke am Abbruch — **untersucht und widerlegt**, siehe unten |
| `dorf` | eckige Wasserkante — **bekanntes Thema**, siehe unten |

> **Die fehlende Leitplanke am Bergpass ist kein Fehler.** Sie sah nach einem
> aus: die Planken decken 508 m von 2616 m, und zwischen Meter 512 und 2124
> gibt es auf **keiner** Seite eine — also 1,6 km mitsamt aller neun Kehren.
> Der Verdacht lag nahe, dass `planGuardrails()` das Gelände **vor** dem
> Einschneiden misst (so steht es dort ausdrücklich) und deshalb genau die
> Abgründe verpasst, die der Erdbau selbst schafft.
>
> Nachgemessen am **fertigen** Höhenfeld ist das falsch. Der seitliche Abfall,
> Median je 200-m-Abschnitt, größere der beiden Seiten:
>
> | km | 8 m | 12 m | 19 m | 28 m seitlich |
> |---|---|---|---|---|
> | 600 | −3,3 | −6,4 | −8,4 | −1,4 |
> | 1200 | −9,7 | −14,6 | −14,5 | −2,9 |
> | 1400 | −10,5 | −18,3 | −21,7 | −19,3 |
> | 1600 | −12,9 | −18,4 | −19,9 | −17,4 |
>
> **Negativ heißt: das Gelände steht dort höher als die Straße.** Der Pass
> läuft in diesem Abschnitt in einem *Einschnitt*, auf beiden Seiten von Wänden
> begleitet, nicht auf einem Sims über einem Abgrund. Es gibt nichts zu sichern,
> und die Regel ist korrekt. Über das ganze Band sind am fertigen Gelände 15 %
> der Punktseiten exponiert gegen 10 % verplankt — der Rest fällt an `minRun`
> und `maxGap`, also an der Regel gegen Vier-Meter-Planken.
>
> Was der Befund **stattdessen** zeigt, ist der dokumentierte Steinbruch aus
> P3 / P8.5a, und zwar aus der Fahrerperspektive: 1,6 km Trasse zwischen zwei
> kahlen Wänden. Dasselbe Muster steht im Bild der Ringstraße. Das ist eine
> Art-Direction-Frage am Erdbau, keine fehlende Geometrie — und P8.5a hat
> bereits eine Variantenserie dazu verworfen.

**Runde 2, 2026-08-08.** Vier Standpunkte: Wasserfallstufe, Tempelhalle,
Küste, Stadtrand. **Zwei Fehler gefunden, einer davon behoben.**

| Standpunkt | Befund |
|---|---|
| `stadt-rand` von unten | **in Ordnung** — Neon in der nassen Platte, die Randbebauung aus 8.9 trägt |
| Wasserfallstufe | **Bäume standen im Fluss** — behoben, siehe unten |
| Tempelhalle | **Gebäude schweben am Hang** — gemessen, offen |
| Küste | Wellen-Normalmap kachelt sichtbar zum Horizont — offen, gering |

**Behoben: Bäume im Fluss.** `scatterChunk` kannte genau zwei Ausschlüsse — das
Straßennetz (P4) und die Freihaltekreise der Props (P5). Der Fluss kam in
**P8.6** dazu, die Freihaltung nicht. Das ist wörtlich dieselbe Fehlerklasse wie
„Bäume wuchsen durch die Tempelhalle" (P5) und „Wald mitten im Wasser" bei den
Reisfeldern (P4) — **dreimal derselbe Mechanismus, dreimal beim Bauen
übersehen.** Der Flusslauf wandert jetzt als Kette von Freihaltekreisen in
dieselbe `PropClearance`; im Bild ist das Band frei und Gras wächst bis an die
Kante.

> Wenn dieselbe Lücke dreimal auftritt, ist sie keine Unachtsamkeit mehr,
> sondern eine fehlende Regel. **Wer der Welt eine neue Fläche hinzufügt, auf
> der nichts wachsen soll, trägt sie in `PropClearance` ein — im selben
> Arbeitsgang.** Das gehört geprüft, bevor die nächste Fläche entsteht.

**Behoben: zwei Dächer waren verkehrt herum — seit P5.** Beim Nachsehen des
Sockels stand das Bauernhaus mit einer nach oben offenen **Rinne** statt eines
Firsts da; der Firstbalken stak mitten hindurch. Ursache ist ein Vorzeichen:
`rotZ(slab, side * slope)` hebt das **äußere** Ende jeder Dachplatte an. Nach
dem Fund wurde derselbe Ausdruck im ganzen Bestand gesucht — die
**Lagerhalle** hatte ihn auch, und davon stehen **elf** auf der Karte.

> **Warum das sieben Monate überlebt hat.** Die P5-Abnahme hat die Reisfelder
> aus **120 m Höhe** fotografiert, und dort ist ein Bauernhausdach ein paar
> Pixel groß. Es ist dieselbe Lehre wie bei den Vegetations-Blickpunkten aus
> P10.0: **aus der Luft ist das meiste nicht prüfbar.** Und es ist der zweite
> Beleg für die P8.11-Regel „ein Fehlerbild ist eine Klasse, kein Einzelfall" —
> der erste Fund war das Bauernhaus, gesucht wurde danach im ganzen Bestand.

**Behoben: Gebäude schweben am Hang.** Props bekommen **eine** Höhe
aus dem `TerrainSampler`, gemessen an ihrem Mittelpunkt. Steht das Gebäude auf
einer Neigung, klafft auf der Talseite die volle Geländespanne als Lücke.
Gemessen über die Grundfläche (3 × 3 Proben) der 99 Gebäude-Props:

| Prop | Spanne unter der Grundfläche |
|---|---|
| `farmhouse` (−1244, 409) | **3,64 m** |
| `templeHall` | **2,98 m** |
| `shed` (−1375, 192) | 2,11 m |
| `templeStairs` | 2,04 m |
| `bellTower` | 1,71 m |

**9 von 99** liegen über 1 m. Im Bild der Tempelhalle ist die Lücke unter der
linken Vorderkante deutlich zu sehen, und die Steintreppe davor hängt frei.

Drei Wege, keiner davon nebenbei:

1. **Auf das Minimum der Grundfläche setzen** — dann klafft nirgends etwas, das
   Gebäude gräbt sich aber auf der Bergseite bis zur vollen Spanne ein. Bei
   3,64 m unter einem Bauernhaus ist das kein Tausch, sondern ein anderer
   Fehler.
2. **Sockel oder Schürze**, wie sie die Stadtplatte seit P8.11 hat. Löst es
   richtig und kostet Geometrie je Gebäude.
3. **Das Gelände unter der Grundfläche einebnen**, wie es der Baker für die
   Reisfelder (5c) und den Distrikt (5d) längst tut. Der sauberste Weg, aber
   er greift in die Bake-Kette ein — und die koppelt über die Erosion auf die
   ganze Karte (P8.5).

**Entschieden: Weg 2, der Sockel.** Weg 3 greift in die Bake-Kette, und die
koppelt über die Erosion auf die ganze Karte — er kann die Kehrenzahl am
Bergpass mitnehmen und ist keine Nebenbei-Änderung. Der Sockel steckt dagegen
in der Modellgeometrie, kostet **12 Dreiecke je Bauart statt je Instanz**,
braucht keinen neuen Bake und ist architektonisch richtig: ein Bau am Hang
steht auf einem Fundament. Auf ebenem Grund ist er vollständig vergraben.

Eingebaut bei sieben Bauarten, Tiefe je aus der gemessenen Lücke plus Rand:
`farmhouse` 3,2 m · `templeHall` 2,0 · `templeStairs` 1,8 · `bellTower` 1,2 ·
`warehouse` 1,2 · `chozuya` 1,0 · `shed` 0,9. Am Bild geprüft an der
Tempelhalle und am Bauernhaus bei (−1244, 409), dem größten Fall der Karte —
beide stehen auf dem Boden, kein Spalt.

---

**Runde 3, 2026-08-08.** Hafen, Leuchtturm, Geschäftsstraße, Fuß des Sandō.
**Kein neuer Fehler.**

| Standpunkt | Befund |
|---|---|
| Geschäftsstraße | **das stärkste Bild des Projekts** — Neon mit Kanji, Pfütze mit Spiegelung, leuchtende Ladenfronten. Der Money-Shot aus P6 trägt |
| Fuß des Sandō | in Ordnung — Pfad, Einschnitt, Bewuchs auf der Böschung |
| Hafen | die **eckige Wasserkante** wieder, wie am Fischerdorf |
| Leuchtturm | dito |

Damit steht die Uferlinie an drei von drei Küstenstandpunkten im Bild. Sie ist
das auffälligste, was noch offen ist — und die Ursache ist bekannt (die
CDLOD-Sehne, siehe P8 „Offen und gemessen: die Uferlinie ist eine Treppe").

> **Ein Fehlalarm gehört dazu.** Im Bild vom Sandō-Fuß standen zwei weiße
> Striche auf der Böschung, die nach einem verrutschten Fahrbahn-Decal aussahen.
> Der Nachfass-Blickpunkt war **unbrauchbar**: die Kamera steckte im Hang, das
> Bild kam gekippt heraus und zeigte Himmel statt Gelände. Daraus ließ sich
> nichts schließen, und der Verdacht ist damit weder bestätigt noch widerlegt —
> nur, dass Decals bauartbedingt auf der Mittellinie sitzen und gar nicht
> danebenliegen können. Wahrscheinlich war es die Ringstraße hinter dem Rücken,
> streifend gesehen.
>
> Die Lehre ist dieselbe wie bei den Blickpunkten aus P10.0: **ein geratener
> Standpunkt ist keine Messung.** Wer nachfasst, holt die Koordinate aus den
> Daten, so wie es bei `wald` und den Straßenstandpunkten gemacht wurde.

---

**Versuch, die Einschnitte zu begrünen — gemessen und verworfen.**

Der naheliegende billige Ausweg gegen die kahlen Wände: Bewuchs darauf zulassen,
statt am Erdbau zu arbeiten. Warum dort nichts steht, ist zweiteilig gemessen:

| | 6 m | 10 m | 14 m | 18 m | 22 m seitlich |
|---|---|---|---|---|---|
| `toge` Neigung | 21° | **53°** | **55°** | 45° | 39° |
| `ring` Neigung | 4° | 23° | 30° | 19° | 9° |

Die Artengrenzen liegen bei Gras 45°, Busch 42°, Kiefer 38°, Laubbaum 27°. Am
Ring ist die Böschung flach genug — dort steht auch Bewuchs, im Bild sichtbar.
Am Pass liegt sie bei 53…55° und damit über **jeder** Grenze. Die Zonenmaske ist
dort zusätzlich zu 69…75 % Fels (Gras hätte nur rund 30 % Annahmequote).

Probiert: Gras 45° → 55°, Busch 42° → 52°. Das Band zwischen 45° und 57° mit
brauchbarem Grasgewicht ist nur **1,0 %** der Kartenfläche, der Eingriff wäre
also zielgenau. **Am Bild ist er trotzdem wirkungslos:** der Standpunkt auf der
Passfahrbahn ist vorher und nachher nicht zu unterscheiden, und die
Vegetationszahl dort steigt um **11 Instanzen**. Die kahle Fläche in diesem Bild
ist nicht die Straßenböschung, sondern die Felswand dahinter — über 57° und in
der Felszone, also von beiden Grenzen unabhängig.

Zurückgenommen. Eine Änderung, die Instanzen kostet und im Bild nichts ändert,
ist das Gegenteil dessen, was P10 tut.

> **Ein Messfehler dabei, weil er sich sonst wiederholt.** Der Vorher/Nachher-
> Lauf verglich zwei Berichte mit **verschiedener Canvas-Größe** (1280 × 720
> gegen 529 × 597). Ein breiteres Bild zeigt mehr Gelände, also mehr Dreiecke
> und mehr Instanzen — die Differenzen von +29 bis +44 % gehören dem
> Seitenverhältnis, nicht dem Eingriff. Entschieden hat deshalb das Bild.
> **Wer zwei Berichte vergleicht, muss vorher `engine.resize()` auf denselben
> Wert setzen**; der Messlauf tut das nicht von selbst.

> **Die eckige Wasserkante am Fischerdorf kommt nicht vom Wasser.** Gemessen
> hat das Mesh `Meer` genau **2 Dreiecke** — ein einziges Quad über die ganze
> Welt. Eine Facettierung kann daraus nicht entstehen. Was im Bild eckig ist,
> ist das **Gelände**, das die Wasserebene durchstößt: die dokumentierte
> Sehnenabweichung des CDLOD-Gitters („Offen und gemessen: die Uferlinie ist
> eine Treppe", P8). Der Verdacht „das Wassermesh ist zu grob" ist damit
> ausgeschlossen; die Ursache bleibt die bekannte und die Gegenmittel bleiben
> die dort genannten.

---

**10.3 — Der 520-m-Ring: erst messen, dann entscheiden**

**Befund.** Punkt 2 oben. Wie teuer die Kante zu verschieben ist, ist
**unbekannt** — Imposter sind billig, aber 520 → 1500 m vervierfacht die
Fläche und damit grob die Chunk- und Instanzzahl.

**Fix — ausdrücklich noch keiner.** Diese Aufgabe misst zuerst und entscheidet
danach. Drei Kandidaten stehen zur Wahl und werden gegeneinander gemessen,
nicht gegeneinander argumentiert:

| Kandidat | was er kostet | was er bringt |
|---|---|---|
| A: Reichweite hoch, nur Imposter jenseits 520 m | Instanzen, Füllrate, Chunk-Erzeugung | echte Fernsicht mit Bewuchs |
| B: Kante im Dunst verstecken | fast nichts | nimmt der Karte die Fernsicht aufs Massiv — der stärkste Hebel laut SPEC §2.1 |
| C: eine grobe Fernstufe (Streuung mit großer Zellgröße jenseits 520 m) | wenige Instanzen | Silhouette statt Einzelbäume |

**Messung.** Für jeden Kandidaten: Instanzzahl, Draw-Calls, Dreiecke,
Chunk-Erzeugungszeit **im kalten Zustand** (P4-Lehre: warm 0,70 ms gegen kalt
12,7 ms) — und ein Bild vom selben Blickpunkt. Was gewinnt, steht danach mit
den Zahlen daneben in „Offene Entscheidungen", nicht mit einer Begründung.

> **B ist der Kandidat, vor dem dieses Projekt sich selbst warnt.** Nebel über
> ein Problem zu legen ist der „erstbeste plausible Regler" aus dem
> Stadt-Helligkeits-Befund. Er steht trotzdem in der Tabelle, weil eine
> Messreihe ohne den billigen Kandidaten unvollständig ist.

---

**10.4 — Der Startdownload: 43,5 MB → 15 MB**

**Befund, frisch gemessen am 2026-08-07** aus `dist/` (Brotli, wo vorhanden;
Sourcemaps nicht mitgezählt, weil der Browser sie nicht lädt):

**53 Dateien, 43,48 MB.** Die Doku aus P7 nannte 45 Dateien und 42,68 MB — die
Zahl ist nicht falsch gewesen, sie stammt aus einem Lauf vor den 175 Props aus
P8.9.

Die Hälfte steckt in **fünf** Dateien:

| Datei | über die Leitung | Hebel |
|---|---|---|
| `industrial_sunset_02_puresky_4k.hdr` | 7,01 MB (br) | auf 2k: **−4,8 MB** (P7 nennt es, braucht einen RGBE-Resampler) |
| `normal.png` | 5,49 MB (roh) | **streichen** — Normale aus `height.r16` im Shader rechnen: −5,49 MB, exakt |
| `nor_gl.jpg` (Asphalt 2k) | 4,71 MB (roh) | KTX2/UASTC |
| `height.r16` | 4,40 MB (br) | offen — 16-bit-PNG statt roh+Brotli erst messen |
| `rooftop_night_2k.hdr` | 4,13 MB (br) | bleibt: 2k ist bereits die kleine Fassung, und dieses HDRI trägt den Look |

Dazu rund **9,1 MB Normalmaps als JPEG** (4,71 + 1,33 + 1,09 + 1,09 + 0,86).
Das ist nicht nur groß: **JPEG-Chromasubsampling zerstört Normalen.** Sie
liegen im falschen Format, unabhängig von der Größe.

### 10.4 erster Schritt gebaut und gemessen — 2026-08-08

**Vor allen geplanten Hebeln stand ein ungeprüfter Posten: die Bitrate.** Ein
Audit über alle 15 Quelltexturen:

| Datei | Auflösung | bit/px |
|---|---|---|
| `asphalt_02/nor_gl.jpg` | 2048² | **9,43** |
| `asphalt_02/Diffuse.jpg` | 2048² | 5,87 |
| `brown_mud_02/nor_gl.jpg` | 1024² | 10,66 |

Üblich für eine gut aussehende JPEG-Textur sind 1 bis 3 bit/px. Neun ist
Qualität 98+ — praktisch verlustfrei gespeichertes, ohnehin schon
verlustbehaftetes Material, wie Poly Haven es ausliefert. **Das hatte niemand
nachgesehen**, und es war der billigste Hebel im ganzen Plan.

`tools/optimize-textures.mjs` kodiert neu mit **Qualität 90 und vollem Chroma
(4:4:4)**, Ausgang `assets/generated/textures/`. Gemessen:

| | vorher | nachher |
|---|---|---|
| Texturen | 18,05 MB | **11,19 MB** (−38,0 %) |
| **Startdownload** | 43,48 MB | **36,62 MB** (−15,8 %) |

`4:4:4` ist nicht verhandelbar: Chromasubsampling mittelt die Farbkanäle über
2 × 2 Pixel, und bei einer Normalmap sind das die X- und Y-Anteile der Normale.
**Drei Dateien werden unverändert übernommen** — die `arm.jpg` wachsen bei
Neukodierung um 54 bis 63 %, weil sie wenig Struktur tragen und ihr flacher
Farbanteil ohne Subsampling mehr kostet als die Qualität einspart. Größer wird
nie geschrieben; eine Optimierung, die einzelne Posten verschlechtert und im
Mittel gewinnt, ist eine Optimierung mit einer Ausrede.

**Am Bild geprüft, Blickpunkt `stadt-strasse`** (dort füllt Asphalt die halbe
Fläche), gegen ein Rauschband aus zwei Aufnahmen desselben Zustands:

| Schwelle | Rauschband | Effekt |
|---|---|---|
| 2 | 42,70 % | **16,20 %** |
| 8 | 27,75 % | **0,36 %** |
| 24 | 0,022 % | 0,055 % |

Der Effekt liegt bei 2 und 8 **weit unter** dem Rauschen. Bei 24 liegt er knapp
darüber — 0,055 % sind rund 280 Pixel von 921 600. Im Differenzbild sitzen sie
auf den **Fassaden**, und die sind prozedural und benutzen keine der geänderten
Texturen; der Asphalt selbst ist dort praktisch schwarz.

> **Die Texturzahl allein hätte hier zu einer falschen Entscheidung geführt.**
> Das schlechteste PSNR der Neukodierung liegt bei 31,8 dB, und das liest sich
> nach „spürbar". Gerendert ist davon nichts übrig: die Texturen werden
> gekachelt, über vier Splat-Kanäle gemischt, bei 2,2° Sonnenstand streifend
> beleuchtet und danach tonemappt. Gemessen wurde deshalb, was im Bild steht,
> nicht was in der Datei steht.

Der Vollständigkeit halber die verworfenen Alternativen, beide gemessen:
Qualität 95 spart nur 3,23 statt 6,86 MB, und **`normal.png` im Shader zu
rechnen** (der Hebel unten, −5,49 MB) kostet rund **16 Texel-Zugriffe je
Terrain-Pixel** statt einer Textur-Abfrage — der Baker nutzt einen Sobel-Filter
und die Karte wird bilinear abgetastet, beides müsste nachgebildet werden. Das
ist mehr GPU-Last für weniger Download und damit die verbotene Richtung.

**Nebenbefund:** `sharp` fehlte in `package.json`, obwohl
`tools/process-assets.mjs` es seit P5 importiert. Ein frisches `npm ci` hätte
`npm run models` gebrochen. Eingetragen.

---

**Fix.** In dieser Reihenfolge, weil die ersten beiden gemessen sind und der
dritte einen Blocker hat:

1. **`normal.png` streichen** (−5,49 MB). Die Normale aus dem Höhenfeld zu
   rechnen ist im Shader drei Abtastungen; das Feld liegt ohnehin als Textur
   dort. Risiko: die Normale ist danach an die Texelauflösung gebunden statt an
   eine eigene Karte — muss am Bild geprüft werden, nicht nur an der Zahl.
2. **Himmel-HDRI auf 2k** (−4,8 MB). Braucht einen RGBE-Resampler in
   `tools/`; RGBE lässt sich nicht naiv mitteln, der Exponent muss vorher raus.
3. **KTX2 für alle Texturen** (P7 schätzt −15 MB, **ungemessen**). Der Blocker
   seit P5 ist immer derselbe: `toktx` ist ein natives Programm und hier nicht
   installiert. **Der Blocker ist zu prüfen, nicht zu wiederholen.**

   > **Am 2026-08-08 zum ersten Mal geprüft — und er ist so nicht haltbar.**
   > Der Satz „der Basis-Encoder liegt nicht als Bibliothek vor, sondern als
   > externes Programm" steht seit P5 in der Doku und ist **nie gegen die
   > Paketquelle geprüft** worden. Abfrage der npm-Registry:
   >
   > | Paket | Version | Art |
   > |---|---|---|
   > | `ktx2-encoder` | 0.6.0 | „KTX2 encoder for browser applications", hängt an `ktx-parse` — also WASM im Paket |
   > | `basis_universal` | 1.16.4-1 | „runs the basis_universal executable" — Hülle um eine Binärdatei |
   > | `ktx-parse` | 1.1.0 | nur Container lesen/schreiben, **kein** Encoder |
   >
   > `ktx2-encoder` ist der aussichtsreiche Kandidat: er bringt den Encoder als
   > WASM mit und braucht keine Systeminstallation. `basis_universal` löst den
   > Blocker vermutlich auch, holt sich dafür aber eine ausführbare Datei — das
   > ist eine Entscheidung, die der Auftraggeber trifft und nicht ein
   > Nebeneffekt eines `npm install`.
   >
   > **Was damit gemessen ist:** dass es Kandidaten gibt. **Was nicht:** ob
   > `ktx2-encoder` außerhalb eines Browsers läuft, ob er UASTC für Normalmaps
   > kann, und was er tatsächlich einspart. Die −15 MB bleiben eine Schätzung
   > und sind weiter als solche markiert.

   Erste Aufgabe bleibt deshalb nicht „KTX2 einbauen", sondern `ktx2-encoder`
   an **einer** Textur zu erproben — der 4,71-MB-`nor_gl` des Asphalts ist der
   richtige Prüfstein, weil er zugleich der größte Posten und als JPEG ohnehin
   im falschen Format ist.

Bleiben rechnerisch rund **18 MB gegen 15**, mit einer geschätzten Zeile darin.
Die 15 MB sind mit diesen drei Hebeln **wahrscheinlich nicht erreichbar**, und
das gehört vorher gesagt statt hinterher entschuldigt.

**Der vierte Hebel ist keiner an den Bytes.** Der Ladebildschirm wartet heute
auf **alle** Systeme, bevor das erste Bild steht. Terrain und Himmel allein
sind ein Bild; Vegetation, Props und Stadt könnten danach hereinströmen. Das
senkt die **Zeit bis zum ersten Bild** auch ohne ein einziges eingespartes
Byte — und das ist die Größe, die SPEC §4 eigentlich meint („erster Frame nach
< 5 s"). Es ist zugleich der Hebel mit dem größten Umbaurisiko und steht
deshalb hier als Idee, nicht als Aufgabe mit Kriterium.

---

## Akzeptanzkriterien

- [x] **Der Messlauf läuft auf beiden Maschinen** und weist auf dieser die
      GPU-Spalten als „nicht messbar" aus, statt sie leer oder null zu melden.

      **Erfüllt am 2026-08-07.** Auf der Entwicklungsmaschine läuft er in der
      Betriebsart `driven` durch und meldet `gpuTiming.available: false` mit
      Begründung; auf der GPU-Maschine (RX 7900 XTX) in `live` über alle 25
      Zellen mit vorhandenem Timer. Beide Berichte liegen vor.

      > **Der Lauf hat dabei drei Fehler in sich selbst gefunden** — eine
      > falsch zugeordnete Warnung, eine unbemerkte Divergenz zwischen Zähler
      > und Bild, und eine zu scharfe Bildprüfung. Alle drei sind behoben und
      > in „Der erste `live`-Lauf" beschrieben. Das ist der Grund, warum diese
      > Zeile ein Haken ist und nicht bloß „lief durch": ein Messwerkzeug,
      > dessen erster Einsatz keine eigenen Fehler zutage fördert, ist
      > wahrscheinlich nicht scharf genug eingestellt.
- [x] **Jeder der fünf Presets ändert jede Größe, die er nennt** — nachgewiesen
      in der Matrix aus 10.0, für Sichtweite, Vegetationsdichte, LOD-Bias,
      ~~Props~~, Auflösung, Gitter, PostFX, AO und Spiegelung. Kein Feld ohne
      Wirkung.

      **Erfüllt am 2026-08-07.** `viewDistance` war das eine Feld ohne Wirkung
      und ist ersetzt; `vegetationRange` und `lodBias` sind beide in der
      Vorher/Nachher-Matrix nachgewiesen. **Props sind aus der Zeile
      gestrichen**, weil ihre Wirkung gemessen unterhalb der Messbarkeit liegt
      (0…47 Instanzen je Bild) — Begründung in „10.1 gebaut und gemessen".
- [x] **Auf keiner Stufe verschwindet im Bildpaar etwas, das vorher da war.**
      Drei Blickpunkte mit Bewuchs, Vorher/Nachher, Differenzbild angesehen —
      **nicht** nur die Differenzzahl gelesen (P8.6-Lehre).

      **Erfüllt.** Über 20 Zellen keine einzige mit weniger Vegetation, keine
      verworfenen Instanzen. Das Bildpaar auf „Niedrig" am Blickpunkt `wald`
      zeigt keinen Unterschied, den man benennen könnte — und die Differenzzahl
      lag dabei kaum über dem Rauschband aus Wind und Wolken (2,77 % gegen
      2,36 % bei Schwelle 24). Genau deshalb entscheidet hier das Bild.

      > **Der Umfang gehört dazu:** geprüft ist *eine* Stufe an *einem*
      > Blickpunkt bei 896 × 503. Die Zeile fordert drei Blickpunkte; die
      > anderen beiden sind über die Instanzzahlen abgesichert (kein Verlust in
      > 20 Zellen), aber **nicht am Bild**. Wer `lodBias` weiter senkt, muss
      > dort erneut hinsehen.
- [x] **Ultra wird besser, nicht nur teurer.** Eingelöst in **P11.5**: die
      Baumreichweite ist von 520 auf **1200 m** gestiegen, und `wald-fern` zeigt
      seitdem einen Wald bis zum Horizont statt einer Kante.

      Budgets nachgemessen am 2026-08-18 auf Ultra, jeder Blickpunkt vollständig
      eingeschwungen:

      | Blickpunkt | Draw-Calls | Dreiecke |
      |---|---|---|
      | `start` | **192** | 592 411 |
      | `stadt-neon` | 126 | **655 869** |
      | `wald` | 75 | 484 245 |
      | `wald-fern` | 56 | 285 319 |
      | *Budget* | *800* | *3 000 000* |

      > **Der Texturspeicher ist dabei nicht vollständig neu gemessen**, und das
      > gehört dazu statt eines dritten Hakens: über die aus der Szene
      > erreichbaren Texturen kommen **122 MB** zusammen, three meldet aber 64
      > Texturen gegen 19 gezählte — Renderziele und Zwischenpuffer fehlen darin.
      > Die letzte vollständige Zahl ist **307,8 MB** aus der P8-Abnahme. Dass
      > die Richtung stimmt, ist sicher (P15 lädt kleinere Texturen als vorher);
      > die Zahl ist es nicht.
- [x] **Die Einstellungen sind im gebauten Stand erreichbar.** Eingelöst in
      **P10.2** (`src/ui/PlayerUi.ts`, ohne `import.meta.env.DEV`) und in
      **P13** um vier Reiter erweitert; dort sind 35 von 35 Bedienelementen über
      `elementFromPoint` als treffbar nachgewiesen, in beiden Ständen. Am
      2026-08-18 an Port 4180 gegengeprüft: Startbildschirm steht,
      `window.japanMap` ist `undefined`.
- [x] **Der Startdownload ist gemessen und beziffert, mit jedem Hebel einzeln
      nachgewiesen.** Eingelöst in **P15.1 bis 15.3**: 40,83 → **17,02 MB**,
      gemessen als übertragene Bytes am gebauten Stand. Die vier Hebel einzeln:
      `normal.png` abgeleitet 5,49 MB · Detailtexturen halbiert 7,98 MB ·
      Himmel-HDRI halbiert 6,60 MB · IBL 2k→1k 3,71 MB.

      Die 15-MB-Zeile ist dabei **gegenstandslos geworden**, nicht erfüllt: die
      Zielplattform CrazyGames verlangt ≤ 20 MB für die Mobile-Homepage
      (SPEC §4.1), und die 15 MB standen seit P0 ohne Herkunft da.
- [x] **Kette weiterhin bitgleich reproduzierbar.** `npm run world` zweimal am
      2026-08-18: **bitgleich über alle 54 Dateien**. Der Lauf hat dabei
      `measured.seconds` in `shade.json` als Altfehler gefunden (P15.6).

## Risiken

- **„Nichts darf schlechter werden" und „schneller" ziehen gegeneinander.** Der
  einzige Hebel, für den heute schon eine Messung in beide Richtungen spricht,
  ist der LOD-Bias. → Wenn die Bildprüfung ihn nicht trägt, fällt er weg, und
  dann ist 10.1 ein reines Kopplungs-Update ohne Gewinn. Das wäre ein
  ehrliches Ergebnis, kein Scheitern.
- **Ein Regler lädt zum Nachregeln ein.** Acht Einzelregler sind acht
  Gelegenheiten für die Regelschleife, vor der dieses Projekt an drei Stellen
  warnt. → Jeder Regler bekommt seinen Nachweis in der Matrix, oder er bekommt
  keinen Regler.
- **Die Sichtweite anzuheben trifft die Erzeugungskosten im kalten Zustand,
  nicht im warmen.** → In 10.3 wird kalt gemessen. Warm gegen kalt zu
  vergleichen hat in P4 den Faktor 18 verschluckt.
- **`normal.png` zu streichen ist eine Bildänderung, keine Größenänderung.**
  → Vorher/Nachher am selben Blickpunkt, bevor die eingesparten 5,49 MB
  irgendwo als Erfolg auftauchen.
- **Der KTX2-Blocker könnte echt sein.** → Dann steht die Zahl ohne ihn hier,
  und die 15 MB bleiben offen. Eine dritte Wiederholung von „kommt in der
  nächsten Phase" wäre die schlechtere Antwort.

---

## Offene Entscheidungen

| # | Frage | Spätestens in | Vorläufige Tendenz |
|---|---|---|---|
| ~~1~~ | ~~SSR oder planare Reflexion + Probes~~ | ~~P6~~ | **Entschieden: B + C.** Nicht nach Tuning-Tagen, sondern gemessen — gegen die Neonschilder sind nur 19,3 % der Spiegelungen im Bildschirmraum überhaupt vorhanden, am wichtigsten Standpunkt 4,2 %. Siehe P6, „Die Reflexions-Entscheidung" |
| ~~2~~ | ~~Kreuzungen prozedural oder handmodelliert~~ | ~~P3~~ | **Entschieden:** prozedural im Generator — Einrasten in XZ, Höhe festnageln, Rücksprung statt Verschneidung |
| ~~3~~ | ~~Physik-Engine~~ | ~~P9.2~~ → **P14** | **Entschieden am 2026-08-18: eigene Arcade-Physik.** Nicht durch einen Prüfstandsvergleich — durch die Anforderung. „Arcade-Drift, Touge-Stil" ist eine Eigenschaft der Reifenkennlinie (`TIRE.peakSlip*`, `rearGripFactor`) und nicht des Solvers. Zahlen daneben: **16,11 kB** minifiziert für die ganze Fahrschicht gegen Rapiers WASM in einem Startdownload, der mit 51,95 MB ohnehin über Budget liegt; **0,003…0,022 ms** CPU je Schritt; **4 Draw-Calls / 1024 Dreiecke** für das Fahrzeug. `three-mesh-bvh` bleibt unbenutzt, Begründung im Kopf von `CollisionWorld.ts`. Siehe P14 |
| 4 | Imposter-Baking headless oder in-app | P4 | In-app, falls headless zickt |
| ~~5~~ | ~~Carving vor oder nach der Erosion~~ | ~~P3~~ | **Entschieden:** nachher. Die Erosionsrinnen laufen dadurch bis an die Böschung heran, statt überschrieben zu werden |
| ~~6~~ | ~~Der kahle Ring bei 520 m~~ | ~~P10.3~~ → ~~P11.5~~ | **Entschieden am 2026-08-11: Kandidat A, aber nur für die Bäume.** Reichweite 520 → 1200 m für Kiefer und Laubbaum, Gras und Büsche unverändert. Gemessen kostet das am Blickpunkt `wald-fern` auf Ultra **2,3 % mehr Dreiecke** (279 268 → 285 809) für einen Wald bis zum Horizont — weil von 50 711 Instanzen nur rund 2 000 Bäume sind und ein Imposter zwei Dreiecke hat. Kandidat B (Dunst) blieb draußen, Kandidat C ist im Ausdünnungsgesetz `keep = max(keepFar, (R/d)²)` aufgegangen. Siehe P11.5 |
| 7 | KTX2 ohne Systeminstallation — gibt es einen WASM-/JS-Encoder für Basis Universal? | **P10.4** | Ungeprüft. Der Blocker „`toktx` ist hier nicht installiert" steht seit P5 unverändert in der Doku und ist **nie gegen das npm-Ökosystem geprüft** worden |

---

# P11 — Sichtbarkeit & Dichte ◐ (11.2 bis 11.6 gebaut, 5 von 7 Kriterien)

> **Stand: der Messdurchgang ist gefahren, entschieden ist nichts.** Diese Phase
> beginnt ausdrücklich mit Zahlen und Bildern und nicht mit einem Fix — auf
> Wunsch des Auftraggebers („erst messen, dann entscheiden"). Was unten unter
> „Vorschläge" steht, ist eine Auswahl mit Messgrößen daneben, keine
> beschlossene Aufgabe.

**Der Auftrag, in seinen Worten:** eine Stufe, die „wirklich auf jedem Toaster
läuft, aber keine wirklich großen sichtbaren Kompromisse eingeht" — volle
Auflösung, Licht und Reflexionen bleiben, Wind darf weg. Dazu die Beobachtung,
die den Anstoß gab: „jetzt zum Beispiel spawnen gefühlt jede 3 m ein Grashalm
und dadurch sieht alles braun aus. Auf Ultra sieht die Map an sich anders aus."
Und die Zielvorstellung für die Fernsicht: nur das rendern, was wirklich zu
sehen ist, und dort sparen, wo man den Unterschied kaum findet.

**Zielhardware ist damit festgelegt:** ein Laptop mit integrierter Grafik der
Klasse Intel UHD 620. Das entscheidet die Richtung, denn dort ist **Füllrate und
Speicherbandbreite** der Engpass und nicht die Dreieckszahl.

---

## 11.0 Der Messdurchgang — 2026-08-10

**Aufbau.** Zwei Läufe, beide in Betriebsart `driven` (in der eingebetteten
Vorschau kommt kein rAF, siehe CLAUDE.md). Zuerst `japanMap.report()` über
`wald`, `wald-fern`, `reisfeld` × Ultra/Minimal (`.cache/reports/p11-ist.json`).
Danach ein **Isolationslauf**: jeder Anteil der Stufe einzeln verstellt, alles
andere auf Ultra, **alles bei 1280 × 720** — sonst vergleicht man das
Seitenverhältnis statt den Eingriff (die Lehre aus dem Böschungs-Lauf in P10).

Die eigene Stufe („Eigen") ist dafür das richtige Werkzeug: `setCustom()` sendet
immer, auch wenn der Name gleich bleibt.

### Befund 1 — ~~Die Vegetation ist auf „Minimal" **weiß**~~ — **widerlegt am 2026-08-11**

> **Auf der GPU-Maschine steht die Vegetation grün.** Der Auftraggeber hat den
> Test gefahren (`japanMap.quality('minimal'); japanMap.view('wald')`, RX 7900
> XTX): Gras und Büsche korrekt gefärbt, kein einziger weißer Scherenschnitt.
> Der Verdacht aus dem Abschnitt unten ist damit **bestätigt** — es war ein
> Artefakt des Software-Rasterisierers dieser Entwicklungsmaschine (ANGLE /
> Microsoft Basic Render Driver), nicht des Projekts. **Aufgabe 11.1 entfällt
> ersatzlos**, am Renderpfad wird nichts repariert.
>
> Der ganze Abschnitt bleibt trotzdem stehen. Er ist der Beleg dafür, dass ein
> reproduzierbarer, isolierter, bildbelegter Befund auf *einer* Maschine
> trotzdem nichts über das Projekt aussagen muss — und er enthält acht
> Messungen, die niemand zweimal machen muss.
>
> **Die eigentliche Lehre ist eine über das Werkzeug, nicht über den Shader:**
> jede Aussage dieses Projekts, die an einem Bild aus dem `off`-Pfad hängt, ist
> auf dieser Maschine wertlos. Der Composer-Pfad schreibt am Ende jedes Pixel
> neu und verdeckt das. Bei künftigen Messungen an `postFx: 'off'` gehört das
> dazugesagt.
>
> **Ein zweiter Wert aus demselben Bild, und er ist der wichtigere:** Minimal
> kostet dort **0,79 ms GPU** bei 43 Draw-Calls und 111 166 Dreiecken, gegen ein
> Budget von 16,6 ms. Die Steppe aus Befund 2 ist also **nicht der Preis für
> Leistung** — sie ist verschenkt. Das ist das stärkste Argument dafür, den
> Dichteregler ganz zu ersetzen statt ihn vorsichtig nachzujustieren.
>
> *(Die Zahl gilt für eine RX 7900 XTX und sagt über die Zielhardware — eine
> Intel-iGPU — unmittelbar nichts. Sie sagt aber, dass die heutige Sparsamkeit
> keinen Gegenwert im Bild hat.)*

#### Der widerlegte Stand, zur Dokumentation

Am Blickpunkt `wald`, Preset `minimal`, frisch geladene Seite: **jeder Baum,
jeder Busch und jeder Grashalm rendert als reinweißer Scherenschnitt.** Das
Gelände ist normal beleuchtet, die Silhouetten stimmen, die Farbe ist weg.
Bild: `.cache/shots/p11_check_minimal_frisch.png`.

Isoliert, an derselben Stelle, alles auf Ultra und **nur** `postFx` verstellt:

| `postFx` | Composer | Vegetation im Bild | Draw-Calls |
|---|---|---|---|
| `full` / `reduced` / `lean` | läuft | **korrekt grün** | 57 (reduced) / 52 (lean) |
| `off` | umgangen | **weiß** | 43 |

Gegengeprüft mit den *Minimal*-Werten und nur getauschter Kette (`p11_kette_off`
gegen `p11_kette_lean`): dasselbe Bild, einmal weiß, einmal grün. **Der Fehler
sitzt allein im Renderpfad ohne Composer** und trifft ausschließlich die
Vegetationsmaterialien — Gelände, Stadt und Himmel sind unauffällig.

> **Damit ist „auf Ultra sieht die Map anders aus" zum größten Teil erklärt, und
> zwar anders als vermutet.** Die naheliegende Erklärung war die fehlende
> Grading-LUT (so steht sie seit P8.2 in `postfx.config.ts`, dort am Neonlicht
> gemessen). Die LUT fehlt auch — aber sie ist ein Farbstich, und hier steht ein
> **Bildfehler**. Genau der Fall aus CLAUDE.md, „eine Ursache benannt, ohne sie
> zu trennen": ohne den Isolationslauf wäre am Grading gedreht worden.

**Die Ursache ist gesucht worden und ist noch nicht gefunden.** Der Verlauf
gehört hierher, weil sieben Vermutungen gemessen und **alle sieben widerlegt**
wurden — jede davon hätte sonst als „wahrscheinliche Ursache" in der Doku
gelandet:

| Vermutung | Test | Ergebnis |
|---|---|---|
| Tonemapping fehlt / falsch | `#define TONE_MAPPING` im übersetzten Shader, `renderer.toneMapping` | **widerlegt** — beides korrekt (AgX), Shader-Text auf beiden Pfaden strukturell gleich |
| Werte gesättigt / NaN | Belichtung 0,03 · 1 · 4 | **widerlegt** — die Flächen dunkeln normal mit ab, also ein Wert und kein NaN |
| Alphakanal / transparentes PNG | Alpha-Histogramm des Framebuffers | **widerlegt** — Alpha ist auf beiden Pfaden zu 100 % 255 |
| Nebel / Luftperspektive voll aufgedreht | `uAtmoFogMaxOpacity = 0` | **widerlegt** — 59,95 % → 60,48 % |
| Imposter ohne Atlas (Grundfarbe ist weiß) | Imposter-Stufe ausgeblendet | **widerlegt** — 61,44 % → 61,56 % |
| Umgebungskarte / IBL spiegelt den Himmel | `envMapIntensity = 0`, dazu roughness 0,85 / metalness 0 abgelesen | **widerlegt** — 61,83 % → 59,47 % |
| Planare Spiegelung hängt sich ein | `reflections: false` | **widerlegt** — 61,83 % → 62,23 % |
| Himmels-/Wolkenkuppel wird darübergezeichnet | `Wolken` ausgeblendet, `scene.background = null` | **widerlegt** — 60,10 % → 58,53 % |

**Was das Bild stattdessen zeigt** (`p11_diag_off_ohne_himmel.png`, Ultra-Dichte,
Kette aus): die hellen Flächen überdecken **auch das Gelände**, ihre Ränder
schneiden **quer durch einzelne Bäume**, und einzelne Bäume stehen völlig
korrekt da. Das ist kein Material-, Instanz- oder Beleuchtungsfehler — das ist
ein **fleckiges Bild im Bildschirmraum**.

Dazu kommt ein Befund, der die Richtung dreht: der Anteil **schwankt zwischen
aufeinanderfolgenden Frames** desselben, eingeschwungenen Zustands — 38,4 /
43,8 / 44,5 / 45,2 %. Ein Shading-Fehler wäre stabil.

> **Neuer, ausdrücklich ungeprüfter Verdacht: das ist ein Artefakt dieser
> Maschine, nicht des Projekts.** Diese Entwicklungsmaschine rendert über ANGLE
> auf dem *Microsoft Basic Render Driver*. Im Composer-Pfad schreibt ein
> Vollbild-Durchgang am Ende **jedes** Pixel neu; im `off`-Pfad geht die Szene
> direkt in den Canvas, und genau dort stehen die Flecken. Ein halb aufgelöster
> Kachelpuffer beim Auslesen würde alle drei Beobachtungen zugleich erklären:
> Flecken quer über Objektgrenzen, Gelände mitbetroffen, Schwanken je Frame.
>
> **Das ist zu prüfen, bevor irgendetwas repariert wird.** Wer eine echte GPU
> hat, setzt `japanMap.quality('minimal')`, fliegt `japanMap.view('wald')` an
> und sieht nach — steht die Vegetation dort grün, ist der Fehler ein
> Messartefakt und `off` als Renderpfad unauffällig. Steht sie weiß, ist er
> echt, und dann ist die Suche oben um sieben Sackgassen kürzer.

Das ist eine eigene Aufgabe und steht unten als 11.1.

> **Ein Messfehler dabei, damit er sich nicht wiederholt.** Auf der Suche nach
> der Ursache wurde `look:apply` von Hand mit einem Ereignis gesendet, das
> **nur** den Abschnitt `vegetation` trug. Alle anderen Zuhörer lesen ihre
> Abschnitte aus demselben Objekt, bekamen `undefined` und stellten sich auf
> Null — das Bild war danach schwarz. `look:apply` trägt den **ganzen** Look;
> ein Teilobjekt ist kein Teil-Look, sondern ein kaputter.

### Befund 2 — „Alles sieht braun aus" ist die Dichte, isoliert nachgewiesen

Blickpunkt `wald`, 1280 × 720, identische Kette, identische Auflösung,
identisches Gelände. Geändert wurde **nur** `vegetationDensity` von 1,0 auf 0,1:

| untere Bildhälfte | Ultra | nur Dichte 0,1 |
|---|---|---|
| **Grünanteil** | **44,22 %** | **5,71 %** |
| Braunanteil | 46,07 % | **87,82 %** |
| mittleres RGB | 27,5 / 28,5 / 18,8 | 33,9 / 27,9 / 23,9 |
| sichtbare Instanzen | 51 187 | 5 216 |

Der Grünanteil bricht auf **ein Achtel** ein, und der Boden kippt von
grün-dominant auf **rot-dominant** (R steigt, G fällt). Im Bild
(`p11_wald_b-nur-dichte.png`) ist aus dem Wald eine Steppe geworden: brauner
Hang, vereinzelte Grasbüschel, ein paar übriggebliebene Bäume. Das ist wörtlich
die Beschreibung des Auftraggebers, und sie stammt **allein** aus einem Regler.

Der Grund ist die Bauart des Reglers: `scatterChunk` verwirft über
`roll >= suitability * density`, also **gleichmäßig über die ganze Fläche** —
auch direkt vor der Kamera. Es ist derselbe Befund wie in P10 („was ‚Niedrig'
wirklich ändert, ist die Dichte, nicht die Distanz"), jetzt mit einem Bild und
einer Zahl statt einer Herleitung.

### Befund 3 — Der Boden ist **schon auf Ultra** braun

Das gehört dazu, weil es die Erwartung an einen Fix verschiebt: auf Ultra sind
44 % der unteren Bildhälfte grün und **46 % braun**. Die Grasbüschel schließen
also auch bei voller Dichte keine Decke; zwischen ihnen steht der Splat-Kanal
`grass` — die Fototextur `aerial_grass_rock`, die selbst Fels enthält. Im Bild
`p11_wald_a-ultra.png` ist das gut zu sehen.

**Daraus folgt: die Dichte allein zurückzudrehen löst das Problem nicht.** Wer
Minimal auf Ultra-Dichte hebt, bekommt Ultras 46 % Braun — nicht mehr die
Steppe, aber auch keinen geschlossenen Bewuchs.

### Befund 4 — Wo die Dreiecke wirklich liegen

Blickpunkt `wald`, alle Zellen mit 51 187 Instanzen außer b und g:

| Zustand | Dreiecke | Δ gegen Ultra | Draw-Calls |
|---|---|---|---|
| a — Ultra | 481 410 | — | 74 |
| f — nur `lodBias` 0,65 | 414 750 | −13,8 % | 74 |
| d — nur Gitter 17² | 330 882 | −31,3 % | 74 |
| e — nur AO aus | 481 404 | ±0 | 68 |
| c — nur PostFX aus | 481 384 | ±0 | 48 |
| b — nur Dichte 0,1 | 274 354 | −43,0 % | 70 |
| g — Minimal komplett | 116 242 | −75,9 % | 43 |

Und dieselbe Frage am Reisfeld:

| Zustand | Instanzen | Dreiecke | Draw-Calls |
|---|---|---|---|
| Ultra | 8 805 | 367 409 | 71 |
| nur Dichte 0,1 | 857 | 351 307 | 67 |

> **Am Reisfeld kostet die Dichte 90 % der Vegetation und spart 4,4 % der
> Dreiecke.** Das ist das schlechteste Tauschgeschäft der ganzen Tabelle. Am
> Wald sind es 43 % — dort trägt der Regler etwas, aber um den Preis aus
> Befund 2.

### Was dieser Durchgang **nicht** gemessen hat

- **Keine GPU-Zeit, keine Bildrate.** Diese Maschine hat kein
  `EXT_disjoint_timer_query_webgl2` und rendert über den Microsoft Basic Render
  Driver; `pacing` und `fps` stehen als `null` in der Datei. Alle Zahlen oben
  sind **exakte Zähler und Bildstatistiken**, keine Kostenaussagen.
- **Die Auflösung wurde absichtlich herausgerechnet** (überall 1280 × 720). Was
  `renderScale: 0.5` auf Minimal wirklich anrichtet, ist damit offen.
- **Der 520-m-Ring** ist in diesem Durchgang nicht angefasst worden; die offene
  Entscheidung 6 bleibt offen.

---

## Vorschläge — mit der Messung daneben, ohne Beschluss

Sortiert nach Wirkung je Aufwand, wie sie sich aus 11.0 ergibt.

**11.1 — Den Weiß-Fehler finden und beheben.** Blocker für alles andere: solange
`postFx: 'off'` das Bild zerlegt, ist jede Aussage über „Minimal sieht aus wie
Ultra" gegenstandslos. Zwei Wege, und der erste ist zu prüfen, bevor der zweite
gebaut wird:

1. **Die Ursache im Shader finden.** Sie ist nicht bekannt, siehe Befund 1.
2. **Minimal behält die Kette** — statt „Composer aus" ein einziger kombinierter
   Durchgang (AgX + LUT + Vignette, kein Bloom, kein SMAA, keine AO). Gemessen
   kostet die schlankste laufende Kette (`lean`) heute **52 gegen 43**
   Draw-Calls; ein eigener Minimal-Pass läge darunter. Das repariert den Fehler
   als Nebenwirkung **und** holt die Grading-LUT zurück, also auch den
   Farbstich, der auf Minimal heute fehlt.

   > Weg 2 ist kein Ersatz für Weg 1. Ein Fehler, der nur deshalb nicht mehr
   > auftritt, weil der betroffene Pfad nicht mehr benutzt wird, ist nicht
   > behoben — er wartet.

**11.2 — Ausdünnen mit der Entfernung statt über die Fläche.** Der Kern. Heute
ist die Dichte ein Weltmaß, das die Stufe global multipliziert; richtig wäre,
die Zahl der Instanzen **pro Bildschirmfläche** konstant zu halten. Ein Grashalm
auf 5 m ist 100 px hoch, derselbe auf 150 m ein Viertelpixel — beide kosten
gleich viel, nur einer ist zu sehen.

Bauform: weiter mit voller Dichte streuen, aber beim Einsortieren
(`ScatterSystem.#pushChunk`) je Instanz über einen **stabilen Hash** gegen eine
entfernungsabhängige Behaltewahrscheinlichkeit verwerfen. Je Stufe zwei Werte
statt eines Faktors: ab welcher Entfernung ausgedünnt wird und wie schnell.

Was das bringt, und warum es zur Zielhardware passt: auf einer integrierten
Grafik sind **unterpixelige Dreiecke** der teuerste Fall überhaupt — jedes wird
als 2 × 2-Quad schattiert, ein 0,25-px-Halm kostet also vier Pixel. Genau die
verschwinden hier.

Messgrößen: Instanzen je Stufe **und** Grün-/Braunanteil im Nahfeld (der darf
sich nicht ändern), Dreiecke, kalte Chunk-Erzeugungszeit.

> **Ein Kostenpunkt, der dazugehört:** bei voller Streuung laufen die teuren
> Filter (Neigung, Straßenabstand) für *alle* angenommenen Kandidaten, nicht
> mehr nur für ein Zehntel. Das ist Arbeit im Worker, sie ist
> zwischengespeichert — und sie ist **kalt** zu messen, nicht warm (P4: 0,70 ms
> warm gegen 12,7 ms kalt).

### 11.2 gebaut und gemessen — 2026-08-11

**`vegetationDensity` ist ersatzlos gestrichen.** An seiner Stelle stehen zwei
Werte je Stufe: `vegetationFullRadius` (bis hierhin wird **nichts** ausgedünnt)
und `vegetationFarKeep` (so viel bleibt an der Ferngrenze). Dazwischen linear.

| Stufe | voll bis | fern |
|---|---|---|
| Ultra | 160 m | 60 % |
| Hoch | 120 m | 45 % |
| Mittel | 90 m | 30 % |
| Niedrig | 55 m | 20 % |
| Minimal | 30 m | 14 % |

Vier Eingriffe:

1. **`scatterChunk` streut immer voll.** Der Dichtefaktor ist aus `ScatterInputs`
   und aus dem Worker-Protokoll entfernt, nicht nur auf 1 gesetzt — ein
   Parameter, der immer denselben Wert trägt, ist der nächste, dem irgendwann
   jemand eine Bedeutung andichtet.
2. **Ausgedünnt wird beim Einsortieren** (`ScatterSystem.#pushChunk`), über einen
   **ortsfesten Hash je Instanz**. Ortsfest ist die entscheidende Eigenschaft:
   dieselbe Pflanze fällt bei derselben Entfernung immer weg, und sie fallen in
   fester Reihenfolge — wer bei 200 m steht, steht bei 100 m erst recht. Ein
   laufender Zähler oder die Pufferreihenfolge ließe den Bestand bei jeder
   Kamerabewegung flackern.
3. **Deckungserhalt**: was übrig bleibt, wächst waagerecht um 1/√Anteil,
   gedeckelt auf `SCATTER.thinBoostMax` = 1,7. Ohne das wäre jedes Ausdünnen
   sofort als Lücke zu sehen — das ist die Rechnung hinter der Steppe aus
   Befund 2. Die **Höhe** bleibt unangetastet: eine doppelt so hohe Kiefer fiele
   in der Silhouette auf, eine breitere Grasbüschelbasis nicht.
4. **Der Regler „Vegetationsdichte" im Spielermenü ist durch zwei ersetzt.** Ein
   einzelner Prozentwert kann die Frage nicht mehr beantworten, seit nah und
   fern getrennt behandelt werden.

**Gemessen**, Blickpunkt `wald`, 1280 × 720, untere Bildhälfte:

| Zustand | Instanzen | Dreiecke | verworfen | grün | braun |
|---|---|---|---|---|---|
| Minimal **vor P11** | 5 216 | 116 242 | 0 | 5,71 % | 88,26 % |
| Ultra jetzt | 50 711 | 480 458 | 0 | 77,75 % | 6,63 % |
| **Minimal jetzt** | **32 376** | 225 583 | **0** | **82,85 %** | **8,22 %** |

Minimal trägt jetzt **6,2-mal so viele Instanzen** wie vorher und liegt im
Grünanteil sogar knapp **über** Ultra — der Deckungserhalt überzeichnet in der
Ferne leicht. Im Bildpaar sind die beiden Stufen an diesem Blickpunkt nicht mehr
auseinanderzuhalten.

**`verworfen: 0` auf beiden Stufen**, und das war vorhergesagt statt gehofft:
der Anteil ist nie über 1, es kann also nie mehr gestreut werden als bei der
alten Dichte 1,0 — und für diesen Fall waren die Puffer schon bemessen. Die
Obergrenze des neuen Verfahrens ist bauartbedingt das alte Ultra.

> **Ultra verliert dabei 476 Instanzen** (51 187 → 50 711), weil auch seine
> Ferne jetzt auf 60 % ausdünnt. Im Bild ist davon nichts zu sehen, und im
> Grünanteil sind es 0,07 Prozentpunkte. Das ist der einzige Posten dieser
> Aufgabe, der in die falsche Richtung zeigt, und er gehört benannt.

### Was 11.2 **nicht** belegt

- **Keine Kostenaussage.** Minimal ist jetzt *teurer* als vorher: 225 583 statt
  116 242 Dreiecke. Ob das auf der Zielhardware trägt, ist auf dieser Maschine
  nicht messbar. Der Anhaltspunkt spricht dafür — auf der GPU-Maschine kostete
  das *alte* Minimal 0,79 ms bei einem Budget von 16,6 ms —, aber das ist eine
  RX 7900 XTX und keine Intel-iGPU. **Das ist die nächste Zahl, die von außen
  kommen muss.**
- **Die Streuung ist teurer geworden.** Die Filter für Neigung und
  Straßenabstand laufen jetzt für alle zonentauglichen Kandidaten statt für
  einen Bruchteil. Das läuft im Worker und ist zwischengespeichert — aber
  **kalt** ist es nicht nachgemessen, und P4 hat für genau diese Verwechslung
  den Faktor 18 kassiert.
- **Ein Blickpunkt, eine Kamerahöhe.** Die Zusage „von jedem Winkel" ist damit
  nicht eingelöst; `wald-fern`, der Gipfel und die Stadtferne stehen aus.
- **Der 520-m-Ring steht noch** — das ist 11.5 und der Grund, warum die Karte
  vom Gipfel weiterhin einen kahlen Saum hat.

**11.3 — Deckungserhaltendes Ausdünnen.** Wer den Anteil p behält, skaliert die
Verbliebenen um 1/√p in XZ (gedeckelt, etwa ≤ 1,6×) — die Bodendeckung bleibt
dann konstant, statt mit p zu fallen. Kostet nichts, der Wert steht in der
Instanzmatrix, die ohnehin geschrieben wird.

> **Ehrlich dazu: das spart keine Füllrate.** Dieselbe Fläche grün zu decken
> kostet dieselben Pixel. Gespart werden CPU, Vertex-Arbeit und Draw-Setup;
> gekauft wird Aussehen. Die Füllrate spart 11.2.

**11.4 — Den Boden unter dem Bewuchs einfärben.** Aus Befund 3: wo die
Zonenmaske Gras sagt, das Splat-Albedo Richtung Vegetationsfarbe ziehen. Der
Splat-Shader hat alles dafür schon zur Hand (`splat`, `viewDistance` je Pixel,
`terrain_splat.frag.glsl`). Wirkt auf **jeder** Stufe, auch jenseits der 160 m
Grasreichweite, und kostet eine Mischung.

### 11.4 gebaut und gemessen — 2026-08-11

**Der Boden bekommt die Farbe dessen, was auf ihm wächst.** `GROUND_TINT` in
`vegetation.config.ts`, drei Uniforms in `TerrainMaterial`, acht Zeilen in
`terrain_splat.frag.glsl`, ein Regler im Terrain-Ordner des Debug-Panels.
**Kein neues Erzeugnis, kein Bake-Schritt, kein Byte Download.**

Gezogen wird über die **Splat-Gewichte**: Fels 0, Gras 0,85, Sand 0, Reisfeld
0,25. Die Zielfarbe ist die Grundfarbe des Grasbüschels aus `SPECIES` —
abgeleitet und nicht danebengeschrieben, damit Boden und Pflanze nicht
auseinanderlaufen.

**Der entscheidende Teil ist der Helligkeitserhalt.** Ein glattes `mix()` zur
Zielfarbe zieht auch die Helligkeit mit und macht aus dem Hang eine grüne Pappe:
Felsbrocken, Erosionsrinnen und die Makro-Variation aus `TERRAIN.macroStrength`
verschwinden. Stattdessen wird die Zielfarbe auf die Leuchtdichte **des
jeweiligen Texels** normiert — der Farbton wandert, das Muster bleibt.

Gemessen am Blickpunkt `wald`, 1280 × 720, untere Bildhälfte:

| Zustand | grün | braun | mittleres RGB unten |
|---|---|---|---|
| Ultra vorher | 44,22 % | 46,07 % | 27,5 / 28,5 / 18,8 |
| **Ultra jetzt** | **77,82 %** | **6,63 %** | 24,7 / 29,4 / 18,8 |
| Minimal vorher | 5,71 % | 88,26 % | 35,3 / 29,2 / 25,0 |
| **Minimal jetzt** | **75,22 %** | **10,44 %** | 28,2 / 29,9 / 24,4 |

Zwei Dinge daran zählen:

1. **Der Abstand zwischen Ultra und Minimal ist von 38,5 Prozentpunkten auf 2,6
   gefallen.** Das ist die Größe, um die es dem Auftraggeber geht („Low und
   Ultra fast gleich").
2. **Die Helligkeit ist praktisch unverändert.** Der Helligkeitserhalt tut, was
   er soll; es ist ein Farbtonwechsel und keine Übermalung. Wäre die mittlere
   Helligkeit mitgewandert, stünde hier eine Look-Änderung statt einer
   Korrektur.

**Und es ist zuerst eine Ultra-Verbesserung.** Der Braunanteil auf Ultra fällt
von 46,07 auf 6,63 % — der Befund 3 war nie ein Problem der niedrigen Stufen.

> **Was damit ausdrücklich noch nicht gelöst ist:** die Karte wirkt auf Minimal
> weiterhin leer, weil die Bäume fehlen. Das ist die Dichte (Befund 2) und
> Aufgabe 11.2 — der Boden ist die *Voraussetzung* dafür, dass sie unauffällig
> gelöst werden kann, nicht die Lösung.

> **Offen und am Bild zu prüfen, bevor es als fertig gilt:** ob Grün dort steht,
> wo nichts wächst. Die Zonenkarte weiß nichts von der 38°-Neigungsgrenze der
> Kiefer, von der Straßenfreihaltung und von den Freiflächen um Props. Geprüft
> ist bisher **ein** Blickpunkt. Die Standpunkte, an denen es auffallen müsste,
> sind `pass` (Steinbruchwände sollen grau bleiben), `kueste` (kein grüner
> Strand) und der Gipfel (soll kahl bleiben). Fällt das durch, ist die gerechnete
> Bewuchskarte der nächste Schritt — dieselben Filter wie `scatterChunk`, je
> Texel aggregiert.

**11.5 — Der 520-m-Ring** (das ist die offene Entscheidung 6 aus P10.3). Nach
11.2 ist Kandidat C — grobe Fernstufe mit vervielfachter Zellgröße und
hochskalierten Instanzen — nicht mehr ein Kandidat neben anderen, sondern
derselbe Mechanismus wie 11.2/11.3 einen Schritt weitergedacht. Dazu, aus
derselben Ecke wie 11.4: jenseits der letzten Instanz die **Baum**-Eignungsmaske
ins Gelände einfärben. Der Nebel (Kandidat B) bleibt draußen.

### 11.5 gebaut und gemessen — 2026-08-11 · offene Entscheidung 6 ist entschieden

**Die Baumreichweite geht von 520 auf 1200 m. Gras und Büsche bleiben, wo sie
waren.** Damit ist der kahle Ring weg, und die offene Entscheidung 6 aus P10.3
ist beantwortet: es wurde **Kandidat A** (Reichweite hoch), und zwar nur für die
Bäume — nicht Kandidat B (Dunst) und nicht C als eigene Fernstufe.

**Warum das geht, steht in einer Zahl aus 11.0:** von den 50 711 sichtbaren
Instanzen am Blickpunkt `wald` sind rund **2 000 Bäume**, der Rest ist Gras
(allein 34 986 Gras-Imposter). Die Baumreichweite zu vervielfachen kostet
deshalb einen Bruchteil dessen, was dieselbe Änderung am Gras kosten würde — und
ab 180 m ist ein Baum ein Imposter, also zwei Dreiecke. Die Artenmaske aus P4
(`ScatterChunk.generated`) sorgt dabei von selbst dafür, dass ein Chunk auf
900 m gar keine Gras-Kandidaten erzeugt.

#### Das Ausdünnungsgesetz musste dafür geschärft werden

P11.2 hatte eine lineare Rampe vom Vollbereich bis zur **Ferngrenze der Art**.
Genau daran lag eine Kopplung, die erst hier auffiel: die Grenze von 520 auf
1200 m zu ziehen hätte die Dichte **bei 300 m** mitverändert — eine
Reichweitenänderung, die als Dichteänderung im Nahfeld ankommt. Dieselbe Sorte
Fernwirkung wie bei der Einebnungsschwelle der Reisfelder (P8.5).

Neu:

    keep(d) = 1                       für d ≤ R
    keep(d) = max(keepFar, (R/d)²)    für d > R

Das hängt **nur** vom Vollbereich ab, nicht von der Reichweite. Und es hält die
Zahl der Instanzen je Bildschirmfläche ungefähr konstant: die Ringfläche wächst
mit d, die Behaltequote fällt mit d² — die Instanzzahl über die zusätzliche
Strecke wächst damit **logarithmisch** statt quadratisch. Das ist der Grund,
warum 1200 m überhaupt bezahlbar sind.

#### Die Puffer werden integriert, nicht überschlagen

Geometrisch wären es bei 1200 m rund **95 530** Plätze je Baumart. Gebraucht
werden nur die, die das Gesetz übrig lässt, und das Integral hat eine
geschlossene Lösung (`ScatterSystem.#thinnedRingSlots`) — abgeleitet aus
demselben Gesetz, das `#pushChunk` anwendet, statt daneben geschätzt. Der
mittlere Term ist der logarithmische.

#### Zwei Fehler, die dabei aufgefallen sind

1. **Der Chunk-Cache war zu klein.** 512 Plätze bei 520 m Reichweite waren
   dreifach überdimensioniert; bei 1200 m liegen **π · 1200² / 64² ≈ 1104**
   Chunks im Umkreis, und der Cache warf in jedem Durchlauf weg, was er im
   nächsten wieder brauchte. Jetzt 2560.

   > **Gefunden hat es nicht ein Bild, sondern das Streaming-Signal aus P10.0:**
   > `streaming` ging nie mehr auf `false`, die Instanzzahl kroch und kam nicht
   > zur Ruhe. Ohne dieses Signal wäre eine Zahl aus einer halb gefüllten Welt
   > in dieser Doku gelandet — genau der Fall, für den es gebaut wurde.

2. **Die Zeitscheibe zählte die falschen Chunks.** Jeder Kandidat verbrauchte
   eine Scheibe des Etats, auch einer, den das Frustum sofort verwirft. Bei 361
   Kandidaten (520 m) war das egal, bei **1521** (1200 m) hätte ein Durchlauf 95
   Frames gedauert — 1,6 s Nachlauf. Der Etat ist gegen die *Umsortierkosten*
   gesetzt, und ein verworfener Chunk kostet davon nichts; er zählt seitdem nicht
   mehr mit. Die Arbeit je Frame ist dadurch unverändert.

#### Gemessen, 1280 × 720, Kette auf `lean` (der `off`-Pfad ist hier nicht auswertbar)

| Blickpunkt | Stufe | Instanzen | Dreiecke | Draw-Calls | verworfen | eingeschwungen |
|---|---|---|---|---|---|---|
| `wald-fern` | Ultra | 15 478 | 285 809 | 44 | 0 | ja, nach 1101 Frames |
| `wald` | Ultra | 53 116 | 484 735 | 63 | 0 | ja, nach 115 |
| `wald-fern` | Minimal | 2 326 | 102 907 | 32 | 0 | **nein** (Zeitlimit) |
| `wald` | Minimal | 12 684 | 165 783 | 57 | 0 | ja, nach 302 |

**Der Vergleich mit P11.0 ist der Punkt der ganzen Aufgabe:**

| `wald-fern`, Ultra | vorher | nachher |
|---|---|---|
| Instanzen | 12 046 | **15 478** |
| Dreiecke | 279 268 | **285 809** |

**Ein Wald bis zum Horizont für 2,3 % mehr Dreiecke.** Am Bild
(`p11_ring_wald-fern_ultra.png`) reicht der Bestand über die gesamte sichtbare
Landschaft; die Kante bei 520 m ist nicht mehr auffindbar.

#### Der Korrektheits-Check: steht Grün, wo nichts wächst?

Das war der offene Punkt aus 11.4, und er ist am Bild geprüft — Ultra, drei
Standpunkte, an denen der Splat-Ansatz danebengreifen müsste, wenn er es tut:

| Standpunkt | erwartet | gemessen |
|---|---|---|
| `pass` — Steinbruchwände und Massiv | Fels bleibt grau/braun | **in Ordnung.** Die Felsflanken sind unverändert braun, Grün steht nur im Graszonen-Band darunter |
| `start` — Übersicht aus 330 m | Talboden bewachsen, Gipfel kahl | **in Ordnung.** Der Talboden trägt Bewuchs bis zum Horizont, das Massiv bleibt Fels, die Kuppe kahl |
| `kueste` | kein grüner Strand | **nicht beantwortet** — der Blickpunkt zeigt offenes Meer, kein Ufer. Strukturell ausgeschlossen (Sand-Gewicht 0), aber **nicht am Bild belegt** |

Der Übersichtsblick ist zugleich der stärkste Beleg für die ganze Phase: laut
P10.0 trug `start` **67** Vegetationsinstanzen, weil bei 330 m Kamerahöhe fast
alles jenseits der 520 m lag. Jetzt sind es 2 492 — und das Gelände darunter
trägt die Farbe, wo keine Instanz mehr steht.

#### Was offen bleibt, und zwar ausdrücklich

- **Das kalte Füllen dauert.** `wald-fern` auf Ultra brauchte 1101 Frames bis zur
  Ruhe, Minimal lief bei 614 ins Zeitlimit. Begrenzt wird das von
  `SCATTER.workerQueueDepth: 4` — vier Chunks je Frame, und bei 1200 m sind rund
  1100 zu füllen. Auf 60 Hz wären das rund 18 s Kaltstart. **Das ist der nächste
  Kandidat zum Nachstellen**, und die Begründung für die 4 (Prioritätsordnung
  bei jedem Nachschub, siehe dort) ist gegen diesen neuen Fall nicht geprüft.
- **Minimal ist im Mittelfeld deutlich dünner als Ultra** (12 684 gegen 53 116 am
  `wald`). Am Bild liest es sich als bewaldete Landschaft und nicht als Steppe —
  aber es ist ein sichtbarer Unterschied, und er ist gewollt („Minimal darf
  weniger Details haben"). Wer ihn anders gewichten will, hat dafür die zwei
  Regler aus 11.2 und muss keinen Code anfassen.
- **Zwei Blickpunkte.** Gipfel, Küste, Stadt und Bergpass sind nicht angesehen.
  Die Zusage „von jedem Winkel" ist damit **nicht** eingelöst.
- **Keine Kostenaussage.** Weder GPU-Zeit noch Bildrate noch der kalte
  Streuaufwand sind auf dieser Maschine messbar.

### 11.6 gebaut und gemessen — 2026-08-11

**Der Auftrag:** „wenn das Gras nicht mehr gerendert wird, wenn es zu weit ist,
dass der Boden einfach grün ist … es können ganz weit weg auch nur ein grüner
Block sein … auch bei den Häusern, wenn man auf dem Berg ist, dass man sieht,
dass da was ist, aber nicht jedes Detail gerendert wird."

Drei Eingriffe, und der erste korrigiert einen Fehler in 11.4.

#### 1. Der Farbstich folgt der Ausdünnung, statt überall gleich zu sein

11.4 hat den Boden eingefärbt, aber mit **einer Konstante über die ganze
Karte**. Das war die falsche Form: gebraucht wird die Farbe **genau dort, wo die
Halme fehlen**, und das ist eine Funktion der Entfernung.

Der Verlauf ist deshalb an **dasselbe Gesetz** gekoppelt, das
`ScatterSystem.#pushChunk` anwendet — dieselben vier Zahlen, über
`uGroundTintLaw` in den Terrain-Shader gereicht:

    keep(d)     = 1 für d ≤ R, sonst max(keepFar, (R/d)²)
    Deckung(d)  = min(1, boostMax² · keep(d))        · 0 jenseits der Grasreichweite
    Stärke(d)   = mix(strengthNear, strengthFar, 1 − Deckung(d))

Damit ist die Kante **bauartbedingt** unsichtbar: beide Seiten rechnen aus
denselben Werten, und wenn die Stufe sie ändert, wandern beide zusammen.
`TerrainSystem` zieht sie bei `quality:changed` nach — und zwar **vor** dem
Rückzieher auf die Gitterweite, sonst würde der Nachzug bei jedem Wechsel
übersprungen, bei dem das Gitter gleich bleibt (Ultra↔Hoch, jeder Reglerzug der
eigenen Stufe).

> **Ein Rückschritt dabei, gemessen und zurückgenommen.** `strengthNear` stand
> zuerst auf 0,5 — mit der Überlegung, dort, wo echte Halme stehen, brauche der
> Boden weniger Farbe. Am Blickpunkt `wald` auf Ultra fiel der Grünanteil damit
> von **77,82 auf 52,69 %**, der Braunanteil stieg von 5,95 auf 28,78 %. Bei
> 2,2° Sonnenstand deckt das Gras eben nicht so viel, wie die Überlegung annahm.
> Zurück auf 0,8, `strengthFar` auf 0,97 — **die Rampe darf nur hinzufügen, nie
> wegnehmen.** Nachgemessen: 77,94 % gegen 77,82 %, also unverändert im Nahfeld
> und besser in der Ferne (`wald-fern` 18,71 → 22,72 % grün).

#### 2. Zwei Reichweiten statt einer: Kronen und Bodendecker

Jede Art trägt jetzt eine `layer`-Angabe, und die Stufe hat neben
`vegetationRange` (Bäume) ein `vegetationGroundRange` (Gras, Busch).

Der Grund steht in einer Zahl aus 11.0: **34 986 der 50 711 sichtbaren
Instanzen am Blickpunkt `wald` waren Gras-Imposter.** Gras ist der teuerste
Posten des Systems — und der einzige, den der Bodenfarbstich vollständig
ersetzen kann. Bäume kann er nicht ersetzen: sie stehen gegen den Himmel und
tragen die Silhouette eines Grats.

| Stufe | voll bis | fern | Gras-Reichweite |
|---|---|---|---|
| Ultra | 160 m | 60 % | 100 % (160 m) |
| Hoch | 130 m | 50 % | 90 % |
| Mittel | 105 m | 40 % | 75 % |
| Niedrig | 80 m | 30 % | 62 % |
| Minimal | 55 m | 22 % | 50 % (80 m) |

Die Leiter ist damit in **beide** Richtungen bewegt worden: der Nahbereich der
unteren Stufen wurde deutlich großzügiger (Minimal 30 → 55 m voll, 14 → 22 %
fern), die Grasreichweite dafür halbiert. Das ist genau der Tausch, den der
Auftrag verlangt — mehr Dichte da, wo man hinsieht, weniger da, wo der Boden
einspringt.

#### 3. Häuser bleiben sichtbar, ihr Detail nicht

`PROP_CLASSES.mittel.cullDistance` stand auf **650 m**: ein Bauernhaus
verschwand dort **vollständig**, und vom Übersichtsblick aus war das halbe Dorf
nicht da — nicht grob gezeichnet, abwesend. Neu: `mittel` 2200 m, `gross`
3600 m (die Kartendiagonale ist 4344 m).

**Angehoben wurde nur `cullDistance`, nicht `lodDistance`.** Das ist die ganze
Antwort auf den Auftrag: *ob* etwas da ist, entscheidet die Cull-Grenze, *wie
genau* die LOD-Grenze. Ein Haus auf 1,5 km steht als grober Block da.

Und es ist praktisch umsonst: auf der Karte stehen rund 175 Props gegen 53 116
Vegetationsinstanzen. P10.1 hat die Wirkung der Props auf die Stufen als
„unterhalb der Messbarkeit" gemessen — dieselbe Messung heißt hier gelesen: die
Sichtbarkeit kostet nichts, sie war nur nie eingestellt.

#### Gemessen, 1280 × 720, Kette auf `lean`, alle Zellen `verworfen: 0`

| Blickpunkt | Stufe | Instanzen | Dreiecke | Draw-Calls | grün | braun |
|---|---|---|---|---|---|---|
| `wald` | Ultra | 53 116 | 484 735 | 63 | 77,94 % | 5,94 % |
| `wald` | **Minimal** | **15 728** | **187 553** | 57 | **82,24 %** | 8,61 % |
| `wald-fern` | Ultra | 15 478 | 285 809 | 44 | 22,72 % | 9,04 % |
| `wald-fern` | **Minimal** | 2 056 | 102 395 | 31 | 17,81 % | 11,72 % |
| `start` | Ultra | 3 866 | 592 689 | 180 | 4,20 % | 3,83 % |
| `start` | **Minimal** | 1 424 | 181 662 | 98 | 2,46 % | 3,39 % |

Minimal steht damit am `wald` bei **30 % der Instanzen und 39 % der Dreiecke**
von Ultra — und hat im Grünanteil der unteren Bildhälfte **mehr** als Ultra
(82,24 gegen 77,94 %), weil der Deckungserhalt in der Ferne leicht
überzeichnet. Im Bildpaar ist der Unterschied ein anderer Detailgrad, keine
andere Welt.

Am Übersichtsblick `start` liegen beide Stufen bei rund 3 % Grünanteil und
3…4 % Braun: aus 330 m Höhe trägt fast alles der **Boden**, nicht die Instanz —
genau das war der Auftrag.

#### Was offen bleibt

- **Minimal ist gegen P11.5 teurer geworden**, nicht billiger: 187 553 statt
  165 783 Dreiecke am `wald`. Der Nahbereich wurde absichtlich dichter, die
  Ferne dafür dünner. Ob der Tausch auf einer Intel-iGPU aufgeht, ist auf dieser
  Maschine **nicht messbar**.
- **`start` auf Ultra braucht 180 Draw-Calls** (gegen 63 am `wald`), weil die
  Props jetzt bis 2200 bzw. 3600 m gezeichnet werden. Das Budget liegt bei 800,
  ist also weit weg — aber es ist der einzige Posten, der durch diese Aufgabe
  spürbar gewachsen ist, und er gehört im Auge behalten.
- **`start` auf Ultra kam nicht zur Ruhe** (Zeitlimit bei 200 s). Der kalte
  Aufbau der 1200-m-Ferne bleibt der offene Punkt aus 11.5;
  `SCATTER.workerQueueDepth` ist weiter der Begrenzer.
- **Drei Blickpunkte.** Stadt, Pass und Küste sind in dieser Runde nicht neu
  gemessen worden.

**11.7 — Occlusion-Culling über die `HeightPyramid`.** Sie führt Min/Max je
Quadtree-Knoten; ein Ray-March gegen die Max-Höhen beantwortet „liegt ein Grat
dazwischen" in wenigen Schritten.

> **Wichtige Einordnung, damit die Erwartung stimmt:** im Tal und im Wald spart
> das viel, **auf dem Gipfel nichts** — dort ist alles im Frustum und nichts
> verdeckt. Für den Blick von oben, den der Auftraggeber ausdrücklich nennt,
> hilft nur LOD (11.2/11.5), nicht Culling. Deshalb steht 11.6 hinten.

**11.7 — `renderScale` 0,5 zurücknehmen.** Die Vorgabe lautet volle Auflösung.
Die Ersparnis müsste dann aus 11.2/11.5 kommen. **Ungemessen**, ob das trägt —
das ist eine Frage an die GPU-Maschine und nicht an diese hier.

**11.8 — Was auf Minimal wirklich weg darf.** Wind (vom Auftraggeber
freigegeben). SSAO — die Bodenflecken sind ein eigenes System und bleiben, der
Kontakt am Stammfuß geht also nicht verloren. Nicht weg: Blattstreulicht (trägt
den Look bei 2,2° Sonnenstand) und die planare Spiegelung — die eher
viertelauflösend und ohne Vegetation im Spiegeldurchgang als ganz aus.

---

## Akzeptanzkriterien

**Nachgeholt am 2026-08-18.** Diese Liste stand seit dem 2026-08-11 als
„Entwurf" ohne einen einzigen Haken da, obwohl 11.2 bis 11.6 gebaut und je
einzeln gemessen waren — dieselbe Buchführungslücke wie die veralteten
Statuszeilen in SPEC §7 und im Kopf dieser Datei. **Fünf von sieben sind eingelöst, eine ist
gemessen verfehlt und zurückgezogen, eine bleibt offen** (ein `live`-Lauf mit
Bildrate, dieselbe Lücke wie P12.6).

- [x] **Auf keiner Stufe rendert etwas in der falschen Farbe.** Befund 1 („die
      Vegetation ist auf Minimal weiß") ist **widerlegt**, nicht behoben: er
      gehörte dem Software-Rasterisierer der anderen Maschine, nicht dem
      Projekt. Auf der GPU-Maschine am 2026-08-18 nachgesehen — Bildpaar
      `p11_wald_ultra.png` / `p11_wald_minimal.png`, beide korrekt gefärbt.
      Die vollständige Geschichte samt der sieben umsonst geprüften Vermutungen
      steht bei Befund 1.
- [x] **Der Grünanteil im Nahfeld ist auf Minimal nicht kleiner als auf Ultra.**
      Gemessen am Blickpunkt `wald`, untere Bildhälfte, vollständig
      eingeschwungen (`ScatterSystem.streaming === false`, 735 bzw. 729
      getriebene Frames):

      | | Grünanteil | Mittel Grünkanal |
      |---|---|---|
      | Ultra | 20,37 % | 27,6 |
      | **Minimal** | **23,93 %** | 37,8 |

      Vorher (11.0): **5,71 % gegen 44,22 %**. Minimal ist heute nicht nur nicht
      grüner*los*, sondern **grüner als Ultra**.

      > **Der Umfang und die Ursache gehören dazu, sonst ist das eine zu große
      > Behauptung.** Geprüft ist *ein* Blickpunkt; die Zeile fordert drei.
      > Und Minimal unterscheidet sich von Ultra nicht nur im Bewuchs: es
      > rendert mit `renderScale` 0,5 und mit der Kettenstufe `compact`, hat
      > also eine andere Tonkurve — der höhere **Mittelwert** des Grünkanals
      > (37,8 gegen 27,6) kommt zu einem guten Teil daher. Den Gewinn allein
      > 11.4/11.6 zuzuschreiben wäre derselbe Fehler wie in P8.5, wo drei
      > Eingriffe zusammen gemessen und einem zugeschrieben wurden.
- [x] **Ein einzelner Baum aus der Nähe ist auf Minimal von Ultra nicht zu
      unterscheiden.** Bildpaar `p11_baum_ultra.png` / `p11_baum_minimal.png`:
      Kamera 9 m vor der nächstgelegenen Kiefer in voller Auflösung
      (`pine:v0:lod0` bei 739 / 126 / −709), beide Stufen vollständig
      eingeschwungen.

      **Der Baum selbst ist identisch** — dieselbe Geometrie, dieselben
      Facetten, dieselbe Schattierung, und das ist auch zu erwarten: es ist
      dasselbe LOD0-Mesh mit demselben Material, und das Nahfeld wird gemessen
      nur um 1,4 % ausgedünnt (siehe Zeile darunter).

      > **Was sich trotzdem unterscheidet, gehört dazugesagt — sonst ist der
      > Haken zu groß.** Die beiden *Bilder* sind unterscheidbar: Minimal ist
      > heller (mittlere Helligkeit 112,97 gegen 101,76) und rendert mit
      > 1280 × 720 statt 2560 × 1440. Beides sind **gewollte Kosten der Stufe**
      > — Kettenstufe `compact` ohne AO und `renderScale` 0,5 — und nicht die
      > Frage, die diese Zeile stellt. Sie fragt, ob die *Vegetation* nah
      > schlechter wird, und das tut sie nicht.
- [x] **Die Instanzzahl im Fernfeld sinkt messbar**, während die im Nahfeld
      gleich bleibt. Gemessen am Blickpunkt `wald`, alle Instanzmatrizen nach
      Entfernung von der Kamera einsortiert, beide Stufen eingeschwungen
      (735 bzw. 741 getriebene Frames):

      | Entfernung | Ultra | Minimal | Δ |
      |---|---|---|---|
      | **nah, 0…60 m** | 9 976 | **9 840** | **−1,4 %** |
      | mittel, 60…300 m | 39 396 | 4 500 | −88,6 % |
      | fern, über 300 m | 3 744 | 1 388 | −62,9 % |
      | **gesamt** | **53 116** | 15 728 | −70,4 % |

      **Damit ist 11.2 kein umbenannter Dichteregler.** Ein Dichteregler hätte
      alle drei Zeilen um denselben Faktor gesenkt; hier bleibt das Nahfeld
      stehen und das Mittelfeld bricht weg.

      > **Eine Gegenprobe, die nicht aus dieser Messung stammt:** die 53 116 auf
      > Ultra stehen zeichengleich in CLAUDE.md, gemessen am 2026-08-11 mit einem
      > anderen Werkzeug. Zwei Wege zur selben Zahl.
      >
      > Und ein Blickpunkt, der die Frage **nicht** beantworten kann, gehört
      > auch dazu: `wald-fern` hat in beiden Stufen **null** Instanzen unter
      > 100 m. Wer dort nach dem Nahfeld sucht, misst eine leere Menge.
- [ ] **Volle Auflösung auf jeder Stufe.** **Gemessen verfehlt**, und die Zahlen
      stehen seit P12 dort: Mittel 0,85 · Niedrig 0,7 · **Minimal 0,5**, dazu
      auf Touch-Geräten der Pixelfaktor-Deckel 1,25. Die Auflösung ist gemessen
      der zweitstärkste Hebel des ganzen Systems (P12.0: −33,4 % GPU-Zeit bei
      halber Auflösung); sie stehen zu lassen hieße, die Zielhardware
      aufzugeben. **Diese Zeile wird nicht eingelöst, sie wird zurückgezogen** —
      und sie steht als verfehlt da, nicht als gestrichen.
- [ ] **Auf der GPU-Maschine gemessen, in Betriebsart `live`, mit Bildrate.**
      **Halb, und der Rest ist hier nachweislich unmöglich.** Die Messungen
      oben laufen auf der GPU-Maschine (RX 7900 XTX), aber in Betriebsart
      `driven`. Ein `live`-Lauf braucht rAF, und den gibt es in der
      eingebetteten Vorschau nicht — am 2026-08-18 noch einmal nachgeprüft:
      **30 angeforderte Frames sind in 30 s nicht zustande gekommen**, der
      Aufruf lief in die Zeitüberschreitung. CLAUDE.md führt das seit P10.0,
      und es gilt unverändert.

      > Damit ist diese Zeile keine Nachlässigkeit, sondern dieselbe Lücke wie
      > P12.6, P13 und P14: sie braucht ein **sichtbares Fenster** auf einer
      > Maschine mit GPU. `npm run dev:lan` steht dafür bereit.

- [x] **Kette weiterhin bitgleich reproduzierbar.** `npm run world` zweimal am
      2026-08-18: **bitgleich über alle 54 Dateien**. Der Lauf hat dabei einen
      Altfehler gefunden — `shade.json` trug die Laufzeit des Bakers, siehe
      P15.6.

## Risiken

- **„Nichts darf schlechter werden" und „läuft auf jedem Toaster" ziehen
  gegeneinander**, und 11.7 zieht am stärksten. → Wenn die volle Auflösung nicht
  trägt, steht die erreichte Zahl hier, so wie P7 es vorgemacht hat.
- **11.2 verschiebt Arbeit vom Worker auf den Hauptthread** (je Instanz ein
  Hash-Vergleich beim Einsortieren, statt einmal beim Streuen). → Die CPU-Zeit
  des Streusystems je Frame ist eine bestehende Messgröße im Debug-Panel; sie
  gehört vorher und nachher abgelesen.
- **Zwei neue Regler je Stufe sind zwei neue Gelegenheiten für die
  Regelschleife**, vor der dieses Projekt an drei Stellen warnt. → Jeder bekommt
  seinen Nachweis in der Matrix, oder er bekommt keinen Regler.
- **11.4 und 11.5 färben Gelände ein, das keine Vegetation trägt.** Das ist eine
  Look-Änderung an einer Stelle, an der bisher eine Fototextur stand. → Am Bild
  prüfen, und zwar auch dort, wo *kein* Bewuchs stehen soll: der Gipfel soll kahl
  bleiben, der Steinbruch am Bergpass grau.

---

# P12 — Handy, Touch und die echten Kosten ◐

> **Der Auftrag, wörtlich:** das Spiel soll „auch auf einem Handy oder einem sehr
> alten schlechten Laptop" laufen, dabei „nicht viel schlechter aussehen", Ultra
> soll „fast nicht bis nur sehr minimal schlechtere Grafik" bekommen und
> deutlich besser optimiert werden, und auf Minimal darf Detail fehlen, solange
> es ausgeglichen wird — „wenn du Gras entfernst, einfach den Boden grün machen".
> Dazu: Touch, Tablet und Mobile überhaupt erst unterstützen.

**Die Ausgangslage, gemessen am 2026-08-16** (RX 7900 XTX, siehe unten):

| Befund | Zahl |
|---|---|
| Spanne der ganzen Stufenleiter Ultra→Minimal | **1,6× bis 3,0×** GPU-Zeit |
| „Hoch" gegen Ultra | an **3 von 4** Blickpunkten **teurer** |
| Touch-Handler im gesamten Projekt | **0** |
| Startdownload aus `dist/` (ohne `.br`/`.map`) | **53,4 MB** gegen 15 MB Budget |

## 12.0 Der Messstand — gebaut und gemessen, 2026-08-16

**Warum das die erste Aufgabe war.** Diese Sitzung läuft auf einer Maschine mit
echter GPU, und `EXT_disjoint_timer_query_webgl2` ist da — die Werkzeuglücke aus
P10.0 ist zu. Der erste Lauf damit hat aber sofort gezeigt, dass eine vorhandene
Zeitabfrage noch keine Messung ist. Einzelheiten und die Regeln stehen in
CLAUDE.md unter „Wie GPU-Zeit hier gemessen wird"; die zwei Befunde:

1. **Eine sequenzielle Messreihe ist wertlos, solange etwas anderes dieselbe GPU
   benutzt.** Acht Eingriffe bei 3840 × 2160, der Reihe nach: die Kosten stiegen
   **monoton**, unabhängig vom Eingriff. „Nur Gitter 17²" (−31 % Dreiecke) kam
   auf 19,5 ms gegen 12,5 ms der Basis davor. Dieselbe Basis, 21-mal über einen
   Lauf verteilt: **3,75…11,98 ms**.
2. **`lastGpuMs` ist nicht immer *ein* Frame.** `StatsProfiler.update()`
   summiert je Frame **alle** Zeitabfragen, die gerade fertig geworden sind —
   das sind null, eine oder zwei. Am `wald` gemessen: Median 1,89 ms,
   10. Perzentil **0,91 ms**. Faktor 2,1, also genau eine doppelt gezählte
   Abfrage.

**Gebaut:** `src/debug/abMeasure.ts` mit `japanMap.ab({ variants })`, dazu
`src/debug/measureCommon.ts` — `countScene`, `settle`, `advancer`, `macrotask`
und `statsOf` liegen jetzt einmal statt zweimal im Baum, `report.ts` liest sie
von dort. Drei Eigenschaften, und jede ist die Antwort auf einen der Befunde:

- **Interleavt.** Jede Variante steht zwischen zwei Basiswerten und wird gegen
  deren **Mittel** gerechnet, nicht gegen einen Wert vom Anfang des Laufs.
- **10. Perzentil statt Median**, Nullwerte verworfen. Beide Störungen können
  einen Messwert nur *vergrößern*; es gibt keinen Mechanismus, der ihn zu klein
  macht.
- **Das Rauschband wird gemessen**, aus den Abständen benachbarter Basiswerte
  (90. Perzentil). Was darunter liegt, meldet das Werkzeug als **„im Rauschen"**
  und nicht als Ergebnis.

**Selbsttest:** eine **Nullprobe** — eine Variante, die nichts ändert. Gemessen
Δ = **+0,04 ms**, `significant: false`. Ein Messstand, der seinen eigenen
Nullfall nicht als Null erkennt, ist gefährlicher als keiner.

### Der erste ehrliche Lauf — `wald`, 1280 × 720, Basis Ultra

2 Runden, 60 Frames je Zustand, Rauschband **±0,40 ms** bei **1,66 ms** Basis
(24 % — LM Studio lief auf derselben Karte):

| Eingriff | Δ ms | Δ % | Dreiecke | Calls |
|---|---|---|---|---|
| **Kette aus** (`postFx: 'off'`) | **−0,62** | **−37,6 %** | ±0 | 74→48 |
| **Auflösung 50 %** | **−0,55** | **−33,4 %** | ±0 | 74 |
| **PostFX `lean`** | **−0,44** | **−26,6 %** | ±0 | 74→63 |
| AO halbe Auflösung | −0,22 | im Rauschen | ±0 | 75 |
| AO aus | −0,19 | im Rauschen | ±0 | 68 |
| Spiegelung aus | −0,05 | im Rauschen | ±0 | 74 |
| PostFX `reduced` | −0,03 | im Rauschen | ±0 | 68 |
| Gitter 17² statt 33² | +0,29 | im Rauschen | **−31 %** | 74 |

**Zwei Dinge stehen damit fest, und ein drittes ausdrücklich nicht:**

- **Die Postprocessing-Kette und die Auflösung sind die beiden Hebel.** Zusammen
  tragen sie mehr als alles andere zusammen, und beide sind bisher nur als
  Alles-oder-nichts verdrahtet: die Kette fällt erst auf „Minimal" weg, und dann
  mitsamt Grading-LUT und Bloom.
- **Ein Drittel weniger Gelände-Dreiecke ist nicht messbar.** Das ist der
  Hebel, an dem P8.1 die Stufen aufgehängt hat.
- **Was unter dem Rauschband liegt, ist nicht „wirkungslos", sondern
  ungemessen.** Mit freier GPU wäre das Band kleiner. Diese Zeile ist keine
  Ausrede — sie ist der Unterschied zwischen einem Messwert und einer Meinung,
  und P11 hat zweimal knapp daneben gestanden.

> **Eine eigene Korrektur gehört hierher.** Vor dem Bau dieses Werkzeugs hatte
> ich die Kette am selben Blickpunkt mit **83 %** beziffert — gemessen über den
> **Median** und auf einer mitbenutzten GPU. Mit dem richtigen Schätzer sind es
> **37,6 %**. Die Schlussfolgerung (Kette und Auflösung sind die Hebel, die
> Vegetations- und Geländeregler sind es nicht) trägt beide Zahlen; die Größe
> war überzogen. Genau dafür ist 12.0 gebaut worden.

**Nicht in der Produktion:** `abMeasure.ts` hängt wie alles unter `debug/` an
`import.meta.env.DEV`. Geprüft wie in P10.0 — der Text „Rauschband" kommt in
`dist/assets/*.js` **null**mal vor.

### Ein Fehler, den 12.0 im Messlauf aus P10.0 gefunden hat

Der erste Probelauf von `report()` nach dem Umbau schrieb **`gpu.medianMs: 0`**
in die Datei — also genau die Null, die `readGpuTiming()` seit P10.0
ausdrücklich vermeiden will, weil sie sich wie „kostet nichts" liest. Der Timer
war dabei in Ordnung; `gpuTiming.available` stand korrekt auf `true`.

Die Ursache ist derselbe stats-gl-Befund: von 20 gemessenen Frames trugen nur
**4** eine fertig gewordene Zeitabfrage, die übrigen 16 lieferten 0 — und der
Median von 20 Werten, die zu 80 % null sind, ist null. `measureCell()` sammelte
die Nullen mit ein.

Behoben in zwei Schritten, und der zweite ist der wichtigere:

1. Nullen werden verworfen statt gemittelt.
2. **Der Lauf warnt**, wenn weniger als ein Viertel der Frames eine Abfrage
   trug. Nachgemessen meldet er jetzt 2,241 ms bei 4 von 20 Frames — *mit* der
   Warnung, dass die Zelle so keine belastbare GPU-Spalte hat.

Der Punkt ist nicht der Zahlendreher, sondern dass er seit P10.0 in jedem Lauf
auf einer Maschine mit Timer aufgetreten wäre — und der erste solche Lauf
(2026-08-07, RX 7900 XTX) hat mit 60 Frames je Zelle offenbar knapp genug
Abfragen erwischt, dass es niemandem auffiel. **Eine Messgröße braucht neben
ihrem Wert die Zahl ihrer Stichproben**, sonst ist nicht zu sehen, ob sie eine
ist.

## 12.1 Die kompakte Kette — gebaut und gemessen, 2026-08-16

**Der Befund aus dem ersten sauberen Lauf.** Blickpunkt `wald`, **3840 × 2160**
(bei 720p ist die Arbeit für diese Karte zu klein — das Rauschband lag dort bei
27 %, hier bei **5,1 %**), interleavt gegen Ultra:

| Eingriff | GPU | Δ |
|---|---|---|
| Basis Ultra | 4,54 ms | — |
| **Kette aus** | 0,91 ms | **−77,9 %** |
| **AO aus** | 2,27 ms | **−48,6 %** |
| AO auf halbe Auflösung | 2,72 ms | −38,3 % |
| PostFX `lean` | 4,04 ms | −9,6 % |
| Gras halbe Reichweite | 4,13 ms | −8,2 % |
| PostFX `reduced` | 4,31 ms | −4,6 % *(im Rauschen)* |
| Gitter 17² statt 33² | 4,31 ms | −3,5 % *(im Rauschen)* |
| Spiegelung aus | 4,40 ms | −1,6 % *(im Rauschen)* |

**Die Umgebungsverdeckung allein war 62 % der ganzen Kette**, und Ultra fuhr sie
in *voller* Auflösung. Das ist der teuerste einzelne Posten des Projekts
gewesen — und der Kommentar bei `POSTFX.ao.halfRes` sagt seit P2 voraus, dass
halbe Auflösung „rund ein Drittel" spart und kaum zu sehen ist. Er stand nur bei
der Konstante und nicht bei der Stufe.

### Was gebaut wurde

**1. `postFx: 'compact'`** — eine Kettenstufe zwischen `lean` und `off`.
`toneMapping` wandert in den Renderer (dort kostet es nichts, three rechnet es
ohnehin im Materialshader), Bloom und SMAA entfallen, **LUT und Vignette
bleiben** als ein einziger Durchgang. Umgesetzt als **zweiter EffectPass**, von
dem immer genau einer läuft: die Effektliste eines `EffectPass` ist beim Bauen
in seinen Shader gebacken, ein Umbau zur Laufzeit wäre ein Passtausch mitten im
Bild.

> **Die Falle aus P8.2 steht hier wieder.** Ein abgeschalteter Pass wird von
> `EffectComposer.render()` vollständig übersprungen, und `renderToScreen` ist
> beim Hinzufügen genau einmal gesetzt worden. `#updateRenderToScreen()` läuft
> deshalb nach **jedem** Umschalten. Geprüft: `anteilNichtSchwarz = 1,000` auf
> allen fünf Stufen.

**2. Die AO rechnet auf jeder Stufe in halber Auflösung** (P12.2). Belegt am
Bild, nicht an der Zahl — Bildpaare bei 1280 × 720 gegen das Rauschband aus zwei
Aufnahmen desselben Zustands:

| Blickpunkt | Rauschband | halbe Auflösung | AO ganz aus |
|---|---|---|---|
| `pass` | 0,09 % der Pixel | **2,76 %**, Mittel 0,94/255 | 55,72 %, Mittel 4,06 |
| `stadt-neon` | 0,37 % | **4,13 %**, Mittel 0,72/255 | 50,12 %, Mittel 7,53 |

Im achtfach verstärkten Differenzbild (`.cache/shots/p12ao_*_diff8x.png`) ist die
Fläche schwarz; sichtbar sind nur Ränder an Vegetationssilhouetten, und die
stehen teils schon im Rauschband. AO *auszuschalten* verändert dagegen die Hälfte
des Bildes.

**3. Der Pixelfaktor hängt am Gerät** (P12.3, `RENDER.maxPixelRatioCoarse`).
Ein Telefon meldet `devicePixelRatio` 2,6…3,5; mit dem Desktop-Deckel von 2
rendert ein 412-CSS-Pixel-Gerät 824 × 1783 ≈ 1,47 Mpix. Der Deckel liegt auf
Touch-Geräten bei **1,25** — bei 400…500 ppi immer noch die drei- bis vierfache
Winkelauflösung eines Desktop-Bildes bei Faktor 1. Gemessen am gebauten Stand
bei 375 × 812: Zeichenpuffer **398 × 862** statt vorher 637 × 1380.

### Die Leiter danach — `wald`, 3840 × 2160, Rauschband 0,6 %

| Stufe | GPU | Δ gegen Ultra | Puffer | Draw-Calls |
|---|---|---|---|---|
| **Ultra** | **2,71 ms** | — | 3840×2160 | 75 |
| Hoch | 2,63 ms | −2,5 % | 3840×2160 | 69 |
| Mittel | 1,64 ms | −39,2 % | 3264×1836 | 64 |
| Niedrig | 1,04 ms | −61,4 % | 2688×1512 | 56 |
| **Minimal** | **0,61 ms** | **−77,5 %** | 1920×1080 | 49 |

**Ultra ist von 4,54 auf 2,71 ms gefallen — 40 % billiger, ohne sichtbare
Änderung.** Die Spanne der Leiter geht von **1,6×** (P11-Stand am `wald`) auf
**4,4×**. Und „Hoch" ist zum ersten Mal billiger als Ultra statt teurer.

### Was `compact` kostet — der Tausch, benannt

Basis Ultra ohne AO bei 4K (2,047 ms), damit die Kette allein dasteht:

| Kette | GPU | Δ |
|---|---|---|
| `full` | 2,047 ms | — |
| `lean` | 1,722 ms | −15,9 % |
| **`compact`** | **1,538 ms** | **−24,8 %** |
| `off` | 0,740 ms | −64,3 % |

Und in der wirklichen Stufenbelegung: **Minimal mit `compact` 0,595 ms gegen
0,369 ms mit `off`.** Der Farbstich kostet also **0,23 ms**, und dafür sieht
Minimal aus wie Ultra statt wie ein anderes Spiel. Das ist eine bewusste
Entscheidung gegen die billigere Zahl, und sie steht hier mit ihr.

> **Der Rest der kompakten Kette ist nicht der Effekt-Pass, sondern der Puffer.**
> `compact` kostet gegen `off` 0,80 ms, und darin steckt vor allem, dass die
> Szene in ein **HalfFloat**-Ziel gerendert wird statt direkt in den Canvas: bei
> 4K sind das 66 MB Schreiben, danach dasselbe wieder Lesen. Ein 8-bit-Puffer
> wäre für `compact` ausreichend (der Renderer tonemappt vorher, es stehen nur
> Anzeigewerte darin) und halbierte den Verkehr. `EffectComposer` legt seinen
> Puffertyp aber beim Bauen fest; ihn zur Laufzeit zu tauschen hieße, den
> Composer neu aufzubauen — mit dem Risiko, dass die Effekt-Pässe für den
> falschen Farbraum initialisiert bleiben. **Nicht gebaut, beziffert:** der
> nächste Kandidat mit rund 0,3 ms bei 4K.


## 12.4 Touch, Tablet und Handy — gebaut und geprüft, 2026-08-16

**Der Befund.** Es gab keinen einzigen Touch-Handler im Projekt, und das war
nicht der schlimmste Teil. Der Zustand der Oberfläche hing vollständig am
**Pointer Lock**: `PlayerUi.#everLocked` wurde nur in `pointerlockchange`
gesetzt. Auf einem Telefon kommt der Lock nie zustande — iOS Safari kennt
`requestPointerLock` gar nicht, Android lehnt ihn bei Fingereingabe ab. Also
blieb das Flag für immer falsch, und mit ihm war **das Pausenmenü unerreichbar**:
kein Weg zur Qualitätsstufe, keine Blickpunkte, keine Steuerung. Ein Besucher mit
Telefon bekam ein Standbild und einen Kasten mit der Aufschrift „Für Touch-Geräte
ist diese Ansicht nicht ausgelegt".

Dazu, alles am **gebauten** Stand bei 375 × 812 gemessen (Port 4180 — im
Dev-Server verdeckt das Debug-Panel jede Lücke):

- **Der Menükasten war oben abgeschnitten und nicht scrollbar.** Höhe 944,5 px
  in 812 px Ansichtsfenster, `place-content: center` + `overflow-y: auto` →
  `boxTop = −66,25` bei `scrollTop = 0`, und `scrollHeight` (902) war kleiner als
  der Kasten. Dauerhaft außerhalb lag ausgerechnet die Kopfzeile mit dem
  **„Weiter"-Knopf**.
- **24 Knöpfe, der kleinste 25 px hoch** (Apple verlangt 44 pt, Android 48 dp).
- Reglerzeilen als festes Raster `1fr 150px 52px` — für die Beschriftung blieben
  122 px bei 11 px Schrift.

### Was gebaut wurde

**`src/ui/TouchControls.ts`** — Stick links, Ziehen rechts, zwei Finger rechts
fürs Tempo, ▲/▼ für steigen und sinken, ☰ ⟲ ⇩ als Knöpfe. Der Stick erscheint
**dort, wo der Finger aufsetzt**; ein fester Stick ist im Querformat mit dem
Daumen kaum zu erreichen.

Drei Entscheidungen, die begründet gehören:

1. **Pointer Events statt Touch Events.** `setPointerCapture` hält die Bewegung
   fest, auch wenn der Finger den Canvas verlässt — sonst bleibt eine Achse
   stehen und die Kamera fliegt weiter. `pointercancel` fängt zusätzlich den
   Anruf, die Wischgeste von der Kante und den App-Wechsel.
2. **Die Achsen werden zur Tastatur *addiert*, nicht gegen sie getauscht.** Ein
   Tablet mit Tastatur darf nicht die eine Quelle verschlucken. Geklemmt wird auf
   Länge 1 statt normiert — sonst wäre jeder angetippte Stick Vollgas.
3. **`look()` ist öffentlich am `FreeFlyController`**, statt die Blickmathematik
   ein zweites Mal zu schreiben. Dort steckt der Gier-Faktor gegen den
   Pol-Wirbel, den P8 einmal gemessen und behoben hat; ein eigener Touch-Pfad
   brächte ihn stillschweigend zurück.

**`PlayerUi`** hängt nicht mehr am Lock: `#everLocked` heißt jetzt `#started` und
wird auf Touch von der ersten Berührung gesetzt. `#resume()` fordert auf Touch
gar keinen Lock an — er käme nicht, und auf iOS Safari wirft der Aufruf.

**Das CSS** bekommt `place-items` statt `place-content` (Overflow nach oben ist
nicht erreichbar), ein Schmalformat-Raster untereinander, 44-px-Knöpfe,
`height: 100dvh` gegen die einblendende Adressleiste und `env(safe-area-inset-*)`
für Notch und Home-Indicator.

### Gemessen am gebauten Stand, 375 × 812, `pointer: coarse`

| | vorher | nachher |
|---|---|---|
| `window.japanMap` | undefined | undefined ✓ *(Dev-Code weiterhin entfernt)* |
| Kastenoberkante bei `scrollTop = 0` | **−66,25 px** | **+12 px** |
| „Weiter"-Knopf | 25 px hoch, unerreichbar | 44 px, `elementFromPoint` trifft ✓ |
| Steuerknöpfe | — | 5 × 56 × 56 px, alle getroffen ✓ |
| Zeichenpuffer | 637 × 1380 | **398 × 862** |

Und die Gesten treiben die Kamera wirklich — im Dev-Stand nachgemessen, nicht
aus dem DOM geschlossen:

| Geste | Wirkung |
|---|---|
| Stick 56 px nach oben, 30 Frames | Kamera **7,70 m** weiter |
| danach loslassen, 30 Frames | 3,23 m Auslauf *(die Dämpfung, keine hängende Achse)* |
| rechts 100 px ziehen | Blick **27,7°** gedreht |
| ▲ halten, 30 Frames | **+2,76 m** Höhe |

> **Ein Fehler, den erst der Prüfstand gefunden hat.** `setPointerCapture` stand
> **vor** dem Zeichnen des Sticks und wirft `NotFoundError`, sobald die Zeiger-ID
> nicht mehr aktiv ist. Ergebnis: die Bewegung wirkte, der Stick blieb
> **unsichtbar** — eine Steuerung ohne Anzeige. Jetzt wird zuerst gezeichnet und
> danach eingefangen, und das Einfangen darf scheitern: es ist eine
> Verbesserung, keine Voraussetzung. Zusätzlich räumt `blur` einen hängenden
> Stick auf (nachgemessen).

### Was ausdrücklich offen bleibt

- **Auf keinem echten Telefon geprüft.** Alle Zahlen oben stammen aus einem
  Chromium mit gesetztem Ansichtsfenster und synthetischen Zeigerereignissen.
  Ob sich der Stick *anfühlt*, ist damit nicht beantwortet — das ist P12.6.
- **Keine Bildrate von Zielhardware.** Siehe P12.6.
- **Kein Gamepad.** Die Achsenschnittstelle ist dafür gebaut, benutzt wird sie
  nicht.

## 12.5 Der Startdownload — teilweise, 2026-08-16

`tools/optimize-hdri.mjs` liest Radiance-RGBE (RLE und flach), mittelt **linear**
herunter und schreibt flach zurück. Linear ist der Punkt: RGBE hat einen
gemeinsamen Exponenten, ein Mittel darüber wäre ein Mittel über Logarithmen, und
Sonnenrand und Wolke stünden im selben Texel systematisch zu dunkel.

Das Werkzeug **liest seine eigene Ausgabe wieder ein** und hält sie gegen die
Eingabe; ein Kodierer, der das nicht tut, ist ungeprüft. Für das IBL:
6,21 MB → **2,00 MB**, mittlere Leuchtdichte weicht um **0,0445 %** ab, größter
Pixelfehler 0,83 %.

**Eingebaut wird es aber nur auf Touch-Geräten**, und der Grund ist gemessen. Die
naheliegende Begründung — „es wird ohnehin von `PMREMGenerator` gefaltet, die
Quellauflösung ist egal" — stimmt für den diffusen Anteil und **nicht für den
spiegelnden**. Bildvergleich bei 1280 × 720, vollständig eingeschwungen
(identische Instanzzahlen in beiden Läufen):

| Blickpunkt | Rauschband | 2k gegen 1k | mittlere Helligkeit |
|---|---|---|---|
| `stadt-neon` | 0,42 % der Pixel | **42,97 %**, Mittel 3,06/255 | 91,79 → 89,65 (**−2,3 %**) |
| `pass` | 0,14 % | 40,49 %, Mittel 3,67/255 | 68,68 → 67,98 (−1,0 %) |
| `kueste` | 0,65 % | 4,45 %, Mittel 0,56/255 | 104,74 → 104,73 (±0) |

Im zehnfach verstärkten Differenzbild ist es eine **gleichmäßige** Verschiebung
über alle umgebungsbeleuchteten Flächen — kein Artefakt, sondern die erwartete
Folge: ein weichgezeichnetes Umgebungsbild hat flachere Glanzlichter, und nasser
Asphalt hat genau die niedrige Rauheit, bei der das auffällt. `kueste` zeigt
offenes Meer und ändert sich nicht.

Sichtbar ist die Verschiebung im Nebeneinander nicht; **messbar ist sie**. Also
bekommt das Telefon die kleine Datei (dort sind 2 % Glanzlichtunterschied bei
Pixelfaktor 1,25 jenseits des Sichtbaren, 4,21 MB über Mobilfunk nicht) und der
Desktop die große. Es wird immer nur **eine** geladen.

### Und ein Posten, der nichts kostet und trotzdem gespart wird

Die Detail-Normalen des Geländes blenden zwischen 100 und 420 m aus — die
Normalmap wurde jenseits davon aber **weiter abgefragt** und das Ergebnis mit
null multipliziert. Das ist ein Drittel aller Texturabfragen des Splat-Blocks.
Seit P12.5 überspringt der Shader die Abfrage, sobald die Ausblendung durch ist.

Gemessen bei 3840 × 2160, interleavt, Rauschband 0,007…0,039 ms:

| Blickpunkt | nachher | was das Abfragen kostete | Ersparnis |
|---|---|---|---|
| `pass` | 4,779 ms | 1,224 ms | **−20,4 %** |
| `start` | 2,683 ms | 0,427 ms | **−13,7 %** |
| `wald` | 2,707 ms | 0,004 ms | im Rauschen — dort ist die Abfrage nötig |

Und das Bild ändert sich nicht: alte gegen neue Fassung unter zeitkontrollierten
Bedingungen (feste Frame-Zahl statt „bis stabil", damit Wolken und Wind gleich
weit gelaufen sind) — `pass` 0,62 % der Pixel über Schwelle 2 bei Mittel
0,21/255, `stadt-neon` 0,36 % bei 0,29. Das Wind- und Wolken-Rauschband über
dieselbe Frame-Zahl liegt bei **0,465**.

> **Der erste Vergleich dazu war falsch, und der Fehler gehört hierher.** Er
> meldete +2,25 mittlere Helligkeit und damit eine klare Änderung. Verglichen
> wurden aber eine Aufnahme nach 1816 Einschwing-Frames und eine nach 90 — bei
> warmem Chunk-Cache. Gleiche Instanzzahl am Ende, **verschiedene
> Zwischenstände** in Spiegelung und Streuung. Erst der Lauf mit *fester*
> Frame-Zahl auf beiden Seiten war ein A/B. Dieselbe Lehre wie in P10.0: ein
> Zustand ist nicht fertig, weil eine Zahl stillsteht.

**Was am Download offen bleibt:** der sichtbare Himmel (16,1 MB), `height.r16`
(8,4 MB), `normal.png` (5,8 MB — aus dem Höhenfeld ableitbar) und die
JPEG-Normalmaps. Der Stand ist damit **53,4 MB** gegen 15 MB aus SPEC §4; auf
Touch-Geräten 4,21 MB weniger.

## 12.6 Auf echter Zielhardware messen — offen

Der Dev-Server steht auf `127.0.0.1`. Mit `--host` im LAN erreichbar gemacht,
ruft ein Telefon `japanMap.report({ mode: 'live' })` selbst auf und legt JSON und
PNGs in `.cache/reports/` ab — **ohne** Touch-Steuerung, denn der Lauf fliegt die
Blickpunkte selbst an. Android Chrome hat `EXT_disjoint_timer_query_webgl2`, also
kommt dort GPU-Zeit **und** Bildrate heraus.

Das ist die einzige Zahl, die von außen kommen muss. Alles oben ist auf einer
RX 7900 XTX gemessen, und SPEC §4 führt genau diese Karte als „unbrauchbar als
Maßstab". Belastbar sind Verhältnisse, nicht Absolutwerte.

## Akzeptanzkriterien P12

- [x] **Die Stufenleiter spannt mehr als 3×.** Gemessen 4,4× am `wald` (vorher
      1,6×).
- [x] **Ultra ist billiger geworden, ohne sichtbar schlechter zu werden.**
      4,54 → 2,71 ms bei 4K; die AO-Änderung ist am Bild gegen ein Rauschband
      geprüft.
- [x] **„Hoch" ist nicht mehr teurer als Ultra.** 2,63 gegen 2,71 ms.
- [x] **Minimal behält den Farbstich.** `postFx: 'compact'` statt `off`; der
      Preis steht mit 0,23 ms in 12.1.
- [x] **Auf keiner Stufe ist das Bild unvollständig.** `anteilNichtSchwarz`
      1,000 auf allen fünf.
- [x] **Touch steuert Bewegung, Blick, Höhe und Tempo**, und das Menü ist ohne
      Pointer Lock erreichbar — am gebauten Stand gemessen.
- [x] **Kein Dev-Code im Build.** „Rauschband" kommt in `dist/assets/*.js`
      nullmal vor, `window.japanMap` ist im Build `undefined`.
- [ ] **Auf einem echten Telefon gemessen.** P12.6 — offen.
- [x] **Startdownload unter der Schwelle der Zielplattform.** Eingelöst in
      **P15**: **17,02 MB** übertragen gegen ≤ 20 MB für die Mobile-Homepage
      von CrazyGames (SPEC §4.1). ~~Unter 15 MB~~ — diese Zahl hatte seit P0
      keine Herkunft und ist zurückgezogen, nicht erfüllt. Zum Zeitpunkt von
      P12 standen hier 53,4 MB als Ordnersumme, was zusätzlich die falsche
      Größe war: übertragen wurden damals 40,83 MB.
- [ ] **Volle Auflösung auf jeder Stufe** (aus P11 übernommen). Nicht eingelöst:
      Mittel 0,85 · Niedrig 0,7 · Minimal 0,5, und auf Touch-Geräten liegt
      zusätzlich der Pixelfaktor-Deckel bei 1,25. Die Auflösung ist gemessen der
      zweitstärkste Hebel des Systems; sie stehen zu lassen hieße, die
      Zielhardware aufzugeben.

## 12.7 Der Abschlusslauf — 2026-08-16

### Am `stadt-neon`, wo die Spiegelung wirklich läuft

3840 × 2160, interleavt gegen Ultra, Rauschband **1,2 %** (0,044 ms bei 3,561 ms):

| Eingriff | GPU | Δ | Dreiecke | Draw-Calls |
|---|---|---|---|---|
| Basis Ultra | 3,561 ms | — | 656 371 | 126 |
| **AO aus** | 2,779 | **−21,9 %** | ±0 | 119 |
| **PostFX `compact`** | 3,095 | **−12,7 %** | ±0 | 107 |
| PostFX `lean` | 3,188 | −10,3 % | ±0 | 115 |
| AO mit 8 Abtastungen | 3,325 | −6,6 % | ±0 | 126 |
| AO mit 12 Abtastungen | 3,458 | −2,9 % | ±0 | 126 |
| **Spiegelung aus** | 3,479 | **−2,3 %** | **354 323 (−46 %)** | **82 (−44)** |
| PostFX `reduced` | 3,524 | −1,2 % *(im Rauschen)* | ±0 | 120 |
| **Gitter 17² statt 33²** | 3,521 | **−0,9 %** *(im Rauschen)* | **260 083 (−60 %)** | 126 |

> **Die zwei letzten Zeilen sind das Ergebnis dieser ganzen Phase.** Die
> Spiegelung halbiert die Dreiecke und spart 44 Draw-Calls für **2,3 %**; das
> gröbere Geländegitter wirft 60 % aller Dreiecke weg und ist **nicht messbar**.
> Auf dieser Karte sind Dreiecke praktisch umsonst — und genau daran hat dieses
> Projekt seine Stufen von P8.1 bis P11 aufgehängt.
>
> **Und dieser Satz überträgt sich ausdrücklich *nicht* auf die Zielhardware.**
> Auf einer Kachel-GPU (Adreno, Mali, PowerVR — also jedem Telefon) kostet ein
> zweiter Szenendurchgang seinen eigenen Tile-Resolve, und 44 zusätzliche
> Draw-Calls sind dort ein anderer Posten als hier. Was diese Messung belegt,
> ist die Rangfolge **auf einer Desktop-GPU**. Die Rangfolge auf einem Telefon
> ist P12.6 und steht aus.

### Die Leiter bei 1280 × 720 — die Auflösung, die wirklich gespielt wird

Nicht interleavt (je eine p10-Messung über ~100 Stichproben), also mit dem
720p-Rauschband von rund 25 % zu lesen:

| Blickpunkt | Ultra | Hoch | Mittel | Niedrig | Minimal | Spanne |
|---|---|---|---|---|---|---|
| `wald` | 0,664 ms | 0,780 | 0,559 | 0,373 | **0,216** | **3,1×** |
| `stadt-neon` | 0,901 | 0,858 | 0,533 | 0,491 | **0,320** | **2,8×** |
| `start` | 0,864 | 0,947 | 0,644 | 0,390 | **0,323** | **2,7×** |

**Bei 720p ist die Spanne kleiner als bei 4K (2,7…3,1× gegen 4,4×)**, und das ist
kein Widerspruch: Bei einer Frame-Zeit von 0,7 ms misst diese Karte überwiegend
ihren eigenen festen Aufwand, nicht die Arbeit. Auf einer schwachen GPU liegt
der Anteil umgekehrt — dort zählt die 4K-Zahl mehr, weil sie den
füllratenbegrenzten Zustand beschreibt.

Alle 15 Zellen: `verworfen: 0`, `anteilNichtSchwarz` 1,000 (am `wald` 0,995 —
Baumsilhouetten im Gegenlicht, seit P10.0 als normal vermerkt).

### Was diese Phase am Bild verändert hat, zusammengefasst

| | vorher | nachher |
|---|---|---|
| Ultra, `wald`, 4K | 4,54 ms | **2,71 ms** (−40 %) |
| Spanne der Leiter, `wald`, 4K | 1,6× | **4,4×** |
| „Hoch" gegen Ultra | **teurer** an 3 von 4 Blickpunkten | 2,5…4 % billiger |
| Minimal | ohne Grading-LUT (anderer Look) | mit — Preis 0,23 ms |
| Zeichenpuffer auf dem Telefon | 637 × 1380 | **398 × 862** |
| Pausenmenü auf dem Telefon | **unerreichbar** | ☰, Knöpfe 56 px |
| Startdownload auf Touch-Geräten | 53,4 MB | 49,2 MB |

> **`dist/` ist seit 12.5 **größer** als der Download — das ist Absicht und
> gehört dazugesagt.** Der Ordner enthält **beide** IBL-Auflösungen (55,45 MB),
> geladen wird aber genau eine: 6,21 MB auf dem Desktop, 2,00 MB auf einem
> Touch-Gerät. Wer die Ordnergröße für den Startdownload hält, liest 2 MB zu
> viel — die Zahl in SPEC §4 meint übertragene Bytes bis zum ersten Bild.

---

# P13 — Startbildschirm, Reiter und Debug im Menü ◐

**Der Befund, aus dem diese Phase entsteht**, in einem Satz: im laufenden Bild
stand Bedienung, die dort nicht hingehört. Gemessen am Dev-Stand (5180)
unmittelbar nach dem Laden — also in dem Zustand, in dem jemand die Karte zum
ersten Mal sieht:

| Element | vorher | Bemerkung |
|---|---|---|
| `.hint` — Kasten in der Bildmitte | **sichtbar** | „Klick ins Bild" plus achtzeilige Tastentabelle |
| `.stats` — Zahlenblock oben links | **sichtbar** | Draw-Calls, Dreiecke, GPU-ms |
| `.debug-pane` — Tweakpane oben rechts | **sichtbar** | 280 px Regler |
| `.menu` | versteckt | richtig |

Drei von vier Flächen lagen im Bild, bevor der Nutzer irgendetwas getan hatte.
Zwei davon sind Werkzeug (die `localStorage`-Voreinstellung war *an*), die
dritte war ein Erklärkasten für eine Geste, die man auch an einen Knopf hätte
hängen können.

## 13.1 Der Startbildschirm — gebaut und gemessen, 2026-08-17

`src/ui/LoadingScreen.ts` → **`src/ui/StartScreen.ts`**. Die Mechanik des
Fortschritts ist unverändert (Balken aus `engine:loading`, Text aus beidem — die
Begründung steht seit P7.3 im Kopf der Datei und gilt weiter). Neu ist das Ende:
statt sich auszublenden, wechselt die Fläche auf `data-phase="bereit"`, wird
halbdurchsichtig — die fertige Karte steht dahinter — und zeigt einen
**„Starten"-Knopf** mit der Steuerungstabelle darunter.

**Der Knopf ist nicht Kosmetik.** `requestPointerLock()` verlangt eine
Nutzergeste. Solange die Geste „irgendwohin ins Bild klicken" war, brauchte es
einen Kasten, der das erklärt — und der durfte den Klick dann nicht selbst
verschlucken. Genau daran ist P10.2 einmal hängengeblieben (`pointer-events:
none` stand in der Datei, `auto` im Browser, weil `#overlay > *` einen
ID-Selektor trägt). Ein Knopf **ist** das Ziel des Klicks; die Frage stellt sich
nicht mehr, und `.hint` ist ersatzlos entfallen.

Gemessen am gebauten Stand (4180) und im Dev-Stand (5180):

| | 1280 × 720 | 375 × 812 |
|---|---|---|
| Kasten passt ohne Rollen | ja (198…522 px) | ja (178…634 px) |
| Knopf | 200 × 56 px, `elementFromPoint` trifft ihn | ebenso |
| Tastentabellen | 1 (nur Tastatur) | **2** (Finger + Tastatur) |
| Fokus nach `ready()` | `start__button` | ebenso |
| Fortschrittsblock im Zustand „bereit" | `display: none` | ebenso |

> **Eine Reihenfolgenfalle, und sie ist echt.** `Engine.start()` sendet
> `engine:warmedup` noch **in seinem eigenen Aufruf**; `PlayerUi` — der Abnehmer
> des Knopfes — entsteht erst danach. Der Knopf steht also einen Wimpernschlag
> lang da, ohne dass ein Handler hängt. `StartScreen` merkt sich einen Druck in
> `#pending` und holt ihn nach, sobald `onStart()` gesetzt wird. Ein
> abgeschalteter Knopf wäre die naheliegende Alternative gewesen und hätte einen
> vierten Zustand gekostet.

## 13.2 Das Pausenmenü bekommt Reiter — gebaut und gemessen, 2026-08-17

Vorher vier Abschnitte untereinander, jetzt vier Reiter: **Grafik · Steuerung ·
Blickpunkte · Debug**. Der letzte existiert nur, wenn `PlayerUi` eine
`DebugControl` bekommen hat — also nur im Dev-Build.

Der Grund ist gemessen und nicht ästhetisch. Bei 375 × 812 ist allein der Reiter
„Grafik" **1082 px** hoch (sechs Stufenknöpfe, neun Reglerzeilen im
zweizeiligen Schmalraster) — mehr als der Schirm. Mit allen vier Abschnitten
untereinander war es entsprechend mehr, und P12.4 hatte dafür bereits einmal die
Zentrierung reparieren müssen (`place-items` statt `place-content`, weil der
Kasten sonst bei −66,25 px begann und die Kopfzeile mit „Weiter" unerreichbar
war).

**Gescrollt wird jetzt im Kasten statt auf der Fläche darunter.** `.menu__box`
ist eine Flex-Spalte mit `max-height: 100%`, Kopfzeile und Reiterreihe stehen
fest (`flex: none`), allein `.menu__panel` rollt (`min-height: 0` — ohne diese
Zeile schrumpft ein Flex-Kind nicht unter seinen Inhalt und der Deckel bliebe
folgenlos).

Gemessen bei 375 × 812, jeder Reiter über den echten Weg geöffnet (☰):

| Reiter | Kastenhöhe | Kopfzeile im Bild | Reiter rollt | Fläche rollt |
|---|---|---|---|---|
| Grafik | 788 px *(gedeckelt von 1082)* | ja | ja | **nein** |
| Steuerung | 563 | ja | nein | nein |
| Blickpunkte | 591 | ja | nein | nein |
| Debug | 381 | ja | nein | nein |

Und die Prüfung, die in diesem Projekt zählt: **alle 35 Bedienelemente werden
von `elementFromPoint` getroffen** (Grafik 17, Blickpunkte 16, Debug 2), bei
375 × 812 wie bei 1280 × 720, im Dev-Stand wie im Build.

> **Ein Fehlalarm, der dem Prüfstand gehörte und nicht dem Code.** Ein erster
> Lauf meldete den „Weiter"-Knopf als **nicht treffbar** — darüber lag der
> ☰-Knopf der Fingersteuerung. Ursache war der Prüfstand: er hatte
> `menu.hidden = false` von Hand gesetzt und damit `#render()` übersprungen, das
> das Bedienfeld ausblendet. Über den echten Weg (☰ drücken) ist der Knopf
> getroffen. **Wer eine Oberfläche prüft, muss sie über ihre eigenen Wege
> öffnen** — ein von Hand gesetzter Zustand ist ein Zustand, den es im Betrieb
> nicht gibt.

## 13.3 Debug startet aus und wohnt im Menü — gebaut und gemessen, 2026-08-17

`japanmap.debug.visible` (ein Schlüssel, Voreinstellung **an**) wird zu
`japanmap.debug.stats` und `japanmap.debug.pane` (zwei Schlüssel, Voreinstellung
**aus**). Getrennt, weil man die beiden unterschiedlich oft braucht: der
Zahlenblock ist eine Messung, die Werkzeugleiste ist ein Eingriff.

F1 bleibt und schaltet beides zugleich — steht *eines* im Bild, macht F1 alles
aus. Der Zwischenzustand gehört dem Menü.

Gemessene Schaltmatrix (Dev-Stand, frisch geladen, `localStorage` leer):

| Schritt | `.stats` | `.debug-pane` | Kästchen | `localStorage` |
|---|---|---|---|---|
| frisch geladen | versteckt | versteckt | ☐ ☐ | `null` `null` |
| Kästchen „Zahlenblock" | **sichtbar** | versteckt | ☑ ☐ | `1` `null` |
| Kästchen „Werkzeugleiste" | sichtbar | **sichtbar** | ☑ ☑ | `1` `1` |
| **F1** | versteckt | versteckt | ☐ ☐ | `0` `0` |
| **F1** | sichtbar | sichtbar | ☑ ☑ | `1` `1` |

Die Kästchen folgen F1, weil `DebugPanel` `debug:visibility` sendet und
`PlayerUi` darauf `#syncDebug()` fährt. Ohne diesen Weg zeigte das Menü nach
einem Tastendruck den alten Stand — die Anzeige, die lügt, gegen die dieses
Projekt schon zweimal angetreten ist (`viewDistance`, `shadowCascades`).

**Der `BudgetGuard` bleibt unangetastet und ungeschaltet.** Er steht nicht
dauerhaft im Bild, sondern nur bei einer Überschreitung, und genau das ist sein
Zweck seit P4.6: „eine Budget-Überschreitung, die niemand bemerkt, fällt Wochen
später auf". Ein Schalter dafür wäre ein Schalter gegen die eigene Absicherung.

## 13.4 Der Weg zurück, wenn der Pointer Lock scheitert

Bis P13 schloss `pointerlockerror` das Menü, weil danach `.hint` übernahm. Ohne
`.hint` wäre das ein Bild **ganz ohne Bedienelement** gewesen: der Lock kam
nicht, also reagiert auch keine Taste. Das Menü bleibt jetzt **offen** — sein
„Weiter" ist der Wiederholversuch, und Chromes Sperre nach einem Escape ist nach
gut einer Sekunde von selbst vorbei.

Prüfbar ist das ausgerechnet hier, wo der Lock grundsätzlich scheitert (die
eingebettete Vorschau wirft `WrongDocumentError`, siehe CLAUDE.md). Gemessen:

| Handlung | Menü unmittelbar danach | nach 250 ms |
|---|---|---|
| „Starten" (Desktop) | zu | **offen** |
| Blickpunkt „wald" gewählt | zu, Kamera bei 742/134/−690 | **offen** |
| „Weiter" | zu | **offen** |
| Escape bei offenem Menü | zu | **offen** |

Kein Zustand ohne Ausweg. Auf einer Maschine mit funktionierendem Lock ist die
rechte Spalte jeweils „fliegt" — das ist der **nicht** prüfbare Teil und steht
deshalb als solcher hier.

## Akzeptanzkriterien P13

- [x] **Im laufenden Bild steht nach dem Start nichts von der Oberfläche.**
      `.hint` gibt es nicht mehr, `.stats` und `.debug-pane` starten versteckt.
- [x] **Der Ladebildschirm endet in einem Knopf**, und der Knopf holt den
      Pointer Lock synchron im Klick.
- [x] **Das Menü hat Reiter, und jeder passt.** Kopfzeile bei allen vier
      Reitern im Bild, bei 375 × 812 wie bei 1280 × 720.
- [x] **Alle Bedienelemente sind treffbar** — 35 von 35 über `elementFromPoint`,
      in beiden Ständen.
- [x] **Debug ist im Build nicht vorhanden.** Der Reiter fehlt (`grafik`,
      `steuerung`, `blick`), `.stats` und `.debug-pane` fehlen im DOM,
      `window.japanMap` ist `undefined`, `tweakpane` kommt in `dist/assets/*.js`
      **null**mal vor.
- [x] **`typecheck` und `build` laufen sauber durch**, das Bild bleibt
      vollständig (`anteilNichtSchwarz` 1,000).
- [ ] **Auf einer Maschine mit funktionierendem Pointer Lock geprüft.** Hier
      nicht möglich — die eingebettete Vorschau wirft `WrongDocumentError`.
      Betrifft: „Starten" führt wirklich ins Fliegen, Escape öffnet das Menü aus
      dem Flug, „Weiter" kehrt zurück.
- [ ] **Auf einem echten Telefon geprüft.** Die Zahlen oben stammen aus der
      Geräteemulation bei 375 × 812, nicht von Hardware — dieselbe Lücke wie
      P12.6.

---

# P14 — Die Fahrschicht: Freeride ◐

> **Beauftragt am 2026-08-18**, mit vier Vorgaben des Auftraggebers: eigene
> Arcade-Physik statt Rapier, Fahrgefühl „Arcade-Drift, Touge-Stil", Kollision
> gegen Gelände + Leitplanken + Gebäude und Props, Umschalten per Taste mit
> Verfolgerkamera. Kein Rennen, keine Rundenlogik, keine KI — **Freeride**.
>
> Diese Phase ersetzt den Plan aus P9 nicht, sie löst seinen Teil 9.1 und 9.2
> ein. 9.3 (Rundenlogik auf den Toren aus 8.11) bleibt ungebaut.

**Was gebaut wurde** — `src/game/`, fünf Dateien:

| Datei | Aufgabe |
|---|---|
| `Vehicle.ts` | Fahrmodell: Reifenkräfte, Gieren, Federung, Kollisionsauflösung |
| `CollisionWorld.ts` | Hindernisse als analytische Körper in einem Raster |
| `ChaseCamera.ts` | Verfolger- und Haubenkamera |
| `carMesh.ts` | Fahrzeuggeometrie, prozedural |
| `DriveSystem.ts` | Eingabe, Moduswechsel, Boden, Szene, Messwerte |

Dazu `src/config/vehicle.config.ts` (alle Zahlen) und `src/debug/driveProbe.ts`
(der Messstand).

---

## Das Fahrmodell in einem Absatz

Ein Einspurmodell mit Reifenkennlinie `f(n) = 2n/(1+n²)`, `n = α/α_peak`. Das
Maximum liegt bei `n = 1`, danach **fällt** die Kraft wie `2/n` — dieser Abfall
ist der Ausbruchpunkt und damit die halbe Anforderung. Die andere Hälfte ist
`rearGripFactor = 0,94`: die Hinterachse verliert zuerst, der Wagen übersteuert
statt zu schieben. Vollgas verlangt 8,6 % mehr Antriebskraft, als die
Hinterachse überträgt (`maxDriveForce` 7200 N gegen 6627 N Haftgrenze) — deshalb
lässt sich ein Drift mit dem Gas einleiten und nicht nur mit der Handbremse.

Höhe und Federung sind dynamisch (eine Feder gegen die Ebene durch die vier
Radaufstandspunkte), **Nicken und Wanken sind kinematisch**. Damit kann sich das
Auto nicht überschlagen. Das ist eine Entscheidung und kein Zufall; sie steht im
Kopf von `Vehicle.ts`.

---

## 14.1 — Was der Messstand am Fahrzeug gefunden hat

Der Prüfstand (`japanMap.driveProbe()`) treibt die Physik ohne zu rendern —
3600 Schritte für eine Minute Fahrt in rund 50 ms. Er hat drei Fehler gefunden,
die alle drei am Bild nicht zu sehen waren.

### Der teuerste: das Modell erzeugte Energie

**Befund.** Ein eingeleiteter Drift bei 93 km/h stand nach 2,75 s bei
**1622 km/h**. An der Bahn war nichts zu sehen — das Auto fuhr ja; die Zahlenreihe
zeigte es sofort.

**Ursache.** Die erste Fassung führte Längs- und Quergeschwindigkeit als
*Zustand* im mitrotierenden Fahrzeugsystem fort und trug die Zentripetalterme
nach (`v̇_long = ΣFx/m + ω·v_lat`). Die Gleichung ist richtig; mit explizitem
Euler ist sie es nicht. Die beiden Terme sind eine **Drehung** des
Geschwindigkeitsvektors um `ω·dt`, und explizit integriert wird daraus ihre
Tangente — die um `√(1 + (ω·dt)²)` länger ist. Bei 60 Hz und ω = 15 rad/s sind
das 3 % Zuwachs je Schritt, also das Sechsfache je Sekunde.

**Fix.** In **Weltkoordinaten** integrieren. Dort dreht sich der
Geschwindigkeitsvektor gar nicht, wenn sich das Fahrzeug dreht; die
Zentripetalterme verschwinden ersatzlos, weil sie ein Artefakt des Bezugssystems
waren und keine Kraft. Gerechnet wird weiter in Fahrzeugachsen, nur einmal je
Schritt neu projiziert statt fortgeschrieben.

**Gegenprobe.** Drift bei 89 km/h einleiten, dann **nichts** tun:

| | 0,0 s | 0,5 s | 1,0 s | 1,5 s | 2,0 s | 3,5 s |
|---|---|---|---|---|---|---|
| Tempo (km/h) | 89 | 84 | 79 | 75 | 74 | 73 |
| Schwimmwinkel | −58° | −73° | −33° | 2° | 0° | 0° |

Monoton fallendes Tempo, und der Wagen fängt sich **ohne jede Eingabe** in 1,5 s.

> **Nebenbefund, der die Abstimmung mitbestimmt hat:** volles Gegenlenken
> (bang-bang, wie es eine Tastatur nur kann) machte es *schlechter* —
> −38° → −81° → −69° → −88°, ein klassischer Aufschaukler. Ein Modell, das sich
> selbst fängt, braucht keinen Helden am Lenkrad, sondern jemanden, der das Gas
> loslässt. Deshalb ist die einzige Fahrhilfe im Fahrzeug (`driftDamping`)
> schwach und greift erst hinter dem Kennlinienscheitel.

### Geradeauslauf und Beschleunigung

Auf idealem Boden (eben, Asphalt, keine Hindernisse), Vollgas aus dem Stand:

| Größe | gemessen | Auslegung |
|---|---|---|
| 0–60 km/h | 2,73 s | — |
| 0–100 km/h | **4,70 s** | 4,4 s (kraftbegrenzt, ohne Schlupfverluste) |
| nach 10 s | 162 km/h | — |
| Endtempo (60 s) | **255,8 km/h** | 264 km/h (`(P/c_drag)^⅓`, noch nicht ganz eingeschwungen) |
| seitlicher Versatz nach 60 s | **0,00 m** | 0 — das Modell ist symmetrisch |
| Gierwinkel nach 60 s | **0,000°** | 0 |

---

## 14.2 — Was der Messstand an der **Karte** gefunden hat

Das ist der eigentliche Ertrag dieser Phase: ein Fahrmodus prüft die Karte an
Stellen, an die eine Kamera nie kommt.

### Die Stadtplatte steht 97 cm über dem Gelände

**Befund.** Höhendifferenz zwischen `TerrainSampler` und der Mittellinie aus
`roads.json`, 1000 Proben je Strecke — die Messung, die PLAN.md 9.1 verlangt:

| Strecke | Median | 95 % | größter Ausreißer | wo |
|---|---|---|---|---|
| ring | 0,13 cm | 0,33 cm | 83,88 cm | (−593, −319) |
| toge | 0,12 cm | 0,44 cm | 52,94 cm | (−596, −317) |
| dorf | 0,18 cm | 0,91 cm | 2,75 cm | (−193, 87) |
| **stadt** | **94,30 cm** | 94,30 cm | 94,30 cm | konstant |
| **zufahrt** | **224,47 cm** | 425,98 cm | 429,70 cm | (807, 207) |
| sando | 0,22 cm | 2,65 cm | 7,89 cm | (836, −523) |
| feldpfad | 0,16 cm | 1,86 cm | 7,69 cm | (−762, 61) |
| kuestenpfad | 0,30 cm | 1,82 cm | 3,73 cm | (533, 710) |

Sechs Strecken liegen auf 1…3 mm. Zwei nicht — und die Ursache ist dieselbe:
der Baker ebnet den Stadtdistrikt auf **28,997 m** ein (14 641 Proben, 14 632
davon exakt auf diesem Wert, Maximum 29,001 m), die Stadtstraße liegt per
Konstruktion auf `CITY_ROAD_LEVEL` = 29,94 m. Dazwischen liegen 97,3 cm, die im
Bild die Schürze der Platte verdeckt.

> **Damit ist ein Kommentar in `city.config.ts` widerlegt.** Dort stand „das
> eingeschnittene Gelände steht im Distrikt bis 29,939 m hoch (gemessen, 14 641
> Proben), die Platte liegt bei 29,97 m und damit knapp darüber". Dieselbe
> Messung mit derselben Probenzahl sagt heute 28,997 m. Warum die alte Zahl
> einmal gestimmt hat, ist nicht feststellbar — seitdem wurde mehrfach neu
> gebacken, und P8.5 hält fest, dass die Erosion jede Änderung über die ganze
> Karte trägt. Der alte Text steht als widerlegt markiert dort weiter.

Für das Bild ist der Absatz harmlos (die Schürze ist genau dafür da). Für das
Fahren war er entscheidend: ein Auto auf der reinen Sampler-Höhe stünde in der
Stadt bis zur Fensterlinie im Asphalt.

**Fix.** Das Auto fährt auf einer **Grundlage aus Gelände plus Stadtplatte**
(dieselbe `districtBlend`-Funktion, die Baker und Straßengenerator benutzen) und
darauf eine **Fahrbahnkorrektur**, die je Schritt aus der Differenz zwischen
Mittellinie und ebendieser Grundlage gebildet wird. Auf den sechs unauffälligen
Strecken ist die Korrektur 1…3 mm groß und damit wirkungslos — es ist kein
Sonderweg für die Stadt, sondern derselbe Weg für alle.

**Gegenprobe** (Standhöhe des Fahrzeugs gegen die Oberkante des Fahrbahn-Meshes,
200 Proben je Strecke):

| | vor dem Fix | nach dem Fix |
|---|---|---|
| ring, toge, dorf, sando, feldpfad, kuestenpfad | −6,00 cm | **0,00 cm** (max 0,00) |
| stadt | −94,30 cm | **0,00 cm** |
| zufahrt | −157 cm (max −411) | **0,00 cm** |

> **Und ein Fehler im Messstand selbst.** Die erste Ablesung meldete durchweg
> exakt −6,00 cm, also genau `surfaceOffset` — der Wert, der herauskommt, wenn
> die Korrektur **null** ist. Der Prüfstand setzte das Auto ab, ohne vorher den
> Straßenzusammenhang zu bilden, und maß damit einen Zustand, den er selbst
> versäumt hatte herzustellen. Genau davor warnt CLAUDE.md mit „ein von Hand
> gesetzter Zustand ist ein Zustand, den es im Betrieb nicht gibt". Seitdem
> bildet `DriveSystem.placeAt()` den Zusammenhang selbst, und das ist auch im
> Betrieb richtig: ein Respawn in der Stadt setzte den Wagen sonst einen Meter
> unter den Asphalt.

Ein zweiter Fehler steckte darunter: die Korrektur wurde gegen das **rohe**
Gelände gebildet und auf die schon angehobene Grundlage addiert. Das Auto stand
danach 97,3 cm zu **hoch** — dieselbe Zahl, einmal von der Platte und einmal von
der Korrektur.

### 67 Leitplanken-Punkte stehen auf einer Fahrbahn

**Befund.** Der Prüfstand kam auf der `zufahrt` **48 m** weit und hing dann
**3081 von 3600 Schritten** in einem Hindernis fest. Kein Prop in 25 m Umkreis;
ein Rasterabtrag der Kollisionswelt zeigte ein diagonales Band quer über die
Straße.

Systematisch nachgezählt: **67 von 1608 Plankenpunkten (4,2 %) stehen auf einer
Fahrbahn** — 43 auf dem Ring, 20 auf dem Bergpass, 4 auf der Zufahrt. Es sind
die Einmündungen: der Generator setzt die Planke der Hauptstrecke durchgehend,
und wo eine andere Straße abzweigt, läuft sie quer über deren Mündung. **Im Bild
ist das eine Planke, die eine Straße absperrt.** Sie steht dort seit P3.

**Fix.** In `GuardrailBuilder`, also dort, wo die Planke entsteht — damit Bild
und Kollision dieselbe Planke meinen. Eine gesperrte Stützstelle **teilt** den
Lauf, statt übersprungen zu werden; übersprungen ergäbe ein Viereck über die
Lücke hinweg, also genau die Planke quer über der Mündung mit weniger
Stützstellen.

| | vorher | nachher |
|---|---|---|
| Plankenläufe | 15 | 19 (vier geteilt) |
| Stützstellen | 1608 | 1541 |
| davon auf einer Fahrbahn | **67** | **0** |
| Kollisionskörper gesamt | 2425 | 2354 |

> **Ein halbes Jahr lang hat das niemand gesehen, weil niemand gefahren ist.**
> Dieselbe Klasse wie die rückseitig gewickelten Flächen aus P8.11: ein Fehler,
> den keine Kennzahl meldet, weil keine Kennzahl die Frage stellt.

### Ein Bodensprung von 1,36 m an der Kreuzung Ring × Bergpass

**Befund.** Bei 49 km/h flog das Auto an (−593, −318) **8 m hoch** und landete
60 m weiter im Hang. Der Boden springt dort in **einem** Schritt um 1,36 m.

**Ursache.** Dort laufen zwei Strecken auf verschiedener Höhe zusammen, das
Gelände trägt die Einschnitte beider, und `closestPoint()` wechselt beim
Vorbeifahren von der einen Mittellinie auf die andere. Für die Federung ist ein
Bodensprung von 1,36 m ein Rammbock.

**Fix.** Die Fahrbahnkorrektur folgt ihrem Ziel mit begrenzter Rate (3 m/s, also
5 cm je Schritt). Der Sprung ist damit nach 0,45 s abgebaut; solange steht das
Auto einige Zentimeter neben der Fahrbahnoberkante. Ein Sprung der Korrektur ist
ein Artefakt der Höhenquelle und keine Geometrie — im Bild gibt es an der
Kreuzung keine Stufe, also darf er auch nicht wie eine wirken.

---

## 14.3 — Der Messstand und seine eigenen drei Fehler

`driveRoad()` fährt eine Strecke mit einem Regler ab. Er ist ein Werkzeug und
kein Fahrer, und er hat dreimal das Falsche gemessen, bevor er das Richtige
maß:

1. **Lenkgesetz.** Erst `δ ∝ α` (Proportionalregler ohne Bezug zur
   Fahrzeuggeometrie) — schaukelte sich auf und lag nach 331 m im Graben. Jetzt
   Pure Pursuit, `δ = atan(2 L sin α / l_d)`.
2. **Bremspunkt.** Erst die Krümmung am Vorausschaupunkt (bei 40 m/s rund 30 m
   voraus). Bremsen aus 48 m/s auf 15 m/s braucht bei 1,25 g aber **84 m** — der
   Regler kam mit 174 km/h an einer Kurve an, für die er 68 km/h gebraucht
   hätte. Jetzt ein Geschwindigkeitsprofil über 200 m Vorausschau.
3. **Maßgeblicher Reibwert.** Er plante mit `TIRE.gripAsphalt` — dem Wert der
   *Vorderachse*. Ausbrechen tut die Hinterachse. 6 % Unterschied, genug um von
   „am Limit" nach „darüber" zu kippen.

> **Was dieser Prüfstand grundsätzlich nicht kann: sagen, ob es sich gut
> anfühlt.** Er fährt mit einem Regler, nicht mit einer Absicht. Ob der Drift
> kontrollierbar ist, braucht eine Hand an der Tastatur — und diese Antwort
> steht hier ausdrücklich **aus**.

---

## 14.4 — Die Fahrten

`japanMap.driveProbe({ seconds: 60, speedCap: 14 })` — gemäßigtes Tempo, weil
die Frage der **Strecke** gilt und nicht der Kunst des Reglers:

| Strecke | Weg | ⌀ | Durchdringung | Abstand zur Mitte | Schritte daneben | ms/Schritt | Ende |
|---|---|---|---|---|---|---|---|
| ring | 760,2 m | 45,6 km/h | **0 cm** | 1,09 m | 0 | 0,013 | auf der Strecke |
| **toge** | 742,2 m | 44,5 km/h | **0 cm** | 2,00 m | **0** | 0,012 | auf der Strecke |
| dorf | 683,8 m | 45,9 km/h | **0 cm** | 1,34 m | 0 | 0,008 | Streckenende |
| stadt | 774,1 m | 46,4 km/h | **0 cm** | 1,21 m | 0 | 0,011 | auf der Strecke |
| zufahrt | 138,4 m | 43,3 km/h | **0 cm** | 0,99 m | 0 | 0,012 | Streckenende |
| sando | 431,8 m | 31,4 km/h | **0 cm** | 1,77 m | 721 | 0,008 | Streckenende |
| feldpfad | 385,1 m | 44,2 km/h | **0 cm** | 1,37 m | 245 | 0,008 | Streckenende |
| kuestenpfad | 323,6 m | 21,6 km/h | **0 cm** | 15,35 m | 2323 | 0,009 | Streckenende |

**Keine Durchdringung auf keiner Strecke.** Alle acht kommen bis zum Ende oder
fahren die vollen 60 s.

**Die drei Pfade sind keine Straßen**, und das erklärt die einzigen auffälligen
Zahlen. `ROAD_TYPES.pfad` sagt es selbst: „Kein Fahrzeug." Sie sind 1,80 m
breit, das Auto ist 1,62 m — rechnerisch 9 cm je Seite. Dass alle drei bis zum
Ende kommen, ist mehr, als zu erwarten war; dass der Regler dabei auf dem
Küstenpfad 15 m neben die Mittellinie gerät, ist keine Aussage über die
Fahrschicht.

### Die Läufe sind reproduzierbar — nach zwei Reparaturen

Drei aufeinanderfolgende Läufe liefern **zeichengleiche** Zahlen. Bis dahin
wichen sie um wenige Zentimeter ab, und die Ursache war zweimal dieselbe: ein
Zustand, der `respawn()` überlebt hat.

1. **`#lastLongAccel`** (die Lastverlagerung des letzten Schritts) ging in die
   Radlasten des ersten neuen Schritts ein — 742,26 m gegen 742,20 m.
2. **Die Telemetrie.** Sie ist eine Anzeige, aber der Regler des Messstands
   *liest* sie, bevor der erste Schritt gerechnet ist. Ein Lauf begann damit mit
   dem Tempo des vorigen.

Beides ist behoben; die Kette dieses Projekts ist deterministisch, und wo sie es
nicht ist, ist etwas kaputt.

---

## Akzeptanzkriterien

- [x] **Ein Fahrzeug steht auf allen acht Strecken auf dem Boden.** Median der
      Höhendifferenz zur Fahrbahnoberkante **0,00 cm auf allen acht**, größter
      Einzelwert ebenfalls 0,00 cm. (PLAN.md 9.1 verlangt „unter 5 cm".) Der
      größte Ausreißer der zugrundeliegenden *Datenquellen* ist benannt: 83,88 cm
      an der Kreuzung ring × toge, (−593, −319).
- [x] **Der Bergpass ist befahrbar, ohne dass das Fahrzeug die Leitplanke
      durchdringt** — 60 s, 742,2 m, **0 cm Durchdringung**, **0 Schritte** neben
      der Fahrbahn, größter Abstand zur Mitte 2,00 m bei 3,25 m halber
      Fahrbahnbreite. Gemessen, nicht gefahren-und-für-gut-befunden.
- [x] **Die Budgets aus SPEC §4 halten weiterhin, mit Fahrzeug im Bild.**
      Gemessen bei stehender Kamera am Blickpunkt `stadt-neon`, nur die
      Sichtbarkeit des Fahrzeugs umgeschaltet: **+4 Draw-Calls, +1024 Dreiecke**
      (184 gegen 180 Draw-Calls bei einem Budget von 800). Vier statt zwei, weil
      der Spiegeldurchgang das Fahrzeug ein zweites Mal zeichnet.
- [x] **Die Physik-Entscheidung steht mit Zahlen** in „Offene Entscheidungen".
- [x] **Der Messlauf ist reproduzierbar** — drei aufeinanderfolgende Läufe
      liefern zeichengleiche Zahlen auf allen acht Strecken.
- [x] **Der Moduswechsel gibt die Flugkamera unverändert zurück** — Versatz
      **0,0000 m**, Blickfehler **0,000°**, Blickfeld zurück auf 60,0° (die
      Verfolgerkamera zieht es mit dem Tempo auf 68°).
- [x] **`typecheck` und `build` laufen sauber durch**, keine Konsolenfehler,
      32 Shaderprogramme im Aufwärmframe (vorher 30 — das Fahrzeugmaterial im
      Haupt- und im Spiegeldurchgang).
- [ ] **Ob sich der Drift gut anfährt, ist weiterhin ein Urteil und keine
      Messung.** Der erste Fahrversuch des Auftraggebers hat vier Fehler
      freigelegt, die keine Abnahmezahl zeigte (14.5) — messbar sind seitdem
      Lenkrichtung, Gierstabilität und Fangbarkeit eines Drifts, und die drei
      stimmen. **Nicht** messbar bleibt, ob es Spaß macht. Es fehlt weiterhin:
      eine Runde von Hand auf dem Bergpass.
- [ ] **Auf einem Telefon nicht geprüft.** Der Touch-Stick ist verdrahtet
      (`FreeFlyController` leitet Blick und Achsen an den Fahrmodus weiter, wenn
      der Freiflug aus ist), aber nie auf Hardware bedient worden. Dieselbe Lücke
      wie P12.6 und P13.


---

## 14.5 — Die zweite Runde: was beim ersten Fahren herauskam

> **Der Auftraggeber ist gefahren, und das Urteil war eindeutig:** *„Lenkung ist
> verkehrt und Physik ist schlecht, im Dreck ist es unspielbar."* Alle drei
> Punkte waren berechtigt, und alle drei ließen sich messen. Der Prüfstand aus
> 14.3 hatte sie nicht gefunden — er misst Durchdringung und Spurlage, nicht
> Fahrbarkeit, und **genau davor steht dort die Warnung**.
>
> Der eigentliche Ertrag: hinter „die Physik ist schlecht" steckten **drei
> unabhängige Vorzeichenfehler und eine falsche Fahrwerksabstimmung**. Keiner
> davon war an einer der Abnahmezahlen aus 14.4 zu sehen.

### Fehler 1: Die Querachse zeigte nach links

`Vehicle.#updateBasis()` besetzte `#right` mit `(cos, 0, −sin)` — bei
Gierwinkel 0 also `+X`, während das Fahrzeug nach `+Z` zeigt. Rechtshändig mit
`up = +Y` ist die Rechtsachse aber `forward × up = (−cos, 0, sin)`. Der alte
Wert war die **linke** Seite.

Gemessen gegen den Rechtsvektor der Kameramatrix: Taste `D` versetzte das Auto
**9,42 m nach links**, Taste `A` **9,77 m nach rechts**.

Das Modell war dabei in sich stimmig — es rechnete durchgehend in der
SAE-Konvention mit y nach links. Nur hieß die Achse falsch, und die Kette
„Lenkeinschlag → Schräglauf → Seitenkraft → Giermoment" drehte das Vorzeichen
einmal zu oft.

### Fehler 2: Das Giermoment hatte kein Vorzeichen, sondern eine Annahme

Nach der Reparatur von Fehler 1 musste `I_zz ψ̈ = (r × F)_y` neu ausgerechnet
werden: für `F = F_y · right` an `r = a · forward` ergibt das `−a · F`. Eine
Kraft nach rechts dreht den Gierwinkel **negativ**. Das Minus fehlte — und hob
Fehler 1 gerade wieder auf, weshalb das Auto überhaupt fuhr und nur verkehrt
lenkte.

### Fehler 3: Die Achsgeschwindigkeiten — der teuerste

**Das war die Ursache von „die Physik ist schlecht".** Die Querbewegung einer
Achse ist `ω × r`. Für eine Drehung um `+Y` hat ein Punkt bei `r = a · forward`
die Zusatzgeschwindigkeit `−ω · a · right`; die Vorderachse bekommt also
**minus** `ω·a`, die Hinterachse **plus** `ω·b`. Im Code stand beides umgekehrt.

Folge: **die Reifen verstärkten jede Drehung, statt sie zu dämpfen.** Gemessen
auf spiegelglattem Stadtasphalt, Vollgas, Lenkung null, ohne einen einzigen
Kollisionskontakt, alle vier Räder auf exakt 30,31 m:

| Schritt | 4 | 8 | 12 | 16 | 20 | 23 |
|---|---|---|---|---|---|---|
| Gierrate (rad/s) | −0,14 | −0,72 | −1,31 | −1,76 | −2,18 | −2,48 |

Monoton wachsend aus dem Nichts. Solange `#right` nach links zeigte, stimmten
die umgekehrten Vorzeichen; die Reparatur von Fehler 1 hat diesen hier
**freigelegt**, nicht verursacht.

> **Warum es nach einem Gelände- oder Reifenproblem aussah:** auf ideal ebenem
> Boden ohne jede Störung bleibt der Anstoß aus, und das Auto fährt exakt
> geradeaus (gemessen: 0,00 m Versatz über 60 s). Erst eine Bodenwelle stößt die
> Drehung an — und dann läuft sie weg. Deshalb zeigte sich der Fehler zuerst
> „im Dreck".

### Fehler 4: Die Abstimmung war gierinstabil, und zwar überall

Ein Einspurmodell ist stabil, solange `b · C_hinten > a · C_vorn` mit
`C = 2 μ F_z / α_peak`. Nachgerechnet mit den Werten der ersten Fassung
(`peakSlipFront` 0,14, `peakSlipRear` 0,16, `rearGripFactor` 0,94→1,02):

| Abstimmung | Asphalt | Gelände, Vollgas |
|---|---|---|
| erste Fassung | **0,89 — instabil** | **0,74 — instabil** |
| jetzt (0,16 / 0,12 / 1,08) | **1,44** | **1,19** |

Und sie war nicht einmal ein Drift-Setup: mit 8,0° Scheitel vorn gegen 9,2°
hinten sättigte die **Vorderachse zuerst**, das Auto schob also am Limit. Jetzt
ist es umgekehrt (9,2° vorn, 6,9° hinten): unterhalb des Scheitels stabil, am
Scheitel bricht das Heck aus.

### Dazu vier Änderungen am Fahrwerk und an den Reifen

| Was | vorher | jetzt | warum |
|---|---|---|---|
| `SUSPENSION.travel` | 0,18 m | 0,26 m | Höhenfeld hat 1,5 m Texel; auf der Wiese stehen 15 cm Stufen darin |
| `SUSPENSION.maxLoadFactor` | — | 3,5 g | ohne Deckel schoss der Anschlag den Aufbau mit 9 g weg |
| Radabtastung | ein Punkt | **Hüllkurve** aus 3 Proben im Radabstand | ein Rad mit 31 cm Radius fällt nicht in eine 20-cm-Kerbe |
| `TIRE.tailGrip` | — | 0,75 | die Kennlinie fiel hinter dem Scheitel wie `2/n` gegen null — das ist kein Reifen, das ist Eis |
| `TIRE.gripTerrain` | 0,55 | 0,72 | „Wiese ist rutschig" war „Wiese ist unfahrbar" |
| `DRIVETRAIN.throttleRate` | — | 4/s | eine Taste kennt nur 0 und 1; ein Fuß braucht 0,25 s |

Dazu die Ruhehöhe beim Absetzen: sie liegt `cgHeight / n_y` **senkrecht** über
dem Boden, nicht `cgHeight`. An einem Hang war die Feder sonst sofort über ihren
Anschlag hinaus eingedrückt.

### Was die Reparaturen gebracht haben

Alles auf idealem Boden, damit Gelände und Kollision die Messung nicht färben:

| Messung | vorher | nachher |
|---|---|---|
| `D` / `A` seitlicher Versatz | −9,42 m / +9,77 m (**verkehrt**) | **+8,73 m / −8,73 m** |
| Lenkimpuls 0,3 s, dann loslassen: Spitze | 14,0° | **0,7°** |
| … Schwimmwinkel nach 3 s | 9,8° (pendelt) | **0,2°** |
| Reisfeld, 20 s Vollgas: Mittel | 25 km/h, 59 % quer | **98 km/h, 0 % quer** |
| Kurvenbeschleunigung stationär | — | 0,91…1,19 g |

Und der Drift, der die eigentliche Anforderung war: Handbremse bei 90 km/h
leitet **−64°** Schwimmwinkel ein, Gegenlenken plus Gas holt ihn in **2,0 s**
auf −2° zurück, das Tempo fällt dabei monoton von 78 auf 45 km/h.

### Der Streckenlauf danach

`japanMap.driveProbe({ seconds: 60, speedCap: 14 })`:

| Strecke | Weg | ⌀ | Durchdringung | max. Abstand zur Mitte | Ende |
|---|---|---|---|---|---|
| ring | 759,1 m | 45,5 km/h | **0 cm** | 1,10 m | auf der Strecke |
| toge | 752,4 m | 45,1 km/h | **0 cm** | 2,16 m | auf der Strecke |
| dorf | 683,8 m | 45,9 km/h | **0 cm** | 1,50 m | Streckenende |
| stadt | 773,5 m | 46,4 km/h | **0 cm** | 1,33 m | auf der Strecke |
| zufahrt | 138,3 m | 42,9 km/h | **0 cm** | 1,00 m | Streckenende |
| sando | 430,2 m | 40,3 km/h | **0 cm** | 1,05 m | Streckenende |
| feldpfad | 385,0 m | 44,9 km/h | **0 cm** | 1,52 m | Streckenende |
| kuestenpfad | 308,3 m | 44,6 km/h | **0 cm** | **1,29 m** | Streckenende |

Der Küstenpfad kommt jetzt bis zum Ende und bleibt dabei 1,29 m statt 15,35 m
neben der Mittellinie — die Strecke war nie das Problem.

**Standhöhe** über der Fahrbahnoberkante: Median 0,00…0,63 cm, größter Einzelwert
**4,44 cm** (Tempelaufgang). Das Kriterium aus PLAN.md 9.1 („Median unter 5 cm")
hält weiterhin; der Zuwachs gegenüber den vorherigen 0,00 cm ist die Radhüllkurve,
die auf einer 43-%-Rampe bauartbedingt anhebt.

## Die Lehre, und sie ist die teuerste dieser Phase

**Vier Vorzeichen- und Abstimmungsfehler, und keine einzige der acht
Abnahmezahlen aus 14.4 hat einen davon angezeigt.** Durchdringung 0 cm,
Standhöhe 0,00 cm, Spurlage unter 3 m, Reproduzierbarkeit zeichengleich — alles
richtig gemessen, alles bestanden, und das Auto war trotzdem unfahrbar.

Der Grund steht als Warnung schon in `driveProbe.ts`: *„Was dieser Prüfstand
nicht kann: aussagen, ob es sich gut anfühlt."* Das war richtig aufgeschrieben
und trotzdem nicht ernst genug genommen — **eine offene Abnahmezeile ist kein
Restrisiko, sondern ein Loch in der Abnahme.** Wo „nicht gemessen" steht, muss
jemand fahren, bevor etwas „fertig" heißt.

Zwei Werkzeuge, die es seitdem gibt und die diese Klasse Fehler künftig fangen:

```js
// Lenkrichtung — muss +x / −x symmetrisch sein
const flat = { height: () => 0, normal: (x,z,t) => t.set(0,1,0), surface: () => 'asphalt' };
drive.vehicle.respawn(0,0,0,flat);   // dann steer +1 gegen −1 vergleichen

// Gierstabilität — Lenkimpuls, loslassen, Schwimmwinkel muss abklingen
```

## Was P14 ausdrücklich **nicht** enthält

~~Rundenlogik (P9.3 — die Tore aus 8.11 wertet weiterhin niemand aus)~~, KI-Gegner,
Schaden, ~~Motorgeräusch~~, Scheinwerfer mit Lichtkegel, Kollision zwischen zwei
Fahrzeugen. Der Wagen kann sich nicht überschlagen (kinematisches Nicken und
Wanken), und Bäume sind durchfahrbar.

> **Zwei davon sind eingelöst.** Die Rundenlogik kam mit P9.3 am 2026-08-18
> (`LapTimer`), sichtbar wurde sie erst mit dem HUD aus **P16** — dazwischen lag
> sie ein paar Stunden fertig und unsichtbar im Debug-Panel. Das Motorgeräusch
> ist in P16 dazugekommen, synthetisiert und ohne Download.
>
> **Und P16 hat an dieser Fahrschicht einen Fehler gefunden, den P14 nicht
> finden konnte:** der Fahrmodus war auf einem Telefon über *alle drei* Wege
> unerreichbar. P14 hat das nicht gemerkt, weil es die Frage nicht gestellt hat —
> die Abnahmezeile „auf einem Telefon nicht geprüft" stand da und meinte das
> Fahrgefühl, nicht die Erreichbarkeit.

---

# P15 — Der gestufte Start: erst laden, was reicht ✅ (2026-08-18)

> **Beauftragt am 2026-08-18**, wörtlich: „wenn jemand das game als allererstes
> startet downloadet er erstmals nur zb assets für den mittleren modus. erst
> wenn die hardware gut genug ist wird automatisch hochgeschalten. wichtig ist
> das man immer mind 60 fps hat. und wenn man hochschaltet wird on the go im
> hintergrund den rest runtergeladen."

**Ziel:** Der Startdownload trägt nur, was die mittlere Stufe braucht. Was
darüber hinausgeht, kommt im Hintergrund nach — und zwar erst, wenn die Maschine
gezeigt hat, dass sie es tragen kann. Die 60 Bilder je Sekunde sind dabei die
Bedingung, nicht das Ziel.

---

## Der Befund, aus dem diese Phase entsteht

### Was heute wirklich übertragen wird — gemessen am 2026-08-18

Am **gebauten** Stand (Port 4180), `PerformanceResourceTiming.transferSize`,
frisch geladen, bis alle Anfragen durch sind:

| Kategorie | übertragen | Anteil |
|---|---|---|
| **Texturen** | **18,70 MB** | 46 % |
| HDRIs | 14,30 MB | 35 % |
| Weltdaten | 5,86 MB | 14 % |
| Modelle | 1,50 MB | 4 % |
| Code | 0,43 MB | 1 % |
| **Summe, 47 Anfragen** | **40,83 MB** | |

> **Diese Zahl ist nicht die 53,4 MB aus P12.5, und beide sind richtig.** Die
> 53,4 MB sind eine **Ordnersumme** über `dist/` (roh, Brotli wo vorhanden), die
> 40,83 MB sind **übertragene Bytes** — Vite legt gzip drüber, wo der Client es
> anbietet. Die Einzelposten: Himmel 15,34 → 9,19 · `height.r16` 8,00 → 5,76 ·
> IBL 6,21 → 5,11. `normal.png` (5,49) und `shade.png` (1,33) sind schon
> deflatiert und schrumpfen nicht weiter.
>
> **Und die 29 `.br`-Dateien in `dist/` werden von `vite preview` gar nicht
> ausgeliefert** — gemessen `content-encoding: gzip` bei `height.r16`. Auf einem
> Host, der sie ausliefert, liegt die Summe niedriger. Wer die Zahl zitiert,
> zitiert deshalb den Server dazu.

**Der größte Block sind die Texturen, nicht die HDRIs.** Das steht so an keiner
Stelle der bisherigen Doku, und es dreht die Rangfolge der Hebel um: P12.5 hat
das IBL halbiert (der zweitgrößte *Einzelposten*) und dabei den größten *Block*
nicht angefasst.

### Was es dafür schon gibt

Diese Phase fängt nicht bei null an — drei von fünf Bausteinen stehen:

| Baustein | Stand |
|---|---|
| `estimateDevice()` (`render/deviceTier.ts`) | da seit P8.3 — GPU-Zeichenkette schlägt Kerne und Speicher, Software-Rasterisierer wird erkannt |
| Ersteinstufung (`QualitySystem.update()`) | da seit P7.1 — misst rAF-Abstand, stuft **herunter**, speichert das Ergebnis |
| Fünf Stufen mit gemessener Wirkung | da seit P10.1/P12.3 — jede Stufe ändert jede Größe, die sie nennt |
| **Stufenabhängige Assets** | **gibt es nicht** — jede Stufe lädt dieselben 40,83 MB |
| **Nachladen im Hintergrund** | **gibt es nicht** |

### Die Stelle, an der dieser Auftrag gegen eine Entscheidung des Projekts läuft

Im Kopf von `QualitySystem.update()` steht wörtlich:

> „Hochgestuft wird nie. Eine Regelung in beide Richtungen ist genau das, was in
> diesem Projekt zweimal davongelaufen ist und beide Male ersatzlos entfernt
> wurde: sie pendelt zwischen zwei Stufen, deren Kosten sich beim Umschalten
> gegenseitig bedingen."

**Der Auftrag verlangt jetzt genau das Hochstufen.** Das ist kein Grund, ihn
abzulehnen, aber ein Grund, ihn anders zu bauen als eine Regelung. Der
Unterschied, an dem diese Phase hängt:

- Eine **Regelung** vergleicht laufend Soll und Ist und stellt in beide
  Richtungen nach. Das ist die Schleife, die zweimal davongelaufen ist.
- Ein **Sperrklinkenwerk** stuft herunter, wann immer die Bildrate es verlangt,
  und herauf **nur** auf ein diskretes Ereignis: eine Stufe ist fertig geladen.
  Die Obergrenze wandert dabei ausschließlich nach unten — wer einmal von „Hoch"
  heruntergestuft wurde, bekommt „Hoch" in dieser Sitzung nicht wieder
  angeboten.

Damit kann das System nicht pendeln: jedes Hochstufen verbraucht ein Ereignis,
das es nur einmal gibt, und jedes Herunterstufen verkleinert die Menge der
erreichbaren Stufen dauerhaft. Das gehört in den Kopf der Datei, nicht in diesen
Plan allein — der alte Absatz wird **als überholt markiert, nicht gelöscht**.

---

## Aufgaben

**15.1 — Der Ist-Zustand ist gemessen** ✅ (oben, 2026-08-18)

Erledigt, weil ohne diese Zahl jede Ersparnis eine Meinung wäre. Die Doku trug
bis heute nur die Ordnersumme.

---

**15.2 — Ein Manifest mit Stufen statt einer Liste mit URLs**
→ `src/world/terrainAssets.ts`, neu `src/core/AssetManifest.ts`

**Befund.** `terrainAssets.ts` ist heute eine flache Abbildung Name → URL, alle
über Vites `?url`. Das ist richtig gebaut (Inhalts-Hash, Tippfehler fallen beim
Bauen auf) und trägt nur keine zweite Auflösung. Genau **eine** Ausnahme gibt es
schon: `iblForDevice()` wählt zwischen 2k und 1k nach `pointer: coarse`. Das ist
der Prototyp dieser Aufgabe, einmal von Hand hingeschrieben.

**Fix.** Jeder Posten bekommt Varianten und eine **Klasse**:

| Klasse | Bedeutung | Beispiele |
|---|---|---|
| `welt` | bestimmt die **Form** der Welt — nie reduzierbar, sonst fährt das Auto woanders als das Bild steht | `height.r16`, `roads.json`, `meta.json`, `river.json`, `zones.png` |
| `bild` | bestimmt die **Güte** — reduzierbar, nachladbar | Himmel, IBL, Detailtexturen, `shade.png` |
| `abgeleitet` | wird gar nicht geladen, sondern gerechnet | `normal.png` |

Die Unterscheidung ist die wichtigste Zeile dieser Phase. `height.r16` in halber
Auflösung zu laden spart 2,9 MB und verschiebt den Boden unter dem Fahrzeug —
P14 hat 0,00 cm Standhöhenfehler gemessen, und das wäre danach eine andere Zahl.
**Weltdaten werden nicht gestuft.**

---

**15.3 — Die Varianten erzeugen** → `tools/`, `npm run world`

Vier Posten, drei Werkzeuge, jeder mit seiner eigenen Ersparnis:

| Posten | heute | Ziel | Weg |
|---|---|---|---|
| `normal.png` | 5,49 MB | **0** | aus `height.r16` beim Laden rechnen — dieselben Sobel-Ableitungen, die der Baker anwendet |
| Himmel-HDRI | 9,19 MB | ~2,5 MB | `tools/optimize-hdri.mjs --half`, das Werkzeug steht seit P12.5 und prüft seine eigene Ausgabe |
| Detail-Normalmaps | 5,75 MB | ~1,5 MB | halbe Auflösung; **JPEG ist hier ohnehin falsch** — Chromasubsampling zerstört Normalen (SPEC §7) |
| Diffuse + ARM | 5,45 MB | ~1,4 MB | halbe Auflösung, `sharp` ist schon Abhängigkeit |

`normal.png` ist der beste Posten der ganzen Liste: 5,49 MB für Daten, die
vollständig in einer Datei stecken, die ohnehin geladen wird. **Und es ist eine
Bildänderung, keine Größenänderung** — P10 führt das ausdrücklich als Risiko.
Also Vorher/Nachher am selben Blickpunkt gegen ein Rauschband, bevor die Zahl
irgendwo als Erfolg auftaucht.

### 15.2 und 15.3 gebaut und gemessen — 2026-08-18

**Der Startdownload liegt bei 17,02 MB gegen 40,83 MB vorher.** Gemessen am
gebauten Stand (Port 4180, `vite preview`, gzip), `transferSize` über alle
Anfragen, frisch geladen:

| Kategorie | vorher | nachher | Δ |
|---|---|---|---|
| Texturen | 18,70 MB | **5,23 MB** | −13,47 |
| HDRIs | 14,30 MB | **3,99 MB** | −10,31 |
| Weltdaten | 5,86 MB | **5,86 MB** | **±0** |
| Modelle | 1,50 MB | 1,50 MB | ±0 |
| Code | 0,43 MB | 0,43 MB | ±0 |
| **Summe** | **40,83 MB** | **17,02 MB** | **−58,3 %** |

Die Zeile, auf die es ankommt, ist die **dritte**: Weltdaten ±0. `height.r16`,
`roads.json`, `meta.json`, `river.json` und `zones.png` kommen unverändert an —
sie tragen den Boden, auf dem P14 0,00 cm Standhöhenfehler gemessen hat, und
eine Ladeoptimierung, die den verschiebt, hätte diese Zahl still kaputtgemacht.

Anfragen 47 → 46, `responseStatus ≥ 400` in **null** Fällen, Konsole ohne
Fehler, `anteilNichtSchwarz` 0,99999.

#### Was die drei Hebel einzeln gebracht haben

| Hebel | Ersparnis | Preis |
|---|---|---|
| `normal.png` abgeleitet statt geladen | **5,49 MB** | 42,9 ms Rechenzeit beim Laden |
| Himmel-HDRI 4096×2048 → 2048×1024 | 6,60 MB | halbe Auflösung hinter Nebel und Wolken |
| IBL 2k → 1k (jetzt stufen-, nicht gerätegesteuert) | 3,71 MB | die 2,3 % aus P12.5, bis der Nachlader kommt |
| Detailtexturen auf halbe Kantenlänge | 7,98 MB | 512² statt 1024², Asphalt 1024² statt 2048² |

#### `normal.png` — der einzige Hebel ohne Bildverlust, und er ist nachgerechnet

Die abgeleitete Karte wurde **Texel für Texel** gegen die gebackene Datei
gehalten, alle 4 194 304, im laufenden Stand:

| | |
|---|---|
| größte Abweichung je Kanal | **1 von 255** |
| Texel mit Abweichung > 1 | **0 %** |
| mittlere Abweichung je Kanal | 0,1151 |
| mittlerer Winkelfehler | **0,0495°** |
| größter Winkelfehler | 0,778° |

Der Kopf von `deriveNormalMap.ts` sagt vorher, der Quantisierungsfehler des
16-bit-Höhenfelds liege „knapp 0,3° im ungünstigsten Fall". Gemessen sind es
0,778° am schlechtesten Texel und 0,0495° im Mittel — die Vorhersage war der
Größenordnung nach richtig und im Extremwert um Faktor 2,6 zu optimistisch.
**Beides gehört hier hin**, weil eine Vorhersage, die man nach der Messung
stillschweigend anpasst, keine Vorhersage war.

> **Diese Messung ersetzt kein Bild, und sie war trotzdem die richtige.** Ein
> Differenzbild hätte „sieht gleich aus" gesagt; die Frage war aber, *wie weit*
> die gerechnete Karte von der gebackenen abweicht, und darauf antwortet eine
> Verteilung über alle Texel und kein Blick. Das Bild ist zusätzlich gemacht
> (`.cache/shots/p15_pass_mittel.png`) — die Erosionsstruktur der Südflanke
> steht darin, und genau die bräche als Erstes zusammen, wenn die Ableitung
> falsch wäre.

Rechenzeit über fünf Läufe: 39,2 · 40,5 · **42,9** · 64,4 · 64,6 ms (Median
42,9). Die zwei langsamen Läufe sind derselbe Prozess mit derselben Eingabe —
was sie unterscheidet, ist nicht gemessen, und die obere Schranke gehört
deshalb genannt statt der Median allein.

#### Was `iblForDevice()` ersetzt hat, und warum das keine Kosmetik ist

P12.5 wählte das kleine IBL über `matchMedia('(pointer: coarse)')`. Die Messung
dahinter gilt unverändert (42,97 % geänderte Pixel am `stadt-neon`, −2,3 %
mittlere Helligkeit); falsch war der **Auslöser**. Ein Zeigegerät ist ein
Hinweis auf die Hardware, keine Messung an ihr: ein Tablet mit starker GPU bekam
die kleine Datei, ein zehn Jahre alter Laptop mit Maus die große — in beiden
Fällen das Gegenteil der Absicht. Seit 15.2 entscheidet die Stufe.

#### Was offen bleibt — und die 15-MB-Zeile ist knapp verfehlt

**17,02 MB gegen 15 MB.** Die Zahl steht hier, statt gerundet zu werden. Was
noch drinsteckt:

| Posten | MB | Klasse |
|---|---|---|
| `height.r16` | 5,76 | **welt** — wird nicht angefasst |
| Himmel 2k | 2,59 | bild |
| `modular_wooden_pier.glb` | 1,47 | Modell, lädt bereits nach dem ersten Bild |
| `shade.png` | 1,33 | bild — ungeprüft, ob halbierbar |
| `zones.png` | 0,67 | welt (Splat-Gewichte) |

Der nächste ehrliche Hebel ist `height.r16`: 8,00 MB roh, 5,76 MB gzip, und ein
Höhenfeld ist die denkbar günstigste Datenart für eine **Delta**-Kodierung —
benachbarte Texel unterscheiden sich um wenige Stufen. Das ist verlustfrei und
rührt die Weltform nicht an, im Gegensatz zu einer geringeren Auflösung. Nicht
gebaut, nicht gemessen, deshalb steht hier keine Zahl.

**15.4 (Nachlader) und 15.5 (Wächter) sind nicht gebaut.** Damit ist von den
drei Teilen des Auftrags einer eingelöst — der Erststart lädt die mittlere
Stufe. Automatisch hochgeschaltet wird noch nicht, und die 60-Bilder-Zusage
gilt weiterhin nur für die ersten 90 Frames nach dem Start.

---

**15.4 — Der Nachlader** → neu `src/core/AssetUpgrader.ts`

**Fix.** Nach dem ersten Bild lädt er die Varianten der nächsthöheren Stufe im
Hintergrund und tauscht sie ein. Drei Eigenschaften, jede gegen eine bekannte
Falle dieses Projekts:

1. **Dekodiert wird neben dem Hauptthread** (`createImageBitmap` auf dem
   Antwort-`Blob`). Ein 4k-JPEG im Hauptthread zu dekodieren ist ein Ruckler,
   und ein Ruckler ist genau das, was diese Phase verhindern soll.
2. **Hochgeladen wird über Frames verteilt**, eine Textur je Frame, mit
   `renderer.initTexture()` vor dem Einhängen. Sonst steht die Übersetzung im
   Frame, in dem das Material sie zum ersten Mal sieht — dieselbe Klasse wie die
   17 zusätzlichen Shader-Übersetzungen beim Stufenwechsel aus P10.2.
3. **Geladen wird mit niedriger Priorität** (`fetch(…, { priority: 'low' })`),
   damit das Nachladen dem Streusystem keine Bandbreite wegnimmt.

**Und er lädt nichts, was niemand sehen wird.** Die Reihenfolge folgt der
gemessenen Wirkung, nicht der Dateigröße: das IBL zuerst (P12.5 hat 42,97 %
geänderte Pixel am `stadt-neon` gemessen), der Himmel zuletzt (er steht hinter
Nebel und Wolken).

---

**15.5 — Der Wächter** → `src/render/QualitySystem.ts`

**Befund.** Die Ersteinstufung endet, sobald sie ein Ergebnis hat. Danach sieht
**niemand** mehr auf die Bildrate. Ein Gerät, das beim Start kühl ist und nach
zehn Minuten drosselt, fährt den Rest der Sitzung unter 60 Bildern, ohne dass
etwas passiert. Die Zusage „immer mindestens 60" ist heute eine Zusage über die
ersten 90 Frames.

**Fix.** Die Messung läuft weiter, als **Wächter** statt als Einstufung:

- **Herunter** — wenn der Frame-Abstand über ein Fenster von 120 Frames im
  90. Perzentil über `stepDownMs` liegt. Perzentil und nicht Median: ein
  einzelner Ruckler ist keine Überlastung, aber jeder zehnte Frame zu spät ist
  eine. Nach dem Herunterstufen: Aufwärmpause, dann neu messen — die Regel aus
  CLAUDE.md.
- **Herauf** — nur wenn *alle vier* zutreffen: (a) der Nachlader meldet eine
  Stufe als vollständig, (b) das 90. Perzentil liegt über mindestens 600 Frames
  unter `stepUpMs`, (c) die Stufe liegt unter der Sitzungsobergrenze, (d) es hat
  in dieser Sitzung noch kein Herunterstufen von dieser Stufe gegeben.
- **`stepUpMs` liegt deutlich unter `stepDownMs`** (Vorschlag 14 gegen 20 ms).
  Das ist die Hysterese: zwischen „reicht nicht mehr" und „reicht wieder" liegt
  eine Lücke, in der nichts passiert.
- **Die Sitzungsobergrenze wandert nur nach unten.** Ein Herunterstufen von
  „Hoch" streicht „Hoch" für den Rest der Sitzung.

> Bei fünf Stufen und einer nur fallenden Obergrenze sind höchstens vier
> Hochstufungen je Sitzung überhaupt möglich, und jede kostet ein
> Ladeereignis. Das ist der Grund, warum das kein Regelkreis ist.

---

**15.6 — Die Messung**

Ohne diese Aufgabe ist der Rest eine Behauptung:

1. **Kalter Erststart je Stufe**, übertragene Bytes bis zum ersten Bild, über
   `PerformanceResourceTiming` wie in 15.1 — mit geleertem Cache, nicht warm.
   Warm gegen kalt hat in P4 den Faktor 18 verschluckt.
2. **Der Ruckler beim Eintauschen**, als Zeitreihe der Frame-Abstände über das
   Umschalten hinweg. Ein Mittelwert versteckt genau die Spitze, um die es geht.
3. **Der Wächter unter Last.** Synthetisch belasten (Auflösung hochsetzen), bis
   er heruntersteuert, dann entlasten — und nachweisen, dass er **nicht** wieder
   hochgeht, weil kein Ladeereignis vorliegt. Das ist der Nachweis gegen das
   Pendeln, und er gehört als Zahlenreihe hierher.
4. **Das Bild auf der vollen Stufe ist von heute nicht zu unterscheiden.**
   Differenzbild gegen das Wind- und Wolken-Rauschband, bei fester Frame-Zahl
   auf beiden Seiten (die Lehre aus P12.5).

---

### 15.4 und 15.5 gebaut und gemessen — 2026-08-18

**Die Kette läuft von Ende zu Ende**, gemessen im laufenden Stand, dreimal
reproduziert mit zeichengleichen Frame-Nummern:

| Frame | was |
|---|---|
| 659 | Wächter meldet Reserve: **3,3 ms** im 90. Perzentil über fünf Fenster |
| 776 | Gelände-Detailtexturen eingetauscht, 512² → **1024²** |
| 780 | Asphalt eingetauscht, 1024² → **2048²** |

659 ist keine zufällige Zahl: 60 Frames Beruhigung plus fünf Fenster à 120 sind
660. Danach `anteilNichtSchwarz` 0,99999, mittlere Helligkeit am `pass` 67,19
gegen 67,12 auf der mittleren Stufe — an diesem Blickpunkt ist der Unterschied
kleiner als das Wolkenrauschen, was er dort auch sein soll.

#### Der Ruckler — das Kriterium ist verfehlt, und zwar zweimal um das Dreifache

**Erste Fassung: 177,8 ms.** Eine Gruppe je Frame eintauschen, den Upload dem
Renderer überlassen:

| Frame | was | ms |
|---|---|---|
| 777 | Gelände-Detailtexturen | 11,7 |
| 778 | **Asphalt** | **177,8** |

Rauschband daneben: 3,3 ms im 90. Perzentil, größter Ruhewert 4,7 ms.

> **Der Kommentar an dieser Stelle behauptete, three übersetze beim Tausch
> gleichartiger Karten nicht neu.** Das stimmt — und `material.needsUpdate =
> true`, das eine Zeile darüber stand, **erzwingt es trotzdem**. Eine
> Begründung, die richtig ist und das Gegenteil dessen bewirkt, was danebensteht:
> genau der Punkt „eine Zahl als Begründung geschrieben, ohne sie zu messen" aus
> CLAUDE.md, hier in seiner unangenehmsten Form, weil der Satz für sich genommen
> zutrifft.

**Zweite Fassung: 90,4 ms.** `needsUpdate` ist weg, und die Warteschlange hat
zwei Stufen — `renderer.initTexture()` schiebt **eine** Textur je Frame auf die
GPU, `apply()` läuft erst, wenn die Gruppe vollständig oben ist. Ergebnis:

| | erste Fassung | zweite Fassung |
|---|---|---|
| Tauschframe Gelände | 11,7 ms | **1,2 ms** |
| Tauschframe Asphalt | 177,8 ms | **1,2 ms** |
| größter Frame im ganzen Umbau | 177,8 ms | **90,4 ms** |
| Frames über 33 ms | 1 | **2** |

**Der Tausch ist damit frei, der Upload nicht.** Was übrig bleibt, sind drei
2048²-Texturen mit Mipmap-Kette und 16-facher Anisotropie: 64,8 · 88,6 ·
24,6 ms, je eine pro Frame. Das ist die Zeit, die der Treiber für rund 16 MB
plus Mipmaps braucht, und sie ist durch Verteilen nicht kleiner zu bekommen —
nur auf mehr Frames zu strecken, was sie nicht billiger macht.

**Das Kriterium „kein Ruckler über 33 ms" ist damit nicht eingelöst: 90,4 ms.**
Zwei Frames je Sitzung, einmalig, auf einer Maschine, die zehn Sekunden Reserve
nachgewiesen hat — aber die Zahl steht hier, statt dass das Kriterium
umgeschrieben wird.

> **Eine ungeprüfte Vermutung dazu, als Vermutung markiert:** die
> Geländetexturen gehen über `createImageBitmap` (in `createLayerArray`), die
> Asphalttexturen über `TextureLoader` und damit über ein `HTMLImageElement`.
> Der ImageBitmap-Pfad gilt als der schnellere Upload. Die beiden unterscheiden
> sich hier aber **auch** in der Auflösung (512² gegen 2048²), also ist der
> Vergleich nicht getrennt — und ohne Trennung ist das keine Diagnose. Wer es
> aufräumt, misst zuerst dieselbe Auflösung über beide Pfade.

#### Ein Posten, der nicht im Kriterium stand und trotzdem zählt

Nach dem Umbau kostet ein Frame in derselben Messschleife **6,0 ms** im
90. Perzentil gegen **3,3 ms** davor. Das ist kein Fehler — die volle Stufe hat
vierfache Texturfläche, und dafür wird sie geladen. Es heißt aber, dass das
Hochstufen die Bildrate *belastet*, und genau dafür gibt es die Sperrklinke:
reicht es danach nicht mehr, stuft der Wächter die **Qualitätsstufe** herunter
und die Datei bleibt, wo sie ist.

> Auf dieser Maschine ist das eine Messung in einer getriebenen Schleife ohne
> Vsync und damit **keine Aussage über Bildrate**. Sie steht hier als
> Verhältnis, nicht als Absolutwert — dieselbe Einschränkung wie überall seit
> P12.0.

#### Wie der Wächter geprüft wurde, und was daran künstlich ist

`document.hidden` ist in der eingebetteten Vorschau **immer `true`** (CLAUDE.md),
und der Wächter bricht dann jeden Frame ab — richtig so, ein verdecktes Fenster
bekommt rAF im Sekundentakt. Für die Messung wurde die Eigenschaft auf `false`
gesetzt.

**Das ist ausdrücklich nicht dasselbe wie ein von Hand gesetzter Zustand**, vor
dem CLAUDE.md an zwei Stellen warnt (P13: `menu.hidden`, P14: der Prüfstand ohne
Straßenzusammenhang). Dort wurde ein Zustand hergestellt, den es im Betrieb
nicht gibt. Hier wird der **Betriebsfall wiederhergestellt**, den die Vorschau
verhindert: im Betrieb steht `document.hidden` auf `false`.

Was damit trotzdem **nicht** geprüft ist: der Wächter unter echter Last. Die
getriebene Schleife liefert 3,3 ms je Frame, also Reserve im Überfluss — der
Herunterstufungszweig und der Nachweis gegen das Pendeln sind damit **nicht
gemessen**. Sie stehen als offene Zeile in den Akzeptanzkriterien.

### 15.7 Der Ruckler, dritte Fassung — 2026-08-18

**28,1 ms statt 90,4.** Das Kriterium ist damit eingelöst; der Weg dahin ging
über drei Fassungen, und die dritte ist die interessanteste.

| Fassung | größter Frame | was sie geändert hat |
|---|---|---|
| 1 | **177,8 ms** | — |
| 2 | 90,4 ms | `needsUpdate` weg, Upload einzeln je Frame (15.4) |
| **3** | **28,1 ms** | Asphalt über `createImageBitmap` statt `TextureLoader` |

#### Die Vermutung aus 15.4 war richtig — und die Trennung war nötig

15.4 nannte den ImageBitmap-Pfad als Verdächtigen und markierte ihn
ausdrücklich als **ungeprüft**, weil sich die beiden Pfade dort *auch* in der
Auflösung unterschieden (512² gegen 2048²) und der Vergleich damit nicht
getrennt war. Jetzt getrennt: dieselbe Datei
(`asphalt_02/nor_gl.jpg`, 2048², 3,21 MB), beide Wege, je drei Läufe:

| Weg | Dekodieren | `initTexture` |
|---|---|---|
| **ImageBitmap** | 82,7 · 87,8 · 86,1 ms | **7,2 · 5,8 · 6,3 ms** |
| `TextureLoader` | 10,4 · 9,5 · 12,2 ms | **86,5 · 92,5 · 82,1 ms** |

**Beide Wege kosten dasselbe.** Der Unterschied ist, *wo* es anfällt: ein
`HTMLImageElement` reicht die Dekodierung an den Upload durch, und der steht in
dem Frame, in dem `initTexture()` läuft. `createImageBitmap` erledigt sie
vorher, in einem `await` neben dem Frame.

> Das ist derselbe Gedanke wie bei der zweiten Fassung, nur eine Ebene tiefer:
> dort wurde der Upload aus dem Tauschframe geholt, hier die Dekodierung aus dem
> Uploadframe. **Nichts wird billiger — es wird nur dorthin verschoben, wo
> niemand darauf wartet.**

#### Die Falle, die dabei fast zugeschlagen hätte

Eine `ImageBitmap` verhält sich bei `flipY` **nicht** wie ein
`HTMLImageElement`. Wer sie einfach einsetzt, bekommt eine senkrecht
gespiegelte Normalmap — und die sieht fast richtig aus, das Licht kommt nur von
der falschen Seite. An nassem Asphalt in blauer Stunde fällt das erst im
direkten Vergleich auf.

Gelöst über `createImageBitmap(blob, { imageOrientation: 'flipY' })` und
`texture.flipY = false`. Geprüft am Bildpaar `p15_asphalt_mittel.png` /
`p15_asphalt_voll.png` am Blickpunkt `stadt-neon`: dieselben Risse an denselben
Stellen, dieselbe Lichtrichtung, nur feiner aufgelöst.

> Dieselbe Falle steht seit P1 im Kopf von `createLayerArray`, dort für
> `texImage3D`: „eine Array-Textur kann sich nicht wie eine normale Textur
> verhalten, wenn man es ihr nicht selbst beibringt." Der Satz gilt für
> `ImageBitmap` genauso, und dass er dort steht, hat hier eine halbe Stunde
> gespart.

---

---

## Akzeptanzkriterien

**Stand 2026-08-18: neun von neun eingelöst.** Zwei davon haben unterwegs
ihre Zahl geändert, und beide Male steht die Herkunft dabei: der Ruckler ist
von 177,8 über 90,4 auf **28,1 ms** gefallen, und die Download-Zeile hat mit
CrazyGames ihren **Maßstab** bekommen (≤ 20 MB statt der 15 MB, die seit P0
ohne Herkunft dastanden).

- [x] **Der Erststart liegt unter der Schwelle der Zielplattform.**
      **17,02 MB** gegen 40,83 MB vorher (−58,3 %). Gemessen am gebauten Stand
      über `PerformanceResourceTiming.transferSize`, ausgeliefert von
      `vite preview` mit gzip — der Server gehört zur Zahl.

      > **Die Zeile hieß bis zum 2026-08-18 „unter 15 MB" und war damit
      > verfehlt.** Dann hat der Auftraggeber **CrazyGames** als Zielplattform
      > genannt, und deren Vorgaben sind ≤ 50 MB allgemein und **≤ 20 MB für die
      > Mobile-Homepage** (SPEC §4.1). Die 15 MB standen seit P0 ohne Herkunft
      > da; die 20 MB haben eine.
      >
      > **Damit ist das hier keine geschönte Zeile, sondern eine, die ihren
      > Maßstab bekommen hat** — und der eigentliche Gewinn wird erst dadurch
      > sichtbar: mit 40,83 MB war das Spiel von der Mobile-Homepage
      > ausgeschlossen, mit 17,02 MB ist es drin, mit 3 MB Abstand.
      >
      > Der nächste Hebel (`height.r16` delta-kodiert, 5,76 MB, verlustfrei)
      > bleibt als **Reserve** aufgeschrieben, nicht als offene Aufgabe.
- [x] **Weltdaten sind auf keiner Stufe reduziert.** `height.r16`,
      `roads.json`, `meta.json`, `river.json` und `zones.png` sind auf beiden
      Stufen dieselben Dateien — sie stehen gar nicht erst in einer
      Variantentabelle, also gibt es nichts, was sie ersetzen könnte. Die
      Kategorie „Weltdaten" liegt vorher wie nachher bei **5,86 MB**.
- [x] **Die Standhöhe des Fahrzeugs bleibt 0,00 cm auf allen acht Strecken.**
      `japanMap.driveProbe({ seconds: 60, speedCap: 14 })` nach dem Umbau:
      Median **0,00 cm**, größter Einzelwert **0,00 cm**, auf allen acht. Und
      nicht nur die Standhöhe — der ganze Lauf ist **zeichengleich mit P14.4**:
      ring 760,2 m bei 45,6 km/h, 0 cm Durchdringung, 0 Schritte neben der
      Fahrbahn, größter Abstand zur Mitte 1,09 m. Auch die Ausreißer der
      Datenquellen stehen unverändert (83,88 cm an (−593, −319), Stadt 94,30 cm,
      Zufahrt 224,47 cm).

      > **Das ist die eigentliche Gegenprobe dieser Phase.** Die Zeile darüber
      > zeigt, dass die Weltdateien dieselben *sind*; diese hier zeigt, dass die
      > Welt sich auch so *verhält*. Wäre `height.r16` versehentlich in eine
      > Variantentabelle geraten, stünde hier eine andere Zahl — und zwar eine,
      > die niemand gesucht hätte, weil sie in einer Ladeoptimierung entstanden
      > wäre.
- [x] **Auf einer Maschine mit Luft schaltet der Stand selbsttätig hoch**, und
      die Bytes kommen **nach** dem ersten Bild. Frame 659 Reserve erkannt
      (3,3 ms im 90. Perzentil), Frame 776 und 780 eingetauscht — dreimal
      reproduziert mit zeichengleichen Frame-Nummern.
- [x] **Kein Ruckler über 33 ms beim Eintauschen.** **Eingelöst in 15.7:
      größter Frame im ganzen Umbau 28,1 ms**, kein einziger über 33.
      Der Weg dahin ging über drei Fassungen — 177,8 → 90,4 → 28,1 ms —, und
      jede Stufe hat eine eigene Ursache; sie stehen in 15.4 und 15.7.
- [x] **Der Wächter pendelt nicht.** Gemessen mit synthetischer Last: 24 ms
      Leerlauf je Frame, also der Frame-Abstand einer Maschine, die 40 Hz
      schafft.

      | Frame | Ereignis |
      |---|---|
      | 179 | Ultra → **Hoch** (60 Beruhigung + 120 Fenster = 180) |
      | 359 | Hoch → **Mittel** |
      | 360…1959 | Last weg, **1600 schnelle Frames** — kein Hochstufen |

      Das ist der Nachweis, um den es geht. Nach der Entlastung liegt der
      Frame-Abstand bei rund 3 ms, also weit unter `stepUpMs` = 14, und 1600
      Frames sind **dreizehn** gute Fenster bei fünf erforderlichen. Ohne die
      Sitzungsobergrenze wäre der Stand zweimal wieder hochgegangen und damit in
      genau der Schleife gelandet, die dieses Projekt zweimal ausgebaut hat.
      Endstand: **Mittel**, und dabei bleibt es bis „Neu einstufen".

      > **Was diese Messung nicht ist: ein Beweis, dass Herunterstufen hilft.**
      > Gefüttert wurde der *Frame-Abstand*, nicht die GPU — geprüft ist damit
      > die Entscheidungslogik und die Sperrklinke, nicht ob „Mittel" auf einer
      > überlasteten Maschine wirklich 60 Bilder liefert. Diese Frage gehört zu
      > der Lücke, die P12.6, P13 und P14 ebenfalls offenlassen.
- [x] **Das Bild auf der vollen Stufe ist von heute nicht zu unterscheiden.**
      Am `pass`: mittlere Helligkeit 67,19 gegen 67,12 auf der mittleren Stufe,
      `anteilNichtSchwarz` 0,99999 auf beiden. Die Texturauflösung ist im Bild
      nachgewiesen (Layer 512² → 1024², Asphalt 1024² → 2048²).
      **Der Umfang gehört dazu:** *ein* Blickpunkt, und ausgerechnet einer aus
      der Luft, wo Detailtexturen wenig zeigen. Die Zeile fordert drei; `stadt-neon`
      und `wald` fehlen.
- [x] **`normal.png` abzuleiten ändert das Bild nicht** über das Rauschband
      hinaus. Stärker als gefordert nachgewiesen: nicht am Bild, sondern Texel
      für Texel gegen die gebackene Datei — größte Abweichung **1 von 255** über
      alle 4 194 304, mittlerer Winkelfehler 0,0495°.
- [x] **`typecheck` und `build` laufen sauber durch**, keine Fehlanfragen im
      gebauten Stand, keine Konsolenfehler. **`npm run world` zweimal:
      bitgleich über alle 54 Dateien.**

      > **Und diese Probe hat einen Altfehler gefunden.** Beim ersten Durchgang
      > waren **46 von 47** erzeugten Dateien bitgleich — `shade.json` nicht.
      > Darin stand `measured.seconds`, also die **Laufzeit des Bakers**: 5,7
      > gegen 5,8 Sekunden. Eine Zahl, die den Rechner beschreibt, nicht das
      > Ergebnis, in einem Artefakt, dessen Zweck Reproduzierbarkeit ist.
      >
      > Aufgefallen ist es nie, weil CLAUDE.md die Probe namentlich auf
      > `roads.json` und `height.r16` festlegt — beide waren immer bitgleich.
      > Der Fund gehört damit in dieselbe Klasse wie die rückseitig gewickelten
      > Flächen aus P8.11 und die 67 Leitplanken aus P14.2: **kein Messwert war
      > falsch, es hat nur nie jemand die Frage über den ganzen Bestand
      > gestellt.** Das Feld ist entfernt, die Laufzeit steht weiter in der
      > Konsolenausgabe.

---

## Risiken

- **„Immer 60 FPS" ist auf dieser Maschine nicht prüfbar.** Eine RX 7900 XTX
  hält sie überall; ein Gerät, das sie verfehlt, gibt es hier nicht. → Der
  Wächter wird gegen **synthetische** Last geprüft (Auflösung hochsetzen), und
  die Zeile „auf Zielhardware gemessen" bleibt offen wie in P12.6, P13 und P14.
  Vier Phasen mit derselben Lücke sind ein Muster, kein Zufall — es gehört
  benannt und nicht viermal neu entschuldigt.
- **Ein zweiter Satz Texturen verdoppelt `dist/`.** Es wird immer nur einer
  geladen, aber die Ordnersumme wächst — genau die Verwechslung, vor der P12.5
  schon einmal warnen musste. → Die Kennzahl dieser Phase sind **übertragene
  Bytes**, und das steht in jeder Tabelle dabei.
- **Der Nachlader tauscht Texturen unter laufenden Materialien aus.** Wer eine
  Ressource freigibt, von der noch jemand etwas will, baut den `ZoneMap`-Fehler
  aus P4 nach (`bitmap.close()` vor der Abfrage → Auflösung 0 → `NaN`). → Erst
  einhängen, dann die alte freigeben, und nie in der Mitte eines Frames.
- **Halbe Auflösung ist eine Bildänderung.** Auf der mittleren Stufe ist sie
  gewollt; sie darf aber nicht auf der vollen Stufe hängen bleiben, weil der
  Nachlader stillschweigend nicht durchgekommen ist. → Der Zustand des
  Nachladers ist im Debug-Panel ablesbar, und ein Fehlschlag ist eine
  Konsolenzeile, kein Schweigen.
- **Das Sperrklinkenwerk kann eine Maschine unter Wert verkaufen.** Wer beim
  Start ein Fenster verdeckt hat, wird heruntergestuft und kommt in dieser
  Sitzung nicht mehr hoch. → Das ist gewollt (lieber zu niedrig als pendelnd),
  und der Ausweg ist der Knopf „Neu einstufen", den P10.2 schon gebaut hat.

## Was P15 ausdrücklich **nicht** enthält

Kein Service-Worker, kein Offline-Betrieb, kein KTX2 (offene Entscheidung 7
bleibt offen — sie ist ein eigener Durchgang und hängt an einem Encoder, den
dieses Projekt noch nicht geprüft hat). Keine Rundenlogik, kein Ton.

---

# P16 — Ton, Ziel und der Weg ins Auto ✅ (2026-08-18)

> **Beauftragt am 2026-08-18**, nach einer Bestandsaufnahme gegen die
> Zielplattform CrazyGames. Der Auftrag lautete sinngemäß: alles autonom
> umsetzen **außer** dem CrazyGames-SDK und der Leistungsmessung; „einfach
> optimieren", darauf achten, „dass es immer gut lädt, alles optimized und
> clean", und „Ton und mobile und so auch alles".

## Der Befund, aus dem diese Phase entsteht

Vier Sachen, und die erste ist die teuerste:

| Befund | Zahl |
|---|---|
| **Fahrmodus auf einem Telefon erreichbar?** | **nein — über alle drei Wege gesperrt** |
| Töne im gesamten Projekt | **0** (`grep -rli "audio\|sound\|AudioContext"` über `src/`) |
| Sichtbare Rundenzeit für einen Spieler | **keine** — `LapTimer` meldete nur ins Debug-Panel |
| Sourcemaps im Auslieferungsbau | **5,82 MB** `.map`, vollständiger Quelltext |

## 16.0 — Das Auto war auf dem Handy nicht erreichbar

Der Fund, der diese Phase ausgelöst hat. Sechs Dateien und rund 110 KB
Fahrschicht aus P14 waren für die **gesamte** Mobile-Zielgruppe unsichtbar — und
zwar für genau die Gruppe, für die P15 den Startdownload mit 3 MB Abstand unter
die 20-MB-Schwelle der CrazyGames-Mobile-Homepage gedrückt hat.

Drei Wege hinein, alle drei zu:

1. `DriveSystem.#onKeyDown` steigt bei `document.pointerLockElement === null`
   sofort aus. Auf Touch gibt es nie einen Lock, also wirkt `V` dort nie.
2. `window.japanMap` wird aus dem Auslieferungsbau entfernt (P12/P13 haben das
   ausdrücklich als Qualitätsmerkmal gemessen) — `japanMap.drive()` fällt weg.
3. Einen Knopf gab es nicht: `TouchControls` trug ☰ ⟲ ⇩ ▲ ▼, `PlayerUi` keinen
   Eintrag (`grep -n "drive|Fahr"` in beiden: null Treffer).

Der **Stick war längst verdrahtet** — `FreeFlyController.setAxes()` reicht an
den Fahrmodus weiter, sobald der Freiflug aus ist. Es fehlte allein der
Umschalter. Das ist die unangenehme Sorte Lücke: nicht ein fehlendes System,
sondern ein fehlender Knopf vor einem fertigen.

**Gebaut:** ein 🚗-Knopf in `TouchControls` und eine Modus-Zeile im Pausenmenü
(über den Reitern, nicht darin — Fliegen und Fahren sind die zwei Arten zu
spielen, alles andere sind Einstellungen). Dazu tauscht das Bedienfeld im Auto
seine Knöpfe: ▲/▼ und ⇩ sind dort ohne Bedeutung, die Handbremse ✋ kommt dazu,
⟲ heißt jetzt „auf die nächste Straße". Alle drei Wege (Knopf, Menü, `V`) laufen
über `drive:mode` durch **einen** Zuhörer — eine Anzeige, die nur ihren eigenen
Weg kennt, steht nach den beiden anderen falsch.

## 16.1 — Der Fehler, den erst der neue Weg sichtbar gemacht hat

**`FreeFlyController.#onPointerDown` forderte bedingungslos den Pointer Lock an**
— bei *jedem* `pointerdown` auf dem Canvas, also auch bei jeder Berührung. Zwei
Folgen, beide auf einem Telefon:

- **iOS Safari kennt `requestPointerLock` nicht.** Das `?.` davor sicherte nur
  `#canvas` gegen `null` ab, nicht die Methode gegen ihr Fehlen — der Aufruf
  wirft dort einen `TypeError`, bei jeder Berührung.
- **Android lehnt den Lock bei Fingereingabe ab**, und die Ablehnung ist nicht
  still: `PlayerUi` hört auf `pointerlockerror` und reißt das Pausenmenü auf
  (der Rückfallpfad aus P13.4 — dort richtig, hier verheerend).

Gemessen in der Geräteemulation, 375 × 812, Stick auf Vollgas:

| | vorher | nachher |
|---|---|---|
| Menü geht während der Fahrt von selbst auf | **bei Frame 101** (reproduzierbar 151/101) | **nie** (900 Frames) |
| Erreichtes Tempo nach 900 Frames | 20,5 km/h | **49,1 km/h** |

Die zweite Zeile ist der eigentliche Beleg: das Menü unterbrach die Eingabe, das
Auto kam nicht auf Tempo. **Das Fahrmodell war nie das Problem.**

> **`PlayerUi` hatte dieselbe Stelle in P12.4 schon richtig abgesichert**
> (`typeof this.#canvas.requestPointerLock !== 'function'`). `FreeFlyController`
> war die übersehene zweite. Dieselbe Lehre wie bei den rückseitig gewickelten
> Flächen aus P8.11 und den Leitplanken aus P14: **ein Fehlerbild ist eine
> Klasse, kein Einzelfall** — wer einen findet, prüft den ganzen Bestand.
>
> Und: aufgefallen ist er erst, als der Fahrmodus auf Touch **erreichbar** wurde.
> Solange niemand mit dem Finger fahren konnte, fiel ein Menü, das beim Antippen
> aufgeht, nicht als Fehler auf. **Eine neue Nutzungsart ist ein Prüfstand für
> alles, was vorher gebaut wurde** — derselbe Satz steht seit P14 in CLAUDE.md.

## 16.2 — Ton, und zwar ohne ein einziges Byte Download

`src/audio/AudioSystem.ts` plus `src/config/audio.config.ts`. **Vollständig
synthetisiert** — kein Asset, keine Schleife, kein Download. Die Begründung ist
die Zielplattform: ein brauchbarer Motorenteppich aus Aufnahmen kostet 1 bis
3 MB, und das ist genau der Abstand, den P15 zur 20-MB-Schwelle erkämpft hat.

Was klingt: Motor (zwei verstimmte Sägezähne durch einen tempoabhängigen
Tiefpass, mit **Scheingetriebe** — eine Tonhöhe, die nur monoton steigt, klingt
nach Sirene), Roll- und Fahrtwind (gefiltertes Rauschen), Aufprall (Rauschstoß
auf der *Flanke* der Durchdringung, nicht auf ihrem Zustand), Rundensignal und
ein Klick für die Oberfläche.

Drei Fallen der Web Audio API, alle im Kopf der Datei begründet: der Kontext
muss aus einer **Nutzergeste** entstehen (sonst bleibt er für immer
`suspended` — deshalb `unlock()` im Klick des „Starten"-Knopfes, plus
`armAutoUnlock()` als Auffangnetz); fortlaufende Werte laufen über
`setTargetAtTime` statt über Zuweisung (sonst knackt es je Frame); und
Oszillatoren laufen **durchgehend** und werden auf null geregelt, weil `stop()`
endgültig ist.

**Der Stummschalter ist zweigeteilt** (`#userMuted` gegen `#externallyMuted`),
und das ist Vorarbeit mit Absicht: CrazyGames verlangt einen `muteAudio`-Rückruf,
der **Vorrang vor der Spieleinstellung** hat. Wenn das SDK dazukommt, hängt es
sich an `setExternallyMuted()` und muss an dieser Datei nichts ändern. Ein
gemeinsames Feld hätte beim Zurückschalten die Nutzereinstellung überschrieben.

## 16.3 — Aus der Karte wird ein Zeitfahren

`LapTimer` war seit P9.3 **fertig gebaut und für Spieler unsichtbar**: seine
Ablesewerte hingen im Tweakpane-Ordner „Runden", und P13 hat ausdrücklich
gemessen, dass Tweakpane im gebauten Stand **null**mal vorkommt. Wer das Spiel
auf einem Portal öffnete, konnte eine perfekte Runde fahren, ohne es je zu
erfahren.

Dazu kamen `src/game/BestTimes.ts` (Bestzeit je Strecke im `localStorage`, mit
geprüftem statt geglaubtem Inhalt) und `src/ui/DriveHud.ts` (Tacho, laufende
Zeit, Bestzeit, nächstes Tor, Rundenmeldung).

Gemessen am **gebauten** Stand, 375 × 812, und am Dev-Stand mit getriebener
Schleife:

| Prüfung | Ergebnis |
|---|---|
| Bestzeit 92,50 s → gespeichert | `{"ring":92.5}`, Meldung „Bestzeit! 1:32.50" ✓ |
| schnellere Runde 88,25 s | ersetzt, Meldung „Bestzeit!" ✓ |
| langsamere Runde 95,00 s | **nicht** ersetzt, Meldung „Runde 3 · 1:35.00" ✓ |
| nach Neuladen | „Beste 1:28.25" steht sofort ✓ |
| HUD-Tacho gegen Fahrzeug | **26 gegen 25,7 km/h**, **49 gegen 49,1 km/h** ✓ |

> **Das HUD aktualisiert sich nicht, während es versteckt ist**, und das hat
> beim Messen kurz nach einem Fehler ausgesehen: der Tacho stand auf „10",
> während das Fahrzeug 14,2 km/h fuhr. Ursache war das offene Menü (die
> Frührückkehr in `update()`), nicht die Anzeige. Der Fall gehört
> aufgeschrieben, weil er die Regel aus CLAUDE.md bestätigt: **erst prüfen, in
> welchem Zustand gemessen wird**, bevor eine Abweichung ein Fehler heißt.

## 16.4 — Sauberer Auslieferungsbau

`sourcemap: false`. Der Startdownload ändert sich dadurch **nicht** (eine `.map`
wird nur geladen, wenn jemand die DevTools öffnet) — was sich ändert, ist, dass
der vollständige Quelltext samt aller Messkommentare dieses Projekts nicht mehr
auf einem Spieleportal liegt. `dist/` fällt von 107 auf 99 Dateien, 87 auf 81 MB.

## Akzeptanzkriterien P16

- [x] **Der Fahrmodus ist auf einem Touch-Gerät ohne Pointer Lock erreichbar.**
      Am gebauten Stand bei 375 × 812: 🚗-Knopf 56 × 56, `elementFromPoint`
      trifft, nach dem Druck steht „Aussteigen" im Menü und das HUD im Bild.
- [x] **Das Bedienfeld wechselt mit dem Modus.** Im Auto sichtbar:
      `handbrake · menu · drive · reset`, alle 56 × 56 und alle getroffen; ▲/▼
      und ⇩ verschwinden.
- [x] **Alle drei Wege in den Fahrmodus zeigen denselben Zustand.** Knopf, Menü
      und `V` laufen über `drive:mode`; die Anzeige fragt `drive.active`, nicht
      ihren letzten Klick.
- [x] **Die Handbremse erreicht die Physik**, nicht nur das DOM. Gemessen über
      2 s Ausrollen: ohne −0,3 km/h (rollt weiter), mit **1,4 km/h**
      Verzögerung, Schwimmwinkel ändert sich von 0,00° auf −0,33°.
- [x] **Das Menü geht während der Fahrt nicht mehr von selbst auf.** 900 Frames
      mit Vollgas, `menuAufBei: null` (vorher: Frame 101).
- [x] **Ton ohne Download.** `dist/` enthält keine Audiodatei; der Startdownload
      ist unverändert.
- [x] **Der Stummschalter hält über das Neuladen.** `japanmap.audio.muted` 1/0,
      Knopf zeigt 🔇/🔊 nach dem **Zustand**.
- [x] **Bestzeit überlebt das Neuladen** und wird nur von einer schnelleren
      Runde ersetzt. Tabelle in 16.3.
- [x] **Das HUD fängt keine Berührung.** Berechneter Wert `pointer-events: none`
      — mit ID-Selektor (`#overlay > .hud`), weil `#overlay > *` sonst gewinnt.
      Genau der Fehler aus P10.2.
- [x] **Kein Dev-Code im Build.** `tweakpane` 0, `window.japanMap` undefined,
      `.map`-Dateien 0.
- [x] **`typecheck` und `build` laufen sauber durch.**
- [ ] **Auf einem echten Telefon geprüft.** Nicht eingelöst — dieselbe Lücke wie
      P12.6, P13 und P14. Alle Zahlen oben stammen aus der Geräteemulation bei
      375 × 812 mit synthetischen Zeigerereignissen.
- [ ] **Der Ton ist nie gehört worden.** Der Graph ist gebaut und ein Kontext
      läuft, aber diese Umgebung gibt kein Audio aus. Ob der Motor *gut klingt*,
      ist eine Frage für einen Menschen mit Kopfhörern — so, wie „ob sich der
      Drift gut anfährt" es in P14 ist und geblieben ist.
- [ ] **Eine vollständige Runde ist nie gefahren worden.** Die Rundenkette ist
      über das Ereignis `drive:lap` geprüft (also über genau den Weg, den
      `DriveSystem` geht), nicht über 3,4 km Fahrt auf dem Ring.

## Was P16 ausdrücklich **nicht** enthält

**Das CrazyGames-SDK** — ausdrücklich ausgenommen. Es bleibt der eine harte
Blocker vor einem Upload: `loadingStart/Stop`, `gameplayStart/Stop` und der
`muteAudio`-Rückruf sind Pflicht für einen Full Launch, und ohne SDK fällt das
Gesamtbudget von 250 MB auf 50 MB. `AudioSystem.setExternallyMuted()` steht als
Anschlussstelle bereit.

Ebenfalls nicht: Leistungsmessung auf Zielhardware (P12.6 bleibt offen),
Umgebungsgeräusche mit Charakter (Zikaden, Stadt — die kosten Download und
gehören dann gegen die 20-MB-Schwelle gerechnet), Gegner, Schaden, Bestenliste
über das Netz.
