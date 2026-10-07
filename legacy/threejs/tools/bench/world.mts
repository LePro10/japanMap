/**
 * Der Prüfstand für **Gelände und Kollision** — P19, erweitert in P20.
 *
 * > **P20 hat zwei Proben ergänzt, und sie sind von anderer Art als die sechs
 * > darunter.** `Hang` misst, ob die **Karosserie** im Berg steckt — die Frage,
 * > für die es bis P20 keine Kennzahl gab (gemessen: 0,78 m auf einem
 * > befahrbaren 20°-Hang, 4,45 m auf 65°, bei durchweg gesunden Zahlen).
 * > `Zufallsgelände` bildet **keine** bekannte Lage nach: 90 s gewürfeltes
 * > Gelände, gewürfelte Eingaben, fester Seed, und geprüft werden Zusicherungen
 * > statt Zahlen. Sie hat zwei Fehler gefunden, die keine der sechs Nachbauten
 * > gezeigt hat.
 *
 * `fleet.mts` fährt auf einem idealen Boden und isoliert damit das Fahrmodell.
 * Genau deshalb hat es die Fehler, um die es hier geht, nie gesehen: sie stecken
 * in der Schicht *darunter* — im Bodenfang (`supportPlane.ts`) und in der
 * Auflösung gegen Hindernisse (`CollisionWorld` + `Vehicle.#resolveCollision`).
 *
 * Beide Fehler waren auf einem **Bild** zu sehen, bevor sie hier eine Zahl
 * hatten: ein Auto, das in einer Felswand klebt, und eines, das in einem Baum
 * steckt. Die Proben unten bilden genau diese zwei Lagen nach, dazu vier
 * weitere, die dieselben Fehlerklassen an anderer Stelle finden.
 *
 *     node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/world.mts
 *
 * Was er **nicht** kann: sagen, ob sich das Fahren gut anfühlt, und die echte
 * Karte prüfen. Dafür ist `japanMap.driveProbe()` im laufenden Bild zuständig.
 */
import { Vector3 } from 'three';

import { Vehicle } from '@/game/Vehicle';
import { CollisionWorld } from '@/game/CollisionWorld';
import { VEHICLES, VEHICLE_ORDER, type VehicleSpec } from '@/config/vehicles.config';
import { input } from './flat.mjs';

const DT = 1 / 60;
const DEG = Math.PI / 180;

type Cmd = { throttle: number; brake: number; steer: number; handbrake: boolean };

interface Ground {
  height(x: number, z: number): number;
  normal(x: number, z: number, target: Vector3): Vector3;
  surface(x: number, z: number): string;
  waterDepth?(x: number, z: number): number;
}

/** Ebener Boden mit einer Wand ab `x = 0`, Neigung `grad`, Höhe gedeckelt. */
function cliffGround(grad: number, top: number): Ground {
  const slope = Math.tan(grad * DEG);
  const height = (x: number): number => (x <= 0 ? 0 : Math.min(x * slope, top));
  return {
    height: (x: number) => height(x),
    normal: (x: number, _z: number, t: Vector3) => {
      // Nur dort geneigt, wo die Wand noch steigt — auf dem Plateau flach.
      const rising = x > 0 && x * slope < top;
      if (!rising) return t.set(0, 1, 0);
      const n = Math.hypot(slope, 1);
      return t.set(-slope / n, 1 / n, 0);
    },
    surface: () => 'gelaende',
    waterDepth: () => 0,
  };
}

function flat(surface = 'asphalt'): Ground {
  return {
    height: () => 0,
    normal: (_x: number, _z: number, t: Vector3) => t.set(0, 1, 0),
    surface: () => surface,
    waterDepth: () => 0,
  };
}

function drive(spec: VehicleSpec, ground: Ground, collision: CollisionWorld | null = null) {
  const v = new Vehicle(spec);
  v.respawn(0, 0, 0, ground as never);
  return {
    v,
    step(cmd: Partial<Cmd>) {
      v.step(DT, input(cmd) as never, ground as never, collision);
      v.consumeBreaks();
    },
  };
}

const nf = (x: number, digits = 2): string => x.toFixed(digits).padStart(7);

