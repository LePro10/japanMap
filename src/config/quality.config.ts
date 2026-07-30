/**
 * Qualitätsstufen und Performance-Budgets.
 *
 * Die Budgets sind der Grund, warum dieses Projekt überhaupt eine P0 hat.
 * Die Entwicklungsmaschine (RX 7900 XTX) rendert praktisch alles flüssig —
 * "sieht bei mir gut aus" ist deshalb kein Signal. Verbindlich sind die Zahlen
 * unten, kalibriert auf GTX 1660 / RX 580 @ 1080p60 (SPEC §4).
 */

export type QualityLevel = 'ultra' | 'high' | 'medium' | 'low';

export type AoQuality = 'high' | 'medium' | 'low' | 'off';

export interface QualitySettings {
  readonly label: string;
  /** Anzahl Schattenkaskaden (CSM, ab P2). */
  readonly shadowCascades: number;
  /** Kantenlänge einer Kaskaden-Shadowmap. */
  readonly shadowMapSize: number;
  /** Screen-Space-Reflexionen (ab P6). */
  readonly ssr: boolean;
  readonly ao: AoQuality;
  /** Sichtweite in Metern — begrenzt Chunk-Auswahl und Vegetation (ab P4). */
  readonly viewDistance: number;
  /** Anteil der gestreuten Vegetations-Instanzen, 0..1 (ab P4). */
  readonly vegetationDensity: number;
  /** Auflösungsfaktor des Render-Targets gegenüber der Canvas-Größe. */
  readonly renderScale: number;
}

export const QUALITY: Readonly<Record<QualityLevel, QualitySettings>> = {
  ultra: {
    label: 'Ultra',
    shadowCascades: 4,
    shadowMapSize: 2048,
    ssr: true,
    ao: 'high',
    viewDistance: 2000,
    vegetationDensity: 1,
    renderScale: 1,
  },
  high: {
    label: 'Hoch',
    shadowCascades: 4,
    shadowMapSize: 1024,
    ssr: true,
    ao: 'medium',
    viewDistance: 1500,
    vegetationDensity: 0.7,
    renderScale: 1,
  },
  medium: {
    label: 'Mittel',
    shadowCascades: 3,
    shadowMapSize: 1024,
    ssr: false,
    ao: 'low',
    viewDistance: 1000,
    vegetationDensity: 0.45,
    renderScale: 0.85,
  },
  low: {
    label: 'Niedrig',
    shadowCascades: 2,
    shadowMapSize: 1024,
    ssr: false,
    ao: 'off',
    viewDistance: 600,
    vegetationDensity: 0.25,
    renderScale: 0.7,
  },
};

export const QUALITY_LEVELS: readonly QualityLevel[] = ['ultra', 'high', 'medium', 'low'];

/**
 * Startstufe. P7 ersetzt das durch eine Einstufung per Kurz-Benchmark; bis
 * dahin wird auf der Zielhardware von Hand umgeschaltet.
 */
export const DEFAULT_QUALITY: QualityLevel = 'ultra';

/**
 * Ein Budget hat zwei Schwellen: `warn` färbt gelb (noch tragbar, aber der
 * Puffer schrumpft), `limit` färbt rot (SPEC §4 verletzt).
 *
 * Die Warnschwelle liegt bewusst bei ~75 % des Limits. Wer erst bei 100 %
 * reagiert, hat keinen Spielraum mehr für die Systeme, die noch kommen.
 */
export interface Budget {
  readonly warn: number;
  readonly limit: number;
}

export const BUDGETS = {
  /** Frame-Time gesamt: 16,6 ms bei 60 FPS. */
  frameTimeMs: { warn: 13, limit: 16.6 },
  /** Reine GPU-Zeit des Frames. */
  gpuMs: { warn: 13, limit: 16.6 },
  /** Anteil davon, den die Postprocessing-Kette kosten darf (ab P2 messbar). */
  postFxMs: { warn: 4, limit: 5 },
  drawCalls: { warn: 600, limit: 800 },
  /**
   * Teilbudget der Stadt — PLAN.md P6, Akzeptanzkriterium.
   *
   * Der Plan nennt „< 300 Draw-Calls" als eigenes Budget für die Stadt, und das
   * ist kein Unterposten des Gesamtbudgets, sondern eine Aussage über die
   * Bauweise: Gebäude werden **je Block** zusammengefasst, nicht je Haus. Ohne
   * diese Zusammenfassung wären es bei 135 Gebäuden allein dafür 135 Aufrufe,
   * und jede spätere Erweiterung der Stadt liefe unbemerkt darauf zu.
   *
   * Gezählt wird über die Szenengruppen `Stadt` und `Neon` und **ohne
   * Frustum-Culling** — also der Fall, dass der ganze Distrikt im Bild steht.
   * Das ist strenger als das, was der Renderer meldet, und genau richtig für
   * ein Budget: es soll nicht davon abhängen, wohin die Kamera gerade schaut.
   */
  cityDrawCalls: { warn: 200, limit: 300 },
  triangles: { warn: 2_250_000, limit: 3_000_000 },
  /** Geschätzter Texturspeicher auf der GPU. */
  textureMemoryMb: { warn: 384, limit: 512 },
  /** Übertragene Bytes bis zum ersten Bild (ab P7 gemessen). */
  initialDownloadMb: { warn: 12, limit: 15 },
} as const satisfies Record<string, Budget>;

export type BudgetKey = keyof typeof BUDGETS;
