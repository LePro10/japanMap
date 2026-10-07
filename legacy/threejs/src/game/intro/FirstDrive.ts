import type { EngineContext, System } from '@/core/System';
import type { RenderLoop } from '@/core/RenderLoop';
import type { DriveInput } from '@/game/Vehicle';
import type { DriveSystem } from '@/game/DriveSystem';
import { RAMPS } from '@/config/stunt.config';
import { INTRO, INTRO_STORAGE_KEY } from '@/config/intro.config';
import { IntroOverlay, type IntroKey } from '@/ui/intro/IntroOverlay';

/**
 * „First Drive" — der Ablauf des Intros. Die Begründung steht in
 * `intro.config.ts`; hier steht, **wie**.
 *
 * ## Schritte
 *
 * | Schritt | Bild | weiter, wenn |
 * |---|---|---|
 * | `title` | Letterbox, Titelkarte, Wagen rollt | 2,6 s |
 * | `gas` | „W · Accelerate" | W gedrückt, oder nach 3 s |
 * | `nitro` | „Shift · Nitro" | Nitro läuft |
 * | `air` | **Zeitlupe**, „Space Space · Barrel roll" | Rolle, Landung oder 2,8 s |
 * | `landed` | „Clean landing +500" | 1,6 s |
 * | `drift` | „Space halten beim Lenken" | 0,7 s gedriftet oder 14 s |
 * | `home` | Ziel + Führungslinie zur Commons | Einfahrt in die Open Bay |
 * | `bay` | Garage (gehört `SakuraCommons`) | Wagen rollt wieder heraus |
 *
 * ## Warum die Schritte an der **Physik** hängen und nicht an einer Uhr
 *
 * Ein Intro, das nach Sekunden abläuft, zeigt den Absprung-Hinweis dann, wenn
 * das Drehbuch ihn erwartet — und nicht, wenn der Wagen abhebt. `air` beginnt
 * deshalb an `telemetry.airborne` hinter der Kante, `drift` endet an
 * `telemetry.drift`. Die Uhr ist nur die Frist, nach der es auch ohne den
 * Spieler weitergeht.
 *
 * ## Warum Echtzeit
 *
 * `update(dt)` bekommt die **skalierte** Zeit (`RenderLoop.timeScale`). Die
 * Fristen des Intros laufen dagegen in Echtzeit: „2,8 s warten auf den
 * Doppeltipp" heißt 2,8 s am Bildschirm, nicht 2,8 s Flugzeit — die wären bei
 * 0,16 × 17 s. Deshalb liest der Ablauf `performance.now()` selbst.
 */
type Beat = 'off' | 'title' | 'gas' | 'nitro' | 'air' | 'landed' | 'drift' | 'home' | 'bay';

const KEY_W: IntroKey = { key: 'W', touch: 'Gas' };
const KEY_SHIFT: IntroKey = { key: 'Shift', touch: 'Boost' };
const KEY_SPACE: IntroKey = { key: 'Space', touch: 'Drift' };


/** Sekunden im Nitro-Schritt, nach denen es ohne Absprung weitergeht. */
const INTRO_NITRO_STALL = 7;

export interface FirstDriveHooks {
  readonly drive: DriveSystem;
  readonly loop: RenderLoop;
  readonly container: HTMLElement;
  /** Spielt das Spiel gerade (kein Menü, keine Garage)? */
  playing(): boolean;
  earn(sparks: number): void;
  /** Tonbestätigung. */
  click(): void;
  /** Wo die Einfahrt der Open Bay liegt — das Ziel des Heimwegs. */
  bayTarget(): { x: number; z: number };
  /** Übersprungen: der normale Start zu Fuß in der Commons. */
  startOnFoot(): void;
  /** Fertig oder übersprungen — die Commons begrüßt. */
  onFinished(skipped: boolean, earned: number): void;
}

