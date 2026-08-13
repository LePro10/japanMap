/**
 * Vegetations-Arten und ihre Streuregeln — PLAN.md P4 / 4.2 und 4.3.
 *
 * Eine Art ist hier kein Modell, sondern eine **Regel**: wo darf sie stehen, wie
 * dicht, wie groß, und ab welcher Entfernung wird sie billiger gezeichnet. Die
 * Geometrie dazu entsteht in `vegetationMeshes.ts`.
 *
 * > **Warum prozedurale Geometrie und keine CC0-Modelle.** SPEC §6 nennt den
 * > Quaternius Nature Pack, und der bleibt der Zielzustand — aber sein Weg in
 * > die Karte führt laut SPEC ausdrücklich über den Normalisierungs-Schritt der
 * > Asset-Pipeline, und die ist **P5.1**. Vorher ein Modell direkt zu laden
 * > wäre genau der Stil-Mix, vor dem SPEC §6 warnt. Die Formen hier sind
 * > deshalb bewusst einfach und werden in P5 ersetzt; was P4 abnehmen muss,
 * > sind Streuung, Instanzierung, LOD und Budget — und dafür ist die konkrete
 * > Baumsilhouette gleichgültig. SPEC-Leitprinzip: der Look entsteht im
 * > Renderer, nicht in der Geometrie.
 */

/** Splat-Kanäle von zones.png, Reihenfolge wie TERRAIN_LAYERS. */
export interface ZoneWeights {
  readonly rock: number;
  readonly grass: number;
  readonly sand: number;
  readonly paddy: number;
}

/**
 * Wozu eine Art im Bild dient — P11.6.
 *
 * `canopy` steht **gegen den Himmel**: Bäume tragen die Silhouette eines Grats,
 * und die kann kein Bodenanstrich ersetzen. Sie müssen deshalb weit reichen.
 *
 * `ground` liegt **auf dem Boden**: Gras und Büsche geben ihm Farbe und Textur,
 * und genau das kann der Splat-Farbstich aus `GROUND_TINT` übernehmen, sobald
 * die einzelne Pflanze unter die Pixelgröße fällt. Ihre Reichweite ist deshalb
 * der billigste Hebel im ganzen System — 34 986 der 50 711 sichtbaren Instanzen
 * am Blickpunkt `wald` waren Gras-Imposter.
 *
 * Die Unterscheidung ist der Grund, warum die Stufen **zwei** Reichweiten haben
 * statt einer: eine gemeinsame würde entweder die Grate kahl machen oder das
 * Gras unnötig weit tragen.
 */
export type SpeciesLayer = 'canopy' | 'ground';

export interface SpeciesSettings {
  readonly id: string;
  readonly label: string;
  /** Siehe `SpeciesLayer` — entscheidet, welche Reichweite der Stufe gilt. */
  readonly layer: SpeciesLayer;

  /**
   * Kantenlänge einer Streuzelle in Metern. Je Zelle **ein** Kandidat, zufällig
   * innerhalb der Zelle versetzt.
   *
   * Das ist die Poisson-Disk-Näherung aus PLAN.md 4.2: echtes Poisson-Sampling
   * bräuchte eine Nachbarschaftsabfrage je Punkt, das gejitterte Gitter hat den
   * Mindestabstand bauartbedingt (zwei Kandidaten benachbarter Zellen können
   * sich nicht beliebig nahe kommen) und kostet nichts.
   */
  readonly cellSize: number;

  /** Entfernungen in Metern, ab denen die nächstbilligere Stufe übernimmt. */
  readonly lodDistances: readonly [near: number, mid: number, far: number];

  readonly minScale: number;
  readonly maxScale: number;

  /**
   * Zahl der Formvarianten dieser Art.
   *
   * Jede Variante ist ein eigenes Modell aus demselben Bauplan mit anderem
   * Zufallsstrom — bei der Kiefer etwa eine andere Etagenzahl, Schlankheit und
   * ein seitlicher Versatz je Etage. Sie kostet **zwei** Draw-Calls (nahe und
   * reduzierte Stufe); die Imposter teilen sich einen Atlas je Art, weil sie
   * erst ab 180 m übernehmen und die Form dort nicht mehr auflösbar ist.
   *
   * Drei ist die Zahl, ab der die Wiederholung in einem Bestand nicht mehr ins
   * Auge springt — zusammen mit dem Seitenverhältnis und der Neigung je Instanz
   * (siehe unten), die den weit größeren Teil der Varianz tragen.
   */
  readonly variants: number;

  /**
   * Streuung des Höhen-Breiten-Verhältnisses je Instanz, 0…1.
   *
   * Ein Wert von 0,22 heißt: die Höhe schwankt um ±22 % gegen die Breite. Das
   * ist der billigste aller Varianz-Hebel — er steht in der Instanzmatrix, die
   * ohnehin geschrieben wird, und kostet weder Draw-Call noch Speicher.
   */
  readonly aspectJitter: number;

  /**
   * Größte Neigung aus der Senkrechten, in Grad.
   *
   * Ebenfalls in der Instanzmatrix, als Scherung. Nichts verrät ein
   * wiederholtes Modell so zuverlässig wie ein Bestand, in dem jeder Stamm
   * exakt lotrecht steht.
   */
  readonly leanDeg: number;

