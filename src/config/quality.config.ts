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
  /**
   * Kantenlänge der Shadow-Map.
   *
   * **Wirkt nur im Vergleichsfall.** Echtzeit-Schatten sind seit P2 aus
   * (`LIGHTING.castShadow`), weil die Geländeverschattung gebacken ist; der
   * Schalter im Debug-Panel stellt die P1-Variante wieder her, und *dann*
   * entscheidet diese Zahl über Auflösung und Kosten. Solange er aus steht,
   * kostet die Stufe hier nichts — was in der Messtabelle unten auch so
   * dasteht, statt als Erfolg der Stufe verbucht zu werden.
   */
  readonly shadowMapSize: number;
  /**
   * Lokale Spiegelung auf nassem Asphalt (P6.5).
   *
   * Hieß im Plan `ssr`. P6 hat gemessen, dass Screen-Space-Reflexionen für
   * diese Blickgeometrie strukturell nicht taugen (19,3 % der Neonspiegelungen
   * stehen überhaupt im Bild) und stattdessen einen planaren Durchgang gebaut.
   * Der Schalter ist geblieben, sein Inhalt nicht: er schaltet jetzt den
   * planaren Durchgang, und der ist genau der Kandidat, den PLAN.md P6 dafür
   * benannt hat — er zeichnet die Szene ein zweites Mal, solange die Stadt im
   * Bild steht.
   */
  readonly reflections: boolean;
  readonly ao: AoQuality;
  /**
   * Sichtweite der **Streuung** in Metern (ab P4).
   *
   * PLAN.md schreibt „begrenzt Chunk-Auswahl und Vegetation". Die Chunk-Auswahl
   * steht bewusst nicht dran, und dafür gibt es zwei gemessene Gründe:
   *
   *  - **Gelände:** ein Schnitt bei 600 m nähme der Karte ihre Berge. Und den
   *    LOD-Baum stattdessen gröber zu stellen — alle `LOD.ranges` mit einem
   *    Faktor k < 1 — verletzt die Rissfreiheit: der Aufteilungsfaktor wirkt
   *    dabei wie f' = k·f, und die Herleitung in `lod.config.ts` verlangt
   *    `morphStart ≥ 0,5 + √2/f'`. Bei k = 0,7 wären das 0,837 gegen die
   *    eingestellten 0,78. Genau diesen Fall hat P4 gemessen: 207 Löcher gegen
   *    1. Der Regler ist also nicht „etwas gröber", sondern „kaputt".
   *  - **Landmarks:** die Props tragen ihre Cull-Distanz je Modell, und ein
   *    Torii, das bei 600 m verschwindet, ist keine Landmarke mehr.
   *
   * Übrig bleibt die Vegetation — und die ist auch der Posten, an dem es hängt:
   * sie stellt den Großteil der Instanzen und den ganzen Füllaufwand.
   */
  readonly viewDistance: number;
  /** Anteil der gestreuten Vegetations-Instanzen, 0..1 (ab P4). */
  readonly vegetationDensity: number;
  /** Auflösungsfaktor des Render-Targets gegenüber der Canvas-Größe. */
  readonly renderScale: number;
}

/**
 * Was eine AO-Stufe für N8AO bedeutet.
 *
 * Die Grundwerte stehen in `postfx.config.ts` und sind dort eingemessen; hier
 * steht nur, was die Stufe daran ändert. `halfRes` ist der große Hebel (rund
 * ein Drittel der AO-Kosten), die Abtastzahl der kleinere.
 */
export interface AoSettings {
  readonly enabled: boolean;
  readonly aoSamples: number;
  readonly denoiseSamples: number;
  readonly halfRes: boolean;
}

export const AO_QUALITY: Readonly<Record<AoQuality, AoSettings>> = {
  high: { enabled: true, aoSamples: 16, denoiseSamples: 8, halfRes: false },
  medium: { enabled: true, aoSamples: 16, denoiseSamples: 8, halfRes: true },
  low: { enabled: true, aoSamples: 8, denoiseSamples: 4, halfRes: true },
  off: { enabled: false, aoSamples: 8, denoiseSamples: 4, halfRes: true },
};

/**
 * Die vier Stufen — und was sie **gemessen** bewirken.
 *
 * Blickpunkt `stadt-neon`, 1280×720 CSS-Pixel, Streuung je Stufe bis zur
 * Stabilität vorgefüllt (sonst misst man den Füllvorgang, siehe
 * `frameTiming.ts`), danach 12 Frames, Median:
 *
 * | Stufe | Zeichenpuffer | Draw-Calls | Dreiecke | Instanzen | Frame |
 * |---|---|---|---|---|---|
 * | Ultra   | 1280×720 | 100 | 611 974 | 1622 | 169,4 ms |
 * | Hoch    | 1280×720 | 101 | 610 151 | 1166 | 164,9 ms |
 * | Mittel  | 1088×612 |  69 | 329 823 |  735 | 104,3 ms |
 * | Niedrig |  896×503 |  62 | 329 118 |  386 |  63,2 ms |
 *
 * Zu lesen ist das so:
 *
 *  - **Die Instanzzahlen treffen die Vorgabe.** 1622 / 1166 / 735 / 386 sind
 *    1,00 / 0,719 / 0,453 / 0,238 — gegen die eingestellten 1 / 0,7 / 0,45 /
 *    0,25. Der Dichteregler wirkt also tatsächlich und nicht nur im Kommentar.
 *  - **Der Sprung von Hoch auf Mittel halbiert die Dreiecke**, ohne dass an der
 *    Szene etwas fehlt: dort fällt der planare Spiegeldurchgang weg, und der
 *    zeichnet sie ein zweites Mal. Genau der Kandidat, den PLAN.md P6 dafür
 *    benannt hat.
 *  - **Ultra gegen Hoch ist auf dieser Maschine nicht messbar.** Der Unterschied
 *    ist eine AO-Berechnung in voller statt halber Auflösung; 4,5 ms sind 2,7 %
 *    und liegen unter dem Rauschen. Vier Wiederholungen **desselben** Zustands
 *    ergaben 107,9 / 129,7 / 117,7 / 112,5 ms — rund ±10 %. Was darunter liegt,
 *    wird hier nicht behauptet.
 *  - **Die Shadow-Map steht in keiner Spalte.** Echtzeit-Schatten sind aus, also
 *    kostet ihre Auflösung nichts. Das ist kein Verdienst der Stufe.
 *
 * Die absoluten Zeiten gehören dem Software-Rasterisierer dieser Maschine
 * (ANGLE / Microsoft Basic Render Driver) und sagen nichts über eine GTX 1660.
 * Belastbar sind die **Verhältnisse** und die exakten Zähler daneben.
 */
