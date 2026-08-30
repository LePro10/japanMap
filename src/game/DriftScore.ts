import {
  DRIFT_MAX_ANGLE,
  DRIFT_MIN_SPEED,
  DRIFT_SCORE_ANGLE,
} from '@/config/arcade.config';
import type { VehicleTelemetry } from './Vehicle';

/**
 * Die Driftwertung — P23.
 *
 * ## Warum eine Wertung und nicht bloß eine Anzeige
 *
 * Ein Drift, der nichts einbringt, wird einmal ausprobiert. Ein Drift, der eine
 * Zahl hochzählt, wird geübt. Das ist der ganze Unterschied zwischen einem
 * Fahrmodell mit Drift und einem *Drift-Spiel*, und es ist der Grund, warum
 * `Drift Hunters` auf CrazyGames seit Jahren in den Charts steht.
 *
 * ## Die Formel
 *
 * ```
 *   Punkte/s = Winkelanteil · Tempoanteil · Basisrate · Multiplikator
 * ```
 *
 * Drei Größen, und jede beantwortet eine eigene Frage:
 *
 *  - **Winkel** — wie quer? Unter `DRIFT_SCORE_ANGLE` (12°) ist es eine schnell
 *    gefahrene Kurve und zählt nicht; über `DRIFT_MAX_ANGLE` (80°) ist es ein
 *    Dreher und zählt ebenfalls nicht. Dazwischen linear.
 *  - **Tempo** — wie schnell? Ohne diesen Faktor ist die billigste Punktequelle
 *    ein Wagen, der mit 20 km/h im Kreis eiert.
 *  - **Multiplikator** — wie lange am Stück? Er ist das, was aus einer Kurve
 *    eine *Kette* macht.
 *
 * ## Die Kette bricht, und das ist der Punkt
 *
 * Ein Multiplikator, der nur wächst, ist eine Anzeige und kein Risiko. Er fällt
 * hier bei drei Anlässen auf 1 zurück:
 *
 *  1. **Zu lange kein Drift** (`GRACE`). Kurz genug, dass eine Gerade zwischen
 *     zwei Kurven die Kette nicht killt, lang genug, dass Herumstehen sie nicht
 *     hält.
 *  2. **Anschlag.** Wer eine Leitplanke trifft, verliert die Kette. Ohne diese
 *     Regel ist die beste Drift-Linie die an der Wand entlang.
 *  3. **Dreher.** Über `DRIFT_MAX_ANGLE` hinaus ist der Lauf vorbei.
 *
 * Die **offene** Kette wird getrennt geführt (`pending`) und erst beim Ende der
 * Kette gutgeschrieben. Das ist die Mechanik, an der die Spannung hängt: auf dem
 * Bildschirm steht eine Zahl, die man noch verlieren kann.
 */

/** Punkte je Sekunde bei vollem Winkel, vollem Tempo und Multiplikator 1. */
const BASE_RATE = 180;
/** Tempo, ab dem der Tempoanteil voll zählt, m/s. */
const FULL_SPEED = 33;
/** So lange darf eine Kette ohne Drift überleben, s. */
const GRACE = 1.6;
/** Wie schnell der Multiplikator wächst, je Sekunde im Drift. */
const MULT_RATE = 0.32;
const MULT_MAX = 5;

export interface DriftState {
  /** Gutgeschriebene Punkte. */
  readonly banked: number;
  /** Punkte der laufenden Kette — noch nicht sicher. */
  readonly pending: number;
  readonly multiplier: number;
  /** Läuft gerade eine Kette? */
  readonly active: boolean;
  /** Warum die letzte Kette endete — für die Anzeige. */
  readonly lastBreak: 'none' | 'banked' | 'crash' | 'spin';
  /** Punkte der zuletzt beendeten Kette. */
  readonly lastChain: number;
}

