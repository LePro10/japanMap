/**
 * Spektrogramm einer WAV-Datei als PNG — Tonschicht 2.
 *
 * Ein Ohr ist auf dieser Maschine nicht dabei. Ein Spektrogramm zeigt
 * trotzdem, was ein Motorton *tut*: ob die Obertöne mit der Drehzahl
 * wandern, ob sie beim Schalten fallen, ob über 8 kHz Rauschen steht, wo
 * keines hingehört, ob eine Schleife sich wiederholt. Dieselbe Regel wie
 * „wer eine Differenz misst, sieht sie sich an" — nur für Ton.
 *
 *   node tools/bench/spectro.mjs in.wav out.png [maxHz=6000]
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const [, , inFile, outFile, maxArg] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: spectro.mjs in.wav out.png [maxHz]');
  process.exit(2);
}
const wav = fs.readFileSync(inFile);
const channels = wav.readUInt16LE(22);
const sr = wav.readUInt32LE(24);
let off = 12;
while (wav.toString('ascii', off, off + 4) !== 'data') off += 8 + wav.readUInt32LE(off + 4);
const dataLen = wav.readUInt32LE(off + 4);
const start = off + 8;
const n = dataLen / (2 * channels);
const mono = new Float32Array(n);
for (let i = 0; i < n; i++) mono[i] = wav.readInt16LE(start + i * 2 * channels) / 32768;

const N = 4096;
const hop = Math.floor(sr / 100);
const maxHz = Number(maxArg ?? 6000);
const bins = Math.floor((maxHz / sr) * N);
const H = 400;
const cols = Math.floor((n - N) / hop);
const img = new Float32Array(cols * H);
const re = new Float64Array(N);
const im = new Float64Array(N);
const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

for (let c = 0; c < cols; c++) {
  for (let i = 0; i < N; i++) {
    re[i] = mono[c * hop + i] * win[i];
    im[i] = 0;
  }
  fft(re, im);
  for (let y = 0; y < H; y++) {
    // Logarithmische Frequenzachse ab 30 Hz — Motoren leben unten.
    const hz = 30 * Math.pow(maxHz / 30, y / (H - 1));
    const b = Math.min(bins, Math.round((hz / sr) * N));
    const mag = Math.hypot(re[b], im[b]);
    img[(H - 1 - y) * cols + c] = 20 * Math.log10(mag + 1e-9);
  }
}
const W = cols;
let top = -Infinity;
for (const v of img) if (v > top) top = v;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const db = img[y * W + x];
    const t = Math.max(0, Math.min(1, (db - (top - 75)) / 75));
    const r = Math.round(255 * Math.min(1, t * 2));
    const g = Math.round(255 * Math.max(0, Math.min(1, t * 2 - 0.6)));
    const bl = Math.round(255 * Math.max(0, 1 - Math.abs(t - 0.3) * 3) * 0.8);
    const o = y * (W * 3 + 1) + 1 + x * 3;
    raw[o] = r;
    raw[o + 1] = g;
    raw[o + 2] = bl;
  }
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
fs.writeFileSync(
  outFile,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
console.log(`${outFile}: ${W}×${H}, ${(n / sr).toFixed(1)} s, 30…${maxHz} Hz log`);
