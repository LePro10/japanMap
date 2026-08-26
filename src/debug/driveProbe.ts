import { CHASSIS, TIRE, GRAVITY, STEERING } from '@/config/vehicle.config';
import { ROAD_MESH, ROAD_TYPES } from '@/config/roads.config';
import type { DriveSystem } from '@/game/DriveSystem';
import type { DriveInput } from '@/game/Vehicle';
import type { RoadNetwork } from '@/world/roads/RoadNetwork';
import type { TerrainSampler } from '@/world/TerrainSampler';

/**
 * Der Messstand des Fahrmodus — PLAN.md P14, Abnahme von 9.1 und 9.2.
 *
 * Er existiert, weil zwei der Abnahmezeilen dieser Phase Zahlen verlangen, die
 * man beim Fahren nicht ablesen kann:
 *
 *  - *„Ein Fahrzeug steht auf allen Strecken auf dem Boden. Median der
 *    Höhendifferenz zum Sampler unter 5 cm, größter Ausreißer benannt."*
 *  - *„Der Bergpass ist befahrbar, ohne dass das Fahrzeug die Leitplanke
 *    durchdringt — 60 s, **gemessen, nicht gefahren-und-für-gut-befunden**."*
 *
 * Beides läuft **ohne zu rendern**: die Physik wird in einer eigenen Schleife
 * getrieben, 3600 Schritte für eine Minute Fahrt. Das ist nicht nur schneller,
 * es ist auch die einzige Art, die Zahl reproduzierbar zu bekommen — eine Fahrt
 * mit der Hand ist bei jedem Lauf eine andere.
 *
 * > **Was dieser Prüfstand nicht kann: aussagen, ob es sich gut anfühlt.** Er
 * > fährt mit einem Regler, nicht mit einer Absicht. Er beantwortet „hält die
 * > Kollision", „liegt das Auto auf der Straße", „was kostet ein Schritt" — und
 * > *nicht* „ist der Drift kontrollierbar". Diese Frage braucht eine Hand am
 * > Keyboard, und die Antwort darauf gehört in die Doku als das, was sie ist:
 * > ein Urteil.
 */

export interface HeightDeviation {
  readonly roadId: string;
  readonly samples: number;
  /** Differenz `sampler − Mittellinie` in Metern. */
  readonly medianCm: number;
  readonly p95Cm: number;
  readonly maxCm: number;
  /** Ort des größten Ausreißers. */
  readonly worstAt: { x: number; z: number };
}

/**
 * Wie das **Auto** auf der Strecke steht — die Gegenprobe zu `HeightDeviation`.
 *
 * Der Unterschied ist der ganze Punkt: `HeightDeviation` misst zwei Datenquellen
 * gegeneinander (Sampler gegen `roads.json`), diese Messung misst das **Ergebnis**
 * — die Höhe, auf der das Fahrzeug tatsächlich zu stehen kommt, gegen die
 * Oberkante des Fahrbahn-Meshes. Genau diese Verwechslung steht in CLAUDE.md als
 * erster Eintrag unter „Was schon schiefgegangen ist": *„Sie berichtete ihre
 * Sollwerte statt ihr Ergebnis."*
 *
 * Positiv heißt: die Räder stehen **über** dem Asphalt.
 */
export interface StandingHeight {
  readonly roadId: string;
  readonly samples: number;
  readonly medianCm: number;
  readonly maxCm: number;
  readonly worstAt: { x: number; z: number };
}

