import { Vector3, type PerspectiveCamera } from 'three';

import { cockpitEye, hoodCowl } from '@/config/cabin.config';
import { CAMERA } from '@/config/world.config';
import { CHASE_CAMERA, COCKPIT_CAMERA } from '@/config/vehicle.config';
import type { Ground, Vehicle } from './Vehicle';

/**
 * Die Kamera im Fahrmodus — PLAN.md P14, Feel in der Darstellung.
 *
 * ## Warum sie nicht starr hinter dem Auto hängt
 *
 * Eine Kamera, die exakt auf der Fahrzeugachse sitzt, macht aus einem Drift ein
 * Bild, in dem sich nur die Landschaft dreht: das Auto steht mittig und gerade,
 * der Schwimmwinkel ist unsichtbar. Damit fehlt genau die Rückmeldung, die man
 * zum Fangen braucht — man fährt dann nach Gehör, das es hier nicht gibt.
 *
 * Sie richtet sich deshalb an einer **Mischung aus Fahrtrichtung und
 * Fahrzeugachse** aus (`CHASE_CAMERA.velocityBlend`). Im Drift läuft die Kamera
 * der Fahrtrichtung nach, das Auto steht schräg im Bild, und der Winkel zwischen
 * beiden *ist* die Anzeige.
 *
 * ## Last statt nur Tempo
 *
 * Blickfeld und Arm wachsen mit dem Tempo seit P22. Das zeigt *wie schnell*,
 * nicht *ob gerade gezogen oder gebremst wird*. Die Beschleunigung kommt aus
 * der Telemetrie (`accelLong` / `accelLat`) und wird hier geglättet — ein Delta
 * aus Kamerapositionen am variablen Frame wäre Rauschen. Gas verlängert den
 * Arm, Bremse kürzt ihn; beides sind eigene Regler, absichtlich nicht derselbe
 * mit Vorzeichen (P25: ein Regler je Messung).
 *
 * Querbewegung über Roll und Look-ahead, nicht über Positions-Rütteln.
 * Ein Sinus auf der Kameraposition hat das Bild zittern lassen — das liest
 * sich als Glitch. Übrig ist nur ein einmaliger Landestoß.
 *
 * ## Drei Ansichten
 *
 * `chase` (Verfolger), `hood` (Haube), `cockpit` (Sitz). Die Haube sitzt *auf*
 * dem Blech, vor der Scheibe — nicht im Gewächshaus. Der Sitz ist optional;
 * Default bleibt der Verfolger. Taste C zyklisch, Mausrad nur Verfolger ↔ Haube.
 */
export type ChaseMode = 'chase' | 'hood' | 'cockpit';

export function viewLabel(mode: ChaseMode): string {
  return mode === 'hood' ? 'Haube' : mode === 'cockpit' ? 'Sitz' : 'Verfolger';
}

export class ChaseCamera {
  mode: ChaseMode = 'chase';

  /** Gefilterte Blickrichtung der Kamera (Weltgier in Radiant). */
  #heading = 0;
  /** Mausversatz auf die gefilterte Richtung. */
  #yawOffset = 0;
  /**
   * Nick des Blicks, positiv = Himmel. Am Boom `height − arm·sin(pitch)`,
   * an der Haube `+sin(pitch)` aufs Blickziel — dieselbe Zahl, dieselbe
   * Mausrichtung. Begründung bei `CHASE_CAMERA.pitchMin`.
   */
  #pitchOffset = 0;

  readonly #position = new Vector3();
  readonly #target = new Vector3();
  readonly #desired = new Vector3();
  readonly #lookAt = new Vector3();
  readonly #shake = new Vector3();
  readonly #right = new Vector3();
  readonly #offset = new Vector3();
  readonly #lookLocal = new Vector3();

  #fov = CHASE_CAMERA.fov;
  #initialized = false;
  /**
   * Nacken-Feder, 0 = starr am Blech. Debug-Schalter analog Forza Motion Off.
   * 1 ist Normal; die ODE steht in `#stepNeck`.
   */
  motion = 1;

  #neck = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

