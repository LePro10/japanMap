import type { Vector3 } from 'three';

import { WATER_PHYS } from '@/config/vehicle.config';
import { CITY, CITY_SLAB_Y, districtBlend, inCityDistrict } from '@/config/city.config';
import { ROAD_MESH, ROAD_TYPES } from '@/config/roads.config';
import type { RoadNetwork } from '@/world/roads/RoadNetwork';
import type { TerrainSampler } from '@/world/TerrainSampler';
import type { CollisionWorld } from './CollisionWorld';
import type { Ground, Surface } from './Vehicle';
import type { RampField } from './RampField';
import type { WaterField } from './WaterField';

/**
 * Der Boden, auf dem ein Fahrzeug fährt — herausgelöst aus `DriveSystem` in P23.
 *
 * ## Warum das eine eigene Klasse wurde
 *
 * Bis P22 war `DriveSystem` selbst der `Ground`. Das war richtig, solange es
 * **ein** Fahrzeug gab: der Straßenzusammenhang (`#roadHalfWidth`,
 * `#roadCorrection`, die Fahrbahnebene) wird je Schritt für *eine* Position
 * gebildet, und diese Position war die des Spielers.
 *
 * Mit den KI-Gegnern aus P23 gibt es vier Fahrzeuge an vier Orten. Ein
 * gemeinsamer Ground hieße: alle vier fahren auf der Fahrbahnebene, die am
 * **Spieler** gebildet wurde. In der Stadt (97 cm Plattenhöhe) wären das drei
 * Gegner, die einen Meter unter dem Asphalt fahren.
 *
 * Genau diese Falle steht seit P21 in CLAUDE.md, dort aus der anderen Richtung:
 *
 * > *`drive.surface()` von außen abgefragt lügt. Eine Abfrage, die einen
 * > zwischengespeicherten Kontext liest, ist an den Ort gebunden, für den der
 * > Kontext gebildet wurde.*
 *
 * Die Antwort darauf ist nicht, den Kontext je Abfrage neu zu bilden (das wären
 * 25 Straßensuchen je Schritt statt einer), sondern **je Fahrzeug einen
 * Kontext**. Das ist diese Klasse.
 *
 * ## Was sie nicht ist
 *
 * Sie ist kein zweiter Boden. Terrain, Wasserfeld und Kollisionswelt werden
 * **hereingereicht und geteilt** — alle Instanzen lesen dieselben Daten. Was je
 * Instanz existiert, sind die sechs Zahlen des Straßenzusammenhangs und die
 * nachgeführte Höhenkorrektur. Eine zweite Höhenquelle wäre genau der Fehler,
 * vor dem der Kopf von `DriveSystem` seit P14 warnt.
 */
export class RoadGround implements Ground {
  #sampler: TerrainSampler | null = null;
  #network: RoadNetwork | null = null;
  #water: WaterField | null = null;
  #collision: CollisionWorld | null = null;
  #ramps: RampField | null = null;

  /**
   * Straßentreffer an der Fahrzeugstelle, **einmal je Simulationsschritt**.
   *
   * `RoadNetwork.closestPoint()` legt ein Objekt an; vier Räder plus Karosserie
   * wären fünf davon je Schritt, also 300 je Sekunde. Die Breite und die
   * Belagsart ändern sich über 4 m Fahrzeuglänge nicht, also genügt eine
   * Abfrage — die *Entfernung* je Rad kommt danach aus
   * `distanceToNearestRoad()`, und die legt nichts an.
   */
  #halfWidth = 0;
  #surface: Surface = 'gelaende';
  #shoulder = 0;
  #correction = 0;
  #correctionTarget = 0;
  #hitX = 0;
  #hitZ = 0;
  #forwardX = 0;
  #forwardZ = 1;
  #slopeAlong = 0;
  #baseAtHit = 0;

  setSources(
    sampler: TerrainSampler | null,
    network: RoadNetwork | null,
    water: WaterField | null,
    collision: CollisionWorld | null,
  ): void {
    this.#sampler = sampler;
    this.#network = network;
    this.#water = water;
    this.#collision = collision;
  }

  /**
   * Die Schanzen — P24.
   *
   * Getrennt von `setSources`, weil sie nicht aus einem Ereignis kommen: sie
   * stehen in einer Konfigurationsdatei und sind ab dem ersten Frame da.
   */
  setRamps(ramps: RampField | null): void {
    this.#ramps = ramps;
  }

