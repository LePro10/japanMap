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

/**
 * Pan/Zoom der Vollkarte in CSS-Pixeln der unskalierten Bühne.
 *
 * `scale` 1 zeigt die ganze Insel; größer zoomt auf den Ursprung (0, 0)
 * der Bühne. `tx`/`ty` sind die Verschiebung *danach*. Die Klemme hält den
 * Ausschnitt über der Bühne — sonst gäbe es eine leere Fläche, in die man
 * klickt und nichts trifft.
 */
export interface MapView {
  scale: number;
  tx: number;
  ty: number;
}

export const MAP_MIN_SCALE = 1;
export const MAP_MAX_SCALE = 8;

export function clampMapView(view: MapView, stageWidth: number, stageHeight: number): MapView {
  const scale = clamp(view.scale, MAP_MIN_SCALE, MAP_MAX_SCALE);
  const minTx = stageWidth - stageWidth * scale;
  const minTy = stageHeight - stageHeight * scale;
  return {
    scale,
    tx: clamp(view.tx, minTx, 0),
    ty: clamp(view.ty, minTy, 0),
  };
}

/** Zoom auf einen Bühnenpunkt, sodass dieser Punkt stehen bleibt. */
export function zoomMapView(
  view: MapView,
  factor: number,
  focusX: number,
  focusY: number,
  stageWidth: number,
  stageHeight: number,
): MapView {
  const scale = clamp(view.scale * factor, MAP_MIN_SCALE, MAP_MAX_SCALE);
  if (scale === view.scale) return clampMapView(view, stageWidth, stageHeight);
  const mapX = (focusX - view.tx) / view.scale;
  const mapY = (focusY - view.ty) / view.scale;
  return clampMapView(
    { scale, tx: focusX - mapX * scale, ty: focusY - mapY * scale },
    stageWidth,
    stageHeight,
  );
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
