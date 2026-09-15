import { ROAD_TYPES, type RoadData } from '@/config/roads.config';

/** Farben der Spielerkarte — dieselbe Palette wie `theme.css`. */
export const MAP_INK = {
  roadMain: '#f4f1ea',
  road: '#cfd6d8',
  roadDirt: '#c49a5c',
  roadOutline: 'rgba(8, 18, 20, 0.82)',
  player: '#f6efe4',
  playerEdge: 'rgba(6, 12, 14, 0.92)',
  waypoint: '#3ee0ff',
  waypointHot: '#e8ba7f',
  route: '#3ee0ff',
  rival: '#63e0ff',
  target: '#7dff9a',
  ramp: '#e8763f',
  zone: 'rgba(212, 120, 154, 0.7)',
  north: '#f6efe4',
} as const;

export type MapProject = (x: number, z: number) => { x: number; y: number };

/**
 * Straßennetz einmal auf die Basiskarte. Hauptstrecken hell und dick,
 * Pfade gestrichelt ocker — sonst liest sich die Insel als ein grauer Klumpen.
 */
export function drawRoadNetwork(
  ctx: CanvasRenderingContext2D,
  roads: readonly RoadData[],
  project: MapProject,
  scale: number,
): number {
  let drawn = 0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const road of roads) {
    if (road.centerline.length < 6) continue;
    const dirt = road.type === 'dirt' || road.type === 'pfad';
    const main = road.length > 2000 || road.type === 'highway' || road.type === 'city';
    const width = (main ? 2.4 : dirt ? 1.15 : 1.55) * scale;
    ctx.beginPath();
    for (let i = 0; i < road.centerline.length; i += 12) {
      const point = project(road.centerline[i]!, road.centerline[i + 2]!);
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    if (road.closed) ctx.closePath();
    ctx.setLineDash(dirt ? [5 * scale, 4 * scale] : []);
    ctx.strokeStyle = MAP_INK.roadOutline;
    ctx.lineWidth = width + 1.6 * scale;
    ctx.stroke();
    ctx.strokeStyle = dirt ? MAP_INK.roadDirt : main ? MAP_INK.roadMain : MAP_INK.road;
    ctx.lineWidth = width;
    ctx.stroke();
    drawn++;
  }
  ctx.setLineDash([]);
  return drawn;
}

/**
 * Straßen im sichtbaren Ausschnitt, in Weltmetern. Die Minikarte darf sie
 * nicht aus einer 1024er-Weltkarte hochrechnen — bei 480 m Sicht sind das
 * ~160 Quellpixel. Hier wird jeder Spline auf die Anzeigefläche projiziert.
 */
export function drawLocalRoads(
  ctx: CanvasRenderingContext2D,
  roads: readonly RoadData[],
  originX: number,
  originZ: number,
  span: number,
  size: number,
): number {
  const px = size / span;
  const pad = span * 0.6;
  let drawn = 0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  const project = (x: number, z: number) => ({
    x: ((x - originX) / span + 0.5) * size,
    y: ((z - originZ) / span + 0.5) * size,
  });

  for (const pass of ['outline', 'fill'] as const) {
    for (const road of roads) {
      const line = road.centerline;
      if (line.length < 6) continue;
      const dirt = road.type === 'dirt' || road.type === 'pfad';
      const main = road.type === 'highway' || road.type === 'city' || road.length > 2000;
      const metres = ROAD_TYPES[road.type].width;
      const width = Math.max(1.4, metres * px);
      let started = false;
      ctx.beginPath();
      for (let i = 0; i < line.length; i += 6) {
        const wx = line[i]!;
        const wz = line[i + 2]!;
        if (Math.abs(wx - originX) > pad || Math.abs(wz - originZ) > pad) {
          started = false;
          continue;
        }
        const p = project(wx, wz);
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else ctx.lineTo(p.x, p.y);
      }
      if (!started) continue;
      if (pass === 'outline') {
        ctx.setLineDash([]);
        ctx.strokeStyle = MAP_INK.roadOutline;
        ctx.lineWidth = width + 2.2;
        ctx.stroke();
      } else {
        ctx.setLineDash(dirt ? [6, 5] : []);
        ctx.strokeStyle = dirt ? MAP_INK.roadDirt : main ? MAP_INK.roadMain : MAP_INK.road;
        ctx.lineWidth = width;
        ctx.stroke();
        drawn++;
      }
    }
  }
  ctx.setLineDash([]);
  return drawn;
}