export interface DriveRun {
  readonly roadId: string;
  readonly steps: number;
  readonly seconds: number;
  /** Zurückgelegte Strecke in Metern. */
  readonly distance: number;
  readonly meanKmh: number;
  readonly maxKmh: number;
  /** Tiefste aufgelöste Durchdringung eines Hindernisses, in Zentimetern. */
  readonly maxPenetrationCm: number;
  /** Schritte mit mindestens einem Kollisionskontakt. */
  readonly contactSteps: number;
  /** Größter Abstand zur Mittellinie in Metern und wo. */
  readonly maxOffCenter: number;
  readonly maxOffCenterAt: { x: number; z: number };
  /** Schritte, in denen das Auto die Fahrbahn samt Bankett verlassen hat. */
  readonly offRoadSteps: number;
  /** Größter Schwimmwinkel in Grad — sagt, ob überhaupt gedriftet wurde. */
  readonly maxSlipDeg: number;
  /** CPU je Simulationsschritt in Millisekunden. */
  readonly msPerStep: number;
  /** Endzustand: steht das Auto noch auf der Strecke? */
  readonly finished: boolean;
  /**
   * Hat der Lauf das **Ende** einer offenen Strecke erreicht?
   *
   * Dann ist er kürzer als `seconds`, und das ist kein Fehler. Ohne diese
   * Unterscheidung meldete der Prüfstand `dorf` (692 m) nach 846 gefahrenen Metern
   * als „abgekommen" — das Auto war schlicht am Ende der Straße angekommen und
   * fuhr geradeaus weiter.
   */
  readonly reachedEnd: boolean;
}

export interface DriveProbeDeps {
  readonly drive: DriveSystem;
  readonly sampler: TerrainSampler;
  readonly network: RoadNetwork;
}

export interface DriveProbeOptions {
  /** Strecken, die abgefahren werden. Ohne Angabe: alle. */
  readonly roads?: readonly string[];
  /** Fahrdauer je Strecke in Sekunden. */
  readonly seconds?: number;
  /**
   * Anteil der Kurvengrenzgeschwindigkeit, den der Regler wagt.
   *
   * Vorgabe 0,7. **Ein Prüfstand fährt nicht am Limit**, und er soll es auch
   * nicht: gemessen werden hier Kollision, Spurlage und Rechenaufwand, nicht die
   * Kunst des Reglers. Wer die Leitplanken prüfen will, dreht auf 1,0 — dann
   * fliegt er planmäßig heraus, und genau dort steht die Planke.
   */
  readonly pace?: number;
  /**
   * Hartes Tempolimit in m/s, zusätzlich zum Krümmungsprofil.
   *
   * Wofür: die Abnahmezeile „der Bergpass ist befahrbar" fragt nach der
   * **Strecke**, nicht nach der Kunst des Reglers. Mit einem festen, gemäßigten
   * Tempo fährt der Prüfstand die Strecke ab, ohne an jeder Kehre um die
   * Haftgrenze zu ringen — und misst damit das, was gefragt ist: bleibt das Auto
   * auf der Fahrbahn, hält die Leitplanke, steckt nichts in der Geometrie.
   *
   * Ohne Angabe: kein Limit, dann entscheidet allein `pace`.
   */
  readonly speedCap?: number;
}

export interface DriveProbeReport {
  readonly heights: readonly HeightDeviation[];
  readonly standing: readonly StandingHeight[];
  readonly runs: readonly DriveRun[];
  readonly colliders: number;
  readonly notes: readonly string[];
}

const FIXED_DT = 1 / 60;

/**
 * Der Reibwert, mit dem der **Regler** rechnet.
 *
 * Nicht `TIRE.gripAsphalt`: das ist der Wert der *Vorderachse*. Ausbrechen tut die
 * **Hinterachse**, und deren Beiwert ist um `TIRE.rearGripFactor` kleiner — das ist
 * der ganze Grund, warum dieses Auto übersteuert und nicht schiebt. Ein Regler,
 * der mit dem vorderen Wert plant, plant an der falschen Achse.
 *
 * Gemessen mit dem vorderen Wert und `pace` 0,8: alle vier geprüften Strecken
 * „ABGEKOMMEN". Der Unterschied sind 6 % Kurvengeschwindigkeit — genug, um von
 * „am Limit" nach „darüber" zu kippen.
 */
const CONTROL_GRIP = TIRE.gripAsphalt * TIRE.rearGripFactor;