export class DriftScore {
  #banked = 0;
  #pending = 0;
  #multiplier = 1;
  #idle = 0;
  #active = false;
  #lastBreak: DriftState['lastBreak'] = 'none';
  #lastChain = 0;
  /** Kontaktzähler des letzten Schritts — ein Anstieg ist ein Anschlag. */
  #contacts = 0;
  /**
   * Zonenfaktor — 2 in einer Driftzone, sonst 1 (P24).
   *
   * Er multipliziert die **Rate** und nicht den Multiplikator: eine Zone, die
   * den Multiplikator hochsetzt, würde ihn beim Verlassen wieder abschneiden,
   * und ein Multiplikator, der von allein fällt, sieht aus wie ein Fehler.
   */
  #bonus = 1;

  setBonus(bonus: number): void {
    this.#bonus = bonus;
  }

  get bonus(): number {
    return this.#bonus;
  }

  reset(): void {
    this.#bonus = 1;
    this.#banked = 0;
    this.#pending = 0;
    this.#multiplier = 1;
    this.#idle = 0;
    this.#active = false;
    this.#lastBreak = 'none';
    this.#lastChain = 0;
    this.#contacts = 0;
  }

  get state(): DriftState {
    return {
      banked: this.#banked,
      pending: this.#pending,
      multiplier: this.#multiplier,
      active: this.#active,
      lastBreak: this.#lastBreak,
      lastChain: this.#lastChain,
    };
  }

  get total(): number {
    return this.#banked + this.#pending;
  }

  /**
   * Ein Schritt der Wertung.
   *
   * Läuft im **festen** Schritt, weil Punkte je Sekunde gezählt werden und eine
   * Wertung, die an der Bildrate hängt, auf einem 144-Hz-Bildschirm mehr
   * einbringt. Dieselbe Begründung wie beim `LapTimer` („die Zeit kommt aus dem
   * Simulationsschritt, nicht von der Uhr").
   */
  step(dt: number, t: VehicleTelemetry): void {
    const angle = Math.abs(t.slip);
    const spun = angle > DRIFT_MAX_ANGLE;
    const crashed = t.contacts > 0 && this.#contacts === 0;
    this.#contacts = t.contacts;

    const scoring =
      !t.airborne &&
      !spun &&
      angle > DRIFT_SCORE_ANGLE &&
      t.speed > DRIFT_MIN_SPEED;

    if (crashed && this.#active) {
      this.#end('crash');
      return;
    }
    if (spun && this.#active) {
      this.#end('spin');
      return;
    }

    if (scoring) {
      this.#active = true;
      this.#idle = 0;
      const angleShare = Math.min(
        1,
        (angle - DRIFT_SCORE_ANGLE) / (DRIFT_MAX_ANGLE * 0.6 - DRIFT_SCORE_ANGLE),
      );
      const speedShare = Math.min(1, t.speed / FULL_SPEED);
      this.#pending += BASE_RATE * angleShare * speedShare * this.#multiplier * this.#bonus * dt;
      this.#multiplier = Math.min(MULT_MAX, this.#multiplier + MULT_RATE * dt);
      return;
    }

    if (!this.#active) return;
    this.#idle += dt;
    if (this.#idle > GRACE) this.#end('banked');
  }

  /** Die offene Kette gutschreiben — Streckenende, Menü, Respawn. */
  bank(): void {
    if (this.#active) this.#end('banked');
  }

  #end(reason: DriftState['lastBreak']): void {
    this.#lastChain = Math.round(this.#pending);
    // **Ein Anschlag kostet die Kette, nicht das Konto.** Wer nach drei Minuten
    // Drift einmal die Planke streift, soll den Lauf nicht von vorn anfangen —
    // das ist die Sorte Strafe, nach der ein Gelegenheitsspieler den Tab
    // schließt. Verloren ist, was noch nicht gutgeschrieben war, und das ist
    // Strafe genug: auf dem Bildschirm stand die Zahl.
    if (reason === 'banked') this.#banked += this.#pending;
    this.#pending = 0;
    this.#multiplier = 1;
    this.#active = false;
    this.#idle = 0;
    this.#lastBreak = reason;
  }
}
