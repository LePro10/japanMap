import {
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  MeshStandardMaterial,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  type WebGLProgramParametersWithUniforms,
} from 'three';

/**
 * Leitplanken-Material mit Löchern für zerbrochene Abschnitte.
 *
 * Das Band ist **eine** Geometrie über alle Strecken (zwei Draw-Calls mit den
 * Pfosten). Ein Mesh je Abschnitt wäre hunderte Aufrufe für ein Detail, das
 * im Budget von 800 keinen solchen Platz verdient. Deshalb bleiben Geometrie
 * und Instanzzahl stehen, und der Fragment-Shader verwirft die Pixel, deren
 * `aBreakId` in der Kennzeichnungstextur steht.
 *
 * 64² Texel = 4096 Abschnitte. Die Karte hat gemessen rund 1600
 * Plankenstücke — der Rest ist Luft, und ein Overflow würde still nichts
 * verwerfen statt irgendein anderes Stück zu löschen.
 */

const TEX = 64;
const CAP = TEX * TEX;

export class RailMaterial extends MeshStandardMaterial {
  readonly brokenMap: DataTexture;
  readonly #data: Uint8Array;

  constructor() {
    super({
      color: 0x9aa3a8,
      roughness: 0.55,
      metalness: 0.85,
      side: DoubleSide,
    });
    this.name = 'LeitplankenMaterial';
    const data = new Uint8Array(CAP * 4);
    this.#data = data;
    const map = new DataTexture(data, TEX, TEX, RGBAFormat, UnsignedByteType);
    map.magFilter = NearestFilter;
    map.minFilter = NearestFilter;
    map.wrapS = ClampToEdgeWrapping;
    map.wrapT = ClampToEdgeWrapping;
    map.needsUpdate = true;
    this.brokenMap = map;
  }

  override customProgramCacheKey(): string {
    return 'rail-break-v1';
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    shader.uniforms.uBroken = { value: this.brokenMap };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aBreakId;\nvarying float vBreakId;',
      )
      .replace('#include <begin_vertex>', 'vBreakId = aBreakId;\n#include <begin_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D uBroken;\nvarying float vBreakId;',
      )
      .replace(
        '#include <opaque_fragment>',
        [
          'int breakId = int(vBreakId + 0.5);',
          'if (breakId >= 0 && breakId < 4096) {',
          '  ivec2 tc = ivec2(breakId & 63, breakId >> 6);',
          '  if (texelFetch(uBroken, tc, 0).r > 0.5) discard;',
          '}',
          '#include <opaque_fragment>',
        ].join('\n'),
      );
  }

  /** Diesen Abschnitt unsichtbar machen. Idempotent. */
  breakId(id: number): void {
    if (id < 0 || id >= CAP) return;
    const data = this.#data;
    const i = id * 4;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
    this.brokenMap.needsUpdate = true;
  }

  /** Alle Löcher zurück — nach einem Neuaufbau des Netzes. */
  resetBroken(): void {
    this.#data.fill(0);
    this.brokenMap.needsUpdate = true;
  }

  override dispose(): void {
    this.brokenMap.dispose();
    super.dispose();
  }
}
