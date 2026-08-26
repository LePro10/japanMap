import {
  CHASSIS,
  DRIVETRAIN,
  GRAVITY,
  STEERING,
  SUSPENSION,
  TIRE,
  VEHICLE_COLLISION,
  hullSamplePoints,
} from './vehicle.config';

/**
 * Die Fahrzeugliste — P18.
 *
 * ## Warum es diese Datei gibt
 *
 * Bis P17 war das Fahrmodell auf **ein** Auto verdrahtet: `Vehicle.ts` las
 * `CHASSIS.mass` und `TIRE.gripAsphalt` als Modulkonstanten. Solange es ein
 * Fahrzeug gab, war das die einfachste mögliche Lösung und richtig so. Für vier
 * ist es keine mehr — und die naheliegende Abkürzung („eine zweite
 * Vehicle-Klasse mit anderen Zahlen") wäre der Fehler, den dieses Projekt schon
 * zweimal gemacht hat: zwei Implementierungen derselben Sache, die auseinander
 * laufen, sobald jemand nur eine davon repariert.
 *
 * Deshalb: **eine** Physik, vier Datensätze. `Vehicle` bekommt eine
 * `VehicleSpec` und liest alles aus ihr. Was hier steht, ist ausschließlich
 * Zahlenmaterial.
 *
 * ## Woher die Zahlen kommen
 *
 * Es gilt dieselbe Regel wie in `vehicle.config.ts` (PLAN.md P9, „Risiken"):
 * *jeder Parameter bekommt eine Messung, oder er bekommt keinen Wert.* Drei
 * Quellen sind zulässig, und jede Zahl sagt, welche es ist:
 *
 *  1. **Herleitung** — aus einer Gleichung, die dabeisteht.
 *  2. **Messung** — aus einem Lauf des Prüfstands (`tools/bench/`), mit dem
 *     Ergebnis daneben.
 *  3. **Vorbild** — ein Maß aus der Wirklichkeit (Radstand, Leergewicht). Dann
 *     steht das Vorbild dabei.
 *
 * Vier Größen werden für **jedes** Fahrzeug ausgerechnet; der Prüfstand
 * `tools/bench/fleet.mts` gibt sie als Tabelle aus und ist die Quelle der
 * Zahlen in `VEHICLE_SHEET` weiter unten:
 *
 *  - die **Gierstabilitätsreserve** `b·C_h / (a·C_v)` — muss über 1 liegen,
 *    sonst dreht sich der Wagen bei jeder Störung von selbst aus der Bahn
 *    (Herleitung bei `TIRE.peakSlipFront`);
 *  - die **Durchdrehgrenze**: welche Antriebskraft es unter Lastverlagerung
 *    braucht, damit die angetriebene Achse die Haftung verliert;
 *  - die **Endgeschwindigkeit** aus dem Gleichgewicht mit dem Luftwiderstand;
 *  - die **statische Einfederung** als Anteil des Federwegs.
 *
 * ## Was **nicht** je Fahrzeug einstellbar ist
 *
 * `SURFACE_FEEL` (Belagsrütteln, Aquaplaning), `WATER_PHYS` und `CHASE_CAMERA`
 * bleiben global. Sie beschreiben die **Karte** und die **Kamera**, nicht das
 * Fahrzeug; ein Reisfeld ist für einen Lastwagen nicht nasser als für ein Coupé.
 */

export type VehicleId = 'touge' | 'gt' | 'offroad' | 'truck';

/**
 * Welche Achse zieht.
 *
 * Bis P17 gab es das nicht: `driveForce` ging vollständig auf die Hinterachse,
 * und `usedFront` kannte nur die Bremse. Für einen Allradler ist das kein
 * Feintuning, sondern der Unterschied zwischen „fährt im Gelände" und „gräbt
 * sich ein".
 */
export type DriveLayout = 'rwd' | 'fwd' | 'awd';

export interface ChassisSpec {
  /** Leergewicht plus Fahrer, kg. */
  readonly mass: number;
  readonly wheelbase: number;
  readonly track: number;
  /** Anteil der Last auf der Vorderachse im Stand, 0…1. */
  readonly frontWeight: number;
  readonly cgHeight: number;
  /** Giermassenträgheit um die Hochachse, kg·m². */
  readonly yawInertia: number;
  readonly wheelRadius: number;
  readonly wheelWidth: number;
  /** Maße des Kollisionskastens. Das Blech ist schmaler — siehe `body`. */
  readonly bodyLength: number;
  readonly bodyWidth: number;
  readonly bodyHeight: number;
}

export interface SuspensionSpec {
  readonly travel: number;
  readonly stiffness: number;
  readonly damping: number;
  readonly bumpStopFactor: number;
  readonly maxLoadFactor: number;
  readonly attitudeRate: number;
  readonly rollPerLateralG: number;
  readonly pitchPerLongitudinalG: number;
  readonly maxRoll: number;
  readonly maxPitch: number;
}

export interface TireSpec {
  readonly peakSlipFront: number;
  readonly peakSlipRear: number;
  readonly gripAsphalt: number;
  readonly tailGrip: number;
  readonly plateauWidth: number;
  readonly falloffSlipFront: number;
  readonly falloffSlipRear: number;
  readonly rearGripFactor: number;
  readonly gripGravel: number;
  readonly gripTerrain: number;
  readonly gripWater: number;
  readonly lateralReserve: number;
  readonly lockedLateralFactor: number;
}

