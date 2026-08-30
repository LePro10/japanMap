import {
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Scene,
} from 'three';

import { vehicleSpec, type VehicleId, type VehicleSpec } from '@/config/vehicles.config';
import { ARCADE, latAccel, topSpeed } from '@/config/arcade.config';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import type { RoadNetwork } from '@/world/roads/RoadNetwork';
import type { TerrainSampler } from '@/world/TerrainSampler';
import { PropMaterial } from '@/world/materials/PropMaterial';
import { createCarBody, createCarWheel } from './carMesh';
import type { CollisionWorld } from './CollisionWorld';
import { RoadGround } from './RoadGround';
import { Vehicle } from './Vehicle';
import type { WaterField } from './WaterField';
import { RaceLine } from './ai/RaceLine';
import { RivalDriver, type RivalSkill } from './ai/RivalDriver';

/**
 * Das Gegnerfeld — P23.
 *
 * ## Warum die Gegner echte Fahrzeuge sind
 *
 * Die Begründung steht im Kopf von `RivalDriver` und ist die halbe Miete dieser
 * Phase: ein Gegner, der auf einer Linie interpoliert wird, lässt sich nicht
 * rammen, driftet nicht, fliegt nicht über eine Kuppe und ist auf dem Reisfeld
 * genauso schnell wie auf Asphalt. Hier laufen `Vehicle`-Instanzen mit derselben
 * Physik, demselben Gelände und derselben Kollisionswelt wie der Spieler.
 *
 * ## Je Gegner ein eigener `RoadGround`
 *
 * **Das ist keine Kleinigkeit, sondern die Ursache, aus der `RoadGround`
 * überhaupt entstanden ist.** Der Straßenzusammenhang (Fahrbahnebene,
 * Höhenkorrektur, Belag) wird je Schritt für *eine* Position gebildet. Teilten
 * sich vier Fahrzeuge einen, führen drei davon auf der Ebene, die am vierten
 * gebildet wurde — in der Stadt wären das drei Wagen einen Meter unter dem
 * Asphalt. Die vollständige Begründung steht im Kopf von `RoadGround`.
 *
 * Geteilt werden dagegen Terrain, Wasserfeld und Kollisionswelt: sie sind
 * **Daten**, kein Zustand.
 *
 * ## Was die Gegner nicht tun
 *
 * Sie stehen **nicht** in der Kollisionswelt. Ein Spieler kann sie also
 * durchfahren, und sie sich gegenseitig. Das ist eine Entscheidung mit
 * Begründung: `CollisionWorld` ist ein statisches Raster, das einmal je
 * Weltänderung aufgebaut wird (`beginDynamic` nimmt nur die Baumstämme im
 * 12-m-Umkreis auf). Vier bewegte Rechtecke je Schritt einzutragen hieße, die
 * Abfragestruktur zu einer dynamischen zu machen — und damit die
 * Kollisionsauflösung anzufassen, die P19 bis P21 mühsam stabil bekommen haben.
 *
 * Der Preis ist ehrlich: **man fährt durch die Gegner hindurch.** Auf einem
 * Portal ist das der übliche Kompromiss (Rammschaden verlangt Netzcode-Qualität
 * an Kollisionsauflösung, sonst schleudern beide Autos in die Landschaft), und
 * er kostet weniger als ein Rennen, in dem der Spieler an Gegner klebt.
 */

/** Wie viele Gegner höchstens gleichzeitig fahren. */
export const MAX_RIVALS = 3;

/**
 * Obergrenze des Zieltempos einer Ideallinie, m/s.
 *
 * 36 m/s ≙ 130 km/h. Begründung bei `buildLine`; die Kurzfassung: über diesem
 * Tempo entscheidet auf dieser Karte nicht mehr die Kurve, sondern die
 * Bodenwelle.
 */
const LINE_SPEED_CAP = 36;

