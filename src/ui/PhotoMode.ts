import { Euler, Vector2, Vector3 } from "three";
import type { Engine } from "@/core/Engine";
import "./photoMode.css";

/** Ein eingefrorener Frame, derselbe Renderer; Qualität bleibt unangetastet. */
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
    const root = document.createElement("div");
    root.className = "photo-mode";
    root.innerHTML = `<div class="photo-mode__view" aria-label="Drag to look around"></div><div class="photo-mode__top"><div><strong>Photo mode</strong><span>World paused · Drag to look</span></div><button data-action="exit">Exit Photo</button></div><div class="photo-mode__controls"><div class="photo-mode__moves" aria-label="Camera movement"><button data-move="forward">Forward</button><button data-move="up">Up</button><button data-move="left">Left</button><button data-move="right">Right</button><button data-move="back">Back</button><button data-move="down">Down</button></div><div class="photo-mode__actions"><button data-action="capture">Capture High</button><button data-action="small">Capture smaller</button><button data-action="reset">Reset camera</button><button data-action="hide">Hide UI</button></div><p role="status">Capture up to ${matchMedia("(pointer: coarse)").matches ? "1920" : "2560"} px. Your graphics preset stays unchanged.</p></div><button class="photo-mode__show" hidden>Show UI</button><div class="photo-mode__result" hidden><img alt="Your captured photo" /><p></p><a download>Download PNG</a><button data-action="retake">Retake</button><button data-action="return">Return to game</button></div>`;
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
    const euler = new Euler(0, 0, 0, "YXZ");
    const move = new Vector3();
    const result = root.querySelector<HTMLElement>(".photo-mode__result")!;
    const status = root.querySelector<HTMLElement>("[role=status]")!;
    const paint = (now: number): void => {
      const dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      if (held && result.hidden) {
        move
          .set(
            held === "left" ? -1 : held === "right" ? 1 : 0,
            held === "up" ? 1 : held === "down" ? -1 : 0,
            held === "forward" ? -1 : held === "back" ? 1 : 0,
          )
          .applyQuaternion(camera.quaternion);
        camera.position.addScaledVector(move, dt * 12);
      }
      if (!busy) engine.renderFrame();
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
      window.removeEventListener("blur", release);
      reset();
      if (url) URL.revokeObjectURL(url);
      root.remove();
      this.#close = null;
      engine.start();
      onExit(resume);
    };
    const key = (event: KeyboardEvent): void => {
      // Vor Karte/Fahrmodus abfangen; Tab und native Button-Aktionen bleiben.
      event.stopImmediatePropagation();
      if (event.code === "Escape") {
        event.preventDefault();
        close();
      }
    };
    const release = (): void => {
      held = null;
      pointer = null;
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", release);
    this.#close = close;
    const view = root.querySelector<HTMLElement>(".photo-mode__view")!;
    view.onpointerdown = (event) => {
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      view.setPointerCapture(event.pointerId);
    };
    view.onpointermove = (event) => {
      if (!pointer || pointer.id !== event.pointerId || busy) return;
      euler.setFromQuaternion(camera.quaternion, "YXZ");
      euler.y -= (event.clientX - pointer.x) * 0.004;
      euler.x = Math.max(
        -1.5,
        Math.min(1.5, euler.x - (event.clientY - pointer.y) * 0.004),
      );
      camera.quaternion.setFromEuler(euler);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    view.onpointerup = release;
    view.onpointercancel = release;
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      "[data-move]",
    )) {
      button.onpointerdown = (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        held = button.dataset.move!;
      };
      button.onpointerup = release;
      button.onpointercancel = release;
      button.onlostpointercapture = release;
      button.onclick = (event) => {
        if (event.detail === 0) {
          held = button.dataset.move!;
          setTimeout(release, 100);
        }
      };
    }
    const capture = async (small: boolean): Promise<void> => {
      if (busy) return;
      busy = true;
      held = null;
      const buttons = root.querySelectorAll<HTMLButtonElement>("button");
      buttons.forEach((b) => (b.disabled = true));
      status.textContent = "Capturing…";
      const size = engine.size,
        oldRatio = engine.renderer.getPixelRatio();
      const buffer = new Vector2();
      engine.renderer.getDrawingBufferSize(buffer);
      const cap = small
        ? 1280
        : matchMedia("(pointer: coarse)").matches
          ? 1920
          : 2560;
      const target = Math.min(
        cap,
        Math.max(
          small ? 0 : Math.max(buffer.x, buffer.y),
          Math.max(size.width, size.height) * (small ? 1 : 2),
        ),
      );
      const scale = target / Math.max(size.width, size.height);
      try {
        engine.renderer.setPixelRatio(1);
        engine.resize(
          Math.round(size.width * scale),
          Math.round(size.height * scale),
        );
        engine.renderFrame();
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
