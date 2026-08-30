import { TOUCH } from '@/config/touch.config';

/**
 * Die Steuerung für Finger — PLAN.md P12 / 12.4.
 *
 * ## Warum es sie bis P12 nicht gab, und was das hieß
 *
 * Bis hierher hing **die gesamte** Bedienung am Pointer Lock: `FreeFlyController`
 * hört auf `mousemove` und lässt Tasten nur bei gefangenem Zeiger durch,
 * `PlayerUi` leitet seinen Zustand aus `pointerlockchange` ab. Auf einem Telefon
 * gibt es beides nicht — iOS Safari kennt `requestPointerLock` gar nicht, unter
 * Android schlägt es bei Fingereingabe fehl.
 *
 * Die Folge war nicht „schlecht bedienbar", sondern **gar nicht**: `#everLocked`
 * wurde nie wahr, also ließ sich nicht einmal das Pausenmenü öffnen. Ein
 * Besucher mit Telefon bekam ein Standbild und einen Kasten mit der Aufschrift
 * „Für Touch-Geräte ist diese Ansicht nicht ausgelegt".
 *
 * ## Das Schema
 *
 * | Geste | Wirkung |
 * |---|---|
 * | Finger auf der **linken** Bildhälfte | virtueller Stick: vorwärts/rückwärts, seitlich |
 * | Finger auf der **rechten** Bildhälfte ziehen | umsehen |
 * | **zwei** Finger rechts auseinander/zusammen | Grundtempo |
 * | ▲ / ▼ unten rechts | steigen / sinken |
 * | ☰ oben rechts | Menü |
 *
 * Der Stick erscheint **dort, wo der Finger aufsetzt**, statt an einem festen
 * Platz. Ein fester Stick zwingt den Daumen auf eine Stelle, die er auf einem
 * 6-Zoll-Gerät im Querformat kaum erreicht; ein aufsetzender ist auf jedem
 * Format bedienbar und verdeckt nur, solange er benutzt wird.
 *
 * ## Pointer Events, nicht Touch Events
 *
 * `setPointerCapture` ist der Grund: ohne ihn verliert man `pointermove`, sobald
 * der Finger den Canvas verlässt — und dann bleibt eine Achse stehen und die
 * Kamera fliegt weiter. Genau diese Klasse Fehler («das Loslassen geht
 * verloren») fängt zusätzlich `pointercancel`, das der Browser bei einem Anruf,
 * einer Wischgeste von der Kante oder einem App-Wechsel schickt.
 */

/** Was die Steuerung von der Kamera braucht. Bewusst schmal — siehe `PlayerUi`. */
export interface TouchCameraTarget {
  look(dx: number, dy: number): void;
  setAxes(forward: number, right: number, up: number): void;
  scaleSpeed(factor: number): void;
  toggleCollision(): boolean;
  resetToStart(): void;
  readonly speed: number;
}

/**
 * Was die Fingersteuerung vom Fahrmodus braucht.
 *
 * **Der Grund, warum es diese Schnittstelle überhaupt gibt.** Bis hierher war
 * der Fahrmodus auf einem Telefon *vollständig unerreichbar*, und zwar über
 * alle drei Wege gleichzeitig: `DriveSystem.#onKeyDown` steigt bei
 * `document.pointerLockElement === null` sofort aus (auf Touch gibt es nie
 * einen Lock), `window.japanMap` wird aus dem Auslieferungsbau entfernt, und
 * ein Knopf dafür existierte nicht. Damit waren sechs Dateien Fahrschicht für
 * genau die Zielgruppe unsichtbar, für die P15 den Startdownload unter die
 * 20-MB-Schwelle der CrazyGames-Mobile-Homepage gedrückt hat.
 *
 * Der Stick selbst war schon verdrahtet — `FreeFlyController.setAxes()` reicht
 * an den Fahrmodus weiter, sobald der Freiflug aus ist. Es fehlte allein der
 * **Umschalter**.
 */
export interface TouchDriveTarget {
  readonly active: boolean;
  toggle(): void;
  respawn(): void;
  setHandbrake(down: boolean): void;
}

