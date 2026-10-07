/**
 * Die Zahlen der Tonschicht — P16.
 *
 * ## Warum synthetisiert und nicht aufgenommen
 *
 * Das Projekt hatte bis hier **keinen einzigen Ton** (`grep -rli "audio|sound|
 * AudioContext"` über `src/`: null Treffer), und die Zielplattform CrazyGames
 * wiegt den Startdownload: ≤ 20 MB für die Mobile-Homepage, und P15 hat sie mit
 * 17,02 MB und 3 MB Abstand gerade erst geholt.
 *
 * Ein brauchbarer Motorenteppich aus Aufnahmen kostet je nach Schleifenlänge 1
 * bis 3 MB — das wäre der Abstand. Vollständig synthetisierter Ton kostet
 * **0 Byte Download** und ein paar Oszillatoren Rechenzeit. Für eine Arcade-
 * Fahrschicht ist das kein Kompromiss: der Motorklang eines Arcade-Spiels ist
 * ohnehin ein Sägezahn mit Filter, keine Aufnahme eines echten Motors.
 *
 * Was damit **nicht** geht, gehört dazugesagt: Umgebungsgeräusche mit Charakter
 * (Zikaden, Wind in Bäumen, Stadtgeräusch) sind so nicht herzustellen. Wenn die
 * dazukommen sollen, kostet das Download und gehört dann gegen die Schwelle
 * gerechnet.
 */

import type { EngineVoiceProfile } from '@/audio/dsp/engineVoice';
import type { VehicleId } from './vehicles.config';

export const AUDIO = {
  /**
   * Grundlautstärke, bevor der Nutzer etwas einstellt.
   *
   * Bewusst unter der Hälfte: ein Spiel auf einem Portal startet in einem Tab
   * neben anderen, und der erste Eindruck „zu laut" kostet mehr Spieler als
   * „zu leise" — leiser drehen kann jeder, ein Schreck ist einmalig.
   */
  masterVolume: 0.7,

  /** Dauer des Start-Countdowns in s — muss zu `COUNTDOWN` in `RaceDirector` passen. */
  countdownSeconds: 3.2,

  engine: {
    /**
     * > **Seit Tonschicht 2 nur noch Rückfall für `instruments()`**, wenn kein
     * > Getriebewert vorliegt (Tests). Motorton und Drehzahlmesser lesen
     * > `Gearbox` mit eigener Übersetzung je Fahrzeug (`gearbox.config.ts`);
     * > die fünf festen Bänder unten galten für alle zehn Autos zugleich.
     */
    /** Leerlauf und Höchstdrehzahl in min⁻¹ — nur als Zwischengröße. */
    idleRpm: 850,
    maxRpm: 7200,
    /**
     * Ganghöchstgeschwindigkeiten in m/s.
     *
     * **Das Fahrmodell kennt kein Getriebe** — es überträgt Kraft stufenlos.
     * Die Gänge hier sind reine Tonkosmetik, und sie sind der Grund, warum es
     * überhaupt nach Fahren klingt: eine Tonhöhe, die mit dem Tempo nur
     * monoton steigt, klingt nach Sirene. Das Auf und Ab beim Schalten ist das,
     * was das Ohr als Beschleunigung erkennt.
     *
     * Die Kette endet bei 75 m/s = 270 km/h und deckt damit das gemessene
     * Endtempo auf idealem Boden (255,8 km/h, P14) ab.
     */
    gearTopSpeeds: [14, 26, 40, 56, 75],
    /** Grundfrequenz bei Leerlauf und bei Höchstdrehzahl, in Hz. */
    minHz: 42,
    maxHz: 190,
    /** Verstimmung des zweiten Oszillators in Cent — macht aus einem Ton einen Motor. */
    detuneCents: 14,
    /** Tiefpass über dem Sägezahn: bei Leerlauf und bei Vollgas, in Hz. */
    filterMinHz: 400,
    filterMaxHz: 3200,
    /** Lautstärke im Leerlauf und unter Vollgas. */
    idleGain: 0.055,
    fullGain: 0.2,
    /**
     * Glättung der Drehzahl je Sekunde (0…1 je Frame nach Zeitkonstante).
     *
     * Ohne sie springt die Tonhöhe beim Gangwechsel in einem Frame, und das
     * klingt nach Fehler statt nach Schaltvorgang.
     */
    rpmSmoothing: 12,
  },

  /** Roll- und Fahrtwind — ein gefiltertes Rauschen, kein zweiter Motor. */
  noise: {
    /** Tempo in m/s, ab dem das Rauschen seine volle Lautstärke hat. */
    fullSpeed: 60,
    /** Bandpass-Mitte bei Stillstand und bei `fullSpeed`, in Hz. */
    minHz: 320,
    maxHz: 1400,
    /** Höchstlautstärke im Auto und im Freiflug. */
    driveGain: 0.13,
    flyGain: 0.05,
    /** Aufschlag, solange die Räder durchdrehen — der Schlupf ist hörbar. */
    wheelspinGain: 0.1,
  },

  impact: {
    /**
     * Kleinste Durchdringung, die noch einen Ton auslöst, in Metern.
     *
     * Unterhalb davon streift das Auto die Leitplanke, statt sie zu treffen.
     * Ohne diese Schwelle knallt es bei jedem Schritt an der Bordsteinkante —
     * `Vehicle` löst dort dauernd Millimeter auf.
     */
    minPenetration: 0.02,
    /** Durchdringung, ab der es so laut wie möglich ist. */
    fullPenetration: 0.35,
    /** Kürzeste Pause zwischen zwei Aufprallgeräuschen, in Sekunden. */
    minInterval: 0.12,
    gain: 0.5,
    /** Abklingzeit des Rauschstoßes in Sekunden. */
    decay: 0.22,
  },

  /** Rundensignal — zwei Töne, aufsteigend bei Bestzeit, gleich bei sonst. */
  lap: {
    gain: 0.3,
    /** Grundton und Zielton in Hz. */
    baseHz: 523.25,
    bestHz: 1046.5,
    /** Dauer je Ton in Sekunden. */
    noteSeconds: 0.16,
  },

  ui: {
    gain: 0.16,
    hz: 660,
    seconds: 0.045,
  },

  /**
   * Zwei Töne beim Umschalten in den Stunt-Modus. Aufsteigend an, fallend aus.
   * Synthetisiert wie der Rest — 0 Byte Download, und der Modus muss hörbar
   * sein, nicht nur als Label.
   */
  stunt: {
    gain: 0.22,
    onHz: [392, 587.33],
    offHz: [523.25, 329.63],
    noteSeconds: 0.11,
  },
} as const;

