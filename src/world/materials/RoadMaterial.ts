import {
  MeshStandardMaterial,
  type IUniform,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import {
  injectAtmosphere,
  type AtmosphereUniforms,
} from '@/render/atmosphere/atmosphereUniforms';

export interface RoadTextures {
  readonly albedo: Texture;
  readonly normal: Texture;
  readonly arm: Texture;
}

/**
 * Straßenbelag — PLAN.md P3 / 3.4.
 *
 * Dieselbe Bauweise wie Terrain und Wasser: `MeshStandardMaterial` plus
 * Injektion, kein eigener Shader. Die Straße braucht genau zwei Dinge über den
 * Standard hinaus — die gebackene Sonnenverschattung und den Höhennebel — und
 * beide liegen im gemeinsamen Atmosphären-Block.
 *
 * Die UVs kommen fertig aus dem Mesh: `u` quer über die volle Breite, `v` in
 * **Metern Bogenlänge** geteilt durch die Kachellänge. Dadurch ist die Kachelung
 * automatisch maßstabsgetreu und in Kurven genauso dicht wie auf Geraden — das
 * Akzeptanzkriterium „Textur-Tiling gleichmäßig" ist damit eine Eigenschaft der
 * Konstruktion und nicht etwas, das man hinterher nachregelt.
 */
export class RoadMaterial extends MeshStandardMaterial {
  readonly #atmosphere: AtmosphereUniforms;

  constructor(textures: RoadTextures, atmosphere: AtmosphereUniforms) {
    super({
      map: textures.albedo,
      normalMap: textures.normal,
      aoMap: textures.arm,
      roughnessMap: textures.arm,
      metalnessMap: textures.arm,
      roughness: 1,
      metalness: 0,
    });
    this.#atmosphere = atmosphere;
    this.name = 'RoadMaterial';
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoadWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvRoadWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vRoadWorld;\nvec2 gRoadShade;',
    );

    injectAtmosphere(
      shader as unknown as { fragmentShader: string; uniforms: Record<string, IUniform> },
      this.#atmosphere,
      'vRoadWorld',
    );

    shader.fragmentShader = shader.fragmentShader
      // Die Verschattung wird früh gelesen, damit sie sowohl auf das direkte
      // Licht als auch auf die Umgebungsverdeckung wirken kann.
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\ngRoadShade = atmoShade(vRoadWorld);',
      )
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n' +
          'reflectedLight.directDiffuse *= gRoadShade.x;\n' +
          'reflectedLight.directSpecular *= gRoadShade.x;',
      )
      .replace(
        '#include <aomap_fragment>',
        '#include <aomap_fragment>\n' +
          'reflectedLight.indirectDiffuse *= mix(1.0, gRoadShade.y, uAtmoSkyOcclusion.x);\n' +
          'reflectedLight.indirectSpecular *= mix(1.0, gRoadShade.y, uAtmoSkyOcclusion.y);',
      );
  }

  override customProgramCacheKey(): string {
    return 'japanmap:road';
  }
}
