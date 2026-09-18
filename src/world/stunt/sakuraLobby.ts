import {
  CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLE_ORDER, VEHICLES, type VehicleId } from '@/config/vehicles.config';
import { createCarBody, createCarWheel } from '@/game/carMesh';
import { LocalSurfaces, type Point } from '../settlements/LocalSurfaces';
import { SettlementKit } from '../settlements/SettlementKit';

const WOOD = 0x6a4a36, TRIM = 0x342c25, PLASTER = 0xc6b18c, STONE = 0x7a7d70;
const ROOF = 0x2a383e, GOLD = 0xfbd397, GRAVEL = 0x6e6a5e;
const CONCRETE = 0x6a6e68, PAPER = 0xffe4c0, SAKURA = 0xe8b8c4, STEEL = 0x3a4248;

export interface LobbyBox {
  minX: number; maxX: number; minZ: number; maxZ: number; y0: number; y1: number;
}

export interface ShowroomPad {
  id: VehicleId;
  x: number;
  z: number;
  yaw: number;
}

export interface LobbyDoor {
  x: number;
  z: number;
  tune: boolean;
}

export interface LobbyActor {
  x: number;
  z: number;
  yaw: number;
  sit: boolean;
}

export interface SakuraLobby {
  group: Group;
  floors: LocalSurfaces;
  colliders: LobbyBox[];
  pads: ShowroomPad[];
  doors: [LobbyDoor, LobbyDoor];
  petal: { x: number; z: number; w: number; d: number; y: number };
  bay: { x: number; z: number; w: number; d: number; y: number };
  bench: { x: number; z: number };
  turntable: Group;
  actors: LobbyActor[];
  setOwned(owned: ReadonlySet<VehicleId>): void;
  update(dt: number, time: number, height: (x: number, z: number) => number): void;
  dispose(): void;
}

export function lobbyOffsets(s: { x: number; z: number }): {
  petal: { x: number; z: number; w: number; d: number };
  bay: { x: number; z: number; w: number; d: number };
} {
  // WP2 kept shops at ±22, −32 so they sit in the first camera view.
  return {
    petal: { x: s.x - 22, z: s.z - 32, w: 22, d: 14 },
    bay: { x: s.x + 22, z: s.z - 32, w: 18, d: 14 },
  };
}

/**
 * Walk-in Petal Motors, drive-in Open Bay, court dressing. One solid kit, one
 * glow kit, merged showroom cars. No PointLights — dusk already lights the bowl.
 */