/**
 * Differenz zwischen `TerrainSampler` und der Mittellinie aus `roads.json`.
 *
 * **Die Messung aus PLAN.md 9.1.** Sie prüft die Annahme, auf der der ganze
 * Fahrmodus steht: dass der Sampler dieselbe Höhe liefert, auf die der Baker die
 * Straße eingeschnitten hat. Läuft das auseinander, fährt das Auto sichtbar über
 * oder unter der Fahrbahn — und zwar überall gleichmäßig, was der am schwersten
 * zu bemerkende Fehlerfall ist.
 *
 * Verglichen wird gegen die **rohe** Sampler-Höhe, nicht gegen die um
 * `ROAD_MESH.surfaceOffset` erhöhte: der Aufschlag ist der des *Meshes*, und
 * gemessen werden soll das Höhenfeld.
 */
export function measureRoadHeights(
  sampler: TerrainSampler,
  network: RoadNetwork,
  perRoad = 1000,
): HeightDeviation[] {
  const out: HeightDeviation[] = [];

  for (const road of network.roads) {
    const line = road.centerline;
    const points = line.length / 3;
    if (points < 2) continue;

    const stride = Math.max(1, Math.floor(points / perRoad));
    const deltas: number[] = [];
    let maxAbs = -1;
    let worstAt = { x: 0, z: 0 };

    for (let i = 0; i < points; i += stride) {
      const x = line[i * 3]!;
      const y = line[i * 3 + 1]!;
      const z = line[i * 3 + 2]!;
      const delta = sampler.getHeightAt(x, z) - y;
      deltas.push(Math.abs(delta));
      if (Math.abs(delta) > maxAbs) {
        maxAbs = Math.abs(delta);
        worstAt = { x: Math.round(x), z: Math.round(z) };
      }
    }

    deltas.sort((a, b) => a - b);
    out.push({
      roadId: road.id,
      samples: deltas.length,
      medianCm: round2(percentile(deltas, 0.5) * 100),
      p95Cm: round2(percentile(deltas, 0.95) * 100),
      maxCm: round2(maxAbs * 100),
      worstAt,
    });
  }

  return out;
}

/**
 * Das Auto an Punkten der Strecke absetzen und nachsehen, wie hoch es steht.
 *
 * Gemessen wird gegen die **Oberkante des Fahrbahn-Meshes**, also
 * `Mittellinie + ROAD_MESH.surfaceOffset` — das ist die Fläche, die man im Bild
 * sieht. Der Sollwert ist damit 0 cm, und die Abnahmezeile aus PLAN.md 9.1
 * („Median unter 5 cm") bezieht sich auf genau diese Zahl.
 *
 * `respawn()` setzt das Auto auf `Ground.height() + cgHeight`, also auf
 * Ruhehöhe ohne Einfedern. Verglichen wird deshalb die Radaufstandsebene
 * (`y − cgHeight`) und nicht der Schwerpunkt.
 */
export function measureStandingHeight(
  deps: DriveProbeDeps,
  perRoad = 200,
): StandingHeight[] {
  const out: StandingHeight[] = [];

  for (const road of deps.network.roads) {
    const line = road.centerline;
    const points = line.length / 3;
    if (points < 2) continue;

    const stride = Math.max(1, Math.floor(points / perRoad));
    const deltas: number[] = [];
    let maxAbs = -1;
    let worstAt = { x: 0, z: 0 };

    for (let i = 0; i < points; i += stride) {
      const x = line[i * 3]!;
      const y = line[i * 3 + 1]!;
      const z = line[i * 3 + 2]!;
      deps.drive.placeAt(x, z, 0);
      // **Die Schwerpunkthöhe des gefahrenen Fahrzeugs, nicht die aus der
      // Basis-Konfiguration** — P21. `CHASSIS.cgHeight` ist die des Coupés
      // (0,52 m); mit dem Offroader (0,78) hätte diese Messung jede Standhöhe um
      // 26 cm danebengelegt, und zwar still. Seit P18 gibt es vier Fahrzeuge,
      // und seitdem war die Zeile falsch — sie ist nur nie mit einem anderen
      // gelaufen. Dieselbe Klasse wie die sieben Modulkonstanten, die in P17 aus
      // `Vehicle.ts` mussten: eine Zahl, die aus den Maßen **eines** Fahrzeugs
      // stammt und für alle gilt.
      const wheelPlane =
        deps.drive.vehicle.position.y - deps.drive.vehicle.spec.chassis.cgHeight;
      const delta = wheelPlane - (y + ROAD_MESH.surfaceOffset);
      deltas.push(Math.abs(delta));
      if (Math.abs(delta) > maxAbs) {
        maxAbs = Math.abs(delta);
        worstAt = { x: Math.round(x), z: Math.round(z) };
      }
    }

    deltas.sort((a, b) => a - b);
    out.push({
      roadId: road.id,
      samples: deltas.length,
      medianCm: round2(percentile(deltas, 0.5) * 100),
      maxCm: round2(maxAbs * 100),
      worstAt,
    });
  }

  return out;
}

