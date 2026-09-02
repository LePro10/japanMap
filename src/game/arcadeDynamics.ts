import {
  AIR_CONTROL,
  ARCADE_SURFACE,
  ARCADE_SURFACE_DRAG,
  BOOST_EARN,
  DRIFT_GATE,
  DRIFT_MAX_ANGLE,
  DRIFT_MIN_SPEED,
  DRIFT_SCORE_ANGLE,
  YAW_CAP_SPEED,
  type ArcadeSpec,
} from '@/config/arcade.config';
import { GRAVITY } from '@/config/vehicle.config';
import type { Surface } from './Vehicle';

/**
 * Die waagerechte Fahrdynamik des Arcade-Modells — P22.
 *
 * ## Warum das eine eigene Datei ohne three.js ist
 *
 * Zwei Gründe, und beide sind in diesem Projekt schon einmal teuer gewesen:
 *
 *  1. **Sie ist ohne Browser messbar.** `tools/bench/arcade.mts` fährt sie
 *     tausendfach in Millisekunden. Die Lehre aus P18 („eine zweite, für den
 *     Prüfstand abgeschriebene Physik misst sich selbst") gilt weiter — deshalb
 *     ist das hier *derselbe* Code und keine Kopie, er hat nur keine
 *     Abhängigkeit, die ihn an den Renderer bindet.
 *  2. **Sie ist die Schicht, die getauscht wurde.** Alles darum herum —
 *     Federung, Gelände, Blech, Kollision — ist unverändert aus P19…P21. Wer
 *     später wissen will, was P22 wirklich geändert hat, liest diese Datei und
 *     sonst nichts.
 *
 * ## Die Rechnung, in der Reihenfolge, in der sie läuft
 *
 * ```
 *   δ    ← Lenkeingabe, ratenbegrenzt              (#steer)
 *   ω*   ← −v·tan(δ)/L,  gedeckelt auf a_lat/v      (Kinematik + Haftung)
 *   drift← Space+Lenken, danach Gas·|Lenkung|        (eigener Zustand, 0…1)
 *   ω*   += drift · driftYaw · sign                 (das Heck kommt)
 *   ω    ← ω + (ω* − ω)·(1 − e^(−yawResponse·dt))   (die Nase folgt)
 *   a_lat← −v_quer · k(drift),  gedeckelt auf a_max (die Reifen fangen ein)
 *   a_lng← Antrieb − Bremse − Widerstände           (das Übliche)
 * ```
 *
 * ## Warum das Vorzeichen von ω negativ ist
 *
 * `forward = (sin ψ, 0, cos ψ)`, `right = (−cos ψ, 0, sin ψ)` (die Konvention
 * aus P14, hart erkauft — siehe `Vehicle.#updateBasis`). Ein wachsendes ψ dreht
 * `forward` nach `−right`, also nach **links**. Ein positiver Lenkeinschlag
 * heißt rechts, und rechts heißt damit **fallendes** ψ. Das Minus in `#yawTarget`
 * ist genau das und keine Geschmacksfrage.
 *
 * ## Warum die Quergeschwindigkeit von selbst entsteht
 *
 * `Vehicle` führt die Geschwindigkeit in **Weltkoordinaten** und projiziert sie
 * je Schritt neu auf die Fahrzeugachsen. Dreht sich die Nase um ω, bleibt der
 * Geschwindigkeitsvektor stehen — in Fahrzeugachsen wächst die Querkomponente
 * damit mit `v̇_quer = ω · v_längs`. Das ist keine Näherung, sondern die
 * Ableitung des mitrotierenden Systems; hier steht sie nirgends im Code, weil
 * die Projektion sie erzeugt.
 *
 * Im Gleichgewicht folgt daraus der Schwimmwinkel geschlossen:
 *
 * ```
 *   v̇_quer = ω·v_längs − k·v_quer = 0   ⇒   β ≈ v_quer/v_längs = ω/k
 * ```
 *
 * Mit `k = latGrip = 9` und ω = 0,5 rad/s sind das 3,2° — eine schnell gefahrene
 * Kurve. Mit `k = driftLatGrip = 1,8` sind es 16°, und mit dem Zuschlag aus
 * `driftYaw` deutlich mehr. **Der Drift ist damit kein Sonderfall im Code,
 * sondern derselbe Ausdruck mit einem anderen k.**
 */

/** Was der Schritt an seine Umgebung meldet. */
export interface PlanarResult {
  /** Beschleunigung längs der Fahrzeugachse, m/s². */
  accelLong: number;
  /** Beschleunigung quer (positiv = nach rechts), m/s². */
  accelLat: number;
  /** Gierrate nach diesem Schritt, rad/s. */
  yawRate: number;
  /** Nickrate im Flug, rad/s — null am Boden. */
  pitchRate: number;
  /** Wie weit der Drift-Zustand offen ist, 0…1. */
  drift: number;
  /** Schwimmwinkel, rad. Positiv = Fahrtrichtung zeigt rechts an der Nase vorbei. */
  slip: number;
  /** 0…1, wie stark die Räder markieren. Für Spur, Rauch und Ton. */
  skid: number;
  /** Wie stark die angetriebene Achse überfordert ist — 1 = Haftgrenze. */
  wheelspin: number;
  /** Läuft der Nitro gerade? */
  boosting: boolean;
  /** Nitro-Vorrat, 0…1. */
  boost: number;
  /** Radeinschlag für die Anzeige, rad. */
  steerAngle: number;
}

