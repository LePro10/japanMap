import type { EngineContext, System } from '@/core/System';
import type { DriveSystem } from '@/game/DriveSystem';
import type { QualitySystem } from '@/render/QualitySystem';
import { SurfaceStack, type HeightField } from '../settlements/LocalSurfaces';
import type { CitySystem } from './CitySystem';
import { CityStreetDress } from './CityStreetDress';
import { buildCityInteriors } from './CityInteriors';
import { buildCityPlaces, type CityDestination } from './CityPlaces';
import { buildCityCrossing } from './CityCrossing';
import { cityDistrictAt } from './CityStreetLayout';
import './cityExperience.css';

/** Integrates destinations after the road, city and village collision/floor contracts are ready. */
export class CityExperienceSystem implements System {
  readonly name='CityExperienceSystem';
  readonly destinations:CityDestination[]=[];
  readonly #floors=new SurfaceStack();
  readonly #card=document.createElement('aside');
  #previousFloors:HeightField|null=null;
  #street:CityStreetDress|null=null;
  #interiors:ReturnType<typeof buildCityInteriors>|null=null;
  #places:ReturnType<typeof buildCityPlaces>|null=null;
  #crossing:ReturnType<typeof buildCityCrossing>|null=null;
  #context:EngineContext|null=null;
  #lastLabel='';
  #lastPlace='';
  #shownUntil=0;
  #elapsed=0;
  readonly #seen=new Set<string>();
  constructor(private readonly drive:DriveSystem,private readonly city:CitySystem,private readonly quality:QualitySystem,private readonly overlay:HTMLElement){}

  init(context:EngineContext):void{
    this.#context=context;
    const road=this.drive.roads,terrain=this.drive.terrain;
    if(!road||!terrain)throw new Error('City experience requires the loaded WP6 road and terrain systems.');
    this.#street=new CityStreetDress(this.city.buildings,(x,z)=>{
      const hit=road.closestPoint(x,z,25);return !!hit&&hit.distance<hit.width*.5+1.1;
    });
    this.#interiors=buildCityInteriors();
    this.#places=buildCityPlaces({terrainHeight:(x,z)=>terrain.getHeightAt(x,z),roadHeight:(x,z)=>road.closestPoint(x,z)?.y??terrain.getHeightAt(x,z),urbanLots:road.file.urbanLots??[]});
    this.#crossing=buildCityCrossing();
    context.scene.add(this.#street.group,this.#interiors.group,this.#places.group,this.#crossing.group);
    for(const source of [this.#street,this.#interiors,this.#places,this.#crossing])for(const b of source.colliders)
      this.drive.collision.addBox(b.minX,b.maxX,b.minZ,b.maxZ,b.bottom,b.top);
    this.#previousFloors=this.drive.ground.localSurfaces;
    if(this.#previousFloors)this.#floors.layers.push(this.#previousFloors);
    this.#floors.layers.push(this.#interiors.floors,this.#places.floors);
    this.drive.ground.localSurfaces=this.#floors;
    this.destinations.push(...this.#interiors.destinations,...this.#places.destinations);
    context.resources.track(this.#street.atlas);
    this.#card.className='city-discovery';this.#card.hidden=true;this.#card.setAttribute('role','status');
    this.overlay.append(this.#card);
    try{const saved:unknown=JSON.parse(localStorage.getItem('japanMap.cityPlaces.v1')??'[]');if(Array.isArray(saved))for(const id of saved)if(this.destinations.some(d=>d.id===id))this.#seen.add(id);}catch{/* Discovery is optional when storage is unavailable. */}
    this.update(0,0);
  }
  update(dt:number,_alpha:number):void{
    const camera=this.#context?.camera;if(camera)this.#street?.update(camera.position.x,camera.position.z,this.quality.level);
    if(document.querySelector('.player-menu:not([hidden]), .photo-mode:not([hidden]), .navmap:not([hidden]), .tune-garage:not([hidden])')){this.#card.hidden=true;return;}
    this.#elapsed+=dt;
    const active=this.drive.active||this.drive.walking;
    const p=this.drive.walking?this.drive.walker.position:this.drive.vehicle.position;
    const inCity=p.x> -80&&p.x<1490&&p.z> -470&&p.z<780;
    if(!active||!inCity){
      this.#card.hidden=true;return;
    }
    const district=cityDistrictAt(p.x,p.z);
    let nearest:CityDestination|null=null,best=22;
    for(const d of this.destinations){const dist=Math.hypot(p.x-d.x,p.z-d.z);if(dist<best&&Math.abs(p.y-d.y)<8){best=dist;nearest=d;}}
    const label=nearest?.name??district.name;
    if(label!==this.#lastLabel){
      this.#lastLabel=label;this.#shownUntil=this.#elapsed+7;
      const eyebrow=document.createElement('span');eyebrow.className='city-discovery__eyebrow';eyebrow.textContent=nearest?'TAKE A CLOSER LOOK':'NEON BASIN';
      const title=document.createElement('strong');title.textContent=label;
      const detail=document.createElement('span');detail.textContent=nearest?.description??district.description;
      this.#card.replaceChildren(eyebrow,title,detail);
    }
    if(nearest&&best<6&&this.drive.walking&&nearest.id!==this.#lastPlace){
      this.#lastPlace=nearest.id;
      if(!this.#seen.has(nearest.id)){
        this.#seen.add(nearest.id);this.#shownUntil=this.#elapsed+8;
        const eyebrow=this.#card.querySelector('.city-discovery__eyebrow');if(eyebrow)eyebrow.textContent=`PLACE DISCOVERED · ${this.#seen.size} / ${this.destinations.length}`;
        try{localStorage.setItem('japanMap.cityPlaces.v1',JSON.stringify([...this.#seen]));}catch{/* Private browsing still allows exploration. */}
      }
    }
    this.#card.hidden=this.#elapsed>this.#shownUntil;
  }
  dispose():void{
    this.#card.remove();this.#street?.dispose();this.#interiors?.dispose();this.#places?.dispose();this.#crossing?.dispose();
    if(this.drive.ground.localSurfaces===this.#floors)this.drive.ground.localSurfaces=this.#previousFloors;
    this.#floors.layers.length=0;this.destinations.length=0;this.#context=null;
  }
}
