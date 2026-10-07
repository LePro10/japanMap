// Tools/verify — compile + EditMode + PlayMode tests in batchmode, one result line.
//   node Tools/verify.mjs            # both platforms
//   node Tools/verify.mjs --edit     # EditMode only (fast)
// Exit 0 green, 1 red, 2 blocked (editor open → use the Unity MCP).
// Logged errors fail a test by themselves (Test Framework default), so "console clean"
// during tests is covered; compile errors and orphan .meta files are read from the log.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, LOG_DIR, failIfEditorOpen, runUnity, logProblems, flag } from './lib/unity.mjs';

failIfEditorOpen('VERIFY');
mkdirSync(LOG_DIR, { recursive: true });

const platforms = flag('edit') ? ['EditMode'] : ['EditMode', 'PlayMode'];
const parts = [];
const details = [];
let red = false;
const t0 = Date.now();

for (const platform of platforms) {
  const xml = join(LOG_DIR, `verify-${platform}.xml`);
  const run = await runUnity(['-runTests', '-testPlatform', platform, '-testResults', xml], `verify-${platform}`);
  const p = logProblems(run.log);
  if (p.compileErrors.length) {
    red = true;
    parts.push(`compile ✗ ${p.compileErrors.length}`);
    details.push(...p.compileErrors);
    break;
  }
  if (!existsSync(xml)) {
    red = true;
    parts.push(`${platform} ✗ no results (exit ${run.code}, log ${run.logFile})`);
    break;
  }
  const doc = readFileSync(xml, 'utf8');
  const head = /<test-run[^>]*>/.exec(doc)[0];
  const n = (k) => Number(new RegExp(`${k}="(\\d+)"`).exec(head)?.[1] ?? 0);
  const failedNames = [...doc.matchAll(/<test-case[^>]*fullname="([^"]+)"[^>]*result="Failed"/g)].map((m) => m[1]);
  if (n('failed') > 0 || n('total') === 0) red = true;
  parts.push(`${platform} ${n('passed')}/${n('total')}${n('failed') ? ` (${n('failed')} failed)` : ''} ${run.seconds.toFixed(0)}s`);
  details.push(...failedNames.map((f) => `failed: ${f}`));
  if (p.ownWarnings.length) details.push(...p.ownWarnings.map((w) => `warning: ${w}`));
  if (p.orphanMeta.length) { red = true; details.push(...p.orphanMeta); }
}

const total = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`VERIFY ${red ? 'RED' : 'GREEN'} · ${parts.join(' · ')} · ${total}s`);
for (const d of details) console.log('  ' + d);
process.exit(red ? 1 : 0);
