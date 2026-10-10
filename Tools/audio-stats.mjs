#!/usr/bin/env node
// Levels of a WAV over time (for recordings of the game's sound, Tools/play.mjs "record"): RMS and peak per slice
// in dBFS, clipping, and zero crossings per second as a rough pitch trace — measured, since nobody listens here.
//   node Tools/audio-stats.mjs <file.wav> [sliceSeconds=0.5]
import { readFileSync } from 'node:fs';
const [file, sliceArg = '0.5'] = process.argv.slice(2);
const b = readFileSync(file);
let o = 12, fmt = null, data = null;
while (o < b.length - 8) {
  const id = b.toString('ascii', o, o + 4), size = b.readUInt32LE(o + 4);
  if (id === 'fmt ') fmt = { ch: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
  if (id === 'data') data = b.subarray(o + 8, o + 8 + size);
  o += 8 + size + (size & 1);
}
const n = data.length / 2 / fmt.ch;
const slice = Math.round(Number(sliceArg) * fmt.rate);
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120).toFixed(1).padStart(6);
let clip = 0, gPeak = 0, gSum = 0;
console.log(`${file}: ${(n / fmt.rate).toFixed(1)} s, ${fmt.rate} Hz, ${fmt.ch} ch`);
console.log('   t s   rms dB  peak dB  zc/s');
for (let s = 0; s < n; s += slice) {
  let sum = 0, peak = 0, zc = 0, prev = 0;
  const end = Math.min(n, s + slice);
  for (let i = s; i < end; i++) {
    let v = 0;
    for (let c = 0; c < fmt.ch; c++) v += b.readInt16LE((i * fmt.ch + c) * 2 + data.byteOffset - b.byteOffset) / 32768;
    v /= fmt.ch;
    sum += v * v; peak = Math.max(peak, Math.abs(v));
    if (Math.abs(v) > 0.999) clip++;
    if ((v >= 0) !== (prev >= 0)) zc++;
    prev = v;
  }
  gPeak = Math.max(gPeak, peak); gSum += sum;
  console.log(`${(s / fmt.rate).toFixed(1).padStart(6)} ${db(Math.sqrt(sum / (end - s)))} ${db(peak)} ${String(Math.round(zc / ((end - s) / fmt.rate))).padStart(6)}`);
}
console.log(`total rms ${db(Math.sqrt(gSum / n))} dB · peak ${db(gPeak)} dB · clipped samples ${clip}`);
