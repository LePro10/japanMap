import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, TorusGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TOUGE, type VehicleSpec } from '@/config/vehicles.config';

// Originale WP3-Codekarosserien. Ein Vertexfarben-Mesh plus vier instanzierte Räder.
const SHARED_COLORS = { tire:0x191b1e, lamp:0xf7ebc7, lampRear:0xc14c43 };
const color = new Color();
function paint(g:BufferGeometry, hex:number):BufferGeometry {
 color.setHex(hex,'srgb'); const n=g.getAttribute('position').count;
 const a=new Float32Array(n*3);
 for(let i=0;i<n;i++) a.set([color.r,color.g,color.b],i*3);
 g.setAttribute('color',new Float32BufferAttribute(a,3)); return g;
}
function part(w:number,h:number,d:number,x:number,y:number,z:number,hex:number):BufferGeometry {
 return paint(new BoxGeometry(w,h,d),hex).translate(x,y,z);
}
function pair(out:BufferGeometry[],w:number,h:number,d:number,x:number,y:number,z:number,hex:number):void {
 out.push(part(w,h,d,-x,y,z,hex),part(w,h,d,x,y,z,hex));
}
// Querschnitte [z, halbe Breite, Unterkante, Oberkante, Dachbreite].
// Bevels und echte Schrägen statt gestapelter Kästen.
type Section = readonly [number,number,number,number,number];
function loft(sections:readonly Section[],hex:number):BufferGeometry {
 const pos:number[]=[]; const idx:number[]=[];
 for(const [z,w,b,t,r] of sections) {
  pos.push(-w*.84,b,z, w*.84,b,z, w,b+.07,z, w,t-.06,z,
   r,t,z, -r,t,z, -w,t-.06,z, -w,b+.07,z);
 }
 for(let k=0;k<sections.length-1;k++) for(let j=0;j<8;j++) {
  const a=k*8+j,b=k*8+(j+1)%8,c=b+8,d=a+8;
  idx.push(a,b,d,b,c,d);
 }
 for(let j=1;j<7;j++) {idx.push(0,j+1,j);const a=(sections.length-1)*8;idx.push(a,a+j,a+j+1);}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(pos,3));g.setIndex(idx);
 g.setAttribute('uv',new Float32BufferAttribute(new Float32Array(pos.length/3*2),2));
 g.computeVertexNormals();return paint(g,hex);
}
function cabin(out:BufferGeometry[],s:VehicleSpec,rear:number,front:number,roofRear:number,roofFront:number,belt:number):void {
 const c=s.body,w=c.hullWidth*.47,h=c.roofHeight;
 out.push(loft([[rear,w,belt,belt+.09,w*.94],[roofRear,w*.88,belt,h-.065,w*.83],
  [roofFront,w*.86,belt,h-.065,w*.80],[front,w,belt,belt+.07,w*.94]],c.glass));
 out.push(loft([[roofRear,w*.88,h-.07,h,w*.82],[roofFront,w*.86,h-.07,h,w*.79]],c.paint));
 // Schmale Säulen lassen die Fensterfläche lesbar.
 pair(out,.045,h-belt,.055,w*.87,(h+belt)/2,(roofRear+roofFront)/2,c.paint);
}
function closedBody(s:VehicleSpec):BufferGeometry[] {
 const c=s.body,ch=s.chassis,L=c.hullLength/2,w=c.hullWidth/2;
 const utility=c.shape==='suv', pickup=c.shape==='truck';
 const belt=utility?1.16:pickup?.96:c.shape==='hatch'?.86:c.shape==='rally'?.88:c.shape==='supercar'?.65:.78;
 const axles=[-s.derived.cgToRear,s.derived.cgToFront];
 const zs=pickup?[-L,-L+.16,.24,.25,L-.16,L]:[-L,-L+.16,L-.16,L];
 for(const axle of axles) for(let i=0;i<=8;i++) zs.push(axle+(i/4-1)*(ch.wheelRadius+.07));
 const sections:Section[]=zs.filter(z=>z>=-L&&z<=L).sort((a,b)=>a-b).map(z=>{
  let bottom=pickup&&z<.25?.48:s.collision.band[0];
  for(const axle of axles){const d=Math.abs(z-axle),r=ch.wheelRadius+.055;
   if(d<r)bottom=Math.max(bottom,ch.wheelRadius+Math.sqrt(r*r-d*d));}
  const end=Math.abs(z)/L;
  const deck=pickup&&z<.25?.64:belt;
  const top=Math.max(bottom+.065,deck-(end>.8?(end-.8)*.42:0));
  const width=w*(c.shape==='hatch' ? 1-.16*Math.pow(end,6) : c.shape==='supercar' ? 1-.18*Math.pow(Math.max(0,z/L),3) : end>.9?.91:1);
  return [z,width,bottom,top,width*.89];
 });
 const out=[loft(sections,c.paint)];
 // Sichtbarer schmaler Unterboden; die Radausschnitte bleiben offen.
 out.push(part(c.hullWidth*.63,.07,c.hullLength-.24,0,s.collision.band[0],0,c.trim));
 if(pickup){
  cabin(out,s,.25,L-.12,.47,L-.40,belt);
  out.push(part(c.hullWidth-.10,.09,L+.18,0,.70,-L/2+.05,c.paintDark));
  pair(out,.075,.38,L+.1,w-.05,.81,-L/2+.04,c.paint);
  out.push(part(c.hullWidth,.38,.075,0,.81,-L+.04,c.paint));
 } else if(utility){
  cabin(out,s,-L+.13,.80,-L+.29,.48,belt);
  pair(out,.055,.055,2.1,w*.75,c.roofHeight+.07,-.44,c.trim);
  out.push(part(.72,.53,.09,0,1.13,-L-.015,c.paintDark));
  out.push(part(c.hullWidth*.83,.09,.16,0,.50,L,c.rim));
 } else if(c.shape==='hatch') cabin(out,s,-L+.12,.81,-L+.29,.36,belt);
 else if(c.shape==='rally'){
  cabin(out,s,-L+.16,1.02,-L+.47,.36,belt);
  out.push(part(c.hullWidth*.86,.075,.23,0,c.roofHeight-.08,-L+.18,c.paintDark));
 } else if(c.shape==='liftback') cabin(out,s,-L+.20,.94,-.92,.24,belt);
 else if(c.shape==='fastback') {
  const h=c.roofHeight;
  out.push(loft([[-L+.24,w*.83,belt,belt+.03,w*.78],[-1.24,w*.78,belt,h-.19,w*.71],
   [-.58,w*.77,belt,h-.03,w*.70],[.12,w*.77,belt,h-.02,w*.70],[.65,w*.78,belt,h-.17,w*.71],
   [1.24,w*.83,belt,belt+.04,w*.78]],c.glass));
  out.push(loft([[-1.24,w*.70,h-.22,h-.16,w*.66],[-.58,w*.70,h-.05,h+.01,w*.66],
   [.12,w*.70,h-.04,h+.02,w*.66],[.65,w*.71,h-.19,h-.13,w*.67]],c.paint));
 }
 else if(c.shape==='muscle'){
  cabin(out,s,-1.64,.53,-1.03,-.08,belt);
  out.push(loft([[.59,.24,belt,belt+.10,.22],[1.38,.29,belt,belt+.12,.25],[1.61,.25,belt,belt+.03,.23]],c.paintDark));
 } else if(c.shape==='supercar'){
  cabin(out,s,-.86,1.03,-.45,.26,belt);
  // Offene Heckstreben und seitliche Lufteinlässe.
  for(const side of [-1,1])out.push(loft([[-L+.24,.12,.70,.80,.10],[-.62,.10,.72,1.02,.07]],c.paint).translate(side*w*.66,0,0));
  pair(out,.055,.20,.55,w+.005,.55,-.58,c.paintDark);
  out.push(part(.9,.09,.035,0,.66,-L-.01,c.trim));
 } else cabin(out,s,-1.30,.94,-.86,.30,belt);
 // Jede Identität bekommt ihre eigene Leuchtensignatur.
 if(c.shape==='hatch')pair(out,.12,.42,.045,w*.83,1.01,-L,c.paintDark);
 else if(c.shape==='muscle'||c.shape==='liftback')for(const side of [-1,1])for(let i=0;i<3;i++)
  out.push(part(.16,.105,.04,side*(.28+i*.19),belt-.07,-L,SHARED_COLORS.lampRear));
 else pair(out,c.shape==='fastback'?.22:.36,.095,.05,w*.60,belt-.06,-L,SHARED_COLORS.lampRear);
 if(c.shape==='hatch')pair(out,.09,.34,.05,w*.83,1.01,-L-.026,SHARED_COLORS.lampRear);
 pair(out,c.shape==='truck'?.22:.33,c.shape==='truck'?.18:.105,.055,w*.60,belt-.10,L,SHARED_COLORS.lamp);
 if(c.shape==='coupe')out.push(part(.14,.07,.06,-w*.25,belt-.1,L+.01,SHARED_COLORS.lamp));
 pair(out,.11,.075,.17,w+.025,belt+.17,pickup?L-.50:.64,c.paintDark);
 return out;
}
function openWheel(s:VehicleSpec):BufferGeometry[] {
 const c=s.body,L=c.hullLength/2,half=s.chassis.track/2,pod=half*.68;
 const out=[loft([[-L+.12,.30,.24,.66,.18],[-.63,.37,.20,.81,.27],[.15,.34,.20,.63,.24],[L-.20,.14,.26,.39,.10]],c.paint)];
 for(const side of [-1,1]){
  out.push(loft([[-.85,.24,.20,.48,.20],[-.30,.27,.20,.53,.21],[.25,.17,.21,.36,.13]],c.paint).translate(side*pod,0,0));
  for(const axle of [-s.derived.cgToRear,s.derived.cgToFront]){
   out.push(part(half*.74,.035,.045,side*(pod-.03),.30,axle,c.trim));
   out.push(part(half*.70,.035,.045,side*(pod-.04),.46,axle-.10,c.trim));
  }
 }
 out.push(part(.39,.07,.62,0,.81,-.35,c.trim));
 out.push(part(.23,.20,.17,0,.83,-.62,c.paintDark));
 pair(out,.04,.24,.05,.22,.89,-.55,c.trim);
 out.push(part(.47,.04,.63,0,1.03,-.26,c.trim),part(.04,.24,.05,0,.90,.04,c.trim));
 out.push(part(s.chassis.track+.04,.065,.33,0,.25,L-.12,c.paintDark));
 pair(out,.05,.36,.15,.46,.66,-L+.22,c.trim);
 out.push(part(s.chassis.track-.18,.075,.35,0,.88,-L+.20,c.paint));
 out.push(part(.10,.08,.04,0,.53,-L+.04,SHARED_COLORS.lampRear));
 return out;
}
export function createCarBody(s:VehicleSpec=TOUGE):BufferGeometry {
 if((s.chassis.track+s.chassis.wheelWidth-s.body.hullWidth)/2<.05)throw new Error(`Hidden wheels: ${s.id}`);
 const parts=s.body.shape==='openwheel'?openWheel(s):closedBody(s);
 const merged=mergeGeometries(parts,false);for(const p of parts)p.dispose();
 if(!merged)throw new Error(`Car geometry: ${s.id}`);
 merged.translate(0,-s.chassis.cgHeight,0);merged.computeBoundingSphere();merged.name=`Car:${s.id}`;return merged;
}
export function createCarWheel(spec:VehicleSpec=TOUGE):BufferGeometry {
 const {wheelRadius:r,wheelWidth:w}=spec.chassis;
 const segments=20;
 const tire=paint(new CylinderGeometry(r,r,w,segments),SHARED_COLORS.tire);
 tire.rotateZ(Math.PI/2);
 const parts=[tire];
 const steel=spec.id==='pip'||spec.id==='truck';
 const spokes=spec.id==='touge'||spec.id==='morrow'?5:spec.id==='ribbon'||spec.id==='offroad'?6:spec.id==='torrent'?10:spec.id==='gt'?12:7;
 for(const side of [-1,1]){
  const x=side*(w/2+.006);
  const ring=paint(new TorusGeometry(r*.67,r*.045,4,segments),spec.body.rim);
  ring.rotateY(Math.PI/2).translate(x,0,0);parts.push(ring);
  const hub=paint(new CylinderGeometry(r*.16,r*.16,.025,8),spec.body.rim);
  hub.rotateZ(Math.PI/2).translate(x,0,0);parts.push(hub);
  if(steel||spec.id==='needle'){
   const disc=paint(new CylinderGeometry(r*.59,r*.59,.013,segments),spec.body.rim);
   disc.rotateZ(Math.PI/2).translate(x,0,0);parts.push(disc);
   if(steel)for(let i=0;i<6;i++){
    const angle=i*Math.PI/3;
    const hole=paint(new CylinderGeometry(r*.085,r*.085,.015,6),SHARED_COLORS.tire);
    hole.rotateZ(Math.PI/2).translate(x+side*.01,Math.sin(angle)*r*.43,Math.cos(angle)*r*.43);parts.push(hole);
   }
  }else for(let i=0;i<spokes;i++){
   const angle=i*Math.PI*2/spokes;
   const spoke=part(.022,r*.57,r*(spec.id==='morrow'?.15:.07),0,r*.36,0,spec.body.rim);
   spoke.rotateX(angle+(spec.id==='meridian'?.2:0)).translate(x,0,0);parts.push(spoke);
  }
 }
 const merged=mergeGeometries(parts,false);for(const p of parts)p.dispose();
 if(!merged)throw new Error(`Wheel geometry: ${spec.id}`);
 merged.computeBoundingSphere();merged.name=`Wheel:${spec.id}`;return merged;
}
