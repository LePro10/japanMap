import { formatTime } from '@/game/BestTimes';
import type { DriftState } from '@/game/DriftScore';
import type { LapResult } from '@/game/LapTimer';
import type { RaceStanding } from '@/game/RaceDirector';
import type { VehicleTelemetry } from '@/game/Vehicle';
import type { RoadFile } from '@/config/roads.config';
import { MiniMap, type MiniMapMark } from './MiniMap';

/**
 * Die Anzeige im Fahrmodus — P16, in P23 auf das Spiel erweitert.
 *
 * ## Der Befund von P16
 *
 * Die Rundenzählung aus P9.3 war vollständig gebaut und **für einen Spieler
 * unsichtbar**: ihre Ablesewerte hingen im Tweakpane-Ordner „Runden", und
 * Tweakpane kommt im gebauten Stand nicht vor. Wer das Spiel auf einem Portal
 * öffnete, konnte Runden fahren, ohne je eine Zeit zu sehen. Dasselbe galt fürs
 * Tempo — ein Fahrspiel ohne Tacho ist kein Fahrspiel.
 *
 * ## Was P23 dazugelegt hat
 *
 * Alles, was ein **Rennen** ausmacht: Platzierung, Runde, Kontrollpunkt,
 * Countdown, Driftwertung, Nitro-Balken und die Auswertung am Ende. Sie sind
 * derselbe Streifen und nicht ein zweites HUD — zwei Overlays übereinander sind
 * zwei Sichtbarkeitszustände, und dieses Projekt hat mit „ein Zustand aus zwei
 * Quellen in einer Variablen" schon dreimal Zeit verloren.
 *
 * ## Die Sprache ist Englisch, der Code bleibt Deutsch
 *
 * Die Trennlinie verläuft am DOM. Alles, was ein Spieler liest, ist englisch;
 * CrazyGames' Publikum ist global, und eine deutschsprachige Oberfläche kostet
 * dort den größten Teil der Reichweite. Kommentare, Bezeichner und
 * Ereignisnamen bleiben deutsch — sie gehören zur Doku dieses Projekts.
 *
 * ## Warum DOM und nicht in den Frame gezeichnet
 *
 * Eine Zahl, die sich je Frame ändert, in die 3D-Szene zu zeichnen hieße:
 * Schriftatlas, eigenes Material, ein Draw-Call je Ziffer — und sie stünde gegen
 * das Draw-Call-Budget aus SPEC §4. Als DOM kostet sie **null** Draw-Calls und
 * skaliert von selbst mit der Gerätepixeldichte.
 *
 * Der Preis steht in CLAUDE.md und gilt hier genauso: `japanMap.shot()` liest
 * den WebGL-Puffer und zeigt dieses HUD deshalb **nicht**. Geprüft wird es
 * strukturell (`getComputedStyle`, `elementFromPoint`, `textContent`).
 *
 * ## Aktualisiert wird nicht jeder Frame
 *
 * `textContent` zu setzen erzwingt Layout. Bei 60 Hz × zwölf Feldern ist das
 * messbar und obendrein sinnlos: eine Hundertstelsekunde, die 60-mal je Sekunde
 * springt, ist unlesbar. Geschrieben wird deshalb nur, wenn sich der **Text**
 * ändert (`#setText`).
 */
export class DriveHud {
  readonly #root: HTMLElement;
  readonly #speed: HTMLElement;
  readonly #gear: HTMLElement;
  readonly #lapTime: HTMLElement;
  readonly #best: HTMLElement;
  readonly #gate: HTMLElement;
  readonly #flash: HTMLElement;
  readonly #boostFill: HTMLElement;
  readonly #boostBox: HTMLElement;
  readonly #drift: HTMLElement;
  readonly #driftPoints: HTMLElement;
  readonly #driftMult: HTMLElement;
  readonly #driftBanked: HTMLElement;
  readonly #race: HTMLElement;
  readonly #racePlace: HTMLElement;
  readonly #raceLap: HTMLElement;
  readonly #raceNext: HTMLElement;
  readonly #countdown: HTMLElement;
  readonly #result: HTMLElement;
  readonly #money: HTMLElement;
  readonly #arrow: HTMLElement;
  readonly #map: MiniMap;
  #arrowDeg = 999;