export class FirstDrive implements System {
  readonly name = 'FirstDrive';
  readonly #h: FirstDriveHooks;
  readonly #ui: IntroOverlay;
  #beat: Beat = 'off';
  /** Echtzeit im aktuellen Schritt, s. */
  #t = 0;
  #last = 0;
  #slowTarget = 1;
  #playerThrottle = 0;
  #pressedFor = 0;
  #rolled = false;
  #boosted = false;
  #nitroAck = false;
  #driftFor = 0;
  #tabHeld = 0;
  #tabDown = false;
  #earned = 0;
  // Die Anfahrtslinie der Schanze.
  readonly #edge = { x: 0, z: 0 };
  readonly #dir = { x: 0, z: 1 };
  #heading = 0;

  constructor(hooks: FirstDriveHooks) {
    this.#h = hooks;
    this.#ui = new IntroOverlay(hooks.container, () => this.skip());
    const ramp = RAMPS.find((r) => r.id === INTRO.rampId);
    if (!ramp) throw new Error(`Intro: Schanze „${INTRO.rampId}" fehlt.`);
    this.#edge.x = ramp.x;
    this.#edge.z = ramp.z;
    this.#heading = ramp.heading;
    this.#dir.x = Math.sin(ramp.heading);
    this.#dir.z = Math.cos(ramp.heading);
  }

