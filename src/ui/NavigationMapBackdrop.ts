import aerialMapUrl from '../../assets/generated/terrain/navigation-map.webp?url';

/**
 * Ein einziges decodiertes Bild für Mini- und Vollkarte. Der Aerial-Layer wird
 * offline aus Heightfield/Zonen gebacken; hier findet keine Weltberechnung statt.
 */
export class NavigationMapBackdrop {
  readonly #image = new Image();
  #ready = false;
  #disposed = false;

  constructor(onReady: () => void) {
    this.#image.decoding = 'async';
    this.#image.onload = () => {
      if (this.#disposed) return;
      this.#ready = true;
      onReady();
    };
    this.#image.src = aerialMapUrl;
  }

  draw(ctx: CanvasRenderingContext2D, size: number): void {
    if (this.#ready) {
      ctx.drawImage(this.#image, 0, 0, size, size);
      return;
    }

    const gradient = ctx.createRadialGradient(size * 0.52, size * 0.4, size * 0.08, size * 0.5, size * 0.5, size * 0.72);
    gradient.addColorStop(0, '#243c3c');
    gradient.addColorStop(0.55, '#162a2b');
    gradient.addColorStop(1, '#081418');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  dispose(): void {
    this.#disposed = true;
    this.#image.onload = null;
    this.#image.onerror = null;
  }
}
