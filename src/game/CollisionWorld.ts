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
  /**
   * Index des Körpers, oder der Baum-Schlüssel bei `source === HIT_TREE`.
   * −1, wenn nichts getroffen wurde.
   */
  id: number;
  /** 0 = statischer Körper, 1 = Baum aus der Nahabfrage. */
  source: number;
  breakable: boolean;
}

/** `Pushout.source`: statischer Eintrag in `#shapes`. */
export const HIT_STATIC = 0;
/** `Pushout.source`: dynamischer Zylinder (Baum). */
export const HIT_TREE = 1;

/**
 * Ein Kontakt zwischen der **Karosserie als Ganzes** und einem Hindernis — P19.
 *
 * ## Warum das die Punktabfrage ablöst
 *
 * Bis P19 prüfte `Vehicle` an **vier Ecken × zwei Höhen** mit je einem Radius
 * von 34 cm. Das ist eine Karosserie, die an den Ecken dick ist und an den
 * Seiten aus nichts besteht: zwischen Vorder- und Hinterecke liegen beim Coupé
 * **4,2 m**, und alles, was dort hineinpasst, wird nicht gesehen.
 *
 * Gemessen mit `tools/bench/world.mts`, Stamm mit 40 cm Radius auf der
 * Fahrlinie:
 *
 * | Seitlicher Versatz | Kontakte in 15 s | Ergebnis |
 * |---:|---:|---|
 * | 0,00 m (Mittellinie) | **0** | **durchgefahren** |
 * | 0,50 m | 2 | 12 m **rückwärts** geschleudert |
 * | 0,90 m (Ecke) | 4 | vorbei |
 *
 * Die erste Zeile ist der Fehler aus dem Bild: ein Baum, der genau vor der
 * Motorhaube steht, liegt *im* Auto und berührt keinen einzigen Prüfpunkt. Die
 * zweite ist der zweite Fehler: streift eine Ecke den Stamm doch, löst der alte
 * Weg über den **Mittelwert** der Normalen so schlecht auf, dass der Wagen
 * zurückgeworfen wird.
 *
 * ## Was stattdessen gerechnet wird
 *
 * Die Karosserie ist ein **orientiertes Rechteck**, und für jede der drei
 * Hindernisformen dieser Karte gibt es dagegen eine geschlossene Lösung:
 *
 * | Hindernis | Test | Kosten |
 * |---|---|---|
 * | Zylinder (Baum, Prop) | nächster Punkt auf dem Rechteck ↔ Kreis | ~15 Flops |
 * | Kasten (Gebäude) | SAT über 4 Achsen | ~40 Flops |
 * | Wand (Planke) | dasselbe SAT — eine Wand *ist* ein Rechteck | ~40 Flops |
 *
 * Das ist **billiger** als vorher, nicht teurer: acht Punktabfragen gegen
 * dieselben Kandidaten kosten acht Distanzfunktionen, hier ist es eine. Gemessen
 * steht die Zahl im Kopf von `tools/bench/world.mts`.
 *
 * Geliefert wird nicht *ein* Kontakt, sondern eine Liste — eine Innenecke hat
 * zwei, und wer nur den tiefsten auflöst, schiebt in der nächsten Iteration in
 * den anderen hinein. Die Liste ist nach Tiefe absteigend sortiert.
 */
export interface BodyContact {
  /** Überdeckung längs der Normalen, in Metern. */
  depth: number;
  /** Normale, aus dem Hindernis heraus zum Fahrzeug, normiert, XZ. */
  nx: number;
  nz: number;
  /** Berührpunkt in Weltkoordinaten — für das Giermoment. */
  px: number;
  pz: number;
  id: number;
  source: number;
  breakable: boolean;
}

/**
 * Wie viele Kontakte je Schritt höchstens gemeldet werden.
 *
 * Acht: ein Rechteck kann an vier Seiten anliegen, und eine Innenecke aus zwei
 * Wänden plus zwei Bäumen ist die dichteste Lage, die diese Karte hergibt. Wer
 * mehr hat, steht im Dickicht — und dort entscheidet der tiefste Kontakt, nicht
 * der neunte.
 */
export const BODY_CONTACT_CAP = 8;

