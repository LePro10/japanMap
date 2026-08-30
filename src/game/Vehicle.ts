import { Euler, Quaternion, Vector3 } from 'three';

import { GRAVITY, SURFACE_FEEL } from '@/config/vehicle.config';
import { AIR_CONTROL } from '@/config/arcade.config';
import { ARCADE, LOOSE_BONUS } from '@/config/arcade.config';
import { TOUGE, type VehicleSpec } from '@/config/vehicles.config';
import { ArcadeDynamics, type DriveCommand, type PlanarEnv } from './arcadeDynamics';
import {
  RAIL_BREAK_ENERGY,
  RAIL_BREAK_SPEED,
  TREE_BREAK_ENERGY,
  TREE_BREAK_SPEED,
  MAX_BREAKS_PER_STEP,
  shouldBreak,
  type BreakEvent,
} from './breakables';
import {
  HIT_TREE,
  createBodyContacts,
  type BodyContact,
  type CollisionWorld,
} from './CollisionWorld';
import { NO_HULL_CONTACT, hullSupport, resolveHullTerrain } from './hullTerrain';
import {
  axleSupport,
  hasReachableWheel,
  slopeSupport,
  reachableWheel,
  resolveTerrainFollow,
  type FollowState,
} from './supportPlane';

/**
 * Das Fahrmodell — PLAN.md P14, Umsetzung der Entscheidung aus P9.2.
 *
 * ## Was hier modelliert wird und was nicht
 *
 * | Freiheitsgrad | Behandlung |
 * |---|---|
 * | Lage in XZ, Gieren | **dynamisch** — Reifenkräfte, Gierträgheit |
 * | Höhe | **dynamisch** — eine Feder gegen die Ebene durch die vier Radaufstandspunkte |
 * | Nicken, Wanken | **kinematisch** — folgen dem Gelände und der Lastverlagerung, wirken nicht zurück |
 * | Radstellung, Raddrehzahl | **kinematisch** — Anzeige, keine Kraftquelle |
 *
 * Die dritte Zeile ist die eigentliche Entscheidung. Ein Aufbau mit vier
 * unabhängigen Federn und drei dynamischen Drehachsen ist ein gekoppeltes
 * System, dessen Eigenfrequenzen man kennen muss, damit es bei einem
 * Bordsteinkontakt nicht explodiert — und Wanken und Nicken tragen zum
 * *Fahrgefühl* fast nichts bei, das nicht die Lastverlagerung schon leistet. Sie
 * tragen zum **Bild** bei, und dafür genügt eine gefederte Nachführung.
 *
 * Bekannte Folge: das Auto kann sich nicht überschlagen. In einer 17-m-Kehre mit
 * Vollgas bleibt es auf den Rädern, wo ein echtes kippen könnte. Das ist für
 * Arcade-Drift eine Eigenschaft, kein Fehler — aber es ist eine Entscheidung und
 * kein Zufall.
 *
 * ## Die Näherungen, die eine Neigung betreffen
 *
 * Die waagerechte Bewegung wird in der **XZ-Ebene** gerechnet, nicht in der
 * Hangebene. Der Hang wirkt über zwei Terme:
 *
 *  1. **Hangabtrieb**, exakt als waagerechte Komponente der Schwerkraft:
 *     `a = g · n_y · (n_x, n_z)`, Betrag `g · sinθ · cosθ`. Das ist die
 *     Projektion des echten Hangabtriebs `g · sinθ` auf die Waagerechte — für
 *     eine Rechnung in der Waagerechten also der richtige Wert.
 *  2. **Radlast**, mit `cosθ` verringert: `Fz = F_Feder · n_y`.
 *
 * Der Restfehler betrifft die Haltebedingung am Hang: das Modell hält, solange
 * `μ > sinθ`, physikalisch richtig wäre `μ > tanθ`. Bei der steilsten Straße der
 * Karte (Tempelaufgang, 43 % ≙ 23,3°) sind das 0,395 gegen 0,432 — 8,5 %
 * zugunsten des Autos. Bei μ ≥ 0,69 (Kies) spielt der Unterschied auf keiner
 * Straße dieser Karte eine Rolle; auf einer 45°-Wand tut er es, und dort wäre er
 * das kleinste Problem.
 */

/** Eingabe eines Frames. Alles normiert, damit Tastatur, Stick und Messlauf gleich aussehen. */
export interface DriveInput {
  /** 0…1 */
  throttle: number;
  /** 0…1 — bei Stillstand und ohne Gas legt sie den Rückwärtsgang ein. */
  brake: number;
  /** −1…1, negativ = links. Der **Wunsch**, nicht der Einschlag. */
  steer: number;
  handbrake: boolean;
  /**
   * Nitro — P22.
   *
   * Optional, damit jeder Messlauf und jeder Prüfstand, der die Eingabe von Hand
   * baut, unverändert weiterläuft. Ein Pflichtfeld hätte in `tools/bench/` und
   * `debug/driveProbe.ts` zwei Dutzend Fundstellen gebraucht, ohne dass eine
   * davon etwas anderes als `false` gemeint hätte.
   */
  boost?: boolean;
}

/**
 * Belagsart unter einem Rad. Bestimmt Reibwert und Rollwiderstand.
 *
 * Eine Vereinigung von Zeichenketten und **kein `enum`**: `verbatimModuleSyntax`
 * und `isolatedModules` sind in diesem Projekt an, und ein modulübergreifendes
 * `const enum` verhält sich unter esbuild anders als unter `tsc` (dort wird es
 * eingesetzt, hier zu einem Objekt). Der Bestand kommt ohne ein einziges `enum`
 * aus; das bleibt so.
 */
export type Surface = 'asphalt' | 'kies' | 'gelaende' | 'wasser';

/**
 * Was das Fahrzeug über den Boden wissen muss.
 *
 * **Die Höhe kommt vom `TerrainSampler`, nicht vom gerenderten Gitter** — das ist
 * die Festlegung aus PLAN.md 9.1, und der Grund steht dort: die beiden Quellen
 * sind nicht identisch, und ein Fahrzeug, das auf der einen fährt und die andere
 * sieht, schwebt oder versinkt. Wer diese Schnittstelle implementiert, muss
 * denselben Sampler benutzen, den auch die Streuung und die Props benutzen.
 */
export interface Ground {
  /** Höhe der befahrbaren Oberfläche in Metern (Straßenbelag, Bürgersteig, Gelände). */
  height(x: number, z: number): number;
  /** Flächennormale, in `target` geschrieben. */
  normal(x: number, z: number, target: Vector3): Vector3;
  surface(x: number, z: number): Surface;
  /**
   * Wassertiefe über dem festen Boden, in Metern. 0 = trocken.
   *
   * Optional, weil der Messstand und der ebene Prüfstand kein Wasser kennen.
   * Fehlt die Methode, ist die Tiefe null — Asphalt-Zahlen bleiben bitgleich.
   */
  waterDepth?(x: number, z: number): number;
}

/** Ablesbarer Zustand — für Anzeige, Debug-Panel und Messläufe. */
export interface VehicleTelemetry {
  /** Betrag der Geschwindigkeit in m/s. */
  speed: number;
  /** Längsgeschwindigkeit (negativ = rückwärts). */
  forwardSpeed: number;
  /** Schwimmwinkel in Radiant: Winkel zwischen Fahrzeugachse und Fahrtrichtung. */
  slip: number;
  /** Schräglaufwinkel der Achsen in Radiant. */
  slipFront: number;
  slipRear: number;
  /** Verhältnis geforderter zu übertragbarer Antriebskraft. > 1 = Räder drehen durch. */
  wheelspin: number;
  /** Radeinschlag in Radiant. */
  steerAngle: number;
  /** Federweg-Ausnutzung 0…1. 0 = ausgefedert (in der Luft). */
  compression: number;
  airborne: boolean;
  surface: Surface;
  /** Tiefste Durchdringung, die im letzten Schritt aufgelöst wurde, in Metern. */
  lastPenetration: number;
  /** Zahl der Kontaktpunkte im letzten Schritt. */
  contacts: number;
  /**
   * Tiefstes Eintauchen der Karosserie in das **Gelaende**, in Metern — P20.
   *
   * Getrennt von lastPenetration, weil es eine andere Frage beantwortet: die
   * zaehlt Hindernisse (Baum, Planke, Haus), diese das Hoehenfeld. Bis P20 gab
   * es fuer das Gelaende ueberhaupt keine Zahl, und genau deshalb konnte ein
   * Auto bis zur Fensterkante im Hang stecken, ohne dass eine Kennzahl anschlug.
   */
  hullDepth: number;
  /** Wassertiefe am Schwerpunkt, in Metern. */
  waterDepth: number;
  /**
   * 0…1, wie stark die Hinterachse markiert. Für Spur und HUD, nicht für Kräfte.
   * Gebildet aus hinterem Schräglauf, Durchdrehen und Handbremse.
   */
  skid: number;
  /**
   * Wie weit der Drift-Zustand offen ist, 0…1 — P22.
   *
   * **Der Unterschied zu `skid` ist die Richtung der Ursache.** `drift` ist das,
   * was der Spieler *anfordert* (Handbremse, Gas in der Kurve); `skid` ist das,
   * was dabei *herauskommt* (Schwimmwinkel, durchdrehende Räder). Getrennt, weil
   * die Punktezählung das eine und die Spuren das andere brauchen: ein Wagen,
   * der auf Eis von allein rutscht, markiert — verdient aber nichts.
   */
  drift: number;
  /** Nitro-Vorrat, 0…1 — P22. */
  boost: number;
  /** Läuft der Nitro gerade? */
  boosting: boolean;
}

/**
 * > **Sieben Modulkonstanten standen hier bis P17, und sie mussten alle weg.**
 * >
 * > `STATIC_COMPRESSION`, `SPRING_REST`, `SLIP_SPEED_FLOOR`,
 * > `STATIC_HOLD_SPEED`, `MAX_YAW_RATE`, `WHEEL_MAX_DROP` und `WHEEL_MIN_DROP`
 * > waren aus `CHASSIS` und `SUSPENSION` gerechnet — also aus den Maßen **eines**
 * > Fahrzeugs. Sobald `Vehicle` eine Spec bekommt, sind sie eine Falle: die
 * > Physik rechnet mit den Zahlen des Lastwagens, die Federruhelage bleibt die
 * > des Coupés. Nichts davon würde eine Kennzahl melden — das Auto führe, nur
 * > eben falsch, und der Fehler säße 47 cm tief im Boden.
 * >
 * > Die fünf gerechneten stehen jetzt in `VehicleSpec.derived`
 * > (`vehicles.config.ts`, Funktion `derive`), die zwei gewählten in
 * > `VehicleSpec.limits`. Ihre Herleitungen sind mitgewandert; was hier folgt,
 * > ist die Begründung, die an dieser Stelle gebraucht wird.
 */

/**
 * Der Klemmschutz — P19, und ausdrücklich **keine** Physik.
 *
 * Sechs Zahlen, die zusammen einen Satz ergeben: *steckt der Wagen in etwas,
 * will der Fahrer fahren, und kommt der Wagen dabei nicht `WEDGE_FREE_DISTANCE`
 * von der Stelle, dann wächst ihm nach `WEDGE_DELAY` eine Trenngeschwindigkeit
 * mit `WEDGE_ESCAPE_RATE` bis höchstens `WEDGE_ESCAPE_MAX`.*
 *
 * Sie stehen als Modulkonstanten und nicht in der Spec, weil sie **nicht** aus
 * den Maßen eines Fahrzeugs folgen — genau die Prüfung, an der in P17 sieben
 * andere Konstanten hier gescheitert sind. Ein Lastwagen, der sich festfährt,
 * soll sich genauso freischieben wie ein Coupé; das ist eine Frage der
 * Bedienbarkeit und keine der Masse.
 *
 * > **`WEDGE_SPEED` gab es bis zur dritten Fassung und ist ersatzlos weg.** Sie
 * > war die Bedingung „langsamer als 0,6 m/s" — und hat den Schutz abgeschaltet,
 * > sobald er wirkte: die Trennhilfe hob das Tempo über die Schwelle, der Zähler
 * > fiel auf null, die Hilfe hörte auf. Ersetzt durch den **Weg**; Begründung
 * > und Messung bei `#updateWedge`.
 */
const WEDGE_DELAY = 1.2;
const WEDGE_ESCAPE_RATE = 2.0;
const WEDGE_ESCAPE_MAX = 2.5;
/**
 * Ab dieser **nach** dem Schritt verbliebenen Überdeckung gilt der Wagen als
 * geklemmt, in Metern.
 *
 * 2 cm. Die Zahl trennt zwei Lagen, die sich in jeder anderen Kennzahl gleichen:
 * gegen einen Baum drücken (Überdeckung wird jeden Schritt vollständig gelöst,
 * `rest = 0`) und zwischen zwei Dingen klemmen (`rest` bleibt stehen). Ohne
 * diese Trennung sprang die Trennhilfe beim Anfahren gegen jeden Baum an —
 * gemessen im Prüfstand, siehe die Begründung an der Fundstelle.
 */