export interface TouchControlsOptions {
  readonly canvas: HTMLCanvasElement;
  readonly container: HTMLElement;
  readonly camera: TouchCameraTarget;
  /** Öffnet das Pausenmenü — auf Touch der einzige Weg dorthin. */
  readonly onMenu: () => void;
  /** Der Fahrmodus. Fehlt er, bleibt das Bedienfeld reines Flugwerkzeug. */
  readonly drive?: TouchDriveTarget;
}

interface StickState {
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  x: number;
  y: number;
}

interface LookState {
  readonly pointerId: number;
  lastX: number;
  lastY: number;
}

export class TouchControls {
  readonly #canvas: HTMLCanvasElement;
  readonly #camera: TouchCameraTarget;
  readonly #drive: TouchDriveTarget | null;
  readonly #root: HTMLElement;
  readonly #stickBase: HTMLElement;
  readonly #stickKnob: HTMLElement;
  readonly #speedLabel: HTMLElement;

  #stick: StickState | null = null;
  #look: LookState | null = null;
  /** Zweiter Finger auf der Blickhälfte — dann wird gezoomt statt geschaut. */
  #pinch: { readonly pointerId: number; x: number; y: number; distance: number } | null = null;
  #vertical = 0;
  #enabled = false;

  constructor(options: TouchControlsOptions) {
    this.#canvas = options.canvas;
    this.#camera = options.camera;
    this.#drive = options.drive ?? null;

    this.#root = document.createElement('div');
    this.#root.className = 'touch';
    this.#root.hidden = true;
    this.#root.innerHTML = `
      <div class="touch__stick" hidden>
        <div class="touch__stickKnob"></div>
      </div>
      <div class="touch__buttons">
        <button type="button" class="touch__btn" data-touch="up" aria-label="steigen">▲</button>
        <button type="button" class="touch__btn" data-touch="down" aria-label="sinken">▼</button>
        <button type="button" class="touch__btn" data-touch="handbrake" aria-label="Handbrake">✋</button>
      </div>
      <div class="touch__side">
        <button type="button" class="touch__btn touch__btn--wide" data-touch="menu" aria-label="Menu">☰</button>
        <button type="button" class="touch__btn touch__btn--wide" data-touch="drive" aria-label="Car">🚗</button>
        <button type="button" class="touch__btn touch__btn--wide" data-touch="reset" aria-label="zurücksetzen">⟲</button>
        <button type="button" class="touch__btn touch__btn--wide" data-touch="collision" aria-label="Ground collision">⇩</button>
      </div>
      <p class="touch__speed">—</p>`;
    options.container.appendChild(this.#root);

    this.#stickBase = this.#must('.touch__stick');
    this.#stickKnob = this.#must('.touch__stickKnob');
    this.#speedLabel = this.#must('.touch__speed');

    this.#wireButtons(options.onMenu);

    // **Nicht `pointer: coarse` allein.** Ein Laptop mit Touchscreen meldet
    // `fine` (die Maus ist das genauere Zeigegerät) und hat trotzdem Finger;
    // ein Tablet mit Maus meldet umgekehrt. Angeschaltet wird deshalb, sobald
    // wirklich ein Finger aufsetzt — und für die Erstanzeige zählt `coarse`,
    // damit das Bedienfeld nicht erst nach der ersten Berührung erscheint.
    if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) {
      this.#enable();
    } else {
      this.#canvas.addEventListener('pointerdown', this.#onFirstTouch);
    }
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  /** Bedienfeld ausblenden, solange das Menü offen ist. */
  setVisible(visible: boolean): void {
    if (this.#enabled) this.#root.hidden = !visible;
    if (!visible) this.#releaseAll();
  }

  dispose(): void {
    this.#canvas.removeEventListener('pointerdown', this.#onFirstTouch);
    this.#canvas.removeEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.removeEventListener('pointermove', this.#onPointerMove);
    this.#canvas.removeEventListener('pointerup', this.#onPointerUp);
    this.#canvas.removeEventListener('pointercancel', this.#onPointerUp);
    window.removeEventListener('blur', this.#releaseAll);
    this.#root.remove();
  }

  // ── Aufbau ─────────────────────────────────────────────────────────────

  readonly #onFirstTouch = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    this.#canvas.removeEventListener('pointerdown', this.#onFirstTouch);
    this.#enable();
    // Dieses `pointerdown` ist schon durch — es gehört noch bedient, sonst
    // verschluckt das Gerät die allererste Berührung.
    this.#onPointerDown(event);
  };

  #enable(): void {
    if (this.#enabled) return;
    this.#enabled = true;
    this.#root.hidden = false;
    this.#canvas.addEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.addEventListener('pointermove', this.#onPointerMove);
    this.#canvas.addEventListener('pointerup', this.#onPointerUp);
    this.#canvas.addEventListener('pointercancel', this.#onPointerUp);
    window.addEventListener('blur', this.#releaseAll);
    this.#updateSpeedLabel();
  }

  #wireButtons(onMenu: () => void): void {
    const halten = (
      element: HTMLElement,
      richtung: number,
      // Optionaler zweiter Empfänger für Knöpfe, die keine Höhenachse stellen —
      // die Handbremse. Sie teilt sich mit ▲/▼ die **Loslass-Logik**, und genau
      // die ist der schwierige Teil: `pointercancel` und `lostpointercapture`
      // fangen den Anruf, die Kantengeste und den App-Wechsel. Ein zweiter
      // eigener Handler hätte diese drei Zeilen irgendwann nicht mehr gehabt.
      halteSignal?: (down: boolean) => void,
    ): void => {
      // **`pointerdown`/`pointerup` und nicht `click`.** Ein Knopf zum Steigen
      // muss halten, solange der Finger liegt; `click` feuert erst beim
      // Loslassen und wäre ein Tippen für einen Meter.
      element.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.#vertical = richtung;
        halteSignal?.(true);
        element.classList.add('is-active');
        this.#pushAxes();
        capture(element, event.pointerId);
      });
      const los = (): void => {
        this.#vertical = 0;
        halteSignal?.(false);
        element.classList.remove('is-active');
        this.#pushAxes();
      };
      element.addEventListener('pointerup', los);
      element.addEventListener('pointercancel', los);
      element.addEventListener('lostpointercapture', los);
    };

    halten(this.#must('[data-touch="up"]'), 1);
    halten(this.#must('[data-touch="down"]'), -1);

    this.#must('[data-touch="menu"]').addEventListener('click', () => {
      this.#releaseAll();
      onMenu();
    });
    // ⟲ bedeutet in beiden Modi „zurück auf Anfang", meint aber zwei
    // verschiedene Dinge: im Flug den Startblickpunkt, im Auto die nächste
    // Straße. Ein zweiter Knopf dafür wäre auf 375 px Breite verschwendeter
    // Platz — und im jeweils anderen Modus ohne Wirkung.
    this.#must('[data-touch="reset"]').addEventListener('click', () => {
      if (this.#drive?.active) {
        this.#drive.respawn();
        return;
      }
      this.#camera.resetToStart();
      this.#updateSpeedLabel();
    });
    const kollision = this.#must('[data-touch="collision"]');
    kollision.addEventListener('click', () => {
      kollision.classList.toggle('is-active', this.#camera.toggleCollision());
    });

    // ── Fahrmodus ────────────────────────────────────────────────────────
    const auto = this.#must('[data-touch="drive"]');
    if (this.#drive) {
      auto.addEventListener('click', () => {
        // **Erst loslassen, dann umschalten.** Ein Stick, der beim Wechsel
        // ausgelenkt steht, schiebt seine Achsen sonst in das andere System
        // hinüber — im Auto wäre das Vollgas beim Einsteigen.
        this.#releaseAll();
        this.#drive?.toggle();
        this.setDriveMode(this.#drive?.active ?? false);
      });
      halten(this.#must('[data-touch="handbrake"]'), 0, (down) => {
        this.#drive?.setHandbrake(down);
      });
    } else {
      auto.hidden = true;
    }
    this.setDriveMode(this.#drive?.active ?? false);
  }

  /**
   * Bedienfeld auf Flug oder Fahrt umstellen.
   *
   * Öffentlich, weil der Modus auch **ohne** diesen Knopf wechseln kann: die
   * Taste `V` am Rechner und der Eintrag im Pausenmenü führen auf denselben
   * Zustand. Ein Bedienfeld, das seinen Modus nur beim eigenen Knopfdruck
   * nachführt, zeigt nach jedem anderen Weg das Falsche — dieselbe Klasse
   * „Anzeige, die lügt", gegen die dieses Projekt schon bei `F1` und der
   * Stufenwahl angetreten ist.
   */
  setDriveMode(active: boolean): void {
    this.#root.classList.toggle('touch--drive', active);
    // ▲/▼ steigen und sinken, ⇩ schaltet die Bodenkollision: alle drei sind im
    // Auto sinnlos. Die Handbremse ist es umgekehrt im Flug.
    this.#must('[data-touch="up"]').hidden = active;
    this.#must('[data-touch="down"]').hidden = active;
    this.#must('[data-touch="collision"]').hidden = active;
    this.#must('[data-touch="handbrake"]').hidden = !active;
    this.#must('[data-touch="drive"]').classList.toggle('is-active', active);
    if (!active) this.#drive?.setHandbrake(false);
    this.#updateSpeedLabel();
  }

  // ── Zeiger ─────────────────────────────────────────────────────────────

  readonly #onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    const links = event.clientX < window.innerWidth * TOUCH.stickZone;

    if (links && !this.#stick) {
      this.#stick = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        x: 0,
        y: 0,
      };
      this.#showStick(event.clientX, event.clientY, 0, 0);
      capture(this.#canvas, event.pointerId);
      return;
    }
    if (!links && !this.#look) {
      this.#look = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
      capture(this.#canvas, event.pointerId);
      return;
    }
    // Zweiter Finger auf der Blickhälfte: ab hier wird das Tempo gestellt und
    // **nicht mehr geschaut** — sonst dreht sich das Bild, während man zoomt.
    if (!links && this.#look && !this.#pinch) {
      const distance = Math.hypot(event.clientX - this.#look.lastX, event.clientY - this.#look.lastY);
      this.#pinch = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, distance };
      capture(this.#canvas, event.pointerId);
    }
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    if (this.#stick?.pointerId === event.pointerId) {
      const dx = event.clientX - this.#stick.originX;
      const dy = event.clientY - this.#stick.originY;
      const länge = Math.hypot(dx, dy);
      // Über den Radius hinaus wird der Knopf festgehalten, der Ausschlag
      // bleibt bei 1 — sonst führt ein weiter Wisch zu Werten über Vollgas,
      // die dann geklemmt werden und den Stick unterhalb des Randes taub
      // wirken lassen.
      const faktor = länge > TOUCH.stickRadius ? TOUCH.stickRadius / länge : 1;
      const kx = dx * faktor;
      const ky = dy * faktor;
      this.#stick.x = kx / TOUCH.stickRadius;
      this.#stick.y = ky / TOUCH.stickRadius;
      this.#showStick(this.#stick.originX, this.#stick.originY, kx, ky);
      this.#pushAxes();
      return;
    }

    if (this.#pinch?.pointerId === event.pointerId && this.#look) {
      this.#pinch.x = event.clientX;
      this.#pinch.y = event.clientY;
      const distance = Math.hypot(this.#pinch.x - this.#look.lastX, this.#pinch.y - this.#look.lastY);
      if (this.#pinch.distance > 1) {
        this.#camera.scaleSpeed(Math.pow(distance / this.#pinch.distance, TOUCH.pinchStrength));
        this.#updateSpeedLabel();
      }
      this.#pinch.distance = distance;
      return;
    }

    if (this.#look?.pointerId === event.pointerId) {
      const dx = event.clientX - this.#look.lastX;
      const dy = event.clientY - this.#look.lastY;
      this.#look.lastX = event.clientX;
      this.#look.lastY = event.clientY;
      // Solange gezoomt wird, ist der erste Finger der Bezugspunkt und dreht
      // den Blick nicht mit.
      if (!this.#pinch) this.#camera.look(dx * TOUCH.lookScale, dy * TOUCH.lookScale);
    }
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    if (this.#stick?.pointerId === event.pointerId) {
      this.#stick = null;
      this.#stickBase.hidden = true;
      this.#pushAxes();
    }
    if (this.#pinch?.pointerId === event.pointerId) this.#pinch = null;
    if (this.#look?.pointerId === event.pointerId) {
      this.#look = null;
      // Blieb der Zoom-Finger liegen, wird er zum neuen Blickfinger — sonst
      // hätte man zwei Finger auf dem Schirm und keine Wirkung.
      if (this.#pinch) {
        this.#look = { pointerId: this.#pinch.pointerId, lastX: this.#pinch.x, lastY: this.#pinch.y };
        this.#pinch = null;
      }
    }
  };

  readonly #releaseAll = (): void => {
    this.#stick = null;
    this.#look = null;
    this.#pinch = null;
    this.#vertical = 0;
    this.#stickBase.hidden = true;
    // Die Handbremse gehört dazu: sie hängt an einem gehaltenen Finger, und ein
    // App-Wechsel mit liegendem Daumen ließe sie sonst für immer angezogen.
    this.#drive?.setHandbrake(false);
    this.#root.querySelector('[data-touch="handbrake"]')?.classList.remove('is-active');
    this.#pushAxes();
  };

  // ── Anzeige ────────────────────────────────────────────────────────────

  #pushAxes(): void {
    const stick = this.#stick;
    // Bildschirm-Y zeigt nach unten, „vorwärts" ist oben — daher das
    // Minuszeichen. Eine Totzone, weil ein Daumen nie ganz stillhält und die
    // Kamera sonst dauernd kriecht.
    const forward = stick ? -deadzone(stick.y) : 0;
    const right = stick ? deadzone(stick.x) : 0;
    this.#camera.setAxes(forward, right, this.#vertical);
  }

  #showStick(originX: number, originY: number, dx: number, dy: number): void {
    this.#stickBase.hidden = false;
    this.#stickBase.style.left = `${originX}px`;
    this.#stickBase.style.top = `${originY}px`;
    this.#stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  #updateSpeedLabel(): void {
    // Im Auto zeigt das HUD das Tempo — und zwar je Frame und in km/h. Diese
    // Anzeige hier ist das **Grundtempo des Flugs** (der Pinch stellt es) und
    // wird nur bei einer Eingabe nachgeführt; im Fahrmodus stünde sie also
    // daneben und wäre dazu noch veraltet. Zwei Tempoanzeigen nebeneinander,
    // von denen eine falsch ist, sind schlechter als eine.
    this.#speedLabel.hidden = this.#drive?.active ?? false;
    this.#speedLabel.textContent = `${this.#camera.speed.toFixed(0)} m/s`;
  }

  #must(selector: string): HTMLElement {
    const element = this.#root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Touch-Steuerung: "${selector}" fehlt.`);
    return element;
  }
}

