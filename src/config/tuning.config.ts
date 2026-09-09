import { ARCADE, ARCADE_CRAWL, topSpeed, type ArcadeSpec } from './arcade.config';
import { VEHICLES, type VehicleId } from './vehicles.config';
export type TuneTier = 0 | 1 | 2;
export type TuneCategory = 'engine' | 'brakes' | 'steering' | 'tyres';
export type CarTune = Record<TuneCategory,TuneTier>;
export const STOCK_TUNE: Readonly<CarTune> = {engine:0,brakes:0,steering:0,tyres:0};
/**
 * Free handling setups on top of owned parts — ASTRA_PLAN §6.
 *
 * Road is the stock balance. Drift trades catch for lock, with **no** grip or
 * score gift. Dirt raises ride 20 mm and trims high-speed steer. Needle has
 * Safe Return instead of Dirt: crawl only, so the open-wheeler can leave a
 * meadow without becoming an offroader.
 */
export type SetupId = 'road' | 'drift' | 'dirt' | 'safe';
export const SETUP_LABEL: Readonly<Record<SetupId, string>> = {
  road: 'Road',
  drift: 'Drift',
  dirt: 'Dirt',
  safe: 'Safe Return',
};
export function setupsFor(id: VehicleId): readonly SetupId[] {
  return id === 'needle' ? ['road', 'drift', 'safe'] : ['road', 'drift', 'dirt'];
}
export function applySetup(spec: ArcadeSpec, setup: SetupId): ArcadeSpec {
  if (setup === 'drift') {
    return {
      ...spec,
      catchAssist: spec.catchAssist * 0.85,
      steerAngle: spec.steerAngle * 1.1,
    };
  }
  if (setup === 'dirt') {
    return { ...spec, steerFalloff: spec.steerFalloff * 0.95 };
  }
  return spec;
}
export function rideLift(setup: SetupId): number {
  return setup === 'dirt' ? 0.02 : 0;
}
export function crawlShare(id: VehicleId, setup: SetupId): number {
  if (setup === 'safe') return ARCADE_CRAWL.safeShare;
  if (id === 'gt' || id === 'needle') return ARCADE_CRAWL.trackShare;
  return ARCADE_CRAWL.share;
}
export function driveRetain(id: VehicleId): number {
  return VEHICLES[id].category === 'Utility' ? 0.85 : 0.65;
}
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
export function loadSetup(id:VehicleId):SetupId {
 const allowed=setupsFor(id);
 try {
  const value=localStorage.getItem(`japanmap.setup.${id}`);
  if(value&&(allowed as readonly string[]).includes(value))return value as SetupId;
 }catch{/* Sitzung bleibt spielbar. */}
 return 'road';
}
export function saveSetup(id:VehicleId,setup:SetupId):void {
 try{localStorage.setItem(`japanmap.setup.${id}`,setup);}catch{/* Sitzung bleibt spielbar. */}
}
