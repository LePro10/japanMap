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
  /**
   * Federweg von voll ausgefedert bis Anschlag.
   *
   * **0,18 → 0,26 m nach der ersten Geländefahrt.** Das Höhenfeld dieser Karte
   * hat 1,5 m Texelabstand; bei 30 km/h findet ein Rad darauf regelmäßig Stufen
   * von 15…25 cm. Mit 18 cm Weg saß der Aufbau dabei ständig auf dem Anschlag
   * (gemessen: Ausnutzung bis **150 %**), und der schoss ihn in die Luft. 26 cm
   * ist der Federweg eines Fahrzeugs, das auch Feldwege fährt — und genau das
   * tut dieses hier.
   */
  travel: 0.26,

  /**
   * Federrate der Gesamtachse in N/m, aus der **Aufbaufrequenz** gerechnet.
   *
   * ~~1,6 Hz ist ein straff abgestimmtes Straßenfahrwerk.~~ **Auf 1,35 Hz
   * gesenkt**, aus demselben Grund wie der größere Federweg: 1,6 Hz ist eine
   * Rennstreckenabstimmung, und die Hälfte dieser Karte ist Wiese.
   * Serienlimousine 1,1…1,3, Rennwagen 2,5+; 1,35 liegt am straffen Ende des
   * Zivilen. `k = m · (2π f)² = 1150 × (8,482)² = 82 730 N/m`.
   */
  stiffness: 82_730,

  /**
   * Dämpfung in N·s/m, aus dem **Dämpfungsgrad** gerechnet.
   *
   * ζ = 0,55 — deutlich unterkritisch, der Aufbau kommt nach einer Bodenwelle
   * ohne Nachschwingen zur Ruhe. Angehoben von 0,45: mit dem weicheren Federbein
   * schwingt er sonst länger nach, und im Gelände ist jede Nachschwingung ein
   * Rad, das beim nächsten Hügel schon oben ist. `c = 2 ζ √(k m) =
   * 2 × 0,55 × √(82730 × 1150) = 10 720 N·s/m`.
   */
  damping: 10_720,

  /**
   * Wie viel härter der Gummipuffer jenseits des Federwegs ist.
   *
   * War 9 und bleibt 9 — dieser Wert war nicht das Problem, die **fehlende
   * Obergrenze** war es. Siehe `maxLoadFactor`.
   */
  bumpStopFactor: 9,

  /**
   * Obergrenze der Federkraft, als Vielfaches des Fahrzeuggewichts.
   *
   * **Die Reparatur des schwersten Fehlers dieser Phase.** Ohne Deckel rechnet
   * der Anschlag bei einer 40-cm-Stufe eine Kraft aus, die den Aufbau mit 9 g
   * senkrecht wegschießt. Gemessen am Hang unter dem Massiv, 20 s Vollgas:
   * **91,9 % der Zeit in der Luft, längste Flugphase 7,7 s.** Auf der Wiese
   * waren es 5,8 % mit 0,78 s. Das Auto ist dort nicht gefahren, es ist gehüpft.
   *
   * Der Deckel ist kein Kunstgriff, sondern die fehlende Physik: ein echtes Rad,
   * das eine Kante trifft, **verformt sich und rutscht daran hoch**, statt den
   * Aufbau zu katapultieren. 3,5 g ist die Größenordnung, die eine
   * Radaufhängung bei hartem Einschlag tatsächlich überträgt — genug, dass eine
   * Landung sich nach Landung anfühlt, zu wenig für einen Katapultstart.
   */
  maxLoadFactor: 3.5,

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
   * **9,2° vorn / 6,9° hinten — und die erste Fassung hatte es genau
   * andersherum.** Straßenreifen erreichen ihr Maximum zwischen 6° und 10°;
   * welche Achse den kleineren Wert hat, entscheidet aber nicht über „willig",
   * sondern über **Stabilität**.
   *
   * Die Schräglaufsteifigkeit einer Achse ist `C = 2 μ F_z / α_peak`. Ein
   * Einspurmodell ist gierstabil, solange `b · C_hinten > a · C_vorn` — sonst
   * dreht sich der Wagen bei der kleinsten Störung **aus** der Fahrtrichtung
   * heraus, und der Schwimmwinkel wächst mit sich selbst.
   *
   * | Abstimmung | Asphalt | Gelände, Vollgas |
   * |---|---|---|
   * | 0,14 / 0,16 / f = 1,02 · erste Fassung | **0,89 — instabil** | **0,74 — instabil** |
   * | **0,16 / 0,12 / f = 1,08** | **1,44** | **1,19** |
   *
   * Reserve = `b · C_hinten / a · C_vorn`; über 1 ist stabil.
   *
   * Die erste Fassung war damit **auf jedem Belag instabil**. Gemessen auf der
   * Wiese bei Vollgas und Lenkung **null**: die Gierrate wuchs von 0,02 auf
   * 1,90 rad/s in zwei Sekunden, und der Wagen stand quer, ohne dass jemand
   * gelenkt hätte. Sie war obendrein kein Drift-Setup — mit 8,0° vorn gegen
   * 9,2° hinten sättigte die **Vorderachse zuerst**, das Auto schob also am
   * Limit, statt auszubrechen.
   *
   * Jetzt stimmt beides: unterhalb des Scheitels stabil, am Scheitel bricht die
   * **Hinterachse** zuerst aus (6,9° gegen 9,2°) — Übersteuern auf Wunsch statt
   * Übersteuern von allein.
   */
  peakSlipFront: 0.16,
  peakSlipRear: 0.12,

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
   * Was der Reifen **jenseits** seines Scheitels mindestens noch trägt, als
   * Anteil des Maximums.
   *
   * Ein echter Reifen verliert jenseits des Scheitels 10…25 % und behält den
   * Rest: die Gleitreibung des Gummis verschwindet nicht, nur weil das Rad quer
   * steht. Ohne diesen Boden gibt es hinter dem Ausbruchpunkt **negative
   * Dämpfung** — je weiter der Wagen quer geht, desto weniger hält ihn.
   *
   * 0,75 ist der Wert, an dem ein Drift **haltbar** wird: das Heck rutscht, aber
   * die Reifen tragen noch genug, dass Gegenlenken und Gaswegnehmen wirken.
   *
   * > **Dieser Wert war richtig und stand an der falschen Stelle.** Bis P17 war
   * > er als Betragsklemme über die *ganze* Kennlinie gelegt — auch über den
   * > **ansteigenden** Ast. Damit lieferte der Reifen schon bei 0,01°
   * > Schräglauf **75 % seiner Spitzenkraft**: eine Sprungfunktion bei null
   * > statt eines Anstiegs. Die Folgen sind unter `plateauWidth` gemessen. Seit
   * > P17 greift der Boden dort, wofür er gedacht war — **hinter** dem Abfall.
   */
  tailGrip: 0.75,

  /**
   * Breite des Kraftmaximums, als Vielfaches von `peakSlip`.
   *
   * **Der Regler, an dem „fährt sich gut" hängt** — und der Grund, warum die
   * Kennlinie seit P17 vier Abschnitte hat statt einer geschlossenen Formel:
   *
   * ```
   *   1. Anstieg     α < p            x(2−x), x = α/p   → f(0)=0, f'(p)=0
   *   2. Plateau     p ≤ α < p(1+w)   1
   *   3. Abfall      … < falloffSlip  Glättung auf tailGrip
   *   4. Rest        darüber          tailGrip
   * ```
   *
   * An jedem Übergang ist die Ableitung stetig — das Plateau grenzt beidseitig
   * an Stellen mit Steigung null, und der Abfall benutzt eine Glättung, die an
   * beiden Enden waagerecht ausläuft. Die Kennlinie hat also nirgends eine
   * Kante. Die Anfangssteigung ist `2/p` und damit **dieselbe**, mit der die
   * Stabilitätsrechnung bei `peakSlipFront` rechnet (`C = 2 μ F_z / α_peak`):
   * jene Rechnung war immer richtig, nur hat die alte Kennlinie sie nie
   * eingelöst.
   *
   * Ein **Plateau** ist das, was ein Auto verzeihlich macht: am Limit passiert
   * nicht plötzlich etwas anderes, es gibt einen Bereich, in dem der Reifen
   * seine Höchstkraft *hält*, während der Schräglauf schon wächst. Der Fahrer
   * spürt die Grenze, bevor sie ihn kostet. 0,55 heißt: vorn trägt der Reifen
   * von 9,2° bis 14,2° volle Kraft.
   *
   * ## Was der fehlende Anstieg gekostet hat — gemessen am 2026-08-19
   *
   * Dieselbe Messreihe vor und nach der Reparatur, auf ebenem bzw. leicht
   * welligem Asphalt:
   *
   * | Messung | vorher | nachher |
   * |---|---|---|
   * | Vorzeichenwechsel Schräglauf, ruhige Geradeausfahrt (300 Schritte) | **295** | **1** |
   * | größter Schwimmwinkel, 10 s Vollgas geradeaus, Lenkung null | 3,72° | **1,07°** |
   * | Gierrate bei Lenkeingabe 0,10 / 0,50 / 1,00 | 18,9 / 29,0 / **25,1** °/s | 10,5 / 33,4 / 31,1 °/s |
   * | Endtempo Wiese, 10 s Vollgas | 11,7 km/h bei **89,4°** Schwimmwinkel | 144,4 km/h bei 2,3° |
   *
   * Die erste Zeile ist der Befund selbst: die Reifenkraft kehrte ihre Richtung
   * **in 295 von 300 Schritten** um. Das ist kein Fahrverhalten, das ist ein
   * Zweipunktregler.
   *
   * Die dritte Zeile ist die eigentliche Antwort auf „schwer zu steuern": die
   * Lenkung war **nicht monoton**. Mehr Einschlag ergab weniger Drehung, und
   * zwischen 0,10 und 0,35 ergab er gar nichts. Kein Fahrer kann ein Auto
   * lernen, dessen Antwort nicht mit der Eingabe wächst.
   */
  plateauWidth: 0.55,

  /**
   * Schräglaufwinkel, ab dem nur noch `tailGrip` übrig ist, in Radiant.
   *
   * Der Abschnitt zwischen Plateauende und diesem Wert ist der **Abfall**, und
   * seine Länge bestimmt, wie schnell ein Ausbruch geht: kurz = schnappt, lang
   * = rutscht sanft weg.
   *
   * Hinten länger als vorn (40° gegen 30°). Das Heck soll beim Ausbrechen Zeit
   * lassen, damit Gegenlenken überhaupt ankommt; vorn darf es früher fertig
   * sein, denn Untersteuern soll man merken.
   */
  falloffSlipFront: 0.524,
  falloffSlipRear: 0.698,

  /**
   * Beiwert der Hinterachse als **Anteil** des vorderen — der Übersteuer-Regler.
   *
   * ## Die Rechnung, und warum die alte falsch war
   *
   * In der stationären Kurve gilt Momentengleichgewicht um die Hochachse,
   * `a · F_vorn = b · F_hinten`. Zusammen mit `F_vorn + F_hinten = F_gesamt`
   * folgt daraus, dass jede Achse **genau ihren Lastanteil** an Seitenkraft
   * aufbringen muss: vorn `b/(a+b) = 0,53`, hinten `0,47`.
   *
   * Damit ist die Ausnutzung jeder Achse ihr Kraftbedarf geteilt durch ihre
   * Kapazität:
   *
   * ```
   *   vorn:   0,53 F / (μ · 0,53 · L)       = F / (μ L)
   *   hinten: 0,47 F / (μ · f · 0,47 · L)   = F / (f · μ L)
   * ```
   *
   * Das Verhältnis hinten/vorn ist also schlicht **1/f**. Neutral ist `f = 1,00`;
   * `f < 1` heißt Übersteuern, `f > 1` heißt Untersteuern. Die Lastverteilung
   * kürzt sich vollständig heraus — sie steht auf beiden Seiten.
   *
   * > **Die alte Tabelle nannte `f = 1,128` „neutral", und das war ein
   * > Rechenfehler.** Verglichen wurde dort die Achs*kapazität* (`μ·0,53` gegen
   * > `μ·f·0,47`) mit sich selbst statt mit dem Kraft*bedarf*. Gleiche absolute
   * > Kapazität bedeutet aber nicht Gleichgewicht: die Hinterachse muss nur 47 %
   * > tragen, bei gleicher Kapazität ist sie also überversorgt. Aus dem Fehler
   * > folgte die Zeile „1,02 lässt 10 % Übersteuertendenz stehen" — in
   * > Wirklichkeit untersteuerte der Wagen dort um 2 %.
   *
   * ## Warum 1,00 und nicht weniger
   *
   * `f` war zuletzt **1,08** — 8 % Untersteuern, und in P14.5 aus einem
   * Stabilitätsgrund so gesetzt worden. Dieser Grund ist entfallen: die
   * Gierstabilitätsreserve `b·C_h / a·C_v` ist mit den heutigen Scheitelwinkeln
   * `1,272 · f · 0,47/0,12 / (1,128 · 0,53/0,16) = 1,3335 · f` und liegt bei
   * `f = 1,00` immer noch bei **1,33**. Getragen wird sie von der Asymmetrie der
   * Scheitelwinkel (16 vorn gegen 12 hinten), nicht von `f`.
   *
   * Gemessen am 2026-08-19, jeweils dieselben vier Fahrmanöver:
   *
   * | `f` | Gasstoß in der Kurve | Lastwechsel | Gegenlenken nach Handbremse | 0–100 |
   * |---|---|---|---|---|
   * | 1,08 (bisher) | **5,4°** — kein Drift möglich | 12,4° | fängt sich nach 3 s | 4,85 s |
   * | **1,00** | **19,7°** | 22,1° | fängt sich nach 3 s | 4,85 s |
   * | 0,96 | 23,3° | **59,0°** | fängt sich nach 4 s | 4,85 s |
   * | 0,92 | 24,7° | **89,6°** | pendelt bis 5 s | 4,85 s |
   * | 0,88 | 33,4° | **89,9°** | pendelt bis 5 s | 4,85 s |
   *
   * Die Spalte **Lastwechsel** entscheidet. Sie misst den Schwimmwinkel, wenn
   * man in einer schnellen Kurve das Gas wegnimmt — die häufigste unabsichtliche
   * Eingabe eines Gelegenheitsspielers. Ab `f = 0,96` wird daraus ein Dreher um
   * 59°, ab 0,92 ein voller. Ein Auto, das für Gaswegnehmen mit einem Dreher
   * bestraft, ist auf CrazyGames nach zwei Runden weg.
   *
   * Bei 1,00 steht beides zugleich: Gasstoß, Handbremse und Lenkimpuls stellen
   * den Wagen auf 20…25° quer, ein Lastwechsel bleibt mit 22° beherrschbar.
   *
   * > **Nebenbei heilt 1,00 die Herleitung von `maxDriveForce`.** Die rechnet
   * > die Haftgrenze der Hinterachse als `μ · m · g · 0,47 = 6627 N` und setzt
   * > 7200 N mit „8,6 % darüber" dagegen — eine Rechnung, die `f = 1`
   * > **voraussetzt**. Mit `f = 1,08` lag die Grenze bei 7157 N und unter
   * > Lastverlagerung beim Beschleunigen bei rund 8800 N; Vollgas kam nie
   * > darüber, und genau deshalb war Gasstoß-Übersteuern nicht bloß schwach,
   * > sondern **rechnerisch unmöglich**. Der Wert 7200 stimmt wieder, ohne dass
   * > er angefasst werden musste.
   */
  rearGripFactor: 1.0,

  /**
   * Beiwerte der übrigen Beläge, als Anteil von `gripAsphalt`.
   *
   * `kies` ist der Belag von Feldweg und Tempelaufgang (`ROAD_TYPES[…].surface`),
   * `gelaende` alles neben der Straße. Die Karte hat 101 ha Reisfelder und
   * Waldboden — ohne diesen Unterschied wäre Abkürzen quer über die Wiese
   * schneller als die Straße, und die Strecke damit bedeutungslos.
   *
   * > **`gelaende` von 0,55 auf 0,72 angehoben.** 0,55 war als „Wiese ist
   * > rutschig" gedacht und hat „Wiese ist unfahrbar" ergeben: bei μ = 0,69
   * > rutscht der Wagen schon unterhalb von Schrittgeschwindigkeit weg, sobald
   * > man lenkt. 0,72 entspricht μ = 0,90 — festem Erdboden mit Gras, und das
   * > ist es, was auf dieser Karte neben der Straße liegt. Der Unterschied zur
   * > Straße bleibt mit 20 % deutlich spürbar und wird zusätzlich vom höheren
   * > Rollwiderstand getragen.
   */
  /**
   * Kies (Feldweg, Tempelaufgang). 0,62 statt 0,78: der Weg soll sich von
   * Asphalt **unterscheiden**, nicht nur 20 % langsamer sein. Hinterachse
   * zusätzlich über `gravelRear` — auf Kies bricht das Heck zuerst aus.
   */
  gripGravel: 0.62,
  /**
   * Wiese, Waldboden, Reisterrasse. 0,52: festes Gras, aber deutlich langsamer
   * und rutschiger als die Straße. Zusammen mit `terrainDrag` und der Rüttel-
   * höhe in `SURFACE` merkt man den Belag, ohne dass er unfahrbar wird
   * (P17: 0,55 war „im Dreck unspielbar" — das war die tote Kennlinie).
   */
  gripTerrain: 0.52,

  /**
   * Beiwert auf Wasser, als Anteil von `gripAsphalt`.
   *
   * μ = 1,25 × 0,42 = **0,53**. Das ist nasses Moos, kein Eis: lenkbar, aber
   * jeder Impuls rutscht. Ohne diesen eigenen Belag fährt das Auto auf dem
   * **Meeresboden** (Terrain bis −40 m), und das ist kein Fahrverhalten, das
   * ist ein Fall durch die Welt.
   *
   * Die Endgeschwindigkeit im Wasser trägt `DRIVETRAIN.waterDrag`, nicht
   * dieser Wert — der Reibwert entscheidet, ob man noch lenken kann.
   */
  gripWater: 0.42,

  /**
   * Der **Boden unter dem Reibkreis**: welcher Anteil der Querkraft einer Achse
   * auch dann noch zur Verfügung steht, wenn die Längsrichtung das ganze
   * Kraftbudget verlangt.
   *
   * ## Warum es diesen Boden geben muss
   *
   * Der Reibkreis lässt der Querführung `√(grip² − Fx²)`. Das ist richtig
   * gerechnet und geht bei voller Längsausnutzung auf **null** — und eine Achse
   * ohne jede Seitenführung ist nicht „am Limit", sie ist von der Fahrbahn
   * abgemeldet. Gemessen auf Gras, Vollgas: das Querbudget der Hinterachse lag
   * **vier Sekunden lang exakt bei 0,000**, weil `maxDriveForce` dort das
   * 1,13-fache der Haftgrenze verlangt.
   *
   * Die Folge ist nicht Übersteuern, sondern ein **Wagen ohne Rückstellung**:
   * die Vorderachse hält voll, die Hinterachse gar nicht, und jede Bodenwelle
   * dreht ihn weg. Gemessen 10 s Vollgas geradeaus über die Wiese, Lenkung
   * **null**: 89,95° Schwimmwinkel und 25,8 km/h. Das ist „im Dreck
   * unspielbar", und es ist kein Reifen-, sondern ein Buchhaltungsfehler.
   *
   * ## Warum 0,55
   *
   * Der Wert entscheidet über die Gierstabilität am Limit. Die Achsmomente
   * müssen sich die Waage halten: `b · F_hinten ≳ a · F_vorn`. Mit
   * `a = 1,128`, `b = 1,272`, `rearGripFactor = 1,08` und der Lastverteilung
   * 53/47 braucht die Hinterachse dafür `0,5978 / 0,6457 = 0,926` ihrer
   * Querkapazität. Das ist die Grenze zum **neutralen** Auto — und dieses hier
   * soll übersteuern, wenn man es darum bittet.
   *
   * Gemessen wurde deshalb der Bereich darunter (Wiese, 10 s Vollgas, Lenkung
   * null / Asphalt, Lenkimpuls 0,3 s bei 145 km/h):
   *
   * | `lateralReserve` | Wiese: Endtempo | max. Schwimmwinkel | Handbremsdrift nach 2 s | Gegenlenken fängt nach |
   * |---|---|---|---|---|
   * | 0,00 (der Zustand vor P17) | **7,8 km/h** | **89,97°** | — | — |
   * | 0,25 | 144,4 km/h | 2,25° | 64,5° | 3,6 s |
   * | 0,35 | 144,4 km/h | 2,25° | 69,1° | 3,6 s |
   * | **0,55** | 144,4 km/h | 2,25° | 77,6° | 3,5 s |
   * | 0,65 | 144,4 km/h | 2,25° | 81,5° | 3,4 s |
   * | 0,75 | 144,4 km/h | 2,25° | **89,5°** | 2,8 s |
   *
   * **Die Klippe liegt vollständig zwischen 0,00 und 0,25**; darüber sind die
   * beiden Geländespalten bis auf die letzte Stelle identisch. Der Wert ist
   * innerhalb dieses Bandes also **gewählt und nicht gemessen** — und das gehört
   * hierhin, statt eine Genauigkeit vorzutäuschen, die die Messung nicht hergibt.
   *
   * Gewählt wurde nach der vierten Spalte. Sie misst, wie viel Schwimmwinkel
   * zwei Sekunden nach einem Handbremsanriss noch steht, und ist das einzige
   * Kriterium, das innerhalb des Bandes überhaupt unterscheidet: bei 0,75 hält
   * der Wagen 89,5° — er dreht sich also weiter statt zu driften. 0,55 lässt
   * 77,6° stehen und liegt damit im haltbaren Bereich, ohne dass die Reserve so
   * groß wird, dass sie den Reibkreis aushebelt.
   *
   * > **Der Vorgänger dieser Zahl war wirkungslos.** Bis P17 stand hier
   * > `minSpinGrip: 0.8` mit einer ausführlichen Begründung und zwei
   * > Messreihen. Der Wert wurde als **Faktor auf das Ergebnis** von
   * > `tireLateral` angewandt — also *nachdem* der Reibkreis die Kraft auf null
   * > geklemmt hatte. `0 · 0,8` ist 0. Gegenprobe: derselbe Lauf mit 0,80,
   * > 0,55, 0,25 und 0,00 endet **auf vier Nachkommastellen an derselben
   * > Stelle** (−5,9617 | 27,6956). Er ist die dritte tote Stellschraube dieses
   * > Projekts nach `viewDistance` und `shadowCascades` — und die erste, die
   * > eine erfundene Messung im Kommentar trug.
   */
  lateralReserve: 0.55,

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

  /**
   * Wie schnell die Gasstellung der Eingabe folgt, in 1/s.
   *
   * 4,0 heißt: von null auf Vollgas in 0,25 s. Das ist die Zeit, die ein Fuß
   * für den Pedalweg braucht — und der Grund, warum es diesen Wert überhaupt
   * gibt, ist die Tastatur: sie kennt nur 0 und 1. Ohne Rampe steht bei jedem
   * Antippen sofort die volle Antriebskraft an, und auf losem Boden ist das der
   * Unterschied zwischen Beschleunigen und Querstehen.
   *
   * Die Beschleunigung kostet das fast nichts: 0,25 s Aufbauzeit gegen 4,7 s auf
   * 100 km/h.
   */
  throttleRate: 4,

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
   * 1150 kg). Im Gelände rund das Dreifache: 0,040. Das ist die zweite Hälfte
   * davon, warum die Wiese langsamer ist als die Straße — der niedrigere
   * Reibwert allein bremst nicht, er lässt nur früher rutschen.
   *
   * > Von 0,058 auf 0,040 gesenkt, zusammen mit dem angehobenen Geländebeiwert:
   * > 0,058 kostete bei 1150 kg 654 N und damit ein Zehntel der Antriebskraft
   * > allein fürs Rollen. Zusammen mit dem alten Reibwert kam das Auto im
   * > Gelände nach 20 s Vollgas auf **11 km/h**.
   */
  rollingResistance: 0.014,
  rollingResistanceTerrain: 0.04,

  /**
   * Rollwiderstand im Wasser. 0,09 ist das Sechsfache von Asphalt — das Auto
   * watet, es schwimmt nicht frei. Zusammen mit `waterDrag` die Bremse, die
   * aus 256 km/h auf der Küstenstraße eine Fahrt durch die Brandung macht.
   */
  rollingResistanceWater: 0.09,

  /**
   * Extra-Quadratwiderstand im Wasser, `F = c · v²`, c in N/(m/s)².
   *
   * Auslegung auf **72 km/h** Endtempo bei Vollgas im tiefen Wasser:
   * `7200 = c · 20² + m g · 0,09` → `c = (7200 − 1015) / 400 ≈ 15,5`.
   * 16 ist die nächste runde Zahl. Gemessen aus dem Stand, 8 s Vollgas im
   * Meer (2026-08-19): **33,7 km/h**, y bleibt 0,34 m (nicht −37 m Sohle).
   * Flaches Wasser (Reisfeld 0,3 m) skaliert über die Tiefe herunter, sonst
   * wären 101 ha Reisfeld eine Schlammpiste, auf der niemand mehr fährt.
   *
   * Das wirkt **zusätzlich** zum Luftwiderstand — im Wasser zählt beides.
   */
  waterDrag: 18,

  /**
   * Extra-Dämpfung `v ← v · (1 − k·dt)` auf Gelände / Kies. Asphalt sieht
   * den Term nicht. 0,18 auf der Wiese heißt: bei 20 m/s zusätzlich rund
   * 3,6 m/s² — merkt man, reicht nicht zum Stehenbleiben.
   */
  terrainDrag: 0.18,
  gravelDrag: 0.07,

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

  /**
   * Extra-Gierdämpfung, wenn der Spieler das Lenkrad **loslässt**.
   *
   * `driftDamping` greift hinter dem Scheitel immer, auch bei Volleinschlag —
   * das hält einen gehaltenen Drift. Was ein CrazyGames-Spieler tut, wenn es
   * zu schnell wird: **Tasten los**. Ohne diesen Term dreht sich der Wagen
   * dann weiter, und das nächste, was er sieht, ist die Welt rückwärts.
   *
   * Null bei |Lenkeingabe| ≥ 0,25, also nicht in einer gehaltenen Kurve.
   * Die Geradeausfahrt (Schräglauf unter dem Scheitel) sieht ihn nie.
   */
  releaseDamping: 0.4,
} as const;

