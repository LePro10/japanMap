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
import { VEHICLES, VEHICLE_ORDER, type VehicleId } from '@/config/vehicles.config';
import type { AppBus } from '@/core/events';
import { VIEWPOINTS, applyViewpoint, type CameraPlacer } from '@/debug/viewpoints';
import {
  CONTROLS,
  DRIVE_CONTROLS,
  TOUCH_CONTROLS,
  TOUCH_DRIVE_CONTROLS,
  controlTable,
  hasTouch,
} from './controls';
import {
  TouchControls,
  type TouchCameraTarget,
  type TouchDriveTarget,
} from './TouchControls';

/**
 * Die Oberfläche für den Spieler — PLAN.md P10.2, umgebaut in P13.
 *
 * ## Warum es sie bis P10 nicht gab, und warum das ein Loch war
 *
 * Alles Bedienbare dieses Projekts hing bis dahin am Debug-Panel, und das steckt
 * hinter `import.meta.env.DEV`. Im **gebauten** Stand gab es damit: keinen
 * Hinweis auf die Steuerung (WASD, Maus, Shift muss man raten), keine
 * Möglichkeit, die Qualitätsstufe zu ändern, keine Pause und keinen Weg zu den
 * Blickpunkten.
 *
 * ## Der Zustand ist der Pointer Lock, nicht ein eigenes Flag
 *
 * Es gibt genau drei Zustände, und zwei davon hängen an einer Größe, die der
 * **Browser** führt:
 *
 * | Pointer Lock | schon gestartet | Anzeige |
 * |---|---|---|
 * | ja | — | nichts (man fliegt) |
 * | nein | nein | Startbildschirm (`StartScreen`, liegt darüber) |
 * | nein | ja | Pausenmenü |
 *
 * Das ist Absicht und spart die übliche Fehlerquelle: Escape löst den Lock
 * **selbst**, das kann keine Anwendung abfangen. Wer das Menü an einen eigenen
 * Escape-Zähler hängt, läuft irgendwann aus dem Tritt — Fenster wechseln,
 * Alt-Tab und der Vollbildwechsel lösen den Lock ebenfalls, ohne dass eine
 * Taste gedrückt wurde. Zugehört wird deshalb dem `pointerlockchange`.
 *
 * ## Was P13 geändert hat
 *
 * 1. **Der Hinweiskasten ist weg.** Die mittlere Bildfläche gehört im Flug der
 *    Karte und sonst niemandem. Die Steuerungstabelle steht jetzt auf dem
 *    Startbildschirm und im Reiter „Steuerung"; die Geste, die den Pointer Lock
 *    holt, ist der „Starten"-Knopf statt eines Klicks ins Bild.
 * 2. **Das Menü hat Reiter.** Vorher war es eine Seite mit vier Abschnitten
 *    untereinander, und die Reglerliste allein war länger als ein Telefonbild.
 * 3. **Debug wohnt im Menü.** Zahlenblock und Werkzeugleiste starten
 *    **ausgeschaltet** und werden im Reiter „Debug" eingeschaltet — den es nur
 *    gibt, wenn eine Debug-Steuerung übergeben wurde, also nur im Dev-Build.
 *    Tweakpane und stats-gl bleiben damit aus dem Produktions-Bundle (SPEC §4).
 */
export interface QualityControl {
  readonly level: QualityKey;
  set(level: QualityKey): void;
  setCustom(patch: Partial<CustomQuality>): void;
  seedCustomFrom(level: QualityKey): void;
  reclassify(): void;
}

/**
 * Was das Menü von der Debug-UI braucht — bewusst vier Zeilen und kein `import`.
 *
 * `PlayerUi` liegt unter `src/ui/` und wird **ohne** `import.meta.env.DEV`
 * ausgeliefert. Ein Typ-Import auf `DebugPanel` wäre folgenlos (Typen werden
 * gelöscht), ein Wert-Import zöge Tweakpane ins Bundle. Diese Schnittstelle
 * hält beides auseinander: im Dev-Build reicht `main.ts` eine Implementierung
 * herein, im Build ist das Feld schlicht nicht gesetzt.
 */
