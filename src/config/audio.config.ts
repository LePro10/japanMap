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

export const AUDIO = {
  /**
   * Grundlautstärke, bevor der Nutzer etwas einstellt.
   *
   * Bewusst unter der Hälfte: ein Spiel auf einem Portal startet in einem Tab
   * neben anderen, und der erste Eindruck „zu laut" kostet mehr Spieler als
   * „zu leise" — leiser drehen kann jeder, ein Schreck ist einmalig.
   */
  masterVolume: 0.45,

  engine: {
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
} as const;

/** Schlüssel im `localStorage` — dieselbe Namensform wie beim Debug-Werkzeug. */
export const AUDIO_STORAGE_KEY = 'japanmap.audio.muted';
