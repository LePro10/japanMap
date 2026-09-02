#!/usr/bin/env node
/**
 * Erzeugt die statische Vogelperspektive für die Spielkarte aus den echten
 * gebackenen Welt-Daten. Kein zweiter Three-Renderer, kein Screenshot-Trick:
 * Heightfield + Zonen + Relief werden einmal beim World-Bake zu einem kleinen
 * WebP verdichtet. Zur Laufzeit ist die Basiskarte dann nur ein Bild.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TERRAIN = join(ROOT, 'assets/generated/terrain');
const OUTPUT_RES = 1024;

const ROCK = [105, 110, 106];
const GRASS = [69, 101, 76];
const SAND = [171, 151, 108];
const PADDY = [72, 112, 91];
const WATER_DEEP = [25, 57, 73];
const WATER_SHALLOW = [39, 86, 102];

const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);
const mix = (a, b, t) => a + (b - a) * t;

async function main() {
  const [metaText, heightBuffer, zonesBuffer, shadeBuffer, riverText] = await Promise.all([
    readFile(join(TERRAIN, 'meta.json'), 'utf8'),
    readFile(join(TERRAIN, 'height.r16')),
    readFile(join(TERRAIN, 'zones.png')),
    readFile(join(TERRAIN, 'shade.png')),
    readFile(join(TERRAIN, 'river.json'), 'utf8'),
  ]);

  const meta = JSON.parse(metaText);
  const zones = PNG.sync.read(zonesBuffer);
  const shade = PNG.sync.read(shadeBuffer);
  const river = JSON.parse(riverText);

  const heightRes = meta.heightmap.res;
  const heightCount = heightRes * heightRes;
  if (heightBuffer.byteLength !== heightCount * 2) {
    throw new Error(`height.r16: ${heightBuffer.byteLength} Bytes, erwartet ${heightCount * 2}.`);
  }

  const minHeight = meta.world.minHeight;
  const heightRange = meta.heightmap.heightRange;
  const seaLevel = meta.world.seaLevel;
  const worldSize = meta.world.size;
  const sourceSpacing = worldSize / (heightRes - 1);

  const output = new PNG({ width: OUTPUT_RES, height: OUTPUT_RES, colorType: 6 });

  const readHeight = (x, y) => {
    const sx = clamp(x, 0, heightRes - 1);
    const sy = clamp(y, 0, heightRes - 1);
    const raw = heightBuffer.readUInt16LE((sy * heightRes + sx) * 2);
    return minHeight + (raw / 65535) * heightRange;
  };

  const sampleIndex = (x, y, width, height) => {
    const sx = clamp(Math.round((x / (OUTPUT_RES - 1)) * (width - 1)), 0, width - 1);
    const sy = clamp(Math.round((y / (OUTPUT_RES - 1)) * (height - 1)), 0, height - 1);
    return (sy * width + sx) * 4;
  };

  const light = normalize(-0.52, 0.78, -0.35);

  for (let y = 0; y < OUTPUT_RES; y++) {
    const hy = clamp(Math.round((y / (OUTPUT_RES - 1)) * (heightRes - 1)), 0, heightRes - 1);
    for (let x = 0; x < OUTPUT_RES; x++) {
      const hx = clamp(Math.round((x / (OUTPUT_RES - 1)) * (heightRes - 1)), 0, heightRes - 1);
      const height = readHeight(hx, hy);
      const target = (y * OUTPUT_RES + x) * 4;

      let r;
      let g;
      let b;

      if (height <= seaLevel) {
        const shallow = clamp((height - (seaLevel - 30)) / 30, 0, 1);
        r = mix(WATER_DEEP[0], WATER_SHALLOW[0], shallow);
        g = mix(WATER_DEEP[1], WATER_SHALLOW[1], shallow);
        b = mix(WATER_DEEP[2], WATER_SHALLOW[2], shallow);
      } else {
        const zoneIndex = sampleIndex(x, y, zones.width, zones.height);
        const rock = zones.data[zoneIndex] / 255;
        const grass = zones.data[zoneIndex + 1] / 255;
        const sand = zones.data[zoneIndex + 2] / 255;
        const paddy = zones.data[zoneIndex + 3] / 255;
        const weight = Math.max(0.001, rock + grass + sand + paddy);

        r = (ROCK[0] * rock + GRASS[0] * grass + SAND[0] * sand + PADDY[0] * paddy) / weight;
        g = (ROCK[1] * rock + GRASS[1] * grass + SAND[1] * sand + PADDY[1] * paddy) / weight;
        b = (ROCK[2] * rock + GRASS[2] * grass + SAND[2] * sand + PADDY[2] * paddy) / weight;

        const step = 2;
        const dx = (readHeight(hx + step, hy) - readHeight(hx - step, hy)) / (2 * step * sourceSpacing);
        const dz = (readHeight(hx, hy + step) - readHeight(hx, hy - step)) / (2 * step * sourceSpacing);
        const normal = normalize(-dx, 1, -dz);
        const sun = clamp(normal.x * light.x + normal.y * light.y + normal.z * light.z, -0.35, 1);

        const shadeIndex = sampleIndex(x, y, shade.width, shade.height);
        const sky = shade.data[shadeIndex + 2] / 255;
        const relief = 0.62 + (sun + 0.35) * 0.27;
        const ambient = 0.88 + sky * 0.12;
        const altitude = clamp((height - 40) / 380, 0, 1);
        const brightness = relief * ambient * (0.98 + altitude * 0.08);

        r *= brightness;
        g *= brightness;
        b *= brightness;

        // Sehr feine Höhenlinien geben der Karte Struktur, ohne wie eine
        // technische Topografie auszusehen. Nur oberhalb der Ebenen.
        if (height > 45) {
          const contourDistance = Math.min(height % 50, 50 - (height % 50));
          if (contourDistance < 0.8) {
            r *= 0.86;
            g *= 0.86;
            b *= 0.86;
          }
        }
      }

      output.data[target] = clamp(Math.round(r), 0, 255);
      output.data[target + 1] = clamp(Math.round(g), 0, 255);
      output.data[target + 2] = clamp(Math.round(b), 0, 255);
      output.data[target + 3] = 255;
    }
  }

  drawRiver(output, river.centerline, worldSize);

  const png = PNG.sync.write(output, { colorType: 6, inputColorType: 6 });
  const destination = join(TERRAIN, 'navigation-map.webp');
  const webp = await sharp(png).webp({ quality: 86, effort: 6, smartSubsample: true }).toBuffer();
  await writeFile(destination, webp);

  console.log(
    `Navigation-Basiskarte: ${OUTPUT_RES}×${OUTPUT_RES}, ${(webp.byteLength / 1024).toFixed(1)} KiB → ` +
      'assets/generated/terrain/navigation-map.webp',
  );
}

function drawRiver(image, centerline, worldSize) {
  if (!Array.isArray(centerline) || centerline.length < 6) return;
  const half = worldSize * 0.5;
  const toPixel = (x, z) => ({
    x: ((x + half) / worldSize) * (OUTPUT_RES - 1),
    y: ((z + half) / worldSize) * (OUTPUT_RES - 1),
  });

  let previous = toPixel(centerline[0], centerline[2]);
  for (let i = 3; i + 2 < centerline.length; i += 3) {
    const next = toPixel(centerline[i], centerline[i + 2]);
    drawSegment(image, previous.x, previous.y, next.x, next.y, 2.2);
    previous = next;
  }
}

function drawSegment(image, x0, y0, x1, y1, radius) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 1.3));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    drawDisc(image, x0 + dx * t, y0 + dy * t, radius);
  }
}

function drawDisc(image, cx, cy, radius) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(image.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(image.height - 1, Math.ceil(cy + radius));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > radius) continue;
      const alpha = clamp(1 - distance / radius, 0.2, 0.82);
      const index = (y * image.width + x) * 4;
      image.data[index] = Math.round(mix(image.data[index], 45, alpha));
      image.data[index + 1] = Math.round(mix(image.data[index + 1], 105, alpha));
      image.data[index + 2] = Math.round(mix(image.data[index + 2], 124, alpha));
    }
  }
}

function normalize(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

await main();
