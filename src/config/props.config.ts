/**
 * Props und Landmarks — PLAN.md P5 / 5.3 und 5.5.
 *
 * Der Unterschied zur Vegetation aus P4 steckt in einem Wort: Props werden
 * **gesetzt**, nicht gestreut. Ein Tempel an einer zufälligen Stelle ist kein
 * Tempel, sondern ein Möbelstück. Deshalb steht die Platzierung in einer Datei
 * (`assets/props.json`) und nicht in einer Regel — auch dort, wo ein Werkzeug
 * sie erzeugt hat.
 *
 * Was hier steht, ist die **Darstellung**: ab wann ein Prop auf die reduzierte
 * Stufe wechselt und ab wann es ganz verschwindet.
 */

/** Größenklasse eines Props. Bestimmt allein, wie lange man es sieht. */
export type PropScale = 'klein' | 'mittel' | 'gross';

export interface PropClassSettings {
  /** Entfernung in Metern, ab der die reduzierte Stufe übernimmt (falls es eine gibt). */
  readonly lodDistance: number;
  /** Entfernung, ab der das Prop **ganz** verschwindet. */
  readonly cullDistance: number;
}

/**
 * Drei Klassen statt einer Entfernung je Asset.
 *
 * > PLAN.md 5.5: „Kleine Props verschwinden ab Distanzschwelle komplett statt
 * > zum Imposter zu werden." Das ist hier wörtlich umgesetzt und der Grund,
 * > warum es keine Imposter für Props gibt: ein Imposter lohnt bei
 * > zehntausenden Instanzen (P4: 37 459 auf einmal). Props gibt es in dieser
 * > Karte einige hundert, und einen Atlas je Prop zu backen kostete mehr
 * > Texturspeicher, als die eingesparten Dreiecke wert sind.
 *
 * Die Schwellen folgen der Silhouettenhöhe: ein 1-m-Pfosten misst auf 250 m
 * rund zwei Pixel und ist damit nicht mehr als Pfosten erkennbar, sondern nur
 * noch als Flimmern. Ein 14-m-Leuchtturm ist auf 1500 m immer noch vier Pixel
 * breit — und als einziger Fixpunkt der Küste soll man ihn von weitem sehen.
 */
export const PROP_CLASSES: Readonly<Record<PropScale, PropClassSettings>> = {
  klein: { lodDistance: 60, cullDistance: 220 },
  mittel: { lodDistance: 140, cullDistance: 650 },
  gross: { lodDistance: 320, cullDistance: 1600 },
};

export const PROPS = {
  /**
   * Pufferplätze je Asset und Stufe.
   *
   * Großzügig gegenüber der tatsächlichen Zahl (die dichteste Art in
   * `assets/props.json` sind die Tetrapoden an der Küste): ein Überlauf
   * verwirft Props, und anders als bei der Vegetation fehlt dann nicht ein
   * Grashalm unter tausend, sondern ein Stück Mole.
   */
  capacity: 512,

  /**
   * Weiche Ausblendzone vor `cullDistance`, als Anteil der Entfernung.
   *
   * 0,12 heißt: die letzten 12 % vor der Grenze werden zusammengestaucht statt
   * abgeschnitten. Ohne das ploppt ein Prop schlagartig weg — bei einem
   * einzelnen Objekt im Bild fällt genau das auf, während dieselbe Grenze bei
   * 50 000 Grasbüscheln niemandem auffällt.
   *
   * Umgesetzt wird es über die **Skalierung**: das Prop schrumpft in den Boden.
   * Ein Alpha-Übergang bräuchte ein transparentes Material und damit Sortierung
   * — für ein Dutzend Objekte je Bild der falsche Preis.
   */
  fade: 0.12,
} as const;

