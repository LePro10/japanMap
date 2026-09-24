import type { QualityKey } from '@/config/quality.config';
import { DISTRICTS } from '@/config/tokyoLayout.mjs';
import { CITY_EXPERIENCE } from '@/config/cityExperience.config';

export interface StreetBuilding {
  minX:number; maxX:number; minZ:number; maxZ:number; baseY:number; height:number;
  family:number; front:'px'|'nx'|'pz'|'nz'; shopInset?:number;
  /** Neo-Tokio v2: gedrehtes Haus — dann gelten yaw/cx/cz/w/d statt front und Hülle. */
  yaw?:number; cx?:number; cz?:number; w?:number; d?:number;
}
/** Local X follows the shopfront, local Z points into the street. */
export function facadeFrame(b:StreetBuilding) {
  if(b.yaw!==undefined&&b.cx!==undefined&&b.cz!==undefined&&b.w!==undefined&&b.d!==undefined){
    const yaw=b.yaw,nx=Math.sin(yaw),nz=Math.cos(yaw),tx=Math.cos(yaw),tz=-Math.sin(yaw),cx=b.cx,cz=b.cz,half=b.d/2;
    return {yaw,span:b.w,nx,nz,point:(u:number,y:number,out:number):[number,number,number]=>
      [cx+nx*(half+out)+tx*u,b.baseY+y,cz+nz*(half+out)+tz*u]};
  }
  const yaw = b.front==='px'?Math.PI/2:b.front==='nx'?-Math.PI/2:b.front==='nz'?Math.PI:0;
  const nx=Math.sin(yaw),nz=Math.cos(yaw),tx=Math.cos(yaw),tz=-Math.sin(yaw);
  const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
  const alongX=b.front==='pz'||b.front==='nz';
  const span=alongX?b.maxX-b.minX:b.maxZ-b.minZ;
  const half=(alongX?b.maxZ-b.minZ:b.maxX-b.minX)/2;
  return {yaw,span,nx,nz,point:(u:number,y:number,out:number):[number,number,number]=>
    [cx+nx*(half+out)+tx*u,b.baseY+y,cz+nz*(half+out)+tz*u]};
}
export function streetDetailRanges(quality:QualityKey) { return CITY_EXPERIENCE.ranges[quality]; }
export function cityDistrictAt(x:number,z:number) {
  for(const d of DISTRICTS)if(x>=d.minX&&x<d.maxX&&z>=d.minZ&&z<d.maxZ)return CITY_EXPERIENCE.districts[d.id as keyof typeof CITY_EXPERIENCE.districts]??CITY_EXPERIENCE.districts.outskirts;
  return CITY_EXPERIENCE.districts.outskirts;
}
