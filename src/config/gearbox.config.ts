import type { VehicleId } from './vehicles.config';

/**
 * Das Getriebe, das man **hört** und am Drehzahlmesser **sieht** — Tonschicht 2.
 *
 * ## Warum es das gibt, obwohl das Fahrmodell stufenlos ist
 *
 * `arcadeDynamics` überträgt Kraft ohne Gänge, und daran ändert diese Datei
 * nichts: kein Wert hier fließt in eine Kraft. Bis zur Tonschicht 2 stand an
 * seiner Stelle ein Scheingetriebe aus fünf festen Tempobändern
 * (`AUDIO.engine.gearTopSpeeds`), **für alle zehn Autos dieselben** — der
 * Lastwagen mit 150 km/h Spitze schaltete bei denselben Tempi wie der
 * 305-km/h-Rennwagen und erreichte seinen fünften Gang nie. Die Drehzahl
 * sprang beim Schalten in einem Frame, es gab keine Schaltpause, keine
 * Kupplung, keinen Begrenzer, und das Gas hatte auf die Tonhöhe keinen
 * Einfluss. Genau das hat der Auftraggeber als „unspielbar beim Fahren und
 * Schalten" beschrieben.
 *
 * Jetzt hat jedes Fahrzeug eine eigene Übersetzungsreihe, abgeleitet aus
 * seinem gerechneten Endtempo (`topSpeed()` aus `arcade.config.ts`), eine
 * Schaltzeit, die zu seinem Getriebe passt (Wandler, Handschalter, DKG,
 * sequenziell), und eine Motorträgheit.
 *
 * ## Die Zahlen
 *
 * - `idle`/`redline`/`limiter` in min⁻¹. Der Begrenzer liegt über der
 *   Schaltdrehzahl, damit man ihn nur hört, wenn man ihn sucht (im Stand oder
 *   in der Luft Vollgas).
 * - `shiftTime` in s: Zugkraftunterbrechung beim Hochschalten.
 * - `revRise`/`revFall` in min⁻¹/s: wie schnell der **freie** Motor hochdreht
 *   und abfällt (ausgekuppelt, in der Luft, beim Schalten). Leichte Rennmotoren
 *   drehen schneller hoch als ein Dreizylinder-Lastwagen.
 * - `spread`: Exponent der Gangstufung — `Gang_i Spitze = v_max · (i/n)^spread`.
 *   Kleiner = enger gestuft oben (Sportgetriebe), größer = kurzer erster Gang
 *   (Nutzfahrzeug).
 */
export interface GearboxSpec {
  readonly gears: number;
  readonly idle: number;
  readonly redline: number;
  readonly limiter: number;
  readonly shiftTime: number;
  readonly revRise: number;
  readonly revFall: number;
  readonly spread: number;
}

export const GEARBOX: Readonly<Record<VehicleId, GearboxSpec>> = {
  touge: { gears: 5, idle: 850, redline: 7600, limiter: 7900, shiftTime: 0.22, revRise: 11000, revFall: 5200, spread: 0.72 },
  pip: { gears: 5, idle: 900, redline: 6800, limiter: 7100, shiftTime: 0.26, revRise: 9000, revFall: 5000, spread: 0.74 },
  truck: { gears: 5, idle: 720, redline: 5000, limiter: 5300, shiftTime: 0.42, revRise: 5200, revFall: 3200, spread: 0.85 },
  offroad: { gears: 6, idle: 750, redline: 5900, limiter: 6150, shiftTime: 0.34, revRise: 6800, revFall: 3800, spread: 0.8 },
  torrent: { gears: 6, idle: 950, redline: 7500, limiter: 7800, shiftTime: 0.1, revRise: 12500, revFall: 6500, spread: 0.7 },
  ribbon: { gears: 6, idle: 850, redline: 7700, limiter: 8000, shiftTime: 0.2, revRise: 10500, revFall: 5600, spread: 0.7 },
  meridian: { gears: 7, idle: 700, redline: 7000, limiter: 7200, shiftTime: 0.12, revRise: 9000, revFall: 4600, spread: 0.72 },
  morrow: { gears: 6, idle: 650, redline: 6500, limiter: 6750, shiftTime: 0.3, revRise: 8000, revFall: 4200, spread: 0.74 },
  gt: { gears: 7, idle: 1000, redline: 8800, limiter: 9100, shiftTime: 0.09, revRise: 16000, revFall: 8000, spread: 0.68 },
  needle: { gears: 7, idle: 1500, redline: 10500, limiter: 10800, shiftTime: 0.06, revRise: 22000, revFall: 11000, spread: 0.66 },
};

/**
 * Schaltstrategie — gemeinsam für alle, weil sie das Verhalten eines
 * sportlichen Automaten beschreibt und nicht eines Fahrzeugs.
 */
export const SHIFT = {
  /** Hochschaltdrehzahl als Anteil der Nenndrehzahl, bei wenig und bei Vollgas. */
  upLow: 0.5,
  upHigh: 0.965,
  /** Rückschaltdrehzahl, bei wenig und bei Vollgas. */
  downLow: 0.26,
  downHigh: 0.5,
  /** Beim Bremsen: zurückschalten, solange der kleinere Gang unter diesem Anteil bleibt. */
  brakeDown: 0.74,
  /** Mindestabstand zwischen zwei Schaltvorgängen, in s — gegen Pendeln. */
  cooldown: 0.35,
  /**
   * Endtempo × diesen Faktor = Spitze des letzten Gangs an der Nenndrehzahl.
   * Etwas über 1, damit der letzte Gang das Endtempo knapp unter der
   * Nenndrehzahl erreicht — so fährt ein echtes Auto, und der Begrenzer bleibt
   * auf der Geraden still.
   */
  topGearMargin: 1.05,
  /** Kupplung beim Anfahren: Drehzahl, die Vollgas im ersten Gang hält, als Anteil. */
  launch: 0.5,
  /** Wie lange der Begrenzer den Sprit abstellt, in s. */
  limiterCut: 0.055,
} as const;
