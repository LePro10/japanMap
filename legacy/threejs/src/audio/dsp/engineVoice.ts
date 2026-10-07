import { Comb, OnePole, Pink, Rng, Svf, Waveguide, clamp01, smoothstep, soft } from './primitives';

/**
 * Wie ein Motor klingt — reine Daten, eine Zeile je Fahrzeug in
 * `audio.config.ts` (`ENGINE_VOICES`).
 *
 * Die Felder sind **Bauteile**, keine Klangregler: Zylinderzahl, Zündabstand,
 * Krümmerlängen, Endrohrlänge, Schalldämpferkammern. Der Charakter entsteht
 * daraus, so wie beim echten Auto — ein V8 mit Kreuzebenen-Kurbelwelle
 * blubbert, weil jede Zylinderbank ihre Pulse **ungleichmäßig** bekommt
 * (L R L L R R R L), nicht weil jemand „Blubbern" auf 0,7 gestellt hat.
 */
export interface EngineVoiceProfile {
  /** Zündzeitpunkt je Zylinder als Anteil des Arbeitsspiels (720°). */
  readonly firing: readonly number[];
  /** Zylinderbank je Zylinder, 0 oder 1. Reihenmotoren: alles 0. */
  readonly bank: readonly number[];
  /** Krümmerrohrlänge je Zylinder, m. Ungleich lang = rauer, gleich lang = glatter. */
  readonly runner: readonly number[];
  /** Endrohrlänge je Bank, m. */
  readonly pipe: readonly [number, number];
  /** Reflexion am offenen Rohrende, −1…0. Näher an −1 = resonanter, „hohler". */
  readonly pipeReflect: number;
  /** Reflexion am Krümmer (Sammler), 0…1. */
  readonly runnerReflect: number;
  /** Dauer eines Auslasspulses: Anteil des Arbeitsspiels und Grenzen in ms. */
  readonly pulse: number;
  readonly pulseMs: readonly [number, number];
  /** Rauschanteil im Puls — Strömung, nicht Verbrennung. */
  readonly turbulence: number;
  /** Streuung der Verbrennung von Takt zu Takt (σ). */
  readonly variability: number;
  /** Zusätzliche Streuung im Leerlauf — der „unruhige" Leerlauf scharfer Nockenwellen. */
  readonly lope: number;
  /** Kammern des Schalldämpfers in ms, Rückführung, Nassanteil. */
  readonly muffler: readonly number[];
  readonly mufflerFeedback: number;
  readonly mufflerMix: number;
  /** Tiefpass am Endrohr ohne Last und unter Vollgas, Hz. */
  readonly tone: readonly [number, number];
  /** Sättigung des Abgaspfads — Rauheit unter Last. */
  readonly rasp: number;
  /** Ansaugung: Helmholtz-Resonanz der Airbox in Hz, Güte, Pegel, Ansaugrauschen. */
  readonly intakeHz: number;
  readonly intakeQ: number;
  readonly intake: number;
  readonly induction: number;
  /** Ventiltrieb: Pegel und Mitte des Tickens. */
  readonly mech: number;
  readonly valveHz: number;
  /** Stirnradgetriebe-Heulen: Pegel und Verhältnis zur Kurbelwellenfrequenz. */
  readonly whine: number;
  readonly whineRatio: number;
  /** Turbolader: Pegel des Pfeifens (0 = Sauger), Pfeiffrequenz bei vollem Ladedruck. */
  readonly turbo: number;
  readonly turboHz: number;
  /** Schubumluft: 0 keines, 1 Abblasventil („pschh"), 2 Verdichterpumpen („stu-tu-tu"). */
  readonly bov: 0 | 1 | 2;
  /** Neigung zu Fehlzündungen im Schub, 0…1. */
  readonly crackle: number;
  /** Wie viel die Spritzwand den Auspuff in der Sitzkamera dämpft, 0…1. Mittelmotor: wenig. */
  readonly firewall: number;
  /** Gesamtpegel — auf gleiche Lautheit abgeglichen, siehe `tools/bench/audio.mts`. */
  readonly gain: number;
}

/** Was je Block hereinkommt. Alles geglättet im Worklet — der Hauptfaden sendet mit Bildrate. */
export interface EngineInput {
  rpm: number;
  load: number;
  throttle: number;
  idle: number;
  redline: number;
  /** 0…1 Motor an. */
  on: number;
  /** 0…1 Sitzkamera. */
  cabin: number;
  /** 0…1 Anlasser. */
  starter: number;
}

