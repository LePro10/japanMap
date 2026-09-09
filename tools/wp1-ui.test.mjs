import { chromium } from "playwright-core";
import assert from "node:assert/strict";

// Exercise the player UI against real DOM events with deterministic game adapters.
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto("http://localhost:5180/japanMap/");
  await page.evaluate(async () => {
    const { PlayerUi } = await import("/japanMap/src/ui/PlayerUi.ts");
    const { EventBus } = await import("/japanMap/src/core/EventBus.ts");
    document.body.innerHTML = '<canvas></canvas><div id="fixture"></div>';
    const bus = new EventBus();
    const state = (window.wp1 = {
      selected: "touge",
      calls: 0,
      maps: 0,
      photos: 0,
      buys: 0,
    });
    const ui = new PlayerUi({
      bus,
      canvas: document.querySelector("canvas"),
      container: document.querySelector("#fixture"),
      camera: {
        look() {},
        setAxes() {},
        scaleSpeed() {},
        toggleCollision() {
          return false;
        },
        resetToStart() {},
        speed: 1,
        placeAt() {},
      },
      quality: {
        level: "low",
        set() {},
        setCustom() {},
        seedCustomFrom() {},
        reclassify() {},
      },
      drive: {
        active: false,
        walking: true,
        get vehicleId() {
          return state.selected;
        },
        setVehicle(id) {
          state.selected = id;
        },
        toggle() {},
        toggleVehicle() {},
        respawn() {},
        setHandbrake() {},
        setJump() {},
      },
      openMap() {
        state.maps++;
      },
      callCar() {
        state.calls++;
        return "Your car is nearby.";
      },
      openPhoto() {
        state.photos++;
      },
      events: {
        list: [
          {
            id: "test",
            name: "Mountain run",
            kind: "time",
            laps: 1,
            rivals: 0,
            blurb: "A mountain drive.",
          },
        ],
        yen: 50000,
        bestOf() {
          return 72.5;
        },
        driftBestOf() {
          return 0;
        },
        runningEvent: null,
        start() {},
        abort() {},
        owns(id) {
          return id === "touge";
        },
        price() {
          return 100;
        },
        buy() {
          state.buys++;
          return true;
        },
        enterCode() {
          return false;
        },
        onChange() {},
      },
    });
    ui.begin();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Escape", key: "Escape" }),
    );
  });
  const tabs = page.locator(".menu__tab");
  assert.deepEqual(await tabs.allTextContents(), [
    "Play",
    "Cars",
    "Map",
    "Records",
    "Photo",
    "Settings",
  ]);
  await page.locator(".menu__resume").focus();
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator(".player-menu").evaluate((el) => el.hidden),
    true,
    "Escape must close the menu even with focus on a menu button",
  );
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }),
    );
  });
  assert.equal(
    await page.locator(".player-menu").evaluate((el) => el.hidden),
    false,
    "Escape reopens the menu while playing",
  );
  await page.getByRole("button", { name: "Call car", exact: true }).click();
  assert.equal(await page.evaluate(() => window.wp1.calls), 1);
  await page.getByRole("button", { name: "Cars", exact: true }).click();
  await page.getByRole("button", { name: "Showroom", exact: true }).click();
  await page.locator('[data-vehicle="gt"]').click();
  assert.equal(
    await page.evaluate(() => window.wp1.selected),
    "touge",
    "Browsing must not change the car",
  );
  assert.equal(await page.evaluate(() => window.wp1.buys), 0);
  await page.getByRole("button", { name: "Records", exact: true }).click();
  assert.match(
    await page.locator('[data-panel="records"]').innerText(),
    /1:12/,
  );
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    for (const button of await tabs.all()) {
      const box = await button.boundingBox();
      assert.ok(
        box &&
          box.width >= 48 &&
          box.height >= 48 &&
          box.x >= 0 &&
          box.y + box.height <= size.height,
        `Reachable tab at ${size.width}`,
      );
    }
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Accessibility" }).click();
  await page.locator(".menu__scale").selectOption("130");
  for (const button of await tabs.all()) {
    const box = await button.boundingBox();
    assert.ok(
      box.width >= 48 && box.height >= 56 && box.y + box.height <= 800,
      "130% portrait tabs remain reachable",
    );
  }
  await page.screenshot({ path: "screenshots/wp1/portrait-large-menu.png" });
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: "Open map", exact: true }).click();
  assert.equal(await page.evaluate(() => window.wp1.maps), 1);
  await page.locator(".menu__resume").focus();
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator(".player-menu").evaluate((el) => el.hidden),
    true,
    "Escape must close the menu even with focus on a menu button",
  );
  console.log(
    "WP1: six tabs, call car, safe showroom, saved records, responsive targets, map entry, Escape close passed.",
  );
} finally {
  await browser.close();
}
