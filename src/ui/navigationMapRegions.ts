import { WORLD } from '@/config/world.config';
import { walkSpawnZone } from '@/config/walker.config';
import { worldToMap, type MapBounds, type MapPoint } from './navigationMapMath';

/**
 * Acht Regionen, jeder Weltpunkt gehört genau einer — ASTRA_PLAN §3.
 *
 * Reihenfolge ist Mitgliedschaft, nicht Farbe: erste zutreffende Regel gewinnt.
 * Die Zeichnung ist eine Navigationstinte, kein GIS. Forza Horizon färbt das
 * Land in weichen Feldern, damit man die Insel auf einen Blick liest; scharfe
 * Rechtecke würden wie Debug-Zonen aussehen.
 */

export type MapRegionId =
  | 'commons'
  | 'needle'
  | 'tideglass'
  | 'neon'
  | 'cinder'
  | 'bellwood'
  | 'stillwater'
  | 'longshore';

export interface MapRegion {
  readonly id: MapRegionId;
  readonly label: string;
  readonly kanji: string;
  readonly detail: string;
  readonly color: string;
  readonly x: number;
  readonly z: number;
}

const COMMONS = walkSpawnZone();

export const MAP_REGIONS: readonly MapRegion[] = [
  {
    id: 'commons',
    label: 'Sakura Commons',
    kanji: '桜',
    detail: 'Car court under petals',
    color: '#e8a9c0',
    x: COMMONS.x,
    z: COMMONS.z,
  },
  {
    id: 'needle',
    label: 'Needle Works',
    kanji: '針',
    detail: 'Circuit and pit court',
    color: '#c44536',
    x: -620,
    z: 740,
  },
  {
    id: 'tideglass',
    label: 'Tideglass Harbour',
    kanji: '港',
    detail: 'Working ocean port',
    color: '#3d8fd1',
    x: 810,
    z: 1158,
  },
  {
    id: 'neon',
    label: 'Neon Basin',
    kanji: '夜',
    detail: 'Streets after rain',
    color: '#9b6bb3',
    x: 620,
    z: 120,
  },
  {
    id: 'cinder',
    label: 'Cinder Pass',
    kanji: '峠',
    detail: 'Hairpins in the cloud',
    color: '#7a8490',
    x: -536,
    z: -495,
  },
  {
    id: 'bellwood',
    label: 'Bellwood',
    kanji: '杉',
    detail: 'Temple forest and ridges',
    color: '#5f8f4a',
    x: 790,
    z: -760,
  },
  {
    id: 'stillwater',
    label: 'Stillwater Terraces',
    kanji: '水田',
    detail: 'Paddies and mill village',
    color: '#c4a35a',
    x: -760,
    z: 180,
  },
  {
    id: 'longshore',
    label: 'Longshore',
    kanji: '黒潮',
    detail: 'Coast, lighthouse, horizon',
    color: '#2aa3a8',
    x: 80,
    z: 1280,
  },
] as const;

const BY_ID = new Map(MAP_REGIONS.map((region) => [region.id, region]));

export function regionById(id: MapRegionId): MapRegion {
  const region = BY_ID.get(id);
  if (!region) throw new Error(`Map region "${id}" is missing.`);
  return region;
}

export function isMapRegionId(value: string): value is MapRegionId {
  return BY_ID.has(value as MapRegionId);
}

/**
 * Erste zutreffende Regel aus ASTRA_PLAN §3. Commons ist ein Kreis um S,
 * nicht das Driftzonen-Radius — die Entdeckung gilt für den ganzen Hof.
 */
export function regionAt(x: number, z: number): MapRegion {
  if (Math.hypot(x - COMMONS.x, z - COMMONS.z) < 180) return regionById('commons');
  if (x >= -1160 && x < -80 && z >= 540 && z < 940) return regionById('needle');
  if (x >= 520 && x <= 1100 && z >= 780 && z <= WORLD.half) return regionById('tideglass');
  if (inNeonBasin(x, z)) return regionById('neon');
  if (x < -80 && z < -250) return regionById('cinder');
  if (z < -520) return regionById('bellwood');
  if (x < -80 && z < 620) return regionById('stillwater');
  return regionById('longshore');
}

function inNeonBasin(x: number, z: number): boolean {
  if (x < -80 || x >= 1490 || z < -1000 || z >= 960) return false;
  if (x >= 620 && x < 1040 && z >= -1000 && z < -520) return false;
  if (x >= 560 && x < 1040 && z >= 780 && z < 960) return false;
  if (Math.hypot(x - COMMONS.x, z - COMMONS.z) < 180) return false;
  return true;
}

const NS = 'http://www.w3.org/2000/svg';

/**
 * Weiche Farbfelder unter Straßen und Pins. Hinten nach vorn: Longshore als
 * Küstenband, nicht als Vollfläche — sonst wird die ganze Insel teal und die
 * anderen Felder verschwinden (dieselbe Falle wie ein unbeleuchtetes Material,
 * das seine Zahl direkt ins Bild schreibt).
 */
export class NavigationRegionLayer {
  readonly #root: SVGSVGElement;
  readonly #labels = new Map<string, SVGGElement>();
  readonly #origin = new Map<string, { x: number; y: number }>();

