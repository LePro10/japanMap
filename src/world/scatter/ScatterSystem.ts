import {
  Box3,
  Frustum,
  Group,
  Matrix4,
  Vector3,
  type BufferGeometry,
  type PerspectiveCamera,
} from 'three';

import { DEFAULT_QUALITY, QUALITY, type QualityLevel } from '@/config/quality.config';
import { SCATTER, SPECIES } from '@/config/vegetation.config';
import { WORLD } from '@/config/world.config';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { ImposterMaterial } from '../materials/ImposterMaterial';
import {
  createWindUniforms,
  VegetationMaterial,
  type WindUniforms,
} from '../materials/VegetationMaterial';
import type { RoadNetwork } from '../roads/RoadNetwork';
import type { TerrainSampler } from '../TerrainSampler';
import { ImposterAtlas } from './ImposterAtlas';
import { InstancedLOD, LOD_COUNT, type LodStage } from './InstancedLOD';
import { INSTANCE_STRIDE, scatterChunk, type ScatterChunk } from './scatterChunk';
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

  readonly #wind: WindUniforms = createWindUniforms();

  #context: EngineContext | null = null;
  #group: Group | null = null;
  #zones: ZoneMap | null = null;
  #sampler: TerrainSampler | null = null;
  #network: RoadNetwork | null = null;

  #meshes: Readonly<Record<string, SpeciesMeshes>> | null = null;
  #quad: BufferGeometry | null = null;
  #materials: VegetationMaterial[] = [];
  #imposterMaterials: ImposterMaterial[] = [];
  #atlases: ImposterAtlas[] = [];
  #lods: InstancedLOD[] = [];
  #bakeMs = 0;

  /** Chunk-Cache. Schlüssel ist `cz * CHUNKS_PER_AXIS + cx`. */
  readonly #cache = new Map<number, ScatterChunk>();
  #clock = 0;

  /** Kandidatenliste des laufenden Durchlaufs, als Chunk-Schlüssel. */
  #pass: number[] = [];
  #cursor = 0;
  #passOpen = false;
  #newThisFrame = 0;

  #quality: QualityLevel = DEFAULT_QUALITY;

  readonly #frustum = new Frustum();
  readonly #viewProjection = new Matrix4();
  readonly #box = new Box3();
  readonly #cameraPosition = new Vector3();

  readonly #readouts = {
    instanzen: '—',
    stufen: '—',
    chunks: '—',
    aufwand: '—',
  };

  constructor(private readonly atmosphere: AtmosphereUniforms) {}

  async init(context: EngineContext): Promise<void> {
    this.#context = context;

    context.bus.on('terrain:ready', ({ sampler }) => {
      this.#sampler = sampler;
    });
    context.bus.on('roads:ready', ({ network }) => {
      this.#network = network;
      // Straßen kommen als letzte. Alles, was ohne sie gestreut wurde, hätte
      // Bäume auf der Fahrbahn — deshalb wird der Cache verworfen statt
      // nachträglich gefiltert.
      this.#cache.clear();
      this.#passOpen = false;
    });
    context.bus.on('quality:changed', ({ level }) => {
      if (level === this.#quality) return;
      this.#quality = level;
      this.#cache.clear();
      this.#passOpen = false;
    });

    this.#zones = await ZoneMap.load();

    const group = new Group();
    group.name = 'Vegetation';
    group.matrixAutoUpdate = false;
    this.#group = group;

    this.#meshes = createVegetationMeshes();
    this.#quad = createImposterQuad();
    const bakeStarted = performance.now();

    for (const species of SPECIES) {
      const meshes = this.#meshes[species.id];
      if (!meshes) throw new Error(`Keine Geometrie für Art „${species.id}".`);

      const material = new VegetationMaterial(
        this.atmosphere,
        this.#wind,
        species.color,
        species.windAmplitude,
      );
      this.#materials.push(material);

      // Gebacken wird aus dem **vollen** Mesh, nicht aus dem reduzierten. Der
      // Imposter soll die Silhouette der Nahansicht tragen; nimmt man das
      // reduzierte, verliert man den Detailgrad zweimal.
      const atlas = ImposterAtlas.bake(
        context.renderer,
        meshes.full,
        species.color,
        meshes.height,
        meshes.radius,
      );
      this.#atlases.push(atlas);
      const imposter = new ImposterMaterial(atlas, this.atmosphere, 0xffffff);
      this.#imposterMaterials.push(imposter);

      const stages: LodStage[] = [
        { geometry: meshes.full, material },
        { geometry: meshes.reduced, material },
        { geometry: this.#quad, material: imposter },
      ];

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
   * Pufferplätze je Stufe aus der Fläche ihres Rings.
   *
   * Gerechnet wird mit der **geometrischen** Kandidatenzahl, ohne die
   * Annahmequote einzurechnen. Das ist absichtlich großzügig: die Quote hängt an
   * Biom, Neigung und Straßenabstand und ist an einem Waldhang deutlich höher
   * als im Mittel über die Karte. Ein zu kleiner Puffer verwirft Instanzen, und
   * das sieht aus wie Popping — der falsche Ort, um Speicher zu sparen. Gemessen
   * kostet die Vollauslegung über alle vier Arten rund 21 MB, je zur Hälfte
   * Zwischenpuffer und Instanzmatrizen.
   */
  static #capacity(distances: readonly [number, number, number], cellSize: number): number[] {
    const area = cellSize * cellSize;
    const ring = (outer: number, inner: number): number =>
      Math.ceil((Math.PI * (outer * outer - inner * inner)) / area) + 64;
    return [
      ring(distances[0], 0),
      ring(distances[1], distances[0]),
      ring(distances[2], distances[1]),
    ];
  }

  update(dt: number): void {
    this.#wind.uWindTime.value += dt;
    if (!this.#sampler || !this.#zones || !this.#context) return;

    const camera = this.#context.camera;
    const started = performance.now();
    this.#newThisFrame = 0;

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

    // Reichweite ist die größte Ferngrenze aller Arten. Die Sichtweite der
    // Qualitätsstufe deckelt sie zusätzlich — auf „Niedrig" sind das 600 m und
    // damit weniger als die 520 m der Bäume ohnehin brauchen, aber die Kopplung
    // gehört hin, sonst hätte die Stufe auf Vegetation nur über die Dichte
    // Einfluss.
    let range = 0;
    for (const species of SPECIES) range = Math.max(range, species.lodDistances[2]);
    range = Math.min(range, QUALITY[this.#quality].viewDistance);

    const cell = SCATTER.chunkSize;
    const centerX = Math.floor((camera.position.x + WORLD.half) / cell);
    const centerZ = Math.floor((camera.position.z + WORLD.half) / cell);
    const reach = Math.ceil(range / cell);

    this.#pass.length = 0;
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
        if (dx * dx + dz * dz > range * range) continue;

        this.#pass.push(cz * CHUNKS_PER_AXIS + cx);
      }
    }

    this.#cursor = 0;
    this.#passOpen = true;
    for (const lod of this.#lods) lod.beginPass();
  }

  #advancePass(camera: PerspectiveCamera): void {
    const cell = SCATTER.chunkSize;
    const end = Math.min(this.#cursor + SCATTER.chunksPerFrame, this.#pass.length);

    for (; this.#cursor < end; this.#cursor++) {
      const key = this.#pass[this.#cursor]!;
      const cx = key % CHUNKS_PER_AXIS;
      const cz = (key - cx) / CHUNKS_PER_AXIS;

      const chunk = this.#chunk(cx, cz);
      if (!chunk) continue;

      const x0 = -WORLD.half + cx * cell;
      const z0 = -WORLD.half + cz * cell;
      // Die Hülle bekommt oben Luft für das höchste Modell der größten Art —
      // sonst schneidet das Frustum die Kronen der Bäume ab, deren Fuß knapp
      // unter dem Bildrand liegt.
      this.#box.min.set(x0, chunk.minY, z0);
      this.#box.max.set(x0 + cell, chunk.maxY + 9, z0 + cell);
      if (!this.#frustum.intersectsBox(this.#box)) continue;

      this.#pushChunk(chunk, camera);
    }

    if (this.#cursor >= this.#pass.length) {
      for (const lod of this.#lods) lod.endPass();
      this.#passOpen = false;
    }
  }

  #pushChunk(chunk: ScatterChunk, camera: PerspectiveCamera): void {
    const cameraX = camera.position.x;
    const cameraY = camera.position.y;
    const cameraZ = camera.position.z;

    for (let s = 0; s < SPECIES.length; s++) {
      const species = SPECIES[s]!;
      const lod = this.#lods[s];
      const data = chunk.instances[s];
      if (!lod || !data) continue;

      // Quadrierte Grenzen: die Wurzel je Instanz wäre bei 60 000 Instanzen
      // 60 000 unnötige Rechnungen, und verglichen wird ohnehin nur.
      const near = species.lodDistances[0] * species.lodDistances[0];
      const mid = species.lodDistances[1] * species.lodDistances[1];
      const far = species.lodDistances[2] * species.lodDistances[2];

      for (let i = 0; i < data.length; i += INSTANCE_STRIDE) {
        const x = data[i]!;
        const y = data[i + 1]!;
        const z = data[i + 2]!;
        const dx = x - cameraX;
        const dy = y - cameraY;
        const dz = z - cameraZ;
        const distance = dx * dx + dy * dy + dz * dz;
        if (distance > far) continue;

        const stage = distance < near ? 0 : distance < mid ? 1 : 2;
        lod.push(stage, x, y, z, data[i + 3]!, data[i + 4]!);
      }
    }
  }

  /**
   * Chunk aus dem Cache oder neu gestreut.
   *
   * Pro Frame werden höchstens `maxNewChunks` erzeugt. Ohne diese Bremse kostet
   * der erste Frame in einem neuen Gebiet die Streuung aller Chunks der
   * Zeitscheibe auf einmal — bei 48 Chunks à rund 3600 Kandidaten ist das ein
   * sichtbarer Ruckler an genau der Stelle, an der man gerade beschleunigt.
   * Übersprungene Chunks kommen im nächsten Durchlauf dran.
   */
  #chunk(cx: number, cz: number): ScatterChunk | null {
    const key = cz * CHUNKS_PER_AXIS + cx;
    const cached = this.#cache.get(key);
    if (cached) {
      cached.lastUsed = this.#clock;
      return cached;
    }
    if (this.#newThisFrame >= SCATTER.maxNewChunks) return null;
    if (!this.#sampler || !this.#zones) return null;

    this.#newThisFrame++;
    const chunk = scatterChunk(cx, cz, {
      sampler: this.#sampler,
      zones: this.#zones,
      network: this.#network,
      density: QUALITY[this.#quality].vegetationDensity,
    });
    chunk.lastUsed = this.#clock;
    this.#cache.set(key, chunk);
    this.#evict();
    return chunk;
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
      for (let stage = 0; stage < LOD_COUNT; stage++) perStage[stage]! += lod.meshes[stage]!.count;
    }

    this.#readouts.instanzen =
      `${total.toLocaleString('de-DE')}` + (dropped > 0 ? ` · ${dropped} VERWORFEN` : '');
    this.#readouts.stufen = `${perStage[0]} / ${perStage[1]} / ${perStage[2]}`;
    this.#readouts.chunks = `${this.#cache.size} im Cache · ${this.#pass.length} im Durchlauf`;
    this.#readouts.aufwand = `${ms.toFixed(2)} ms`;
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
    folder.addBinding({ bake: `${this.#bakeMs.toFixed(0)} ms` }, 'bake', {
      readonly: true,
      label: 'Imposter-Bake',
    });

    folder.addBinding(group, 'visible', { label: 'Sichtbar' });
    folder.addBinding(this.#wind.uWindStrength, 'value', {
      label: 'Windstärke',
      min: 0,
      max: 3,
      step: 0.01,
    });

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
          for (const lod of this.#lods) {
            const mesh = lod.meshes[stage];
            if (mesh) mesh.visible = event.value;
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
        meshes.full.dispose();
        meshes.reduced.dispose();
      }
      this.#meshes = null;
    }
    this.#cache.clear();
    this.#context = null;
  }
}
