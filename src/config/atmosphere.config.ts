/**
 * Atmosphäre — PLAN.md P2 / 2.2 und 2.3.
 *
 * Nebel und Geländeverschattung. Beides sind Eigenschaften der *Welt*, nicht
 * einzelner Materialien: dieselben Werte gelten für Terrain, Wasser und alles,
 * was ab P3 dazukommt.
 */

export const FOG = {
  /**
   * Bodennebel — dicht, niedrig, kühl.
   *
   * `density` ist die Dichte auf Meereshöhe pro Meter Weglänge, `falloff` die
   * Höhe, auf der sie um den Faktor e abfällt. Bei 26 m bleibt auf einem
   * 200-m-Kamm noch 0,04 % übrig: der Nebel liegt damit in den Tälern und nicht
   * über allem. Genau das ist das Akzeptanzkriterium der Phase.
   */
  ground: {
    density: 0.0029,
    falloff: 26,
    /**
     * Eigener Farbton, multiplikativ auf die aus dem Himmel gelesene Farbe.
     *
     * Bodennebel bekommt kaum direktes Licht ab — er steht im Schatten des
     * Geländes und wird fast nur vom Himmel beleuchtet. Ohne diese Abkühlung
     * übernimmt er die warme Sonnenseite des Panoramas und sieht aus wie Staub
     * statt wie Dunst nach Regen (SPEC §3.1).
     */
    tint: 0x8fa6bd,
    /** Anteil, mit dem der Bodennebel die Himmelsfarbe überhaupt übernimmt. */
    skyBlend: 0.45,
  },

  /**
   * Distanznebel — die Luftperspektive.
   *
   * Sehr dünn, aber über Kilometer wirksam. `falloff` ist bewusst groß: die
   * Luftsäule dünnt über die volle Gipfelhöhe hinweg nur langsam aus, sonst
   * stünden die Berge scharf vor einem verhangenen Vordergrund.
   */
  aerial: {
    density: 0.00021,
    falloff: 340,
    tint: 0xffffff,
    skyBlend: 1,
  },

  /**
   * Obergrenze der Verdeckung.
   *
   * Ohne Deckel verschwinden die Berge am Horizont vollständig in der Nebelfarbe
   * und die Silhouette der Welt geht verloren. 0,94 lässt gerade so viel
   * Kontrast stehen, dass die Kammlinie lesbar bleibt.
   */
  maxOpacity: 0.94,

  /**
   * Auflösung der Nebelfarben-Tabelle, die aus dem Himmels-HDRI entsteht.
   *
   * Die Nebelfarbe wird in Blickrichtung aus dem Himmel gelesen — das ist der
   * Unterschied zwischen „Nebel" und „grauem Schleier". Gelesen wird aber nicht
   * aus dem 4k-Panorama: dessen Sonnenscheibe ist übersteuert und würde als
   * greller Fleck im Nebel stehen. Stattdessen ein heruntergerechnetes,
   * gedeckeltes 64×32-Abbild — die Richtungsinformation bleibt, die Spitze geht.
   */
  lutWidth: 64,
  lutHeight: 32,
  /** Deckel für die Quellwerte beim Herunterrechnen. */
  lutClamp: 12,
} as const;

/**
 * Wolkenschatten — PLAN.md P8.4.
 *
 * ## Warum das der beste Posten dieser Phase ist
 *
 * Die Beleuchtung dieser Karte ist **vollständig gebacken**: feste
 * Sonnenrichtung aus dem HDRI, Verschattung als Textur (`shade.png`). Damit hat
 * die Welt keinen einzigen bewegten Lichtanteil — was sich bewegt, ist der Wind
 * in der Vegetation. Ein wandernder Wolkenschatten ist der einzige Effekt, der
 * dieser statischen Beleuchtung Bewegung gibt, und er kostet zwei
 * Texturabfragen.
 *
 * ## Zwei Lagen, nicht eine
 *
 * Eine einzelne gekachelte Rauschtextur verrät ihre Kachelung, sobald man über
 * sie hinwegfliegt — die Karte ist 3072 m, eine 1200-m-Kachel wiederholt sich
 * darauf zweieinhalbmal. Zwei Lagen mit **teilerfremden** Kantenlängen und
 * unterschiedlicher Geschwindigkeit multiplizieren sich zu einem Muster, dessen
 * Wiederholung weit außerhalb der Welt liegt.
 *
 * ## Was der Schatten anfassen darf
 *
 * Nur den **direkten** Sonnenanteil (`atmoShade().x`). Eine Wolke verdeckt die
 * Sonne, nicht den Himmel; das indirekte Licht käme darunter sogar leicht
 * *zunehmend* an. Auf die Himmelssicht (`.y`) wirkt er deshalb nicht.
 */
