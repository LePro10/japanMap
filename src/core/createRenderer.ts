import {
  AgXToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  WebGLRenderer,
  type WebGLRendererParameters,
} from 'three';

import { maxPixelRatio } from '@/config/world.config';

export class WebGLUnsupportedError extends Error {
  constructor(cause?: unknown) {
    super('WebGL2 wird von diesem Browser oder Treiber nicht unterstützt.');
    this.name = 'WebGLUnsupportedError';
    this.cause = cause;
  }
}

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const parameters: WebGLRendererParameters = {
    canvas,
    // SMAA übernimmt die Kantenglättung in P2. MSAA auf dem Default-Framebuffer
    // hilft ohnehin nicht, sobald in Render-Targets gerendert wird.
    antialias: false,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false,
  };

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer(parameters);
  } catch (error) {
    throw new WebGLUnsupportedError(error);
  }

  if (!renderer.capabilities.isWebGL2) {
    renderer.dispose();
    throw new WebGLUnsupportedError();
  }

  renderer.outputColorSpace = SRGBColorSpace;
  // Wandert in P2 in die PostFX-Kette. Dann muss hier NoToneMapping stehen,
  // sonst wird zweimal getonemappt — ein Fehler, den man kaum sieht und der
  // trotzdem alle Farben verschiebt.
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1;

  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap ist seit r180 abgekündigt — three bildet es intern
  // ohnehin auf PCFShadowMap ab und warnt bei jedem Programmwechsel. Weiche
  // Kanten kommen ab P2 aus den Kaskaden, nicht aus dem Filtertyp.
  renderer.shadowMap.type = PCFShadowMap;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio()));

  // Wichtig für das Debug-Overlay: standardmäßig setzt three die Zähler bei
  // jedem render()-Aufruf zurück. Sobald der PostFX-Composer in P2 mehrere
  // Durchläufe pro Frame macht, zeigt das Overlay dann nur den letzten Pass.
  // Wir setzen stattdessen genau einmal pro Frame zurück (siehe Engine).
  renderer.info.autoReset = false;

  return renderer;
}

/**
 * Beobachtet die tatsächliche Pixelgröße des Canvas.
 *
 * ResizeObserver statt window.onresize, weil das Canvas per CSS im Layout
 * liegt: es ändert seine Größe auch, wenn das Fenster gleich bleibt (Sidebar
 * auf, DevTools angedockt, DPI-Wechsel beim Verschieben auf einen zweiten
 * Monitor). window.onresize verpasst all diese Fälle.
 */
export function observeCanvasSize(
  canvas: HTMLCanvasElement,
  onResize: (width: number, height: number) => void,
): () => void {
  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;

    // devicePixelContentBoxSize liefert exakte Geräte-Pixel und vermeidet den
    // Rundungsfehler bei fraktionalem DPI (z. B. 125 % Skalierung).
    const exact = entry.devicePixelContentBoxSize?.[0];
    if (exact) {
      const ratio = Math.min(window.devicePixelRatio, maxPixelRatio());
      onResize(Math.round(exact.inlineSize / ratio), Math.round(exact.blockSize / ratio));
      return;
    }

    const box = entry.contentBoxSize?.[0];
    const width = box ? box.inlineSize : entry.contentRect.width;
    const height = box ? box.blockSize : entry.contentRect.height;
    onResize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  });

  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    // Safari kennt die Box-Option nicht.
    observer.observe(canvas);
  }

  return () => {
    observer.disconnect();
  };
}

export interface ContextLossHandlers {
  readonly onLost: () => void;
  readonly onRestored: () => void;
}

/**
 * Kontextverlust behandeln.
 *
 * preventDefault() auf 'webglcontextlost' ist die entscheidende Zeile: ohne sie
 * versucht der Browser gar nicht erst, den Kontext wiederherzustellen, und die
 * Seite bleibt schwarz bis zum Neuladen.
 */
export function observeContextLoss(
  canvas: HTMLCanvasElement,
  handlers: ContextLossHandlers,
): () => void {
  const onLost = (event: Event): void => {
    event.preventDefault();
    handlers.onLost();
  };
  const onRestored = (): void => {
    handlers.onRestored();
  };

  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  return () => {
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  };
}
