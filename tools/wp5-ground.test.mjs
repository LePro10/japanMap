import assert from 'node:assert/strict';
import { RoadGround } from '../src/game/RoadGround.ts';
import { LocalSurfaces } from '../src/world/settlements/LocalSurfaces.ts';
const floor = new LocalSurfaces();
floor.quad([-1250, 28, 400], [-1240, 28, 400], [-1240, 28, 420], [-1250, 28, 420]);
const ground = new RoadGround();
ground.setSources({getHeightAt:()=>20, getNormalAt:(_x,_z,v)=>v.set(0,1,0)}, null,
  {ready:true, at:()=>({depth:3,surfaceY:23,kind:'fluss'})}, null);
ground.localSurfaces=floor;
assert.equal(ground.waterDepth(-1245,410),0,'River beneath the lane cannot drag the car');
assert.equal(ground.waterDepth(-1230,410),3,'River outside the lane remains water');
assert.equal(ground.surface(-1245,410),'kies');
assert.equal(ground.height(-1245,410),28);
console.log('WP5 raised lane stays dry; river outside stays intact.');
