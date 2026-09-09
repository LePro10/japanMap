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
 * WP3: Zehn originale Autos, ein Fahrmodell. IDs erhalten lokale Alt-Spielstände.
 * Chassis und Federung bestimmen Masse, Abmessungen und Aufbaubewegung.
 * Die aktive Fahrleistung steht in arcade.config.ts; Messung: tools/wp3-handling.mts.
 */
export type VehicleId = 'touge' | 'pip' | 'truck' | 'offroad' | 'torrent' | 'ribbon' | 'meridian' | 'morrow' | 'gt' | 'needle';

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
  readonly shape: 'coupe' | 'hatch' | 'truck' | 'suv' | 'rally' | 'liftback' | 'fastback' | 'muscle' | 'supercar' | 'openwheel';
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
  readonly category: 'Street' | 'Utility' | 'Sport' | 'Track';
  readonly price: number;
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
    // Darf negativ sein. `max(0, …)` hat die Räder am Aufnahmepunkt festgenagelt:
    // sitzt der Schwerpunkt auf Radhöhe (Needle, `restDrop ≈ 0`), ist jede
    // Einfederung ein negativer Hub — geklemmt auf 0 gehen die Reifen mit dem
    // Aufbau in den Boden. Der Anschlag ist der Federweg, nicht die Nulllinie.
    wheelMinDrop: restDrop - suspension.travel,
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