export interface DrivetrainSpec {
  readonly layout: DriveLayout;
  /**
   * Anteil der Antriebskraft auf der Vorderachse, 0…1.
   *
   * Wird aus `layout` abgeleitet und nur bei `awd` von Hand gesetzt. Ein eigenes
   * Feld statt einer Ableitung im Code, weil ein Allradler mit 40 % vorn sich
   * anders fährt als einer mit 50 % — und das ist eine Fahrzeugeigenschaft.
   */
  readonly frontShare: number;
  readonly power: number;
  readonly maxDriveForce: number;
  /**
   * Kraftüberhöhung bei niedrigem Tempo — der erste Gang, ohne Getriebe.
   *
   * **Das ist die Reparatur des Befunds „die Hinterachse dreht auf Asphalt nie
   * durch".** `F = min(F_max, P/v)` mit konstantem `F_max` ist ein Auto mit
   * *einem* Gang. Ein echtes Getriebe vervielfacht das Motormoment im ersten
   * Gang um den Faktor 3…4, und genau deshalb kann man an der Ampel die Räder
   * durchdrehen lassen — nicht, weil der Motor mehr Leistung hätte.
   *
   * Wirkt als `F_max · (1 + launchBoost · e^(−v / launchSpeed))`. Bei `v = 0`
   * steht die volle Überhöhung, nach `launchSpeed` ist sie auf 37 % gefallen,
   * nach dem Dreifachen praktisch weg. Die Endgeschwindigkeit bleibt unberührt —
   * dort begrenzt ohnehin `P/v`.
   */
  readonly launchBoost: number;
  /** Abklingtempo der Überhöhung, m/s. */
  readonly launchSpeed: number;
  readonly brakeForce: number;
  readonly brakeBias: number;
  readonly handbrakeForce: number;
  readonly throttleRate: number;
  readonly reverseMaxSpeed: number;
  readonly reverseForceFactor: number;
  /**
   * Motorbremse beim Gaswegnehmen, N.
   *
   * Bis P17 gab es sie nicht: ohne Gas wirkten allein Luftwiderstand und
   * Rollreibung. Gemessen rollte das Coupé von 161 auf 114 km/h in 20 s — ein
   * Segelflug. Ein Verbrenner im Schub bremst mit rund einem Zehntel seines
   * Antriebsmoments, ein Lastwagen mit Motorstaubremse mit deutlich mehr;
   * deshalb ist das eine Zahl je Fahrzeug und kein globaler Faktor.
   *
   * Wirkt erst oberhalb `ENGINE_BRAKE_FLOOR` und läuft dort linear ein — sonst
   * bremst ein stehendes Auto sich selbst rückwärts.
   */
  readonly engineBrake: number;
  readonly drag: number;
  /**
   * Abtrieb, N pro (m/s)². `Fz += downforce · v²`.
   *
   * > **Diese Zahl stand von P14 an in `DRIVETRAIN` und wurde nie gelesen** —
   * > `grep -c 'DRIVETRAIN\.downforce' src/` ergab **0**. Die vierte tote
   * > Stellschraube dieses Projekts nach `viewDistance`, `shadowCascades` und
   * > `minSpinGrip`, und die einzige, die nicht einmal falsch angewandt war,
   * > sondern gar nicht.
   *
   * Jetzt angewandt, und deshalb neu bemessen. Für das Coupé heißt „ehrlich"
   * fast null: ein Serienauto der Achtziger erzeugt bei 180 km/h **Auftrieb**,
   * keinen Abtrieb. Für den Supersportler ist es das Merkmal, an dem er sich
   * bei Tempo von allen anderen unterscheidet.
   */
  readonly downforce: number;
  readonly rollingResistance: number;
  readonly rollingResistanceTerrain: number;
  readonly rollingResistanceWater: number;
  readonly waterDrag: number;
  readonly terrainDrag: number;
  readonly gravelDrag: number;
}

export interface SteeringSpec {
  readonly maxAngle: number;
  readonly rate: number;
  readonly centerRate: number;
  readonly speedFalloff: number;
  readonly driftDamping: number;
  readonly releaseDamping: number;
}

/**
 * Grenzen, die bis P17 Modulkonstanten in `Vehicle.ts` waren.
 *
 * Sie mussten heraus, weil `MAX_YAW_RATE = 8` für einen Lastwagen eine sinnlose
 * Zahl ist: 8 rad/s sind 1,3 Umdrehungen je Sekunde, und ein 7,8-Tonner mit
 * 4,6 m Radstand tut das nicht. Ein Deckel, der nie greift, ist kein Deckel.
 */
export interface LimitsSpec {
  /** Größte Gierrate, rad/s. */
  readonly maxYawRate: number;
  /** Bezugstempo im Nenner des Schräglaufwinkels, m/s. Begründung in `Vehicle.ts`. */
  readonly slipSpeedFloor: number;
  /** Unter diesem Tempo hält die Haftreibung statisch, m/s. */
  readonly staticHoldSpeed: number;
}

export interface CollisionSpec {
  readonly skin: number;
  readonly restitution: number;
  readonly wallFriction: number;
  readonly yawTransfer: number;
  readonly band: readonly [number, number];
  readonly maxPushPerStep: number;
}

/**
 * Was die Karosserie aussehen lässt — gelesen allein von `carMesh.ts`.
 *
 * Die Maße hier sind **Blechmaße** und nicht die Kollisionsmaße aus `chassis`.
 * Der Unterschied hat in P14 ein Auto ohne Räder erzeugt: das Blech nahm die
 * Kollisionsbreite, das Rad stand 3,5 cm darüber hinaus und war von hinten
 * unsichtbar. Seitdem sind es zwei Zahlen, und `hullWidth` ist die, die
 * **schmaler** sein muss als `track + wheelWidth`.
 */
export interface BodySpec {
  /** Bauform — entscheidet, welche Bauteile `carMesh` zusammensetzt. */
  readonly shape: 'coupe' | 'supercar' | 'suv' | 'truck';
  /** Blechbreite des Unterbaus. */
  readonly hullWidth: number;
  /** Blechlänge. */
  readonly hullLength: number;
  /** Oberkante des Aufbaus über Grund. */
  readonly roofHeight: number;
  readonly paint: number;
  readonly paintDark: number;
  readonly glass: number;
  readonly rim: number;
  readonly trim: number;
}

export interface VehicleSpec {
  readonly id: VehicleId;
  /** Name in der Oberfläche. */
  readonly name: string;
  /** Eine Zeile Charakter — steht in der Fahrzeugwahl unter dem Namen. */
  readonly blurb: string;
  readonly chassis: ChassisSpec;
  readonly suspension: SuspensionSpec;
  readonly tire: TireSpec;
  readonly drivetrain: DrivetrainSpec;
  readonly steering: SteeringSpec;
  readonly limits: LimitsSpec;
  readonly collision: CollisionSpec;
  readonly body: BodySpec;
  /** Einmal ausgerechnete Ableitungen — siehe `derive()`. */
  readonly derived: VehicleDerived;
}

/**
 * Was sich aus der Spec ergibt und nicht in jedem Schritt neu gerechnet gehört.
 *
 * Bis P17 standen diese Werte als Modulkonstanten in `Vehicle.ts`
 * (`CG_TO_FRONT`, `SPRING_REST`, `WHEEL_MAX_DROP`, …). Sie *dort* zu lassen und
 * nur die Eingaben auszutauschen wäre der teuerste Fehler dieser Umstellung
 * gewesen: die Konstanten hätten weiter für das Coupé gegolten, während die
 * Physik mit den Zahlen des Lastwagens rechnet. Genau die Sorte Fehler, die
 * keine Kennzahl meldet — das Auto führe, nur eben falsch.
 */
