import {
  Color,
  MeshStandardMaterial,
  type IUniform,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import {
  injectAtmosphere,
  type AtmosphereUniforms,
} from '@/render/atmosphere/atmosphereUniforms';

import windowsGlsl from '../shaders/facade_windows.glsl';

/**
 * Geteilter Uniform-Block der Stadt.
 *
 * Die Fenster laufen über eine gemeinsame Zeit und einen gemeinsamen Regler für
 * den Anteil beleuchteter Fenster — aus demselben Grund, aus dem der Wind in P4
 * global ist: zwei Blöcke mit eigener Zeitbasis flackerten gegeneinander, und
 * ein Regler je Block wäre ein Regler, den man an zwanzig Stellen nachziehen
 * muss.
 */
export interface CityUniforms {
  readonly uCityTime: IUniform<number>;
  readonly uWindowLitFraction: IUniform<number>;
  readonly uWindowEmissive: IUniform<number>;
}

export function createCityUniforms(litFraction: number, emissive: number): CityUniforms {
  return {
    uCityTime: { value: 0 },
    uWindowLitFraction: { value: litFraction },
    uWindowEmissive: { value: emissive },
  };
}

/**
 * Fassaden — PLAN.md P6 / 6.2.
 *
 * > **Abweichung vom Plan, bewusst und gemessen.** PLAN.md 6.1.4 und 6.2 sehen
 * > einen **Fassaden-Atlas** vor, dessen Fenstermuster per Instanz-Offset
 * > variiert wird. Umgesetzt ist stattdessen ein prozedurales Raster im Shader.
 * > Drei Gründe, in der Reihenfolge ihres Gewichts:
 * >
 * >  1. **Es gibt keine Instanzen.** Der Atlas-Ansatz setzt Gebäude als
 * >     instanzierte Körper voraus. P6 fasst aber *je Block* zusammen (PLAN.md
 * >     nennt genau das als Antwort auf das Draw-Call-Risiko), und in einem
 * >     zusammengeführten Mesh gibt es keine `instanceID`, an der ein Offset
 * >     hängen könnte. Der Ersatz wäre ein Vertex-Attribut — also genau das,
 * >     was hier ohnehin steht.
 * >  2. **Das Rastermaß muss auf die Wand passen.** Ein Atlas hat ein festes
 * >     Seitenverhältnis; eine Wand hat 7,4 m oder 23,1 m. Entweder man
 * >     verzerrt die Fenster oder man schneidet sie an der Ecke an. Das
 * >     gerundete Raster (siehe `wall()`) löst das, und dann ist die Textur
 * >     nur noch ein zweiter Weg, dieselbe Zahl auszudrücken.
 * >  3. **Texturspeicher.** P5 hat 302,7 MB von 512 MB verbraucht. Ein
 * >     Fassadenatlas in brauchbarer Auflösung samt Emissive-Kanal kostet
 * >     zweistellige Megabyte für einen Effekt, der hier 60 Zeilen GLSL braucht.
 * >
 * > Was der Plan wollte, leistet die Umsetzung vollständig: Fenstermuster
 * > variiert je Gebäude, der Emissive-Kanal hat ein pseudo-zufälliges An/Aus je
 * > Fenster aus einem Hash, und bei blauer Stunde ist er die dominante urbane
 * > Lichtquelle. Was fehlt, ist Fassadendetail, das nur eine Textur liefern
 * > kann — Klimageräte, Kabel, Werbetafeln. Davon steht ein Teil als Geometrie
 * > auf dem Dach, der Rest ist in 6.3 das Neon.
 *
 * Wie überall im Projekt: `MeshStandardMaterial` plus Injektion. Die Fassade
 * braucht IBL, Nebel und die gebackene Sonnenverschattung genau wie jede andere
 * Oberfläche — ein eigener Shader müsste alles drei nachbauen.
 */
export class FacadeMaterial extends MeshStandardMaterial {
  readonly #atmosphere: AtmosphereUniforms;
  readonly #city: CityUniforms;

  constructor(atmosphere: AtmosphereUniforms, city: CityUniforms) {
    super({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.78,
      metalness: 0,
      // **Nicht flach schattiert**, anders als Props und Vegetation. Die
      // Baukörper sind achsparallele Quader mit exakt einer Normale je Fläche;
      // `flatShading` würde dieselbe Normale noch einmal aus den Ableitungen
      // rechnen und kostet dabei einen Ableitungsbefehl je Fragment für ein
      // identisches Ergebnis.
      flatShading: false,
      // Emissive muss ungleich schwarz sein, sonst schneidet three den
      // Emissive-Zweig beim Übersetzen ganz heraus und `totalEmissiveRadiance`
      // landet nirgends.
      emissive: new Color(0x010101),
    });
    this.#atmosphere = atmosphere;
    this.#city = city;
    this.name = 'FacadeMaterial';
    // Der geteilte Block liegt zusätzlich im `userData`, damit man ihn von der
    // Browser-Konsole aus erreicht: eine A/B-Messung am Fensterlicht ist sonst
    // ein Neustart des Dev-Servers je Wert — auf einem SMB-Mount ohne
    // Datei-Watcher der einzige Weg, eine Änderung an `src/` zu sehen.
    this.userData.cityUniforms = city;
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    shader.uniforms.uCityTime = this.#city.uCityTime;
    shader.uniforms.uWindowLitFraction = this.#city.uWindowLitFraction;
    shader.uniforms.uWindowEmissive = this.#city.uWindowEmissive;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\n' +
          'attribute vec2 aFacade;\n' +
          'varying vec3 vFacadeWorld;\n' +
          'varying vec2 vFacadeUv;\n' +
          'varying vec2 vFacadeKind;',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n' +
          'vFacadeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n' +
          'vFacadeUv = uv;\n' +
          'vFacadeKind = aFacade;',
      );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\n' +
        'uniform float uCityTime;\n' +
        'uniform float uWindowLitFraction;\n' +
        'uniform float uWindowEmissive;\n' +
        'varying vec3 vFacadeWorld;\n' +
        'varying vec2 vFacadeUv;\n' +
        'varying vec2 vFacadeKind;\n' +
        'vec2 gFacadeShade;\n' +
        'vec3 gFacadeWindow;\n' +
        windowsGlsl,
    );

    injectAtmosphere(
      shader as unknown as { fragmentShader: string; uniforms: Record<string, IUniform> },
      this.#atmosphere,
      'vFacadeWorld',
    );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n' +
          'gFacadeShade = atmoShade(vFacadeWorld);\n' +
          // Dächer, Brüstungen und Vordächer sind glatte Flächen ohne Raster.
          // Sie laufen durch dieselbe Kette, bekommen aber eine leere Maske —
          // ein zweites Material wäre ein zweites Programm für dieselbe Wand.
          'gFacadeWindow = vFacadeKind.y < 0.5\n' +
          '  ? facadeWindows(vFacadeUv, vFacadeKind.x, uCityTime)\n' +
          '  : vec3(0.0);\n' +
          // Glas ist dunkler und glatter als Putz, der Rahmen dunkler als beides.
          'diffuseColor.rgb *= 1.0 - gFacadeWindow.x * 0.62 - gFacadeWindow.z * 0.25;',
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n' +
          'roughnessFactor = mix(roughnessFactor, 0.12, gFacadeWindow.x);',
      )
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n' +
          'reflectedLight.directDiffuse *= gFacadeShade.x;\n' +
          'reflectedLight.directSpecular *= gFacadeShade.x;',
      )
      .replace(
        '#include <aomap_fragment>',
        '#include <aomap_fragment>\n' +
          'reflectedLight.indirectDiffuse *= mix(1.0, gFacadeShade.y, uAtmoSkyOcclusion.x);\n' +
          'reflectedLight.indirectSpecular *= mix(1.0, gFacadeShade.y, uAtmoSkyOcclusion.y);',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' +
          'totalEmissiveRadiance += facadeWindowColor(vFacadeUv, vFacadeKind.x)\n' +
          '  * gFacadeWindow.y * uWindowEmissive;',
      );
  }

  override customProgramCacheKey(): string {
    return 'japanmap:facade';
  }
}
