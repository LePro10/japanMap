/// <reference types="vite/client" />
/// <reference types="vite-plugin-glsl/ext" />

import type { QualityKey, QualityLevel } from './config/quality.config';
import type { Engine } from './core/Engine';
import type { AbOptions, AbReport } from './debug/abMeasure';
import type { DriveProbeOptions, DriveProbeReport } from './debug/driveProbe';
import type { LapResult } from './game/LapTimer';
import type { HoleReport } from './debug/lodHoles';
import type { Report, ReportOptions } from './debug/report';
import type { WindingRow } from './debug/winding';
import type { DeviceEstimate } from './render/deviceTier';
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
      quality?: (level?: QualityKey) => QualityKey;
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
      /**
       * Löcher im Terrain-Gitter zählen (P4 / 4.1, Abnahme von P8.1).
       * Optional zuerst auf eine Stufe schalten.
       */
      lodHoles?: (level?: QualityLevel) => HoleReport;
      /**
       * Wickelrichtung aller Meshes gegen ihr Normal-Attribut prüfen (P8.11).
       *
       * Ohne Argument nur die auffälligen — einseitige Flächen, die zu über
       * 50 % gegenläufig gewickelt sind und damit unsichtbar bleiben.
       */
      winding?: (alle?: boolean) => WindingRow[];
      /** Ergebnis der Gerätevorschätzung (P8.3). */
      device?: () => DeviceEstimate | null;
      /**
       * Der Messlauf (P10 / 10.0) — Blickpunkte × Qualitätsstufen, mit
       * JSON-Bericht und je einem PNG in `.cache/`.
       *
       * Auf einer Maschine mit `EXT_disjoint_timer_query_webgl2` trägt der
       * Bericht GPU-Zeit; ohne sie steht dort `null` **mit Begründung** statt
       * einer 0, die nach „kostet nichts" aussieht.
       */
      report?: (options?: ReportOptions) => Promise<Report>;
      /**
       * Interleavte A/B-Messung der GPU-Zeit (P12 / 12.0).
       *
       * Misst **Eingriffe** gegen eine Basis statt Zustände gegeneinander, und
       * setzt jede Variante zwischen zwei Basiswerte — sonst misst eine
       * mitbenutzte GPU mit. Liefert je Eingriff ein Δ **und** die Aussage, ob
       * es über dem gemessenen Rauschband liegt.
       */
      ab?: (options: AbOptions) => Promise<AbReport>;
      /**
       * Fahrmodus schalten oder abfragen (P14).
       *
       * Der einzige Weg dorthin, wenn es keinen Pointer Lock gibt — die Taste `V`
       * verlangt einen, die eingebettete Vorschau gibt keinen.
       */
      drive?: (on?: boolean) => boolean;
      /**
       * Der Messstand des Fahrmodus (P14): jede Strecke abfahren, Durchdringung,
       * Spurtreue, Tempo und CPU je Schritt mitschreiben — plus die
       * Höhendifferenz zwischen Sampler und Straßenmittellinie aus PLAN.md 9.1.
       */
      driveProbe?: (options?: DriveProbeOptions) => DriveProbeReport;

      /**
       * Die Rundenzählung auf den Toren aus P8.11 — P9.3.
       *
       * Ohne Argument der aktuelle Stand; mit einer Strecken-Kennung wird auf
       * diese Strecke umgestellt und neu begonnen.
       */
      laps?: (roadId?: string) => {
        strecke: string | null;
        tore: number;
        laufend: boolean;
        verstrichen: number;
        runden: readonly LapResult[];
      };
    };
  }
}

export {};
