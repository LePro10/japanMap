# Astra — build the hard stuff

Easy bugs are **not** this job. Do them in a separate session (or a human): pause, enter/exit speed, race grid/countdown/AI, pickup clip, SDK, save *wiring*, leftover German, KTX2.

This session (and the next ones): **map, menu, assets** as specified in `ASTRA_PLAN.md`.

Codex, model **gpt-6-astra**. One work package per session. After each package: `typecheck` must pass and the game must still boot.

```
Read ASTRA_BUILD.md from "RULES" to the end, then do only the work package I name. Also ASTRA_PLAN.md (the relevant sections). You may open src/, src/config/, src/ui/, src/world/, src/game/carMesh.ts, assets/props.json. Do not open PLAN.md or CLAUDE.md. Do not npm run world unless the package says so. English code comments stay German if the file is German; player-facing strings English.
```

Then name the package: `WP1` / `WP2` / `WP3` / `WP4` / `WP5` / `WP6`.

---

## RULES

Think. If the plan fights the engine, keep the *player* result and change the *method*. Do not invent a second renderer, Rapier, day/night, or licensed cars.

**Assets in this repo are not Meshy dumps.**

- City, lobby, village *masses* = **code kits** (`CityGenerator`, props, procedural volumes). Eight facade families, storefront modules, shared atlas. That is how Low stays fast.
- Cars = extend **`carMesh.ts` + `vehicles.config.ts`** to the ten plan identities (silhouette, colour, wheels). Original shapes, metres from the spec, still two draw calls (body + instanced wheels). GLB cars later, one hero, through `npm run models` — not WP1–3.
- Hero props (mill wheel, mill house shell) = simple authored/procedural meshes or one GLB via `assets/source/models` → `npm run models`. Triangle-poor.
- You may generate or assemble geometry in TypeScript. You may not download random marketplace BMWs.

**Bake is a trap.** `npm run world` re-erodes the whole heightfield and can change the pass. Allowed only in **WP6**, and only as `bake:clean` is already done / follow the package. New city *look* (WP4) first tries growing `CITY_DISTRICT` and generator kits **without** a full world rebake. If the plate would float or clip, stop and say so — do not silently `world`.

**Performance:** Low is the look. 18 MB first load. Six traffic / twelve peds. Baked night. No full-scene planar reflection on phone presets.

**Stillwater Village** is on the **western paddies** (farmhouse −1244, 409), not the east harbour. Harbour stays a working port.

---

## Work packages (run in order)

### WP1 — Menu + HUD (no bake)

Replace the player menu/HUD to match `ASTRA_PLAN.md` §10–11.

- Six tabs: Play, Cars, Map, Records, Photo, Settings. Phone bottom tabs, desktop rail.
- Gear + RPM + speed + nitro cluster (see plan + `docs/astra-refs/Speedmeter.png` logic, not a copy).
- Continue, Call car (on foot), owned/showroom stub even if only current cars exist.
- Photo: pause, free cam, download PNG at higher quality — v1 as in the plan.
- Do not implement the full shop economy if Sparks are not wired yet; show the screens and disable Buy with an honest reason rather than fake Yen.

Files: `src/ui/**`, `src/style.css`, `DriveHud.ts`, `TouchControls.ts`. Keep debug behind F1.

### WP2 — Sakura Commons (no bake)

First 30 seconds on the **existing** bowl.

- Spawn on foot. Kite (or current starter) 4 m north, driver’s side visible.
- Two timber volumes: Petal Motors, Open Bay. Warm doorway. Fake interiors OK if Enter opens Cars/Tune.
- Prompt: “Your car. Take it out.”
- Five Spark markers / E01 as a short optional sprint if events can hook; if race system is still bugged, **do not** “fix races” — make the cones and the reward stub, skip a broken countdown.
- Call car places the selected car in a safe slot.

Do not expand `CITY_DISTRICT`. Do not rebake.

### WP3 — Ten car identities (no bake, no GLB)

`vehicles.config.ts` + `carMesh.ts` + arcade data.

- Ten names/classes from the plan (or keep four playable and add the rest as locked showroom silhouettes if a full ten-physics pass is too wide — **prefer all ten driveable** with distinct mass/grip/accel).
- Original silhouettes (not boxes that all look the same). Wheels visible outside the hull.
- Tune stubs: Engine/Brakes/Steering/Tyres Street/Sport multipliers on that car’s base.
- Showroom lists them. Starter owned; others priced in Sparks even if save is local-only.

### WP4 — City kit (no `world` unless you prove you must)

`CityGenerator` + `city.config` / district envelope toward Old Neon + East Gate *look*.

- Eight facade families, ground-floor depth, 80–90% frontage on the main streets you can reach **inside the current plate first**.
- Crossing composition at the existing loop.
- East Gate: if the current “bridge” is a mesh/prop, replace with a solid embankment **without** rebaking if possible. If it is carved terrain, stop and report — that is WP6.
- Pedestrians/traffic caps from the plan (6/12). Knockback as specified. Do not smash every house.

Growing to 2.60 km² is **not** this package. This package makes the **existing** city look like a place.

### WP5 — Stillwater Village + harbour port (no `world` if props suffice)

- **Stillwater Village** at western farmhouse: bent lane, mill house, wheel into the wall, pond/leat as a *local* water mesh at terrace height (not a new global river), goats/chickens as cheap instances, mill interior.
- **Tideglass Harbour**: upgrade existing huts/lane, keep ocean boats, Net House. Not the beauty peak.
- Discoveries as simple Inspect/Use at the named spots if cheap; skip puzzle polish if it blocks the place.

Use `PropSystem` / `props.json` / local meshes. Do not eat the whole paddy mask.

### WP6 — New roads / Needle / 4× city (bake allowed, once)

Only after WP4–5 look right in-game.

- New splines in the road generator / `roads.json` workflow.
- `npm run bake:clean` then `roads` then `bake` as the project requires — **never `roads` on a carved field**.
- Needle Circuit + Orchard Bypass + East Gate as real roads if still fake.
- Expand city envelope onto the new land with the same kit.

Measure: game boots, a car drives Commons → existing city → village without falling through. If erosion moves the pass, say so in the PR comment; do not hide it.

---

## Done per package

- Typecheck clean.
- Player-facing English.
- A short note at the top of the PR/commit: what the player can *do* now, not a file list.
- If you skip a plan pin, say why (player or engine), don’t silently drop Stillwater back onto the harbour.
