/**
 * DSP-Bausteine der Tonschicht 2 — ohne DOM, ohne Web-Audio-Knoten.
 *
 * Alles hier läuft **je Abtastwert** im AudioWorklet und genauso in Node
 * (`tools/bench/audio.mts` rendert daraus WAV-Dateien und misst Pegel,
 * Gleichanteil und NaN). Deshalb keine Allokation in `process`, keine
 * Closures, keine `Math.random` — ein eigener Generator mit Startwert, damit
 * ein Offline-Lauf zeichengleich wiederholbar ist.
 */

/** xorshift32 — schnell, deterministisch, für Rauschen völlig ausreichend. */
export class Rng {
  #s: number;
  #spare = 0;
  #hasSpare = false;
  constructor(seed = 0x9e3779b9) {
    this.#s = seed >>> 0 || 1;
  }
  /** 0…1 */
  next(): number {
    let x = this.#s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.#s = x >>> 0;
    return this.#s / 4294967296;
  }
  /** −1…1 */
  bi(): number {
    return this.next() * 2 - 1;
  }
  /** Normalverteilt, σ = 1 (Box-Muller, paarweise). */
  gauss(): number {
    if (this.#hasSpare) {
      this.#hasSpare = false;
      return this.#spare;
    }
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.#spare = r * Math.sin(2 * Math.PI * v);
    this.#hasSpare = true;
    return r * Math.cos(2 * Math.PI * v);
  }
}

/**
 * Rosa Rauschen nach Paul Kellet (die „ökonomische" Fassung, ±0,5 dB).
 *
 * Weißes Rauschen klingt nach Fernseher; fast alles, was draußen rauscht —
 * Wind, Reifen, Kies —, fällt mit etwa 3 dB je Oktave. Das ist der ganze
 * Unterschied zwischen „Rauschen" und „Luft".
 */