const C_EXHAUST = 520;
const C_AIR = 343;

/**
 * Ein Verbrennungsmotor als Signalmodell.
 *
 * Kette je Abtastwert:
 *
 *   Kurbelwinkel ─► je Zylinder ein Auslasspuls (Stärke = Last, Streuung je Takt)
 *                ─► Krümmerrohr (Wellenleiter) ─► Sammler je Bank
 *                ─► Endrohr (Wellenleiter) ─► Schalldämpferkammern ─► Tiefpass
 *                ─► weiche Sättigung ─► Stereo nach Bank
 *   dazu: Ansaugpulse durch die Airbox-Resonanz, Ventilticken, Getriebeheulen,
 *         Turbolader (Spulen, Pfeifen, Abblasen), Fehlzündungen im Schub.
 *
 * Warum so und nicht mit Aufnahmen, steht in `audio.config.ts`. Warum so und
 * nicht mit Oszillatoren: ein Sägezahn hat **eine** Wellenform, egal was der
 * Motor tut. Ein Pulszug durch Rohre ändert seine Klangfarbe von selbst mit
 * Drehzahl und Last — die Resonanzen der Rohre stehen fest, die Pulsfolge
 * wandert durch sie hindurch. Genau das hört man bei einem echten Auto beim
 * Hochdrehen: die Farbe „öffnet" sich an bestimmten Drehzahlen.
 */
export class EngineVoice {
  readonly #p: EngineVoiceProfile;
  readonly #sr: number;
  readonly #rng: Rng;
  readonly #pink: Pink;
  readonly #n: number;

  readonly #amp: Float32Array;
  readonly #lastQ: Float32Array;
  readonly #runners: Waveguide[];
  readonly #pipes: Waveguide[];
  readonly #combs: Comb[][];
  readonly #tone: OnePole[] = [new OnePole(), new OnePole()];
  readonly #dc: OnePole[] = [new OnePole(), new OnePole()];
  readonly #cabinLp: OnePole[] = [new OnePole(), new OnePole()];
  readonly #intakeGuide: Waveguide;
  readonly #intakeRes = new Svf();
  readonly #inductionRes = new Svf();
  readonly #valveRes = new Svf();
  readonly #turboHiss = new Svf();
  readonly #bovRes = new Svf();
  readonly #starterRes = new Svf();

  #phase = 0;
  #whinePhase = 0;
  #turboPhase = 0;
  #starterPhase = 0;
  #tick = 0;
  // Geglättete Eingänge (Blockanfang → Blockende linear).
  #rpm = 800;
  #fuel = 0.3;
  #thr = 0;
  #on = 0;
  #cabin = 0;
  #starter = 0;
  // Turbo und Schub.
  #spool = 0;
  #bovEnv = 0;
  #bovT = 0;
  #prevFuel = 0;
  #liftT = 10;
  #pop = 0;
  #popBank = 0;
  #bang = 0;

