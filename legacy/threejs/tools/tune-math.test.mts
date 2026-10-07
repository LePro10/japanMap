import assert from 'node:assert/strict';
import {
  STOCK_TUNE,
  TUNE_PRICE,
  anyTuned,
  tuneCost,
  tunePackageCost,
  tuneReadout,
  tunedArcade,
  tunesEqual,
} from '@/config/tuning.config';
import { engineLook } from '@/config/engines.config';

assert.equal(tuneCost('engine', 0, 1), 900);
assert.equal(tuneCost('engine', 0, 2), 3600);
assert.equal(tuneCost('engine', 1, 2), 2700);
assert.equal(tuneCost('brakes', 0, 1), 600);
assert.equal(tuneCost('engine', 2, 1), 0);
assert.equal(tunePackageCost(STOCK_TUNE, { engine: 1, brakes: 1, steering: 1, tyres: 1 }), 3000);
assert.equal(tunePackageCost(STOCK_TUNE, { engine: 2, brakes: 2, steering: 2, tyres: 2 }), 12000);
assert.equal(anyTuned(STOCK_TUNE), false);
assert.equal(anyTuned({ ...STOCK_TUNE, engine: 1 }), true);
assert.equal(tunesEqual(STOCK_TUNE, { ...STOCK_TUNE }), true);

const stock = tunedArcade('touge', STOCK_TUNE);
const sport = tunedArcade('touge', { engine: 2, brakes: 2, steering: 2, tyres: 2 });
assert.ok(sport.launchForce > stock.launchForce);
assert.ok(sport.latG > stock.latG);
assert.ok(sport.brakeG > stock.brakeG);

const read = tuneReadout('touge', { engine: 2, brakes: 0, steering: 0, tyres: 0 });
assert.equal(read.bars.engine, 100);
assert.equal(read.bars.brakes, 0);
assert.ok(read.bars.speed > 0);
assert.equal(TUNE_PRICE.tyres[1], 900);
assert.equal(engineLook('morrow').layout, 'v8');
assert.equal(engineLook('pip').turbo, true);
assert.equal(engineLook('truck').turbo, false);
assert.equal(engineLook('gt').rear, true);
assert.equal(engineLook('touge').rear, false);
assert.notEqual(engineLook('needle').name, engineLook('morrow').name);
console.log('   ✓ tune prices, package cost, readout bars, engine identities');