/**
 * Eine Strecke abfahren lassen und mitschreiben, was dabei passiert.
 *
 * ## Der Regler
 *
 * Drei Teile, und der dritte ist eine Lehre aus dem ersten Lauf:
 *
 *  1. **Verfolgung eines Zielpunkts** auf der Mittellinie („pure pursuit"), mit
 *     dem geometrisch richtigen Lenkgesetz `δ = atan(2 L sin α / l_d)`. Die erste
 *     Fassung nahm stattdessen `δ ∝ α` — ein Proportionalregler ohne Bezug zur
 *     Fahrzeuggeometrie. Der schaukelte sich auf und lag nach 331 m im Graben.
 *  2. **Sollgeschwindigkeit aus der Krümmung**: `v = √(μ g R)` ist die
 *     Kurvengrenzgeschwindigkeit, und `pace` sagt, welchen Anteil davon der Regler
 *     wagt. Bei 0,8 fährt er zügig; bei 1,0 fliegt er planmäßig aus der Kurve —
 *     und das ist ein brauchbarer Test, weil dann die Leitplanke gemessen wird.
 *  3. **Ausbruchhilfe.** Reißt die Hinterachse über ihren Kennlinienscheitel
 *     hinaus aus (`|α_hinten| > peakSlipRear`), nimmt der Regler das Gas weg und
 *     lenkt dem Schwimmwinkel entgegen. Ohne diesen Teil misst der Prüfstand
 *     nicht die Strecke, sondern nur, an welcher Kurve sein Regler aufgibt.
 *
 * > **Die Ausbruchhilfe ist Teil des Reglers, nicht des Fahrzeugs.** Sie steht
 * > hier in `debug/` und nicht in `Vehicle`; wer sie für eine Fahrhilfe des Autos
 * > hält, hat den Prüfstand mit dem Spiel verwechselt. Die einzige Hilfe *im*
 * > Fahrzeug ist `STEERING.driftDamping`, und die ist dort begründet.
 *
 * **Das ist trotzdem kein guter Fahrer.** Er hat keinen Blick für die Ideallinie
 * und bremst spät, weil er die Krümmung erst am Zielpunkt sieht. Was er kann, ist
 * 3600 Schritte lang genau dasselbe tun — und darauf kommt es bei einer Messung
 * an.
 */
