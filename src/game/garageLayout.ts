import { Vector3 } from 'three';

import { beltHeight, engineLook } from '@/config/engines.config';
import type { VehicleSpec } from '@/config/vehicles.config';

/**
 * Shared bay layout — hood hole, jack pads and camera aims.
 *
 * Kept out of `garageCar.ts` so tests can check the hole does not punch
 * through the undertray without pulling PropMaterial / GLSL into Node.
 */

export function hoodBox(spec: VehicleSpec): { min: Vector3; max: Vector3 } {
  const cg = spec.chassis.cgHeight;
  const halfL = spec.body.hullLength / 2;
  const halfW = spec.body.hullWidth / 2 * 0.88;
  const belt = beltHeight(spec) - cg;
  const rear = engineLook(spec.id).rear;
  // Cavity from the bonnet skin down to the painted tub — not through the
  // undertray, and not up into the windshield. A slab *above* the belt missed
  // the loft entirely (engine shot showed a second hood, no bay).
  const top = belt + 0.08;
  const floor = belt - 0.2;
  if (rear) {
    return {
      min: new Vector3(-halfW, floor, -halfL - 0.04),
      max: new Vector3(halfW, top, -halfL * 0.2),
    };
  }
  return {
    min: new Vector3(-halfW, floor, halfL * 0.34),
    max: new Vector3(halfW, top, halfL + 0.04),
  };
}

/**
 * Four jacking pads in car-local XZ, inside the track and inboard of both
 * axles. A beam through `z = ±wheelbase/2` is what baked the old lift into
 * the tyres — these points stay off the rubber on every identity.
 */
/** Rubber pad half-size used by the lift. Kept here so the clearance test
 *  matches the mesh, not a number copied by hand. */
export const LIFT_PAD = 0.18;

export function jackPoints(spec: VehicleSpec): ReadonlyArray<readonly [number, number]> {
  const halfTrack = spec.chassis.track / 2;
  const pad = LIFT_PAD / 2;
  const innerX = spec.body.shape === 'openwheel'
    ? Math.min(0.24, halfTrack * 0.45)
    : Math.min(
        halfTrack - spec.chassis.wheelWidth / 2 - pad - 0.05,
        spec.body.hullWidth * 0.32,
      );
  const x = Math.max(0.18, innerX);
  const axle = Math.min(spec.derived.cgToFront, spec.derived.cgToRear);
  const z = Math.max(0.28, axle - spec.chassis.wheelRadius - pad - 0.06);
  return [
    [-x, z],
    [x, z],
    [-x, -z],
    [x, -z],
  ];
}

/** Car origin Y so the sills rest on the pads and the wheels hang clear. */
export function garageSitHeight(spec: VehicleSpec, padTop: number): number {
  const chassisBottom = spec.clearance - spec.chassis.cgHeight;
  return padTop - chassisBottom + 0.03;
}

export function engineLocal(spec: VehicleSpec): { x: number; y: number; z: number } {
  const belt = beltHeight(spec);
  const rear = engineLook(spec.id).rear;
  const y = belt - spec.chassis.cgHeight - (rear ? 0.12 : 0.22);
  const z = rear ? -spec.body.hullLength * 0.22 : spec.body.hullLength * 0.28;
  return { x: 0, y, z };
}
