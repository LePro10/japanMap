import {
  MeshStandardMaterial,
  type IUniform,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import { ROAD_WET } from '@/config/roads.config';
import {
  injectAtmosphere,
  type AtmosphereUniforms,
} from '@/render/atmosphere/atmosphereUniforms';

import puddlesGlsl from '../shaders/road_puddles.glsl';

export interface RoadTextures {
  readonly albedo: Texture;
  readonly normal: Texture;
  readonly arm: Texture;
}

/**
 * Geteilter Uniform-Block des Belags.
 *
 * Straßen **und** Stadtboden hängen daran. Zwei Blöcke hießen zwei Regler für
 * dieselbe Nässe, und an der Bordsteinkante sähe man, welcher zuletzt verstellt
 * wurde — dieselbe Begründung wie beim globalen Wind aus P4.
 */
export interface RoadUniforms {
  readonly uWetness: IUniform<number>;
  readonly uPuddleEdge: IUniform<number>;
}

export function createRoadUniforms(): RoadUniforms {
  return {
    uWetness: { value: ROAD_WET.wetness },
    uPuddleEdge: { value: ROAD_WET.edge },
  };
}

/**
 * Straßenbelag — PLAN.md P3 / 3.4, nass gemacht in P6 / 6.4.
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
 *
 * ## Nässe (P6 / 6.4)
 *
 * Drei Eingriffe, alle in derselben Maske:
 *
 *  1. **Rauheit fällt** auf nahezu null — das ist der eigentliche Effekt. Eine
 *     Pfütze spiegelt, weil sie glatt ist, nicht weil sie dunkel ist.
 *  2. **Die Normale wird flach.** Ohne diesen Schritt bleibt die Körnung des
 *     Asphalts unter dem Wasser stehen, und die Spiegelung zerfällt in Funkeln.
 *     Das ist der Unterschied zwischen „nass" und „glitzernd".
 *  3. **Das Albedo dunkelt ab.** Nasser Asphalt ist dunkler als trockener, weil
 *     der Wasserfilm das an der rauen Oberfläche gestreute Licht in die
 *     Oberfläche zurückbricht.
 *
 * > **Keine Regen-Ringe.** PLAN.md 6.4 führt sie als Option. SPEC §3.1 legt den
 * > Look aber auf „blaue Stunde **nach** Regen" fest — es regnet nicht mehr.
 * > Animierte Aufschlagringe wären ein Effekt gegen die eigene Vorgabe, und der
 * > Verzicht kostet nichts, was das Bild bräuchte: die Spiegelung lebt von der
 * > glatten Fläche, nicht von Bewegung darauf.
 */
export class RoadMaterial extends MeshStandardMaterial {
  readonly #atmosphere: AtmosphereUniforms;
  readonly #road: RoadUniforms;

  constructor(textures: RoadTextures, atmosphere: AtmosphereUniforms, road: RoadUniforms) {
    super({
      map: textures.albedo,
      normalMap: textures.normal,
      aoMap: textures.arm,
      roughnessMap: textures.arm,
      metalnessMap: textures.arm,
      roughness: 1,
      metalness: 0,
      // Der R-Kanal trägt die Pfützenneigung, nicht eine Farbe. `vertexColors`
      // bleibt deshalb **aus** — sonst multiplizierte three ihn ins Albedo und
      // die Fahrbahn liefe an ihren Rändern rot an. Der Shader liest das
      // Attribut selbst.
      vertexColors: false,
    });
    this.#atmosphere = atmosphere;
    this.#road = road;
    this.name = 'RoadMaterial';
    this.userData.roadUniforms = road;
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    shader.uniforms.uWetness = this.#road.uWetness;
    shader.uniforms.uPuddleEdge = this.#road.uPuddleEdge;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\n' +
          'attribute vec3 color;\n' +
          'varying vec3 vRoadWorld;\n' +
          'varying float vRoadPuddle;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
          'vRoadWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n' +
          'vRoadPuddle = color.r;',
      );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\n' +
        'uniform float uWetness;\n' +
        'uniform float uPuddleEdge;\n' +
        'varying vec3 vRoadWorld;\n' +
        'varying float vRoadPuddle;\n' +
        'vec2 gRoadShade;\n' +
        'float gRoadWet;\n' +
        puddlesGlsl,
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
        '#include <map_fragment>\n' +
          'gRoadShade = atmoShade(vRoadWorld);\n' +
          'gRoadWet = roadPuddleMask(vRoadWorld.xz, vRoadPuddle, uWetness, uPuddleEdge);\n' +
          `diffuseColor.rgb *= mix(1.0, ${ROAD_WET.darken.toFixed(3)}, gRoadWet);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\n' +
          `roughnessFactor = mix(roughnessFactor, ${ROAD_WET.roughness.toFixed(3)}, gRoadWet);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\n' +
          // `nonPerturbedNormal` legt `<normal_fragment_begin>` an: die Normale
          // **vor** der Normalmap. Genau dorthin muss die Pfütze zurück.
          //
          // > Hier stand zuerst `geometryNormal` — so hieß dieselbe Größe in
          // > älteren three-Fassungen. Der Name existiert in 0.185 nicht mehr,
          // > und die Folge war kein Fehler im Bild, sondern **gar kein Bild**:
          // > der Fragment-Shader übersetzte nicht, three zeichnete die
          // > Draw-Calls trotzdem, und sämtliche Asphaltflächen der Karte —
          // > Straßen wie Stadtboden — verschwanden spurlos. Der Draw-Call-Zähler
          // > stand dabei unverändert bei 68, die Geometrie lag an ihrem Platz,
          // > und ein Raycast traf sie. Nur die Konsole wusste Bescheid.
          'normal = normalize(mix(normal, nonPerturbedNormal, gRoadWet));',
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
