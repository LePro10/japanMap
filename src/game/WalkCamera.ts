import { Vector3, type PerspectiveCamera } from 'three';

import { WALKER, WALK_CAMERA } from '@/config/walker.config';
import type { Ground } from './Vehicle';
import type { Walker } from './Walker';
import type { CollisionWorld } from './CollisionWorld';

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
  #zoom = 1;
  #zoomApplied = 1;
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

  /** Boom näher/weiter. Faktor > 1 = weiter weg. */
  zoom(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.#zoom = clamp(this.#zoom * factor, WALK_CAMERA.zoomMin, WALK_CAMERA.zoomMax);
  }

  reset(walker: Walker): void {
    this.#heading = walker.yaw;
    this.#pitch = -0.18;
    this.#initialized = false;
  }

  update(dt: number, walker: Walker, ground: Ground, camera: PerspectiveCamera, collision?: CollisionWorld): void {
    this.#zoomApplied +=
      (this.#zoom - this.#zoomApplied) * (1 - Math.exp(-WALK_CAMERA.zoomRate * dt));
    const yaw = this.#heading;
    const pitch = this.#pitch;
    const arm = WALK_CAMERA.distance * this.#zoomApplied;
    const dist = arm * Math.cos(pitch);
    const dip = walker.slideAmount;
    const height =
      WALK_CAMERA.height - dip * WALKER.slideCameraDip - arm * Math.sin(pitch);
    const lookHeight = WALK_CAMERA.targetHeight - dip * WALKER.slideLookDip;

    const bob =
      walker.grounded && walker.speed > 0.15 && dip < 0.2
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
      walker.position.y + lookHeight + bob * 0.4,
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

    // Resolve after smoothing and terrain correction: either can otherwise move
    // a clear target through a wall. Retract immediately, recover with the spring.
    if (collision) {
      const near = WALK_CAMERA.near;
      const nearHalfHeight = near * Math.tan(WALK_CAMERA.fov * Math.PI / 360);
      const clearance = Math.max(0.18, Math.hypot(near, nearHalfHeight * camera.aspect, nearHalfHeight));
      const fraction = collision.cameraFraction(this.#lookAt.x, this.#lookAt.y, this.#lookAt.z,
        this.#position.x, this.#position.y, this.#position.z, clearance);
      // occludeMin: a hit at t=0 (look-at inside a wall/car shell) used to lerp
      // the camera onto the look-at. lookAt() then picks world +Z.
      const t = Math.max(WALK_CAMERA.occludeMin, fraction - 0.002);
      if (t < 1) this.#position.lerpVectors(this.#lookAt, this.#position, t);
    }

    camera.position.copy(this.#position);
    const sepSq = this.#position.distanceToSquared(this.#lookAt);
    if (sepSq > 1e-4) {
      camera.lookAt(this.#lookAt);
    } else {
      // Degenerate boom: keep the mouse heading instead of world +Z.
      const cp = Math.cos(this.#pitch);
      camera.lookAt(
        this.#lookAt.x + Math.sin(this.#heading) * cp,
        this.#lookAt.y + Math.sin(this.#pitch),
        this.#lookAt.z + Math.cos(this.#heading) * cp,
      );
    }

    if (
      Math.abs(camera.fov - WALK_CAMERA.fov) > 0.05 ||
      Math.abs(camera.near - WALK_CAMERA.near) > 1e-4
    ) {
      camera.fov = WALK_CAMERA.fov;
      camera.near = WALK_CAMERA.near;
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
