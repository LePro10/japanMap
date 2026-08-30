import { RAMPS, RAMP_EDGE_FADE, type Ramp } from '@/config/stunt.config';

/**
 * Die Schanzen als **Funktion** — P24.
 *
 * ## Warum das keine Geometrie ist
 *
 * Eine Schanze muss an zwei Stellen zugleich existieren: im **Bild** (man sieht
 * sie) und in der **Physik** (man fährt darauf). Der übliche Weg wäre ein Mesh
 * plus ein Kollisionskörper — also zwei Beschreibungen desselben Dings, die
 * auseinanderlaufen, sobald jemand eine davon anfasst.
 *
 * Dieses Projekt hat diese Klasse Fehler dreimal bezahlt (die Fahrbahn gegen das
 * Höhenfeld, die Stadtplatte gegen ihre Schürze, die Ideallinie gegen die
 * Mittellinie), und die Lehre steht in CLAUDE.md: *wo Bild und Physik dieselbe
 * Fläche meinen, muss die Physik sie aus derselben Quelle bilden.*
 *
 * Hier ist die Quelle diese Funktion. `RoadGround.height()` addiert sie, und
 * `StuntSystem` baut sein Mesh aus **ihr** — Stützpunkt für Stützpunkt, mit
 * denselben Aufrufen. Ein Auto kann damit nicht durch eine Schanze fahren, die
 * es sieht, und nicht über eine springen, die es nicht sieht.
 *
 * ## Die Form
 *
 * In Schanzenkoordinaten (`s` längs der Anfahrt, `t` quer, beide in Metern):
 *
 * ```
 *   lift(s, t) = height · rampe(s) · rand(t)
 *
 *   rampe(s) = 0                       s < −length      (davor: Gelände)
 *              smoothstep(s/length+1)  −length ≤ s < 0  (die Auffahrt)
 *              1                       s = 0            (die Kante)
 *              auslauf(s/tail)         0 < s < tail     (nur bei einer Kuppe)
 *              0                       darüber
 * ```
 *
 * `smoothstep` und keine Gerade: eine Gerade hat am Fuß einen Knick, und ein
 * Knick im Boden ist für die Radabtastung eine Stufe — dieselbe Begründung, aus
 * der die Straßenkorrektur seit P21 eine Ebene ist und kein Sprung.
 *
 * > **Am Kopf ist der Knick trotzdem da, und zwar mit Absicht.** Die
 * > Absprungkante *soll* eine Kante sein: dort endet der Boden. Ein sanft
 * > auslaufender Schanzenkopf ist eine Kuppe, über die man rollt — genau das
 * > ist `tail > 0`, und dafür gibt es einen eigenen Eintrag (`pass-crest`).
 */

/** Vorgerechnete Schanze — Sinus und Kosinus einmal statt je Abfrage. */
interface Prepared {
  readonly ramp: Ramp;
  readonly sin: number;
  readonly cos: number;
  /** Grober Radius um den Mittelpunkt, in dem überhaupt etwas passiert. */
  readonly reach: number;
  /**
   * Geländehöhe am Fuß der Auffahrt — der Boden, auf dem die Schanze **steht**.
   *
   * Sie wird einmal gemessen, wenn der Sampler da ist, und danach nie wieder.
   * Genau das macht die Schanze zu einem Bauwerk statt zu einer Beule: ihre
   * Fläche ist eine Ebene über einer *festen* Höhe, nicht eine Auflage auf einem
   * welligen Boden.
   */
  baseY: number;
}

export class RampField {
  readonly ramps: readonly Ramp[];
  readonly #prepared: Prepared[];
  #ready = false;

