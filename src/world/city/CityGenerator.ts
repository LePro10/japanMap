import { BufferAttribute, BufferGeometry, Color, SRGBColorSpace } from 'three';

import { CITY, CITY_DISTRICT, CITY_GROUND_Y, CITY_SLAB_Y } from '@/config/city.config';

/**
 * Stadt-Generator — PLAN.md P6 / 6.1.
 *
 * Erzeugt aus dem Distriktkasten und dem Straßennetz die vollständige Stadt:
 * Bodenplatte, Bürgersteige, Baukörper. Die Eingabe besteht aus zwei Abfragen —
 * „liegt hier Straße?" und „wie hoch ist hier das Gelände?" —, alles Übrige
 * entsteht aus dem Seed.
 *
 * ## Warum zur Laufzeit und nicht im Baker
 *
 * Terrain, Straßen und Props werden gebacken, die Stadt nicht. Der Unterschied
 * liegt in der Eingabe: jene drei brauchen Erosionssimulation, Wegsuche oder
 * Zonenmasken — Rechnungen, die Sekunden bis Minuten kosten und deren Ergebnis
 * niemand pro Sitzung neu haben will. Die Stadt braucht einen Kasten und eine
 * Abstandsfunktion, beides beim Start ohnehin im Speicher. Gemessen kostet der
 * ganze Aufbau unter dem Wert, den `CitySystem` als `aufbau` anzeigt; ein
 * Backschritt brächte eine weitere Datei und ein weiteres Kettenglied, das
 * jemand vergessen kann.
 *
 * ## Aufbau in vier Stufen
 *
 *  1. **Blöcke** — der Distrikt wird rekursiv geteilt, die Fugen sind Straßen.
 *  2. **Freischneiden** — Blöcke weichen der befahrenen Stadtstraße, indem sie
 *     schrumpfen, nicht indem sie verschwinden. Sonst stünde ausgerechnet an
 *     der Hauptstraße nichts.
 *  3. **Parzellen** — jeder Block wird noch einmal geteilt, ein Teil bleibt leer.
 *  4. **Baukörper** — Extrusion mit Rücksprung, Ladenzeile, Brüstung.
 *
 * Zusammengefasst wird **je Block**, nicht je Gebäude: PLAN.md nennt das
 * ausdrücklich als Antwort auf das Draw-Call-Risiko der Phase. Ein Block ist
 * zugleich die natürliche Einheit für das Frustum-Culling — er ist kompakt,
 * während ein „alle Gebäude"-Mesh die halbe Stadt in jeden Sichtkegel zöge.
 */

/** Achsparalleles Rechteck in XZ. */
interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const width = (r: Rect): number => r.maxX - r.minX;
const depth = (r: Rect): number => r.maxZ - r.minZ;

export interface CityInput {
  /** Liegt der Punkt im Korridor einer befahrenen Straße? */
  readonly isRoad: (x: number, z: number) => boolean;
  /** Geländehöhe für die Schürze am Distriktrand. */
  readonly sampleTerrain: (x: number, z: number) => number;
}

/** Ein Ort für ein Neonschild — Ausgabe für 6.3, erzeugt beim Bau der Fassade. */
export interface SignAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Auswärtige Flächennormale, als Winkel um Y in Radiant. */
  readonly angle: number;
  /** Verfügbare Wandbreite in Metern. */
  readonly span: number;
  /** Etagenzahl des Trägergebäudes — 6.3 wählt daran die Schildgröße. */
  readonly floors: number;
}

/**
 * Ein Baukörper als Kollisionskasten — PLAN.md P14.
 *
 * **Achsparallel, und das ist keine Vereinfachung, sondern die Wahrheit über
 * diese Stadt:** die Parzellenteilung arbeitet ausschließlich mit `Rect`, und
 * jedes Haus wird aus seinem Rechteck extrudiert. Der Kasten hier ist damit die
 * exakte Grundfläche und nicht eine Näherung an sie.
 *
 * Er entsteht **beim Erzeugen** und nicht später aus dem Mesh. Aus dem Mesh
 * ginge es nicht mehr: die Häuser eines Blocks sind zu *einer* Geometrie
 * zusammengeführt (3 Draw-Calls für die ganze Stadt), und darin gibt es keine
 * Objektgrenzen mehr.
 */
export interface CityCollider {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Unterkante in Weltkoordinaten — die Bürgersteigoberkante. */
  readonly bottom: number;
  /** Oberkante inklusive Brüstung. */
  readonly top: number;
}

/** Ein Bürgersteig: befahrbare erhöhte Fläche, kein Hindernis. */
export interface CityCurb {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly top: number;
}

export interface CityBlockMesh {
  readonly geometry: BufferGeometry;
}

