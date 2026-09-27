import { EngineVoice, type EngineInput, type EngineVoiceProfile } from './engineVoice';
import { Brown, OnePole, Pink, Rng, Svf, clamp01, smoothstep, soft } from './primitives';

/** Belag als Zahl — Reihenfolge wie `Surface` im Fahrmodell. */
export const SURFACE_ID = { asphalt: 0, kies: 1, gelaende: 2, wasser: 3 } as const;

/**
 * Alles, was der Hauptfaden je Bild an den Worklet schickt. Flach und nur
 * Zahlen, damit `postMessage` es billig kopiert.
 */
export interface VehicleSoundParams extends EngineInput {
  /** m/s */
  speed: number;
  surface: number;
  /** 0…1 Querrutschen der Hinterachse. */
  skid: number;
  /** Schwimmwinkel, rad (Betrag). */
  slip: number;
  wheelspin: number;
  airborne: number;
  /** Wassertiefe, m. */
  water: number;
  /** 0…1 Nitro läuft. */
  boost: number;
  /** 0…1 Blech schleift an Planke/Wand. */
  scrape: number;
  /** 0…1 Rennstrecke — präpariert, quietscht heller. */
  circuit: number;
  /** 0…1: Fahrzeugschicht aktiv (Reifen, Wind). Der Motor hat `on`. */
  drive: number;
  /** Freiflug: Tempo der Kamera, nur Wind. */
  fly: number;
}

/**
 * Pegel der Fahrzeugwelt (Reifen, Wind, Fahrwerk) gegen den Motor.
 * Abgeglichen mit `tools/bench/audio.mts`: bei Vollgas um 100 km/h liegt die
 * Welt rund 9 dB unter dem Motor. Vorher (erste Fassung) lag sie 9 dB
 * **darüber**, und der Motor ging im Rauschen unter — genau der Teppich, der
 * die alte Schicht unerträglich gemacht hat.
 */
const WORLD_GAIN = 3.2;

export function defaultParams(): VehicleSoundParams {
  return {
    rpm: 800, load: 0, throttle: 0, idle: 800, redline: 7000, on: 0, cabin: 0, starter: 0,
    speed: 0, surface: 0, skid: 0, slip: 0, wheelspin: 0, airborne: 0, water: 0, boost: 0,
    scrape: 0, circuit: 0, drive: 0, fly: 0,
  };
}

/**
 * Die gesamte Dauerschicht eines Fahrzeugs in einem Worklet: Motor, Reifen,
 * Belag, Wind, Nitro, Schleifen, Fahrwerk.
 *
 * ## Was die alte Schicht war und warum sie nicht zu retten war
 *
 * Bis zur Tonschicht 2 war das **ein** Bandpass über weißem Rauschen für
 * alles — Rollen, Wind und Durchdrehen zugleich, auf jedem Belag derselbe.
 * Kies, Wiese, Wasser und Asphalt klangen gleich; Quietschen gab es nicht, ein
 * Drift war hörbar nur als lauteres Rauschen. Hier hat jede Quelle ihr eigenes
 * Modell, weil sie physikalisch verschieden entsteht:
 *
 * - **Abrollen** ist tieffrequent (Karkasse, Fahrwerk) — braunes Rauschen.
 * - **Kies** ist ein Strom einzelner Körner, die gegen den Unterboden
 *   schlagen — ein Poisson-Prozess kurzer Stöße, kein Rauschteppich.
 * - **Quietschen** ist Haft-Gleit-Schwingung der Lauffläche: tonal, mit
 *   Obertönen und einem Rattern — schmalbandige Resonatoren über rauem
 *   Anreger, nicht Rauschen.
 * - **Wind** ist breit und stereo unkorreliert; Böen sind langsam.
 */
export class VehicleMixer {
  readonly #sr: number;
  readonly #rng = new Rng(0x0dd5eed);
  readonly #pinkA: Pink;
  readonly #pinkB: Pink;
  readonly #pinkC: Pink;
  readonly #brown: Brown;
  readonly #brown2: Brown;
  #engine: EngineVoice | null = null;
  readonly #p: VehicleSoundParams = defaultParams();

