import { Euler, Vector3, type PerspectiveCamera } from 'three';

import { WORLD, CAMERA } from '@/config/world.config';
import type { EngineContext, System } from '@/core/System';
import type { TerrainSampler } from '@/world/TerrainSampler';

const STORAGE_KEY = 'japanmap.camera';
const SAVE_INTERVAL_MS = 800;

/** Blick von Südosten über die Küstenebene auf das Massiv im Nordwesten. */
const START = {
  position: new Vector3(620, 330, 1010),
  lookAt: new Vector3(-700, 140, -720),
} as const;

const SPEED = { min: 1, max: 500, default: 45, boost: 5 } as const;
const LOOK_SENSITIVITY = 0.0022;
/**
 * Nick-Grenze — Wert und Begründung in `CAMERA.pitchLimitDeg`.
 *
 * Früher stand hier hart `Math.PI / 2 - 0.01` (89,43°). Am Pol wird jede
 * horizontale Mausbewegung zur Vollbild-Drehung im Kreis statt zum Schwenk
 * (gemessen: 12,8° Bildrotation pro 100 px bei 12,61° Gierdelta — siehe
 * world.config.ts), und der Clamp schluckt das senkrechte `movementY`. Das
 * Limit kommt deshalb aus der Konfiguration, und auch `placeAt()` und
 * `#restore()` halten es ein — sonst steht die Kamera nach einem
 * Blickpunkt-Sprung oder einem alten Save außerhalb des Bereichs, den die
 * Maus bedient, und der erste Mauszug macht einen Sprung.
 *
 * **Das Limit allein reicht nicht.** Die Drehung um die Blickachse skaliert
 * mit `sin(Nick)`: bei 75° sind das noch 97 % des Maus-Tempos, der Wirbel
 * bleibt. Deshalb kappt `#yawFactor()` die Bildrotation global — siehe
 * `CAMERA.yawSpinCap`.
 */
const PITCH_LIMIT = (CAMERA.pitchLimitDeg * Math.PI) / 180;
const YAW_SPIN_CAP = CAMERA.yawSpinCap;
/** Abstand über Grund, wenn die Kollision aktiv ist. */
const GROUND_CLEARANCE = 2;
/**
 * Dämpfung der Geschwindigkeit, 1/s. Höher = direkter, niedriger = träger.
 * Die Geschwindigkeit wird exponentiell angeglichen und nicht hart gesetzt —
 * hart gesetzt fühlt sich Fliegen nach Ruckeln an, auch bei 200 FPS.
 */
const DAMPING = 9;

/**
 * Wohin Blick und Bewegungsachsen gehen, solange der Freiflug **aus** ist.
 *
 * Der Fahrmodus (P14) übernimmt die Kamera; die Fingersteuerung kennt aber nur
 * diesen Controller (`TouchControls` bekommt ihn als `TouchCameraTarget`). Ohne
 * diese Weiterleitung wäre der Stick auf einem Telefon im Fahrmodus **tot** —
 * und ein Bedienelement, das sich bewegt und nichts tut, ist schlimmer als
 * keines. Zweitens: eine Blickdrehung, die im Fahrmodus still den Gierwinkel des
 * Freiflugs verstellt, springt beim Zurückschalten.
 */
export interface FlyInputDelegate {
  look(dx: number, dy: number): void;
  setAxes(forward: number, right: number, up: number): void;
}

interface StoredCamera {
  readonly position: [number, number, number];
  readonly yaw: number;
  readonly pitch: number;
  readonly speed: number;
  readonly collision: boolean;
}

