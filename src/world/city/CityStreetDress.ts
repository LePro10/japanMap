import { BufferGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { QualityKey } from '@/config/quality.config';
import { CITY_EXPERIENCE as C } from '@/config/cityExperience.config';
import type { CityCollider } from './CityGenerator';
import { SettlementKit } from '../settlements/SettlementKit';
import { buildCityGraphicAtlas } from './CityGraphicAtlas';
import { facadeFrame, cityDistrictAt, streetDetailRanges, type StreetBuilding } from './CityStreetLayout';
import { DISTRICTS, type DistrictStyle } from '@/config/tokyoLayout.mjs';

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
      const cell=cellAt(cx,cz),f=facadeFrame(b);
      const commercial=b.family===0||b.family===1||b.family===2||b.family===4||b.family===7;
      const inset=b.shopInset??(commercial?.55:.2);
      const box=(kit:SettlementKit,u:number,y:number,out:number,w:number,h:number,d:number,color:number)=>{
        const p=f.point(u,y,out);kit.box(...p,w,h,d,color,0,f.yaw);
      };
      const panel=(u:number,y:number,out:number,w:number,h:number,tile:number)=>{
        const p=f.point(u,y,out);this.#panel(cell.panels,p,w,h,f.yaw,tile);
      };
      // ── Ladenfront: ein Typ je Haus (Neo-Tokio v2) ──────────────────────
      // Vorher trug jedes Geschäftshaus dieselben Module im 7-m-Takt — gleiche
      // Leuchtleiste, gleiche Laternen bei jedem fünften, gleiche Vitrine.
      // Rückmeldung: „diese Läden, nicht immer die gleichen". Jetzt wählt das
      // Viertel aus zwölf Typen (`shopTypeFor`), und jeder Typ hat seine eigene
      // Front: Konbini mit Farbband, Izakaya mit Laternen und Noren, Spielhalle
      // mit Lauflichtern, Drogerie mit Ware auf dem Gehweg, Rollladen zu.
      const shop=commercial?shopTypeFor(cx,cz,index):null;
      if(shop){
        const w=Math.max(2.2,f.span-.9),u0=0;
        const frame=shop.frame??C.palette.metal;
        // Rahmen und Sockel — für alle Typen gleich gebaut, in Typfarbe.
        for(const side of [-1,1])box(cell.base,u0+side*(w/2-.07),1.7,-inset+.09,.14,2.7,.16,frame);
        box(cell.base,u0,.3,-inset+.06,w,.26,.2,shop.plinth??C.palette.stone);
        if(shop.display!==undefined)panel(u0,1.72,-inset+.025,w-.4,2.1,shop.display);
        if(shop.sign!==undefined){
          box(cell.base,u0,3.39,-inset+.08,w,.65,.18,shop.band??C.palette.metal);
          panel(u0,3.39,-inset+.18,Math.min(w-.16,6),.52,shop.sign);
        }
        if(shop.glow)box(cell.glow,u0,3.03,-inset+.22,w*.8,.035,.08,shop.glow);
        switch(shop.kind){
          case 'konbini':{
            // Drei Farbstreifen über der Front — das Erkennungszeichen jedes Konbini.
            const cols=shop.stripes!;
            cols.forEach((col,k)=>box(cell.glow,u0,3.1+k*.16,-inset+.2,w,.14,.06,col));
            box(cell.glow,u0,2.86,-inset+.2,w*.9,.04,.06,0xf4f6ff);
            break;
          }
          case 'izakaya':case 'ramen':{
            // Noren: vier Stoffbahnen über der Tür, darüber die Stange.
            const nw=Math.min(1.8,w*.45),dark=shop.kind==='ramen'?0x9b1b1b:0x1d2b4a;
            box(cell.trim,u0,2.62,-inset+.3,nw+.2,.04,.04,C.palette.wood);
            for(let j=0;j<4;j++)box(cell.base,u0-nw/2+nw*(j+.5)/4,2.25,-inset+.3,nw/4-.04,.72,.02,dark);
            box(cell.base,u0,2.94,.12,w,.10,1.1,C.palette.wood);
            const lanterns=shop.kind==='izakaya'?[-1,1]:[1];
            for(const side of lanterns){
              const p=f.point(u0+side*Math.min(w*.36,2.2),2.45,.35);
              cell.glow.add(new CylinderGeometry(.21,.25,.52,10),0xff5a3a,...p);
              cell.trim.cylinder(p[0],p[1]+.32,p[2],.026,.15,C.palette.metal);
              for(const sy of [-1,1])cell.trim.cylinder(p[0],p[1]+sy*.25,p[2],.22,.035,0x2a1a14);
            }
            // Speisekarte auf dem Gehweg.
            box(cell.base,u0+w*.3,.55,.55,.5,1.1,.08,0x2a2320);
            box(cell.glow,u0+w*.3,.72,.6,.42,.6,.02,0xf3e2c0);
            break;
          }
          case 'game':{
            // Lauflichter: Birnen rings um die Öffnung.
            const n=Math.max(6,Math.round(w/.45));
            for(let j=0;j<=n;j++){
              box(cell.glow,u0-w/2+w*j/n,3.02,-inset+.25,.09,.09,.05,j%2?0xffe07a:0xff5ad2);
            }
            for(let j=0;j<6;j++)for(const side of [-1,1])box(cell.glow,u0+side*(w/2-.07),.4+j*.45,-inset+.26,.09,.09,.05,j%2?0x7afcff:0xffe07a);
            break;
          }
          case 'drug':{
            // Ware draußen: zwei Regale mit bunten Schachteln.
            for(const side of [-1,1]){
              const su=u0+side*w*.28;
              box(cell.base,su,.5,.55,1.2,1.0,.45,0xcfd3d6);
              for(let k=0;k<6;k++)box(cell.trim,su-.45+(k%3)*.45,.72+Math.floor(k/3)*.34,.72,.38,.26,.1,[0xf2c200,0xe24a6a,0x2a8fd8,0x4cb050,0xff8a2a,0xffffff][(k+index)%6]!);
            }
            box(cell.base,u0,2.94,.12,w,.10,1.1,0xf2c200);
            break;
          }
          case 'vending':{
            // Automatenecke statt Laden — zwei bis drei nebeneinander.
            const n=Math.max(2,Math.min(3,Math.floor(w/1.05)));
            for(let j=0;j<n;j++){
              const vu=u0-(n-1)*.52+j*1.04,v=f.point(vu,1,.62);
              if(isRoad(v[0],v[2]))continue;
              cell.base.box(...v,.95,2,.72,[0xd8dde0,0xc81e2e,0x2a62c9][(index+j)%3]!,0,f.yaw);
              panel(vu,1.25,.99,.78,1.13,16+(index+j)%8);
              box(cell.glow,vu,.35,.99,.6,.14,.03,0xe8f4ff);
              this.colliders.push({minX:v[0]-.6,maxX:v[0]+.6,minZ:v[2]-.6,maxZ:v[2]+.6,bottom:b.baseY,top:b.baseY+2});
            }
            break;
          }
          case 'florist':{
            for(let j=0;j<5;j++){
              const pu=u0-w*.4+j*w*.2,p=f.point(pu,.3,.5);
              cell.base.box(...p,.4,.35,.4,0x8a6a4a,0,f.yaw);
              cell.base.ball(p[0],p[1]+.45,p[2],.33,[0xd96a8a,0xf2c14e,0x7aa35a,0xe8e2d0,0xb04a6a][(j+index)%5]!);
            }
            break;
          }
          case 'shutter':{
            // Rollladen: Lamellen quer über die ganze Front.
            for(let j=0;j<9;j++)box(cell.trim,u0,.45+j*.27,-inset+.09,w-.3,.04,.04,0x7e8589);
            box(cell.base,u0,2.86,-inset+.14,w,.3,.24,0x5a6166);
            break;
          }
          default:
            break;
        }
      }else{
        // Letterboxes, recessed vestibule canopy and door handles make residential entries distinct.
        const u=0;
        box(cell.base,u,1.13,-inset+.06,1.5,2.26,.15,0x243133);
        // Glastür mit hellem Flur dahinter — ohne sie las sich jeder Eingang als
        // schwarzer Kasten vor der Wand (Bild 1 der Rückmeldung).
        box(cell.glow,u,1.08,-inset+.145,1.18,1.96,.02,0x9a8058);
        box(cell.base,u,2.4,.05,2.1,.13,.95,C.palette.stone);
        box(cell.glow,u,2.32,.08,1.1,.03,.10,C.palette.warm);
        box(cell.trim,u+.51,1.05,-inset+.19,.035,.35,.035,0xd4c9a9);
        for(let j=0;j<3;j++)box(cell.trim,u-.6+j*.23,1.35,-inset+.21,.19,.14,.07,0xa6a5a0);
        // Fahrräder vor der Tür — an jedem zweiten Wohnhaus.
        if(index%2===0&&f.span>6){
          for(let j=0;j<2+index%3;j++){
            const p=f.point(f.span/2-1-j*.55,.5,.5);
            if(isRoad(p[0],p[2]))continue;
            cell.trim.box(...p,.05,.6,1.6,[0x2a5d8a,0xc0c4c8,0x9b2b2b,0x2b2b2b][(index+j)%4]!,0,f.yaw);
          }
        }
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
          for(let j=0;j<3;j++)cell.base.ball(t[0]+(j-1)*.7,b.baseY+3.8+(.3-j*.15),t[2],1.3,cityDistrictAt(cx,cz).name==='Minato Hills'?0xa36a55:0x64775b);
          this.colliders.push({minX:t[0]-.2,maxX:t[0]+.2,minZ:t[2]-.2,maxZ:t[2]+.2,bottom:b.baseY,top:b.baseY+3.5});
        }
      }
    });
    // Neo-Tokio: die Werbewand der alten Kreuzung (620 | 120) ist entfernt. Sie
    // stand nach dem Umbau frei in der Luft über einem neuen Block — einer der
    // „Glitches von vorher" aus der Rückmeldung nach dem Teilstück.
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

