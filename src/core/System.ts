import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';

import type { DebugHost } from '@/debug/DebugHost';
import type { AppBus } from './events';
import type { ResourceManager } from './ResourceManager';

/**
 * Was ein System von der Engine bekommt. Bewusst schmal: alles, was ein System
 * darüber hinaus braucht, läuft über den EventBus — nicht über Direktzugriff
 * auf andere Systeme.
 */
export interface EngineContext {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly bus: AppBus;
  readonly resources: ResourceManager;
  /** Im Produktions-Build null — Systeme müssen ohne Debug-UI funktionieren. */
  readonly debug: DebugHost | null;
}

/**
 * Ein System ist eine abgeschlossene Einheit der Welt (Terrain, Vegetation,
 * Straßen, Wasser …). Nur `name` und `dispose` sind Pflicht: `dispose` ist es
 * deshalb, weil ein System ohne Freigabe seiner GPU-Ressourcen bei jedem
 * Hot-Reload Speicher liegen lässt.
 */
export interface System {
  readonly name: string;

  /** Asynchrones Laden gehört hierhin, nicht in den Konstruktor. */
  init?(context: EngineContext): void | Promise<void>;

  /** Fixer Zeitschritt (60 Hz). Für alles, was deterministisch sein muss. */
  fixedUpdate?(dt: number): void;

  /** Variabler Zeitschritt. Kamera, Eingabe, LOD-Auswahl, Animation. */
  update?(dt: number, alpha: number): void;

  /** Reaktion auf eine neue Canvas-Größe (Render-Targets neu anlegen). */
  resize?(width: number, height: number): void;

  dispose(): void;
}