/**
 * Freiflug-Kamera im Stil eines Kreativmodus — PLAN.md P1 / 1.5.
 *
 * | Eingabe | Wirkung |
 * |---|---|
 * | Maus (Pointer Lock) | Blickrichtung, kein Roll |
 * | W/A/S/D | relativ zur Blickrichtung |
 * | Leertaste / Strg | hoch / runter, **weltbezogen** |
 * | Shift | Boost ×5 |
 * | Mausrad | Grundgeschwindigkeit 1–500 m/s, logarithmisch |
 * | F | Terrain-Kollision an/aus |
 * | R | zurück zur Startposition |
 * | Esc | löst den Pointer Lock — seit P10.2 öffnet das das Pausenmenü |
 *
 * **Alle Tasten wirken nur bei gefangenem Zeiger.** Siehe `#onKeyDown`.
 */
export class FreeFlyController implements System {
  readonly name = 'FreeFlyController';

  #camera: PerspectiveCamera | null = null;
  #canvas: HTMLCanvasElement | null = null;
  #sampler: TerrainSampler | null = null;

  readonly #keys = new Set<string>();
  readonly #velocity = new Vector3();
  readonly #targetVelocity = new Vector3();
  readonly #forward = new Vector3();
  readonly #right = new Vector3();
  readonly #euler = new Euler(0, 0, 0, 'YXZ');

  #yaw = 0;
  #pitch = 0;
  #speed: number = SPEED.default;
  #collision = false;
  /** Fliegt der Nutzer? Im Fahrmodus (P14) nicht — dann gehört die Kamera dem Auto. */
  #enabled = true;
  #delegate: FlyInputDelegate | null = null;
  #pointerLocked = false;
  #skipNextMove = false;
  #lastSave = 0;

  /**
   * Bewegungsachsen aus einer **anderen** Eingabequelle als der Tastatur —
   * heute der Touch-Stick (P12.4), morgen ein Gamepad.
   *
   * Sie werden zu den Tasten **addiert** und nicht gegen sie getauscht: auf
   * einem Tablet mit angesteckter Tastatur wäre jede andere Regel eine
   * Überraschung, und ein Gerät, das beides kann, darf nicht eine der beiden
   * Quellen stillschweigend verschlucken.
   */
  readonly #axes = { forward: 0, right: 0, up: 0 };

