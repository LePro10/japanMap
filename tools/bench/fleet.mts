/**
 * Der Prüfstand der Fahrzeugliste — P18.
 *
 * Er fährt **jedes** Fahrzeug durch dieselben acht Proben und gibt eine Tabelle
 * aus. Das ist der ganze Zweck: die Zahlen einer Spec sagen für sich genommen
 * nichts, erst der Vergleich sagt, ob ein Lastwagen sich wie ein Lastwagen
 * verhält.
 *
 * Er läuft **ohne Renderer, ohne Browser und ohne Gelände** — auf einem idealen
 * Boden, wie ihn CLAUDE.md unter „Für das Fahrmodell selbst gibt es einen
 * kürzeren Weg" beschreibt. Was er deshalb nicht kann: sagen, ob sich etwas gut
 * anfühlt, und sagen, ob ein Fahrzeug durch die Kehren des Bergpasses passt. Das
 * erste ist eine Frage für einen Menschen, das zweite für `japanMap.driveProbe()`
 * im laufenden Bild.
 *
 *     node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/fleet.mts
 */
import { Vehicle } from '@/game/Vehicle';
import { GRAVITY } from '@/config/vehicle.config';
import { VEHICLES, VEHICLE_ORDER, type VehicleSpec } from '@/config/vehicles.config';
import { flatGround, input } from './flat.mjs';

const DT = 1 / 60;
type Cmd = { throttle: number; brake: number; steer: number; handbrake: boolean };

function drive(spec: VehicleSpec, surface: string) {
  const v = new Vehicle(spec);
  const g = flatGround(surface) as never;
  v.respawn(0, 0, 0, g);
  return {
    v,
    g,
    step(cmd: Partial<Cmd>) {
      v.step(DT, input(cmd) as never, g, null);
    },
    run(n: number, cmd: Partial<Cmd> | ((i: number) => Partial<Cmd>)) {
      for (let i = 0; i < n; i++) v.step(DT, input(typeof cmd === 'function' ? cmd(i) : cmd) as never, g, null);
    },
  };
}

/** Regler, der ein Tempo hält — sonst misst der Lenktest das Tempo. */
function hold(v: Vehicle, target: number): Partial<Cmd> {
  const e = target - v.telemetry.forwardSpeed;
  return e > 0
    ? { throttle: Math.min(1, e * 0.5), brake: 0 }
    : { throttle: 0, brake: Math.min(1, -e * 0.4) };
}

// ── Die Proben ───────────────────────────────────────────────────────────────

/** 0–100 km/h und Endtempo nach 60 s Vollgas. */
function acceleration(spec: VehicleSpec) {
  const d = drive(spec, 'asphalt');
  let hundred: number | null = null;
  for (let i = 0; i < 5400; i++) {
    d.step({ throttle: 1 });
    if (hundred === null && d.v.telemetry.speed * 3.6 >= 100) hundred = i * DT;
  }
  return { hundred, top: d.v.telemetry.speed * 3.6, drift: d.v.position.x };
}

/** Bremsweg aus 100 km/h. */
function braking(spec: VehicleSpec) {
  const d = drive(spec, 'asphalt');
  for (let i = 0; i < 7200 && d.v.telemetry.forwardSpeed < 27.78; i++) d.step({ throttle: 1 });
  const from = d.v.position.z;
  let steps = 0;
  while (d.v.telemetry.forwardSpeed > 0.5 && steps < 3600) {
    d.step({ brake: 1 });
    steps++;
  }
  return { metres: d.v.position.z - from, seconds: steps * DT };
}

/**
 * Kann die angetriebene Achse durchdrehen?
 *
 * Zwei Lagen, weil sie verschiedene Fehler finden: **beim Anfahren** hängt es an
 * der Übersetzung (`launchBoost`), **im Bogen** am Reibkreis.
 */
