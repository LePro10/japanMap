#!/usr/bin/env node
// Draw calls / triangles per viewpoint on one or more quality tiers (editor open, via MCP):
//   node Tools/bench.mjs <label> <viewpoint,viewpoint,…> [--tiers High,Low]
// Per tier: saves the tier as the player's choice (PlayerPrefs, read at boot), runs ViewpointBench from
// Boot.unity, waits for Captures/bench-<label>-<tier>.txt and prints it. The saved tier is restored.
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileIfChanged } from './lib/fresh.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [label, views] = process.argv.slice(2);
const tiersArg = process.argv.indexOf('--tiers');
const tiers = (tiersArg > 0 ? process.argv[tiersArg + 1] : 'High,Low').split(',');
if (!label || !views) { console.error('usage: node Tools/bench.mjs <label> <viewpoints> [--tiers High,Low]'); process.exit(2); }
// Measure the code as it is on disk (a shadow fix measured as "no change" once: it was not compiled yet).
if (!compileIfChanged()) { console.error('BENCH BLOCKED · editor is in play mode (the human may be playing)'); process.exit(2); }

function exec(code) {
  const out = execFileSync('node', [join(ROOT, 'Tools/mcp-call.mjs'), 'execute_code', JSON.stringify({ action: 'execute', code })], { encoding: 'utf8' });
  const j = JSON.parse(out);
  if (!j.success) throw new Error(j.message + ' ' + JSON.stringify(j.data));
  return j.data?.result;
}

const saved = exec('return PlayerPrefs.GetString(JapanMap.Core.QualitySystem.PrefsKey, "");');
let failed = false;
try {
  for (const tier of tiers) {
    const name = `${label}-${tier}`;
    const file = join(ROOT, 'Captures', `bench-${name}.txt`);
    rmSync(file, { force: true });
    exec(`PlayerPrefs.SetString(JapanMap.Core.QualitySystem.PrefsKey, "${tier}"); PlayerPrefs.Save(); JapanMap.Editor.ViewpointBench.Run("${name}", "${views}"); return "started";`);
    const t0 = Date.now();
    while (!existsSync(file)) {
      if (Date.now() - t0 > 300_000) { console.log(`BENCH ${name}: no report after 5 min`); failed = true; break; }
      await sleep(2000);
    }
    if (existsSync(file)) { await sleep(500); console.log(readFileSync(file, 'utf8').trim()); }
    // wait until play mode has ended before the next tier
    for (let i = 0; i < 60; i++) {
      if (exec('return EditorApplication.isPlaying || EditorApplication.isPlayingOrWillChangePlaymode ? "1" : "0";') === '0') break;
      await sleep(1000);
    }
  }
} finally {
  exec(`PlayerPrefs.SetString(JapanMap.Core.QualitySystem.PrefsKey, "${saved}"); PlayerPrefs.Save(); return "ok";`);
}
process.exit(failed ? 1 : 0);
