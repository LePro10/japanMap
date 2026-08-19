import { Euler, Quaternion, Vector3 } from 'three';

import { GRAVITY, SURFACE_FEEL } from '@/config/vehicle.config';
import {
  ENGINE_BRAKE_FLOOR,
  ENGINE_BRAKE_SHARE,
  TOUGE,
  type TireSpec,
  type VehicleSpec,
} from '@/config/vehicles.config';
import {
  RAIL_BREAK_ENERGY,
  RAIL_BREAK_SPEED,
  TREE_BREAK_ENERGY,
  TREE_BREAK_SPEED,
  MAX_BREAKS_PER_STEP,
  shouldBreak,
  type BreakEvent,
} from './breakables';
import { HIT_TREE, type CollisionWorld } from './CollisionWorld';
import {
  isSteep,
  reachableSupport,
  reachableWheel,
  resolveTerrainFollow,
  type FollowState,
} from './supportPlane';

/**
 * Das Fahrmodell — PLAN.md P14, Umsetzung der Entscheidung aus P9.2.
 *
 * ## Was hier modelliert wird und was nicht
 *
 * | Freiheitsgrad | Behandlung |
 * |---|---|
 * | Lage in XZ, Gieren | **dynamisch** — Reifenkräfte, Gierträgheit |
 * | Höhe | **dynamisch** — eine Feder gegen die Ebene durch die vier Radaufstandspunkte |
 * | Nicken, Wanken | **kinematisch** — folgen dem Gelände und der Lastverlagerung, wirken nicht zurück |
 * | Radstellung, Raddrehzahl | **kinematisch** — Anzeige, keine Kraftquelle |
 *
 * Die dritte Zeile ist die eigentliche Entscheidung. Ein Aufbau mit vier
 * unabhängigen Federn und drei dynamischen Drehachsen ist ein gekoppeltes
 * System, dessen Eigenfrequenzen man kennen muss, damit es bei einem
 * Bordsteinkontakt nicht explodiert — und Wanken und Nicken tragen zum
 * *Fahrgefühl* fast nichts bei, das nicht die Lastverlagerung schon leistet. Sie
 * tragen zum **Bild** bei, und dafür genügt eine gefederte Nachführung.
 *
 * Bekannte Folge: das Auto kann sich nicht überschlagen. In einer 17-m-Kehre mit
 * Vollgas bleibt es auf den Rädern, wo ein echtes kippen könnte. Das ist für
 * Arcade-Drift eine Eigenschaft, kein Fehler — aber es ist eine Entscheidung und
 * kein Zufall.
 *
 * ## Die Näherungen, die eine Neigung betreffen
 *
 * Die waagerechte Bewegung wird in der **XZ-Ebene** gerechnet, nicht in der
 * Hangebene. Der Hang wirkt über zwei Terme:
 *
 *  1. **Hangabtrieb**, exakt als waagerechte Komponente der Schwerkraft:
 *     `a = g · n_y · (n_x, n_z)`, Betrag `g · sinθ · cosθ`. Das ist die
 *     Projektion des echten Hangabtriebs `g · sinθ` auf die Waagerechte — für
 *     eine Rechnung in der Waagerechten also der richtige Wert.
 *  2. **Radlast**, mit `cosθ` verringert: `Fz = F_Feder · n_y`.
 *
 * Der Restfehler betrifft die Haltebedingung am Hang: das Modell hält, solange
 * `μ > sinθ`, physikalisch richtig wäre `μ > tanθ`. Bei der steilsten Straße der
 * Karte (Tempelaufgang, 43 % ≙ 23,3°) sind das 0,395 gegen 0,432 — 8,5 %
 * zugunsten des Autos. Bei μ ≥ 0,69 (Kies) spielt der Unterschied auf keiner
 * Straße dieser Karte eine Rolle; auf einer 45°-Wand tut er es, und dort wäre er
 * das kleinste Problem.
 */

/** Eingabe eines Frames. Alles normiert, damit Tastatur, Stick und Messlauf gleich aussehen. */
export interface DriveInput {
  /** 0…1 */
  throttle: number;
  /** 0…1 — bei Stillstand und ohne Gas legt sie den Rückwärtsgang ein. */
  brake: number;
  /** −1…1, negativ = links. Der **Wunsch**, nicht der Einschlag. */
  steer: number;
  handbrake: boolean;
}

/**
 * Belagsart unter einem Rad. Bestimmt Reibwert und Rollwiderstand.
 *
 * Eine Vereinigung von Zeichenketten und **kein `enum`**: `verbatimModuleSyntax`
 * und `isolatedModules` sind in diesem Projekt an, und ein modulübergreifendes
 * `const enum` verhält sich unter esbuild anders als unter `tsc` (dort wird es
 * eingesetzt, hier zu einem Objekt). Der Bestand kommt ohne ein einziges `enum`
 * aus; das bleibt so.
 */
export type Surface = 'asphalt' | 'kies' | 'gelaende' | 'wasser';

/**
 * Was das Fahrzeug über den Boden wissen muss.
 *
 * **Die Höhe kommt vom `TerrainSampler`, nicht vom gerenderten Gitter** — das ist
 * die Festlegung aus PLAN.md 9.1, und der Grund steht dort: die beiden Quellen
 * sind nicht identisch, und ein Fahrzeug, das auf der einen fährt und die andere
 * sieht, schwebt oder versinkt. Wer diese Schnittstelle implementiert, muss
 * denselben Sampler benutzen, den auch die Streuung und die Props benutzen.
 */
export interface Ground {
  /** Höhe der befahrbaren Oberfläche in Metern (Straßenbelag, Bürgersteig, Gelände). */
  height(x: number, z: number): number;
  /** Flächennormale, in `target` geschrieben. */
  normal(x: number, z: number, target: Vector3): Vector3;
  surface(x: number, z: number): Surface;
  /**
   * Wassertiefe über dem festen Boden, in Metern. 0 = trocken.
   *
   * Optional, weil der Messstand und der ebene Prüfstand kein Wasser kennen.
   * Fehlt die Methode, ist die Tiefe null — Asphalt-Zahlen bleiben bitgleich.
   */
  waterDepth?(x: number, z: number): number;
}

/** Ablesbarer Zustand — für Anzeige, Debug-Panel und Messläufe. */
export interface VehicleTelemetry {
  /** Betrag der Geschwindigkeit in m/s. */
  speed: number;
  /** Längsgeschwindigkeit (negativ = rückwärts). */
  forwardSpeed: number;
  /** Schwimmwinkel in Radiant: Winkel zwischen Fahrzeugachse und Fahrtrichtung. */
  slip: number;
  /** Schräglaufwinkel der Achsen in Radiant. */
  slipFront: number;
  slipRear: number;
  /** Verhältnis geforderter zu übertragbarer Antriebskraft. > 1 = Räder drehen durch. */
  wheelspin: number;
  /** Radeinschlag in Radiant. */
  steerAngle: number;
  /** Federweg-Ausnutzung 0…1. 0 = ausgefedert (in der Luft). */
  compression: number;
  airborne: boolean;
  surface: Surface;
  /** Tiefste Durchdringung, die im letzten Schritt aufgelöst wurde, in Metern. */
  lastPenetration: number;
  /** Zahl der Kontaktpunkte im letzten Schritt. */
  contacts: number;
  /** Wassertiefe am Schwerpunkt, in Metern. */
  waterDepth: number;
  /**
   * 0…1, wie stark die Hinterachse markiert. Für Spur und HUD, nicht für Kräfte.
   * Gebildet aus hinterem Schräglauf, Durchdrehen und Handbremse.
   */
  skid: number;
}

/**
 * > **Sieben Modulkonstanten standen hier bis P17, und sie mussten alle weg.**
 * >
 * > `STATIC_COMPRESSION`, `SPRING_REST`, `SLIP_SPEED_FLOOR`,
 * > `STATIC_HOLD_SPEED`, `MAX_YAW_RATE`, `WHEEL_MAX_DROP` und `WHEEL_MIN_DROP`
 * > waren aus `CHASSIS` und `SUSPENSION` gerechnet — also aus den Maßen **eines**
 * > Fahrzeugs. Sobald `Vehicle` eine Spec bekommt, sind sie eine Falle: die
 * > Physik rechnet mit den Zahlen des Lastwagens, die Federruhelage bleibt die
 * > des Coupés. Nichts davon würde eine Kennzahl melden — das Auto führe, nur
 * > eben falsch, und der Fehler säße 47 cm tief im Boden.
 * >
 * > Die fünf gerechneten stehen jetzt in `VehicleSpec.derived`
 * > (`vehicles.config.ts`, Funktion `derive`), die zwei gewählten in
 * > `VehicleSpec.limits`. Ihre Herleitungen sind mitgewandert; was hier folgt,
 * > ist die Begründung, die an dieser Stelle gebraucht wird.
 */

