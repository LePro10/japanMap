#!/usr/bin/env node
/**
 * Poly Haven Asset-Fetcher
 *
 * Sucht und lädt CC0-Assets (HDRIs, Texturen, Modelle) von polyhaven.com
 * direkt ins Projekt und pflegt assets/CREDITS.md.
 *
 *   node tools/polyhaven.mjs search hdris --cat skies,sunrise-sunset --limit 20
 *   node tools/polyhaven.mjs search textures --q asphalt
 *   node tools/polyhaven.mjs info rooftop_night
 *   node tools/polyhaven.mjs preview rooftop_night qwantani_dusk_2_puresky
 *   node tools/polyhaven.mjs get hdris rooftop_night --res 2k
 *   node tools/polyhaven.mjs get textures asphalt_02 --res 2k --maps Diffuse,nor_gl,Rough
 *   node tools/polyhaven.mjs get models japanese_stone_lantern
 *
 * Alle Poly-Haven-Assets sind CC0 — kommerzielle Nutzung ohne Namensnennung
 * erlaubt. CREDITS.md wird trotzdem geführt (guter Stil + Nachvollziehbarkeit).
 */

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.polyhaven.com';
// `fileURLToPath`, nicht `.pathname` — siehe tools/bake-terrain.mjs.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Modelle landen im **Quellordner**, nicht dort, wo der Renderer lädt: PLAN.md
// P5.1 verlangt, dass jedes Modell erst durch `tools/process-assets.mjs` geht.
// `assets/source/` ist der Eingang dieser Kette, `assets/generated/models/` ihr
// Ausgang — und nur der wird geladen. HDRIs und Texturen bleiben, wo sie sind:
// die laufen nicht durch die Pipeline.
const OUT_DIRS = {
  hdris: 'assets/hdri',
  textures: 'assets/textures',
  models: 'assets/source/models',
};

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

async function api(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${path} → ${res.status} ${res.statusText}`);
  return res.json();
}

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

async function download(url, dest, expectedSize) {
  await mkdir(dirname(dest), { recursive: true });
  try {
    const existing = await stat(dest);
    if (!expectedSize || Math.abs(existing.size - expectedSize) < 1024) {
      console.log(c.dim(`  · ${dest.replace(ROOT, '')} — bereits vorhanden, übersprungen`));
      return false;
    }
  } catch {
    /* existiert nicht — herunterladen */
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fehlgeschlagen: ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(c.green(`  ✓ ${dest.replace(ROOT, '')}`) + c.dim(`  ${mb(buf.length)}`));
  return true;
}

/** Hängt einen Eintrag an assets/CREDITS.md an (idempotent pro Asset-ID). */
async function credit(id, type) {
  const info = await api(`/info/${id}`);
  const authors = Object.keys(info.authors ?? {}).join(', ') || 'unbekannt';
  const file = join(ROOT, 'assets/CREDITS.md');
  let body = '';
  try {
    body = await readFile(file, 'utf8');
  } catch {
    body =
      '# Asset-Credits\n\n' +
      'Alle Assets von [Poly Haven](https://polyhaven.com) stehen unter **CC0** ' +
      '(Public Domain) — Namensnennung ist nicht erforderlich, wird hier aber ' +
      'zur Nachvollziehbarkeit geführt.\n\n' +
      '| Asset | Typ | Autor | Quelle |\n|---|---|---|---|\n';
  }
  if (body.includes(`| \`${id}\` |`)) return;
  body += `| \`${id}\` | ${type} | ${authors} | https://polyhaven.com/a/${id} |\n`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body);
  console.log(c.dim(`  · CREDITS.md aktualisiert (${authors})`));
}

async function cmdSearch(type, opts) {
  if (!OUT_DIRS[type]) throw new Error(`Typ muss hdris|textures|models sein, war: ${type}`);
  const assets = await api(`/assets?t=${type}`);
  const wanted = (opts.cat ?? '').split(',').filter(Boolean).map((s) => s.toLowerCase());
  const query = (opts.q ?? '').toLowerCase();

  const rows = Object.entries(assets)
    .map(([id, a]) => ({ id, ...a, cats: (a.categories ?? []).map((s) => s.toLowerCase()) }))
    .filter((a) => wanted.every((w) => a.cats.includes(w)))
    .filter((a) => !query || `${a.id} ${a.name} ${(a.tags ?? []).join(' ')}`.toLowerCase().includes(query))
    .sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0))
    .slice(0, Number(opts.limit ?? 25));

  if (!rows.length) return console.log(c.yellow('Keine Treffer.'));
  console.log(c.bold(`\n${rows.length} Treffer (${type})\n`));
  for (const a of rows) {
    console.log(`${String(a.download_count ?? 0).padStart(8)}  ${c.bold(a.id.padEnd(36))} ${c.dim(a.cats.join(', '))}`);
  }
  console.log(c.dim(`\nVorschau ansehen:  node tools/polyhaven.mjs preview ${rows[0].id}\n`));
}

