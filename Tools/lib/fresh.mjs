// Make the open editor compile pending script changes before a tool uses it. Without this, unity-exec and
// unity-test ran on the last compiled code three times in Phase 5 (a missing field, 53 instead of 57 tests,
// a stale warning). Never while the editor is in play mode: a recompile there reloads scripts under a
// running game (first version did that during the human's play session — NullReferenceExceptions).
import { execFileSync } from 'node:child_process';

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
  mcp('refresh_unity', { mode: 'if_dirty', scope: 'all', compile: 'request', wait_for_ready: true });
  return true;
}
