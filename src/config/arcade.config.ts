import { GRAVITY } from './vehicle.config';
import type { VehicleId } from './vehicles.config';

/**
 * Das **Arcade-Fahrmodell** — P22.
 *
 * ## Warum das Einspurmodell abgelöst wurde, obwohl es richtig war
 *
 * P14 bis P21 haben ein Einspurmodell mit Schräglaufwinkeln gebaut, geprüft und
 * dreimal repariert. Es ist heute physikalisch stimmig: die Gierstabilitätsreserve
 * liegt bei allen vier Fahrzeugen über 1,3, der Integrator erzeugt keine Energie,
 * die Kennlinie hat einen Anstieg, ein Plateau und einen Abfall.
 *
 * Und es fährt sich trotzdem nicht gut. Der Befund des Auftraggebers lautete
 * „die Physik ist grausam, es ist nicht lustig", und der Prüfstand aus P18 hat
 * ihn — ausnahmsweise — **bestätigt**, man musste nur die richtige Zeile lesen:
 *
 * ```
 * Lenkantwort 90 km/h:  21.8  27.3  26.2  26.3  25.7 °/s  (Lenkung 0,2…1,0)
 * ```
 *
 * Zwischen 20 % und 100 % Lenkeinschlag liegen bei Reisetempo **3,9 °/s**. Die
 * Lenkung ist damit oberhalb eines Fünftels ihres Wegs praktisch ein Schalter,
 * und zwar exakt in dem Tempobereich, in dem das ganze Spiel stattfindet. Die
 * zweite Zeile:
 *
 * ```
 * asphalt   Durchdrehen: Anfahrt  1.11× Bogen  0.88×
 * ```
 *
 * Auf Asphalt bricht das Heck bei Gasstoß im Bogen **nicht** aus (0,88 < 1).
 * Ein Touge-Drift-Spiel, in dem man auf der Straße nicht driften kann.
 *
 * Beides sind keine Fehler des Modells — sie sind seine **Eigenschaften**. Ein
 * Fahrzeug, dessen Querkraft aus Schräglaufwinkeln entsteht, sättigt bei hohem
 * Tempo, und ein Serienauto mit 165 kW dreht auf trockenem Asphalt eben nicht
 * durch. Wer das ändern will, muss die Zahlen so weit verbiegen, bis das Modell
 * kein Modell mehr ist. Also wird das Modell getauscht statt seine Zahlen.
 *
 * > **Was bleibt.** Alles, was P19 bis P21 an der *Welt* gebaut haben —
 * > Radabtastung mit Hüllkurve, Stützebene am Hang, Blech gegen Gelände,
 * > Kollisionsauflösung, Klemmschutz — bleibt unverändert in Gebrauch. Getauscht
 * > ist ausschließlich die **Ebene**: Gieren und die beiden waagerechten
 * > Geschwindigkeiten. Das ist die Schicht, an der „fährt sich gut" hängt, und
 * > es ist die einzige, die je beanstandet wurde.
 *
 * ## Wie das Arcade-Modell rechnet
 *
 * Umgekehrt zum Einspurmodell. Dort erzeugen Reifenkräfte ein Giermoment, und
 * die Drehung ist ihr Ergebnis. Hier ist die **Drehung die Eingabe** und die
 * Seitenkraft ihre Folge:
 *
 * ```
 *   1. Lenkeingabe          → Soll-Gierrate ω*        (kinematisch, grip-gedeckelt)
 *   2. ω folgt ω* mit Rate  → die Nase zeigt, wohin der Spieler will
 *   3. Quergeschwindigkeit  → wird mit `latGrip` gegen null gezogen
 *   4. Was übrig bleibt     → **ist** der Schwimmwinkel
 * ```
 *
 * Der entscheidende Punkt steht in Schritt 3: Die Geschwindigkeit wird in
 * **Weltkoordinaten** geführt (das hat P14 aus gutem Grund so gebaut, siehe
 * `Vehicle.step`). Dreht sich die Nase, bleibt der Geschwindigkeitsvektor stehen
 * — und damit entsteht Quergeschwindigkeit ganz von allein. `latGrip` sagt, wie
 * schnell die Reifen sie wieder einfangen. Hoch = klebt, niedrig = driftet.
 *
 * Daraus folgen drei Eigenschaften, die das Einspurmodell nicht hatte und auch
 * nicht haben konnte:
 *
 *  - **Die Lenkung ist monoton und bleibt es.** ω* ist linear in der Eingabe,
 *    bis der Grip-Deckel greift. Es gibt keinen Bereich, in dem mehr Einschlag
 *    weniger Drehung ergibt.
 *  - **Drift ist eine Entscheidung, kein Unfall.** `drift` ist ein eigener
 *    Zustand zwischen 0 und 1, den Handbremse und Gas-in-der-Kurve hochziehen.
 *    Er senkt `latGrip` und hebt ω — beides zugleich, und beides dosierbar.
 *  - **Gegenlenken wirkt sofort.** Weil ω direkt an der Eingabe hängt, dreht
 *    Gegenlenken die Nase zurück, ohne den Umweg über Schräglauf und Moment.
 *
 * ## Die Regel für jede Zahl in dieser Datei
 *
 * Dieselbe wie in `vehicle.config.ts`: Herleitung, Messung oder ausdrücklich
 * „gewählt". Neu ist eine vierte Sorte, und sie ist hier die häufigste —
 * **Spielgefühl**. Sie unterscheidet sich von „gewählt" dadurch, dass sie eine
 * *Absicht* nennt („der Wagen soll sich mit einer Taste einfangen lassen") und
 * einen Prüfstandslauf, der zeigt, dass die Absicht eintritt
 * (`tools/bench/arcade.mts`). Was sie nicht kann, ist sagen, ob es Spaß macht.
 */

