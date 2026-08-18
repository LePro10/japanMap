# Arbeitsanleitung für Claude

Diese Datei sagt, **wie** in diesem Projekt gearbeitet wird. Was gebaut wird,
steht in [SPEC.md](SPEC.md); in welcher Reihenfolge und woran man merkt, dass es
fertig ist, in [PLAN.md](PLAN.md); wo etwas im Quelltext steht und was mit was
redet, in [ARCHITECTURE.md](ARCHITECTURE.md). **Bei Widersprüchen gilt PLAN.md**,
und über den Aufbau die Quelldatei selbst.

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

- **Die Fingersteuerung wird mit synthetischen Zeigerereignissen geprüft** (P12.4).
  `japanMap.shot()` zeigt sie nicht (DOM), ein Bildschirmfoto geht in der
  Vorschau nicht. Was geht:

  ```js
  const cv = document.getElementById('viewport');
  const pe = (t, id, x, y) => cv.dispatchEvent(new PointerEvent(t, {
    pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
  pe('pointerdown', 1, 200, 500); pe('pointermove', 1, 200, 444);   // Stick voll vorwärts
  ```

  **Und dann die Kamera fragen, nicht das DOM.** Ob der Stick *wirkt*, steht in
  `engine.camera.position` nach ein paar `loop.tick()` — nicht darin, dass sich
  der Knopf bewegt hat. Zwei Fallen, beide gemessen:
  `setPointerCapture` wirft bei synthetischen Ereignissen (`NotFoundError`), und
  ein Knopf, der von `elementFromPoint` **nicht** getroffen wird, ist trotz
  korrekter Größe unbedienbar.

- **Was die Oberfläche angeht, wird am gebauten Stand gemessen — Port 4180.**
  Seit P10.2 gibt es eine Spieler-Oberfläche (`src/ui/PlayerUi.ts`), und sie ist
  das einzige DOM, das **ohne** `import.meta.env.DEV` ausgeliefert wird. Im
  Dev-Server verdeckt das Debug-Panel jede Lücke: dort sind Stufenwahl,
  Blickpunkte und Zahlen greifbar, im Build ist nichts davon da. Der A-bis-Z-
  Durchgang in PLAN.md hing genau an dieser Unterscheidung.

  ```bash
  node node_modules/vite/bin/vite.js build   # danach Port 4180 neu laden
  ```

---

## Die Oberfläche prüfen — sie ist DOM, kein Bild

Für alles unter `src/ui/` versagen **beide** üblichen Wege, und das kostet
sonst jedes Mal eine halbe Stunde:

- **`japanMap.shot()` hilft nicht.** Es liest den WebGL-Puffer mit `readPixels`
  aus — das DOM darüber ist darin nicht enthalten. Ein Menü ist auf einem
  `shot()` grundsätzlich unsichtbar, auch wenn es einwandfrei steht.
- **Ein Bildschirmfoto hilft meistens auch nicht.** Die eingebettete Vorschau
  komponiert keine Frames, der Aufruf läuft in eine Zeitüberschreitung.

Gemessen wird deshalb **strukturell**: `getComputedStyle`, `elementFromPoint`,
`querySelectorAll`, die Ereignisse von Hand auslösen. Ein Knopf lässt sich mit
`element.click()` betätigen, auch wenn er unsichtbar ist; ein Regler mit
`el.value = …; el.dispatchEvent(new Event('change', {bubbles:true}))`. Das ist
kein Ersatz für ein Bild, aber es beantwortet die Fragen, die bei einer
Oberfläche zählen — steht das Element da, ist es klickbar, wirkt der Regler.

> **Der berechnete Wert entscheidet, nicht der geschriebene.** In P10.2 stand
> `pointer-events: none` in der Datei und `auto` im Browser, weil eine Regel mit
> ID-Selektor darüber lag. Der Kasten sah richtig aus und verhielt sich falsch.

> **Und die Oberfläche wird über ihre eigenen Wege geöffnet, nicht von Hand.**
> In P13 meldete ein Prüfstand den „Weiter"-Knopf als unerreichbar — darüber lag
> der ☰-Knopf der Fingersteuerung. Ursache war der Prüfstand selbst: er hatte
> `menu.hidden = false` gesetzt und damit `#render()` übersprungen, das das
> Bedienfeld ausblendet. Über den echten Weg (☰ drücken) stimmt alles. Ein von
> Hand gesetzter Zustand ist ein Zustand, den es im Betrieb nicht gibt.

