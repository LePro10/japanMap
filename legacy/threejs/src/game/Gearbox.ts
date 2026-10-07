import { GEARBOX, SHIFT, type GearboxSpec } from '@/config/gearbox.config';
import type { VehicleId } from '@/config/vehicles.config';

/**
 * Was das Getriebe je Schritt verlangt — bewusst schmal, damit `Vehicle` und
 * der Prüfstand dasselbe hineinreichen können.
 */
export interface GearboxInput {
  /** Längsgeschwindigkeit in m/s, negativ = rückwärts. */
  readonly forwardSpeed: number;
  readonly throttle: number;
  readonly brake: number;
  readonly airborne: boolean;
  /** Antriebsbedarf ÷ übertragbare Kraft, > 1 = Räder drehen durch. */
  readonly wheelspin: number;
  /** 0…1, wie stark die Hinterachse quer steht. */
  readonly skid: number;
}

/**
 * Ein Anzeige- und Tongetriebe — kein Wert hier wirkt auf eine Kraft.
 *
 * Begründung, warum es existiert, in `gearbox.config.ts`. Was es liefert:
 *
 * - `rpm` — die Motordrehzahl mit Trägheit. Im eingekuppelten Zustand folgt
 *   sie den Rädern (schnell, aber nicht in einem Frame), beim Schalten, in der
 *   Luft und ausgekuppelt dreht sie **frei** mit `revRise`/`revFall`. Das ist
 *   der Unterschied zwischen einer Tonhöhe, die springt, und einem Motor, der
 *   beim Hochschalten hörbar „fällt" und beim Zurückschalten mit Zwischengas
 *   hochdreht.
 * - `load` — was der Motor gerade verbrennt, 0…1. Beim Hochschalten fast null
 *   (Zugkraftunterbrechung), beim Zurückschalten kurz hoch (Zwischengas), am
 *   Begrenzer im Takt aus. Die Tonschicht hängt Lautstärke, Klangfarbe und
 *   Fehlzündungen hieran — **nicht** an der Drehzahl.
 * - `gear` — −1 rückwärts, 0 Leerlauf, 1…n.
 * - `shifts` — ein Zähler, der bei jedem Schaltvorgang steigt. Ein Zähler und
 *   kein Ereignis, weil der Leser (Ton, HUD) mit seiner eigenen Rate liest und
 *   eine Flanke zwischen zwei Frames sonst verpasst.
 *
 * **Deterministisch**, kein `Math.random`: der Messstand fährt dieselbe
 * `Vehicle`-Klasse und verlangt zeichengleiche Läufe.
 */
export class Gearbox {
  #spec: GearboxSpec = GEARBOX.touge;
  /** Spitzentempo jedes Gangs an der Nenndrehzahl, m/s. Index 0 = 1. Gang. */
  #tops: number[] = [];

  #gear = 1;
  #rpm = GEARBOX.touge.idle;
  #load = 0;
  #throttle = 0;
  /** Laufender Schaltvorgang: Restzeit und Richtung. */
  #shiftLeft = 0;
  #shiftUp = true;
  #cooldown = 0;
  #shifts = 0;
  /** Begrenzer: Restzeit der Spritabschaltung. */
  #cut = 0;
  #limiterHits = 0;

  configure(id: VehicleId, topSpeed: number): void {
    const spec = GEARBOX[id];
    this.#spec = spec;
    const vTop = Math.max(10, topSpeed) * SHIFT.topGearMargin;
    this.#tops = [];
    for (let i = 1; i <= spec.gears; i++) {
      this.#tops.push(vTop * Math.pow(i / spec.gears, spec.spread));
    }
    this.reset();
  }

  reset(): void {
    this.#gear = 1;
    this.#rpm = this.#spec.idle;
    this.#load = 0;
    this.#throttle = 0;
    this.#shiftLeft = 0;
    this.#cooldown = 0;
    this.#cut = 0;
  }