  /** Höchste Geländeneigung in Grad, auf der die Art noch steht. */
  readonly maxSlopeDeg: number;
  /** Höhenbereich in Metern über dem Meeresspiegel. */
  readonly minHeight: number;
  readonly maxHeight: number;

  /**
   * Neigung der Art zu den vier Splat-Kanälen aus `zones.png`.
   *
   * Aus dem Skalarprodukt mit den Kanalgewichten an der Fundstelle entsteht die
   * **Annahmewahrscheinlichkeit**, nicht ein Ja/Nein. Das ist der Unterschied
   * zwischen einem Waldrand und einer ausgestanzten Kante: an der Grenze
   * zwischen Gras und Fels stehen dann immer weniger Bäume, statt dass die
   * letzte Reihe wie mit dem Lineal gezogen endet.
   *
   * **Negative Werte schließen aus.** Bäume bekommen `paddy: -1`, seit die
   * Reisfelder aus P5.4 im Gelände stehen: dort war zuvor ein Wald, weil die
   * Parzellen zwar überwiegend Reisfeld sind, aber nicht ausschließlich — bei
   * 70 % Reisfeld bleiben 30 % Gras, und daraus wurde eine
   * Annahmewahrscheinlichkeit von 10 %. Über 101 ha sind das tausende Bäume
   * mitten im Wasser. Mit dem negativen Gewicht fällt das Skalarprodukt dort
   * unter null, und der Rand bleibt trotzdem weich: bei 20 % Reisfeld ist es
   * noch positiv, bei 40 % nicht mehr.
   */
  readonly zones: ZoneWeights;

  /**
   * Abstand, den die Art von jeder Straßenachse hält, in Metern.
   *
   * Gemessen wird gegen die **Mittellinie**, nicht gegen den Fahrbahnrand —
   * `distanceToNearestRoad()` aus P3 liefert genau das. Der Wert muss deshalb
   * die halbe Fahrbahn plus Böschung enthalten: bei 9 m Fahrbahn und 15 m
   * Böschung sind das rund 20 m, sonst wachsen Bäume in den Einschnitt.
   */
  readonly roadClearance: number;

  /** Grundfarbe. Variiert je Instanz um `tintJitter`. */
  readonly color: number;
  readonly tintJitter: number;

  /** Amplitude des Windwiegens in Metern bei voller Höhe (P4 / 4.5). */
  readonly windAmplitude: number;

  /**
   * Bodenverdeckung am Fuß der Pflanze — `null`, wenn die Art keine bekommt.
   *
   * `radius` ist ein Vielfaches des Modellradius, `strength` skaliert die
   * Verdunkelung gegen `GROUND_AO.floor`. Gras bekommt keine: ein 0,4 m hoher
   * Halm verdeckt nichts, und bei 33 000 sichtbaren Grasinstanzen wäre der
   * Boden ein einziger dunkler Teppich.
   */
  readonly groundAo: { readonly radius: number; readonly strength: number } | null;
}

/**
 * Vier Arten, absichtlich wenige.
 *
 * Die Zahl der **Instanzen** entscheidet über das Draw-Call-Budget, nicht die
 * Zahl der Arten — jede Art kostet drei Draw-Calls (eine je LOD-Stufe), und
 * mehr Arten wären für P4 nur mehr Prüfarbeit ohne neue Erkenntnis.
 */
