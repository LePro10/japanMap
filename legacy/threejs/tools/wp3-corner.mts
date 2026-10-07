import assert from 'node:assert/strict';
﻿import {Vehicle} from '../src/game/Vehicle.ts';
import {VEHICLES,VEHICLE_ORDER} from '../src/config/vehicles.config.ts';
import {flatGround} from './bench/flat.mjs';
const g=flatGround(),dt=1/120,input=p=>({throttle:0,brake:0,steer:0,handbrake:false,boost:false,...p});
function ready(id){const c=new Vehicle(VEHICLES[id]);c.respawn(0,0,0,g);for(let i=0;i<5000&&c.telemetry.speed<60/3.6;i++)c.step(dt,input({throttle:1}),g,null);return c;}
const metrics={};
for(const id of VEHICLE_ORDER){
 const c=ready(id);for(let i=0;i<24;i++)c.step(dt,input({throttle:.35,steer:.6}),g,null);
 const yaw=c.yaw;const d=ready(id);let peak=0;
 for(let i=0;i<300;i++){d.step(dt,input({throttle:1,steer:.5,handbrake:i<36}),g,null);peak=Math.max(peak,Math.abs(d.telemetry.slip));}
 let recovery=0;for(let i=0;i<600&&Math.abs(d.telemetry.slip)>.1745;i++){d.step(dt,input({throttle:.2}),g,null);recovery+=dt;}
 metrics[id]={yaw:Math.abs(yaw),drift:peak,recovery};
 console.log(id,{yaw:+yaw.toFixed(4),drift:+(peak*180/Math.PI).toFixed(1),held:+(d.telemetry.slip*180/Math.PI).toFixed(1),recovery:+recovery.toFixed(2)});
}

assert.ok(metrics.pip.yaw>metrics.offroad.yaw*2.5,'Pip turns promptly; Cairn carries inertia');
assert.ok(metrics.gt.yaw>metrics.truck.yaw*2.5,'Pickup cannot turn like Ember');
assert.ok(metrics.ribbon.drift>metrics.pip.drift*2.5,'Ribbon sustains a wider slide than Pip');
assert.ok(metrics.morrow.drift>metrics.meridian.drift*1.4,'Morrow has a looser rear than Meridian');
for(const m of Object.values(metrics)) assert.ok(m.drift<Math.PI/2&&m.recovery<2,'Every stock car stays catchable');
console.log('WP3 steering and drift identities passed');
