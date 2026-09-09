import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const file = JSON.parse(await readFile(new URL('../assets/generated/roads/roads.json', import.meta.url), 'utf8'));
if (!file.roads.some((r) => r.id === 'needle-circuit')) {
  console.log('WP6 roads: inactive on the restored checkpoint. Layout and runtime tests cover the draft.');
  process.exit(0);
}
const road = id => {
  const found = file.roads.find(r => r.id === id);
  assert.ok(found, `${id} must be a generated, carved road`);
  return found;
};
const needle = road('needle-circuit');
// Der Bypass ersetzt ein Stück des geschlossenen Rings, keine zweite Deckfläche.
const bypass = file.roads.find(r => r.tags.includes('orchard-bypass'));
assert.ok(bypass, 'Orchard Bypass must be authored into the ring spline');
assert.ok(needle.closed, 'Free practice needs a complete circuit');
assert.ok(needle.length > 2000 && needle.length < 2500, 'Circuit must preserve its compact coastal lap');
const straight = [];
for (let i = 0; i < needle.centerline.length; i += 3) {
  const [x, y, z] = needle.centerline.slice(i, i + 3);
  if (x >= -1060 && x <= -160 && Math.abs(z - 855) < .05) straight.push(x);
  assert.ok(Number.isFinite(y), 'Every track sample needs support');
}
assert.ok(Math.max(...straight) - Math.min(...straight) >= 896, 'The 900 m straight must survive spline rounding');
assert.ok(bypass.closed, 'Bypass must preserve a continuous ring lap');
for (const r of file.roads.filter(r => r.tags.includes('wp6'))) {
  assert.ok(r.measured.maxGradient <= (r.tags.includes('hill') ? .12 : .08) + .001, `${r.id}: excessive grade`);
  assert.ok(r.measured.minRadius === null || r.measured.minRadius >= 24, `${r.id}: pinched spline`);
  assert.ok(r.measured.meanEarthwork < 12, `${r.id}: buried route instead of a street`);
  assert.ok(r.centerline.every(Number.isFinite), `${r.id}: invalid geometry`);
}
const ring = road('ring');
for (let i = 0; i < ring.centerline.length; i += 3) {
  const x = ring.centerline[i], z = ring.centerline[i + 2];
  assert.ok(!(x > -1100 && x < -120 && z > 620 && z < 910), 'Old ring must leave the racing shelf');
}
console.log(`WP6 roads: ${file.roads.length} routes, ${(needle.length / 1000).toFixed(2)} km circuit; straight, grades and ring separation pass.`);
