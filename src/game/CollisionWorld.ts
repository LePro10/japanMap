import { WORLD } from '@/config/world.config';

/**
 * Die statischen Hindernisse der Karte als abfragbare Struktur — PLAN.md P14.
 *
 * ## Warum analytische Körper und nicht `three-mesh-bvh`
 *
 * Der Plan aus P9 nennt `three-mesh-bvh` als „Kollisionsgrundlage"; die
 * Bibliothek liegt seit P8 installiert und unbenutzt im Projekt. Sie wird hier
 * **nicht** benutzt, und der Grund ist nicht Bequemlichkeit:
 *
 *  - Die Hindernisse dieser Karte sind ihrer Form nach schon einfach. Gebäude
 *    sind **achsparallele Rechtecke** — `CityGenerator` erzeugt sie als `Rect`
 *    und extrudiert sie erst danach. Leitplanken sind **Polygonzüge**. Props
 *    sind rund. Für jede dieser Formen gibt es eine geschlossene Lösung mit
 *    einer Handvoll Rechenschritten.
 *  - Ein BVH-Test läuft gegen **Dreiecke** und beantwortet damit eine Frage, die
 *    hier niemand stellt: er sagt, welches Dreieck getroffen wurde, nicht wie
 *    weit man aus dem Körper heraus muss. Für die Auflösung („schiebe das Auto
 *    heraus und nimm ihm die Geschwindigkeit senkrecht zur Wand") braucht man
 *    die **Distanzfunktion**, und die ist bei einem Dreiecksnetz teurer als bei
 *    einem Rechteck.
 *  - Die Stadt hat 3 Draw-Calls für alle Blöcke, weil die Gebäude eines Blocks zu
 *    **einer** Geometrie zusammengeführt sind. Ein BVH darauf hätte keine
 *    Objektgrenzen mehr; ein Auto, das in einen Innenhof gerät, wäre nicht mehr
 *    von einem in einer Wand steckenden zu unterscheiden.
 *
 * Was die Entscheidung kostet, steht ebenfalls hier: schräge Wände gibt es nicht
 * (die Karte hat keine), und ein Prop ist ein Zylinder statt seiner Silhouette
 * (Begründung bei `PROP_COLLIDERS`). Sollte je eine Form dazukommen, die sich so
 * nicht abbilden lässt — ein Tunnel, eine Brücke mit Unterführung —, ist das der
 * Punkt, an dem der BVH-Weg fällig wird.
 *
 * ## Aufbau
 *
 * Ein **Gleichverteilungsgitter**, dasselbe Muster wie in `RoadNetwork` und
 * `PropClearance`, und aus demselben Grund: die Abfrage läuft im festen
 * Zeitschritt und darf nichts anlegen. Die Zellenweite ist 24 m — grob genug,
 * dass die 630 Props und rund 900 Gebäudekörper in wenige Tausend Einträge
 * fallen, fein genug, dass eine Abfrage höchstens ein paar Dutzend Körper sieht.
 *
 * Alle Körper stehen in **flachen Zahlenfeldern** und nicht in Objekten. Die
 * Abfrage berührt bei 60 Hz je Rad und Karosserie-Punkt einige Zellen; mit
 * Objekten wären das ein paar Tausend Zeigerverfolgungen je Sekunde für Daten,
 * die in vier Zahlen passen.
 */

/** Kantenlänge einer Gitterzelle in Metern. */
const CELL = 24;

// Körpertypen. Zahlen und **kein `enum`**: der Bestand kommt ohne eines aus, und
// ein `const enum` verhält sich unter esbuild anders als unter `tsc`
// (`isolatedModules` ist an). Die Bedeutung der Formparameter steht daneben.
/** Achsparalleler Kasten: minX, maxX, minZ, maxZ. */
const KIND_BOX = 0;
/** Kreiszylinder: x, z, radius. */
const KIND_CYLINDER = 1;
/** Wandstück: von (ax,az) nach (bx,bz), mit halber Dicke. */
const KIND_WALL = 2;

/**
 * Ergebnis einer Abfrage.
 *
 * Ein wiederverwendetes Objekt und kein neues je Aufruf — dieselbe Regel wie bei
 * `TerrainSampler.getHeightAt`. Wer das Ergebnis behalten will, kopiert die
 * Zahlen heraus.
 */
