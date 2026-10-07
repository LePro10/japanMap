/**
 * Typen zu `splineSampler.mjs`.
 *
 * Die Implementierung ist bewusst reines ESM, damit Node-Werkzeuge und Browser
 * dieselbe Kurve auswerten (Begründung dort im Kopfkommentar). Diese Datei
 * holt die Typprüfung zurück, ohne die Datei zu verdoppeln.
 */

/** Ein Kontrollpunkt, wie er in roads.json steht. */
export interface RoadNode {
  readonly pos: readonly [number, number, number];
  /** Fahrbahnbreite in Metern (Gesamtbreite, nicht halbe). */
  readonly width: number;
  /** Querneigung in Grad, positiv = Kurvenaußenseite höher. */
  readonly banking: number;
}

/** Gleichmäßig entlang der Bogenlänge abgetastete Mittellinie. */
export interface SampledSpline {
  /** x,y,z je Punkt. Länge = count * 3. */
  readonly positions: Float32Array;
  readonly widths: Float32Array;
  readonly banking: Float32Array;
  /** Bogenlänge bis zu diesem Punkt, in Metern. */
  readonly distances: Float32Array;
  /** Gesamtlänge in Metern. */
  readonly length: number;
  readonly closed: boolean;
  readonly count: number;
}

export interface SampleOptions {
  readonly closed?: boolean;
  /** Angestrebter Punktabstand in Metern. Wird auf eine ganze Zahl angepasst. */
  readonly spacing?: number;
  /** Parameterschritte je Segment für die Längenmessung. */
  readonly substeps?: number;
}

export function catmullRom(
  p0: readonly number[],
  p1: readonly number[],
  p2: readonly number[],
  p3: readonly number[],
  t: number,
  out: number[],
): number[];

export function sampleSpline(
  nodes: readonly RoadNode[],
  options?: SampleOptions,
): SampledSpline;

/** Kleinster Krümmungsradius in der XZ-Ebene, in Metern. */
export function minCurveRadius(sampled: SampledSpline, stride?: number): number;

/** Größte Längsneigung als Verhältnis (0,08 = 8 %). */
export function maxGradient(sampled: SampledSpline): number;