export const CLOUDS = {
  /** Auflösung der erzeugten Rauschtextur je Achse. */
  textureRes: 256,
  /** Oktaven im gebackenen FBM. Drei reichen für Wolkenränder. */
  octaves: 4,

  /**
   * Kantenlänge einer Kachel in Metern, je Lage.
   *
   * 1150 und 730 sind bewusst kein glattes Verhältnis: bei 1200/600 fiele jede
   * zweite Kachel der groben Lage mit einer der feinen zusammen, und das Muster
   * wiederholte sich schon nach 1200 m.
   */
  tileMeters: [1150, 730] as const,

  /** Metern pro Sekunde, je Lage. Die feine Lage zieht schneller. */
  speed: [7.5, 12] as const,

  /**
   * Windrichtung in der XZ-Ebene, normiert beim Anlegen.
   *
   * Zeigt nach Südosten, also **weg** von der Sonne (Azimut aus `sun.json`).
   * Umgekehrt zögen die Schatten auf den Betrachter zu, was bei 2,23°
   * Sonnenstand seltsam aussieht: die Wolken kämen aus der Richtung, in die
   * ihre eigenen Schatten fallen.
   */
  direction: [0.78, 0.63] as const,

  /**
   * Deckungsgrad: der Schwellwert im Rauschen, ab dem eine Wolke steht.
   *
   * 0,52 heißt „knapp die Hälfte", was für die blaue Stunde nach Regen
   * (SPEC §3.1) passt — aufreißende Bewölkung, keine geschlossene Decke.
   */
  coverage: 0.52,
  /** Breite des Übergangs von Sonne zu Schatten. Groß = weiche Ränder. */
  softness: 0.22,

  /**
   * Wie dunkel es unter einer Wolke wird, 0…1.
   *
   * **Nicht 1.** Ein Kernschatten von 100 % hieße, dass die Wolke die Sonne
   * vollständig verdeckt und darunter nur noch das IBL steht — das gibt es,
   * sieht bei einer 2,2°-Sonne aber wie ein Fehler aus, weil die Landschaft
   * dort schlagartig ihre Modellierung verliert. 0,55 nimmt gut die Hälfte.
   */
  strength: 0.55,
} as const;

/**
 * Was der Wolkenschatten **gemessen** tut.
 *
 * Maske aus der Differenz gegen ein Bild mit `strength = 0` (Summendifferenz
 * über 3), Ultra, 1280 × 720:
 *
 * | Blickpunkt | betroffen | Anteil | Ø Differenz | Spitze |
 * |---|---|---|---|---|
 * | `start`    | 171 548 Px | 18,61 % | 15,1 | 130 |
 * | `pass`     | 147 459 Px | 16,00 % |  9,5 | 114 |
 * | `reisfeld` | 146 925 Px | 15,94 % | **18,0** | 142 |
 * | `kueste`   |   4 131 Px |  0,45 % |  4,8 |  15 |
 *
 * Bei `start` bedeckt das Gelände 45,67 % des Bildes; der Schatten trifft dort
 * also **rund 40 % des sichtbaren Bodens**. Das ist der Deckungsgrad, den
 * `coverage` tatsächlich erzeugt — die 0,52 oben sind ein Schwellwert auf dem
 * geometrischen Mittel zweier Lagen und nicht selbst ein Flächenanteil.
 *
 * **`kueste` fällt aus der Reihe, und das ist richtig so.** Dort steht fast nur
 * Meer im Bild, und eine Wasserfläche bei 2,23° Sonnenstand lebt von der
 * Spiegelung des Himmels, nicht vom direkten Sonnenlicht. Wo keine Sonne
 * ankommt, kann eine Wolke keine wegnehmen. Am stärksten wirkt es umgekehrt auf
 * den Reisterrassen — flach, offen, besonnt.
 *
 * **Und er wandert:** bei stehender Kamera ändern sich nach 2 s Weltzeit
 * 12 448 Pixel (1,35 %), nach 10 s 98 725 (10,71 %). Das ist der einzige
 * bewegte Lichtanteil dieser Karte.
 */

/**
 * Wolkenebene — PLAN.md P8.4, Teil 2.
 *
 * ## Was hier fehlte, war nicht „Wolken"
 *
 * Der Plan ging davon aus, der Himmel sei leer. **Nachgemessen stimmt das
 * nicht:** das Himmels-HDRI trägt bereits Wolkenstruktur. Gemessen über die
 * Himmelspixel (alles ausgeblendet, was Geometrie ist):
 *
 * | Blickpunkt | Himmelsanteil | Ø Helligkeit | Streuung | Spanne |
 * |---|---|---|---|---|
 * | `start`      | 46,1 % | 185,4 | 13,2 | 151…210 |
 * | `pass`       | 46,4 % | 191,2 | 10,6 | 147…211 |
 * | `stadt-fern` | 36,2 % | 184,4 | 14,9 | 145…209 |
 *
 * Eine Streuung von 13 auf einem Mittelwert von 185 ist dünne, hohe Bewölkung —
 * vorhanden, aber ruhig. Was der Himmel nicht hat, ist **Bewegung**: das HDRI
 * steht still. Seit die Bodenschatten wandern, ist das ein sichtbarer
 * Widerspruch — unten zieht der Schatten, oben rührt sich nichts.
 *
 * Die Ebene ist deshalb bewusst **zurückhaltend** ausgelegt. Sie soll die
 * vorhandene Bewölkung nicht ersetzen und nicht überdecken, sondern ihr eine
 * zweite, ziehende Lage hinzufügen. Wer hier die Deckkraft hochdreht, bekommt
 * Matsch: zwei Wolkenfelder übereinander, von denen eines perspektivisch falsch
 * steht, weil es aus einem Panorama kommt.
 *
 * ## Warum eine projizierte Ebene und kein Volumen
 *
 * Volumetrische Wolken kosten einen Vollbilddurchgang mit Dutzenden
 * Abtastungen. Die Kamera kommt in dieser Karte auf 420 m (`stadt-luft`), eine
 * Wolkenschicht läge bei 1500 m — man flöge nie hindurch. Bezahlt würde also
 * ein Volumen, von dem nur die Unterseite je zu sehen ist. Die Projektion
 * liefert genau diese Unterseite, perspektivisch richtig, für einen Draw-Call.
 */
