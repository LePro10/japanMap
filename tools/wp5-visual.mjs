import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5180/japanMap/');await page.waitForFunction(()=>window.japanMap?.quality,null,{timeout:180000});
 await page.evaluate(()=>window.japanMap.quality('low'));await page.locator('.start__button').click();
 await page.waitForTimeout(1000);
 console.log(await page.evaluate(()=>{const d=window.japanMap.engine.systems.find(s=>s.name==='DriveSystem'),v=window.japanMap.engine.systems.find(s=>s.name==='StillwaterVillage');return {millY:v.millY,pondY:v.pondY,lane:v.laneSamples.length,actors:v.actors.map(a=>[a.kind,a.spots.length]),errors:[],floor:d.height(-1244,411),geometry:[v.village,v.harbour].map(group=>{let triangles=0,draws=0;const maps=new Set();group.traverse(o=>{if(o.isMesh){draws++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);if(o.material.map)maps.add(o.material.map);}});return{name:group.name,triangles,draws,signTextureBytes:[...maps].reduce((sum,m)=>sum+m.image.width*m.image.height*4,0)};})};}));
 await fs.mkdir('screenshots/wp5',{recursive:true}); await page.addStyleTag({content:'.player-menu,.player-ui__scrim{display:none!important}'});
 for(const [name,pos,look] of [['village',[-1310,65,455],[-1247,29,392]],['mill-pond',[-1271,34,401],[-1248,31,406]],['lane',[-1275,34,380],[-1261,31,411]],['harbour',[781,9,1076],[789,3,1010]]]){
  await page.evaluate(({pos,look})=>{const d=window.japanMap.engine.systems.find(s=>s.name==='DriveSystem');d.exit();const T=window.japanMap.engine.camera.position.constructor;d.fly.placeAt(new T(...pos),new T(...look));},{pos,look});
  await page.waitForTimeout(3000);await page.screenshot({path:`screenshots/wp5/${name}.png`});
 }
 console.log('errors',errors);
 await fs.writeFile('screenshots/wp5/boot.json',JSON.stringify({errors},null,2));
}finally{await browser.close();}