export interface DebugControl {
  /** Der Zahlenblock oben links (Draw-Calls, Dreiecke, GPU-ms). */
  statsVisible: boolean;
  /** Die Tweakpane-Werkzeugleiste oben rechts. */
  paneVisible: boolean;
}

/**
 * Was das Menü vom Fahrmodus braucht — dieselbe schmale Bauart wie
 * `QualityControl` und `DebugControl`, und aus demselben Grund: `PlayerUi` soll
 * kein System importieren.
 *
 * **Warum der Umschalter ins Menü gehört und nicht nur auf die Taste `V`.**
 * `DriveSystem.#onKeyDown` steigt ohne Pointer Lock aus. Das ist dort richtig
 * (ohne gefangenen Zeiger liegt das Menü über dem Bild, und eine Taste gehört
 * dann dem Menü), heißt aber: auf jedem Gerät ohne Lock — also **jedem
 * Telefon** — gab es überhaupt keinen Weg ins Auto. Der Menüeintrag ist der
 * zeigergeräteunabhängige, der Knopf in `TouchControls` der schnelle.
 */
export interface DriveControl extends TouchDriveTarget {
  /**
   * Die Fahrzeugwahl — P18.
   *
   * **Nicht in `TouchDriveTarget`**, und das ist die Grenze zwischen den beiden:
   * das Bedienfeld hat vier Knöpfe für Sachen, die man **während der Fahrt**
   * braucht (Gas, Handbremse, Zurücksetzen, Menü). Ein Fahrzeugwechsel gehört
   * dorthin nicht — er passiert einmal, mit Bedenkzeit, und braucht Namen und
   * Kennzahlen daneben. Das ist ein Menü und kein Daumenknopf.
   */
  readonly vehicleId: VehicleId;
  setVehicle(id: VehicleId): void;
}

/**
 * Was das Menü von der Tonschicht braucht.
 *
 * `click()` gehört dazu, weil die Oberfläche ihre eigenen Geräusche macht — und
 * weil ein Klick auf den Stummschalter selbst **keinen** machen darf, sonst
 * klingt Ausschalten nach Einschalten.
 */
export interface AudioControl {
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  click(): void;
}

export interface PlayerUiOptions {
  readonly bus: AppBus;
  readonly canvas: HTMLCanvasElement;
  readonly container: HTMLElement;
  readonly quality: QualityControl;
  /** Der Fahrmodus. Fehlt er, gibt es die Modus-Zeile im Menü nicht. */
  readonly drive?: DriveControl;
  /** Die Tonschicht. Fehlt sie, gibt es den Stummschalter nicht. */
  readonly audio?: AudioControl;
  /**
   * Das Fahr-HUD. Es gehört `main.ts` (dort läuft die Aktualisierung je Frame);
   * das Menü sagt ihm nur, wann es im Weg steht — genau wie dem Bedienfeld.
   */
  readonly hud?: { setMenuOpen(open: boolean): void };
  /**
   * Die Kamera. `CameraPlacer` für die Blickpunkte, `TouchCameraTarget` für die
   * Fingersteuerung — `FreeFlyController` erfüllt beides, und die Oberfläche
   * kennt trotzdem nur die beiden schmalen Schnittstellen und nicht das System.
   */
  readonly camera: CameraPlacer & TouchCameraTarget;
  /** Nur im Dev-Build gesetzt. Fehlt sie, gibt es den Reiter „Debug" nicht. */
  readonly debug?: DebugControl;
}

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
  // „kompakt" und nicht „minimal": die Stufe *behält* den Farbstich und die
  // Vignette und lässt nur Bloom und Kantenglättung weg. Wer „minimal" liest,
  // erwartet weniger, als sie liefert.
  compact: 'kompakt',
  off: 'aus',
};

type TabKey = 'grafik' | 'fahrzeug' | 'steuerung' | 'blick' | 'debug';

export class PlayerUi {
  readonly #bus: AppBus;
  readonly #canvas: HTMLCanvasElement;
  readonly #quality: QualityControl;
  readonly #camera: CameraPlacer;
  readonly #debug: DebugControl | null;
  readonly #drive: DriveControl | null;
  readonly #audio: AudioControl | null;
  readonly #hud: { setMenuOpen(open: boolean): void } | null;