export const CLOUD_DOME = {
  /** Höhe der Schicht über Meereshöhe, in Metern. */
  height: 1500,

  /**
   * Kantenlänge einer Kachel in Metern, je Lage — deutlich größer als beim
   * Bodenschatten, weil die Schicht aus 1500 m Entfernung gesehen wird.
   */
  tileMeters: [4200, 2600] as const,
  speed: [11, 17] as const,

  /** Deckungsgrad und Randweichheit, wie beim Bodenschatten. */
  coverage: 0.58,
  softness: 0.24,

  /**
   * Höchste Deckkraft, 0…1.
   *
   * 0,35 und nicht mehr: die gemessene Streuung des vorhandenen Himmels liegt
   * bei 13 von 255. Eine Lage, die deutlich darüber hinausgeht, ersetzt das
   * HDRI, statt es zu ergänzen.
   */
  opacity: 0.35,

  /**
   * Ab welchem Sinus der Blickrichtung die Ebene ausgeblendet wird.
   *
   * Am Horizont läuft die Projektion `t = h / d.y` gegen unendlich: eine Kachel
   * deckt dort beliebig viele Pixel ab, und aus Wolken wird ein waagerechter
   * Streifen. Unterhalb von `fadeStart` wird deshalb ausgeblendet — dort steht
   * ohnehin die Luftperspektive.
   */
  fadeStart: 0.02,
  fadeEnd: 0.16,
} as const;

export const SHADE = {
  /**
   * Halbschatten-Breite in Grad, als Funktion der Verdeckerentfernung.
   *
   * Der Vergleich im Shader ist „Sonnenhöhe gegen Horizontwinkel". Weich wird
   * die Kante über einen Winkelbereich, nicht über eine Weltdistanz — und das
   * ist der Grund, warum die Werte so klein aussehen dürfen: bei einer Sonne
   * 2,2° über dem Horizont streckt sich ein halbes Grad Unschärfe am Boden über
   * viele Meter.
   */
  penumbraBaseDeg: 0.25,
  penumbraPerKmDeg: 0.3,

  /**
   * Restlicht im Kernschatten.
   *
   * Nicht physikalisch, sondern gegen ein praktisches Problem: bei 2,2°
   * Sonnenstand liegen 42 % der Karte im Schatten, und dort trägt nur noch das
   * IBL. Ein kleiner Sockel hält die Schattenflächen lesbar, ohne die
   * Schattenkante aufzuweichen.
   */
  ambientFloor: 0.04,

  /**
   * Wie stark die gebackene Himmelssicht auf das indirekte Licht wirkt.
   *
   * Diffus voll (1), spekular gedämpft: eine spiegelnde Fläche in einer Mulde
   * sieht immer noch den Himmel, den sie reflektiert. Volle Verdeckung auch auf
   * dem Spekular-Anteil lässt nasse Steine in Rinnen tot aussehen.
   */
  skyOcclusionDiffuse: 1,
  skyOcclusionSpecular: 0.55,
} as const;

/**
 * Struktur von assets/generated/terrain/shade.json.
 *
 * Die Kodierungsgrenzen stehen bewusst **in der Datei** und nicht hier als
 * Konstante: sie sind eine Eigenschaft der gebackenen Textur. Würden sie im
 * Code stehen und der Baker änderte sie, wäre der Fehler ein leicht falscher
 * Schattenwurf — nichts, was auffällt, und nichts, was eine Prüfung findet.
 */
export interface ShadeMeta {
  readonly file: string;
  readonly res: number;
  readonly spacing: number;
  readonly channels: readonly string[];
  readonly maxHorizonDeg: number;
  readonly maxOccluderDistance: number;
  readonly sun: {
    readonly direction: readonly [number, number, number];
    readonly elevationDeg: number;
    readonly azimuthDeg: number;
  };
  readonly measured: {
    readonly litFraction: number;
    readonly minSkyVisibility: number;
    readonly seconds: number;
  };
}