// ── 1. Die Felswand ─────────────────────────────────────────────────────────
//
// Ein Auto wird auf einer 55°-Wand abgesetzt und losgelassen. Es muss **fallen**.
// Bis P19 blieb es hängen: `resolveTerrainFollow` setzte im Wandzweig
// `vy = 0` in jedem Schritt, und damit konnte die Schwerkraft nie wirken.
// Genau das steht auf dem Bild, das diese Phase ausgelöst hat.
function cliffHang(spec: VehicleSpec) {
  const ground = cliffGround(55, 60);
  const startX = 20;
  const v = new Vehicle(spec);
  v.respawn(startX, 0, 0, ground as never);
  const y0 = v.position.y;
  let lowest = y0;
  for (let i = 0; i < 480; i++) {
    v.step(DT, input({}) as never, ground as never, null);
    if (v.position.y < lowest) lowest = v.position.y;
  }
  return {
    y0,
    y: v.position.y,
    fall: y0 - v.position.y,
    x: v.position.x,
    lowest,
  };
}

// ── 2. Der Baum ─────────────────────────────────────────────────────────────
//
// Ein Stamm (r = 0,40 m) steht auf der Fahrlinie. Geprüft wird mit **drei**
// seitlichen Versätzen, und der mittlere ist der interessante: bis P19 prüfte
// die Karosserie nur an ihren **vier Ecken**, und zwischen ihnen liegen über
// vier Meter. Ein Stamm auf der Mittellinie lag damit *im* Auto, ohne je einen
// Prüfpunkt zu berühren — das Auto fuhr durch ihn hindurch, und erst wenn eine
// Ecke ihn zufällig streifte, hakte es.
//
// Das Tempo wird geregelt: über `TREE_BREAK_SPEED` bricht der Baum, und dann
// misst die Probe das Zerbrechen statt die Kollision.
function treeHit(spec: VehicleSpec, offset: number) {
  const ground = flat('gelaende');
  const collision = new CollisionWorld();
  collision.beginDynamic();
  collision.addDynamicCylinder(offset, 18, 0.4, -0.4, 7, 4711);

  const v = new Vehicle(spec);
  v.respawn(0, 0, 0, ground as never);

  let deepest = 0;
  let contacts = 0;
  let passed = false;
  let stalledSteps = 0;
  for (let i = 0; i < 900; i++) {
    // Tempo auf 8 m/s halten — darunter hält jeder Baum.
    const e = 8 - v.telemetry.forwardSpeed;
    const cmd = e > 0 ? { throttle: Math.min(1, e * 0.4) } : { throttle: 0 };
    v.step(DT, input(cmd) as never, ground as never, collision);
    v.consumeBreaks();
    if (v.telemetry.lastPenetration > deepest) deepest = v.telemetry.lastPenetration;
    if (v.telemetry.contacts > 0) contacts++;
    if (v.position.z > 18.5) passed = true;
    if (v.telemetry.speed < 0.4 && v.position.z > 10) stalledSteps++;
  }
  return {
    deepest,
    contacts,
    passed,
    stalled: stalledSteps * DT,
    z: v.position.z,
    alive: collision.isAlive(4711, 1),
  };
}