export interface Pushout {
  /** Wie weit der Punkt im Körper steckt, in Metern. 0 = kein Kontakt. */
  depth: number;
  /** Normale, aus dem Körper heraus, normiert, XZ-Ebene. */
  nx: number;
  nz: number;
}

/** Ein flaches Feld mit vier Zahlen je Körper plus Höhenband. */
interface Shapes {
  /** Typ je Körper. */
  readonly kind: number[];
  /** Vier Formparameter je Körper, Bedeutung nach `Kind`. */
  readonly p: number[];
  /** Unter- und Oberkante in Weltkoordinaten je Körper. */
  readonly y0: number[];
  readonly y1: number[];
}

export class CollisionWorld {
  readonly #shapes: Shapes = { kind: [], p: [], y0: [], y1: [] };
  /** Ein Feld von Körperindizes je Zelle, `undefined` für leere Zellen. */
  readonly #cells: (number[] | undefined)[];
  readonly #columns: number;
  readonly #rows: number;

  /**
   * Erhöhte Flächen, auf denen man **fährt** statt anzustoßen — Bürgersteige.
   *
   * Getrennt von den Hindernissen, weil sie eine andere Frage beantworten: nicht
   * „wo darf das Auto nicht hin", sondern „wie hoch liegt hier der Boden". Ein
   * Bordstein von 14 cm als Wand wäre eine unsichtbare Mauer quer durch die
   * Stadt; als Plateau ist er eine Kante, über die man mit einem Ruck fährt.
   */
  readonly #plateaus: { minX: number; maxX: number; minZ: number; maxZ: number; top: number }[] =
    [];
  /** Dasselbe Raster für die Plateaus. */
  readonly #plateauCells: (number[] | undefined)[];

  readonly #hit: Pushout = { depth: 0, nx: 0, nz: 0 };

  #shapeCount = 0;

  constructor() {
    this.#columns = Math.ceil(WORLD.size / CELL) + 2;
    this.#rows = this.#columns;
    this.#cells = new Array<number[] | undefined>(this.#columns * this.#rows);
    this.#plateauCells = new Array<number[] | undefined>(this.#columns * this.#rows);
  }

  get count(): number {
    return this.#shapeCount;
  }

  get plateauCount(): number {
    return this.#plateaus.length;
  }

  /** Alles wieder leeren — beim Entladen und für Messläufe. */
  clear(): void {
    this.#shapes.kind.length = 0;
    this.#shapes.p.length = 0;
    this.#shapes.y0.length = 0;
    this.#shapes.y1.length = 0;
    this.#cells.fill(undefined);
    this.#plateauCells.fill(undefined);
    this.#plateaus.length = 0;
    this.#shapeCount = 0;
  }

  // ── Eintragen ──────────────────────────────────────────────────────────

  /** Achsparalleler Kasten — Gebäude, Mauerkörper. */
  addBox(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    y0: number,
    y1: number,
  ): void {
    this.#push(KIND_BOX, minX, maxX, minZ, maxZ, y0, y1, minX, maxX, minZ, maxZ);
  }

  /** Kreiszylinder — Props, Pfosten. */
  addCylinder(x: number, z: number, radius: number, y0: number, y1: number): void {
    this.#push(KIND_CYLINDER, x, z, radius, 0, y0, y1, x - radius, x + radius, z - radius, z + radius);
  }

  /**
   * Wandstück zwischen zwei Punkten — ein Leitplankenabschnitt.
   *
   * `halfThickness` ist die halbe Wandstärke; das Band einer W-Planke ist rund
   * 8 cm dick, der Wert ist aber vor allem ein Sicherheitsabstand: ein Auto, das
   * bei 60 Hz mit 50 m/s fährt, legt 83 cm je Schritt zurück, und eine
   * unendlich dünne Wand ist keine Wand, sondern ein Vorschlag.
   */
  addWall(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    halfThickness: number,
    y0: number,
    y1: number,
  ): void {
    const minX = Math.min(ax, bx) - halfThickness;
    const maxX = Math.max(ax, bx) + halfThickness;
    const minZ = Math.min(az, bz) - halfThickness;
    const maxZ = Math.max(az, bz) + halfThickness;
    this.#push(KIND_WALL, ax, az, bx, bz, y0, y1, minX, maxX, minZ, maxZ, halfThickness);
  }

