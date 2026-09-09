import {
  CatmullRomCurve3, DoubleSide, Group, Mesh, MeshStandardMaterial, Vector3,
} from 'three';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import { LocalSurfaces, SurfaceStack, type Point } from './LocalSurfaces';
import { SHALLOW_RUN, TERRACE_TRACK, shallowRunDepth } from './settlementLayout';

const DIRT = 0x6b5340;
const WATER = 0x4b9a93;
const WIDTH = 7;

/**
 * Terrace Track, Shallow Run — packed dirt and a 0,12 m crossing without a bake.
 *
 * Mill Lane already occupies `drive.ground.localSurfaces`. Replacing that slot
 * would drop the village floors into the pond, so this system **stacks**.
 */
export class TerraceOffroad implements System {
  readonly name = 'TerraceOffroad';
  readonly group = new Group();
  readonly track = new LocalSurfaces();
  readonly #stack = new SurfaceStack();
  #previous: DriveSystem['ground']['localSurfaces'] = null;
  #context: EngineContext | null = null;

  constructor(readonly drive: DriveSystem) {
    this.group.name = 'Terrace Track';
  }

  depth(x: number, z: number): number {
    return shallowRunDepth(x, z);
  }

  async init(context: EngineContext): Promise<void> {
    this.#context = context;
    context.scene.add(this.group);
    this.#build();
    this.#previous = this.drive.ground.localSurfaces;
    this.#stack.layers.length = 0;
    if (this.#previous) this.#stack.layers.push(this.#previous);
    this.#stack.layers.push(this.track);
    this.drive.ground.localSurfaces = this.#stack;
    this.drive.ground.localWater = this;
  }

  #ground(x: number, z: number): number {
    return this.drive.terrain!.getHeightAt(x, z);
  }

  #build(): void {
    const curve = new CatmullRomCurve3(
      TERRACE_TRACK.map(([x, z]) => new Vector3(x, 0, z)),
      false,
      'centripetal',
    );
    const count = Math.ceil(curve.getLength() / 1.5);
    const points = curve.getSpacedPoints(count);
    const ys = points.map((p) => {
      this.drive.ground.refresh(p.x, p.z, 0);
      return Math.max(this.#maxGround(p.x, p.z, WIDTH + 1) + 0.28, this.drive.height(p.x, p.z) + 0.12);
    });
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i <= count; i++) {
        ys[i] = Math.max(ys[i]!, ys[i - 1]! - points[i]!.distanceTo(points[i - 1]!) * 0.14);
      }
      for (let i = count - 1; i >= 0; i--) {
        ys[i] = Math.max(ys[i]!, ys[i + 1]! - points[i]!.distanceTo(points[i + 1]!) * 0.14);
      }
    }
    let prevL: Point | null = null;
    let prevR: Point | null = null;
    for (let i = 0; i <= count; i++) {
      const p = points[i]!;
      const before = points[Math.max(0, i - 1)]!;
      const after = points[Math.min(count, i + 1)]!;
      const dx = after.x - before.x;
      const dz = after.z - before.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dz / len;
      const nz = -dx / len;
      const y = ys[i]!;
      const l: Point = [p.x + nx * WIDTH / 2, y, p.z + nz * WIDTH / 2];
      const r: Point = [p.x - nx * WIDTH / 2, y, p.z - nz * WIDTH / 2];
      if (prevL && prevR) this.track.quad(prevL, prevR, r, l);
      prevL = l;
      prevR = r;
    }
    this.#ford();
    const dirt = new Mesh(
      this.track.geometry(),
      new MeshStandardMaterial({ color: DIRT, roughness: 0.96, side: DoubleSide }),
    );
    dirt.name = 'Terrace Track · packed dirt';
    dirt.receiveShadow = true;
    this.group.add(dirt);
  }

  #ford(): void {
    const { x, z, along, across, depth, heading } = SHALLOW_RUN;
    this.drive.ground.refresh(x, z, 0);
    const bed = Math.max(this.#maxGround(x, z, across) + 0.18, this.drive.height(x, z) + 0.08);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const nx = fz;
    const nz = -fx;
    const halfA = along / 2;
    const halfC = across / 2;
    const corner = (a: number, c: number, y: number): Point => [
      x + fx * a + nx * c,
      y,
      z + fz * a + nz * c,
    ];
    const a0 = -halfA, a1 = halfA, c0 = -halfC, c1 = halfC;
    this.track.quad(corner(a0, c0, bed), corner(a1, c0, bed), corner(a1, c1, bed), corner(a0, c1, bed));
    const waterY = bed + depth;
    const water = new LocalSurfaces();
    water.quad(corner(a0, c0, waterY), corner(a1, c0, waterY), corner(a1, c1, waterY), corner(a0, c1, waterY));
    const sheet = new Mesh(
      water.geometry(),
      new MeshStandardMaterial({
        color: WATER, roughness: 0.24, metalness: 0.2, side: DoubleSide, transparent: true, opacity: 0.72,
      }),
    );
    sheet.name = 'Shallow Run · 0.12 m crossing';
    this.group.add(sheet);
    const lipH = 0.22;
    for (const end of [-1, 1]) {
      const inner = end * (halfA - 3);
      const outer = end * (halfA + 2);
      this.track.quad(
        corner(inner, c0, bed),
        corner(outer, c0, bed + lipH),
        corner(outer, c1, bed + lipH),
        corner(inner, c1, bed),
      );
    }
  }

  #maxGround(x: number, z: number, span: number): number {
    let y = -Infinity;
    for (let dx = -span / 2; dx <= span / 2; dx += 1) {
      for (let dz = -span / 2; dz <= span / 2; dz += 1) {
        y = Math.max(y, this.#ground(x + dx, z + dz));
      }
    }
    return y;
  }

  update(): void {
    const camera = this.#context?.camera;
    if (!camera) return;
    this.group.visible = Math.hypot(camera.position.x + 680, camera.position.z - 250) < 1600;
  }

  dispose(): void {
    if (this.drive.ground.localSurfaces === this.#stack) {
      this.drive.ground.localSurfaces = this.#previous;
    }
    this.drive.ground.localWater = null;
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        const mat = o.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  }
}