// ── 2b. Die Klippenkante ────────────────────────────────────────────────────
//
// Ein Absatz von 3 m quer unter dem Auto: die Hinterachse steht oben, die
// Vorderachse hängt über der Kante. Das Auto muss **herunterfallen**.
//
// Bis P19 blieb es waagerecht in der Luft stehen — `reachableSupport` mittelt
// über alle Räder *in Reichweite*, und zwei Räder einer Achse genügten ihr als
// Stütze. Gemessen am Bergpass bei (−1085, −512): Vorderachse auf 113,79 m,
// Hinterachse auf 116,76 m, Schwerpunkt auf **117,28 m**, `airborne: false`,
// null Kontakte, null Durchdringung. Der Messstand des Fahrmodus hat dort eine
// Standhöhe von 18,05 m mitgeschrieben.
function cliffEdge(spec: VehicleSpec) {
  const step = 3;
  const kante = 0;
  // Oben ab `z <= kante`, unten dahinter. Die Normale bleibt waagerecht — es
  // geht ausdrücklich **nicht** um den Steilhangzweig, sondern um die Stützebene.
  const ground: Ground = {
    height: (_x: number, z: number) => (z <= kante ? step : 0),
    normal: (_x: number, _z: number, t: Vector3) => t.set(0, 1, 0),
    surface: () => 'gelaende',
    waterDepth: () => 0,
  };

  // **Über die Kante gefahren, nicht davor abgesetzt.** Zwei Anläufe sind an
  // von Hand gesetzten Zuständen gescheitert, und beide Male war der Zustand
  // einer, den es im Betrieb nicht gibt:
  //
  //  1. Vorderräder 13 cm hinter der Kante — `#sampleWheels` bildet die Höhe als
  //     Maximum über drei Proben im **Radradius** (0,31 m), ein Rad überbrückt
  //     also, was schmaler ist als es selbst, und liegt bis 31 cm hinter einer
  //     Kante noch auf ihr auf. Richtig so, gemessen wurde damit nichts.
  //  2. Schwerpunkt 27 cm **vor** der Kante — dort hält ihn der Bodenfang
  //     (`resolveTerrainFollow` fragt die Höhe unter dem Schwerpunkt) auf dem
  //     Plateau fest. Auch richtig so: ein Auto, dessen Schwerpunkt noch über
  //     dem Plateau steht, kippt nicht.
  //
  // Genau die Falle aus CLAUDE.md, zweimal hintereinander. Der Weg, der misst,
  // was gemeint ist: hinfahren.
  const v = new Vehicle(spec);
  v.respawn(0, -14, 0, ground as never);
  const y0 = v.position.y;
  let hoechste = 0;
  for (let i = 0; i < 420; i++) {
    // Tempo auf 7 m/s halten — schnell genug zum Überfahren, langsam genug,
    // dass ein weiter Sprung die Messung nicht überdeckt.
    const e = 7 - v.telemetry.forwardSpeed;
    v.step(DT, input(e > 0 ? { throttle: Math.min(1, e * 0.4) } : {}) as never, ground as never, null);
    // Die größte Standhöhe **jenseits** der Kante ist die eigentliche Kennzahl:
    // ein Wagen, der dort schwebt, steht meterweit über dem Boden unter sich.
    if (v.position.z > 2) {
      const stand = v.position.y - ground.height(v.position.x, v.position.z);
      if (stand > hoechste) hoechste = stand;
    }
  }
  // **Die Kennzahl ist die Standhöhe im Stillstand, nicht die im Flug.** Wer mit
  // 25 km/h eine 3-m-Stufe hinunterfährt, fliegt — die 1,9…2,8 m Scheitel sind
  // richtig. Falsch wäre ein Wagen, der danach **oben stehen bleibt**; genau das
  // hat der Messstand am Bergpass gemessen (3,49 m, ruhend, airborne false).
  for (let i = 0; i < 300 && v.telemetry.speed > 0.05; i++) {
    v.step(DT, input({ brake: 1 }) as never, ground as never, null);
  }
  for (let i = 0; i < 120; i++) v.step(DT, input({}) as never, ground as never, null);
  const stand = v.position.y - ground.height(v.position.x, v.position.z);
  return { y0, y: v.position.y, hoechste, stand, z: v.position.z };
}

// ── 3. Die Innenecke ────────────────────────────────────────────────────────
//
// Zwei Wände im rechten Winkel. Das Auto fährt hinein, hält an, legt den
// Rückwärtsgang ein und muss **herauskommen**. Ein Wagen, der in einer Ecke
// klemmt, ist der zweite Fall aus dem Fehlerbericht („man verbuggt sich").
function cornerWedge(spec: VehicleSpec) {
  const ground = flat();
  const collision = new CollisionWorld();
  // Zwei Wände, die sich bei (0, 20) treffen und einen Trichter bilden.
  collision.addWall(-12, 20, 12, 20, 0.3, -1, 3);
  collision.addWall(6, 8, 6, 32, 0.3, -1, 3);
  collision.addWall(-6, 8, -6, 32, 0.3, -1, 3);

  const v = new Vehicle(spec);
  v.respawn(0, 0, 0, ground as never);

  for (let i = 0; i < 300; i++) {
    v.step(DT, input({ throttle: 1 }) as never, ground as never, collision);
    v.consumeBreaks();
  }
  const stuckZ = v.position.z;
  const penetration = v.telemetry.lastPenetration;
  // Rückwärts heraus.
  for (let i = 0; i < 240; i++) {
    v.step(DT, input({ brake: 1 }) as never, ground as never, collision);
    v.consumeBreaks();
  }
  return { stuckZ, penetration, out: stuckZ - v.position.z };
}