function traction(spec: VehicleSpec, surface: string) {
  const d = drive(spec, surface);
  let launch = 0;
  d.run(600, () => {
    launch = Math.max(launch, d.v.telemetry.wheelspin);
    return { throttle: 1 };
  });

  const c = drive(spec, surface);
  for (let i = 0; i < 3600 && c.v.telemetry.forwardSpeed < 16.6; i++) c.step({ throttle: 1 });
  c.run(30, {});
  let corner = 0;
  let slip = 0;
  c.run(120, () => {
    corner = Math.max(corner, c.v.telemetry.wheelspin);
    slip = Math.max(slip, Math.abs(c.v.telemetry.slip));
    return { throttle: 1, steer: 0.35 };
  });
  return { launch, corner, slip: (slip * 180) / Math.PI };
}

/** Lenksymmetrie — der Betrag ist egal, die Spiegelung nicht. */
function symmetry(spec: VehicleSpec) {
  const out: number[] = [];
  for (const s of [1, -1]) {
    const d = drive(spec, 'asphalt');
    d.run(300, { throttle: 1 });
    d.run(180, { throttle: 1, steer: s });
    out.push(d.v.position.x);
  }
  return { right: out[0]!, left: out[1]!, delta: Math.abs(out[0]! + out[1]!) };
}

/** Gierstabilität: Lenkimpuls, dann loslassen. Der Schwimmwinkel muss abklingen. */
function yawSettle(spec: VehicleSpec) {
  const d = drive(spec, 'asphalt');
  for (let i = 0; i < 3600 && d.v.telemetry.forwardSpeed < 25; i++) d.step({ throttle: 1 });
  let peak = 0;
  d.run(18, () => {
    peak = Math.max(peak, Math.abs(d.v.telemetry.slip));
    return { throttle: 0.4, steer: 1 };
  });
  d.run(180, () => {
    peak = Math.max(peak, Math.abs(d.v.telemetry.slip));
    return { throttle: 0.4 };
  });
  return { peak: (peak * 180) / Math.PI, after: (Math.abs(d.v.telemetry.slip) * 180) / Math.PI };
}

/**
 * **Lastwechsel im Bogen** — die Probe, die P18 einen Fehler gekostet hat.
 *
 * Einlenken, dann das Gas ganz wegnehmen. Der Schwimmwinkel darf eine Spitze
 * haben, muss danach aber **abklingen**. Tut er es nicht, steht der Wagen quer,
 * und der Fahrer hat dafür nichts getan außer den Fuß zu heben — genau der
 * Befund, den die erste Fassung der Motorbremse erzeugt hat (89,7° Spitze, 60°
 * nach 2,5 s).
 */
function liftOff(spec: VehicleSpec) {
  const rows: { steer: number; peak: number; after: number }[] = [];
  for (const steer of [0.35, 0.55, 0.8]) {
    const d = drive(spec, 'asphalt');
    for (let i = 0; i < 5400 && d.v.telemetry.forwardSpeed < 19; i++) d.step({ throttle: 1 });
    d.run(45, { steer });
    let peak = 0;
    d.run(150, () => {
      peak = Math.max(peak, Math.abs(d.v.telemetry.slip));
      return { steer };
    });
    rows.push({
      steer,
      peak: (peak * 180) / Math.PI,
      after: (Math.abs(d.v.telemetry.slip) * 180) / Math.PI,
    });
  }
  return rows;
}

/** Ausrollen: das Tempo muss monoton fallen, sonst erzeugt das Modell Energie. */
function coast(spec: VehicleSpec) {
  const d = drive(spec, 'asphalt');
  d.run(900, { throttle: 1 });
  const from = d.v.telemetry.speed;
  d.run(60, {}); // Gasrampe abwarten
  let prev = d.v.telemetry.speed;
  let rises = 0;
  let maxRise = 0;
  let toHalf = 0;
  const half = from * 0.5;
  for (let i = 0; i < 3600; i++) {
    d.step({});
    const s = d.v.telemetry.speed;
    if (s > prev) {
      rises++;
      maxRise = Math.max(maxRise, s - prev);
    }
    if (toHalf === 0 && s < half) toHalf = i * DT;
    prev = s;
  }
  return { rises, maxRise, toHalf, from: from * 3.6 };
}

