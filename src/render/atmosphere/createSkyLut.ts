import {
  ClampToEdgeWrapping,
  DataTexture,
  DataUtils,
  FloatType,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  RGBAFormat,
  RepeatWrapping,
  type DataTexture as DataTextureType,
} from 'three';

import { FOG } from '@/config/atmosphere.config';

/**
 * Rechnet das Himmels-HDRI auf eine winzige Nebelfarben-Tabelle herunter.
 *
 * Warum nicht direkt aus dem Panorama lesen? Zwei Gründe:
 *
 *  1. **Die Sonnenscheibe ist übersteuert.** Im 4k-Panorama laufen dort einzelne
 *     Kanäle in die Sättigung (gemessen in P1: `#ff1e00` statt einer plausiblen
 *     Lichtfarbe). Als Nebelfarbe gelesen ergäbe das einen grellen roten Fleck,
 *     sobald man in Sonnenrichtung schaut.
 *  2. **Nebel ist niederfrequent.** Ein 4096×2048-Panorama ohne Mipmaps liefert
 *     pro Pixel eine andere Richtung und damit Rauschen, wo ein Verlauf
 *     hingehört.
 *
 * Die Tabelle mittelt über Blöcke und deckelt die Quellwerte vorher. Der
 * Richtungsverlauf bleibt — die warme Seite bleibt warm — nur die Spitze geht.
 */
export function createSkyLut(source: DataTextureType): DataTexture {
  const image = source.image as { data: ArrayBufferView; width: number; height: number };
  const read = createReader(image.data, source.type);

  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const width = FOG.lutWidth;
  const height = FOG.lutHeight;
  const clamp = FOG.lutClamp;

  const data = new Float32Array(width * height * 4);
  const blockX = sourceWidth / width;
  const blockY = sourceHeight / height;

  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * blockY);
    const y1 = Math.min(sourceHeight, Math.floor((y + 1) * blockY));

    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * blockX);
      const x1 = Math.min(sourceWidth, Math.floor((x + 1) * blockX));

      let r = 0;
      let g = 0;
      let b = 0;
      let samples = 0;

      for (let sy = y0; sy < y1; sy++) {
        const row = sy * sourceWidth;
        for (let sx = x0; sx < x1; sx++) {
          const offset = (row + sx) * 4;
          r += Math.min(read(offset), clamp);
          g += Math.min(read(offset + 1), clamp);
          b += Math.min(read(offset + 2), clamp);
          samples++;
        }
      }

      const target = (y * width + x) * 4;
      const inverse = samples > 0 ? 1 / samples : 0;
      data[target] = r * inverse;
      data[target + 1] = g * inverse;
      data[target + 2] = b * inverse;
      data[target + 3] = 1;
    }
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
  texture.name = 'SkyFogLut';
  texture.colorSpace = LinearSRGBColorSpace;
  // Der Azimut läuft rundum: an der Naht bei 0°/360° muss die Filterung
  // übergreifen, sonst steht dort ein Farbsprung im Nebel. Die Pole dagegen
  // sind Endpunkte.
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  // Die Zeilenreihenfolge wird unverändert übernommen. Damit steht die Tabelle
  // genauso wie die Quelle, und `atmoEquirectUv` — dieselbe Formel, die three
  // für den Hintergrund benutzt — trifft dieselbe Richtung.
  texture.flipY = source.flipY;
  texture.needsUpdate = true;
  return texture;
}

/**
 * HDRLoader liefert standardmäßig Halbe-Genauigkeit (Uint16Array). Beide Fälle
 * werden unterstützt, weil die Wahl des Typs eine Ladeoption ist und nicht hier
 * entschieden wird.
 */
function createReader(data: ArrayBufferView, type: number): (index: number) => number {
  if (type === HalfFloatType) {
    const view = data as Uint16Array;
    return (index) => DataUtils.fromHalfFloat(view[index] ?? 0);
  }
  if (type === FloatType) {
    const view = data as Float32Array;
    return (index) => view[index] ?? 0;
  }
  throw new Error(
    `Himmels-HDRI hat einen unerwarteten Datentyp (${type}). ` +
      'Erwartet werden HalfFloatType oder FloatType.',
  );
}
