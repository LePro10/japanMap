/**
 * Einzelgeräusche der Tonschicht 2 — Aufprall je Material, Meldetöne,
 * Oberfläche, Countdown.
 *
 * ## Was vorher da war
 *
 * Jeder Meldeton war **ein** Sinus oder Dreieck mit Hüllkurve, jeder Aufprall
 * **ein** Rauschstoß durch einen Tiefpass — ein Baum klang wie eine Planke wie
 * ein Pylon. Genau diese Gleichförmigkeit hört man als „generiert".
 *
 * ## Wie es jetzt gebaut ist
 *
 * Ein Aufprall ist eine **Schichtung**, wie in jeder Foley-Aufnahme:
 * Körper (tiefer Schlag mit fallender Tonhöhe), Material (Holz: kurze
 * harmonische Resonanzen und Knacken; Metall: *unharmonische* Moden, die lange
 * ausklingen; Kunststoff: ein dumpfes „Bonk"), und Nachklang (Splitter,
 * Laub, Klappern) — jeweils mit etwas Zufall in Zeit und Tonhöhe, damit zwei
 * Treffer nie gleich klingen. Meldetöne sind additive Glocken (Teiltöne mit
 * eigener Abklingzeit) und laufen durch einen kleinen Hall.
 *
 * Alle Knoten hängen sich nach dem Ausklingen selbst ab (`onended`) — dieselbe
 * Regel wie in P16.
 */

export interface ShotBus {
  readonly ctx: AudioContext;
  /** Trocken in die Summe. */
  readonly dry: AudioNode;
  /** In den Hall. */
  readonly wet: AudioNode;
  readonly noise: AudioBuffer;
}

type Kind = 'rail' | 'tree' | 'crate' | 'cone' | 'board' | 'barrel';

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Hüllkurve: 0 → peak in `attack`, dann exponentiell auf ~0 in `decay`. */
function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function out(bus: ShotBus, node: AudioNode, wet: number): void {
  node.connect(bus.dry);
  if (wet > 0) {
    const w = bus.ctx.createGain();
    w.gain.value = wet;
    node.connect(w);
    w.connect(bus.wet);
  }
}

/** Ein Sinus mit Tonhöhenfall — Körper, Mode, Glockenteilton. */
function tone(
  bus: ShotBus,
  t: number,
  hz: number,
  peak: number,
  decay: number,
  opts: { toHz?: number; attack?: number; wet?: number; type?: OscillatorType } = {},
): void {
  const { ctx } = bus;
  const o = ctx.createOscillator();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(hz, t);
  if (opts.toHz) o.frequency.exponentialRampToValueAtTime(opts.toHz, t + decay);
  const g = ctx.createGain();
  env(g, t, peak, opts.attack ?? 0.002, decay);
  o.connect(g);
  out(bus, g, opts.wet ?? 0.15);
  o.start(t);
  o.stop(t + (opts.attack ?? 0.002) + decay + 0.05);
  o.onended = (): void => {
    o.disconnect();
    g.disconnect();
  };
}

/** Gefiltertes Rauschen mit Hüllkurve. */
function burst(
  bus: ShotBus,
  t: number,
  type: BiquadFilterType,
  hz: number,
  q: number,
  peak: number,
  attack: number,
  decay: number,
  wet = 0.15,
  sweepTo?: number,
): void {
  const { ctx, noise } = bus;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(hz, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, attack, decay);
  src.connect(f);
  f.connect(g);
  out(bus, g, wet);
  const dur = attack + decay + 0.05;
  src.start(t, Math.random() * Math.max(0, noise.duration - dur - 0.01), dur);
  src.onended = (): void => {
    src.disconnect();
    f.disconnect();
    g.disconnect();
  };
}

/** Klappern: n kurze Klicks, zufällig über `span` verteilt. */
function rattle(bus: ShotBus, t: number, n: number, span: number, hz: number, peak: number): void {
  for (let i = 0; i < n; i++) {
    const at = t + Math.pow(Math.random(), 1.6) * span;
    burst(bus, at, 'bandpass', hz * rand(0.7, 1.5), 2.5, peak * rand(0.3, 1), 0.001, rand(0.012, 0.04), 0.2);
  }
}

