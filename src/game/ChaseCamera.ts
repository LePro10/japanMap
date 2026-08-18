import { Vector3, type PerspectiveCamera } from 'three';

import { CHASE_CAMERA } from '@/config/vehicle.config';
import type { Ground, Vehicle } from './Vehicle';

/**
 * Die Kamera im Fahrmodus — PLAN.md P14.
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
  #pitchOffset = 0;

  readonly #position = new Vector3();
  readonly #target = new Vector3();
  readonly #desired = new Vector3();
  readonly #lookAt = new Vector3();
  readonly #normal = new Vector3();

  #fov = CHASE_CAMERA.fov;
  #initialized = false;

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

    // ── Blickrichtung ─────────────────────────────────────────────────────
    let desiredHeading = vehicle.yaw;
    // Die Fahrtrichtung zählt nur bei **Vorwärtsfahrt** mit: rückwärts zeigt der
    // Geschwindigkeitsvektor nach hinten, und die Kamera schwenkte beim
    // Rangieren um 180°.
    if (speed > 0.5 && vehicle.telemetry.forwardSpeed > 0.5) {
      const velocityHeading = Math.atan2(vehicle.velocity.x, vehicle.velocity.z);
      const weight =
        CHASE_CAMERA.velocityBlend * Math.min(1, speed / CHASE_CAMERA.velocityBlendSpeed);
      desiredHeading = vehicle.yaw + wrapAngle(velocityHeading - vehicle.yaw) * weight;
    }

    const headingBlend = 1 - Math.exp(-CHASE_CAMERA.positionRate * dt);
    this.#heading += wrapAngle(desiredHeading - this.#heading) * headingBlend;
    this.#heading = wrapAngle(this.#heading);

    // Mausschwenk läuft bei Gas nach hinten zurück — Begründung bei `recenterRate`.
    if (vehicle.telemetry.forwardSpeed > 2) {
      this.#yawOffset *= Math.exp(-CHASE_CAMERA.recenterRate * dt);
    }

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
    const targetFov =
      CHASE_CAMERA.fov +
      (CHASE_CAMERA.fovFast - CHASE_CAMERA.fov) * Math.min(1, speed / CHASE_CAMERA.fovSpeed);
    this.#fov += (targetFov - this.#fov) * (1 - Math.exp(-3 * dt));
    if (Math.abs(camera.fov - this.#fov) > 0.05) {
      camera.fov = this.#fov;
      camera.updateProjectionMatrix();
    }
  }

  #updateChase(dt: number, vehicle: Vehicle, ground: Ground, camera: PerspectiveCamera): void {
    const yaw = this.#heading + this.#yawOffset;
    const distance = CHASE_CAMERA.distance * Math.cos(this.#pitchOffset);
    const height = CHASE_CAMERA.height + CHASE_CAMERA.distance * Math.sin(this.#pitchOffset);

    this.#desired.set(
      vehicle.position.x - Math.sin(yaw) * distance,
      vehicle.position.y + height,
      vehicle.position.z - Math.cos(yaw) * distance,
    );
    this.#lookAt.set(
      vehicle.position.x,
      vehicle.position.y + CHASE_CAMERA.targetHeight,
      vehicle.position.z,
    );

    if (!this.#initialized) {
      this.#position.copy(this.#desired);
      this.#target.copy(this.#lookAt);
      this.#initialized = true;
    } else {
      this.#position.lerp(this.#desired, 1 - Math.exp(-CHASE_CAMERA.positionRate * dt));
      this.#target.lerp(this.#lookAt, 1 - Math.exp(-CHASE_CAMERA.lookRate * dt));
    }

    // Nicht im Hang stecken. Der Fall ist auf dem Bergpass die Regel und nicht
    // die Ausnahme: hinter dem Auto steht dort die Bergseite.
    const floor = ground.height(this.#position.x, this.#position.z) + CHASE_CAMERA.groundClearance;
    if (this.#position.y < floor) this.#position.y = floor;

    camera.position.copy(this.#position);
    camera.lookAt(this.#target);
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

    const yaw = vehicle.yaw + this.#yawOffset;
    // Nur ein Drittel des Aufbau-Nickens, kein Wanken — Begründung im Kopf.
    const pitch = this.#pitchOffset;
    const cosPitch = Math.cos(pitch);
    this.#target.set(
      camera.position.x + Math.sin(yaw) * cosPitch * 20,
      camera.position.y + Math.sin(pitch) * 20,
      camera.position.z + Math.cos(yaw) * cosPitch * 20,
    );
    camera.lookAt(this.#target);
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
