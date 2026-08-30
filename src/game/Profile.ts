import { DEFAULT_VEHICLE, VEHICLE_ORDER, type VehicleId } from '@/config/vehicles.config';

/**
 * Der Fortschritt eines Spielers — P23.
 *
 * ## Warum es ihn braucht
 *
 * `BestTimes` (P16) speichert eine Zahl je Strecke und war das kleinste Stück
 * Spielziel, das es gibt. Was fehlt, ist der **Grund**, ein zweites Rennen zu
 * fahren, nachdem man das erste gewonnen hat. Auf einem Portal ist das eine
 * Währung und eine Liste von Dingen, die man dafür bekommt — nicht weil Geld
 * interessant wäre, sondern weil eine Zahl, die zwischen zwei Sitzungen
 * überlebt, aus einer Fahrt eine *Investition* macht.
 *
 * ## Was gespeichert wird
 *
 * Vier Dinge, und mehr sollen es nicht werden: Kontostand, freigeschaltete
 * Fahrzeuge, Bestzeit je Veranstaltung, Höchstpunktzahl je Driftlauf. Alles
 * andere (Qualitätsstufe, Debug-Schalter, Bestzeit je *Straße*) hat schon einen
 * eigenen Schlüssel und behält ihn — ein Sammelobjekt, in das alles wandert,
 * ist beim nächsten Format-Wechsel ein Datenverlust.
 *
 * ## Gelesen wird vorsichtig
 *
 * Dieselbe Regel wie in `BestTimes`, und aus demselben Grund: `localStorage` ist
 * vom Nutzer beschreibbar, jeder Zugriff steht in einem `try` (im privaten Modus
 * mancher Browser wirft schon das Lesen), und **jeder Wert wird geprüft, nicht
 * geglaubt**. Ein `NaN` an dieser Stelle liefe bis in den Vergleich, wo
 * `preis <= NaN` immer falsch ist — genau die Klasse Fehler, die in P4 die
 * Zonenmaske ein halbes Jahr lang wirkungslos gemacht hat.
 *
 * > **Und Schummeln ist ausdrücklich erlaubt.** Wer seinen Kontostand im
 * > Speicher hochsetzt, schaltet sich Autos frei. Das ist ein Einzelspieler-Spiel
 * > ohne Bestenliste; eine Absicherung dagegen kostet einen Server und schützt
 * > niemanden vor irgendetwas.
 */

const STORAGE_KEY = 'japanmap.profile';

/** Obere Schranke für einen plausiblen Kontostand — gegen kaputte Daten. */
const MAX_YEN = 99_999_999;
/** Obere Schranke für eine plausible Zeit, in Sekunden. Wie in `BestTimes`. */
const MAX_PLAUSIBLE_S = 2400;

/**
 * Was ein Fahrzeug kostet.
 *
 * **Das Coupé ist frei**, und das ist die wichtigste Zeile: ein Spieler, der auf
 * einem Portal landet, muss innerhalb von Sekunden fahren. Eine Fahrzeugwahl vor
 * der ersten Fahrt ist eine Hürde, kein Angebot.
 *
 * Die Preise sind an den Belohnungen bemessen (`EVENTS[*].reward`): ein
 * gewonnenes Rennen bringt 2500…3000 ¥, ein Drift-Lauf je nach Können 1000…6000.
 * Der Offroader ist damit nach rund drei gewonnenen Rennen fällig, der GT nach
 * acht. Das ist die Größenordnung, in der ein Freischalten sich verdient anfühlt,
 * ohne zur Arbeit zu werden.
 */
export const VEHICLE_PRICE: Readonly<Record<VehicleId, number>> = {
  touge: 0,
  offroad: 9_000,
  gt: 24_000,
  truck: 15_000,
};

interface Stored {
  yen: number;
  owned: string[];
  bestByEvent: Record<string, number>;
  driftByEvent: Record<string, number>;
}

