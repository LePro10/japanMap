import { inUrbanEnvelope } from './wp6-layout.mjs';

/** Kleine, an die Straße gebundene Terrassen statt einer Ebene über dem Hang. */
export function planUrbanParcels(roads, terrain) {
  const lots = [], cells = new Map(), segments = new Map();
  const key = (x,z) => `${Math.floor(x/64)},${Math.floor(z/64)}`;
  for (const r of roads) for (let i=0;i<r.centerline.length-3;i+=3) {
    const l=r.centerline, s={ax:l[i],az:l[i+2],bx:l[i+3],bz:l[i+5],half:r.widths[i/3]/2};
    for(let x=Math.floor((Math.min(s.ax,s.bx)-48)/64);x<=Math.floor((Math.max(s.ax,s.bx)+48)/64);x++)
      for(let z=Math.floor((Math.min(s.az,s.bz)-48)/64);z<=Math.floor((Math.max(s.az,s.bz)+48)/64);z++) {
        const k=`${x},${z}`, a=segments.get(k); if(a)a.push(s);else segments.set(k,[s]);
      }
  }
  const onRoad=(x,z)=> (segments.get(key(x,z))??[]).some(s=>{
    const dx=s.bx-s.ax,dz=s.bz-s.az,t=Math.max(0,Math.min(1,((x-s.ax)*dx+(z-s.az)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(x-s.ax-t*dx,z-s.az-t*dz)<s.half+3;
  });
  for(const road of roads.filter(r=>r.tags.includes('urban')||r.id==='ring')) {
    let arc=0,next=24; const l=road.centerline;
    for(let i=3;i<l.length;i+=3) {
      const x=l[i],z=l[i+2],dx=x-l[i-3],dz=z-l[i-1],d=Math.hypot(dx,dz);
      arc+=d;if(arc<next||d<.01)continue;next=arc+35;
      for(const side of [-1,1]) {
        const offset=road.widths[i/3]/2+22,cx=x-dz/d*offset*side,cz=z+dx/d*offset*side;
        const lot={minX:cx-15,maxX:cx+15,minZ:cz-14,maxZ:cz+14};
        if(cx>410&&cx<830&&cz>-90&&cz<330)continue;
        const probes=[]; for(const px of [lot.minX,cx,lot.maxX])for(const pz of [lot.minZ,cz,lot.maxZ])probes.push([px,pz]);
        if(probes.some(([px,pz])=>!inUrbanEnvelope(px,pz)||onRoad(px,pz)))continue;
        if((cells.get(key(cx,cz))??[]).some(p=>p.minX<lot.maxX+2&&p.maxX>lot.minX-2&&p.minZ<lot.maxZ+2&&p.maxZ>lot.minZ-2))continue;
        const ground=probes.map(([px,pz])=>terrain.at(px,pz)),low=Math.min(...ground),high=Math.max(...ground),top=l[i+1]+.21;
        if(low<5||top-low>4||high-top>6||high-low>7)continue;
        Object.assign(lot,{bottom:Math.min(low-.5,top-1.2),top,roadY:l[i+1]+.06,group:`${Math.floor(cx/160)},${Math.floor(cz/160)}`});lots.push(lot);
        for(let gx=Math.floor((lot.minX-32)/64);gx<=Math.floor((lot.maxX+32)/64);gx++)for(let gz=Math.floor((lot.minZ-32)/64);gz<=Math.floor((lot.maxZ+32)/64);gz++){
          const k=`${gx},${gz}`,a=cells.get(k);if(a)a.push(lot);else cells.set(k,[lot]);
        }
      }
    }
  }
  return lots;
}

export function padUrbanParcels(height,res,spacing,lots,roads) {
  // Die Bank darf keine Fahrbahn überschreiben. Ein schmales Schutzraster
  // hält jede Asphaltkante frei, auch an schrägen Kreuzungen.
  const protectedRoad=new Uint8Array(res*res),half=(res-1)*spacing/2;
  for(const r of roads)for(let i=0;i<r.centerline.length;i+=3){
    const x=r.centerline[i],z=r.centerline[i+2],reach=r.widths[i/3]/2+2.5;
    for(let iz=Math.max(0,Math.floor((z-reach+half)/spacing));iz<=Math.min(res-1,Math.ceil((z+reach+half)/spacing));iz++)
      for(let ix=Math.max(0,Math.floor((x-reach+half)/spacing));ix<=Math.min(res-1,Math.ceil((x+reach+half)/spacing));ix++)
        if(Math.hypot(ix*spacing-half-x,iz*spacing-half-z)<=reach)protectedRoad[iz*res+ix]=1;
  }
  let touched=0;
  for(const p of lots){
    for(let iz=Math.max(0,Math.floor((p.minZ-10+half)/spacing));iz<=Math.min(res-1,Math.ceil((p.maxZ+10+half)/spacing));iz++)
      for(let ix=Math.max(0,Math.floor((p.minX-10+half)/spacing));ix<=Math.min(res-1,Math.ceil((p.maxX+10+half)/spacing));ix++){
        const at=iz*res+ix;if(protectedRoad[at])continue;const x=ix*spacing-half,z=iz*spacing-half;
        const distance=Math.hypot(Math.max(p.minX-x,x-p.maxX,0),Math.max(p.minZ-z,z-p.maxZ,0));
        const t=Math.max(0,1-distance/10),blend=t*t*(3-2*t);if(blend===0)continue;
        height[at]+=(p.top-.85-height[at])*blend;touched++;
      }
  }
  return touched;
}
