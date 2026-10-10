#!/usr/bin/env node
// Renders STAND-IN one-shot sounds (impacts, breakables, bells, countdown, UI tick, whoosh, splash) from the
// prototype's legacy src/audio/oneShots.ts in headless Chromium (OfflineAudioContext, the same Web Audio
// graph the prototype played), mono 32 kHz WAV for Unity. Not recordings — see render-audio.mts.
//   node Tools/legacy-export/render-shots.mjs [outDir]     (needs Tools/.legacy-cache from export-places.mjs)
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const out = resolve(process.argv[2] ?? join(ROOT, 'Assets/_Project/Art/Audio/StandIn'));
mkdirSync(out, { recursive: true });
const esbuild = createRequire(join(ROOT, 'Tools/.legacy-cache/package.json'))('esbuild');
const { chromium } = createRequire(join(ROOT, 'Tools/package.json'))('playwright-core');

const bundle = (await esbuild.build({
  entryPoints: [join(ROOT, 'Tools/.legacy-cache/src/audio/oneShots.ts')],
  bundle: true, write: false, format: 'iife', globalName: 'Shots',
})).outputFiles[0].text;

const SR = 32000;
// name → [seconds, js that plays on `bus`]
const SHOTS = {
  Impact_Car_Soft: [0.6, 'Shots.carImpact(bus, 0.25)'],
  Impact_Car_Mid: [0.9, 'Shots.carImpact(bus, 0.6)'],
  Impact_Car_Hard: [1.2, 'Shots.carImpact(bus, 1)'],
  Break_Rail: [1.4, 'Shots.breakable(bus, "rail", 20)'],
  Break_Tree: [1.2, 'Shots.breakable(bus, "tree", 20)'],
  Break_Wood: [1.0, 'Shots.breakable(bus, "crate", 20)'],
  Break_Cone: [0.7, 'Shots.breakable(bus, "cone", 20)'],
  Break_Barrel: [1.0, 'Shots.breakable(bus, "barrel", 20)'],
  Bell_Checkpoint: [1.2, 'Shots.checkpoint(bus)'],
  Bell_Lap: [1.6, 'Shots.lap(bus, false)'],
  Bell_LapBest: [1.7, 'Shots.lap(bus, true)'],
  Bell_Finish: [1.9, 'Shots.finish(bus, 2)'],
  Bell_Win: [2.2, 'Shots.finish(bus, 1)'],
  Bell_Discovery: [1.0, 'Shots.pickup(bus, 1318.5, true, "coin")'],
  Bell_Sparks: [0.7, 'Shots.pickup(bus, 1568, false, "coin")'],
  Countdown_Tick: [0.4, 'Shots.countdown(bus, 1)'],
  Countdown_Go: [0.9, 'Shots.countdown(bus, 1)', 1.0],
  UI_Click: [0.12, 'Shots.uiClick(bus)'],
  Whoosh_Up: [0.7, 'Shots.whoosh(bus, 0.25, true)'],
  Whoosh_Down: [0.7, 'Shots.whoosh(bus, 0.25, false)'],
  Splash: [1.0, 'Shots.splash(bus, 1)'],
  Land_Thump: [0.5, 'Shots.carImpact(bus, 0.15)'],
  // Temple: "one long bell decay" (ASTRA §6 world sound) — a low bell with long partials.
  Ambience_TempleBell: [7.0, 'Shots.bell(bus, 146.8, 0, 0.3, 7)'],
};

const browser = await chromium.launch();
const page = await browser.newPage();
await page.addScriptTag({ content: bundle });
const rows = [];
for (const [name, [seconds, js, from = 0]] of Object.entries(SHOTS)) {
  const len = from + seconds;
  const data = await page.evaluate(async ({ js, len, sr }) => {
    const ctx = new OfflineAudioContext(1, Math.ceil(len * sr), sr);
    const dry = ctx.createGain();
    const wet = ctx.createConvolver();
    wet.buffer = Shots.makeImpulse(ctx);
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.6;
    dry.connect(ctx.destination);
    wet.connect(wetGain).connect(ctx.destination);
    const bus = { ctx, dry, wet, noise: Shots.makeNoise(ctx) };
    // eslint-disable-next-line no-eval
    eval(js);
    const buf = await ctx.startRendering();
    return Array.from(buf.getChannelData(0));
  }, { js, len, sr: SR });
  const a = Math.round(from * SR);
  const s = data.slice(a);
  const fade = Math.round(0.02 * SR);
  for (let i = 0; i < fade && i < s.length; i++) s[s.length - 1 - i] *= i / fade;
  const buf = Buffer.alloc(44 + s.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + s.length * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36);
  buf.writeUInt32LE(s.length * 2, 40);
  let peak = 0;
  s.forEach((v, i) => { const c = Math.max(-1, Math.min(1, v)); peak = Math.max(peak, Math.abs(c)); buf.writeInt16LE(Math.round(c * 32767), 44 + i * 2); });
  writeFileSync(join(out, `SFX_STANDIN_${name}.wav`), buf);
  rows.push(`${name} ${seconds}s peak ${peak.toFixed(2)}`);
}
await browser.close();
console.log(rows.join('\n'));