export interface CityResult {
  /** Ein Mesh je Block — die Einheit für Draw-Calls und Frustum-Culling. */
  readonly blocks: readonly CityBlockMesh[];
  /** Alle Bürgersteige in einem Mesh. Sie sind flach und tragen keine Fassade. */
  readonly sidewalks: BufferGeometry;
  /** Die Asphaltebene samt Schürze zum Gelände. */
  readonly ground: BufferGeometry;
  readonly signs: readonly SignAnchor[];
  /** Kollisionskästen aller Baukörper — siehe `CityCollider`. */
  readonly colliders: readonly CityCollider[];
  /** Bürgersteige als befahrbare Plateaus. */
  readonly curbs: readonly CityCurb[];
  readonly stats: {
    readonly blocks: number;
    readonly parcels: number;
    readonly buildings: number;
    readonly triangles: number;
    readonly floorsMax: number;
    readonly heightMax: number;
    /** Kleinster Abstand zwischen Platte und darunterliegendem Gelände, in Metern. */
    readonly slabClearance: number;
    readonly slabClearanceAt: { x: number; z: number };
  };
}

/** mulberry32 — derselbe Strom wie im Baker, damit „deterministisch" dasselbe heißt. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Farben der Fassaden — als **sRGB-Hex**, wie überall im Projekt.
 *
 * > Die erste Fassung stand hier als lineare Tripel wie `[0.52, 0.51, 0.49]`,
 * > gedacht als „mittelgrauer Beton". Das war ein Farbraumfehler mit sichtbarer
 * > Folge: three legt Vertexfarben **linear** aus, 0,52 linear entspricht aber
 * > sRGB 0,75 — die Stadt stand als Kreideblock in der Landschaft. Die
 * > Umrechnung macht jetzt `Color.setHex(hex, 'srgb')`, genau wie `paint()` bei
 * > den Landmarks aus P5.
 *
 * Gedämpft und eng beieinander — der Look entsteht bei blauer Stunde im
 * Fensterlicht, nicht im Anstrich (SPEC §3.1). Eine bunte Stadt würde mit den
 * Neonschildern konkurrieren, die genau dafür da sind, die einzigen gesättigten
 * Farben im Bild zu sein.
 *
 * **Und dunkler, als man sie im Farbwähler wählen würde.** Der erste Satz lag
 * um 0x8a8a86; aus 1,2 km Entfernung (Blickpunkt `stadt-fern`) stand die Stadt
 * damit als weißer Fleck in einer Landschaft, deren Gelände-Albedo weit
 * darunter liegt.
 *
 * > **Die Begründung dafür stand hier zuerst falsch und ist widerlegt.** Sie
 * > lautete: „bei 2,23° Sonnenstand trifft das Licht die Fassaden fast
 * > senkrecht, eine Wand bekommt mehr Licht ab als jeder Hang". Das stimmt als
 * > Physik und erklärt den Fleck nicht. Nachgemessen mit einer Maske am
 * > Blickpunkt `stadt-fern` — mittlere Helligkeit der Stadtpixel gegen einen
 * > 60-px-Rahmen ringsum:
 * >
 * > | Zustand | Stadt | Umgebung | Verhältnis |
 * > |---|---|---|---|
 * > | wie gebaut | 141,8 | 99,3 | **1,43** |
 * > | ohne Fenster- und Neonlicht | 63,2 | 76,4 | **0,83** |
 * >
 * > Ohne ihr Eigenlicht ist die Stadt **dunkler als die Landschaft**. Die
 * > Helligkeit kommt also fast vollständig aus den brennenden Fenstern und dem
 * > Neon — und damit aus genau dem, was SPEC §3.1 als „dominante urbane
 * > Lichtquelle" verlangt. Der Hebel gegen einen zu hellen Fleck wäre
 * > `windowEmissive`, nicht diese Palette; und der Wert ist in
 * > `city.config.ts` bereits gegen den Bloom-Halo eingemessen.
 * >
 * > Der abgedunkelte Satz bleibt trotzdem: er ist der Grund, **warum** das
 * > Verhältnis ohne Eigenlicht unter 1 liegt.
 */
const FACADE_HEX: readonly number[] = [
  0x6e6e6a, // Sichtbeton
  0x7d776f, // heller Putz
  0x5e6064, // Waschbeton, kühl
  0x776e64, // Beige-Fliese
  0x46423b, // dunkler Klinker
];

const toLinear = (hex: number): [number, number, number] => {
  const c = new Color().setHex(hex, SRGBColorSpace);
  return [c.r, c.g, c.b];
};

const FACADE_COLORS: readonly [number, number, number][] = FACADE_HEX.map(toLinear);

/** Dach, Brüstung, Vordach — durchweg dunkler als die Wand darunter. */
const ROOF_COLOR = toLinear(0x3a3a3c);
const SIDEWALK_COLOR = toLinear(0x7d7b78);

/**
 * Der Vertex-Kanal der **Bodenplatte** trägt keine Farbe, sondern die
 * Pfützenneigung — genau wie beim Straßen-Mesh seit P3 (`RoadMeshBuilder`,
 * Kanal R). Die Platte läuft über dasselbe `RoadMaterial`, und das liest den
 * Kanal als Wasserneigung, nicht als Anstrich.
 *
 * Die ebene Fläche bekommt einen hohen Wert: ein Platz ohne Gefälle hält das
 * Wasser. Die Schürze fällt zum Gelände hin ab, dort läuft es weg.
 *
 * > **0,95 und nicht 0,58.** Gemessen war die Stadtplatte bei einer Einstellung,
 * > die die Fahrbahn zu 33 bis 39 % nass zeigte, praktisch trocken (0,3 %) —
 * > und das ausgerechnet dort, wo der Money-Shot der Phase steht. Ursache ist
 * > die Kennlinie in `roadPuddleMask`: die Neigung geht als `mix(0.35, 1.0,
 * > bias)` ein, ein Wert von 0,58 landet also bei 73 % dessen, was die
 * > Fahrbahnränder bekommen. Ein Platz **ohne jede Querneigung** hält aber mehr
 * > Wasser als eine gewölbte Fahrbahn, nicht weniger.
 */
