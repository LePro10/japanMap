/**
 * Regressionstest fuer Streckenmarkierungen im Fahrkorridor.
 *
 * Ein Leitpfosten darf weder Asphalt noch Randstreifen irgendeiner Strasse
 * beruehren. Das gilt auch bei engen Kehren, an denen ein fuer einen Schenkel
 * gesetzter Pfosten auf dem benachbarten Schenkel landen kann.
 */

import { readFile } from 'node:fs/promises';

const roadFile = new URL('../assets/generated/roads/roads.json', import.meta.url);
const propFile = new URL('../assets/props.json', import.meta.url);
const roads = JSON.parse(await readFile(roadFile, 'utf8')).roads;
const props = JSON.parse(await readFile(propFile, 'utf8')).props;

const shoulders = {
  highway: 1.6,
  mountain: 1,
  village: 0.8,
  city: 1.2,
  dirt: 0.6,
  pfad: 0,
};

function nearestRoadMargin(point) {
  let best = null;

  for (const road of roads) {
    const line = road.centerline;
    const count = line.length / 3;
    const segments = road.closed ? count : count - 1;
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % count;
      const ax = line[i * 3];
      const az = line[i * 3 + 2];
      const dx = line[j * 3] - ax;
      const dz = line[j * 3 + 2] - az;
      const lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared > 0
        ? Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / lengthSquared))
        : 0;
      const distance = Math.hypot(point.x - (ax + dx * t), point.z - (az + dz * t));
      const clearance = (road.widths[i] ?? 0) / 2 + shoulders[road.type];
      const margin = distance - clearance;
      if (!best || margin < best.margin) best = { roadId: road.id, distance, clearance, margin };
    }
  }

  return best;
}

const blocked = props
  .filter((prop) => prop.id === 'delineator')
  .map((prop) => ({ prop, hit: nearestRoadMargin(prop) }))
  .filter(({ hit }) => hit && hit.margin < 0);

console.log('Leitpfosten gegen Fahrkorridore');
if (blocked.length === 0) {
  console.log('  ✓  Kein Leitpfosten steht auf Asphalt oder Randstreifen');
} else {
  console.error(`  ✗  ${blocked.length} Leitpfosten stehen im Fahrkorridor`);
  for (const { prop, hit } of blocked) {
    console.error(
      `     (${prop.x.toFixed(2)}, ${prop.z.toFixed(2)}) auf ${hit.roadId}: ` +
        `${hit.distance.toFixed(2)} m Achsabstand, Soll >= ${hit.clearance.toFixed(2)} m`,
    );
  }
  process.exitCode = 1;
}
