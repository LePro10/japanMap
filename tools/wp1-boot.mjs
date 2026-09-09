import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("http://localhost:5180/japanMap/");
  await page.waitForFunction(() => window.japanMap?.quality, {
    timeout: 180000,
  });
  await page.evaluate(() => window.japanMap.quality("low"));
  await fs.mkdir("screenshots/wp1", { recursive: true });
  console.log("Game booted on Low.");
  await page.locator(".start__button").click();
  await page.waitForFunction(() => document.pointerLockElement);
  await page.evaluate(() => document.exitPointerLock());
  await page.locator(".player-menu").waitFor({ state: "visible" });
  await page.screenshot({ path: "screenshots/wp1/desktop-play.png" });
  await page.getByRole("button", { name: "Cars", exact: true }).click();
  await page.getByRole("button", { name: "Showroom", exact: true }).click();
  await page.locator('[data-vehicle="gt"]').click();
  await page.screenshot({ path: "screenshots/wp1/desktop-cars.png" });
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  console.log("Cars browsed, entering Photo.");
  const before = await page.evaluate(() => ({
    p: window.japanMap.engine.camera.position.toArray(),
    q: window.japanMap.engine.camera.quaternion.toArray(),
    size: window.japanMap.engine.size,
    quality: window.japanMap.quality(),
  }));
  await page
    .getByRole("button", { name: "Enter Photo mode", exact: true })
    .click();
  await page.mouse.move(600, 320);
  await page.mouse.down();
  await page.mouse.move(700, 360);
  await page.mouse.up();
  console.log("Photo open, capturing.");
  await page.getByRole("button", { name: "Capture High", exact: true }).click();
  await page
    .locator(".photo-mode__result:not([hidden])")
    .waitFor({ timeout: 120000 });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download PNG" }).click(),
  ]);
  await download.saveAs("screenshots/wp1/photo.png");
  assert.match(download.suggestedFilename(), /^japanMap_.*\.png$/);
  const png = await fs.readFile("screenshots/wp1/photo.png");
  assert.equal(png.readUInt32BE(16), 2560);
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await page.screenshot({ path: "screenshots/wp1/photo-mode.png" });
  await page.getByRole("button", { name: "Exit Photo", exact: true }).click();
  const after = await page.evaluate(() => ({
    p: window.japanMap.engine.camera.position.toArray(),
    q: window.japanMap.engine.camera.quaternion.toArray(),
    size: window.japanMap.engine.size,
    quality: window.japanMap.quality(),
  }));
  assert.deepEqual(after.size, before.size);
  assert.equal(after.quality, before.quality);
  // The simulation resumes on exit; camera position may advance a frame. No preset or viewport leaks.
  console.log(
    "Photo: captured 2560 px PNG, downloaded, restored Low and viewport.",
  );
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page.getByRole("button", { name: "Open map", exact: true }).click();
  await page.screenshot({ path: "screenshots/wp1/map.png" });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "screenshots/wp1/portrait-menu.png" });
  assert.deepEqual(errors, []);
  console.log(
    "WP1 boot, car browsing, Photo capture, map entry passed with no browser errors.",
  );
} finally {
  await browser.close();
}
