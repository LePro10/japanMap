/**
 * Regressionstest für sichtbare Straßenanschlüsse.
 *
 * Faengt den Fehler aus dem Bergpass-Screenshot: Der Pass folgte nach seinem
 * Anschluss noch dutzende Meter nahezu deckungsgleich der Ringstraße, sank
 * dabei aber auf eine andere Höhe. Im Bild entstanden dadurch zwei Straßen.
 *
 *   node tools/test-road-junctions.mjs
 */

import { readFile } from 'node:fs/promises';

const roadFile = new URL('../assets/generated/roads/roads.json', import.meta.url);
const data = JSON.parse(await readFile(roadFile, 'utf8'));
const ring = data.roads.find((road) => road.id === 'ring');
const pass = data.roads.find((road) => road.id === 'toge');

if (!ring || !pass) throw new Error('Ringstraße oder Bergpass fehlt in roads.json');

let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ✓  ${name}  (${detail})`);
  } else {
    failed++;
    console.error(`  ✗  ${name}  — ${detail}`);
  }
}

function pointAtArc(road, target) {
  const line = road.centerline;
  let arc = 0;
  for (let i = 0; i + 1 < line.length / 3; i++) {
    const ax = line[i * 3];
    const ay = line[i * 3 + 1];
    const az = line[i * 3 + 2];
    const bx = line[(i + 1) * 3];
    const by = line[(i + 1) * 3 + 1];
    const bz = line[(i + 1) * 3 + 2];
    const length = Math.hypot(bx - ax, bz - az);
    if (arc + length >= target) {
      const t = length > 0 ? (target - arc) / length : 0;
      return {
        x: ax + (bx - ax) * t,
        y: ay + (by - ay) * t,
        z: az + (bz - az) * t,
      };
    }
    arc += length;
  }
  throw new Error(`Strecke ${road.id} ist kürzer als ${target} m`);
}

function nearestOnRoad(road, point) {
  const line = road.centerline;
  const count = line.length / 3;
  const segments = road.closed ? count : count - 1;
  let best = null;

  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % count;
    const ax = line[i * 3];
    const ay = line[i * 3 + 1];
    const az = line[i * 3 + 2];
    const bx = line[j * 3];
    const by = line[j * 3 + 1];
    const bz = line[j * 3 + 2];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared > 0
      ? Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / lengthSquared))
      : 0;
    const x = ax + dx * t;
    const z = az + dz * t;
    const distance = Math.hypot(point.x - x, point.z - z);
    if (!best || distance < best.distance) {
      best = { distance, y: ay + (by - ay) * t };
    }
  }

  return best;
}

console.log('Straßenanschluss Ringstraße × Bergpass');

const junction = pointAtArc(pass, 0);
const hostAtJunction = nearestOnRoad(ring, junction);
check(
  'Anschlusshöhe ist gemeinsam',
  Math.abs(junction.y - hostAtJunction.y) <= 0.01,
  `Differenz ${Math.abs(junction.y - hostAtJunction.y).toFixed(3)} m`,
);

// Sichtbarer Halbkorridor: Ring (9 m + 2 × 1,6 m) / 2 plus Pass
// (6,5 m + 2 × 1 m) / 2 = 10,35 m. Nach 60 m darf die neue Strecke
// nicht mehr darin liegen; sonst erscheinen zwei Fahrbahnen uebereinander.
const departure = pointAtArc(pass, 60);
const hostAtDeparture = nearestOnRoad(ring, departure);
check(
  'Bergpass hat den Ringkorridor nach 60 m verlassen',
  hostAtDeparture.distance >= 10.35,
  `Achsabstand ${hostAtDeparture.distance.toFixed(2)} m (Soll >= 10,35 m)`,
);

// Ein einzelner Messpunkt reicht nicht: Der Pass kann den Korridor verlassen
// und ihn eine Kurve spaeter wieder kreuzen. Ab 60 m muss deshalb der gesamte
// verbleibende Verlauf ausserhalb der beiden sichtbaren Fahrbahnkorridore
// bleiben.
let arc = 0;
let closestReturn = { distance: Infinity, arc: 0, heightDelta: 0 };
for (let i = 1; i < pass.centerline.length / 3; i++) {
  const ax = pass.centerline[(i - 1) * 3];
  const az = pass.centerline[(i - 1) * 3 + 2];
  const point = {
    x: pass.centerline[i * 3],
    y: pass.centerline[i * 3 + 1],
    z: pass.centerline[i * 3 + 2],
  };
  arc += Math.hypot(point.x - ax, point.z - az);
  if (arc < 60) continue;

  const host = nearestOnRoad(ring, point);
  if (host.distance < closestReturn.distance) {
    closestReturn = {
      distance: host.distance,
      arc,
      heightDelta: point.y - host.y,
    };
  }
}
check(
  'Bergpass kehrt nach dem Abzweig nicht in den Ringkorridor zurueck',
  closestReturn.distance >= 10.35,
  `Minimum ${closestReturn.distance.toFixed(2)} m bei km ${(closestReturn.arc / 1000).toFixed(3)}, ` +
    `Hoehendifferenz ${closestReturn.heightDelta.toFixed(2)} m (Soll >= 10,35 m)`,
);

if (failed > 0) process.exitCode = 1;