/** Was die Dynamik über den Untergrund und die Lage wissen muss. */
export interface PlanarEnv {
  /** Geschwindigkeit längs der Fahrzeugachse, m/s (vorzeichenbehaftet). */
  vLong: number;
  /** Geschwindigkeit quer, m/s (positiv = nach rechts). */
  vLat: number;
  readonly surface: Surface;
  /** Wassertiefe unter dem Wagen, m. */
  readonly waterDepth: number;
  /** Kein Rad trägt. */
  readonly airborne: boolean;
  /**
   * Wie viel Radlast der Hang noch trägt, 0…1 — `slopeSupport` aus P21.
   *
   * Sie geht **linear** in Haftung und Antrieb: eine Wand trägt nichts, ein
   * 30°-Hang fast alles. Damit erbt das Arcade-Modell die Steilhang-Kennlinie
   * aus P21, ohne sie noch einmal zu implementieren.
   */
  readonly support: number;
}

export interface DriveCommand {
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
  readonly handbrake: boolean;
  readonly boost: boolean;
}

/** Ein Zustand, den ein Prüfstand von Hand setzen darf. */
export interface ArcadeSnapshot {
  steerAngle: number;
  throttle: number;
  drift: number;
  boost: number;
  yawRate: number;
  pitchRate: number;
}

/**
 * Unter diesem Tempo hält die Haftreibung statisch, m/s.
 *
 * Ohne sie rollt ein Wagen am Hang für immer rückwärts, weil die Längskraft im
 * Stand null ist. Übernommen aus `limits.staticHoldSpeed` des Einspurmodells —
 * eine der wenigen Zahlen, die die Umstellung unverändert überlebt haben, weil
 * sie nichts über das Fahrverhalten sagt, sondern über den Stillstand.
 */
const STATIC_HOLD_SPEED = 0.9;

/**
 * Tempo, unterhalb dessen die Leistung nicht mehr durch `P/v` begrenzt wird.
 *
 * `F = P/v` geht bei `v → 0` gegen unendlich. 4 m/s ist der Punkt, ab dem
 * `launchForce` ohnehin kleiner ist — der Wert ist also kein Regler, sondern ein
 * Schutz vor einer Division.
 */
const POWER_SPEED_FLOOR = 4;

/**
 * Ab welchem Einschlag ein Lastwechsel überhaupt zählt — P26.
 *
 * Unter 0,15 fährt man geradeaus, und geradeaus ist Gaswegnehmen kein
 * Lastwechsel, sondern Ausrollen. Ohne diese Schwelle drehte jeder Bremspunkt
 * auf der Geraden das Heck ein.
 */
const LIFT_MIN_STEER = 0.15;

/**
 * Ab welchem Gasstand das Pedal als „zu" gilt.
 *
 * 0,15 und nicht 0: die Rampe (`gasStep` = 9/s) braucht 0,11 s von voll auf
 * null, und ein Spieler lässt selten ganz los. Was darüber liegt, ist noch
 * Zug und kein Lastwechsel.
 */
const LIFT_OFF_THROTTLE = 0.15;

/**
 * Wie lange das Gas zu sein muss, bevor der Impuls kommt, s.
 *
 * **Die Zahl, die den Zweipunktregler aussperrt.** Sie ist zugleich die
 * physikalische: die Last braucht etwa eine Zehntelsekunde, um nach vorn zu
 * wandern und die Hinterachse leicht zu machen. Kürzer wäre ein Zucken, und
 * ein Zucken kippt kein Auto.
 */
const LIFT_ONSET = 0.12;

/**
 * Ab welchem Gasstand ein neuer Lastwechsel wieder möglich ist.
 *
 * Ohne diese Schwelle könnte ein Pedal, das um `LIFT_OFF_THROTTLE` herum
 * zittert, den Impuls beliebig oft neu setzen. Zwischen 0,15 und 0,5 liegt
 * genug Weg, dass nur ein wirkliches Wiederaufnehmen des Gases scharf macht.
 */
const LIFT_REARM_THROTTLE = 0.5;

/**
 * Abklingrate des Lastwechsel-Impulses, 1/s.
 *
 * 2,2/s ≙ Halbwertszeit 0,32 s. Ein Lastwechsel ist ein Vorgang von etwa einer
 * halben Sekunde — lang genug, dass die Nase eindreht und der Spieler
 * gegenlenken kann, kurz genug, dass er nicht in einen gehaltenen Drift
 * übergeht. Wer den halten will, gibt Gas oder zieht die Handbremse; dafür
 * gibt es die beiden anderen Wege.
 */
const LIFT_DECAY = 2.2;

export class ArcadeDynamics {
  #spec: ArcadeSpec;
  #looseBonus: number;

