import type { BreakEvent } from './breakables';

export type PropKind = 'crate' | 'cone' | 'board' | 'barrel';
export interface SmashProp {
  id:number; kind:PropKind; x:number; y:number; z:number; radius:number;
}
export interface SmashCar {
  x:number; y:number; z:number; previousX:number; previousZ:number;
  vx:number; vz:number; radius:number;
}

/** Lightweight toys use swept contacts; fragments never become new roadblocks. */
export class SmashField {
  revision=0;
  readonly props: (SmashProp & {alive:boolean; unseen:number})[];
  constructor(props: readonly SmashProp[]) {
    this.props=props.map(p=>({...p,alive:true,unseen:0}));
  }
  step(dt:number,car:SmashCar,onBreak:(event:BreakEvent)=>void,visible:(prop:SmashProp)=>boolean):void {
    const dx=car.x-car.previousX,dz=car.z-car.previousZ,length2=dx*dx+dz*dz;
    // A teleport is not a smash through the entire island.
    const teleport=length2>400;
    for(const p of this.props) {
      const distance=Math.hypot(car.x-p.x,car.z-p.z);
      if(!p.alive) {
        p.unseen=distance>120 && !visible(p) ? p.unseen+dt : 0;
        if(p.unseen>=20) {p.alive=true;p.unseen=0;this.revision++;}
        continue;
      }
      if(teleport || distance>24 || Math.abs(car.y-(p.y+0.7))>1.8) continue;
      const t=length2>0 ? Math.max(0,Math.min(1,((p.x-car.previousX)*dx+(p.z-car.previousZ)*dz)/length2)) : 1;
      if(Math.hypot(car.previousX+t*dx-p.x,car.previousZ+t*dz-p.z)>car.radius+p.radius) continue;
      const speed=Math.hypot(car.vx,car.vz);
      if(speed<1.4) continue;
      p.alive=false;
      this.revision++;
      onBreak({kind:p.kind,id:p.id,x:p.x,y:p.y,z:p.z,vx:car.vx,vz:car.vz});
      const loss=p.kind==='barrel' ? 0.9 : p.kind==='cone' ? 0.15 : 0.45;
      const scale=Math.max(0,speed-loss)/speed;
      car.vx*=scale;car.vz*=scale;
    }
  }
}
