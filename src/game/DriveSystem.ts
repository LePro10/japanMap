import {
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';

import { PROP_COLLIDERS } from '@/config/vehicle.config';
import { DEFAULT_VEHICLE, vehicleSpec, type VehicleId } from '@/config/vehicles.config';
import {
  WALK_ALIGHT_GAP,
  WALK_BOARD_RANGE,
  rollWalkSpawn,
  type WalkSpawn,
} from '@/config/walker.config';
import type { PropPlacement } from '@/config/props.config';
import { CAMERA } from '@/config/world.config';
import type { FlyInputDelegate } from '@/camera/FreeFlyController';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { PropMaterial } from '@/world/materials/PropMaterial';
import { railPolylines, RAIL } from '@/world/roads/GuardrailBuilder';
import type { RoadNetwork } from '@/world/roads/RoadNetwork';
import type { RaceEvent } from '@/config/events.config';
import type { TerrainSampler } from '@/world/TerrainSampler';
import type { CityCollider, CityCurb } from '@/world/city/CityGenerator';
import { NavigationMap } from '@/ui/NavigationMap';
import { createCarBody, createCarWheel } from './carMesh';
import { ChaseCamera } from './ChaseCamera';
import {
  TREE_QUERY_CAP,
  TREE_QUERY_RADIUS,
  type BreakEvent,
} from './breakables';
import { CollisionWorld } from './CollisionWorld';
import { RoadGround } from './RoadGround';
import { RaceDirector } from './RaceDirector';
import { RampField } from './RampField';
import { PICKUPS } from '@/config/stunt.config';
import type { StuntSystem } from '@/world/stunt/StuntSystem';
import { DebrisFx } from './DebrisFx';
import { LapTimer } from './LapTimer';
import { Vehicle, type DriveInput, type Ground, type Surface } from './Vehicle';
import { VehicleFx } from './VehicleFx';
import { Walker, type WalkInput } from './Walker';
import { WalkCamera } from './WalkCamera';
import { createWalkerRig, type WalkerRig } from './walkerMesh';
import { WaterField } from './WaterField';
import { WaypointMarker } from './WaypointMarker';
import type { CanopyHit, CanopySource } from '@/world/scatter/ScatterSystem';

/**
 * So lange darf ein Fahrer drücken, ohne von der Stelle zu kommen, in Sekunden.
 *
 * Fünf. Lang genug, dass niemand aus Versehen gerettet wird, der gerade an einer
 * Mauer rangiert oder mit dem Fuß auf der Bremse steht; kurz genug, dass das
 * Steckenbleiben nicht zum Ereignis wird. Gemessen am Tempelaufgang aus P19.6
 * kam ein Spieler durch Wippen in **15 s** frei — wer nach fünf noch steht, hat
 * es dreimal versucht.
 */
const RESCUE_DELAY = 5;

/**
 * So weit muss er dabei kommen, damit es kein Steckenbleiben ist, in Metern.
 *
 * Drei. Die Zahl trennt „festgefahren" von „rangiert": am Tempelaufgang legte
 * das eingeklemmte Coupé in fünf Sekunden Vollgas **0,15 m** zurück, mit Wippen
 * über 15 s dann 4,54 m. Wer in fünf Sekunden drei Meter schafft, fährt.
 */
const RESCUE_FREE = 3;

/**
 * Der Fahrmodus — PLAN.md P14.
 *
 * ## Was dieses System zusammenhält
 *
 * | Teil | wo |
 * |---|---|
 * | Fahrmodell (Kräfte, Gieren, Federung) | `Vehicle` |
 * | Hindernisse | `CollisionWorld` |
 * | Kamera | `ChaseCamera` |
 * | Zahlen | `vehicle.config.ts` |
 * | Eingabe, Moduswechsel, Szene, Messwerte | hier |
 *
 * ## Der Boden, auf dem gefahren wird
 *
 * `Ground.height()` ist die heikelste Zeile des ganzen Systems, und der Grund
 * steht in CLAUDE.md zweimal als Fehlerquelle: **es gibt zwei Höhenquellen.** Der
 * `TerrainSampler` (bilinear aus dem Höhenfeld) und das gerenderte CDLOD-Gitter
 * (Sehne zwischen Stützstellen) sind nicht identisch. PLAN.md 9.1 legt fest:
 * gefahren wird auf dem Sampler.
 *
 * Dazu kommen drei Korrekturen, und **jede einzelne stammt aus der Messung in
 * `debug/driveProbe.ts`, nicht aus einer Annahme.** Die erste Fassung dieses
 * Systems hatte nur die erste; die anderen beiden hat der Messlauf gefunden.
 *
 *  1. **Die Fahrbahn liegt über dem eingeebneten Gelände.** Um 6 cm
 *     (`ROAD_MESH.surfaceOffset`, seit P3 — sonst streiten Straße und Terrain im
 *     Tiefenpuffer um jedes Pixel) — *auf sechs von acht Strecken*. Auf den
 *     anderen zweien nicht, siehe Punkt 2. Ein Auto auf der reinen Sampler-Höhe
 *     fährt also mindestens 6 cm tief im Asphalt; bei 31 cm Radradius ist das
 *     ein Fünftel des Rades.
 *
 *  2. **Auf zwei Strecken liegt die Fahrbahn viel weiter über dem Gelände.**
 *     Gemessen (Median der Differenz Sampler − Mittellinie, 1000 Proben je
 *     Strecke, 2026-08-18):
 *
 *     | Strecke | Median | größter Ausreißer |
 *     |---|---|---|
 *     | ring, toge, dorf, sando, feldpfad, kuestenpfad | 0,12…0,30 cm | 84 cm (Kreuzung ring × toge) |
 *     | **stadt** | **94,30 cm** | 94,30 cm (konstant) |
 *     | **zufahrt** | **224,47 cm** | 429,70 cm |
 *
 *     Die Ursache ist die Stadtplatte: der Baker ebnet den Distrikt auf 28,997 m
 *     ein (14 641 Proben, 14 632 davon exakt auf diesem Wert), die Stadtstraße
 *     liegt per Konstruktion auf `CITY_ROAD_LEVEL` = 29,94 m. Die 97 cm dazwischen
 *     verdeckt im Bild die Schürze der Platte. Ein Auto auf der Sampler-Höhe
 *     führe in der Stadt **bis zur Fensterlinie im Asphalt**.
 *
 *     Deshalb fährt das Auto auf einer Straße nicht auf dem Sampler, sondern auf
 *     der **Mittellinie aus `roads.json`** — genauer: auf dem Sampler plus einer
 *     Korrektur, die je Schritt aus beiden gebildet wird. Auf den sechs
 *     unauffälligen Strecken ist diese Korrektur 1…3 mm groß und damit
 *     wirkungslos; sie ist also kein Sonderweg für die Stadt, sondern derselbe
 *     Weg für alle.
 *
 *  3. **Erhöhte Flächen.** Bürgersteige stehen 15 cm über der Stadtplatte
 *     (Plateaus in der `CollisionWorld`), und die Platte selbst 97 cm über dem
 *     Gelände — mit einer 24 m breiten Schürze als Rampe. Ohne sie wäre die Fahrt
 *     neben der Stadtstraße eine Fahrt unter dem sichtbaren Boden.
 *
 * Alle drei werden über ihre Kante **geblendet** und nicht geschaltet: ein
 * `isOnRoad`-Sprung wäre eine Stufe rund um jede Straße der Karte, über die das
 * Auto bei jeder Ausfahrt springt.
 */
export class DriveSystem implements System, FlyInputDelegate, Ground {
  readonly name = 'DriveSystem';

  readonly vehicle = new Vehicle();
  /** Rundenzählung auf den Toren aus P8.11 — P9.3. */
  readonly laps = new LapTimer();
  readonly camera = new ChaseCamera();
  readonly walker = new Walker();
  readonly walkCamera = new WalkCamera();
  /**
   * Der Rennleiter — P23.
   *
   * **Hier und nicht als eigenes System in `main.ts`**, und das hat einen
   * Grund, den die Reihenfolge sonst kaputt macht: er braucht den festen
   * Schritt *nach* der Fahrphysik (sein Fortschritt liest die Position nach der
   * Integration, wie der `LapTimer` seit P9.3), er braucht dieselbe
   * Kollisionswelt, und er setzt beim Start das Fahrzeug ab. Als eigenes System
   * wären das drei Verweise zurück auf dieses hier.
   */
  readonly race = new RaceDirector();
  /**
   * Die Schanzen — P24.
   *
   * Sie gehören zum **Boden** und nicht zur Szene: `RoadGround` addiert ihre
   * Auflage, und das Mesh im `StuntSystem` entsteht aus derselben Funktion.
   * Angelegt wird sie hier, weil hier der Boden wohnt.
   */
  readonly ramps = new RampField();
  #stunt: StuntSystem | null = null;
  readonly collision = new CollisionWorld();
  readonly #water = new WaterField();
  #fx: VehicleFx | null = null;
  #debris: DebrisFx | null = null;
  #canopy: CanopySource | null = null;
  readonly #treeBuf: CanopyHit[] = Array.from({ length: TREE_QUERY_CAP }, () => ({
    x: 0,
    y: 0,
    z: 0,
    radius: 0,
    height: 0,
    key: 0,
  }));
  #wake: WakeSink | null = null;
  #navigation: NavigationMap | null = null;
  readonly #waypoint = new WaypointMarker();
  #canTeleport: () => boolean = () => false;

  #context: EngineContext | null = null;
  #sampler: TerrainSampler | null = null;
  #network: RoadNetwork | null = null;
  #active = false;
  #walking = false;
  #rig: WalkerRig | null = null;
  #playStarted = false;
  #spawn: WalkSpawn | null = null;

  #group: Group | null = null;
  #body: Mesh | null = null;
  #wheels: InstancedMesh | null = null;
  #material: PropMaterial | null = null;
  /**
   * Die Geometrien **des gerade gebauten Fahrzeugs**, nicht aller.
   *
   * Bis P17 wuchs die Liste nur, weil es nichts zu wechseln gab. Mit vier
   * Fahrzeugen wäre ein Wechsel sonst ein Leck: jedes Umschalten legte zwei neue
   * `BufferGeometry` an, und die alten blieben bis `dispose()` auf der GPU. Wer
   * zehnmal durchschaltet, hätte zwanzig tote Puffer.
   */
  readonly #geometries: BufferGeometry[] = [];
  #vehicleId: VehicleId = DEFAULT_VEHICLE;

  /** Rohdaten der Hindernisse. Gesammelt, bis der Sampler da ist — siehe `#rebuild`. */
  #cityColliders: readonly CityCollider[] = [];
  #cityCurbs: readonly CityCurb[] = [];
  #propPlacements: readonly PropPlacement[] = [];
  #railsBuilt = false;

  /** Gedrückte Tasten. Wie im `FreeFlyController` über `event.code`. */
  readonly #keys = new Set<string>();
  /** Achsen aus der Fingersteuerung, weitergeleitet vom `FreeFlyController`. */
  readonly #axes = { forward: 0, right: 0 };
  /** Handbremsknopf der Fingersteuerung — siehe `setTouchHandbrake()`. */
  #touchHandbrake = false;
  /** Sprung aus der Fingersteuerung — zu Fuß die Entsprechung der Leertaste. */
  #touchJump = false;
  /** Eingabe aus einem Messlauf. Gesetzt = Tastatur und Finger sind stumm. */
  #scripted: DriveInput | null = null;

  readonly #input: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  readonly #walkInput: WalkInput = { forward: 0, right: 0, jump: false, sprint: false };

  /** Flugpose beim Einsteigen — beim Aussteigen wird genau sie wiederhergestellt. */
  readonly #flyPosition = new Vector3();
  readonly #flyForward = new Vector3();

  readonly #matrix = new Matrix4();
  readonly #wheelQuat = new Quaternion();
  readonly #spinQuat = new Quaternion();
  readonly #steerQuat = new Quaternion();
  readonly #wheelAxis = new Vector3(1, 0, 0);
  readonly #yAxis = new Vector3(0, 1, 0);
  readonly #scale = new Vector3(1, 1, 1);
  readonly #scratch = new Vector3();

  /**
   * Der Boden — seit P23 eine eigene Klasse.
   *
   * Bis P22 stand der Straßenzusammenhang als sechs Felder hier, und dieses
   * System *war* der `Ground`. Mit den KI-Gegnern gibt es vier Fahrzeuge an vier
   * Orten, und ein gemeinsamer Kontext hieße: alle vier fahren auf der
   * Fahrbahnebene, die am **Spieler** gebildet wurde. Begründung samt der
   * Messung, die dahintersteht, im Kopf von `RoadGround`.
   */
  readonly ground = new RoadGround();

  #stepMs = 0;
  /** Die Klemmwache — P20. Begründung bei `#watchStuck`. */
  #stuckTime = 0;
  #stuckX = 0;
  #stuckZ = 0;

  readonly #readouts = {
    modus: 'Freiflug',
    tempo: '—',
    schwimmwinkel: '—',
    schraeglauf: '—',
    durchdrehen: '—',
    belag: '—',
    federweg: '—',
    kollision: '—',
    kontakt: '—',
    aufwand: '—',
    fahrzeug: '—',
    ansicht: 'Verfolger',
    wasser: '—',
    spuren: '—',
  };

  /**
   * `fly` wird **hereingereicht und nicht gesucht**.
   *
   * `EngineContext` ist bewusst schmal („alles, was ein System darüber hinaus
   * braucht, läuft über den EventBus"), und ein Verzeichnis aller Systeme gibt es
   * dort nicht. Der Fahrmodus braucht aber keine *Nachricht*, sondern eine
   * *Umschaltung* — er muss dem Freiflug die Kamera abnehmen und sie später
   * zurückgeben, und das ist ein Aufruf und kein Ereignis. Verdrahtet wird in
   * `main.ts`, wo auch `PlayerUi` und `PlanarReflection` ihre Gegenstücke
   * bekommen.
   */
  constructor(
    private readonly atmosphere: AtmosphereUniforms,
    private readonly fly: FlyController,
  ) {}

  get active(): boolean {
    return this.#active;
  }

  /** Zu Fuß — der Zustand nach Play und nach dem Aussteigen. */
  get walking(): boolean {
    return this.#walking;
  }

  /** Der gewürfelte Start der Sitzung — für den Prüfstand. */
  get spawn(): WalkSpawn | null {
    return this.#spawn;
  }

  /** Zahl der eingetragenen Hindernisse — für die Abnahme. */
  get colliderCount(): number {
    return this.collision.count;
  }

  /** CPU-Kosten eines Simulationsschritts in Millisekunden (gleitendes Mittel). */
  get stepMs(): number {
    return this.#stepMs;
  }

  /**
   * Kielwelle in die Wassershader schreiben. Hereingereicht aus `main.ts`,
   * weil DriveSystem das WaterSystem nicht importiert — dieselbe Regel wie
   * beim Freiflug.
   */
  setWake(wake: WakeSink | null): void {
    this.#wake = wake;
  }

  /**
   * Bäume der Streuung — hereingereicht aus `main.ts`, weil DriveSystem das
   * ScatterSystem nicht importiert. Dieselbe Regel wie beim Freiflug.
   */
  setCanopy(source: CanopySource | null): void {
    this.#canopy = source;
  }

  /**
   * Die Quellen, auf denen gefahren wird — für den Messstand.
   *
   * Absichtlich **dieselben Objekte** und keine Kopien: ein Prüfstand, der gegen
   * ein anders geladenes Höhenfeld misst, misst etwas anderes als das Spiel.
   * Dieselbe Begründung steht bei `TerrainSampler.fromRaw` für den Streu-Worker.
   */
  get terrain(): TerrainSampler | null {
    return this.#sampler;
  }

  get roads(): RoadNetwork | null {
    return this.#network;
  }

  init(context: EngineContext): void {
    this.#context = context;

    context.bus.on('terrain:ready', ({ sampler }) => {
      this.#sampler = sampler;
      // Die Schanzen brauchen ihre Fußhöhen, und zwar **bevor** jemand darauf
      // fährt. Begründung bei `RampField.prepare`.
      this.ramps.prepare((x, z) => sampler.getHeightAt(x, z));
      this.#syncGround();
      this.#rebuild();
    });
    context.bus.on('roads:ready', ({ network }) => {
      this.#network = network;
      this.#navigation?.setRoads(network.file.roads);
      this.race.setNetwork(network);
      // Die Tore des Rings — P9.3. Der Ring ist die einzige geschlossene
      // Strecke der Karte; auf einer Stichstraße wie dem Bergpass gibt es keine
      // Runde, sondern eine Fahrt. `setRoad()` lässt sich später auf jede
      // Strecke umstellen, die Voreinstellung ist die, die eine Runde hat.
      this.laps.setRoad(network, 'ring');
      this.#syncGround();
      this.#rebuild();
    });
    context.bus.on('city:ready', ({ colliders, curbs }) => {
      this.#cityColliders = colliders;
      this.#cityCurbs = curbs;
      this.#rebuild();
    });
    context.bus.on('props:ready', ({ placements }) => {
      this.#propPlacements = placements;
      this.#rebuild();
    });

    this.#build(context);

    // Spielerkarte — DOM/Canvas neben der 3D-Welt. Eine zweite Three-Kamera
    // würde Gelände, LOD und Vegetation ein zweites Mal bezahlen. Der
    // Weltmarker ist ein Mesh und damit genau die Draw-Calls, solange ein
    // Waypoint steht.
    this.#waypoint.attach(context);
    const canvas = document.querySelector<HTMLCanvasElement>('#viewport');
    const overlay = document.querySelector<HTMLElement>('#overlay');
    if (canvas && overlay) {
      this.#navigation = new NavigationMap({
        canvas,
        container: overlay,
        isActive: () => this.#walking || this.#active,
        getPose: () =>
          this.#walking
            ? { x: this.walker.position.x, z: this.walker.position.z, yaw: this.walker.yaw }
            : { x: this.vehicle.position.x, z: this.vehicle.position.z, yaw: this.vehicle.yaw },
        teleport: (x, z) => {
          this.teleportTo(x, z);
        },
        canTeleport: () => this.#canTeleport(),
        setWaypoint: (x, z) => {
          const sampler = this.#sampler;
          if (!sampler) return;
          this.#waypoint.set(x, z, sampler.getHeightAt(x, z));
        },
        getWaypoint: () => this.#waypoint.waypoint,
        onOpen: () => {
          this.#keys.clear();
          this.#axes.forward = 0;
          this.#axes.right = 0;
          this.#touchHandbrake = false;
          this.#touchJump = false;
          context.bus.emit('map:open');
        },
        onClose: (resume) => {
          context.bus.emit('map:close', { resume });
        },
      });
      if (this.#network) this.#navigation.setRoads(this.#network.file.roads);
    }

    const fx = new VehicleFx();
    fx.attach(context);
    this.#fx = fx;
    const debris = new DebrisFx();
    debris.attach(context);
    this.#debris = debris;
    this.race.attach(context.scene, context.bus, this.atmosphere);
    context.bus.on('quality:changed', ({ level }) => {
      fx.setQuality(level);
    });
    void this.#water.load(context.resources).then(() => {
      this.#syncGround();
    });
    this.#syncGround();

    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keyup', this.#onKeyUp);
    window.addEventListener('blur', this.#onBlur);

    this.#registerDebug(context);
  }

  /**
   * Die geteilten Quellen an den Boden reichen.
   *
   * **An einer Stelle und nicht an vieren.** Die vier Ereignisse kommen in einer
   * Reihenfolge, die in `main.ts` steht und dort geändert werden kann; ein
   * System, das auf „das dritte Ereignis" baut, ist beim nächsten Umsortieren
   * still kaputt. Dieselbe Begründung wie bei `#rebuild`.
   */
  #syncGround(): void {
    this.ground.setSources(this.#sampler, this.#network, this.#water, this.collision);
    this.ground.setRamps(this.ramps);
  }

  /**
   * Das Stunt-System hereinreichen — Sammelstücke und Driftzonen.
   *
   * Wie `setCanopy` und `setWake`: `DriveSystem` importiert kein Weltsystem, und
   * die Verdrahtung steht in `main.ts`. Der Unterschied zu einem Ereignis ist
   * derselbe wie beim Freiflug — hier wird nichts gemeldet, sondern gefragt.
   */
  setStunt(stunt: StuntSystem | null): void {
    this.#stunt = stunt;
  }

  /**
   * Ob der Karten-Teleport frei ist. Hereingereicht aus `main.ts`, weil
   * `DriveSystem` das Profil nicht importiert — dieselbe Regel wie beim
   * Freiflug. Der Sandkasten (`og123`) ist die eine Frage; Waypoints bleiben
   * frei, Teleport nicht.
   */
  setCanTeleport(query: () => boolean): void {
    this.#canTeleport = query;
  }

  /** Vollkarte öffnen — Taste `M` und Klick auf die HUD-Minikarte. */
  openMap(): void {
    const mouseLike = !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    this.#navigation?.openMap(mouseLike);
  }

  get mapOpen(): boolean {
    return this.#navigation?.open ?? false;
  }

  get waypoint(): { readonly x: number; readonly z: number } | null {
    return this.#waypoint.waypoint;
  }

  #build(context: EngineContext): void {
    const group = new Group();
    group.name = 'Fahrzeug';
    // Unsichtbar, solange geflogen wird. Der Wagen wird dann auch **nicht
    // simuliert** — der Fahrmodus kostet im Freiflug null Draw-Calls und null
    // CPU, und das ist die Bedingung dafür, dass alle Messungen aus P7 bis P13
    // ohne Sternchen weitergelten.
    group.visible = false;
    this.#group = group;

    const material = new PropMaterial(this.atmosphere);
    material.name = 'FahrzeugMaterial';
    // Lack ist glatter als Putz und Fels. Eine eigene Instanz und nicht das
    // Prop-Material selbst: dieselbe Instanz hieße glänzende Bauernhäuser.
    material.roughness = 0.42;
    material.metalness = 0.15;
    this.#material = material;

    const body = new Mesh(undefined, material);
    body.name = 'Fahrzeug:Karosserie';
    body.matrixAutoUpdate = false;
    this.#body = body;
    group.add(body);

    const wheels = new InstancedMesh(undefined, material, 4);
    wheels.name = 'Fahrzeug:Räder';
    wheels.matrixAutoUpdate = false;
    // Vier Räder in einem Draw-Call, jedes mit eigener Matrix (Lenkeinschlag
    // vorn, Raddrehung überall). Frustum-Culling aus: die Hüllkugel des
    // `InstancedMesh` wird nie aktualisiert, weil die Instanzmatrizen jeden Frame
    // wechseln — mit Culling verschwinden die Räder, sobald die Kamera an den
    // Rand des Startvolumens kommt.
    wheels.frustumCulled = false;
    this.#wheels = wheels;
    group.add(wheels);

    // Die Geometrie kommt erst hier — **die beiden Meshes bleiben über einen
    // Fahrzeugwechsel hinweg dieselben Objekte**, nur ihre Geometrie wird
    // getauscht. Neu angelegte Meshes müssten aus der Szene genommen und wieder
    // eingehängt werden, und jeder, der sich einen Verweis gemerkt hat (die
    // Ausschlussliste der planaren Spiegelung tut genau das), hielte danach den
    // alten.
    this.#applyVehicleGeometry();

    context.scene.add(group);

    const rig = createWalkerRig(material);
    rig.group.visible = false;
    context.scene.add(rig.group);
    this.#rig = rig;
  }

  /**
   * Die Kollisionswelt aus allen vorliegenden Quellen neu aufbauen.
   *
   * **Neu und nicht ergänzend**, und aus demselben Grund wie bei `CitySystem`: die
   * vier Ereignisse kommen in einer Reihenfolge, die in `main.ts` steht und dort
   * geändert werden kann. Ein System, das auf „das dritte Ereignis" baut, ist beim
   * nächsten Umsortieren still kaputt.
   *
   * Die Props brauchen den Sampler (ihre Grundhöhe), also läuft der Aufbau, sobald
   * er da ist, und danach bei jeder neuen Quelle noch einmal. Gemessen kostet ein
   * voller Aufbau wenige Millisekunden und passiert höchstens vier Mal.
   */
  /** Welches Fahrzeug gerade gefahren wird. */
  get vehicleId(): VehicleId {
    return this.#vehicleId;
  }

  /**
   * Fahrzeug wechseln.
   *
   * Die Reihenfolge ist verbindlich und nicht bloß hübsch:
   *
   *  1. **Spec setzen**, denn alles Folgende hängt daran;
   *  2. **Geometrie tauschen**, weil sie aus der Spec gerechnet wird;
   *  3. **Absetzen** — und zwar zwingend. Federruhelage, Radanschläge und
   *     Schwerpunkthöhe sind andere geworden. Ein Lastwagen, der die Höhe des
   *     Coupés behält, steht 58 cm im Boden, und der erste Simulationsschritt
   *     schießt ihn heraus. `Vehicle.setSpec()` setzt ausdrücklich **keinen**
   *     Zustand zurück, damit diese Stelle die einzige ist, die es tut.
   *
   * Der Wagen bleibt stehen, wo er stand — gewechselt wird meist aus dem Menü
   * heraus, und dann will niemand plötzlich am anderen Ende der Karte sein.
   */
  setVehicle(id: VehicleId): void {
    if (id === this.#vehicleId) return;
    this.#vehicleId = id;
    this.vehicle.setSpec(vehicleSpec(id));
    this.#applyVehicleGeometry();
    if (this.#sampler) {
      this.placeAt(this.vehicle.position.x, this.vehicle.position.z, this.vehicle.yaw);
      this.camera.reset(this.vehicle);
    }
    this.#fx?.reset();
    this.#readouts.fahrzeug = this.vehicle.spec.name;
    this.#context?.bus.emit('drive:vehicle', { id });
    this.#context?.debug?.refresh();
  }

  /**
   * Karosserie und Rad aus der aktuellen Spec rechnen und die alten freigeben.
   *
   * **Die alten werden weggeworfen und nicht aufgehoben.** Ein Zwischenspeicher
   * über alle vier Fahrzeuge wäre schneller (die Rechnung kostet gemessen unter
   * einer Millisekunde) und hielte dafür dauerhaft acht Puffer auf der GPU, von
   * denen sechs niemand ansieht. Bei ~350 Dreiecken je Fahrzeug ist das kein
   * großer Posten — der Punkt ist die Regel: dieses Projekt gibt frei, was es
   * nicht mehr braucht (`ResourceManager`, jedes `dispose()`).
   */
  #applyVehicleGeometry(): void {
    const spec = this.vehicle.spec;
    const bodyGeometry = createCarBody(spec);
    const wheelGeometry = createCarWheel(spec);
    if (this.#body) this.#body.geometry = bodyGeometry;
    if (this.#wheels) this.#wheels.geometry = wheelGeometry;
    for (const old of this.#geometries) old.dispose();
    this.#geometries.length = 0;
    this.#geometries.push(bodyGeometry, wheelGeometry);
  }

  #rebuild(): void {
    const sampler = this.#sampler;
    if (!sampler) return;

    this.collision.clear();
    this.#railsBuilt = false;

    // ── Leitplanken ───────────────────────────────────────────────────────
    if (this.#network) {
      let segments = 0;
      // **Mit derselben Prüfung wie das Mesh** (`RoadSystem`), sonst stünde hier
      // eine Wand, die man nicht sieht.
      const netz = this.#network;
      for (const line of railPolylines(netz.file.roads, (x, z) => netz.isOnRoad(x, z))) {
        const points = line.length / 3;
        for (let i = 0; i + 1 < points; i++) {
          const ay = line[i * 3 + 1]!;
          const by = line[(i + 1) * 3 + 1]!;
          // **Vom Boden bis zur Bandoberkante**, nicht nur das Band selbst
          // (0,50…0,85 m). Ein Auto stößt zuerst mit dem Stoßfänger an, und der
          // liegt bei 0,30 m — unter dem Band. Ein Hindernis, das erst bei 0,50 m
          // anfängt, ließe die Prüfhöhe `probeHeights[0]` darunter durchfahren.
          // Physisch ist das der Pfosten: er trägt das Band und steht am Boden.
          this.collision.addWall(
            line[i * 3]!,
            line[i * 3 + 2]!,
            line[(i + 1) * 3]!,
            line[(i + 1) * 3 + 2]!,
            0.12,
            Math.min(ay, by) - 0.4,
            Math.max(ay, by) + RAIL.top,
            true,
          );
          segments++;
        }
      }
      this.#railsBuilt = segments > 0;
    }

    // ── Gebäude und Bürgersteige ──────────────────────────────────────────
    for (const box of this.#cityColliders) {
      this.collision.addBox(box.minX, box.maxX, box.minZ, box.maxZ, box.bottom, box.top);
    }
    for (const curb of this.#cityCurbs) {
      this.collision.addPlateau(curb.minX, curb.maxX, curb.minZ, curb.maxZ, curb.top);
    }

    // ── Props ─────────────────────────────────────────────────────────────
    for (const placement of this.#propPlacements) {
      const shape = PROP_COLLIDERS[placement.id];
      if (!shape) continue;
      const base = placement.y ?? sampler.getHeightAt(placement.x, placement.z);
      this.collision.addCylinder(
        placement.x,
        placement.z,
        shape.radius * placement.scale,
        // Einen halben Meter unter den Fuß: das Prop steht auf der Höhe seines
        // Mittelpunkts, das Gelände darunter kann an der Kante tiefer liegen
        // (deshalb hat jedes Gebäude-Prop seit P8.10 einen Sockel). Ohne den
        // Vorlauf gibt es am Hang eine Lücke, durch die man unter das Haus fährt.
        base - 0.5,
        base + shape.height * placement.scale,
      );
    }

    this.#readouts.kollision =
      `${this.collision.count} Körper · ${this.collision.plateauCount} Plateaus · ` +
      `Planken ${this.#railsBuilt ? '✓' : '—'}`;
    this.#context?.debug?.refresh();
  }

  // ── Moduswechsel ────────────────────────────────────────────────────────

  /**
   * Die Sitzung beginnt zu Fuß, neben dem Auto, in der Sakura-Schale.
   *
   * Der Play-Knopf ruft das. Nicht `enter()`: wer das Spiel zum ersten Mal
   * betritt, soll neben dem Wagen unter den Kirschbäumen stehen, nicht schon
   * auf dem Sitz und nicht 300 m über der Küste. Der Seed kommt von außen
   * (`Date.now()` im Klick, eine Zahl im Prüfstand), damit zwei Sitzungen
   * nicht denselben Fleck treffen und der Prüfstand denselben Fleck
   * reproduzieren kann.
   */
  startOnFoot(seed = Date.now()): void {
    if (!this.#sampler || !this.#context) return;
    const context = this.#context;

    if (!this.#playStarted) {
      context.camera.getWorldDirection(this.#flyForward);
      this.#flyPosition.copy(context.camera.position);
    }
    this.#playStarted = true;

    this.#leaveDrive();
    this.#seizeCamera();

    const spawn = rollWalkSpawn(seed >>> 0);
    this.#spawn = spawn;
    this.placeAt(spawn.x, spawn.z, spawn.heading);
    this.#placeWalkerBesideCar();
    this.#setWalking(true);
    if (this.#group) this.#group.visible = true;
    this.#readouts.modus = 'Zu Fuß';
    context.debug?.refresh();
  }

  /**
   * Ins Auto steigen.
   *
   * Zwei Wege, und sie dürfen nicht denselben Spawn nehmen:
   *
   *  - **aus dem Freiflug** (Taste `V`, `japanMap.drive(true)`): der Wagen
   *    erscheint auf der nächstgelegenen Straße. Wer über den Bergpass fliegt
   *    und einsteigen will, will dort fahren, nicht 2 km entfernt auf dem Ring.
   *  - **zu Fuß neben dem eigenen Wagen** (Taste `F`): der Wagen bleibt, wo er
   *    steht. Ein Respawn auf die nächste Straße wäre genau dann ein Teleport,
   *    wenn man aussteigt und wieder einsteigt.
   *
   * `startEvent` geht den zweiten Weg, falls man zu Fuß ist — das Rennen
   * setzt danach `placeAt` auf den Startplatz, der Spawn hier wäre ohnehin
   * überschrieben.
   */
  enter(): void {
    if (this.#active || !this.#sampler || !this.#context) return;

    if (this.#walking) {
      this.board();
      return;
    }

    const context = this.#context;
    context.camera.getWorldDirection(this.#flyForward);
    this.#flyPosition.copy(context.camera.position);

    this.#seizeCamera();
    this.#spawnNear(context.camera.position.x, context.camera.position.z);
    this.#beginDrive();
  }

  /**
   * Einsteigen in den Wagen, der schon da ist.
   *
   * Liefert false, wenn die Figur zu weit weg ist. Der Aufrufer (Taste, Menü,
   * Touch) entscheidet, ob er das dem Spieler sagt — dieses System kennt kein
   * HUD, und ein stilles Fehlschlagen ist die richtige Antwort auf „F neben
   * einem Baum, 200 m vom Auto".
   */
  /**
   * Abstand Figur ↔ Wagen in der XZ-Ebene, in Metern.
   *
   * Für den Einsteige-Hinweis und für `board()`. Eine Zahl, zwei Abnehmer —
   * wer sie zweimal rechnet, rechnet sie irgendwann auseinander.
   */
  vehicleRange(): number {
    return Math.hypot(
      this.walker.position.x - this.vehicle.position.x,
      this.walker.position.z - this.vehicle.position.z,
    );
  }

  board(): boolean {
    if (this.#active || !this.#walking || !this.#context) return false;
    const range = this.vehicleRange();
    if (range > WALK_BOARD_RANGE) return false;
    this.#setWalking(false);
    this.#beginDrive();
    return true;
  }

  /**
   * Aussteigen — die Figur steht an der Fahrertür, der Wagen bleibt stehen.
   *
   * Nicht `exit()`: das wäre zurück in den Freiflug, und der Wagen verschwände.
   * Genau das war der alte `V`-Weg, und er bleibt für den Debug-Flug.
   */
  alight(): void {
    if (!this.#active || !this.#context) return;
    this.#leaveDrive();
    this.#placeWalkerBesideCar();
    this.#setWalking(true);
    if (this.#group) this.#group.visible = true;
    this.#readouts.modus = 'Zu Fuß';
    this.#context.debug?.refresh();
  }

  /** Auto ↔ zu Fuß. Dieselbe Taste in beide Richtungen — `F`. */
  toggleVehicle(): void {
    if (this.#active) this.alight();
    else if (this.#walking) this.board();
    else this.enter();
  }

  /** Freiflug — die Flugkamera steht danach genau da, wo sie stand. */
  exit(): void {
    if (!this.#active && !this.#walking) return;
    if (!this.#context) return;
    const context = this.#context;
    this.#leaveDrive();
    this.#setWalking(false);
    if (this.#group) this.#group.visible = false;

    this.fly.setEnabled(true);
    this.fly.setInputDelegate(null);
    // `placeAt` rechnet Gieren und Nicken aus der Blickrichtung zurück — genau
    // dafür ist es öffentlich. Eine gesetzte Quaternion wäre nach einem Frame
    // wieder weg, weil `FreeFlyController.update()` die Ausrichtung jeden Frame
    // aus yaw/pitch neu aufbaut.
    this.fly.placeAt(
      this.#flyPosition,
      this.#scratch.copy(this.#flyPosition).add(this.#flyForward),
    );

    // **Das Blickfeld zurücksetzen.** Die Verfolgerkamera zieht es mit dem Tempo
    // auf bis 68°; bliebe es stehen, wäre jede spätere Messung an einem
    // Blickpunkt mit einer anderen Kamera gemacht als die davor — und ein
    // Vorher/Nachher würde die Kamera messen statt die Änderung.
    if (Math.abs(context.camera.fov - CAMERA.fov) > 1e-6) {
      context.camera.fov = CAMERA.fov;
      context.camera.updateProjectionMatrix();
    }

    this.#readouts.modus = 'Freiflug';
    this.#context.debug?.refresh();
  }

  toggle(): void {
    if (this.#active || this.#walking) this.exit();
    else this.enter();
  }

  #seizeCamera(): void {
    this.fly.setInputDelegate(this);
    this.fly.setEnabled(false);
    this.#keys.clear();
    this.#axes.forward = 0;
    this.#axes.right = 0;
    this.#touchHandbrake = false;
    this.#touchJump = false;
  }

  #beginDrive(): void {
    if (!this.#context) return;
    this.#active = true;
    this.#playStarted = true;
    if (this.#group) this.#group.visible = true;
    this.#fx?.show();
    this.#debris?.show();
    this.camera.reset(this.vehicle);
    this.#readouts.modus = 'Fahren';
    this.#context.bus.emit('drive:mode', { active: true });
    this.#context.debug?.refresh();
  }

  #leaveDrive(): void {
    if (!this.#active) return;
    this.#active = false;
    this.#fx?.hide();
    this.#debris?.hide();
    this.#wake?.(0, 0, 0, 0, 0, false);
    this.#context?.bus.emit('drive:mode', { active: false });
  }

  #setWalking(value: boolean): void {
    if (this.#walking === value) return;
    this.#walking = value;
    if (this.#rig) this.#rig.group.visible = value;
    if (value) {
      this.walkCamera.reset(this.walker);
      this.#readouts.modus = 'Zu Fuß';
    }
    this.#context?.bus.emit('walk:mode', { active: value });
  }

  #placeWalkerBesideCar(): void {
    const yaw = this.vehicle.yaw;
    // Fahrertür rechts: `right = (−cos ψ, 0, sin ψ)`. Begründung bei
    // `WALK_ALIGHT_GAP` und im Kopf von `DriveSystem` (`#right`).
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    const x = this.vehicle.position.x + rx * WALK_ALIGHT_GAP;
    const z = this.vehicle.position.z + rz * WALK_ALIGHT_GAP;
    this.ground.refresh(x, z, 0);
    this.walker.respawn(x, z, yaw, this);
    this.walkCamera.reset(this.walker);
  }

  /** Auto auf die nächste Straße setzen — Taste `R` und beim Einsteigen. */
  respawn(): void {
    if (this.#walking) {
      this.startOnFoot(this.#spawn?.seed ?? Date.now());
      return;
    }
    this.#spawnNear(this.vehicle.position.x, this.vehicle.position.z);
    this.camera.reset(this.vehicle);
  }

  #spawnNear(x: number, z: number): void {
    const hit = this.#network?.closestPoint(x, z, 600) ?? null;
    // Über `placeAt` und nicht direkt über `vehicle.respawn`: dort sitzt die
    // Bildung des Straßenzusammenhangs, und zwei Wege zum Absetzen wären zwei
    // Gelegenheiten, sie zu vergessen.
    if (hit) this.placeAt(hit.x, hit.z, Math.atan2(hit.forwardX, hit.forwardZ));
    else this.placeAt(x, z, 0);
  }

  // ── Eingabe ─────────────────────────────────────────────────────────────

  /** Blick aus der Fingersteuerung — weitergeleitet vom `FreeFlyController`. */
  look(dx: number, dy: number): void {
    if (this.#walking) this.walkCamera.look(dx, dy);
    else this.camera.look(dx, dy);
  }

  /** Stick aus der Fingersteuerung: vorwärts = Gas/Bremse, seitwärts = Lenken. */
  setAxes(forward: number, right: number): void {
    this.#axes.forward = forward;
    this.#axes.right = right;
  }

  /**
   * Handbremse aus der Fingersteuerung — die Leertaste hat auf einem Telefon
   * keine Entsprechung.
   *
   * **Ein eigenes Feld und nicht `#keys.add('space')`.** Der Tastensatz wird von
   * `#onKeyDown` gefüllt und von `#onBlur` geleert; ein Finger, der beim
   * App-Wechsel liegen bleibt, käme über `pointercancel` zurück, nicht über
   * `blur`. Zwei Quellen in einem Behälter hätten genau die Klasse hängender
   * Zustände erzeugt, gegen die P12.4 den Stick schon einmal reparieren musste.
   * Verodert wird unten in `#collectInput()`, wie bei Stick und Tastatur auch.
   */
  setTouchHandbrake(down: boolean): void {
    this.#touchHandbrake = down;
  }

  /** Sprung aus der Fingersteuerung — zu Fuß. */
  setTouchJump(down: boolean): void {
    this.#touchJump = down;
  }

  /**
   * Eingabe aus einem Messlauf setzen — `null` gibt die Steuerung zurück.
   *
   * Damit ist eine Fahrt reproduzierbar: derselbe Eingabeverlauf über dieselbe
   * Zahl fester Schritte endet an derselben Stelle. Ohne diesen Weg wäre die
   * Abnahmezeile „der Bergpass ist befahrbar, gemessen, nicht
   * gefahren-und-für-gut-befunden" nicht einlösbar.
   */
  setScriptedInput(input: DriveInput | null): void {
    this.#scripted = input;
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (isTyping()) return;
    // Dieselbe Sperre wie im `FreeFlyController` und aus demselben Grund (P10.2):
    // ohne gefangenen Zeiger liegt das Menü über dem Bild, und eine Taste dort
    // gehört dem Menü. Auf einem Telefon gibt es keinen Lock — dort steuert der
    // Stick, und der geht nicht über diesen Weg.
    if (document.pointerLockElement === null) return;

    const code = event.code.toLowerCase();
    if (code === 'keyv') {
      event.preventDefault();
      this.toggle();
      return;
    }
    if (code === 'keyf') {
      event.preventDefault();
      this.toggleVehicle();
      return;
    }
    if (!this.#active && !this.#walking) return;

    if (code === 'keyr') {
      event.preventDefault();
      this.respawn();
      return;
    }
    if (code === 'keyc' && this.#active) {
      event.preventDefault();
      this.#readouts.ansicht = this.camera.toggleMode() === 'hood' ? 'Haube' : 'Verfolger';
      this.#context?.debug?.refresh();
      return;
    }
    // Leertaste (Handbremse / Sprung) und die Pfeiltasten scrollen sonst die Seite.
    if (code === 'space' || code.startsWith('arrow')) event.preventDefault();
    this.#keys.add(code);
  };

  readonly #onKeyUp = (event: KeyboardEvent): void => {
    this.#keys.delete(event.code.toLowerCase());
  };

  /** Fenster verliert den Fokus: sonst fährt das Auto mit Vollgas weiter. */
  readonly #onBlur = (): void => {
    this.#keys.clear();
    this.#axes.forward = 0;
    this.#axes.right = 0;
    this.#touchHandbrake = false;
    this.#touchJump = false;
  };

  #collectInput(): DriveInput {
    if (this.#scripted) return this.#scripted;

    const input = this.#input;
    const keys = this.#keys;
    const forward = keys.has('keyw') || keys.has('arrowup') ? 1 : 0;
    const back = keys.has('keys') || keys.has('arrowdown') ? 1 : 0;
    const left = keys.has('keya') || keys.has('arrowleft') ? 1 : 0;
    const right = keys.has('keyd') || keys.has('arrowright') ? 1 : 0;

    // Tastatur und Stick werden **addiert**, nicht gegeneinander getauscht —
    // dieselbe Regel wie bei `FreeFlyController.#axes`: ein Tablet mit Tastatur
    // darf nicht eine der beiden Quellen verschlucken.
    const stick = this.#axes.forward;
    input.throttle = clamp01(forward + Math.max(0, stick));
    input.brake = clamp01(back + Math.max(0, -stick));
    input.steer = clamp(right - left + this.#axes.right, -1, 1);
    input.handbrake = keys.has('space') || this.#touchHandbrake;
    return input;
  }

  #collectWalkInput(): WalkInput {
    const input = this.#walkInput;
    const keys = this.#keys;
    const forward = keys.has('keyw') || keys.has('arrowup') ? 1 : 0;
    const back = keys.has('keys') || keys.has('arrowdown') ? 1 : 0;
    const left = keys.has('keya') || keys.has('arrowleft') ? 1 : 0;
    const right = keys.has('keyd') || keys.has('arrowright') ? 1 : 0;
    input.forward = clamp(forward - back + this.#axes.forward, -1, 1);
    input.right = clamp(right - left + this.#axes.right, -1, 1);
    input.jump = keys.has('space') || this.#touchJump;
    input.sprint = keys.has('shiftleft') || keys.has('shiftright');
    return input;
  }

  // ── Schleife ────────────────────────────────────────────────────────────

  fixedUpdate(dt: number): void {
    if (this.#walking) {
      this.#stepWalk(dt);
      return;
    }
    if (!this.#active) return;
    const input = this.#collectInput();
    this.simulateStep(dt, input);
    // **Nach dem Schritt und nach der Rundenzählung.** Der Rennleiter liest die
    // Position *nach* der Integration; ein Kontrollpunkt, der davor geprüft
    // wird, fällt einen Schritt zu spät — bei 250 km/h sind das 1,16 m.
    this.race.step(dt, this.vehicle, this.collision);
    this.#collectPickups(dt);
    // **Die Driftwertung läuft immer, nicht nur im Rennen.** Sie war zuerst im
    // Rennleiter, und damit brachte Driften außerhalb einer Veranstaltung nichts
    // — auf einer offenen Karte ist das genau verkehrt herum: das Freifahren ist
    // der Zustand, in dem ein Spieler die meiste Zeit verbringt.
    this.race.drift.step(dt, this.vehicle.telemetry);
    this.#watchStuck(dt, input);
  }

  /**
   * Sammelstücke einsammeln und die Driftzone anwenden — P24.
   *
   * **In `fixedUpdate` und nicht in `update`**, aus demselben Grund wie die
   * Rundenzählung: bei 250 km/h legt der Wagen je Frame 1,16 m zurück, und ein
   * Aufsammelradius von 4,5 m wäre bei 20 fps ein Stück, an dem man vorbeifährt.
   * Der feste Schritt sieht jede Stelle.
   */
  #collectPickups(dt: number): void {
    const stunt = this.#stunt;
    if (!stunt) return;
    const taken = stunt.collect(this.vehicle.position.x, this.vehicle.position.z, dt);
    if (taken > 0) {
      this.vehicle.addBoost(PICKUPS.boost * taken);
      this.#context?.bus.emit('pickup:collected', {
        kind: 'coin',
        total: taken,
        yen: PICKUPS.yen * taken,
      });
    }
    // Die Driftzone verdoppelt die Wertung. Sie wird **je Schritt** gefragt und
    // nicht beim Betreten gemerkt: eine Zone, die man beim Hineinfahren betritt
    // und beim Herausfliegen nicht verlässt, ist ein Multiplikator, den man
    // mitnimmt.
    this.race.drift.setBonus(
      stunt.driftBonusAt(this.vehicle.position.x, this.vehicle.position.z),
    );
  }

  /**
   * Eine Veranstaltung starten — der Weg aus dem Menü.
   *
   * Steigt bei Bedarf selbst ins Auto: wer im Menü ein Rennen wählt, will
   * fahren und nicht erst noch einen zweiten Knopf suchen. Das ist dieselbe
   * Lehre wie aus P16 („ein fertiges System hinter einem fehlenden Knopf").
   */
  startEvent(event: RaceEvent): boolean {
    const sampler = this.#sampler;
    if (!sampler) return false;
    if (this.#walking) this.#setWalking(false);
    if (!this.#active) this.enter();
    const start = this.race.start(
      event,
      this.#vehicleId,
      sampler,
      this.#water,
      this.collision,
    );
    if (!start) return false;
    this.placeAt(start.x, start.z, start.heading);
    this.#fx?.reset();
    return true;
  }

  /** Laufende Veranstaltung abbrechen. */
  abortEvent(): void {
    this.race.abort();
  }

  /**
   * Die letzte Zusicherung: **wer fahren will, kommt weiter** — P20.
   *
   * ## Warum es sie geben muss, obwohl die Physik repariert ist
   *
   * P20 hat den Grund beseitigt, aus dem ein Wagen im Gelände steckenblieb (die
   * Karosserie kannte das Höhenfeld nicht). Das ist die richtige Reparatur, und
   * sie ist gemessen. Sie kann trotzdem nicht *alles* abdecken, und der Beleg
   * dafür steht in PLAN.md P19.6: am Tempelaufgang stehen zwei Steinlaternen mit
   * **4,33 m** Lücke, das Coupé ist mit Blechzuschlag **4,32 m** lang. Es passt
   * auf den Zentimeter hinein. Kein Kollisionsmodell der Welt macht daraus etwas
   * anderes als „steckt fest" — das ist eine Aussage über die **Karte**.
   *
   * Der Klemmschutz in `Vehicle` (P19) ist der physiknahe Teil der Antwort: er
   * schiebt einen eingeklemmten Wagen mit wachsender Trenngeschwindigkeit
   * heraus. Er hat vier Anläufe gebraucht, weil jede seiner Bedingungen
   * geometrisch ist — und Geometrie kann diesen Fall nicht immer entscheiden.
   *
   * Diese Zusicherung ist deshalb bewusst **nicht** geometrisch, sondern misst
   * die einzige Größe, die der Fahrer auch sieht: *ist er von der Stelle
   * gekommen.* Fünf Sekunden Eingabe ohne `RESCUE_FREE` Meter Weg heißt
   * festgefahren, und dann setzt sie den Wagen auf die nächste Straße — genau
   * das, was die Taste `R` und der ⟲-Knopf ohnehin tun.
   *
   * ## Warum sie in `fixedUpdate` steht und nicht in `simulateStep`
   *
   * Weil der Messstand (`japanMap.driveProbe()`) über `simulateStep` fährt. Ein
   * Prüfstand, der sich selbst freisetzt, misst die Rettung statt die Physik und
   * meldete jede Karte als befahrbar. Dieselbe Trennung wie bei `#scripted`.
   */
  #watchStuck(dt: number, input: DriveInput): void {
    const willFahren = input.throttle > 0.15 || input.brake > 0.15;
    const weg = Math.hypot(
      this.vehicle.position.x - this.#stuckX,
      this.vehicle.position.z - this.#stuckZ,
    );
    if (!willFahren || weg > RESCUE_FREE) {
      this.#stuckTime = 0;
      this.#stuckX = this.vehicle.position.x;
      this.#stuckZ = this.vehicle.position.z;
      return;
    }

    this.#stuckTime += dt;
    if (this.#stuckTime < RESCUE_DELAY) return;

    this.respawn();
    this.#stuckTime = 0;
    this.#stuckX = this.vehicle.position.x;
    this.#stuckZ = this.vehicle.position.z;
    this.#context?.bus.emit('drive:rescued', { seconds: RESCUE_DELAY });
  }

  /**
   * Einen Simulationsschritt mit ausdrücklicher Eingabe rechnen.
   *
   * Öffentlich für den Messlauf (`debug/driveProbe.ts`). Er treibt die Physik in
   * einer eigenen Schleife, ohne zu rendern — eine 60-Sekunden-Fahrt sind 3600
   * Schritte und dauert so wenige Millisekunden statt einer Minute. Dass er
   * **denselben** Weg nimmt wie die Tastatur, ist der Punkt: ein Prüfstand mit
   * eigenem Aufruf misst irgendwann etwas anderes als das Spiel. Genau diese
   * Falle steht in CLAUDE.md („Ein von Hand gesetzter Zustand ist ein Zustand,
   * den es im Betrieb nicht gibt").
   */
  simulateStep(dt: number, input: DriveInput): void {
    if (!this.#sampler) return;
    const started = performance.now();
    this.ground.refresh(this.vehicle.position.x, this.vehicle.position.z, dt);
    this.#fillTrees();
    this.vehicle.step(dt, input, this, this.collision);
    this.#flushBreaks();
    // **Nach dem Schritt, nicht davor** — P9.3. Die Rundenlogik prüft den
    // Vorzeichenwechsel zwischen zwei *aufeinanderfolgenden* Positionen; sie
    // muss deshalb die Position **nach** der Integration sehen, sonst hinkt sie
    // um einen Schritt hinterher und meldet die Torüberquerung 16 ms zu spät.
    // Bei 250 km/h wären das 1,16 m Bahn.
    const runde = this.laps.step(this.vehicle.position.x, this.vehicle.position.z, dt);
    // **Über den Bus und nicht über einen Rückruf**, obwohl `step()` das
    // Ergebnis schon zurückgibt. Zwei Zuhörer brauchen es (Ton und HUD), und der
    // Rückgabewert bleibt, was er war: der Weg für den Messstand aus P14, der
    // ohne Bus läuft. `#context` ist dort null, also kostet die Zeile ihn nichts.
    if (runde) this.#context?.bus.emit('drive:lap', runde);
    // Gleitendes Mittel über rund 30 Schritte. Ein Einzelwert aus
    // `performance.now()` liegt bei einer halben Mikrosekunde Auflösung im
    // Rauschen; das Mittel ist die Zahl, die in die Abnahme gehört.
    this.#stepMs += (performance.now() - started - this.#stepMs) * 0.03;
  }

  /**
   * Stämme der Umgebung in die Kollision legen — jedes Schritt neu.
   *
   * Nicht im `#rebuild`: die Vegetation streamt, und 50 000 Zylinder im
   * Raster würden die Häuserabfrage mitbezahlen. 12 m um das Auto sind
   * 1–4 Chunks, gedeckelt auf 48 Stämme.
   */
  #fillTrees(): void {
    this.collision.beginDynamic();
    const px = this.#walking ? this.walker.position.x : this.vehicle.position.x;
    const pz = this.#walking ? this.walker.position.z : this.vehicle.position.z;
    if (this.#walking) this.#addParkedCarCollider();
    const canopy = this.#canopy;
    if (!canopy) return;
    const n = canopy.queryCanopy(
      px,
      pz,
      TREE_QUERY_RADIUS,
      this.#treeBuf,
    );
    for (let i = 0; i < n; i++) {
      const tree = this.#treeBuf[i]!;
      this.collision.addDynamicCylinder(
        tree.x,
        tree.z,
        tree.radius,
        tree.y - 0.4,
        tree.y + tree.height,
        tree.key,
      );
    }
  }

  #flushBreaks(): void {
    const events: readonly BreakEvent[] = this.vehicle.consumeBreaks();
    if (events.length === 0) return;
    for (const event of events) {
      if (event.kind === 'tree') this.#canopy?.breakTree(event.id);
      this.#debris?.burst(event);
      this.#context?.bus.emit('drive:broke', event);
    }
  }

  /**
   * Auto an eine bestimmte Stelle setzen — Respawn, Einsteigen und Messlauf.
   *
   * **Der Straßenzusammenhang wird vorher gebildet, und das ist keine
   * Kleinigkeit.** `Ground.height()` braucht die Höhenkorrektur (Kopf, Punkt 2),
   * und die gilt für den Ort, an dem das Auto *landen* soll — nicht für den, an
   * dem es zuletzt war. Ohne diese zwei Zeilen setzt ein Respawn in der Stadt den
   * Wagen einen Meter unter den Asphalt, und der erste Simulationsschritt schießt
   * ihn dann heraus.
   *
   * Gefunden hat das der Messstand, und zwar an sich selbst: seine Standhöhen
   * waren durchweg exakt −6,00 cm, also genau `surfaceOffset` — der Wert, der
   * herauskommt, wenn die Korrektur **null** ist. Eine Messung, die den Zustand
   * misst, den sie selbst versäumt hat herzustellen. Genau davor warnt CLAUDE.md
   * mit „Ein von Hand gesetzter Zustand ist ein Zustand, den es im Betrieb nicht
   * gibt".
   */
  placeAt(x: number, z: number, heading: number): void {
    this.vehicle.position.x = x;
    this.vehicle.position.z = z;
    this.ground.refresh(x, z, 0);
    this.vehicle.respawn(x, z, heading, this);
    this.camera.reset(this.vehicle);
  }

  /**
   * Karten-Teleport. Nur mit Sandkasten — dieselbe Sperre wie der Knopf,
   * hier noch einmal, falls jemand den Button per Skript drückt.
   *
   * Zu Fuß auf den geklickten Punkt, im Auto nahe einer Straße auf deren
   * Mittellinie. `placeAt` / `walker.respawn` sind absichtlich die einzigen
   * Wege zum Absetzen.
   */
  teleportTo(x: number, z: number): void {
    if (!this.#canTeleport() || !this.#sampler) return;
    if (this.#walking) {
      this.ground.refresh(x, z, 0);
      this.walker.respawn(x, z, this.walker.yaw, this);
      this.walkCamera.reset(this.walker);
      return;
    }
    const hit = this.#network?.closestPoint(x, z, 90) ?? null;
    if (hit) this.placeAt(hit.x, hit.z, Math.atan2(hit.forwardX, hit.forwardZ));
    else this.placeAt(x, z, this.vehicle.yaw);
    this.#fx?.reset();
    this.#stuckTime = 0;
    this.#stuckX = this.vehicle.position.x;
    this.#stuckZ = this.vehicle.position.z;
  }

  #stepWalk(dt: number): void {
    this.ground.refresh(this.walker.position.x, this.walker.position.z, dt);
    this.#fillTrees();
    this.walker.step(dt, this.#collectWalkInput(), this, this.collision, this.walkCamera.heading);
  }

  /**
   * Der parkende Wagen ist ein Hindernis, sonst läuft man durchs Blech.
   *
   * Zwei Zylinder an Vorder- und Hinterachse statt eines am Schwerpunkt:
   * ein Zylinder von 1,4 m Radius in der Mitte lässt Nase und Heck frei, und
   * genau dort steigt man aus. Dynamisch, weil der Wagen den Ort wechselt und
   * `beginDynamic` die Liste ohnehin jede Schritt leert.
   *
   * Schlüssel `0xFFFFFF00` / `01`: Baumschlüssel kommen aus der Streuung und
   * liegen weit darunter. Kein Bruch — das Auto gibt nicht nach.
   */
  #addParkedCarCollider(): void {
    const spec = this.vehicle.spec.chassis;
    const yaw = this.vehicle.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const front = spec.wheelbase * (1 - spec.frontWeight);
    const rear = spec.wheelbase * spec.frontWeight;
    const r = spec.bodyWidth * 0.52;
    const y = this.vehicle.position.y;
    const x = this.vehicle.position.x;
    const z = this.vehicle.position.z;
    this.collision.addDynamicCylinder(x + fx * front, z + fz * front, r, y - 1.2, y + 0.7, 0xffffff00);
    this.collision.addDynamicCylinder(x - fx * rear, z - fz * rear, r, y - 1.2, y + 0.7, 0xffffff01);
  }

  update(dt: number): void {
    this.#navigation?.update(dt);
    const px = this.#walking ? this.walker.position.x : this.vehicle.position.x;
    const pz = this.#walking ? this.walker.position.z : this.vehicle.position.z;
    this.#waypoint.update(px, pz);
    if (this.#walking && this.#context) {
      this.walkCamera.update(dt, this.walker, this, this.#context.camera);
      const rig = this.#rig;
      if (rig) {
        rig.group.position.copy(this.walker.position);
        rig.group.rotation.y = this.walker.yaw;
        rig.animate(
          {
            cycle: this.walker.cycle,
            speed: this.walker.speed,
            grounded: this.walker.grounded,
            vy: this.walker.vy,
            lean: this.walker.lean,
          },
          dt,
        );
      }
      this.#syncMeshes();
      return;
    }
    if (!this.#active || !this.#context) return;
    this.camera.update(dt, this.vehicle, this, this.#context.camera);
    this.#syncMeshes();
    this.#fx?.update(dt, this.vehicle, this, this.#context.camera, this.#input.handbrake);
    this.#debris?.update(dt);
    const t = this.vehicle.telemetry;
    const yaw = this.vehicle.yaw;
    this.#wake?.(
      this.vehicle.position.x,
      this.vehicle.position.z,
      Math.sin(yaw),
      Math.cos(yaw),
      t.speed,
      t.surface === 'wasser' || t.waterDepth > 0.05,
    );
    this.race.render();
    this.#syncReadouts();
  }

  #syncMeshes(): void {
    const body = this.#body;
    if (body) {
      body.position.copy(this.vehicle.position);
      body.quaternion.copy(this.vehicle.quaternion);
      body.updateMatrix();
    }

    const wheels = this.#wheels;
    if (!wheels) return;
    const positions = this.vehicle.wheelPositions;
    const steer = this.vehicle.telemetry.steerAngle;
    const spin = this.vehicle.wheelSpinAngle;

    for (let i = 0; i < 4; i++) {
      // Vorne lenkt mit, hinten nicht. Reihenfolge wie in `Vehicle`:
      // vorn links, vorn rechts, hinten links, hinten rechts.
      // **Die volle Lage des Aufbaus, nicht nur sein Gierwinkel.** Bis P17 stand
      // hier `setFromAxisAngle(yAxis, yaw - steer)`; die Räder standen damit
      // immer senkrecht in der Welt, auch wenn die Karosserie beim Bremsen 7°
      // nickte oder in der Kurve 9° wankte. Zusammen mit den Rädern, die am
      // Boden klebten (siehe `Vehicle.#placeWheels`), war das die zweite Hälfte
      // von „die Räder trennen sich vom Auto".
      this.#wheelQuat.copy(this.vehicle.quaternion);
      if (i < 2) {
        // Lenkung um die **lokale** Hochachse, also nachmultipliziert.
        // **Minus, nicht plus.** Ein positiver Lenkwinkel heißt rechts, und rechts
        // heißt ein *kleinerer* Gierwinkel (`forward = (sin ψ, 0, cos ψ)` dreht bei
        // wachsendem ψ nach links). Mit einem Plus zeigten die Vorderräder in die
        // Gegenrichtung der Kurve — dieselbe Vorzeichenkette wie bei `#right`.
        this.#steerQuat.setFromAxisAngle(this.#yAxis, -steer);
        this.#wheelQuat.multiply(this.#steerQuat);
      }
      // Raddrehung **nach** der Gierung und um die **lokale** Radachse: als
      // zweiter Faktor multipliziert wirkt sie im gedrehten System. Andersherum
      // multipliziert dreht das Rad um die Weltachse X und steht bei jeder
      // Fahrtrichtung außer Nord im Bild quer.
      this.#spinQuat.setFromAxisAngle(this.#wheelAxis, spin);
      this.#wheelQuat.multiply(this.#spinQuat);
      this.#matrix.compose(positions[i]!, this.#wheelQuat, this.#scale);
      wheels.setMatrixAt(i, this.#matrix);
    }
    wheels.instanceMatrix.needsUpdate = true;
  }

  #syncReadouts(): void {
    const t = this.vehicle.telemetry;
    const deg = (radians: number): string => `${((radians * 180) / Math.PI).toFixed(1)}°`;
    this.#readouts.tempo = `${(t.speed * 3.6).toFixed(0)} km/h (${t.forwardSpeed.toFixed(1)} m/s)`;
    this.#readouts.schwimmwinkel = deg(t.slip);
    this.#readouts.schraeglauf = `v ${deg(t.slipFront)} · h ${deg(t.slipRear)}`;
    this.#readouts.durchdrehen = t.wheelspin > 1 ? `${t.wheelspin.toFixed(2)} ×` : '—';
    this.#readouts.belag =
      t.surface === 'asphalt'
        ? 'Asphalt'
        : t.surface === 'kies'
          ? 'Kies'
          : t.surface === 'wasser'
            ? 'Wasser'
            : 'Gelände';
    this.#readouts.wasser =
      t.waterDepth > 0.01 ? `${t.waterDepth.toFixed(2)} m · ${t.skid.toFixed(2)}` : '—';
    const fx = this.#fx;
    this.#readouts.spuren = fx ? `${fx.liveSkids} Spuren · ${fx.liveSplash} Spritzer` : '—';
    this.#readouts.federweg = t.airborne ? 'in der Luft' : `${(t.compression * 100).toFixed(0)} %`;
    this.#readouts.kontakt =
      t.contacts > 0 ? `${t.contacts} · ${(t.lastPenetration * 100).toFixed(1)} cm` : '—';
    this.#readouts.aufwand = `${this.#stepMs.toFixed(3)} ms/Schritt`;
  }

  // ── Ground ──────────────────────────────────────────────────────────────

  /**
   * `Ground` weiterreichen — das System bleibt die Schnittstelle nach außen.
   *
   * Vier Zeilen Durchreichung statt eines Umbaus aller Aufrufer: `Vehicle`,
   * `ChaseCamera`, `driveProbe` und `VehicleFx` bekommen `this` als `Ground`,
   * und das soll so bleiben. Was sich geändert hat, ist **wo** die Antwort
   * herkommt, nicht wer sie beantwortet.
   */
  height(x: number, z: number): number {
    return this.ground.height(x, z);
  }

  normal(x: number, z: number, target: Vector3): Vector3 {
    return this.ground.normal(x, z, target);
  }

  surface(x: number, z: number): Surface {
    return this.ground.surface(x, z);
  }

  waterDepth(x: number, z: number): number {
    return this.ground.waterDepth(x, z);
  }

  // ── Debug ───────────────────────────────────────────────────────────────

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Fahren');
    if (!folder) return;

    folder.addBinding(this.#readouts, 'modus', { readonly: true, label: 'Modus' });
    folder.addBinding(this.#readouts, 'ansicht', { readonly: true, label: 'Ansicht' });
    folder.addBinding(this.#readouts, 'tempo', { readonly: true, label: 'Tempo', interval: 100 });
    folder.addBinding(this.#readouts, 'schwimmwinkel', {
      readonly: true,
      label: 'Schwimmwinkel',
      interval: 100,
    });
    folder.addBinding(this.#readouts, 'schraeglauf', {
      readonly: true,
      label: 'Schräglauf',
      interval: 100,
    });
    folder.addBinding(this.#readouts, 'durchdrehen', {
      readonly: true,
      label: 'Räder drehen',
      interval: 100,
    });
    folder.addBinding(this.#readouts, 'belag', { readonly: true, label: 'Belag', interval: 200 });
    folder.addBinding(this.#readouts, 'wasser', { readonly: true, label: 'Wasser', interval: 150 });
    folder.addBinding(this.#readouts, 'spuren', { readonly: true, label: 'Spuren', interval: 200 });

    // Rundenzählung — P9.3. Die Ablesewerte wohnen im `LapTimer` selbst, nicht
    // hier: er ist ohne Renderer und ohne Bus benutzbar (der Messstand aus P14
    // treibt ihn direkt), und eine Anzeige, die nur im Debug-Panel entsteht,
    // wäre dort nicht abzulesen.
    const runden = context.debug?.folder('Runden (P9.3)');
    if (runden) {
      runden.addBinding(this.laps.readouts, 'strecke', { readonly: true, label: 'Strecke' });
      runden.addBinding(this.laps.readouts, 'runde', {
        readonly: true,
        label: 'Runde',
        interval: 200,
      });
      runden.addBinding(this.laps.readouts, 'naechstesTor', {
        readonly: true,
        label: 'nächstes Tor',
        interval: 200,
      });
      runden.addBinding(this.laps.readouts, 'letzteZeit', { readonly: true, label: 'letzte', interval: 500 });
      runden.addBinding(this.laps.readouts, 'beste', { readonly: true, label: 'beste', interval: 500 });
    }
    folder.addBinding(this.#readouts, 'federweg', {
      readonly: true,
      label: 'Federweg',
      interval: 150,
    });
    folder.addBinding(this.#readouts, 'kontakt', {
      readonly: true,
      label: 'Kollision',
      interval: 100,
    });
    folder.addBinding(this.#readouts, 'kollision', { readonly: true, label: 'Hindernisse' });
    folder.addBinding(this.#readouts, 'aufwand', { readonly: true, label: 'CPU', interval: 250 });
    folder.addButton({ title: 'Fahren / Fliegen (V)' }).on('click', () => {
      this.toggle();
    });
    folder.addButton({ title: 'Ein / Aussteigen (F)' }).on('click', () => {
      this.toggleVehicle();
    });
    folder.addButton({ title: 'Auf die Straße setzen (R)' }).on('click', () => {
      this.respawn();
    });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('keyup', this.#onKeyUp);
    window.removeEventListener('blur', this.#onBlur);

    this.#navigation?.dispose();
    this.#navigation = null;
    this.#waypoint.dispose();

    if (this.#group) {
      this.#context?.scene.remove(this.#group);
      this.#group = null;
    }
    this.#wheels?.dispose();
    this.#wheels = null;
    this.#body = null;
    for (const geometry of this.#geometries) geometry.dispose();
    this.#geometries.length = 0;
    this.#rig?.dispose();
    this.#rig = null;
    this.#material?.dispose();
    this.#material = null;
    this.#fx?.dispose();
    this.#fx = null;
    this.#debris?.dispose();
    this.#debris = null;
    this.race.dispose();
    this.collision.clear();
    this.#sampler = null;
    this.#network = null;
    this.#context = null;
  }
}

/** Der Teil des `FreeFlyController`, den dieses System braucht. */
type WakeSink = (
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  speed: number,
  active: boolean,
) => void;

interface FlyController {
  setEnabled(value: boolean): void;
  setInputDelegate(delegate: FlyInputDelegate | null): void;
  placeAt(position: Vector3, lookAt: Vector3): void;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Tastendrücke in Eingabefeldern gehören dem Feld. Wie im `FreeFlyController`. */
function isTyping(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
