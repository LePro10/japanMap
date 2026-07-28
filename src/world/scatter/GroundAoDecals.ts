import { BufferGeometry, Float32BufferAttribute, InstancedMesh } from 'three';

import { GROUND_AO } from '@/config/vegetation.config';
import { GroundAoMaterial } from '../materials/GroundAoMaterial';
import type { TerrainHeightUniforms } from '../materials/TerrainMaterial';

/**
 * Ein ebenes Gitter in der XZ-Ebene, `position.y` überall null.
 *
 * Die Höhe holt der Vertex-Shader aus der Heightmap. Deshalb genügt hier ein
 * Gitter ohne Normalen und ohne UVs — beides würde nur hochgeladen und nie
 * gelesen.
 */
function createPatch(vertices: number): BufferGeometry {
  const quads = vertices - 1;
  const position: number[] = [];
  const index: number[] = [];

  for (let z = 0; z < vertices; z++) {
    for (let x = 0; x < vertices; x++) {
      position.push(x / quads - 0.5, 0, z / quads - 0.5);
    }
  }
  for (let z = 0; z < quads; z++) {
    for (let x = 0; x < quads; x++) {
      const a = z * vertices + x;
      index.push(a, a + vertices, a + 1, a + 1, a + vertices, a + vertices + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.name = 'GroundAoPatch';
  return geometry;
}

/**
 * Die Bodenverdeckung aller Arten in **einem** Draw-Call.
 *
 * Getrennt von `InstancedLOD`, obwohl beide Klassen einen Zwischenpuffer über
 * einen Durchlauf füllen: der Fleck hat keine LOD-Stufen, keine Varianten und
 * keine Art — drei Bäume und ein Busch verdunkeln denselben Boden auf dieselbe
 * Weise. In `InstancedLOD` wäre er ein Sonderfall, der jede Eimer-Rechnung dort
 * um eine Ausnahme erweitert.
 *
 * Der Durchlauf ist derselbe wie bei der Vegetation und wird vom ScatterSystem
 * mitgeführt: ein halb gefüllter Puffer wird nie sichtbar.
 */
export class GroundAoDecals {
  readonly mesh: InstancedMesh;
  readonly material: GroundAoMaterial;

  readonly #geometry: BufferGeometry;
  readonly #scratch: Float32Array;
  #count = 0;
  #dropped = 0;

  constructor(height: TerrainHeightUniforms) {
    this.#geometry = createPatch(GROUND_AO.vertices);
    this.material = new GroundAoMaterial(height);

    const mesh = new InstancedMesh(this.#geometry, this.material, GROUND_AO.capacity);
    mesh.name = 'vegetation:groundAo';
    // Gecullt wird beim Einsortieren auf der CPU, wie bei der Vegetation —
    // die Objektmatrix steht im Ursprung und taugt nicht als Hülle.
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.count = 0;
    this.mesh = mesh;

    this.#scratch = new Float32Array(GROUND_AO.capacity * 16);
  }

  beginPass(): void {
    this.#count = 0;
    this.#dropped = 0;
  }

  /**
   * Einen Fleck einsortieren.
   *
   * Geschrieben werden nur **sieben** der sechzehn Matrixwerte. Die übrigen
   * bleiben null, und das ist kein vergessener Rest: der Shader liest genau
   * diese sieben (Durchmesser in Spalte 0 und 2, Stärke in Spalte 1, Standort
   * in Spalte 3), und ein Platz im Zwischenpuffer wird nie mit anderen Werten
   * belegt als denselben. Die Matrix ist damit außerhalb dieses Shaders
   * bedeutungslos — deshalb steht `frustumCulled` auf false und es wird nichts
   * daran geraycastet.
   *
   * `y` geht bewusst nicht ein: die Höhe kommt im Shader aus der Heightmap,
   * damit der Fleck der Oberfläche folgt statt einer Ebene.
   */
  push(x: number, z: number, radius: number, strength: number): void {
    if (this.#count >= GROUND_AO.capacity) {
      this.#dropped++;
      return;
    }
    const i = this.#count * 16;
    const m = this.#scratch;
    const diameter = radius * 2;
    m[i] = diameter;
    m[i + 5] = strength;
    m[i + 10] = diameter;
    m[i + 12] = x;
    m[i + 14] = z;
    m[i + 15] = 1;
    this.#count++;
  }

  endPass(): void {
    this.mesh.instanceMatrix.array.set(this.#scratch.subarray(0, this.#count * 16));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = this.#count;
  }

  get visible(): number {
    return this.mesh.count;
  }

  /** Flecken, die nicht mehr in den Puffer passten. Muss null bleiben. */
  get dropped(): number {
    return this.#dropped;
  }

  dispose(): void {
    this.mesh.dispose();
    this.#geometry.dispose();
    this.material.dispose();
  }
}
