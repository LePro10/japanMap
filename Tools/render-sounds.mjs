#!/usr/bin/env node
// Renders the game's stand-in sounds from a physically shaped synthesizer — no dependencies, deterministic.
//   node Tools/render-sounds.mjs [outDir=Assets/_Project/Art/Audio/StandIn] [--only engine|world|fx]
// Replaces the legacy render (Tools/legacy-export/render-audio.mts; owner 2026-10-17: "hört sich wie AI-Slop an,
// nervig"). What made it artificial: tonal turbo/valve whines at 3–6 kHz, a pure-sine skid squeal, fizzy top end.
// Here an engine is what it physically is — combustion pulses per cylinder (with cycle-to-cycle variation) into an
// exhaust pipe (a delay line with a lossy reflection), a muffler (low-pass) and a little saturation; tyres are
// filtered noise with tread and grain; impacts are thumps with a few inharmonic metal modes. Dark rather than bright:
// a loop heard for minutes must not hiss.
// File names stay those of the stand-ins (SFX_STANDIN_*), so the banks (JapanMap/Audio/Build Banks) keep working.
// Engine loops: idle 1.0 s, on/off at 30/50/70/92 % of the redline (0.8 / 1.0 s), Lift 0.9 s — like before.
import fs from 'node:fs';
import path from 'node:path';

const SR = 32000;
const PAD = 1024; // silence before a loop: the web's AAC encoder alters the first 1024 samples (Unity manual)
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'Assets/_Project/Art/Audio/StandIn');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
fs.mkdirSync(outDir, { recursive: true });

// ── small DSP kit ──────────────────────────────────────────────────────────────────────────────────────────────
let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rnd() * 2 - 1;
const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) * 1.7; };

