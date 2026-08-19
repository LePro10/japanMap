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
import type { PropPlacement } from '@/config/props.config';
import { CITY, CITY_SLAB_Y } from '@/config/city.config';
import { districtBlend } from '@/config/city.mjs';
import { ROAD_MESH, ROAD_TYPES } from '@/config/roads.config';
import { CAMERA } from '@/config/world.config';
import type { FlyInputDelegate } from '@/camera/FreeFlyController';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { PropMaterial } from '@/world/materials/PropMaterial';
import { railPolylines, RAIL } from '@/world/roads/GuardrailBuilder';
import type { RoadNetwork } from '@/world/roads/RoadNetwork';
import type { TerrainSampler } from '@/world/TerrainSampler';
import type { CityCollider, CityCurb } from '@/world/city/CityGenerator';
import { createCarBody, createCarWheel } from './carMesh';
import { ChaseCamera } from './ChaseCamera';
import { CollisionWorld } from './CollisionWorld';
import { LapTimer } from './LapTimer';
import { Vehicle, type DriveInput, type Ground, type Surface } from './Vehicle';

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
  readonly collision = new CollisionWorld();

  #context: EngineContext | null = null;
  #sampler: TerrainSampler | null = null;
  #network: RoadNetwork | null = null;
  #active = false;

  #group: Group | null = null;
  #body: Mesh | null = null;
  #wheels: InstancedMesh | null = null;
  #material: PropMaterial | null = null;
  readonly #geometries: BufferGeometry[] = [];

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
  /** Eingabe aus einem Messlauf. Gesetzt = Tastatur und Finger sind stumm. */
  #scripted: DriveInput | null = null;

  readonly #input: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

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
   * Straßentreffer am Fahrzeugschwerpunkt, **einmal je Simulationsschritt**.
   *
   * `RoadNetwork.closestPoint()` legt ein Objekt an; vier Räder plus Karosserie
   * wären fünf davon je Schritt, also 300 je Sekunde. Die Breite und die Belagsart
   * ändern sich über 4 m Fahrzeuglänge nicht, also genügt eine Abfrage — die
   * *Entfernung* je Rad kommt danach aus `distanceToNearestRoad()`, und die legt
   * nichts an.
   */
  #roadHalfWidth = 0;
  #roadSurface: Surface = 'gelaende';
  #roadShoulder = 0;
  /**
   * Höhenunterschied zwischen Fahrbahn-Mesh und Sampler an der Fahrzeugstelle.
   *
   * Enthält `ROAD_MESH.surfaceOffset` **und** die Abweichung, die der Messlauf
   * gefunden hat (Punkt 2 im Kopf). Sie wird an der **Mittellinie** gebildet und
   * nicht an der Fahrzeugposition: gesucht ist der Unterschied zwischen den beiden
   * Höhenquellen, nicht der Abstand des Autos zur Straßenmitte.
   */
  #roadCorrection = 0;
  /**
   * Wohin die Korrektur strebt. Sie folgt mit begrenzter Rate — und das ist keine
   * Kosmetik, sondern die Reparatur eines gemessenen Fehlers.
   *
   * **An der Kreuzung Ring × Bergpass (−593, −318) springt die Korrektur in einem
   * einzigen Schritt um 1,36 m.** Ursache: dort laufen zwei Strecken auf
   * verschiedener Höhe zusammen, das Gelände trägt die Einschnitte beider, und
   * `closestPoint()` wechselt beim Vorbeifahren von der einen Mittellinie auf die
   * andere. Für die Federung ist ein Bodensprung von 1,36 m ein Rammbock: gemessen
   * flog das Auto bei 49 km/h **8 m hoch** und landete 60 m weiter im Hang.
   *
   * Ein Sprung der Korrektur ist ein Artefakt der Höhenquelle und keine Geometrie
   * — im Bild gibt es an der Kreuzung keine Stufe. Also darf er auch nicht wie
   * eine wirken.
   */
  #roadCorrectionTarget = 0;

  #stepMs = 0;

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
    ansicht: 'Verfolger',
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

  /** Zahl der eingetragenen Hindernisse — für die Abnahme. */
  get colliderCount(): number {
    return this.collision.count;
  }

  /** CPU-Kosten eines Simulationsschritts in Millisekunden (gleitendes Mittel). */
  get stepMs(): number {
    return this.#stepMs;
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
      this.#rebuild();
    });
    context.bus.on('roads:ready', ({ network }) => {
      this.#network = network;
      // Die Tore des Rings — P9.3. Der Ring ist die einzige geschlossene
      // Strecke der Karte; auf einer Stichstraße wie dem Bergpass gibt es keine
      // Runde, sondern eine Fahrt. `setRoad()` lässt sich später auf jede
      // Strecke umstellen, die Voreinstellung ist die, die eine Runde hat.
      this.laps.setRoad(network, 'ring');
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

    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keyup', this.#onKeyUp);
    window.addEventListener('blur', this.#onBlur);

    this.#registerDebug(context);
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

    const bodyGeometry = createCarBody();
    const wheelGeometry = createCarWheel();
    this.#geometries.push(bodyGeometry, wheelGeometry);

    const body = new Mesh(bodyGeometry, material);
    body.name = 'Fahrzeug:Karosserie';
    body.matrixAutoUpdate = false;
    this.#body = body;
    group.add(body);

    const wheels = new InstancedMesh(wheelGeometry, material, 4);
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

    context.scene.add(group);
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
   * Ins Auto steigen.
   *
   * Der Wagen erscheint auf der **nächstgelegenen Straße**, nicht an einem der
   * vier Startplätze aus `getSpawnPoints()`. Der Unterschied ist praktisch: wer
   * gerade über den Bergpass fliegt und einsteigen will, will dort fahren und
   * nicht auf dem Ring 2 km entfernt. Findet sich in 600 m keine Straße, steht
   * das Auto unter der Kamera im Gelände — auf einer Karte mit 101 ha Reisfeldern
   * ist das ein zulässiger Ort.
   */
  enter(): void {
    if (this.#active || !this.#sampler || !this.#context) return;
    const context = this.#context;

    context.camera.getWorldDirection(this.#flyForward);
    this.#flyPosition.copy(context.camera.position);

    this.fly.setInputDelegate(this);
    this.fly.setEnabled(false);
    this.#active = true;
    this.#keys.clear();
    this.#axes.forward = 0;
    this.#axes.right = 0;
    this.#touchHandbrake = false;

    this.#spawnNear(context.camera.position.x, context.camera.position.z);
    if (this.#group) this.#group.visible = true;
    this.camera.reset(this.vehicle);
    this.#readouts.modus = 'Fahren';
    context.bus.emit('drive:mode', { active: true });
    this.#context?.debug?.refresh();
  }

  /** Aussteigen — die Flugkamera steht danach genau da, wo sie stand. */
  exit(): void {
    if (!this.#active || !this.#context) return;
    const context = this.#context;
    this.#active = false;
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
    context.bus.emit('drive:mode', { active: false });
    this.#context?.debug?.refresh();
  }

  toggle(): void {
    if (this.#active) this.exit();
    else this.enter();
  }

  /** Auto auf die nächste Straße setzen — Taste `R` und beim Einsteigen. */
  respawn(): void {
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
    this.camera.look(dx, dy);
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
    if (!this.#active) return;

    if (code === 'keyr') {
      event.preventDefault();
      this.respawn();
      return;
    }
    if (code === 'keyc') {
      event.preventDefault();
      this.#readouts.ansicht = this.camera.toggleMode() === 'hood' ? 'Haube' : 'Verfolger';
      this.#context?.debug?.refresh();
      return;
    }
    // Leertaste (Handbremse) und die Pfeiltasten scrollen sonst die Seite.
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

  // ── Schleife ────────────────────────────────────────────────────────────

  fixedUpdate(dt: number): void {
    if (!this.#active) return;
    this.simulateStep(dt, this.#collectInput());
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
    this.#refreshRoadContext();
    this.#followRoadCorrection(dt);
    this.vehicle.step(dt, input, this, this.collision);
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
    this.#refreshRoadContext();
    this.#followRoadCorrection(0);
    this.vehicle.respawn(x, z, heading, this);
    this.camera.reset(this.vehicle);
  }

  update(dt: number): void {
    if (!this.#active || !this.#context) return;
    this.camera.update(dt, this.vehicle, this, this.#context.camera);
    this.#syncMeshes();
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
      t.surface === 'asphalt' ? 'Asphalt' : t.surface === 'kies' ? 'Kies' : 'Gelände';
    this.#readouts.federweg = t.airborne ? 'in der Luft' : `${(t.compression * 100).toFixed(0)} %`;
    this.#readouts.kontakt =
      t.contacts > 0 ? `${t.contacts} · ${(t.lastPenetration * 100).toFixed(1)} cm` : '—';
    this.#readouts.aufwand = `${this.#stepMs.toFixed(3)} ms/Schritt`;
  }

  // ── Ground ──────────────────────────────────────────────────────────────

  /**
   * Straßenzusammenhang am Fahrzeug — einmal je Schritt, Begründung oben.
   */
  #refreshRoadContext(): void {
    const network = this.#network;
    const sampler = this.#sampler;
    if (!network || !sampler) {
      this.#roadHalfWidth = 0;
      this.#roadSurface = 'gelaende';
      this.#roadCorrectionTarget = 0;
      return;
    }
    const hit = network.closestPoint(this.vehicle.position.x, this.vehicle.position.z, 40);
    if (!hit) {
      this.#roadHalfWidth = 0;
      this.#roadShoulder = 0;
      this.#roadSurface = 'gelaende';
      this.#roadCorrectionTarget = 0;
      return;
    }
    // **Gegen `#groundBase` und nicht gegen den rohen Sampler.** Die Korrektur
    // wird später auf genau diese Grundlage addiert; bildet man sie gegen eine
    // andere, wird die Differenz doppelt gezählt. Gemessen stand das Auto damit
    // in der Stadt **97,3 cm zu hoch** — exakt die Höhe der Stadtplatte, einmal
    // von der Platte und einmal von der Korrektur.
    //
    // Gedeckelt, weil ein Treffer 40 m entfernt an einem Steilhang eine Korrektur
    // von zig Metern ergäbe — und die Blendung unten wendet sie ohnehin nur in
    // Fahrbahnnähe an. 6 m ist mehr als der größte gemessene Wert (4,30 m auf
    // `zufahrt`) und weniger als jeder Betrag, der aus einem Fehler stammt.
    this.#roadCorrectionTarget = clamp(
      hit.y + ROAD_MESH.surfaceOffset - this.#groundBase(hit.x, hit.z),
      -6,
      6,
    );
    this.#roadHalfWidth = hit.width / 2;
    // Die Bankettbreite steckt nicht im Treffer, wohl aber der Streckentyp — und
    // die Straßen der Karte haben ihre Bankettbreite je Typ.
    this.#roadShoulder = shoulderFor(hit.roadId, network);
    this.#roadSurface = hit.surface === 'kies' ? 'kies' : 'asphalt';
  }

  /**
   * Die Korrektur ihrem Ziel nachführen, mit begrenzter Rate.
   *
   * `dt <= 0` heißt „sofort" — das braucht das Absetzen des Autos (`placeAt`),
   * denn dort gibt es keine Vorgeschichte, an die man sich anschmiegen könnte.
   *
   * 3 m/s sind bei 60 Hz 5 cm je Schritt. Der gemessene Sprung von 1,36 m ist
   * damit nach 0,45 s abgebaut; solange steht das Auto einige Zentimeter neben
   * der Fahrbahnoberkante, und das ist die Sorte Fehler, die man nicht sieht.
   */
  #followRoadCorrection(dt: number): void {
    if (dt <= 0) {
      this.#roadCorrection = this.#roadCorrectionTarget;
      return;
    }
    const step = CORRECTION_RATE * dt;
    const delta = this.#roadCorrectionTarget - this.#roadCorrection;
    this.#roadCorrection += clamp(delta, -step, step);
  }

  /**
   * Gelände plus Stadtplatte — die Grundlage, auf die die Fahrbahnkorrektur kommt.
   *
   * `districtBlend` ist **dieselbe** Funktion, mit der der Baker den Distrikt
   * einebnet und der Straßengenerator die Stadtstraße auf Stadthöhe hebt. Sie hier
   * ein zweites Mal hinzuschreiben hieße, dass die Fahrbahn und der Boden, auf dem
   * das Auto steht, verschiedenen Rampen folgen.
   *
   * Als Auslaufweite die **Schürzenbreite** und nicht `CITY_PAD_FEATHER`: die
   * Schürze ist das, was man sieht. Sie ist im Mesh eine Gerade und hier eine
   * Smoothstep-Kurve — über 24 m und 97 cm Höhenunterschied liegen dazwischen
   * höchstens 12 cm, und zwar nur auf halber Rampe.
   *
   * Eine eigene Methode, weil sie an **zwei** Stellen gebraucht wird: hier und
   * beim Bilden der Korrektur. Genau dort ist der Fehler entstanden, gegen den der
   * Kommentar in `#refreshRoadContext` steht.
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
    // Über die Fahrbahnkante geblendet (Begründung im Kopf, Punkt 2).
    if (this.#roadCorrection !== 0 && this.#roadHalfWidth > 0 && this.#network) {
      const distance = this.#network.distanceToNearestRoad(x, z, this.#roadHalfWidth + 4);
      if (distance < Infinity) {
        // Volle Korrektur bis zur halben Fahrbahnbreite, dann über einen halben
        // Meter auslaufend.
        const fade = 1 - clamp01((distance - this.#roadHalfWidth) / 0.5);
        y += this.#roadCorrection * fade;
      }
    }

    const plateau = this.collision.plateauTop(x, z);
    return plateau > y ? plateau : y;
  }

  normal(x: number, z: number, target: Vector3): Vector3 {
    const sampler = this.#sampler;
    if (!sampler) return target.set(0, 1, 0);
    // **Die Gelände-Normale, auch auf einem Plateau.** Ein Bürgersteig ist
    // waagerecht, das Gelände darunter im Distrikt ebenfalls (der Baker ebnet ihn
    // ein, Schritt 5d) — der Unterschied ist damit auf dieser Karte nicht
    // messbar. Auf einer Plattform an einem Hang wäre er es, und dann gehört hier
    // eine Abfrage der Plateau-Neigung hin.
    return sampler.getNormalAt(x, z, target);
  }

  surface(x: number, z: number): Surface {
    if (this.#roadHalfWidth <= 0 || !this.#network) return 'gelaende';
    const reach = this.#roadHalfWidth + this.#roadShoulder;
    const distance = this.#network.distanceToNearestRoad(x, z, reach + 2);
    return distance <= reach ? this.#roadSurface : 'gelaende';
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
    folder.addButton({ title: 'Auf die Straße setzen (R)' }).on('click', () => {
      this.respawn();
    });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('keyup', this.#onKeyUp);
    window.removeEventListener('blur', this.#onBlur);

    if (this.#group) {
      this.#context?.scene.remove(this.#group);
      this.#group = null;
    }
    this.#wheels?.dispose();
    this.#wheels = null;
    this.#body = null;
    for (const geometry of this.#geometries) geometry.dispose();
    this.#geometries.length = 0;
    this.#material?.dispose();
    this.#material = null;
    this.collision.clear();
    this.#sampler = null;
    this.#network = null;
    this.#context = null;
  }
}

/**
 * Wie schnell die Fahrbahnkorrektur ihrem Ziel folgen darf, in m/s.
 *
 * Herleitung bei `#roadCorrectionTarget`.
 */
const CORRECTION_RATE = 3;

/** Der Teil des `FreeFlyController`, den dieses System braucht. */
interface FlyController {
  setEnabled(value: boolean): void;
  setInputDelegate(delegate: FlyInputDelegate | null): void;
  placeAt(position: Vector3, lookAt: Vector3): void;
}

/** Bankettbreite der Strecke, zu der ein Treffer gehört. */
function shoulderFor(roadId: string, network: RoadNetwork): number {
  const road = network.roads.find((r) => r.id === roadId);
  return road ? ROAD_TYPES[road.type].shoulder : 0;
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
