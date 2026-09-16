import { Vehicle, type DriveInput } from '@/game/Vehicle';
import { VEHICLES, VEHICLE_ORDER, type VehicleId } from '@/config/vehicles.config';
import {
  ARCADE,
  DRIFT_MAX_ANGLE,
  DRIFT_SCORE_ANGLE,
  STUNT,
  isStuntDoubleTap,
  topSpeed,
} from '@/config/arcade.config';
// @ts-expect-error — reines Node-ESM ohne Typen, wie der Rest von tools/.
import { flatGround } from './flat.mjs';

/**
 * Der Prüfstand des Arcade-Fahrmodells — P22.
 *
 * ## Was er beantwortet und was `fleet.mts` nicht kann
 *
 * `fleet.mts` misst die Kennzahlen eines **Fahrzeugs** (0–100, Bremsweg,
 * Lenkantwort, Ausrollen) und ist mit dem Modellwechsel unverändert
 * weitergelaufen — das ist der Beweis dafür, dass er das Richtige misst.
 *
 * Was er nicht misst, ist alles, was es vorher nicht gab:
 *
 * | Probe | beantwortet |
 * |---|---|
 * | **Handbremsdrift** | kommt das Heck, und wie weit? |
 * | **Drift halten** | steht der Winkel, oder wächst er zum Dreher? |
 * | **Gegenlenken** | fängt sich der Wagen, und in welcher Zeit? |
 * | **Gasstoß im Bogen** | reißt Gas·Lenkung **ohne** Space keinen Drift an? |
 * | **Drift ohne Absicht** | bleibt der Wagen bei sauberer Fahrt sauber? |
 * | **Nitro** | wie viel Tempo bringt er, und wie lange hält er? |
 * | **Belagsvergleich** | ist der Offroader im Dreck wirklich der schnellste? |
 *
 * Die fünfte Zeile ist die wichtigste, und zwar aus der Erfahrung dieses
 * Projekts heraus: die erste Fassung des Arcade-Modells driftete in **jeder**
 * Kurve, und keine der sechs anderen Proben hätte das gemeldet — sie fragen
 * alle, ob ein Drift *möglich* ist, und er war es. Die Probe „Drift ohne
 * Absicht" fragt, ob er *ausbleibt*, wenn niemand ihn will. Dieselbe Lehre wie
 * nach P18 („ein Prüfstand, der ‚bestanden' meldet, hat nur das geprüft, wonach
 * er fragt"), nur diesmal beim Bauen bemerkt.
 *
 * ## Was er nicht kann
 *
 * Sagen, ob es sich gut anfühlt. Das steht in jedem Prüfstand dieses Projekts
 * und gilt hier doppelt: die Zahlen unten sagen, dass ein Drift 43° erreicht und
 * sich in 1,2 s fangen lässt. Ob *das* Spaß macht, beantwortet ein Mensch mit
 * einer Tastatur.
 */

const DT = 1 / 60;

interface Ground {
  height(x: number, z: number): number;
  normal(x: number, z: number, target: { set(x: number, y: number, z: number): unknown }): unknown;
  surface(x: number, z: number): string;
  waterDepth?(x: number, z: number): number;
}

function cmd(patch: Partial<DriveInput> = {}): DriveInput {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, ...patch };
}

/** Fahrzeug auf Tempo bringen, ohne dabei zu messen. */
function accelerateTo(car: Vehicle, ground: Ground, kmh: number, maxSeconds = 30): number {
  const target = kmh / 3.6;
  let t = 0;
  while (car.telemetry.speed < target && t < maxSeconds) {
    car.step(DT, cmd({ throttle: 1 }), ground as never, null);
    t += DT;
  }
  return t;
}

/** Tempo halten — sonst misst ein Lenktest das Tempo statt die Lenkung (P18). */
function holdSpeed(car: Vehicle, target: number): number {
  return car.telemetry.speed < target ? 1 : 0;
}

const deg = (rad: number): string => `${((rad * 180) / Math.PI).toFixed(1)}°`;
const pad = (s: string, n: number): string => s.padStart(n);

interface DriftRun {
  /** Größter Schwimmwinkel während des Anrisses, rad. */
  peak: number;
  /** Winkel am Ende des Haltens, rad. */
  held: number;
  /** Ob der Wagen sich überschlagen quergestellt hat (> DRIFT_MAX_ANGLE). */
  spun: boolean;
  /** Tempo am Ende, km/h. */
  speed: number;
  /** Sekunden bis der Winkel nach Loslassen unter 10° fällt; −1 = nie. */
  catchTime: number;
}

