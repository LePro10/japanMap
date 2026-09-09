Players can now collect and switch between ten original cars, with visible wheel openings, distinct silhouettes, different acceleration/braking/turn-in/drift behavior, and free tuning previews saved separately for each owned car.

WP3 only. No world bake, GLB cars, Meshy assets, PLAN.md or CLAUDE.md were used. ASTRA_OWNER.md was not present in the checkout or the sibling-project search. Existing WP1/WP2 working-tree changes were preserved.

Design choices:
- One existing driving model and renderer. Each car uses a merged vertex-colour body plus instanced wheels.
- Original procedural lofts, wheel openings, cabin placement, lamps and rim patterns. Skiff has a recessed open bed; Meridian has an arched fastback; Ember has rear buttresses; Needle has exposed wheels, suspension and a halo.
- Stock mass, acceleration, braking and grip follow ASTRA_PLAN.md section 6. Dimensions are original authored proportions; Pip's 1.50 m width is preserved.
- The old save IDs remain: touge = Kite S, truck = Skiff Mini, offroad = Cairn 4, gt = Ember RS. Existing ownership maps to these identities.
- Kite is initially owned. Other cars have explicit Sparks prices and use the existing local purchase/balance system. Pip has a 3,000-Spark purchase option; its event reward is outside WP3 and is not implemented here.
- Engine, Brakes, Steering and Tyres offer Stock / Street / Sport as free previews. They persist per car and affect driving. These are the requested tuning stubs, not the paid upgrade economy, cosmetic shop or timed test-drive system.
- Engine force increases 6/12%, estimated speed 2/4%; braking distance targets decrease 6/11%; steering response delay decreases 8/15%; tyre grip increases 4/8%. Each result starts from its own stock data. Mass, wheelbase, steering lock and loose-ground factors are preserved.
- Needle's extra grip reaches its cap at 160 km/h, rather than continuing to increase into an unbeatable high-speed multiplier.

Flat asphalt, no boost, real Vehicle simulation at 120 Hz:

| Car | 0-100 km/h | Stop from 100 km/h |
| --- | --- | --- |
| Kite S | 7.19 s | 38 m |
| Pip 650 | 10.49 s | 39 m |
| Skiff Mini | 12.01 s | 46 m |
| Cairn 4 | 8.79 s | 45 m |
| Torrent R | 5.60 s | 35 m |
| Ribbon R | 5.79 s | 37 m |
| Meridian GT | 4.69 s | 36 m |
| Morrow 8 | 4.89 s | 40 m |
| Ember RS | 3.91 s | 31 m |
| Needle 01 | 3.30 s | 27 m |

The same 0.2 s steering input at 60 km/h produces about 3.3 times as much initial turn-in in Pip as Cairn. The handbrake sequence reaches 51 degrees in Ribbon versus 14 in Pip, with every car remaining recoverable. These measurements establish differences; they do not substitute for subjective player testing.

Checks:
- npm run typecheck
- npm run build
- node --experimental-strip-types --import ./tools/bench/register.mjs tools/wp3-fleet.mts
- node --experimental-strip-types --import ./tools/bench/register.mjs tools/wp3-handling.mts
- node --experimental-strip-types --import ./tools/bench/register.mjs tools/wp3-corner.mts
- With npm run dev:lan running: node tools/wp3-boot.mjs
- Fleet contact sheet: node tools/wp3-visual.mjs

Full cabin interiors, custom audio, brake-light animation, cosmetic kits and event loans remain outside this work package. Factory lamps are coloured geometry, retaining the two-draw-call construction.
