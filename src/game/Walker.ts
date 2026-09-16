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
  /**
   * Rutschen — Strg. Nicht Space: Drive und Stunt behalten die Leertaste.
   * Optional, damit ältere Prüfstände ohne das Feld weiterlaufen.
   */
  slide?: boolean;
}

const NO_INPUT: WalkInput = { forward: 0, right: 0, jump: false, sprint: false, slide: false };

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
  sliding = false;

  /** Strecke seit dem letzten Stand, für den Walk-Cycle. */
  cycle = 0;
  /** 0…1, wie sehr der Körper in die Bewegung lehnt. */
  lean = 0;
  /** 0…1, geglättet — Kamera und Mesh, nicht die Physik. */
  slideAmount = 0;

  #vy = 0;
  #coyote = 0;
  #jumpBuf = 0;
  #slideTime = 0;
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
    this.sliding = false;
    this.cycle = 0;
    this.lean = 0;
    this.slideAmount = 0;
    this.#coyote = WALKER.coyote;
    this.#jumpBuf = 0;
    this.#slideTime = 0;
  }

  /**
   * Kugelmitten der Kapsel über den Sohlen. Öffentlich, weil der Prüfstand
   * genau das fragen muss: sinkt die untere Kugel in den Boden.
   */
  capsuleHeights(): { hips: number; chest: number } {
    const crouch = this.sliding ? WALKER.slideCrouch : 1;
    const hips = Math.max(WALKER.radius + 0.04, WALKER.cgHeight * 0.55 * crouch);
    const chest = Math.max(hips + WALKER.radius * 0.85, WALKER.height * 0.72 * crouch);
    return { hips, chest };
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

    if (input.jump) this.#jumpBuf = WALKER.jumpBuffer;
    else this.#jumpBuf = Math.max(0, this.#jumpBuf - dt);

    if (this.grounded) this.#coyote = WALKER.coyote;
    else this.#coyote = Math.max(0, this.#coyote - dt);

    const wantJump = this.#jumpBuf > 0 && this.#coyote > 0 && !this.jumping;
    if (wantJump) {
      this.#vy = WALKER.jumpSpeed;
      this.grounded = false;
      this.jumping = true;
      this.sliding = false;
      this.#slideTime = 0;
      this.#jumpBuf = 0;
      this.#coyote = 0;
    }

    ground.normal(this.position.x, this.position.z, this.#normal);
    this.#updateSlide(dt, !!input.slide, wishMag);

    if (this.sliding && this.grounded) {
      this.#slideMove(dt, wishMag);
    } else {
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
    }

    if (wishMag > 0.15 && !this.sliding) {
      const targetYaw = Math.atan2(this.#wish.x, this.#wish.z);
      this.#turnToward(targetYaw, dt, 10);
    } else if (this.sliding && this.speed > 0.4) {
      this.#turnToward(Math.atan2(this.velocity.x, this.velocity.z), dt, 14);
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
    // 2 cm reichen auf Flach. Am Hang fällt die Fläche je Schritt um
    // v·dt·tanθ — bei Sprint auf 20° sind das 4,5 cm, im Rutsch 7 cm.
    // `stepHeight` lag seit dem ersten Walker ungenutzt genau dafür:
    // dem Boden folgen, ohne eine Klippe zu ignorieren.
    const follow =
      this.grounded &&
      !this.jumping &&
      this.#vy <= 0.15 &&
      Math.abs(ny - floor) <= WALKER.stepHeight;
    const onFloor = (ny <= floor + 0.02 && this.#vy <= 0.15) || follow;

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
      this.sliding = false;
      this.velocity.x += this.#normal.x * 8 * dt;
      this.velocity.z += this.#normal.z * 8 * dt;
    } else {
      this.position.y = ny;
      this.grounded = false;
      // In der Luft ist der Rutsch vorbei — sonst wäre er ein zweites
      // Flugmodell. Coyote-Sprung bleibt, der hängt nicht am Slide-Flag.
      if (!this.jumping) this.sliding = false;
    }

    const spd = this.speed;
    this.cycle += spd * dt;
    const targetLean = this.sliding ? 1 : wishMag > 0.15 ? Math.min(1, spd / WALKER.runSpeed) : 0;
    this.lean += (targetLean - this.lean) * (1 - Math.exp(-8 * dt));
    const targetSlide = this.sliding ? 1 : 0;
    this.slideAmount += (targetSlide - this.slideAmount) * (1 - Math.exp(-14 * dt));
  }

  #updateSlide(dt: number, wantSlide: boolean, wishMag: number): void {
    const nLen = Math.hypot(this.#normal.x, this.#normal.z);
    const downX = nLen > 1e-5 ? this.#normal.x / nLen : 0;
    const downZ = nLen > 1e-5 ? this.#normal.z / nLen : 0;
    const speed = this.speed;
    const alongDown = speed > 0.4 ? (this.velocity.x * downX + this.velocity.z * downZ) / speed : 0;
    // Hang *und* Bahn bergab. Nur nLen wäre auch ein Hang hinauf — dort
    // muss der Rutsch sterben, sonst bleibt v = 0 im Slide und Sprint
    // greift nie wieder.
    const goingDown = nLen > 0.14 && alongDown > 0.18;

    if (this.sliding) {
      this.#slideTime += dt;
      const tooSlow =
        speed < WALKER.slideExitSpeed && this.#slideTime > WALKER.slideMinTime && !goingDown;
      const released = !wantSlide && this.#slideTime > WALKER.slideMinTime;
      if (tooSlow || released || !this.grounded) {
        this.sliding = false;
        this.#slideTime = 0;
      }
      return;
    }

    if (!wantSlide || !this.grounded) return;

    const canFlat = speed >= WALKER.slideEnterSpeed;
    const canHill = goingDown || (nLen > 0.14 && wishMag > 0.15 && alongDown >= 0);
    if (!canFlat && !canHill) return;

    this.sliding = true;
    this.#slideTime = 0;
    if (speed < 0.4 && nLen > 0.14) {
      // Vom Stand am Hang: den Hang hinunter, nicht in Blickrichtung.
      const takeoff = WALKER.slideEnterSpeed * 0.45;
      this.velocity.x = downX * takeoff;
      this.velocity.z = downZ * takeoff;
    } else if (speed > 0.4) {
      const boosted = Math.min(speed + WALKER.slideBoost, WALKER.slideMaxSpeed);
      const k = boosted / speed;
      this.velocity.x *= k;
      this.velocity.z *= k;
    }
  }

  #slideMove(dt: number, wishMag: number): void {
    // Hangschub nur in XZ. Y gehört dem Boden-Snap — wer hier vy aus
    // sin(θ)·v setzt, schießt den Körper den Hang hoch. Dieselbe Falle
    // wie „horizontalen Impuls in die Flächennormale kippen".
    this.velocity.x += this.#normal.x * WALKER.gravity * this.#normal.y * dt;
    this.velocity.z += this.#normal.z * WALKER.gravity * this.#normal.y * dt;

    let speed = this.speed;
    const wishLen = Math.hypot(this.#wish.x, this.#wish.z);
    if (speed > 0.4 && wishMag > 0.15 && wishLen > 1e-6) {
      const wishX = this.#wish.x / wishLen;
      const wishZ = this.#wish.z / wishLen;
      const align = (this.velocity.x * wishX + this.velocity.z * wishZ) / speed;
      if (align < -0.25) {
        // S gegen die Bahn: bremsen, nicht wenden. Sonst wäre der Rutsch
        // ein Strafe, das rückwärts beschleunigt.
        const extra = 6 * (-align);
        speed = Math.max(0, speed - extra * dt);
        const inv = this.speed > 1e-6 ? speed / this.speed : 0;
        this.velocity.x *= inv;
        this.velocity.z *= inv;
      } else {
        const blend = 1 - Math.exp(-WALKER.slideSteer * dt);
        let dx = this.velocity.x / speed + (wishX - this.velocity.x / speed) * blend;
        let dz = this.velocity.z / speed + (wishZ - this.velocity.z / speed) * blend;
        const len = Math.hypot(dx, dz) || 1;
        this.velocity.x = (dx / len) * speed;
        this.velocity.z = (dz / len) * speed;
      }
    }

    speed = this.speed;
    const nLen = Math.hypot(this.#normal.x, this.#normal.z);
    let hill = 0;
    if (nLen > 1e-5 && speed > 0.2) {
      const ux = this.#normal.x / nLen;
      const uz = this.#normal.z / nLen;
      // n_xz zeigt hangab. Positiv entlang der Bahn = bergab.
      hill = (this.velocity.x * ux + this.velocity.z * uz) / speed;
    }
    let friction = WALKER.slideFriction * (1 - WALKER.slideHillRelief * Math.max(0, hill));
    if (hill < 0) friction += WALKER.slideUphillBrake * -hill;
    speed = Math.max(0, speed - friction * dt);
    if (speed > WALKER.slideMaxSpeed) speed = WALKER.slideMaxSpeed;
    const cur = this.speed;
    if (cur > 1e-6) {
      const k = speed / cur;
      this.velocity.x *= k;
      this.velocity.z *= k;
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
  }

  #turnToward(targetYaw: number, dt: number, rate: number): void {
    let dYaw = targetYaw - this.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    this.yaw += dYaw * (1 - Math.exp(-rate * dt));
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
    // schon in der Wand, bevor der Schädel sie erreicht. Im Rutsch sinken
    // beide mit `slideCrouch`, bleiben aber über dem Radius.
    const { hips, chest } = this.capsuleHeights();
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
