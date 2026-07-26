import {
  Color,
  FrontSide,
  MeshStandardMaterial,
  Vector3,
  Vector4,
  type IUniform,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import { WATER } from '@/config/water.config';
import {
  injectAtmosphere,
  type AtmosphereUniforms,
} from '@/render/atmosphere/atmosphereUniforms';

import waterPars from '../shaders/water_pars.frag.glsl';
import waterSurface from '../shaders/water_surface.frag.glsl';
import waterWorld from '../shaders/water_world.vert.glsl';
import { TERRAIN_HEIGHT_GLSL, type TerrainHeightUniforms } from './TerrainMaterial';

export interface WaterUniforms {
  readonly uWaterDeepColor: IUniform<Color>;
  readonly uWaterShallowColor: IUniform<Color>;
  readonly uWaterDepthFade: IUniform<number>;
  readonly uWaterRoughness: IUniform<number>;
  readonly uWaterEdgeFade: IUniform<number>;
  /** x = Tiefe, y = Breite, z = Stärke, w = Wellenanteil. */
  readonly uWaterFoam: IUniform<Vector4>;
  /** Je Lage: xy = Einheitsrichtung, z = Wellenzahl, w = Kreisfrequenz. */
  readonly uWaterWaves: IUniform<Vector4[]>;
  readonly uWaterSteepness: IUniform<Vector3>;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function createWaterUniforms(): WaterUniforms {
  const waves = WATER.waves.lengths.map((wavelength, index) => {
    // Azimut zählt von Norden (-Z) im Uhrzeigersinn — dieselbe Konvention wie
    // bei der Sonne, damit „118°" in beiden Fällen dieselbe Richtung meint.
    const azimuth = toRadians(WATER.waves.directions[index] ?? 0);
    const direction = { x: Math.sin(azimuth), y: -Math.cos(azimuth) };
    const waveNumber = (Math.PI * 2) / wavelength;
    // Kreisfrequenz aus der gewünschten Ausbreitungsgeschwindigkeit: ω = k·c.
    const omega = waveNumber * (WATER.waves.speeds[index] ?? 1);
    return new Vector4(direction.x, direction.y, waveNumber, omega);
  });

  const [a = 0, b = 0, c = 0] = WATER.waves.steepness;

  return {
    uWaterDeepColor: { value: new Color().setHex(WATER.deepColor, 'srgb') },
    uWaterShallowColor: { value: new Color().setHex(WATER.shallowColor, 'srgb') },
    uWaterDepthFade: { value: WATER.depthFade },
    uWaterRoughness: { value: WATER.roughness },
    uWaterEdgeFade: { value: WATER.edgeFade },
    uWaterFoam: {
      value: new Vector4(
        WATER.foam.depth,
        WATER.foam.width,
        WATER.foam.intensity,
        WATER.foam.waveInfluence,
      ),
    },
    uWaterWaves: { value: waves },
    uWaterSteepness: { value: new Vector3(a, b, c) },
  };
}

/**
 * Wasser als `MeshStandardMaterial` — PLAN.md P2 / 2.4.
 *
 * Kein eigener Shader, aus demselben Grund wie beim Terrain: die
 * Fresnel-gewichtete Spiegelung aus `scene.environment` ist genau das, was
 * Three.js' PBR-Kette ohnehin rechnet. Bei `metalness = 0` und niedriger
 * Rauheit ergibt sie den flachen, glänzenden Streifwinkel-Look, den Wasser bei
 * tief stehender Sonne hat — nachgebaut wäre er schlechter.
 */
export class WaterMaterial extends MeshStandardMaterial {
  readonly waterUniforms: WaterUniforms;
  readonly #height: TerrainHeightUniforms;
  readonly #atmosphere: AtmosphereUniforms;

  constructor(
    uniforms: WaterUniforms,
    height: TerrainHeightUniforms,
    atmosphere: AtmosphereUniforms,
  ) {
    super({
      color: 0xffffff,
      roughness: WATER.roughness,
      metalness: 0,
      // Transparent, aber ohne Tiefenschreiben: die Fläche ist konvex und
      // schneidet sich nie selbst, und mit depthWrite verdeckte sie alles, was
      // in P3/P6 auf ihr schwimmt.
      transparent: true,
      depthWrite: false,
      side: FrontSide,
    });
    this.waterUniforms = uniforms;
    this.#height = height;
    this.#atmosphere = atmosphere;
    this.name = 'WaterMaterial';
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    for (const block of [this.waterUniforms, this.#height]) {
      for (const [name, uniform] of Object.entries(block)) {
        shader.uniforms[name] = uniform as IUniform;
      }
    }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterWorld;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${waterWorld}`);

    // Die Heightmap-Abfrage läuft hier im **Fragment**-Shader: die Wassertiefe
    // wird pro Pixel gebraucht, nicht pro Vertex. Die Ebene hat zwei Dreiecke.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${TERRAIN_HEIGHT_GLSL}\n${waterPars}`,
    );

    injectAtmosphere(shader, this.#atmosphere, 'vWaterWorld');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', waterSurface)
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = gWaterRoughness;',
      )
      .replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n' +
          'nonPerturbedNormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);\n' +
          'normal = normalize((viewMatrix * vec4(gWaterNormal, 0.0)).xyz);',
      )
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n' +
          'reflectedLight.directDiffuse *= gWaterShade.x;\n' +
          'reflectedLight.directSpecular *= gWaterShade.x;',
      );
  }

  override customProgramCacheKey(): string {
    return 'japanmap:water';
  }
}