export const SPECIES: readonly SpeciesSettings[] = [
  {
    id: 'pine',
    label: 'Nadelbaum',
    layer: 'canopy',
    cellSize: 8,
    // **1200 m statt 520 — P11.5, der kahle Ring.** Die Ferngrenze war seit P4
    // auf jeder Stufe dieselbe Konstante, und PLAN.md P10 nennt sie „die
    // auffälligste Kante, die es gibt" auf einer Karte, die von der Fernsicht
    // lebt.
    //
    // **Warum das bezahlbar ist, und zwar gerade bei Bäumen:** von den 50 711
    // sichtbaren Instanzen am Blickpunkt `wald` sind rund 2 000 Bäume, der Rest
    // ist Gras (34 986 Gras-Imposter allein). Die Baumreichweite zu vervielfachen
    // kostet deshalb einen Bruchteil dessen, was dieselbe Änderung am Gras
    // kosten würde — und ab 180 m ist ein Baum ohnehin ein Imposter, also zwei
    // Dreiecke.
    //
    // Zusammen mit dem Ausdünnungsgesetz aus P11.2 (`keep = (R/d)²` jenseits
    // des Vollbereichs) wächst die Instanzzahl über die zusätzliche Strecke
    // **logarithmisch** statt mit dem Quadrat: die Zahl der Instanzen je
    // Bildschirmfläche bleibt gleich, es kommen nur weiter entfernte dazu.
    lodDistances: [80, 180, 1200],
    minScale: 0.75,
    maxScale: 1.45,
    variants: 3,
    aspectJitter: 0.22,
    leanDeg: 5,
    // Nadelbäume stehen steiler als alles andere — auf einer 38°-Flanke steht
    // im Gebirge tatsächlich Wald, und ohne diesen Wert bliebe das Massiv kahl.
    maxSlopeDeg: 38,
    minHeight: 12,
    // Baumgrenze. PLAN.md nennt 350 m; der Gipfel liegt auf 450 m, es bleibt
    // also eine kahle Kuppe, und genau die soll man sehen.
    maxHeight: 350,
    zones: { rock: 0.0, grass: 0.35, sand: 0.0, paddy: -1.0 },
    roadClearance: 20,
    color: 0x2f4a34,
    tintJitter: 0.18,
    windAmplitude: 0.55,
    groundAo: { radius: 1.15, strength: 1 },
  },
  {
    id: 'broadleaf',
    label: 'Laubbaum',
    layer: 'canopy',
    cellSize: 11,
    // Wie bei der Kiefer — Begründung dort. Der Laubbaum endet zusätzlich schon
    // bei 190 m Geländehöhe, seine Fernsicht betrifft also vor allem die Ebene.
    lodDistances: [80, 180, 1200],
    minScale: 0.8,
    maxScale: 1.5,
    variants: 3,
    aspectJitter: 0.20,
    leanDeg: 7,
    maxSlopeDeg: 27,
    minHeight: 6,
    maxHeight: 190,
    zones: { rock: 0.0, grass: 0.5, sand: 0.0, paddy: -1.0 },
    roadClearance: 22,
    color: 0x3f5a2e,
    tintJitter: 0.22,
    windAmplitude: 0.75,
    groundAo: { radius: 1.25, strength: 1 },
  },
  {
    id: 'bush',
    label: 'Busch',
    layer: 'ground',
    cellSize: 5,
    lodDistances: [45, 100, 190],
    minScale: 0.6,
    maxScale: 1.35,
    variants: 3,
    aspectJitter: 0.26,
    leanDeg: 11,
    maxSlopeDeg: 42,
    minHeight: 2,
    maxHeight: 400,
    zones: { rock: 0.0, grass: 0.3, sand: 0.0, paddy: -1.0 },
    roadClearance: 16,
    color: 0x46592f,
    tintJitter: 0.24,
    windAmplitude: 0.3,
    groundAo: { radius: 1.1, strength: 0.55 },
  },
  {
    id: 'grass',
    label: 'Grasbüschel',
    layer: 'ground',
    // Die dichteste Zelle im Projekt, und der Grund, warum das Kriterium
    // „≥ 50 000 sichtbare Instanzen" überhaupt erreichbar ist. Bäume dafür zu
    // verdichten ergäbe dieselbe Zahl bei zwanzigfachen Dreieckskosten.
    //
    // Der erste Entwurf stand auf 1,1 m und kam über einer Wiese auf **25 605**
    // sichtbare Instanzen — also nicht einmal halb so viele wie gefordert. Mit
    // 0,8 m und einer höheren Neigung zu Gras- und Reisfeldzonen (siehe `zones`)
    // sind es gemessen 61 372. Die Zelle ist der wirksamere der beiden Hebel:
    // die Kandidatenzahl geht mit ihrem Quadrat.
    cellSize: 0.8,
    lodDistances: [30, 70, 160],
    minScale: 0.7,
    maxScale: 1.4,
    variants: 3,
    aspectJitter: 0.32,
    leanDeg: 15,
    maxSlopeDeg: 45,
    minHeight: 0.6,
    maxHeight: 400,
    // Reis **ist** ein Gras, und die Reisfeldzone ist die größte
    // zusammenhängende Fläche der Karte (SPEC §2.1). Sie leer zu lassen, bis P5
    // dort Parzellen baut, hieße: das größte Stück Karte bleibt kahl. Fels bleibt
    // bei null — auf Fels wächst nichts, und der Gipfel soll kahl sein.
    // **Nachgezogen, nachdem die Zonenmaske überhaupt zu wirken begann.**
    // Bis zur Reparatur in `ZoneMap.load()` lieferte `weight()` NaN, und
    // `roll >= NaN` verwirft nichts — die Streuung nahm faktisch **jeden**
    // Kandidaten an. Die 61 372 Instanzen, mit denen P4 abgenommen wurde, sind
    // damit an einem Filter gemessen, der nichts filterte.
    //
    // Mit funktionierender Maske und den alten Werten (0,55 / 0,45) waren es am
    // dichtesten Blickpunkt **31 483**, also weit unter dem Kriterium „≥ 50 000
    // sichtbare Instanzen". Gemessen an derselben Stelle:
    //
    // | grass / paddy | sichtbare Instanzen |
    // |---|---|
    // | 0,55 / 0,45 | 31 483 |
    // | 0,90 / 0,75 | 49 923 |
    // | **1,00 / 0,85** | **55 186** |
    //
    // Nachgezogen wurde die **Neigung**, nicht die Zellgröße: eine kleinere
    // Zelle erhöht die Kandidatenzahl und damit die Erzeugungskosten je Chunk,
    // die P4 mühsam von 12,7 ms auf 0,4 ms gebracht hat. Die Neigung kostet
    // nichts — es werden dieselben Kandidaten geprüft, nur mehr angenommen.
    zones: { rock: 0.0, grass: 1.0, sand: 0.06, paddy: 0.85 },
    // Deutlich enger als bei Bäumen: Gras darf bis an die Böschungskante
    // heranwachsen, ein Baum nicht.
    roadClearance: 7,
    color: 0x5a6b35,
    tintJitter: 0.26,
    windAmplitude: 0.16,
    groundAo: null,
  },
];

