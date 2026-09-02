import type { Scene } from 'three';

import { CHECKPOINT_SLACK, DRIFT_YEN_PER_POINT, type RaceEvent } from '@/config/events.config';
import { ROAD_TYPES } from '@/config/roads.config';
import type { VehicleId } from '@/config/vehicles.config';
import type { AppBus } from '@/core/events';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import type { RoadNetwork } from '@/world/roads/RoadNetwork';
import type { TerrainSampler } from '@/world/TerrainSampler';
import { CheckpointGate } from './CheckpointGate';
import type { CollisionWorld } from './CollisionWorld';
import { DriftScore } from './DriftScore';
import { RivalField } from './RivalField';
import type { Vehicle } from './Vehicle';
import type { WaterField } from './WaterField';
import { RaceLine } from './ai/RaceLine';

/**
 * Der Rennleiter — P23.
 *
 * ## Was er tut
 *
 * Er ist der Zustandsautomat, der aus „ein Auto auf einer Karte" eine
 * **Veranstaltung** macht: aufstellen, herunterzählen, Kontrollpunkte zählen,
 * Platzierung führen, abrechnen. Alles, was ein Spieler an einem Rennen
 * wahrnimmt, entsteht hier oder wird von hier ausgelöst.
 *
 * ```
 *   idle ──start()──▶ countdown ──3 s──▶ running ──Ziel──▶ finished ──▶ idle
 *          ▲                                                              │
 *          └──────────────────── abort() ─────────────────────────────────┘
 * ```
 *
 * ## Warum der Fortschritt über die Bogenlänge läuft und nicht über Tore
 *
 * Der `LapTimer` aus P9.3 zählt Runden über Torüberquerungen — ein
 * Vorzeichenwechsel gegen die Torrichtung, mit Reihenfolgeprüfung. Das ist für
 * eine **Runde** die richtige Konstruktion und für ein **Rennen** die falsche:
 * ein Rennen braucht je Teilnehmer eine Zahl, die sich vergleichen lässt („wer
 * liegt vorn"), und die entsteht aus Toren erst, wenn man zwischen ihnen
 * interpoliert.
 *
 * Die Bogenlänge auf der Ideallinie ist diese Zahl, sie ist stetig, und die
 * Gegner führen sie ohnehin (`RivalDriver.arc`). Die Kontrollpunkte kommen
 * **zusätzlich** dazu — sie sind das, was eine Abkürzung verhindert, und der
 * Grund, warum man sie sieht.
 *
 * ## Warum die Kontrollpunkte Kreise sind und keine Tore
 *
 * Ein Tor ist eine Linie mit Richtung; wer sie von der falschen Seite kreuzt,
 * hat sie nicht passiert. Das ist korrekt und für einen Gelegenheitsspieler eine
 * Falle: an einer Kehre des Bergpasses liegen zwei Schenkel 10,8 m auseinander,
 * und ein Tor quer über den einen liegt fast über dem anderen.
 *
 * Ein Kreis um einen Punkt der Ideallinie hat das Problem nicht. Er ist
 * großzügig (`CHECKPOINT_SLACK`), er lässt sich anzeigen, und er beantwortet die
 * einzige Frage, die er beantworten muss: *war der Spieler dort*. Gegen
 * Abkürzungen genügt das, weil die Punkte **in Reihenfolge** fallen müssen.
 */

export type RaceState = 'idle' | 'countdown' | 'running' | 'finished';

export interface RaceStanding {
  readonly name: string;
  readonly progress: number;
  readonly isPlayer: boolean;
}

export interface RaceResult {
  readonly event: RaceEvent;
  /** Platz, 1-basiert. Bei Zeitfahren und Drift immer 1. */
  readonly place: number;
  readonly seconds: number;
  readonly driftScore: number;
  /** Verdientes Geld. */
  readonly yen: number;
  /** Gold / Silber / Bronze / keine — nur bei Zeitfahren. */
  readonly medal: 'gold' | 'silver' | 'bronze' | 'none';
  /** Bestzeit dieser Veranstaltung vorher — für „neue Bestzeit". */
  readonly best: number | null;
  readonly isBest: boolean;
}

