import { Vector3 } from 'three';

import { WALKER } from '@/config/walker.config';
import type { CollisionWorld } from './CollisionWorld';
import type { Ground } from './Vehicle';

/**
 * Eingabe zu Fuß. Alles normiert, wie `DriveInput` — Tastatur, Stick und
 * Prüfstand sehen gleich aus.
 */
export interface WalkInput {
  /** −1…1, vorwärts in **Kamerarichtung**. */
  forward: number;
  /** −1…1, rechts in Kamerarichtung. */
  right: number;
  jump: boolean;
  /** Sprint — Shift. Ohne ihn bleibt es ein Schritt. */
  sprint: boolean;
}

const NO_INPUT: WalkInput = { forward: 0, right: 0, jump: false, sprint: false };

/**
 * Der Körper zu Fuß.
 *
 * ## Was hier modelliert wird und was nicht
 *
 * Eine Kapsel auf dem Boden, nicht ein Ragdoll. Gehen ist kein Fahrmodell:
 * es gibt keine Reifen, keine Lastverlagerung, kein Gieren aus Seitenkraft.
 * Was zählt, ist, dass die Figur auf dem Gelände steht, an Wänden stoppt,
 * springt, und dass Bild und Physik dieselbe Höhe meinen — dieselbe Klasse
 * Fehler, die das Auto in P14 (Standhöhe) und P21 (Fahrbahn als Ebene)
 * teuer bezahlt hat.
 *
 * Deshalb liest dieser Körper **denselben** `Ground` wie das Fahrzeug
 * (`RoadGround`): Sampler plus Fahrbahnkorrektur plus Plateaus. Eine zweite
 * Höhenquelle wäre eine Figur, die neben dem Auto im Asphalt versinkt.
 *
 * ## Die Kapsel
 *
 * Zwei Kugeln, eine in Hüfthöhe, eine in Schulterhöhe, Radius
 * `WALKER.radius`. Eine Kugel in der Mitte der Figur sähe über niedrige
 * Leitplanken hinweg und durch Türstürze hindurch; zwei decken beides.
 * Aufgelöst wird nur in XZ — die Höhe gehört dem Boden, nicht der Wand.
 */
export class Walker {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  yaw = 0;
  grounded = true;
  jumping = false;

  /** Strecke seit dem letzten Stand, für den Walk-Cycle. */
  cycle = 0;
  /** 0…1, wie sehr der Körper in die Bewegung lehnt. */
  lean = 0;

  #vy = 0;
  #coyote = 0;
  #jumpBuf = 0;
  readonly #normal = new Vector3(0, 1, 0);
  readonly #wish = new Vector3();

  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get vy(): number {
    return this.#vy;
  }

  respawn(x: number, z: number, heading: number, ground: Ground): void {
    const y = ground.height(x, z);
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.#vy = 0;
    this.yaw = heading;
    this.grounded = true;
    this.jumping = false;
    this.cycle = 0;
    this.lean = 0;
    this.#coyote = WALKER.coyote;
    this.#jumpBuf = 0;
  }

