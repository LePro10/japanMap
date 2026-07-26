/**
 * Postprocessing und Color Grading — PLAN.md P2 / 2.1 und 2.5.
 *
 * Reihenfolge der Kette ist nicht verhandelbar und steht in PostFXPipeline.ts:
 * AO wirkt auf lineares HDR, Tonemapping macht daraus Anzeigewerte, LUT und
 * Vignette arbeiten darauf, SMAA kommt zuletzt.
 */

export const POSTFX = {
  /**
   * Belichtung vor dem Tonemapping.
   *
   * three lädt `renderer.toneMappingExposure` in **jedes** Programm hoch, auch
   * in die Effekt-Materialien von `postprocessing` — der AgX-Operator dort liest
   * dieselbe Uniform. Der Regler „Belichtung" aus P0 wirkt deshalb weiterhin an
   * der richtigen Stelle, obwohl der Renderer selbst nicht mehr tonemappt.
   */
  exposure: 1,

  bloom: {
    enabled: true,
    /**
     * Schwelle in **linearen HDR-Werten**, nicht in Anzeigewerten. Über 1,0
     * heißt: nur was heller als Weiß ist, blüht. Bei blauer Stunde sind das
     * genau die Stellen, an denen das Bild leben soll — Sonnenreflexe auf
     * nassem Fels, später Straßenlampen und Fenster.
     */
    threshold: 1.05,
    smoothing: 0.4,
    intensity: 0.62,
    /**
     * Mipmap-Blur statt Kawase-Kette: ein einziger Downsample-Baum, dessen
     * Kosten mit der Auflösung sinken statt zu steigen. Bei 4k ist das der
     * Unterschied zwischen 1,5 ms und 4 ms.
     */
    mipmapBlur: true,
    radius: 0.72,
  },

  vignette: {
    enabled: true,
    offset: 0.32,
    darkness: 0.42,
  },

  ao: {
    enabled: true,
    /**
     * N8AO liest die Tiefe des Composers und rendert die Szene **nicht** erneut.
     * Das ist der Grund für diese Bibliothek statt des eingebauten SSAO aus
     * `postprocessing`: letzteres braucht einen NormalPass, und der wäre ein
     * dritter kompletter Terrain-Durchlauf — 1,18 Mio. Dreiecke für einen
     * Effekt, der auf glattem Gelände fast nichts zeigt.
     */
    aoRadius: 14,
    distanceFalloff: 1.4,
    intensity: 2.1,
    aoSamples: 16,
    denoiseSamples: 8,
    denoiseRadius: 12,
    /**
     * Halbe Auflösung. Umgebungsverdeckung ist ein niederfrequentes Signal; der
     * depth-aware Upsampler holt die Kanten zurück. Kostet rund ein Drittel.
     */
    halfRes: true,
    /**
     * **Muss aus bleiben.** Mit `transparencyAware` rendert N8AO die Szene für
     * die transparenten Objekte zweimal zusätzlich — mit der Wasserfläche aus
     * 2.4 wären das zwei komplette Zusatzdurchläufe. Der Effekt: Wasser
     * verdeckt kein AO. Bei einer spiegelnden Fläche fällt das nicht auf.
     */
    transparencyAware: false,
    /**
     * Aus. Die Kette arbeitet an dieser Stelle in linearem HDR; eine
     * Gamma-Korrektur mitten drin würde das Tonemapping dahinter verfälschen.
     */
    gammaCorrection: false,
  },

  smaa: {
    enabled: true,
  },
} as const;

/**
 * Parameter des Color Gradings.
 *
 * Daraus wird zur Laufzeit eine 32³-LUT gerechnet (siehe grading.ts). PLAN.md
 * sah den umgekehrten Weg vor — Screenshot ins Bildbearbeitungsprogramm, dort
 * graden, als `.cube` exportieren. Das bleibt möglich (der Parser liest `.cube`),
 * ist als *einziger* Weg aber unpraktisch: man sieht das Ergebnis erst nach
 * einem Rundlauf über zwei Programme, und die Datei kostet Download-Budget.
 * Mit Reglern und einem `.cube`-Export ist die Schleife kurz und das Ergebnis
 * trotzdem exportierbar.
 */
export interface GradingParams {
  /** Kontrast um den Mittelgrau-Punkt. 1 = neutral. */
  contrast: number;
  saturation: number;
  /** Farbtemperatur, −1 kühl … +1 warm. */
  temperature: number;
  /** Grün/Magenta-Achse. */
  tint: number;
  /** Anhebung der Tiefen (additiv). */
  lift: number;
  /** Mitten (Gamma). */
  gamma: number;
  /** Lichter (multiplikativ). */
  gain: number;
  /** Farbstich in den Tiefen — bei blauer Stunde der wichtigste Regler. */
  shadowTint: number;
}

export const GRADING: GradingParams = {
  contrast: 1.06,
  saturation: 1.04,
  temperature: -0.06,
  tint: 0.01,
  lift: 0.008,
  gamma: 1,
  gain: 1.02,
  shadowTint: 0.16,
};

/** Kantenlänge des LUT-Würfels. 32 ist der Standard für `.cube`-Dateien. */
export const GRADING_LUT_SIZE = 32;