  constructor(ramps: readonly Ramp[] = RAMPS) {
    this.ramps = ramps;
    this.#prepared = ramps.map((ramp) => ({
      ramp,
      sin: Math.sin(ramp.heading),
      cos: Math.cos(ramp.heading),
      // Der Bezugspunkt ist die **Kante**, die Auffahrt liegt dahinter. Die
      // Reichweite muss beides fassen, plus die halbe Breite.
      reach: Math.hypot(Math.max(ramp.length, ramp.tail), ramp.width / 2) + 2,
      baseY: 0,
    }));
  }

  /**
   * Die Fußhöhen aus dem Gelände holen — einmal, sobald der Sampler da ist.
   *
   * > **Der erste Entwurf hatte das nicht, und die Schanzen waren unbrauchbar.**
   * > Er addierte die Auflage auf das Gelände: `y = Gelände(x,z) + lift(s,t)`.
   * > Auf einer erodierten Karte heißt das, dass die Schanze jede Welle ihres
   * > Untergrunds mitmacht — und ein 24 m langes Stück Straßenböschung mit
   * > weniger als 1,2 m Höhenband gibt es hier praktisch nicht: das
   * > Suchwerkzeug `tools/find-ramps.mjs` fand auf **11 km Straße genau einen**
   * > brauchbaren Platz.
   * >
   * > Eine echte Schanze steht auf einem Fundament. Seitdem ist die Fläche eine
   * > **absolute** Höhe über `baseY`, und der Boden darunter darf so wellig sein,
   * > wie er will. Nebenwirkung, die gewollt ist: die Auffahrt schneidet sich in
   * > einen ansteigenden Hang, statt auf ihm zu reiten.
   */
  prepare(heightAt: (x: number, z: number) => number): void {
    for (const p of this.#prepared) {
      // Am **Fuß** der Auffahrt gemessen und nicht an der Kante: dort beginnt
      // das Bauwerk, und dort soll es bündig mit dem Boden abschließen.
      const fx = p.ramp.x - p.sin * p.ramp.length;
      const fz = p.ramp.z - p.cos * p.ramp.length;
      p.baseY = heightAt(fx, fz);
    }
    this.#ready = true;
  }

  get ready(): boolean {
    return this.#ready;
  }

  /** Fußhöhe einer Schanze — für das Mesh. */
  baseOf(ramp: Ramp): number {
    return this.#prepared.find((p) => p.ramp === ramp)?.baseY ?? 0;
  }

  /**
   * Wie viel die Schanzen den Boden an dieser Stelle anheben, in Metern.
   *
   * **Das Maximum und keine Summe.** Zwei sich überlappende Schanzen ergäben
   * sonst eine doppelt so hohe — und zwar genau dort, wo sie sich berühren, also
   * an einer Stelle, an der niemand damit rechnet. Das Maximum ist die
   * Vereinigung zweier Körper, und das ist die anschauliche Antwort.
   *
   * Läuft rund 25-mal je Simulationsschritt (Räder, Hülle, Schwerpunkt) und
   * einmal je Kamerapunkt. Bei fünf Schanzen sind das fünf Abstandsprüfungen —
   * der frühe Ausstieg über `reach` macht daraus zwei Multiplikationen für den
   * Normalfall „nicht in der Nähe".
   */
  /**
   * Die **absolute** Höhe der Schanzenfläche an dieser Stelle, oder
   * `-Infinity`, wenn dort keine Schanze ist.
   *
   * `RoadGround.height()` nimmt davon das Maximum mit dem Boden. Das ist die
   * Vereinigung zweier Körper — und zugleich die Antwort auf zwei sich
   * überlappende Schanzen, die dann keine doppelt hohe ergeben.
   */
  surfaceAt(x: number, z: number): number {
    let best = -Infinity;
    for (const p of this.#prepared) {
      const dx = x - p.ramp.x;
      const dz = z - p.ramp.z;
      if (dx * dx + dz * dz > p.reach * p.reach) continue;
      // In Schanzenkoordinaten: `s` längs der Anfahrt (positiv = hinter der
      // Kante), `t` quer. Dieselbe Basis wie im Fahrzeug — `forward = (sin, cos)`,
      // `right = (−cos, sin)`.
      const s = dx * p.sin + dz * p.cos;
      const t = -dx * p.cos + dz * p.sin;
      const lift = liftLocal(p.ramp, s, t);
      if (lift <= 0) continue;
      const y = p.baseY + lift;
      if (y > best) best = y;
    }
    return best;
  }

  /**
   * Der Gradient der Auflage, `∂lift/∂x` und `∂lift/∂z`.
   *
   * ## Warum die Normale die Schanze kennen muss
   *
   * `RoadGround.normal()` liefert die Geländenormale, und die weiß von der
   * Schanze nichts. Solange sie das nicht tut, ist eine Schanze für das
   * Fahrmodell eine Fläche, die *ansteigt, ohne schräg zu sein* — und das trifft
   * ausgerechnet die Stützebene aus P20: `#wheelTilt` rechnet die Radhöhen auf
   * die Hangebene zurück, und ohne Neigung sieht sie eine Vorderachse, die
   * `Radstand · tan θ` zu hoch steht.
   *
   * Beim Coupé (2,4 m Radstand, 0,54 m Reichweite) reißt das ab 12,7°; die
   * steilste Schanze der Karte hat 15,4°. Ohne diesen Gradienten wäre die
   * Vorderachse dort **unerreichbar**, die Federkraft null, `airborne` wahr —
   * und ein Auto ohne Radlast hat keinen Antrieb. Es bliebe an der Schanze
   * stehen, die es hinauffahren soll.
   *
   * Zentrale Differenz über 0,4 m: fein genug für die Kante, grob genug, dass
   * die seitliche Schräge (`RAMP_EDGE_FADE`) nicht als Wand erscheint. Vier
   * `lift`-Aufrufe, und die kosten nur dort etwas, wo eine Schanze steht.
   */
  gradient(x: number, z: number, out: { x: number; z: number }): boolean {
    const here = this.surfaceAt(x, z);
    if (here === -Infinity) return false;
    const h = 0.2;
    // Außerhalb der Schanze liefert `surfaceAt` −∞; dort wird der Wert am
    // Mittelpunkt eingesetzt, sonst wäre der Gradient an der Kante unendlich.
    const sub = (v: number): number => (v === -Infinity ? here : v);
    out.x = (sub(this.surfaceAt(x + h, z)) - sub(this.surfaceAt(x - h, z))) / (2 * h);
    out.z = (sub(this.surfaceAt(x, z + h)) - sub(this.surfaceAt(x, z - h))) / (2 * h);
    return true;
  }

  /** Liegt der Punkt auf einer Schanze? Für die Anzeige und den Prüfstand. */
  rampAt(x: number, z: number): Ramp | null {
    for (const p of this.#prepared) {
      const dx = x - p.ramp.x;
      const dz = z - p.ramp.z;
      if (dx * dx + dz * dz > p.reach * p.reach) continue;
      const s = dx * p.sin + dz * p.cos;
      const t = -dx * p.cos + dz * p.sin;
      if (liftLocal(p.ramp, s, t) > 0.05) return p.ramp;
    }
    return null;
  }
}

