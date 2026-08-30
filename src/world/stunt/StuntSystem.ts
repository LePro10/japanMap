import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';

import { DRIFT_ZONES, PICKUPS, RAMPS } from '@/config/stunt.config';
import type { EngineContext, System } from '@/core/System';
import { liftLocal, type RampField } from '@/game/RampField';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { PropMaterial } from '@/world/materials/PropMaterial';
import type { RoadNetwork } from '@/world/roads/RoadNetwork';
import type { TerrainSampler } from '@/world/TerrainSampler';

/**
 * Schanzen, Kirschbäume, Fahnen und Sammelstücke — P24.
 *
 * ## Warum das alles ein System ist und nicht vier
 *
 * Weil es **eine** Frage beantwortet: *was gibt es auf dieser Karte zu tun, das
 * nicht die Straße entlang geht.* Vier Systeme wären vier `init()`-Reihenfolgen,
 * vier Materialien und vier Stellen, an denen jemand `dispose()` vergisst — für
 * zusammen sechs Meshes.
 *
 * ## Das Schanzen-Mesh kommt aus der Physik, nicht neben ihr
 *
 * `buildRamp()` tastet **dieselbe Funktion** ab, die `RoadGround.height()`
 * addiert (`liftLocal` in `RampField`). Ein Mesh, das die Form ein zweites Mal
 * hinschreibt, ist genau die Doppelung, an der dieses Projekt dreimal gescheitert
 * ist — zuletzt bei der Fahrbahn, die im Bild flach war und in der Physik
 * verwunden (P21, 1,66 m Unterschied).
 *
 * Der Preis ist ein Raster: 24 × 12 Stützpunkte je Schanze, also 552 Dreiecke.
 * Bei fünf Schanzen sind das 2760 Dreiecke in **einem** Draw-Call — die
 * Geometrien werden vor dem Hochladen zusammengeführt.
 *
 * ## Warum die Sammelstücke ein `InstancedMesh` sind und die Bäume auch
 *
 * 90 Sammelstücke und 40 Kirschbäume wären 130 Draw-Calls. Das Budget aus
 * SPEC §4 liegt bei 250 für die **ganze** Szene. Als Instanzen sind es zwei.
 */

/** Stützpunkte je Schanze, längs × quer. */
const RAMP_GRID_ALONG = 24;
const RAMP_GRID_ACROSS = 12;

/**
 * Wie weit das Schanzen-Mesh über die Auflage hinausreicht, in Metern.
 *
 * Die Auflage ist am Rand null; ein Mesh, das genau dort endet, hat eine
 * hauchdünne Kante, durch die man das Gelände sieht. Ein halber Meter Überstand
 * mit negativer Höhe steckt sie in den Boden.
 */
const RAMP_SKIRT = 0.6;

const RAMP_COLOR = 0xb4462c;
const RAMP_EDGE_COLOR = 0xe6d8c0;
const SAKURA_TRUNK = 0x4a3b30;
const SAKURA_BLOOM = 0xf3b8cf;
const FLAG_POLE = 0xd8d4cc;
const FLAG_CLOTH = 0xd83a3a;
const PICKUP_COLOR = 0xffd257;

export class StuntSystem implements System {
  readonly name = 'StuntSystem';

  /**
   * Der Atmosphärenblock wird **im Konstruktor** hereingereicht und nicht über
   * ein Ereignis geholt — dieselbe Bauart wie bei allen Systemen dieses
   * Projekts, die ein Material bauen. Begründung im Kopf von `main.ts`,
   * Punkt 2: Materialien entstehen beim Bauen, und für diese Richtung taugt das
   * Ereignismuster nicht.
   */
  constructor(
    private readonly atmosphere: AtmosphereUniforms,
    /**
     * Dasselbe Schanzenfeld, auf dem gefahren wird.
     *
     * **Hereingereicht und nicht neu gebaut.** Ein zweites `RampField` hätte
     * eigene Fußhöhen, und damit stünde das Mesh woanders als die Fläche, auf
     * der man fährt. Genau diese Doppelung ist der Grund, warum die Form
     * überhaupt eine Funktion ist — siehe Kopf von `RampField`.
     */
    private readonly ramps: RampField,
  ) {}

  readonly #group = new Group();
  #material: PropMaterial | null = null;
  #sampler: TerrainSampler | null = null;
  #network: RoadNetwork | null = null;

  #ramps: Mesh | null = null;
  #trees: InstancedMesh | null = null;
  #flags: InstancedMesh | null = null;
  #pickups: InstancedMesh | null = null;

