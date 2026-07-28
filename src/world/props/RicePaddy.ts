import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  type Material,
} from 'three';

import { PADDY_WATER } from '@/config/props.config';
import type { EngineContext, System } from '@/core/System';
import { WORLD } from '@/config/world.config';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { PropMaterial } from '../materials/PropMaterial';
import type { TerrainSampler } from '../TerrainSampler';
import { TERRAIN_ASSETS } from '../terrainAssets';

/** Der Teil von meta.json, den dieses System braucht. */
interface PaddyMeta {
  readonly paddies: {
    readonly res: number;
    readonly parcels: number;
    readonly waterDepth: number;
    readonly damHeight: number;
  } | null;
}

/**
 * Wasserflächen der Reisfeld-Parzellen — PLAN.md P5 / 5.4.
 *
 * **Die Geometrie der Parzellen steht schon im Gelände.** Der Terrain-Baker
 * ebnet sie in Schritt 5c ein und lässt die Dämme als Rücken stehen; hier
 * kommt nur noch das Wasser darauf. Das ist die entscheidende Arbeitsteilung:
 * eine Wasserfläche über *nicht* eingeebnetem Gelände würde von jeder
 * Bodenwelle durchstoßen — gemessen liegt die Höhendifferenz innerhalb einer
 * 30-m-Zelle der Reisfeldzone im 95. Perzentil bei 7,41 m.
 *
 * Die Höhe holt sich jeder Vertex aus dem `TerrainSampler` und schlägt den
 * Wasserstand auf. Sie ein zweites Mal in eine Textur zu backen wäre die Sorte
 * Doppelimplementierung, die in P3 die eingeschnittene Rinne neben das
 * Straßen-Mesh gelegt hat — und sie wäre überflüssig, weil das Gelände
 * innerhalb einer Parzelle exakt eben ist.
 *
 * > **Kacheln statt einer Fläche.** Die Reisfelder bedecken 101 ha; als ein
 * > einziges Mesh würde die gesamte Fläche gezeichnet, sobald irgendein Teil
 * > davon im Bild ist. In 256-m-Kacheln übernimmt das Frustum-Culling von
 * > three die Auswahl, ohne dass dieses System dafür Code braucht.
 */
export class RicePaddy implements System {
  readonly name = 'RicePaddy';

  #context: EngineContext | null = null;
  #group: Group | null = null;
  #material: Material | null = null;
  #meshes: Mesh[] = [];
  #sampler: TerrainSampler | null = null;
  #mask: Uint8ClampedArray | null = null;
  #maskRes = 0;
  #waterDepth = 0.3;

  readonly #readouts = { kacheln: '—', dreiecke: '—' };

  constructor(private readonly atmosphere: AtmosphereUniforms) {}

