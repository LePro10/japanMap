// Tools/build-web — Web build into Builds/Web plus Builds/Web/size-report.txt.
//   node Tools/build-web.mjs          # release (size counts only here)
//   node Tools/build-web.mjs --dev    # development build with F1 overlay
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, editorIsOpen, runUnity, logProblems, flag } from './lib/unity.mjs';

// Editor open: the same build through its menu (MCP); the call returns early, so wait for a new size report.
if (editorIsOpen()) {
  const report = join(ROOT, 'Builds', 'Web', 'size-report.txt');
  const t0 = Date.now();
  const item = flag('dev') ? 'JapanMap/Build Web (Development)' : 'JapanMap/Build Web (Release)';
  try { execFileSync('node', [join(ROOT, 'Tools/mcp-call.mjs'), 'execute_menu_item', JSON.stringify({ menu_path: item })], { stdio: 'ignore', timeout: 30000 }); }
  catch { /* the long call drops its connection while the build goes on */ }
  while (!(existsSync(report) && statSync(report).mtimeMs > t0)) {
    if (Date.now() - t0 > 20 * 60 * 1000) { console.log('BUILD-WEB FAILED · no new size report after 20 min (editor console?)'); process.exit(1); }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`BUILD-WEB OK (editor) · ${((Date.now() - t0) / 1000).toFixed(0)}s wall\n` + readFileSync(report, 'utf8'));
  process.exit(0);
}
const args = ['-quit', '-buildTarget', 'WebGL', '-executeMethod', 'JapanMap.Editor.WebBuild.Batch'];
if (flag('dev')) args.push('-jmDev');
const run = await runUnity(args, 'build-web');
const report = join(ROOT, 'Builds', 'Web', 'size-report.txt');
if (run.code !== 0 || !existsSync(report)) {
  console.log(`BUILD-WEB FAILED (exit ${run.code}) · log ${run.logFile}`);
  for (const e of logProblems(run.log).compileErrors) console.log('  ' + e);
  const err = run.log.split('\n').filter((l) => /\[WebBuild\]|Error building|BuildFailedException/.test(l));
  for (const e of err.slice(0, 10)) console.log('  ' + e.trim());
  process.exit(1);
}
console.log(`BUILD-WEB OK · ${run.seconds.toFixed(0)}s wall\n` + readFileSync(report, 'utf8'));
