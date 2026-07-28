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
  createVegetationUniforms,
  VegetationMaterial,
  type VegetationUniforms,
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

  readonly #shared: VegetationUniforms = createVegetationUniforms();

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
  /** Quadrierter XZ-Abstand je Kandidat — nur zum Sortieren des Durchlaufs. */
  readonly #passDistance = new Map<number, number>();
  #cursor = 0;
  #passOpen = false;
  #newThisFrame = 0;
  #frameStart = 0;

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
    // Look-Anbindung nach dem Muster aus P2 / 2.6: der Controller kennt dieses
    // System nicht, es trägt seinen Abschnitt selbst ein und liest ihn selbst
    // zurück. Nur Windstärke und Streulicht — Dichte und LOD-Grenzen sind
    // Leistungsparameter der Qualitätsstufe, kein Look.
    context.bus.on('look:apply', ({ look }) => {
      this.#shared.uWindStrength.value = look.vegetation.windStrength;
      this.#shared.uVegTranslucency.value = look.vegetation.translucency;
      this.#context?.debug?.refresh();
    });
    context.bus.on('look:collect', ({ target }) => {
      target.vegetation.windStrength = this.#shared.uWindStrength.value;
      target.vegetation.translucency = this.#shared.uVegTranslucency.value;
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

    this.#meshes = createVegetationMeshes(
      Object.fromEntries(SPECIES.map((s) => [s.id, s.variants])),
    );
    this.#quad = createImposterQuad();
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
      const imposter = new ImposterMaterial(atlas, this.atmosphere, this.#shared, 0xffffff);
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
    this.#shared.uWindTime.value += dt;
    if (!this.#sampler || !this.#zones || !this.#context) return;

    const camera = this.#context.camera;
    const started = performance.now();
    this.#frameStart = started;
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

        this.#pass.push(cz * CHUNKS_PER_AXIS + cx);
        this.#passDistance.set(cz * CHUNKS_PER_AXIS + cx, distanceSq);
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
    for (const lod of this.#lods) lod.beginPass();
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
      const chunk = this.#chunk(cx, cz, this.#speciesMask(x0, z0, camera));
      if (!chunk) continue;

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
    if (
      this.#newThisFrame > 0 &&
      performance.now() - this.#frameStart >= SCATTER.newChunkBudgetMs
    ) {
      return null;
    }
    if (!this.#sampler || !this.#zones) return null;

    this.#newThisFrame++;
    // Was schon gestreut war, bleibt drin: die Maske wird vereinigt, nicht
    // ersetzt. Sonst verlöre ein Chunk beim Wegfliegen seine Gräser und bekäme
    // sie beim Zurückkommen erneut gestreut — dieselbe Arbeit zweimal.
    const wanted = mask | (cached?.generated ?? 0);
    const chunk = scatterChunk(cx, cz, wanted, {
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
      const far = SPECIES[s]!.lodDistances[2];
      if (distanceSq <= far * far) mask |= 1 << s;
    }
    return mask;
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
    this.#context = null;
  }
}
