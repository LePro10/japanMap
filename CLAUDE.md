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

- **Zum Blickpunkt fliegen, bevor gemessen wird.** `japanMap.view('stadt-neon')`
  setzt die Kamera auf einen benannten Standpunkt; die Tabelle steht in
  `src/debug/viewpoints.ts`, und `view({position, lookAt})` nimmt auch freie
  Werte für die Suche. Ein Bild oder eine Draw-Call-Zahl gilt **an einem Ort**,
  nicht auf der Karte — ohne reproduzierbaren Standpunkt misst ein
  Vorher/Nachher die Kamera statt die Änderung.

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
| `npm run models` | Fremdmodelle aus `assets/source/models` durch die Pipeline (P5.1) |
| `node tools/gen-props.mjs` | Landmarks neu platzieren → `assets/props.json` |
| `npm run dev` | Dev-Server. Debug-Overlay mit `F1` |
| `japanMap.view('name')` | Kamera auf einen benannten Blickpunkt (P6). Seit P8.9 auch `sando`, `dorf`, `stadt-rand` |
| `japanMap.quality('ultra')` | Stufe setzen. Gültig sind **nur** `ultra`, `high`, `medium`, `low`, `minimal` — ein deutscher Name wirft seit P8.9, statt still eine kaputte Stufe zu setzen |
| `japanMap.reflectionProbe()` | Wie viel einer Spiegelung stünde im Bildschirmraum? Die Messung, die in P6/6.5 gegen SSR entschieden hat |

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

- **Auf dieser Maschine laufen fremde Dev-Server auf 5173, 5174 und 4173.**
  Sie gehören anderen Projekten (`ai/ds4b`, `ai/ds4w`) und starten mit
  `--strictPort`. japanMap liegt deshalb auf **5180** (dev) und **4180**
  (preview), fest eingetragen in `.claude/launch.json`.
  Woran man es merkt, wenn es doch einmal kollidiert: die Seite lädt, aber
  `/__shot` antwortet mit **404** — dann redet der Browser mit einem fremden
  Vite. `window.japanMap` kann trotzdem noch funktionieren, weil die Anwendung
  aus dem Speicher weiterläuft; nur neue Netzanfragen gehen woandershin.
  **Fremde Server nicht abschießen** — ausweichen.

- **Zeigen zwei Laufwerksbuchstaben auf dieselbe Freigabe, findet Vite seine
  eigenen Dateien nicht mehr.** Vite löst Modul-IDs über `realpath` auf; unter
  Windows geht das über die Freigabe und wieder zurück auf *irgendeinen*
  zugeordneten Buchstaben. Mitten in P6 kam ein zweiter dazu (`P:` und `Z:` auf
  dieselbe Freigabe), Vite löste `/src/main.ts` nach `Z:/…` auf, und der eigene
  Prozess konnte den Pfad nicht öffnen. **Im Browser sah das aus wie nichts:**
  leere Seite, keine Konsolenmeldung, `window.japanMap` fehlt. Die einzige Spur
  stand im **Server**-Log (`preview_logs` bzw. der Terminalausgabe):
  „Pre-transform error: Failed to load url /src/main.ts. Does the file exist?"
  `vite.config.ts` setzt auf einem Netzlaufwerk deshalb
  `resolve.preserveSymlinks`. Merksatz: wenn die Seite leer bleibt und die
  Browser-Konsole schweigt, **im Server-Log nachsehen**.

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
- **Ein Filter, der nie gefiltert hat.** Die Zonenneigung der Vegetation war
  von P4 an wirkungslos: `ZoneMap` bekam ihre Auflösung aus `bitmap.width`
  **nach** `bitmap.close()` — also 0 —, griff daneben und lieferte `NaN`. Und
  `roll >= NaN` ist immer `false`, verwirft also nichts. Ein zweiter Fehler lag
  darunter: der vierte Splat-Kanal stand im **Alphakanal** eines PNG, und jeder
  Weg über ein Canvas multipliziert RGB damit und rechnet es wieder heraus —
  wo Alpha null ist, kommt RGB als 0 zurück. Zwei Lehren: **eine Ressource
  erst freigeben, wenn niemand mehr etwas von ihr braucht**, und **Alpha in
  einem PNG ist Transparenz, kein vierter Datenkanal**. Aufgefallen ist es
  erst nach Monaten, weil Höhen- und Neigungsfilter das Bild plausibel
  hielten. Wer einen Filter einbaut, sollte einmal messen, wie viel er
  *verwirft* — nicht nur, ob das Ergebnis gut aussieht.
