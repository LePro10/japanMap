import {
  Box3,
  ClampToEdgeWrapping,
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  RedIntegerFormat,
  Sphere,
  SphereGeometry,
  UnsignedShortType,
  Vector3,
  type PerspectiveCamera,
} from 'three';

import { TERRAIN, TERRAIN_LAYERS } from '@/config/terrain.config';
import { WORLD } from '@/config/world.config';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { createLayerArray } from './materials/createLayerArray';
import {
  createTerrainDepthMaterial,
  createTerrainUniforms,
  TerrainMaterial,
  type TerrainUniforms,
} from './materials/TerrainMaterial';
import { TERRAIN_ASSETS, LAYER_TEXTURES } from './terrainAssets';
import { TerrainSampler } from './TerrainSampler';

const DEBUG_VIEWS = {
  Aus: 0,
  'Splat-Gewichte': 1,
  Normalen: 2,
  Neigung: 3,
  Sonnenverschattung: 4,
  Himmelssicht: 5,
} as const;

/**
 * Das Terrain — PLAN.md P1 / 1.3.
 *
 * In P1 bewusst **ohne LOD**: ein einzelnes Gitter über die ganze Welt. Das ist
 * auf der Zielhardware knapp und genau deshalb richtig — es liefert die
 * Vergleichszahl, an der sich der Quadtree in P4 messen lassen muss.
 */
export class TerrainSystem implements System {
  readonly name = 'TerrainSystem';

  #sampler: TerrainSampler | null = null;
  #mesh: Mesh | null = null;
  #marker: Mesh | null = null;
  #uniforms: TerrainUniforms | null = null;
  #material: TerrainMaterial | null = null;
  #camera: PerspectiveCamera | null = null;
  #context: EngineContext | null = null;

  readonly #forward = new Vector3();
  readonly #hit = new Vector3();

