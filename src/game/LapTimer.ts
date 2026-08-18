import type { RoadNetwork } from '@/world/roads/RoadNetwork';

/**
 * Rundenzählung auf den Toren aus P8.11 — PLAN.md P9.3.
 *
 * ## Warum das der letzte offene Punkt von P9 war
 *
 * `RoadNetwork.getSectors()` liefert seit P8.11 Tore: Punkt, Fahrtrichtung und
 * halbe Fahrbahnbreite. **Ausgewertet hat sie nie jemand.** P9.3 stand seitdem
 * als einzige ungebaute Aufgabe der Fahrschicht in PLAN.md, und P14 hat sie
 * ausdrücklich ausgeklammert.
 *
 * ## Ein Tor ist eine Strecke, kein Körper
 *
 * Das war die Entscheidung in P8.11 und sie trägt hier: geprüft wird ein
 * **Vorzeichenwechsel** des Skalarprodukts gegen die Torrichtung, nicht ein
 * Treffer in einem Volumen. Ein Volumen hätte zwei Fehlerarten, die eine
 * Strecke nicht hat — bei hohem Tempo durchtunnelt das Fahrzeug es (bei
 * 250 km/h sind das 1,16 m je Schritt), und bei langsamer Fahrt darin zählt es
 * mehrfach.
 *
 * ## Was eine Abkürzung ausschließt — zwei Bedingungen, nicht eine
 *
 * Die Anforderung lautet: „ein Lauf quer über die Wiese darf keine gültige
 * Runde ergeben." Dafür reicht **keine** der beiden Prüfungen allein:
 *
 * 1. **Seitlicher Abstand ≤ halbe Fahrbahnbreite.** Ohne diese Bedingung wäre
 *    das Tor eine unendlich lange Linie quer durch die Landschaft, und wer
 *    hundert Meter neben der Straße daran vorbeifährt, hätte sie überquert.
 * 2. **Reihenfolge.** Ohne sie genügte es, am Start-Ziel-Tor hin und her zu
 *    fahren. Gezählt wird eine Runde erst, wenn **alle** Tore seit dem letzten
 *    Start in aufsteigender Folge gefallen sind.
 *
 * ## Die Zeit kommt aus dem Simulationsschritt, nicht von der Uhr
 *
 * `performance.now()` wäre bei einem Messlauf, der 3600 Schritte in 50 ms
 * treibt, sinnlos — und im Betrieb hinge die Rundenzeit an der Bildrate. Beides
 * ist derselbe Fehler: gemessen wird die **gefahrene** Zeit, also die Summe der
 * Zeitschritte.
 */

/**
 * Größter Positionssprung je Schritt, der noch als Fahrt gilt — in Metern.
 *
 * Alles darüber ist ein Versetzen (Respawn, Einsteigen, Blickpunkt) und keine
 * Bahn. Begründung der Zahl in `step()`.
 */
const MAX_STEP_M = 10;

export interface Gate {
  readonly index: number;
  /** Bogenlänge des Tors auf der Strecke, in Metern ab Streckenanfang. */
  readonly arc: number;
  readonly x: number;
  readonly z: number;
  /** Fahrtrichtung, normiert, in XZ. */
  readonly fx: number;
  readonly fz: number;
  readonly halfWidth: number;
}

export interface LapResult {
  /** Fortlaufend ab 1. */
  readonly lap: number;
  readonly seconds: number;
  /** Zeit je Abschnitt, in der Reihenfolge der Tore. */
  readonly splits: readonly number[];
}

export class LapTimer {
  #gates: Gate[] = [];
  /** Welche Strecke gezählt wird — für die Anzeige und für `japanMap.laps()`. */
  #roadId: string | null = null;

  /** Welches Tor als Nächstes fallen muss. 0 = Start-Ziel. */
  #next = 0;
  /** Gefahrene Zeit seit der letzten Überquerung von Tor 0. */
  #elapsed = 0;
  /** Zeitpunkte der Tore innerhalb der laufenden Runde. */
  #splits: number[] = [];
  #laps: LapResult[] = [];
  /** Läuft eine Runde? Erst nach der ersten Überquerung von Tor 0. */
  #running = false;

