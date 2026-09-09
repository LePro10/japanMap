The old city plate now reads as a place: eight facade families, a 42 m crossing with a cinema, glass hotel, corner shop and Corner Mart, and six slow cars plus twelve walkers on the loop.

WP4 only. No terrain bake. East Gate was already a carved 12 m embankment from WP6; it was not rebuilt here. Houses stay standing — crowd is staffage, not a demolition layer.

## What changed

- Shared facade program still, three city draw families (facade / slab / neon). Family id is packed into `aFacade.x` (`seed + family·256`).
- Families: tiled shop, shuttered workshop, timber restaurant, narrow apartment, brick cinema, glass hotel, plaster hillside house, corrugated shed. Each building rolls one of three roof/canopy variants.
- Ground floors sit 0.5–1.5 m deep with door recesses. Street-facing parcels stay 92 % occupied so the main frontage closes. Upper windows light at most about one in three.
- Crossing landmarks around (620, 120). Hotel reads ~62 m in the generator test.
- Same kit on WP6 terraces: hillside plaster north of Z −180, market sheds south of Z 420, workshops west of X 400.
- Caps from the plan: 6 traffic instances on `stadt`, 12 pedestrians around the crossing. No pedestrian collision — a walker that stops a car is a physics bug, not a city.

## Not this package

Events E01–E17, diner/mart interiors, Breakyard, Beacon Tower, Rain Garden and paid upgrades. ASTRA_BUILD has no WP7; those remain product-plan items outside the six build packages.

## Checks

- `npx tsc --noEmit` (project: `node node_modules/typescript/bin/tsc --noEmit`)
- `node --experimental-strip-types --import ./tools/bench/register.mjs tools/wp4-city.test.mts`

Measured in that test: 211 buildings, all eight families present, hotel 62 m, four named corners.
