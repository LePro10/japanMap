import { Frustum, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import { SmashField, type PropKind, type SmashProp } from '@/game/SmashField';
import { SettlementKit } from '../settlements/SettlementKit';

const KINDS:readonly PropKind[]=['crate','cone','board','barrel'];

/** Reusable crates, cones and workshop signs at reachable road edges. Four shared draws. */
export class SmashableSystem implements System {
  readonly name='SmashableSystem';
  readonly group=new Group();
  isPlaying=()=>false;
  field=new SmashField([]);
  readonly #meshes=new Map<PropKind,InstancedMesh>();
  readonly #matrix=new Matrix4();
  readonly #frustum=new Frustum();
  readonly #point=new Vector3();
  #context:EngineContext|null=null;
  #previousX=0;#previousZ=0;#wasDriving=false;
  #revision=-1;
  constructor(readonly drive:DriveSystem) {}
  init(context:EngineContext):void {
    this.#context=context;this.group.name='Roadside play props';
    const props:SmashProp[]=[];
    const add=(x:number,z:number,kind:PropKind):void=>{
      this.drive.ground.refresh(x,z,0);
      const y=this.drive.height(x,z);
      if(y<1 || this.drive.collision.query(x,y+0.7,z,1.3).depth>0) return;
      if(Math.abs(this.drive.height(x+1,z)-y)>0.4 || Math.abs(this.drive.height(x,z+1)-y)>0.4) return;
      if(props.some(p=>Math.hypot(x-p.x,z-p.z)<3)) return;
      props.push({id:props.length,kind,x,y,z,radius:kind==='board'?0.65:0.5});
    };
    // An immediate toy beside the Commons practice line; the centre stays open.
    for(let i=0;i<8;i++) add(580+i%4*2.5,534+Math.floor(i/4)*4,KINDS[i%4]!);
    for(const road of this.drive.roads?.file.roads??[]) {
      if(road.type==='mountain' || road.id==='sando') continue;
      const line=road.centerline,n=line.length/3;
      const stride=Math.max(16,Math.floor(n/10));
      for(let i=stride;i<n-stride && props.length<88;i+=stride) {
        const x=line[i*3]!,z=line[i*3+2]!,nx=line[(i+1)*3]!-x,nz=line[(i+1)*3+2]!-z;
        const length=Math.hypot(nx,nz)||1,side=(i/stride)%2===0?1:-1;
        const offset=(road.widths[i]??8)*0.5+2.2;
        const px=x+nz/length*offset*side,pz=z-nx/length*offset*side;
        const near=this.drive.roads?.closestPoint(px,pz,12);
        if(near && near.distance<near.width*0.5+1) continue;
        add(px,pz,KINDS[props.length%4]!);
      }
    }
    this.field=new SmashField(props);
    const material=new MeshStandardMaterial({vertexColors:true,roughness:0.85});
    for(const kind of KINDS) {
      const kit=new SettlementKit();
      if(kind==='crate') {
        kit.box(0,0.45,0,0.85,0.85,0.85,0xa97b47);
        for(const side of [-1,1]) for(const h of [0.13,0.76]) kit.box(0,h,side*0.44,0.92,0.12,0.06,0xd6b982);
        for(const side of [-1,1]) kit.box(side*0.44,0.45,0,0.06,0.9,0.12,0x604b37);
      } else if(kind==='cone') {
        kit.box(0,0.055,0,0.7,0.11,0.7,0x303735);
        kit.cylinder(0,0.43,0,0.29,0.72,0xe69747,0,0,0.065);
        kit.cylinder(0,0.5,0,0.19,0.14,0xeedcc1,0,0,0.145);
      } else if(kind==='board') {
        for(const side of [-1,1]) kit.box(side*0.39,0.57,0,0.1,1.15,0.14,0xad8459);
        kit.box(0,0.75,0,0.86,0.65,0.12,0x33514c);
        for(const h of [0.6,0.74,0.88]) kit.box(0,h,0.07,0.52,0.035,0.025,0xf3d6a3);
        kit.box(0,0.06,0,1,0.12,0.7,0x9b744a);
      } else {
        kit.cylinder(0,0.5,0,0.4,1,0x53818a);
        for(const h of [0.12,0.85]) kit.cylinder(0,h,0,0.42,0.07,0x344c51);
      }
      const count=props.filter(p=>p.kind===kind).length;
      const mesh=new InstancedMesh(kit.geometry(),material,Math.max(1,count));
      mesh.name=`Breakable ${kind}`;mesh.count=count;mesh.receiveShadow=true;
      this.#meshes.set(kind,mesh);this.group.add(mesh);
    }
    this.#sync();context.scene.add(this.group);
  }
  fixedUpdate(dt:number):void {
    if(!this.isPlaying() || !this.drive.active) {this.#wasDriving=false;return;}
    const v=this.drive.vehicle,p=v.position;
    const car={x:p.x,y:p.y,z:p.z,previousX:this.#wasDriving?this.#previousX:p.x,previousZ:this.#wasDriving?this.#previousZ:p.z,vx:v.velocity.x,vz:v.velocity.z,radius:v.spec.chassis.bodyWidth*0.55};
    const camera=this.#context!.camera;
    camera.updateMatrixWorld();
    this.#matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this.#frustum.setFromProjectionMatrix(this.#matrix);
    this.field.step(dt,car,event=>this.drive.breakProp(event),prop=>this.#frustum.containsPoint(this.#point.set(prop.x,prop.y+0.6,prop.z)));
    v.velocity.x=car.vx;v.velocity.z=car.vz;
    this.#previousX=p.x;this.#previousZ=p.z;this.#wasDriving=true;
  }
  update():void {this.#sync();}
  #sync():void {
    if(this.#revision===this.field.revision) return;
    this.#revision=this.field.revision;
    for(const [kind,mesh] of this.#meshes) {
      let i=0;
      for(const p of this.field.props) if(p.kind===kind) {
        this.#matrix.makeScale(p.alive?1:0,p.alive?1:0,p.alive?1:0);
        this.#matrix.setPosition(p.x,p.y,p.z);mesh.setMatrixAt(i++,this.#matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
    }
  }
  dispose():void {
    const materials=new Set<MeshStandardMaterial>();
    for(const mesh of this.#meshes.values()) {mesh.geometry.dispose();mesh.dispose();materials.add(mesh.material as MeshStandardMaterial);}
    for(const material of materials) material.dispose();
    this.#meshes.clear();this.group.removeFromParent();
  }
}
