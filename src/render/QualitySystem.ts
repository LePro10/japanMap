import {
  BENCHMARK,
  DEFAULT_QUALITY,
  QUALITY,
  QUALITY_LEVELS,
  customFromSettings,
  readCustomQuality,
  setCustomQuality,
  type CustomQuality,
  type QualityKey,
  type QualityLevel,
} from '@/config/quality.config';
import { SPECIES } from '@/config/vegetation.config';
import type { EngineContext, System } from '@/core/System';
import { estimateDevice, type DeviceEstimate } from './deviceTier';

/** Größte Ferngrenze aller Arten — Bezugsgröße von `vegetationRange`. */
const SPECIES_FAR_MAX = Math.max(...SPECIES.map((s) => s.lodDistances[2]));

/**
 * Die Qualitätsstufe — PLAN.md P7 / 7.1.
 *
 * ## Warum das ein System ist und kein Schalter
 *
 * Bis P6 gab es die Stufen nur als Tabelle. Gelesen hat sie zweierlei: die
 * Streuung (Dichte und Reichweite) und der Schattenriss beim Bau der Sonne —
 * und zwar beide über `DEFAULT_QUALITY`, also über eine Konstante. Die
 * Umschaltung im Debug-Panel sendete `quality:changed`, und außer der Streuung
 * hörte niemand zu. Die Stufe „Niedrig" hat damit ein Bild geliefert, das sich
 * von „Ultra" in genau einem Punkt unterschied.
 *
 * Dieses System macht daraus einen Zustand: es hält die aktuelle Stufe, sendet
 * sie beim Start **einmal** an alle und danach bei jeder Änderung. Es fasst
 * selbst nichts an. Jedes betroffene System wendet seinen eigenen Anteil an —
 * dieselbe Regel wie bei `look:apply`, und aus demselben Grund: sonst müsste
 * hier stehen, welche Systeme es gibt.
 *
 * ## Warum es zuletzt registriert wird
 *
 * `Engine.init()` läuft der Reihe nach, und `quality:changed` erreicht nur, wer
 * bereits angemeldet ist. Das ist dieselbe Reihenfolgenbedingung wie bei
 * `terrain:ready`, nur andersherum: dieses System muss **nach** allen stehen,
 * die zuhören.
 *
 * ## Was die Stufe **nicht** darf
 *
 * Sie setzt keine Look-Werte. AO-Stärke, Bloom und Spiegelungsstärke gehören
 * dem Look-Preset (P2 / 2.6); die Stufe entscheidet nur, ob ein Effekt
 * überhaupt laufen darf und wie teuer er rechnet. Wo beides zusammentrifft —
 * die Umgebungsverdeckung —, verknüpfen die Systeme es mit UND, statt dass
 * der zuletzt eintreffende Wert gewinnt. Andernfalls hinge das Ergebnis daran,
 * ob der Nutzer erst das Preset oder erst die Stufe angefasst hat.
 */
export class QualitySystem implements System {
  readonly name = 'Qualität';

  #context: EngineContext | null = null;
  #level: QualityKey;

  /** Läuft eine Einstufung? `null`, wenn nicht. */
  #run: BenchmarkRun | null = null;
  #lastFrame = 0;
  /** Wahr, solange dieses System selbst eine Stufe sendet. */
  #internal = false;

  /** Ergebnis der Vorabschätzung — nur zur Anzeige und für Messungen. */
  #estimate: DeviceEstimate | null = null;

