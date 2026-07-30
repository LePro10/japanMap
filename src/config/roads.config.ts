/**
 * Straßen — PLAN.md P3, SPEC §2.3.
 *
 * Straßen sind laut SPEC das wichtigste Datenmodell des Projekts: dieselben
 * Splines liefern sichtbare Geometrie, das Terrain-Carving beim Bake und ab P4
 * die Ausschlusszonen der Vegetation. Was hier steht, gilt deshalb für alle drei.
 */

export type RoadType = 'highway' | 'mountain' | 'village' | 'city' | 'dirt';

export interface RoadTypeSettings {
  readonly label: string;
  /** Fahrbahnbreite in Metern, Vorgabe für neue Knoten. */
  readonly width: number;
  /** Breite des Randstreifens je Seite. */
  readonly shoulder: number;
  /**
   * Höchste Längsneigung als Verhältnis. Der Generator glättet das
   * Höhenprofil, bis der Wert eingehalten ist.
   */
  readonly maxGradient: number;
  /** Kleinster zulässiger Kurvenradius in Metern (PLAN.md: fahrbar ab 15 m). */
  readonly minRadius: number;
  /** Kachelung der Belagstextur längs, in Metern. */
  readonly textureLength: number;
}

export const ROAD_TYPES: Readonly<Record<RoadType, RoadTypeSettings>> = {
  highway: {
    label: 'Ringstraße',
    width: 9,
    shoulder: 1.6,
    maxGradient: 0.07,
    minRadius: 45,
    textureLength: 8,
  },
  mountain: {
    label: 'Bergpass',
    // Schmaler und steiler als der Ring — der Pass ist laut SPEC §2.1 die
    // Drift-Strecke, und dafür ist eine enge Fahrbahn das eigentliche Merkmal.
    width: 6.5,
    shoulder: 1,
    maxGradient: 0.11,
    minRadius: 15,
    textureLength: 7,
  },
  village: {
    label: 'Dorfstraße',
    width: 5,
    shoulder: 0.8,
    maxGradient: 0.09,
    minRadius: 18,
    textureLength: 6,
  },
  city: {
    label: 'Stadtstraße',
    width: 8,
    shoulder: 1.2,
    maxGradient: 0.06,
    minRadius: 25,
    textureLength: 8,
  },
  dirt: {
    label: 'Feldweg',
    width: 4,
    shoulder: 0.6,
    maxGradient: 0.14,
    minRadius: 12,
    textureLength: 5,
  },
};

export const ROAD_MESH = {
  /**
   * Abstand der abgetasteten Mittellinie in Metern.
   *
   * Gilt für Bake **und** Renderer — beide lesen dieselbe Datei. 2 m sind bei
   * einem 15-m-Radius rund 7,6° Richtungsänderung pro Schritt; die sichtbare
   * Facettierung liegt damit unter der Breite einer Fahrbahnmarkierung.
   */
  sampleSpacing: 2,

  /**
   * Wie weit die Böschung seitlich ausläuft, in Metern.
   *
   * Der Übergang ist ein Kosinus, keine Rampe: eine lineare Böschung
   * hinterlässt an ihrem oberen Ende einen Knick im Gelände, und der fängt bei
   * 2,2° Sonnenstand sofort eine harte Kante Licht.
   */
  embankment: 15,

  /**
   * Höhe der Fahrbahn über dem eingeebneten Gelände, in Metern.
   *
   * Nicht null: bei exakt gleicher Höhe entscheidet die Tiefenpuffer-Genauigkeit,
   * ob Straße oder Terrain gewinnt, und das Ergebnis flackert beim Fahren.
   */
  surfaceOffset: 0.06,
} as const;

/**
 * Nasser Asphalt — PLAN.md P6 / 6.4, SPEC §3.1 („blaue Stunde nach Regen").
 *
 * `wetness` steuert die **Fläche**, nicht die Stärke: 0 ist trocken, 1 steht
 * fast durchgehend unter Wasser. Der Wert wird mit der Pfützenneigung aus dem
 * Vertex-Kanal multipliziert, den `RoadMeshBuilder` seit P3 anlegt — bei
 * `wetness = 0,7` sind die Fahrbahnränder also deutlich nässer als die Mitte,
 * und genau so trocknet eine Straße auch ab.
 *
 * `roughness` ist der Wert **in** der Pfütze. Nicht null: eine mathematisch
 * perfekte Spiegelfläche gibt es nicht, und bei exakt 0 fällt die
 * Umgebungsspiegelung in den kleinsten Mip-Level zurück, was die Reflexion
 * härter aliast als sie darf.
 */