/** Ein wiederverwendbarer Puffer für `queryBody`. Allokationsfrei je Schritt. */
export function createBodyContacts(): BodyContact[] {
  return Array.from({ length: BODY_CONTACT_CAP }, () => ({
    depth: 0,
    nx: 0,
    nz: 0,
    px: 0,
    pz: 0,
    id: -1,
    source: HIT_STATIC,
    breakable: false,
  }));
}

// ── Formtests ──────────────────────────────────────────────────────────────
//
// Die Ergebnisse landen in modulweiten Zahlen statt in einem Objekt. Der Grund
// ist derselbe wie beim wiederverwendeten `Pushout`: diese Funktionen laufen im
// festen Zeitschritt gegen ein paar Dutzend Kandidaten, und ein neues Objekt je
// Kandidat wären ein paar Tausend kurzlebige Objekte je Sekunde.

let mDepth = 0;
let mNx = 0;
let mNz = 0;
let mPx = 0;
let mPz = 0;

/** Nächster Punkt auf einem orientierten Rechteck, in `cpX`/`cpZ`. */
let cpX = 0;
let cpZ = 0;

function closestOnBox(
  cx: number,
  cz: number,
  ux: number,
  uz: number,
  vx: number,
  vz: number,
  hu: number,
  hv: number,
  px: number,
  pz: number,
): void {
  const dx = px - cx;
  const dz = pz - cz;
  let lu = dx * ux + dz * uz;
  let lv = dx * vx + dz * vz;
  lu = lu < -hu ? -hu : lu > hu ? hu : lu;
  lv = lv < -hv ? -hv : lv > hv ? hv : lv;
  cpX = cx + lu * ux + lv * vx;
  cpZ = cz + lu * uz + lv * vz;
}

/**
 * Kreis gegen orientiertes Rechteck.
 *
 * Zwei Fälle, und der zweite ist der, den die Punktabfrage nie hatte: liegt der
 * Kreismittelpunkt **im** Rechteck, gibt es keinen nächsten Punkt auf dem Rand,
 * der eine Richtung hergäbe. Dann entscheidet die kürzeste der vier
 * Seitenüberdeckungen — genau wie beim Kasten in `query()`, nur im
 * Fahrzeugsystem statt in Weltachsen.
 */
function circleVsBody(
  px: number,
  pz: number,
  r: number,
  cx: number,
  cz: number,
  ux: number,
  uz: number,
  vx: number,
  vz: number,
  hl: number,
  hw: number,
): boolean {
  const dx = px - cx;
  const dz = pz - cz;
  const lu = dx * ux + dz * uz;
  const lv = dx * vx + dz * vz;
  const qu = lu < -hl ? -hl : lu > hl ? hl : lu;
  const qv = lv < -hw ? -hw : lv > hw ? hw : lv;
  const du = lu - qu;
  const dv = lv - qv;
  const d2 = du * du + dv * dv;

  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    if (d >= r) return false;
    mDepth = r - d;
    // `(du,dv)` zeigt vom Blech zum Stamm. Heraus muss das Blech in die
    // Gegenrichtung.
    const nu = -du / d;
    const nv = -dv / d;
    mNx = nu * ux + nv * vx;
    mNz = nu * uz + nv * vz;
    mPx = cx + qu * ux + qv * vx;
    mPz = cz + qu * uz + qv * vz;
    return true;
  }

  // Mittelpunkt im Rechteck. Der Wagen muss **weg** vom Stamm, also entgegen
  // dem Vorzeichen der lokalen Koordinate: steht der Stamm vorn (`lu > 0`),
  // geht es nach hinten heraus, und der Weg ist `hl + r − lu`.
  const overU = hl + r - Math.abs(lu);
  const overV = hw + r - Math.abs(lv);
  if (overU < overV) {
    mDepth = overU;
    const s = lu >= 0 ? -1 : 1;
    mNx = s * ux;
    mNz = s * uz;
  } else {
    mDepth = overV;
    const s = lv >= 0 ? -1 : 1;
    mNx = s * vx;
    mNz = s * vz;
  }
  mPx = px;
  mPz = pz;
  return true;
}

