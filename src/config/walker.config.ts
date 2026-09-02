/**
 * Zu Fuß — der Spieler neben dem Auto.
 *
 * ## Warum es das gibt
 *
 * Bis hierher war der Spieler das Auto, oder er flog. Aussteigen gab es nicht:
 * `V` schaltete zwischen Freiflug und Fahrt, und der Wagen verschwand. Ein
 * Driftspiel, das auf einer 9,4-km²-Karte mit Kirschbäumen, Tempel und Stadt
 * spielt, braucht den Körper dazwischen — sonst ist die Schale in der
 * Driftzone nur etwas, das man *überfährt*.
 *
 * ## Warum gerechnete Geometrie, nicht ein Modell
 *
 * Dieselbe Rechnung wie bei den Fahrzeugen in `carMesh.ts`: der Startdownload
 * liegt über der Schwelle aus SPEC §4, und die Formensprache der Karte ist
 * flächig (`flatShading`, Vertexfarbe, Look aus dem Licht). Ein Fremdmodell
 * mit Skinning wäre ein zweites Material, ein zweiter Shader und ein
 * Download, den die Autos bewusst nicht haben. Ein Fahrer aus Kästen und
 * Zylindern steht neben einem Auto aus Kästen und Zylindern und gehört
 * dahin.
 *
 * ## Die Zahlen
 *
 * Jede Zahl hier ist eine von dreien: Herleitung, Messung, oder ausdrücklich
 * gewählt. Es gibt keine vierte Sorte — dieselbe Regel wie in
 * `vehicle.config.ts`.
 */

import { DRIFT_ZONES } from './stunt.config';
import { GRAVITY } from './vehicle.config';

/**
 * Die Sakura-Schale, in der die Sitzung beginnt.
 *
 * Nicht `DRIFT_ZONES[0]` über den Index: die Reihenfolge in der Datei ist
 * keine API. Die Schale heißt `sakura-bowl` und liegt zwischen Stadt und
 * Küste — das ist der Kreis aus Kirschbäumen, den der Spieler meint.
 */
export const WALK_SPAWN_ZONE_ID = 'sakura-bowl';

export function walkSpawnZone(): (typeof DRIFT_ZONES)[number] {
  const zone = DRIFT_ZONES.find((entry) => entry.id === WALK_SPAWN_ZONE_ID);
  if (!zone) {
    throw new Error(`Zu-Fuß-Start: Driftzone „${WALK_SPAWN_ZONE_ID}" fehlt.`);
  }
  return zone;
}

/**
 * Wie weit der Start vom Mittelpunkt der Schale liegen darf, in Metern.
 *
 * Die Bäume stehen auf dem Ring (Radius 62 m). Wer genau in der Mitte
 * spawnt, steht jedes Mal auf demselben Fleck; wer zu weit außen spawnt,
 * steht im Baumring. 8…22 m ist innen im offenen Boden, nah genug an den
 * Laternen, dass die Schale im ersten Blick da ist.
 *
 * Gewählt, nicht gemessen — die Messung ist „steht die Figur in der Schale",
 * und die macht `tools/bench/walker.mts`.
 */
export const WALK_SPAWN_INNER = 8;
export const WALK_SPAWN_OUTER = 22;

/**
 * Abstand der Figur zur Fahrzeugmitte beim Aussteigen, in Metern.
 *
 * Halbe Karosseriebreite (~0,8 m) plus eine Schulterbreite und eine Handbreit
 * Luft: 0,8 + 0,45 + 0,25 = 1,5. Japanisches Rechtslenker: die Fahrertür ist
 * rechts, also steigt man nach **+X** im Fahrzeugsystem aus.
 */
export const WALK_ALIGHT_GAP = 1.55;

/** So nah muss man am Auto stehen, um einzusteigen, in Metern. */
export const WALK_BOARD_RANGE = 4.2;

/**
 * Extra-Meter, die der Einsteige-Hinweis nach dem Erscheinen noch hält.
 *
 * Ohne sie flackert der Chip an der 4,2-m-Kante: ein Schritt rein, ein
 * Schritt raus, 60 Hz `hidden`. 0,8 m ist weniger als ein Schritt, also
 * merkt man die Hysterese nicht als falsche Reichweite.
 */
export const WALK_PROMPT_SLACK = 0.8;

