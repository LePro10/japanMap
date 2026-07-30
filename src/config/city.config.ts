import { CITY_DISTRICT, CITY_GROUND_Y, CITY_ROAD_LEVEL, type CityDistrict } from './city.mjs';

export { CITY_DISTRICT, CITY_GROUND_Y, CITY_ROAD_LEVEL };
export type { CityDistrict };

/**
 * Stadt — PLAN.md P6 / 6.1 bis 6.3, SPEC §2.1 („Stadt im Osten").
 *
 * Die Maße stehen hier und nicht im Generator, weil sie zusammen einen Look
 * ergeben und einzeln keinen: eine Etagenhöhe ohne Fensterraster ist eine Zahl,
 * beide zusammen sind ein Maßstab. Alles ist metrisch und gegen die
 * Referenzmaße des Projekts geeicht — eine Tür ist 2,00 m hoch (P5), ein
 * Erdgeschoss also nicht unter 3,5 m.
 */
export const CITY = {
  /**
   * Startwert des Zufallsstroms.
   *
   * Die Stadt entsteht zur Laufzeit, nicht im Baker — anders als Terrain,
   * Straßen und Props. Der Grund ist ihre Eingabe: sie besteht ausschließlich
   * aus dem Distriktkasten und dem Straßennetz, und beides liegt beim Start
   * ohnehin im Speicher. Ein Backschritt brächte eine weitere Datei, einen
   * weiteren Kettenglied-Zwang und keine einzige zusätzliche Messung.
   *
   * Der feste Seed leistet dabei das, wofür der Baker sonst da ist: zwei Läufe
   * ergeben dieselbe Stadt. Ohne ihn wäre jede Messung an einem Gebäude eine
   * Messung an einem anderen Gebäude.
   */
  seed: 20260728,

  /** Bodenplatte — die Asphaltebene des Distrikts. */
  ground: {
    /**
     * Wie weit die Platte **unter** der Fahrbahnebene liegt, in Metern.
     *
     * Nicht null. Die Stadtstraße liegt per Konstruktion exakt auf
     * `CITY_GROUND_Y` (siehe `city.mjs`), und zwei koplanare Flächen streiten
     * im Tiefenpuffer um jedes Pixel — derselbe Fehler, gegen den P3 den
     * Rücksprung an Kreuzungen eingeführt hat.
     *
     * 3 cm sind gemessen genug und wenig genug. Die Tiefenauflösung bei
     * `near = 0,5` beträgt rund z²/(near · 2²⁴): in 50 m sind das 0,3 mm, in
     * 200 m 4,8 mm, in 400 m 19 mm. Bei 3 cm Versatz trägt der Abstand also
     * bis etwa 500 m — weit über die Entfernung hinaus, aus der man den Bordstein
     * noch als Fläche sieht. Nach unten begrenzt ihn die Platte selbst: das
     * eingeschnittene Gelände steht im Distrikt bis 29,939 m hoch (gemessen,
     * 14 641 Proben), die Platte liegt bei 29,97 m und damit knapp darüber.
     */
    dropBelowRoad: 0.03,
    /** Wie weit die Schürze über den Distrikt hinausreicht, in Metern. */
    skirt: 24,
    /** Stützstellen je Distriktkante für die Schürze. */
    skirtSegments: 30,
  },

  /**
   * Blockbildung durch rekursive Teilung.
   *
   * Ein gleichmäßiges Raster wäre einfacher und sähe aus wie ein Tabellenblatt.
   * Die Teilung an einer zufälligen Stelle zwischen 38 % und 62 % erzeugt
   * Blöcke unterschiedlicher Größe und Ausrichtung, wie sie entstehen, wenn
   * eine Stadt über Jahrzehnte nachverdichtet wird.
   */
  block: {
    /** Ab dieser Kantenlänge wird nicht weiter geteilt, in Metern. */
    maxSize: 84,
    /** Kleiner darf ein Block nach einer Teilung nicht werden. */
    minSize: 32,
    splitLow: 0.38,
    splitHigh: 0.62,
    /**
     * Straßenbreite je Teilungstiefe, in Metern.
     *
     * Die erste Teilung zerlegt den ganzen Distrikt und bekommt die breiteste
     * Straße, die letzte trennt zwei Häuserzeilen und bekommt eine Gasse. So
     * entsteht die Hierarchie Hauptstraße → Nebenstraße → Gasse aus der
     * Konstruktion, statt nachträglich verteilt zu werden.
     */
    streetByDepth: [20, 14, 10, 7, 5],
  },

  /** Bürgersteig: die erhöhte Platte, auf der die Häuser eines Blocks stehen. */
  sidewalk: {
    height: 0.15,
    /** Wie weit der Bürgersteig über die Baugrenze hinausragt, in Metern. */
    overhang: 2.2,
  },

  /** Parzellenteilung innerhalb eines Blocks. */
  parcel: {
    maxSize: 26,
    minSize: 11,
    splitLow: 0.4,
    splitHigh: 0.6,
    /** Abstand des Baukörpers zur Parzellengrenze, in Metern. */
    setback: 0.55,
    /**
     * Anteil der Parzellen, die unbebaut bleiben.
     *
     * Ohne Lücken steht in jedem Block ein geschlossener Riegel. Die Lücken
     * sind Parkplätze, Hinterhöfe und Baulücken — in einer japanischen
     * Kleinstadt der Normalfall und im Bild das, was den Blick in den Block
     * hineinlässt.
     */
    vacancy: 0.14,
  },

  /** Baukörper. */
  building: {
    floorHeight: 3.4,
    /** Erdgeschosse sind höher — dort sind die Läden. */
    groundFloorHeight: 4.2,
    minFloors: 2,
    maxFloors: 17,
    /**
     * Etagenzahl über die Lage: Kern hoch, Rand niedrig.
     *
     * `coreRadius` ist der Abstand vom Distriktmittelpunkt, ab dem die Höhe
     * abzunehmen beginnt, `edgeRadius` der, ab dem nur noch die Grundhöhe
     * bleibt. Die Stadt bekommt damit eine Silhouette statt einer Platte —
     * aus der Ferne der einzige Unterschied zwischen „Stadt" und „Industriegebiet".
     */
    coreRadius: 60,
    edgeRadius: 220,
    coreFloors: 11,
    randomFloors: 5,
    /** Ab dieser Etagenzahl bekommt der Bau einen Rücksprung. */
    setbackFloors: 7,
    /** Anteil der Höhe, ab dem der Rücksprung sitzt. */
    setbackAt: 0.62,
    /** Wie weit der obere Körper zurückspringt, in Metern. */
    setbackDepth: 2.1,
    /** Brüstung auf dem Dach. */
    parapet: 0.85,
    parapetThickness: 0.3,
    /** Ladenzeile: Rücksprung und Höhe des Vordachs. */
    shopInset: 0.65,
    canopyDepth: 1.25,
    canopyThickness: 0.22,
  },

  /**
   * Fensterraster — der Maßstab, an dem man die Gebäudegröße abliest.
   *
   * Die UV der Fassade wird im Generator so gelegt, dass **eine Einheit genau
   * ein Fenster** ist. Das nominale Rastermaß wird dabei auf die tatsächliche
   * Wandlänge gerundet, damit an keiner Ecke ein halbes Fenster steht; der
   * Shader kann deshalb mit `fract()` und `floor()` arbeiten und muss keine
   * Rastermathematik kennen.
   */
  window: {
    nominalPitch: 3,
    minColumns: 1,
  },

  /** Freihaltung: wie weit Blöcke von einer befahrenen Straße wegbleiben. */
  clearance: {
    /** Abstand von der Straßenmitte, in Metern. */
    road: 12,
  },
} as const;