const WEDGE_RESIDUAL = 0.02;
/**
 * Ab diesem Wert gilt der Wagen als **eingeklemmt** statt als angedrückt.
 *
 * `squeeze = 1 − |Σn| / n` über die Kontaktnormalen: 0 bei einem einzelnen
 * Kontakt (gegen eine Wand drücken — kein Fehler, da will man nichts tun), 1 bei
 * zwei exakt gegenüberliegenden. 0,45 liegt über allem, was ein Kontakt mit
 * einer Innenecke ergibt (zwei Wände im rechten Winkel: 1 − √2/2 = 0,29), und
 * unter dem, was zwei sich gegenüberstehende Hindernisse ergeben.
 */
const WEDGE_SQUEEZE = 0.45;
/**
 * Gedächtnis des Normalen-Mittelwerts, in Sekunden.
 *
 * 0,2 s ist lang genug, dass ein Wechsel vorn/hinten (der im Klemmfall je
 * Schritt passiert) sich aufhebt, und kurz genug, dass ein Wagen, der eine Kurve
 * an der Planke entlangschrammt, nicht als geklemmt gilt — dort dreht sich die
 * Normale langsam, und der Mittelwert folgt ihr.
 */
const WEDGE_MEMORY = 0.2;
/**
 * Wie schnell der Klemmzähler in kontaktfreien Schritten abklingt, als
 * Vielfaches seiner Aufbaurate.
 *
 * **Er wird abgebaut und nicht gelöscht**, und das ist der Unterschied zwischen
 * einem Klemmschutz, der greift, und einem, der es nicht tut: der eingeklemmte
 * Wagen am Tempelaufgang hatte nur in **jedem zehnten Schritt** einen Kontakt —
 * die Auflösung schiebt ihn frei, im nächsten Schritt drückt der Antrieb ihn
 * zurück. Mit Löschen kam die halbe Sekunde nie zusammen, und der Schutz feuerte
 * nie. Mit Faktor 2 ist ein wirklich freier Wagen nach einer Viertelsekunde bei
 * null.
 */
const WEDGE_RELEASE = 2;
/**
 * Wie viel **quer** in der Trennrichtung steckt, als Verhältnis zur Normalen.
 *
 * 0,8 heißt rund 39° schräg. Senkrecht allein genügt in einer Nische nicht: der
 * Wagen weicht dem vorderen Hindernis nach hinten aus, stößt ans hintere und
 * pendelt. Erst der Querweg führt hinaus — und weil er quer ist, kämpft er auch
 * nicht gegen den Fahrer, der geradeaus drückt.
 */
const WEDGE_SIDESTEP = 0.8;
/**
 * Wie lange ein Kontakt „noch zählt", in Sekunden.
 *
 * 0,4 s. Ein eingeklemmter Wagen berührt sein Hindernis **nicht in jedem
 * Schritt**: die Auflösung schiebt ihn frei, der Antrieb drückt ihn zurück,
 * dazwischen liegen kontaktfreie Schritte. Am Tempelaufgang war es einer von
 * zehn — ohne Gedächtnis lief der Klemmzähler netto rückwärts und erreichte
 * seine Schwelle nie.
 */
const WEDGE_CONTACT_MEMORY = 0.4;
/**
 * Ab diesem zurückgelegten Weg gilt eine Klemme als überstanden, in Metern.
 *
 * 1,5 m — knapp eine halbe Wagenlänge. Die Zahl trennt „von der Stelle gekommen"
 * von „zappelt". Sie ersetzt die Tempobedingung des ersten Versuchs, die sich
 * selbst ausgeschaltet hat (Begründung bei `#updateWedge`).
 */
const WEDGE_FREE_DISTANCE = 1.5;
/**
 * Ab diesem Skalarprodukt gelten zwei Kontaktnormalen als **entgegengesetzt**.
 *
 * −0,3 ≙ mehr als 107° auseinander. Erst dann ist der Wagen aus zwei Richtungen
 * blockiert und damit gefangen; ein einzelnes Hindernis (Baum, Mauer) erzeugt
 * das nie, und wer nur dagegen drückt, soll auch dagegen gedrückt bleiben.
 */
const WEDGE_OPPOSED_DOT = -0.3;

/**
 * Bezugsgeschwindigkeit im Nenner des Schräglaufwinkels, in m/s.
 *
 * `α = atan(vLat / v)` hat bei `v → 0` eine Singularität: eine
 * Querbewegung von 1 cm/s im Stand ergäbe 90° Schräglauf und damit die volle
 * Reifenkraft aus dem Nichts. Mit einem Mindestwert im Nenner werden die Reifen
 * bei Schrittgeschwindigkeit zu **viskosen Dämpfern** — sie bremsen die
 * Querbewegung proportional zu ihr, statt einen Winkel zu melden.
 *
 * ~~2 m/s ist knapp über Schrittgeschwindigkeit.~~ **Zu wenig, und das war die
 * Ursache dafür, dass im Gelände nichts fahrbar war.** Bei 2 m/s Bezugstempo
 * ergibt schon eine Gierrate von 1 rad/s einen hinteren Schräglaufwinkel von
 * 32° — tief im **abfallenden** Ast der Kennlinie. Der Reifen antwortet dort mit
 * *weniger* Kraft, je weiter er wegrutscht, und das ist eine Mitkopplung.
 *
 * Gemessen auf der Wiese, Vollgas geradeaus, **Lenkung null**: nach 0,5 s stand
 * der hintere Schräglauf bei −5,6°, nach 1,0 s bei −19,7°, nach 2,0 s war der
 * Wagen mit 63° Schwimmwinkel quer. Auf ideal ebenem Asphalt passierte das
 * nicht, weil dort nichts die Querbewegung anstößt — die Mikroneigung des
 * Höhenfelds (15 cm Stufen auf 1,5 m) genügte als Anstoß.
 *
 * 6 m/s (22 km/h) hält die Winkel bei Schrittgeschwindigkeit klein genug, dass
 * die Reifen im **ansteigenden** Ast bleiben und rückstellend wirken. Oberhalb
 * davon ist der Winkel unverfälscht, das Fahrverhalten also unverändert.
 *
 * > **Die Begründung oben ist mit P17 hinfällig, der Wert bleibt trotzdem.** Sie
 * > stützt sich darauf, dass 32° Schräglauf „tief im abfallenden Ast" liegen —
 * > das galt für die alte Kennlinie. Die heutige trägt bis 14,2° volle Kraft und
 * > fällt erst bei 30…40° auf `tailGrip`; die Mitkopplung, gegen die 6 m/s
 * > eingeführt wurden, gibt es nicht mehr. Und die eigentliche Ursache jener
 * > Geländefahrten war ohnehin eine andere, siehe `TIRE.lateralReserve`.
 * >
 * > Gemessen wurde deshalb, ob der Wert überhaupt noch etwas tut — 1,5 / 2,5 /
 * > 4 / 6 m/s gegen vier Manöver:
 * >
 * > | Wert | Kehrenradius bei 30 km/h | Rangieren, max. Schwimmwinkel | Wiese, 10 s Vollgas | Halten am 25-%-Hang, 5 s |
 * > |---|---|---|---|---|
 * > | 1,5 | 5,3 m | 25,6° | 144 km/h / 0,6° | 0,19 m |
 * > | 2,5 | 5,3 m | 31,3° | 144 km/h / 0,9° | 0,19 m |
 * > | 4,0 | 5,3 m | 33,6° | 144 km/h / 1,5° | 0,19 m |
 * > | 6,0 | 5,3 m | 31,9° | 144 km/h / 2,3° | 0,19 m |
 * >
 * > Der Wendekreis ist über den Lenkeinschlag begrenzt und nicht über die
 * > Reifen, das Halten am Hang macht `STATIC_HOLD_SPEED`. Der Wert ist damit
 * > **wirkungslos geworden** — und wird genau deshalb nicht angefasst: eine
 * > Änderung ohne messbaren Unterschied ist keine Verbesserung, sondern ein
 * > weiterer Wert ohne Messung daneben.
 *
 * > Der Wert steht seit P18 als `limits.slipSpeedFloor` in der Spec. Er ist bei
 * > allen vier Fahrzeugen gleich (6 m/s) — und bleibt trotzdem je Fahrzeug
 * > einstellbar, weil die Größe, gegen die er schützt (die Gierrate bei
 * > Schrittgeschwindigkeit), von Radstand und Gierträgheit abhängt.
 */

export class Vehicle {
  /** Schwerpunkt in Weltkoordinaten. */
  readonly position = new Vector3();
  /**
   * Weltgeschwindigkeit — **der Zustand**, aus dem alles andere folgt.
   *
   * Bis zur Energiemessung war es andersherum: `#vLong`/`#vLat` waren der Zustand
   * und diese hier die Ableitung. Warum das gedreht wurde, steht bei der
   * Integration in `step()` — die Kurzfassung: im mitrotierenden System erzeugt
   * expliziter Euler Energie, im Weltsystem gibt es den Term gar nicht.
   */
  readonly velocity = new Vector3();
  readonly quaternion = new Quaternion();

  /**
   * Welches Fahrzeug gerade gerechnet wird.
   *
   * **Kein `readonly` und kein Konstruktorargument allein**, weil der Wechsel im
   * Betrieb passiert: `DriveSystem` tauscht die Spec und behält die Instanz. Das
   * ist kein Geschmack, sondern eine Notwendigkeit — `main.ts` reicht
   * `drive.vehicle.telemetry` **als Objekt** an die Tonschicht weiter, und eine
   * neue `Vehicle`-Instanz hätte eine neue Telemetrie. Der Motor wäre nach dem
   * ersten Fahrzeugwechsel stumm geblieben, ohne dass irgendetwas gemeldet
   * hätte.
   */
  #spec: VehicleSpec = TOUGE;

  #yaw = 0;
  #yawRate = 0;
  #pitch = 0;
  #roll = 0;
  #vLong = 0;
  #vLat = 0;
  #vY = 0;
  #steerAngle = 0;
  #airborne = false;

  /**
   * Die waagerechte Dynamik — P22.
   *
   * **Sie hält ihren eigenen Zustand** (Einschlag, Gas, Drift, Nitro, Gierrate),
   * und `Vehicle` liest ihn nur ab. Die Alternative wäre gewesen, die Felder
   * hier zu führen und der Funktion hereinzureichen; dann stünde derselbe
   * Zustand an zwei Stellen, und die Erfahrung dieses Projekts mit zwei
   * Wahrheiten für dieselbe Sache steht in CLAUDE.md gleich viermal.
   */
  readonly #planar = new ArcadeDynamics(ARCADE.touge, LOOSE_BONUS.touge);
  /** Drehwinkel der Räder, nur fürs Bild. */
  #wheelSpin = 0;

  readonly #forward = new Vector3();
  readonly #right = new Vector3();
  readonly #normal = new Vector3(0, 1, 0);
  /** Flächennormale an der Stelle **nach** der Integration — nur für den Bodenfang. */
  readonly #followNormal = new Vector3(0, 1, 0);
  /** Hochachse des Aufbaus und ein Rechenplatz — nur für `#placeWheels`. */
  readonly #up = new Vector3(0, 1, 0);
  readonly #scratch = new Vector3();
  /** Kratzplatz für  — Prüfpunkt und Flächennormale. */
  readonly #hullPoint = new Vector3();
  readonly #hullNormal = new Vector3();
  readonly #euler = new Euler(0, 0, 0, 'YXZ');
  readonly #follow: FollowState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  /** Kontaktpuffer der Kollisionsauflösung — einmal angelegt, je Schritt neu gefüllt. */
  readonly #contacts: BodyContact[] = createBodyContacts();
  /** Wie lange der Wagen schon steht und dabei in etwas steckt, in Sekunden. */
  #wedgeTime = 0;
  /** Gleitender Mittelwert der Kontaktnormalen — siehe `squeeze` in `#resolveCollision`. */
  #wedgeNormX = 0;
  #wedgeNormZ = 0;
  /** Gemerkte Ausweichrichtung — bei Kontakt gebildet, auch ohne Kontakt angewandt. */
  #wedgeEscX = 0;
  #wedgeEscZ = 0;
  /** Wie lange der letzte Kontakt her ist, in Sekunden. Siehe `#resolveCollision`. */
  #contactAge = 99;
  /**
   * Ausweichseite einer Klemme, +1 oder −1 — **einmal je Episode** festgelegt.
   *
   * Ohne diese Sperre kippt sie: die Kontaktnormale wechselt in einer Nische von
   * Schritt zu Schritt zwischen vorn und hinten, und mit ihr die berechnete
   * Querrichtung. Der Wagen weicht dann abwechselnd nach links und rechts aus und
   * bleibt netto stehen. Gemessen am Tempelaufgang: 0,09 m in fünf Sekunden bei
   * 2,3 km/h — er *bewegte* sich, er kam nur nicht weg.
   */
  #wedgeSide = 0;
  /** Wo die laufende Klemm-Episode begonnen hat — der Bezug für den Weg. */
  #wedgeStartX = 0;
  #wedgeStartZ = 0;
  /** Erste Kontaktnormale der Episode, und ob je eine entgegengesetzte kam. */
  #wedgeFirstNX = 0;
  #wedgeFirstNZ = 0;
  #wedgeOpposed = false;
  #breaks: BreakEvent[] = [];
  #brokeThisStep = 0;

