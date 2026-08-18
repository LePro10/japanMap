/**
 * Fahrzeug und Fahrmodell — PLAN.md P14, aus dem Plan von P9.2.
 *
 * ## Warum eigene Physik und nicht Rapier
 *
 * Offene Entscheidung Nr. 3 stand seit P0 mit der Tendenz „Rapier" und ohne
 * eine einzige Zahl daneben. Entschieden wurde sie für die **eigene
 * Arcade-Physik**, und zwar aus drei Gründen, die alle nachprüfbar sind:
 *
 *  1. **Startdownload.** Rapier bringt WASM mit; der Startdownload liegt mit
 *     51,95 MB schon weit über den 15 MB aus SPEC §4. Diese Datei kostet null
 *     Bytes.
 *  2. **Die Zeitbasis existiert bereits.** `RenderLoop` hat seit P0 einen fixen
 *     Schritt (60 Hz) mit dem ausdrücklichen Kommentar „Fahrphysik braucht
 *     deterministische Zeitschritte". Eine zweite Engine brächte ihre eigene
 *     mit, und zwei Zeitbasen in einem Frame sind eine Fehlerquelle, die dieses
 *     Projekt nicht braucht.
 *  3. **Das Fahrgefühl ist die Anforderung, nicht die Korrektheit.** Verlangt
 *     ist Arcade-Drift im Touge-Stil: der Hinterwagen soll auf Gasstoß
 *     ausbrechen und sich mit Gegenlenken halten lassen. Das ist eine Eigenschaft
 *     der **Reifenkennlinie**, und die schreibt man hier in drei Zeilen hin
 *     (`tire.peakSlip`, `rearGripFactor`) statt sie einem Solver abzuringen.
 *
 * Was das kostet, steht ebenfalls hier: keine Kollision zwischen zwei
 * Fahrzeugen, keine umfallenden Gegenstände, kein Überschlag. Für Freeride mit
 * einem Auto ist davon nichts nötig; für alles darüber wäre die Entscheidung neu
 * zu treffen.
 *
 * ## Die Regel für jede Zahl in dieser Datei
 *
 * PLAN.md P9 („Risiken"): *„Ein Fahrmodell lädt zum Nachregeln ein. → Jeder
 * Parameter bekommt eine Messung, oder er bekommt keinen Wert."* Gehalten wird
 * das so: Zahlen, die aus einer physikalischen Herleitung kommen, tragen die
 * Rechnung; Zahlen, die aus einer Messung am laufenden Stand kommen, tragen die
 * Messung; und Zahlen, die **gewählt** sind, sagen das ausdrücklich. Es gibt
 * keine vierte Sorte.
 *
 * Alle Einheiten sind SI: Meter, Kilogramm, Sekunden, Newton, Radiant.
 */

/** Erdbeschleunigung. Hier und nicht in world.config: sie gehört zur Physik. */
export const GRAVITY = 9.81;

/**
 * Maße und Massen.
 *
 * Vorbild ist ein leichtes japanisches Heckantriebs-Coupé der späten Achtziger
 * — die Fahrzeugklasse, für die SPEC §2.1 den Bergpass als Driftstrecke
 * ausweist. Radstand, Spurweite und Masse sind die eines AE86 (2,40 m / 1,40 m /
 * 970 kg) mit Fahrer und etwas Aufbau.
 */
