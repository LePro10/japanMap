import {
  Box3,
  Frustum,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Material,
  type PerspectiveCamera,
} from 'three';

import {
  PROPS,
  PROP_CLASSES,
  PROP_CLEARANCE,
  type PropFile,
  type PropPlacement,
  type PropScale,
} from '@/config/props.config';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { PropMaterial } from '../materials/PropMaterial';
import type { TerrainSampler } from '../TerrainSampler';
import { createLandmarkMeshes, type LandmarkId } from './landmarkMeshes';
import { PropClearance } from './PropClearance';
import { modelUrl, PROP_ASSETS, type ModelManifest } from './propAssets';

/** Eine Stufe eines Assets: Geometrie plus die Instanzen, die sie zeichnet. */
interface PropStage {
  readonly mesh: InstancedMesh;
  readonly scratch: Float32Array;
  count: number;
}

interface PropAsset {
  readonly id: string;
  readonly stages: PropStage[];
  /** Hüllkugel der vollen Stufe, für das Culling. */
  readonly bounds: Sphere;
  readonly klasse: PropScale;
  /** Höhe des Modells in Metern bei Maßstab 1 — nur für die Debug-Anzeige. */
  readonly height: number;
  readonly placements: PlacedProp[];
}

interface PlacedProp {
  readonly x: number;
  readonly z: number;
  /** Weltdrehung um Y in Radiant. */
  readonly rot: number;
  readonly scale: number;
  /** Endgültige Höhe, beim Laden aus dem Sampler oder aus der Datei. */
  y: number;
  /** Aus der Datei; wird nach dem Aufsetzen einmal aufgeschlagen. */
  readonly yOffset: number;
  /** `true`, sobald die Höhe endgültig ist. */
  gesetzt: boolean;
}

/** Eine Geometriestufe mit dem Material, das sie zeichnet. */
interface StageSource {
  readonly geometry: BufferGeometry;
  readonly material: Material;
}

/**
 * Landmarks und Requisiten — PLAN.md P5 / 5.3 und 5.5.
 *
 * **Props werden gesetzt, nicht gestreut.** Das ist der ganze Unterschied zum
 * Streu-System aus P4 und der Grund, warum dieses System viel einfacher ist:
 * es gibt keine Chunks, keinen Cache, keine Zeitscheiben. Die Platzierungen
 * stehen in `assets/props.json`, es sind einige hundert, und alle passen in
 * eine Schleife je Frame. Gemessen kostet die 630 Einträge dieser Karte
 * weniger als eine Zehntel-Millisekunde — der Aufwand einer Chunk-Verwaltung
 * wäre hier reine Komplexität ohne Gegenwert.
 *
 * Zwei Quellen für Geometrie, und beide gehören dazu:
 *
 *  - **Prozedurale Landmarks** (`landmarkMeshes.ts`) für alles Japanische. Der
 *    Katalog von Poly Haven hat davon nichts; die Begründung steht dort.
 *  - **Fremdmodelle** aus der Pipeline von 5.1 für Felsen und die Mole, wo
 *    echte Geometrie besser ist als gerechnete.
 *
 * Die Höhe kommt aus dem `TerrainSampler`, nicht aus der Datei — dann sitzt ein
 * Prop auch nach einem neuen Terrain-Bake noch auf dem Boden. Angegeben wird
 * sie nur, wo das falsch wäre: die Mole steht über dem Wasser, Boote schwimmen
 * darauf, Tetrapoden liegen halb darin.
 */
export class PropSystem implements System {
  readonly name = 'PropSystem';

  #context: EngineContext | null = null;
  #group: Group | null = null;
  #sampler: TerrainSampler | null = null;
  #assets: PropAsset[] = [];
  #materials: Material[] = [];
  #geometries: BufferGeometry[] = [];
  #placed = false;

  readonly #frustum = new Frustum();
  readonly #viewProjection = new Matrix4();
  readonly #sphere = new Sphere();
  readonly #box = new Box3();
  readonly #center = new Vector3();

  readonly #readouts = { sichtbar: '—', platzierungen: '—', freiflaechen: '—', aufwand: '—' };

  constructor(private readonly atmosphere: AtmosphereUniforms) {}