/** Schlüssel im `localStorage` — dieselbe Namensform wie beim Debug-Werkzeug. */
export const AUDIO_STORAGE_KEY = 'japanmap.audio.muted';
/** Gesamtlautstärke 0…1 — Tonschicht 2. */
export const AUDIO_VOLUME_KEY = 'japanmap.audio.volume';

// ════════════════════════════════════════════════════════════════════════
// Tonschicht 2 — Motorstimmen
// ════════════════════════════════════════════════════════════════════════
//
// > **Der Satz oben — „der Motorklang eines Arcade-Spiels ist ohnehin ein
// > Sägezahn mit Filter" — ist widerlegt.** Der Auftraggeber hat genau diesen
// > Sägezahn als „AI Slop, fast unspielbar beim Fahren und Schalten"
// > beschrieben. Die Begründung für *Synthese statt Aufnahme* steht weiter
// > (0 Byte Download, und zehn Autos × mehrere Drehzahlschleifen wären 10…30
// > MB); falsch war die Annahme, Synthese heiße Oszillator.
//
// Seit Tonschicht 2 ist jeder Motor ein **Signalmodell aus Bauteilen**
// (`src/audio/dsp/engineVoice.ts`): Zündpulse je Zylinder, Krümmer- und
// Endrohre als Wellenleiter, Schalldämpferkammern, Ansaugresonanz, Ventiltrieb,
// Turbolader. Die Zeilen unten beschreiben die Bauteile, nicht den Klang.


const even = (n: number): number[] => Array.from({ length: n }, (_, i) => i / n);
const alt = (n: number): number[] => Array.from({ length: n }, (_, i) => i % 2);
const zeros = (n: number): number[] => new Array<number>(n).fill(0);

/**
 * Eine Stimme je Fahrzeug. `gain` ist auf gleiche Lautheit unter Vollgas
 * abgeglichen — gemessen mit `tools/bench/audio.mts`, nicht geschätzt.
 */
