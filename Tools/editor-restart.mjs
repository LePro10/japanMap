#!/usr/bin/env node
// Restart a stuck Unity editor without the human (they are often away; a question would stop the work — Phase 11):
//   node Tools/editor-restart.mjs [--force]
// Signs of "stuck": MCP tools missing ("Unknown tool"), execute_code answers {success:false} or times out, editor at
// 0 % CPU (a modal dialog such as "scene modified externally"). Steps: refuse if the editor is in play mode (the human
// may be playing; --force skips the check when the MCP cannot answer at all), kill -TERM the editor (clean in ~2 s),
// kill the MCP server on :8080 (it outlives the editor and a new editor then does not attach), start the editor with
// this project, wait until the MCP runs code. Prints EDITOR UP / EDITOR FAILED.
import { execFileSync, execSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, unityPath, flag } from './lib/unity.mjs';

const mcp = (code, timeout = 20000) => {
  try {
    const out = execFileSync('node', [join(ROOT, 'Tools/mcp-call.mjs'), 'execute_code', JSON.stringify({ action: 'execute', code })], { encoding: 'utf8', timeout });
    return /"result":"([^"]*)"/.exec(out)?.[1] ?? null;
  } catch { return null; }
};
const sh = (c) => { try { return execSync(c, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = mcp('return EditorApplication.isPlayingOrWillChangePlaymode ? "play" : "edit";');
if (state === 'play' && !flag('force')) {
  console.log('EDITOR BUSY · in play mode (the human may be playing) — not restarted');
  process.exit(2);
}
const editors = sh(`ps -axo pid,command | grep -i '/Unity.app/Contents/MacOS/Unity' | grep -v -- '-batchMode' | grep -i '${ROOT}' | grep -v grep | awk '{print $1}'`).split('\n').filter(Boolean);
for (const pid of editors) sh(`kill -TERM ${pid}`);
for (let i = 0; i < 30 && editors.some((p) => sh(`ps -p ${p} -o pid=`)); i++) await sleep(1000);
for (const pid of editors) if (sh(`ps -p ${pid} -o pid=`)) sh(`kill -KILL ${pid}`);
// The MCP server (uvx … mcp-for-unity) and its python child.
for (const pid of sh(`lsof -nP -iTCP:8080 -sTCP:LISTEN -t`).split('\n').filter(Boolean)) sh(`kill -TERM ${pid}`);
sh(`pkill -f 'mcp-for-unity --transport http'`);
sh(`rm -f '${ROOT}/Temp/UnityLockfile'`);
console.log(`stopped editor ${editors.join(',') || '(none)'} and the MCP server — starting the editor`);
spawn(unityPath(), ['-projectPath', ROOT], { detached: true, stdio: 'ignore' }).unref();
// The editor starts its MCP server itself (~25 s after the project is open); importing can take minutes.
const t0 = Date.now();
while (Date.now() - t0 < 8 * 60 * 1000) {
  await sleep(5000);
  if (mcp('return "ok";', 15000) === 'ok') {
    console.log(`EDITOR UP · MCP answers after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    process.exit(0);
  }
}
console.log('EDITOR FAILED · no MCP answer within 8 min — see Logs/Editor.log');
process.exit(1);