/** Was ein Fahrzeug im Arcade-Modell ausmacht. */
export interface ArcadeSpec {
  /**
   * Größte Querbeschleunigung auf trockenem Asphalt, in g.
   *
   * Ersetzt `TIRE.gripAsphalt` als **Kurventempo-Regler**. Der Unterschied ist
   * die Bedeutung: μ ist der Reibbeiwert eines Reifens und hat einen Wertebereich,
   * den die Wirklichkeit vorgibt (0,9…1,5). Dieser Wert hier ist die
   * Querbeschleunigung, die das Spiel zulässt, und er darf darüber liegen —
   * ein Arcade-Spiel bildet keinen Reifen nach, es bildet ein *Gefühl* nach.
   *
   * 1,45 g beim Coupé sind rechnerisch die 17,95-m-Kehre des Bergpasses bei
   * **57 km/h** (`v = √(a·r)`) statt 47 km/h mit μ = 1,0. Das ist der
   * Unterschied zwischen „man kriecht durch die Kehre" und „man wirft den Wagen
   * hinein".
   */
  readonly latG: number;

  /**
   * Wie schnell die Reifen Quergeschwindigkeit einfangen, in 1/s.
   *
   * **Der wichtigste Wert dieser Datei.** Er ist die Zeitkonstante, mit der der
   * Schwimmwinkel abgebaut wird: bei 10/s ist er nach 0,1 s auf 37 %, bei 2/s
   * erst nach 0,5 s. Hoch heißt „klebt an der Straße", niedrig heißt „segelt".
   *
   * Gedeckelt wird er von `latG` — mehr als die Haftgrenze kann er nicht
   * abbauen. Er beschreibt also, wie *schnell* das Budget ausgeschöpft wird,
   * nicht wie groß es ist.
   */
  readonly latGrip: number;

  /**
   * Dasselbe im Drift. Der Abstand zwischen beiden **ist** der Drift.
   *
   * 1,8/s heißt: der Schwimmwinkel hält sich rund eine halbe Sekunde von selbst.
   * Darunter wird der Drift zum Eiskunstlauf, darüber fängt sich der Wagen von
   * allein, bevor der Spieler etwas davon hat.
   */
  readonly driftLatGrip: number;

