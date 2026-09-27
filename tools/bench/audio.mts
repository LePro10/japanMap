/**
 * Ton-Prüfstand — Tonschicht 2.
 *
 * Rendert **denselben** DSP-Code, den der AudioWorklet im Spiel fährt, offline
 * in WAV-Dateien, getrieben vom echten `Vehicle` samt `Gearbox` auf idealem
 * Boden. Zwei Zwecke:
 *
 * 1. **Messen, was ein Ohr nicht messen kann:** NaN, Gleichanteil, Spitzen
 *    über 0 dBFS, und die Lautheit je Fahrzeug unter Vollgas — daraus der
 *    Abgleich `ENGINE_VOICES[…].gain` (Spalte „trim").
 * 2. **Anhören ohne Browser.** `.cache/audio/<id>.wav` ist eine Fahrt:
 *    Anlassen, Leerlauf, Gasstöße im Stand, Vollgas durch die Gänge, Gas weg
 *    (Schub, Fehlzündungen), Bremsen mit Zwischengas, Drift auf Asphalt, Kies.
 *
 * Was er nicht kann: sagen, ob es gut klingt. Das ist eine Frage für Kopfhörer.
 *
 *   node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/audio.mts [id…]
 */
import fs from 'node:fs';
import path from 'node:path';
import { Vector3 } from 'three';
import { Vehicle } from '../../src/game/Vehicle.ts';
import { VEHICLES } from '../../src/config/vehicles.config.ts';
import { ENGINE_VOICES } from '../../src/config/audio.config.ts';
import { VehicleMixer, SURFACE_ID } from '../../src/audio/dsp/vehicleMixer.ts';

const SR = 48000;
const BLOCK = 128;
const FPS = 60;
const outDir = path.resolve('.cache/audio');
fs.mkdirSync(outDir, { recursive: true });

type Surf = 'asphalt' | 'kies';
interface Phase {
  until: number;
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  starter?: boolean;
  surface?: Surf;
  label: string;
}
const SCRIPT: Phase[] = [
  { until: 0.7, throttle: 0, brake: 0, steer: 0, handbrake: true, starter: true, label: 'anlassen' },
  { until: 2.5, throttle: 0, brake: 0, steer: 0, handbrake: true, label: 'leerlauf' },
  { until: 2.8, throttle: 1, brake: 0, steer: 0, handbrake: true, label: 'gasstoss' },
  { until: 3.8, throttle: 0, brake: 0, steer: 0, handbrake: true, label: 'leerlauf' },
  { until: 14, throttle: 1, brake: 0, steer: 0, handbrake: false, label: 'vollgas' },
  { until: 16.5, throttle: 0, brake: 0, steer: 0, handbrake: false, label: 'schub' },
  { until: 19, throttle: 0, brake: 1, steer: 0, handbrake: false, label: 'bremsen' },
  { until: 22, throttle: 1, brake: 0, steer: 0.2, handbrake: false, label: 'anfahren' },
  { until: 22.3, throttle: 1, brake: 0, steer: 1, handbrake: true, label: 'drift' },
  { until: 26, throttle: 1, brake: 0, steer: 1, handbrake: false, label: 'drift' },
  { until: 29, throttle: 0.7, brake: 0, steer: 0, handbrake: false, surface: 'kies', label: 'kies' },
];

function ground(surface: () => Surf) {
  return {
    height: () => 0,
    normal: (_x: number, _z: number, t: Vector3) => t.set(0, 1, 0),
    surface: () => surface(),
  };
}

function writeWav(file: string, l: Float32Array, r: Float32Array): void {
  const n = l.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l[i]!)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r[i]!)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const ids = (only.length ? only : Object.keys(VEHICLES)) as (keyof typeof VEHICLES)[];
