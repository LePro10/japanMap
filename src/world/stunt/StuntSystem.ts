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
import { PetalFall } from './PetalFall';
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
/** Der dunklere Ton der Querbalken. Begründung an der Stelle, die ihn setzt. */
const RAMP_COLOR_DARK = 0x7d2f1e;
const RAMP_EDGE_COLOR = 0xe6d8c0;
const SAKURA_TRUNK = 0x4a3b30;
/**
 * Drei Blütentöne statt eines.
 *
 * > **Ein Ton war der Grund, warum die Kronen wie Schilder aussahen.** Auf
 * > `.cache/shots/drift.png` (P25) stehen sie als flache rosa Platten in der
 * > Landschaft — und das lag nicht an der Kastenform, sondern daran, dass
 * > *alle* Flächen eines Baums dieselbe Farbe tragen. In der blauen Stunde
 * > steht die Sonne 2,23° über dem Horizont; zwischen einer waagerechten und
 * > einer senkrechten Fläche liegt dann kaum ein Helligkeitsunterschied, und
 * > ohne Farbunterschied auch keiner im Bild. Eine Krone braucht deshalb ihre
 * > Tiefe **in der Farbe**, nicht im Licht: oben hell, unten im Eigenschatten.
 */
const SAKURA_TOP = 0xf7c6d8;
const SAKURA_MID = 0xe49dba;
const SAKURA_LOW = 0xb06e8c;
const FLAG_POLE = 0xd8d4cc;
const FLAG_CLOTH = 0xd83a3a;
const FLAG_CLOTH_DARK = 0x9e2626;
const PICKUP_COLOR = 0xffd257;

/** Stützpunkte des Zonenrings. 96 sind bei 62 m Radius alle 4,1 m einer. */
const ZONE_RING_STEPS = 96;
/** Breite des Bandes, m. Eine Fahrbahn ist 7 m breit — das hier ist kein Weg. */
const ZONE_RING_WIDTH = 2.6;
/** Wie hoch über dem Boden. Begründung bei `#buildZoneRings`. */
const ZONE_RING_LIFT = 0.12;
const ZONE_RING_INNER = 0xf7c6d8;
const ZONE_RING_OUTER = 0xb84a72;

/**
 * Wie lange der Aufsammel-Effekt dauert, s.
 *
 * 0,35 s: lang genug, dass man es aus dem Augenwinkel sieht, kurz genug, dass
 * es bei 90 Stücken je Runde nicht zum Dauerflackern wird. Der Ton dazu ist
 * 90 ms lang — das Bild darf länger stehen als der Ton, umgekehrt nicht.
 */