  /** Die **Eingabe** −1…1, ratenbegrenzt. Der Winkel ist eine Anzeige davon. */
  #steerInput = 0;
  #steerAngle = 0;
  #throttle = 0;
  /** Der abklingende Lastwechsel-Impuls, 0…1 — siehe `step()`. */
  #lift = 0;
  /** Wie lange das Gas im Bogen schon zu ist, s. */
  #offTime = 0;
  /** Ist der Impuls für diesen Lastwechsel schon gesetzt? */
  #liftArmed = false;
  #drift = 0;
  /** Restzeit der Drift-Scharfschaltung nach Loslassen, in s. Siehe `DRIFT_GATE`. */
  #driftArm = 0;
  #boost = 1;
  #yawRate = 0;
  #pitchRate = 0;
  /** Zuletzt gefahrener Drift-Zuschlag — hält das Vorzeichen über die Flaute. */
  #driftSign = 0;

  constructor(spec: ArcadeSpec, looseBonus: number) {
    this.#spec = spec;
    this.#looseBonus = looseBonus;
  }

  setSpec(spec: ArcadeSpec, looseBonus: number): void {
    this.#spec = spec;
    this.#looseBonus = looseBonus;
  }

  /** Alles auf Anfang — beim Absetzen des Fahrzeugs. */
  reset(): void {
    this.#steerInput = 0;
    this.#steerAngle = 0;
    this.#throttle = 0;
    this.#lift = 0;
    this.#offTime = 0;
    this.#liftArmed = false;
    this.#drift = 0;
    this.#driftArm = 0;
    this.#yawRate = 0;
    this.#pitchRate = 0;
    this.#driftSign = 0;
    // **Der Nitro-Vorrat bleibt stehen.** Ein Respawn nach einem Fehler soll
    // nicht auch noch den Boost verschenken — das bestraft den Fehler zweimal.
  }

  get yawRate(): number {
    return this.#yawRate;
  }

  set yawRate(value: number) {
    this.#yawRate = value;
  }

  get boost(): number {
    return this.#boost;
  }

  /** Nitro nachfüllen, 0…1 — Drift, Airtime und zerbrochene Hindernisse. */
  addBoost(amount: number): void {
    this.#boost = Math.min(1, this.#boost + amount);
  }

  get drift(): number {
    return this.#drift;
  }

  get steerAngle(): number {
    return this.#steerAngle;
  }

  snapshot(): ArcadeSnapshot {
    return {
      steerAngle: this.#steerAngle,
      throttle: this.#throttle,
      drift: this.#drift,
      boost: this.#boost,
      yawRate: this.#yawRate,
      pitchRate: this.#pitchRate,
    };
  }