  readonly #menu: HTMLElement;
  readonly #levelRow: HTMLElement;
  readonly #effect: HTMLElement;
  readonly #sliders: HTMLElement;

  #menuOpen = false;
  /**
   * Hat der Nutzer schon einmal angefangen zu fliegen?
   *
   * **Hieß bis P12.4 `#everLocked` und hing allein am Pointer Lock.** Das war
   * der Grund, warum auf einem Telefon nie ein Menü aufging: der Lock kommt
   * dort nicht zustande (iOS Safari kennt ihn nicht, Android lehnt ihn bei
   * Fingereingabe ab), also blieb das Flag für immer falsch — und mit ihm der
   * einzige Weg ins Pausenmenü verschlossen. Der Zustand heißt jetzt, was er
   * bedeutet; seit P13 setzt ihn der „Starten"-Knopf, unabhängig vom Zeigegerät.
   */
  #started = false;
  /** Wahr, solange die Regler aus dem Zustand gefüllt werden — verhindert Rückkopplung. */
  #syncing = false;
  #tab: TabKey = 'grafik';
  #touch: TouchControls | null = null;

  constructor(options: PlayerUiOptions) {
    this.#bus = options.bus;
    this.#canvas = options.canvas;
    this.#quality = options.quality;
    this.#camera = options.camera;
    this.#debug = options.debug ?? null;
    this.#drive = options.drive ?? null;
    this.#audio = options.audio ?? null;
    this.#hud = options.hud ?? null;

    this.#menu = this.#buildMenu();
    options.container.append(this.#menu);

    this.#touch = new TouchControls({
      canvas: options.canvas,
      container: options.container,
      camera: options.camera,
      onMenu: () => {
        this.#menuOpen = true;
        this.#render();
      },
      ...(options.drive ? { drive: options.drive } : {}),
    });

    this.#levelRow = this.#must(this.#menu, '.menu__levels');
    this.#effect = this.#must(this.#menu, '.menu__effect');
    this.#sliders = this.#must(this.#menu, '.menu__sliders');

    this.#fillLevels();
    this.#fillSliders();
    this.#fillVehicles();
    this.#fillViewpoints();
    this.#fillDebug();

