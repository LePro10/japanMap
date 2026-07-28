import {
  MeshStandardMaterial,
  type IUniform,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import {
  injectAtmosphere,
  type AtmosphereUniforms,
} from '@/render/atmosphere/atmosphereUniforms';

/**
 * Material aller Props — PLAN.md P5 / 5.3.
 *
 * Wie überall im Projekt: `MeshStandardMaterial` plus Injektion, kein eigener
 * PBR-Shader. Dazu kommt genau eine Sache, und die ist nicht verhandelbar: die
 * **gebackene Sonnenverschattung** aus P2. Ohne sie stünde ein Tempel im
 * Kernschatten des Massivs voll beleuchtet da — bei 2,23° Sonnenstand reicht
 * dieser Schatten über die halbe Karte, und ein leuchtendes Gebäude darin wäre
 * der auffälligste Fehler im ganzen Bild.
 *
 * > **Die Farbe kommt aus den Vertexfarben, nicht aus dem Material.** Ein Torii
 * > besteht aus Zinnober und Stein, ein Bauernhaus aus Putz, Holz und Reet.
 * > Getrennte Materialien hießen ein `InstancedMesh` je Farbe und Landmark-Art
 * > — bei zwölf Arten mit je zwei bis vier Farben also 30 statt 12 Draw-Calls,
 * > für ein Bild, das identisch aussieht.
 * >
 * > Der Preis steht in derselben Zeile: **Rauheit und Metallizität sind für
 * > alle Props gleich.** Die Palette führt zwar beide Werte je Eintrag, aber
 * > eine Vertexfarbe hat nur drei Kanäle. Betroffen ist praktisch nur `steel`
 * > (Metallizität 0,85) — und das sind die Ausleger der Strommasten und der
 * > Laternenraum des Leuchtturms, zusammen ein paar Dutzend Dreiecke. Der
 * > Ausweg wäre ein zweites Attribut mit (Rauheit, Metallizität) je Vertex;
 * > er ist billig und steht bereit, falls je ein Prop davon lebt.
 */
export class PropMaterial extends MeshStandardMaterial {
  readonly #atmosphere: AtmosphereUniforms;

  constructor(atmosphere: AtmosphereUniforms) {
    super({
      // Weiß, damit die Vertexfarbe unverändert durchkommt: three multipliziert
      // beide.
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0,
      // **Flach schattiert**, wie die Vegetation. Die Formen sind aus Quadern
      // und Zylindern gebaut; geglättete Normalen machten aus einer Dachkante
      // einen Farbverlauf und aus dem ganzen Bau einen Ballon.
      flatShading: true,
    });
    this.#atmosphere = atmosphere;
    this.name = 'PropMaterial';
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPropWorld;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n' +
          'vPropWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;',
      );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vPropWorld;\nvec2 gPropShade;',
    );

    injectAtmosphere(
      shader as unknown as { fragmentShader: string; uniforms: Record<string, IUniform> },
      this.#atmosphere,
      'vPropWorld',
    );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\ngPropShade = atmoShade(vPropWorld);')
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n' +
          'reflectedLight.directDiffuse *= gPropShade.x;\n' +
          'reflectedLight.directSpecular *= gPropShade.x;',
      )
      .replace(
        '#include <aomap_fragment>',
        '#include <aomap_fragment>\n' +
          'reflectedLight.indirectDiffuse *= mix(1.0, gPropShade.y, uAtmoSkyOcclusion.x);',
      );
  }

  override customProgramCacheKey(): string {
    return 'japanmap:prop';
  }
}
