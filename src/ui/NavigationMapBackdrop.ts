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
    const sx = nx0 * sw;
    const sy = ny0 * sh;
    const tw = (nx1 - nx0) * sw;
    const th = (ny1 - ny0) * sh;
    if (tw <= 0.5 || th <= 0.5) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(this.#graded, sx, sy, tw, th, 0, 0, destW, destH);
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