  readonly #readouts = {
    stufe: '—',
    wirkung: '—',
    einstufung: '—',
    geraet: '—',
  };

  get estimate(): DeviceEstimate | null {
    return this.#estimate;
  }

  /**
   * Läuft die Ersteinstufung gerade?
   *
   * **Für den Messlauf aus P10.0, und der Grund ist ein Wettlauf.** Die
   * Einstufung stuft selbsttätig herunter, solange sie misst; ein Messlauf, der
   * währenddessen `set()` ruft, bekommt die Stufe nach 60 Frames wieder
   * weggezogen — und schreibt dann Zahlen in eine Datei, die einer anderen
   * Stufe gehören. Genau die Sorte Zahl, vor der CLAUDE.md warnt: richtig
   * abgelesen, an einem Zustand gemessen, der nicht der berichtete war.
   */
  get classifying(): boolean {
    return this.#run !== null;
  }

  constructor(level: QualityKey = DEFAULT_QUALITY) {
    this.#level = level;
  }

  get level(): QualityKey {
    return this.#level;
  }

  init(context: EngineContext): void {
    this.#context = context;

    // Zuhören **und** senden: die Stufe kann von überall geändert werden (Panel,
    // Konsole, der Startbenchmark). Wer sie ändert, sendet das Ereignis; dieses
    // System führt nur Buch darüber, was gerade gilt.
    context.bus.on('quality:changed', ({ level }) => {
      this.#level = level;
      // Kam die Stufe nicht von hier, hat jemand sie von Hand gewählt — im
      // Panel, in der Konsole. Das beendet die Einstufung und wird gemerkt.
      // Sonst nähme die Messung dem Nutzer seine Wahl nach einer Sekunde
      // wieder weg, und zwar unbemerkt.
      if (!this.#internal) {
        this.#run = null;
        this.#readouts.einstufung = 'von Hand gewählt';
        storeLevel(level);
      }
      this.#updateReadouts();
    });

    const estimate = estimateDevice(context.renderer);
    this.#estimate = estimate;
    this.#readouts.geraet =
      `${QUALITY[estimate.level].label} — ${estimate.reason}` +
      ` · ${estimate.cores} Kerne` +
      (estimate.memory === null ? '' : ` · ${estimate.memory} GB`) +
      (estimate.touch ? ' · Touch' : '');

    const gespeichert = readStoredLevel();
    if (gespeichert) {
      this.#readouts.einstufung = 'aus einem früheren Start übernommen';
    } else {
      this.#run = { rest: BENCHMARK.warmupFrames, samples: [], runde: 1 };
      this.#readouts.einstufung = 'läuft …';
      if (estimate.level !== this.#level) {
        console.info(
          `Gerätevorschätzung: Start auf „${QUALITY[estimate.level].label}" statt ` +
            `„${QUALITY[this.#level].label}" — ${estimate.reason}.`,
        );
      }
    }

    /**
     * Beide Wege zu einer anderen Startstufe laufen hier zusammen: die
     * gespeicherte Wahl (P7.1) und die Gerätevorschätzung (P8.3). Angewendet
     * werden sie **nach** dem Aufwärmframe, und zwar aus demselben Grund.
     *
     * Der Aufwärmframe übersetzt die Shader (P7.4), und er tut das nur für die
     * Stufe, auf der er läuft. Eine niedrige braucht weniger davon: auf
     * „Niedrig" entfällt der Spiegeldurchgang, auf „Minimal" die ganze
     * Postprocessing-Kette. Vorher standen nach dem Laden 25 Programme, und wer
     * von Hand hochschaltete, bekam die fehlenden fünf mitten im Bild.
     * Aufgewärmt wird deshalb auf der höchsten Stufe und erst danach
     * heruntergeschaltet.
     *
     * **Vollständig ist das nicht, und zwar nachgemessen:** danach sind es 27
     * von 30. Die drei übrigen gehören N8AO, und die lassen sich so nicht
     * einfangen — Abtastzahl und halbe Auflösung stehen dort als Konstanten im
     * Shader, jede AO-Stufe baut ihn also neu. Ein Aufwärmen für alle Stufen
     * hieße ebenso viele Durchgänge. Der Rest ist stattdessen gemessen und
     * hingenommen: der Wechselframe kostet 214,8 ms gegen 178 ms im Beharren,
     * also rund 37 ms — innerhalb des 50-ms-Budgets, und er hängt an einer
     * bewussten Handlung statt an einer Kameradrehung.
     *
     * > **Damit bleibt ein teurer Frame auf der höchsten Stufe stehen, auch auf
     * > einem schwachen Gerät.** Das ist eine bewusste Abwägung und keine
     * > Auslassung: das Problem, das P8.3 löst, sind die 90 Frames der Messung,
     * > nicht der eine des Aufwärmens. Ob dieser eine Frame auf einem sehr
     * > schwachen Gerät tragbar ist, ist hier **nicht prüfbar** — im
     * > Software-Rasterisierer kostet er 274,4 ms, und was das für ein Telefon
     * > heißt, wäre geraten.
     */
    const startLevel = gespeichert ?? estimate.level;
    if (startLevel !== this.#level) {
      context.bus.on('engine:warmedup', () => {
        this.#emit(startLevel);
      });
    }

    this.#registerDebug(context);
    this.#updateReadouts();

    this.#emit(this.#level);
  }

  /**
   * Umschalten aus Code — `japanMap.quality('low')`. Zählt als Wahl von Hand.
   *
   * **Der Name wird geprüft, und zwar laut.** In P8.9 ist `quality('hoch')`
   * durchgelaufen: TypeScript sieht den Aufruf aus der Browser-Konsole nicht,
   * der Wert landete unbesehen im Ereignis, und danach warfen fünf Systeme
   * nacheinander `Cannot read properties of undefined` — `renderScale`,
   * `shadowMapSize`, `terrainGridVertices`, `reflections`, `ao`. Der Renderer
   * lief weiter und **sah normal aus**; nur die Konsole wusste Bescheid.
   *
   * Der Schaden war nicht der Absturz, sondern die Messung darauf: eine
   * Instanzzahl wurde einer Stufe zugeschrieben, die es nicht gab. Genau die
   * Art Zahl, vor der CLAUDE.md warnt — richtig abgelesen, an einem System
   * gemessen, das etwas anderes tat als beschrieben.
   */
  set(level: QualityKey): void {
    if (!(level in QUALITY)) {
      const bekannt = Object.keys(QUALITY).join(', ');
      throw new Error(`Unbekannte Qualitätsstufe „${String(level)}". Bekannt: ${bekannt}.`);
    }
    if (level === this.#level) return;
    this.#context?.bus.emit('quality:changed', { level });
  }

  /**
   * Einen oder mehrere Einzelregler stellen und auf „Eigen" umschalten — P10.2.
   *
   * **Warum das nicht über `set('custom')` läuft.** `set()` bricht ab, wenn die
   * Stufe schon gilt — richtig für eine Stufenwahl, fatal für einen Regler: wer
   * auf „Eigen" steht und die Auflösung verschiebt, sendet dann **nichts**, und
   * die Systeme behalten ihre alten Werte. Der Regler bewegte sich, das Bild
   * nicht. Genau die Sorte Fehler, die dieses Projekt schon zweimal als
   * „wirkungsloser Regler" gefunden hat (`viewDistance`, `shadowCascades`).
   *
   * Deshalb wird hier **immer** gesendet. Die Stufe hat sich inhaltlich
   * geändert, auch wenn ihr Name derselbe geblieben ist.
   */
  setCustom(patch: Partial<CustomQuality>): void {
    setCustomQuality(patch);
    this.#level = 'custom';
    this.#run = null;
    this.#readouts.einstufung = 'von Hand zusammengestellt';
    storeLevel('custom');
    this.#context?.bus.emit('quality:changed', { level: 'custom' });
    this.#updateReadouts();
  }

  /** Die eigene Stufe mit den Werten einer Voreinstellung füllen — Startpunkt der Regler. */
  seedCustomFrom(level: QualityKey): void {
    setCustomQuality(customFromSettings(QUALITY[level]));
  }

  /** Eine Stufe, die aus diesem System kommt — keine Wahl von Hand. */
  #emit(level: QualityKey): void {
    this.#internal = true;
    try {
      this.#context?.bus.emit('quality:changed', { level });
    } finally {
      this.#internal = false;
    }
  }

  /**
   * Die Ersteinstufung — PLAN.md P7 / 7.1, „automatische Ersteinstufung über
   * einen kurzen Benchmark beim ersten Start".
   *
   * Gemessen wird der Abstand zwischen zwei Frames, weil genau das die Frage
   * ist: hält die Maschine die Bildrate? Heruntergestuft wird eine Stufe pro
   * Runde, und nach jeder Änderung wird **neu gemessen** — eine Stufe ändert
   * Auflösung und Instanzzahl, die alte Messung gilt danach nicht mehr. Das ist
   * die Regel aus CLAUDE.md, hier als Schleife.
   *
   * Hochgestuft wird nie. Eine Regelung in beide Richtungen ist genau das, was
   * in diesem Projekt zweimal davongelaufen ist und beide Male ersatzlos
   * entfernt wurde: sie pendelt zwischen zwei Stufen, deren Kosten sich beim
   * Umschalten gegenseitig bedingen.
   */
  update(): void {
    const run = this.#run;
    const now = performance.now();
    const delta = now - this.#lastFrame;
    this.#lastFrame = now;
    if (!run) return;

    // Ein verdecktes Fenster bekommt rAF im Sekundentakt. Wer währenddessen
    // einstuft, misst den Browser und nicht die Maschine.
    if (document.hidden) {
      this.#finish('abgebrochen — Fenster war verdeckt');
      return;
    }

    if (run.rest > 0) {
      run.rest--;
      return;
    }

    run.samples.push(delta);
    if (run.samples.length < BENCHMARK.sampleFrames) return;

    const sorted = [...run.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const runde = run.runde;

    if (median > BENCHMARK.implausibleMs) {
      this.#finish(`abgebrochen — ${median.toFixed(0)} ms je Frame ist keine Messung`);
      return;
    }

    // **„Eigen" steht in dieser Leiter nicht** — `indexOf` gäbe −1, und
    // `QUALITY_LEVELS[0]` wäre Ultra: die Einstufung würde bei schlechter
    // Bildrate ausgerechnet **hoch**stufen. Erreichbar ist der Fall zwar nicht
    // (eine eigene Stufe beendet die Einstufung), aber ein Vorzeichenfehler,
    // der nur durch eine Bedingung anderswo unschädlich bleibt, ist kein
    // Zustand, den man stehen lässt.
    const index = QUALITY_LEVELS.indexOf(this.#level as QualityLevel);
    if (index < 0) {
      this.#finish('abgebrochen — eigene Stufe, keine Leiter');
      return;
    }
    const next = QUALITY_LEVELS[index + 1];
    if (median <= BENCHMARK.stepDownMs || !next) {
      const grund = median <= BENCHMARK.stepDownMs ? 'reicht' : 'niedrigste Stufe';
      this.#finish(`${QUALITY[this.#level].label} nach ${runde} Runde(n) · ` +
        `${median.toFixed(1)} ms je Frame — ${grund}`);
      storeLevel(this.#level);
      return;
    }

    console.info(
      `Einstufung: ${QUALITY[this.#level].label} liefert ${median.toFixed(1)} ms je Frame ` +
        `(> ${BENCHMARK.stepDownMs}) — eine Stufe herunter auf ${QUALITY[next].label}.`,
    );
    this.#run = { rest: BENCHMARK.warmupFrames, samples: [], runde: runde + 1 };
    this.#emit(next);
  }

  /**
   * Erneut einstufen — verwirft die gespeicherte Wahl.
   *
   * Beginnt bei der **geschätzten** Stufe, nicht bei `DEFAULT_QUALITY`. Sonst
   * wäre der Knopf im Panel genau der Blindstart auf Ultra, den P8.3 abschafft
   * — und zwar auf Verlangen des Nutzers, was ihn nicht besser macht. Die
   * Shader sind zu diesem Zeitpunkt längst übersetzt, der Aufwärmgrund von oben
   * entfällt hier also.
   */
  reclassify(): void {
    clearStoredLevel();
    this.#run = { rest: BENCHMARK.warmupFrames, samples: [], runde: 1 };
    this.#readouts.einstufung = 'läuft …';
    this.#emit(this.#estimate?.level ?? DEFAULT_QUALITY);
    this.#updateReadouts();
  }

  #finish(text: string): void {
    this.#run = null;
    this.#readouts.einstufung = text;
    this.#updateReadouts();
  }

  #updateReadouts(): void {
    const q = QUALITY[this.#level];
    this.#readouts.stufe = q.label;
    this.#readouts.wirkung =
      `Auflösung ${(q.renderScale * 100).toFixed(0)} % · Gitter ${q.terrainGridVertices}² · ` +
      `AO ${q.ao} · PostFX ${q.postFx} · ` +
      `Spiegelung ${q.reflections ? 'an' : 'aus'} · ` +
      // **In Metern, nicht als Faktor.** Die Zahl soll im Panel gegen das
      // gehalten werden können, was im Bild steht; „Reichweite 0,87" beantwortet
      // die Frage nicht, die man vor dem Bild hat. Bezugsgröße ist die größte
      // Ferngrenze aller Arten — ausgerechnet und nicht abgeschrieben, sonst
      // steht hier irgendwann eine Zahl, die `SPECIES` nicht mehr kennt.
      `Sicht ${(SPECIES_FAR_MAX * q.vegetationRange).toFixed(0)} m · ` +
      `LOD-Bias ${q.lodBias.toFixed(2)} · ` +
      `Vegetation voll bis ${q.vegetationFullRadius} m, fern ${(q.vegetationFarKeep * 100).toFixed(0)} %`;
    this.#context?.debug?.refresh();
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Qualität');
    if (!folder) return;

    folder.addBinding(this.#readouts, 'stufe', { readonly: true, label: 'Stufe' });
    folder.addBinding(this.#readouts, 'wirkung', {
      readonly: true,
      label: 'Wirkung',
      multiline: true,
      rows: 3,
    });
    folder.addBinding(this.#readouts, 'einstufung', {
      readonly: true,
      label: 'Einstufung',
      multiline: true,
      rows: 2,
    });
    folder.addBinding(this.#readouts, 'geraet', {
      readonly: true,
      label: 'Gerät',
      multiline: true,
      rows: 3,
    });

    folder.addButton({ title: 'Neu einstufen' }).on('click', () => {
      this.reclassify();
    });

    // Der Reihe nach durchschalten: für ein Vorher/Nachher braucht man alle
    // Stufen am selben Blickpunkt, und dafür ist ein Knopf schneller als ein
    // Aufklappmenü.
    folder.addButton({ title: 'Nächste Stufe' }).on('click', () => {
      // `indexOf` gibt bei ‚Eigen‘ −1 — dann beginnt der Durchlauf bei Ultra.
      const index = QUALITY_LEVELS.indexOf(this.#level as QualityLevel);
      const next = QUALITY_LEVELS[(index + 1) % QUALITY_LEVELS.length];
      if (next) this.set(next);
    });
  }

  dispose(): void {
    this.#run = null;
    this.#context = null;
  }
}