export function drawGlowRoute(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = MAP_INK.route;
  ctx.shadowColor = 'rgba(62, 224, 255, 0.95)';
  ctx.shadowBlur = 14;
  ctx.lineWidth = width + 3;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = width;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

/**
 * Fahrzeugpfeil. `heading` ist der Gierwinkel der Welt
 * (`forward = (sin ψ, 0, cos ψ)`); auf der nordfesten Karte zeigt +Z nach unten.
 */
export function drawPlayerChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
  radius: number,
): void {
  const fx = Math.sin(heading);
  const fy = Math.cos(heading);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = radius * 0.7;
  ctx.beginPath();
  ctx.moveTo(x + fx * radius, y + fy * radius);
  ctx.lineTo(x - fx * radius * 0.62 - fy * radius * 0.58, y - fy * radius * 0.62 + fx * radius * 0.58);
  ctx.lineTo(x - fx * radius * 0.28, y - fy * radius * 0.28);
  ctx.lineTo(x - fx * radius * 0.62 + fy * radius * 0.58, y - fy * radius * 0.62 - fx * radius * 0.58);
  ctx.closePath();
  ctx.fillStyle = MAP_INK.player;
  ctx.strokeStyle = MAP_INK.playerEdge;
  ctx.lineWidth = Math.max(1.2, radius * 0.14);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawWaypointPin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = 'rgba(102, 215, 244, 0.55)';
  ctx.shadowBlur = radius * 1.1;
  ctx.fillStyle = MAP_INK.waypoint;
  ctx.strokeStyle = MAP_INK.playerEdge;
  ctx.lineWidth = Math.max(1.4, radius * 0.14);
  ctx.beginPath();
  ctx.arc(0, -radius * 0.28, radius, Math.PI * 0.14, Math.PI * 0.86, true);
  ctx.quadraticCurveTo(radius * 0.7, radius * 0.7, 0, radius * 1.48);
  ctx.quadraticCurveTo(-radius * 0.7, radius * 0.7, -radius, -radius * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#082026';
  ctx.beginPath();
  ctx.arc(0, -radius * 0.3, radius * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MAP_INK.waypointHot;
  ctx.beginPath();
  ctx.arc(0, -radius * 0.3, radius * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawRoute(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
): void {
  const mx = (x0 + x1) * 0.5;
  const my = (y0 + y1) * 0.5;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const bulge = Math.min(48, len * 0.18);
  const cx = mx - (dy / len) * bulge;
  const cy = my + (dx / len) * bulge;
  ctx.save();
  ctx.strokeStyle = MAP_INK.route;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.setLineDash([7, 6]);
  ctx.shadowColor = 'rgba(102, 215, 244, 0.45)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.stroke();
  ctx.restore();
}

export function drawNorthMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.fillStyle = MAP_INK.north;
  ctx.strokeStyle = 'rgba(6, 20, 24, 0.85)';
  ctx.lineWidth = 3;
  ctx.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText('N', x, y);
  ctx.fillText('N', x, y);
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.7);
  ctx.lineTo(x - size * 0.22, y + size * 1.15);
  ctx.lineTo(x + size * 0.22, y + size * 1.15);
  ctx.closePath();
  ctx.fillStyle = MAP_INK.waypointHot;
  ctx.fill();
  ctx.restore();
}
