import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';

import type { EngineContext } from '@/core/System';
import type { BreakEvent } from './breakables';

/**
 * Material-specific break fragments — one InstancedMesh, 48 recycled slots.
 *
 * Forza-Arcade: das Stück ist weg, drei bis fünf Brocken fliegen kurz, und
 * nach rund fünf Sekunden ist Ruhe. Kein zweites Mesh, kein Schatten, kein
 * eigener Draw-Call im Freiflug (`visible = false` bei null Lebenden).
 *
 * Ballistik ohne Geländeabfrage: die Spawn-Höhe ist der Boden, darunter
 * wird einmal abgefedert. Eine Sampler-Abfrage je Brocken je Frame wäre
 * für einen kurzlebigen Effekt der falsche Tausch.
 */

const CAP = 48;
const LIFE = 4.5;
const GRAVITY = 14;

export class DebrisFx {
  readonly group = new Group();

  #mesh: InstancedMesh | null = null;
  #geometry: BoxGeometry | null = null;
  #material: MeshStandardMaterial | null = null;

  readonly #life = new Float32Array(CAP);
  readonly #x = new Float32Array(CAP);
  readonly #y = new Float32Array(CAP);
  readonly #z = new Float32Array(CAP);
  readonly #vx = new Float32Array(CAP);
  readonly #vy = new Float32Array(CAP);
  readonly #vz = new Float32Array(CAP);
  readonly #spin = new Float32Array(CAP);
  readonly #angle = new Float32Array(CAP);
  readonly #sx = new Float32Array(CAP);
  readonly #sy = new Float32Array(CAP);
  readonly #sz = new Float32Array(CAP);
  readonly #floor = new Float32Array(CAP);
  #cursor = 0;
  #live = 0;
  #active = false;

  readonly #matrix = new Matrix4();
  readonly #quat = new Quaternion();
  readonly #scale = new Vector3();
  readonly #pos = new Vector3();
  readonly #axis = new Vector3(0.2, 0.95, 0.15).normalize();
  readonly #wood = new Color(0x5a3a1c);
  readonly #steel = new Color(0xb7c0c6);

