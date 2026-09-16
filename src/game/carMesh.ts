import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, TorusGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cabinLayout, cockpitEye, type CabinLayout } from '@/config/cabin.config';
import { TOUGE, type VehicleSpec } from '@/config/vehicles.config';

// Originale WP3-Codekarosserien. Ein Vertexfarben-Mesh plus vier instanzierte Räder.
const SHARED_COLORS = { tire:0x191b1e, lamp:0xf7ebc7, lampRear:0xc14c43, seat:0x1a2228, dash:0x14181c, cluster:0x9aa7b0 };
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
function cabinShell(body:BufferGeometry[],glass:BufferGeometry[],s:VehicleSpec,layout:CabinLayout):void {
 const c=s.body,w=c.hullWidth*.47,h=c.roofHeight,belt=layout.belt;
 glass.push(loft([[layout.glassRear,w,belt,belt+.09,w*.94],[layout.roofRear,w*.88,belt,h-.065,w*.83],
  [layout.roofFront,w*.86,belt,h-.065,w*.80],[layout.glassFront,w,belt,belt+.07,w*.94]],c.glass));
 body.push(loft([[layout.roofRear,w*.88,h-.07,h,w*.82],[layout.roofFront,w*.86,h-.07,h,w*.79]],c.paint));
 pair(body,.045,h-belt,.055,w*.87,(h+belt)/2,(layout.roofRear+layout.roofFront)/2,c.paint);
}
function closedBody(s:VehicleSpec):{body:BufferGeometry[];glass:BufferGeometry[]} {
 const c=s.body,ch=s.chassis,L=c.hullLength/2,w=c.hullWidth/2;
 const layout=cabinLayout(s);
 const utility=c.shape==='suv', pickup=c.shape==='truck';
 const belt=layout.belt;
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
 const body:BufferGeometry[]=[loft(sections,c.paint)];
 const glass:BufferGeometry[]=[];
 body.push(part(c.hullWidth*.63,.07,c.hullLength-.24,0,s.collision.band[0],0,c.trim));
 if(pickup){
  cabinShell(body,glass,s,layout);
  body.push(part(c.hullWidth-.10,.09,L+.18,0,.70,-L/2+.05,c.paintDark));
  pair(body,.075,.38,L+.1,w-.05,.81,-L/2+.04,c.paint);
  body.push(part(c.hullWidth,.38,.075,0,.81,-L+.04,c.paint));
 } else if(utility){
  cabinShell(body,glass,s,layout);
  pair(body,.055,.055,2.1,w*.75,c.roofHeight+.07,-.44,c.trim);
  body.push(part(.72,.53,.09,0,1.13,-L-.015,c.paintDark));
  body.push(part(c.hullWidth*.83,.09,.16,0,.50,L,c.rim));
 } else if(c.shape==='hatch'||c.shape==='rally'||c.shape==='liftback'||c.shape==='muscle'||c.shape==='supercar'||c.shape==='coupe'){
  cabinShell(body,glass,s,layout);
  if(c.shape==='rally') body.push(part(c.hullWidth*.86,.075,.23,0,c.roofHeight-.08,-L+.18,c.paintDark));
  if(c.shape==='muscle') body.push(loft([[.59,.24,belt,belt+.10,.22],[1.38,.29,belt,belt+.12,.25],[1.61,.25,belt,belt+.03,.23]],c.paintDark));
  if(c.shape==='supercar'){
   for(const side of [-1,1])body.push(loft([[-L+.24,.12,.70,.80,.10],[-.62,.10,.72,1.02,.07]],c.paint).translate(side*w*.66,0,0));
   pair(body,.055,.20,.55,w+.005,.55,-.58,c.paintDark);
   body.push(part(.9,.09,.035,0,.66,-L-.01,c.trim));
  }
 } else if(c.shape==='fastback') {
  const h=c.roofHeight;
  glass.push(loft([[-L+.24,w*.83,belt,belt+.03,w*.78],[-1.24,w*.78,belt,h-.19,w*.71],
   [-.58,w*.77,belt,h-.03,w*.70],[.12,w*.77,belt,h-.02,w*.70],[.65,w*.78,belt,h-.17,w*.71],
   [1.24,w*.83,belt,belt+.04,w*.78]],c.glass));
  body.push(loft([[-1.24,w*.70,h-.22,h-.16,w*.66],[-.58,w*.70,h-.05,h+.01,w*.66],
   [.12,w*.70,h-.04,h+.02,w*.66],[.65,w*.71,h-.19,h-.13,w*.67]],c.paint));
 }
 if(c.shape==='hatch')pair(body,.12,.42,.045,w*.83,1.01,-L,c.paintDark);
 else if(c.shape==='muscle'||c.shape==='liftback')for(const side of [-1,1])for(let i=0;i<3;i++)
  body.push(part(.16,.105,.04,side*(.28+i*.19),belt-.07,-L,SHARED_COLORS.lampRear));
 else pair(body,c.shape==='fastback'?.22:.36,.095,.05,w*.60,belt-.06,-L,SHARED_COLORS.lampRear);
 if(c.shape==='hatch')pair(body,.09,.34,.05,w*.83,1.01,-L-.026,SHARED_COLORS.lampRear);
 pair(body,c.shape==='truck'?.22:.33,c.shape==='truck'?.18:.105,.055,w*.60,belt-.10,L,SHARED_COLORS.lamp);
 if(c.shape==='coupe')body.push(part(.14,.07,.06,-w*.25,belt-.1,L+.01,SHARED_COLORS.lamp));
 pair(body,.11,.075,.17,w+.025,belt+.17,pickup?L-.50:.64,c.paintDark);
 return {body,glass};
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

function mergeNamed(parts:BufferGeometry[],name:string,cg:number):BufferGeometry {
 const merged=mergeGeometries(parts,false);for(const p of parts)p.dispose();
 if(!merged)throw new Error(`Car geometry: ${name}`);
 merged.translate(0,-cg,0);merged.computeBoundingSphere();merged.name=name;return merged;
}
function dummyGeom(name:string):BufferGeometry {
 const g=paint(new BoxGeometry(.01,.01,.01),0x000000);g.name=`Dummy:${name}`;return g;
}

export function createCarBody(s:VehicleSpec=TOUGE):BufferGeometry {
 if((s.chassis.track+s.chassis.wheelWidth-s.body.hullWidth)/2<.05)throw new Error(`Hidden wheels: ${s.id}`);
 if(s.body.shape==='openwheel') return mergeNamed(openWheel(s),`Car:${s.id}`,s.chassis.cgHeight);
 const {body,glass}=closedBody(s);
 return mergeNamed([...body,...glass],`Car:${s.id}`,s.chassis.cgHeight);
}

/**
 * Fahrermesh in Schichten. Rivals und Garage bleiben bei `createCarBody`.
 * Im Cockpit: Karosserie+Glas aus, Käfig+Lenkrad an — sonst sieht man durch den Boden.
 */
export interface CarVisuals {
 readonly body: BufferGeometry;
 readonly glass: BufferGeometry;
 readonly cabin: BufferGeometry;
 readonly helm: BufferGeometry;
}

export function createCarVisuals(s:VehicleSpec=TOUGE):CarVisuals {
 if((s.chassis.track+s.chassis.wheelWidth-s.body.hullWidth)/2<.05)throw new Error(`Hidden wheels: ${s.id}`);
 const cg=s.chassis.cgHeight;
 if(s.body.shape==='openwheel'){
  return {
   body: mergeNamed(openWheel(s),`Car:${s.id}`,cg),
   glass: dummyGeom(`Glass:${s.id}`),
   cabin: mergeNamed(cabinKit(s),`Cabin:${s.id}`,cg),
   helm: mergeNamed(helmKit(s),`Helm:${s.id}`,0),
  };
 }
 const {body,glass}=closedBody(s);
 return {
  body: mergeNamed(body,`Car:${s.id}`,cg),
  glass: glass.length?mergeNamed(glass,`Glass:${s.id}`,cg):dummyGeom(`Glass:${s.id}`),
  cabin: mergeNamed(cabinKit(s),`Cabin:${s.id}`,cg),
  helm: mergeNamed(helmKit(s),`Helm:${s.id}`,0),
 };
}

function cabinKit(s:VehicleSpec):BufferGeometry[] {
 const layout=cabinLayout(s);
 const cg=s.chassis.cgHeight;
 const c=s.body;
 const eye=cockpitEye(s);
 const ey=eye.y+cg, ez=eye.z;
 const frame=0x161a20;
 const carpet=0x1a1816;
 const out:BufferGeometry[]=[];
 const floorY=s.collision.band[0]+.02;
 // Teppich über die ganze Kabine — sonst ist die Wiese der Fußraum.
 out.push(part(1.15,.05,1.45,0,floorY+.025,ez+.05,carpet));
 if(layout.open){
  out.push(part(.42,.1,.5,0,floorY+.14,ez-.15,c.paintDark));
  return out;
 }
 // Armatur: breit, hinter dem Rad. Füllt das Loch im Kranz, damit man
 // nicht durchs Auto aufs Gras sieht.
 out.push(part(1.08,.22,.4,0,ey-.48,ez+.70,SHARED_COLORS.dash));
 out.push(part(1.0,.035,.14,0,ey-.35,ez+.62,0x1c2228));
 const gauge=paint(new CylinderGeometry(.05,.05,.028,10),0xb8c4ce);
 gauge.rotateX(Math.PI/2);out.push(gauge.clone().translate(-.07,ey-.32,ez+.64));
 out.push(gauge.translate(.07,ey-.32,ez+.64));
 pair(out,.03,.28,.035,.5,ey+.08,ez+.72,frame);
 out.push(part(1.08,.03,.035,0,ey+.24,ez+.74,frame));
 // Türen + Heck, Fußraum mit drei Pedalen (Kupplung / Bremse / Gas).
 pair(out,.05,.42,.9,.56,ey-.18,ez+.05,c.paintDark);
 out.push(part(1.1,.55,.05,0,ey-.1,ez-.62,c.paintDark));
 const pedalY=floorY+.09;
 out.push(part(.05,.11,.02,-.11,pedalY,ez+.22,0x2a2e32));
 out.push(part(.06,.13,.02,0,pedalY,ez+.22,0x2a2e32));
 out.push(part(.05,.1,.02,.11,pedalY,ez+.22,0x2a2e32));
 out.push(part(.38,.07,.36,-.22,floorY+.11,ez-.22,SHARED_COLORS.seat));
 out.push(part(.38,.38,.07,-.22,floorY+.32,ez-.36,SHARED_COLORS.seat));
 return out;
}

function helmKit(s:VehicleSpec):BufferGeometry[] {
 // 31 cm Radius wäre ein Traktor. 16 cm = 32 cm Durchmesser, realistisches Rad.
 const rim=s.body.rim, trim=s.body.trim;
 const ring=paint(new TorusGeometry(.16,.012,8,24),trim);
 const out:BufferGeometry[]=[ring];
 const cap=paint(new CylinderGeometry(.032,.032,.018,8),rim);
 cap.rotateX(Math.PI/2);out.push(cap);
 for(let i=0;i<3;i++){
  const a=i*Math.PI*2/3+Math.PI/2;
  const spoke=part(.014,.014,.13,0,0,.065,rim);
  spoke.rotateZ(a);out.push(spoke);
 }
 return out;
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