class Biquad {
  constructor(type, f, q = 0.707, gainDb = 0) { this.z1 = 0; this.z2 = 0; this.set(type, f, q, gainDb); }
  set(type, f, q = 0.707, gainDb = 0) {
    const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q), A = 10 ** (gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else if (type === 'bp') { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
    else if (type === 'peak') { b0 = 1 + a * A; b1 = -2 * c; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * c; a2 = 1 - a / A; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  // Transposed direct form II: stable under per-sample coefficient changes.
  run(x) { const y = this.b0 * x + this.z1; this.z1 = this.b1 * x - this.a1 * y + this.z2; this.z2 = this.b2 * x - this.a2 * y; return y; }
}
class OnePole { constructor(f) { this.y = 0; this.set(f); } set(f) { this.k = 1 - Math.exp(-2 * Math.PI * f / SR); } run(x) { return this.y += (x - this.y) * this.k; } }
class Delay {
  constructor(n) { this.b = new Float32Array(Math.max(2, n)); this.i = 0; }
  read() { return this.b[this.i]; }
  write(x) { this.b[this.i] = x; this.i = (this.i + 1) % this.b.length; }
}

// ── engines ────────────────────────────────────────────────────────────────────────────────────────────────────
const even = (n) => Array.from({ length: n }, (_, i) => i / n);
const alt = (n) => Array.from({ length: n }, (_, i) => i % 2);
// Character per car: cylinders and firing (fraction of the 720° cycle), which bank each firing goes to, pipe lengths
// (m), muffler cut-off off/on load (Hz), body boom (Hz), intake band (Hz), rasp (saturation), lope (cycle variation),
// crackle on overrun, turbo hiss (no whistle), level.
const CARS = {
  hachi:   { fire: even(4), bank: [0, 0, 0, 0], pipe: [2.4, 2.4], muff: [700, 2600], boom: 95, intake: 420, rasp: 1.5, lope: 0.05, var: 0.05, crackle: 0.3, turbo: 0, gain: 1.0 },
  mame:    { fire: even(3), bank: [0, 0, 0], pipe: [1.9, 1.9], muff: [650, 2300], boom: 110, intake: 520, rasp: 1.2, lope: 0.07, var: 0.06, crackle: 0.12, turbo: 0.5, gain: 0.95 },
  hauler:  { fire: even(3), bank: [0, 0, 0], pipe: [3.2, 3.2], muff: [420, 1500], boom: 70, intake: 300, rasp: 1.1, lope: 0.1, var: 0.08, crackle: 0.03, turbo: 0, gain: 1.0 },
  yama:    { fire: even(4), bank: [0, 0, 0, 0], pipe: [2.9, 2.9], muff: [520, 1900], boom: 80, intake: 360, rasp: 1.4, lope: 0.07, var: 0.07, crackle: 0.12, turbo: 0.4, gain: 1.0 },
  kumo:    { fire: [0, 0.25, 0.5, 0.75], bank: [0, 1, 0, 1], pipe: [2.2, 2.75], muff: [800, 3000], boom: 90, intake: 460, rasp: 1.9, lope: 0.1, var: 0.06, crackle: 0.7, turbo: 0.55, gain: 1.0 },
  kaze:    { fire: even(6), bank: alt(6).map(() => 0), pipe: [2.7, 2.7], muff: [800, 3200], boom: 85, intake: 480, rasp: 1.4, lope: 0.04, var: 0.04, crackle: 0.35, turbo: 0.4, gain: 0.95 },
  raiden:  { fire: even(6), bank: alt(6), pipe: [3.0, 3.1], muff: [520, 2100], boom: 75, intake: 380, rasp: 1.1, lope: 0.03, var: 0.04, crackle: 0.15, turbo: 0.3, gain: 0.95 },
  // Cross-plane V8: each bank fires unevenly (L R L L R R R L) — the burble.
  suprema: { fire: even(8), bank: [0, 1, 0, 0, 1, 1, 1, 0], pipe: [2.8, 2.95], muff: [480, 2000], boom: 65, intake: 280, rasp: 1.7, lope: 0.18, var: 0.06, crackle: 0.45, turbo: 0, gain: 1.05 },
  rotor:   { fire: even(6), bank: alt(6), pipe: [1.8, 1.85], muff: [1000, 4000], boom: 100, intake: 560, rasp: 1.8, lope: 0.06, var: 0.04, crackle: 0.5, turbo: 0, gain: 0.95 },
  hanami:  { fire: even(6), bank: alt(6), pipe: [1.2, 1.25], muff: [1300, 4800], boom: 120, intake: 700, rasp: 2.0, lope: 0.08, var: 0.03, crackle: 0.55, turbo: 0, gain: 0.9 },
};
// Idle / redline as the game's gearbox has them (VehicleDefinition.gearbox) — the bank pitches by rpm / recorded rpm.
const REV = {
  hachi: [850, 7000], mame: [900, 6500], hauler: [720, 6000], yama: [750, 5500], kumo: [950, 7500],
  kaze: [850, 7200], raiden: [700, 6800], suprema: [650, 6500], rotor: [1000, 8500], hanami: [1500, 10500],
};
const STEPS = [0.3, 0.5, 0.7, 0.92];

/** One engine voice; render(rpm, load, seconds) → samples. rpm and load may be functions of time (lift-off). */
function engine(v, redline) {
  const banks = v.pipe.map((len) => ({
    pipe: new Delay(Math.round(2 * len / 343 * SR)),
    loss: new OnePole(2400),
    pulses: [],
  }));
  const muff = new Biquad('lp', 1000, 0.8);
  const muff2 = new Biquad('lp', 1000, 0.6);
  const dc = new Biquad('hp', 28, 0.7);
  const boom = new Biquad('bp', v.boom, 1.6);
  const intakeBp = new Biquad('bp', v.intake, 2.2);
  const intakeEnv = new OnePole(60);
  const hissBp = new Biquad('bp', 3000, 0.9);
  const crackLp = new Biquad('lp', 2200, 0.7);
  let phase = 0, cycleLope = 0, popLeft = 0, popAmp = 0;
  return (rpmAt, loadAt, seconds) => {
    const n = Math.round(seconds * SR);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const rpm = typeof rpmAt === 'function' ? rpmAt(t) : rpmAt;
      const load = typeof loadAt === 'function' ? loadAt(t) : loadAt;
      const frac = rpm / redline;
      const prev = phase;
      phase += rpm / 120 / SR; // a 4-stroke cycle is two turns
      if (phase >= 1) { phase -= 1; cycleLope = gauss() * v.lope; }
      // Firings crossed in this sample.
      for (let k = 0; k < v.fire.length; k++) {
        const o = v.fire[k];
        const wrapped = phase < prev;
        if (!(wrapped ? o >= prev || o < phase : prev <= o && o < phase)) continue;
        const a = (0.22 + 0.78 * load) * (1 + v.var * gauss() + cycleLope);
        const width = (0.0005 - 0.00026 * load) * (1.2 - 0.4 * Math.min(1, frac)); // sharper on load and high revs
        banks[v.bank[k]].pulses.push({ t: 0, a, w: width, n: 0.35 + 0.45 * load });
        // Overrun: unburnt fuel pops in the hot pipe now and then.
        if (load < 0.2 && frac > 0.45 && rnd() < v.crackle * 0.05 * frac) { popLeft = Math.round(SR * (0.003 + rnd() * 0.004)); popAmp = 0.8 + rnd(); }
      }
      let sum = 0, env = 0;
      for (const b of banks) {
        let x = 0;
        for (let p = b.pulses.length - 1; p >= 0; p--) {
          const P = b.pulses[p];
          const u = P.t / P.w;
          // Gamma-shaped pressure pulse plus a little turbulence riding on it.
          x += P.a * (u * Math.exp(1 - u) + P.n * noise() * Math.exp(-u * 0.6));
          P.t += 1 / SR;
          if (P.t > P.w * 12) b.pulses.splice(p, 1);
        }
        env += Math.abs(x);
        // Pipe: the pulse travels to the open end and back inverted, losing highs (the pipe's resonance).
        const back = b.loss.run(b.pipe.read());
        const y = x - 0.55 * back;
        b.pipe.write(y);
        sum += y;
      }
      if (popLeft > 0) { sum += popAmp * crackLp.run(noise()) * 1.4; popLeft--; }
      // Muffler: darker off load and at low revs; the cut-off rises with load and revs.
      const fc = (v.muff[0] + (v.muff[1] - v.muff[0]) * load) * (0.7 + 0.6 * Math.min(1, frac));
      if (i % 16 === 0) { muff.set('lp', fc, 0.8); muff2.set('lp', fc * 1.4, 0.6); }
      let y = muff2.run(muff.run(sum));
      y += 0.35 * boom.run(y);
      // Saturation: rasp under load.
      const drive = 1 + v.rasp * (0.4 + 0.6 * load);
      y = Math.tanh(y * drive * 0.9) / Math.tanh(drive * 0.9);
      // Intake roar: band noise breathing with the firing.
      const ie = intakeEnv.run(env);
      y += intakeBp.run(noise()) * ie * 0.18 * load * (0.5 + frac);
      // Turbo: a soft rush of air with boost — no whistle.
      if (v.turbo > 0) y += hissBp.run(noise()) * v.turbo * 0.05 * load * frac * frac;
      out[i] = dc.run(y);
    }
    return out;
  };
}

function rms(s, from = 0, to = s.length) { let q = 0; for (let i = from; i < to; i++) q += s[i] * s[i]; return Math.sqrt(q / Math.max(1, to - from)); }

// Seamless loop of `seconds` taken after `warm`; the last 60 ms crossfade (equal power) into what came before the start.
function loop(s, warm, seconds) {
  const a = Math.round(warm * SR), n = Math.round(seconds * SR), x = Math.round(0.06 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < n - x) { out[i] = s[a + i]; continue; }
    const w = (i - (n - x)) / x;
    out[i] = s[a + i] * Math.cos(w * Math.PI / 2) + s[a - x + (i - (n - x))] * Math.sin(w * Math.PI / 2);
  }
  return out;
}

function writeWav(name, data, looped) {
  const body = looped ? PAD + data.length : data.length;
  const smpl = looped ? 68 : 0;
  const buf = Buffer.alloc(44 + body * 2 + smpl);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + body * 2 + smpl, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(body * 2, 40);
  let peak = 0;
  const start = looped ? PAD : 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    peak = Math.max(peak, Math.abs(v));
    buf.writeInt16LE(Math.round(v * 32767), 44 + (start + i) * 2);
  }
  if (looped) {
    let o = 44 + body * 2;
    buf.write('smpl', o); buf.writeUInt32LE(60, o + 4); o += 8;
    for (const v of [0, 0, Math.round(1e9 / SR), 60, 0, 0, 0, 1, 0]) { buf.writeUInt32LE(v, o); o += 4; }
    for (const v of [0, 0, PAD, PAD + data.length - 1, 0, 0]) { buf.writeUInt32LE(v, o); o += 4; }
  }
  fs.writeFileSync(path.join(outDir, `SFX_STANDIN_${name}.wav`), buf);
  rows.push(`${name.padEnd(26)} peak ${peak.toFixed(2)} rms ${rms(data).toFixed(3)}`);
}

