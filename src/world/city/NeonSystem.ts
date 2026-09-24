import {
  BoxGeometry,
  Color,
  MeshStandardMaterial,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';

import { CITY, NEON, NEON_COLORS } from '@/config/city.config';
import type { QualityKey } from '@/config/quality.config';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import type { CityUniforms } from '../materials/FacadeMaterial';
import { NeonMaterial } from '../materials/NeonMaterial';
import type { SignAnchor } from './CityGenerator';
import { buildNeonAtlas, type NeonAtlas } from './neonAtlas';

/**
 * Neonschilder — PLAN.md P6 / 6.3.
 *
 * Ein einziger `InstancedMesh` für alle Schilder: ein Draw-Call, zwei Dreiecke
 * je Schild. Rahmen und Grundfläche stehen im Atlas, nicht in der Geometrie —
 * sonst wären es zehn Dreiecke je Schild für ein Bild, das gleich aussieht.
 *
 * Dazu die zehn echten Punktlichter, die SPEC §3.1 zubilligt. Sie stehen nicht
 * an den zehn erstbesten Schildern, sondern an den zehn, die **am weitesten
 * auseinander** liegen: zehn Lichter in einer Häuserzeile beleuchten dieselbe
 * Wand zehnmal, während der Rest der Stadt dunkel bleibt.
 */
export class NeonSystem implements System {
  readonly name = 'NeonSystem';

  #context: EngineContext | null = null;
  #group: Group | null = null;
  #mesh: InstancedMesh | null = null;
  #frames: InstancedMesh | null = null;
  #material: NeonMaterial | null = null;
  #atlas: NeonAtlas | null = null;
  readonly #lights: PointLight[] = [];
  #quality:QualityKey='high';
  #lightTimer=0;
  #lightsEnabled=true;

  readonly #readouts = {
    schilder: 'noch nicht gebaut',
    atlas: '—',
    lichter: '—',
  };

  constructor(private readonly atmosphere: AtmosphereUniforms) {}

  init(context: EngineContext): void {
    this.#context = context;
    context.bus.on('quality:changed',({level})=>{this.#quality=level;this.#lightTimer=0;});

    const group = new Group();
    group.name = 'Neon';
    group.matrixAutoUpdate = false;
    this.#group = group;
    context.scene.add(group);

    context.bus.on('city:ready', ({ signs, uniforms }) => {
      this.#build(signs, uniforms);
    });
    context.bus.on('look:apply', ({ look }) => {
      const uniform = this.#material?.userData.cityUniforms as CityUniforms | undefined;
      if (uniform) uniform.uNeonEmissive.value = look.city.neonEmissive;
      for (const light of this.#lights) light.intensity = NEON.lightIntensity * look.city.neonLights;
    });
    context.bus.on('look:collect', ({ target }) => {
      const uniform = this.#material?.userData.cityUniforms as CityUniforms | undefined;
      if (uniform) target.city.neonEmissive = uniform.uNeonEmissive.value;
    });

    this.#registerDebug(context);
  }

  update(dt:number):void {
    this.#lightTimer-=dt;
    if(this.#lightTimer>0||!this.#context)return;
    this.#lightTimer=.5;
    const budget=this.#lightsEnabled?{ultra:10,high:6,medium:2,low:0,minimal:0,custom:6}[this.#quality]:0;
    const camera=this.#context.camera.position;
    const nearest=[...this.#lights].sort((a,b)=>a.position.distanceToSquared(camera)-b.position.distanceToSquared(camera));
    nearest.forEach((light,index)=>{light.visible=index<budget;});
    this.#readouts.lichter=`${Math.min(budget,this.#lights.length)} / ${this.#lights.length} · ${this.#quality}`;
  }

  #build(signs: readonly SignAnchor[], uniforms: CityUniforms): void {
    const group = this.#group;
    const context = this.#context;
    if (!group || !context) return;

    const atlas = buildNeonAtlas();
    this.#atlas = atlas;
    // Angemeldet, damit der Atlas im Texturspeicher-Budget des Overlays
    // auftaucht: er entsteht zur Laufzeit auf einem Canvas und liefe sonst an
    // der Zählung vorbei, die über die Szene läuft.
    context.resources.track(atlas.texture);

    const material = new NeonMaterial(atlas.texture, this.atmosphere, uniforms);
    material.userData.cityUniforms = uniforms;
    this.#material = material;

    // Deterministisch: derselbe Strom wie die Stadt, nur mit anderem Salz.
    // Ohne das stünden die Schilder bei jedem Laden woanders, und ein
    // Vorher/Nachher-Bild verglichen zwei verschiedene Städte.
    let seed = (CITY.seed ^ 0x5eed4e0) >>> 0;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    interface Placement {
      readonly matrix: Matrix4;
      readonly cell: number;
      readonly color: Color;
      readonly flicker: [number, number];
      readonly position: Vector3;
      readonly area: number;
    }
    const placements: Placement[] = [];

    const quaternion = new Quaternion();
    const scale = new Vector3();
    const position = new Vector3();
    const axis = new Vector3(0, 1, 0);

    const b = CITY.building;
    const rand = (lo: number, hi: number): number => lo + random() * (hi - lo);
    const pickFrom = (list: readonly number[]): number => list[Math.floor(random() * list.length)] ?? 0;
    const white = new Color(1, 1, 1);
    // Leuchtkästen tragen ihren Grund selbst; bei voller Neonstärke (5,5)
    // stünde ein roter Kasten als roter Scheinwerfer im Bloom. Die Röhren
    // (`mono`) behalten die volle Stärke — sie sind dünne Linien.
    const BOX_LEVEL = 0.34;
    const frames: Matrix4[] = [];
    const add = (cell: number, px: number, py: number, pz: number, angle: number, w: number, h: number): void => {
      const info = atlas.cells[cell];
      if (!info) return;
      position.set(px, py, pz);
      quaternion.setFromAxisAngle(axis, angle);
      scale.set(w, h, 1);
      const color = info.mono ? pickColor(random) : white.clone().multiplyScalar(BOX_LEVEL * rand(0.85, 1.15));
      placements.push({
        matrix: new Matrix4().compose(position, quaternion, scale),
        cell,
        color,
        flicker: [random(), info.mono && random() < NEON.flickerFraction ? 1 : 0],
        position: position.clone(),
        area: w * h,
      });
    };
    const frameBox = (x: number, y: number, z: number, angle: number, w: number, h: number, d: number): void => {
      frames.push(new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(axis, angle), new Vector3(w, h, d)));
    };

    /**
     * v2: je Haus ein **Programm** statt je Wand derselbe Stapel. Gemessen an
     * Bild 2 der Rückmeldung war das Problem nicht die Zahl der Schilder,
     * sondern dass jedes Haus dieselben trug: gleiche Höhe (3,4 m), gleiche
     * Abstände (3,6 m), vier Wörter. Jetzt entscheidet je Wand der Zufall aus
     * vier Bausteinen, gewichtet mit der Dichte des Viertels (`stack`, 0…5 aus
     * dem Generator):
     *
     *  - Ladenschild über dem Eingang (fast immer),
     *  - Hochkant-Schild **einer** Höhe zwischen 2,6 und 11 m an einer
     *    Hauskante, in dichten Vierteln öfter ein Mieterverzeichnis,
     *  - Etagenbänder flach an der Wand (Kabukichō, Akiba),
     *  - selten eine Dachtafel mit Stahlgestell.
     */
    for (const sign of signs) {
      if (sign.stack === undefined && random() > NEON.coverage) continue;
      const rich = sign.stack ?? 1;
      const outX = Math.sin(sign.angle), outZ = Math.cos(sign.angle);
      const tX = Math.cos(sign.angle), tZ = -Math.sin(sign.angle);
      const roofY = sign.y + b.groundFloorHeight + Math.max(0, sign.floors - 1) * b.floorHeight;
      const tall = roofY - sign.y;
      const at = (u: number, out: number): [number, number] => [sign.x + tX * u + outX * out, sign.z + tZ * u + outZ * out];

      // 1. Ladenschild über dem Eingang.
      if (random() < 0.82) {
        const cell = pickFrom(atlas.banner);
        const w = Math.min(sign.span * 0.85, rand(2.4, 5.2));
        const h = Math.min(1.15, w / (atlas.cells[cell]?.aspect ?? 4));
        const u = rand(-1, 1) * Math.max(0, sign.span / 2 - w / 2 - 0.2);
        const [x, z] = at(u, NEON.bannerOffset);
        add(cell, x, sign.y + NEON.bannerY, z, sign.angle, w, h);
      }

      // 2. Hochkant-Schild(er) an der Hauskante.
      if (rich >= 1 && tall > 9 && random() < (rich >= 3 ? 0.9 : 0.55)) {
        const count = rich >= 4 && sign.span > 7 && random() < 0.5 ? 2 : 1;
        let side = random() < 0.5 ? -1 : 1;
        for (let k = 0; k < count; k++, side = -side) {
          const dir = random() < (rich >= 4 ? 0.35 : 0.12) && atlas.directory.length > 0;
          const cell = dir ? pickFrom(atlas.directory) : pickFrom(atlas.upright);
          const aspect = atlas.cells[cell]?.aspect ?? 0.25;
          const maxH = Math.min(tall - 6, rich >= 4 ? 11 : 6.5);
          if (maxH < 2.6) break;
          let bottom = sign.y + 5.4 + rand(0, 1.2);
          const h = dir ? rand(Math.min(6, maxH), maxH) : rand(2.6, maxH);
          const w = Math.max(0.75, Math.min(1.5, h * aspect));
          const u = side * Math.max(0, sign.span / 2 - 0.7);
          const [x, z] = at(u, w / 2 + 0.25);
          add(cell, x, bottom + h / 2, z, sign.angle + Math.PI / 2, w, h);
          const [hx, hz] = at(u, 0.12);
          frameBox(hx, bottom + h * 0.2, hz, sign.angle, 0.08, 0.08, 0.3);
          // Kabukichō: darüber ein zweites, anderes — Schildertürme, nicht Stapel gleicher Kästen.
          bottom += h + 0.35;
          if (rich >= 5 && random() < 0.45 && roofY - bottom > 3) {
            const c2 = pickFrom(atlas.upright);
            const h2 = rand(2.4, Math.min(5, roofY - bottom - 0.4));
            const w2 = Math.max(0.75, Math.min(1.4, h2 * (atlas.cells[c2]?.aspect ?? 0.25)));
            const [x2, z2] = at(u, w2 / 2 + 0.25);
            add(c2, x2, bottom + h2 / 2, z2, sign.angle + Math.PI / 2, w2, h2);
          }
        }
      }

      // 3. Etagenbänder flach an der Wand.
      if (rich >= 3) {
        for (let f = 2; f <= Math.min(sign.floors - 1, 7); f++) {
          if (random() > 0.26) continue;
          const cell = pickFrom(atlas.banner);
          const w = sign.span * rand(0.45, 0.8);
          const h = Math.min(1.2, w / (atlas.cells[cell]?.aspect ?? 4));
          const [x, z] = at(rand(-1, 1) * (sign.span - w) * 0.4, 0.12);
          add(cell, x, sign.y + b.groundFloorHeight + (f - 1.45) * b.floorHeight, z, sign.angle, w, h);
        }
      }

      // 4. Dachtafel mit Gestell — der Blickfang an Kreuzungen (ref/web/01).
      if (sign.floors >= 5 && rich >= 2 && random() < 0.05 * rich && sign.span > 7) {
        const cell = pickFrom(atlas.banner);
        const w = Math.min(sign.span * 0.95, rand(8, 13));
        const h = w / (atlas.cells[cell]?.aspect ?? 4);
        const bottom = roofY + 2.4;
        const [x, z] = at(0, -0.6);
        add(cell, x, bottom + h / 2, z, sign.angle, w, h);
        for (const u of [-w * 0.38, 0, w * 0.38]) {
          const [lx, lz] = at(u, -0.85);
          frameBox(lx, (roofY + bottom + h) / 2, lz, sign.angle, 0.16, bottom + h - roofY, 0.16);
          const [bx, bz] = at(u, -2.2);
          frameBox(bx, (roofY + bottom) / 2 + 0.4, bz, sign.angle, 0.12, bottom - roofY + 0.8, 0.12);
        }
        const [tx2, tz2] = at(0, -0.75);
        frameBox(tx2, bottom - 0.1, tz2, sign.angle, w, 0.14, 0.14);
      }
    }

    const count = Math.min(placements.length, NEON.capacity);
    const geometry = new PlaneGeometry(1, 1);
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.name = 'Neonschilder';
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const rects = new Float32Array(count * 4);
    const tints = new Float32Array(count * 3);
    const flickers = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      const p = placements[i]!;
      mesh.setMatrixAt(i, p.matrix);
      const cell = atlas.cells[p.cell]!;
      rects[i * 4] = cell.u;
      rects[i * 4 + 1] = cell.v;
      rects[i * 4 + 2] = cell.du;
      rects[i * 4 + 3] = cell.dv;
      tints[i * 3] = p.color.r;
      tints[i * 3 + 1] = p.color.g;
      tints[i * 3 + 2] = p.color.b;
      flickers[i * 2] = p.flicker[0];
      flickers[i * 2 + 1] = p.flicker[1];
    }
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute('aNeonRect', new InstancedBufferAttribute(rects, 4));
    geometry.setAttribute('aNeonTint', new InstancedBufferAttribute(tints, 3));
    geometry.setAttribute('aNeonFlicker', new InstancedBufferAttribute(flickers, 2));

    this.#mesh = mesh;
    group.add(mesh);

    // Gestelle und Halter: ein zweiter instanzierter Kasten, dunkles Blech.
    if (frames.length > 0) {
      const frameMesh = new InstancedMesh(
        new BoxGeometry(1, 1, 1),
        new MeshStandardMaterial({ color: 0x2c3237, roughness: 0.6, metalness: 0.5 }),
        frames.length,
      );
      frameMesh.name = 'Schildergestelle';
      frames.forEach((m, i) => frameMesh.setMatrixAt(i, m));
      frameMesh.instanceMatrix.needsUpdate = true;
      frameMesh.computeBoundingSphere();
      group.add(frameMesh);
      this.#frames = frameMesh;
    }

    this.#placeLights(placements.slice(0, count), group);

    const flickering = placements.slice(0, count).filter((p) => p.flicker[1] > 0).length;
    this.#readouts.schilder =
      `${count} Schilder · ${count * 2} Dreiecke · 1 Draw-Call · ` +
      `${flickering} flackern`;
    // Die **Namen** der durchgefallenen Felder, nicht nur ihre Zahl. Wenn die
    // Tofu-Prüfung anschlägt, ist die nächste Frage immer „welche Zeichen?" —
    // und ob es Kanji, Katakana oder beides trifft, sagt sofort, woran die
    // Schrift des Systems scheitert.
    const rejectedLabels = atlas.cells.filter((c) => c.fallback).map((c) => c.label);
    this.#readouts.atlas =
      `${atlas.cells.length} Felder auf ${NEON.atlasSize}² · ` +
      `Deckung ${Math.min(...atlas.cells.map((c) => c.ink)).toFixed(1)}…` +
      `${Math.max(...atlas.cells.map((c) => c.ink)).toFixed(1)} % · ` +
      (rejectedLabels.length === 0
        ? 'alle lesbar'
        : `Ersatzmuster für ${rejectedLabels.join(', ')}`);
    this.#readouts.lichter = `${this.#lights.length} Punktlichter (SPEC: ~10)`;

    if (rejectedLabels.length > 0) {
      console.warn(
        `Neon: ${rejectedLabels.length} von ${atlas.cells.length} Atlas-Feldern haben die ` +
          `Tofu-Prüfung nicht bestanden und tragen ein Ersatzmuster: ${rejectedLabels.join(', ')}. ` +
          'Die Systemschrift kennt diese Zeichen nicht.',
      );
    }

    this.#context?.debug?.refresh();
  }

  /**
   * Die zehn Punktlichter verteilen.
   *
   * Gewählt wird nach **Abstand zueinander**, nicht nach Größe: das hellste
   * Schild steht meistens neben dem zweithellsten, und zehn Lichter an einer
   * Kreuzung sind neun verschwendete. Das Verfahren ist die einfache
   * Farthest-Point-Auswahl — erstes Licht ans größte Schild, jedes weitere an
   * das Schild mit dem größten Abstand zu allen bisherigen.
   */
  #placeLights(placements: { position: Vector3; color: Color; area: number }[], group: Group): void {
    if (placements.length === 0) return;

    const chosen: number[] = [];
    let best = 0;
    for (let i = 1; i < placements.length; i++) {
      if (placements[i]!.area > placements[best]!.area) best = i;
    }
    chosen.push(best);

    while (chosen.length < Math.min(NEON.lights, placements.length)) {
      let candidate = -1;
      let candidateDistance = -1;
      for (let i = 0; i < placements.length; i++) {
        if (chosen.includes(i)) continue;
        let nearest = Infinity;
        for (const c of chosen) {
          const d = placements[i]!.position.distanceToSquared(placements[c]!.position);
          if (d < nearest) nearest = d;
        }
        if (nearest > candidateDistance) {
          candidateDistance = nearest;
          candidate = i;
        }
      }
      if (candidate < 0) break;
      chosen.push(candidate);
    }

    for (const index of chosen) {
      const p = placements[index]!;
      const light = new PointLight(p.color, NEON.lightIntensity, NEON.lightDistance, 2);
      light.position.copy(p.position);
      // Ein Schild strahlt nach vorn, nicht aus seiner Fläche heraus. Ein halber
      // Meter Versatz nach unten setzt den Lichtfleck dorthin, wo er hingehört:
      // auf den nassen Asphalt darunter.
      light.position.y -= 0.6;
      light.castShadow = false;
      light.name = `Neonlicht:${this.#lights.length}`;
      group.add(light);
      this.#lights.push(light);
    }
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Neon');
    const group = this.#group;
    if (!folder || !group) return;

    folder.addBinding(this.#readouts, 'schilder', { readonly: true, label: 'Bestand' });
    folder.addBinding(this.#readouts, 'atlas', { readonly: true, label: 'Atlas' });
    folder.addBinding(this.#readouts, 'lichter', { readonly: true, label: 'Punktlichter' });
    folder.addBinding(group, 'visible', { label: 'Sichtbar' });
    folder.addButton({ title: 'Punktlichter an/aus' }).on('click', () => {
      this.#lightsEnabled=!this.#lightsEnabled;this.#lightTimer=0;this.update(0);
    });
  }

  dispose(): void {
    if (this.#group) {
      this.#context?.scene.remove(this.#group);
      this.#group = null;
    }
    this.#mesh?.geometry.dispose();
    this.#mesh = null;
    this.#frames?.geometry.dispose();
    (this.#frames?.material as MeshStandardMaterial | undefined)?.dispose();
    this.#frames = null;
    this.#material?.dispose();
    this.#material = null;
    this.#atlas?.texture.dispose();
    this.#atlas = null;
    this.#lights.length = 0;
    this.#context = null;
  }
}

function pickColor(random: () => number): Color {
  const hex = NEON_COLORS[Math.floor(random() * NEON_COLORS.length)] ?? NEON_COLORS[0]!;
  return new Color().setHex(hex, SRGBColorSpace);
}
