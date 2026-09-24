import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';

import { CITY, CITY_GROUND_Y, CITY_ROAD_LEVEL } from '@/config/city.config';
import type { QualityKey } from '@/config/quality.config';
import { SCRAMBLE } from '@/config/tokyoLayout.mjs';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import { SettlementKit } from '../settlements/SettlementKit';
import type { CitySystem } from './CitySystem';
import { tree } from './TokyoOpenSpaceSystem';

/**
 * Neo-Tokio: Straßenmöbel entlang der Bordsteine (docs/TOKYO.md, v2).
 *
 * Bis v2 hing alles, was auf dem Gehweg stand, an den **Häusern**
 * (`CityStreetDress`): jedes dritte Haus bekam ein Kabel über die Fassade, jedes
 * neunte einen Baum. Das ergab im Bild einen Takt, der mit der Straße nichts zu
 * tun hatte — und an Boulevards gar keine Laternen. Hier folgt die Ausstattung
 * der **Straße**, und die Straßenklasse bestimmt, was dort steht:
 *
 * | Klasse | Breite | Ausstattung |
 * |---|---|---|
 * | Boulevard | ≥ 22 m | Doppellaternen alle 24 m, Alleebäume alle 9 m |
 * | Avenue | 13…22 m | Laternen alle 26 m, vereinzelt Bäume |
 * | Straße | 9…13 m | Auslegerlaternen alle 30 m |
 * | Gasse | < 9 m | Betonmasten alle 28 m, dazwischen Leitungen (ref/web/15) |
 *
 * Dazu an jeder Ecke einer Straße ab 10 m eine Ampel. Die Ecken selbst bleiben
 * sonst frei — dort gehen Fußgänger, und dort braucht man die Sicht.
 *
 * Draw-Calls: je 320-m-Feld ein fester und ein leuchtender Batch plus eine
 * Linienliste für alle Leitungen. Felder jenseits der Reichweite der
 * Qualitätsstufe werden ausgeblendet.
 */
const CHUNK = 320;
const RANGE: Readonly<Record<QualityKey, number>> = { ultra: 700, high: 520, medium: 400, low: 300, minimal: 220, custom: 520 };

interface Chunk {
  readonly x: number;
  readonly z: number;
  readonly solid: SettlementKit;
  readonly glow: SettlementKit;
  readonly group: Group;
}

export class TokyoStreetFurnitureSystem implements System {
  readonly name = 'TokyoStreetFurnitureSystem';
  readonly group = new Group();
  #context: EngineContext | null = null;
  #chunks: Chunk[] = [];
  #range = RANGE.high;
  readonly #materials: (MeshStandardMaterial | MeshBasicMaterial | LineBasicMaterial)[] = [];
  readonly #readouts = { moebel: '—' };

  constructor(private readonly drive: DriveSystem, private readonly city: CitySystem) {}

