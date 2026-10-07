/**
 * Tonprobe — Tonschicht 2.
 *
 * Die Rauchprobe (`smoke.mjs`) liest die Konsole; ob der Ton *läuft*, fragt
 * sie nicht. Diese Probe tut es, strukturell — hören kann sie nichts:
 *
 *  1. Nach „Play" läuft der `AudioContext` und der Worklet ist geladen.
 *  2. Im Auto folgt die Drehzahl dem Getriebe und der Motor ist an.
 *  3. In einer Veranstaltung trägt jeder Gegner eine eigene Motorstimme, und
 *     die Gegner schalten (Gang > 1 nach dem Start).
 *  4. Der Worklet rendert offline nicht-stille, endliche Werte für alle zehn
 *     Motoren (derselbe Code wie im Spiel, `OfflineAudioContext`).
 *  5. Die Konsole bleibt sauber.
 *
 *   node tools/audio-smoke.mjs [url]     (braucht einen laufenden Dev-Server)
 */
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5180/japanMap/';
const base = new URL(url).pathname.replace(/\/$/, '');
const problems = [];
const ok = (label, v) => console.log(`   ✓ ${label}${v === undefined ? '' : `: ${v}`}`);
const bad = (label, v) => {
  console.log(`   ✗ ${label}${v === undefined ? '' : `: ${v}`}`);
  problems.push(label);
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

try {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('.start__button') !== null, undefined, { timeout: 120_000 });
  await page.click('.start__button', { timeout: 60_000 });
  await page.waitForTimeout(3000);

  const s1 = await page.evaluate(() => {
    const a = window.japanMap.engine.systems.find((s) => s.name === 'AudioSystem');
    return a.debugState;
  });
  if (s1.context === 'running') ok('AudioContext läuft');
  else bad('AudioContext läuft nicht', s1.context);
  if (s1.worklet) ok('Worklet geladen');
  else bad('Worklet fehlt');

  const drive = await page.evaluate(async () => {
    const drive = window.japanMap.engine.systems.find((s) => s.name === 'DriveSystem');
    const a = window.japanMap.engine.systems.find((s) => s.name === 'AudioSystem');
    if (!drive.active) window.japanMap.drive(true);
    await new Promise((r) => setTimeout(r, 2500));
    const t = drive.vehicle.telemetry;
    return { rpm: t.rpm, idle: t.idleRpm, gear: t.gear, p: a.debugState.params };
  });
  if (drive.p.on === 1 && Math.abs(drive.p.rpm - drive.rpm) < 1500) ok('Motor an, Drehzahl vom Getriebe', `${Math.round(drive.rpm)} min⁻¹, Gang ${drive.gear}`);
  else bad('Motor nicht an oder Drehzahl falsch', JSON.stringify(drive.p));

  const race = await page.evaluate(async (b) => {
    const drive = window.japanMap.engine.systems.find((s) => s.name === 'DriveSystem');
    const a = window.japanMap.engine.systems.find((s) => s.name === 'AudioSystem');
    const events = await import(`${b}/src/config/events.config.ts`);
    if (!drive.startEvent(events.EVENTS.find((e) => e.id === 'coast-loop'))) return { error: 'startEvent' };
    // Von Hand getrieben wie in `smoke.mjs`: headless auf SwiftShader läuft
    // die Schleife mit wenigen Bildern je Sekunde, und der Countdown ist
    // Simulationszeit.
    for (let i = 0; i < 260 + 480; i++) drive.race.step(1 / 60, drive.vehicle, drive.collision);
    await new Promise((r) => setTimeout(r, 1500));
    const rivals = drive.race.rivals.vehicles.map((v) => ({ gear: v.telemetry.gear, rpm: Math.round(v.telemetry.rpm), kmh: Math.round(v.telemetry.speed * 3.6) }));
    return { state: drive.race.state, elapsed: drive.race.elapsed, voices: a.debugState.rivals, rivals };
  }, base);
  if (race.error) bad('Veranstaltung startet nicht', race.error);
  else {
    if (race.voices === race.rivals.length && race.voices > 0) ok('Gegnerstimmen', `${race.voices} für ${race.rivals.length} Gegner`);
    else bad('Gegnerstimmen fehlen', JSON.stringify(race));
    if (race.rivals.some((r) => r.gear > 1)) ok('Gegner schalten', race.rivals.map((r) => `G${r.gear}/${r.rpm}`).join(' '));
    else bad('Gegner schalten nicht', JSON.stringify(race.rivals));
  }

  const offline = await page.evaluate(async (b) => {
    const { default: workletUrl } = await import(`${b}/src/audio/vehicleAudio.worklet.ts?worker&url`);
    const { ENGINE_VOICES } = await import(`${b}/src/config/audio.config.ts`);
    const out = {};
    for (const id of Object.keys(ENGINE_VOICES)) {
      const ctx = new OfflineAudioContext(2, 48000, 48000);
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, 'vehicle-audio', { numberOfInputs: 0, outputChannelCount: [2] });
      node.connect(ctx.destination);
      node.port.postMessage({ t: 'profile', profile: ENGINE_VOICES[id] });
      node.port.postMessage({ t: 'p', p: { rpm: 4000, load: 1, throttle: 1, idle: 800, redline: 7000, on: 1, drive: 1, speed: 25, skid: 0.8, surface: 0 } });
      await new Promise((r) => setTimeout(r, 150));
      const buf = await ctx.startRendering();
      let sum = 0;
      let nan = 0;
      for (const x of buf.getChannelData(0)) {
        if (!Number.isFinite(x)) nan++;
        sum += x * x;
      }
      out[id] = { rms: Math.sqrt(sum / buf.length), nan };
    }
    return out;
  }, base);
  const silent = Object.entries(offline).filter(([, v]) => !(v.rms > 0.01) || v.nan > 0);
  if (silent.length === 0) ok('Alle zehn Motoren rendern', Object.entries(offline).map(([k, v]) => `${k} ${v.rms.toFixed(3)}`).join(' · '));
  else bad('Motor still oder NaN', JSON.stringify(silent));

  if (errors.length === 0) ok('Konsole sauber');
  else bad('Konsolenfehler', errors.slice(0, 5).join(' | '));
} catch (e) {
  bad('Ausnahme', e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
}
console.log(problems.length ? `\n   ${problems.length} Problem(e).` : '\n   Alles grün.');
process.exit(problems.length ? 1 : 0);