export const QUALITY: Readonly<Record<QualityLevel, QualitySettings>> = {
  ultra: {
    label: 'Ultra',
    shadowMapSize: 2048,
    reflections: true,
    ao: 'high',
    viewDistance: 2000,
    vegetationDensity: 1,
    renderScale: 1,
  },
  high: {
    label: 'Hoch',
    shadowMapSize: 1024,
    reflections: true,
    ao: 'medium',
    viewDistance: 1500,
    vegetationDensity: 0.7,
    renderScale: 1,
  },
  medium: {
    label: 'Mittel',
    shadowMapSize: 1024,
    reflections: false,
    ao: 'low',
    viewDistance: 1000,
    vegetationDensity: 0.45,
    renderScale: 0.85,
  },
  low: {
    label: 'Niedrig',
    shadowMapSize: 1024,
    reflections: false,
    ao: 'off',
    viewDistance: 600,
    vegetationDensity: 0.25,
    renderScale: 0.7,
  },
};

export const QUALITY_LEVELS: readonly QualityLevel[] = ['ultra', 'high', 'medium', 'low'];

/**
 * Stufe, mit der die Einstufung beginnt — und die gilt, wenn sie nicht
 * stattfindet (gespeicherte Wahl, verdecktes Fenster, abgeschaltet).
 *
 * Bewusst die höchste: heruntergestuft wird gemessen, hochgestuft nie. Andersrum
 * bekäme jede starke Maschine dauerhaft das schlechtere Bild, weil niemand
 * merkt, dass mehr ginge.
 */
export const DEFAULT_QUALITY: QualityLevel = 'ultra';

/**
 * Ersteinstufung beim ersten Start — PLAN.md P7 / 7.1.
 *
 * Gemessen wird der **Abstand zwischen zwei rAF-Frames**, nicht die Rechenzeit
 * eines Frames. Das ist Absicht und der Unterschied ist wesentlich: die
 * Einstufung soll beantworten, ob die Maschine die Bildrate *hält* — und dazu
 * gehören Vsync, der Verbund mit dem Compositor und alles, was der Browser
 * zwischen zwei Bildern sonst noch tut. `frameTiming.ts` misst die andere
 * Frage (was kostet ein Zustand gegen einen anderen) und taugt dafür nicht:
 * es rendert ohne Vsync, so schnell es geht.
 *
 * Heruntergestuft wird höchstens dreimal — von Ultra nach Niedrig ist Schluss.
 */
export const BENCHMARK = {
  /**
   * Frames, die vor der Messung verworfen werden.
   *
   * Der Start ist der ungünstigste denkbare Messzeitpunkt: der Chunk-Cache der
   * Streuung ist leer und füllt sich mit einem Zeitbudget je Frame, die
   * Texturen wandern noch auf die GPU. In P4 hat genau diese Verwechslung
   * 0,70 ms statt 12,7 ms gemeldet.
   */
  warmupFrames: 30,
  /** Frames je Runde. Bei 60 Hz ist das eine Sekunde. */
  sampleFrames: 60,
  /**
   * Ab diesem Median wird eine Stufe heruntergegangen.
   *
   * 20 ms und nicht 16,6: bei Vsync gibt es keine Zwischenwerte. Wer 60 Hz
   * hält, misst 16,7 ms; wer sie verfehlt, springt auf 33,3 ms. Die Schwelle
   * liegt dazwischen und ist damit gegen die übliche Streuung robust.
   */
  stepDownMs: 20,
  /**
   * Darüber gilt die Messung als **unbrauchbar**, nicht als schlecht.
   *
   * Ein verdecktes Fenster bekommt rAF im Sekundentakt. Ohne diese Grenze
   * stufte ein kurz weggeklickter Tab die Maschine dauerhaft auf „Niedrig" —
   * und speicherte das Ergebnis auch noch.
   */
  implausibleMs: 400,
  /** Schlüssel im localStorage. */
  storageKey: 'japanMap.quality',
  /**
   * Erhöhen, wenn sich die Bedeutung der Stufen ändert. Eine gespeicherte
   * Einstufung aus einer anderen Tabelle ist keine Einstufung.
   */
  storageVersion: 1,
} as const;

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