// ── 3b. Der Schraubstock ────────────────────────────────────────────────────
//
// **Die Lage, die den Fahrmodus unspielbar gemacht hat.** Zwei Props im Abstand
// einer Wagenlänge plus ein paar Zentimeter — das Auto fährt hinein und steht.
// Gefunden auf der echten Karte am Tempelaufgang (`sando`) bei (831, −888):
// zwei Zylinder mit 4,3 m Abstand, beide Schübe heben sich exakt auf,
// Restdurchdringung 0,0006 m. Gemessen im laufenden Bild, jeweils drei Sekunden:
// Vollgas **0,09 m**, rückwärts **0,19 m**, Volleinschlag **0,09 m**. Die
// Position stand über zwölf Schritte auf die letzte Stelle still.
//
// Der Klemmzähler in `Vehicle.#resolveCollision` sah das nicht: seine erste
// Fassung fragte nur nach **Restdurchdringung**, und die gibt es hier nicht.
// Geprüft wird deshalb, ob der Wagen wieder herauskommt — mit Gas, rückwärts
// oder gar nicht.
function viceGrip(spec: VehicleSpec) {
  const ground = flat('kies');
  const collision = new CollisionWorld();
  // **Eine Gasse, die schmaler ist als das Auto**, plus ein Riegel dahinter.
  // Der erste Aufbau stellte zwei Props hintereinander auf die Fahrlinie — dort
  // hält der vordere den Wagen mit **einem** Kontakt auf, und das ist kein
  // Schraubstock, sondern eine Wand (rückwärts kommt man da heraus). Gemessen:
  // 8,4 m in 4 s, also gar kein Klemmfall.
  const seite = spec.chassis.bodyWidth * 0.5 - 0.1;
  for (let i = 0; i < 4; i++) {
    collision.addCylinder(seite + 0.5, 16 + i * 2.2, 0.5, -1, 4);
    collision.addCylinder(-seite - 0.5, 16 + i * 2.2, 0.5, -1, 4);
  }
  collision.addCylinder(0, 25, 0.6, -1, 4);

  const v = new Vehicle(spec);
  v.respawn(0, 0, 0, ground as never);
  for (let i = 0; i < 480; i++) {
    v.step(DT, input({ throttle: 1 }) as never, ground as never, collision);
    v.consumeBreaks();
  }
  const drin = { x: v.position.x, z: v.position.z };
  const geklemmt = v.telemetry.contacts;

  // Vier Sekunden versuchen herauszukommen — so, wie es ein Spieler täte.
  for (let i = 0; i < 240; i++) {
    v.step(DT, input({ brake: 1, steer: 0.6 }) as never, ground as never, collision);
    v.consumeBreaks();
  }
  const raus = Math.hypot(v.position.x - drin.x, v.position.z - drin.z);
  return { geklemmt, raus, kontakte: v.telemetry.contacts };
}

// ── 4. Die Planke im Streifschuss ───────────────────────────────────────────
//
// Flach an eine Wand, wie in jeder Kehre des Bergpasses. Das Auto darf Tempo
// verlieren, aber nicht stehenbleiben und nicht durchschlagen.
function railScrape(spec: VehicleSpec) {
  const ground = flat();
  const collision = new CollisionWorld();
  const wallX = 2.2;
  collision.addWall(wallX, -10, wallX, 200, 0.12, -1, 0.85);

  const v = new Vehicle(spec);
  // **Schräg angesetzt statt eingelenkt.** Ein fester Lenkeinschlag über
  // sieben Sekunden fährt einen Kreis, und dann misst die Probe den Kreis: der
  // erste Anlauf endete bei x = −126 m, hundertzwanzig Meter neben der Planke.
  // Genau der Fehler, vor dem CLAUDE.md warnt — ein Vorher/Nachher an zwei
  // verschiedenen Stellen misst die Kamera statt die Änderung.
  v.respawn(0, 0, 8 * DEG, ground as never);
  for (let i = 0; i < 180; i++) {
    v.step(DT, input({ throttle: 1 }) as never, ground as never, collision);
    v.consumeBreaks();
  }
  const before = v.telemetry.speed;
  let through = false;
  let touched = 0;
  for (let i = 0; i < 420; i++) {
    v.step(DT, input({ throttle: 1 }) as never, ground as never, collision);
    v.consumeBreaks();
    if (v.telemetry.contacts > 0) touched++;
    // Die Blechkante darf die Wandachse nicht überschreiten.
    if (v.position.x > wallX) through = true;
  }
  return { before, after: v.telemetry.speed, x: v.position.x, through, touched };
}