// ── Aufprall ────────────────────────────────────────────────────────────

/** Das Auto gegen etwas Hartes (Wand, Haus, Fels). `s` 0…1. */
export function carImpact(bus: ShotBus, s: number): void {
  const t = bus.ctx.currentTime + 0.005;
  const k = Math.min(1, Math.max(0, s));
  // Körper: der Wagen als Ganzes, tief und kurz.
  tone(bus, t, rand(95, 120), 0.5 + 0.5 * k, 0.16 + 0.14 * k, { toHz: 42, wet: 0.08 });
  // Blech: breitbandig, heller mit der Härte.
  burst(bus, t, 'lowpass', 700 + 3800 * k, 0.7, 0.35 + 0.45 * k, 0.002, 0.09 + 0.16 * k, 0.12);
  burst(bus, t, 'bandpass', 1800, 0.9, 0.2 * k, 0.001, 0.05, 0.1);
  if (k > 0.35) {
    // Karosseriemoden: unharmonisch, klingen nach — ein Blechkasten.
    const f0 = rand(150, 230);
    for (const [ratio, amp, dec] of [[1, 0.1, 0.35], [2.32, 0.06, 0.28], [4.25, 0.04, 0.2], [6.63, 0.025, 0.14]] as const) {
      tone(bus, t, f0 * ratio * rand(0.97, 1.03), amp * k, dec, { wet: 0.2 });
    }
    rattle(bus, t + 0.03, Math.round(4 + 8 * k), 0.35 + 0.3 * k, 2600, 0.12 * k);
  }
}

/** Eine Planke oder ein Baum gibt nach — `speed` in m/s bestimmt die Wucht. */
export function breakable(bus: ShotBus, kind: Kind, speed: number): void {
  const t = bus.ctx.currentTime + 0.005;
  const k = Math.min(1, Math.max(0.25, speed / 25));
  switch (kind) {
    case 'rail': {
      // Leitplanke: Stahlband, lange unharmonische Moden, dazu das Reißen.
      tone(bus, t, rand(85, 105), 0.6 * k, 0.2, { toHz: 45, wet: 0.08 });
      burst(bus, t, 'highpass', 1400, 0.7, 0.4 * k, 0.001, 0.22, 0.15);
      const f0 = rand(290, 360);
      for (const [ratio, amp, dec] of [[1, 0.14, 1.1], [2.76, 0.09, 0.8], [5.4, 0.06, 0.55], [8.93, 0.035, 0.35]] as const) {
        tone(bus, t, f0 * ratio * rand(0.98, 1.02), amp * k, dec, { wet: 0.3 });
      }
      burst(bus, t + 0.04, 'bandpass', 3200, 3, 0.12 * k, 0.02, 0.5, 0.2, 2200);
      rattle(bus, t + 0.05, 6, 0.6, 3000, 0.1 * k);
      break;
    }
    case 'tree': {
      // Baum: Holz knackt (kurze, trockene Stöße), der Stamm dröhnt dumpf,
      // dann rauscht die Krone nach.
      tone(bus, t, rand(70, 90), 0.75 * k, 0.28, { toHz: 38, wet: 0.1 });
      burst(bus, t, 'bandpass', 650, 1.4, 0.55 * k, 0.001, 0.07, 0.12);
      for (let i = 0; i < 5; i++) {
        burst(bus, t + rand(0.01, 0.16), 'bandpass', rand(900, 2400), 3, rand(0.12, 0.3) * k, 0.001, rand(0.015, 0.04), 0.15);
      }
      burst(bus, t + 0.05, 'highpass', 2600, 0.5, 0.16 * k, 0.12, 0.9, 0.3, 4800);
      burst(bus, t + 0.35, 'lowpass', 500, 0.7, 0.2 * k, 0.05, 0.4, 0.15);
      break;
    }
    case 'crate':
    case 'board': {
      // Holzkiste/Brett: harmonische Holzmoden, sehr kurz, dann Klappern der Teile.
      const f0 = kind === 'crate' ? rand(170, 210) : rand(230, 280);
      for (const [ratio, amp, dec] of [[1, 0.3, 0.12], [2.3, 0.18, 0.08], [5.1, 0.08, 0.05]] as const) {
        tone(bus, t, f0 * ratio, amp * k, dec, { wet: 0.12 });
      }
      burst(bus, t, 'bandpass', 1100, 1.2, 0.5 * k, 0.001, 0.06, 0.12);
      rattle(bus, t + 0.04, 9, 0.7, 1300, 0.22 * k);
      break;
    }
    case 'cone': {
      // Pylon: hohler Kunststoff — ein „Bonk" mit fallender Tonhöhe, dann ein
      // zweiter kleinerer Aufsetzer.
      tone(bus, t, rand(480, 560), 0.3 * k, 0.1, { toHz: 330, wet: 0.1 });
      burst(bus, t, 'bandpass', 1500, 1.5, 0.25 * k, 0.001, 0.05, 0.1);
      tone(bus, t + rand(0.16, 0.22), rand(430, 500), 0.12 * k, 0.07, { toHz: 320, wet: 0.1 });
      burst(bus, t + 0.25, 'bandpass', 2400, 1.2, 0.08 * k, 0.005, 0.2, 0.15);
      break;
    }
    case 'barrel': {
      // Blechfass: trommelartige Moden (Kreismembran 1 : 1,59 : 2,14 : 2,65).
      const f0 = rand(120, 150);
      for (const [ratio, amp, dec] of [[1, 0.35, 0.6], [1.59, 0.2, 0.45], [2.14, 0.14, 0.35], [2.65, 0.1, 0.3]] as const) {
        tone(bus, t, f0 * ratio, amp * k, dec, { wet: 0.25 });
      }
      burst(bus, t, 'lowpass', 2400, 0.8, 0.4 * k, 0.001, 0.12, 0.12);
      rattle(bus, t + 0.2, 4, 0.5, 2000, 0.1 * k);
      break;
    }
  }
}