/**
 * Rechteck gegen Rechteck — Separating Axis Theorem über vier Achsen.
 *
 * In 2D genügen die vier Kantennormalen der beiden Rechtecke. Findet sich eine
 * Achse ohne Überdeckung, berühren sie sich nicht; sonst ist die Achse mit der
 * **kleinsten** Überdeckung die Richtung, in die man am billigsten
 * auseinanderkommt (Minimum Translation Vector).
 *
 * Ein Gebäude ist ein Rechteck mit den Achsen (1,0) und (0,1), ein
 * Leitplankenabschnitt eines mit der Achse längs des Bandes — derselbe Test für
 * beide, und deshalb steht er nur einmal da.
 */
function boxVsBody(
  bcx: number,
  bcz: number,
  bux: number,
  buz: number,
  bhl: number,
  bhw: number,
  cx: number,
  cz: number,
  ux: number,
  uz: number,
  vx: number,
  vz: number,
  hl: number,
  hw: number,
): boolean {
  const bvx = -buz;
  const bvz = bux;
  const dx = bcx - cx;
  const dz = bcz - cz;

  let best = Infinity;
  let bnx = 0;
  let bnz = 0;

  for (let axis = 0; axis < 4; axis++) {
    const lx = axis === 0 ? ux : axis === 1 ? vx : axis === 2 ? bux : bvx;
    const lz = axis === 0 ? uz : axis === 1 ? vz : axis === 2 ? buz : bvz;
    const centre = dx * lx + dz * lz;
    const ra = hl * Math.abs(ux * lx + uz * lz) + hw * Math.abs(vx * lx + vz * lz);
    const rb = bhl * Math.abs(bux * lx + buz * lz) + bhw * Math.abs(bvx * lx + bvz * lz);
    const overlap = ra + rb - Math.abs(centre);
    if (overlap <= 0) return false;
    if (overlap < best) {
      best = overlap;
      // Die Normale zeigt vom Hindernis zum Fahrzeug: liegt B in Richtung `+L`,
      // muss A nach `−L`.
      const s = centre > 0 ? -1 : 1;
      bnx = s * lx;
      bnz = s * lz;
    }
  }

  mDepth = best;
  mNx = bnx;
  mNz = bnz;
  // Berührpunkt in zwei Schritten: erst der Punkt auf dem Hindernis, der dem
  // Fahrzeugmittelpunkt am nächsten liegt, dann dessen Projektion auf das
  // Blech. Bei einer 40 m langen Planke ist ihr Mittelpunkt weit weg — ohne den
  // ersten Schritt läge der „Kontakt" dort und nicht neben dem Auto, und das
  // Giermoment hätte das falsche Vorzeichen.
  closestOnBox(bcx, bcz, bux, buz, bvx, bvz, bhl, bhw, cx, cz);
  closestOnBox(cx, cz, ux, uz, vx, vz, hl, hw, cpX, cpZ);
  mPx = cpX;
  mPz = cpZ;
  return true;
}

/** Höchstens so viele Bäume je Schritt — die Suche liefert die nächsten. */
const DYNAMIC_CAP = 48;

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

/**
 * Den zuletzt gerechneten Kontakt einsortieren — absteigend nach Tiefe.
 *
 * Einfügesortierung und keine Sortierung am Ende: bei acht Plätzen sind das im
 * Schnitt zwei Vergleiche, und eine `sort()`-Zeile legte je Schritt einen
 * Vergleichs-Callback und ein Zwischenfeld an.
 */