/** Geradeauslauf auf losem Boden — der Fall, an dem P17 gescheitert ist. */
function loose(spec: VehicleSpec, surface: string) {
  const d = drive(spec, surface);
  d.run(600, { throttle: 1 });
  return {
    kmh: d.v.telemetry.speed * 3.6,
    slip: (Math.abs(d.v.telemetry.slip) * 180) / Math.PI,
    drift: Math.abs(d.v.position.x),
  };
}

/** Stationäre Gierrate über der Lenkeingabe, bei geregeltem Tempo. */
function steerResponse(spec: VehicleSpec, kmh: number) {
  const target = kmh / 3.6;
  const out: number[] = [];
  for (const s of [0.2, 0.4, 0.6, 0.8, 1.0]) {
    const d = drive(spec, 'asphalt');
    for (let i = 0; i < 5400 && d.v.telemetry.forwardSpeed < target * 0.99; i++) d.step({ throttle: 1 });
    d.run(300, () => ({ ...hold(d.v, target), steer: s }));
    const y0 = d.v.yaw;
    d.run(120, () => ({ ...hold(d.v, target), steer: s }));
    out.push((Math.abs(d.v.yaw - y0) * 180) / Math.PI / 2);
  }
  return out;
}

// ── Rechnungen, die keinen Lauf brauchen ─────────────────────────────────────

/** Gierstabilitätsreserve `b·C_h / (a·C_v)` des Einspurmodells. */
function stability(spec: VehicleSpec, mu: number): number {
  const { chassis, tire, derived } = spec;
  const w = chassis.mass * GRAVITY;
  const cf = (2 * tire.gripAsphalt * mu * w * chassis.frontWeight) / tire.peakSlipFront;
  const cr =
    (2 * tire.gripAsphalt * mu * tire.rearGripFactor * w * (1 - chassis.frontWeight)) /
    tire.peakSlipRear;
  return (derived.cgToRear * cr) / (derived.cgToFront * cf);
}

/**
 * Antriebskraft, ab der die angetriebene Achse durchdreht — **mit**
 * Lastverlagerung.
 *
 * Genau die Rechnung, deren Fehlen den Befund „dreht auf Asphalt nie durch"
 * erzeugt hat: `F > μ·m·g·w / (1 − μ·h/L)` für die angetriebene Achse. Beim
 * Allradler entfällt der Nenner — was die eine Achse verliert, gewinnt die
 * andere, die Summe ist schlicht `μ·m·g`.
 */
function spinThreshold(spec: VehicleSpec, mu: number): number {
  const { chassis, tire, drivetrain } = spec;
  const w = chassis.mass * GRAVITY;
  const share = drivetrain.frontShare;
  if (share > 0 && share < 1) return tire.gripAsphalt * mu * w;
  const rear = share <= 0;
  const muAxle = tire.gripAsphalt * mu * (rear ? tire.rearGripFactor : 1);
  const weight = rear ? 1 - chassis.frontWeight : chassis.frontWeight;
  // Beschleunigen verlagert nach hinten: die Hinterachse gewinnt, die vordere
  // verliert — daher das Vorzeichen im Nenner.
  const denom = 1 - (rear ? 1 : -1) * (muAxle * chassis.cgHeight) / chassis.wheelbase;
  return (muAxle * w * weight) / denom;
}

// ── Ausgabe ─────────────────────────────────────────────────────────────────

const pad = (s: string, n: number) => s.padEnd(n);
const num = (x: number, d = 1, n = 8) => x.toFixed(d).padStart(n);

console.log('\n╔══ Fahrzeugliste — Prüfstand P18, idealer Boden ═══════════════════════════\n');

