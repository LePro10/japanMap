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

import { LOD, lodTrianglesPerNode, type GridVertices } from '@/config/lod.config';
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
 *  1. **Höchstens zwei Draw-Calls für das ganze Terrain.** Unregelmäßige Knoten
 *     teilen ein Gitter, exakt ebene Knoten einen Randfächer; beide nutzen vier
 *     Instanzattribute. Ein Mesh je Knoten wäre die naheliegende Umsetzung und
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
  /**
   * Die geteilte Knotengeometrie.
   *
   * **Nicht `readonly`, seit P8.1 die Auflösung je Qualitätsstufe verstellt.**
   * Wer sie an ein Mesh hängt, muss nach `setGridVertices()` neu zuweisen —
   * `TerrainSystem` tut das über `quality:changed`.
   */
  geometry: InstancedBufferGeometry;
  /** Exactly horizontal nodes retain all grid-edge vertices, with four quadrant fans. */
  flatGeometry: InstancedBufferGeometry;
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
  readonly #flatOrigin = new InstancedBufferAttribute(new Float32Array(LOD.maxNodes * 2), 2);
  readonly #flatSize = new InstancedBufferAttribute(new Float32Array(LOD.maxNodes), 1);
  readonly #flatMorph = new InstancedBufferAttribute(new Float32Array(LOD.maxNodes * 2), 2);
  readonly #flatLevel = new InstancedBufferAttribute(new Float32Array(LOD.maxNodes), 1);

  readonly #frustum = new Frustum();
  readonly #viewProjection = new Matrix4();
  readonly #box = new Box3();
  readonly #camera = new Vector3();

  #count = 0;
  #gridCount = 0;
  #flatCount = 0;
  #gridVertices: GridVertices;
  /** Auswahl anhalten, um Risse und Popping im Standbild zu begutachten. */
  frozen = false;

  constructor(sampler: TerrainSampler, gridVertices: GridVertices = LOD.gridVertices) {
    this.#pyramid = HeightPyramid.build(sampler);

    this.#gridVertices = gridVertices;
    this.geometry = ChunkManager.#createGeometry(gridVertices);
    this.flatGeometry = ChunkManager.#createFlatGeometry(gridVertices);
    this.#origin = new InstancedBufferAttribute(new Float32Array(LOD.maxNodes * 2), 2);
    this.#size = new InstancedBufferAttribute(new Float32Array(LOD.maxNodes), 1);
    this.#morph = new InstancedBufferAttribute(new Float32Array(LOD.maxNodes * 2), 2);
    this.#level = new InstancedBufferAttribute(new Float32Array(LOD.maxNodes), 1);

    this.#bindInstanceAttributes();
    this.geometry.instanceCount = 0;
    this.flatGeometry.instanceCount = 0;
  }

  /** Stützstellen pro Achse im aktuellen Gitter. */
  get gridVertices(): GridVertices {
    return this.#gridVertices;
  }

  /**
   * Gitterauflösung wechseln — P8.1.
   *
   * Die Geometrie wird **ersetzt**, nicht umgeschrieben: Position, Normale, UV
   * und Index ändern alle ihre Länge, und ein `BufferAttribute` mit neuer Länge
   * ist ohnehin ein neues Objekt. Die alte Geometrie wird freigegeben, sonst
   * bliebe ihr Puffer bis zum Kontextverlust auf der GPU liegen — bei vier
   * Stufenwechseln in einer Sitzung fällt das nicht auf, bei einem Regler, an
   * dem jemand spielt, schon.
   *
   * **Die Instanzattribute wandern mit, sie werden nicht neu angelegt.** Sie
   * halten die Auswahl des letzten Frames; würden sie hier zurückgesetzt,
   * stünde für einen Frame `instanceCount = 0` im Bild — also nichts. Genau
   * diesen schwarzen Blitz beschreibt schon der Kommentar zur ersten Auswahl im
   * `TerrainSystem`.
   */
  setGridVertices(gridVertices: GridVertices): void {
    if (gridVertices === this.#gridVertices) return;
    const previous = this.geometry;
    const previousFlat = this.flatGeometry;
    this.#gridVertices = gridVertices;
    this.geometry = ChunkManager.#createGeometry(gridVertices);
    this.flatGeometry = ChunkManager.#createFlatGeometry(gridVertices);
    this.#bindInstanceAttributes();
    this.geometry.instanceCount = this.#gridCount;
    this.flatGeometry.instanceCount = this.#flatCount;
    this.#updateTriangleCount();
    previous.dispose();
    previousFlat.dispose();
  }

  #bindInstanceAttributes(): void {
    this.geometry.setAttribute('aNodeOrigin', this.#origin);
    this.geometry.setAttribute('aNodeSize', this.#size);
    this.geometry.setAttribute('aNodeMorph', this.#morph);
    this.geometry.setAttribute('aNodeLevel', this.#level);
    this.flatGeometry.setAttribute('aNodeOrigin', this.#flatOrigin);
    this.flatGeometry.setAttribute('aNodeSize', this.#flatSize);
    this.flatGeometry.setAttribute('aNodeMorph', this.#flatMorph);
    this.flatGeometry.setAttribute('aNodeLevel', this.#flatLevel);
  }

  #updateTriangleCount(): void {
    this.stats.triangles = this.#gridCount * lodTrianglesPerNode(this.#gridVertices)
      + this.#flatCount * 8 * (this.#gridVertices - 1);
  }

  /** Same perimeter and shader as the grid; four even centers never morph.
   * Quadrants halve triangle spans after the full-node fan showed grazing-angle cracks. */
  static #createFlatGeometry(n: number): InstancedBufferGeometry {
    const quads = n - 1;
    const half = quads / 2;
    const perimeter = half * 4;
    const vertices = (perimeter + 1) * 4;
    const positions = new Float32Array(vertices * 3);
    const normals = new Float32Array(vertices * 3);
    const uv = new Float32Array(vertices * 2);
    const index = new Uint16Array(perimeter * 4 * 3);
    const vertex = (i: number, x: number, z: number): void => {
      positions[i * 3] = x; positions[i * 3 + 2] = z;
      normals[i * 3 + 1] = 1;
      uv[i * 2] = x; uv[i * 2 + 1] = z;
    };
    for (let quadrant = 0; quadrant < 4; quadrant++) {
      const x = (quadrant % 2) * half, z = Math.floor(quadrant / 2) * half;
      const start = quadrant * (perimeter + 1), center = start + perimeter;
      for (let i = 0; i < half; i++) {
        vertex(start + i, x / quads, (z + i) / quads);
        vertex(start + half + i, (x + i) / quads, (z + half) / quads);
        vertex(start + half * 2 + i, (x + half) / quads, (z + half - i) / quads);
        vertex(start + half * 3 + i, (x + half - i) / quads, z / quads);
      }
      vertex(center, (x + half / 2) / quads, (z + half / 2) / quads);
      for (let i = 0; i < perimeter; i++) {
        index.set([center, start + i, start + (i + 1) % perimeter], (quadrant * perimeter + i) * 3);
      }
    }
    const geometry = new InstancedBufferGeometry();
    geometry.name = 'TerrainFlatNodeFan';
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    geometry.setIndex(new BufferAttribute(index, 1));
    return geometry;
  }

  /**
   * Das geteilte Einheitsgitter: `n × n` Stützstellen über [0,1]².
   *
   * `normal` und `uv` stehen darin, obwohl das Material beide nicht benutzt —
   * die Höhe kommt aus der Textur, die Normale aus normal.png, und die
   * Texturkoordinaten rechnet der Fragment-Shader aus der Weltposition. Three
   * deklariert die Attribute aber im Vertex-Shader von `MeshStandardMaterial`,
   * und ein nicht gebundenes Attribut liest in WebGL2 als (0,0,0,1). Für
   * `normal` wäre das ein Nullvektor: `normalize()` darauf ergibt NaN, und das
   * Terrain verschwindet — ohne Fehlermeldung, weil formal alles korrekt ist.
   */
  static #createGeometry(n: number): InstancedBufferGeometry {
    const quads = n - 1;
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
    this.#gridCount = 0;
    this.#flatCount = 0;
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
    this.#flatOrigin.needsUpdate = true;
    this.#flatSize.needsUpdate = true;
    this.#flatMorph.needsUpdate = true;
    this.#flatLevel.needsUpdate = true;
    this.geometry.instanceCount = this.#gridCount;
    this.flatGeometry.instanceCount = this.#flatCount;

    this.stats.nodes = this.#count;
    this.#updateTriangleCount();
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

    // The pyramid includes every raw texel supporting bilinear samples on the
    // node boundary. Equality proves the whole morphed surface is one plane.
    this.#emit(x0, z0, size, level, this.#box.min.y === this.#box.max.y);
  }

  #emit(x0: number, z0: number, size: number, level: number, flat: boolean): void {
    if (this.#count >= LOD.maxNodes) {
      this.stats.overflow++;
      return;
    }
    this.#count++;
    const i = flat ? this.#flatCount++ : this.#gridCount++;
    const origin = flat ? this.#flatOrigin : this.#origin;
    const sizes = flat ? this.#flatSize : this.#size;
    const morph = flat ? this.#flatMorph : this.#morph;
    const levels = flat ? this.#flatLevel : this.#level;

    origin.array[i * 2] = x0;
    origin.array[i * 2 + 1] = z0;
    sizes.array[i] = size;

    // Morph-Bereich: von `morphStart · ranges[level]` bis `ranges[level]`. Am
    // oberen Ende ist der Knoten vollständig auf das Gitter der nächstgröberen
    // Stufe zusammengezogen — genau dort übernimmt sie ihn ungemorpht.
    const end = LOD.ranges[level]!;
    const begin = end * LOD.morphStart;
    morph.array[i * 2] = begin;
    morph.array[i * 2 + 1] = 1 / (end - begin);
    levels.array[i] = level;

    this.stats.perLevel[level]!++;
  }

  dispose(): void {
    this.geometry.dispose();
    this.flatGeometry.dispose();
  }
}
