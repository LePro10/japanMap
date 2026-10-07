import assert from 'node:assert/strict';
import { facadeFrame, streetDetailRanges, cityDistrictAt } from '../src/world/city/CityStreetLayout.ts';

const body = {minX:10,maxX:30,minZ:40,maxZ:50,baseY:3,height:20,family:2,front:'pz' as const};
for (const front of ['px','nx','pz','nz'] as const) {
  const f=facadeFrame({...body,front});
  const [x,y,z]=f.point(0,2,0);
  assert.equal(y,5);
  assert.ok(x>=10 && x<=30 && z>=40 && z<=50);
  const p=f.point(0,2,2);
  assert.equal(Math.round(Math.hypot(p[0]-x,p[2]-z)),2);
  assert.ok(p[0]<10 || p[0]>30 || p[2]<40 || p[2]>50,'outward must be outside footprint');
}
for(const tier of ['ultra','high','medium','low','minimal','custom'] as const){
  const r=streetDetailRanges(tier);
  assert.ok(r.essential>=140,'nearby solid furniture cannot disappear');
  assert.ok(r.detail>=30 && r.detail<=r.essential);
}
assert.ok(streetDetailRanges('ultra').detail>streetDetailRanges('minimal').detail);
assert.equal(cityDistrictAt(620,120).name,'Old Neon');
assert.equal(cityDistrictAt(1200,-300).name,'Hill Steps');
assert.equal(cityDistrictAt(1300,300).name,'East Lantern');
assert.equal(cityDistrictAt(470,650).name,'South Market');
assert.equal(cityDistrictAt(200,250).name,'West Works');
console.log('Street layout: all facade orientations, detail ranges and five districts pass.');