export function driveRoad(
  deps: DriveProbeDeps,
  roadId: string,
  seconds: number,
  pace: number,
  speedCap = Infinity,
): DriveRun | null {
  const { drive, network } = deps;
  const road = network.roads.find((r) => r.id === roadId);
  const line = network.getRacingLine(roadId);
  if (!road || !line) return null;

  const points = line.length / 3;
  const settings = ROAD_TYPES[road.type];
  const halfWidth = settings.width / 2 + settings.shoulder;

  // Start am ersten Stützpunkt, Blick auf den zweiten.
  const startX = line[0]!;
  const startZ = line[2]!;
  const heading = Math.atan2(line[3]! - startX, line[5]! - startZ);
  drive.placeAt(startX, startZ, heading);

  const input: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  const steps = Math.round(seconds / FIXED_DT);

  let index = 0;
  let distance = 0;
  let speedSum = 0;
  let maxSpeed = 0;
  let maxPenetration = 0;
  let contactSteps = 0;
  let maxOffCenter = 0;
  let maxOffCenterAt = { x: 0, z: 0 };
  let offRoadSteps = 0;
  let maxSlip = 0;
  let lastX = drive.vehicle.position.x;
  let lastZ = drive.vehicle.position.z;
  let reachedEnd = false;
  let driven = 0;

  const started = performance.now();

  for (let step = 0; step < steps; step++) {
    driven = step + 1;
    const vehicle = drive.vehicle;
    const px = vehicle.position.x;
    const pz = vehicle.position.z;
    const speed = vehicle.telemetry.speed;

    // Nächster Stützpunkt, vorwärts suchend. Kein globaler Durchlauf: der Index
    // wächst monoton, also genügt ein Fenster — sonst schnappt der Regler auf
    // einer Achterbahn wie dem Ring auf einen Punkt der Gegenrichtung.
    index = advance(line, points, index, px, pz, road.closed);
    // Ende einer offenen Strecke: der Lauf ist zu Ende, nicht misslungen.
    if (!road.closed && index >= points - 4) {
      reachedEnd = true;
      break;
    }
    // Vorausschau mit dem Tempo: 10 m plus eine halbe Sekunde Fahrweg. Kürzer
    // heißt genauer in der Kurve und nervöser auf der Geraden; das ist der
    // einzige Regelparameter, an dem hier gedreht wurde.
    const lookahead = 10 + speed * 0.5;
    const targetIndex = step_forward(index, lookahead, road, points);
    const tx = line[targetIndex * 3]!;
    const tz = line[targetIndex * 3 + 2]!;

    // ── Lenken ────────────────────────────────────────────────────────
    //
    // Pure Pursuit: der Kreisbogen durch die aktuelle Lage und den Zielpunkt hat
    // den Radius `l_d / (2 sin α)`; der Radeinschlag dafür ist `atan(L / R)`.
    // Zusammengesetzt ergibt das das Gesetz unten. Es kennt den Radstand und ist
    // deshalb stabil, wo ein reiner Proportionalregler schwingt.
    const toTarget = Math.atan2(tx - px, tz - pz);
    const error = wrap(toTarget - vehicle.yaw);
    const lookDistance = Math.max(1, Math.hypot(tx - px, tz - pz));
    const wanted = Math.atan2(2 * CHASSIS.wheelbase * Math.sin(error), lookDistance);
    // Auf die Reglerskala: die Eingabe ist −1…1 **des gerade möglichen**
    // Einschlags, und der schrumpft mit dem Tempo (`STEERING.speedFalloff`).
    const available = STEERING.maxAngle / (1 + speed / STEERING.speedFalloff);
    // **Negativ.** `error > 0` heißt „der Gierwinkel muss wachsen, damit die Nase
    // aufs Ziel zeigt", und ein wachsender Gierwinkel ist eine **Links**kurve.
    // Die Eingabe für links ist −1.
    input.steer = clamp(-wanted / available, -1, 1);

    // ── Sollgeschwindigkeit über den Bremsweg ─────────────────────────
    const limit = Math.min(speedLimit(line, points, index, road, pace), speedCap);
    // **Mit Reserve und kräftig.** Die erste Fassung bremste erst *am* Sollwert
    // und dosierte über 6 m/s Abweichung — das Ergebnis war ein Regler, der
    // rechnerisch exakt mit Kurvengeschwindigkeit ankam und praktisch immer ein
    // paar km/h darüber, weil er auf den letzten Metern kaum noch bremste. Bei
    // einem Fahrzeug, das an seiner Haftgrenze übersteuert, ist „exakt am Limit"
    // dasselbe wie „darüber".
    const ziel = limit * 0.95;
    if (speed < ziel) {
      input.throttle = clamp((ziel - speed) / 4, 0, 1);
      input.brake = 0;
    } else {
      input.throttle = 0;
      input.brake = clamp((speed - ziel) / 2, 0, 1);
    }

    // ── Ausbruchhilfe ─────────────────────────────────────────────────
    //
    // Gemessen ohne sie: der Regler hielt Gas und Einschlag in den Dreher hinein
    // und kam nach 331 m von der Strecke ab. Die Schwelle ist der Scheitel der
    // Reifenkennlinie — ab dort fällt die Seitenkraft, und ab dort ist es ein
    // Ausbruch und keine Kurve mehr.
    //
    // **Sie schaltet um, statt zu überlagern.** Die erste Fassung addierte den
    // Gegenlenkanteil auf die Verfolgung; das ergab genau das Gegeneinander, das
    // einen Dreher festhält — die Verfolgung will zum Ziel, das Fangen will
    // geradeaus. Gemessen half es an keiner einzigen Stelle.
    //
    // Der Gegeneinschlag ist bewusst **schwach**. Der Grund ist eine Messung am
    // Fahrzeug selbst: aus 58° Schwimmwinkel bei 89 km/h fängt sich der Wagen
    // **ohne jede Eingabe** in 1,5 s (Reihe: 58° → 73° → 33° → 2°). Volles
    // Gegenlenken dagegen schaukelte ihn auf (−38° → −81° → −69° → −88°). Ein
    // Modell, das sich selbst fängt, braucht keinen Helden am Lenkrad, sondern
    // jemanden, der das Gas loslässt.
    const rear = Math.abs(vehicle.telemetry.slipRear);
    if (rear > TIRE.peakSlipRear) {
      const over = Math.min(1, (rear - TIRE.peakSlipRear) / TIRE.peakSlipRear);
      input.throttle = 0;
      input.brake = 0;
      // Gegenlenken heißt: in die Richtung lenken, in die das Heck wegläuft.
      // `slip > 0` bedeutet seit der Vorzeichenreparatur „die Fahrtrichtung zeigt
      // nach rechts an der Nase vorbei", also muss nach links gelenkt werden.
      const fangen = clamp(-vehicle.telemetry.slip * 0.8, -1, 1);
      input.steer = clamp(input.steer * (1 - over) + fangen * over, -1, 1);
    }

    drive.simulateStep(FIXED_DT, input);

    // ── Mitschreiben ──────────────────────────────────────────────────────
    const t = vehicle.telemetry;
    distance += Math.hypot(vehicle.position.x - lastX, vehicle.position.z - lastZ);
    lastX = vehicle.position.x;
    lastZ = vehicle.position.z;
    speedSum += t.speed;
    if (t.speed > maxSpeed) maxSpeed = t.speed;
    if (t.contacts > 0) contactSteps++;
    if (t.lastPenetration > maxPenetration) maxPenetration = t.lastPenetration;
    if (Math.abs(t.slip) > maxSlip) maxSlip = Math.abs(t.slip);

    const offCenter = distanceToLine(line, points, index, vehicle.position.x, vehicle.position.z);
    if (offCenter > maxOffCenter) {
      maxOffCenter = offCenter;
      maxOffCenterAt = { x: Math.round(vehicle.position.x), z: Math.round(vehicle.position.z) };
    }
    if (offCenter > halfWidth) offRoadSteps++;
  }

  const elapsed = performance.now() - started;
  const usedSteps = Math.max(1, driven);
  const finalOff = distanceToLine(
    line,
    points,
    index,
    drive.vehicle.position.x,
    drive.vehicle.position.z,
  );

  return {
    roadId,
    steps: usedSteps,
    seconds: round2(usedSteps * FIXED_DT),
    distance: round2(distance),
    meanKmh: round2((speedSum / usedSteps) * 3.6),
    maxKmh: round2(maxSpeed * 3.6),
    maxPenetrationCm: round2(maxPenetration * 100),
    contactSteps,
    maxOffCenter: round2(maxOffCenter),
    maxOffCenterAt,
    offRoadSteps,
    maxSlipDeg: round2((maxSlip * 180) / Math.PI),
    msPerStep: Number((elapsed / usedSteps).toPrecision(3)),
    finished: finalOff <= halfWidth * 2,
    reachedEnd,
  };
}