  readonly #readouts = {
    geschwindigkeit: '—',
    zeiger: 'Klick ins Bild',
    blick: '—',
    gierfaktor: '—',
  };

  init(context: EngineContext): void {
    this.#camera = context.camera;
    this.#canvas = context.renderer.domElement;

    // Marker für die Abnahme: Wer „die Kamera dreht am Pol 5× zu schnell"
    // erlebt, läuft eine alte Version — dieser Eintrag steht nur hier.
    console.info(
      `[Kamera] Nick-Limit ±${CAMERA.pitchLimitDeg}°, Gier-Spin-Cap ${CAMERA.yawSpinCap} — ` +
        'am Limit ist horizontale Mausbewegung gedeckelt (F1 zeigt den Faktor).',
    );

    // Für eine Blickkamera ist die Reihenfolge YXZ Pflicht: erst Gieren um die
    // Welt-Y-Achse, dann Nicken um die lokale X-Achse. Mit der Standardordnung
    // XYZ kippt der Horizont, sobald beides zusammenkommt.
    context.camera.rotation.order = 'YXZ';

    context.bus.on('terrain:ready', ({ sampler }) => {
      this.#sampler = sampler;
    });

    this.#restore();

    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keyup', this.#onKeyUp);
    window.addEventListener('blur', this.#onBlur);
    document.addEventListener('pointerlockchange', this.#onPointerLockChange);
    document.addEventListener('mousemove', this.#onMouseMove);
    this.#canvas.addEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.addEventListener('wheel', this.#onWheel, { passive: false });

    this.#registerDebug(context);
  }

  /**
   * Freiflug an- oder abschalten — P14.
   *
   * Ausgeschaltet schreibt dieses System **nichts** mehr an die Kamera und
   * sichert auch nichts: der gesicherte Stand bleibt damit der letzte
   * *geflogene*, und ein Reload mitten im Fahren landet nicht an der Position der
   * Verfolgerkamera. Wer zurückschaltet, muss die Kamera selbst wieder setzen
   * (`placeAt`) — `update()` rechnet aus der aktuellen Position weiter, und die
   * gehörte in der Zwischenzeit dem Auto.
   */
  setEnabled(value: boolean): void {
    if (this.#enabled === value) return;
    this.#enabled = value;
    // Gedrückte Tasten und aufgebaute Geschwindigkeit gehören dem alten Modus.
    // Ohne das fliegt die Kamera beim Zurückschalten mit dem Tempo weiter, das
    // sie beim Umschalten hatte.
    this.#keys.clear();
    this.#velocity.set(0, 0, 0);
    this.#axes.forward = 0;
    this.#axes.right = 0;
    this.#axes.up = 0;
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  /** Wohin Blick und Achsen gehen, solange der Freiflug aus ist. */
  setInputDelegate(delegate: FlyInputDelegate | null): void {
    this.#delegate = delegate;
  }

  update(dt: number): void {
    const camera = this.#camera;
    if (!camera || !this.#enabled) return;

    this.#euler.set(this.#pitch, this.#yaw, 0);
    camera.quaternion.setFromEuler(this.#euler);

    camera.getWorldDirection(this.#forward);
    // Rechts = Blickrichtung × Welt-Oben, in der Waagerechten. Bewusst nicht
    // die lokale X-Achse der Kamera: Auf/Ab ist weltbezogen, dann müssen es
    // die seitlichen Achsen auch sein, sonst driftet man beim Blick nach unten.
    this.#right.set(-this.#forward.z, 0, this.#forward.x);
    if (this.#right.lengthSq() < 1e-8) this.#right.set(1, 0, 0);
    this.#right.normalize();

    const boost = this.#keys.has('shiftleft') || this.#keys.has('shiftright') ? SPEED.boost : 1;
    const target = this.#targetVelocity.set(0, 0, 0);

    if (this.#keys.has('keyw')) target.addScaledVector(this.#forward, 1);
    if (this.#keys.has('keys')) target.addScaledVector(this.#forward, -1);
    if (this.#keys.has('keyd')) target.addScaledVector(this.#right, 1);
    if (this.#keys.has('keya')) target.addScaledVector(this.#right, -1);
    if (this.#keys.has('space')) target.y += 1;
    if (this.#keys.has('controlleft') || this.#keys.has('controlright')) target.y -= 1;

    // Touch/Gamepad dazu — siehe `#axes`.
    if (this.#axes.forward !== 0) target.addScaledVector(this.#forward, this.#axes.forward);
    if (this.#axes.right !== 0) target.addScaledVector(this.#right, this.#axes.right);
    target.y += this.#axes.up;

    // **Geklemmt statt normiert.** Die Tastatur kennt nur 0 und 1, ein Stick
    // aber auch 0,3 — wer hier bedingungslos normiert, macht aus jedem
    // angetippten Stick Vollgas und nimmt dem Analogstick genau die
    // Eigenschaft, für die es ihn gibt. Über Länge 1 wird trotzdem geklemmt,
    // sonst wäre Diagonale schneller als Geradeaus.
    const länge = target.length();
    if (länge > 1) target.multiplyScalar(1 / länge);
    target.multiplyScalar(this.#speed * boost);

    // Rahmenratenunabhängige exponentielle Annäherung. `1 - e^(-k·dt)` liefert
    // bei 30 wie bei 240 FPS dieselbe Kurve; ein festes `lerp(…, 0.1)` nicht.
    const blend = 1 - Math.exp(-DAMPING * dt);
    this.#velocity.lerp(target, blend);
    camera.position.addScaledVector(this.#velocity, dt);

    if (this.#collision && this.#sampler) {
      const floor =
        this.#sampler.getHeightAt(camera.position.x, camera.position.z) + GROUND_CLEARANCE;
      if (camera.position.y < floor) {
        camera.position.y = floor;
        if (this.#velocity.y < 0) this.#velocity.y = 0;
      }
    }

    // Senkrecht begrenzen, waagerecht nicht: unter den Meeresboden zu fliegen
    // ist nie gewollt, über die Weltkante hinaus manchmal schon (Blick auf die
    // Karte von außen).
    //
    // Die Obergrenze richtet sich nach der Kantenlänge, nicht nach einer festen
    // Zahl: aus dieser Höhe passt die ganze Karte ins Bild, und das ist der
    // eigentliche Zweck des Hochfliegens.
    camera.position.y = Math.min(
      Math.max(camera.position.y, WORLD.minHeight - 20),
      WORLD.maxHeight + WORLD.size,
    );

    this.#readouts.geschwindigkeit = `${(this.#speed * boost).toFixed(0)} m/s${
      boost > 1 ? ' (Boost)' : ''
    }`;
    // Live-Ablese der Pol-Reparatur: Nick in Grad und der aktive Gier-Faktor.
    // Am Limit müssen 0,31 (bzw. `yawSpinCap / sin(Nick)`) stehen — steht dort
    // 1,00, läuft eine alte Version ohne Spin-Cap.
    this.#readouts.blick = `${(this.#pitch * (180 / Math.PI)).toFixed(0)}°`;
    this.#readouts.gierfaktor = this.#yawFactor(this.#pitch).toFixed(2);

    const now = performance.now();
    if (now - this.#lastSave > SAVE_INTERVAL_MS) {
      this.#lastSave = now;
      this.#persist();
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#onKeyDown);
    window.removeEventListener('keyup', this.#onKeyUp);
    window.removeEventListener('blur', this.#onBlur);
    document.removeEventListener('pointerlockchange', this.#onPointerLockChange);
    document.removeEventListener('mousemove', this.#onMouseMove);
    this.#canvas?.removeEventListener('pointerdown', this.#onPointerDown);
    this.#canvas?.removeEventListener('wheel', this.#onWheel);
    if (document.pointerLockElement === this.#canvas) document.exitPointerLock();

    this.#persist();
    this.#keys.clear();
    this.#camera = null;
    this.#canvas = null;
    this.#sampler = null;
  }

  // ── Eingabe ────────────────────────────────────────────────────────────

  readonly #onPointerDown = (): void => {
    void this.#canvas?.requestPointerLock();
  };

  readonly #onPointerLockChange = (): void => {
    this.#pointerLocked = document.pointerLockElement === this.#canvas;
    this.#readouts.zeiger = this.#pointerLocked ? 'gefangen (Esc löst)' : 'Klick ins Bild';
    if (!this.#pointerLocked) this.#keys.clear();
    // Beim (Neu-)Erwerben des Locks liefert der Browser einen ersten
    // Maus-Event mit dem gesamten Weg vom Klickpunkt bis zur Mitte des
    // Elements als `movementX/Y` — Hunderte Pixel auf einmal. Ohne den
    // Übersprung würde der als schlagartige Blickdrehung gewertet; am Pol
    // ist das ein heftiger Vollbild-Wirbel, „auf einmal ist die DPI 5× so
    // schnell". Dieser Weg war aber Bewegung **vor** dem Klick und gehört
    // dem Klick, nicht dem Blick.
    if (this.#pointerLocked) this.#skipNextMove = true;
  };

  readonly #onMouseMove = (event: MouseEvent): void => {
    if (!this.#pointerLocked) return;
    if (this.#skipNextMove) {
      this.#skipNextMove = false;
      return;
    }
    this.look(event.movementX, event.movementY);
  };

  // ── Eingabe von außen (Touch, später Gamepad) — P12.4 ──────────────────

  /**
   * Blick um einen Wegbetrag in Pixeln drehen.
   *
   * **Öffentlich, damit der Touch-Regler dieselbe Mathematik benutzt wie die
   * Maus** — Empfindlichkeit, Nick-Grenze und vor allem der Gier-Faktor gegen
   * den Pol-Wirbel. Eine zweite Implementierung daneben wäre eine zweite
   * Kamera: dieses Projekt hat den Pol-Wirbel einmal gemessen und behoben, und
   * ein eigener Touch-Pfad brächte ihn stillschweigend zurück.
   */
  look(dx: number, dy: number): void {
    // Im Fahrmodus gehört der Blick der Verfolgerkamera — Begründung bei
    // `FlyInputDelegate`.
    if (!this.#enabled) {
      this.#delegate?.look(dx, dy);
      return;
    }
    this.#yaw -= dx * LOOK_SENSITIVITY * this.#yawFactor(this.#pitch);
    this.#pitch -= dy * LOOK_SENSITIVITY;
    this.#pitch = Math.min(Math.max(this.#pitch, -PITCH_LIMIT), PITCH_LIMIT);
  }

  /**
   * Bewegungsachsen einer zweiten Eingabequelle setzen, jeweils −1…1.
   *
   * Wird **jeden Frame** gesetzt, solange die Quelle aktiv ist, und auf null,
   * wenn sie es nicht mehr ist. Ein Zustand, der nur beim Loslassen
   * zurückgesetzt wird, fliegt weiter, wenn das Loslassen verlorengeht — und
   * genau das passiert auf einem Touchscreen dauernd (`touchcancel` beim
   * Anruf, beim Wischen von der Kante, beim Wechsel in eine andere App).
   */
  setAxes(forward: number, right: number, up: number): void {
    if (!this.#enabled) {
      this.#delegate?.setAxes(clamp1(forward), clamp1(right), clamp1(up));
      return;
    }
    this.#axes.forward = clamp1(forward);
    this.#axes.right = clamp1(right);
    this.#axes.up = clamp1(up);
  }

  /** Grundtempo multiplikativ ändern — Pinch am Touchscreen, Rad an der Maus. */
  scaleSpeed(factor: number): void {
    this.#speed = Math.min(Math.max(this.#speed * factor, SPEED.min), SPEED.max);
  }

  /** Grundtempo in m/s — für die Anzeige im Touch-Bedienfeld. */
  get speed(): number {
    return this.#speed;
  }

  /** Bodenkollision an/aus — der Touch-Knopf hat kein „F". */
  toggleCollision(): boolean {
    this.#collision = !this.#collision;
    return this.#collision;
  }

  /** Zurück zum Startpunkt — der Touch-Knopf hat kein „R". */
  resetToStart(): void {
    this.#reset();
  }

  /**
   * Gier-Faktor, der die Drehung um die Blickachse kappt.
   *
   * Warum: das Gieren dreht um die Welt-Senkrechte. Schaut die Kamera um `θ`
   * nach oben oder unten, erscheint der Anteil `sin(θ)` dieser Drehung als
   * Drehung der ganzen Welt um den Bildmittelpunkt statt als Schwenk —
   * gemessen am alten Limit 89,43°: 12,8° Bildrotation pro 100 px statt
   * 2,4° Schwenk, gefühlt „die DPI wird 5× so schnell".
   *
   * Die erste Reparatur dämpfte erst ab 55° Nick — gemessen drehte die Welt
   * bei 55–60° weiterhin mit 76–82 % des Maus-Tempos, der Wirbel „kam auf
   * einmal wieder", sobald man über die Schwelle kippte. Dieser Faktor greift
   * deshalb von ~18° an und hält `Faktor × sin(θ)` bei **jedem** Nick auf
   * höchstens `CAMERA.yawSpinCap` (0,3): die Bildrotation ist überall
   * Schwenk-Tempo. Unterhalb der Schwelle ist die Maus unverändert direkt.
   * Preis: wer steil schaut, dreht sich entsprechend langsamer.
   */
  #yawFactor(pitch: number): number {
    const s = Math.abs(Math.sin(pitch));
    return Math.min(1, YAW_SPIN_CAP / Math.max(s, 1e-6));
  }

  readonly #onWheel = (event: WheelEvent): void => {
    if (!this.#pointerLocked) return;
    event.preventDefault();
    // Logarithmisch: eine Radrastung ändert die Geschwindigkeit immer um
    // denselben Faktor. Linear wäre der Sprung von 1 auf 11 m/s riesig und der
    // von 400 auf 410 unmerklich.
    const factor = Math.exp(-event.deltaY * 0.0012);
    this.#speed = Math.min(Math.max(this.#speed * factor, SPEED.min), SPEED.max);
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (isTyping()) return;
    // **Ohne Pointer Lock keine Steuerung** — seit P10.2, und der Grund steht
    // im Spielermenü: das liegt über dem Canvas, und wer dort einen Regler mit
    // der Tastatur bedient oder auch nur „W" streift, ließ die Kamera bis dahin
    // losfliegen. Beim Zurückkehren stand sie irgendwo, ohne dass jemand
    // geflogen wäre. `#onPointerLockChange` leert die gedrückten Tasten bereits;
    // was fehlte, war die Sperre für neue.
    //
    // Der umgekehrte Fall ist keiner: Umsehen braucht den Lock ohnehin, eine
    // Bewegung ohne Blick gibt es also nicht zu verlieren.
    if (!this.#pointerLocked) return;
    // Und im Fahrmodus gar nichts: `R` bedeutet dort „Auto zurücksetzen", und
    // beide Bedeutungen gleichzeitig hieße, dass ein Respawn nebenbei die
    // Flugkamera an den Startpunkt legt — unsichtbar, bis man zurückschaltet.
    if (!this.#enabled) return;

    const code = event.code.toLowerCase();
    if (code === 'keyf') {
      this.#collision = !this.#collision;
      return;
    }
    if (code === 'keyr') {
      this.#reset();
      return;
    }

    // Leertaste und Strg würden sonst die Seite scrollen bzw. Browserkürzel
    // auslösen, während man fliegt.
    if (code === 'space') event.preventDefault();
    this.#keys.add(code);
  };

  readonly #onKeyUp = (event: KeyboardEvent): void => {
    this.#keys.delete(event.code.toLowerCase());
  };

  /** Fenster verliert den Fokus: sonst fliegt die Kamera für immer weiter. */
  readonly #onBlur = (): void => {
    this.#keys.clear();
  };

  // ── Zustand ────────────────────────────────────────────────────────────

  #reset(): void {
    this.placeAt(START.position, START.lookAt);
    this.#speed = SPEED.default;
  }

  /**
   * Kamera an einen benannten Ort setzen.
   *
   * Öffentlich, weil die Abnahme von Bildern lebt und ein Bild einen
   * reproduzierbaren Standpunkt braucht. Bis P5 wurde dafür von Hand
   * hingeflogen — und ein Blickpunkt, den man nicht wiederherstellen kann, ist
   * genau die Sorte Zahl, die CLAUDE.md „nicht neu abgelesen" nennt: der
   * nächste Vergleich steht dann woanders, und die Differenz misst die Kamera
   * statt die Änderung.
   *
   * Gieren und Nicken werden **aus der Blickrichtung zurückgerechnet**, nicht
   * nur die Quaternion gesetzt: `update()` baut die Ausrichtung jeden Frame aus
   * diesen beiden Zahlen neu auf, eine gesetzte Quaternion wäre nach einem
   * Frame wieder weg.
   *
   * Der zurückgelesene Nick wird ins `PITCH_LIMIT` geklemmt. Ohne das kann ein
   * fast senkrechter Blickpunkt (`pass-kehren` blickt 89,9° nach unten) die
   * Kamera außerhalb des Bereichs parken, den die Maus bedient — der erste
   * Mauszug danach würde mit einem Sprung von fast 20° einsetzen, weil der
   * Clamp erst beim nächsten `mousemove` greift.
   */
  placeAt(position: Vector3, lookAt: Vector3): void {
    const camera = this.#camera;
    if (!camera) return;
    camera.position.copy(position);
    camera.lookAt(lookAt);
    this.#yaw = camera.rotation.y;
    this.#pitch = Math.min(Math.max(camera.rotation.x, -PITCH_LIMIT), PITCH_LIMIT);
    this.#velocity.set(0, 0, 0);
    this.#persist();
  }

  /**
   * Position und Blickrichtung überleben den Reload.
   *
   * Klingt nach Kleinigkeit. Über Monate Entwicklung ist es der Unterschied
   * zwischen "Änderung ansehen" und "erst wieder dorthin fliegen".
   */
  #restore(): void {
    const camera = this.#camera;
    if (!camera) return;

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.#reset();
      return;
    }

    try {
      const stored = JSON.parse(raw) as StoredCamera;
      camera.position.fromArray(stored.position);
      // Nur die Position zu prüfen hat einen kaputten Zustand durchgelassen:
      // ein nicht-endlicher Gier- oder Nick-Wert (alter Save, korrupter
      // Eintrag) baut die Kamera still zusammen — `setFromEuler` mit NaN macht
      // eine Quaternion aus lauter NaN, und der erste Mauszug „repariert" das
      // nicht, weil NaN jede Operation ansteckt.
      if (
        !Number.isFinite(stored.yaw) ||
        !Number.isFinite(stored.pitch) ||
        !Number.isFinite(camera.position.lengthSq())
      ) {
        throw new Error('ungültiger Kamerazustand');
      }
      this.#yaw = stored.yaw;
      // Saves aus der Zeit mit dem fast-senkrechten Limit (89,43°) dürfen
      // weiter zeigen: einschleusen statt verwerfen. Sonst spränge die Kamera
      // beim ersten Mauszug um die Differenz zum neuen Limit.
      this.#pitch = Math.min(Math.max(stored.pitch, -PITCH_LIMIT), PITCH_LIMIT);
      this.#speed = Math.min(Math.max(stored.speed, SPEED.min), SPEED.max);
      this.#collision = stored.collision;
    } catch {
      // Beschädigter oder veralteter Eintrag darf den Start nicht verhindern.
      localStorage.removeItem(STORAGE_KEY);
      this.#reset();
    }
  }

  #persist(): void {
    const camera = this.#camera;
    if (!camera) return;
    const stored: StoredCamera = {
      position: camera.position.toArray(),
      yaw: this.#yaw,
      pitch: this.#pitch,
      speed: this.#speed,
      collision: this.#collision,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Privater Modus oder volles Kontingent — kein Grund abzubrechen.
    }
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Kamera');
    if (!folder) return;

    folder.addBinding(this.#readouts, 'geschwindigkeit', {
      readonly: true,
      label: 'Tempo',
      interval: 150,
    });
    folder.addBinding(this.#readouts, 'zeiger', { readonly: true, label: 'Maus' });
    folder.addBinding(this.#readouts, 'blick', {
      readonly: true,
      label: 'Nick',
      interval: 100,
    });
    folder.addBinding(this.#readouts, 'gierfaktor', {
      readonly: true,
      label: 'Gier-Faktor',
      interval: 100,
    });
    folder.addButton({ title: 'Zurück zum Start (R)' }).on('click', () => {
      this.#reset();
    });
  }
}

/** Auf −1…1 klemmen, NaN wird zu 0 — ein NaN steckt die ganze Kamera an. */
function clamp1(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, -1), 1) : 0;
}

/** Tastendrücke in Eingabefeldern gehören dem Feld, nicht der Kamera. */
function isTyping(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