/**
 * Was den Belag **fühlbar** macht, jenseits von μ.
 *
 * Asphalt bleibt die gemessene Referenz (0–100, Endtempo). Alles andere
 * darf sich davon unterscheiden — und muss es, sonst ist die Karte eine
 * Textur auf derselben Physik.
 */
export const SURFACE_FEEL = {
  /**
   * Rüttelamplitude in Metern, auf die Radhöhe addiert. Deterministisch
   * aus der Position, also reproduzierbar. Asphalt und Wasser: 0.
   */
  rumbleGravel: 0.016,
  rumbleTerrain: 0.034,
  /** Tempo, ab dem die volle Rüttelhöhe anliegt (m/s). */
  rumbleSpeed: 9,
  /**
   * Hinterachs-Beiwert auf Kies als Anteil. 0,86: das Heck gibt zuerst nach,
   * der Feldweg ist ein Driftbelag, nicht nur ein langsamer Asphalt.
   */
  gravelRear: 0.86,
  /**
   * Aquaplaning: ab 3 m/s fällt μ, bei 19 m/s auf den Rest. Hinten stärker —
   * Vollgas im Wasser stellt das Heck quer, statt nur zu schieben.
   */
  hydroStart: 3,
  hydroFull: 19,
  hydroFront: 0.38,
  hydroRear: 0.52,
} as const;

