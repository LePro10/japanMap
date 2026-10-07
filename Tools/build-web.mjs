// Tools/build-web — Web build into Builds/Web plus Builds/Web/size-report.txt.
//   node Tools/build-web.mjs          # release (size counts only here)
//   node Tools/build-web.mjs --dev    # development build with F1 overlay
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, failIfEditorOpen, runUnity, logProblems, flag } from './lib/unity.mjs';

failIfEditorOpen('BUILD-WEB');
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