**Seit P13 startet das Debug-Werkzeug ausgeschaltet.** Zahlenblock (`.stats`)
und Tweakpane-Leiste (`.debug-pane`) hängen an `japanmap.debug.stats` bzw.
`japanmap.debug.pane` im `localStorage`, Voreinstellung **aus**. Angeschaltet
wird im Reiter „Debug" des Pausenmenüs oder mit `F1` (das schaltet beides
zugleich). Wer in einer frischen Sitzung Zahlen ablesen will, muss also erst
einschalten — ein leerer Bildschirmrand heißt nicht mehr „das Panel ist kaputt".

```js
localStorage.setItem('japanmap.debug.stats', '1');
localStorage.setItem('japanmap.debug.pane', '1');   // danach neu laden
```

**Pointer Lock ist in der eingebetteten Vorschau unmöglich.** `requestPointerLock()`
wirft dort `WrongDocumentError: The root document of this element is not valid
for pointer lock`, und `document.hasFocus()` ist `false`. Alles, was am Lock
hängt — Menü öffnen mit Escape, „Weiter", die Kamerasteuerung überhaupt —, ist
hier **nicht prüfbar**. Das gehört dann so in die Doku geschrieben und nicht als
erledigt abgehakt. Prüfbar ist immerhin der **Fehlerzweig**: eine abgelehnte
Anforderung darf keinen toten Zustand hinterlassen.

> **Und genau daraus zieht P13 seinen Nutzen aus dieser Einschränkung.** Weil
> der Lock hier *immer* scheitert, ist der Fehlerzweig hier der Normalfall und
> damit gut messbar: nach „Starten", nach „Weiter", nach einem Blickpunkt und
> nach Escape steht jedes Mal 250 ms später wieder das Menü. Seit `.hint` weg
> ist, wäre ein geschlossenes Menü nach einem abgelehnten Lock ein Bild **ganz
> ohne Bedienelement**.

**Vegetation von Hand messen — die Beruhigung ist der heikle Teil.** Dieselbe
Falle wie im Messlauf, und sie ist mir in P10.2 prompt wieder passiert: die
erste Ablesung am Blickpunkt `wald` lautete 17 623 Instanzen, die richtige ist
**38 948**. Der Zähler stand nur gerade still, weil das Nachströmen eine Pause
machte. Wer ohne `japanMap.report()` misst, treibt die Schleife von Hand und
verlangt ein **langes** Stabilitätsfenster:

```js
const mc = () => new Promise(r => { const c = new MessageChannel();
  c.port1.onmessage = () => r(); c.port2.postMessage(0); });
// … loop.tick(); await mc(); … bis der Zähler ~90 Frames lang steht
```

`MessageChannel` und **nicht** `setTimeout` — der wird im Hintergrund auf ≥ 1 s
gedrosselt. ~~Referenzwerte zum Gegenhalten: `wald` auf Ultra 38 948, mit Dichte
25 % 9 860.~~

> **Diese Referenzwerte gelten seit P11 nicht mehr**, und zwar aus zwei Gründen
> zugleich: `vegetationDensity` gibt es nicht mehr (ausgedünnt wird mit der
> Entfernung, nicht über die Fläche), und die Baumreichweite ist von 520 auf
> 1200 m gestiegen. Neu gemessen bei 1280 × 720: `wald` auf Ultra **53 116**,
> auf Minimal **12 684**; `wald-fern` auf Ultra **15 478**.
>
> **Und das Warten dauert seitdem deutlich länger.** `wald-fern` auf Ultra
> brauchte gemessen **1101** getriebene Frames, bis `streaming` auf `false` ging
> — bei 1200 m Reichweite sind rund 1100 Chunks zu füllen, und
> `SCATTER.workerQueueDepth` lässt vier je Frame zu. Wer hier mit 90 Frames
> Stabilitätsfenster misst, misst einen Zwischenstand.

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
| `japanMap.quality('ultra')` | Stufe setzen. Gültig sind **nur** `ultra`, `high`, `medium`, `low`, `minimal` und seit P10.2 `custom` — ein deutscher Name wirft seit P8.9, statt still eine kaputte Stufe zu setzen |
| `japanMap.reflectionProbe()` | Wie viel einer Spiegelung stünde im Bildschirmraum? Die Messung, die in P6/6.5 gegen SSR entschieden hat |
| `japanMap.winding()` | Wickelrichtung aller Meshes gegen ihr Normal-Attribut. Leere Liste = in Ordnung. Hat in P8.11 zwei unsichtbare Flächen gefunden, die jede andere Zahl für gesund hielt |
| `japanMap.report()` | **Der Messlauf (P10.0).** Blickpunkte × Qualitätsstufen, JSON nach `.cache/reports/` plus je ein PNG. Siehe unten |
| `japanMap.ab({variants})` | **Die A/B-Messung (P12.0).** Misst *Eingriffe* gegen eine Basis statt Zustände gegeneinander — und sagt dazu, ob das Ergebnis über dem **gemessenen** Rauschband liegt. Siehe „Wie GPU-Zeit hier gemessen wird" |
| `npm run dev:lan` | Dev-Server im WLAN (P12.6). Das **Telefon** ruft ihn auf und fährt `japanMap.report({mode:'live'})` selbst — mit echter Bildrate und, unter Android Chrome, echter GPU-Zeit. Der Lauf fliegt die Blickpunkte selbst an und braucht keine Fingersteuerung |
| `npm run hdri` | IBL-HDRI halbieren (P12.5). Teil von `npm run world` |
| `japanMap.drive(true)` | **Fahrmodus an/aus (P14).** Der einzige Weg dorthin ohne Pointer Lock — die Taste `V` verlangt einen, die eingebettete Vorschau gibt keinen |
| `japanMap.driveProbe()` | **Der Messstand des Fahrmodus (P14).** Fährt jede Strecke ab und schreibt Durchdringung, Spurlage, Tempo und CPU je Schritt mit; dazu Standhöhe und Höhendifferenz Sampler ↔ Mittellinie. Läuft **ohne zu rendern** — 3600 Schritte in ~50 ms |

