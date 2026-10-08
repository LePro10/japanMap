#!/usr/bin/env node
// Close-up from any spot (editor open, via MCP): camera height and target height are metres above the
// ground there, Unity coordinates. For checking a model in place before it gets a fixed viewpoint.
//   node Tools/look.mjs <name> <x> <z> <eyeHeight> <lookX> <lookZ> <lookHeight>   → Captures/look-<name>.png
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [name, ...nums] = process.argv.slice(2);
const v = nums.map(Number);
if (!name || v.length !== 6 || v.some(Number.isNaN)) {
  console.error('usage: node Tools/look.mjs <name> <x> <z> <eyeHeight> <lookX> <lookZ> <lookHeight>');
  process.exit(2);
}
const f = (n) => `${n}f`;
const code = `
JapanMap.Editor.Map.MapScene.OpenGameScene();
var cam = Camera.main; var t = cam.transform; var pos0 = t.position; var rot0 = t.rotation;
var p = new Vector3(${f(v[0])}, 0, ${f(v[1])}); p.y = JapanMap.Editor.Places.PlaceImporter.Ground(p) + ${f(v[2])};
var l = new Vector3(${f(v[3])}, 0, ${f(v[4])}); l.y = JapanMap.Editor.Places.PlaceImporter.Ground(l) + ${f(v[5])};
t.SetPositionAndRotation(p, Quaternion.LookRotation(l - p));
try { return JapanMap.Editor.Capture.Render(cam, "Captures/look-${name}.png", 768, 432); }
finally { t.SetPositionAndRotation(pos0, rot0); }`;
const out = JSON.parse(execFileSync('node', [join(ROOT, 'Tools/mcp-call.mjs'), 'execute_code', JSON.stringify({ action: 'execute', code })], { encoding: 'utf8' }));
if (!out.success) { console.error(out.message, JSON.stringify(out.data)); process.exit(1); }
console.log(out.data.result);
