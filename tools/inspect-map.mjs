#!/usr/bin/env node
/**
 * Karte prüfen und sichtbar machen — Werkzeug, kein Bauschritt.
 *
 *   node tools/inspect-map.mjs
 *   node tools/inspect-map.mjs --clean .cache/clean.r16   # zusätzlich Erdbau-Karte
 *
 * **Warum es das gibt.** Die Akzeptanzkriterien der Phasen sind Zahlen, und
 * Zahlen verstecken Formen. In P3 meldete der Bergpass Radius ✓, Steigung ✓ und
 * einen mittleren Erdbau innerhalb seines Grenzwerts — und lag als 300 × 250 m
 * große Abtragsfläche im Massiv. Sichtbar wurde das erst, als jemand ein Bild
 * gerendert hat. Zwei weitere Fehler derselben Sorte hat dieses Werkzeug danach
 * gefunden: 124 m Fahrbahn außerhalb der Weltgrenze, und zwei Kehren, die sich
 * mit 1,1 m Achsabstand kreuzten.
 *
 * Es ersetzt den Renderer nicht. Es beantwortet die Fragen, für die man sonst
 * einen laufenden Browser braucht — und die deshalb sonst gar nicht beantwortet
 * werden, wenn gerade keiner läuft.
 *
 * Ausgabe → assets/generated/inspect/
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

// `fileURLToPath`, nicht `.pathname` — siehe tools/bake-terrain.mjs.
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

// ── PNG ─────────────────────────────────────────────────────────────────────
//
// Von Hand, statt eine Abhängigkeit dafür zu holen: RGB8 ohne Filter ist ein
// Dutzend Zeilen, und `pngjs` liegt zwar im Projekt, ist aber Dev-Abhängigkeit
// des Bakers — ein Werkzeug, das man im Zweifel auch mal ohne `npm install`
// laufen lassen will, sollte damit nicht stehen und fallen.

function png(width, height, rgb) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // Filter „None"
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }

  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let k = n;
    for (let i = 0; i < 8; i++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1;
    crcTable[n] = k >>> 0;
  }
  const crc = (buf) => {
    let k = 0xffffffff;
    for (const b of buf) k = crcTable[(k ^ b) & 0xff] ^ (k >>> 8);
    return (k ^ 0xffffffff) >>> 0;
  };
  const chunk = (tag, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(tag, 'ascii'), data]);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, check]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Geländezugriff ──────────────────────────────────────────────────────────

function createField(raw, meta) {
  const res = meta.heightmap.res;
  const spacing = meta.heightmap.spacing;
  const half = meta.world.size / 2;
  const scale = meta.heightmap.heightRange / 65535;
  const minHeight = meta.world.minHeight;
  const last = res - 1;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  return {
    res,
    spacing,
    half,
    at(x, z) {
      // **Die Klemmung gehört auf die Gitterkoordinate, nicht auf den Index.**
      // Wird nur der Index geklemmt und der Bruchteil stehen gelassen,
      // extrapoliert die bilineare Formel außerhalb der Karte ins Absurde —
      // beim Prüfen des Bergpasses kam so ein 141-m-Einschnitt heraus, den es
      // nicht gab. Der Fehler saß im Prüfskript, nicht in der Straße.
      const gx = clamp((x + half) / spacing, 0, last);
      const gz = clamp((z + half) / spacing, 0, last);
      const ix = gx | 0;
      const iz = gz | 0;
      const jx = ix < last ? ix + 1 : last;
      const jz = iz < last ? iz + 1 : last;
      const fx = gx - ix;
      const fz = gz - iz;
      const h = (a, b) => minHeight + raw[b * res + a] * scale;
      return (
        (h(ix, iz) + (h(jx, iz) - h(ix, iz)) * fx) * (1 - fz) +
        (h(ix, jz) + (h(jx, jz) - h(ix, jz)) * fx) * fz
      );
    },
    texel(ix, iz) {
      return minHeight + raw[clamp(iz, 0, last) * res + clamp(ix, 0, last)] * scale;
    },
  };
}

// ── Prüfungen ───────────────────────────────────────────────────────────────

/** Schneiden sich zwei Strecken echt (nicht nur an den Enden)? */
function crosses(p, q, r, s) {
  const d1x = q[0] - p[0];
  const d1z = q[1] - p[1];
  const d2x = s[0] - r[0];
  const d2z = s[1] - r[1];
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((r[0] - p[0]) * d2z - (r[1] - p[1]) * d2x) / den;
  const u = ((r[0] - p[0]) * d1z - (r[1] - p[1]) * d1x) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

/**
 * Eine Strecke durchmessen.
 *
 * `minGap` ist eine **Bogenlänge**: benachbarte Abtastpunkte liegen naturgemäß
 * dicht beieinander, das ist keine Annäherung an sich selbst. Bei einer
 * geschlossenen Runde wird zirkulär gerechnet, sonst meldet der Rundenschluss
 * einen Abstand von wenigen Metern — Anfang und Ende *sind* Nachbarn.
 */
function inspectRoad(road, field, spacing, minGap = 120, probe = 24) {
  const line = road.centerline;
  const count = line.length / 3;
  const closed = road.closed === true;
  const half = field.half;

  const pts = [];
  for (let i = 0; i < count; i++) pts.push([line[i * 3], line[i * 3 + 2]]);

  let outside = 0;
  let worstOutside = 0;
  let meshError = 0;
  const trench = [];

  for (let i = 0; i < count; i++) {
    const [x, z] = pts[i];
    const y = line[i * 3 + 1];

    const over = Math.max(Math.abs(x) - half, Math.abs(z) - half);
    if (over > 0) {
      outside++;
      if (over > worstOutside) worstOutside = over;
    }

    meshError += Math.abs(field.at(x, z) - y);

    const j = Math.min(count - 1, i + 1);
    const k = Math.max(0, i - 1);
    const tx = pts[j][0] - pts[k][0];
    const tz = pts[j][1] - pts[k][1];
    const len = Math.hypot(tx, tz) || 1;
    const px = -tz / len;
    const pz = tx / len;
    trench.push(
      (field.at(x + px * probe, z + pz * probe) + field.at(x - px * probe, z - pz * probe)) / 2 - y,
    );
  }

  const gapSteps = Math.ceil(minGap / spacing);
  let selfCross = 0;
  let minClearance = Infinity;
  let clearanceAt = 0;
  for (let i = 0; i + 1 < count; i++) {
    for (let j = i + gapSteps; j + 1 < count; j++) {
      // Bei einer Runde ist auch der Weg *rückwärts* über den Anfang kurz.
      const along = closed
        ? Math.min((j - i) * spacing, (count - (j - i)) * spacing)
        : (j - i) * spacing;
      if (along < minGap) continue;
      if (crosses(pts[i], pts[i + 1], pts[j], pts[j + 1])) selfCross++;
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < minClearance) {
        minClearance = d;
        clearanceAt = i * spacing;
      }
    }
  }

  const sorted = [...trench].sort((a, b) => a - b);
  return {
    outside: outside * spacing,
    worstOutside,
    meshError: meshError / count,
    selfCross,
    minClearance,
    clearanceAt,
    trenchMedian: sorted[sorted.length >> 1],
    trench95: sorted[Math.floor(sorted.length * 0.95)],
    deepStretch: trench.filter((v) => v > 50).length * spacing,
    length: road.length,
  };
}