/**
 * Wasser als Fahrfläche. Y = 0 ist Meeresspiegel; ohne diese Zahlen folgt
 * das Auto der Sohle (−40 m). Arcade: ab `floatDepth` trägt die Fläche.
 */
export const WATER_PHYS = {
  /** Ab dieser Tiefe trägt die Wasserfläche statt des Grundes, in Metern. */
  floatDepth: 0.55,
  /** Wie tief das Auto im Wasser sitzt, wenn es trägt, in Metern. */
  draft: 0.18,
  /** Unter dieser Tiefe gilt der Boden als trocken, in Metern. */
  wetThreshold: 0.08,
} as const;

/**
 * Kollision der Karosserie.
 *
 * > **Bis P19 stand hier: „aufgelöst wird an vier Punkten (den Ecken der
 * > Karosserie), jeder mit einem Radius. Warum nicht ein Rechteck: eine spitze
 * > Ecke hakt an jeder Kante."**
 * >
 * > Die Begründung war falsch, und der Preis dafür stand nicht dabei: zwischen
 * > zwei Eckpunkten liegen beim Coupé 4,2 m, und **alles, was dort hineinpasst,
 * > wurde nicht gesehen**. Gemessen mit `tools/bench/world.mts`: ein Baumstamm
 * > mit 40 cm Radius genau auf der Fahrlinie ergab in fünfzehn Sekunden
 * > **null Kontakte** — das Auto fuhr durch ihn hindurch. Genau dieses Bild
 * > („das Auto steckt im Baum") hat P19 ausgelöst.
 * >
 * > Die Sorge vor der hakenden Ecke war zudem unbegründet: sie stammt aus
 * > Verfahren, die Ecke gegen Ecke testen. Das SAT liefert die Richtung mit der
 * > **kleinsten** Überdeckung, und die ist an einer Wand die Wandnormale — eine
 * > Ecke, die sich an einer Kante verhakt, kann dabei gar nicht entstehen.
 *
 * Aufgelöst wird seit P19 gegen das **orientierte Rechteck** der Karosserie;
 * die Rechnung steht in `CollisionWorld.queryBody`.
 */