  /**
   * Wurde das Intro schon gesehen (oder übersprungen)?
   *
   * `?intro=on` / `?intro=off` erzwingen es. **Unter Automatisierung
   * (`navigator.webdriver`) gilt es ohne Angabe als gesehen:** zehn Werkzeuge
   * unter `tools/` drücken in einem frischen Chromium-Profil „Play" und
   * messen danach den Start zu Fuß in der Commons. Ohne diese Zeile mäßen sie
   * still das Intro — im Auto, mit Spurhilfe und Zeitlupe — und meldeten dazu
   * Zahlen, die aussehen wie ihre alten.
   */
  static get seen(): boolean {
    const flag = new URLSearchParams(location.search).get('intro');
    if (flag === 'on') return false;
    if (flag === 'off') return true;
    if (navigator.webdriver) return true;
    try {
      return localStorage.getItem(INTRO_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  get running(): boolean {
    return this.#beat !== 'off';
  }

  /** Ist der Heimweg erreicht? Dann gehört die Garage-Einfahrt dem Intro. */
  get homeward(): boolean {
    return this.#beat === 'home' || this.#beat === 'bay';
  }

  init(_context: EngineContext): void {
    window.addEventListener('keydown', this.#onKey, true);
    window.addEventListener('keyup', this.#onKey, true);
    window.addEventListener('blur', this.#onBlur);
  }

  /** Von vorn — aus „Play" beim ersten Start oder „Replay intro" im Menü. */
  start(): void {
    const { drive } = this.#h;
    const back = INTRO.runUp;
    drive.startDriving(
      this.#edge.x - this.#dir.x * back,
      this.#edge.z - this.#dir.z * back,
      this.#heading,
      INTRO.startSpeed,
    );
    drive.clearWaypoint();
    drive.introLock = true;
    drive.inputAssist = this.#assist;
    this.#rolled = false;
    this.#boosted = false;
    this.#nitroAck = false;
    this.#tabDown = false;
    this.#tabHeld = 0;
    this.#earned = 0;
    this.#ui.show();
    this.#ui.cinema(true);
    this.#ui.title(true);
    this.#ui.step(0);
    this.#go('title');
  }

  /** Überspringen — Tab gehalten, Knopf oder Menü. */
  skip(): void {
    if (this.#beat === 'off') return;
    const wasBay = this.#beat === 'bay';
    this.#teardown();
    this.#markSeen();
    // In der Garage ist der Wagen schon am Ziel; dort nur aufräumen.
    if (!wasBay) this.#h.startOnFoot();
    this.#h.onFinished(true, this.#earned);
  }

  /**
   * Still beenden — ohne Absetzen zu Fuß und ohne Willkommenskarte.
   *
   * Für eine Veranstaltung, die aus dem Menü mitten im Intro startet: sie
   * setzt den Wagen selbst an die Startlinie. `skip()` würde den Spieler
   * zuerst aussteigen lassen und danach die Karte über das Rennen legen.
   */
  abort(): void {
    if (this.#beat === 'off') return;
    this.#teardown();
    this.#markSeen();
  }

  /** Die Commons meldet: der Wagen rollt in die Open Bay. */
  enteredBay(): void {
    if (this.#beat !== 'home') return;
    this.#ui.objective(null);
    this.#ui.prompt(null);
    this.#ui.step(5);
    this.#pay(INTRO.reward.arrive);
    this.#go('bay');
  }

  /** … und wieder heraus. Das Intro ist durch. */
  leftBay(): void {
    if (this.#beat !== 'bay') return;
    this.#teardown();
    this.#markSeen();
    this.#h.onFinished(false, this.#earned);
  }

  update(): void {
    if (this.#beat === 'off') return;
    const now = performance.now();
    const real = Math.min(0.1, Math.max(0, (now - this.#last) / 1000));
    this.#last = now;
    const loop = this.#h.loop;

    if (!this.#h.playing()) {
      // Menü oder Garage offen: keine Frist läuft, und die Zeitlupe darf das
      // Menü nicht überleben — der Spieler käme in Zeitlupe zurück, ohne den
      // Hinweis, der sie erklärt.
      return;
    }
    this.#t += real;
    this.#tickSkip(real);

    // Zeitfaktor weich nachführen.
    const k = 1 - Math.exp(-INTRO.slowRate * real);
    loop.timeScale = loop.timeScale + (this.#slowTarget - loop.timeScale) * k;

    const { drive } = this.#h;
    const tel = drive.vehicle.telemetry;
    const p = drive.vehicle.position;
    const along = (p.x - this.#edge.x) * this.#dir.x + (p.z - this.#edge.z) * this.#dir.z;

    if (tel.boosting) this.#boosted = true;

    switch (this.#beat) {
      case 'title':
        if (this.#t > INTRO.titleSeconds) {
          this.#ui.title(false);
          this.#go('gas');
          this.#ui.prompt({ keys: [KEY_W], label: 'Hold to accelerate', hint: 'A / D steer' });
        }
        break;
      case 'gas':
        this.#pressedFor = this.#playerThrottle > 0.5 ? this.#pressedFor + real : 0;
        if (this.#pressedFor > 0.35) {
          this.#ui.hit();
          this.#h.click();
        }
        if (this.#pressedFor > 0.35 || this.#t > 3.2 || along > -INTRO.nitroAt) {
          this.#ui.step(1);
          this.#go('nitro');
          this.#ui.prompt({ keys: [KEY_SHIFT], label: 'Nitro', hint: 'Hit the ramp fast' });
        }
        break;
      case 'nitro':
        if (this.#boosted && !this.#nitroAck) {
          // Einmal bestätigen, danach nur noch auf den Absprung warten.
          this.#nitroAck = true;
          this.#ui.hit();
          this.#h.click();
        }
        if (tel.airborne && along > -3) {
          this.#ui.step(2);
          this.#go('air');
          this.#slowTarget = INTRO.airSlow;
          this.#ui.slow(true);
          this.#ui.prompt({
            keys: [KEY_SPACE],
            times: 2,
            label: 'Double-tap to roll',
            hint: this.#ui.touch ? 'Tap Drift twice in the air' : 'Space twice in the air',
            big: true,
          });
        } else if ((along > 30 || this.#t > INTRO_NITRO_STALL) && !tel.airborne) {
          // Schanze verpasst (vorbeigelenkt oder zu langsam) — ohne Zeitlupe
          // weiter, statt den Spieler zurückzusetzen. **Auch nach einer Frist:**
          // wer vor der Schanze im Grünstreifen steht, kommt nie 30 m hinter die
          // Kante, und der Nitro-Hinweis stand im Review 8 s und länger — nur
          // Tab-Halten führte heraus.
          this.#ui.cinema(false);
          this.#ui.step(3);
          this.#beginDrift();
        }
        break;
      case 'air':
        if (!this.#rolled && tel.trick > 0.02) {
          this.#rolled = true;
          this.#ui.hit();
          this.#h.click();
          this.#slowTarget = INTRO.rollSlow;
          this.#ui.toast('Barrel roll!', true);
          this.#pay(INTRO.reward.roll);
        }
        if (!this.#rolled && this.#t > INTRO.airWait) {
          this.#slowTarget = 1;
          this.#ui.prompt(null);
        }
        if (this.#rolled && tel.trick <= 0.02) this.#slowTarget = 1;
        if (!tel.airborne && this.#t > 0.3) {
          this.#slowTarget = 1;
          this.#ui.slow(false);
          this.#ui.cinema(false);
          this.#ui.prompt(null);
          this.#pay(INTRO.reward.landing);
          this.#ui.toast(this.#rolled ? 'Stuck the landing' : 'Clean landing', !this.#rolled);
          this.#go('landed');
        }
        break;
      case 'landed':
        if (this.#t > 1.6) {
          this.#ui.step(3);
          this.#beginDrift();
        }
        break;
      case 'drift':
        this.#driftFor = tel.drift > 0.5 || drive.race.drift.state.active ? this.#driftFor + real : 0;
        if (this.#driftFor > INTRO.driftHold) {
          this.#ui.hit();
          this.#h.click();
          this.#ui.toast("That's a drift", true);
          this.#pay(INTRO.reward.drift);
          this.#beginHome();
        } else if (this.#t > INTRO.driftTimeout) {
          this.#ui.prompt(null);
          this.#beginHome();
        }
        break;
      case 'home': {
        const target = this.#h.bayTarget();
        const wp = drive.waypoint;
        const meters = wp?.remaining ?? Math.hypot(target.x - p.x, target.z - p.z);
        this.#ui.objective({
          title: 'Drive to Sakura Commons',
          meta: `${Math.round(meters)} m · roll slowly into the Open Bay`,
        });
        if (!drive.active && !drive.walking) this.skip();
        break;
      }
      case 'bay':
        break;
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#onKey, true);
    window.removeEventListener('keyup', this.#onKey, true);
    window.removeEventListener('blur', this.#onBlur);
    this.#teardown();
    this.#ui.dispose();
  }

  // ── Intern ────────────────────────────────────────────────────────────

  #go(beat: Beat): void {
    this.#beat = beat;
    this.#t = 0;
    this.#last = performance.now();
    this.#pressedFor = 0;
    this.#driftFor = 0;
  }

  /**
   * Der Drift **ist** die Wende. Die Commons liegt nach der Landung hinter
   * dem Wagen (die Schanze zeigt zum Meer); ein Drift-Hinweis auf gerader
   * Küstenstraße wäre eine Übung ohne Grund, eine Handbremswende zur
   * Führungslinie hat einen. Der Wegpunkt steht deshalb schon jetzt.
   */
  #beginDrift(): void {
    this.#go('drift');
    this.#h.drive.introLock = false;
    const target = this.#h.bayTarget();
    this.#h.drive.setWaypoint(target.x, target.z, 'Sakura Commons');
    this.#ui.prompt({
      keys: [KEY_SPACE],
      label: 'Hold and steer — drift it around',
      hint: this.#ui.touch
        ? 'Hold Drift and steer with the stick · home is behind you'
        : 'Hold Space, steer with A / D · home is behind you',
    });
  }

  #beginHome(): void {
    this.#ui.step(4);
    this.#go('home');
    window.setTimeout(() => {
      if (this.#beat === 'home') this.#ui.prompt(null);
    }, 1400);
  }

  #pay(sparks: number): void {
    this.#earned += sparks;
    this.#h.earn(sparks);
  }

  #markSeen(): void {
    try {
      localStorage.setItem(INTRO_STORAGE_KEY, '1');
    } catch {
      /* privater Modus — dann eben beim nächsten Mal noch einmal */
    }
  }

  #teardown(): void {
    const { drive, loop } = this.#h;
    this.#beat = 'off';
    this.#slowTarget = 1;
    loop.timeScale = 1;
    drive.introLock = false;
    if (drive.inputAssist === this.#assist) drive.inputAssist = null;
    this.#ui.hide();
    this.#tabHeld = 0;
    this.#ui.skipProgress(0);
  }

  #tickSkip(real: number): void {
    this.#tabHeld = this.#tabDown ? this.#tabHeld + real : 0;
    this.#ui.skipProgress(Math.min(1, this.#tabHeld / INTRO.skipHold));
    if (this.#tabHeld >= INTRO.skipHold) this.skip();
  }

  readonly #onKey = (event: KeyboardEvent): void => {
    if (event.code !== 'Tab') return;
    // Das Loslassen immer mitschreiben, auch ohne laufendes Intro: sonst
    // bleibt `#tabDown` nach dem Überspringen hängen (das Intro ist beim
    // Keyup schon aus), und das nächste „Replay intro" überspringt sich nach
    // 0,9 s selbst. Genau so gemessen.
    if (event.type === 'keyup') {
      this.#tabDown = false;
      return;
    }
    if (this.#beat === 'off') return;
    event.preventDefault();
    this.#tabDown = true;
  };

  readonly #onBlur = (): void => {
    this.#tabDown = false;
  };

  /**
   * Die Hilfe auf der Eingabe — Anlauf auf die Schanze.
   *
   * Das Gas hält sie durch, die Lenkung zieht sie auf die Linie: Querabstand
   * und Winkelfehler, beide mit Vorzeichen aus der Konvention des Projekts
   * (`right = (−cos ψ, 0, sin ψ)`, Lenkung + = rechts = ψ fällt). Der Spieler
   * behält ein Drittel seiner Lenkung — genug, um zu merken, dass er lenkt,
   * zu wenig, um an der Schanze vorbeizufahren.
   */
  readonly #assist = (input: DriveInput): void => {
    this.#playerThrottle = input.throttle;
    const beat = this.#beat;
    const vehicle = this.#h.drive.vehicle;
    if (beat === 'landed' || (beat === 'air' && !vehicle.telemetry.airborne)) {
      // Nach der Landung rollt der Wagen mit 110 km/h weiter aufs Meer zu.
      // Wer selbst nichts tut, wird auf Wendetempo gebremst — gemessen kam
      // er ohne Eingabe 2 s nach der Landung noch mit 100 km/h und hob
      // hinter der Küstenstraße ein zweites Mal ab.
      const idle = input.throttle === 0 && input.brake === 0;
      if (idle && vehicle.telemetry.speed > INTRO.turnSpeed) input.brake = 0.55;
      return;
    }
    if (beat !== 'title' && beat !== 'gas' && beat !== 'nitro') return;
    const p = vehicle.position;
    const along = (p.x - this.#edge.x) * this.#dir.x + (p.z - this.#edge.z) * this.#dir.z;
    const cross = -(p.x - this.#edge.x) * this.#dir.z + (p.z - this.#edge.z) * this.#dir.x;
    // `cross` = right·Δ mit right = (−cos ψ, sin ψ) = (−dir.z, dir.x):
    // positiv heißt rechts der Linie ⇒ nach links lenken (steer < 0).
    // `err` > 0 verlangt ein größeres ψ, und ψ wächst beim Linkslenken
    // (d forward/dψ = (cos, −sin) = −right) ⇒ ebenfalls steer < 0.
    let err = this.#heading - vehicle.yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    const assist = Math.max(
      -INTRO.assistMax,
      Math.min(INTRO.assistMax, -(INTRO.assistCross * cross + INTRO.assistHeading * err)),
    );
    input.steer = Math.max(-1, Math.min(1, input.steer * INTRO.playerSteer + assist));
    input.throttle = 1;
    input.brake = 0;
    input.handbrake = false;
    // Ein Doppeltipp am Boden wäre ein 360 in den Anlauf.
    if (!vehicle.telemetry.airborne) {
      input.trick = false;
      input.stunt = false;
    }
    if (beat === 'title') input.boost = false;
    if (along > -INTRO.autoNitroAt && along < 0) input.boost = true;
  };
}