export function buildSakuraLobby(
  s: { x: number; z: number },
  height: (x: number, z: number) => number,
): SakuraLobby {
  const group = new Group();
  group.name = 'Sakura Commons lobby';
  const floors = new LocalSurfaces();
  const colliders: LobbyBox[] = [];
  const { petal: P, bay: B } = lobbyOffsets(s);
  const petalY = maxGround(height, P.x, P.z, P.w, P.d) + 0.12;
  const bayY = maxGround(height, B.x, B.z, B.w, B.d) + 0.1;
  const kit = new SettlementKit();
  const glow = new SettlementKit();

  const solid = (x: number, y: number, z: number, w: number, h: number, d: number, color: number): void => {
    kit.box(x, y, z, w, h, d, color);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, y0: y - h / 2, y1: y + h / 2 });
  };
  const slab = (x: number, z: number, w: number, d: number, y: number, color: number): void => {
    const corners: [Point, Point, Point, Point] = [
      [x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2],
      [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2],
    ];
    floors.quad(...corners);
    kit.box(x, y - 0.04, z, w, 0.08, d, color);
  };

  buildFloorSkirt(kit, P.x, P.z, P.w + 0.8, P.d + 0.8, petalY, height, WOOD);
  slab(P.x, P.z, P.w, P.d, petalY, 0x8a7a62);
  for (let x = P.x - P.w / 2 + 0.4; x < P.x + P.w / 2; x += 0.55)
    kit.box(x, petalY + 0.01, P.z, 0.03, 0.02, P.d - 0.4, 0x655b4b);
  buildShowroomShell(kit, glow, solid, P.x, petalY, P.z, P.w, P.d, 4.2);
  const pads = layoutPads(P.x, P.z, P.w, P.d);
  const turntablePad = pads.find(p => p.id === 'needle')!;
  const staticPads = pads.filter(p => p.id !== 'needle');
  for (const pad of pads) {
    const spec = VEHICLES[pad.id];
    kit.box(pad.x, petalY + 0.05, pad.z, spec.body.hullLength + 0.7, 0.1, spec.body.hullWidth + 0.55, STONE);
    glow.cylinder(pad.x, petalY + 3.55, pad.z, 0.22, 0.08, GOLD);
  }
  buildCollectionWall(kit, P.x, petalY, P.z, P.w, P.d);

  buildFloorSkirt(kit, B.x, B.z, B.w + 0.8, B.d + 0.8, bayY, height, STONE);
  slab(B.x, B.z, B.w, B.d, bayY, CONCRETE);
  const apron: [Point, Point, Point, Point] = [
    [B.x - 4, bayY, B.z + B.d / 2 - 0.2], [B.x + 4, bayY, B.z + B.d / 2 - 0.2],
    [B.x + 4.4, height(B.x + 4.4, B.z + B.d / 2 + 4) + 0.04, B.z + B.d / 2 + 4],
    [B.x - 4.4, height(B.x - 4.4, B.z + B.d / 2 + 4) + 0.04, B.z + B.d / 2 + 4],
  ];
  floors.quad(...apron);
  kit.add(quadGeom(apron), GRAVEL, 0, 0, 0);
  buildBayShell(kit, glow, solid, B.x, bayY, B.z, B.w, B.d, 4.1);
  const bench = { x: B.x - B.w / 2 + 1.6, z: B.z + 0.4 };
  buildBayProps(kit, glow, B.x, bayY, B.z, B.w, bench);

  buildCourt(kit, glow, s, height, P, B);

  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.04 });
  const glowMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  kit.finish(group, material, 'Sakura Commons timber');
  const glowMesh = new Mesh(glow.geometry(), glowMat);
  glowMesh.name = 'Sakura Commons lamps';
  group.add(glowMesh);

  const signs = [
    signMesh('花びらモータース', 'Petal Motors', 'WALK IN · BROWSE · BUY', P.x, petalY + 3.55, P.z + P.d / 2 + 0.14, 8.4),
    signMesh('オープンベイ', 'Open Bay', 'DRIVE IN · TUNE · FIT', B.x, bayY + 3.45, B.z + B.d / 2 + 0.14, 7.2),
  ];
  for (const sign of signs) group.add(sign);

  const carMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.15 });
  const staticMesh = mergeShowCars(staticPads, petalY, carMat);
  staticMesh.name = 'Petal Motors fleet';
  group.add(staticMesh);
  for (const pad of staticPads) carCollider(colliders, pad, petalY);

  const turntable = new Group();
  turntable.name = 'Petal turntable';
  turntable.position.set(turntablePad.x, petalY + VEHICLES.needle.chassis.cgHeight, turntablePad.z);
  const needleParts = posedCar(VEHICLES.needle, 0, 0, 0, 0);
  const needleGeom = mergeGeometries(needleParts, false);
  for (const p of needleParts) p.dispose();
  if (!needleGeom) throw new Error('Turntable car');
  const needleMesh = new Mesh(needleGeom, carMat);
  needleMesh.name = 'Needle 01';
  turntable.add(needleMesh);
  group.add(turntable);
  colliders.push({
    minX: turntablePad.x - 2.4, maxX: turntablePad.x + 2.4,
    minZ: turntablePad.z - 2.4, maxZ: turntablePad.z + 2.4,
    y0: petalY, y1: petalY + 1.4,
  });

  const plaques = makePlaques(P.x, petalY, P.z, P.d);
  group.add(plaques.mesh);

  const actors = courtActors(s, P, B);
  const people = makePeople(group);

  const doors: [LobbyDoor, LobbyDoor] = [
    { x: P.x, z: P.z + P.d / 2, tune: false },
    { x: B.x, z: B.z + B.d / 2, tune: true },
  ];

  return {
    group, floors, colliders, pads, doors,
    petal: { ...P, y: petalY },
    bay: { ...B, y: bayY },
    bench,
    turntable,
    actors,
    setOwned(owned) { plaques.setOwned(owned); },
    update(dt, time, ground) {
      turntable.rotation.y += dt * 0.28;
      people.update(time, ground, floors, actors);
    },
    dispose() {
      group.removeFromParent();
      const materials = new Set<MeshStandardMaterial | MeshBasicMaterial>();
      group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(mat as MeshStandardMaterial | MeshBasicMaterial);
        }
      });
      for (const mat of materials) {
        mat.map?.dispose();
        mat.dispose();
      }
    },
  };
}

