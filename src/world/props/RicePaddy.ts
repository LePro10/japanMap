import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
} from 'three';

import { PADDY_WATER } from '@/config/props.config';
import type { EngineContext, System } from '@/core/System';
import { WORLD } from '@/config/world.config';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { PaddyWaterMaterial } from '../materials/PaddyWaterMaterial';
import type { TerrainSampler } from '../TerrainSampler';
import { TERRAIN_ASSETS } from '../terrainAssets';

/**
 * Die vier Ecken einer Rasterzelle, im Umlauf.
 *
 * **Die Reihenfolge ist nicht beliebig — sie trägt die Wickelrichtung.** Ein
 * Dreiecksfächer über (0,0) → (0,1) → (1,1) → (1,0) hat die Normale +Y; in der
 * Gegenrichtung wäre die Wasserfläche rückseitig gewickelt und fiele
 * vollständig ins Backface-Culling. Genau das ist dem Fluss in P8.6 passiert,
 * und es hat ein halbes Jahr gedauert, bis es jemand gesehen hat — jede Zahl
 * hielt ihn für gesund. Nachprüfbar mit `japanMap.winding()`.
 */
const CORNER_DX = [0, 0, 1, 1] as const;
const CORNER_DZ = [0, 1, 1, 0] as const;

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
  #material: PaddyWaterMaterial | null = null;
  #meshes: Mesh[] = [];
  #sampler: TerrainSampler | null = null;
  #mask: Uint8ClampedArray | null = null;
  #maskRes = 0;
  #waterDepth = 0.3;
  /** Nahdetail aus der Qualitätsstufe — siehe `setDetail`. */
  #detail = 1;

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

    // **Seit P19 ein eigenes Material statt `PropMaterial`.** Die Begründung
    // steht dort ausführlich; die Kurzfassung: eine Fläche mit Rauheit 0,06 und
    // ohne jede Bewegung ist ein Spiegel, und 101 ha Spiegel mitten auf der
    // Karte sehen aus wie Lack. Wellen und Kielwelle sind dieselbe Rechnung wie
    // beim Meer, Tiefenfarbe und Schaumsaum ausdrücklich nicht — bei 30 cm
    // Wassertiefe bestünde die ganze Fläche aus Uferschaum.
    const material = new PaddyWaterMaterial(this.atmosphere);
    material.vertexColors = false;
    material.flatShading = false;
    material.color = new Color().setHex(PADDY_WATER.color, 'srgb');
    material.roughness = PADDY_WATER.roughness;
    material.metalness = PADDY_WATER.metalness;
    this.#material = material;
    // Eine Stufe, die vor dem Bauen gesetzt wurde, gilt trotzdem: `#detail`
    // überlebt, bis es ein Material gibt, das den Wert tragen kann.
    material.uPaddyDetail.value = this.#detail;

    const step = PADDY_WATER.grid;
    const tile = PADDY_WATER.tile;
    const tiles = Math.ceil(WORLD.size / tile);
    let triangles = 0;

    // Kratzpuffer außerhalb der Schleifen: bei 6 m Raster über 101 ha sind das
    // rund 28 000 Zellen, und vier neue Felder je Zelle wären 112 000
    // kurzlebige Objekte für nichts.
    const wet = [false, false, false, false];
    const polyX: number[] = [];
    const polyZ: number[] = [];

    for (let tz = 0; tz < tiles; tz++) {
      for (let tx = 0; tx < tiles; tx++) {
        const x0 = -WORLD.half + tx * tile;
        const z0 = -WORLD.half + tz * tile;
        const position: number[] = [];

        for (let z = z0; z < z0 + tile; z += step) {
          for (let x = x0; x < x0 + tile; x += step) {
            let wetCount = 0;
            let lowest = Number.POSITIVE_INFINITY;
            let highest = Number.NEGATIVE_INFINITY;
            for (let i = 0; i < 4; i++) {
              const px = x + CORNER_DX[i]! * step;
              const pz = z + CORNER_DZ[i]! * step;
              const w = this.#wet(px, pz);
              wet[i] = w;
              if (!w) continue;
              wetCount++;
              // **Nur nasse Ecken zählen für die Höhe.** Vorher ging die Höhe
              // einer trockenen Ecke mit ein, und die steht auf dem Damm —
              // die Zelle fiel dann durch die Toleranz und das Wasser blieb
              // eine ganze Zellbreite vor seinem eigenen Rand stehen.
              const h = sampler.getHeightAt(px, pz);
              if (h < lowest) lowest = h;
              if (h > highest) highest = h;
            }
            if (wetCount === 0) continue;

            // Zwei Parzellen können ohne sichtbaren Damm aneinanderstoßen, wenn
            // ihr Niveau um eine Terrassenstufe springt; eine Fläche darüber
            // wäre schief. Der Grenzwert ist knapp, weil das Gelände innerhalb
            // einer Parzelle exakt eben ist — jede Abweichung ist bereits eine
            // Kante.
            if (highest - lowest > PADDY_WATER.levelTolerance) continue;

            const y = lowest + this.#waterDepth;

            // **Sattelfall:** zwei diagonal gegenüberliegende nasse Ecken. Der
            // Randzug unten ergäbe dort ein sich selbst schneidendes Polygon
            // und der Fächer darüber inverse Dreiecke. Solche Zellen werden
            // voll gefüllt — sie sind selten, und ein Zuviel von einer halben
            // Zelle an einer Sattelstelle sieht niemand.
            const saddle = wetCount === 2 && wet[0] === wet[2] && wet[1] === wet[3];

            polyX.length = 0;
            polyZ.length = 0;
            if (wetCount === 4 || saddle) {
              for (let i = 0; i < 4; i++) {
                polyX.push(x + CORNER_DX[i]! * step);
                polyZ.push(z + CORNER_DZ[i]! * step);
              }
            } else {
              // Marching Squares: den Zellrand einmal umlaufen, nasse Ecken
              // mitnehmen und dort, wo die Nässe wechselt, den Kantenmittelpunkt
              // einsetzen. Für alle Fälle außer dem Sattel ist das Ergebnis
              // konvex und damit fächertauglich.
              for (let i = 0; i < 4; i++) {
                const j = (i + 1) & 3;
                const ix = x + CORNER_DX[i]! * step;
                const iz = z + CORNER_DZ[i]! * step;
                const jx = x + CORNER_DX[j]! * step;
                const jz = z + CORNER_DZ[j]! * step;
                if (wet[i]) {
                  polyX.push(ix);
                  polyZ.push(iz);
                }
                if (wet[i] !== wet[j]) {
                  polyX.push((ix + jx) / 2);
                  polyZ.push((iz + jz) / 2);
                }
              }
            }

            // Fächer vom ersten Punkt. Die Umlaufrichtung von `CORNER_*` trägt
            // die Wickelrichtung — siehe dort.
            for (let i = 1; i + 1 < polyX.length; i++) {
              position.push(
                polyX[0]!, y, polyZ[0]!,
                polyX[i]!, y, polyZ[i]!,
                polyX[i + 1]!, y, polyZ[i + 1]!,
              );
            }
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

  // ── Was das WaterSystem hereinreicht (P19) ────────────────────────────────
  //
  // Die Umsetzung von `PaddySink`. Das Nahdetail wird **gemerkt** und nicht nur
  // durchgereicht: `quality:changed` kommt beim Start, bevor `terrain:ready` die
  // Flächen gebaut hat, und ein Wert, der nur ankommt, wenn die Ladereihenfolge
  // stimmt, ist ein Wert, der irgendwann fehlt. Die Kielwelle braucht das nicht
  // — sie kommt je Frame, und ein verlorener Frame ist keiner.

  setDetail(detail: number): void {
    this.#detail = detail;
    if (this.#material) this.#material.uPaddyDetail.value = detail;
  }

  setVehicleWake(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    speed: number,
    active: boolean,
  ): void {
    const material = this.#material;
    if (!material) return;
    material.uPaddyWake.value.set(x, z, 0, speed);
    material.uPaddyFwd.value.set(dirX, dirZ, active ? 1 : 0, 0);
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
