import type { DriveInput } from '../Vehicle';
import type { RaceLine } from './RaceLine';

/**
 * Ein KI-Fahrer — P23.
 *
 * ## Was er ist und was er ausdrücklich nicht ist
 *
 * Er ist ein **Regler auf einer Eingabe**, kein zweites Fahrmodell. Er drückt
 * dieselben vier Knöpfe wie der Spieler (Gas, Bremse, Lenkung, Handbremse), und
 * was daraus wird, rechnet dieselbe `Vehicle`-Instanzklasse. Die Alternative —
 * Gegner, die auf der Linie interpoliert werden — wäre billiger und in jeder
 * Hinsicht schlechter: solche Gegner lassen sich nicht rammen, driften nicht,
 * fliegen nicht über eine Kuppe und fahren auf einem nassen Reisfeld genauso
 * schnell wie auf Asphalt. Der Spieler merkt das binnen zwei Kurven.
 *
 * Die Kosten sind gemessen und klein: ein Simulationsschritt mit Kollision
 * kostet 0,005…0,008 ms (`tools/bench/world.mts`), drei Gegner also unter
 * 0,03 ms je Frame.
 *
 * ## Der Regler
 *
 * ```
 *   1. Wo bin ich auf der Linie?          nearestArc, mit Cursor
 *   2. Wie weit daneben?                  Querabstand, vorzeichenbehaftet
 *   3. Wie schief dazu?                   Winkel gegen die Tangente **voraus**
 *   4. Lenkung                            beide Fehler addiert (Stanley)
 *   5. Solltempo                          RaceLine.speedAt(arc + Vorlauf) × Können
 *   6. Gas / Bremse                       Regelabweichung, mit Totband
 * ```
 *
 * ## Warum nicht Pure Pursuit — gemessen und verworfen
 *
 * Der erste Entwurf zielte auf einen Punkt `9 + 0,55·v` Meter voraus auf der
 * Linie und lenkte auf den Winkelfehler dorthin. Das ist das
 * Lehrbuchverfahren, und auf dieser Karte fährt es in den Graben. Gemessen mit
 * einem Gegner auf der Ringstraße, erste zehn Sekunden:
 *
 * ```
 *   t=2 s   12,3 m neben der Linie, Lenkung −0,77
 *   t=5 s   12,6 m,                 Lenkung −0,23
 *   t=10 s  15,0 m,                 Lenkung −0,34   ← wächst
 * ```
 *
 * Der Wagen fuhr **parallel zur Straße im Gelände** und kam nie zurück. Der
 * Grund ist die Bauart des Verfahrens: Pure Pursuit regelt auf einen *Winkel*,
 * und ein Winkelfehler von 6° gehört zu jedem beliebigen Querabstand, wenn der
 * Zielpunkt weit genug vorn liegt. Es hat keinen Term, der den Abstand selbst
 * sieht — auf einer Rennstrecke reicht das, weil man dort nie 12 m daneben
 * landet; auf einer offenen Karte mit Bodenwellen und Sprüngen landet man das
 * ständig.
 *
 * Der Ersatz ist die **Stanley-Regel**: Querabstand *und* Winkelfehler, jeder
 * mit eigenem Beiwert. Der Querterm ist `atan(k·e / (v + v₀))` — er wirkt bei
 * niedrigem Tempo stark (dort hat man Zeit) und läuft mit dem Tempo aus (dort
 * wäre er ein Lenkschlag). Ein Wagen, der 12 m daneben steht, bekommt damit
 * `atan(0,9·12 / 15) = 36°` Sollabweichung und damit Vollausschlag.
 *
 * ## Gummiband
 *
 * `catchUp` verschiebt das Sollzeitmaß, **nicht** die Position. Ein Gegner, der
 * beim Zurückfallen teleportiert, ist als Betrug erkennbar; einer, der schneller
 * fährt, ist es nicht. Der Faktor ist gedeckelt (0,88…1,12), also nie mehr als
 * ein Zwölftel — darüber wird aus dem Gummiband ein Motor, der sichtbar an- und
 * abschaltet.
 */
