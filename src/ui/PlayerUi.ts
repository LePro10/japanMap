import {
  CUSTOM_LIMITS,
  QUALITY,
  QUALITY_LEVELS,
  customFromSettings,
  type AoQuality,
  type CustomQuality,
  type QualityKey,
} from '@/config/quality.config';
import { GRID_VERTICES_ALLOWED, lodMetersPerVertex, type GridVertices } from '@/config/lod.config';
import type { PostFxQuality } from '@/config/postfx.config';
import type { AppBus } from '@/core/events';
import { VIEWPOINTS, applyViewpoint, type CameraPlacer } from '@/debug/viewpoints';

/**
 * Die Oberfläche für den Spieler — PLAN.md P10.2.
 *
 * ## Warum es sie bis P10 nicht gab, und warum das ein Loch war
 *
 * Alles Bedienbare dieses Projekts hing bis hierher am Debug-Panel, und das
 * steckt hinter `import.meta.env.DEV`. Im **gebauten** Stand gab es damit:
 * keinen Hinweis auf die Steuerung (WASD, Maus, Shift muss man raten), keine
 * Möglichkeit, die Qualitätsstufe zu ändern, keine Pause und keinen Weg zu den
 * Blickpunkten. Der Durchgang „von A bis Z" in PLAN.md hat das als den einzigen
 * Punkt geführt, an dem der gebaute Stand hinter dem zurückbleibt, was ein
 * Nutzer erwartet — kein Bildfehler, sondern ein fehlendes Stück Produkt.
 *
 * ## Der Zustand ist der Pointer Lock, nicht ein eigenes Flag
 *
 * Es gibt genau drei Zustände, und sie hängen an einer Größe, die der **Browser**
 * führt:
 *
 * | Pointer Lock | schon einmal gehabt | Anzeige |
 * |---|---|---|
 * | ja | — | nichts (man fliegt) |
 * | nein | nein | Hinweis „Klick ins Bild" |
 * | nein | ja | Pausenmenü |
 *
 * Das ist Absicht und spart die übliche Fehlerquelle: Escape löst den Lock
 * **selbst**, das kann keine Anwendung abfangen. Wer das Menü an einen eigenen
 * Escape-Zähler hängt, läuft irgendwann aus dem Tritt — Fenster wechseln,
 * Alt-Tab und der Vollbildwechsel lösen den Lock ebenfalls, ohne dass eine
 * Taste gedrückt wurde. Zugehört wird deshalb dem `pointerlockchange`.
 *
 * Die Unterscheidung „schon einmal gehabt" ist der Grund, warum beim ersten
 * Laden der Hinweis steht und nicht das Menü: wer die Karte noch nie gesehen
 * hat, hat nichts zu pausieren.
 */
export interface QualityControl {
  readonly level: QualityKey;
  set(level: QualityKey): void;
  setCustom(patch: Partial<CustomQuality>): void;
  seedCustomFrom(level: QualityKey): void;
  reclassify(): void;
}

export interface PlayerUiOptions {
  readonly bus: AppBus;
  readonly canvas: HTMLCanvasElement;
  readonly container: HTMLElement;
  readonly quality: QualityControl;
  readonly camera: CameraPlacer;
}

/** Die Steuerungstabelle — dieselbe wie im Kopf von `FreeFlyController`. */
const CONTROLS: readonly (readonly [string, string])[] = [
  ['W A S D', 'bewegen'],
  ['Maus', 'umsehen'],
  ['Leertaste / Strg', 'hoch / runter'],
  ['Umschalt', 'fünffaches Tempo'],
  ['Mausrad', 'Grundtempo 1–500 m/s'],
  ['F', 'Bodenkollision an / aus'],
  ['R', 'zurück zum Start'],
  ['Esc', 'Menü'],
];

const AO_LABELS: Readonly<Record<AoQuality, string>> = {
  high: 'hoch',
  medium: 'mittel',
  low: 'niedrig',
  off: 'aus',
};

const POSTFX_LABELS: Readonly<Record<PostFxQuality, string>> = {
  full: 'voll',
  reduced: 'reduziert',
  lean: 'sparsam',
  off: 'aus',
};