// ── Meldetöne ───────────────────────────────────────────────────────────

/**
 * Eine kleine Glocke: vier Teiltöne mit eigener Abklingzeit. Die hohen
 * klingen schneller ab — das ist der Unterschied zwischen „Glocke" und
 * „Piepton".
 */
export function bell(bus: ShotBus, hz: number, delay: number, peak: number, length = 0.9): void {
  const t = bus.ctx.currentTime + delay;
  const partials: readonly (readonly [number, number, number])[] = [
    [1, 1, 1],
    [2.0, 0.42, 0.6],
    [3.01, 0.2, 0.4],
    [4.16, 0.12, 0.25],
  ];
  for (const [r, a, d] of partials) {
    tone(bus, t, hz * r, peak * a, length * d, { attack: 0.003, wet: 0.35 });
  }
  // Der Anschlag: ein Hauch Rauschen, damit es eine Glocke ist und kein Orgelton.
  burst(bus, t, 'highpass', 5000, 0.7, peak * 0.15, 0.001, 0.02, 0.1);
}

/** Sammelstück — kurz und hell. */
export function pickup(bus: ShotBus, hz: number, first: boolean, kind: 'coin' | 'boost'): void {
  if (kind === 'boost') {
    burst(bus, bus.ctx.currentTime, 'bandpass', 500, 1.8, 0.18, 0.03, 0.35, 0.25, 3200);
    bell(bus, hz * 0.75, 0.04, 0.09, 0.6);
    return;
  }
  bell(bus, hz, 0, 0.1, 0.5);
  if (first) bell(bus, hz * 1.5, 0.06, 0.08, 0.6);
}

export function checkpoint(bus: ShotBus): void {
  bell(bus, 1318.5, 0, 0.1, 0.7);
  bell(bus, 1975.5, 0.07, 0.08, 0.8);
}

