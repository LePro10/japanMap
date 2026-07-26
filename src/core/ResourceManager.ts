import {
  ClampToEdgeWrapping,
  LinearSRGBColorSpace,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type DataTexture,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

import type { AppBus } from './events';

/** Alles, was GPU-Speicher hält und wieder freigegeben werden muss. */
export interface DisposableResource {
  dispose(): void;
}

export interface TextureOptions {
  /**
   * true für Albedo/Farbtexturen, false für Datentexturen (Normalmap, ARM,
   * Heightmap, Masken). Falsch gesetzt heißt: Rauheitswerte werden durch die
   * sRGB-Kurve gedreht und das Material sieht ohne erkennbaren Grund falsch aus.
   */
  readonly srgb?: boolean;
  readonly wrap?: 'repeat' | 'clamp';
  readonly anisotropy?: number;
  readonly flipY?: boolean;
}

/**
 * Lädt Assets, cacht sie pro URL und verwaltet ihre Freigabe.
 *
 * Zwei Aufgaben, die sonst regelmäßig schiefgehen:
 *
 *  1. **Doppelte Requests.** Dieselbe Textur von drei Systemen angefordert soll
 *     ein Netzwerk-Request und ein GPU-Upload sein, nicht drei. Der Cache
 *     speichert das Promise, nicht das Ergebnis — dann greift er auch, wenn
 *     zwei Systeme im selben Frame anfragen.
 *
 *  2. **Speicherlecks beim Hot-Reload.** Jede erzeugte Textur und Geometrie
 *     wird registriert. Ohne das wächst der GPU-Speicher bei jedem Vite-HMR-
 *     Zyklus, und nach einer Stunde Entwicklung ist unklar, ob eine Messung
 *     noch etwas bedeutet.
 */
export class ResourceManager {
  readonly #renderer: WebGLRenderer;
  readonly #bus: AppBus;

  readonly #cache = new Map<string, Promise<unknown>>();
  readonly #tracked = new Set<DisposableResource>();

  #textureLoader: TextureLoader | undefined;
  #hdrLoader: HDRLoader | undefined;
  #gltfLoaderPending: Promise<GLTFLoader> | undefined;
  #dracoLoader: DRACOLoader | undefined;
  #ktx2Loader: KTX2Loader | undefined;

  #requested = 0;
  #completed = 0;

  constructor(renderer: WebGLRenderer, bus: AppBus) {
    this.#renderer = renderer;
    this.#bus = bus;
  }

  get progress(): { loaded: number; total: number; ratio: number } {
    const total = this.#requested;
    return {
      loaded: this.#completed,
      total,
      ratio: total === 0 ? 1 : this.#completed / total,
    };
  }

  /** Alle registrierten Ressourcen — Grundlage der Texturspeicher-Schätzung. */
  get tracked(): ReadonlySet<DisposableResource> {
    return this.#tracked;
  }

  /**
   * Meldet eine selbst erzeugte Ressource zur Freigabe an. Für alles, was nicht
   * über die Lade-Methoden hier kommt (prozedurale Geometrie, DataTextures aus
   * dem Terrain-Baker, Render-Targets).
   */
  track<T extends DisposableResource>(resource: T): T {
    this.#tracked.add(resource);
    return resource;
  }

  untrack(resource: DisposableResource): void {
    this.#tracked.delete(resource);
  }

  // ── Laden ──────────────────────────────────────────────────────────────

  async texture(url: string, options: TextureOptions = {}): Promise<Texture> {
    // Die Optionen gehören in den Schlüssel: dieselbe Datei einmal als sRGB und
    // einmal als Datentextur sind zwei verschiedene GPU-Ressourcen.
    const key = `tex:${url}:${options.srgb ? 's' : 'l'}:${options.wrap ?? 'repeat'}:${
      options.anisotropy ?? 0
    }:${options.flipY === false ? '0' : '1'}`;

    return this.#load(key, url, async () => {
      const loader = (this.#textureLoader ??= new TextureLoader());
      const texture = await loader.loadAsync(url);

      texture.colorSpace = options.srgb === true ? SRGBColorSpace : NoColorSpace;
      const wrap = options.wrap === 'clamp' ? ClampToEdgeWrapping : RepeatWrapping;
      texture.wrapS = wrap;
      texture.wrapT = wrap;
      texture.anisotropy = options.anisotropy ?? this.#renderer.capabilities.getMaxAnisotropy();
      if (options.flipY !== undefined) texture.flipY = options.flipY;
      texture.needsUpdate = true;

      return this.track(texture);
    });
  }

  /** Radiance-HDR (.hdr) — die Quelltextur für PMREM / scene.environment. */
  async hdri(url: string): Promise<DataTexture> {
    return this.#load(`hdr:${url}`, url, async () => {
      const loader = (this.#hdrLoader ??= new HDRLoader());
      const texture = await loader.loadAsync(url);
      // HDR-Daten sind linear. Ein sRGB-Tag hier würde das gesamte IBL
      // verfälschen — und zwar plausibel genug, um es lange zu übersehen.
      texture.colorSpace = LinearSRGBColorSpace;
      return this.track(texture);
    });
  }

  /**
   * Gibt eine HDRI-Quelltextur frei und nimmt sie aus dem Cache.
   *
   * Nach `PMREMGenerator.fromEquirectangular()` wird das Original nicht mehr
   * gebraucht — die gefilterte Umgebungskarte ist das, was die Materialien
   * abtasten. 16 MB für ein 2k-HDRI sind es wert.
   *
   * Der Cache-Eintrag muss mit weg. Bliebe er stehen, bekäme der nächste
   * Aufrufer eine bereits freigegebene Textur zurück — und zwar ohne Fehler,
   * nur mit einem schwarzen Ergebnis.
   */
  releaseHdri(url: string, texture: DataTexture): void {
    this.#cache.delete(`hdr:${url}`);
    this.untrack(texture);
    texture.dispose();
  }

  async gltf(url: string): Promise<GLTF> {
    return this.#load(`gltf:${url}`, url, async () => {
      const loader = await (this.#gltfLoaderPending ??= this.#createGltfLoader());
      const gltf = await loader.loadAsync(url);

      gltf.scene.traverse((object) => {
        const mesh = object as { geometry?: DisposableResource };
        if (mesh.geometry) this.track(mesh.geometry);
      });

      return gltf;
    });
  }

  /** Rohe Binärdaten — ab P1 für assets/generated/terrain/height.r16. */
  async binary(url: string): Promise<ArrayBuffer> {
    return this.#load(`bin:${url}`, url, async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.arrayBuffer();
    });
  }

  async json<T>(url: string): Promise<T> {
    return this.#load(`json:${url}`, url, async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return (await response.json()) as T;
    });
  }

  // ── Intern ─────────────────────────────────────────────────────────────

  /**
   * glTF-Kette erst bei Bedarf laden.
   *
   * GLTFLoader samt Draco-, KTX2- und Meshopt-Decodern ist der mit Abstand
   * größte Brocken in three/examples. Vor P5 wird kein Modell geladen — statisch
   * importiert läge das trotzdem im Startbundle und zählte gegen die 15 MB aus
   * SPEC §4, die für das *erste Bild* gelten.
   *
   * Die Decoder-Pfade werden bewusst nicht gesetzt: three löst sie seit r180
   * selbst über `new URL(..., import.meta.url)` auf, und Vite bündelt sie
   * dadurch mit korrekten Hash-Namen. Ein `setDecoderPath()` würde diese
   * Auflösung abschalten und die Dateien ein zweites Mal ausliefern.
   */
  async #createGltfLoader(): Promise<GLTFLoader> {
    const [{ GLTFLoader }, { DRACOLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/loaders/DRACOLoader.js'),
      import('three/examples/jsm/loaders/KTX2Loader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    ]);

    const loader = new GLTFLoader();
    loader.setDRACOLoader((this.#dracoLoader ??= new DRACOLoader()));

    const ktx2 = (this.#ktx2Loader ??= new KTX2Loader());
    // detectSupport muss vor dem ersten Laden passieren — der Transcoder
    // entscheidet daran, in welches GPU-Format er entpackt.
    ktx2.detectSupport(this.#renderer);
    loader.setKTX2Loader(ktx2);

    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
  }

  async #load<T>(key: string, url: string, produce: () => Promise<T>): Promise<T> {
    const cached = this.#cache.get(key);
    if (cached) return cached as Promise<T>;

    this.#requested++;

    const promise = produce().then(
      (value) => {
        this.#completed++;
        this.#bus.emit('resources:progress', {
          loaded: this.#completed,
          total: this.#requested,
          url,
        });
        return value;
      },
      (error: unknown) => {
        // Fehlgeschlagenes aus dem Cache nehmen, sonst ist der Fehler dauerhaft
        // und ein Wiederholungsversuch unmöglich.
        this.#cache.delete(key);
        this.#completed++;
        this.#bus.emit('resources:error', { url, error });
        throw error;
      },
    );

    this.#cache.set(key, promise);
    return promise;
  }

  dispose(): void {
    for (const resource of this.#tracked) {
      resource.dispose();
    }
    this.#tracked.clear();
    this.#cache.clear();

    this.#dracoLoader?.dispose();
    this.#ktx2Loader?.dispose();

    this.#textureLoader = undefined;
    this.#hdrLoader = undefined;
    this.#gltfLoaderPending = undefined;
    this.#dracoLoader = undefined;
    this.#ktx2Loader = undefined;

    this.#requested = 0;
    this.#completed = 0;
  }
}
