import {chromium} from 'playwright-core';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const errors=[];
try{const page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5180/japanMap/');await page.waitForFunction(()=>window.japanMap?.quality,null,{timeout:180000});await page.evaluate(()=>window.japanMap.quality('low'));await page.locator('.start__button').click();
const result=await page.evaluate(()=>{
 const e=window.japanMap.engine,d=e.systems.find(s=>s.name==='DriveSystem'),s=e.systems.find(s=>s.name==='StillwaterVillage');e.stop();
 const road=d.roads.roads.find(r=>r.id==='feldpfad').centerline,prefix=[];for(let j=road.length-60;j<road.length-18;j+=3)prefix.push(new d.vehicle.position.constructor(road[j],road[j+1],road[j+2]));const line=[...prefix,...s.laneSamples],v=d.vehicle;d.board();d.placeAt(line[0].x,line[0].z,Math.atan2(line[1].x-line[0].x,line[1].z-line[0].z));
 let index=0,maxError=0,minClearance=Infinity,water=0,wet=[],steps=0;const input={throttle:0,brake:0,steer:0,handbrake:false};
 for(;steps<60*210;steps++){
  let best=Infinity;for(let j=index;j<Math.min(line.length,index+12);j++){const dist=Math.hypot(line[j].x-v.position.x,line[j].z-v.position.z);if(dist<best){best=dist;index=j;}}
  if(index>=line.length-4)break;
  const target=line[Math.min(line.length-1,index+6)],angle=Math.atan2(target.x-v.position.x,target.z-v.position.z);let err=angle-v.yaw;err=Math.atan2(Math.sin(err),Math.cos(err));
  input.steer=Math.max(-1,Math.min(1,-err*2.4));const speed=v.telemetry.speed;input.throttle=speed<5?.38:0;input.brake=speed>6?.3:0;
  d.ground.refresh(v.position.x,v.position.z,1/60);if(d.surface(v.position.x,v.position.z)==='wasser'){water++;if(wet.length<8)wet.push({index,position:v.position.toArray(),local:s.floors.height(v.position.x,v.position.z),height:d.height(v.position.x,v.position.z),raw:d.terrain.getHeightAt(v.position.x,v.position.z),depth:d.waterDepth(v.position.x,v.position.z)});}
  v.step(1/60,input,d,d.collision);maxError=Math.max(maxError,best);minClearance=Math.min(minClearance,v.position.y-d.height(v.position.x,v.position.z));
 }
 const route={telemetry:{speed:v.telemetry.speed,contacts:v.telemetry.contacts,depth:v.telemetry.waterDepth},index,total:line.length,steps,maxError,minClearance,water,wet,position:v.position.toArray()};
 const walk=(x,z,tx,tz)=>{d.walker.respawn(x,z,0,d);let n=0;for(;n<1600;n++){const p=d.walker.position,dist=Math.hypot(tx-p.x,tz-p.z);if(dist<.25)break;const angle=Math.atan2(tx-p.x,tz-p.z);d.ground.refresh(p.x,p.z,1/60);d.walker.step(1/60,{forward:1,right:0,jump:false,sprint:false},d,d.collision,angle);}return {steps:n,end:d.walker.position.toArray(),distance:Math.hypot(tx-d.walker.position.x,tz-d.walker.position.z)};};
 const entering=walk(-1244,418,-1244,410);const lever=walk(-1244,410,-1248.3,410.6);const leaving=walk(-1244,410,-1244,419);
 const walls=d.collision.query(-1237, s.millY+1,409,.3).depth;
 return {route,entering,lever,leaving,walls};
});console.log(JSON.stringify(result,null,2));await fs.mkdir('screenshots/wp5',{recursive:true});await fs.writeFile('screenshots/wp5/traversal.json',JSON.stringify(result,null,2));assert.ok(result.route.index>=result.route.total-4,'Car must complete Mill Lane');assert.equal(result.route.water,0,'Stone lane must not drive like submerged river');assert.ok(result.route.maxError<3,'Car remains on lane');assert.ok(result.route.minClearance>-.3,'No falling through');for(const key of ['entering','lever','leaving'])assert.ok(result[key].distance<.3,key);assert.ok(result.walls>0,'Mill walls must collide');assert.deepEqual(errors,[]);console.log('WP5 drive and mill traversal passed.');
}finally{await browser.close();}
