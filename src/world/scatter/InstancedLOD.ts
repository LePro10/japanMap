import { InstancedMesh, type BufferGeometry, type Material } from 'three';

import type { SpeciesSettings } from '@/config/vegetation.config';

/** Die drei Stufen, in der Reihenfolge von nah nach fern. */
export const LOD_NEAR = 0;
export const LOD_MID = 1;
export const LOD_FAR = 2;
export const LOD_COUNT = 3;

export interface LodStage {
  readonly geometry: BufferGeometry;
  readonly material: Material;
}

/**
 * Die drei Instanz-Stufen einer Art — PLAN.md P4 / 4.3.
 *
 * > **Ein `InstancedMesh` je Art und Stufe, nicht je Chunk.** Der Plan schreibt
 * > „`InstancedMesh` je (Chunk × Asset × LOD)". Das ist mit dem Draw-Call-Budget
 * > derselben Phase nicht vereinbar, und die Rechnung dazu ist kurz: bei 64-m-
 * > Chunks liegen im Sichtbereich der Vegetation rund 140 Chunks, davon behält
 * > das Frustum etwa 50. Mal vier Arten mal drei Stufen wären das **600
 * > Draw-Calls** — allein für Vegetation, gegen ein Gesamtbudget von 800 und ein
 * > Teilbudget von 100 aus den Akzeptanzkriterien. Über alle Chunks
 * > zusammengefasst sind es **zwölf**, und der Preis dafür ist genau die
 * > Umsortierung, die der Plan im selben Abschnitt ohnehin verlangt.
 *
 * Umsortiert wird in Zeitscheiben: der Aufrufer schreibt über mehrere Frames
 * hinweg in einen Zwischenpuffer und schaltet erst am Ende eines vollständigen
 * Durchlaufs um. Ein halb gefüllter Puffer wird nie gezeichnet — sonst
 * verschwände beim Fliegen die halbe Vegetation für ein paar Frames.
 */
export class InstancedLOD {
  readonly meshes: readonly InstancedMesh[];

  /** Zwischenpuffer je Stufe: hier entsteht der nächste Durchlauf. */
  readonly #scratch: Float32Array[];
  readonly #counts: number[];
  readonly #capacity: number[];
  #dropped = 0;

  constructor(
    readonly species: SpeciesSettings,
    stages: readonly LodStage[],
    capacity: readonly number[],
  ) {
    const meshes: InstancedMesh[] = [];
    this.#scratch = [];
    this.#counts = [];
    this.#capacity = [...capacity];

    for (let lod = 0; lod < LOD_COUNT; lod++) {
      const stage = stages[lod]!;
      const mesh = new InstancedMesh(stage.geometry, stage.material, capacity[lod]!);
      mesh.name = `${species.id}:lod${lod}`;
      // Gecullt wird pro Chunk auf der CPU. Three würde sonst die Hülle der
      // *Geometrie* mit der Objektmatrix prüfen — die steht im Ursprung, und
      // damit fiele die gesamte Vegetation weg, sobald der Weltursprung aus
      // dem Bild wandert.
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.count = 0;
      meshes.push(mesh);
      this.#scratch.push(new Float32Array(capacity[lod]! * 16));
      this.#counts.push(0);
    }
    this.meshes = meshes;
  }

  /** Zwischenpuffer leeren — Beginn eines neuen Durchlaufs. */
  beginPass(): void {
    this.#counts[LOD_NEAR] = 0;
    this.#counts[LOD_MID] = 0;
    this.#counts[LOD_FAR] = 0;
    this.#dropped = 0;
  }

  /**
   * Eine Instanz in den Zwischenpuffer schreiben.
   *
   * Die Matrix wird von Hand gesetzt statt über `Matrix4.compose()`. Der Grund
   * ist Stückzahl: bei 60 000 Instanzen alle vier Frames sind das 15 000
   * Aufrufe je Frame, und `compose` geht den Umweg über ein Quaternion für eine
   * Drehung, die ausschließlich um Y geht. Sinus und Kosinus reichen.
   */
  push(lod: number, x: number, y: number, z: number, scale: number, rotation: number): void {
    const at = this.#counts[lod]!;
    if (at >= this.#capacity[lod]!) {
      this.#dropped++;
      return;
    }
    const m = this.#scratch[lod]!;
    const i = at * 16;
    const c = Math.cos(rotation) * scale;
    const s = Math.sin(rotation) * scale;

    m[i] = c;
    m[i + 1] = 0;
    m[i + 2] = -s;
    m[i + 3] = 0;
    m[i + 4] = 0;
    m[i + 5] = scale;
    m[i + 6] = 0;
    m[i + 7] = 0;
    m[i + 8] = s;
    m[i + 9] = 0;
    m[i + 10] = c;
    m[i + 11] = 0;
    m[i + 12] = x;
    m[i + 13] = y;
    m[i + 14] = z;
    m[i + 15] = 1;

    this.#counts[lod] = at + 1;
  }

  /** Durchlauf abschließen: Zwischenpuffer sichtbar machen. */
  endPass(): void {
    for (let lod = 0; lod < LOD_COUNT; lod++) {
      const mesh = this.meshes[lod]!;
      const count = this.#counts[lod]!;
      // Nur der belegte Teil wird kopiert. Bei einer Kamera in der Stadt sind
      // die Fernpuffer der Bäume fast leer, und der ganze Puffer zu kopieren
      // wäre die teuerste Zeile in einem System, das sonst nichts tut.
      mesh.instanceMatrix.array.set(this.#scratch[lod]!.subarray(0, count * 16));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = count;
    }
  }

  get counts(): readonly number[] {
    return this.#counts;
  }

  /** Instanzen, die nicht mehr in den Puffer passten. Muss null bleiben. */
  get dropped(): number {
    return this.#dropped;
  }

  get visible(): number {
    return this.meshes[0]!.count + this.meshes[1]!.count + this.meshes[2]!.count;
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
  }
}
