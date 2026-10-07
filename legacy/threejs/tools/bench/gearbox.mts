/**
 * Getriebe-Prüfstand — Tonschicht 2.
 *
 * Fährt jedes Fahrzeug auf idealem Boden 0 → Endtempo, dann Gas weg und
 * Vollbremsung, und schreibt Gang, Drehzahl und Last mit. Geprüft wird, was
 * man im Ton hört: Schaltet es durch alle Gänge? Pendelt es (zwei
 * Schaltvorgänge in < 0,3 s)? Fällt die Drehzahl beim Hochschalten, statt zu
 * springen? Bleibt der Begrenzer auf der Geraden still?
 *
 *   node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/gearbox.mts
 */
import { Vector3 } from 'three';
import { Vehicle } from '../../src/game/Vehicle.ts';
import { VEHICLES } from '../../src/config/vehicles.config.ts';

const flat = {
  height: () => 0,
  normal: (_x: number, _z: number, t: Vector3) => t.set(0, 1, 0),
  surface: () => 'asphalt' as const,
};
const verbose = process.argv.includes('--trace');
let fail = 0;
for (const spec of Object.values(VEHICLES)) {
  const v = new Vehicle(spec);
  v.respawn(0, 0, 0, flat as never);
  const dt = 1 / 60;
  const shiftTimes: number[] = [];
  let lastShifts = v.telemetry.shifts;
  let maxGear = 0;
  let maxJump = 0;
  let prevRpm = v.telemetry.rpm;
  let limiter0 = v.telemetry.limiterHits;
  const trace: string[] = [];
  for (let i = 0; i < 60 * 40; i++) {
    const t = i * dt;
    const phase = t < 30 ? 'gas' : t < 33 ? 'lift' : 'brake';
    const input = { throttle: phase === 'gas' ? 1 : 0, brake: phase === 'brake' ? 1 : 0, steer: 0, handbrake: false };
    v.step(dt, input, flat as never, null);
    const tel = v.telemetry;
    if (tel.shifts !== lastShifts) { shiftTimes.push(t); lastShifts = tel.shifts; }
    maxGear = Math.max(maxGear, tel.gear);
    maxJump = Math.max(maxJump, Math.abs(tel.rpm - prevRpm));
    prevRpm = tel.rpm;
    if (i % 15 === 0) trace.push(`${t.toFixed(2)} ${phase} ${(tel.speed * 3.6).toFixed(0)}km/h g${tel.gear} ${tel.rpm.toFixed(0)} L${tel.load.toFixed(2)}`);
    if (t < 30 && i === 60 * 29) limiter0 = tel.limiterHits - limiter0;
  }
  const gaps = shiftTimes.slice(1).map((x, k) => x - shiftTimes[k]!);
  const hunting = gaps.filter((g) => g < 0.3).length;
  const ok = maxGear >= 4 && hunting === 0 && limiter0 === 0;
  if (!ok) fail++;
  console.log(`${ok ? 'ok ' : 'ROT'} ${spec.id.padEnd(9)} Gänge bis ${maxGear}, Schaltvorgänge ${shiftTimes.length}, Pendeln ${hunting}, Begrenzer auf Gerade ${limiter0}, größter Drehzahlsprung/Schritt ${maxJump.toFixed(0)}`);
  if (verbose) console.log(trace.join('\n'));
}
process.exit(fail ? 1 : 0);
