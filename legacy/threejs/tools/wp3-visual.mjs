import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 await page.route('**/wp3-preview',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0;background:#192330"><canvas></canvas></body></html>'}));
 await page.goto('http://localhost:5180/japanMap/wp3-preview');
 await page.evaluate(async()=>{
  const T=await import('/japanMap/node_modules/three/build/three.module.js');
  const {VEHICLES,VEHICLE_ORDER}=await import('/japanMap/src/config/vehicles.config.ts');
  const {createCarBody,createCarWheel}=await import('/japanMap/src/game/carMesh.ts');
  const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});renderer.setSize(1600,900);renderer.setScissorTest(true);
  for(let i=0;i<10;i++){
   const s=VEHICLES[VEHICLE_ORDER[i]],scene=new T.Scene();scene.background=new T.Color('#192330');
   scene.add(new T.HemisphereLight(0xe8f4ff,0x716250,3));const light=new T.DirectionalLight(0xffe5ca,3);light.position.set(3,7,4);scene.add(light);
   const mat=new T.MeshStandardMaterial({vertexColors:true,roughness:.52,metalness:.12});
   const body=new T.Mesh(createCarBody(s),mat);body.position.y=s.chassis.cgHeight;scene.add(body);
   const wheelG=createCarWheel(s);
   for(const x of [-s.chassis.track/2,s.chassis.track/2])for(const z of [-s.derived.cgToRear,s.derived.cgToFront]){const wheel=new T.Mesh(wheelG,mat);wheel.position.set(x,s.chassis.wheelRadius,z);scene.add(wheel);}
   const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0x293441,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.02;scene.add(floor);
   const cam=new T.PerspectiveCamera(34,320/420,.1,100);cam.position.set(6,4,-7);cam.lookAt(0,.65,0);
   const col=i%5,row=Math.floor(i/5);renderer.setViewport(col*320,(1-row)*450+30,320,420);renderer.setScissor(col*320,(1-row)*450+30,320,420);renderer.render(scene,cam);
   const label=document.createElement('div');label.textContent=s.name;label.style.cssText=`position:absolute;left:${col*320}px;top:${row*450+408}px;width:320px;text-align:center;color:white;font:20px sans-serif`;document.body.append(label);
  }
 });
 await fs.mkdir('screenshots/wp3',{recursive:true});await page.screenshot({path:'screenshots/wp3/fleet.png'});
}finally{await browser.close();}
