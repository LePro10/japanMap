#!/usr/bin/env node
// Run Unity tests in the open editor over MCP and wait for the result (one summary line + failures).
//   node Tools/unity-test.mjs EditMode [groupRegex]     e.g. node Tools/unity-test.mjs EditMode LookTests
//   node Tools/unity-test.mjs PlayMode
// Exit 0 = passed, 1 = failed, 2 = MCP not reachable.
import { execFileSync } from 'node:child_process';
import { compileIfChanged } from './lib/fresh.mjs';
const call = (tool, args) => {
  const out = execFileSync('node', [new URL('./mcp-call.mjs', import.meta.url).pathname, tool, JSON.stringify(args)], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return JSON.parse(out.replace(/[\u0000-\u001f]/g, ' '));
};
const [mode = 'EditMode', group] = process.argv.slice(2);
try { compileIfChanged(); } catch (e) { console.error(`(compile check skipped: ${String(e.message).split('\n')[0]})`); }
// A full EditMode run loses its job: the map import test triggers a domain reload ("job status undefined",
// 2026-10-18 and 2026-10-24). So without a group, run class by class (import classes last) and sum up.
if (mode === 'EditMode' && !group) {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../Assets/_Project/Tests/EditMode/', import.meta.url).pathname;
  const classes = readdirSync(dir).filter((f) => f.endsWith('.cs'))
    .flatMap((f) => [...readFileSync(dir + f, 'utf8').matchAll(/^\s*public (?:sealed |static )?class (\w+)/gm)].map((m) => m[1]))
    .sort((a, b) => /Import/.test(a) - /Import/.test(b));
  let bad = 0;
  for (const c of classes) {
    let out = '', code = 0;
    try { out = execFileSync('node', [new URL(import.meta.url).pathname, 'EditMode', c], { encoding: 'utf8', maxBuffer: 64 << 20 }); }
    catch (e) { out = String(e.stdout ?? ''); code = e.status ?? 1; }
    if (code === 2) { console.error(`TEST BLOCKED · ${c}`); process.exit(2); }
    // The import test reloads the domain on purpose; its job is lost, not failed.
    if (code && /job status undefined/.test(out)) { console.log(`  ? ${c}: result lost to a domain reload — check with verify.mjs --edit in the copy`); continue; }
    if (code) { bad++; console.log(out.trim()); }
  }
  console.log(`${bad ? 'FAIL' : 'PASS'} · EditMode · ${classes.length - bad}/${classes.length} classes green`);
  process.exit(bad ? 1 : 0);
}
const args = { mode, include_failed_tests: true, init_timeout: 120000, ...(group ? { group_names: [group] } : {}) };
// A compile error makes Unity run the last good assemblies — tests would silently pass on old code.
try {
  const logged = call('read_console', { types: ['error'], count: 50 }).data;
  // read_console sometimes answers with an object instead of a list (once, right after a test run).
  const errs = (Array.isArray(logged) ? logged : []).filter((m) => /error CS\d+/.test(String(m.message ?? m)));
  if (errs.length) { console.log(`FAIL · compile errors:\n  ${errs.slice(0, 5).map((m) => String(m.message ?? m).trim()).join('\n  ')}`); process.exit(1); }
} catch (e) { console.error(`TEST BLOCKED · ${e.message}`); process.exit(2); }
// A test file written just now is sometimes not in the test tree on the first run ("no tests matched",
// twice in Phase 7): then refresh once more and run again.
for (let attempt = 0; ; attempt++) {
let job;
// A run whose poller died (lost job after a domain reload) keeps the runner busy: wait for it instead of failing.
for (let waited = 0; ; waited += 5) {
  let r;
  try { r = call('run_tests', args); } catch (e) { console.error(`TEST BLOCKED · ${e.message}`); process.exit(2); }
  job = r.data?.job_id;
  if (job || r.data?.reason !== 'tests_running' || waited > 1800) break;
  await new Promise((res) => setTimeout(res, 5000));
}
if (!job) { console.error('TEST BLOCKED · no job id'); process.exit(2); }
const t0 = Date.now();
let retry = false;
let paused = 0;
for (;;) {
  await new Promise((r) => setTimeout(r, 4000));
  // A test that opened the menu (timeScale 0) waits forever: Unity's test timeout counts game time. Twice in
  // Phase 9 a run hung 30 min this way — after 60 s paused, name it and stop.
  if (mode === 'PlayMode') {
    try {
      const st = call('execute_code', { action: 'execute', code: 'if (!EditorApplication.isPlaying) return "-"; var m = UnityEngine.Object.FindAnyObjectByType<JapanMap.Gameplay.Menu.GameMenu>(); return Time.timeScale == 0f ? "paused " + (m != null && m.IsOpen ? "menu " + m.Current?.Title : "no menu") : "-";' })?.data?.result ?? '-';
      paused = String(st).startsWith('paused') ? paused + 1 : 0;
      if (paused >= 15) {
        console.log(`FAIL · ${mode} · HANG: the game has been paused for 60 s (${st}) — a test opened a menu or photo mode and waits on game time`);
        call('manage_editor', { action: 'stop' });
        process.exit(1);
      }
    } catch { /* domain reload */ }
  }
  let d;
  try { d = call('get_test_job', { job_id: job, include_failed_tests: true }).data; } catch { continue; } // domain reload
  if (d?.status === 'running' || d?.status === 'pending') { if (Date.now() - t0 > 1800e3) { console.error('TEST TIMEOUT'); process.exit(1); } continue; }
  const s = d?.result?.summary ?? {};
  if (s.total === 0 && group && attempt === 0) {
    call('refresh_unity', { mode: 'force', scope: 'scripts', compile: 'request', wait_for_ready: true });
    retry = true;
    break;
  }
  if (!d?.result?.summary) {
    console.log(`  (no summary — job status ${d?.status}: ${JSON.stringify(d).slice(0, 300)})`);
    // A file written into Assets during the run makes Unity reload the domain and drop the job (2026-10-24: 46/247).
    const { readdirSync, statSync } = await import('node:fs');
    const changed = [];
    const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p); else if (!e.name.endsWith('.meta') && statSync(p).mtimeMs > t0) changed.push(p);
    } };
    try { walk(new URL('../Assets/_Project', import.meta.url).pathname); } catch { /* best effort */ }
    if (changed.length) console.log(`  files changed during the run (Unity reloaded and lost the job — never edit Assets while tests run):\n    ${changed.slice(0, 8).join('\n    ')}`);
  }
  const ok = d?.status === 'succeeded' && s.failed === 0 && s.total > 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${mode}${group ? ' ' + group : ''} · ${s.passed}/${s.total} passed, ${s.failed} failed, ${s.skipped} skipped · ${Math.round(s.durationSeconds ?? 0)} s`);
  for (const f of d?.result?.results ?? d?.result?.tests ?? []) if (f.state !== 'Passed') console.log(`  ✗ ${f.fullName ?? f.name}: ${(f.message ?? '').slice(0, 400)}`);
  if (!ok && s.total === 0) console.log('  (no tests matched — check the group regex)');
  process.exit(ok ? 0 : 1);
}
if (!retry) break;
}