export class PlayerUi {
  readonly #bus: AppBus;
  readonly #canvas: HTMLCanvasElement;
  readonly #quality: QualityControl;
  readonly #camera: CameraPlacer;

  readonly #hint: HTMLElement;
  readonly #menu: HTMLElement;
  readonly #levelRow: HTMLElement;
  readonly #effect: HTMLElement;
  readonly #sliders: HTMLElement;

  #menuOpen = false;
  #everLocked = false;
  /** Wahr, solange die Regler aus dem Zustand gefüllt werden — verhindert Rückkopplung. */
  #syncing = false;

  constructor(options: PlayerUiOptions) {
    this.#bus = options.bus;
    this.#canvas = options.canvas;
    this.#quality = options.quality;
    this.#camera = options.camera;

    this.#hint = this.#buildHint();
    this.#menu = this.#buildMenu();
    options.container.append(this.#hint, this.#menu);

    this.#levelRow = this.#must(this.#menu, '.menu__levels');
    this.#effect = this.#must(this.#menu, '.menu__effect');
    this.#sliders = this.#must(this.#menu, '.menu__sliders');

    this.#fillLevels();
    this.#fillSliders();
    this.#fillViewpoints();

    // Der Ladebildschirm liegt über allem; vorher wäre der Hinweis unsichtbar
    // und würde beim Auftauchen der Karte schon wieder verschwinden.
    this.#bus.on('engine:warmedup', () => {
      this.#render();
    });
    this.#bus.on('quality:changed', () => {
      this.#syncQuality();
    });

    document.addEventListener('pointerlockchange', this.#onPointerLockChange);
    document.addEventListener('pointerlockerror', this.#onPointerLockError);
    window.addEventListener('keydown', this.#onKeyDown);

    this.#syncQuality();
    this.#render();
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this.#onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.#onPointerLockError);
    window.removeEventListener('keydown', this.#onKeyDown);
    this.#hint.remove();
    this.#menu.remove();
  }

  // ── Zustand ────────────────────────────────────────────────────────────

  get #locked(): boolean {
    return document.pointerLockElement === this.#canvas;
  }

  readonly #onPointerLockChange = (): void => {
    if (this.#locked) {
      this.#everLocked = true;
      this.#menuOpen = false;
    } else if (this.#everLocked) {
      // Lock verloren, ohne dass jemand „Weiter" gedrückt hat: Escape,
      // Fensterwechsel, Vollbildwechsel. In allen Fällen will der Nutzer nicht
      // mehr fliegen — also Menü, nicht stiller Stillstand.
      this.#menuOpen = true;
    }
    this.#render();
  };

  /**
   * Der Lock wurde **abgelehnt**, nicht verloren.
   *
   * Chrome sperrt eine neue Anforderung für rund 1,25 s, nachdem der Nutzer
   * selbst mit Escape ausgestiegen ist — wer zweimal schnell hintereinander
   * Escape drückt und „Weiter" wählt, landet genau darin. Ohne diesen Zweig
   * schlösse sich das Menü und die Anwendung reagierte auf nichts mehr: der
   * Hinweis stünde nicht, der Lock käme nicht, und der einzige Ausweg wäre ein
   * Klick ins Bild, den niemand angesagt hat.
   */
  readonly #onPointerLockError = (): void => {
    this.#menuOpen = false;
    this.#render();
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape') return;
    // Im gefangenen Zustand kommt dieses Ereignis gar nicht erst an — der
    // Browser löst den Lock und wir hören `pointerlockchange`. Hier geht es nur
    // um den Weg zurück.
    if (this.#locked) return;
    event.preventDefault();
    if (this.#menuOpen) this.#resume();
    else if (this.#everLocked) {
      this.#menuOpen = true;
      this.#render();
    }
  };

  #resume(): void {
    this.#menuOpen = false;
    this.#render();
    this.#requestLock();
  }

  #requestLock(): void {
    // `requestPointerLock()` liefert in neueren Browsern eine Zusage, in
    // älteren `undefined`. Beides muss hier durchgehen, und eine abgelehnte
    // Zusage darf nicht als unbehandelter Fehler in der Konsole landen —
    // `pointerlockerror` fängt denselben Fall für die alten.
    const result: unknown = this.#canvas.requestPointerLock();
    if (result instanceof Promise) {
      result.catch(() => {
        this.#render();
      });
    }
  }

  #render(): void {
    const locked = this.#locked;
    this.#menu.hidden = !this.#menuOpen || locked;
    this.#hint.hidden = locked || this.#menuOpen;
  }

  // ── Aufbau ─────────────────────────────────────────────────────────────

  #buildHint(): HTMLElement {
    const hint = document.createElement('div');
    // **Keine Zeigerereignisse.** Der Hinweis liegt über dem Canvas, und der
    // Klick, der den Lock holt, gehört dem Canvas — `FreeFlyController` hört
    // dort auf `pointerdown`. Fängt der Hinweis den Klick ab, passiert beim
    // ersten Versuch nichts, und der Nutzer klickt in eine Anwendung, die
    // ausdrücklich „Klick ins Bild" sagt.
    hint.className = 'hint';
    hint.hidden = true;

    const rows = CONTROLS.map(
      ([key, what]) => `<tr><th>${key}</th><td>${what}</td></tr>`,
    ).join('');

    // Touch-Hinweis: `pointer: coarse` heißt Finger statt Maus. Ohne Pointer
    // Lock gibt es keine Blicksteuerung, und ohne Tastatur keine Bewegung —
    // das gehört gesagt, statt den Nutzer tippen zu lassen, bis er aufgibt.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const touch = coarse
      ? '<p class="hint__touch">Für Touch-Geräte ist diese Ansicht nicht ausgelegt: ' +
        'Umsehen braucht eine Maus, Bewegen eine Tastatur.</p>'
      : '';

    hint.innerHTML = `
      <div class="hint__box">
        <p class="hint__call">Klick ins Bild</p>
        <table class="hint__keys">${rows}</table>
        ${touch}
      </div>`;
    return hint;
  }

  #buildMenu(): HTMLElement {
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.hidden = true;
    menu.innerHTML = `
      <div class="menu__box">
        <header class="menu__head">
          <p class="menu__title">japanMap</p>
          <button type="button" class="menu__resume">Weiter</button>
        </header>

        <section class="menu__section">
          <h2>Qualität</h2>
          <div class="menu__levels"></div>
          <p class="menu__effect"></p>
          <div class="menu__sliders"></div>
          <button type="button" class="menu__reclassify">Neu einstufen</button>
        </section>

        <section class="menu__section">
          <h2>Blickpunkte</h2>
          <div class="menu__views"></div>
        </section>

        <section class="menu__section">
          <h2>Steuerung</h2>
          <table class="menu__keys">
            ${CONTROLS.map(([key, what]) => `<tr><th>${key}</th><td>${what}</td></tr>`).join('')}
          </table>
        </section>
      </div>`;

    this.#must(menu, '.menu__resume').addEventListener('click', () => {
      this.#resume();
    });
    this.#must(menu, '.menu__reclassify').addEventListener('click', () => {
      this.#quality.reclassify();
    });
    // Klick neben den Kasten schließt — dieselbe Geste wie „Weiter". Der Klick
    // darf dabei **nicht** vom Kasten selbst kommen.
    menu.addEventListener('click', (event) => {
      if (event.target === menu) this.#resume();
    });
    return menu;
  }

  #fillLevels(): void {
    for (const level of [...QUALITY_LEVELS, 'custom' as const]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.level = level;
      button.textContent = QUALITY[level].label;
      button.addEventListener('click', () => {
        if (level === 'custom') {
          // „Eigen" ohne Vorgeschichte wäre ein leeres Blatt. Startpunkt ist,
          // was gerade gilt — dann verändert der erste Reglerzug genau eine
          // Sache und nicht acht.
          this.#quality.seedCustomFrom(this.#quality.level);
          this.#quality.setCustom({});
        } else {
          this.#quality.set(level);
        }
      });
      this.#levelRow.appendChild(button);
    }
  }

  /**
   * Die Einzelregler.
   *
   * **Angewendet wird bei `change`, angezeigt bei `input`.** Der Unterschied ist
   * kein Detail: `terrainGridVertices` baut das Terrain-Gitter neu auf, und ein
   * Schieberegler feuert `input` je Pixel Mausweg. Wer daran den Neuaufbau
   * hängt, hat bei einem Zug über die Reglerbreite hundert Neuaufbauten in einer
   * Sekunde — und misst danach die Ruckler seines eigenen Menüs.
   */
  #fillSliders(): void {
    const percent = (v: number): string => `${(v * 100).toFixed(0)} %`;

    this.#slider('Auflösung', 'renderScale', CUSTOM_LIMITS.renderScale, percent, (v) => ({
      renderScale: v,
    }));
    // **Zwei Regler statt eines Prozentwerts** — P11.2. „Vegetationsdichte" gab
    // es bis dahin als einen Anteil über die ganze Fläche, und der hat gemessen
    // den Vordergrund leergeräumt (Tabelle bei `vegetationFullRadius`). Ein
    // einzelner Prozentwert kann die Frage nicht mehr beantworten, seit nah und
    // fern getrennt behandelt werden.
    this.#slider(
      'Volle Dichte bis',
      'vegetationFullRadius',
      CUSTOM_LIMITS.vegetationFullRadius,
      (v) => `${v.toFixed(0)} m`,
      (v) => ({ vegetationFullRadius: v }),
    );
    this.#slider(
      'Dichte in der Ferne',
      'vegetationFarKeep',
      CUSTOM_LIMITS.vegetationFarKeep,
      percent,
      (v) => ({ vegetationFarKeep: v }),
    );
    // Zwei Reichweiten, weil Bäume und Bodendecker im Bild Verschiedenes tun —
    // Herleitung bei `SpeciesLayer`. Die zweite ist der wirksamste Regler des
    // ganzen Menüs: Gras stellt den größten Teil aller Instanzen, und der
    // Bodenfarbstich springt für es ein.
    this.#slider(
      'Gras- und Buschreichweite',
      'vegetationGroundRange',
      CUSTOM_LIMITS.vegetationGroundRange,
      percent,
      (v) => ({ vegetationGroundRange: v }),
    );
    this.#slider(
      'Baumreichweite',
      'vegetationRange',
      CUSTOM_LIMITS.vegetationRange,
      percent,
      (v) => ({ vegetationRange: v }),
    );
    this.#slider('LOD-Umschaltpunkt', 'lodBias', CUSTOM_LIMITS.lodBias, (v) => v.toFixed(2), (v) => ({
      lodBias: v,
    }));

    this.#select(
      'Geländegitter',
      'terrainGridVertices',
      GRID_VERTICES_ALLOWED.map((v) => [String(v), `${v}² · ${lodMetersPerVertex(v).toFixed(1)} m`]),
      (raw) => ({ terrainGridVertices: Number(raw) as GridVertices }),
    );
    this.#select(
      'Umgebungsverdeckung',
      'ao',
      (Object.keys(AO_LABELS) as AoQuality[]).map((k) => [k, AO_LABELS[k]]),
      (raw) => ({ ao: raw as AoQuality }),
    );
    this.#select(
      'Bildeffekte',
      'postFx',
      (Object.keys(POSTFX_LABELS) as PostFxQuality[]).map((k) => [k, POSTFX_LABELS[k]]),
      (raw) => ({ postFx: raw as PostFxQuality }),
    );
    this.#toggle('Spiegelung auf nassem Asphalt');
  }

  #slider(
    label: string,
    field:
      | 'renderScale'
      | 'vegetationFullRadius'
      | 'vegetationFarKeep'
      | 'vegetationRange'
      | 'vegetationGroundRange'
      | 'lodBias',
    limits: { readonly min: number; readonly max: number; readonly step: number },
    format: (value: number) => string,
    apply: (value: number) => Partial<CustomQuality>,
  ): void {
    const row = this.#row(label, field);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(limits.min);
    input.max = String(limits.max);
    input.step = String(limits.step);
    input.dataset.field = field;

    const value = document.createElement('span');
    value.className = 'menu__value';

    input.addEventListener('input', () => {
      value.textContent = format(Number(input.value));
    });
    input.addEventListener('change', () => {
      if (this.#syncing) return;
      this.#quality.setCustom(apply(Number(input.value)));
    });

    row.append(input, value);
    this.#sliders.appendChild(row);
  }

  #select(
    label: string,
    field: 'terrainGridVertices' | 'ao' | 'postFx',
    options: readonly (readonly [string, string])[],
    apply: (raw: string) => Partial<CustomQuality>,
  ): void {
    const row = this.#row(label, field);
    const select = document.createElement('select');
    select.dataset.field = field;
    for (const [value, text] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    }
    select.addEventListener('change', () => {
      if (this.#syncing) return;
      this.#quality.setCustom(apply(select.value));
    });
    row.appendChild(select);
    this.#sliders.appendChild(row);
  }

  #toggle(label: string): void {
    const row = this.#row(label, 'reflections');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.field = 'reflections';
    input.addEventListener('change', () => {
      if (this.#syncing) return;
      this.#quality.setCustom({ reflections: input.checked });
    });
    row.appendChild(input);
    this.#sliders.appendChild(row);
  }

  #row(label: string, field: string): HTMLElement {
    const row = document.createElement('label');
    row.className = 'menu__row';
    row.dataset.row = field;
    const text = document.createElement('span');
    text.className = 'menu__rowLabel';
    text.textContent = label;
    row.appendChild(text);
    return row;
  }

  #fillViewpoints(): void {
    const list = this.#must(this.#menu, '.menu__views');
    for (const [name, point] of Object.entries(VIEWPOINTS)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      if (point.note) button.title = point.note;
      button.addEventListener('click', () => {
        applyViewpoint(this.#camera, name);
        this.#resume();
      });
      list.appendChild(button);
    }
  }

  // ── Anzeige ────────────────────────────────────────────────────────────

  /**
   * Regler und Knöpfe auf den geltenden Zustand setzen.
   *
   * Läuft auch dann, wenn die Stufe **nicht** aus diesem Menü kam — die
   * Ersteinstufung stuft selbsttätig herunter, das Debug-Panel und die Konsole
   * schalten ebenfalls um. Ein Menü, das seinen eigenen letzten Klick anzeigt
   * statt den Zustand, ist die Anzeige, die lügt.
   */
  #syncQuality(): void {
    const key = this.#quality.level;
    const settings = QUALITY[key];
    const values = customFromSettings(settings);

    for (const button of this.#levelRow.querySelectorAll('button')) {
      button.classList.toggle('is-active', button.dataset.level === key);
    }

    this.#effect.textContent =
      `Auflösung ${(settings.renderScale * 100).toFixed(0)} % · ` +
      `Gitter ${settings.terrainGridVertices}² (${lodMetersPerVertex(settings.terrainGridVertices).toFixed(1)} m) · ` +
      `AO ${AO_LABELS[settings.ao]} · Bildeffekte ${POSTFX_LABELS[settings.postFx]} · ` +
      `Spiegelung ${settings.reflections ? 'an' : 'aus'} · ` +
      `Vegetation voll bis ${settings.vegetationFullRadius} m, fern ` +
      `${(settings.vegetationFarKeep * 100).toFixed(0)} % · ` +
      `Gras ${(settings.vegetationGroundRange * 100).toFixed(0)} %`;

    // Die Regler zeigen **immer** die geltenden Werte, auch auf einer
    // Voreinstellung. Sonst müsste man erst „Eigen" wählen, um zu sehen, was
    // „Mittel" eigentlich einstellt — und genau das ist die Frage, die jemand
    // vor diesem Menü hat.
    this.#syncing = true;
    try {
      for (const element of this.#sliders.querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >('[data-field]')) {
        const field = element.dataset.field as keyof CustomQuality;
        const value = values[field];
        if (element instanceof HTMLInputElement && element.type === 'checkbox') {
          element.checked = Boolean(value);
        } else {
          element.value = String(value);
        }
        if (element instanceof HTMLInputElement && element.type === 'range') {
          element.dispatchEvent(new Event('input'));
        }
      }
    } finally {
      this.#syncing = false;
    }
  }

  #must(root: ParentNode, selector: string): HTMLElement {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Spielermenü: "${selector}" fehlt.`);
    return element;
  }
}