/**
 * Bezugsgeschwindigkeit im Nenner des Schräglaufwinkels, in m/s.
 *
 * `α = atan(vLat / v)` hat bei `v → 0` eine Singularität: eine
 * Querbewegung von 1 cm/s im Stand ergäbe 90° Schräglauf und damit die volle
 * Reifenkraft aus dem Nichts. Mit einem Mindestwert im Nenner werden die Reifen
 * bei Schrittgeschwindigkeit zu **viskosen Dämpfern** — sie bremsen die
 * Querbewegung proportional zu ihr, statt einen Winkel zu melden.
 *
 * ~~2 m/s ist knapp über Schrittgeschwindigkeit.~~ **Zu wenig, und das war die
 * Ursache dafür, dass im Gelände nichts fahrbar war.** Bei 2 m/s Bezugstempo
 * ergibt schon eine Gierrate von 1 rad/s einen hinteren Schräglaufwinkel von
 * 32° — tief im **abfallenden** Ast der Kennlinie. Der Reifen antwortet dort mit
 * *weniger* Kraft, je weiter er wegrutscht, und das ist eine Mitkopplung.
 *
 * Gemessen auf der Wiese, Vollgas geradeaus, **Lenkung null**: nach 0,5 s stand
 * der hintere Schräglauf bei −5,6°, nach 1,0 s bei −19,7°, nach 2,0 s war der
 * Wagen mit 63° Schwimmwinkel quer. Auf ideal ebenem Asphalt passierte das
 * nicht, weil dort nichts die Querbewegung anstößt — die Mikroneigung des
 * Höhenfelds (15 cm Stufen auf 1,5 m) genügte als Anstoß.
 *
 * 6 m/s (22 km/h) hält die Winkel bei Schrittgeschwindigkeit klein genug, dass
 * die Reifen im **ansteigenden** Ast bleiben und rückstellend wirken. Oberhalb
 * davon ist der Winkel unverfälscht, das Fahrverhalten also unverändert.
 *
 * > **Die Begründung oben ist mit P17 hinfällig, der Wert bleibt trotzdem.** Sie
 * > stützt sich darauf, dass 32° Schräglauf „tief im abfallenden Ast" liegen —
 * > das galt für die alte Kennlinie. Die heutige trägt bis 14,2° volle Kraft und
 * > fällt erst bei 30…40° auf `tailGrip`; die Mitkopplung, gegen die 6 m/s
 * > eingeführt wurden, gibt es nicht mehr. Und die eigentliche Ursache jener
 * > Geländefahrten war ohnehin eine andere, siehe `TIRE.lateralReserve`.
 * >
 * > Gemessen wurde deshalb, ob der Wert überhaupt noch etwas tut — 1,5 / 2,5 /
 * > 4 / 6 m/s gegen vier Manöver:
 * >
 * > | Wert | Kehrenradius bei 30 km/h | Rangieren, max. Schwimmwinkel | Wiese, 10 s Vollgas | Halten am 25-%-Hang, 5 s |
 * > |---|---|---|---|---|
 * > | 1,5 | 5,3 m | 25,6° | 144 km/h / 0,6° | 0,19 m |
 * > | 2,5 | 5,3 m | 31,3° | 144 km/h / 0,9° | 0,19 m |
 * > | 4,0 | 5,3 m | 33,6° | 144 km/h / 1,5° | 0,19 m |
 * > | 6,0 | 5,3 m | 31,9° | 144 km/h / 2,3° | 0,19 m |
 * >
 * > Der Wendekreis ist über den Lenkeinschlag begrenzt und nicht über die
 * > Reifen, das Halten am Hang macht `STATIC_HOLD_SPEED`. Der Wert ist damit
 * > **wirkungslos geworden** — und wird genau deshalb nicht angefasst: eine
 * > Änderung ohne messbaren Unterschied ist keine Verbesserung, sondern ein
 * > weiterer Wert ohne Messung daneben.
 *
 * > Der Wert steht seit P18 als `limits.slipSpeedFloor` in der Spec. Er ist bei
 * > allen vier Fahrzeugen gleich (6 m/s) — und bleibt trotzdem je Fahrzeug
 * > einstellbar, weil die Größe, gegen die er schützt (die Gierrate bei
 * > Schrittgeschwindigkeit), von Radstand und Gierträgheit abhängt.
 */

export class Vehicle {
  /** Schwerpunkt in Weltkoordinaten. */
  readonly position = new Vector3();
  /**
   * Weltgeschwindigkeit — **der Zustand**, aus dem alles andere folgt.
   *
   * Bis zur Energiemessung war es andersherum: `#vLong`/`#vLat` waren der Zustand
   * und diese hier die Ableitung. Warum das gedreht wurde, steht bei der
   * Integration in `step()` — die Kurzfassung: im mitrotierenden System erzeugt
   * expliziter Euler Energie, im Weltsystem gibt es den Term gar nicht.
   */
  readonly velocity = new Vector3();
  readonly quaternion = new Quaternion();

  /**
   * Welches Fahrzeug gerade gerechnet wird.
   *
   * **Kein `readonly` und kein Konstruktorargument allein**, weil der Wechsel im
   * Betrieb passiert: `DriveSystem` tauscht die Spec und behält die Instanz. Das
   * ist kein Geschmack, sondern eine Notwendigkeit — `main.ts` reicht
   * `drive.vehicle.telemetry` **als Objekt** an die Tonschicht weiter, und eine
   * neue `Vehicle`-Instanz hätte eine neue Telemetrie. Der Motor wäre nach dem
   * ersten Fahrzeugwechsel stumm geblieben, ohne dass irgendetwas gemeldet
   * hätte.
   */
  #spec: VehicleSpec = TOUGE;

  #yaw = 0;
  #yawRate = 0;
  #pitch = 0;
  #roll = 0;
  #vLong = 0;
  #vLat = 0;
  #vY = 0;
  #steerAngle = 0;
  /** Eingelaufene Gasstellung — siehe `DRIVETRAIN.throttleRate`. */
  #throttle = 0;
  #airborne = false;
  /** Drehwinkel der Räder, nur fürs Bild. */
  #wheelSpin = 0;

  readonly #forward = new Vector3();
  readonly #right = new Vector3();
  readonly #normal = new Vector3(0, 1, 0);
  /** Hochachse des Aufbaus und ein Rechenplatz — nur für `#placeWheels`. */
  readonly #up = new Vector3(0, 1, 0);
  readonly #scratch = new Vector3();
  readonly #euler = new Euler(0, 0, 0, 'YXZ');
  readonly #follow: FollowState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  #breaks: BreakEvent[] = [];
  #brokeThisStep = 0;