- **Eine Zahl, die von einem kaputten Filter stammt, wandert in die Doku.** Die
  P4-Abnahme nennt 61 372 sichtbare Instanzen. Mit wirkender Zonenmaske sind es
  an derselben Stelle 31 483. Die Zahl war nie falsch gemessen — sie war an
  einem System gemessen, das etwas anderes tat als beschrieben.
- **Ein Parameter mit Fernwirkung.** Die Einebnungsschwelle der Reisfelder
  (P5.4) entscheidet über die **Kehren am Bergpass**: sie verändert die
  Kostenfläche, auf der der Straßengenerator sucht. 0,40 kostete eine Kehre,
  0,55 brachte eine dazu. Wer an einem Geländeparameter dreht, muss `npm run
  world` ganz ansehen, nicht nur die Zone, um die es geht.
- **Außerhalb des Gitters extrapoliert.** Bilineare Interpolation braucht die
  Klemmung auf der Gitterkoordinate, nicht auf dem Index — sonst entstehen
  Messwerte, die es nicht gibt.
- **Ein A/B am Höhenfeld, das gar keines war.** Der Punkt oben („ein Parameter
  mit Fernwirkung") beschreibt einen Einzelfall. Gemessen ist es die Regel:
  ein Eingriff, der ausschließlich die **Stadtzone** anfasst, verändert vor der
  Erosion 17,28 % der Texel und **danach 66,82 %** — bis ans andere Ende der
  Karte (x = −1536). Die Erosion ist ein chaotisches System, und sie trägt jede
  Störung überallhin. Die Kette bleibt dabei deterministisch; zwei Läufe mit
  gleichem Code sind bitgleich.
  Eine plausible Ursache wurde geprüft und **verworfen**: die Startpunktsuche
  der Tropfen verbraucht den Zufallsstrom ungleichmäßig. Ein Versuchsstand mit
  gleichmäßigem Verbrauch änderte an der Ausbreitung nichts (66,82 % mit wie
  ohne) — und wurde deshalb nicht eingebaut, obwohl er „offensichtlich richtig"
  aussah. **Eine Reparatur, deren Wirkung ausbleibt, ist keine Reparatur,
  sondern ein neu gewürfeltes Höhenfeld.**
  Daraus zwei Regeln: wer wissen will, was ein Geländeeingriff *selbst* tut,
  misst mit `--erosion 0`; und wer eine Wirkung dem Eingriff zuschreibt, muss
  sie getrennt haben. Nach P8.5 hat der Bergpass 7 Kehren statt 3 — **welcher
  der drei Eingriffe das bewirkt hat, ist nicht bekannt**, und genau so steht
  es in der Doku.
- **Etwas ist nicht im Bild — und jede Zahl sagt, es sei alles in Ordnung.**
  Dreimal in P6, mit drei verschiedenen Ursachen und **demselben Messbild**:
  Draw-Calls stimmen, Instanzzahlen stimmen, die Geometrie liegt an der
  richtigen Stelle, ein Raycast trifft sie, die Bounding-Box passt — und im
  Bild ist nichts.
  1. Ein **Fragment-Shader, der nicht übersetzt** (`geometryNormal` heißt in
     three 0.185 `nonPerturbedNormal`). Sämtliche Asphaltflächen der Karte
     verschwanden; three zeichnete die Draw-Calls unbeirrt weiter. **Nur die
     Browser-Konsole wusste Bescheid.**
  2. Eine **Fläche unter einer anderen**: die Stadtplatte lag 3 cm über dem
     Höhenfeld — sauber aus 14 641 Proben gerechnet — und trotzdem unter dem
     *gerenderten* Gelände. Das Terrain wird an den Stützstellen des
     CDLOD-Gitters ausgelenkt, und zwischen zwei Gitterpunkten liegt eine
     Gerade über der Kurve. Gemessen gehört das gerenderte Gitter, nicht das
     Feld, aus dem es entsteht.
  3. Ein **vergessener Versatz**: die Straßendecals lagen auf der Mittellinie
     aus `roads.json`, die Fahrbahn liegt seit P3 um 6 cm darüber. 3339
     Instanzen, alle korrekt, alle im Asphalt.
  4. Ein **abgeschalteter Pass, der den Ausgang mitnahm** (P8.2).
     `postprocessing` setzt `renderToScreen` beim Hinzufügen genau einmal, auf
     den letzten Pass **im Array** — hier SMAA. `render()` überspringt
     abgeschaltete Pässe aber vollständig. Wer SMAA abschaltet, nimmt der Kette
     damit ihren einzigen Ausgang, und das fertige Bild landet im
     Zwischenpuffer. Der Schalter im Debug-Panel tat das seit P2; aufgefallen
     ist es erst, als eine *Qualitätsstufe* ihn umlegte. Merksatz: **wer einen
     Pass abschalten kann, muss wissen, wer danach auf den Bildschirm zeichnet.**

  Daraus die Regel: **nach jeder Änderung an einem Material die Konsole
  ansehen**, und wenn etwas fehlt, nicht die Zahlen fragen, sondern eine
  Differenz gegen ein Bild ohne das Ding messen — und danach prüfen, gegen
  *welche* Fläche man eigentlich gemessen hat.
- **Ein Rundungsfehler, der als weißes Rauschen sichtbar wird.** Die Fassaden
  rauschten pixelfein, obwohl der Hash je Fenster konstant sein muss. Ursache:
  `fract(sin(dot(p,k)) * 43758.5453)`. Der Startwert läuft als `varying` durch
  die perspektivisch korrekte Interpolation, die (a/w)/(1/w) rechnet und je
  Pixel die letzten Bits unterschiedlich trifft. Bei einem Sinus-Argument um
  3700 liegt die Auflösung von `float` bei 0,00024; mal 43758 sind das zehn
  ganze Einheiten, und `fract` davon ist gleichverteilt. **Hash-Funktionen mit
  `sin` und großem Argument sind gegen interpolierte Eingaben nicht robust** —
  ganzzahlig rechnen und den Startwert beim Eintritt runden.
  Drei plausible Erklärungen gingen vorher daran vorbei (AO-Entrauschung, zu
  glattes Glas, kaputte Ableitungen); alle drei wurden gemessen und verworfen.
  Gefunden hat es erst eine **Diagnose-Ausgabe**, die den nackten Hash zeigt —
  sie steht seitdem im Debug-Panel.
- **Eine Ursache benannt, ohne sie zu trennen.** „Die Stadt steht als heller
  Fleck in der Landschaft" — begründet mit dem Anstrich, und die Palette wurde
  abgedunkelt. Nachgemessen war die Begründung falsch: **ohne Fenster- und
  Neonlicht ist die Stadt dunkler als ihre Umgebung** (Verhältnis 0,83 gegen
  1,43 im Betrieb). Die Helligkeit kam vollständig aus dem Eigenlicht. Wer bei
  einem Look-Problem am erstbesten plausiblen Regler dreht, verschiebt
  irgendwann alles ein Stück und hat nichts gelernt. **Erst den Anteil
  ausschalten, dann messen, dann drehen.**
- **Ein Fünftel des Bildes fehlte — und alle 64 Messbilder einer Phase waren
  betroffen.** `ImposterAtlas.bake` setzte den Viewport am Ende auf Atlasgröße
  statt ihn zurückzusetzen; Render-Ziel, Tonemapping und Löschfarbe wurden
  gesichert, der Viewport nicht. `setRenderTarget(null)` nimmt in three den
  **Renderer-Viewport**, nicht die Canvas-Größe — die ganze Postprocessing-Kette
  landete danach in einem 1024er Quadrat. Bei 1280 × 720 heißt das: rechts 20 %
  abgeschnitten, und von der 1024 hohen Fläche zeigt der Canvas nur die unteren
  720. Sichtbar war also **das untere Siebzigstel des Frames, waagerecht
  gestaucht** — nicht bloß ein fehlender Streifen, sondern ein anderer
  Ausschnitt.
  Verdeckt hat sich das monatelang, weil jede Größenänderung `setSize()` ruft
  und den Viewport mitzieht: ein Fensterwechsel, angedockte DevTools, ein
  Wechsel der Qualitätsstufe. Zwischen Bake und erstem gemessenen Bild lag fast
  immer eines davon. Aufgefallen ist es erst, als ein Frame ohne jeden Resize
  entstand.
  Drei Lehren, und die dritte ist die teuerste:
  1. **Was gesichert wird, wird vollständig gesichert.** Über der Löschfarbe
     stand seit P4 der Kommentar, dass sie zurückgesetzt gehört, weil sie sonst
     in der Anwendung weiterläuft. Für den Viewport galt derselbe Satz — er
     stand nur nicht dort.
  2. **Gefunden hat es kein Zahlenblick.** Draw-Calls, Instanzzahlen, Geometrie:
     alles richtig. `probe()` meldete 0,799 nicht-schwarze Pixel, und 1024/1280
     sind 0,800 — die Zahl war da, sie musste nur jemand ansehen.
  3. **Eine Messung am Bild ist nur so gut wie das Bild.** Jede pixelbasierte
     Zahl der betroffenen Phase war falsch, ohne dass eine davon falsch
     *abgelesen* war. Ein Flächenanteil auf einem beschnittenen Bild ist ein
     Anteil an etwas anderem. Wer am Bild misst, prüft **zuerst**, dass das Bild
     vollständig ist — `probe()` liefert dafür `anteilNichtSchwarz`, und der
     muss bei einer Szene mit Himmel 1,000 sein.
- **Ein vollständiges Bild einer halb geladenen Welt.** In P8.9 stand die
  Vegetation auf Ultra bei **0 Instanzen**, und zwar reproduzierbar über
  Neuladen und Stufenwechsel hinweg. Die naheliegende Erklärung („ein
  Stufenwechsel setzt die Streuung zurück") war falsch und wurde gemessen
  widerlegt: die Ursache lag außerhalb der Anwendung. **Die Vorschau war
  ausgeblendet** (`document.hidden === true`), der Browser rief kein `rAF` mehr
  auf, die Frameschleife stand — und die Streuung streamt in der Schleife.
  `japanMap.shot()` rendert trotzdem einen Frame von Hand, `probe()` meldete
  `anteilNichtSchwarz = 1`, und im Bild fehlte schlicht der halbe Bewuchs.
  Zwei Lehren:
  1. **`probe()` prüft, ob das Bild vollständig ist — nicht, ob die Welt es
     ist.** Wer am Bild misst, prüft zusätzlich einen Inhaltszähler
     (Instanzzahl, Chunk-Zahl) und wartet, bis er **steht**.
  2. Wenn die Vorschau nicht angezeigt werden kann, lässt sich die Schleife von
     Hand treiben: `engine.loop.tick()` in Stapeln, dazwischen ein Makrotask,
     damit der Worker antworten kann. **Nicht `setTimeout`** — der wird im
     Hintergrund auf ≥ 1 s gedrosselt und macht aus jedem Worker-Umlauf eine
     Sekunde. Ein `MessageChannel`-Port hat diese Klemmung nicht.
- **Eine Differenz*zahl* statt eines Differenz*bildes* gelesen — und daraus die
  falsche Ursache geschlossen.** Der Fluss aus P8.6 war ein halbes Jahr lang
  unsichtbar: sein Band war im Uhrzeigersinn gewickelt und fiel vollständig ins
  Backface-Culling. P8.6 hatte das untersucht, drei Vermutungen sauber
  widerlegt (vergraben, transparent, außerhalb des Bildes) und dann geschlossen
  „er wird gezeichnet, er ist nur farblich nicht von den Reisfeldern zu
  unterscheiden". Die Belegzahl dafür waren **0,869 % geänderte Pixel bei
  Schwelle 0**.
  Diese Pixel waren nicht der Fluss. Ein Mesh ein- und auszublenden ändert
  Spiegelung und Umgebungsverdeckung im ganzen Bild; im **Differenzbild** ist
  das sofort zu sehen — Sprenkel über dem gesamten Bewuchs, nirgends ein Band.
  Drei Lehren:
  1. **Wer eine Differenz misst, sieht sie sich an.** Eine Prozentzahl sagt
     *wie viel*, nicht *wo*. Ein 8-zeiliges Skript, das die Differenz als Bild
     schreibt, hätte die Fehldeutung in einem Schritt verhindert.
  2. **Ein A/B über `visible` ist nicht sauber.** Es verändert alles, was von
     der Szene abhängt. Erst ein **Rauschband** messen (dasselbe Bild zweimal),
     dann nur Effekte darüber ernst nehmen — hier 2,098 % / 0,241 %.
  3. **Geometrie, Uniforms und Sichtvolumen zu prüfen beantwortet die Frage
     nicht, ob ein Dreieck den Rasterizer erreicht.** Das `normal`-Attribut
     zeigte ausdrücklich nach oben, die Beleuchtung war rechnerisch richtig,
     die Fläche unsichtbar. Wenn etwas fehlt und alle Zahlen stimmen:
     **einmal `side = DoubleSide` setzen.** Zeigt sich das Ding, ist die
     Wickelrichtung falsch. Der Test kostet eine Zeile.
  Dieselbe Falle steht oben schon für das Straßen-Mesh — dort ist sie beim
  Bauen aufgefallen, hier erst Phasen später.
- **Eine lebende Referenz für eine Momentaufnahme gehalten.** In P8.11 meldete
  die Stufentabelle auf Ultra 909 338 Dreiecke statt 623 628 — ein halbes
  Budget zu viel. Der Code las `renderer.info.render` in eine Variable und
  benutzte sie *nach* `japanMap.lodHoles()`, und das rendert dreizehn fremde
  Blickpunkte. Die Zahl war die des letzten davon. **`renderer.info.render` ist
  ein Objekt, das three jeden Frame überschreibt** — wer es aufhebt, hebt einen
  Zeiger auf, keinen Wert. Erst kopieren, dann weiterarbeiten.
- **Am Ergebnis eingehängt statt an der Eingabe.** Die planare Spiegelung
  überschrieb zuerst `reflectedLight.indirectSpecular` — also den bereits mit
  der Fresnel-Gewichtung multiplizierten Wert — mit der **rohen**
  Szenenhelligkeit. Ergebnis: eine überflutete Straße, und zwar auch noch bei
  einer Stärke von 0,25. Richtig ist die Stelle, an der three die
  Umgebungskarte einsetzt; alles Weitere macht dann dieselbe BRDF. Wer einen
  Wert in eine fremde Beleuchtungskette schiebt, muss wissen, **welche
  Multiplikationen dahinter noch kommen**.
