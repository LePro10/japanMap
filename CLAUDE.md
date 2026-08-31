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

**Das Fahr-HUD und der Ton sind seit P16 Teil der Oberfläche — und beide sind
so zu prüfen wie alles unter `src/ui/`, nämlich strukturell.** Zwei Fallen, die
beim Messen Zeit kosten:

- **Das HUD aktualisiert nicht, während es versteckt ist.** `DriveHud.update()`
  kehrt bei `!visible` sofort zurück. Ein Tacho, der „stehenbleibt", ist deshalb
  meist ein offenes Pausenmenü und keine kaputte Anzeige — erst
  `document.querySelector('.hud').hidden` ansehen, dann suchen.
- **Der Ton braucht eine echte Nutzergeste.** Ein `element.click()` aus der
  Konsole ist keine; der `AudioContext` bleibt dann `suspended`, und es kommt
  nichts. `AudioSystem.armAutoUnlock()` fängt die nächste **echte** Geste ab.
  Ob der Ton *gut klingt*, ist hier grundsätzlich nicht messbar — das ist eine
  Frage für einen Menschen mit Kopfhörern, so wie „fährt sich der Drift gut".

```js
// Fahrmodus ohne Tastatur und ohne Pointer Lock — der Weg, den ein Telefon geht:
document.querySelector('[data-touch="drive"]').click();
// Und dann das Fahrzeug fragen, nicht das DOM:
const drive = japanMap.engine.systems.find(s => s.name === 'DriveSystem');
drive.vehicle.telemetry.speed * 3.6;   // km/h
```

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
| 🚗-Knopf / Menüzeile „Auto fahren" | **Der Weg ins Auto ohne Tastatur (P16).** Auf Touch der einzige — `V` verlangt einen Pointer Lock, den kein Telefon gibt, und `japanMap` fehlt im Build. Beide Wege schalten denselben Zustand und melden über `drive:mode` |
| `japanMap.driveProbe()` | **Der Messstand des Fahrmodus (P14).** Fährt jede Strecke ab und schreibt Durchdringung, Spurlage, Tempo und CPU je Schritt mit; dazu Standhöhe und Höhendifferenz Sampler ↔ Mittellinie. Läuft **ohne zu rendern** — 3600 Schritte in ~50 ms |
| `node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/fleet.mts` | **Der Fahrzeug-Prüfstand (P18).** Alle vier Fahrzeuge durch dieselben acht Proben, ohne Browser. Siehe unten |
| `node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/offroad.mts` | **Der Trenntest für den rauen Hang (P26).** Fährt Wellenlänge × Epsilon durch und beantwortet die eine Frage, an der `hill.mts` einmal einen Fehlalarm ausgelöst hat: gehört ein Einbruch dem Fahrzeug oder der Abtastung des Prüfstands |
| `node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/hill.mts` | **Der Steigungs-Prüfstand (P21).** Fahrzeug × Belag × Steigung, und neben jeder Zelle steht, **welche** der vier Ursachen greift (Traktion, Wand, Blech, Flattern). Der Grenzwinkel wird geschlossen ausgerechnet — die einzige Zahl im Projekt, die ohne einen Simulationsschritt entsteht |
| `node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/world.mts` | **Der Prüfstand für Gelände und Kollision (P19/P20).** Felswand, Baum, Innenecke, Planke, Landung, Kosten — dazu seit P20 **Hang** (steckt das Blech im Berg?) und **Zufallsgelände** (90 s gewürfelt, geprüft werden Zusicherungen statt Zahlen). Die Schicht, die `fleet.mts` auf seinem idealen Boden ausdrücklich *nicht* sieht |
| `node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/arcade.mts` | **Der Prüfstand des Arcade-Modells (P22).** Handbremsdrift, Gasstoß im Bogen, Gegenlenken, Nitro, Belagsvergleich — und die Probe **„Drift ohne Absicht"**, die als einzige fragt, ob ein Drift *ausbleibt*, wenn niemand ihn will. Sie hat die erste Fassung des Modells gestoppt |
| `node tools/smoke.mjs [url]` | **Die Rauchprobe (P23).** Lädt die Seite in Chromium, drückt „Play" und prüft: Bild vollständig, Fahrmodus fährt, Lenkung monoton, Schanzen heben ab, Rennen läuft, HUD steht, Menü trägt Veranstaltungen — **und liest die Konsole mit**. Braucht `npm i --no-save playwright-core` und einen laufenden Dev-Server |
| `node tools/find-ramps.mjs` | **Schanzenplätze suchen (P24).** Liest Höhenfeld und Straßennetz und findet Stellen mit geradem Anlauf, tragfähigem Fundament und freier Landefläche. Vier von fünf handgesetzten Koordinaten waren unbrauchbar |
| `parts.material.color.setScalar(k)` | **Den Pegel eines Partikeleffekts im Lauf verstellen (P25).** `Fahrpartikel` ist ein `MeshBasicMaterial`; seine `color` multipliziert die Instanzfarbe. Damit lassen sich drei Helligkeiten in **einem** Browserlauf fotografieren, ohne die Datei anzufassen und ohne drei Neustarts |

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

Referenzwerte auf diesem Boden (Stand **P17**, 2026-08-19): 0–100 km/h in
**4,85 s**, Endtempo nach 60 s **256 km/h**, seitlicher Versatz **0,00 m**,
Gierwinkel **0,000°**. Das Tempo muss beim Ausrollen monoton fallen — steigt es,
ist der Energiefehler zurück.

> Ausnahme, die **kein** Energiefehler ist: der **erste** Schritt nach dem
> Gaswegnehmen steigt um 6,2 · 10⁻⁴ m/s. Der Wert ist vor P17 derselbe (6,15 ·
> 10⁻⁴), stammt also nicht aus der neuen Kennlinie, und mit 0,04 m/s² ist er drei
> Größenordnungen von dem entfernt, was 2026-08-18 aus 93 km/h 1622 km/h gemacht
> hat. Wer prüft, prüft auf **anhaltendes** Wachstum.

**Zwei Proben, die jede für sich eine ganze Fehlerklasse abdecken.** Beide haben
in P14.5 Fehler gefunden, die acht grüne Abnahmezahlen nicht gezeigt hatten:

```js
// 1. Lenkrichtung — muss spiegelsymmetrisch sein, sonst stimmt eine Achse nicht.
//    Versatz im Anfangs-Fahrzeugsystem: rechts = (−cos ψ₀, 0, sin ψ₀).
//    Geprüft wird die **Symmetrie**, nicht der Betrag: 5 s Vollgas, dann 3 s
//    Volleinschlag. Gemessen richtig: steer +1 → +40,65 m, steer −1 → −40,65 m.

// 2. Gierstabilität — 0,3 s Lenkimpuls, dann Lenkrad loslassen.
//    Der Schwimmwinkel muss abklingen. Gemessen (P17): Spitze 19,2°, nach 3 s
//    0,2°. Pendelt er oder wächst er, ist die Abstimmung instabil —
//    die Bedingung dafür ist `b·C_hinten > a·C_vorn` mit `C = 2 μ F_z / α_peak`,
//    und die rechnet man aus, statt sie zu erfahren.
```

> **Die Beträge beider Proben sind mit P17 andere geworden, ihre Aussage nicht.**
> P14.5 maß 8,73 m Versatz und 0,7° Spitze — an einer Kennlinie, die bei jedem
> Schräglauf über 0° schon 75 % ihrer Kraft lieferte und deshalb kaum Winkel
> zuließ. Die neuen Werte (40,65 m, 19,2°) sind nicht „schlechter": das Auto
> lenkt und rutscht jetzt überhaupt. Geprüft wird bei Probe 1 die **Symmetrie**
> und bei Probe 2 das **Abklingen** — beide Kriterien sind unverändert erfüllt.

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
- **Drei Vorzeichen in einer Kette, und alle Abnahmezahlen waren grün.** Der
  Fahrmodus aus P14 bestand acht Abnahmekriterien — null Durchdringung, 0,00 cm
  Standhöhe, Spurlage unter 3 m, Läufe zeichengleich reproduzierbar — und war
  trotzdem unfahrbar. Der Auftraggeber fuhr eine Runde und sagte in einem Satz,
  was keine Messung gezeigt hatte: „Lenkung ist verkehrt, Physik ist schlecht, im
  Dreck unspielbar."
  Dahinter steckten **drei unabhängige Vorzeichenfehler** in derselben Kette:
  1. `#right` war mit `(cos, 0, −sin)` besetzt — das ist bei `forward = +Z` die
     **linke** Seite. Rechtshändig gilt `right = forward × up = (−cos, 0, sin)`.
  2. Das Giermoment stand als `a·F_v − b·F_h` da statt als `−(a·F_v − b·F_h)`;
     aus `(r × F)_y` folgt für eine Kraft nach rechts ein **negatives** Moment.
  3. Die Querbewegung der Achsen (`ω × r`) hatte an beiden Achsen das falsche
     Vorzeichen — die Reifen **verstärkten** damit jede Drehung, statt sie zu
     dämpfen. Gemessen auf ebenem Asphalt, Lenkung null, ohne Kontakt: die
     Gierrate wuchs monoton von −0,14 auf −2,48 rad/s in 0,4 s.
  Die ersten beiden hoben sich gegenseitig auf — deshalb *fuhr* das Auto und
  lenkte nur verkehrt herum. Der dritte lag darunter und wurde durch die
  Reparatur der ersten beiden erst sichtbar.
  Drei Lehren:
  1. **Eine Achse ist kein Name, sondern ein Kreuzprodukt.** Wer `right` schreibt,
     rechnet `forward × up` aus — einmal — und nicht, was bei Gierwinkel 0
     plausibel aussieht.
  2. **Wo ein Vorzeichen aus einer Konvention folgt, gehört die Rechnung in den
     Kommentar.** Alle drei Stellen tragen jetzt die Herleitung; ohne sie ist beim
     nächsten Achsentausch dieselbe Kette wieder fällig.
  3. **Ein Prüfstand, der „bestanden" meldet, hat nur das geprüft, wonach er
     fragt.** In `driveProbe.ts` stand von Anfang an „Was dieser Prüfstand nicht
     kann: aussagen, ob es sich gut anfühlt". Das war richtig aufgeschrieben und
     trotzdem nicht ernst genug genommen: **eine offene Abnahmezeile ist kein
     Restrisiko, sondern ein Loch in der Abnahme.**
- **Ein Fahrwerk, das gierinstabil ist, und niemand hat die Bedingung
  ausgerechnet.** Dieselbe Phase, unabhängig von den Vorzeichen: die
  Reifenabstimmung (Scheitel 8,0° vorn / 9,2° hinten) verletzte die
  Stabilitätsbedingung des Einspurmodells `b·C_h > a·C_v` — auf Asphalt mit
  Reserve **0,89**, im Gelände mit **0,74**. Ein solcher Wagen dreht sich bei
  jeder Störung von selbst aus der Fahrtrichtung. Obendrein sättigte damit die
  **Vorderachse zuerst**, es war also nicht einmal das Drift-Setup, als das es im
  Kommentar stand. Mit 9,2° / 6,9° und `rearGripFactor` 1,08 liegt die Reserve bei
  1,44 bzw. 1,19, und das Heck bricht zuerst aus.
  Lehre: **für ein Fahrmodell gibt es eine geschlossene Stabilitätsbedingung —
  sie kostet fünf Zeilen Rechnung und beantwortet, was sonst zwanzig Testfahrten
  nicht klären.**
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

- **Ein fertiges System hinter einem fehlenden Knopf.** Der Fahrmodus aus P14 —
  sechs Dateien, rund 110 KB — war auf einem Telefon **über alle drei Wege
  unerreichbar**: `DriveSystem.#onKeyDown` steigt ohne Pointer Lock aus (auf
  Touch gibt es nie einen), `window.japanMap` ist im Auslieferungsbau entfernt,
  und einen Knopf gab es nicht. Der Stick war dabei längst verdrahtet; es fehlte
  allein der Umschalter.
  Keine Kennzahl hat das gemeldet, weil keine die Frage stellte. P14 trug sogar
  die Zeile „auf einem Telefon nicht geprüft" — die meinte aber das
  **Fahrgefühl**, nicht die **Erreichbarkeit**. Lehre: eine offene Abnahmezeile
  deckt genau das ab, was sie sagt. Wer „auf Gerät X nicht geprüft" schreibt,
  sollte dazuschreiben, ob das Ding auf Gerät X überhaupt *aufrufbar* ist.