export const SCATTER = {
  /**
   * Kantenlänge eines Streu-Chunks in Metern.
   *
   * Bewusst **nicht** die 256 m aus `WORLD.chunkSize`: das Sichtfeld der
   * Vegetation endet bei rund 520 m, und mit 256-m-Kacheln wären das 5 × 5
   * Chunks — zu grob, um mit dem Frustum sinnvoll zu cullen. Mit 64 m sind es
   * rund 140 Chunks im Umkreis, von denen das Frustum bei 60° Blickfeld etwa
   * ein Drittel behält.
   */
  chunkSize: 64,

  /**
   * Grundseed der Streuung. Zusammen mit den Chunk-Koordinaten bestimmt er jede
   * Instanz — deshalb muss nichts gespeichert werden, und zweimaliges Laden
   * ergibt bitgleich dieselbe Platzierung (Akzeptanzkriterium P4).
   */
  seed: 20260727,

  /**
   * Chunks, deren Instanzen je Frame neu einsortiert werden.
   *
   * Ein vollständiger Durchlauf sortiert alle sichtbaren Instanzen neu ein — bei
   * 50 211 gemessen rund 10 ms. Verteilt auf mehrere Frames sind es Bruchteile
   * davon; der Preis ist, dass die Stufenzuordnung um die Länge eines Durchlaufs
   * hinterherhinkt.
   *
   * Hier stand zuerst 48. Im Umkreis der Vegetation liegen rund 207 Kandidaten,
   * ein Durchlauf dauerte damit fünf Frames; mit 16 sind es dreizehn, also 0,22 s
   * Nachlauf — bei 30 m/s Kamerafahrt 6,5 m Versatz an einer LOD-Grenze, deren
   * nächste bei 30 m liegt.
   *
   * > **Die 207 gelten seit P11.5 nicht mehr** — mit 1200 m Baumreichweite sind
   * > **1521** Chunks im Umkreis. Der Etat zählt seitdem nur noch Chunks, die
   * > tatsächlich einsortiert werden; die vom Frustum verworfenen kosten nichts
   * > und werden nicht mehr mitgezählt (Begründung in
   * > `ScatterSystem.#advancePass`). Die Arbeit je Frame ist damit dieselbe
   * > geblieben, die Zahl oben beschreibt nur nicht mehr die Kandidatenmenge.
   *
   * **Der Wert war nicht die Ursache des Problems, das ihn geändert hat.** Die
   * Füllphase kostete 12,7 ms im Median, und die Senkung von 48 auf 16 hat daran
   * *nichts* geändert — die Ursache lag in der Chunk-Erzeugung, nicht im
   * Einsortieren (siehe `ScatterChunk.generated`). Der kleinere Wert bleibt
   * trotzdem: er verteilt gleichmäßiger, und die Messung gibt für 48 keinen
   * Vorteil her. Das ist eine Änderung ohne isolierten Nachweis, und das gehört
   * dazugesagt.
   */
  chunksPerFrame: 16,

  /**
   * Zeitbudget je Frame für das **Erzeugen** neuer Chunks, in Millisekunden.
   *
   * Getrennt von `chunksPerFrame`, weil Einsortieren und Erzeugen ganz
   * verschiedene Kosten haben: einsortieren heißt eine Matrix schreiben,
   * erzeugen heißt rund 6700 Kandidaten filtern. Ohne Bremse kostet der erste
   * Frame in einem neuen Gebiet 48 Streuungen auf einmal — ein Ruckler an genau
   * der Stelle, an der man gerade beschleunigt.
   *
   * **Hier stand zuerst eine Chunk-Zahl (4), und die war zu grob.** Gemessen
   * über 25 Frames: Median 0,70 ms, aber **Spitze 11,7 ms** gegen ein
   * Frame-Budget von 16,6 ms. Eine kleinere Zahl wäre die naheliegende Antwort
   * und die schlechtere: sie deckelt nur, solange die Kosten je Chunk konstant
   * bleiben, und die hängen an der Zellgröße der dichtesten Art — ein Chunk mit
   * Gräsern kostet auf dieser Maschine gemessen rund 12 ms, einer ohne unter
   * 0,3 ms.
   *
   * Ein Zeitbudget deckelt direkt, was zu deckeln ist. **Ein** Chunk wird immer
   * erzeugt, auch wenn das Budget schon aufgebraucht ist — sonst könnte die
   * Streuung bei einem langsamen Frame ganz stehenbleiben und käme nie
   * hinterher. Die Spitze liegt damit bei Budget plus einem Chunk, und dass ein
   * *einzelner* Chunk das Budget überschreiten kann, ist der Grund, warum es die
   * Artenmaske aus `ScatterChunk.generated` zusätzlich braucht.
   *
   * PLAN.md P7.2 sieht für Chunk-Arbeit dasselbe Budget vor; hier ist es
   * vorgezogen, weil es die Messung so verlangt hat.
   */
  newChunkBudgetMs: 2,

  /**
   * Gleichzeitig offene Aufträge an den Streu-Worker (P7 / 7.2).
   *
   * Der Worker ersetzt das Zeitbudget oben nicht, er macht es gegenstandslos:
   * gestreut wird auf einem anderen Thread, der Hauptthread packt nur noch die
   * Antwort aus. Übrig bleibt eine andere Grenze, und die hat einen anderen
   * Grund als die Rechenzeit.
   *
   * Ein Worker arbeitet seine Nachrichten **in Ankunftsreihenfolge** ab. Schickt
   * man ihm den ganzen Durchlauf auf einmal — im Nahbereich sind das mehrere
   * hundert Chunks —, steht die dringendste Anfrage am Ende einer Schlange von
   * Sekunden. Die Prioritätssortierung wäre dann eine Sortierung, die niemand
   * mehr sieht. Wenige offene Aufträge heißen: die Reihenfolge wird bei jedem
   * Nachschub neu entschieden, also mit der aktuellen Kameraposition.
   *
   * 4 ist der Kompromiss: genug, dass der Worker nie leerläuft (eine Antwort
   * braucht einen Umlauf über die Ereignisschleife), wenig genug, dass eine
   * Kameradrehung nach höchstens vier Chunks berücksichtigt wird.
   */
  workerQueueDepth: 4,

  /**
   * Wie stark die Blickrichtung die Reihenfolge des Durchlaufs verschiebt.
   *
   * Der Plan verlangt „Prioritätswarteschlange nach Distanz **und
   * Blickrichtung**". Bis P6 sortierte allein die Entfernung, und der
   * Frustum-Test entschied binär, ob ein Chunk überhaupt drankommt. Innerhalb
   * des Bildes ist ein Chunk in der Mitte trotzdem wichtiger als einer am Rand:
   * dorthin fliegt man.
   *
   * 0,5 heißt, dass ein Chunk quer zur Blickrichtung wie einer in der
   * 1,22-fachen Entfernung behandelt wird (√1,5). Bewusst so klein: die
   * Reihenfolge soll verschoben, nicht umgekehrt werden. Ein großer Wert ließe
   * einen Chunk direkt vor der Kamera hinter einem in 300 m Entfernung zurück,
   * sobald man den Kopf dreht — und Vegetation, die beim Drehen verschwindet,
   * ist schlimmer als Vegetation, die spät kommt.
   */
  viewBias: 0.5,

  /**
   * Zwischengespeicherte Chunks. Darüber wird der am längsten unbenutzte
   * verworfen.
   *
   * Verwerfen ist folgenlos, **weil** die Streuung deterministisch ist: derselbe
   * Chunk entsteht beim nächsten Betreten identisch neu. Ohne diese Eigenschaft
   * bräuchte es entweder unbegrenzten Speicher oder eine Persistenz, und die
   * Karte hat 2304 Chunks.
   *
   * **512 war zu klein, sobald die Bäume 1200 m weit reichen — P11.5.** Bei
   * 520 m lagen rund 210 Chunks im Umkreis, der Cache war also dreifach
   * überdimensioniert. Bei 1200 m sind es **π · 1200² / 64² ≈ 1104**, und ein
   * Cache mit 512 Plätzen wirft dann in jedem Durchlauf weg, was er im nächsten
   * wieder braucht.
   *
   * Aufgefallen ist es nicht an einem Bild, sondern daran, dass `streaming`
   * **nie mehr auf `false` ging**: der Messlauf lief in sein Zeitlimit, die
   * Instanzzahl kroch und kam nicht zur Ruhe. Genau die Sorte Zustand, für die
   * P10.0 das Streaming-Signal überhaupt gebaut hat — ohne das hätte hier eine
   * Zahl aus einer halb gefüllten Welt in der Doku gestanden.
   *
   * 2560 deckt den Umkreis mit Reserve für die Randchunks und die Bewegung.
   * **Die Größe ist nicht frei wählbar, sie folgt aus der Reichweite** — wer die
   * Baumreichweite wieder ändert, muss diese Zahl mitziehen.
   */
  cacheSize: 2560,

  /**
   * Obergrenze für das Hochskalieren beim Ausdünnen — P11.2.
   *
   * Wer nur noch den Anteil p behält, müsste die Verbliebenen um 1/√p
   * verbreitern, damit die **gedeckte Bodenfläche** gleich bleibt. Ohne das ist
   * jedes Ausdünnen sofort als Lücke zu sehen; das ist die Rechnung hinter der
   * Steppe aus Befund 2.
   *
   * Der Deckel ist trotzdem nötig: bei p = 0,14 wären es 2,67× und ein
   * Grasbüschel würde zum Strauch. 1,7 entspricht p ≈ 0,35 — darunter wird die
   * Deckung nicht mehr vollständig gehalten, und das ist der ehrlichere Tausch
   * als sichtbar aufgeblasene Einzelpflanzen.
   *
   * **Nur waagerecht.** Die Höhe bleibt unangetastet: eine doppelt so hohe
   * Kiefer fällt in der Silhouette gegen den Himmel sofort auf, eine doppelt so
   * breite Grasbüschelbasis nicht.
   */
  thinBoostMax: 1.7,
} as const;

