import { Pane, type FolderApi } from 'tweakpane';
import { Vector2, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';

import {
  DEFAULT_QUALITY,
  QUALITY,
  QUALITY_LEVELS,
  type QualityKey,
} from '@/config/quality.config';
import type { AppBus } from '@/core/events';
import type { DebugHost } from './DebugHost';
import { FrameTimer } from './FrameTimer';
import { BudgetGuard } from './BudgetGuard';
import { StatsOverlay } from './StatsOverlay';

/**
 * Zwei Schalter statt einem — seit P13.
 *
 * Vorher lag beides unter `japanmap.debug.visible` und wurde gemeinsam
 * geschaltet. Getrennt, weil man die zwei Dinge unterschiedlich oft braucht:
 * der Zahlenblock ist eine Messung, die Werkzeugleiste ist ein Eingriff. Wer
 * eine Draw-Call-Zahl ablesen will, will nicht 280 px Regler daneben.
 *
 * **Und beide starten ausgeschaltet.** Der alte Schlüssel las
 * `!== '0'`, war also standardmäßig *an*: eine frisch geöffnete Seite zeigte
 * zuerst Werkzeug und dann die Landschaft. Ein fehlender Eintrag heißt jetzt
 * „aus"; ein- und ausgeschaltet wird im Reiter „Debug" des Spielermenüs oder
 * mit F1.
 */
const STATS_KEY = 'japanmap.debug.stats';
const PANE_KEY = 'japanmap.debug.pane';

export interface DebugPanelOptions {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly bus: AppBus;
  readonly container: HTMLElement;
  readonly extraTextures?: () => Iterable<unknown>;
  /** Für den Knopf "Engine entladen" — prüft das Dispose-Kriterium aus P0. */
  readonly onDispose?: () => void;
}

/**
 * Debug-UI: Tweakpane-Ordner für die Systeme plus das Statistik-Overlay.
 *
 * Wird nur im Dev-Build geladen (dynamischer Import in main.ts). Deshalb landen
 * Tweakpane und stats-gl nicht im Produktions-Bundle und zählen nicht gegen das
 * 15-MB-Budget aus SPEC §4.
 */
export class DebugPanel implements DebugHost {
  readonly #pane: Pane;
  readonly #paneElement: HTMLElement;
  readonly #overlay: StatsOverlay;
  readonly #guard: BudgetGuard;
  readonly #timer: FrameTimer;
  readonly #folders = new Map<string, FolderApi>();
  readonly #camera: PerspectiveCamera;
  readonly #bus: AppBus;
  readonly #sizeScratch = new Vector2();

  #statsOn: boolean;
  #paneOn: boolean;
  /** Letzte gesendete Stufe — verhindert die Rückkopplung Menü → Bus → Menü. */
  #quality: QualityKey = DEFAULT_QUALITY;

  /** Tweakpane bindet an Objekt-Properties, nicht an Rückgabewerte. */
  readonly #readouts = {
    position: '—',
    blick: '—',
    aufloesung: '—',
    qualitaet: DEFAULT_QUALITY as QualityKey,
  };

  private constructor(options: DebugPanelOptions, timer: FrameTimer) {
    this.#camera = options.camera;
    this.#bus = options.bus;
    this.#timer = timer;

    this.#paneElement = document.createElement('div');
    this.#paneElement.className = 'debug-pane';
    options.container.appendChild(this.#paneElement);

    this.#pane = new Pane({ container: this.#paneElement, title: 'japanMap' });

    const overlayOptions = {
      renderer: options.renderer,
      scene: options.scene,
      timer,
      container: options.container,
      ...(options.extraTextures ? { extraTextures: options.extraTextures } : {}),
    };
    this.#overlay = new StatsOverlay(overlayOptions);
    this.#guard = new BudgetGuard(
      options.renderer,
      options.scene,
      options.container,
      options.extraTextures,
    );

    this.#buildEngineFolder(options.renderer);
    this.#buildSystemFolder(options.renderer, options.onDispose);

    this.#statsOn = localStorage.getItem(STATS_KEY) === '1';
    this.#paneOn = localStorage.getItem(PANE_KEY) === '1';
    this.#applyVisibility();

    window.addEventListener('keydown', this.#onKeyDown);
  }

  static async create(options: DebugPanelOptions): Promise<DebugPanel> {
    const timer = await FrameTimer.create(options.renderer);
    return new DebugPanel(options, timer);
  }

  /** Für `DebugHost`: sichtbar heißt „irgendetwas davon steht im Bild". */
  get visible(): boolean {
    return this.#statsOn || this.#paneOn;
  }

  get statsVisible(): boolean {
    return this.#statsOn;
  }

  set statsVisible(value: boolean) {
    if (value === this.#statsOn) return;
    this.#statsOn = value;
    localStorage.setItem(STATS_KEY, value ? '1' : '0');
    this.#applyVisibility();
    this.#bus.emit('debug:visibility', { visible: this.visible });
  }

  get paneVisible(): boolean {
    return this.#paneOn;
  }

  set paneVisible(value: boolean) {
    if (value === this.#paneOn) return;
    this.#paneOn = value;
    localStorage.setItem(PANE_KEY, value ? '1' : '0');
    this.#applyVisibility();
    this.#bus.emit('debug:visibility', { visible: this.visible });
  }

  get lastGpuMs(): number | null {
    return this.#overlay.lastGpuMs;
  }

  get lastCpuMs(): number | null {
    return this.#overlay.lastCpuMs;
  }

  folder(title: string): FolderApi {
    const existing = this.#folders.get(title);
    if (existing) return existing;
    const created = this.#pane.addFolder({ title, expanded: false });
    this.#folders.set(title, created);
    return created;
  }

  beginFrame(): void {
    this.#timer.begin();
  }

  endFrame(): void {
    this.#timer.end();

    const p = this.#camera.position;
    this.#readouts.position = `${p.x.toFixed(0)} / ${p.y.toFixed(0)} / ${p.z.toFixed(0)}`;

    this.#overlay.update();
    this.#guard.update();
  }

  refresh(): void {
    this.#pane.refresh();
  }

  /**
   * F1 — beides zugleich.
   *
   * Steht **eines** von beiden im Bild, macht F1 alles aus; steht nichts da,
   * macht es alles an. Der Zwischenzustand („nur der Zahlenblock") bleibt damit
   * dem Menü vorbehalten, und die Taste tut, was eine Taste tun soll: eine
   * Sache, ohne dass man sich merken muss, in welchem Takt man sie gerade
   * drückt.
   */
  toggle(): void {
    const next = !this.visible;
    this.#statsOn = next;
    this.#paneOn = next;
    localStorage.setItem(STATS_KEY, next ? '1' : '0');
    localStorage.setItem(PANE_KEY, next ? '1' : '0');
    this.#applyVisibility();
    this.#bus.emit('debug:visibility', { visible: next });
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#onKeyDown);
    this.#overlay.dispose();
    this.#guard.dispose();
    this.#timer.dispose();
    this.#pane.dispose();
    this.#paneElement.remove();
    this.#folders.clear();
  }

  // ── Intern ─────────────────────────────────────────────────────────────

  #buildEngineFolder(renderer: WebGLRenderer): void {
    const folder = this.#pane.addFolder({ title: 'Engine', expanded: true });

    folder.addBinding(this.#readouts, 'position', {
      readonly: true,
      label: 'Kamera X/Y/Z',
      interval: 200,
    });
    folder.addBinding(this.#readouts, 'aufloesung', {
      readonly: true,
      label: 'Auflösung',
      interval: 500,
    });

    folder.addBinding(renderer, 'toneMappingExposure', {
      label: 'Belichtung',
      min: 0.1,
      max: 3,
      step: 0.01,
    });

    // Einschließlich ‚Eigen‘ (P10.2): das Aufklappmenü muss anzeigen können, was
    // wirklich gilt. Fehlt der Eintrag, steht dort nach einem Reglerzug im
    // Spielermenü ein leeres Feld — eine Anzeige, die lügt.
    const qualityOptions: Record<string, QualityKey> = {};
    for (const level of [...QUALITY_LEVELS, 'custom' as const]) {
      qualityOptions[QUALITY[level].label] = level;
    }

    folder
      .addBinding(this.#readouts, 'qualitaet', { label: 'Qualität', options: qualityOptions })
      .on('change', (event) => {
        if (event.value === this.#quality) return;
        this.#quality = event.value;
        this.#bus.emit('quality:changed', { level: event.value });
      });

    // Und zurück: die Stufe kann auch von woanders kommen (Knopf im
    // Qualitäts-Ordner, Konsole, ab 7.1b der Startbenchmark). Ohne diesen Weg
    // stünde im Aufklappmenü weiter die alte — eine Anzeige, die lügt, ist
    // schlimmer als keine.
    this.#bus.on('quality:changed', ({ level }) => {
      if (level === this.#quality) return;
      this.#quality = level;
      this.#readouts.qualitaet = level;
      this.#pane.refresh();
    });

    // Auflösung direkt aus dem Renderer, nicht aus dem 'engine:resize'-Ereignis:
    // die Debug-UI wird dynamisch nachgeladen und verpasst deshalb regelmäßig
    // den ersten Resize. Ein Ereignis, das man nur einmal beim Start bekommt,
    // taugt nicht als einzige Quelle für eine Anzeige.
    this.#refreshResolution(renderer);
    this.#bus.on('engine:resize', () => {
      this.#refreshResolution(renderer);
    });
  }

  #refreshResolution(renderer: WebGLRenderer): void {
    const size = renderer.getSize(this.#sizeScratch);
    const ratio = renderer.getPixelRatio();
    this.#readouts.aufloesung = `${size.x.toFixed(0)}×${size.y.toFixed(0)} @ ${ratio.toFixed(2)}×`;
  }

  #buildSystemFolder(renderer: WebGLRenderer, onDispose: (() => void) | undefined): void {
    const folder = this.#pane.addFolder({ title: 'System', expanded: false });

    folder.addButton({ title: 'Speicher in Konsole' }).on('click', () => {
      console.table({
        Geometrien: renderer.info.memory.geometries,
        Texturen: renderer.info.memory.textures,
        Programme: renderer.info.programs?.length ?? 0,
      });
    });

    if (onDispose) {
      folder.addButton({ title: 'Engine entladen (dispose)' }).on('click', () => {
        onDispose();
        // Direkt nachmessen: Akzeptanzkriterium aus PLAN.md P0 ist, dass hier
        // überall 0 steht. Der Knopf existiert, damit man das prüft, statt es
        // anzunehmen.
        console.info('Nach dispose() — erwartet: überall 0');
        console.table({
          Geometrien: renderer.info.memory.geometries,
          Texturen: renderer.info.memory.textures,
          Programme: renderer.info.programs?.length ?? 0,
        });
      });
    }
  }

  #applyVisibility(): void {
    this.#overlay.visible = this.#statsOn;
    this.#paneElement.hidden = !this.#paneOn;
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'F1' || event.repeat) return;
    event.preventDefault();
    this.toggle();
  };
}
