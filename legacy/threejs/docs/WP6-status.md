WP6 is **active** on this heightfield. Needle Circuit, Orchard Bypass, East Gate Avenue and the urban streets are in the live `roads.json`, and the terrain is carved to match.

Chain used (never `world`, never `roads` without `--wp6`):

```
bake:clean → node tools/gen-roads.mjs --wp6 → bake → shade → map
```

`.cache/clean.r16` was written after the clean bake. The restored pre-WP6 world remains in `.cache/wp6-restore/` (local, not committed).

### What a player can do now

Drive out of Sakura Commons onto a new 9 m lane, through East Gate Avenue onto the old city plate, and along the village road to Stillwater. Needle Circuit is a 2.17 km coastal lap with a surviving 900 m straight, 16 m asphalt, 4 cm kerbs and extra cornering grip. 242 city terraces sit beside the new streets.

### Pass (do not hide)

Compared with the restored 9 September checkpoint:

| | restored | this bake |
|---|---|---|
| Pass length | 3502 m | 3502 m |
| Hairpins | 4 | 4 |
| Min radius | 18.14 m | 18.12 m |
| Start XZ | (−552.28, −343.87) | 0.077 m away |
| Start height | | **+1.45 m** |
| End XZ / height | | 2 mm / 0 m |

Length and hairpins are unchanged. The foot of the pass sits 1.45 m higher because `fitNetwork` shares the ring junction after Orchard Bypass. The summit end did not move. Ring lap 6096 m → 5985 m (the bypass is shorter than the old southwest arc).

### Driven, not only numeric

Headless Kite runs, `screenshots/wp6/traversal.json`:

- Commons lane finished; clearance +0.38 m
- East Gate finished onto the city plate (y = 30.50 m); clearance +0.44 m
- Village road finished at (−201, 77); clearance +0.30 m
- Circuit held the 900 m straight (z = 855); clearance +0.46 m
- Graph: Commons → city and city → village via the ring

Inspect: 72 routes, 0 self-intersections, mesh-in-terrain ~0 on new asphalt (city/gate still show the known ~0.94 m plate offset). 242 terraces, 225 390 texels, roads protected.

### Still not a look pass

Junction meshes at speed, circuit event cards, and WP4 façade density on the new land were not this package. `--wp6` remains the generator flag so a plain `npm run roads` cannot silently overwrite this layout with the old eight-road net.