const PUDDLE_SLAB: [number, number, number] = [0.95, 0, 0];
const PUDDLE_SKIRT: [number, number, number] = [0.22, 0, 0];

/** Kennzeichnung der Fläche für das Fassaden-Material. */
const KIND_WALL = 0;
const KIND_FLAT = 1;

/**
 * Kachelmaß der Belagstextur auf der Bodenplatte, in Metern.
 *
 * Spiegelt das Straßen-Mesh: dort läuft `u` über die volle Breite (Stadtstraße
 * 8 m Fahrbahn plus zweimal 1,2 m Bankett = 10,4 m) und `v` über
 * `textureLength` = 8 m Bogenlänge. Platte und Fahrbahn stoßen im Distrikt
 * aneinander; liefen sie mit verschiedenen Maßstäben, wäre jede Bordsteinkante
 * eine sichtbare Materialgrenze.
 */
const TILE_U = 10.4;
const TILE_V = 8;

class MeshBuilder {
  readonly #positions: number[] = [];
  readonly #normals: number[] = [];
  readonly #uvs: number[] = [];
  readonly #colors: number[] = [];
  readonly #facade: number[] = [];
  readonly #indices: number[] = [];

  get triangles(): number {
    return this.#indices.length / 3;
  }

  get empty(): boolean {
    return this.#indices.length === 0;
  }