function insertContact(
  out: BodyContact[],
  n: number,
  cap: number,
  id: number,
  source: number,
  breakable: boolean,
): number {
  let at = n;
  while (at > 0 && out[at - 1]!.depth < mDepth) at--;
  if (at >= cap) return n;

  for (let k = Math.min(n, cap - 1); k > at; k--) {
    const dst = out[k]!;
    const src = out[k - 1]!;
    dst.depth = src.depth;
    dst.nx = src.nx;
    dst.nz = src.nz;
    dst.px = src.px;
    dst.pz = src.pz;
    dst.id = src.id;
    dst.source = src.source;
    dst.breakable = src.breakable;
  }

  const slot = out[at]!;
  slot.depth = mDepth;
  slot.nx = mNx;
  slot.nz = mNz;
  slot.px = mPx;
  slot.pz = mPz;
  slot.id = id;
  slot.source = source;
  slot.breakable = breakable;
  return n < cap ? n + 1 : cap;
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

  readonly #hit: Pushout = { depth: 0, nx: 0, nz: 0, id: -1, source: HIT_STATIC, breakable: false };

  #shapeCount = 0;
  readonly #alive: number[] = [];
  readonly #breakable: number[] = [];

  /**
   * Welcher Körper in **dieser** Abfrage schon behandelt wurde.
   *
   * Ein Gebäude von 40 m Kantenlänge steht in bis zu neun der Zellen, die eine
   * Abfrage abläuft (`#insert` legt es in jede, die seine Hülle berührt — das
   * muss es, siehe dort). Die alte Punktabfrage nahm das Maximum und kam damit
   * ohne diese Buchführung aus; `queryBody` sammelt eine **Liste**, und dort
   * stünde dasselbe Haus dann bis zu neunmal drin. Aufgelöst würde es dann
   * neunmal — ein Auto, das eine Hauswand berührt, flöge quer über die Straße.
   *
   * Ein Zählerstand statt eines `fill(0)` je Abfrage: bei 900 Gebäudekörpern
   * wäre das Leeren teurer als die Abfrage selbst.
   */
  #visited = new Int32Array(0);
  #visitTick = 0;

  /**
   * Bäume der Umgebung — jedes Simulationsschritt neu, nicht im Raster.
   *
   * 50 000 Kronen als Zylinder ins Gitter zu legen würde die Abfrage der
   * *Häuser* mitbezahlen. Ein Auto sieht in 12 m höchstens ein paar Dutzend
   * Stämme; die stehen hier, und `query` prüft sie nach den statischen
   * Körpern mit derselben Distanzfunktion.
   */
  #dynCount = 0;
  readonly #dynX = new Float32Array(DYNAMIC_CAP);
  readonly #dynZ = new Float32Array(DYNAMIC_CAP);
  readonly #dynR = new Float32Array(DYNAMIC_CAP);
  readonly #dynY0 = new Float32Array(DYNAMIC_CAP);
  readonly #dynY1 = new Float32Array(DYNAMIC_CAP);
  readonly #dynKey = new Uint32Array(DYNAMIC_CAP);
  readonly #dynAlive = new Uint8Array(DYNAMIC_CAP);

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
    this.#alive.length = 0;
    this.#breakable.length = 0;
    this.#dynCount = 0;
    // Die Indizes fangen wieder bei 0 an; ein stehen gebliebener Stempel wäre
    // sonst ein Körper, den die nächste Abfrage für schon behandelt hält.
    this.#visited.fill(0);
    this.#visitTick = 0;
  }

  /** Neue Runde Nahbäume — vor dem Eintragen, einmal je Simulationsschritt. */
  beginDynamic(): void {
    this.#dynCount = 0;
  }

  /**
   * Einen Stamm der Umgebung eintragen. Liefert false, wenn der Puffer voll
   * ist — dann bleiben weiter entfernte Bäume durchfahrbar, und das ist die
   * richtige Priorität: wer 48 Stämme in 12 m hat, steht im Dickicht.
   */
  addDynamicCylinder(
    x: number,
    z: number,
    radius: number,
    y0: number,
    y1: number,
    key: number,
  ): boolean {
    const i = this.#dynCount;
    if (i >= DYNAMIC_CAP) return false;
    this.#dynX[i] = x;
    this.#dynZ[i] = z;
    this.#dynR[i] = radius;
    this.#dynY0[i] = y0;
    this.#dynY1[i] = y1;
    this.#dynKey[i] = key >>> 0;
    this.#dynAlive[i] = 1;
    this.#dynCount = i + 1;
    return true;
  }

  isAlive(id: number, source = HIT_STATIC): boolean {
    if (source === HIT_TREE) {
      for (let i = 0; i < this.#dynCount; i++) {
        if (this.#dynKey[i] === id) return this.#dynAlive[i] === 1;
      }
      return false;
    }
    return this.#alive[id] === 1;
  }

  isBreakable(id: number, source = HIT_STATIC): boolean {
    if (source === HIT_TREE) return true;
    return this.#breakable[id] === 1;
  }

  /** Körper (oder Stamm) für den Rest der Sitzung abmelden. */
  disableHit(id: number, source: number): void {
    if (source === HIT_TREE) {
      for (let i = 0; i < this.#dynCount; i++) {
        if (this.#dynKey[i] === id) this.#dynAlive[i] = 0;
      }
      return;
    }
    if (id >= 0 && id < this.#alive.length) this.#alive[id] = 0;
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
  ): number {
    return this.#push(KIND_BOX, minX, maxX, minZ, maxZ, y0, y1, minX, maxX, minZ, maxZ);
  }

  /** Kreiszylinder — Props, Pfosten. */
  addCylinder(x: number, z: number, radius: number, y0: number, y1: number): number {
    return this.#push(KIND_CYLINDER, x, z, radius, 0, y0, y1, x - radius, x + radius, z - radius, z + radius);
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
    breakable = false,
  ): number {
    const minX = Math.min(ax, bx) - halfThickness;
    const maxX = Math.max(ax, bx) + halfThickness;
    const minZ = Math.min(az, bz) - halfThickness;
    const maxZ = Math.max(az, bz) + halfThickness;
    return this.#push(
      KIND_WALL,
      ax,
      az,
      bx,
      bz,
      y0,
      y1,
      minX,
      maxX,
      minZ,
      maxZ,
      halfThickness,
      breakable,
    );
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
    breakable = false,
  ): number {
    const index = this.#shapeCount++;
    this.#shapes.kind.push(kind);
    // Fünf Werte je Körper: die vier Formparameter plus die Zusatzzahl, die
    // heute nur die Wandstärke ist. Ein festes Vielfaches, damit der Index eine
    // Multiplikation bleibt und keine Suche.
    this.#shapes.p.push(p0, p1, p2, p3, extra);
    this.#shapes.y0.push(y0);
    this.#shapes.y1.push(y1);
    this.#alive.push(1);
    this.#breakable.push(breakable ? 1 : 0);
    if (index >= this.#visited.length) {
      // In Blöcken wachsen und nicht je Körper: der Aufbau legt ~1600 Körper an.
      const grown = new Int32Array(Math.max(1024, (index + 1) * 2));
      grown.set(this.#visited);
      this.#visited = grown;
    }
    this.#insert(this.#cells, index, minX, maxX, minZ, maxZ);
    return index;
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
    hit.id = -1;
    hit.source = HIT_STATIC;
    hit.breakable = false;

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
          if (this.#alive[s] !== 1) continue;
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
            hit.id = s;
            hit.source = HIT_STATIC;
            hit.breakable = this.#breakable[s] === 1;
          }
        }
      }
    }

    this.#queryDynamic(x, y, z, radius, hit);
    return hit;
  }

  /**
   * Die **ganze Karosserie** gegen alles, was sie berührt — P19.
   *
   * `cx, cz` ist der Schwerpunkt in XZ, `(ux, uz)` die Fahrtrichtung (normiert),
   * `hl`/`hw` die halbe Länge und Breite **einschließlich** Blechzuschlag.
   * `y0`/`y1` ist das Höhenband der Karosserie in Weltkoordinaten; ein Körper
   * zählt, wenn sich beide Bänder überschneiden.
   *
   * Liefert die Zahl der gefüllten Einträge in `out`, absteigend nach Tiefe. Das
   * Feld gehört dem Aufrufer und wird nur beschrieben — `createBodyContacts()`
   * legt eines an.
   *
   * Warum absteigend sortiert: die Auflösung in `Vehicle` arbeitet die Kontakte
   * der Reihe nach ab und rechnet jeweils an, was schon herausgeschoben wurde.
   * Beim tiefsten anzufangen ist die Reihenfolge, bei der die flachen Kontakte
   * danach meistens schon erledigt sind.
   */
  queryBody(
    cx: number,
    cz: number,
    ux: number,
    uz: number,
    hl: number,
    hw: number,
    y0: number,
    y1: number,
    out: BodyContact[],
  ): number {
    const vx = -uz;
    const vz = ux;
    const cap = out.length;
    if (cap === 0) return 0;
    let n = 0;

    const tick = ++this.#visitTick;
    const visited = this.#visited;
    const kinds = this.#shapes.kind;
    const p = this.#shapes.p;
    const y0s = this.#shapes.y0;
    const y1s = this.#shapes.y1;

    // Ein Ring von Zellen um die Mittelzelle. Die halbe Diagonale der größten
    // Karosserie (Lastwagen, 7,1 × 2,5 m) ist 3,8 m gegen 24 m Zellweite — ein
    // Körper, der das Rechteck berührt, liegt zwingend in einer dieser neun
    // Zellen, und dort steht er auch drin (siehe `#insert`).
    const gx = Math.floor((cx + WORLD.half) / CELL);
    const gz = Math.floor((cz + WORLD.half) / CELL);

    for (let dz = -1; dz <= 1; dz++) {
      const zz = gz + dz;
      if (zz < 0 || zz >= this.#rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = gx + dx;
        if (xx < 0 || xx >= this.#columns) continue;
        const list = this.#cells[zz * this.#columns + xx];
        if (list === undefined) continue;

        for (let i = 0; i < list.length; i++) {
          const s = list[i]!;
          if (visited[s] === tick) continue;
          visited[s] = tick;
          if (this.#alive[s] !== 1) continue;
          // Höhenbänder müssen sich überschneiden. Zwei Vergleiche, bevor
          // irgendeine Wurzel gerechnet wird — dieselbe Reihenfolge wie in
          // `query()`.
          if (y0 > y1s[s]! || y1 < y0s[s]!) continue;

          const base = s * 5;
          let touched = false;

          switch (kinds[s]!) {
            case KIND_BOX: {
              const minX = p[base]!;
              const maxX = p[base + 1]!;
              const minZ = p[base + 2]!;
              const maxZ = p[base + 3]!;
              touched = boxVsBody(
                (minX + maxX) * 0.5,
                (minZ + maxZ) * 0.5,
                1,
                0,
                (maxX - minX) * 0.5,
                (maxZ - minZ) * 0.5,
                cx,
                cz,
                ux,
                uz,
                vx,
                vz,
                hl,
                hw,
              );
              break;
            }

            case KIND_CYLINDER: {
              touched = circleVsBody(
                p[base]!,
                p[base + 1]!,
                p[base + 2]!,
                cx,
                cz,
                ux,
                uz,
                vx,
                vz,
                hl,
                hw,
              );
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
              const length = Math.hypot(ex, ez);
              if (length < 1e-6) break;
              touched = boxVsBody(
                (ax + bx) * 0.5,
                (az + bz) * 0.5,
                ex / length,
                ez / length,
                length * 0.5,
                half,
                cx,
                cz,
                ux,
                uz,
                vx,
                vz,
                hl,
                hw,
              );
              break;
            }
          }

          if (!touched || mDepth <= 0) continue;
          n = insertContact(out, n, cap, s, HIT_STATIC, this.#breakable[s] === 1);
        }
      }
    }

    // Bäume: dieselbe Kreis-Rechteck-Rechnung, nur aus dem Nahpuffer statt aus
    // dem Raster. Kein Stempel nötig — dort steht jeder Stamm genau einmal.
    for (let i = 0; i < this.#dynCount; i++) {
      if (this.#dynAlive[i] !== 1) continue;
      if (y0 > this.#dynY1[i]! || y1 < this.#dynY0[i]!) continue;
      if (
        !circleVsBody(this.#dynX[i]!, this.#dynZ[i]!, this.#dynR[i]!, cx, cz, ux, uz, vx, vz, hl, hw)
      ) {
        continue;
      }
      if (mDepth <= 0) continue;
      n = insertContact(out, n, cap, this.#dynKey[i]!, HIT_TREE, true);
    }

    return n;
  }

  #queryDynamic(x: number, y: number, z: number, radius: number, hit: Pushout): void {
    const n = this.#dynCount;
    if (n === 0) return;
    for (let i = 0; i < n; i++) {
      if (this.#dynAlive[i] !== 1) continue;
      if (y > this.#dynY1[i]! || y < this.#dynY0[i]!) continue;
      let dirX = x - this.#dynX[i]!;
      let dirZ = z - this.#dynZ[i]!;
      const length = Math.hypot(dirX, dirZ);
      const distance = length - this.#dynR[i]!;
      if (distance >= radius) continue;
      if (length < 1e-9) {
        dirX = 1;
        dirZ = 0;
      } else {
        dirX /= length;
        dirZ /= length;
      }
      const depth = radius - distance;
      if (depth > hit.depth) {
        hit.depth = depth;
        hit.nx = dirX;
        hit.nz = dirZ;
        hit.id = this.#dynKey[i]!;
        hit.source = HIT_TREE;
        hit.breakable = true;
      }
    }
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