  constructor(container: HTMLElement, bounds: MapBounds, size: number, onSelect: (region: MapRegion) => void) {
    const svg = document.createElementNS(NS, 'svg');
    svg.classList.add('navmap__regions');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    this.#root = svg;

    svg.innerHTML = `<g class="navmap-region-washes">${washes(bounds, size)}</g>`;

    for (const region of MAP_REGIONS) {
      const point = worldToMap(region.x, region.z, bounds);
      const x = point.x * size;
      const y = point.y * size;
      const group = document.createElementNS(NS, 'g');
      group.classList.add('navmap-region-label', `navmap-region-label--${region.id}`);
      group.dataset.id = region.id;
      group.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      group.style.color = region.color;
      group.innerHTML = `
        <text class="navmap-region-label__kanji" text-anchor="middle" y="-10">${escapeXml(region.kanji)}</text>
        <text class="navmap-region-label__name" text-anchor="middle" y="10">${escapeXml(region.label.toUpperCase())}</text>`;
      group.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        event.preventDefault();
        onSelect(region);
      });
      svg.append(group);
      this.#labels.set(region.id, group);
      this.#origin.set(region.id, { x, y });
    }

    container.append(svg);
  }

  setSelected(id: string | null): void {
    for (const [key, group] of this.#labels) {
      group.classList.toggle('is-selected', key === id);
    }
  }

  setViewScale(scale: number): void {
    // Aus der Ferne mit der Karte schrumpfen, sonst liegen die Namen übereinander.
    // Nah sind die Labels ohnehin aus — dann zählt nur der Inverse-Maßstab der Pins.
    const inverse = scale < 1.1 ? 1 : 1 / Math.max(0.2, scale);
    for (const [id, group] of this.#labels) {
      const origin = this.#origin.get(id);
      if (!origin) continue;
      group.setAttribute(
        'transform',
        `translate(${origin.x.toFixed(1)} ${origin.y.toFixed(1)}) scale(${inverse.toFixed(3)})`,
      );
    }
  }

  dispose(): void {
    this.#root.remove();
    this.#labels.clear();
    this.#origin.clear();
  }
}

function washes(bounds: MapBounds, size: number): string {
  const p = (x: number, z: number) => {
    const point = worldToMap(x, z, bounds);
    return `${(point.x * size).toFixed(1)},${(point.y * size).toFixed(1)}`;
  };
  const ellipse = (x: number, z: number, rxM: number, rzM: number, color: string) => {
    const c = worldToMap(x, z, bounds);
    const rx = (rxM / WORLD.size) * size;
    const ry = (rzM / WORLD.size) * size;
    return `<ellipse class="navmap-region-wash" cx="${(c.x * size).toFixed(1)}" cy="${(c.y * size).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${color}"/>`;
  };
  const rect = (minX: number, minZ: number, maxX: number, maxZ: number, color: string, rx = 48) => {
    const a = worldToMap(minX, minZ, bounds);
    const b = worldToMap(maxX, maxZ, bounds);
    const x = Math.min(a.x, b.x) * size;
    const y = Math.min(a.y, b.y) * size;
    const w = Math.abs(b.x - a.x) * size;
    const h = Math.abs(b.y - a.y) * size;
    return `<rect class="navmap-region-wash" data-color="${color}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="${color}"/>`;
  };

  // Hinten nach vorn. Longshore nur als Küstenband — sonst teal über allem.
  return [
    ellipse(80, 1280, 1500, 420, '#2aa3a8'),
    ellipse(-760, 180, 820, 620, '#c4a35a'),
    ellipse(790, -760, 720, 560, '#5f8f4a'),
    ellipse(-620, -620, 780, 720, '#7a8490'),
    rect(-80, -420, 1180, 560, '#9b6bb3', 70),
    rect(500, 760, 1120, WORLD.half, '#3d8fd1', 56),
    rect(-1160, 540, -80, 940, '#c44536', 52),
    ellipse(COMMONS.x, COMMONS.z, 210, 210, '#e8a9c0'),
    `<polygon class="navmap-region-wash navmap-region-wash--soft" fill="#2aa3a8" points="${p(-1536, 980)} ${p(1536, 980)} ${p(1536, 1536)} ${p(-1536, 1536)}"/>`,
  ].join('');
}

export function regionFocus(region: MapRegion): MapPoint & { scale: number } {
  switch (region.id) {
    case 'commons':
      return { x: region.x, z: region.z, scale: 3.4 };
    case 'needle':
      return { x: region.x, z: region.z, scale: 2.4 };
    case 'tideglass':
      return { x: region.x, z: region.z, scale: 2.2 };
    case 'neon':
      return { x: region.x, z: region.z, scale: 2.1 };
    case 'cinder':
      return { x: region.x, z: region.z, scale: 2.0 };
    case 'bellwood':
      return { x: region.x, z: region.z, scale: 2.0 };
    case 'stillwater':
      return { x: region.x, z: region.z, scale: 1.9 };
    default:
      return { x: region.x, z: region.z, scale: 1.7 };
  }
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
