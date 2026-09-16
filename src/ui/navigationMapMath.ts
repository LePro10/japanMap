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
 * `scale` 1 füllt die **längere** Kante (Cover). Darunter liegt Contain —
 * die ganze Insel mit Rändern. `tx`/`ty` sind CSS-Pixel der unskalierten
 * Bühne, Ursprung oben links. Cursor-Zoom muss in demselben Raum liegen —
 * nicht in `getBoundingClientRect()` der schon skalierten Fläche, sonst
 * wandert der Punkt unter dem Zeiger.
 *
 * Die Plane ist das Quadrat `max(width, height)`, zentriert auf der Bühne.
 * Ohne das in der Klemme landet Zoom-out auf Cover und beschneidet Nord/Süd
 * auf einem Querformat — gemessen am Pause-Atlas: die Insel war ein Streifen,
 * Minus tat nichts.
 */
export interface MapView {
  scale: number;
  tx: number;
  ty: number;
}

/** Cover: die Plane füllt die längere Bühnenkante. */
export const MAP_COVER_SCALE = 1;
export const MAP_MAX_SCALE = 8;
/** Kleiner Rand um die Insel im Contain-Zoom, damit Pins nicht am Rand kleben. */
export const MAP_FIT_PADDING = 0.94;

/** @deprecated Use mapMinScale(stageWidth, stageHeight). Cover is no longer the floor. */
export const MAP_MIN_SCALE = MAP_COVER_SCALE;

export function mapPlaneSize(stageWidth: number, stageHeight: number): number {
  return Math.max(stageWidth, stageHeight);
}

/** Kleinster Zoom: die ganze Insel steht in der Bühne. */
export function mapMinScale(stageWidth: number, stageHeight: number): number {
  const plane = mapPlaneSize(stageWidth, stageHeight);
  const short = Math.min(stageWidth, stageHeight);
  if (plane <= 0) return MAP_FIT_PADDING;
  return (short / plane) * MAP_FIT_PADDING;
}

export function clampMapView(view: MapView, stageWidth: number, stageHeight: number): MapView {
  const plane = mapPlaneSize(stageWidth, stageHeight);
  const minScale = mapMinScale(stageWidth, stageHeight);
  const scale = clamp(view.scale, minScale, MAP_MAX_SCALE);
  const planeLeft = (stageWidth - plane) * 0.5;
  const planeTop = (stageHeight - plane) * 0.5;
  const screenSize = plane * scale;

  let sx = view.tx + planeLeft * scale;
  let sy = view.ty + planeTop * scale;

  if (screenSize <= stageWidth) sx = (stageWidth - screenSize) * 0.5;
  else sx = clamp(sx, stageWidth - screenSize, 0);

  if (screenSize <= stageHeight) sy = (stageHeight - screenSize) * 0.5;
  else sy = clamp(sy, stageHeight - screenSize, 0);

  return {
    scale,
    tx: sx - planeLeft * scale,
    ty: sy - planeTop * scale,
  };
}

/** Einen Weltpunkt in die Mitte der Bühne legen. */
export function centerMapView(
  x: number,
  y: number,
  scale: number,
  stageWidth: number,
  stageHeight: number,
): MapView {
  return clampMapView(
    { scale, tx: stageWidth * 0.5 - x * scale, ty: stageHeight * 0.5 - y * scale },
    stageWidth,
    stageHeight,
  );
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
  const minScale = mapMinScale(stageWidth, stageHeight);
  const scale = clamp(view.scale * factor, minScale, MAP_MAX_SCALE);
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