/** Sekunden Countdown vor dem Start. */
const COUNTDOWN = 3.2;

/**
 * So weit darf ein Spieler vom Kontrollpunkt entfernt sein, ohne dass er als
 * verpasst gilt, in Metern.
 *
 * Wer daran vorbeifährt, bekommt ihn trotzdem, sobald er den **übernächsten**
 * erreicht — sonst steht ein Rennen still, weil jemand 20 m zu weit rechts war.
 * Das ist bewusst nachsichtig: die Reihenfolge bleibt gesichert (man muss den
 * übernächsten erreichen), aber ein einzelner verpasster Punkt beendet den Lauf
 * nicht.
 */
const SKIP_FORGIVE = true;

export class RaceDirector {
  readonly drift = new DriftScore();
  readonly rivals = new RivalField();

  #state: RaceState = 'idle';
  #event: RaceEvent | null = null;
  #line: RaceLine | null = null;
  #network: RoadNetwork | null = null;

  #timer = 0;
  #elapsed = 0;
  /** Bogenlängen der Kontrollpunkte, in Fahrtrichtung sortiert. */
  #checkpoints: number[] = [];
  #next = 0;
  #lap = 0;
  #playerArc = 0;
  #playerProgress = 0;
  #halfWidth = 6;
  #startArc = 0;
  #totalDistance = 0;

  readonly #gateNext = new CheckpointGate(0x63e0ff, 0.34);
  readonly #gateAfter = new CheckpointGate(0x63e0ff, 0.13);

  #bus: AppBus | null = null;

  attach(scene: Scene, bus: AppBus, atmosphere: AtmosphereUniforms): void {
    this.#bus = bus;
    this.rivals.attach(scene, atmosphere);
    this.#gateNext.addTo(scene);
    this.#gateAfter.addTo(scene);
  }

  setNetwork(network: RoadNetwork | null): void {
    this.#network = network;
  }

  get state(): RaceState {
    return this.#state;
  }

  get event(): RaceEvent | null {
    return this.#event;
  }

  get elapsed(): number {
    return this.#elapsed;
  }

  /** Sekunden bis zum Start, > 0 nur im Countdown. */
  get countdown(): number {
    return this.#state === 'countdown' ? Math.max(0, this.#timer) : 0;
  }

  get lap(): number {
    return this.#lap + 1;
  }

  /** Restliche Kontrollpunkte des laufenden Abschnitts. */
  get checkpointsLeft(): number {
    return this.#checkpoints.length - this.#next;
  }

