import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { RoadGround } from '../../src/game/RoadGround.ts';
import { RoadNetwork } from '../../src/world/roads/RoadNetwork.ts';
import { buildRoadGeometry } from '../../src/world/roads/RoadMeshBuilder.ts';

for (const grade of [0, 0.15, -0.15]) {
const centerline=Array.from({length:61},(_,i)=>[-400+30*Math.sin(i/60),3+i/60*30*grade,-400+30*Math.cos(i/60)]).flat();
const road={id:'banked',type:'mountain',centerline,widths:Array(61).fill(8),banking:Array(61).fill(8),closed:false,length:30,trimStart:0,trimEnd:0,junctions:[],tags:[],nodes:[],rails:[],measured:{}};
const network=new RoadNetwork({roads:[road]} as never);
const g=new RoadGround();
g.setSources({getHeightAt:()=>3,getNormalAt:(_x:number,_z:number,v:Vector3)=>v.set(0,1,0)} as never,network,null,null);
const geometry=buildRoadGeometry(road as never).geometry;
const pos=geometry.getAttribute('position');
let worst=0;
for(let station=8;station<52;station+=4) {
  g.refresh(centerline[station*3]!,centerline[station*3+2]!,0);
  for(const lane of [1,2]) {
    const i=station*4+lane,x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const error=Math.abs(g.height(x,z)-y);worst=Math.max(worst,error);
  }
}

assert.ok(worst<0.025,`wheels and banked road differ by ${worst.toFixed(3)}m`);
const x=centerline[90]!,z=centerline[92]!;
g.refresh(x,z,0);
const n=g.normal(x,z,new Vector3());
assert.ok(Math.hypot(n.x,n.z)>0.04,'road contact normal must follow road banking');
geometry.dispose();
console.log(`Road mesh/contact agreement (grade ${grade}): max ${worst.toFixed(4)}m; banked support normal passed.`);

}

// A raised road blends back into terrain over its physical shoulder. The
// suspension needs the gradient of that surface, not the flat terrain below it.
{
  const road = { id: 'shoulder', type: 'mountain', centerline: [-500, 3.3, -600, -500, 3.3, -400],
    widths: [8, 8], banking: [0, 0], closed: false, length: 200, trimStart: 0, trimEnd: 0,
    junctions: [], tags: [], nodes: [], rails: [], measured: {} };
  const network = new RoadNetwork({ roads: [road] } as never);
  const ground = new RoadGround();
  ground.setSources({ getHeightAt: () => 3,
    getNormalAt: (_x: number, _z: number, out: Vector3) => out.set(0, 1, 0) } as never,
    network, null, null);
  ground.refresh(-500, -500, 0);
  const x = -495.75, z = -500, epsilon = .01;
  const grade = (ground.height(x + epsilon, z) - ground.height(x - epsilon, z)) / (2 * epsilon);
  const normal = ground.normal(x, z, new Vector3());
  assert.ok(Math.abs(-normal.x / normal.y - grade) < .02,
    `shoulder gradient ${grade}, reported ${-normal.x / normal.y}`);
}
