# Integration on the current remote

Base: `f2e769e8860307dcddbc43d16f90eb104b1fdaf6` (origin/master).
Earlier work is backed up in stash `dd19cbacbac75417fbc5d31825852367458030bb`, based on `723e2b6`.

## Integration plan

1. Preserve the remote world assets, 72 roads, eight city facade families, CityCrowd, Terrace Track, surface-specific handling, paid tuning/Open Bay and photo mode.
2. Merge road contact/marking corrections and missing driving fixes against the current implementations.
3. Bring over exact terrain contact, lossless height loading, flat-terrain geometry optimization, race fixes and smashable props.
4. Run focused regressions plus current city/offroad/circuit/tuning checks; verify the running game and production build before committing.

The stale CityGenerator/PedestrianSystem and East Gate foundation are deliberately omitted: the remote already provides a richer city/crowd and a baked embankment. Existing pause sleep and photo rendering remain the basis. No terrain or road rebake, no SDK integration.

## Validation

Checks rerun on this integrated map:

- `npm run typecheck` and `npm run build` pass, including asset packing and Brotli output.
- `npm run test:polish`: 15 regression programs pass. This includes current city, offroad, circuit/layout, tuning math, banked road contact, marking exclusions, suspension, handbrake/boost, seven ramps, debris and smashables.
- Terrain contact matches rendered triangles at 102,142 sampled points (maximum error below 1e-6 m). Banked road contact differs by at most 6.9 mm in the synthetic grade tests.
- Height codec round-trips all 4,194,304 samples exactly: 3,542,178 bytes packed versus 5,883,887 bytes for gzipped raw data. The packed asset is regenerated from the current raw heightmap by predev/prebuild; no old terrain asset was restored.
- Exact-flat city terrain uses 36 optimized nodes, saving 64,512 triangles in the street view. Nonflat regions retain the complete grid.
- Browser runtime: 88 smashable props, real pause/resume, safe parking/reboarding and integrated debris pass without page errors.
- All six events: distinct starting slots, locked countdown, physical launch/active rivals and checkpoint/finish completion pass.
- Existing Open Bay test passes purchase, TUNED badge, engine camera and Escape; existing photo test passes camera flight, frozen simulation, capture quality restoration and input cleanup.
- Fresh screenshots cover city, pass, temple, paddies, harbour, Stillwater and Commons in `screenshots/remote-integration/`. Earlier eight-road reports are not current evidence.
- Production phone cold boot passes both decoding paths: 15,712,208 bytes transferred with packed height data versus 18,052,814 with the legacy fallback; exactly one height asset requested in either case, no page errors.
- Terrain seam diagnostic: zero holes across 16 viewpoints; deliberately broken morphing produces detectable holes.

The stale branch's three absolute offroad speed/acceleration tests are not imported: they predate the remote's vehicle/setup tuning. The retained upstream `wp-offroad.test.mts` validates its crawl, ford and traction requirements. The grip transition check now respects the authored 0.25-second exponential time constant rather than expecting a fully completed transition after 0.25 seconds.

Independent code review found no blocking integration regression. Low/Minimal now use four times the nonflat terrain triangles per node to maintain visible wheel contact; city flat-node savings do not eliminate that mountain cost. Software-renderer measurements cannot establish target-device frame rates.

Mountain check at the verified `pass-kehren` camera: Low 327,123 visible triangles, Minimal 326,812. Four-frame software-renderer medians were 313.3/205.5 ms respectively; these are diagnostic measurements, not hardware FPS claims. Detailed results are in `screenshots/remote-integration/report.json`.