  /**
   * Wie schnell die Gierrate ihrem Sollwert folgt, in 1/s.
   *
   * Das ist die **Reaktionszeit der Lenkung** und damit die Zahl, an der
   * „reagiert sofort" gegen „schwammig" steht. 12/s heißt: nach 83 ms steht
   * 63 % der Solldrehung. Ein Lastwagen bekommt hier weniger, und man merkt es
   * sofort — das ist die Absicht.
   */
  readonly yawResponse: number;

  /**
   * Schwimmwinkel, den ein voller Drift anstrebt, in Radiant.
   *
   * ## Warum hier ein **Winkel** steht und keine Gierrate
   *
   * Der erste Entwurf addierte im Drift eine feste Gierrate. Gemessen war das
   * ein Kreisel, und die Rechnung sagt auch warum: im **stationären** Drift
   * dreht sich die Nase genau so schnell wie die Bahn, sonst wüchse der Winkel
   * weiter. Die Bahnkrümmung ist aber `a_lat / v` und damit durch die Haftung
   * gedeckelt. Eine Gierrate *über* diesem Deckel hat keinen Gleichgewichtspunkt
   * — der Schwimmwinkel wächst, bis der Wagen rückwärts fährt.
   *
   * Angefordert wird deshalb der **Winkel**, und die Gierrate ist das Mittel:
   *
   * ```
   *   ω = ω_Bahn + driftYawGain · (driftAngle − β)     nur solange β < driftAngle
   * ```
   *
   * Damit ist der Zuschlag beim Anriss groß (das Heck kommt), im gehaltenen
   * Drift null (der Winkel steht), und beim Auslaufen negativ, weil `latGrip`
   * übernimmt. Ein Gleichgewicht gibt es per Konstruktion, und es liegt bei
   * `driftAngle`.
   *
   * 0,75 rad ≙ **43°** beim Coupé. Das ist ein deutlich sichtbarer Drift, den
   * die Verfolgerkamera mit `velocityBlend` = 0,55 auch zeigt — und er liegt
   * unter `DRIFT_MAX_ANGLE` (80°), zählt also voll.
   */
  readonly driftAngle: number;
  /** Wie schnell der Drift-Winkel angefahren wird, in 1/s. */
  readonly driftYawGain: number;

  /**
   * Wie leicht Gas in der Kurve einen Drift auslöst, 0…1.
   *
   * Multipliziert mit `Gas × |Lenkung|`. 0,9 beim Coupé heißt: Vollgas bei
   * halbem Einschlag ergibt 45 % Drift — spürbar, aber noch keine Pirouette.
   * Beim Allradler steht hier weniger, weil ein Allradler am Kurvenausgang
   * zieht statt auszubrechen.
   */
  readonly powerOversteer: number;

  /**
   * Wie schnell `drift` auf- und abgebaut wird, in 1/s (auf / ab).
   *
   * Getrennt, weil sie verschiedene Dinge beschreiben: der Aufbau ist der
   * Anriss (schnell, sonst fühlt sich die Handbremse tot an), der Abbau ist das
   * Auslaufen (langsamer, sonst schnappt der Wagen zurück).
   */
  readonly driftRise: number;
  readonly driftFall: number;

  /**
   * Wie stark der Wagen sich selbst fängt, wenn der Spieler das Lenkrad
   * loslässt, in 1/s.
   *
   * **Die einzige Fahrhilfe des Modells, und sie steht hier offen statt
   * versteckt.** Mit Tastatur kann man den Gegenlenkwinkel nicht dosieren, nur
   * an/aus; ohne diesen Term endet jeder Drift über 40° im Kreisel. Sie zieht
   * die Nase in Richtung der **Fahrtrichtung** und ist bei gedrücktem
   * Lenkeinschlag null — sie kann also nichts verfälschen, was der Spieler
   * selbst tut.
   */
  readonly catchAssist: number;