  /**
   * Erhöhte, befahrbare Fläche — Bürgersteig, Podest.
   *
   * `top` ist die Weltkoordinate der Oberkante. Die Fläche wirkt nur nach oben:
   * unter ihr gibt es keinen Boden (und braucht es keinen — es fährt niemand
   * unter einem Bürgersteig).
   */
  addPlateau(minX: number, maxX: number, minZ: number, maxZ: number, top: number): void {
    const index = this.#plateaus.length;
    this.#plateaus.push({ minX, maxX, minZ, maxZ, top });
    this.#insert(this.#plateauCells, index, minX, maxX, minZ, maxZ);
  }

  #push(
    kind: number,
    p0: number,
    p1: number,
    p2: number,
    p3: number,
    y0: number,
    y1: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    extra = 0,
  ): void {
    const index = this.#shapeCount++;
    this.#shapes.kind.push(kind);
    // Fünf Werte je Körper: die vier Formparameter plus die Zusatzzahl, die
    // heute nur die Wandstärke ist. Ein festes Vielfaches, damit der Index eine
    // Multiplikation bleibt und keine Suche.
    this.#shapes.p.push(p0, p1, p2, p3, extra);
    this.#shapes.y0.push(y0);
    this.#shapes.y1.push(y1);
    this.#insert(this.#cells, index, minX, maxX, minZ, maxZ);
  }

  /**
   * Einen Index in **jede** Zelle legen, die die Hülle berührt.
   *
   * Nicht nur in die des Mittelpunkts: ein 8 m breites Haus auf einer
   * Zellgrenze wäre sonst von der Nachbarzelle aus unsichtbar, und das Auto
   * fände die Wand erst, wenn es halb drin steht. Dieselbe Falle steht bei
   * `PropClearance.add()`.
   */
  #insert(
    cells: (number[] | undefined)[],
    index: number,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
  ): void {
    const x0 = Math.max(0, Math.floor((minX + WORLD.half) / CELL));
    const x1 = Math.min(this.#columns - 1, Math.floor((maxX + WORLD.half) / CELL));
    const z0 = Math.max(0, Math.floor((minZ + WORLD.half) / CELL));
    const z1 = Math.min(this.#rows - 1, Math.floor((maxZ + WORLD.half) / CELL));

    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const key = cz * this.#columns + cx;
        let list = cells[key];
        if (list === undefined) {
          list = [];
          cells[key] = list;
        }
        list.push(index);
      }
    }
  }

  // ── Abfragen ───────────────────────────────────────────────────────────

  /**
   * Steckt ein Punkt (mit Radius) in einem Hindernis?
   *
   * Liefert das **tiefste** Eindringen von allen berührten Körpern, nicht deren
   * Summe. Eine Summe wäre bei einer Innenecke (zwei Wände) doppelt so groß wie
   * nötig und schoss das Auto aus der Ecke heraus; der tiefste Kontakt allein
   * genügt, weil der nächste Schritt den zweiten ohnehin wieder findet.
   *
   * Das zurückgegebene Objekt ist **dasselbe bei jedem Aufruf**. Wer es behalten
   * will, kopiert die Zahlen.
   */
  query(x: number, y: number, z: number, radius: number): Pushout {
    const hit = this.#hit;
    hit.depth = 0;
    hit.nx = 0;
    hit.nz = 0;

    const cx = Math.floor((x + WORLD.half) / CELL);
    const cz = Math.floor((z + WORLD.half) / CELL);
    // Ein Ring reicht: der Radius eines Abfragepunkts ist unter einem Meter, die
    // Zelle 24 m — ein Körper, der den Punkt berührt, liegt zwingend in der
    // eigenen oder einer angrenzenden Zelle, und dort steht er auch drin (siehe
    // `#insert`).
    const kinds = this.#shapes.kind;
    const p = this.#shapes.p;
    const y0s = this.#shapes.y0;
    const y1s = this.#shapes.y1;

    for (let dz = -1; dz <= 1; dz++) {
      const zz = cz + dz;
      if (zz < 0 || zz >= this.#rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= this.#columns) continue;
        const list = this.#cells[zz * this.#columns + xx];
        if (list === undefined) continue;

        for (let i = 0; i < list.length; i++) {
          const s = list[i]!;
          // Höhenband zuerst: es verwirft die meisten Kandidaten mit zwei
          // Vergleichen, bevor irgendeine Wurzel gerechnet wird.
          if (y > y1s[s]! || y < y0s[s]!) continue;

          const base = s * 5;
          let dirX = 0;
          let dirZ = 0;
          let distance = 0;

          switch (kinds[s]!) {
            case KIND_BOX: {
              const minX = p[base]!;
              const maxX = p[base + 1]!;
              const minZ = p[base + 2]!;
              const maxZ = p[base + 3]!;
              // Abstand zum Rechteck über den nächstgelegenen Punkt. Innerhalb
              // des Rechtecks ist der Abstand negativ, und die Richtung zeigt
              // zur **nächsten Seitenfläche** — sonst schöbe ein Punkt in der
              // Mitte des Hauses in eine beliebige Richtung heraus.
              const qx = x < minX ? minX : x > maxX ? maxX : x;
              const qz = z < minZ ? minZ : z > maxZ ? maxZ : z;
              if (qx !== x || qz !== z) {
                dirX = x - qx;
                dirZ = z - qz;
                distance = Math.hypot(dirX, dirZ);
                if (distance >= radius || distance < 1e-9) continue;
                dirX /= distance;
                dirZ /= distance;
              } else {
                // Punkt liegt innen: kürzester Weg zu einer der vier Seiten.
                const toMinX = x - minX;
                const toMaxX = maxX - x;
                const toMinZ = z - minZ;
                const toMaxZ = maxZ - z;
                let best = toMinX;
                dirX = -1;
                dirZ = 0;
                if (toMaxX < best) {
                  best = toMaxX;
                  dirX = 1;
                  dirZ = 0;
                }
                if (toMinZ < best) {
                  best = toMinZ;
                  dirX = 0;
                  dirZ = -1;
                }
                if (toMaxZ < best) {
                  best = toMaxZ;
                  dirX = 0;
                  dirZ = 1;
                }
                distance = -best;
              }
              break;
            }

            case KIND_CYLINDER: {
              const px = p[base]!;
              const pz = p[base + 1]!;
              const r = p[base + 2]!;
              dirX = x - px;
              dirZ = z - pz;
              const length = Math.hypot(dirX, dirZ);
              distance = length - r;
              if (distance >= radius) continue;
              if (length < 1e-9) {
                // Genau im Mittelpunkt: irgendeine Richtung ist so gut wie jede
                // andere, aber sie muss endlich sein — ein NaN hier steckt die
                // ganze Fahrzeuglage an.
                dirX = 1;
                dirZ = 0;
              } else {
                dirX /= length;
                dirZ /= length;
              }
              break;
            }

            default: {
              const ax = p[base]!;
              const az = p[base + 1]!;
              const bx = p[base + 2]!;
              const bz = p[base + 3]!;
              const half = p[base + 4]!;
              const ex = bx - ax;
              const ez = bz - az;
              const lengthSq = ex * ex + ez * ez;
              if (lengthSq < 1e-9) continue;
              let t = ((x - ax) * ex + (z - az) * ez) / lengthSq;
              t = t < 0 ? 0 : t > 1 ? 1 : t;
              dirX = x - (ax + ex * t);
              dirZ = z - (az + ez * t);
              const length = Math.hypot(dirX, dirZ);
              distance = length - half;
              if (distance >= radius) continue;
              if (length < 1e-9) {
                // Auf der Wandachse: senkrecht zu ihr heraus.
                const inv = 1 / Math.sqrt(lengthSq);
                dirX = -ez * inv;
                dirZ = ex * inv;
              } else {
                dirX /= length;
                dirZ /= length;
              }
              break;
            }
          }

          const depth = radius - distance;
          if (depth > hit.depth) {
            hit.depth = depth;
            hit.nx = dirX;
            hit.nz = dirZ;
          }
        }
      }
    }

    return hit;
  }

  /**
   * Oberkante des höchsten Plateaus an dieser Stelle, oder `-Infinity`.
   *
   * Der Aufrufer bildet daraus das Maximum mit der Geländehöhe. Getrennt
   * gehalten, weil das Gelände aus dem `TerrainSampler` kommt und diese Klasse
   * ihn nicht kennen muss.
   */
  plateauTop(x: number, z: number): number {
    const cx = Math.floor((x + WORLD.half) / CELL);
    const cz = Math.floor((z + WORLD.half) / CELL);
    if (cx < 0 || cx >= this.#columns || cz < 0 || cz >= this.#rows) return -Infinity;
    const list = this.#plateauCells[cz * this.#columns + cx];
    if (list === undefined) return -Infinity;

    let top = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const r = this.#plateaus[list[i]!]!;
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      if (r.top > top) top = r.top;
    }
    return top;
  }
}
