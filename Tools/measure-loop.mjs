// Tools/measure-loop — times the steps of the work loop (docs/PLAN.md Phase 1, task 10).
//   node Tools/measure-loop.mjs
// Prints: play-mode entry with domain reload on/off, compile after a script change, EditMode tests.
// Leaves the project with domain reload OFF (the ProjectSetup default) and the touched script restored.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, failIfEditorOpen, runUnity } from './lib/unity.mjs';

failIfEditorOpen('MEASURE');
const grab = (log, re) => re.exec(log)?.[1] ?? '?';

const results = [];
for (const mode of ['on', 'off', 'on', 'off']) {
  const r = await runUnity(['-executeMethod', 'JapanMap.Editor.PlayModeTimer.Batch', '-jmDomainReload', mode], `measure-play-${mode}`);
  results.push(`play mode (domain reload ${mode}): ${grab(r.log, /\[PlayModeTimer\] enter ([\d.]+) s/)} s`);
}

// Compile cost: an unchanged project vs one changed script, both as a bare editor launch.
const idle = await runUnity(['-quit'], 'measure-idle');
const file = join(ROOT, 'Assets/_Project/Scripts/Core/GameSystem.cs');
const original = readFileSync(file, 'utf8');
writeFileSync(file, original + `\n// measure-loop ${Date.now()}\n`);
let changed;
try {
  changed = await runUnity(['-quit'], 'measure-compile');
} finally {
  writeFileSync(file, original);
}
await runUnity(['-quit'], 'measure-restore');
results.push(`editor launch, no change: ${idle.seconds.toFixed(1)} s`);
results.push(`editor launch, one script changed: ${changed.seconds.toFixed(1)} s (difference ≈ compile)`);
console.log('MEASURE\n  ' + results.join('\n  '));
