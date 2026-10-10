#!/usr/bin/env node
// Play the real game (Boot.unity) in the open editor and drive it like a player, then stop:
//   node Tools/play.mjs <outDir> "<script>"     e.g.
//   node Tools/play.mjs Captures/p6-walk "wait 3; shot start; hold w; frames walk 6 0.3; release w; press f; wait 1; probe"
// Commands (Editor/PlayScript.cs): wait s · hold key… · release key… · press key · mouse dx dy s ·
// shot name · screen name (with UI) · tap <button text> (real mouse click) · tapmap x z (click on the world map) · gameview w h · text (menu page) · frames name n dt · probe · aim x z · orbit x z r (circle anticlockwise) · sparks n · garage pick id/buy/fit Engine 2/setup Drift/paint Navy/rims 1/kit 1/close. Keys are Input System names (w, f, space, leftShift).
// Prints result.txt (log + probes). Never starts while the editor is already playing (the human may play).
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { compileIfChanged, compileFailed } from './lib/fresh.mjs';

const [outDir, script, timeoutArg] = process.argv.slice(2);
if (!outDir || !script) {
  console.error('usage: node Tools/play.mjs <outDir> "<script>" [timeoutSeconds]');
  process.exit(2);
}
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const mcp = (tool, args) => JSON.parse(execFileSync('node', [join(ROOT, 'Tools/mcp-call.mjs'), tool, JSON.stringify(args)], { encoding: 'utf8', maxBuffer: 16 << 20 }));
if (!compileIfChanged()) {
  console.error('PLAY BLOCKED · the editor is in play mode (the human may be playing) — ask before stopping it');
  process.exit(2);
}
// With compile errors Unity refuses to enter play mode and the run would wait for its timeout.
if (compileFailed()) {
  console.error('PLAY BLOCKED · scripts do not compile — see the console (node Tools/mcp-call.mjs read_console)');
  process.exit(1);
}
const result = join(ROOT, outDir, 'result.txt');
// A test run that just reported may still be restoring its scenes; entering play now breaks that.
await new Promise((res) => setTimeout(res, 2500));
mcp('read_console', { action: 'clear' });
rmSync(result, { force: true });
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const r = mcp('execute_code', { action: 'execute', code: `return JapanMap.Editor.PlayScript.Begin("${esc(script)}", "${esc(outDir)}");` });
if (r?.data?.result !== 'started') {
  console.error('PLAY FAILED', JSON.stringify(r));
  process.exit(1);
}
const deadline = Date.now() + 1000 * Number(timeoutArg ?? 180);
while (!existsSync(result)) {
  if (Date.now() > deadline) {
    console.error('PLAY TIMEOUT · no result.txt — stopping play');
    mcp('manage_editor', { action: 'stop' });
    process.exit(1);
  }
  await new Promise((res) => setTimeout(res, 1000));
}
await new Promise((res) => setTimeout(res, 300));
console.log(readFileSync(result, 'utf8'));
// Errors the run caused (a NullReference in Awake hid behind a passing walk once — read them every time).
const errors = mcp('read_console', { types: ['error'], count: 10, format: 'detailed', include_stacktrace: true })?.data ?? [];
// With the first stack line: "NullReferenceException" alone named no place (Phase 9).
const where = (e) => typeof e === 'string' ? e.split('\n')[0] : `${String(e.message).split('\n')[0]}  @ ${String(e.stackTrace ?? '').split('\n')[0]}`;
console.log(errors.length ? `CONSOLE ERRORS ${errors.length}:\n  ${errors.map(where).join('\n  ')}` : 'CONSOLE 0 errors');