// WP3-Identitäten, visuell auf Chase-Cam-Lesbarkeit verbreitert (Blech ~12 cm
// innerhalb der Spur, Räder bleiben sichtbar). Alte Speicher-IDs bleiben gültig.
interface Identity {
 id: VehicleId; name: string; category: VehicleSpec['category']; price: number;
 mass: number; power: number; length: number; width: number; height: number;
 wheelbase: number; track: number; radius: number; wheelWidth: number; cg: number;
 front: number; travel: number; lock: number; shape: BodySpec['shape']; paint: number;
 layout: DriveLayout; grip: number; dirt: number; clearance: number; blurb: string;
}
function identity(v: Identity): VehicleSpec {
 const chassis = { ...CHASSIS, mass:v.mass, wheelbase:v.wheelbase, track:v.track,
  frontWeight:v.front, cgHeight:v.cg, yawInertia:v.mass*(v.length*v.length+v.width*v.width)/12,
  wheelRadius:v.radius, wheelWidth:v.wheelWidth, bodyLength:v.length, bodyWidth:v.width, bodyHeight:v.height };
 const frequency = v.category === 'Utility' ? 8 : v.category === 'Track' ? 13 : 10;
 return makeSpec({ id:v.id, name:v.name, category:v.category, price:v.price, blurb:v.blurb, chassis,
  suspension:{ ...SUSPENSION, travel:v.travel, stiffness:v.mass*frequency*frequency,
   damping:2*v.mass*frequency*(v.id === 'truck' ? .42 : .72),
   attitudeRate:v.category === 'Utility' ? 5 : 10,
   rollPerLateralG:v.category === 'Utility' ? .13 : v.category === 'Track' ? .025 : .065,
   pitchPerLongitudinalG:v.id === 'truck' ? .12 : v.category === 'Track' ? .025 : .06 },
  tire:{ ...TIRE, gripAsphalt:v.grip, gripGravel:v.grip*v.dirt, gripTerrain:v.grip*v.dirt },
  steering:{ ...STEERING, maxAngle:v.lock*Math.PI/180 },
  collision:{ ...VEHICLE_COLLISION, band:[v.clearance, v.height*.8] },
  limits:{ maxYawRate: v.category === 'Utility' ? 2.4 : 3.6, slipSpeedFloor:6, staticHoldSpeed:.8 },
  drivetrain:{ ...DRIVETRAIN, layout:v.layout, power:v.power*1000, maxDriveForce:v.mass*5,
   launchBoost:.3, launchSpeed:3, engineBrake:v.mass*.3 },
  body:{ shape:v.shape, hullWidth:v.shape === 'openwheel' ? .72 : v.width-.12,
   hullLength:v.length, roofHeight:v.height, paint:v.paint, paintDark:0x26323c,
   glass:0x36515d, rim:v.id === 'ribbon' ? 0xbca379 : 0xb8c2c9, trim:0x202830 }
 });
}
const TOUGE_SPEC = identity({"id": "touge", "name": "Kite S", "category": "Street", "price": 0, "mass": 1180, "power": 135, "length": 4.12, "width": 1.92, "height": 1.36, "wheelbase": 2.43, "track": 1.66, "radius": 0.31, "wheelWidth": 0.26, "cg": 0.5, "front": 0.52, "travel": 0.22, "lock": 35, "shape": "coupe", "paint": 14935775, "layout": "rwd", "grip": 0.95, "dirt": 0.7, "clearance": 0.16, "blurb": "Light nose, a progressive rear slide, and an easy catch."});
const PIP_SPEC = identity({"id": "pip", "name": "Pip 650", "category": "Street", "price": 3000, "mass": 820, "power": 70, "length": 3.18, "width": 1.66, "height": 1.6, "wheelbase": 2.12, "track": 1.44, "radius": 0.275, "wheelWidth": 0.22, "cg": 0.53, "front": 0.61, "travel": 0.23, "lock": 39, "shape": "hatch", "paint": 6401421, "layout": "fwd", "grip": 0.9, "dirt": 0.7, "clearance": 0.16, "blurb": "Tiny footprint. Quick turn-in and short, safe handbrake rotations."});
const TRUCK_SPEC = identity({"id": "truck", "name": "Skiff Mini", "category": "Utility", "price": 3600, "mass": 1080, "power": 78, "length": 3.58, "width": 1.76, "height": 1.77, "wheelbase": 2.24, "track": 1.52, "radius": 0.29, "wheelWidth": 0.24, "cg": 0.62, "front": 0.57, "travel": 0.32, "lock": 38, "shape": "truck", "paint": 15235389, "layout": "rwd", "grip": 0.78, "dirt": 0.75, "clearance": 0.24, "blurb": "Forward cab, empty bed, soft bounce. Pull through village lanes."});
const OFFROAD_SPEC = identity({"id": "offroad", "name": "Cairn 4", "category": "Utility", "price": 9000, "mass": 1880, "power": 145, "length": 3.94, "width": 2.06, "height": 1.89, "wheelbase": 2.4, "track": 1.76, "radius": 0.39, "wheelWidth": 0.3, "cg": 0.75, "front": 0.54, "travel": 0.42, "lock": 32, "shape": "suv", "paint": 13219724, "layout": "awd", "grip": 0.82, "dirt": 0.85, "clearance": 0.32, "blurb": "Heavy turn-in, tall tyres and long travel. Explore beyond the asphalt."});
const TORRENT_SPEC = identity({"id": "torrent", "name": "Torrent R", "category": "Sport", "price": 15000, "mass": 1320, "power": 205, "length": 4.02, "width": 1.98, "height": 1.47, "wheelbase": 2.52, "track": 1.7, "radius": 0.33, "wheelWidth": 0.28, "cg": 0.54, "front": 0.57, "travel": 0.29, "lock": 33, "shape": "rally", "paint": 1473408, "layout": "awd", "grip": 1.06, "dirt": 0.85, "clearance": 0.22, "blurb": "All-wheel punch and short, catchable slides on loose ground."});
const RIBBON_SPEC = identity({"id": "ribbon", "name": "Ribbon R", "category": "Sport", "price": 18000, "mass": 1280, "power": 225, "length": 4.48, "width": 2.02, "height": 1.29, "wheelbase": 2.65, "track": 1.74, "radius": 0.32, "wheelWidth": 0.3, "cg": 0.48, "front": 0.5, "travel": 0.21, "lock": 43, "shape": "liftback", "paint": 9196159, "layout": "rwd", "grip": 0.98, "dirt": 0.7, "clearance": 0.16, "blurb": "Wide steering range and a loose rear. Hold the slide, then countersteer."});
const MERIDIAN_SPEC = identity({"id": "meridian", "name": "Meridian GT", "category": "Sport", "price": 27000, "mass": 1660, "power": 285, "length": 4.86, "width": 2.1, "height": 1.4, "wheelbase": 2.91, "track": 1.8, "radius": 0.35, "wheelWidth": 0.3, "cg": 0.53, "front": 0.54, "travel": 0.23, "lock": 29, "shape": "fastback", "paint": 3165048, "layout": "awd", "grip": 1.03, "dirt": 0.7, "clearance": 0.16, "blurb": "Long, planted and composed. Sweep through fast bends; brake for tight ones."});
const MORROW_SPEC = identity({"id": "morrow", "name": "Morrow 8", "category": "Sport", "price": 30000, "mass": 1740, "power": 320, "length": 4.73, "width": 2.16, "height": 1.34, "wheelbase": 2.77, "track": 1.86, "radius": 0.35, "wheelWidth": 0.32, "cg": 0.55, "front": 0.59, "travel": 0.24, "lock": 30, "shape": "muscle", "paint": 14065978, "layout": "rwd", "grip": 0.91, "dirt": 0.7, "clearance": 0.16, "blurb": "Big low-end shove, heavy nose and a squirming rear. Leave braking room."});
const GT_SPEC = identity({"id": "gt", "name": "Ember RS", "category": "Track", "price": 42000, "mass": 1240, "power": 320, "length": 4.38, "width": 2.14, "height": 1.12, "wheelbase": 2.62, "track": 1.84, "radius": 0.34, "wheelWidth": 0.32, "cg": 0.41, "front": 0.44, "travel": 0.17, "lock": 28, "shape": "supercar", "paint": 13855106, "layout": "rwd", "grip": 1.22, "dirt": 0.65, "clearance": 0.12, "blurb": "Low mid-engine wedge. Precise at speed; respect an abrupt lift."});
const NEEDLE_SPEC = identity({"id": "needle", "name": "Needle 01", "category": "Track", "price": 54000, "mass": 710, "power": 300, "length": 4.55, "width": 2.2, "height": 1.03, "wheelbase": 2.88, "track": 1.92, "radius": 0.32, "wheelWidth": 0.36, "cg": 0.32, "front": 0.44, "travel": 0.13, "lock": 24, "shape": "openwheel", "paint": 13226712, "layout": "rwd", "grip": 1.35, "dirt": 0.65, "clearance": 0.14, "blurb": "Exposed wheels and featherweight response. Grip builds with speed."});
export const TOUGE = TOUGE_SPEC;
export const GT = GT_SPEC;
export const OFFROAD = OFFROAD_SPEC;
export const TRUCK = TRUCK_SPEC;
export const VEHICLES: Readonly<Record<VehicleId, VehicleSpec>> = {
 touge: TOUGE_SPEC,
 pip: PIP_SPEC,
 truck: TRUCK_SPEC,
 offroad: OFFROAD_SPEC,
 torrent: TORRENT_SPEC,
 ribbon: RIBBON_SPEC,
 meridian: MERIDIAN_SPEC,
 morrow: MORROW_SPEC,
 gt: GT_SPEC,
 needle: NEEDLE_SPEC,
};
export const VEHICLE_ORDER: readonly VehicleId[] = ["touge", "pip", "truck", "offroad", "torrent", "ribbon", "meridian", "morrow", "gt", "needle"];
export const DEFAULT_VEHICLE: VehicleId = "touge";
export function vehicleSpec(id: string | null | undefined): VehicleSpec { return (id && VEHICLES[id as VehicleId]) || TOUGE; }
