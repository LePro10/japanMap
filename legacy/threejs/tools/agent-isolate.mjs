#!/usr/bin/env node
/**
 * Isoliert parallele Agents in Git-Worktrees, ohne den Hauptordner anzufassen.
 *
 *   node tools/agent-isolate.mjs                 # Lane anlegen / wiederverwenden
 *   node tools/agent-isolate.mjs events          # fester Slug
 *   node tools/agent-isolate.mjs --status
 *   node tools/agent-isolate.mjs --snapshot      # nur lokal committen
 *   node tools/agent-isolate.mjs --finish        # committen + konfliktfrei in den Hauptordner mergen
 *   node tools/agent-isolate.mjs --hook-stop     # Grok/Cursor Stop-Hook (stdin-JSON, fail-open)
 *
 * Nie pushen. Nie `npm run world`. Junctions teilen node_modules und
 * assets/generated mit dem Hauptcheckout — .cache und dist nicht.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MAIN = path.resolve(HERE, '..');
function laneStateFile(main, slug) {
  return path.join(worktreesRoot(main), `${slug}.json`);
}
const HUMAN_DEV_PORT = 5180;
const HUMAN_PREVIEW_PORT = 4180;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const slugArg = args.find((a) => !a.startsWith('--'));

function die(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function git(cwd, argv, opts = {}) {
  const result = spawnSync('git', argv, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) {
    if (opts.ok) return { status: 1, stdout: '', stderr: String(result.error) };
    throw result.error;
  }
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if ((result.status ?? 1) !== 0 && !opts.ok) {
    const err = new Error(stderr.trim() || stdout.trim() || `git ${argv.join(' ')}`);
    err.status = result.status;
    throw err;
  }
  return { status: result.status ?? 0, stdout, stderr };
}

function gitOut(cwd, argv, opts = {}) {
  return git(cwd, argv, opts).stdout.trim();
}

function samePath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function resolveMain(start) {
  const toplevel = path.resolve(gitOut(start, ['rev-parse', '--show-toplevel']));
  const commonRel = gitOut(start, ['rev-parse', '--git-common-dir']);
  const gitDirRel = gitOut(start, ['rev-parse', '--git-dir']);
  const gitDir = path.resolve(toplevel, gitDirRel);
  const common = path.resolve(toplevel, commonRel);
  const main = path.resolve(common, '..');
  return { toplevel, main, gitDir, common };
}

function isPrimary(gitDir, common) {
  return samePath(gitDir, common);
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function sanitizeSlug(raw) {
  const cleaned = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || `lane-${randomBytes(3).toString('hex')}`;
}

function worktreesRoot(main) {
  return `${main}.worktrees`;
}

function lanePath(main, slug) {
  return path.join(worktreesRoot(main), slug);
}

function portFor(slug) {
  const n = createHash('sha1').update(slug).digest().readUInt16LE(0) % 18;
  const port = 5182 + n;
  if (port === HUMAN_DEV_PORT || port === HUMAN_PREVIEW_PORT) return 5199;
  return port;
}

function ensureJunction(link, target) {
  if (!fs.existsSync(target)) return { linked: false, reason: 'missing-target' };
  try {
    if (fs.existsSync(link)) {
      const stat = fs.lstatSync(link);
      if (stat.isSymbolicLink()) return { linked: true, reason: 'exists' };
      // Tracked checkout (assets/generated is in git here) — not a junction.
      return { linked: false, reason: 'present' };
    }
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, 'junction');
    return { linked: true, reason: 'created' };
  } catch (err) {
    return { linked: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function writeLane(data) {
  fs.mkdirSync(worktreesRoot(data.main), { recursive: true });
  fs.writeFileSync(laneStateFile(data.main, data.slug), `${JSON.stringify(data, null, 2)}\n`);
}

function readLane(toplevel, main) {
  const slug = path.basename(toplevel);
  const file = laneStateFile(main, slug);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function dirty(cwd) {
  return gitOut(cwd, ['status', '--porcelain']) !== '';
}

function ensureIdentity(cwd) {
  const name = gitOut(cwd, ['config', 'user.name'], { ok: true });
  const email = gitOut(cwd, ['config', 'user.email'], { ok: true });
  if (name && email) return;
  git(cwd, ['config', 'user.name', 'japanMap agent']);
  git(cwd, ['config', 'user.email', 'agent@japanmap.local']);
}

function snapshot(cwd, message) {
  if (!dirty(cwd)) return { committed: false, reason: 'clean' };
  git(cwd, ['add', '-A']);
  if (!dirty(cwd)) return { committed: false, reason: 'clean' };
  ensureIdentity(cwd);
  const msg = message || `wip(agent): auto snapshot`;
  git(cwd, ['commit', '-m', msg]);
  return { committed: true, sha: gitOut(cwd, ['rev-parse', '--short', 'HEAD']) };
}

function print(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function statusFrom(cwd) {
  const { toplevel, main, gitDir, common } = resolveMain(cwd);
  const primary = isPrimary(gitDir, common);
  const lane = readLane(toplevel, main);
  const branch = gitOut(toplevel, ['branch', '--show-current'], { ok: true });
  return {
    cwd: toplevel,
    main,
    isolated: !primary,
    primary,
    branch: branch || null,
    dirty: dirty(toplevel),
    lane,
    port: lane?.port ?? (primary ? HUMAN_DEV_PORT : portFor(path.basename(toplevel))),
    humanPorts: { dev: HUMAN_DEV_PORT, preview: HUMAN_PREVIEW_PORT },
  };
}

function isolate(startCwd, slugInput) {
  const { toplevel, main, gitDir, common } = resolveMain(startCwd);
  if (!isPrimary(gitDir, common)) {
    const slug = path.basename(toplevel);
    const existing = readLane(toplevel, main) ?? {
      main,
      slug,
      branch: gitOut(toplevel, ['branch', '--show-current']),
      path: toplevel,
      port: portFor(slug),
    };
    if (!readLane(toplevel, main)) writeLane(existing);
    return { ...existing, already: true, isolated: true, cwd: toplevel };
  }

  const slug = sanitizeSlug(slugInput);
  const dest = lanePath(main, slug);
  const branch = `agent/${slug}`;
  fs.mkdirSync(worktreesRoot(main), { recursive: true });

  const listed = gitOut(main, ['worktree', 'list', '--porcelain']);
  const destNorm = dest.replaceAll('\\', '/');
  const alreadyListed = listed.replaceAll('\\', '/').includes(`worktree ${destNorm}`);
  if (fs.existsSync(dest) && !alreadyListed) {
    fs.rmSync(dest, { recursive: true, force: true });
  }

  if (!alreadyListed) {
    const branchExists = gitOut(main, ['rev-parse', '--verify', branch], { ok: true });
    if (branchExists) {
      git(main, ['worktree', 'add', dest, branch]);
    } else {
      git(main, ['worktree', 'add', '-b', branch, dest, 'HEAD']);
    }
  }

  const nodeLink = ensureJunction(path.join(dest, 'node_modules'), path.join(main, 'node_modules'));
  const genLink = ensureJunction(
    path.join(dest, 'assets', 'generated'),
    path.join(main, 'assets', 'generated'),
  );

  const lane = {
    main,
    path: dest,
    branch,
    slug,
    port: portFor(slug),
    junctions: { node_modules: nodeLink, generated: genLink },
    created: new Date().toISOString(),
  };
  writeLane(lane);
  return { ...lane, already: alreadyListed, isolated: true, cwd: dest };
}

function finish(cwd, message) {
  const info = statusFrom(cwd);
  if (info.primary) {
    return { ok: false, error: 'not-isolated', hint: 'finish nur in einer Agent-Lane, nie im Hauptordner' };
  }
  const snap = snapshot(info.cwd, message || `agent(${info.branch}): done`);
  const merge = mergeIntoMain(info.main, info.branch);
  return { ok: merge.merged || snap.committed, snapshot: snap, merge, branch: info.branch, path: info.cwd };
}

function mergeIntoMain(main, branch) {
  if (!branch) return { merged: false, reason: 'no-branch' };
  const result = git(main, ['merge', '--autostash', '--no-edit', branch], { ok: true });
  if (result.status === 0) {
    return { merged: true, reason: 'merged' };
  }
  git(main, ['merge', '--abort'], { ok: true });
  return {
    merged: false,
    reason: 'conflict',
    detail: (result.stderr || result.stdout).trim().slice(0, 800),
    hint: `Lane bleibt auf ${branch}. Hauptordner unverändert. Später mergen: git merge ${branch}`,
  };
}

function hookStop() {
  try {
    const payload = JSON.parse(readStdin() || '{}');
    const cwd = payload.cwd || payload.workspaceRoot || process.cwd();
    const info = statusFrom(cwd);
    if (info.primary || !info.dirty) process.exit(0);
    snapshot(info.cwd, 'wip(agent): auto snapshot');
  } catch {
    // fail-open
  }
  process.exit(0);
}

function main() {
  const cwd = process.cwd();
  if (flags.has('--hook-stop')) hookStop();

  if (flags.has('--status')) {
    print(statusFrom(cwd));
    return;
  }
  if (flags.has('--snapshot')) {
    const info = statusFrom(cwd);
    if (info.primary) die('snapshot: Hauptordner wird nicht angefasst.');
    print({ ...snapshot(info.cwd), branch: info.branch, path: info.cwd });
    return;
  }
  if (flags.has('--finish')) {
    const message = process.env.AGENT_COMMIT_MSG || undefined;
    print(finish(cwd, message));
    return;
  }

  print(isolate(cwd, slugArg || process.env.AGENT_SLUG));
}

main();
