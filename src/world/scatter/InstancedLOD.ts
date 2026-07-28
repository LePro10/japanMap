import { InstancedMesh, type BufferGeometry, type Material } from 'three';

import type { SpeciesSettings } from '@/config/vegetation.config';

/** Zahl der Stufen. Nach außen ist nur sie sichtbar — die Indizes bleiben hier. */
export const LOD_COUNT = 3;

/** Die Stufe, auf der der Imposter übernimmt. Er kennt keine Varianten. */
const LOD_IMPOSTER = 2;

export interface LodStage {
  readonly geometry: BufferGeometry;
  readonly material: Material;
}

/**
 * Die Instanz-Stufen einer Art — PLAN.md P4 / 4.3, erweitert um Formvarianten.
 *
 * > **Ein `InstancedMesh` je Art und Stufe, nicht je Chunk.** Der Plan schreibt
 * > „`InstancedMesh` je (Chunk × Asset × LOD)". Das ist mit dem Draw-Call-Budget
 * > derselben Phase nicht vereinbar, und die Rechnung dazu ist kurz: bei 64-m-
 * > Chunks liegen im Sichtbereich der Vegetation rund 200 Chunks, davon behält
 * > das Frustum etwa ein Drittel. Mal vier Arten mal drei Stufen wären das
 * > **mehrere hundert Draw-Calls** — allein für Vegetation, gegen ein
 * > Teilbudget von 100. Über alle Chunks zusammengefasst sind es eine Handvoll,
 * > und der Preis dafür ist genau die Umsortierung, die der Plan im selben
 * > Abschnitt ohnehin verlangt.
 *
 * **Varianten kosten Draw-Calls, aber nur auf den Mesh-Stufen.** Jede Variante
 * ist ein eigenes Modell und braucht deshalb ein eigenes `InstancedMesh` —
 * `nah` und `mittel`, also zwei je Variante. Der **Imposter teilt sich einen
 * Atlas je Art**: er übernimmt ab 180 m, und dort ist ein Baum rund 19 Pixel
 * hoch. Die Form ist da nicht mehr auflösbar, drei Atlanten wären dreimal
 * derselbe Fleck bei dreifachem Texturspeicher.
 *
 * Umsortiert wird in Zeitscheiben: der Aufrufer schreibt über mehrere Frames
 * hinweg in einen Zwischenpuffer und schaltet erst am Ende eines vollständigen
 * Durchlaufs um. Ein halb gefüllter Puffer wird nie gezeichnet — sonst
 * verschwände beim Fliegen die halbe Vegetation für ein paar Frames.
 */
export class InstancedLOD {
  readonly meshes: readonly InstancedMesh[];

  readonly #variants: number;
  /** Zwischenpuffer je Eimer: hier entsteht der nächste Durchlauf. */
  readonly #scratch: Float32Array[];
  readonly #counts: number[];
  readonly #capacity: number[];
  #dropped = 0;

