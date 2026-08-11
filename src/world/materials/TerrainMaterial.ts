import {
  Color,
  FrontSide,
  MeshDepthMaterial,
  MeshStandardMaterial,
  RGBADepthPacking,
  Vector2,
  Vector3,
  Vector4,
  type DataArrayTexture,
  type DataTexture,
  type IUniform,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';

import { LOD } from '@/config/lod.config';
import { TERRAIN, TERRAIN_LAYERS } from '@/config/terrain.config';
import { GROUND_TINT } from '@/config/vegetation.config';
import { WORLD } from '@/config/world.config';
import {
  injectAtmosphere,
  type AtmosphereUniforms,
} from '@/render/atmosphere/atmosphereUniforms';

import heightGlsl from '../shaders/terrain_height.glsl';
import parsVertex from '../shaders/terrain_pars.vert.glsl';
import displaceVertex from '../shaders/terrain_displace.vert.glsl';
import parsFragment from '../shaders/terrain_pars.frag.glsl';
import splatFragment from '../shaders/terrain_splat.frag.glsl';

export interface TerrainUniforms {
  readonly uHeightmap: IUniform<DataTexture>;
  readonly uHeightRes: IUniform<number>;
  readonly uSpacing: IUniform<number>;
  readonly uWorldSize: IUniform<Vector2>;
  readonly uHeightDecode: IUniform<Vector2>;
  readonly uHeightScale: IUniform<number>;
  readonly uZones: IUniform<Texture>;
  readonly uTerrainNormal: IUniform<Texture>;
  /** Auflösung der gebackenen Karten: x = zones.png, y = normal.png. */
  readonly uMapRes: IUniform<Vector2>;
  readonly uAlbedoArray: IUniform<DataArrayTexture>;
  readonly uNormalArray: IUniform<DataArrayTexture>;
  readonly uArmArray: IUniform<DataArrayTexture>;
  readonly uDetailTile: IUniform<number>;
  readonly uMacroTile: IUniform<number>;
  readonly uMacroStrength: IUniform<number>;
  readonly uLayerScale: IUniform<Vector4>;
  readonly uLayerMask: IUniform<Vector4>;
  readonly uTriplanar: IUniform<Vector2>;
  readonly uDetailNormalStrength: IUniform<number>;
  readonly uDetailFade: IUniform<Vector2>;
  /**
   * Bewuchsfarbe des Bodens — `GROUND_TINT`, P11.
   *
   * Die Farbe liegt **linear** vor, nicht in sRGB: sie wird mit `terrainAlbedo`
   * verrechnet, und das kommt aus `terrainSampleLayer` bereits linearisiert
   * heraus. Eine sRGB-Zahl an dieser Stelle wäre um rund den Faktor 2 zu hell
   * und der Hang leuchtend giftgrün.
   */
  readonly uGroundTintColor: IUniform<Vector3>;
  /** Je Splat-Kanal die Neigung zur Bewuchsfarbe, mal Gesamtstärke. */
  readonly uGroundTintWeights: IUniform<Vector4>;
  /** x = Gesamtstärke, y = Anteil Helligkeitserhalt. */
  readonly uGroundTint: IUniform<Vector2>;
  readonly uDebugMode: IUniform<number>;
  /** Quads pro Achse im Einheitsgitter des Quadtrees (P4 / 4.1). */
  readonly uLodGridQuads: IUniform<number>;
  /** Spielerkamera für die Morph-Entfernung — nicht `cameraPosition`, siehe Shader. */
  readonly uLodCamera: IUniform<Vector3>;
}

export interface TerrainTextures {
  readonly heightmap: DataTexture;
  readonly normal: Texture;
  readonly zones: Texture;
  readonly albedoArray: DataArrayTexture;
  readonly normalArray: DataArrayTexture;
  readonly armArray: DataArrayTexture;
  /** Höhenbereich der gebackenen Karte, aus meta.json. */
  readonly heightRange: number;
  readonly minHeight: number;
  readonly resolution: number;
  readonly spacing: number;
  /** Auflösung von zones.png und normal.png, für die Stützstellen-Korrektur. */
  readonly zonesRes: number;
  readonly normalRes: number;
}

/**
 * Die Uniforms, die das Wasser vom Terrain mitbenutzt.
 *
 * Bewusst dieselben **Objekte**, nicht Kopien: der Höhen-Regler im Debug-Panel
 * verschiebt damit die Küstenlinie im Wasser-Shader automatisch mit. Wären es
 * Kopien, stünde der Schaumsaum nach jeder Änderung neben dem Ufer.
 */
export type TerrainHeightUniforms = Pick<
  TerrainUniforms,
  'uHeightmap' | 'uHeightRes' | 'uSpacing' | 'uWorldSize' | 'uHeightDecode' | 'uHeightScale'
>;

export const TERRAIN_HEIGHT_GLSL = heightGlsl;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function createTerrainUniforms(textures: TerrainTextures): TerrainUniforms {
  const scales = TERRAIN_LAYERS.map((layer) => layer.tileScale);
  return {
    uHeightmap: { value: textures.heightmap },
    uHeightRes: { value: textures.resolution },
    uSpacing: { value: textures.spacing },
    uWorldSize: { value: new Vector2(WORLD.size, WORLD.half) },
    // Zweiter Wert ist bereits durch 65535 geteilt: der Shader multipliziert
    // damit den rohen Texelwert, eine Division pro Vertex weniger.
    uHeightDecode: { value: new Vector2(textures.minHeight, textures.heightRange / 65535) },
    uHeightScale: { value: 1 },
    uZones: { value: textures.zones },
    uTerrainNormal: { value: textures.normal },
    uMapRes: { value: new Vector2(textures.zonesRes, textures.normalRes) },
    uAlbedoArray: { value: textures.albedoArray },
    uNormalArray: { value: textures.normalArray },
    uArmArray: { value: textures.armArray },
    uDetailTile: { value: 1 / TERRAIN.detailTileMeters },
    uMacroTile: { value: TERRAIN.macroTileMeters },
    uMacroStrength: { value: TERRAIN.macroStrength },
    uLayerScale: { value: new Vector4(scales[0], scales[1], scales[2], scales[3]) },
    uLayerMask: { value: new Vector4(1, 1, 1, 1) },
    // Als Kosinus abgelegt, damit der Shader kein acos braucht. Der größere
    // Kosinus gehört zum kleineren Winkel — deshalb sieht die Reihenfolge
    // verdreht aus: smoothstep verlangt edge0 < edge1.
    uTriplanar: {
      value: new Vector2(
        Math.cos(toRadians(TERRAIN.triplanarEndDeg)),
        Math.cos(toRadians(TERRAIN.triplanarStartDeg)),
      ),
    },
    uDetailNormalStrength: { value: TERRAIN.detailNormalStrength },
    uDetailFade: { value: new Vector2(TERRAIN.detailFadeStart, TERRAIN.detailFadeEnd) },
    // `convertSRGBToLinear()` ist der Grund, warum hier ein `Color` steht und
    // keine drei Zahlen: die Konfiguration nennt die Farbe als Hex, wie ein
    // Mensch sie liest, der Shader braucht sie linear. Siehe `uGroundTintColor`.
    uGroundTintColor: {
      value: (() => {
        const c = new Color(GROUND_TINT.color).convertSRGBToLinear();
        return new Vector3(c.r, c.g, c.b);
      })(),
    },
    uGroundTintWeights: {
      value: new Vector4(
        GROUND_TINT.weights[0],
        GROUND_TINT.weights[1],
        GROUND_TINT.weights[2],
        GROUND_TINT.weights[3],
      ),
    },
    uGroundTint: { value: new Vector2(GROUND_TINT.strength, GROUND_TINT.preserveLuminance) },
    uDebugMode: { value: 0 },
    uLodGridQuads: { value: LOD.gridQuads },
    uLodCamera: { value: new Vector3() },
  };
}

function injectVertex(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${heightGlsl}\n${parsVertex}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${displaceVertex}`);
}

function mergeUniforms(shader: WebGLProgramParametersWithUniforms, uniforms: TerrainUniforms): void {
  // Dieselben Uniform-Objekte in beiden Materialien: ein Regler im Debug-Panel
  // verstellt damit automatisch auch die Schattengeometrie. Würde hier kopiert,
  // stünde der Schatten nach jeder Änderung der Höhenskalierung daneben.
  for (const [name, uniform] of Object.entries(uniforms)) {
    shader.uniforms[name] = uniform as IUniform;
  }
}

/**
 * Terrain-Material auf Basis von `MeshStandardMaterial`.
 *
 * Bewusst kein eigenes `ShaderMaterial`: so bleiben IBL, Schatten, Fog und
 * Tonemapping von Three.js erhalten. Ein eigener PBR-Shader wäre wochenlange
 * Arbeit, um am Ende schlechter auszusehen (PLAN.md P1 / 1.4).
 */
export class TerrainMaterial extends MeshStandardMaterial {
  readonly terrainUniforms: TerrainUniforms;
  readonly #atmosphere: AtmosphereUniforms;

  constructor(uniforms: TerrainUniforms, atmosphere: AtmosphereUniforms) {
    super({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      // Die Schattenkarte nimmt dieselbe Seite wie das sichtbare Gitter. Ein
      // Höhenfeld hat keine Dicke — three würde sonst die Rückseiten rendern,
      // und Selbstverschattung säße systematisch einen Texel daneben.
      shadowSide: FrontSide,
    });
    this.terrainUniforms = uniforms;
    this.#atmosphere = atmosphere;
    this.name = 'TerrainMaterial';
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    mergeUniforms(shader, this.terrainUniforms);
    injectVertex(shader);
    // Zuerst die Atmosphäre: sie stellt `atmoShade()` und `atmoMapUv()` bereit,
    // die der Splat-Block unten benutzt, und hängt den Nebel ans Ende der Kette.
    injectAtmosphere(shader, this.#atmosphere, 'vTerrainWorld');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${parsFragment}`)
      // Ersetzt, nicht ergänzt: das Terrain hat keine `map`, die Farbe entsteht
      // vollständig aus den Splat-Ebenen.
      .replace('#include <map_fragment>', splatFragment)
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = gTerrainArm.g;',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = gTerrainArm.b;',
      )
      // Die Geländenormale kommt aus normal.png und liegt im Weltraum; three
      // rechnet ab hier im Sichtraum weiter.
      //
      // `nonPerturbedNormal` wird getrennt gesetzt: three benutzt sie unter
      // anderem für den Schatten-Normalenversatz und will dort die Fläche ohne
      // Detail-Normalmap. Der Name des Chunks hat sich mit r180 geändert (vorher
      // `geometryNormal`) — beide Zuweisungen zusammen sind das, was er heute
      // erwartet.
      .replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n' +
          'nonPerturbedNormal = normalize((viewMatrix * vec4(gTerrainGeoNormal, 0.0)).xyz);\n' +
          'normal = normalize((viewMatrix * vec4(gTerrainNormal, 0.0)).xyz);',
      )
      // Gebackene Sonnenverschattung auf das **direkte** Licht. Das ersetzt die
      // Shadow-Map aus P1: bei 2,2° Sonnenstand wirft ein 450-m-Gipfel 11,5 km
      // Schatten, und keine Kaskadenaufteilung fängt das ein (siehe
      // tools/bake-shadows.mjs).
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n' +
          'reflectedLight.directDiffuse *= gTerrainShade.x;\n' +
          'reflectedLight.directSpecular *= gTerrainShade.x;',
      )
      // Umgebungsverdeckung in zwei Maßstäben: `gTerrainArm.r` ist die der
      // Detailtextur (Zentimeter), `gTerrainShade.y` die des Geländes (Meter
      // bis Hunderte Meter). Erst zusammen sitzt eine Erosionsrinne tiefer als
      // die Fläche daneben.
      .replace(
        '#include <aomap_fragment>',
        '#include <aomap_fragment>\n' +
          'reflectedLight.indirectDiffuse *= gTerrainArm.r * ' +
          'mix(1.0, gTerrainShade.y, uAtmoSkyOcclusion.x);\n' +
          'reflectedLight.indirectSpecular *= mix(1.0, gTerrainShade.y, uAtmoSkyOcclusion.y);',
      )
      // Debug-Ansichten ganz am Ende, nach Tonemapping und Farbraum. Die
      // Gamma-Korrektur hier ist eine Näherung — für eine Diagnoseansicht
      // reicht sie, für das Bild selbst wäre sie falsch.
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n' +
          'if (uDebugMode > 0) gl_FragColor = vec4(pow(terrainDebugColor(), vec3(0.4545)), 1.0);',
      );
  }

  /**
   * Ohne diesen Schlüssel nimmt three `onBeforeCompile.toString()` — die
   * Funktion ist hier konstant, also ist ein fester Schlüssel korrekt und
   * spart bei jedem Materialwechsel einen String-Vergleich über den ganzen
   * Quelltext.
   */
  override customProgramCacheKey(): string {
    return 'japanmap:terrain';
  }
}

/**
 * Tiefenmaterial für den Schattenwurf.
 *
 * Ohne dieses Material rendert three die Schattenkarte aus der **unverschobenen**
 * Ebene: die Berge würden keinen Schatten werfen, das Gelände läge flach unter
 * einer Schattenkarte, die nichts enthält. Es teilt sich die Uniform-Objekte
 * mit dem Hauptmaterial und bleibt dadurch automatisch synchron.
 */
export function createTerrainDepthMaterial(uniforms: TerrainUniforms): MeshDepthMaterial {
  const material = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  material.name = 'TerrainDepthMaterial';
  material.onBeforeCompile = (shader): void => {
    mergeUniforms(shader, uniforms);
    injectVertex(shader);
  };
  material.customProgramCacheKey = (): string => 'japanmap:terrain-depth';
  return material;
}
