#!/usr/bin/env node
// Compile the open editor's scripts (via MCP) and print the compile errors and our own warnings, nothing else:
//   node Tools/compile.mjs        → "COMPILE OK" or the CS errors; exit 1 on errors, 2 if blocked.
// For the edit → compile → fix loop; tests and play scripts compile by themselves (lib/fresh.mjs).
import { execFileSync } from 'node:child_process';
import { compileIfChanged } from './lib/fresh.mjs';

const mcp = (tool, args) => JSON.parse(execFileSync('node', [new URL('./mcp-call.mjs', import.meta.url).pathname, tool, JSON.stringify(args)], { encoding: 'utf8', maxBuffer: 16 << 20 }));
mcp('read_console', { action: 'clear' });
if (!compileIfChanged()) { console.error('COMPILE BLOCKED · the editor is in play mode (the human may be playing)'); process.exit(2); }
// The domain reload after a compile can outlast refresh_unity's wait; wait until the editor is idle.
for (let i = 0; i < 60; i++) {
  const s = mcp('execute_code', { action: 'execute', code: 'return EditorApplication.isCompiling || EditorApplication.isUpdating ? "busy" : "idle";' })?.data?.result;
  if (s === 'idle') break;
  execFileSync('sleep', ['1']);
}
const logs = (k) => { const d = mcp('read_console', { types: [k], count: 200 }).data; return Array.isArray(d) ? d.map((m) => String(m.message ?? m).split('\n')[0]) : []; };
const errors = [...new Set(logs('error').filter((m) => /error CS\d+/.test(m)))];
const warnings = [...new Set(logs('warning').filter((m) => /_Project.*warning CS\d+/.test(m)))];
const failed = mcp('execute_code', { action: 'execute', code: 'return EditorUtility.scriptCompilationFailed ? "failed" : "ok";' })?.data?.result === 'failed';
for (const w of warnings) console.log(`  warn ${w}`);
if (errors.length || failed) {
  console.log(`COMPILE FAILED · ${errors.length} errors`);
  for (const e of errors.slice(0, 40)) console.log(`  ${e}`);
  process.exit(1);
}
console.log('COMPILE OK');