/**
 * Die Gelände-Kriechhilfe — P21.
 *
 * ## Der Befund, aus dem sie entsteht
 *
 * Das Default-Coupé kommt im Gelände gerechnet **17,8°** hoch, und das ist keine
 * Fehlfunktion, sondern eine geschlossene Rechnung:
 *
 * ```
 * sinθ ≤ Σ_Achse μ_Achse · Lastanteil · Antriebsanteil
 *      = 1,25 · 0,52 · 0,47 · 1     (Heckantrieb, 47 % Last hinten)
 *      = 0,306   →   17,8°
 * ```
 *
 * Ein echter Hecktriebler kommt eine Wiese auch nicht hoch. Gemessen auf der
 * Karte war das trotzdem die **häufigste** Ursache für „ich stecke fest": von
 * 14 Versuchen, aus 12 m Entfernung auf die Straße zurückzukommen, scheiterten
 * **12 an genau dieser Grenze** — und keiner an der Kollision.
 *
 * Mehr Gas hilft nicht, und das ist gemessen: bei 20° Hang endet der Wagen mit
 * Gas 0,5 / 0,7 / 1,0 **auf dieselbe Nachkommastelle** bei 0,4 km/h. Oberhalb
 * der Haftgrenze ist die übertragene Kraft geklemmt, egal was der Fuß tut.
 *
 * ## Was die Hilfe tut — und was ausdrücklich nicht
 *
 * Unter `speed` bekommt die **Vorderachse** einen Antriebsanteil dazu, linear
 * ausgeblendet mit dem Tempo. Damit ziehen im Kriechgang beide Achsen, und die
 * Grenze steigt auf `asin(2 · min(μ_v·w_v, μ_h·w_h))` ≈ 38°.
 *
 *  · **Nur auf losem Boden.** Auf Asphalt ist sie null — die Zahlen aus P18
 *    (0–100, Endtempo, Bremsweg, Drift) bleiben damit unberührt, und das ist
 *    nachgemessen und kein Vorsatz.
 *  · **Nur beim Kriechen.** Ab `speed` ist sie weg. Der Wagen bleibt im
 *    Renntempo ein Hecktriebler, das Heck bricht weiter aus, der Drift bleibt.
 *  · **Sie ist eine Fahrhilfe und keine Physik**, so wie `driftDamping`. Ein
 *    Hecktriebler mit Sperre und Geländeuntersetzung ist damit *nicht*
 *    nachgebildet — er ist ersetzt.
 *
 * `share` = 0,5 ist nicht gegriffen, sondern das Optimum: die übertragbare
 * Summe ist `min(gripVorn/s, gripHinten/(1−s))`, und die wird maximal, wo beide
 * Achsen gleichzeitig an ihrer Grenze liegen. Bei Lastanteilen um 50/50 ist das
 * die Hälfte.
 */
