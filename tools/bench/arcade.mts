import { Vehicle, type DriveInput } from '@/game/Vehicle';
import { VEHICLES, VEHICLE_ORDER, type VehicleId } from '@/config/vehicles.config';
import { ARCADE, DRIFT_MAX_ANGLE, DRIFT_SCORE_ANGLE, topSpeed } from '@/config/arcade.config';
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
 * | **Gasstoß im Bogen** | ist der Drift auch ohne Handbremse auslösbar? |
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
  console.log(
    `   Gasstoß im Bogen:        Spitze ${pad(deg(power.peak), 7)}  gehalten ${pad(deg(power.held), 7)}` +
      `  Tempo ${pad(power.speed.toFixed(0), 4)} km/h` +
      `  fängt nach ${power.catchTime < 0 ? '  nie' : `${power.catchTime.toFixed(2)} s`}` +
      `${power.spun ? '   ⚠ DREHER' : ''}`,
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
