/**
 * Render-Loop mit fixem Simulationsschritt und variablem Render-Schritt.
 *
 * Warum das schon in P0 steht, obwohl noch nichts simuliert wird: Fahrphysik
 * braucht deterministische Zeitschritte (gleiche Eingabe, gleiches Ergebnis —
 * unabhängig davon, ob der Rechner 144 oder 40 FPS schafft). Diese Trennung
 * nachträglich einzuziehen bedeutet, jedes System noch einmal anzufassen.
 *
 * Ablauf pro Frame:
 *   1. Verstrichene Zeit in einen Akkumulator geben
 *   2. Solange ≥ ein fixer Schritt drin ist: fixedUpdate(1/60) aufrufen
 *   3. update(dt, alpha) — alles, was auf die echte Framerate reagieren darf
 *      (Kamera, Eingabe, LOD-Auswahl)
 *   4. render(alpha) — alpha ∈ [0,1) ist der Rest im Akkumulator und dient
 *      später der Interpolation zwischen zwei Simulationsschritten
 */

export interface RenderLoopHandlers {
  /**
   * Erster Aufruf im Frame, vor jeder Simulation und vor dem ersten
   * GL-Kommando. Hier setzen Zähler und Zeitmessung auf. Die Messgrenze muss
   * hier liegen, nicht erst vor dem Rendern: sonst fehlt die Zeit, die Systeme
   * in update() verbrauchen — und genau die wächst über die Phasen.
   */
  readonly beginFrame: () => void;
  /** Fixer Zeitschritt in Sekunden. Deterministisch. */
  readonly fixedUpdate: (dt: number) => void;
  /** Variabler Zeitschritt in Sekunden. */
  readonly update: (dt: number, alpha: number) => void;
  readonly render: (alpha: number) => void;
}

export interface RenderLoopOptions {
  /** Frequenz der Simulation. Default 60 Hz. */
  readonly fixedHz?: number;
  /**
   * Obergrenze für Simulationsschritte pro Frame. Ohne die entsteht die
   * "Spirale des Todes": ein langsamer Frame erzeugt mehr Simulationsschritte,
   * die den nächsten Frame noch langsamer machen. Default 5.
   */
  readonly maxStepsPerFrame?: number;
}

export class RenderLoop {
  readonly #handlers: RenderLoopHandlers;
  readonly #fixedDt: number;
  readonly #maxSteps: number;

  #rafId: number | null = null;
  #lastTime = 0;
  #accumulator = 0;
  #frameCount = 0;
  #stepsLastFrame = 0;
  /** Reine Wanduhr-Zeit des letzten Frames in Millisekunden. */
  #frameTimeMs = 0;

  constructor(handlers: RenderLoopHandlers, options: RenderLoopOptions = {}) {
    this.#handlers = handlers;
    this.#fixedDt = 1 / (options.fixedHz ?? 60);
    this.#maxSteps = options.maxStepsPerFrame ?? 5;
    document.addEventListener('visibilitychange', this.#onVisibilityChange);
  }

  get running(): boolean {
    return this.#rafId !== null;
  }

  get fixedDt(): number {
    return this.#fixedDt;
  }

  get frameCount(): number {
    return this.#frameCount;
  }

  get stepsLastFrame(): number {
    return this.#stepsLastFrame;
  }

  get frameTimeMs(): number {
    return this.#frameTimeMs;
  }

  start(): void {
    if (this.#rafId !== null) return;
    this.resetClock();
    this.#rafId = requestAnimationFrame(this.#tick);
  }

  stop(): void {
    if (this.#rafId === null) return;
    cancelAnimationFrame(this.#rafId);
    this.#rafId = null;
  }

  /**
   * Uhr neu setzen, ohne zu simulieren. Nötig nach jeder Pause (Tab im
   * Hintergrund, Debugger-Breakpoint) — sonst kommt der erste Frame danach mit
   * einem dt von mehreren Sekunden zurück.
   */
  resetClock(): void {
    this.#lastTime = performance.now();
    this.#accumulator = 0;
  }

  /**
   * Genau einen Frame rechnen, außerhalb der Schleife.
   *
   * Für Messungen, die nicht von `requestAnimationFrame` abhängen dürfen.
   * Browser drosseln rAF auf wenige Hertz, sobald das Fenster verdeckt ist —
   * eine Prüfung, die auf die Schleife wartet, misst dann die Drosselung statt
   * des Renderers.
   */
  tick(): void {
    this.#frame(performance.now());
  }

  dispose(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
  }

  readonly #onVisibilityChange = (): void => {
    if (!document.hidden) this.resetClock();
  };

  readonly #tick = (now: number): void => {
    this.#rafId = requestAnimationFrame(this.#tick);
    this.#frame(now);
  };

  #frame(now: number): void {
    this.#handlers.beginFrame();

    const rawDt = (now - this.#lastTime) / 1000;
    this.#lastTime = now;

    // Zeit, die maximal simuliert wird. Alles darüber wird verworfen: lieber
    // Zeitlupe als eine Frame-Lawine.
    const dt = Math.min(rawDt, this.#fixedDt * this.#maxSteps);
    this.#accumulator += dt;

    let steps = 0;
    while (this.#accumulator >= this.#fixedDt && steps < this.#maxSteps) {
      this.#handlers.fixedUpdate(this.#fixedDt);
      this.#accumulator -= this.#fixedDt;
      steps++;
    }
    this.#stepsLastFrame = steps;

    const alpha = this.#accumulator / this.#fixedDt;
    this.#handlers.update(dt, alpha);
    this.#handlers.render(alpha);

    this.#frameCount++;
    this.#frameTimeMs = performance.now() - now;
  }
}