export const CHASSIS = {
  mass: 1150,
  /** Achsabstand. */
  wheelbase: 2.4,
  /** Spurweite (Mitte zu Mitte Rad). */
  track: 1.48,

  /**
   * Anteil der Radlast auf der **Vorderachse** im Stand.
   *
   * 53 % ist die vordere Lastigkeit eines Frontmotor-Heckantriebs ohne
   * Transaxle. Daraus folgt der Schwerpunktabstand zur Vorderachse:
   * `a = wheelbase × (1 − frontWeight)` — der Schwerpunkt liegt **näher** an der
   * schwerer belasteten Achse.
   */
  frontWeight: 0.53,

  /**
   * Schwerpunkthöhe über der Radaufstandsfläche.
   *
   * Bestimmt allein die **Lastverlagerung**: `ΔFz = m · a_x · h / L`. Bei 8 m/s²
   * Verzögerung sind das 1150 × 8 × 0,52 / 2,4 = 1993 N, also gut 17 % der
   * Gesamtlast von der Hinter- auf die Vorderachse. Das ist die Größenordnung,
   * die einen Lastwechsel überhaupt spürbar macht.
   */
  cgHeight: 0.52,

  /**
   * Gierträgheitsmoment um die Hochachse.
   *
   * Gerechnet mit dem üblichen Näherungswert für einen Pkw, `Izz ≈ m · a · b`
   * (dimensionsloser Trägheitsradius ≈ 1): 1150 × 1,128 × 1,272 = 1650 kg·m².
   * Liegt im gemessenen Bereich kleiner Coupés (1500…1900).
   */
  yawInertia: 1650,

  /** Radradius. Bestimmt die Aufstandshöhe und die Raddrehzahl der Anzeige. */
  wheelRadius: 0.31,
  wheelWidth: 0.21,

  /**
   * Abmessungen der Karosserie für die **Kollision** — Länge, Breite, Höhe.
   *
   * Bewusst etwas kleiner als das sichtbare Mesh (4,20 × 1,68): der Kollisionskörper
   * ist ein Rechteck mit abgerundeten Ecken (vier Punkte mit Radius), und ein
   * Rechteck, das genau die Blechkante trifft, hakt an jeder Leitplanke, weil die
   * Ecke geometrisch spitz ist und die Planke ein Band mit Dicke.
   */
  bodyLength: 4.0,
  bodyWidth: 1.62,
  bodyHeight: 1.28,
} as const;

/** Abstand Schwerpunkt → Vorderachse. */
export const CG_TO_FRONT = CHASSIS.wheelbase * (1 - CHASSIS.frontWeight);
/** Abstand Schwerpunkt → Hinterachse. */
export const CG_TO_REAR = CHASSIS.wheelbase * CHASSIS.frontWeight;

/**
 * Radaufhängung.
 *
 * Modelliert wird **eine** Feder zwischen Aufbau und der Ebene durch die vier
 * Radaufstandspunkte, nicht vier unabhängige. Der Grund steht bei
 * `Vehicle.#stepVertical()`: die vier Punkte liefern die Stützebene, und ein
 * Aufbau mit vier Federn und drei Drehachsen ist genau die Sorte gekoppeltes
 * System, das ohne wochenlanges Nachregeln bei einer Bordsteinkante explodiert.
 * Nick und Wank sind deshalb kinematisch, nicht dynamisch.
 */
export const SUSPENSION = {
  /** Federweg von voll ausgefedert bis Anschlag. */
  travel: 0.18,

  /**
   * Federrate der Gesamtachse in N/m, aus der **Aufbaufrequenz** gerechnet.
   *
   * 1,6 Hz ist ein straff abgestimmtes Straßenfahrwerk (Serienlimousine 1,1…1,3,
   * Rennwagen 2,5+). `k = m · (2π f)² = 1150 × (10,053)² = 116 200 N/m`.
   */
  stiffness: 116_200,

  /**
   * Dämpfung in N·s/m, aus dem **Dämpfungsgrad** gerechnet.
   *
   * ζ = 0,45 — unterkritisch, der Aufbau schwingt nach einer Bodenwelle einmal
   * nach und steht dann. `c = 2 ζ √(k m) = 2 × 0,45 × √(116200 × 1150) =
   * 10 390 N·s/m`.
   */
  damping: 10_390,

  /**
   * Zeitkonstante, mit der Nick und Wank der Stützebene folgen (1/s).
   *
   * Hoch genug, dass der Aufbau auf einer Kehre des Bergpasses der Querneigung
   * folgt, niedrig genug, dass eine einzelne Bodenwelle unter einem Rad nicht
   * das ganze Auto verreißt.
   */
  attitudeRate: 7,

  /** Wanken je m/s² Querbeschleunigung, in Radiant. Gewählt für das Bild. */
  rollPerLateralG: 0.0075,
  /** Nicken je m/s² Längsbeschleunigung, in Radiant. Gewählt für das Bild. */
  pitchPerLongitudinalG: 0.0055,
  /** Grenzen, damit ein Aufschlag den Aufbau nicht umlegt. */
  maxRoll: 0.16,
  maxPitch: 0.13,
} as const;

