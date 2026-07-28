import {
  Color,
  DoubleSide,
  MeshStandardMaterial,
  Vector2,
  type IUniform,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import {
  injectAtmosphere,
  type AtmosphereUniforms,
} from '@/render/atmosphere/atmosphereUniforms';

import tintGlsl from '../shaders/vegetation_tint.glsl';
import windGlsl from '../shaders/vegetation_wind.vert.glsl';

export interface WindUniforms {
  readonly uWindDirection: IUniform<Vector2>;
  readonly uWindStrength: IUniform<number>;
  readonly uWindTime: IUniform<number>;
}

/**
 * Ein Wind-Block für alle Vegetation.
 *
 * PLAN.md 4.5 verlangt „ein globaler Wind-Uniform für alle Vegetation, damit die
 * Bewegung kohärent wirkt" — und das ist keine Sparmaßnahme, sondern der ganze
 * Punkt: zwei Materialien mit eigener Zeitbasis ergeben zwei Winde, und die
 * Bäume auf demselben Hang wiegen sich gegeneinander.
 */
export function createWindUniforms(): WindUniforms {
  return {
    // Aus Nordwest, also grob aus Richtung des Massivs. Keine Messung, eine
    // Entscheidung: der Wind läuft damit auf die Kamera zu, wenn man von der
    // Küste ins Land schaut, und die Böen wandern durchs Bild statt quer.
    uWindDirection: { value: new Vector2(0.78, 0.63).normalize() },
    uWindStrength: { value: 1 },
    uWindTime: { value: 0 },
  };
}

/**
 * Vegetations-Material — PLAN.md P4 / 4.3, 4.5.
 *
 * Wie Terrain, Wasser und Straße: `MeshStandardMaterial` plus Injektion. Drei
 * Dinge kommen über den Standard hinaus dazu.
 *
 *  1. **Wind** im Vertex-Shader, siehe `vegetation_wind.vert.glsl`.
 *  2. **Gebackene Sonnenverschattung** aus dem Atmosphären-Block. Ohne sie stünde
 *     ein Wald im Schatten des Massivs voll beleuchtet da — bei 2,2° Sonnenstand
 *     reicht dieser Schatten über die halbe Karte.
 *  3. **Farbwurf je Instanz**, gerechnet statt übertragen. Ein `instanceColor`
 *     wäre ein zweites Attribut, das bei jedem Umsortieren der Instanzen
 *     mitkopiert werden müsste — bei 60 000 Instanzen und einem Umbau alle vier
 *     Frames ist das messbar. Der Farbton kommt deshalb aus einem Hash der
 *     Instanzposition: kostet drei Rechenschritte, ist ortsfest und braucht
 *     keinen Speicher.
 *
 * **Zweiseitig**, und zwar für alles: Gras hat keine sinnvolle Rückseite, und
 * für Bäume ein zweites Material anzulegen hieße ein zweites Programm für
 * denselben Look. Draw-Calls kostet es nicht — die Zahl hängt an den
 * `InstancedMesh`-Objekten, nicht an den Materialien.
 */
export class VegetationMaterial extends MeshStandardMaterial {
  readonly #atmosphere: AtmosphereUniforms;
  readonly #wind: WindUniforms;

  readonly #amplitude: IUniform<number>;

  constructor(
    atmosphere: AtmosphereUniforms,
    wind: WindUniforms,
    base: number,
    windAmplitude: number,
  ) {
    super({
      color: new Color().setHex(base, 'srgb'),
      roughness: 0.85,
      metalness: 0,
      side: DoubleSide,
      // Ohne das wirkt Laub bei streifendem Licht wie lackiertes Blech: die
      // Rückseiten stehen im Gegenlicht komplett schwarz. `flatShading` ist
      // hier zusätzlich Absicht und nicht Sparsamkeit — die Formen sind
      // low-poly, und geglättete Normalen auf einem Ikosaeder sehen aus wie ein
      // Ballon.
      flatShading: true,
    });
    this.#atmosphere = atmosphere;
    this.#wind = wind;
    this.#amplitude = { value: windAmplitude };
    this.name = 'VegetationMaterial';
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    for (const [name, uniform] of Object.entries(this.#wind)) {
      shader.uniforms[name] = uniform as IUniform;
    }
    shader.uniforms['uWindAmplitude'] = this.#amplitude;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${tintGlsl}\n${windGlsl}\n` +
          'varying vec3 vVegWorld;\nvarying float vVegTint;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
          // Der Instanzursprung ist die vierte Spalte der Instanzmatrix — die
          // Position des Modells, unabhängig davon, wo im Modell dieser Vertex
          // sitzt. Genau das braucht der Wind für seine Phase.
          'vec3 vegOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;\n' +
          'transformed = vegetationWind(transformed, vegOrigin);\n' +
          'vVegWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n' +
          'vVegTint = vegetationTintHash(vegOrigin.xz);',
      );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${tintGlsl}\n` +
        'varying vec3 vVegWorld;\nvarying float vVegTint;\nvec2 gVegShade;',
    );

    injectAtmosphere(
      shader as unknown as { fragmentShader: string; uniforms: Record<string, IUniform> },
      this.#atmosphere,
      'vVegWorld',
    );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n' +
          'gVegShade = atmoShade(vVegWorld);\n' +
          'diffuseColor.rgb *= vegetationTint(vVegTint);',
      )
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n' +
          'reflectedLight.directDiffuse *= gVegShade.x;\n' +
          'reflectedLight.directSpecular *= gVegShade.x;',
      )
      .replace(
        '#include <aomap_fragment>',
        '#include <aomap_fragment>\n' +
          'reflectedLight.indirectDiffuse *= mix(1.0, gVegShade.y, uAtmoSkyOcclusion.x);',
      );
  }

  override customProgramCacheKey(): string {
    return 'japanmap:vegetation';
  }
}
