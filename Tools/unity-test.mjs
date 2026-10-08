#!/usr/bin/env node
// Run Unity tests in the open editor over MCP and wait for the result (one summary line + failures).
//   node Tools/unity-test.mjs EditMode [groupRegex]     e.g. node Tools/unity-test.mjs EditMode LookTests
//   node Tools/unity-test.mjs PlayMode
// Exit 0 = passed, 1 = failed, 2 = MCP not reachable.
import { execFileSync } from 'node:child_process';
const call = (tool, args) => {
  const out = execFileSync('node', [new URL('./mcp-call.mjs', import.meta.url).pathname, tool, JSON.stringify(args)], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return JSON.parse(out.replace(/[\u0000-\u001f]/g, ' '));
};
const [mode = 'EditMode', group] = process.argv.slice(2);
const args = { mode, include_failed_tests: true, init_timeout: 120000, ...(group ? { group_names: [group] } : {}) };
// A compile error makes Unity run the last good assemblies — tests would silently pass on old code.
try {
  const errs = (call('read_console', { types: ['error'], count: 50 }).data ?? []).filter((m) => /error CS\d+/.test(String(m.message ?? m)));
  if (errs.length) { console.log(`FAIL · compile errors:\n  ${errs.slice(0, 5).map((m) => String(m.message ?? m).trim()).join('\n  ')}`); process.exit(1); }
} catch (e) { console.error(`TEST BLOCKED · ${e.message}`); process.exit(2); }
let job;
try { job = call('run_tests', args).data?.job_id; } catch (e) { console.error(`TEST BLOCKED · ${e.message}`); process.exit(2); }
if (!job) { console.error('TEST BLOCKED · no job id'); process.exit(2); }
const t0 = Date.now();
for (;;) {
  await new Promise((r) => setTimeout(r, 4000));
  let d;
  try { d = call('get_test_job', { job_id: job, include_failed_tests: true }).data; } catch { continue; } // domain reload
  if (d?.status === 'running' || d?.status === 'pending') { if (Date.now() - t0 > 1800e3) { console.error('TEST TIMEOUT'); process.exit(1); } continue; }
  const s = d?.result?.summary ?? {};
  if (!d?.result?.summary) console.log(`  (no summary — job status ${d?.status}: ${JSON.stringify(d).slice(0, 300)})`);
  const ok = d?.status === 'succeeded' && s.failed === 0 && s.total > 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${mode}${group ? ' ' + group : ''} · ${s.passed}/${s.total} passed, ${s.failed} failed, ${s.skipped} skipped · ${Math.round(s.durationSeconds ?? 0)} s`);
  for (const f of d?.result?.results ?? d?.result?.tests ?? []) if (f.state !== 'Passed') console.log(`  ✗ ${f.fullName ?? f.name}: ${(f.message ?? '').slice(0, 400)}`);
  if (!ok && s.total === 0) console.log('  (no tests matched — check the group regex)');
  process.exit(ok ? 0 : 1);
}