interface BenchmarkRun {
  /** Noch zu verwerfende Aufwärmframes. */
  rest: number;
  samples: number[];
  runde: number;
}

/**
 * Gespeicherte Einstufung.
 *
 * `localStorage` kann werfen — im privaten Modus mancher Browser und in einem
 * Iframe ohne Berechtigung schon beim Lesen. Ein Renderer, der daran scheitert,
 * wäre eine schlechte Bilanz für eine Bequemlichkeitsfunktion; deshalb ist jeder
 * Zugriff eingepackt und der Fehlerfall schlicht „nichts gespeichert".
 */
function readStoredLevel(): QualityKey | null {
  try {
    const raw = localStorage.getItem(BENCHMARK.storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { level, version, custom } = parsed as {
      level?: unknown;
      version?: unknown;
      custom?: unknown;
    };
    if (version !== BENCHMARK.storageVersion) return null;
    if (level === 'custom') {
      // **Die gespeicherten Werte gehen durch dieselbe Klemmung wie frische.**
      // Sie stammen aus einem früheren Programmstand, und dessen Grenzen sind
      // nicht die von heute — ein `terrainGridVertices`, das inzwischen nicht
      // mehr in `GRID_VERTICES_ALLOWED` steht, brächte die 207 Löcher aus P4
      // zurück, und zwar beim **Start**, ohne dass jemand einen Regler angefasst
      // hätte. `setCustomQuality` verwirft solche Felder einzeln und behält für
      // sie den Vorgabewert.
      if (typeof custom === 'object' && custom !== null) {
        setCustomQuality(custom as Partial<CustomQuality>);
        return 'custom';
      }
      return null;
    }
    return QUALITY_LEVELS.find((candidate) => candidate === level) ?? null;
  } catch {
    return null;
  }
}

function storeLevel(level: QualityKey): void {
  try {
    localStorage.setItem(
      BENCHMARK.storageKey,
      JSON.stringify({
        level,
        version: BENCHMARK.storageVersion,
        // Nur bei „Eigen" — sonst stünde neben einer Voreinstellung eine
        // Werteliste, die niemand liest und die beim nächsten Tabellenwechsel
        // still veraltet.
        ...(level === 'custom' ? { custom: customFromSettings(readCustomQuality()) } : {}),
      }),
    );
  } catch {
    // Ohne Speicher wird beim nächsten Start neu eingestuft. Das ist der
    // Rückfall, nicht ein Fehler.
  }
}

function clearStoredLevel(): void {
  try {
    localStorage.removeItem(BENCHMARK.storageKey);
  } catch {
    // siehe storeLevel
  }
}