  // Geglättet.
  #speed = 0;
  #skid = 0;
  #squealEnv = 0;
  #scrub = 0;
  #boost = 0;
  #scrape = 0;
  #water = 0;
  #surfW = [1, 0, 0, 0];
  #cabin = 0;
  #drive = 0;
  #fly = 0;
  #air = 0;

  // Filter.
  readonly #roll = new Svf();
  readonly #hiss = new Svf();
  readonly #rumble = new Svf();
  readonly #grainA = new Svf();
  readonly #grainB = new Svf();
  readonly #grassRes = new Svf();
  readonly #waterRes = new Svf();
  readonly #waterLow = new Svf();
  readonly #sqA = new Svf();
  readonly #sqB = new Svf();
  readonly #sqC = new Svf();
  readonly #scrubRes = new Svf();
  readonly #windL = new Svf();
  readonly #windR = new Svf();
  readonly #buffet = new Svf();
  readonly #nitroHiss = new Svf();
  readonly #nitroRoar = new Svf();
  readonly #whoosh = new Svf();
  readonly #scrapeA = new Svf();
  readonly #scrapeB = new Svf();
  readonly #thumpClick = new Svf();
  readonly #clank = new Svf();
  readonly #tyreCabin: OnePole[] = [new OnePole(), new OnePole()];
  readonly #slowA = new OnePole();
  readonly #slowB = new OnePole();
  readonly #chatterLp = new OnePole();

  // Körner.
  #grainL = 0;
  #grainR = 0;
  #grainDecay = 0.95;
  // Quietschen.
  #wander = 0;
  #chatterPhase = 0;
  #chatterHz = 70;
  // Einzelereignisse.
  #thump = 0;
  #thumpPhase = 0;
  #thumpHz = 80;
  #click = 0;
  #clankEnv = 0;
  #whooshEnv = 0;
  #whooshT = 0;
  #prevBoost = 0;

  constructor(sampleRate: number) {
    this.#sr = sampleRate;
    this.#pinkA = new Pink(new Rng(11));
    this.#pinkB = new Pink(new Rng(23));
    this.#pinkC = new Pink(new Rng(37));
    this.#brown = new Brown(new Rng(41));
    this.#brown2 = new Brown(new Rng(53));
    this.#slowA.setHz(0.35, sampleRate);
    this.#slowB.setHz(5, sampleRate);
    this.#chatterLp.setHz(40, sampleRate);
    this.#clank.set(240, 9, sampleRate);
    this.#thumpClick.set(900, 0.8, sampleRate);
  }

  setProfile(profile: EngineVoiceProfile | null): void {
    this.#engine = profile ? new EngineVoice(profile, this.#sr, 7) : null;
  }