export interface RivalSkill {
  /**
   * Anteil des rechnerischen Kurventempos, das dieser Fahrer wirklich fährt.
   *
   * Unter 1, weil die `RaceLine` mit der **vollen** Querbeschleunigung des
   * Fahrzeugs rechnet und ein Fahrer, der genau dort fährt, bei der ersten
   * Bodenwelle abfliegt. 0,88 bis 0,97 spannt das Feld auf.
   */
  readonly pace: number;
  /** Seitlicher Versatz zur Mittellinie, m. Hält die Gegner auseinander. */
  readonly lane: number;
  /** Wie stark das Gummiband greift, 0…1. */
  readonly rubber: number;
  /**
   * Wie sehr dieser Fahrer um Position kämpft, 0…1.
   *
   * Steuert Überholen und den letzten Renndrittel — nicht das Grundtempo.
   * Tempo bleibt an `pace`; wer beides in eine Zahl packt, kann hinterher
   * nicht mehr sagen, *warum* ein Gegner schnell war.
   */
  readonly aggression?: number;
  /** Linie verteidigen, wenn der Spieler hinten drauf ist, 0…1. */
  readonly block?: number;
  /**
   * Spätbremsen, 0…1 — kürzt die Tempo-Vorausschau.
   *
   * 0 liest das Solltempo 1,6 s voraus (der Tabellenwert). 1 liest 0,9 s
   * voraus: der Wagen trägt mehr Tempo in die Kurve und riskiert den Ausgang.
   */
  readonly lateBrake?: number;
  /** Wie bereitwillig Nitro, 0…1. */
  readonly boostHunger?: number;
  /**
   * Sollabstand zum Spieler, m. Positiv = dieser Fahrer will vorn liegen.
   *
   * Das Gummiband zieht auf den Slot, nicht auf null — Pure, nicht NFS.
   * Ein Slot von +20 m heißt „ich will 20 m führen", nicht „ich warte".
   */
  readonly slot?: number;
}

/**
 * Ein Wagen in der Nachbarschaft — für Überholen, Decken und Windschatten.
 *
 * Koordinaten im Fahrzeugsystem des Fahrers: `along` entlang der Nase,
 * `across` nach rechts. `progress` ist die Differenz auf der Ideallinie
 * (positiv = der andere liegt vorn). Beide werden gebraucht: die Linie
 * sagt, wer führt, die Nase sagt, wohin man ausweichen muss.
 */
export interface NearbyRacer {
  readonly progress: number;
  readonly along: number;
  readonly across: number;
  readonly speed: number;
  readonly isPlayer: boolean;
}

/** Vorausschau für den **Winkel**: Grundweite plus Anteil des Tempos, m. */
const LOOKAHEAD_BASE = 8;
const LOOKAHEAD_PER_SPEED = 0.45;
/** Wie weit voraus das Solltempo abgelesen wird, in Sekunden. */
const SPEED_PREVIEW = 1.6;
/** Beiwert des Winkelfehlers. 1,4 heißt: 41° Fehler ergeben Vollausschlag. */
const HEADING_GAIN = 1.4;
/**
 * Beiwert des Querabstands, 1/s.
 *
 * `atan(k·e / (v + v₀))` — bei 12 m Abstand und 12 m/s ergibt k = 0,9 einen
 * Beitrag von 36°, also Vollausschlag. Bei 1 m Abstand sind es 3,4°, und das
 * ist die Feinkorrektur, die den Wagen auf der Linie hält, ohne zu pendeln.
 */
const CROSS_GAIN = 0.9;
/**
 * Tempo im Nenner des Querterms, m/s — und zwar als **Untergrenze**, nicht als
 * Summand.
 *
 * > **Der erste Entwurf hatte `speed + 12`, und damit hoben sich die beiden
 * > Regelterme gegenseitig auf.** Ein Gegner 20 m links der Linie, 27° schief
 * > dazu und mit 11 km/h unterwegs bekam aus dem Querterm +0,88 („nach rechts")
 * > und aus dem Winkelterm −0,66 („nach links, die Straße dreht dorthin"). Netto
 * > 0,2 — er stand für den Rest des Rennens im Reisfeld. Gemessen 92 % der Zeit
 * > neben der Fahrbahn.
 * >
 * > Mit `max(v, 4)` ist der Querterm bei Schrittgeschwindigkeit `atan(0,9·20/4)`
 * > = 77° und damit **dominant** — genau das, was die Stanley-Regel meint: je
 * > langsamer man ist, desto steiler darf man zurückstechen. Bei Renntempo
 * > (40 m/s, 2 m Abstand) sind es 2,6°, und dort ist der Winkelterm der
 * > wichtigere.
 */
