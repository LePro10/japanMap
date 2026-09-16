import type { QualityKey } from '@/config/quality.config';
import { CITY_EXPERIENCE } from '@/config/cityExperience.config';

export interface StreetBuilding {
  minX:number; maxX:number; minZ:number; maxZ:number; baseY:number; height:number;
  family:number; front:'px'|'nx'|'pz'|'nz'; shopInset?:number;
}
/** Local X follows the shopfront, local Z points into the street. */
export function facadeFrame(b:StreetBuilding) {
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
  const id=x>=400&&x<=1000&&z>=-180&&z<=420?0:z< -180?1:x>1000?2:z>420?3:4;
  return CITY_EXPERIENCE.districts[id]!;
}
