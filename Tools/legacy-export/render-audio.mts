// Renders STAND-IN sound loops from the prototype's own engine/tyre synthesizer (legacy src/audio/dsp, the
// code its AudioWorklet ran) into WAV files for Unity — Unity's web audio cannot run a DSP (no
// OnAudioFilterRead), but it can pitch and crossfade loops. Not recordings: the human checks them with
// headphones; real CC0/own recordings replace them (STATUS "Für die Asset-Sitzung").
//   node --experimental-strip-types --import ./Tools/legacy-export/register.mjs Tools/legacy-export/render-audio.mts <outDir>
// Per car (legacy id): idle 1.0 s + 4 rpm steps × (on load 0.8 s, off load 1.0 s); world: roll/skid per surface, wind.
// Lengths are a download trade-off (Phase 9: 130 stand-ins +1.7 MB); longer loops repeat less audibly.
// Every loop starts with 1024 samples of silence and carries a `smpl` loop chunk after it (Unity manual
// "Audio in Web": the AAC encoder alters the first 1024 samples, which clicks at the loop point otherwise).
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_VOICES } from '@/config/audio.config.ts';
import { GEARBOX } from '@/config/gearbox.config.ts';
import { VehicleMixer } from '@/audio/dsp/vehicleMixer.ts';

const SR = 32000;
const BLOCK = 128;
const PAD = 1024;
const MASTER = 0.45;
const outDir = path.resolve(process.argv[2] ?? 'Assets/_Project/Art/Audio/StandIn');
fs.mkdirSync(outDir, { recursive: true });

// Engine steps as a share of redline; Unity crossfades neighbours and pitches between them.
export const STEPS = [0.3, 0.5, 0.7, 0.92];
const CARS: Record<string, string> = {
  touge: 'hachi', pip: 'mame', truck: 'hauler', offroad: 'yama', torrent: 'kumo',
  ribbon: 'kaze', meridian: 'raiden', morrow: 'suprema', gt: 'rotor', needle: 'hanami',
};

type Params = Parameters<VehicleMixer['setParams']>[0];

function render(mixer: VehicleMixer, params: Params, warm: number, seconds: number): Float32Array {
  const total = Math.ceil((warm + seconds + 0.1) * SR / BLOCK) * BLOCK;
  const l = new Float32Array(BLOCK), r = new Float32Array(BLOCK);
  const out = new Float32Array(total);
  mixer.setParams(params);
  for (let off = 0; off < total; off += BLOCK) {
    mixer.render(l, r, BLOCK);
    for (let i = 0; i < BLOCK; i++) {
      const v = (l[i]! + r[i]!) * 0.5 * MASTER;
      out[off + i] = Number.isFinite(v) ? v : 0;
    }
  }
  return out;
}

// Seamless loop of `seconds` taken after `warm`: the last 60 ms crossfade (equal power) into the samples
// just before the start, so the end runs straight into sample 0.
function loop(s: Float32Array, warm: number, seconds: number): Float32Array {
  const a = Math.round(warm * SR), n = Math.round(seconds * SR), x = Math.round(0.06 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < n - x) { out[i] = s[a + i]!; continue; }
    const w = (i - (n - x)) / x;
    out[i] = s[a + i]! * Math.cos(w * Math.PI / 2) + s[a - x + (i - (n - x))]! * Math.sin(w * Math.PI / 2);
  }
  return out;
}

function oneShot(s: Float32Array, from: number, seconds: number): Float32Array {
  const a = Math.round(from * SR), n = Math.round(seconds * SR), fade = Math.round(0.03 * SR);
  const out = s.slice(a, a + n);
  for (let i = 0; i < fade; i++) out[n - 1 - i]! *= i / fade;
  return out;
}