export function lap(bus: ShotBus, best: boolean): void {
  const notes = best ? [1046.5, 1318.5, 1568, 2093] : [1046.5, 1318.5, 1568];
  notes.forEach((hz, i) => bell(bus, hz, i * 0.09, 0.1, 1.1));
}

export function finish(bus: ShotBus, place: number): void {
  const notes = place === 1 ? [784, 988, 1175, 1568, 1976] : [784, 988, 1175];
  notes.forEach((hz, i) => bell(bus, hz, i * 0.11, 0.11, 1.4));
}

/** Countdown: drei tiefe Töne, dann ein hoher — die Startampel. */
export function countdown(bus: ShotBus, seconds: number): AudioScheduledSourceNode[] {
  const nodes: AudioScheduledSourceNode[] = [];
  const t0 = bus.ctx.currentTime;
  const steps = Math.max(1, Math.round(seconds));
  for (let i = 0; i <= steps; i++) {
    const go = i === steps;
    const t = t0 + i * (seconds / steps);
    const hz = go ? 1320 : 660;
    const dur = go ? 0.55 : 0.2;
    for (const [mult, amp] of [[1, 0.16], [2, 0.05], [3, 0.02]] as const) {
      const o = bus.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz * mult;
      const g = bus.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.006);
      g.gain.setValueAtTime(amp, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      out(bus, g, 0.2);
      o.start(t);
      o.stop(t + dur + 0.02);
      o.onended = (): void => {
        o.disconnect();
        g.disconnect();
      };
      nodes.push(o);
    }
  }
  return nodes;
}

/** Oberflächenklick: ein kurzes, weiches „Tick" — kein Piepton. */
export function uiClick(bus: ShotBus): void {
  const t = bus.ctx.currentTime;
  tone(bus, t, 1650, 0.07, 0.03, { toHz: 1100, type: 'triangle', attack: 0.001, wet: 0 });
  burst(bus, t, 'highpass', 4500, 0.7, 0.04, 0.0005, 0.008, 0);
}

/** Luftstoß — Stunt an, Rettung, Nitro-Sammeln. */
export function whoosh(bus: ShotBus, peak: number, up = true): void {
  const t = bus.ctx.currentTime;
  burst(bus, t, 'bandpass', up ? 400 : 2600, 1.4, peak, 0.12, 0.35, 0.3, up ? 2800 : 450);
}

/** Wasser: Aufklatschen. */
export function splash(bus: ShotBus, s: number): void {
  const t = bus.ctx.currentTime;
  burst(bus, t, 'lowpass', 900, 0.7, 0.4 * s, 0.004, 0.25, 0.2);
  burst(bus, t + 0.02, 'bandpass', 2400, 0.8, 0.25 * s, 0.01, 0.6, 0.3, 1200);
  rattle(bus, t + 0.1, 10, 0.6, 3500, 0.06 * s);
}

// ── Hall ────────────────────────────────────────────────────────────────

/**
 * Impulsantwort eines kleinen, offenen Raums, gerechnet statt geladen.
 *
 * Ein paar frühe Reflexionen und ein dunkler werdender Nachhall von 1,4 s —
 * genug, dass Glocken und Aufprall einen Ort haben, zu wenig, dass es nach
 * Kathedrale klingt. Draußen hallt wenig; hier geht es um „trocken, aber nicht
 * tot".
 */
export function makeImpulse(ctx: AudioContext, seconds = 1.4): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const decay = Math.exp(-t / 0.32);
      // Je später, desto dunkler: die Luft schluckt Höhen.
      const a = 0.9 * Math.exp(-t / 0.25) + 0.05;
      lp += a * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * decay * 0.5;
    }
    for (const [ms, amp] of [[11, 0.5], [19, 0.35], [27, 0.3], [41, 0.22]] as const) {
      const at = Math.floor(((ms + (ch ? 3.7 : 0)) / 1000) * sr);
      if (at < len) d[at] = d[at]! + amp * (ch ? -1 : 1);
    }
  }
  return ir;
}

export function makeNoise(ctx: AudioContext, seconds = 2): AudioBuffer {
  const frames = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