export const ENGINE_VOICES: Readonly<Record<VehicleId, EngineVoiceProfile>> = {
  // Reihenvierer, Sauger, 4-2-1-Fächerkrümmer: trocken, raspelnd in der Mitte.
  touge: {
    firing: even(4), bank: zeros(4), runner: [0.62, 0.68, 0.62, 0.68], pipe: [2.4, 2.4],
    pipeReflect: -0.55, runnerReflect: 0.3, pulse: 0.09, pulseMs: [0.9, 4.5], turbulence: 0.35,
    variability: 0.05, lope: 0.05, muffler: [2.9, 4.3, 6.1, 8.7], mufflerFeedback: 0.42, mufflerMix: 0.55,
    tone: [1400, 5200], rasp: 1.6, intakeHz: 420, intakeQ: 3, intake: 0.35, induction: 0.5,
    mech: 0.12, valveHz: 3200, whine: 0, whineRatio: 1, turbo: 0, turboHz: 0, bov: 0,
    crackle: 0.35, firewall: 0.8, gain: 3.9,
  },
  // Turbo-Dreizylinder im Kei-Format: 240° Zündabstand, der typische „schiefe" Brumm.
  pip: {
    firing: even(3), bank: zeros(3), runner: [0.45, 0.52, 0.48], pipe: [1.9, 1.9],
    pipeReflect: -0.6, runnerReflect: 0.3, pulse: 0.1, pulseMs: [1, 5], turbulence: 0.4,
    variability: 0.06, lope: 0.08, muffler: [2.1, 3.3, 5.3], mufflerFeedback: 0.5, mufflerMix: 0.65,
    tone: [1100, 4200], rasp: 1.3, intakeHz: 520, intakeQ: 2.5, intake: 0.3, induction: 0.6,
    mech: 0.15, valveHz: 3800, whine: 0, whineRatio: 1, turbo: 0.55, turboHz: 5200, bov: 1,
    crackle: 0.15, firewall: 0.8, gain: 1.9,
  },
  // Nutzfahrzeug-Dreizylinder: langes Endrohr, großer Topf, viel Ventiltrieb.
  truck: {
    firing: even(3), bank: zeros(3), runner: [0.55, 0.6, 0.58], pipe: [3.2, 3.2],
    pipeReflect: -0.45, runnerReflect: 0.35, pulse: 0.12, pulseMs: [1.6, 6], turbulence: 0.5,
    variability: 0.08, lope: 0.1, muffler: [3.9, 5.7, 8.3, 11.1], mufflerFeedback: 0.5, mufflerMix: 0.7,
    tone: [700, 2600], rasp: 1.1, intakeHz: 300, intakeQ: 2, intake: 0.3, induction: 0.35,
    mech: 0.3, valveHz: 2400, whine: 0.02, whineRatio: 3.1, turbo: 0, turboHz: 0, bov: 0,
    crackle: 0.05, firewall: 0.7, gain: 2.8,
  },
  // Turbo-Vierer mit ungleich langem Krümmer: das breite Grollen.
  offroad: {
    firing: even(4), bank: zeros(4), runner: [0.55, 0.8, 0.6, 0.85], pipe: [2.9, 2.9],
    pipeReflect: -0.5, runnerReflect: 0.35, pulse: 0.11, pulseMs: [1.2, 5.5], turbulence: 0.45,
    variability: 0.07, lope: 0.07, muffler: [3.3, 5.1, 7.2, 9.8], mufflerFeedback: 0.45, mufflerMix: 0.6,
    tone: [900, 3400], rasp: 1.4, intakeHz: 360, intakeQ: 2.5, intake: 0.3, induction: 0.5,
    mech: 0.14, valveHz: 2900, whine: 0, whineRatio: 1, turbo: 0.45, turboHz: 4200, bov: 1,
    crackle: 0.15, firewall: 0.8, gain: 2.6,
  },
  // Rallye-Turbovierer: Boxer-artig ungleiche Rohre, Verdichterpumpen, Knallen im Schub.
  torrent: {
    firing: even(4), bank: zeros(4), runner: [0.5, 0.92, 0.5, 0.92], pipe: [2.2, 2.2],
    pipeReflect: -0.6, runnerReflect: 0.3, pulse: 0.08, pulseMs: [0.8, 4], turbulence: 0.4,
    variability: 0.06, lope: 0.1, muffler: [2.4, 3.9, 5.8], mufflerFeedback: 0.35, mufflerMix: 0.45,
    tone: [1500, 6000], rasp: 2, intakeHz: 460, intakeQ: 3, intake: 0.4, induction: 0.7,
    mech: 0.12, valveHz: 3400, whine: 0.05, whineRatio: 4.3, turbo: 0.6, turboHz: 5600, bov: 2,
    crackle: 0.8, firewall: 0.75, gain: 1.94,
  },
  // Reihensechser, gleich lange Rohre: der glatte, steigende Heulton.
  ribbon: {
    firing: even(6), bank: zeros(6), runner: [0.8, 0.82, 0.8, 0.82, 0.8, 0.82], pipe: [2.7, 2.7],
    pipeReflect: -0.6, runnerReflect: 0.3, pulse: 0.085, pulseMs: [0.8, 4], turbulence: 0.3,
    variability: 0.04, lope: 0.04, muffler: [2.7, 4.1, 5.9, 8.3], mufflerFeedback: 0.4, mufflerMix: 0.5,
    tone: [1600, 6800], rasp: 1.5, intakeHz: 480, intakeQ: 3, intake: 0.35, induction: 0.55,
    mech: 0.1, valveHz: 3600, whine: 0, whineRatio: 1, turbo: 0.5, turboHz: 4800, bov: 1,
    crackle: 0.4, firewall: 0.8, gain: 2.13,
  },
  // Biturbo-V6 im Gran Turismo: Turbinen dämpfen den Auspuff, großer Topf, gedämmt.
  meridian: {
    firing: even(6), bank: alt(6), runner: [0.6, 0.6, 0.62, 0.62, 0.6, 0.6], pipe: [3, 3.1],
    pipeReflect: -0.45, runnerReflect: 0.3, pulse: 0.1, pulseMs: [1, 5], turbulence: 0.3,
    variability: 0.04, lope: 0.03, muffler: [3.1, 4.7, 6.9, 9.7], mufflerFeedback: 0.5, mufflerMix: 0.72,
    tone: [900, 3600], rasp: 1.1, intakeHz: 380, intakeQ: 2, intake: 0.25, induction: 0.4,
    mech: 0.06, valveHz: 3000, whine: 0, whineRatio: 1, turbo: 0.35, turboHz: 4400, bov: 1,
    crackle: 0.2, firewall: 0.9, gain: 2.1,
  },
  // V8 mit Kreuzebenen-Kurbelwelle: jede Bank bekommt L R L L R R R L — das Blubbern.
  morrow: {
    firing: even(8), bank: [0, 1, 0, 0, 1, 1, 1, 0], runner: [0.55, 0.62, 0.7, 0.58, 0.66, 0.6, 0.72, 0.64],
    pipe: [2.8, 2.95], pipeReflect: -0.5, runnerReflect: 0.35, pulse: 0.1, pulseMs: [1.2, 6],
    turbulence: 0.35, variability: 0.06, lope: 0.22, muffler: [3.5, 5.3, 7.7, 10.3], mufflerFeedback: 0.4,
    mufflerMix: 0.5, tone: [800, 3800], rasp: 1.8, intakeHz: 280, intakeQ: 2, intake: 0.35, induction: 0.5,
    mech: 0.1, valveHz: 2600, whine: 0, whineRatio: 1, turbo: 0, turboHz: 0, bov: 0,
    crackle: 0.45, firewall: 0.8, gain: 5.9,
  },
  // Hochdrehender Saug-V6 als Mittelmotor: kurze Rohre, kleiner Topf, hinter dir.
  gt: {
    firing: even(6), bank: alt(6), runner: [0.42, 0.42, 0.42, 0.42, 0.42, 0.42], pipe: [1.8, 1.85],
    pipeReflect: -0.65, runnerReflect: 0.3, pulse: 0.075, pulseMs: [0.6, 3.5], turbulence: 0.3,
    variability: 0.04, lope: 0.06, muffler: [1.9, 3.1, 4.6], mufflerFeedback: 0.3, mufflerMix: 0.35,
    tone: [2200, 8500], rasp: 2, intakeHz: 560, intakeQ: 3.5, intake: 0.5, induction: 0.7,
    mech: 0.16, valveHz: 4200, whine: 0.03, whineRatio: 5.2, turbo: 0, turboHz: 0, bov: 0,
    crackle: 0.55, firewall: 0.35, gain: 5.3,
  },
  // Renn-V6: fast offener Auspuff, Stirnradgetriebe, Ventiltrieb im Nacken.
  needle: {
    firing: even(6), bank: alt(6), runner: [0.33, 0.33, 0.33, 0.33, 0.33, 0.33], pipe: [1.2, 1.25],
    pipeReflect: -0.7, runnerReflect: 0.25, pulse: 0.07, pulseMs: [0.5, 3], turbulence: 0.25,
    variability: 0.03, lope: 0.1, muffler: [1.5, 2.6], mufflerFeedback: 0.2, mufflerMix: 0.2,
    tone: [3000, 10000], rasp: 2.4, intakeHz: 700, intakeQ: 4, intake: 0.55, induction: 0.8,
    mech: 0.3, valveHz: 5200, whine: 0.12, whineRatio: 5.7, turbo: 0, turboHz: 0, bov: 0,
    crackle: 0.6, firewall: 0.3, gain: 2.55,
  },
};