function maxGround(height: (x: number, z: number) => number, x: number, z: number, w: number, d: number): number {
  let y = -Infinity;
  for (let dx = -w / 2; dx <= w / 2; dx += 1.5)
    for (let dz = -d / 2; dz <= d / 2; dz += 1.5)
      y = Math.max(y, height(x + dx, z + dz));
  return y;
}

function buildFloorSkirt(
  kit: SettlementKit, x: number, z: number, w: number, d: number, y: number,
  height: (x: number, z: number) => number, color: number,
): void {
  const base = Math.min(
    height(x - w / 2, z - d / 2), height(x + w / 2, z + d / 2),
    height(x - w / 2, z + d / 2), height(x + w / 2, z - d / 2),
  ) - 0.35;
  kit.box(x, (y + base) / 2, z, w, Math.max(0.3, y - base), d, color);
}

function buildShowroomShell(
  kit: SettlementKit, glow: SettlementKit,
  solid: (x: number, y: number, z: number, w: number, h: number, d: number, color: number) => void,
  x: number, y: number, z: number, w: number, d: number, doorW: number,
): void {
  const h = 4.15, wall = 0.28;
  const south = z + d / 2, north = z - d / 2;
  const wing = (w - doorW) / 2;
  for (const s of [-1, 1]) {
    solid(x + s * (doorW / 2 + wing / 2), y + h / 2, south, wing, h, wall, PLASTER);
    kit.box(x + s * (doorW / 2 + wing / 2), y + 1.15, south + 0.08, wing - 0.2, 0.18, 0.12, WOOD);
    for (const t of [-wing / 3, wing / 3]) {
      kit.box(x + s * (doorW / 2 + wing / 2 + t), y + 2.45, south + 0.1, 1.7, 1.4, 0.08, GOLD);
      glow.box(x + s * (doorW / 2 + wing / 2 + t), y + 2.45, south + 0.12, 1.5, 1.2, 0.04, PAPER);
    }
  }
  solid(x, y + h - 0.45, south, doorW + 0.3, 0.9, wall, PLASTER);
  kit.box(x, y + 2.55, south + 0.16, doorW + 0.2, 0.14, 1.1, WOOD, 0.1);
  glow.box(x, y + 2.9, south + 0.05, doorW - 0.2, 0.18, 0.08, 0xffd7a0);
  glow.box(x, y + 0.03, south + 0.7, doorW + 0.4, 0.05, 1.2, 0xffc77c);
  for (const s of [-1, 1]) kit.box(x + s * doorW / 2, y + 1.7, south + 0.02, 0.12, 3.4, 0.12, TRIM);
  for (const s of [-1.45, 1.45]) {
    kit.box(x + s, y + 1.55, south + 0.04, 0.7, 2.0, 0.03, SAKURA);
    kit.box(x + s, y + 2.58, south + 0.05, 0.74, 0.07, 0.04, TRIM);
  }
  solid(x, y + h / 2, north, w, h, wall, PLASTER);
  for (const side of [-1, 1]) {
    solid(x + side * w / 2, y + h / 2, z, wall, h, d, PLASTER);
    for (let i = -2; i <= 2; i++)
      kit.box(x + side * (w / 2 + 0.1), y + h / 2, z + i * (d / 5), 0.16, h, 0.16, WOOD);
  }
  for (const s of [-1, 1]) {
    kit.box(x + s * w / 4, y + 2.4, north - 0.08, 2.2, 1.5, 0.1, GOLD);
    glow.box(x + s * w / 4, y + 2.4, north - 0.1, 2.0, 1.3, 0.04, PAPER);
  }
  for (const s of [-1, 1])
    kit.box(x + s * (w / 2 + 0.08), y + h / 2, z, 0.18, h, d, WOOD);
  kit.box(x, y + 0.42, south + 0.02, w, 0.84, 0.18, WOOD);
  pitchRoof(kit, x, y + h, z, w, d, ROOF);
  for (const s of [-1, 1]) {
    glow.box(x + s * 4.2, y + 3.7, z + 1.5, 0.55, 0.7, 0.55, 0xffc077);
    kit.box(x + s * 4.2, y + 4.08, z + 1.5, 0.72, 0.08, 0.72, TRIM);
  }
}