  readonly #readouts = {
    hoeheUeberGrund: '—',
    fadenkreuz: '—',
  };

  /**
   * Der Atmosphären-Block kommt beim Konstruieren, nicht über den EventBus.
   *
   * Das Ereignismuster von `terrain:ready` passt hier nicht: es funktioniert
   * nur, wenn der Empfänger **vor** dem Sender initialisiert wird. Terrain und
   * Wasser brauchen den Block aber schon beim Bauen ihrer Materialien, also
   * nachdem das AtmosphereSystem gelaufen ist. Eine Abhängigkeit an der
   * Registrierungsstelle sichtbar zu machen ist ehrlicher, als das Ereignis
   * nachträglich zwischenzuspeichern.
   */
  constructor(private readonly atmosphere: AtmosphereUniforms) {}

  get sampler(): TerrainSampler | null {
    return this.#sampler;
  }

  async init(context: EngineContext): Promise<void> {
    this.#context = context;
    this.#camera = context.camera;

    const sampler = await TerrainSampler.load(context.resources);
    this.#sampler = sampler;

    const anisotropy = context.renderer.capabilities.getMaxAnisotropy();
    const [normal, zones, albedoArray, normalArray, armArray] = await Promise.all([
      // flipY: false ist hier keine Kosmetik. Die gebackenen Karten sind
      // zeilenweise von Nord (-Z) nach Süd (+Z) gespeichert, und der Shader
      // liest sie mit v = (z + half) / size. Mit dem Standard flipY = true
      // stünde die Zonenmaske spiegelverkehrt zur Höhe: Strandtextur im
      // Gebirge, Fels am Wasser.
      context.resources.texture(TERRAIN_ASSETS.normal, {
        srgb: false,
        wrap: 'clamp',
        flipY: false,
      }),
      context.resources.texture(TERRAIN_ASSETS.zones, {
        srgb: false,
        wrap: 'clamp',
        flipY: false,
      }),
      createLayerArray(LAYER_TEXTURES.albedo, { srgb: true, anisotropy, label: 'albedo' }),
      createLayerArray(LAYER_TEXTURES.normal, { srgb: false, anisotropy, label: 'normal' }),
      createLayerArray(LAYER_TEXTURES.arm, { srgb: false, anisotropy, label: 'arm' }),
    ]);

    for (const texture of [albedoArray, normalArray, armArray]) {
      context.resources.track(texture);
    }

    const heightmap = context.resources.track(this.#createHeightTexture(sampler));

    const uniforms = createTerrainUniforms({
      heightmap,
      normal,
      zones,
      albedoArray,
      normalArray,
      armArray,
      heightRange: sampler.meta.heightmap.heightRange,
      minHeight: sampler.meta.world.minHeight,
      resolution: sampler.resolution,
      spacing: sampler.spacing,
      zonesRes: sampler.meta.zones.res,
      normalRes: sampler.meta.heightmap.res,
    });
    this.#uniforms = uniforms;

    const material = new TerrainMaterial(uniforms, this.atmosphere);
    this.#material = material;

    const mesh = new Mesh(this.#createGeometry(), material);
    mesh.name = 'Terrain';
    // Die Flags bleiben gesetzt, obwohl die Verschattung seit P2 gebacken ist
    // (shade.png). Sie kosten nichts: die Sonne hat `castShadow = false`, damit
    // rendert three gar keine Schattenkarte und übersetzt das Material ohne die
    // Shadow-Chunks. Der Schalter „Schatten" im Licht-Ordner schaltet die
    // Echtzeit-Variante aus P1 zum Vergleich wieder zu — dann liegen beide
    // übereinander, und genau das soll man sehen.
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.customDepthMaterial = createTerrainDepthMaterial(uniforms);
    mesh.matrixAutoUpdate = false;
    this.#mesh = mesh;

    context.scene.add(mesh);
    context.bus.emit('terrain:ready', {
      sampler,
      height: uniforms,
    });
    this.#registerDebug(context);
  }

  /**
   * Heightmap als Integer-Textur.
   *
   * R16UI statt einer normalisierten 16-bit-Textur: `RedFormat` +
   * `UnsignedShortType` bildet three auf R16 ab, und das existiert in WebGL2
   * nur mit EXT_texture_norm16 — ohne die Erweiterung entsteht eine ungültige
   * Formatkombination, die als schwarze Textur endet, nicht als Fehler.
   * Gefiltert wird ohnehin von Hand im Shader, damit CPU und GPU denselben
   * Wert bekommen; die Hardware-Filterung fehlt also nicht.
   */
  #createHeightTexture(sampler: TerrainSampler): DataTexture {
    const texture = new DataTexture(
      sampler.raw,
      sampler.resolution,
      sampler.resolution,
      RedIntegerFormat,
      UnsignedShortType,
    );
    texture.name = 'TerrainHeightmap';
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  #createGeometry(): PlaneGeometry {
    const segments = TERRAIN.gridVertices - 1;
    const geometry = new PlaneGeometry(WORLD.size, WORLD.size, segments, segments);
    // Rotation in die Geometrie backen: danach sind Objekt- und Weltraum
    // identisch, und `transformed.xz` im Vertex-Shader sind direkt
    // Weltkoordinaten. Eine Rotation am Mesh würde diese Gleichheit brechen.
    geometry.rotateX(-Math.PI / 2);

    // Die Hülle muss von Hand gesetzt werden. Die Geometrie ist flach; die
    // Höhe entsteht erst im Vertex-Shader, davon weiß three nichts. Mit der
    // automatisch berechneten Hülle würde das Terrain aus manchen
    // Kamerawinkeln fälschlich weggecullt — und zwar erst dann, wenn man es am
    // wenigsten erwartet: beim Blick von oben auf die Berge.
    geometry.boundingBox = new Box3(
      new Vector3(-WORLD.half, WORLD.minHeight, -WORLD.half),
      new Vector3(WORLD.half, WORLD.maxHeight, WORLD.half),
    );
    const midHeight = (WORLD.minHeight + WORLD.maxHeight) / 2;
    const halfHeight = (WORLD.maxHeight - WORLD.minHeight) / 2;
    geometry.boundingSphere = new Sphere(
      new Vector3(0, midHeight, 0),
      Math.sqrt(2 * WORLD.half * WORLD.half + halfHeight * halfHeight),
    );
    return geometry;
  }

  update(): void {
    const sampler = this.#sampler;
    const camera = this.#camera;
    if (!sampler || !camera) return;

    const ground = sampler.getHeightAt(camera.position.x, camera.position.z);

    if (this.#marker) {
      this.#marker.position.set(camera.position.x, ground, camera.position.z);
      this.#marker.updateMatrix();
    }

    // Die Anzeigen kosten nur dann etwas, wenn die Debug-UI existiert.
    if (!this.#context?.debug) return;

    this.#readouts.hoeheUeberGrund = `${(camera.position.y - ground).toFixed(1)} m`;

    camera.getWorldDirection(this.#forward);
    const hit = sampler.raycast(
      camera.position.x,
      camera.position.y,
      camera.position.z,
      this.#forward.x,
      this.#forward.y,
      this.#forward.z,
      4000,
      this.#hit,
    );
    this.#readouts.fadenkreuz = hit
      ? `${this.#hit.x.toFixed(0)} / ${this.#hit.y.toFixed(0)} / ${this.#hit.z.toFixed(0)}`
      : 'kein Treffer';
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Terrain');
    if (!folder || !this.#uniforms || !this.#material) return;

    const uniforms = this.#uniforms;
    const material = this.#material;

    folder.addBinding(this.#readouts, 'hoeheUeberGrund', {
      readonly: true,
      label: 'Höhe über Grund',
      interval: 150,
    });
    folder.addBinding(this.#readouts, 'fadenkreuz', {
      readonly: true,
      label: 'Fadenkreuz X/Y/Z',
      interval: 200,
    });

    folder.addBinding(uniforms.uHeightScale, 'value', {
      label: 'Höhen-Skalierung',
      min: 0,
      max: 2,
      step: 0.01,
    });
    folder.addBinding(material, 'wireframe', { label: 'Drahtgitter' });
    folder.addBinding(uniforms.uDebugMode, 'value', {
      label: 'Ansicht',
      options: DEBUG_VIEWS,
    });
    folder.addBinding(uniforms.uDetailNormalStrength, 'value', {
      label: 'Detail-Normalen',
      min: 0,
      max: 2,
      step: 0.01,
    });
    folder.addBinding(uniforms.uMacroStrength, 'value', {
      label: 'Makro-Variation',
      min: 0,
      max: 1,
      step: 0.01,
    });

    // Splat-Ebenen einzeln zuschaltbar — das ist die einzige Möglichkeit zu
    // sehen, wo eine Ebene tatsächlich liegt, statt es aus der Mischung zu raten.
    const mask = uniforms.uLayerMask.value;
    const components = ['x', 'y', 'z', 'w'] as const;
    TERRAIN_LAYERS.forEach((layer, index) => {
      const key = components[index];
      if (!key) return;
      folder.addBinding(mask, key, { label: layer.label, min: 0, max: 1, step: 0.01 });
    });

    // Bodenmarkierung: klebt auf getHeightAt() unter der Kamera. Sie ist der
    // Beleg für das P1-Kriterium "Sampler stimmt mit gerenderter Oberfläche
    // überein" — schwebt oder versinkt sie, laufen CPU und Shader auseinander.
    const marker = new Mesh(
      new SphereGeometry(2, 16, 12),
      new MeshBasicMaterial({ color: 0xff4d6d, wireframe: true }),
    );
    marker.name = 'Bodenmarkierung';
    marker.matrixAutoUpdate = false;
    marker.frustumCulled = false;
    this.#marker = marker;
    context.scene.add(marker);
    folder.addBinding(marker, 'visible', { label: 'Bodenmarkierung' });
  }

  dispose(): void {
    const scene = this.#context?.scene;

    if (this.#mesh) {
      scene?.remove(this.#mesh);
      this.#mesh.geometry.dispose();
      this.#mesh.customDepthMaterial?.dispose();
      this.#mesh = null;
    }
    if (this.#marker) {
      scene?.remove(this.#marker);
      this.#marker.geometry.dispose();
      (this.#marker.material as MeshBasicMaterial).dispose();
      this.#marker = null;
    }

    this.#material?.dispose();
    this.#material = null;
    this.#uniforms = null;
    this.#sampler = null;
    this.#camera = null;
    this.#context = null;
  }
}