  /** Radaufstandshöhen: vorn links, vorn rechts, hinten links, hinten rechts. */
  readonly #wheelGround = [0, 0, 0, 0];
  /** Hoehe der Hangebene unter jedem Rad, relativ zum Schwerpunktsniveau — P20. */
  readonly #wheelTilt = [0, 0, 0, 0];
  readonly #wheelPos = [
    new Vector3(),
    new Vector3(),
    new Vector3(),
    new Vector3(),
  ] as const;

  readonly telemetry: VehicleTelemetry = {
    speed: 0,
    forwardSpeed: 0,
    slip: 0,
    slipFront: 0,
    slipRear: 0,
    wheelspin: 0,
    steerAngle: 0,
    compression: 0,
    airborne: false,
    surface: 'asphalt',
    lastPenetration: 0,
    contacts: 0,
    hullDepth: 0,
    waterDepth: 0,
    skid: 0,
    drift: 0,
    boost: 1,
    boosting: false,
  };

  constructor(spec: VehicleSpec = TOUGE) {
    this.#spec = spec;
    this.#syncPlanarSpec();
  }

  /**
   * Radstand und Masse an die Dynamik reichen.
   *
   * Sie stehen bewusst **nicht** in `ArcadeSpec` — beides sind Maße der
   * Karosserie und gehören in `chassis`. Ein zweiter Wert dafür wäre genau die
   * Doppelung, an der in P17 sieben Modulkonstanten gescheitert sind: der
   * Lastwagen führe dann mit dem Radstand des Coupés, und keine Kennzahl
   * meldete es.
   */
  #syncPlanarSpec(): void {
    this.#planar.setSpec(ARCADE[this.#spec.id], LOOSE_BONUS[this.#spec.id]);
    this.#planar.setWheelbase(this.#spec.chassis.wheelbase);
    this.#planar.setMass(this.#spec.chassis.mass);
  }

  /** Die gerechnete Spec. Lesen darf jeder, ändern nur über `setSpec`. */
  get spec(): VehicleSpec {
    return this.#spec;
  }

  /**
   * Fahrzeug wechseln.
   *
   * **Setzt keinen Zustand zurück** — das macht der Aufrufer über `respawn`, und
   * zwar zwingend: die Federruhelage, die Radanschläge und der Schwerpunkt sind
   * andere geworden, und ein Wagen, der mit der Höhe des Coupés und den Maßen
   * des Lastwagens weiterrechnet, steht 58 cm im Boden. Zwei getrennte Aufrufe
   * und nicht einer, weil `respawn` einen `Ground` braucht und die Spec ihn
   * nicht kennt; `DriveSystem.setVehicle()` ist die Stelle, die beides in der
   * richtigen Reihenfolge tut.
   */
  setSpec(spec: VehicleSpec): void {
    this.#spec = spec;
    this.#syncPlanarSpec();
  }

  /** Nitro nachfüllen, 0…1 — für Sprünge, Brüche und Sammelstücke. */
  addBoost(amount: number): void {
    this.#planar.addBoost(amount);
  }

  get yaw(): number {
    return this.#yaw;
  }

  get wheelSpinAngle(): number {
    return this.#wheelSpin;
  }

  /** Weltpositionen der vier Räder — für das Mesh. Reihenfolge wie `#wheelGround`. */
  get wheelPositions(): readonly Vector3[] {
    return this.#wheelPos;
  }

  /**
   * Brüche des letzten Schritts. Der Aufrufer nimmt das Array und macht etwas
   * damit (Trümmer, Shader-Loch, Streuung überspringen) — stehen lassen hieße,
   * dass ein Messlauf ohne Verbraucher die Liste unbegrenzt füllt.
   */
  consumeBreaks(): BreakEvent[] {
    const out = this.#breaks;
    this.#breaks = [];
    return out;
  }

  /**
   * Auf eine Stelle setzen und allen Bewegungszustand verwerfen.
   *
   * Alles wird zurückgesetzt, auch Gierrate und Federweg: ein Respawn mitten im
   * Drift, der die Drehung behält, dreht sich am neuen Ort weiter — und das sieht
   * nach einem Fehler aus, weil es einer ist.
   */
  respawn(x: number, z: number, heading: number, ground: Ground): void {
    const groundY = ground.height(x, z);
    // **Die Ruhehöhe hängt von der Neigung ab, und das ist keine Feinheit.** Der
    // Federweg wird senkrecht zur Fläche gemessen (`gap · n_y`); die Ruhelage
    // liegt deshalb `cgHeight / n_y` **senkrecht** über dem Boden, nicht
    // `cgHeight`. An einem 45°-Hang sind das 0,74 m statt 0,52 m.
    //
    // Wurde das Auto auf `cgHeight` abgesetzt, war die Feder sofort 0,25 m
    // eingedrückt — mehr als ihr Federweg. Der Anschlag mit seiner neunfachen
    // Rate schoss es dann in die Luft: gemessen am Hang unter dem Massiv
    // **91,9 % der Zeit in der Luft, längste Flugphase 7,7 s**.
    ground.normal(x, z, this.#normal);
    const aufrecht = Math.max(0.35, this.#normal.y);
    this.position.set(x, groundY + this.#spec.chassis.cgHeight / aufrecht, z);
    this.#yaw = heading;
    this.#yawRate = 0;
    // ── Und die Lage kommt vom Hang, nicht aus der Waagerechten — P21 ─────
    //
    // **Bis P21 stand hier `pitch = 0; roll = 0`**, und das ist auf einem Hang
    // schlicht falsch: der Wagen stand für die Einschwingzeit von
    // `attitudeRate` (rund 0,3 s) waagerecht auf einer schiefen Ebene. Bis P20
    // war das ein Schönheitsfehler — seit die Karosserie gegen das Gelände
    // prüft, gräbt sich das Heck dabei ein.
    //
    // Gemessen auf einem glatten 20°-Hang, Coupé, direkt nach dem Absetzen:
    // **0,369 m** Blech im Boden. Auf 30° waren es 0,664 m. Der Prüfstand hat
    // das als „Aufsitzen" gemeldet, und es war in Wahrheit der erste
    // Zehntelsekunde-Zustand des Laufs — eine Zahl, die *entsteht*, weil die
    // Messung sich ihren eigenen Anfangszustand kaputtgesetzt hat. Dieselbe
    // Falle wie bei den exakt −6,00 cm Standhöhe in P14.
    //
    // Betrifft im Betrieb jedes Absetzen: Taste `R`, Einsteigen, Fahrzeugwechsel
    // und die Klemmwache aus P20 — also ausgerechnet die Wege, die einen
    // festgefahrenen Wagen befreien sollen.
    //
    // Die Rechnung ist dieselbe wie im Luftzweig von `#updateAttitude`: der
    // Höhengradient längs einer Fahrzeugachse ist `−(n·d) / n_y`.
    this.#forward.set(Math.sin(heading), 0, Math.cos(heading));
    this.#right.set(-Math.cos(heading), 0, Math.sin(heading));
    this.#pitch = Math.atan(
      (this.#normal.x * this.#forward.x + this.#normal.z * this.#forward.z) / aufrecht,
    );
    this.#roll = Math.atan(
      -(this.#normal.x * this.#right.x + this.#normal.z * this.#right.z) / aufrecht,
    );
    this.#vLong = 0;
    this.#vLat = 0;
    this.#vY = 0;
    this.#steerAngle = 0;
    this.#planar.reset();
    this.#airborne = false;
    // **Und der Raddrehwinkel.** Jeder Zustand, der ein Reset überlebt, tarnt
    // sich als „nicht ganz reproduzierbar": gemessen endeten zwei Läufe
    // derselben Strecke 6 cm auseinander (742,26 m gegen 742,20 m), weil die
    // Lastverlagerung des vorigen Laufs stehen geblieben war. Die Ketten dieses
    // Projekts sind deterministisch; wenn nicht, ist etwas kaputt.
    //
    // > Die Lastverlagerung selbst (`#lastLongAccel`) ist mit P22 entfallen —
    // > das Arcade-Modell hat keine Radlasten mehr, gegen die sie zu verrechnen
    // > wäre. Der Satz darüber gilt trotzdem und ist der Grund, warum
    // > `#planar.reset()` drei Zeilen höher steht.
    this.#wheelSpin = 0;
    this.#breaks = [];
    this.velocity.set(0, 0, 0);
    this.#updateBasis();
    this.#hullSupport = -Infinity;
    this.#sampleWheels(ground);
    // ── Die Höhe kommt von der **Stützebene**, nicht vom Boden unter dem
    //    Schwerpunkt — P21 ──────────────────────────────────────────────────
    //
    // Die Zeile oben setzt `groundY + cgHeight / n_y` aus **einer** Probe. Der
    // Aufbau steht aber auf vier Rädern, und auf welligem Grund liegen die
    // woanders: gemessen bei (−1328 | −517) auf 76,43…76,86 m, während der Boden
    // unter dem Schwerpunkt bei 76,87 m liegt — **43 cm** Unterschied.
    //
    // Die Folge ist kein Schweben, sondern das Gegenteil: der Wagen wird beim
    // Absetzen in den Boden gedrückt. Gemessen an derselben Stelle Einfederung
    // **1,29** (der Federweg ist 1,0, darüber liegt der Gummipuffer) und
    // **0,37 m** Blech im Boden — und weil die Stützebene den Aufbau dort nicht
    // wieder heraushebt, blieb der Wagen liegen: 1,3 m in sieben Sekunden
    // Vollgas.
    //
    // Zweimal gerechnet, weil `#contactHeight` über `expected` von der Höhe
    // abhängt, die sie gerade bestimmt. Die Radproben selbst hängen **nicht** an
    // der Höhe (nur an x, z, Gierwinkel und Normale), sie müssen also nicht neu
    // genommen werden. Nach dem zweiten Durchgang liegt der Rest unter einem
    // Millimeter.
    for (let i = 0; i < 2; i++) {
      this.position.y = this.#contactHeight() + this.#spec.chassis.cgHeight / aufrecht;
    }
    this.#updateTransform();
    this.#placeWheels();

    // **Und die Telemetrie.** Sie ist eine Anzeige — aber sie wird gelesen, und
    // zwar vom Regler des Messstands, bevor der erste Schritt gerechnet ist.
    // Blieb sie stehen, begann ein Lauf mit dem Tempo des vorigen, und zwei
    // Läufe derselben Strecke endeten 14 cm auseinander. Ein Zustand, der ein
    // Reset überlebt, tarnt sich als „nicht ganz reproduzierbar".
    const t = this.telemetry;
    t.speed = 0;
    t.forwardSpeed = 0;
    t.slip = 0;
    t.slipFront = 0;
    t.slipRear = 0;
    t.wheelspin = 0;
    t.steerAngle = 0;
    t.compression = this.#spec.derived.staticCompression / this.#spec.suspension.travel;
    t.airborne = false;
    t.lastPenetration = 0;
    t.contacts = 0;
    t.hullDepth = 0;
    t.waterDepth = 0;
    t.skid = 0;
  }

  /**
   * Ein Simulationsschritt.
   *
   * Wird aus `fixedUpdate` gerufen, also mit konstantem `dt` — genau dafür hat
   * `RenderLoop` seit P0 den fixen Schritt. Mit variablem `dt` wäre das Modell
   * nicht deterministisch, und zwei Läufe derselben Eingabe kämen an
   * verschiedenen Stellen an.
   */
  step(dt: number, input: DriveInput, ground: Ground, collision: CollisionWorld | null): void {
    // **Einmal auspacken statt fünfzigmal durchgreifen.** Nicht aus
    // Geschwindigkeitsgründen — `this.#spec.chassis.mass` ist billig —, sondern
    // damit unten dasselbe steht wie vor P18: `chassis.mass` liest sich wie
    // `CHASSIS.mass`, und die Herleitungen in den Kommentaren bleiben lesbar.
    const { chassis, suspension, derived } = this.#spec;

    this.#updateBasis();
    // **Die Normale wird vor den Radproben geholt, seit P20.** Sie definiert die
    // Hangebene, gegen die `#sampleWheels` seine Reichweitenkorrektur bildet —
    // mit der Normalen des *vorigen* Schritts wäre die Korrektur einen Schritt
    // alt, und genau an der Stelle, an der sie gebraucht wird (Übergang in einen
    // Hang), ändert sie sich am schnellsten.
    ground.normal(this.position.x, this.position.z, this.#normal);
    this.#sampleWheels(ground);
    // Das Blech als Stütze — **vor** den Kräften, weil es in die Federkraft
    // eingeht. Siehe `hullSupport`.
    this.#hullSupport = hullSupport(
      this.position.x,
      this.position.y,
      this.position.z,
      this.quaternion,
      derived.hullSamples,
      ground,
      this.#hullPoint,
      this.#hullNormal,
    );

    // **Längs- und Quergeschwindigkeit werden abgeleitet, nicht fortgeschrieben.**
    // Der Zustand ist `velocity` in Weltkoordinaten; siehe den Block „Warum in
    // Weltkoordinaten integriert wird" weiter unten. Diese beiden Zeilen sind die
    // Projektion auf die Fahrzeugachsen, und mehr sind sie nicht.
    this.#vLong = this.velocity.x * this.#forward.x + this.velocity.z * this.#forward.z;
    this.#vLat = this.velocity.x * this.#right.x + this.velocity.z * this.#right.z;

    // ── Wie viel Radlast der Hang noch trägt — P21 ────────────────────────
    //
    // Unverändert aus P21 übernommen, und das ist der Punkt: das Arcade-Modell
    // erbt die Steilhang-Kennlinie, statt sie ein zweites Mal zu erfinden.
    // `halt` geht dort ein, wo früher die Radlast einging — als Faktor auf die
    // Haftung (`PlanarEnv.support`).
    const halt = slopeSupport(this.#normal.y);
    const steep = halt <= 0;
    const surface = ground.surface(this.position.x, this.position.z);
    const waterDepth = ground.waterDepth?.(this.position.x, this.position.z) ?? 0;
    // ── Aufbau und Federweg ───────────────────────────────────────────────
    //
    // Der Federweg wird **längs der Normalen** gemessen: der senkrechte Abstand
    // mal `n_y`. Sonst federte ein Auto auf einer 20°-Rampe um 6 % zu weit ein
    // und wäre dort messbar tiefer eingestellt als in der Ebene.
    //
    // Steilwand: keine Feder. `contactY = y − SPRING_REST` war falsch — die
    // Kompression rechnet `gap · n_y`, und bei n_y = 0,3 bleibt sie positiv
    // (gemessen 150 %, y = 94 m in 4 s). Die Fläche ist eine Wand, nicht ein
    // Boden; `resolveTerrainFollow` schiebt in XZ.
    const contactY = this.#contactHeight();
    const gap = this.position.y - contactY;
    let compression = steep ? 0 : derived.springRest - gap * this.#normal.y;
    this.#airborne = steep || compression <= 0;

    let springForce = 0;
    if (!this.#airborne) {
      const travelOver = compression - suspension.travel;
      // Anschlag: jenseits des Federwegs sitzt der Aufbau auf dem Gummipuffer,
      // und der ist ein Vielfaches härter. Ohne ihn schluckt eine Bordsteinkante
      // den ganzen Federweg und der Aufbau taucht durch den Boden.
      const stiffness =
        travelOver > 0
          ? suspension.stiffness * compression +
            suspension.stiffness * suspension.bumpStopFactor * travelOver
          : suspension.stiffness * compression;
      // **Und ein Deckel darauf — die wichtigste Zeile für das Fahren im
      // Gelände.** Der Anschlag ist eine Feder, deren Kraft mit dem Weg linear
      // wächst. Auf einem Höhenfeld mit 1,5 m Texelabstand findet ein Rad bei
      // Tempo regelmäßig 20…40 cm Stufe, und dann rechnet der Anschlag eine
      // Kraft aus, die den Aufbau senkrecht wegschießt.
      //
      // Der Deckel ist kein Kunstgriff, sondern die fehlende Physik: ein echtes
      // Rad verformt sich an einer Kante und rutscht daran hoch, statt den
      // Aufbau mit 9 g zu beschleunigen. Herleitung des Werts bei
      // `SUSPENSION.maxLoadFactor`.
      springForce = Math.min(
        derived.springCap,
        Math.max(0, stiffness - suspension.damping * this.#vY * this.#normal.y),
      );
    } else {
      compression = 0;
    }

    this.#vY += (springForce / chassis.mass - GRAVITY) * dt;

    // ── Die waagerechte Dynamik — P22 ─────────────────────────────────────
    //
    // Alles, was oben steht, ist Federung und Gelände und stammt unverändert aus
    // P19…P21. Alles, was hier steht, ist neu. Die Grenze zwischen beiden ist
    // absichtlich diese eine Zeile: wer wissen will, was P22 am Fahrverhalten
    // geändert hat, liest `arcadeDynamics.ts` und sonst nichts.
    this.#planarInput.throttle = input.throttle;
    this.#planarInput.brake = input.brake;
    this.#planarInput.steer = input.steer;
    this.#planarInput.handbrake = input.handbrake;
    this.#planarInput.boost = input.boost === true;

    this.#planarEnv.vLong = this.#vLong;
    this.#planarEnv.vLat = this.#vLat;
    this.#planarEnv.surface = surface;
    this.#planarEnv.waterDepth = waterDepth;
    this.#planarEnv.airborne = this.#airborne;
    this.#planarEnv.support = halt;

    const planar = this.#planar.step(dt, this.#planarInput, this.#planarEnv);
    const accelLong = planar.accelLong;
    const accelLat = planar.accelLat;
    this.#steerAngle = planar.steerAngle;

    // Hangabtrieb, waagerechte Komponente der Schwerkraft. Er steht schon in
    // Weltkoordinaten und wird deshalb direkt addiert — eine Projektion auf die
    // Fahrzeugachsen und zurück wäre zweimal derselbe Kosinus. Unverändert aus
    // P14; er ist der Grund, warum ein Hang bergab zieht und bergauf bremst,
    // ohne dass das Fahrmodell etwas davon wissen müsste.
    const slopeX = this.#airborne ? 0 : GRAVITY * this.#normal.y * this.#normal.x;
    const slopeZ = this.#airborne ? 0 : GRAVITY * this.#normal.y * this.#normal.z;

    // ## Warum in Weltkoordinaten integriert wird
    //
    // Die Begründung stammt aus P14 und gilt im Arcade-Modell unverändert weiter
    // — sie ist sogar sein Fundament. Die erste Fassung des Einspurmodells führte
    // `vLong` und `vLat` als **Zustand** fort und trug die Zentripetalterme des
    // rotierenden Bezugssystems nach. Das ist die richtige Gleichung und war
    // trotzdem falsch: mit explizitem Euler ist die Drehung des
    // Geschwindigkeitsvektors durch ihre **Tangente** ersetzt, und die ist um
    // `√(1+(ω·dt)²)` länger. Gemessen wurde daraus aus einem Drift bei 93 km/h
    // nach 2,75 s **1622 km/h**.
    //
    // In Weltkoordinaten gibt es den Term gar nicht — und im Arcade-Modell ist er
    // obendrein die Quelle des Schwimmwinkels: dreht sich die Nase, bleibt der
    // Geschwindigkeitsvektor stehen, und die Querkomponente entsteht von selbst.
    // Der Drift ist damit keine Zeile Code, sondern eine Folge der Wahl des
    // Bezugssystems.
    this.velocity.x += (this.#forward.x * accelLong + this.#right.x * accelLat + slopeX) * dt;
    this.velocity.z += (this.#forward.z * accelLong + this.#right.z * accelLat + slopeZ) * dt;

    // ── Gieren ────────────────────────────────────────────────────────────
    //
    // Die Gierrate ist im Arcade-Modell **gesetzt und nicht integriert**: sie
    // kommt aus `ArcadeDynamics`, die sie ihrer Sollrate nachführt. Das
    // Giermoment aus Reifenkräften, das P14 bis P17 dreimal repariert haben
    // (Vorzeichen der Rechtsachse, Vorzeichen des Moments, Vorzeichen von ω × r),
    // gibt es nicht mehr — und mit ihm die ganze Fehlerklasse.
    this.#yawRate = planar.yawRate;
    this.#yaw += this.#yawRate * dt;
    this.#airPitchRate = planar.pitchRate;

    // ── Lage integrieren ──────────────────────────────────────────────────
    this.#updateBasis();
    this.velocity.y = this.#vY;
    this.position.addScaledVector(this.velocity, dt);

    // Bodenfang. Früher ein reines `y = max(y, terrain)` — auf einem Steilhang
    // die Rampe, die aus einem Clip eine Bergauffahrt macht. Begründung und
    // Messung bei `resolveTerrainFollow`.
    const follow = this.#follow;
    follow.x = this.position.x;
    follow.y = this.position.y;
    follow.z = this.position.z;
    follow.vx = this.velocity.x;
    follow.vy = this.#vY;
    follow.vz = this.velocity.z;
    // **Die Normale wird hier neu geholt, und zwar an der Stelle, an der das
    // Auto nach der Integration steht.** `this.#normal` stammt vom Anfang des
    // Schritts und gehört zu den Kräften, die dort gewirkt haben; die Höhe
    // daneben (`ground.height`) wird längst an der **neuen** Stelle abgefragt.
    // Eine Wand, in die man mit 40 m/s hineinfährt, liegt 67 cm weiter — und mit
    // der alten Normalen schob der Wandzweig in eine Richtung, die zum Hang von
    // vorhin gehörte. Bei 60 Hz ist das der Unterschied zwischen „abgewiesen"
    // und „hineingerutscht".
    const followNormal = ground.normal(this.position.x, this.position.z, this.#followNormal);
    resolveTerrainFollow(
      follow,
      ground.height(this.position.x, this.position.z),
      followNormal.x,
      followNormal.y,
      followNormal.z,
      chassis.wheelRadius * 0.5,
      this.#spec.collision.maxPushPerStep,
      dt,
    );
    this.position.set(follow.x, follow.y, follow.z);
    this.velocity.x = follow.vx;
    this.velocity.y = follow.vy;
    this.velocity.z = follow.vz;
    this.#vY = follow.vy;

    // ── Der Aufbau kann nicht durch die Räder fallen ───────────────────────
    //
    // Eine geometrische Schranke, und die einzige Stelle, an der die Höhe ohne
    // eine Kraft dahinter gesetzt wird. Die vollständige Begründung samt der
    // Messung, die sie erzwungen hat, steht bei `VehicleDerived.bodyFloorGap`;
    // die Kurzfassung: die gedeckelte Federkraft lässt eine harte Landung tiefer
    // einfedern, als die Stützebene noch reicht, und danach gibt es keinen Weg
    // zurück — der Lastwagen stand mit dem Schwerpunkt 84 cm zu tief, dauerhaft.
    //
    // **Gegen den *tiefsten* Radaufstandspunkt, nicht gegen den mittleren.** Ein
    // Mittelwert hübe den Wagen an, sobald ein Rad auf einer Kante steht — genau
    // der Fehler, gegen den `reachableSupport` gebaut wurde. Das Minimum kann das
    // nicht: es hebt nie über die Lage, die der Wagen mit allen Rädern auf dem
    // *niedrigsten* Boden hätte.
    //
    // Nicht am Steilhang: dort gibt es keine Radaufstandspunkte im Sinne dieser
    // Rechnung (der Aufbau ist `#airborne`), und die Radproben liegen über
    // mehrere Meter Höhenunterschied verteilt.
    if (!steep) {
      let lowest = this.#wheelGround[0]!;
      for (let i = 1; i < 4; i++) {
        const h = this.#wheelGround[i]!;
        if (h < lowest) lowest = h;
      }
      const floor = lowest + derived.bodyFloorGap;
      if (this.position.y < floor) {
        this.position.y = floor;
        if (this.#vY < 0) {
          this.#vY = 0;
          this.velocity.y = 0;
        }
      }
    }

    // ── Die Karosserie gegen das Gelände — P20 ────────────────────────────
    //
    // Bis hierher kennt der Schritt das Gelände an fünf Punkten: den vier Rädern
    // und dem Schwerpunkt. Der Aufbau ist 4 bis 7,6 m lang, und was zwischen und
    // **vor** diesen Punkten liegt, gab es für die Physik nicht — die Nase stand
    // auf einem befahrbaren 20°-Hang gemessen 78 cm im Berg. Begründung, Messung
    // und Auflösung stehen im Kopf von `hullTerrain.ts`.
    //
    // **Nach** dem Bodenfang, weil der die grobe Lage setzt (und im tiefen Clip
    // zurückschiebt); **vor** den Hindernissen, damit deren Auflösung das letzte
    // Wort behält — ein Baum gibt nicht nach, ein Hang schon.
    //
    // Gerechnet wird mit der Lage des **vorigen** Schritts (`quaternion` wird
    // erst unten neu gesetzt). Ein Schritt Verzug ist bei 60 Hz 17 ms; dieselbe
    // Näherung wie bei `#lastLongAccel`, und aus demselben Grund: die Lage dieses
    // Schritts steht erst fest, wenn die Höhe feststeht, und die hängt von der
    // Lage ab.
    follow.x = this.position.x;
    follow.y = this.position.y;
    follow.z = this.position.z;
    follow.vx = this.velocity.x;
    follow.vy = this.#vY;
    follow.vz = this.velocity.z;
    // **Und nur, solange die Räder tragen.** Ein frei hängender Wagen wird von
    // seinem Blech nicht gehalten — er kippt, und dieses Modell kann nicht
    // kippen. Ohne diese Bedingung stand der Lastwagen im Prüfstand mit dem Heck
    // auf einer 3-m-Kante und schwebte **2,91 m** über dem Boden, dauerhaft.
    // Vollständige Begründung bei `hasReachableWheel`.
    //
    // Der zweite Parameter ist der Deckel: die voll ausgefederte Lage über der
    // Stützebene. Begründung samt Messung (ein Lastwagen, der 15 s lang in der
    // Luft parkte) bei der Zeile, die ihn anwendet.
    const traegt = hasReachableWheel(
      this.#flatWheel(0),
      this.#flatWheel(1),
      this.#flatWheel(2),
      this.#flatWheel(3),
      this.position.y - chassis.cgHeight,
      derived.supportReach,
    );
    const hull = traegt
      ? resolveHullTerrain(
          follow,
          this.quaternion,
          derived.hullSamples,
          ground,
          this.#spec.collision.maxPushPerStep,
          contactY + chassis.cgHeight / Math.max(0.35, this.#normal.y),
          dt,
          this.#hullPoint,
          this.#hullNormal,
        )
      : NO_HULL_CONTACT;
    this.telemetry.hullDepth = hull.depth;
    if (hull.contacts > 0) {
      this.position.set(follow.x, follow.y, follow.z);
      this.velocity.x = follow.vx;
      this.velocity.y = follow.vy;
      this.velocity.z = follow.vz;
      this.#vY = follow.vy;
    }

    // **Die Fahrerabsicht geht mit in die Kollision.** Der Klemmschutz braucht
    // sie: „steht und will nicht stehen" ist die einzige Beobachtung, die eine
    // Nische von einer Wand unterscheidet, gegen die jemand absichtlich drückt.
    const willFahren = input.throttle > 0.1 || input.brake > 0.1;
    if (collision) this.#resolveCollision(collision, dt, willFahren);

    this.#updateAttitude(dt, accelLat, accelLong);
    this.#wheelSpin += (this.#vLong / chassis.wheelRadius) * dt;
    this.#updateTransform();
    this.#placeWheels();

    // ── Ablesbares ────────────────────────────────────────────────────────
    const t = this.telemetry;
    t.speed = Math.hypot(this.#vLong, this.#vLat);
    t.forwardSpeed = this.#vLong;
    t.slip = planar.slip;
    // **`slipFront`/`slipRear` gibt es weiter, und sie sind jetzt eine
    // Ableitung.** Im Einspurmodell waren sie die *Ursache* der Reifenkräfte; im
    // Arcade-Modell gibt es keine Achsschräglaufwinkel mehr. Sie hier
    // ersatzlos zu streichen hätte drei Verbraucher zugleich getroffen
    // (Debug-Panel, Spuren, Ton), und alle drei fragen in Wahrheit dasselbe:
    // *wie quer steht der Wagen*. Also stehen sie als das da, was sie sind —
    // der Schwimmwinkel, vorn um den Lenkeinschlag versetzt.
    t.slipFront = planar.slip - this.#steerAngle * (this.#vLong < 0 ? -1 : 1);
    t.slipRear = planar.slip;
    t.wheelspin = planar.wheelspin;
    t.steerAngle = this.#steerAngle;
    t.compression = clamp(compression / suspension.travel, 0, 1.5);
    t.airborne = this.#airborne;
    t.surface = surface;
    t.waterDepth = waterDepth;
    t.skid = planar.skid;
    t.drift = planar.drift;
    t.boost = planar.boost;
    t.boosting = planar.boosting;
  }

  /**
   * Eingabe- und Umgebungsobjekt der Dynamik, **einmal angelegt**.
   *
   * Ein frisches Objektpaar je Schritt wären 120 Allokationen je Sekunde, und in
   * einer Schleife, die der Messstand 3600-mal in 50 ms treibt, ist das der
   * Unterschied zwischen „kostet nichts" und „der Sammler läuft mit". Dieselbe
   * Begründung wie bei `#contacts` und `#treeBuf`.
   */
  readonly #planarInput: { -readonly [K in keyof DriveCommand]: DriveCommand[K] } = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    boost: false,
  };

  readonly #planarEnv: { -readonly [K in keyof PlanarEnv]: PlanarEnv[K] } = {
    vLong: 0,
    vLat: 0,
    surface: 'asphalt',
    waterDepth: 0,
    airborne: false,
    support: 1,
  };

  /** Nickrate aus der Luftsteuerung, rad/s — null am Boden. */
  #airPitchRate = 0;
  /** Aufintegrierte Flugauslenkung des Nickwinkels, rad. */
  #airPitch = 0;

  // ── Teilschritte ────────────────────────────────────────────────────────

  /**
   * Fahrzeugachsen aus dem Gierwinkel.
   *
   * **Hier stand ein Vorzeichenfehler, und er hat die Lenkung verkehrt herum
   * gemacht.** `#right` war mit `(cos, 0, −sin)` besetzt — bei Gierwinkel 0 also
   * `+X`, während das Fahrzeug nach `+Z` zeigt. In einem rechtshändigen System
   * mit `up = +Y` ist die Rechtsachse aber `forward × up = (−cos, 0, sin)`, bei
   * Gierwinkel 0 also `−X`. Der alte Wert war die **linke** Seite.
   *
   * Das Modell war in sich stimmig — es rechnete durchgehend in der
   * SAE-Konvention mit y nach links —, nur hieß die Achse falsch, und über die
   * Kette „Lenkeinschlag → Schräglauf → Seitenkraft → Giermoment" kam ein
   * Rechtseinschlag als Linkskurve heraus. Gemessen gegen den Rechtsvektor der
   * Kamera: Taste `D` versetzte das Auto **9,42 m nach links**, Taste `A`
   * 9,77 m nach rechts.
   *
   * Seitdem ist `#right` wirklich rechts, und alles, was daran hängt, bedeutet
   * das, was sein Name sagt: `vLat` ist die Geschwindigkeit nach rechts, ein
   * positiver Schwimmwinkel heißt „die Fahrtrichtung zeigt rechts an der Nase
   * vorbei", ein positiver Lenkwinkel heißt rechts.
   */
  #updateBasis(): void {
    const sin = Math.sin(this.#yaw);
    const cos = Math.cos(this.#yaw);
    this.#forward.set(sin, 0, cos);
    this.#right.set(-cos, 0, sin);
  }

  /**
   * > **Hier stand `#steer` bis P22.** Der Radeinschlag wird jetzt in
   * > `ArcadeDynamics.#steer` geführt, weil er dort gebraucht wird — die
   * > Soll-Gierrate ist eine Funktion von ihm. Ein Einschlag, der hier läuft und
   * > dort gelesen wird, wäre ein Zustand über zwei Dateien.
   */

  /** Radaufstandspunkte und ihre Bodenhöhen. */
  #sampleWheels(ground: Ground): void {
    const halfTrack = this.#spec.chassis.track / 2;
    const offsets: readonly (readonly [number, number])[] = [
      [-halfTrack, this.#spec.derived.cgToFront],
      [halfTrack, this.#spec.derived.cgToFront],
      [-halfTrack, -this.#spec.derived.cgToRear],
      [halfTrack, -this.#spec.derived.cgToRear],
    ];

    // **Ein Rad ist kein Punkt.** Das Höhenfeld hat 1,5 m Texelabstand; auf der
    // Wiese stehen darin Stufen bis 15 cm, im Reisfeldgelände bis 23 cm. Ein
    // punktförmig abgetastetes Rad fällt in jede dieser Kerben und wird von jeder
    // Kante angehoben — die Federung sieht ein Rechtecksignal und antwortet mit
    // Sprüngen.
    //
    // Ein echtes Rad kann das nicht: es hat 31 cm Radius und **überbrückt**, was
    // schmaler ist als es selbst. Nachgebildet wird das als Hüllkurve — die Höhe
    // ist das **Maximum** über drei Proben im Radabstand längs der Fahrtrichtung.
    // Über eine Kuppe rollt das Rad oben, über eine Kerbe spannt es hinweg.
    //
    // Kostet dreimal so viele Höhenabfragen (12 statt 4 je Schritt) und ist damit
    // der teuerste Posten dieser Schleife. Gemessen bleibt der Schritt trotzdem
    // unter 0,03 ms.
    const reach = this.#spec.chassis.wheelRadius;
    for (let i = 0; i < 4; i++) {
      const [side, ahead] = offsets[i]!;
      const x = this.position.x + this.#right.x * side + this.#forward.x * ahead;
      const z = this.position.z + this.#right.z * side + this.#forward.z * ahead;
      let h = Math.max(
        ground.height(x, z),
        ground.height(x + this.#forward.x * reach, z + this.#forward.z * reach),
        ground.height(x - this.#forward.x * reach, z - this.#forward.z * reach),
      );
      // Belagsrütteln — Asphalt und Wasser bleiben glatt. Die Amplitude ist
      // klein gegen den Federweg, groß genug, dass die Karosserie und die
      // Kamera den Untergrund mitmachen. Deterministisch aus der Position.
      const rumbleAmp = rumbleFor(ground.surface(x, z));
      if (rumbleAmp > 0) {
        const pace = Math.min(1, Math.hypot(this.velocity.x, this.velocity.z) / SURFACE_FEEL.rumbleSpeed);
        h += rumbleAmp * pace * surfaceRumble(x, z);
      }
      this.#wheelGround[i] = h;
      // ── Die Hangebene unter dem Rad — P20 ──────────────────────────────
      //
      // **Bis P20 verglich die Federreichweite gegen eine *waagerechte* Ebene**,
      // und das ist auf einem Hang schlicht der falsche Bezug. Ein Wagen auf
      // 20 % Steigung hat seine Vorderräder `halber Radstand · tanθ` über dem
      // Schwerpunktsniveau — beim Coupé 0,44 m gegen `supportReach` = 0,54 m.
      // Ein Stück Lastverlagerung oder ein Schub aus der Karosserie, und die
      // ganze Vorderachse galt als **unerreichbar**: `axleSupport` deckelte die
      // Stützhöhe, die Federkraft fiel auf null, `airborne` wurde wahr, und ein
      // Auto ohne Radlast hat keinen Antrieb.
      //
      // Gemessen an einer 20°-Rampe, Coupé bei Vollgas: Vorderräder 2,36 m,
      // Hinterräder 1,51 m, Schwerpunktsebene 1,78 m — Abweichung vorn 0,58 m
      // gegen 0,54 m Reichweite. Der Wagen hing 344 von 900 Schritten in der
      // Luft und kam über z = 19 m nicht hinaus. Die Datei heißt
      // `supportPlane.ts`, und bis hierher war ihre „Ebene" ein Mittelwert.
      //
      // Der Versatz ist die Höhe der Ebene durch den Schwerpunkt mit der
      // **Geländenormalen** an der Stelle des Rades: `−(n_x·dx + n_z·dz) / n_y`.
      // Auf einem gleichmäßigen Hang ist die Abweichung damit exakt null, an
      // einer Felswand bleibt sie so groß wie zuvor — der Schutz aus P14 gegen
      // das Anheben ist unberührt.
      const dx = this.#right.x * side + this.#forward.x * ahead;
      const dz = this.#right.z * side + this.#forward.z * ahead;
      this.#wheelTilt[i] =
        -(this.#normal.x * dx + this.#normal.z * dz) / Math.max(0.35, this.#normal.y);
    }
  }

  /**
   * Die vier Räder ans **Fahrzeug** hängen — für das Bild.
   *
   * > **Hier stand bis P17 eine Zeile in `#sampleWheels`:**
   * > `this.#wheelPos[i].set(x, h + CHASSIS.wheelRadius, z)`. Die Radmitte lag
   * > damit *immer* einen Radradius über dem Boden — unabhängig davon, wo das
   * > Auto war. Sprang es über eine Kuppe, blieben die vier Räder am Boden
   * > liegen und die Karosserie flog allein davon. Genau so hat es der
   * > Auftraggeber beschrieben („die Räder trennen sich vom Auto"), und es war
   * > kein Fehler der Federung, sondern der Umstand, dass die Räder überhaupt
   * > nie am Aufbau hingen.
   * >
   * > Zweiter, kleinerer Teil desselben Fehlers: die Radposition folgte nur dem
   * > **Gierwinkel**. Nicken und Wanken des Aufbaus ließen sie unberührt, die
   * > Räder standen also auch bei 9° Nickwinkel senkrecht in der Landschaft.
   *
   * Jetzt hängt jedes Rad an seinem Aufnahmepunkt und federt **längs der
   * Hochachse des Aufbaus** — nicht längs der Weltachse. Das ist der Unterschied,
   * der am Hang und beim Bremsnicken sichtbar ist: ein Rad, das senkrecht zur
   * Welt federt, wandert bei geneigtem Aufbau aus dem Radkasten.
   *
   * Der Hub ist beidseitig begrenzt (`WHEEL_MIN_DROP`…`WHEEL_MAX_DROP`). Die
   * obere Grenze verhindert, dass ein Rad bei einem harten Einschlag durch das
   * Blech fährt; die untere ist die, die das Auto in der Luft zusammenhält.
   *
   * Läuft **nach** `#updateAttitude`, weil sie die frische Lage braucht.
   */
  #placeWheels(): void {
    const halfTrack = this.#spec.chassis.track / 2;
    this.#up.set(0, 1, 0).applyQuaternion(this.quaternion);
    // Fast waagerechter Aufbau ist der Normalfall; der Schutz greift erst, wenn
    // das Auto so schief steht, dass die Division unbrauchbar würde.
    const aufrecht = Math.max(0.2, this.#up.y);

    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -halfTrack : halfTrack;
      const ahead = i < 2 ? this.#spec.derived.cgToFront : -this.#spec.derived.cgToRear;
      // Aufnahmepunkt in Weltkoordinaten — über die **volle** Lage, also
      // einschließlich Nicken und Wanken.
      this.#scratch.set(side, 0, ahead).applyQuaternion(this.quaternion).add(this.position);
      // Wie weit müsste das Rad längs −up wandern, bis es den Boden berührt?
      const ziel = this.#wheelGround[i]! + this.#spec.chassis.wheelRadius;
      const hub = clamp((this.#scratch.y - ziel) / aufrecht, this.#spec.derived.wheelMinDrop, this.#spec.derived.wheelMaxDrop);
      this.#wheelPos[i]!.copy(this.#scratch).addScaledVector(this.#up, -hub);
    }
  }

  /**
   * Höhe der Stützebene am Schwerpunkt.
   *
   * Nur Räder in Reichweite der Feder. Mittel aller vier hebt bei einer
   * Spitze drei Räder in die Luft; Mittel der zwei mittleren hebt immer
   * noch an einem Absatz, sobald zwei Räder oben sind. Begründung und
   * Messung (y = 67 m in 3 s) in `reachableSupport`.
   */
  /**
   * Radboden auf die Hangebene durch den Schwerpunkt zurückgerechnet — P20.
   *
   * `#wheelTilt[i]` ist die Höhe, die der Boden unter Rad `i` hätte, wenn er auf
   * dieser Ebene läge. Wer sie abzieht, misst die **Abweichung vom Hang** statt
   * der Abweichung von der Waagerechten — und nur die sagt etwas darüber, ob die
   * Feder das Rad noch erreicht. Begründung samt Messung in `#sampleWheels`.
   */
  #flatWheel(i: number): number {
    return this.#wheelGround[i]! - this.#wheelTilt[i]!;
  }

  /**
   * Wie hoch das Blech den Aufbau trägt — P21.
   *
   * Schwerpunktshöhe, `−Infinity` wenn nichts trägt. Wird zusammen mit den
   * Radproben gebildet, weil sie **vor** den Kräften gebraucht wird: die
   * Stützebene entscheidet über die Federkraft, und die Federkraft ist der Weg,
   * auf dem der Wagen über eine Bodenwelle steigt statt hindurchzupflügen.
   * Begründung samt Messung bei `hullSupport`.
   */
  #hullSupport = -Infinity;

  #contactHeight(): number {
    // **`axleSupport` und nicht `reachableSupport` — seit P19.** Der Unterschied
    // ist genau ein Fall, und der stand am Bergpass im Bild: zwei Räder auf einer
    // Kante, die andere Achse über einem 3-m-Absatz, und der Aufbau schwebte
    // waagerecht darüber. Die Begründung samt Messung steht bei `axleSupport`.
    const raeder = axleSupport(
      this.#flatWheel(0),
      this.#flatWheel(1),
      this.#flatWheel(2),
      this.#flatWheel(3),
      this.position.y - this.#spec.chassis.cgHeight,
      this.#spec.derived.supportReach,
    );
    if (this.#hullSupport === -Infinity) return raeder;
    // **Der Aufbau liegt auf dem Höchsten, was unter ihm ist.** Das Blech ist
    // dabei gleichberechtigt mit den Reifen — nur eben eine Stütze, die weh tut
    // (`BELLY_DRAG`). Die Umrechnung von der Schwerpunktshöhe auf die
    // Stützebene ist dieselbe wie in der Ruhelage: `gap = cgHeight / n_y`.
    const blech = this.#hullSupport - this.#spec.chassis.cgHeight / Math.max(0.35, this.#normal.y);
    return Math.max(raeder, blech);
  }

  /**
   * Nicken und Wanken — Gelände plus Lastverlagerung, gefedert nachgeführt.
   *
   * Vorzeichen, weil sie sich nicht raten lassen: bei `Euler(pitch, yaw, roll,
   * 'YXZ')` dreht three um lokal X, und positives Nicken senkt die Nase
   * (`Rx(φ)·(0,0,1) = (0, −sinφ, cosφ)`). Bremsen (negative Längsbeschleunigung)
   * muss die Nase senken, also `−pitchPerG · a_long`. Positives Wanken hebt die
   * rechte Seite (`Rz(ψ)·(1,0,0) = (cosψ, sinψ, 0)`); in einer Rechtskurve
   * (positive Querbeschleunigung) soll sich der Wagen nach außen legen, also die
   * linke Seite senken — dasselbe Vorzeichen.
   */
  #updateAttitude(dt: number, accelLat: number, accelLong: number): void {
    // ── In der Luft bleibt die Lage stehen — P20 ──────────────────────────
    //
    // `reachableWheel` bildet ein Rad, das die Feder nicht erreicht, auf
    // `expected` ab. Das ist für den Normalfall richtig (ein Rad über einem Loch
    // ist keine Klippe), hat aber eine Nebenwirkung, die niemand gewollt hat:
    // **im Flug sind alle vier unerreichbar**, alle vier werden `expected`, die
    // Differenzen werden null — und der Aufbau dreht sich waagerecht, egal über
    // welchem Hang er gerade fliegt.
    //
    // Solange Nicken und Wanken reine Optik waren, war das ein Schönheitsfehler.
    // Seit die Karosserie gegen das Gelände prüft (`resolveHullTerrain`), ist es
    // ein Fahrfehler: gemessen an einer 20°-Rampe federte das Coupé am Übergang
    // aus, die Nase klappte binnen 0,3 s von −15,9° auf −5,6°, und die so
    // waagerecht gestellte Front grub sich **0,42 m** in den Hang. Danach bremste
    // das schleifende Blech den Wagen auf 0,2 km/h, er rutschte zurück, nahm
    // Anlauf — und wiederholte das bis zum Ende des Laufs. Ein Grenzzyklus, den
    // die Lage selbst erzeugt hat.
    //
    // Die Lage folgt in der Luft deshalb dem **Gelände darunter** statt den
    // Radproben: dieselbe Rechnung, nur aus der Flächennormalen statt aus vier
    // Höhen. Über einem 20°-Hang zielt sie auf −20° und nicht auf null, und
    // damit landet der Wagen flach statt mit der Nase voran.
    //
    // > **Stehenlassen war der erste Versuch und ist gemessen schlechter.** Ein
    // > Auto im Flug behält seine Lage — physikalisch richtig, aber dieses
    // > Modell kennt keine Nickdynamik, und eine beim Absprung eingefrorene Lage
    // > passt zum Hang, auf dem man **landet**, nur zufällig. Gemessen auf 90 s
    // > Zufallsgelände: das Heck des GT stand bei eingefrorener Lage **1,16 m**
    // > unter der Geländeoberfläche, über 6,3 s hinweg — der Wagen sprang mit
    // > der Nase hoch ab und pflügte mit dem Heck durch den halben Hang.
    if (this.#airborne) {
      const n = this.#followNormal;
      const ny = Math.max(0.2, n.y);
      // Gefälle längs der Fahrzeugachsen aus der Normalen: der Höhengradient in
      // Richtung `d` ist `−(n·d) / n_y`. Vorzeichen wie unten aus den Radhöhen —
      // die Rechnung ist dieselbe, nur die Quelle eine andere.
      const luftPitch = Math.atan(
        (n.x * this.#forward.x + n.z * this.#forward.z) / ny,
      );
      const luftRoll = Math.atan(-(n.x * this.#right.x + n.z * this.#right.z) / ny);
      // **Die Luftsteuerung wirkt hier und nirgends sonst — P22.** Sie ist der
      // Unterschied zwischen einem Sprung, den man *nimmt*, und einem, der einem
      // zustößt: mit Gas hebt sich die Nase, mit Bremse senkt sie sich, und man
      // landet flach statt auf dem Stoßfänger. Ohne sie ist jede Rampe ein
      // Glücksspiel, und ein Glücksspiel wiederholt niemand.
      //
      // Sie wird auf die Geländelage **addiert** und ersetzt sie nicht: der
      // Wagen zielt weiter auf den Hang, über dem er fliegt (die Reparatur aus
      // P20), und der Spieler verschiebt dieses Ziel um bis zu
      // `AIR_CONTROL.maxPitch`.
      this.#airPitch = clamp(
        this.#airPitch + this.#airPitchRate * dt,
        -AIR_CONTROL.maxPitch,
        AIR_CONTROL.maxPitch,
      );
      const blend = 1 - Math.exp(-this.#spec.suspension.attitudeRate * dt);
      this.#pitch += (luftPitch + this.#airPitch - this.#pitch) * blend;
      this.#roll += (luftRoll - this.#roll) * blend;
      return;
    }
    // Am Boden läuft die Flugauslenkung aus — sonst stünde der Wagen nach einer
    // Landung dauerhaft schief.
    if (this.#airPitch !== 0) {
      this.#airPitch *= Math.exp(-6 * dt);
      if (Math.abs(this.#airPitch) < 1e-4) this.#airPitch = 0;
    }

    const expected = this.position.y - this.#spec.chassis.cgHeight;
    const reach = this.#spec.derived.supportReach;
    // Geprüft wird gegen die **Hangebene** (`#flatWheel`), zurückgerechnet wird
    // in die Welt (`+ #wheelTilt`). Ein Rad außer Reichweite zählt damit als
    // „liegt auf dem Hang" statt als „liegt waagerecht neben dem Wagen" — auf
    // einer 20°-Rampe ist das ein Unterschied von 0,44 m je Achse. Begründung
    // bei `#sampleWheels`.
    const h0 = reachableWheel(this.#flatWheel(0), expected, reach) + this.#wheelTilt[0]!;
    const h1 = reachableWheel(this.#flatWheel(1), expected, reach) + this.#wheelTilt[1]!;
    const h2 = reachableWheel(this.#flatWheel(2), expected, reach) + this.#wheelTilt[2]!;
    const h3 = reachableWheel(this.#flatWheel(3), expected, reach) + this.#wheelTilt[3]!;
    const groundPitch = -Math.atan2((h0 + h1) / 2 - (h2 + h3) / 2, this.#spec.chassis.wheelbase);
    const groundRoll = Math.atan2((h1 + h3) / 2 - (h0 + h2) / 2, this.#spec.chassis.track);

    const targetPitch = clamp(
      groundPitch - this.#spec.suspension.pitchPerLongitudinalG * accelLong,
      -this.#spec.suspension.maxPitch - Math.abs(groundPitch),
      this.#spec.suspension.maxPitch + Math.abs(groundPitch),
    );
    const targetRoll = clamp(
      groundRoll + this.#spec.suspension.rollPerLateralG * accelLat,
      -this.#spec.suspension.maxRoll - Math.abs(groundRoll),
      this.#spec.suspension.maxRoll + Math.abs(groundRoll),
    );

    const blend = 1 - Math.exp(-this.#spec.suspension.attitudeRate * dt);
    this.#pitch += (targetPitch - this.#pitch) * blend;
    this.#roll += (targetRoll - this.#roll) * blend;
  }

  #updateTransform(): void {
    this.#euler.set(this.#pitch, this.#yaw, this.#roll);
    this.quaternion.setFromEuler(this.#euler);
  }

  /**
   * Karosserie gegen die Hindernisse — seit P19 als **Rechteck**, nicht als vier
   * Punkte.
   *
   * ## Was sich geändert hat, und warum es nötig war
   *
   * Die alte Fassung prüfte an vier Eckpunkten mit je 34 cm Radius. Zwischen
   * Vorder- und Hinterecke liegen beim Coupé 4,2 m — ein Baumstamm passte
   * mühelos hindurch, ohne einen einzigen Prüfpunkt zu berühren. Die Messtabelle
   * dazu steht bei `BodyContact` in `CollisionWorld.ts`; die Kurzfassung: ein
   * Stamm auf der Mittellinie ergab **null Kontakte**, und einer 50 cm daneben
   * warf das Auto zwölf Meter **rückwärts**.
   *
   * Der zweite Fehler saß in der Auflösung. Sie mittelte über die gefundenen
   * Normalen — gedacht gegen die doppelte Verschiebung in einer Innenecke, in
   * Wirklichkeit eine Auflösung, die *jeden* Mehrfachkontakt zu **schwach**
   * löst: zwei Kontakte mit 20 cm Tiefe ergeben gemittelt nur dann 20 cm, wenn
   * beide Normalen gleich sind; stehen sie im rechten Winkel, bleiben 14 cm
   * übrig, und der Rest der Durchdringung bleibt bis zum nächsten Schritt stehen.
   *
   * ## Wie jetzt aufgelöst wird
   *
   * Kontakt für Kontakt, absteigend nach Tiefe, und jeder rechnet an, was die
   * vorherigen schon geschafft haben:
   *
   * ```
   * schon = versatz · n           // wie weit dieser Kontakt bereits gelöst ist
   * fehlt = tiefe − schon
   * wenn fehlt > 0: versatz += n · fehlt
   * ```
   *
   * Das ist die übliche Projektionsauflösung, und sie ist in beiden Grenzfällen
   * richtig: zwei gleichgerichtete Kontakte lösen einmal (kein Doppelweg — das
   * war die Sorge hinter dem Mittelwert), zwei rechtwinklige lösen beide voll.
   *
   * Die Geschwindigkeit läuft durch dieselbe Schleife; sie ist derselbe Vorgang,
   * nur eine Ableitung höher.
   */
  #resolveCollision(collision: CollisionWorld, dt: number, willFahren: boolean): void {
    const spec = this.#spec;
    // Das Blech plus einen Zuschlag. Der Zuschlag ist klein und ersetzt den
    // alten Eckradius: der war 34 cm groß, weil er an vier *Punkten* eine ganze
    // Karosserie darstellen musste. Ein Rechteck braucht das nicht — es **ist**
    // die Karosserie.
    const hl = spec.chassis.bodyLength * 0.5 + spec.collision.skin;
    const hw = spec.chassis.bodyWidth * 0.5 + spec.collision.skin;
    // Das Höhenband der Karosserie in Weltkoordinaten. `band` ist über der
    // Radaufstandsebene gemessen, der Schwerpunkt liegt `cgHeight` darüber.
    const base = this.position.y - spec.chassis.cgHeight;
    const bandLow = base + spec.collision.band[0];
    const bandHigh = base + spec.collision.band[1];

    const count = collision.queryBody(
      this.position.x,
      this.position.z,
      this.#forward.x,
      this.#forward.z,
      hl,
      hw,
      bandLow,
      bandHigh,
      this.#contacts,
    );

    this.telemetry.contacts = count;
    this.telemetry.lastPenetration = count > 0 ? this.#contacts[0]!.depth : 0;
    this.#brokeThisStep = 0;

    // **Wie lange ist der letzte Kontakt her.** Ohne dieses Gedächtnis ist der
    // Klemmschutz wirkungslos, und zwar rechnerisch: der eingeklemmte Wagen am
    // Tempelaufgang hatte in **einem von zehn** Schritten einen Kontakt. Der
    // Zähler wuchs also mit 0,1·dt und klang mit 0,9·2·dt ab — er lief netto
    // rückwärts und erreichte die Schwelle nie. Gemessen: 0,14 m in fünf
    // Sekunden Vollgas, mit Klemmschutz „an".
    if (count > 0) this.#contactAge = 0;
    else this.#contactAge += dt;
    const kuerzlichKontakt = this.#contactAge < WEDGE_CONTACT_MEMORY;

    if (count === 0) {
      // **Nicht zurücksetzen, sondern abklingen lassen — und das ist der
      // Unterschied zwischen einem Klemmschutz, der greift, und einem, der es
      // nicht tut.**
      //
      // Der erste Versuch setzte hier auf null. Gemessen am Tempelaufgang hatte
      // der eingeklemmte Wagen aber nur in **jedem zehnten Schritt** einen
      // Kontakt: die Auflösung schiebt ihn frei, im nächsten Schritt drückt der
      // Antrieb ihn zurück. Jeder freie Schritt löschte den Zähler, und die
      // halbe Sekunde kam nie zusammen — der Wagen stand vier Sekunden lang
      // 33 cm weit rückwärts, bei Vollbremsung und Volleinschlag.
      //
      // Abklingen statt löschen: doppelt so schnell, wie er aufbaut. Wer wirklich
      // frei ist, hat den Zähler nach einer Viertelsekunde bei null; wer alle
      // paar Schritte anstößt, behält ihn.
      this.#updateWedge(dt, kuerzlichKontakt && willFahren);
      if (this.#wedgeTime > WEDGE_DELAY && this.#wedgeOpposed) this.#applyWedgeEscape(dt);
      return;
    }

    let pushX = 0;
    let pushZ = 0;
    let torque = 0;
    let resolved = 0;
    // Summe der Kontaktnormalen — sie sagt, ob der Wagen **gegen** etwas drückt
    // oder **zwischen** zwei Dingen steckt. Siehe `#wedgeTime` unten.
    let normalSumX = 0;
    let normalSumZ = 0;

    for (let i = 0; i < count; i++) {
      const c = this.#contacts[i]!;
      const rx = c.px - this.position.x;
      const rz = c.pz - this.position.z;
      // Geschwindigkeit **am Berührpunkt**, inklusive Drehanteil ω × r.
      // `ŷ × (r_x, 0, r_z) = (r_z, 0, −r_x)` — dieselbe Vorzeichenkette wie beim
      // Schräglauf, und dort saß in P14 derselbe Fehler.
      const contactVX = this.velocity.x + this.#yawRate * rz;
      const contactVZ = this.velocity.z - this.#yawRate * rx;
      const approach = contactVX * c.nx + contactVZ * c.nz;

      if (c.breakable && c.id >= 0 && this.#brokeThisStep < MAX_BREAKS_PER_STEP) {
        const tree = c.source === HIT_TREE;
        if (
          shouldBreak(
            spec.chassis.mass,
            approach,
            tree ? TREE_BREAK_SPEED : RAIL_BREAK_SPEED,
            tree ? TREE_BREAK_ENERGY : RAIL_BREAK_ENERGY,
          )
        ) {
          collision.disableHit(c.id, c.source);
          this.#brokeThisStep++;
          this.#breaks.push({
            kind: tree ? 'tree' : 'rail',
            id: c.id,
            x: c.px,
            y: this.position.y,
            z: c.pz,
            vx: this.velocity.x,
            vz: this.velocity.z,
          });
          // Durchbrechen, nicht abprallen: 45 % der Normalkomponente weg, der
          // Rest trägt durch das Loch. Forza-Arcade, nicht ein zweiter Anschlag
          // an Luft.
          const into = this.velocity.x * c.nx + this.velocity.z * c.nz;
          if (into < 0) {
            this.velocity.x -= c.nx * into * 0.45;
            this.velocity.z -= c.nz * into * 0.45;
          }
          continue;
        }
      }

      normalSumX += c.nx;
      normalSumZ += c.nz;

      // ── 1. Herausschieben, mit Anrechnung des schon Erreichten ──────────
      const already = pushX * c.nx + pushZ * c.nz;
      const missing = c.depth - already;
      if (missing > 0) {
        pushX += c.nx * missing;
        pushZ += c.nz * missing;
      }

      // ── 2. Geschwindigkeit senkrecht zur Fläche ─────────────────────────
      if (approach < 0) {
        const change = -approach * (1 + spec.collision.restitution);
        this.velocity.x += c.nx * change;
        this.velocity.z += c.nz * change;
        // ── 3. Giermoment aus dem Versatz zum Schwerpunkt ────────────────
        // `(r × F)_y = r_z F_x − r_x F_z`, mit `F ∥ n`.
        const impulse = change * spec.chassis.mass;
        torque += (rz * c.nx - rx * c.nz) * impulse;

        // ── Schrammen, und zwar als **Coulomb-Reibung** ──────────────────
        //
        // > **Bis P19 war das ein fester Anteil je Schritt** (`v_t *= 1 −
        // > 0,12`). Solange die Karosserie nur an vier Punkten prüfte, war das
        // > harmlos: ein Streifschuss ergab zwei, drei Kontakte, und der
        // > Kommentar an `wallFriction` rechnete mit „rund ein Viertel des
        // > Tempos über 20 m".
        // >
        // > Mit einem Rechteck liegt das Blech **jeden Schritt** an, und dann
        // > ist derselbe Faktor 0,88⁶⁰ je Sekunde — also 0,0004. Gemessen im
        // > Prüfstand: der Wagen klebte mit 10 km/h an der Planke fest, bei
        // > Vollgas. Aus einer Schramme wurde eine Bremse.
        //
        // Richtig ist die Reibung am **Normalimpuls**: `|J_t| ≤ μ · |J_n|`. Sie
        // ist selbstbegrenzend — beim ersten Anschlag ist `J_n` groß und kostet
        // Tempo, danach ist die Normalgeschwindigkeit weg, `J_n` klein, und das
        // Auto rutscht die Planke entlang statt an ihr zu kleben. Genau das tut
        // ein echtes Blech an einer Leitplanke, und es ist zugleich der Grund,
        // warum ein Frontalanschlag mehr kostet als ein flacher.
        const alongN = this.velocity.x * c.nx + this.velocity.z * c.nz;
        const tx = this.velocity.x - c.nx * alongN;
        const tz = this.velocity.z - c.nz * alongN;
        const tSpeed = Math.hypot(tx, tz);
        if (tSpeed > 1e-4) {
          const loss = Math.min(tSpeed, spec.collision.wallFriction * change);
          this.velocity.x -= (tx / tSpeed) * loss;
          this.velocity.z -= (tz / tSpeed) * loss;
        }
      }
      resolved++;
    }

    if (resolved === 0) return;

    // ── Der Deckel auf den Weg je Schritt ────────────────────────────────
    //
    // Ohne ihn schleudert ein Wagen, der mit 70 m/s in eine Hausecke fährt, in
    // einem Schritt durch die halbe Stadt.
    let pushLength = Math.hypot(pushX, pushZ);
    if (pushLength > spec.collision.maxPushPerStep) {
      const scale = spec.collision.maxPushPerStep / pushLength;
      pushX *= scale;
      pushZ *= scale;
      pushLength = spec.collision.maxPushPerStep;
    }

    // ── Der Klemmzähler ──────────────────────────────────────────────────
    //
    // **Ein Auto, das steht und trotzdem in etwas steckt, kommt allein nicht
    // wieder heraus.** Das ist der Rest des Fehlerbilds „man verbuggt sich":
    // die Auflösung schiebt, das Gas drückt zurück, und beides hält sich die
    // Waage. Physikalisch ist der Zustand echt (ein Auto *kann* sich festfahren)
    // — spielbar ist er nicht.
    //
    // Deshalb ein zweiter Weg heraus, und zwar ein **zeitabhängiger**: wer eine
    // halbe Sekunde in einem Hindernis steckt, bekommt zusätzlich zum
    // Herausschieben eine Trenngeschwindigkeit, die mit der Klemmdauer wächst
    // und bei `WEDGE_ESCAPE_MAX` aufhört. Das ist kein Katapult (der alte Fehler
    // warf zwölf Meter weit) und keine Teleportation, sondern die
    // Geschwindigkeit, mit der man einen festgefahrenen Wagen von Hand
    // herausschiebt.
    //
    // > **Die Bedingung ist der heikle Teil, und der erste Versuch war falsch.**
    // > Er lautete „langsam **und** irgendein Kontakt" — und das trifft auch den
    // > Fall, der gar kein Fehler ist: mit Vollgas gegen einen Baum drücken.
    // > Gemessen im Prüfstand hüpfte der Wagen dort im Sekundentakt zurück, weil
    // > die Trennhilfe gegen den Antrieb arbeitete.
    // >
    // > Der Unterschied zwischen beiden Lagen ist **nicht** das Tempo, sondern
    // > die **Restdurchdringung**: gegen einen Baum wird jede Überdeckung in
    // > diesem Schritt vollständig aufgelöst (`rest ≈ 0`), im geklemmten Fall
    // > bleibt sie stehen — weil der Deckel greift oder weil zwei Kontakte
    // > gegeneinander schieben. Nur dann ist die Trennhilfe fällig.
    let rest = 0;
    for (let i = 0; i < count; i++) {
      const c = this.#contacts[i]!;
      const missing = c.depth - (pushX * c.nx + pushZ * c.nz);
      if (missing > rest) rest = missing;
    }

    // **Eingeklemmt ist etwas anderes als angedrückt**, und die Zahl, die beide
    // trennt, ist die Summe der Kontaktnormalen. Bei *einem* Kontakt (gegen eine
    // Wand drücken) hat sie die Länge 1; bei zwei gegenüberliegenden hebt sie
    // sich auf und wird 0. `squeeze = 1 − |Σn| / n` ist damit 0 beim Andrücken
    // und 1 im Schraubstock.
    //
    // > **Das war der Fehler des ersten Versuchs, und er stand im laufenden Bild.**
    // > Die Bedingung hieß nur „Restdurchdringung über 2 cm" — und im echten
    // > Klemmfall gibt es **keine** Restdurchdringung: das Auto steckte am
    // > Tempelaufgang zwischen zwei Props mit 4,3 m Abstand, beide Schübe hoben
    // > sich exakt auf, `lastPenetration` war 0,0006 m. Gemessen: bei Vollgas
    // > **0,09 m in drei Sekunden**, rückwärts **0,19 m**, mit Volleinschlag
    // > 0,09 m. Die Position stand über zwölf Schritte auf die letzte Stelle
    // > still. Genau das meldet der Auftraggeber als „man verbuggt sich".
    // **Über ein kurzes Gedächtnis, nicht über einen Schritt.** Der Klemmfall der
    // echten Karte hatte in *jedem* Schritt nur **einen** Kontakt — vorn, dann
    // hinten, dann wieder vorn. Eine Momentaufnahme sieht dort `squeeze = 0` und
    // hält den Schraubstock für ein Andrücken. Erst der gleitende Mittelwert über
    // rund 200 ms trennt beides: gegen eine Wand zeigt die Normale immer in
    // dieselbe Richtung und der Mittelwert behält die Länge 1; zwischen zwei
    // Hindernissen wechselt sie das Vorzeichen und er läuft gegen 0.
    const invLen = 1 / Math.max(1e-6, Math.hypot(normalSumX, normalSumZ));
    const nx = normalSumX * invLen;
    const nz = normalSumZ * invLen;
    if (this.#wedgeTime <= 0) {
      // Erster Kontakt nach freier Fahrt: mit der aktuellen Normalen anfangen,
      // sonst zählte die Einschwingzeit des Mittelwerts selbst als Klemmen.
      this.#wedgeNormX = nx;
      this.#wedgeNormZ = nz;
    } else {
      const k = 1 - Math.exp(-dt / WEDGE_MEMORY);
      this.#wedgeNormX += (nx - this.#wedgeNormX) * k;
      this.#wedgeNormZ += (nz - this.#wedgeNormZ) * k;
    }
    // ── Wann gilt der Wagen als geklemmt ────────────────────────────────
    //
    // Drei Kennzeichen, und **jedes für sich** genügt. Sie decken drei Lagen ab,
    // die alle gleich aussehen (Auto steht, Kontakt da) und sich in der Geometrie
    // nicht auf einen Nenner bringen lassen:
    //
    //  1. **Restdurchdringung** — der Deckel `maxPushPerStep` kommt nicht nach,
    //     oder zwei Kontakte schieben gegeneinander.
    //  2. **Schraubstock** — die Kontaktnormalen heben sich über ein kurzes
    //     Gedächtnis auf (zwei Hindernisse gleichzeitig, links und rechts).
    //  3. **Die Nische** — und die ist der Fall, an dem die ersten beiden
    //     Fassungen gescheitert sind. Am Tempelaufgang steht vorn ein Prop und
    //     hinten eins, aber **nie beide gleichzeitig in Kontakt**: mit Gas
    //     berührt der Wagen nur das vordere, mit Rückwärtsgang nur das hintere.
    //     Die Normale ist in jeder Phase konstant, `squeeze` bleibt bei 0, die
    //     Durchdringung bei 0,0006 m — und trotzdem kommt der Wagen nicht weg.
    //     Gemessen: Vollgas 0,06 m in 3 s, rückwärts mit Volleinschlag 0,33 m in
    //     4 s. Mit beiden Props abgemeldet: **16,17 m**.
    //
    // Für den dritten Fall hilft keine Geometrie, sondern nur die Beobachtung,
    // die auch der Fahrer macht: *er will fahren und kommt nicht weg.* Deshalb
    // geht `willFahren` in diese Bedingung ein — ohne sie träfe sie auch den
    // Wagen, der einfach nur geparkt an einer Mauer steht.
    const squeeze = 1 - Math.hypot(this.#wedgeNormX, this.#wedgeNormZ);
    const geklemmt =
      rest > WEDGE_RESIDUAL || squeeze > WEDGE_SQUEEZE || (willFahren && resolved > 0);
    this.#updateWedge(dt, geklemmt);
    // Die Seite wird **einmal** je Episode gewählt und dann gehalten.
    if (this.#wedgeSide === 0 && this.#wedgeTime > 0) {
      const c = this.#contacts[0]!;
      this.#wedgeSide = -c.nz * this.#right.x + c.nx * this.#right.z >= 0 ? 1 : -1;
      this.#wedgeFirstNX = c.nx;
      this.#wedgeFirstNZ = c.nz;
    }

    // **Erst wenn der Wagen aus zwei entgegengesetzten Richtungen blockiert
    // wurde, ist er gefangen.** Ohne diese Bedingung feuert die Trennhilfe auch
    // gegen einen einzelnen Baum, in den jemand mit Vollgas drückt — gemessen im
    // Prüfstand: der Wagen schob sich nach 1,5 s an einem Stamm vorbei, den er
    // hätte respektieren müssen. Wer nur eine Richtung blockiert hat, kommt in
    // die andere weg; das ist keine Klemme, sondern eine Wand.
    if (nx * this.#wedgeFirstNX + nz * this.#wedgeFirstNZ < WEDGE_OPPOSED_DOT) {
      this.#wedgeOpposed = true;
    }
    // Zwei gleichzeitige Gegenkontakte oder eine stehende Restdurchdringung sind
    // ebenso eindeutig — dort braucht es keinen Richtungswechsel.
    if (rest > WEDGE_RESIDUAL || squeeze > WEDGE_SQUEEZE) this.#wedgeOpposed = true;

    // Die Ausweichrichtung wird **hier** bestimmt und gemerkt, weil sie Kontakte
    // braucht — angewandt wird sie auch in Schritten ohne welche (siehe oben).
    if (squeeze > WEDGE_SQUEEZE) {
      // **Quer heraus, nicht längs.** Im Schraubstock zeigt der Schub nirgends
      // hin (er ist ja aufgehoben) — der freie Weg liegt **senkrecht** zur
      // Klemmachse. Die gibt der tiefste Kontakt vor; welche der beiden
      // Senkrechten es wird, entscheidet die Fahrzeugquerachse, damit der Wagen
      // dorthin ausweicht, wohin er ohnehin steht, statt zufällig zu springen.
      const c = this.#contacts[0]!;
      const seite = this.#wedgeSide || 1;
      this.#wedgeEscX = -c.nz * seite;
      this.#wedgeEscZ = c.nx * seite;
    } else if (pushLength > 1e-6) {
      // **Heraus **und** zur Seite.** Rein senkrecht aus dem Hindernis heraus
      // löst die Nische nicht: der Wagen weicht dem vorderen Prop nach hinten
      // aus, stößt ans hintere, weicht wieder vor — er pendelt und bleibt drin.
      // Der Weg aus einer Nische führt seitlich hinaus, und deshalb bekommt die
      // Trennrichtung eine Querkomponente in derselben Größenordnung.
      const seite = this.#wedgeSide || 1;
      const ex = pushX / pushLength - (pushZ / pushLength) * WEDGE_SIDESTEP * seite;
      const ez = pushZ / pushLength + (pushX / pushLength) * WEDGE_SIDESTEP * seite;
      const el = Math.hypot(ex, ez) || 1;
      this.#wedgeEscX = ex / el;
      this.#wedgeEscZ = ez / el;
    }

    if (this.#wedgeTime > WEDGE_DELAY && this.#wedgeOpposed) this.#applyWedgeEscape(dt);

    this.position.x += pushX;
    this.position.z += pushZ;

    this.#yawRate += (torque * spec.collision.yawTransfer) / spec.chassis.yawInertia;
    // Ein Frontalanschlag mit 70 m/s ergibt sonst eine Drehung, bei der das Bild
    // nicht mehr lesbar ist.
    this.#yawRate = clamp(this.#yawRate, -spec.limits.maxYawRate, spec.limits.maxYawRate);

    // **Kein Zurückschreiben nach `#vLong` / `#vLat` nötig.** Der Zustand ist
    // `velocity`; der nächste Schritt projiziert sie ohnehin neu.
  }

  /**
   * Den Klemmzähler fortschreiben.
   *
   * ## Warum das über den **Weg** geht und nicht über das Tempo
   *
   * Der erste Versuch setzte den Zähler zurück, sobald der Wagen schneller als
   * `WEDGE_SPEED` war — und hat sich damit selbst ausgeschaltet: die Trennhilfe
   * gibt genau so viel Geschwindigkeit, dass die Schwelle überschritten wird,
   * der Zähler fällt auf null, die Hilfe hört auf, der Wagen bleibt stehen.
   * Gemessen am Tempelaufgang: **0,15 m in fünf Sekunden**, dabei zeitweise
   * 2,3 km/h. Er *bewegte* sich, er kam nur nicht weg.
   *
   * Die Frage ist nicht „fährt er gerade", sondern „**ist er von der Stelle
   * gekommen**". Deshalb merkt sich eine Episode ihren Anfangspunkt und endet,
   * wenn der Wagen `WEDGE_FREE_DISTANCE` davon entfernt ist.
   *
   * Das erledigt zugleich den Fall, der eine reine Zeitbedingung unbrauchbar
   * machen würde: ein Wagen, der eine Leitplanke entlangschrammt, hat
   * dauerhaft Kontakt und will fahren — er legt dabei aber Meter zurück und
   * verlässt die Episode nach dem ersten.
   */
  #updateWedge(dt: number, geklemmt: boolean): void {
    if (this.#wedgeTime <= 0) {
      if (!geklemmt) return;
      this.#wedgeStartX = this.position.x;
      this.#wedgeStartZ = this.position.z;
      this.#wedgeTime = dt;
      return;
    }

    const weg = Math.hypot(
      this.position.x - this.#wedgeStartX,
      this.position.z - this.#wedgeStartZ,
    );
    if (weg > WEDGE_FREE_DISTANCE) {
      this.#wedgeTime = 0;
      this.#wedgeSide = 0;
      this.#wedgeOpposed = false;
      return;
    }

    if (geklemmt) this.#wedgeTime += dt;
    else {
      this.#wedgeTime = Math.max(0, this.#wedgeTime - dt * WEDGE_RELEASE);
      if (this.#wedgeTime <= 0) {
        this.#wedgeSide = 0;
        this.#wedgeOpposed = false;
      }
    }
  }

  /**
   * Die Trenngeschwindigkeit aufbringen — ausdrücklich **keine** Physik.
   *
   * Getrennt von `#resolveCollision`, weil sie auch in Schritten **ohne**
   * Kontakt gebraucht wird: ein eingeklemmter Wagen berührt sein Hindernis nicht
   * in jedem Schritt (die Auflösung schiebt ihn frei, der Antrieb drückt ihn
   * zurück), und ein Schutz, der nur bei Kontakt wirkt, wirkt dort nie.
   */
  #applyWedgeEscape(dt: number): void {
    const escape = Math.min(
      WEDGE_ESCAPE_MAX,
      (this.#wedgeTime - WEDGE_DELAY) * WEDGE_ESCAPE_RATE,
    );
    this.velocity.x += this.#wedgeEscX * escape * Math.min(1, dt * 60);
    this.velocity.z += this.#wedgeEscZ * escape * Math.min(1, dt * 60);
  }
}

/**
 * > **Hier standen bis P22 die Reifenkennlinie und ihre drei Helfer**
 * > (`tireLateral`, `gripCurve`, `surfaceGrip`) — rund 120 Zeilen, dazu die
 * > ausführlichste Herleitung des ganzen Projekts. Sie sind mit dem
 * > Einspurmodell entfallen; das Arcade-Modell hat keine Schräglaufwinkel mehr,
 * > an denen sie ansetzen könnten.
 * >
 * > **Gelöscht ist die Begründung nicht.** Sie steht vollständig in
 * > `vehicle.config.ts` bei `TIRE.plateauWidth`, `TIRE.tailGrip` und
 * > `TIRE.lateralReserve`, und sie ist dort mehr wert als der Code: zwei der
 * > drei teuersten Fehler dieses Projekts (`tailGrip` als Betragsklemme,
 * > `minSpinGrip` als Faktor auf das Ergebnis) sind Fehler dieser Funktionen
 * > gewesen, und ihre Lehre — *ein richtiger Wert an der falschen Stelle in
 * > derselben Funktion, zweimal* — gilt für jede Kennlinie, die noch kommt.
 * >
 * > `TireSpec` bleibt in `vehicles.config.ts` stehen, obwohl das Fahrmodell sie
 * > nicht mehr liest. Sie ist die vollständige Beschreibung dessen, was ein
 * > Fahrzeug an Reifen hätte, und der Prüfstand `tools/bench/fleet.mts` nennt
 * > ihre Zahlen weiter im Vergleich. Eine Spec zu löschen, weil ein Modell sie
 * > gerade nicht braucht, hieße die Messreihen von P14 bis P21 wegzuwerfen.
 */

function rumbleFor(surface: Surface): number {
  if (surface === 'kies') return SURFACE_FEEL.rumbleGravel;
  if (surface === 'gelaende') return SURFACE_FEEL.rumbleTerrain;
  return 0;
}

/** Zwei Oktaven, −1…1, ortsfest. */
function surfaceRumble(x: number, z: number): number {
  return hash2(x * 4.1, z * 4.3) * 1.4 + hash2(x * 11.0, z * 9.7) * 0.6 - 1;
}

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