**Der Messlauf — und wofür er gebaut ist.**

`japanMap.report()` fährt eine Matrix ab und schreibt eine Datei. Er existiert,
weil GPU-Zeit auf dieser Maschine nicht messbar ist und die Zahlen trotzdem
gebraucht werden: wer eine echte GPU hat, startet `npm run dev`, ruft den Lauf
und schickt `.cache/reports/` samt `.cache/shots/` zurück.

Zwei Betriebsarten, und die Unterscheidung ist die halbe Miete:

| | `live` (Standard) | `driven` |
|---|---|---|
| Frames | normale Schleife, rAF | `loop.tick()` von Hand |
| Bildrate / `pacing` | gemessen | **`null`** — ohne Vsync gibt es keine |
| Draw-Calls, Dreiecke, Instanzen, Texturspeicher, Bild | gemessen | gemessen |
| Braucht | **sichtbares** Fenster | nichts |

`live` verweigert bei `document.hidden` den Dienst, statt eine Zahl aus einem
gedrosselten Tab zu melden. **In der eingebetteten Vorschau kommt gar kein rAF**
(nachgemessen: fünf angeforderte Frames in 30 s nicht zustande gekommen) — dort
ist `driven` der einzige Weg, und `pacing`/`fps` stehen dann als `null` in der
Datei. Fehlt der GPU-Timer, steht `gpuTiming.available: false` **mit
Begründung** da; jede Einschränkung landet zusätzlich in `warnings`.

```js
japanMap.report({ mode: 'driven', levels: ['ultra','low'], viewpoints: ['reisfeld'] })
```

> **Das Warten auf die fertige Welt ist der heikle Teil.** Der Lauf wartet auf
> zwei Dinge zugleich: unveränderte Instanzzahl **und** `ScatterSystem.streaming
> === false`. Die erste Bedingung allein hat beim ersten Lauf am Blickpunkt
> `reisfeld` auf Ultra **0 Vegetationsinstanzen** als „stabil" gemeldet —
> *unverändert bei null* ist von *fertig* nicht zu unterscheiden. Mit dem
> Signal aus dem Streusystem sind es 8805, und das ist die Zahl, die auch in
> PLAN.md steht.

> **`document.hidden` ist keine ausreichende Absicherung.** Im ersten
> `live`-Lauf blieben zwei Zellen unfertig, und die Meldung nannte die falsche
> Ursache. Nachgerechnet lag der Frame-Abstand während des Wartens bei **1550
> bzw. 1160 ms** gegen 16,7 ms in derselben Messschleife — der Browser war
> gedrosselt, `document.hidden` stand dabei auf `false`. Ein *verdecktes*
> Fenster meldet nicht dasselbe wie ein *unsichtbares*. Der Bericht führt
> deshalb `settle.frameIntervalMs`, und die Warnung unterscheidet Drosselung,
> nachströmende Streuung und schwankende Puffer voneinander.

