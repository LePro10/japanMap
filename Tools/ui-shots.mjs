// Tools/ui-shots — pictures of the title and the menu (desktop, phone upright, phone on its side) in batchmode:
//   node Tools/ui-shots.mjs            → Captures/ui/*.png + one line per picture with the layout probe's verdict
// Runs the on-demand PlayMode tests in category "UiShots" (Tests/PlayMode/Content/UiShots.cs): camera via CameraShot,
// the UI panel drawn into a render texture, composited. For a second agent without the editor (no play.mjs, no game
// window); with the editor open use play.mjs ("gameview 390 844" + "screen").
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOG_DIR, failIfEditorOpen, runUnity, logProblems } from './lib/unity.mjs';

failIfEditorOpen('UI-SHOTS');
const xml = join(LOG_DIR, 'ui-shots.xml');
const run = await runUnity(['-runTests', '-testPlatform', 'PlayMode', '-testCategory', 'UiShots', '-testResults', xml], 'ui-shots');
const p = logProblems(run.log);
if (p.compileErrors.length) {
  console.log(`UI-SHOTS FAILED · compile errors`);
  for (const e of p.compileErrors) console.log('  ' + e);
  process.exit(1);
}
const shots = run.log.split('\n').filter((l) => l.startsWith('[UiShot] Captures/')).map((l) => l.replace('[UiShot] ', ''));
const doc = existsSync(xml) ? readFileSync(xml, 'utf8') : '';
const failed = [...doc.matchAll(/<test-case[^>]*fullname="([^"]+)"[^>]*result="Failed"/g)].map((m) => m[1]);
console.log(`UI-SHOTS ${failed.length || !shots.length ? 'RED' : 'OK'} · ${shots.length} pictures · ${run.seconds.toFixed(0)}s · log ${run.logFile}`);
for (const s of shots) console.log('  ' + s);
for (const f of failed) console.log('  failed: ' + f);
process.exit(failed.length || !shots.length ? 1 : 0);