for (const id of VEHICLE_ORDER) {
  const spec = VEHICLES[id];
  const a = acceleration(spec);
  const b = braking(spec);
  const sym = symmetry(spec);
  const yaw = yawSettle(spec);
  const co = coast(spec);

  console.log(`── ${spec.name}  (${id}, ${spec.drivetrain.layout.toUpperCase()}, ${spec.chassis.mass} kg)`);
  console.log(
    `   0–100 ${a.hundred === null ? '  nie  ' : num(a.hundred, 2, 6) + ' s'}` +
      `   Endtempo ${num(a.top, 0, 4)} km/h` +
      `   Bremsweg 100→0 ${num(b.metres, 1, 5)} m in ${num(b.seconds, 2, 5)} s`,
  );
  console.log(
    `   Geradeauslauf ${num(Math.abs(a.drift), 4, 7)} m Versatz auf 60 s` +
      `   Lenksymmetrie ±${num(Math.abs(sym.right), 2, 6)} m, Abweichung ${sym.delta.toExponential(1)}`,
  );
  console.log(
    `   Gier: Spitze ${num(yaw.peak, 1, 5)}°, nach 3 s ${num(yaw.after, 1, 5)}°` +
      `   Ausrollen: ${co.rises} Anstiege (max ${co.maxRise.toExponential(1)} m/s), ` +
      `${num(co.from, 0, 3)}→halb in ${num(co.toHalf, 1, 5)} s`,
  );

  const rows: string[] = [];
  for (const [surface, mu] of [
    ['asphalt', 1],
    ['kies', spec.tire.gripGravel],
    ['gelaende', spec.tire.gripTerrain],
  ] as const) {
    const t = traction(spec, surface);
    const l = loose(spec, surface);
    rows.push(
      `     ${pad(surface, 9)} Durchdrehen: Anfahrt ${num(t.launch, 2, 5)}× Bogen ${num(t.corner, 2, 5)}×` +
        `  Grenze ${num(spinThreshold(spec, mu) / 1000, 1, 5)} kN` +
        `  |  10 s Vollgas ${num(l.kmh, 0, 4)} km/h, Schwimm ${num(l.slip, 1, 4)}°, Versatz ${num(l.drift, 2, 5)} m` +
        `  |  Stabilität ${num(stability(spec, mu), 2, 5)}`,
    );
  }
  console.log(rows.join('\n'));

  for (const kmh of [40, 90]) {
    const r = steerResponse(spec, kmh);
    // **Nicht auf Monotonie prüfen, sondern auf den Abfall hinter dem
    // Höchstwert.** Ein Fahrzeug an der Haftgrenze *darf* bei mehr Lenkeinschlag
    // weniger Gierrate liefern — das ist Untersteuern und richtige Physik
    // (die größte Gierrate ist `a_lat/v`, und `a_lat` ist durch μ gedeckelt).
    // Was nicht sein darf, ist ein **starker** Abfall: dann lenkt der Fahrer
    // mehr und das Auto tut deutlich weniger, und genau das liest sich als
    // „schwer zu steuern".
    const peak = Math.max(...r);
    const drop = ((peak - r[r.length - 1]!) / peak) * 100;
    console.log(
      `     Lenkantwort ${kmh} km/h: ` +
        r.map((x) => num(x, 1, 5)).join(' ') +
        ` °/s  (Lenkung 0,2…1,0)   Abfall hinter der Spitze ${num(drop, 0, 3)} %` +
        (drop > 15 ? '  ← zu viel' : ''),
    );
  }
  console.log(
    '     Lastwechsel im Bogen: ' +
      liftOff(spec)
        .map(
          (r) =>
            `steer ${r.steer.toFixed(2)} ${num(r.peak, 1, 5)}°→${num(r.after, 1, 5)}°` +
            (r.after > 25 ? ' ← quer' : ''),
        )
        .join('  '),
  );
  console.log(
    `     Einfederung im Stand ${num(spec.derived.staticCompression * 100, 1, 5)} cm ` +
      `= ${num((spec.derived.staticCompression / spec.suspension.travel) * 100, 0, 3)} % des Federwegs`,
  );
  console.log('');
}
