import type { RoadData, RoadFile } from '@/config/roads.config';
import { ROAD_TYPES } from '@/config/roads.config';
import { WORLD } from '@/config/world.config';

/**
 * Abfragen auf dem Straßennetz — PLAN.md P3 / 3.6.
 *
 * Die wichtigste davon ist `distanceToNearestRoad()`: P4 ruft sie für **jede**
 * gestreute Pflanze auf, und bei hunderttausenden Instanzen entscheidet ihre
 * Laufzeit darüber, ob die Vegetation in Sekunden oder in Minuten steht. Naiv
 * über alle Mittellinienpunkte wären das 100 000 × 5 000 Vergleiche.
 *
 * Deshalb ein **Gleichverteilungsgitter**: die Welt wird in Zellen von 64 m
 * geteilt, jede Zelle merkt sich die Segmente, die sie berühren. Eine Abfrage
 * sieht dann nur die Zelle und ihre Nachbarn an. Kein Quadtree: die Straßen
 * sind über die Karte verteilt und nicht geklumpt, und ein Gitter hat keine
 * Baumtiefe, die man pro Abfrage durchlaufen müsste.
 */

/** Kantenlänge einer Gitterzelle in Metern. */
const CELL_SIZE = 64;

export interface RoadHit {
  readonly roadId: string;
  /** Weltposition des nächsten Punkts auf der Mittellinie. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Bogenlänge dieses Punkts, in Metern. */
  readonly distanceAlong: number;
  /** Abstand des Abfragepunkts zur Mittellinie, in Metern (XZ). */
  readonly distance: number;
  /** Fahrbahnbreite an dieser Stelle. */
  readonly width: number;
}

interface Segment {
  readonly road: RoadData;
  /** Index des ersten Punkts des Segments. */
  readonly index: number;
}

export class RoadNetwork {
  readonly roads: readonly RoadData[];

  /**
   * Flaches Array statt `Map`, ein Eintrag je Zelle.
   *
   * Gemessen: mit einer `Map` brauchten 100 000 Abfragen **207 ms** gegen ein
   * Budget von 50 ms. Der Grund ist die Verteilung — 94 % der Punkte liegen
   * weitab vom Netz, und für die besteht die Arbeit fast nur aus 25 Zugriffen
   * auf leere Zellen. Ein Zugriff auf `Map` mit Zahlenschlüssel kostet rund
   * 50 ns, ein Array-Index unter 2 ns. Bei 2,5 Mio. Zugriffen ist das der
   * Unterschied zwischen „geht" und „geht nicht".
   *
   * Das Gitter ist winzig: 50 × 50 Zellen bei 64 m Kantenlänge.
   */
  readonly #cells: (Segment[] | undefined)[];
  readonly #columns: number;
  readonly #rows: number;
  #maxHalfWidth = 0;

