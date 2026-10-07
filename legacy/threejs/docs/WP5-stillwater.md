Players can follow Mill Lane into Stillwater Village, park at the mill, get out, walk through the open doorway, operate the sluice, visit the pond and return to their car. Tideglass remains the working ocean port, with its existing huts and boats and an accessible Net House.

## Finding the stop

- Take the existing western field path to its end near **−1140, 128**, then follow the stone lane and village signs. The navigation map marks **Stillwater Village** at **−1244, 409**.
- The mill court connects to the lane. **F** switches between car and walking. Walk through the open south doorway; **Enter** or the touch button operates the inner sluice lever.
- Stone steps connect the mill court to the boat slip and pond walk. Inspect the leat at the slip, then return by the same steps.
- At Tideglass, the existing coast-path endpoint at **722, 962** joins the local working lane. Walk into **Net House, 784, 1006**, inspect its ropes, the tide board at **795, 1025**, and the market card at **830, 977**.

## What was built

Stillwater has fourteen timber homes, two sheds, a 14 × 10 m walk-in mill, a rotating 3 m waterwheel whose shaft enters the wall, two millstones and hoppers, a moving sluice lever, a 22 × 14 m terrace pond, two small river skiffs, a drying-net rack, a boat slip, a stepped pond walk, two penned goats, four chickens, eight inexpensive village figures, vegetable beds, an orchard strip and pond-side planting. Static details are merged; figures and animals are instanced.

The harbour retains every original hut, ocean boat, net rack, ramp and pier placement. Awning, workbench, crate and rope details follow each hut's existing orientation. Net House and four harbour figures reinforce the port rather than copying the village.

## Deliberate adaptations

- **No rebake or paddy-mask edit.** Floors, the bent lane and narrow access surfaces are local meshes. Their triangle data also supplies driving/walking height and normals; water under the lane no longer applies submerged drag to cars on it. Vegetation clearance follows buildings and narrow path footprints.
- The river's baked water level here is about **20.77 m**, below the terrace. The pond shifts **14 m west** of the plan pin to a level shelf at **27.81 m**, avoiding a large retaining tank over the riverbank. A visible irrigation lift feeds the supported mill flume; a tailrace fills the pond and a narrow overflow returns downhill to the same river. This does not pretend that water flows uphill.
- The lane follows the west bank and uses a short raised crossing. A terrain-carved ford, the full planned southern road loop and other WP6 road work are deferred.
- Seventeen enclosed building masses keep the mill, pond and paddies readable rather than filling the pocket to reach an approximate 22-building count. The boat slip, net rack, flume and garden structures provide the remaining close detail.
- Inspect/Use is implemented; timed paddle puzzles, rope-sequence rewards, economy, NPC pathfinding and local sound production are deferred. No currency or decal unlock is claimed by these interactions.
- `ASTRA_OWNER.md` was not present in this checkout or the searched projects directory. Work followed the user's instructions and the owner locks in `ASTRA_BUILD.md` and the relevant `ASTRA_PLAN.md` sections. `PLAN.md` and `CLAUDE.md` were not opened.

## Verification

- `npm run typecheck`
- `npm run build` (Vite's existing large-chunk warning remains)
- `node --experimental-strip-types tools/wp5-surfaces.test.mjs`
- `node --experimental-strip-types --import ./tools/bench/register.mjs tools/wp5-ground.test.mjs`
- `node tools/wp5-traversal.mjs`: fixed-step real vehicle drives from the existing field path onto and through the bent lane; no submerged surface or falling through; mill entrance, lever approach, exit and wall collision pass.
- `node tools/wp5-visit.mjs`: park beside the mill approach, alight, cross the court, walk into the mill, use the sluice, walk to the pond, return and board; Net House entrance passes.
- `node tools/wp5-phone.mjs`: real touch input closes and opens the sluice; the 44 px button fits a 390 px screen.
- `node tools/wp5-visual.mjs`: Low-preset captures and runtime-error checks. Added geometry: approximately **90,748 triangles / 27 mesh draws** at Stillwater and **7,808 triangles / 12 mesh draws** at Tideglass before frustum culling. Sign texture pixels total approximately **2.7 MiB** before mipmaps. These are geometry counts, not a phone frame-rate certification.
- `node tools/wp5-production.mjs`: production preview boot without debug hooks.
- `node tools/wp5-compressed-boot.mjs`: production boot using the build's existing Brotli sidecars, with **16,248,063 bytes (16.25 MB)** of startup resource bodies and no runtime errors. Plain Vite preview transfers **18,986,499 bytes (18.99 MB)**. The 18 MB resource-body target therefore depends on compressed delivery; these measurements exclude the HTML document and HTTP headers and do not certify an external deployment. The test changes no application assets or hosting configuration.

Browser tests expect the dev server at `http://127.0.0.1:5180/japanMap/`; the production check expects preview at port `5181`. Evidence is in `screenshots/wp5/`. Baked terrain/roads and original harbour placements were compared against HEAD and remain unchanged. The pre-existing work in the checkout was preserved.
