import { chromium } from 'playwright-core';

/**
 * Rauchprobe im echten Browser — P23.
 *
 * ## Warum es sie gibt
 *
 * Dieses Projekt hat zwei Prüfstände ohne Browser (`tools/bench/`) und ein
 * halbes Dutzend Messwerkzeuge *im* Browser (`japanMap.report()`,
 * `driveProbe()`, `winding()`). Was zwischen beiden fehlte, ist die simpelste
 * Frage überhaupt: **läuft die Seite?**
 *
 * Die Antwort darauf hat dieses Projekt schon dreimal Zeit gekostet — der
 * `realpath`-Fehler aus P6 (leere Seite, stumme Konsole), die Backticks im
 * GLSL-Kommentar aus P19 (HTTP 500, stumme Konsole), die 0×0-Vorschau. Alle drei
 * hätte ein Aufruf gefunden, der die Seite lädt und die Konsole mitliest.
 *
 * ## Was sie prüft
 *
 * ```
 *   1. Die Seite lädt, `window.japanMap` existiert.
 *   2. Keine Fehler in der Konsole, keine unbehandelte Ausnahme.
 *   3. Das Bild ist vollständig (`probe().anteilNichtSchwarz` = 1).
 *   4. Der Fahrmodus lässt sich schalten und das Auto fährt.
 *   5. Eine Veranstaltung startet, zählt Kontrollpunkte und endet.
 *   6. Das HUD steht im DOM und trägt Text.
 * ```
 *
 * Punkt 3 ist die Falle aus P8.9 und steht deshalb ausdrücklich drin: ein
 * beschnittenes Bild liefert Zahlen, die keine sind.
 *
 * ## Was sie nicht kann
 *
 * Sagen, ob es gut aussieht oder sich gut anfährt. Wie jeder Prüfstand dieses
 * Projekts. Und: sie läuft mit `--use-gl=swiftshader`, also auf einem
 * Software-Rasterisierer — jede Aussage über Bildrate oder GPU-Zeit wäre
 * wertlos, und genau diese Verwechslung hat in P11 sieben Messungen gekostet.
 *
 * ```
 *   node tools/smoke.mjs                # gegen den Dev-Server auf 5180
 *   node tools/smoke.mjs http://…:4180  # gegen den gebauten Stand
 * ```
 */

const url = process.argv[2] ?? 'http://127.0.0.1:5180/japanMap/';
/** Basispfad der Seite — `vite.config.ts` liefert unter `/japanMap/` aus. */
const base = new URL(url).pathname.replace(/\/$/, '');
const HEADLESS_SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const problems = [];
const notes = [];

function ok(label, value) {
  notes.push(`   ✓ ${label}${value === undefined ? '' : `: ${value}`}`);
}
function bad(label, value) {
  problems.push(`   ✗ ${label}${value === undefined ? '' : `: ${value}`}`);
}

