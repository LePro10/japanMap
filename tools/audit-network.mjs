#!/usr/bin/env node
/**
 * Measure the live roads.json: junction snaps, trims, overlapping centre-lines,
 * unregistered crossings, rails on other roads. Read-only.
 */
import { readFile } from 'node:fs/promises';

const file = JSON.parse(await readFile(new URL('../assets/generated/roads/roads.json', import.meta.url), 'utf8'));
const roads = file.roads;
const byId = Object.fromEntries(roads.map((r) => [r.id, r]));

function nearestOn(road, x, z) {
  const line = road.centerline;
  const count = line.length / 3;
  const segments = road.closed ? count : count - 1;
  let best = null;
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % count;
    const ax = line[i * 3], az = line[i * 3 + 2];
    const bx = line[j * 3], bz = line[j * 3 + 2];
    const dx = bx - ax, dz = bz - az;
    const q = dx * dx + dz * dz;
    const t = q > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / q)) : 0;
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) {
      const y = line[i * 3 + 1] + (line[j * 3 + 1] - line[i * 3 + 1]) * t;
      const w = road.widths[i] ?? road.widths[Math.min(i, road.widths.length - 1)];
      best = { d, y, w, t, i };
    }
  }
  return best;
}

function endPoint(road, at) {
  const line = road.centerline;
  const i = at === 'start' ? 0 : line.length - 3;
  return { x: line[i], y: line[i + 1], z: line[i + 2] };
}

function segmentCross(p, q, r, s) {
  const d1x = q[0] - p[0], d1z = q[1] - p[1];
  const d2x = s[0] - r[0], d2z = s[1] - r[1];
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((r[0] - p[0]) * d2z - (r[1] - p[1]) * d2x) / den;
  const u = ((r[0] - p[0]) * d1z - (r[1] - p[1]) * d1x) / den;
  if (t <= 0.02 || t >= 0.98 || u <= 0.02 || u >= 0.98) return null;
  const sin = Math.abs(den) / (Math.hypot(d1x, d1z) * Math.hypot(d2x, d2z));
  return { t, u, sin, x: p[0] + d1x * t, z: p[1] + d1z * t };
}

const junctionIssues = [];
let trimZero = 0, heightJump = 0, snapFar = 0, missingHost = 0;
for (const road of roads) {
  for (const j of road.junctions ?? []) {
    const host = byId[j.with];
    if (!host) { missingHost++; junctionIssues.push({ kind: 'missing-host', road: road.id, with: j.with }); continue; }
    const end = endPoint(road, j.at);
    const hit = nearestOn(host, end.x, end.z);
    const dy = Math.abs(end.y - hit.y);
    const expected = hit.w / 2 + 1;
    if (j.trim === 0) {
      trimZero++;
      junctionIssues.push({ kind: 'trim-zero', road: road.id, at: j.at, with: j.with, snap: +hit.d.toFixed(2), hostW: hit.w, expected: +expected.toFixed(2), dy: +dy.toFixed(3) });
    }
    if (hit.d > 2) { snapFar++; junctionIssues.push({ kind: 'snap-far', road: road.id, at: j.at, with: j.with, d: +hit.d.toFixed(2) }); }
    if (dy > 0.15) { heightJump++; junctionIssues.push({ kind: 'height', road: road.id, at: j.at, with: j.with, dy: +dy.toFixed(3), y: end.y, hostY: hit.y }); }
  }
}

const overlaps = [];
for (let a = 0; a < roads.length; a++) {
  for (let b = a + 1; b < roads.length; b++) {
    const A = roads[a], B = roads[b];
    const nA = A.centerline.length / 3, nB = B.centerline.length / 3;
    const stepA = A.closed ? nA : nA - 1;
    const stepB = B.closed ? nB : nB - 1;
    let samples = 0, close = 0, minD = Infinity, at = null;
    for (let i = 0; i < nA; i += 4) {
      const x = A.centerline[i * 3], z = A.centerline[i * 3 + 2];
      const hit = nearestOn(B, x, z);
      const half = ((A.widths[i] ?? 8) + hit.w) / 4;
      samples++;
      if (hit.d < half && hit.d < minD) { minD = hit.d; at = { x, z, d: hit.d, half }; }
      if (hit.d < 1.5) close++;
    }
    if (close > 8 && minD < 2) {
      overlaps.push({ a: A.id, b: B.id, close, samples, minD: +minD.toFixed(2), at });
    }
  }
}

