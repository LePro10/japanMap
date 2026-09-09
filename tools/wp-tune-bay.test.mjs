import { chromium } from "playwright-core";
import assert from "node:assert/strict";
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
  assert.ok(
    await page.locator('[data-shot="engine"]').evaluate((el) => el.classList.contains("is-on")),
  );

  await page.keyboard.press("Escape");
  await page.locator(".player-menu").waitFor({ state: "visible" });
  assert.equal(await bay.count(), 0);

  const fatal = errors.filter(
    (line) =>
      !/Pointer lock|NotAllowedError|WrongDocumentError/.test(line),
  );
  if (fatal.length) console.log(fatal.join("\n---\n"));
  assert.deepEqual(fatal, []);
  console.log("   ✓ Open Bay overlay, purchase, TUNED badge, engine camera, escape");
} finally {
  await browser.close();
}
