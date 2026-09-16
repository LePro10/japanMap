import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:5183/japanMap/');
  await page.waitForFunction(()=>window.japanMap?.quality,null,{timeout:240000});
  await page.evaluate(()=>window.japanMap.quality('high'));
  await page.locator('.start__button').click();
  await fs.mkdir('.cache/city-review',{recursive:true});
  const report=await page.evaluate(()=>{
    const e=window.japanMap.engine,d=e.systems.find(s=>s.name==='DriveSystem'),c=e.systems.find(s=>s.name==='CityExperienceSystem');
    const blocked=[];
    for(const route of [[[503.8,35],[509,35],[512,36.8],[516,36.8],[516,38]],[[644,146],[644,142],[644,138.5],[646,138.5]],[[700,51],[700,40],[705,29],[705,-1]]]){
      for(let i=1;i<route.length;i++){
        const a=route[i-1],b=route[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.15);
        for(let j=0;j<=steps;j++){
          const x=a[0]+(b[0]-a[0])*j/steps,z=a[1]+(b[1]-a[1])*j/steps,y=d.height(x,z);
          const hit=d.collision.query(x,y+1,z,.4);
          if(hit.depth>.01)blocked.push({x,y,z,depth:hit.depth,id:hit.id});
        }
      }
    }
    d.walker.respawn(508.5,35,0,d);d.walkCamera.reset(d.walker);c.update(0,0);
    const card=document.querySelector('.city-discovery'),menu=document.querySelector('.player-menu');
    const discovered=!card.hidden&&card.textContent.includes('PLACE DISCOVERED');
    menu.hidden=false;c.update(1,0);const hiddenInMenu=card.hidden;menu.hidden=true;
    const region=document.querySelector('.hud__explore');region.hidden=false;c.update(1,0);const hiddenForRegion=card.hidden;
    region.hidden=true;c.update(0,0);const resumed=!card.hidden;
    const saved=JSON.parse(localStorage.getItem('japanMap.cityPlaces.v1')??'[]');
    const gl=e.renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
    return {destinations:c.destinations,blocked,buildings:e.systems.find(s=>s.name==='CitySystem').buildings.length,
      discovered,hiddenInMenu,hiddenForRegion,resumed,saved,gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  });
  await fs.writeFile('.cache/city-review/geometry-report.json',JSON.stringify(report,null,2));
  const shots=[
    ['crossing',[620,32,141],[620,44,103]],
    ['overview',[620,155,212],[620,30,90]],
    ['diner-outside',[492,33,36],[513,32,35]],
    ['diner',[506,31.8,35],[517,31.8,35]],
    ['mart',[644,31.8,143],[644,31.8,137]],
    ['garden',[695,34,44],[710,32,5]],
    ['beacon',[1145,60,-286],[1117,79,-333]],
    ['market',[472,12,733],[474,13,710]],
    ['rotor',[205,32,276],[205,33,253]],
  ];
  report.views=[];
  for(const [name,pos,look] of shots){
    if(process.argv.includes('--quick')&&name!=='crossing')continue;
    await page.evaluate(({pos,look})=>{const e=window.japanMap.engine,d=e.systems.find(s=>s.name==='DriveSystem');d.exit();const V=e.camera.position.constructor;d.fly.placeAt(new V(...pos),new V(...look));},{pos,look});
    await page.waitForTimeout(1800);
    await page.screenshot({path:`.cache/city-review/${name}.png`,timeout:90000});
    report.views.push(await page.evaluate(name=>({name,quality:window.japanMap.quality(),render:window.japanMap.engine.renderer.info.render}),name));
  }
  report.tiers=[];
  for(const tier of ['ultra','high','medium','low','minimal']){
    report.tiers.push(await page.evaluate(tier=>{
      const e=window.japanMap.engine,d=e.systems.find(s=>s.name==='DriveSystem'),c=e.systems.find(s=>s.name==='CityExperienceSystem');
      window.japanMap.quality(tier);e.camera.position.set(620,34,120);c.update(0,0);e.systems.find(s=>s.name==='NeonSystem').update(1);
      const streets=e.scene.getObjectByName('Neon Basin streets');
      return {tier,visibleCells:streets.children.filter(g=>g.visible).length,lights:e.scene.getObjectByName('Neon').children.filter(o=>o.isPointLight&&o.visible).length,colliders:d.collision.count,destinations:c.destinations.length};
    },tier));
  }
  await page.evaluate(()=>{
    const e=window.japanMap.engine,d=e.systems.find(s=>s.name==='DriveSystem'),V=e.camera.position.constructor;
    d.fly.placeAt(new V(620,32,141),new V(620,44,103));
  });
  await page.waitForTimeout(1500);
  await page.screenshot({path:'.cache/city-review/minimal.png',timeout:90000});
  await page.setViewportSize({width:844,height:390});
  await page.waitForTimeout(800);
  await page.screenshot({path:'.cache/city-review/mobile-landscape.png',timeout:90000});
  report.errors=errors;
  await fs.writeFile('.cache/city-review/report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  assert.equal(report.blocked.length,0,'Integrated world blocks a walk-in route');
  assert.equal(errors.length,0,'Browser runtime errors');
  assert.equal(report.destinations.length,6);
  assert.ok(report.discovered&&report.hiddenInMenu&&report.hiddenForRegion&&report.resumed&&report.saved.includes('komorebi-diner'),'Discovery, menu and regional toast UI');
  assert.ok(report.tiers[0].visibleCells>report.tiers[4].visibleCells,'Preset detail scaling');
  assert.equal(report.tiers[4].lights,0);
  assert.equal(new Set(report.tiers.map(t=>t.colliders)).size,1,'Collision persists across presets');
} finally {await browser.close();}