async function cmdInfo(ids) {
  for (const id of ids) {
    const [info, files] = await Promise.all([api(`/info/${id}`), api(`/files/${id}`)]);
    console.log(c.bold(`\n${id}`));
    console.log(`  Autor:      ${Object.keys(info.authors ?? {}).join(', ')}`);
    console.log(`  Kategorien: ${(info.categories ?? []).join(', ')}`);
    console.log(`  Tags:       ${(info.tags ?? []).join(', ')}`);
    const group = files.hdri ?? files;
    for (const [key, byRes] of Object.entries(group)) {
      if (typeof byRes !== 'object') continue;
      const parts = Object.entries(byRes)
        .flatMap(([res, byFmt]) =>
          Object.entries(byFmt ?? {}).map(([fmt, f]) => (f?.size ? `${res}/${fmt} ${mb(f.size)}` : null))
        )
        .filter(Boolean);
      if (parts.length) console.log(`  ${key.padEnd(12)} ${c.dim(parts.join('  '))}`);
    }
  }
  console.log();
}

async function cmdPreview(ids) {
  const dir = join(ROOT, '.cache/polyhaven-previews');
  for (const id of ids) {
    await download(
      `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=780&height=390`,
      join(dir, `${id}.png`)
    );
  }
  console.log(c.dim(`\nVorschaubilder in .cache/polyhaven-previews/\n`));
}

async function cmdGet(type, id, opts) {
  if (!OUT_DIRS[type]) throw new Error(`Typ muss hdris|textures|models sein, war: ${type}`);
  const files = await api(`/files/${id}`);
  const res = opts.res ?? (type === 'hdris' ? '2k' : '2k');
  console.log(c.bold(`\n${id} (${type}, ${res})`));

  if (type === 'hdris') {
    const fmt = opts.fmt ?? 'hdr';
    const f = files.hdri?.[res]?.[fmt];
    if (!f) throw new Error(`Nicht verfügbar: ${res}/${fmt}. Siehe: polyhaven.mjs info ${id}`);
    await download(f.url, join(ROOT, OUT_DIRS.hdris, `${id}_${res}.${fmt}`), f.size);
  } else if (type === 'textures') {
    const fmt = opts.fmt ?? 'jpg';
    const only = (opts.maps ?? '').split(',').filter(Boolean);
    const maps = Object.keys(files).filter((m) => !only.length || only.includes(m));
    if (!maps.length) throw new Error(`Keine Maps gefunden. Verfügbar: ${Object.keys(files).join(', ')}`);
    for (const m of maps) {
      const f = files[m]?.[res]?.[fmt] ?? files[m]?.[res]?.png;
      if (!f?.url) continue;
      const ext = f.url.split('.').pop();
      await download(f.url, join(ROOT, OUT_DIRS.textures, id, `${m}.${ext}`), f.size);
    }
  } else {
    const fmt = opts.fmt ?? 'gltf';
    const f = files[fmt]?.[res]?.[fmt];
    if (!f) throw new Error(`Nicht verfügbar: ${fmt}/${res}. Siehe: polyhaven.mjs info ${id}`);
    const base = join(ROOT, OUT_DIRS.models, id);
    await download(f.url, join(base, `${id}.${fmt}`), f.size);
    // Modelle referenzieren Texturen über relative Pfade in `include`
    for (const [rel, inc] of Object.entries(f.include ?? {})) {
      await download(inc.url, join(base, rel), inc.size);
    }
  }
  await credit(id, type);
  console.log();
}

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
    else positional.push(argv[i]);
  }
  return { positional, opts };
}

const USAGE = `
${c.bold('Poly Haven Asset-Fetcher')}  ${c.dim('— CC0-Assets ins Projekt laden')}

  ${c.bold('search')} <hdris|textures|models> [--cat a,b] [--q text] [--limit n]
  ${c.bold('info')}    <id...>
  ${c.bold('preview')} <id...>                       ${c.dim('→ .cache/polyhaven-previews/')}
  ${c.bold('get')}     <typ> <id> [--res 2k] [--fmt hdr|jpg|gltf] [--maps Diffuse,Rough]

${c.dim('Beispiele:')}
  node tools/polyhaven.mjs search hdris --cat skies,sunrise-sunset
  node tools/polyhaven.mjs preview rooftop_night
  node tools/polyhaven.mjs get hdris rooftop_night --res 4k
  node tools/polyhaven.mjs get textures asphalt_02 --res 2k
`;

const { positional, opts } = parseArgs(process.argv.slice(2));
const [cmd, ...rest] = positional;

try {
  if (cmd === 'search') await cmdSearch(rest[0], opts);
  else if (cmd === 'info') await cmdInfo(rest);
  else if (cmd === 'preview') await cmdPreview(rest);
  else if (cmd === 'get') await cmdGet(rest[0], rest[1], opts);
  else console.log(USAGE);
} catch (err) {
  console.error(c.red(`\nFehler: ${err.message}\n`));
  process.exit(1);
}
