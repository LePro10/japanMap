import { Vehicle, type Ground } from '../../src/game/Vehicle.ts';
import { VEHICLES } from '../../src/config/vehicles.config.ts';
import { RAMPS } from '../../src/config/stunt.config.ts';
import { RampField } from '../../src/game/RampField.ts';
import assert from 'node:assert/strict';

for(const authored of RAMPS) for(const startOffset of [12,authored.length+3]) {
 const ramp={...authored,x:0,z:0,heading:0},field=new RampField([ramp]);field.prepare(()=>0);
 const gradient={x:0,z:0};
 const ground:Ground={
  isRamp:(x,z)=>field.surfaceAt(x,z)>0,
  height:(x,z)=>Math.max(0,field.surfaceAt(x,z)),
  normal:(x,z,out)=>field.gradient(x,z,gradient) ? out.set(-gradient.x,1,-gradient.z).normalize() : out.set(0,1,0),
  surface:()=> 'gelaende',waterDepth:()=>0,
 };
 const car=new Vehicle(VEHICLES.touge);car.respawn(0,-startOffset,0,ground);
 const idle={throttle:0,brake:0,steer:0,handbrake:false};
 for(let i=0;i<60;i++)car.step(1/60,idle,ground,null);
 car.velocity.set(0,0,140/3.6);
 let launch=0,hull=0,air=0;
 for(let i=0;i<480;i++) {
  car.step(1/60,{...idle,throttle:1},ground,null);
  if(car.position.z<0) hull=Math.max(hull,car.telemetry.hullDepth);
  if(car.position.z>-4 && car.telemetry.airborne && !launch)launch=car.telemetry.speed*3.6;
  if(car.telemetry.airborne)air++;
 }
 console.log(JSON.stringify({id:ramp.id,startOffset,launch,hull,air:air/60,z:car.position.z}));
 assert.ok(launch > 110, `${ramp.id}: launch speed ${launch} km/h from 140`);
 assert.ok(air / 60 > .35, `${ramp.id}: failed to launch`);
 assert.ok(hull < .13, `${ramp.id}: ramp penetration ${hull} m`);
 assert.ok(Number.isFinite(car.position.y) && car.position.y > -.1, 'landing remains above ground');
}
