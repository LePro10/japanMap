// Ein gemeinsames Höhenprofil: Einmündungen sind geteilte Knoten, keine
// nachträglich übereinandergelegten Rampen. Kürzeste Wege begrenzen die
// Höhendifferenz entlang des Straßennetzes auch über mehrere Straßen hinweg.
import { CITY_ROAD_LEVEL as CITY_LEVEL } from '../src/config/city.mjs';

class Heap {
  a = [];
  push(v) { const a = this.a; let i = a.length; a.push(v); while (i) { const p = (i - 1) >> 1; if (a[p][0] <= v[0]) break; a[i] = a[p]; i = p; } a[i] = v; }
  pop() { const a = this.a, out = a[0], v = a.pop(); if (!a.length) return out; let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++; if (a[c][0] >= v[0]) break; a[i] = a[c]; i = c; } a[i] = v; return out; }
}

export function gradeEnvelope(targets, edges, fixed) {
  const graph = targets.map(() => []);
  for (const [a, b, rise] of edges) { graph[a].push([b, rise]); graph[b].push([a, rise]); }
  const spread = seeds => {
    const d = targets.map(() => Infinity), q = new Heap();
    for (const [i, h] of seeds) { d[i] = h; q.push([h, i]); }
    while (q.a.length) {
      const [h, i] = q.pop(); if (h !== d[i]) continue;
      for (const [j, rise] of graph[i]) if (h + rise < d[j]) { d[j] = h + rise; q.push([d[j], j]); }
    }
    return d;
  };
  const upper = spread(fixed), negativeLower = spread(fixed.map(([i, h]) => [i, -h]));
  for (const [i, h] of fixed) if (upper[i] < h - .025) throw new Error(`Road anchors cannot connect within the grade limit (${(h - upper[i]).toFixed(2)} m short)`);
  const minorant = spread(targets.map((h, i) => [i, h]));
  return minorant.map((h, i) => Math.max(-negativeLower[i], Math.min(upper[i], h)));
}

export function fitNetwork(roads, terrain) {
  // Kreuzungspunkte in die Hauptstrecke einfügen, bevor das gemeinsame Netz
  // aufgebaut wird. Interpolierte Breite und Querneigung bleiben erhalten.
  for (const r of roads.filter(r => r.tags.includes('wp6'))) for (const j of r.junctions) {
    const index = j.at === 'start' ? 0 : r.centerline.length - 3;
    const x = r.centerline[index], z = r.centerline[index + 2], host = roads.find(h => h.id === j.with);
    if (!host) continue;
    let best = null;
    for (let k = 0; k < host.centerline.length - 3; k += 3) {
      const l = host.centerline, dx = l[k + 3] - l[k], dz = l[k + 5] - l[k + 2], q = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - l[k]) * dx + (z - l[k + 2]) * dz) / q));
      const d = Math.hypot(x - l[k] - t * dx, z - l[k + 2] - t * dz);
      if (!best || d < best.d) best = { k, t, d };
    }
    if (!best || best.d > .1) continue;
    const { k, t } = best, l = host.centerline;
    if (t < .002 || t > .998) {
      const q = t < .002 ? k : k + 3;
      r.centerline[index] = l[q]; r.centerline[index + 2] = l[q + 2];
    } else {
      l.splice(k + 3, 0, x, l[k + 1] + (l[k + 4] - l[k + 1]) * t, z);
      host.widths.splice(k / 3 + 1, 0, host.widths[k / 3]);
      host.banking.splice(k / 3 + 1, 0, host.banking[k / 3]);
    }
  }
  const ids = new Map(), targets = [], fixed = [], edges = [], refs = [];
  for (const r of roads) {
    const rr = [], fresh = r.tags.includes('wp6');
    const grade = r.id === 'toge' ? .11 : r.type === 'pfad' ? .45 : r.type === 'dirt' ? .14 : r.type === 'village' ? .09 : r.id === 'zufahrt' ? .06 : r.tags.includes('hill') ? .115 : r.id === 'ring' || r.id === 'needle-circuit' ? .07 : .078;
    for (let i = 0; i < r.centerline.length; i += 3) {
      const [x, y, z] = r.centerline.slice(i, i + 3), key = `${Math.round(x * 100)},${Math.round(z * 100)}`;
      let id = ids.get(key);
      const core = x >= 440 && x <= 800 && z >= -60 && z <= 300;
      const locked = r.id === 'stadt' || (!fresh && r.id !== 'ring' && r.id !== 'zufahrt') || (r.id === 'ring' && x < 0 && z < 450);
      const ground = core ? CITY_LEVEL : terrain.at(x, z);
      const target = fresh && r.id !== 'needle-circuit' ? ground + .05 : r.id === 'ring' && x > 0 ? ground + .1 : y;
      if (id === undefined) { id = targets.length; ids.set(key, id); targets.push(target); }
      else targets[id] = Math.min(targets[id], target);
      if (locked || core) fixed.push([id, core ? CITY_LEVEL : y]);
      rr.push(id);
      if (i > 0) edges.push([rr[rr.length - 2], id, Math.hypot(x - r.centerline[i - 3], z - r.centerline[i - 1]) * grade]);
    }
    if (r.closed) edges.push([rr[0], rr.at(-1), Math.hypot(r.centerline[0] - r.centerline.at(-3), r.centerline[2] - r.centerline.at(-1)) * grade]);
    refs.push(rr);
  }
  const heights = gradeEnvelope(targets, edges, fixed);
  roads.forEach((r, k) => {
    let maxGrade = 0, earth = 0;
    refs[k].forEach((id, i) => {
      const p = i * 3, x = r.centerline[p], z = r.centerline[p + 2];
      r.centerline[p + 1] = Number(heights[id].toFixed(6));
      earth += Math.abs(heights[id] - terrain.at(x, z));
      if (i) maxGrade = Math.max(maxGrade, Math.abs(r.centerline[p + 1] - r.centerline[p - 2]) / Math.max(.001, Math.hypot(x - r.centerline[p - 3], z - r.centerline[p - 1])));
    });
    r.measured.maxGradient = Number(maxGrade.toFixed(4));
    r.measured.meanEarthwork = Number((earth / refs[k].length).toFixed(2));
    for (const j of r.junctions) j.height = j.at === 'start' ? r.centerline[1] : r.centerline.at(-2);
    // Editor-Knoten tragen dasselbe Profil wie die gebackene Mittellinie.
    for (const node of r.nodes) {
      let best = Infinity;
      for (let i = 0; i < r.centerline.length; i += 3) {
        const d = Math.hypot(node.pos[0] - r.centerline[i], node.pos[2] - r.centerline[i + 2]);
        if (d < best) { best = d; node.pos[1] = r.centerline[i + 1]; }
      }
    }
  });
}
