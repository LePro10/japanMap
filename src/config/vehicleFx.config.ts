import type { QualityKey, QualityLevel } from './quality.config';

/**
 * Driftspuren und Wasserspritzer — die sichtbare Hälfte des Fahrgefühls.
 *
 * ## Warum das kein Partikelsystem aus dem Regal ist
 *
 * Die Fahrschicht kostet gemessen **+4 Draw-Calls und +1024 Dreiecke**
 * (CLAUDE.md, P14). Ein klassisches GPU-Partikelsystem (Points + Shader +
 * eigener Durchgang) wäre der fünfte teure Posten in einer Szene, deren
 * Budgets (800 Draw-Calls, 3 Mio. Dreiecke) schon die Vegetation und die
 * PostFX-Kette tragen. Hier entstehen **zwei** InstancedMeshes, die nur
 * existieren, solange jemand fährt — im Freiflug sind sie unsichtbar und
 * zählen nicht.
 *
 * | | Ultra | Minimal |
 * |---|---|---|
 * | Driftspuren (Quads) | 256 | 32 |
 * | Spritzer (Quads) | 240 | 28 |
 * | Draw-Calls | 2 | 2 |
 * | Dreiecke | ~1000 | 120 |
 *
 * Das ist weniger als ein einziges Baum-Mesh. Die Puffer werden **einmal** auf
 * Ultra-Größe angelegt (derselbe Satz wie bei der Vegetation: ein späterer
 * Stufenwechsel darf nicht reallokieren). Weniger Stufe heißt weniger
 * *lebende* Instanzen, nicht ein kleinerer Puffer.
 *
 * ## Was hier bewusst nicht steht
 *
 *  - **Kein Reifenschwelbrand.** Derselbe Mesh könnte Staub tragen; der
 *    Auftrag ist Driftspur plus Wasserspritzer. Eine dritte Sorte wäre ein
 *    dritter Draw-Call für ein Bild, das die Spur schon trägt.
 *  - **Keine Spiegelung.** Der planare Durchgang zeichnet die Szene ein
 *    zweites Mal. Spuren auf der Stadtebene wären dort sichtbar — und würden
 *    den Durchgang um zwei Calls teurer machen, für ein Detail, das in der
 *    Pfütze untergeht. Deshalb steht `FahrzeugFX` auf der Ausschlussliste.
 *  - **Kein Download.** Die Stempel entstehen in einem Canvas. CrazyGames
 *    zählt jedes Byte bis zum ersten Bild.
 */

export interface FxBudget {
  /** Lebende Driftspuren, Ringpuffer. */
  readonly skids: number;
  /** Lebende Spritzer. */
  readonly splash: number;
  /** Faktor auf die Spawnrate der Spritzer, 0…1. */
  readonly splashRate: number;
}

export const FX_BUDGET: Readonly<Record<QualityLevel, FxBudget>> = {
  ultra: { skids: 256, splash: 240, splashRate: 1 },
  high: { skids: 192, splash: 170, splashRate: 0.85 },
  medium: { skids: 128, splash: 110, splashRate: 0.6 },
  low: { skids: 64, splash: 56, splashRate: 0.4 },
  minimal: { skids: 32, splash: 28, splashRate: 0.25 },
};

/** Puffergröße — das Maximum über die Leiter, einmal angelegt. */
export const FX_SKID_CAPACITY = FX_BUDGET.ultra.skids;
export const FX_SPLASH_CAPACITY = FX_BUDGET.ultra.splash;

export function fxBudgetFor(level: QualityKey): FxBudget {
  // „Eigen" hat keine eigene Leiter. Hoch ist die Mitte der sichtbaren Stufen
  // und überschreitet keinen Puffer, den Ultra bemisst.
  return level === 'custom' ? FX_BUDGET.high : FX_BUDGET[level];
}

export const SKID = {
  /**
   * Mindestabstand zweier Stempel desselben Rades, in Metern.
   *
   * 0,40 m bei 20 m/s sind 50 Stempel/s und Rad, vier Räder wären 200/s —
   * der Ultra-Puffer wäre in 1,3 s voll. 0,42 m schließt die Lücken, die
   * im Draufblick als gestrichelte Bahn zu lesen waren (gemessen P18).
   */
  spacing: 0.42,

  /** Breite eines Stempels, etwas über der Reifenbreite (0,21 m). */
  width: 0.28,
  /** Länge längs der Bahn. */
  length: 0.72,

  /**
   * Schräglauf, ab dem eine Spur entsteht, als Vielfaches von `peakSlipRear`.
   *
   * 0,70 heißt: erst im Plateau, nicht schon beim Einlenken. Sonst läge auf
   * jeder Kehre des Bergpasses eine Spur, und die *gemeinte* Driftspur wäre
   * nicht mehr zu lesen.
   */
  slipStart: 0.7,

  /** Durchdrehen, ab dem die Hinterräder markieren (1 = Haftgrenze). */
  spinStart: 1.08,

  /** Lebensdauer in Sekunden. Länger = dichtere Bahn, früherer Überlauf. */
  life: 6.5,

  /** Anheben über den Boden, zusätzlich zum polygonOffset. */
  lift: 0.045,

  /** Farbe auf Asphalt — fast schwarz, etwas warm, zur nassen Fahrbahn. */
  asphalt: 0x2a221c,
  /** Farbe auf Kies und Gelände. Heller als der Boden, sonst verschwindet sie. */
  dirt: 0x6a4a32,
} as const;

export const SPLASH = {
  /**
   * Lebensdauer. Kurz: das ist ein Strahl unter dem Rad, keine Fontäne.
   * Forza-Spritzer leben unter einer Sekunde und bilden den Bogen, weil
   * sie schnell fallen, nicht weil sie lange stehen.
   */
  life: 0.42,
  lifeJitter: 0.12,

  /** Breite des Streifens quer zur Flugbahn. */
  width: 0.09,
  widthJitter: 0.07,
  /** Länge längs der Flugbahn — das macht den Strahl, nicht den Kreis. */
  length: 0.48,
  lengthJitter: 0.28,

  /**
   * Spawnrate je Rad bei 20 m/s in tiefem Wasser.
   *
   * Hinten 1,7× (Antrieb). 42 · (2 + 2·1,7) ≈ 226/s. Bei 0,42 s Leben
   * rund 95 gleichzeitig — unter dem Ultra-Puffer von 240.
   */
  rateAt20: 58,
  rearBoost: 1.7,

  /** Extra-Instanzen, wenn ein Rad eintaucht. */
  entryBurst: 16,

  /** Aufwärts (m/s) plus Anteil des Tempos. */
  up: 2.4,
  upFromSpeed: 0.28,
  /** Nach außen, weg von der Fahrzeugmitte. */
  out: 3.6,
  outFromSpeed: 0.62,
  /** Nach hinten, gegen die Fahrtrichtung. */
  back: 2.2,
  backFromSpeed: 0.48,
  /** Wie viel der Wagengeschwindigkeit der Tropfen mitnimmt. Klein: sonst klebt der Strahl am Auto. */
  inherit: 0.22,

  gravity: 18,

  minDepth: 0.04,
  minSpeed: 1.2,

  /** Staub auf Kies/Gelände — dieselbe Mesh, andere Farbe. */
  dustRateAt20: 14,
  dustMinSpeed: 6,
} as const;
