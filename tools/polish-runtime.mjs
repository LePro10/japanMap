import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[];
try {
 const page=await browser.newPage({viewport:{width:800,height:500}});
 await page.routeWebSocket('**',s=>s.close());
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5180/japanMap/');
 await page.waitForFunction(()=>window.japanMap?.quality,null,{timeout:180000});
 await page.evaluate(()=>window.japanMap.quality('low'));
 await page.locator('.start__button').click();
 await page.waitForFunction(()=>!!document.pointerLockElement);
 const state=await page.evaluate(()=>{
  const j=window.japanMap,e=j.engine,d=e.systems.find(s=>s.name==='DriveSystem');
  j.drive(true);d.placeAt(550,510,0);d.vehicle.velocity.set(0,0,15);
  return {props:e.systems.find(s=>s.name==='SmashableSystem').field.props.length};
 });
 assert.ok(state.props>=20,`expected distributed play props, got ${state.props}`);
 const parking=await page.evaluate(()=>{
  const d=window.japanMap.engine.systems.find(s=>s.name==='DriveSystem');
  d.vehicle.velocity.set(0,0,12);d.alight();const fast=d.active;
  d.vehicle.velocity.set(0,0,0.5);d.alight();const parked=d.walking;
  const board=d.board();return {fast,parked,board,speed:d.vehicle.velocity.length()};
 });
 assert.ok(parking.fast,'cannot leave a moving car at road speed');
 assert.ok(parking.parked && parking.board,'can park and re-enter at walking speed');
 assert.equal(parking.speed,0,'parked car must not resume its old momentum');
 await page.evaluate(()=>window.japanMap.engine.systems.find(s=>s.name==='DriveSystem').vehicle.velocity.set(0,0,15));
 await page.evaluate(()=>document.exitPointerLock());
 await page.locator('.player-menu').waitFor({state:'visible'});
 const before=await page.evaluate(()=>window.japanMap.engine.systems.find(s=>s.name==='DriveSystem').vehicle.position.toArray());
 await page.waitForTimeout(1200);
 const after=await page.evaluate(()=>window.japanMap.engine.systems.find(s=>s.name==='DriveSystem').vehicle.position.toArray());
 assert.deepEqual(after,before,'opening the real menu must pause vehicle simulation');
 await page.getByRole('button',{name:/^Continue/}).click();
 await page.waitForFunction(()=>!!document.pointerLockElement);
 await page.waitForTimeout(350);
 const resumed=await page.evaluate(()=>window.japanMap.engine.systems.find(s=>s.name==='DriveSystem').vehicle.position.toArray());
 assert.notDeepEqual(resumed,before,'Continue must resume simulation');
 // Real field integrates with the shared debris pool and removes exactly the struck prop.
 const smash=await page.evaluate(()=>{
  const e=window.japanMap.engine,d=e.systems.find(s=>s.name==='DriveSystem'),s=e.systems.find(s=>s.name==='SmashableSystem');
  const prop=s.field.props.find(p=>p.kind==='crate');
  d.placeAt(prop.x,prop.z-3,0);d.vehicle.velocity.set(0,0,12);s.fixedUpdate(1/60);
  d.vehicle.position.z=prop.z+2;s.fixedUpdate(1/60);s.update();
  return {alive:prop.alive,speed:d.vehicle.velocity.z,debris:e.scene.getObjectByName('Trümmer:Stücke')!==undefined};
 });
 assert.equal(smash.alive,false);assert.ok(smash.speed>10);assert.ok(smash.debris);
 await fs.mkdir('screenshots/remote-integration',{recursive:true});
 await fs.writeFile('screenshots/remote-integration/runtime.json',JSON.stringify({state,parking,before,after,resumed,smash,errors},null,2));
 assert.deepEqual(errors,[]);
 console.log('Runtime: real pause/resume, distributed smashables, integrated impact, clean console passed.',state);
} finally {await browser.close();}
