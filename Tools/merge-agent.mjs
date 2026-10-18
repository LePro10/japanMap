#!/usr/bin/env node
// Merges a parallel agent's branch (worktree ../japanMap-cli, CLAUDE.md rule 13) into the current branch.
// Every round produced the same three conflicts: DECISIONS.md and LESSONS.md (both sides appended) and
// Tools/test-count.json (both sides added tests). This resolves exactly those — keep both doc blocks, add
// both count deltas against the merge base — and stops on any other conflict.
// Usage: node Tools/merge-agent.mjs agent/cli-r5 ["Commit message"]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const branch = process.argv[2];
if (!branch) { console.error('usage: node Tools/merge-agent.mjs <branch> ["message"]'); process.exit(2); }
const message = process.argv[3] ?? `Zusammenführung ${branch}`;

const base = git('merge-base', 'HEAD', branch);
try { git('merge', '--no-ff', '--no-commit', branch); } catch { /* conflicts are handled below */ }
const conflicts = git('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
const known = new Set(['docs/DECISIONS.md', 'docs/LESSONS.md', 'Tools/test-count.json']);
const other = conflicts.filter((f) => !known.has(f));
if (other.length) { console.log(`MERGE STOP · resolve by hand: ${other.join(', ')} (merge left open)`); process.exit(1); }

for (const f of conflicts) {
  const p = join(ROOT, f);
  if (f.endsWith('.json')) {
    // Sum both sides' deltas against the base: a plain "take theirs" lost tests twice.
    const count = (rev) => JSON.parse(git('show', `${rev}:${f}`));
    const [b, ours, theirs] = [count(base), count('HEAD'), count(branch)];
    const out = {};
    for (const k of Object.keys({ ...b, ...ours, ...theirs })) out[k] = (ours[k] ?? 0) + (theirs[k] ?? 0) - (b[k] ?? 0);
    writeFileSync(p, JSON.stringify(out, null, 2) + '\n');
  } else {
    // Appended sections on both sides: keep ours then theirs; DECISIONS needs a blank line between entries.
    const sep = f.endsWith('DECISIONS.md') ? '\n' : '';
    const text = readFileSync(p, 'utf8').replace(/^<<<<<<< .*\n/gm, '').replace(/^=======\n/gm, sep).replace(/^>>>>>>> .*\n/gm, '');
    writeFileSync(p, text);
  }
  git('add', f);
}
git('commit', '-q', '-m', `${message}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`);
console.log(`MERGE OK · ${branch} · resolved ${conflicts.length ? conflicts.join(', ') : 'nothing'} · ${git('log', '--oneline', '-1')}`);
console.log(`  test-count now ${readFileSync(join(ROOT, 'Tools/test-count.json'), 'utf8').replace(/\s+/g, ' ').trim()} — run the tests before trusting it`);
