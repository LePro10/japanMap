import {Vehicle} from '../src/game/Vehicle.ts';
import {VEHICLES,VEHICLE_ORDER} from '../src/config/vehicles.config.ts';
import {ARCADE} from '../src/config/arcade.config.ts';
import {flatGround} from './bench/flat.mjs';
import fs from 'node:fs';
const targets=[[7.2,38],[10.5,39],[12,46],[8.8,45],[5.6,35],[5.8,37],[4.7,36],[4.9,40],[3.9,31],[3.3,27]];
const dt=1/120,g=flatGround(),cmd=p=>({throttle:0,brake:0,steer:0,handbrake:false,boost:false,...p});
function run(id){const v=new Vehicle(VEHICLES[id]);v.respawn(0,0,0,g);let t=0;while(v.telemetry.speed<100/3.6&&t<30){v.step(dt,cmd({throttle:1}),g,null);t+=dt;}const z=v.position.z;for(let i=0;i<1500&&v.telemetry.speed>.3;i++)v.step(dt,cmd({brake:1}),g,null);return [t,v.position.z-z];}
let source=fs.readFileSync('src/config/arcade.config.ts','utf8');
for(let i=0;i<10;i++){
 const id=VEHICLE_ORDER[i],a=ARCADE[id];let lo=1500,hi=15000;
 for(let j=0;j<16;j++){a.launchForce=(lo+hi)/2;if(run(id)[0]>targets[i][0])lo=a.launchForce;else hi=a.launchForce;}
 a.launchForce=Math.round(a.launchForce);lo=.5;hi=1.8;
 for(let j=0;j<15;j++){a.brakeG=(lo+hi)/2;if(run(id)[1]>targets[i][1])lo=a.brakeG;else hi=a.brakeG;}
 a.brakeG=+a.brakeG.toFixed(4);
 source=source.replace(new RegExp(`(${id}:car\\([^,]+,[^,]+,[^,]+,)\\d+`),`$1${a.launchForce}`);
 source=source.replace(new RegExp(`(${id}:car\\([^\\n]+brakeG:)\\d*\\.?\\d+`),`$1${a.brakeG}`);
 console.log(id,a.launchForce,a.brakeG,run(id));
}
fs.writeFileSync('src/config/arcade.config.ts',source);
