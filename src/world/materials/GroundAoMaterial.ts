import {
  CustomBlending,
  ShaderMaterial,
  SrcColorFactor,
  Vector2,
  ZeroFactor,
  type IUniform,
} from 'three';

import { GROUND_AO, VEGETATION_LOOK } from '@/config/vegetation.config';
import {
  TERRAIN_HEIGHT_GLSL,
  type TerrainHeightUniforms,
} from './TerrainMaterial';

import vertexGlsl from '../shaders/ground_ao.vert.glsl';
import fragmentGlsl from '../shaders/ground_ao.frag.glsl';

/**
 * Bodenverdeckung unter der Vegetation — offener Punkt aus P4.
 *
 * > **Hier steht ausnahmsweise ein eigener `ShaderMaterial`.** Die Regel des
 * > Projekts lautet `MeshStandardMaterial` plus `onBeforeCompile`, und sie hat
 * > einen Grund: ein beleuchtetes Material soll IBL, Nebel und Tonemapping
 * > nicht ein zweites Mal nachbauen müssen. Dieser Fleck wird aber **gar nicht
 * > beleuchtet** — er ist ein Multiplikator auf das fertige Bild. Von der
 * > gesamten Standard-Kette bliebe kein einziger Chunk übrig; sie mitzuführen
 * > hieße, Dutzende Uniforms hochzuladen, die nichts tun.
 *
 * Gemischt wird mit `Zero / SrcColor`, also `Ziel = Ziel · Quelle`. Ein
 * gewöhnliches Alpha-Blending mit schwarzer Farbe täte fast dasselbe und wäre
 * an einer Stelle falsch: überlappende Flecken addierten dann ihre Deckung
 * statt sie zu multiplizieren, und drei Bäume nebeneinander schwärzten den
 * Boden komplett.
 */
export class GroundAoMaterial extends ShaderMaterial {
  readonly floorUniform: IUniform<number>;
  readonly strengthUniform: IUniform<number>;

  constructor(height: TerrainHeightUniforms) {
    super({
      // Der Höhen-Block bringt seine eigenen Uniforms mit; sie werden als
      // dieselben **Objekte** eingehängt wie im Terrain, damit der Höhen-Regler
      // aus dem Debug-Panel den Fleck mitzieht statt ihn im Boden zu lassen.
      uniforms: {
        ...height,
        uAoFloor: { value: GROUND_AO.floor },
        uAoCore: { value: GROUND_AO.core },
        uAoStrength: { value: VEGETATION_LOOK.groundAo },
        uAoFade: { value: new Vector2(GROUND_AO.fade[0], GROUND_AO.fade[1]) },
        uAoLift: { value: GROUND_AO.lift },
      },
      vertexShader: `${TERRAIN_HEIGHT_GLSL}\n${vertexGlsl}`,
      fragmentShader: fragmentGlsl,
      blending: CustomBlending,
      blendSrc: ZeroFactor,
      blendDst: SrcColorFactor,
      // `transparent` sortiert den Fleck in den Durchgang **nach** dem
      // undurchsichtigen Gelände ein — ohne das läge er in der Zeichenreihenfolge
      // vor der Fläche, die er verdunkeln soll.
      transparent: true,
      // Kein Tiefenschreiben: der Fleck ist keine Oberfläche. Der Tiefen*test*
      // bleibt an, damit ein Stamm zwischen Kamera und Fleck ihn verdeckt.
      depthWrite: false,
      // Gegen das Z-Fighting mit dem gemorphten Terrain-Gitter, zusätzlich zu
      // `GROUND_AO.lift`. **Nicht isoliert geprüft**, ob beides nötig ist —
      // gemessen wurde nur, dass die Kombination sauber bleibt (siehe
      // PLAN.md, „Bodenverdeckung").
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.name = 'GroundAoMaterial';
    this.floorUniform = this.uniforms['uAoFloor'] as IUniform<number>;
    this.strengthUniform = this.uniforms['uAoStrength'] as IUniform<number>;
  }
}
