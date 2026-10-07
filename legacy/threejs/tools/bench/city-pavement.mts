/**
 * Belag der Stadtplatte — einmal messen, nicht annehmen.
 *
 * Die Bodenplatte sieht aus wie Asphalt (`RoadMaterial`), lag physikalisch
 * aber auf `gelaende`. Dieser Lauf prüft die Zuordnung, ohne Renderer und
 * ohne Höhenfeld: `RoadGround.surface()` braucht dafür weder Sampler noch Netz.
 *
 *     node --experimental-strip-types --import ./tools/bench/register.mjs tools/bench/city-pavement.mts
 */
import { ARCADE_SURFACE, ARCADE_SURFACE_DRAG } from '@/config/arcade.config';
import { CITY_DISTRICT, inCityDistrict } from '@/config/city.config';
import { RoadGround } from '@/game/RoadGround';

const ground = new RoadGround();

type Probe = { name: string; x: number; z: number; want: 'asphalt' | 'gelaende' };

const probes: Probe[] = [
  { name: 'Distriktmitte', x: CITY_DISTRICT.centerX, z: CITY_DISTRICT.centerZ, want: 'asphalt' },
  { name: 'neben der Strecke (Kern)', x: 620, z: 180, want: 'asphalt' },
  { name: 'NW-Ecke innen', x: CITY_DISTRICT.minX + 1, z: CITY_DISTRICT.minZ + 1, want: 'asphalt' },
  { name: 'SO-Ecke innen', x: CITY_DISTRICT.maxX - 1, z: CITY_DISTRICT.maxZ - 1, want: 'asphalt' },
  { name: 'Kante innen', x: CITY_DISTRICT.minX, z: CITY_DISTRICT.centerZ, want: 'asphalt' },
  { name: '1 m westlich der Platte', x: CITY_DISTRICT.minX - 1, z: CITY_DISTRICT.centerZ, want: 'gelaende' },
  { name: 'Schürze 12 m außerhalb', x: CITY_DISTRICT.minX - 12, z: CITY_DISTRICT.centerZ, want: 'gelaende' },
  { name: 'Schürze 24 m außerhalb', x: CITY_DISTRICT.minX - 24, z: CITY_DISTRICT.centerZ, want: 'gelaende' },
  { name: 'Reisfeld', x: -1020, z: -20, want: 'gelaende' },
  { name: 'Bergpass', x: -588, z: -322, want: 'gelaende' },
  { name: 'Küste', x: 0, z: 1400, want: 'gelaende' },
];

let failed = 0;
for (const p of probes) {
  const inside = inCityDistrict(p.x, p.z);
  const surf = ground.surface(p.x, p.z);
  const ok = surf === p.want && inside === (p.want === 'asphalt');
  if (!ok) failed++;
  const mark = ok ? '✓' : '✗';
  console.log(
    `${mark} ${p.name.padEnd(28)} (${p.x.toFixed(0)} | ${p.z.toFixed(0)})  ` +
      `surface=${surf}  inDistrict=${inside}  soll=${p.want}`,
  );
}

console.log(
  `\nAsphalt-Beiwerte unverändert: grip=${ARCADE_SURFACE.asphalt}  drag=${ARCADE_SURFACE_DRAG.asphalt}/s`,
);
console.log(`Gelände zum Vergleich:     grip=${ARCADE_SURFACE.gelaende}  drag=${ARCADE_SURFACE_DRAG.gelaende}/s`);

if (failed > 0) {
  console.error(`\n${failed} Probe(n) rot.`);
  process.exit(1);
}
console.log(`\n${probes.length} Proben grün.`);
