import { Color, PerspectiveCamera, Scene, type Object3D, type WebGLRenderer } from 'three';

import { QUALITY } from '@/config/quality.config';
import { CAMERA, maxPixelRatio } from '@/config/world.config';
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
  #precompileMs = 0;

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

  /** Dauer der Shader-Vorübersetzung in Millisekunden (0, solange init() läuft). */
  get precompileMs(): number {
    return this.#precompileMs;
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
    // +1 für den Aufwärmframe: er ist der letzte Schritt vor dem ersten Bild
    // und mit rund 0,7 s auch nicht der kürzeste.
    const total = this.#systems.length + 1;
    for (let i = 0; i < this.#systems.length; i++) {
      const system = this.#systems[i];
      if (!system) continue;
      this.bus.emit('engine:loading', { step: i, total, label: system.name });
      // Einen Makrotask abwarten, damit der Browser den Ladebildschirm auch
      // zeichnet. Ohne das liefe ein System mit rein synchroner Initialisierung
      // unter der Beschriftung seines Vorgängers — der Balken wäre dann keine
      // Anzeige, sondern eine Nacherzählung. Bewusst `setTimeout` und nicht
      // `requestAnimationFrame`: letzteres feuert in einem verdeckten Tab gar
      // nicht, und das Laden bliebe stehen.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await system.init?.(context);
    }
    this.#initialized = true;

    this.bus.emit('engine:loading', { step: total - 1, total, label: 'Shader übersetzen' });
    // Hier zählt der Makrotask am meisten: der Aufwärmframe ist der längste
    // einzelne Schritt (rund 0,7 s) und blockiert den Haupt-Thread vollständig.
    // Ohne einen Punkt zum Zeichnen davor stünde währenddessen die Beschriftung
    // des *vorherigen* Schritts im Bild — im gemessenen Ladeverlauf sprang es
    // von 76 % direkt auf 100 %.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await this.#precompile();
    this.bus.emit('engine:loading', { step: total, total, label: 'fertig' });
  }

  /**
   * Shader übersetzen, bevor der erste sichtbare Frame läuft — PLAN.md P7 / 7.4.
   *
   * ## Warum **nicht** `renderer.compileAsync()`
   *
   * Der Plan nennt genau diesen Aufruf, und der erste Entwurf hier stand darauf.
   * **Nachgemessen erzeugt er die falschen Programme.** Frisch geladene Seite:
   *
   * | | Programme | Dauer | erster Frame |
   * |---|---|---|---|
   * | ohne Vorübersetzung | 30 nach Frame 1 | — | 181,6 ms |
   * | `compileAsync` davor | **20** davor, **50** danach | 370,6 ms | 653,1 ms |
   *
   * Die 20 sind Varianten, die nie gezeichnet werden; die 30 echten entstehen
   * anschließend trotzdem. Verglichen hat das ein Diff der Cache-Schlüssel: von
   * 53 Feldern unterscheidet sich **genau eines**. `compile()` bereitet die
   * Materialien gegen den Zustand vor, der gerade am Renderer eingestellt ist —
   * gezeichnet wird aber durch den EffectComposer, also in ein anderes Ziel mit
   * anderem Farbraum. Ein Feld Unterschied, ein anderer Schlüssel, ein zweites
   * Programm.
   *
   * ## Was stattdessen passiert
   *
   * Ein vollständiger Frame durch **denselben** Weg, den der Renderer danach
   * jeden Frame nimmt. Damit sind die übersetzten Programme per Konstruktion die
   * richtigen — es gibt keinen Zustand, in dem sie sich unterscheiden könnten.
   *
   * Der Plan verlangt in derselben Zeile „vor dem ersten Frame"; das ist hier
   * erfüllt, nur ist der Frame selbst das Werkzeug. Sichtbar wird er nicht: die
   * Schleife läuft noch nicht, und ab 7.3 steht der Ladebildschirm davor.
   *
   * ## Und warum das Frustum-Culling dafür aus muss
   *
   * Ein Frame allein reicht nicht: gezeichnet wird nur, was im Bild steht, und
   * übersetzt wird ein Programm erst beim ersten Zeichnen. Der Startblick liegt
   * 1,2 km von der Stadt entfernt, ihre Fassaden fallen also aus dem Frustum —
   * **und ruckeln dann beim ersten Sichtkontakt.** Gemessen, frisch geladen:
   * der erste Frame in `stadt-neon` kostete 274,4 ms gegen 168 ms danach, und
   * die Programmzahl sprang dabei von 28 auf 30. 106 ms Ruckler gegen ein
   * Budget von 50 (PLAN.md P7, Akzeptanzkriterium).
   *
   * Genau das wollte `compile()` lösen — es geht die ganze Szene durch statt nur
   * das Sichtbare. Dasselbe erreicht dieser Frame, indem er das Culling für die
   * Dauer eines Bildes abschaltet: dann wird alles gezeichnet, auch was hinter
   * der Kamera liegt, und jedes Programm entsteht auf dem Weg, den es später
   * wirklich nimmt.
   */
  async #precompile(): Promise<void> {
    const started = performance.now();

    // Für genau einen Frame: nichts wegwerfen. Wiederhergestellt wird nur, was
    // vorher an war — es gibt Objekte, die aus gutem Grund ungecullt sind.
    const culled: Object3D[] = [];
    this.scene.traverse((object) => {
      if (object.frustumCulled) {
        object.frustumCulled = false;
        culled.push(object);
      }
    });

    // Die Uhr zurücksetzen, sonst kommt dieser Frame mit dem dt der gesamten
    // Ladezeit an und die Simulation macht ihre maximale Zahl an Schritten.
    this.loop.resetClock();
    this.loop.tick();

    for (const object of culled) object.frustumCulled = true;

    this.#precompileMs = performance.now() - started;
    console.info(
      `Aufwärmframe: ${this.renderer.info.programs?.length ?? 0} Programme ` +
        `in ${this.#precompileMs.toFixed(1)} ms.`,
    );
    this.bus.emit('engine:warmedup');
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
    // Der Deckel hängt seit P12.3 am Gerät: auf einem Telefon ist er deutlich
    // niedriger, weil dort die *physische* Pixeldichte drei- bis viermal höher
    // ist und der Aufwand mit dem Quadrat des Faktors wächst. Herleitung bei
    // `RENDER.maxPixelRatioCoarse`.
    return Math.min(window.devicePixelRatio, maxPixelRatio()) * this.#renderScale;
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
