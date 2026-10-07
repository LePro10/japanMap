// Tools/capture — render a scene's main camera to a PNG under Captures/ (batchmode).
//   node Tools/capture.mjs [--scene Assets/_Project/Scenes/Game.unity] [--out Captures/x.png] [--width 1024] [--height 576]
//   node Tools/capture.mjs --viewpoint pass|all   → Captures/vp-<name>.png (Data/Map/Viewpoints.asset)
// With the editor open: MCP → execute_code JapanMap.Editor.Map.ViewpointTools.Capture("pass") / CaptureAll().
// With the editor open: MCP → menu "JapanMap/Capture Main Camera".
import { failIfEditorOpen, runUnity, logProblems, arg } from './lib/unity.mjs';

failIfEditorOpen('CAPTURE');
const args = ['-quit', '-executeMethod', 'JapanMap.Editor.Capture.Batch'];
for (const [k, u] of [['viewpoint', 'jmViewpoint'], ['scene', 'jmScene'], ['out', 'jmOut'], ['width', 'jmWidth'], ['height', 'jmHeight']]) {
  const v = arg(k);
  if (v) args.push(`-${u}`, v);
}
const run = await runUnity(args, 'capture');
const lines = run.log.split('\n').filter((l) => l.startsWith('[Capture]'));
const line = lines.length > 1 ? `${lines.length} images, e.g. ${lines[0].replace('[Capture] ', '')}` : lines[0];
const p = logProblems(run.log);
if (run.code !== 0 || !line) {
  console.log(`CAPTURE FAILED (exit ${run.code}) · log ${run.logFile}`);
  for (const e of p.compileErrors) console.log('  ' + e);
  process.exit(1);
}
console.log(`CAPTURE OK · ${line.replace('[Capture] ', '')} · ${run.seconds.toFixed(0)}s`);