**Blickpunkte für Vegetationsmessungen.** ~~Aus der Luft ist die Streuung nicht
messbar: bei 520 m Reichweite tragen `start` (330 m hoch) gemessen 67 Instanzen
und `pass` (420 m) 171, `kueste` auf allen Stufen null.~~

> **Das galt für die 520-m-Reichweite und ist mit P11.5 hinfällig.** Die Bäume
> reichen jetzt 1200 m weit, und damit ist der Übersichtsblick nicht mehr leer:
> `start` trägt gemessen **2 492** Instanzen statt 67. Er ist seitdem der
> *nützlichste* Blickpunkt für die Frage „wirkt die Karte vollständig", weil man
> von dort das halbe Massiv sieht.
>
> `kueste` bleibt bei **null** — der Blickpunkt zeigt offenes Meer.

Wer Vegetation misst, nimmt `wald` (53 116 auf Ultra), `wald-fern` (15 478) oder
`reisfeld`. ~~`wald-fern` ist zugleich der Ort, an dem die 520-m-Kante der
Streuung im Bild steht.~~ Die Kante gibt es nicht mehr; `wald-fern` ist jetzt der
Ort, an dem man prüft, **dass** sie weg ist.

---

## Den Fahrmodus prüfen — P14

**Er braucht keinen laufenden Renderer und keinen Pointer Lock.** Das ist der
Grund, warum er auf dieser Maschine überhaupt abnehmbar war:

```js
japanMap.drive(true);            // Fahrmodus an — die Taste V verlangt Pointer Lock, das hier nicht
japanMap.driveProbe({ seconds: 60, speedCap: 14 });   // fährt alle acht Strecken ab
```

Der Messstand treibt die Physik in einer eigenen Schleife: 3600 Schritte (eine
Minute Fahrt) kosten rund 50 ms. Er misst Durchdringung, Abstand zur
Fahrbahnmitte, Tempo, Schwimmwinkel und CPU je Schritt, dazu die **Standhöhe**
des Fahrzeugs gegen die Fahrbahnoberkante.

**Für das Fahrmodell selbst gibt es einen kürzeren Weg — einen idealen Boden.**
Er isoliert die Physik vollständig von Gelände und Kollision, und genau so wurde
der Energiefehler oben gefunden:

```js
const drive = japanMap.engine.systems.find(s => s.name === 'DriveSystem');
const flat = { height: () => 0, normal: (x,z,t) => t.set(0,1,0), surface: () => 'asphalt' };
drive.vehicle.respawn(0, 0, 0, flat);
for (let i = 0; i < 600; i++) drive.vehicle.step(1/60, {throttle:1,brake:0,steer:0,handbrake:false}, flat, null);
```

Referenzwerte auf diesem Boden (Stand P14): 0–100 km/h in **4,70 s**, Endtempo
nach 60 s **255,8 km/h**, seitlicher Versatz **0,00 m**, Gierwinkel **0,000°**.
Ein Drift aus 58° Schwimmwinkel bei 89 km/h fängt sich **ohne jede Eingabe** in
1,5 s, und das Tempo fällt dabei monoton — steigt es, ist der Energiefehler
zurück.

> **Was der Prüfstand nicht kann: sagen, ob es sich gut anfühlt.** Er fährt mit
> einem Regler, nicht mit einer Absicht. „Ist der Drift kontrollierbar" braucht
> eine Hand an der Tastatur, und diese Antwort steht in PLAN.md P14
> ausdrücklich **aus**.

**Und ein Bild gehört auch hier dazu.** Das Fahrzeug ist DOM-frei, also greift
`japanMap.shot()` — anders als bei der Oberfläche. Beim ersten Bild fehlten die
Räder, obwohl jede Zahl stimmte (siehe unten).

---

## Wie GPU-Zeit hier gemessen wird — P12.0, 2026-08-16

**Auf dieser Maschine ist GPU-Zeit messbar.** Der Satz „diese Maschine hat kein
`EXT_disjoint_timer_query_webgl2`" steht an einem halben Dutzend Stellen im
Projekt und ist **maschinengebunden, nicht projektgebunden** — er galt für den
ANGLE-Pfad über den *Microsoft Basic Render Driver*. Gemessen am 2026-08-16:

```
renderer: ANGLE (AMD, AMD Radeon RX 7900 XTX (0x0000744C) Direct3D11, D3D11)
EXT_disjoint_timer_query_webgl2: vorhanden, liefert Werte
```

