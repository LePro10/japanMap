/**
 * Auflöser für den Prüfstand — `@/…` und Importe ohne Endung.
 *
 * Node ESM verlangt vollständige Dateinamen; der Quelltext dieses Projekts
 * schreibt (wie in Vite üblich) `@/config/vehicle.config` und `./Vehicle`.
 * Der Hook bildet beides auf die Platte ab, damit `--experimental-strip-types`
 * den Fahrzeugcode **unverändert** ausführen kann. Eine zweite, für den
 * Prüfstand abgeschriebene Physik wäre wertlos — sie misst dann sich selbst.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const SRC = new URL('../../src/', import.meta.url);
const EXT = ['.ts', '.mts', '.mjs', '.js', '/index.ts'];

function firstExisting(base) {
  for (const ext of EXT) {
    const candidate = new URL(base + ext);
    if (!existsSync(fileURLToPath(candidate))) continue;
    // **Das Format muss mitgegeben werden.** Ein kurzgeschlossener Treffer ohne
    // `format` lässt Node das Abstreifen der Typen überspringen; der erste
    // Versuch scheiterte an `import { type BreakEvent }` mit „Unexpected
    // identifier".
    return {
      url: candidate.href,
      shortCircuit: true,
      format: /\.m?ts$/.test(candidate.href) ? 'module-typescript' : 'module',
    };
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const hit = firstExisting(new URL(specifier.slice(2), SRC).href);
    if (hit) return hit;
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    // **Auf die bekannten Endungen prüfen, nicht auf „hat einen Punkt".** Die
    // erste Fassung schrieb `!/\.[a-z]+$/` — und `./vehicle.config` galt damit
    // als vollständiger Dateiname, weil `.config` wie eine Endung aussieht.
    if (!/\.(m?[jt]s|json|glsl)$/.test(specifier)) {
      const hit = firstExisting(new URL(specifier, context.parentURL).href);
      if (hit) return hit;
    }
  }
  return next(specifier, context);
}