const CROSS_SPEED_FLOOR = 4;
/** Gewicht des Querterms gegenüber dem Winkelterm. */
const CROSS_WEIGHT = 1.2;
/**
 * Wie weit vor dem Fahrzeug die Krümmung für die Vorsteuerung abgelesen wird,
 * als Anteil der Winkel-Vorausschau.
 *
 * 0,5 — also die halbe Strecke zwischen Wagen und Zielpunkt. Ganz vorn abgelesen
 * lenkte der Wagen zu früh ein und schnitt die Kurve an, an der eigenen Stelle
 * zu spät. Der Wert ist innerhalb von 0,35…0,65 nicht unterscheidbar und damit
 * **gewählt**, nicht gemessen.
 */
const FEEDFORWARD_LEAD = 0.5;
/** Ab diesem Querabstand gilt ein Gegner als abgekommen, m. */
const RECOVER_OFFSET = 7;
/** Mit welchem Tempo er dann zurückfährt, m/s. */
const RECOVER_SPEED = 14;
/** Wie weit die Fahrspur maximal von der Mittellinie abweichen darf, m. */
const LANE_LIMIT = 2.6;
/** Abstand, in dem ein Wagen vorn als Hindernis zählt, m. */
const PASS_NEAR = 18;
/** Abstand, in dem ein Wagen hinten als Angreifer zählt, m. */
const BLOCK_NEAR = 16;
/** Wie lange ein Überholversuch gehalten wird, s — sonst wirkt er zaghaft. */
const PASS_HOLD = 0.95;
/** Windschatten: Längsfenster, m. */
const DRAFT_ALONG = 11;
/** Windschatten: Querfenster, m. */
const DRAFT_ACROSS = 1.3;
/** Tempozuschlag im Windschatten. */
const DRAFT_GAIN = 0.055;
/** Letztes Renndrittel: zusätzlicher Pace, skaliert mit `aggression`. */
const LATE_PACE = 0.045;

