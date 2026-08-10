import {
  Box3,
  Frustum,
  Group,
  Matrix4,
  Vector3,
  type BufferGeometry,
  type PerspectiveCamera,
} from 'three';

import {
  DEFAULT_QUALITY,
  LOD_BIAS_MIN,
  QUALITY,
  VEGETATION_RANGE_MAX,
  type QualityKey,
} from '@/config/quality.config';
import {
  GROUND_AO,
  SCATTER,
  SPECIES,
  VEGETATION_LOOK,
  type SpeciesSettings,
} from '@/config/vegetation.config';
import { WORLD } from '@/config/world.config';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { ImposterMaterial } from '../materials/ImposterMaterial';
import type { TerrainHeightUniforms } from '../materials/TerrainMaterial';
import { GroundAoDecals } from './GroundAoDecals';
import {
  createVegetationUniforms,
  VegetationMaterial,
  type VegetationUniforms,
} from '../materials/VegetationMaterial';
import type { PropClearance } from '../props/PropClearance';
import type { RoadNetwork } from '../roads/RoadNetwork';
import type { TerrainSampler } from '../TerrainSampler';
import { ImposterAtlas } from './ImposterAtlas';
import { InstancedLOD, LOD_COUNT, type LodStage } from './InstancedLOD';
import { INSTANCE_STRIDE, scatterChunk, type ScatterChunk } from './scatterChunk';
import { ScatterWorkerClient } from './ScatterWorkerClient';
import {
  createImposterQuad,
  createVegetationMeshes,
  type SpeciesMeshes,
} from './vegetationMeshes';
import { ZoneMap } from './ZoneMap';

const CHUNKS_PER_AXIS = WORLD.size / SCATTER.chunkSize;

/**
 * Vegetation — PLAN.md P4 / 4.2 und 4.3.
 *
 * Der Ablauf je Frame ist eine Zeitscheibe über einen **Durchlauf**: die
 * sichtbaren Chunks werden am Anfang eines Durchlaufs eingesammelt, über
 * mehrere Frames abgearbeitet und erst am Ende gemeinsam sichtbar gemacht. Der
 * Grund ist gemessen und steht bei `SCATTER.chunksPerFrame`; die Kurzfassung:
 * ein vollständiges Umsortieren von 60 000 Instanzen kostet mehrere
 * Millisekunden, verteilt auf vier Frames Bruchteile davon, und die
 * Stufenzuordnung darf ruhig vier Frames hinterherhinken.
 *
 * Zwei Dinge macht das System **nicht**:
 *
 *  - Es speichert keine Instanzen. Ein Chunk wird aus Seed und Chunk-Koordinate
 *    gerechnet, und deshalb ist „zweimal laden = identische Platzierung" keine
 *    Eigenschaft, die geprüft werden muss, sondern eine, die nicht anders sein
 *    kann. Der Cache darf jederzeit verworfen werden.
 *  - Es greift auf kein anderes System zu. Höhenfeld und Straßennetz kommen über
 *    `terrain:ready` und `roads:ready`. Deshalb muss es **vor** TerrainSystem und
 *    RoadSystem registriert werden — beide Ereignisse werden genau einmal
 *    gesendet, während jene sich initialisieren.
 */
export class ScatterSystem implements System {
  readonly name = 'ScatterSystem';

  readonly #shared: VegetationUniforms = createVegetationUniforms();

  #context: EngineContext | null = null;
  #group: Group | null = null;
  #zones: ZoneMap | null = null;
  #sampler: TerrainSampler | null = null;
  #network: RoadNetwork | null = null;
  #clearance: PropClearance | null = null;

  #meshes: Readonly<Record<string, SpeciesMeshes>> | null = null;
  #quad: BufferGeometry | null = null;
  #materials: VegetationMaterial[] = [];
  #imposterMaterials: ImposterMaterial[] = [];
  #atlases: ImposterAtlas[] = [];
  #lods: InstancedLOD[] = [];
  #decals: GroundAoDecals | null = null;
  #bakeMs = 0;

  /**
   * Fleckradius je Art in Metern bei Instanzmaßstab 1, oder 0 für „keine".
   *
   * Vorgerechnet, weil er aus zwei Quellen kommt — dem Modellradius der Art und
   * dem Faktor aus der Konfiguration — und sonst für jede der bis zu 4096
   * Instanzen je Durchlauf neu multipliziert würde.
   */
  #aoRadius: number[] = [];

  /** Chunk-Cache. Schlüssel ist `cz * CHUNKS_PER_AXIS + cx`. */
  readonly #cache = new Map<number, ScatterChunk>();
  #clock = 0;

  /**
   * Die Streuung auf einem eigenen Thread (P7 / 7.2). `null`, wenn sie dort
   * nicht läuft — dann streut dieses System selbst weiter, mit derselben
   * Funktion und demselben Ergebnis.
   */
  #worker: ScatterWorkerClient | null = null;
  #workerNote = 'wird gestartet';

  /** Kandidatenliste des laufenden Durchlaufs, als Chunk-Schlüssel. */
  #pass: number[] = [];
  /** Quadrierter XZ-Abstand je Kandidat — nur zum Sortieren des Durchlaufs. */
  readonly #passDistance = new Map<number, number>();
  #cursor = 0;
  #passOpen = false;
  /** Fehlstellen im laufenden Durchlauf — siehe `streaming`. */
  #missesThisPass = 0;
  /** Dieselbe Zahl des letzten **vollständigen** Durchlaufs. */
  #lastPassMisses = Number.POSITIVE_INFINITY;
  #newThisFrame = 0;
  #requestedThisFrame = 0;
  #frameStart = 0;

