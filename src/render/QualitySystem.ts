import {
  DEFAULT_QUALITY,
  QUALITY,
  QUALITY_LEVELS,
  type QualityLevel,
} from '@/config/quality.config';
import type { EngineContext, System } from '@/core/System';

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
  #level: QualityLevel;

  readonly #readouts = {
    stufe: '—',
    wirkung: '—',
  };

  constructor(level: QualityLevel = DEFAULT_QUALITY) {
    this.#level = level;
  }

  get level(): QualityLevel {
    return this.#level;
  }

  init(context: EngineContext): void {
    this.#context = context;

    // Zuhören **und** senden: die Stufe kann von überall geändert werden (Panel,
    // Konsole, ab 7.1b der Startbenchmark). Wer sie ändert, sendet das Ereignis;
    // dieses System führt nur Buch darüber, was gerade gilt.
    context.bus.on('quality:changed', ({ level }) => {
      this.#level = level;
      this.#updateReadouts();
    });

    this.#registerDebug(context);
    this.#updateReadouts();

    context.bus.emit('quality:changed', { level: this.#level });
  }

  /** Umschalten aus Code — `japanMap.quality('low')`. */
  set(level: QualityLevel): void {
    if (level === this.#level) return;
    this.#context?.bus.emit('quality:changed', { level });
  }

  #updateReadouts(): void {
    const q = QUALITY[this.#level];
    this.#readouts.stufe = q.label;
    this.#readouts.wirkung =
      `Auflösung ${(q.renderScale * 100).toFixed(0)} % · AO ${q.ao} · ` +
      `Spiegelung ${q.reflections ? 'an' : 'aus'} · Sicht ${q.viewDistance} m · ` +
      `Vegetation ${(q.vegetationDensity * 100).toFixed(0)} %`;
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

    // Der Reihe nach durchschalten: für ein Vorher/Nachher braucht man alle vier
    // Stufen am selben Blickpunkt, und dafür ist ein Knopf schneller als ein
    // Aufklappmenü.
    folder.addButton({ title: 'Nächste Stufe' }).on('click', () => {
      const index = QUALITY_LEVELS.indexOf(this.#level);
      const next = QUALITY_LEVELS[(index + 1) % QUALITY_LEVELS.length];
      if (next) this.set(next);
    });
  }

  dispose(): void {
    this.#context = null;
  }
}
