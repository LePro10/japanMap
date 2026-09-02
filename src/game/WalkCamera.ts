import { Vector3, type PerspectiveCamera } from 'three';

import { WALK_CAMERA } from '@/config/walker.config';
import type { Ground } from './Vehicle';
import type { Walker } from './Walker';

/**
 * Dritte Person zu Fuß.
 *
 * Dieselbe Bauart wie `ChaseCamera`, aber die Figur hat kein Tempo, das ein
 * Blickfeld ziehen dürfte, und keinen Schwimmwinkel, den die Kamera zeigen
 * muss. Sie umkreist die Figur mit der Maus; WASD läuft in **ihrer**
 * Richtung, nicht in der der Nase — Begründung in `Walker.step`.
 *
 * Läuft im variablen Schritt. Begründung wie bei der Verfolgerkamera: eine
 * Federung im 60-Hz-Schritt würde bei 144 FPS dreimal denselben Stand
 * zeigen.
 *
 * Nick: positiv = Himmel, Boom `height − distance·sin(pitch)` — dieselbe
 * Mausrichtung wie Freiflug und Haube. Vorher hob Maus-hoch die Kamera.
 */
export class WalkCamera {
  #heading = 0;
  /** Leicht nach unten auf die Figur — derselbe Startstand wie zuvor, nur mit der neuen Nick-Konvention. */
  #pitch = -0.18;
  #initialized = false;

  readonly #position = new Vector3();
  readonly #desired = new Vector3();
  readonly #lookAt = new Vector3();

  get heading(): number {
    return this.#heading;
  }

  look(dx: number, dy: number): void {
    this.#heading -= dx * WALK_CAMERA.lookSensitivity;
    this.#pitch = clamp(
      this.#pitch - dy * WALK_CAMERA.lookSensitivity,
      WALK_CAMERA.pitchMin,
      WALK_CAMERA.pitchMax,
    );
    this.#heading = wrapAngle(this.#heading);
  }

  reset(walker: Walker): void {
    this.#heading = walker.yaw;
    this.#pitch = -0.18;
    this.#initialized = false;
  }

  update(dt: number, walker: Walker, ground: Ground, camera: PerspectiveCamera): void {
    const yaw = this.#heading;
    const pitch = this.#pitch;
    const dist = WALK_CAMERA.distance * Math.cos(pitch);
    const height = WALK_CAMERA.height - WALK_CAMERA.distance * Math.sin(pitch);

    const bob =
      walker.grounded && walker.speed > 0.15
        ? Math.sin(walker.cycle * WALK_CAMERA.bobFreq) *
          WALK_CAMERA.bob *
          Math.min(1, walker.speed / 3.2)
        : 0;

    this.#desired.set(
      walker.position.x - Math.sin(yaw) * dist,
      walker.position.y + height + bob,
      walker.position.z - Math.cos(yaw) * dist,
    );
    this.#lookAt.set(
      walker.position.x,
      walker.position.y + WALK_CAMERA.targetHeight + bob * 0.4,
      walker.position.z,
    );

    if (!this.#initialized) {
      this.#position.copy(this.#desired);
      this.#initialized = true;
    } else {
      this.#position.lerp(this.#desired, 1 - Math.exp(-WALK_CAMERA.positionRate * dt));
    }

    const floor = ground.height(this.#position.x, this.#position.z) + WALK_CAMERA.groundClearance;
    if (this.#position.y < floor) this.#position.y = floor;

    camera.position.copy(this.#position);
    camera.lookAt(this.#lookAt);

    if (Math.abs(camera.fov - WALK_CAMERA.fov) > 0.05) {
      camera.fov = WALK_CAMERA.fov;
      camera.updateProjectionMatrix();
    }
  }
}

function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