// ── 5. Die harte Landung ────────────────────────────────────────────────────
//
// Aus sechs Metern fallen lassen. Prüft, dass der Bodenfang nach einer
// Flugphase nicht nach oben ratscht (die alte „Berg-Rakete") **und** dass der
// Aufbau danach wieder auf seiner Ruhelage steht.
//
// Die zweite Hälfte hat den Fehler gefunden, der bei
// `VehicleDerived.bodyFloorGap` beschrieben ist: der Lastwagen federte tiefer
// ein, als seine Stützebene reicht, verlor damit dauerhaft seine Federkraft und
// blieb 84 cm zu tief liegen.
//
// > **`velocity.y` von Hand zu setzen wirkt nicht**, und der erste Anlauf ist
// > genau darauf hereingefallen: die Hochgeschwindigkeit ist intern `#vY`,
// > `velocity.y` wird daraus nur *geschrieben*. Der „Sprung" war in Wahrheit ein
// > Versetzen um 1,5 m — was die Probe nicht wertlos machte (sie hat den Fehler
// > gefunden), aber sie maß etwas anderes, als ihr Name sagte.
function jumpLanding(spec: VehicleSpec) {
  const ground = flat('gelaende');
  const v = new Vehicle(spec);
  v.respawn(0, 0, 0, ground as never);
  for (let i = 0; i < 420; i++) v.step(DT, input({ throttle: 1 }) as never, ground as never, null);
  v.position.y += 6;
  let apex = v.position.y;
  for (let i = 0; i < 240; i++) {
    v.step(DT, input({}) as never, ground as never, null);
    if (v.position.y > apex) apex = v.position.y;
  }
  // **Bis zum Stillstand bremsen, bevor die Ruhelage abgelesen wird.** Der
  // erste Anlauf las sie bei voller Fahrt ab und meldete für den Lastwagen
  // 0,26 m statt 1,10 m — das war kein Einsinken, sondern der **Abtrieb**
  // (`Fz += c·v²` drückt den Aufbau bei Tempo tiefer). Eine Ruhelage misst man
  // in Ruhe.
  for (let i = 0; i < 900 && v.telemetry.speed > 0.05; i++) {
    v.step(DT, input({ brake: 1 }) as never, ground as never, null);
  }
  for (let i = 0; i < 120; i++) v.step(DT, input({}) as never, ground as never, null);
  const restY = v.position.y;
  return { apex, restY, ruhe: Math.abs(restY - spec.chassis.cgHeight) };
}

// ── 6. Kosten ───────────────────────────────────────────────────────────────
//
// Ein Schritt mit Kollision, gemessen gegen einen ohne. Die Auflösung läuft im
// festen Zeitschritt; was sie kostet, gehört gemessen und nicht geschätzt.
function stepCost(spec: VehicleSpec) {
  const ground = flat();
  const collision = new CollisionWorld();
  // Eine typische Stadtlage: ein Häuserblock, eine Planke, ein paar Props.
  collision.addBox(-30, -6, -30, 30, -1, 12);
  collision.addWall(4, -40, 4, 40, 0.12, -1, 0.85);
  for (let i = 0; i < 12; i++) collision.addCylinder(-3 + i * 0.7, -20 + i * 5, 0.3, -1, 4);
  collision.beginDynamic();
  for (let i = 0; i < 24; i++) {
    collision.addDynamicCylinder(-8 + (i % 6) * 3, -10 + Math.floor(i / 6) * 6, 0.4, -0.4, 7, i);
  }

  const v = new Vehicle(spec);
  v.respawn(0, 0, 0, ground as never);
  const cmd = input({ throttle: 0.4 }) as never;
  for (let i = 0; i < 600; i++) v.step(DT, cmd, ground as never, collision);

  const N = 20000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) v.step(DT, cmd, ground as never, collision);
  const withCollision = (performance.now() - t0) / N;

  const v2 = new Vehicle(spec);
  v2.respawn(0, 0, 0, ground as never);
  for (let i = 0; i < 600; i++) v2.step(DT, cmd, ground as never, null);
  const t1 = performance.now();
  for (let i = 0; i < N; i++) v2.step(DT, cmd, ground as never, null);
  const without = (performance.now() - t1) / N;

  return { withCollision, without };
}

