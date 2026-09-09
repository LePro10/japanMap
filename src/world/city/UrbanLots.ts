import type { RoadNetwork } from '../roads/RoadNetwork';
import type { TerrainSampler } from '../TerrainSampler';
import type { UrbanParcel } from '@/config/roads.config';

/** Die Hülle beschreibt Land; sie ersetzt niemals die Höhe des alten Kerns. */
export const CITY_ENVELOPE = { minX: -80, maxX: 1490, minZ: -1000, maxZ: 960 } as const;
export function inUrbanEnvelope(x: number, z: number): boolean {
  return x >= -80 && x <= 1490 && z >= -1000 && z <= 960 &&
    !(x >= 620 && x <= 1040 && z <= -520) &&
    !(x >= 560 && x <= 1040 && z >= 780) && Math.hypot(x - 550, z - 510) >= 180;
}
export type UrbanLot = UrbanParcel;
export interface UrbanLayout { lots: readonly UrbanLot[]; blocks(x: number, z: number): boolean }
const cache = new WeakMap<RoadNetwork, UrbanLayout>();

/** Renderer und Streu-Worker lesen die Parzellen aus demselben Bake-Vertrag. */
export function urbanLots(network: RoadNetwork, _terrain: TerrainSampler): UrbanLayout {
  const cached = cache.get(network); if (cached) return cached;
  const lots = network.file.urbanLots ?? [], cells = new Map<string, UrbanLot[]>();
  for (const lot of lots) {
    for (let gx = Math.floor((lot.minX - 2) / 64); gx <= Math.floor((lot.maxX + 2) / 64); gx++)
      for (let gz = Math.floor((lot.minZ - 2) / 64); gz <= Math.floor((lot.maxZ + 2) / 64); gz++) {
        const key = `${gx},${gz}`, cell = cells.get(key); if (cell) cell.push(lot); else cells.set(key,[lot]);
      }
  }
  const layout: UrbanLayout = { lots, blocks: (x,z) => (cells.get(`${Math.floor(x/64)},${Math.floor(z/64)}`) ?? [])
    .some(p => x >= p.minX - 1.5 && x <= p.maxX + 1.5 && z >= p.minZ - 1.5 && z <= p.maxZ + 1.5) };
  cache.set(network, layout); return layout;
}
