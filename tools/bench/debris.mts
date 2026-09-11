import assert from 'node:assert/strict';
import { Scene, Matrix4, InstancedMesh } from 'three';
import { DebrisFx } from '../../src/game/DebrisFx.ts';

// Expiring a lower slot while a newer slot lives must remove its geometry.
const fx = new DebrisFx();
fx.attach({scene:new Scene()} as never);
fx.show();
fx.burst({kind:'rail',id:0,x:0,y:0,z:0,vx:10,vz:0});
for(let i=0;i<94;i++) fx.update(0.05);
fx.burst({kind:'rail',id:1,x:20,y:0,z:0,vx:10,vz:0});
for(let i=0;i<18;i++) fx.update(0.05);
const mesh=fx.group.children[0] as InstancedMesh;
const matrix=new Matrix4(); mesh.getMatrixAt(0,matrix);
assert.equal(matrix.determinant(),0,'expired lower debris slot is still visible');
assert.ok(fx.live>0,'new burst should still be alive');
for(let i=0;i<180;i++) fx.update(0.05);
assert.equal(fx.live,0);
assert.equal(mesh.count,0);
assert.equal(fx.group.visible,false);
fx.burst({kind:'tree',id:2,x:30,y:0,z:0,vx:10,vz:0});
fx.update(0.05);
fx.reset();
fx.burst({kind:'cone',id:3,x:60,y:0,z:0,vx:10,vz:0});
fx.update(0.05);
for(let slot=0;slot<mesh.count;slot++) {
 mesh.getMatrixAt(slot,matrix);
 assert.ok(matrix.determinant()===0 || matrix.elements[12]!>59,
  'reset resurrected fragments from an earlier burst');
}
fx.dispose();
console.log('Debris slot lifetime and cleanup passed.');
