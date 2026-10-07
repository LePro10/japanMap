import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport:{width:800,height:500}});
  await page.routeWebSocket('**', socket => socket.close());
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5180/japanMap/');
  await page.waitForFunction(()=>window.japanMap?.quality,null,{timeout:180000});
  await page.evaluate(()=>window.japanMap.quality('low'));
  await page.locator('.start__button').click();
  const results=await page.evaluate(async()=>{
    const {EVENTS}=await import('/japanMap/src/config/events.config.ts');
    const {RivalField}=await import('/japanMap/src/game/RivalField.ts');
    const {RivalDriver}=await import('/japanMap/src/game/ai/RivalDriver.ts');
    const {RoadNetwork}=await import('/japanMap/src/world/roads/RoadNetwork.ts');
    const e=window.japanMap.engine,d=e.systems.find(s=>s.name==='DriveSystem');
    e.stop(); const results=[];
    const input={throttle:1,brake:0,steer:0,handbrake:false,boost:true};
    for(const event of EVENTS) {
      if(!d.startEvent(event)) throw new Error(`Cannot start ${event.id}`);
      const road=d.roads.roads.find(r=>r.id===event.road);
      const points=[];
      for(let i=road.centerline.length-3;i>=0;i-=3) points.push(...road.centerline.slice(i,i+3));
      const network=event.reverse ? new RoadNetwork({...d.roads.file,roads:[{...road,centerline:points}]}) : d.roads;
      const line=RivalField.buildLine(network,event.road,d.vehicleId);
      const pilot=new RivalDriver(line,{pace:0.85,lane:0,rubber:0});
      pilot.placeAt(line.closed?0:32);
      const step=()=>{
        const command=d.race.state==='countdown' ? input : pilot.drive(1/60,d.vehicle.position,d.vehicle.yaw,d.vehicle.telemetry.speed,1);
        d.simulateStep(1/60,command);d.race.step(1/60,d.vehicle,d.collision);
      };
      const start=d.vehicle.position.clone(),yaw=d.vehicle.yaw;
      const rivals=Array.from({length:d.race.rivals.count},(_,i)=>d.race.rivals.positionOf(i).clone());
      const gridSpacing=rivals.map((p,i)=>Math.min(p.distanceTo(start),...rivals.filter((_,j)=>j!==i).map(q=>p.distanceTo(q))));
      for(let i=0;i<150;i++) step();
      const held=d.vehicle.position.distanceTo(start);
      const rivalHeld=rivals.map((p,i)=>p.distanceTo(d.race.rivals.positionOf(i)));
      for(let i=0;i<90;i++) step();
      const running=d.race.state;
      for(let i=0;i<240;i++) step();
      const rivalProgress=d.race.rivals.standings.map((r,i)=>r.progress+8+i*8);
      results.push({id:event.id,held,rivalHeld,gridSpacing,running,moved:d.vehicle.position.distanceTo(start),pathProgress:pilot.distance,yaw,rivalProgress});
      // Exercise checkpoint/lap logic independently of the driving pilot:
      // follow every 8 m of the route, and require the actual finish crossing.
      const point={x:0,y:0,z:0};
      let preFinish;
      for(let lap=0;lap<(line.closed?event.laps:1);lap++) {
        for(let arc=lap===0?pilot.arc:2;arc<line.length-1;arc+=8) {
          line.pointAt(arc,point);d.vehicle.position.set(point.x,point.y+0.5,point.z);
          d.race.step(1/60,d.vehicle,d.collision);
        }
        preFinish=d.race.state;
        if(line.closed){
          line.pointAt(1,point);d.vehicle.position.set(point.x,point.y+0.5,point.z);
          d.race.step(1/60,d.vehicle,d.collision);
        } else {
          line.pointAt(line.length,point);d.vehicle.position.set(point.x,point.y+0.5,point.z);
          d.race.step(1/60,d.vehicle,d.collision);
        }
      }
      results.at(-1).preFinish=preFinish;
      results.at(-1).finished=d.race.state;
      results.at(-1).closed=line.closed;
      d.abortEvent();
    }
    return results;
  });
  await fs.mkdir('screenshots/remote-integration',{recursive:true});
  await fs.writeFile('screenshots/remote-integration/races.json',JSON.stringify({results,errors},null,2));
  for(const result of results){
    assert.ok(result.held<0.001,`${result.id}: early start moved ${result.held.toFixed(2)}m`);
    assert.ok(result.rivalHeld.every(m=>m<0.001),`${result.id}: rivals moved during countdown`);
    assert.ok(result.gridSpacing.every(m=>m>6),`${result.id}: overlapping starting grid`);
    assert.equal(result.running,'running');
    assert.ok(result.pathProgress>10,`${result.id}: player cannot launch along the road`);
    assert.ok(result.rivalProgress.every(m=>m>15),`${result.id}: rivals do not race`);
    if(result.closed) assert.equal(result.preFinish,'running',`${result.id}: finishes before the start/finish crossing`);
    assert.equal(result.finished,'finished',`${result.id}: cannot complete the event`);
  }
  assert.deepEqual(errors,[]);
  console.log('All six events: fixed starting grid, countdown lock, player launch and active opponents passed.');
} finally { await browser.close(); }