  get ready(): boolean {
    return this.#sampler !== null;
  }

  /** Halbe Fahrbahnbreite am zuletzt aufgefrischten Ort, 0 = keine Straße. */
  get roadHalfWidth(): number {
    return this.#halfWidth;
  }

  /** Belag der Straße am zuletzt aufgefrischten Ort. */
  get roadSurface(): Surface {
    return this.#surface;
  }

  /**
   * Den Straßenzusammenhang an einer Stelle neu bilden.
   *
   * `dt <= 0` heißt „sofort" — das braucht das Absetzen des Autos, denn dort
   * gibt es keine Vorgeschichte, an die man sich anschmiegen könnte.
   */
  refresh(x: number, z: number, dt: number): void {
    const network = this.#network;
    const sampler = this.#sampler;
    if (!network || !sampler) {
      this.#halfWidth = 0;
      this.#surface = 'gelaende';
      this.#correctionTarget = 0;
      this.#follow(dt);
      return;
    }
    const hit = network.closestPoint(x, z, 40);
    if (!hit) {
      this.#halfWidth = 0;
      this.#shoulder = 0;
      this.#surface = 'gelaende';
      this.#correctionTarget = 0;
      this.#follow(dt);
      return;
    }
    // **Gegen `#groundBase` und nicht gegen den rohen Sampler.** Die Korrektur
    // wird später auf genau diese Grundlage addiert; bildet man sie gegen eine
    // andere, wird die Differenz doppelt gezählt. Gemessen stand das Auto damit
    // in der Stadt **97,3 cm zu hoch** — exakt die Höhe der Stadtplatte, einmal
    // von der Platte und einmal von der Korrektur.
    //
    // Gedeckelt, weil ein Treffer 40 m entfernt an einem Steilhang eine
    // Korrektur von zig Metern ergäbe. 6 m ist mehr als der größte gemessene
    // Wert (4,30 m auf `zufahrt`) und weniger als jeder Betrag aus einem Fehler.
    this.#correctionTarget = clamp(
      hit.y + ROAD_MESH.surfaceOffset - this.#groundBase(hit.x, hit.z),
      -6,
      6,
    );
    // ── Die Fahrbahn als **Ebene**, nicht als Skalar — P21 ────────────────
    //
    // Bis P21 war die Fahrbahnhöhe `Gelände(x,z) + Korrektur`, mit einer
    // Korrektur, die am **Treffer** gebildet wurde und dann überall galt. Damit
    // erbt die Fahrbahn jede Verwindung des Geländes unter ihr. Gemessen über
    // 684 Punkte aller acht Strecken: Median 6 cm, aber 37 Punkte (5,4 %) über
    // 30 cm und im Maximum **1,66 m**, geballt in einer Kehre des Bergpasses —
    // dort blieb der GT stehen.
    //
    // Seitdem ist die Sollhöhe eine Ebene durch den Treffer mit der
    // Längsneigung des Segments. Die Verwindung quer ist damit per Konstruktion
    // null: die Fahrbahn ist flach, **weil sie als flach gerechnet wird**.
    this.#hitX = hit.x;
    this.#hitZ = hit.z;
    this.#forwardX = hit.forwardX;
    this.#forwardZ = hit.forwardZ;
    this.#slopeAlong = hit.slopeAlong;
    // Einmal je Schritt statt einmal je Höhenabfrage: `height()` läuft rund
    // 25-mal je Simulationsschritt, und ein Sampler-Aufruf ist der teuerste
    // Posten darin.
    this.#baseAtHit = this.#groundBase(hit.x, hit.z);
    this.#halfWidth = hit.width / 2;
    this.#shoulder = shoulderFor(hit.roadId, network);
    this.#surface = hit.surface === 'kies' ? 'kies' : 'asphalt';
    this.#follow(dt);
  }

  /**
   * Die Korrektur ihrem Ziel nachführen, mit begrenzter Rate.
   *
   * **An der Kreuzung Ring × Bergpass (−593, −318) springt die Korrektur in
   * einem einzigen Schritt um 1,36 m.** Dort laufen zwei Strecken auf
   * verschiedener Höhe zusammen, und `closestPoint()` wechselt beim Vorbeifahren
   * von der einen Mittellinie auf die andere. Für die Federung ist ein
   * Bodensprung von 1,36 m ein Rammbock: gemessen flog das Auto bei 49 km/h
   * **8 m hoch** und landete 60 m weiter im Hang.
   *
   * Ein Sprung der Korrektur ist ein Artefakt der Höhenquelle und keine
   * Geometrie — im Bild gibt es an der Kreuzung keine Stufe. Also darf er auch
   * nicht wie eine wirken. 3 m/s sind bei 60 Hz 5 cm je Schritt; der gemessene
   * Sprung ist damit nach 0,45 s abgebaut.
   */
  #follow(dt: number): void {
    if (dt <= 0) {
      this.#correction = this.#correctionTarget;
      return;
    }
    const step = CORRECTION_RATE * dt;
    this.#correction += clamp(this.#correctionTarget - this.#correction, -step, step);
  }

  /**
   * Gelände plus Stadtplatte — die Grundlage, auf die die Fahrbahnkorrektur kommt.
   *
   * `districtBlend` ist **dieselbe** Funktion, mit der der Baker den Distrikt
   * einebnet und der Straßengenerator die Stadtstraße auf Stadthöhe hebt. Sie
   * hier ein zweites Mal hinzuschreiben hieße, dass die Fahrbahn und der Boden,
   * auf dem das Auto steht, verschiedenen Rampen folgen.
   */
  #groundBase(x: number, z: number): number {
    const sampler = this.#sampler;
    if (!sampler) return 0;
    const y = sampler.getHeightAt(x, z);
    const district = districtBlend(x, z, CITY.ground.skirt);
    return district > 0 && CITY_SLAB_Y > y ? y + (CITY_SLAB_Y - y) * district : y;
  }

  height(x: number, z: number): number {
    if (!this.#sampler) return 0;
    let y = this.#groundBase(x, z);

    // ── Fahrbahn ──────────────────────────────────────────────────────────
    //
    // **Der Prüfwert ist die Breite und nicht die Korrektur.** Die Ebene trägt
    // seit P21 auch dann eine Neigung, wenn der Höhenversatz gerade null ist;
    // `correction !== 0` hätte sie in genau diesem Fall verworfen.
    if (this.#halfWidth > 0 && this.#network) {
      const distance = this.#network.distanceToNearestRoad(x, z, this.#halfWidth + 4);
      if (distance < Infinity) {
        // Volle Korrektur bis zur halben Fahrbahnbreite, dann über einen halben
        // Meter auslaufend.
        const fade = 1 - clamp01((distance - this.#halfWidth) / 0.5);
        const s = (x - this.#hitX) * this.#forwardX + (z - this.#hitZ) * this.#forwardZ;
        const soll = this.#baseAtHit + this.#correction + this.#slopeAlong * s;
        y += (soll - y) * fade;
      }
    }

    const plateau = this.#collision?.plateauTop(x, z) ?? -Infinity;
    if (plateau > y) y = plateau;

    // Wasserfläche — Meer, Fluss, Reisfeld. Hebt nur, wenn der Spiegel über dem
    // festen Boden liegt: eine Küstenstraße über dem Meer bleibt Straße.
    if (this.#water?.ready) {
      y = applyWaterSurface(y, this.#water.at(x, z, this.#groundBase(x, z)));
    }

    // ── Schanzen — P24 ────────────────────────────────────────────────────
    //
    // **Ganz zuletzt und als Maximum.** Eine Schanze liegt *auf* allem, was
    // darunter ist: Gelände, Fahrbahn, Bürgersteig, Wasserfläche. Und sie ist
    // eine **absolute** Fläche über ihrem Fundament, keine Auflage — die
    // Begründung samt der Messung, die den additiven Entwurf verworfen hat,
    // steht bei `RampField.prepare`.
    if (this.#ramps) {
      const ramp = this.#ramps.surfaceAt(x, z);
      if (ramp > y) y = ramp;
    }
    return y;
  }

  normal(x: number, z: number, target: Vector3): Vector3 {
    const sampler = this.#sampler;
    if (!sampler) return target.set(0, 1, 0);
    if (this.#water?.ready) {
      const water = this.#water.at(x, z, this.#groundBase(x, z));
      if (water.depth > WATER_PHYS.floatDepth) return target.set(0, 1, 0);
    }
    // **Die Gelände-Normale, auch auf einem Plateau.** Ein Bürgersteig ist
    // waagerecht, das Gelände darunter im Distrikt ebenfalls (der Baker ebnet
    // ihn ein) — der Unterschied ist auf dieser Karte nicht messbar.
    sampler.getNormalAt(x, z, target);
    // Und die Schanze darüber. Begründung samt der Messung, warum eine Schanze
    // ohne Neigung das Auto anhält, bei `RampField.gradient`.
    if (this.#ramps?.gradient(x, z, GRADIENT)) {
      // Aus dem Höhengradienten `(∂y/∂x, ∂y/∂z)` wird die Normale
      // `(−∂y/∂x, 1, −∂y/∂z)`, normiert. Sie ersetzt die Geländenormale, statt
      // sie zu drehen: auf einer Schanze *ist* die Schanze der Boden.
      const nx = -GRADIENT.x;
      const nz = -GRADIENT.z;
      const len = Math.hypot(nx, 1, nz);
      target.set(nx / len, 1 / len, nz / len);
    }
    return target;
  }

  surface(x: number, z: number): Surface {
    if (this.#halfWidth > 0 && this.#network) {
      const reach = this.#halfWidth + this.#shoulder;
      const distance = this.#network.distanceToNearestRoad(x, z, reach + 2);
      if (distance <= reach) return this.#surface;
    }
    if (this.#water?.ready && this.#sampler) {
      const depth = this.#water.at(x, z, this.#groundBase(x, z)).depth;
      if (depth > WATER_PHYS.wetThreshold) return 'wasser';
    }
    // ── Stadtplatte = Asphalt — und nur die Stadtplatte ──────────────────
    //
    // Die Bodenplatte trägt dasselbe `RoadMaterial` wie die Fahrbahn
    // (`CitySystem`, „nicht ein gleich aussehendes"). Das Straßennetz kennt
    // davon aber nur die eine `city`-Strecke; die Gassen zwischen den Blöcken
    // (5…20 m, `CITY.block.streetByDepth`) sind Lücken in der Bebauung auf
    // derselben Teerfläche. Wer dort neben der Strecke fuhr, bekam
    // `gelaende`: 0,70 Haftung, 0,22/s Dämpfung, Drift-Provokation ×1,35,
    // Staub statt Spur — obwohl das Bild Asphalt zeigt.
    //
    // Der Kasten ist `CITY_DISTRICT` (360 × 360 m), nicht die 800-m-Stadtzone
    // des Bakers. Außerhalb der Platte ist das Gelände Wiese, und die bleibt
    // Gelände. Der 24-m-Saum der Schürze auch: er ist der Übergang, nicht die
    // Stadt.
    if (inCityDistrict(x, z)) return 'asphalt';
    return 'gelaende';
  }

  waterDepth(x: number, z: number): number {
    if (!this.#water?.ready || !this.#sampler) return 0;
    return this.#water.at(x, z, this.#groundBase(x, z)).depth;
  }
}

/**
 * Wie schnell die Fahrbahnkorrektur ihrem Ziel folgen darf, in m/s.
 * Herleitung bei `#follow`.
 */
const CORRECTION_RATE = 3;

/** Bankettbreite der Strecke, zu der ein Treffer gehört. */
function shoulderFor(roadId: string, network: RoadNetwork): number {
  const road = network.roads.find((r) => r.id === roadId);
  return road ? ROAD_TYPES[road.type].shoulder : 0;
}

/**
 * Fester Boden gegen Wasserfläche. Hebt nur, wenn der Spiegel über dem Boden
 * liegt — eine Straße über dem Meer bleibt Straße. Tiefe unter `floatDepth`
 * blendet, damit die Strandkante keine Stufe ist.
 */
function applyWaterSurface(
  solidY: number,
  water: { depth: number; surfaceY: number; kind: string },
): number {
  if (water.kind === 'trocken' || water.depth <= WATER_PHYS.wetThreshold) return solidY;
  const floated = water.surfaceY - WATER_PHYS.draft;
  if (floated <= solidY) return solidY;
  if (water.depth >= WATER_PHYS.floatDepth) return floated;
  const t = water.depth / WATER_PHYS.floatDepth;
  const s = t * t * (3 - 2 * t);
  return solidY + (floated - solidY) * s;
}

/** Ablage für den Schanzengradienten — einmal angelegt, wie überall hier. */
const GRADIENT = { x: 0, z: 0 };

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