function buildBayShell(
  kit: SettlementKit, glow: SettlementKit,
  solid: (x: number, y: number, z: number, w: number, h: number, d: number, color: number) => void,
  x: number, y: number, z: number, w: number, d: number, bayW: number,
): void {
  const h = 4.05, wall = 0.3, south = z + d / 2, north = z - d / 2;
  const wing = (w - bayW) / 2;
  for (const s of [-1, 1])
    solid(x + s * (bayW / 2 + wing / 2), y + h / 2, south, wing, h, wall, 0x5c6564);
  solid(x, y + h - 0.4, south, bayW + 0.4, 0.8, wall, 0x5c6564);
  kit.box(x, y + h - 0.05, south + 0.08, bayW + 0.6, 0.12, 0.35, STEEL);
  glow.box(x, y + 3.15, south + 0.06, bayW - 0.4, 0.16, 0.1, 0xffc077);
  glow.box(x, y + 0.03, south + 0.8, bayW + 0.3, 0.05, 1.4, 0xe8b56a);
  solid(x, y + h / 2, north, w, h, wall, 0x5c6564);
  for (const side of [-1, 1]) {
    solid(x + side * w / 2, y + h / 2, z, wall, h, d, 0x5c6564);
    for (let i = -2; i <= 2; i++)
      kit.box(x + side * (w / 2 + 0.12), y + h / 2, z + i * (d / 5), 0.18, h, 0.18, TRIM);
  }
  pitchRoof(kit, x, y + h, z, w, d, 0x2f3c40);
  for (const s of [-1, 0, 1]) {
    glow.cylinder(x + s * 3.4, y + 3.55, z, 0.28, 0.12, GOLD);
    kit.cylinder(x + s * 3.4, y + 3.72, z, 0.08, 0.35, STEEL);
  }
}

function pitchRoof(kit: SettlementKit, x: number, y: number, z: number, w: number, d: number, color: number): void {
  const pitch = 0.36, span = w / 2 + 0.95, rise = Math.sin(pitch) * span;
  for (const s of [-1, 1]) {
    kit.gable(x, y - 0.06, z + s * d / 2, w, Math.tan(pitch) * w / 2 + 0.18, 0.2, PLASTER);
    kit.box(x + s * span * Math.cos(pitch) / 2, y + rise / 2, z, span, 0.22, d + 1.9, color, 0, 0, -s * pitch);
    for (let j = -d / 2 - 0.6; j <= d / 2 + 0.7; j += 1.15)
      kit.box(x + s * span * Math.cos(pitch) / 2, y + rise / 2 + 0.14, z + j, span + 0.06, 0.08, 0.1, color, 0, 0, -s * pitch);
  }
  kit.box(x, y + rise + 0.12, z, 0.42, 0.28, d + 2.2, TRIM);
}

function buildBayProps(
  kit: SettlementKit, glow: SettlementKit,
  x: number, y: number, z: number, w: number, bench: { x: number; z: number },
): void {
  kit.box(bench.x, y + 0.92, bench.z, 1.9, 0.08, 0.72, WOOD);
  kit.box(bench.x, y + 0.45, bench.z, 1.7, 0.82, 0.62, STEEL);
  kit.box(bench.x + 0.55, y + 1.12, bench.z, 0.18, 0.28, 0.08, 0xc45a2a);
  glow.box(bench.x, y + 1.55, bench.z, 0.35, 0.12, 0.35, GOLD);
  const rackX = x + w / 2 - 0.7;
  for (let i = 0; i < 6; i++) kit.box(rackX, y + 1.1 + i * 0.32, z - 1.2, 0.08, 0.06, 1.8, STEEL);
  const stacks: Array<[number, number, number]> = [
    [x + 5.2, z - 3.4, 2], [x + 5.2, z - 1.6, 1], [x + 5.2, z + 0.4, 3],
  ];
  for (const [sx, sz, n] of stacks) {
    for (let i = 0; i < n; i++)
      kit.add(new TorusGeometry(0.32, 0.09, 6, 12), 0x1c1e20, sx, y + 0.34 + i * 0.2, sz, Math.PI / 2);
  }
  for (const s of [-1, 1]) {
    kit.cylinder(x + s * 2.1, y + 1.55, z - 2.4, 0.09, 3.1, STEEL);
    kit.box(x + s * 1.15, y + 0.12, z - 2.4, 0.7, 0.12, 0.55, STEEL);
  }
}