// ── Bilder ──────────────────────────────────────────────────────────────────

/**
 * Schummerung mit eingezeichnetem Netz.
 *
 * Die Sonne steht hier bei 45°, nicht bei den 2,2° des Spiels: es geht um das
 * Lesen der Form, nicht um die Stimmung. Bei streifendem Licht verschwindet
 * genau das, was man sehen will — ob eine Straße im Gelände liegt oder darin
 * steckt.
 */
function hillshade(field, meta, roads, box, width) {
  const scale = (box.x1 - box.x0) / width;
  const height = Math.max(1, Math.round((box.z1 - box.z0) / scale));
  const buf = Buffer.alloc(width * height * 3);
  const sp = field.spacing;

  for (let py = 0; py < height; py++) {
    const iz = Math.round((box.z0 + (py + 0.5) * scale + field.half) / sp);
    for (let px = 0; px < width; px++) {
      const ix = Math.round((box.x0 + (px + 0.5) * scale + field.half) / sp);
      const h = field.texel(ix, iz);
      const dx = (field.texel(ix + 1, iz) - field.texel(ix - 1, iz)) / (2 * sp);
      const dz = (field.texel(ix, iz + 1) - field.texel(ix, iz - 1)) / (2 * sp);
      const norm = Math.sqrt(dx * dx + dz * dz + 1);
      let shade = (-dx * -0.6 + 0.65 + -dz * -0.46) / norm;
      shade = Math.max(0, Math.min(1, 0.25 + 0.75 * shade));
      const t = Math.max(0, Math.min(1, (h - meta.world.seaLevel) / meta.world.maxHeight));
      const k = (py * width + px) * 3;
      buf[k] = (60 + 120 * t) * shade;
      buf[k + 1] = (80 + 110 * t) * shade;
      buf[k + 2] = (70 + 100 * t) * shade;
    }
  }

  const dot = (x, z, colour, radius) => {
    const px = Math.round((x - box.x0) / scale);
    const py = Math.round((z - box.z0) / scale);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const ax = px + dx;
        const ay = py + dy;
        if (ax < 0 || ax >= width || ay < 0 || ay >= height) continue;
        const k = (ay * width + ax) * 3;
        buf[k] = colour[0];
        buf[k + 1] = colour[1];
        buf[k + 2] = colour[2];
      }
    }
  };

  for (const road of roads) {
    const colour = road.type === 'mountain' ? [235, 60, 40] : [250, 190, 60];
    for (let i = 0; i < road.centerline.length / 3; i++) {
      dot(road.centerline[i * 3], road.centerline[i * 3 + 2], colour, 2);
    }
  }

  return { buffer: png(width, height, buf), width, height };
}