export interface VehicleDerived {
  /** Abstand Schwerpunkt → Vorderachse. */
  readonly cgToFront: number;
  /** Abstand Schwerpunkt → Hinterachse. */
  readonly cgToRear: number;
  /** Einfederung im Stand, m. */
  readonly staticCompression: number;
  /** Ruhelage der Federung über der Aufstandsfläche. */
  readonly springRest: number;
  readonly wheelMaxDrop: number;
  readonly wheelMinDrop: number;
  /** Reichweite der Stützebene — Federweg plus Nachlauf. */
  readonly supportReach: number;
  /** Deckel auf die Federkraft, N. `mass · g · maxLoadFactor`, einmal gerechnet. */
  readonly springCap: number;
  /**
   * Kleinster Abstand des Schwerpunkts über dem **tiefsten** Radaufstandspunkt,
   * in Metern — P19.
   *
   * Das ist eine geometrische Schranke und keine Federeigenschaft: **ein Rad
   * kann nicht durch den Kotflügel.** Bei voll eingefederter Achse ist der
   * Abstand `springRest − travel`; die 30 % darüber sind der Gummipuffer, der
   * sich noch zusammendrücken lässt.
   *
   * > **Warum es diese Schranke braucht — der Lastwagen, der im Boden versinkt.**
   * > Die Federkraft ist auf `springCap` = 3 · m · g gedeckelt (Begründung bei
   * > `SUSPENSION.maxLoadFactor`, und der Deckel ist richtig). Aus 1,5 m Fallhöhe
   * > sind das 0,74 m Einfederweg — mehr als `supportReach` = 0,50 m. Und damit
   * > schnappt die Falle zu: `reachableSupport` erklärt die vier Räder für
   * > **unerreichbar**, weil sie zu weit *über* dem Aufbau liegen, gibt
   * > `expected − UNSUPPORTED_DROP` zurück, die Federkraft wird null, und der
   * > Wagen fällt weiter — bis ihn der Bodenfang bei `Geländehöhe + r/2` auffängt.
   * > Dort liegt er dann für immer: zu tief, als dass seine eigenen Räder den
   * > Boden je wieder erreichen könnten.
   * >
   * > Gemessen mit `tools/bench/world.mts` vor P19: Ruhelage **0,26 m** statt
   * > 1,10 m. Der Aufbau eines 3,1 m hohen Lastwagens stand mit dem Schwerpunkt
   * > auf Kniehöhe, und keine einzige Kennzahl hat es gemeldet — er *fuhr* ja.
   */
  readonly bodyFloorGap: number;
  /**
   * Prüfpunkte der Blechunterkante im Fahrzeugsystem, flach als `x, y, z` — P20.
   *
   * Gebildet von `hullSamplePoints`; die Begründung für Zahl und Lage der Punkte
   * steht dort. Hier liegen sie, weil sie aus `chassis` und `collision`
   * **gerechnet** sind und damit unter dieselbe Regel fallen wie die sieben
   * Konstanten, die in P17 aus `Vehicle.ts` hierher mussten: eine Ableitung, die
   * beim Fahrzeugwechsel stehen bliebe, ließe den Lastwagen mit dem Umriss des
   * Coupés gegen das Gelände prüfen.
   */
  readonly hullSamples: Float64Array;
}

function derive(
  chassis: ChassisSpec,
  suspension: SuspensionSpec,
  collision: CollisionSpec,
): VehicleDerived {
  const staticCompression = (chassis.mass * GRAVITY) / suspension.stiffness;
  const restDrop = chassis.cgHeight - chassis.wheelRadius;
  return {
    // `frontWeight` ist der Lastanteil **vorn**; der Schwerpunkt liegt damit um
    // den Hinterachsanteil des Radstands hinter der Vorderachse.
    cgToFront: chassis.wheelbase * (1 - chassis.frontWeight),
    cgToRear: chassis.wheelbase * chassis.frontWeight,
    staticCompression,
    springRest: chassis.cgHeight + staticCompression,
    wheelMaxDrop: restDrop + suspension.travel,
    wheelMinDrop: Math.max(0, restDrop - Math.max(0, suspension.travel - staticCompression)),
    supportReach: suspension.travel + 0.28,
    springCap: chassis.mass * GRAVITY * suspension.maxLoadFactor,
    bodyFloorGap: Math.max(
      chassis.wheelRadius * 0.5,
      chassis.cgHeight + staticCompression - suspension.travel * 1.3,
    ),
    // Die Unterkante liegt `band[0]` über der Radaufstandsebene; im
    // Fahrzeugsystem ist der Ursprung der Schwerpunkt, also `band[0] − cgHeight`.
    hullSamples: hullSamplePoints(
      chassis.bodyLength,
      chassis.bodyWidth,
      collision.band[0] - chassis.cgHeight,
    ),
  };
}

type RawSpec = Omit<VehicleSpec, 'derived' | 'drivetrain'> & {
  readonly drivetrain: Omit<DrivetrainSpec, 'frontShare'> & { readonly frontShare?: number };
};

function makeSpec(raw: RawSpec): VehicleSpec {
  const layout = raw.drivetrain.layout;
  return {
    ...raw,
    drivetrain: {
      ...raw.drivetrain,
      // Nur `awd` hat eine Wahl. Für `rwd`/`fwd` wäre ein abweichender Wert ein
      // Widerspruch zum Namen — und ein Widerspruch, den niemand bemerkt.
      frontShare: layout === 'fwd' ? 1 : layout === 'rwd' ? 0 : (raw.drivetrain.frontShare ?? 0.4),
    },
    derived: derive(raw.chassis, raw.suspension, raw.collision),
  };
}

/**
 * Unterhalb dieses Tempos wirkt keine Motorbremse (m/s).
 *
 * Global und nicht je Fahrzeug: der Grund ist nicht der Antrieb, sondern die
 * Kupplung. Jedes Fahrzeug trennt beim Anhalten, sonst würgte es sich ab. 3 m/s
 * sind Schrittgeschwindigkeit; darunter läuft die Bremskraft linear auf null,
 * damit sie nicht als Sprung im Fahrverhalten steht.
 */
export const ENGINE_BRAKE_FLOOR = 3;

/**
 * Größter Anteil der Achshaftung, den die Motorbremse belegen darf.
 *
 * **Global und nicht je Fahrzeug**, weil der Wert keine Fahrzeugeigenschaft
 * beschreibt, sondern eine **Lücke im Modell**: dieses Fahrmodell führt keine
 * Raddrehzahlen, also bricht das Schleppmoment nicht zusammen, wenn das Rad zu
 * rutschen beginnt. Die vollständige Begründung samt Messtabelle steht an der
 * Stelle, an der der Deckel greift (`Vehicle.ts`, „Die Motorbremse weicht dem
 * Reibkreis").
 *
 * Ein Wert je Fahrzeug wäre hier genau die Sorte Stellschraube, die dieses
 * Projekt schon dreimal ausgebaut hat: vier Zahlen für einen Effekt, dessen
 * Ursache eine einzige ist.
 */
export const ENGINE_BRAKE_SHARE = 0.06;

// ─────────────────────────────────────────────────────────────────────────────
// Die vier Fahrzeuge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **Touge** — das Coupé aus P14, unverändert in allen Maßen.
 *
 * Die Spec liest die Werte aus `vehicle.config.ts` und schreibt sie **nicht ab**.
 * Das ist Absicht und die halbe Begründung dieser Datei: dort steht zu jeder
 * Zahl eine Herleitung oder eine Messung, oft über Dutzende Zeilen, samt der
 * verworfenen Alternative. Diese Dokumentation ist das Wertvollste, was das
 * Fahrmodell hat — sie hier zu duplizieren hieße, sie beim nächsten Mal an
 * einer der beiden Stellen zu vergessen.
 *
 * Was sich in P18 **geändert** hat, steht deshalb hier und nur hier, mit
 * Begründung. Es sind vier Werte.
 */
