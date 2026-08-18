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

export interface TouchControlsOptions {
  readonly canvas: HTMLCanvasElement;
  readonly container: HTMLElement;
  readonly camera: TouchCameraTarget;
  /** Öffnet das Pausenmenü — auf Touch der einzige Weg dorthin. */
  readonly onMenu: () => void;
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
      </div>
      <div class="touch__side">
        <button type="button" class="touch__btn touch__btn--wide" data-touch="menu">☰</button>
        <button type="button" class="touch__btn touch__btn--wide" data-touch="reset">⟲</button>
        <button type="button" class="touch__btn touch__btn--wide" data-touch="collision">⇩</button>
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
    const halten = (element: HTMLElement, richtung: number): void => {
      // **`pointerdown`/`pointerup` und nicht `click`.** Ein Knopf zum Steigen
      // muss halten, solange der Finger liegt; `click` feuert erst beim
      // Loslassen und wäre ein Tippen für einen Meter.
      element.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.#vertical = richtung;
        this.#pushAxes();
        capture(element, event.pointerId);
      });
      const los = (): void => {
        this.#vertical = 0;
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
    this.#must('[data-touch="reset"]').addEventListener('click', () => {
      this.#camera.resetToStart();
      this.#updateSpeedLabel();
    });
    const kollision = this.#must('[data-touch="collision"]');
    kollision.addEventListener('click', () => {
      kollision.classList.toggle('is-active', this.#camera.toggleCollision());
    });
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
