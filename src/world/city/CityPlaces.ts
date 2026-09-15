import { CatmullRomCurve3, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { CITY, CITY_GROUND_Y } from '@/config/city.config';
import type { CityCollider } from './CityGenerator';
import type { UrbanLot } from './UrbanLots';
import { LocalSurfaces, type Point } from '../settlements/LocalSurfaces';
import { SettlementKit } from '../settlements/SettlementKit';
import { getCityPlaceReserves, RAIN_GARDEN } from './cityPlacesLayout';
export { getCityPlaceReserves } from './cityPlacesLayout';

export interface CityPlacesInput {
  terrainHeight: (x: number, z: number) => number;
  roadHeight: (x: number, z: number) => number;
  /** Supply the loaded road file's lots; absent lots still build Rain Garden. */
  urbanLots?: readonly UrbanLot[];
}
export interface CityDestination { id: string; name: string; x: number; y: number; z: number; description: string }

const STONE = 0x929c91, DARK = 0x313c3c, WOOD = 0x725238, PATH = 0xb9b29b;
const CREAM = 0xd3cfba, GREEN = 0x62775b, GOLD = 0xffcf87;

/** Authored public spaces. Four compact vertex-color batches, no per-prop draw calls. */
export function buildCityPlaces(input: CityPlacesInput): {
  group: Group; colliders: CityCollider[]; floors: LocalSurfaces; destinations: CityDestination[]; dispose(): void;
} {
  const group = new Group(); group.name = 'City public places';
  const colliders: CityCollider[] = [], floors = new LocalSurfaces(), destinations: CityDestination[] = [];
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.83 });
  const glowMaterial = new MeshStandardMaterial({ vertexColors: true, emissive: GOLD, emissiveIntensity: 1.15, roughness: 0.45 });
  const waterMaterial = new MeshStandardMaterial({ color: 0x527d78, metalness: 0.32, roughness: 0.19 });
  const glow = new SettlementKit();
  const solid = (k: SettlementKit, x: number, y: number, z: number, w: number, h: number, d: number, color: number) => {
    k.box(x, y, z, w, h, d, color);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, bottom: y - h / 2, top: y + h / 2 });
  };
  const quad = (k: SettlementKit, points: readonly [Point, Point, Point, Point], color: number) => {
    const surface = new LocalSurfaces(); surface.quad(...points); floors.quad(...points);
    k.add(surface.geometry(), color, 0, 0, 0);
  };
  const flat = (k: SettlementKit, x: number, z: number, w: number, d: number, y: number, color: number) =>
    quad(k, [[x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2], [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2]], color);
  const bench = (k: SettlementKit, x: number, y: number, z: number, w = 3.5) => {
    solid(k, x, y + 0.48, z, w, 0.18, 0.78, WOOD);
    solid(k, x, y + 0.87, z - 0.34, w, 0.48, 0.14, WOOD);
    for (const s of [-1, 1]) solid(k, x + s * (w / 2 - 0.35), y + 0.2, z, 0.18, 0.4, 0.62, DARK);
  };
  const lantern = (k: SettlementKit, x: number, y: number, z: number) => {
    solid(k, x, y + 0.19, z, 1.05, 0.38, 1.05, STONE);
    solid(k, x, y + 0.9, z, 0.38, 1.15, 0.38, STONE);
    k.box(x, y + 1.5, z, 1.0, 0.18, 1.0, STONE);
    glow.box(x, y + 1.85, z, 0.6, 0.58, 0.6, GOLD);
    for (const dx of [-0.38, 0.38]) for (const dz of [-0.38, 0.38]) k.box(x + dx, y + 1.85, z + dz, 0.13, 0.62, 0.13, DARK);
    k.add(new CylinderGeometry(0.13, 0.86, 0.48, 4), STONE, x, y + 2.3, z, 0, Math.PI / 4);
    k.ball(x, y + 2.62, z, 0.13, STONE);
  };
  const tree = (k: SettlementKit, x: number, y: number, z: number, h: number, kind: 'pine' | 'maple' | 'cherry', seed: number) => {
    const trunk = kind === 'pine' ? 0.32 : 0.25;
    k.cylinder(x, y + h * 0.35, z, trunk, h * 0.7, WOOD, 0, 0, trunk * 0.58);
    colliders.push({ minX: x - trunk, maxX: x + trunk, minZ: z - trunk, maxZ: z + trunk, bottom: y, top: y + h * 0.65 });
    const colors = kind === 'cherry' ? [0xb77582, 0xe7b5be, 0xd998aa] : kind === 'maple' ? [0x9c412f, 0xb96634, 0x823d30] : [0x345449, 0x476a53, 0x536c51];
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4 + seed, r = i === 0 ? 0 : h * 0.22;
      const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
      const ty = y + h * (0.72 + 0.17 * Math.sin(i * 1.4));
      const canopy = new SphereGeometry(h * (kind === 'pine' ? 0.27 : 0.3), 9, 6);
      canopy.scale(1, kind === 'pine' ? 0.33 : 0.57, 1);
      k.add(canopy, colors[i % 3]!, tx, ty, tz);
      if (i > 0) {
        const dx = tx - x, dy = ty - (y + h * 0.45), dz = tz - z;
        const branch = new CylinderGeometry(0.055, 0.12, Math.hypot(dx, dy, dz), 6);
        branch.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(dx, dy, dz).normalize()));
        k.add(branch, WOOD, x + dx / 2, y + h * 0.45 + dy / 2, z + dz / 2);
      }
    }
  };
  const finish = (k: SettlementKit, name: string) => { const mesh = k.finish(group, material, name); mesh.castShadow = true; };

  // Rain Garden: its entire firm bed remains walkable, including shallow water.
  {
    const k = new SettlementKit(), y = CITY_GROUND_Y + CITY.sidewalk.height;
    const { minX, maxX, minZ, maxZ } = RAIN_GARDEN;
    k.box(705, y - 0.12, 15, 80, 0.24, 70, GREEN);
    flat(k, 705, 15, 80, 70, y + 0.004, GREEN);
    // Low stone boundaries, with a wide south entrance and east/west openings.
    solid(k, 705, y + 0.38, minZ + 0.4, 80, 0.76, 0.8, STONE);
    for (const x of [minX + 0.4, maxX - 0.4]) for (const z of [-7, 36]) solid(k, x, y + 0.38, z, 0.8, 0.76, 24, STONE);
    for (const [x, w] of [[680, 30], [725, 40]]) solid(k, x!, y + 0.38, maxZ - 0.4, w!, 0.76, 0.8, STONE);
    const path = (points: readonly (readonly [number, number])[], width: number) => {
      const curve = new CatmullRomCurve3(points.map(([x, z]) => new Vector3(x, y + 0.025, z)));
      for (let i = 0; i < 64; i++) {
        const a = curve.getPoint(i / 64), b = curve.getPoint((i + 1) / 64);
        const ta = curve.getTangent(i / 64), tb = curve.getTangent((i + 1) / 64);
        quad(k, [[a.x - ta.z * width / 2, a.y, a.z + ta.x * width / 2], [a.x + ta.z * width / 2, a.y, a.z - ta.x * width / 2],
          [b.x + tb.z * width / 2, b.y, b.z - tb.x * width / 2], [b.x - tb.z * width / 2, b.y, b.z + tb.x * width / 2]], PATH);
      }
    };
    path([[700, 50], [700, 36], [686, 27], [681, 12], [689, -4], [706, -9], [725, -3], [733, 13], [728, 33], [711, 39], [700, 36]], 3.7);
    path([[705, 32], [705, 22], [705, 0], [706, -9]], 4.0);
    // Organic pond silhouette, kept shallow above a solid garden bed.
    const pond = new CylinderGeometry(1, 1, 0.035, 48); pond.scale(16, 1, 8.2);
    const water = new Mesh(pond, waterMaterial); water.name = 'Rain Garden shallow pond'; water.position.set(709, y + 0.052, 11); water.receiveShadow = true; group.add(water);
    for (let i = 0; i < 36; i++) {
      const a = i * Math.PI * 2 / 36, x = 709 + Math.cos(a) * 16.4, z = 11 + Math.sin(a) * 8.55;
      if (Math.abs(x - 705) < 2.6) continue;
      const rock = new SphereGeometry(0.75 + (i % 3) * 0.12, 7, 5); rock.scale(1.3, 0.45, 0.85);
      k.add(rock, i % 2 ? STONE : 0x727f75, x, y + 0.18, z);
    }
    // Deck and collision share the same ramp heights; open ends connect to paths.
    for (let i = 0; i < 24; i++) {
      const za = -1 + i, zb = za + 1;
      const deckY = (z: number) => y + 0.025 + Math.min((z + 1) / 6, (23 - z) / 6, 1) * 0.95;
      const ya = deckY(za), yb = deckY(zb);
      quad(k, [[703, ya, za], [707, ya, za], [707, yb, zb], [703, yb, zb]], i % 2 ? WOOD : 0x876448);
      for (const x of [702.82, 707.18]) {
        for (const lift of [0.48, 1.05]) k.box(x, (ya + yb) / 2 + lift, (za + zb) / 2, 0.16, 0.13, Math.hypot(1, yb - ya), 0x773d2f, -Math.atan2(yb - ya, 1));
        colliders.push({ minX: x - 0.08, maxX: x + 0.08, minZ: za, maxZ: zb, bottom: Math.min(ya, yb), top: Math.max(ya, yb) + 1.12 });
        if (i % 3 === 0) k.box(x, ya + 0.6, za, 0.24, 1.2, 0.24, DARK);
      }
    }
    // Northern tea pavilion: open sides, pitched roof, slatted timber details.
    flat(k, 724, -8, 12, 9, y + 0.04, PATH);
    for (const x of [719, 729]) for (const z of [-11.5, -4.5]) solid(k, x, y + 2.0, z, 0.32, 4, 0.32, WOOD);
    for (const s of [-1, 1]) k.box(724 + s * 3.05, y + 4.7, -8, 6.7, 0.25, 10, DARK, 0, 0, -s * 0.26);
    k.box(724, y + 5.6, -8, 0.42, 0.28, 10.2, DARK);
    for (let x = 719; x <= 729; x += 1) k.box(x, y + 4, -8, 0.14, 0.2, 8.4, WOOD);
    bench(k, 724, y, -10.8, 7);
    for (const [x, z] of [[677, 23], [690, 38], [733, 30]]) bench(k, x!, y, z!);
    for (const [x, z] of [[696, 44], [704, 44], [681, 30], [679, 7], [697, -8], [735, 22], [722, 34]]) lantern(k, x!, y, z!);
    const trees: [number, number, number, 'pine' | 'maple' | 'cherry'][] = [
      [672, -11, 10, 'pine'], [684, -12, 9, 'cherry'], [711, -13, 8, 'maple'], [737, -12, 9, 'pine'],
      [672, 8, 9, 'maple'], [673, 38, 9, 'cherry'], [688, 44, 7, 'maple'], [714, 44, 8, 'cherry'],
      [737, 39, 9, 'pine'], [738, 8, 8, 'maple'], [688, 17, 7, 'pine'],
    ];
    trees.forEach(([x, z, h, kind], i) => tree(k, x, y, z, h, kind, i));
    finish(k, 'Rain Garden stone timber and canopy');
    destinations.push({ id: RAIN_GARDEN.id, name: RAIN_GARDEN.name, x: 700, y: y + 0.025, z: 40, description: 'A quiet pond, red bridge and lantern paths beneath maple and cherry trees.' });
  }

  for (const reserve of getCityPlaceReserves(input.urbanLots ?? [])) {
    if (!reserve.lot) continue;
    const lot = reserve.lot, k = new SettlementKit();
    const x = (lot.minX + lot.maxX) / 2, z = (lot.minZ + lot.maxZ) / 2, y = lot.top + 0.015;
    const w = lot.maxX - lot.minX, d = lot.maxZ - lot.minZ;
    const bottom = Math.min(lot.bottom, input.terrainHeight(x, z) - 0.2);
    k.box(x, (bottom + y - 0.18) / 2, z, w, y - 0.18 - bottom, d, STONE);
    // Reuse baked sidewalk height. The 15 cm lip is bevelled inside the reserve.
    flat(k, x, z, w - 2, d - 2, y, PATH);
    const rimY = lot.roadY;
    quad(k, [[lot.minX, rimY, lot.minZ], [lot.maxX, rimY, lot.minZ], [lot.maxX - 1, y, lot.minZ + 1], [lot.minX + 1, y, lot.minZ + 1]], STONE);
    quad(k, [[lot.minX + 1, y, lot.maxZ - 1], [lot.maxX - 1, y, lot.maxZ - 1], [lot.maxX, rimY, lot.maxZ], [lot.minX, rimY, lot.maxZ]], STONE);
    quad(k, [[lot.minX, rimY, lot.minZ], [lot.minX + 1, y, lot.minZ + 1], [lot.minX + 1, y, lot.maxZ - 1], [lot.minX, rimY, lot.maxZ]], STONE);
    quad(k, [[lot.maxX - 1, y, lot.minZ + 1], [lot.maxX, rimY, lot.minZ], [lot.maxX, rimY, lot.maxZ], [lot.maxX - 1, y, lot.maxZ - 1]], STONE);
    if (reserve.id === 'beacon-tower') {
      // Two unequal porcelain fins frame a luminous seam: an original skyline mark.
      solid(k, x, y + 1.3, z - 2, 12, 2.6, 10, DARK);
      for (const s of [-1, 1]) {
        const h = s < 0 ? 64 : 54;
        solid(k, x + s * 3.2, y + 2.6 + h / 2, z - 2, 4.1, h, 6.0, CREAM);
        for (let row = 0; row < h - 3; row += 3.8) k.box(x + s * 3.2, y + 4 + row, z + 1.025, 3.2, 0.42, 0.08, DARK);
        glow.box(x + s * 1.08, y + h / 2 + 2.6, z - 2, 0.13, h, 5.9, 0xffdcaa);
        solid(k, x + s * 3.2, y + h + 3.25, z - 2, 4.5, 1.3, 6.4, DARK);
      }
      solid(k, x, y + 47, z - 2, 10.8, 1.8, 5.2, DARK);
      glow.box(x, y + 47, z + 0.64, 10.2, 0.45, 0.06, GOLD);
      for (const dx of [-10, 10]) { bench(k, x + dx, y, z + 7, 3); tree(k, x + dx, y, z - 8, 6, 'pine', dx); }
      lantern(k, x - 7, y, z + 9); lantern(k, x + 7, y, z + 9);
      destinations.push({ id: reserve.id, name: reserve.name, x, y, z: z + 9, description: 'Twin porcelain fins and a warm illuminated seam rise above a stone courtyard.' });
    } else if (reserve.id === 'market-hall') {
      // A generous central aisle remains open all the way through the hall.
      for (const dx of [-10, 10]) for (const dz of [-9, 0, 9]) solid(k, x + dx, y + 3, z + dz, 0.32, 6, 0.32, WOOD);
      for (const dx of [-5.5, 5.5]) {
        k.box(x + dx, y + 6.8, z, 11.5, 0.24, 23, 0x43575a, 0, 0, -Math.sign(dx) * 0.17);
        for (let dz = -10.5; dz <= 10.5; dz += 1.5) k.box(x + dx, y + 6.6, z + dz, 11.2, 0.2, 0.16, WOOD, 0, 0, -Math.sign(dx) * 0.17);
      }
      k.box(x, y + 7.82, z, 0.45, 0.3, 23.4, DARK);
      for (const dx of [-7.8, 7.8]) for (const dz of [-6, 0, 6]) {
        solid(k, x + dx, y + 0.65, z + dz, 3.4, 1.3, 3.5, WOOD);
        k.box(x + dx, y + 1.35, z + dz, 3.6, 0.14, 3.7, PATH);
        k.box(x + dx, y + 3.2, z + dz, 4.0, 0.17, 4.4, dx < 0 ? 0x995548 : 0x507b76);
        for (let p = 0; p < 6; p++) k.ball(x + dx - 0.95 + (p % 3) * 0.7, y + 1.58, z + dz - 0.5 + Math.floor(p / 3), 0.25, [0xbb754a, 0x94a868, 0xcbbd6d][p % 3]!);
        glow.cylinder(x + dx * 0.5, y + 4.5, z + dz, 0.3, 0.7, GOLD);
      }
      destinations.push({ id: reserve.id, name: reserve.name, x, y, z: z + 10.5, description: 'Timber roof trusses, warm pendants and six colorful produce stalls around an open aisle.' });
    } else {
      solid(k, x, y + 0.65, z - 1, 6, 1.3, 6, DARK);
      solid(k, x, y + 2.4, z - 1, 0.7, 3.5, 0.7, STONE);
      // Abstract three-blade rotary sculpture, one static batched landmark.
      for (let blade = 0; blade < 3; blade++) {
        const a = blade * Math.PI * 2 / 3;
        k.box(x + Math.cos(a) * 2.3, y + 4.4, z - 1 + Math.sin(a) * 2.3, 5.3, 0.28, 1.15, 0xa78960, 0, -a, 0);
      }
      const ring = new TorusGeometry(5.0, 0.13, 6, 40); k.add(ring, CREAM, x, y + 4.7, z - 1, Math.PI / 2);
      glow.add(new TorusGeometry(3.2, 0.08, 6, 36), GOLD, x, y + 0.08, z - 1, Math.PI / 2);
      for (const dx of [-9, 9]) { bench(k, x + dx, y, z + 7, 4); tree(k, x + dx, y, z - 8, 7, 'cherry', dx); lantern(k, x + dx, y, z + 10); }
      destinations.push({ id: reserve.id, name: reserve.name, x, y, z: z + 8, description: 'A bronze three-blade sculpture and illuminated ring, framed by cherry trees and seating.' });
    }
    finish(k, reserve.name);
  }
  glow.finish(group, glowMaterial, 'City place warm lanterns and seams');
  return { group, colliders, floors, destinations, dispose() {
    group.traverse(o => { if (o instanceof Mesh) o.geometry.dispose(); });
    material.dispose(); glowMaterial.dispose(); waterMaterial.dispose(); group.removeFromParent(); group.clear();
  } };
}
