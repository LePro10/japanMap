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

export interface SpeciesSettings {
  readonly id: string;
  readonly label: string;

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
    cellSize: 8,
    lodDistances: [80, 180, 520],
    minScale: 0.75,
    maxScale: 1.45,
    // Nadelbäume stehen steiler als alles andere — auf einer 38°-Flanke steht
    // im Gebirge tatsächlich Wald, und ohne diesen Wert bliebe das Massiv kahl.
    maxSlopeDeg: 38,
    minHeight: 12,
    // Baumgrenze. PLAN.md nennt 350 m; der Gipfel liegt auf 450 m, es bleibt
    // also eine kahle Kuppe, und genau die soll man sehen.
    maxHeight: 350,
    zones: { rock: 0.0, grass: 0.35, sand: 0.0, paddy: 0.0 },
    roadClearance: 20,
    color: 0x2f4a34,
    tintJitter: 0.18,
    windAmplitude: 0.55,
  },
  {
    id: 'broadleaf',
    label: 'Laubbaum',
    cellSize: 11,
    lodDistances: [80, 180, 520],
    minScale: 0.8,
    maxScale: 1.5,
    maxSlopeDeg: 27,
    minHeight: 6,
    maxHeight: 190,
    zones: { rock: 0.0, grass: 0.5, sand: 0.0, paddy: 0.0 },
    roadClearance: 22,
    color: 0x3f5a2e,
    tintJitter: 0.22,
    windAmplitude: 0.75,
  },
  {
    id: 'bush',
    label: 'Busch',
    cellSize: 5,
    lodDistances: [45, 100, 190],
    minScale: 0.6,
    maxScale: 1.35,
    maxSlopeDeg: 42,
    minHeight: 2,
    maxHeight: 400,
    zones: { rock: 0.0, grass: 0.3, sand: 0.0, paddy: 0.0 },
    roadClearance: 16,
    color: 0x46592f,
    tintJitter: 0.24,
    windAmplitude: 0.3,
  },
  {
    id: 'grass',
    label: 'Grasbüschel',
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
    maxSlopeDeg: 45,
    minHeight: 0.6,
    maxHeight: 400,
    // Reis **ist** ein Gras, und die Reisfeldzone ist die größte
    // zusammenhängende Fläche der Karte (SPEC §2.1). Sie leer zu lassen, bis P5
    // dort Parzellen baut, hieße: das größte Stück Karte bleibt kahl. Fels bleibt
    // bei null — auf Fels wächst nichts, und der Gipfel soll kahl sein.
    zones: { rock: 0.0, grass: 0.55, sand: 0.06, paddy: 0.45 },
    // Deutlich enger als bei Bäumen: Gras darf bis an die Böschungskante
    // heranwachsen, ein Baum nicht.
    roadClearance: 7,
    color: 0x5a6b35,
    tintJitter: 0.26,
    windAmplitude: 0.16,
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
   * Zwischengespeicherte Chunks. Darüber wird der am längsten unbenutzte
   * verworfen.
   *
   * Verwerfen ist folgenlos, **weil** die Streuung deterministisch ist: derselbe
   * Chunk entsteht beim nächsten Betreten identisch neu. Ohne diese Eigenschaft
   * bräuchte es entweder unbegrenzten Speicher oder eine Persistenz, und die
   * Karte hat 2304 Chunks.
   */
  cacheSize: 512,
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
