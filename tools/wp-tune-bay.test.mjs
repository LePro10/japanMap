import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--no-sandbox",
  ],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (error) =>
    errors.push(`pageerror: ${error.message}\n${error.stack ?? ""}`),
  );
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "japanmap.profile",
      JSON.stringify({
        yen: 20000,
        owned: ["touge"],
        sandbox: false,
        bestByEvent: {},
        driftByEvent: {},
      }),
    );
    localStorage.removeItem("japanmap.tune.touge");
    localStorage.setItem("japanMap.reducedMotion", "true");
    document.documentElement.classList.add("reduce-motion");
  });
  await page.goto("http://127.0.0.1:5180/japanMap/");
  await page.waitForFunction(() => window.japanMap?.quality, null, {
    timeout: 180000,
  });
  await page.evaluate(() => window.japanMap.quality("low"));
  await page.locator(".start__button").waitFor({ state: "visible", timeout: 180000 });
  await page.locator(".start__button").click({ force: true });
  await page.waitForFunction(() => document.pointerLockElement);
  await page.evaluate(() => document.exitPointerLock());
  await page.locator(".player-menu").waitFor({ state: "visible" });

  await page.getByRole("button", { name: "Tune Car" }).click();
  const bay = page.locator(".tune-garage");
  await bay.waitFor({ state: "visible", timeout: 20000 });
  assert.equal(await page.locator(".player-menu").evaluate((el) => el.hidden), true);

  const wallet = await page.locator(".tune-garage [data-wallet]").innerText();
  assert.match(wallet, /20,000|20000/);
  assert.ok(await page.getByRole("button", { name: "Take it out" }).count());
  assert.ok(await page.getByRole("button", { name: "Leave bay" }).count());

  await page.locator('[data-filter="engine"]').click();
  await page.locator('[data-cat="engine"][data-tier="1"]').click();
  const buy = page.locator('[data-action="buy"]');
  assert.match(await buy.innerText(), /900/);
  await buy.click();
  await page.waitForTimeout(400);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("japanmap.tune.touge")).engine,
    ),
    1,
  );
  assert.equal(await page.locator("[data-badge]").getAttribute("hidden"), null);

  await page.locator('[data-shot="engine"]').click();
  await fs.mkdir("screenshots/tune", { recursive: true });
  const shot = async (name) => {
    try {
      await page.screenshot({ path: `screenshots/tune/${name}.png`, timeout: 5000 });
    } catch (error) {
      console.log(`screenshot ${name} skipped: ${error.message.split("\n")[0]}`);
    }
  };
  await shot("bay-engine");
  await page.locator('[data-shot="hero"]').click();
  await shot("bay-hero");

  await page.keyboard.press("Escape");
  await page.locator(".player-menu").waitFor({ state: "visible" });
  assert.equal(await bay.count(), 0);

  await page.setViewportSize({ width: 390, height: 844 });
  const rail = await page.locator(".menu__tile--sakura").evaluate((el) =>
    el.getBoundingClientRect().height,
  );
  assert.ok(rail >= 48, "Tune Car tile stays tappable on the phone");

  const fatal = errors.filter(
    (line) =>
      !/Pointer lock|NotAllowedError|WrongDocumentError/.test(line),
  );
  if (fatal.length) console.log(fatal.join("\n---\n"));
  assert.deepEqual(fatal, []);
  console.log("   ✓ Open Bay overlay, purchase, TUNED badge, escape");
} finally {
  await browser.close();
}
