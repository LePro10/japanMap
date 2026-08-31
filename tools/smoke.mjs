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

  // ── 4b. Schanzen, Sammelstücke, Driftzone — P24 ───────────────────────
  //
  // Die Probe fährt eine Schanze **von ihrer Anfahrt aus** an und misst, ob das
  // Auto fliegt. Ohne Anlauf wäre sie keine Probe: eine Schanze, die man aus dem
  // Stand hochfährt, hebt niemanden ab, und ein Flug von 0,0 s wäre dann kein
  // Befund über die Schanze, sondern über die Anfahrt.
  //
  // ## Drei Dinge, die die erste Fassung falsch gemacht hat (P26)
  //
  // Sie setzte den Wagen **150 m** vor der Kante ab und gab Vollgas. Damit maß
  // sie die Anfahrt mit, und die läuft geradeaus durchs Gelände statt der
  // Straße nach: `harbour-jump` kam so auf **0,18 s Flug bei +16 m Höhe** —
  // die Anfahrt geht bergauf, der Wagen kroch über die Kante. Dieselbe
  // Schanze, mit besessener Anfahrt gemessen: **3,97 s und 129 m.** Die Zahl
  // war nie falsch abgelesen, sie war ein Befund über etwas anderes.
  //
  //  1. **Anlauf 12 m statt 150 m, und das Tempo wird gesetzt statt erfahren.**
  //     Damit ist getrennt, was getrennt gehört: *hebt die Schanze ab* ist
  //     diese Probe, *kommt man dort mit Tempo an* ist eine andere Frage.
  //  2. **Eine Sekunde einschwingen lassen, bevor das Tempo gesetzt wird.**
  //     Ohne das misst die Probe ihr eigenes Absetzen: das Blech steckte in den
  //     ersten zehn Schritten bis 0,18 m im Boden, und dessen Bremse machte aus
  //     140 km/h in 0,17 s 40 km/h. Weil die Bremswirkung mit dem Tempo wächst,
  //     kam an der Kante **dieselbe** Zahl heraus, egal ob mit 80, 110 oder 140
  //     angefahren wurde — ein Wert, der von der Eingabe unabhängig ist, ist
  //     eine Klemme und kein Verlust. Vierter Fall dieser Klasse im Projekt
  //     (P13, P14, P21, P24), und er steht in CLAUDE.md.
  //  3. **Nur ein Abheben *an der Schanze* zählt.** Sonst rastet die Probe auf
  //     der ersten Bodenwelle ein, die sie findet, und meldet deren Flug als
  //     den der Schanze: bei `village-hop` wurden so aus 139 km/h 0,78 s Flug
  //     und aus 44 km/h 3,25 s — mehr Tempo, weniger Flug.
  const stunt = await page.evaluate(async () => {
    const drive = window.japanMap.engine.systems.find((s) => s.name === 'DriveSystem');
    const cfg = await import(`${window.__smokeBase}/src/config/stunt.config.ts`);
    const out = { jumps: [], pickups: 0, zone: 0 };
    const KMH = 140;
    for (const ramp of cfg.RAMPS) {
      const sx = Math.sin(ramp.heading);
      const sz = Math.cos(ramp.heading);
      drive.placeAt(ramp.x - sx * 12, ramp.z - sz * 12, ramp.heading);
      for (let k = 0; k < 60; k++) {
        drive.simulateStep(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: false });
      }
      const v = KMH / 3.6;
      drive.vehicle.velocity.set(sx * v, 0, sz * v);

      let air = 0;
      let peak = 0;
      let kante = 0;
      let fliegt = false;
      let y0 = 0;
      for (let i = 0; i < 60 * 8; i++) {
        drive.simulateStep(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: false });
        const t = drive.vehicle.telemetry;
        const pos = drive.vehicle.position;
        if (!fliegt) {
          if (t.airborne && Math.hypot(pos.x - ramp.x, pos.z - ramp.z) < 25) {
            fliegt = true;
            y0 = pos.y;
            kante = t.speed * 3.6;
          }
        } else {
          if (t.airborne) air += 1 / 60;
          peak = Math.max(peak, pos.y - y0);
        }
      }
      out.jumps.push({
        id: ramp.id,
        air: +air.toFixed(2),
        peak: +peak.toFixed(1),
        kante: Math.round(kante),
      });
    }
    // Sammelstücke: einmal die Ringstraße entlang teleportieren und zählen.
    const line = drive.roads.getRacingLine('ring');
    const stuntSystem = window.japanMap.engine.systems.find((s) => s.name === 'StuntSystem');
    for (let i = 0; i < line.length / 3; i += 5) {
      out.pickups += stuntSystem.collect(line[i * 3], line[i * 3 + 2], 0);
    }
    const zone = cfg.DRIFT_ZONES[0];
    out.zone = stuntSystem.driftBonusAt(zone.x, zone.z);
    return out;
  });
  const flying = stunt.jumps.filter((j) => j.air > 0.35);
  const zeile = stunt.jumps.map((j) => `${j.id} ${j.kante}km/h→${j.air}s/${j.peak}m`).join(' · ');
  if (flying.length < stunt.jumps.length) {
    bad('nicht jede Schanze hebt ab', JSON.stringify(stunt.jumps));
  } else {
    ok('Schanzen heben ab', zeile);
  }
  // **Die Prüfung, die den Fehler gefunden hat.** Ein Anlauf von 140 km/h muss
  // an der Kante noch 90 km/h übrig haben. `village-hop` kam mit 19,4°
  // Spitzenneigung auf **41 km/h** — die Karosserie schleifte auf der Auffahrt
  // (Blechtiefe 0,193 m gegen 0,040…0,094 m bei den anderen fünf), und aus der
  // steilsten Schanze der Karte war eine Bremsschwelle geworden. Keine der
  // damaligen Abnahmezeilen hat das gemeldet, weil keine nach dem Tempo
  // *an der Kante* gefragt hat: die Schanze hob ja ab.
  const gebremst = stunt.jumps.filter((j) => j.kante < 90);
  if (gebremst.length === 0) {
    ok('keine Schanze bremst die Anfahrt', `min ${Math.min(...stunt.jumps.map((j) => j.kante))} km/h aus 140`);
  } else {
    bad(
      'Schanze bremst die Anfahrt aus',
      gebremst.map((j) => `${j.id} ${j.kante} km/h`).join(', '),
    );
  }
  if (stunt.pickups > 20) ok('Sammelstücke am Ring', String(stunt.pickups));
  else bad('kaum Sammelstücke am Ring', String(stunt.pickups));
  if (stunt.zone > 1) ok('Driftzone verdoppelt', `×${stunt.zone}`);
  else bad('Driftzone ohne Wirkung', String(stunt.zone));

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

  // ── 6b. Minikarte — P25 ───────────────────────────────────────────────
  //
  // **Gemessen wird, ob sie bemalt ist**, und nicht, ob das Element da ist. Ein
  // leeres Canvas an der richtigen Stelle mit der richtigen Größe besteht jede
  // Prüfung, die nur den DOM ansieht — und genau so wäre der Fehler „Netz nie
  // angekommen" durchgerutscht. Der Anteil nicht-durchsichtiger Pixel ist die
  // Zahl, die das beantwortet.
  const karte = await page.evaluate(() => {
    const map = document.querySelector('.hud__map');
    if (!map) return null;
    const ctx = map.getContext('2d');
    const d = ctx.getImageData(0, 0, map.width, map.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return {
      breite: map.width,
      hoehe: map.height,
      bemalt: +(n / (d.length / 4)).toFixed(4),
      // Der berechnete Wert, nicht der geschriebene (P10.2).
      display: getComputedStyle(map).display,
    };
  });
  if (karte && karte.bemalt > 0.01 && karte.display !== 'none') {
    ok('Minikarte gezeichnet', JSON.stringify(karte));
  } else {
    bad('Minikarte leer oder fehlt', JSON.stringify(karte));
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
