import assert from 'node:assert/strict';
import { EXPLORE_DWELL_S, EXPLORE_MOVE_M, EXPLORE_SPARKS } from '@/config/explore.config';
import { Profile } from '@/game/Profile';
import { exploreToastText, RegionWatch } from '@/game/regionExplore';
import { MAP_REGIONS, regionAt } from '@/ui/navigationMapRegions';
import { walkSpawnZone } from '@/config/walker.config';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  },
  configurable: true,
});

const spawn = walkSpawnZone();
const samples: Record<string, { x: number; z: number }> = {
  commons: { x: spawn.x, z: spawn.z },
  neon: { x: 620, z: 120 },
  cinder: { x: -536, z: -495 },
  bellwood: { x: 790, z: -760 },
  stillwater: { x: -760, z: 60 },
  tideglass: { x: 780, z: 1030 },
  needle: { x: -620, z: 740 },
  longshore: { x: 100, z: 1400 },
};

assert.equal(MAP_REGIONS.length, 8);
for (const region of MAP_REGIONS) {
  const point = samples[region.id];
  assert.ok(point, `sample for ${region.id}`);
  assert.equal(regionAt(point.x, point.z).id, region.id);
}

function memoryProfile(): Profile {
  return new Profile();
}

function visit(
  watch: RegionWatch,
  profile: Profile,
  id: keyof typeof samples,
  opts: { dt?: number; move?: number; airborne?: boolean } = {},
) {
  const point = samples[id]!;
  const dt = opts.dt ?? 1 / 60;
  const move = opts.move ?? EXPLORE_MOVE_M + 0.5;
  const steps = Math.ceil((EXPLORE_DWELL_S + 0.05) / dt);
  const step = move / steps;
  let grant = null;
  for (let i = 1; i <= steps; i++) {
    const hit = watch.tick(dt, point.x + step * i, point.z, {
      airborne: opts.airborne === true,
      explored: (regionId) => profile.hasExplored(regionId),
    });
    if (hit) {
      assert.equal(profile.markExplored(hit.id), true, `mark ${hit.id} once`);
      profile.earn(hit.sparks);
      grant = hit;
    }
  }
  return grant;
}

store.clear();
const fresh = memoryProfile();
assert.equal(fresh.exploredCount, 0);
assert.equal(fresh.yen, 0);

const watch = new RegionWatch();
const first = visit(watch, fresh, 'commons');
assert.ok(first, 'commons grants after dwell + movement');
assert.equal(first.id, 'commons');
assert.equal(first.count, 1);
assert.equal(first.total, 8);
assert.equal(first.sparks, EXPLORE_SPARKS);
assert.equal(fresh.exploredCount, 1);
assert.equal(fresh.yen, EXPLORE_SPARKS);
assert.equal(exploreToastText(first).title, 'Sakura Commons explored!');
assert.equal(exploreToastText(first).body, 'You explored 1/8 zones');

const again = visit(watch, fresh, 'commons');
assert.equal(again, null, 'already visited = silent');
assert.equal(fresh.exploredCount, 1);
assert.equal(fresh.yen, EXPLORE_SPARKS);

const second = visit(watch, fresh, 'stillwater');
assert.ok(second);
assert.equal(second.count, 2);
assert.equal(exploreToastText(second).body, 'You explored 2/8 zones');
assert.equal(fresh.yen, EXPLORE_SPARKS * 2);

const hop = new RegionWatch();
const hopProfile = memoryProfile();
const needle = samples.needle!;
assert.equal(
  hop.tick(EXPLORE_DWELL_S, needle.x, needle.z, {
    airborne: false,
    explored: () => false,
  }),
  null,
  'one long tick without prior entry does not grant — entry resets dwell',
);
assert.equal(
  hop.tick(1 / 60, needle.x + EXPLORE_MOVE_M + 1, needle.z, {
    airborne: true,
    explored: () => false,
  }),
  null,
  'airborne does not accumulate',
);

const fly = new RegionWatch();
const flyProfile = memoryProfile();
const longshore = samples.longshore!;
const neon = samples.neon!;
for (let i = 0; i < 20; i++) {
  assert.equal(
    fly.tick(1 / 60, longshore.x + i, longshore.z, {
      airborne: false,
      explored: (id) => flyProfile.hasExplored(id),
    }),
    null,
  );
}
const crossed = fly.tick(EXPLORE_DWELL_S, neon.x, neon.z, {
  airborne: false,
  explored: (id) => flyProfile.hasExplored(id),
});
assert.equal(crossed, null, 'crossing into a new region resets dwell');

store.clear();
const persisted = memoryProfile();
const persistWatch = new RegionWatch();
assert.ok(visit(persistWatch, persisted, 'cinder'));
assert.ok(visit(persistWatch, persisted, 'bellwood'));
const saved = store.get('japanmap.profile');
assert.ok(saved);
store.clear();
store.set('japanmap.profile', saved);
const reloaded = new Profile();
assert.equal(reloaded.exploredCount, 2);
assert.ok(reloaded.hasExplored('cinder'));
assert.ok(reloaded.hasExplored('bellwood'));
assert.equal(reloaded.yen, EXPLORE_SPARKS * 2);

const afterReload = new RegionWatch();
assert.equal(visit(afterReload, reloaded, 'cinder'), null, 'reload keeps visited silent');
assert.equal(reloaded.exploredCount, 2);
assert.equal(reloaded.yen, EXPLORE_SPARKS * 2);
const next = visit(afterReload, reloaded, 'tideglass');
assert.ok(next);
assert.equal(next.count, 3);
assert.equal(exploreToastText(next).body, 'You explored 3/8 zones');

let n = reloaded.exploredCount;
for (const region of MAP_REGIONS) {
  if (reloaded.hasExplored(region.id)) continue;
  const hit = visit(afterReload, reloaded, region.id);
  assert.ok(hit, `grant ${region.id}`);
  n++;
  assert.equal(hit.count, n);
}
assert.equal(reloaded.exploredCount, 8);
assert.equal(n, 8);
for (const region of MAP_REGIONS) {
  assert.equal(visit(afterReload, reloaded, region.id), null, `${region.id} stays silent`);
}
assert.equal(reloaded.yen, EXPLORE_SPARKS * 8);

console.log('region explore: once each, n/8, survives reload, visited = silent');
