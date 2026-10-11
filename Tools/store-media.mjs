#!/usr/bin/env node
// Store covers and preview videos for CrazyGames, from the real game (editor open, via play.mjs):
//   node Tools/store-media.mjs [--shoot] [--title "Game Name"]
// --shoot  renders covers (1920×1080, 800×1200, 800×800 + 1080×1620 for the portrait video's first frame) in Neo Tokyo
//          and records the preview drive (Sakura drift, neon avenue) at a fixed 30 fps game clock in both orientations.
// --title  puts the game's name on every cover (headless Chrome over the picture; CrazyGames: the title is the only
//          text allowed) → cover-*-title.png, and uses those as the videos' first frame.
// Then builds Captures/launch/preview-landscape.mp4 (1920×1080) and preview-portrait.mp4 (1080×1620): 15–20 s, no sound,
// H.264, first frame = cover (CrazyGames rules, docs/LAUNCH.md). Prints the duration and size of each.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT, arg, flag } from './lib/unity.mjs';

const OUT = join(ROOT, 'Captures/launch');
const play = (dir, script) => execFileSync('node', [join(ROOT, 'Tools/play.mjs'), dir, script, '900'], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
// The covers: the player's car 3/4 from the front in the neon street of Neo Tokyo (viewpoint stadt-neon, looking south).
const COVER_SETUP = 'tier High; drive 1121 118 335; wait 2.5';
const COVERS = [
  ['cover-1920x1080', 1920, 1080, '1124.2 30.75 124.6 1120.6 31.9 113 52'],
  ['cover-800x1200', 800, 1200, '1125.2 30.8 127.5 1119.6 32.4 113 62'],
  ['cover-1080x1620', 1080, 1620, '1125.2 30.8 127.5 1119.6 32.4 113 62'],
  ['cover-800x800', 800, 800, '1124.4 30.8 125.2 1120.8 32.0 113 55'],
];
// The drive: the real start (get in with F), a handbrake drift in Sakura Bowl as DriftScoreTests does, then the avenue.
const drive = (w, h) => `tier High; gameview ${w} ${h}; capture 30; wait 1.5; press f; wait 1; hold w; frames s1 75 0.0333 ${w} ${h}; ` +
  `hold w a space; frames s2 5 0.0333 ${w} ${h}; release space; frames s3 90 0.0333 ${w} ${h}; release a; frames s4 45 0.0333 ${w} ${h}; ` +
  `release w; drive 1000 160 90; wait 1.5; hold w; frames t1 210 0.0333 ${w} ${h}; release w`;

if (flag('shoot')) {
  play('Captures/launch', `${COVER_SETUP}; ${COVERS.map(([n, w, h, cam]) => `cam ${cam}; wait 0.4; shot ${n} ${w} ${h}`).join('; ')}`);
  play('Captures/launch/vid-l', drive(1920, 1080));
  play('Captures/launch/vid-p', drive(1080, 1620));
}

const title = arg('title', '');
if (title) {
  const browser = await chromium.launch();
  for (const [n, w, h] of COVERS) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const img = readFileSync(join(OUT, `${n}.png`)).toString('base64');
    const size = Math.round(Math.min(w, h * 1.4) * 0.085);
    await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;background:url(data:image/png;base64,${img});
      display:flex;justify-content:center;align-items:flex-start">
      <div style="margin-top:${Math.round(h * 0.07)}px;font:800 ${size}px 'Avenir Next','Helvetica Neue',sans-serif;letter-spacing:${size * 0.04}px;
      color:#fff4e0;text-shadow:0 ${size * 0.06}px ${size * 0.25}px rgba(0,0,0,.75),0 0 ${size * 0.5}px rgba(255,140,190,.45);text-align:center;
      padding:0 ${w * 0.05}px">${title.replace(/</g, '&lt;')}</div></body></html>`);
    await page.screenshot({ path: join(OUT, `${n}-title.png`) });
    await page.close();
  }
  await browser.close();
  console.log(`covers with "${title}": ${COVERS.map(([n]) => `${n}-title.png`).join(', ')}`);
}

// Videos: 1.5 s cover, then the drive (all frames at 30 fps).
for (const [name, dir, cover] of [['preview-landscape', 'vid-l', 'cover-1920x1080'], ['preview-portrait', 'vid-p', 'cover-1080x1620']]) {
  if (!existsSync(join(OUT, dir))) { console.log(`${name}: no frames in ${dir} — run with --shoot`); continue; }
  const first = existsSync(join(OUT, `${cover}-title.png`)) ? `${cover}-title.png` : `${cover}.png`;
  const frames = readdirSync(join(OUT, dir)).filter((f) => /^(s1|s2|s3|s4|t1)-\d+\.png$/.test(f))
    .sort((a, b) => ['s1', 's2', 's3', 's4', 't1'].indexOf(a.slice(0, 2)) - ['s1', 's2', 's3', 's4', 't1'].indexOf(b.slice(0, 2)) || a.localeCompare(b));
  const lines = [...Array(45).fill(first), ...frames.map((f) => `${dir}/${f}`)].flatMap((f) => [`file '${f}'`, 'duration 0.0333333']);
  const list = join(OUT, `${name}.txt`);
  writeFileSync(list, lines.join('\n') + '\n');
  const mp4 = join(OUT, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=30,format=yuv420p',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-an', '-movflags', '+faststart', mp4], { cwd: OUT });
  const info = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=width,height', '-of', 'compact', mp4], { encoding: 'utf8' });
  const d = Number(/duration=([\d.]+)/.exec(info)[1]);
  const mb = Number(/size=(\d+)/.exec(info)[1]) / 1e6;
  const ok = d >= 15 && d <= 20 && mb <= 50;
  console.log(`${ok ? 'OK ' : 'BAD'} ${name}.mp4 · ${/width=(\d+)/.exec(info)[1]}×${/height=(\d+)/.exec(info)[1]} · ${d.toFixed(1)} s · ${mb.toFixed(1)} MB · first frame ${first}`);
}
