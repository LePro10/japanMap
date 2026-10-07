/**
 * Driftwertung gegen den Tacho — sie darf den Bogen nicht schneiden.
 *
 * Der Rundinstrument-Tacho hat die alte viewport-absolute Zahl hinter dem
 * Amber-Strich versteckt (DOM-Reihenfolge + `bottom: 150px` in einer 180 px
 * hohen Box). Dieser Lauf setzt das HUD ohne Welt, liest die Rechtecke und
 * schreibt drei PNGs nach `.cache/shots/hud-drift-*.png`.
 *
 *   HUD_URL=http://127.0.0.1:5191/japanMap/ node tools/hud-drift-layout.mjs
 */
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const url = process.env.HUD_URL ?? "http://127.0.0.1:5191/japanMap/";
await mkdir(".cache/shots", { recursive: true });

const browser = await chromium.launch({ headless: true });

async function measure(page, size, label) {
  await page.setViewportSize(size);
  // Media query (pointer: coarse) follows hasTouch from the context, not
  // setViewportSize. Portrait vs landscape is the viewport itself.
  const data = await page.evaluate(() => {
    const hud = window.testHud;
    hud.setDriveActive(true);
    hud.update(
      { forwardSpeed: 10, boost: 0.55, boosting: false, circuit: 0 },
      0,
      false,
      null,
    );
    hud.setDrift({
      active: true,
      pending: 35,
      multiplier: 1.3,
      banked: 0,
      lastBreak: "none",
      lastChain: 0,
    });
    const drift = document.querySelector(".hud__drift");
    const speedo = document.querySelector(".hud__speedo");
    const rpm = document.querySelector(".hud__rpmFill");
    const gear = document.querySelector(".hud__gearLabel");
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        r: r.right,
        b: r.bottom,
      };
    };
    const overlap = (a, b) => {
      const x = Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x));
      const y = Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
      return x * y;
    };
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      hidden: drift.hidden,
      text: drift.textContent.replace(/\s+/g, " ").trim(),
      parent: drift.parentElement?.className,
      drift: box(drift),
      speedo: box(speedo),
      rpm: box(rpm),
      gear: box(gear),
      overlapRpm: overlap(box(drift), box(rpm)),
      overlapGear: overlap(box(drift), box(gear)),
      onScreen:
        box(drift).x >= -0.5 &&
        box(drift).y >= -0.5 &&
        box(drift).r <= window.innerWidth + 0.5 &&
        box(drift).b <= window.innerHeight + 0.5,
    };
  });
  await page.screenshot({
    path: `.cache/shots/hud-drift-${label}.png`,
    omitBackground: false,
  });
  return data;
}

try {
  const desktop = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    hasTouch: false,
  });
  await desktop.route("**/src/main.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'import "/japanMap/src/style.css";',
    }),
  );
  await desktop.goto(url);
  await desktop.evaluate(() => document.querySelector("#boot")?.remove());
  await desktop.evaluate(async () => {
    const { DriveHud } = await import("/japanMap/src/ui/DriveHud.ts");
    const overlay = document.querySelector("#overlay");
    overlay.style.background =
      "radial-gradient(circle at 40% 40%, #2a2a2a, #141414 70%)";
    window.testHud = new DriveHud(overlay);
  });

  const d = await measure(desktop, { width: 1280, height: 720 }, "desktop");
  console.log("desktop", JSON.stringify(d, null, 2));
  assert.equal(d.parent.includes("hud__speedo"), true);
  assert.equal(d.hidden, false);
  assert.match(d.text, /35.*x1\.3/);
  assert.equal(d.onScreen, true);
  assert.equal(d.overlapGear, 0, "desktop: drift overlaps gear");
  // The RPM path bbox is the whole semicircle; the crown sits above its top.
  assert.ok(d.drift.b <= d.rpm.y + 10, `desktop crown too low: ${d.drift.b} vs rpm ${d.rpm.y}`);

  const phone = await browser.newPage({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  await phone.route("**/src/main.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: 'import "/japanMap/src/style.css";',
    }),
  );
  await phone.goto(url);
  await phone.evaluate(() => document.querySelector("#boot")?.remove());
  await phone.evaluate(async () => {
    const { DriveHud } = await import("/japanMap/src/ui/DriveHud.ts");
    const overlay = document.querySelector("#overlay");
    overlay.style.background =
      "radial-gradient(circle at 40% 40%, #2a2a2a, #141414 70%)";
    window.testHud = new DriveHud(overlay);
  });

  const land = await measure(phone, { width: 844, height: 390 }, "phone-land");
  console.log("phone-land", JSON.stringify(land, null, 2));
  assert.equal(land.onScreen, true);
  assert.equal(land.overlapGear, 0, "landscape: drift overlaps gear");
  assert.ok(
    land.drift.b <= land.rpm.y + 10,
    `landscape crown too low: ${land.drift.b} vs rpm ${land.rpm.y}`,
  );

  const port = await measure(phone, { width: 390, height: 844 }, "phone-port");
  console.log("phone-port", JSON.stringify(port, null, 2));
  assert.equal(port.onScreen, true);
  assert.equal(port.overlapGear, 0, "portrait: drift overlaps gear");
  assert.ok(
    port.drift.r <= port.speedo.x + 2,
    `portrait not left of tach: drift.r ${port.drift.r} speedo.x ${port.speedo.x}`,
  );

  const wide = await phone.evaluate(() => {
    window.testHud.setDrift({
      active: true,
      pending: 12840,
      multiplier: 4.8,
      banked: 900,
      lastBreak: "none",
      lastChain: 0,
    });
    const r = document.querySelector(".hud__drift").getBoundingClientRect();
    return {
      text: document.querySelector(".hud__drift").textContent.replace(/\s+/g, " ").trim(),
      x: r.x,
      y: r.y,
      r: r.right,
      b: r.bottom,
      onScreen:
        r.x >= -0.5 &&
        r.y >= -0.5 &&
        r.right <= window.innerWidth + 0.5 &&
        r.bottom <= window.innerHeight + 0.5,
    };
  });
  console.log("phone-port-wide", JSON.stringify(wide));
  assert.equal(wide.onScreen, true, "wide combo clipped on portrait");
  assert.match(wide.text, /12840.*x4\.8.*\+900/);

  console.log("hud-drift-layout: passed");
} finally {
  await browser.close();
}
