import { WORLD } from '@/config/world.config';

/** Ein Freihaltekreis: Mittelpunkt und Radius in Metern. */
interface ClearanceCircle {
  readonly x: number;
  readonly z: number;
  readonly radiusSq: number;
}

/** Kantenlänge einer Zelle des Suchrasters, in Metern. */
const CELL = 48;

/**
 * Freiflächen um Props — die Ergänzung zu `roadClearance` aus P4.
 *
 * **Warum es das braucht, in einem Bild:** die Tempelanlage stand nach ihrer
 * ersten Platzierung mitten im Wald. Bäume wuchsen durch die Halle, durch die
 * Torii und zwischen den Laternen hindurch — die Streuung aus P4 kennt Straßen
 * und Zonen, aber keine Gebäude. Ein Tempel im Dickicht ist nicht „naturnah",
 * sondern schlicht nicht zu sehen, und die Abnahmezeile „jede Zone ist im
 * Vorbeifliegen ohne Karte identifizierbar" fällt damit.
 *
 * Die Abfrage sitzt im heißesten Pfad des Projekts: `scatterChunk` prüft sie
 * für jeden Kandidaten, und davon gibt es bei Gras rund 6700 je Chunk. Deshalb
 * ein **Raster** und keine Liste — geprüft werden nur die Kreise der eigenen
 * und der acht Nachbarzellen. Bei 48 m Zellenweite und dem größten Radius von
 * 18 m kann kein Kreis eine Zelle überspringen, die er berührt.
 *
 * > **Nicht jedes Prop hält frei.** Tetrapoden liegen zu Hunderten am Strand,
 * > wo ohnehin nichts wächst, und Streckenmarkierungen stehen im
 * > Straßenkorridor, den `roadClearance` schon räumt. Beide bekommen Radius 0
 * > und stehen gar nicht erst im Raster — sonst wären es 630 Kreise statt 152.
 */
export class PropClearance {
  readonly #cells = new Map<number, ClearanceCircle[]>();
  readonly #columns: number;
  #count = 0;

  /**
   * Alle Kreise als `x, z, radius` — für den Streu-Worker (P7 / 7.2).
   *
   * Das Raster selbst lässt sich nicht verschicken: eine `Map` mit geteilten
   * Objekten in mehreren Zellen käme als Kopie mit **vervielfachten** Kreisen
   * an. Die Rohliste ist die kleinere und ehrlichere Übertragung; der Worker
   * baut das Raster mit demselben `add()` wieder auf und hat damit garantiert
   * dieselbe Struktur.
   */
  get circles(): Float32Array {
    const seen = new Set<ClearanceCircle>();
    const out: number[] = [];
    for (const list of this.#cells.values()) {
      for (const circle of list) {
        if (seen.has(circle)) continue;
        seen.add(circle);
        out.push(circle.x, circle.z, Math.sqrt(circle.radiusSq));
      }
    }
    return new Float32Array(out);
  }

  constructor() {
    this.#columns = Math.ceil(WORLD.size / CELL) + 1;
  }

  #key(cx: number, cz: number): number {
    return cz * this.#columns + cx;
  }

  /**
   * Einen Kreis eintragen.
   *
   * Er landet in **jeder** Zelle, die er berührt, nicht nur in der seines
   * Mittelpunkts. Sonst fände die Abfrage einen Kreis nicht, dessen Mittelpunkt
   * zwei Zellen entfernt liegt und dessen Rand hereinragt — und das Ergebnis
   * wäre eine Freifläche, die an einer Zellgrenze aufhört.
   */
  add(x: number, z: number, radius: number): void {
    if (radius <= 0) return;
    const circle: ClearanceCircle = { x, z, radiusSq: radius * radius };
    const x0 = Math.floor((x - radius + WORLD.half) / CELL);
    const x1 = Math.floor((x + radius + WORLD.half) / CELL);
    const z0 = Math.floor((z - radius + WORLD.half) / CELL);
    const z1 = Math.floor((z + radius + WORLD.half) / CELL);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = this.#key(cx, cz);
        const list = this.#cells.get(key);
        if (list) list.push(circle);
        else this.#cells.set(key, [circle]);
      }
    }
    this.#count++;
  }

  /** Liegt die Stelle in einer Freifläche? */
  blocks(x: number, z: number): boolean {
    const cx = Math.floor((x + WORLD.half) / CELL);
    const cz = Math.floor((z + WORLD.half) / CELL);
    const list = this.#cells.get(this.#key(cx, cz));
    if (!list) return false;
    for (const circle of list) {
      const dx = circle.x - x;
      const dz = circle.z - z;
      if (dx * dx + dz * dz < circle.radiusSq) return true;
    }
    return false;
  }

  /** Zahl der eingetragenen Kreise — für die Debug-Anzeige. */
  get count(): number {
    return this.#count;
  }
}
