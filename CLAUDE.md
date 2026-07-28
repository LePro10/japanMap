# Arbeitsanleitung für Claude

Diese Datei sagt, **wie** in diesem Projekt gearbeitet wird. Was gebaut wird,
steht in [SPEC.md](SPEC.md); in welcher Reihenfolge und woran man merkt, dass es
fertig ist, in [PLAN.md](PLAN.md). **Bei Widersprüchen gilt PLAN.md.**

---

## Die eine Regel

> **Was nicht gemessen wurde, gilt als nicht erledigt.**

Das ist keine Attitüde, sondern die Lehre aus dem bisherigen Verlauf. Drei
Beispiele, alle echt:

- Der Bergpass meldete Radius ✓ und Steigung ✓ und lag als 50 m tiefer Graben im
  Hang. Beide Grenzwerte stimmten, die Straße war trotzdem falsch — es fehlte
  schlicht eine dritte Messung.
- Die Verrundung meldete 56,3 m Mindestradius, im Polygonzug standen 1,4 m. Sie
  berichtete ihre **Sollwerte** statt ihr **Ergebnis**.
- Eine Akzeptanzzeile in PLAN.md trug einen Haken auf Zahlen aus einem Lauf, den
  es so nicht mehr gab. Die Daten auf der Platte widersprachen der Doku.

Daraus folgt konkret:

1. **Nach jeder Änderung neu messen, nicht das Ziel wiederholen.** Wer etwas
   kürzt, verschiebt oder glättet, muss danach neu rechnen — sonst berichtet das
   Werkzeug den Zustand von vorher.
