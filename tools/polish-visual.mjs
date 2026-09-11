import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const out = 'screenshots/remote-integration';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:960,height:600}});
  await page.routeWebSocket('**',socket=>socket.close());
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('japanmap.quality','low'));
  await page.goto('http://127.0.0.1:5180/japanMap/');
  await page.waitForFunction(()=>window.japanMap?.quality,null,{timeout:180000});
  await page.evaluate(()=>window.japanMap.quality('low'));
  await page.locator('.start__button').click();
  await page.addStyleTag({content:'.player-menu,.player-ui__scrim{display:none!important}'});
  const shots = [
    ['city','stadt-neon'],['city-street','stadt-strasse'],['city-overview','stadt'],
    ['pass','pass-kehren'],['temple','sando'],['paddies','reisfeld'],['harbour','dorf'],
    ['village',{position:[-1310,65,455],lookAt:[-1247,29,392]}],
    ['commons',{position:[550,70,566],lookAt:[550,43,478]}],
  ];
  const report=[];
  for(const [name,view] of process.argv.includes('--checks-only') ? [] : shots) {
    await page.evaluate(view=>{const j=window.japanMap;j.drive(false);j.view(view);},view);
    await page.waitForTimeout(1200);
    await page.screenshot({path:`${out}/${name}.png`});
    report.push(await page.evaluate(name=>{const e=window.japanMap.engine;return {name,camera:e.camera.position.toArray(),calls:e.renderer.info.render.calls,triangles:e.renderer.info.render.triangles};},name));
    console.log(name,report.at(-1));
  }
  const validation = await page.evaluate(() => {
    const j = window.japanMap, e = j.engine;
    const drive = e.systems.find(s => s.name === 'DriveSystem');
    j.drive(false);
    e.stop();
    const holes = j.lodHoles('low');
    const terrain = e.scene.getObjectByName('Terrain');
    const uniform = terrain.material.terrainUniforms.uLodGridQuads;
    uniform.value = 16;
    const negative = j.lodHoles('low');
    uniform.value = 32;
    const mountain = [];
    for (const preset of ['low', 'minimal']) {
      j.quality(preset); j.view('pass-kehren');
      const timing = j.bench(4);
      mountain.push({preset, timing, camera:e.camera.position.toArray(), triangles:e.renderer.info.render.triangles});
    }
    return {roads:drive.roads.roads.length, holes, negativeHoles:negative.gesamt, mountain};
  });
  assert.equal(validation.roads, 72);
  assert.equal(validation.holes.gesamt, 0, 'visible terrain seams');
  assert.ok(validation.negativeHoles > 0, 'hole diagnostic must detect deliberately broken morphing');
  for (const probe of validation.mountain) assert.deepEqual(probe.camera, [-672, 620, -495]);
  await fs.writeFile(`${out}/report.json`,JSON.stringify({errors,report,validation},null,2));
  console.log(JSON.stringify(validation));
  if(errors.length) throw new Error(errors.join('\n'));
} finally {await browser.close();}
