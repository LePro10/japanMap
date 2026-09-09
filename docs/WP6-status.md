Players keep the existing, previously verified world: Sakura Commons, the city, Stillwater Village and Tideglass Harbour. The unfinished WP6 world is not active.

On 9 September, the owner requested a quick stable checkpoint and push because the PC was repeatedly crashing. No final terrain bake, browser render test or stress test was run after that instruction. The original generated terrain and roads were restored from the backup taken before WP6. Earlier package changes are preserved.

WP6 source work is retained behind `node tools/gen-roads.mjs --wp6`. The normal `roads` command retains its original layout. The draft contains Needle's 900 m straight, an Orchard reroute within the continuous ring, urban streets, shared junction profiles and individual city terraces. Runtime terraces only activate when the road file contains their metadata; the restored road file does not.

The draft is **not complete or approved for play**. City coverage, junction meshes, circuit presentation/traction and real Commons → city → village traversal still need validation. The draft network passed its numeric road checks before restoration; that is not a driving acceptance test. Do not publish a newly generated WP6 road file over the restored terrain.

The clean bake was performed once. The final carved bake was never started. Any future generation must again respect `bake:clean` → `roads --wp6` → `bake`; never generate roads against a carved field. Obtain renewed authorization for expensive runs before resuming, given the owner's latest PC constraint.

Pass disclosure: the unshipped draft retained the measured 3.502 km length and four hairpins, but its full coordinate/height comparison was not completed. No claim of an unchanged draft pass is made. The active pass was restored with the original road file and terrain.

Checkpoint checks: TypeScript exited 0 with Idle priority and one CPU core; the shared-profile unit test, restored ring/pass junction test and WP5 raised-lane ground test passed. `git diff -- assets/generated` was empty after restoration. A fresh browser boot and production build were deliberately not run under the owner's PC constraint; earlier WP5 boot/traversal evidence remains documented in `WP5-stillwater.md`.
