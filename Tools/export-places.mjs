#!/usr/bin/env node
// Export the prototype's place layouts (Sakura Commons, Koedo, Kiso, …) as JSON for the Unity place importer.
//   node Tools/export-places.mjs [place …]      → SourceData/legacy/places/<place>.json
// The legacy code runs unchanged from a private copy (legacy/ stays read-only and has no node_modules):
// Tools/.legacy-cache/ gets src/, tools/, assets/generated and `three`; refreshed on every run.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY = join(ROOT, 'legacy/threejs');
const CACHE = join(ROOT, 'Tools/.legacy-cache');
const OUT = join(ROOT, 'SourceData/legacy/places');

mkdirSync(CACHE, { recursive: true });
execFileSync('rsync', ['-a', '--delete', ...['src', 'tools', 'package.json', 'tsconfig.json'].map((p) => join(LEGACY, p)), CACHE + '/']);
execFileSync('rsync', ['-a', join(LEGACY, 'assets/generated'), join(CACHE, 'assets') + '/']);
if (!existsSync(join(CACHE, 'node_modules/three'))) {
  const version = JSON.parse(execFileSync('node', ['-p', `JSON.stringify(require('${join(CACHE, 'package.json')}').dependencies.three)`]).toString());
  execFileSync('npm', ['install', '--no-save', '--ignore-scripts', `three@${version}`], { cwd: CACHE, stdio: 'inherit' });
}
mkdirSync(OUT, { recursive: true });
const r = spawnSync('node', [
  '--experimental-strip-types', '--no-warnings',
  '--import', join(CACHE, 'tools/bench/register.mjs'),
  join(ROOT, 'Tools/legacy-export/places.mts'), CACHE, OUT, ...process.argv.slice(2),
], { stdio: 'inherit' });
process.exit(r.status ?? 1);
