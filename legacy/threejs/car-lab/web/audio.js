// Motorklang als Synthese: Zündfrequenz = Drehzahl/60 · Zylinder/2.
// Kein Sample, damit jede Drehzahl stimmt und die Datei klein bleibt.
// Braucht eine echte Nutzergeste (Browser-Regel) — start() hängt am ersten Klick.
const PROFILES = {
  kei:       { cyl: 3, wave: 'sawtooth', cut: 1800, q: 4, sub: 0.3, rough: 0.25 },
  i4_na:     { cyl: 4, wave: 'sawtooth', cut: 2600, q: 5, sub: 0.35, rough: 0.2 },
  i6_turbo:  { cyl: 6, wave: 'sawtooth', cut: 2400, q: 3, sub: 0.45, rough: 0.1, whistle: true },
  v6_turbo:  { cyl: 6, wave: 'square', cut: 1900, q: 4, sub: 0.5, rough: 0.3, whistle: true },
  rotary:    { cyl: 4, wave: 'sawtooth', cut: 3600, q: 6, sub: 0.2, rough: 0.35 },
  boxer:     { cyl: 4, wave: 'square', cut: 1400, q: 3, sub: 0.6, rough: 0.6, whistle: true },
  v6_diesel: { cyl: 6, wave: 'square', cut: 900, q: 2, sub: 0.7, rough: 0.5, whistle: true },
  f1:        { cyl: 6, wave: 'sawtooth', cut: 5200, q: 7, sub: 0.25, rough: 0.05 },
};

export class EngineSound {
  constructor() { this.ctx = null; this.on = false; this.vol = 0.5; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass';
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.2); }
    this.shaper.curve = curve;
    this.o1 = ctx.createOscillator(); this.o2 = ctx.createOscillator(); this.o3 = ctx.createOscillator();
    this.g1 = ctx.createGain(); this.g2 = ctx.createGain(); this.g3 = ctx.createGain();
    this.o1.connect(this.g1); this.o2.connect(this.g2); this.o3.connect(this.g3);
    [this.g1, this.g2, this.g3].forEach(g => g.connect(this.shaper));
    this.shaper.connect(this.filter); this.filter.connect(this.master);
    // Rauigkeit: Amplitudenmodulation mit halber Zündfrequenz (Blubbern)
    this.lfo = ctx.createOscillator(); this.lfoG = ctx.createGain(); this.lfo.connect(this.lfoG); this.lfoG.connect(this.g1.gain);
    // Turbopfeifen
    this.wh = ctx.createOscillator(); this.wh.type = 'sine'; this.whG = ctx.createGain(); this.whG.gain.value = 0;
    this.wh.connect(this.whG); this.whG.connect(this.master);
    [this.o1, this.o2, this.o3, this.lfo, this.wh].forEach(o => o.start());
    this.on = true;
  }
  setProfile(name) { this.p = PROFILES[name] || PROFILES.i4_na; if (this.ctx) this.#apply(); }
  #apply() {
    const p = this.p;
    this.o1.type = p.wave; this.o2.type = 'sawtooth'; this.o3.type = 'sine';
    this.filter.Q.value = p.q;
    this.g2.gain.value = 0.25; this.g3.gain.value = p.sub;
  }
  update(rpm, throttle, redline, muted) {
    if (!this.ctx || !this.p) return;
    if (!this._applied) { this.#apply(); this._applied = true; }
    const p = this.p, t = this.ctx.currentTime;
    const fire = Math.max(8, rpm / 60 * p.cyl / 2);
    const safe = (v) => (Number.isFinite(v) ? v : 0);   // eine NaN am AudioParam wirft (CLAUDE.md P25)
    this.o1.frequency.setTargetAtTime(safe(fire), t, 0.03);
    this.o2.frequency.setTargetAtTime(safe(fire * 2.01), t, 0.03);
    this.o3.frequency.setTargetAtTime(safe(fire / 2), t, 0.03);
    this.lfo.frequency.setTargetAtTime(safe(fire / 4), t, 0.05);
    this.lfoG.gain.value = p.rough * 0.4;
    this.g1.gain.setTargetAtTime(0.55, t, 0.05);
    this.filter.frequency.setTargetAtTime(safe(p.cut * (0.35 + 0.65 * throttle) * (0.6 + rpm / redline)), t, 0.05);
    const load = 0.35 + 0.65 * throttle;
    this.master.gain.setTargetAtTime(muted ? 0 : this.vol * 0.22 * load, t, 0.08);
    this.wh.frequency.setTargetAtTime(safe(2400 + rpm * 0.6), t, 0.1);
    this.whG.gain.setTargetAtTime(muted || !p.whistle ? 0 : 0.012 * throttle * Math.min(1, rpm / redline * 1.5), t, 0.2);
  }
}
