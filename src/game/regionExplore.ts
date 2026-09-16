import {
  EXPLORE_DWELL_S,
  EXPLORE_MOVE_M,
  EXPLORE_SPARKS,
} from '@/config/explore.config';
import {
  MAP_REGIONS,
  regionAt,
  type MapRegion,
  type MapRegionId,
} from '@/ui/navigationMapRegions';

export interface ExploreGrant {
  readonly id: MapRegionId;
  readonly label: string;
  readonly count: number;
  readonly total: number;
  readonly sparks: number;
}

/**
 * Player-facing copy. Kept here so a Node test can pin the string without
 * standing up the HUD — the HUD only renders what this returns.
 */
export function exploreToastText(grant: ExploreGrant): { title: string; body: string } {
  return {
    title: `${grant.label} explored!`,
    body: `You explored ${grant.count}/${grant.total} zones`,
  };
}

/**
 * Watches XZ while the player is on foot or in the car.
 *
 * Not an Engine system: DriveHudUpdate already has the pose each frame, and a
 * second system would be a second chance to sample a different position.
 */
export class RegionWatch {
  #id: MapRegionId | null = null;
  #dwell = 0;
  #ox = 0;
  #oz = 0;
  #moved = 0;
  readonly #session = new Set<MapRegionId>();

  tick(
    dt: number,
    x: number,
    z: number,
    input: { airborne: boolean; explored: (id: MapRegionId) => boolean },
  ): ExploreGrant | null {
    // Airborne: freeze, do not reset. Landing in the same region continues the
    // dwell; landing in another region is a new entry on the next grounded tick.
    if (input.airborne || !(dt > 0) || !Number.isFinite(x) || !Number.isFinite(z)) {
      return null;
    }
    const region = regionAt(x, z);
    if (region.id !== this.#id) {
      this.#id = region.id;
      this.#dwell = 0;
      this.#ox = x;
      this.#oz = z;
      this.#moved = 0;
      return null;
    }
    if (input.explored(region.id) || this.#session.has(region.id)) return null;
    this.#moved = Math.max(this.#moved, Math.hypot(x - this.#ox, z - this.#oz));
    this.#dwell += dt;
    if (this.#dwell < EXPLORE_DWELL_S || this.#moved < EXPLORE_MOVE_M) return null;
    this.#session.add(region.id);
    return grantFrom(region, input.explored);
  }
}

function grantFrom(region: MapRegion, explored: (id: MapRegionId) => boolean): ExploreGrant {
  let count = 1;
  for (const entry of MAP_REGIONS) {
    if (entry.id !== region.id && explored(entry.id)) count++;
  }
  return {
    id: region.id,
    label: region.label,
    count,
    total: MAP_REGIONS.length,
    sparks: EXPLORE_SPARKS,
  };
}
