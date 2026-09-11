import assert from 'node:assert/strict';
import { SmashField } from '../../src/game/SmashField.ts';

const field=new SmashField([{id:0,kind:'crate',x:0,y:0,z:0,radius:0.7}]);
const events=[];
const car={x:0,y:0.8,z:8,previousX:0,previousZ:-8,vx:0,vz:40,radius:1};
field.step(1/60,car,e=>events.push(e),()=>false);
assert.equal(events.length,1,'swept high-speed impact must not tunnel through crate');
assert.equal(field.props[0].alive,false);
assert.ok(car.vz>=39,'light props must not erase momentum');
field.step(1/60,car,e=>events.push(e),()=>false);
assert.equal(events.length,1,'destroyed prop must not repeatedly hit');
for(let i=0;i<1800;i++) field.step(1/60,{...car,x:121,previousX:121,z:0,previousZ:0},()=>{},()=>true);
assert.equal(field.props[0].alive,false,'visible prop must never restore');
for(let i=0;i<1201;i++) field.step(1/60,{...car,x:121,previousX:121,z:0,previousZ:0},()=>{},()=>false);
assert.equal(field.props[0].alive,true,'unseen distant props restore after 20 seconds');
field.step(1/60,{...car,y:12},()=>assert.fail('car on overpass must not hit crate below'),()=>false);
assert.equal(field.props[0].alive,true);
console.log('Smashables: swept impact, momentum, one-shot state, safe restoration and vertical separation passed.');