/**
 * So lange darf ein Gegner ohne Fortschritt bleiben, bevor er zurückgesetzt
 * wird, in Sekunden — und so weit muss er dabei kommen, in Metern.
 *
 * Fünf Sekunden und drei Meter, also dieselben Zahlen wie beim Spieler
 * (`DriveSystem`: `RESCUE_DELAY`, `RESCUE_FREE`). Sie stehen hier noch einmal
 * und werden nicht importiert: dort begründen sie sich aus dem *Rangieren* eines
 * Menschen (»wer nach fünf Sekunden noch steht, hat es dreimal versucht«), hier
 * aus der Sichtbarkeit (»ein Gegner, der fünf Sekunden steht, ist aus dem
 * Rennen«). Gleiche Zahl, zwei Begründungen — und wenn eine davon sich ändert,
 * soll die andere stehen bleiben.
 */
const RESCUE_DELAY = 5;
const RESCUE_DISTANCE = 3;

/**
 * Lackierungen der Gegner.
 *
 * Kräftige, gegeneinander unterscheidbare Töne — auf 150 m Entfernung in der
 * blauen Stunde soll man sehen, *welcher* Gegner vorn liegt. Die Palette der
 * Karte ist kühl, deshalb sind drei der vier warm.
 */
const RIVAL_PAINT: readonly { paint: number; dark: number }[] = [
  { paint: 0xc8102e, dark: 0x2a1216 },
  { paint: 0x1e8fd5, dark: 0x101d28 },
  { paint: 0xe0b400, dark: 0x2b2410 },
];

/** Können, Fahrspur und Gummiband je Startplatz. */
const SKILLS: readonly RivalSkill[] = [
  { pace: 0.98, lane: -1.4, rubber: 1.0 },
  { pace: 0.95, lane: 1.6, rubber: 0.85 },
  { pace: 0.92, lane: -0.2, rubber: 0.7 },
];

interface Rival {
  readonly vehicle: Vehicle;
  /** Sekunden ohne nennenswerten Fortschritt — die Rettungswache. */
  stuck: number;
  /** Fortschritt beim letzten Zurücksetzen der Wache. */
  stuckMark: number;
  readonly driver: RivalDriver;
  readonly ground: RoadGround;
  readonly body: Mesh;
  readonly wheels: InstancedMesh;
  readonly geometries: BufferGeometry[];
  /** Gefahrene Strecke insgesamt, m — Bogenlänge plus Runde × Streckenlänge. */
  progress: number;
  laps: number;
  finished: boolean;
  finishTime: number;
  name: string;
}

export class RivalField {
  readonly #group = new Group();
  readonly #rivals: Rival[] = [];
  #material: PropMaterial | null = null;
  #scene: Scene | null = null;
  #line: RaceLine | null = null;

  readonly #matrix = new Matrix4();
  readonly #quat = new Quaternion();
  readonly #spin = new Quaternion();
  readonly #steer = new Quaternion();
  readonly #wheelAxis = new Vector3(1, 0, 0);
  readonly #yAxis = new Vector3(0, 1, 0);
  readonly #scale = new Vector3(1, 1, 1);