/** Abtrag und Auftrag gegen ein Referenzfeld — rot ab, blau auf. */
function earthwork(field, clean, box, width) {
  const scale = (box.x1 - box.x0) / width;
  const height = Math.max(1, Math.round((box.z1 - box.z0) / scale));
  const buf = Buffer.alloc(width * height * 3);
  const sp = field.spacing;

  for (let py = 0; py < height; py++) {
    const iz = Math.round((box.z0 + (py + 0.5) * scale + field.half) / sp);
    for (let px = 0; px < width; px++) {
      const ix = Math.round((box.x0 + (px + 0.5) * scale + field.half) / sp);
      const d = field.texel(ix, iz) - clean.texel(ix, iz);
      const k = (py * width + px) * 3;
      if (d < -0.5) {
        const t = Math.min(1, -d / 80);
        buf[k] = 30 + 225 * t;
        buf[k + 1] = 30 + 60 * (1 - t);
        buf[k + 2] = 30;
      } else if (d > 0.5) {
        const t = Math.min(1, d / 30);
        buf[k] = 30;
        buf[k + 1] = 60 + 120 * t;
        buf[k + 2] = 60 + 195 * t;
      } else {
        buf[k] = buf[k + 1] = buf[k + 2] = 24;
      }
    }
  }

  return { buffer: png(width, height, buf), width, height };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = true;
    else opts[key] = next;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const terrainDir = join(ROOT, 'assets/generated/terrain');
  const meta = JSON.parse(await readFile(join(terrainDir, 'meta.json'), 'utf8'));
  const field = createField(
    new Uint16Array((await readFile(join(terrainDir, 'height.r16'))).buffer.slice(0)),
    meta,
  );
  const roadFile = JSON.parse(
    await readFile(join(ROOT, 'assets/generated/roads/roads.json'), 'utf8'),
  );
  const spacing = roadFile.sampleSpacing;

  console.log(c.bold('\nKarte prüfen\n'));
  console.log(
    c.dim(
      `  Höhenfeld ${meta.heightmap.res}² · ${meta.carved ? 'mit eingeschnittenen' : 'ohne'} Straßen · ` +
        `${roadFile.roads.length} Strecken, ${(roadFile.measured.totalLength / 1000).toFixed(2)} km\n`,
    ),
  );

  let problems = 0;
  for (const road of roadFile.roads) {
    const r = inspectRoad(road, field, spacing);
    const bad = r.selfCross > 0 || r.outside > 0 || r.minClearance < road.widths[0];
    if (bad) problems++;

    console.log(
      `  ${bad ? c.red('✗') : c.green('✓')} ${road.id.padEnd(6)} ${String(Math.round(r.length)).padStart(5)} m` +
        `  · Mesh im Terrain ⌀ ${r.meshError.toFixed(3)} m` +
        `  · Kehren ${String(road.measured.hairpins).padStart(2)}`,
    );
    console.log(
      c.dim(
        `      Graben ${probeLabel()} Median ${r.trenchMedian.toFixed(1)} m · ` +
          `95 % ${r.trench95.toFixed(1)} m · über 50 m auf ${Math.round(r.deepStretch)} m Strecke`,
      ),
    );
    const clearance = `kleinster Achsabstand ${r.minClearance.toFixed(1)} m bei km ${(r.clearanceAt / 1000).toFixed(2)}`;
    console.log(
      (r.selfCross > 0 || r.minClearance < road.widths[0] ? c.red : c.dim)(
        `      Selbstschnitte ${r.selfCross} · ${clearance}`,
      ),
    );
    if (r.outside > 0) {
      console.log(
        c.red(`      ${Math.round(r.outside)} m außerhalb der Welt, bis zu ${r.worstOutside.toFixed(1)} m weit`),
      );
    }
  }

  // Bildausschnitt: die ganze Welt, oder eng um eine Strecke.
  const focus = typeof opts.road === 'string' ? roadFile.roads.find((r) => r.id === opts.road) : null;
  let box;
  if (focus) {
    const xs = [];
    const zs = [];
    for (let i = 0; i < focus.centerline.length / 3; i++) {
      xs.push(focus.centerline[i * 3]);
      zs.push(focus.centerline[i * 3 + 2]);
    }
    const pad = 260;
    box = { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad };
  } else {
    box = { x0: -field.half, x1: field.half, z0: -field.half, z1: field.half };
  }

  const outDir = join(ROOT, 'assets/generated/inspect');
  await mkdir(outDir, { recursive: true });
  const width = Number(opts.width ?? 1200);

  const shade = hillshade(field, meta, roadFile.roads, box, width);
  await writeFile(join(outDir, 'hillshade.png'), shade.buffer);
  console.log(c.dim(`\n  assets/generated/inspect/hillshade.png  ${shade.width}×${shade.height}`));

  if (typeof opts.clean === 'string') {
    const cleanMeta = meta;
    const clean = createField(
      new Uint16Array((await readFile(opts.clean)).buffer.slice(0)),
      cleanMeta,
    );
    const map = earthwork(field, clean, box, width);
    await writeFile(join(outDir, 'erdbau.png'), map.buffer);
    console.log(c.dim(`  assets/generated/inspect/erdbau.png     ${map.width}×${map.height}`));
  } else {
    console.log(
      c.dim(
        '  (--clean <höhenfeld.r16> ergänzt die Erdbau-Karte: `npm run bake:clean`,\n' +
          '   die Datei wegkopieren, dann `npm run world` und hier übergeben)',
      ),
    );
  }

  console.log('');
  if (problems > 0) {
    console.warn(c.red(`  ${problems} Strecke(n) mit Geometriefehlern.\n`));
    process.exitCode = 1;
  }
}

function probeLabel() {
  return '(24 m seitlich)';
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
