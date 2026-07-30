/// <reference types="vite/client" />
/// <reference types="vite-plugin-glsl/ext" />

import type { QualityLevel } from './config/quality.config';
import type { Engine } from './core/Engine';
import type { FrameTiming } from './render/frameTiming';

declare global {
  interface Window {
    /**
     * Nur im Dev-Build gesetzt. Existiert, damit man in der Browser-Konsole
     * `japanMap.engine.dispose()` aufrufen kann — das ist das
     * Akzeptanzkriterium für die Speicherfreigabe aus PLAN.md P0.
     */
    japanMap?: {
      engine: Engine;
      /**
       * Rendert einen Frame und liest ihn sofort aus. Umgeht die
       * rAF-Drosselung verdeckter Fenster — siehe main.ts.
       */
      probe?: () => {
        width: number;
        height: number;
        mittlereHelligkeit: number;
        maximum: number;
        anteilNichtSchwarz: number;
      };
      /**
       * Rendert einen Frame und legt ihn als PNG in `.cache/shots/` ab.
       * Liefert den geschriebenen Pfad.
       */
      shot?: (name?: string) => Promise<string>;
      /**
       * Benannten Blickpunkt anfliegen — die Tabelle steht in
       * `src/debug/viewpoints.ts`. Liefert die Notiz zum Blickpunkt.
       */
      view?: (
        target:
          | string
          | {
              position: readonly [number, number, number];
              lookAt: readonly [number, number, number];
            },
      ) => string;
      /**
       * Qualitätsstufe setzen oder abfragen (P7 / 7.1).
       */
      quality?: (level?: QualityLevel) => QualityLevel;
      /**
       * Frame-Zeit messen, unabhängig von der Bildwiederholrate — siehe
       * `src/render/frameTiming.ts`.
       */
      bench?: (frames?: number) => FrameTiming;
      /**
       * Misst, welcher Anteil der Spiegelbilder im Bildschirmraum steht —
       * die Grundlage der Reflexions-Entscheidung aus P6 / 6.5.
       */
      reflectionProbe?: (grid?: number) => {
        onSurface: number;
        toSky: number;
        toGeometry: number;
        resolvable: number;
        offScreen: number;
        occluded: number;
        ssrCoverage: number;
        meanHitHeight: number;
      };
    };
  }
}

export {};
