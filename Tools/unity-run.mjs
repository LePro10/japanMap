#!/usr/bin/env node
// Run one static editor method in batch mode (editor closed), e.g. an importer:
//   node Tools/unity-run.mjs JapanMap.Editor.Vegetation.VegetationImporter.Batch
// Prints RUN OK / RUN RED (exit code, errors from the log). BLOCKED (exit 2) if the editor has the project open.
import { runUnity, logProblems, failIfEditorOpen } from './lib/unity.mjs';
const method = process.argv[2];
if (!method) { console.error('usage: node Tools/unity-run.mjs <Namespace.Class.Method>'); process.exit(2); }
failIfEditorOpen('RUN');
const r = await runUnity(['-quit', '-executeMethod', method], 'run');
const p = logProblems(r.log);
const problems = [...p.compileErrors, ...p.ownWarnings, ...p.orphanMeta];
const lines = r.log.split('\n').filter((l) => /\[(Vegetation|Map|Library|Look)\]/.test(l));
console.log(`RUN ${r.code === 0 && problems.length === 0 ? 'OK' : 'RED'} · ${method} · exit ${r.code} · ${r.seconds.toFixed(0)} s · log ${r.logFile}`);
for (const l of [...lines, ...problems].slice(0, 20)) console.log('  ' + l);
process.exit(r.code === 0 && problems.length === 0 ? 0 : 1);