  /** Zuletzt geschriebener Text je Feld — spart das Layout, s. o. */
  readonly #written = new Map<HTMLElement, string>();

  #flashTimer: number | null = null;
  #visible = false;
  #driveActive = false;
  #menuOpen = false;
  #driftShown = false;

  constructor(container: HTMLElement) {
    this.#root = document.createElement('div');
    this.#root.className = 'hud';
    this.#root.hidden = true;
    this.#root.innerHTML = `
      <div class="hud__lap">
        <p class="hud__row"><span class="hud__label">Time</span><span class="hud__time" data-hud="lap">—</span></p>
        <p class="hud__row"><span class="hud__label">Best</span><span class="hud__best" data-hud="best">—</span></p>
        <p class="hud__gate" data-hud="gate">—</p>
      </div>
      <div class="hud__race" data-hud="race" hidden>
        <p class="hud__place" data-hud="place">P1</p>
        <p class="hud__raceRow"><span class="hud__label">Lap</span><span data-hud="raceLap">1 / 1</span></p>
        <p class="hud__raceRow"><span class="hud__label">Next</span><span data-hud="raceNext">—</span></p>
      </div>
      <div class="hud__money" data-hud="money">¥0</div>
      <div class="hud__drift" data-hud="drift" hidden>
        <span class="hud__driftPoints" data-hud="driftPoints">0</span>
        <span class="hud__driftMult" data-hud="driftMult">x1.0</span>
        <span class="hud__driftBanked" data-hud="driftBanked">0</span>
      </div>
      <div class="hud__speedo">
        <div class="hud__boost" data-hud="boostBox"><i class="hud__boostFill" data-hud="boostFill"></i></div>
        <div class="hud__speedRow">
          <span class="hud__speed" data-hud="speed">0</span>
          <span class="hud__unit">km/h</span>
          <span class="hud__gearLabel" data-hud="gear"></span>
        </div>
      </div>
      <div class="hud__nav">
        <div class="hud__arrow" data-hud="arrow" hidden><i></i></div>
      </div>
      <div class="hud__countdown" data-hud="countdown" hidden>3</div>
      <div class="hud__result" data-hud="result" hidden></div>
      <div class="hud__flash" data-hud="flash" hidden></div>`;
    container.appendChild(this.#root);

    this.#speed = this.#must('[data-hud="speed"]');
    this.#gear = this.#must('[data-hud="gear"]');
    this.#lapTime = this.#must('[data-hud="lap"]');
    this.#best = this.#must('[data-hud="best"]');
    this.#gate = this.#must('[data-hud="gate"]');
    this.#flash = this.#must('[data-hud="flash"]');
    this.#boostFill = this.#must('[data-hud="boostFill"]');
    this.#boostBox = this.#must('[data-hud="boostBox"]');
    this.#drift = this.#must('[data-hud="drift"]');
    this.#driftPoints = this.#must('[data-hud="driftPoints"]');
    this.#driftMult = this.#must('[data-hud="driftMult"]');
    this.#driftBanked = this.#must('[data-hud="driftBanked"]');
    this.#race = this.#must('[data-hud="race"]');
    this.#racePlace = this.#must('[data-hud="place"]');
    this.#raceLap = this.#must('[data-hud="raceLap"]');
    this.#raceNext = this.#must('[data-hud="raceNext"]');
    this.#countdown = this.#must('[data-hud="countdown"]');
    this.#result = this.#must('[data-hud="result"]');
    this.#money = this.#must('[data-hud="money"]');
    this.#arrow = this.#must('[data-hud="arrow"]');
    this.#map = new MiniMap(this.#must('.hud__nav'));
  }

  /**
   * Das Straßennetz für die Minikarte — einmal, aus `roads:ready`.
   *
   * Hereingereicht und nicht selbst geholt: dieses HUD hat keinen Bus, und das
   * ist Absicht. Es zeigt an, es sucht sich nichts.
   */
  setNetwork(file: RoadFile | null): void {
    this.#map.setNetwork(file);
  }

  /**
   * Minikarte und Richtungspfeil — P25.
   *
   * ## Warum der Pfeil relativ zur **Kamera** zeigt und nicht zum Fahrzeug
   *
   * Man sieht die Welt durch die Kamera, nicht durch die Motorhaube. Im Drift
   * steht der Wagen bis zu 60° quer; ein Pfeil, der gegen den Gierwinkel
   * gerechnet ist, schwenkt dann um 60°, ohne dass sich am Bild etwas geändert
   * hätte. Er würde also den Schwimmwinkel anzeigen und nicht den Weg.
   *
   * ## Und warum er im Leerlauf verschwindet
   *
   * Ohne Veranstaltung gibt es kein Ziel. Ein Pfeil, der dann irgendwohin zeigt
   * — auf den Startpunkt, auf die Streckenmitte —, ist schlimmer als keiner:
   * er behauptet eine Aufgabe, die es nicht gibt.
   */
  updateNav(
    x: number,
    z: number,
    heading: number,
    cameraHeading: number,
    rivals: readonly MiniMapMark[],
    target: MiniMapMark | null,
    dt: number,
  ): void {
    if (!this.#visible) return;
    // `dt` reicht bis in die Karte durch: sie zeichnet nicht je Frame neu,
    // sondern mit 15 Hz — Begründung in `MiniMap.update()`.
    this.#map.update(x, z, heading, rivals, target, dt);

    if (!target) {
      if (!this.#arrow.hidden) this.#arrow.hidden = true;
      return;
    }
    if (this.#arrow.hidden) this.#arrow.hidden = false;
    // Peilung in Weltkoordinaten, dieselbe Konvention wie überall:
    // `forward = (sin ψ, 0, cos ψ)`, also `ψ = atan2(dx, dz)`.
    const bearing = Math.atan2(target.x - x, target.z - z);
    let rel = bearing - cameraHeading;
    // Auf −π…π bringen — sonst dreht der Pfeil an der Naht einmal ganz herum.
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    const deg = Math.round((rel * 180) / Math.PI);
    if (deg !== this.#arrowDeg) {
      this.#arrowDeg = deg;
      this.#arrow.style.transform = `rotate(${deg}deg)`;
    }
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

    // ── Nitro ─────────────────────────────────────────────────────────────
    //
    // Über `style.width` und **nicht** über `textContent`: ein Balken ist die
    // einzige Anzeige, die man im Augenwinkel liest, und genau dafür ist er da.
    // Die Breite wird auf ganze Prozent gerundet — sonst schreibt jeder Frame
    // einen neuen Stilwert, und das ist derselbe Layout-Aufwand, den `#setText`
    // gerade vermeidet.
    const pct = Math.round(t.boost * 100);
    if (pct !== this.#boostPct) {
      this.#boostPct = pct;
      this.#boostFill.style.width = `${pct}%`;
    }
    this.#boostBox.classList.toggle('hud__boost--live', t.boosting);
    this.#boostBox.classList.toggle('hud__boost--ready', !t.boosting && t.boost > 0.98);
  }