/** Beides zusammen — der Lauf, der in die Abnahme geht. */
export function runDriveProbe(
  deps: DriveProbeDeps,
  options: DriveProbeOptions = {},
): DriveProbeReport {
  const seconds = options.seconds ?? 60;
  const pace = options.pace ?? 0.7;
  const ids = options.roads ?? deps.network.roads.map((r) => r.id);
  const notes: string[] = [];

  if (deps.drive.colliderCount === 0) {
    notes.push(
      'Kollisionswelt ist leer — Stadt und Props waren beim Aufbau noch nicht da. ' +
        'Der Lauf misst dann nur Gelände und Leitplanken.',
    );
  }

  const runs: DriveRun[] = [];
  for (const id of ids) {
    const run = driveRoad(deps, id, seconds, pace, options.speedCap ?? Infinity);
    if (run) runs.push(run);
    else notes.push(`Strecke „${id}" gibt es nicht.`);
  }

  // Das Auto steht nach dem Lauf irgendwo auf der letzten Strecke. Zurück auf
  // eine bekannte Stelle: ein Prüfstand, der einen Zustand hinterlässt, den es
  // im Betrieb nicht gibt, hat in diesem Projekt schon einen halben Tag gekostet.
  deps.drive.respawn();

  return {
    heights: measureRoadHeights(deps.sampler, deps.network),
    standing: measureStandingHeight(deps),
    runs,
    colliders: deps.drive.colliderCount,
    notes,
  };
}

