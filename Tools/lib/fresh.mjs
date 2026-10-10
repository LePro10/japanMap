// Make the open editor compile pending script changes before a tool uses it. Without this, unity-exec and
// unity-test ran on the last compiled code three times in Phase 5 (a missing field, 53 instead of 57 tests,
// a stale warning). Never while the editor is in play mode: a recompile there reloads scripts under a
// running game (first version did that during the human's play session — NullReferenceExceptions).
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
// Scripts written since the last call: a new file was once not picked up by an "if dirty" refresh (the
// editor's file watcher missed it while Unity was in the background) — "type does not exist" in Phase 7.
const STAMP = join(ROOT, 'Library', 'agent-fresh.stamp');
function scriptsChanged() {
  if (!existsSync(STAMP)) return true;
  const found = execFileSync('find', [join(ROOT, 'Assets'), '-name', '*.cs', '-newer', STAMP, '-print', '-quit'], { encoding: 'utf8' });
  return found.trim() !== '';
}

const mcp = (tool, args) => JSON.parse(execFileSync('node', [new URL('../mcp-call.mjs', import.meta.url).pathname, tool, JSON.stringify(args)], { encoding: 'utf8', maxBuffer: 16 << 20 }));

/** true if it compiled (or nothing was pending), false if skipped because the game is running. */
export function compileIfChanged() {
  // A test run that just reported may still be leaving play mode (bench once found "already in play
  // mode" right after the tests): give it up to 20 s before calling it a human's game.
  const state = () => mcp('execute_code', { action: 'execute', code: 'return EditorApplication.isPlayingOrWillChangePlaymode ? "play" : "edit";' })?.data?.result;
  let r = state();
  for (let i = 0; i < 20 && r !== 'edit'; i++) {
    execFileSync('sleep', ['1']);
    r = state();
  }
  if (r !== 'edit') return false;
  const changed = scriptsChanged();
  // scope 'all': a 'scripts' refresh recompiles known scripts but does not import a brand-new .cs (no .meta
  // yet) — twice in Phase 8 a new file stayed invisible ("type not found", "0 tests matched").
  mcp('refresh_unity', { mode: changed ? 'force' : 'if_dirty', scope: 'all', compile: 'request', wait_for_ready: true });
  writeFileSync(STAMP, String(Date.now()));
  if (changed) reportUncompiled();
  return true;
}

// Unity 6.6 once kept a new, imported script (MonoScript, right assembly) out of its compile list for good —
// "type not found" although the file was there (Phase 8, CarLooks.cs). Name every such file with the remedy.
function reportUncompiled() {
  const ours = execFileSync('find', [join(ROOT, 'Assets', '_Project'), '-name', '*.cs'], { encoding: 'utf8' })
    .split('\n').filter(Boolean).map((f) => f.slice(ROOT.length).replace(/^\//, ''));
  const r = mcp('execute_code', { action: 'execute', code: 'var s = new System.Collections.Generic.List<string>(); foreach (var a in UnityEditor.Compilation.CompilationPipeline.GetAssemblies(UnityEditor.Compilation.AssembliesType.Editor)) s.AddRange(a.sourceFiles); return string.Join("\\n", s);' });
  const known = new Set(String(r?.data?.result ?? '').split('\n'));
  if (known.size < 10) return; // query failed; do not cry wolf
  const missing = ours.filter((f) => !known.has(f));
  for (const f of missing)
    console.error(`UNCOMPILED · ${f} is not in any assembly — delete it and its .meta, refresh, then add it again under a new name`);
}

/**
 * true if the editor's scripts do not compile. Right after a web build the editor reports a failed compile until
 * it recompiles for the editor (twice in Phase 9 a play script was blocked by that): recompile once, then ask again.
 */
export function compileFailed() {
  const ask = () => mcp('execute_code', { action: 'execute', code: 'return EditorUtility.scriptCompilationFailed ? "failed" : "ok";' })?.data?.result === 'failed';
  if (!ask()) return false;
  mcp('refresh_unity', { mode: 'force', scope: 'scripts', compile: 'request', wait_for_ready: true });
  for (let i = 0; i < 60; i++) {
    const s = mcp('execute_code', { action: 'execute', code: 'return EditorApplication.isCompiling || EditorApplication.isUpdating ? "busy" : "idle";' })?.data?.result;
    if (s === 'idle') break;
    execFileSync('sleep', ['1']);
  }
  return ask();
}