export const TOUGE: VehicleSpec = makeSpec({
  id: 'touge',
  name: 'Touge-Coupé',
  blurb: 'Leicht, heckgetrieben, gutmütig am Limit. Der Wagen, für den die Karte gebaut ist.',
  chassis: CHASSIS,
  suspension: SUSPENSION,
  tire: TIRE,
  steering: STEERING,
  collision: VEHICLE_COLLISION,
  limits: {
    // Die drei Werte standen bis P17 als Modulkonstanten in `Vehicle.ts`; ihre
    // Herleitung steht dort weiterhin, sie sind unverändert übernommen.
    maxYawRate: 8,
    slipSpeedFloor: 6,
    staticHoldSpeed: 0.8,
  },
  drivetrain: {
    ...DRIVETRAIN,
    layout: 'rwd',
    /**
     * **Geändert: 7200 → 8200 N.** Der alte Wert trug den Kommentar „liegt 8,6 %
     * über der Haftgrenze der Hinterachse, also kann man die Räder durchdrehen
     * lassen". Die Rechnung dahinter setzt die **statische** Hinterachslast an
     * und lässt die Lastverlagerung beim Beschleunigen weg. Mit ihr:
     *
     *     F > μ_h · m · g · w_h / (1 − μ_h · h / L)
     *       = 1,25 · 1150 · 9,81 · 0,47 / (1 − 1,25 · 0,52 / 2,4)
     *       = 6627 / 0,7292 = **9088 N**
     *
     * 7200 N lagen damit nicht 8,6 % darüber, sondern **16,1 % darunter**.
     * Gemessen am Prüfstand: höchster Durchdrehfaktor auf Asphalt **0,857 ×** —
     * die Hinterachse hat auf Asphalt nie die Haftung verloren, weder beim
     * Anfahren noch beim Gasstoß in der Kurve. Die Kernanforderung dieses
     * Fahrmodells („der Hinterwagen soll auf Gasstoß ausbrechen", siehe Kopf von
     * `vehicle.config.ts`) war rechnerisch unerfüllbar.
     *
     * **Der Wert bleibt trotzdem bei 7200 N.** Repariert wird über `launchBoost`
     * unten, also über die Übersetzung und nicht über rohe Kraft — ein Coupé mit
     * 165 kW soll auch nach der Reparatur ein Coupé mit 165 kW sein. Gemessen
     * wurden sechs Kombinationen; 8200 N hätten die Anforderung ebenfalls
     * erfüllt und dabei 0–100 km/h von 4,82 s auf **4,15 s** gedrückt. Das wäre
     * eine andere Fahrzeugklasse gewesen, ohne dass irgendjemand sie bestellt
     * hätte.
     */
    maxDriveForce: DRIVETRAIN.maxDriveForce,
    /**
     * 1,55 · 7200 = **11 160 N** bei Stillstand, 22,8 % über der Durchdrehgrenze
     * von 9088 N. Nach 3 m/s ist die Überhöhung auf 37 % gefallen, nach 9 m/s
     * praktisch weg — ein sehr kurzer erster Gang, und damit greift sie genau
     * dort, wo ein Fahrer sie erwartet: beim Anfahren.
     *
     * Gemessen gegen die Alternativen (Durchdrehfaktor beim Anfahren, 0–100):
     *
     * | F_max | Boost | v_boost | 0–100 | Anfahrt | Bogen |
     * |---:|---:|---:|---:|---:|---:|
     * | 8200 | 0,42 | 7,0 | 4,15 s | 1,234 × | 0,990 × |
     * | 7600 | 0,42 | 4,0 | 4,42 s | 1,116 × | 0,916 × |
     * | **7200** | **0,55** | **3,0** | **4,62 s** | **1,108 ×** | 0,877 × |
     *
     * Die gewählte Zeile ist die, die die Anforderung erfüllt (Anfahrt > 1,0)
     * und dabei am wenigsten an der Beschleunigung dreht.
     */
    launchBoost: 0.55,
    launchSpeed: 3,
    /**
     * **Neu in P18.** Ein Vierzylindersauger im Schub.
     *
     * Der Wert ist **an der Obergrenze bemessen, die `ENGINE_BRAKE_SHARE`
     * durchlässt**: auf trockenem Asphalt in Geradeausfahrt trägt die
     * Hinterachse μ · m · g · w_h = 1,25 · 1150 · 9,81 · 0,47 = 6627 N, davon
     * 6 % = **398 N**. 380 N sind damit im normalen Rollen voll wirksam und
     * werden erst im Bogen gedeckelt, wenn die Last nach vorn wandert. Ein
     * größerer Wert wäre eine Zahl ohne Wirkung — gemessen sind 600, 800, 1200
     * und 2000 N **auf die Nachkommastelle** dasselbe Ergebnis.
     *
     * Gemessen bringt das: Ausrollen von 195 km/h auf die Hälfte in **26,4 s**
     * statt 39,4 s ohne Motorbremse.
     */
    engineBrake: 380,
    /**
     * **Geändert: 0,55 → 0,08, und jetzt wird der Wert überhaupt gelesen.** Die
     * 0,55 hätten bei 250 km/h (69 m/s) 2650 N Abtrieb ergeben — ein Viertel des
     * Fahrzeuggewichts, an einem Serienauto der Achtziger ohne jeden Flügel.
     * 0,08 sind bei derselben Geschwindigkeit 385 N, also gut 3 %: die
     * Größenordnung, in der ein glatter Unterboden bleibt.
     */
    downforce: 0.08,
  },
  body: {
    shape: 'coupe',
    // 1,44 m: die Reparatur aus P14 („das Rad muss 12,5 cm herausstehen").
    hullWidth: 1.44,
    hullLength: 4.2,
    roofHeight: 1.48,
    paint: 0xd9dee3,
    paintDark: 0x2b3038,
    glass: 0x1b2430,
    rim: 0x9aa0a6,
    trim: 0x3a3f46,
  },
});

/**
 * **GT** — der Supersportler. Mittelmotor, Heckantrieb, Abtrieb.
 *
 * Vorbild für die Maße: Lamborghini Huracán (4,52 × 1,92 m, Radstand 2,62 m,
 * 1422 kg trocken) und McLaren 720S (Radstand 2,67 m). Er ist in dieser Liste
 * das Fahrzeug, an dem `downforce` und `power` überhaupt einen Unterschied
 * machen — bei allen anderen ist der Luftwiderstand vorher am Ende.
 *
 * Sein Charakter ist **nicht** „das Coupé mit mehr Leistung": er hat kürzere
 * Schräglaufscheitel (Semislicks bauen ihre Kraft früher auf und verzeihen
 * weniger), einen tieferen Schwerpunkt und einen kürzeren Federweg. Am Limit
 * ist er schneller und weniger geduldig.
 */
