Players can open six menu destinations, browse owned cars without accidentally switching or buying, call a nearby car, inspect saved event bests, and take a clean downloadable photo. The driving HUD now shows automatic gear, RPM, speed and Nitro, with phone Brake / Drift / Boost controls.

WP1 choices:

- The four existing cars use lightweight catalogue illustrations. No second renderer, new car downloads, invented ownership or Sparks balance. Buying and tuning remain explicit stubs for later work.
- Gear/RPM uses the same five automatic speed bands as the existing engine audio. Nitro is a separate blue bar so it cannot be mistaken for RPM.
- Photo freezes simulation and uses the existing renderer. High capture increases resolution, capped at 2560 pixels on desktop and 1920 on phones, without switching quality presets. Capture failure offers a smaller attempt. Exiting restores the camera; Return to game resumes driving.
- Phones keep one scenic loading image and truthful progress instead of downloading the slideshow and decorative island. The menu map image loads when opened.
- Stillwater Village is labelled at the western farmhouse, X −1244 / Z 409. The eastern working port is Tideglass Harbour. No world assets were rebaked.
- Existing pause, race and entry/exit behavior was not repaired. The small engine/input additions only support Photo rendering and the new Boost action.

Verification uses Chromium (Node 20+): `npm ci`, then `npx playwright-core install chromium`.

With `npm run dev -- --port 5180 --strictPort` running:

- `npm run test:wp1`: menu navigation, safe showroom behavior, records, phone tab targets at 130%, instruments, touch cancellation, Photo keyboard isolation and exact camera restoration.
- `npm run test:wp1:boot`: real Low game boot, desktop Photo PNG download and map entry.

After `npm run build`, with `npm run preview -- --port 5181 --strictPort` running:

- `npm run test:wp1:phone`: production touch flow, first-load budget below 18,000,000 bytes, HUD clearance, capped PNG, injected capture failure, smaller capture recovery and quality restoration.

Screenshots are in `screenshots/wp1/`. Measurements use the local production server and browser phone emulation; they are not physical-device frame-rate measurements.