  async init(context: EngineContext): Promise<void> {
    this.#context = context;

    context.bus.on('terrain:ready', ({ sampler }) => {
      this.#sampler = sampler;
      this.#snapToTerrain();
    });

    const group = new Group();
    group.name = 'Props';
    group.matrixAutoUpdate = false;
    this.#group = group;

    const [file, manifest] = await Promise.all([
      context.resources.json<PropFile>(PROP_ASSETS.placements),
      context.resources.json<ModelManifest>(PROP_ASSETS.manifest),
    ]);

    const material = new PropMaterial(this.atmosphere);
    this.#materials.push(material);

    // Nach Asset gruppieren: ein `InstancedMesh` je Asset und Stufe, nie je
    // Platzierung. Bei 322 Tetrapoden wäre das Gegenteil 322 Draw-Calls.
    const byAsset = new Map<string, PropPlacement[]>();
    for (const placement of file.props) {
      const list = byAsset.get(placement.id);
      if (list) list.push(placement);
      else byAsset.set(placement.id, [placement]);
    }

    const landmarks = createLandmarkMeshes();
    for (const geometry of Object.values(landmarks)) this.#geometries.push(geometry);

    for (const [id, placements] of byAsset) {
      const sources = await this.#geometryFor(id, landmarks, manifest, context, material);
      if (!sources.length) {
        console.warn(`PropSystem: kein Asset „${id}" — ${placements.length} Platzierungen fallen weg.`);
        continue;
      }
      this.#assets.push(this.#createAsset(id, sources, placements, group));
    }

    // Freiflächen bekanntgeben, **bevor** irgendetwas gestreut wurde. Die
    // Streuung hört darauf und verwirft ihren Cache; passierte das später,
    // stünden die zuerst erzeugten Chunks weiter voller Bäume.
    const clearance = new PropClearance();
    for (const placement of file.props) {
      const radius = PROP_CLEARANCE[placement.id];
      if (radius) clearance.add(placement.x, placement.z, radius * placement.scale);
    }
    this.#readouts.freiflaechen = `${clearance.count} Kreise`;
    context.bus.emit('props:ready', { clearance });

    context.scene.add(group);
    this.#registerDebug(context);
  }

