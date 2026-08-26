/**
 * Der Steigungs-Prüfstand — P21.
 *
 * ## Warum es ihn gibt
 *
 * Nach P20 lautete die Rückmeldung: *„warum bugge ich zum Teil immer noch? Oder
 * kann mit dem Default-Car nicht einen leichten Hügel hoch."* Das ist **zwei**
 * Beschwerden in einem Satz, und P20 hat nur die erste beantwortet (das Blech im
 * Berg). Die zweite ist eine andere Fehlerklasse und braucht ihre eigene
 * Messung.
 *
 * Der Fehler beim Suchen wäre, wieder an einem Symptom zu messen. Ein Hang, der
 * nicht befahrbar ist, kann **vier** verschiedene Ursachen haben, und sie sehen
 * im Spiel identisch aus:
 *
 *  1. **Traktion** — die Antriebsachse kann die Hangabtriebskraft gar nicht
 *     übertragen. Das ist Physik und keine Fehlfunktion; die Grenze lässt sich
 *     **ausrechnen** (siehe `grenzwinkel`).
 *  2. **Wand** — `STEEP_NY` erklärt den Hang zur Wand, die Radlast fällt
 *     schlagartig auf null, es gibt überhaupt keine Kraft mehr.
 *  3. **Blech** — die Karosserie sitzt auf (P20) und wird gebremst.
 *  4. **Flattern** — die Federung verliert immer wieder den Boden, und in jedem
 *     Schritt ohne Radlast ist auch die Antriebskraft null.
 *
 * Dieser Prüfstand fährt die Matrix Fahrzeug × Belag × Steigung ab und schreibt
 * neben jedes Ergebnis, **welche** der vier Ursachen greift. Erst damit ist
 * entscheidbar, ob eine Zelle repariert gehört oder ob sie richtig ist.
 *
 *     node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/hill.mts
 */
import { Vector3 } from 'three';

import { Vehicle } from '@/game/Vehicle';
import { CRAWL_ASSIST } from '@/config/vehicle.config';
import { VEHICLES, VEHICLE_ORDER, type VehicleSpec } from '@/config/vehicles.config';
import { STEEP_NY } from '@/game/supportPlane';
import { input } from './flat.mjs';

const DT = 1 / 60;
const DEG = Math.PI / 180;

type Belag = 'asphalt' | 'kies' | 'gelaende';

/**
 * Gleichmäßiger Hang, unendlich lang, **ohne** Übergang.
 *
 * Absichtlich ohne Knick: der Knick ist eine eigene Fehlerklasse (P20 hat sie
 * gemessen), und wer beide in einer Probe mischt, kann hinterher nicht sagen,
 * welche gegriffen hat.
 */
function hang(grad: number, belag: Belag, rau: number) {
  const s = Math.tan(grad * DEG);
  const q = Math.hypot(s, 1);
  // Rauheit als zwei kurze Sinuslagen — dieselbe Größenordnung wie das
  // Höhenfeld der Karte zwischen zwei Texeln (2…20 cm auf 1,5 m).
  const rauheit = (x: number, z: number) =>
    rau === 0 ? 0 : rau * (Math.sin(x * 3.7 + z * 1.9) * 0.6 + Math.sin(x * 8.3 - z * 6.1) * 0.4);
  const height = (x: number, z: number) => z * s + rauheit(x, z);
  return {
    height,
    normal: (x: number, z: number, t: Vector3) => {
      if (rau === 0) return t.set(0, 1 / q, -s / q);
      const e = 0.5;
      const dx = (height(x + e, z) - height(x - e, z)) / (2 * e);
      const dz = (height(x, z + e) - height(x, z - e)) / (2 * e);
      return t.set(-dx, 1, -dz).normalize();
    },
    surface: () => belag,
    waterDepth: () => 0,
  };
}