const POP_TIME = 0.35;

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
  #rings: Mesh | null = null;
  #trees: InstancedMesh | null = null;
  #flags: InstancedMesh | null = null;
  #pickups: InstancedMesh | null = null;
  readonly #petals = new PetalFall();

  /** Weltpositionen der Sammelstücke und ihre Wiederkehr-Uhr. */
  readonly #pickupPos: { x: number; y: number; z: number; back: number }[] = [];
  /** Standort und Ruhewinkel jeder Fahne — für den Wind, siehe `#waveFlags`. */
  readonly #flagPos: { x: number; y: number; z: number; turn: number }[] = [];
  readonly #geometries: BufferGeometry[] = [];
  readonly #matrix = new Matrix4();
  readonly #quat = new Quaternion();
  readonly #scale = new Vector3(1, 1, 1);
  readonly #zero = new Vector3(0, -1000, 0);
  readonly #up = new Vector3(0, 1, 0);
  #spin = 0;
  #wind = 0;

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
    this.#buildZoneRings();
    this.#buildZones();
    this.#buildPickups();
    const sampler = this.#sampler;
    this.#petals.build(scene, (x, z) => sampler.getHeightAt(x, z));
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
    const bodyDark = new Color(RAMP_COLOR_DARK);

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
          if (isLip) {
            color.copy(edge);
          } else if (lift <= 0.05) {
            // Der Saum im Gelände — er soll nicht mitleuchten.
            color.copy(body);
          } else {
            // ── Randstreifen und Querbalken — P25 ────────────────────────
            //
            // Der erste Entwurf war eine einfarbige rote Fläche, und im Bild
            // (`.cache/shots/rampe.png`) sah sie wie ein hingelegtes Tuch aus:
            // eine Schräge ohne Struktur gibt dem Auge nichts, woran es die
            // Neigung ablesen könnte. Zwei Muster beheben das, und beide
            // kosten **nichts** — sie sind Vertexfarben auf dem Raster, das
            // ohnehin da ist:
            //
            //  1. **Randstreifen** hell an beiden Seiten. Sie zeichnen die
            //     Kante nach, an der man herunterfällt, wenn man schief
            //     anfährt — die Angabe, die beim Zielen zählt.
            //  2. **Querbalken** über die Auffahrt, abwechselnd dunkler. Sie
            //     laufen mit der Perspektive zusammen und sagen damit im Bild,
            //     wie steil es ist.
            //
            // Die Farben werden zwischen den Stützpunkten interpoliert, die
            // Balken sind also weich. Das ist hier richtig: harte Kanten
            // bräuchten die doppelte Zahl an Stützpunkten und ergäben ein
            // Warnschild statt einer Schanze.
            // **Spalte 1 und `ACROSS − 2`, nicht 0 und `ACROSS − 1`.** Die
            // äußersten beiden Spalten liegen auf dem Saum (`RAMP_SKIRT`), und
            // dort ist `lift` null — sie fallen also schon in den Zweig
            // darüber. Ein Randstreifen auf ihnen wäre eine Bedingung, die nie
            // wahr wird: dieselbe Klasse wie die drei toten Stellschrauben
            // dieses Projekts, nur beim Hinschreiben bemerkt statt nach Monaten.
            const randnah = c <= 1 || c >= RAMP_GRID_ACROSS - 2;
            const balken = a % 4 < 2;
            color.copy(randnah ? edge : balken ? bodyDark : body);
          }
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

  // ── Driftzonen: der Bodenring ───────────────────────────────────────────

  /**
   * Ein Band auf dem Boden entlang der Zonengrenze — P25.
   *
   * ## Warum der Baumring allein nicht genügt
   *
   * Im Kopf von `#buildZones` steht, ein Kreis aus rosa Kronen sei auf 200 m
   * eindeutig und eine Bodenmarkierung nicht. Das stimmt für die Frage *wo ist
   * die Zone* — und es ist die falsche Frage für den, der schon drin ist.
   *
   * Gemessen an `.cache/shots/drift.png` (P25): der Wagen steht mitten in der
   * Sakura Bowl, die Punkte laufen, und **im Bild ist nichts**, was das sagt.
   * Die Bäume stehen als Ring am Horizont und lassen sich von den Bäumen
   * daneben nicht unterscheiden, sobald man zwischen ihnen ist. Eine Zone, die
   * eine Wertung verdoppelt, muss ihre Grenze zeigen — sonst weiß der Spieler
   * nicht, warum die Punkte aufhören.
   *
   * ## Wie es dem Gelände folgt
   *
   * 96 Stützpunkte auf dem Kreis, jeder mit `getHeightAt` abgetastet und 12 cm
   * darüber gesetzt. Das ist der einzige Weg, der auf dieser Karte trägt: ein
   * ebener Ring stünde in der Sakura Bowl bis zu 3,9 m über bzw. unter dem
   * Boden (die gemessene Höhendifferenz der Zone, siehe `DRIFT_ZONES`).
   *
   * 12 cm und nicht 3 — die Straßendecals dieses Projekts liegen 6 cm über
   * ihrer Fläche, und selbst das war in P6 einmal zu wenig: das gerenderte
   * CDLOD-Gitter liegt zwischen zwei Stützstellen **über** dem Höhenfeld, aus
   * dem es entsteht. Ein Band, das im Gras verschwindet, ist keine Anzeige.
   */
  #buildZoneRings(): void {
    const sampler = this.#sampler;
    const material = this.#material;
    if (!sampler || !material) return;

    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const inner = new Color(ZONE_RING_INNER);
    const outer = new Color(ZONE_RING_OUTER);

    for (const zone of DRIFT_ZONES) {
      const base = positions.length / 3;
      for (let i = 0; i < ZONE_RING_STEPS; i++) {
        const a = (Math.PI * 2 * i) / ZONE_RING_STEPS;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        for (let e = 0; e < 2; e++) {
          const r = zone.radius + (e === 0 ? -ZONE_RING_WIDTH / 2 : ZONE_RING_WIDTH / 2);
          const x = zone.x + ca * r;
          const z = zone.z + sa * r;
          positions.push(x, sampler.getHeightAt(x, z) + ZONE_RING_LIFT, z);
          const c = e === 0 ? inner : outer;
          colors.push(c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < ZONE_RING_STEPS; i++) {
        const j = (i + 1) % ZONE_RING_STEPS;
        const a0 = base + i * 2;
        const a1 = a0 + 1;
        const b0 = base + j * 2;
        const b1 = b0 + 1;
        // Gegen den Uhrzeigersinn von oben — `japanMap.winding()` prüft das,
        // und dieses Projekt hat zwei rückseitige Flächen teuer bezahlt (P8.11).
        indices.push(a0, b0, a1, a1, b0, b1);
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
    mesh.name = 'Driftzonenring';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.#rings = mesh;
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

    this.#flagPos.push(...flags);
    this.#flags = this.#instance(createFlag(), flags.length, 'Fahnen');
    // Wie bei den Sammelstücken: die Matrizen drehen jeden Frame, die Hüllkugel
    // wird nie neu gerechnet. Begründung dort.
    this.#flags.frustumCulled = false;
    this.#waveFlags();
  }

  /**
   * Die Fahnen im Wind — ein Ausschlag um den eigenen Mast.
   *
   * **Warum das eine Matrix ist und kein Shader.** Ein Tuch, das sich
   * *verformt*, bräuchte einen Vertex-Shader wie die Vegetation
   * (`vegetation_wind.vert.glsl`). Für 20 Fahnen ist das der falsche Preis: ein
   * eigenes Material, ein eigener Uniform-Block, eine eigene Stelle zum
   * Vergessen beim `dispose()`. 20 Matrizen je Frame kosten nichts messbares,
   * und der Unterschied im Bild — steht die Fahne oder bewegt sie sich — ist
   * derselbe.
   *
   * Zwei Sinus mit teilerfremden Perioden, plus ein Phasenversatz aus der
   * Position: sonst schlagen alle Fahnen im Gleichtakt, und das liest sich als
   * Mechanik statt als Wind. Denselben Trick benutzt `PetalFall` für die
   * Schwingung der Blätter.
   */
  #waveFlags(): void {
    const mesh = this.#flags;
    if (!mesh) return;
    for (let i = 0; i < this.#flagPos.length; i++) {
      const f = this.#flagPos[i]!;
      const phase = f.x * 0.07 + f.z * 0.11;
      const wave =
        Math.sin(this.#wind * 1.7 + phase) * 0.26 + Math.sin(this.#wind * 2.9 + phase * 1.6) * 0.11;
      this.#quat.setFromAxisAngle(this.#up, f.turn + wave);
      this.#matrix.compose(POINT.set(f.x, f.y, f.z), this.#quat, this.#scale);
      mesh.setMatrixAt(i, this.#matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
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
      // ── Der Aufsammel-Effekt — P25 ──────────────────────────────────
      //
      // P24 hat als offenen Punkt hinterlassen: „die Sammelstücke stehen ohne
      // Ton und ohne Partikel". Der Ton steht seit P25 in `AudioSystem`; das
      // hier ist das Bild dazu — und es kostet **nichts**.
      //
      // Der Trick ist, dass ein eingesammeltes Stück nicht sofort weg sein
      // muss. Es hat ohnehin eine Uhr (`back`), also bekommt der erste Moment
      // davon eine eigene Bedeutung: das Stück wächst, dreht schneller und
      // verschwindet. Kein Partikelsystem, keine zweite Instanzliste, kein
      // Draw-Call — dieselben 90 Instanzen, nur mit einer anderen Matrix.
      const seit = PICKUPS.respawn - p.back;
      if (p.back > 0 && seit < POP_TIME) {
        const t = seit / POP_TIME;
        // Wachsen und dabei ausdünnen. Ein Oktaeder hat keine Deckkraft je
        // Instanz (`PropMaterial` liest die Vertexfarbe), also macht die
        // **Größe** die ganze Arbeit: über 2,6 hinaus liest das Auge es als
        // Blitz und nicht mehr als Gegenstand.
        const s = 1 + t * 1.6;
        this.#scale.set(s, s * 1.35, s);
        // Vierfache Drehgeschwindigkeit — sie ist das, was den Moment vom
        // ruhigen Kreiseln davor unterscheidet.
        this.#quat.setFromAxisAngle(this.#up, this.#spin * 4 + i * 0.7);
        this.#matrix.compose(POINT.set(p.x, p.y + t * 1.2, p.z), this.#quat, this.#scale);
        mesh.setMatrixAt(i, this.#matrix);
        this.#scale.set(1, 1, 1);
        continue;
      }
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
    this.#petals.update(dt);
    this.#wind += dt;
    this.#waveFlags();
    if (!this.#pickups) return;
    // Die Stücke drehen sich. Das ist die billigste Art, ein Ding als
    // „einsammelbar" zu kennzeichnen — jedes Spiel seit 1991 macht es so, und
    // zwar weil es funktioniert: bewegte Dinge ziehen den Blick.
    this.#spin += dt * 1.8;
    this.#writePickups();
  }

  dispose(): void {
    this.#petals.dispose();
    this.#group.removeFromParent();
    for (const geometry of this.#geometries) geometry.dispose();
    this.#geometries.length = 0;
    this.#rings?.removeFromParent();
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
 * Ein Kirschbaum — Stamm, zwei Äste und neun Kronenballen.
 *
 * **Kein Blattwerk, keine Textur.** Die Karte lebt vom Licht und nicht von der
 * Geometrie (SPEC, Leitprinzip); ein rosa Block in der blauen Stunde liest sich
 * auf 200 m als Kirschbaum, und ein Alphatest-Blatt kostet zehnmal so viel.
 *
 * ## Warum aus drei Blöcken neun wurden
 *
 * Die erste Fassung stapelte drei achsenparallele Kästen. Aus der Ferne trug
 * das; aus dem Auto heraus — und da fährt man mitten hindurch — stand ein
 * **Schild** in der Landschaft: eine 4,4 m breite Fläche, die dem Betrachter
 * fast immer eine ihrer vier gleich hellen Seiten zudreht.
 *
 * Drei Dinge zusammen lösen das, und keines davon allein:
 *
 *  1. **Mehr und kleinere Ballen.** Neun Kästen von 1,7…3,4 m ergeben eine
 *     Silhouette mit Ecken statt einer Kante.
 *  2. **Gedreht.** `boxY` dreht um die Hochachse; zwei Kästen mit 30° Versatz
 *     haben aus jeder Richtung eine unregelmäßige Umrisslinie. Achsenparallel
 *     gestapelt bleibt ein Stapel ein Stapel, egal wie viele es sind.
 *  3. **Drei Farbtöne.** Begründung bei `SAKURA_TOP` — in der blauen Stunde
 *     trennt das Licht die Flächen nicht, also muss die Farbe es tun.
 *
 * Kosten, **nachgezählt** und nicht geschätzt (12 Kästen · 12 Dreiecke):
 * 144 Dreiecke je Baum gegen vorher 48, bei 44 Bäumen (24 + 20, siehe
 * `DRIFT_ZONES`) also **6336** in *einem* Draw-Call. Das Budget aus SPEC §4
 * liegt bei 3 Mio.
 *
 * > Hier stand zuerst „22 Kästen … 10 560 Dreiecke". Beides war falsch: die
 * > Funktion hat zwölf Kästen, und Bäume gibt es 44, nicht 40. Die Zahlen waren
 * > beim Schreiben geschätzt statt gezählt — genau der Fehler, den CLAUDE.md
 * > unter „eine Zahl als Begründung geschrieben, ohne sie zu messen" führt,
 * > diesmal nur an einer Kostenangabe und nicht an einer Wirkung.
 */
function createSakura(): BufferGeometry {
  return mergeBoxes([
    // Stamm, leicht geneigt: ein senkrechter Stab ist ein Mast, ein schiefer
    // ein Baum.
    box(0.42, 2.6, 0.42, 0, 1.3, 0, SAKURA_TRUNK),
    boxY(0.3, 1.6, 0.3, 0.55, 2.7, -0.2, 0.5, SAKURA_TRUNK),
    boxY(0.26, 1.4, 0.26, -0.5, 2.6, 0.35, -0.7, SAKURA_TRUNK),

    // Untere Lage — im Eigenschatten der Krone, deshalb der dunkelste Ton.
    boxY(3.9, 0.9, 3.4, 0, 3.15, 0, 0.0, SAKURA_LOW),
    boxY(2.6, 0.8, 3.0, 1.1, 3.35, -0.6, 0.6, SAKURA_LOW),
    boxY(2.4, 0.7, 2.6, -1.15, 3.3, 0.5, -0.5, SAKURA_LOW),

    // Mittlere Lage — die dickste, und um 30° gegen die untere gedreht.
    boxY(4.2, 1.2, 3.8, 0.1, 4.0, 0.1, 0.52, SAKURA_MID),
    boxY(2.8, 1.0, 2.6, -1.3, 4.15, -0.9, -0.35, SAKURA_MID),
    boxY(2.6, 0.9, 3.0, 1.35, 4.05, 0.8, 0.25, SAKURA_MID),

    // Obere Lage — das, was Himmelslicht abbekommt.
    boxY(3.0, 1.0, 2.8, -0.2, 4.95, -0.2, -0.2, SAKURA_TOP),
    boxY(1.9, 0.8, 2.0, 0.95, 5.15, 0.6, 0.7, SAKURA_TOP),
    boxY(1.7, 0.7, 1.7, -0.9, 5.3, 0.7, 0.35, SAKURA_TOP),
  ]);
}

/**
 * Eine Fahne — Mast, Knauf und ein Tuch aus vier Segmenten.
 *
 * ## Warum das Tuch vier Teile hat
 *
 * Die erste Fassung war **eine** Platte, 1,5 × 2,2 m, 4 cm dick. Im Bild war
 * das ein roter Strich: eine ebene Fläche, die von der Seite verschwindet und
 * von vorn ein Rechteck ist. Eine Fahne wird aber gerade daran erkannt, dass
 * sie *nicht* eben ist.
 *
 * Vier Segmente mit wachsendem Versatz und wechselndem Vorzeichen bilden eine
 * stehende Welle nach; das freie Ende schwingt weiter aus als das am Mast, wie
 * bei einem eingespannten Tuch. Die beiden Farbtöne trennen Vorder- und
 * Rückflanke der Welle — dieselbe Begründung wie bei der Krone: in der blauen
 * Stunde trennt das Licht sie nicht.
 *
 * **Die Bewegung selbst steckt nicht hier**, sondern in `#waveFlags()`: die
 * Instanzmatrix dreht die ganze Fahne um ihren Mast. Ein Tuch, das sich
 * *verformt*, bräuchte einen eigenen Shader — und 20 Fahnen sind es nicht wert.
 */
function createFlag(): BufferGeometry {
  const parts = [
    box(0.1, 5.6, 0.1, 0, 2.8, 0, FLAG_POLE),
    // Der Knauf. Er sitzt über dem Tuch und macht aus dem Stab einen Mast.
    box(0.26, 0.26, 0.26, 0, 5.68, 0, FLAG_POLE),
  ];
  // Vier Segmente à 0,7 m, vom Mast weg. Der Ausschlag wächst quadratisch —
  // ein eingespanntes Tuch steht am Mast still und flattert am freien Ende.
  const SEGMENTS = 4;
  for (let i = 0; i < SEGMENTS; i++) {
    const t = (i + 0.5) / SEGMENTS;
    const z = 0.35 + i * 0.7;
    const swing = Math.sin(t * Math.PI * 1.6) * 0.42 * t;
    parts.push(
      boxY(0.05, 1.6, 0.72, swing, 4.35 - t * 0.28, z, swing * 0.5, i % 2 === 0 ? FLAG_CLOTH : FLAG_CLOTH_DARK),
    );
  }
  return mergeBoxes(parts);
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

/**
 * Derselbe Kasten, um die Hochachse gedreht.
 *
 * **Die Drehung ist der Punkt, nicht die Zahl der Kästen.** Ein Stapel
 * achsenparalleler Kästen bleibt aus jeder Richtung ein Stapel Rechtecke — es
 * ist dieselbe Silhouette, nur mit mehr Stufen. Erst der Versatz im Winkel
 * bricht die Umrisslinie, und dafür genügen 20…40°.
 *
 * Gedreht wird **nach** dem Versetzen des Mittelpunkts, damit `ox/oz` in
 * Baumkoordinaten bleiben und nicht im gedrehten System landen — sonst
 * verschiebt jede Winkeländerung zugleich die Position.
 */
function boxY(
  w: number,
  h: number,
  d: number,
  ox: number,
  oy: number,
  oz: number,
  turn: number,
  hex: number,
): BoxSpec {
  const spec = box(w, h, d, 0, oy, 0, hex);
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const p = spec.positions;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!;
    const z = p[i + 2]!;
    p[i] = x * c - z * s + ox;
    p[i + 2] = x * s + z * c + oz;
  }
  return spec;
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
