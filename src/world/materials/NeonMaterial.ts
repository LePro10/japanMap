import {
  MeshBasicMaterial,
  DoubleSide,
  type IUniform,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import {
  injectAtmosphere,
  type AtmosphereUniforms,
} from '@/render/atmosphere/atmosphereUniforms';
import type { CityUniforms } from './FacadeMaterial';

/**
 * Neonschilder — PLAN.md P6 / 6.3.
 *
 * > **`MeshBasicMaterial`, nicht `MeshStandardMaterial`.** Das ist die einzige
 * > Stelle im Projekt, an der ein Material *nicht* beleuchtet wird, und sie ist
 * > es zu Recht: ein Neonschild ist eine Lichtquelle. Es hat keine Albedo, die
 * > man beleuchten könnte, keine Rauheit und keine Normale, die etwas
 * > spiegelte. Durch die Standard-Kette gejagt bekäme es Umgebungslicht auf
 * > seine Leuchtfläche addiert — bei blauer Stunde ein sichtbarer, blauer
 * > Schleier auf jedem roten Schild.
 *
 * Der Höhennebel gilt trotzdem: ein Schild in 900 m Entfernung muss ausbleichen
 * wie alles andere, sonst schwebt die Stadt in ihrer eigenen Atmosphäre. Deshalb
 * läuft auch dieses Material durch `injectAtmosphere`.
 *
 * Drei Instanz-Attribute tragen alles Übrige:
 *
 *  - `aNeonRect` — das Feld im Atlas als (u, v, du, dv).
 *  - `aNeonTint` — die Farbe. Nicht `instanceColor`, weil die auf 1 begrenzt
 *    ist und Neon über 1 gehen muss, um zu blühen.
 *  - `aNeonFlicker` — (Phase, Art). Art 0 steht ruhig, Art 1 flackert.
 */
export class NeonMaterial extends MeshBasicMaterial {
  readonly #atmosphere: AtmosphereUniforms;
  readonly #city: CityUniforms;

  constructor(atlas: Texture, atmosphere: AtmosphereUniforms, city: CityUniforms) {
    super({
      map: atlas,
      transparent: true,
      // Der Atlas ist außerhalb der Zellen leer. Ohne Alpha-Test schriebe jedes
      // Schild ein volles Rechteck in den Tiefenpuffer und schnitte die
      // dahinterliegende Fassade aus.
      alphaTest: 0.04,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: true,
    });
    this.#atmosphere = atmosphere;
    this.#city = city;
    this.name = 'NeonMaterial';
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    shader.uniforms.uCityTime = this.#city.uCityTime;
    shader.uniforms.uNeonEmissive = this.#city.uNeonEmissive;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\n' +
          'attribute vec4 aNeonRect;\n' +
          'attribute vec3 aNeonTint;\n' +
          'attribute vec2 aNeonFlicker;\n' +
          'varying vec3 vNeonWorld;\n' +
          'varying vec3 vNeonTint;\n' +
          'varying vec2 vNeonFlicker;\n' +
          'varying vec2 vNeonUv;',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n' +
          'vNeonWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n' +
          'vNeonTint = aNeonTint;\n' +
          'vNeonFlicker = aNeonFlicker;\n' +
          'vNeonUv = aNeonRect.xy + uv * aNeonRect.zw;',
      );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\n' +
        'uniform float uCityTime;\n' +
        'uniform float uNeonEmissive;\n' +
        'varying vec3 vNeonWorld;\n' +
        'varying vec3 vNeonTint;\n' +
        'varying vec2 vNeonFlicker;\n' +
        'varying vec2 vNeonUv;',
    );

    injectAtmosphere(
      shader as unknown as { fragmentShader: string; uniforms: Record<string, IUniform> },
      this.#atmosphere,
      'vNeonWorld',
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      // Die Atlas-Koordinate kommt aus dem Instanz-Attribut, nicht aus `vMapUv`.
      // Ein zweites Feld im Atlas wäre sonst ein zweites Mesh.
      'vec4 neonTexel = texture2D(map, vNeonUv);\n' +
        'diffuseColor *= neonTexel;\n' +
        // Flackern: eine Leuchtstoffröhre, die zündet — Stufen, keine Sinuskurve.
        // Ein weiches Auf und Ab sieht nach Atmung aus, nicht nach defektem
        // Vorschaltgerät.
        'float neonStep = floor(uCityTime * 9.0 + vNeonFlicker.x * 37.0);\n' +
        'float neonRoll = fract(sin(neonStep * 12.9898 + vNeonFlicker.x * 78.233) * 43758.5453);\n' +
        'float neonOn = mix(1.0, step(0.28, neonRoll) * (0.72 + 0.28 * neonRoll), vNeonFlicker.y);\n' +
        'diffuseColor.rgb *= vNeonTint * uNeonEmissive * neonOn;',
    );
  }

  override customProgramCacheKey(): string {
    return 'japanmap:neon';
  }
}
