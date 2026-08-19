import { formatTime } from '@/game/BestTimes';
import type { LapResult } from '@/game/LapTimer';
import type { VehicleTelemetry } from '@/game/Vehicle';

/**
 * Die Anzeige im Fahrmodus — P16.
 *
 * ## Der Befund
 *
 * Die Rundenzählung aus P9.3 war vollständig gebaut und **für einen Spieler
 * unsichtbar**: ihre Ablesewerte hingen im Tweakpane-Ordner „Runden", und
 * Tweakpane kommt im gebauten Stand nicht vor (P13 hat das ausdrücklich
 * gemessen: null Treffer in `dist/assets/*.js`). Wer das Spiel auf einem Portal
 * öffnete, konnte also Runden fahren, ohne je eine Zeit zu sehen.
 *
 * Dasselbe galt fürs Tempo. Ein Fahrspiel ohne Tacho ist kein Fahrspiel.
 *
 * ## Warum DOM und nicht in den Frame gezeichnet
 *
 * Eine Zahl, die sich je Frame ändert, in die 3D-Szene zu zeichnen hieße:
 * Schriftatlas, eigenes Material, ein Draw-Call je Ziffer — und sie stünde
 * gegen das Draw-Call-Budget aus SPEC §4. Als DOM kostet sie **null**
 * Draw-Calls und skaliert von selbst mit der Gerätepixeldichte.
 *
 * Der Preis steht in CLAUDE.md und gilt hier genauso: `japanMap.shot()` liest
 * den WebGL-Puffer und zeigt dieses HUD deshalb **nicht**. Geprüft wird es
 * strukturell (`getComputedStyle`, `elementFromPoint`, `textContent`), nicht am
 * Bild.
 *
 * ## Aktualisiert wird nicht jeder Frame
 *
 * `textContent` zu setzen erzwingt Layout. Bei 60 Hz × vier Feldern ist das
 * messbar und obendrein sinnlos: eine Hundertstelsekunde, die 60-mal je Sekunde
 * springt, ist unlesbar. Geschrieben wird deshalb nur, wenn sich der **Text**
 * ändert (`#setText`), und die Zeit läuft mit zwei Nachkommastellen.
 */
export class DriveHud {
  readonly #root: HTMLElement;
  readonly #speed: HTMLElement;
  readonly #gear: HTMLElement;
  readonly #lapTime: HTMLElement;
  readonly #best: HTMLElement;
  readonly #gate: HTMLElement;
  readonly #flash: HTMLElement;

  /** Zuletzt geschriebener Text je Feld — spart das Layout, s. o. */
  readonly #written = new Map<HTMLElement, string>();

  #flashTimer: number | null = null;
  #visible = false;
  #driveActive = false;
  #menuOpen = false;

  constructor(container: HTMLElement) {
    this.#root = document.createElement('div');
    this.#root.className = 'hud';
    this.#root.hidden = true;
    this.#root.innerHTML = `
      <div class="hud__lap">
        <p class="hud__row"><span class="hud__label">Runde</span><span class="hud__time" data-hud="lap">—</span></p>
        <p class="hud__row"><span class="hud__label">Beste</span><span class="hud__best" data-hud="best">—</span></p>
        <p class="hud__gate" data-hud="gate">—</p>
      </div>
      <div class="hud__speedo">
        <span class="hud__speed" data-hud="speed">0</span>
        <span class="hud__unit">km/h</span>
        <span class="hud__gearLabel" data-hud="gear"></span>
      </div>
      <div class="hud__flash" data-hud="flash" hidden></div>`;
    container.appendChild(this.#root);

    this.#speed = this.#must('[data-hud="speed"]');
    this.#gear = this.#must('[data-hud="gear"]');
    this.#lapTime = this.#must('[data-hud="lap"]');
    this.#best = this.#must('[data-hud="best"]');
    this.#gate = this.#must('[data-hud="gate"]');
    this.#flash = this.#must('[data-hud="flash"]');
  }

  /**
   * Es gibt **zwei unabhängige Gründe**, das HUD zu verbergen, und sie kommen
   * aus zwei verschiedenen Richtungen: kein Fahrmodus (aus `drive:mode`, über
   * `main.ts`) und offenes Menü (aus `PlayerUi.#render()`).
   *
   * Beide setzen ihr **eigenes** Feld, und die Sichtbarkeit wird daraus
   * gerechnet. Ein gemeinsames `setVisible(boolean)` hätte den Fall „Menü im
   * Auto geöffnet und wieder geschlossen" verloren: das Schließen des Menüs
   * hätte das HUD auch dann eingeblendet, wenn inzwischen ausgestiegen wurde.
   * Genau diese Klasse Fehler — ein Zustand aus zwei Quellen in einer Variablen
   * — hat dieses Projekt schon bei der Stufenwahl und beim Stick gekostet.
   */
  setDriveActive(active: boolean): void {
    this.#driveActive = active;
    this.#apply();
  }

  setMenuOpen(open: boolean): void {
    this.#menuOpen = open;
    this.#apply();
  }

  #apply(): void {
    this.#visible = this.#driveActive && !this.#menuOpen;
    this.#root.hidden = !this.#visible;
  }