  /**
   * @param stages   `stages[variante][stufe]`; für den Imposter zählt nur
   *                 `stages[0][2]`, weil alle Varianten sich einen Atlas teilen.
   * @param capacity Pufferplätze je **Stufe**, vor der Aufteilung auf Varianten.
   */
  constructor(
    readonly species: SpeciesSettings,
    stages: readonly (readonly LodStage[])[],
    capacity: readonly number[],
  ) {
    this.#variants = Math.max(1, stages.length);
    const meshes: InstancedMesh[] = [];
    this.#scratch = [];
    this.#counts = [];
    this.#capacity = [];

    const add = (stage: LodStage, name: string, slots: number): void => {
      const mesh = new InstancedMesh(stage.geometry, stage.material, slots);
      mesh.name = name;
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
      this.#scratch.push(new Float32Array(slots * 16));
      this.#counts.push(0);
      this.#capacity.push(slots);
    };

    for (let variant = 0; variant < this.#variants; variant++) {
      for (let lod = 0; lod < LOD_IMPOSTER; lod++) {
        // **Nicht `capacity / variants`, sondern mit Zugabe.** Die Zuordnung
        // läuft über einen Zufallswurf je Instanz und ist nur im Mittel
        // gleichverteilt; in einem einzelnen Bestand kann eine Variante deutlich
        // häufiger vorkommen. Ein zu knapper Puffer verwirft Instanzen, und das
        // sieht aus wie Popping.
        const slots = Math.ceil((capacity[lod]! / this.#variants) * 1.6) + 32;
        add(stages[variant]![lod]!, `${species.id}:v${variant}:lod${lod}`, slots);
      }
    }
    add(stages[0]![LOD_IMPOSTER]!, `${species.id}:imposter`, capacity[LOD_IMPOSTER]!);

    this.meshes = meshes;
  }

  /** Eimer-Index aus Stufe und Variante. */
  #bucket(lod: number, variant: number): number {
    if (lod >= LOD_IMPOSTER) return this.#variants * LOD_IMPOSTER;
    const v = variant < this.#variants ? variant : this.#variants - 1;
    return v * LOD_IMPOSTER + lod;
  }

  /** Zwischenpuffer leeren — Beginn eines neuen Durchlaufs. */
  beginPass(): void {
    this.#counts.fill(0);
    this.#dropped = 0;
  }

  /**
   * Eine Instanz in den Zwischenpuffer schreiben.
   *
   * Die Matrix wird von Hand gesetzt statt über `Matrix4.compose()`. Der Grund
   * ist Stückzahl: bei 50 000 Instanzen und einem Umbau alle dreizehn Frames
   * sind das tausende Aufrufe je Frame, und `compose` geht den Umweg über ein
   * Quaternion für eine Drehung, die ausschließlich um Y geht. Sinus und
   * Kosinus reichen.
   *
   * `lean` ist der **Tangens** des Neigungswinkels und wird als Scherung in die
   * Y-Spalte geschrieben: ein Punkt auf Höhe h wandert um `lean · h` zur Seite.
   * Der Fuß bleibt stehen, die Krone kippt — genau andersherum als bei einer
   * Drehung, die den ganzen Baum aus dem Boden hebeln würde.
   */
  push(
    lod: number,
    variant: number,
    x: number,
    y: number,
    z: number,
    scaleXZ: number,
    scaleY: number,
    rotation: number,
    lean: number,
  ): void {
    const bucket = this.#bucket(lod, variant);
    const at = this.#counts[bucket]!;
    if (at >= this.#capacity[bucket]!) {
      this.#dropped++;
      return;
    }
    const m = this.#scratch[bucket]!;
    const i = at * 16;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    // Der Imposter bekommt **keine** Scherung: sein Shader liest die
    // Skalierungen als Spaltenlängen zurück, und eine gescherte Y-Spalte wäre
    // länger als der Maßstab. Ein Quad zu neigen brächte ohnehin nichts — es
    // dreht sich zur Kamera.
    const shear = lod >= LOD_IMPOSTER ? 0 : lean;

    m[i] = cos * scaleXZ;
    m[i + 1] = 0;
    m[i + 2] = -sin * scaleXZ;
    m[i + 3] = 0;
    m[i + 4] = cos * shear * scaleY;
    m[i + 5] = scaleY;
    m[i + 6] = sin * shear * scaleY;
    m[i + 7] = 0;
    m[i + 8] = sin * scaleXZ;
    m[i + 9] = 0;
    m[i + 10] = cos * scaleXZ;
    m[i + 11] = 0;
    m[i + 12] = x;
    m[i + 13] = y;
    m[i + 14] = z;
    m[i + 15] = 1;

    this.#counts[bucket] = at + 1;
  }

  /** Durchlauf abschließen: Zwischenpuffer sichtbar machen. */
  endPass(): void {
    for (let bucket = 0; bucket < this.meshes.length; bucket++) {
      const mesh = this.meshes[bucket]!;
      const count = this.#counts[bucket]!;
      // Nur der belegte Teil wird kopiert. Bei einer Kamera in der Stadt sind
      // die Fernpuffer der Bäume fast leer, und den ganzen Puffer zu kopieren
      // wäre die teuerste Zeile in einem System, das sonst nichts tut.
      mesh.instanceMatrix.array.set(this.#scratch[bucket]!.subarray(0, count * 16));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = count;
    }
  }

  /** Instanzen, die nicht mehr in den Puffer passten. Muss null bleiben. */
  get dropped(): number {
    return this.#dropped;
  }

  get visible(): number {
    let total = 0;
    for (const mesh of this.meshes) total += mesh.count;
    return total;
  }

  /** Sichtbare Instanzen auf einer Stufe — für die Debug-Anzeige. */
  visibleOnStage(lod: number): number {
    if (lod >= LOD_IMPOSTER) return this.meshes[this.#variants * LOD_IMPOSTER]!.count;
    let total = 0;
    for (let variant = 0; variant < this.#variants; variant++) {
      total += this.meshes[variant * LOD_IMPOSTER + lod]!.count;
    }
    return total;
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
  }
}
