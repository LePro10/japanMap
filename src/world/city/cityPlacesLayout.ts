import type { UrbanLot } from './UrbanLots';

export const RAIN_GARDEN = { id: 'rain-garden', name: 'Rain Garden', minX: 665, maxX: 745, minZ: -20, maxZ: 50 } as const;
export type CityPlaceReserve = { id: string; name: string; minX: number; maxX: number; minZ: number; maxZ: number; lot?: UrbanLot };
const TARGETS = [
  { id: 'beacon-tower', name: 'Beacon Tower', x: 1180, z: -650 },
  { id: 'market-hall', name: 'Market Hall', x: 470, z: 660 },
  { id: 'rotor-court', name: 'Rotor Court', x: 180, z: 280 },
] as const;

/** Same baked parcels for generator reservations, geometry, and destinations. */
export function getCityPlaceReserves(lots: readonly UrbanLot[]): CityPlaceReserve[] {
  const result: CityPlaceReserve[] = [{ ...RAIN_GARDEN }];
  const used = new Set<UrbanLot>();
  for (const target of TARGETS) {
    const lot = lots.filter(l => !used.has(l) && l.maxX - l.minX >= 28 && l.maxZ - l.minZ >= 26)
      .sort((a, b) => Math.hypot((a.minX + a.maxX) / 2 - target.x, (a.minZ + a.maxZ) / 2 - target.z)
        - Math.hypot((b.minX + b.maxX) / 2 - target.x, (b.minZ + b.maxZ) / 2 - target.z)
        || a.minX - b.minX || a.minZ - b.minZ)[0];
    if (!lot) continue;
    used.add(lot); result.push({ id: target.id, name: target.name, ...lot, lot });
  }
  return result;
}