export class Profile {
  #yen = 0;
  #owned = new Set<VehicleId>([DEFAULT_VEHICLE]);
  #best = new Map<string, number>();
  #drift = new Map<string, number>();
  #listeners: (() => void)[] = [];

  constructor() {
    this.#load();
  }

  onChange(fn: () => void): void {
    this.#listeners.push(fn);
  }

  #notify(): void {
    for (const fn of this.#listeners) fn();
  }

  get yen(): number {
    return this.#yen;
  }

  owns(id: VehicleId): boolean {
    return this.#owned.has(id);
  }

  get ownedCount(): number {
    return this.#owned.size;
  }

  earn(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.#yen = Math.min(MAX_YEN, this.#yen + Math.round(amount));
    this.#save();
    this.#notify();
  }

  /** Ein Fahrzeug kaufen. Gibt zurück, ob es geklappt hat. */
  buy(id: VehicleId): boolean {
    if (this.#owned.has(id)) return false;
    const price = VEHICLE_PRICE[id];
    if (this.#yen < price) return false;
    this.#yen -= price;
    this.#owned.add(id);
    this.#save();
    this.#notify();
    return true;
  }

  bestOf(eventId: string): number | null {
    return this.#best.get(eventId) ?? null;
  }

  driftBestOf(eventId: string): number {
    return this.#drift.get(eventId) ?? 0;
  }

  /**
   * Eine Zeit einreichen. Gibt zurück, ob sie eine neue Bestzeit ist.
   *
   * Der Rückgabewert ist die Schnittstelle für Ton und Anzeige — dieselbe
   * Bauart wie `BestTimes.submit()`: zwei getrennte Vergleiche wären zwei
   * Gelegenheiten, sie auseinanderlaufen zu lassen.
   */
  submitTime(eventId: string, seconds: number): boolean {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_PLAUSIBLE_S) return false;
    const before = this.#best.get(eventId);
    if (before !== undefined && before <= seconds) return false;
    this.#best.set(eventId, seconds);
    this.#save();
    this.#notify();
    return true;
  }

  submitDrift(eventId: string, score: number): boolean {
    if (!Number.isFinite(score) || score <= 0) return false;
    const before = this.#drift.get(eventId) ?? 0;
    if (before >= score) return false;
    this.#drift.set(eventId, Math.round(score));
    this.#save();
    this.#notify();
    return true;
  }

  reset(): void {
    this.#yen = 0;
    this.#owned = new Set<VehicleId>([DEFAULT_VEHICLE]);
    this.#best.clear();
    this.#drift.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // s. Kopf.
    }
    this.#notify();
  }

  #load(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const data: unknown = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) return;
      const d = data as Partial<Stored>;
      if (typeof d.yen === 'number' && Number.isFinite(d.yen) && d.yen >= 0) {
        this.#yen = Math.min(MAX_YEN, Math.floor(d.yen));
      }
      if (Array.isArray(d.owned)) {
        for (const id of d.owned) {
          if (typeof id === 'string' && (VEHICLE_ORDER as readonly string[]).includes(id)) {
            this.#owned.add(id as VehicleId);
          }
        }
      }
      readTimes(d.bestByEvent, this.#best, MAX_PLAUSIBLE_S);
      readTimes(d.driftByEvent, this.#drift, Number.MAX_SAFE_INTEGER);
    } catch {
      // Kaputtes JSON: wie „nichts gespeichert" behandeln.
    }
  }

  #save(): void {
    const data: Stored = {
      yen: this.#yen,
      owned: [...this.#owned],
      bestByEvent: Object.fromEntries(this.#best),
      driftByEvent: Object.fromEntries(this.#drift),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Voller oder gesperrter Speicher — der Fortschritt gilt für diese Sitzung.
    }
  }
}

function readTimes(
  source: Record<string, number> | undefined,
  target: Map<string, number>,
  max: number,
): void {
  if (typeof source !== 'object' || source === null) return;
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (value <= 0 || value > max) continue;
    target.set(key, value);
  }
}