  /** Radaufstandshöhen: vorn links, vorn rechts, hinten links, hinten rechts. */
  readonly #wheelGround = [0, 0, 0, 0];
  readonly #wheelPos = [
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
  ] as const;

  readonly telemetry: VehicleTelemetry = {
    speed: 0,
    forwardSpeed: 0,
    slip: 0,
    slipFront: 0,
    slipRear: 0,
    wheelspin: 0,
    steerAngle: 0,
    compression: 0,
    airborne: false,
    surface: 'asphalt',
    lastPenetration: 0,
    contacts: 0,
    waterDepth: 0,
    skid: 0,
  };

  constructor(spec: VehicleSpec = TOUGE) {
    this.#spec = spec;
  }

  /** Die gerechnete Spec. Lesen darf jeder, ändern nur über `setSpec`. */
  get spec(): VehicleSpec {
    return this.#spec;
  }

  /**
   * Fahrzeug wechseln.
   *
   * **Setzt keinen Zustand zurück** — das macht der Aufrufer über `respawn`, und
   * zwar zwingend: die Federruhelage, die Radanschläge und der Schwerpunkt sind
   * andere geworden, und ein Wagen, der mit der Höhe des Coupés und den Maßen
   * des Lastwagens weiterrechnet, steht 58 cm im Boden. Zwei getrennte Aufrufe
   * und nicht einer, weil `respawn` einen `Ground` braucht und die Spec ihn
   * nicht kennt; `DriveSystem.setVehicle()` ist die Stelle, die beides in der
   * richtigen Reihenfolge tut.
   */
  setSpec(spec: VehicleSpec): void {
    this.#spec = spec;
  }

  get yaw(): number {
    return this.#yaw;
  }

  get wheelSpinAngle(): number {
    return this.#wheelSpin;
  }

  /** Weltpositionen der vier Räder — für das Mesh. Reihenfolge wie `#wheelGround`. */
  get wheelPositions(): readonly Vector3[] {
    return this.#wheelPos;
  }

  /**
   * Brüche des letzten Schritts. Der Aufrufer nimmt das Array und macht etwas
   * damit (Trümmer, Shader-Loch, Streuung überspringen) — stehen lassen hieße,
   * dass ein Messlauf ohne Verbraucher die Liste unbegrenzt füllt.
   */
  consumeBreaks(): BreakEvent[] {
    const out = this.#breaks;
    this.#breaks = [];
    return out;
  }

  /**
   * Auf eine Stelle setzen und allen Bewegungszustand verwerfen.
   *
   * Alles wird zurückgesetzt, auch Gierrate und Federweg: ein Respawn mitten im
   * Drift, der die Drehung behält, dreht sich am neuen Ort weiter — und das sieht
   * nach einem Fehler aus, weil es einer ist.
   */
  respawn(x: number, z: number, heading: number, ground: Ground): void {
    const groundY = ground.height(x, z);
    // **Die Ruhehöhe hängt von der Neigung ab, und das ist keine Feinheit.** Der
    // Federweg wird senkrecht zur Fläche gemessen (`gap · n_y`); die Ruhelage
    // liegt deshalb `cgHeight / n_y` **senkrecht** über dem Boden, nicht
    // `cgHeight`. An einem 45°-Hang sind das 0,74 m statt 0,52 m.
    //
    // Wurde das Auto auf `cgHeight` abgesetzt, war die Feder sofort 0,25 m
    // eingedrückt — mehr als ihr Federweg. Der Anschlag mit seiner neunfachen
    // Rate schoss es dann in die Luft: gemessen am Hang unter dem Massiv
    // **91,9 % der Zeit in der Luft, längste Flugphase 7,7 s**.
    ground.normal(x, z, this.#normal);
    const aufrecht = Math.max(0.35, this.#normal.y);
    this.position.set(x, groundY + this.#spec.chassis.cgHeight / aufrecht, z);
    this.#yaw = heading;
    this.#yawRate = 0;
    this.#pitch = 0;
    this.#roll = 0;
    this.#vLong = 0;
    this.#vLat = 0;
    this.#vY = 0;
    this.#steerAngle = 0;
    this.#throttle = 0;
    this.#airborne = false;
    // **Auch die Lastverlagerung des letzten Schritts und der Raddrehwinkel.**
    // Erstere geht in die Radlasten des ersten neuen Schritts ein; blieb sie
    // stehen, hing das Ergebnis eines Messlaufs davon ab, was das Auto **davor**
    // getan hatte. Gemessen: zwei Läufe derselben Strecke endeten 6 cm
    // auseinander (742,26 m gegen 742,20 m). Die Ketten dieses Projekts sind
    // deterministisch; wenn nicht, ist etwas kaputt.
    this.#lastLongAccel = 0;
    this.#wheelSpin = 0;
    this.#breaks = [];
    this.velocity.set(0, 0, 0);
    this.#updateBasis();
    this.#sampleWheels(ground);
    this.#updateTransform();
    this.#placeWheels();

    // **Und die Telemetrie.** Sie ist eine Anzeige — aber sie wird gelesen, und
    // zwar vom Regler des Messstands, bevor der erste Schritt gerechnet ist.
    // Blieb sie stehen, begann ein Lauf mit dem Tempo des vorigen, und zwei
    // Läufe derselben Strecke endeten 14 cm auseinander. Ein Zustand, der ein
    // Reset überlebt, tarnt sich als „nicht ganz reproduzierbar".
    const t = this.telemetry;
    t.speed = 0;
    t.forwardSpeed = 0;
    t.slip = 0;
    t.slipFront = 0;
    t.slipRear = 0;
    t.wheelspin = 0;
    t.steerAngle = 0;
    t.compression = this.#spec.derived.staticCompression / this.#spec.suspension.travel;
    t.airborne = false;
    t.lastPenetration = 0;
    t.contacts = 0;
    t.waterDepth = 0;
    t.skid = 0;
  }

  /**
   * Ein Simulationsschritt.
   *
   * Wird aus `fixedUpdate` gerufen, also mit konstantem `dt` — genau dafür hat
   * `RenderLoop` seit P0 den fixen Schritt. Mit variablem `dt` wäre das Modell
   * nicht deterministisch, und zwei Läufe derselben Eingabe kämen an
   * verschiedenen Stellen an.
   */
  step(dt: number, input: DriveInput, ground: Ground, collision: CollisionWorld | null): void {
    // **Einmal auspacken statt fünfzigmal durchgreifen.** Nicht aus
    // Geschwindigkeitsgründen — `this.#spec.chassis.mass` ist billig —, sondern
    // damit unten dasselbe steht wie vor P18: `chassis.mass` liest sich wie
    // `CHASSIS.mass`, und die Herleitungen in den Kommentaren bleiben lesbar.
    const { chassis, suspension, tire, drivetrain, steering, limits, derived } = this.#spec;

    this.#updateBasis();
    this.#steer(dt, input.steer);
    // **Das Gas läuft ein, es springt nicht.** Eine Taste kennt nur 0 und 1; ein
    // Fahrer tritt in rund einer Viertelsekunde durch. Ohne diese Rate steht bei
    // jedem Antippen sofort die volle Antriebskraft an, und auf losem Boden ist
    // das der Unterschied zwischen „beschleunigen" und „quer stehen" — dieselbe
    // Begründung wie bei `STEERING.rate` für den Lenkeinschlag.
    const gasZiel = clamp(input.throttle, 0, 1);
    const gasSchritt = drivetrain.throttleRate * dt;
    this.#throttle += clamp(gasZiel - this.#throttle, -gasSchritt, gasSchritt);
    this.#sampleWheels(ground);

    // **Längs- und Quergeschwindigkeit werden abgeleitet, nicht fortgeschrieben.**
    // Der Zustand ist `velocity` in Weltkoordinaten; siehe den Block „Warum in
    // Weltkoordinaten integriert wird" weiter unten. Diese beiden Zeilen sind die
    // Projektion auf die Fahrzeugachsen, und mehr sind sie nicht.
    this.#vLong = this.velocity.x * this.#forward.x + this.velocity.z * this.#forward.z;
    this.#vLat = this.velocity.x * this.#right.x + this.velocity.z * this.#right.z;

    ground.normal(this.position.x, this.position.z, this.#normal);
    const steep = isSteep(this.#normal.y);
    const surface = ground.surface(this.position.x, this.position.z);
    const waterDepth = ground.waterDepth?.(this.position.x, this.position.z) ?? 0;

    // ── Aufbau und Federweg ───────────────────────────────────────────────
    //
    // Der Federweg wird **längs der Normalen** gemessen: der senkrechte Abstand
    // mal `n_y`. Sonst federte ein Auto auf einer 20°-Rampe um 6 % zu weit ein
    // und wäre dort messbar tiefer eingestellt als in der Ebene.
    //
    // Steilwand: keine Feder. `contactY = y − SPRING_REST` war falsch — die
    // Kompression rechnet `gap · n_y`, und bei n_y = 0,3 bleibt sie positiv
    // (gemessen 150 %, y = 94 m in 4 s). Die Fläche ist eine Wand, nicht ein
    // Boden; `resolveTerrainFollow` schiebt in XZ.
    const contactY = this.#contactHeight();
    const gap = this.position.y - contactY;
    let compression = steep ? 0 : derived.springRest - gap * this.#normal.y;
    this.#airborne = steep || compression <= 0;

    let springForce = 0;
    if (!this.#airborne) {
      const travelOver = compression - suspension.travel;
      // Anschlag: jenseits des Federwegs sitzt der Aufbau auf dem Gummipuffer,
      // und der ist ein Vielfaches härter. Ohne ihn schluckt eine Bordsteinkante
      // den ganzen Federweg und der Aufbau taucht durch den Boden.
      const stiffness =
        travelOver > 0
          ? suspension.stiffness * compression +
            suspension.stiffness * suspension.bumpStopFactor * travelOver
          : suspension.stiffness * compression;
      // **Und ein Deckel darauf — die wichtigste Zeile für das Fahren im
      // Gelände.** Der Anschlag ist eine Feder, deren Kraft mit dem Weg linear
      // wächst. Auf einem Höhenfeld mit 1,5 m Texelabstand findet ein Rad bei
      // Tempo regelmäßig 20…40 cm Stufe, und dann rechnet der Anschlag eine
      // Kraft aus, die den Aufbau senkrecht wegschießt.
      //
      // Der Deckel ist kein Kunstgriff, sondern die fehlende Physik: ein echtes
      // Rad verformt sich an einer Kante und rutscht daran hoch, statt den
      // Aufbau mit 9 g zu beschleunigen. Herleitung des Werts bei
      // `SUSPENSION.maxLoadFactor`.
      springForce = Math.min(
        derived.springCap,
        Math.max(0, stiffness - suspension.damping * this.#vY * this.#normal.y),
      );
    } else {
      compression = 0;
    }

    this.#vY += (springForce / chassis.mass - GRAVITY) * dt;

    // ── Radlasten ─────────────────────────────────────────────────────────
    //
    // Grundlast aus der Federkraft, mit `cosθ` auf die Hangnormale bezogen.
    // In der Luft ist sie null, und damit sind alle Reifenkräfte null — genau
    // richtig, ein Rad ohne Boden überträgt nichts.
    //
    // **Abtrieb kommt hinzu, seit P18 zum ersten Mal.** `Fz += c · v²`, und zwar
    // auf die **Radlast** und nicht auf die Federkraft: aerodynamischer Abtrieb
    // drückt den Wagen auf die Straße, ohne dass die Feder ihn zurückschiebt —
    // ein Auto mit Flügel steht bei 300 km/h tiefer, aber es steht nicht auf dem
    // Anschlag. Über die Feder gerechnet wäre er außerdem vom Deckel
    // `derived.springCap` abgeschnitten worden und hätte oberhalb von 3,5 g gar
    // nichts mehr getan.
    //
    // > Bis P17 stand `DRIVETRAIN.downforce` mit 0,55 in der Konfiguration und
    // > wurde von **keiner** Zeile gelesen. Siehe die Begründung an der
    // > Konstanten selbst; die Zahlen sind mit dem ersten Gebrauch neu bemessen
    // > worden, weil eine nie angewandte Zahl auch nie geprüft war.
    const aero = this.#airborne
      ? 0
      : drivetrain.downforce * (this.#vLong * this.#vLong + this.#vLat * this.#vLat);
    const load = this.#airborne ? 0 : springForce * this.#normal.y + aero;
    // Längs-Lastverlagerung: ΔFz = m · a_x · h / L. Verwendet wird die
    // Beschleunigung des **letzten** Schritts (in `#lastLongAccel`), weil die des
    // aktuellen erst am Ende feststeht — ein Schritt Verzug bei 60 Hz ist 17 ms
    // und nicht spürbar, eine Iteration darüber wäre der Aufwand nicht wert.
    const transfer = (chassis.mass * this.#lastLongAccel * chassis.cgHeight) / chassis.wheelbase;
    const loadFront = Math.max(0, load * chassis.frontWeight - transfer);
    const loadRear = Math.max(0, load * (1 - chassis.frontWeight) + transfer);

    const gripFactor = surfaceGrip(surface, tire);
    let muFront = tire.gripAsphalt * gripFactor;
    let muRear = tire.gripAsphalt * gripFactor * tire.rearGripFactor;
    const speedNow = Math.hypot(this.#vLong, this.#vLat);
    // Aquaplaning und lockerer Kies — Asphalt bleibt die gemessene Referenz.
    if (surface === 'wasser' && speedNow > SURFACE_FEEL.hydroStart) {
      const hydro = Math.min(
        1,
        (speedNow - SURFACE_FEEL.hydroStart) /
          (SURFACE_FEEL.hydroFull - SURFACE_FEEL.hydroStart),
      );
      muFront *= 1 - SURFACE_FEEL.hydroFront * hydro;
      muRear *= 1 - SURFACE_FEEL.hydroRear * hydro;
    } else if (surface === 'kies') {
      muRear *= SURFACE_FEEL.gravelRear;
    }

    // ── Schräglaufwinkel ──────────────────────────────────────────────────
    const speedRef = Math.max(Math.abs(this.#vLong), limits.slipSpeedFloor);
    // Rückwärts ist das Vorzeichen der Lenkwirkung umgekehrt; das ergibt sich von
    // selbst, wenn man mit der **vorzeichenbehafteten** Längsgeschwindigkeit
    // rechnet. Deshalb `vLong` und nicht `|vLong|` im Zähler des Nenners.
    const direction = this.#vLong < 0 ? -1 : 1;
    // **Die Querbewegung einer Achse ist `ω × r`, und ihr Vorzeichen hängt daran,
    // wohin `right` zeigt.** Für eine Drehung mit `ω` um `+Y` hat ein Punkt bei
    // `r = a · forward` die Zusatzgeschwindigkeit `ω · (ŷ × forward) = −ω · a · right`;
    // die Vorderachse bekommt also **minus** `ω · a`, die Hinterachse **plus**
    // `ω · b`.
    //
    // Solange `#right` fälschlich nach links zeigte, stimmten die umgekehrten
    // Vorzeichen — und als die Achse repariert wurde, blieb hier der Rest des
    // Fehlers stehen. Ergebnis: die Reifen **verstärkten** jede Drehung, statt sie
    // zu dämpfen. Gemessen auf spiegelglattem Stadtasphalt, Vollgas, Lenkung null,
    // ohne einen einzigen Kollisionskontakt: die Gierrate wuchs monoton von
    // −0,14 auf −2,48 rad/s in 0,4 s, und der Wagen drehte sich im Kreis.
    //
    // Das ist der Kern von „die Physik ist schlecht" gewesen — und es sah nach
    // einem Reifen- oder Geländeproblem aus, weil es sich auf losem Boden zuerst
    // zeigte.
    const slipFront =
      Math.atan2(this.#vLat - this.#yawRate * derived.cgToFront, speedRef) - this.#steerAngle * direction;
    const slipRear = Math.atan2(this.#vLat + this.#yawRate * derived.cgToRear, speedRef);

    // ── Längskräfte ───────────────────────────────────────────────────────
    let throttle = this.#throttle;
    let brake = input.brake;
    // Bremse bei Stillstand = Rückwärtsgang. Kein Getriebe, keine Taste dafür:
    // in einem Arcade-Spiel erwartet niemand einen Gangwahlschalter, und ein
    // Auto, das nicht zurückstoßen kann, steht nach der ersten verpassten Kehre
    // endgültig.
    let reverse = false;
    if (brake > 0 && this.#vLong < 0.6 && throttle <= 0) {
      reverse = true;
      throttle = brake;
      brake = 0;
    }

    let driveForce = 0;
    if (throttle > 0) {
      if (reverse) {
        driveForce =
          this.#vLong > -drivetrain.reverseMaxSpeed
            ? -throttle * drivetrain.maxDriveForce * drivetrain.reverseForceFactor
            : 0;
      } else {
        // Kraftbegrenzt bei niedrigem, leistungsbegrenzt bei hohem Tempo:
        // `F = min(F_max, P / v)`. Die Endgeschwindigkeit ergibt sich damit aus
        // dem Gleichgewicht mit dem Luftwiderstand und wird nicht gesetzt.
        //
        // **`F_max` ist seit P18 nicht mehr konstant** — der erste Gang steckt
        // darin. Begründung und Herleitung bei `DrivetrainSpec.launchBoost`; die
        // Kurzfassung: mit konstantem `F_max` ist das ein Auto mit *einem* Gang,
        // und ein Auto mit einem Gang kann an der Ampel die Räder nicht
        // durchdrehen lassen. Gemessen war das der Grund, warum der
        // Durchdrehfaktor auf Asphalt nie über **0,857** kam, obwohl die
        // Anforderung „der Hinterwagen bricht auf Gasstoß aus" seit P9.2 im
        // Kopf von `vehicle.config.ts` steht.
        const speedForPower = Math.max(Math.abs(this.#vLong), 4);
        const gear =
          1 +
          drivetrain.launchBoost * Math.exp(-Math.abs(this.#vLong) / drivetrain.launchSpeed);
        driveForce =
          throttle *
          Math.min(drivetrain.maxDriveForce * gear, drivetrain.power / speedForPower);
      }
    }

    /**
     * **Motorbremse — bis P17 gab es sie nicht.**
     *
     * Ohne Gas wirkten allein Luftwiderstand und Rollreibung; gemessen brauchte
     * das Coupé aus 195 km/h **39,4 s**, um auf die Hälfte zu kommen. Ein
     * Verbrenner im Schub schleppt sein eigenes Reibmoment mit, und für den
     * Lastwagen ist die Motorstaubremse sogar das Bauteil, mit dem er überhaupt
     * einen Pass hinunterkommt.
     *
     * Sie läuft unterhalb `ENGINE_BRAKE_FLOOR` linear aus (die Kupplung trennt
     * vor dem Stillstand) und geht auf die **angetriebenen** Achsen — dorthin,
     * wo sie herkommt.
     *
     * Der Betrag steht nicht hier, sondern unten: er hängt von der Haftung ab.
     * Warum, steht bei `ENGINE_BRAKE_SHARE`.
     */
    const engineDragWanted =
      throttle > 0 || this.#airborne || Math.abs(this.#vLong) <= 0.05
        ? 0
        : -Math.sign(this.#vLong) *
          drivetrain.engineBrake *
          Math.min(1, Math.abs(this.#vLong) / ENGINE_BRAKE_FLOOR);

    const brakeTotal = brake * drivetrain.brakeForce;
    const brakeSign = this.#vLong > 0 ? -1 : this.#vLong < 0 ? 1 : 0;
    const brakeFront = brakeTotal * drivetrain.brakeBias * brakeSign;
    let brakeRear = brakeTotal * (1 - drivetrain.brakeBias) * brakeSign;
    if (input.handbrake) brakeRear += drivetrain.handbrakeForce * (brakeSign !== 0 ? brakeSign : -1);

    // ── Antrieb auf die Achsen verteilen ──────────────────────────────────
    //
    // **Bis P17 gab es diese vier Zeilen nicht.** `driveForce` ging vollständig
    // in `requestedRear`, und `usedFront` kannte nur die Bremse — das Modell
    // konnte gar nichts anderes als Heckantrieb. Für den Allradler ist das kein
    // Detail: er zieht sich mit der Vorderachse aus einer Furche, in der ein
    // Hecktriebler sich eingräbt.
    //
    // Die Aufteilung ist ein **fester Anteil** und kein Mittendifferential.
    // Sperrwirkung, Momentenverteilung nach Schlupf, Viscokupplung — all das
    // wäre je Achse eine eigene Drehzahl, und Raddrehzahlen führt dieses Modell
    // ausdrücklich nicht (siehe Tabelle im Kopf). Was ein fester Anteil nicht
    // kann: die Kraft von der durchdrehenden auf die haftende Achse verschieben.
    // Das ist eine bekannte Näherung.
    const gripRear = muRear * loadRear;
    const gripFront = muFront * loadFront;

    /**
     * **Die Motorbremse weicht dem Reibkreis, statt ihn zu sprengen.**
     *
     * Der erste Versuch schrieb sie einfach in die Längskraft der angetriebenen
     * Achse — physikalisch die richtige Stelle, und das Auto war unfahrbar.
     * Gemessen, Lastwechsel im Bogen bei 68 km/h auf idealem Asphalt, Gas ganz
     * weg (Schwimmwinkel Spitze / nach 2,5 s):
     *
     * | Motorbremse | Lenkung 0,35 | 0,55 | 0,80 |
     * |---:|---:|---:|---:|
     * | 0 N   | 20,3° / **1,7°** | 21,9° / **1,7°** | 16,4° / 11,9° |
     * | 300 N | 26,9° / **0,9°** | 29,3° / **6,7°** | 19,3° / 4,4° |
     * | 400 N | 30,8° / 17,3° | 37,1° / 6,2° | 20,7° / 1,7° |
     * | 800 N | 64,4° / **60,1°** | **89,7°** / 0,0° | 69,9° / **69,9°** |
     *
     * Zwischen 300 und 400 N kippt es: der Wagen kommt aus dem Lastwechsel nicht
     * mehr zurück, bei 800 N steht er quer. Und 800 N sind nicht viel — 12 % der
     * Hinterachshaftung.
     *
     * **Die Ursache ist eine Lücke im Modell, keine zu große Zahl.** Dieses
     * Fahrmodell führt keine Raddrehzahlen (siehe Tabelle im Kopf). In einem
     * echten Antriebsstrang bricht das Schleppmoment zusammen, sobald das Rad
     * gegenüber der Fahrbahn zu rutschen beginnt: Rad und Motor hängen über die
     * Kupplung zusammen, das Rad wird langsamer, die Schleppkraft fällt. Hier
     * bleibt sie stehen — und schiebt die Achse immer weiter über ihre
     * Kennlinie hinaus. Das ist eine Mitkopplung, genau wie die, gegen die
     * `slipSpeedFloor` eingeführt wurde.
     *
     * Nachgebildet wird das Fehlende als **Deckel auf den Anteil der
     * Achshaftung**. Er sagt: Schleppmoment ist begrenzt und gibt nach, statt
     * die Seitenführung zu überfahren — das ist dieselbe Aussage, die eine
     * Motorschleppmomentregelung im Steuergerät macht.
     *
     * Der Unterschied zur Betriebsbremse ist beabsichtigt: die **darf** die
     * Lenkbarkeit überfahren (deshalb bremst man in einer Kurve nicht voll), die
     * Motorbremse nicht.
     */
    // **Der Deckel gilt je Achse und nicht für die Summe.** Die erste Fassung
    // rechnete beim Allradler mit `gripFront + gripRear` — und der Offroader
    // stand danach bei jedem Lastwechsel quer (gemessen: 89,8° Spitze, 83,5°
    // nach 2,5 s, bei Lenkung 0,55). Der Grund ist die Lastverlagerung: beim
    // Verzögern entlastet sich die Hinterachse, und was den Wagen umbringt, ist
    // der Anteil, der **auf ihr** landet — nicht die Summe über beide. Bei einem
    // Fahrzeug mit 0,78 m Schwerpunkthöhe ist der Unterschied groß.
    //
    // Formal: gesucht ist das größte `F` mit `F·(1−s) ≤ share·gripHinten` und
    // `F·s ≤ share·gripVorn`. Der Deckel ist das Minimum der beiden.
    const share = drivetrain.frontShare;
    const capRear = share >= 1 ? Infinity : (ENGINE_BRAKE_SHARE * gripRear) / (1 - share);
    const capFront = share <= 0 ? Infinity : (ENGINE_BRAKE_SHARE * gripFront) / share;
    const engineDrag =
      engineDragWanted === 0
        ? 0
        : Math.sign(engineDragWanted) *
          Math.min(Math.abs(engineDragWanted), capRear, capFront);

    const axleForce = driveForce + engineDrag;
    const driveFront = axleForce * share;
    const driveRear = axleForce - driveFront;

    // Reibkreis hinten: was die Längsrichtung nimmt, fehlt der Querführung.
    const requestedRear = driveRear + brakeRear;
    const usedRear = clamp(requestedRear, -gripRear, gripRear);
    const requestedFront = driveFront + brakeFront;
    const usedFront = clamp(requestedFront, -gripFront, gripFront);

    // **Der Durchdrehfaktor ist der Drift-Schalter.** Der Überschuss über die
    // Haftgrenze bleibt nicht als Kraft übrig, sondern frisst die Seitenführung.
    // Genau das macht am Kurvenausgang aus Gas einen Übersteuerimpuls.
    //
    // > **Er hat auf Asphalt nie über 1 gestanden, und das war ein Fehler.** Der
    // > Kommentar hier behauptete, `maxDriveForce` liege „8,6 % über der
    // > Haftgrenze der Hinterachse" — die Rechnung dahinter setzte die
    // > **statische** Hinterachslast an und ließ die Lastverlagerung beim
    // > Beschleunigen weg. Mit ihr braucht es 9088 N statt 6627, und 7200 lagen
    // > damit 16,1 % **darunter**. Gemessen: höchster Durchdrehfaktor auf
    // > Asphalt 0,857 × — beim Anfahren wie beim Gasstoß in der Kurve. Die
    // > Reparatur steht bei `DrivetrainSpec.launchBoost`.
    //
    // **Gemessen wird die angetriebene Achse**, nicht pauschal die hintere: bei
    // Frontantrieb wäre die hintere Zahl konstant null und die Anzeige (und mit
    // ihr die Driftspur) blind für das, was tatsächlich passiert.
    const spinRear = gripRear > 1 ? Math.abs(requestedRear) / gripRear : 0;
    const spinFront = gripFront > 1 ? Math.abs(requestedFront) / gripFront : 0;
    const wheelspin =
      drivetrain.frontShare >= 1
        ? spinFront
        : drivetrain.frontShare <= 0
          ? spinRear
          : Math.max(spinFront, spinRear);
    // **Hier stand `spinLoss`, und es war die dritte tote Stellschraube dieses
    // Projekts.** `clamp(1/wheelspin, minSpinGrip, 1)` hat die Querkraft
    // multipliziert — *nachdem* der Reibkreis in `tireLateral` sie längst auf
    // null geklemmt hatte. Denn `usedRear` ist auf `gripRear` geklemmt, und bei
    // Vollgas auf losem Boden liegt es genau dort; das Budget
    // `√(grip² − Fx²)` ist dann exakt **0**, und `0 · spinLoss` ist 0.
    //
    // Gemessen auf der Wiese, 10 s Vollgas, `minSpinGrip` von 0,80 auf 0,00:
    // Endtempo 25,84 km/h und Endposition (−5,9617 | 27,6956) — **auf vier
    // Nachkommastellen identisch, für alle vier Werte**. Der lange Kommentar an
    // der Konstanten beschrieb eine Wirkung, die es nicht gab.
    //
    // Der Gedanke dahinter war richtig, nur die Stelle falsch: die Reserve
    // gehört auf das **Budget**, nicht als Faktor auf das Ergebnis. Sie steht
    // jetzt in `tireLateral` als `TIRE.lateralReserve`. Dieselbe Fehlerform wie
    // bei `tailGrip` — ein richtiger Wert an der falschen Stelle in derselben
    // Funktion, zweimal.

    // ── Querkräfte ────────────────────────────────────────────────────────
    const lateralFront = tireLateral(
      slipFront,
      tire.peakSlipFront,
      tire.falloffSlipFront,
      gripFront,
      usedFront,
      tire,
    );
    let lateralRear = tireLateral(
      slipRear,
      tire.peakSlipRear,
      tire.falloffSlipRear,
      gripRear,
      usedRear,
      tire,
    );
    // Handbremse: das Hinterrad steht, im Reibkreis bleibt fast nichts für die
    // Querführung. Nicht null — sonst ist der Handbremsdrift nicht lenkbar.
    if (input.handbrake) lateralRear *= tire.lockedLateralFactor;

    // ── Widerstände ───────────────────────────────────────────────────────
    const speed = Math.hypot(this.#vLong, this.#vLat);
    const drag = -drivetrain.drag * this.#vLong * Math.abs(this.#vLong);
    const rollingCoefficient =
      surface === 'asphalt'
        ? drivetrain.rollingResistance
        : surface === 'kies'
          ? (drivetrain.rollingResistance + drivetrain.rollingResistanceTerrain) / 2
          : surface === 'wasser'
            ? drivetrain.rollingResistanceWater
            : drivetrain.rollingResistanceTerrain;
    const rolling = this.#airborne
      ? 0
      : -Math.sign(this.#vLong) * rollingCoefficient * load * Math.min(1, Math.abs(this.#vLong) / 0.5);

    // Hangabtrieb, waagerechte Komponente der Schwerkraft (Herleitung im Kopf).
    // Er steht schon in Weltkoordinaten und wird deshalb unten direkt addiert —
    // eine Projektion auf die Fahrzeugachsen und zurück wäre zweimal derselbe
    // Kosinus.
    const slopeX = this.#airborne ? 0 : GRAVITY * this.#normal.y * this.#normal.x;
    const slopeZ = this.#airborne ? 0 : GRAVITY * this.#normal.y * this.#normal.z;

    // ── Integration ───────────────────────────────────────────────────────
    //
    // ## Warum in Weltkoordinaten integriert wird
    //
    // Die erste Fassung führte `vLong` und `vLat` als **Zustand** fort und trug die
    // Zentripetalterme des rotierenden Bezugssystems nach:
    // `v̇_long = ΣFx/m + ω·v_lat` und `v̇_lat = ΣFy/m − ω·v_long`. Das ist die
    // richtige Gleichung und war trotzdem falsch — **mit explizitem Euler erzeugt
    // sie Energie.**
    //
    // Der Grund ist Geometrie: die beiden Terme sind eine Drehung der
    // Geschwindigkeit um `ω·dt`. Explizit integriert wird daraus statt der Drehung
    // ihre **Tangente**, und die ist um den Faktor `√(1 + (ω·dt)²)` länger. Bei
    // 60 Hz und ω = 15 rad/s (ein Kreisel nach einem Dreher) sind das 3 % Zuwachs
    // **je Schritt**, also das Sechsfache je Sekunde.
    //
    // Gemessen, bevor es repariert war: ein eingeleiteter Drift bei 93 km/h stand
    // nach 2,75 s bei **1622 km/h**. Der Fehler war an der Bahn nicht zu sehen —
    // das Auto fuhr ja —, sondern nur an der Zahlenreihe.
    //
    // In Weltkoordinaten gibt es das Problem nicht: dort *dreht sich der
    // Geschwindigkeitsvektor gar nicht*, wenn sich das Fahrzeug dreht. Die
    // Zentripetalterme verschwinden ersatzlos, weil sie ein Artefakt des
    // mitrotierenden Systems waren und keine Kraft. Gerechnet wird weiterhin in
    // Fahrzeugachsen — nur eben einmal je Schritt neu projiziert statt
    // fortgeschrieben.
    const forceLong =
      usedFront + usedRear + drag + rolling - lateralFront * Math.sin(this.#steerAngle);
    const forceLat = lateralFront * Math.cos(this.#steerAngle) + lateralRear;

    let accelLong = forceLong / chassis.mass;
    const accelLat = forceLat / chassis.mass;

    // Haftreibung im Stand — Begründung bei `STATIC_HOLD_SPEED`.
    if (!this.#airborne && throttle <= 0 && speed < limits.staticHoldSpeed) {
      const holdLimit = (muFront * loadFront + gripRear) / chassis.mass;
      const needed = -this.#vLong / dt - accelLong;
      accelLong += clamp(needed, -holdLimit, holdLimit);
    }
    this.#lastLongAccel = accelLong;

    this.velocity.x +=
      (this.#forward.x * accelLong + this.#right.x * accelLat + slopeX) * dt;
    this.velocity.z +=
      (this.#forward.z * accelLong + this.#right.z * accelLat + slopeZ) * dt;

    // Wasserwiderstand — `F = −c · v · |v|`, skaliert mit der Tiefe. Auf
    // Asphalt ist `waterDepth` null, der Term also exakt null: die gemessenen
    // 0–100-Zahlen bleiben dieselben.
    if (!this.#airborne && waterDepth > 0) {
      const wet = Math.min(1, waterDepth / 0.7);
      const horiz = Math.hypot(this.velocity.x, this.velocity.z);
      if (horiz > 1e-4) {
        const damp = (drivetrain.waterDrag * wet * horiz * dt) / chassis.mass;
        this.velocity.x -= this.velocity.x * damp;
        this.velocity.z -= this.velocity.z * damp;
      }
    } else if (!this.#airborne && surface !== 'asphalt') {
      const k =
        surface === 'gelaende'
          ? drivetrain.terrainDrag
          : surface === 'kies'
            ? drivetrain.gravelDrag
            : 0;
      if (k > 0) {
        this.velocity.x -= this.velocity.x * k * dt;
        this.velocity.z -= this.velocity.z * k * dt;
      }
    }

    // ── Gieren ────────────────────────────────────────────────────────────
    // **Das Vorzeichen kommt aus dem Kreuzprodukt, nicht aus einer Annahme.**
    // Der Gierwinkel ist der Drehwinkel um `+Y` (`forward = (sin ψ, 0, cos ψ)`
    // ist `R_y(ψ)·(0,0,1)`), also gilt `I_zz ψ̈ = (r × F)_y`. Für eine Seitenkraft
    // `F = F_y · right` an der Stelle `r = a · forward` ergibt das
    // `(a cos)(−F cos) − (a sin)(F sin) = −a · F`: eine Kraft nach **rechts**
    // dreht den Gierwinkel **negativ**.
    //
    // Seit `#right` wirklich rechts zeigt, muss dieses Minus hier stehen. Vorher
    // fehlte es — und hob den Achsenfehler oben gerade wieder auf, weshalb das
    // Auto überhaupt fuhr und nur in die falsche Richtung lenkte.
    let yawTorque = -(
      lateralFront * Math.cos(this.#steerAngle) * derived.cgToFront -
      lateralRear * derived.cgToRear
    );
    // Die einzige Fahrhilfe: Dämpfung **hinter** dem Ausbruchpunkt. Bei normalem
    // Schräglauf ist der Term exakt null (siehe `STEERING.driftDamping`).
    const excess = Math.abs(slipRear) - tire.peakSlipRear;
    if (excess > 0 && !this.#airborne) {
      yawTorque -=
        this.#yawRate *
        steering.driftDamping *
        Math.min(1, excess / tire.peakSlipRear) *
        chassis.yawInertia;
      // Loslassen fängt — Begründung bei `STEERING.releaseDamping`.
      if (Math.abs(input.steer) < 0.25 && !input.handbrake) {
        yawTorque -=
          this.#yawRate *
          steering.releaseDamping *
          Math.min(1, excess / tire.peakSlipRear) *
          chassis.yawInertia;
      }
    }
    this.#yawRate += (yawTorque / chassis.yawInertia) * dt;
    // In der Luft dreht sich nichts weiter auf: ohne Reifen gibt es kein
    // Giermoment, und die vorhandene Drehung läuft nur aus.
    if (this.#airborne) this.#yawRate *= Math.exp(-0.6 * dt);
    // **Deckel auf die Gierrate**, und zwar immer und nicht nur nach einem
    // Anschlag. 8 rad/s sind 1,3 Umdrehungen je Sekunde — mehr dreht sich ein
    // Auto auf Asphalt nicht, und oberhalb davon wird `ω·dt` so groß, dass die
    // Winkelintegration selbst ungenau wird (bei 8 rad/s sind es 7,6° je Schritt).
    this.#yawRate = clamp(this.#yawRate, -limits.maxYawRate, limits.maxYawRate);
    this.#yaw += this.#yawRate * dt;

    // ── Lage integrieren ──────────────────────────────────────────────────
    this.#updateBasis();
    this.velocity.y = this.#vY;
    this.position.addScaledVector(this.velocity, dt);

    // Bodenfang. Früher ein reines `y = max(y, terrain)` — auf einem Steilhang
    // die Rampe, die aus einem Clip eine Bergauffahrt macht. Begründung und
    // Messung bei `resolveTerrainFollow`.
    const follow = this.#follow;
    follow.x = this.position.x;
    follow.y = this.position.y;
    follow.z = this.position.z;
    follow.vx = this.velocity.x;
    follow.vy = this.#vY;
    follow.vz = this.velocity.z;
    resolveTerrainFollow(
      follow,
      ground.height(this.position.x, this.position.z),
      this.#normal.x,
      this.#normal.y,
      this.#normal.z,
      chassis.wheelRadius * 0.5,
      this.#spec.collision.maxPushPerStep,
    );
    this.position.set(follow.x, follow.y, follow.z);
    this.velocity.x = follow.vx;
    this.velocity.y = follow.vy;
    this.velocity.z = follow.vz;
    this.#vY = follow.vy;

    if (collision) this.#resolveCollision(collision);

    this.#updateAttitude(dt, accelLat, accelLong);
    this.#wheelSpin += (this.#vLong / chassis.wheelRadius) * dt;
    this.#updateTransform();
    this.#placeWheels();

    // ── Ablesbares ────────────────────────────────────────────────────────
    const t = this.telemetry;
    t.speed = Math.hypot(this.#vLong, this.#vLat);
    t.forwardSpeed = this.#vLong;
    t.slip = t.speed > 1 ? Math.atan2(this.#vLat, Math.abs(this.#vLong)) : 0;
    t.slipFront = slipFront;
    t.slipRear = slipRear;
    t.wheelspin = wheelspin;
    t.steerAngle = this.#steerAngle;
    t.compression = clamp(compression / suspension.travel, 0, 1.5);
    t.airborne = this.#airborne;
    t.surface = surface;
    t.waterDepth = waterDepth;
    t.skid = Math.max(
      0,
      Math.min(
        1,
        Math.max(
          (Math.abs(slipRear) / tire.peakSlipRear - 0.7) / 0.3,
          t.wheelspin > 1 ? (t.wheelspin - 1) / 0.5 : 0,
          input.handbrake && speed > 3 ? 0.55 : 0,
        ),
      ),
    );
  }

  #lastLongAccel = 0;

  // ── Teilschritte ────────────────────────────────────────────────────────

  /**
   * Fahrzeugachsen aus dem Gierwinkel.
   *
   * **Hier stand ein Vorzeichenfehler, und er hat die Lenkung verkehrt herum
   * gemacht.** `#right` war mit `(cos, 0, −sin)` besetzt — bei Gierwinkel 0 also
   * `+X`, während das Fahrzeug nach `+Z` zeigt. In einem rechtshändigen System
   * mit `up = +Y` ist die Rechtsachse aber `forward × up = (−cos, 0, sin)`, bei
   * Gierwinkel 0 also `−X`. Der alte Wert war die **linke** Seite.
   *
   * Das Modell war in sich stimmig — es rechnete durchgehend in der
   * SAE-Konvention mit y nach links —, nur hieß die Achse falsch, und über die
   * Kette „Lenkeinschlag → Schräglauf → Seitenkraft → Giermoment" kam ein
   * Rechtseinschlag als Linkskurve heraus. Gemessen gegen den Rechtsvektor der
   * Kamera: Taste `D` versetzte das Auto **9,42 m nach links**, Taste `A`
   * 9,77 m nach rechts.
   *
   * Seitdem ist `#right` wirklich rechts, und alles, was daran hängt, bedeutet
   * das, was sein Name sagt: `vLat` ist die Geschwindigkeit nach rechts, ein
   * positiver Schwimmwinkel heißt „die Fahrtrichtung zeigt rechts an der Nase
   * vorbei", ein positiver Lenkwinkel heißt rechts.
   */
  #updateBasis(): void {
    const sin = Math.sin(this.#yaw);
    const cos = Math.cos(this.#yaw);
    this.#forward.set(sin, 0, cos);
    this.#right.set(-cos, 0, sin);
  }

  /**
   * Radeinschlag der Eingabe nachführen.
   *
   * Ratenbegrenzt und mit Tempo skaliert — beide Begründungen stehen bei
   * `STEERING.rate` bzw. `STEERING.speedFalloff`. Die Skalierung greift am
   * **Ziel**, nicht am Weg: sonst hinge die Lenkgeschwindigkeit am Tempo, und
   * bei 200 km/h reagierte das Lenkrad träge statt fein.
   */
  #steer(dt: number, request: number): void {
    const speed = Math.abs(this.#vLong);
    const limit = this.#spec.steering.maxAngle / (1 + speed / this.#spec.steering.speedFalloff);
    const target = clamp(request, -1, 1) * limit;
    const rate = Math.abs(target) < Math.abs(this.#steerAngle) ? this.#spec.steering.centerRate : this.#spec.steering.rate;
    const step = rate * dt;
    const delta = target - this.#steerAngle;
    this.#steerAngle += clamp(delta, -step, step);
  }

  /** Radaufstandspunkte und ihre Bodenhöhen. */
  #sampleWheels(ground: Ground): void {
    const halfTrack = this.#spec.chassis.track / 2;
    const offsets: readonly (readonly [number, number])[] = [
      [-halfTrack, this.#spec.derived.cgToFront],
      [halfTrack, this.#spec.derived.cgToFront],
      [-halfTrack, -this.#spec.derived.cgToRear],
      [halfTrack, -this.#spec.derived.cgToRear],
    ];

    // **Ein Rad ist kein Punkt.** Das Höhenfeld hat 1,5 m Texelabstand; auf der
    // Wiese stehen darin Stufen bis 15 cm, im Reisfeldgelände bis 23 cm. Ein
    // punktförmig abgetastetes Rad fällt in jede dieser Kerben und wird von jeder
    // Kante angehoben — die Federung sieht ein Rechtecksignal und antwortet mit
    // Sprüngen.
    //
    // Ein echtes Rad kann das nicht: es hat 31 cm Radius und **überbrückt**, was
    // schmaler ist als es selbst. Nachgebildet wird das als Hüllkurve — die Höhe
    // ist das **Maximum** über drei Proben im Radabstand längs der Fahrtrichtung.
    // Über eine Kuppe rollt das Rad oben, über eine Kerbe spannt es hinweg.
    //
    // Kostet dreimal so viele Höhenabfragen (12 statt 4 je Schritt) und ist damit
    // der teuerste Posten dieser Schleife. Gemessen bleibt der Schritt trotzdem
    // unter 0,03 ms.
    const reach = this.#spec.chassis.wheelRadius;
    for (let i = 0; i < 4; i++) {
      const [side, ahead] = offsets[i]!;
      const x = this.position.x + this.#right.x * side + this.#forward.x * ahead;
      const z = this.position.z + this.#right.z * side + this.#forward.z * ahead;
      let h = Math.max(
        ground.height(x, z),
        ground.height(x + this.#forward.x * reach, z + this.#forward.z * reach),
        ground.height(x - this.#forward.x * reach, z - this.#forward.z * reach),
      );
      // Belagsrütteln — Asphalt und Wasser bleiben glatt. Die Amplitude ist
      // klein gegen den Federweg, groß genug, dass die Karosserie und die
      // Kamera den Untergrund mitmachen. Deterministisch aus der Position.
      const rumbleAmp = rumbleFor(ground.surface(x, z));
      if (rumbleAmp > 0) {
        const pace = Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / SURFACE_FEEL.rumbleSpeed);
        h += rumbleAmp * pace * surfaceRumble(x, z);
      }
      this.#wheelGround[i] = h;
    }
  }

  /**
   * Die vier Räder ans **Fahrzeug** hängen — für das Bild.
   *
   * > **Hier stand bis P17 eine Zeile in `#sampleWheels`:**
   * > `this.#wheelPos[i].set(x, h + CHASSIS.wheelRadius, z)`. Die Radmitte lag
   * > damit *immer* einen Radradius über dem Boden — unabhängig davon, wo das
   * > Auto war. Sprang es über eine Kuppe, blieben die vier Räder am Boden
   * > liegen und die Karosserie flog allein davon. Genau so hat es der
   * > Auftraggeber beschrieben („die Räder trennen sich vom Auto"), und es war
   * > kein Fehler der Federung, sondern der Umstand, dass die Räder überhaupt
   * > nie am Aufbau hingen.
   * >
   * > Zweiter, kleinerer Teil desselben Fehlers: die Radposition folgte nur dem
   * > **Gierwinkel**. Nicken und Wanken des Aufbaus ließen sie unberührt, die
   * > Räder standen also auch bei 9° Nickwinkel senkrecht in der Landschaft.
   *
   * Jetzt hängt jedes Rad an seinem Aufnahmepunkt und federt **längs der
   * Hochachse des Aufbaus** — nicht längs der Weltachse. Das ist der Unterschied,
   * der am Hang und beim Bremsnicken sichtbar ist: ein Rad, das senkrecht zur
   * Welt federt, wandert bei geneigtem Aufbau aus dem Radkasten.
   *
   * Der Hub ist beidseitig begrenzt (`WHEEL_MIN_DROP`…`WHEEL_MAX_DROP`). Die
   * obere Grenze verhindert, dass ein Rad bei einem harten Einschlag durch das
   * Blech fährt; die untere ist die, die das Auto in der Luft zusammenhält.
   *
   * Läuft **nach** `#updateAttitude`, weil sie die frische Lage braucht.
   */
  #placeWheels(): void {
    const halfTrack = this.#spec.chassis.track / 2;
    this.#up.set(0, 1, 0).applyQuaternion(this.quaternion);
    // Fast waagerechter Aufbau ist der Normalfall; der Schutz greift erst, wenn
    // das Auto so schief steht, dass die Division unbrauchbar würde.
    const aufrecht = Math.max(0.2, this.#up.y);

    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -halfTrack : halfTrack;
      const ahead = i < 2 ? this.#spec.derived.cgToFront : -this.#spec.derived.cgToRear;
      // Aufnahmepunkt in Weltkoordinaten — über die **volle** Lage, also
      // einschließlich Nicken und Wanken.
      this.#scratch.set(side, 0, ahead).applyQuaternion(this.quaternion).add(this.position);
      // Wie weit müsste das Rad längs −up wandern, bis es den Boden berührt?
      const ziel = this.#wheelGround[i]! + this.#spec.chassis.wheelRadius;
      const hub = clamp((this.#scratch.y - ziel) / aufrecht, this.#spec.derived.wheelMinDrop, this.#spec.derived.wheelMaxDrop);
      this.#wheelPos[i]!.copy(this.#scratch).addScaledVector(this.#up, -hub);
    }
  }

  /**
   * Höhe der Stützebene am Schwerpunkt.
   *
   * Nur Räder in Reichweite der Feder. Mittel aller vier hebt bei einer
   * Spitze drei Räder in die Luft; Mittel der zwei mittleren hebt immer
   * noch an einem Absatz, sobald zwei Räder oben sind. Begründung und
   * Messung (y = 67 m in 3 s) in `reachableSupport`.
   */
  #contactHeight(): number {
    return reachableSupport(
      this.#wheelGround[0]!,
      this.#wheelGround[1]!,
      this.#wheelGround[2]!,
      this.#wheelGround[3]!,
      this.position.y - this.#spec.chassis.cgHeight,
      this.#spec.suspension.travel + 0.28,
    );
  }

  /**
   * Nicken und Wanken — Gelände plus Lastverlagerung, gefedert nachgeführt.
   *
   * Vorzeichen, weil sie sich nicht raten lassen: bei `Euler(pitch, yaw, roll,
   * 'YXZ')` dreht three um lokal X, und positives Nicken senkt die Nase
   * (`Rx(φ)·(0,0,1) = (0, −sinφ, cosφ)`). Bremsen (negative Längsbeschleunigung)
   * muss die Nase senken, also `−pitchPerG · a_long`. Positives Wanken hebt die
   * rechte Seite (`Rz(ψ)·(1,0,0) = (cosψ, sinψ, 0)`); in einer Rechtskurve
   * (positive Querbeschleunigung) soll sich der Wagen nach außen legen, also die
   * linke Seite senken — dasselbe Vorzeichen.
   */
  #updateAttitude(dt: number, accelLat: number, accelLong: number): void {
    const expected = this.position.y - this.#spec.chassis.cgHeight;
    const reach = this.#spec.suspension.travel + 0.28;
    const h0 = reachableWheel(this.#wheelGround[0]!, expected, reach);
    const h1 = reachableWheel(this.#wheelGround[1]!, expected, reach);
    const h2 = reachableWheel(this.#wheelGround[2]!, expected, reach);
    const h3 = reachableWheel(this.#wheelGround[3]!, expected, reach);
    const groundPitch = -Math.atan2((h0 + h1) / 2 - (h2 + h3) / 2, this.#spec.chassis.wheelbase);
    const groundRoll = Math.atan2((h1 + h3) / 2 - (h0 + h2) / 2, this.#spec.chassis.track);

    const targetPitch = clamp(
      groundPitch - this.#spec.suspension.pitchPerLongitudinalG * accelLong,
      -this.#spec.suspension.maxPitch - Math.abs(groundPitch),
      this.#spec.suspension.maxPitch + Math.abs(groundPitch),
    );
    const targetRoll = clamp(
      groundRoll + this.#spec.suspension.rollPerLateralG * accelLat,
      -this.#spec.suspension.maxRoll - Math.abs(groundRoll),
      this.#spec.suspension.maxRoll + Math.abs(groundRoll),
    );

    const blend = 1 - Math.exp(-this.#spec.suspension.attitudeRate * dt);
    this.#pitch += (targetPitch - this.#pitch) * blend;
    this.#roll += (targetRoll - this.#roll) * blend;
  }

  #updateTransform(): void {
    this.#euler.set(this.#pitch, this.#yaw, this.#roll);
    this.quaternion.setFromEuler(this.#euler);
  }

  /**
   * Karosserie gegen die statischen Hindernisse.
   *
   * Geprüft wird an **vier Ecken × zwei Höhen** (Begründung bei
   * `VEHICLE_COLLISION.probeHeights`). Aufgelöst wird über den **Mittelwert** der
   * gefundenen Normalen und nicht über deren Summe: in einer Innenecke ergäbe
   * die Summe den doppelten Weg und schleuderte das Auto heraus.
   *
   * Die Reaktion hat drei Teile, und alle drei sind nötig:
   *
   *  1. **Herausschieben**, damit nichts steckt.
   *  2. **Geschwindigkeit senkrecht zur Wand** wegnehmen (mit kleinem Rückprall),
   *     damit das Auto nicht in der Wand weiterdrückt.
   *  3. **Giermoment** aus dem Versatz des Kontakts zum Schwerpunkt. Ohne diesen
   *     Teil prallt ein Auto, das mit der linken Ecke anschlägt, gerade zurück —
   *     und das ist die Bewegung, an der jede Kollision unecht aussieht.
   */
  #resolveCollision(collision: CollisionWorld): void {
    const halfLength = this.#spec.chassis.bodyLength / 2;
    const halfWidth = this.#spec.chassis.bodyWidth / 2;
    const corners: readonly (readonly [number, number])[] = [
      [-halfWidth, halfLength],
      [halfWidth, halfLength],
      [-halfWidth, -halfLength],
      [halfWidth, -halfLength],
    ];

    let pushX = 0;
    let pushZ = 0;
    let torque = 0;
    let normalX = 0;
    let normalZ = 0;
    let contacts = 0;
    let deepest = 0;
    this.#brokeThisStep = 0;

    for (const [side, ahead] of corners) {
      const rx = this.#right.x * side + this.#forward.x * ahead;
      const rz = this.#right.z * side + this.#forward.z * ahead;
      const x = this.position.x + rx;
      const z = this.position.z + rz;

      // Tiefster Kontakt dieser Ecke über beide Prüfhöhen.
      let depth = 0;
      let nx = 0;
      let nz = 0;
      let hitId = -1;
      let hitSource = 0;
      let hitBreakable = false;
      for (const h of this.#spec.collision.probeHeights) {
        const hit = collision.query(
          x,
          this.position.y - this.#spec.chassis.cgHeight + h,
          z,
          this.#spec.collision.cornerRadius,
        );
        if (hit.depth > depth) {
          depth = hit.depth;
          nx = hit.nx;
          nz = hit.nz;
          hitId = hit.id;
          hitSource = hit.source;
          hitBreakable = hit.breakable;
        }
      }
      if (depth <= 0) continue;

      if (hitBreakable && hitId >= 0 && this.#brokeThisStep < MAX_BREAKS_PER_STEP) {
        const cornerVX = this.velocity.x + this.#yawRate * rz;
        const cornerVZ = this.velocity.z - this.#yawRate * rx;
        const approach = cornerVX * nx + cornerVZ * nz;
        const tree = hitSource === HIT_TREE;
        if (
          shouldBreak(
            this.#spec.chassis.mass,
            approach,
            tree ? TREE_BREAK_SPEED : RAIL_BREAK_SPEED,
            tree ? TREE_BREAK_ENERGY : RAIL_BREAK_ENERGY,
          )
        ) {
          collision.disableHit(hitId, hitSource);
          this.#brokeThisStep++;
          this.#breaks.push({
            kind: tree ? 'tree' : 'rail',
            id: hitId,
            x,
            y: this.position.y,
            z,
            vx: this.velocity.x,
            vz: this.velocity.z,
          });
          // Durchbrechen, nicht abprallen: 45 % der Normalkomponente weg,
          // der Rest trägt durch das Loch. Forza-Arcade, nicht ein zweiter
          // Anschlag an Luft.
          const into = this.velocity.x * nx + this.velocity.z * nz;
          if (into < 0) {
            this.velocity.x -= nx * into * 0.45;
            this.velocity.z -= nz * into * 0.45;
          }
          contacts++;
          deepest = Math.max(deepest, depth);
          continue;
        }
      }

      contacts++;
      deepest = Math.max(deepest, depth);
      pushX += nx * depth;
      pushZ += nz * depth;
      normalX += nx;
      normalZ += nz;

      // Geschwindigkeit **an der Ecke**, inklusive Drehanteil ω × r.
      // `v = v_Schwerpunkt + ω ŷ × r`, und `ŷ × (r_x, 0, r_z) = (r_z, 0, −r_x)`.
      // Dieselbe Vorzeichenkette wie beim Schräglauf oben — und derselbe Fehler.
      const cornerVX = this.velocity.x + this.#yawRate * rz;
      const cornerVZ = this.velocity.z - this.#yawRate * rx;
      const approach = cornerVX * nx + cornerVZ * nz;
      if (approach < 0) {
        // Impuls längs der Normalen; `(r × F)_y = r_z F_x − r_x F_z`.
        const impulse = -approach * (1 + this.#spec.collision.restitution) * this.#spec.chassis.mass;
        torque += (rz * nx - rx * nz) * impulse;
      }
    }

    this.telemetry.contacts = contacts;
    this.telemetry.lastPenetration = deepest;
    if (contacts === 0) return;

    const inv = 1 / contacts;
    pushX *= inv;
    pushZ *= inv;
    const pushLength = Math.hypot(pushX, pushZ);
    if (pushLength > this.#spec.collision.maxPushPerStep) {
      const scale = this.#spec.collision.maxPushPerStep / pushLength;
      pushX *= scale;
      pushZ *= scale;
    }
    this.position.x += pushX;
    this.position.z += pushZ;

    const nLength = Math.hypot(normalX, normalZ);
    if (nLength < 1e-6) return;
    normalX /= nLength;
    normalZ /= nLength;

    const along = this.velocity.x * normalX + this.velocity.z * normalZ;
    if (along < 0) {
      const change = -along * (1 + this.#spec.collision.restitution);
      this.velocity.x += normalX * change;
      this.velocity.z += normalZ * change;
    }
    // Schrammen: Tangentialanteil abschwächen. Das Auto verliert an der Planke
    // Tempo, wird aber nicht gestoppt.
    const tangential = 1 - this.#spec.collision.wallFriction;
    const vAlongN = this.velocity.x * normalX + this.velocity.z * normalZ;
    const tx = this.velocity.x - normalX * vAlongN;
    const tz = this.velocity.z - normalZ * vAlongN;
    this.velocity.x = normalX * vAlongN + tx * tangential;
    this.velocity.z = normalZ * vAlongN + tz * tangential;

    // **Kein Zurückschreiben nach `#vLong` / `#vLat` nötig.** Der Zustand ist
    // `velocity`; der nächste Schritt projiziert sie ohnehin neu. Als die beiden
    // noch Zustand waren, stand hier die Umrechnung — und sie zu vergessen hätte
    // geheißen, dass eine Kollision die Geschwindigkeit ändert und das Fahrmodell
    // es nicht merkt.
    this.#yawRate += (torque * this.#spec.collision.yawTransfer * inv) / this.#spec.chassis.yawInertia;
    // Ein Frontalanschlag mit 70 m/s ergibt sonst eine Drehung, bei der das Bild
    // nicht mehr lesbar ist.
    this.#yawRate = clamp(this.#yawRate, -this.#spec.limits.maxYawRate, this.#spec.limits.maxYawRate);
  }
}

/**
 * Reifenseitenkraft aus dem Schräglaufwinkel.
 *
 * Die Kennlinie hat vier Abschnitte; ihre Form, die Begründung und die Messung,
 * die zu ihr geführt hat, stehen bei `TIRE.plateauWidth`. Hier steht nur, was
 * der Code tut und warum er es *so* tut.
 *
 * `usedLongitudinal` ist die bereits verbrauchte Längskraft: der Reibkreis lässt
 * nur `√(grip² − Fx²)` für die Seitenführung übrig. Deshalb geht bei Vollbremsung
 * die Lenkbarkeit verloren, und deshalb wird ein Wagen mit durchdrehenden Rädern
 * hinten los.
 *
 * > **Was hier bis P17 stand, und warum es das Auto unfahrbar gemacht hat.** Die
 * > alte Fassung rechnete `f(n) = 2n/(1+n²)` und legte `TIRE.tailGrip` als
 * > **Betragsklemme** darüber:
 * >
 * > ```ts
 * > if (curve > -boden && curve < boden) curve = n > 0 ? boden : -boden;
 * > ```
 * >
 * > Gedacht war das gegen den Abfall wie `2/n` **hinter** dem Scheitel. Die
 * > Bedingung trifft aber jeden kleinen Betrag — und der kleinste Betrag der
 * > Kennlinie liegt bei `n = 0`. `2n/(1+n²) < 0,75` gilt für `n < 0,451`
 * > **und** für `n > 2,215`; geklemmt wurden also beide Enden. Gemessen:
 * >
 * > | Schräglauf | Kraftanteil alt | neu |
 * > |---:|---:|---:|
 * > | 0,01° | **0,750** | 0,001 |
 * > | 1,00° | **0,750** | 0,206 |
 * > | 5,00° | 0,841 | 0,846 |
 * >
 * > Der Reifen war damit ein **Schalter**: null bei exakt null Schräglauf, drei
 * > Viertel der Höchstkraft bei jedem Wert darüber. Die Folgen — Zittern mit
 * > 295 Vorzeichenwechseln in 300 Schritten, eine nicht monotone Lenkantwort und
 * > 10 m Versatz auf 10 s Geradeausfahrt — sind bei `TIRE.plateauWidth`
 * > tabelliert.
 * >
 * > **Zwei Lehren.** Eine Klemme auf einen *Betrag* trifft beide Enden des
 * > Wertebereichs; gemeint war ein Abschnitt, und ein Abschnitt gehört über
 * > seine **Variable** abgegrenzt (hier `n`), nicht über den Funktionswert. Und:
 * > die Kennlinie war nie tabelliert worden. Siebzehn Zeilen Ausgabe hätten den
 * > Fehler in einem Schritt gezeigt — genau der Punkt, den CLAUDE.md unter
 * > „Mittelwerte verstecken Formen" führt.
 */
function tireLateral(
  slip: number,
  peak: number,
  falloff: number,
  grip: number,
  usedLongitudinal: number,
  tire: TireSpec,
): number {
  if (grip <= 0) return 0;
  // Reibkreis — **mit einem Boden**. Die Wurzel allein geht bei voller
  // Längsausnutzung auf null, und eine Achse ohne jede Seitenführung ist nicht
  // „am Limit", sondern von der Fahrbahn abgemeldet. Herleitung des Werts bei
  // `TIRE.lateralReserve`.
  const budget = Math.max(
    grip * tire.lateralReserve,
    Math.sqrt(Math.max(0, grip * grip - usedLongitudinal * usedLongitudinal)),
  );
  const force = -Math.sign(slip) * gripCurve(Math.abs(slip), peak, falloff, tire) * grip;
  return clamp(force, -budget, budget);
}

/**
 * Der Kraftanteil 0…1 über dem **Betrag** des Schräglaufwinkels.
 *
 * Getrennt von `tireLateral`, weil die Form über dem Betrag definiert ist und
 * das Vorzeichen erst danach draufkommt. Die alte Fassung hat genau diese
 * Trennung nicht gemacht — und deshalb an der falschen Größe geklemmt.
 */
function gripCurve(absSlip: number, peak: number, falloff: number, tire: TireSpec): number {
  if (absSlip <= 0) return 0;

  // 1. Anstieg. `x(2−x)` hat bei x = 0 die Steigung 2 — über dem Winkel also
  //    `2/peak`, und das ist genau die Schräglaufsteifigkeit `C = 2 μ F_z /
  //    α_peak`, mit der die Stabilitätsrechnung bei `TIRE.peakSlipFront`
  //    argumentiert. Bei x = 1 ist die Steigung **null**, der Scheitel schließt
  //    also knickfrei an das Plateau an.
  if (absSlip < peak) {
    const x = absSlip / peak;
    return x * (2 - x);
  }

  // 2. Plateau — volle Kraft, während der Schräglauf schon wächst. Das ist der
  //    Bereich, in dem ein Fahrer die Grenze spürt, bevor sie ihn kostet.
  const plateauEnde = peak * (1 + tire.plateauWidth);
  if (absSlip < plateauEnde) return 1;

  // 3. Abfall auf den Rest. Glättung statt Gerade: sie läuft an **beiden** Enden
  //    waagerecht aus, der Übergang ist also auch hier knickfrei.
  const ende = Math.max(falloff, plateauEnde + 1e-6);
  if (absSlip < ende) {
    const t = (absSlip - plateauEnde) / (ende - plateauEnde);
    return 1 + (tire.tailGrip - 1) * t * t * (3 - 2 * t);
  }

  // 4. Rest. Gleitreibung — sie verschwindet nicht, nur weil das Rad quer steht.
  return tire.tailGrip;
}

function surfaceGrip(surface: Surface, tire: TireSpec): number {
  if (surface === 'asphalt') return 1;
  if (surface === 'kies') return tire.gripGravel;
  if (surface === 'wasser') return tire.gripWater;
  return tire.gripTerrain;
}

function rumbleFor(surface: Surface): number {
  if (surface === 'kies') return SURFACE_FEEL.rumbleGravel;
  if (surface === 'gelaende') return SURFACE_FEEL.rumbleTerrain;
  return 0;
}

/** Zwei Oktaven, −1…1, ortsfest. */
function surfaceRumble(x: number, z: number): number {
  return hash2(x * 4.1, z * 4.3) * 1.4 + hash2(x * 11.0, z * 9.7) * 0.6 - 1;
}

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
