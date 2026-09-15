import { DRIFT_ZONES, RAMPS } from '@/config/stunt.config';
import { ROAD_TYPES, type RoadData } from '@/config/roads.config';
import { WORLD } from '@/config/world.config';
import { worldToMap, type MapBounds } from './navigationMapMath';

const NS = 'http://www.w3.org/2000/svg';

/**
 * Straßen als SVG über der Aerial-Karte. Canvas-Linien würden mit dem Zoom
 * mitvergrößert und sähen „verbacken" aus — dieselben Splines als Pfad bleiben
 * scharf, weil der Rasterizer sie auf der Zoomstufe neu zeichnet.
 */
export class NavigationRoadLayer {
  readonly #root: SVGSVGElement;
  readonly #bounds: MapBounds;
  readonly #size: number;

  constructor(container: HTMLElement, bounds: MapBounds, size: number) {
    const svg = document.createElementNS(NS, 'svg');
    svg.classList.add('navmap__roads');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    container.append(svg);
    this.#root = svg;
    this.#bounds = bounds;
    this.#size = size;
  }

  setRoads(roads: readonly RoadData[]): void {
    const size = this.#size;
    const bounds = this.#bounds;
    const metres = WORLD.size;
    const outline: string[] = [];
    const fills: string[] = [];

    for (const zone of DRIFT_ZONES) {
      const p = worldToMap(zone.x, zone.z, bounds);
      const r = (zone.radius / metres) * size;
      fills.push(
        `<circle class="navmap-zone" cx="${(p.x * size).toFixed(1)}" cy="${(p.y * size).toFixed(1)}" r="${r.toFixed(1)}" />`,
      );
    }

    for (const road of roads) {
      if (road.centerline.length < 6) continue;
      const d = polyline(road.centerline, bounds, size, road.closed);
      if (!d) continue;
      const kind = roadClass(road);
      const width = Math.max(1.1, (ROAD_TYPES[road.type].width / metres) * size);
      outline.push(
        `<path class="navmap-road-outline" data-kind="${kind}" d="${d}" style="stroke-width:${(width + 1.35).toFixed(2)}" />`,
      );
      fills.push(
        `<path class="navmap-road navmap-road--${kind}" d="${d}" style="stroke-width:${width.toFixed(2)}" />`,
      );
    }

    for (const ramp of RAMPS) {
      const p = worldToMap(ramp.x, ramp.z, bounds);
      const x = p.x * size;
      const y = p.y * size;
      fills.push(
        `<polygon class="navmap-ramp" points="${x.toFixed(1)},${(y - 5).toFixed(1)} ${(x + 4.6).toFixed(1)},${(y + 4).toFixed(1)} ${(x - 4.6).toFixed(1)},${(y + 4).toFixed(1)}" />`,
      );
    }

    this.#root.innerHTML = `<g class="navmap-roads-outline">${outline.join('')}</g><g>${fills.join('')}</g>`;
  }

  dispose(): void {
    this.#root.remove();
  }
}

function polyline(centerline: readonly number[], bounds: MapBounds, size: number, closed: boolean): string {
  let d = '';
  for (let i = 0; i < centerline.length; i += 6) {
    const point = worldToMap(centerline[i]!, centerline[i + 2]!, bounds);
    const x = (point.x * size).toFixed(1);
    const y = (point.y * size).toFixed(1);
    d += i === 0 ? `M${x} ${y}` : `L${x} ${y}`;
  }
  if (closed) d += 'Z';
  return d;
}

function roadClass(road: RoadData): string {
  if (road.type === 'dirt' || road.type === 'pfad') return 'dirt';
  if (road.type === 'highway' || road.type === 'city' || road.length > 2000) return 'main';
  return 'local';
}