/**
 * Die Auflage einer einzelnen Schanze in ihren eigenen Koordinaten.
 *
 * Getrennt von der Schleife, weil `StuntSystem` sie für das Mesh **direkt**
 * braucht: es tastet eine Schanze in ihrem eigenen Raster ab und will dabei
 * nicht die anderen vier mitprüfen.
 */
export function liftLocal(ramp: Ramp, s: number, t: number): number {
  const half = ramp.width / 2;
  const at = Math.abs(t);
  if (at > half) return 0;

  // Seitliche Schräge — Begründung bei `RAMP_EDGE_FADE`.
  const fade = half * RAMP_EDGE_FADE;
  const across = at <= half - fade ? 1 : smoothstep((half - at) / fade);

  let along: number;
  if (s <= -ramp.length) return 0;
  if (s < 0) {
    along = smoothstep((s + ramp.length) / ramp.length);
  } else if (ramp.tail > 0) {
    if (s >= ramp.tail) return 0;
    along = smoothstep(1 - s / ramp.tail);
  } else {
    // Abrisskante: hinter der Kante ist nichts mehr.
    return 0;
  }

  return ramp.height * along * across;
}

/** `3t² − 2t³` auf 0…1. Steigung null an beiden Enden — kein Knick am Fuß. */
function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}