const browser = await chromium.launch({
  executablePath: HEADLESS_SHELL,
  args: [
    // WebGL2 auf einem Software-Rasterisierer. Ohne diese drei Fahnen liefert
    // headless Chromium gar keinen Kontext, und die Probe meldete „WebGL2
    // fehlt" für ein Spiel, das auf jedem echten Gerät läuft.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (error) => {
  consoleErrors.push(`pageerror: ${error.message}`);
});

console.log(`\n╔══ Rauchprobe — ${url}\n`);

try {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });

  // ── 1. Hochfahren ─────────────────────────────────────────────────────
  const started = await page
    .waitForFunction(
      () => document.querySelector('.start__button') !== null,
      undefined,
      { timeout: 120_000 },
    )
    .then(() => true)
    .catch(() => false);
  if (started) ok('Startbildschirm steht');
  else bad('Startbildschirm fehlt nach 120 s');

  const bootMs = await page.evaluate(() => performance.now());
  ok('Zeit bis zum Startknopf', `${(bootMs / 1000).toFixed(2)} s`);

  await page.click('.start__button');
  await page.waitForTimeout(1500);
  await page.evaluate((b) => {
    window.__smokeBase = b;
  }, base);

  const hasApi = await page.evaluate(() => typeof window.japanMap === 'object');
  if (hasApi) ok('window.japanMap vorhanden');
  else bad('window.japanMap fehlt (Dev-Build?)');

  // ── 2. Bild vollständig ───────────────────────────────────────────────
  if (hasApi) {
    const probe = await page.evaluate(async () => window.japanMap.probe());
    const share = probe.anteilNichtSchwarz ?? probe.nonBlackShare ?? 0;
    if (share > 0.999) ok('Bild vollständig', share.toFixed(4));
    else bad('Bild beschnitten oder schwarz', JSON.stringify(probe));
  }

  // ── 3. Fahrmodus ──────────────────────────────────────────────────────
  //
  // **Abgesetzt wird auf die Ringstraße und nicht dorthin, wo die Kamera gerade
  // steht.** Der erste Entwurf tat Letzteres, und die Probe maß daraufhin einen
  // Wagen, der bei Vollgas geradeaus von einem Kiesweg in den Hang fuhr: 9 km/h
  // nach vier Sekunden, Lenkantwort 0,1 °/s. Beides war richtig gemessen und
  // sagte nichts über das Fahrmodell — dieselbe Falle wie „ein Vorher/Nachher an
  // zwei verschiedenen Stellen misst die Kamera statt die Änderung" (CLAUDE.md).
  await page.evaluate(() => {
    const api = window.japanMap;
    api.drive(true);
    const drive = api.engine.systems.find((s) => s.name === 'DriveSystem');
    const line = drive.roads.getRacingLine('ring');
    const heading = Math.atan2(line[3] - line[0], line[5] - line[2]);
    window.__smokeStart = { x: line[0], z: line[2], heading };
    drive.placeAt(line[0], line[2], heading);
  });

  const drove = await page.evaluate(async () => {
    const drive = window.japanMap.engine.systems.find((s) => s.name === 'DriveSystem');
    const s = window.__smokeStart;
    drive.placeAt(s.x, s.z, s.heading);
    const start = { x: drive.vehicle.position.x, z: drive.vehicle.position.z };
    for (let i = 0; i < 240; i++) {
      drive.simulateStep(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: false });
    }
    const t = drive.vehicle.telemetry;
    return {
      kmh: t.speed * 3.6,
      moved: Math.hypot(drive.vehicle.position.x - start.x, drive.vehicle.position.z - start.z),
      surface: t.surface,
      boost: t.boost,
    };
  });
  if (drove && drove.moved > 55 && drove.kmh > 90) {
    ok(
      'Fahrmodus: 4 s Vollgas auf dem Ring',
      `${drove.kmh.toFixed(0)} km/h, ${drove.moved.toFixed(0)} m, Belag ${drove.surface}`,
    );
  } else {
    bad('Fahrmodus zu langsam', JSON.stringify(drove));
  }

  // ── 4. Lenkung ist proportional ───────────────────────────────────────
  const steering = await page.evaluate(async () => {
    const drive = window.japanMap.engine.systems.find((s) => s.name === 'DriveSystem');
    const s = window.__smokeStart;
    const out = [];
    for (const steer of [0.25, 0.5, 1.0]) {
      drive.placeAt(s.x, s.z, s.heading);
      for (let i = 0; i < 150; i++) {
        drive.simulateStep(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: false });
      }
      let peak = 0;
      let yaw = drive.vehicle.yaw;
      for (let i = 0; i < 45; i++) {
        drive.simulateStep(1 / 60, { throttle: 0.5, brake: 0, steer, handbrake: false });
        const next = drive.vehicle.yaw;
        let d = next - yaw;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        peak = Math.max(peak, Math.abs(d) * 60);
        yaw = next;
      }
      out.push(+((peak * 180) / Math.PI).toFixed(1));
    }
    return out;
  });
  const monotone = steering[0] < steering[1] && steering[1] < steering[2];
  if (monotone) ok('Lenkantwort wächst mit der Eingabe', `${steering.join(' / ')} °/s`);
  else bad('Lenkantwort nicht monoton', steering.join(' / '));

  // ── 5. Eine Veranstaltung ─────────────────────────────────────────────
  const race = await page.evaluate(async () => {
    const drive = window.japanMap.engine.systems.find((s) => s.name === 'DriveSystem');
    const race = drive.race;
    const events = await import(`${window.__smokeBase}/src/config/events.config.ts`);
    const event = events.EVENTS.find((e) => e.id === 'coast-loop');
    if (!drive.startEvent(event)) return { error: 'startEvent gab false' };
    const state0 = race.state;
    // Countdown durchlaufen lassen.
    for (let i = 0; i < 260; i++) {
      drive.simulateStep(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: false });
      race.step(1 / 60, drive.vehicle, drive.collision);
    }
    const state1 = race.state;
    const cpBefore = race.checkpointsLeft;
    // Eine Minute fahren — der Regler ist stumpf (Vollgas geradeaus), aber der
    // Ring ist an der Startlinie gerade.
    for (let i = 0; i < 3600; i++) {
      drive.simulateStep(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: false });
      race.step(1 / 60, drive.vehicle, drive.collision);
    }
    return {
      state0,
      state1,
      cpBefore,
      cpAfter: race.checkpointsLeft,
      cpTotal: event.checkpoints,
      elapsed: race.elapsed,
      rivals: race.rivals.count,
      standings: race.standings().map((r) => `${r.name} ${Math.round(r.progress)}`),
      place: race.place,
    };
  });
  if (race?.error) {
    bad('Veranstaltung startet nicht', race.error);
  } else if (race) {
    if (race.state0 === 'countdown' && race.state1 === 'running') {
      ok('Countdown läuft ab', `${race.state0} → ${race.state1}`);
    } else {
      bad('Countdown hängt', `${race.state0} → ${race.state1}`);
    }
    if (race.rivals === 3) ok('Gegnerfeld steht', `${race.rivals} Fahrzeuge`);
    else bad('Gegnerfeld unvollständig', String(race.rivals));
    // **Gezählt wird gegen die Gesamtzahl und nicht gegen den Stand nach dem
    // Countdown.** Der Wagen steht beim Start dicht am *letzten* Kontrollpunkt
    // der Runde (er liegt 20 m vor der Ziellinie), und in den paar Schritten
    // zwischen Countdown-Ende und Messung fällt bereits einer.
    if (race.cpAfter < race.cpTotal) {
      ok('Kontrollpunkte fallen', `${race.cpTotal} → ${race.cpAfter} übrig`);
    } else {
      bad('kein Kontrollpunkt in 60 s', `${race.cpTotal} → ${race.cpAfter}`);
    }
    ok('Platzierung', `P${race.place} · ${race.standings.join(' | ')}`);
  }

  // ── 6. HUD ────────────────────────────────────────────────────────────
  const hud = await page.evaluate(() => {
    const root = document.querySelector('.hud');
    if (!root) return null;
    const read = (sel) => document.querySelector(sel)?.textContent ?? null;
    return {
      hidden: root.hidden,
      speed: read('[data-hud="speed"]'),
      place: read('[data-hud="place"]'),
      money: read('[data-hud="money"]'),
      pointerEvents: getComputedStyle(root).pointerEvents,
    };
  });
  if (hud && hud.pointerEvents === 'none') {
    ok('HUD steht und fängt keine Klicks', JSON.stringify(hud));
  } else {
    bad('HUD fehlt oder fängt Klicks', JSON.stringify(hud));
  }

  // ── 7. Menü ───────────────────────────────────────────────────────────
  const menu = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.menu__tab')].map((b) => b.dataset.tab);
    return { tabs, events: document.querySelectorAll('.menu__event').length };
  });
  if (menu.tabs.includes('events') && menu.events >= 5) {
    ok('Menü trägt Veranstaltungen', `${menu.events} Einträge, Reiter ${menu.tabs.join(',')}`);
  } else {
    bad('Menü ohne Veranstaltungen', JSON.stringify(menu));
  }
} catch (error) {
  bad('Ausnahme', String(error));
}

// **Konsolenfehler zählen als Befund.** Die drei teuersten Fehler dieses
// Projekts (P6 realpath, P19 Backticks, P8.2 abgeschalteter Pass) standen alle
// ausschließlich in der Konsole.
const relevant = consoleErrors.filter((line) => !line.includes('WebGL: INVALID'));
if (relevant.length === 0) ok('Konsole sauber');
else bad(`${relevant.length} Konsolenfehler`, relevant.slice(0, 5).join(' | '));

await browser.close();

for (const line of notes) console.log(line);
if (problems.length > 0) {
  console.log('');
  for (const line of problems) console.log(line);
  console.log(`\n   ${problems.length} Befund(e).\n`);
  process.exitCode = 1;
} else {
  console.log('\n   Alles grün.\n');
}
