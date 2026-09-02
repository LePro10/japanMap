export interface MapBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface MapPoint {
  readonly x: number;
  readonly z: number;
}

export interface NormalizedMapPoint {
  readonly x: number;
  readonly y: number;
}

export function worldToMap(x: number, z: number, bounds: MapBounds): NormalizedMapPoint {
  return {
    x: clamp01((x - bounds.minX) / (bounds.maxX - bounds.minX)),
    y: clamp01((z - bounds.minZ) / (bounds.maxZ - bounds.minZ)),
  };
}

export function mapToWorld(x: number, y: number, bounds: MapBounds): MapPoint {
  const nx = clamp01(x);
  const ny = clamp01(y);
  return {
    x: bounds.minX + (bounds.maxX - bounds.minX) * nx,
    z: bounds.minZ + (bounds.maxZ - bounds.minZ) * ny,
  };
}

export function clampWorldPoint(x: number, z: number, bounds: MapBounds): MapPoint {
  return {
    x: clamp(x, bounds.minX, bounds.maxX),
    z: clamp(z, bounds.minZ, bounds.maxZ),
  };
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
