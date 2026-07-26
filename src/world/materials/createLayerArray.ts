import {
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
  RGBAFormat,
} from 'three';

export interface LayerArrayOptions {
  /** true für Albedo, false für Normal- und ARM-Karten. */
  readonly srgb: boolean;
  readonly anisotropy: number;
  readonly label: string;
}

/**
 * Lädt mehrere gleich große Bilder und packt sie in **eine** Array-Textur.
 *
 * Der Grund ist ein hartes Limit: das Terrain-Material braucht Albedo, Normale
 * und ARM für vier Splat-Kanäle. Als einzelne Texturen wären das zwölf
 * Sampler — WebGL2 garantiert im Fragment-Shader nur sechzehn, und Envmap,
 * Shadow-Map und alles ab P2 brauchen davon ebenfalls welche. Als drei
 * Array-Texturen bleiben dreizehn frei.
 *
 * Die Zeilen werden beim Packen gespiegelt. Grund: `UNPACK_FLIP_Y_WEBGL` gilt
 * in WebGL2 nur für `texImage2D`, nicht für `texImage3D` — eine Array-Textur
 * kann sich also nicht wie eine normale Textur verhalten, wenn man es ihr
 * nicht selbst beibringt. Ohne die Spiegelung lägen Array-Texturen vertikal
 * anders herum als jede per TextureLoader geladene Textur.
 */
export async function createLayerArray(
  urls: readonly string[],
  options: LayerArrayOptions,
): Promise<DataArrayTexture> {
  if (urls.length === 0) throw new Error('createLayerArray: keine Quellen.');

  const bitmaps = await Promise.all(urls.map(loadBitmap));
  const first = bitmaps[0]!;
  const { width, height } = first;

  for (const [index, bitmap] of bitmaps.entries()) {
    if (bitmap.width === width && bitmap.height === height) continue;
    for (const b of bitmaps) b.close();
    throw new Error(
      `createLayerArray (${options.label}): Ebene ${index} ist ` +
        `${bitmap.width}×${bitmap.height}, erwartet ${width}×${height}. ` +
        'Alle Ebenen einer Array-Textur müssen dieselbe Größe haben.',
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('createLayerArray: kein 2D-Kontext verfügbar.');

  const bytesPerLayer = width * height * 4;
  const data = new Uint8Array(bytesPerLayer * bitmaps.length);
  const rowBytes = width * 4;

  for (const [index, bitmap] of bitmaps.entries()) {
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    const base = index * bytesPerLayer;
    for (let row = 0; row < height; row++) {
      const source = (height - 1 - row) * rowBytes;
      data.set(pixels.subarray(source, source + rowBytes), base + row * rowBytes);
    }
    bitmap.close();
  }

  const texture = new DataArrayTexture(data, width, height, bitmaps.length);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  // sRGB wird über das interne Texturformat aufgelöst, nicht im Shader: three
  // wählt bei SRGBColorSpace SRGB8_ALPHA8, die Hardware dekodiert beim Abtasten.
  texture.colorSpace = options.srgb ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = options.anisotropy;
  texture.needsUpdate = true;
  texture.name = `TerrainArray:${options.label}`;
  return texture;
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Textur nicht ladbar: ${url} → ${response.status} ${response.statusText}`);
  }
  return createImageBitmap(await response.blob());
}
