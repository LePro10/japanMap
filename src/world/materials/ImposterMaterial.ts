import {
  MeshStandardMaterial,
  Vector2,
  type IUniform,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import { IMPOSTER } from '@/config/vegetation.config';
import {
  injectAtmosphere,
  type AtmosphereUniforms,
} from '@/render/atmosphere/atmosphereUniforms';
import type { VegetationUniforms } from './VegetationMaterial';

import octGlsl from '../shaders/imposter_oct.glsl';
import tintGlsl from '../shaders/vegetation_tint.glsl';
import translucencyGlsl from '../shaders/vegetation_translucency.glsl';
import windGlsl from '../shaders/vegetation_wind.vert.glsl';
import parsGlsl from '../shaders/imposter_pars.glsl';
import vertexGlsl from '../shaders/imposter.vert.glsl';
import fragmentGlsl from '../shaders/imposter.frag.glsl';
import type { ImposterAtlas } from '../scatter/ImposterAtlas';

/**
 * Imposter-Material — PLAN.md P4 / 4.4.
 *
 * Dieselbe Bauweise wie überall im Projekt: `MeshStandardMaterial` plus
 * Injektion, kein eigener PBR-Shader. Das ist hier nicht nur Gewohnheit — der
 * Imposter muss **genauso** beleuchtet werden wie das Mesh, aus dem er
 * hervorgegangen ist, sonst sieht man den Stufenwechsel an einem Helligkeits-
 * sprung statt an der Silhouette. Ein eigenes Material hieße, IBL, Nebel und
 * gebackene Verschattung ein zweites Mal nachzubauen und dann dauerhaft
 * gleichzuhalten.
 *
 * Was der Imposter über den Standard hinaus braucht:
 *
 *  - ein Quad, das sich zylindrisch zur Kamera dreht (Vertex-Einsatzstück),
 *  - die Wahl und Mischung der Atlas-Zelle (Fragment-Einsatzstück),
 *  - die gebackene Normale als **Weltnormale** statt der Quad-Normale. Ohne das
 *    wäre jeder Imposter eine flache Scheibe, und ein Wald aus flachen Scheiben
 *    ist bei streifendem Licht entweder ganz hell oder ganz dunkel.
 */
export class ImposterMaterial extends MeshStandardMaterial {
  /**
   * Die Freistellschwelle, öffentlich.
   *
   * Nicht privat, weil sie **kalibriert** werden muss und nicht geraten werden
   * kann: der Wert entscheidet über die Breite der Silhouette, und ob sie zum
   * Mesh passt, lässt sich nur messen (siehe `IMPOSTER.alphaTest`). Ein Regler
   * im Vegetations-Ordner hängt daran.
   */
  readonly alphaTestUniform: IUniform<number>;

  /**
   * Angemeldet für die Texturspeicher-Schätzung (siehe debug/textureMemory.ts).
   *
   * Die beiden Atlanten sind Render-Targets: sie stehen weder in einem
   * Material-Slot noch in `ResourceManager.tracked`, und ohne diese Anmeldung
   * fehlten 32 MB in der einzigen Zahl, an der das 512-MB-Budget aus SPEC §4
   * überhaupt geprüft wird.
   */
  readonly declaredTextures: readonly Texture[];

  readonly #atmosphere: AtmosphereUniforms;
  readonly #shared: VegetationUniforms;
  readonly #amplitude: IUniform<number>;
  readonly #uniforms: Record<string, IUniform>;

  constructor(
    atlas: ImposterAtlas,
    atmosphere: AtmosphereUniforms,
    shared: VegetationUniforms,
    color: number,
    windAmplitude: number,
  ) {
    super({
      color,
      roughness: 0.9,
      metalness: 0,
      // Die Freistellung passiert über `discard` im Fragment-Shader, nicht über
      // `transparent`. Ein transparentes Material würde sortiert, ohne
      // Tiefenschreiben gezeichnet und wäre bei tausenden Bäumen hinter- und
      // durcheinander — Imposter sind undurchsichtige Bäume mit Löchern, nicht
      // durchscheinende Flächen.
      transparent: false,
    });
    this.#atmosphere = atmosphere;
    this.#shared = shared;
    // Dieselbe Amplitude wie das Mesh derselben Art — sonst wechselte ein Baum
    // beim Stufensprung seine Ausschlagweite.
    this.#amplitude = { value: windAmplitude };
    this.name = 'ImposterMaterial';
    this.alphaTestUniform = { value: IMPOSTER.alphaTest };
    this.declaredTextures = [atlas.albedo, atlas.normal];
    this.#uniforms = {
      uImposterAlbedo: { value: atlas.albedo as Texture },
      uImposterNormal: { value: atlas.normal as Texture },
      uImposterTiles: { value: IMPOSTER.tiles },
      uImposterAtlasPixels: { value: IMPOSTER.tiles * IMPOSTER.tileSize },
      uImposterAlphaTest: this.alphaTestUniform,
      uImposterSize: {
        value: new Vector2(atlas.frameHalf * 2, atlas.height / 2 - atlas.frameHalf),
      },
    };
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    for (const [name, uniform] of Object.entries(this.#uniforms)) {
      shader.uniforms[name] = uniform;
    }

    for (const [name, uniform] of Object.entries(this.#shared)) {
      shader.uniforms[name] = uniform;
    }

    const pars = `${octGlsl}\n${tintGlsl}\n${parsGlsl}`;

    shader.uniforms['uWindAmplitude'] = this.#amplitude;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${pars}\n${windGlsl}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexGlsl}`);

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${pars}\n${translucencyGlsl}\nuniform float uVegTranslucency;`,
    );

    injectAtmosphere(
      shader as unknown as { fragmentShader: string; uniforms: Record<string, IUniform> },
      this.#atmosphere,
      'vImposterWorld',
    );

    shader.fragmentShader = shader.fragmentShader
      // Ersetzt, nicht ergänzt: die Farbe kommt vollständig aus dem Atlas.
      .replace('#include <map_fragment>', fragmentGlsl)
      // Die Normale aus dem Atlas überschreibt die des Quads. `viewMatrix`
      // bringt sie in den Raum, in dem three ab hier weiterrechnet — dieselbe
      // Stelle und derselbe Grund wie im TerrainMaterial.
      .replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n' +
          'nonPerturbedNormal = normalize((viewMatrix * vec4(gImposterNormal, 0.0)).xyz);\n' +
          'normal = nonPerturbedNormal;',
      )
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n' +
          'vec2 impShade = atmoShade(vImposterWorld);\n' +
          'reflectedLight.directDiffuse *= impShade.x;\n' +
          'reflectedLight.directSpecular *= impShade.x;\n' +
          // Dasselbe Streulicht wie beim Mesh, aus derselben Datei und mit
          // demselben Uniform. Getrennt gerechnet wäre der Stufenwechsel im
          // Gegenlicht ein Helligkeitssprung — dort, wo er am meisten auffällt.
          '#if ( NUM_DIR_LIGHTS > 0 )\n' +
          'reflectedLight.directDiffuse += vegetationTranslucency(\n' +
          '    diffuseColor.rgb, normal, normalize(vViewPosition),\n' +
          '    directionalLights[0].direction, directionalLights[0].color,\n' +
          '    uVegTranslucency, impShade.x);\n' +
          '#endif',
      );
  }

  override customProgramCacheKey(): string {
    return 'japanmap:imposter';
  }
}
