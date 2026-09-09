Players can start on foot, enter their car immediately, drive out of Sakura Commons, and call the selected car back to checked parking in the court or on a nearby road.

WP2 only. The existing bowl anchor is (550, 510); the car starts four metres north, facing east with its driver's side visible. Petal Motors opens Cars; Open Bay opens the garage with a Tune preview. Walk to a warm doorway and press Enter or tap its button. Tuning remains unavailable.

Player-driven departures from the specification:

- The initial screenshot showed ordinary trees and tall grass hiding the car. Runtime vegetation placement now reserves a 55 m court and an eastern exit strip. Authored sakura remain; terrain was not rebaked.
- Shops moved to offsets (−22, −32) and (22, −32): the planned (±38, −22) positions were outside the first camera view.
- Five gold markers and forgiving cones fit inside the 62 m bowl. The larger planned loop crossed the tree ring. This is optional untimed practice with a completion message and explicit reward stub; no race countdown, currency grant, or car unlock is added.

Verification: `npm run typecheck`, `npm run test:wp1`, and `node tools/wp2-boot.mjs` (dev server on port 5180). The browser test uses actual keyboard driving beyond the bowl, checks the four-metre spawn and court recall, operates both doorway prompts, and exercises marker completion without starting a race. Screenshots are in `screenshots/wp2/`.

`ASTRA_OWNER.md` was absent from this checkout and the searched parent project tree. Followed the supplied user scope, `ASTRA_BUILD.md` WP2, and the Commons section of `ASTRA_PLAN.md`. Existing WP1 work was preserved. No `PLAN.md`, `CLAUDE.md`, world bake, city expansion, or unrelated bug work.
