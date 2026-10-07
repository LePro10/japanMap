import {
  CanvasTexture, CatmullRomCurve3, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, Quaternion, SphereGeometry, Vector3, type Material,
} from 'three';
import { SettlementKit } from '../SettlementKit';
import { fishingBoat, skiff, walkerBody, walkerLeg } from './funauraBuildings';

/**
 * Das, was Funaura von einer Kulisse unterscheidet: Leute, die gehen, Boote,
 * die fahren, Rauch, der steigt. Das alte Tideglass war genau das Gegenteil —
 * neun Hütten und sechs Boote, die sich nie bewegt haben.
 *
 * Alles hier ist billig: gehende Figuren sind drei instanzierte Meshes (Rumpf,
 * linkes und rechtes Bein), die Boote je ein Mesh-Satz, der Rauch eine Instanz
 * je Wölkchen. Aktualisiert wird nur, solange die Nahschicht sichtbar ist.
 */

type Path = { pts: readonly (readonly [number, number])[]; loop: boolean; speed: number; pause: number; carry: boolean; look: number };
type Walker = Path & { len: number[]; total: number; offset: number };

export interface LifeMaterials { solid: Material; boat: Material; glow: Material; sign: Material; cloth: Material }

export class FunauraLife {
  readonly group = new Group();
  readonly #walkers: Walker[] = [];
  readonly #bodies: InstancedMesh[] = [];
  readonly #legs: [InstancedMesh, InstancedMesh];
  readonly #boats: { group: Group; curve: CatmullRomCurve3; speed: number; phase: number; wake: Mesh }[] = [];
  readonly #smoke: InstancedMesh;
  readonly #sources: readonly (readonly [number, number, number])[];
  readonly #m = new Matrix4();
  readonly #m2 = new Matrix4();
  readonly #q = new Quaternion();
  readonly #v = new Vector3();
  readonly #axisY = new Vector3(0, 1, 0);
  readonly #axisX = new Vector3(1, 0, 0);
  readonly #one = new Vector3(1, 1, 1);