function buildCollectionWall(kit: SettlementKit, x: number, y: number, z: number, w: number, d: number): void {
  const wallZ = z - d / 2 + 0.45;
  kit.box(x, y + 1.7, wallZ, w - 1.2, 2.4, 0.08, 0x2a2420);
  kit.box(x, y + 2.95, wallZ + 0.04, 4.6, 0.28, 0.06, GOLD);
}

function buildCourt(
  kit: SettlementKit, glow: SettlementKit, s: { x: number; z: number },
  height: (x: number, z: number) => number,
  petal: { x: number; z: number; w: number; d: number },
  bay: { x: number; z: number; w: number; d: number },
): void {
  const lantern = (x: number, z: number): void => {
    const y = height(x, z);
    kit.box(x, y + 0.18, z, 0.95, 0.36, 0.95, STONE);
    kit.box(x, y + 0.85, z, 0.34, 1.05, 0.34, STONE);
    kit.box(x, y + 1.42, z, 0.92, 0.16, 0.92, STONE);
    glow.box(x, y + 1.78, z, 0.52, 0.5, 0.52, GOLD);
    for (const dx of [-0.32, 0.32]) for (const dz of [-0.32, 0.32])
      kit.box(x + dx, y + 1.78, z + dz, 0.12, 0.55, 0.12, TRIM);
    kit.add(new CylinderGeometry(0.12, 0.78, 0.42, 4), STONE, x, y + 2.2, z, 0, Math.PI / 4);
    kit.ball(x, y + 2.48, z, 0.12, STONE);
  };
  const bench = (x: number, z: number, yaw: number): void => {
    const y = height(x, z);
    kit.box(x, y + 0.46, z, 3.4, 0.16, 0.7, WOOD, 0, yaw);
    kit.box(x, y + 0.84, z - Math.cos(yaw) * 0.28, 3.4, 0.42, 0.12, WOOD, 0, yaw);
    for (const s of [-1, 1]) kit.box(x + s * 1.4 * Math.cos(yaw), y + 0.22, z + s * 1.4 * Math.sin(yaw), 0.16, 0.4, 0.55, TRIM, 0, yaw);
  };
  lantern(s.x - 16, s.z - 8);
  lantern(s.x + 16, s.z - 8);
  lantern(s.x - 11, s.z + 10);
  lantern(s.x + 11, s.z + 10);
  bench(s.x - 9.5, s.z + 6.5, 0.4);
  bench(s.x + 9.5, s.z + 6.5, -0.4);
  const umbrellaX = s.x - 12.5, umbrellaZ = s.z + 3.2, uy = height(umbrellaX, umbrellaZ);
  kit.cylinder(umbrellaX, uy + 1.15, umbrellaZ, 0.03, 2.3, TRIM);
  kit.add(new CylinderGeometry(0.08, 1.15, 0.22, 10), SAKURA, umbrellaX, uy + 2.28, umbrellaZ);
  kit.ball(umbrellaX, uy + 2.42, umbrellaZ, 0.07, TRIM);
  for (const x of [petal.x + petal.w / 2 + 1.4, bay.x - bay.w / 2 - 1.4]) {
    const z = s.z - 18, y = height(x, z);
    kit.box(x, y + 1.2, z, 0.16, 2.4, 0.16, TRIM);
    glow.box(x, y + 2.15, z, 0.5, 0.58, 0.5, 0xffc077);
    kit.box(x, y + 2.48, z, 0.7, 0.1, 0.7, ROOF);
  }
  const postZ = s.z - 6, postY = height(s.x, postZ);
  kit.box(s.x, postY + 1.15, postZ, 0.18, 2.3, 0.18, TRIM);
  kit.box(s.x, postY + 2.45, postZ, 1.6, 0.5, 0.08, GOLD);
}

