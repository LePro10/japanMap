import { MAP_LANDMARKS, type MapLandmark, type MapLandmarkIcon } from './navigationMapData';
import { worldToMap, type MapBounds } from './navigationMapMath';

const NS = 'http://www.w3.org/2000/svg';

/**
 * Scharfe POI-Icons über der Rasterkarte. Die Symbole sind bewusst SVG statt
 * Canvas-Pfade: sie skalieren mit dem Dialog, ohne bei 4K weich zu werden.
 *
 * Die Formen sind Orts-Ikonen, keine Material-Icons: ein Torii ist ein Torii,
 * nicht ein generisches Tempel-Häuschen.
 */
export class NavigationPoiLayer {
  readonly #root: SVGSVGElement;
  readonly #groups = new Map<string, SVGGElement>();
  readonly #origin = new Map<string, { x: number; y: number }>();
  #scale = 1;

  constructor(
    container: HTMLElement,
    bounds: MapBounds,
    size: number,
    onSelect: (landmark: MapLandmark) => void,
  ) {
    const svg = document.createElementNS(NS, 'svg');
    svg.classList.add('navmap__poiLayer');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<defs>${icons()}</defs>`;

    for (const landmark of MAP_LANDMARKS) {
      const point = worldToMap(landmark.x, landmark.z, bounds);
      const x = point.x * size;
      const y = point.y * size;
      const group = document.createElementNS(NS, 'g');
      group.classList.add('navmap-poi', `navmap-poi--${landmark.icon}`);
      if (!landmark.major) group.classList.add('navmap-poi--local');
      group.dataset.id = landmark.id;
      group.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      this.#origin.set(landmark.id, { x, y });
      group.innerHTML = `
        <circle class="navmap-poi__halo" r="26"></circle>
        <path class="navmap-poi__badge" d="M0-20.5c7.4 0 13.4 6 13.4 13.4 0 9.8-13.4 22.6-13.4 22.6S-13.4 2.7-13.4-7.1C-13.4-14.5-7.4-20.5 0-20.5z"></path>
        <circle class="navmap-poi__disc" r="11.5" cy="-7"></circle>
        <use class="navmap-poi__icon" href="#navmap-icon-${landmark.icon}" x="-8.5" y="-15.5" width="17" height="17"></use>
        <text class="navmap-poi__kanji" x="20" y="-10">${escapeXml(landmark.kanji)}</text>
        <text class="navmap-poi__label" x="20" y="6">${escapeXml(landmark.label)}</text>
        <text class="navmap-poi__detail" x="20" y="20">${escapeXml(landmark.detail)}</text>`;
      group.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        event.preventDefault();
        onSelect(landmark);
      });
      svg.append(group);
      this.#groups.set(landmark.id, group);
    }

    container.append(svg);
    this.#root = svg;
  }

  setSelected(id: string | null): void {
    for (const [key, group] of this.#groups) {
      group.classList.toggle('is-selected', key === id);
    }
  }

  /**
   * Pins auf konstanter Bildschirmgröße halten. Ohne Gegenmaßstab werden aus
   * 15 SVG-Einheiten bei Zoom 8 hundert Pixel — und das Label klebt als Brei.
   */
  setViewScale(scale: number): void {
    this.#scale = Math.max(0.2, scale);
    const inverse = 1 / this.#scale;
    for (const [id, group] of this.#groups) {
      const origin = this.#origin.get(id);
      if (!origin) continue;
      group.setAttribute(
        'transform',
        `translate(${origin.x.toFixed(2)} ${origin.y.toFixed(2)}) scale(${inverse.toFixed(3)})`,
      );
    }
  }

  dispose(): void {
    this.#root.remove();
    this.#groups.clear();
    this.#origin.clear();
  }
}

function icons(): string {
  const entries: Record<MapLandmarkIcon, string> = {
    city: `<symbol id="navmap-icon-city" viewBox="0 0 24 24">
      <path d="M3 21V9.5L8 7v14H3Zm5 0V4.2L14.5 2 21 5.4V21h-5v-6h-3v6H8Z"/>
      <path d="M5.2 12.2h1.4V11H5.2v1.2Zm0 2.4h1.4v-1.2H5.2v1.2Zm10.2-4.8h1.5V8.6h-1.5v1.2Zm0 2.4h1.5v-1.2h-1.5v1.2Zm-3.2 0h1.5v-1.2h-1.5v1.2Z" opacity=".85"/>
      <path d="M10.2 21v-3.1h1.2l.7-1 1.1 1h1.3V21" fill="none" stroke="currentColor" stroke-width="1.2"/>
    </symbol>`,
    temple: `<symbol id="navmap-icon-temple" viewBox="0 0 24 24">
      <path d="M2.4 8.2 12 4.2l9.6 4v1.6H2.4V8.2Zm1.8 2.4h15.6v1.3H4.2v-1.3Z"/>
      <path d="M6.1 12.6h1.8V20H6.1v-7.4Zm10 0h1.8V20H16.1v-7.4ZM9.2 14.2h5.6v1.3H9.2v-1.3ZM4 20h16v1.6H4V20Z"/>
    </symbol>`,
    mountain: `<symbol id="navmap-icon-mountain" viewBox="0 0 24 24">
      <path d="m2 20 6.4-11.2 2.8 4.8L14.6 8 22 20H2Z"/>
      <path d="M7.4 16.4c1.6-1.2 2.5-1.2 3.4 0s2.1 1.3 3.6 0 2.4-1.1 3.4.2" fill="none" stroke="#082026" stroke-width="1.4" stroke-linecap="round"/>
    </symbol>`,
    paddy: `<symbol id="navmap-icon-paddy" viewBox="0 0 24 24">
      <path d="M3 7.2h18v1.7H3V7.2Zm1.6 3.3h14.8v1.6H4.6v-1.6Zm1.7 3.2h11.4v1.6H6.3v-1.6Zm1.8 3.2h7.8V20H8.1v-1.5Z"/>
      <path d="M12 4.2v15.4" fill="none" stroke="currentColor" stroke-width="1.5"/>
    </symbol>`,
    village: `<symbol id="navmap-icon-village" viewBox="0 0 24 24">
      <path d="m4.2 11.4 7.8-6.4 7.8 6.4v9.2h-4.6v-5.2h-6.4v5.2H4.2v-9.2Z"/>
      <circle cx="17.6" cy="16.6" r="3.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
      <path d="M17.6 13.8v5.4M15 16.6h5.2" stroke="currentColor" stroke-width="1.2"/>
    </symbol>`,
    coast: `<symbol id="navmap-icon-coast" viewBox="0 0 24 24">
      <path d="M11 3.4h2v10.2h-2z"/>
      <path d="M12 3.2 19 9.4h-4.2L12 6.8 9.2 9.4H5L12 3.2Z"/>
      <path d="M3.2 16.2c2.4 0 2.4-1.8 4.8-1.8s2.4 1.8 4.8 1.8 2.4-1.8 4.8-1.8 2.4 1.8 4.8 1.8v2.2c-2.4 0-2.4-1.8-4.8-1.8s-2.4 1.8-4.8 1.8-2.4-1.8-4.8-1.8-2.4 1.8-4.8 1.8v-2.2Zm0 3.4c2.4 0 2.4-1.6 4.8-1.6s2.4 1.6 4.8 1.6 2.4-1.6 4.8-1.6 2.4 1.6 4.8 1.6V21H3.2v-1.4Z"/>
    </symbol>`,
    forest: `<symbol id="navmap-icon-forest" viewBox="0 0 24 24">
      <path d="M12 2.4 16.8 10h-2.6L18 16.2h-3.4V21h-3.2v-4.8H8L11.8 10H9.2L12 2.4Z"/>
      <path d="M7.2 11.2 4.4 16h1.8L4 20.4h5.2v-2.4H7.6l1.8-3.4H7.2Z" opacity=".85"/>
    </symbol>`,
    garage: `<symbol id="navmap-icon-garage" viewBox="0 0 24 24">
      <circle cx="12" cy="13" r="7.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <circle cx="12" cy="13" r="2.2"/>
      <path d="M12 5.8c1.4 1.6 1.3 3.4 0 4.4-1.4-1-1.5-2.8 0-4.4Z"/>
      <path d="M12 7.4v10.8M7.4 13h9.2" stroke="currentColor" stroke-width="1.2"/>
    </symbol>`,
    drift: `<symbol id="navmap-icon-drift" viewBox="0 0 24 24">
      <path d="M12 3.2c2.6 2.8 2.4 6.2 0 8.2-2.6-2-2.8-5.4 0-8.2Z"/>
      <path d="M7.2 9.4c2 2.2 1.8 5 0 6.6-2-1.6-2.2-4.4 0-6.6Zm9.6 0c2 2.2 1.8 5 0 6.6-2-1.6-2.2-4.4 0-6.6Z" opacity=".85"/>
      <path d="M12 14.2c2.2 2.4 2 5.4 0 7.2-2.2-1.8-2.4-4.8 0-7.2Z"/>
    </symbol>`,
  };
  return Object.values(entries).join('');
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}
