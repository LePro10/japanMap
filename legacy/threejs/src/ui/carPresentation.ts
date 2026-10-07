import { VEHICLES, VEHICLE_ORDER, type VehicleId } from '@/config/vehicles.config';
import { createCarBody } from '@/game/carMesh';
import { Color } from 'three';

export const CAR_COPY = Object.fromEntries(VEHICLE_ORDER.map(id => {
 const s=VEHICLES[id];
 return [id,{name:s.name,role:s.blurb,color:`#${s.body.paint.toString(16).padStart(6,'0')}`}];
})) as Record<VehicleId,{name:string;role:string;color:string}>;
const portraits = new Map<VehicleId,string>();
/** Katalog nutzt dieselben Karosserie-Dreiecke wie die Spielwelt, ohne weiteren Renderer. */
export function carPortrait(id:VehicleId):string {
 const cached=portraits.get(id); if(cached)return cached;
 const s=VEHICLES[id],g=createCarBody(s),p=g.getAttribute('position'),c=g.getAttribute('color'),idx=g.index!;
 const faces:{depth:number;svg:string}[]=[];
 const color=new Color();
 for(let i=0;i<idx.count;i+=3){
  const a=idx.getX(i),b=idx.getX(i+1),d=idx.getX(i+2);
  const verts=[a,b,d];
  const points=verts.map(v=>`${(230+p.getZ(v)*72).toFixed(1)},${(167-(p.getY(v)+s.chassis.cgHeight)*72).toFixed(1)}`).join(' ');
  color.setRGB(c.getX(a),c.getY(a),c.getZ(a),'srgb-linear');
  faces.push({depth:verts.reduce((sum,v)=>sum+p.getX(v),0),svg:`<polygon points="${points}" fill="#${color.getHexString('srgb')}"/>`});
 }
 faces.sort((a,b)=>a.depth-b.depth);
 const wheels=[-s.derived.cgToRear,s.derived.cgToFront].map(z=>`<circle cx="${230+z*72}" cy="${167-s.chassis.wheelRadius*72}" r="${s.chassis.wheelRadius*72}" fill="#151a20" stroke="#58616b" stroke-width="2"/><circle cx="${230+z*72}" cy="${167-s.chassis.wheelRadius*72}" r="${s.chassis.wheelRadius*40}" fill="#b8c2c9"/>`).join('');
 const result=`<svg viewBox="0 0 460 195" role="img" aria-label="${s.name} side profile"><ellipse cx="230" cy="171" rx="180" ry="9" fill="#090e14"/>${faces.map(f=>f.svg).join('')}${wheels}</svg>`;
 g.dispose();portraits.set(id,result);return result;
}