/**
 * Vegetations-Anteil am Look — PLAN.md P2 / 2.6.
 *
 * Getrennt von `SPECIES` und `SCATTER`, weil der Look-Controller nur das
 * einsammeln darf, was am **Bild** dreht. Streudichte, Zellgröße und
 * LOD-Grenzen sind Leistungsparameter der Qualitätsstufe: ein Preset, das die
 * halbe Vegetation abschaltet, wäre kein anderer Look, sondern eine andere Welt.
 */
export const VEGETATION_LOOK = {
  windStrength: 1,

  /**
   * Streulicht durch Blätter, 0…1.
   *
   * Bei 2,2° Sonnenstand steht die Sonne fast waagerecht hinter allem, was man
   * ansieht — und Laub ist dünn. Ohne diesen Anteil ist ein Baum im Gegenlicht
   * eine schwarze Silhouette, und genau das sah das erste Bild der Vegetation
   * so nach Pappaufsteller aussehen. Der Effekt ist zwei Terme: ein Rückstreu-
   * Keulchen zur Sonne hin und eine Umschlingung der Normale, damit auch die
   * abgewandte Seite nicht auf null fällt.
   */
  translucency: 0.55,

  /**
   * Stärke der Bodenverdeckung, 0…2. Siehe `GROUND_AO`.
   *
   * Gehört in den Look und nicht in die Qualitätsstufe: der Fleck kostet einen
   * einzigen Draw-Call und ist damit kein Leistungsparameter, sondern ein
   * Regler am Bild.
   */
  groundAo: 1,
} as const;

