/** Decode the build-time JH16 predictor without changing any 16-bit terrain sample. */
export async function decodeHeightmap(buffer: ArrayBuffer, resolution: number): Promise<Uint16Array<ArrayBuffer>> {
  if (buffer.byteLength < 12) throw new Error('Invalid heightmap header');
  const header = new DataView(buffer);
  if (header.getUint32(0) !== 0x4a483136) throw new Error('Invalid heightmap header');
  if (!Number.isInteger(resolution) || resolution < 2 || resolution > 8192 || header.getUint32(4, true) !== resolution)
    throw new Error('Invalid heightmap resolution');

  const stream = new Blob([new Uint8Array(buffer, 12)]).stream().pipeThrough(new DecompressionStream('deflate'));
  const residuals = new Uint8Array(await new Response(stream).arrayBuffer());
  const count = resolution * resolution;
  if (residuals.length !== count * 2) throw new Error('Invalid heightmap payload length');
  const raw = new Uint16Array(count);
  let checksum = 2166136261;
  for (let i = 0; i < count; i++) {
    const x = i % resolution, hasRow = i >= resolution;
    const left = x ? raw[i - 1]! : 0;
    const up = hasRow ? raw[i - resolution]! : 0;
    const corner = x && hasRow ? raw[i - resolution - 1]! : 0;
    const value = (residuals[i]! + (residuals[count + i]! << 8) + left + up - corner) & 65535;
    raw[i] = value;
    checksum = Math.imul(checksum ^ value, 16777619);
  }
  if ((checksum >>> 0) !== header.getUint32(8, true)) throw new Error('Heightmap checksum mismatch');
  return raw;
}
