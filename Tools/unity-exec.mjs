#!/usr/bin/env node
// Run a C# snippet in the open Unity editor (MCP execute_code) from a file or stdin, without
// hand-escaping JSON. The snippet is a method body and may `return` a value.
//   node Tools/unity-exec.mjs snippet.cs
//   echo 'return Application.unityVersion;' | node Tools/unity-exec.mjs -
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { compileIfChanged, compileFailed } from './lib/fresh.mjs';
const src = process.argv[2];
if (!src) { console.error('usage: node Tools/unity-exec.mjs <file.cs|->'); process.exit(2); }
const code = readFileSync(src === '-' ? 0 : src, 'utf8');
try { compileIfChanged(); } catch (e) { console.error(`(compile check skipped: ${String(e.message).split('\n')[0]})`); }
// Compile errors leave the old code loaded: running then measures the last version (Phase 7: a ramp
// build "succeeded" on old code). Stop and say so instead.
if (compileFailed()) {
  console.error('EXEC BLOCKED · scripts do not compile — see the console (node Tools/mcp-call.mjs read_console)');
  process.exit(1);
}
const out = execFileSync('node', [new URL('./mcp-call.mjs', import.meta.url).pathname, 'execute_code',
  JSON.stringify({ action: 'execute', code })], { encoding: 'utf8', maxBuffer: 64 << 20 });
try {
  const j = JSON.parse(out);
  if (!j.success) { console.error(j.message ?? out); if (j.data) console.error(JSON.stringify(j.data, null, 1)); process.exit(1); }
  const r = j.data?.result;
  console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
} catch { console.log(out); }