/** Ein Ladentyp: welche Atlasfelder, welche Farben, welcher Sonderbau. */
interface ShopType {
  readonly kind: 'konbini' | 'izakaya' | 'ramen' | 'game' | 'fashion' | 'electronics' | 'drug' | 'cafe' | 'florist' | 'books' | 'realestate' | 'shutter' | 'vending';
  /** Feld der Ladenschild-Reihe (0…15) im Stadtatlas. */
  readonly sign?: number;
  /** Feld der Vitrine (16…31). */
  readonly display?: number;
  readonly glow?: number;
  readonly frame?: number;
  readonly band?: number;
  readonly plinth?: number;
  readonly stripes?: readonly number[];
}

const SHOP_TYPES: Readonly<Record<ShopType['kind'], readonly ShopType[]>> = {
  konbini: [
    { kind: 'konbini', display: 24, glow: 0xf4f8ff, frame: 0xd8dde0, stripes: [0x2e9e5b, 0xf4f6ff, 0x2a62c9] },
    { kind: 'konbini', display: 24, glow: 0xf4f8ff, frame: 0xd8dde0, stripes: [0xe8601c, 0xf4f6ff, 0x2a8a4a] },
    { kind: 'konbini', display: 24, glow: 0xf4f8ff, frame: 0xd8dde0, stripes: [0x1f4fbf, 0xf4f6ff, 0xc8102e] },
  ],
  izakaya: [{ kind: 'izakaya', sign: 13, display: 31, glow: 0xffb970, frame: 0x3a261c, plinth: 0x4a3a2c }, { kind: 'izakaya', sign: 15, display: 31, glow: 0xffb970, frame: 0x3a261c }],
  ramen: [{ kind: 'ramen', sign: 4, display: 31, glow: 0xffc98a, frame: 0x3a261c }],
  game: [{ kind: 'game', sign: 15, display: 30, glow: 0xff9ae6, frame: 0x1a1a24 }],
  fashion: [{ kind: 'fashion', sign: 9, display: 27, glow: 0xfff4e0, frame: 0xe4e2dc, plinth: 0x2b2d30 }, { kind: 'fashion', sign: 6, display: 27, glow: 0xfff4e0, frame: 0x1c1d20 }],
  electronics: [{ kind: 'electronics', sign: 3, display: 25, glow: 0xeaf6ff, frame: 0xd0d4d8 }, { kind: 'electronics', sign: 11, display: 25, glow: 0xeaf6ff, frame: 0x283139 }],
  drug: [{ kind: 'drug', display: 26, glow: 0xfffbe8, frame: 0xf2c200, band: 0xf2c200 }],
  cafe: [{ kind: 'cafe', sign: 0, display: 16, glow: 0xe9c38e, frame: 0x3a2f28 }, { kind: 'cafe', sign: 8, display: 20, glow: 0xe9c38e, frame: 0x283139 }],
  florist: [{ kind: 'florist', sign: 2, display: 18, glow: 0xf3e8c8, frame: 0x4a5a3a }],
  books: [{ kind: 'books', sign: 5, display: 19, glow: 0xe9c38e }, { kind: 'books', sign: 10, display: 17, glow: 0xf0d9a8 }],
  realestate: [{ kind: 'realestate', sign: 14, display: 28, glow: 0xf4f6ff, frame: 0x2a62c9 }],
  shutter: [{ kind: 'shutter', display: 29, frame: 0x6a7176 }],
  vending: [{ kind: 'vending', frame: 0x5a6166 }],
};