export const CRAWL_ASSIST = {
  /** Antriebsanteil der Vorderachse im Stand, auf losem Boden. */
  share: 0.5,
  /** Ab diesem Tempo ist die Hilfe vollständig weg, m/s. 8 m/s ≙ 29 km/h. */
  speed: 8,
} as const;

export const VEHICLE_COLLISION = {
  /**
   * Blechzuschlag ringsum, in Metern.
   *
   * Der Nachfolger von `cornerRadius` (0,34 m) — und er ist um eine
   * Größenordnung kleiner, weil er eine andere Aufgabe hat. Der Eckradius musste
   * an vier Punkten eine ganze Karosserie **darstellen**; ein Rechteck ist die
   * Karosserie schon. Übrig bleibt der Stoßfänger, der über dem Blech steht: 6 cm.
   *
   * Nebenwirkung, die gemessen und gewollt ist: an einer Leitplanke kommt das
   * Auto seitlich 28 cm näher heran als vorher. Die alte Zahl machte den Wagen
   * an den Ecken 2,3 m breit bei 1,62 m Blech.
   */
  skin: 0.06,

  /**
   * Rückprall — Anteil der Einschlaggeschwindigkeit, der zurückkommt.
   *
   * Niedrig: Blech gegen Leitplanke ist ein Anschlag, kein Flipperball. 0,2
   * genügt, damit man von der Planke wegkommt, ohne an ihr zu kleben.
   */
  restitution: 0.2,

  /**
   * Reibbeiwert zwischen Blech und Hindernis — **μ, nicht ein Anteil je Schritt**.
   *
   * > **Bis P19 stand hier 0,12 mit der Bedeutung „Anteil der
   * > Tangentialgeschwindigkeit, der je Kontakt verschwindet"** und der Rechnung
   * > „ein Streifschuss über 20 m kostet rund ein Viertel des Tempos". Die
   * > Rechnung stimmte für eine Karosserie, die nur an vier Punkten prüft und
   * > deshalb nur gelegentlich anliegt. Mit dem Rechteck aus P19 liegt sie in
   * > **jedem** Schritt an, und derselbe Faktor lässt nach einer Sekunde 0,04 %
   * > des Tempos übrig. Gemessen: 10 km/h an der Planke, bei Vollgas.
   *
   * Der Reibimpuls ist seitdem an den **Normalimpuls** gekoppelt
   * (`|J_t| ≤ μ · |J_n|`, Umsetzung in `Vehicle.#resolveCollision`). 0,45 ist
   * Stahl auf lackiertem Blech mit einem Abschlag dafür, dass eine W-Planke zum
   * Ableiten gebaut ist. Der Wert ist damit eine Materialgröße und keine
   * Zeitschrittgröße — er hängt nicht mehr davon ab, wie oft geprüft wird.
   */
  wallFriction: 0.45,

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
   * Höhenband der Karosserie über der Radaufstandsebene: Unter- und Oberkante.
   *
   * > **Bis P19 waren das *Prüfhöhen*** — eine Liste von Ebenen, in denen die
   * > vier Eckpunkte einzeln abfragten, mit der Begründung „zwei Kontakte an
   * > einer Wand geben dem Ausschieben eine Richtung; einer gibt ihm nur einen
   * > Betrag". Mit einem Rechteck stellt sich die Frage nicht mehr: die Richtung
   * > kommt aus dem SAT, nicht aus der Zahl der Prüfpunkte. Geblieben ist die
   * > Frage, **welchen Höhenbereich** die Karosserie überhaupt abdeckt — und die
   * > beantworten genau zwei Zahlen.
   *
   * 0,30 m ist der Stoßfänger, 0,80 m die Türunterkante. Beide liegen bewusst
   * innerhalb des Leitplankenbands, das von der Fahrbahn bis `RAIL.top` = 0,85 m
   * reicht: ein Band, das erst über der Oberkante anfinge, wäre eine Planke, die
   * man unterfährt.
   */
  band: [0.3, 0.8] as readonly [number, number],

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
 * Größter Abstand zweier Prüfpunkte der Karosserie, in Metern.
 *
 * **Die Lehre aus P19, eine Ebene höher.** Dort stand: *eine Abtastung ist erst
 * dann eine Form, wenn ihr Abstand kleiner ist als das Kleinste, was sie treffen
 * soll.* Vier Eckpunkte über 4,2 m Karosserie ließen einen 40-cm-Stamm
 * hindurch.
 *
 * Das Kleinste, was das Gelände hier zu bieten hat, ist sein **Texelabstand**:
 * das Höhenfeld dieser Karte hat 1,5 m Raster (3072 m auf 2048 Texel), und
 * schmaler als ein Texel kann eine Geländeform nicht sein. 1,4 m liegt darunter
 * und ist damit die Grenze, ab der die Abtastung eine Form ist.
 */
export const HULL_SAMPLE_SPACING = 1.4;

/**
 * Prüfpunkte der Blechunterkante im Fahrzeugsystem bilden — einmal je Spec.
 *
 * Flach als `x, y, z` je Punkt, damit im Schritt weder eine Schleife über
 * Objekte noch eine Allokation nötig ist.
 *
 * **Die Reihen an den Enden und in der Mitte tragen drei Punkte, die dazwischen
 * einen.** Die Enden sind der Überhang — das Stück, das über die Achse hinaus
 * ins Gelände ragt und den ganzen Fehler oben erzeugt hat. Die Mitte ist das
 * Aufsitzen auf einer Kuppe. Dazwischen liegen die **Räder** (`#sampleWheels`
 * prüft dort ohnehin, und zwar mit Hüllkurve), weshalb dort die Mittellinie
 * genügt.
 *
 * Die Unterkante ist `collision.band[0]` über der Radaufstandsebene und damit
 * dieselbe Zahl, mit der die Karosserie gegen Hindernisse prüft. Ein zweiter
 * Wert dafür wäre eine zweite Gelegenheit, sie auseinanderlaufen zu lassen.
 *
 * > **Kein Anlaufwinkel, und das ist eine Messung und keine Auslassung.** Eine
 * > abgeschrägte Unterseite (vorn und hinten ansteigend) war der erste Entwurf.
 * > Sie ist überflüssig: der Anlaufwinkel **ergibt sich** aus dem, was schon
 * > dasteht — `atan(band[0] / Überhang)`. Gerechnet aus den vorhandenen Maßen
 * > sind das 19,0° beim Coupé, 17,2° beim GT (vorn) und 10,9° hinten, und das
 * > sind für einen Straßenwagen und einen Supersportler genau die richtigen
 * > Größenordnungen. Eine zusätzliche Konstante hätte eine bereits gemessene
 * > Geometrie überschrieben.
 */
export function hullSamplePoints(
  bodyLength: number,
  bodyWidth: number,
  underside: number,
): Float64Array {
  const rows = Math.min(7, Math.max(3, Math.ceil(bodyLength / HULL_SAMPLE_SPACING) + 1));
  const middle = (rows - 1) >> 1;
  const hl = bodyLength * 0.5;
  const hw = bodyWidth * 0.5;
  const out: number[] = [];
  for (let r = 0; r < rows; r++) {
    const l = -hl + (r * bodyLength) / (rows - 1);
    const breit = r === 0 || r === rows - 1 || r === middle;
    if (breit) {
      out.push(-hw, underside, l, 0, underside, l, hw, underside, l);
    } else {
      out.push(0, underside, l);
    }
  }
  return Float64Array.from(out);
}



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
  /**
   * Wie weit die Kamera bei `fovSpeed` zusätzlich zurückfällt, in Metern.
   *
   * Zusammen mit dem Bildwinkel die zweite Hälfte des Tempoeindrucks — und die
   * subtilere: der Wagen wird im Bild kleiner, während die Landschaft schneller
   * vorbeizieht. Gegenläufig wäre falsch; eine Kamera, die bei Tempo *näher*
   * kommt, nimmt die Übersicht weg, die man dann am dringendsten braucht.
   */
  distanceFast: 1.6,
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

  /**
   * Blickfeld bei Stillstand, bei `fovSpeed` und im Nitro. Der Zug bei Tempo.
   *
   * > **60 → 68 über 70 m/s war die Einstellung bis P22, und sie war zu brav.**
   * > Tempo entsteht auf einem Bildschirm fast vollständig aus dem
   * > **Bildwinkel** und der Bewegung am Bildrand — nicht aus der Zahl im Tacho.
   * > 8° über einen Bereich, den man auf dieser Karte kaum ausfährt (70 m/s sind
   * > 252 km/h), sind praktisch nichts: bei den 90 km/h, mit denen man den
   * > Bergpass fährt, standen davon 2,9°.
   * >
   * > Jetzt 62 → 82 über 45 m/s (162 km/h). Bei 90 km/h sind das 69,3° statt
   * > 62,9°, und der Unterschied ist der zwischen „fährt" und „rast".
   */
  fov: 62,
  fovFast: 82,
  fovSpeed: 45,
  /**
   * Zusätzlicher Bildwinkel im Nitro, in Grad.
   *
   * Er ist die **Anzeige** des Nitro, nicht seine Wirkung — und die wichtigere
   * Hälfte davon. Ein Boost, der nur die Zahl im Tacho hebt, fühlt sich nicht
   * schnell an; einer, der das Bild aufreißt, schon.
   */
  fovBoost: 9,
  /** Zeitkonstante, mit der das Blickfeld folgt (1/s). Hoch beim Nitro, damit er *schlägt*. */
  fovRate: 3.5,
  fovBoostRate: 9,

  /** Mausempfindlichkeit im Fahrmodus (rad/px) und Nickgrenzen. */
  lookSensitivity: 0.0026,
  /**
   * Nick des **Blicks**, nicht der Kamerahöhe. Positiv = Himmel.
   *
   * Bis hierher war `pitchOffset` an Verfolger und Haube dieselbe Zahl mit
   * entgegengesetzter Bedeutung: `height + arm·sin(pitch)` hebt die Kamera
   * (Blick auf den Boden), die Haube addiert `sin(pitch)` aufs Blickziel
   * (Blick in den Himmel). Maus hoch drehte die Achse beim Umschalten um.
   * Der Boom rechnet seitdem `height − arm·sin(pitch)`, und die Grenzen
   * sind getauscht, damit der alte Bewegungsraum bleibt — mehr nach unten
   * aufs Auto (−1,05) als in den Himmel (0,5).
   */
  pitchMin: -1.05,
  pitchMax: 0.5,

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
  /**
   * Anteil des Aufbau-Nickens an der Haube. Der Kommentar versprach ein
   * Drittel — gemessen war das zusammen mit dem Karosserie-Nicken ein
   * doppelter Nick, und die erste Feel-Runde war damit unspielbar. 0,12
   * lässt die Nase atmen, ohne die Fahrbahn zu kippen.
   */
  hoodPitchBlend: 0.12,

  /**
   * Zeitkonstante, mit der die Kamera die Beschleunigung glättet (1/s).
   *
   * Die Dynamik spitzt auf −19 m/s² bei einer Vollbremsung. Ohne Glättung
   * und ohne Deckel hat die erste Fassung den Arm in 0,45 s um **3 m**
   * reingezogen (7,97 → 5,03 m) — das ist die Messung, nach der alles
   * hier runtergesetzt wurde. 4 folgt der Last, ohne den Spike durchzureichen.
   */
  accelRate: 4,
  /**
   * Extra-Arm je m/s² Gas, und harter Deckel in Metern.
   *
   * Erste Runde: 0,14 × 10 = 1,1 m, unfahrbar neben `distanceFast`.
   * Jetzt 0,035 × 6 ≈ 21 cm, gedeckelt bei 28 cm.
   */
  accelDistance: 0.035,
  accelArmMax: 0.28,
  /**
   * Arm-Kürzung je m/s² Bremse, plus Deckel. Die Bremse der Dynamik
   * liefert leicht −19 m/s² — linear damit zu skalieren war der Fehler.
   * 0,03 × 8 = 24 cm, nie mehr als 32 cm, und der Arm bleibt über
   * `armMinFactor`.
   */
  brakeDistance: 0.03,
  brakeArmMax: 0.32,
  /** Kürzester Arm als Anteil von `distance`. 0,55 lag im Kofferraum. */
  armMinFactor: 0.88,
  /**
   * Mausrad-Zoom auf den Boom. 1 = `distance`. 0,42 ≈ 2,7 m (Stoßstange),
   * 2,4 ≈ 15 m. Logarithmisch über den Delegate, eine Rastung darunter
   * bei Minimum wechselt in die Haube — weiter gibt es von hinten nicht.
   */
  zoomMin: 0.42,
  zoomMax: 2.4,
  /** Zeitkonstante, mit der der Boom dem Rad folgt (1/s). 12 ist eine Rastung, kein Sprung. */
  zoomRate: 12,
  /** Blickfeld-Zug je m/s² Gas, in Grad. 8 m/s² → +0,5°. Das Tempo-FOV (62→82) trägt den Rest. */
  accelFov: 0.06,
  brakeFov: 0.03,
  /** Blickziel nach vorn je m/s² Gas, in Metern. */
  accelLook: 0.012,
  brakeLookDown: 0.003,
  /**
   * Look-ahead in Sekunden, gedeckelt. 0,16 s × 25 m/s war 4 m — der Wagen
   * saß dann im unteren Bilddrittel, weil der Boom am Blickziel hing statt
   * am Auto. 0,05 s / 1,1 m hält ihn im Rahmen.
   */
  lookAhead: 0.05,
  lookAheadMax: 1.1,
  lookLat: 0.012,

  /**
   * Kamerarollen je m/s² Quer. Erste Runde 3,4° bei 10 m/s², Deckel 4° —
   * auf einem Bildschirm ohne Fliehkraft ist das Seekrankheit. Jetzt 1°.
   */
  rollPerLat: 0.0018,
  maxRoll: 0.018,
  rollRate: 4,

  /**
   * Kein Dauer-Rütteln. Ein Sinus auf der Kameraposition sah aus wie ein
   * Glitch — das ganze Bild zuckte, nicht der Wagen. Links/rechts bleibt
   * über Roll und Look-ahead. Übrig ist nur ein einmaliger Landestoß.
   */
  shakeDecay: 16,
  landImpulse: 0.045,

  /**
   * Boom-Kollision. `occludeMin` 0,28 setzte die Kamera auf 1,8 m —
   * in die Karosserie. 0,72 hält sie hinter dem Heck. Rein langsamer
   * als zuvor, sonst ein Ruck an jeder Passwand.
   */
  occludeSamples: 5,
  occludeRateIn: 6,
  occludeRateOut: 2.4,
  occludeMin: 0.72,
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