export const GT: VehicleSpec = makeSpec({
  id: 'gt',
  name: 'GT-Supersportler',
  blurb: 'Mittelmotor, 500 kW, Abtrieb. Schnell, wenn die Straße breit ist — und ungnädig, wenn nicht.',
  chassis: {
    // Trockengewicht plus Betriebsstoffe und Fahrer.
    mass: 1450,
    wheelbase: 2.7,
    track: 1.67,
    // Mittelmotor: rund 42 % vorn. Das ist der Grund, warum er sich einlenken
    // lässt, wo das Coupé schiebt — und warum das Heck früher kommt.
    frontWeight: 0.42,
    // Flach. Der Unterschied zum Coupé (0,52) ist der halbe Fahrcharakter: die
    // Lastverlagerung ΔFz = m·a·h/L fällt um 23 % kleiner aus.
    cgHeight: 0.4,
    // Gleicher Trägheitsradius wie beim Coupé: k/L = 0,499 (aus 1650 = 1150·k²
    // bei L = 2,4 m). 1450 · (0,499 · 2,70)² = 2633.
    yawInertia: 2630,
    // 305/30 R20 hinten — Halbmesser 0,35 m, Breite 0,31 m.
    wheelRadius: 0.35,
    wheelWidth: 0.31,
    bodyLength: 4.55,
    bodyWidth: 1.97,
    bodyHeight: 1.17,
  },
  suspension: {
    // Kurzer Federweg — das Auto liegt auf der Straße, nicht darüber.
    travel: 0.14,
    // Statische Einfederung als Ziel: 0,05 m = 36 % des Federwegs (Coupé: 52 %).
    // k = m·g/s = 1450 · 9,81 / 0,05 = 284 490.
    stiffness: 284_500,
    // Kritische Dämpfung c = 2·√(k·m) = 2·√(284 500 · 1450) = 40 613.
    // 0,62 davon — straffer als das Coupé (0,55), wie es sich für ein Auto
    // gehört, das keinen Federungskomfort verspricht.
    damping: 25_180,
    bumpStopFactor: 11,
    maxLoadFactor: 3.5,
    // Schneller nachgeführt: eine steife Karosserie legt sich zügiger.
    attitudeRate: 9,
    // Wenig Wanken und Nicken — das ist die Anzeige für „hier ist alles straff".
    rollPerLateralG: 0.0035,
    pitchPerLongitudinalG: 0.003,
    maxRoll: 0.075,
    maxPitch: 0.07,
  },
  tire: {
    // Semislicks: der Scheitel liegt früher als bei einem Straßenreifen (Coupé
    // 9,2° / 6,9°). 8,0° / 6,3° — mehr Anfangssteifigkeit, weniger Vorwarnung.
    peakSlipFront: 0.14,
    peakSlipRear: 0.11,
    // 1,55 statt 1,25. Der Unterschied zum Coupé ist eine halbe Sekunde je
    // Kehre und der Grund, warum dieses Auto überhaupt gebaut wird.
    gripAsphalt: 1.55,
    // Ein Slick, der einmal rutscht, gibt mehr auf als ein Straßenreifen.
    tailGrip: 0.68,
    plateauWidth: 0.42,
    falloffSlipFront: 0.45,
    falloffSlipRear: 0.6,
    // 305 hinten gegen 245 vorn — die Hinterachse hat mehr Aufstandsfläche.
    rearGripFactor: 1.04,
    // Auf allem außer Asphalt ist er das schlechteste Auto der Liste. Ein
    // Semislick auf Schotter ist ein Schlitten.
    gripGravel: 0.42,
    gripTerrain: 0.3,
    gripWater: 0.26,
    lateralReserve: 0.45,
    lockedLateralFactor: 0.28,
  },
  steering: {
    // Kleiner Einschlag: langer Radstand, breite Reifen, viel Nachlauf.
    maxAngle: 0.5,
    rate: 3.6,
    centerRate: 5.2,
    // Später abfallend als beim Coupé (26) — bei 200 km/h bleibt mehr Lenkung
    // stehen, weil der Abtrieb sie trägt.
    speedFalloff: 32,
    driftDamping: 0.45,
    releaseDamping: 0.35,
  },
  limits: { maxYawRate: 8, slipSpeedFloor: 6, staticHoldSpeed: 0.8 },
  collision: { ...VEHICLE_COLLISION, skin: 0.05, band: [0.22, 0.72] },
  drivetrain: {
    layout: 'rwd',
    // 500 kW ≙ 680 PS.
    power: 500_000,
    /**
     * Traktionsgrenze am Start: μ_h · m · g · w_h / (1 − μ_h · h / L)
     * = 1,612 · 1450 · 9,81 · 0,58 / (1 − 1,612 · 0,40 / 2,70)
     * = 13 301 / 0,7612 = **17 474 N**.
     *
     * 16 000 N sind 11,0 m/s² = 1,12 g — was ein Heckantrieb mit Semislicks
     * gerade noch auf die Straße bringt. Mit `launchBoost` liegt der Start
     * darüber, also drehen die Räder an der Ampel durch; ab etwa 25 km/h greift
     * die Traktion.
     */
    maxDriveForce: 16_000,
    // 1,30 · 16 000 = 20 800 N bei Stillstand, 19 % über der Traktionsgrenze.
    launchBoost: 0.3,
    launchSpeed: 9,
    // Obergrenze aus `ENGINE_BRAKE_SHARE`: die Hinterachse trägt
    // 1,55 · 1,04 · 1450 · 9,81 · 0,58 = 13 301 N, davon 6 % = 798 N. 780 N sind
    // im Rollen voll wirksam; alles darüber wäre eine Zahl ohne Wirkung.
    engineBrake: 780,
    // Verzögerungsgrenze ist ohnehin der Reifen (μ · m · g = 22 050 N).
    // 24 000 N heißt: die Bremse ist nicht der Engpass, der Reifen ist es.
    brakeForce: 24_000,
    brakeBias: 0.66,
    handbrakeForce: 11_000,
    throttleRate: 5,
    reverseMaxSpeed: 12,
    reverseForceFactor: 0.3,
    /**
     * Endgeschwindigkeit aus P/v = c·v²  →  v = ∛(P/c).
     * Ziel 335 km/h = 93 m/s  →  c = 500 000 / 93³ = **0,62**.
     */
    drag: 0.62,
    /**
     * 0,42 N/(m/s)² sind bei 310 km/h (86 m/s) **3106 N** ≙ 317 kg — die
     * Größenordnung eines straßenzugelassenen GT mit Heckflügel (Huracán
     * Performante: 350 kg bei 310 km/h). Das sind 22 % zusätzliche Radlast und
     * damit der Grund, warum dieses Auto im schnellen Bogen hält, wo das Coupé
     * längst schiebt.
     */
    downforce: 0.42,
    rollingResistance: 0.012,
    rollingResistanceTerrain: 0.055,
    rollingResistanceWater: 0.11,
    waterDrag: 20,
    terrainDrag: 0.26,
    gravelDrag: 0.11,
  },
  body: {
    shape: 'supercar',
    // Spurweite 1,67 + Rad 0,31 = Radaußenkante bei 0,99 m. 1,72 lässt das Rad
    // 13 cm herausstehen — dieselbe Regel wie beim Coupé.
    hullWidth: 1.72,
    hullLength: 4.55,
    roofHeight: 1.17,
    // Warmes Orange. Die Palette der Karte ist kühl (blaue Stunde, 2,23°
    // Sonnenstand); ein Gegenton liest sich dort auf 200 m noch als Fahrzeug,
    // während das Weiß des Coupés vor einer Betonmauer verschwindet.
    paint: 0xd4611c,
    paintDark: 0x1a1d22,
    glass: 0x14181f,
    rim: 0x2e3238,
    trim: 0x202429,
  },
});