/**
 * Bodenverdeckung — offener Punkt aus P4, nachgeholt vor P5.
 *
 * **Das ist Umgebungsverdeckung, kein Schattenwurf.** Der Unterschied ist hier
 * nicht sprachlich: die Sonne steht auf 2,2°, ein 9-m-Baum wirft damit einen
 * rund 230 m langen Schatten quer über den Hang. Ein runder Fleck unter dem
 * Stamm wäre als *Sonnenschatten* schlicht falsch. Als **Himmelsverdeckung**
 * ist er richtig und noch dazu sonnenunabhängig: die Krone nimmt dem Boden
 * unter sich den Himmel weg, und das ist der Kontakt, der fehlte.
 *
 * Bezahlt wird das mit **einem** Draw-Call: alle Arten schreiben in dasselbe
 * `InstancedMesh`, weil der Fleck keine Textur und keine Art kennt.
 */
export const GROUND_AO = {
  /**
   * Restlicht in der Mitte des Flecks. 0 wäre schwarz, 1 wirkungslos.
   *
   * Gemischt wird **multiplikativ** auf das fertig beleuchtete Bild, nicht nur
   * auf den Umgebungsanteil. Das ist eine Vereinfachung: streng genommen darf
   * Umgebungsverdeckung das direkte Sonnenlicht nicht dämpfen. Bei 2,2°
   * Sonnenstand liegt der Waldboden ohnehin fast überall im Eigenschatten des
   * Geländes, der direkte Anteil ist dort also klein — und der Preis für die
   * saubere Trennung wäre ein zweiter Geometriedurchlauf mit G-Buffer.
   */
  floor: 0.4,

  /**
   * Radius, bis zu dem der Fleck voll deckt; darüber blendet er zum Rand aus.
   *
   * Klein gehalten: ein Fleck mit hartem Kern und weitem Saum liest sich als
   * Kontakt, einer mit weitem Kern als Fleck auf dem Boden.
   */
  core: 0.12,

  /** Ausblenden mit der Entfernung, in Metern: x = Beginn, y = Ende. */
  fade: [55, 95] as const,

  /**
   * Anhebung über die abgetastete Geländehöhe, in Metern.
   *
   * Der Fleck tastet die Heightmap **exakt** ab, das gerenderte Gelände ist
   * dagegen ein gemorphtes CDLOD-Gitter. Beide fallen nur an den Stützstellen
   * zusammen; dazwischen liegt der Fleck mal darüber, mal darunter. Die
   * Anhebung deckt die Differenz ab, `polygonOffset` den Rest.
   */
  lift: 0.06,

  /**
   * Stützstellen je Achse im Fleck-Gitter.
   *
   * Ein einzelnes Quad wäre eben und stünde am Hang schräg im Boden. Mit 5 × 5
   * Stützstellen liegt der Abstand bei einem 8-m-Fleck bei 2 m und damit in der
   * Größenordnung des feinsten Terrain-Gitters (1,5 m).
   */
  vertices: 5,

  /** Pufferplätze. Überlauf wird gezählt und muss null bleiben. */
  capacity: 4096,
} as const;