export function layoutPads(cx: number, cz: number, w: number, d: number): ShowroomPad[] {
  const ids = VEHICLE_ORDER;
  const left = ids.slice(0, 4);
  const right = ids.slice(4, 8);
  const pads: ShowroomPad[] = [];
  const z0 = cz - d / 2 + 3.4, step = (d - 5.2) / 3;
  left.forEach((id, i) => {
    const spec = VEHICLES[id];
    pads.push({ id, x: cx - w / 2 + 0.55 + spec.body.hullLength / 2, z: z0 + i * step, yaw: Math.PI / 2 });
  });
  right.forEach((id, i) => {
    const spec = VEHICLES[id];
    pads.push({ id, x: cx + w / 2 - 0.55 - spec.body.hullLength / 2, z: z0 + i * step, yaw: -Math.PI / 2 });
  });
  pads.push({ id: 'gt', x: cx + 3.6, z: cz - d / 2 + 3.1, yaw: 0 });
  pads.push({ id: 'needle', x: cx - 3.6, z: cz - d / 2 + 3.1, yaw: 0 });
  return pads;
}

function posedCar(spec: (typeof VEHICLES)[VehicleId], x: number, y: number, z: number, yaw: number) {
  const parts = [];
  const body = createCarBody(spec);
  body.rotateY(yaw);
  body.translate(x, y, z);
  parts.push(body);
  const half = spec.chassis.track / 2;
  const wy = spec.chassis.wheelRadius - spec.chassis.cgHeight;
  const locals: Array<[number, number, number]> = [
    [-half, wy, spec.derived.cgToFront], [half, wy, spec.derived.cgToFront],
    [-half, wy, -spec.derived.cgToRear], [half, wy, -spec.derived.cgToRear],
  ];
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  for (const [lx, ly, lz] of locals) {
    const wheel = createCarWheel(spec);
    wheel.rotateY(yaw);
    wheel.translate(x + lx * c + lz * sn, y + ly, z - lx * sn + lz * c);
    parts.push(wheel);
  }
  return parts;
}

function mergeShowCars(pads: ShowroomPad[], floorY: number, material: MeshStandardMaterial): Mesh {
  const parts = [];
  for (const pad of pads) {
    const spec = VEHICLES[pad.id];
    parts.push(...posedCar(spec, pad.x, floorY + spec.chassis.cgHeight, pad.z, pad.yaw));
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('Showroom fleet');
  return new Mesh(merged, material);
}

function carCollider(colliders: LobbyBox[], pad: ShowroomPad, floorY: number): void {
  const spec = VEHICLES[pad.id];
  const along = Math.abs(Math.cos(pad.yaw)) > 0.7;
  const hx = (along ? spec.body.hullWidth : spec.body.hullLength) / 2 + 0.12;
  const hz = (along ? spec.body.hullLength : spec.body.hullWidth) / 2 + 0.12;
  colliders.push({
    minX: pad.x - hx, maxX: pad.x + hx, minZ: pad.z - hz, maxZ: pad.z + hz,
    y0: floorY, y1: floorY + spec.chassis.bodyHeight + 0.05,
  });
}

function signMesh(jp: string, en: string, sub: string, x: number, y: number, z: number, width: number): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1c2729'; ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = '#e8ba7f'; ctx.lineWidth = 8; ctx.strokeRect(18, 18, 988, 220);
  ctx.fillStyle = '#ffe6be'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 52px "Yu Gothic", sans-serif'; ctx.fillText(jp, 512, 70, 920);
  ctx.font = 'bold 58px sans-serif'; ctx.fillText(en, 512, 140, 920);
  ctx.font = '28px sans-serif'; ctx.fillStyle = '#c9b08a'; ctx.fillText(sub, 512, 200, 920);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(
    new PlaneGeometry(width, width * 0.25),
    new MeshBasicMaterial({ map: texture, side: DoubleSide, toneMapped: false }),
  );
  mesh.position.set(x, y, z);
  mesh.name = en;
  return mesh;
}

function quadGeom(corners: [Point, Point, Point, Point]) {
  const surface = new LocalSurfaces();
  surface.quad(...corners);
  return surface.geometry();
}

