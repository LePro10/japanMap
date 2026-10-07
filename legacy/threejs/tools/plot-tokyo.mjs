/**
 * Neo-Tokio als Plan von oben — Straßen, Viertel, Freiflächen, Sonderbauten.
 *
 * Wozu: das Raster wurde in Phase 1 nur als Zahlen entworfen, und genau das hat
 * man ihm angesehen („das Gitter ist statisch und langweilig" — Rückmeldung
 * nach dem Teilstück). Ein Straßenplan wird am Bild entworfen, nicht an
 * Koordinatenlisten. Das Werkzeug liest dieselben Daten wie Baker und
 * Generator (`tokyoLayout.mjs`) und, falls vorhanden, die gebackenen Straßen
 * aus `roads.json` — dann sieht man auch, was der Generator daraus gemacht hat.
 *
 *   node tools/plot-tokyo.mjs [--baked] [--out .cache/shots/tokyo-plan.png]
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';

import { CITY_CIRCUIT, DISTRICTS, EDGE_ROUTES, GRID_STREETS, OPEN_SPACES, RAIL_LINE, SPECIAL_SITES, STREET_CLASS, streetPoints } from '../src/config/tokyoLayout.mjs';
import { CITY_DISTRICT } from '../src/config/city.mjs';

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : '.cache/shots/tokyo-plan.png';
const baked = args.includes('--baked');

const pad = 60;
const minX = CITY_DISTRICT.minX - pad, maxX = CITY_DISTRICT.maxX + pad;
const minZ = CITY_DISTRICT.minZ - pad, maxZ = CITY_DISTRICT.maxZ + pad;
const S = 1.6;
const W = Math.round((maxX - minX) * S), H = Math.round((maxZ - minZ) * S);
const X = (x) => ((x - minX) * S).toFixed(1);
const Z = (z) => ((z - minZ) * S).toFixed(1);
const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0])},${Z(p[1])}`).join(' ');

const COLORS = {
  towers: '#5b6b8a', neon: '#a0457a', yokocho: '#b06a3a', scramble: '#3f7fa6',
  underpass: '#6a6a6a', electric: '#3fa68a', ginza: '#a6893f', residential: '#6f8a5b',
};
const OPEN = { park: '#3f8f4a', shrine: '#8f5a3f', plaza: '#9a948a', parking: '#55585c' };

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
svg += `<rect width="100%" height="100%" fill="#1a1c1f"/>`;
for (const p of CITY_DISTRICT.parts) svg += `<rect x="${X(p.minX)}" y="${Z(p.minZ)}" width="${(p.maxX - p.minX) * S}" height="${(p.maxZ - p.minZ) * S}" fill="#2a2d31"/>`;
for (const d of DISTRICTS) {
  svg += `<rect x="${X(d.minX)}" y="${Z(d.minZ)}" width="${(d.maxX - d.minX) * S}" height="${(d.maxZ - d.minZ) * S}" fill="${COLORS[d.style]}" fill-opacity=".22" stroke="${COLORS[d.style]}" stroke-width="1"/>`;
  svg += `<text x="${+X(d.minX) + 4}" y="${+Z(d.minZ) + 14}" fill="#ddd" font-size="12" font-family="sans-serif">${d.name}</text>`;
}
for (const o of OPEN_SPACES) svg += `<path d="${path(o.polygon)} Z" fill="${OPEN[o.type] ?? '#777'}" fill-opacity=".8"/><text x="${X(o.polygon[0][0])}" y="${+Z(o.polygon[0][1]) - 3}" fill="#cfe" font-size="10" font-family="sans-serif">${o.id}</text>`;

const road = (pts, w, color, opacity = 1) => `<path d="${path(pts)}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${w * S}" stroke-linecap="round" stroke-linejoin="round"/>`;

if (baked && existsSync('assets/generated/roads/roads.json')) {
  const file = JSON.parse(readFileSync('assets/generated/roads/roads.json', 'utf8'));
  for (const r of file.roads ?? file) {
    const l = r.centerline, pts = [];
    for (let i = 0; i < l.length; i += 3) pts.push([l[i], l[i + 2]]);
    svg += road(pts, r.widths?.[0] ?? 8, r.id === 'ring' ? '#d9a441' : '#c9ccd1', r.id === 'ring' ? 0.55 : 0.9);
  }
} else {
  for (const [, w, controls] of EDGE_ROUTES) svg += road(controls, w, '#888');
  svg += road([...CITY_CIRCUIT.corners, CITY_CIRCUIT.corners[0]], CITY_CIRCUIT.width, '#e05a5a');
  for (const street of GRID_STREETS) svg += road(streetPoints(street), STREET_CLASS[street[1]], '#c9ccd1');
}
svg += `<rect x="${X(RAIL_LINE.x - RAIL_LINE.width / 2)}" y="${Z(RAIL_LINE.minZ)}" width="${RAIL_LINE.width * S}" height="${(RAIL_LINE.maxZ - RAIL_LINE.minZ) * S}" fill="#4a7" fill-opacity=".35"/>`;
for (const s of SPECIAL_SITES) {
  if (s.type === 'cylinder') svg += `<circle cx="${X(s.x)}" cy="${Z(s.z)}" r="${s.radius * S}" fill="#fc6"/>`;
  else svg += `<rect x="${X(s.minX)}" y="${Z(s.minZ)}" width="${(s.maxX - s.minX) * S}" height="${(s.maxZ - s.minZ) * S}" fill="#fc6" fill-opacity=".8"/>`;
}
for (let x = Math.ceil(minX / 100) * 100; x <= maxX; x += 100) svg += `<text x="${X(x)}" y="12" fill="#777" font-size="10" font-family="sans-serif">${x}</text><line x1="${X(x)}" y1="16" x2="${X(x)}" y2="${H}" stroke="#fff" stroke-opacity=".06"/>`;
for (let z = Math.ceil(minZ / 100) * 100; z <= maxZ; z += 100) svg += `<text x="2" y="${Z(z)}" fill="#777" font-size="10" font-family="sans-serif">${z}</text><line x1="30" y1="${Z(z)}" x2="${W}" y2="${Z(z)}" stroke="#fff" stroke-opacity=".06"/>`;
svg += '</svg>';

mkdirSync(dirname(out), { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(out);
console.log(`${out}  ${W}×${H}`);