  /**
   * Ein Viereck, gegen den Uhrzeigersinn von außen gesehen.
   *
   * Die Normale wird **übergeben, nicht gerechnet**: alle Flächen dieser Stadt
   * sind achsparallel, und eine gerechnete Normale aus dem Kreuzprodukt wäre
   * bei entarteten Vierecken (ein Rücksprung von 0 m) nicht definiert. Wer sie
   * falsch herum übergibt, sieht das sofort — die Wand verschwindet im
   * Backface-Culling. Genau dieser Fehler hat in P3 einmal eine ganze Straße
   * unsichtbar gemacht, bei völlig plausiblen Draw-Call- und Dreieckszahlen.
   */
  quad(
    p: readonly number[],
    normal: readonly [number, number, number],
    uv: readonly number[],
    color: readonly [number, number, number],
    seed: number,
    kind: number,
  ): void {
    const base = this.#positions.length / 3;
    for (let i = 0; i < 4; i++) {
      this.#positions.push(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!);
      this.#normals.push(normal[0], normal[1], normal[2]);
      this.#uvs.push(uv[i * 2]!, uv[i * 2 + 1]!);
      this.#colors.push(color[0], color[1], color[2]);
      this.#facade.push(seed, kind);
    }
    this.#indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(name: string): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.#positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.#normals), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.#uvs), 2));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.#colors), 3));
    geometry.setAttribute('aFacade', new BufferAttribute(new Float32Array(this.#facade), 2));
    geometry.setIndex(new BufferAttribute(new Uint32Array(this.#indices), 1));
    geometry.computeBoundingSphere();
    geometry.name = name;
    return geometry;
  }
}

/**
 * Eine Wand mit Fenster-UV.
 *
 * `floorBase` ist der Etagenindex an der Unterkante, `floorTop` der an der
 * Oberkante — beide absolut vom Gebäudesockel aus gezählt. Damit liegt das
 * Erdgeschoss immer bei v ∈ [0, 1], gleichgültig in welchem Rücksprung die Wand
 * steht, und der Shader braucht keine Etagenhöhe zu kennen.
 *
 * Die Spaltenzahl wird auf die **tatsächliche** Wandlänge gerundet. Ohne das
 * stünde an jeder Gebäudeecke ein angeschnittenes Fenster; mit ihr ist eine
 * UV-Einheit exakt ein Fenster, und das Raster passt per Konstruktion.
 */
function wall(
  mesh: MeshBuilder,
  face: 'px' | 'nx' | 'pz' | 'nz',
  rect: Rect,
  y0: number,
  y1: number,
  floorBase: number,
  floorTop: number,
  color: readonly [number, number, number],
  seed: number,
  kind: number,
): void {
  const span =
    face === 'px' || face === 'nx' ? depth(rect) : width(rect);
  const columns =
    kind === KIND_WALL
      ? Math.max(CITY.window.minColumns, Math.round(span / CITY.window.nominalPitch))
      : 1;
  const uv = [columns, floorBase, 0, floorBase, 0, floorTop, columns, floorTop];

  const { minX, maxX, minZ, maxZ } = rect;
  switch (face) {
    case 'px':
      mesh.quad(
        [maxX, y0, maxZ, maxX, y0, minZ, maxX, y1, minZ, maxX, y1, maxZ],
        [1, 0, 0],
        uv,
        color,
        seed,
        kind,
      );
      return;
    case 'nx':
      mesh.quad(
        [minX, y0, minZ, minX, y0, maxZ, minX, y1, maxZ, minX, y1, minZ],
        [-1, 0, 0],
        uv,
        color,
        seed,
        kind,
      );
      return;
    case 'pz':
      mesh.quad(
        [minX, y0, maxZ, maxX, y0, maxZ, maxX, y1, maxZ, minX, y1, maxZ],
        [0, 0, 1],
        uv,
        color,
        seed,
        kind,
      );
      return;
    default:
      mesh.quad(
        [maxX, y0, minZ, minX, y0, minZ, minX, y1, minZ, maxX, y1, minZ],
        [0, 0, -1],
        uv,
        color,
        seed,
        kind,
      );
  }
}

function top(
  mesh: MeshBuilder,
  rect: Rect,
  y: number,
  color: readonly [number, number, number],
  seed: number,
): void {
  const { minX, maxX, minZ, maxZ } = rect;
  mesh.quad(
    [minX, y, minZ, minX, y, maxZ, maxX, y, maxZ, maxX, y, minZ],
    [0, 1, 0],
    [0, 0, 0, 1, 1, 1, 1, 0],
    color,
    seed,
    KIND_FLAT,
  );
}

/** Ein geschlossener Quader: vier Wände und ein Deckel, ohne Boden. */
function box(
  mesh: MeshBuilder,
  rect: Rect,
  y0: number,
  y1: number,
  floorBase: number,
  floorTop: number,
  wallColor: readonly [number, number, number],
  topColor: readonly [number, number, number],
  seed: number,
  kind: number,
): void {
  for (const face of ['px', 'nx', 'pz', 'nz'] as const) {
    wall(mesh, face, rect, y0, y1, floorBase, floorTop, wallColor, seed, kind);
  }
  top(mesh, rect, y1, topColor, seed);
}

/** Rechteck rundum verkleinern. */
function shrink(rect: Rect, by: number): Rect {
  return {
    minX: rect.minX + by,
    maxX: rect.maxX - by,
    minZ: rect.minZ + by,
    maxZ: rect.maxZ - by,
  };
}

/**
 * Rekursive Teilung eines Rechtecks.
 *
 * Geteilt wird immer die **längere** Seite; sonst entstehen aus einem länglichen
 * Block zwei noch länglichere. Die Fuge ist die Straße und wird aus dem
 * Ergebnis herausgeschnitten, indem beide Hälften um ihre halbe Breite
 * einrücken.
 */
function subdivide(
  rect: Rect,
  depthIndex: number,
  maxSize: number,
  minSize: number,
  gapByDepth: readonly number[] | null,
  splitLow: number,
  splitHigh: number,
  random: () => number,
  out: Rect[],
): void {
  const w = width(rect);
  const d = depth(rect);
  if (w <= maxSize && d <= maxSize) {
    out.push(rect);
    return;
  }

  const alongX = w >= d;
  const length = alongX ? w : d;
  const gap = gapByDepth
    ? (gapByDepth[Math.min(depthIndex, gapByDepth.length - 1)] ?? 0)
    : 0;

  // Reicht die Länge nicht für zwei Hälften plus Fuge, bleibt der Block stehen.
  // Ohne diese Bremse entstehen Splitter, die weder Parzelle noch Straße sind.
  if (length - gap < minSize * 2) {
    out.push(rect);
    return;
  }

  const t = splitLow + random() * (splitHigh - splitLow);
  const cut = (alongX ? rect.minX : rect.minZ) + length * t;
  const half = gap / 2;

  const a: Rect = alongX
    ? { ...rect, maxX: cut - half }
    : { ...rect, maxZ: cut - half };
  const b: Rect = alongX
    ? { ...rect, minX: cut + half }
    : { ...rect, minZ: cut + half };

  for (const part of [a, b]) {
    if (width(part) < minSize || depth(part) < minSize) {
      out.push(part);
      continue;
    }
    subdivide(part, depthIndex + 1, maxSize, minSize, gapByDepth, splitLow, splitHigh, random, out);
  }
}

/**
 * Einen Block von der Straße freischneiden, indem er schrumpft.
 *
 * **Nicht: verwerfen.** Der erste Entwurf hat jeden Block gestrichen, der den
 * Straßenkorridor berührt — mit dem Ergebnis, dass ausgerechnet entlang der
 * Stadtstraße ein 40 m breiter leerer Streifen lag. Die Hauptstraße ist aber
 * genau der Ort, an dem in P6 etwas stehen soll.
 *
 * Geschrumpft wird an der Seite, an der die meisten Proben im Korridor liegen,
 * jeweils um einen Schritt. Das Verfahren endet immer: entweder ist der Block
 * frei oder er fällt unter die Mindestgröße und entfällt doch.
 */
function carveFromRoads(rect: Rect, isRoad: (x: number, z: number) => boolean): Rect | null {
  const step = 3;
  let current = rect;

  for (let guard = 0; guard < 40; guard++) {
    const sides = [0, 0, 0, 0]; // minX, maxX, minZ, maxZ
    let blocked = 0;
    const w = width(current);
    const d = depth(current);
    const nx = Math.max(2, Math.round(w / 6));
    const nz = Math.max(2, Math.round(d / 6));

    for (let iz = 0; iz <= nz; iz++) {
      const z = current.minZ + (d * iz) / nz;
      for (let ix = 0; ix <= nx; ix++) {
        const x = current.minX + (w * ix) / nx;
        if (!isRoad(x, z)) continue;
        blocked++;
        // Die Probe zählt für die Seite, der sie am nächsten liegt.
        const distances = [x - current.minX, current.maxX - x, z - current.minZ, current.maxZ - z];
        let best = 0;
        for (let i = 1; i < 4; i++) if (distances[i]! < distances[best]!) best = i;
        sides[best]!++;
      }
    }

    if (blocked === 0) return current;

    let worst = 0;
    for (let i = 1; i < 4; i++) if (sides[i]! > sides[worst]!) worst = i;

    current =
      worst === 0
        ? { ...current, minX: current.minX + step }
        : worst === 1
          ? { ...current, maxX: current.maxX - step }
          : worst === 2
            ? { ...current, minZ: current.minZ + step }
            : { ...current, maxZ: current.maxZ - step };

    if (width(current) < CITY.block.minSize || depth(current) < CITY.block.minSize) return null;
  }
  return null;
}

export function generateCity(input: CityInput): CityResult {
  const random = mulberry32(CITY.seed);

  // ── 1. Blöcke ──────────────────────────────────────────────────────────
  const district: Rect = {
    minX: CITY_DISTRICT.minX,
    maxX: CITY_DISTRICT.maxX,
    minZ: CITY_DISTRICT.minZ,
    maxZ: CITY_DISTRICT.maxZ,
  };
  const raw: Rect[] = [];
  subdivide(
    district,
    0,
    CITY.block.maxSize,
    CITY.block.minSize,
    CITY.block.streetByDepth,
    CITY.block.splitLow,
    CITY.block.splitHigh,
    random,
    raw,
  );

  // ── 2. Freischneiden ───────────────────────────────────────────────────
  const blocks: Rect[] = [];
  for (const candidate of raw) {
    const carved = carveFromRoads(candidate, input.isRoad);
    if (carved) blocks.push(carved);
  }

  // ── 3./4. Parzellen und Baukörper ──────────────────────────────────────
  const sidewalkMesh = new MeshBuilder();
  const blockMeshes: CityBlockMesh[] = [];
  const signs: SignAnchor[] = [];
  const colliders: CityCollider[] = [];
  const curbs: CityCurb[] = [];
  const sidewalkTop = CITY_GROUND_Y + CITY.sidewalk.height;

  let parcelCount = 0;
  let buildingCount = 0;
  let triangles = 0;
  let floorsMax = 0;
  let heightMax = 0;

  for (const block of blocks) {
    const pad = Math.min(
      CITY.sidewalk.overhang,
      Math.max(0, Math.min(width(block), depth(block)) / 2 - 4),
    );
    const buildable = shrink(block, pad);

    const parcels: Rect[] = [];
    subdivide(
      buildable,
      0,
      CITY.parcel.maxSize,
      CITY.parcel.minSize,
      null,
      CITY.parcel.splitLow,
      CITY.parcel.splitHigh,
      random,
      parcels,
    );
    parcelCount += parcels.length;

    const mesh = new MeshBuilder();
    let buildings = 0;

    for (const parcel of parcels) {
      if (random() < CITY.parcel.vacancy) continue;
      const footprint = shrink(parcel, CITY.parcel.setback);
      if (width(footprint) < 4 || depth(footprint) < 4) continue;

      const built = extrudeBuilding(mesh, footprint, block, sidewalkTop, random, signs);
      buildings++;
      // `built.height` ist die Höhe **über** `sidewalkTop`, inklusive Brüstung.
      colliders.push({
        minX: footprint.minX,
        maxX: footprint.maxX,
        minZ: footprint.minZ,
        maxZ: footprint.maxZ,
        bottom: sidewalkTop,
        top: sidewalkTop + built.height,
      });
      floorsMax = Math.max(floorsMax, built.floors);
      heightMax = Math.max(heightMax, built.height);
    }

    if (mesh.empty) continue;

    // Der Bürgersteig entsteht erst, wenn der Block tatsächlich bebaut ist.
    // Eine leere erhöhte Platte mitten im Asphalt wäre eine Rampe ins Nichts.
    box(
      sidewalkMesh,
      block,
      CITY_SLAB_Y,
      sidewalkTop,
      0,
      0,
      SIDEWALK_COLOR,
      SIDEWALK_COLOR,
      0,
      KIND_FLAT,
    );
    // Derselbe Block als Plateau: der Bürgersteig ist eine Kante, über die man
    // fährt, keine Mauer. Deshalb steht er nicht bei den Kollisionskästen.
    curbs.push({
      minX: block.minX,
      maxX: block.maxX,
      minZ: block.minZ,
      maxZ: block.maxZ,
      top: sidewalkTop,
    });

    buildingCount += buildings;
    triangles += mesh.triangles;
    blockMeshes.push({ geometry: mesh.build(`Stadtblock:${blockMeshes.length}`) });
  }

  const ground = buildGround(input.sampleTerrain);
  triangles += sidewalkMesh.triangles + ground.triangles;

  return {
    blocks: blockMeshes,
    sidewalks: sidewalkMesh.build('Bürgersteige'),
    ground: ground.geometry,
    signs,
    colliders,
    curbs,
    stats: {
      blocks: blockMeshes.length,
      parcels: parcelCount,
      buildings: buildingCount,
      triangles,
      floorsMax,
      heightMax,
      slabClearance: ground.clearance,
      slabClearanceAt: ground.clearanceAt,
    },
  };
}

/**
 * Ein Baukörper: Sockel, Rücksprung, Brüstung, Ladenzeile.
 *
 * Die Etagenzahl kommt aus der **Lage**, nicht nur aus dem Zufall: nahe der
 * Distriktmitte hoch, zum Rand hin niedrig. Eine Stadt ohne dieses Gefälle ist
 * aus der Ferne eine Platte, und die Silhouette ist das, was sie über einen
 * Kilometer hinweg als Stadt lesbar macht.
 */
function extrudeBuilding(
  mesh: MeshBuilder,
  footprint: Rect,
  block: Rect,
  baseY: number,
  random: () => number,
  signs: SignAnchor[],
): { floors: number; height: number } {
  const b = CITY.building;
  // **Ganzzahlig, nicht 0…1.** Der Startwert läuft als Vertex-Attribut durch
  // die perspektivisch korrekte Interpolation; die trifft je Pixel die letzten
  // Bits unterschiedlich, auch wenn an allen Ecken derselbe Wert steht. Der
  // Hash im Shader rundet ihn deshalb auf eine ganze Zahl — was nur geht, wenn
  // hier auch eine steht. Die lange Fassung der Geschichte in
  // `facade_windows.glsl`.
  const seed = Math.floor(random() * 256);
  const color = FACADE_COLORS[Math.floor(random() * FACADE_COLORS.length)] ?? FACADE_COLORS[0]!;

  const cx = (footprint.minX + footprint.maxX) / 2;
  const cz = (footprint.minZ + footprint.maxZ) / 2;
  const toCenter = Math.hypot(cx - CITY_DISTRICT.centerX, cz - CITY_DISTRICT.centerZ);
  const t = Math.min(
    1,
    Math.max(0, (toCenter - b.coreRadius) / (b.edgeRadius - b.coreRadius)),
  );
  const core = 1 - t * t * (3 - 2 * t);

  const floors = Math.max(
    b.minFloors,
    Math.min(b.maxFloors, Math.round(b.minFloors + core * b.coreFloors + random() * b.randomFloors)),
  );

  const floorTopY = (floor: number): number =>
    baseY + b.groundFloorHeight + Math.max(0, floor - 1) * b.floorHeight;

  const roofY = floorTopY(floors);

  // Erdgeschoss: zurückgesetzte Ladenfront mit Vordach. Das ist der Teil, den
  // man beim Fahren sieht — SPEC §2.1 nennt genau ihn als den Bereich, der die
  // Stadt am Boden trägt.
  const shop = shrink(footprint, b.shopInset);
  const groundTop = floorTopY(1);
  box(mesh, shop, baseY, groundTop, 0, 1, color, ROOF_COLOR, seed, KIND_WALL);

  const canopyY = groundTop - b.canopyThickness;
  const canopy: Rect = {
    minX: footprint.minX - (b.canopyDepth - b.shopInset),
    maxX: footprint.maxX + (b.canopyDepth - b.shopInset),
    minZ: footprint.minZ - (b.canopyDepth - b.shopInset),
    maxZ: footprint.maxZ + (b.canopyDepth - b.shopInset),
  };
  box(mesh, canopy, canopyY, groundTop, 0, 0, ROOF_COLOR, ROOF_COLOR, seed, KIND_FLAT);

  // Hauptkörper über dem Erdgeschoss.
  const hasSetback = floors >= b.setbackFloors;
  const splitFloor = hasSetback ? Math.max(2, Math.round(floors * b.setbackAt)) : floors;
  const lowerTop = floorTopY(splitFloor);

  for (const face of ['px', 'nx', 'pz', 'nz'] as const) {
    wall(mesh, face, footprint, groundTop, lowerTop, 1, splitFloor, color, seed, KIND_WALL);
  }

  let crown = footprint;
  let crownTop = lowerTop;
  if (hasSetback) {
    top(mesh, footprint, lowerTop, ROOF_COLOR, seed);
    const upper = shrink(footprint, b.setbackDepth);
    if (width(upper) > 4 && depth(upper) > 4) {
      for (const face of ['px', 'nx', 'pz', 'nz'] as const) {
        wall(mesh, face, upper, lowerTop, roofY, splitFloor, floors, color, seed, KIND_WALL);
      }
      crown = upper;
      crownTop = roofY;
    }
  }

  top(mesh, crown, crownTop, ROOF_COLOR, seed);

  // Brüstung als Ring aus vier flachen Quadern. Ohne sie endet jedes Haus als
  // scharfe Kante — bei 2,23° Sonnenstand die auffälligste Silhouette im Bild.
  const p = b.parapetThickness;
  const parapetTop = crownTop + b.parapet;
  const rings: Rect[] = [
    { ...crown, maxZ: crown.minZ + p },
    { ...crown, minZ: crown.maxZ - p },
    { minX: crown.minX, maxX: crown.minX + p, minZ: crown.minZ + p, maxZ: crown.maxZ - p },
    { minX: crown.maxX - p, maxX: crown.maxX, minZ: crown.minZ + p, maxZ: crown.maxZ - p },
  ];
  for (const ring of rings) {
    if (width(ring) <= 0 || depth(ring) <= 0) continue;
    box(mesh, ring, crownTop, parapetTop, 0, 0, ROOF_COLOR, ROOF_COLOR, seed, KIND_FLAT);
  }

  // Dachaufbauten: Wassertank oder Klimagerät. Zwei bis drei Prozent der
  // Dreiecke, und sie sind der Unterschied zwischen einem Dach und einem Deckel.
  const roofBoxes = 1 + Math.floor(random() * 3);
  for (let i = 0; i < roofBoxes; i++) {
    const bw = 1.4 + random() * 2.6;
    const bd = 1.4 + random() * 2.6;
    const inner = shrink(crown, p + 0.4);
    if (width(inner) <= bw || depth(inner) <= bd) break;
    const x0 = inner.minX + random() * (width(inner) - bw);
    const z0 = inner.minZ + random() * (depth(inner) - bd);
    box(
      mesh,
      { minX: x0, maxX: x0 + bw, minZ: z0, maxZ: z0 + bd },
      crownTop,
      crownTop + 0.8 + random() * 1.6,
      0,
      0,
      ROOF_COLOR,
      ROOF_COLOR,
      seed,
      KIND_FLAT,
    );
  }

  collectSigns(footprint, block, baseY, floors, roofY, signs);

  return { floors, height: parapetTop - baseY };
}

/**
 * Schilderplätze an den Wänden, die zur Straße zeigen.
 *
 * Eine Wand zeigt zur Straße, wenn sie auf dem Rand ihres Blocks liegt — und
 * das ist wörtlich gemeint: die Parzellenteilung hat den Block lückenlos
 * aufgeteilt, also grenzt jede Fläche, deren Koordinate mit der Blockkante
 * zusammenfällt, an den Straßenraum. Alle anderen Wände sind Brandwände und
 * bekommen kein Schild; eines dort wäre unsichtbar und trotzdem im Budget.
 */
function collectSigns(
  footprint: Rect,
  block: Rect,
  baseY: number,
  floors: number,
  roofY: number,
  out: SignAnchor[],
): void {
  if (floors < 3) return;
  const tolerance = CITY.sidewalk.overhang + CITY.parcel.setback + 0.5;
  const faces: { angle: number; x: number; z: number; span: number }[] = [];

  if (footprint.maxX >= block.maxX - tolerance) {
    faces.push({
      angle: Math.PI / 2,
      x: footprint.maxX,
      z: (footprint.minZ + footprint.maxZ) / 2,
      span: depth(footprint),
    });
  }
  if (footprint.minX <= block.minX + tolerance) {
    faces.push({
      angle: -Math.PI / 2,
      x: footprint.minX,
      z: (footprint.minZ + footprint.maxZ) / 2,
      span: depth(footprint),
    });
  }
  if (footprint.maxZ >= block.maxZ - tolerance) {
    faces.push({
      angle: 0,
      x: (footprint.minX + footprint.maxX) / 2,
      z: footprint.maxZ,
      span: width(footprint),
    });
  }
  if (footprint.minZ <= block.minZ + tolerance) {
    faces.push({
      angle: Math.PI,
      x: (footprint.minX + footprint.maxX) / 2,
      z: footprint.minZ,
      span: width(footprint),
    });
  }

  for (const face of faces) {
    out.push({
      x: face.x,
      y: baseY,
      z: face.z,
      angle: face.angle,
      span: face.span,
      floors,
    });
  }
  void roofY;
}

/**
 * Bodenplatte und Schürze.
 *
 * Die Platte selbst ist **ein einziges Viereck**. Das ist kein Sparzwang,
 * sondern die Zusage, um die es in 6.5 geht: eine Fläche aus vier Eckpunkten in
 * einer Ebene ist exakt planar, und eine planare Reflexion an ihr ist per
 * Konstruktion richtig statt näherungsweise. Jede Tessellierung wäre eine
 * Gelegenheit für einen Ausreißer.
 *
 * Die Schürze ist der Übergang zum Gelände: ein Ring aus Vierecken, dessen
 * äußere Kante die Geländehöhe abtastet. Ohne ihn stünde die Stadt auf einem
 * 20 bis 100 cm hohen Absatz mit senkrechter Kante.
 */
function buildGround(sampleTerrain: (x: number, z: number) => number): {
  geometry: BufferGeometry;
  triangles: number;
  clearance: number;
  clearanceAt: { x: number; z: number };
} {
  const mesh = new MeshBuilder();
  const d = CITY_DISTRICT;
  const y = CITY_SLAB_Y;
  const skirt = CITY.ground.skirt;
  const segments = CITY.ground.skirtSegments;

  // UV in **Metern durch Kachellänge**, wie beim Straßen-Mesh: die Belagstextur
  // muss über Fahrbahn und Platte hinweg denselben Maßstab haben, sonst sieht
  // man an jeder Bordsteinkante, dass es zwei Flächen sind.
  const uvOf = (x: number, z: number): [number, number] => [x / TILE_U, z / TILE_V];
  const [au, av] = uvOf(d.minX, d.minZ);
  const [bu, bv] = uvOf(d.minX, d.maxZ);
  const [cu, cv] = uvOf(d.maxX, d.maxZ);
  const [du, dv] = uvOf(d.maxX, d.minZ);
  mesh.quad(
    [d.minX, y, d.minZ, d.minX, y, d.maxZ, d.maxX, y, d.maxZ, d.maxX, y, d.minZ],
    [0, 1, 0],
    [au, av, bu, bv, cu, cv, du, dv],
    PUDDLE_SLAB,
    0,
    KIND_FLAT,
  );

  // Innen- und Außenring als Polygonzug, im Uhrzeigersinn von oben.
  const inner: [number, number][] = [];
  const outer: [number, number][] = [];
  const push = (x: number, z: number, ox: number, oz: number): void => {
    inner.push([x, z]);
    outer.push([x + ox, z + oz]);
  };
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    push(d.minX + (d.maxX - d.minX) * t, d.minZ, 0, -skirt);
  }
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    push(d.maxX, d.minZ + (d.maxZ - d.minZ) * t, skirt, 0);
  }
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    push(d.maxX - (d.maxX - d.minX) * t, d.maxZ, 0, skirt);
  }
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    push(d.minX, d.maxZ - (d.maxZ - d.minZ) * t, -skirt, 0);
  }

  const count = inner.length;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const [ix0, iz0] = inner[i]!;
    const [ix1, iz1] = inner[j]!;
    const [ox0, oz0] = outer[i]!;
    const [ox1, oz1] = outer[j]!;
    const oy0 = Math.min(y, sampleTerrain(ox0, oz0));
    const oy1 = Math.min(y, sampleTerrain(ox1, oz1));
    // **Ecken innen → innen → außen → außen, nicht innen → außen → außen → innen.**
    //
    // Bis P8.11 stand hier die zweite Reihenfolge, und sie ist im Uhrzeigersinn
    // von oben: für die Nordkante ergab (P1−P0) × (P2−P0) die y-Komponente
    // −s·dx. Die **ganze Schürze** — 240 der 242 Dreiecke des Stadtbodens —
    // zeigte nach unten und fiel ins Backface-Culling. Die Platte selbst war
    // richtig gewickelt (+129 600), deshalb sah der Distrikt normal aus; was
    // fehlte, war genau der Übergang, für den es die Schürze gibt.
    //
    // Der Kommentar an `quad()` warnt wörtlich davor („Wer sie falsch herum
    // übergibt, sieht das sofort"). Hier hat es niemand gesehen: die Schürze
    // ist flach, liegt am Boden und ist von oben von der Platte kaum zu
    // unterscheiden — der Absatz, den sie verdecken soll, ist 20…100 cm hoch.
    // Gefunden hat es erst eine systematische Wickelprüfung über alle Meshes,
    // nachdem derselbe Fehler beim Fluss aufgefallen war.
    //
    // Die UV-Reihenfolge zieht mit; sonst wäre die Belagstextur auf der
    // Schürze verdreht.
    const q0 = uvOf(ix0, iz0);
    const q1 = uvOf(ix1, iz1);
    const q2 = uvOf(ox1, oz1);
    const q3 = uvOf(ox0, oz0);
    mesh.quad(
      [ix0, y, iz0, ix1, y, iz1, ox1, oy1, oz1, ox0, oy0, oz0],
      [0, 1, 0],
      [q0[0], q0[1], q1[0], q1[1], q2[0], q2[1], q3[0], q3[1]],
      PUDDLE_SKIRT,
      0,
      KIND_FLAT,
    );
  }

  // **Der Abstand wird gemessen, nicht angenommen.** `city.mjs` verspricht,
  // dass die Platte über dem Gelände liegt; die Zusage ist mit 23 cm knapp und
  // hängt am Baker. Wer sie glaubt statt sie zu prüfen, sieht den Bruch erst,
  // wenn ein Grasbüschel durch den Asphalt wächst.
  let clearance = Infinity;
  const clearanceAt = { x: 0, z: 0 };
  for (let iz = 0; iz <= 60; iz++) {
    const z = d.minZ + ((d.maxZ - d.minZ) * iz) / 60;
    for (let ix = 0; ix <= 60; ix++) {
      const x = d.minX + ((d.maxX - d.minX) * ix) / 60;
      const gap = y - sampleTerrain(x, z);
      if (gap < clearance) {
        clearance = gap;
        clearanceAt.x = Math.round(x);
        clearanceAt.z = Math.round(z);
      }
    }
  }

  return {
    geometry: mesh.build('Stadtboden'),
    triangles: mesh.triangles,
    clearance,
    clearanceAt,
  };
}