  init(context: EngineContext): void {
    this.#context = context;
    this.group.name = 'Tokio Straßenmöbel';
    const started = performance.now();
    const roads = this.drive.roads;
    if (!roads) throw new Error('TokyoStreetFurnitureSystem braucht das Straßennetz.');
    context.bus.on('quality:changed', ({ level }) => {
      this.#range = RANGE[level as QualityKey] ?? RANGE.medium;
    });

    const solidMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.25 });
    const glowMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const wireMat = new LineBasicMaterial({ color: 0x15191d });
    this.#materials.push(solidMat, glowMat, wireMat);

    const chunks = new Map<string, Chunk>();
    const chunkAt = (x: number, z: number): Chunk => {
      const gx = Math.floor(x / CHUNK), gz = Math.floor(z / CHUNK), key = `${gx},${gz}`;
      let c = chunks.get(key);
      if (!c) {
        c = { x: (gx + 0.5) * CHUNK, z: (gz + 0.5) * CHUNK, solid: new SettlementKit(), glow: new SettlementKit(), group: new Group() };
        c.group.name = `Möbel ${key}`;
        chunks.set(key, c);
      }
      return c;
    };
    const y = CITY_GROUND_Y + CITY.sidewalk.height;
    const collision = this.drive.collision;
    const wires: number[] = [];
    let seed = 0x5f0e1;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const count = { lampen: 0, baeume: 0, masten: 0, ampeln: 0 };
    const signals: [number, number][] = [];

    /** Straßenbreite und Seite: wie breit ist die nächste Fahrbahn, wo ist der Block? */
    const widthAt = (x: number, z: number): number => {
      const hit = roads.closestPoint(x, z, 30, CITY_ROAD_LEVEL);
      return hit ? hit.width : 0;
    };
    const clearance = (x: number, z: number): number => {
      const hit = roads.closestPoint(x, z, 30, CITY_ROAD_LEVEL);
      return hit ? hit.distance - hit.width / 2 : 30;
    };

    for (const loop of this.city.curbLines) {
      // Dicht abtasten: alle 1 m ein Punkt mit Richtung und Innennormale.
      const pts: { x: number; z: number; tx: number; tz: number; nx: number; nz: number; turn: number }[] = [];
      const n = loop.length / 2;
      for (let i = 0; i < n; i++) {
        const ax = loop[i * 2]!, az = loop[i * 2 + 1]!;
        const bx = loop[((i + 1) % n) * 2]!, bz = loop[((i + 1) % n) * 2 + 1]!;
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.round(len));
        for (let k = 0; k < steps; k++) {
          const t = k / steps;
          pts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / len, tz: (bz - az) / len, nx: 0, nz: 0, turn: 0 });
        }
      }
      if (pts.length < 12) continue;
      // Innen = die Seite mit mehr Abstand zur Fahrbahn; einmal je Schleife bestimmt.
      const probe = pts[Math.floor(pts.length / 2)]!;
      const left = clearance(probe.x - probe.tz * 1.2, probe.z + probe.tx * 1.2) > clearance(probe.x + probe.tz * 1.2, probe.z - probe.tx * 1.2);
      for (const p of pts) {
        p.nx = left ? -p.tz : p.tz;
        p.nz = left ? p.tx : -p.tx;
      }
      // Krümmung über ±4 m — Ecken erkennen.
      for (let i = 0; i < pts.length; i++) {
        const a = pts[(i - 4 + pts.length) % pts.length]!, b = pts[(i + 4) % pts.length]!;
        pts[i]!.turn = Math.acos(Math.max(-1, Math.min(1, a.tx * b.tx + a.tz * b.tz)));
      }

      let nextFurniture = random() * 10;
      let nextTree = random() * 6;
      let lastPole: [number, number] | null = null;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const nearScramble = Math.hypot(p.x - SCRAMBLE.x, p.z - SCRAMBLE.z) < SCRAMBLE.radius + 4;
        const corner = p.turn > 0.6;
        nextTree--;
        nextFurniture--;
        // Die Straßenabfrage nur dort, wo etwas entschieden wird — je Meter
        // gefragt wären es rund 60 000 `closestPoint`-Aufrufe beim Laden.
        const due = (corner && !signals.some(([sx, sz]) => Math.hypot(sx - p.x, sz - p.z) < 14)) || (!corner && !nearScramble && (nextTree <= 0 || nextFurniture <= 0));
        if (!due) continue;
        const width = widthAt(p.x, p.z);
        if (width <= 0) continue;

        // Ampel an der Ecke einer Straße ab 10 m.
        if (corner && width >= 10) {
          signals.push([p.x, p.z]);
          const c = chunkAt(p.x, p.z);
          const px = p.x + p.nx * 0.6, pz = p.z + p.nz * 0.6;
          // Drehung um Y, die lokales +z auf die Innennormale legt (SettlementKit.box).
          const out = Math.atan2(p.nx, p.nz);
          c.solid.box(px, y + 2.7, pz, 0.16, 5.4, 0.16, 0x3b4248);
          const ax = px - p.nx * 2.2, az = pz - p.nz * 2.2;
          c.solid.box((px + ax) / 2, y + 5.2, (pz + az) / 2, 0.1, 0.1, 4.4, 0x3b4248, 0, out);
          c.solid.box(ax, y + 4.9, az, 1.05, 0.38, 0.28, 0x2a2f33, 0, out + Math.PI / 2);
          const lit = random();
          const colors = [lit < 0.45 ? 0xff3b2f : 0x3a1a18, lit >= 0.45 && lit < 0.55 ? 0xffb23a : 0x3a2a14, lit >= 0.55 ? 0x3aff9a : 0x143a28];
          colors.forEach((col, k) => c.glow.box(ax + p.tz * (k - 1) * 0.3, y + 4.9, az - p.tx * (k - 1) * 0.3, 0.2, 0.2, 0.3, col, 0, out + Math.PI / 2));
          // Fußgängerampel am Mast.
          c.solid.box(px, y + 2.6, pz, 0.3, 0.55, 0.3, 0x2a2f33);
          c.glow.box(px - p.nx * 0.16, y + 2.72, pz - p.nz * 0.16, 0.22, 0.18, 0.02, lit < 0.5 ? 0x3aff9a : 0xff3b2f);
          collision.addCylinder(px, pz, 0.16, y - 0.5, y + 5.4);
          count.ampeln++;
          continue;
        }
        if (corner || nearScramble) continue;

        // Alleebäume am Boulevard (und vereinzelt an der Avenue).
        if (nextTree <= 0) {
          nextTree = width >= 22 ? 9 : width >= 13 ? 16 + random() * 10 : 9;
          if (width >= 22 || (width >= 13 && random() < 0.5)) {
            const tx = p.x + p.nx * 1.4, tz = p.z + p.nz * 1.4;
            const c = chunkAt(tx, tz);
            c.solid.box(tx, y + 0.06, tz, 1.4, 0.12, 1.4, 0x4a4640);
            tree(c.solid, tx, y, tz, 0.95 + random() * 0.25, random);
            collision.addCylinder(tx, tz, 0.22, y - 0.5, y + 3);
            count.baeume++;
          }
        }

        if (nextFurniture > 0) continue;
        const c = chunkAt(p.x, p.z);
        const yaw = Math.atan2(p.nx, p.nz);
        if (width >= 9) {
          // Laterne: Mast, Ausleger zur Fahrbahn, Leuchte.
          nextFurniture = width >= 22 ? 24 : width >= 13 ? 26 : 30;
          const inset = width >= 13 ? 0.6 : 0.45;
          const lx = p.x + p.nx * inset, lz = p.z + p.nz * inset;
          const h = width >= 22 ? 9 : width >= 13 ? 8 : 7;
          c.solid.box(lx, y + h / 2, lz, 0.18, h, 0.18, 0x4a5258);
          const arms = width >= 22 ? [-1, 1] : [-1];
          for (const s of arms) {
            const hx = lx + p.nx * s * 1.6, hz = lz + p.nz * s * 1.6;
            c.solid.box((lx + hx) / 2, y + h - 0.2, (lz + hz) / 2, 0.08, 0.08, 1.6, 0x4a5258, 0, yaw);
            c.solid.box(hx, y + h - 0.32, hz, 0.35, 0.14, 0.8, 0x3a4046, 0, yaw);
            c.glow.box(hx, y + h - 0.41, hz, 0.28, 0.03, 0.7, 0xfff0d8, 0, yaw);
          }
          collision.addCylinder(lx, lz, 0.14, y - 0.5, y + h);
          count.lampen++;
        } else {
          // Betonmast mit Querträger, manchmal Trafo, kleine Leuchte zur Gasse.
          nextFurniture = 26 + random() * 6;
          const inset = width >= 6.5 ? 0.35 : 0.25;
          const mx = p.x + p.nx * inset, mz = p.z + p.nz * inset;
          c.solid.add(new CylinderGeometry(0.13, 0.17, 9, 6), 0x8a8c88, mx, y + 4.5, mz);
          c.solid.box(mx, y + 8.2, mz, 1.4, 0.1, 0.1, 0x5a5e60, 0, yaw + Math.PI / 2);
          c.solid.box(mx, y + 7.6, mz, 1.0, 0.08, 0.08, 0x5a5e60, 0, yaw + Math.PI / 2);
          if (random() < 0.35) c.solid.add(new CylinderGeometry(0.28, 0.28, 0.8, 8), 0x8e948f, mx - p.nx * 0.4, y + 6.4, mz - p.nz * 0.4);
          c.solid.box(mx - p.nx * 0.5, y + 5.2, mz - p.nz * 0.5, 0.06, 0.06, 1.0, 0x5a5e60, 0, yaw);
          c.glow.box(mx - p.nx * 0.95, y + 5.1, mz - p.nz * 0.95, 0.3, 0.08, 0.22, 0xe8f0ff, 0, yaw);
          collision.addCylinder(mx, mz, 0.17, y - 0.5, y + 9);
          count.masten++;
          // Leitungen zum vorigen Mast derselben Kante — durchhängend, drei Stränge.
          if (lastPole && Math.hypot(lastPole[0] - mx, lastPole[1] - mz) < 40) {
            for (const [dy, sag] of [[8.15, 0.5], [7.55, 0.65], [6.4, 0.4]] as const) {
              const segs = 6;
              for (let k = 0; k < segs; k++) {
                const t0 = k / segs, t1 = (k + 1) / segs;
                const yy = (t: number): number => y + dy - sag * 4 * t * (1 - t);
                wires.push(
                  lastPole[0] + (mx - lastPole[0]) * t0, yy(t0), lastPole[1] + (mz - lastPole[1]) * t0,
                  lastPole[0] + (mx - lastPole[0]) * t1, yy(t1), lastPole[1] + (mz - lastPole[1]) * t1,
                );
              }
            }
          }
          lastPole = [mx, mz];
        }
      }
    }

    for (const c of chunks.values()) {
      if (c.solid.parts.length) c.solid.finish(c.group, solidMat, 'Masten, Laternen, Bäume');
      if (c.glow.parts.length) {
        const m = new Mesh(c.glow.geometry(), glowMat);
        m.name = 'Leuchten';
        c.group.add(m);
      }
      this.group.add(c.group);
      this.#chunks.push(c);
    }
    if (wires.length) {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(wires, 3));
      g.computeBoundingSphere();
      const lines = new LineSegments(g, wireMat);
      lines.name = 'Leitungen';
      this.group.add(lines);
    }
    context.scene.add(this.group);
    this.#readouts.moebel = `${count.lampen} Laternen · ${count.baeume} Bäume · ${count.masten} Masten · ${count.ampeln} Ampeln · ${wires.length / 6} Leitungsstücke · ${(performance.now() - started).toFixed(0)} ms`;
    context.debug?.folder('Stadt')?.addBinding(this.#readouts, 'moebel', { readonly: true, label: 'Straßenmöbel' });
    console.info(`[Stadt] Möbel: ${this.#readouts.moebel}`);
  }

  update(): void {
    const cam = this.#context?.camera.position;
    if (!cam) return;
    const r = this.#range + CHUNK * 0.71;
    for (const c of this.#chunks) c.group.visible = Math.hypot(c.x - cam.x, c.z - cam.z) < r;
  }

  dispose(): void {
    this.#context?.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose();
    });
    for (const m of this.#materials) m.dispose();
    this.#chunks = [];
    this.#context = null;
  }
}