  /**
   * Größte Gierrate, rad/s. Deckel gegen Kreisel nach einem Anschlag.
   */
  readonly maxYawRate: number;

  /**
   * Antriebskraft bei Stillstand, in Newton — der erste Gang.
   *
   * Ersetzt `maxDriveForce × (1 + launchBoost)`. Ein Wert statt zwei, weil die
   * Trennung zwischen „Kraft" und „Überhöhung" im Arcade-Modell nichts mehr
   * bedeutet: es gibt kein Getriebe, das nachgebildet werden müsste.
   */
  readonly launchForce: number;

  /** Antriebsleistung in Watt. Bestimmt oberhalb `launchForce/P` das Tempo. */
  readonly power: number;

  /** Bremsverzögerung in g. Arcade: deutlich über dem Reibwert, das darf sie. */
  readonly brakeG: number;

  /**
   * Nitro — Zusatzbeschleunigung in m/s², Vorrat in Sekunden, Nachfüllrate.
   *
   * **Kein Realismus, sondern ein Knopf, der Spaß macht.** Auf CrazyGames ist
   * Boost die Belohnung für Drift und Airtime; er ist der Grund, warum man einen
   * Drift *riskiert* statt bloß die Ideallinie zu fahren.
   */
  readonly boostAccel: number;
  readonly boostCapacity: number;
  /**
   * Grundnachfüllung je Sekunde, als Anteil des Vorrats.
   *
   * **Bewusst klein (0,05 ≙ 20 s für eine volle Füllung).** Sie ist die
   * Sicherung dafür, dass niemand dauerhaft ohne Nitro dasteht — verdient wird
   * er über `BOOST_EARN`, also über Drift und Airtime. Eine große
   * Grundnachfüllung machte die ganze Schleife bedeutungslos: wer ohnehin alle
   * paar Sekunden nachtankt, driftet nicht dafür.
   *
   * Gemessen mit 0,10: der Prüfstand kam auf **6,6 s Brenndauer** bei 3,2 s
   * Vorrat — der Nitro lief also länger, als er reichen dürfte.
   */
  readonly boostRefill: number;

  /** Luftwiderstand `F = c·v²`, N/(m/s)². */
  readonly drag: number;
  /** Rollwiderstand als Verzögerung in m/s² auf Asphalt. */
  readonly rollDecel: number;
  /** Abtrieb als Anteil zusätzlicher Querhaftung bei `downforceSpeed`. */
  readonly downforce: number;

  /** Höchster Radeinschlag für die **Anzeige** und die Kinematik, rad. */
  readonly steerAngle: number;
  /** Wie schnell der Einschlag der Taste folgt, 1/s (ein / zurück). */
  readonly steerRate: number;
  readonly steerReturn: number;
  /**
   * Tempo, bei dem der nutzbare Einschlag auf die Hälfte fällt, m/s.
   *
   * **Deutlich höher als im Einspurmodell (26 m/s).** Dort musste die Lenkung
   * gedrosselt werden, weil die Reifenkräfte bei hohem Tempo sonst sprangen;
   * hier deckelt die Grip-Grenze ohnehin. 55 m/s (198 km/h) heißt: bei 130 km/h
   * stehen noch 60 % Einschlag statt 42 %, und bei 200 km/h ist die Lenkung
   * ruhig, ohne tot zu sein.
   */
  readonly steerFalloff: number;
}

/**
 * Beiwerte der Beläge, als Anteil von `latG` und der Längshaftung.
 *
 * **Vier Zahlen statt zwölf.** Das Einspurmodell hatte je Fahrzeug einen eigenen
 * Wert für Kies, Gelände und Wasser — 12 Zahlen für einen Effekt, den man in
 * einem Satz beschreiben kann. Der Unterschied *zwischen* Fahrzeugen auf losem
 * Boden steckt jetzt in `looseBonus`; das ist eine Zahl je Fahrzeug statt drei.
 */
