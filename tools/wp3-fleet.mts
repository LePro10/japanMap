import assert from 'node:assert/strict';
import { VEHICLES, VEHICLE_ORDER } from '../src/config/vehicles.config.ts';
import { ARCADE } from '../src/config/arcade.config.ts';
import { createCarBody,createCarWheel } from '../src/game/carMesh.ts';
import { Mesh,MeshBasicMaterial,Raycaster,Vector3 } from 'three';
assert.equal(VEHICLE_ORDER.length,10,'Ten playable plan cars');
const shapes=new Set();
for(const id of VEHICLE_ORDER){
 const s=VEHICLES[id],g=createCarBody(s),wheel=createCarWheel(s);
 shapes.add(s.body.shape);
 assert.ok(g.getAttribute('position').count>0);
 assert.ok((s.chassis.track+s.chassis.wheelWidth-s.body.hullWidth)/2>=.05);
 const mesh=new Mesh(g,new MeshBasicMaterial());
 for(const z of [-s.derived.cgToRear,s.derived.cgToFront]){
  const ray=new Raycaster(new Vector3(3,s.chassis.wheelRadius-s.chassis.cgHeight,z),new Vector3(-1,0,0));
  const hits=ray.intersectObject(mesh);
  assert.ok(hits.every(h=>h.point.x<s.chassis.track/2-s.chassis.wheelWidth/2),`${id}: actual wheel opening must not be filled by body triangles`);
 }
 const triangles=g.index.count/3+wheel.index.count/3*4;
 assert.ok(triangles<10000,`${id} Low mesh budget (${triangles})`);
 assert.ok(ARCADE[id]);g.dispose();wheel.dispose();mesh.material.dispose();
}
assert.equal(shapes.size,10,'Ten silhouette families');
assert.ok(ARCADE.truck.latG*1.08<ARCADE.gt.latG,'Sport pickup remains below stock track grip');
console.log('WP3 ten meshes, actual wheel openings and Low geometry budget passed');
