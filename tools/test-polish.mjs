import { spawnSync } from 'node:child_process';

// Current-world regressions, including upstream features preserved by the merge.
const tests = [
  'tools/bench/driving-contact.mts', 'tools/bench/ramp-contact.mts',
  'tools/bench/road-contact.mts', 'tools/bench/smashables.mts',
  'tools/bench/debris.mts', 'tools/bench/terrain-grid.mts',
  'tools/bench/terrain-flat.mts', 'tools/bench/height-codec.mts',
  'tools/road-visuals.test.mjs', 'tools/wp4-city.test.mts',
  'tools/wp-offroad.test.mts', 'tools/tune-math.test.mts',
  'tools/wp6-runtime.test.mts', 'tools/wp6-layout.test.mjs', 'tools/wp6-roads.test.mjs',
];
for (const test of tests) {
  console.log(`\n${test}`);
  const result = spawnSync(process.execPath,
    ['--experimental-strip-types', '--import', './tools/bench/register.mjs', test],
    { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