export const ARCADE_SURFACE = {
  asphalt: 1.0,
  /** Feldweg, Tempelaufgang. Rutschig genug, dass man es merkt. */
  kies: 0.78,
  /** Wiese, Waldboden, Reisterrasse. */
  gelaende: 0.7,
  /** Wasser. Lenkbar, aber jeder Impuls rutscht. */
  wasser: 0.45,
} as const;

/**
 * Zusätzliche Dämpfung durch den Untergrund, in 1/s: `a = −k · v`.
 *
 * Der zweite Grund, warum Abkürzen über die Wiese nicht lohnt (der erste ist
 * der geringere Grip). Ohne ihn wäre die Straße auf einer Karte mit 101 ha
 * Reisfeld bedeutungslos.
 *
 * > **Der erste Entwurf stand hier als konstante Verzögerung in m/s²** (Wiese
 * > 3,2). Das ist bei Tempo richtig und im Kriechgang eine Katastrophe: eine
 * > Verzögerung, die *unabhängig vom Tempo* wirkt, frisst genau die Kraft, mit
 * > der ein stehender Wagen sich in Bewegung setzt.
 * >
 * > Gemessen mit `tools/bench/world.mts` auf 90 s Zufallsgelände, schlechtestes
 * > Vier-Sekunden-Fenster mit Gas: Lastwagen **0,58 m**, Offroader 0,96 m — der
 * > Prüfstand meldete „kommt von der Stelle" als knapp bestanden, tatsächlich
 * > stand der Wagen. Mit einer geschwindigkeitsproportionalen Dämpfung (wie sie
 * > das Einspurmodell als `terrainDrag` hatte) ist der Term bei null Tempo
 * > exakt null und bei 20 m/s so groß wie zuvor.
 *
 * 0,22/s auf der Wiese sind bei 20 m/s 4,4 m/s² — mehr als der alte
 * Festbetrag —, bei 2 m/s aber nur 0,44 m/s².
 */
export const ARCADE_SURFACE_DRAG = {
  asphalt: 0,
  kies: 0.09,
  gelaende: 0.22,
  wasser: 0.55,
} as const;

/**
 * Bezugstempo im Nenner des Gierdeckels, m/s.
 *
 * `ω ≤ a_lat / v` geht bei `v → 0` gegen unendlich; darunter begrenzt der
 * Lenkeinschlag ohnehin. 4 m/s (14 km/h) ist der Punkt, ab dem die Grip-Grenze
 * übernimmt — darunter rangiert man, und dort soll der Wagen wendig sein.
 */
export const YAW_CAP_SPEED = 4;

/**
 * Ab diesem Tempo zählt ein Drift, m/s.
 *
 * 6 m/s (22 km/h). Darunter gibt es keinen Drift, sondern nur ein Auto, das
 * beim Rangieren mit der Handbremse spielt — und ein Drift-Punktezähler, der
 * dort anspringt, wäre in der ersten Minute kaputtgespielt.
 */
export const DRIFT_MIN_SPEED = 6;

/**
 * Schwimmwinkel, ab dem die Punktezählung einen Drift anerkennt, in Radiant.
 *
 * 12°. Darunter ist es eine schnell gefahrene Kurve. Der Wert ist zugleich die
 * Schwelle, ab der Reifenrauch und Spuren erscheinen — eine Zahl für beides,
 * damit die Anzeige nicht behauptet, was die Punkte nicht zählen.
 */
export const DRIFT_SCORE_ANGLE = 0.21;

/**
 * Größter anerkannter Schwimmwinkel, in Radiant.
 *
 * 80°. Darüber steht der Wagen quer und dreht sich, das ist kein Drift mehr.
 * Ein Zähler ohne diese Grenze belohnt den Kreisel, und der Kreisel ist die
 * billigste Punktequelle, die es gibt.
 */
export const DRIFT_MAX_ANGLE = 1.4;

/**
 * Luftsteuerung — P22.
 *
 * Ohne sie ist jeder Sprung ein Glücksspiel, und ein Sprung, der Glücksspiel
 * ist, wird nicht wiederholt. Die Zahlen sind Winkelbeschleunigungen in rad/s²;
 * sie wirken nur, solange kein Rad trägt.
 */