**Das macht die Karte trotzdem nicht zum Maßstab** — SPEC §4 nennt sie
ausdrücklich als unbrauchbar dafür, und bei 1,7 ms auf 720p misst man
Treiber-Overhead statt Last. Belastbar sind **Verhältnisse**, nicht Absolutwerte
gegen die Budgets.

### Zwei Störungen, und beide addieren nur

1. **Die GPU gehört nicht uns allein.** Läuft nebenher etwas anderes darauf (in
   diesem Fall LM Studio), stimmt eine sequenzielle Messreihe nicht mehr:
   gemessen stieg eine Serie aus acht Eingriffen bei 3840 × 2160 **monoton an**,
   unabhängig davon, was abgeschaltet wurde — „nur Gitter 17²" kam auf 19,5 ms
   gegen 12,5 ms der Basis davor. Dieselbe Basis, 21-mal verteilt gemessen,
   streute **3,75…11,98 ms**.
2. **`lastGpuMs` ist nicht immer *ein* Frame.** `StatsProfiler.update()` ruft je
   Frame `processGpuQueries()`, und das **summiert alle Abfragen, die gerade
   fertig geworden sind**. Eine Abfrage wird ein bis drei Frames später fertig —
   im eingeschwungenen Zustand ist das eine je Frame, es sind aber auch null
   (dann steht 0 da) oder zwei (dann die doppelte Frame-Zeit). Gemessen am
   Blickpunkt `wald`: Median **1,89 ms**, 10. Perzentil **0,91 ms** — Faktor 2,1,
   also genau eine doppelt gezählte Abfrage.

Daraus die drei Regeln, die `japanMap.ab()` als Code umsetzt:

- **Interleaven.** Jede Variante steht zwischen zwei Basiswerten und wird gegen
  deren Mittel gerechnet. Ein linearer Drift kürzt sich heraus.
- **Niedriges Perzentil statt Median.** Beide Störungen können einen Messwert
  nur *vergrößern* — es gibt keinen Mechanismus, der ihn zu klein macht.
  Nullwerte werden verworfen, nicht mitgemittelt.
- **Das Rauschband messen, nicht schätzen.** Aus den Abständen benachbarter
  Basiswerte, 90. Perzentil. Was darunter liegt, heißt **„nicht auflösbar"** und
  nicht „kein Effekt".

Der Selbsttest des Werkzeugs ist eine **Nullprobe** — eine Variante, die nichts
ändert. Sie muss `significant: false` liefern; gemessen Δ = +0,04 ms.

> **Was das Rauschband kostet:** mit LM Studio auf derselben Karte lag es bei
> **±0,40 ms gegen 1,66 ms Basis (24 %)**. Alles darunter ist in so einem Lauf
> nicht messbar. Wer die kleinen Posten auflösen will, muss die GPU frei haben.

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
- **Die Maschine wechselt — die Sätze über sie gelten deshalb nicht ewig.**
  Dieses Projekt ist auf mindestens zwei Rechnern entstanden, und ein guter Teil
  seiner Doku beschreibt *einen* davon. Vor der ersten Messung einer Sitzung
  gehört deshalb geprüft, worauf man gerade sitzt:
  ```js
  const gl = document.createElement('canvas').getContext('webgl2');
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  ({ gpu: gl.getParameter(d.UNMASKED_RENDERER_WEBGL),
     timer: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') });
  ```
