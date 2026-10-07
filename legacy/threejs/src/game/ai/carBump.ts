import type { Vehicle } from '../Vehicle';

/**
 * Blech gegen Blech — paarweise, außerhalb der `CollisionWorld`.
 *
 * ## Warum nicht in der Kollisionswelt
 *
 * `CollisionWorld` ist ein statisches Raster plus ein Zylinderpuffer für Bäume
 * im 12-m-Umkreis des Spielers (`beginDynamic`). Vier bewegte Rechtecke dort
 * einzutragen hieße, die Abfragestruktur zu einer dynamischen zu machen — und
 * damit die Auflösung anzufassen, die P19 bis P21 mühsam stabil bekommen haben.
 * Die Begründung steht im Kopf von `RivalField` und gilt weiter.
 *
 * Hier laufen höchstens `C(4,2) = 6` Paare. Das ist ein SAT plus ein Impuls,
 * und es bleibt an der Stelle, die ein Rennen braucht: *kann ich AOKI wegschieben.*
 *
 * Gemessen `tools/bench/rivals.mts`, Hecktreffer 22 gegen 6 m/s, Touge auf
 * Touge: Gegner Δv **+11,9 m/s**, Spieler behält **73 %** seines Tempos,
 * Trennung 15 cm im Schritt. Kein Orbit (Seitentreffer |v| < 28 m/s).
 *
 * ## Warum Impuls und nicht kinematisch
 *
 * Eine gesetzte Position (das Auto *liegt* neben dem anderen) stapelt, klemmt
 * und schleudert in die Landschaft. Ein Impuls an der Relativgeschwindigkeit
 * ist dasselbe Verfahren wie die Wandauflösung in `Vehicle.#resolveCollision`:
 * herausschieben, Normalimpuls, Coulomb-Reibung, gedämpftes Giermoment. Die
 * Zahlen sind enger, weil Blech auf Blech nachgeben darf und eine Leitplanke
 * nicht.
 *
 * ## Arcade-Bias
 *
 * Der schnellere Wagen behält mehr Tempo — Mario-Kart-Rammstoß, nicht
 * billardelastisch. Der Spieler schiebt einen Gegner etwas leichter weg als
 * umgekehrt (ASTRA: Renngegner sind rammbar). Beides ist eine Entscheidung über
 * das Gefühl, nicht über den Erhaltungssatz, und steht deshalb hier und nicht
 * in `Vehicle`.
 */

/** Rückprall Blech auf Blech. Niedriger als die Planke (0,2): zwei Autos federn. */
const RESTITUTION = 0.12;
/** Reibbeiwert, an den Normalimpuls gekoppelt — sonst kleben sie aneinander. */
const FRICTION = 0.28;
/** Deckel auf den Weg je Paar und Schritt, m. */
const MAX_PUSH = 0.22;
/** Deckel auf den Geschwindigkeitswechsel je Wagen, m/s. */
const MAX_DELTA_V = 12;
/**
 * Wie stark ein außermittiger Stoß dreht, als Anteil von `r × p / I`.
 *
 * Unter `VEHICLE_COLLISION.yawTransfer` (0,55): ein Rammstoß soll den Wagen
 * versetzen, nicht in eine Pirouette schicken. 0,38 ist gewählt, nicht gemessen.
 */
const YAW_TRANSFER = 0.38;
/** Baumgarte: Anteil der Überdeckung, der in diesem Schritt verschwindet. */
const CORRECTION = 0.82;
/**
 * Inverse Masse des schnelleren Wagens, als Faktor.
 *
 * 0,62 heißt: wer schneller ist, gibt weniger Tempo ab. Ohne diesen Faktor
 * bremst ein Auffahstoß den Führenden genauso hart wie den Hintermann — und
 * genau das fühlt sich an wie „der Bot hat eine Wand".
 */
const FASTER_KEEP = 0.62;
/**
 * Inverse Masse eines Gegners gegen den Spieler, als Faktor.
 *
 * Über 1: der Gegner ist leichter zu schieben. 1,22 ist spürbar und nicht
 * lächerlich — der Spieler räumt die Linie, der Gegner räumt ihn nicht.
 */
const RIVAL_GIVE = 1.22;
/** Höhenunterschied, ab dem zwei Wagen aneinander vorbeifliegen, m. */
const FLYOVER = 1.15;

export interface Obb {
  x: number;
  z: number;
  yaw: number;
  halfLength: number;
  halfWidth: number;
}

export interface BumpHit {
  /** Normale von A nach B, XZ, normiert. */
  nx: number;
  nz: number;
  depth: number;
  px: number;
  pz: number;
}

/**
 * SAT zweier orientierter Rechtecke in der XZ-Ebene.
 *
 * Dieselben Achsen, die `CollisionWorld.queryBody` gegen Wände prüft — nur
 * hier gegen ein zweites Rechteck, das sich dreht. Überdeckung 0 heißt
 * getrennt; die Achse der *kleinsten* Überdeckung ist die Trennrichtung.
 */
