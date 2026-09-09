import assert from 'node:assert/strict';
import { gradeEnvelope } from './wp6-profile.mjs';
const edges = [[0,1,1],[1,2,1],[2,3,1],[1,4,1],[4,5,1]];
const y = gradeEnvelope([0,8,10,2,0,0], edges, [[0,0],[3,2]]);
assert.equal(y[0],0); assert.equal(y[3],2);
for (const [a,b,rise] of edges) assert.ok(Math.abs(y[a]-y[b]) <= rise + 1e-8);
assert.throws(() => gradeEnvelope([0,8],[[0,1,1]],[[0,0],[1,8]]), /cannot connect/);
console.log('Shared road profiles respect pinned junctions and every edge grade.');
