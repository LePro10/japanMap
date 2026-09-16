import assert from 'node:assert/strict';
import { Scene, Matrix4, InstancedMesh } from 'three';
import { DebrisFx } from '../../src/game/DebrisFx.ts';

function yAt(mesh: InstancedMesh, slot: number, matrix: Matrix4): number {
  mesh.getMatrixAt(slot, matrix);
  return matrix.elements[13]!;
}

// Expiring a lower slot while a newer slot lives must remove its geometry.
const fx = new DebrisFx();
fx.attach({scene:new Scene()} as never);
fx.show();
fx.burst({kind:'rail',id:0,x:0,y:0,z:0,vx:10,vz:0});
for(let i=0;i<220;i++) fx.update(0.05);
fx.burst({kind:'rail',id:1,x:20,y:0,z:0,vx:10,vz:0});
for(let i=0;i<18;i++) fx.update(0.05);
const mesh=fx.group.children[0] as InstancedMesh;
const matrix=new Matrix4(); mesh.getMatrixAt(0,matrix);
assert.equal(matrix.determinant(),0,'expired lower debris slot is still visible');
assert.ok(fx.live>0,'new burst should still be alive');
for(let i=0;i<220;i++) fx.update(0.05);
assert.equal(fx.live,0);
assert.equal(mesh.count,0);
assert.equal(fx.group.visible,false);

// Rails must settle on the spawn ground, not hover at bumper height.
fx.burst({kind:'rail',id:4,x:0,y:2,z:0,vx:14,vz:0});
let railMax = -1;
for (let slot = 0; slot < mesh.count; slot++) {
  const y = yAt(mesh, slot, matrix);
  if (matrix.determinant() !== 0 && y > railMax) railMax = y;
}
assert.ok(railMax > 2.3, 'rail planks should start at band height');
for (let i = 0; i < 50; i++) fx.update(0.05);
let railCeil = 0;
for (let slot = 0; slot < mesh.count; slot++) {
  const y = yAt(mesh, slot, matrix);
  if (matrix.determinant() === 0) continue;
  if (y > railCeil) railCeil = y;
}
assert.ok(railCeil < 2.55, `rail debris still floating at ${railCeil.toFixed(2)} m`);
fx.reset();

fx.burst({kind:'tree',id:2,x:30,y:4,z:0,vx:12,vz:0,height:6,radius:0.25});
let treeMax = -1;
for (let slot = 0; slot < mesh.count; slot++) {
  const y = yAt(mesh, slot, matrix);
  if (matrix.determinant() !== 0 && y > treeMax) treeMax = y;
}
assert.ok(treeMax > 8, 'tree burst must start as a standing trunk+crown, not a pile of cubes');
for (let i = 0; i < 80; i++) fx.update(0.05);
let treeCeil = 0;
let treeFloor = 99;
for (let slot = 0; slot < mesh.count; slot++) {
  const y = yAt(mesh, slot, matrix);
  if (matrix.determinant() === 0) continue;
  if (y > treeCeil) treeCeil = y;
  if (y < treeFloor) treeFloor = y;
}
assert.ok(treeFloor >= 3.9, 'tree debris fell through the ground');
assert.ok(treeCeil < 6.4, `tree still standing as blocks at ${treeCeil.toFixed(2)} m`);
fx.reset();

fx.burst({kind:'cone',id:3,x:60,y:0,z:0,vx:10,vz:0});
fx.update(0.05);
for(let slot=0;slot<mesh.count;slot++) {
 mesh.getMatrixAt(slot,matrix);
 assert.ok(matrix.determinant()===0 || matrix.elements[12]!>59,
  'reset resurrected fragments from an earlier burst');
}
fx.dispose();
console.log('Debris slot lifetime, ground rest and tree topple passed.');
