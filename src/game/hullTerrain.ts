import type { Quaternion, Vector3 } from 'three';
import { GROUND_CONTACT } from '@/config/groundContact.config';

import { STEEP_NY, type FollowState } from './supportPlane';

/**
 * Chassis contact against terrain. Wheel support and this underside envelope
 * share the same driveable-slope limit (STEEP_NY).
 *
 * Driveable ground supports vertically; falling onto it must not turn vertical
 * landing speed into an abrupt horizontal brake. Scraping applies a bounded
 * deceleration from GROUND_CONTACT, proportional to penetration depth.
 *
 * Steep terrain rejects motion horizontally and never lifts the chassis. Each
 * wall contact blocks its inward velocity even when a deeper floor contact is
 * present. Authored ramps may redirect forward motion up their launch surface.
 * No terrain contact adds a yaw impulse.
 */

export interface HullGround {
  /** Constructed launch surface: may redirect motion up its continuous ramp. */
  isRamp?(x: number, z: number): boolean;
  height(x: number, z: number): number;
  normal(x: number, z: number, target: Vector3): Vector3;
  /** Belag. Eine **Fahrbahn** ist für die Karosserie kein Hindernis — siehe `istFahrbahn`. */
  surface(x: number, z: number): string;
}

/**
 * Ist dieser Belag eine **Fahrbahn**? — P21.
 *
 * `DriveSystem.surface()` liefert `'asphalt'` und `'kies'` für Straßen
 * (dort steht `#roadSurface`) und seit der Stadtplatten-Korrektur auch für
 * die Teerfläche des Distrikts — dieselbe gerechnete Fläche, nur ohne
 * Mittellinie. Alles andere ist `'wasser'` oder `'gelaende'`. Die Frage
 * „Fahrbahn?" ist damit genau diese Prüfung.
 *
 * > **Bis P21 stand hier `!== 'gelaende'`, und das war ein Fehler mit
 * > Zoneneffekt.** Die Begründung galt der Fahrbahn (eine gerechnete Fläche ist
 * > kein Hindernis, siehe unten) — die Bedingung traf zusätzlich das
 * > **Wasser**, und darunter liegen die Terrassen der Reisfelder. Deren Wände
 * > sind 2,4…2,8 m hoch; für die Karosserie gab es sie nicht.
 * >
 * > Gemessen bei (−881 | 129), Lastwagen mit Vollgas gegen eine solche Wand:
 * > **1,87 m Blech im Boden**, 1,0 m Weg in acht Sekunden. Der Zufallslauf hat
 * > es gefunden, weil er nach *Stellen* würfelt und nicht nach Fällen, die
 * > jemand schon kennt — dieselbe Begründung wie bei `terrainFuzz`.
 *
 * Dass die Wasser**fläche** selbst kein Hindernis wird, erledigt die Geometrie
 * von allein: die Räder liegen auf ihr (Auftriebsmodell in `applyWaterSurface`),
 * und das Blech steht `band[0]` darüber.
 */
function istFahrbahn(belag: string): boolean {
  return belag === 'asphalt' || belag === 'kies';
}

export interface HullResult {
  /** Zahl der Prüfpunkte im Gelände. */
  contacts: number;
  /** Tiefste Durchdringung **senkrecht zur Fläche**, in Metern. */
  depth: number;
}

/**
 * Wie hoch muss der Schwerpunkt liegen, damit das Blech frei ist? — P21.
 *
 * ## Der Fehler, den diese Funktion behebt
 *
 * Die Hülle aus P20 konnte **bremsen, aber nicht tragen**: ihr Deckel verbot
 * jeden Schub über die Standhöhe hinaus (aus gutem Grund — sonst hebt sie den
 * Wagen von seinen eigenen Rädern). Damit fehlte ihr aber die Hälfte der
 * Wirklichkeit. Ein Auto, das über eine Bodenwelle fährt, **steigt darüber**;
 * dieses pflügte hindurch und blieb stehen.
 *
 * Gemessen auf der echten Karte, 53 zufällige Stellen, Coupé, 7 s Vollgas:
 * **drei blieben liegen** — alle auf 11…14° Hang, also weit unter der
 * gerechneten Traktionsgrenze von 17,8°, ohne einen einzigen Hinderniskontakt,
 * dafür mit 0,21…0,35 m Blech im Boden. Das Gelände dort steigt und fällt um
 * 0,3…0,6 m je Meter — für einen Wagen mit 0,30 m Bodenfreiheit ein Hindernis,
 * über das er **fahren** können muss.
 *
 * ## Die Regel
 *
 * *Der Aufbau liegt auf dem Höchsten, was unter ihm ist* — den Reifen **oder**
 * dem Blech. Statt den Wagen von außen hochzuschieben (das hebt ihn von den
 * Rädern), hebt diese Funktion seine **Stützebene**: die Feder trägt ihn dann
 * selbst darüber, die Radlast bleibt erhalten, und die Reifen greifen weiter.
 *
 * Nur **befahrbare** Flächen zählen (`n_y ≥ STEEP_NY`). Eine Wand trägt nicht,
 * sie blockiert — darum kümmert sich `resolveHullTerrain`, und die beiden Zweige
 * teilen sich sauber an derselben Zahl, an der sich auch der Bodenfang teilt.
 *
 * Rückgabe ist die **Schwerpunktshöhe**, nicht die Stützebene: der Aufrufer
 * rechnet sie über `cgHeight / n_y` um und weiß als Einziger, wie schräg er
 * steht. `−Infinity`, wenn nichts trägt.
 */