/**
 * Reifen — der Teil, an dem das Fahrgefühl hängt.
 *
 * ## Die Kennlinie und warum sie **abfallen** muss
 *
 * Die Seitenkraft folgt der Form
 *
 * ```
 *   f(n) = 2n / (1 + n²)        mit n = Schräglaufwinkel / peakSlip
 * ```
 *
 * Sie hat ihr Maximum von genau 1 bei `n = 1` und fällt danach wie `2/n` ab.
 * Der Abfall ist der ganze Zweck: eine **sättigende** Kennlinie (etwa `tanh`)
 * gibt beliebig viel Schräglauf ohne Verlust und macht Drift damit unmöglich —
 * das Auto schiebt dann nur untersteuernd geradeaus. Mit dem Abfall gibt es
 * einen Ausbruchpunkt, hinter dem der Wagen quer geht, und ein Rückkehrgebiet,
 * in das Gegenlenken ihn zurückholt. Genau das ist die Anforderung
 * „Arcade-Drift, Touge-Stil".
 *
 * Es ist bewusst **keine** Pacejka-Magic-Formula: die hat fünf Koeffizienten je
 * Achse, von denen keiner hier gemessen werden kann. Diese Form hat zwei, und
 * beide bedeuten etwas Anschauliches.
 */
export const TIRE = {
  /**
   * Schräglaufwinkel des Kraftmaximums, in Radiant.
   *
   * 8,0° vorn / 9,2° hinten. Straßenreifen erreichen ihr Maximum zwischen 6°
   * und 10°; der Unterschied zwischen den Achsen ist hier kein Reifen, sondern
   * die **Abstimmung**: die weichere Hinterachse steigt langsamer an und hält
   * länger, was das Auto beim Einlenken willig macht, ohne es nervös zu machen.
   */
  peakSlipFront: 0.14,
  peakSlipRear: 0.16,

  /**
   * Kraftbeiwert (μ) auf Asphalt.
   *
   * 1,25 liegt über einem echten Straßenreifen (0,9…1,1) und unter einem
   * Semislick (1,4). Gewählt: die Karte hat Radien ab 15 m, und bei μ = 1,0
   * wäre die 17,2-m-Kehre des Bergpasses mit 47 km/h die schnellste
   * Durchfahrt — fahrbar, aber nicht spielbar.
   */
  gripAsphalt: 1.25,

  /**
   * Beiwert der Hinterachse als **Anteil** des vorderen.
   *
   * 0,94 — die Hinterachse verliert zuerst. Das ist die Ursache dafür, dass das
   * Auto übersteuernd ausbricht statt untersteuernd zu schieben, und damit die
   * zweite Hälfte der Drift-Anforderung. Über 1,0 gesetzt fährt derselbe Wagen
   * sicher und langweilig.
   */
  rearGripFactor: 0.94,

  /**
   * Beiwerte der übrigen Beläge, als Anteil von `gripAsphalt`.
   *
   * `kies` ist der Belag von Feldweg und Tempelaufgang (`ROAD_TYPES[…].surface`),
   * `gelaende` alles neben der Straße. Die Karte hat 101 ha Reisfelder und
   * Waldboden — ohne diesen Unterschied wäre Abkürzen quer über die Wiese
   * schneller als die Straße, und die Strecke damit bedeutungslos.
   */
  gripGravel: 0.72,
  gripTerrain: 0.55,

  /**
   * Anteil der Seitenkraft, der bei **blockiertem** Rad übrig bleibt.
   *
   * Ein blockiertes Rad hat 100 % Längsschlupf; im Reibkreis bleibt für die
   * Seitenführung nichts. Nicht null, weil die Handbremse damit unfahrbar wäre:
   * 0,3 lässt den Wagen im Handbremsdrift lenkbar.
   */
  lockedLateralFactor: 0.3,
} as const;