export function overlapObb(a: Obb, b: Obb): BumpHit | null {
  const afx = Math.sin(a.yaw);
  const afz = Math.cos(a.yaw);
  const arx = -Math.cos(a.yaw);
  const arz = Math.sin(a.yaw);
  const bfx = Math.sin(b.yaw);
  const bfz = Math.cos(b.yaw);
  const brx = -Math.cos(b.yaw);
  const brz = Math.sin(b.yaw);

  let minDepth = Infinity;
  let nx = 0;
  let nz = 0;

  const axes = [afx, afz, arx, arz, bfx, bfz, brx, brz];
  for (let i = 0; i < 8; i += 2) {
    const ax = axes[i]!;
    const az = axes[i + 1]!;
    const [minA, maxA] = project(a.x, a.z, afx, afz, arx, arz, a.halfLength, a.halfWidth, ax, az);
    const [minB, maxB] = project(b.x, b.z, bfx, bfz, brx, brz, b.halfLength, b.halfWidth, ax, az);
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (overlap <= 0) return null;
    if (overlap < minDepth) {
      minDepth = overlap;
      nx = ax;
      nz = az;
    }
  }

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (dx * nx + dz * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  const len = Math.hypot(nx, nz) || 1;
  nx /= len;
  nz /= len;

  const extentA = a.halfLength * Math.abs(afx * nx + afz * nz) + a.halfWidth * Math.abs(arx * nx + arz * nz);
  return {
    nx,
    nz,
    depth: minDepth,
    px: a.x + nx * (extentA - minDepth * 0.5),
    pz: a.z + nz * (extentA - minDepth * 0.5),
  };
}

/**
 * Zwei Fahrzeuge auseinanderlösen.
 *
 * `playerIs` 0 = A ist der Spieler, 1 = B ist der Spieler, −1 = zwei Gegner.
 * Gibt true zurück, wenn ein Kontakt lag — für den Prüfstand, nicht fürs Bild.
 */
export function bumpPair(a: Vehicle, b: Vehicle, playerIs: -1 | 0 | 1): boolean {
  if (Math.abs(a.position.y - b.position.y) > FLYOVER) return false;
  if (a.telemetry.airborne && b.telemetry.airborne) return false;

  const bodyA = hull(a);
  const bodyB = hull(b);
  const hit = overlapObb(bodyA, bodyB);
  if (!hit) return false;

  const ma = Math.max(1, a.spec.chassis.mass);
  const mb = Math.max(1, b.spec.chassis.mass);
  let invA = 1 / ma;
  let invB = 1 / mb;

  const speedA = Math.hypot(a.velocity.x, a.velocity.z);
  const speedB = Math.hypot(b.velocity.x, b.velocity.z);
  if (speedA + speedB > 1) {
    if (speedA >= speedB) invA *= FASTER_KEEP;
    else invB *= FASTER_KEEP;
  }
  if (playerIs === 0) invB *= RIVAL_GIVE;
  else if (playerIs === 1) invA *= RIVAL_GIVE;

  const rxA = hit.px - a.position.x;
  const rzA = hit.pz - a.position.z;
  const rxB = hit.px - b.position.x;
  const rzB = hit.pz - b.position.z;
  const vax = a.velocity.x + a.yawRate * rzA;
  const vaz = a.velocity.z - a.yawRate * rxA;
  const vbx = b.velocity.x + b.yawRate * rzB;
  const vbz = b.velocity.z - b.yawRate * rxB;
  const relN = (vbx - vax) * hit.nx + (vbz - vaz) * hit.nz;

  const invSum = invA + invB;
  if (relN < 0 && invSum > 1e-9) {
    let j = -(1 + RESTITUTION) * relN / invSum;
    const cap = MAX_DELTA_V / Math.max(invA, invB);
    if (j > cap) j = cap;
    let dvx = hit.nx * j;
    let dvz = hit.nz * j;
    a.applyImpulse(-dvx * invA, -dvz * invA, yawKick(a, rxA, rzA, -dvx * invA, -dvz * invA));
    b.applyImpulse(dvx * invB, dvz * invB, yawKick(b, rxB, rzB, dvx * invB, dvz * invB));

    const tx = -hit.nz;
    const tz = hit.nx;
    const relT = (b.velocity.x - a.velocity.x) * tx + (b.velocity.z - a.velocity.z) * tz;
    const jtMax = FRICTION * j;
    const jt = clamp(-relT / invSum, -jtMax, jtMax);
    a.applyImpulse(-tx * jt * invA, -tz * jt * invA);
    b.applyImpulse(tx * jt * invB, tz * jt * invB);
  }

  const push = Math.min(hit.depth * CORRECTION, MAX_PUSH);
  if (push > 1e-5 && invSum > 1e-9) {
    a.applyNudge(-hit.nx * push * (invA / invSum), -hit.nz * push * (invA / invSum));
    b.applyNudge(hit.nx * push * (invB / invSum), hit.nz * push * (invB / invSum));
  }
  return true;
}

function hull(car: Vehicle): Obb {
  const spec = car.spec;
  return {
    x: car.position.x,
    z: car.position.z,
    yaw: car.yaw,
    halfLength: spec.chassis.bodyLength * 0.5 + spec.collision.skin,
    halfWidth: spec.chassis.bodyWidth * 0.5 + spec.collision.skin,
  };
}

function project(
  cx: number, cz: number,
  fx: number, fz: number, rx: number, rz: number,
  hl: number, hw: number,
  ax: number, az: number,
): [number, number] {
  const c = cx * ax + cz * az;
  const e = hl * Math.abs(fx * ax + fz * az) + hw * Math.abs(rx * ax + rz * az);
  return [c - e, c + e];
}

function yawKick(car: Vehicle, rx: number, rz: number, dvx: number, dvz: number): number {
  const inertia = Math.max(1, car.spec.chassis.yawInertia);
  const impulseX = dvx * car.spec.chassis.mass;
  const impulseZ = dvz * car.spec.chassis.mass;
  return ((rz * impulseX - rx * impulseZ) * YAW_TRANSFER) / inertia;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
