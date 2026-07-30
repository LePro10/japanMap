import { Euler, Vector3, type PerspectiveCamera } from 'three';

import { WORLD } from '@/config/world.config';
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
const PITCH_LIMIT = Math.PI / 2 - 0.01;
/** Abstand über Grund, wenn die Kollision aktiv ist. */
const GROUND_CLEARANCE = 2;
/**
 * Dämpfung der Geschwindigkeit, 1/s. Höher = direkter, niedriger = träger.
 * Die Geschwindigkeit wird exponentiell angeglichen und nicht hart gesetzt —
 * hart gesetzt fühlt sich Fliegen nach Ruckeln an, auch bei 200 FPS.
 */
const DAMPING = 9;

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
  #pointerLocked = false;
  #lastSave = 0;

  readonly #readouts = {
    geschwindigkeit: '—',
    zeiger: 'Klick ins Bild',
  };

  init(context: EngineContext): void {
    this.#camera = context.camera;
    this.#canvas = context.renderer.domElement;

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

  update(dt: number): void {
    const camera = this.#camera;
    if (!camera) return;

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

    if (target.lengthSq() > 0) target.normalize().multiplyScalar(this.#speed * boost);

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
  };

  readonly #onMouseMove = (event: MouseEvent): void => {
    if (!this.#pointerLocked) return;
    this.#yaw -= event.movementX * LOOK_SENSITIVITY;
    this.#pitch -= event.movementY * LOOK_SENSITIVITY;
    this.#pitch = Math.min(Math.max(this.#pitch, -PITCH_LIMIT), PITCH_LIMIT);
  };

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
   */
  placeAt(position: Vector3, lookAt: Vector3): void {
    const camera = this.#camera;
    if (!camera) return;
    camera.position.copy(position);
    camera.lookAt(lookAt);
    this.#yaw = camera.rotation.y;
    this.#pitch = camera.rotation.x;
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
      this.#yaw = stored.yaw;
      this.#pitch = stored.pitch;
      this.#speed = Math.min(Math.max(stored.speed, SPEED.min), SPEED.max);
      this.#collision = stored.collision;
      if (!Number.isFinite(camera.position.lengthSq())) throw new Error('ungültige Position');
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
    folder.addButton({ title: 'Zurück zum Start (R)' }).on('click', () => {
      this.#reset();
    });
  }
}

/** Tastendrücke in Eingabefeldern gehören dem Feld, nicht der Kamera. */
function isTyping(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