- **WebGL prüfen, bevor eine visuelle Phase beginnt** — aber genau hinsehen.
  Hier stand, ohne GPU-Zugriff gebe es „unter Umständen gar keinen
  WebGL2-Kontext" und P4 sei damit blockiert. **Das war zu pessimistisch:** auf
  ~~dieser~~ *der ANGLE-/Basic-Render-Driver-*Maschine liefert ANGLE einen
  vollwertigen WebGL2-Kontext. Was dort fehlt, ist allein
  `EXT_disjoint_timer_query_webgl2`.

  > **Auf der GPU-Maschine (RX 7900 XTX) fehlt auch die nicht mehr** —
  > gemessen am 2026-08-16. Jede Stelle im Projekt, die „GPU-Zeit ist hier nicht
  > messbar" sagt, meint die *andere* Maschine. Wie unter diesen Umständen
  > richtig gemessen wird, steht oben unter „Wie GPU-Zeit hier gemessen wird" —
  > eine vorhandene Zeitabfrage allein reicht nämlich nicht.
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
- **Einen Fehler behoben und nicht gefragt, wo er noch steckt.** Nachdem der
  Fluss repariert war, hat eine systematische Prüfung über alle 132 Meshes
  einen **zweiten** Fall gefunden: die **Schürze des Stadtbodens**, 240 von 242
  Dreiecken rückseitig. Sie ist der Übergang zwischen der 360-m-Platte des
  Distrikts und dem Gelände — genau das Stück, das laut Kommentar im Code
  verhindern soll, dass „die Stadt auf einem 20 bis 100 cm hohen Absatz mit
  senkrechter Kante steht". Sie war nie gezeichnet. Gemessen an der Kante
  ändert die Reparatur **55,8 % des Bildes**.
  Das erklärt einen Teil des Befunds aus 8.8 („die Bebauung hört abrupt auf"),
  gegen den 8.9 mit Props angebaut hat — die Diagnose war richtig, eine ihrer
  Ursachen lag aber woanders.
  Lehre: **ein Fehlerbild ist eine Klasse, kein Einzelfall.** Wer einen findet,
  prüft denselben Test über den ganzen Bestand, bevor er weitergeht. Der Test
  steht seitdem als `japanMap.winding()` im Bestand statt in einem
  Konsolenfenster — er kostet nichts und läuft ohne Kamera, Stufe und Streuung.
- **Eine lebende Referenz für eine Momentaufnahme gehalten.** In P8.11 meldete
  die Stufentabelle auf Ultra 909 338 Dreiecke statt 623 628 — ein halbes
  Budget zu viel. Der Code las `renderer.info.render` in eine Variable und
  benutzte sie *nach* `japanMap.lodHoles()`, und das rendert dreizehn fremde
  Blickpunkte. Die Zahl war die des letzten davon. **`renderer.info.render` ist
  ein Objekt, das three jeden Frame überschreibt** — wer es aufhebt, hebt einen
  Zeiger auf, keinen Wert. Erst kopieren, dann weiterarbeiten.
- **Auf den Namen geprüft statt auf den Wert.** Seit P10.2 gibt es die
  Qualitätsstufe „Eigen": ein Regler ändert ihren **Inhalt**, ohne ihren
  **Namen** zu ändern. Zwei Stellen prüften auf den Namen und hätten jeden
  weiteren Reglerzug verschluckt — `QualitySystem.set()` („gilt schon") und
  `ScatterSystem` (`level === this.#quality`). Das Menü hätte sich bewegt, das
  Bild nicht: exakt die wirkungslosen Regler, die dieses Projekt schon zweimal
  ausgebaut hat (`viewDistance`, `shadowCascades`). `TerrainSystem` hatte es von
  Anfang an richtig — es vergleicht seine Gitterweite, nicht die Stufe.
  Nachsatz mit eigener Falle: der Vergleichswert muss der zuletzt **angewandte**
  sein. `QUALITY.custom` ist ein Getter auf den aktuellen Zustand; ein
  Vorher/Nachher darüber vergleicht zweimal dasselbe und meldet immer
  „unverändert".
- **Eine CSS-Eigenschaft geschrieben und nicht nachgesehen, ob sie gilt.** Der
  Hinweiskasten „Klick ins Bild" trug `pointer-events: none`, weil der Klick dem
  Canvas darunter gehört. Der berechnete Wert stand trotzdem auf `auto`: die
  Regel `#overlay > *` darüber trägt einen **ID-Selektor** und schlägt jede
  Klassenregel. Ausgerechnet der Kasten mit der Aufschrift „Klick ins Bild"
  hätte den Klick verschluckt, den er verlangt. Im Bild wäre nichts zu sehen
  gewesen — der Kasten sah richtig aus, er verhielt sich falsch. Gefunden hat es
  ein `getComputedStyle` im laufenden Stand. **Wo Verhalten an einer
  CSS-Eigenschaft hängt, wird der berechnete Wert geprüft, nicht der
  geschriebene.**
- **Ein Befund, der reproduzierbar, isoliert und bildbelegt war — und trotzdem
  der Maschine gehörte, nicht dem Projekt.** In P11.0 rendert die gesamte
  Vegetation im `postFx: 'off'`-Pfad als flache, himmelsfarbene Fläche. Der
  Befund war so sauber, wie ein Befund nur sein kann: frisch geladene Seite,
  isoliert auf ein einziges Feld (`full`/`reduced`/`lean` grün, `off` weiß),
  Gegenprobe mit getauschter Kette, Bilder dazu. Er wurde als „echter Fehler,
  kein Kompromiss" berichtet.
  **Auf einer echten GPU steht die Vegetation grün.** Es war der
  Software-Rasterisierer dieser Maschine (ANGLE / Microsoft Basic Render
  Driver): der Composer-Pfad schreibt am Ende jedes Pixel über einen
  Vollbild-Durchgang neu und verdeckt das, der `off`-Pfad geht direkt in den
  Canvas.
  Vorher waren **sieben** Vermutungen gemessen und widerlegt worden —
  Tonemapping, gesättigte Werte/NaN, Alphakanal, Nebel, Imposter-Atlas,
  Umgebungskarte, planare Spiegelung, Himmelskuppel. Alle sieben umsonst.
  Drei Lehren:
  1. **Was den Befund verraten hat, war die Fehlerform, nicht die Ursache.** Die
     hellen Flächen überdeckten *auch das Gelände*, ihre Ränder schnitten *quer
     durch einzelne Bäume*, und der Anteil **schwankte zwischen
     aufeinanderfolgenden Frames** desselben eingeschwungenen Zustands
     (38,4…45,2 %). Ein Shading-Fehler ist stabil und objektgebunden. Wer eine
     Ursache sucht, prüft **zuerst**, ob der Fehler überhaupt die Form hat, die
     zu seiner Klasse gehört.
  2. **Diese Maschine kann `postFx: 'off'` nicht messen.** Jede Aussage über den
     Renderpfad ohne Composer braucht die GPU-Maschine — so, wie es für GPU-ms
     und Bildrate längst dasteht. Das ist eine dritte Zeile in derselben Spalte.
  3. **Zwei Minuten Fremdprüfung schlagen zwei Stunden Eigendiagnose.** Die Frage
     „schau bitte einmal hin" hätte an jeder Stelle der sieben Messungen gestellt
     werden können.
- **Eine richtige Gleichung, explizit integriert — und das Modell erzeugt
  Energie.** Das Fahrmodell aus P14 führte Längs- und Quergeschwindigkeit im
  mitrotierenden Fahrzeugsystem fort und trug die Zentripetalterme nach
  (`v̇_long = ΣFx/m + ω·v_lat`). Die Gleichung stimmt. Mit explizitem Euler
  stimmt sie nicht: die beiden Terme sind eine **Drehung** des
  Geschwindigkeitsvektors um `ω·dt`, und explizit integriert wird daraus ihre
  **Tangente** — um `√(1+(ω·dt)²)` länger. Bei 60 Hz und ω = 15 rad/s sind das
  3 % je Schritt, das Sechsfache je Sekunde. Gemessen: ein Drift bei 93 km/h
  stand nach 2,75 s bei **1622 km/h**.
  **An der Bahn war nichts zu sehen** — das Auto fuhr. Aufgefallen ist es nur,
  weil eine Messreihe das Tempo mitschrieb. Zwei Lehren: wer in einem
  **rotierenden** Bezugssystem integriert, muss die Drehung als Drehung
  behandeln und nicht als Beschleunigung (hier gelöst, indem der Zustand in
  Weltkoordinaten wanderte — dort gibt es den Term gar nicht); und bei allem,
  was Energie hat, gehört **eine Zeitreihe der Energie** zur Prüfung, nicht nur
  ein Blick auf das Ergebnis.
- **Ein Fehler, den keine Kennzahl meldet, weil keine Kennzahl die Frage
  stellt.** Seit P3 laufen die Leitplanken der Hauptstrecken durchgehend — auch
  quer über die Mündung jeder abzweigenden Straße. Gemessen: **67 von 1608
  Plankenpunkten (4,2 %) stehen auf einer Fahrbahn**, 43 auf dem Ring, 20 auf
  dem Bergpass, 4 auf der Zufahrt. Im Bild ist das eine Planke, die eine Straße
  absperrt; ein halbes Jahr lang hat es niemand gesehen, **weil niemand gefahren
  ist**. Gefunden hat es der erste Messlauf des Fahrmodus: der Prüfstand kam auf
  der Zufahrt 48 m weit und hing dann 3081 von 3600 Schritten fest.
  Dieselbe Klasse wie die rückseitig gewickelten Flächen aus P8.11. Lehre: **eine
  neue Nutzungsart ist ein Prüfstand für alles, was vorher gebaut wurde.** Wer
  eine baut, sollte damit rechnen, dass sie Altes findet — und die Zeit dafür
  einplanen.
- **Ein Prüfstand, der den Zustand misst, den er selbst versäumt hat
  herzustellen.** Die Standhöhen des Fahrzeugs kamen durchweg als exakt
  −6,00 cm heraus — genau `ROAD_MESH.surfaceOffset`, also der Wert für „die
  Höhenkorrektur ist null". Der Prüfstand setzte das Auto ab, ohne vorher den
  Straßenzusammenhang zu bilden, den der Betrieb je Schritt bildet. Die Zahl war
  reproduzierbar, plausibel und falsch.
  Das ist die Umkehrung des P13-Falls (dort setzte ein Prüfstand `menu.hidden`
  von Hand und übersprang `#render()`). **Beide Male war die Ursache derselbe
  Satz:** ein von Hand gesetzter Zustand ist ein Zustand, den es im Betrieb nicht
  gibt. Ein Verdachtsmoment war da und wurde fast überlesen — *exakt* −6,00 cm
  auf **allen acht** Strecken ist kein Messergebnis, das ist eine Konstante.
- **Alles war richtig, und das Auto hatte keine Räder.** Draw-Calls, Instanzzahl,
  Instanzmatrizen, Position: alle vier Werte stimmten. Im Bild war die Karosserie
  ein Kasten ohne Räder. Ursache: das Blech nahm die **Kollisionsbreite**
  (1,62 m), die Spurweite ist 1,48 m, ein Rad 0,21 m breit — die Radaußenkante
  lag 3,5 cm außerhalb der Blechkante, und von hinten deckte der Stoßfänger den
  Rest. Gesehen hat es das **erste Bild**, das je vom Fahrzeug gemacht wurde.
  Reihung in dieselbe Liste wie die vier Fälle aus P6: wenn etwas nicht im Bild
  ist, fragt man nicht die Zahlen. Neu ist hier nur, dass das Ding *sichtbar*
  war — nur eben ohne den Teil, der es zum Auto macht.
- **Zwei Bilder von zwei Standpunkten verglichen und die Kamera gemessen.** Der
  erste Versuch, die Kosten des Fahrzeugs zu beziffern, ergab **+52 Draw-Calls
  und +165 672 Dreiecke**. Das Fahrzeug hat 2 Meshes. Ursache: „mit Auto" stand
  hinter dem Auto (Verfolgerkamera), „ohne Auto" am Blickpunkt `stadt-neon` —
  zwei Bilder, zwei Orte. Richtig gemessen (Kamera steht, nur `visible`
  umgeschaltet): **+4 Draw-Calls, +1024 Dreiecke**, und die 4 statt 2 sind der
  Spiegeldurchgang. Der Merksatz steht seit P5 in dieser Datei und war trotzdem
  wieder fällig: **ein Vorher/Nachher an zwei verschiedenen Stellen misst die
  Kamera statt die Änderung.**
- **Eine Zeit von außen gemessen — und den eigenen Aufruf mitgemessen.** Die
  Frage war, wie lange der gebaute Stand bis zum „Starten"-Knopf braucht;
  CrazyGames lässt dafür 20 s zu. Gemessen wurde mit einer Schleife in der
  Browser-Konsole, die alle 50 ms nachsah, ob der Knopf da ist, und beim ersten
  Treffer `performance.now()` ablas. Ergebnis: **8,61 s**.
  Der Knopf stand längst. Die Schleife hat gemessen, **wann jemand hingesehen
  hat** — der Aufruf über das Werkzeug kam erst 8,6 s nach dem Laden an. Der
  richtige Wert ist **0,9 s** und stand die ganze Zeit in der Konsole: der
  Ladebildschirm schreibt seine eigene Dauer seit P13.
  Teurer als die Zahl war die **Schlussfolgerung**, die schon in SPEC §4.1
  stand: „Zeit bis zum Spielen ist die Zeile, die Sorgen macht — nicht der
  Download." Genau umgekehrt.
  Zwei Regeln: **wer eine Zeit misst, muss den Startpunkt besitzen** — eine
  Messung von außen enthält immer die Latenz des Beobachters. Und: **erst
  nachsehen, ob die Anwendung die Zahl schon führt.** Sie tat es, an genau der
  Stelle, an der sie entsteht.

- **Am Ergebnis eingehängt statt an der Eingabe.** Die planare Spiegelung
  überschrieb zuerst `reflectedLight.indirectSpecular` — also den bereits mit
  der Fresnel-Gewichtung multiplizierten Wert — mit der **rohen**
  Szenenhelligkeit. Ergebnis: eine überflutete Straße, und zwar auch noch bei
  einer Stärke von 0,25. Richtig ist die Stelle, an der three die
  Umgebungskarte einsetzt; alles Weitere macht dann dieselbe BRDF. Wer einen
  Wert in eine fremde Beleuchtungskette schiebt, muss wissen, **welche
  Multiplikationen dahinter noch kommen**.