/**
 * Antrieb, Bremse, Widerstände.
 *
 * Heckantrieb. Nicht aus Nostalgie: bei Frontantrieb erzeugt Gas am Kurvenausgang
 * Untersteuern statt Übersteuern, und die halbe Anforderung dieser Phase wäre
 * damit weg.
 */
export const DRIVETRAIN = {
  /**
   * Antriebsleistung an den Rädern, in Watt.
   *
   * 165 kW (224 PS) — ein getunter Vierzylinder-Turbo. Aus ihr und dem
   * Luftwiderstand ergibt sich die Endgeschwindigkeit von selbst:
   * `v_max = (P / c_drag)^(1/3) = (165000 / 0,42)^(1/3) = 73,2 m/s = 264 km/h`.
   * Der Wert wird am laufenden Stand nachgemessen, nicht geglaubt (siehe P14).
   */
  power: 165_000,

  /**
   * Obergrenze der Antriebskraft in Newton — der „erste Gang".
   *
   * **Diese Zahl muss über der Haftgrenze der Hinterachse liegen**, sonst kann
   * man die Räder nicht durchdrehen lassen und damit keinen Drift einleiten.
   * Haftgrenze im Stand: `μ · m · g · frontWeight` (die Hinterachse trägt
   * 1 − 0,53 = 47 %) = 1,25 × 1150 × 9,81 × 0,47 = 6627 N. Mit 7200 N liegt
   * Vollgas 8,6 % darüber — genug für einen Ausbruch aus dem Stand, zu wenig,
   * um ohne Zutun in jeder Kurve zu drehen.
   *
   * Nebenrechnung zur Beschleunigung: kraftbegrenzt bis `P/F = 22,9 m/s`,
   * danach leistungsbegrenzt. 0–100 km/h ≈ `m · v / F` = 1150 × 27,8 / 7200 =
   * 4,4 s (ohne Schlupfverluste, also eine Untergrenze).
   */
  maxDriveForce: 7200,

  /**
   * Bremskraft gesamt in Newton.
   *
   * 1,55 g Verzögerung wären es rechnerisch (18 000 / (1150 × 9,81) = 1,60);
   * begrenzend ist damit der Reibwert und nicht die Bremse, und genau so ist es
   * an einem echten Auto auch. ABS gibt es nicht: blockierende Räder sind ein
   * Fahrfehler, den man hören und sehen soll.
   */
  brakeForce: 18_000,
  /** Anteil der Bremskraft auf der Vorderachse. */
  brakeBias: 0.62,

  /** Bremskraft der Handbremse, nur Hinterachse. Blockiert sie sicher. */
  handbrakeForce: 9000,

  /** Höchstgeschwindigkeit im Rückwärtsgang, in m/s. */
  reverseMaxSpeed: 12,
  /** Anteil der Antriebskraft im Rückwärtsgang. */
  reverseForceFactor: 0.45,

  /**
   * Luftwiderstand als `F = c · v²`, c in N/(m/s)².
   *
   * `c = ½ ρ c_w A = 0,5 × 1,2 × 0,34 × 2,05 = 0,418`. c_w 0,34 und 2,05 m²
   * Stirnfläche sind die Werte eines flachen Coupés dieser Größe.
   */
  drag: 0.42,

  /**
   * Rollwiderstandsbeiwert auf Asphalt und im Gelände.
   *
   * 0,014 ist der Lehrbuchwert für Gürtelreifen auf Asphalt (→ 158 N bei
   * 1150 kg). Im Gelände das Vierfache: 0,058. Das ist die zweite Hälfte davon,
   * warum die Wiese langsamer ist als die Straße — der niedrigere Reibwert
   * allein bremst nicht, er lässt nur früher rutschen.
   */
  rollingResistance: 0.014,
  rollingResistanceTerrain: 0.058,

  /**
   * Abtrieb als `F = c · v²`, c in N/(m/s)².
   *
   * 0,55 ergibt bei 50 m/s 1375 N zusätzliche Radlast, also +12 % Reibkraft.
   * Wenig — ein Serienwagen hat keinen Flügel. Der Zweck ist nicht Kurventempo,
   * sondern dass die Karosserie bei Höchstgeschwindigkeit nicht leicht wird.
   */
  downforce: 0.55,
} as const;

