import { WAYPOINT } from '@/config/waypoint.config';

export interface PinScreen {
  readonly x: number;
  readonly y: number;
  readonly onScreen: boolean;
  /** Radiant, 0 = oben, nur gesetzt wenn der Pin am Rand klebt. */
  readonly edgeAngle: number;
}

/**
 * NDC → Overlay-Pixel, mit Randklemme.
 *
 * `inFront` ist Kamera-Raum z < 0 (three schaut nach −Z). Hinter der Kamera
 * werden x/y gespiegelt, sonst wandert der Pin durch die Bildmitte statt an
 * den gegenüberliegenden Rand — genau der Fall „ich fahre vom Ziel weg und
 * sehe den Text nicht".
 */
export function pinScreen(
  ndcX: number,
  ndcY: number,
  inFront: boolean,
  width: number,
  height: number,
  marginX = WAYPOINT.pinMarginX,
  marginY = WAYPOINT.pinMarginY,
): PinScreen {
  let x = ndcX;
  let y = ndcY;
  if (!inFront) {
    x = -x;
    y = -y;
  }

  const padX = width * marginX;
  const padY = height * marginY;
  const minX = padX;
  const maxX = width - padX;
  const minY = padY;
  const maxY = height - padY;

  const px = (x * 0.5 + 0.5) * width;
  const py = (-y * 0.5 + 0.5) * height;
  const inside =
    inFront && px >= minX && px <= maxX && py >= minY && py <= maxY;

  if (inside) {
    return { x: px, y: py, onScreen: true, edgeAngle: 0 };
  }

  const cx = width * 0.5;
  const cy = height * 0.5;
  let dx = px - cx;
  let dy = py - cy;
  if (dx === 0 && dy === 0) {
    dx = 0;
    dy = -1;
  }
  const halfW = (maxX - minX) * 0.5;
  const halfH = (maxY - minY) * 0.5;
  const sx = halfW / Math.abs(dx || 1e-6);
  const sy = halfH / Math.abs(dy || 1e-6);
  const t = Math.min(sx, sy);
  return {
    x: cx + dx * t,
    y: cy + dy * t,
    onScreen: false,
    edgeAngle: Math.atan2(dx, -dy),
  };
}

export function formatWaypointDistance(meters: number): string {
  if (meters < 999.5) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${hours} h ${m} min`;
  }
  return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
}
