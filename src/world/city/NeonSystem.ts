import {
  Color,
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
  #material: NeonMaterial | null = null;
  #atlas: NeonAtlas | null = null;
  readonly #lights: PointLight[] = [];

  readonly #readouts = {
    schilder: 'noch nicht gebaut',
    atlas: '—',
    lichter: '—',
  };

  constructor(private readonly atmosphere: AtmosphereUniforms) {}

  init(context: EngineContext): void {
    this.#context = context;

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

    for (const sign of signs) {
      if (random() > NEON.coverage) continue;

      // Querliegendes Schild über der Ladenfront, bündig an der Wand.
      const bannerCell = atlas.banner[Math.floor(random() * atlas.banner.length)] ?? 0;
      const bannerAspect = atlas.cells[bannerCell]?.aspect ?? 2;
      const bannerWidth = Math.min(NEON.bannerWidth, sign.span * 0.8);
      const bannerHeight = bannerWidth / bannerAspect;
      const outward = new Vector3(Math.sin(sign.angle), 0, Math.cos(sign.angle));

      position.set(
        sign.x + outward.x * NEON.bannerOffset,
        sign.y + NEON.bannerY,
        sign.z + outward.z * NEON.bannerOffset,
      );
      quaternion.setFromAxisAngle(axis, sign.angle);
      scale.set(bannerWidth, bannerHeight, 1);
      placements.push({
        matrix: new Matrix4().compose(position, quaternion, scale),
        cell: bannerCell,
        color: pickColor(random),
        flicker: [random(), random() < NEON.flickerFraction ? 1 : 0],
        position: position.clone(),
        area: bannerWidth * bannerHeight,
      });

      if (sign.floors < NEON.uprightFloors) continue;

      // Hochkante Schilder stehen **quer** von der Wand ab: man sieht sie die
      // Straße entlang, nicht frontal. Genau das macht eine japanische
      // Geschäftsstraße aus — flach an der Wand wären sie aus dem Auto
      // unsichtbar.
      const levels = Math.min(
        NEON.uprightY.length,
        1 + (sign.floors >= NEON.uprightFloors + 4 ? 1 : 0),
      );
      for (let level = 0; level < levels; level++) {
        const cell = atlas.upright[Math.floor(random() * atlas.upright.length)] ?? 0;
        const aspect = atlas.cells[cell]?.aspect ?? 0.5;
        const height = NEON.uprightHeight;
        const width = height * aspect;
        position.set(
          sign.x + outward.x * NEON.uprightOffset,
          sign.y + (NEON.uprightY[level] ?? NEON.uprightY[0]!),
          sign.z + outward.z * NEON.uprightOffset,
        );
        quaternion.setFromAxisAngle(axis, sign.angle + Math.PI / 2);
        scale.set(width, height, 1);
        placements.push({
          matrix: new Matrix4().compose(position, quaternion, scale),
          cell,
          color: pickColor(random),
          flicker: [random(), random() < NEON.flickerFraction ? 1 : 0],
          position: position.clone(),
          area: width * height,
        });
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

    this.#placeLights(placements.slice(0, count), group);

    const flickering = placements.slice(0, count).filter((p) => p.flicker[1] > 0).length;
    this.#readouts.schilder =
      `${count} Schilder · ${count * 2} Dreiecke · 1 Draw-Call · ` +
      `${flickering} flackern`;
    this.#readouts.atlas =
      `${atlas.cells.length} Felder auf ${NEON.atlasSize}² · ` +
      `${atlas.rejected} durch Ersatzmuster ersetzt · ` +
      `Deckung ${Math.min(...atlas.cells.map((c) => c.ink)).toFixed(1)}…` +
      `${Math.max(...atlas.cells.map((c) => c.ink)).toFixed(1)} %`;
    this.#readouts.lichter = `${this.#lights.length} Punktlichter (SPEC: ~10)`;

    if (atlas.rejected > 0) {
      console.warn(
        `Neon: ${atlas.rejected} von ${atlas.cells.length} Atlas-Feldern haben die ` +
          'Tofu-Prüfung nicht bestanden und tragen ein Ersatzmuster. Die Systemschrift ' +
          'kennt die betreffenden Zeichen nicht.',
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
      for (const light of this.#lights) light.visible = !light.visible;
    });
  }

  dispose(): void {
    if (this.#group) {
      this.#context?.scene.remove(this.#group);
      this.#group = null;
    }
    this.#mesh?.geometry.dispose();
    this.#mesh = null;
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
