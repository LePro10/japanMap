import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5181/japanMap/");
  await page
    .locator(".start__button")
    .waitFor({ state: "visible", timeout: 180000 });
  const load = await page.evaluate(() => {
    const r = performance.getEntriesByType("resource");
    return {
      transfer: r.reduce((sum, e) => sum + e.transferSize, 0),
      resources: r.length,
    };
  });
  console.log("Production phone loaded:", JSON.stringify(load));
  await fs.writeFile(
    "screenshots/wp1/low-load.json",
    JSON.stringify(load, null, 2),
  );
  assert.ok(load.transfer < 18000000, "Phone first load must stay below 18 MB");
  await page.locator(".start__button").click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("[data-level=low]").click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByRole("button", { name: "Call car", exact: true }).click();
  assert.match(
    await page.locator(".menu__status").innerText(),
    /parked|already beside|No clear parking/,
  );
  await page.screenshot({ path: "screenshots/wp1/phone-play.png" });
  await page.getByRole("button", { name: "Enter car", exact: true }).click();
  await page.locator(".hud__speedo").waitFor({ state: "visible" });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: "screenshots/wp1/phone-drive.png" });
  const instruments = await page.locator(".hud__speedo").boundingBox();
  for (const control of await page
    .locator(".touch__side button:visible")
    .all()) {
    const b = await control.boundingBox();
    assert.ok(
      b.y + b.height <= instruments.y ||
        b.x + b.width <= instruments.x ||
        b.x >= instruments.x + instruments.width,
      "Shortcuts must not cover gear",
    );
  }
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  await page
    .getByRole("button", { name: "Enter Photo mode", exact: true })
    .click();
  await page.getByRole("button", { name: "Capture High", exact: true }).click();
  await page
    .locator(".photo-mode__result:not([hidden])")
    .waitFor({ timeout: 120000 });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download PNG" }).click(),
  ]);
  await download.saveAs("screenshots/wp1/phone-photo.png");
  const png = await fs.readFile("screenshots/wp1/phone-photo.png");
  assert.ok(png.readUInt32BE(16) <= 1920 && png.readUInt32BE(20) <= 1920);
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await page.evaluate(() => {
    window.originalBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb) {
      cb(null);
    };
  });
  await page.getByRole("button", { name: "Capture High", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "could not finish" })
    .waitFor();
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = window.originalBlob;
  });
  await page
    .getByRole("button", { name: "Capture smaller", exact: true })
    .click();
  await page
    .locator(".photo-mode__result:not([hidden])")
    .waitFor({ timeout: 120000 });
  await page
    .getByRole("button", { name: "Return to game", exact: true })
    .click();
  await page.locator(".hud__speedo").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(
    await page.locator("[data-level=low]").getAttribute("class"),
    "is-active",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Production phone: playable HUD, safe call response, capped PNG, capture failure recovery, Return to game and Low restoration passed.",
  );
} finally {
  await browser.close();
}
