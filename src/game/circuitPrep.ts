import { CIRCUIT_PREP } from '@/config/arcade.config';

/**
 * Prepared-Circuit-Mitgliedschaft und Blend — WP6.
 *
 * Die Faktoren selbst stehen in `CIRCUIT_PREP`. Hier liegt nur die Geometrie
 * der Mischung, damit RoadGround und der Prüfstand dieselbe Rechnung lesen.
 */

export function isCircuitRoad(id: string, tags: readonly string[]): boolean {
  return id === 'needle-circuit' || tags.includes('circuit');
}

/**
 * 0 auf der Boxengasse, 1 auf der Ideallinie fern der Einfahrt.
 *
 * `distanceToEntrance` ist der Abstand zum nächsten Pit-Anschluss, nicht die
 * Bogenlänge: an einem T-Stück ist der Übergang ein Fleck, kein Band.
 */
export function preparedCircuitBlend(
  distanceFromCenter: number,
  halfWidth: number,
  distanceToEntrance: number,
): number {
  const lateral = 1 - clamp01((distanceFromCenter - halfWidth) / CIRCUIT_PREP.shoulderMeters);
  const gate = clamp01(distanceToEntrance / CIRCUIT_PREP.entranceMeters);
  return lateral * gate;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