/** Lenkung. */
export const STEERING = {
  /** Größter Radeinschlag in Radiant (34°). Übliche Größenordnung für ein Coupé. */
  maxAngle: 0.593,

  /**
   * Wie schnell der Einschlag der Taste folgt, in Radiant/s.
   *
   * **Der wichtigste Wert für die Bedienbarkeit mit der Tastatur.** Eine Taste
   * kennt nur 0 und 1; ohne Rate wäre jeder Tastendruck Volleinschlag, und
   * damit wäre jede Kurve ein Ausbruch. 3,2 rad/s heißt 0,19 s von Mitte auf
   * Anschlag — die Größenordnung einer schnellen Handbewegung am Lenkrad.
   */
  rate: 3.2,
  /** Rückstellung zur Mitte, wenn keine Taste liegt. Schneller als das Einlenken. */
  centerRate: 4.6,

  /**
   * Geschwindigkeit, bei der der nutzbare Einschlag auf die Hälfte fällt (m/s).
   *
   * Der Einschlag wird mit `1 / (1 + v / speedFalloff)` skaliert. Ohne das
   * bewirkt bei 200 km/h derselbe Tastendruck wie im Parkhaus einen
   * Querbeschleunigungssprung von über 2 g, und das Auto ist bei hohem Tempo
   * nicht mit einer Taste zu führen. 26 m/s (94 km/h) → bei 130 km/h bleiben
   * 42 % Einschlag.
   */
  speedFalloff: 26,

  /**
   * Gierdämpfung als Anteil, greift **erst hinter dem Ausbruchpunkt**.
   *
   * Das ist die einzige Fahrhilfe im Modell, und sie steht hier mit Begründung
   * statt versteckt: mit Tastatur kann man den Gegenlenkwinkel nicht dosieren,
   * nur an/aus. Ohne Dämpfung endet damit jeder Drift über etwa 25°
   * Schwimmwinkel im Kreisel. Der Term wirkt proportional zum Überschuss des
   * hinteren Schräglaufwinkels über `peakSlipRear` und ist bei normaler Fahrt
   * **exakt null** — er kann also kein Fahrverhalten verfälschen, das ohne ihn
   * anders wäre.
   */
  driftDamping: 0.55,
} as const;

/**
 * Kollision der Karosserie.
 *
 * Aufgelöst wird an **vier Punkten** (den Ecken der Karosserie), jeder mit einem
 * Radius. Warum nicht ein Rechteck: eine spitze Ecke hakt an jeder Kante, und
 * warum nicht ein Kreis: dann dreht sich das Auto an einer Wand nicht ein.
 */