- **Eine neue Nutzungsart findet Altes — zum zweiten Mal.** Derselbe Satz stand
  schon nach P14 hier (die Leitplanken quer über jede Straßenmündung). In P16
  hat der neu erreichbare Fahrmodus auf Touch einen Fehler in
  `FreeFlyController.#onPointerDown` freigelegt: der forderte bei **jedem**
  `pointerdown` den Pointer Lock an, auch bei einer Berührung. Auf iOS wirft das
  (die Methode fehlt dort, und `?.` sichert nur das Canvas gegen `null`, nicht
  die Methode gegen ihr Fehlen), auf Android wird abgelehnt — und die Ablehnung
  reißt über `PlayerUi` das Pausenmenü auf.
  Gemessen: während einer Fahrt mit dem Stick ging das Menü **bei Frame 101**
  von selbst auf, reproduzierbar. Das Auto kam dadurch nur auf 20,5 km/h statt
  49,1. **Das Fahrmodell sah dabei wie das Problem aus und war es nicht.**
  `PlayerUi` hatte dieselbe Stelle in P12.4 bereits richtig abgesichert —
  `FreeFlyController` war die übersehene zweite. Wieder: **ein Fehlerbild ist
  eine Klasse, kein Einzelfall.**
- **Eine Anzeige, die nicht aktualisiert, weil sie versteckt ist — und wie das
  nach einem Fehler aussieht.** Beim Messen des HUD stand der Tacho auf „10",
  während das Fahrzeug 14,2 km/h fuhr. Das sah nach einer kaputten Anzeige aus.
  Ursache war das offene Pausenmenü: `DriveHud` überspringt seine
  Aktualisierung, solange es versteckt ist (das spart Layout je Frame und ist
  richtig so). **Erst prüfen, in welchem Zustand gemessen wird**, bevor eine
  Abweichung ein Fehler heißt — sonst repariert man eine Anzeige, die stimmt.
- **Der richtige Wert an der falschen Stelle — zweimal in derselben Funktion.**
  P17 hat das Fahrmodell fahrbar gemacht, und die beiden Fehler dahinter waren
  keine falschen Zahlen, sondern falsch **angewandte**:
  1. `TIRE.tailGrip = 0,75` sollte den Abfall der Kennlinie *hinter* dem
     Scheitel abfangen. Geschrieben war es als Klemme auf den **Betrag** des
     Funktionswerts — und der ist auch am **Anfang** klein. Ergebnis: der Reifen
     lieferte bei 0,01° Schräglauf bereits 75 % seiner Höchstkraft. Eine
     Sprungfunktion statt eines Anstiegs.
  2. `TIRE.minSpinGrip = 0,8` sollte der Hinterachse bei durchdrehenden Rädern
     Seitenführung lassen. Geschrieben war es als Faktor auf das **Ergebnis** von
     `tireLateral` — also *nachdem* der Reibkreis die Kraft schon auf null
     geklemmt hatte. `0 · 0,8 = 0`.
  Beide trugen ausführliche Kommentare mit Messreihen, und beide Begründungen
  waren in sich schlüssig. Nachgemessen: derselbe Geländelauf mit
  `minSpinGrip` 0,80 / 0,55 / 0,25 / 0,00 endet **auf vier Nachkommastellen an
  derselben Stelle**. Es war die dritte tote Stellschraube dieses Projekts nach
  `viewDistance` und `shadowCascades` — und die erste mit einer erfundenen
  Messung daneben.
  Was die Fehler kosteten, in Zahlen: die Reifenkraft wechselte bei ruhiger
  Geradeausfahrt in **295 von 300 Schritten** ihr Vorzeichen; die Lenkantwort war
  **nicht monoton** (Lenkeingabe 0,50 → 29,0 °/s, Lenkeingabe 1,00 → 25,1 °/s);
  auf der Wiese kam der Wagen bei Vollgas und Lenkung null nach 10 s auf
  **11,7 km/h bei 89,4° Schwimmwinkel**. Genau die drei Sätze des Auftraggebers
  („schwer zu steuern", „im Dreck unspielbar").
  Drei Lehren:
  1. **Eine Klemme auf einen Betrag trifft beide Enden des Wertebereichs.**
     Gemeint war ein Abschnitt — und ein Abschnitt gehört über seine
     **Variable** abgegrenzt, nicht über den Funktionswert.
  2. **Eine Kennlinie wird tabelliert, bevor man ihr glaubt.** Siebzehn Zeilen
     Ausgabe über `f(α)` hätten beide Fehler in einem Schritt gezeigt. Das ist
     derselbe Satz wie „Mittelwerte verstecken Formen", nur eine Ebene tiefer:
     hier war nicht einmal die Form angesehen worden.
  3. **Ein Regler, dessen Wirkung nie gemessen wurde, ist keine Einstellung,
     sondern eine Behauptung.** Der Test kostet einen Lauf: Wert verdoppeln,
     Wert auf null, Endzustand vergleichen. Sind die Zahlen gleich, ist der
     Regler tot — egal, wie gut der Kommentar klingt.
- **Eine Herleitung, die still falsch wurde, weil sich eine andere Zahl
  bewegte.** `DRIVETRAIN.maxDriveForce = 7200` trug die Rechnung „liegt 8,6 %
  über der Haftgrenze der Hinterachse, also kann man die Räder durchdrehen
  lassen". Die Rechnung setzt `rearGripFactor = 1` voraus. Als der Faktor in
  P14.5 aus einem Stabilitätsgrund auf 1,08 stieg, wurde aus den +8,6 % ein
  Minus — unter Lastverlagerung beim Beschleunigen lag die Haftgrenze bei rund
  8800 N gegen 7200 N Antrieb. **Gasstoß-Übersteuern war damit rechnerisch
  unmöglich**, und niemand hat es gemerkt, weil die kaputte Kennlinie ohnehin
  jede Drift-Frage überdeckte. Lehre: wer eine Zahl ändert, sucht die
  **Herleitungen**, die sie zitieren. Ein Kommentar, der rechnet, ist eine
  Abhängigkeit wie ein Import.
- **Ein Rad, das nie am Auto hing.** `#sampleWheels` setzte die Radmitte auf
  `Bodenhöhe + Radradius` — unabhängig davon, wo das Fahrzeug war. Beim Sprung
  blieben die vier Räder am Boden liegen und die Karosserie flog allein weiter.
  Ein halbes Jahr lang unbemerkt, **weil vor P16 niemand mit dem Auto gesprungen
  ist**: derselbe Satz wie bei den Leitplanken quer über jede Straßenmündung und
  dem Pointer-Lock in `FreeFlyController` — *eine neue Nutzungsart ist ein
  Prüfstand für alles, was vorher gebaut wurde*, jetzt zum dritten Mal.
  Die Räder folgten obendrein nur dem **Gierwinkel** und ließen Nicken und Wanken
  aus. Beide Hälften sind dieselbe Ursache: die Radstellung wurde aus dem
  **Boden** abgeleitet statt aus dem **Aufbau**.

---

## Das Fahrmodell ohne Browser messen — P18

Seit P18 gibt es `tools/bench/`. Es führt **denselben** `Vehicle`-Code aus, den
das Spiel fährt — über einen Auflöser-Hook, der `@/…` und Importe ohne Endung auf
die Platte abbildet. Eine zweite, für den Prüfstand abgeschriebene Physik wäre
wertlos: sie misst dann sich selbst.

```bash
node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/fleet.mts
```

`fleet.mts` fährt **alle vier Fahrzeuge** durch dieselben acht Proben und gibt
eine Tabelle aus. Das ist der Punkt: die Zahlen einer Spec sagen für sich
genommen nichts, erst der Vergleich sagt, ob ein Lastwagen sich wie ein
Lastwagen verhält. Ein voller Lauf dauert rund zwei Minuten.

Die Proben, und wofür jede da ist:

| Probe | findet |
|---|---|
| 0–100, Endtempo, Bremsweg | falsche Antriebs- und Widerstandszahlen |
| Geradeauslauf, Lenksymmetrie | Vorzeichenfehler in den Achsen (die P14-Klasse) |
| Ausrollen, monoton fallend | Energieerzeugung durch den Integrator (die P14-Klasse) |
| **Lastwechsel im Bogen** | Gierinstabilität, die kein anderer Lauf zeigt |
| Durchdrehen Anfahrt / Bogen | ob die Kernanforderung „Heck bricht aus" überhaupt erfüllbar ist |
| Lenkantwort über der Eingabe | Untersteuern und tote Bereiche |
| Stabilitätsreserve `b·C_h / (a·C_v)` | gerechnet, kein Lauf nötig |

Drei Fallen, alle in P18 einmal zugeschlagen:

1. **Die Gasrampe gehört abgewartet.** Ein Ausrolltest, der direkt nach
   `throttle: 0` misst, sieht das Auto noch beschleunigen — `throttleRate` braucht
   15 Schritte. Der erste Lauf meldete deshalb „11 Anstiege, Energiefehler". Es
   war keiner.
2. **Ein Lenktest ohne Tempohaltung misst das Tempo.** Mehr Lenkeinschlag heißt
   mehr Querbeschleunigung heißt weniger Tempo, und die Gierrate ist `a_lat/v`.
   `fleet.mts` regelt das Tempo, bevor es die Gierrate abliest.
3. **Eine fallende Lenkantwort ist nicht automatisch ein Fehler.** Die größte
   stationäre Gierrate ist `a_lat/v` mit `a_lat ≤ μ·g`; jenseits davon **muss**
   mehr Lenkung weniger Gierrate bringen. Geprüft wird deshalb der **Abfall in
   Prozent** hinter der Spitze (Grenze 15 %), nicht Monotonie.

**Was der Prüfstand nicht kann**, und das steht auch in `fleet.mts`: sagen, ob
sich etwas gut anfühlt, und sagen, ob ein Fahrzeug durch die Kehren des Bergpasses
passt. Das erste ist eine Frage für einen Menschen, das zweite für
`japanMap.driveProbe()` im laufenden Bild — und das gehört bei jeder Änderung am
Fahrmodell **für alle vier Fahrzeuge** gefahren, nicht nur für das, das gerade
eingestellt ist.

### Zwei Werkzeuge daneben

```bash
node tools/bench/surfcolor.mjs                       # Mittelwerte der Belagstexturen
node tools/bench/imgdiff.mjs a.png b.png diff.png    # Differenzbild, 8× verstärkt
node tools/bench/contrast.mjs a.png b.png            # Helligkeitsverhältnis auf der Änderung
```

`imgdiff.mjs` ist die Antwort auf „**Wer eine Differenz misst, sieht sie sich
an**" weiter oben. Eine Prozentzahl sagt *wie viel*, nicht *wo*; das Werkzeug
schreibt beides und nennt zusätzlich das Rechteck, in dem sich etwas geändert
hat.

---

## Ein Bild vom Fahrzeug oder von der Fahrbahn machen — die drei Stolpersteine

Alle drei haben in P18 Zeit gekostet, und keiner davon steht im Code.