  get spec(): GearboxSpec {
    return this.#spec;
  }
  get rpm(): number {
    return this.#rpm;
  }
  get load(): number {
    return this.#load;
  }
  get shifts(): number {
    return this.#shifts;
  }
  get limiterHits(): number {
    return this.#limiterHits;
  }
  /** −1 rückwärts, 0 Leerlauf, 1…n. */
  get gear(): number {
    return this.#gear;
  }
  /** 0…1 Fortschritt eines laufenden Schaltvorgangs, 0 wenn keiner läuft. */
  get shifting(): number {
    const t = this.#spec.shiftTime;
    return this.#shiftLeft > 0 && t > 0 ? 1 - this.#shiftLeft / t : 0;
  }

  /** Raddrehzahl als Motordrehzahl in Gang `g` (1-basiert). */
  #wheelRpm(v: number, g: number): number {
    const top = this.#tops[Math.max(0, Math.min(this.#tops.length - 1, g - 1))] ?? 1;
    return (Math.abs(v) / top) * this.#spec.redline;
  }

  step(dt: number, input: GearboxInput): void {
    if (!(dt > 0)) return;
    const s = this.#spec;
    const v = Number.isFinite(input.forwardSpeed) ? input.forwardSpeed : 0;
    const speed = Math.abs(v);
    const thr = clamp01(input.throttle);
    const brk = clamp01(input.brake);
    // Das Gaspedal hat eine eigene kleine Trägheit — ein Fuß ist kein Schalter,
    // und ein Lastsprung in einem Schritt ist im Ton ein Knacken der Klangfarbe.
    this.#throttle += (thr - this.#throttle) * (1 - Math.exp(-dt / 0.045));
    const t = this.#throttle;

    this.#cooldown = Math.max(0, this.#cooldown - dt);

    // ── Gangwahl ──────────────────────────────────────────────────────────
    const reverse = v < -0.5;
    if (reverse) {
      if (this.#gear !== -1) this.#gear = -1;
    } else if (this.#gear === -1 && v > -0.2) {
      this.#gear = 1;
    }

    if (!reverse && this.#shiftLeft <= 0 && this.#cooldown <= 0 && !input.airborne) {
      const g = Math.max(1, this.#gear);
      const upAt = s.redline * lerp(SHIFT.upLow, SHIFT.upHigh, t);
      const downAt = s.redline * lerp(SHIFT.downLow, SHIFT.downHigh, t);
      const here = this.#wheelRpm(v, g);
      // Beim Bremsen wird nie hochgeschaltet — sonst pendelt es mit dem
      // Zurückschalten darunter (gemessen: 7→6→7→6 bei einer Vollbremsung).
      if (g < s.gears && here > upAt && brk < 0.1) {
        this.#begin(g + 1, true);
      } else if (g > 1) {
        const lower = this.#wheelRpm(v, g - 1);
        const canDrop = lower < s.redline * 0.9;
        const lugging = here < downAt && lower < upAt * 0.92;
        const braking = brk > 0.3 && lower < s.redline * SHIFT.brakeDown && speed > 2;
        const kickdown = t > 0.92 && here < s.redline * 0.55 && lower < s.redline * 0.82;
        if (canDrop && (lugging || braking || kickdown)) this.#begin(g - 1, false);
      }
    }

    // ── Soll-Drehzahl ─────────────────────────────────────────────────────
    const g = this.#gear === -1 ? 1 : Math.max(1, this.#gear);
    let wheel = this.#wheelRpm(v, g) * (this.#gear === -1 ? 1.15 : 1);
    // Durchdrehende Räder und ein Drift unter Gas drehen den Motor mit hoch —
    // der Klang eines Drifts ist zur Hälfte ein Motor, der vor dem Tempo läuft.
    const spinUp =
      Math.min(0.55, Math.max(0, input.wheelspin - 1) * 0.35) +
      clamp01(input.skid) * t * 0.22;
    if (g <= 3) wheel *= 1 + spinUp;
    else wheel *= 1 + spinUp * 0.4;

    // Kupplung beim Anfahren: Vollgas im Stand hält den Motor bei `launch`.
    const launchRpm = s.idle + t * (s.redline * SHIFT.launch - s.idle);
    const clutchSlip = g === 1 && wheel < launchRpm;

    const shifting = this.#shiftLeft > 0;
    const free = input.airborne || shifting || speed < 0.4;

    let target: number;
    let load = t;
    if (shifting) {
      this.#shiftLeft = Math.max(0, this.#shiftLeft - dt);
      const p = this.shifting;
      if (this.#shiftUp) {
        // Zugkraftunterbrechung: Sprit weg, Motor fällt auf die Drehzahl des
        // neuen Gangs; im letzten Drittel kuppelt es ein und die Last kommt
        // zurück.
        target = this.#wheelRpm(v, g);
        load = p < 0.7 ? 0.04 : t * ((p - 0.7) / 0.3);
      } else {
        // Zwischengas: kurz Last, Motor dreht auf die Drehzahl des kleineren Gangs.
        target = this.#wheelRpm(v, g) * 1.04;
        load = p < 0.55 ? Math.max(t, 0.62) : t;
      }
      if (this.#shiftLeft <= 0) this.#cooldown = SHIFT.cooldown;
    } else if (free) {
      target = s.idle + t * (s.limiter + 60 - s.idle);
      if (speed < 0.4 && !input.airborne) target = Math.max(target, clutchSlip ? launchRpm : s.idle);
    } else if (clutchSlip) {
      target = launchRpm;
    } else {
      target = Math.max(s.idle, wheel);
    }

    // ── Trägheit ──────────────────────────────────────────────────────────
    const locked = !free && !clutchSlip && !shifting;
    if (locked) {
      // Eingekuppelt folgt der Motor den Rädern — schnell, aber mit einer
      // Zeitkonstante, damit eine Raddrehzahl, die von Schritt zu Schritt um
      // ein paar Prozent zittert, kein Vibrato wird.
      this.#rpm += (target - this.#rpm) * (1 - Math.exp(-dt / 0.035));
    } else {
      const d = target - this.#rpm;
      const rate = d > 0 ? s.revRise * (0.35 + 0.65 * Math.max(load, 0.2)) : s.revFall;
      this.#rpm += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    }

    // ── Begrenzer ─────────────────────────────────────────────────────────
    if (this.#cut > 0) {
      this.#cut = Math.max(0, this.#cut - dt);
      load = 0;
      this.#rpm -= s.revFall * 0.6 * dt;
    } else if (this.#rpm >= s.limiter && t > 0.3) {
      this.#cut = SHIFT.limiterCut;
      this.#limiterHits++;
      load = 0;
    }
    this.#rpm = Math.min(Math.max(this.#rpm, s.idle * 0.92), s.limiter + 80);
    if (!Number.isFinite(this.#rpm)) this.#rpm = s.idle;

    // Im Schubbetrieb (Gas weg bei hoher Drehzahl) verbrennt der Motor nichts;
    // `load` bleibt dann null und der Ton hängt daran die Fehlzündungen.
    this.#load = clamp01(load);

    // Anzeige: Leerlauf im Stand ohne Gas.
    if (this.#gear !== -1 && speed < 0.15 && t < 0.05 && brk < 0.05 && !shifting) {
      this.#gear = 0;
    } else if (this.#gear === 0 && (speed >= 0.15 || t >= 0.05)) {
      this.#gear = 1;
    }
  }

  #begin(to: number, up: boolean): void {
    this.#gear = to;
    this.#shiftUp = up;
    this.#shiftLeft = up ? this.#spec.shiftTime : Math.max(0.12, this.#spec.shiftTime * 0.9);
    this.#shifts++;
  }
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