/**
 * **Offroad** — der Allradler. Lange Federwege, Stollenreifen, hoher Schwerpunkt.
 *
 * Vorbild: Toyota Land Cruiser / Ford Bronco der Rallye-Klasse (Radstand 2,85 m,
 * 2,1 t, 33-Zoll-Reifen ≙ 0,42 m Halbmesser).
 *
 * Er ist das Gegenstück zum GT und die einzige Antwort auf die Frage, warum es
 * neben dem Coupé überhaupt noch etwas geben soll: **auf 101 ha Reisfeld und
 * einer Karte, die zu drei Vierteln aus Hang besteht, ist das Coupé ein Gast.**
 * Der Allradler nutzt beide Achsen (`frontShare` 0,4), hat 42 cm Federweg statt
 * 26, und seine Reifen halten auf Kies mehr als auf Asphalt.
 */
export const OFFROAD: VehicleSpec = makeSpec({
  id: 'offroad',
  name: 'Offroad 4×4',
  blurb: 'Allrad, 42 cm Federweg, Stollenreifen. Auf Asphalt schwerfällig, überall sonst zu Hause.',
  chassis: {
    mass: 2100,
    wheelbase: 2.85,
    track: 1.66,
    // Motor vorn, Leiterrahmen: kopflastig.
    frontWeight: 0.55,
    // **0,78 m — der höchste Schwerpunkt der Liste nach dem Lastwagen.** Er ist
    // der Preis der Bodenfreiheit und der Grund, warum dieses Auto in einer
    // schnellen Kurve schiebt und beim Bremsen taucht: ΔFz = m·a·h/L ist bei ihm
    // fast doppelt so groß wie beim GT.
    cgHeight: 0.78,
    // 2100 · (0,499 · 2,85)² = 4247.
    yawInertia: 4250,
    wheelRadius: 0.42,
    wheelWidth: 0.28,
    bodyLength: 4.9,
    bodyWidth: 2.0,
    bodyHeight: 1.95,
  },
  suspension: {
    // 42 cm. Das ist die Zahl, die dieses Fahrzeug ausmacht — und die einzige
    // in der Liste, bei der `SUSPENSION.travel` die Geländegängigkeit direkt
    // bestimmt: `#contactHeight` lässt Räder bis `travel + 0,28` mitzählen.
    travel: 0.42,
    // Statische Einfederung 0,16 m = 38 % des Federwegs.
    // k = 2100 · 9,81 / 0,16 = 128 756.
    stiffness: 128_750,
    // Kritisch c = 2·√(128 750 · 2100) = 32 886. 0,50 davon — weich, damit ein
    // Loch geschluckt und nicht weitergereicht wird.
    damping: 16_440,
    bumpStopFactor: 7,
    maxLoadFactor: 3.5,
    // Träge: die Karosserie legt sich langsam, das ist der Wank-Eindruck.
    attitudeRate: 5,
    // Viermal so viel Wanken je g wie das Coupé (0,0075). Sichtbar, gewollt.
    rollPerLateralG: 0.014,
    pitchPerLongitudinalG: 0.011,
    maxRoll: 0.22,
    maxPitch: 0.18,
  },
  tire: {
    // Stollen sind weich: der Scheitel liegt spät (11,5° / 9,7°), die Antwort
    // kommt langsam, und dafür kündigt sich alles lange an.
    peakSlipFront: 0.2,
    peakSlipRear: 0.17,
    // Auf Asphalt schlechter als jeder Straßenreifen — die Stollen walken.
    gripAsphalt: 1.02,
    // Und das ist der Handel: was auf Asphalt fehlt, steht im Dreck.
    // 0,88 gegen 0,62 des Coupés auf Kies, 0,82 gegen 0,52 im Gelände.
    gripGravel: 0.88,
    gripTerrain: 0.82,
    gripWater: 0.5,
    // Ein Stollenreifen gräbt sich fest, statt zu gleiten — der Rest hinter dem
    // Scheitel ist hoch.
    tailGrip: 0.84,
    plateauWidth: 0.75,
    falloffSlipFront: 0.7,
    falloffSlipRear: 0.85,
    /**
     * **1,12, und der Wert kommt aus einer Messung, nicht aus dem Katalog.**
     *
     * Mit 1,02 war dieses Fahrzeug beim Lastwechsel im Bogen nicht zu halten:
     * Gas weg bei 68 km/h und Lenkung 0,55 ergab **71,9° Schwimmwinkel, und er
     * blieb dort** — der Wagen stand quer, ohne dass der Fahrer mehr getan hätte
     * als den Fuß zu heben. Der Grund ist die Bauart: 0,78 m Schwerpunkthöhe auf
     * 2,85 m Radstand verlagern beim Verzögern viel Last nach vorn, und die
     * Hinterachse verliert dabei mehr Haftung, als ihre Stabilitätsreserve von
     * 1,20 verträgt.
     *
     * Gemessen wurden fünf Eingriffe (Spitze → nach 2,5 s, Lenkung 0,55):
     *
     * | Eingriff | Ergebnis |
     * |---|---|
     * | wie gebaut | 71,9° → **71,9°** |
     * | Motorbremse aus | 33,3° → 12,7° |
     * | Schwerpunkt 0,78 → 0,66 m | 39,1° → 21,9° |
     * | `driftDamping` 0,6 → 1,1 | 25,5° → 3,9° |
     * | **`rearGripFactor` 1,02 → 1,12** | **23,6° → 4,2°** |
     *
     * Gewählt ist die letzte Zeile, obwohl die vierte ähnlich wirkt: `driftDamping`
     * ist eine **Fahrhilfe** und greift in ein Moment ein, das es physikalisch
     * nicht gibt; die Reifenbreite ist ein **Bauteil**. Ein Geländewagen mit
     * Starrachse und Ladefläche hat hinten mehr Aufstandsfläche, und das ist die
     * Erklärung, die auch beim nächsten Lesen noch trägt.
     *
     * Nebenwirkung, gewollt: die Stabilitätsreserve steigt von 1,20 auf 1,32 und
     * liegt damit im Feld der anderen drei.
     */
    rearGripFactor: 1.12,
    lateralReserve: 0.55,
    lockedLateralFactor: 0.35,
  },
  steering: {
    maxAngle: 0.6,
    // Langsamer als das Coupé (3,2): großes Lenkrad, hohe Übersetzung.
    rate: 2.6,
    centerRate: 3.8,
    speedFalloff: 22,
    driftDamping: 0.6,
    releaseDamping: 0.5,
  },
  // 6 rad/s statt 8: knapp eine Umdrehung je Sekunde. Mehr macht ein 2,1-Tonner
  // mit 1,66 m Spur nicht, ohne umzufallen — und umfallen kann dieses Modell
  // nicht (siehe Kopf von `Vehicle.ts`), also gehört die Grenze hierher.
  limits: { maxYawRate: 6, slipSpeedFloor: 6, staticHoldSpeed: 0.9 },
  collision: {
    ...VEHICLE_COLLISION,
    skin: 0.07,
    // Höher als beim Coupé: der Aufbau ist 1,95 m hoch, und ein Band, das bei
    // 0,8 m endet, ließe alles über Türhöhe durch die Kabine gehen.
    band: [0.35, 1.7],
  },
  drivetrain: {
    layout: 'awd',
    // 40 % vorn: genug, um aus einer Furche zu ziehen, wenig genug, dass der
    // Wagen mit dem Gas noch lenkbar bleibt.
    frontShare: 0.4,
    power: 250_000,
    /**
     * Allrad heißt: die Grenze rechnet mit **beiden** Achsen, und die
     * Lastverlagerung entlastet die eine genau so weit, wie sie die andere
     * belastet. Auf Asphalt ist die Summe damit schlicht μ · m · g =
     * 1,02 · 2100 · 9,81 = **21 013 N** — die Traktion eines Allradlers ist
     * lastverlagerungsfrei, und das ist der eigentliche Vorteil der Bauart.
     *
     * 12 000 N sind 5,7 m/s². Weit unter der Grenze auf Asphalt (dort greift er
     * einfach), aber im Gelände (μ 0,82 → 16 892 N über beide Achsen, davon
     * 60 % hinten = 10 135 N) reicht es zum Graben.
     */
    maxDriveForce: 12_000,
    launchBoost: 0.5,
    launchSpeed: 6,
    // Allrad: der Deckel rechnet mit **beiden** Achsen, also mit der vollen
    // Haftung 1,02 · 2100 · 9,81 = 21 013 N, davon 6 % = 1261 N.
    engineBrake: 1200,
    brakeForce: 26_000,
    brakeBias: 0.6,
    handbrakeForce: 13_000,
    throttleRate: 3.4,
    reverseMaxSpeed: 12,
    reverseForceFactor: 0.5,
    /**
     * Ein Kasten mit Dachträger: c = 250 000 / v³. Ziel 197 km/h = 55 m/s
     * → c = 250 000 / 166 375 = **1,50**.
     */
    drag: 1.5,
    // Ein Kastenwagen erzeugt Auftrieb, keinen Abtrieb. Null ist hier die
    // ehrliche Zahl — und sie steht ausdrücklich da, damit niemand sie später
    // für vergessen hält.
    downforce: 0,
    rollingResistance: 0.017,
    // Große weiche Reifen rollen im Gelände deutlich besser als schmale.
    // 0,028 gegen 0,04 beim Coupé.
    rollingResistanceTerrain: 0.028,
    rollingResistanceWater: 0.075,
    waterDrag: 15,
    // 0,10 gegen 0,18: das Fahrzeug pflügt weniger.
    terrainDrag: 0.1,
    gravelDrag: 0.04,
  },
  body: {
    shape: 'suv',
    // Spur 1,66 + Rad 0,28 → Radaußenkante 0,97 m. 1,74 lässt 10 cm stehen.
    hullWidth: 1.74,
    hullLength: 4.9,
    roofHeight: 1.95,
    paint: 0x6f7a63,
    paintDark: 0x24282a,
    glass: 0x1a2028,
    rim: 0x4a4e52,
    trim: 0x2c2f31,
  },
});

