import { chromium } from "playwright-core";
import assert from "node:assert/strict";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  await page.route("**/src/main.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'import "/japanMap/src/style.css";',
    }),
  );
  await page.goto("http://localhost:5180/japanMap/");
  await page.evaluate(() => document.querySelector("#loading")?.remove());
  const readings = await page.evaluate(async () => {
    const { instruments } = await import("/japanMap/src/ui/instruments.ts");
    return [0, -4, 5, 14, 26, 40, 56, 75, 150, NaN].map(instruments);
  });
  assert.deepEqual(
    readings.map((r) => r.gear),
    ["N", "R", "1", "2", "3", "4", "5", "5", "5", "N"],
  );
  assert.ok(
    readings.every(
      (r) =>
        r.rpm >= 850 && r.rpm <= 7200 && r.fraction >= 0 && r.fraction <= 1,
    ),
  );
  await page.evaluate(async () => {
    const { DriveHud } = await import("/japanMap/src/ui/DriveHud.ts");
    const { TouchControls } = await import("/japanMap/src/ui/TouchControls.ts");
    const hud = (window.testHud = new DriveHud(
      document.querySelector("#overlay"),
    ));
    hud.setDriveActive(true);
    hud.update(
      { forwardSpeed: 20, boost: 0.6, boosting: true },
      0,
      false,
      null,
    );
    const state = (window.touchState = {
      boost: false,
      brake: false,
      forward: 0,
    });
    const touch = (window.testTouch = new TouchControls({
      canvas: document.querySelector("canvas"),
      container: document.querySelector("#overlay"),
      onMenu() {},
      camera: {
        setAxes(f) {
          state.forward = f;
        },
        look() {},
        scaleSpeed() {},
        toggleCollision() {
          return false;
        },
        resetToStart() {},
        speed: 1,
      },
      drive: {
        active: true,
        walking: false,
        toggle() {},
        toggleVehicle() {},
        respawn() {},
        setHandbrake(v) {
          state.brake = v;
        },
        setBoost(v) {
          state.boost = v;
        },
        setJump() {},
      },
    }));
    touch.setDriveMode(true, false);
    touch.setVisible(true);
  });
  assert.equal(await page.locator("[data-hud=gear]").innerText(), "2");
  assert.equal(await page.locator("[data-hud=speed]").innerText(), "72");
  assert.equal(await page.locator(".hud__lap").isVisible(), false);
  const boost = page.getByRole("button", { name: "Boost", exact: true });
  await boost.dispatchEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
  });
  assert.equal(await page.evaluate(() => window.touchState.boost), true);
  await boost.dispatchEvent("pointercancel", {
    pointerId: 1,
    pointerType: "touch",
  });
  assert.equal(await page.evaluate(() => window.touchState.boost), false);
  await boost.dispatchEvent("pointerdown", {
    pointerId: 2,
    pointerType: "touch",
  });
  await page.evaluate(() => window.testTouch.setVisible(false));
  assert.equal(
    await page.evaluate(() => window.touchState.boost),
    false,
    "Opening a menu must release Boost",
  );
  await page.evaluate(() => window.testTouch.setVisible(true));
  const brake = page.getByRole("button", { name: "Brake", exact: true });
  await brake.dispatchEvent("pointerdown", {
    pointerId: 3,
    pointerType: "touch",
  });
  assert.equal(await page.evaluate(() => window.touchState.forward), -1);
  await brake.dispatchEvent("pointerup", {
    pointerId: 3,
    pointerType: "touch",
  });
  assert.equal(await page.evaluate(() => window.touchState.forward), 0);
  for (const size of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    const instrument = await page.locator(".hud__speedo").boundingBox();
    assert.ok(
      instrument.x >= 0 &&
        instrument.y >= 0 &&
        instrument.x + instrument.width <= size.width &&
        instrument.y + instrument.height <= size.height,
    );
    for (const control of [
      boost,
      brake,
      page.getByRole("button", { name: "Drift", exact: true }),
    ]) {
      const b = await control.boundingBox();
      assert.ok(
        b.width >= 56 && b.height >= 56 && b.y + b.height <= size.height,
      );
    }
    await page.screenshot({
      path: `screenshots/wp1/instruments-${size.width}.png`,
    });
  }
  await page.evaluate(() => {
    document.documentElement.dataset.speedUnits = "mph";
    window.testHud.update(
      { forwardSpeed: 20, boost: 0.6, boosting: false },
      0,
      false,
      null,
    );
  });
  assert.equal(await page.locator("[data-hud=speed]").innerText(), "45");
  await page.evaluate(() => {
    window.testHud.setWalking(true);
    window.testHud.setDriveActive(false);
  });
  assert.equal(await page.locator(".hud__speedo").isVisible(), false);
  console.log(
    "Instruments: gear bands, reverse/neutral, speed units, nitro cancel/menu release, brake release, phone targets, on-foot hiding passed.",
  );
} finally {
  await browser.close();
}