  // `boats: false`: der Gassho-Weiler (docs/DOERFER.md §2) nutzt Gehende und Rauch
  // von hier, hat aber kein Meer. Eine zweite Klasse nur ohne Boote wäre Abschreiben.
  constructor(readonly height: (x: number, z: number) => number, mats: LifeMaterials, paths: readonly Path[], smoke: readonly (readonly [number, number, number])[], options: { boats?: boolean; name?: string; smokeRise?: number } = {}) {
    this.group.name = options.name ?? 'Funaura life';
    this.#rise = options.smokeRise ?? 7;
    // Gehende: je Aussehen ein Rumpf-Mesh, Beine gemeinsam.
    for (const p of paths) {
      const len = [0]; let total = 0;
      for (let i = 1; i < p.pts.length + (p.loop ? 1 : 0); i++) {
        const a = p.pts[i - 1]!, b = p.pts[i % p.pts.length]!; total += Math.hypot(b[0] - a[0], b[1] - a[1]); len.push(total);
      }
      this.#walkers.push({ ...p, len, total, offset: (this.#walkers.length * 0.37) % 1 });
    }
    const looks = new Set(this.#walkers.map(w => `${w.look}|${w.carry}`));
    for (const key of looks) {
      const [look, carry] = key.split('|');
      const k = new SettlementKit(); walkerBody(k, Number(look), carry === 'true');
      const mine = this.#walkers.filter(w => `${w.look}|${w.carry}` === key);
      const mesh = new InstancedMesh(k.geometry(), mats.solid, mine.length); mesh.userData.walkers = mine; mesh.frustumCulled = false; mesh.name = 'Gehende';
      this.#bodies.push(mesh); this.group.add(mesh);
    }
    const legKit = (): InstancedMesh => { const k = new SettlementKit(); walkerLeg(k); const m = new InstancedMesh(k.geometry(), mats.solid, this.#walkers.length); m.frustumCulled = false; m.name = 'Beine'; this.group.add(m); return m; };
    this.#legs = [legKit(), legKit()];
    if (options.boats !== false) {
    // Tintenfischboot: raus durch die Einfahrt, eine Runde vor der Küste, zurück.
    const squid: [number, number][] = [[-1232, 1150], [-1246, 1186], [-1262, 1226], [-1256, 1300], [-1180, 1400], [-1060, 1405], [-1030, 1322], [-1108, 1262], [-1200, 1242], [-1238, 1219], [-1226, 1180]];
    this.#addBoat(mats, true, squid, 4.2, 0);
    // Kleinboot mit Außenborder: kleine Runde vor den Bootshäusern.
    const ring: [number, number][] = [];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ring.push([-1282 + Math.cos(a) * 16, 1134 + Math.sin(a) * 7]); }
    this.#addBoat(mats, false, ring, 2.2, 0.3);
    }
    // Rauch: je Quelle zehn Wölkchen, die aufsteigen, wachsen und verwehen.
    this.#sources = smoke;
    const puff = new SphereGeometry(1, 8, 6);
    // Weiche Ränder: zum Rand hin durchsichtig (Blickwinkel gegen Normale). Mit
    // fester Deckkraft standen die Wölkchen im Nahbild als Seifenblasen da — gesehen
    // am Gassho-Giebel aus 12 m (docs/DOERFER.md §2).
    const puffMat = new MeshStandardMaterial({ color: 0xd9d5cc, transparent: true, opacity: 0.26, depthWrite: false, roughness: 1 });
    puffMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
        'diffuseColor.a *= pow(clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.2);\n#include <opaque_fragment>');
    };
    puffMat.customProgramCacheKey = () => 'wago-smoke-soft';
    this.#smoke = new InstancedMesh(puff, puffMat, smoke.length * 10);
    this.#smoke.frustumCulled = false; this.#smoke.name = 'Rauch'; this.group.add(this.#smoke);
  }

