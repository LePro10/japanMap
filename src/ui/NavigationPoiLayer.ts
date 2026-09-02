import { MAP_LANDMARKS, type MapLandmarkIcon } from './navigationMapData';
import { worldToMap, type WorldBounds } from './navigationMapMath';

const NS = 'http://www.w3.org/2000/svg';

/**
 * Scharfe POI-Icons über der Rasterkarte. Die Symbole sind bewusst SVG statt
 * Canvas-Pfade: sie skalieren mit dem Dialog, ohne bei 4K weich zu werden.
 */
export class NavigationPoiLayer {
  readonly #root: SVGSVGElement;

  constructor(container: HTMLElement, bounds: WorldBounds, size: number) {
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
      group.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      group.innerHTML = `
        <circle class="navmap-poi__halo" r="23"></circle>
        <circle class="navmap-poi__disc" r="15"></circle>
        <use class="navmap-poi__icon" href="#navmap-icon-${landmark.icon}" x="-10" y="-10" width="20" height="20"></use>
        <text class="navmap-poi__label" x="22" y="-2">${escapeXml(landmark.label)}</text>
        <text class="navmap-poi__detail" x="22" y="13">${escapeXml(landmark.detail)}</text>`;
      svg.append(group);
    }

    container.append(svg);
    this.#root = svg;
  }

  dispose(): void {
    this.#root.remove();
  }
}

function icons(): string {
  const entries: Record<MapLandmarkIcon, string> = {
    city: `<symbol id="navmap-icon-city" viewBox="0 0 24 24"><path d="M3 21V8l6-3v16h3V3l9 4v14h-4v-4h-2v4H3Zm3-9h2v-2H6v2Zm0 4h2v-2H6v2Zm9-7h2V7h-2v2Zm0 4h2v-2h-2v2Z"/></symbol>`,
    temple: `<symbol id="navmap-icon-temple" viewBox="0 0 24 24"><path d="M2 5h20v3h-3v13h-3V8H8v13H5V8H2V5Zm5-3h10v2H7V2Zm2 9h6v3H9v-3Z"/></symbol>`,
    mountain: `<symbol id="navmap-icon-mountain" viewBox="0 0 24 24"><path d="m2 20 7.1-12 3 5.1L15.6 7 22 20H2Zm7.2-6.7L5.8 19h12.9l-3.2-7.1-3.3 5.5-3-4.1Z"/></symbol>`,
    paddy: `<symbol id="navmap-icon-paddy" viewBox="0 0 24 24"><path d="M4 3h2v18H4V3Zm7 0h2v18h-2V3Zm7 0h2v18h-2V3ZM2 8h20v2H2V8Zm0 6h20v2H2v-2Z"/></symbol>`,
    village: `<symbol id="navmap-icon-village" viewBox="0 0 24 24"><path d="m2 11 10-8 10 8-2 2-1-1v9h-6v-6h-2v6H5v-9l-1 1-2-2Zm6 0h8l-4-3.2L8 11Z"/></symbol>`,
    coast: `<symbol id="navmap-icon-coast" viewBox="0 0 24 24"><path d="M2 8c2.6 0 2.6-2 5.2-2s2.6 2 5.2 2 2.6-2 5.2-2S20.2 8 22.8 8v3c-2.6 0-2.6-2-5.2-2s-2.6 2-5.2 2-2.6-2-5.2-2S4.6 11 2 11V8Zm0 7c2.6 0 2.6-2 5.2-2s2.6 2 5.2 2 2.6-2 5.2-2 2.6 2 5.2 2v3c-2.6 0-2.6-2-5.2-2s-2.6 2-5.2 2-2.6-2-5.2-2S4.6 18 2 18v-3Z"/></symbol>`,
    forest: `<symbol id="navmap-icon-forest" viewBox="0 0 24 24"><path d="m12 2 5 7h-3l4 6h-4.5v6h-3v-6H6l4-6H7l5-7Z"/></symbol>`,
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