export const VEHICLE_COLLISION = {
  /** Radius der Eckpunkte. Rundet die Karosserie ab. */
  cornerRadius: 0.34,

  /**
   * Rückprall — Anteil der Einschlaggeschwindigkeit, der zurückkommt.
   *
   * Niedrig: Blech gegen Leitplanke ist ein Anschlag, kein Flipperball. 0,2
   * genügt, damit man von der Planke wegkommt, ohne an ihr zu kleben.
   */
  restitution: 0.2,

  /**
   * Reibung längs der Wand, als Anteil der Tangentialgeschwindigkeit je Kontakt.
   *
   * Das ist das Schrammen an der Planke: man verliert Tempo, wird aber nicht
   * gestoppt. Bei 0,12 kostet ein Streifschuss über 20 m rund ein Viertel des
   * Tempos.
   */
  wallFriction: 0.12,

  /**
   * Wie stark ein außermittiger Anschlag den Wagen dreht.
   *
   * 1,0 wäre der physikalisch vollständige Drehimpuls `r × p / Izz`. Gedämpft
   * auf 0,55, weil das Modell keinen Überschlag kennt: ein voller Drehimpuls
   * aus einem Frontalanschlag ergibt eine Pirouette, die ein echtes Auto in
   * dieser Lage nicht macht (es steigt vorn auf und stellt sich quer).
   */
  yawTransfer: 0.55,

  /**
   * Höhen über der Radaufstandsebene, in denen die Karosserie prüft.
   *
   * Zwei Ebenen: Stoßfänger (0,30 m) und Türunterkante (0,80 m). **Beide liegen
   * bewusst innerhalb des Leitplankenbands**, das von der Fahrbahn bis
   * `RAIL.top` = 0,85 m reicht — mit einer Prüfhöhe von 0,95 m hätte der obere
   * Punkt jede Planke der Karte überstrichen, ohne sie zu berühren, und die
   * Auflösung hinge an einem einzigen Kontakt. Zwei Kontakte an einer Wand geben
   * dem Ausschieben eine Richtung; einer gibt ihm nur einen Betrag.
   */
  probeHeights: [0.3, 0.8] as readonly number[],

  /**
   * Wie weit eine Kollision höchstens je Schritt auflöst, in Metern.
   *
   * Ohne Deckel schleudert ein Wagen, der mit 70 m/s in eine Hausecke fährt, in
   * einem Schritt durch die halbe Stadt. 0,25 m je Schritt bei 60 Hz sind
   * 15 m/s Ausschiebegeschwindigkeit — mehr als jede echte Durchdringung
   * braucht.
   */
  maxPushPerStep: 0.25,
} as const;

/**
 * Die Verfolgerkamera.
 *
 * Sie ist bewusst **kein** starrer Arm: eine Kamera, die exakt hinter dem Auto
 * klebt, macht aus einem Drift ein Bild, in dem sich nur die Landschaft dreht.
 * Sie folgt gefedert und richtet sich an einer Mischung aus Fahrtrichtung und
 * Fahrzeugachse aus — dadurch sieht man im Drift die Front schräg im Bild, und
 * das ist die halbe Rückmeldung, die man zum Fangen braucht.
 */
export const CHASE_CAMERA = {
  /** Abstand hinter dem Fahrzeug in Metern. */
  distance: 6.4,
  /** Höhe der Kamera über dem Fahrzeugschwerpunkt. */
  height: 2.35,
  /** Höhe des Blickziels über dem Schwerpunkt. */
  targetHeight: 1.0,

  /**
   * Anteil der **Fahrtrichtung** an der Kameraausrichtung (Rest: Fahrzeugachse).
   *
   * 0 = Kamera steht immer hinter dem Heck (Drift unsichtbar), 1 = Kamera folgt
   * dem Geschwindigkeitsvektor (Drift maximal sichtbar, dafür bei Rückwärtsfahrt
   * verdreht). 0,55 zeigt den Schwimmwinkel deutlich und bleibt beim
   * Rangieren brauchbar.
   */
  velocityBlend: 0.55,
  /** Ab diesem Tempo (m/s) zählt die Fahrtrichtung voll mit. Darunter blendet sie ein. */
  velocityBlendSpeed: 6,

  /** Federkonstanten der Nachführung, 1/s. Position träger als der Blick. */
  positionRate: 7,
  lookRate: 11,

  /** Mindestabstand über dem Gelände, damit die Kamera nicht im Hang steckt. */
  groundClearance: 0.9,

  /** Blickfeld bei Stillstand und bei `fovSpeed`. Der Zug bei Tempo. */
  fov: 60,
  fovFast: 68,
  fovSpeed: 70,

  /** Mausempfindlichkeit im Fahrmodus (rad/px) und Nickgrenzen. */
  lookSensitivity: 0.0026,
  pitchMin: -0.5,
  pitchMax: 1.05,

  /**
   * Zeitkonstante, mit der der Mausschwenk zurück nach hinten wandert (1/s).
   *
   * Nur bei Gas: wer umsieht und dabei rollt, soll umsehen dürfen. Wer
   * beschleunigt, will nach vorn. 0,8 ist langsam genug, dass es sich nicht
   * gegen die Hand stellt.
   */
  recenterRate: 0.8,

  /** Höhe der Haubenkamera über dem Schwerpunkt und ihr Versatz nach vorn. */
  hoodHeight: 0.62,
  hoodForward: 0.15,
} as const;

