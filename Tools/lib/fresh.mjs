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
  mcp('refresh_unity', { mode: changed ? 'force' : 'if_dirty', scope: changed ? 'scripts' : 'all', compile: 'request', wait_for_ready: true });
  writeFileSync(STAMP, String(Date.now()));
  return true;
}
