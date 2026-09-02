/**
 * Baut die Assets für den Ladebildschirm: komprimierte Trailer-Stills,
 * optional ein Ken-Burns-MP4, und die heruntergerechnete Ring-Polyline.
 *
 *   node tools/build-start-screen.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'screenshots');
const outDir = join(root, 'public', 'start');
mkdirSync(outDir, { recursive: true });

const STILLS = [
  { file: '01-uebersicht.png', name: 'aerial' },
  { file: '05-bergpass.png', name: 'toge' },
  { file: '03-stadt-strasse.png', name: 'city' },
  { file: '09-fahren-ring.png', name: 'drive' },
  { file: '06-tempelpfad.png', name: 'torii' },
];

const LANDMARKS = [
  { id: 'paddy', x: -760, z: 60 },
  { id: 'toge', x: -536, z: -495 },
  { id: 'torii', x: 820, z: -940 },
  { id: 'city', x: 620, z: 120 },
  { id: 'coast', x: 100, z: 1400 },
];

async function stills() {
  for (const shot of STILLS) {
    const dest = join(outDir, `${shot.name}.webp`);
    await sharp(join(shots, shot.file))
      .resize(1600, 900, { fit: 'cover', position: 'centre' })
      .webp({ quality: 72, effort: 5 })
      .toFile(dest);
    const info = await sharp(dest).metadata();
    console.log(`still ${shot.name}.webp  ${info.size} B`);
  }
}

function ring() {
  const file = JSON.parse(readFileSync(join(root, 'assets/generated/roads/roads.json'), 'utf8'));
  const road = file.roads.find((entry) => entry.id === 'ring');
  if (!road) throw new Error('Ringstraße fehlt in roads.json.');
  const cl = road.centerline;
  const step = 18;
  const pts = [];
  for (let i = 0; i < cl.length; i += 3 * step) {
    pts.push(Number(cl[i].toFixed(1)), Number(cl[i + 2].toFixed(1)));
  }
  const firstX = pts[0];
  const firstZ = pts[1];
  const lastX = pts[pts.length - 2];
  const lastZ = pts[pts.length - 1];
  if (firstX !== lastX || firstZ !== lastZ) pts.push(firstX, firstZ);

  const n = pts.length / 2;
  const unlocks = {};
  for (const mark of LANDMARKS) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 2] - mark.x;
      const dz = pts[i * 2 + 1] - mark.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    unlocks[mark.id] = Number((best / (n - 1)).toFixed(3));
  }

  const body = `/**
 * Heruntergerechnete Ring-Mittellinie für den Ladebildschirm.
 * Erzeugt von \`tools/build-start-screen.mjs\` — nicht von Hand pflegen.
 *
 * Paare \`(x, z)\` in Weltmetern, geschlossen. Norden ist −Z.
 */
export const START_RING: readonly number[] = ${JSON.stringify(pts)};

/** Fortschritt 0…1, an dem die Ringfahrt am nächsten an der Landmarke ist. */
export const START_UNLOCKS: Readonly<Record<string, number>> = ${JSON.stringify(unlocks)};
`;
  writeFileSync(join(root, 'src/ui/startRing.ts'), body);
  console.log(`ring  ${n} Punkte, unlocks`, unlocks);
}

function hasFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function kenBurns(name, zoom, x, y) {
  const input = join(outDir, `${name}.webp`);
  const output = join(outDir, `${name}.mp4`);
  const filter = `scale=3200:1800,zoompan=z='${zoom}':x='${x}':y='${y}':d=125:s=1280x720:fps=25,format=yuv420p`;
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loop',
      '1',
      '-i',
      input,
      '-t',
      '5',
      '-vf',
      filter,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-movflags',
      '+faststart',
      output,
    ],
    { stdio: 'inherit' },
  );
}

function concatTrailer() {
  const list = join(outDir, 'concat.txt');
  const names = ['aerial', 'toge', 'city', 'drive'];
  writeFileSync(list, names.map((name) => `file '${name}.mp4'`).join('\n'));
  const output = join(outDir, 'trailer.mp4');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      list,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      output,
    ],
    { stdio: 'inherit' },
  );
}

await stills();
ring();

if (hasFfmpeg()) {
  kenBurns('aerial', 'min(zoom+0.0009,1.2)', 'iw/2-(iw/zoom/2)', 'ih/2-(ih/zoom/2)');
  kenBurns(
    'toge',
    'min(zoom+0.0008,1.16)',
    'iw/2-(iw/zoom/2)-iw*0.06',
    'ih/2-(ih/zoom/2)-ih*0.04',
  );
  kenBurns('city', 'min(zoom+0.0011,1.22)', 'iw/2-(iw/zoom/2)', 'ih/2-(ih/zoom/2)+ih*0.04');
  kenBurns('drive', 'min(zoom+0.001,1.2)', 'iw/2-(iw/zoom/2)', 'ih/2-(ih/zoom/2)+ih*0.08');
  concatTrailer();
  for (const name of ['aerial', 'toge', 'city', 'drive']) {
    try {
      unlinkSync(join(outDir, `${name}.mp4`));
    } catch {
      /* der Clip kann fehlen, wenn ffmpeg mittendrin abbricht */
    }
  }
  try {
    unlinkSync(join(outDir, 'concat.txt'));
  } catch {
    /* idem */
  }
} else {
  console.warn('ffmpeg fehlt — Trailer-Video wird übersprungen, Stills reichen.');
}