  /**
   * Ein Schritt der waagerechten Dynamik.
   *
   * Ändert **nichts** an Position oder Geschwindigkeit — das tut `Vehicle`.
   * Diese Trennung ist der Grund, warum die Federung, der Bodenfang und die
   * Kollision aus P19…P21 unverändert weiterlaufen konnten.
   */
  step(dt: number, input: DriveCommand, env: PlanarEnv): PlanarResult {
    const spec = this.#spec;
    const speed = Math.hypot(env.vLong, env.vLat);

    // ── Belag ─────────────────────────────────────────────────────────────
    //
    // `looseBonus` wirkt **nur auf losem Boden** und nicht auf Asphalt: sonst
    // wäre er ein zweiter Grip-Regler neben `latG`, und zwei Regler für dieselbe
    // Größe sind in diesem Projekt schon dreimal als tote Stellschraube geendet.
    const surfaceGrip =
      env.surface === 'asphalt'
        ? ARCADE_SURFACE.asphalt
        : ARCADE_SURFACE[env.surface] * this.#looseBonus;
    // Aquaplaning: nasser Asphalt zählt anteilig als Wasser.
    const wet = Math.min(1, env.waterDepth / 0.35);
    const grip = Math.max(0.05, surfaceGrip * (1 - wet * 0.45)) * env.support;

    // ── Lenkeinschlag ─────────────────────────────────────────────────────
    this.#steer(dt, input.steer);
    this.#steerAngle = this.#displaySteer(Math.abs(env.vLong));

    // ── Gas ───────────────────────────────────────────────────────────────
    //
    // Die Rampe ist deutlich kürzer als im Einspurmodell (dort 0,25 s): sie war
    // dort nötig, damit ein Tastendruck nicht sofort die Haftgrenze sprengt.
    // Hier deckelt der Reibkreis das ohnehin, und eine Rampe, die man merkt, ist
    // auf einem Portal schlicht eine träge Steuerung.
    const gasStep = 9 * dt;
    this.#throttle += clamp(clamp01(input.throttle) - this.#throttle, -gasStep, gasStep);

    // ── Drift-Zustand ─────────────────────────────────────────────────────
    //
    // Er ist ein eigener Zustand und **kein** abgeleiteter Wert, und das ist die
    // wichtigste Entscheidung dieser Datei. Im Einspurmodell war „driftet" eine
    // Folge von Schräglaufwinkeln — also etwas, das dem Spieler *zustößt*. Hier
    // ist es etwas, das er **auslöst**: Space plus Lenken. Gas in der Kurve
    // hält ihn danach, reißt ihn aber nicht mehr an — sonst ist jede
    // Tastaturkurve schon ein Drift.
    const fastEnough = speed > DRIFT_MIN_SPEED;
    if (input.handbrake) this.#driftArm = DRIFT_GATE.armWindow;
    else this.#driftArm = Math.max(0, this.#driftArm - dt);
    // **Mit Schwelle, und die ist gemessen und nicht gegriffen.** Ohne sie
    // (erster Entwurf: `Gas · |Lenkung| · powerOversteer` direkt) driftete das
    // Coupé in *jeder* Kurve, in der jemand das Gas stehen ließ — gemessen
    // 111 °/s Gierrate bei 40 km/h und Vollausschlag, also ein Kreisel. Ein
    // Drift, der ungefragt passiert, ist kein Drift, sondern eine kaputte
    // Lenkung; das war exakt der Befund, gegen den P22 angetreten ist.
    //
    // Die Schwelle macht ihn zu einer Entscheidung: es braucht Gas **und**
    // Einschlag zugleich (Produkt über 0,45), voll ist er erst bei annähernd
    // beidem ganz. Die Handbremse geht daran vorbei — sie ist der direkte Weg.
    const provocation =
      fastEnough && env.vLong > 0
        ? this.#throttle *
          Math.abs(input.steer) *
          // Auf losem Boden bricht alles leichter aus.
          (env.surface === 'asphalt' ? 1 : 1.35)
        : 0;
    const powerSlide = clamp01((provocation - 0.45) / 0.45) * spec.powerOversteer;

    // ── Lastwechsel: der Fuß vom Gas — P26 ─────────────────────────────
    //
    // Bis P26 fehlte er ganz. `provocation` hängt an `Gas · |Lenkung|`, und
    // ohne Gas ist das Produkt null; der Prüfstand meldete folgerichtig für
    // alle vier Fahrzeuge „steer 0.80 4.9° → 4.9°" — Gaswegnehmen im Bogen
    // änderte **exakt nichts**. Das ist der Griff, mit dem man ohne Handbremse
    // eindreht, und er ist in einem Driftspiel nicht verhandelbar.
    //
    // **Ausgelöst über den Abfall und nicht über den Stand.** Ein Lastwechsel
    // ist ein Vorgang: Gewicht wandert nach vorn, die Hinterachse wird leicht,
    // das Heck dreht ein — und dann ist es vorbei. Ein Term am *Stand* des
    // Gases („wenig Gas ⇒ Drift") wäre etwas ganz anderes: er stünde die ganze
    // Kurve über an und machte jedes Ausrollen zum Drift.
    //
    // `#lift` ist deshalb ein Impuls, der von selbst abklingt. Sein
    // Gleichgewichtspunkt liegt bei null, und er kann per Konstruktion nicht
    // davonlaufen — die Lehre aus dem ersten Drift-Entwurf in P22, der eine
    // feste Gierrate addierte und den Wagen bei 40 km/h auf 111 °/s hochdrehte.
    //
    // Die Probe „Drift ohne Absicht" bleibt heil: sie fährt mit **konstantem**
    // Gas, und konstant heißt Abfall null heißt Impuls null.
    // > **Der erste Entwurf hing an der Flanke, und die Probe hat ihn
    // > gestoppt.** Er addierte bei jedem Gasabfall; damit meldete
    // > `arcade.mts` „Saubere Kurve 90 km/h: Schwimm 29,1° ⚠ driftet
    // > ungefragt". Die Ursache stand im Prüfstand: `holdSpeed` ist ein
    // > **Zweipunktregler** (`speed < target ? 1 : 0`) und hackt das Gas mit
    // > rund 10 Hz an und aus. Jede Flanke war ein Impuls, und zwischen zwei
    // > Flanken klang er nicht ab.
    // >
    // > Der Fehler ist nicht die Empfindlichkeit, sondern die **Größe**: eine
    // > Flanke ist ein Zeitpunkt, ein Lastwechsel ist ein Vorgang. Die Last
    // > braucht Zeit, um nach vorn zu wandern; ein 30-ms-Zucken am Gaspedal
    // > kippt kein Auto. Ausgelöst wird deshalb über eine **Dauer** — das Gas
    // > muss `LIFT_ONSET` lang wirklich zu sein.
    const cornering = fastEnough && env.vLong > 0 && Math.abs(input.steer) > LIFT_MIN_STEER;
    if (cornering && !input.handbrake && this.#throttle < LIFT_OFF_THROTTLE) {
      this.#offTime += dt;
    } else {
      this.#offTime = 0;
    }
    // Genau **ein** Impuls je Lastwechsel. Ohne die Sperre liefe er, solange
    // der Fuß unten bleibt, und aus dem Vorgang würde ein Zustand: wer eine
    // lange Kurve ausrollt, driftete dann dauerhaft.
    if (this.#offTime >= LIFT_ONSET && !this.#liftArmed) {
      this.#liftArmed = true;
      this.#lift = Math.abs(input.steer);
    }
    // Wieder Gas geben schärft ihn neu — und beendet ihn zugleich über den
    // Abfall unten. Das ist auch der Griff, mit dem man einen Lastwechsel
    // einfängt: zurück aufs Gas.
    if (this.#throttle > LIFT_REARM_THROTTLE) this.#liftArmed = false;
    this.#lift *= Math.exp(-LIFT_DECAY * dt);
    if (this.#lift < 1e-3) this.#lift = 0;
    const liftSlide = this.#lift * spec.liftOversteer;

    // Anriss nur hinter Space (gehalten oder kurz davor) **und** Lenkung.
    // Space auf der Geraden allein darf `want` nicht auf 1 setzen — sonst
    // übernimmt `#driftSign` die letzte Kurve. Halten danach: Gas·Lenkung und
    // Lastwechsel, aber nur wenn der Drift schon offen ist.
    const steering = Math.abs(input.steer) >= DRIFT_GATE.enterSteer;
    const armed = input.handbrake || this.#driftArm > 0;
    const initiate = !env.airborne && fastEnough && armed && steering;
    const sustain = !env.airborne && fastEnough && this.#drift > DRIFT_GATE.sustainDrift;
    const want = initiate ? 1 : sustain ? Math.max(powerSlide, liftSlide) : 0;
    const driftRate = want > this.#drift ? spec.driftRise : spec.driftFall;
    this.#drift += (want - this.#drift) * (1 - Math.exp(-driftRate * dt));
    if (this.#drift < 1e-3) this.#drift = 0;

    // ── Soll-Gierrate ─────────────────────────────────────────────────────
    const aLatMax = this.#latAccel(grip, speed);
    let yawTarget = this.#yawTarget(env.vLong, env.vLat, speed, aLatMax, input);

    if (env.airborne) {
      // Luftsteuerung. Sie ist Winkel*beschleunigung* und keine Sollrate — in der
      // Luft gibt es nichts, was eine Rate erzwänge, und ein Wagen, der im Flug
      // sofort auf eine Sollrate springt, sieht aus wie ein Modellflugzeug.
      this.#yawRate += -Math.sign(input.steer) * Math.abs(input.steer) * AIR_CONTROL.yaw * dt;
      this.#yawRate *= Math.exp(-AIR_CONTROL.damping * dt);
      this.#pitchRate +=
        (clamp01(input.brake) - clamp01(input.throttle)) * AIR_CONTROL.pitch * dt;
      this.#pitchRate *= Math.exp(-AIR_CONTROL.damping * dt);
    } else {
      this.#pitchRate *= Math.exp(-8 * dt);
      // **Die Fangleine.** Ohne Lenkeingabe zieht sie die Nase in die
      // Fahrtrichtung — genau das, was ein Fahrer mit Gegenlenken täte und was
      // mit einer Taste nicht dosierbar ist. Sie ist null, sobald jemand lenkt,
      // kann also nichts verfälschen, was der Spieler selbst tut. Begründung bei
      // `ArcadeSpec.catchAssist`.
      if (Math.abs(input.steer) < 0.2 && speed > 2 && !input.handbrake) {
        const slip = Math.atan2(env.vLat, Math.abs(env.vLong));
        // Ein Schwimmwinkel nach rechts (positiv) heißt: die Nase muss nach
        // rechts, also ψ fallen. Daher das Minus — dieselbe Kette wie oben.
        yawTarget += -slip * spec.catchAssist * Math.min(1, speed / 8);
      }
      const blend = 1 - Math.exp(-spec.yawResponse * dt);
      this.#yawRate += (yawTarget - this.#yawRate) * blend;
    }
    this.#yawRate = clamp(this.#yawRate, -spec.maxYawRate, spec.maxYawRate);
    this.#pitchRate = clamp(this.#pitchRate, -2.5, 2.5);

    // ── Querkraft ─────────────────────────────────────────────────────────
    //
    // Die Reifen ziehen die Quergeschwindigkeit gegen null. Wie schnell, sagt
    // `k`; wie viel höchstens, sagt `aLatMax`. Beides zusammen ist der ganze
    // Reibkreis dieses Modells — und er ist absichtlich weich: eine harte
    // Ellipse macht den Übergang zum Rutschen zu einer Kante, und Kanten kann
    // ein Spieler mit einer Taste nicht bedienen.
    const k = lerp(spec.latGrip, spec.driftLatGrip, this.#drift) * grip;
    let accelLat = env.airborne ? 0 : (-env.vLat * (1 - Math.exp(-k * dt))) / dt;
    const latBudget = aLatMax * (1 - 0.25 * this.#drift);
    accelLat = clamp(accelLat, -latBudget, latBudget);

    // ── Längskraft ────────────────────────────────────────────────────────
    const longitudinal = this.#longitudinal(input, env, grip);
    let accelLong = longitudinal.accel;

    // Haftreibung im Stand: hält den Wagen am Hang, statt ihn rückwärts rollen
    // zu lassen. Dieselbe Konstruktion wie im Einspurmodell und aus demselben
    // Grund — ohne sie steht kein Auto an einer Steigung.
    //
    // > **`!reverse` ist die Reparatur eines gemessenen Fehlers.** Die Bremse
    // > legt im Stand den Rückwärtsgang ein (es gibt keinen Gangwahlschalter),
    // > und die Haltebedingung prüft ebenfalls auf „Bremse gedrückt, steht
    // > fast". Ohne die Ausnahme greifen beide zugleich: die Haltekraft löscht
    // > die Rückwärtsbeschleunigung punktgenau aus, und das Auto steht.
    // >
    // > Gemessen mit `tools/bench/world.mts`, Lastwagen: „Innenecke, rückwärts
    // > heraus **0,00 m**" statt 9,40 m, und „Schraubstock: in 4 s heraus
    // > 0,00 m" gegen ein Soll von 2 m. Ein Spieler, der sich in einer Ecke
    // > festfährt, käme dort nie wieder heraus.
    // >
    // > Das Einspurmodell hatte den Fall zufällig richtig: dort war `throttle`
    // > eine **lokale** Variable, die im Rückwärtsgang den Bremswert übernahm,
    // > und die Haltebedingung prüfte genau sie. Beim Umbau ist daraus
    // > `this.#throttle` geworden — derselbe Name, eine andere Größe.
    if (
      !env.airborne &&
      !longitudinal.reverse &&
      this.#throttle <= 0.02 &&
      (input.brake > 0.5 || input.handbrake) &&
      speed < STATIC_HOLD_SPEED
    ) {
      const hold = grip * GRAVITY;
      accelLong += clamp(-env.vLong / dt - accelLong, -hold, hold);
    }

    // ── Ablesbares ────────────────────────────────────────────────────────
    const slip = speed > 1.5 ? Math.atan2(env.vLat, Math.abs(env.vLong)) : 0;
    const slipAmount = Math.min(1, Math.abs(slip) / DRIFT_MAX_ANGLE);
    const skid = env.airborne
      ? 0
      : Math.max(
          Math.abs(slip) > DRIFT_SCORE_ANGLE
            ? Math.min(1, (Math.abs(slip) - DRIFT_SCORE_ANGLE) / 0.35)
            : 0,
          longitudinal.wheelspin > 1 ? Math.min(1, (longitudinal.wheelspin - 1) / 0.4) : 0,
          input.handbrake && speed > DRIFT_MIN_SPEED ? 0.7 : 0,
        );

    // ── Nitro ─────────────────────────────────────────────────────────────
    if (longitudinal.boosting) {
      this.#boost = Math.max(0, this.#boost - dt / spec.boostCapacity);
    } else {
      // Verdient wird er im Drift und in der Luft — die Schleife aus
      // `BOOST_EARN`. Nicht im Stand: ein Wagen, der an der Wand steht und
      // Handbremse zieht, soll nichts bekommen.
      let earn = 0;
      if (env.airborne) earn += BOOST_EARN.air;
      else if (this.#drift > 0.15 && slipAmount > 0.12) earn += BOOST_EARN.drift * slipAmount;
      earn += spec.boostRefill;
      this.#boost = Math.min(1, this.#boost + earn * dt);
    }

    return {
      accelLong,
      accelLat,
      yawRate: this.#yawRate,
      pitchRate: env.airborne ? this.#pitchRate : 0,
      drift: this.#drift,
      slip,
      skid,
      wheelspin: longitudinal.wheelspin,
      boosting: longitudinal.boosting,
      boost: this.#boost,
      steerAngle: this.#steerAngle,
    };
  }

  // ── Teilschritte ────────────────────────────────────────────────────────

  /**
   * Die Hand am Lenkrad nachführen — ein normierter Wert, kein Winkel.
   *
   * > **Bis zur zweiten Fassung stand hier der Radeinschlag selbst**, mit dem
   * > Tempoabfall aus `steerFalloff` darauf. Die Soll-Gierrate wurde daraus
   * > kinematisch gebildet, und der Grip-Deckel schnitt sie ab. Gemessen war das
   * > wieder ein Schalter, nur an anderer Stelle:
   * >
   * > ```
   * > Lenkantwort 90 km/h:  33.4  33.4  33.4  33.4  33.4 °/s   (Lenkung 0,2…1,0)
   * > ```
   * >
   * > Schon **20 %** Einschlag reichen bei 90 km/h für die Haftgrenze; alles
   * > darüber ist wirkungslos. Das ist derselbe Befund, gegen den P22 angetreten
   * > ist — die Kurve war nur flach statt fallend.
   *
   * Geführt wird deshalb die **Eingabe** (−1…1) und nicht der Winkel, und die
   * Soll-Gierrate ist ihr *Anteil* an dem, was gerade möglich ist. Damit ist die
   * Lenkung bei jedem Tempo proportional: halber Ausschlag, halbe Drehung. Der
   * Radeinschlag fürs Bild entsteht daraus weiter unten — er ist eine Anzeige und
   * keine Ursache mehr.
   */
  #steer(dt: number, request: number): void {
    const spec = this.#spec;
    const target = clamp(request, -1, 1);
    let rate = Math.abs(target) < Math.abs(this.#steerInput) ? spec.steerReturn : spec.steerRate;
    if (this.#drift < 0.05 && Math.abs(request) < DRIFT_GATE.enterSteer) {
      rate = Math.max(rate, spec.steerReturn * 2.2);
    }
    const step = rate * dt;
    this.#steerInput += clamp(target - this.#steerInput, -step, step);
  }

  /** Radeinschlag für das Bild — mit Tempoabfall, wie ihn ein Fahrer macht. */
  #displaySteer(speed: number): number {
    return this.#steerInput * this.#lockAngle(speed);
  }

  /** Voller Radeinschlag bei diesem Tempo, rad. */
  #lockAngle(speed: number): number {
    const spec = this.#spec;
    return spec.steerAngle / (1 + speed / spec.steerFalloff);
  }

  /** Größte Querbeschleunigung mit Abtrieb, m/s². */
  #latAccel(grip: number, speed: number): number {
    const spec = this.#spec;
    // Abtrieb als Anteil, nicht als Kraft: `downforce` ist hier definiert als
    // „so viel Prozent mehr Haftung bei 80 m/s". Eine Kraft müsste durch die
    // Masse geteilt werden, und die Masse steht in einer anderen Datei — das
    // wäre eine Abhängigkeit für einen Effekt, den man in einer Zeile hinschreibt.
    const aero = 1 + spec.downforce * Math.min(1.6, (speed / 80) * (speed / 80));
    return spec.latG * GRAVITY * grip * aero;
  }

  /**
   * Soll-Gierrate aus Lenkeinschlag, Haftung und Drift.
   *
   * Drei Anteile, und die Reihenfolge ist bedeutsam:
   *
   *  1. **Kinematisch** — `ω = −v·tan(δ)/L`. Das ist die Drehung, die ein
   *     rollendes Fahrzeug mit diesem Einschlag *geometrisch* macht. Sie ist
   *     linear in der Eingabe und damit monoton, und genau daran ist das
   *     Einspurmodell gescheitert.
   *  2. **Grip-Deckel** — `|ω| ≤ a_lat/v`. Er ist das Untersteuern: wer bei
   *     200 km/h voll einschlägt, bekommt nicht mehr Drehung, sondern schiebt
   *     geradeaus. Der Deckel steht *vor* dem Drift-Zuschlag, sonst wäre die
   *     Haftgrenze mit gezogener Handbremse aufgehoben.
   *  3. **Drift-Zuschlag** — er darf über den Deckel hinaus. Das *ist* der
   *     Drift: die Nase dreht weiter, als die Reifen die Bahn tragen.
   */
  #yawTarget(
    vLong: number,
    vLat: number,
    speed: number,
    aLatMax: number,
    input: DriveCommand,
  ): number {
    const spec = this.#spec;
    // **Anteil statt Winkel.** `kinMax` ist die Gierrate bei *vollem* Einschlag
    // (Ackermann, `ω = v·tan(δ)/L`), `cap` die, welche die Haftung noch trägt
    // (`|ω|·v ≤ a_lat`). Das Minimum ist, was dieses Fahrzeug bei diesem Tempo
    // überhaupt kann; die Eingabe wählt den Anteil daran.
    //
    // Bei niedrigem Tempo bindet `kinMax` (der Wendekreis), bei hohem `cap`
    // (das Untersteuern) — und in beiden Fällen bleibt die Antwort **linear in
    // der Eingabe**. Genau das war der Befund gegen beide Vorgänger.
    //
    // Rückwärts dreht die Lenkung andersherum; das ergibt sich von selbst, weil
    // `vLong` vorzeichenbehaftet in `kinMax` steht.
    const kinMax = (vLong * Math.tan(this.#lockAngle(Math.abs(vLong)))) / this.#wheelbase;
    const cap = aLatMax / Math.max(speed, YAW_CAP_SPEED);
    let target = -this.#steerInput * Math.min(Math.abs(kinMax), cap) * Math.sign(vLong || 1);

    if (this.#drift > 0.01 && speed > DRIFT_MIN_SPEED) {
      // **Das Vorzeichen kommt aus der Lenkung, nicht aus der Gierrate.** Aus
      // der Gierrate gebildet wäre es eine Mitkopplung: ein Wagen, der sich
      // dreht, drehte sich deshalb weiter. Ein gesetztes Vorzeichen bleibt
      // stehen, solange der Drift offen ist — sonst schnappt der Zuschlag in
      // dem Moment auf null, in dem der Spieler gegenlenkt.
      //
      // Nicht aus Restgieren erfinden: Space auf der Geraden ohne Lenkung
      // hätte sonst die letzte Kurve fortgesetzt.
      if (Math.abs(input.steer) > 0.1) this.#driftSign = Math.sign(input.steer);

      // **Geregelt wird auf den Winkel, nicht auf die Rate.** Die vollständige
      // Begründung samt der Rechnung, warum eine feste Zusatzrate kein
      // Gleichgewicht hat, steht bei `ArcadeSpec.driftAngle`. Hier zählt die
      // Umsetzung: `beta` ist der Schwimmwinkel **in Driftrichtung** gemessen
      // (positiv = der Wagen steht schon quer, wie gewünscht), und der Zuschlag
      // schiebt nur, solange er unter dem Ziel liegt.
      //
      // Ein Zuschlag ohne dieses `max(0, …)` wäre eine Bremse, sobald der Wagen
      // über das Ziel hinausrutscht — und die gehört `latGrip`, nicht der
      // Lenkung. Zwei Dinge, die dieselbe Größe regeln, laufen in diesem
      // Projekt erfahrungsgemäß gegeneinander.
      const beta = -this.#driftSign * Math.atan2(vLat, Math.max(1, Math.abs(vLong)));
      const missing = Math.max(0, spec.driftAngle * this.#drift - beta);
      target += -this.#driftSign * missing * spec.driftYawGain * Math.min(1, speed / 12);
    } else {
      this.#driftSign = 0;
    }
    return target;
  }

  /**
   * Radstand für die Kinematik.
   *
   * **Er steht nicht in `ArcadeSpec`, und das ist Absicht.** Der Radstand ist
   * ein Maß der Karosserie und gehört in `chassis`; ihn hier ein zweites Mal
   * zu führen wäre genau die Doppelung, an der dieses Projekt schon zweimal
   * auseinandergelaufen ist. Gesetzt wird er von `Vehicle.setSpec`.
   */
  #wheelbase = 2.4;

  setWheelbase(value: number): void {
    this.#wheelbase = Math.max(1, value);
  }

  #longitudinal(
    input: DriveCommand,
    env: PlanarEnv,
    grip: number,
  ): { accel: number; wheelspin: number; boosting: boolean; reverse: boolean } {
    const spec = this.#spec;
    if (env.airborne) {
      // In der Luft nur Luftwiderstand — kein Rad, keine Kraft.
      return {
        accel: (-spec.drag * env.vLong * Math.abs(env.vLong)) / this.#mass,
        wheelspin: 0,
        boosting: false,
        reverse: false,
      };
    }

    let throttle = this.#throttle;
    let brake = clamp01(input.brake);
    // Bremse im Stand = Rückwärtsgang. Kein Gangwahlschalter: in einem
    // Arcade-Spiel erwartet den niemand, und ein Auto, das nicht zurückstoßen
    // kann, steht nach der ersten verpassten Kehre endgültig.
    //
    // > **Die Handbremse hebt das auf, und das ist die Reparatur eines
    // > gemessenen Fehlers.** Vor dem Start eines Rennens halten die Gegner mit
    // > „Bremse voll, Handbremse gezogen" — die einzige Eingabe, die *stehen
    // > bleiben* heißt. Ohne diese Bedingung legte sie den Rückwärtsgang ein,
    // > und die Bremse wurde dabei zum **Gas**: gemessen mit `tools/smoke.mjs`
    // > standen alle drei Gegner nach dem Countdown 5 m neben der Straße und
    // > 124° quer zu ihr, danach fuhren sie ins Gelände und kamen nie zurück.
    // > Der Befund sah aus wie ein kaputter KI-Regler und war ein Vorzeichen im
    // > Getriebe.
    // >
    // > Die Regel gilt für den Spieler genauso und ist dort ebenfalls richtig:
    // > wer Handbremse und Bremse zugleich hält, will halten.
    let reverse = false;
    if (brake > 0 && !input.handbrake && env.vLong < 0.6 && throttle <= 0.02) {
      reverse = true;
      throttle = brake;
      brake = 0;
    }

    let force = 0;
    if (throttle > 0) {
      if (reverse) {
        force = env.vLong > -12 ? -throttle * spec.launchForce * 0.35 : 0;
      } else {
        // `F = min(F_start, P/v)`. Die Endgeschwindigkeit ergibt sich aus dem
        // Gleichgewicht mit dem Luftwiderstand und wird nicht gesetzt.
        const v = Math.max(Math.abs(env.vLong), POWER_SPEED_FLOOR);
        force = throttle * Math.min(spec.launchForce, spec.power / v);
      }
    }

    // ── Nitro ─────────────────────────────────────────────────────────────
    const boosting = input.boost && this.#boost > 0 && !reverse && env.vLong > -0.5;
    const boostAccel = boosting ? spec.boostAccel : 0;

    // Bremse. Sie darf die Haftgrenze überschreiten — das ist Arcade und
    // ausdrücklich gewollt: ein Spieler, der bremst, will stehenbleiben.
    const brakeDecel = brake * spec.brakeG * GRAVITY * (0.4 + 0.6 * grip);
    const brakeSign = env.vLong > 0 ? -1 : env.vLong < 0 ? 1 : 0;

    // Widerstände.
    const drag = (-spec.drag * env.vLong * Math.abs(env.vLong)) / this.#mass;
    const rollSign = Math.sign(env.vLong) * Math.min(1, Math.abs(env.vLong) / 0.6);
    // Der Untergrund dämpft **proportional zum Tempo** — Begründung samt der
    // Messung, die den Festbetrag verworfen hat, bei `ARCADE_SURFACE_DRAG`.
    const surfaceK =
      env.waterDepth > 0.05
        ? ARCADE_SURFACE_DRAG.wasser * Math.min(1, env.waterDepth / 0.5)
        : ARCADE_SURFACE_DRAG[env.surface];
    const roll = -rollSign * spec.rollDecel - env.vLong * surfaceK;

    // Antrieb, gedeckelt durch die Haftung. Der Überschuss ist der
    // Durchdrehfaktor — und der ist im Arcade-Modell nur noch eine **Anzeige**
    // (Rauch, Ton, Spur), keine Kraft mehr. Im Einspurmodell aß er die
    // Seitenführung; hier macht das `drift`, und zwar dosierbar.
    const driveAccel = force / this.#mass;
    const tractionLimit = grip * GRAVITY * 1.35;
    const wheelspin = tractionLimit > 0.1 ? Math.abs(driveAccel) / tractionLimit : 0;
    const used = clamp(driveAccel, -tractionLimit, tractionLimit);

    return {
      accel: used + boostAccel + brakeDecel * brakeSign + drag + roll,
      wheelspin,
      boosting,
      reverse,
    };
  }

  /**
   * Masse für die Umrechnung von Kraft in Beschleunigung.
   *
   * Wie der Radstand aus `chassis` hereingereicht statt hier geführt —
   * dieselbe Begründung, dieselbe Falle.
   */
  #mass = 1150;

  setMass(value: number): void {
    this.#mass = Math.max(1, value);
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
