import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveTrims } from '@/world/roads/resolveTrims';
import { buildRoadGeometry } from '@/world/roads/RoadMeshBuilder';
import { buildDecals } from '@/world/roads/Decals';
import { RoadNetwork } from '@/world/roads/RoadNetwork';
import type { RoadFile } from '@/config/roads.config';

const file = JSON.parse(
  await readFile(new URL('../assets/generated/roads/roads.json', import.meta.url), 'utf8'),
) as RoadFile;

const resolved = resolveTrims(file.roads);
let openMouths = 0;
for (const road of resolved) {
  for (const junction of road.junctions) {
    const trim = junction.at === 'start' ? road.trimStart : road.trimEnd;
    if (trim < 1) openMouths++;
  }
  const mesh = buildRoadGeometry(road);
  mesh.geometry.dispose();
}
assert.equal(openMouths, 0, 'every recorded junction keeps a mesh setback');

const before = file.roads.filter((r) =>
  r.junctions.some((j) => (j.at === 'start' ? r.trimStart : r.trimEnd) < 1),
).length;
const after = resolved.filter((r) =>
  r.junctions.some((j) => (j.at === 'start' ? r.trimStart : r.trimEnd) < 1),
).length;
// Neo-Tokio (docs/TOKYO.md): seit dem Umbau des Stadtnetzes schreibt der Baker
// an allen Mündungen einen Rücksprung — gemessen 0 statt 50 offene Mündungen.
// Die Vorrichtung zeigt den alten Fehler damit nicht mehr; geprüft wird
// weiterhin, dass nach `resolveTrims` keine offen bleibt.
if (before > 0) assert.ok(before > 20, `fixture still has the WP6 trim-zero bug (${before})`);
assert.equal(after, 0, 'resolveTrims must fill those mouths without a rebake');

const decals = buildDecals(resolved);
assert.ok(
  decals.counts.ueberweg >= 50,
  `urban T-junctions need zebra paint, got ${decals.counts.ueberweg}`,
);

const measured = {
  minRadius: 40, maxGradient: 0, hairpins: 0, deepestCut: 0, highestFill: 0,
  meanEarthwork: 0, earthwork95: 0, worstAt: 0, gradientMargin: 1,
  gradientAttempts: 1, climb: 0, neededLength: 0, railLength: 0,
};
const net = new RoadNetwork({
  seed: 1,
  sampleSpacing: 2,
  roads: [{
    id: 'host', type: 'highway', closed: false, tags: [], nodes: [],
    centerline: [0, 10, 0, 0, 10, 20, 0, 10, 40],
    widths: [9, 9, 9], banking: [0, 0, 0], length: 40,
    junctions: [], trimStart: 0, trimEnd: 0, rails: [], measured,
  }],
  measured: { totalLength: 40, count: 1 },
});
// 9 m pavement + 1.6 m shoulder. 5.4 m used to miss and leave a plank in the mouth.
assert.equal(net.isOnRoad(5.4, 20), true, 'shoulder counts as the mouth');
assert.equal(net.isOnRoad(7.5, 20), false, 'past the bankett is not a mouth');

console.log(
  `Road trims: ${before} trim-zero branches repaired, ${decals.counts.ueberweg} crosswalks, ${resolved.length} meshes build.`,
);
