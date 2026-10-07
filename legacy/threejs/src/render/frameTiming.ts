/**
 * Frame-Zeit messen, ohne GPU-Timer — PLAN.md P7.
 *
 * ## Warum nicht `requestAnimationFrame`
 *
 * Die Schleife läuft an der Bildwiederholrate: bei 60 Hz misst man 16,7 ms,
 * egal ob der Frame 2 ms oder 15 ms gekostet hat. Und sobald das Fenster
 * verdeckt ist, drosselt der Browser auf wenige Hertz — dann misst man die
 * Drosselung. Für eine Aussage über die Kosten taugt sie nicht.
 *
 * ## Warum nicht der GPU-Timer
 *
 * `EXT_disjoint_timer_query_webgl2` fehlt auf dieser Maschine (siehe CLAUDE.md).
 * Die Erweiterung wäre der genauere Weg; sie ist hier schlicht nicht da.
 *
 * ## Was hier passiert
 *
 * Ein Frame wird außerhalb der Schleife gerechnet, danach wird **ein Pixel
 * zurückgelesen**. `readPixels` muss auf das fertige Bild warten und ist damit
 * der Riegel, der die Wanduhr an die GPU koppelt.
 *
 * ## Warum nicht `gl.finish()` — nachgemessen
 *
 * Der naheliegende Weg wäre `gl.finish()`. Der erste Entwurf hier stand darauf,
 * mit genau dieser Begründung im Kommentar. **Nachgemessen stimmt sie nicht.**
 * Blickpunkt `stadt-neon`, 12 Frames, dieselbe Szene, nur der Riegel getauscht:
 *
 * | Riegel | Median | Mittel | Maximum |
 * |---|---|---|---|
 * | keiner | 1,70 ms | 4,24 ms | 19,1 ms |
 * | `gl.finish()` | 1,60 ms | 2,05 ms | 5,0 ms |
 * | `readPixels` 1×1 | **168,6 ms** | 488,6 ms | 4006 ms |
 *
 * `finish()` kehrt hier also **vor** der GPU zurück — es misst dasselbe wie gar
 * kein Riegel, nämlich das Einreihen der Kommandos. Auf ANGLE über den
 * *Microsoft Basic Render Driver* kostet der Frame in Wahrheit rund 170 ms; die
 * 1,6 ms waren eine Zahl über die Warteschlange, nicht über das Bild.
 *
 * Das ist derselbe Fehler wie die Imposter-Schwelle in P4: eine plausible
 * Herleitung, die niemand isoliert geprüft hat. Sie steht hier stehengeblieben
 * und widerlegt, weil die Verwechslung leicht wieder passiert.
 *
 * **Was diese Messung nicht ist:** eine Bildrate. Sie läuft ohne Vsync und ohne
 * die Lücke zwischen zwei Frames, und die absoluten Zahlen gehören diesem
 * Software-Rasterisierer, nicht der Zielhardware. Sie vergleicht **Zustände
 * miteinander** — dieselbe Kamera, dieselbe Szene, ein geänderter Schalter.
 */

export interface FrameTiming {
  readonly frames: number;
  readonly meanMs: number;
  readonly medianMs: number;
  /** 95. Perzentil — das, was als Ruckler auffällt. */
  readonly p95Ms: number;
  readonly worstMs: number;
}

export interface FrameTimingOptions {
  readonly tick: () => void;
  readonly gl: WebGL2RenderingContext;
  /** Gemessene Frames. Default 12 — ein Frame kostet hier Sekundenbruchteile. */
  readonly frames?: number;
  /**
   * Verworfene Frames davor. Default 8.
   *
   * Nicht optional aus Bequemlichkeit: der erste Frame nach einer Änderung
   * enthält Shader-Übersetzungen und Puffer-Neuanlagen, und im Fall der
   * Vegetation füllt sich obendrein der Chunk-Cache. Ein Lauf ohne Aufwärmen
   * misst das Aufwärmen. Genau daran ist in P4 eine Zahl vorbeigegangen —
   * 0,70 ms warm gegen 12,7 ms kalt.
   */
  readonly warmup?: number;
}

export function measureFrameTime(options: FrameTimingOptions): FrameTiming {
  const { tick, gl } = options;
  const frames = options.frames ?? 12;
  const warmup = options.warmup ?? 8;
  const pixel = new Uint8Array(4);

  /** Der Riegel: ein Pixel aus dem fertigen Bild. Siehe Kopf der Datei. */
  const sync = (): void => {
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  };

  for (let i = 0; i < warmup; i++) {
    tick();
    sync();
  }

  const samples: number[] = [];
  for (let i = 0; i < frames; i++) {
    const started = performance.now();
    tick();
    sync();
    samples.push(performance.now() - started);
  }

  samples.sort((a, b) => a - b);
  const sum = samples.reduce((acc, value) => acc + value, 0);
  const at = (fraction: number): number =>
    samples[Math.min(samples.length - 1, Math.floor(fraction * samples.length))] ?? 0;

  return {
    frames,
    meanMs: sum / samples.length,
    medianMs: at(0.5),
    p95Ms: at(0.95),
    worstMs: samples[samples.length - 1] ?? 0,
  };
}