/**
 * Der **gerechnete** Grenzwinkel, in Grad — ohne einen einzigen Simulationsschritt.
 *
 * Für stationäres Steigen (a = 0, also keine Lastverlagerung) gilt in diesem
 * Modell — das in der **Waagerechten** rechnet und den Hangabtrieb als
 * `g · sinθ · cosθ` ansetzt, die Radlast als `m · g · cosθ`:
 *
 * ```
 * gefordert:    m · g · sinθ · cosθ
 * übertragbar:  Σ_Achse  μ_Achse · m · g · cosθ · Lastanteil · Antriebsanteil
 *           →   sinθ ≤ Σ μ_Achse · Lastanteil · Antriebsanteil
 * ```
 *
 * `cosθ` kürzt sich heraus. Bei Heckantrieb steht damit nur der **Hinterachs**-
 * anteil zur Verfügung — beim Coupé 47 % der Last —, und genau das ist die
 * Antwort auf „warum komme ich den Hügel nicht hoch": nicht die Reibung ist zu
 * klein, sondern die Achse, die zieht, trägt zu wenig.
 *
 * Der Rollwiderstand ist **nicht** drin. Er verschiebt die Grenze um wenige
 * Zehntelgrad und würde die Formel unlesbar machen; wo es darauf ankommt, sagt
 * es der gefahrene Wert daneben.
 */
function grenzwinkel(spec: VehicleSpec, belag: Belag, hilfe = false): number {
  const { tire, chassis, drivetrain } = spec;
  const faktor = belag === 'asphalt' ? 1 : belag === 'kies' ? tire.gripGravel : tire.gripTerrain;
  const muVorn = tire.gripAsphalt * faktor;
  const muHinten = muVorn * tire.rearGripFactor;
  const vorn = chassis.frontWeight;
  const hinten = 1 - vorn;
  // Mit der Kriechhilfe (P21) ist der Antriebsanteil im Stand `CRAWL_ASSIST.share`
  // statt `frontShare` — auf losem Boden und nur dort.
  const anteilVorn =
    hilfe && belag !== 'asphalt'
      ? Math.max(drivetrain.frontShare, CRAWL_ASSIST.share)
      : drivetrain.frontShare;
  if (anteilVorn <= 0) return Math.asin(Math.min(1, muHinten * hinten)) / DEG;
  if (anteilVorn >= 1) return Math.asin(Math.min(1, muVorn * vorn)) / DEG;
  // Beide Achsen ziehen: übertragbar ist `min(gripVorn/s, gripHinten/(1−s))` —
  // die Achse, die zuerst durchdreht, deckelt die Summe. (Ein fester Anteil kann
  // nichts verschieben; siehe den Kommentar bei der Verteilung in `Vehicle.ts`.)
  const summe = Math.min((muVorn * vorn) / anteilVorn, (muHinten * hinten) / (1 - anteilVorn));
  return Math.asin(Math.min(1, summe)) / DEG;
}

interface Fahrt {
  /** Erreichtes Tempo am Ende, km/h. Negativ = rückwärts gerutscht. */
  tempo: number;
  /** Zurückgelegte Höhe in Metern. */
  gestiegen: number;
  /** Anteil der Schritte ohne Radlast. */
  luft: number;
  /** Tiefstes Aufsitzen der Karosserie. */
  blech: number;
  /** Mittlere Ausnutzung der Antriebskraft (>1 = Räder drehen durch). */
  spin: number;
}

function fahre(spec: VehicleSpec, grad: number, belag: Belag, rau: number, sekunden = 20): Fahrt {
  const g = hang(grad, belag, rau);
  const v = new Vehicle(spec);
  v.respawn(0, 0, 0, g as never);
  const y0 = v.position.y;
  const cmd = input({ throttle: 1 }) as never;
  const schritte = Math.round(sekunden / DT);
  let luft = 0;
  let blech = 0;
  let spin = 0;
  for (let i = 0; i < schritte; i++) {
    v.step(DT, cmd, g as never, null);
    if (v.telemetry.airborne) luft++;
    if (v.telemetry.hullDepth > blech) blech = v.telemetry.hullDepth;
    spin += v.telemetry.wheelspin;
  }
  return {
    // Vorzeichen aus der Längsgeschwindigkeit: rückwärts rutschen ist etwas
    // anderes als stehen, und beide sähen im Betrag gleich aus.
    tempo: v.telemetry.forwardSpeed * 3.6,
    gestiegen: v.position.y - y0,
    luft: luft / schritte,
    blech,
    spin: spin / schritte,
  };
}

