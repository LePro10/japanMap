import { Euler, Quaternion, Vector3 } from 'three';

import {
  CG_TO_FRONT,
  CG_TO_REAR,
  CHASSIS,
  DRIVETRAIN,
  GRAVITY,
  STEERING,
  SUSPENSION,
  TIRE,
  VEHICLE_COLLISION,
} from '@/config/vehicle.config';
import type { CollisionWorld } from './CollisionWorld';

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
export type Surface = 'asphalt' | 'kies' | 'gelaende';

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
}

/** Statische Federlänge, sodass `k · x = m · g` bei Ruhehöhe `cgHeight` gilt. */
const STATIC_COMPRESSION = (CHASSIS.mass * GRAVITY) / SUSPENSION.stiffness;
const SPRING_REST = CHASSIS.cgHeight + STATIC_COMPRESSION;

/**
 * Bezugsgeschwindigkeit im Nenner des Schräglaufwinkels, in m/s.
 *
 * `α = atan(vLat / v)` hat bei `v → 0` eine Singularität: eine
 * Querbewegung von 1 cm/s im Stand ergäbe 90° Schräglauf und damit die volle
 * Reifenkraft aus dem Nichts. Mit einem Mindestwert im Nenner werden die Reifen
 * bei Schrittgeschwindigkeit zu **viskosen Dämpfern** — sie bremsen die
 * Querbewegung proportional zu ihr, statt einen Winkel zu melden. 2 m/s ist
 * knapp über Schrittgeschwindigkeit; darüber ist der Winkel unverfälscht.
 */
const SLIP_SPEED_FLOOR = 2;

/**
 * Unter diesem Tempo hält die Haftreibung das Auto **statisch** (m/s).
 *
 * Ohne diesen Term hat das Modell keine Kraft, die ein stehendes Auto an einem
 * Hang hält: der Rollwiderstand ist proportional zur Geschwindigkeit gedacht und
 * verschwindet mit ihr, der Hangabtrieb nicht. Ein Wagen ohne Gas würde jede
 * Böschung hinunterrollen und unten in einer gedämpften Schwingung liegen. Der
 * Term ersetzt kein Reifenmodell — er ist die Haftreibung, die ein rollendes
 * Modell ohne Raddrehzahl nicht von selbst hat.
 */
const STATIC_HOLD_SPEED = 0.8;