/**
 * Ein Drift von Anfang bis Ende: anreißen, halten, loslassen.
 *
 * **In einem Lauf und nicht in dreien**, weil die drei Phasen aufeinander
 * aufbauen: ein Wagen, der sich nicht fangen lässt, ist erst interessant,
 * nachdem er wirklich quer stand. Drei getrennte Läufe hätten jeweils einen
 * frisch gesetzten Zustand gemessen — genau die Falle, die CLAUDE.md unter „ein
 * von Hand gesetzter Zustand ist ein Zustand, den es im Betrieb nicht gibt"
 * führt.
 */
function driftRun(
  id: VehicleId,
  ground: Ground,
  entryKmh: number,
  opts: { handbrake: boolean; steer: number; throttle: number },
): DriftRun {
  const car = new Vehicle(VEHICLES[id]);
  car.respawn(0, 0, 0, ground as never);
  accelerateTo(car, ground, entryKmh);
  const hold = entryKmh / 3.6;

  let peak = 0;
  let spun = false;

  // 1. Anriss — 0,6 s Handbremse und/oder Lenkung.
  for (let i = 0; i < 36; i++) {
    car.step(
      DT,
      cmd({
        throttle: opts.throttle,
        steer: opts.steer,
        handbrake: opts.handbrake,
      }),
      ground as never,
      null,
    );
    peak = Math.max(peak, Math.abs(car.telemetry.slip));
  }
  // 2. Halten — 2,5 s Gas und Lenkung, keine Handbremse mehr.
  for (let i = 0; i < 150; i++) {
    car.step(
      DT,
      cmd({ throttle: Math.max(opts.throttle, holdSpeed(car, hold)), steer: opts.steer }),
      ground as never,
      null,
    );
    const slip = Math.abs(car.telemetry.slip);
    peak = Math.max(peak, slip);
    if (slip > DRIFT_MAX_ANGLE) spun = true;
  }
  const held = Math.abs(car.telemetry.slip);

  // 3. Loslassen — nichts drücken, nur rollen. Wie lange bis wieder gerade?
  let catchTime = -1;
  for (let i = 0; i < 300; i++) {
    car.step(DT, cmd(), ground as never, null);
    if (catchTime < 0 && Math.abs(car.telemetry.slip) < 0.175) catchTime = i * DT;
  }

  return { peak, held, spun, speed: car.telemetry.speed * 3.6, catchTime };
}

/** Space tippen, dann sofort lenken — das Arming-Fenster muss den Drift öffnen. */
function tapThenSteer(id: VehicleId, ground: Ground, kmh: number): number {
  const car = new Vehicle(VEHICLES[id]);
  car.respawn(0, 0, 0, ground as never);
  accelerateTo(car, ground, kmh);
  for (let i = 0; i < 6; i++) {
    car.step(DT, cmd({ throttle: 0.6, handbrake: true }), ground as never, null);
  }
  let peak = 0;
  for (let i = 0; i < 90; i++) {
    car.step(DT, cmd({ throttle: 0.6, steer: 1 }), ground as never, null);
    peak = Math.max(peak, Math.abs(car.telemetry.slip));
  }
  return peak;
}

/** Nach einer Kurve Space ohne Lenkung — darf nicht in die letzte Richtung drehen. */
function spaceOnStraight(id: VehicleId, ground: Ground, kmh: number): number {
  const car = new Vehicle(VEHICLES[id]);
  car.respawn(0, 0, 0, ground as never);
  accelerateTo(car, ground, kmh);
  for (let i = 0; i < 45; i++) {
    car.step(DT, cmd({ throttle: 0.5, steer: 1 }), ground as never, null);
  }
  const yaw0 = car.yaw;
  for (let i = 0; i < 60; i++) {
    car.step(DT, cmd({ throttle: 0.5, handbrake: true }), ground as never, null);
  }
  return (Math.abs(car.yaw - yaw0) * 180) / Math.PI;
}

/** Kommt der Wagen bei sauberer Fahrt ohne Drift aus? */
function cleanCorner(id: VehicleId, ground: Ground, kmh: number, steer: number): number {
  const car = new Vehicle(VEHICLES[id]);
  car.respawn(0, 0, 0, ground as never);
  accelerateTo(car, ground, kmh);
  const hold = kmh / 3.6;
  let peak = 0;
  for (let i = 0; i < 240; i++) {
    car.step(DT, cmd({ throttle: holdSpeed(car, hold), steer }), ground as never, null);
    peak = Math.max(peak, Math.abs(car.telemetry.slip));
  }
  return peak;
}

