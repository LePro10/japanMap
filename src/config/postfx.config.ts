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
 * Was eine Qualitätsstufe an der Kette ändert — P8.1 / 8.2.
 *
 * ## Warum es diese Tabelle überhaupt gibt
 *
 * Bis P8 war von der ganzen Kette genau **ein** Effekt an die Stufe gebunden:
 * die Umgebungsverdeckung. Bloom, SMAA, Vignette, LUT und AgX liefen auf
 * „Niedrig" in derselben Auflösung wie auf Ultra. Das ist der ungünstigste
 * Posten, den man so stehenlassen kann, denn er ist der einzige, der **nicht**
 * mit `renderScale` schrumpft: das Ziel der Kette ist der Canvas, nicht der
 * Szenenpuffer.
 *
 * ## Die Stufen
 *
 * `bloomLevels` ist die Zahl der MIP-Stufen im Unschärfebaum. Der Baum
 * halbiert je Stufe die Kantenlänge, eine Stufe kostet also ein Viertel der
 * vorherigen — an **Fläche** ist zwischen 8 und 4 Stufen kaum etwas zu holen
 * (1,333 gegen 1,328 Vollbilder). **Das wird hier deshalb nicht als Ersparnis
 * verkauft**; was zählt, ist die Zahl der *Durchgänge*: jede MIP-Stufe ist ein
 * eigener Draw-Call mit eigenem Zustandswechsel, im Abstieg wie im Aufstieg.
 *
 * `composer: false` ist der eigentliche Hebel und der Grund für eine eigene
 * Stufe: die Kette läuft **gar nicht**, gerendert wird direkt in den Canvas.
 * Solange sie läuft, kostet sie ihre Vollbilddurchgänge, egal wie klein man
 * ihre Regler stellt.
 *
 * ## Gemessen
 *
 * Draw-Calls bei **leerer Szene** — was übrig bleibt, ist die Kette selbst:
 *
 * | Stufe | postFx | Durchgänge |
 * |---|---|---|
 * | Ultra   | `full`    | 28 |
 * | Hoch    | `full`    | 29 |
 * | Mittel  | `reduced` | 22 |
 * | Niedrig | `lean`    | 10 |
 * | Minimal | `off`     |  1 |
 *
 * Zwei Dinge stehen absichtlich **nicht** in dieser Tabelle:
 *
 *  - **Ultra hat einen Durchgang weniger als Hoch.** Der Unterschied ist die
 *    AO in voller statt halber Auflösung, also vermutlich ein Aufwärtsfilter,
 *    der dort entfällt. *Vermutet, nicht isoliert gemessen.*
 *  - **Der Sprung 22 → 10 bündelt drei Änderungen**: die AO fällt ganz weg
 *    (`ao: 'off'`), SMAA fällt weg, und der Bloom-Baum geht von 5 auf 4 Stufen.
 *    Welcher Anteil wie viel trägt, ist damit **nicht** gemessen — die
 *    Aufschlüsselung bräuchte den A/B-Knopf im Panel und einen GPU-Timer, den
 *    diese Maschine nicht hat.
 *
 * > **Was `off` kostet, gehört dazugesagt:** ohne Composer gibt es kein Bloom,
 * > kein SMAA, keine Vignette und **keine Grading-LUT**. Das Tonemapping
 * > übernimmt der Renderer selbst (AgX), damit die Helligkeit stimmt; der
 * > Farbstich aus `GRADING` fehlt.
 * >
 * > **Was das im Bild heißt, ist gemessen — und anders, als es aussah.** Am
 * > Blickpunkt `stadt-neon`, Maske aus der Differenz gegen einen Frame mit
 * > ausgeblendeter Neongruppe (das Verfahren aus P6):
 * >
 * > | Stufe | Fläche der Maske | Sattheit | Helligkeit |
 * > |---|---|---|---|
 * > | Ultra   | 5,62 % | 0,191 | 142,3 |
 * > | Niedrig | 6,90 % | 0,182 | 144,0 |
 * > | Minimal | 1,98 % | 0,206 | 157,0 |
 * >
 * > Der erste Eindruck am Bild war „die Schilder sind ausgewaschen". Das ist
 * > **falsch**: sie sind in ihrem Kern sogar gesättigter (0,206) und heller
 * > (157,0). Was fehlt, ist die **Reichweite** — ohne Bloom leuchtet ein
 * > Neonschild nur dort, wo seine Geometrie steht, und die Maske schrumpft um
 * > den Faktor 2,8. Ein Neonschild ohne Streulicht liest sich als Aufkleber,
 * > nicht als Lampe.
 *
 * > ## ⚠ Vorsicht beim Messen von `off` — P11.0, 2026-08-10/11
 * >
 * > **Zuerst das Ergebnis: mit `off` ist alles in Ordnung.** Auf einer echten
 * > GPU (RX 7900 XTX) steht die Vegetation auf „Minimal" korrekt grün, bei
 * > 0,79 ms GPU und 43 Draw-Calls. Der Absatz unten beschreibt einen Fehler,
 * > den es **nicht gibt** — er blieb stehen, weil die Falle darin lehrreich ist.
 * >
 * > **Auf einer Maschine ohne GPU-Treiber ist der `off`-Pfad nicht messbar.**
 * > Hier (ANGLE / Microsoft Basic Render Driver) rendert er fleckig: die
 * > Vegetation kommt in großen Teilen als flache, himmelsfarbene Fläche heraus.
 * > Der Composer-Pfad zeigt das nicht, weil an seinem Ende ein Vollbild-Durchgang
 * > jedes Pixel neu schreibt. Wer hier ein Bild aus `off` auswertet, misst den
 * > Rasterisierer.
 * >
 * > ### Was das gekostet hat, und die acht Messungen, die niemand wiederholen muss
 * >
 * > Der Befund sah hier so aus: im `off`-Pfad rendert die **gesamte Vegetation
 * > als reinweißer Scherenschnitt** — jeder Baum, jeder Busch, jeder Grashalm.
 * > Gelände, Stadt und Himmel sind unauffällig.
 * >
 * > Isoliert nachgewiesen am Blickpunkt `wald`, alles auf Ultra und **nur**
 * > dieses Feld verstellt: `full`/`reduced`/`lean` liefern korrektes Grün,
 * > `off` liefert Weiß. Gegenprobe mit den Minimal-Werten und nur getauschter
 * > Kette: dasselbe Bild, einmal weiß, einmal grün.
 * >
 * > Die Ursache ist **nicht gefunden**, und sieben Vermutungen sind gemessen
 * > **widerlegt**: Tonemapping, gesättigte Werte/NaN, Alphakanal, Nebel,
 * > Imposter-Atlas, Umgebungskarte und die planare Spiegelung. Tabelle mit den
 * > Zahlen in PLAN.md unter P11.0, „Befund 1".
 * >
 * > **Der Verdacht zeigt inzwischen woandershin.** Die hellen Flächen
 * > überdecken auch das *Gelände*, ihre Ränder schneiden quer durch einzelne
 * > Bäume, und der Anteil schwankt zwischen aufeinanderfolgenden Frames
 * > desselben Zustands (38,4…45,2 %). Ein Shading-Fehler wäre stabil und
 * > objektgebunden. Wahrscheinlicher ist ein **Artefakt des
 * > Software-Rasterisierers** dieser Entwicklungsmaschine: im Composer-Pfad
 * > schreibt ein Vollbild-Durchgang am Ende jedes Pixel neu, im `off`-Pfad geht
 * > die Szene direkt in den Canvas.
 * >
 * > **Auf einer echten GPU ist das noch nicht nachgesehen.** Bis dahin gilt
 * > `off` als *verdächtig* und nicht als kaputt — und ein Fix wird nicht
 * > gebaut, bevor die Frage entschieden ist.
 */
export type PostFxQuality = 'full' | 'reduced' | 'lean' | 'off';

export interface PostFxSettings {
  /** Läuft die Kette überhaupt? `false` rendert direkt in den Canvas. */
  readonly composer: boolean;
  /** MIP-Stufen im Bloom-Unschärfebaum. 0, wenn die Kette nicht läuft. */
  readonly bloomLevels: number;
  readonly smaa: boolean;
}

export const POSTFX_QUALITY: Readonly<Record<PostFxQuality, PostFxSettings>> = {
  full: { composer: true, bloomLevels: 8, smaa: true },
  reduced: { composer: true, bloomLevels: 5, smaa: true },
  lean: { composer: true, bloomLevels: 4, smaa: false },
  off: { composer: false, bloomLevels: 0, smaa: false },
};

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
