import {
  AlphaFormat,
  ByteType,
  CompressedTexture,
  CubeTexture,
  Data3DTexture,
  DataArrayTexture,
  DepthFormat,
  DepthStencilFormat,
  FloatType,
  HalfFloatType,
  IntType,
  Material,
  Mesh,
  RGFormat,
  RGIntegerFormat,
  RGBAFormat,
  RGBAIntegerFormat,
  RedFormat,
  RedIntegerFormat,
  ShaderMaterial,
  ShortType,
  Texture,
  UnsignedByteType,
  UnsignedInt248Type,
  UnsignedIntType,
  UnsignedShort4444Type,
  UnsignedShort5551Type,
  UnsignedShortType,
  type Object3D,
  type Scene,
} from 'three';

/**
 * Schätzt den belegten Texturspeicher.
 *
 * Warum geschätzt: three.js zählt in `renderer.info.memory.textures` nur die
 * *Anzahl* hochgeladener Texturen, nicht ihre Größe. Für das Budget aus SPEC §4
 * (< 512 MB) ist die Anzahl aber wertlos — eine 4k-HDRI und eine 64er-Maske
 * zählen gleich. Also rechnen wir selbst.
 *
 * Nicht erfasst: Render-Targets, die kein System angemeldet hat, und der
 * interne Overhead des Treibers. Das Overlay weist die Zahl deshalb als
 * Schätzung aus, statt eine Genauigkeit vorzutäuschen, die sie nicht hat.
 */

const COMPONENTS_BY_FORMAT = new Map<number, number>([
  [AlphaFormat, 1],
  [RedFormat, 1],
  [RedIntegerFormat, 1],
  [DepthFormat, 1],
  [RGFormat, 2],
  [RGIntegerFormat, 2],
  [DepthStencilFormat, 2],
  [RGBAFormat, 4],
  [RGBAIntegerFormat, 4],
]);

const BYTES_BY_TYPE = new Map<number, number>([
  [UnsignedByteType, 1],
  [ByteType, 1],
  [ShortType, 2],
  [UnsignedShortType, 2],
  [UnsignedShort4444Type, 2],
  [UnsignedShort5551Type, 2],
  [HalfFloatType, 2],
  [IntType, 4],
  [UnsignedIntType, 4],
  [UnsignedInt248Type, 4],
  [FloatType, 4],
]);

/** Eine volle Mipmap-Kette kostet ein Drittel zusätzlich (1 + 1/4 + 1/16 + …). */
const MIPMAP_FACTOR = 4 / 3;

interface ImageLike {
  width?: number;
  height?: number;
  depth?: number;
}

function imageSize(texture: Texture): { width: number; height: number; depth: number } {
  const image = texture.image as ImageLike | ImageLike[] | null | undefined;
  const first = Array.isArray(image) ? image[0] : image;
  return {
    width: first?.width ?? 0,
    height: first?.height ?? 0,
    depth: first?.depth ?? 1,
  };
}

export function estimateTextureBytes(texture: Texture): number {
  // Komprimierte Texturen (KTX2/Basis) liefern ihre Rohdaten mit — die Größe
  // steht exakt in den Mipmap-Puffern, da muss nichts geschätzt werden.
  if (texture instanceof CompressedTexture) {
    let bytes = 0;
    for (const mip of texture.mipmaps ?? []) {
      const data = (mip as { data?: ArrayBufferView }).data;
      if (data) bytes += data.byteLength;
    }
    return bytes;
  }

  const { width, height, depth } = imageSize(texture);
  if (width === 0 || height === 0) return 0;

  const components = COMPONENTS_BY_FORMAT.get(texture.format) ?? 4;
  const bytesPerComponent = BYTES_BY_TYPE.get(texture.type) ?? 1;

  let layers = depth;
  if (texture instanceof CubeTexture) layers = 6;
  else if (texture instanceof DataArrayTexture || texture instanceof Data3DTexture) {
    layers = Math.max(1, depth);
  }

  const base = width * height * layers * components * bytesPerComponent;
  return texture.generateMipmaps ? base * MIPMAP_FACTOR : base;
}

function collectFromMaterial(material: Material, out: Set<Texture>): void {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) out.add(value);
  }
  if (material instanceof ShaderMaterial) {
    for (const uniform of Object.values(material.uniforms)) {
      const value: unknown = uniform?.value;
      if (value instanceof Texture) out.add(value);
    }
  }
}

function collectFromObject(object: Object3D, out: Set<Texture>): void {
  if (!(object instanceof Mesh)) return;
  const material: unknown = object.material;
  if (Array.isArray(material)) {
    for (const entry of material) {
      if (entry instanceof Material) collectFromMaterial(entry, out);
    }
  } else if (material instanceof Material) {
    collectFromMaterial(material, out);
  }
}

/**
 * Sammelt alle erreichbaren Texturen und summiert ihre geschätzte Größe.
 *
 * @param extra zusätzliche Kandidaten, üblicherweise ResourceManager.tracked —
 *              damit auch geladene, aber noch nicht eingehängte Texturen zählen.
 */
export function estimateTextureMemory(scene: Scene, extra: Iterable<unknown> = []): number {
  const textures = new Set<Texture>();

  if (scene.background instanceof Texture) textures.add(scene.background);
  if (scene.environment instanceof Texture) textures.add(scene.environment);
  scene.traverse((object) => {
    collectFromObject(object, textures);
  });

  for (const candidate of extra) {
    if (candidate instanceof Texture) textures.add(candidate);
  }

  let bytes = 0;
  for (const texture of textures) bytes += estimateTextureBytes(texture);
  return bytes;
}