/**
 * Wie schnell darf der Regler **jetzt** fahren?
 *
 * ## Warum die Krümmung am Zielpunkt nicht reicht
 *
 * Die erste Fassung nahm `v = √(μ g R)` am Vorausschaupunkt — bei 40 m/s liegt
 * der 30 m voraus. Das Bremsen aus 48 m/s auf 15 m/s braucht bei 1,25 g aber
 * `(48² − 15²)/(2 · 12,3) = 84 m`. Der Regler kam also mit 174 km/h an einer Kurve
 * an, für die er 68 km/h gebraucht hätte, und flog jedes Mal ab. Gemessen: auf
 * **allen vier** geprüften Strecken „ABGEKOMMEN", auf dem Ring nach 913 m.
 *
 * ## Das Profil
 *
 * Für jeden Punkt `d` Meter voraus gilt: um dort auf `v_Kurve(d)` zu sein, darf ich
 * jetzt höchstens `√(v_Kurve(d)² + 2 a d)` fahren. Das Minimum über die Vorausschau
 * ist die Antwort. Das ist die übliche „Geschwindigkeitsprofil"-Rechnung, rückwärts
 * über die Strecke — hier nur lokal statt über die ganze Runde, weil der Regler
 * ohnehin je Schritt neu rechnet.
 *
 * `a` ist mit 80 % der Haftgrenze angesetzt: bremst der Regler mit allem, was der
 * Reifen hat, bleibt für die Seitenführung nichts übrig (Reibkreis), und er
 * schiebt geradeaus in die Kurve.
 */
function speedLimit(
  line: Float32Array,
  points: number,
  index: number,
  road: { closed: boolean; length: number },
  pace: number,
): number {
  const spacing = road.length / (road.closed ? points : Math.max(points - 1, 1));
  const brake = CONTROL_GRIP * GRAVITY * 0.8;
  let limit = Infinity;

  // 200 m Vorausschau in 8-m-Schritten. 200 m sind der Bremsweg aus 260 km/h;
  // weiter zu schauen kostet Rechenzeit für eine Kurve, die noch nicht zählt.
  for (let d = 0; d <= 200; d += 8) {
    const ahead = Math.round(d / spacing);
    const at = road.closed
      ? (index + ahead) % points
      : Math.min(index + ahead, points - 1);
    const corner =
      Math.sqrt(CONTROL_GRIP * GRAVITY * curvatureRadius(line, points, at, road.closed)) * pace;
    const allowed = Math.sqrt(corner * corner + 2 * brake * d);
    if (allowed < limit) limit = allowed;
    if (!road.closed && index + ahead >= points - 1) break;
  }

  return limit;
}

// ── Hilfsrechnungen ───────────────────────────────────────────────────────────