/**
 * Der Boden unter dem Bewuchs — PLAN.md P11, Befund 3.
 *
 * ## Warum es das gibt
 *
 * Gemessen am Blickpunkt `wald`, untere Bildhälfte, **auf Ultra bei voller
 * Dichte**: 44,22 % grün und **46,07 % braun**. Die Grasbüschel schließen also
 * auch dann keine Decke, wenn keine einzige Instanz eingespart wird — zwischen
 * ihnen steht der Splat-Kanal `grass`, und dessen Fototextur heißt nicht ohne
 * Grund `aerial_grass_rock`. Auf Minimal fällt der Grünanteil auf 5,71 % und
 * der Braunanteil steigt auf 87,82 %; aus dem Wald wird eine Steppe.
 *
 * **Beides ist dasselbe Problem.** Die Dichte macht es sichtbar, verursacht hat
 * es der Boden. Ein Bewuchs, dessen Untergrund dieselbe Farbe hat, verträgt es,
 * wenn Instanzen fehlen — einer über braunem Grund nicht. Deshalb steht dieser
 * Abschnitt **vor** jedem Eingriff an Dichte und Sichtweite: er ist die
 * Voraussetzung dafür, dass die späteren Einsparungen unsichtbar bleiben.
 *
 * ## Was hier *nicht* passiert
 *
 * Das ist **kein Nebel und kein Weichzeichner über einem Problem** — der
 * Kandidat, vor dem P10.3 ausdrücklich warnt. Es wird nichts verdeckt, sondern
 * eine falsche Farbe korrigiert: unter einem Wald ist der Boden nicht
 * graubraun, sondern beschattet, bemoost und voller Nadelstreu. Die
 * Fototexturen sind aus der Luft aufgenommen und zeigen den Boden **ohne** den
 * Bewuchs, der laut Zonenkarte darauf steht.
 *
 * ## Warum über die Splat-Gewichte und nicht über eine eigene Karte
 *
 * Der erste Entwurf war eine gerechnete Bewuchskarte: dieselben Filter wie
 * `scatterChunk` (Zone, Höhe, Neigung, Straßenabstand, Freiflächen), aggregiert
 * je Texel. Sie wäre genauer — sie wüsste von Straßenschneisen und von der
 * 38°-Grenze der Kiefer. Sie kostet aber ein neues Erzeugnis, einen Bake-Schritt
 * und Download-Budget, und **die Zonenkarte trägt den größten Teil der Antwort
 * schon**: Fels ist ein eigener Kanal, Reisfeld auch, und die kahle Kuppe liegt
 * in der Felszone.
 *
 * Angefangen wird deshalb hier. Wenn am Bild Grün dort steht, wo nichts wächst,
 * ist die gerechnete Karte der nächste Schritt — und **das ist am Bild zu
 * prüfen, nicht anzunehmen.**
 */
export const GROUND_TINT = {
  /**
   * Wie stark ein Splat-Kanal Richtung Bewuchsfarbe gezogen wird, 0…1.
   *
   * Reihenfolge wie `TERRAIN_LAYERS`: Fels, Gras, Sand, Reisfeld.
   *
   *  - **Fels bleibt auf 0.** Auf Fels wächst nichts, der Gipfel soll kahl sein,
   *    und die Steinbruchwände am Bergpass sollen grau bleiben (P8.5a).
   *  - **Gras trägt den Effekt.** Dort steht der Bewuchs, dort ist der Boden
   *    heute grau-braun.
   *  - **Sand bleibt auf 0.** Ein grüner Strand wäre genau der Fehler, den
   *    dieser Regler vermeiden soll.
   *  - **Reisfeld nur schwach.** Die Parzellen stehen unter Wasser und haben
   *    ihre eigene Farbe; sie sind aber auch keine Wüste, und Reis *ist* ein
   *    Gras.
   */
  weights: [0, 0.85, 0, 0.25] as const,

  /**
   * Die Farbe, zu der gezogen wird.
   *
   * **Abgeleitet und nicht abgeschrieben:** es ist die Grundfarbe des
   * Grasbüschels aus `SPECIES`. Eine handgepflegte zweite Farbe daneben wäre
   * der nächste Wert, der irgendwann nicht mehr zum Bewuchs passt — und die
   * Fuge zwischen Boden und Pflanze ist genau das, was hier stimmen muss.
   */
  color: 0x5a6b35,

  /**
   * Stärke **im Nahbereich**, wo echtes Gras steht, 0…1.
   *
   * **Bewusst unter 1**, damit die Zeichnung der Bodentextur den Detailgrad
   * weiter trägt: bei 1,0 verschwände sie vollständig.
   *
   * > **Der erste Entwurf stand auf 0,5** — mit der Überlegung, dort, wo die
   * > Halme wirklich stehen, brauche der Boden weniger Farbe. Am Bild gemessen
   * > war das ein Rückschritt: am Blickpunkt `wald` auf Ultra fiel der
   * > Grünanteil der unteren Bildhälfte von **77,82 auf 52,69 %** und der
   * > Braunanteil stieg von 5,95 auf 28,78 %. Bei 2,2° Sonnenstand deckt das
   * > Gras eben *nicht* so viel, wie die Überlegung annahm.
   * >
   * > Daraus die Regel für diesen Regler: **die Entfernungsrampe darf nur
   * > hinzufügen, nie wegnehmen.** Der Nahwert bleibt deshalb auf dem
   * > gemessenen Stand von P11.4, und `strengthFar` liegt darüber.
   */
  strengthNear: 0.8,

  /**
   * Stärke dort, wo **keine** Vegetation mehr gezeichnet wird, 0…1.
   *
   * ## Der eigentliche Gedanke hinter P11.6
   *
   * Bis dahin war die Stärke eine Konstante über die ganze Karte. Das war die
   * falsche Form: gebraucht wird der Farbstich **genau dort, wo die Halme
   * fehlen** — und das ist eine Funktion der Entfernung, nicht der Fläche.
   *
   * Der Verlauf ist deshalb **an dasselbe Ausdünnungsgesetz gekoppelt**, das
   * `ScatterSystem.#pushChunk` anwendet. Der Boden springt genau in dem Maße
   * ein, in dem die Vegetation verschwindet:
   *
   *     Deckung(d) = min(1, boostMax² · keep(d))
   *     Stärke(d)  = mix(strengthNear, strengthFar, 1 − Deckung(d))
   *
   * Jenseits der Grasreichweite ist die Deckung null und die Stärke voll. Das
   * gilt **auf jeder Stufe**, auch auf Ultra: dort endet das Gras bei 160 m,
   * und alles dahinter ist heute nackter Boden. Genau das war der Auftrag —
   * „wenn das Gras nicht mehr gerendert wird, soll der Boden einfach grün
   * sein".
   *
   * Und es löst zugleich das Stufenproblem von selbst: Minimal dünnt früher aus,
   * also greift dort auch der Farbstich früher. Kein zweiter Satz Werte je
   * Stufe, keine zweite Stelle, die nachgezogen werden muss.
   */
  strengthFar: 0.97,

  /**
   * Erhält die Helligkeit der Bodentextur, statt sie zu übermalen.
   *
   * Ein glattes `mix(albedo, farbe, t)` zieht auch die Helligkeit zur
   * Zielfarbe und plättet damit jede Struktur — Felsbrocken, Erosionsrinnen und
   * die Makro-Variation aus `TERRAIN.macroStrength` gingen mit. Stattdessen
   * wird die Zielfarbe auf die **Leuchtdichte des jeweiligen Texels** normiert:
   * der Farbton wandert, das Muster bleibt.
   *
   * 0 = übermalen, 1 = reiner Farbtonwechsel.
   */
  preserveLuminance: 0.85,
} as const;