  /**
   * Geometriestufen eines Assets holen.
   *
   * Prozedurale Landmarks haben genau eine Stufe (Begründung in
   * `landmarkMeshes.ts`), Fremdmodelle bringen ihre Stufen im Manifest mit.
   */
  async #geometryFor(
    id: string,
    landmarks: Readonly<Record<LandmarkId, BufferGeometry>>,
    manifest: ModelManifest,
    context: EngineContext,
    shared: Material,
  ): Promise<StageSource[]> {
    const landmark = landmarks[id as LandmarkId];
    if (landmark) return [{ geometry: landmark, material: shared }];

    const entry = manifest.assets[id];
    if (!entry) return [];

    const stages: StageSource[] = [];
    for (const stage of entry.stufen) {
      const gltf = await context.resources.gltf(modelUrl(stage.datei));
      // Die Pipeline führt jedes Modell auf **ein** Primitiv zusammen (`join`);
      // trotzdem wird gesucht statt angenommen — ein Modell mit zwei
      // Materialien behält zwei, und dann ist das erste Mesh nicht alles.
      const meshes: Mesh[] = [];
      gltf.scene.traverse((object) => {
        if ((object as Mesh).isMesh) meshes.push(object as Mesh);
      });
      if (!meshes.length) throw new Error(`Modell „${stage.datei}" enthält kein Mesh.`);
      if (meshes.length > 1) {
        console.warn(
          `PropSystem: „${stage.datei}" hat ${meshes.length} Meshes; nur das erste wird instanziert. ` +
            'Die Pipeline sollte sie mit join() zusammenführen.',
        );
      }
      const mesh = meshes[0]!;
      // Das mitgelieferte Material wird **ersetzt**, nicht übernommen: sonst
      // stünde ein Felsen im Kernschatten des Massivs voll beleuchtet da. Farbe,
      // Rauheit und Texturen wandern dabei mit — die hat die Pipeline gesetzt.
      const material = this.#adoptMaterial(mesh.material);
      this.#materials.push(material);
      stages.push({ geometry: mesh.geometry, material });
    }
    return stages;
  }

  /** Ein glTF-Material auf ein `PropMaterial` mit denselben Werten übertragen. */
  #adoptMaterial(source: Material | Material[]): Material {
    const standard = (Array.isArray(source) ? source[0] : source) as MeshStandardMaterial;
    const material = new PropMaterial(this.atmosphere);
    material.vertexColors = false;
    if (standard?.isMeshStandardMaterial) {
      material.color.copy(standard.color);
      material.roughness = standard.roughness;
      material.metalness = standard.metalness;
      material.map = standard.map;
      material.normalMap = standard.normalMap;
      material.roughnessMap = standard.roughnessMap;
      material.metalnessMap = standard.metalnessMap;
      material.aoMap = standard.aoMap;
      // Photoscans kommen glatt schattiert; das ist bei ihnen richtig, weil
      // ihre Normalen aus der Messung stammen und nicht aus Quadern.
      material.flatShading = false;
    }
    material.needsUpdate = true;
    return material;
  }

  #createAsset(
    id: string,
    sources: readonly StageSource[],
    placements: readonly PropPlacement[],
    group: Group,
  ): PropAsset {
    const first = sources[0]!.geometry;
    first.computeBoundingBox();
    this.#box.copy(first.boundingBox ?? new Box3());
    const height = this.#box.max.y - this.#box.min.y;
    const bounds = new Sphere();
    this.#box.getBoundingSphere(bounds);

    // Größenklasse aus der Höhe. Sie allein entscheidet, wie lange man ein Prop
    // sieht — ein 1-m-Pfosten misst auf 250 m zwei Pixel, ein 14-m-Leuchtturm
    // auf 1500 m immer noch vier.
    const klasse: PropScale = height > 6 ? 'gross' : height > 2 ? 'mittel' : 'klein';

    const stages: PropStage[] = sources.map((source, index) => {
      // Der Puffer wird nach der tatsächlichen Zahl bemessen, gedeckelt durch
      // `PROPS.capacity`: alle Instanzen eines Assets können höchstens
      // gleichzeitig sichtbar sein, mehr Plätze wären totes Gewicht.
      const slots = Math.min(placements.length, PROPS.capacity);
      const mesh = new InstancedMesh(source.geometry, source.material, slots);
      mesh.name = `prop:${id}:lod${index}`;
      // Gecullt wird je Instanz auf der CPU (siehe `update`); die Objektmatrix
      // steht im Ursprung und taugt nicht als Hülle.
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.count = 0;
      group.add(mesh);
      return { mesh, scratch: new Float32Array(slots * 16), count: 0 };
    });

    return {
      id,
      stages,
      bounds,
      klasse,
      height,
      placements: placements.map((p) => ({
        x: p.x,
        z: p.z,
        rot: (p.rot * Math.PI) / 180,
        scale: p.scale,
        // Steht eine Höhe in der Datei, gilt sie; sonst kommt sie aus dem
        // Sampler, sobald das Terrain da ist.
        y: p.y ?? 0,
        yOffset: p.yOffset ?? 0,
        gesetzt: p.y !== undefined,
      })),
    };
  }

  /**
   * Höhen nachtragen, sobald das Terrain steht.
   *
   * Getrennt von `init()`, weil `terrain:ready` erst gesendet wird, während das
   * TerrainSystem sich initialisiert — also **nach** diesem System. Dieselbe
   * Reihenfolge und derselbe Grund wie beim ScatterSystem.
   */
  #snapToTerrain(): void {
    const sampler = this.#sampler;
    if (!sampler) return;
    for (const asset of this.#assets) {
      for (const prop of asset.placements) {
        if (!prop.gesetzt) prop.y = sampler.getHeightAt(prop.x, prop.z);
        prop.y += prop.yOffset;
        prop.gesetzt = true;
      }
    }
    this.#placed = true;
  }

  update(): void {
    const context = this.#context;
    if (!context || !this.#placed) return;
    const started = performance.now();

    const camera = context.camera as PerspectiveCamera;
    camera.updateMatrixWorld();
    this.#viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.#frustum.setFromProjectionMatrix(this.#viewProjection);

    let visible = 0;
    let total = 0;

    for (const asset of this.#assets) {
      for (const stage of asset.stages) stage.count = 0;
      const limits = PROP_CLASSES[asset.klasse];
      const fadeStart = limits.cullDistance * (1 - PROPS.fade);
      total += asset.placements.length;

      for (const prop of asset.placements) {
        const dx = prop.x - camera.position.x;
        const dy = prop.y - camera.position.y;
        const dz = prop.z - camera.position.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance > limits.cullDistance) continue;

        // Weiches Ausblenden über die Größe: das Prop schrumpft in den Boden,
        // statt zu verschwinden. Ein Alpha-Übergang bräuchte ein transparentes
        // Material und damit Sortierung — für ein Dutzend Objekte je Bild der
        // falsche Preis.
        let scale = prop.scale;
        if (distance > fadeStart) {
          scale *= 1 - (distance - fadeStart) / (limits.cullDistance - fadeStart);
        }
        if (scale < 0.02) continue;

        this.#center
          .copy(asset.bounds.center)
          .multiplyScalar(scale)
          .add({ x: prop.x, y: prop.y, z: prop.z } as Vector3);
        this.#sphere.center.copy(this.#center);
        this.#sphere.radius = asset.bounds.radius * scale;
        if (!this.#frustum.intersectsSphere(this.#sphere)) continue;

        const stageIndex =
          asset.stages.length > 1 && distance > limits.lodDistance ? asset.stages.length - 1 : 0;
        const stage = asset.stages[stageIndex]!;
        if (stage.count >= stage.scratch.length / 16) continue;

        const i = stage.count * 16;
        const m = stage.scratch;
        const cos = Math.cos(prop.rot) * scale;
        const sin = Math.sin(prop.rot) * scale;
        m[i] = cos;
        m[i + 1] = 0;
        m[i + 2] = -sin;
        m[i + 3] = 0;
        m[i + 4] = 0;
        m[i + 5] = scale;
        m[i + 6] = 0;
        m[i + 7] = 0;
        m[i + 8] = sin;
        m[i + 9] = 0;
        m[i + 10] = cos;
        m[i + 11] = 0;
        m[i + 12] = prop.x;
        m[i + 13] = prop.y;
        m[i + 14] = prop.z;
        m[i + 15] = 1;
        stage.count++;
        visible++;
      }

      for (const stage of asset.stages) {
        stage.mesh.instanceMatrix.array.set(stage.scratch.subarray(0, stage.count * 16));
        stage.mesh.instanceMatrix.needsUpdate = true;
        stage.mesh.count = stage.count;
      }
    }

    if (context.debug) {
      this.#readouts.sichtbar = `${visible}`;
      this.#readouts.platzierungen = `${total} in ${this.#assets.length} Arten`;
      this.#readouts.aufwand = `${(performance.now() - started).toFixed(3)} ms`;
    }
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Props');
    const group = this.#group;
    if (!folder || !group) return;

    folder.addBinding(this.#readouts, 'sichtbar', { readonly: true, label: 'Sichtbar', interval: 200 });
    folder.addBinding(this.#readouts, 'platzierungen', { readonly: true, label: 'Platzierungen' });
    folder.addBinding(this.#readouts, 'freiflaechen', { readonly: true, label: 'Freiflächen' });
    folder.addBinding(this.#readouts, 'aufwand', { readonly: true, label: 'CPU je Frame', interval: 200 });
    folder.addBinding(group, 'visible', { label: 'Sichtbar' });
  }

  dispose(): void {
    if (this.#group) {
      this.#context?.scene.remove(this.#group);
      for (const asset of this.#assets) {
        for (const stage of asset.stages) stage.mesh.dispose();
      }
      this.#group = null;
    }
    this.#assets = [];
    for (const material of this.#materials) material.dispose();
    this.#materials = [];
    // Nur die prozeduralen Geometrien gehören uns; die aus dem glTF hängen am
    // ResourceManager und werden dort freigegeben — deshalb stehen hier
    // ausschließlich die, die dieses System selbst angelegt hat.
    for (const geometry of this.#geometries) geometry.dispose();
    this.#geometries = [];
    this.#context = null;
  }
}
