import assert from 'node:assert/strict';
import { MAP_REGIONS, regionAt } from '../src/ui/navigationMapRegions';
import { walkSpawnZone } from '../src/config/walker.config';

assert.equal(MAP_REGIONS.length, 8);

const spawn = walkSpawnZone();
assert.equal(regionAt(spawn.x, spawn.z).id, 'commons');
assert.equal(regionAt(620, 120).id, 'neon');
assert.equal(regionAt(-536, -495).id, 'cinder');
assert.equal(regionAt(790, -760).id, 'bellwood');
assert.equal(regionAt(-760, 60).id, 'stillwater');
assert.equal(regionAt(780, 1030).id, 'tideglass');
assert.equal(regionAt(-620, 740).id, 'needle');
assert.equal(regionAt(100, 1400).id, 'longshore');

const seen = new Set(MAP_REGIONS.map((region) => region.id));
assert.equal(seen.size, 8, 'Every point on the island belongs to a named region.');

console.log('navigation map regions: ok');