export const AIR_CONTROL = {
  /** Gieren mit der Lenkung. */
  yaw: 2.2,
  /** Nicken mit Gas (Nase hoch) und Bremse (Nase runter). */
  pitch: 2.8,
  /** Dämpfung, damit der Wagen nicht endlos trudelt. */
  damping: 1.4,
  /** Größte Nick-Auslenkung im Flug, rad. */
  maxPitch: 0.7,
} as const;

/**
 * Wie viel Nitro ein Drift und ein Sprung einbringen — Anteil des Vorrats je
 * Sekunde.
 *
 * **Das ist die Schleife des ganzen Spiels**, und sie ist bewusst so kurz: Drift
 * gibt Boost, Boost gibt Tempo, Tempo gibt längere Sprünge, Sprünge geben Boost.
 * Wer das entkoppelt, bekommt ein Fahrspiel mit einem Boost-Knopf statt ein
 * Spiel, in dem man driftet, *weil* es sich lohnt.
 */
export const BOOST_EARN = {
  /** Voller Drift, je Sekunde. */
  drift: 0.34,
  /** In der Luft, je Sekunde. */
  air: 0.5,
  /** Ein zerbrochenes Hindernis. */
  smash: 0.12,
} as const;

function speedFromPower(power: number, drag: number): number {
  return Math.cbrt(power / drag);
}

/**
 * Die vier Datensätze.
 *
 * Sie stehen absichtlich **kompakt** beieinander statt je Fahrzeug in einem
 * eigenen Block mit Fließtext: Fahrzeugabstimmung ist ein Vergleich, und ein
 * Vergleich, den man scrollen muss, findet nicht statt. Was ein Wert bedeutet,
 * steht einmal oben an `ArcadeSpec`; was ein *Fahrzeug* ausmacht, steht in
 * seiner Zeile.
 */