const unregistered = [];
for (let a = 0; a < roads.length; a++) {
  const A = roads[a];
  const nA = A.centerline.length / 3;
  const segsA = A.closed ? nA : nA - 1;
  for (let b = a + 1; b < roads.length; b++) {
    const B = roads[b];
    const linked = (A.junctions ?? []).some((j) => j.with === B.id) || (B.junctions ?? []).some((j) => j.with === A.id);
    const nB = B.centerline.length / 3;
    const segsB = B.closed ? nB : nB - 1;
    for (let i = 0; i < segsA; i += 2) {
      const ap = [A.centerline[i * 3], A.centerline[i * 3 + 2]];
      const aq = [A.centerline[((i + 1) % nA) * 3], A.centerline[((i + 1) % nA) * 3 + 2]];
      for (let j = 0; j < segsB; j += 2) {
        const bp = [B.centerline[j * 3], B.centerline[j * 3 + 2]];
        const bq = [B.centerline[((j + 1) % nB) * 3], B.centerline[((j + 1) % nB) * 3 + 2]];
        const hit = segmentCross(ap, aq, bp, bq);
        if (!hit || hit.sin < 0.35) continue;
        if (linked) continue;
        unregistered.push({ a: A.id, b: B.id, x: +hit.x.toFixed(1), z: +hit.z.toFixed(1), sin: +hit.sin.toFixed(2) });
      }
    }
  }
}

const railHits = [];
for (const road of roads) {
  for (const rail of road.rails ?? []) {
    const line = road.centerline;
    const count = line.length / 3;
    const spacing = road.length / (road.closed ? count : Math.max(count - 1, 1));
    const first = Math.max(0, Math.floor(rail.from / spacing));
    const last = Math.min(count - 1, Math.ceil(rail.to / spacing));
    for (let i = first; i <= last; i += 3) {
      const a = Math.max(i - 1, 0), b = Math.min(i + 1, count - 1);
      const tx = line[b * 3] - line[a * 3], tz = line[b * 3 + 2] - line[a * 3 + 2];
      const len = Math.hypot(tx, tz) || 1;
      const nx = (-tz / len) * rail.side, nz = (tx / len) * rail.side;
      const edge = (road.widths[i] ?? 8) / 2 + 1.6;
      const x = line[i * 3] + nx * edge, z = line[i * 3 + 2] + nz * edge;
      for (const other of roads) {
        if (other.id === road.id) continue;
        const hit = nearestOn(other, x, z);
        if (hit.d < hit.w / 2 + 0.4) {
          railHits.push({ road: road.id, other: other.id, x: +x.toFixed(1), z: +z.toFixed(1), d: +hit.d.toFixed(2) });
          break;
        }
      }
    }
  }
}

const lots = file.urbanLots ?? [];
const summary = {
  roads: roads.length,
  urbanLots: lots.length,
  totalKm: (file.measured?.totalLength / 1000).toFixed(2),
  junctions: roads.reduce((n, r) => n + (r.junctions?.length ?? 0), 0),
  trimZero, heightJump, snapFar, missingHost,
  overlappingPairs: overlaps.length,
  unregisteredCrossings: unregistered.length,
  railsOnOtherRoads: railHits.length,
};

console.log(JSON.stringify(summary, null, 2));
console.log('\n-- trim-zero (first 25) --');
for (const row of junctionIssues.filter((r) => r.kind === 'trim-zero').slice(0, 25)) console.log(row);
console.log('\n-- height jumps --');
for (const row of junctionIssues.filter((r) => r.kind === 'height')) console.log(row);
console.log('\n-- snap-far --');
for (const row of junctionIssues.filter((r) => r.kind === 'snap-far')) console.log(row);
console.log('\n-- overlaps (first 15) --');
for (const row of overlaps.slice(0, 15)) console.log(row);
console.log('\n-- unregistered (first 20) --');
const uniq = [];
const seen = new Set();
for (const row of unregistered) {
  const k = `${row.a}|${row.b}|${Math.round(row.x / 8)}|${Math.round(row.z / 8)}`;
  if (seen.has(k)) continue;
  seen.add(k);
  uniq.push(row);
}
console.log(`unique unregistered clusters: ${uniq.length}`);
for (const row of uniq.slice(0, 20)) console.log(row);
console.log('\n-- rails on other roads (first 15) --');
for (const row of railHits.slice(0, 15)) console.log(row);

const ids = roads.map((r) => `${r.id} ${r.type} ${r.length.toFixed(0)}m trim ${r.trimStart}/${r.trimEnd} j=${r.junctions?.length ?? 0} rails=${r.rails?.length ?? 0} ${(r.tags ?? []).join(',')}`);
console.log('\n-- roads --');
for (const line of ids) console.log(line);
