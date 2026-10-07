// Tools/capture — render a scene's main camera to a PNG under Captures/ (batchmode).
//   node Tools/capture.mjs [--scene Assets/_Project/Scenes/Game.unity] [--out Captures/x.png] [--width 1024] [--height 576]
// With the editor open: MCP → menu "JapanMap/Capture Main Camera".
import { failIfEditorOpen, runUnity, logProblems, arg } from './lib/unity.mjs';

failIfEditorOpen('CAPTURE');
const args = ['-quit', '-executeMethod', 'JapanMap.Editor.Capture.Batch'];
for (const [k, u] of [['scene', 'jmScene'], ['out', 'jmOut'], ['width', 'jmWidth'], ['height', 'jmHeight']]) {
  const v = arg(k);
  if (v) args.push(`-${u}`, v);
}
const run = await runUnity(args, 'capture');
const line = run.log.split('\n').find((l) => l.startsWith('[Capture]'));
const p = logProblems(run.log);
if (run.code !== 0 || !line) {
  console.log(`CAPTURE FAILED (exit ${run.code}) · log ${run.logFile}`);
  for (const e of p.compileErrors) console.log('  ' + e);
  process.exit(1);
}
console.log(`CAPTURE OK · ${line.replace('[Capture] ', '')} · ${run.seconds.toFixed(0)}s`);