const scale = (s, k) => { for (let i = 0; i < s.length; i++) s[i] *= k; return s; };
const fadeOut = (s, sec = 0.03) => { const f = Math.round(sec * SR); for (let i = 0; i < f; i++) s[s.length - 1 - i] *= i / f; return s; };
const rows = [];

if (!only || only === 'engine') {
  for (const [id, v] of Object.entries(CARS)) {
    seed = id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const [idle, redline] = REV[id];
    // One level for the whole car, from its loudest loop (92 % on load): relative levels stay physical.
    const ref = engine(v, redline)(redline * 0.92, 1, 1.4);
    const k = 0.24 * v.gain / Math.max(1e-4, rms(ref, Math.round(0.5 * SR)));
    const take = (tag, rpm, load, seconds) => {
      const s = engine(v, redline)(rpm, load, 1.5 + seconds + 0.1);
      writeWav(`Engine_${id}_${tag}`, scale(loop(s, 1.5, seconds), k), true);
    };
    take('idle', idle, 0.08, 1.0);
    STEPS.forEach((f, i) => { take(`on${i}`, redline * f, 1, 0.8); take(`off${i}`, redline * f, 0, 1.0); });
    // Lift-off: revs falling from 80 % with the throttle shut — the pops on overrun.
    const lift = engine(v, redline)((t) => redline * (0.8 - 0.22 * Math.min(1, t / 0.9)), (t) => Math.max(0, 1 - t / 0.05), 0.9);
    writeWav(`Lift_${id}`, fadeOut(scale(lift, k * 0.9), 0.15), false);
  }
}