export const ROAD_WET = {
  /**
   * ## Warum 0,44 und nicht 0,62
   *
   * Der erste Wert war geraten. Gemessen wurde danach der **Anteil sichtbar
   * nasser Fläche**: Maske aller Asphaltpixel im Bild (Differenz gegen ein Bild
   * ohne Straßen und Stadtboden), darin die Pixel, die sich gegenüber `wetness
   * = 0` ändern. Die Spiegelung war dabei abgeschaltet — sie verstärkt den
   * Effekt und würde die Fläche mitmessen, die sie beleuchtet.
   *
   * | wetness | Ring von oben | Stadtschleife (streifend) |
   * |---|---|---|
   * | 0,36 | 25,6 % | 13,8 % |
   * | 0,40 | 29,4 % | 23,0 % |
   * | **0,44** | **32,8 %** | **38,7 %** |
   * | 0,48 | 36,4 % | 57,6 % |
   * | 0,52 | 39,4 % | 80,8 % |
   * | 0,62 | 45,7 % | **94,7 %** |
   *
   * Bei 0,62 stand die Stadtschleife praktisch vollständig unter Wasser,
   * während dieselbe Einstellung von oben gesehen bei 45 % lag. Der Grund ist
   * der streifende Blick: dort sieht die Kamera fast nur die Fahrbahnränder,
   * und die tragen die höchste Pfützenneigung. Bei 0,44 liegen beide
   * Blickpunkte nah beieinander — und das ist das Kriterium, denn nasse
   * Fahrbahn soll nicht davon abhängen, wie flach man daraufschaut.
   */
  wetness: 0.44,
  /** Breite des Übergangs am Pfützenrand, in Einheiten der Rauschamplitude. */
  edge: 0.13,
  /** Wie stark das Albedo in der Pfütze abdunkelt. */
  darken: 0.42,
  roughness: 0.045,
} as const;

/**
 * Straßendecals — PLAN.md P6 / 6.6.
 *
 * Alle Längen in Metern. Die Zahlen orientieren sich an japanischen
 * Straßenmaßen: Markierungen 15 cm breit, Mittelstrich 5 m mit 5 m Lücke auf
 * Landstraßen. Sie stehen hier zusammen, weil sie zusammen einen Maßstab
 * ergeben — ein 20 cm breiter Strich neben einem 5-m-Strich sähe nach nichts
 * aus, beide zusammen sagen, wie breit die Fahrbahn ist.
 */
export const DECALS = {
  seed: 20260731,
  atlasSize: 512,

  /**
   * Wie weit das Decal über der Fahrbahn liegt, in Metern.
   *
   * **Fast null.** Der Tiefenstreit wird über `polygonOffset` gelöst, nicht
   * über Höhe: 2 cm Abstand ergäben bei 2,23° Sonnenstand einen halben Meter
   * Schattenstrich neben jeder Markierung. Der Millimeter hier fängt nur die
   * Rundung der Instanzmatrix ab.
   */
  lift: 0.001,

  /** Straßentypen mit Fahrbahnmarkierung. Ein Feldweg hat keine. */
  markedTypes: ['highway', 'city', 'village'] as readonly string[],

  lineWidth: 0.15,
  /** Länge eines Randlinien-Stücks. Kürzer = mehr Instanzen, nicht besser. */
  edgeLength: 8,
  /** Abstand der Randlinie von der Fahrbahnkante. */
  edgeInset: 0.35,

  dashLength: 5,
  dashPitch: 10,

  gullyPitch: 42,
  gullyInset: 0.7,
  gullySize: 0.68,

  patchPitch: 48,
  patchSize: [1.1, 3.2] as readonly [number, number],

  /**
   * Fußgängerüberweg an Kreuzungen.
   *
   * Die Streifen laufen **längs zur Fahrtrichtung**, nicht quer — so sieht ein
   * Zebrastreifen aus, und es ist der einzige Punkt, an dem man die Richtung
   * der Markierung falsch machen kann.
   *
   * Wo eine Kreuzung ist, steht in `roads.json`: der Generator rastet
   * anschließende Strecken auf die Hauptstrecke ein und notiert den Rücksprung
   * (`trimStart` / `trimEnd`). Der Überweg liegt genau dahinter — dort, wo das
   * Fahrbahn-Mesh anfängt.
   */
  crosswalk: {
    /** Breite eines Streifens quer zur Fahrbahn, in Metern. */
    stripe: 0.45,
    /** Lücke zwischen zwei Streifen. */
    gap: 0.32,
    /** Länge des Überwegs in Fahrtrichtung. */
    length: 3.6,
    /** Abstand hinter dem Rücksprung, in Metern. */
    offset: 2.5,
    /** Haltelinie: Breite in Fahrtrichtung und Abstand vor dem Überweg. */
    stopWidth: 0.4,
    stopGap: 1.4,
  },

  tirePitch: 6,
  /** Ab dieser Krümmung (1/m) wird gebremst. 1/45 m entspricht 0,022. */
  tireCurvature: 0.02,
  tireLength: 9,
} as const;

