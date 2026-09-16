import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPECIES } from '../src/config/vegetation.config.ts';
import { treeKey } from '../src/game/breakables.ts';
import { placeAuthoredCherry, setAuthoredCherrySink } from '../src/world/scatter/authoredCanopy.ts';
import { createSakuraGeometry, SAKURA_HEIGHT } from '../src/world/scatter/sakuraMesh.ts';
import { buildCityPlaces } from '../src/world/city/CityPlaces.ts';
import { RoadNetwork } from '../src/world/roads/RoadNetwork.ts';
import type { RoadFile } from '../src/config/roads.config.ts';

const pine = SPECIES.find((s) => s.id === 'pine');
const sakura = SPECIES.find((s) => s.id === 'sakura');
assert.ok(pine && sakura, 'pine and sakura species exist');
assert.equal(sakura.authored, true, 'sakura is authored, not scattered');
assert.deepEqual(
  sakura.lodDistances,
  pine.lodDistances,
  'sakura uses the same near/mid/far ladder as pine',
);

const mesh = createSakuraGeometry(() => 0.37, 1);
assert.ok(mesh.getAttribute('color'), 'sakura mesh keeps trunk/blossom vertex colors');
mesh.computeBoundingBox();
const box = mesh.boundingBox!;
assert.ok(box.max.y > 4.5 && box.max.y < 7, `sakura height is a tree, not a bush (${box.max.y})`);
assert.equal(SAKURA_HEIGHT, 5.4);

assert.equal(placeAuthoredCherry({ x: 1, y: 2, z: 3, height: 9, seed: 0 }), false);

const received: { x: number; z: number; height: number }[] = [];
setAuthoredCherrySink((tree) => received.push({ x: tree.x, z: tree.z, height: tree.height }));
try {
  const file: RoadFile = JSON.parse(
    readFileSync(new URL('../assets/generated/roads/roads.json', import.meta.url), 'utf8'),
  );
  const network = new RoadNetwork(file);
  const meta = JSON.parse(
    readFileSync(new URL('../assets/generated/terrain/meta.json', import.meta.url), 'utf8'),
  );
  const height = readFileSync(new URL('../assets/generated/terrain/height.r16', import.meta.url));
  const terrainHeight = (x: number, z: number) => {
    const i = Math.round((x + meta.world.size / 2) / meta.heightmap.spacing);
    const j = Math.round((z + meta.world.size / 2) / meta.heightmap.spacing);
    return (
      meta.world.minHeight +
      (height.readUInt16LE((j * meta.heightmap.res + i) * 2) / 65535) * meta.heightmap.heightRange
    );
  };
  const places = buildCityPlaces({
    terrainHeight,
    roadHeight: (x, z) => network.closestPoint(x, z)?.y ?? -Infinity,
    urbanLots: file.urbanLots,
  });
  assert.ok(received.length >= 3, `garden cherries hook into canopy (${received.length})`);
  for (const tree of received) {
    assert.ok(
      !places.colliders.some(
        (c) =>
          tree.x > c.minX &&
          tree.x < c.maxX &&
          tree.z > c.minZ &&
          tree.z < c.maxZ &&
          c.top - c.bottom > 4,
      ),
      `cherry at ${tree.x},${tree.z} is not a static kit collider`,
    );
  }
  places.dispose();
} finally {
  setAuthoredCherrySink(null);
}

const a = treeKey(550, 510);
const b = treeKey(550, 510);
assert.equal(a, b, 'broken cherry uses the same key as a forest tree');

console.log(
  JSON.stringify({
    test: 'sakura lod',
    status: 'passed',
    lod: sakura.lodDistances,
    gardenCherries: received.length,
  }),
);