  /** Geglätteter Nitro-Zustand, 0…1 — treibt Blickwinkel und Abstand. */
  #boost = 0;
  /** Soll-Zoom, 1 = `CHASE_CAMERA.distance`. */
  #zoom = 1;
  /** Angewandter Zoom, folgt `#zoom` mit `zoomRate`. */
  #zoomApplied = 1;
  /** Geglättete Beschleunigung, damit ein Physik-Spike kein Kameraruck ist. */
  #accelLong = 0;
  #accelLat = 0;
  #roll = 0;
  /** 1 = voller Arm, `occludeMin` = am Blech. */
  #occlude = 1;
  #wasAirborne = false;

  /** Blick drehen — Wegbetrag in Pixeln, wie bei der Maus. */
  look(dx: number, dy: number): void {
    this.#yawOffset -= dx * CHASE_CAMERA.lookSensitivity;
    this.#pitchOffset = clamp(
      this.#pitchOffset - dy * CHASE_CAMERA.lookSensitivity,
      CHASE_CAMERA.pitchMin,
      CHASE_CAMERA.pitchMax,
    );
    // Den Gierversatz auf ±π halten. Ohne das wächst er über eine lange Sitzung
    // ins Unendliche, und die Winkelinterpolation unten bekommt Argumente, bei
    // denen `Math.atan2` nichts mehr retten kann.
    this.#yawOffset = wrapAngle(this.#yawOffset);
  }

  /**
   * Boom näher/weiter. Faktor > 1 = weiter weg.
   *
   * An der Haube ist der Arm schon null: eine Rastung weiter weg steigt in
   * den Verfolger bei `zoomMin`, eine Rastung näher tut nichts. Umgekehrt
   * wechselt der Verfolger an `zoomMin` in die Haube — das ist das Ende
   * von „näher", nicht ein zweiter Modus daneben. Der Sitz ist **nicht**
   * auf diesem Weg erreichbar: wer zoomt, soll nicht im Cockpit landen.
   */
  zoom(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    if (this.mode === 'cockpit') return;
    if (this.mode === 'hood') {
      if (factor > 1.002) {
        this.mode = 'chase';
        this.#zoom = CHASE_CAMERA.zoomMin;
        this.#zoomApplied = CHASE_CAMERA.zoomMin;
        this.#initialized = false;
      }
      return;
    }
    if (factor < 0.998 && this.#zoom <= CHASE_CAMERA.zoomMin + 1e-4) {
      this.mode = 'hood';
      return;
    }
    this.#zoom = clamp(this.#zoom * factor, CHASE_CAMERA.zoomMin, CHASE_CAMERA.zoomMax);
  }

  /** Nach einem Moduswechsel oder Respawn: hart hinter das Auto setzen. */
  reset(vehicle: Vehicle): void {
    this.#heading = vehicle.yaw;
    this.#yawOffset = 0;
    this.#pitchOffset = 0;
    this.#initialized = false;
    this.#accelLong = 0;
    this.#accelLat = 0;
    this.#roll = 0;
    this.#occlude = 1;
    this.#shake.set(0, 0, 0);
    this.#wasAirborne = vehicle.telemetry.airborne;
    this.#neck.x = this.#neck.y = this.#neck.z = 0;
    this.#neck.vx = this.#neck.vy = this.#neck.vz = 0;
  }

  toggleMode(): ChaseMode {
    // Sitz zuerst: C ist der Weg in die First Person, nicht aufs Blech.
    this.mode = this.mode === 'chase' ? 'cockpit' : this.mode === 'cockpit' ? 'hood' : 'chase';
    this.#initialized = false;
    return this.mode;
  }

  /**
   * Kamera setzen. Läuft im **variablen** Schritt (`update`), nicht im festen.
   *
   * Das ist Absicht: die Kamera ist Darstellung und darf mit der Bildrate laufen.
   * Eine gefederte Nachführung im 60-Hz-Schritt würde bei 144 FPS dreimal
   * denselben Zwischenstand zeigen und dabei ruckeln — dieselbe Begründung, aus
   * der `FreeFlyController` in `update` und nicht in `fixedUpdate` läuft.
   */
  update(dt: number, vehicle: Vehicle, ground: Ground, camera: PerspectiveCamera): void {
    const speed = vehicle.telemetry.speed;
    const t = vehicle.telemetry;

    this.#zoomApplied +=
      (this.#zoom - this.#zoomApplied) * (1 - Math.exp(-CHASE_CAMERA.zoomRate * dt));

    const accelBlend = 1 - Math.exp(-CHASE_CAMERA.accelRate * dt);
    this.#accelLong += (t.accelLong - this.#accelLong) * accelBlend;
    this.#accelLat += (t.accelLat - this.#accelLat) * accelBlend;

    // ── Blickrichtung ─────────────────────────────────────────────────────
    let desiredHeading = vehicle.yaw;
    // Die Fahrtrichtung zählt nur bei **Vorwärtsfahrt** mit: rückwärts zeigt der
    // Geschwindigkeitsvektor nach hinten, und die Kamera schwenkte beim
    // Rangieren um 180°.
    if (speed > 0.5 && t.forwardSpeed > 0.5) {
      const velocityHeading = Math.atan2(vehicle.velocity.x, vehicle.velocity.z);
      const weight =
        CHASE_CAMERA.velocityBlend * Math.min(1, speed / CHASE_CAMERA.velocityBlendSpeed);
      desiredHeading = vehicle.yaw + wrapAngle(velocityHeading - vehicle.yaw) * weight;
    }

    const headingBlend = 1 - Math.exp(-CHASE_CAMERA.positionRate * dt);
    this.#heading += wrapAngle(desiredHeading - this.#heading) * headingBlend;
    this.#heading = wrapAngle(this.#heading);

    // Mausschwenk läuft bei Gas nach hinten zurück — Begründung bei `recenterRate`.
    // Im Sitz langsamer: wer in die Kurve sieht, soll sie ansehen dürfen.
    if (t.forwardSpeed > 2) {
      const recenter =
        this.mode === 'cockpit' ? COCKPIT_CAMERA.recenterRate : CHASE_CAMERA.recenterRate;
      this.#yawOffset *= Math.exp(-recenter * dt);
    }

    // Nitro-Zustand **vor** der Position, damit Arm und Blickfeld denselben
    // Frame schlagen. Vorher hing der Arm ein Frame hinter dem FOV.
    const boost = t.boosting ? 1 : 0;
    const boostRate = boost > this.#boost ? CHASE_CAMERA.fovBoostRate : CHASE_CAMERA.fovRate;
    this.#boost += (boost - this.#boost) * (1 - Math.exp(-boostRate * dt));

    this.#updateShake(dt, vehicle);

    if (this.mode === 'cockpit') {
      this.#updateCockpit(dt, vehicle, camera);
    } else if (this.mode === 'hood') {
      this.#updateHood(vehicle, camera);
    } else {
      this.#updateChase(dt, vehicle, ground, camera);
    }

    // ── Blickfeld ─────────────────────────────────────────────────────────
    //
    // Der Zug bei Tempo. Neu gesetzt wird die Projektionsmatrix nur bei
    // merklicher Änderung: sie hängt an der Kamera, und mehrere Systeme
    // (Spiegelung, PostFX) lesen sie je Frame.
    //
    // **Der Nitro läuft mit einer eigenen, viel schnelleren Zeitkonstanten** —
    // und das ist keine Kosmetik, sondern der Unterschied zwischen einem Boost,
    // den man *sieht*, und einem, den man nur im Tacho abliest. Der Tempo-Anteil
    // darf träge sein (er folgt einer trägen Größe), der Nitro-Anteil nicht: er
    // ist ein Knopfdruck, und ein Knopfdruck, dessen Wirkung eine halbe Sekunde
    // braucht, fühlt sich nach nichts an.
    //
    // Sitz und Haube haben eigene Blickfelder. Den Chase-Zug 62→82 in die
    // Kabine zu übernehmen macht aus der Armatur eine Wand.
    let targetFov: number;
    if (this.mode === 'cockpit') {
      targetFov = COCKPIT_CAMERA.fov + COCKPIT_CAMERA.fovBoost * this.#boost;
    } else if (this.mode === 'hood') {
      targetFov = CHASE_CAMERA.hoodFov + CHASE_CAMERA.hoodFovBoost * this.#boost;
    } else {
      const pace = Math.min(1, speed / CHASE_CAMERA.fovSpeed);
      const accelFov =
        Math.max(0, this.#accelLong) * CHASE_CAMERA.accelFov -
        Math.max(0, -this.#accelLong) * CHASE_CAMERA.brakeFov;
      targetFov =
        CHASE_CAMERA.fov +
        (CHASE_CAMERA.fovFast - CHASE_CAMERA.fov) * pace +
        CHASE_CAMERA.fovBoost * this.#boost +
        accelFov;
    }
    this.#fov += (targetFov - this.#fov) * (1 - Math.exp(-CHASE_CAMERA.fovRate * dt));
    const near =
      this.mode === 'cockpit'
        ? COCKPIT_CAMERA.near
        : this.mode === 'hood'
          ? CHASE_CAMERA.hoodNear
          : CAMERA.near;
    const fovDirty = Math.abs(camera.fov - this.#fov) > 0.05;
    const nearDirty = Math.abs(camera.near - near) > 1e-4;
    if (fovDirty) camera.fov = this.#fov;
    if (nearDirty) camera.near = near;
    if (fovDirty || nearDirty) camera.updateProjectionMatrix();
  }

  #updateChase(dt: number, vehicle: Vehicle, ground: Ground, camera: PerspectiveCamera): void {
    const yaw = this.#heading + this.#yawOffset;
    const t = vehicle.telemetry;
    // Der Arm wächst mit dem Tempo und noch einmal im Nitro — Begründung bei
    // `CHASE_CAMERA.distanceFast`. Gas und Bremse sitzen **darüber**, nicht
    // darin: Tempo sagt, wie weit man ist, Last sagt, ob gerade gezogen wird.
    const pace = Math.min(1, t.speed / CHASE_CAMERA.fovSpeed);
    let arm =
      (CHASE_CAMERA.distance + CHASE_CAMERA.distanceFast * (pace + this.#boost * 0.4)) *
      this.#zoomApplied;
    // Deckel, nicht linearer Spike: die Dynamik liefert leicht −19 m/s², und
    // genau damit ist die erste Fassung unspielbar geworden (Arm −3 m).
    const gasArm = Math.min(
      Math.max(0, this.#accelLong) * CHASE_CAMERA.accelDistance,
      CHASE_CAMERA.accelArmMax,
    );
    const brakeArm = Math.min(
      Math.max(0, -this.#accelLong) * CHASE_CAMERA.brakeDistance,
      CHASE_CAMERA.brakeArmMax,
    );
    arm += gasArm - brakeArm;
    arm = Math.max(arm, CHASE_CAMERA.distance * CHASE_CAMERA.armMinFactor * this.#zoomApplied);

    const lookPitch = this.#pitchOffset;
    const distance = arm * Math.cos(lookPitch);
    const height = CHASE_CAMERA.height - arm * Math.sin(lookPitch);

    const ahead = clamp(
      t.speed * CHASE_CAMERA.lookAhead + this.#accelLong * CHASE_CAMERA.accelLook,
      -0.4,
      CHASE_CAMERA.lookAheadMax,
    );
    const lat = clamp(this.#accelLat * CHASE_CAMERA.lookLat, -0.45, 0.45);
    const fx = Math.sin(this.#heading);
    const fz = Math.cos(this.#heading);
    // rechts = forward × up, dieselbe Konvention wie im Fahrmodell.
    this.#right.set(fz, 0, -fx);

    this.#lookAt.set(
      vehicle.position.x + fx * ahead + this.#right.x * lat,
      vehicle.position.y +
        CHASE_CAMERA.targetHeight -
        Math.max(0, -this.#accelLong) * CHASE_CAMERA.brakeLookDown,
      vehicle.position.z + fz * ahead + this.#right.z * lat,
    );

    // Boom am **Wagen**, nicht am Blickziel. Die erste Fassung hat den Arm
    // am Look-ahead aufgehängt — 3 m Blick nach vorn schoben die Kamera
    // mit, und der Wagen saß im unteren Bilddrittel.
    this.#desired.set(
      vehicle.position.x - Math.sin(yaw) * distance,
      vehicle.position.y + height,
      vehicle.position.z - Math.cos(yaw) * distance,
    );

    const occlude = this.#sampleOcclude(ground);
    const occludeRate =
      occlude < this.#occlude ? CHASE_CAMERA.occludeRateIn : CHASE_CAMERA.occludeRateOut;
    this.#occlude += (occlude - this.#occlude) * (1 - Math.exp(-occludeRate * dt));
    if (this.#occlude < 0.999) {
      this.#desired.lerpVectors(this.#lookAt, this.#desired, this.#occlude);
    }

    if (!this.#initialized) {
      this.#position.copy(this.#desired);
      this.#target.copy(this.#lookAt);
      this.#initialized = true;
    } else {
      this.#position.lerp(this.#desired, 1 - Math.exp(-CHASE_CAMERA.positionRate * dt));
      this.#target.lerp(this.#lookAt, 1 - Math.exp(-CHASE_CAMERA.lookRate * dt));
    }

    // Nicht im Hang stecken. Der Fall ist auf dem Bergpass die Regel und nicht
    // die Ausnahme: hinter dem Auto steht dort die Bergseite. Die Proben
    // oben kürzen den Arm; diese Klemme ist der letzte Fang, falls eine
    // Probe die Kante zwischen zwei Texeln verfehlt.
    const floor = ground.height(this.#position.x, this.#position.z) + CHASE_CAMERA.groundClearance;
    if (this.#position.y < floor) this.#position.y = floor;

    const rollTarget = clamp(
      this.#accelLat * CHASE_CAMERA.rollPerLat,
      -CHASE_CAMERA.maxRoll,
      CHASE_CAMERA.maxRoll,
    );
    this.#roll += (rollTarget - this.#roll) * (1 - Math.exp(-CHASE_CAMERA.rollRate * dt));

    camera.position.copy(this.#position);
    camera.lookAt(this.#target);
    if (Math.abs(this.#roll) > 1e-4) camera.rotateZ(this.#roll);
    // Shake **nach** lookAt: die Blickrichtung bleibt auf dem Wagen, nur der
    // Körper zittert. Andersherum wäre jede Probe ein Mini-Orbit ums Auto —
    // das ist Quaternion-Shake unter anderem Namen.
    camera.position.add(this.#shake);
  }

  #updateHood(vehicle: Vehicle, camera: PerspectiveCamera): void {
    // Ungefedert, aber am Quaternion: Welt-Y hat die Kamera am Hang durchs
    // Blech geschoben. Eine Federung hier wäre eine Kamera, die im Auto schwimmt.
    const cowl = hoodCowl(vehicle.spec);
    this.#offset.set(cowl.x, cowl.y, cowl.z).applyQuaternion(vehicle.quaternion);
    camera.position.copy(vehicle.position).add(this.#offset);
    const yaw = this.#yawOffset;
    const pitch = this.#pitchOffset + CHASE_CAMERA.hoodLookPitch;
    const cp = Math.cos(pitch);
    this.#lookLocal.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    this.#lookLocal.applyQuaternion(vehicle.quaternion);
    this.#target.copy(camera.position).addScaledVector(this.#lookLocal, 20);
    // lookAt mit Welt-Up: die Haube darf nicken, aber nicht mit dem Auto rollen —
    // volles Wanken auf einem Bildschirm ohne Fliehkraft ist Übelkeit.
    camera.up.set(0, 1, 0);
    camera.lookAt(this.#target);
    camera.position.add(this.#shake);
  }

  #updateCockpit(dt: number, vehicle: Vehicle, camera: PerspectiveCamera): void {
    this.#stepNeck(dt, vehicle);
    const eye = cockpitEye(vehicle.spec);
    const motion = this.motion;
    this.#offset.set(
      eye.x + this.#neck.x * motion,
      eye.y + this.#neck.y * motion,
      eye.z + this.#neck.z * motion,
    );
    this.#offset.applyQuaternion(vehicle.quaternion);
    camera.position.copy(vehicle.position).add(this.#offset);

    const t = vehicle.telemetry;
    const maxLock = Math.max(1e-4, vehicle.spec.steering.maxAngle);
    const steerLook = (-t.steerAngle / maxLock) * COCKPIT_CAMERA.steerYaw * motion;
    let velYaw = 0;
    if (t.speed > 0.8 && t.forwardSpeed > 0.4) {
      velYaw = wrapAngle(Math.atan2(vehicle.velocity.x, vehicle.velocity.z) - vehicle.yaw);
    }
    const slip = Math.abs(t.slip);
    const velWeight =
      slip > COCKPIT_CAMERA.driftSlip ? COCKPIT_CAMERA.driftVelLook : COCKPIT_CAMERA.velLook;
    const g = 9.81;
    const extraPitch = clamp(
      -this.#accelLong / g * COCKPIT_CAMERA.gPitchPerG * motion,
      -COCKPIT_CAMERA.maxExtraPitch,
      COCKPIT_CAMERA.maxExtraPitch,
    );
    const extraRoll = clamp(
      this.#accelLat / g * COCKPIT_CAMERA.gRollPerG * motion,
      -COCKPIT_CAMERA.maxExtraRoll,
      COCKPIT_CAMERA.maxExtraRoll,
    );

    camera.quaternion.copy(vehicle.quaternion);
    camera.rotateY(this.#yawOffset + steerLook + velYaw * velWeight * motion);
    camera.rotateX(
      this.#pitchOffset +
        COCKPIT_CAMERA.lookPitch +
        extraPitch +
        vehicle.pitch * (COCKPIT_CAMERA.chassisPitch - 1) * motion,
    );
    camera.rotateZ(extraRoll + vehicle.roll * (COCKPIT_CAMERA.chassisRoll - 1) * motion);
    camera.position.add(this.#shake);
  }

  /**
   * Kopf als gedämpfte Feder auf der Karosserie.
   *
   * `ẍ = −a_chassis − ωn² x − 2ζωn ẋ` — die Sitzbeschleunigung schiebt den
   * Kopf entgegen, die Feder holt ihn zurück. Ohne das ist die Kamera eine
   * GoPro am Überrollkäfig: die Welt zittert, die Kabine ist tot.
   */
  #stepNeck(dt: number, vehicle: Vehicle): void {
    const ω = Math.PI * 2 * COCKPIT_CAMERA.neckHz;
    const damp = 2 * COCKPIT_CAMERA.neckZeta * ω;
    const stiff = ω * ω;
    const g = 9.81;
    const ax = -this.#accelLat;
    const ay = this.#wasAirborne && !vehicle.telemetry.airborne
      ? -COCKPIT_CAMERA.landImpulse * 40
      : 0;
    const az = -this.#accelLong;
    const n = this.#neck;
    n.vx += (ax - stiff * n.x - damp * n.vx) * dt;
    n.vy += (ay - stiff * n.y - damp * n.vy) * dt;
    n.vz += (az - stiff * n.z - damp * n.vz) * dt;
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    n.z += n.vz * dt;
    const max = COCKPIT_CAMERA.headMax + COCKPIT_CAMERA.headPerG * (Math.abs(this.#accelLat) + Math.abs(this.#accelLong)) / g;
    const cap = Math.min(0.1, max);
    n.x = clamp(n.x, -cap, cap);
    n.y = clamp(n.y, -cap * 0.6, cap * 0.6);
    n.z = clamp(n.z, -cap, cap);
  }

  /**
   * Nur Landung, kein Dauer-Rütteln. Ein Sinus auf der Position hat das
   * ganze Bild zittern lassen — das liest sich als Glitch, nicht als Belag.
   * Querbewegung bleibt Roll und Look-ahead, die hängen am Wagen und nicht
   * am Pixel.
   */
  #updateShake(dt: number, vehicle: Vehicle): void {
    const t = vehicle.telemetry;
    this.#shake.multiplyScalar(Math.exp(-CHASE_CAMERA.shakeDecay * dt));

    if (this.#wasAirborne && !t.airborne) {
      this.#shake.y -= CHASE_CAMERA.landImpulse * clamp(t.compression, 0, 1.4);
    }
    this.#wasAirborne = t.airborne;
  }

  /**
   * Anteil des Arms, der noch frei ist. Proben liegen auf der Strecke
   * Blickziel → gewünschte Kameraposition; die erste, die unter dem Gelände
   * sitzt, kürzt auf die davor. Kein Mesh-Raycast — `Ground.height` ist
   * dieselbe Quelle, auf der das Auto fährt.
   */
  #sampleOcclude(ground: Ground): number {
    const n = CHASE_CAMERA.occludeSamples;
    let shortest = 1;
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const x = this.#lookAt.x + (this.#desired.x - this.#lookAt.x) * u;
      const y = this.#lookAt.y + (this.#desired.y - this.#lookAt.y) * u;
      const z = this.#lookAt.z + (this.#desired.z - this.#lookAt.z) * u;
      const floor = ground.height(x, z) + CHASE_CAMERA.groundClearance;
      if (y < floor) {
        shortest = Math.min(shortest, (i - 1) / n);
        break;
      }
    }
    return Math.max(shortest, CHASE_CAMERA.occludeMin);
  }
}

/** Auf −π…π bringen. */
function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