/** Was der Nitro bringt: Endtempo mit gegen ohne, und wie lange er hält. */
function boostRun(id: VehicleId, ground: Ground): { gain: number; seconds: number } {
  const car = new Vehicle(VEHICLES[id]);
  car.respawn(0, 0, 0, ground as never);
  accelerateTo(car, ground, 120);
  const before = car.telemetry.speed;
  let seconds = 0;
  for (let i = 0; i < 600; i++) {
    car.step(DT, cmd({ throttle: 1, boost: true }), ground as never, null);
    if (car.telemetry.boosting) seconds += DT;
  }
  return { gain: (car.telemetry.speed - before) * 3.6, seconds };
}

/** Wie weit kommt ein Fahrzeug auf einem Belag in 12 s aus dem Stand? */
function surfaceRun(id: VehicleId, surface: string): number {
  const ground = flatGround(surface) as Ground;
  const car = new Vehicle(VEHICLES[id]);
  car.respawn(0, 0, 0, ground as never);
  for (let i = 0; i < 720; i++) car.step(DT, cmd({ throttle: 1 }), ground as never, null);
  return Math.hypot(car.position.x, car.position.z);
}

// ─────────────────────────────────────────────────────────────────────────────

const asphalt = flatGround('asphalt') as Ground;

console.log('\n╔══ Arcade-Fahrmodell — Prüfstand P22, idealer Boden ═══════════════════════\n');
console.log(
  `   Drift zählt ab ${deg(DRIFT_SCORE_ANGLE)}, gilt bis ${deg(DRIFT_MAX_ANGLE)}.\n`,
);

for (const id of VEHICLE_ORDER) {
  const spec = VEHICLES[id];
  const arcade = ARCADE[id];
  console.log(`── ${spec.name}  (${id})`);
  console.log(
    `   Ziel-Driftwinkel ${pad(deg(arcade.driftAngle), 6)}   Grip ${arcade.latG.toFixed(2)} g` +
      `   Endtempo (gerechnet) ${(topSpeed(arcade) * 3.6).toFixed(0)} km/h`,
  );

  const hand = driftRun(id, asphalt, 80, { handbrake: true, steer: 0.8, throttle: 0.6 });
  console.log(
    `   Handbremsdrift 80 km/h:  Spitze ${pad(deg(hand.peak), 7)}  gehalten ${pad(deg(hand.held), 7)}` +
      `  Tempo ${pad(hand.speed.toFixed(0), 4)} km/h` +
      `  fängt nach ${hand.catchTime < 0 ? '  nie' : `${hand.catchTime.toFixed(2)} s`}` +
      `${hand.spun ? '   ⚠ DREHER' : ''}`,
  );

  const power = driftRun(id, asphalt, 70, { handbrake: false, steer: 0.85, throttle: 1 });
  const powerOk = power.peak < DRIFT_SCORE_ANGLE * 1.4;
  console.log(
    `   Gasstoß im Bogen:        Spitze ${pad(deg(power.peak), 7)}  gehalten ${pad(deg(power.held), 7)}` +
      `  ${powerOk ? '✓ kein Anriss ohne Space' : '⚠ driftet ohne Handbremse'}`,
  );

  const tap = tapThenSteer(id, asphalt, 80);
  console.log(
    `   Tippen, dann lenken:     Spitze ${pad(deg(tap), 7)}` +
      `  ${tap > DRIFT_SCORE_ANGLE ? '✓ Fenster öffnet' : '⚠ Fenster tot'}`,
  );

  const kick = spaceOnStraight(id, asphalt, 80);
  console.log(
    `   Space auf der Geraden:   Restgier ${pad(kick.toFixed(1) + '°', 7)}` +
      `  ${kick < 12 ? '✓ keine letzte Richtung' : '⚠ dreht ohne Lenkung'}`,
  );

  // **Die Probe, die die erste Fassung des Modells hätte stoppen müssen.**
  // Halbe Lenkung, halbes Gas, Reisetempo — wer dabei driftet, driftet immer.
  const clean = cleanCorner(id, asphalt, 90, 0.5);
  const cleanOk = clean < DRIFT_SCORE_ANGLE;
  console.log(
    `   Saubere Kurve 90 km/h:   Schwimm ${pad(deg(clean), 6)}   ${cleanOk ? '✓ kein Drift' : '⚠ driftet ungefragt'}`,
  );

  const boost = boostRun(id, asphalt);
  console.log(
    `   Nitro:                   +${boost.gain.toFixed(0)} km/h über ${boost.seconds.toFixed(1)} s Brenndauer`,
  );

  const surfaces = ['asphalt', 'kies', 'gelaende'] as const;
  const dists = surfaces.map((s) => surfaceRun(id, s));
  console.log(
    `   12 s aus dem Stand:      ` +
      surfaces.map((s, i) => `${s} ${pad(dists[i]!.toFixed(0), 4)} m`).join('   '),
  );
  console.log('');
}

function wrapDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

interface SpinSample {
  yawDeg: number;
  peakSlip: number;
  speed: number;
  spin: number;
  endSpin: number;
}

function integrateYaw(
  car: Vehicle,
  patch: Partial<DriveInput>,
  steps: number,
): SpinSample {
  let yaw = 0;
  let prev = car.yaw;
  let peakSlip = 0;
  let peakSpin = 0;
  for (let i = 0; i < steps; i++) {
    car.step(DT, cmd(patch), asphalt as never, null);
    yaw += wrapDelta(prev, car.yaw);
    prev = car.yaw;
    peakSlip = Math.max(peakSlip, Math.abs(car.telemetry.slip));
    peakSpin = Math.max(peakSpin, car.telemetry.spin);
  }
  return {
    yawDeg: (Math.abs(yaw) * 180) / Math.PI,
    peakSlip,
    speed: car.telemetry.speed * 3.6,
    spin: peakSpin,
    endSpin: car.telemetry.spin,
  };
}

function freshTouge(kmh: number): Vehicle {
  const car = new Vehicle(VEHICLES.touge);
  car.respawn(0, 0, 0, asphalt as never);
  accelerateTo(car, asphalt, kmh);
  return car;
}

/** Gehaltener Space+Lenker im Stunt — der 180/360. */
function heldSpin(seconds: number): SpinSample {
  return integrateYaw(freshTouge(80), { throttle: 0.7, steer: 1, handbrake: true, stunt: true }, Math.round(seconds / DT));
}

/**
 * Die Probe gegen den Kreisel: Anriss mit Space, dann nur Gas+Lenkung.
 * Der Drift bleibt offen. Wenn der Spin daran hängt, ist das ein 360
 * ohne Absicht — genau der Befund.
 */
function sustainNoSpace(seconds = 1.5): SpinSample {
  const car = freshTouge(80);
  // Anriss, dann Spin abklingen lassen, dann messen. Sonst ist die
  // Spitze der Rest vom Tipp und kein Kreisel.
  integrateYaw(car, { throttle: 0.7, steer: 1, handbrake: true, stunt: true }, 12);
  integrateYaw(car, { throttle: 0.7, steer: 1, handbrake: false, stunt: true }, 24);
  return integrateYaw(car, { throttle: 0.7, steer: 1, handbrake: false, stunt: true }, Math.round(seconds / DT));
}

function catchAfterSpin(): { before: number; after: number; spin: number } {
  const car = freshTouge(80);
  integrateYaw(car, { throttle: 0.7, steer: 1, handbrake: true, stunt: true }, 42);
  const before = Math.abs(car.telemetry.slip);
  integrateYaw(car, { throttle: 0.5, steer: -1, handbrake: false, stunt: true }, 48);
  return { before, after: Math.abs(car.telemetry.slip), spin: car.telemetry.spin };
}

console.log('── Stunt-Drift (Doppeltipp, kein Toggle)\n');

const tapA = isStuntDoubleTap(Number.NEGATIVE_INFINITY, 0);
const tapB = isStuntDoubleTap(0, STUNT.tapWindow);
const tapC = isStuntDoubleTap(0, STUNT.tapWindow + 0.001);
const tapD = isStuntDoubleTap(0, STUNT.tapWindow * 0.5);
const tapOk = !tapA && tapB && tapD && !tapC;
console.log(
  `   Doppeltipp-Fenster ${STUNT.tapWindow * 1000} ms:` +
    `  erster ${tapA ? '⚠' : '✓ nicht'}   innerhalb ${tapB && tapD ? '✓' : '⚠'}` +
    `   danach ${tapC ? '⚠ noch drin' : '✓ raus'}`,
);

const single = integrateYaw(
  freshTouge(80),
  { throttle: 0.7, steer: 1, handbrake: true },
  Math.round(1.2 / DT),
);
const singleOk = single.peakSlip > DRIFT_SCORE_ANGLE && single.yawDeg < 180;
console.log(
  `   Einzeltipp 1,2 s:         Gier ${pad(single.yawDeg.toFixed(0) + '°', 6)}` +
    `  Schwimm ${pad(deg(single.peakSlip), 7)}  ${single.speed.toFixed(0)} km/h` +
    `  ${singleOk ? '✓ driftet, kein 360' : '⚠'}`,
);