export function hullSupport(
  x: number,
  y: number,
  z: number,
  quaternion: Quaternion,
  samples: Float64Array,
  ground: HullGround,
  p: Vector3,
  n: Vector3,
): number {
  let noetig = -Infinity;
  for (let i = 0; i < samples.length; i += 3) {
    p.set(samples[i]!, samples[i + 1]!, samples[i + 2]!).applyQuaternion(quaternion);
    const px = x + p.x;
    const pz = z + p.z;
    const ueber = ground.height(px, pz) - (y + p.y);
    // Keep near-touching support after positional resolution. Dropping it the
    // instant penetration reaches zero toggled spring load on/off at crests.
    if (ueber < -GROUND_CONTACT.supportSkin) continue;
    // Dieselbe Ausnahme wie bei der Auflösung: die Fahrbahn ist eine gerechnete
    // Fläche und kein Hindernis. Begründung dort.
    if (istFahrbahn(ground.surface(px, pz))) continue;
    ground.normal(px, pz, n);
    // Eine Wand trägt nicht. Sie blockiert, und das tut `resolveHullTerrain`.
    if (n.y < STEEP_NY) continue;
    const noetigHier = y + ueber;
    if (noetigHier > noetig) noetig = noetigHier;
  }
  return noetig;
}

const result: HullResult = { contacts: 0, depth: 0 };

/**
 * Die Karosserie aus dem Gelände schieben.
 *
 * `s` wird verändert (Ort **und** Geschwindigkeit). `p` und `n` sind Kratzplatz
 * des Aufrufers — diese Funktion allokiert nichts.
 */