/** Größte Gierrate in rad/s. Begründung an der Stelle, an der sie greift. */
const MAX_YAW_RATE = 8;

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

  #yaw = 0;
  #yawRate = 0;
  #pitch = 0;
  #roll = 0;
  #vLong = 0;
  #vLat = 0;
  #vY = 0;
  #steerAngle = 0;
  #airborne = false;
  /** Drehwinkel der Räder, nur fürs Bild. */
  #wheelSpin = 0;

  readonly #forward = new Vector3();
  readonly #right = new Vector3();
  readonly #normal = new Vector3(0, 1, 0);
  readonly #euler = new Euler(0, 0, 0, 'YXZ');

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
  };

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
   * Auf eine Stelle setzen und allen Bewegungszustand verwerfen.
   *
   * Alles wird zurückgesetzt, auch Gierrate und Federweg: ein Respawn mitten im
   * Drift, der die Drehung behält, dreht sich am neuen Ort weiter — und das sieht
   * nach einem Fehler aus, weil es einer ist.
   */
  respawn(x: number, z: number, heading: number, ground: Ground): void {
    const groundY = ground.height(x, z);
    this.position.set(x, groundY + CHASSIS.cgHeight, z);
    this.#yaw = heading;
    this.#yawRate = 0;
    this.#pitch = 0;
    this.#roll = 0;
    this.#vLong = 0;
    this.#vLat = 0;
    this.#vY = 0;
    this.#steerAngle = 0;
    this.#airborne = false;
    // **Auch die Lastverlagerung des letzten Schritts und der Raddrehwinkel.**
    // Erstere geht in die Radlasten des ersten neuen Schritts ein; blieb sie
    // stehen, hing das Ergebnis eines Messlaufs davon ab, was das Auto **davor**
    // getan hatte. Gemessen: zwei Läufe derselben Strecke endeten 6 cm
    // auseinander (742,26 m gegen 742,20 m). Die Ketten dieses Projekts sind
    // deterministisch; wenn nicht, ist etwas kaputt.
    this.#lastLongAccel = 0;
    this.#wheelSpin = 0;
    this.velocity.set(0, 0, 0);
    this.#updateBasis();
    this.#sampleWheels(ground);
    this.#updateTransform();

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
    t.compression = STATIC_COMPRESSION / SUSPENSION.travel;
    t.airborne = false;
    t.lastPenetration = 0;
    t.contacts = 0;
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
    this.#updateBasis();
    this.#steer(dt, input.steer);
    this.#sampleWheels(ground);

    // **Längs- und Quergeschwindigkeit werden abgeleitet, nicht fortgeschrieben.**
    // Der Zustand ist `velocity` in Weltkoordinaten; siehe den Block „Warum in
    // Weltkoordinaten integriert wird" weiter unten. Diese beiden Zeilen sind die
    // Projektion auf die Fahrzeugachsen, und mehr sind sie nicht.
    this.#vLong = this.velocity.x * this.#forward.x + this.velocity.z * this.#forward.z;
    this.#vLat = this.velocity.x * this.#right.x + this.velocity.z * this.#right.z;

    const contactY = this.#contactHeight();
    ground.normal(this.position.x, this.position.z, this.#normal);
    const surface = ground.surface(this.position.x, this.position.z);

    // ── Aufbau und Federweg ───────────────────────────────────────────────
    //
    // Der Federweg wird **längs der Normalen** gemessen: der senkrechte Abstand
    // mal `n_y`. Sonst federte ein Auto auf einer 20°-Rampe um 6 % zu weit ein
    // und wäre dort messbar tiefer eingestellt als in der Ebene.
    const gap = this.position.y - contactY;
    let compression = SPRING_REST - gap * this.#normal.y;
    this.#airborne = compression <= 0;

    let springForce = 0;
    if (!this.#airborne) {
      const travelOver = compression - SUSPENSION.travel;
      // Anschlag: jenseits des Federwegs sitzt der Aufbau auf dem Gummipuffer,
      // und der ist zehnmal härter. Ohne ihn schluckt eine Bordsteinkante den
      // ganzen Federweg und der Aufbau taucht durch den Boden.
      const stiffness =
        travelOver > 0
          ? SUSPENSION.stiffness * compression + SUSPENSION.stiffness * 9 * travelOver
          : SUSPENSION.stiffness * compression;
      springForce = Math.max(0, stiffness - SUSPENSION.damping * this.#vY * this.#normal.y);
    } else {
      compression = 0;
    }

    this.#vY += (springForce / CHASSIS.mass - GRAVITY) * dt;

    // ── Radlasten ─────────────────────────────────────────────────────────
    //
    // Grundlast aus der Federkraft, mit `cosθ` auf die Hangnormale bezogen.
    // In der Luft ist sie null, und damit sind alle Reifenkräfte null — genau
    // richtig, ein Rad ohne Boden überträgt nichts.
    const load = this.#airborne ? 0 : springForce * this.#normal.y;
    // Längs-Lastverlagerung: ΔFz = m · a_x · h / L. Verwendet wird die
    // Beschleunigung des **letzten** Schritts (in `#lastLongAccel`), weil die des
    // aktuellen erst am Ende feststeht — ein Schritt Verzug bei 60 Hz ist 17 ms
    // und nicht spürbar, eine Iteration darüber wäre der Aufwand nicht wert.
    const transfer = (CHASSIS.mass * this.#lastLongAccel * CHASSIS.cgHeight) / CHASSIS.wheelbase;
    const loadFront = Math.max(0, load * CHASSIS.frontWeight - transfer);
    const loadRear = Math.max(0, load * (1 - CHASSIS.frontWeight) + transfer);

    const gripFactor = surfaceGrip(surface);
    const muFront = TIRE.gripAsphalt * gripFactor;
    const muRear = TIRE.gripAsphalt * gripFactor * TIRE.rearGripFactor;

    // ── Schräglaufwinkel ──────────────────────────────────────────────────
    const speedRef = Math.max(Math.abs(this.#vLong), SLIP_SPEED_FLOOR);
    // Rückwärts ist das Vorzeichen der Lenkwirkung umgekehrt; das ergibt sich von
    // selbst, wenn man mit der **vorzeichenbehafteten** Längsgeschwindigkeit
    // rechnet. Deshalb `vLong` und nicht `|vLong|` im Zähler des Nenners.
    const direction = this.#vLong < 0 ? -1 : 1;
    const slipFront =
      Math.atan2(this.#vLat + this.#yawRate * CG_TO_FRONT, speedRef) - this.#steerAngle * direction;
    const slipRear = Math.atan2(this.#vLat - this.#yawRate * CG_TO_REAR, speedRef);

    // ── Längskräfte ───────────────────────────────────────────────────────
    let throttle = input.throttle;
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
          this.#vLong > -DRIVETRAIN.reverseMaxSpeed
            ? -throttle * DRIVETRAIN.maxDriveForce * DRIVETRAIN.reverseForceFactor
            : 0;
      } else {
        // Kraftbegrenzt bei niedrigem, leistungsbegrenzt bei hohem Tempo:
        // `F = min(F_max, P / v)`. Die Endgeschwindigkeit ergibt sich damit aus
        // dem Gleichgewicht mit dem Luftwiderstand und wird nicht gesetzt.
        const speedForPower = Math.max(Math.abs(this.#vLong), 4);
        driveForce = throttle * Math.min(DRIVETRAIN.maxDriveForce, DRIVETRAIN.power / speedForPower);
      }
    }

    const brakeTotal = brake * DRIVETRAIN.brakeForce;
    const brakeSign = this.#vLong > 0 ? -1 : this.#vLong < 0 ? 1 : 0;
    const brakeFront = brakeTotal * DRIVETRAIN.brakeBias * brakeSign;
    let brakeRear = brakeTotal * (1 - DRIVETRAIN.brakeBias) * brakeSign;
    if (input.handbrake) brakeRear += DRIVETRAIN.handbrakeForce * (brakeSign !== 0 ? brakeSign : -1);

    // Reibkreis hinten: was die Längsrichtung nimmt, fehlt der Querführung.
    const gripRear = muRear * loadRear;
    const requestedRear = driveForce + brakeRear;
    const usedRear = clamp(requestedRear, -gripRear, gripRear);
    // **Der Durchdrehfaktor ist der Drift-Schalter.** Vollgas verlangt mehr, als
    // die Hinterachse hergibt (`maxDriveForce` liegt 8,6 % über der Haftgrenze —
    // Herleitung dort); der Überschuss bleibt nicht als Kraft übrig, sondern
    // frisst die Seitenführung. Genau das macht am Kurvenausgang aus Gas einen
    // Übersteuerimpuls.
    const wheelspin = gripRear > 1 ? Math.abs(requestedRear) / gripRear : 0;
    const spinLoss = wheelspin > 1 ? clamp(1 / wheelspin, 0.25, 1) : 1;

    const gripFront = muFront * loadFront;
    const usedFront = clamp(brakeFront, -gripFront, gripFront);

    // ── Querkräfte ────────────────────────────────────────────────────────
    const lateralFront = tireLateral(slipFront, TIRE.peakSlipFront, gripFront, usedFront);
    let lateralRear = tireLateral(slipRear, TIRE.peakSlipRear, gripRear, usedRear) * spinLoss;
    // Handbremse: das Hinterrad steht, im Reibkreis bleibt fast nichts für die
    // Querführung. Nicht null — sonst ist der Handbremsdrift nicht lenkbar.
    if (input.handbrake) lateralRear *= TIRE.lockedLateralFactor;

    // ── Widerstände ───────────────────────────────────────────────────────
    const speed = Math.hypot(this.#vLong, this.#vLat);
    const drag = -DRIVETRAIN.drag * this.#vLong * Math.abs(this.#vLong);
    const rollingCoefficient =
      surface === 'asphalt'
        ? DRIVETRAIN.rollingResistance
        : surface === 'kies'
          ? (DRIVETRAIN.rollingResistance + DRIVETRAIN.rollingResistanceTerrain) / 2
          : DRIVETRAIN.rollingResistanceTerrain;
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

    let accelLong = forceLong / CHASSIS.mass;
    const accelLat = forceLat / CHASSIS.mass;

    // Haftreibung im Stand — Begründung bei `STATIC_HOLD_SPEED`.
    if (!this.#airborne && throttle <= 0 && speed < STATIC_HOLD_SPEED) {
      const holdLimit = (muFront * loadFront + gripRear) / CHASSIS.mass;
      const needed = -this.#vLong / dt - accelLong;
      accelLong += clamp(needed, -holdLimit, holdLimit);
    }
    this.#lastLongAccel = accelLong;

    this.velocity.x +=
      (this.#forward.x * accelLong + this.#right.x * accelLat + slopeX) * dt;
    this.velocity.z +=
      (this.#forward.z * accelLong + this.#right.z * accelLat + slopeZ) * dt;

    // ── Gieren ────────────────────────────────────────────────────────────
    let yawTorque =
      lateralFront * Math.cos(this.#steerAngle) * CG_TO_FRONT - lateralRear * CG_TO_REAR;
    // Die einzige Fahrhilfe: Dämpfung **hinter** dem Ausbruchpunkt. Bei normalem
    // Schräglauf ist der Term exakt null (siehe `STEERING.driftDamping`).
    const excess = Math.abs(slipRear) - TIRE.peakSlipRear;
    if (excess > 0 && !this.#airborne) {
      yawTorque -=
        this.#yawRate *
        STEERING.driftDamping *
        Math.min(1, excess / TIRE.peakSlipRear) *
        CHASSIS.yawInertia;
    }
    this.#yawRate += (yawTorque / CHASSIS.yawInertia) * dt;
    // In der Luft dreht sich nichts weiter auf: ohne Reifen gibt es kein
    // Giermoment, und die vorhandene Drehung läuft nur aus.
    if (this.#airborne) this.#yawRate *= Math.exp(-0.6 * dt);
    // **Deckel auf die Gierrate**, und zwar immer und nicht nur nach einem
    // Anschlag. 8 rad/s sind 1,3 Umdrehungen je Sekunde — mehr dreht sich ein
    // Auto auf Asphalt nicht, und oberhalb davon wird `ω·dt` so groß, dass die
    // Winkelintegration selbst ungenau wird (bei 8 rad/s sind es 7,6° je Schritt).
    this.#yawRate = clamp(this.#yawRate, -MAX_YAW_RATE, MAX_YAW_RATE);
    this.#yaw += this.#yawRate * dt;

    // ── Lage integrieren ──────────────────────────────────────────────────
    this.#updateBasis();
    this.velocity.y = this.#vY;
    this.position.addScaledVector(this.velocity, dt);

    // Boden nicht durchfallen. Der Fall tritt bei einem harten Aufschlag auf, wo
    // die Feder in einem Schritt mehr Weg braucht, als sie hat.
    const floor = ground.height(this.position.x, this.position.z) + CHASSIS.wheelRadius * 0.5;
    if (this.position.y < floor) {
      this.position.y = floor;
      if (this.#vY < 0) this.#vY = 0;
    }

    if (collision) this.#resolveCollision(collision);

    this.#updateAttitude(dt, accelLat, accelLong);
    this.#wheelSpin += (this.#vLong / CHASSIS.wheelRadius) * dt;
    this.#updateTransform();

    // ── Ablesbares ────────────────────────────────────────────────────────
    const t = this.telemetry;
    t.speed = Math.hypot(this.#vLong, this.#vLat);
    t.forwardSpeed = this.#vLong;
    t.slip = t.speed > 1 ? Math.atan2(this.#vLat, Math.abs(this.#vLong)) : 0;
    t.slipFront = slipFront;
    t.slipRear = slipRear;
    t.wheelspin = wheelspin;
    t.steerAngle = this.#steerAngle;
    t.compression = clamp(compression / SUSPENSION.travel, 0, 1.5);
    t.airborne = this.#airborne;
    t.surface = surface;
  }

  #lastLongAccel = 0;

  // ── Teilschritte ────────────────────────────────────────────────────────

  #updateBasis(): void {
    const sin = Math.sin(this.#yaw);
    const cos = Math.cos(this.#yaw);
    this.#forward.set(sin, 0, cos);
    this.#right.set(cos, 0, -sin);
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
    const limit = STEERING.maxAngle / (1 + speed / STEERING.speedFalloff);
    const target = clamp(request, -1, 1) * limit;
    const rate = Math.abs(target) < Math.abs(this.#steerAngle) ? STEERING.centerRate : STEERING.rate;
    const step = rate * dt;
    const delta = target - this.#steerAngle;
    this.#steerAngle += clamp(delta, -step, step);
  }

  /** Radaufstandspunkte und ihre Bodenhöhen. */
  #sampleWheels(ground: Ground): void {
    const halfTrack = CHASSIS.track / 2;
    const offsets: readonly (readonly [number, number])[] = [
      [-halfTrack, CG_TO_FRONT],
      [halfTrack, CG_TO_FRONT],
      [-halfTrack, -CG_TO_REAR],
      [halfTrack, -CG_TO_REAR],
    ];

    for (let i = 0; i < 4; i++) {
      const [side, ahead] = offsets[i]!;
      const x = this.position.x + this.#right.x * side + this.#forward.x * ahead;
      const z = this.position.z + this.#right.z * side + this.#forward.z * ahead;
      const h = ground.height(x, z);
      this.#wheelGround[i] = h;
      this.#wheelPos[i]!.set(x, h + CHASSIS.wheelRadius, z);
    }
  }

  /** Höhe der Stützebene am Schwerpunkt: Mittel der vier Aufstandspunkte. */
  #contactHeight(): number {
    return (
      (this.#wheelGround[0]! + this.#wheelGround[1]! + this.#wheelGround[2]! + this.#wheelGround[3]!) /
      4
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
    const groundPitch = -Math.atan2(
      (this.#wheelGround[0]! + this.#wheelGround[1]!) / 2 -
        (this.#wheelGround[2]! + this.#wheelGround[3]!) / 2,
      CHASSIS.wheelbase,
    );
    const groundRoll = Math.atan2(
      (this.#wheelGround[1]! + this.#wheelGround[3]!) / 2 -
        (this.#wheelGround[0]! + this.#wheelGround[2]!) / 2,
      CHASSIS.track,
    );

    const targetPitch = clamp(
      groundPitch - SUSPENSION.pitchPerLongitudinalG * accelLong,
      -SUSPENSION.maxPitch - Math.abs(groundPitch),
      SUSPENSION.maxPitch + Math.abs(groundPitch),
    );
    const targetRoll = clamp(
      groundRoll + SUSPENSION.rollPerLateralG * accelLat,
      -SUSPENSION.maxRoll - Math.abs(groundRoll),
      SUSPENSION.maxRoll + Math.abs(groundRoll),
    );

    const blend = 1 - Math.exp(-SUSPENSION.attitudeRate * dt);
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
    const halfLength = CHASSIS.bodyLength / 2;
    const halfWidth = CHASSIS.bodyWidth / 2;
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

    for (const [side, ahead] of corners) {
      const rx = this.#right.x * side + this.#forward.x * ahead;
      const rz = this.#right.z * side + this.#forward.z * ahead;
      const x = this.position.x + rx;
      const z = this.position.z + rz;

      // Tiefster Kontakt dieser Ecke über beide Prüfhöhen.
      let depth = 0;
      let nx = 0;
      let nz = 0;
      for (const h of VEHICLE_COLLISION.probeHeights) {
        const hit = collision.query(
          x,
          this.position.y - CHASSIS.cgHeight + h,
          z,
          VEHICLE_COLLISION.cornerRadius,
        );
        if (hit.depth > depth) {
          depth = hit.depth;
          nx = hit.nx;
          nz = hit.nz;
        }
      }
      if (depth <= 0) continue;

      contacts++;
      deepest = Math.max(deepest, depth);
      pushX += nx * depth;
      pushZ += nz * depth;
      normalX += nx;
      normalZ += nz;

      // Geschwindigkeit **an der Ecke**, inklusive Drehanteil ω × r.
      const cornerVX = this.velocity.x - this.#yawRate * rz;
      const cornerVZ = this.velocity.z + this.#yawRate * rx;
      const approach = cornerVX * nx + cornerVZ * nz;
      if (approach < 0) {
        // Impuls längs der Normalen; `(r × F)_y = r_z F_x − r_x F_z`.
        const impulse = -approach * (1 + VEHICLE_COLLISION.restitution) * CHASSIS.mass;
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
    if (pushLength > VEHICLE_COLLISION.maxPushPerStep) {
      const scale = VEHICLE_COLLISION.maxPushPerStep / pushLength;
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
      const change = -along * (1 + VEHICLE_COLLISION.restitution);
      this.velocity.x += normalX * change;
      this.velocity.z += normalZ * change;
    }
    // Schrammen: Tangentialanteil abschwächen. Das Auto verliert an der Planke
    // Tempo, wird aber nicht gestoppt.
    const tangential = 1 - VEHICLE_COLLISION.wallFriction;
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
    this.#yawRate += (torque * VEHICLE_COLLISION.yawTransfer * inv) / CHASSIS.yawInertia;
    // Ein Frontalanschlag mit 70 m/s ergibt sonst eine Drehung, bei der das Bild
    // nicht mehr lesbar ist.
    this.#yawRate = clamp(this.#yawRate, -MAX_YAW_RATE, MAX_YAW_RATE);
  }
}

/**
 * Reifenseitenkraft aus dem Schräglaufwinkel.
 *
 * `f(n) = 2n / (1 + n²)` mit `n = α / α_peak` — Maximum 1 bei `n = 1`, danach
 * Abfall wie `2/n`. Warum der Abfall nicht verhandelbar ist, steht bei `TIRE`.
 *
 * `usedLongitudinal` ist die bereits verbrauchte Längskraft: der Reibkreis lässt
 * nur `√(grip² − Fx²)` für die Seitenführung übrig. Deshalb geht bei Vollbremsung
 * die Lenkbarkeit verloren, und deshalb wird ein Wagen mit durchdrehenden Rädern
 * hinten los.
 */
function tireLateral(
  slip: number,
  peak: number,
  grip: number,
  usedLongitudinal: number,
): number {
  if (grip <= 0) return 0;
  const n = slip / peak;
  const curve = (2 * n) / (1 + n * n);
  const budget = Math.sqrt(Math.max(0, grip * grip - usedLongitudinal * usedLongitudinal));
  const force = -curve * grip;
  return clamp(force, -budget, budget);
}

function surfaceGrip(surface: Surface): number {
  return surface === 'asphalt' ? 1 : surface === 'kies' ? TIRE.gripGravel : TIRE.gripTerrain;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