// ── 7. Der Hang — P20 ───────────────────────────────────────────────────────
//
// **Die Probe, die es bis P20 nicht gab, und der ganze Anlass dieser Phase.**
// Ein Auto fährt mit Vollgas gegen einen Hang. Gemessen wird, wie tief die
// **Unterkante der Karosserie** dabei unter die Geländeoberfläche gerät.
//
// Bis P20 kannte das Fahrzeug das Gelände nur unter seinen vier Rädern und dem
// Schwerpunkt; die 4 bis 7,6 m lange Karosserie dazwischen gab es nicht. Ein
// Coupé stand auf einem **befahrbaren** 20°-Hang 0,78 m im Berg, auf 65° waren
// es 4,45 m — bis zur Fensterkante. Keine Kennzahl hat es gemeldet, weil keine
// danach gefragt hat: Durchdringung zählt Hindernisse, nicht das Höhenfeld.
//
// Zwei Größen, und beide müssen stimmen:
//
//  · **Eintauchen** — darf nicht mehr sein als der Rest, den der Deckel aus
//    `resolveHullTerrain` stehen lässt (Größenordnung Zentimeter).
//  · **Steighöhe** — der Wagen muss den Hang trotzdem **hinauffahren**. Eine
//    Hülle, die alles blockiert, wäre die einfachste Art, die erste Zahl grün zu
//    bekommen und das Spiel kaputtzumachen; die zweite Zahl verhindert das.
function hillClimb(spec: VehicleSpec, grad: number, blend: number) {
  const s = Math.tan(grad * DEG);
  const slopeAt = (z: number) => (z <= 10 ? 0 : z >= 10 + blend ? s : (s * (z - 10)) / blend);
  const height = (z: number) =>
    z <= 10
      ? 0
      : z >= 10 + blend
        ? (s * blend) / 2 + s * (z - 10 - blend)
        : (s * (z - 10) * (z - 10)) / (2 * blend);
  const ground: Ground = {
    height: (_x: number, z: number) => height(z),
    normal: (_x: number, z: number, t: Vector3) => {
      const k = slopeAt(z);
      const q = Math.hypot(k, 1);
      return t.set(0, 1 / q, -k / q);
    },
    surface: () => 'gelaende',
    waterDepth: () => 0,
  };

  const v = new Vehicle(spec);
  v.respawn(0, 0, 0, ground as never);
  const p = new Vector3();
  const samples = spec.derived.hullSamples;
  let tiefstes = 0;
  for (let i = 0; i < 900; i++) {
    v.step(DT, input({ throttle: 1 }) as never, ground as never, null);
    // **Von außen nachgemessen, nicht die Telemetrie abgelesen.** Die meldet,
    // was die Auflösung *gesehen* hat; hier soll stehen, was nach dem Schritt
    // noch **im Berg** steckt.
    for (let k = 0; k < samples.length; k += 3) {
      p.set(samples[k]!, samples[k + 1]!, samples[k + 2]!)
        .applyQuaternion(v.quaternion)
        .add(v.position);
      const d = height(p.z) - p.y;
      if (d > tiefstes) tiefstes = d;
    }
  }
  return { tiefstes, hoehe: v.position.y, z: v.position.z };
}

