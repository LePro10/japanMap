import assert from 'node:assert/strict';
import { Vehicle } from '../src/game/Vehicle.ts';
import { VEHICLES, VEHICLE_ORDER } from '../src/config/vehicles.config.ts';
import { tunedArcade, STOCK_TUNE } from '../src/config/tuning.config.ts';
import { ARCADE,topSpeed } from '../src/config/arcade.config.ts';
import { flatGround } from './bench/flat.mjs';
const g=flatGround(),dt=1/120;
const cmd=(p={})=>({throttle:0,brake:0,steer:0,handbrake:false,boost:false,...p});
function measure(id,tune=STOCK_TUNE){
 const car=new Vehicle(VEHICLES[id]);car.setTune(tune);car.respawn(0,0,0,g);
 let t=0;
 while(car.telemetry.speed<100/3.6&&t<30){car.step(dt,cmd({throttle:1}),g,null);t+=dt;}
 const pos=car.position.clone();let stop=0;
 while(car.telemetry.speed>.3&&stop<10){car.step(dt,cmd({brake:1}),g,null);stop+=dt;}
 return {id,seconds:+t.toFixed(2),stop:+car.position.distanceTo(pos).toFixed(2)};
}
const results=VEHICLE_ORDER.map(id=>measure(id));console.table(results);
const get=id=>results.find(r=>r.id===id);
assert.ok(get('truck').seconds>get('gt').seconds*2);
assert.ok(get('offroad').seconds>get('torrent').seconds*1.3);
assert.ok(get('morrow').stop>get('meridian').stop);
for(const id of VEHICLE_ORDER){
 const stock=measure(id),sport=measure(id,{engine:2,brakes:2,steering:2,tyres:2});
 assert.ok(sport.seconds<stock.seconds,`${id} engine tune accelerates faster`);
 assert.ok(sport.stop<stock.stop*.94,`${id} brakes reduce real stopping distance`);
 assert.deepEqual(tunedArcade(id,STOCK_TUNE),ARCADE[id]);
 const full=tunedArcade(id,{engine:2,brakes:2,steering:2,tyres:2});
 assert.ok(Math.abs(topSpeed(full,VEHICLES[id].chassis.mass)/topSpeed(ARCADE[id],VEHICLES[id].chassis.mass)-1.04)<.0001,'Sport speed follows own base');
 const tunedCar=new Vehicle(VEHICLES[id]);tunedCar.setTune({engine:2,brakes:2,steering:2,tyres:2});
 assert.equal(tunedCar.spec.chassis.mass,VEHICLES[id].chassis.mass);
}
assert.ok(tunedArcade('offroad',{engine:2,brakes:2,steering:2,tyres:2}).latG<ARCADE.gt.latG);
console.log('WP3 driving and tune comparisons passed');

const targets=[[7.2,38],[10.5,39],[12,46],[8.8,45],[5.6,35],[5.8,37],[4.7,36],[4.9,40],[3.9,31],[3.3,27]];
results.forEach((r,i)=>{assert.ok(Math.abs(r.seconds-targets[i][0])<.12,`${r.id} launch target`);assert.ok(Math.abs(r.stop-targets[i][1])<.5,`${r.id} stop target`);});
