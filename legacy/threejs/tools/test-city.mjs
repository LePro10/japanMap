import { spawnSync } from 'node:child_process';

for (const test of ['city-street-layout.test.mts','city-architecture.test.mts','city-interiors.test.mts','test-city-places.mts','walk-camera.test.mts']) {
  const result=spawnSync(process.execPath,['--experimental-strip-types','--import','./tools/bench/register.mjs',`tools/${test}`],{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
