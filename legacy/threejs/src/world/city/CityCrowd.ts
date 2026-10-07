import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial } from 'three';

import { CITY_GROUND_Y } from '@/config/city.config';
import type { RoadNetwork } from '../roads/RoadNetwork';

/**
 * Sechs Fahrzeuge, zwölf Fußgänger — ASTRA_PLAN WP4.
 *
 * Zwei Instanz-Meshes, nicht 18 Draw-Calls. Sie sind Staffage: der Spieler
 * fährt durch eine bewohnte Kreuzung, nicht durch eine leere Extrusion.
 * Kollision bleibt den Häusern; ein Fußgänger, der ein Auto anhält, wäre ein
 * Physikproblem und kein Stadtbild.
 */
const TRAFFIC = 6;
const PEDS = 12;

export class CityCrowd {
  readonly #group = new Group();
  readonly #cars: InstancedMesh;
  readonly #people: InstancedMesh;
  readonly #carMatrix = new Matrix4();
  readonly #pedMatrix = new Matrix4();
  #arcs = new Float64Array(TRAFFIC);
  #line: number[] = [];
  #spacing = 2;
  #peds: { x: number; z: number; heading: number; speed: number }[] = [];

  constructor() {
    this.#group.name = 'Stadtverkehr';
    this.#group.matrixAutoUpdate = false;
    const carMat = new MeshStandardMaterial({ color: 0x4a5560, roughness: 0.55, metalness: 0.2 });
    const pedMat = new MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.85, metalness: 0 });
    this.#cars = new InstancedMesh(new BoxGeometry(1.7, 1.15, 4.1), carMat, TRAFFIC);
    this.#cars.name = 'Stadt:Verkehr';
    this.#cars.frustumCulled = false;
    this.#people = new InstancedMesh(new BoxGeometry(0.42, 1.55, 0.32), pedMat, PEDS);
    this.#people.name = 'Stadt:Fußgänger';
    this.#people.frustumCulled = false;
    this.#group.add(this.#cars, this.#people);
  }

  get group(): Group {
    return this.#group;
  }

  bind(network: RoadNetwork): void {
    const stadt = network.roads.find((r) => r.id === 'stadt');
    this.#line = stadt ? [...stadt.centerline] : [];
    this.#spacing = stadt && stadt.centerline.length > 3 ? stadt.length / (stadt.centerline.length / 3 - (stadt.closed ? 0 : 1)) : 2;
    for (let i = 0; i < TRAFFIC; i++) this.#arcs[i] = (i / TRAFFIC) * (stadt?.length ?? 400);
    this.#peds = [];
    const cx = 620;
    const cz = 120;
    for (let i = 0; i < PEDS; i++) {
      const a = (i / PEDS) * Math.PI * 2;
      this.#peds.push({
        x: cx + Math.cos(a) * (28 + (i % 3) * 9),
        z: cz + Math.sin(a) * (28 + (i % 4) * 7),
        heading: a + Math.PI / 2,
        speed: 0.7 + (i % 5) * 0.12,
      });
    }
    this.#placeCars();
    this.#placePeds(0);
  }

  update(dt: number, elapsed: number): void {
    if (this.#line.length < 6) return;
    const lap = Math.max(40, (this.#line.length / 3) * this.#spacing);
    for (let i = 0; i < TRAFFIC; i++) {
      this.#arcs[i] = (this.#arcs[i]! + 7.5 * dt) % lap;
    }
    this.#placeCars();
    this.#placePeds(elapsed);
  }

  #placeCars(): void {
    const line = this.#line;
    const count = line.length / 3;
    const spacing = this.#spacing;
    for (let i = 0; i < TRAFFIC; i++) {
      const arc = this.#arcs[i]!;
      const t = arc / spacing;
      const i0 = Math.min(count - 1, Math.max(0, Math.floor(t)));
      const i1 = Math.min(count - 1, i0 + 1);
      const f = t - i0;
      const x = line[i0 * 3]! + (line[i1 * 3]! - line[i0 * 3]!) * f;
      const y = line[i0 * 3 + 1]! + (line[i1 * 3 + 1]! - line[i0 * 3 + 1]!) * f;
      const z = line[i0 * 3 + 2]! + (line[i1 * 3 + 2]! - line[i0 * 3 + 2]!) * f;
      const heading = Math.atan2(line[i1 * 3]! - line[i0 * 3]!, line[i1 * 3 + 2]! - line[i0 * 3 + 2]!);
      this.#carMatrix.makeRotationY(heading);
      this.#carMatrix.setPosition(x, y + 0.62, z);
      this.#cars.setMatrixAt(i, this.#carMatrix);
    }
    this.#cars.instanceMatrix.needsUpdate = true;
  }

  #placePeds(elapsed: number): void {
    for (let i = 0; i < this.#peds.length; i++) {
      const p = this.#peds[i]!;
      const walk = elapsed * p.speed;
      const x = p.x + Math.cos(p.heading) * Math.sin(walk * 0.15) * 6;
      const z = p.z + Math.sin(p.heading) * Math.sin(walk * 0.17 + 1) * 6;
      const bob = Math.abs(Math.sin(walk * 3.2)) * 0.04;
      this.#pedMatrix.makeRotationY(p.heading + Math.sin(walk) * 0.2);
      this.#pedMatrix.setPosition(x, CITY_GROUND_Y + 0.9 + bob, z);
      this.#people.setMatrixAt(i, this.#pedMatrix);
    }
    this.#people.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.#cars.geometry.dispose();
    this.#people.geometry.dispose();
    (this.#cars.material as MeshStandardMaterial).dispose();
    (this.#people.material as MeshStandardMaterial).dispose();
    this.#group.removeFromParent();
  }
}
