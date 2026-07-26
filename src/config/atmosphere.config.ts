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