const MASTER = 0.45;
const engineOnly = process.argv.includes('--engine-only');
const noEngine = process.argv.includes('--no-engine');
let bad = 0;
console.log('id        peak   rms(vollgas) rms(leerlauf) dc      nan  shifts  trim');
for (const id of ids) {
  const spec = VEHICLES[id];
  const v = new Vehicle(spec);
  let surf: Surf = 'asphalt';
  const g = ground(() => surf);
  v.respawn(0, 0, 0, g as never);
  const mixer = new VehicleMixer(SR);
  mixer.setProfile(ENGINE_VOICES[id]);
  const total = SCRIPT[SCRIPT.length - 1]!.until;
  const frames = Math.floor(total * SR / BLOCK) * BLOCK;
  const L = new Float32Array(frames);
  const R = new Float32Array(frames);
  const bl = new Float32Array(BLOCK);
  const br = new Float32Array(BLOCK);
  let t = 0;
  let nextStep = 0;
  let shifts = v.telemetry.shifts;
  let nShift = 0;
  let nan = 0;
  let sumFull = 0, nFull = 0, sumIdle = 0, nIdle = 0, dc = 0, peak = 0;
  for (let off = 0; off < frames; off += BLOCK) {
    t = off / SR;
    const phase = SCRIPT.find((ph) => t < ph.until) ?? SCRIPT[SCRIPT.length - 1]!;
    surf = phase.surface ?? 'asphalt';
    while (nextStep <= t) {
      v.step(1 / FPS, phase, g as never, null);
      nextStep += 1 / FPS;
    }
    const tel = v.telemetry;
    if (tel.shifts !== shifts) {
      const up = tel.gear > 0 && tel.throttle > 0.5;
      if (up && tel.rpm > tel.redline * 0.55) mixer.bang(0.35);
      mixer.clunk();
      shifts = tel.shifts;
      nShift++;
    }
    const starting = phase.starter === true;
    mixer.setParams({
      rpm: starting ? 180 + 120 * Math.sin(t * 40) ** 2 : tel.rpm,
      load: starting ? 0.05 : tel.load,
      throttle: tel.throttle,
      idle: tel.idleRpm,
      redline: tel.redline,
      on: noEngine ? 0 : 1,
      starter: starting ? 1 : 0,
      cabin: 0,
      speed: tel.speed,
      surface: SURFACE_ID[tel.surface as keyof typeof SURFACE_ID] ?? 0,
      skid: tel.skid,
      slip: Math.abs(tel.slip),
      wheelspin: tel.wheelspin,
      airborne: tel.airborne ? 1 : 0,
      water: 0,
      boost: 0,
      scrape: 0,
      circuit: 0,
      drive: engineOnly ? 0 : 1,
      fly: 0,
    });
    mixer.render(bl, br, BLOCK);
    for (let i = 0; i < BLOCK; i++) {
      const a = bl[i]! * MASTER;
      const b = br[i]! * MASTER;
      if (!Number.isFinite(a) || !Number.isFinite(b)) nan++;
      L[off + i] = a;
      R[off + i] = b;
      peak = Math.max(peak, Math.abs(a), Math.abs(b));
      dc += a;
      const sq = (a * a + b * b) / 2;
      if (phase.label === 'vollgas' && t > 5) { sumFull += sq; nFull++; }
      if (phase.label === 'leerlauf' && t > 1.2 && t < 2.5) { sumIdle += sq; nIdle++; }
    }
  }
  const rmsFull = Math.sqrt(sumFull / Math.max(1, nFull));
  const rmsIdle = Math.sqrt(sumIdle / Math.max(1, nIdle));
  const trim = 0.12 / Math.max(1e-6, rmsFull);
  const ok = nan === 0 && Math.abs(dc / frames) < 0.01;
  if (!ok) bad++;
  writeWav(path.join(outDir, `${id}${engineOnly ? '-engine' : noEngine ? '-world' : ''}.wav`), L, R);
  console.log(
    `${id.padEnd(9)} ${peak.toFixed(2).padStart(5)}  ${rmsFull.toFixed(4).padStart(10)}  ${rmsIdle.toFixed(4).padStart(11)}  ${(dc / frames).toFixed(4).padStart(7)} ${String(nan).padStart(4)} ${String(nShift).padStart(6)}  ${trim.toFixed(2)}`,
  );
}
console.log(`\nWAV: ${outDir}`);
process.exit(bad ? 1 : 0);
