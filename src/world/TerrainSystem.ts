import {
  ClampToEdgeWrapping,
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  RedIntegerFormat,
  SphereGeometry,
  UnsignedShortType,
  Vector3,
  type PerspectiveCamera,
} from 'three';

import { LOD, lodMetersPerVertex } from '@/config/lod.config';
import { QUALITY } from '@/config/quality.config';
import { TERRAIN_LAYERS } from '@/config/terrain.config';
import type { EngineContext, System } from '@/core/System';
import type { AtmosphereUniforms } from '@/render/atmosphere/atmosphereUniforms';
import { ChunkManager } from './ChunkManager';
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
  'LOD-Stufen': 6,
  'Morph-Faktor': 7,
} as const;

/**
 * Das Terrain — PLAN.md P1 / 1.3, LOD ab P4 / 4.1.
 *
 * P1 hatte bewusst **kein** LOD: ein einzelnes 768²-Gitter über die ganze Welt,
 * 4,0 m pro Vertex, 1.176.578 Dreiecke je Durchlauf. Das war die Vergleichszahl,
 * an der sich der Quadtree messen lassen musste. Seit P4 wählt der ChunkManager
 * die Knoten aus; das System hier hält nur noch Material, Texturen und die
 * Debug-Anbindung.
 */
export class TerrainSystem implements System {
  readonly name = 'TerrainSystem';

  #sampler: TerrainSampler | null = null;
  #chunks: ChunkManager | null = null;
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
    knoten: '—',
    stufen: '—',
    /**
     * Gitterauflösung und Dreiecke — die Anzeige zu P8.1.
     *
     * Ohne sie ist ein Stufenwechsel im Gelände **nicht nachprüfbar**: die
     * Dreieckszahl im Overlay ist die der ganzen Szene, und die Vegetation
     * ändert sich gleichzeitig mit. Genau diese Vermischung hat in P7 verdeckt,
     * dass „Mittel" und „Niedrig" am Gelände gar nichts sparen.
     */
    gitter: '—',
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

    const chunks = new ChunkManager(sampler);
    this.#chunks = chunks;
    // Erste Auswahl vor dem ersten Frame: sonst rendert das Terrain einen Frame
    // lang mit `instanceCount = 0` — beim Start unsichtbar, beim Hot-Reload ein
    // schwarzer Blitz.
    chunks.select(context.camera);
    uniforms.uLodCamera.value.copy(context.camera.position);

    const mesh = new Mesh(chunks.geometry, material);
    mesh.name = 'Terrain';
    // Gecullt wird pro Knoten auf der CPU. Three dürfte das Mesh sonst als
    // Ganzes verwerfen, sobald seine (fehlende) Hülle aus dem Kegel fällt.
    mesh.frustumCulled = false;
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

    // P8.1 — die Gitterauflösung folgt der Qualitätsstufe.
    //
    // Drei Dinge müssen dabei zusammen wandern, und keines davon merkt man
    // sofort, wenn es fehlt: die Geometrie am Mesh (sonst zeichnet three
    // weiter das alte Gitter, mit korrekten Zählern), das Uniform für den
    // Morph (sonst zieht `fract(g · quads/2)` auf die falschen Nachbarn und
    // das Gitter reißt genau dort auf, wo es dicht sein soll) — und die
    // Hülle des Tiefen-Materials teilt sich die Uniforms ohnehin.
    context.bus.on('quality:changed', ({ level }) => {
      const vertices = QUALITY[level].terrainGridVertices;
      if (vertices === chunks.gridVertices) return;
      chunks.setGridVertices(vertices);
      mesh.geometry = chunks.geometry;
      uniforms.uLodGridQuads.value = vertices - 1;
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

  update(): void {
    const sampler = this.#sampler;
    const camera = this.#camera;
    if (!sampler || !camera) return;

    // Reihenfolge: erst die Auswahl, dann die Uniform. Beide beschreiben
    // denselben Kamerastand, und liefe die Uniform der Auswahl einen Frame
    // hinterher, morphte das Gitter gegen eine Position, die die Auswahl nicht
    // mehr benutzt — sichtbar als kurzes Zucken an den Stufengrenzen.
    if (this.#chunks && this.#uniforms) {
      this.#chunks.select(camera);
      if (!this.#chunks.frozen) this.#uniforms.uLodCamera.value.copy(camera.position);
    }

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

    const stats = this.#chunks?.stats;
    if (stats) {
      this.#readouts.knoten =
        `${stats.nodes} · ${stats.culled} gecullt · ${stats.selectMs.toFixed(2)} ms` +
        (stats.overflow > 0 ? ` · ${stats.overflow} FEHLEN` : '');
      this.#readouts.stufen = stats.perLevel.join(' / ');
    }

    const chunks = this.#chunks;
    if (chunks && stats) {
      const n = chunks.gridVertices;
      this.#readouts.gitter =
        `${n}² · ${lodMetersPerVertex(n).toFixed(1)} m/Vertex · ` +
        `${stats.triangles.toLocaleString('de-DE')} Δ`;
    }
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
    folder.addBinding(this.#readouts, 'knoten', {
      readonly: true,
      label: 'Quadtree-Knoten',
      interval: 200,
    });
    folder.addBinding(this.#readouts, 'stufen', {
      readonly: true,
      label: `Knoten je Stufe (0…${LOD.maxDepth})`,
      interval: 200,
    });
    folder.addBinding(this.#readouts, 'gitter', {
      readonly: true,
      label: 'Knotengitter',
      interval: 200,
    });

    // Auswahl einfrieren und dann weiterfliegen: das ist die einzige Art, die
    // Knotengrenzen von außen zu sehen. Ohne sie sitzt man immer im Zentrum der
    // feinsten Stufe und bekommt die Übergänge nie zu Gesicht — dieselbe Falle,
    // aus der die „FreezeCulling-View" in SPEC §5 entstanden ist.
    const chunks = this.#chunks;
    if (chunks) folder.addBinding(chunks, 'frozen', { label: 'LOD einfrieren' });

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
      this.#mesh.customDepthMaterial?.dispose();
      this.#mesh = null;
    }
    // Die Geometrie gehört dem ChunkManager, nicht dem Mesh — deshalb wird sie
    // dort freigegeben und nicht über `mesh.geometry.dispose()`.
    this.#chunks?.dispose();
    this.#chunks = null;
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