// ── tyres, wind ────────────────────────────────────────────────────────────────────────────────────────────────
function bed(seconds, fn, warm = 0.5) {
  const n = Math.round((warm + seconds + 0.1) * SR);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = fn(i / SR);
  return loop(s, warm, seconds);
}
const norm = (s, target) => scale(s, target / Math.max(1e-5, rms(s)));

if (!only || only === 'world') {
  seed = 11;
  // Asphalt: a low roar with the tread's flutter, no hiss.
  { const lp = new Biquad('lp', 380, 0.7), lp2 = new Biquad('lp', 520, 0.6), bp = new Biquad('bp', 900, 1.5), m = new OnePole(3);
    writeWav('Roll_Asphalt', norm(bed(1.6, (t) => { const f = 1 + 0.25 * m.run(noise() * 6); return lp2.run(lp.run(noise())) * f + 0.15 * bp.run(noise()); }), 0.12), true); }
  // Gravel: grains — stones popping under the tyre — over a rumble.
  { const lp = new Biquad('lp', 300, 0.7), g1 = new Biquad('bp', 2300, 1.2), g2 = new Biquad('bp', 1100, 1.4); let left = 0, amp = 0;
    writeWav('Roll_Gravel', norm(bed(1.6, () => { if (left <= 0 && rnd() < 380 / SR) { left = Math.round(SR * (0.001 + rnd() * 0.003)); amp = 0.4 + rnd(); } const grain = left-- > 0 ? noise() * amp : 0; return 0.6 * lp.run(noise()) + g1.run(grain) * 1.6 + g2.run(grain) * 1.2; }), 0.12), true); }
  // Grass: a soft swish with a little thump of the ground.
  { const bp = new Biquad('bp', 1400, 0.8), lp = new Biquad('lp', 160, 0.7), m = new OnePole(5);
    writeWav('Roll_Grass', norm(bed(1.6, () => { const f = 0.6 + 0.4 * Math.abs(m.run(noise() * 4)); return bp.run(noise()) * f * 0.6 + lp.run(noise()) * 1.2; }), 0.1), true); }
  // Water: a churning wash with bubbles.
  { const lp = new Biquad('lp', 900, 0.7), bp = new Biquad('bp', 600, 4); let f0 = 600;
    writeWav('Roll_Water', norm(bed(1.6, (t) => { if (rnd() < 30 / SR) f0 = 300 + rnd() * 900; bp.set('bp', f0 * (1 + 0.3 * Math.sin(t * 40)), 4); return lp.run(noise()) * 0.7 + bp.run(noise()) * 0.8; }), 0.1), true); }
  // Skid: rubber squeal is a band of noise that wanders — not a sine. Two bands, slow drift, plus the scrub.
  { const s1 = new Biquad('bp', 950, 18), s2 = new Biquad('bp', 1420, 22), scrub = new Biquad('lp', 1600, 0.7), d1 = new OnePole(0.8), d2 = new OnePole(1.1), am = new OnePole(6);
    writeWav('Skid_Asphalt', norm(bed(1.6, (t) => {
      if ((t * SR | 0) % 32 === 0) { s1.set('bp', 950 * (1 + 0.05 * d1.run(noise() * 3)), 18); s2.set('bp', 1420 * (1 + 0.05 * d2.run(noise() * 3)), 22); }
      const a = 0.75 + 0.25 * am.run(noise() * 3);
      return (s1.run(noise()) * 1.1 + s2.run(noise()) * 0.55) * a + scrub.run(noise()) * 0.35;
    }), 0.11), true); }
  // Wind: low rush with slow gusts.
  { const lp = new Biquad('lp', 420, 0.6), lp2 = new Biquad('lp', 700, 0.5), g = new OnePole(0.35);
    writeWav('Wind', norm(bed(2.0, () => lp2.run(lp.run(noise())) * (0.7 + 0.3 * Math.abs(g.run(noise() * 5)))), 0.1), true); }
}