/** Welche der vier Ursachen erklärt das Ergebnis? */
function ursache(f: Fahrt, grad: number, grenze: number): string {
  if (f.gestiegen > 1) return 'ok';
  if (grad >= 90 - Math.acos(STEEP_NY) / DEG) return 'WAND';
  if (grad > grenze) return 'Traktion';
  if (f.blech > 0.05) return 'BLECH';
  if (f.luft > 0.05) return 'FLATTERN';
  return '???';
}

const nf = (x: number, d = 1) => x.toFixed(d).padStart(6);
const WAND_GRAD = Math.acos(STEEP_NY) / DEG;

console.log('╔══ Steigung — Prüfstand P21 ══════════════════════════════════════════════');
console.log(`   STEEP_NY = ${STEEP_NY} ≙ ${WAND_GRAD.toFixed(1)}° — darüber gibt es keine Radlast.\n`);

for (const belag of ['asphalt', 'kies', 'gelaende'] as const) {
  console.log(`── Belag: ${belag}`);
  for (const id of VEHICLE_ORDER) {
    const spec = VEHICLES[id];
    const grenze = grenzwinkel(spec, belag, true);
    const zellen: string[] = [];
    for (const grad of [5, 10, 15, 20, 25, 30, 35, 40]) {
      const f = fahre(spec, grad, belag, 0);
      zellen.push(`${String(grad).padStart(2)}°:${nf(f.tempo, 0)}${ursache(f, grad, grenze) === 'ok' ? ' ' : '!'}`);
    }
    console.log(
      `   ${spec.name.padEnd(18)} ${spec.drivetrain.layout.toUpperCase().padEnd(3)} ` +
        `Grenze ${nf(grenzwinkel(spec, belag))}° → mit Kriechhilfe ${nf(grenze)}°  |  ${zellen.join('  ')}`,
    );
  }
  console.log('');
}

console.log('── Diagnose: warum bleibt er stehen (glatter Hang, 20 s Vollgas)');
for (const belag of ['gelaende'] as const) {
  for (const id of VEHICLE_ORDER) {
    const spec = VEHICLES[id];
    const grenze = grenzwinkel(spec, belag);
    for (const grad of [10, 15, 20, 25, 30]) {
      const f = fahre(spec, grad, belag, 0);
      console.log(
        `   ${spec.name.padEnd(18)} ${String(grad).padStart(2)}°  ` +
          `Tempo ${nf(f.tempo)} km/h  gestiegen ${nf(f.gestiegen)} m  ` +
          `Luft ${nf(f.luft * 100)} %  Blech ${nf(f.blech, 3)} m  Spin ${nf(f.spin, 2)}  ` +
          `→ ${ursache(f, grad, grenze)}`,
      );
    }
  }
}

console.log('\n── Dasselbe auf **rauem** Gelände (±6 cm, wie zwischen zwei Texeln)');
for (const id of VEHICLE_ORDER) {
  const spec = VEHICLES[id];
  const grenze = grenzwinkel(spec, 'gelaende', true);
  const zeilen: string[] = [];
  for (const grad of [10, 15, 20, 25]) {
    const glatt = fahre(spec, grad, 'gelaende', 0);
    const rau = fahre(spec, grad, 'gelaende', 0.06);
    zeilen.push(
      `${String(grad).padStart(2)}° glatt ${nf(glatt.tempo)} (Luft ${nf(glatt.luft * 100, 0)} %) ` +
        `rau ${nf(rau.tempo)} (Luft ${nf(rau.luft * 100, 0)} %, Blech ${nf(rau.blech, 2)})`,
    );
  }
  console.log(`   ${spec.name} — Grenze ${nf(grenze)}°`);
  for (const z of zeilen) console.log(`      ${z}`);
}
