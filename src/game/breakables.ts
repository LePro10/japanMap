/**
 * Wann ein Hindernis nachgibt — Forza-Arcade, nicht Festigkeitslehre.
 *
 * Geprüft wird die **Annäherungsgeschwindigkeit in die Fläche**, nicht das
 * Tempo entlang der Planke. Ein Streifschuss bei 150 km/h mit 1 m/s in die
 * Normale darf stehen bleiben; ein Frontalanschlag ab rund 25 km/h reißt
 * das Stück weg. Ohne diese Trennung würde jede Schramme die ganze Strecke
 * demontieren.
 *
 * Energie und Mindesttempo müssen **beide** greifen. Die Energie allein
 * wäre bei einem streifenden Kontakt mit großem `v` und winzigem `v·n`
 * schon überschritten — genau der Fall, den die Normale rausfiltert.
 * Zahlen aus `tools/test-drive-physics.mjs` (m = 1150 kg):
 *
 * | Anfahrt | v·n | Energie | Planke | Baum |
 * |---|---:|---:|---|---|
 * | Schritt, 5 km/h frontal | −1,39 m/s | 1,1 kJ | nein | nein |
 * | 25 km/h frontal | −6,94 m/s | 27,7 kJ | ja | nein |
 * | 40 km/h frontal | −11,1 m/s | 71 kJ | ja | ja |
 * | 120 km/h, 1 m/s in die Normale | −1,0 m/s | 0,6 kJ | nein | nein |
 */

export const RAIL_BREAK_SPEED = 6.5;
export const RAIL_BREAK_ENERGY = 18_000;
export const TREE_BREAK_SPEED = 9;
export const TREE_BREAK_ENERGY = 28_000;

/** Höchstens so viele Stücke je Simulationsschritt — sonst reißt ein Drift die halbe Leitplanke. */
export const MAX_BREAKS_PER_STEP = 2;

/** Suchradius um das Auto herum, in Metern. Ein Chunk ist 64 m — 12 m bleiben in 1–4 Zellen. */
export const TREE_QUERY_RADIUS = 12;
export const TREE_QUERY_CAP = 48;

export type BreakKind = 'rail' | 'tree';

export interface BreakEvent {
  readonly kind: BreakKind;
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
}

export function shouldBreak(
  mass: number,
  approach: number,
  minSpeed: number,
  energy: number,
): boolean {
  if (approach >= 0) return false;
  const speed = -approach;
  if (speed < minSpeed) return false;
  return 0.5 * mass * speed * speed >= energy;
}

/**
 * Ortsfeste Kennung eines Baums. Dieselbe Mischung wie
 * `ScatterSystem.#instanceRoll` — zwei Bäume auf denselben Zentimeter
 * gibt die Streuung nicht her, und ein gebrochener Eintrag überlebt so
 * den Chunk-Cache, ohne die Instanz selbst zu speichern.
 */
export function treeKey(x: number, z: number): number {
  let h = Math.imul(Math.round(x * 100) | 0, 0x27d4eb2d) ^ 0x9e3779b9;
  h = Math.imul(h ^ (Math.round(z * 100) | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
