import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { SetupId, TuneTier } from '@/config/tuning.config';
import type { VehicleSpec } from '@/config/vehicles.config';
import { createCarWheel } from './carMesh';

/**
 * Garage (and driving) wheel skins per tyre tier.
 *
 * Physics is untouched — this is the same radius and width the chassis
 * already has. Stock keeps the world-car wheel so a fitted stock car still
 * matches the one you drove in on. Street and Sport are different objects:
 * a five-spoke gunmetal lip and a gold racing mesh. Dirt setup adds tread
 * blocks on top of whichever rim is fitted.
 */

const color = new Color();

function paint(g: BufferGeometry, hex: number): BufferGeometry {
  color.setHex(hex, 'srgb');
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(a, 3));
  return g;
}

function part(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  hex: number,
): BufferGeometry {
  return paint(new BoxGeometry(w, h, d), hex).translate(x, y, z);
}

const TIRE = {
  stock: 0x191b1e,
  street: 0x121416,
  sport: 0x0c0d10,
  dirt: 0x2a241c,
  tread: 0x3a3228,
} as const;

function tireBarrel(
  r: number,
  w: number,
  hex: number,
  segments: number,
): BufferGeometry {
  const g = paint(new CylinderGeometry(r, r, w, segments), hex);
  g.rotateZ(Math.PI / 2);
  return g;
}

function addTread(
  out: BufferGeometry[],
  r: number,
  w: number,
  blocks: number,
): void {
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2;
    const y = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const block = part(w * 0.72, 0.055, 0.09, 0, y, z, TIRE.tread);
    block.rotateX(-a);
    out.push(block);
  }
}

function streetWheel(spec: VehicleSpec, dirt: boolean): BufferGeometry {
  const r = spec.chassis.wheelRadius;
  const w = spec.chassis.wheelWidth;
  const parts: BufferGeometry[] = [tireBarrel(r, w, dirt ? TIRE.dirt : TIRE.street, 22)];
  if (dirt) addTread(parts, r, w, 12);
  const gunmetal = 0x5c6570;
  const lip = 0xc5cdd4;
  for (const side of [-1, 1] as const) {
    const x = side * (w / 2 + 0.004);
    const ring = paint(new TorusGeometry(r * 0.72, r * 0.05, 5, 22), lip);
    ring.rotateY(Math.PI / 2).translate(x, 0, 0);
    parts.push(ring);
    const dish = paint(new CylinderGeometry(r * 0.62, r * 0.5, 0.03, 16), gunmetal);
    dish.rotateZ(Math.PI / 2).translate(x - side * 0.01, 0, 0);
    parts.push(dish);
    const hub = paint(new CylinderGeometry(r * 0.14, r * 0.14, 0.04, 10), lip);
    hub.rotateZ(Math.PI / 2).translate(x + side * 0.01, 0, 0);
    parts.push(hub);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.12;
      const spoke = part(0.038, r * 0.52, 0.07, 0, r * 0.3, 0, gunmetal);
      spoke.rotateX(a).translate(x, 0, 0);
      parts.push(spoke);
    }
  }
  return mergeOrThrow(parts, spec, 'street');
}

function sportWheel(spec: VehicleSpec, dirt: boolean): BufferGeometry {
  const r = spec.chassis.wheelRadius;
  const w = spec.chassis.wheelWidth;
  const parts: BufferGeometry[] = [tireBarrel(r, w, dirt ? TIRE.dirt : TIRE.sport, 24)];
  if (dirt) addTread(parts, r, w, 14);
  const gold = 0xc4a35a;
  const bright = 0xe8d5a0;
  const lock = 0xb42318;
  for (const side of [-1, 1] as const) {
    const x = side * (w / 2 + 0.006);
    const lip = paint(new TorusGeometry(r * 0.78, r * 0.042, 5, 24), bright);
    lip.rotateY(Math.PI / 2).translate(x, 0, 0);
    parts.push(lip);
    const inner = paint(new TorusGeometry(r * 0.58, r * 0.028, 4, 20), gold);
    inner.rotateY(Math.PI / 2).translate(x - side * 0.012, 0, 0);
    parts.push(inner);
    const dish = paint(new CylinderGeometry(r * 0.52, r * 0.36, 0.034, 18), gold);
    dish.rotateZ(Math.PI / 2).translate(x - side * 0.016, 0, 0);
    parts.push(dish);
    const nut = paint(new CylinderGeometry(r * 0.11, r * 0.13, 0.05, 12), lock);
    nut.rotateZ(Math.PI / 2).translate(x + side * 0.014, 0, 0);
    parts.push(nut);
    const cap = paint(new CylinderGeometry(r * 0.055, r * 0.055, 0.02, 8), bright);
    cap.rotateZ(Math.PI / 2).translate(x + side * 0.03, 0, 0);
    parts.push(cap);
    // Ten Y-spokes — the “F1 mesh” read from 3 m without a texture.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const spoke = part(0.018, r * 0.5, 0.045, 0, r * 0.28, 0, gold);
      spoke.rotateX(a).translate(x - side * 0.004, 0, 0);
      parts.push(spoke);
      const branch = part(0.014, r * 0.18, 0.03, 0, r * 0.5, 0.04, bright);
      branch.rotateX(a + 0.12).translate(x, 0, 0);
      parts.push(branch);
    }
    const stripe = paint(new TorusGeometry(r * 0.93, r * 0.012, 4, 24), lock);
    stripe.rotateY(Math.PI / 2).translate(x, 0, 0);
    parts.push(stripe);
  }
  return mergeOrThrow(parts, spec, 'sport');
}

function stockDirt(spec: VehicleSpec): BufferGeometry {
  const r = spec.chassis.wheelRadius;
  const w = spec.chassis.wheelWidth;
  const base = createCarWheel(spec);
  const extras: BufferGeometry[] = [base];
  addTread(extras, r, w, 12);
  const letter = paint(new TorusGeometry(r * 0.82, r * 0.02, 4, 18), 0xd8d0c4);
  letter.rotateY(Math.PI / 2).translate(w / 2 + 0.008, 0, 0);
  extras.push(letter);
  return mergeOrThrow(extras, spec, 'dirt');
}

function mergeOrThrow(
  parts: BufferGeometry[],
  spec: VehicleSpec,
  kind: string,
): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error(`Garage wheel: ${spec.id}/${kind}`);
  merged.computeBoundingSphere();
  merged.name = `Wheel:${spec.id}:${kind}`;
  return merged;
}

export function createGarageWheel(
  spec: VehicleSpec,
  tier: TuneTier,
  setup: SetupId = 'road',
): BufferGeometry {
  const dirt = setup === 'dirt';
  if (tier === 2) return sportWheel(spec, dirt);
  if (tier === 1) return streetWheel(spec, dirt);
  if (dirt) return stockDirt(spec);
  return createCarWheel(spec);
}