export const WALKER = {
  /**
   * Augenhöhe / Körperhöhe. 1,72 m — etwas unter dem europäischen Mittel,
   * in der Größenordnung eines japanischen Fahrers der späten Achtziger,
   * und klein genug, dass die Figur neben dem 1,48 m hohen Coupé nicht
   * wie ein Riese wirkt.
   */
  height: 1.72,
  /** Kapselradius in der Taille. Schulterbreite ~0,42 m, also Radius 0,21
   * plus Kleidung. 0,24 lässt eine Türlücke, ohne durch Leitplanken zu
   * schlüpfen. */
  radius: 0.24,
  /** Schwerpunkt über den Sohlen. Rund 55 % der Höhe — Stehen, nicht Hocken. */
  cgHeight: 0.95,

  /**
   * Gehen, in m/s.
   *
   * 4,4 ist ein zügiger Schritt, kein Schlendern: die Karte ist 9,4 km², und
   * ein Spaziergang von 1,4 m/s (Normschritt) würde die Schale zur Stadt
   * zur Minute machen. Gewählt gegen das Gefühl, nicht gegen eine Messung —
   * die Messung sagt nur, dass die Figur bei Vollgas diese Zahl hält.
   */
  walkSpeed: 4.4,
  /** Sprint (Shift). Faktor 1,7 auf den Schritt: 7,5 m/s, ein lockerer Lauf. */
  runSpeed: 7.5,
  /**
   * Beschleunigung am Boden, m/s².
   *
   * 18: aus dem Stand in 0,24 s auf Schrittgeschwindigkeit. Härter fühlt sich
   * nach Rutschen an, weicher nach Eis. Gewählt.
   */
  accel: 18,
  /** Ausrollen am Boden, 1/s. Höher = bleibt schneller stehen. */
  brake: 12,
  /** Luftsteuerung als Anteil der Bodenbeschleunigung. */
  airControl: 0.28,

  /**
   * Absprunggeschwindigkeit senkrecht, m/s.
   *
   * `h = v² / (2g)` → 4,6² / 19,62 = **1,08 m**. Gemessen
   * `tools/bench/walker.mts`: Spitze **1,04 m**, landet. Die 4 cm sind der
   * erste Schritt — die Schwerkraft greift noch in dem Frame, in dem der
   * Absprung gesetzt wird. Hoch genug für den Bürgersteig (15 cm), kein Flug.
   */
  jumpSpeed: 4.6,
  /** Coyote-Zeit: so lange nach Verlassen der Kante geht der Sprung noch. */
  coyote: 0.1,
  /** Sprungpuffer: Taste kurz vor der Landung merken, in Sekunden. */
  jumpBuffer: 0.1,

  gravity: GRAVITY,

  /**
   * Steiler als das gilt der Boden als Wand, nicht als Standfläche.
   *
   * 0,55 ≈ 57°. Unter `STEEP_NY` (0,78 ≈ 39°) der Fahrzeuge: ein Mensch
   * steigt einen Hang, den ein Auto nicht fährt. Darüber rutscht er.
   */
  minNy: 0.55,

  /** Wie hoch eine Stufe sein darf, die man noch nimmt, in Metern. */
  stepHeight: 0.38,
} as const;

export const WALK_CAMERA = {
  /** Abstand hinter der Figur, in Metern. Näher als das Auto: die Figur ist
   * 1,7 m, das Auto 4,2 m — derselbe Bildanteil verlangt weniger Arm. */
  distance: 4.1,
  height: 1.55,
  targetHeight: 1.28,
  lookSensitivity: 0.0026,
  /**
   * Nick des Blicks, positiv = Himmel. Dieselbe Konvention wie die
   * Verfolgerkamera — Boom `height − distance·sin(pitch)`, Grenzen getauscht
   * gegen die alte Kamerahöhen-Konvention, damit der Bewegungsraum bleibt.
   */
  pitchMin: -0.85,
  pitchMax: 0.45,
  positionRate: 9,
  lookRate: 13,
  groundClearance: 0.45,
  fov: 58,
  /**
   * Kopf-Wippen, Meter bei Schrittgeschwindigkeit. `walker.cycle` ist
   * gelaufene Strecke; eine Periode von 0,75 m ist ein Schritt. 3,5 cm sind
   * auf Augenhöhe sichtbar und nicht seekrank.
   */
  bob: 0.035,
  /** Bogenmaß je Meter Gang. 2π / 0,75 ≈ 8,4 — ein Nicken je Schritt. */
  bobFreq: 8.4,
} as const;

/**
 * Einheitlicher Zufall aus einem Seed — einmal je Sitzung, nicht je Frame.
 *
 * Mulberry32. Nicht `Math.random()`: der Spawn muss im Prüfstand
 * reproduzierbar sein, und eine Sitzung, die denselben Seed bekommt, muss
 * denselben Fleck liefern. Der Play-Knopf setzt den Seed aus `Date.now()`.
 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return (): number => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WalkSpawn {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly seed: number;
}

/**
 * Einen Startpunkt in der Sakura-Schale würfeln.
 *
 * Polar um den Mittelpunkt, Radius zwischen `WALK_SPAWN_INNER` und
 * `WALK_SPAWN_OUTER`. Die Figur steht **rechts** neben dem Auto (Fahrertür),
 * das Auto schaut in eine zufällige Richtung — „immer ungefähr da", nicht
 * immer auf demselben Pixel.
 *
 * Gemessen über 40 Seeds: 8,0…20,5 m vom Mittelpunkt, kein Ausreißer.
 */
export function rollWalkSpawn(seed: number): WalkSpawn {
  const zone = walkSpawnZone();
  const rng = mulberry32(seed);
  const angle = rng() * Math.PI * 2;
  const radius = WALK_SPAWN_INNER + rng() * (WALK_SPAWN_OUTER - WALK_SPAWN_INNER);
  const heading = rng() * Math.PI * 2;
  return {
    x: zone.x + Math.cos(angle) * radius,
    z: zone.z + Math.sin(angle) * radius,
    heading,
    seed,
  };
}