// ── one-shots ──────────────────────────────────────────────────────────────────────────────────────────────────
function shot(seconds, fn) { const n = Math.round(seconds * SR); const s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = fn(i / SR); return fadeOut(s, 0.02); }
const peakTo = (s, p) => { let m = 0; for (const x of s) m = Math.max(m, Math.abs(x)); return scale(s, p / Math.max(1e-5, m)); };
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
/** Inharmonic metal modes (a car panel, a lamp post): frequencies, decay s, levels. */
const modes = (list) => { const ph = list.map(() => rnd() * 6.28); return (t) => list.reduce((s, [f, d, l], i) => s + l * Math.sin(2 * Math.PI * f * t + ph[i]) * Math.exp(-t / d), 0); };

if (!only || only === 'fx') {
  seed = 23;
  // Whoosh: a band of air sweeping up / down (nitro on).
  for (const [name, up] of [['Whoosh_Up', true], ['Whoosh_Down', false]]) {
    const bp = new Biquad('bp', 400, 1.2);
    writeWav(name, peakTo(shot(0.7, (t) => { const x = t / 0.7; if ((t * SR | 0) % 16 === 0) bp.set('bp', up ? 300 + 1500 * x * x : 1800 - 1500 * x, 1.2); return bp.run(noise()) * Math.sin(Math.PI * Math.min(1, x * 1.15)); }), 0.5), false);
  }
  // Nitro burst: a deep whump, the rush of the jet and a couple of pops.
  { const bp = new Biquad('bp', 200, 0.9), crack = new Biquad('lp', 2500, 0.7); const pops = [0.05, 0.11, 0.2];
    writeWav('Boost_Burst', peakTo(shot(1.3, (t) => {
      const whump = Math.sin(2 * Math.PI * (52 - 18 * Math.min(1, t / 0.4)) * t) * env(t, 0.008, 0.18);
      if ((t * SR | 0) % 16 === 0) bp.set('bp', 180 + 1400 * Math.min(1, t / 0.5), 0.9);
      const rush = bp.run(noise()) * env(t, 0.03, 0.45) * 0.9;
      const pop = pops.some((p) => t > p && t < p + 0.006) ? crack.run(noise()) * 1.4 : crack.run(0);
      return whump * 1.2 + rush + pop;
    }), 0.85), false); }
  // Landing: suspension thud and a short rattle.
  { const lp = new Biquad('lp', 180, 0.8), r = new Biquad('bp', 1800, 2);
    writeWav('Land_Thump', peakTo(shot(0.6, (t) => Math.sin(2 * Math.PI * 58 * t) * env(t, 0.004, 0.09) + lp.run(noise()) * env(t, 0.002, 0.06) * 1.5 + r.run(noise()) * env(t, 0.01, 0.05) * 0.25), 0.8), false); }
  // Car impacts: body thud + panel modes + crunch; harder = more crunch and lower.
  for (const [name, f, crunchLvl, len] of [['Impact_Car_Soft', 90, 0.3, 0.4], ['Impact_Car_Mid', 75, 0.7, 0.6], ['Impact_Car_Hard', 60, 1.2, 0.9]]) {
    const cr = new Biquad('bp', 1600, 0.8), lp = new Biquad('lp', 260, 0.8);
    const m = modes([[310, 0.12, 0.25], [740, 0.08, 0.18], [1330, 0.05, 0.12], [2210, 0.03, 0.08]]);
    writeWav(name, peakTo(shot(len, (t) => Math.sin(2 * Math.PI * f * t) * env(t, 0.003, 0.08) + lp.run(noise()) * env(t, 0.002, 0.05) + m(t) * 0.8 + cr.run(noise()) * crunchLvl * env(t, 0.004, 0.12 * crunchLvl)), 0.85), false);
  }
  // Breaks by material.
  { const hp = new Biquad('hp', 1500, 0.7), lp = new Biquad('lp', 200, 0.8), leaves = new Biquad('hp', 2500, 0.7); let left = 0, amp = 0;
    writeWav('Break_Tree', peakTo(shot(1.4, (t) => {
      if (left <= 0 && rnd() < (t < 0.4 ? 220 : 40) / SR) { left = Math.round(SR * 0.002); amp = rnd(); }
      const splinter = left-- > 0 ? noise() * amp : 0;
      return hp.run(noise()) * env(t, 0.001, 0.025) * 1.5 + lp.run(noise()) * env(t, 0.005, 0.25) * 2 + splinter * 0.9 + leaves.run(noise()) * env(t, 0.1, 0.5) * 0.25;
    }), 0.85), false); }
  { const hp = new Biquad('hp', 1200, 0.7), lp = new Biquad('lp', 300, 0.8); let left = 0, amp = 0;
    writeWav('Break_Wood', peakTo(shot(0.7, (t) => { if (left <= 0 && rnd() < 300 / SR * Math.exp(-t * 4)) { left = Math.round(SR * 0.0015); amp = rnd(); } const s = left-- > 0 ? noise() * amp : 0; return hp.run(noise()) * env(t, 0.001, 0.02) * 1.3 + lp.run(noise()) * env(t, 0.003, 0.08) * 1.5 + s; }), 0.8), false); }
  { const lp = new Biquad('lp', 240, 0.8); const m = modes([[180, 0.35, 0.4], [497, 0.3, 0.35], [971, 0.22, 0.25], [1608, 0.15, 0.15], [2403, 0.1, 0.1]]);
    writeWav('Break_Rail', peakTo(shot(1.1, (t) => m(t) + lp.run(noise()) * env(t, 0.002, 0.06) * 1.5), 0.8), false); }
  { const bp = new Biquad('bp', 700, 2), lp = new Biquad('lp', 400, 0.8);
    writeWav('Break_Cone', peakTo(shot(0.45, (t) => bp.run(noise()) * env(t, 0.002, 0.05) * 2 + lp.run(noise()) * env(t, 0.002, 0.04) + Math.sin(2 * Math.PI * 240 * t) * env(t, 0.002, 0.04) * 0.4), 0.7), false); }
  { const m = modes([[95, 0.3, 0.5], [233, 0.25, 0.4], [611, 0.15, 0.25]]), lp = new Biquad('lp', 220, 0.8), glass = new Biquad('hp', 4000, 0.7); let left = 0;
    writeWav('Break_Barrel', peakTo(shot(1.0, (t) => { if (left <= 0 && t > 0.05 && rnd() < 60 / SR * Math.exp(-t * 3)) left = Math.round(SR * 0.004); const tink = left-- > 0 ? glass.run(noise()) : glass.run(0); return m(t) + lp.run(noise()) * env(t, 0.003, 0.08) * 1.6 + tink * 0.6; }), 0.8), false); }
}

fs.writeFileSync(path.join(outDir, 'render-report.txt'), rows.join('\n') + '\n');
console.log(rows.join('\n'));
console.log(`WAV → ${outDir}`);