1. **`japanMap.shot()` tickt die Schleife**, bevor es liest (`readFrame` ruft
   `target.tick()`). Der Fahrmodus setzt dabei die Kamera über `ChaseCamera` neu
   — jede von Hand gesetzte Kamerastellung ist danach weg. Der Weg, der wirkt:

   ```js
   const echt = drive.camera.update.bind(drive.camera);
   drive.camera.update = () => {};          // Verfolgerkamera stilllegen
   japanMap.view({ position: [x, y + 20, z], lookAt: [x, y, z - 3] });
   await japanMap.shot('name');
   drive.camera.update = echt;
   ```

   `engine.systems.splice()` hilft **nicht** — die Schleife iteriert nicht über
   diese Liste.

   > **Der Block darüber stand bis P26 mit `camera.position.set()` und
   > `camera.lookAt()` da, und das war zur Hälfte falsch.** Die Verfolgerkamera
   > stillzulegen reicht nicht: der `FreeFlyController` baut die Ausrichtung in
   > **jedem** Frame aus seinem eigenen `#yaw`/`#pitch` neu auf. Die
   > **Position** bleibt deshalb stehen, die **Blickrichtung** wird
   > überschrieben. Gemessen 2026-08-31 an einer Laterne der Driftzone, um die
   > Aufnahme herum abgelesen:
   >
   > ```
   > vor  dem shot: dir = ( 0.991,  0.043,  0.130)   <- gesetzt
   > nach dem shot: dir = (-0.604, -0.087, -0.792)   <- Controller
   > ```
   >
   > Das Bild zeigte am Fadenkreuz Boden statt der Laterne, obwohl die Laterne
   > gemessen genau dort stand, wo sie hingerechnet war. Die Aufnahmen sahen
   > dabei nicht kaputt aus — nur eben in eine andere Richtung, und
   > **jedes** von Hand gezielte Bild einer ganzen Sitzung war so entstanden.
   >
   > Der Weg, der wirkt, ist der, den das Projekt selbst anbietet:
   > `japanMap.view({position, lookAt})` geht über `CameraPlacer.placeAt()`,
   > und das rechnet Gieren und Nicken **zurück** — genau mit der Begründung,
   > die dort im Kommentar steht („eine gesetzte Quaternion wäre nach einem
   > Frame wieder weg"). Die Antwort lag also seit P6 im Bestand.
   >
   > Lehre, und es ist die vierte Auflage desselben Satzes nach P13
   > (`menu.hidden` von Hand), P14 (Standhöhe ohne Straßenkontext) und P21
   > (`respawn` nullt die Lage): **ein von Hand gesetzter Zustand ist ein
   > Zustand, den es im Betrieb nicht gibt.** Neu ist hier nur der Zusatz —
   > wenn ein System einen Zustand jeden Frame aus *seinen* Variablen neu
   > aufbaut, muss man diese Variablen setzen und nicht das Ergebnis. Wer eine
   > Kamera von Hand stellt, prüft danach `camera.matrixWorld`, statt dem
   > Aufruf zu glauben.

2. **Driftspuren altern zwischen zwei Werkzeugaufrufen weg.** `VehicleFx` läuft im
   **variablen** Schritt mit bis zu 50 ms je Frame, und zwischen zwei
   `javascript_exec` vergehen Sekunden Echtzeit. Die ersten Aufnahmen zeigten
   fast nichts, obwohl 32 Spuren „lebten": `aFade` stand bei 0,01…0,11 statt
   1,00. **Erzeugen und Fotografieren müssen in einem Aufruf passieren.** Und wer
   auf Tempo bringen will, ohne dabei zu altern, nimmt `drive.simulateStep()` —
   das rechnet nur Physik.

3. **Ein rotes Drahtgewirr auf der Fahrbahn ist die `Bodenmarkierung`**, nicht der
   Fehler, den man gerade sucht. Sie ist eine Debug-Kugel des `TerrainSystem`
   (Farbe `0xff4d6d`, Drahtgitter), klebt unter der Kamera auf `getHeightAt()` und
   sieht von oben aus wie ein Knäuel. Vor jeder Bodenaufnahme ausschalten:
   `scene.getObjectByName('Bodenmarkierung').material.visible = false`.

> **Und `material.visible` ist der Schalter, der hält.** `mesh.visible` setzt
> `VehicleFx.update()` in jedem Frame neu; ein von Hand gesetztes `false` ist nach
> dem nächsten Tick wieder `true`. `material.visible` fasst niemand an.

---

## Was in diesem Projekt schon schiefgegangen ist — Nachträge aus P18

- **Eine Optimierung, die das Ding unsichtbar macht, und keine einzige
  Fehlermeldung.** Die neue Sparmaßnahme in `VehicleFx.#ageSkids` steigt bei
  `#skidLive === 0` sofort aus — und `#skidLive` wurde **nur dort** gebildet.
  Einmal auf null, für immer auf null; `#writeSkids` schaltete das Mesh dann
  unsichtbar, obwohl Stempel gesetzt wurden. Gemessen: **32 lebende
  Alterungswerte, `count` 0, `visible` false.** Kein Typfehler, keine Ausnahme,
  kein Konsoleneintrag, `typecheck` und `build` sauber.
  Lehre: **wer einen Zähler mit einem Frühausstieg schützt, muss prüfen, wer ihn
  wieder hochzählt.** Und: eine Sparmaßnahme am Bild ist erst geprüft, wenn danach
  ein Bild gemacht wurde — nicht, wenn der Compiler schweigt.

- **Ein Kommentar, der rechnet, ist eine Abhängigkeit wie ein Import — zum
  zweiten Mal.** Nach `DRIVETRAIN.maxDriveForce` in P17 (die Herleitung zitierte
  `rearGripFactor = 1`, das inzwischen 1,08 war) jetzt dieselbe Konstante noch
  einmal: „liegt 8,6 % über der Haftgrenze der Hinterachse" ließ die
  **Lastverlagerung** weg. Mit ihr braucht es 9088 N statt 6627, und 7200 lagen
  16,1 % darunter statt 8,6 % darüber. Die Kernanforderung des Fahrmodells war
  damit rechnerisch unerfüllbar, und drei Jahre Kommentar darüber sagten das
  Gegenteil.
  Lehre: **eine Herleitung im Kommentar gehört in den Prüfstand.** `fleet.mts`
  rechnet die Durchdrehgrenze jetzt selbst aus und stellt sie neben den gemessenen
  Durchdrehfaktor — beide in derselben Zeile, jeden Lauf neu.

- **Eine Reparatur, die eine neue Instabilität einführt, und der Prüfstand hatte
  die Probe dafür nicht.** Die Motorbremse (physikalisch an der richtigen Stelle,
  Betrag realistisch) machte das Auto beim Lastwechsel im Bogen unfahrbar: 89,7°
  Schwimmwinkel, und er blieb dort. Acht grüne Abnahmezahlen — Beschleunigung,
  Bremsweg, Symmetrie, Ausrollen, Gierstabilität, Durchdrehen, Lenkantwort,
  Geradeauslauf — meldeten nichts, weil **keine von ihnen das Gas wegnimmt,
  während der Wagen im Bogen steht**.
  Lehre: dieselbe wie nach P14 („ein Prüfstand, der ‚bestanden' meldet, hat nur
  das geprüft, wonach er fragt"), nur diesmal beim Bauen bemerkt. Die Probe
  `Lastwechsel im Bogen` steht seitdem im Prüfstand, und sie hat unmittelbar
  danach einen **zweiten**, unabhängigen Fehler gefunden: der Offroader war mit
  seiner ursprünglichen Reifenabstimmung ebenfalls nicht zu halten.

- **Modulkonstanten, die aus den Maßen eines Fahrzeugs gerechnet sind.** Bei der
  Umstellung auf vier Fahrzeuge waren sieben davon in `Vehicle.ts`
  (`SPRING_REST`, `WHEEL_MAX_DROP`, `MAX_YAW_RATE`, …). Wären sie stehen
  geblieben, führe der Lastwagen mit der Federruhelage des Coupés — 58 cm im
  Boden — und **keine Kennzahl hätte das gemeldet**, weil das Auto ja fährt.
  Lehre: **wer eine Konstante parametriert, sucht zuerst die Konstanten, die aus
  ihr gerechnet sind.** `grep` auf den Namen findet die Verwendungen; die
  Ableitungen findet man nur, indem man die Datei liest.

---

## Gelände und Kollision ohne Browser messen — P19

`fleet.mts` fährt auf einem **idealen** Boden und isoliert damit das Fahrmodell.
Genau deshalb hat es die Fehler aus P19 nie gesehen: die lagen eine Schicht
darunter. Dafür gibt es den zweiten Prüfstand:

```bash
node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/world.mts
```

Sechs Proben über alle vier Fahrzeuge, rund 20 s. Er baut ein synthetisches
Gelände (Felswand, Ebene) und eine `CollisionWorld` von Hand — echte Karte
braucht er nicht, und die Proben sind dadurch reproduzierbar bis auf die letzte
Stelle.

| Probe | findet |
|---|---|
| Felswand 55°, absetzen und loslassen | ein Auto, das an einer Wand klebt |
| Baum auf der Fahrlinie, drei seitliche Versätze | Lücken zwischen Prüfpunkten |
| Innenecke, hinein und rückwärts heraus | Klemmen in einer Ecke |
| Planke im Streifschuss | Durchschlagen **und** Festkleben |
| Fall aus 6 m | Ratschen nach oben, Einsinken nach der Landung |
| Kosten je Schritt, mit gegen ohne Kollision | was die Auflösung wirklich kostet |

**Was er nicht kann**, und das steht auch in der Datei: sagen, ob es sich gut
anfühlt, und die echte Karte prüfen. Für Letzteres bleibt `japanMap.driveProbe()`
im laufenden Bild zuständig — und das gehört nach jedem Eingriff in die
Kollision **für alle vier Fahrzeuge** gefahren.

---

## Was in diesem Projekt schon schiefgegangen ist — Nachträge aus P19

- **Eine Klemme, die das Gegenteil dessen verbot, was sie sollte.** Der
  Wandzweig von `resolveTerrainFollow` setzte `vy = 0` in jedem Schritt, mit dem
  Kommentar „damit aus einem Clip kein Skilift wird". Gemeint war: *nicht die
  Wand hochklettern*. Getan hat die Zeile: *nicht herunterfallen*. Ein Auto, das
  einmal an einer Felswand hing, hing für immer — und genau das stand auf dem
  Bild, mit dem P19 gemeldet wurde.
  Gemessen fiel das Coupé in acht Sekunden **2,00 m**, und diese zwei Meter
  waren nicht einmal ein Fall: es ist exakt `UNSUPPORTED_DROP` aus der
  Stützebene. Eine Zahl, die auf den Zentimeter genau einer Konstanten
  entspricht, ist nie ein Messergebnis — derselbe Verdachtsmoment wie bei den
  exakt −6,00 cm Standhöhe in P14, und wieder wäre er fast überlesen worden.
  Lehre: **eine Klemme auf einen Zustand trifft beide Vorzeichen.** Wer einen
  Anteil meint, grenzt ihn über seine **Richtung** ab — hier über die Zerlegung
  in die Hangebene. Das ist dieselbe Lehre wie bei `TIRE.tailGrip` in P17
  („eine Klemme auf einen Betrag trifft beide Enden des Wertebereichs"), nur
  eine Ebene höher.

- **Vier Prüfpunkte für eine 4,2 m lange Karosserie.** Die Kollision prüfte an
  den vier Ecken mit je 34 cm Radius. Zwischen Vorder- und Hinterecke liegen
  über vier Meter, und alles, was dort hineinpasst, wurde **nicht gesehen**:
  ein Stamm mit 40 cm Radius genau auf der Fahrlinie ergab in fünfzehn Sekunden
  **null Kontakte**. Das Auto fuhr durch den Baum hindurch; streifte eine Ecke
  ihn doch, warf die gemittelte Auflösung es **zwölf Meter rückwärts**.
  Der Kommentar daneben begründete die vier Punkte ausdrücklich („warum nicht
  ein Rechteck: eine spitze Ecke hakt an jeder Kante") — und diese Begründung
  war falsch: das SAT liefert die Richtung mit der **kleinsten** Überdeckung,
  und die ist an einer Wand die Wandnormale. Eine hakende Ecke kann dabei gar
  nicht entstehen.
  Lehre: **eine Abtastung ist erst dann eine Form, wenn ihr Abstand kleiner ist
  als das Kleinste, was sie treffen soll.** Und: ein Kommentar, der eine
  Alternative ausschließt, gehört genauso gemessen wie eine Zahl.

- **Ein Reibungswert, der in Wahrheit eine Zeitschrittgröße war.**
  `wallFriction = 0,12` stand als „Anteil der Tangentialgeschwindigkeit je
  Kontakt" da, mit der Rechnung „ein Streifschuss über 20 m kostet rund ein
  Viertel des Tempos". Die stimmte, solange nur gelegentlich ein Eckpunkt anlag.
  Mit dem Rechteck liegt das Blech in **jedem** Schritt an, und derselbe Faktor
  ist 0,88^60 je Sekunde — also 0,0004. Gemessen klebte das Coupé mit **10,3
  km/h** bei Vollgas an der Planke.
  Lehre: **ein Wert, dessen Wirkung von der Abtastrate abhängt, ist keine
  Materialgröße.** Reibung gehört an den **Impuls** (`|J_t| ≤ μ·|J_n|`), nicht
  an den Frame. Und: wer die Abtastung ändert, muss jede Zahl suchen, die
  stillschweigend an ihr hing — dieselbe Regel wie „ein Kommentar, der rechnet,
  ist eine Abhängigkeit wie ein Import", nur dass hier nicht einmal ein
  Kommentar davon wusste.

- **Ein Lastwagen, der dauerhaft im Boden stand — und fuhr.** Nach einer harten
  Landung federte er 0,74 m ein (die Federkraft ist auf 3 · m · g gedeckelt, und
  das ist richtig so). `supportReach` reicht aber nur 0,50 m: `reachableSupport`
  erklärte damit seine **eigenen Räder für unerreichbar**, gab
  `expected − UNSUPPORTED_DROP` zurück, die Federkraft wurde null, und er fiel
  bis auf den Bodenfang durch. Ruhelage **0,26 m statt 1,10 m**, dauerhaft.
  Keine einzige Kennzahl hat es gemeldet: er fuhr, er lenkte, er bremste.
  Gefunden hat es eine Probe, die schlicht **die Ruhelage abliest** — und die
  gab es vorher nicht, weil niemand auf die Idee kam, dass ein Auto nach einer
  Landung woanders steht als davor.
  Lehre: **wenn zwei Größen dieselbe Strecke begrenzen, muss die eine die andere
  kennen.** Hier begrenzt der Kraftdeckel den Einfederweg, und die Stützreichweite
  wusste nichts davon. Die Reparatur ist eine geometrische Schranke („ein Rad
  kann nicht durch den Kotflügel"), keine größere Reichweite — eine größere
  Reichweite hätte die 40-m-Felswand wieder tragen lassen.

- **Ein Bild hat den Fehler in einer Sekunde gezeigt, den keine Zahl hatte.**
  Der neue Partikel-Atlas legt vier Formen als 2 × 2 in eine Textur; ein
  Instanzattribut wählt das Feld. Three dreht eine Textur beim Hochladen
  senkrecht um (`flipY`), und damit war die Zuordnung **paarweise vertauscht**:
  aus jedem Wasserspritzer wurde eine **fünfblättrige Blüte** — das Korn-Feld,
  dessen Rand mit `sin(5φ)` moduliert ist.
  Jede Zahl stimmte: 420 lebende Instanzen, Wassertiefe 0,30 m, 46 km/h, voller
  Frame (`anteilNichtSchwarz` = 0,9993). Kein Typfehler, keine Ausnahme, kein
  Konsoleneintrag.
  Lehre: die bekannte Fehlerform aus dieser Liste, diesmal andersherum — **es
  war im Bild, nur als etwas anderes.** Ein Atlas ohne Bildprobe ist eine
  Behauptung über eine Reihenfolge.

- **Am erstbesten plausiblen Regler gedreht, und der falsche war es.** Im ersten
  Wasserbild lag ein weißer Teppich über der halben unteren Bildhälfte. Die
  naheliegende Ursache war der neue Dunst — also wurde er von 0,26 auf 0,12
  Deckkraft und von 15 auf 5 Partikeln je Sekunde heruntergedreht.
  Der Teppich war die **Kielwelle der Reisfelder**. Isoliert mit
  `tools/bench/imgdiff.mjs`: Welle an gegen aus **44,7 % der Pixel, mittlere
  Differenz 29,6**; Partikel an gegen aus **21,8 % und 6,5**. Die Ursache lag um
  den Faktor fünf über dem, was gedimmt worden war — und die Dimmung machte den
  Staub anschließend unsichtbar (mittlere Differenz **2,4**), was einen zweiten
  Lauf gekostet hat.
  Lehre: **erst den Anteil ausschalten, dann messen, dann drehen.** Steht schon
  seit P8.8 in dieser Liste (die Stadt als heller Fleck), und es ist trotzdem
  wieder passiert. Der Unterschied: diesmal hat `imgdiff.mjs` die Frage in einem
  einzigen Lauf beantwortet.

- **Ein Effekt, der aus der Ferne stimmt, stimmt aus der Nähe nicht.** Die
  Kielwelle des Reisfelds übernahm die Geometrie des Meeres unverändert. Auf dem
  Meer steht die Kamera weit weg und der Keil ist ein Strich im Bild; im
  Reisfeld klebt sie sechs Meter hinter dem Auto, und derselbe Keil füllt den
  Vordergrund. Dieselbe Formel, dieselben Zahlen, ein völlig anderes Bild.

- **Backticks in einem GLSL-Kommentar, der in einem Template-Literal steht.**
  Zweimal in derselben Sitzung: ein `` `water_surface.frag.glsl` `` in einem
  Shader-Kommentar beendet das Template-Literal, und der Dev-Server antwortet
  mit **HTTP 500** statt mit einer Anwendung. Im Browser sieht das aus wie
  nichts — `window.japanMap` fehlt, die Seite bleibt leer. Die Spur steht im
  **Server**-Log, genau wie bei der `realpath`-Falle aus P6.
  Lehre: nach **jeder** Änderung an einer Datei mit eingebettetem GLSL erst
  `node node_modules/typescript/bin/tsc --noEmit`, dann messen. Beim ersten Mal
  hat der Typecheck es gefunden, beim zweiten Mal wurde er übersprungen — und
  das hat drei Werkzeugaufrufe gekostet.

- **Der eingebettete Vorschau-Tab wird nach einem `navigate` nicht mehr
  ausgelegt.** `window.innerWidth` steht dann auf **0**, der Canvas ist 0 × 0,
  und `japanMap.shot()` schreibt eine 88-Byte-PNG. `probe()` meldet es
  unmissverständlich (`width: 1, height: 1`), aber nur, wenn man hinsieht.
  Der Weg, der wirkt: `engine.resize(1280, 720)` von Hand — **nicht**
  `renderer.setSize`, das lässt Composer und Kamera stehen und rendert schwarz.

- **Die Frameschleife von Hand zu treiben bewegt die Physik nicht.**
  `loop.tick()` liest `performance.now()`; in einer engen JS-Schleife ist `dt`
  praktisch null, der Akkumulator füllt sich nie, und kein einziger fester
  Schritt läuft. Für die Streuung genügt das (sie arbeitet je Frame), für alles
  Zeitabhängige nicht. Der Weg, der wirkt, ist die Schleife der Engine von Hand
  nachzubilden:

  ```js
  const dt = 1 / 60;
  for (let i = 0; i < 220; i++) { drive.simulateStep(dt, EINGABE); drive.update(dt); }
  ```

  `simulateStep` ist die Physik, `update` die Darstellung (Kamera **und** FX) —
  und nur wer beide interleavt aufruft, misst, was das Spiel zeigt.

- **Ein Prüfstand, der nicht wippt, findet die Klemme nicht — und ein Prüfstand,
  der wippt, ist kein Prüfstand.** Der Fahrmodus-Messstand fährt mit einem
  Regler: Gas, Bremse, Lenkung nach Sollkurs. Ein Spieler, der feststeckt, wippt
  vor und zurück. Am Tempelaufgang klemmt das Coupé zwischen zwei Steinlaternen
  (Lücke 4,33 m, Auto 4,32 m); mit Wippen kommt es in 15 s frei, der Messstand
  meldet dieselbe Stelle als unbefahrbar. **Beide Aussagen sind richtig**, und
  sie gehören beide in die Doku — die eine sagt etwas über die Spielbarkeit, die
  andere über die Karte.

- **Vier Anläufe an einer Heuristik, und jeder scheiterte an einer anderen
  falschen Annahme.** Der Klemmschutz sollte einen festsitzenden Wagen
  freischieben. Der Reihe nach angenommen und gemessen widerlegt:
  *Restdurchdringung* (es gibt keine, 0,0006 m), *gegenläufige Normalen im selben
  Schritt* (gibt es nicht — vorn **oder** hinten, nie beides), *Zähler bei
  kontaktfreien Schritten zurücksetzen* (Kontakt nur in jedem zehnten Schritt,
  der Zähler lief netto rückwärts), *Tempo als Abbruch* (die Hilfe hob das Tempo
  über die Schwelle und schaltete sich selbst ab).
  Lehre: **bei einer Heuristik ist die Abbruchbedingung so wichtig wie die
  Auslösebedingung** — und beide gehören gemessen, nicht plausibel gefunden. Was
  am Ende trägt, ist die Größe, die der Fahrer auch sieht: **ist er von der
  Stelle gekommen.**

- **Eine Trennhilfe, die einen Baum durchbricht.** Dieselbe Heuristik hat, kaum
  dass sie griff, den Prüfstand woanders rot gemacht: der Wagen schob sich nach
  1,5 s Vollgas an einem Stamm vorbei, den er respektieren muss. Die Bedingung
  fehlte, dass er aus **zwei entgegengesetzten Richtungen** blockiert sein muss —
  wer nur eine Wand vor sich hat, kommt rückwärts weg und ist nicht gefangen.
  Lehre: dieselbe wie bei `removeSpurs` in P3 („eine Stufe repariert, eine
  Anforderung zerstört"). Wer eine Hilfe einbaut, prüft, **was sie sonst noch
  trifft** — und zwar im selben Lauf.

---

## Was in diesem Projekt schon schiefgegangen ist — Nachträge aus P20

- **Die Karosserie kannte das Gelände nicht — und keine Kennzahl konnte es
  melden, weil es keine gab.** Bis P20 prüfte das Fahrzeug das Höhenfeld an fünf
  Punkten: vier Räder und der Schwerpunkt. Der Aufbau ist 4,0 bis 7,6 m lang.
  Gemessen bei Vollgas gegen einen Hang, tiefstes Eintauchen der Blechunterkante:
  **0,78 m auf einem befahrbaren 20°-Hang**, 4,45 m auf 65°. Dabei war
  `lastPenetration` 0, `contacts` 0, `airborne` false, die Standhöhe richtig.
  Der Wagen *fuhr*.
  Das ist die Umkehrung der vier Fälle aus P6 („alle Zahlen stimmen, im Bild ist
  nichts"): hier war es **im Bild und in keiner Zahl**. Lehre: wenn ein Bild
  etwas zeigt, wofür es keine Kennzahl gibt, ist das Fehlen der Kennzahl der
  erste Befund. Die Zahl heißt jetzt `telemetry.hullDepth`.

- **Vier Grenzzyklen in Folge, und alle vier hatten dieselbe Wurzel.** Die neue
  Hüllkollision war schnell geschrieben; was danach kam, war die eigentliche
  Arbeit. Der Reihe nach gemessen:
  1. Ein Lastwagen, den ein 8-mm-Streifkontakt 18 cm über seine Ruhelage hob —
     Federung ausgefedert, Radlast null, **kein Antrieb**, 15 s lang 0,0 km/h.
  2. Der Deckel dagegen, unbedingt gesetzt, zog drei Fahrzeuge im Flug auf
     **y = −582 m** (im Flug liegt die Stützebene 1,8 m *unter* dem Wagen).
  3. Die Geschwindigkeit senkrecht abzuweisen verdreifachte die Zeit ohne
     Radlast (49,8 % gegen 17,8 % ohne Hülle).
  4. Ein Auto, das nur auf seinem Stoßfänger auf einer 3-m-Kante lag, **schwebte
     dort 2,91 m über dem Boden** — dieses Modell kann nicht kippen.
  Die Wurzel ist ein Satz: **den Aufbau trägt die Federung, nicht das Blech.**
  Senkrecht gehört der Feder, waagerecht dem Blech; wer beide dieselbe Achse
  regeln lässt, bekommt zwei Systeme, die gegeneinander arbeiten.

- **Eine Datei hieß seit P14 `supportPlane.ts` und hatte keine Ebene.** Die
  Federreichweite wurde gegen eine **waagerechte** Ebene geprüft. Auf 20 %
  Steigung liegen die Vorderräder `halber Radstand · tanθ` über dem
  Schwerpunktsniveau — beim Coupé 0,44 m gegen 0,54 m Reichweite. Ein Stück
  Lastverlagerung, und die ganze Vorderachse galt als unerreichbar: Stützhöhe
  gedeckelt, Federkraft null, `airborne`, kein Antrieb. Gemessen: 344 von 900
  Schritten in der Luft auf einer 20°-Rampe.
  Der Fehler war zwei Phasen lang unsichtbar, weil die Straßen dieser Karte
  höchstens 10,7 % steigen. Erst das Gelände hat ihn gezeigt. Lehre: **ein
  Bezugssystem, das auf der Karte nie schräg wird, ist nicht geprüft, sondern
  ungenutzt.**

- **Der Prüfstand war grün und die Karte nicht.** Nach der Reparatur meldete
  `tools/bench/world.mts` alle Proben grün. Auf der echten Karte blieb der GT auf
  dem **Bergpass** nach 95 m stehen — auf Asphalt, null Hinderniskontakte,
  Vollgas, für den Rest des Laufs. Ursache: die Fahrbahn ist dort um **0,98 m auf
  1,96 m Breite verwunden**, und die Hülle stieß dagegen.
  Zwei Lehren. Erstens: ein synthetischer Prüfstand prüft, was jemand gebaut hat
  — die Karte prüft, was **entstanden** ist. Beide Läufe gehören zu einer
  Abnahme, und der auf der Karte ist der, der zuletzt kommt.
  Zweitens: **die Fahrbahn ist keine gemessene Fläche, sondern eine gerechnete.**
  Ihre Höhe mischt Sampler, Mittellinie, Plateaus und Wasserspiegel. Ein Blech,
  das dagegen stößt, stößt gegen eine Rechnung. Die Räder fahren auf allem, die
  Karosserie kollidiert nur mit `gelaende`.

- **Eine Klemme trifft beide Vorzeichen — zum vierten Mal.** Nach `TIRE.tailGrip`
  (P17, Klemme auf einen Betrag), dem Wandzweig (P19, `vy = 0` verbot das Fallen)
  und der `vy`-Klemme in `blockIntoSurface` (P20, verbot das Absetzen) jetzt der
  Standhöhendeckel der Hülle. Vier Fälle, ein Muster: **wer einen Abschnitt
  meint, grenzt ihn über seine Richtung ab, nicht über seinen Betrag.**

- **In der Luft war der Aufbau waagerecht, egal über welchem Hang.**
  `reachableWheel` bildet ein unerreichbares Rad auf `expected` ab; im Flug sind
  alle vier unerreichbar, alle Differenzen werden null, und die Lage zielt auf
  0°. Solange Nicken reine Optik war, ein Schönheitsfehler. Seit die Karosserie
  gegen das Gelände prüft, ein Fahrfehler: die Nase klappte am Übergang einer
  20°-Rampe binnen 0,3 s von −15,9° auf −5,6° und grub sich 0,42 m in den Hang.
  Die Lage stehen zu lassen war der naheliegende Ersatz und ist **gemessen
  schlechter** (Heck 1,16 m unter der Oberfläche, 6,3 s lang). Sie folgt jetzt
  der Flächennormalen darunter. Lehre: **eine kosmetische Größe hört auf,
  kosmetisch zu sein, sobald jemand sie ausliest.**

---

## Zufallsgelände statt Nachbau — was in P20 dazugekommen ist

Alle Proben dieses Projekts bilden eine Lage nach, die schon einmal schiefging.
Das ist richtig und findet **Rückfälle**. Es findet keine neuen Fälle.

`terrainFuzz` in `tools/bench/world.mts` macht es andersherum: 90 Sekunden
gewürfeltes Gelände (sechs Sinuslagen, bis 48° steil) und gewürfelte Eingaben,
fester Seed, und geprüft werden **Zusicherungen** statt Zahlen —

- das Blech steckt nicht im Berg (kurz und **gehalten**, getrennt gemessen: ein
  Streifen im Landeanflug ist kein Steckenbleiben),
- der Wagen kommt bei Gas von der Stelle (schlechtestes 4-s-Fenster),
- die Höhe bleibt in der Nähe des Geländes,
- keine NaN.

Sie hat in P20 zwei Fehler gefunden, die keine der sechs nachgebauten Proben
gezeigt hat. Wer eine neue Fehlerklasse vermutet, aber keinen Fall dafür hat,
baut so eine Probe und nicht noch einen Nachbau.

---

## Das Fahrmodell ist seit P22 ein Arcade-Modell — was das für Messungen heißt

**Das Einspurmodell aus P14…P21 gibt es nicht mehr.** Getauscht ist ausschließlich
die waagerechte Ebene (Gieren, Längs- und Quergeschwindigkeit); Federung,
Stützebene, Blech gegen Gelände, Kollision und Klemmschutz laufen unverändert
weiter. Wer wissen will, was P22 geändert hat, liest `src/game/arcadeDynamics.ts`
und sonst nichts.

Drei Folgen für jede Messung am Fahrverhalten:

- **`TIRE` in `vehicle.config.ts` wird nicht mehr gelesen.** Die Spec steht dort
  weiter, samt aller Herleitungen und Messreihen — sie ist die vollständige
  Beschreibung dessen, was ein Fahrzeug an Reifen *hätte*, und zwei der drei
  teuersten Fehler dieses Projekts sind Fehler jener Funktionen gewesen. Wer
  heute am Grip dreht, dreht an `ARCADE[…].latG` und `latGrip`.
- **Ein Drift ist ein Zustand, keine Folge.** `telemetry.drift` ist das, was der
  Spieler *anfordert* (Handbremse, Gas in der Kurve), `telemetry.skid` das, was
  dabei herauskommt. Wer die Wertung misst, meint das eine; wer die Spuren
  misst, das andere.
- **Die Gierrate wird gesetzt und nicht integriert.** Ein Vorzeichenfehler in
  einer Achse kann sich damit nicht mehr über „Schräglauf → Seitenkraft →
  Giermoment" fortpflanzen — die ganze Fehlerklasse aus P14 ist weg. Dafür ist
  die Lenkung nur so gut wie ihre Kennlinie: **tabellieren, bevor man ihr
  glaubt.** Genau daran sind zwei Fassungen gescheitert.

**Die Rauchprobe ist neu und sollte vor jeder Abnahme laufen.**

```bash
node node_modules/vite/bin/vite.js --port 5180 --strictPort &
node tools/smoke.mjs          # gegen den Dev-Server
```

Sie ersetzt keinen Prüfstand — sie beantwortet die Frage davor: *läuft die
Seite überhaupt.* Die drei teuersten Fehler dieses Projekts (der `realpath`-Fall
aus P6, die Backticks im GLSL-Kommentar aus P19, der abgeschaltete Pass aus P8.2)
standen **ausschließlich in der Browser-Konsole**, und die liest sie mit.

> **Sie läuft auf einem Software-Rasterisierer** (`--use-angle=swiftshader`).
> Jede Aussage über Bildrate oder GPU-Zeit wäre daraus wertlos — dieselbe
> Verwechslung, die in P11 sieben Messungen gekostet hat.

---

## Was in diesem Projekt schon schiefgegangen ist — Nachträge aus P22…P24

- **Der eigene Prüfstand hatte den Befund seit P18 im Klartext, und niemand hat
  ihn gelesen.** Die Beschwerde lautete „die Physik ist grausam", und in der
  Ausgabe von `fleet.mts` stand:
  `Lenkantwort 90 km/h: 21.8 27.3 26.2 26.3 25.7 °/s (Lenkung 0,2…1,0)`.
  Zwischen einem Fünftel und vollem Ausschlag liegen **3,9 °/s** — die Lenkung
  war ein Schalter, und zwar genau im Tempobereich des Spiels. Daneben:
  `Durchdrehen Bogen 0.88×`, also kein Drift auf Asphalt in einem Drift-Spiel.
  Lehre: **eine Prüfstandsausgabe ist erst gelesen, wenn jemand sie gegen die
  Anforderung hält.** Beide Zeilen waren grün formatiert, weil der Prüfstand
  nach Monotonie hinter der Spitze fragte — und nicht danach, ob die Antwort
  überhaupt mit der Eingabe wächst.

  > **Zum zweiten Mal, P25, und diesmal in der Browser-Konsole.** Bei jedem
  > Laden dieser Karte steht dort seit P5.1:
  > *„PropSystem: „modular_wooden_pier.glb" hat 3 Meshes; nur das erste wird
  > instanziert."* Nachgezählt im glb: 86 / 2061 / 835 Dreiecke — gezeichnet
  > wird das erste, also **2,9 %** des Modells. Der Steg am Hafen ist seit
  > Monaten fast vollständig unsichtbar, und die Meldung dazu lief bei jedem
  > Start durch. Sie ist nicht repariert (Begründung in PLAN.md P25: ein
  > Exemplar auf der ganzen Karte), aber sie ist jetzt **gemessen** — und der
  > Unterschied zwischen „steht in der Konsole" und „jemand hat es gelesen" ist
  > derselbe wie oben.

- **Eine Regelgröße ohne Gleichgewichtspunkt.** Der erste Entwurf des Drifts
  addierte eine feste Gierrate. Im stationären Drift ist die Gierrate aber die
  **Bahnkrümmung**, und die ist durch `a_lat/v` gedeckelt — ein Sollwert
  darüber hat keinen Fixpunkt, der Schwimmwinkel wächst, bis der Wagen rückwärts
  fährt. Gemessen 111 °/s bei 40 km/h. Lehre: **wer eine Größe regelt, rechnet
  ihren Gleichgewichtspunkt aus, bevor er einen Sollwert dafür hinschreibt.**
  Das ist derselbe Satz wie „für ein Fahrmodell gibt es eine geschlossene
  Stabilitätsbedingung" aus P14, nur eine Ebene höher.

- **Dieselbe Sättigung, an anderer Stelle wieder eingebaut.** Die zweite Fassung
  bildete die Soll-Gierrate kinematisch (`ω = v·tanδ/L`) und deckelte sie mit
  der Haftgrenze. Gemessen: schon **20 % Einschlag** erreichten bei 90 km/h die
  Grenze, darüber war die Antwort wieder flach (33,4 °/s über den ganzen Rest).
  Lehre: **ein Deckel ist keine Kennlinie.** Wer eine proportionale Antwort
  will, muss den *Anteil* an dem regeln, was möglich ist — nicht den Absolutwert
  abschneiden.

- **Die Bremse war das Gas.** In einem Modell ohne Gangwahlschalter legt die
  Bremse im Stand den Rückwärtsgang ein, und dabei wird `throttle = brake`. Die
  Halte-Eingabe der KI-Gegner vor dem Start lautete „Bremse voll, Handbremse
  gezogen" — das Feld fuhr den Countdown über **rückwärts** aus der
  Startaufstellung heraus, 5 m neben die Straße und 124° quer dazu. Der Befund
  sah drei Fassungen lang wie ein kaputter Regler aus.
  Lehre: **wenn eine Eingabe zwei Bedeutungen hat, muss die Bedingung dazwischen
  vollständig sein.** „Bremse im Stand" heißt Rückwärtsgang — außer, wenn
  jemand zugleich die Handbremse zieht, denn das heißt *halten*.

- **Eine Runde, die keine war.** Der Fortschritt der Gegner stand als
  `Runde × Streckenlänge + Bogenlänge` da. An der Naht einer geschlossenen
  Strecke springt die Bogenlänge von 6086 auf 0, die Suche pendelt darum herum,
  und jede Pendelung zählte als Runde: AOKI stand nach 60 Sekunden bei
  **7474 m** — 448 km/h. Lehre: **auf einem Kreis ist die Differenz zweier
  Positionen nicht der Weg.** Aufsummieren, was zwischen zwei Schritten liegt,
  und die Differenz vorher auf den kürzesten Weg bringen.

- **Zwei Regelterme, die sich gegenseitig aufheben.** Der KI-Fahrer bekam einen
  Winkelterm (gegen die Straßentangente) und einen Querterm (gegen den Abstand).
  Beide sind für sich richtig — 20 m links der Linie, 67° verdreht, 5 km/h:
  Querterm +1,57, Winkelterm −1,63, Summe **−0,06**. Der Gegner stand
  140 Sekunden im Reisfeld.
  Lehre: **zwei Regler auf dieselbe Stellgröße brauchen eine Aussage darüber,
  wer wann gewinnt.** Nah an der Linie zählt „wie liegt die Straße", weit daneben
  „wo ist die Straße"; geblendet wird der **Bezugswinkel** und nicht ein dritter
  Term addiert.

- **Ein Tempolimit, das nur Kurven kennt, kennt die halbe Strecke nicht.** Die
  Ideallinie deckelte das Tempo über die waagerechte Krümmung. Bei 108 km/h über
  eine **gerade** Kuppe hob der Wagen ab und landete 13 m neben der Fahrbahn.
  Die senkrechte Krümmung war nie gerechnet worden. Lehre: eine Strecke hat zwei
  Krümmungen, und für die zweite gibt es eine ebenso geschlossene Grenze —
  `v²·|κ_v| ≤ g`.

- **Eine Auflage auf einem erodierten Boden ist keine Schanze.** Der erste
  Entwurf addierte die Schanzenform auf das Höhenfeld. Damit macht sie jede
  Welle ihres Untergrunds mit, und ein 24 m langes Stück Straßenböschung mit
  weniger als 1,2 m Höhenband gibt es auf dieser Karte fast nirgends: das
  Suchwerkzeug fand auf **11 km Straße genau einen** brauchbaren Platz. Lehre:
  **ein Bauwerk steht auf einem Fundament.** Eine absolute Fläche über einer
  einmal gemessenen Fußhöhe ist robust gegen alles, was darunter passiert.

- **Vier von fünf handgesetzten Koordinaten waren unbrauchbar — und keine davon
  sah beim Hinschreiben falsch aus.** `temple-hop`: 7,22 s Flugzeit, weil die
  Anfahrt an einer Klippe endet. `coast-kicker`: 0,02 s bei +21 m Höhe, weil
  die Anfahrt bergauf geht. Lehre: **eine Koordinate auf einer erodierten
  9,4-km²-Karte ist eine Behauptung.** Erst ein Lauf macht eine Messung daraus —
  und wenn man fünf davon braucht, schreibt man das Werkzeug.

- **Die flachste Stelle der Karte war ein geflutetes Reisfeld.** Der Rasterlauf
  für die Driftzone suchte nach dem kleinsten Höhenband und fand (−1020 | −20)
  mit **1,7 m auf 140 m Durchmesser**. Flach war dort das Wasser. Gefunden hat
  es ein **Bild**, keine Zahl — und zwar sofort.
  Lehre: dieselbe wie seit P4, und sie gilt für Koordinaten genauso wie für
  Pixel: **zwei Zahlen beschreiben einen Ort nicht.** Wer einen Platz aussucht,
  sieht ihn sich an.

- **900 additive Partikel sind eine Lampe.** Die fallenden Kirschblüten waren
  im ersten Entwurf additiv gemischt; überlagert addieren sie sich auf Weiß, und
  der Bloom der PostFX-Kette macht daraus zwei Scheinwerfer mitten in der
  Landschaft. Jede Zahl stimmte — 900 Instanzen, ein Draw-Call,
  `anteilNichtSchwarz` 1,000. Lehre: die bekannte Form aus dieser Liste
  („es war im Bild, nur als etwas anderes"), diesmal in zwei Minuten gefunden,
  weil ein Bild zur Abnahme gehörte.

- **Ein Prüfstand, der seine Anfahrt nicht besitzt.** Die erste Fassung der
  Schanzenprobe setzte das Auto 150 m *in Luftlinie* vor die Kante und gab
  Vollgas. Auf einer gekrümmten Straße führt das quer durchs Gelände, und die
  Probe maß dann die Böschung statt die Schanze. Dritter Fall dieser Klasse nach
  den exakt −6,00 cm Standhöhe (P14) und dem von Hand gesetzten `menu.hidden`
  (P13): **eine Messung, die ihren Anfangszustand nicht herstellt, misst sich
  selbst.**

---

## Erst die Ursachen trennen, dann messen — die Lehre aus P21

P20 hat an einem **Symptom** gemessen („das Blech steckt im Berg") und es
behoben. Die Beschwerde blieb, weil ein Hang, der nicht befahrbar ist, **vier**
Ursachen haben kann, die im Spiel identisch aussehen:

| Ursache | woran man sie erkennt |
|---|---|
| **Traktion** | der gerechnete Grenzwinkel ist überschritten — Physik, kein Fehler |
| **Wand** | `STEEP_NY`, Radlast schlagartig null |
| **Blech** | die Karosserie sitzt auf |
| **Flattern** | die Federung verliert immer wieder den Boden |

`tools/bench/hill.mts` schreibt neben jede Zelle, welche greift, und rechnet den
Grenzwinkel **geschlossen** aus:

```
sinθ ≤ Σ_Achse μ_Achse · Lastanteil · Antriebsanteil
```

Erst damit ist eine rote Zelle entscheidbar: reparieren oder nicht. Ohne diese
Trennung hätte P21 wieder am erstbesten Regler gedreht — derselbe Fehler wie „die
Stadt als heller Fleck" (P8.8) und „der weiße Teppich war die Kielwelle" (P19),
nur eine Ebene höher: dort war die **Ursache** unklar, hier die **Fehlerklasse**.

**Merksatz: wenn eine Beschwerde nach zwei Reparaturen bleibt, ist nicht die
Reparatur falsch, sondern die Klasseneinteilung fehlt.**

---

## Was in diesem Projekt schon schiefgegangen ist — Nachträge aus P21

- **`respawn` setzte Nick und Wank auf null — und das trifft ausgerechnet die
  Rettungswege.** Auf einem Hang stand der Wagen für die Einschwingzeit (~0,3 s)
  waagerecht auf einer schiefen Ebene; gemessen grub sich das Heck dabei auf 20°
  **0,369 m** und auf 30° **0,664 m** in den Boden. Betroffen ist jedes
  Absetzen: Taste `R`, Einsteigen, Fahrzeugwechsel — und die Klemmwache aus P20,
  also genau der Weg, der einen festgefahrenen Wagen befreien soll.
  Zwei Lehren. Erstens: **ein Anfangszustand ist ein Zustand und gehört
  hergestellt, nicht genullt.** Zweitens, und die ist teurer: der Prüfstand hat
  diese Zahlen als „Aufsitzen" gemeldet, und es war der erste Zehntelsekunde-
  Zustand seines eigenen Laufs. Eine Messung, die sich ihren Anfangszustand
  kaputtsetzt, misst sich selbst — dieselbe Klasse wie die exakt −6,00 cm
  Standhöhe in P14 und das von Hand gesetzte `menu.hidden` in P13.

- **Dieselbe Funktion, zweiter Fehler: die Höhe kam vom Boden unter dem
  Schwerpunkt.** Der Aufbau steht auf **vier Rädern**. Gemessen bei
  (−1328 | −517) lagen die auf 76,43…76,86 m, der Boden unter dem Schwerpunkt auf
  76,87 m — **43 cm** Unterschied. Der Wagen wurde beim Absetzen bis in den
  Gummipuffer gedrückt (Einfederung 1,29) und kam nicht mehr weg: 1,3 m in sieben
  Sekunden Vollgas. Lehre: **wer eine Höhe setzt, muss sie aus derselben Größe
  bilden, aus der das Modell sie später liest.**

- **Eine Stütze, die bremsen kann und nicht tragen.** Der Deckel aus P20 verbot
  der Karosserie jeden Schub über die Standhöhe — richtig, sonst hebt sie den
  Wagen von seinen eigenen Rädern. Damit fehlte ihr aber die Hälfte der
  Wirklichkeit: **ein Auto, das über eine Bodenwelle fährt, steigt darüber.**
  Dieses pflügte hindurch, und die Bremse des schleifenden Blechs nahm ihm 95 %
  des Tempos je Sekunde. Gemessen auf der Karte: drei von 53 Stellen fest, alle
  auf 11…14° Hang — weit unter der Traktionsgrenze, ohne einen Kontakt.
  Die Reparatur ist ein Vorzeichenwechsel im Denken: das Blech schiebt den Wagen
  nicht **hoch**, es hebt seine **Stützebene**. Dann trägt ihn die Feder darüber,
  die Radlast bleibt, und die Reifen greifen weiter. Lehre: **wenn eine
  Zusatzkraft mit einem bestehenden System um dieselbe Achse streitet, gehört sie
  in dessen Eingang und nicht neben dessen Ausgang** — derselbe Satz wie bei der
  planaren Spiegelung („am Ergebnis eingehängt statt an der Eingabe").

- **`drive.surface()` von außen abgefragt lügt.** Der Straßenkontext
  (`#roadHalfWidth`, `#roadSurface`, `#roadCorrection`) wird von
  `#refreshRoadContext()` je Schritt für die **Fahrzeugposition** gebildet. Wer
  `surface(x, z)` für einen weit entfernten Punkt aufruft, bekommt die Antwort
  für die Straße, neben der das Auto gerade steht. Ein ganzer Prüflauf („kommt
  der Wagen aus 12 m Entfernung auf die Straße zurück") hat damit Unsinn
  gemessen, bis es auffiel: die Straße selbst meldete sich als `gelaende`.
  Lehre: **eine Abfrage, die einen zwischengespeicherten Kontext liest, ist an
  den Ort gebunden, für den der Kontext gebildet wurde.** Der Weg, der stimmt:
  `placeAt` an die Stelle, *dann* fragen — oder gleich `telemetry.surface` lesen,
  das aus dem Schritt selbst stammt.

- **Ein Schalter mitten im Fahrbereich.** `isSteep` (38,7°) hat die Radlast von
  voll auf null geschaltet: ein Simulationsschritt zwischen voller Kontrolle und
  Rutschen ohne Lenkung, Antrieb und Bremse. Für die **Geometrie** ist ein
  Schalter richtig — eine Fläche ist Boden oder Wand, ein halbes Ausschieben gibt
  es nicht. Für die **Kraft** ist er falsch: Haftung fällt nicht vom Tisch, sie
  läuft aus. Seit P21 sind das zwei getrennte Entscheidungen mit zwei getrennten
  Zahlen (`STEEP_NY` für die Form, `slopeSupport` für die Kraft).
  Lehre: **prüfen, ob eine Konstante zwei Fragen zugleich beantwortet.** Wenn ja,
  beantwortet sie mindestens eine davon falsch.

- **Eine Formel für Allrad, die eine Summe war und ein Minimum sein musste.**
  Der Grenzwinkel des Offroaders stand mit `μ_v·w_v + μ_h·w_h` in der Rechnung —
  das ist die Traktion, die er hätte, wenn sich die Kraft frei zwischen den
  Achsen verschieben ließe. Ein fester Antriebsanteil kann das nicht (steht so
  auch im Code): übertragbar ist `min(gripVorn/s, gripHinten/(1−s))`. Auf
  Asphalt waren das 90,0° statt 59,0°. Gefahren ändert sich nichts — die Zahl war
  nur nie gefahren worden. Lehre: **eine Herleitung, die neben der Messung steht,
  gehört genauso geprüft wie die Messung.**

- **Eine Ausnahme so weit formuliert, wie sie *nicht* begründet war — und eine
  ganze Zone der Karte verloren.** P20 nahm die **Fahrbahn** aus der
  Hüllkollision (eine gerechnete Fläche ist kein Blechhindernis; die Begründung
  steht und gilt). Geschrieben war die Bedingung als `surface !== 'gelaende'` —
  und die trifft zusätzlich `'wasser'`. Darunter liegen die **Terrassenwände der
  Reisfelder**, 2,4…2,8 m hoch, 7,6 % der Karte: für die Karosserie gab es sie
  nicht mehr.
  Gefunden hat es der Zufallslauf, und zwar erst, als er zum ersten Mal über
  **alle vier** Fahrzeuge lief — zwei Phasen lang lief er über zwei.
  Drei Lehren:
  1. **Eine Ausnahme gehört so eng formuliert, wie sie begründet ist.** Begründet
     war „Fahrbahn", geschrieben war „alles außer Gelände". Der Unterschied ist
     eine Zone.
  2. **Ein Zufallslauf ist nur so gut wie die Zahl der Fahrzeuge, über die er
     läuft.** Dieselbe Klasse wie „eine Eigenschaft für *alle* an einem Teil
     geprüft" weiter oben — dort war es die Vegetation, hier die Flotte.
  3. Der Lauf hatte selbst eine Falle: er setzt das Auto an eine gewürfelte
     Stelle, und steht die in einer Wand, misst der erste Meter das **Absetzen**.
     Er lässt seitdem eine Sekunde einschwingen. Dritter Fall dieser Art in
     derselben Phase — siehe die beiden `respawn`-Fehler darüber.

- **Die Physik fuhr nicht auf dem Fahrbahnband, sondern auf dem Gelände plus
  einem Skalar.** `DriveSystem.height()` bildete die Korrektur am nächsten
  Mittellinienpunkt und wandte sie in der ganzen Nachbarschaft an — damit erbt
  die Fahrbahn jede Verwindung des Geländes unter ihr, während das Bild ein
  glattes Band zeigt. Gemessen über 684 Punkte aller acht Strecken: Median 6 cm,
  aber **37 Punkte (5,4 %) über 30 cm** und im Maximum **1,66 m**, geballt in
  einer Kehre des Bergpasses. Dort blieb der GT stehen.
  Seit P21 ist die Sollhöhe eine **Ebene durch den Straßentreffer** mit der
  Längsneigung des Segments. Die Verwindung quer ist damit per Konstruktion
  null — die Fahrbahn ist flach, **weil sie als flach gerechnet wird**, und
  nicht, weil das Gelände zufällig flach ist. Lehre: wo Bild und Physik
  dieselbe Fläche meinen, muss die Physik sie aus derselben Quelle bilden; ein
  Offset auf eine fremde Fläche erbt deren Fehler.

- **Eine Nachbarschaftssuche in XZ ohne Schranke in der Höhe.**
  `WaterField.#inRiver` nimmt den nächsten Flussknoten in XZ und dessen
  Spiegelhöhe. Dieser Fluss hat zwei **Wasserfälle** (11,2 m und 39,7 m), und am
  Kopf des großen war ein Knoten mit 7,5 m Halbbreite für jeden Punkt der
  Felswand 21 m darunter der nächste. Ergebnis: **21,24 m Wassertiefe auf dem
  Bergpass**, 95 m über dem Meer, mitten auf der Fahrbahn. Das Auto schwamm dort.
  Genau das war die Zeile „`toge` meldet 1804,7 cm Standhöhe", die zwei Phasen
  lang als offener Punkt dastand — und sie sah wie ein Fehler der **Straße** aus,
  weil sie an einer Straße gemessen wurde.
  Zwei Lehren: **eine Suche in zwei Dimensionen braucht eine Schranke in der
  dritten**, wenn das Ergebnis dreidimensional gemeint ist. Und: wo eine
  auffällige Zahl gemessen wird, sagt nichts darüber, wo sie **herkommt** —
  hier lagen Ursache und Symptom in verschiedenen Systemen.

- **Ein Messwerkzeug, das seit P18 falsch rechnete und nie auffiel.**
  `measureStandingHeight` nahm `CHASSIS.cgHeight` — die Höhe des **Coupés** —
  für jedes Fahrzeug. Mit dem Offroader wäre jede Standhöhe um 26 cm daneben
  gewesen, still. Der Grund, warum es nie auffiel: das Werkzeug ist nie mit einem
  anderen Fahrzeug gelaufen. Dieselbe Klasse wie die sieben Modulkonstanten aus
  P17 — eine Zahl aus den Maßen **eines** Fahrzeugs, die für alle gilt.
  Lehre: **ein Werkzeug, das eine Flotte messen soll, gehört einmal über die
  ganze Flotte gefahren** — nicht, weil man dort etwas erwartet, sondern weil
  genau dort seine eigenen Annahmen sichtbar werden.

---

## Bevor ein **Bild** repariert wird: nachsehen, ob man es sieht — P21

Ein Fehler im Bild ist erst dann einer, wenn er dort auftaucht, wo jemand
hinsieht. Das klingt selbstverständlich und ist es nicht: P21 hätte beinahe 95 m
Flussband abgeschnitten, um ein schwebendes Becken zu beheben, das aus der
**Vogelperspektive** unübersehbar ist — und von der Straße aus an drei geprüften
Blickpunkten überhaupt nicht vorkommt (der Pass läuft dort im Einschnitt).

Der Prüfweg dauert drei Aufrufe und steht als Muster in P21.8:

1. **Auf Fahrerhöhe stellen**, nicht darüber. Die Verfolgerkamera sitzt 2,35 m
   hoch, die Haubenkamera darunter — ein Bild aus 40 m ist kein Bild aus dem
   Spiel.
2. **Mehrere Standorte**, und zwar die, an denen der Fehler am ehesten zu sehen
   wäre (hier: senkrecht darunter, den Hang hinauf, von oberhalb am Pass).
3. `probe()` mitlesen: `anteilNichtSchwarz` muss 1,000 sein, sonst misst man ein
   beschnittenes Bild (die Falle aus P8.9).

Und wenn er dort nicht vorkommt: **aufschreiben statt reparieren.** Eine
Reparatur, die etwas Sichtbares gegen etwas Unsichtbares eintauscht, ist ein
Rückschritt mit Aufwand.

- **Zusatz aus derselben Phase: eine Reparatur kann teurer sein als der Fehler.**
  Das schwebende Becken gehört in `bake-terrain.mjs`. Es dort anzufassen heißt
  `npm run world`, und die Erosion trägt jede Störung über die ganze Karte
  (gemessen 66,82 % geänderte Texel bei einem Eingriff in **einer** Zone). Die
  Straßen entstehen aus dem Höhenfeld — der Bergpass wäre danach ein anderer, und
  jede Zahl aus P14 bis P21 wäre neu abzulesen. Wer den Aufwand nicht neben den
  Fehler stellt, repariert am Ende die Karte, um ein Pixel zu retten.

---

## Was in diesem Projekt schon schiefgegangen ist — Nachträge aus P25

- **Ein unbeleuchtetes Material schreibt seine Zahl direkt ins Bild — und
  niemand hatte diese Zahl je gegen das Bild gehalten.** `PARTICLES.dustColor`
  stand bei `[0.55, 0.49, 0.4]`, mit dem Kommentar „Staub streut Himmelslicht,
  er leuchtet nicht" daneben. Ein Partikel ist ein `MeshBasicMaterial`: was dort
  steht, ist die fertige Helligkeit, ohne Licht, ohne Schatten, ohne
  Abschwächung. Gemessen an `.cache/shots/drift.png`, linear: Boden neben dem
  Wagen **0,005**, hellster Staubfleck **0,159** — Faktor **31**. Der Staub war
  dreißigmal heller als die Erde, aus der er aufgewirbelt wurde, und ein Drittel
  so hell wie der Himmel.
  Dieselbe Zahl stand zweimal daneben noch einmal: `PetalFall` schrieb
  `uColor = (0.98, 0.78, 0.86)` und `mistColor` `(0.5, 0.58, 0.66)`. Alle drei
  sind Materialien ohne Beleuchtung, alle drei waren nach Gefühl gesetzt.
  Lehre: **wo ein Material seine Farbe unbeleuchtet ins Bild schreibt, ist die
  Zahl eine Bildgröße und keine Materialgröße** — sie gehört gegen einen
  gemessenen Bezugspunkt gesetzt (hier: der besonnte Boden, 0,021), nicht gegen
  eine Vorstellung von „staubfarben". Das ist derselbe Satz wie „ein Wert, dessen
  Wirkung von der Abtastrate abhängt, ist keine Materialgröße" aus P19, nur eine
  Achse weiter.

- **An zwei Reglern gleichzeitig gedreht — und danach war nichts mehr da.** Die
  Korrektur oben setzte die Farbe auf 0,058 **und** halbierte `dustAlpha`,
  zusammen 1/19 des alten Beitrags. Ergebnis: gar keine Fahne mehr, auch nicht
  bei dreifach überhöhter Partikelhelligkeit im Lauf (300 lebende Instanzen,
  null Sichtbarkeit). Ein zweiter Bilderlauf war nötig, nur um zu erfahren,
  welcher der beiden Regler zu weit stand.
  Lehre: dieselbe wie „die Stadt als heller Fleck" (P8.8) und „der weiße Teppich
  war die Kielwelle" (P19) — nur schärfer. **Ein Regler je Messung.** Und wo der
  Beitrag linear ist, rechnet man den neuen Wert aus der einen belastbaren
  Messung aus, statt ihn zu schätzen: `Spitze ≈ 0,159 · (Farbe/0,55) ·
  (Alpha/0,32)`.

- **Ein A/B, dessen Rauschband größer war als sein Signal — und der erste Lauf
  hat das Rauschband gar nicht gemessen.** Um die Fahne zu isolieren, wurden
  zwei Bilder gemacht (Partikelmaterial sichtbar / unsichtbar) und mit
  `tools/bench/imgdiff.mjs` verglichen: **94,1 % geänderte Pixel, mittlere
  Differenz 28,8.** Das ist nicht der Staub, das sind zwei verschiedene Frames —
  zwischen den Aufnahmen lief die Fahrt weiter, die Verfolgerkamera setzte sich
  neu, die Streuung strömte nach.
  Mit stillgelegter Kamera und zwei Aufnahmen unmittelbar hintereinander lag das
  **Rauschband** (dasselbe Bild zweimal) bei **70,8 % / 40,3** und das Signal bei
  **7,2 % / 1,8**. Ein Signal unter dem Rauschband ist keine Messung.
  Lehre: **„erst ein Rauschband messen, dann nur Effekte darüber ernst nehmen"
  (P8.6) gilt auch dann, wenn die Änderung offensichtlich lokal ist.** Und: wenn
  das Rauschband nicht zu drücken ist, misst man die Sache **innerhalb eines
  Bildes** gegen ihre eigene Umgebung — hier Fahne gegen den Boden daneben —
  statt zwei Bilder gegeneinander.

- **Eine Begründung, die für einen Abstand gilt und für alle gelesen wurde.** Im
  Fragment-Shader von `PetalFall` stand: *„ein rosa Fleck von 18 cm ist auf 30 m
  Entfernung zwei Pixel groß, und zwei Pixel brauchen keine Blütenform."* Der
  Satz stimmt — und seine Rechnung setzt 30 m voraus. Blüten fallen über der
  Driftzone, und da fährt man mitten hindurch: auf 2 m ist dasselbe Blatt
  neunzig Pixel breit, und dann steht es als scharfkantiges helles Rechteck im
  Bild, weil es nie eine Alphamaske hatte.
  Lehre: **eine Begründung, die eine Zahl voraussetzt, gehört mit dieser Zahl
  aufgeschrieben — und geprüft, ob sie im ganzen Wertebereich gilt.** Dieselbe
  Klasse wie „eine Eigenschaft für *alle* an einem Teil geprüft" weiter oben, nur
  über die Entfernung statt über die Instanzen.

- **Mehr Geometrie war die halbe Antwort; die andere Hälfte war die Farbe.** Die
  Kirschbaumkronen standen als flache rosa Schilder in der Landschaft. Der
  naheliegende Schluss — drei achsenparallele Kästen sind zu wenig — greift zu
  kurz: diese Karte hat **eine** Tageszeit, und die Sonne steht 2,23° über dem
  Horizont. Zwischen einer waagerechten und einer senkrechten Fläche liegt dann
  kaum ein Helligkeitsunterschied, und wenn alle Flächen dieselbe Farbe tragen,
  gibt es im Bild auch keinen. Erst drei Blütentöne **und** um 20…40° gedrehte
  Lagen ergeben eine Krone; neun achsenparallele Kästen wären aus jeder Richtung
  weiter ein Stapel Rechtecke gewesen.
  Lehre: **in einer Szene mit streifendem Licht muss die Form ihre Tiefe in der
  Farbe mitbringen.** Wer nur Dreiecke nachlegt, bezahlt Budget für ein Bild,
  das sich nicht ändert.

- **Eine Inline-Breite schlägt jede Medienabfrage.** Die Minikarte setzte ihre
  Anzeigegröße in `#resize()` über `style.width`. Auf einem Telefon hätte sie
  damit 168 px behalten, obwohl `style.css` unter `max-width: 720px`
  ausdrücklich 116 px vorschreibt — eine Inline-Angabe steht über allem im
  Stilblatt. Das ist die `pointer-events`-Falle aus P10.2 mit vertauschten
  Rollen: dort schlug ein ID-Selektor die Klassenregel, hier eine
  JavaScript-Zuweisung das ganze Stilblatt.
  Lehre: **die Anzeigegröße gehört dem Stilblatt, die Pufferauflösung dem Code.**
  Und geprüft wird, wie immer bei `src/ui/`, der **berechnete** Wert.

- **Zwei HUD-Kästen, die sich auf dem Telefon überlagert hätten.** Die erste
  Fassung stellte die Minikarte auf dem Telefon nach links oben (`top: 58px`) —
  dorthin, wo `.hud__lap` steht (min-width 152 px, rund 84 px hoch, `top: 64px`).
  Gefunden hat es kein Blick in die Datei, sondern ein `getBoundingClientRect` an
  **beiden** Elementen in einem 390 × 844-Fenster.
  Lehre: **zwei absolut positionierte Kästen sind erst dann nebeneinander, wenn
  jemand ihre Rechtecke gegeneinander gerechnet hat.** Ein Stilblatt, in dem
  beide Regeln plausibel aussehen, sagt darüber nichts.

- **Ein Prüfstand würfelte feiner, als seine Quelle darstellen kann — und
  meldete dafür einen schweren Fahrzeugfehler.** `hill.mts` fuhr jedes Fahrzeug
  einen Hang hinauf, einmal glatt und einmal „rau". Der Offroader fiel als
  einziges Fahrzeug von 64,5 auf **4,8 km/h** — ausgerechnet der, dessen ganze
  Auslegung Gelände heißt. Das sieht nach einem Fahrwerksfehler aus, und um ein
  Haar hätte ich einen repariert.
  Die Rauheit war `sin(x · 8.3)`, also **0,76 m** Wellenlänge, und die Normale
  wurde über eine zentrale Differenz mit ε = 0,5 m gerechnet. Beides zusammen
  ist Aliasing. Auf der **Karte** gibt es diese Welle gar nicht: das Höhenfeld
  ist bilinear über ein 1,5-m-Raster, kürzer als 3 m kann darin nichts stehen,
  und `TerrainSampler.getNormalAt` rechnet folgerichtig mit dem Texelabstand.
  Getrennt in vier Läufen (`tools/bench/offroad.mts`): mit kartenrealistischer
  Welle und ε fährt der Offroader **64,3** km/h, also genau wie glatt.
  Zwei Lehren. **Ein Prüfstand, der feiner abtastet als seine Quelle darstellen
  kann, misst seine eigene Abtastung** — dieselbe Klasse wie „außerhalb des
  Gitters extrapoliert" weiter oben, nur eine Ebene höher. Und: **wenn genau
  ein Fahrzeug ausschert, ist das ein Hinweis auf die Messung, nicht auf das
  Fahrzeug** — getroffen hat es den mit dem längsten Federweg, weil die
  Stützebene aus der Normalen gebaut wird.

- **Ein Auslöser an der Flanke, wo der Vorgang gemeint war.** Der Lastwechsel
  in P26 sollte das Heck eindrehen, wenn der Fuß vom Gas geht. Der erste
  Entwurf hing am **Abfall** des Gases je Schritt — und die Probe „Drift ohne
  Absicht" schlug sofort an (29,1° statt 2,0°). Die Ursache stand im Prüfstand:
  `holdSpeed` ist ein Zweipunktregler und hackt das Gas mit 10 Hz an und aus;
  jede Flanke war ein Impuls, und zwischen zwei Flanken klang er nicht ab.
  Der Fehler war nicht die Empfindlichkeit, sondern die **Größe**: eine Flanke
  ist ein Zeitpunkt, ein Lastwechsel ist ein Vorgang. Die Last braucht eine
  Zehntelsekunde, um nach vorn zu wandern. Ausgelöst wird jetzt über eine
  **Dauer** (0,12 s Gas zu), und danach besteht die Probe wieder.
  Lehre: **wer ein physikalisches Geschehen nachbildet, prüft, ob seine
  Auslösegröße dieselbe Dimension hat wie das Geschehen.** Ein Zeitpunkt für
  einen Vorgang ist derselbe Kategorienfehler wie eine Klemme auf einen Betrag,
  wo ein Abschnitt gemeint war (P17, P19, P20) — nur in der Zeit statt im
  Vorzeichen.

- **Zwei Dinge im Bild trugen dieselbe Farbe — und damit war der Pixel kein
  Beweis.** Auf einem fernen Bild stand ein rosa Zug in der Landschaft, gemessen
  0,372 linear gegen 0,058 Asphaltstraße und 0,028 Boden. Ich hielt ihn für den
  neuen Bodenring der Driftzone, schrieb „13-mal so hell wie der Boden" auf,
  dämpfte die Ringfarben um Faktor 2,2 — und pushte beides.
  Es war eine **Kirschblütenkrone**: `SAKURA_TOP` trägt denselben Wert, den
  `ZONE_RING_INNER` trug (`0xf7c6d8`). Aufgefallen ist es erst, weil derselbe
  Pixel **nach** der Farbänderung unverändert 0,3723 maß — *eine Zahl, die sich
  nicht bewegt, obwohl man an ihr gedreht hat, ist ein Verdachtsmoment und keine
  Bestätigung.* Dieselbe Form wie die exakt −6,00 cm Standhöhe aus P14 und die
  exakt 2,00 m Fall aus P19.
  Getrennt wurde es dann über das **Objekt** statt über die Farbe: drei
  Aufnahmen unmittelbar hintereinander, dazwischen nur eine Sichtbarkeit
  umgeschaltet. Ohne Ring: 0,3723 (unverändert). Ohne Bäume: 0,0468, also
  Bodenniveau. Der Ring trägt gemessen 3,7 % der Pixel bei mittlerer Differenz
  1,21 und dominiert gar nichts; die Dämpfung ist zurückgenommen.
  Zwei Lehren. **Wo zwei Dinge dieselbe Farbe tragen, trennt man über das
  Objekt** — ein Farbwert identifiziert nichts. Und beim Bauen des Trenntests
  lag gleich die nächste Falle: `material.visible` hätte Ring, Bäume, Fahnen,
  Schanzen und Sammelstücke **zugleich** ausgeblendet, weil `StuntSystem` sich
  ein einziges `PropMaterial` teilt. Wer etwas zum Vergleich ausblendet, muss
  wissen, **wer sonst noch an diesem Schalter hängt**.

- **„Zu langsam" war die falsche Diagnose; der Renderer ist abgestürzt.** Fünf
  Anläufe für einen Bilddurchgang über die Karte sind gescheitert, und die
  ersten vier hat niemand gelesen — sie starben in einem Hintergrundprozess ohne
  Ausgabe. Erst ein Lauf, der die Ausnahme abfing, nannte den Grund:
  `Target crashed`. Der Renderer-Prozess *stirbt*, er trödelt nicht.
  Getrennt wurde es in zwei Schritten, weil zwei Verdächtige zugleich im Spiel
  waren: `japanMap.view()` und `engine.loop.tick()`. Ergebnis — `view()` +
  `shot()` ohne Schleife geht, `view()` + **20** getriebene Frames geht,
  **45** stürzen ab, und zwar auch am Blickpunkt `kueste` (offenes Meer), also
  nicht wegen des Bewuchses.
  Zwei Lehren. **Ein Hintergrundlauf ohne abgefangene Ausnahme ist keine
  Messung** — vier Fehlschläge lang stand die Ursache im Prozess und nirgends
  sonst. Und: **wer eine Vermutung („die Füllrate") hat, prüft sie, statt an ihr
  zu drehen** — die Auflösung zu vierteln hat nichts gebracht, weil die Vermutung
  falsch war. Die brauchbare Regel für diese Maschine lautet: höchstens rund
  20 getriebene Frames je Seite, danach eine neue Seite.

- **Eine Tonspur hat das ganze Spiel angehalten.** Die Web-Audio-API **wirft**
  bei einem nicht-endlichen Wert an einem `AudioParam` — eine `TypeError`,
  mitten im Frame. Sie läuft durch `AudioSystem.update` → `Engine.#update` →
  `RenderLoop.#frame` und beendet die Schleife: Bild steht, Auto steht, Spiel
  tot. Für eine Tonspur ist das ein absurd hoher Preis, und in einem
  Portalspiel ist es der Unterschied zwischen „hakt kurz" und „ist kaputt".
  Zwei Verstärker: die Drehzahlglättung `x += (ziel − x)·k` ist **klebrig** (ein
  NaN bleibt für immer, auch wenn die Telemetrie sich erholt), und der Stapel
  endet in der Browser-API, zeigt also nirgends auf die Ursache.
  Gefunden hat es **kein Bild und keine Kennzahl**, sondern ein Prüflauf, der
  aus einem ganz anderen Grund lief. Lehre: **eine Anzeige-Schicht darf die
  Simulation nicht mitnehmen können** — sie liest Zahlen, die anderswo entstehen,
  und muss mit jeder davon zurechtkommen. Wo eine fremde API bei schlechten
  Eingaben wirft, gehört genau **ein** Ort davor, an dem geprüft wird (hier
  `rampe()`), und nicht ein `if` je Aufrufstelle: sechs Stellen sind sechs
  Gelegenheiten, eine zu vergessen, und die siebte baut jemand nächstes Jahr ein.

- **Ein Zweig, der nie wahr werden kann — diesmal beim Hinschreiben bemerkt.**
  Die Randstreifen der Schanze sollten auf den äußersten Spalten des Rasters
  liegen (`c <= 0 || c >= ACROSS − 1`). Genau die liegen aber auf dem Saum
  (`RAMP_SKIRT`), wo `lift` null ist — sie fallen also schon in den Zweig
  darüber, und der Randstreifen wäre nie gezeichnet worden. Ein Bild hätte
  gezeigt, dass die Streifen fehlen; *warum* sie fehlen, hätte es nicht gezeigt.
  Lehre — und sie ist der billige Fall derselben Klasse wie die drei toten
  Stellschrauben dieses Projekts (`viewDistance`, `shadowCascades`,
  `minSpinGrip`): **wer eine Bedingung über einen Index schreibt, rechnet
  nach, welche Indizes sie trifft und ob sie überhaupt bis dorthin kommt.**
  Eine Zeile Rechnung gegen einen Regler, der Monate braucht, bis jemand merkt,
  dass er nichts tut.

- **Was diese Maschine an der Qualitätsleiter messen kann und was nicht —
  gemessen 2026-08-31.** Ein voller Durchlauf über fünf Stufen mit *fertig
  eingeschwungener* Streuung ist auf dem Software-Rasterisierer nicht
  bezahlbar, und das ist keine Schätzung: `ultra` braucht am Blickpunkt
  `stadt-rand` **3,7 s je getriebenem Frame** (66,7 s für 18), `minimal`
  0,72 s. Bis `ScatterSystem.streaming` auf `false` geht, sind es an einem
  dichten Blickpunkt bis 1101 Frames — über eine Stunde für **eine** Zelle.
  Zwei Läufe sind daran gestorben, ohne eine einzige Zeile auszugeben.
  Was trotzdem geht, und wie:
  1. **Die Hälfte ohne Browser zuerst.** Was `quality.config.ts` je Stufe
     setzt, ist exakt und kostet keinen Frame. Nur die Zeilen ansehen, in
     denen sich etwas ändert — eine Konstante über alle Stufen ist kein
     Regler.
  2. **Gleich viele Frames statt fertige Frames.** Fünf Stufen mit je 18
     getriebenen Frames am selben Blickpunkt sind ein gültiger *Vergleich*,
     auch wenn keine Zeile ein eingeschwungener Zustand ist. Was dann nicht
     dasteht, gehört dazugeschrieben: die Instanzzahlen sind Untergrenzen.
  3. **Von unten nach oben laufen lassen.** Die Stufen, um die es bei
     schwacher Hardware geht, sind die billigen — sie kommen zuerst, und ein
     Zeitablauf frisst dann `ultra` statt `minimal`.
  Und die Sekunden bleiben, was sie waren: **keine Bildzeit.** Brauchbar ist
  allein das Verhältnis (hier minimal rund 5,2-mal billiger als ultra), und
  auch das nur, weil dieser Rasterisierer wie die Zielhardware
  füllratengebunden ist. Dieselbe Verwechslung hat in P11 sieben Messungen
  gekostet.

- **Ein Befund, der nicht reproduzierbar war — und deshalb offen bleibt.** Auf
  einem Bild mit dreifach überhöhter Partikelhelligkeit standen rund sechs
  brettartige braune Flächen frei in der Luft in einem Waldstück
  (`.cache/shots/staub-k3.png`). Am Blickpunkt der Driftzone trat es bei
  derselben Überhöhung nicht auf (`.cache/shots/diag.png`, sauber). Ob es ein
  Partikelfeld war oder Vegetation, ist **nicht geklärt**.
  Er steht als offener Punkt in PLAN.md P25 und nicht als behoben. Lehre — und
  sie ist der Grund, warum dieses Kapitel existiert: **ein Befund, den man nicht
  zuordnen kann, wird aufgeschrieben und nicht weggeräumt.** Die Alternative wäre
  eine Reparatur auf Verdacht gewesen, und davon hat dieses Projekt schon zwei
  gebaut, die nichts bewirkt haben.

---

## Was in diesem Projekt schon schiefgegangen ist — Nachträge aus P26

- **„Ein unbeleuchtetes Material schreibt seine Zahl direkt ins Bild" — der
  Satz aus P25 stimmt nur ohne Tonemapper dahinter.** Das Laternenpapier der
  Driftzone bekam `0xffb45e` mit der Rechnung daneben: „linear rund 1,00 /
  0,44 / 0,10, also heller als alles im Bild und über der Bloom-Schwelle". Die
  Rechnung war richtig und das Ergebnis falsch. Gemessen im **fertigen** Bild
  steht die Laterne bei **0,401** und der Himmel bei **0,510** — genau der
  flache Fleck, den der Kommentar ausschließen wollte.
  Dazwischen liegt der Tonemapper der PostFX-Kette. Ein Materialwert von 1,0
  ist kein Bildwert von 1,0; er ist der Eingang einer Kurve, die zum
  Weißpunkt hin sättigt. Aufgenommen wurde sie in **einem** Browserlauf über
  `material.color.setScalar(k)`, wie es CLAUDE.md für Partikel schon
  beschreibt:

  | Materialwert (Rot) | im Bild | sRGB | Rot ÷ Blau |
  |---|---|---|---|
  | 1,00 | 0,401 | 203 169 126 | 1,61 |
  | 2,50 | 0,581 | 230 202 162 | 1,42 |
  | 5,00 | 0,753 | 250 223 198 | 1,26 |

  Die dritte Spalte ist der Grund, warum die Antwort nicht „so hell wie
  möglich" lautet: mit der Helligkeit **verliert die Laterne ihre Farbe**. Bei
  k = 5 ist sie fast weiß, und eine weiße Papierlaterne ist eine Glühbirne.
  Zwei Lehren:
  1. **Die Zahl im Material ist erst dann eine Bildgröße, wenn nichts mehr
     dahinterkommt.** Wo eine Kette dahinterhängt, wird die Kurve **gemessen**
     statt gerechnet — drei Punkte genügen, und sie kosten einen Lauf.
  2. **Sättigung ist ein Messwert wie Helligkeit.** Wer nur die Helligkeit
     abliest, dreht eine warme Fläche unbemerkt nach Weiß.

- **Zwei Regler in einem Zug — und die P25-Lehre war sofort wieder fällig.**
  Der Blütenteppich der Driftzone las sich als **Planen auf der Wiese**: ein
  flaches Viereck von bis zu 2,4 m, `0xe8a9c0`, gemessen **0,168 linear gegen
  0,0095 Boden — Faktor 17,7**. Repariert wurden Form (ein Viereck → neun
  kleine Blätter auf einer Goldwinkel-Spirale) und Farbe (auf 0,283) **in
  einem Schritt**.
  Danach lag der dunkelste der drei Töne rechnerisch bei 0,0359 und der Boden
  bei 0,0352: ein Drittel der Blätter war vom Untergrund nicht zu
  unterscheiden, und aus der Plane war Dreck geworden. Die **Form allein**
  hatte die Plane längst beseitigt; die Helligkeit war also gar nicht das
  Problem und wurde trotzdem mitgedreht.
  Lehre: **ein Regler je Messung** — steht seit P25 hier, und der Rückfall
  kostete einen zweiten Bilderlauf. Der Ausweg beim zweiten Mal war ein
  Bezugspunkt, der physikalisch stimmt statt einer neuen Schätzung: gefallene
  Blüten sind **dieselbe Blüte wie am Baum**, also gehört ihre Helligkeit an
  die der Krone (gemessen 0,151) und nicht an eine Vorstellung von „gedämpft".
  Nachgemessen 0,139.

- **Eine Zahl, die auf den Zentimeter genau einer Konstanten entspricht —
  diesmal war es der Boden.** Der dunkelste Blattton rendert 0,0359, der Boden
  daneben 0,0352. Dieses Projekt führt zwei Fälle, in denen genau so eine
  Übereinstimmung der Befund war (exakt −6,00 cm Standhöhe in P14, exakt
  `UNSUPPORTED_DROP` in P19). Hier war sie kein Fehler, sondern das Ergebnis —
  aber sie war auch hier der Punkt, an dem sich Hinsehen gelohnt hat, statt
  eine plausible Zahl durchzuwinken.