// ── 8. Zufallsgelände — P20 ─────────────────────────────────────────────────
//
// **Die Antwort auf „nie wieder irgendwo drin".** Alle Proben oben bilden je
// eine Lage nach, die schon einmal schiefging. Diese hier bildet keine nach: sie
// würfelt 90 Sekunden Gelände und Eingaben und prüft **Zusicherungen**.
//
// Das Gelände ist eine Summe aus sechs Sinuslagen (Wellenlängen 120 m bis 7 m,
// zusammen bis 47° steil) — grob wie das Massiv der Karte, nur ohne dessen
// Erosion und damit ohne die Notwendigkeit, sie zu backen. Der Seed steht fest;
// zwei Läufe sind bitgleich, sonst wäre ein Befund nicht nachfahrbar.
//
// Geprüft werden vier Sätze, und jeder ist eine Fehlerklasse dieses Projekts:
//
//  1. **Der Aufbau steckt nicht im Berg** (P20, das Bild dieser Phase).
//  2. **Der Wagen bleibt nicht stehen** — über je 4 s wird der zurückgelegte Weg
//     gemessen, solange Gas anliegt. Null Meter bei Vollgas heißt festgefahren.
//  3. **Keine Rakete** — die Höhe bleibt in der Nähe des Geländes (P14).
//  4. **Keine NaN und kein Energieaufbau** (P14, der Integrator).
function terrainFuzz(spec: VehicleSpec) {
  // Sechs Lagen, feste Zahlen. Zusammen ergibt das Steigungen bis 47°.
  const lagen: readonly (readonly [number, number, number, number])[] = [
    [0.0084, 0.0061, 26, 0.7],
    [0.0173, -0.0119, 13, 1.9],
    [0.0301, 0.0227, 7.5, 2.4],
    [0.0611, -0.0509, 3.1, 0.6],
    [0.1103, 0.0894, 1.4, 1.1],
    [0.2203, -0.1701, 0.55, 2.8],
  ];
  const height = (x: number, z: number): number => {
    let h = 0;
    for (const [fx, fz, amp, phase] of lagen) h += amp * Math.sin(x * fx + z * fz + phase);
    return h;
  };
  const ground: Ground = {
    height,
    normal: (x: number, z: number, t: Vector3) => {
      // Zentraldifferenz auf 0,5 m — dieselbe Auflösung wie das Höhenfeld der
      // Karte, damit die Normale zur Höhe passt und nicht zu einer glatteren.
      const e = 0.5;
      const dx = (height(x + e, z) - height(x - e, z)) / (2 * e);
      const dz = (height(x, z + e) - height(x, z - e)) / (2 * e);
      return t.set(-dx, 1, -dz).normalize();
    },
    surface: () => 'gelaende',
    waterDepth: () => 0,
  };

  // Eingabe aus einem festen Zufallsstrom (xorshift32) — reproduzierbar.
  let seed = 0x9e3779b9;
  const rnd = (): number => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 0xffffffff;
  };

  const v = new Vehicle(spec);
  v.respawn(0, 0, 0, ground as never);
  const p = new Vector3();
  const samples = spec.derived.hullSamples;

  let tiefstes = 0;
  let lauf = 0;
  let laengsterLauf = 0;
  let laufTiefe = 0;
  let gehalten = 0;
  let hoechsteAbweichung = 0;
  let schlimmsterHalt = Infinity;
  let kaputt = false;
  let steer = 0;
  let throttle = 1;
  let fensterX = v.position.x;
  let fensterZ = v.position.z;
  let fensterGas = 0;
  const FENSTER = 240; // 4 s

  for (let i = 0; i < 5400; i++) {
    if (i % 90 === 0) {
      steer = rnd() * 2 - 1;
      // Zu 80 % Gas: die Frage ist „kommt er weg", nicht „steht er gern".
      throttle = rnd() < 0.8 ? 0.5 + rnd() * 0.5 : 0;
    }
    v.step(DT, input({ throttle, steer }) as never, ground as never, null);
    if (throttle > 0.4) fensterGas++;

    const t = v.telemetry;
    if (!Number.isFinite(v.position.y) || !Number.isFinite(t.speed)) kaputt = true;
    const boden = height(v.position.x, v.position.z);
    const ab = Math.abs(v.position.y - boden);
    if (ab > hoechsteAbweichung) hoechsteAbweichung = ab;

    let jetzt = 0;
    for (let k = 0; k < samples.length; k += 3) {
      p.set(samples[k]!, samples[k + 1]!, samples[k + 2]!)
        .applyQuaternion(v.quaternion)
        .add(v.position);
      const d = height(p.x, p.z) - p.y;
      if (d > jetzt) jetzt = d;
    }
    if (jetzt > tiefstes) tiefstes = jetzt;
    // **Ein Streifen im Landeanflug ist kein Steckenbleiben**, und beide Zahlen
    // getrennt zu führen ist der Unterschied zwischen einer Kennzahl und einem
    // Alarm. Ein einzelner Schritt mit 0,8 m Überdeckung ist bei 25 m/s ein
    // Frame — unsichtbar. Was auf dem Bild dieser Phase steht, ist ein Auto, das
    // **steht** und drinsteckt; die zweite Zahl misst genau das.
    if (jetzt > 0.1) {
      lauf++;
      if (jetzt > laufTiefe) laufTiefe = jetzt;
      if (lauf > laengsterLauf) {
        laengsterLauf = lauf;
        gehalten = laufTiefe;
      }
    } else {
      lauf = 0;
      laufTiefe = 0;
    }

    if ((i + 1) % FENSTER === 0) {
      // Nur Fenster werten, in denen der Fahrer überwiegend Gas gegeben hat.
      if (fensterGas > FENSTER * 0.6) {
        const weg = Math.hypot(v.position.x - fensterX, v.position.z - fensterZ);
        if (weg < schlimmsterHalt) schlimmsterHalt = weg;
      }
      fensterX = v.position.x;
      fensterZ = v.position.z;
      fensterGas = 0;
    }
  }
  return {
    tiefstes,
    laengsterLauf,
    gehalten,
    hoechsteAbweichung,
    schlimmsterHalt: Number.isFinite(schlimmsterHalt) ? schlimmsterHalt : -1,
    kaputt,
  };
}

