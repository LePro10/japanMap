import { Euler, Vector2, Vector3 } from "three";

import { FreeFlyController } from "@/camera/FreeFlyController";
import type { Engine } from "@/core/Engine";
import { CAMERA } from "@/config/world.config";
import type { QualitySystem } from "@/render/QualitySystem";
import "./photoMode.css";

/** Langsam genug zum Einrahmen, schnell genug für die 3-km-Insel. */
const FLY_SPEED = 18;
const FOV_MIN = 18;
const FOV_MAX = 90;
const LOOK = 0.004;
const PITCH_LIMIT = (CAMERA.pitchLimitDeg * Math.PI) / 180;

function flyOf(engine: Engine): FreeFlyController | null {
  for (const system of engine.systems) {
    if (system instanceof FreeFlyController) return system;
  }
  return null;
}

function qualityOf(engine: Engine): QualitySystem | null {
  for (const system of engine.systems) {
    // Name, nicht `instanceof`: der Prüfstand importiert dieselbe Klasse über
    // einen anderen Vite-Pfad, und zwei Kopien einer Klasse sind zwei Typen.
    if (system.name === "Qualität") return system as QualitySystem;
  }
  return null;
}

/** Freie Kamera, Welt pausiert; Capture High zeichnet einen Ultra-Frame. */
export class PhotoMode {
  readonly #engine: Engine;
  readonly #container: HTMLElement;
  #close: (() => void) | null = null;
  constructor(engine: Engine, container: HTMLElement) {
    this.#engine = engine;
    this.#container = container;
  }