  /** Weltpositionen der Sammelstücke und ihre Wiederkehr-Uhr. */
  readonly #pickupPos: { x: number; y: number; z: number; back: number }[] = [];
  readonly #geometries: BufferGeometry[] = [];
  readonly #matrix = new Matrix4();
  readonly #quat = new Quaternion();
  readonly #scale = new Vector3(1, 1, 1);
  readonly #zero = new Vector3(0, -1000, 0);
  readonly #up = new Vector3(0, 1, 0);
  #spin = 0;

  init(context: EngineContext): void {
    this.#group.name = 'Stunt';
    const material = new PropMaterial(this.atmosphere);
    material.name = 'StuntMaterial';
    material.roughness = 0.7;
    // Doppelseitig: das Fahnentuch ist eine Fläche ohne Rückseite, und ein
    // Banner, das man von hinten nicht sieht, ist eine Fahne, die halb fehlt.
    // Dieselbe Falle wie die rückseitig gewickelten Flächen aus P8.11 — nur ist
    // sie hier von vornherein beantwortet.
    material.side = DoubleSide;
    this.#material = material;
    context.scene.add(this.#group);

    context.bus.on('terrain:ready', ({ sampler }) => {
      this.#sampler = sampler;
      this.#buildTerrainBound(context.scene);
    });
    context.bus.on('roads:ready', ({ network }) => {
      this.#network = network;
      this.#buildTerrainBound(context.scene);
    });
  }

  /** Nur bauen, wenn beide Quellen da sind — und dann genau einmal. */
  #buildTerrainBound(scene: Scene): void {
    if (!this.#sampler || !this.#network || this.#ramps) return;
    this.#buildRamps();
    this.#buildZones();
    this.#buildPickups();
    void scene;
  }

  // ── Schanzen ────────────────────────────────────────────────────────────

  #buildRamps(): void {
    const sampler = this.#sampler;
    const material = this.#material;
    if (!sampler || !material) return;

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const color = new Color();
    const edge = new Color(RAMP_EDGE_COLOR);
    const body = new Color(RAMP_COLOR);

    for (const ramp of RAMPS) {
      const base = positions.length / 3;
      const sin = Math.sin(ramp.heading);
      const cos = Math.cos(ramp.heading);
      const baseY = this.ramps.baseOf(ramp);
      const half = ramp.width / 2 + RAMP_SKIRT;
      const from = -ramp.length - RAMP_SKIRT;
      const to = ramp.tail > 0 ? ramp.tail + RAMP_SKIRT : 0;

      for (let a = 0; a < RAMP_GRID_ALONG; a++) {
        const s = from + ((to - from) * a) / (RAMP_GRID_ALONG - 1);
        for (let c = 0; c < RAMP_GRID_ACROSS; c++) {
          const t = -half + (2 * half * c) / (RAMP_GRID_ACROSS - 1);
          const x = ramp.x + sin * s - cos * t;
          const z = ramp.z + cos * s + sin * t;
          // **Dieselbe Funktion wie die Physik** — Begründung im Kopf.
          const lift = liftLocal(ramp, s, t);
          // **Dieselbe Rechnung wie `RampField.surfaceAt`**: absolute Höhe über
          // dem Fundament, und außerhalb der Schanze der Boden selbst — 20 cm
          // tiefer, damit der Saum im Gelände steckt statt als Spalt zu stehen.
          const y =
            lift > 0 ? baseY + lift : Math.min(baseY, sampler.getHeightAt(x, z)) - 0.2;
          positions.push(x, y, z);
          // Die Absprungkante bekommt eine helle Leiste. Sie ist der einzige
          // Teil, den man aus 200 m sieht, und sie sagt „hier hört es auf".
          const isLip = ramp.tail === 0 && s > -1.6 && lift > 0.05;
          color.copy(isLip ? edge : body);
          colors.push(color.r, color.g, color.b);
        }
      }
      for (let a = 0; a + 1 < RAMP_GRID_ALONG; a++) {
        for (let c = 0; c + 1 < RAMP_GRID_ACROSS; c++) {
          const i0 = base + a * RAMP_GRID_ACROSS + c;
          const i1 = i0 + 1;
          const i2 = i0 + RAMP_GRID_ACROSS;
          const i3 = i2 + 1;
          // Wickelrichtung gegen den Uhrzeigersinn von oben: `japanMap.winding()`
          // hat in P8.11 zwei Flächen gefunden, die jede andere Zahl für gesund
          // hielt. Diese hier ist von vornherein richtig herum.
          indices.push(i0, i2, i1, i1, i2, i3);
        }
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
    geometry.setAttribute('color', new BufferAttribute(Float32Array.from(colors), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    this.#geometries.push(geometry);

    const mesh = new Mesh(geometry, material);
    mesh.name = 'Schanzen';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.#ramps = mesh;
    this.#group.add(mesh);
  }

  // ── Driftzonen: Kirschbäume und Fahnen ──────────────────────────────────

  /**
   * Der Ring aus Kirschbäumen und Fahnen um jede Driftzone.
   *
   * **Der Ring ist die Anzeige.** Eine Driftzone braucht eine Grenze, die man
   * im Fahren sieht, ohne hinzusehen — ein Kreis aus rosa Kronen ist auf 200 m
   * eindeutig, eine Bodenmarkierung nicht. Die Fahnen stehen dazwischen und
   * kippen im Wind; sie sind das, was Bewegung in ein sonst stilles Bild bringt.
   *
   * Die Bäume stehen mit gewürfeltem Winkel und gewürfelter Größe, aber
   * **deterministisch** (Position als Seed): eine Karte, die bei jedem Laden
   * anders aussieht, ist eine Karte, in der niemand einen Ort wiedererkennt.
   */
  #buildZones(): void {
    const sampler = this.#sampler;
    const material = this.#material;
    if (!sampler || !material) return;

    const trees: { x: number; y: number; z: number; scale: number; turn: number }[] = [];
    const flags: { x: number; y: number; z: number; turn: number }[] = [];

    for (const zone of DRIFT_ZONES) {
      for (let i = 0; i < zone.trees; i++) {
        const angle = (Math.PI * 2 * i) / zone.trees;
        // Der Radius wackelt um ±4 m — ein exakter Kreis sieht aus wie ein
        // Zaun, ein leicht unregelmäßiger wie ein Hain.
        const jitter = hash(zone.x + i * 13.7, zone.z - i * 7.1);
        const r = zone.radius + (jitter - 0.5) * 8;
        const x = zone.x + Math.cos(angle) * r;
        const z = zone.z + Math.sin(angle) * r;
        trees.push({
          x,
          y: sampler.getHeightAt(x, z),
          z,
          scale: 0.85 + jitter * 0.5,
          turn: jitter * Math.PI * 2,
        });
        // Jeder vierte Baum bekommt eine Fahne davor.
        if (i % 4 === 0) {
          const fx = zone.x + Math.cos(angle) * (r - 4);
          const fz = zone.z + Math.sin(angle) * (r - 4);
          flags.push({
            x: fx,
            y: sampler.getHeightAt(fx, fz),
            z: fz,
            // Die Fahne zeigt nach innen — sie ist für den, der in der Zone
            // steht, und nicht für den, der außen vorbeifährt.
            turn: angle + Math.PI / 2,
          });
        }
      }
    }

    this.#trees = this.#instance(createSakura(), trees.length, 'Kirschbäume');
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i]!;
      this.#quat.setFromAxisAngle(this.#up, t.turn);
      this.#scale.set(t.scale, t.scale, t.scale);
      this.#matrix.compose(new Vector3(t.x, t.y, t.z), this.#quat, this.#scale);
      this.#trees.setMatrixAt(i, this.#matrix);
    }
    this.#trees.instanceMatrix.needsUpdate = true;
    this.#scale.set(1, 1, 1);

    this.#flags = this.#instance(createFlag(), flags.length, 'Fahnen');
    for (let i = 0; i < flags.length; i++) {
      const f = flags[i]!;
      this.#quat.setFromAxisAngle(this.#up, f.turn);
      this.#matrix.compose(new Vector3(f.x, f.y, f.z), this.#quat, this.#scale);
      this.#flags.setMatrixAt(i, this.#matrix);
    }
    this.#flags.instanceMatrix.needsUpdate = true;
  }

  // ── Sammelstücke ────────────────────────────────────────────────────────

  /**
   * Sammelstücke entlang der Straßen verteilen.
   *
   * Erzeugt aus dem Straßennetz und nicht von Hand — Begründung bei
   * `PICKUPS`. Verteilt wird über die **Bogenlänge** aller Strecken zusammen,
   * damit lange Strecken mehr abbekommen als kurze; über den Punktindex verteilt
   * bekäme der 145 m lange Stadtzubringer genauso viele wie die 6 km lange
   * Ringstraße.
   */
  #buildPickups(): void {
    const sampler = this.#sampler;
    const network = this.#network;
    const material = this.#material;
    if (!sampler || !network || !material) return;

    const roads = network.roads.filter((r) => r.centerline.length >= 12);
    const total = roads.reduce((sum, r) => sum + r.length, 0);
    if (total <= 0) return;

    for (const road of roads) {
      const share = Math.max(1, Math.round((PICKUPS.count * road.length) / total));
      const line = road.centerline;
      const points = line.length / 3;
      for (let k = 0; k < share; k++) {
        const i = Math.min(points - 2, Math.floor((points * (k + 0.5)) / share));
        const x0 = line[i * 3]!;
        const z0 = line[i * 3 + 2]!;
        const dx = line[(i + 1) * 3]! - x0;
        const dz = line[(i + 1) * 3 + 2]! - z0;
        const len = Math.hypot(dx, dz) || 1;
        // Seitlich versetzt, Seite abwechselnd — das ist der Punkt: die Stücke
        // sollen die Linie ändern und nicht auf ihr liegen.
        const side = (k % 2 === 0 ? 1 : -1) * PICKUPS.offset * 3.5;
        const x = x0 - (dz / len) * side;
        const z = z0 + (dx / len) * side;
        this.#pickupPos.push({
          x,
          y: sampler.getHeightAt(x, z) + PICKUPS.height,
          z,
          back: 0,
        });
      }
    }

    this.#pickups = this.#instance(createToken(), this.#pickupPos.length, 'Sammelstücke');
    // Frustum-Culling aus: die Hüllkugel wird nie aktualisiert, weil die
    // Instanzmatrizen jeden Frame drehen. Dieselbe Begründung wie bei den
    // Rädern des Fahrzeugs (P14).
    this.#pickups.frustumCulled = false;
    this.#writePickups();
  }

  #instance(geometry: BufferGeometry, count: number, name: string): InstancedMesh {
    this.#geometries.push(geometry);
    const mesh = new InstancedMesh(geometry, this.#material!, Math.max(1, count));
    mesh.name = name;
    mesh.count = count;
    mesh.castShadow = false;
    this.#group.add(mesh);
    return mesh;
  }

  #writePickups(): void {
    const mesh = this.#pickups;
    if (!mesh) return;
    for (let i = 0; i < this.#pickupPos.length; i++) {
      const p = this.#pickupPos[i]!;
      this.#quat.setFromAxisAngle(this.#up, this.#spin + i * 0.7);
      // Eingesammelte Stücke wandern unter die Welt statt `count` zu ändern:
      // `count` verkleinern hieße, die Liste umzusortieren, und dann stimmt die
      // Zuordnung Position ↔ Instanz nicht mehr.
      this.#matrix.compose(
        p.back > 0 ? this.#zero : POINT.set(p.x, p.y, p.z),
        this.#quat,
        this.#scale,
      );
      mesh.setMatrixAt(i, this.#matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Prüfen, ob das Fahrzeug ein Stück eingesammelt hat.
   *
   * **Lineare Suche über 90 Einträge, je Frame.** Das ist absichtlich die
   * einfachste mögliche Lösung: 90 Abstandsquadrate kosten gemessen unter
   * 0,002 ms, und ein Raster dafür wäre Code, der eine Frage beantwortet, die
   * niemand gestellt hat. Wenn die Zahl je dreistellig wird, steht hier ein
   * Raster — vorher nicht.
   */
  collect(x: number, z: number, dt: number): number {
    let taken = 0;
    const r2 = PICKUPS.radius * PICKUPS.radius;
    for (const p of this.#pickupPos) {
      if (p.back > 0) {
        p.back -= dt;
        continue;
      }
      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz <= r2) {
        p.back = PICKUPS.respawn;
        taken++;
      }
    }
    return taken;
  }

  /** Ist der Punkt in einer Driftzone? Gibt den Multiplikator zurück, sonst 1. */
  driftBonusAt(x: number, z: number): number {
    for (const zone of DRIFT_ZONES) {
      const dx = x - zone.x;
      const dz = z - zone.z;
      if (dx * dx + dz * dz <= zone.radius * zone.radius) return zone.bonus;
    }
    return 1;
  }

  /** Name der Driftzone an dieser Stelle, oder `null`. */
  zoneNameAt(x: number, z: number): string | null {
    for (const zone of DRIFT_ZONES) {
      const dx = x - zone.x;
      const dz = z - zone.z;
      if (dx * dx + dz * dz <= zone.radius * zone.radius) return zone.name;
    }
    return null;
  }

  update(dt: number): void {
    if (!this.#pickups) return;
    // Die Stücke drehen sich. Das ist die billigste Art, ein Ding als
    // „einsammelbar" zu kennzeichnen — jedes Spiel seit 1991 macht es so, und
    // zwar weil es funktioniert: bewegte Dinge ziehen den Blick.
    this.#spin += dt * 1.8;
    this.#writePickups();
  }

  dispose(): void {
    this.#group.removeFromParent();
    for (const geometry of this.#geometries) geometry.dispose();
    this.#geometries.length = 0;
    this.#trees?.dispose();
    this.#flags?.dispose();
    this.#pickups?.dispose();
    this.#material?.dispose();
    this.#material = null;
  }
}

const POINT = new Vector3();

/** `1` bei einem Winkel, an dem ein Vielfaches liegt — deterministisch aus xz. */
function hash(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Ein Kirschbaum — Stamm plus drei versetzte Kronenblöcke.
 *
 * **Kein Blattwerk, keine Textur.** Die Karte lebt vom Licht und nicht von der
 * Geometrie (SPEC, Leitprinzip); ein rosa Block in der blauen Stunde liest sich
 * auf 200 m als Kirschbaum, und ein Alphatest-Blatt kostet zehnmal so viel.
 */
function createSakura(): BufferGeometry {
  return mergeBoxes([
    box(0.36, 2.4, 0.36, 0, 1.2, 0, SAKURA_TRUNK),
    box(4.4, 1.5, 4.4, 0, 3.1, 0, SAKURA_BLOOM),
    box(3.2, 1.3, 3.2, 0.5, 4.1, -0.3, SAKURA_BLOOM),
    box(2.2, 1.0, 2.2, -0.6, 4.8, 0.4, SAKURA_BLOOM),
  ]);
}

/** Eine Fahne — Mast plus Tuch. Das Tuch ist eine dünne Platte, keine Fläche. */
function createFlag(): BufferGeometry {
  return mergeBoxes([
    box(0.14, 4.6, 0.14, 0, 2.3, 0, FLAG_POLE),
    box(0.04, 1.5, 2.2, 0, 3.7, 1.1, FLAG_CLOTH),
  ]);
}

/**
 * Ein Sammelstück — ein Oktaeder als zwei Pyramiden.
 *
 * Es ist absichtlich **keine Münze**: eine flache Scheibe verschwindet, sobald
 * man sie von der Kante sieht, und das ist genau der Blickwinkel eines Fahrers.
 * Ein Oktaeder hat aus jeder Richtung eine Silhouette.
 */
function createToken(): BufferGeometry {
  const h = 0.85;
  const r = 0.55;
  const positions: number[] = [];
  const colors: number[] = [];
  const c = new Color(PICKUP_COLOR);
  const ring: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;
    ring.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = 0; i < 6; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % 6]!;
    // Oben und unten. Reihenfolge so, dass beide Hälften nach außen zeigen.
    positions.push(ax, 0, az, bx, 0, bz, 0, h, 0);
    positions.push(bx, 0, bz, ax, 0, az, 0, -h, 0);
    for (let k = 0; k < 6; k++) colors.push(c.r, c.g, c.b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(Float32Array.from(colors), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

interface BoxSpec {
  readonly positions: number[];
  readonly colors: number[];
}

/**
 * Ein achsenparalleler Kasten als rohe Dreiecke.
 *
 * Ohne `BoxGeometry` und ohne `mergeGeometries`, weil beides einen Import aus
 * `three/examples` bräuchte und dieses Projekt seine Geometrie ohnehin selbst
 * baut (`carMesh.ts`, `landmarkMeshes.ts`). Zwölf Dreiecke sind zwölf Dreiecke.
 */
function box(
  w: number,
  h: number,
  d: number,
  ox: number,
  oy: number,
  oz: number,
  hex: number,
): BoxSpec {
  const x0 = ox - w / 2;
  const x1 = ox + w / 2;
  const y0 = oy - h / 2;
  const y1 = oy + h / 2;
  const z0 = oz - d / 2;
  const z1 = oz + d / 2;
  const v = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
  const faces: [number, number, number][][] = [
    [v(x0, y1, z0), v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0)], // oben
    [v(x0, y0, z1), v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1)], // unten
    [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)], // +z
    [v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0)], // −z
    [v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1)], // +x
    [v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)], // −x
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  const c = new Color(hex);
  for (const [a, b, cc, dd] of faces as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ][]) {
    positions.push(...a, ...b, ...cc, ...a, ...cc, ...dd);
    for (let k = 0; k < 6; k++) colors.push(c.r, c.g, c.b);
  }
  return { positions, colors };
}

function mergeBoxes(specs: BoxSpec[]): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const spec of specs) {
    positions.push(...spec.positions);
    colors.push(...spec.colors);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(Float32Array.from(colors), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