/**
 * Freihalteradius je Asset, in Metern — die Ergänzung zu `roadClearance`.
 *
 * **Gemessen an einem Fehler:** die Tempelanlage stand nach ihrer ersten
 * Platzierung mitten im Wald, Bäume wuchsen durch die Halle und zwischen den
 * Torii hindurch. Die Streuung aus P4 kennt Straßen und Zonen, aber keine
 * Gebäude — und ein Tempel im Dickicht ist nicht zu sehen.
 *
 * Die Zahlen sind der Bauwerksradius plus so viel Vorplatz, dass man das Stück
 * ganz sieht. Nicht jedes Prop steht drin: **Tetrapoden** liegen auf Sand, wo
 * ohnehin nichts wächst, **Streckenmarkierungen** stehen im Straßenkorridor,
 * den `roadClearance` schon räumt, und **Boote** schwimmen. Sie bekommen keinen
 * Eintrag, und ein fehlender Eintrag heißt 0 — das spart 478 der 630 Kreise.
 */
export const PROP_CLEARANCE: Readonly<Record<string, number>> = {
  // Tempelbezirk. Die Halle misst 13 × 11 m; 18 m lassen einen Hof darum frei.
  templeHall: 18,
  templeStairs: 8,
  // Die Torii stehen alle 16 m — mit 8 m Radius entsteht daraus ein
  // durchgehend freier Korridor statt einer Kette von Lichtungen.
  torii: 8,
  stoneLantern: 4,
  hokora: 5,
  // Hof statt Haus: ein Bauernhaus ohne Vorplatz sieht aus, als hätte man es
  // in den Wald geworfen.
  farmhouse: 15,
  shed: 6,
  powerPole: 3,
  lighthouse: 12,
  modular_wooden_pier: 10,
  // Felsen: gerade so viel, dass kein Baum aus dem Stein wächst.
  boulder_01: 2.5,
  rock_moss_set_02: 3.5,
  coastal_cliff_04: 20,

  // ── P8.9 ───────────────────────────────────────────────────────────────────
  //
  // Sandō. Chōzuya und Glockenturm stehen am Weg, dessen Korridor die
  // Torii-Kette (8 m alle 16 m) bereits räumt; sie brauchen nur ihren eigenen
  // Vorplatz und nicht mehr, sonst frisst der Aufgang eine Lichtung in den
  // Wald, durch den er führen soll.
  chozuya: 6,
  bellTower: 7,

  // Fischerdorf. Die Hütten stehen **dicht** — ein Dorf ist keine Streusiedlung,
  // und 15 m wie beim Gehöft würden hier genau den Eindruck erzeugen, den 8.9
  // beheben soll. 8 m lassen die Gasse zwischen zwei Hütten frei, ohne aus
  // sechs Häusern sechs Einzelgehöfte zu machen.
  fishHut: 8,
  netRack: 4,
  boatRamp: 6,
  crateStack: 2,
  jetty: 8,

  // Stadtrand. Die Mauer ist 8,42 m lang; ihr Radius muss die halbe Länge
  // decken, sonst wächst Bewuchs mitten durch die Reihe. 6 m ist etwas mehr
  // und hält die Reihe beidseitig frei.
  concreteWall: 6,
  greenhouse: 10,
  warehouse: 16,
};

/**
 * Wasserflächen der Reisfelder — PLAN.md P5 / 5.4.
 *
 * Die Parzellen selbst stehen im Gelände (Terrain-Baker, Schritt 5c); hier
 * steht nur, wie das Wasser darauf aussieht und wie fein es aufgelöst wird.
 */
