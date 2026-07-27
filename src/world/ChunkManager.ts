import {
  Box3,
  BufferAttribute,
  Frustum,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Vector3,
  type PerspectiveCamera,
} from 'three';

import { LOD, LOD_TRIANGLES_PER_NODE } from '@/config/lod.config';
import { HeightPyramid } from './terrain/HeightPyramid';
import type { TerrainSampler } from './TerrainSampler';

export interface ChunkStats {
  /** Gezeichnete Knoten im letzten Auswahllauf. */
  nodes: number;
  /** Dreiecke, die diese Knoten kosten. */
  triangles: number;
  /** Knoten je LOD-Stufe, Index 0 ist die feinste. */
  readonly perLevel: number[];
  /** Knoten, die das Frustum verworfen hat. */
  culled: number;
  /** Dauer des Auswahllaufs in Millisekunden. */
  selectMs: number;
  /**
   * Knoten, die nicht mehr in die Instanzpuffer passten.
   *
   * Muss null bleiben. Ein Wert darüber heißt: es fehlen Stücke im Gelände, und
   * zwar lautlos — kein Fehler, keine Warnung, nur ein Loch am Horizont. Genau
   * deshalb wird gezählt statt stillschweigend abgeschnitten.
   */
  overflow: number;
}

/**
 * Terrain-LOD über einen Quadtree mit CDLOD — PLAN.md P4 / 4.1.
 *
 * Ersetzt das feste 768²-Gitter aus P1. Drei Eigenschaften machen den Umbau
 * aus, und alle drei sind messbar:
 *
 *  1. **Ein Draw-Call für das ganze Terrain.** Alle ausgewählten Knoten teilen
 *     sich eine einzige Einheitsgeometrie und unterscheiden sich nur in vier
 *     Instanzattributen. Ein Mesh je Knoten wäre die naheliegende Umsetzung und
 *     kostete bei ~180 Knoten 180 Draw-Calls — ein Fünftel des Budgets aus
 *     SPEC §4 für etwas, das vorher einen einzigen gekostet hat.
 *  2. **Feiner nah, gröber fern.** Das P1-Gitter tastete die Heightmap mit 4,0 m
 *     ab, obwohl sie mit 1,5 m vorliegt. Ein Blattknoten hat jetzt genau 1,5 m
 *     pro Vertex, und die Gesamtzahl der Dreiecke sinkt trotzdem.
 *  3. **Kein Popping, keine Risse** — durch Vertex-Morphing statt Skirts. Die
 *     Begründung dafür steht in lod.config.ts bei `splitFactor` und `morphStart`.
 *
 * Der Manager hält keine Szenengrafik: er füllt die Instanzpuffer einer
 * Geometrie, die das TerrainSystem an sein Material hängt. Das trennt „welche
 * Knoten" von „wie sieht Gelände aus" — und nur so bleibt das Material aus P1
 * mit seiner ganzen Splat-, Nebel- und Verschattungskette unangetastet.
 */
export class ChunkManager {
  readonly geometry: InstancedBufferGeometry;
  readonly stats: ChunkStats = {
    nodes: 0,
    triangles: 0,
    perLevel: new Array<number>(LOD.levels).fill(0),
    culled: 0,
    selectMs: 0,
    overflow: 0,
  };

  readonly #pyramid: HeightPyramid;
  readonly #origin: InstancedBufferAttribute;
  readonly #size: InstancedBufferAttribute;
  readonly #morph: InstancedBufferAttribute;
  readonly #level: InstancedBufferAttribute;

  readonly #frustum = new Frustum();
  readonly #viewProjection = new Matrix4();
  readonly #box = new Box3();
  readonly #camera = new Vector3();

  #count = 0;
  /** Auswahl anhalten, um Risse und Popping im Standbild zu begutachten. */
  frozen = false;