export const ARCADE: Readonly<Record<VehicleId, ArcadeSpec>> = {
  /**
   * **Touge** — der Standardwagen. Gutmütig, driftfreudig, mittelschnell.
   * Er ist die Referenz: jede Zahl der anderen drei liest sich gegen diese.
   */
  touge: {
    latG: 1.45,
    latGrip: 9.0,
    driftLatGrip: 1.8,
    yawResponse: 12,
    driftAngle: 0.75,
    driftYawGain: 4.0,
    powerOversteer: 0.9,
    driftRise: 7,
    driftFall: 2.6,
    catchAssist: 3.4,
    maxYawRate: 3.6,
    // 12 000 N bei 1150 kg = 10,4 m/s² ≙ 1,06 g. 0–100 in rund 3,4 s, wenn die
    // Leistung nicht vorher begrenzt. Das ist schneller als die 4,62 s des
    // Einspurmodells und ausdrücklich so gewollt: auf einem Portal entscheidet
    // die erste halbe Minute, und in ihr fährt niemand 100 km/h aus.
    launchForce: 12_000,
    power: 210_000,
    brakeG: 1.9,
    boostAccel: 6.0,
    boostCapacity: 3.2,
    boostRefill: 0.05,
    // v_max = ∛(210000/0,42) = 79,3 m/s = 285 km/h.
    drag: 0.42,
    rollDecel: 0.35,
    downforce: 0.1,
    steerAngle: 0.62,
    steerRate: 5.2,
    steerReturn: 7.0,
    steerFalloff: 55,
  },

  /**
   * **GT** — schnell, spitz, wenig Vorwarnung. Er belohnt saubere Linien und
   * bestraft den Gasstoß in der Kurve stärker als jedes andere Fahrzeug.
   */
  gt: {
    latG: 1.75,
    latGrip: 12,
    driftLatGrip: 1.5,
    yawResponse: 14,
    driftAngle: 0.62,
    driftYawGain: 4.4,
    powerOversteer: 1.0,
    driftRise: 8,
    driftFall: 2.2,
    catchAssist: 3.0,
    maxYawRate: 3.4,
    launchForce: 22_000,
    power: 560_000,
    brakeG: 2.3,
    boostAccel: 7.5,
    boostCapacity: 3.6,
    boostRefill: 0.05,
    // v_max = ∛(560000/0,6) = 95,7 m/s = 344 km/h.
    drag: 0.6,
    rollDecel: 0.3,
    downforce: 0.35,
    steerAngle: 0.54,
    steerRate: 5.6,
    steerReturn: 7.6,
    steerFalloff: 68,
  },

  /**
   * **Offroad** — auf Asphalt der langsamste Kurvenwagen, auf allem anderen der
   * schnellste. `looseBonus` ist der Kern seiner Existenzberechtigung.
   */
  offroad: {
    latG: 1.15,
    latGrip: 7.0,
    driftLatGrip: 2.4,
    yawResponse: 9,
    driftAngle: 0.7,
    driftYawGain: 3.4,
    // Allrad zieht am Kurvenausgang, statt auszubrechen.
    powerOversteer: 0.45,
    driftRise: 6,
    driftFall: 3.0,
    catchAssist: 4.2,
    maxYawRate: 3.0,
    launchForce: 17_000,
    power: 290_000,
    brakeG: 1.7,
    boostAccel: 6.0,
    boostCapacity: 3.4,
    boostRefill: 0.06,
    // v_max = ∛(290000/1,3) = 61,2 m/s = 220 km/h.
    drag: 1.3,
    rollDecel: 0.42,
    downforce: 0,
    steerAngle: 0.6,
    steerRate: 4.2,
    steerReturn: 5.6,
    steerFalloff: 42,
  },

  /**
   * **Lastwagen** — schwer, träge, und deshalb ein eigenes Spiel: er ist das
   * Fahrzeug, mit dem Zerbrechliches am meisten Spaß macht.
   */
  truck: {
    latG: 0.95,
    latGrip: 5.5,
    driftLatGrip: 2.2,
    yawResponse: 6,
    driftAngle: 0.5,
    driftYawGain: 2.4,
    powerOversteer: 0.5,
    driftRise: 4.5,
    driftFall: 2.4,
    catchAssist: 4.6,
    maxYawRate: 1.9,
    launchForce: 62_000,
    power: 420_000,
    brakeG: 1.2,
    boostAccel: 4.5,
    boostCapacity: 4.0,
    boostRefill: 0.05,
    // v_max = ∛(420000/3,6) = 49,3 m/s = 177 km/h. Deutlich über den 115 km/h
    // des Einspurmodells — ein Lastwagen, der die Ringstraße nicht mithält, wird
    // einmal ausprobiert und nie wieder gewählt.
    drag: 3.6,
    rollDecel: 0.3,
    downforce: 0,
    steerAngle: 0.58,
    steerRate: 3.0,
    steerReturn: 3.8,
    steerFalloff: 34,
  },
} as const;

/**
 * Wie viel besser ein Fahrzeug auf losem Boden ist, als Faktor auf
 * `ARCADE_SURFACE`.
 *
 * Eine Zahl je Fahrzeug statt drei (Kies, Gelände, Wasser). Der Offroader
 * kommt damit auf Wiese auf 0,7 × 1,3 = 0,91 der Asphalthaftung — er verliert
 * dort fast nichts, und genau das ist sein Charakter.
 */
export const LOOSE_BONUS: Readonly<Record<VehicleId, number>> = {
  touge: 1.0,
  gt: 0.82,
  offroad: 1.3,
  truck: 0.95,
};

/** Endgeschwindigkeit aus Leistung und Luftwiderstand — für Anzeige und Prüfstand. */
export function topSpeed(spec: ArcadeSpec): number {
  return speedFromPower(spec.power, spec.drag);
}

/** Größte Querbeschleunigung in m/s², ohne Abtrieb. */
export function latAccel(spec: ArcadeSpec): number {
  return spec.latG * GRAVITY;
}
