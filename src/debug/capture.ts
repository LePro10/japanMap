import type { WebGLRenderer } from 'three';

/**
 * Einen Frame rendern und sofort auslesen — die gemeinsame Grundlage von
 * `japanMap.shot()`, `japanMap.probe()` und dem Messlauf aus P10.0.
 *
 * **Warum rendern und auslesen im selben Aufruf.** Der Browser drosselt
 * `requestAnimationFrame` auf wenige Hertz, sobald das Fenster verdeckt ist, und
 * mit `preserveDrawingBuffer: false` trifft ein Bildschirmfoto dann fast immer
 * die Lücke zwischen zwei Frames — schwarz, obwohl korrekt gerendert wurde. Ein
 * Bildschirmfoto über das Fenster scheidet aus demselben Grund aus: im
 * Hintergrund komponiert der Browser gar keine Frames mehr.
 *
 * Diese Datei ist aus `main.ts` herausgelöst worden, als der Messlauf dieselbe
 * Kette brauchte. CLAUDE.md verlangt das ausdrücklich — Code, den Werkzeug *und*
 * Renderer brauchen, wird nicht zweimal geschrieben.
 */

export interface CaptureTarget {
  readonly renderer: WebGLRenderer;
  /** Rendert genau einen vollständigen Frame durch dieselbe Kette wie sonst. */
  tick(): void;
}

export interface FrameProbe {
  readonly width: number;
  readonly height: number;
  readonly mittlereHelligkeit: number;
  readonly maximum: number;
  /**
   * Anteil der Pixel über Luma 2.
   *
   * **Der Wert prüft, ob das Bild vollständig ist — nicht, ob die Welt es ist.**
   * Bei einer Szene mit Himmel muss er 1,000 sein; steht dort etwas anderes, ist
   * der Frame beschnitten (P8.2: ein vergessener Viewport ließ ein Fünftel des
   * Bildes schwarz, und 1024/1280 = 0,800 stand als Zahl da, ohne dass jemand
   * hinsah). Dass die Welt fertig geladen ist, sagt er dagegen **nicht** — in
   * P8.9 meldete er 1,000 auf einem Bild mit halbem Bewuchs.
   */
  readonly anteilNichtSchwarz: number;
}

/**
 * Rohe Pixel des zuletzt gezeichneten Frames, unterste Zeile zuerst.
 *
 * Der Puffertyp steht ausdrücklich als `Uint8ClampedArray<ArrayBuffer>` da und
 * nicht bloß als `Uint8ClampedArray`: seit TypeScript 5.7 sind typisierte Felder
 * über ihren Puffer generisch, die kurze Schreibweise wird zu `ArrayBufferLike`
 * verallgemeinert — und `ImageData` nimmt keinen `SharedArrayBuffer`.
 */
function readFrame(target: CaptureTarget): {
  pixels: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
} {
  target.tick();
  const gl = target.renderer.getContext();
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixels = new Uint8ClampedArray(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return { pixels, width, height };
}

export function probeFrame(target: CaptureTarget): FrameProbe {
  const { pixels, width, height } = readFrame(target);

  let sum = 0;
  let maximum = 0;
  let nonBlack = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const luma =
      (pixels[i] ?? 0) * 0.2126 + (pixels[i + 1] ?? 0) * 0.7152 + (pixels[i + 2] ?? 0) * 0.0722;
    sum += luma;
    if (luma > maximum) maximum = luma;
    if (luma > 2) nonBlack++;
  }
  const count = pixels.length / 4;
  return {
    width,
    height,
    mittlereHelligkeit: sum / count,
    maximum,
    anteilNichtSchwarz: nonBlack / count,
  };
}

/**
 * Frame als PNG in Base64.
 *
 * `readPixels` liefert die unterste Zeile zuerst — deshalb wird beim Zeichnen
 * auf den Canvas gespiegelt. Ohne das steht das Gelände auf dem Kopf, und zwar
 * plausibel genug, um es zu übersehen.
 */
export function captureFramePng(target: CaptureTarget): string {
  const { pixels, width, height } = readFrame(target);

  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  source.getContext('2d')?.putImageData(new ImageData(pixels, width, height), 0, 0);

  const flipped = document.createElement('canvas');
  flipped.width = width;
  flipped.height = height;
  const context = flipped.getContext('2d');
  if (!context) throw new Error('Kein 2D-Kontext für das Bildschirmfoto.');
  context.translate(0, height);
  context.scale(1, -1);
  context.drawImage(source, 0, 0);

  return flipped.toDataURL('image/png').split(',')[1] ?? '';
}

/**
 * Etwas an einen Dev-Server-Endpunkt schicken und den geschriebenen Pfad
 * zurückgeben.
 *
 * **Laut scheitern, nicht leer zurückkommen.** Die Endpunkte leben nur im
 * Dev-Server; antwortet einer nicht, ist keine Datei entstanden. Vorher stand in
 * `shot()` ein `return response.text()`, und ein 404 lieferte einen leeren
 * String — in der Ausgabe sah das aus wie „geschrieben nach: ", und die Messung
 * lief scheinbar durch. Aufgefallen ist es erst, als ein fremdes Projekt den
 * Port übernommen hatte (CLAUDE.md, „Umgebung"): die Seite lief aus dem Speicher
 * weiter, `probe()` meldete 1,000, und nur der fehlende Pfad verriet, dass
 * niemand mehr zuhörte.
 */
export async function postToDevServer(endpoint: string, name: string, body: string): Promise<string> {
  const response = await fetch(endpoint, { method: 'POST', body: `${name}\n${body}` });
  if (!response.ok) {
    throw new Error(
      `${endpoint} antwortete mit ${response.status}. ` +
        'Läuft der Dev-Server dieses Projekts auf diesem Port?',
    );
  }
  const path = (await response.text()).trim();
  if (!path) throw new Error(`${endpoint} lieferte eine leere Antwort.`);
  return path;
}

/** Frame rendern, auslesen und als PNG nach `.cache/shots/` schreiben. */
export async function captureShot(target: CaptureTarget, name = 'shot'): Promise<string> {
  return postToDevServer('/__shot', name, captureFramePng(target));
}
