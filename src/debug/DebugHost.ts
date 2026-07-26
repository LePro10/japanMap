import type { FolderApi } from 'tweakpane';

/**
 * Die Schnittstelle, über die Systeme die Debug-UI ansprechen.
 *
 * Bewusst eine eigene Datei mit reinen Typen: `src/core` darf nichts aus
 * `src/debug` importieren, sonst landet Tweakpane im Produktions-Bundle.
 * Typ-Importe werden beim Kompilieren restlos entfernt — die Kopplung
 * existiert nur für den Typprüfer.
 */
export interface DebugHost {
  /** Ordner für ein System. Zweiter Aufruf mit gleichem Titel liefert denselben. */
  folder(title: string): FolderApi;

  /** Erster Aufruf im Frame — startet CPU- und GPU-Zeitmessung. */
  beginFrame(): void;

  /** Letzter Aufruf im Frame. Liest renderer.info und aktualisiert das Overlay. */
  endFrame(): void;

  /**
   * GPU-Zeit des zuletzt gemessenen Frames, oder null ohne Timer-Erweiterung.
   *
   * Für Messungen, die über mehrere Frames laufen — etwa die A/B-Bestimmung der
   * PostFX-Kosten. Bewusst ein bereits gemessener Wert und keine neue Abfrage:
   * `EXT_disjoint_timer_query_webgl2` erlaubt genau eine offene Zeitmessung,
   * und die hält das Overlay über den ganzen Frame.
   */
  readonly lastGpuMs: number | null;

  /**
   * Alle Anzeigen neu aus ihren gebundenen Objekten lesen.
   *
   * Nötig, wenn ein Wert von außen geändert wurde statt über den Regler — beim
   * Laden eines Look-Presets etwa. Tweakpane merkt das nicht von selbst, und
   * ein Panel, das andere Zahlen zeigt als der Shader benutzt, ist schlimmer
   * als gar keines.
   */
  refresh(): void;

  readonly visible: boolean;

  dispose(): void;
}