  constructor(sampler: TerrainSampler) {
    this.#pyramid = HeightPyramid.build(sampler);

    this.geometry = ChunkManager.#createGeometry();
    this.#origin = new InstancedBufferAttribute(new Float32Array(LOD.maxNodes * 2), 2);
    this.#size = new InstancedBufferAttribute(new Float32Array(LOD.maxNodes), 1);
    this.#morph = new InstancedBufferAttribute(new Float32Array(LOD.maxNodes * 2), 2);
    this.#level = new InstancedBufferAttribute(new Float32Array(LOD.maxNodes), 1);

    this.geometry.setAttribute('aNodeOrigin', this.#origin);
    this.geometry.setAttribute('aNodeSize', this.#size);
    this.geometry.setAttribute('aNodeMorph', this.#morph);
    this.geometry.setAttribute('aNodeLevel', this.#level);
    this.geometry.instanceCount = 0;
  }

  /**
   * Das geteilte Einheitsgitter: 33 × 33 Stützstellen über [0,1]².
   *
   * `normal` und `uv` stehen darin, obwohl das Material beide nicht benutzt —
   * die Höhe kommt aus der Textur, die Normale aus normal.png, und die
   * Texturkoordinaten rechnet der Fragment-Shader aus der Weltposition. Three
   * deklariert die Attribute aber im Vertex-Shader von `MeshStandardMaterial`,
   * und ein nicht gebundenes Attribut liest in WebGL2 als (0,0,0,1). Für
   * `normal` wäre das ein Nullvektor: `normalize()` darauf ergibt NaN, und das
   * Terrain verschwindet — ohne Fehlermeldung, weil formal alles korrekt ist.
   */
  static #createGeometry(): InstancedBufferGeometry {
    const n = LOD.gridVertices;
    const quads = LOD.gridQuads;
    const vertices = n * n;

    const position = new Float32Array(vertices * 3);
    const normal = new Float32Array(vertices * 3);
    const uv = new Float32Array(vertices * 2);
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const i = z * n + x;
        position[i * 3] = x / quads;
        position[i * 3 + 1] = 0;
        position[i * 3 + 2] = z / quads;
        normal[i * 3 + 1] = 1;
        uv[i * 2] = x / quads;
        uv[i * 2 + 1] = z / quads;
      }
    }

    const index = new Uint16Array(quads * quads * 6);
    let w = 0;
    for (let z = 0; z < quads; z++) {
      for (let x = 0; x < quads; x++) {
        const a = z * n + x;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        // Wickelrichtung gegen den Uhrzeigersinn von oben gesehen, damit die
        // Fläche nach +Y zeigt. Andersherum verschwindet das ganze Terrain im
        // Backface-Culling, während Draw-Calls und Dreieckszähler weiter
        // plausibel aussehen — genau so ist es in P3 dem Straßen-Mesh ergangen.
        index[w++] = a;
        index[w++] = c;
        index[w++] = b;
        index[w++] = b;
        index[w++] = c;
        index[w++] = d;
      }
    }

    const geometry = new InstancedBufferGeometry();
    geometry.name = 'TerrainNodeGrid';
    geometry.setAttribute('position', new BufferAttribute(position, 3));
    geometry.setAttribute('normal', new BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    geometry.setIndex(new BufferAttribute(index, 1));
    // Das Mesh wird nie als Ganzes gecullt (jeder Knoten einzeln, auf der CPU),
    // aber three liest die Hülle trotzdem für Sortierung und Raycasting.
    geometry.boundingSphere = null;
    return geometry;
  }

  /** Auswahl für diese Kameraposition. Läuft je Frame; allokationsfrei. */
  select(camera: PerspectiveCamera): void {
    if (this.frozen) return;

    const start = performance.now();
    this.#count = 0;
    this.stats.culled = 0;
    this.stats.overflow = 0;
    this.stats.perLevel.fill(0);

    this.#camera.copy(camera.position);
    camera.updateMatrixWorld();
    this.#viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.#frustum.setFromProjectionMatrix(this.#viewProjection);

    this.#selectNode(0, 0, 0, LOD.maxDepth);

    this.#origin.needsUpdate = true;
    this.#size.needsUpdate = true;
    this.#morph.needsUpdate = true;
    this.#level.needsUpdate = true;
    this.geometry.instanceCount = this.#count;

    this.stats.nodes = this.#count;
    this.stats.triangles = this.#count * LOD_TRIANGLES_PER_NODE;
    this.stats.selectMs = performance.now() - start;
  }

  /**
   * Rekursiver Abstieg.
   *
   * `depth` zählt von der Wurzel nach unten, `level` von den Blättern nach
   * oben — sie ergänzen sich zu `maxDepth`. Beide zu führen sieht redundant
   * aus, spart aber in der innersten Schleife eine Subtraktion und, wichtiger,
   * eine Fehlerquelle: die Bereichstabelle ist nach Stufe indiziert, das
   * Min/Max-Feld nach Tiefe.
   */
  #selectNode(depth: number, nx: number, nz: number, level: number): void {
    const size = HeightPyramid.nodeSize(depth);
    const x0 = HeightPyramid.originX(depth, nx);
    const z0 = HeightPyramid.originZ(depth, nz);
    this.#box.min.set(x0, this.#pyramid.min(depth, nx, nz), z0);
    this.#box.max.set(x0 + size, this.#pyramid.max(depth, nx, nz), z0 + size);

    if (!this.#frustum.intersectsBox(this.#box)) {
      this.stats.culled++;
      return;
    }

    // Unterteilt wird, solange die Kamera dem Quader näher ist als der Bereich
    // der *nächstfeineren* Stufe. Gemessen wird gegen den Quader, nicht gegen
    // seinen Mittelpunkt: bei einem 3072-m-Wurzelknoten lägen dazwischen bis zu
    // 2172 m, und die Wurzel bliebe stehen, obwohl die Kamera mittendrin sitzt.
    if (level > 0 && this.#box.distanceToPoint(this.#camera) < LOD.ranges[level - 1]!) {
      const cx = nx * 2;
      const cz = nz * 2;
      this.#selectNode(depth + 1, cx, cz, level - 1);
      this.#selectNode(depth + 1, cx + 1, cz, level - 1);
      this.#selectNode(depth + 1, cx, cz + 1, level - 1);
      this.#selectNode(depth + 1, cx + 1, cz + 1, level - 1);
      return;
    }

    this.#emit(x0, z0, size, level);
  }

  #emit(x0: number, z0: number, size: number, level: number): void {
    if (this.#count >= LOD.maxNodes) {
      this.stats.overflow++;
      return;
    }
    const i = this.#count++;

    this.#origin.array[i * 2] = x0;
    this.#origin.array[i * 2 + 1] = z0;
    this.#size.array[i] = size;

    // Morph-Bereich: von `morphStart · ranges[level]` bis `ranges[level]`. Am
    // oberen Ende ist der Knoten vollständig auf das Gitter der nächstgröberen
    // Stufe zusammengezogen — genau dort übernimmt sie ihn ungemorpht.
    const end = LOD.ranges[level]!;
    const begin = end * LOD.morphStart;
    this.#morph.array[i * 2] = begin;
    this.#morph.array[i * 2 + 1] = 1 / (end - begin);
    this.#level.array[i] = level;

    this.stats.perLevel[level]!++;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
