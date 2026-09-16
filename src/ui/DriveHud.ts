import { instruments } from './instruments';
import './theme.css';
import './driveInstruments.css';
import { formatTime } from '@/game/BestTimes';
import type { DriftState } from '@/game/DriftScore';
import type { LapResult } from '@/game/LapTimer';
import type { RaceStanding } from '@/game/RaceDirector';
import type { VehicleTelemetry } from '@/game/Vehicle';
import type { RoadFile } from '@/config/roads.config';
import { WAYPOINT } from '@/config/waypoint.config';
import { damp, dampAngle, formatEta, formatWaypointDistance } from '@/game/waypointScreen';
import { MiniMap, type MiniMapMark } from './MiniMap';
import { SPARK_ICON, sparkMark } from './sparkIcon';
import { EXPLORE_TOAST_MS } from '@/config/explore.config';
import { exploreToastText, type ExploreGrant } from '@/game/regionExplore';

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
  readonly #stunt: HTMLElement;
  readonly #speedo: HTMLElement;
  readonly #race: HTMLElement;
  readonly #racePlace: HTMLElement;
  readonly #raceLap: HTMLElement;
  readonly #raceNext: HTMLElement;
  readonly #countdown: HTMLElement;
  readonly #result: HTMLElement;
  readonly #money: HTMLElement;
  readonly #moneyValue: HTMLElement;
  readonly #arrow: HTMLElement;
  readonly #prompt: HTMLElement;
  readonly #promptKey: HTMLElement;
  readonly #promptAction: HTMLElement;
  readonly #prep: HTMLElement;
  readonly #map: MiniMap;
  readonly #nav: HTMLElement;
  readonly #wp: HTMLElement;
  readonly #wpName: HTMLElement;
  readonly #wpDist: HTMLElement;
  readonly #wpMeta: HTMLElement;
  readonly #pin: HTMLElement;
  readonly #pinName: HTMLElement;
  readonly #pinDist: HTMLElement;
  readonly #pinArrow: HTMLElement;
  readonly #explore: HTMLElement;
  readonly #exploreTitle: HTMLElement;
  readonly #exploreBody: HTMLElement;
  #lastWpLabel: string | null = null;
  #lastWpRemaining = Infinity;
  #pinX = 0;
  #pinY = 0;
  #pinAng = 0;
  #pinReady = false;
  #arrowDeg = 999;
  /** Zuletzt gesetzter Hinweis — sonst schreibt jeder Frame denselben Text. */
  #promptKind: 'enter' | 'exit' | 'slow' | null = null;
  #onOpenMap: (() => void) | null = null;

  /** Zuletzt geschriebener Text je Feld — spart das Layout, s. o. */
  readonly #written = new Map<HTMLElement, string>();

  #flashTimer: number | null = null;
  #exploreTimer: number | null = null;
  #boostPulseTimer: number | null = null;
  #moneyRaf = 0;
  #shownYen = 0;
  #targetYen = 0;
  #countFrom = 0;
  #countStart = 0;
  #visible = false;
  #driveActive = false;
  #walking = false;
  #menuOpen = false;
  #driftShown = false;
  #stuntShown = false;

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
      <div class="hud__money" data-hud="money">${SPARK_ICON}<strong data-hud="moneyValue">0</strong></div>
      <div class="hud__speedo"><span class="hud__stunt" data-hud="stunt" hidden>STUNT</span><span class="hud__gearLabel" data-hud="gear">N</span><svg class="hud__rpm" viewBox="0 0 220 130" aria-label="Engine RPM"><path d="M20 110 A90 90 0 0 1 200 110" pathLength="100" class="hud__rpmTrack"/><path d="M20 110 A90 90 0 0 1 200 110" pathLength="100" class="hud__rpmFill" data-hud="rpmFill"/><path d="M181 55 A90 90 0 0 1 200 110" class="hud__redline"/></svg><span class="hud__rpmText" data-hud="rpm">850 RPM</span>
        <div class="hud__boost" data-hud="boostBox" aria-label="Nitro"><span class="hud__nitroLabel">NITRO</span><i class="hud__boostFill" data-hud="boostFill"></i></div>
        <div class="hud__speedRow">
          <span class="hud__speed" data-hud="speed">0</span>
          <span class="hud__unit">km/h</span>
        </div>
        <p class="hud__prep" data-hud="prep" hidden>Prepared surface · extra cornering grip</p>
        <div class="hud__drift" data-hud="drift" hidden>
          <span class="hud__driftPoints" data-hud="driftPoints">0</span>
          <span class="hud__driftMult" data-hud="driftMult">x1.0</span>
          <span class="hud__driftBanked" data-hud="driftBanked"></span>
        </div>
      </div>
      <div class="hud__wp" data-hud="wp">
        <span class="hud__wpName" data-hud="wpName">Waypoint</span>
        <strong class="hud__wpDist" data-hud="wpDist">—</strong>
        <span class="hud__wpMeta" data-hud="wpMeta"></span>
      </div>
      <div class="hud__pin" data-hud="pin">
        <i class="hud__pinArrow" data-hud="pinArrow"></i>
        <span class="hud__pinName" data-hud="pinName">Waypoint</span>
        <strong class="hud__pinDist" data-hud="pinDist">—</strong>
      </div>
      <div class="hud__nav">
        <div class="hud__arrow" data-hud="arrow" hidden><i></i></div>
      </div>
      <p class="hud__prompt" data-hud="prompt" hidden>
        <kbd class="hud__promptKey" data-hud="promptKey">F</kbd>
        <span class="hud__promptAction" data-hud="promptAction">Enter</span>
      </p>
      <div class="hud__countdown" data-hud="countdown" hidden>3</div>
      <div class="hud__result" data-hud="result" hidden></div>
      <div class="hud__flash" data-hud="flash" hidden></div>
      <div class="hud__explore" data-hud="explore" hidden>
        <strong class="hud__exploreTitle" data-hud="exploreTitle"></strong>
        <span class="hud__exploreBody" data-hud="exploreBody"></span>
      </div>`;
    container.appendChild(this.#root);

    this.#rpmFill = this.#root.querySelector<SVGElement>('[data-hud="rpmFill"]')!;
    this.#rpmText = this.#must('[data-hud="rpm"]');
    this.#unit = this.#must('.hud__unit');
    this.#lapBox = this.#must('.hud__lap');
    this.#lapBox.hidden = true;
    this.#speed = this.#must('[data-hud="speed"]');
    this.#gear = this.#must('[data-hud="gear"]');
    this.#lapTime = this.#must('[data-hud="lap"]');
    this.#best = this.#must('[data-hud="best"]');
    this.#gate = this.#must('[data-hud="gate"]');
    this.#flash = this.#must('[data-hud="flash"]');
    this.#explore = this.#must('[data-hud="explore"]');
    this.#exploreTitle = this.#must('[data-hud="exploreTitle"]');
    this.#exploreBody = this.#must('[data-hud="exploreBody"]');
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
    this.#moneyValue = this.#must('[data-hud="moneyValue"]');
    this.#arrow = this.#must('[data-hud="arrow"]');
    this.#prompt = this.#must('[data-hud="prompt"]');
    this.#promptKey = this.#must('[data-hud="promptKey"]');
    this.#promptAction = this.#must('[data-hud="promptAction"]');
    this.#prep = this.#must('[data-hud="prep"]');
    this.#stunt = this.#must('[data-hud="stunt"]');
    this.#speedo = this.#must('.hud__speedo');
    this.#nav = this.#must('.hud__nav');
    this.#wp = this.#must('[data-hud="wp"]');
    this.#wpName = this.#must('[data-hud="wpName"]');
    this.#wpDist = this.#must('[data-hud="wpDist"]');
    this.#wpMeta = this.#must('[data-hud="wpMeta"]');
    this.#pin = this.#must('[data-hud="pin"]');
    this.#pinName = this.#must('[data-hud="pinName"]');
    this.#pinDist = this.#must('[data-hud="pinDist"]');
    this.#pinArrow = this.#must('[data-hud="pinArrow"]');
    this.#map = new MiniMap(this.#nav);
    this.#nav.setAttribute('role', 'button');
    this.#nav.setAttribute('aria-label', 'Open map (M)');
    this.#nav.addEventListener('click', this.#onNavClick);
    // Grober Zeiger = Telefon: dort gibt es kein F, der 🚗-Knopf ist der Weg.
    // Ein Laptop mit Touchscreen bleibt bei F — `maxTouchPoints > 0` allein
    // würde dort die Tastatur-Taste durch ein Auto ersetzen, das es in der
    // Tastaturzeile nicht gibt.
    this.#promptKey.textContent = matchMedia('(pointer: coarse)').matches ? '🚗' : 'F';
  }

  /**
   * Klick auf die Minikarte öffnet die Vollkarte — der Weg ohne Taste `M`,
   * den ein Telefon braucht. Hereingereicht und nicht selbst gesucht:
   * dieses HUD hat keinen Bus.
   */
  setOnOpenMap(fn: (() => void) | null): void {
    this.#onOpenMap = fn;
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
    waypoint: MiniMapMark | null = null,
    speed = 0,
    onFoot = false,
  ): void {
    if (!this.#visible) return;
    // `dt` reicht bis in die Karte durch: sie zeichnet nicht je Frame neu,
    // sondern mit 15 Hz — Begründung in `MiniMap.update()`.
    this.#map.update(x, z, heading, rivals, target, dt, waypoint, speed, onFoot);
    this.#syncWaypointChip(x, z, waypoint, dt);

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

  /**
   * Zu Fuß: HUD an (Karte, Geld), Tacho aus.
   *
   * Eigenes Feld neben `#driveActive`, dieselbe Begründung wie bei Menü und
   * Fahrmodus — ein gemeinsames `setVisible` verlöre den Fall „ausgestiegen,
   * Menü auf, Menü zu".
   */
  setWalking(active: boolean): void {
    this.#walking = active;
    this.#apply();
  }

  setMenuOpen(open: boolean): void {
    this.#menuOpen = open;
    this.#apply();
  }

  #apply(): void {
    this.#visible = (this.#driveActive || this.#walking) && !this.#menuOpen;
    this.#root.hidden = !this.#visible;
    this.#root.classList.toggle('hud--on-foot', this.#walking && !this.#driveActive);
    if (!this.#visible) this.setVehicleHint(null);
  }

  /**
   * Ein-/Aussteigen-Hinweis.
   *
   * `enter` nur in Reichweite des Wagens, `exit` die ganze Fahrt über.
   * `null` räumt den Chip weg — nicht Deckkraft 0: ein unsichtbarer Chip
   * läge weiter im Layout und über dem „Continue"-Knopf der Zieltafel.
   */
  setVehicleHint(kind: 'enter' | 'exit' | 'slow' | null): void {
    if (kind === this.#promptKind) return;
    this.#promptKind = kind;
    if (kind === null) {
      this.#prompt.hidden = true;
      return;
    }
    this.#setText(this.#promptAction, kind === 'enter' ? 'Enter' : kind === 'slow' ? 'Slow down to exit' : 'Exit');
    this.#prompt.hidden = false;
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
    const mph = document.documentElement.dataset.speedUnits === 'mph';
    const kmh = Math.round(Math.abs(t.forwardSpeed) * (mph ? 2.236936 : 3.6));
    this.#setText(this.#unit, mph ? 'mph' : 'km/h');
    this.#setText(this.#speed, String(kmh));
    // Rückwärts ist eine eigene Angabe und keine negative Zahl — dieselbe
    // Überlegung wie beim Tacho darüber.
    const reading = instruments(t.forwardSpeed);
    if (this.#gear.textContent !== reading.gear) { this.#gear.classList.remove('hud__gearShift'); void this.#gear.offsetWidth; this.#gear.classList.add('hud__gearShift'); }
    this.#setText(this.#gear, reading.gear);
    this.#setText(this.#rpmText, `${Math.round(reading.rpm / 100) * 100} RPM`);
    const rpmPct = Math.round(reading.fraction * 100);
    if (rpmPct !== this.#rpmPct) { this.#rpmPct = rpmPct; this.#rpmFill.style.strokeDasharray = `${rpmPct} 100`; }
    this.#lapBox.hidden = !running;

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
    this.#prep.hidden = t.circuit < 0.35;

    // Anschalten ist sofort (telemetry.stunt = 1), Ausblenden folgt dem Blend.
    const stuntOn = this.#driveActive && t.stunt > 0.2;
    if (stuntOn !== this.#stuntShown) {
      this.#stuntShown = stuntOn;
      this.#stunt.hidden = !stuntOn;
      this.#speedo.classList.toggle('is-stunt', stuntOn);
    }
  }

  #boostPct = -1;
  #rpmPct = -1;
  readonly #rpmFill: SVGElement;
  readonly #rpmText: HTMLElement;
  readonly #unit: HTMLElement;
  readonly #lapBox: HTMLElement;

  /**
   * Die Driftwertung — sie erscheint nur, während eine Kette läuft.
   *
   * Sie sitzt **im Tacho**, nicht als Geschwister daneben. Der Rundbogen ist
   * höher als der alte Zahlen-Tacho, und das Speedo kommt im DOM nach der
   * Wertung: eine viewport-absolute Zahl landete hinter dem Bogen (gemessen:
   * Multiplikator in Amber auf dem Amber-Strich). Am Instrument wandert sie
   * mit, auch wenn der Tacho auf dem Telefon nach oben rutscht.
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
    this.#targetYen = yen;
    if (reducedMotion() || yen <= this.#shownYen) {
      this.#shownYen = yen;
      this.#setText(this.#moneyValue, yen.toLocaleString('en-US'));
      return;
    }
    this.#countFrom = this.#shownYen;
    this.#countStart = performance.now();
    if (this.#moneyRaf === 0) this.#moneyRaf = requestAnimationFrame(this.#tickMoney);
  }

  /**
   * Drei Facetten fliegen von der Weltposition ins Wallet.
   *
   * `origins` sind schon Bildkoordinaten (main.ts projiziert). Hinter der
   * Kamera oder weit außerhalb: nur Puls, kein Flug — sonst startet ein
   * Splitter am Bildrand und liest sich als Fehler.
   */
  collectSparks(origins: readonly { x: number; y: number; visible: boolean }[]): void {
    this.#money.classList.remove('is-pulse');
    void this.#money.offsetWidth;
    this.#money.classList.add('is-pulse');
    this.#boostBox.classList.add('is-spark');
    if (this.#boostPulseTimer !== null) window.clearTimeout(this.#boostPulseTimer);
    this.#boostPulseTimer = window.setTimeout(() => {
      this.#boostBox.classList.remove('is-spark');
      this.#boostPulseTimer = null;
    }, 280);
    if (reducedMotion() || !this.#visible) return;
    const root = this.#root.getBoundingClientRect();
    const wallet = this.#money.getBoundingClientRect();
    const tx = wallet.left - root.left + 14;
    const ty = wallet.top - root.top + wallet.height * 0.5;
    const seeds = origins.length > 0 ? origins : [{ x: tx, y: ty + 80, visible: true }];
    for (const origin of seeds) {
      const sx = origin.visible ? origin.x : tx;
      const sy = origin.visible ? origin.y : ty + 64;
      for (let i = 0; i < 3; i++) this.#flyFacet(sx, sy, tx, ty, i);
    }
  }

  readonly #tickMoney = (now: number): void => {
    const t = Math.min(1, (now - this.#countStart) / 320);
    const eased = 1 - (1 - t) ** 3;
    this.#shownYen = Math.round(this.#countFrom + (this.#targetYen - this.#countFrom) * eased);
    this.#setText(this.#moneyValue, this.#shownYen.toLocaleString('en-US'));
    if (t < 1) this.#moneyRaf = requestAnimationFrame(this.#tickMoney);
    else this.#moneyRaf = 0;
  };

  #flyFacet(sx: number, sy: number, tx: number, ty: number, i: number): void {
    const el = document.createElement('span');
    el.className = 'hud__facet';
    el.innerHTML = SPARK_ICON;
    el.style.transform = `translate(${sx}px, ${sy}px) scale(1)`;
    this.#root.appendChild(el);
    const midX = sx + (tx - sx) * 0.55 + (i - 1) * 28;
    const midY = sy + (ty - sy) * 0.4 - 36 - i * 10;
    const anim = el.animate(
      [
        { transform: `translate(${sx}px, ${sy}px) scale(1)`, opacity: 1 },
        { transform: `translate(${midX}px, ${midY}px) scale(0.9)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.25)`, opacity: 0.15 },
      ],
      {
        duration: 420,
        delay: i * 42,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'forwards',
      },
    );
    anim.addEventListener('finish', () => el.remove());
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

  showTooDeep(): void {
    this.#showFlash('Too deep · returning to shore', false);
  }

  /** Eine beliebige Meldung, drei Sekunden. */
  flash(text: string, highlight = false): void {
    this.#showFlash(text, highlight);
  }

  /**
   * First visit of a region. Two lines so the counter stays readable; Sparks
   * use the existing icon, the wallet chip is not restyled.
   */
  showExplore(grant: ExploreGrant): void {
    const copy = exploreToastText(grant);
    this.#exploreTitle.textContent = copy.title;
    this.#exploreBody.innerHTML = `${copy.body} · +${sparkMark(grant.sparks)}`;
    this.#explore.hidden = false;
    this.#flash.hidden = true;
    if (this.#exploreTimer !== null) window.clearTimeout(this.#exploreTimer);
    this.#exploreTimer = window.setTimeout(() => {
      this.#explore.hidden = true;
      this.#exploreTimer = null;
    }, EXPLORE_TOAST_MS);
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
    this.#explore.hidden = true;

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

  #syncWaypointChip(x: number, z: number, waypoint: MiniMapMark | null, dt: number): void {
    if (!waypoint) {
      if (this.#lastWpLabel && this.#lastWpRemaining < 40) {
        this.#showFlash(`Arrived · ${this.#lastWpLabel}`, false);
      }
      this.#lastWpLabel = null;
      this.#lastWpRemaining = Infinity;
      this.#wp.classList.remove('is-on');
      this.#pin.classList.remove('is-on');
      this.#pinReady = false;
      this.#wp.removeAttribute('data-advisory');
      return;
    }
    this.#wp.classList.add('is-on');
    const name = waypoint.label ?? 'Waypoint';
    this.#setText(this.#wpName, name);
    const crow = Math.hypot(waypoint.x - x, waypoint.z - z);
    const meters = waypoint.remaining ?? crow;
    this.#setText(this.#wpDist, formatWaypointDistance(meters));
    this.#lastWpLabel = name;
    this.#lastWpRemaining = Math.min(meters, crow);

    const bits: string[] = [];
    if (waypoint.turn === 'left') bits.push('Turn left');
    else if (waypoint.turn === 'right') bits.push('Turn right');
    else if (waypoint.turn === 'around') bits.push('Turn around');
    if (waypoint.eta && waypoint.eta > 0) bits.push(formatEta(waypoint.eta));
    if (waypoint.advisory === 'brake') bits.push('Too fast');
    else if (waypoint.advisory === 'caution') bits.push('Brake');
    this.#setText(this.#wpMeta, bits.join(' · '));
    this.#wp.dataset.advisory = waypoint.advisory ?? 'ok';
    this.#syncPin(waypoint, formatWaypointDistance(meters), name, dt);
  }

  #syncPin(waypoint: MiniMapMark, dist: string, name: string, dt: number): void {
    const pin = waypoint.pin;
    if (!pin) {
      this.#pin.classList.remove('is-on');
      this.#pinReady = false;
      return;
    }
    this.#setText(this.#pinName, name.toUpperCase());
    this.#setText(this.#pinDist, dist);
    if (!this.#pinReady) {
      this.#pinX = pin.x;
      this.#pinY = pin.y;
      this.#pinAng = pin.edgeAngle;
      this.#pinReady = true;
    } else {
      this.#pinX = damp(this.#pinX, pin.x, WAYPOINT.pinSmooth, dt);
      this.#pinY = damp(this.#pinY, pin.y, WAYPOINT.pinSmooth, dt);
      this.#pinAng = dampAngle(this.#pinAng, pin.edgeAngle, WAYPOINT.pinSmooth, dt);
    }
    this.#pin.style.left = `${this.#pinX}px`;
    this.#pin.style.top = `${this.#pinY}px`;
    this.#pin.classList.toggle('hud__pin--edge', !pin.onScreen);
    this.#pin.classList.add('is-on');
    this.#pinArrow.style.transform = pin.onScreen
      ? 'none'
      : `rotate(${(this.#pinAng * 180) / Math.PI}deg)`;
  }

  readonly #onNavClick = (): void => {
    this.#onOpenMap?.();
  };

  #must(selector: string): HTMLElement {
    const element = this.#root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`HUD: "${selector}" fehlt.`);
    return element;
  }

  dispose(): void {
    if (this.#flashTimer !== null) window.clearTimeout(this.#flashTimer);
    this.#flashTimer = null;
    if (this.#exploreTimer !== null) window.clearTimeout(this.#exploreTimer);
    this.#exploreTimer = null;
    if (this.#boostPulseTimer !== null) window.clearTimeout(this.#boostPulseTimer);
    this.#boostPulseTimer = null;
    if (this.#moneyRaf !== 0) cancelAnimationFrame(this.#moneyRaf);
    this.#moneyRaf = 0;
    this.#written.clear();
    this.#nav.removeEventListener('click', this.#onNavClick);
    this.#onOpenMap = null;
    this.#map.dispose();
    this.#root.remove();
  }
}

function reducedMotion(): boolean {
  try {
    if (localStorage.getItem('japanMap.reducedMotion') === 'true') return true;
  } catch {
    // Privater Modus — die Systempräferenz reicht.
  }
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
