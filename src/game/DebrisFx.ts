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
 * Material-spezifische Bruchstücke — ein InstancedMesh, 64 recycelte Slots.
 *
 * Gemessen (und falsch) bis zu diesem Stand:
 *
 *  1. `event.y` war die Schwerpunkt-Höhe des Autos. Die Ballistik las sie als
 *     Boden, und die Brocken federte auf einer Ebene in Autohöhe. Auf dem
 *     Lastwagen schwebten sie über einem Meter in der Luft.
 *  2. Ein Baum verschwand erst am Ende des nächsten Streu-Durchlaufs. Die
 *     Kollision war in demselben Schritt weg — man fuhr durch einen Stamm, der
 *     noch stand, und sah danach sechs Würfel. Deshalb starten Baumstücke
 *     **als Baum** (Stamm plus Krone am Fuß) und kippen, bevor sie sich
 *     trennen.
 *  3. Leitplankenstücke waren 55 cm lange Splitter. Eine W-Planke ist ein
 *     Band; was man sieht, wenn man dagegen fährt, sind zwei, drei lange
 *     Bleche, die auf den Asphalt knallen, und ein Pfosten, der umfällt.
 *
 * Weiterhin **kein** zweites Mesh, kein Schatten, kein Draw-Call im Freiflug
 * (`visible = false` bei null Lebenden). Der Boden wird einmal beim Spawn
 * gesetzt — 64 Sampler-Abfragen je Frame wären für einen Effekt, der nach
 * wenigen Sekunden weg ist, der falsche Tausch, und `DriveSystem.height` an
 * einem fremden XZ lügt über den Straßenzusammenhang des Autos (P21).
 */