    this.#bus.on('quality:changed', () => {
      this.#syncQuality();
    });
    // F1 schaltet dieselben zwei Sachen wie die Kästchen im Reiter „Debug".
    // Ohne diesen Weg zeigte das Menü nach einem Tastendruck den alten Stand —
    // die Anzeige, die lügt, gegen die dieses Projekt schon zweimal angetreten
    // ist.
    this.#bus.on('debug:visibility', () => {
      this.#syncDebug();
    });
    // Der dritte Weg in den Fahrmodus ist die Taste `V`, und die geht am Menü
    // vorbei. `DriveSystem` sendet bei **jedem** Wechsel — also führen alle drei
    // Wege durch diesen einen Zuhörer, statt jeder seine eigene Anzeige zu
    // pflegen.
    this.#bus.on('drive:mode', () => {
      this.#syncDrive();
    });
    // Und derselbe Weg für die Fahrzeugwahl: der Wechsel kann auch aus dem
    // Debug-Panel kommen.
    this.#bus.on('drive:vehicle', () => {
      this.#syncVehicles();
    });

    document.addEventListener('pointerlockchange', this.#onPointerLockChange);
    document.addEventListener('pointerlockerror', this.#onPointerLockError);
    window.addEventListener('keydown', this.#onKeyDown);
    // Auf Touch schließt die erste Berührung nichts mehr auf — der
    // Startbildschirm hat das übernommen —, sie zählt aber weiter als „gestartet":
    // wer über den Rückfallpfad (Startbildschirm entsorgt) hier landet, soll
    // trotzdem ein Menü öffnen können.
    this.#canvas.addEventListener('pointerdown', this.#onCanvasPointerDown);

    this.#syncQuality();
    this.#syncDebug();
    this.#syncDrive();
    this.#syncAudio();
    this.#render();
  }

  /**
   * Der Startbildschirm ist bedient worden — ab hier fliegt der Nutzer.
   *
   * Wird **synchron im Klick** des „Starten"-Knopfes gerufen; `requestPointerLock`
   * verlangt die Nutzergeste, und die überlebt kein `await`.
   */
  begin(): void {
    this.#started = true;
    this.#menuOpen = false;
    this.#render();
    if (!this.#touchMode) this.#requestLock();
  }

  dispose(): void {
    document.removeEventListener('pointerlockchange', this.#onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.#onPointerLockError);
    window.removeEventListener('keydown', this.#onKeyDown);
    this.#canvas.removeEventListener('pointerdown', this.#onCanvasPointerDown);
    this.#touch?.dispose();
    this.#touch = null;
    this.#menu.remove();
  }

  // ── Zustand ────────────────────────────────────────────────────────────

  get #locked(): boolean {
    return document.pointerLockElement === this.#canvas;
  }

  /** Steuert der Nutzer mit dem Finger? Dann gibt es keinen Pointer Lock. */
  get #touchMode(): boolean {
    return this.#touch?.enabled ?? false;
  }

  readonly #onCanvasPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    this.#started = true;
  };

  readonly #onPointerLockChange = (): void => {
    if (this.#locked) {
      this.#started = true;
      this.#menuOpen = false;
    } else if (this.#started && !this.#touchMode) {
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
   * Escape drückt und „Weiter" wählt, landet genau darin.
   *
   * **Bis P13 wurde hier das Menü geschlossen**, weil dann der Hinweiskasten
   * „Klick ins Bild" übernahm. Den gibt es nicht mehr, und ohne ihn wäre ein
   * geschlossenes Menü nach einer abgelehnten Anforderung ein Bild ganz ohne
   * Bedienelement: der Lock kam nicht, also reagiert auch keine Taste. Das Menü
   * bleibt deshalb **offen** — sein „Weiter" ist der Wiederholversuch, und die
   * Sperre ist nach gut einer Sekunde von selbst vorbei.
   */
  readonly #onPointerLockError = (): void => {
    this.#menuOpen = this.#started;
    this.#render();
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape') return;
    // Im gefangenen Zustand kommt dieses Ereignis gar nicht erst an — der
    // Browser löst den Lock und wir hören `pointerlockchange`. Hier geht es nur
    // um den Weg zurück.
    if (this.#locked) return;
    if (!this.#started) return;
    event.preventDefault();
    if (this.#menuOpen) this.#resume();
    else {
      this.#menuOpen = true;
      this.#render();
    }
  };

  #resume(): void {
    this.#menuOpen = false;
    this.#render();
    // **Auf Touch wird kein Lock angefordert.** Er käme nicht zustande, und der
    // abgelehnte Versuch wirft auf iOS Safari (`requestPointerLock` fehlt dort
    // ganz) einen Fehler, der die Fortsetzung des Menüs mitnähme.
    if (!this.#touchMode) this.#requestLock();
  }

  #requestLock(): void {
    // `requestPointerLock()` liefert in neueren Browsern eine Zusage, in
    // älteren `undefined`, und auf iOS Safari gibt es die Funktion **gar
    // nicht**. Alle drei müssen hier durchgehen, und eine abgelehnte Zusage
    // darf nicht als unbehandelter Fehler in der Konsole landen —
    // `pointerlockerror` fängt denselben Fall für die alten.
    if (typeof this.#canvas.requestPointerLock !== 'function') return;
    const result: unknown = this.#canvas.requestPointerLock();
    if (result instanceof Promise) {
      result.catch(() => {
        this.#onPointerLockError();
      });
    }
  }

  #render(): void {
    this.#menu.hidden = !this.#menuOpen || (!this.#touchMode && this.#locked);
    // Das Bedienfeld gehört nicht über das offene Menü.
    this.#touch?.setVisible(!this.#menuOpen);
    // Und das HUD ebenso wenig: bei 375 × 812 liegt der Rundenkasten sonst
    // genau auf der Kopfzeile des Menüs, also auf dem „Weiter"-Knopf.
    this.#hud?.setMenuOpen(this.#menuOpen);
  }

  // ── Aufbau ─────────────────────────────────────────────────────────────

  #buildMenu(): HTMLElement {
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.hidden = true;

    // Der Reiter „Debug" existiert nur, wenn eine Steuerung dafür hereingereicht
    // wurde. Im gebauten Stand ist das nie der Fall — und das ist die einzige
    // Stelle, an der über seine Existenz entschieden wird.
    const tabs: readonly (readonly [TabKey, string])[] = [
      ['grafik', 'Grafik'],
      // **Der Reiter existiert nur mit Fahrmodus** — dieselbe Regel wie bei
      // „Debug". Ein Reiter, hinter dem eine Auswahl liegt, die nichts steuern
      // kann, ist eine Anzeige, die lügt.
      ...(this.#drive ? ([['fahrzeug', 'Fahrzeug']] as const) : []),
      ['steuerung', 'Steuerung'],
      ['blick', 'Blickpunkte'],
      ...(this.#debug ? ([['debug', 'Debug']] as const) : []),
    ];

    menu.innerHTML = `
      <div class="menu__box">
        <header class="menu__head">
          <p class="menu__title">japanMap</p>
          <div class="menu__headButtons">
            ${
              this.#audio
                ? `<button type="button" class="menu__mute" aria-label="Ton an oder aus">🔊</button>`
                : ''
            }
            <button type="button" class="menu__resume">Weiter</button>
          </div>
        </header>

        ${
          this.#drive
            ? `<button type="button" class="menu__drive">
                 <span class="menu__driveIcon">🚗</span>
                 <span class="menu__driveLabel">Auto fahren</span>
               </button>`
            : ''
        }

        <nav class="menu__tabs">
          ${tabs
            .map(
              ([key, label]) =>
                `<button type="button" class="menu__tab" data-tab="${key}">${label}</button>`,
            )
            .join('')}
        </nav>

        <section class="menu__panel" data-panel="grafik">
          <div class="menu__levels"></div>
          <p class="menu__effect"></p>
          <div class="menu__sliders"></div>
          <button type="button" class="menu__reclassify">Neu einstufen</button>
        </section>

        ${
          this.#drive
            ? `<section class="menu__panel" data-panel="fahrzeug">
                 <div class="menu__cars"></div>
                 <p class="menu__note">
                   Die Wahl wirkt sofort und behält den Standort. Jedes Fahrzeug hat eigene
                   Masse, Reifen, Federung und Antriebsart — die Zahlen dazu stehen in
                   <code>vehicles.config.ts</code>, jede mit ihrer Messung.
                 </p>
               </section>`
            : ''
        }

        <section class="menu__panel" data-panel="steuerung">
          ${hasTouch() ? `<h3 class="menu__subhead">Finger</h3>${controlTable(TOUCH_CONTROLS, 'keytable')}<h3 class="menu__subhead">Tastatur und Maus</h3>` : ''}
          ${controlTable(CONTROLS, 'keytable')}
          <h3 class="menu__subhead">Im Auto</h3>
          ${hasTouch() ? controlTable(TOUCH_DRIVE_CONTROLS, 'keytable') : ''}
          ${controlTable(DRIVE_CONTROLS, 'keytable')}
        </section>

        <section class="menu__panel" data-panel="blick">
          <div class="menu__views"></div>
          <p class="menu__note">
            Ein Sprung an einen benannten Standpunkt; das Menü schließt dabei. Die Tabelle ist
            dieselbe, an der die Messungen dieses Projekts hängen — ein Bild oder eine
            Draw-Call-Zahl gilt an einem Ort, nicht auf der Karte.
          </p>
        </section>

        ${
          this.#debug
            ? `<section class="menu__panel" data-panel="debug">
                 <div class="menu__sliders menu__sliders--debug"></div>
                 <p class="menu__note">
                   <strong>F1</strong> schaltet beides zugleich. Diese Werkzeuge gibt es nur im
                   Dev-Server — im gebauten Stand fehlt der Reiter, und Tweakpane und stats-gl
                   liegen gar nicht erst im Bundle.
                 </p>
               </section>`
            : ''
        }
      </div>`;

    this.#must(menu, '.menu__resume').addEventListener('click', () => {
      this.#resume();
    });
    if (this.#audio) {
      this.#must(menu, '.menu__mute').addEventListener('click', () => {
        const audio = this.#audio;
        if (!audio) return;
        const neu = !audio.muted;
        audio.setMuted(neu);
        // Der Klick wird **nach** dem Umschalten gespielt und nur beim
        // Einschalten. Andersherum wäre der letzte Ton vor der Stille ein
        // Bestätigungston für „aus" — verwirrend genau in dem Moment, in dem
        // jemand Ruhe will.
        if (!neu) audio.click();
        this.#syncAudio();
      });
    }
    if (this.#drive) {
      // **Umschalten und gleich weiterspielen.** Ein Moduswechsel, nach dem das
      // Menü offen bleibt, verlangt zwei Handlungen für eine Absicht — und auf
      // einem Telefon liegt der „Weiter"-Knopf am anderen Rand des Kastens.
      this.#must(menu, '.menu__drive').addEventListener('click', () => {
        this.#drive?.toggle();
        this.#syncDrive();
        this.#resume();
      });
    }
    this.#must(menu, '.menu__reclassify').addEventListener('click', () => {
      this.#quality.reclassify();
    });
    for (const button of menu.querySelectorAll<HTMLElement>('.menu__tab')) {
      button.addEventListener('click', () => {
        this.#tab = button.dataset.tab as TabKey;
        this.#syncTabs(menu);
      });
    }
    // Klick neben den Kasten schließt — dieselbe Geste wie „Weiter". Der Klick
    // darf dabei **nicht** vom Kasten selbst kommen.
    menu.addEventListener('click', (event) => {
      if (event.target === menu) this.#resume();
    });

    this.#syncTabs(menu);
    return menu;
  }

  #syncTabs(menu: HTMLElement): void {
    for (const button of menu.querySelectorAll<HTMLElement>('.menu__tab')) {
      button.classList.toggle('is-active', button.dataset.tab === this.#tab);
    }
    for (const panel of menu.querySelectorAll<HTMLElement>('.menu__panel')) {
      panel.hidden = panel.dataset.panel !== this.#tab;
    }
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

  /**
   * Der Reiter „Debug" — zwei Kästchen, sonst nichts.
   *
   * **Warum das Werkzeug jetzt ausgeschaltet startet.** Bis P13 stand der
   * Zahlenblock beim Laden im Bild und die Tweakpane-Leiste daneben; wer den
   * Dev-Server für einen Blick auf die Landschaft benutzte, sah zuerst
   * Draw-Calls. Der Schalter merkt sich seinen Zustand (`localStorage`), die
   * Voreinstellung ist aber „aus" — Werkzeug holt man sich, es liegt einem nicht
   * im Weg.
   */
  #fillDebug(): void {
    const debug = this.#debug;
    if (!debug) return;
    const host = this.#must(this.#menu, '.menu__sliders--debug');

    const kasten = (label: string, read: () => boolean, write: (v: boolean) => void): void => {
      const row = this.#row(label, 'debug');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.debug = label;
      input.checked = read();
      input.addEventListener('change', () => {
        write(input.checked);
      });
      row.appendChild(input);
      host.appendChild(row);
    };

    kasten(
      'Zahlenblock (Draw-Calls, GPU)',
      () => debug.statsVisible,
      (v) => {
        debug.statsVisible = v;
      },
    );
    kasten(
      'Werkzeugleiste (Tweakpane)',
      () => debug.paneVisible,
      (v) => {
        debug.paneVisible = v;
      },
    );
  }

  /**
   * Modus-Zeile und Touch-Bedienfeld auf den **tatsächlichen** Zustand bringen.
   *
   * Gefragt wird `drive.active`, nicht ein hier mitgeführtes Kästchen. Der Modus
   * hat drei Wege — Menü, Touch-Knopf, Taste `V` —, und eine Anzeige, die nur
   * ihren eigenen Weg kennt, steht nach den beiden anderen falsch. Genau diese
   * Klasse Fehler hat P10.2 schon einmal bei der Stufenwahl gekostet („auf den
   * Namen geprüft statt auf den Wert").
   */
  /** Der Stummschalter zeigt den **Zustand**, nicht den letzten Klick. */
  #syncAudio(): void {
    const audio = this.#audio;
    if (!audio) return;
    const button = this.#menu.querySelector<HTMLElement>('.menu__mute');
    if (!button) return;
    button.textContent = audio.muted ? '🔇' : '🔊';
    button.classList.toggle('is-muted', audio.muted);
  }

  #syncDrive(): void {
    const drive = this.#drive;
    if (!drive) return;
    const label = this.#menu.querySelector<HTMLElement>('.menu__driveLabel');
    if (label) label.textContent = drive.active ? 'Aussteigen' : 'Auto fahren';
    this.#menu.querySelector('.menu__drive')?.classList.toggle('is-active', drive.active);
    this.#touch?.setDriveMode(drive.active);
  }

  #syncDebug(): void {
    const debug = this.#debug;
    if (!debug) return;
    const boxes = this.#menu.querySelectorAll<HTMLInputElement>('[data-debug]');
    const state = [debug.statsVisible, debug.paneVisible];
    boxes.forEach((box, index) => {
      box.checked = state[index] ?? false;
    });
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

  /**
   * Die Fahrzeugwahl — P18.
   *
   * Vier Karten mit Name, Kurzbeschreibung und den drei Zahlen, an denen man
   * ein Fahrzeug vor der ersten Fahrt einschätzt: Masse, Antriebsart und
   * Höchstgeschwindigkeit. Die letzte ist **gerechnet und nicht getippt** —
   * `v = ∛(P/c)` aus dem Gleichgewicht mit dem Luftwiderstand, also genau die
   * Größe, die das Fahrmodell auch fährt. Eine von Hand gepflegte Zahl daneben
   * wäre beim nächsten Reglerzug falsch, ohne dass es jemand merkt.
   *
   * **Kein `select`, sondern Knöpfe.** Auf einem Telefon öffnet ein `select`
   * das systemeigene Auswahlrad; das ist bedienbar, verdeckt aber das Bild und
   * lässt keine zweite Zeile je Eintrag zu. Vier Karten passen bei 375 px
   * untereinander.
   */
  #fillVehicles(): void {
    const drive = this.#drive;
    if (!drive) return;
    const list = this.#menu.querySelector<HTMLElement>('.menu__cars');
    if (!list) return;

    for (const id of VEHICLE_ORDER) {
      const spec = VEHICLES[id];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu__car';
      button.dataset.vehicle = id;
      const top = Math.cbrt(spec.drivetrain.power / spec.drivetrain.drag) * 3.6;
      const layout =
        spec.drivetrain.layout === 'awd'
          ? 'Allrad'
          : spec.drivetrain.layout === 'fwd'
            ? 'Frontantrieb'
            : 'Heckantrieb';
      button.innerHTML =
        `<span class="menu__carName">${spec.name}</span>` +
        `<span class="menu__carFacts">${spec.chassis.mass} kg · ${layout} · ${top.toFixed(0)} km/h</span>` +
        `<span class="menu__carBlurb">${spec.blurb}</span>`;
      button.addEventListener('click', () => {
        drive.setVehicle(id);
        this.#syncVehicles();
      });
      list.appendChild(button);
    }
    this.#syncVehicles();
  }

  /**
   * Die Auswahl auf den geltenden Zustand setzen.
   *
   * Gefragt wird `drive.vehicleId`, nicht ein hier mitgeführter letzter Klick —
   * dieselbe Begründung wie bei `#syncQuality` und `#syncDrive`. Im Dev-Bau
   * schaltet auch das Debug-Panel um, und ein Menü, das seinen eigenen letzten
   * Klick anzeigt, ist die Anzeige, die lügt.
   */
  #syncVehicles(): void {
    const drive = this.#drive;
    if (!drive) return;
    for (const button of this.#menu.querySelectorAll<HTMLElement>('.menu__car')) {
      button.classList.toggle('is-active', button.dataset.vehicle === drive.vehicleId);
    }
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
