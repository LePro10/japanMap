import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { CITY_GROUND_Y } from '@/config/city.config';
import { SettlementKit } from '../settlements/SettlementKit';
import type { CityCollider } from './CityGenerator';

/** Authored road paint and street signals around the retained 42 m crossing. */
export function buildCityCrossing() {
  const group=new Group();group.name='Crosslight Crossing';
  const colliders:CityCollider[]=[];
  const paint=new SettlementKit(),street=new SettlementKit(),lights=new SettlementKit();
  const ground=CITY_GROUND_Y+.025, white=0xd3d7ca;
  // 42 m scramble: diagonals in the square, axis zebra on the four mouths
  // just outside Crosslight (z 111–129) × Lantern (x 613–627).
  for(const a of [Math.PI/4,-Math.PI/4])for(let i=-14;i<=14;i++){
    if(Math.abs(i)<3)continue; // Leave the shared centre clear instead of overlapping both patterns.
    const d=i*1.25;
    paint.box(620+Math.sin(a)*d,ground,120+Math.cos(a)*d,4.1,.012,.58,white,0,a);
  }
  for(const z of [108.5,131.5])for(let i=0;i<13;i++)paint.box(613+i*1.1,ground,z,.56,.012,3.5,white);
  for(const x of [610.5,629.5])for(let i=0;i<13;i++)paint.box(x,ground,111+i*1.5,3.5,.012,.56,white);
  // Poles on the four plaza corners, clear of the mart door at (644, 141).
  for(const p of [{x:600,z:100,a:Math.PI/2},{x:640,z:100,a:0},{x:600,z:140,a:Math.PI},{x:634,z:134,a:-Math.PI/2}]){
    street.cylinder(p.x,CITY_GROUND_Y+3.1,p.z,.085,6.2,0x263a43);
    colliders.push({minX:p.x-.09,maxX:p.x+.09,minZ:p.z-.09,maxZ:p.z+.09,bottom:CITY_GROUND_Y,top:CITY_GROUND_Y+6.2});
    street.box(p.x,CITY_GROUND_Y+5.9,p.z,2.7,.09,.12,0x263a43,0,p.a);
    street.box(p.x,CITY_GROUND_Y+5.55,p.z,1.45,.4,.4,0x15272f,0,p.a);
    for(let i=0;i<3;i++){
      const offset=(i-1)*.43;
      lights.ball(p.x+Math.cos(p.a)*offset+Math.sin(p.a)*.21,CITY_GROUND_Y+5.55,p.z-Math.sin(p.a)*offset+Math.cos(p.a)*.21,.11,i===0?0x96e6bd:0x39434a);
    }
    street.box(p.x,CITY_GROUND_Y+2.5,p.z,.42,.62,.35,0x25363e);
    lights.box(p.x,CITY_GROUND_Y+2.52,p.z+.18,.15,.25,.02,0xeabb82);
  }
  const surface=new MeshStandardMaterial({vertexColors:true,roughness:.56});
  const emission=new MeshBasicMaterial({vertexColors:true,toneMapped:false});
  paint.finish(group,surface,'Diagonal crossings');street.finish(group,surface,'Street signals');
  group.add(new Mesh(lights.geometry(),emission));
  return {group,colliders,dispose:()=>{group.removeFromParent();group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});surface.dispose();emission.dispose();}};
}
