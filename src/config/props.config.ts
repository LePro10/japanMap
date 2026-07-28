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
};

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
