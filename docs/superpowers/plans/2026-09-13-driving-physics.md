# Driving physics implementation plan

**Goal:** Enjoyable offroad progress and predictable contact without mountain climbing exploits.
**Architecture:** Keep Vehicle/ArcadeDynamics/RoadGround and one authoritative heightfield. Split hull support from wall blocking; bound scrape resistance and slope-scaled drive assistance.
**Tech stack:** TypeScript, Three.js, Node regression benches, Vite.
**Spec:** ../specs/2026-09-13-driving-physics-design.md

## Constraints

Keep all ten asphalt identities, tuning and saved IDs. No world rebake or new runtime dependency is needed for physics changes. Constants belong in config. Tests run production Vehicle at 60 Hz, with 120 Hz comparisons for contact stability.

## Tasks

- [x] Add `tools/bench/offroad-contact.mts`: measured regression cases for forward/reverse slope entry, mild terrain contact with downward velocity, 20-degree utility progress, and sustained boosted cliff attempts. Confirm failures before fixes.
- [x] Update `src/game/hullTerrain.ts` and add `src/config/groundContact.config.ts`: floor support does not impose planar impulses; wall response blocks horizontally; bounded scrape deceleration. Check underside clearance and ramp regressions.
- [x] Update `src/game/arcadeDynamics.ts`, `src/config/arcade.config.ts`, and Vehicle's environment: surface resistance and explicit uphill assistance inside the available traction budget, symmetric for reversing and disabled without contact. Preserve stock asphalt results.
- [x] Check road shoulder height/normal consistency and collision grazing. Fix only reproduced defects, with targeted failing regressions.
- [x] Include new regressions in `test:polish`; run full suite, handling, typecheck/build and browser driving checks. Save current-world before/after results and engine research in `docs/2026-09-13-physics.md`.

## Completed extensions from reproduced failures

- Correct wheel track/roll signs and solve rendered wheel suspension at actual rotated XZ.
- Use current chassis pose and persistent near-contact support when resolving the underside.
- Keep wall collision active without reachable wheels; the 90-second Pip descent regression now passes.
- Remove planar braking from the emergency floor catch; retain ramp redirection explicitly.
- Full-world matrix: all 50 drives below 2 km/h single-step loss, all ten ring runs on-road without solid contacts. The old toge/sando controller remains diagnostic, not acceptance.
- Independent review: no remaining blocking findings. Manual feel and real-phone performance are explicitly not certified by software-rendered automation.

Results and engine sources: [Physics report](../../2026-09-13-physics.md).