2. **Zahlen in der Doku stammen aus einem Lauf**, der reproduzierbar ist. Wenn
   eine Zahl nicht frisch ist, gehört das dazugeschrieben („nicht neu
   abgelesen"), nicht verschwiegen.
3. **Mittelwerte verstecken Formen.** Der Steinbruch am Bergpass lag mitten im
   Grenzwert. Immer auch Verteilung, Extremwert und ein **Bild** ansehen.

---

## Der Bake-Kreislauf — die wichtigste Falle

Die Kette ist zirkulär: der Straßengenerator braucht ein Höhenfeld, der Baker
braucht die Straßen. Aufgelöst wird das durch **zweimaliges Backen**.

```bash
npm run world     # bake:clean → sun → roads → bake → shade   (~40 s)
```

**`npm run roads` allein ist keine gültige Messung.** Es läuft gegen das zuletzt
gebackene, also bereits eingeschnittene Gelände; der Generator trassiert dann
durch seine eigenen Einschnitte. Gemessen: derselbe Bergpass kam einmal auf
3966 m mit 8 Kehren, einmal auf 3410 m mit 5 — gleiche Quelldatei, gleiche
Parameter. Seit `meta.json` ein `carved`-Flag führt, **verweigert** der Generator
in diesem Fall den Dienst. Wer am Generator iteriert:

```bash
npm run bake:clean     # einmal, danach bleibt das Feld sauber
npm run roads          # beliebig oft
```

Verbindlich ist trotzdem immer, was `npm run world` ausgibt.

---

## Bevor etwas „fertig" heißt

```bash
npm run world                              # 40 s, muss ohne ✗ durchlaufen
npm run inspect                            # Geometrie + Bilder
npm run typecheck                          # muss sauber sein
npm run build                              # muss durchlaufen
```

> Auf einem Netzlaufwerk scheitern die letzten beiden mit Exit 127, weil
> `node_modules/.bin` leer ist (siehe „Umgebung"). Dann stattdessen:
> `node node_modules/typescript/bin/tsc --noEmit` und
> `node node_modules/vite/bin/vite.js build`. Kein Grund, den Schritt
> auszulassen — er findet Fehler, die keine Messung findet.

Dazu, je nach Änderung:

- **Reproduzierbarkeit:** `npm run world` zweimal, `roads.json` und
  `height.r16` müssen bitgleich sein. Die Kette ist deterministisch; wenn nicht,
  ist etwas kaputt.
- **Ein Bild ansehen.** `assets/generated/inspect/hillshade.png`, und bei
  Geländeeingriffen die Erdbau-Karte (siehe unten). Zahlen allein haben in
  diesem Projekt zweimal einen groben Fehler durchgelassen.
- **Budgets im laufenden Bild.** Draw-Calls, Dreiecke, Texturspeicher und GPU-ms
  stehen im Debug-Overlay (`F1`) und **nur** dort. Ab P4 sind sie die
  Akzeptanzkriterien — ohne laufenden Renderer ist P4 nicht abnehmbar.
  Seit P4 schlägt zusätzlich der `BudgetGuard` an: ein Banner über dem Overlay
  plus ein Konsolen-Eintrag mit der Aufschlüsselung nach System.

- **Ein Bild aus dem laufenden Renderer holen:** `window.japanMap.shot('name')`
  in der Browser-Konsole rendert einen Frame, liest ihn mit `readPixels` aus und
  legt ihn als PNG in `.cache/shots/`. Der Weg über ein Bildschirmfoto
  funktioniert nur, solange jemand davorsitzt — im Hintergrund komponiert der
  Browser gar keine Frames mehr. `japanMap.probe()` daneben liefert dieselbe
  Messung als Zahlen (mittlere Helligkeit, Anteil nicht-schwarz), unabhängig von
  der Bildrate.

---

## Werkzeuge

| Befehl | Wofür |
|---|---|
| `npm run world` | Ganze Kette. Die einzige verbindliche Quelle für Zahlen |
| `npm run inspect` | Selbstschnitte, Weltgrenzen, Achsabstände, Grabentiefe + Schummerung als PNG |
| `npm run inspect -- --road toge --clean .cache/clean.r16` | Enger Ausschnitt plus Erdbau-Karte (rot = Abtrag, blau = Auftrag) |
| `STAGES=1 npm run roads` | Zeigt, was jede Stufe der Trassierung mit Länge und Kehren macht |
| `npm run dev` | Dev-Server. Debug-Overlay mit `F1` |

**Erdbau-Karte erzeugen** (braucht ein Referenzfeld ohne Einschnitte):

```bash
npm run bake:clean && cp assets/generated/terrain/height.r16 .cache/clean.r16 && npm run world
```

**TypeScript ohne Browser messen.** Node 22 führt TS direkt aus — praktisch für
Laufzeitmessungen an reinen Datenstrukturen, ohne den Renderer hochzufahren:

```bash
node --experimental-strip-types bench.mts
```

So wurde das 50-ms-Budget von `distanceToNearestRoad()` geprüft (Import-Pfade
mit `@/` muss man dafür vorher auf relative umschreiben).

---

## Umgebung

- **Node ≥ 22.** Der Plan verlangt es spätestens für P5 (`@gltf-transform/cli`),
  und `--experimental-strip-types` hängt ebenfalls daran.
- **Liegt das Projekt auf einem Netzlaufwerk (SMB/CIFS), gibt es zwei Fallen:**
  `npm ci` scheitert beim Anlegen der `node_modules/.bin`-Symlinks — dann
  `npm ci --no-bin-links` und `tsc`/`vite` über ihren Dateipfad aufrufen
  (`node node_modules/vite/bin/vite.js`). Und git meldet **alle** Dateien als
  geändert, weil der Mount jede Datei als 0755 zeigt: `git config core.fileMode
  false`. Auf lokaler Platte (auch unter Windows) tritt beides nicht auf.
- **WebGL prüfen, bevor eine visuelle Phase beginnt** — aber genau hinsehen.
  Hier stand, ohne GPU-Zugriff gebe es „unter Umständen gar keinen
  WebGL2-Kontext" und P4 sei damit blockiert. **Das war zu pessimistisch:** auf
  dieser Maschine liefert ANGLE über den *Microsoft Basic Render Driver* einen
  vollwertigen WebGL2-Kontext. Was fehlt, ist allein
  `EXT_disjoint_timer_query_webgl2`.
  Die Unterscheidung ist wichtig, weil sie über eine ganze Phase entscheidet:

  | messbar | nicht messbar |
  |---|---|
  | Draw-Calls, Dreiecke, Texturspeicher, Instanzzahlen (CPU-Zähler, exakt) | GPU-ms je Frame |
  | Popping, LOD-Risse, Imposter, Nebel, Look (Bildfragen) | Bildrate als Aussage über Zielhardware |

  Erster Test in der Konsole:
  ```js
  const gl = document.createElement('canvas').getContext('webgl2');
  gl && gl.getExtension('WEBGL_debug_renderer_info');
  ```
  Steht dort `THREE.WebGLRenderer: Error creating WebGL context`, ist es
  wirklich blockiert. Steht nur der Timer nicht zur Verfügung, ist es das nicht.

- **Auf einem SMB-Mount hat der Dev-Server keinen Datei-Watcher.** Vites nativer
  Watcher reißt den Server beim ersten Dateiereignis mit, und der Polling-Modus
  lädt die Seite im Sekundentakt neu. `vite.config.ts` erkennt den Mount über
  `realpathSync.native` und schaltet den Watcher ab. Folge: **nach jeder Änderung
  an `src/` den Dev-Server neu starten**, ein Reload allein reicht nicht — ohne
  Dateiereignis verwirft Vite seinen Transform-Cache nicht.

---

## Codebasis-Regeln

Ausführlich in PLAN.md unter „Konventionen". Das Wichtigste:

- **1 Three.js-Unit = 1 Meter.** Y-up, Norden ist −Z, Winkel intern in Radiant.
- TypeScript `strict`, **kein `any`** ohne begründenden Kommentar, keine
  `import * as THREE`.
- Jedes System hat `dispose()` und gibt GPU-Ressourcen frei.
- Magische Zahlen gehören nach `src/config/`, Shader in `.glsl`-Dateien.
- Alles unter `assets/generated/` ist **erzeugt** und nie von Hand editiert; es
  steht in `.gitignore` und wird aus Seed und Werkzeugen wiederhergestellt.
- `tools/*.mjs` ist reines Node-ESM ohne TypeScript. Kurvenmathematik, die
  Werkzeuge *und* Renderer brauchen, liegt in `src/world/roads/splineSampler.mjs`
  mit Typen daneben in `.d.mts` — **nicht** doppelt implementieren.

---

## Kommentare

Der Bestand erklärt durchgehend das **Warum**, nicht das Was — meist mit der
Messung, die zur Entscheidung geführt hat, und oft mit dem verworfenen Alternativ­
weg. Das ist der Grund, warum die Fehler dieses Projekts nicht zweimal passiert
sind. Neuer Code wird genauso kommentiert.

Wenn eine Annahme sich als falsch herausstellt: **den alten Text nicht löschen,
sondern als widerlegt markieren.** In PLAN.md stand fast eine ganze Phase lang,
das Gelände gebe keine Serpentinen her — die Begründung war falsch, und dass sie
samt Widerlegung dort steht, ist mehr wert als eine glatte Doku ohne Geschichte.

---

## Was in diesem Projekt schon schiefgegangen ist

Kurzliste, damit es nicht wieder passiert:

- **Zusage statt Ergebnis melden.** Mehrfach: die Verrundung, die Trassierung,
  eine gekürzte Strecke, deren Kennwerte von vor dem Schnitt stammten.
- **Regelschleifen, die davonlaufen.** Ein Parameter wird nachgeführt, das
  Ergebnis verschlechtert sich, der Parameter wird weiter nachgeführt. Zweimal
  passiert, beide Male ersatzlos entfernt statt repariert.
- **Eine Stufe repariert, eine Anforderung zerstört.** `removeSpurs` war gegen
  Stichwege richtig und löschte dabei jede Serpentine. Wer eine Stufe schärft,
  prüft, was sie sonst noch trifft.
- **Am falschen Punkt gemessen.** Selbstkollisionen entstehen erst *nach* dem
  Verrunden; wer den Polygonzug davor prüft, findet nichts.
- **Eine Zahl als Begründung geschrieben, ohne sie zu messen.** In P4 stand die
  Imposter-Schwelle mit einer plausiblen Herleitung im Code („die Mischung
  halbiert das Alpha, deshalb muss die Schwelle tief liegen") — nachgemessen war
  sie fast wirkungslos, und die Ursache lag ganz woanders. Der Kommentar trägt
  jetzt die Messtabelle. Wenn eine Änderung nicht isoliert geprüft wurde, gehört
  **das** dazugeschrieben, nicht eine Wirkung, die man annimmt.
- **Warm gegen kalt verglichen.** Die CPU-Kosten der Vegetationsstreuung sahen
  mit 0,70 ms harmlos aus — gemessen auf einer Seite, deren Chunk-Cache seit
  Minuten voll war. Auf einer frisch geladenen Seite waren es 12,7 ms. Bei
  allem, was zwischenspeichert, ist der **kalte** Zustand die Messung, die zählt.
- **Eine Eigenschaft für „alle" an einem Teil geprüft.** Die Abnahmezeile „Wind
  bewegt Geometrie" stand auf einer Messung an einem Nahblickpunkt — und der
  Wind hing allein im Mesh-Material. Drei Viertel der sichtbaren Instanzen waren
  Imposter und standen still. Wer „für alle" prüft, muss über alle messen, nicht
  über die, die gerade im Bild sind.
- **Über das ganze Bild gemittelt, obwohl der Effekt lokal ist.** Fünf Anläufe
  meldeten „Streulicht wirkt nicht", weil der Mittelwert über 31 % Vegetation
  und 69 % Himmel gebildet wurde. Mit einer Maske — Differenz gegen ein Bild mit
  ausgeblendeter Vegetation — war die Antwort in einem Lauf da. **Wo der Effekt
  hinwirkt, muss die Messung hinsehen.**
- **Außerhalb des Gitters extrapoliert.** Bilineare Interpolation braucht die
  Klemmung auf der Gitterkoordinate, nicht auf dem Index — sonst entstehen
  Messwerte, die es nicht gibt.