  attach(context: EngineContext): void {
    this.group.name = 'Trümmer';
    this.group.visible = false;
    this.group.matrixAutoUpdate = false;

    const geometry = new BoxGeometry(1, 1, 1);
    this.#geometry = geometry;
    const material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.82,
      toneMapped: true,
    });
    material.name = 'TruemmerMaterial';
    this.#material = material;

    const mesh = new InstancedMesh(geometry, material, CAP);
    mesh.name = 'Trümmer:Stücke';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.#scale.set(0, 0, 0);
    this.#pos.set(0, -80, 0);
    for (let i = 0; i < CAP; i++) {
      this.#matrix.compose(this.#pos, this.#quat.identity(), this.#scale);
      mesh.setMatrixAt(i, this.#matrix);
      mesh.setColorAt(i, this.#wood);
    }
    this.#mesh = mesh;
    this.group.add(mesh);
    context.scene.add(this.group);
  }

  show(): void {
    this.#active = true;
  }

  hide(): void {
    this.#active = false;
    this.reset();
    this.group.visible = false;
  }

  reset(): void {
    this.#life.fill(0);
    this.#live = 0;
    // Restart contiguously: a later burst must not reveal stale lower slots.
    this.#cursor = 0;
    if (this.#mesh) this.#mesh.count = 0;
    this.group.visible = false;
  }

  burst(event: BreakEvent): void {
    if (!this.#active) return;
    const count = event.kind === 'tree' ? 6 : event.kind === 'crate' ? 6 : 4;
    for (let i = 0; i < count; i++) this.#spawn(event, i);
  }

  update(dt: number): void {
    if (!this.#active) return;
    const step = dt > 0.05 ? 0.05 : dt;
    const mesh = this.#mesh;
    if (!mesh) return;

    let live = 0;
    let last = -1;
    for (let i = 0; i < CAP; i++) {
      let life = this.#life[i]!;
      if (life <= 0) continue;
      life -= step;
      this.#life[i] = life;
      if (life <= 0) {
        this.#matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, this.#matrix);
        continue;
      }

      this.#vy[i]! -= GRAVITY * step;
      this.#x[i]! += this.#vx[i]! * step;
      this.#y[i]! += this.#vy[i]! * step;
      this.#z[i]! += this.#vz[i]! * step;
      this.#angle[i]! += this.#spin[i]! * step;

      const floor = this.#floor[i]! + Math.min(this.#sx[i]!, this.#sy[i]!, this.#sz[i]!) * 0.5;
      if (this.#y[i]! < floor) {
        this.#y[i] = floor;
        this.#vy[i]! *= -0.25;
        this.#vx[i]! *= 0.55;
        this.#vz[i]! *= 0.55;
        this.#spin[i]! *= 0.65;
      }

      const fade = life > 0.35 ? 1 : life / 0.35;
      this.#quat.setFromAxisAngle(this.#axis, this.#angle[i]!);
      this.#pos.set(this.#x[i]!, this.#y[i]!, this.#z[i]!);
      this.#scale.set(
        this.#sx[i]! * fade,
        this.#sy[i]! * fade,
        this.#sz[i]! * fade,
      );
      this.#matrix.compose(this.#pos, this.#quat, this.#scale);
      mesh.setMatrixAt(i, this.#matrix);
      live++;
      last = i;
    }

    this.#live = live;
    mesh.count = last < 0 ? 0 : last + 1;
    mesh.instanceMatrix.needsUpdate = true;
    this.group.visible = live > 0;
  }

  get live(): number {
    return this.#live;
  }

  dispose(): void {
    this.#mesh?.dispose();
    this.#geometry?.dispose();
    this.#material?.dispose();
    this.group.removeFromParent();
    this.#mesh = null;
    this.#geometry = null;
    this.#material = null;
  }

  #spawn(event: BreakEvent, salt: number): void {
    const mesh = this.#mesh;
    if (!mesh) return;
    const slot = this.#cursor % CAP;
    this.#cursor = slot + 1;

    const h = hash(event.x, event.z, salt);
    const h2 = hash(event.z, event.x, salt + 3);
    const h3 = hash(event.x + salt, event.z - salt, 7);
    const tree = event.kind === 'tree';
    const kick = tree ? 3 : 5;
    const nx = event.vx;
    const nz = event.vz;
    const run = Math.hypot(nx, nz) || 1;

    this.#x[slot] = event.x + (h - 0.5) * (tree ? 0.7 : 0.4);
    this.#y[slot] = event.y + (tree ? 0.6 + h2 * 1.4 : 0.35);
    this.#z[slot] = event.z + (h2 - 0.5) * (tree ? 0.7 : 0.4);
    this.#vx[slot] = (nx / run) * (3 + h * kick) + (h2 - 0.5) * 4;
    this.#vy[slot] = 1.5 + h3 * 3;
    this.#vz[slot] = (nz / run) * (3 + h2 * kick) + (h - 0.5) * 4;
    this.#spin[slot] = (h - 0.5) * 14;
    this.#angle[slot] = h * 6;
    this.#floor[slot] = event.y - 0.15;
    this.#life[slot] = LIFE * (0.75 + h3 * 0.4);

    if (tree) {
      const crown = salt >= 3;
      this.#sx[slot] = crown ? 1.8 + h : 0.3 + h * 0.25;
      this.#sy[slot] = crown ? 1.2 + h2 : 1.4 + h2 * 1.5;
      this.#sz[slot] = crown ? 1.8 + h3 : 0.3 + h3 * 0.2;
      mesh.setColorAt(slot, crown ? this.#wood.setHex(0x496b42) : this.#wood.setHex(0x795332));
    } else if (event.kind === 'crate' || event.kind === 'board') {
      this.#sx[slot] = 0.65 + h * 0.35;
      this.#sy[slot] = 0.08;
      this.#sz[slot] = event.kind === 'board' ? 0.55 : 0.35;
      mesh.setColorAt(slot, this.#wood.setHex(salt % 2 ? 0xc69a60 : 0x8e6440));
    } else if (event.kind === 'cone' || event.kind === 'barrel') {
      this.#sx[slot] = 0.25 + h * 0.15;
      this.#sy[slot] = 0.2 + h2 * 0.3;
      this.#sz[slot] = 0.12;
      mesh.setColorAt(slot, this.#wood.setHex(event.kind === 'cone' ? 0xe89548 : 0x5e8990));
    } else {
      this.#sx[slot] = 0.08 + h * 0.06;
      this.#sy[slot] = 0.12 + h2 * 0.1;
      this.#sz[slot] = 0.55 + h3 * 0.5;
      mesh.setColorAt(slot, this.#steel);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

function hash(x: number, z: number, salt: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return n - Math.floor(n);
}
