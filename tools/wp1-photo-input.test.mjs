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
    document.querySelector("#loading")?.remove();
    const engine = (window.photoEngine = new Engine(
      document.querySelector("canvas"),
    ));
    engine.resize(844, 390);
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
    };
    window.openTestPhoto = () =>
      photo.open("touge", "Island", () => {
        window.restoredCamera = {
          p: engine.camera.position.toArray(),
          q: engine.camera.quaternion.toArray(),
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
  await page.mouse.move(400, 180);
  await page.mouse.down();
  await page.mouse.move(500, 210);
  await page.mouse.up();
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
    "Photo keyboard isolation, frozen simulation, exact camera restoration and shortcut cleanup passed.",
  );
} finally {
  await browser.close();
}