export function resolveHullTerrain(
  s: FollowState,
  quaternion: Quaternion,
  samples: Float64Array,
  ground: HullGround,
  maxPush: number,
  ceiling: number,
  dt: number,
  p: Vector3,
  n: Vector3,
  supportFloor = true,
): HullResult {
  let pushX = 0;
  let pushY = 0;
  let pushZ = 0;
  let contacts = 0;
  let deepest = 0;
  // Deepest contact controls the single scrape term and authored ramp impulse.
  let hitNX = 0;
  let hitNY = 1;
  let hitNZ = 0;
  let hitRamp = false;

  for (let i = 0; i < samples.length; i += 3) {
    p.set(samples[i]!, samples[i + 1]!, samples[i + 2]!)
      .applyQuaternion(quaternion);
    const px = s.x + p.x;
    const py = s.y + p.y;
    const pz = s.z + p.z;
    const ueber = ground.height(px, pz) - py;
    if (ueber <= 0) continue;

    // ── Die Fahrbahn ist kein Hindernis — und das ist die Zeile, die ohne eine
    //    Messung auf der **echten Karte** gefehlt hätte ────────────────────
    //
    // Auf dem synthetischen Prüfstand war die Hülle nach der Reparatur sauber:
    // Hang 20…55°, Zufallsgelände, Klippenkante, alle grün. Auf der Karte blieb
    // der GT auf dem **Bergpass** nach 95 m stehen — auf Asphalt, mit null
    // Hinderniskontakten, bei Vollgas, für den Rest des Laufs. Gemessen bei
    // (−588 | −322), die elf Prüfpunkte der Karosserie:
    //
    // | quer | Fahrbahnhöhe |
    // |---:|---:|
    // | −0,98 m | 37,371 m |
    // | 0,00 m | 36,688 m |
    // | +0,98 m | 36,396 m |
    //
    // Also **0,98 m Verwindung auf 1,96 m Breite** — 26 % Querneigung, mitten
    // auf einer Straße mit 10,7 % Längsneigung. Der Wagen setzte dort mit 0,35 m
    // auf und kam nicht mehr weg.
    //
    // Diese Verwindung ist kein Fehler der Physik, sondern eine der **Karte**
    // (verwandt mit dem offenen Punkt aus P19: `measureStandingHeight` meldet auf
    // `toge` an einer Stelle 1804,7 cm). Sie zu erben wäre trotzdem falsch:
    //
    // > **Die Fahrbahn ist die Fläche, auf der gefahren werden *soll*.** Ihre
    // > Höhe ist keine gemessene Geländehöhe, sondern eine **gerechnete
    // > Mischung** aus Sampler und Mittellinie (`DriveSystem.height`, Kopf,
    // > Punkt 2) — dazu Plateaus und Wasserspiegel. Ein Blech, das gegen eine
    // > synthetisierte Fläche stößt, stößt gegen eine Rechnung.
    //
    // Die Räder fahren weiter darauf; nur die **Karosserie** ignoriert sie. Und
    // die Abfrage steht hinter `ueber > 0`, kostet im Normalfall also nichts:
    // wer nicht aufsitzt, fragt nie nach dem Belag.
    if (istFahrbahn(ground.surface(px, pz))) continue;

    ground.normal(px, pz, n);
    const nx = n.x;
    const ny = n.y;
    const nz = n.z;
    // Without reachable wheels, an underside must not hold the car over a
    // drop. Walls still collide with its body while it falls down the slope.
    if (!supportFloor && ny >= STEEP_NY) continue;
    // Abstand senkrecht zur Fläche. Bei einer waagerechten Fläche ist das die
    // Überdeckung selbst, bei einer geneigten weniger.
    const tief = ueber * ny;
    if (tief <= 1e-6) continue;

    contacts++;
    if (tief > deepest) {
      deepest = tief;
      hitNX = nx;
      hitNY = ny;
      hitNZ = nz;
      hitRamp = ground.isRamp?.(px, pz) === true;
    }

    // Driveable ground is carried by the support plane. A horizontal normal
    // correction here was a second, repeated brake on every slope entry.
    let dx = 0;
    let dy = 1;
    let dz = 0;
    let dn = ny;
    if (ny < STEEP_NY) {
      const horiz = Math.max(Math.hypot(nx, nz), 1e-4);
      dx = nx / horiz;
      dy = 0;
      dz = nz / horiz;
      dn = horiz;
      // Resolve every wall contact; the deepest contact can be a floor and
      // must not mask a rock touched by a different part of the chassis.
      const into = s.vx * dx + s.vz * dz;
      if (into < 0) {
        s.vx -= dx * into;
        s.vz -= dz * into;
      }
    }
    const dist = tief / dn;

    // Anrechnung des schon Erreichten — dieselbe Projektionsauflösung wie in
    // `Vehicle.#resolveCollision`. Zwei gleichgerichtete Punkte lösen einmal,
    // zwei rechtwinklige lösen beide voll.
    const schon = pushX * dx + pushY * dy + pushZ * dz;
    const fehlt = dist - schon;
    if (fehlt > 0) {
      pushX += dx * fehlt;
      pushY += dy * fehlt;
      pushZ += dz * fehlt;
    }
  }

  result.contacts = contacts;
  result.depth = deepest;
  if (contacts === 0) return result;

  // Deckel wie bei den Hindernissen: ein Wagen, der mit 70 m/s in eine Bergkante
  // fährt, darf nicht in einem Schritt durch den halben Berg geschoben werden.
  const len = Math.hypot(pushX, pushY, pushZ);
  if (len > maxPush) {
    const k = maxPush / len;
    pushX *= k;
    pushY *= k;
    pushZ *= k;
  }
  const vorher = s.y;
  s.x += pushX;
  s.y += pushY;
  s.z += pushZ;

  // ── Der Deckel: die Hülle darf den Wagen nicht von seinen eigenen Rädern
  //    heben ───────────────────────────────────────────────────────────────
  //
  // **Das ist die wichtigste Zeile dieser Datei**, und sie steht hier, weil ihr
  // Fehlen im ersten Entwurf einen Lastwagen dauerhaft in der Luft geparkt hat.
  //
  // Gemessen auf einer 15°-Rampe, Vollgas: Hüllkontakt an der Heckkante (8 mm
  // tief), der Schub hob den Aufbau **18 cm über seine Ruhelage** — damit war
  // `gap > springRest`, die Federung ausgefedert, `airborne = true`, die Radlast
  // null und die Antriebskraft null. Der Wagen fiel zurück auf die Kante, wurde
  // wieder gehoben, und stand nach 15 Sekunden noch immer bei z = 17,1 m mit
  // 0,0 km/h. Ein Grenzzyklus, den keine einzige Kennzahl als Fehler meldet:
  // Durchdringung 0, Kontakte 0, Standhöhe „nur" 18 cm daneben.
  //
  // Die Regel dahinter ist geometrisch und keine Abstimmung: **den Aufbau trägt
  // die Federung, nicht das Blech.** Über der normalen Standhöhe (`Stützebene +
  // cgHeight / n_y`) kann kein Bodenkontakt ihn heben — darüber entlastet er
  // seine eigenen Räder, und ein Hindernis unter dem Wagen *drückt* ihn nicht
  // höher, es *hält* ihn.
  //
  // Was dabei stehen bleibt, ist ein Rest Überdeckung — gemessen unter einem
  // Zentimeter, weil die statische Einfederung 20 bis 40 cm Luft nach oben
  // lässt. Erst wenn die auch aufgebraucht ist, sitzt der Wagen wirklich auf,
  // und **dann soll er auch aufsitzen**: das ist keine Fehlfunktion, sondern
  // eine Kuppe unter dem Bodenblech.
  //
  // > **Und der Deckel wirkt nur nach oben — auch das ist gemessen.** Die erste
  // > Fassung setzte `s.y = ceiling` unbedingt. Im Flug gibt es aber keine
  // > Stützebene: `axleSupport` liefert dann `expected − UNSUPPORTED_DROP`, der
  // > Deckel liegt 1,8 m **unter** dem Wagen, und jeder Hüllkontakt zog ihn um
  // > diesen Betrag nach unten. Gemessen im Prüfstand: drei von vier Fahrzeugen
  // > fielen an der 3-m-Klippenkante auf **y = −582 m** durch die Welt.
  // >
  // > Dieselbe Lehre wie bei `TIRE.tailGrip` (P17), dem Wandzweig (P19) und der
  // > `vy`-Klemme drei Zeilen weiter oben: **eine Klemme trifft beide
  // > Vorzeichen, wenn man sie nicht über ihre Richtung abgrenzt.**
  const grenze = Math.max(vorher, ceiling);
  if (s.y > grenze) s.y = grenze;

  // Floors never convert vertical landing velocity into horizontal braking.
  // Steep inward velocity was removed per contact above. Only an authored
  // launch surface redirects the full velocity toward its rising tangent.
  if (hitRamp && hitNY >= STEEP_NY && s.vy >= -1) {
    // Authored ramps transfer incoming motion to their launch tangent.
    const into = s.vx * hitNX + s.vy * hitNY + s.vz * hitNZ;
    if (into < 0) {
      s.vx -= hitNX * into;
      s.vy -= hitNY * into;
      s.vz -= hitNZ * into;
    }
  }

  // Aufsitzen bremst. Der Anteil **längs** der Fläche ist der, der nach dem
  // Abweisen übrig bleibt — auf ihn wirkt das schleifende Blech.
  //
  // **Mit der Tiefe skaliert, und das ist keine Feinheit.** Der Deckel oben
  // lässt einen Rest Überdeckung stehen; ohne die Skalierung liegt bei einem
  // 8-mm-Streifen dieselbe Bremse an wie beim vollen Aufsitzen. Gemessen mit
  // konstanter Rate: das Coupé kam über den Übergang einer 20°-Rampe nicht
  // hinaus — 0,2 km/h bei Vollgas, in 15 s viermal denselben Anlauf. Ein
  // Streifschuss darf sich anfühlen wie ein Streifschuss.
  // Bound scraping in m/s² instead of draining a fraction of all speed.
  const speed = Math.hypot(s.vx, s.vz);
  const loss = GROUND_CONTACT.scrapeDecel *
    Math.min(1, deepest / GROUND_CONTACT.scrapeFullDepth) * dt;
  const keep = speed > 0 ? Math.max(0, 1 - loss / speed) : 0;
  s.vx *= keep;
  s.vz *= keep;

  return result;
}
