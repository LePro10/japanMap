Packed dirt, grass and shallow water now follow the handling table. Terrace Track, Shallow Run and Terrace Roller sit on the existing heightfield — no terrain bake.

## Driving

- Packed dirt uses each car's dirt factor (Cairn and Torrent 0.85, Ember and Needle 0.65, others 0.70–0.75). Grass is 0.65 for everyone. Shallow water is 0.75.
- Grip blends over 0.25 s. A landing does not snap yaw.
- Below 50 km/h, road cars keep at least 65 % of asphalt drive force on loose ground, utility cars 85 %.
- Crawl assist is back on loose ground only. Ember and Needle crawl harder so they are not trapped; Needle's **Safe Return** setup is crawl only. Nitro and crawl both scale with slope support — a cliff still wins.
- Fording: 0.20 m default, Skiff and Torrent 0.30, Cairn 0.45, Ember 0.12, Needle 0.10. Ocean deeper than that for two seconds returns the car to the last dry road with **Too deep · returning to shore**. Paddies and Shallow Run stay driveable.

## Setups

Road, Drift and Dirt are free and saved per car. Drift: −15 % catch, +10 % steering lock, no grip gift. Dirt: +20 mm ride, −5 % high-speed steer. Needle has Safe Return instead of Dirt.

## On the terraces

- **Terrace Track** 7 m packed dirt: (−1140, 128) → (−1030, 180) → (−900, 330) → (−680, 380) → (−490, 210) → (−190, 90). Local mesh stacked with Mill Lane floors.
- **Shallow Run** 28 × 12 m, 0.12 m water at (−900, 330), with entry lips.
- **Terrace Roller** at (−680, 380), 9 × 16 m, 1.4 m rise, 22 m dirt landing. Peak slope 7.5°.

Events (E11 Terrace Rally), interiors and a dirt-road bake are not in this package.

## Checks

- `node node_modules/typescript/bin/tsc --noEmit`
- `node --experimental-strip-types --import ./tools/bench/register.mjs tools/wp-offroad.test.mts`
- `node --experimental-strip-types --import ./tools/bench/register.mjs tools/wp3-handling.mts` — asphalt stock times must still match
