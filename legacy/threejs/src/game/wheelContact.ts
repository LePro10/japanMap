import type { Vector3 } from 'three';
import { GROUND_CONTACT } from '@/config/groundContact.config';

type WheelGround = { height(x: number, z: number): number };

function clearance(ground: WheelGround, anchor: Vector3, up: Vector3, radius: number, drop: number): number {
  return anchor.y - up.y * drop - radius -
    ground.height(anchor.x - up.x * drop, anchor.z - up.z * drop);
}

/** Solve at the actual rotated wheel position, bounded by suspension travel. */
export function wheelSuspensionDrop(
  ground: WheelGround, anchor: Vector3, up: Vector3, radius: number, min: number, max: number,
): number {
  // Common level-road/parked case: suspension motion does not move wheel XZ.
  if (up.y > 0.99 && Math.abs(up.x) + Math.abs(up.z) < 1e-5) {
    return Math.max(min, Math.min(max, (anchor.y - radius - ground.height(anchor.x, anchor.z)) / up.y));
  }
  if (clearance(ground, anchor, up, radius, min) <= 0) return min;
  if (clearance(ground, anchor, up, radius, max) >= 0) return max;
  let low = min, high = max;
  for (let i = 0; i < GROUND_CONTACT.wheelContactIterations; i++) {
    const middle = (low + high) * 0.5;
    if (clearance(ground, anchor, up, radius, middle) > 0) low = middle;
    else high = middle;
  }
  return (low + high) * 0.5;
}