  step(
    dt: number,
    input: WalkInput,
    ground: Ground,
    collision: CollisionWorld | null,
    cameraHeading: number,
  ): void {
    const wishLen = Math.hypot(input.forward, input.right);
    const sprint = input.sprint && wishLen > 0.15;
    const maxSpeed = sprint ? WALKER.runSpeed : WALKER.walkSpeed;

    // Wunschrichtung relativ zur **Kamera**, nicht zur Figur. Ein 3rd-Person-
    // Spieler drückt W für „dahin, wo ich hinschaue", nicht „dahin, wo die
    // Nase zeigt" — sonst lenkt jede Mausbewegung die Figur mit, und das
    // ist die Steuerung, die sich nach einem Fahrzeug anfühlt, das sie
    // gerade verlassen hat.
    const camSin = Math.sin(cameraHeading);
    const camCos = Math.cos(cameraHeading);
    // forward = (sin ψ, 0, cos ψ), right = (−cos ψ, 0, sin ψ) — dieselbe
    // Konvention wie im Fahrmodell. Ein Vorzeichenfehler hier wäre die
    // P14-Klasse, nur zu Fuß.
    this.#wish.set(
      camSin * input.forward + -camCos * input.right,
      0,
      camCos * input.forward + camSin * input.right,
    );
    const wishMag = Math.hypot(this.#wish.x, this.#wish.z);
    if (wishMag > 1e-6) {
      this.#wish.x /= wishMag;
      this.#wish.z /= wishMag;
      const scale = Math.min(1, wishLen) * maxSpeed;
      this.#wish.x *= scale;
      this.#wish.z *= scale;
    } else {
      this.#wish.set(0, 0, 0);
    }

    const accel = this.grounded ? WALKER.accel : WALKER.accel * WALKER.airControl;
    const brake = this.grounded ? WALKER.brake : WALKER.brake * 0.15;
    if (wishMag > 1e-6) {
      this.velocity.x += (this.#wish.x - this.velocity.x) * Math.min(1, accel * dt);
      this.velocity.z += (this.#wish.z - this.velocity.z) * Math.min(1, accel * dt);
    } else {
      const damp = Math.exp(-brake * dt);
      this.velocity.x *= damp;
      this.velocity.z *= damp;
    }

    if (wishMag > 0.15) {
      const targetYaw = Math.atan2(this.#wish.x, this.#wish.z);
      let dYaw = targetYaw - this.yaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      // 10 1/s: die Figur dreht sich in ~0,3 s in die Laufrichtung. Härter
      // wäre ein Instant-Turn, weicher ein Nachlaufen hinter der Kamera.
      this.yaw += dYaw * (1 - Math.exp(-10 * dt));
    }

    if (input.jump) this.#jumpBuf = WALKER.jumpBuffer;
    else this.#jumpBuf = Math.max(0, this.#jumpBuf - dt);

    if (this.grounded) this.#coyote = WALKER.coyote;
    else this.#coyote = Math.max(0, this.#coyote - dt);

    const wantJump = this.#jumpBuf > 0 && this.#coyote > 0 && !this.jumping;
    if (wantJump) {
      this.#vy = WALKER.jumpSpeed;
      this.grounded = false;
      this.jumping = true;
      this.#jumpBuf = 0;
      this.#coyote = 0;
    }

    this.#vy -= WALKER.gravity * dt;
    this.velocity.y = this.#vy;

    const nx = this.position.x + this.velocity.x * dt;
    const nz = this.position.z + this.velocity.z * dt;
    let ny = this.position.y + this.#vy * dt;

    if (collision) {
      const pushed = this.#resolve(nx, ny, nz, collision);
      this.position.x = pushed.x;
      this.position.z = pushed.z;
      ny = pushed.y;
    } else {
      this.position.x = nx;
      this.position.z = nz;
    }

    ground.normal(this.position.x, this.position.z, this.#normal);
    const floor = ground.height(this.position.x, this.position.z);
    const walkable = this.#normal.y >= WALKER.minNy;
    const onFloor = ny <= floor + 0.02 && this.#vy <= 0.15;

    if (onFloor && walkable) {
      this.position.y = floor;
      if (this.#vy < 0) this.#vy = 0;
      this.grounded = true;
      this.jumping = false;
    } else if (!walkable && onFloor) {
      // Hang zu steil: stehen lassen wir ihn nicht, aber auch nicht
      // einsinken. Er rutscht — die Horizontalkomponente der Normalen
      // schiebt ihn den Hang hinunter.
      this.position.y = Math.max(ny, floor);
      this.grounded = false;
      this.velocity.x += this.#normal.x * 8 * dt;
      this.velocity.z += this.#normal.z * 8 * dt;
    } else {
      this.position.y = ny;
      this.grounded = false;
    }

    const spd = this.speed;
    this.cycle += spd * dt;
    const targetLean = wishMag > 0.15 ? Math.min(1, spd / WALKER.runSpeed) : 0;
    this.lean += (targetLean - this.lean) * (1 - Math.exp(-8 * dt));
  }

  #resolve(
    x: number,
    y: number,
    z: number,
    collision: CollisionWorld,
  ): { x: number; y: number; z: number } {
    const r = WALKER.radius;
    // Hüfte und Schulter. Eine dritte Kugel am Kopf hat in der Probe gegen
    // eine 2 m hohe Wand nichts zusätzlich gefunden — die Schulter sitzt
    // schon in der Wand, bevor der Schädel sie erreicht.
    const hips = WALKER.cgHeight * 0.55;
    const chest = WALKER.height * 0.72;
    for (let pass = 0; pass < 3; pass++) {
      let deepest = 0;
      let nx = 0;
      let nz = 0;
      for (const h of [hips, chest]) {
        const hit = collision.query(x, y + h, z, r);
        if (hit.depth > deepest) {
          deepest = hit.depth;
          nx = hit.nx;
          nz = hit.nz;
        }
      }
      if (deepest <= 1e-5) break;
      x += nx * deepest;
      z += nz * deepest;
      // Geschwindigkeit entlang der Wandnormale wegnehmen, sonst läuft die
      // Figur in die Wand und rattert. Nur die Komponente *hinein*.
      const into = this.velocity.x * nx + this.velocity.z * nz;
      if (into < 0) {
        this.velocity.x -= nx * into;
        this.velocity.z -= nz * into;
      }
    }
    return { x, y, z };
  }
}

export { NO_INPUT as NO_WALK_INPUT };
