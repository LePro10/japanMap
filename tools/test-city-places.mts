import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Mesh, Vector3 } from 'three';
import { buildCityPlaces, getCityPlaceReserves } from '../src/world/city/CityPlaces.ts';
import { CITY, CITY_GROUND_Y } from '../src/config/city.config.ts';
import { RoadNetwork } from '../src/world/roads/RoadNetwork.ts';
import type { RoadFile } from '../src/config/roads.config.ts';

const file: RoadFile = JSON.parse(readFileSync(new URL('../assets/generated/roads/roads.json', import.meta.url), 'utf8'));
const network = new RoadNetwork(file);
const meta = JSON.parse(readFileSync(new URL('../assets/generated/terrain/meta.json', import.meta.url), 'utf8'));
const height = readFileSync(new URL('../assets/generated/terrain/height.r16', import.meta.url));
const terrainHeight = (x: number, z: number) => {
  const i = Math.round((x + meta.world.size / 2) / meta.heightmap.spacing);
  const j = Math.round((z + meta.world.size / 2) / meta.heightmap.spacing);
  return meta.world.minHeight + height.readUInt16LE((j * meta.heightmap.res + i) * 2) / 65535 * meta.heightmap.heightRange;
};
const reserves = getCityPlaceReserves(file.urbanLots ?? []);
assert.equal(reserves.length, 4, 'all places have existing baked parcels');
assert.deepEqual(getCityPlaceReserves([...(file.urbanLots ?? [])].reverse()), reserves, 'lot choice is order independent');
for (const reserve of reserves) {
  const lot = reserve.lot;
  if (!lot) continue;
  for (let x = lot.minX + 1; x < lot.maxX; x += 2) for (let z = lot.minZ + 1; z < lot.maxZ; z += 2) {
    assert(terrainHeight(x, z) < lot.top, `${reserve.id} terrain remains below platform`);
    const road = network.closestPoint(x, z);
    assert(!road || road.distance > road.width / 2, `${reserve.id} does not cover a traffic lane`);
  }
}
const places = buildCityPlaces({ terrainHeight, roadHeight: (x, z) => network.closestPoint(x, z)?.y ?? -Infinity, urbanLots: file.urbanLots });
assert.equal(places.destinations.length, 4);
const normal = new Vector3();
for (const destination of places.destinations) {
  assert(Math.abs(places.floors.height(destination.x, destination.z) - destination.y) < 0.002, `${destination.id} pin stands on floor`);
  assert(!places.colliders.some(c => destination.x > c.minX - 0.35 && destination.x < c.maxX + 0.35 && destination.z > c.minZ - 0.35 && destination.z < c.maxZ + 0.35 && c.bottom < destination.y + 1.8 && c.top > destination.y + 0.2), `${destination.id} arrival is unobstructed`);
}
const gardenY = CITY_GROUND_Y + CITY.sidewalk.height;
let previous = places.floors.height(705, -1);
for (let z = -0.75; z <= 23; z += 0.25) {
  const y = places.floors.height(705, z);
  assert(Math.abs(y - previous) < 0.05, 'bridge has continuous walkable ramps');
  assert(places.floors.normal(705, z, normal) && normal.y > 0.98, 'bridge ramp slope stays walkable');
  assert(!places.colliders.some(c => 705 > c.minX - 0.35 && 705 < c.maxX + 0.35 && z > c.minZ - 0.35 && z < c.maxZ + 0.35 && c.bottom < y + 1.8 && c.top > y + 0.2), 'bridge center stays unobstructed');
  previous = y;
}
assert(places.floors.height(712, 11) >= gardenY, 'pond has firm ground');
assert(places.floors.height(700, 49.8) >= gardenY, 'south garden entrance connects to ground');
let vertices = 0, meshes = 0;
places.group.traverse(o => {
  if (!(o instanceof Mesh)) return;
  meshes++;
  const positions = o.geometry.getAttribute('position'); vertices += positions.count;
  for (let i = 0; i < positions.count; i++) assert(Number.isFinite(positions.getX(i)) && Number.isFinite(positions.getY(i)) && Number.isFinite(positions.getZ(i)), 'geometry is finite');
  if (o.name.startsWith('Rain Garden stone')) {
    o.geometry.computeBoundingBox();
    const bounds = o.geometry.boundingBox!;
    assert(bounds.min.x >= 664.999 && bounds.max.x <= 745.001 && bounds.min.z >= -20.001 && bounds.max.z <= 50.001, 'garden stays inside its reservation');
  }
});
assert(meshes <= 6, 'details remain batched');
assert(vertices < 140_000, 'places stay within a modest geometry budget');
let disposed = 0;
places.group.traverse(o => { if (o instanceof Mesh) o.geometry.addEventListener('dispose', () => disposed++); });
places.dispose(); assert.equal(disposed, meshes); assert.equal(places.group.children.length, 0);
const gardenOnly = buildCityPlaces({ terrainHeight, roadHeight: () => -Infinity });
assert.equal(gardenOnly.destinations.length, 1, 'missing baked lots safely skips terrace landmarks'); gardenOnly.dispose();
console.log(JSON.stringify({ test: 'city places', status: 'passed', meshes, triangles: Math.round(vertices / 3), colliders: places.colliders.length, reserves: reserves.map(r => ({ id: r.id, x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 })) }));