function makePlaques(cx: number, y: number, cz: number, d: number): {
  mesh: InstancedMesh; setOwned(owned: ReadonlySet<VehicleId>): void;
} {
  const kit = new SettlementKit();
  kit.box(0, 0, 0, 0.9, 0.42, 0.06, 0x2a2420);
  const mesh = new InstancedMesh(kit.geometry(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), VEHICLE_ORDER.length);
  mesh.name = 'Collection plaques';
  const matrix = new Matrix4();
  const color = new Color();
  const wallZ = cz - d / 2 + 0.52;
  VEHICLE_ORDER.forEach((_id, i) => {
    const px = cx - 8.1 + i * 1.8;
    matrix.makeTranslation(px, y + 1.55, wallZ);
    mesh.setMatrixAt(i, matrix);
    color.setHex(0x1a1816, 'srgb');
    mesh.setColorAt(i, color);
  });
  mesh.instanceColor!.needsUpdate = true;
  return {
    mesh,
    setOwned(owned) {
      VEHICLE_ORDER.forEach((id, i) => {
        color.setHex(owned.has(id) ? VEHICLES[id].body.paint : 0x1a1816, 'srgb');
        mesh.setColorAt(i, color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

function courtActors(
  s: { x: number; z: number },
  petal: { x: number; z: number; d: number },
  bay: { x: number; z: number; d: number },
): LobbyActor[] {
  return [
    { x: bay.x - 3.4, z: bay.z + bay.d / 2 + 1.6, yaw: 0.3, sit: false },
    { x: petal.x - 2.2, z: petal.z + petal.d / 2 + 2.1, yaw: -0.4, sit: false },
    { x: petal.x + 2.4, z: petal.z + petal.d / 2 + 1.8, yaw: 0.15, sit: false },
    { x: s.x - 12.4, z: s.z + 3.4, yaw: 1.1, sit: false },
    { x: s.x - 9.2, z: s.z + 6.2, yaw: 0.4, sit: true },
    { x: s.x + 9.3, z: s.z + 6.2, yaw: -0.4, sit: true },
  ];
}

function makePeople(group: Group): {
  update(time: number, ground: (x: number, z: number) => number, floors: LocalSurfaces, actors: LobbyActor[]): void;
} {
  const stand = new SettlementKit();
  stand.box(0, 1.05, 0, 0.48, 0.65, 0.28, 0x587a79);
  stand.ball(0, 1.65, 0, 0.21, 0xba9473);
  stand.cylinder(0, 1.84, 0, 0.38, 0.12, 0xc6ae7b, 0, 0, 0.2);
  for (const s of [-1, 1]) {
    stand.box(s * 0.15, 0.4, 0, 0.16, 0.75, 0.19, 0x404745);
    stand.box(s * 0.32, 1, 0.18, 0.15, 0.55, 0.15, 0x8c7b58, -0.5);
  }
  const sit = new SettlementKit();
  sit.box(0, 0.72, 0.05, 0.5, 0.55, 0.42, 0x4f6a6c);
  sit.ball(0, 1.18, 0.08, 0.2, 0xba9473);
  sit.cylinder(0, 1.36, 0.08, 0.34, 0.1, 0xc6ae7b, 0, 0, 0.18);
  sit.box(0, 0.42, 0.32, 0.42, 0.16, 0.5, 0x404745);
  for (const s of [-1, 1]) sit.box(s * 0.28, 0.78, 0.12, 0.14, 0.42, 0.14, 0x8c7b58, -0.4);
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
  const standing = new InstancedMesh(stand.geometry(), material, 4);
  const seated = new InstancedMesh(sit.geometry(), material, 2);
  standing.name = 'Commons visitors';
  seated.name = 'Commons seated';
  standing.frustumCulled = false;
  seated.frustumCulled = false;
  group.add(standing, seated);
  const matrix = new Matrix4();
  return {
    update(time, ground, floors, actors) {
      let standI = 0, sitI = 0;
      for (const actor of actors) {
        const bob = actor.sit ? 0 : Math.sin(time * 1.25 + actor.x) * 0.016;
        const y = Math.max(ground(actor.x, actor.z), floors.height(actor.x, actor.z));
        matrix.makeRotationY(actor.yaw + Math.sin(time * 0.55 + actor.z) * 0.1);
        matrix.setPosition(actor.x, y + bob, actor.z);
        if (actor.sit) { seated.setMatrixAt(sitI++, matrix); }
        else standing.setMatrixAt(standI++, matrix);
      }
      standing.instanceMatrix.needsUpdate = true;
      seated.instanceMatrix.needsUpdate = true;
    },
  };
}