/** Struktur von assets/generated/roads/roads.json. */
export interface RoadFile {
  readonly seed: number;
  readonly sampleSpacing: number;
  readonly roads: readonly RoadData[];
  readonly measured: {
    readonly totalLength: number;
    readonly count: number;
  };
}

export interface RoadData {
  readonly id: string;
  readonly type: RoadType;
  readonly closed: boolean;
  readonly tags: readonly string[];
  /** Kontrollpunkte — was der Editor aus P3/3.2 bearbeitet. */
  readonly nodes: readonly {
    readonly pos: readonly [number, number, number];
    readonly width: number;
    readonly banking: number;
  }[];
  /**
   * Vorab abgetastete Mittellinie, flach als [x,y,z, x,y,z, …].
   *
   * Der Grund für diese Redundanz: Baker und Renderer sollen die Kurve **nicht
   * beide auswerten**. Täten sie es, müsste dieselbe Catmull-Rom-Formel an zwei
   * Stellen stehen, und eine Abweichung zwischen beiden zeigte sich als Rinne
   * im Terrain, die neben der Straße liegt. Ausgewertet wird genau einmal, im
   * Generator; alle anderen lesen das Ergebnis.
   */
  readonly centerline: readonly number[];
  readonly widths: readonly number[];
  readonly banking: readonly number[];
  readonly length: number;
  /**
   * Anschlüsse an andere Strecken — PLAN.md P3 / 3.5.
   *
   * Der Generator rastet Anfang und Ende einer offenen Strecke auf die
   * Mittellinie der Hauptstrecke ein und nagelt dort die Höhe fest. `moved`
   * sagt, wie weit dafür geschoben wurde; steht dort ein großer Wert, liegt der
   * Entwurfswegpunkt weit neben der gebauten Straße.
   */
  readonly junctions: readonly {
    readonly at: 'start' | 'end';
    readonly with: string;
    readonly moved: number;
    readonly height: number;
    readonly trim: number;
  }[];
  /**
   * Wie viel Mittellinie am Anfang bzw. Ende **nicht** vermascht wird, in Metern.
   *
   * An einer Kreuzung liegen beide Fahrbahnen nach dem Höhenabgleich exakt
   * aufeinander — und zwei koplanare Flächen streiten im Tiefenpuffer um jedes
   * Pixel. Statt die Flächen zu verschneiden (Bauarbeit für eine eigene Phase)
   * hört die anschließende Straße am Fahrbahnrand der Hauptstraße auf. Die
   * Lücke schließt der Böschungs-Einschnitt im Terrain, der beide Straßen
   * ohnehin auf eine gemeinsame Ebene bringt.
   */
  readonly trimStart: number;
  readonly trimEnd: number;
  /**
   * Abschnitte mit Leitplanke — PLAN.md P3 / 3.4.
   *
   * `side` ist −1 oder +1 quer zur Fahrtrichtung, `from`/`to` sind Bogenlängen
   * in Metern. Wo eine Planke steht, entscheidet der Generator: er misst den
   * Höhenabfall am Fuß der Böschung, und das kann nur, wer das Gelände **vor**
   * dem Einschneiden kennt.
   */
  readonly rails: readonly {
    readonly side: number;
    readonly from: number;
    readonly to: number;
  }[];
  readonly measured: {
    readonly minRadius: number;
    readonly maxGradient: number;
    readonly hairpins: number;
    /** Negativ = die Straße liegt unter dem Gelände, es muss abgetragen werden. */
    readonly deepestCut: number;
    readonly highestFill: number;
    /** Mittlerer Betrag der Erdbewegung über die ganze Strecke. */
    readonly meanEarthwork: number;
    readonly earthwork95: number;
    readonly worstAt: number;
    readonly gradientMargin: number;
    readonly gradientAttempts: number;
    /** Höhenunterschied zwischen Anfang und Ende, in Metern. */
    readonly climb: number;
    /** Streckenlänge, die dieser Höhenunterschied bei `maxGradient` braucht. */
    readonly neededLength: number;
    /** Gesamtlänge aller Leitplanken, beide Seiten summiert. */
    readonly railLength: number;
  };
}