const CAP = 64;
/** Sichtbar 5–10 s, je nach Würfel. ASTRA nennt 8 s; die Rampe ist die Variation. */
const LIFE = 7.5;
const GRAVITY = 16;
const UNLOCK_TILT = 1.15;

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
  readonly #yaw = new Float32Array(CAP);
  readonly #sx = new Float32Array(CAP);
  readonly #sy = new Float32Array(CAP);
  readonly #sz = new Float32Array(CAP);
  readonly #floor = new Float32Array(CAP);
  readonly #lx = new Float32Array(CAP);
  readonly #ly = new Float32Array(CAP);
  readonly #lz = new Float32Array(CAP);
  readonly #hx = new Float32Array(CAP);
  readonly #hy = new Float32Array(CAP);
  readonly #hz = new Float32Array(CAP);
  readonly #ax = new Float32Array(CAP);
  readonly #az = new Float32Array(CAP);
  readonly #tilt = new Float32Array(CAP);
  readonly #omega = new Float32Array(CAP);
  readonly #locked = new Uint8Array(CAP);
  readonly #rest = new Uint8Array(CAP);
  #cursor = 0;
  #live = 0;
  #active = false;

  readonly #matrix = new Matrix4();
  readonly #quat = new Quaternion();
  readonly #spinQuat = new Quaternion();
  readonly #yawQuat = new Quaternion();
  readonly #scale = new Vector3();
  readonly #pos = new Vector3();
  readonly #axis = new Vector3();
  readonly #up = new Vector3(0, 1, 0);
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
    this.#locked.fill(0);
    this.#rest.fill(0);
    this.#live = 0;
    // Restart contiguously: a later burst must not reveal stale lower slots.
    this.#cursor = 0;
    if (this.#mesh) this.#mesh.count = 0;
    this.group.visible = false;
  }

  burst(event: BreakEvent): void {
    if (!this.#active) return;
    const count =
      event.kind === 'tree' ? 7 : event.kind === 'rail' ? 5 : event.kind === 'crate' ? 5 : 4;
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
        this.#locked[i] = 0;
        this.#rest[i] = 0;
        continue;
      }

      if (this.#locked[i]) this.#stepLocked(i, step);
      else if (!this.#rest[i]) this.#stepFree(i, step);

      this.#writeSlot(i, life > 1 ? 1 : life);
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

  #stepLocked(i: number, step: number): void {
    let tilt = this.#tilt[i]!;
    let omega = this.#omega[i]!;
    omega += 14 * Math.sin(tilt < 0.2 ? 0.2 : tilt) * step;
    tilt += omega * step;
    this.#omega[i] = omega;
    this.#tilt[i] = tilt;

    const ux = this.#ax[i]!;
    const uz = this.#az[i]!;
    const [wx, wy, wz] = rotateOffset(
      this.#lx[i]!,
      this.#ly[i]!,
      this.#lz[i]!,
      ux,
      uz,
      tilt,
    );
    this.#x[i] = this.#hx[i]! + wx;
    this.#y[i] = this.#hy[i]! + wy;
    this.#z[i] = this.#hz[i]! + wz;
    this.#angle[i]! += omega * step * 0.35;
    this.#yaw[i] = Math.atan2(ux, uz);

    const floor = this.#floor[i]! + restHalf(this.#sx[i]!, this.#sy[i]!, this.#sz[i]!);
    if (tilt >= UNLOCK_TILT || this.#y[i]! < floor) {
      this.#locked[i] = 0;
      // v = ω × r, gedämpft. Ohne den Faktor 0,22 schießt die Krone eines
      // 6-m-Stamms mit 20 m/s in den Himmel — das war der Würfelhaufen, den
      // man statt eines umfallenden Baums gesehen hat.
      const kick = 0.22;
      this.#vx[i] = -omega * uz * wy * kick + this.#vx[i]!;
      let vy = (omega * uz * wx - omega * ux * wz) * kick;
      if (vy > 4) vy = 4;
      if (vy < -1) vy = -1;
      this.#vy[i] = vy;
      this.#vz[i] = omega * ux * wy * kick + this.#vz[i]!;
      this.#spin[i] = omega * 0.8;
      if (this.#y[i]! < floor) {
        this.#y[i] = floor;
        this.#vy[i] = Math.abs(vy) * 0.35;
      }
    }
  }

  #stepFree(i: number, step: number): void {
    this.#vy[i]! -= GRAVITY * step;
    this.#x[i]! += this.#vx[i]! * step;
    this.#y[i]! += this.#vy[i]! * step;
    this.#z[i]! += this.#vz[i]! * step;
    this.#angle[i]! += this.#spin[i]! * step;

    const floor = this.#floor[i]! + restHalf(this.#sx[i]!, this.#sy[i]!, this.#sz[i]!);
    if (this.#y[i]! < floor) {
      this.#y[i] = floor;
      this.#vy[i]! *= -0.22;
      this.#vx[i]! *= 0.48;
      this.#vz[i]! *= 0.48;
      this.#spin[i]! *= 0.55;
      if (this.#vy[i]! > 0 && this.#vy[i]! < 1.1) this.#vy[i] = 0;
      const speed2 =
        this.#vx[i]! * this.#vx[i]! +
        this.#vy[i]! * this.#vy[i]! +
        this.#vz[i]! * this.#vz[i]!;
      if (speed2 < 0.45) {
        this.#vx[i] = 0;
        this.#vy[i] = 0;
        this.#vz[i] = 0;
        this.#spin[i] = 0;
        this.#rest[i] = 1;
      }
    }
  }

  #spawn(event: BreakEvent, salt: number): void {
    const mesh = this.#mesh;
    if (!mesh) return;
    const slot = this.#cursor % CAP;
    this.#cursor = slot + 1;

    const h = hash(event.x, event.z, salt);
    const h2 = hash(event.z, event.x, salt + 3);
    const h3 = hash(event.x + salt, event.z - salt, 7);
    const run = Math.hypot(event.vx, event.vz) || 1;
    const fx = event.vx / run;
    const fz = event.vz / run;
    const nx = event.nx ?? -fx;
    const nz = event.nz ?? -fz;
    const nlen = Math.hypot(nx, nz) || 1;

    this.#life[slot] = LIFE * (0.82 + h3 * 0.4);
    this.#rest[slot] = 0;
    this.#locked[slot] = 0;
    this.#floor[slot] = event.y;
    this.#spin[slot] = (h - 0.5) * 10;
    this.#angle[slot] = h * 4;
    this.#yaw[slot] = 0;

    if (event.kind === 'tree') this.#spawnTree(slot, event, salt, h, h2, h3, fx, fz);
    else if (event.kind === 'rail') this.#spawnRail(slot, event, salt, h, h2, h3, fx, fz, nx / nlen, nz / nlen);
    else this.#spawnProp(slot, event, salt, h, h2, h3, fx, fz);

    this.#writeSlot(slot, 1);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (slot >= mesh.count) mesh.count = slot + 1;
    this.group.visible = true;
  }

  #writeSlot(i: number, fade: number): void {
    const mesh = this.#mesh;
    if (!mesh) return;
    this.#axis.set(0.18, 0.96, 0.2).normalize();
    this.#spinQuat.setFromAxisAngle(this.#axis, this.#angle[i]!);
    this.#yawQuat.setFromAxisAngle(this.#up, this.#yaw[i]!);
    this.#quat.copy(this.#yawQuat).multiply(this.#spinQuat);
    this.#pos.set(this.#x[i]!, this.#y[i]!, this.#z[i]!);
    this.#scale.set(this.#sx[i]! * fade, this.#sy[i]! * fade, this.#sz[i]! * fade);
    this.#matrix.compose(this.#pos, this.#quat, this.#scale);
    mesh.setMatrixAt(i, this.#matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  #spawnTree(
    slot: number,
    event: BreakEvent,
    salt: number,
    h: number,
    h2: number,
    h3: number,
    fx: number,
    fz: number,
  ): void {
    const mesh = this.#mesh!;
    const height = event.height && event.height > 1 ? event.height : 6;
    const radius = event.radius && event.radius > 0.05 ? event.radius : 0.22;
    const impact = Math.hypot(event.vx, event.vz);
    // Achse so, dass ein Punkt auf +Y in Stoßrichtung kippt: u × ŷ = fall.
    const ux = fz;
    const uz = -fx;
    this.#hx[slot] = event.x;
    this.#hy[slot] = event.y;
    this.#hz[slot] = event.z;
    this.#ax[slot] = ux;
    this.#az[slot] = uz;
    this.#tilt[slot] = 0.16 + h * 0.08;
    this.#omega[slot] = 3.4 + Math.min(impact, 42) * 0.11;
    this.#vx[slot] = fx * (1.2 + h * 1.4);
    this.#vy[slot] = 0;
    this.#vz[slot] = fz * (1.2 + h2 * 1.4);
    this.#yaw[slot] = Math.atan2(ux, uz);

    if (salt === 0) {
      // Stumpf bleibt stehen — sonst ist nach dem Bruch an der Stelle nichts,
      // und bei Tempo sieht man den Treffer nicht.
      this.#lx[slot] = 0;
      this.#ly[slot] = 0.28;
      this.#lz[slot] = 0;
      this.#sx[slot] = radius * 2.3;
      this.#sy[slot] = 0.55;
      this.#sz[slot] = radius * 2.3;
      this.#x[slot] = event.x;
      this.#y[slot] = event.y + 0.28;
      this.#z[slot] = event.z;
      this.#locked[slot] = 0;
      this.#rest[slot] = 1;
      this.#vx[slot] = 0;
      this.#vy[slot] = 0;
      this.#vz[slot] = 0;
      this.#spin[slot] = 0;
      this.#life[slot] = LIFE * 1.15;
      mesh.setColorAt(slot, this.#wood.setHex(0x5c4028));
      return;
    }

    this.#locked[slot] = 1;
    if (salt === 1) {
      this.#lx[slot] = 0;
      this.#ly[slot] = height * 0.32;
      this.#lz[slot] = 0;
      this.#sx[slot] = radius * 1.9;
      this.#sy[slot] = height * 0.5;
      this.#sz[slot] = radius * 1.9;
      mesh.setColorAt(slot, this.#wood.setHex(0x6b4a2e));
    } else if (salt === 2) {
      this.#lx[slot] = (h - 0.5) * 0.15;
      this.#ly[slot] = height * 0.62;
      this.#lz[slot] = (h2 - 0.5) * 0.15;
      this.#sx[slot] = radius * 1.45;
      this.#sy[slot] = height * 0.38;
      this.#sz[slot] = radius * 1.45;
      mesh.setColorAt(slot, this.#wood.setHex(0x7a5634));
    } else if (salt === 3) {
      this.#lx[slot] = 0;
      this.#ly[slot] = height * 0.84;
      this.#lz[slot] = 0;
      this.#sx[slot] = height * 0.28 + h * 0.08;
      this.#sy[slot] = height * 0.22;
      this.#sz[slot] = height * 0.28 + h3 * 0.08;
      mesh.setColorAt(slot, this.#wood.setHex(0x3f5c38));
    } else if (salt === 4) {
      this.#lx[slot] = height * 0.12;
      this.#ly[slot] = height * 0.9;
      this.#lz[slot] = height * 0.06;
      this.#sx[slot] = height * 0.2;
      this.#sy[slot] = height * 0.16;
      this.#sz[slot] = height * 0.2;
      mesh.setColorAt(slot, this.#wood.setHex(0x4a6b3d));
    } else if (salt === 5) {
      this.#lx[slot] = -height * 0.1;
      this.#ly[slot] = height * 0.78;
      this.#lz[slot] = -height * 0.09;
      this.#sx[slot] = height * 0.18;
      this.#sy[slot] = height * 0.14;
      this.#sz[slot] = height * 0.18;
      mesh.setColorAt(slot, this.#wood.setHex(0x355232));
    } else {
      this.#lx[slot] = height * 0.08;
      this.#ly[slot] = height * 0.48;
      this.#lz[slot] = -height * 0.04;
      this.#sx[slot] = height * 0.22;
      this.#sy[slot] = radius * 1.2;
      this.#sz[slot] = radius * 1.2;
      mesh.setColorAt(slot, this.#wood.setHex(0x6e4e30));
    }

    const [wx, wy, wz] = rotateOffset(
      this.#lx[slot]!,
      this.#ly[slot]!,
      this.#lz[slot]!,
      ux,
      uz,
      this.#tilt[slot]!,
    );
    this.#x[slot] = event.x + wx;
    this.#y[slot] = event.y + wy;
    this.#z[slot] = event.z + wz;
  }

  #spawnRail(
    slot: number,
    event: BreakEvent,
    salt: number,
    h: number,
    h2: number,
    h3: number,
    fx: number,
    fz: number,
    nx: number,
    nz: number,
  ): void {
    const mesh = this.#mesh!;
    const tx = -nz;
    const tz = nx;
    const along = (salt - 1.5) * 1.15;
    this.#yaw[slot] = Math.atan2(tx, tz);
    this.#vx[slot] = fx * (2.2 + h * 3) + nx * (1.5 + h2 * 2) + (h - 0.5) * 1.4;
    this.#vz[slot] = fz * (2.2 + h2 * 3) + nz * (1.5 + h * 2) + (h2 - 0.5) * 1.4;
    this.#spin[slot] = (h - 0.5) * 12;

    if (salt === 4) {
      // Pfosten — steht, kippt, liegt. Nicht ein Würfel in Bandhöhe.
      this.#sx[slot] = 0.13;
      this.#sy[slot] = 0.92;
      this.#sz[slot] = 0.17;
      this.#x[slot] = event.x + nx * 0.05;
      this.#y[slot] = event.y + 0.46;
      this.#z[slot] = event.z + nz * 0.05;
      this.#vy[slot] = 1.1 + h3 * 1.6;
      this.#locked[slot] = 1;
      this.#hx[slot] = this.#x[slot]!;
      this.#hy[slot] = event.y;
      this.#hz[slot] = this.#z[slot]!;
      this.#lx[slot] = 0;
      this.#ly[slot] = 0.46;
      this.#lz[slot] = 0;
      // Dieselbe Achse wie beim Baum: u × ŷ zeigt in Stoßrichtung.
      this.#ax[slot] = fz;
      this.#az[slot] = -fx;
      this.#tilt[slot] = 0.2;
      this.#omega[slot] = 4.5 + Math.min(Math.hypot(event.vx, event.vz), 30) * 0.08;
      mesh.setColorAt(slot, this.#steel.setHex(0x8a9298));
      return;
    }

    // Lange Achse = +Z, `yaw` dreht +Z auf die Tangentenrichtung der Planke.
    this.#sx[slot] = 0.055;
    this.#sy[slot] = 0.11;
    this.#sz[slot] = 1.55 + h * 0.35;
    this.#x[slot] = event.x + tx * along + nx * 0.04;
    this.#y[slot] = event.y + 0.62 + h2 * 0.08;
    this.#z[slot] = event.z + tz * along + nz * 0.04;
    this.#vy[slot] = 0.8 + h3 * 1.8;
    mesh.setColorAt(slot, this.#steel.setHex(salt % 2 ? 0xc5ced4 : 0x9aa3a8));
  }

  #spawnProp(
    slot: number,
    event: BreakEvent,
    salt: number,
    h: number,
    h2: number,
    h3: number,
    fx: number,
    fz: number,
  ): void {
    const mesh = this.#mesh!;
    const kick = event.kind === 'barrel' ? 4 : 5.5;
    this.#x[slot] = event.x + (h - 0.5) * 0.45;
    this.#y[slot] = event.y + 0.38 + h2 * 0.25;
    this.#z[slot] = event.z + (h2 - 0.5) * 0.45;
    this.#vx[slot] = fx * (2.5 + h * kick) + (h2 - 0.5) * 3.2;
    this.#vy[slot] = 1.8 + h3 * 2.8;
    this.#vz[slot] = fz * (2.5 + h2 * kick) + (h - 0.5) * 3.2;
    this.#spin[slot] = (h - 0.5) * 14;
    this.#angle[slot] = h * 6;

    if (event.kind === 'crate' || event.kind === 'board') {
      this.#sx[slot] = 0.55 + h * 0.3;
      this.#sy[slot] = 0.07 + h2 * 0.04;
      this.#sz[slot] = event.kind === 'board' ? 0.5 : 0.32;
      mesh.setColorAt(slot, this.#wood.setHex(salt % 2 ? 0xc69a60 : 0x8e6440));
    } else if (event.kind === 'cone' || event.kind === 'barrel') {
      this.#sx[slot] = 0.22 + h * 0.14;
      this.#sy[slot] = 0.18 + h2 * 0.28;
      this.#sz[slot] = 0.12;
      mesh.setColorAt(slot, this.#wood.setHex(event.kind === 'cone' ? 0xe89548 : 0x5e8990));
    } else {
      this.#sx[slot] = 0.1 + h * 0.08;
      this.#sy[slot] = 0.1 + h2 * 0.08;
      this.#sz[slot] = 0.45 + h3 * 0.35;
      mesh.setColorAt(slot, this.#steel);
    }
  }
}

function restHalf(sx: number, sy: number, sz: number): number {
  const m = sx < sy ? (sx < sz ? sx : sz) : sy < sz ? sy : sz;
  const half = m * 0.45;
  return half < 0.04 ? 0.04 : half > 0.2 ? 0.2 : half;
}

/** Rodrigues um eine waagerechte Achse `(ux, 0, uz)`. */
function rotateOffset(
  lx: number,
  ly: number,
  lz: number,
  ux: number,
  uz: number,
  theta: number,
): [number, number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const k = 1 - c;
  const udot = ux * lx + uz * lz;
  return [
    lx * c + -uz * ly * s + ux * udot * k,
    ly * c + (uz * lx - ux * lz) * s,
    lz * c + ux * ly * s + uz * udot * k,
  ];
}

function hash(x: number, z: number, salt: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return n - Math.floor(n);
}