export const PADDY_WATER = {
  /**
   * Kantenlänge einer Wasserzelle in Metern.
   *
   * Die Maske liegt mit 3 m je Texel vor; 6 m ist doppelt so grob und damit
   * ein Kompromiss zugunsten der Dreieckszahl. Die Reisfelder bedecken 101 ha.
   *
   * > ~~Sichtbar ist der Unterschied nur an der Kante zum Damm, und dort steht
   * > ohnehin ein 3,4 m breiter Rücken.~~
   * >
   * > **Das war eine Annahme und sie ist am Bild widerlegt (2026-08-08).** Auf
   * > Augenhöhe im Reisfeld stand das Wasser als harte, achsparallele Treppe im
   * > Bild, und von oben lagen die Parzellen als Klötze in breiten
   * > Schlammrändern — obwohl die Parzellen im *Gelände* unregelmäßige
   * > Voronoi-Zellen sind.
   * >
   * > Die Ursache war **nicht** die Zellgröße allein, sondern der Aufbau: eine
   * > Zelle wurde nur gesetzt, wenn **alle vier** Ecken nass waren *und* auf
   * > gleicher Höhe lagen. Eine trockene Ecke steht aber auf dem Damm, also
   * > höher — jede Randzelle fiel durch beide Prüfungen, und das Wasser blieb
   * > eine volle Zellbreite vor seinem eigenen Rand stehen. Bei 3,4 m Damm auf
   * > 6 m Raster traf das die Mehrheit der Randzellen.
   * >
   * > `RicePaddy.#build()` schneidet den Rand seitdem mit Marching Squares und
   * > rechnet die Höhe nur über die **nassen** Ecken. Gemessen: 18 608 → 41 283
   * > Dreiecke über die ganze Karte, am Blickpunkt `reisfeld` +4,9 % der
   * > Szenendreiecke auf Ultra und +10,9 % auf Niedrig, bei **gleicher**
   * > Draw-Call-Zahl. Der Zuwachs ist das Wasser, das vorher gefehlt hat.
   *
   * Die Zellgröße bleibt bei 6 m: der Rand liegt mit Marching Squares jetzt auf
   * halber Zellbreite genau, also bei rund 3 m — und damit auf der Auflösung
   * der Maske. Feiner zu rastern brächte keine Genauigkeit dazu, nur Dreiecke.
   */
  grid: 6,

  /** Kantenlänge einer Kachel. Wie `WORLD.chunkSize` — das Frustum cullt sie. */
  tile: 256,

  /**
   * Höhentoleranz der vier Ecken eines Quads, in Metern.
   *
   * Knapp, weil das Gelände innerhalb einer Parzelle **exakt** eben ist: jede
   * Abweichung darüber ist bereits eine Terrassenkante.
   */
  levelTolerance: 0.08,

  /**
   * Tiefes Grün-Braun statt Blau.
   *
   * Ein Reisfeld im Mai ist eine dünne Wasserschicht über Schlamm, kein See —
   * die Farbe kommt vom Boden darunter. Was es zum Wasser macht, ist die
   * Rauheit: bei 2,23° Sonnenstand spiegelt eine solche Fläche den ganzen
   * Himmel, und genau darauf zielt SPEC §3.1 mit der blauen Stunde.
   */
  color: 0x2b3026,
  roughness: 0.06,
  metalness: 0,
} as const;

/** Eine Platzierung, wie sie in `assets/props.json` steht. */
export interface PropPlacement {
  /** Asset-Kennung: Landmark-Id oder Schlüssel aus dem Modell-Manifest. */
  readonly id: string;
  readonly x: number;
  readonly z: number;
  /** Drehung um Y in Grad. */
  readonly rot: number;
  readonly scale: number;
  /**
   * Höhe in Metern, optional.
   *
   * Fehlt sie, wird sie beim Laden aus dem `TerrainSampler` geholt — dann sitzt
   * das Prop auch nach einem neuen Terrain-Bake noch auf dem Boden. Angegeben
   * wird sie nur, wo das falsch wäre: ein Steg steht über dem Wasser, ein Boot
   * schwimmt darauf.
   */
  readonly y?: number;
  /** Zusätzlicher Versatz nach oben, in Metern. Für halb eingegrabene Props. */
  readonly yOffset?: number;
}

export interface PropFile {
  readonly version: number;
  readonly seed: number;
  readonly props: readonly PropPlacement[];
}
