import { Color, PerspectiveCamera, Scene, type WebGLRenderer } from 'three';

import { QUALITY } from '@/config/quality.config';
import { CAMERA, RENDER } from '@/config/world.config';
import type { DebugHost } from '@/debug/DebugHost';
import { createRenderer, observeCanvasSize, observeContextLoss } from './createRenderer';
import { EventBus } from './EventBus';
import type { AppBus, AppEvents } from './events';
import { RenderLoop } from './RenderLoop';
import { ResourceManager } from './ResourceManager';
import type { EngineContext, System } from './System';

/** Zeichnet den Frame. In P2 ersetzt die PostFX-Kette den Default. */
export type Presenter = (alpha: number) => void;

export class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly bus: AppBus;
  readonly resources: ResourceManager;
  readonly loop: RenderLoop;

  readonly #systems: System[] = [];
  readonly #teardown: Array<() => void> = [];

  #debug: DebugHost | null = null;
  #present: Presenter;
  #initialized = false;
  #disposed = false;
  #width = 1;
  #height = 1;
  #renderScale = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.bus = new EventBus<AppEvents>();
    this.resources = new ResourceManager(this.renderer, this.bus);

    this.scene = new Scene();
    // Bis P1 das Himmels-HDRI setzt: ein sehr dunkles Blau statt Schwarz.
    // Schwarz und "Renderer läuft nicht" sehen sonst identisch aus.
    this.scene.background = new Color(0x0a0e14);

    this.camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
    this.camera.position.set(420, 260, 620);
    this.camera.lookAt(0, 0, 0);

    this.#present = (): void => {
      this.renderer.render(this.scene, this.camera);
    };

    this.loop = new RenderLoop({
      beginFrame: this.#beginFrame,
      fixedUpdate: this.#fixedUpdate,
      update: this.#update,
      render: this.#render,
    });

    // Der Auflösungsfaktor der Qualitätsstufe gehört hierher und nicht in ein
    // System: die Puffergröße ist Sache dessen, der `setSize` besitzt, und ein
    // System, das den Pixelfaktor umstellt, käme an den `resize`-Aufruf der
    // anderen nicht heran. Auf `quality:changed` zu hören ist der schmalste Weg
    // dorthin — die Engine kennt dadurch die Qualitätstabelle, aber kein System.
    this.bus.on('quality:changed', ({ level }) => {
      this.#renderScale = QUALITY[level].renderScale;
      this.#applyPixelRatio();
    });

    this.#teardown.push(
      observeCanvasSize(canvas, (width, height) => {
        this.resize(width, height);
      }),
      observeContextLoss(canvas, {
        onLost: () => {
          console.warn('WebGL-Kontext verloren — Rendering pausiert.');
          this.loop.stop();
          this.bus.emit('engine:contextlost');
        },
        onRestored: () => {
          console.info('WebGL-Kontext wiederhergestellt.');
          this.bus.emit('engine:contextrestored');
          this.loop.start();
        },
      }),
    );
  }

  get context(): EngineContext {
    return {
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      bus: this.bus,
      resources: this.resources,
      debug: this.#debug,
    };
  }

  get systems(): readonly System[] {
    return this.#systems;
  }

  get size(): { width: number; height: number } {
    return { width: this.#width, height: this.#height };
  }

  setDebugHost(host: DebugHost | null): void {
    this.#debug = host;
  }

  /** P2: `engine.setPresenter((alpha) => composer.render(alpha))`. */
  setPresenter(present: Presenter): void {
    this.#present = present;
  }

  add(system: System): void {
    if (this.#initialized) {
      throw new Error(
        `System "${system.name}" wurde nach init() hinzugefügt. ` +
          'Systeme müssen vor Engine.init() registriert werden.',
      );
    }
    this.#systems.push(system);
  }

  async init(): Promise<void> {
    if (this.#initialized) return;
    const context = this.context;
    // Bewusst sequenziell: Systeme dürfen auf Ergebnissen ihrer Vorgänger
    // aufbauen (das TerrainSystem braucht ab P1 den geladenen Sampler).
    for (const system of this.#systems) {
      await system.init?.(context);
    }
    this.#initialized = true;
  }

  start(): void {
    if (this.#disposed) throw new Error('Engine wurde bereits entladen.');
    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
  }

  resize(width: number, height: number): void {
    if (width === this.#width && height === this.#height) return;
    this.#width = width;
    this.#height = height;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // false: die CSS-Größe steuert das Layout, three darf sie nicht überschreiben.
    this.renderer.setSize(width, height, false);

    this.#propagateSize();
  }

  /**
   * Der Pixelfaktor, mit dem gerendert wird: Anzeige mal Auflösungsfaktor der
   * Qualitätsstufe. Die Anzeige-Seite ist gedeckelt (`RENDER.maxPixelRatio`),
   * weil ein 4K-Bildschirm sonst die vierfache Fläche verlangt, ohne dass man
   * es sieht.
   */
  #pixelRatio(): number {
    return Math.min(window.devicePixelRatio, RENDER.maxPixelRatio) * this.#renderScale;
  }

  #applyPixelRatio(): void {
    const ratio = this.#pixelRatio();
    if (Math.abs(this.renderer.getPixelRatio() - ratio) < 1e-4) return;
    this.renderer.setPixelRatio(ratio);
    // Die CSS-Größe bleibt, der Zeichenpuffer ändert sich. `setSize` erneut
    // aufzurufen ist der einzige Weg, three das mitzuteilen — der Pixelfaktor
    // allein löst keine Neuberechnung aus.
    this.renderer.setSize(this.#width, this.#height, false);
    this.#propagateSize();
  }

  #propagateSize(): void {
    for (const system of this.#systems) system.resize?.(this.#width, this.#height);
    this.bus.emit('engine:resize', {
      width: this.#width,
      height: this.#height,
      pixelRatio: this.#pixelRatio(),
    });
  }

  readonly #beginFrame = (): void => {
    // Genau ein Reset pro Frame — siehe autoReset-Kommentar in createRenderer.
    this.renderer.info.reset();
    this.#debug?.beginFrame();
  };

  readonly #fixedUpdate = (dt: number): void => {
    for (const system of this.#systems) system.fixedUpdate?.(dt);
  };

  readonly #update = (dt: number, alpha: number): void => {
    for (const system of this.#systems) system.update?.(dt, alpha);
  };

  readonly #render = (alpha: number): void => {
    this.#present(alpha);
    this.#debug?.endFrame();
  };

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;

    this.loop.dispose();

    for (const off of this.#teardown) off();
    this.#teardown.length = 0;

    // Rückwärts: ein später hinzugefügtes System kann von einem früheren
    // abhängen, nicht umgekehrt.
    for (let i = this.#systems.length - 1; i >= 0; i--) {
      const system = this.#systems[i];
      if (!system) continue;
      try {
        system.dispose();
      } catch (error) {
        console.error(`Fehler beim Entladen von System "${system.name}".`, error);
      }
    }
    this.#systems.length = 0;

    this.resources.dispose();
    this.scene.clear();

    this.#debug?.dispose();
    this.#debug = null;

    this.bus.emit('engine:disposed');
    this.bus.clear();

    this.renderer.dispose();
    // Erzwingt die Freigabe des GPU-Kontexts. Ohne das hält der Treiber die
    // Ressourcen bis zur Garbage Collection — der Speicher fällt dann nicht
    // messbar, was jede Leck-Prüfung wertlos macht.
    this.renderer.forceContextLoss();
  }
}