  open(car: string, place: string, onExit: (resume?: boolean) => void): void {
    if (this.#close) return;
    const engine = this.#engine,
      camera = engine.camera;
    const position = camera.position.clone(),
      rotation = camera.quaternion.clone(),
      fov = camera.fov;
    const fly = flyOf(engine);
    const flyWasOn = fly?.enabled ?? false;
    // Sonst schreibt `FreeFlyController.update()` Gieren/Nicken aus seinem
    // eigenen Stand zurück und die Vorschau-Schleife nimmt dem Fotomodus die
    // Kamera weg — genau dann, wenn Vegetation und LOD wieder mitlaufen.
    fly?.setEnabled(false);
    const touch = matchMedia("(pointer: coarse)").matches;
    const root = document.createElement("div");
    root.className = "photo-mode";
    root.innerHTML = `<div class="photo-mode__view" aria-label="Drag to look around"></div><div class="photo-mode__top"><div><strong>Photo mode</strong><span>World paused · WASD move · Space / Shift up / down · Wheel zoom</span></div><button data-action="exit">Exit Photo</button></div><div class="photo-mode__controls"><div class="photo-mode__moves" aria-label="Camera movement"><button data-move="forward">Forward</button><button data-move="up">Up</button><button data-move="left">Left</button><button data-move="right">Right</button><button data-move="back">Back</button><button data-move="down">Down</button></div><div class="photo-mode__actions"><button data-action="capture">Capture High</button><button data-action="small">Capture smaller</button><button data-action="reset">Reset camera</button><button data-action="hide">Hide UI</button></div><p role="status">WASD to fly, Space / Shift for height, wheel to zoom. Capture High draws one Ultra frame, then restores your preset. Up to ${touch ? "1920" : "2560"} px.</p></div><button class="photo-mode__show" hidden>Show UI</button><div class="photo-mode__result" hidden><img alt="Your captured photo" /><p></p><a download>Download PNG</a><button data-action="retake">Retake</button><button data-action="return">Return to game</button></div>`;
    this.#container.append(root);
    engine.stop();
    if (document.pointerLockElement) document.exitPointerLock();
    let frame = 0,
      previous = performance.now(),
      held: string | null = null,
      url: string | null = null,
      busy = false,
      closed = false;
    let pointer: { id: number; x: number; y: number } | null = null;
    const keys = new Set<string>();
    const euler = new Euler(0, 0, 0, "YXZ");
    const move = new Vector3();
    const forward = new Vector3();
    const right = new Vector3();
    const result = root.querySelector<HTMLElement>(".photo-mode__result")!;
    const status = root.querySelector<HTMLElement>("[role=status]")!;
    const view = root.querySelector<HTMLElement>(".photo-mode__view")!;
    const axis = (positive: boolean, negative: boolean): number =>
      (positive ? 1 : 0) - (negative ? 1 : 0);
    const paint = (now: number): void => {
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      if (result.hidden) {
        const ax = axis(
          keys.has("KeyD") || held === "right",
          keys.has("KeyA") || held === "left",
        );
        const az = axis(
          keys.has("KeyW") || held === "forward",
          keys.has("KeyS") || held === "back",
        );
        const ay = axis(
          keys.has("Space") || held === "up",
          keys.has("ShiftLeft") || keys.has("ShiftRight") || held === "down",
        );
        if (ax || ay || az) {
          camera.getWorldDirection(forward);
          right.set(-forward.z, 0, forward.x);
          if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
          else right.normalize();
          move.set(0, 0, 0);
          if (az) move.addScaledVector(forward, az);
          if (ax) move.addScaledVector(right, ax);
          move.y += ay;
          const length = move.length();
          if (length > 1) move.multiplyScalar(1 / length);
          if (length > 0) camera.position.addScaledVector(move, dt * FLY_SPEED);
        }
      }
      if (!busy) engine.previewFrame(dt);
      frame = requestAnimationFrame(paint);
    };
    const reset = (): void => {
      camera.position.copy(position);
      camera.quaternion.copy(rotation);
      camera.fov = fov;
      camera.updateProjectionMatrix();
    };
    const close = (resume = false): void => {
      if (busy) return;
      closed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", key, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("blur", release);
      reset();
      if (url) URL.revokeObjectURL(url);
      root.remove();
      this.#close = null;
      fly?.setEnabled(flyWasOn);
      engine.start();
      onExit(resume);
    };
    const key = (event: KeyboardEvent): void => {
      // Vor Karte/Fahrmodus abfangen; Tab und native Button-Aktionen bleiben.
      event.stopImmediatePropagation();
      if (event.code === "Escape") {
        event.preventDefault();
        if (event.type === "keydown") close();
        return;
      }
      if (
        event.code === "KeyW" ||
        event.code === "KeyA" ||
        event.code === "KeyS" ||
        event.code === "KeyD" ||
        event.code === "Space" ||
        event.code === "ShiftLeft" ||
        event.code === "ShiftRight"
      ) {
        event.preventDefault();
        if (event.type === "keydown") keys.add(event.code);
        else keys.delete(event.code);
      }
    };
    const releasePointer = (): void => {
      held = null;
      pointer = null;
    };
    const release = (): void => {
      releasePointer();
      keys.clear();
    };
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (busy || !result.hidden) return;
      const notches =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? Math.sign(event.deltaY) * 3
            : event.deltaY / 100;
      camera.fov = Math.min(
        FOV_MAX,
        Math.max(FOV_MIN, camera.fov + notches * 4),
      );
      camera.updateProjectionMatrix();
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", key, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("blur", release);
    this.#close = close;
    view.onpointerdown = (event) => {
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      view.setPointerCapture(event.pointerId);
    };
    view.onpointermove = (event) => {
      if (!pointer || pointer.id !== event.pointerId || busy) return;
      euler.setFromQuaternion(camera.quaternion, "YXZ");
      euler.y -= (event.clientX - pointer.x) * LOOK;
      euler.x = Math.max(
        -PITCH_LIMIT,
        Math.min(PITCH_LIMIT, euler.x - (event.clientY - pointer.y) * LOOK),
      );
      camera.quaternion.setFromEuler(euler);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    view.onpointerup = () => {
      pointer = null;
    };
    view.onpointercancel = () => {
      pointer = null;
    };
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      "[data-move]",
    )) {
      button.onpointerdown = (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        held = button.dataset.move!;
      };
      button.onpointerup = releasePointer;
      button.onpointercancel = releasePointer;
      button.onlostpointercapture = releasePointer;
      button.onclick = (event) => {
        if (event.detail === 0) {
          held = button.dataset.move!;
          setTimeout(releasePointer, 100);
        }
      };
    }
    const capture = async (small: boolean): Promise<void> => {
      if (busy) return;
      busy = true;
      held = null;
      keys.clear();
      const buttons = root.querySelectorAll<HTMLButtonElement>("button");
      buttons.forEach((b) => (b.disabled = true));
      status.textContent = "Capturing…";
      const size = engine.size,
        oldRatio = engine.renderer.getPixelRatio();
      const buffer = new Vector2();
      engine.renderer.getDrawingBufferSize(buffer);
      const cap = small ? 1280 : touch ? 1920 : 2560;
      const target = Math.min(
        cap,
        Math.max(
          small ? 0 : Math.max(buffer.x, buffer.y),
          Math.max(size.width, size.height) * (small ? 1 : 2),
        ),
      );
      const scale = target / Math.max(size.width, size.height);
      const quality = qualityOf(engine);
      try {
        // Nur Capture High: ein Ultra-Frame (PostFX, Gelände, Spiegelung),
        // Spielstufe danach zurück. Capture smaller bleibt auf der Spielstufe.
        if (!small) quality?.beginCapture();
        engine.renderer.setPixelRatio(1);
        engine.resize(
          Math.round(size.width * scale),
          Math.round(size.height * scale),
        );
        // LOD und Streuung gegen den neuen Frustum, sonst fängt Capture die
        // Vorschau eines anderen Bildausschnitts.
        engine.previewFrame(0);
        const blob = await new Promise<Blob>((resolve, reject) =>
          engine.renderer.domElement.toBlob(
            (b) =>
              b ? resolve(b) : reject(new Error("PNG capture unavailable")),
            "image/png",
          ),
        );
        if (closed) return;
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob);
        const img = result.querySelector("img")!;
        img.src = url;
        const link = result.querySelector("a")!;
        link.href = url;
        const stamp = new Date()
          .toISOString()
          .replace("T", "_")
          .replace(/:/g, "-")
          .slice(0, 19);
        link.download = `japanMap_${place}_${car}_${stamp}.png`;
        result.querySelector("p")!.textContent =
          `${engine.renderer.domElement.width} × ${engine.renderer.domElement.height} · PNG`;
        result.hidden = false;
        status.textContent = "Photo ready.";
        link.focus();
      } catch {
        status.textContent = "Capture could not finish. Try Capture smaller.";
      } finally {
        quality?.endCapture();
        engine.renderer.setPixelRatio(oldRatio);
        engine.resize(size.width, size.height);
        busy = false;
        buttons.forEach((b) => (b.disabled = false));
      }
    };
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      "[data-action]",
    ))
      button.onclick = () => {
        switch (button.dataset.action) {
          case "exit":
            close();
            break;
          case "return":
            close(true);
            break;
          case "reset":
            reset();
            break;
          case "capture":
            void capture(false);
            break;
          case "small":
            void capture(true);
            break;
          case "retake":
            result.hidden = true;
            break;
          case "hide":
            root.classList.add("photo-mode--hidden");
            root.querySelector<HTMLButtonElement>(".photo-mode__show")!.hidden =
              false;
            break;
        }
      };
    root.querySelector<HTMLButtonElement>(".photo-mode__show")!.onclick =
      () => {
        root.classList.remove("photo-mode--hidden");
        root.querySelector<HTMLButtonElement>(".photo-mode__show")!.hidden =
          true;
      };
    frame = requestAnimationFrame(paint);
  }
  dispose(): void {
    this.#close?.();
  }
}