  #quality: QualityKey = DEFAULT_QUALITY;
  /** Die zuletzt **angewandten** Streuparameter — Vergleichswert, siehe `init()`. */
  #applied = {
    density: QUALITY[DEFAULT_QUALITY].vegetationDensity,
    range: QUALITY[DEFAULT_QUALITY].vegetationRange,
    bias: QUALITY[DEFAULT_QUALITY].lodBias,
  };
  /** Look-Stärke der Bodenverdeckung, gepuffert bis die Flecken existieren. */
  #lookGroundAo: number = VEGETATION_LOOK.groundAo;

  readonly #frustum = new Frustum();
  readonly #viewProjection = new Matrix4();
  readonly #box = new Box3();
  readonly #cameraPosition = new Vector3();
  readonly #forward = new Vector3();

  readonly #readouts = {
    instanzen: '—',
    stufen: '—',
    flecken: '—',
    chunks: '—',
    aufwand: '—',
    worker: '—',
  };

  constructor(private readonly atmosphere: AtmosphereUniforms) {}

  async init(context: EngineContext): Promise<void> {
    this.#context = context;

    this.#worker = new ScatterWorkerClient(
      (key, chunk) => {
        this.#receive(key, chunk);
      },
      (reason) => {
        // Kein Abbruch: ohne Worker streut dieses System selbst weiter. Gemeldet
        // wird es trotzdem, denn der Unterschied ist messbar — die Spitze beim
        // Erzeugen eines Nahchunks kommt damit zurück.
        console.warn(`Streu-Worker nicht verfügbar, es wird im Hauptthread gestreut. ${reason}`);
        this.#worker = null;
        this.#workerNote = `aus: ${reason}`;
        this.#context?.debug?.refresh();
      },
    );

    context.bus.on('terrain:ready', ({ sampler, height }) => {
      this.#sampler = sampler;
      this.#worker?.init(sampler, null, null);
      // Erst hier, nicht in `init()`: die Höhen-Uniforms entstehen im
      // TerrainSystem, und das wird **nach** diesem System initialisiert. Der
      // Fleck-Shader tastet dieselbe Heightmap ab wie das Gelände selbst, und
      // zwar über dieselben Uniform-Objekte — ein Kopieren würde ihn beim
      // Verstellen der Höhenskalierung im Boden zurücklassen.
      this.#createDecals(height);
    });
    // Dieselbe Regel wie bei den Straßen: was ohne die Freiflächen gestreut
    // wurde, hätte Bäume in der Tempelhalle. Der Cache wird verworfen statt
    // nachträglich gefiltert — die Streuung ist deterministisch, das kostet nur
    // Rechenzeit und keine Genauigkeit.
    context.bus.on('props:ready', ({ clearance }) => {
      this.#clearance = clearance;
      this.#worker?.update(null, clearance);
      this.#reset();
    });
    context.bus.on('roads:ready', ({ network }) => {
      this.#network = network;
      // Straßen kommen als letzte. Alles, was ohne sie gestreut wurde, hätte
      // Bäume auf der Fahrbahn — deshalb wird der Cache verworfen statt
      // nachträglich gefiltert.
      this.#worker?.update(network.file, null);
      this.#reset();
    });
    // Look-Anbindung nach dem Muster aus P2 / 2.6: der Controller kennt dieses
    // System nicht, es trägt seinen Abschnitt selbst ein und liest ihn selbst
    // zurück. Nur Windstärke und Streulicht — Dichte und LOD-Grenzen sind
    // Leistungsparameter der Qualitätsstufe, kein Look.
    context.bus.on('look:apply', ({ look }) => {
      this.#shared.uWindStrength.value = look.vegetation.windStrength;
      this.#shared.uVegTranslucency.value = look.vegetation.translucency;
      this.#setGroundAo(look.vegetation.groundAo);
      this.#context?.debug?.refresh();
    });
    context.bus.on('look:collect', ({ target }) => {
      target.vegetation.windStrength = this.#shared.uWindStrength.value;
      target.vegetation.translucency = this.#shared.uVegTranslucency.value;
      target.vegetation.groundAo = this.#shared.uVegBaseAo.value;
    });

    context.bus.on('quality:changed', ({ level }) => {
      // **Verglichen werden die Werte, nicht der Name der Stufe.** Seit P10.2
      // gibt es „Eigen", und dort ändern sich Dichte, Reichweite und
      // Umschaltpunkt, **ohne** dass der Name sich ändert. Ein Abgleich auf den
      // Namen hätte jeden Reglerzug verschluckt: das Menü hätte sich bewegt,
      // die Streuung nicht — genau die Sorte wirkungsloser Regler, die P10.1
      // an `viewDistance` beanstandet hat. `TerrainSystem` prüft aus demselben
      // Grund seine Gitterweite und nicht die Stufe.
      //
      // **Und gemerkt, nicht nachgeschlagen.** `QUALITY.custom` ist ein Getter
      // auf den *aktuellen* Zustand — zum Zeitpunkt dieses Ereignisses stehen
      // dort längst die neuen Werte. Ein Vorher/Nachher über die Tabelle
      // vergliche also zweimal dasselbe und käme immer auf „unverändert". Der
      // Vergleichswert muss der zuletzt **angewandte** sein.
      const after = QUALITY[level];
      const before = this.#applied;
      this.#quality = level;
      this.#applied = {
        density: after.vegetationDensity,
        range: after.vegetationRange,
        bias: after.lodBias,
      };
      if (
        after.vegetationDensity === before.density &&
        after.vegetationRange === before.range &&
        after.lodBias === before.bias
      ) {
        return;
      }
      this.#reset();
    });

    this.#zones = await ZoneMap.load();

    const group = new Group();
    group.name = 'Vegetation';
    group.matrixAutoUpdate = false;
    this.#group = group;

    this.#meshes = createVegetationMeshes(
      Object.fromEntries(SPECIES.map((s) => [s.id, s.variants])),
    );
    this.#quad = createImposterQuad();
    this.#aoRadius = SPECIES.map((species) =>
      species.groundAo ? (this.#meshes?.[species.id]?.radius ?? 0) * species.groundAo.radius : 0,
    );
    const bakeStarted = performance.now();

    for (const species of SPECIES) {
      const meshes = this.#meshes[species.id];
      if (!meshes) throw new Error(`Keine Geometrie für Art „${species.id}".`);

      const material = new VegetationMaterial(
        this.atmosphere,
        this.#shared,
        species.color,
        species.windAmplitude,
      );
      this.#materials.push(material);

      // Gebacken wird aus dem **vollen** Mesh der ersten Variante, nicht aus dem
      // reduzierten. Der Imposter soll die Silhouette der Nahansicht tragen;
      // nimmt man das reduzierte, verliert man den Detailgrad zweimal. Der
      // Rahmen fasst die breiteste aller Varianten (`meshes.radius`).
      const atlas = ImposterAtlas.bake(
        context.renderer,
        meshes.variants[0]!.full,
        species.color,
        meshes.height,
        meshes.radius,
      );
      this.#atlases.push(atlas);
      const imposter = new ImposterMaterial(
        atlas,
        this.atmosphere,
        this.#shared,
        0xffffff,
        species.windAmplitude,
      );
      this.#imposterMaterials.push(imposter);

      const stages: LodStage[][] = meshes.variants.map((variant) => [
        { geometry: variant.full, material },
        { geometry: variant.reduced, material },
        { geometry: this.#quad!, material: imposter },
      ]);

      const lod = new InstancedLOD(
        species,
        stages,
        ScatterSystem.#capacity(species.lodDistances, species.cellSize),
      );
      this.#lods.push(lod);
      for (const mesh of lod.meshes) group.add(mesh);
    }
    this.#bakeMs = performance.now() - bakeStarted;

    context.scene.add(group);
    this.#registerDebug(context);
  }

  /**
   * Alles Gestreute verwerfen und neu anfangen.
   *
   * Die drei Auslöser — Straßen, Freiflächen, Qualitätsstufe — ändern jeweils
   * das Ergebnis der Streuung. Ein Chunk aus der Zeit davor hätte Bäume auf der
   * Fahrbahn oder eine andere Dichte als sein Nachbar, und eine Antwort, die
   * noch unterwegs ist, brächte genau das nachträglich ins Bild. Nachträglich
   * zu filtern statt zu verwerfen wäre der falsche Tausch: neu zu streuen kostet
   * Rechenzeit, nachträglich zu filtern kostet Richtigkeit.
   */
  #reset(): void {
    this.#cache.clear();
    this.#worker?.discard();
    this.#passOpen = false;
    // Nach einem Verwerfen ist wieder nichts bekannt. Ohne diese Zeile meldete
    // `streaming` unmittelbar nach einem Stufenwechsel „fertig", obwohl der
    // Cache gerade geleert wurde — und ein Messlauf hätte den leeren Zustand
    // für den fertigen gehalten.
    this.#lastPassMisses = Number.POSITIVE_INFINITY;
  }

  /**
   * Strömt gerade noch etwas nach?
   *
   * **Gebaut für den Messlauf aus P10.0, und zwar nachdem der ohne dieses
   * Signal danebengegriffen hat.** Er wartete, bis die Instanzzahl über acht
   * Frames unverändert blieb — und bekam am Blickpunkt `reisfeld` auf Ultra
   * **0 Vegetationsinstanzen** gemeldet, mit `stable: true`. Der Grund ist
   * einfach und gemein: *unverändert bei null* sieht genauso aus wie *fertig*.
   * Der Worker hatte in 267 ms noch keine einzige Antwort geliefert.
   *
   * Das ist dieselbe Fehlerklasse wie P8.9 („ein vollständiges Bild einer halb
   * geladenen Welt"), nur eine Ebene höher: dort log das Bild, hier log der
   * Zähler. Die Antwort ist beide Male dieselbe — **nicht das Ergebnis
   * beobachten, sondern die Arbeit fragen.**
   *
   * Wahr, solange (a) noch nie ein Durchlauf vollständig durchgekommen ist,
   * (b) der letzte vollständige Durchlauf Chunks angetroffen hat, die noch
   * fehlten oder unvollständig waren, oder (c) Aufträge beim Worker offen sind.
   */
  get streaming(): boolean {
    return this.#lastPassMisses > 0 || (this.#worker?.inFlight ?? 0) > 0;
  }

  /**
   * Instanzen, die im letzten Durchlauf **keinen Pufferplatz** bekommen haben.
   *
   * Muss null sein. `InstancedLOD.push()` verwirft bei vollem Puffer
   * stillschweigend und zählt nur mit; im Bild sieht das aus wie Popping oder
   * wie eine Lichtung, die es nicht gibt.
   *
   * Bis P10.1 stand die Zahl allein im Debug-Panel. Dort ist sie wertlos für
   * genau den Fall, in dem sie gebraucht wird: die LOD-Grenzen hängen seitdem an
   * der Stufe, die Puffergrößen aber nicht — ein zu knapp bemessener
   * Imposter-Ring fiele erst auf, wenn jemand auf Minimal ins Panel sieht.
   * Deshalb steht sie jetzt in jeder Zelle des Messlaufs.
   */
  get dropped(): number {
    let sum = 0;
    for (const lod of this.#lods) sum += lod.dropped;
    return sum + (this.#decals?.dropped ?? 0);
  }

  /** Ein fertig gestreuter Chunk aus dem Worker. */
  #receive(key: number, chunk: ScatterChunk): void {
    chunk.lastUsed = this.#clock;
    this.#cache.set(key, chunk);
    this.#evict();
  }

  /**
   * Bodenverdeckung einstellen — Fleck **und** Pflanzenfuß in einem Zug.
   *
   * Es ist dieselbe Verdeckung, nur an zwei Orten: der Fleck erreicht die
   * Pflanze nicht (er liegt hinter ihr), die Pflanze erreicht den Boden nicht.
   * Getrennte Regler wären zwei Wege, denselben Übergang gegeneinander zu
   * verstellen — und der Übergang ist genau das, was hier stimmen muss.
   */
  #setGroundAo(value: number): void {
    this.#lookGroundAo = value;
    this.#shared.uVegBaseAo.value = value;
    if (this.#decals) this.#decals.material.strengthUniform.value = value;
  }

  #createDecals(height: TerrainHeightUniforms): void {
    if (this.#decals) return;
    if (!this.#group) {
      throw new Error(
        'terrain:ready kam vor ScatterSystem.init() — die Registrierreihenfolge stimmt nicht.',
      );
    }
    const decals = new GroundAoDecals(height);
    decals.material.strengthUniform.value = this.#lookGroundAo;
    this.#decals = decals;
    this.#group.add(decals.mesh);
    this.#context?.debug?.refresh();
  }

  /**
   * Pufferplätze je Stufe aus der Fläche ihres Rings.
   *
   * Gerechnet wird mit der **geometrischen** Kandidatenzahl, ohne die
   * Annahmequote einzurechnen. Das ist absichtlich großzügig: die Quote hängt an
   * Biom, Neigung und Straßenabstand und ist an einem Waldhang deutlich höher
   * als im Mittel über die Karte. Ein zu kleiner Puffer verwirft Instanzen, und
   * das sieht aus wie Popping — der falsche Ort, um Speicher zu sparen. Gemessen
   * kostet die Vollauslegung über alle vier Arten rund 21 MB, je zur Hälfte
   * Zwischenpuffer und Instanzmatrizen.
   *
   * **Bemessen wird über alle Stufen zugleich, nicht über die eingestellte**
   * (ab P10.1). Die Puffer entstehen einmal beim Start, die LOD-Grenzen hängen
   * seitdem an der Stufe: ein kleinerer `lodBias` schiebt Instanzen aus den
   * Mesh-Stufen in die Imposter-Stufe, deren Ring also **wächst**. Ein für
   * Ultra bemessener Puffer liefe auf Minimal über — und `InstancedLOD.push()`
   * verwirft dann stillschweigend, es zählt nur in `#dropped`. Der ungünstigste
   * Fall ist deshalb: innere Grenzen mit dem kleinsten Bias, äußere mit der
   * größten Reichweite.
   */
  static #capacity(distances: readonly [number, number, number], cellSize: number): number[] {
    const area = cellSize * cellSize;
    const ring = (outer: number, inner: number): number =>
      Math.ceil((Math.PI * (outer * outer - inner * inner)) / area) + 64;
    const d1 = distances[1] * LOD_BIAS_MIN;
    const d2 = distances[2] * VEGETATION_RANGE_MAX;
    return [
      // Die beiden inneren Ringe bekommen ihre Größe aus den **ungeschrumpften**
      // Grenzen: sie sind auf hohen Stufen am größten, und die müssen auch
      // hineinpassen.
      ring(distances[0], 0),
      ring(distances[1], distances[0]),
      // Der äußere aus den geschrumpften — sein Innenrand rückt nach innen,
      // sein Außenrand nach außen, er ist also auf der niedrigsten Stufe mit der
      // weitesten Reichweite am größten.
      ring(d2, Math.min(d1, d2)),
    ];
  }

  update(dt: number): void {
    this.#shared.uWindTime.value += dt;
    if (!this.#sampler || !this.#zones || !this.#context) return;

    const camera = this.#context.camera;
    const started = performance.now();
    this.#frameStart = started;
    this.#newThisFrame = 0;
    this.#requestedThisFrame = 0;

    if (!this.#passOpen) this.#beginPass(camera);
    this.#advancePass(camera);

    if (this.#context.debug) this.#updateReadouts(performance.now() - started);
  }

  #beginPass(camera: PerspectiveCamera): void {
    this.#clock++;
    this.#cameraPosition.copy(camera.position);
    camera.updateMatrixWorld();
    this.#viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.#frustum.setFromProjectionMatrix(this.#viewProjection);

    // Reichweite ist die größte Ferngrenze aller Arten, skaliert mit der Stufe.
    //
    // **Bis P10.1 stand hier ein Deckel statt eines Faktors** — `Math.min(520,
    // viewDistance)` — und der lag auf vier von fünf Stufen über der größten
    // Artenreichweite. Der Kommentar behauptete dabei, 600 m seien „weniger als
    // die 520 m der Bäume". Herleitung und Messtabelle stehen jetzt bei
    // `QualitySettings.vegetationRange`.
    let range = 0;
    for (const species of SPECIES) range = Math.max(range, this.#far(species));

    const cell = SCATTER.chunkSize;
    const centerX = Math.floor((camera.position.x + WORLD.half) / cell);
    const centerZ = Math.floor((camera.position.z + WORLD.half) / cell);
    const reach = Math.ceil(range / cell);

    // Blickrichtung in der XZ-Ebene. Senkrecht nach unten gibt es keine, dann
    // steht `alignment` unten überall auf demselben Wert und die Reihenfolge
    // bleibt die reine Entfernung — was für einen Blick von oben richtig ist.
    camera.getWorldDirection(this.#forward);
    const forwardLength = Math.hypot(this.#forward.x, this.#forward.z);
    const forwardX = forwardLength > 1e-3 ? this.#forward.x / forwardLength : 0;
    const forwardZ = forwardLength > 1e-3 ? this.#forward.z / forwardLength : 0;

    this.#pass.length = 0;
    this.#passDistance.clear();
    for (let cz = centerZ - reach; cz <= centerZ + reach; cz++) {
      if (cz < 0 || cz >= CHUNKS_PER_AXIS) continue;
      for (let cx = centerX - reach; cx <= centerX + reach; cx++) {
        if (cx < 0 || cx >= CHUNKS_PER_AXIS) continue;

        // Grober Vorfilter in XZ, bevor irgendetwas erzeugt wird: der teure
        // Teil ist die Streuung selbst, und ein Chunk hinter der Reichweite
        // soll sie gar nicht erst auslösen.
        const x0 = -WORLD.half + cx * cell;
        const z0 = -WORLD.half + cz * cell;
        const dx = Math.max(x0 - camera.position.x, 0, camera.position.x - (x0 + cell));
        const dz = Math.max(z0 - camera.position.z, 0, camera.position.z - (z0 + cell));
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq > range * range) continue;

        // **Blickrichtung geht in die Reihenfolge ein** (P7 / 7.2). Der
        // Frustum-Test unten entscheidet nur „drin oder draußen"; innerhalb des
        // Bildes ist ein Chunk in der Mitte trotzdem wichtiger als einer am
        // Rand, weil man dorthin fliegt. Der Faktor wächst von 1 in
        // Blickrichtung auf 1 + `SCATTER.viewBias` quer dazu — er verschiebt
        // die Reihenfolge, kehrt sie aber nicht um: ein Chunk in 50 m bleibt
        // vor einem in 300 m, egal wohin die Kamera sieht.
        const toX = x0 + cell * 0.5 - camera.position.x;
        const toZ = z0 + cell * 0.5 - camera.position.z;
        const length = Math.sqrt(toX * toX + toZ * toZ);
        const alignment = length > 1e-3 ? (toX * forwardX + toZ * forwardZ) / length : 1;
        const priority = distanceSq * (1 + SCATTER.viewBias * (1 - alignment) * 0.5);

        this.#pass.push(cz * CHUNKS_PER_AXIS + cx);
        this.#passDistance.set(cz * CHUNKS_PER_AXIS + cx, priority);
      }
    }

    // **Von nah nach fern abarbeiten.** In Zeilenordnung liegt der erste Chunk
    // eines Durchlaufs in der Nordwestecke des Umkreises — also fast immer
    // hinter der Kamera. Der Etat für neue Chunks (unten) ginge dann an
    // Vegetation, die niemand sieht, und der Vordergrund füllte sich zuletzt.
    // Gemessen war das der Unterschied zwischen 13 591 und 50 211 sichtbaren
    // Instanzen nach 85 Frames.
    this.#pass.sort(
      (a, b) => (this.#passDistance.get(a) ?? 0) - (this.#passDistance.get(b) ?? 0),
    );

    this.#cursor = 0;
    this.#passOpen = true;
    this.#missesThisPass = 0;
    for (const lod of this.#lods) lod.beginPass();
    this.#decals?.beginPass();
  }

  #advancePass(camera: PerspectiveCamera): void {
    const cell = SCATTER.chunkSize;
    const end = Math.min(this.#cursor + SCATTER.chunksPerFrame, this.#pass.length);

    for (; this.#cursor < end; this.#cursor++) {
      const key = this.#pass[this.#cursor]!;
      const cx = key % CHUNKS_PER_AXIS;
      const cz = (key - cx) / CHUNKS_PER_AXIS;

      const x0 = -WORLD.half + cx * cell;
      const z0 = -WORLD.half + cz * cell;

      // **Frustum-Vorprüfung, bevor gestreut wird.** Ein Chunk, der nicht im
      // Bild liegt, soll den Etat für neue Chunks nicht verbrauchen. Weil die
      // Höhenausdehnung erst nach dem Streuen bekannt ist, wird hier der volle
      // Höhenbereich der Welt angenommen — eine echte Obermenge der späteren
      // Hülle, die also niemals zu Unrecht verwirft.
      this.#box.min.set(x0, WORLD.minHeight, z0);
      this.#box.max.set(x0 + cell, WORLD.maxHeight + 9, z0 + cell);
      if (!this.#frustum.intersectsBox(this.#box)) continue;

      // Nur die Arten streuen, die auf dieser Entfernung überhaupt gezeichnet
      // werden. Gras endet bei 160 m, Bäume bei 520 m — siehe `ScatterChunk.generated`.
      const mask = this.#speciesMask(x0, z0, camera);
      const chunk = this.#chunk(cx, cz, mask);
      // Zwei Arten von „noch nicht da", und beide zählen: gar kein Chunk (die
      // Antwort des Workers steht aus), oder ein Chunk, dem noch Arten fehlen
      // (er trägt die Bäume, das Gras kommt nach). Ohne den zweiten Fall meldete
      // `streaming` fertig, sobald der erste Baum stand.
      if (!chunk) {
        this.#missesThisPass++;
        continue;
      }
      if ((chunk.generated & mask) !== mask) this.#missesThisPass++;

      // Jetzt die knappe Hülle. Oben Luft für das höchste Modell der größten
      // Art — sonst schneidet das Frustum die Kronen der Bäume ab, deren Fuß
      // knapp unter dem Bildrand liegt.
      this.#box.min.set(x0, chunk.minY, z0);
      this.#box.max.set(x0 + cell, chunk.maxY + 9, z0 + cell);
      if (!this.#frustum.intersectsBox(this.#box)) continue;

      this.#pushChunk(chunk, camera);
    }

    if (this.#cursor >= this.#pass.length) {
      for (const lod of this.#lods) lod.endPass();
      this.#decals?.endPass();
      this.#passOpen = false;
      // Erst hier, nicht je Frame: `streaming` soll eine Aussage über einen
      // **vollständigen** Durchlauf sein. Ein Zwischenstand mitten im Durchlauf
      // hat naturgemäß Fehlstellen vor sich und sagt über den Zustand nichts.
      this.#lastPassMisses = this.#missesThisPass;
    }
  }

  #pushChunk(chunk: ScatterChunk, camera: PerspectiveCamera): void {
    const cameraX = camera.position.x;
    const cameraY = camera.position.y;
    const cameraZ = camera.position.z;
    const decals = this.#decals;
    // Der Fleck ist ein Nahbereichs-Effekt: er multipliziert auf das **fertige**
    // Bild, und in der Ferne läge dort überwiegend Nebel, den er mitverdunkeln
    // würde. Die Ausblendgrenze ist deshalb zugleich die Einsortiergrenze —
    // was jenseits davon liegt, kostet gar nicht erst einen Pufferplatz.
    const aoFar = GROUND_AO.fade[1] * GROUND_AO.fade[1];

    for (let s = 0; s < SPECIES.length; s++) {
      const species = SPECIES[s]!;
      const lod = this.#lods[s];
      const data = chunk.instances[s];
      if (!lod || !data) continue;
      const ao = species.groundAo;
      const aoRadius = this.#aoRadius[s] ?? 0;

      // Quadrierte Grenzen: die Wurzel je Instanz wäre bei 60 000 Instanzen
      // 60 000 unnötige Rechnungen, und verglichen wird ohnehin nur.
      const d = this.#distances(species);
      const near = d[0] * d[0];
      const mid = d[1] * d[1];
      const far = d[2] * d[2];

      for (let i = 0; i < data.length; i += INSTANCE_STRIDE) {
        const x = data[i]!;
        const y = data[i + 1]!;
        const z = data[i + 2]!;
        const dx = x - cameraX;
        const dy = y - cameraY;
        const dz = z - cameraZ;
        const distance = dx * dx + dy * dy + dz * dz;
        if (distance > far) continue;

        if (decals && ao && distance < aoFar) {
          decals.push(x, z, aoRadius * data[i + 3]!, ao.strength);
        }

        const stage = distance < near ? 0 : distance < mid ? 1 : 2;
        lod.push(
          stage,
          data[i + 7]!,
          x,
          y,
          z,
          data[i + 3]!,
          data[i + 4]!,
          data[i + 5]!,
          data[i + 6]!,
        );
      }
    }
  }

  /**
   * Chunk aus dem Cache oder neu gestreut.
   *
   * Das Erzeugen steht unter einem **Zeitbudget**, nicht unter einer Stückzahl —
   * die Begründung samt Messung steht bei `SCATTER.newChunkBudgetMs`. Der erste
   * Chunk eines Frames wird immer erzeugt, damit die Streuung auch bei einem
   * langsamen Frame vorankommt. Übersprungene Chunks kommen im nächsten
   * Durchlauf dran.
   */
  #chunk(cx: number, cz: number, mask: number): ScatterChunk | null {
    const key = cz * CHUNKS_PER_AXIS + cx;
    const cached = this.#cache.get(key);
    if (cached && (cached.generated & mask) === mask) {
      cached.lastUsed = this.#clock;
      return cached;
    }

    // Was schon gestreut war, bleibt drin: die Maske wird vereinigt, nicht
    // ersetzt. Sonst verlöre ein Chunk beim Wegfliegen seine Gräser und bekäme
    // sie beim Zurückkommen erneut gestreut — dieselbe Arbeit zweimal.
    const wanted = mask | (cached?.generated ?? 0);

    const worker = this.#worker;
    if (worker && worker.ready) {
      if (this.#requestedThisFrame < worker.slots) {
        worker.request(key, cx, cz, wanted, QUALITY[this.#quality].vegetationDensity);
        this.#requestedThisFrame++;
      }
      // **Der unvollständige Chunk bleibt derweil im Bild.** Er trägt vielleicht
      // nur die Bäume und noch kein Gras; ihn bis zur Antwort auszublenden hieße,
      // beim Näherkommen kurz einen kahlen Fleck zu zeigen — genau dort, wo man
      // gerade hinschaut. Der synchrone Weg unten hatte das Problem nicht, weil
      // er sofort nachstreute.
      if (cached) {
        cached.lastUsed = this.#clock;
        return cached;
      }
      return null;
    }

    if (
      this.#newThisFrame > 0 &&
      performance.now() - this.#frameStart >= SCATTER.newChunkBudgetMs
    ) {
      return null;
    }
    if (!this.#sampler || !this.#zones) return null;

    this.#newThisFrame++;
    const chunk = scatterChunk(cx, cz, wanted, {
      sampler: this.#sampler,
      zones: this.#zones,
      network: this.#network,
      clearance: this.#clearance,
      density: QUALITY[this.#quality].vegetationDensity,
    });
    chunk.lastUsed = this.#clock;
    this.#cache.set(key, chunk);
    this.#evict();
    return chunk;
  }

  /**
   * Welche Arten ein Chunk in dieser Entfernung braucht.
   *
   * Gemessen wird gegen die **nächste Ecke** des Chunks: ein 64-m-Chunk, dessen
   * nahe Kante gerade noch in der Grasreichweite liegt, braucht Gras — sonst
   * fehlte es auf dem vorderen Streifen jedes Chunks.
   */
  #speciesMask(x0: number, z0: number, camera: PerspectiveCamera): number {
    const cell = SCATTER.chunkSize;
    const dx = Math.max(x0 - camera.position.x, 0, camera.position.x - (x0 + cell));
    const dz = Math.max(z0 - camera.position.z, 0, camera.position.z - (z0 + cell));
    const distanceSq = dx * dx + dz * dz;

    let mask = 0;
    for (let s = 0; s < SPECIES.length; s++) {
      const far = this.#far(SPECIES[s]!);
      if (distanceSq <= far * far) mask |= 1 << s;
    }
    return mask;
  }

  /**
   * Ferngrenze einer Art auf der eingestellten Stufe.
   *
   * Getrennt von `#distances()`, weil sie an zwei Stellen ohne die inneren
   * Grenzen gebraucht wird: für die Reichweite des Durchlaufs und für die
   * Artenmaske je Chunk. Beide müssen **dieselbe** Zahl benutzen — läge die
   * Maske über der Reichweite, würde für Chunks gestreut, die nie gezeichnet
   * werden.
   */
  #far(species: SpeciesSettings): number {
    return species.lodDistances[2] * QUALITY[this.#quality].vegetationRange;
  }

  /**
   * Die drei LOD-Grenzen einer Art auf der eingestellten Stufe.
   *
   * Die beiden inneren skalieren mit `lodBias` (wann wird billiger gezeichnet),
   * die äußere mit `vegetationRange` (wie weit wird überhaupt gezeichnet). Das
   * sind zwei verschiedene Fragen und deshalb zwei Regler — bis P10.1 war es
   * ein Feld, das keine von beiden beantwortet hat.
   *
   * Die Klemmung am Ende ist Notwehr gegen eine Kombination, die es heute nicht
   * gibt: ein hoher `lodBias` mit einer kurzen `vegetationRange` schöbe die
   * mittlere Grenze über die äußere, und dann bekäme die Imposter-Stufe einen
   * Ring negativer Breite.
   */
  #distances(species: SpeciesSettings): [number, number, number] {
    const q = QUALITY[this.#quality];
    const far = species.lodDistances[2] * q.vegetationRange;
    return [
      Math.min(species.lodDistances[0] * q.lodBias, far),
      Math.min(species.lodDistances[1] * q.lodBias, far),
      far,
    ];
  }

  /** Ältesten Chunk verwerfen, wenn der Cache überläuft. */
  #evict(): void {
    if (this.#cache.size <= SCATTER.cacheSize) return;
    let oldestKey = -1;
    let oldest = Infinity;
    for (const [key, chunk] of this.#cache) {
      if (chunk.lastUsed < oldest) {
        oldest = chunk.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey >= 0) this.#cache.delete(oldestKey);
  }

  #updateReadouts(ms: number): void {
    let total = 0;
    let dropped = 0;
    const perStage = [0, 0, 0];
    for (const lod of this.#lods) {
      total += lod.visible;
      dropped += lod.dropped;
      for (let stage = 0; stage < LOD_COUNT; stage++) perStage[stage]! += lod.visibleOnStage(stage);
    }

    this.#readouts.instanzen =
      `${total.toLocaleString('de-DE')}` + (dropped > 0 ? ` · ${dropped} VERWORFEN` : '');
    this.#readouts.stufen = `${perStage[0]} / ${perStage[1]} / ${perStage[2]}`;
    this.#readouts.flecken = this.#decals
      ? `${this.#decals.visible}` +
        (this.#decals.dropped > 0 ? ` · ${this.#decals.dropped} VERWORFEN` : '')
      : '—';
    this.#readouts.chunks = `${this.#cache.size} im Cache · ${this.#pass.length} im Durchlauf`;
    this.#readouts.aufwand = `${ms.toFixed(2)} ms`;

    const worker = this.#worker;
    this.#readouts.worker = worker
      ? worker.ready
        ? `an · ${worker.delivered} Chunks · ${worker.pending} offen · ` +
          `zuletzt ${worker.lastCostMs.toFixed(1)} ms dort`
        : 'startet …'
      : this.#workerNote;
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Vegetation');
    const group = this.#group;
    if (!folder || !group) return;

    folder.addBinding(this.#readouts, 'instanzen', {
      readonly: true,
      label: 'Instanzen',
      interval: 200,
    });
    folder.addBinding(this.#readouts, 'stufen', {
      readonly: true,
      label: 'Nah / Mittel / Fern',
      interval: 200,
    });
    folder.addBinding(this.#readouts, 'flecken', {
      readonly: true,
      label: 'Bodenflecken',
      interval: 200,
    });
    folder.addBinding(this.#readouts, 'chunks', {
      readonly: true,
      label: 'Chunks',
      interval: 300,
    });
    folder.addBinding(this.#readouts, 'aufwand', {
      readonly: true,
      label: 'CPU je Frame',
      interval: 200,
    });
    folder.addBinding(this.#readouts, 'worker', {
      readonly: true,
      label: 'Worker',
      interval: 300,
      multiline: true,
      rows: 2,
    });
    folder.addBinding({ bake: `${this.#bakeMs.toFixed(0)} ms` }, 'bake', {
      readonly: true,
      label: 'Imposter-Bake',
    });

    folder.addBinding(group, 'visible', { label: 'Sichtbar' });
    folder.addBinding(this.#shared.uWindStrength, 'value', {
      label: 'Windstärke',
      min: 0,
      max: 3,
      step: 0.01,
    });
    folder.addBinding(this.#shared.uVegTranslucency, 'value', {
      label: 'Streulicht (Blätter)',
      min: 0,
      max: 2,
      step: 0.01,
    });

    // Die Flecken entstehen erst mit `terrain:ready`, also nach diesem Aufruf.
    // Der Regler greift deshalb über einen Umweg auf sie zu und schreibt den
    // Wert auch dann, wenn es sie noch nicht gibt — sonst stünde er beim
    // ersten Verstellen ins Leere.
    const groundAo = { value: this.#lookGroundAo };
    folder
      .addBinding(groundAo, 'value', { label: 'Bodenverdeckung', min: 0, max: 2, step: 0.01 })
      .on('change', (event: { value: number }) => this.#setGroundAo(event.value));

    // Ein Regler für alle Imposter zugleich: die Schwelle ist eine Eigenschaft
    // des Verfahrens, nicht der Art. Getrennt einzustellen hieße, vier Werte zu
    // kalibrieren, wo einer die Frage beantwortet.
    const cutoff = { value: this.#imposterMaterials[0]?.alphaTestUniform.value ?? 0 };
    folder
      .addBinding(cutoff, 'value', { label: 'Imposter-Schwelle', min: 0.05, max: 0.9, step: 0.01 })
      .on('change', (event: { value: number }) => {
        for (const material of this.#imposterMaterials) {
          material.alphaTestUniform.value = event.value;
        }
      });

    // Stufen einzeln abschaltbar: das ist die Prüfung, mit der sich der
    // Übergang zwischen Mesh und Imposter überhaupt beurteilen lässt — man
    // schaltet die eine Stufe aus und sieht, was die andere daraus macht.
    const labels: readonly string[] = ['Stufe nah', 'Stufe mittel', 'Stufe fern'];
    for (let stage = 0; stage < LOD_COUNT; stage++) {
      const state = { on: true };
      folder
        .addBinding(state, 'on', { label: labels[stage] ?? `Stufe ${stage}` })
        .on('change', (event: { value: boolean }) => {
          // Der Name trägt die Stufe: `art:vN:lodM` für die Mesh-Stufen,
          // `art:imposter` für die dritte. Über den Index zu gehen wäre seit den
          // Varianten falsch — die Eimer sind nach Variante gruppiert.
          const suffix = stage < 2 ? `lod${stage}` : 'imposter';
          for (const lod of this.#lods) {
            for (const mesh of lod.meshes) {
              if (mesh.name.endsWith(suffix)) mesh.visible = event.value;
            }
          }
        });
    }
  }

  dispose(): void {
    const scene = this.#context?.scene;
    if (this.#group) {
      scene?.remove(this.#group);
      this.#group = null;
    }
    for (const lod of this.#lods) lod.dispose();
    this.#lods = [];
    this.#decals?.dispose();
    this.#decals = null;
    for (const material of this.#materials) material.dispose();
    this.#materials = [];
    for (const material of this.#imposterMaterials) material.dispose();
    this.#imposterMaterials = [];
    for (const atlas of this.#atlases) atlas.dispose();
    this.#atlases = [];
    this.#quad?.dispose();
    this.#quad = null;
    if (this.#meshes) {
      for (const meshes of Object.values(this.#meshes)) {
        for (const variant of meshes.variants) {
          variant.full.dispose();
          variant.reduced.dispose();
        }
      }
      this.#meshes = null;
    }
    this.#cache.clear();
    this.#worker?.dispose();
    this.#worker = null;
    this.#context = null;
  }
}