const idle = sustainNoSpace(1.5);
const idleOk = idle.yawDeg < 150 && idle.endSpin < 0.12;
console.log(
  `   Stunt, Space los, lenken: Gier ${pad(idle.yawDeg.toFixed(0) + '°', 6)}` +
    `  Schwimm ${pad(deg(idle.peakSlip), 7)}  spin ${idle.endSpin.toFixed(2)}` +
    `  ${idleOk ? '✓ kein Kreisel' : '⚠ dreht ohne Space'}`,
);

const flick = heldSpin(1.0);
const flickOk = flick.yawDeg >= 120 && flick.yawDeg < 270;
console.log(
  `   Stunt, Space 1,0 s:       Gier ${pad(flick.yawDeg.toFixed(0) + '°', 6)}` +
    `  Schwimm ${pad(deg(flick.peakSlip), 7)}` +
    `  ${flickOk ? '✓ 180-Fenster' : '⚠'}`,
);

const full = heldSpin(2.2);
const fullOk = full.yawDeg >= 330;
console.log(
  `   Stunt, Space 2,2 s:       Gier ${pad(full.yawDeg.toFixed(0) + '°', 6)}` +
    `  Schwimm ${pad(deg(full.peakSlip), 7)}  ${full.speed.toFixed(0)} km/h` +
    `  ${fullOk ? '✓ 360 geht' : '⚠ kein 360'}`,
);

const caught = catchAfterSpin();
const catchOk = caught.after < caught.before * 0.7 && caught.spin < 0.15;
console.log(
  `   Gegenlenken nach Spin:    ${deg(caught.before)} → ${deg(caught.after)}` +
    `  spin ${caught.spin.toFixed(2)}` +
    `  ${catchOk ? '✓ fängt' : '⚠ fängt nicht'}`,
);

const cleanStuntCar = freshTouge(90);
const hold = 90 / 3.6;
let cleanPeak = 0;
for (let i = 0; i < 240; i++) {
  cleanStuntCar.step(
    DT,
    cmd({ throttle: cleanStuntCar.telemetry.speed < hold ? 1 : 0, steer: 0.5, stunt: true }),
    asphalt as never,
    null,
  );
  cleanPeak = Math.max(cleanPeak, Math.abs(cleanStuntCar.telemetry.slip));
}
const cleanStuntOk = cleanPeak < DRIFT_SCORE_ANGLE;
console.log(
  `   Stunt, saubere Kurve:     Schwimm ${pad(deg(cleanPeak), 6)}` +
    `  ${cleanStuntOk ? '✓ kein Drift ohne Space' : '⚠ driftet ungefragt'}`,
);

/** Geradeaus beendet den Stunt schneller als einen normalen Drift — und trotz `stunt: true` am Input. */
function fallCompare(holdSteps: number, coastSteps: number): {
  stunt: number;
  stuntDrift: number;
  normalDrift: number;
} {
  const stuntCar = freshTouge(80);
  integrateYaw(
    stuntCar,
    { throttle: 0.7, steer: 1, handbrake: true, stunt: true },
    holdSteps,
  );
  integrateYaw(stuntCar, { throttle: 0.5, steer: 0, handbrake: false, stunt: true }, coastSteps);
  const normalCar = freshTouge(80);
  integrateYaw(normalCar, { throttle: 0.7, steer: 1, handbrake: true }, holdSteps);
  integrateYaw(normalCar, { throttle: 0.5, steer: 0, handbrake: false }, coastSteps);
  return {
    stunt: stuntCar.telemetry.stunt,
    stuntDrift: stuntCar.telemetry.drift,
    normalDrift: normalCar.telemetry.drift,
  };
}

const fade = fallCompare(30, 15);
const fadeOk = fade.stunt < 0.18 && fade.stunt < fade.normalDrift;
console.log(
  `   Geradeaus 0,25 s:         stunt ${fade.stunt.toFixed(2)}  drift ${fade.stuntDrift.toFixed(2)}` +
    `  normal ${fade.normalDrift.toFixed(2)}` +
    `  ${fadeOk ? '✓ Stunt weg, schneller als Drift' : '⚠ hängt wie ein Toggle'}`,
);

let failed = 0;
if (!tapOk) failed++;
if (!singleOk) failed++;
if (!idleOk) failed++;
if (!flickOk) failed++;
if (!fullOk) failed++;
if (!catchOk) failed++;
if (!cleanStuntOk) failed++;
if (!fadeOk) failed++;
if (failed > 0) {
  console.log(`\n   ${failed} Stunt-Proben rot.\n`);
  process.exitCode = 1;
} else {
  console.log('\n   Stunt-Proben grün.\n');
}
