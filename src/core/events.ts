import type { QualityLevel } from '@/config/quality.config';
import type { LookState } from '@/render/looks/lookState';
import type { TerrainHeightUniforms } from '@/world/materials/TerrainMaterial';
import type { TerrainSampler } from '@/world/TerrainSampler';
import type { EventBus } from './EventBus';

/**
 * Alle Ereignisse des Projekts an einer Stelle. Neue Ereignisse kommen hier
 * dazu — dann zeigt die Typprüfung sofort, wer sie sendet und wer sie hört.
 *
 * Bewusst `type` und nicht `interface`: nur Typ-Aliase bekommen in TypeScript
 * eine implizite Index-Signatur und erfüllen damit `Record<string, unknown>`,
 * die Schranke von EventBus. Ein Interface hier führt zu einem Fehler, dessen
 * Ursache nicht offensichtlich ist.
 */
export type AppEvents = {
  /** Canvas hat eine neue Pixelgröße bekommen (Fenster, Layout oder DPI). */
  'engine:resize': { width: number; height: number; pixelRatio: number };

  /**
   * WebGL-Kontext verloren. Alles auf der GPU ist ab hier ungültig; der
   * Browser stellt ihn oft von selbst wieder her (Treiber-Reset, Tab-Wechsel).
   */
  'engine:contextlost': void;
  'engine:contextrestored': void;

  'engine:disposed': void;

  /** Fortschritt des ResourceManagers — speist ab P7 den Ladebildschirm. */
  'resources:progress': { loaded: number; total: number; url: string };
  'resources:error': { url: string; error: unknown };

  /**
   * Das gebackene Terrain ist geladen und geprüft.
   *
   * Trägt den Sampler mit: Kamera-Kollision (P1), Straßen-Carving (P3) und
   * Vegetations-Streuung (P4) brauchen ihn, sollen aber nicht auf das
   * TerrainSystem zugreifen. Dazu die Höhen-Uniforms, mit denen das Wasser die
   * Küstenlinie im Shader ausliest (P2 / 2.4) — dieselben Objekte, damit der
   * Höhen-Regler beide zugleich verstellt.
   *
   * Wer darauf hört, muss sich **vor** `Engine.init()` anmelden und deshalb
   * **vor** dem TerrainSystem registriert sein: das Ereignis wird genau einmal
   * gesendet, während das Terrain initialisiert wird.
   */
  'terrain:ready': { sampler: TerrainSampler; height: TerrainHeightUniforms };

  /**
   * Look-Presets (PLAN.md P2 / 2.6). Zwei Richtungen, bewusst getrennt:
   *
   *  - `look:apply` verteilt einen geladenen Zustand an alle Systeme.
   *  - `look:collect` sammelt ihn wieder ein. Der Sender legt ein vorbefülltes
   *    Objekt bei, jedes System überschreibt darin nur seinen eigenen Abschnitt.
   *
   * So kennt der LookController keines der Systeme, und ein neues System bringt
   * seinen Anteil am Look selbst mit.
   */
  'look:apply': { look: LookState };
  'look:collect': { target: LookState };

  'quality:changed': { level: QualityLevel };

  'debug:visibility': { visible: boolean };
};

export type AppBus = EventBus<AppEvents>;