// ── Ausgabe ─────────────────────────────────────────────────────────────────

console.log('╔══ Gelände und Kollision — Prüfstand P19/P20 ══════════════════════════════\n');

for (const id of VEHICLE_ORDER) {
  const spec = VEHICLES[id];
  console.log(`── ${spec.name}  (${id})`);

  const wand = cliffHang(spec);
  console.log(
    `   Felswand 55°: abgesetzt bei y=${nf(wand.y0)} m → nach 8 s y=${nf(wand.y)} m ` +
      `(gefallen ${nf(wand.fall)} m, x=${nf(wand.x)})`,
  );

  for (const offset of [0, 0.5, 0.9]) {
    const baum = treeHit(spec, offset);
    console.log(
      `   Baum Versatz ${offset.toFixed(2)} m: Kontakte ${String(baum.contacts).padStart(4)}  ` +
        `tiefste Durchdringung ${nf(baum.deepest, 3)} m  ` +
        `durchgefahren ${baum.passed ? 'JA' : 'nein'}  ` +
        `steht ${nf(baum.stalled, 1)} s  z=${nf(baum.z)}`,
    );
  }

  const kante = cliffEdge(spec);
  console.log(
    `   Klippenkante 3 m: hinuntergefahren auf y=${nf(kante.y)} bei z=${nf(kante.z)}; ` +
      `Scheitel im Flug ${nf(kante.hoechste)} m, **Standhöhe in Ruhe ${nf(kante.stand)} m** ` +
      `(Soll ${nf(spec.chassis.cgHeight)} m)`,
  );

  const ecke = cornerWedge(spec);
  console.log(
    `   Innenecke: hält bei z=${nf(ecke.stuckZ)} (Durchdringung ${nf(ecke.penetration, 3)} m), ` +
      `rückwärts heraus ${nf(ecke.out)} m`,
  );

  const klemme = viceGrip(spec);
  console.log(
    `   Schraubstock (enge Gasse): ${klemme.geklemmt} Kontakte beim Anhalten, ` +
      `in 4 s heraus ${nf(klemme.raus)} m (Soll > 2 m)`,
  );

  const planke = railScrape(spec);
  console.log(
    `   Planke streifen: ${nf(planke.before * 3.6)} → ${nf(planke.after * 3.6)} km/h, ` +
      `Kontakte ${String(planke.touched).padStart(3)}, x=${nf(planke.x)} ` +
      `${planke.through ? '✗ DURCHGESCHLAGEN' : '✓ gehalten'}`,
  );

  const sprung = jumpLanding(spec);
  console.log(
    `   Fall aus 6 m: Scheitel y=${nf(sprung.apex)} m → Ruhelage y=${nf(sprung.restY)} m ` +
      `(Soll ${nf(spec.chassis.cgHeight)} m)`,
  );

  for (const grad of [20, 35, 55]) {
    const hang = hillClimb(spec, grad, grad <= 20 ? 8 : 2);
    console.log(
      `   Hang ${String(grad).padStart(2)}°, 15 s Vollgas: Blech im Berg ${nf(hang.tiefstes, 3)} m  ` +
        `(Soll < 0,05)  gestiegen auf y=${nf(hang.hoehe, 1)} m bei z=${nf(hang.z, 1)}`,
    );
  }

  const fuzz = terrainFuzz(spec);
  console.log(
    `   Zufallsgelände 90 s: Blech im Berg kurz ${nf(fuzz.tiefstes, 3)} m, ` +
      `gehalten ${nf(fuzz.gehalten, 3)} m über ${nf(fuzz.laengsterLauf / 60, 2)} s  ` +
      `Abstand zum Boden max ${nf(fuzz.hoechsteAbweichung)} m  ` +
      `schlechtestes 4-s-Fenster mit Gas ${nf(fuzz.schlimmsterHalt)} m  ` +
      `${fuzz.kaputt ? '✗ NaN' : '✓ endlich'}`,
  );

  const kosten = stepCost(spec);
  console.log(
    `   Kosten je Schritt: ohne Kollision ${nf(kosten.without, 4)} ms, ` +
      `mit ${nf(kosten.withCollision, 4)} ms ` +
      `(+${nf(kosten.withCollision - kosten.without, 4)} ms)`,
  );
  console.log('');
}
