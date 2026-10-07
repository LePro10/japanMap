// Shared helpers for the agent tools: locate Unity, detect an open editor, run batchmode.
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LOG_DIR = join(ROOT, 'Logs', 'tools');

export function unityVersion() {
  const text = readFileSync(join(ROOT, 'ProjectSettings', 'ProjectVersion.txt'), 'utf8');
  return /m_EditorVersion:\s*(\S+)/.exec(text)[1];
}

/** UNITY_EDITOR overrides; otherwise the Hub install path for the project's exact version. */
export function unityPath() {
  if (process.env.UNITY_EDITOR) return process.env.UNITY_EDITOR;
  const v = unityVersion();
  const candidates = {
    darwin: [`/Applications/Unity/Hub/Editor/${v}/Unity.app/Contents/MacOS/Unity`],
    win32: [`C:/Program Files/Unity/Hub/Editor/${v}/Editor/Unity.exe`],
    linux: [`${process.env.HOME}/Unity/Hub/Editor/${v}/Editor/Unity`],
  }[process.platform] ?? [];
  const found = candidates.find(existsSync);
  if (!found) throw new Error(`Unity ${v} not found (looked in ${candidates.join(', ')}). Set UNITY_EDITOR.`);
  return found;
}

/**
 * Batchmode cannot open a project the editor has open (project lock). On macOS/Linux the
 * process list tells; on Windows the lock file is the only cheap signal (may be stale after a crash).
 */
export function editorIsOpen() {
  if (process.platform === 'win32') return existsSync(join(ROOT, 'Temp', 'UnityLockfile'));
  try {
    const ps = execSync('ps -axo command', { encoding: 'utf8' });
    const root = ROOT.toLowerCase();
    return ps.split('\n').some((l) => {
      const line = l.toLowerCase();
      return line.includes('/unity.app/contents/macos/unity') && !line.includes('-batchmode') && line.includes(root);
    });
  } catch {
    return false;
  }
}

export function failIfEditorOpen(tool) {
  if (!editorIsOpen()) return;
  console.log(`${tool} BLOCKED — the Unity editor has this project open. Use the Unity MCP instead (see CLAUDE.md "Befehle").`);
  process.exit(2);
}

/** Runs Unity in batchmode; resolves with exit code, log text and duration. */
export function runUnity(args, logName) {
  mkdirSync(LOG_DIR, { recursive: true });
  const logFile = join(LOG_DIR, `${logName}.log`);
  const full = ['-batchmode', '-projectPath', ROOT, '-logFile', logFile, ...args];
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn(unityPath(), full, { stdio: 'ignore' });
    child.on('exit', (code) => {
      const log = existsSync(logFile) ? readFileSync(logFile, 'utf8') : '';
      done({ code, log, logFile, seconds: (Date.now() - started) / 1000 });
    });
  });
}

/** Problems in a batchmode log that a green exit code would hide. */
export function logProblems(log) {
  const unique = (re) => [...new Set(log.split('\n').filter((l) => re.test(l)).map((l) => l.trim()))];
  return {
    compileErrors: unique(/error CS\d+/),
    ownWarnings: unique(/Assets\/_Project\/.*warning CS\d+/),
    orphanMeta: unique(/A meta data file \(\.meta\) exists but its asset/),
  };
}

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
export const flag = (name) => process.argv.includes(`--${name}`);