/**
 * **Lastwagen** — 7,8 t, Zwillingsbereifung hinten, kurze Übersetzung.
 *
 * Vorbild: mittelschwerer Pritschenwagen der 7,5-t-Klasse (Radstand 4,6 m,
 * Reifen 0,52 m Halbmesser).
 *
 * Er ist in dieser Liste das Fahrzeug, an dem die **Grenzen des Modells**
 * sichtbar werden, und deshalb steht das hier und nicht in einer Fußnote: das
 * Fahrmodell kann sich nicht überschlagen (Kopf von `Vehicle.ts`). Bei einem
 * Schwerpunkt von 1,10 m und 2,0 m Spur kippt ein echter Lastwagen bei
 * `a_lat > g · (t/2) / h` = 9,81 · 1,0 / 1,10 = **8,9 m/s²**, und das liegt
 * *unter* der Haftgrenze seiner Reifen (0,95 g = 9,3 m/s²). Ein echter
 * Lastwagen fällt in einer Vollkurve also um, bevor er rutscht. Dieser hier
 * nicht — er rutscht. Das ist eine bekannte Abweichung und keine Nachlässigkeit.
 */
export const TRUCK: VehicleSpec = makeSpec({
  id: 'truck',
  name: 'Lastwagen',
  blurb: '7,8 t, Zwillingsreifen, Motorbremse. Bremsweg wie ein Frachtschiff — Schwung ist alles.',
  chassis: {
    mass: 7800,
    wheelbase: 4.6,
    track: 2.0,
    // Beladene Pritsche: das Gewicht sitzt hinten.
    frontWeight: 0.4,
    cgHeight: 1.1,
    // 7800 · (0,499 · 4,6)² = 41 106.
    yawInertia: 41_000,
    wheelRadius: 0.52,
    wheelWidth: 0.3,
    bodyLength: 7.6,
    bodyWidth: 2.45,
    bodyHeight: 3.1,
  },
  suspension: {
    // Blattfedern: wenig Weg, viel Kraft.
    travel: 0.22,
    // Statische Einfederung 0,09 m = 41 % des Federwegs.
    // k = 7800 · 9,81 / 0,09 = 850 200.
    stiffness: 850_200,
    // Kritisch c = 2·√(850 200 · 7800) = 162 876. 0,45 davon — Blattfedern
    // dämpfen über Reibung und sind schlecht gedämpft, das gehört zum Bild.
    damping: 73_290,
    bumpStopFactor: 6,
    // Niedriger als bei allen anderen: der Deckel begrenzt die Federkraft auf
    // ein Vielfaches des Fahrzeuggewichts, und 3,0 · 7,8 t sind bereits 230 kN.
    maxLoadFactor: 3,
    attitudeRate: 3.6,
    // Der stärkste Wank- und Nickeindruck der Liste. Er ist die Anzeige, an der
    // man merkt, dass man 7,8 t bewegt.
    rollPerLateralG: 0.016,
    pitchPerLongitudinalG: 0.012,
    maxRoll: 0.2,
    maxPitch: 0.13,
  },
  tire: {
    // Harte Nutzfahrzeugmischung, hohe Flanke: 10,9° / 8,9° Scheitel.
    peakSlipFront: 0.19,
    peakSlipRear: 0.155,
    gripAsphalt: 0.95,
    gripGravel: 0.55,
    gripTerrain: 0.42,
    gripWater: 0.32,
    tailGrip: 0.68,
    plateauWidth: 0.45,
    falloffSlipFront: 0.6,
    falloffSlipRear: 0.75,
    /**
     * **1,15 — der höchste Wert der Liste, und er ist keine Abstimmung, sondern
     * ein Bauteil.** Die Hinterachse trägt Zwillingsreifen, also vier statt zwei
     * Aufstandsflächen. Zusammen mit `frontWeight` 0,40 ergibt das die
     * Stabilitätsreserve, die ein Lastwagen haben muss: er soll schieben und
     * nicht ausbrechen, weil ein ausbrechender Anhänger nicht mehr einzufangen
     * ist.
     */
    rearGripFactor: 1.15,
    lateralReserve: 0.5,
    lockedLateralFactor: 0.4,
  },
  steering: {
    // Großer Einschlag — ein Lastwagen rangiert.
    maxAngle: 0.62,
    // **1,6 gegen 3,2 beim Coupé: der Lenkeinschlag braucht eine halbe Sekunde
    // von Anschlag zu Mitte.** Das ist das, woran man beim Fahren merkt, dass es
    // ein Lastwagen ist, noch bevor die Masse sich meldet.
    rate: 1.6,
    centerRate: 2.2,
    speedFalloff: 18,
    driftDamping: 0.75,
    releaseDamping: 0.6,
  },
  /**
   * **3,2 rad/s statt 8.** Eine halbe Umdrehung je Sekunde. Der alte globale
   * Deckel wäre für dieses Fahrzeug eine Zahl ohne Bedeutung gewesen: mit
   * 41 000 kg·m² Gierträgheit und den vorhandenen Seitenkräften kommt er nie in
   * die Nähe von 8 rad/s — der Deckel hätte nie gegriffen, und ein Deckel, der
   * nie greift, ist keiner. Nach einem Anschlag greift er sehr wohl, und dort
   * ist er der Unterschied zwischen „der Wagen dreht sich weg" und „der Wagen
   * wird zum Kreisel".
   */
  limits: { maxYawRate: 3.2, slipSpeedFloor: 6, staticHoldSpeed: 1.1 },
  collision: {
    ...VEHICLE_COLLISION,
    skin: 0.08,
    // 3,1 m Aufbau: die Oberkante liegt weit über der Leitplanke und unter dem
    // Dach — sie ist die, die an einem Torii anstößt.
    band: [0.45, 2.4],
    maxPushPerStep: 0.3,
  },
  drivetrain: {
    layout: 'rwd',
    // 230 kW ≙ 313 PS — ein üblicher Sechszylinder-Diesel dieser Klasse.
    power: 230_000,
    /**
     * Durchdrehgrenze hinten unter Lastverlagerung:
     * μ_h · m · g · w_h / (1 − μ_h · h / L)
     * = 1,0925 · 7800 · 9,81 · 0,60 / (1 − 1,0925 · 1,10 / 4,6)
     * = 50 152 / 0,7387 = **67 892 N**.
     *
     * 22 000 N sind 2,82 m/s² — weit darunter. Ein beladener Lastwagen dreht
     * auf trockenem Asphalt nicht durch, und das ist richtig so. Im Gelände
     * (μ 0,42 → Grenze 27 545 N) tut er es mit `launchBoost` sehr wohl.
     */
    maxDriveForce: 22_000,
    /**
     * **0,85 — die größte Überhöhung der Liste, und die einzige, bei der die
     * Rechtfertigung nicht „Fahrgefühl" heißt, sondern „Getriebe".** Ein
     * Lastwagen hat zwölf oder sechzehn Gänge; die Spreizung zwischen dem
     * ersten und dem Reisegang liegt bei 8:1 und mehr. Ohne diese Überhöhung
     * käme das Fahrzeug an keiner Steigung der Karte an: 22 000 N bei 7,8 t sind
     * 2,82 m/s², und der Tempelaufgang hat 43 % (≙ 4,0 m/s² Hangabtrieb) — er
     * bliebe stehen und rollte rückwärts.
     */
    launchBoost: 0.85,
    launchSpeed: 5,
    /**
     * **2900 N — 13 % des Antriebs, und in absoluten Zahlen das Siebenfache des
     * Coupés.** Das ist die Motorstaubremse: sie ist der Grund, warum ein
     * Lastwagen einen Pass hinunterkommt, ohne die Betriebsbremse zu verlieren.
     * Beim Fahren ist sie das auffälligste Merkmal des Fahrzeugs — vom Gas gehen
     * verzögert spürbar, ganz ohne Bremspedal.
     *
     * Obergrenze aus `ENGINE_BRAKE_SHARE`: die Hinterachse trägt
     * 0,95 · 1,15 · 7800 · 9,81 · 0,60 = 50 158 N, davon 6 % = **3009 N**.
     */
    engineBrake: 2900,
    /**
     * 62 000 N sind 7,95 m/s² ≙ 0,81 g. Die Haftgrenze der Reifen liegt bei
     * μ · m · g = 0,95 · 76 518 = **72 692 N** ≙ 9,3 m/s² — die Bremse liegt
     * also **unter** dem, was die Reifen hergäben, und ist der Engpass. Genau
     * andersherum als beim GT, und genau so gehört es sich: ein Lastwagen bremst
     * schlechter, als seine Reifen könnten.
     */
    brakeForce: 62_000,
    brakeBias: 0.55,
    handbrakeForce: 30_000,
    // Langsames Gas: ein Diesel dieser Größe nimmt nicht in einer Viertelsekunde
    // an. 2,2 ≙ 0,45 s von null auf voll.
    throttleRate: 2.2,
    reverseMaxSpeed: 8,
    reverseForceFactor: 0.55,
    /**
     * Eine Pritsche mit Fahrerhaus ist ein Ziegelstein: c = 230 000 / v³.
     * Ziel 118 km/h = 32,8 m/s → c = 230 000 / 35 288 = **6,5**.
     *
     * Der Wert steht stellvertretend für den Drehzahlbegrenzer, den es hier
     * nicht gibt — und das ist ausdrücklich eine Näherung und keine Aerodynamik.
     */
    drag: 6.5,
    downforce: 0,
    // Radialreifen unter hoher Last rollen sehr gut — das ist der Grund, warum
    // ein Lastwagen ewig ausrollt.
    rollingResistance: 0.008,
    rollingResistanceTerrain: 0.06,
    rollingResistanceWater: 0.14,
    waterDrag: 26,
    terrainDrag: 0.24,
    gravelDrag: 0.09,
  },
  body: {
    shape: 'truck',
    // Spur 2,00 + Rad 0,30 → Radaußenkante 1,15 m. Zwillinge stehen weiter
    // heraus, deshalb ist das Blech hier absichtlich schmaler als sonst.
    hullWidth: 2.18,
    hullLength: 7.6,
    roofHeight: 3.1,
    paint: 0xc0552f,
    paintDark: 0x2a2c2e,
    glass: 0x1c242e,
    rim: 0x8a8f94,
    trim: 0x35383b,
  },
});

/** Die Liste in Anzeigereihenfolge. */
export const VEHICLES: Readonly<Record<VehicleId, VehicleSpec>> = {
  touge: TOUGE,
  gt: GT,
  offroad: OFFROAD,
  truck: TRUCK,
};

export const VEHICLE_ORDER: readonly VehicleId[] = ['touge', 'gt', 'offroad', 'truck'];

export const DEFAULT_VEHICLE: VehicleId = 'touge';

/** Unbekannte Kennung → Standardwagen, statt still `undefined` durchzureichen. */
export function vehicleSpec(id: string | null | undefined): VehicleSpec {
  return (id && VEHICLES[id as VehicleId]) || VEHICLES[DEFAULT_VEHICLE];
}