  #boostPct = -1;

  /**
   * Die Driftwertung — sie erscheint nur, während eine Kette läuft.
   *
   * **Erscheinen und Verschwinden über `hidden` und nicht über Deckkraft.** Ein
   * Element mit `opacity: 0` liegt weiter im Layout und wird weiter beschriftet;
   * bei einer Anzeige, die 90 % der Zeit nichts zeigt, ist das 90 % Arbeit für
   * nichts.
   */
  setDrift(state: DriftState): void {
    if (!this.#visible) return;
    const show = state.active || state.pending > 0;
    if (show !== this.#driftShown) {
      this.#driftShown = show;
      this.#drift.hidden = !show;
    }
    if (!show) return;
    this.#setText(this.#driftPoints, String(Math.round(state.pending)));
    this.#setText(this.#driftMult, `x${state.multiplier.toFixed(1)}`);
    this.#setText(this.#driftBanked, state.banked > 0 ? `+${Math.round(state.banked)}` : '');
    this.#drift.classList.toggle('hud__drift--hot', state.multiplier > 2.5);
  }

  /** Eine beendete Kette melden — gutgeschrieben oder verloren. */
  driftEnded(state: DriftState): void {
    if (state.lastChain < 100) return;
    if (state.lastBreak === 'banked') {
      this.#showFlash(`+${state.lastChain} DRIFT`, true);
    } else {
      this.#showFlash(`${state.lastChain} LOST`, false);
    }
  }

  /** Der Rennstreifen — Platz, Runde, nächster Kontrollpunkt. */
  setRace(
    standings: readonly RaceStanding[],
    lap: number,
    laps: number,
    distance: number,
    checkpointsLeft: number,
  ): void {
    if (!this.#visible) return;
    if (this.#race.hidden) this.#race.hidden = false;
    const place = standings.findIndex((row) => row.isPlayer) + 1;
    this.#setText(this.#racePlace, `P${place}`);
    this.#racePlace.classList.toggle('hud__place--lead', place === 1);
    this.#setText(this.#raceLap, `${Math.min(lap, laps)} / ${laps}`);
    this.#setText(
      this.#raceNext,
      distance < 0 ? '—' : `${Math.round(distance)} m · ${checkpointsLeft} left`,
    );
  }

  hideRace(): void {
    if (!this.#race.hidden) this.#race.hidden = true;
    if (!this.#countdown.hidden) this.#countdown.hidden = true;
  }

  /**
   * Der Countdown.
   *
   * `Math.ceil` und nicht `Math.floor`: bei 2,4 s Restzeit soll „3" stehen, denn
   * das ist die Zahl, die noch kommt. Mit `floor` stünde dort „2", und der
   * Countdown liefe von 2 auf 0 — eine Zahl zu kurz.
   */
  setCountdown(seconds: number): void {
    if (seconds <= 0) {
      if (!this.#countdown.hidden) {
        this.#countdown.hidden = true;
        this.#showFlash('GO', true);
      }
      return;
    }
    this.#countdown.hidden = false;
    this.#setText(this.#countdown, String(Math.ceil(seconds)));
  }

  /** Der Kontostand oben rechts. */
  setMoney(yen: number): void {
    this.#setText(this.#money, `¥${yen.toLocaleString('en-US')}`);
  }

  /**
   * Die Auswertung nach dem Ziel.
   *
   * Sie bleibt **stehen, bis jemand sie wegklickt** — anders als jede andere
   * Meldung dieses HUD. Eine Zieltafel, die nach drei Sekunden verschwindet, ist
   * die Zahl, um die man das ganze Rennen gefahren ist, und man hat sie
   * verpasst, weil man gerade in die Auslaufkurve gebremst hat.
   */
  showResult(html: string, onClose: () => void): void {
    this.#result.innerHTML = html;
    this.#result.hidden = false;
    const button = this.#result.querySelector<HTMLButtonElement>('[data-close]');
    button?.addEventListener(
      'click',
      () => {
        this.#result.hidden = true;
        onClose();
      },
      { once: true },
    );
  }

  get resultOpen(): boolean {
    return !this.#result.hidden;
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
    this.#showFlash(
      best ? `BEST LAP ${formatTime(result.seconds)}` : `Lap ${result.lap} · ${formatTime(result.seconds)}`,
      best,
    );
  }

  /**
   * Der Wagen wurde von selbst auf die Straße gesetzt — P20.
   *
   * **Ohne diese Zeile sähe die Rettung wie ein Fehler aus.** Ein Auto, das
   * plötzlich woanders steht, ist genau das Bild, das dieses Projekt als „man
   * verbuggt sich" gemeldet bekommen hat. Mit Hinweis ist es eine Hilfe, und der
   * Fahrer weiß, dass es die Taste `R` auch von Hand gibt.
   */
  showRescue(): void {
    this.#showFlash('Stuck — back on the road (R)', false);
  }

  /** Eine beliebige Meldung, drei Sekunden. */
  flash(text: string, highlight = false): void {
    this.#showFlash(text, highlight);
  }

  /**
   * Der Kasten bleibt drei Sekunden stehen. Ein bestehender Zeitgeber wird dabei
   * **abgeräumt** — wer zwei Meldungen in kurzem Abstand auslöst, soll nicht
   * erleben, dass der erste Zeitgeber die zweite wegräumt.
   */
  #showFlash(text: string, best: boolean): void {
    this.#flash.textContent = text;
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
    this.#map.dispose();
    this.#root.remove();
  }
}