  /** Luftlinie zum nächsten Kontrollpunkt, m. `-1` = keiner. */
  distanceToNext(x: number, z: number): number {
    const line = this.#line;
    if (!line || this.#state !== 'running') return -1;
    const arc = this.#checkpoints[this.#next];
    if (arc === undefined) return -1;
    line.pointAt(arc, POINT);
    return Math.hypot(POINT.x - x, POINT.z - z);
  }

  /**
   * Der nächste Kontrollpunkt als Weltpunkt — für Minikarte und Richtungspfeil.
   *
   * Getrennt von `distanceToNext`, obwohl beide dieselbe Stelle nachschlagen:
   * das eine ist eine Zahl fürs HUD, das andere ein Ort für die Karte. Eine
   * Funktion, die je nach Aufrufer das eine oder andere liefert, wäre die
   * Doppeldeutigkeit, an der in P22 die Bremse gescheitert ist.
   */
  nextCheckpointPoint(): { x: number; z: number } | null {
    const line = this.#line;
    if (!line || this.#state !== 'running') return null;
    const arc = this.#checkpoints[this.#next];
    if (arc === undefined) return null;
    line.pointAt(arc, POINT);
    return { x: POINT.x, z: POINT.z };
  }

  /**
   * Die Platzierung — Spieler und Gegner nach gefahrener Strecke.
   *
   * Sortiert wird über `progress` (Runde × Streckenlänge + Bogenlänge), also
   * über dieselbe Zahl für alle Teilnehmer. Genau dafür läuft der Fortschritt
   * über die Bogenlänge und nicht über Tore — siehe Kopf.
   */
  standings(playerName = 'YOU'): RaceStanding[] {
    const rows: RaceStanding[] = [
      { name: playerName, progress: this.#playerProgress, isPlayer: true },
    ];
    for (const r of this.rivals.standings) {
      rows.push({ name: r.name, progress: r.progress, isPlayer: false });
    }
    rows.sort((a, b) => b.progress - a.progress);
    return rows;
  }

  get place(): number {
    return this.standings().findIndex((row) => row.isPlayer) + 1;
  }

  /**
   * Eine Veranstaltung starten.
   *
   * Gibt Start-Position und -Richtung zurück; der Aufrufer setzt das
   * Spielerfahrzeug dorthin. **Nicht hier**, weil das Absetzen den
   * Straßenzusammenhang braucht und den kennt `DriveSystem` — der Rennleiter
   * kennt Strecken, keine Böden.
   */
  start(
    event: RaceEvent,
    playerVehicle: VehicleId,
    sampler: TerrainSampler,
    water: WaterField,
    collision: CollisionWorld,
  ): { x: number; z: number; heading: number } | null {
    const network = this.#network;
    if (!network) return null;
    const road = network.roads.find((r) => r.id === event.road);
    if (!road) return null;

    const line = RivalField.buildLine(network, event.road, event.rivalVehicle);
    if (!line) return null;
    // **Rückwärts heißt: die Linie umdrehen, nicht die Bogenlänge negieren.**
    // Die Ideallinie führt Tangenten, Krümmung und Zieltempo je Stützstelle; eine
    // rückwärts gelesene Bogenlänge hätte alle drei falsch herum, und der
    // KI-Fahrer führe seine Vorausschau in die Vergangenheit.
    this.#line = event.reverse
      ? RivalField.buildLine(reversed(network, event.road), event.road, event.rivalVehicle)
      : line;
    if (!this.#line) return null;

    this.#event = event;
    this.#halfWidth = ROAD_TYPES[road.type].width / 2;
    this.#startArc = 0;
    this.#buildCheckpoints(event);
    this.#totalDistance = this.#line.length * event.laps;

    this.#state = 'countdown';
    this.#timer = COUNTDOWN;
    this.#elapsed = 0;
    this.#next = 0;
    this.#lap = 0;
    this.#playerArc = 0;
    this.#playerProgress = 0;
    this.drift.reset();

    if (event.rivals > 0) {
      this.rivals.spawn(
        this.#line,
        this.#startArc,
        event.rivals,
        event.rivalVehicle,
        sampler,
        network,
        water,
        collision,
      );
    } else {
      this.rivals.clear();
    }

    // Der Spieler steht auf der Startlinie, leicht versetzt — die Gegner stehen
    // dahinter (`RivalField.spawn`).
    this.#line.pointAt(this.#startArc, POINT);
    const ti = this.#line.indexAt(this.#startArc);
    const tx = this.#line.tangent[ti * 2]!;
    const tz = this.#line.tangent[ti * 2 + 1]!;
    this.#refreshGates();
    this.#bus?.emit('race:state', { state: 'countdown', event: event.id });
    void playerVehicle;
    return { x: POINT.x, z: POINT.z, heading: Math.atan2(tx, tz) };
  }

  abort(): void {
    if (this.#state === 'idle') return;
    this.#state = 'idle';
    this.#event = null;
    this.#line = null;
    this.rivals.clear();
    this.#gateNext.hide();
    this.#gateAfter.hide();
    this.drift.bank();
    this.#bus?.emit('race:state', { state: 'idle', event: null });
  }

  /**
   * Ein fester Schritt.
   *
   * **Im festen Schritt und nicht im Frame**, aus demselben Grund wie beim
   * `LapTimer`: die Rennzeit ist die Summe der Zeitschritte und nicht die der
   * Uhr. Sonst hinge eine Bestzeit an der Bildrate, und ein Lauf im Prüfstand
   * (3600 Schritte in 50 ms) wäre 50 Millisekunden schnell.
   */
  step(dt: number, player: Vehicle, collision: CollisionWorld): void {
    if (this.#state === 'idle' || this.#state === 'finished') return;
    const line = this.#line;
    const event = this.#event;
    if (!line || !event) return;

    if (this.#state === 'countdown') {
      this.#timer -= dt;
      this.rivals.step(dt, 0, collision, false);
      if (this.#timer <= 0) {
        this.#state = 'running';
        this.#bus?.emit('race:state', { state: 'running', event: event.id });
      }
      return;
    }

    this.#elapsed += dt;

    // ── Fortschritt des Spielers ──────────────────────────────────────────
    //
    // Aufsummiert aus `delta()` und nicht aus „Runde × Länge + Bogenlänge" —
    // die Begründung samt der Messung, die den ersten Entwurf verworfen hat,
    // steht bei `RaceLine.delta()`. Kurz: an der Naht der geschlossenen Strecke
    // ist die Differenz zweier Bogenlängen nicht der gefahrene Weg.
    const found = line.nearestArc(player.position.x, player.position.z, this.#playerArc);
    this.#playerProgress += line.delta(this.#playerArc, found);
    this.#playerArc = found;

    // Eine Runde ist voll, wenn **alle** Kontrollpunkte gefallen sind und der
    // Wagen wieder über die Start-Ziel-Linie kommt. Ohne die erste Bedingung
    // wäre ein Bogen um die Startlinie herum eine Runde.
    if (line.closed && this.#next >= this.#checkpoints.length) {
      this.#lap++;
      this.#next = 0;
      this.#bus?.emit('race:lap', { lap: this.#lap, seconds: this.#elapsed });
      this.#refreshGates();
    }

    this.#checkPoint(player.position.x, player.position.z);
    this.rivals.step(dt, this.#playerProgress, collision, true);

    // ── Ziel ──────────────────────────────────────────────────────────────
    const done = line.closed
      ? this.#lap >= event.laps
      : this.#next >= this.#checkpoints.length && this.#playerArc > line.length - 25;
    if (done) this.#finish();
  }

  /** Meshes nachziehen — im variablen Schritt. */
  render(): void {
    this.rivals.render();
  }

  #checkPoint(x: number, z: number): void {
    const line = this.#line;
    if (!line) return;
    const reach = this.#halfWidth + CHECKPOINT_SLACK;
    for (let look = 0; look < (SKIP_FORGIVE ? 2 : 1); look++) {
      const index = this.#next + look;
      const arc = this.#checkpoints[index];
      if (arc === undefined) break;
      line.pointAt(arc, POINT);
      if (Math.hypot(POINT.x - x, POINT.z - z) <= reach) {
        this.#next = index + 1;
        this.#bus?.emit('race:checkpoint', {
          index: this.#next,
          total: this.#checkpoints.length,
        });
        this.#refreshGates();
        return;
      }
    }
  }

  #refreshGates(): void {
    const line = this.#line;
    if (!line) {
      this.#gateNext.hide();
      this.#gateAfter.hide();
      return;
    }
    this.#placeGate(this.#gateNext, this.#checkpoints[this.#next]);
    this.#placeGate(this.#gateAfter, this.#checkpoints[this.#next + 1]);
  }

  #placeGate(gate: CheckpointGate, arc: number | undefined): void {
    const line = this.#line;
    if (!line || arc === undefined) {
      gate.hide();
      return;
    }
    line.pointAt(arc, POINT);
    const i = line.indexAt(arc);
    gate.place(
      POINT.x,
      POINT.y,
      POINT.z,
      line.tangent[i * 2]!,
      line.tangent[i * 2 + 1]!,
      this.#halfWidth,
    );
  }

  #buildCheckpoints(event: RaceEvent): void {
    const line = this.#line;
    this.#checkpoints = [];
    if (!line) return;
    const count = Math.max(2, event.checkpoints);
    for (let i = 1; i <= count; i++) {
      // Der erste liegt nicht bei 0 (dort steht man), der letzte bei
      // Streckenende — bei geschlossenen Strecken ist das wieder der Start.
      this.#checkpoints.push((line.length * i) / count);
    }
    // Bei einer geschlossenen Strecke ist der letzte Punkt die Ziellinie selbst;
    // er würde bei arc = length liegen und nie fallen, weil `nearestArc` dort auf
    // 0 springt. Also ein Stück davor.
    if (line.closed) this.#checkpoints[this.#checkpoints.length - 1] = line.length - 20;
  }

  #finish(): void {
    const event = this.#event;
    if (!event) return;
    this.#state = 'finished';
    this.drift.bank();
    const place = event.rivals > 0 ? this.place : 1;
    const driftScore = Math.round(this.drift.total);
    const yen =
      (event.reward[Math.min(place, event.reward.length) - 1] ?? 0) +
      Math.round(driftScore * DRIFT_YEN_PER_POINT);
    this.#gateNext.hide();
    this.#gateAfter.hide();
    this.rivals.hide();
    this.#bus?.emit('race:finished', {
      event: event.id,
      place,
      seconds: this.#elapsed,
      driftScore,
      yen,
    });
  }

  /** Zurück in den Leerlauf, nachdem die Auswertung gelesen wurde. */
  clear(): void {
    this.#state = 'idle';
    this.#event = null;
    this.#line = null;
    this.rivals.clear();
    this.#bus?.emit('race:state', { state: 'idle', event: null });
  }

  dispose(): void {
    this.rivals.dispose();
    this.#gateNext.dispose();
    this.#gateAfter.dispose();
  }

  get totalDistance(): number {
    return this.#totalDistance;
  }

  get playerProgress(): number {
    return this.#playerProgress;
  }
}

