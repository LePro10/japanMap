import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await page.route("**/src/main.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'import "/japanMap/src/style.css";',
    }),
  );
  await page.goto("http://localhost:5180/japanMap/");
  await page.evaluate(async () => {
    const { Engine } = await import("/japanMap/src/core/Engine.ts");
    const { PhotoMode } = await import("/japanMap/src/ui/PhotoMode.ts");
    const { QualitySystem } = await import(
      "/japanMap/src/render/QualitySystem.ts"
    );
    document.querySelector("#loading")?.remove();
    document.querySelector("#boot")?.remove();
    const engine = (window.photoEngine = new Engine(
      document.querySelector("canvas"),
    ));
    engine.resize(844, 390);
    window.photoUpdates = 0;
    window.photoSteps = 0;
    window.photoQuality = [];
    engine.add({
      name: "probe",
      update() {
        window.photoUpdates++;
      },
      fixedUpdate() {
        window.photoSteps++;
      },
      dispose() {},
    });
    const quality = new QualitySystem("low");
    engine.add(quality);
    quality.init(engine.context);
    window.photoQualitySystem = quality;
    engine.bus.on("quality:changed", ({ level, transient }) => {
      window.photoQuality.push({ level, transient: Boolean(transient) });
    });
    const photo = (window.photoTest = new PhotoMode(
      engine,
      document.querySelector("#overlay"),
    ));
    window.photoKeys = 0;
    window.addEventListener("keydown", (event) => {
      if (event.code === "KeyM") window.photoKeys++;
    });
    window.originalCamera = {
      p: engine.camera.position.toArray(),
      q: engine.camera.quaternion.toArray(),
      fov: engine.camera.fov,
    };
    window.openTestPhoto = () =>
      photo.open("touge", "Island", () => {
        window.restoredCamera = {
          p: engine.camera.position.toArray(),
          q: engine.camera.quaternion.toArray(),
          fov: engine.camera.fov,
        };
        engine.stop();
      });
    window.openTestPhoto();
  });
  await page.keyboard.press("m");
  await page.keyboard.press("m");
  assert.equal(
    await page.evaluate(() => window.photoKeys),
    0,
    "Photo must intercept underlying map shortcuts",
  );
  assert.equal(
    await page.evaluate(() => window.photoEngine.loop.running),
    false,
    "Simulation stays frozen",
  );
  await page.waitForFunction(() => window.photoUpdates > 2);
  assert.equal(
    await page.evaluate(() => window.photoSteps),
    0,
    "Physics must not step while composing",
  );
  const beforeFly = await page.evaluate(() =>
    window.photoEngine.camera.position.toArray(),
  );
  await page.keyboard.down("w");
  await page.waitForFunction((start) => {
    const p = window.photoEngine.camera.position;
    return p.x !== start[0] || p.y !== start[1] || p.z !== start[2];
  }, beforeFly);
  await page.keyboard.up("w");
  const y0 = await page.evaluate(() => window.photoEngine.camera.position.y);
  await page.keyboard.down("Space");
  await page.waitForFunction((y) => window.photoEngine.camera.position.y > y + 0.2, y0);
  await page.keyboard.up("Space");
  const y1 = await page.evaluate(() => window.photoEngine.camera.position.y);
  await page.keyboard.down("Shift");
  await page.waitForFunction((y) => window.photoEngine.camera.position.y < y - 0.2, y1);
  await page.keyboard.up("Shift");
  const fov0 = await page.evaluate(() => window.photoEngine.camera.fov);
  await page.mouse.move(400, 180);
  await page.mouse.wheel(0, 240);
  const fov1 = await page.evaluate(() => window.photoEngine.camera.fov);
  assert.ok(fov1 > fov0, "Wheel must zoom out (wider FOV)");
  await page.mouse.down();
  await page.mouse.move(500, 210);
  await page.mouse.up();
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = function (cb) {
      cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
    };
    window.photoQuality = [];
  });
  await page
    .getByRole("button", { name: "Capture High", exact: true })
    .click({ force: true });
  await page.locator(".photo-mode__result:not([hidden])").waitFor();
  const capture = await page.evaluate(() => ({
    level: window.photoQualitySystem.level,
    events: window.photoQuality,
  }));
  assert.equal(capture.level, "low", "Gameplay preset must return after Capture High");
  assert.ok(
    capture.events.some((event) => event.level === "ultra" && event.transient),
    "Capture High must raise one transient Ultra frame",
  );
  assert.deepEqual(capture.events.at(-1), {
    level: "low",
    transient: true,
  });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".photo-mode").count(), 0);
  assert.deepEqual(
    await page.evaluate(() => window.restoredCamera),
    await page.evaluate(() => window.originalCamera),
  );
  await page.keyboard.press("m");
  assert.equal(
    await page.evaluate(() => window.photoKeys),
    1,
    "Game shortcuts work again after Photo exits",
  );
  await page.evaluate(() => {
    window.photoTest.dispose();
    window.photoEngine.dispose();
  });
  console.log(
    "Photo WASD/Space/Shift flight, wheel zoom, streaming preview, frozen simulation, Capture High Ultra-then-restore, exact camera restoration and shortcut cleanup passed.",
  );
} finally {
  await browser.close();
}
