// Tools/verify — compile + EditMode + PlayMode tests in batchmode, one result line.
//   node Tools/verify.mjs            # both platforms
//   node Tools/verify.mjs --edit     # EditMode only (fast)
//   node Tools/verify.mjs --filter TitleTests [--play]   # only matching tests (no test-count ratchet); --play = PlayMode only
// Exit 0 green, 1 red, 2 blocked (editor open → use the Unity MCP).
// Logged errors fail a test by themselves (Test Framework default), so "console clean"
// during tests is covered; compile errors and orphan .meta files are read from the log.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, LOG_DIR, failIfEditorOpen, runUnity, logProblems, flag, arg } from './lib/unity.mjs';

failIfEditorOpen('VERIFY');
mkdirSync(LOG_DIR, { recursive: true });

// Ratchet: a test count that drops without anyone deciding so is a lost test (happened in Phase 2
// when an edit swallowed three test cases). Intended removals: lower the number in this file.
const COUNT_FILE = join(ROOT, 'Tools', 'test-count.json');
const counts = existsSync(COUNT_FILE) ? JSON.parse(readFileSync(COUNT_FILE, 'utf8')) : {};
let countsChanged = false;

// A filtered run (second agent in batchmode, no MCP): just those tests, the count ratchet stays out of it.
const filter = arg('filter');
const platforms = flag('edit') ? ['EditMode'] : flag('play') ? ['PlayMode'] : ['EditMode', 'PlayMode'];
const parts = [];
const details = [];
let red = false;
const t0 = Date.now();

for (const platform of platforms) {
  const xml = join(LOG_DIR, `verify-${platform}.xml`);
  const run = await runUnity(['-runTests', '-testPlatform', platform, '-testResults', xml, ...(filter ? ['-testFilter', filter] : [])], `verify-${platform}`);
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
  if (n('failed') > 0 || (n('total') === 0 && !filter)) red = true;
  if (filter) { /* partial run: no ratchet */ } else if (counts[platform] && n('total') < counts[platform]) {
    red = true;
    details.push(`${platform}: ${n('total')} tests, ${counts[platform]} before — lost a test? (intended: edit Tools/test-count.json)`);
  } else if (n('total') > (counts[platform] ?? 0)) {
    counts[platform] = n('total');
    countsChanged = true;
  }
  parts.push(`${platform} ${n('passed')}/${n('total')}${n('failed') ? ` (${n('failed')} failed)` : ''} ${run.seconds.toFixed(0)}s`);
  details.push(...failedNames.map((f) => `failed: ${f}`));
  if (p.ownWarnings.length) details.push(...p.ownWarnings.map((w) => `warning: ${w}`));
  if (p.orphanMeta.length) { red = true; details.push(...p.orphanMeta); }
}

if (countsChanged && !red) writeFileSync(COUNT_FILE, JSON.stringify(counts, null, 2) + '\n');
const total = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`VERIFY ${red ? 'RED' : 'GREEN'} · ${parts.join(' · ')} · ${total}s`);
for (const d of details) console.log('  ' + d);
process.exit(red ? 1 : 0);
