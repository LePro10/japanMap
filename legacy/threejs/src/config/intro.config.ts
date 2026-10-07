/**
 * Das Intro — „First Drive".
 *
 * ## Warum es das gibt
 *
 * Bis hierher stand ein neuer Spieler nach „Play" zu Fuß auf einer Wiese,
 * neben einem Auto, mit einem Satz „Your car. Take it out." Kein Wort über
 * Nitro, Drift, den Doppeltipp, die Garage oder wohin er überhaupt fahren
 * soll — alles, was dieses Spiel ausmacht, stand in einer Tastentabelle im
 * Pausenmenü.
 *
 * Das Muster ist das der großen Open-World-Rennspiele (Forza Horizon beginnt
 * mit einer Fahrt, nicht mit einem Menü): **man sitzt schon im fahrenden
 * Wagen**, lernt jede Aktion in dem Moment, in dem sie gebraucht wird, und
 * landet am Ende in der Basis. Eine Aktion je Hinweis, jeder Schritt läuft nach
 * einer Frist auch ohne Eingabe weiter — ein Intro, das auf den Spieler
 * wartet, ist eine Wand.
 *
 * ## Die Zahlen
 *
 * Wie überall: Herleitung, Messung oder ausdrücklich gewählt.
 */

/** `localStorage`-Schlüssel: gesetzt = Intro gesehen oder übersprungen. */
export const INTRO_STORAGE_KEY = 'japanmap.intro.done';

export const INTRO = {
  /**
   * Die Schanze des Absprungs. `coast-kicker` liegt 330 m von der Sakura
   * Commons — die nächste Schanze zur Basis, der Heimweg ist damit eine
   * Minute Fahrt und keine Überlandtour. Gemessen trägt sie „120 km/h an der
   * Kante aus 140" (Kommentar in `stunt.config.ts`).
   */
  rampId: 'coast-kicker',
  /**
   * Anlauf vor der Kante, in Metern. `find-ramps.mjs` garantiert 130 m gerade
   * Anfahrt; 150 m davor beginnt die Linie auf demselben Wiesenstreifen.
   * Gewählt: lang genug für Titel und zwei Hinweise, kurz genug, dass das Bild
   * nach vier Sekunden schon auf die Schanze zuhält.
   */
  runUp: 150,
  /** Rollender Start, m/s (~95 km/h). Stillstand am Anfang eines Intros ist tot. */
  startSpeed: 26.5,
  /** Zeitlupe in der Luft, Anteil der Echtzeit. */
  airSlow: 0.16,
  /** Während der Rolle — schneller, damit die Drehung sichtbar abläuft. */
  rollSlow: 0.5,
  /** So lange (Echtzeit, s) wartet die Zeitlupe auf den Doppeltipp. */
  airWait: 2.8,
  /** Angleichung des Zeitfaktors, 1/s. 8 → 90 % in 0,29 s. */
  slowRate: 8,
  /** Titelkarte, s. */
  titleSeconds: 2.6,
  /** Ab hier (m vor der Kante) fragt das Intro nach Nitro. */
  nitroAt: 95,
  /**
   * Hat der Spieler Nitro nicht gefunden, zündet es hier von selbst (m vor der
   * Kante). Die Schanze braucht das Tempo — ein Spieler, der bei 95 km/h
   * abhebt, landet vor der Kante des Gefälles und sieht keine Zeitlupe.
   */
  autoNitroAt: 40,
  /** Spurhilfe beim Anlauf: Querabstand (1/m) und Winkel (1/rad). */
  assistCross: 0.09,
  assistHeading: 1.5,
  /** Größter Lenkausschlag der Hilfe. */
  assistMax: 0.55,
  /** Anteil der Spielerlenkung beim Anlauf — er darf wackeln, nicht vorbei. */
  playerSteer: 0.35,
  /**
   * Nach der Landung wird ohne Eingabe auf dieses Tempo gebremst, m/s
   * (~65 km/h). Schnell genug für einen Handbremsdrift (`STUNT.minSpeed` ist
   * 30 km/h), langsam genug, dass die Wende vor dem Ortsrand gelingt.
   */
  turnSpeed: 18,
  /** Drift-Schritt: so lange muss gedriftet werden, s. */
  driftHold: 0.7,
  /** … und spätestens nach so vielen Sekunden geht es weiter. */
  driftTimeout: 14,
  /** Belohnungen, Sparks. Reicht nach dem Intro für ein erstes Teil (Street). */
  reward: { landing: 500, roll: 500, drift: 500, arrive: 1500 },
  /** Tab so lange halten, um zu überspringen, s. */
  skipHold: 0.9,
} as const;
