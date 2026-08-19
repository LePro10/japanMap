/**
 * Bestzeiten über Sitzungen hinweg — P16.
 *
 * ## Warum das der Unterschied zwischen Karte und Spiel ist
 *
 * `LapTimer` (P9.3) zählt Runden und kennt die beste — aber nur **innerhalb**
 * einer Sitzung, und ablesbar war sie allein im Debug-Panel, das im gebauten
 * Stand gar nicht existiert. Ein Besucher konnte also eine perfekte Runde
 * fahren, ohne es je zu erfahren; beim nächsten Laden war sie ohnehin weg.
 *
 * Eine gespeicherte Bestzeit ist das kleinste Stück Spielziel, das es gibt: sie
 * macht aus „hier kann man herumfahren" ein „das war 2,4 s schneller als
 * gestern". Für ein Portal wie CrazyGames ist genau das der Unterschied
 * zwischen einer Techdemo und etwas, wozu man wiederkommt.
 *
 * ## Gespeichert wird wenig und vorsichtig
 *
 * Ein Wert je Strecke, als JSON unter einem Schlüssel. Jeder Zugriff auf
 * `localStorage` steht in einem `try` — im privaten Modus mancher Browser wirft
 * schon das Lesen, und ein Spiel, das daran scheitert, ist ein Spiel, das für
 * diese Besucher nicht startet. Ohne Speicher gilt die Bestzeit eben nur für
 * diese Sitzung; das ist der richtige Rückfall, nicht ein Fehler.
 */

const STORAGE_KEY = 'japanmap.bestTimes';

/**
 * Obere Schranke für eine plausible Rundenzeit, in Sekunden.
 *
 * Gegen zwei Dinge zugleich: eine von Hand verbogene Speicherstelle, und eine
 * Runde, in der jemand zwanzig Minuten steht. Der Ring ist gemessen rund 3,4 km
 * lang; bei Schrittgeschwindigkeit wären das 40 Minuten, alles darüber ist
 * keine gefahrene Runde mehr.
 */
const MAX_PLAUSIBLE_S = 2400;

export class BestTimes {
  /** Strecke → beste Zeit in Sekunden. */
  #best = new Map<string, number>();

  constructor() {
    this.#load();
  }

  #load(): void {
    let roh: string | null = null;
    try {
      roh = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!roh) return;
    try {
      const daten: unknown = JSON.parse(roh);
      // **Der Inhalt wird geprüft, nicht geglaubt.** `localStorage` ist vom
      // Nutzer beschreibbar, und ein `NaN` oder eine Zeichenkette an dieser
      // Stelle liefe sonst bis in die Anzeige und in den Vergleich — wo
      // `zeit < NaN` immer falsch ist und damit **jede** Bestzeit verschluckt.
      // Genau die Klasse Fehler, die in P4 die Zonenmaske ein halbes Jahr lang
      // wirkungslos gemacht hat.
      if (typeof daten !== 'object' || daten === null) return;
      for (const [strecke, wert] of Object.entries(daten as Record<string, unknown>)) {
        if (typeof wert !== 'number' || !Number.isFinite(wert)) continue;
        if (wert <= 0 || wert > MAX_PLAUSIBLE_S) continue;
        this.#best.set(strecke, wert);
      }
    } catch {
      // Kaputtes JSON: wie „nichts gespeichert" behandeln. Ein Neuschreiben
      // passiert bei der nächsten gültigen Runde von selbst.
    }
  }

  #save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.#best)));
    } catch {
      // Voller oder gesperrter Speicher — die Zeit gilt dann für diese Sitzung.
    }
  }

  /** Beste Zeit einer Strecke in Sekunden, oder `null`. */
  get(roadId: string): number | null {
    return this.#best.get(roadId) ?? null;
  }

  /**
   * Eine gefahrene Zeit einreichen. Gibt zurück, ob sie eine neue Bestzeit ist.
   *
   * Der Rückgabewert ist die Schnittstelle für Ton und Anzeige: beide wollen
   * wissen, ob gefeiert wird, und keiner von beiden soll den Vergleich noch
   * einmal selbst anstellen — zwei Vergleiche sind zwei Gelegenheiten, sie
   * auseinanderlaufen zu lassen.
   */
  submit(roadId: string, seconds: number): boolean {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_PLAUSIBLE_S) return false;
    const bisher = this.#best.get(roadId);
    if (bisher !== undefined && bisher <= seconds) return false;
    this.#best.set(roadId, seconds);
    this.#save();
    return true;
  }

  /** Alles vergessen — für das Menü und für Prüfstände. */
  clear(): void {
    this.#best.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // s. o.
    }
  }
}

/** `83.42` → `1:23.42`. Dieselbe Form wie im `LapTimer`, damit nichts auffällt. */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : `${s.toFixed(2)}`;
}
