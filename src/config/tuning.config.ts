import { ARCADE, topSpeed, type ArcadeSpec } from './arcade.config';
import { VEHICLES, type VehicleId } from './vehicles.config';
export type TuneTier = 0 | 1 | 2;
export type TuneCategory = 'engine' | 'brakes' | 'steering' | 'tyres';
export type CarTune = Record<TuneCategory,TuneTier>;
export const STOCK_TUNE: Readonly<CarTune> = {engine:0,brakes:0,steering:0,tyres:0};
/** Immer von der eigenen Basis rechnen. Wiederholtes Anwenden stapelt keine Multiplikatoren. */
export function tunedArcade(id:VehicleId,tune:Readonly<CarTune>):ArcadeSpec {
 const b=ARCADE[id],force=[1,1.06,1.12][tune.engine]!,speed=[1,1.02,1.04][tune.engine]!;
 const response=[1,.92,.85][tune.steering]!;
 const mass=VEHICLES[id].chassis.mass,targetSpeed=topSpeed(b,mass)*speed;
 const drag=tune.engine===0?b.drag:(b.power*force/targetSpeed-mass*b.rollDecel)/(targetSpeed*targetSpeed);
 return {...b,launchForce:b.launchForce*force,power:b.power*force,
  drag,brakeG:b.brakeG/[1,.94,.89][tune.brakes]!,
  steerRate:b.steerRate/response,steerReturn:b.steerReturn/response,yawResponse:b.yawResponse/response,
  latG:b.latG*[1,1.04,1.08][tune.tyres]!};
}
export function loadTune(id:VehicleId):CarTune {
 const tune={...STOCK_TUNE};
 try {const data=JSON.parse(localStorage.getItem(`japanmap.tune.${id}`)??'{}');
  for(const key of Object.keys(tune) as TuneCategory[]) if(data?.[key]===1||data?.[key]===2)tune[key]=data[key];
 }catch{/* Lokaler Speicher ist optional. */}
 return tune;
}
export function saveTune(id:VehicleId,tune:CarTune):void {
 try{localStorage.setItem(`japanmap.tune.${id}`,JSON.stringify(tune));}catch{/* Sitzung bleibt spielbar. */}
}
