#!/usr/bin/env node
// Throw away test/import churn in scenes without hanging the open editor:
//   node Tools/revert-scenes.mjs [path …]      (default: every changed .unity and Data/Nav asset)
// A plain `git checkout` of a scene the editor has open brings up the modal "modified externally" dialog and the MCP
// stops answering (twice on 2026-10-25). So: open an empty scene, revert, refresh, reopen Game.unity.
// Check first that the churn is only churn: a re-split can carry real fixes (stale Props_torii, 2026-10-25) —
// run `node Tools/unity-test.mjs EditMode 'MapImportTests\.Props_'` on the reverted state.
import { execFileSync, execSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './lib/unity.mjs';

const call = (tool, args) => execFileSync('node', [join(ROOT, 'Tools/mcp-call.mjs'), tool, JSON.stringify(args)], { encoding: 'utf8', timeout: 180000 });
let paths = process.argv.slice(2);
if (!paths.length) {
  paths = execSync('git status --porcelain -- Assets/_Project/Scenes Assets/_Project/Data/Nav', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((l) => l.startsWith(' M')).map((l) => l.slice(3).replace(/^"|"$/g, ''));
}
if (!paths.length) { console.log('REVERT · nothing changed'); process.exit(0); }
try {
  call('execute_code', { action: 'execute', code: 'UnityEditor.SceneManagement.EditorSceneManager.NewScene(UnityEditor.SceneManagement.NewSceneSetup.EmptyScene); return "ok";' });
} catch (e) { console.error(`REVERT BLOCKED · MCP: ${String(e.message).split('\n')[0]} — node Tools/editor-restart.mjs`); process.exit(2); }
execFileSync('git', ['checkout', '--', ...paths], { cwd: ROOT });
try { call('refresh_unity', { mode: 'force', scope: 'assets', wait_for_ready: true }); } catch { /* reopened below either way */ }
call('execute_code', { action: 'execute', code: 'UnityEditor.SceneManagement.EditorSceneManager.OpenScene("Assets/_Project/Scenes/Game.unity"); return "ok";' });
console.log(`REVERT · ${paths.length} files back to HEAD, Game.unity open again`);
