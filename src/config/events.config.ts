import type { VehicleId } from './vehicles.config';

/**
 * Die Veranstaltungen der Karte — P23.
 *
 * ## Warum es sie gibt
 *
 * Bis P22 konnte man auf dieser Karte **fahren**, und mehr nicht. Es gab einen
 * Rundenzähler auf der Ringstraße (P9.3), eine Bestzeit (P16) — und keinen
 * Grund, eine zweite Runde zu fahren. Auf einem Portal ist das die häufigste
 * Todesursache: die Welt ist schön, der Spieler fährt zwei Minuten, und dann
 * fehlt die Antwort auf „und jetzt?".
 *
 * Eine Veranstaltung ist die Antwort. Sie hat einen Anfang, ein Ende, eine Zahl
 * am Ende und eine Belohnung.
 *
 * ## Warum die Strecken aus `roads.json` kommen und nicht aus einer eigenen Datei
 *
 * Die acht Strecken dieser Karte sind vom Generator trassiert, verrundet und ins
 * Gelände geschnitten (P3, P8.5, P8.11). Eine Rennstrecke daneben zu legen hieße,
 * eine zweite Geometrie zu pflegen, die beim nächsten `npm run world` nicht
 * mitwandert — genau die Doppelung, an der dieses Projekt schon zweimal
 * auseinandergelaufen ist. Eine Veranstaltung nennt deshalb eine **Strecken-ID**
 * und einen Abschnitt darauf, sonst nichts.
 *
 * ## Die Namen sind englisch
 *
 * Der Code dieses Projekts ist deutsch und bleibt es. Alles, was ein **Spieler**
 * liest, ist seit P23 englisch: CrazyGames' Publikum ist global, und eine
 * deutschsprachige Oberfläche kostet dort den größten Teil der Reichweite. Die
 * Trennlinie verläuft am DOM — was in `src/ui/` landet, ist englisch, was in
 * einem Kommentar steht, nicht.
 */

export type EventKind = 'race' | 'timeTrial' | 'drift';

export interface RaceEvent {
  readonly id: string;
  /** Name in der Oberfläche — englisch. */
  readonly name: string;
  /** Eine Zeile Charakter, englisch. */
  readonly blurb: string;
  readonly kind: EventKind;
  /** Strecken-ID aus `roads.json`. */
  readonly road: string;
  /**
   * Rückwärts fahren?
   *
   * Der Bergpass ist im Datensatz von unten nach oben trassiert. Bergab zu
   * fahren ist die Disziplin, für die SPEC §2.1 ihn ausweist („Drift-Strecke") —
   * also läuft die Abfahrt rückwärts über dieselbe Linie.
   */
  readonly reverse: boolean;
  /** Runden. Bei offenen Strecken immer 1. */
  readonly laps: number;
  /** Zahl der Gegner, 0…3. */
  readonly rivals: number;
  /** Welches Fahrzeug die Gegner fahren. */
  readonly rivalVehicle: VehicleId;
  /** Anzahl der Kontrollpunkte über die ganze Distanz. */
  readonly checkpoints: number;
  /** Preisgeld für Platz 1, 2, 3, 4. */
  readonly reward: readonly number[];
  /**
   * Zielzeit in Sekunden für Gold / Silber / Bronze — nur bei `timeTrial`.
   *
   * **Sie sind gemessen und nicht geschätzt**, und zwar mit
   * `tools/bench/lap.mts`: das Werkzeug fährt die Strecke mit demselben
   * KI-Regler, der auch die Gegner fährt, bei drei Könnensstufen. Eine
   * Zielzeit, die niemand gefahren ist, ist eine Behauptung — und in diesem
   * Projekt gibt es dafür ein eigenes Kapitel in CLAUDE.md.
   */
  readonly medals?: readonly [number, number, number];
}

/**
 * Wie weit ein Kontrollpunkt zählt, in Metern über die halbe Fahrbahnbreite
 * hinaus.
 *
 * **Großzügig, und das ist eine Entscheidung über die Zielgruppe.** Ein enges
 * Tor ist die Sorte Regel, die einen Gelegenheitsspieler eine Runde kostet, ohne
 * dass er versteht warum. 14 m über die halbe Fahrbahn hinaus heißt: wer im
 * Bankett oder auf dem Grünstreifen daneben durchfährt, hat den Punkt. Wer 40 m
 * quer über die Wiese abkürzt, nicht.
 */
export const CHECKPOINT_SLACK = 14;

/**
 * Wie viel eine Sekunde Bestzeit wert ist und was ein Drift-Punkt einbringt.
 *
 * Die Währung heißt **Yen** — sie passt zur Karte, und ein vierstelliger Betrag
 * liest sich wie eine Belohnung, wo ein dreistelliger nach Trostpreis aussieht.
 */
export const DRIFT_YEN_PER_POINT = 0.5;

export const EVENTS: readonly RaceEvent[] = [
  {
    id: 'coast-loop',
    name: 'Coast Loop',
    blurb: 'One lap of the ring road. Sea on one side, rice fields on the other.',
    kind: 'race',
    road: 'ring',
    reverse: false,
    laps: 1,
    rivals: 3,
    rivalVehicle: 'touge',
    // 6096 m auf 12 Punkte sind rund 500 m Abstand — weit genug, dass die
    // Anzeige nicht flackert, eng genug, dass eine Abkürzung auffällt.
    checkpoints: 12,
    reward: [2500, 1400, 800, 400],
  },
  {
    id: 'touge-descent',
    name: 'Tōge Descent',
    blurb: 'Nine hairpins, 450 m down. The road this map was built for.',
    kind: 'race',
    road: 'toge',
    reverse: true,
    laps: 1,
    rivals: 3,
    rivalVehicle: 'touge',
    checkpoints: 8,
    reward: [3000, 1700, 950, 450],
  },
  {
    id: 'neon-circuit',
    name: 'Neon Circuit',
    blurb: 'Two laps through the city block. Tight, wet, lit.',
    kind: 'race',
    road: 'stadt',
    reverse: false,
    laps: 2,
    rivals: 3,
    rivalVehicle: 'gt',
    checkpoints: 6,
    reward: [2800, 1600, 900, 420],
  },
  {
    id: 'touge-climb',
    name: 'Tōge Climb',
    blurb: 'The same nine hairpins, uphill. Bring torque.',
    kind: 'race',
    road: 'toge',
    reverse: false,
    laps: 1,
    rivals: 3,
    rivalVehicle: 'offroad',
    checkpoints: 8,
    reward: [3000, 1700, 950, 450],
  },
  {
    id: 'ring-trial',
    name: 'Ring Time Trial',
    blurb: 'One lap, no rivals, no excuses.',
    kind: 'timeTrial',
    road: 'ring',
    reverse: false,
    laps: 1,
    rivals: 0,
    rivalVehicle: 'touge',
    checkpoints: 12,
    reward: [2000, 1200, 700, 0],
  },
  {
    id: 'touge-drift',
    name: 'Tōge Drift Run',
    blurb: 'Score as much as you can on the way down. Bank it at the bottom.',
    kind: 'drift',
    road: 'toge',
    reverse: true,
    laps: 1,
    rivals: 0,
    rivalVehicle: 'touge',
    checkpoints: 8,
    reward: [0, 0, 0, 0],
  },
];

export function findEvent(id: string): RaceEvent | undefined {
  return EVENTS.find((e) => e.id === id);
}
