import { BufferGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { QualityKey } from '@/config/quality.config';
import { CITY_EXPERIENCE as C } from '@/config/cityExperience.config';
import type { CityCollider } from './CityGenerator';
import { SettlementKit } from '../settlements/SettlementKit';
import { buildCityGraphicAtlas } from './CityGraphicAtlas';
import { facadeFrame, cityDistrictAt, streetDetailRanges, type StreetBuilding } from './CityStreetLayout';

interface StreetCell { x:number;z:number;essential:Group;detail:Group }
interface CellBuild extends StreetCell { base: SettlementKit;trim:SettlementKit;glow:SettlementKit;panels:BufferGeometry[] }

/** Nearby street furniture is spatially batched. The same solid objects exist on every preset. */
export class CityStreetDress {
  readonly group=new Group();
  readonly colliders:CityCollider[]=[];
  readonly atlas=buildCityGraphicAtlas();
  readonly cells:StreetCell[]=[];
  readonly #solid=new MeshStandardMaterial({vertexColors:true,roughness:.77,metalness:.12});
  readonly #light=new MeshBasicMaterial({vertexColors:true,toneMapped:false});
  readonly #sign=new MeshBasicMaterial({map:this.atlas,toneMapped:false});

  constructor(buildings:readonly StreetBuilding[],isRoad:(x:number,z:number)=>boolean){
    this.group.name='Neon Basin streets';
    const cells=new Map<string,CellBuild>();
    const cellAt=(x:number,z:number):CellBuild=>{
      const gx=Math.floor(x/C.cellSize),gz=Math.floor(z/C.cellSize),key=`${gx},${gz}`;
      let cell=cells.get(key);if(cell)return cell;
      cell={x:(gx+.5)*C.cellSize,z:(gz+.5)*C.cellSize,essential:new Group(),detail:new Group(),base:new SettlementKit(),trim:new SettlementKit(),glow:new SettlementKit(),panels:[]};
      cell.essential.name=`Street ${key}`;cell.detail.name=`Fine detail ${key}`;
      this.group.add(cell.essential,cell.detail);cells.set(key,cell);return cell;
    };
    buildings.forEach((b,index)=>{
      const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
      const cell=cellAt(cx,cz),f=facadeFrame(b),district=cityDistrictAt(cx,cz);
      const commercial=b.family===0||b.family===1||b.family===2||b.family===4||b.family===7;
      const inset=b.shopInset??(commercial?.55:.2);
      const box=(kit:SettlementKit,u:number,y:number,out:number,w:number,h:number,d:number,color:number)=>{
        const p=f.point(u,y,out);kit.box(...p,w,h,d,color,0,f.yaw);
      };
      const panel=(u:number,y:number,out:number,w:number,h:number,tile:number)=>{
        const p=f.point(u,y,out);this.#panel(cell.panels,p,w,h,f.yaw,tile);
      };
      // Wide shop identities, window displays and a physically deep frame at the actual recessed wall.
      const modules=Math.max(1,Math.floor((f.span-1)/7));
      const moduleWidth=(f.span-1)/modules;
      for(let m=0;m<modules;m++){
        const u=-f.span/2+.5+moduleWidth*(m+.5),w=moduleWidth-.3,tile=(index+m*5)%16;
        if(commercial){
          box(cell.base,u,3.39,-inset+.08,w,.65,.18,C.palette.metal);
          panel(u,3.39,-inset+.18,w-.16,.52,tile);
          panel(u,1.78,-inset+.025,w-.36,2.05,16+(index+m)%8);
          for(const side of [-1,1])box(cell.base,u+side*(w/2-.07),1.7,-inset+.09,.12,2.65,.15,C.palette.metal);
          box(cell.base,u,.38,-inset+.06,w,.3,.2,b.family===2?C.palette.wood:C.palette.stone);
          // Lit soffit and timber slats create a pool of detail around warm entrances.
          box(cell.glow,u,3.03,-inset+.22,w*.75,.035,.08,0xe9c38e);
          if(b.family===2||index%5===0){
            box(cell.base,u,2.94,.12,w,.10,1.1,district.color);
            for(let j=0;j<6;j++)box(cell.trim,u-w/2+j*w/6,2.92,.1,.035,.13,1.15,C.palette.cream);
            for(const side of [-1,1]){
              const p=f.point(u+side*w*.33,2.51,.35);
              cell.glow.add(new CylinderGeometry(.2,.24,.48,10),0xffb970,...p);
              cell.trim.cylinder(p[0],p[1]+.3,p[2],.026,.15,C.palette.metal);
              for(const sy of [-1,1])cell.trim.cylinder(p[0],p[1]+sy*.23,p[2],.21,.035,C.palette.wood);
            }
          }
        }else{
          // Letterboxes, recessed vestibule canopy and door handles make residential entries distinct.
          box(cell.base,u,1.13,-inset+.06,1.5,2.26,.15,0x243133);
          box(cell.base,u,2.4,.05,2.1,.13,.95,C.palette.stone);
          box(cell.glow,u,2.32,.08,1.1,.03,.10,C.palette.warm);
          box(cell.trim,u+.51,1.05,-inset+.19,.035,.35,.035,0xd4c9a9);
          for(let j=0;j<3;j++)box(cell.trim,u-.6+j*.23,1.35,-inset+.21,.19,.14,.07,0xa6a5a0);
        }
      }
      // Attach projecting signs to a bracket, never as unconnected luminous rectangles.
      if(commercial&&f.span>8){
        const u=-f.span/2+.6;
        box(cell.base,u,5.9,.46,.14,3.9,1.1,C.palette.metal);
        panel(u,6,.99,1.0,3.4,(index+3)%16);
        box(cell.trim,u,7.9,.46,.18,.12,1.2,0x56636b);
      }
      // Rooftop equipment and service pipes are secondary detail, independent of playable structure.
      const roof=b.baseY+b.height;
      cell.trim.box(cx,roof+.45,cz,Math.min(3,(b.maxX-b.minX)*.25),.9,1.8,0x87908f);
      for(let j=0;j<4;j++)cell.trim.box(cx-.8+j*.48,roof+.93,cz,.07,.035,1.35,0x354145);
      const pipe=f.point(f.span/2-.27,b.height*.48,-.05);
      cell.trim.cylinder(pipe[0],pipe[1],pipe[2],.045,b.height*.92,0x607174);
      if(b.height>11){
        const ac=f.point(f.span*.3,4.85,.32);
        cell.trim.box(...ac,1.1,.62,.6,0xa2a7a1,0,f.yaw);
        for(let j=0;j<5;j++)box(cell.trim,f.span*.3,4.62+j*.095,.635,.92,.032,.022,0x46555b);
      }
      // A few carefully placed solid objects; conservative road clearance leaves walking lanes open.
      const u=f.span/2-.8,p=f.point(u,.65,.65);
      if(!isRoad(p[0],p[2])&&index%3===0){
        cell.base.box(p[0],b.baseY+.3,p[2],.65,.6,.65,0x595b4d);
        cell.base.ball(p[0],b.baseY+.91,p[2],.55,index%2?0x547454:0x667946);
        this.colliders.push({minX:p[0]-.34,maxX:p[0]+.34,minZ:p[2]-.34,maxZ:p[2]+.34,bottom:b.baseY,top:b.baseY+1.4});
      }
      if(commercial&&index%7===0){
        const v=f.point(-f.span/2+1.1,1,.64);
        if(!isRoad(v[0],v[2])){
          cell.base.box(...v,.85,2,.72,0xbcd0c9,0,f.yaw);
          panel(-f.span/2+1.1,1.25,1.015,.7,1.13,16+index%8);
          box(cell.base,-f.span/2+1.1,.35,1.025,.52,.18,.04,0x14262c);
          this.colliders.push({minX:v[0]-.56,maxX:v[0]+.56,minZ:v[2]-.56,maxZ:v[2]+.56,bottom:b.baseY,top:b.baseY+2});
        }
      }
      if(index%3===0){
        const a=f.point(-f.span/2,6.1,1),d=f.point(f.span/2,6.1,1);
        for(let cable=0;cable<3;cable++)for(let j=0;j<7;j++){
          const t=j/7,s=(j+1)/7;
          const sample=(v:number):[number,number,number]=>[a[0]+(d[0]-a[0])*v,a[1]-.65*Math.sin(v*Math.PI)+cable*.11,a[2]+(d[2]-a[2])*v];
          this.#beam(cell.trim,sample(t),sample(s),.018,0x19242b);
        }
        const pole=f.point(-f.span/2,3.2,.9);
        if(!isRoad(pole[0],pole[2])){
          cell.base.cylinder(...pole,.10,6.4,0x677272);
          this.colliders.push({minX:pole[0]-.1,maxX:pole[0]+.1,minZ:pole[2]-.1,maxZ:pole[2]+.1,bottom:b.baseY,top:b.baseY+6.4});
          box(cell.trim,-f.span/2,5.8,.9,1.2,.1,.12,0x34464b);
        }
      }
      // Street trees in outer districts frame vistas without filling every lane with props.
      if(index%9===0&&cx>850){
        const t=f.point(f.span/2+1.3,0,1.1);
        if(!isRoad(t[0],t[2])){
          cell.base.cylinder(t[0],b.baseY+1.8,t[2],.15,3.6,0x5e5249);
          for(let j=0;j<3;j++)cell.base.ball(t[0]+(j-1)*.7,b.baseY+3.8+(.3-j*.15),t[2],1.3,cityDistrictAt(cx,cz).name==='Hill Steps'?0xa36a55:0x64775b);
          this.colliders.push({minX:t[0]-.2,maxX:t[0]+.2,minZ:t[2]-.2,maxZ:t[2]+.2,bottom:b.baseY,top:b.baseY+3.5});
        }
      }
    });
    // The crossing gets a deliberately composed advertising skyline, with fully modelled supports.
    const center=cellAt(620,120);
    for(const ad of [
      {x:606,y:48,z:111.35,w:12,h:7,yaw:0,tile:24},
      {x:637,y:61,z:115.4,w:15,h:7,yaw:0,tile:25},
      {x:606,y:42,z:128.6,w:13,h:5,yaw:Math.PI,tile:26},
    ]){
      center.base.box(ad.x,ad.y,ad.z,ad.w+.4,ad.h+.4,.45,0x1e2c37,0,ad.yaw);
      this.#panel(center.panels,[ad.x,ad.y,ad.z+Math.cos(ad.yaw)*.24],ad.w,ad.h,ad.yaw,ad.tile);
      for(const dx of [-ad.w*.38,ad.w*.38])center.base.box(ad.x+dx,ad.y-ad.h/2-1.8,ad.z,.18,3.6,.25,0x5a6770);
    }
    for(const c of cells.values()){
      if(c.base.parts.length)c.base.finish(c.essential,this.#solid,'Street architecture');
      if(c.trim.parts.length)c.trim.finish(c.detail,this.#solid,'Cables, fittings and joinery');
      if(c.glow.parts.length){const mesh=new Mesh(c.glow.geometry(),this.#light);mesh.name='Warm shop fixtures';c.essential.add(mesh);}
      if(c.panels.length){const geo=mergeGeometries(c.panels,false)!;c.panels.forEach(g=>g.dispose());geo.computeBoundingSphere();const mesh=new Mesh(geo,this.#sign);mesh.name='Shopfronts and original advertisements';c.essential.add(mesh);}
      this.cells.push(c);
    }
  }

  #panel(parts:BufferGeometry[],p:readonly[number,number,number],w:number,h:number,yaw:number,tile:number):void{
    const source=new PlaneGeometry(w,h),g=source.toNonIndexed(),uv=g.getAttribute('uv');source.dispose();
    // Half-texel inset keeps neighbouring lettering out of mipmapped sign edges.
    const col=tile%4,row=Math.floor(tile/4),du=(256-4)/1024,dv=(128-4)/1024;
    for(let i=0;i<uv.count;i++)uv.setXY(i,(col*256+2)/1024+uv.getX(i)*du,1-(row*128+126)/1024+uv.getY(i)*dv);
    g.rotateY(yaw);g.translate(...p);parts.push(g);
  }
  #beam(k:SettlementKit,a:readonly[number,number,number],b:readonly[number,number,number],radius:number,color:number):void{
    const start=new Vector3(...a),end=new Vector3(...b),delta=end.clone().sub(start),length=delta.length();
    const g=new CylinderGeometry(radius,radius,length,5);g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize()));
    start.add(end).multiplyScalar(.5);k.add(g,color,start.x,start.y,start.z);
  }
  update(x:number,z:number,quality:QualityKey):void{
    const r=streetDetailRanges(quality);
    for(const cell of this.cells){const d=Math.hypot(cell.x-x,cell.z-z)-C.cellSize*.71;
      cell.essential.visible=d<r.essential;cell.detail.visible=d<r.detail;
    }
  }
  dispose():void{
    this.group.removeFromParent();this.group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
    this.#solid.dispose();this.#light.dispose();this.#sign.dispose();this.atlas.dispose();
  }
}
