import { Color, Vector2, Vector3, type IUniform, type Texture } from 'three';

import { FOG, SHADE } from '@/config/atmosphere.config';
import { WORLD } from '@/config/world.config';

import atmospherePars from './atmosphere_pars.glsl';

/**
 * Der gemeinsame Uniform-Block der Atmosphäre — PLAN.md P2 / 2.2.
 *
 * Nebel und Geländeverschattung sind Eigenschaften der **Welt**, nicht einzelner
 * Materialien: derselbe Nebel muss auf Terrain, Wasser und ab P3 auf Straßen
 * und Vegetation liegen, sonst schwimmen die Objekte in verschiedenen
 * Atmosphären. Deshalb ein Block, den sich alle teilen — ein Regler im
 * Debug-Panel verstellt damit automatisch jedes Material.
 *
 * Verteilt wird er über das Ereignis `atmosphere:ready`, wie der Terrain-Sampler
 * über `terrain:ready`. Wer ihn braucht, meldet sich **vor** `Engine.init()` an.
 */
export interface AtmosphereUniforms {
  readonly uAtmoTime: IUniform<number>;
  readonly uAtmoWorldSize: IUniform<Vector2>;

  /** x = Dichte pro Meter, y = Abfallhöhe in Metern, z = Himmelsanteil 0..1. */
  readonly uAtmoFogGround: IUniform<Vector3>;
  readonly uAtmoFogAerial: IUniform<Vector3>;
  readonly uAtmoFogGroundTint: IUniform<Color>;
  readonly uAtmoFogAerialTint: IUniform<Color>;
  readonly uAtmoFogMaxOpacity: IUniform<number>;
  readonly uAtmoSkyLut: IUniform<Texture | null>;

  readonly uAtmoSunDirection: IUniform<Vector3>;
  readonly uAtmoSunElevationDeg: IUniform<number>;

  readonly uAtmoShade: IUniform<Texture | null>;
  /** x = maxHorizonDeg, y = maxOccluderDistance, z = Auflösung von shade.png. */
  readonly uAtmoShadeDecode: IUniform<Vector3>;
  /** x = Grundbreite des Halbschattens in Grad, y = Zuwachs pro Meter. */
  readonly uAtmoShadeSoftness: IUniform<Vector2>;
  readonly uAtmoShadeAmbient: IUniform<number>;
  readonly uAtmoSkyOcclusion: IUniform<Vector2>;
}

export function createAtmosphereUniforms(): AtmosphereUniforms {
  return {
    uAtmoTime: { value: 0 },
    uAtmoWorldSize: { value: new Vector2(WORLD.size, WORLD.half) },

    uAtmoFogGround: {
      value: new Vector3(FOG.ground.density, FOG.ground.falloff, FOG.ground.skyBlend),
    },
    uAtmoFogAerial: {
      value: new Vector3(FOG.aerial.density, FOG.aerial.falloff, FOG.aerial.skyBlend),
    },
    // Die Tönungen sind Art-Direction-Farben und werden im sRGB-Raum notiert;
    // gerechnet wird linear, deshalb die Konvertierung beim Anlegen.
    uAtmoFogGroundTint: { value: new Color().setHex(FOG.ground.tint, 'srgb') },
    uAtmoFogAerialTint: { value: new Color().setHex(FOG.aerial.tint, 'srgb') },
    uAtmoFogMaxOpacity: { value: FOG.maxOpacity },
    uAtmoSkyLut: { value: null },

    // Rückfallwerte bis der LightingRig die gemessene Sonne einträgt. Nicht
    // null, damit ein Material auch dann übersetzt, wenn die Sonnendaten fehlen.
    uAtmoSunDirection: { value: new Vector3(0.80865, 0.03897, 0.58699) },
    uAtmoSunElevationDeg: { value: 2.23 },

    uAtmoShade: { value: null },
    uAtmoShadeDecode: { value: new Vector3(90, 2000, 1024) },
    uAtmoShadeSoftness: {
      value: new Vector2(SHADE.penumbraBaseDeg, SHADE.penumbraPerKmDeg / 1000),
    },
    uAtmoShadeAmbient: { value: SHADE.ambientFloor },
    uAtmoSkyOcclusion: {
      value: new Vector2(SHADE.skyOcclusionDiffuse, SHADE.skyOcclusionSpecular),
    },
  };
}

/** GLSL-Ausdruck, der im Fragment-Shader die Weltposition liefert. */
export type WorldPositionExpression = string;

/**
 * Atmosphäre in ein Material einsetzen.
 *
 * Der Nebel landet direkt nach `<opaque_fragment>` — also **vor** Tonemapping
 * und Farbraumwandlung, in linearem HDR. Three.js' eigener Fog-Chunk sitzt
 * dahinter, in Anzeigewerten; das war zu Zeiten ohne HDR-Pipeline richtig und
 * wäre hier falsch, weil der Nebel dann nach dem Tonemapping aufgehellt würde
 * statt mit ihm zusammen komprimiert. Der eingebaute Fog bleibt deshalb aus
 * (`scene.fog === null`), er wird nicht überschrieben (PLAN.md P2, Risiken).
 */
export function injectAtmosphere(
  shader: { fragmentShader: string; uniforms: Record<string, IUniform> },
  uniforms: AtmosphereUniforms,
  worldPosition: WorldPositionExpression,
): void {
  for (const [name, uniform] of Object.entries(uniforms)) {
    shader.uniforms[name] = uniform as IUniform;
  }

  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${atmospherePars}`)
    .replace(
      '#include <opaque_fragment>',
      '#include <opaque_fragment>\n' +
        `gl_FragColor.rgb = atmoApplyFog(gl_FragColor.rgb, ${worldPosition});`,
    );
}
