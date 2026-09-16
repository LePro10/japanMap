# Neon Basin city upgrade

## Explore

The existing WP6 roads and terrain now connect 334 buildings with differentiated facades, recessed storefronts, balconies, rooftop equipment, cables, lanterns, original signs and advertisements. Crosslight Crossing has diagonal crossings and traffic signals. The old placeholder city crowd is no longer instantiated.

Six new walking destinations are marked in the Island Atlas:

| Place | Location (X, Z metres) | What to find |
| --- | --- | --- |
| Komorebi Diner | 508.5, 35 | Open entrance, counter, kitchen, table settings and booths |
| Kōji Corner Mart | 644, 141 | Open entrance, stocked aisles, refrigerated drinks and checkout |
| Rain Garden | 700, 40 | Pond, continuous walking bridge, lantern paths, pavilion and planted beds |
| Beacon Tower | 1116.7, -322.9 | Twin tower landmark and courtyard |
| Market Hall | 474.3, 723.9 | Open timber hall and produce stalls |
| Rotor Court | 205.1, 262.6 | Sculpture, cherry trees and seating |

Walk within six metres of each destination to discover it. Discovery is saved locally. Interiors are part of the world, without a loading screen. Existing walk/drive/map controls remain available. Buildings other than the two marked shops are exterior architecture.

## Rendering budget

- Street decoration is merged into 72 m cells. Essential detail range: Ultra 620 m → Minimal 180 m. Small fittings: 190 m → 40 m.
- All six destinations, floors, walls and furniture collisions remain present on every preset.
- Neon point-light budgets: Ultra 10, High 6, Medium 2, Low/Minimal 0. Signs and luminous fixtures remain visible without point lights.
- Original street graphics share one 1024² atlas; both furnished interiors share one 2048² atlas. No external image download is added.
- The four public places use six meshes and 43,681 triangles in total.
- The walking camera now retracts before walls, furniture and ceilings, including while orbiting and zooming.

## Verify

From the isolated project lane:

```powershell
node tools/test-city.mjs
npm run typecheck
npm run build
npm run test:polish
```

The geometry suite checks deterministic architecture, reserved parcels, walking routes, floor continuity, bridge slopes, collision contracts, disposal and 640 indoor camera orbit/zoom frames.

Run Vite on the lane's assigned port. `node tools/city-experience-runtime.mjs` targets port 5183 and checks the full loaded world, discovery persistence, menu suppression, preset budgets and runtime errors. It captures representative views in `.cache/city-review/`, with measurements in `report.json`. The mobile image is a viewport check, not a real-device performance benchmark.

The verification browser uses SwiftShader software rendering. Real desktop/mobile frame-rate and CrazyGames host acceptance still require target-device testing. Build output retains the existing large-chunk warning.

Verified on 2026-09-16: all commands above passed, full-world diner/mart/garden routes were clear, discovery persisted and paused correctly, and browser runtime/shader errors were empty. At the crossing the five quality levels showed 149 / 101 / 64 / 36 / 26 street detail groups; world collisions remained 3,495 and destinations remained six throughout.
