import type { EngineContext, System } from '@/core/System';
import blueHour from './blue-hour.json';
import { defaultLook, mergeLook, type LookState } from './lookState';

const STORAGE_KEY = 'japanmap.look';

/**
 * Look-Presets speichern und laden — PLAN.md P2 / 2.6.
 *
 * Der Controller kennt **kein** einziges der Systeme, deren Zustand er
 * speichert. Er schickt `look:collect` mit einem vorbefüllten Objekt los, jedes
 * System trägt seinen Abschnitt ein, und heraus fällt der vollständige Look.
 * Umgekehrt verteilt `look:apply` einen geladenen Zustand.
 *
 * Der Grund für diese Umständlichkeit: ab P3 kommen Straßen dazu, ab P6 die
 * Stadt mit ihren Lichtern. Jedes davon bringt Look-Parameter mit. Kennte der
 * Controller die Systeme, müsste er bei jedem neuen erweitert werden — so
 * bringt jedes System seinen Anteil selbst mit und meldet ihn an.
 *
 * Wird als **letztes** System registriert: `look:apply` beim Start darf erst
 * laufen, wenn alle Empfänger angemeldet sind.
 */
export class LookController implements System {
  readonly name = 'LookController';

  #context: EngineContext | null = null;
  #current: LookState = defaultLook();

  readonly #readouts = {
    aktuell: 'Standard',
  };

  init(context: EngineContext): void {
    this.#context = context;

    // Reihenfolge: erst das mitgelieferte Preset, dann — falls vorhanden — der
    // zuletzt selbst gespeicherte Stand. Wer am Look gedreht hat, findet ihn
    // nach dem Neuladen wieder; wer nie gedreht hat, sieht die Art Direction.
    this.#current = mergeLook(blueHour);
    const stored = this.#readStored();
    if (stored) this.#current = stored;

    this.#apply(this.#current);
    this.#registerDebug(context);
  }

  #readStored(): LookState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return mergeLook(JSON.parse(raw));
    } catch (error) {
      // Ein kaputter Eintrag darf den Start nicht verhindern — er wird
      // verworfen und beim nächsten Speichern überschrieben.
      console.warn('Gespeicherter Look nicht lesbar, Vorgabe wird verwendet.', error);
      return null;
    }
  }

  #apply(look: LookState): void {
    this.#context?.bus.emit('look:apply', { look });
    this.#readouts.aktuell = look.name;
  }

  /** Aktuellen Zustand aus allen Systemen einsammeln. */
  #collect(name: string): LookState {
    const target = defaultLook();
    target.name = name;
    this.#context?.bus.emit('look:collect', { target });
    return target;
  }

  #registerDebug(context: EngineContext): void {
    const folder = context.debug?.folder('Look');
    if (!folder) return;

    const state = { name: this.#current.name };

    folder.addBinding(this.#readouts, 'aktuell', { readonly: true, label: 'Geladen' });
    folder.addBinding(state, 'name', { label: 'Name' });

    folder.addButton({ title: 'Speichern (Browser)' }).on('click', () => {
      const look = this.#collect(state.name);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(look));
      this.#current = look;
      this.#readouts.aktuell = `${look.name} · gespeichert`;
    });

    folder.addButton({ title: 'Zurücksetzen' }).on('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      this.#current = mergeLook(blueHour);
      this.#apply(this.#current);
    });

    folder.addButton({ title: 'Als JSON exportieren' }).on('click', () => {
      const look = this.#collect(state.name);
      const url = URL.createObjectURL(
        new Blob([`${JSON.stringify(look, null, 2)}\n`], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${look.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    });

    folder.addButton({ title: 'JSON laden …' }).on('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        void file.text().then((text) => {
          try {
            this.#current = mergeLook(JSON.parse(text));
            this.#apply(this.#current);
            state.name = this.#current.name;
            context.debug?.refresh();
          } catch (error) {
            console.error('Look-Datei nicht lesbar.', error);
          }
        });
      });
      input.click();
    });

    // Nach `look:apply` stehen in den anderen Ordnern noch die alten Zahlen.
    // Ein Panel, das etwas anderes anzeigt als der Shader benutzt, ist
    // schlimmer als gar keins.
    folder.addButton({ title: 'Panel auffrischen' }).on('click', () => {
      context.debug?.refresh();
    });
  }

  dispose(): void {
    this.#context = null;
  }
}
