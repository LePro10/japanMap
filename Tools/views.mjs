#!/usr/bin/env node
// Render named viewpoints in the open editor (Game.unity, via MCP) into a folder and put them side by side:
//   node Tools/views.mjs <folder> <montageName> <viewpoint> [viewpoint …]
//   e.g. node Tools/views.mjs Captures/p5-before koedo koedo koedo-strasse koedo-luft
// → <folder>/vp-<viewpoint>.png and <folder>/<montageName>.png. Same viewpoints before and after a change.
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [folder, montage, ...views] = process.argv.slice(2);
if (!folder || !montage || views.length === 0) {
  console.error('usage: node Tools/views.mjs <folder> <montageName> <viewpoint> [viewpoint …]');
  process.exit(2);
}
const code = `
JapanMap.Editor.Map.MapScene.OpenGameScene();
System.IO.Directory.CreateDirectory("${folder}");
var outs = new System.Collections.Generic.List<string>();
foreach (var n in new[]{${views.map((v) => `"${v}"`).join(',')}}) {
  var p = JapanMap.Editor.Map.ViewpointTools.Capture(n, 768, 432);
  if (p == null) return "FAILED " + n;
  var dst = "${folder}/" + System.IO.Path.GetFileName(p);
  System.IO.File.Copy(p, dst, true); outs.Add(dst);
}
return string.Join("\\n", outs);`;
const out = JSON.parse(execFileSync('node', [join(ROOT, 'Tools/mcp-call.mjs'), 'execute_code', JSON.stringify({ action: 'execute', code })], { encoding: 'utf8' }));
if (!out.success || String(out.data?.result).startsWith('FAILED')) { console.error(out.message ?? '', JSON.stringify(out.data)); process.exit(1); }
const files = String(out.data.result).split('\n');
execFileSync('node', [join(ROOT, 'Tools/montage.mjs'), '--out', join(folder, `${montage}.png`), ...files], { stdio: 'inherit', cwd: ROOT });
