import { Group, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';

import { CITY, CITY_DISTRICT, CITY_GROUND_Y, CITY_ROAD_LEVEL } from '@/config/city.config';
import type { QualityKey } from '@/config/quality.config';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import { walkerBody, walkerLeg } from '../settlements/funaura/funauraBuildings';
import { SettlementKit } from '../settlements/SettlementKit';
import type { CitySystem } from './CitySystem';
import type { TokyoStreetFurnitureSystem } from './TokyoStreetFurnitureSystem';

/**
 * Fußgänger auf den Gehwegen von Neo-Tokio — Review 2026-09.
 *
 * ## Warum
 *
 * Die Stadt war leer. `CityCrowd` (zwölf Kästen um den Mittelpunkt der alten
 * 360-m-Stadt) wurde mit dem Umbau abgeschaltet und nie ersetzt; Scramble,
 * Kabukichō und Akiba standen in jedem Review-Bild ohne einen Menschen, während
 * jedes Dorf Leute hat. TODO.md wünscht sich „ein paar, keine tausend" und
 * dazu, dass man sie **anfahren** kann: kein flaches Umfallen, sondern ein
 * Stoß, der mit dem Tempo wächst — „bei Vollgas fliegen sie fast".
 *
 * ## Wie
 *
 * Dieselben Figuren wie in den Dörfern (`walkerBody`/`walkerLeg`): je Aussehen
 * ein instanzierter Rumpf, zwei gemeinsame Bein-Meshes — sechs Draw-Calls für
 * alle. Jede Figur läuft eine Bordsteinschleife ab, 1,2 m innerhalb der Kante,
 * also auf dem Gehweg vor den Häusern. Kollision mit Häusern braucht es damit
 * nicht, und mit dem Auto nur als Nahabfrage: wer in 1,6 m Reichweite eines
 * fahrenden Wagens gerät, fliegt ballistisch mit dem Wagen mit, bleibt liegen
 * und steht nach ein paar Sekunden an seiner Schleife wieder auf.
 *
 * Kein Körper in `CollisionWorld`: ein Fußgänger, der ein Auto anhält, wäre ein
 * Physikproblem und kein Stadtbild (dieselbe Entscheidung wie in `CityCrowd`).
 * Der Wagen verliert beim Treffer ein wenig Tempo — TODO.md: „eine kleine
 * physische Kollision, aber nicht zu viel".
 */

/** Figuren je Stufe. `minimal` bleibt so billig wie vorher: keine. */
const COUNT: Readonly<Record<QualityKey, number>> = {
  ultra: 110,
  high: 90,
  medium: 64,
  low: 36,
  minimal: 0,
  custom: 64,
};
/** Abstand der Laufspur zur Bordsteinkante, zum Block hin, in Metern. */
const INSET = 1.2;
/** Reichweite eines Treffers um den Wagenmittelpunkt, in Metern. */
const HIT_RADIUS = 1.6;
/** Unter diesem Tempo schiebt der Wagen niemanden um, in m/s. */
const HIT_MIN_SPEED = 2.5;
/** Tempoverlust des Wagens je Treffer (Faktor). */
const HIT_DRAG = 0.95;
/** So lange liegt ein Getroffener, bevor er wieder aufsteht, in Sekunden. */
const DOWN_TIME = 3.5;
/**
 * **Die Leute sind dort, wo der Spieler ist.** Über die ganze Stadt verteilt
 * kamen 64 Figuren auf rund eine je 450 m Gehweg — im Bild stand niemand
 * (Review-Bilder an Scramble und Akiba, 2026-09). Wer weiter als `FAR` von der
 * Kamera weg ist, taucht auf einer Schleife in `NEAR` wieder auf, nie näher als
 * `POP`, damit niemand vor den Augen erscheint.
 */
const FAR = 160;
const NEAR = 110;
const POP = 35;
/** Außerhalb dieser Entfernung zur Stadt wird nichts gerechnet, in Metern. */
const ACTIVE_RANGE = 420;
const LOOKS = 4;
/** So weit weicht eine Figur einem Baumstamm aus, in Metern (Mitte zu Mitte). */
const TRUNK_CLEAR = 0.6;

/** Rasterzelle für die Stammsuche: 8 m, Schlüssel als eine Zahl. */
function cellKey(x: number, z: number): number {
  return Math.floor(x / 8) * 4096 + Math.floor(z / 8);
}

interface Loop {
  readonly pts: Float32Array; // x, z je Punkt, schon um INSET eingerückt
  readonly len: Float32Array; // kumulierte Länge je Punkt
  readonly total: number;
  readonly cx: number;
  readonly cz: number;
}

interface Walker {
  loop: Loop;
  s: number;
  dir: 1 | -1;
  speed: number;
  look: number;
  slot: number;
  // Getroffen: ballistischer Flug, dann Liegen.
  knocked: boolean;
  down: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  tumble: number;
  spin: number;
}

export class CityPedestrians implements System {
  readonly name = 'CityPedestrians';
  readonly group = new Group();

  #loops: Loop[] = [];
  #walkers: Walker[] = [];
  #bodies: InstancedMesh[] = [];
  #legs: InstancedMesh[] = [];
  #material: MeshStandardMaterial | null = null;
  #context: EngineContext | null = null;
  #time = 0;
  #wanted = COUNT.medium;
  #seed = 0x7c11e5;

  readonly #m = new Matrix4();
  readonly #leg = new Matrix4();
  readonly #q = new Quaternion();
  readonly #q2 = new Quaternion();
  readonly #v = new Vector3();
  readonly #one = new Vector3(1, 1, 1);
  readonly #axisY = new Vector3(0, 1, 0);
  readonly #axisX = new Vector3(1, 0, 0);

  constructor(
    private readonly drive: DriveSystem,
    private readonly city: CitySystem,
    private readonly furniture: TokyoStreetFurnitureSystem | null = null,
  ) {}

  init(context: EngineContext): void {
    this.#context = context;
    this.group.name = 'Stadt: Fußgänger';
    const roads = this.drive.roads;
    const walkY = CITY_GROUND_Y + CITY.sidewalk.height;

    // Schleifen einrücken. Innen ist die Seite mit mehr Abstand zur Fahrbahn —
    // dieselbe Probe wie bei den Straßenmöbeln, einmal je Schleife.
    const clearance = (x: number, z: number): number => {
      const hit = roads?.closestPoint(x, z, 30, CITY_ROAD_LEVEL);
      return hit ? hit.distance - hit.width / 2 : 30;
    };
    for (const loop of this.city.curbLines) {
      const n = loop.length / 2;
      if (n < 4) continue;
      let perimeter = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        perimeter += Math.hypot(loop[j * 2]! - loop[i * 2]!, loop[j * 2 + 1]! - loop[i * 2 + 1]!);
      }
      if (perimeter < 60) continue;
      const ax = loop[0]!, az = loop[1]!, bx = loop[2]!, bz = loop[3]!;
      const l = Math.hypot(bx - ax, bz - az) || 1;
      const tx = (bx - ax) / l, tz = (bz - az) / l;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const left = clearance(mx - tz * 1.2, mz + tx * 1.2) > clearance(mx + tz * 1.2, mz - tx * 1.2);
      const pts = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const p = (i - 1 + n) % n, q = (i + 1) % n;
        let dx = loop[q * 2]! - loop[p * 2]!, dz = loop[q * 2 + 1]! - loop[p * 2 + 1]!;
        const d = Math.hypot(dx, dz) || 1;
        dx /= d;
        dz /= d;
        const nx = left ? -dz : dz, nz = left ? dx : -dx;
        pts[i * 2] = loop[i * 2]! + nx * INSET;
        pts[i * 2 + 1] = loop[i * 2 + 1]! + nz * INSET;
      }
      const len = new Float32Array(n + 1);
      for (let i = 1; i <= n; i++) {
        const a = (i - 1) % n, b = i % n;
        len[i] = len[i - 1]! + Math.hypot(pts[b * 2]! - pts[a * 2]!, pts[b * 2 + 1]! - pts[a * 2 + 1]!);
      }
      let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) {
        cx += pts[i * 2]!;
        cz += pts[i * 2 + 1]!;
      }
      this.#loops.push({ pts, len, total: len[n]!, cx: cx / n, cz: cz / n });
    }
    if (this.#loops.length === 0) return;

    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
    this.#material = material;
    const max = COUNT.ultra;
    for (let look = 0; look < LOOKS; look++) {
      const kit = new SettlementKit();
      walkerBody(kit, look, look === 3);
      const mesh = new InstancedMesh(kit.geometry(), material, max);
      mesh.name = 'Stadt: Fußgänger';
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.#bodies.push(mesh);
      this.group.add(mesh);
    }
    for (let k = 0; k < 2; k++) {
      const kit = new SettlementKit();
      walkerLeg(kit);
      const mesh = new InstancedMesh(kit.geometry(), material, max);
      mesh.name = 'Stadt: Beine';
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.#legs.push(mesh);
      this.group.add(mesh);
    }

    // Längere Schleifen tragen mehr Leute: gewichtet nach Umfang würfeln.
    const perimeterSum = this.#loops.reduce((sum, l) => sum + l.total, 0);
    for (let i = 0; i < max; i++) {
      let pick = this.#random() * perimeterSum;
      let loop = this.#loops[0]!;
      for (const l of this.#loops) {
        pick -= l.total;
        if (pick <= 0) {
          loop = l;
          break;
        }
      }
      this.#walkers.push({
        loop,
        s: this.#random() * loop.total,
        dir: this.#random() < 0.5 ? 1 : -1,
        speed: 1.05 + this.#random() * 0.5,
        look: i % LOOKS,
        slot: 0,
        knocked: false,
        down: 0,
        x: 0,
        y: walkY,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        tumble: 0,
        spin: 0,
      });
    }
    // Stämme in ein grobes Raster, damit die Abfrage je Figur ein paar
    // Vergleiche kostet und nicht alle Bäume der Stadt.
    const trunks = this.furniture?.trunks ?? [];
    for (let i = 0; i < trunks.length; i += 2) {
      const key = cellKey(trunks[i]!, trunks[i + 1]!);
      let cell = this.#trunkCells.get(key);
      if (!cell) this.#trunkCells.set(key, (cell = []));
      cell.push(trunks[i]!, trunks[i + 1]!);
    }
    context.bus.on('quality:changed', ({ level }) => {
      this.#wanted = COUNT[level as QualityKey] ?? COUNT.medium;
    });
    context.scene.add(this.group);
    console.info(`[Tokio] Fußgänger: ${this.#loops.length} Gehwegschleifen, bis ${max} Figuren`);
  }

  update(dt: number): void {
    const context = this.#context;
    if (!context || this.#walkers.length === 0) return;
    const camera = context.camera.position;
    const cx = Math.max(CITY_DISTRICT.minX, Math.min(CITY_DISTRICT.maxX, camera.x));
    const cz = Math.max(CITY_DISTRICT.minZ, Math.min(CITY_DISTRICT.maxZ, camera.z));
    const visible = this.#wanted > 0 && Math.hypot(camera.x - cx, camera.z - cz) < ACTIVE_RANGE;
    this.group.visible = visible;
    if (!visible || this.drive.paused) return;
    const step = Math.min(dt, 0.05);
    this.#time += step;

    this.#recycle(camera.x, camera.z, Math.min(this.#wanted, this.#walkers.length));

    const car = this.drive.active ? this.drive.vehicle : null;
    const carSpeed = car ? Math.hypot(car.velocity.x, car.velocity.z) : 0;
    const walkY = CITY_GROUND_Y + CITY.sidewalk.height;

    const counts = [0, 0, 0, 0];
    let legs = 0;
    const count = Math.min(this.#wanted, this.#walkers.length);
    for (let i = 0; i < count; i++) {
      const w = this.#walkers[i]!;
      if (!w.knocked) {
        w.s = (w.s + w.dir * w.speed * step + w.loop.total) % w.loop.total;
        this.#place(w, walkY);
        if (car && carSpeed > HIT_MIN_SPEED) {
          const dx = w.x - car.position.x, dz = w.z - car.position.z;
          if (dx * dx + dz * dz < HIT_RADIUS * HIT_RADIUS && Math.abs(w.y - car.position.y) < 2.5) {
            this.#knock(w, car.velocity.x, car.velocity.z, carSpeed);
            car.velocity.x *= HIT_DRAG;
            car.velocity.z *= HIT_DRAG;
          }
        }
      } else {
        this.#fly(w, step);
      }

      const body = this.#bodies[w.look]!;
      const slot = counts[w.look]!++;
      this.#q.setFromAxisAngle(this.#axisY, w.yaw);
      if (w.knocked) this.#q.multiply(this.#q2.setFromAxisAngle(this.#axisX, w.tumble));
      const moving = !w.knocked;
      const phase = this.#time * w.speed * 2.6 + i;
      const bob = moving ? Math.abs(Math.cos(phase)) * 0.05 : 0;
      this.#m.compose(this.#v.set(w.x, w.y + bob, w.z), this.#q, this.#one);
      body.setMatrixAt(slot, this.#m);
      const swing = moving ? Math.sin(phase) * 0.5 : w.knocked && w.vy !== 0 ? Math.sin(this.#time * 14 + i) * 0.7 : 0;
      for (const [k, side] of [[0, -1], [1, 1]] as const) {
        this.#leg.makeRotationAxis(this.#axisX, swing * side).setPosition(side * 0.13, 0.82, 0);
        this.#legs[k]!.setMatrixAt(legs, this.#leg.premultiply(this.#m));
      }
      legs++;
    }
    for (let look = 0; look < LOOKS; look++) {
      const body = this.#bodies[look]!;
      body.count = counts[look]!;
      body.instanceMatrix.needsUpdate = true;
    }
    for (const leg of this.#legs) {
      leg.count = legs;
      leg.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of [...this.#bodies, ...this.#legs]) mesh.geometry.dispose();
    this.#material?.dispose();
    this.#context?.scene.remove(this.group);
  }

  /** Ein paar ferne Figuren je Frame in die Nähe der Kamera holen. */
  #recycle(x: number, z: number, count: number): void {
    let moved = 0;
    for (let i = 0; i < count && moved < 3; i++) {
      this.#cursor = (this.#cursor + 1) % count;
      const w = this.#walkers[this.#cursor]!;
      if (w.knocked || Math.hypot(w.x - x, w.z - z) < FAR) continue;
      for (let attempt = 0; attempt < 6; attempt++) {
        const loop = this.#loops[Math.floor(this.#random() * this.#loops.length)]!;
        if (Math.hypot(loop.cx - x, loop.cz - z) > NEAR + 40) continue;
        w.loop = loop;
        w.s = this.#random() * loop.total;
        this.#place(w, w.y);
        const d = Math.hypot(w.x - x, w.z - z);
        if (d >= POP && d <= NEAR) break;
      }
      moved++;
    }
  }

  #cursor = 0;

  /** Auf die Laufspur setzen: Position und Blickrichtung aus der Bogenlänge. */
  #place(w: Walker, y: number): void {
    const { pts, len, total } = w.loop;
    const n = pts.length / 2;
    const s = ((w.s % total) + total) % total;
    // Kurze Schleifen, lineare Suche genügt — je Figur höchstens ein paar Dutzend Punkte.
    let i = 1;
    while (i < n && len[i]! < s) i++;
    const a = (i - 1) % n, b = i % n;
    const seg = len[i]! - len[i - 1]!;
    const f = seg > 0 ? (s - len[i - 1]!) / seg : 0;
    const ax = pts[a * 2]!, az = pts[a * 2 + 1]!, bx = pts[b * 2]!, bz = pts[b * 2 + 1]!;
    w.x = ax + (bx - ax) * f;
    w.z = az + (bz - az) * f;
    w.y = y;
    w.yaw = Math.atan2((bx - ax) * w.dir, (bz - az) * w.dir);
    // Um einen Stamm herum statt hindurch: radial auf Abstand schieben.
    // 3 × 3 Zellen: ein Stamm knapp jenseits der Zellgrenze zählt auch
    // (gemessen mit nur einer Zelle: 0,26 m kleinster Abstand statt 0,6).
    for (let n = 0; n < 9; n++) {
      const cell = this.#trunkCells.get(cellKey(w.x + ((n % 3) - 1) * 8, w.z + (Math.floor(n / 3) - 1) * 8));
      if (!cell) continue;
      for (let k = 0; k < cell.length; k += 2) {
        const dx = w.x - cell[k]!, dz = w.z - cell[k + 1]!;
        const d = Math.hypot(dx, dz);
        if (d < TRUNK_CLEAR && d > 1e-4) {
          w.x = cell[k]! + (dx / d) * TRUNK_CLEAR;
          w.z = cell[k + 1]! + (dz / d) * TRUNK_CLEAR;
        }
      }
    }
  }

  readonly #trunkCells = new Map<number, number[]>();

  /**
   * Der Stoß. Die Figur übernimmt den größten Teil der Wagengeschwindigkeit,
   * seitlich ein wenig gestreut, und steigt mit dem Tempo: bei 30 km/h ein
   * Hopser, bei 120 km/h ein Flug über mehrere Meter.
   */
  #knock(w: Walker, vx: number, vz: number, speed: number): void {
    const spread = (this.#random() - 0.5) * 0.6;
    const c = Math.cos(spread), s = Math.sin(spread);
    w.knocked = true;
    w.down = DOWN_TIME;
    w.vx = (vx * c - vz * s) * 0.85;
    w.vz = (vx * s + vz * c) * 0.85;
    w.vy = 1.5 + speed * 0.28;
    w.spin = (this.#random() < 0.5 ? -1 : 1) * (4 + speed * 0.3);
    w.tumble = 0;
  }

  #fly(w: Walker, dt: number): void {
    const ground = this.drive.height(w.x, w.z);
    const airborne = w.y > ground + 0.02 || w.vy > 0;
    if (airborne) {
      w.vy -= 9.81 * dt;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.z += w.vz * dt;
      w.tumble += w.spin * dt;
      if (w.y <= ground) {
        w.y = ground;
        w.vy = 0;
        // Liegen bleiben: auf dem Rücken oder dem Bauch, je nach Drehung.
        w.tumble = Math.cos(w.tumble) >= 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      return;
    }
    // Am Boden ausrutschen, dann liegen, dann aufstehen.
    const friction = Math.exp(-5 * dt);
    w.vx *= friction;
    w.vz *= friction;
    w.x += w.vx * dt;
    w.z += w.vz * dt;
    w.y = ground;
    w.down -= dt;
    if (w.down <= 0) {
      // Zurück an die eigene Schleife — wer in die Fahrbahn geflogen ist, steht
      // nicht mitten auf der Straße auf.
      w.knocked = false;
      w.tumble = 0;
    }
  }

  #random(): number {
    this.#seed = (this.#seed * 1664525 + 1013904223) >>> 0;
    return this.#seed / 4294967296;
  }
}