/**
 * Zeiger einfangen — **und scheitern dürfen**.
 *
 * `setPointerCapture` wirft `NotFoundError`, sobald die Zeiger-ID nicht (mehr)
 * aktiv ist. Das passiert nicht nur bei synthetischen Ereignissen im Prüfstand,
 * sondern auch im Betrieb: ein Finger, den das System zwischen `pointerdown`
 * und diesem Aufruf schon wieder abgemeldet hat (Geste vom Bildschirmrand,
 * eingehender Anruf), ist genau dieser Fall.
 *
 * **Gefunden hat es der Prüfstand**, und der Fehler war schlimmer als „eine
 * Ausnahme": der Aufruf stand *vor* dem Zeichnen des Sticks. Die Bewegung
 * funktionierte danach, der Stick blieb aber **unsichtbar** — eine Steuerung,
 * die wirkt und nichts anzeigt. Deshalb wird jetzt zuerst gezeichnet und
 * danach eingefangen, und das Einfangen darf fehlschlagen: es ist eine
 * Verbesserung (Ereignisse außerhalb des Elements), keine Voraussetzung.
 */
function capture(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Ohne Capture gehen nur Bewegungen außerhalb des Elements verloren; das
    // Loslassen fängt zusätzlich `blur` ab.
  }
}

function deadzone(value: number): number {
  const betrag = Math.abs(value);
  if (betrag < TOUCH.deadzone) return 0;
  // Nach der Totzone wieder auf den vollen Bereich strecken: sonst fehlt am
  // oberen Ende genau der Anteil, den die Totzone unten wegnimmt, und der Stick
  // erreicht Vollgas nie.
  const gestreckt = (betrag - TOUCH.deadzone) / (1 - TOUCH.deadzone);
  return Math.sign(value) * gestreckt;
}