/**
 * Kollisionskörper der Props — PLAN.md P14.
 *
 * Ein **Zylinder** je Eintrag: Radius und Höhe in Metern. Kein Mesh-Test, und
 * das ist eine Entscheidung mit Begründung. `three-mesh-bvh` liegt seit P8
 * installiert und unbenutzt im Projekt; für 630 instanzierte Props hieße
 * „richtig" eine BVH je Geometrie plus eine Transformation der Abfrage in den
 * Instanzraum. Ein Zylinder kostet vier Rechenschritte, ist allokationsfrei und
 * ist für ein Auto, das gegen ein Bauernhaus fährt, nicht unterscheidbar
 * schlechter — die Ecke eines Hauses spürt man nicht, den Anschlag schon.
 *
 * **Ein fehlender Eintrag heißt „durchfahrbar"**, und das ist bei einigen
 * Absicht:
 *
 *  - `torii` steht **über** dem Weg. Ein Zylinder mit dem halben Torbogen als
 *    Radius würde den Tempelaufgang sperren, den das Tor markiert. Die beiden
 *    Pfosten stehen 2,5 m auseinander; sie einzeln zu treffen, wäre die erste
 *    Stelle, an der ein zweiter Zylinder je Prop nötig wird.
 *  - `boat` schwimmt, `delineator` ist ein Kunststoffleitpfosten (den fährt man
 *    um), `templeStairs` ist eine Treppe.
 *
 * Die Radien sind **nicht** `PROP_CLEARANCE`: das ist der Freihalteradius für
 * die Vegetation und enthält den Vorplatz („18 m lassen einen Hof darum frei").
 * Hier steht der Radius des Bauwerks selbst.
 */
export const PROP_COLLIDERS: Readonly<Record<string, { radius: number; height: number }>> = {
  // Tempelbezirk. Die Halle misst 13 × 11 m — der eingeschriebene Kreis wäre
  // 5,5 m, der umschriebene 8,5. 6,2 liegt dazwischen und lässt einen die Ecken
  // schneiden, statt an Luft anzustoßen.
  templeHall: { radius: 6.2, height: 8 },
  hokora: { radius: 1.1, height: 2.4 },
  stoneLantern: { radius: 0.45, height: 2.2 },
  chozuya: { radius: 2.2, height: 3.2 },
  bellTower: { radius: 2.4, height: 4.5 },

  // Gehöft und Dorf.
  farmhouse: { radius: 5.4, height: 6.5 },
  shed: { radius: 2.6, height: 3 },
  fishHut: { radius: 3.1, height: 4 },
  netRack: { radius: 1.4, height: 2.5 },
  crateStack: { radius: 1.2, height: 1.6 },

  // Infrastruktur.
  powerPole: { radius: 0.3, height: 9 },
  lighthouse: { radius: 3.2, height: 12 },
  warehouse: { radius: 8.5, height: 9 },
  greenhouse: { radius: 5.2, height: 3.6 },
  // Die Mauer ist 8,42 m lang und steht in Reihen. Als Zylinder ist sie zu rund;
  // 3,6 m sperrt die Reihe, ohne die Lücke zwischen zwei Mauern zu schließen.
  concreteWall: { radius: 3.6, height: 2.2 },

  // Fels. Hier ist der Zylinder am ehrlichsten — ein Findling ist rund.
  boulder_01: { radius: 1.9, height: 2.5 },
  rock_moss_set_02: { radius: 2.4, height: 2.5 },
  coastal_cliff_04: { radius: 11, height: 20 },

  // Küste. Tetrapoden liegen zu Hunderten am Strand; sie sind der Grund, warum
  // die Kollisionswelt ein Raster hat und keine Liste.
  tetrapod: { radius: 1.5, height: 2 },
  boatRamp: { radius: 3, height: 1 },
  jetty: { radius: 2.5, height: 2 },
  modular_wooden_pier: { radius: 4, height: 3 },
} as const;