  attach(scene: Scene, atmosphere: AtmosphereUniforms): void {
    this.#scene = scene;
    this.#group.name = 'Gegner';
    this.#group.visible = false;
    const material = new PropMaterial(atmosphere);
    material.name = 'GegnerMaterial';
    material.roughness = 0.42;
    material.metalness = 0.15;
    this.#material = material;
    scene.add(this.#group);
  }

  get count(): number {
    return this.#rivals.length;
  }

  get active(): boolean {
    return this.#group.visible;
  }

  /**
   * Die Ideallinie einer Strecke bauen.
   *
   * Gerechnet wird sie mit den Kennzahlen des **schnellsten** Gegners und nicht
   * mit denen des Spielerfahrzeugs: sie ist eine Eigenschaft der Strecke plus
   * des Fahrzeugs, das sie fährt, und die Gegner fahren alle dasselbe.
   */
  static buildLine(network: RoadNetwork, roadId: string, id: VehicleId): RaceLine | null {
    const road = network.roads.find((r) => r.id === roadId);
    const points = network.getRacingLine(roadId);
    if (!road || !points) return null;
    const arcade = ARCADE[id];
    return new RaceLine(points, {
      /**
       * **Mit Reserve, und die ist gemessen.** Die volle Querbeschleunigung des
       * Fahrzeugs (1,45 g) gilt auf ebenem Asphalt; die Straßen dieser Karte
       * folgen dem Gelände und haben Wellen von 15…25 cm auf 1,5 m Texelabstand.
       * Ein Fahrer, der genau auf der Haftgrenze fährt, verliert bei der ersten
       * Welle die Radlast.
       *
       * Gemessen mit dem vollen Wert: die Gegner der Ringstraße waren **97 % der
       * Zeit im Gelände**, bis zu 22 m neben der Linie, und kamen in drei Minuten
       * 597 m weit. Die Messreihe über den Faktor (Ringstraße, 180 s, Anteil
       * neben der Fahrbahn / zurückgelegter Weg):
       *
       * | Faktor | neben der Straße | Weg |
       * |---:|---:|---:|
       * | 1,00 | 97 % | 597 m |
       * | 0,70 | 32 % | 3888 m |
       * | **0,65** | **26 %** | **3900 m** |
       * | 0,58 | 23 % | 3786 m |
       *
       * Unter 0,65 kauft jeder weitere Schritt kaum noch Spurtreue und kostet
       * Tempo — und ein Gegner, der nicht mithält, ist kein Gegner.
       */
      latAccel: latAccel(arcade) * 0.65,
      // Bremsen darf über der Querbeschleunigung liegen — das ist im
      // Arcade-Modell ausdrücklich erlaubt (`ArcadeSpec.brakeG`).
      brakeAccel: arcade.brakeG * 9.81 * 0.85,
      // Beschleunigung aus der Anfahrkraft; sie ist bei hohem Tempo kleiner,
      // aber der Vorwärtslauf ist ohnehin nur die schwächere der beiden
      // Schranken.
      driveAccel: 4.5,
      crestAccel: 0.5,
      /**
       * Der Deckel ist die Endgeschwindigkeit des Fahrzeugs — **und ein
       * Straßenlimit darüber**.
       *
       * `LINE_SPEED_CAP` ist keine Fahrzeugeigenschaft, sondern eine Aussage
       * über die Karte: die Ringstraße ist 8,5 m breit und liegt auf einem
       * Höhenfeld mit 1,5 m Raster. Die Krümmungsrechnung erlaubt dort bis zu
       * 238 km/h; wer das fährt, springt bei der ersten Kuppe. Ein Spieler darf
       * das (es ist sein Auto), ein Gegner soll es nicht.
       */
      maxSpeed: Math.min(topSpeed(arcade), LINE_SPEED_CAP),
      closed: road.closed,
    });
  }

  /**
   * Das Feld aufstellen.
   *
   * `startArc` ist die Bogenlänge der Startlinie; die Gegner stehen dahinter,
   * versetzt in Reihen von zwei — dieselbe Aufstellung wie auf einer echten
   * Startaufstellung, und aus demselben Grund: nebeneinander stehende Wagen
   * behindern sich in der ersten Kurve, hintereinander stehende nicht.
   */
  spawn(
    line: RaceLine,
    startArc: number,
    count: number,
    id: VehicleId,
    sampler: TerrainSampler,
    network: RoadNetwork,
    water: WaterField,
    collision: CollisionWorld,
  ): void {
    this.clear();
    this.#line = line;
    const scene = this.#scene;
    const material = this.#material;
    if (!scene || !material) return;

    const base = vehicleSpec(id);
    for (let i = 0; i < Math.min(count, MAX_RIVALS); i++) {
      const paint = RIVAL_PAINT[i % RIVAL_PAINT.length]!;
      const spec: VehicleSpec = {
        ...base,
        body: { ...base.body, paint: paint.paint, paintDark: paint.dark },
      };
      const vehicle = new Vehicle(spec);
      const ground = new RoadGround();
      ground.setSources(sampler, network, water, collision);

      const skill = SKILLS[i % SKILLS.length]!;
      const driver = new RivalDriver(line, skill);

      const bodyGeometry = createCarBody(spec);
      const wheelGeometry = createCarWheel(spec);
      const body = new Mesh(bodyGeometry, material);
      body.name = `Gegner:${i}`;
      body.matrixAutoUpdate = false;
      const wheels = new InstancedMesh(wheelGeometry, material, 4);
      wheels.name = `Gegner:${i}:Räder`;
      wheels.matrixAutoUpdate = false;
      // Dieselbe Begründung wie beim Spielerfahrzeug: die Hüllkugel wird nie
      // aktualisiert, weil die Instanzmatrizen jeden Frame wechseln.
      wheels.frustumCulled = false;
      this.#group.add(body, wheels);

      // Aufstellung: 8 m Abstand längs, ±2,2 m quer, abwechselnd.
      const arc = startArc - 8 - i * 8;
      line.pointAt(arc, POINT);
      const ti = line.indexAt(arc);
      const tx = line.tangent[ti * 2]!;
      const tz = line.tangent[ti * 2 + 1]!;
      const side = i % 2 === 0 ? -2.2 : 2.2;
      const x = POINT.x - tz * side;
      const z = POINT.z + tx * side;
      ground.refresh(x, z, 0);
      vehicle.respawn(x, z, Math.atan2(tx, tz), ground);
      driver.placeAt(arc);

      this.#rivals.push({
        vehicle,
        driver,
        ground,
        body,
        wheels,
        geometries: [bodyGeometry, wheelGeometry],
        progress: arc,
        stuck: 0,
        stuckMark: 0,
        laps: 0,
        finished: false,
        finishTime: 0,
        name: RIVAL_NAMES[i % RIVAL_NAMES.length]!,
      });
    }
    this.#group.visible = true;
  }

  /**
   * Einen Simulationsschritt für alle Gegner.
   *
   * `playerProgress` ist die Gesamtstrecke des Spielers; daraus entsteht das
   * Gummiband. `collision` ist dieselbe Welt wie beim Spieler — die Gegner
   * stoßen also an dieselben Leitplanken und Bäume.
   */
  step(dt: number, playerProgress: number, collision: CollisionWorld, racing: boolean): void {
    const line = this.#line;
    if (!line || !this.#group.visible) return;

    for (const rival of this.#rivals) {
      const car = rival.vehicle;
      rival.ground.refresh(car.position.x, car.position.z, dt);

      // Vor dem Start stehen sie mit der Bremse — sonst rollen sie beim
      // Countdown an, und ein Gegner, der vor dem Start losfährt, ist der
      // erste Eindruck, den niemand vergisst.
      const input = racing
        ? rival.driver.drive(
            dt,
            car.position,
            car.yaw,
            car.telemetry.speed,
            this.#catchUp(rival, playerProgress),
          )
        : HOLD;
      car.step(dt, input, rival.ground, collision);
      // **Die Brüche werden abgeholt und weggeworfen.** Ein Gegner, der eine
      // Planke umfährt, soll sie umfahren — aber die Trümmer und das
      // Baum-Loch gehören dem Spieler-FX. Ohne dieses `consumeBreaks()` wächst
      // die Liste unbegrenzt; genau davor warnt ihr eigener Kommentar.
      car.consumeBreaks();

      if (!racing) continue;
      // **Der Fortschritt ist der aufsummierte Weg und keine Rechnung aus
      // Runde und Bogenlänge.** Begründung samt Messung bei `RaceLine.delta()`.
      rival.progress = rival.driver.distance;
      rival.laps = Math.max(0, Math.floor(rival.progress / line.length));
      this.#watchStuck(dt, rival, line);
    }
  }

  /**
   * Die Rettungswache für Gegner — dieselbe Zusicherung wie beim Spieler.
   *
   * ## Warum sie sein muss, obwohl der Regler gut ist
   *
   * Die Straßen dieser Karte sind ins Gelände **geschnitten** (P3): neben der
   * Fahrbahn steht stellenweise eine Böschung, die steiler ist als alles, was
   * ein Auto hochkommt — `slopeSupport` (P21) nimmt dort die Radlast, und das
   * ist richtig so. Ein Gegner, der dort landet, kommt aus eigener Kraft nie
   * wieder heraus.
   *
   * Gemessen auf der Ringstraße bei Bogenlänge 665: der Führende stand
   * **140 Sekunden** 20 m neben der Fahrbahn, Gas voll, Tempo 5 km/h, null
   * Kontakte. Vier Fassungen des Reglers haben daran nichts geändert, und das
   * war der Hinweis: es ist kein Regelproblem, sondern ein Geländeproblem.
   *
   * ## Warum sie nicht geometrisch ist
   *
   * Dieselbe Begründung wie bei `DriveSystem.#watchStuck`, wörtlich: gemessen
   * wird die einzige Größe, die auch ein Zuschauer sieht — *ist er von der
   * Stelle gekommen*. Ein Gegner, der an einer Planke entlangschrammt, fährt;
   * einer, der drei Meter in fünf Sekunden schafft, nicht.
   *
   * ## Was sie nicht darf
   *
   * Sie setzt den Gegner an **seine eigene Bogenlänge** zurück, nicht nach vorn.
   * Ein Gegner, der sich durch Feststecken einen Vorsprung erschleicht, ist die
   * Sorte Betrug, die ein Spieler sofort sieht — und dann ist das Rennen als
   * Ganzes nicht mehr glaubwürdig.
   */
  #watchStuck(dt: number, rival: Rival, line: RaceLine): void {
    if (rival.progress - rival.stuckMark > RESCUE_DISTANCE) {
      rival.stuck = 0;
      rival.stuckMark = rival.progress;
      return;
    }
    rival.stuck += dt;
    if (rival.stuck < RESCUE_DELAY) return;

    const arc = rival.driver.arc;
    line.pointAt(arc, POINT);
    const i = line.indexAt(arc);
    const tx = line.tangent[i * 2]!;
    const tz = line.tangent[i * 2 + 1]!;
    rival.ground.refresh(POINT.x, POINT.z, 0);
    rival.vehicle.respawn(POINT.x, POINT.z, Math.atan2(tx, tz), rival.ground);
    rival.driver.placeAt(arc, rival.progress);
    rival.stuck = 0;
    rival.stuckMark = rival.progress;
  }

  /**
   * Das Gummiband — ein Faktor auf das Solltempo.
   *
   * Begründung im Kopf von `RivalDriver`: verschoben wird das **Tempo**, nie die
   * Position. Der Deckel liegt bei ±12 %; darüber schaltet sich das Band im Bild
   * sichtbar an und ab.
   */
  #catchUp(rival: Rival, playerProgress: number): number {
    const behind = playerProgress - rival.progress;
    // 80 m Rückstand → voller Zuschlag, 80 m Vorsprung → voller Abschlag.
    return 1 + clamp(behind / 80, -1, 1) * 0.12;
  }

  /**
   * Innenansicht des Feldes — **nur für Prüfstände**.
   *
   * Sie steht hier und nicht in einem Debug-Modul, weil sie private Felder liest.
   * Ein Prüfstand, der Zahlen aus einer nachgebauten Schleife nimmt statt aus der
   * echten, misst sich selbst — dieselbe Begründung wie bei `simulateStep`.
   */
  debug(): { off: number; cross: number; hErr: number; kmh: number; arc: number; dist: number; thr: number; brk: number; steer: number; surf: string; cont: number; air: boolean }[] {
    const line = this.#line;
    return this.#rivals.map((r) => {
      let off = -1;
      if (line) {
        const P = { x: 0, y: 0, z: 0 };
        line.pointAt(r.driver.arc, P);
        off = Math.hypot(P.x - r.vehicle.position.x, P.z - r.vehicle.position.z);
      }
      return {
      off: +off.toFixed(1),
      cross: +r.driver.cross.toFixed(1),
      hErr: +((r.driver.headingError * 180) / Math.PI).toFixed(0),
      kmh: +(r.vehicle.telemetry.speed * 3.6).toFixed(1),
      arc: +r.driver.arc.toFixed(0),
      dist: +r.driver.distance.toFixed(0),
      thr: +r.driver.input.throttle.toFixed(2),
      brk: +r.driver.input.brake.toFixed(2),
      steer: +r.driver.input.steer.toFixed(2),
      surf: r.vehicle.telemetry.surface,
      cont: r.vehicle.telemetry.contacts,
      air: r.vehicle.telemetry.airborne,
    };
    });
  }

  /** Weltposition eines Gegners — für die Positionsanzeige und die Minikarte. */
  positionOf(index: number): Vector3 | null {
    return this.#rivals[index]?.vehicle.position ?? null;
  }

  get standings(): readonly { name: string; progress: number; finished: boolean }[] {
    return this.#rivals.map((r) => ({
      name: r.name,
      progress: r.progress,
      finished: r.finished,
    }));
  }

  markFinished(index: number, time: number): void {
    const rival = this.#rivals[index];
    if (rival && !rival.finished) {
      rival.finished = true;
      rival.finishTime = time;
    }
  }

  /** Meshes an die Physik hängen — je Frame, im variablen Schritt. */
  render(): void {
    if (!this.#group.visible) return;
    for (const rival of this.#rivals) {
      const car = rival.vehicle;
      rival.body.position.copy(car.position);
      rival.body.quaternion.copy(car.quaternion);
      rival.body.updateMatrix();

      const positions = car.wheelPositions;
      const steerAngle = car.telemetry.steerAngle;
      const spin = car.wheelSpinAngle;
      for (let i = 0; i < 4; i++) {
        this.#quat.copy(car.quaternion);
        if (i < 2) {
          this.#steer.setFromAxisAngle(this.#yAxis, -steerAngle);
          this.#quat.multiply(this.#steer);
        }
        this.#spin.setFromAxisAngle(this.#wheelAxis, spin);
        this.#quat.multiply(this.#spin);
        this.#matrix.compose(positions[i]!, this.#quat, this.#scale);
        rival.wheels.setMatrixAt(i, this.#matrix);
      }
      rival.wheels.instanceMatrix.needsUpdate = true;
    }
  }

  hide(): void {
    this.#group.visible = false;
  }

  clear(): void {
    for (const rival of this.#rivals) {
      this.#group.remove(rival.body, rival.wheels);
      rival.wheels.dispose();
      for (const geometry of rival.geometries) geometry.dispose();
    }
    this.#rivals.length = 0;
    this.#group.visible = false;
    this.#line = null;
  }

  dispose(): void {
    this.clear();
    this.#scene?.remove(this.#group);
    this.#material?.dispose();
    this.#material = null;
    this.#scene = null;
  }
}

const POINT = { x: 0, y: 0, z: 0 };

/**
 * Eingabe „stehen bleiben" — vor dem Start und im Ziel.
 *
 * **Ohne Bremse und nur mit Handbremse**, und das ist keine Kosmetik: die
 * Bremse legt im Stand den Rückwärtsgang ein (kein Gangwahlschalter, siehe
 * `ArcadeDynamics.#longitudinal`). Mit `brake: 1` fuhr das ganze Feld den
 * Countdown über rückwärts aus der Startaufstellung heraus.
 */
const HOLD = { throttle: 0, brake: 0, steer: 0, handbrake: true, boost: false };

/**
 * Namen der Gegner.
 *
 * Sie stehen in der Positionsanzeige, und sie sind der billigste Weg, aus drei
 * bunten Kästen drei *Gegner* zu machen: „P2 AOKI" liest sich anders als
 * „P2 Rival 1". Japanische Nachnamen, passend zur Karte.
 */
const RIVAL_NAMES: readonly string[] = ['AOKI', 'KUROSE', 'TAKAMI'];

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