  #addBoat(mats: LifeMaterials, big: boolean, pts: readonly (readonly [number, number])[], speed: number, phase: number): void {
    const solid = new SettlementKit(), glow = new SettlementKit(), sign = new SettlementKit(true), cloth = new SettlementKit();
    if (big) fishingBoat(solid, glow, sign, cloth, 2); else skiff(solid, 1);
    const g = new Group(); g.name = big ? 'Auslaufendes Fischerboot' : 'Kleinboot in Fahrt';
    for (const [k, m] of [[solid, mats.boat], [glow, mats.glow], [sign, mats.sign], [cloth, mats.cloth]] as const) if (k.parts.length) g.add(new Mesh(k.geometry(), m));
    // Heckwelle: ein V aus Schaum hinter dem Boot, zur Spitze hin durchsichtig.
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const x = c.getContext('2d')!;
    for (let y = 0; y < 128; y++) {
      const t = y / 127, half = 4 + t * 28, a = (1 - t) * 0.8;
      x.fillStyle = `rgba(255,255,255,${a})`; x.fillRect(32 - half, y, 5, 1); x.fillRect(32 + half - 5, y, 5, 1);
      x.fillStyle = `rgba(255,255,255,${a * 0.35})`; x.fillRect(28, y, 8, 1);
    }
    const len = big ? 22 : 10, wake = new Mesh(new PlaneGeometry(big ? 12 : 5, len), new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false, side: DoubleSide }));
    wake.rotation.x = -Math.PI / 2; wake.position.set(0, 0.06, -(big ? 6 : 3) - len / 2); wake.name = 'Heckwelle';
    g.add(wake); this.group.add(g);
    const curve = new CatmullRomCurve3(pts.map(([px, pz]) => new Vector3(px, 0, pz)), true, 'centripetal');
    this.#boats.push({ group: g, curve, speed: speed / curve.getLength(), phase, wake });
  }

  /** Position und Blickrichtung eines Gehenden zur Zeit t; mit Pause an den Wegenden. */
  #pose(w: Walker, t: number): { x: number; z: number; yaw: number; moving: boolean } {
    const walk = w.total / w.speed, cycle = w.loop ? walk + w.pause : 2 * (walk + w.pause);
    let s = ((t / cycle + w.offset) % 1) * cycle, dir = 1, moving = true;
    if (w.loop) { if (s > walk) { s = walk; moving = false; } }
    else if (s < walk) { /* hin */ }
    else if (s < walk + w.pause) { s = walk; moving = false; }
    else if (s < 2 * walk + w.pause) { s = 2 * walk + w.pause - s; dir = -1; }
    else { s = 0; moving = false; dir = -1; }
    const d = Math.min(w.total - 1e-3, s * w.speed);
    let i = 1; while (i < w.len.length - 1 && w.len[i]! < d) i++;
    const a = w.pts[(i - 1) % w.pts.length]!, b = w.pts[i % w.pts.length]!, seg = w.len[i]! - w.len[i - 1]!, f = seg > 0 ? (d - w.len[i - 1]!) / seg : 0;
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, yaw: Math.atan2((b[0] - a[0]) * dir, (b[1] - a[1]) * dir), moving };
  }

  update(t: number): void {
    // Gehende.
    let legIndex = 0;
    for (const body of this.#bodies) {
      (body.userData.walkers as Walker[]).forEach((w, i) => {
        const p = this.#pose(w, t), y = this.height(p.x, p.z);
        const step = p.moving ? t * w.speed * 2.6 + w.offset * 10 : 0, swing = p.moving ? Math.sin(step) * 0.5 : 0;
        const bob = p.moving ? Math.abs(Math.cos(step)) * 0.05 : 0;
        this.#m.compose(this.#v.set(p.x, y + bob, p.z), this.#q.setFromAxisAngle(this.#axisY, p.yaw), this.#one);
        body.setMatrixAt(i, this.#m);
        for (const [leg, s] of [[this.#legs[0], -1], [this.#legs[1], 1]] as const) {
          this.#m2.makeRotationAxis(this.#axisX, swing * s).setPosition(s * 0.13, 0.82, 0);
          leg.setMatrixAt(legIndex, this.#m2.premultiply(this.#m));
        }
        legIndex++;
      });
      body.instanceMatrix.needsUpdate = true;
    }
    this.#legs[0].instanceMatrix.needsUpdate = this.#legs[1].instanceMatrix.needsUpdate = true;
    // Boote.
    for (const b of this.#boats) {
      const u = (t * b.speed + b.phase) % 1, p = b.curve.getPointAt(u), tan = b.curve.getTangentAt(u);
      b.group.position.set(p.x, Math.sin(t * 1.3 + b.phase * 9) * 0.05, p.z);
      b.group.rotation.set(Math.sin(t * 0.8) * 0.02, Math.atan2(tan.x, tan.z), Math.sin(t * 1.1 + b.phase) * 0.03, 'YXZ');
      (b.wake.material as MeshBasicMaterial).opacity = 0.75 + Math.sin(t * 3) * 0.1;
    }
    // Rauch.
    let n = 0;
    for (const [sx, sy, sz] of this.#sources) for (let j = 0; j < 10; j++) {
      const age = (t * 0.1 + j / 10 + sx * 0.013) % 1, drift = age * age;
      const r = 0.25 + age * 1.6;
      this.#m.compose(this.#v.set(sx + drift * 5 + Math.sin(t * 0.7 + j) * 0.3 * age, sy + age * this.#rise, sz + drift * 2), this.#q.identity(), this.#v2.set(r, r * 0.8, r));
      this.#smoke.setMatrixAt(n++, this.#m);
    }
    this.#smoke.instanceMatrix.needsUpdate = true;
  }
  readonly #v2 = new Vector3();
  readonly #rise: number;
}

export type { Path as LifePath };
