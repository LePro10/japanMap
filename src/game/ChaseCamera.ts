import { Vector3, type PerspectiveCamera } from 'three';

import { CHASE_CAMERA } from '@/config/vehicle.config';
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
 * Rütteln sitzt auf der **Position**, nicht auf der Quaternion. Rotation auf
 * einem Bildschirm ohne Fliehkraft ist Übelkeit — derselbe Satz, der der
 * Haube das Wanken verbietet.
 *
 * ## Zwei Ansichten
 *
 * `chase` (Verfolger) und `hood` (Haube). Die Haubenkamera ist nicht Deko: sie ist
 * die einzige Ansicht, in der man die Fahrbahnbreite und die Leitplanke wirklich
 * sieht, und damit die, an der ein Bild über die Straßengeometrie etwas aussagt.
 * Sie zeigt bewusst **kein** Wanken und nur ein Drittel des Nickens — der Rest
 * ist auf einem Bildschirm ohne Fliehkraft nur Übelkeit.
 */
export type ChaseMode = 'chase' | 'hood';

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
  readonly #normal = new Vector3();
  readonly #shake = new Vector3();
  readonly #right = new Vector3();

  #fov = CHASE_CAMERA.fov;
  #initialized = false;

  /** Geglätteter Nitro-Zustand, 0…1 — treibt Blickwinkel und Abstand. */
  #boost = 0;
  /** Geglättete Beschleunigung, damit ein Physik-Spike kein Kameraruck ist. */
  #accelLong = 0;
  #accelLat = 0;
  #roll = 0;
  /** 1 = voller Arm, `occludeMin` = am Blech. */
  #occlude = 1;
  #clock = 0;
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
  }

  toggleMode(): ChaseMode {
    this.mode = this.mode === 'chase' ? 'hood' : 'chase';
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
    this.#clock += dt;

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
    if (t.forwardSpeed > 2) {
      this.#yawOffset *= Math.exp(-CHASE_CAMERA.recenterRate * dt);
    }

    // Nitro-Zustand **vor** der Position, damit Arm und Blickfeld denselben
    // Frame schlagen. Vorher hing der Arm ein Frame hinter dem FOV.
    const boost = t.boosting ? 1 : 0;
    const boostRate = boost > this.#boost ? CHASE_CAMERA.fovBoostRate : CHASE_CAMERA.fovRate;
    this.#boost += (boost - this.#boost) * (1 - Math.exp(-boostRate * dt));

    this.#updateShake(dt, vehicle);

    if (this.mode === 'hood') {
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
    const pace = Math.min(1, speed / CHASE_CAMERA.fovSpeed);
    const accelFov =
      Math.max(0, this.#accelLong) * CHASE_CAMERA.accelFov -
      Math.max(0, -this.#accelLong) * CHASE_CAMERA.brakeFov;
    const targetFov =
      CHASE_CAMERA.fov +
      (CHASE_CAMERA.fovFast - CHASE_CAMERA.fov) * pace +
      CHASE_CAMERA.fovBoost * this.#boost +
      accelFov;
    this.#fov += (targetFov - this.#fov) * (1 - Math.exp(-CHASE_CAMERA.fovRate * dt));
    if (Math.abs(camera.fov - this.#fov) > 0.05) {
      camera.fov = this.#fov;
      camera.updateProjectionMatrix();
    }
  }

  #updateChase(dt: number, vehicle: Vehicle, ground: Ground, camera: PerspectiveCamera): void {
    const yaw = this.#heading + this.#yawOffset;
    const t = vehicle.telemetry;
    // Der Arm wächst mit dem Tempo und noch einmal im Nitro — Begründung bei
    // `CHASE_CAMERA.distanceFast`. Gas und Bremse sitzen **darüber**, nicht
    // darin: Tempo sagt, wie weit man ist, Last sagt, ob gerade gezogen wird.
    const pace = Math.min(1, t.speed / CHASE_CAMERA.fovSpeed);
    let arm = CHASE_CAMERA.distance + CHASE_CAMERA.distanceFast * (pace + this.#boost * 0.4);
    arm += Math.max(0, this.#accelLong) * CHASE_CAMERA.accelDistance;
    arm -= Math.max(0, -this.#accelLong) * CHASE_CAMERA.brakeDistance;
    arm = Math.max(arm, CHASE_CAMERA.distance * 0.55);

    const lookPitch = this.#pitchOffset;
    const distance = arm * Math.cos(lookPitch);
    const height = CHASE_CAMERA.height - arm * Math.sin(lookPitch);

    const ahead = clamp(
      t.speed * CHASE_CAMERA.lookAhead + this.#accelLong * CHASE_CAMERA.accelLook,
      -1.2,
      CHASE_CAMERA.lookAheadMax,
    );
    const lat = clamp(this.#accelLat * CHASE_CAMERA.lookLat, -1.6, 1.6);
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

    this.#desired.set(
      this.#lookAt.x - Math.sin(yaw) * distance,
      vehicle.position.y + height,
      this.#lookAt.z - Math.cos(yaw) * distance,
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
    // Ungefedert: die Haubenkamera sitzt am Auto. Eine Federung hier wäre eine
    // Kamera, die im Auto schwimmt.
    this.#normal.set(0, 0, 1).applyQuaternion(vehicle.quaternion);
    camera.position.set(
      vehicle.position.x + this.#normal.x * CHASE_CAMERA.hoodForward,
      vehicle.position.y + CHASE_CAMERA.hoodHeight,
      vehicle.position.z + this.#normal.z * CHASE_CAMERA.hoodForward,
    );
    camera.position.addScaledVector(this.#shake, CHASE_CAMERA.rumbleHood);

    const yaw = vehicle.yaw + this.#yawOffset;
    // Ein Drittel des Aufbau-Nickens, kein Wanken — Begründung im Kopf.
    // `vehicle.pitch` positiv senkt die Nase; die Haube blickt mit `sin(pitch)`
    // nach oben, also das Vorzeichen umdrehen.
    const pitch = this.#pitchOffset - vehicle.pitch * CHASE_CAMERA.hoodPitchBlend;
    const cosPitch = Math.cos(pitch);
    this.#target.set(
      camera.position.x + Math.sin(yaw) * cosPitch * 20,
      camera.position.y + Math.sin(pitch) * 20,
      camera.position.z + Math.cos(yaw) * cosPitch * 20,
    );
    camera.lookAt(this.#target);
  }

  /**
   * Stöße und Dauer-Rütteln. Landung und Kollision sind Impulse (klingen über
   * `shakeDecay` aus); Belag, Drift und Bremse sind ein Sinusgemisch auf der
   * Uhr, damit es nicht von Frame zu Frame würfelt.
   */
  #updateShake(dt: number, vehicle: Vehicle): void {
    const t = vehicle.telemetry;
    this.#shake.multiplyScalar(Math.exp(-CHASE_CAMERA.shakeDecay * dt));

    if (this.#wasAirborne && !t.airborne) {
      this.#shake.y -= CHASE_CAMERA.landImpulse * clamp(t.compression, 0, 1.4);
    }
    this.#wasAirborne = t.airborne;

    if (t.lastPenetration > CHASE_CAMERA.hitThreshold) {
      const mag = CHASE_CAMERA.hitImpulse * t.lastPenetration;
      const phase = this.#clock * 17.3;
      this.#shake.x += Math.sin(phase) * mag;
      this.#shake.y += Math.abs(Math.sin(phase * 1.3)) * mag * 0.45;
      this.#shake.z += Math.cos(phase * 0.7) * mag;
    }

    const loose = t.surface === 'asphalt' ? CHASE_CAMERA.rumbleAsphalt : CHASE_CAMERA.rumbleLoose;
    let amp = loose * t.speed;
    amp += CHASE_CAMERA.rumbleSkid * Math.max(t.skid, Math.min(t.wheelspin, 1) * 0.6);
    if (this.#accelLong < -CHASE_CAMERA.rumbleBrakeAccel && t.speed > 6) {
      amp += CHASE_CAMERA.rumbleBrake * Math.min(1, t.speed / 20) * (-this.#accelLong / 10);
    }
    if (amp < 1e-4) return;
    const c = this.#clock;
    this.#shake.x += amp * Math.sin(c * 37.1);
    this.#shake.y += amp * 0.55 * Math.sin(c * 41.7);
    this.#shake.z += amp * Math.sin(c * 29.3);
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