  constructor(profile: EngineVoiceProfile, sampleRate: number, seed = 1) {
    this.#p = profile;
    this.#sr = sampleRate;
    this.#rng = new Rng(0x51f15eed ^ seed);
    this.#pink = new Pink(this.#rng);
    const n = profile.firing.length;
    this.#n = n;
    this.#amp = new Float32Array(n);
    this.#lastQ = new Float32Array(n).fill(1);
    const sr = sampleRate;
    this.#runners = profile.runner.map(
      (len) => new Waveguide((len / C_EXHAUST) * sr, profile.runnerReflect, -0.35, 5200, sr),
    );
    this.#pipes = profile.pipe.map(
      (len) => new Waveguide((len / C_EXHAUST) * sr, 0.25, profile.pipeReflect, 3400, sr),
    );
    this.#combs = [0, 1].map((b) =>
      profile.muffler.map(
        (ms, k) =>
          new Comb(((ms * (1 + b * 0.071)) / 1000) * sr, profile.mufflerFeedback * (k % 2 ? -1 : 1), 0.45),
      ),
    );
    this.#intakeGuide = new Waveguide((0.42 / C_AIR) * sr, 0.6, -0.8, 2600, sr);
  }

  /** Knall beim Hochschalten unter Last (Zündunterbrechung im heißen Krümmer). */
  bang(strength: number): void {
    this.#bang = Math.max(this.#bang, clamp01(strength));
  }

  /**
   * Einen Block rendern und **addieren** (nicht überschreiben) — der Mischer
   * legt Motor, Reifen und Wind in denselben Puffer.
   */
  render(outL: Float32Array, outR: Float32Array, frames: number, input: EngineInput): void {
    const p = this.#p;
    const sr = this.#sr;
    const dtBlock = frames / sr;
    const k = (tau: number): number => 1 - Math.exp(-dtBlock / tau);

    // ── Zielwerte dieses Blocks ─────────────────────────────────────────
    const rpmT = Math.max(0, Number.isFinite(input.rpm) ? input.rpm : 0);
    const idle = Math.max(300, input.idle);
    const red = Math.max(idle + 500, input.redline);
    // Ein Motor im Leerlauf verbrennt, auch ohne Gas — sonst klingt Stand wie
    // Schub. Über ~1,8 × Leerlauf ohne Gas ist es echter Schub: kein Sprit.
    const idleFuel = 0.5 * (1 - smoothstep(idle * 1.15, idle * 1.9, rpmT));
    const fuelT = Math.max(clamp01(input.load), idleFuel);

    const rpm0 = this.#rpm;
    const fuel0 = this.#fuel;
    const on0 = this.#on;
    this.#rpm += (rpmT - this.#rpm) * k(0.018);
    this.#fuel += (fuelT - this.#fuel) * k(0.03);
    this.#thr += (clamp01(input.throttle) - this.#thr) * k(0.05);
    this.#on += (clamp01(input.on) - this.#on) * k(0.08);
    this.#cabin += (clamp01(input.cabin) - this.#cabin) * k(0.12);
    this.#starter += (clamp01(input.starter) - this.#starter) * k(0.03);
    const rpm1 = this.#rpm;
    const fuel1 = this.#fuel;
    const on1 = this.#on;
    if (on0 < 1e-4 && on1 < 1e-4 && this.#starter < 1e-4) return;

    const rpmNorm = clamp01((rpm1 - idle) / (red - idle));
    const cycle = 120 / Math.max(60, rpm1);
    const wSec = Math.min(Math.max(p.pulse * cycle, p.pulseMs[0] / 1000), p.pulseMs[1] / 1000);
    const wq = wSec / cycle;

    // ── Schub: Gas weg, Drehzahl hoch → Fehlzündungsfenster ────────────
    if (fuel1 < 0.08 && this.#prevFuel >= 0.08) this.#liftT = 0;
    this.#liftT += dtBlock;
    const overrun = fuel1 < 0.1 && rpm1 > idle * 2.2;
    const popChance = overrun
      ? p.crackle * 0.05 * Math.exp(-this.#liftT / 1.2) * smoothstep(0.25, 0.7, rpmNorm)
      : 0;

    // ── Turbo ────────────────────────────────────────────────────────────
    if (p.turbo > 0) {
      const target = fuel1 > 0.45 ? smoothstep(0.15, 0.65, rpmNorm) * fuel1 : 0.04;
      const up = (0.5 + rpmNorm) / 0.9;
      this.#spool += (target - this.#spool) * Math.min(1, dtBlock * (target > this.#spool ? up : 3.2));
      if (p.bov > 0 && this.#prevFuel > 0.45 && fuel1 < 0.2 && this.#spool > 0.35) {
        this.#bovEnv = this.#spool;
        this.#bovT = 0;
        this.#spool *= 0.35;
      }
    }
    this.#prevFuel = fuel1;

    // ── Filter dieses Blocks ─────────────────────────────────────────────
    const toneHz = (p.tone[0] + (p.tone[1] - p.tone[0]) * fuel1) * (0.72 + 0.4 * rpmNorm);
    this.#tone[0]!.setHz(toneHz, sr);
    this.#tone[1]!.setHz(toneHz, sr);
    this.#dc[0]!.setHz(28, sr);
    this.#dc[1]!.setHz(28, sr);
    const cabinHz = 520 + (1 - p.firewall) * 3200;
    this.#cabinLp[0]!.setHz(cabinHz, sr);
    this.#cabinLp[1]!.setHz(cabinHz, sr);
    this.#intakeRes.set(p.intakeHz * (0.9 + 0.25 * rpmNorm), p.intakeQ, sr);
    this.#inductionRes.set(900 + 1800 * rpmNorm, 0.9, sr);
    this.#valveRes.set(p.valveHz, 3.5, sr);
    const whistle = 1400 + p.turboHz * this.#spool;
    this.#turboHiss.set(whistle * 1.35, 3, sr);
    const bovHz = 3400 - 2000 * Math.min(1, this.#bovT / 0.4);
    this.#bovRes.set(bovHz, 1.3, sr);
    this.#starterRes.set(900, 1.2, sr);

    const fullPulse = 0.7 + 0.3 * rpmNorm;
    const cabin = this.#cabin;
    const exCabin = cabin * (0.35 + 0.65 * p.firewall);
    const exGain = p.gain * (1 - 0.45 * cabin * p.firewall);
    const inGain = p.gain * p.intake * (0.45 + 0.9 * cabin);
    const mechGain = p.gain * p.mech * (0.55 + 0.9 * cabin) * (0.3 + 0.7 * rpmNorm);
    const whineGain = p.gain * p.whine * rpmNorm * (0.25 + 0.75 * fuel1);
    const turboGain = p.gain * p.turbo;
    const bank2 = p.pipe.length > 1 && p.bank.some((b) => b === 1);
    const stepTurbo = (2 * Math.PI * whistle) / sr;
    const stepWhine = (2 * Math.PI * (rpm1 / 60) * p.whineRatio) / sr;
    const inv = 1 / frames;

    for (let s = 0; s < frames; s++) {
      const f = s * inv;
      const rpm = rpm0 + (rpm1 - rpm0) * f;
      const fuel = fuel0 + (fuel1 - fuel0) * f;
      const on = on0 + (on1 - on0) * f;
      this.#phase += rpm / 120 / sr;
      if (this.#phase >= 1) this.#phase -= 1;

      let ex0 = 0;
      let ex1 = 0;
      let suction = 0;
      for (let c = 0; c < this.#n; c++) {
        let q = this.#phase - p.firing[c]!;
        if (q < 0) q += 1;
        if (q < this.#lastQ[c]!) {
          // Neues Arbeitsspiel dieses Zylinders: Stärke der Verbrennung würfeln.
          const sigma = p.variability + p.lope * (1 - rpmNorm) * (1 - rpmNorm);
          const burn = 0.1 + 0.9 * Math.pow(fuel, 0.8);
          this.#amp[c] = Math.max(0, burn * fullPulse * (1 + sigma * this.#rng.gauss()));
          this.#tick = 1;
          if (popChance > 0 && this.#rng.next() < popChance) {
            this.#pop = 0.55 + 0.45 * this.#rng.next();
            this.#popBank = p.bank[c]!;
          }
        }
        this.#lastQ[c] = q;
        let e = 0;
        if (q < wq) {
          const x = q / wq;
          const m = 1 - x;
          // x·(1−x)² ist 0 an beiden Enden (kein Knacken) und steigt steil
          // an: der Druckstoß beim Öffnen des Auslassventils.
          e = this.#amp[c]! * x * m * m * 6.75 * (1 + p.turbulence * this.#rng.bi());
        }
        const qi = q - 0.52;
        if (qi > 0 && qi < wq * 1.6) {
          const xi = qi / (wq * 1.6);
          suction += xi * (1 - xi) * 4 * (0.25 + 0.75 * this.#thr);
        }
        const r = this.#runners[c]!.process(e);
        if (p.bank[c] === 1) ex1 += r;
        else ex0 += r;
      }

      // Fehlzündung / Schaltknall: ein Stoß direkt ins Endrohr.
      let popIn = 0;
      if (this.#pop > 0.002) {
        popIn = this.#pop * this.#rng.bi() * 2.4;
        this.#pop *= 0.9965;
      }
      let bangIn = 0;
      if (this.#bang > 0.002) {
        bangIn = this.#bang * this.#rng.bi() * 3.2;
        this.#bang *= 0.9975;
      }

      let out0 = this.#pipes[0]!.process(
        ex0 + (bank2 ? 0 : ex1) + (this.#popBank === 0 || !bank2 ? popIn : 0) + bangIn,
      );
      let out1 = bank2
        ? this.#pipes[1]!.process(ex1 + (this.#popBank === 1 ? popIn : 0) + bangIn * 0.8)
        : 0;

      // Schalldämpfer: parallele Kammern, trocken + nass.
      let m0 = 0;
      const combs0 = this.#combs[0]!;
      for (let j = 0; j < combs0.length; j++) m0 += combs0[j]!.process(out0);
      out0 = out0 * (1 - p.mufflerMix) + m0 * (p.mufflerMix / combs0.length) * 1.8;
      if (bank2) {
        let m1 = 0;
        const combs1 = this.#combs[1]!;
        for (let j = 0; j < combs1.length; j++) m1 += combs1[j]!.process(out1);
        out1 = out1 * (1 - p.mufflerMix) + m1 * (p.mufflerMix / combs1.length) * 1.8;
      }

      out0 = this.#dc[0]!.hp(this.#tone[0]!.lp(soft(out0, p.rasp * (0.4 + fuel))));
      if (bank2) out1 = this.#dc[1]!.hp(this.#tone[1]!.lp(soft(out1, p.rasp * (0.4 + fuel))));

      // Sitzkamera: Spritzwand als Tiefpass, gemischt nach `firewall`.
      const c0 = this.#cabinLp[0]!.lp(out0);
      out0 = out0 + (c0 - out0) * exCabin;
      if (bank2) {
        const c1 = this.#cabinLp[1]!.lp(out1);
        out1 = out1 + (c1 - out1) * exCabin;
      }

      // Ansaugung.
      const airbox = this.#intakeGuide.process(-suction);
      this.#intakeRes.process(airbox);
      const noise = this.#pink.next();
      const induction = this.#inductionRes.band(noise) * this.#thr * (0.25 + 0.75 * rpm / (idle + (red - idle)));
      const intake = (this.#intakeRes.bp * 0.9 + induction * p.induction) * inGain;

      // Ventiltrieb.
      this.#tick *= 0.82;
      const mech = this.#valveRes.band(this.#rng.bi() * this.#tick) * mechGain;

      // Getriebeheulen.
      this.#whinePhase += stepWhine;
      if (this.#whinePhase > 6.283185307) this.#whinePhase -= 6.283185307;
      const whine = Math.sin(this.#whinePhase) * whineGain;

      // Turbo.
      let turbo = 0;
      if (turboGain > 0) {
        this.#turboPhase += stepTurbo;
        if (this.#turboPhase > 6.283185307) this.#turboPhase -= 6.283185307;
        const sp = this.#spool;
        turbo =
          (Math.sin(this.#turboPhase) * sp * sp * 0.22 + this.#turboHiss.band(noise) * sp * 0.5) *
          turboGain;
        if (this.#bovEnv > 0.002) {
          this.#bovT += 1 / sr;
          const attack = Math.min(1, this.#bovT / 0.012);
          let env = this.#bovEnv * attack;
          if (p.bov === 2) {
            // Verdichterpumpen: die Luft schlägt gegen die geschlossene
            // Drosselklappe zurück, mit fallender Frequenz.
            const fl = 21 - 12 * Math.min(1, this.#bovT / 0.5);
            const w = 0.5 + 0.5 * Math.sin(2 * Math.PI * fl * this.#bovT);
            env *= w * w * w;
          }
          turbo += this.#bovRes.band(this.#rng.bi()) * env * 0.9 * turboGain;
          this.#bovEnv *= p.bov === 2 ? 0.99988 : 0.99982;
        }
      }

      // Anlasser: ein kleiner Elektromotor mit Zahnkranz, sägend.
      let starter = 0;
      if (this.#starter > 0.001) {
        this.#starterPhase += (2 * Math.PI * 165) / sr;
        const saw = Math.sin(this.#starterPhase) + 0.5 * Math.sin(this.#starterPhase * 2) + 0.33 * Math.sin(this.#starterPhase * 3.01);
        const crank = 0.6 + 0.4 * Math.sin(this.#phase * 2 * Math.PI * 2);
        starter = (saw * 0.08 + this.#starterRes.band(this.#rng.bi()) * 0.06) * crank * this.#starter * p.gain;
      }

      const common = (intake + mech + whine + turbo) * on + starter;
      let l: number;
      let rr: number;
      if (bank2) {
        l = (out0 * 0.64 + out1 * 0.36) * exGain * on;
        rr = (out0 * 0.36 + out1 * 0.64) * exGain * on;
      } else {
        l = out0 * exGain * on;
        rr = l;
      }
      outL[s] = outL[s]! + l + common;
      outR[s] = outR[s]! + rr + common;
    }
  }
}