export class RivalDriver {
  readonly input: DriveInput = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    boost: false,
  };

  /** Bogenlänge des zuletzt gefundenen Linienpunkts — der Cursor aus `nearestArc`. */
  #arc = 0;
  /**
   * Insgesamt zurückgelegter Weg auf der Linie, in Metern.
   *
   * **Das ist die Zahl, nach der die Platzierung sortiert wird**, und sie wird
   * aus `RaceLine.delta()` aufsummiert statt aus `Runde × Länge + arc` gebildet.
   * Der Unterschied ist die Naht der geschlossenen Strecke; die Begründung samt
   * der Messung, die den ersten Entwurf verworfen hat, steht bei `delta()`.
   *
   * Nebenwirkung, die gewollt ist: **Rückwärtsfahren zählt rückwärts.** Wer auf
   * der Ringstraße wendet, verliert Fortschritt, statt ihn ein zweites Mal zu
   * sammeln.
   */
  #distance = 0;
  /** Wie lange der Wagen schon fast steht, s. Löst das Rangieren aus. */
  #stuck = 0;
  #reverse = 0;
  /** Geglättete Fahrspur, m — springt nicht, wenn der Überholentschluss fällt. */
  #lane = 0;
  /** Restliche Haltedauer eines Überholversuchs, s. */
  #commit = 0;
  /** Vorzeichen der Überholseite, oder 0. */
  #passSide = 0;
  /** Nur für den Prüfstand: die beiden Regelabweichungen des letzten Schritts. */
  cross = 0;
  headingError = 0;
  /** Nur für den Prüfstand: welche Taktik der letzte Schritt gewählt hat. */
  tactic: 'race' | 'overtake' | 'defend' | 'recover' = 'race';

  readonly #line: RaceLine;
  readonly #skill: RivalSkill;

  constructor(line: RaceLine, skill: RivalSkill) {
    this.#line = line;
    this.#skill = skill;
    this.#lane = skill.lane;
  }

  get arc(): number {
    return this.#arc;
  }

  get distance(): number {
    return this.#distance;
  }

  /** Sollabstand zum Spieler, m — der Slot, auf den das Gummiband zieht. */
  get skillSlot(): number {
    return this.#skill.slot ?? 0;
  }

  get skillRubber(): number {
    return this.#skill.rubber;
  }

  /** Auf eine Bogenlänge setzen — beim Aufstellen und nach einem Respawn. */
  /**
   * Auf eine Bogenlänge setzen — beim Aufstellen und nach einer Rettung.
   *
   * `distance` wird **übergeben und nicht genullt**, wenn es sie schon gibt: ein
   * geretteter Gegner soll seinen Fortschritt behalten, sonst fiele er in der
   * Platzierung auf den letzten Platz zurück und das Gummiband schösse ihn
   * anschließend nach vorn.
   */
  placeAt(arc: number, distance = 0): void {
    this.#arc = arc;
    this.#distance = distance;
    this.#stuck = 0;
    this.#reverse = 0;
    this.#lane = this.#skill.lane;
    this.#commit = 0;
    this.#passSide = 0;
    this.tactic = 'race';
  }

  /**
   * Eingabe für einen Simulationsschritt bilden.
   *
   * `catchUp` ist das Gummiband: > 1 heißt „schneller fahren". Es kommt von
   * außen, weil nur der Rennleiter weiß, wo der Spieler steht.
   */
  drive(
    dt: number,
    position: { x: number; z: number },
    yaw: number,
    speed: number,
    catchUp: number,
    traffic: readonly NearbyRacer[] = EMPTY_TRAFFIC,
    raceFrac = 0.5,
  ): DriveInput {
    const line = this.#line;
    const found = line.nearestArc(position.x, position.z, this.#arc);
    this.#distance += line.delta(this.#arc, found);
    this.#arc = found;

    // ── Rangieren, wenn nichts mehr geht ──────────────────────────────────
    //
    // Ein Gegner, der an einer Leitplanke hängt, ist schlimmer als gar keiner:
    // er steht für den Rest des Rennens im Bild. Die Bedingung ist dieselbe wie
    // beim Klemmschutz des Spielers (`DriveSystem.#watchStuck`) — nicht
    // geometrisch, sondern *ist er von der Stelle gekommen*.
    if (speed < 1.2) this.#stuck += dt;
    else this.#stuck = 0;
    if (this.#stuck > 1.5 && this.#reverse <= 0) {
      this.#reverse = 1.2;
      this.#stuck = 0;
    }
    if (this.#reverse > 0) {
      this.#reverse -= dt;
      this.input.throttle = 0;
      this.input.brake = 1;
      this.input.steer = 0;
      this.input.handbrake = false;
      this.input.boost = false;
      return this.input;
    }

    // ── Lenkung ───────────────────────────────────────────────────────────
    //
    // Der Bezugspunkt für den **Winkel** liegt voraus, der für den **Abstand**
    // am Fahrzeug. Das ist die eigentliche Feinheit des Verfahrens: die
    // Vorausschau lässt den Wagen einlenken, *bevor* die Kurve da ist, während
    // der Querterm ihn auf der Linie hält. Ein gemeinsamer Bezugspunkt für
    // beides kann nur eines von beidem.
    const preview = LOOKAHEAD_BASE + speed * LOOKAHEAD_PER_SPEED;
    const ai = line.indexAt(this.#arc);
    const pi = line.indexAt(this.#arc + preview);
    const ax = line.tangent[ai * 2]!;
    const az = line.tangent[ai * 2 + 1]!;
    const px = line.tangent[pi * 2]!;
    const pz = line.tangent[pi * 2 + 1]!;

    this.#pickLane(dt, speed, traffic, raceFrac);

    // Querabstand, **vorzeichenbehaftet**. Rechts der Fahrtrichtung ist
    // `(−tz, tx)` — die Konvention aus `Vehicle.#updateBasis`
    // (`right = forward × up`). Positiv heißt: der Wagen steht rechts der Linie.
    line.pointAt(this.#arc, TARGET);
    const nearX = TARGET.x - az * this.#lane;
    const nearZ = TARGET.z + ax * this.#lane;
    const cross = (position.x - nearX) * -az + (position.z - nearZ) * ax;

    // ── Zurück auf die Straße — die Regel, die den ersten Regler ersetzt hat ──
    //
    // **Winkelterm und Querterm heben sich gegenseitig auf, sobald der Wagen
    // weit genug daneben steht.** Gemessen auf der Ringstraße: 17 m links der
    // Linie, 67° nach links verdreht, Tempo 5 km/h. Der Querterm sagte „nach
    // rechts" (+1,57), der Winkelterm sagte „nach links, die Straße dreht
    // dorthin" (−1,63), und die Summe war −0,06. Der Gegner stand dort **140
    // Sekunden**, bis das Rennen vorbei war.
    //
    // Beide Terme sind für sich richtig — sie beantworten nur zwei verschiedene
    // Fragen. Nah an der Linie zählt „wie liegt die Straße" (Stanley), weit
    // daneben zählt „wo ist die Straße" (Pure Pursuit). Deshalb wird der
    // **Bezugswinkel** geblendet und nicht ein weiterer Term addiert: die
    // Sollrichtung wandert von der Tangente auf die Peilung zum Zielpunkt.
    //
    // Der Querterm wird dabei ausgeblendet, sonst zählte der Abstand zweimal.
    const strayed = clamp01((Math.abs(cross) - RECOVER_OFFSET) / RECOVER_OFFSET);
    if (strayed > 0.4) this.tactic = 'recover';

    line.pointAt(this.#arc + preview, TARGET);
    const goalX = TARGET.x - pz * this.#lane;
    const goalZ = TARGET.z + px * this.#lane;
    const bearing = Math.atan2(goalX - position.x, goalZ - position.z);
    const tangentHeading = Math.atan2(px, pz);
    const desired = tangentHeading + wrapAngle(bearing - tangentHeading) * strayed;

    // Ein positiver Fehler heißt: die Sollrichtung liegt bei größerem ψ, also
    // links — und links ist **negative** Lenkung.
    const headingError = wrapAngle(desired - yaw);

    const crossTerm = Math.atan((CROSS_GAIN * cross) / Math.max(speed, CROSS_SPEED_FLOOR));

    // ── Vorsteuerung ──────────────────────────────────────────────────────
    //
    // **Die beiden Terme darüber sind Regler und reagieren erst auf einen
    // Fehler.** Auf einer Straße mit 8,5 m Breite ist das zu spät: gemessen
    // stand der Winkelfehler beim Einlenken bereits bei **−16°**, bevor der
    // Regler nennenswert lenkte, und der Wagen ging in derselben Kurve ins
    // Gelände.
    //
    // Die Vorsteuerung lenkt, was die Kurve **verlangt**, ohne auf einen Fehler
    // zu warten. Ihr Betrag folgt geschlossen aus dem Arcade-Modell: eine
    // stationäre Kurve braucht `ω = v·κ`, das Modell liefert höchstens
    // `ω_max = a_lat/v`, und die Eingabe ist der Anteil davon —
    //
    // ```
    //   steer_ff = −v²·κ / a_lat
    // ```
    //
    // An der Auslegungsgrenze der Linie ist das genau ±1, auf einer Geraden
    // null. Das Minus ist die Vorzeichenkette des Projekts: positive Krümmung
    // heißt Linkskurve, links heißt wachsendes ψ, und wachsendes ψ kommt von
    // **negativer** Lenkung.
    //
    // Sie gilt nur, solange der Wagen auf der Linie ist: die Krümmung einer
    // Straße, 20 m neben der man steht, ist keine Anweisung.
    const kappa = line.signedCurvatureAt(this.#arc + preview * FEEDFORWARD_LEAD);
    const feedforward = clamp((-speed * speed * kappa) / line.latAccel, -1, 1);

    this.cross = cross;
    this.headingError = headingError;
    const avoid = this.#avoidSteer(traffic);
    this.input.steer = clamp(
      feedforward * (1 - strayed) -
        headingError * HEADING_GAIN -
        crossTerm * CROSS_WEIGHT * (1 - strayed) +
        avoid,
      -1,
      1,
    );

    // ── Tempo ─────────────────────────────────────────────────────────────
    //
    // Abgelesen wird **vorne**, nicht hier: an der eigenen Stelle steht das
    // Tempo, das man haben *dürfte*, und wer sich danach richtet, bremst in der
    // Kurve statt davor. `SPEED_PREVIEW` Sekunden voraus ist der Punkt, an dem
    // die Bremsung beginnen muss.
    const late = this.#skill.lateBrake ?? 0;
    const speedPreview = Math.max(8, speed * SPEED_PREVIEW * (1 - late * 0.45));
    const aggression = this.#skill.aggression ?? 0.7;
    const finishPush = raceFrac > 0.72 ? 1 + LATE_PACE * aggression : 1;
    const draft = this.#draftBonus(speed, traffic);
    const target =
      Math.min(line.speedAt(this.#arc + speedPreview), line.speedAt(this.#arc)) *
      this.#skill.pace *
      finishPush *
      (1 + draft) *
      (1 + (catchUp - 1) * this.#skill.rubber);

    // **Wer neben der Straße ist, fährt langsam zurück.** Ohne diese Zeile
    // versucht ein abgekommener Gegner, das Kurventempo der *Straße* im Gelände
    // zu halten — und bleibt dort. Gemessen auf der Ringstraße: 97 % der Zeit
    // neben der Fahrbahn, bis zu 22 m weit, 597 m in drei Minuten.
    //
    // Die Grenze ist der Querabstand und nicht der Belag: ein Gegner auf dem
    // Bankett ist noch auf Kurs, einer 8 m daneben nicht. Und sie ist stetig —
    // ein Schalter an dieser Stelle wäre ein Gegner, der im Gelände zwischen
    // Vollgas und Bremse pendelt.
    const recovered = target * (1 - strayed) + RECOVER_SPEED * strayed;

    const delta = recovered - speed;
    if (delta > 0.5) {
      this.input.throttle = clamp(delta / 4, 0.25, 1);
      this.input.brake = 0;
    } else if (delta < -1.5) {
      this.input.throttle = 0;
      this.input.brake = clamp(-delta / 6, 0.2, 1);
    } else {
      // Totband. Ohne es pendelt der Fuß zwischen Gas und Bremse, und das ist
      // im Bild als Ruckeln sichtbar, lange bevor es in einer Zahl auftaucht.
      //
      // **Asymmetrisch um null**, und das ist die Reparatur eines gemessenen
      // Überschwingens: mit `0,35 + Δ·0,2` stand auch bei Δ = 0 noch ein
      // Drittel Gas an, und bergab lief der Wagen damit über sein eigenes
      // Solltempo hinaus — gemessen 167 km/h gegen einen Linien-Deckel von
      // 158. Ein Regler, der im Sollwert Gas gibt, hat keinen Sollwert.
      this.input.throttle = delta > 0 ? clamp(delta * 0.5, 0, 0.7) : 0;
      this.input.brake = 0;
    }

    // **Nitro nur im Angriff, und nur auf der Geraden.** Der erste Entwurf ließ
    // ihn auf jeder Geraden zünden; gemessen kam der Wagen damit auf 167 km/h,
    // also über den Deckel der Ideallinie — und flog an der nächsten Kuppe ab.
    // Als Aufholhilfe, Überholhilfe und Schlussspurt bleibt er richtig: dort
    // ist er sichtbar und die Linie deckelt das Solltempo.
    const kappaNow = Math.abs(line.signedCurvatureAt(this.#arc + preview * 0.3));
    const hunger = this.#skill.boostHunger ?? 0.6;
    const attacking = catchUp > 1.03 || this.tactic === 'overtake' || raceFrac > 0.72;
    this.input.boost =
      attacking &&
      hunger > 0.2 &&
      this.input.throttle > 0.85 &&
      speed > 18 &&
      kappaNow < 0.012 &&
      strayed < 0.2;
    this.input.handbrake = false;
    return this.input;
  }

  /**
   * Fahrspur wählen: Rennlinie, Überholen oder Decken.
   *
   * Die Taktik sitzt **über** dem Stanley-Regler, nicht in seinen Beiwerten.
   * Wer Überholen in den Querterm mischt, bekommt denselben Fehler wie der
   * erste Pure-Pursuit-Entwurf: der Wagen webt, statt eine Seite zu halten.
   *
   * Ein Entschluss wird 0,95 s gehalten — sonst bricht jeder Ansatz ab, sobald
   * das Fenster um einen Meter schrumpft, und das sieht nach Zaghaftigkeit aus.
   */
  #pickLane(dt: number, speed: number, traffic: readonly NearbyRacer[], raceFrac: number): void {
    const aggression = this.#skill.aggression ?? 0.7;
    const blockSkill = this.#skill.block ?? 0.4;
    const preferred = this.#skill.lane;
    let desired = preferred;
    this.tactic = 'race';

    if (this.#commit > 0) {
      this.#commit -= dt;
      desired = clamp(preferred + this.#passSide * 2.2, -LANE_LIMIT, LANE_LIMIT);
      this.tactic = this.#passSide === 0 ? 'race' : 'overtake';
    } else {
      this.#passSide = 0;
      const ahead = this.#blockerAhead(traffic);
      if (ahead && aggression > 0.25 && speed > ahead.speed - 1.5) {
        const side = ahead.across >= 0 ? -1 : 1;
        this.#passSide = side;
        this.#commit = PASS_HOLD;
        desired = clamp(preferred + side * 2.2, -LANE_LIMIT, LANE_LIMIT);
        this.tactic = 'overtake';
      } else {
        const hunter = this.#hunterBehind(traffic);
        const kappa = Math.abs(this.#line.signedCurvatureAt(this.#arc + 40));
        const willBlock =
          hunter &&
          blockSkill > 0.2 &&
          kappa > 0.012 &&
          hunter.speed > speed - 1 &&
          (raceFrac > 0.55 || blockSkill > 0.7);
        if (willBlock && hunter) {
          const cover = hunter.across > 0 ? 1 : -1;
          desired = clamp(preferred + cover * (1.2 + blockSkill), -LANE_LIMIT, LANE_LIMIT);
          this.tactic = 'defend';
        }
      }
    }

    const blend = 1 - Math.exp(-dt * 4.5);
    this.#lane += (desired - this.#lane) * blend;
    this.#lane = clamp(this.#lane, -LANE_LIMIT, LANE_LIMIT);
  }

  #blockerAhead(traffic: readonly NearbyRacer[]): NearbyRacer | null {
    let best: NearbyRacer | null = null;
    for (const other of traffic) {
      if (other.along < 3.5 || other.along > PASS_NEAR) continue;
      if (Math.abs(other.across) > 2.8) continue;
      if (!best || other.along < best.along) best = other;
    }
    return best;
  }

  #hunterBehind(traffic: readonly NearbyRacer[]): NearbyRacer | null {
    for (const other of traffic) {
      if (!other.isPlayer) continue;
      if (other.along > -3 || other.along < -BLOCK_NEAR) continue;
      return other;
    }
    return null;
  }

  /**
   * Abstoßung gegen einen Wagen, der schon in der Karosserie steckt.
   *
   * Super Mario Kart gibt beim Überholen eine kleine Abstoßkraft, damit die
   * KI nicht durch den Spieler fährt. Hier ist sie die *zweite* Schicht: der
   * Impuls in `carBump` trennt die Bleche, dieser Term hält die Lenkung davon
   * ab, sofort wieder hineinzustechen.
   */
  #avoidSteer(traffic: readonly NearbyRacer[]): number {
    let steer = 0;
    for (const other of traffic) {
      if (other.along < -2.5 || other.along > 8) continue;
      const across = other.across;
      if (Math.abs(across) > 3.2 || Math.abs(across) < 0.15) continue;
      const near = 1 - Math.abs(across) / 3.2;
      const alongFade = other.along < 0 ? 0.45 : 1;
      // Positiv across = der andere ist rechts → nach links (negative Lenkung).
      steer += -Math.sign(across) * near * alongFade * 0.55;
    }
    return clamp(steer, -0.45, 0.45);
  }

  #draftBonus(speed: number, traffic: readonly NearbyRacer[]): number {
    if (speed < 12) return 0;
    let best = 0;
    for (const other of traffic) {
      if (other.along < 3.5 || other.along > DRAFT_ALONG) continue;
      if (Math.abs(other.across) > DRAFT_ACROSS) continue;
      const alongT = 1 - (other.along - 3.5) / (DRAFT_ALONG - 3.5);
      const sideT = 1 - Math.abs(other.across) / DRAFT_ACROSS;
      best = Math.max(best, DRAFT_GAIN * alongT * sideT);
    }
    return best;
  }
}

const TARGET = { x: 0, y: 0, z: 0 };
const EMPTY_TRAFFIC: readonly NearbyRacer[] = [];

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Auf −π…π bringen. Wie in `ChaseCamera` — dieselbe Rechnung, dieselbe Form. */
function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
