import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { QUALITY } from '../../src/config/quality.config.ts';
// The offline reader does not need Vite's asset URL imports.
const source=fs.readFileSync('src/world/TerrainSampler.ts','utf8').replace("import { TERRAIN_ASSETS } from './terrainAssets';",'const TERRAIN_ASSETS = {};');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const { TerrainSampler }=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const dir='assets/generated/terrain/';
const meta=JSON.parse(fs.readFileSync(dir+'meta.json','utf8'));
const buf=fs.readFileSync(dir+'height.r16');
const sampler=new (TerrainSampler as any)(meta,new Uint16Array(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)));
// Independent reconstruction of the shader's bilinear heightmap vertex fetch.
function vertexHeight(x:number,z:number):number {
 const gx=Math.max(0,Math.min(2047,(x+1536)/meta.heightmap.spacing));
 const gz=Math.max(0,Math.min(2047,(z+1536)/meta.heightmap.spacing));
 const ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz;
 const a=sampler.heightAtTexel(ix,iz),b=sampler.heightAtTexel(ix+1,iz);
 const c=sampler.heightAtTexel(ix,iz+1),d=sampler.heightAtTexel(ix+1,iz+1);
 return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
// Reconstruct the actual unmorphed leaf triangles, not just vertex samples.
for(const grid of [17,25,33]) {
 const step=48/(grid-1), errors:number[]=[];
 for(let z=-1450;z<1450;z+=7.31) for(let x=-1450;x<1450;x+=7.79) {
  if(sampler.getHeightAt(x,z)<1 || sampler.getSlopeAt(x,z)>Math.PI/6) continue;
  const x0=Math.floor((x+1536)/step)*step-1536,z0=Math.floor((z+1536)/step)*step-1536;
  const u=(x-x0)/step,v=(z-z0)/step;
  const a=vertexHeight(x0,z0),b=vertexHeight(x0+step,z0),c=vertexHeight(x0,z0+step),d=vertexHeight(x0+step,z0+step);
  const y=u+v<=1 ? a+(b-a)*u+(c-a)*v : d+(c-d)*(1-u)+(b-d)*(1-v);
  errors.push(Math.abs(y-sampler.getHeightAt(x,z)));
 }
 errors.sort((a,b)=>a-b);
 console.log(JSON.stringify({grid,samples:errors.length,p95:errors[Math.floor(errors.length*.95)],p99:errors[Math.floor(errors.length*.99)],max:errors.at(-1)}));
 if(grid===33) assert.ok(errors.at(-1)!<1e-6,'vehicle ground differs from rendered near-field triangles');
}
for(const [name,preset] of Object.entries(QUALITY)) assert.equal(preset.terrainGridVertices,33,`${name} changes the physical ground surface`);