/**
 * Nächsten Stützpunkt vorwärts suchen, in einem Fenster ab `from`.
 *
 * Das Fenster ist die Reparatur eines Fehlers, den der erste Entwurf hatte: mit
 * globaler Suche fand der Regler auf dem geschlossenen Ring gelegentlich einen
 * Punkt der Gegenfahrbahn (die Schleife läuft an manchen Stellen 30 m neben sich
 * selbst) und riss das Lenkrad um.
 */
function advance(
  line: Float32Array,
  points: number,
  from: number,
  x: number,
  z: number,
  closed: boolean,
): number {
  let best = from;
  let bestSq = Infinity;
  const window = 120;
  for (let k = 0; k < window; k++) {
    const i = closed ? (from + k) % points : Math.min(from + k, points - 1);
    const dx = line[i * 3]! - x;
    const dz = line[i * 3 + 2]! - z;
    const sq = dx * dx + dz * dz;
    if (sq < bestSq) {
      bestSq = sq;
      best = i;
    }
  }
  return best;
}

/** Index, der `meters` weiter auf der Linie liegt. Die Abtastung ist gleichmäßig. */
function step_forward(
  index: number,
  meters: number,
  road: { closed: boolean; length: number },
  points: number,
): number {
  const spacing = road.length / (road.closed ? points : Math.max(points - 1, 1));
  const ahead = Math.max(1, Math.round(meters / spacing));
  return road.closed ? (index + ahead) % points : Math.min(index + ahead, points - 1);
}

/**
 * Kurvenradius an einem Stützpunkt, aus drei Punkten im Abstand von ~10 m.
 *
 * Über den Umkreisradius: `R = a·b·c / (4·A)`. Bei fast geraden Punkten geht `A`
 * gegen null und `R` gegen unendlich — deshalb der Deckel, sonst wird die
 * Sollgeschwindigkeit `Infinity` und der Regler gibt für immer Vollgas.
 */
function curvatureRadius(
  line: Float32Array,
  points: number,
  index: number,
  closed: boolean,
): number {
  const offset = 6;
  const pick = (i: number): number =>
    closed ? (i + points) % points : Math.min(Math.max(i, 0), points - 1);
  const a = pick(index - offset);
  const b = index;
  const c = pick(index + offset);

  const ax = line[a * 3]!;
  const az = line[a * 3 + 2]!;
  const bx = line[b * 3]!;
  const bz = line[b * 3 + 2]!;
  const cx = line[c * 3]!;
  const cz = line[c * 3 + 2]!;

  const sideA = Math.hypot(bx - ax, bz - az);
  const sideB = Math.hypot(cx - bx, cz - bz);
  const sideC = Math.hypot(cx - ax, cz - az);
  const area = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
  // Der Deckel ist zugleich die Definition von „gerade". 250 m Radius ergeben
  // bei `CONTROL_GRIP` und `pace` 0,7 rund 130 km/h — schnell genug, dass keine
  // Strecke dieser Karte künstlich gebremst wird, und niedrig genug, dass der
  // Regler auf einer Dorfstraße nicht auf 200 km/h plant.
  if (area < 1e-4) return 250;
  return Math.min(250, (sideA * sideB * sideC) / (4 * area));
}

/** Abstand zur Mittellinie, gesucht im Fenster um `index`. */
function distanceToLine(
  line: Float32Array,
  points: number,
  index: number,
  x: number,
  z: number,
): number {
  let best = Infinity;
  for (let k = -4; k <= 4; k++) {
    const i = Math.min(Math.max(index + k, 0), points - 1);
    const dx = line[i * 3]! - x;
    const dz = line[i * 3 + 2]! - z;
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index]!;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function wrap(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// `CHASSIS` steht hier nur, damit die Fahrzeugbreite in einem Fehlerfall
// nachvollziehbar ist: ein Auto von 1,68 m auf einer 1,80 m breiten Pfad-Strecke
// hat rechnerisch 6 cm je Seite. Wer sich wundert, warum `pfad` in jedem Lauf
// „offRoad" meldet — das ist der Grund, und es ist keine Fehlfunktion.
export const PROBE_NOTE_VEHICLE_WIDTH = CHASSIS.bodyWidth;