  get visible(): boolean {
    return this.#visible;
  }

  /**
   * Je Frame aus der Telemetrie nachführen.
   *
   * `elapsed` und `best` kommen von außen und nicht aus dem `LapTimer`: dieses
   * HUD soll die **gespeicherte** Bestzeit zeigen, nicht die der laufenden
   * Sitzung, und die wohnt in `BestTimes`.
   */
  update(t: VehicleTelemetry, elapsed: number, running: boolean, best: number | null): void {
    if (!this.#visible) return;

    // `Math.round` und nicht `toFixed(0)`: Letzteres liefert bei −0.4 die
    // Zeichenkette „-0", und ein Tacho, der minus null anzeigt, sieht kaputt aus.
    const kmh = Math.round(Math.abs(t.forwardSpeed) * 3.6);
    this.#setText(this.#speed, String(kmh));
    // Rückwärts ist eine eigene Angabe und keine negative Zahl — dieselbe
    // Überlegung wie beim Tacho darüber.
    this.#setText(this.#gear, t.forwardSpeed < -0.5 ? 'R' : '');

    this.#setText(this.#lapTime, running ? formatTime(elapsed) : '—');
    this.#setText(this.#best, best === null ? '—' : formatTime(best));
  }

  /** Welches Tor als Nächstes fällt — kommt aus den Ablesewerten des `LapTimer`. */
  setGate(text: string): void {
    this.#setText(this.#gate, text);
  }

  /**
   * Eine fertige Runde melden.
   *
   * Der Kasten bleibt drei Sekunden stehen. Ein bestehender Zeitgeber wird
   * dabei **abgeräumt** — wer zwei Runden in kurzem Abstand fährt, soll nicht
   * erleben, dass der erste Zeitgeber die zweite Meldung wegräumt.
   */
  showLap(result: LapResult, best: boolean): void {
    this.#flash.textContent = best
      ? `Bestzeit! ${formatTime(result.seconds)}`
      : `Runde ${result.lap} · ${formatTime(result.seconds)}`;
    this.#flash.classList.toggle('hud__flash--best', best);
    this.#flash.hidden = false;

    if (this.#flashTimer !== null) window.clearTimeout(this.#flashTimer);
    this.#flashTimer = window.setTimeout(() => {
      this.#flash.hidden = true;
      this.#flashTimer = null;
    }, 3000);
  }

  #setText(element: HTMLElement, text: string): void {
    if (this.#written.get(element) === text) return;
    this.#written.set(element, text);
    element.textContent = text;
  }

  #must(selector: string): HTMLElement {
    const element = this.#root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`HUD: "${selector}" fehlt.`);
    return element;
  }

  dispose(): void {
    if (this.#flashTimer !== null) window.clearTimeout(this.#flashTimer);
    this.#flashTimer = null;
    this.#written.clear();
    this.#root.remove();
  }
}