const POINT = { x: 0, y: 0, z: 0 };

/**
 * Eine Strecke rückwärts — als **neues Netz mit umgedrehter Mittellinie**.
 *
 * Die naheliegende Abkürzung wäre gewesen, in `RaceLine` ein Vorzeichen zu
 * führen. Sie ist es nicht: die Linie rechnet Tangenten, Krümmung und Zieltempo
 * je Stützstelle, und ein Vorzeichen müsste an sechs Stellen richtig eingesetzt
 * werden. Eine umgedrehte Punktliste ist eine Zeile und danach überall richtig.
 *
 * Gebaut wird ein **flaches Hüllobjekt** und keine Kopie des ganzen Netzes: das
 * Gitter mit seinen 2500 Zellen wird nicht gebraucht, `buildLine` liest nur
 * `roads` und `getRacingLine`.
 */
function reversed(network: RoadNetwork, roadId: string): RoadNetwork {
  const road = network.roads.find((r) => r.id === roadId);
  const line = network.getRacingLine(roadId);
  if (!road || !line) return network;
  const n = line.length / 3;
  const flipped = new Float32Array(line.length);
  for (let i = 0; i < n; i++) {
    const j = n - 1 - i;
    flipped[i * 3] = line[j * 3]!;
    flipped[i * 3 + 1] = line[j * 3 + 1]!;
    flipped[i * 3 + 2] = line[j * 3 + 2]!;
  }
  return {
    roads: [{ ...road }],
    getRacingLine: (id: string) => (id === roadId ? flipped : null),
  } as unknown as RoadNetwork;
}
