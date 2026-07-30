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

/**
 * Material der Straßendecals — PLAN.md P6 / 6.6.
 *
 * `MeshStandardMaterial`, weil eine Fahrbahnmarkierung beleuchtet wird wie
 * alles andere: sie ist Farbe auf Asphalt, keine Lichtquelle. Was dazukommt,
 * sind zwei Instanz-Attribute — das Feld im Atlas und die Tönung.
 *
 * > **`polygonOffset` statt Höhenversatz.** Die Decals liegen praktisch in der
 * > Fahrbahnfläche; ohne Eingriff entschiede die Tiefenpuffer-Genauigkeit je
 * > Pixel, wer gewinnt, und das Ergebnis flimmert beim Fahren. Sie
 * > anzuheben wäre die naheliegende Antwort und hier die falsche: bei 2,23°
 * > Sonnenstand wirft ein 2 cm hoher Rand einen halben Meter Schatten. Der
 * > Offset verschiebt nur den Tiefenwert.
 *
 * `depthWrite: false`, weil ein Decal nichts verdecken soll — es liegt auf der
 * Fahrbahn und hat hinter sich nichts, was es ausschneiden dürfte.
 */
export class DecalMaterial extends MeshStandardMaterial {
  readonly #atmosphere: AtmosphereUniforms;

  constructor(atlas: Texture, atmosphere: AtmosphereUniforms) {
    super({
      map: atlas,
      transparent: true,
      // Sehr niedrig: die weichen Kanten der Markierung sollen bleiben, nur die
      // vollständig leeren Bereiche des Atlas sollen weg.
      alphaTest: 0.02,
      depthWrite: false,
      roughness: 0.62,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.#atmosphere = atmosphere;
    this.name = 'DecalMaterial';
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\n' +
          'attribute vec4 aDecalRect;\n' +
          'attribute vec3 aDecalTint;\n' +
          'varying vec3 vDecalWorld;\n' +
          'varying vec3 vDecalTint;\n' +
          'varying vec2 vDecalUv;',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n' +
          'vDecalWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n' +
          'vDecalTint = aDecalTint;\n' +
          'vDecalUv = aDecalRect.xy + uv * aDecalRect.zw;',
      );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\n' +
        'varying vec3 vDecalWorld;\n' +
        'varying vec3 vDecalTint;\n' +
        'varying vec2 vDecalUv;\n' +
        'vec2 gDecalShade;',
    );

    injectAtmosphere(
      shader as unknown as { fragmentShader: string; uniforms: Record<string, IUniform> },
      this.#atmosphere,
      'vDecalWorld',
    );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        'vec4 decalTexel = texture2D(map, vDecalUv);\n' +
          'diffuseColor.rgb *= decalTexel.rgb * vDecalTint;\n' +
          'diffuseColor.a *= decalTexel.a;\n' +
          'gDecalShade = atmoShade(vDecalWorld);',
      )
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n' +
          'reflectedLight.directDiffuse *= gDecalShade.x;\n' +
          'reflectedLight.directSpecular *= gDecalShade.x;',
      )
      .replace(
        '#include <aomap_fragment>',
        '#include <aomap_fragment>\n' +
          'reflectedLight.indirectDiffuse *= mix(1.0, gDecalShade.y, uAtmoSkyOcclusion.x);\n' +
          'reflectedLight.indirectSpecular *= mix(1.0, gDecalShade.y, uAtmoSkyOcclusion.y);',
      );
  }

  override customProgramCacheKey(): string {
    return 'japanmap:decal';
  }
}
