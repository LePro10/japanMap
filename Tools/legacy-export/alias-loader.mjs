import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The prototype uses TypeScript that Node cannot just strip (parameter properties); esbuild comes with
// the prototype's own devDependencies in the cache.
const esbuild = createRequire(process.env.LEGACY_SRC + '/../package.json')('esbuild');

const SRC = pathToFileURL(process.env.LEGACY_SRC.replace(/\/?$/, '/'));
const EXT = ['', '.ts', '.mts', '.mjs', '.js', '/index.ts'];

function firstExisting(base) {
  for (const ext of EXT) {
    const candidate = new URL(base + ext);
    const path = fileURLToPath(candidate);
    if (!existsSync(path) || (ext === '' && !/\.(m?[jt]s)$/.test(path))) continue;
    return { url: candidate.href, shortCircuit: true, format: 'module' };
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const hit = firstExisting(new URL(specifier.slice(2), SRC).href);
    if (hit) return hit;
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL && !/\.(m?[jt]s|json|glsl)$/.test(specifier)) {
    const hit = firstExisting(new URL(specifier, context.parentURL).href);
    if (hit) return hit;
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (!/\.m?ts$/.test(url)) return next(url, context);
  const source = readFileSync(fileURLToPath(url), 'utf8');
  const { code } = esbuild.transformSync(source, { loader: 'ts', format: 'esm', sourcefile: url, target: 'es2022' });
  return { format: 'module', source: code, shortCircuit: true };
}