export class Pink {
  #b0 = 0;
  #b1 = 0;
  #b2 = 0;
  readonly rng: Rng;
  constructor(rng: Rng) {
    this.rng = rng;
  }
  next(): number {
    const w = this.rng.bi();
    this.#b0 = 0.99765 * this.#b0 + w * 0.099046;
    this.#b1 = 0.963 * this.#b1 + w * 0.2965164;
    this.#b2 = 0.57 * this.#b2 + w * 1.0526913;
    return (this.#b0 + this.#b1 + this.#b2 + w * 0.1848) * 0.2;
  }
}

/** Braunes Rauschen (−6 dB/Oktave) — Grollen, Abrollen, Karosserie. */
export class Brown {
  #y = 0;
  readonly rng: Rng;
  constructor(rng: Rng) {
    this.rng = rng;
  }
  next(): number {
    this.#y = (this.#y + this.rng.bi() * 0.06) * 0.996;
    return this.#y * 3;
  }
}

/** Einpoliger Tiefpass. `setHz` einmal je Block, nicht je Abtastwert. */
export class OnePole {
  #a = 0;
  y = 0;
  setHz(hz: number, sr: number): void {
    this.#a = 1 - Math.exp((-2 * Math.PI * Math.max(1, hz)) / sr);
  }
  lp(x: number): number {
    this.y += this.#a * (x - this.y);
    return this.y;
  }
  hp(x: number): number {
    this.y += this.#a * (x - this.y);
    return x - this.y;
  }
}

/**
 * Zustandsvariablenfilter in der TPT-Form (Zavalishin).
 *
 * Gewählt, weil er sich **ohne Knacken modulieren** lässt — der Reifenquietscher
 * und das Ansauggeräusch fahren ihre Mittenfrequenz dauernd, und ein
 * Biquad in Direktform klickt dabei hörbar. Koeffizienten je Block (`tan` je
 * Abtastwert wäre verschwendet), Filter je Abtastwert.
 */
export class Svf {
  #g = 0;
  #k = 1;
  #a1 = 0;
  #a2 = 0;
  #a3 = 0;
  #ic1 = 0;
  #ic2 = 0;
  lp = 0;
  bp = 0;
  hp = 0;
  set(hz: number, q: number, sr: number): void {
    const f = Math.min(Math.max(hz, 10), sr * 0.45);
    this.#g = Math.tan((Math.PI * f) / sr);
    this.#k = 1 / Math.max(0.05, q);
    this.#a1 = 1 / (1 + this.#g * (this.#g + this.#k));
    this.#a2 = this.#g * this.#a1;
    this.#a3 = this.#g * this.#a2;
  }
  process(x: number): void {
    const v3 = x - this.#ic2;
    const v1 = this.#a1 * this.#ic1 + this.#a2 * v3;
    const v2 = this.#ic2 + this.#a2 * this.#ic1 + this.#a3 * v3;
    this.#ic1 = 2 * v1 - this.#ic1;
    this.#ic2 = 2 * v2 - this.#ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - this.#k * v1 - v2;
  }
  /** Normierter Bandpass (Spitze 1 bei der Mitte). */
  band(x: number): number {
    this.process(x);
    return this.bp * this.#k;
  }
  reset(): void {
    this.#ic1 = 0;
    this.#ic2 = 0;
  }
}

/**
 * Ein Rohr als digitaler Wellenleiter — der Grund, warum der Motor nach Motor
 * klingt und nicht nach Oszillator.
 *
 * Zwei Verzögerungsleitungen, eine je Laufrichtung, Länge = Rohrlänge ÷
 * Schallgeschwindigkeit im Abgas (~520 m/s bei 400 °C). An jedem Ende wird ein
 * Teil zurückgeworfen (`inReflect`, `outReflect`), der Rest tritt aus. Ein
 * Tiefpass in der Rückführung ist die Wandreibung — ohne ihn klingelt das
 * Rohr metallisch wie eine Feder.
 *
 * Was dabei entsteht, sind die **Formanten** eines Auspuffs: ein 2,5 m langes
 * Endrohr hat seine Grundresonanz bei c/2L ≈ 104 Hz und Obertöne darüber, und
 * die Zündpulse, die durchlaufen, werden von genau diesen Resonanzen gefärbt.
 * Dasselbe Prinzip wie ein Blasinstrument — ein Auspuff *ist* eines.
 */
export class Waveguide {
  readonly #fwd: Float32Array;
  readonly #back: Float32Array;
  readonly #len: number;
  #i = 0;
  #damp = 0;
  #dampA: number;
  readonly inReflect: number;
  readonly outReflect: number;
  constructor(lengthSamples: number, inReflect: number, outReflect: number, dampHz: number, sr: number) {
    this.inReflect = inReflect;
    this.outReflect = outReflect;
    this.#len = Math.max(2, Math.round(lengthSamples));
    this.#fwd = new Float32Array(this.#len);
    this.#back = new Float32Array(this.#len);
    this.#dampA = 1 - Math.exp((-2 * Math.PI * dampHz) / sr);
  }
  process(x: number): number {
    const i = this.#i;
    const arriveOut = this.#fwd[i]!;
    const arriveIn = this.#back[i]!;
    const out = arriveOut * (1 + this.outReflect);
    const refl = arriveOut * this.outReflect;
    this.#damp += this.#dampA * (refl - this.#damp);
    this.#back[i] = this.#damp;
    this.#fwd[i] = x + arriveIn * this.inReflect;
    this.#i = i + 1 === this.#len ? 0 : i + 1;
    return out;
  }
}

/** Kammfilter mit Rückführung — eine Kammer im Schalldämpfer. */
export class Comb {
  readonly #buf: Float32Array;
  #i = 0;
  #lp = 0;
  readonly feedback: number;
  readonly damp: number;
  constructor(samples: number, feedback: number, damp: number) {
    this.feedback = feedback;
    this.damp = damp;
    this.#buf = new Float32Array(Math.max(2, Math.round(samples)));
  }
  process(x: number): number {
    const y = this.#buf[this.#i]!;
    this.#lp += this.damp * (y - this.#lp);
    this.#buf[this.#i] = x + this.#lp * this.feedback;
    this.#i = this.#i + 1 === this.#buf.length ? 0 : this.#i + 1;
    return y;
  }
}

/** Weiche Sättigung, normiert auf Steigung 1 im Ursprung. */
export function soft(x: number, drive: number): number {
  if (drive <= 0.01) return x;
  return Math.tanh(x * drive) / drive;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
