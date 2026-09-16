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
import { PropMaterial } from '../materials/PropMaterial';
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
  #bankMaterial: PropMaterial | null = null;
  #sampler: TerrainSampler | null = null;
  #mask: Uint8ClampedArray | null = null;
  #maskRes = 0;
  #waterDepth = PADDY_WATER.depth;
  /** Nahdetail aus der Qualitätsstufe — siehe `setDetail`. */
  #detail = 1;

  readonly #readouts = { kacheln: '—', dreiecke: '—', boeschung: '—' };

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
    // Depth is a runtime number. The baker's 0,30 m stays in meta so a rebake
    // does not become a requirement for a shallower sheet — see `PADDY_WATER.depth`.
    this.#waterDepth = PADDY_WATER.depth;
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

    const bankMaterial = new PropMaterial(this.atmosphere);
    bankMaterial.name = 'PaddyBankMaterial';
    bankMaterial.vertexColors = true;
    bankMaterial.flatShading = true;
    bankMaterial.roughness = 0.92;
    bankMaterial.polygonOffset = true;
    bankMaterial.polygonOffsetFactor = -1;
    bankMaterial.polygonOffsetUnits = -1;
    this.#bankMaterial = bankMaterial;
    const bankTop = new Color().setHex(PADDY_WATER.bankTop, 'srgb');
    const bankWet = new Color().setHex(PADDY_WATER.bankWet, 'srgb');

    const step = PADDY_WATER.grid;
    const tile = PADDY_WATER.tile;
    const tiles = Math.ceil(WORLD.size / tile);
    let triangles = 0;
    let bankTriangles = 0;

    // Kratzpuffer außerhalb der Schleifen: bei 6 m Raster über 101 ha sind das
    // rund 28 000 Zellen, und vier neue Felder je Zelle wären 112 000
    // kurzlebige Objekte für nichts.
    const wet = [false, false, false, false];
    const polyX: number[] = [];
    const polyZ: number[] = [];
    const insetX: number[] = [];
    const insetZ: number[] = [];

    for (let tz = 0; tz < tiles; tz++) {
      for (let tx = 0; tx < tiles; tx++) {
        const x0 = -WORLD.half + tx * tile;
        const z0 = -WORLD.half + tz * tile;
        const position: number[] = [];
        const bankPos: number[] = [];
        const bankCol: number[] = [];

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

            this.#insetBoundary(sampler, polyX, polyZ, insetX, insetZ);

            // Fächer vom ersten Punkt. Die Umlaufrichtung von `CORNER_*` trägt
            // die Wickelrichtung — siehe dort. Eingezogen, damit die Erde der
            // Böschung eine Krone hat und der Spiegel nicht über die Stufe ragt.
            for (let i = 1; i + 1 < insetX.length; i++) {
              position.push(
                insetX[0]!, y, insetZ[0]!,
                insetX[i]!, y, insetZ[i]!,
                insetX[i + 1]!, y, insetZ[i + 1]!,
              );
            }

            this.#emitBanks(sampler, polyX, polyZ, insetX, insetZ, y, bankPos, bankCol, bankTop, bankWet);
          }
        }

        if (position.length) {
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

        if (bankPos.length) {
          const geometry = new BufferGeometry();
          geometry.setAttribute('position', new Float32BufferAttribute(bankPos, 3));
          geometry.setAttribute('color', new Float32BufferAttribute(bankCol, 3));
          geometry.computeVertexNormals();
          geometry.computeBoundingSphere();
          const mesh = new Mesh(geometry, bankMaterial);
          mesh.name = `paddy-bank:${tx}:${tz}`;
          mesh.matrixAutoUpdate = false;
          mesh.frustumCulled = true;
          group.add(mesh);
          this.#meshes.push(mesh);
          bankTriangles += bankPos.length / 9;
        }
      }
    }

    this.#readouts.kacheln = `${this.#meshes.length}`;
    this.#readouts.dreiecke = triangles.toLocaleString('de-DE');
    this.#readouts.boeschung = bankTriangles.toLocaleString('de-DE');
    this.#context?.debug?.refresh();
  }

  /**
   * Nasse/trockene Kanten um `bankInset` nach innen ziehen.
   *
   * Innenkanten (Nachbar nass) bleiben, sonst entstünde zwischen zwei
   * Wasserzellen ein 0,5-m-Spalt. Eine Ecke an zwei trockenen Seiten wird
   * entlang beider Innennormalen verschoben — das ist die Diagonale, kein Fehler.
   */
  #insetBoundary(
    sampler: TerrainSampler,
    polyX: number[],
    polyZ: number[],
    insetX: number[],
    insetZ: number[],
  ): void {
    const n = polyX.length;
    insetX.length = n;
    insetZ.length = n;
    for (let i = 0; i < n; i++) {
      insetX[i] = polyX[i]!;
      insetZ[i] = polyZ[i]!;
    }
    const ins = PADDY_WATER.bankInset;
    const probe = 1.6;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = polyX[j]! - polyX[i]!;
      const dz = polyZ[j]! - polyZ[i]!;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      // Polygon is (0,0)→(0,1)→(1,1)→(1,0): clockwise in XZ with Z up, +Y
      // triangles. Outward is rotate the edge 90° CCW: (−dz, dx).
      const ox = -dz / len;
      const oz = dx / len;
      const mx = (polyX[i]! + polyX[j]!) * 0.5;
      const mz = (polyZ[i]! + polyZ[j]!) * 0.5;
      const outH = sampler.getHeightAt(mx + ox * probe, mz + oz * probe);
      const hereH = sampler.getHeightAt(mx, mz);
      // Gleiches Niveau und nass: Innenkante, nicht einziehen — sonst klafft
      // zwischen zwei Wasserzellen ein Spalt. Eine Stufe (nasse Nachbarparzelle
      // tiefer) ist ein Rand, auch wenn die Maske dort nass bleibt.
      if (this.#wet(mx + ox * probe, mz + oz * probe) && hereH - outH < PADDY_WATER.dropMin) {
        continue;
      }
      insetX[i]! -= ox * ins;
      insetZ[i]! -= oz * ins;
      insetX[j]! -= ox * ins;
      insetZ[j]! -= oz * ins;
    }
  }

  /**
   * Erde an Stufen, nicht an Dämmen.
   *
   * Der Spiegel ist eine einseitige Fläche mit Normale +Y. Von der unteren
   * Terrasse sieht man darunter durch — Backface-Culling, und das Gelände fällt
   * in 1,5 m Texeln als Schräge, nicht als Wand. Gemessen 2026-09-16: 4 747
   * Kanten mit mehr als 0,4 m Luft unter der Wasserlinie, in der Nähe des
   * Blickpunkts `reisfeld` 2,5 m. Der Baker müsste das Höhenfeld anfassen;
   * Erosion trägt jede Störung über die Karte. Die Fläche hier hängt am
   * Wasserpolygon und folgt dem Abfall nach außen.
   *
   * Wicklung der Wand: P_krone → Q_krone → Q_fuß (und P_krone → Q_fuß → P_fuß).
   * Kante × (nach außen + nach unten) zeigt nach außen und oben — sichtbar von
   * der unteren Terrasse, nicht von unter der Fläche. Die Stadt-Schürze in
   * `CityGenerator.buildGround` ist dieselbe Form; dort hat die umgekehrte
   * Eckenfolge 240 von 242 Dreiecken ins Culling fallen lassen.
   */
  #emitBanks(
    sampler: TerrainSampler,
    polyX: number[],
    polyZ: number[],
    insetX: number[],
    insetZ: number[],
    waterY: number,
    pos: number[],
    col: number[],
    top: Color,
    wet: Color,
  ): void {
    const n = polyX.length;
    if (n < 3) return;
    const tint = new Color();
    const crestY = waterY + PADDY_WATER.bankCrest;
    const reach = PADDY_WATER.bankReach;
    const rings = [0, reach * 0.45, reach];
    const probe = 1.2;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = polyX[j]! - polyX[i]!;
      const dz = polyZ[j]! - polyZ[i]!;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      const ox = -dz / len;
      const oz = dx / len;
      const mx = (polyX[i]! + polyX[j]!) * 0.5;
      const mz = (polyZ[i]! + polyZ[j]!) * 0.5;
      if (this.#wet(mx + ox * probe, mz + oz * probe)
        && waterY - sampler.getHeightAt(mx + ox * probe, mz + oz * probe) < PADDY_WATER.dropMin) {
        continue;
      }

      let lowest = Infinity;
      for (const r of rings) {
        if (r === 0) continue;
        const hy = sampler.getHeightAt(mx + ox * r, mz + oz * r);
        if (hy < lowest) lowest = hy;
      }
      if (waterY - lowest < PADDY_WATER.dropMin) continue;

      const shade = (x: number, y: number, z: number): { r: number; g: number; b: number } => {
        const wetness = Math.min(1, Math.max(0, (crestY - y) / Math.max(0.08, crestY - lowest)));
        tint.copy(top).lerp(wet, wetness);
        const n = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);
        const frac = n - Math.floor(n);
        const layer = Math.floor(y * 2.6) & 1;
        const k = (layer ? 0.88 : 1.05) * (0.9 + frac * 0.18);
        return { r: tint.r * k, g: tint.g * k, b: tint.b * k };
      };

      // Krone +Y. Reihenfolge gegen den Umlauf, weil Outward (−dz, dx) ist.
      this.#pushTri(
        pos, col,
        polyX[i]!, crestY, polyZ[i]!, shade(polyX[i]!, crestY, polyZ[i]!),
        insetX[j]!, crestY, insetZ[j]!, shade(insetX[j]!, crestY, insetZ[j]!),
        insetX[i]!, crestY, insetZ[i]!, shade(insetX[i]!, crestY, insetZ[i]!),
      );
      this.#pushTri(
        pos, col,
        polyX[i]!, crestY, polyZ[i]!, shade(polyX[i]!, crestY, polyZ[i]!),
        polyX[j]!, crestY, polyZ[j]!, shade(polyX[j]!, crestY, polyZ[j]!),
        insetX[j]!, crestY, insetZ[j]!, shade(insetX[j]!, crestY, insetZ[j]!),
      );

      // Wand in 2-m-Stücken, zwei Ringe — folgt dem Abfall statt einer Pappe.
      const segs = Math.max(1, Math.ceil(len / 2));
      const point = (t: number, r: number): { x: number; y: number; z: number } => {
        const px = polyX[i]! + dx * t;
        const pz = polyZ[i]! + dz * t;
        const x = px + ox * r;
        const z = pz + oz * r;
        const y = r === 0 ? crestY : Math.min(crestY - 0.04, sampler.getHeightAt(x, z));
        return { x, y, z };
      };
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs;
        const t1 = (s + 1) / segs;
        for (let r = 0; r + 1 < rings.length; r++) {
          const a = point(t0, rings[r]!);
          const b = point(t1, rings[r]!);
          const c = point(t1, rings[r + 1]!);
          const d = point(t0, rings[r + 1]!);
          this.#pushTri(
            pos, col,
            a.x, a.y, a.z, shade(a.x, a.y, a.z),
            d.x, d.y, d.z, shade(d.x, d.y, d.z),
            b.x, b.y, b.z, shade(b.x, b.y, b.z),
          );
          this.#pushTri(
            pos, col,
            b.x, b.y, b.z, shade(b.x, b.y, b.z),
            d.x, d.y, d.z, shade(d.x, d.y, d.z),
            c.x, c.y, c.z, shade(c.x, c.y, c.z),
          );
        }
      }
    }
  }

  #pushTri(
    pos: number[],
    col: number[],
    ax: number, ay: number, az: number, ac: { r: number; g: number; b: number },
    bx: number, by: number, bz: number, bc: { r: number; g: number; b: number },
    cx: number, cy: number, cz: number, cc: { r: number; g: number; b: number },
  ): void {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    col.push(ac.r, ac.g, ac.b, bc.r, bc.g, bc.b, cc.r, cc.g, cc.b);
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
    folder.addBinding(this.#readouts, 'boeschung', { readonly: true, label: 'Böschung' });
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
    this.#bankMaterial?.dispose();
    this.#bankMaterial = null;
    this.#mask = null;
    this.#context = null;
  }
}