  constructor(file: RoadFile) {
    this.roads = file.roads;
    this.#columns = Math.ceil(WORLD.size / CELL_SIZE) + 2;
    this.#rows = this.#columns;
    this.#cells = new Array<Segment[] | undefined>(this.#columns * this.#rows);

    for (const road of file.roads) {
      const settings = ROAD_TYPES[road.type];
      this.#maxHalfWidth = Math.max(
        this.#maxHalfWidth,
        settings.width / 2 + settings.shoulder,
      );
      this.#indexRoad(road);
    }
  }

  get segmentCount(): number {
    let total = 0;
    for (const list of this.#cells) total += list ? list.length : 0;
    return total;
  }

  /**
   * Abstand zur nächsten Straßenmitte in der XZ-Ebene.
   *
   * Gibt `Infinity` zurück, wenn im Suchradius nichts liegt — das ist der
   * Normalfall auf dem größten Teil der Karte und muss deshalb billig sein.
   *
   * **Allokationsfrei.** P4 ruft diese Methode für jede gestreute Pflanze auf;
   * ein Objekt je *geprüftem* Segment (nicht je Treffer) hieße bei 100 000
   * Abfragen einige Millionen kurzlebige Objekte. Deshalb rechnet die Suche
   * hier direkt mit Zahlen, und nur `closestPoint` baut am Ende ein Objekt.
   */
  distanceToNearestRoad(x: number, z: number, maxDistance = 120): number {
    const found = this.#search(x, z, maxDistance);
    return found < 0 ? Infinity : Math.sqrt(found);
  }

  /**
   * Nächster Punkt auf dem Netz — für das Zurücksetzen nach dem Verlassen der
   * Strecke und ab P4 für die Vegetationsmaske.
   */
  closestPoint(x: number, z: number, maxDistance = 120): RoadHit | null {
    const found = this.#search(x, z, maxDistance);
    if (found < 0 || this.#bestSegment === null) return null;

    const segment = this.#bestSegment;
    const road = segment.road;
    const line = road.centerline;
    const count = line.length / 3;
    const j = road.closed ? (segment.index + 1) % count : segment.index + 1;
    const t = this.#bestT;

    const ay = line[segment.index * 3 + 1]!;
    const by = line[j * 3 + 1]!;
    const spacing = road.length / (road.closed ? count : count - 1);

    return {
      roadId: road.id,
      x: this.#bestX,
      y: ay + (by - ay) * t,
      z: this.#bestZ,
      distanceAlong: (segment.index + t) * spacing,
      distance: Math.sqrt(found),
      width: road.widths[segment.index] ?? ROAD_TYPES[road.type].width,
    };
  }

  // Ergebnis der letzten Suche. Kein hübsches Muster, aber der Preis dafür,
  // dass der heiße Pfad nichts anlegt.
  #bestSegment: Segment | null = null;
  #bestT = 0;
  #bestX = 0;
  #bestZ = 0;

  /**
   * Kern der Suche. Gibt das **Quadrat** des Abstands zurück, oder −1.
   *
   * Quadriert, weil die Wurzel nur einmal am Ende gebraucht wird und im
   * inneren Vergleich nichts beiträgt.
   */
  #search(x: number, z: number, maxDistance: number): number {
    const rings = Math.max(1, Math.ceil(maxDistance / CELL_SIZE));
    const cellX = Math.floor((x + WORLD.half) / CELL_SIZE);
    const cellZ = Math.floor((z + WORLD.half) / CELL_SIZE);

    this.#bestSegment = null;
    let bestSquared = maxDistance * maxDistance;
    let found = false;

    for (let ring = 0; ring <= rings; ring++) {
      // Sobald ein Treffer näher liegt als der innere Rand des nächsten Rings,
      // kann dort nichts Besseres mehr kommen.
      if (found && bestSquared <= ((ring - 1) * CELL_SIZE) ** 2) break;

      for (let dz = -ring; dz <= ring; dz++) {
        const cz = cellZ + dz;
        if (cz < 0 || cz >= this.#rows) continue;

        for (let dx = -ring; dx <= ring; dx++) {
          // Nur der Rand des Rings; das Innere wurde bereits geprüft.
          if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
          const cx = cellX + dx;
          if (cx < 0 || cx >= this.#columns) continue;

          const segments = this.#cells[cz * this.#columns + cx];
          if (segments === undefined) continue;

          for (let s = 0; s < segments.length; s++) {
            const segment = segments[s]!;
            const line = segment.road.centerline;
            const count = line.length / 3;
            const i = segment.index;
            const j = segment.road.closed ? (i + 1) % count : i + 1;

            const ax = line[i * 3]!;
            const az = line[i * 3 + 2]!;
            const ddx = line[j * 3]! - ax;
            const ddz = line[j * 3 + 2]! - az;
            const lengthSquared = ddx * ddx + ddz * ddz;
            if (lengthSquared < 1e-8) continue;

            let t = ((x - ax) * ddx + (z - az) * ddz) / lengthSquared;
            t = t < 0 ? 0 : t > 1 ? 1 : t;

            const px = ax + ddx * t;
            const pz = az + ddz * t;
            const squared = (x - px) * (x - px) + (z - pz) * (z - pz);

            if (squared < bestSquared) {
              bestSquared = squared;
              this.#bestSegment = segment;
              this.#bestT = t;
              this.#bestX = px;
              this.#bestZ = pz;
              found = true;
            }
          }
        }
      }
    }

    return found ? bestSquared : -1;
  }

  /** Liegt der Punkt auf der Fahrbahn (inklusive Bankett)? */
  isOnRoad(x: number, z: number): boolean {
    const hit = this.closestPoint(x, z, this.#maxHalfWidth + 2);
    return hit !== null && hit.distance <= hit.width / 2;
  }

  /**
   * Ideallinie einer Strecke. In P3 die Mittellinie — der Plan sagt das
   * ausdrücklich; eine echte Linienoptimierung gehört zum Fahrmodell und nicht
   * zur Streckengeometrie.
   */
  getRacingLine(roadId: string): Float32Array | null {
    const road = this.roads.find((r) => r.id === roadId);
    return road ? Float32Array.from(road.centerline) : null;
  }

  /** Startpunkte aus getaggten Strecken — Position plus Blickrichtung. */
  getSpawnPoints(): { position: [number, number, number]; heading: number }[] {
    const spawns: { position: [number, number, number]; heading: number }[] = [];

    for (const road of this.roads) {
      if (!road.tags.includes('startlinie')) continue;
      const line = road.centerline;
      const count = line.length / 3;
      // Vier Startplätze gleichmäßig über die Runde verteilt.
      for (let k = 0; k < 4; k++) {
        const i = Math.floor((count * k) / 4);
        const j = (i + 1) % count;
        spawns.push({
          position: [line[i * 3]!, line[i * 3 + 1]!, line[i * 3 + 2]!],
          heading: Math.atan2(line[j * 3]! - line[i * 3]!, line[j * 3 + 2]! - line[i * 3 + 2]!),
        });
      }
    }

    return spawns;
  }

  // ── Intern ─────────────────────────────────────────────────────────────

  #key(cellX: number, cellZ: number): number {
    return cellZ * this.#columns + cellX;
  }

  #indexRoad(road: RoadData): void {
    const line = road.centerline;
    const count = line.length / 3;
    const last = road.closed ? count : count - 1;
    const settings = ROAD_TYPES[road.type];
    const reach = settings.width / 2 + settings.shoulder;

    for (let i = 0; i < last; i++) {
      const j = road.closed ? (i + 1) % count : i + 1;
      const ax = line[i * 3]!;
      const az = line[i * 3 + 2]!;
      const bx = line[j * 3]!;
      const bz = line[j * 3 + 2]!;

      // Jede Zelle, die die Hülle des Segments berührt. Die Segmente sind 2 m
      // lang, betreffen also fast immer genau eine Zelle — der Aufwand hier ist
      // die Ausnahme wert, dass eines eine Zellgrenze kreuzt.
      const minX = Math.floor((Math.min(ax, bx) - reach + WORLD.half) / CELL_SIZE);
      const maxX = Math.floor((Math.max(ax, bx) + reach + WORLD.half) / CELL_SIZE);
      const minZ = Math.floor((Math.min(az, bz) - reach + WORLD.half) / CELL_SIZE);
      const maxZ = Math.floor((Math.max(az, bz) + reach + WORLD.half) / CELL_SIZE);

      for (let cz = minZ; cz <= maxZ; cz++) {
        for (let cx = minX; cx <= maxX; cx++) {
          if (cx < 0 || cx >= this.#columns || cz < 0 || cz >= this.#rows) continue;
          const key = this.#key(cx, cz);
          let list = this.#cells[key];
          if (list === undefined) {
            list = [];
            this.#cells[key] = list;
          }
          list.push({ road, index: i });
        }
      }
    }
  }
}