/** Höhe der Bodenplatte in Weltkoordinaten. */
export const CITY_SLAB_Y = CITY_GROUND_Y - CITY.ground.dropBelowRoad;

/**
 * Startwerte des Stadtlichts — Teil des Look-Zustands (P2 / 2.6).
 *
 * `windowLitFraction` ist die **Schwelle**, unter der ein Fenster dunkel
 * bleibt: 0,45 heißt also 55 % brennende Fenster. Für die blaue Stunde ist das
 * viel und absichtlich — SPEC §3.1 nennt das Fensterlicht als dominante urbane
 * Lichtquelle, und bei 20 % wirkt eine Stadt verlassen statt abendlich.
 *
 * `windowEmissive` ist die Leuchtdichte eines brennenden Fensters, bevor
 * Tonemapping und Bloom darauf wirken. Sie liegt über 1, weil genau das die
 * Bloom-Schwelle (0,62 im Preset) überschreiten soll: unter 1 bliebe das
 * Fenster ein heller Fleck ohne Halo, und der Halo ist bei blauer Stunde das,
 * was ein Fenster von einem weißen Rechteck unterscheidet.
 *
 * ## Warum 1,8 und nicht 3,2
 *
 * Der erste Wert war 3,2 und stammte aus dem Gefühl, nicht aus einer Messung.
 * Gemessen am Blickpunkt `stadt` mit einer **Maske** — Differenz gegen einen
 * Frame mit ausgeblendeter Stadt, also nur die Pixel, an denen die Stadt
 * überhaupt etwas ändert:
 *
 * | Emissive | Maske am Bild | mittlere Helligkeit | Spitze |
 * |---|---|---|---|
 * | 0    | 7,9 %  | 107,6 | 167,1 |
 * | 1,2  | 8,3 %  | 122,4 | 214,9 |
 * | **1,8** | **8,6 %** | **125,3** | **226,9** |
 * | 2,2  | 8,0 %  | 132,7 | 230,9 |
 * | 2,6  | 9,2 %  | 127,5 | 234,7 |
 * | 3,2  | 12,9 % | 116,2 | 237,7 |
 * | 4,5  | 26,2 % | 92,6  | 248,4 |
 *
 * Die Silhouette der Stadt deckt an diesem Blickpunkt **7,9 %** des Bildes.
 * Bis 2,6 bleibt die Maske in derselben Größenordnung; ab 3,2 wächst sie auf
 * das Anderthalb- und schließlich Dreifache — das ist kein Licht mehr, das ist
 * der Bloom-Halo, der über die Stadt hinauswächst und dabei die *mittlere*
 * Helligkeit wieder senkt, weil er halb transparenten Himmel mitzählt.
 *
 * Genau deshalb steht hier eine Maskenfläche und keine Bildhelligkeit: über das
 * ganze Bild gemittelt sieht 4,5 harmloser aus als 2,2. Derselbe Fehler hat in
 * P4 fünf Anläufe gekostet, siehe CLAUDE.md.
 */
export const CITY_LOOK = {
  windowLitFraction: 0.45,
  windowEmissive: 1.8,
} as const;