function writeWav(name: string, data: Float32Array, looped: boolean): { peak: number; rms: number } {
  const body = looped ? PAD + data.length : data.length;
  const smpl = looped ? 60 + 8 : 0;
  const buf = Buffer.alloc(44 + body * 2 + smpl);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + body * 2 + smpl, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(body * 2, 40);
  let peak = 0, sum = 0;
  const start = looped ? PAD : 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i]!));
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
    buf.writeInt16LE(Math.round(v * 32767), 44 + (start + i) * 2);
  }
  if (looped) {
    let o = 44 + body * 2;
    buf.write('smpl', o); buf.writeUInt32LE(60, o + 4); o += 8;
    const f = [0, 0, Math.round(1e9 / SR), 60, 0, 0, 0, 1, 0];
    for (const v of f) { buf.writeUInt32LE(v, o); o += 4; }
    // one forward loop over the sound, after the silence
    for (const v of [0, 0, PAD, PAD + data.length - 1, 0, 0]) { buf.writeUInt32LE(v, o); o += 4; }
  }
  fs.writeFileSync(path.join(outDir, name), buf);
  return { peak, rms: Math.sqrt(sum / data.length) };
}

// Redline per car from ASTRA §6 (the Unity gearbox uses it: VehicleDefinition.gearbox); idle stays legacy.
const ASTRA_REDLINE: Record<string, number> = {
  touge: 7000, pip: 6500, truck: 6000, offroad: 5500, torrent: 7500, ribbon: 7200, meridian: 6800, morrow: 6500, gt: 8500, needle: 10500,
};

const rows: string[] = [];
for (const [legacy, id] of Object.entries(CARS)) {
  const g = { ...GEARBOX[legacy as keyof typeof GEARBOX], redline: ASTRA_REDLINE[legacy]! };
  const voice = ENGINE_VOICES[legacy as keyof typeof ENGINE_VOICES];
  const base = { idle: g.idle, redline: g.redline, on: 1, starter: 0, cabin: 0, drive: 0, speed: 0 };
  const take = (tag: string, rpm: number, load: number, throttle: number, seconds: number) => {
    const mixer = new VehicleMixer(SR);
    mixer.setProfile(voice);
    const s = render(mixer, { ...base, rpm, load, throttle }, 1.5, seconds);
    const m = writeWav(`SFX_STANDIN_Engine_${id}_${tag}.wav`, loop(s, 1.5, seconds), true);
    rows.push(`${id} ${tag} rpm ${Math.round(rpm)} peak ${m.peak.toFixed(2)} rms ${m.rms.toFixed(3)}`);
  };
  take('idle', g.idle, 0.05, 0, 1.0);
  STEPS.forEach((f, i) => {
    take(`on${i}`, g.redline * f, 1, 1, 0.8);
    take(`off${i}`, g.redline * f, 0, 0, 1.0);
  });
  // Lift-off at high revs: blow-off / overrun crackle once (Ribbon "audible boost release", ASTRA §6).
  const mixer = new VehicleMixer(SR);
  mixer.setProfile(voice);
  const full = { ...base, rpm: g.redline * 0.8, load: 1, throttle: 1 };
  render(mixer, full, 1.2, 0);
  const s = render(mixer, { ...full, load: 0, throttle: 0, rpm: g.redline * 0.7 }, 0, 0.9);
  writeWav(`SFX_STANDIN_Lift_${id}.wav`, oneShot(s, 0, 0.9), false);
}

// World layer without engine: the mixer's own tyre, surface and wind models.
const world = (name: string, p: Params, seconds = 1.6) => {
  const mixer = new VehicleMixer(SR);
  mixer.setProfile(null);
  const s = render(mixer, { on: 0, drive: 1, rpm: 800, idle: 800, redline: 7000, ...p }, 1.0, seconds);
  const m = writeWav(`SFX_STANDIN_${name}.wav`, loop(s, 1.0, seconds), true);
  rows.push(`${name} peak ${m.peak.toFixed(2)} rms ${m.rms.toFixed(3)}`);
};
world('Roll_Asphalt', { speed: 16, surface: 0 });
world('Roll_Gravel', { speed: 16, surface: 1 });
world('Roll_Grass', { speed: 16, surface: 2 });
world('Roll_Water', { speed: 12, surface: 3, water: 0.4 });
world('Skid_Asphalt', { speed: 14, surface: 0, skid: 1, slip: 0.6 });
world('Wind', { speed: 45, surface: 0, airborne: 1 });

fs.writeFileSync(path.join(outDir, 'render-report.txt'), rows.join('\n') + '\n');
console.log(rows.join('\n'));
console.log(`WAV → ${outDir}`);