export const IMPOSTER = {
  /**
   * Ansichten pro Achse im oktaedrischen Atlas. 8 × 8 = 64, wie in PLAN.md 4.4.
   *
   * Auf die **Halbkugel** verteilt (siehe imposter_oct.glsl) sind das rund 22°
   * zwischen zwei Nachbaransichten. Mit der Mischung zwischen den zwei nächsten
   * bleibt der Winkelfehler darunter, und bei 180 m Entfernung — dort übernimmt
   * der Imposter — ist ein Baum rund 30 Pixel hoch.
   */
  tiles: 8,

  /**
   * Kantenlänge einer Ansicht in Pixeln. 8 × 128 = 1024² je Atlas.
   *
   * Zwei Atlanten (Albedo und Normale) mal vier Arten sind 8 × 1024² × 4 Byte =
   * **32 MB** Texturspeicher gegen ein Budget von 512 MB (SPEC §4), von dem
   * P3 schon 255 MB belegt. 256er Zellen wären 128 MB und damit die Hälfte des
   * Restbudgets für Bäume, die zwischen 180 und 520 m stehen.
   */
  tileSize: 128,

  /**
   * Ab welchem Alphawert ein Imposter-Pixel als vorhanden gilt.
   *
   * **Hier stand zuerst 0,3 mit einer Begründung, die nicht gemessen war** — die
   * Mischung zweier Ansichten halbiere den Alphawert, deshalb müsse die Schwelle
   * tief liegen. Nachgemessen an 229 Kiefern zwischen 180 und 240 m, Mesh gegen
   * Imposter mit identischen Instanzmatrizen, gezählt wurden die abgedeckten
   * Pixel:
   *
   * | Schwelle | Deckung gegen Mesh |
   * |----------|--------------------|
   * | 0,3      | +38,4 %            |
   * | 0,5      | +36,9 %            |
   * | 0,8      | +34,2 %            |
   *
   * Die Schwelle ist also **fast wirkungslos** — der Unterschied kommt nicht von
   * weichen Alpharändern. Er kommt daher, dass ein 5,4-m-Baum auf 180 m nur rund
   * 19 Pixel hoch ist: das Mesh besteht dort aus Dreiecken unterhalb der
   * Pixelgröße und fällt in Lücken, während der Imposter eine gefilterte Textur
   * ist und deckt. Der Imposter ist an dieser Stelle nicht schlechter, sondern
   * besser abgetastet.
   *
   * Am **einzelnen Baum aus 24 m** — siebenmal näher als der Imposter je zum
   * Einsatz kommt — bleiben 6,5 % Breite und 9,7 % Höhe Unterschied in der
   * Hüllbox. Das ist der Rest, den die bilineare Filterung am Rand hinzufügt.
   * 0,45 ist der Wert, bei dem beides zusammen am kleinsten bleibt, ohne die
   * Silhouette an den Mischstellen einzuschneiden.
   */
  alphaTest: 0.45,
} as const;
