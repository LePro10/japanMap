/**
 * Typen für `n8ao` — das Paket liefert keine mit.
 *
 * Deklariert ist nur, was PostFXPipeline tatsächlich benutzt. Eine vollständige
 * Nachbildung der Bibliothek wäre Arbeit, die beim nächsten Update veraltet;
 * ein zu schmaler Typ fällt dagegen sofort beim Kompilieren auf.
 */
declare module 'n8ao' {
  import type { Camera, Scene } from 'three';
  import { Pass } from 'postprocessing';

  export interface N8AOConfiguration {
    aoSamples: number;
    aoRadius: number;
    denoiseSamples: number;
    denoiseRadius: number;
    distanceFalloff: number;
    intensity: number;
    denoiseIterations: number;
    /** 0 = Combined, 1 = AO, 2 = No AO, 3 = Split, 4 = Split AO. */
    renderMode: 0 | 1 | 2 | 3 | 4;
    gammaCorrection: boolean;
    screenSpaceRadius: boolean;
    halfRes: boolean;
    depthAwareUpsampling: boolean;
    colorMultiply: boolean;
    /** true rendert die Szene für transparente Objekte zusätzlich — siehe postfx.config.ts. */
    transparencyAware: boolean;
    accumulate: boolean;
  }

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    readonly configuration: N8AOConfiguration;
  }

  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    readonly configuration: N8AOConfiguration;
  }
}