  setParams(p: Partial<VehicleSoundParams>): void {
    Object.assign(this.#p, p);
  }

  /** Aufsetzen, Bodenwelle, Randstein. `strength` 0…1. */
  thump(strength: number): void {
    const s = clamp01(strength);
    this.#thump = Math.max(this.#thump, s);
    this.#thumpHz = 95 - 40 * s;
    this.#thumpPhase = 0;
    this.#click = Math.max(this.#click, s * 0.8);
    this.#clankEnv = Math.max(this.#clankEnv, s * 0.5);
  }

  /** Mechanisches „Klack" beim Schalten — leise, in der Sitzkamera deutlich. */
  clunk(): void {
    this.#clankEnv = Math.max(this.#clankEnv, 0.16);
    this.#click = Math.max(this.#click, 0.1);
  }

  bang(strength: number): void {
    this.#engine?.bang(strength);
  }

  render(outL: Float32Array, outR: Float32Array, frames: number): void {
    outL.fill(0, 0, frames);
    outR.fill(0, 0, frames);
    const p = this.#p;
    const sr = this.#sr;
    this.#engine?.render(outL, outR, frames, p);

    const dtB = frames / sr;
    const k = (tau: number): number => 1 - Math.exp(-dtB / tau);
    const speedT = Number.isFinite(p.speed) ? Math.max(0, p.speed) : 0;
    this.#speed += (speedT - this.#speed) * k(0.06);
    this.#drive += (clamp01(p.drive) - this.#drive) * k(0.1);
    this.#fly += ((Number.isFinite(p.fly) ? p.fly : 0) - this.#fly) * k(0.25);
    this.#cabin += (clamp01(p.cabin) - this.#cabin) * k(0.12);
    this.#air += ((p.airborne > 0.5 ? 1 : 0) - this.#air) * k(0.04);
    const surf = Math.round(p.surface);
    for (let i = 0; i < 4; i++) {
      const w = this.#surfW[i]!;
      this.#surfW[i] = w + ((surf === i ? 1 : 0) - w) * k(0.08);
    }
    const drive = this.#drive;
    const speed = this.#speed;
    const ground = drive * (1 - this.#air);

    // Rutschen: die stärkste der drei Quellen zählt.
    const spin = p.wheelspin > 1 ? Math.min(1, (p.wheelspin - 1) * 1.1) : 0;
    const slide = Math.max(clamp01(p.skid), clamp01(Math.abs(p.slip) * 1.7), spin * 0.9);
    this.#skid += (slide - this.#skid) * k(slide > this.#skid ? 0.03 : 0.09);
    const skid = this.#skid;
    const moving = smoothstep(1.5, 9, speed);
    // Quietschen mit Schwelle und Hysterese — kleiner Schräglauf in jeder
    // Kurve darf nicht quietschen, sonst quietscht das ganze Spiel.
    const sqT = ground * smoothstep(0.2, 0.62, skid) * Math.max(moving, spin * 0.8);
    this.#squealEnv += (sqT - this.#squealEnv) * k(sqT > this.#squealEnv ? 0.05 : 0.12);
    const scrubT = ground * smoothstep(0.06, 0.32, skid) * moving;
    this.#scrub += (scrubT - this.#scrub) * k(0.08);
    this.#boost += (clamp01(p.boost) * drive - this.#boost) * k(0.12);
    if (p.boost > 0.5 && this.#prevBoost <= 0.5 && drive > 0.5) {
      this.#whooshEnv = 1;
      this.#whooshT = 0;
    }
    this.#prevBoost = p.boost;
    this.#scrape += (clamp01(p.scrape) * drive - this.#scrape) * k(0.05);
    const waterT = Math.min(1, Math.max(0, p.water) / 0.35) * ground;
    this.#water += (waterT - this.#water) * k(0.1);

    const [wA, wK, wG, wW] = this.#surfW as [number, number, number, number];
    const sp = speed / 40;

    // ── Filter dieses Blocks ─────────────────────────────────────────────
    this.#roll.set(70 + speed * 7 * (1 - 0.4 * wG), 0.7, sr);
    this.#hiss.set(900 + speed * 12, 0.7, sr);
    this.#rumble.set(110, 0.8, sr);
    this.#grainA.set(1500 + 400 * this.#rng.next(), 1.4, sr);
    this.#grainB.set(3300 + 900 * this.#rng.next(), 1.8, sr);
    this.#grassRes.set(650 + speed * 10, 0.9, sr);
    this.#waterRes.set(1200 + speed * 30, 0.8, sr);
    this.#waterLow.set(240, 0.7, sr);
    // Quietschen: Grundton wandert langsam, und mit dem Tempo ein wenig nach oben.
    this.#wander += this.#rng.bi() * 0.09 - this.#wander * 0.04;
    const f0 = (760 + Math.min(260, speed * 3.2) + p.circuit * 90) * (1 + 0.055 * this.#wander);
    this.#sqA.set(f0, 22, sr);
    this.#sqB.set(f0 * 2.03, 16, sr);
    this.#sqC.set(f0 * 3.07, 11, sr);
    this.#scrubRes.set(1900 + speed * 15, 0.9, sr);
    this.#chatterHz += (55 + 55 * this.#rng.next() - this.#chatterHz) * 0.2;
    const windHz = 260 + speed * 16 + this.#fly * 10;
    this.#windL.set(windHz, 0.55, sr);
    this.#windR.set(windHz * 1.07, 0.55, sr);
    this.#buffet.set(55 + speed * 0.4, 0.9, sr);
    this.#nitroHiss.set(4200, 0.6, sr);
    this.#nitroRoar.set(260 + 120 * this.#boost, 0.9, sr);
    if (this.#whooshEnv > 0.001) {
      this.#whooshT += dtB;
      this.#whoosh.set(380 + 2600 * Math.min(1, this.#whooshT / 0.45), 1.6, sr);
    }
    this.#scrapeA.set(2600 + 500 * this.#rng.next(), 2.5, sr);
    this.#scrapeB.set(5200, 4, sr);
    const tyreHz = 18000 - 16000 * this.#cabin;
    this.#tyreCabin[0]!.setHz(tyreHz, sr);
    this.#tyreCabin[1]!.setHz(tyreHz, sr);

    // Pegel je Block.
    const rollG = 0.16 * ground * Math.pow(Math.min(1.4, sp), 1.2) * (0.5 * wA + 0.75 * wK + 0.45 * wG + 0.35 * wW);
    const hissG = ground * Math.pow(Math.min(1.5, sp), 1.6) * 0.025 * (wA + 0.3 * wK);
    const grainRate = ground * (wK * (speed * 60 + skid * 1600 + spin * 700) + wG * (speed * 9 + skid * 260));
    const grainP = grainRate / sr;
    const grassG = ground * wG * (Math.min(1, speed / 25) * 0.16 + skid * 0.2);
    const waterG = this.#water * (0.15 + Math.min(1, speed / 18)) * 0.4;
    const squealG = this.#squealEnv * wA * 0.24 * (1 - 0.3 * this.#cabin);
    const scrubG = this.#scrub * (wA * 0.07 + wK * 0.05);
    const windBase = Math.min(1.6, Math.pow(speed / 60, 2)) * drive + Math.min(1, Math.pow(this.#fly / 60, 2)) * 0.5 * (1 - drive);
    const windG = windBase * 0.09 * (1 - 0.7 * this.#cabin) * (1 + 0.6 * this.#air);
    const buffetG = drive * Math.min(1, Math.pow(speed / 80, 2.5)) * 0.08;
    const nitroG = this.#boost;
    const scrapeG = this.#scrape * Math.min(1, 0.2 + speed / 15) * 0.35;
    const cab = this.#cabin;

    // Frühausstieg: keine Fahrzeugwelt, kein Wind, kein Nachklang — dann ist
    // die Schleife unten reines Rauschenwürfeln für null Pegel. Wichtig für
    // die Gegnerstimmen, die nur einen Motor tragen, und für das Menü.
    const idleWorld =
      drive < 1e-3 &&
      windG < 1e-4 &&
      this.#thump < 0.001 &&
      this.#click < 0.001 &&
      this.#clankEnv < 0.001 &&
      this.#whooshEnv < 0.001 &&
      this.#boost < 1e-3 &&
      this.#scrape < 1e-4;
    if (idleWorld) return;

    for (let s = 0; s < frames; s++) {
      const white = this.#rng.bi();
      const pinkA = this.#pinkA.next();
      const pinkB = this.#pinkB.next();
      const pinkC = this.#pinkC.next();
      const brown = this.#brown.next();

      let tyre = 0;
      let tyreL = 0;
      let tyreR = 0;

      // Abrollen und Laufflächenrauschen.
      if (rollG > 1e-4) tyre += this.#roll.band(brown) * rollG;
      if (hissG > 1e-4) tyre += this.#hiss.band(pinkA) * hissG;

      // Körner.
      if (grainP > 0) {
        if (this.#rng.next() < grainP) {
          const a = 0.15 + 0.85 * this.#rng.next();
          const amp = a * a;
          if (this.#rng.next() < 0.5) this.#grainL = Math.max(this.#grainL, amp);
          else this.#grainR = Math.max(this.#grainR, amp);
          this.#grainDecay = 0.9 + 0.08 * this.#rng.next();
        }
        this.#grainL *= this.#grainDecay;
        this.#grainR *= this.#grainDecay;
        const gl = this.#grainL * white;
        const gr = this.#grainR * this.#rng.bi();
        const hiL = this.#grainA.band(gl) * 0.6 + this.#grainB.band(gr) * 0.35;
        tyreL += hiL * 0.32 * (wK + 0.45 * wG);
        tyreR += (this.#grainA.bp * 0.3 + this.#grainB.bp * 0.6) * 0.32 * (wK + 0.45 * wG);
        tyre += this.#rumble.band(brown * (0.6 + this.#grainL + this.#grainR)) * rollG * 0.5 * wK;
      }

      // Wiese.
      if (grassG > 1e-4) {
        const am = this.#slowB.lp(Math.abs(pinkB)) * 3;
        tyre += this.#grassRes.band(pinkB) * grassG * (0.4 + am);
      }

      // Wasser: „blubbernd" durch schnelle Amplitudenmodulation.
      if (waterG > 1e-4) {
        const bub = this.#chatterLp.lp(Math.max(0, white));
        tyre += (this.#waterRes.band(pinkC) * (0.3 + bub * 4) + this.#waterLow.band(brown) * 0.8) * waterG;
      }

      // Quietschen.
      if (squealG > 1e-4) {
        this.#chatterPhase += this.#chatterHz / sr;
        if (this.#chatterPhase >= 1) this.#chatterPhase -= 1;
        const chatter = this.#chatterPhase < 0.55 ? 1 : 0.35;
        const exc = white * (0.55 + 0.45 * chatter);
        const sq =
          this.#sqA.band(exc) * 1.0 + this.#sqB.band(exc) * 0.42 + this.#sqC.band(exc) * 0.18;
        const v = soft(sq * 2.2, 1.4) * squealG;
        tyreL += v * 1.05;
        tyreR += v * 0.95;
      }
      if (scrubG > 1e-4) tyre += this.#scrubRes.band(pinkC) * scrubG;

      // Kabine: die Reifen kommen durch den Boden, dumpf.
      const tl0 = tyre + tyreL;
      const tr0 = tyre + tyreR;
      const tl = tl0 + (this.#tyreCabin[0]!.lp(tl0) - tl0) * cab * 0.85;
      const tr = tr0 + (this.#tyreCabin[1]!.lp(tr0) - tr0) * cab * 0.85;

      // Wind, stereo unkorreliert, mit langsamer Böe.
      let wl = 0;
      let wr = 0;
      if (windG > 1e-4) {
        const gust = 0.7 + 3.5 * Math.abs(this.#slowA.lp(pinkA));
        wl = this.#windL.band(pinkB) * windG * gust;
        wr = this.#windR.band(pinkC) * windG * gust;
      }
      let buf = 0;
      if (buffetG > 1e-4) buf = this.#buffet.band(this.#brown2.next()) * buffetG;

      // Nitro.
      let nitro = 0;
      if (nitroG > 1e-3) {
        this.#nitroHiss.process(pinkA);
        nitro = this.#nitroHiss.hp * 0.1 * nitroG + this.#nitroRoar.band(brown) * 0.5 * nitroG;
      }
      if (this.#whooshEnv > 0.001) {
        nitro += this.#whoosh.band(pinkB) * this.#whooshEnv * 0.5;
        this.#whooshEnv *= 0.99985;
      }

      // Blech an der Planke.
      let scrape = 0;
      if (scrapeG > 1e-4) {
        const jag = this.#rng.next() < 0.004 ? 2.5 : 1;
        scrape = (this.#scrapeA.band(white) + this.#scrapeB.band(white) * 0.6) * scrapeG * jag;
      }

      // Fahrwerk: Schlag, Klick, Klappern.
      let hit = 0;
      if (this.#thump > 0.001) {
        this.#thumpPhase += (2 * Math.PI * this.#thumpHz) / sr;
        this.#thumpHz = Math.max(38, this.#thumpHz * 0.99993);
        hit += Math.sin(this.#thumpPhase) * this.#thump * 0.9;
        this.#thump *= 0.99955;
      }
      if (this.#click > 0.001) {
        hit += this.#thumpClick.band(white * this.#click) * 0.8;
        this.#click *= 0.993;
      }
      if (this.#clankEnv > 0.001) {
        hit += this.#clank.band(white * this.#clankEnv) * 0.6;
        this.#clankEnv *= 0.9975;
      }

      const shared = buf + nitro + scrape + hit;
      outL[s] = outL[s]! + (tl + wl + shared) * WORLD_GAIN;
      outR[s] = outR[s]! + (tr + wr + shared) * WORLD_GAIN;
    }
  }
}