/** Gewichte je Viertel — was man in Kabukichō sieht, sieht man in Ginza nicht. */
const SHOP_MIX: Readonly<Record<DistrictStyle, readonly (readonly [ShopType['kind'], number])[]>> = {
  neon: [['izakaya', 3], ['ramen', 2], ['game', 1.5], ['konbini', 1], ['drug', 1], ['shutter', 1], ['vending', 0.6]],
  yokocho: [['izakaya', 5], ['ramen', 2], ['shutter', 1.5]],
  scramble: [['fashion', 3], ['cafe', 2], ['konbini', 1], ['drug', 1.2], ['electronics', 1], ['game', 1], ['books', 0.6]],
  electric: [['electronics', 4], ['game', 2], ['konbini', 1], ['shutter', 0.8], ['books', 0.8], ['vending', 0.5]],
  ginza: [['fashion', 4], ['cafe', 2], ['florist', 1], ['books', 0.6]],
  underpass: [['shutter', 3], ['izakaya', 1.2], ['konbini', 0.8], ['vending', 1.2], ['ramen', 0.8]],
  residential: [['shutter', 1.5], ['konbini', 1], ['florist', 0.8], ['cafe', 1], ['realestate', 1], ['vending', 1], ['books', 0.5]],
  towers: [['cafe', 2], ['konbini', 1.5], ['fashion', 1]],
};

function shopTypeFor(x: number, z: number, index: number): ShopType {
  let style: DistrictStyle = 'residential';
  for (const d of DISTRICTS) if (x >= d.minX && x < d.maxX && z >= d.minZ && z < d.maxZ) { style = d.style; break; }
  const mix = SHOP_MIX[style];
  // Deterministischer Hash je Haus — dieselbe Stadt bei jedem Laden.
  let h = (index * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  const roll = (h / 4294967296) * mix.reduce((s, [, w]) => s + w, 0);
  let acc = 0;
  let kind: ShopType['kind'] = mix[0]![0];
  for (const [k, w] of mix) {
    acc += w;
    if (roll < acc) { kind = k; break; }
  }
  const variants = SHOP_TYPES[kind];
  return variants[(h >>> 8) % variants.length]!;
}
