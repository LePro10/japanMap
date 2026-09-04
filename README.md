# japanMap

An open-world driving game in the browser: a 3 × 3 km Japanese landscape at
blue hour after rain — mountain pass, forest temple, rice paddies, neon city
and coast — with arcade driving, drift scoring, races against AI rivals and
90 collectibles. Built with vanilla Three.js + TypeScript + Vite, no game
engine.

![Overview of the map](screenshots/01-uebersicht.png)

> **Play it:** https://lepro10.github.io/japanMap/
> (deployed from `master` via GitHub Pages)

---

## The game

You start on foot in the sakura bowl. Press **F** to get in the car and drive.

| Input | Action |
|---|---|
| `W` / `S` | throttle / brake (reverse when stopped) |
| `A` / `D` | steer |
| `Space` | handbrake (drift) |
| `C` | camera: chase / hood |
| `R` | respawn on the nearest road |
| `F` | get out of the car |
| `M` | world map |
| `V` | free camera |
| `Esc` | menu |

Touch controls (stick + buttons) are built in — the game runs on phones, not
just desktops.

**Content:**

- **6 events** — 4 races with up to 3 AI rivals
  (Coast Loop, Tōge Descent, Neon Circuit, Tōge Climb), a Ring Time Trial and
  a Tōge Drift Run
- **4 vehicles, one physics model** — Touge Coupé, GT, Offroad 4×4, Truck;
  earn ¥ from races, drift chains and collectibles to unlock them
- **Drift scoring** with chain multiplier up to ×5, doubled in two drift zones
- **6 jump ramps**, 90 pickups, minimap with rivals and checkpoint arrow

![Neon city street](screenshots/03-stadt-strasse.png)
![Sunset drive over the paddies](screenshots/11-drift-hinten.png)

## Screenshots

| | |
|---|---|
| ![Serpentines of the mountain pass](screenshots/05-bergpass.png) | ![Torii path to the temple](screenshots/06-tempelpfad.png) |
| ![On the ring road, mountain ahead](screenshots/09-fahren-ring.png) | ![City below the massif](screenshots/02-stadt-aussen.png) |
| ![Spray on the water at sunset](screenshots/12-wasser-spritzer.png) | ![Coast run with lighthouse](screenshots/14-wasser-spritzer-seite.png) |

All 15 shots live in [`screenshots/`](screenshots/) — including rice fields,
fishing village, open sea and the water-particle test series.

---

## The tech (short version)

- **Baked, deterministic world.** Terrain, roads, shadows and navigation data
  are generated offline from a seed (`npm run world`) and loaded as static
  files — bit-identical on every run. Nothing procedural happens at load time
  that could surprise you.
- **One fixed mood.** No day/night cycle: blue hour after rain, baked terrain
  shadows, height fog, planar reflections on wet asphalt, AgX tone mapping.
- **Scales from phone to desktop.** Five quality presets (ultra → minimal)
  plus a custom tier, an auto-calibration pass and a background asset upgrader.
  Budgets: < 800 draw calls, < 3 M triangles, < 512 MB texture memory.
- **Measured, not claimed.** Every performance statement in this repo comes
  from a run: in-browser benchmarks (`window.japanMap` in dev builds) and
  headless physics test rigs under `tools/bench/`.

Details: [`SPEC.md`](SPEC.md) (what) · [`ARCHITECTURE.md`](ARCHITECTURE.md)
(where) · [`PLAN.md`](PLAN.md) (in what order) · [`CLAUDE.md`](CLAUDE.md) (how
we work). These four are written in German; the game UI itself is English.

---

## Run it locally

Requirements: **Node ≥ 22**.

```bash
npm install
npm run world   # bake terrain, roads, shadows, map (takes a while, run once)
npm run dev     # dev server, then open the printed URL
```

Other useful commands:

```bash
npm run typecheck   # TypeScript, must be clean
npm run build       # production build
npm run preview     # serve the production build
npm run fleet       # vehicle test rig: all 4 cars, 8 probes, no browser
```

> After a fresh clone you must run `npm run world` before `npm run dev`:
> `assets/generated/` is git-ignored and reproduced from seed + tools.

---

## Project layout

```
src/
├── core/     Engine, RenderLoop, EventBus, ResourceManager
├── world/    terrain, roads, water, vegetation, props, city, stunt, materials
├── game/     driving, collision, AI rivals, races, drift scoring, cameras
├── render/   post-processing, lighting, reflections, quality, atmosphere
├── audio/    engine + event sounds
├── ui/       start screen, pause menu, HUD, minimap, touch controls
├── debug/    dev-only overlay, benchmarks, editors
└── config/   all magic numbers live here, never in code

tools/       terrain/shadow/road bakers, asset pipeline, test rigs (bench/),
             smoke test, image diff
assets/      checked-in sources (HDRIs, textures, props.json)
assets/generated/  baked output (git-ignored, see above)
```

---

## Assets & credits

All third-party assets are **CC0** (public domain), mostly via
[Poly Haven](https://polyhaven.com) — see
[`assets/CREDITS.md`](assets/CREDITS.md) for the full list and authors.