  #lastX = 0;
  #lastZ = 0;
  #havePrevious = false;

  readonly readouts = {
    strecke: '—',
    runde: '—',
    letzteZeit: '—',
    beste: '—',
    naechstesTor: '—',
  };

  get roadId(): string | null {
    return this.#roadId;
  }

  get gates(): readonly Gate[] {
    return this.#gates;
  }

  get laps(): readonly LapResult[] {
    return this.#laps;
  }

  get running(): boolean {
    return this.#running;
  }

  /** Gefahrene Zeit der laufenden Runde, in Sekunden. */
  get elapsed(): number {
    return this.#elapsed;
  }

  /**
   * Tore einer Strecke übernehmen.
   *
   * `count` ist die Zahl der Tore **einschließlich** Start-Ziel: bei 3 liegen
   * sie bei 0 %, 33 % und 67 % der Bogenlänge. Weniger als zwei ergäbe keine
   * Reihenfolgeprüfung und damit keinen Schutz gegen die Abkürzung.
   */
  setRoad(network: RoadNetwork, roadId: string, count = 3): boolean {
    const sectors = network.getSectors(roadId, Math.max(2, count));
    if (!sectors) {
      this.readouts.strecke = `${roadId} — nicht gefunden`;
      return false;
    }
    this.#gates = sectors.map((s) => ({
      index: s.index,
      arc: s.arc,
      x: s.position[0],
      z: s.position[2],
      fx: s.forward[0],
      fz: s.forward[1],
      halfWidth: s.halfWidth,
    }));
    this.#roadId = roadId;
    this.reset();
    this.readouts.strecke = `${roadId} · ${this.#gates.length} Tore`;
    return true;
  }

  reset(): void {
    this.#next = 0;
    this.#elapsed = 0;
    this.#splits = [];
    this.#laps = [];
    this.#running = false;
    this.#havePrevious = false;
    this.readouts.runde = '—';
    this.readouts.letzteZeit = '—';
    this.readouts.beste = '—';
    this.readouts.naechstesTor = this.#gates.length > 0 ? 'Start-Ziel' : '—';
  }

  /**
   * Einen Simulationsschritt verbuchen.
   *
   * Gibt die fertige Runde zurück, wenn in diesem Schritt eine zu Ende ging —
   * sonst `null`. **Der Rückgabewert ist die Schnittstelle**, nicht ein
   * Ereignis: der Messstand aus P14 treibt die Physik ohne Bus und ohne
   * Renderer, und eine Rundenlogik, die nur über den Bus meldet, wäre dort
   * nicht prüfbar.
   */
  step(x: number, z: number, dt: number): LapResult | null {
    if (this.#gates.length === 0) return null;

    if (!this.#havePrevious) {
      this.#lastX = x;
      this.#lastZ = z;
      this.#havePrevious = true;
      return null;
    }

    // ── Ein Sprung ist keine Fahrt ──────────────────────────────────────
    //
    // `DriveSystem.placeAt()` versetzt das Auto ohne Bahn dazwischen: Respawn,
    // Einsteigen, ein Blickpunkt im Menü. Liegt ein Tor zufällig zwischen alter
    // und neuer Stelle, sähe die Strecke von der einen zur anderen wie eine
    // saubere Durchfahrt aus — und ausgerechnet der Respawn setzt das Auto **auf
    // die Fahrbahn**, also genau dorthin, wo die Tore stehen.
    //
    // Gefunden hat das ein Prüffall, der zweimal rückwärts durchs Start-Ziel
    // fuhr: zwischen den beiden Durchfahrten lag der Rücksprung, und der zählte.
    // Der Fehler lag im Prüfstand — die Lücke im Zähler war trotzdem echt.
    //
    // 10 m sind bei 60 Hz ein Tempo von 2160 km/h. Das Fahrmodell erreicht
    // gemessen 255,8 km/h auf idealem Boden (1,18 m je Schritt), also liegt die
    // Schwelle achtfach über allem, was Fahren erzeugen kann.
    const dx = x - this.#lastX;
    const dz = z - this.#lastZ;
    if (dx * dx + dz * dz > MAX_STEP_M * MAX_STEP_M) {
      this.#lastX = x;
      this.#lastZ = z;
      // Die laufende Runde ist damit **ungültig**, nicht bloß unterbrochen: wer
      // sich versetzen lässt, hat die Strecke nicht gefahren. Bereits gezählte
      // Runden bleiben stehen.
      this.#running = false;
      this.#next = 0;
      this.#splits = [];
      this.#elapsed = 0;
      this.readouts.runde = 'ungültig — versetzt';
      this.readouts.naechstesTor = 'Start-Ziel';
      return null;
    }

    if (this.#running) this.#elapsed += dt;

    const gate = this.#gates[this.#next]!;
    const fertig = this.#crossed(gate, this.#lastX, this.#lastZ, x, z);

    this.#lastX = x;
    this.#lastZ = z;

    if (!fertig) return null;

    // ── Tor gefallen ────────────────────────────────────────────────────
    if (this.#next === 0) {
      let ergebnis: LapResult | null = null;
      if (this.#running) {
        // Alle Zwischentore sind gefallen (sonst stünde `#next` nicht auf 0),
        // also ist das hier eine vollständige Runde.
        ergebnis = {
          lap: this.#laps.length + 1,
          seconds: this.#elapsed,
          splits: [...this.#splits],
        };
        this.#laps.push(ergebnis);
        this.readouts.letzteZeit = format(ergebnis.seconds);
        const beste = Math.min(...this.#laps.map((l) => l.seconds));
        this.readouts.beste = format(beste);
      }
      // Neue Runde beginnt in demselben Schritt — die Zeit läuft ab hier.
      this.#running = true;
      this.#elapsed = 0;
      this.#splits = [];
      this.#next = this.#gates.length > 1 ? 1 : 0;
      this.readouts.runde = `${this.#laps.length + 1} läuft`;
      this.readouts.naechstesTor = `Tor ${this.#next}`;
      return ergebnis;
    }

    this.#splits.push(this.#elapsed);
    this.#next = (this.#next + 1) % this.#gates.length;
    this.readouts.naechstesTor = this.#next === 0 ? 'Start-Ziel' : `Tor ${this.#next}`;
    return null;
  }

  /**
   * Ist das Fahrzeug zwischen zwei Schritten durch dieses Tor gefahren?
   *
   * Drei Bedingungen, und die dritte ist die, die eine Abkürzung erledigt:
   *
   *  1. Das Skalarprodukt gegen die Torrichtung wechselt von **negativ nach
   *     nicht-negativ** — also Durchfahrt in Fahrtrichtung. Rückwärts zählt
   *     nicht, sonst ließe sich eine Runde durch Hin- und Herfahren erzeugen.
   *  2. Der Übergang liegt **in diesem Schritt** (`0 ≤ t ≤ 1`), nicht
   *     irgendwo auf der verlängerten Bahn.
   *  3. Am Übergangspunkt ist der seitliche Abstand zur Tormitte **kleiner als
   *     die halbe Fahrbahnbreite**. Ohne das wäre das Tor eine unendliche
   *     Linie quer durch die Landschaft.
   */
  #crossed(gate: Gate, x0: number, z0: number, x1: number, z1: number): boolean {
    const d0 = (x0 - gate.x) * gate.fx + (z0 - gate.z) * gate.fz;
    const d1 = (x1 - gate.x) * gate.fx + (z1 - gate.z) * gate.fz;
    if (!(d0 < 0 && d1 >= 0)) return false;

    const nenner = d1 - d0;
    // Kann nach der Bedingung oben nicht null sein; die Prüfung steht als
    // Absicherung gegen ein künftiges Umstellen der Vorzeichenlogik.
    if (nenner === 0) return false;
    const t = -d0 / nenner;
    if (t < 0 || t > 1) return false;

    const sx = x0 + (x1 - x0) * t;
    const sz = z0 + (z1 - z0) * t;
    // Rechtsnormale zu (fx, fz) in XZ. Vorzeichen ist gleichgültig, gemessen
    // wird der Betrag.
    const seitlich = Math.abs((sx - gate.x) * -gate.fz + (sz - gate.z) * gate.fx);
    return seitlich <= gate.halfWidth;
  }
}

function format(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : `${s.toFixed(2)} s`;
}
