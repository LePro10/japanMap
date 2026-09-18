import aerialMapUrl from '../../assets/generated/terrain/navigation-map.webp?url';

/**
 * Ein einziges decodiertes Bild für Mini- und Vollkarte. Der Aerial-Layer wird
 * offline aus Heightfield/Zonen gebacken; hier findet keine Weltberechnung statt.
 *
 * Die Sättigungskurve wird **einmal** in eine Offscreen-Leinwand gebacken.
 * `ctx.filter` je Schwenk hat den Atlas messbar stehen lassen — Filter laufen
 * auf der CPU, und die Vollkarte hat sie bei jedem Pointermove neu verlangt.
 */
export class NavigationMapBackdrop {
  readonly #image = new Image();
  readonly #graded = document.createElement('canvas');
  #ready = false;
  #disposed = false;

  constructor(onReady: () => void) {
    this.#image.decoding = 'async';
    this.#image.onload = () => {
      if (this.#disposed) return;
      this.#bake();
      this.#ready = true;
      onReady();
    };
    this.#image.src = aerialMapUrl;
  }

  get ready(): boolean {
    return this.#ready;
  }

  draw(ctx: CanvasRenderingContext2D, size: number): void {
    this.drawVisible(ctx, size, size, 0, 0, 1, 1);
  }

  /**
   * Sichtbares Fenster in Bildschirmpixeln. CSS-Scale auf der 1024er-Leinwand
   * macht aus Texeln Klötze — hier wird der Ausschnitt aus dem Quellbild
   * direkt auf die Anzeige gezogen. Ohne Filter: der Grade sitzt schon im Bake.
   */
  drawVisible(
    ctx: CanvasRenderingContext2D,
    destW: number,
    destH: number,
    nx0: number,
    ny0: number,
    nx1: number,
    ny1: number,
  ): void {
    ctx.fillStyle = '#0d3a48';
    ctx.fillRect(0, 0, destW, destH);
    if (!this.#ready) {
      const gradient = ctx.createRadialGradient(
        destW * 0.52,
        destH * 0.4,
        destW * 0.08,
        destW * 0.5,
        destH * 0.5,
        destW * 0.72,
      );
      gradient.addColorStop(0, '#243c3c');
      gradient.addColorStop(0.55, '#162a2b');
      gradient.addColorStop(1, '#081418');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, destW, destH);
      return;
    }

    const sw = this.#graded.width;
    const sh = this.#graded.height;
    const spanX = nx1 - nx0;
    const spanY = ny1 - ny0;
    if (spanX <= 1e-6 || spanY <= 1e-6) return;
    const cx0 = clamp01(nx0);
    const cy0 = clamp01(ny0);
    const cx1 = clamp01(nx1);
    const cy1 = clamp01(ny1);
    if (cx1 <= cx0 || cy1 <= cy0) return;
    const sx = cx0 * sw;
    const sy = cy0 * sh;
    const tw = (cx1 - cx0) * sw;
    const th = (cy1 - cy0) * sh;
    if (tw <= 0.5 || th <= 0.5) return;
    const dx = ((cx0 - nx0) / spanX) * destW;
    const dy = ((cy0 - ny0) / spanY) * destH;
    const dw = ((cx1 - cx0) / spanX) * destW;
    const dh = ((cy1 - cy0) / spanY) * destH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(this.#graded, sx, sy, tw, th, dx, dy, dw, dh);
  }

  dispose(): void {
    this.#disposed = true;
    this.#image.onload = null;
    this.#image.onerror = null;
  }

  #bake(): void {
    const width = this.#image.naturalWidth || this.#image.width || 1024;
    const height = this.#image.naturalHeight || this.#image.height || 1024;
    this.#graded.width = width;
    this.#graded.height = height;
    const ctx = this.#graded.getContext('2d');
    if (!ctx) return;
    ctx.filter = 'saturate(1.18) contrast(1.08) brightness(1.03)';
    ctx.drawImage(this.#image, 0, 0, width, height);
    ctx.filter = 'none';
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