  async init(context: EngineContext): Promise<void> {
    this.#context = context;

    context.bus.on('terrain:ready', ({ sampler }) => {
      this.#sampler = sampler;
      this.#build();
    });

    const meta = await context.resources.json<PaddyMeta>(TERRAIN_ASSETS.meta);
    if (!meta.paddies) {
      console.warn('RicePaddy: meta.json führt keine Parzellen — `npm run bake` ausführen.');
      return;
    }
    this.#waterDepth = meta.paddies.waterDepth;
    this.#maskRes = meta.paddies.res;

    const bitmap = await createImageBitmap(await (await fetch(TERRAIN_ASSETS.paddy)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const drawing = canvas.getContext('2d', { willReadFrequently: true });
    if (!drawing) throw new Error('Kein 2D-Kontext zum Auslesen von paddy.png.');
    drawing.drawImage(bitmap, 0, 0);
    this.#mask = drawing.getImageData(0, 0, bitmap.width, bitmap.height).data;
    bitmap.close();

    const group = new Group();
    group.name = 'Reisfelder';
    group.matrixAutoUpdate = false;
    this.#group = group;
    context.scene.add(group);

    this.#registerDebug(context);
    this.#build();
  }

  /** Wassermaske an einer Weltposition — nächster Nachbar, wie bei `ZoneMap`. */
  #wet(x: number, z: number): boolean {
    const mask = this.#mask;
    if (!mask) return false;
    const last = this.#maskRes - 1;
    const ix = Math.round(((x + WORLD.half) / WORLD.size) * last);
    const iz = Math.round(((z + WORLD.half) / WORLD.size) * last);
    if (ix < 0 || iz < 0 || ix > last || iz > last) return false;
    return mask[(iz * this.#maskRes + ix) * 4]! > 127;
  }

  /**
   * Wasserflächen bauen.
   *
   * Läuft erst, wenn **beides** da ist: die Maske aus `init` und der Sampler
   * aus `terrain:ready`. Welches zuerst kommt, hängt an der Ladereihenfolge,
   * und darauf soll sich hier nichts verlassen.
   */
  #build(): void {
    const group = this.#group;
    const sampler = this.#sampler;
    if (!group || !sampler || !this.#mask || this.#meshes.length) return;

    const material = new PropMaterial(this.atmosphere);
    material.vertexColors = false;
    material.flatShading = false;
    material.color = new Color().setHex(PADDY_WATER.color, 'srgb');
    material.roughness = PADDY_WATER.roughness;
    material.metalness = PADDY_WATER.metalness;
    material.name = 'PaddyWaterMaterial';
    this.#material = material;

    const step = PADDY_WATER.grid;
    const tile = PADDY_WATER.tile;
    const tiles = Math.ceil(WORLD.size / tile);
    let triangles = 0;

    for (let tz = 0; tz < tiles; tz++) {
      for (let tx = 0; tx < tiles; tx++) {
        const x0 = -WORLD.half + tx * tile;
        const z0 = -WORLD.half + tz * tile;
        const position: number[] = [];

        for (let z = z0; z < z0 + tile; z += step) {
          for (let x = x0; x < x0 + tile; x += step) {
            // Alle vier Ecken müssen nass sein. Ein Quad, das halb auf einem
            // Damm liegt, wäre eine Wasserfläche, die über ihn hinwegläuft.
            if (!this.#wet(x, z) || !this.#wet(x + step, z)) continue;
            if (!this.#wet(x, z + step) || !this.#wet(x + step, z + step)) continue;

            const h00 = sampler.getHeightAt(x, z);
            const h10 = sampler.getHeightAt(x + step, z);
            const h01 = sampler.getHeightAt(x, z + step);
            const h11 = sampler.getHeightAt(x + step, z + step);
            // **Und alle vier auf derselben Höhe.** Zwei Parzellen können ohne
            // sichtbaren Damm aneinanderstoßen, wenn ihr Niveau um eine
            // Terrassenstufe springt; ein Quad darüber wäre eine schiefe
            // Wasserfläche. Der Grenzwert ist knapp gewählt, weil das Gelände
            // innerhalb einer Parzelle exakt eben ist — jede Abweichung ist
            // also bereits eine Kante.
            const lowest = Math.min(h00, h10, h01, h11);
            if (Math.max(h00, h10, h01, h11) - lowest > PADDY_WATER.levelTolerance) continue;

            const y = lowest + this.#waterDepth;
            position.push(x, y, z, x, y, z + step, x + step, y, z);
            position.push(x + step, y, z, x, y, z + step, x + step, y, z + step);
          }
        }

        if (!position.length) continue;
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const mesh = new Mesh(geometry, material);
        mesh.name = `paddy:${tx}:${tz}`;
        mesh.matrixAutoUpdate = false;
        // Hier **darf** three cullen: das Mesh liegt im Weltursprung und seine
        // Hülle beschreibt genau die Kachel. Anders als bei den Instanzen der
        // Vegetation stimmt die Objektmatrix mit der Geometrie überein.
        mesh.frustumCulled = true;
        group.add(mesh);
        this.#meshes.push(mesh);
        triangles += position.length / 9;
      }
    }

    this.#readouts.kacheln = `${this.#meshes.length}`;
    this.#readouts.dreiecke = triangles.toLocaleString('de-DE');
    this.#context?.debug?.refresh();
  }

  update(): void {
    // Nichts je Frame: die Flächen stehen fest, three cullt sie selbst.
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Reisfelder');
    const group = this.#group;
    if (!folder || !group) return;
    folder.addBinding(this.#readouts, 'kacheln', { readonly: true, label: 'Kacheln' });
    folder.addBinding(this.#readouts, 'dreiecke', { readonly: true, label: 'Dreiecke' });
    folder.addBinding(group, 'visible', { label: 'Sichtbar' });
  }

  dispose(): void {
    if (this.#group) {
      this.#context?.scene.remove(this.#group);
      this.#group = null;
    }
    for (const mesh of this.#meshes) mesh.geometry.dispose();
    this.#meshes = [];
    this.#material?.dispose();
    this.#material = null;
    this.#mask = null;
    this.#context = null;
  }
}
