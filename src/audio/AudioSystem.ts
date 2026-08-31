import { AUDIO, AUDIO_STORAGE_KEY } from '@/config/audio.config';
import type { EngineContext, System } from '@/core/System';
import type { VehicleTelemetry } from '@/game/Vehicle';

/**
 * Die Tonschicht — P16.
 *
 * ## Der Befund, aus dem sie entsteht
 *
 * Das Projekt hatte **keinen Ton**. Nicht „wenig" — keinen: `grep -rli
 * "audio|sound|AudioContext|AudioListener"` über `src/` fand null Dateien. Für
 * eine Landschaft zum Anschauen ging das durch; mit der Fahrschicht aus P14 ist
 * es der auffälligste Mangel, den ein Besucher in den ersten fünf Sekunden
 * bemerkt. Ein Auto, das lautlos beschleunigt, liest sich als kaputt.
 *
 * ## Vollständig synthetisiert
 *
 * Kein einziges Byte Download — Begründung in `audio.config.ts`. Was hier
 * entsteht, entsteht aus Oszillatoren und einem Rauschpuffer, den diese Datei
 * selbst füllt.
 *
 * ## Die drei Fallen der Web Audio API, und wie sie hier umgangen sind
 *
 * 1. **Ein `AudioContext` startet suspendiert.** Jeder Browser verlangt eine
 *    Nutzergeste, bevor Ton kommt. Der Kontext wird deshalb **nicht** im
 *    Konstruktor angelegt, sondern in `unlock()` — und das ruft der
 *    „Starten"-Knopf, also im Klick selbst. Ein Kontext, der im Konstruktor
 *    entsteht, steht danach für immer auf `suspended`, und *das* ist der Grund,
 *    warum in so vielen Web-Spielen der Ton erst nach einem Tab-Wechsel kommt.
 *
 * 2. **Ein `setValueAtTime` je Frame auf denselben Parameter knackt.** Sprünge
 *    im Wert eines laufenden Oszillators sind Klicks. Alles, was sich fortlaufend
 *    ändert (Drehzahl, Lautstärke, Filter), läuft über
 *    `setTargetAtTime` — eine Exponentialrampe, die die Hardware selbst fährt und
 *    die keine Bildrate braucht.
 *
 * 3. **Ein Oszillator ist ein Einwegteil.** `stop()` ist endgültig; ein
 *    gestoppter Knoten lässt sich nicht neu starten. Motor und Rauschen laufen
 *    deshalb **durchgehend** ab `unlock()` und werden über ihre Verstärkung auf
 *    null geregelt, statt sie zu stoppen. Nur die Einzelgeräusche (Aufprall,
 *    Runde, Klick) legen je Ereignis neue Knoten an — die sterben nach ihrer
 *    Hüllkurve von selbst.
 *
 * ## Was der Browser abschaltet, wenn niemand hinsieht
 *
 * Bei `document.hidden` wird der Kontext angehalten. Das ist nicht nur
 * Höflichkeit: ein Spiel, das im Hintergrundtab weiterdröhnt, ist der häufigste
 * Grund, warum ein Tab geschlossen wird — und CrazyGames verlangt ohnehin, dass
 * die Seite im Hintergrund keine teure Arbeit macht.
 *
 * ## Die Schnittstelle für später
 *
 * `setMuted()` ist bewusst öffentlich und von der Einstellung des Nutzers
 * getrennt (`#userMuted` gegen `#externallyMuted`). Das CrazyGames-SDK verlangt
 * einen `muteAudio`-Rückruf, der **Vorrang vor der Spieleinstellung** hat; wenn
 * das SDK dazukommt, hängt es sich an `setExternallyMuted()` und muss an dieser
 * Datei nichts ändern.
 */
export class AudioSystem implements System {
  readonly name = 'AudioSystem';

  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;

  // ── Motor ──────────────────────────────────────────────────────────────
  #engineGain: GainNode | null = null;
  #engineFilter: BiquadFilterNode | null = null;
  #engineOsc: OscillatorNode | null = null;
  #engineOsc2: OscillatorNode | null = null;

  // ── Roll- und Fahrtwind ────────────────────────────────────────────────
  #noiseGain: GainNode | null = null;
  #noiseFilter: BiquadFilterNode | null = null;
  #noiseBuffer: AudioBuffer | null = null;

  /** Geglättete Drehzahl — siehe `AUDIO.engine.rpmSmoothing`. */
  #rpm = AUDIO.engine.idleRpm;
  /** Kontextzeit des letzten Aufpralls, gegen das Dauerknattern an der Kante. */
  #lastImpactAt = -1;
  /** Durchdringung des vorigen Schritts — der Aufprall ist die *Flanke*. */
  #lastPenetration = 0;

  #userMuted = false;
  #externallyMuted = false;
  #driveActive = false;
  #telemetry: VehicleTelemetry | null = null;

  constructor() {
    // Die Einstellung wird **vor** dem Kontext gelesen: der Nutzer soll seinen
    // Stummschalter aus der letzten Sitzung wiederfinden, auch wenn er den Ton
    // in dieser nie freischaltet.
    try {
      this.#userMuted = localStorage.getItem(AUDIO_STORAGE_KEY) === '1';
    } catch {
      // Privater Modus ohne Speicher — kein Grund, den Ton zu verweigern.
      this.#userMuted = false;
    }
  }

  init(context: EngineContext): void {
    // ── Meldetöne — P25 ───────────────────────────────────────────────────
    //
    // Bis P24 war jede Belohnung dieses Spiels **stumm**: ein eingesammeltes
    // Stück, ein Kontrollpunkt und ein Zieleinlauf klangen wie das Nichtstun
    // daneben. Das ist keine Kleinigkeit — die Rückmeldung *„das hat gezählt"*
    // ist der Grund, warum jemand ein zweites Mal danach fährt.
    context.bus.on('pickup:collected', ({ kind }) => {
      // Nitro höher als Geld: zwei Belohnungen, die man im Vorbeifahren nicht
      // ansieht, müssen sich **hören** lassen wie zwei verschiedene Dinge.
      this.#chime(kind === 'boost' ? 1046.5 : 784, 0.09);
    });
    context.bus.on('race:checkpoint', () => {
      this.#chime(659.25, 0.11);
    });
    context.bus.on('race:lap', () => {
      this.#chime(880, 0.16);
    });
    context.bus.on('drive:mode', ({ active }) => {
      this.#driveActive = active;
      // Der Motor darf beim Aussteigen nicht ausklingen wie ein abgewürgter
      // Wagen — er ist schlicht weg. Die Rampe in `update()` erledigt das über
      // die Zielverstärkung; hier wird nur die Drehzahl zurückgesetzt, damit das
      // nächste Einsteigen im Leerlauf beginnt und nicht bei 7000.
      if (!active) this.#rpm = AUDIO.engine.idleRpm;
    });
    document.addEventListener('visibilitychange', this.#onVisibility);
  }

  /**
   * Woher die Fahrzeugwerte kommen.
   *
   * Hereingereicht statt gesucht — dieselbe Regel wie bei `DriveSystem` und dem
   * Freiflug. `AudioSystem` importiert `DriveSystem` **nicht**: es braucht
   * genau ein Objekt mit Zahlen darin, und dieses Objekt schreibt die Physik
   * ohnehin jeden Schritt fort.
   */
  setTelemetry(telemetry: VehicleTelemetry): void {
    this.#telemetry = telemetry;
  }

  // ── Freischalten ────────────────────────────────────────────────────────

  /**
   * Den Kontext anlegen und starten — **muss aus einer Nutzergeste kommen**.
   *
   * Mehrfachaufruf ist ausdrücklich erlaubt und der Normalfall: der
   * „Starten"-Knopf ruft es, und jeder spätere Klick ruft es erneut, falls der
   * Browser den Kontext zwischendurch angehalten hat (Safari tut das nach einem
   * Tab-Wechsel).
   */
  unlock(): void {
    if (!this.#ctx) this.#build();
    // `resume()` gibt ein Promise zurück, das abgelehnt werden kann, wenn der
    // Aufruf doch nicht aus einer Geste kam. Das ist kein Fehler, den jemand
    // sehen müsste — beim nächsten Klick klappt es.
    void this.#ctx?.resume().catch(() => undefined);
  }

  /**
   * Auffangnetz: die **nächste** Geste irgendwo im Dokument schaltet frei.
   *
   * Der reguläre Weg ist der „Starten"-Knopf, und der genügt fast immer. Fast:
   * `StartScreen` merkt sich einen Druck, für den noch kein Zuhörer da war, und
   * holt ihn später nach — dieser Aufruf käme dann **außerhalb** der Geste, und
   * der Browser verweigert. Dazu kommt der Rückfallpfad, auf dem der
   * Startbildschirm gar nicht erst erscheint.
   *
   * Die Zuhörer entfernen sich beim ersten Auslösen selbst (`once`), und
   * `unlock()` verträgt Mehrfachaufruf — beide Wege dürfen also feuern.
   */
  armAutoUnlock(): void {
    const los = (): void => {
      this.unlock();
    };
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
      // `capture`, damit auch eine Geste zählt, die ein anderer Handler mit
      // `stopPropagation` abfängt — der Knopf im Bedienfeld tut genau das.
      window.addEventListener(type, los, { once: true, capture: true });
    }
  }

  #build(): void {
    // `webkitAudioContext` gibt es auf älteren iOS-Ständen noch; ohne den
    // Rückfall bleibt dort alles still. Der Typ ist eine schmale Behauptung
    // statt `any` — die Konstruktorform ist dieselbe.
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    this.#ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : AUDIO.masterVolume;
    master.connect(ctx.destination);
    this.#master = master;

    // ── Motor: zwei verstimmte Sägezähne durch einen Tiefpass ────────────
    //
    // Zwei und nicht einer: ein einzelner Sägezahn ist ein Summton. Die
    // Schwebung zwischen zwei leicht verstimmten Stimmen ist das, was das Ohr
    // als „Maschine mit mehreren Zylindern" liest.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineGain.connect(master);
    this.#engineGain = engineGain;

    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = AUDIO.engine.filterMinHz;
    engineFilter.Q.value = 1.2;
    engineFilter.connect(engineGain);
    this.#engineFilter = engineFilter;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = AUDIO.engine.minHz;
    osc.connect(engineFilter);
    osc.start();
    this.#engineOsc = osc;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = AUDIO.engine.minHz;
    osc2.detune.value = AUDIO.engine.detuneCents;
    osc2.connect(engineFilter);
    osc2.start();
    this.#engineOsc2 = osc2;

    // ── Roll- und Fahrtwind: Rauschschleife durch einen Bandpass ─────────
    this.#noiseBuffer = this.#makeNoise(ctx);

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noiseGain.connect(master);
    this.#noiseGain = noiseGain;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = AUDIO.noise.minHz;
    noiseFilter.Q.value = 0.7;
    noiseFilter.connect(noiseGain);
    this.#noiseFilter = noiseFilter;

    const noise = ctx.createBufferSource();
    noise.buffer = this.#noiseBuffer;
    noise.loop = true;
    noise.connect(noiseFilter);
    noise.start();
  }

  /**
   * Ein kurzer Meldeton — P25.
   *
   * ## Warum ein Oszillator je Ton und kein Wiederverwenden
   *
   * Ein `OscillatorNode` ist in der Web-Audio-API ausdrücklich ein
   * **Einmalobjekt**: nach `stop()` lässt er sich nicht wieder starten. Der
   * übliche Reflex — einen Oszillator halten und seine Verstärkung auf- und
   * zudrehen — hat einen Preis, den man hört: die Phase läuft weiter, und zwei
   * schnell aufeinanderfolgende Töne setzen an zufälliger Stelle der Welle ein.
   * Ein neuer Knoten beginnt immer bei null.
   *
   * > Was ein solcher Knoten **kostet**, ist hier nicht gemessen. Der Grund für
   * > diese Bauart ist die Phase und nicht der Preis; eine Kostenzahl daneben
   * > wäre eine Behauptung, und dieses Projekt hat für genau die schon einmal
   * > bezahlt (die Imposter-Schwelle in P4). Wenn es je eng wird, ist die Zahl
   * > messbar — bis dahin steht sie nicht da.
   *
   * ## Warum eine Exponentialrampe und kein `setValueAtTime`
   *
   * Ein Sprung der Verstärkung auf null ist ein Knacken — er ist im Signal eine
   * Stufe, und eine Stufe hat unendlich viele Obertöne. `exponentialRampTo`
   * kann dabei nicht auf 0 gehen (der Logarithmus), deshalb 0,0001 und danach
   * `stop()`.
   *
   * ## Und warum es nicht spielt, wenn niemand fährt
   *
   * `#driveActive` ist die Bedingung: die Ereignisse, an denen das hier hängt,
   * kann nur ein fahrendes Fahrzeug auslösen. Die Prüfung steht trotzdem da,
   * weil ein Meldeton im Menü ein Fehler wäre, den niemand als Fehler meldet —
   * er klingt nur seltsam.
   */
  #chime(hz: number, seconds: number): void {
    const ctx = this.#ctx;
    const master = this.#master;
    if (!ctx || !master || this.muted || !this.#driveActive) return;
    if (ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    // 8 ms Anstieg: schnell genug, dass es als Anschlag wirkt, langsam genug,
    // dass es kein Knacken ist.
    gain.gain.exponentialRampToValueAtTime(AUDIO.masterVolume * 0.5, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    gain.connect(master);

    // Dreieck und nicht Sinus: ein reiner Sinus verschwindet unter dem
    // Motorgeräusch (zwei Sägezähne durch einen Tiefpass, s. o.). Das Dreieck
    // hat gerade genug ungerade Obertöne, um darüber zu stehen, ohne wie ein
    // Fehlerton zu klingen.
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(hz, now);
    // Ein Hauch aufwärts über die Dauer — ein fallender Ton liest sich als
    // „vorbei", ein steigender als „gut gemacht".
    osc.frequency.exponentialRampToValueAtTime(hz * 1.18, now + seconds);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + seconds + 0.02);
    // Aufräumen, sobald er verklungen ist. Ohne das sammeln sich bei 90
    // Sammelstücken je Runde die Knoten im Graphen — sie sind zwar gestoppt,
    // hängen aber weiter am Master.
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /**
   * Zwei Sekunden weißes Rauschen.
   *
   * Zwei und nicht 0,2: eine kurze Schleife wird als **Tonhöhe** hörbar (bei
   * 0,2 s sind das 5 Hz Schleifenfrequenz und deren Obertöne), und das klingt
   * nach Brummen statt nach Wind. Zwei Sekunden bei 48 kHz sind 384 KB im
   * Speicher — einmalig, und der Puffer wird von genau einer Quelle gelesen.
   */
  #makeNoise(ctx: AudioContext): AudioBuffer {
    const frames = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // ── Stummschaltung ──────────────────────────────────────────────────────

  /** Gilt gerade Stille? Nutzereinstellung **oder** Wunsch von außen. */
  get muted(): boolean {
    return this.#userMuted || this.#externallyMuted;
  }

  /** Die Einstellung des Nutzers — Menü und `localStorage`. */
  setMuted(muted: boolean): void {
    this.#userMuted = muted;
    try {
      localStorage.setItem(AUDIO_STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // Ohne Speicher gilt die Einstellung eben nur für diese Sitzung.
    }
    this.#applyMute();
  }

  /**
   * Stummschaltung von außen — **hat Vorrang vor der Spieleinstellung**.
   *
   * Für das CrazyGames-SDK: es schaltet den Ton während eines Werbespots stumm
   * und verlangt ausdrücklich, dass dieser Wunsch die Einstellung im Spiel
   * überstimmt. Getrennte Felder, weil ein gemeinsames beim Zurückschalten die
   * Nutzereinstellung überschriebe — wer vor der Werbung stumm gestellt hatte,
   * bekäme danach Ton.
   */
  setExternallyMuted(muted: boolean): void {
    this.#externallyMuted = muted;
    this.#applyMute();
  }

  #applyMute(): void {
    const ctx = this.#ctx;
    const master = this.#master;
    if (!ctx || !master) return;
    // Eine kurze Rampe statt eines Sprungs: ein Gain-Sprung auf einem laufenden
    // Signal ist ein hörbarer Knack.
    master.gain.setTargetAtTime(this.muted ? 0 : AUDIO.masterVolume, ctx.currentTime, 0.02);
  }

  readonly #onVisibility = (): void => {
    const ctx = this.#ctx;
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => undefined);
    else void ctx.resume().catch(() => undefined);
  };

  // ── Einzelgeräusche ─────────────────────────────────────────────────────

  /**
   * Aufprall. `strength` 0…1 — der Aufrufer rechnet aus der Durchdringung.
   *
   * Ein Rauschstoß mit steiler Hüllkurve, kein Ton: ein Blechschaden hat keine
   * Tonhöhe. Der Tiefpass wandert mit der Stärke nach oben — ein harter Treffer
   * klingt heller als ein Streifen.
   */
  impact(strength: number): void {
    const ctx = this.#ctx;
    const master = this.#master;
    const buffer = this.#noiseBuffer;
    if (!ctx || !master || !buffer || this.muted) return;

    const now = ctx.currentTime;
    if (now - this.#lastImpactAt < AUDIO.impact.minInterval) return;
    this.#lastImpactAt = now;

    const s = Math.min(Math.max(strength, 0), 1);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // Ein zufälliger Anschnitt, damit zwei Treffer nicht identisch klingen.
    const offset = Math.random() * (buffer.duration - AUDIO.impact.decay);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320 + s * 2200;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(AUDIO.impact.gain * (0.25 + s * 0.75), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + AUDIO.impact.decay);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now, Math.max(0, offset), AUDIO.impact.decay);
    // **Aufräumen gehört dazu.** Ein Knoten, den niemand trennt, bleibt am
    // Graphen hängen; bei einem Geräusch je Bordsteinkante sind das nach einer
    // Minute Fahrt hunderte. `onended` ist die einzige Stelle, an der sicher
    // ist, dass er fertig ist.
    source.onended = (): void => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  /** Rundensignal. `best` = neue Bestzeit, dann steigt der zweite Ton. */
  lap(best: boolean): void {
    const { baseHz, bestHz, noteSeconds, gain } = AUDIO.lap;
    this.#blip(baseHz, 0, gain, noteSeconds);
    this.#blip(best ? bestHz : baseHz * 1.5, noteSeconds, gain, noteSeconds);
  }

  /** Ein Klick für die Oberfläche. */
  click(): void {
    this.#blip(AUDIO.ui.hz, 0, AUDIO.ui.gain, AUDIO.ui.seconds);
  }

  /** Ein einzelner Sinuston mit weicher Hüllkurve. */
  #blip(hz: number, delay: number, peak: number, seconds: number): void {
    const ctx = this.#ctx;
    const master = this.#master;
    if (!ctx || !master || this.muted) return;

    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;

    const gain = ctx.createGain();
    // Ein Anstieg über 12 ms statt eines Sprungs — ein Sinus, der bei voller
    // Amplitude einsetzt, klickt genauso wie einer, der so aufhört.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);

    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
    osc.onended = (): void => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  // ── Schleife ────────────────────────────────────────────────────────────

  update(dt: number): void {
    const ctx = this.#ctx;
    if (!ctx || ctx.state !== 'running') return;

    const t = this.#telemetry;
    const now = ctx.currentTime;
    const fahrend = this.#driveActive && t !== null;

    // ── Drehzahl aus Tempo und Scheingetriebe ────────────────────────────
    const speed = fahrend ? Math.abs(t.forwardSpeed) : 0;
    const zielRpm = fahrend ? gearedRpm(speed) : AUDIO.engine.idleRpm;
    // Exponentielle Glättung mit zeitschrittunabhängiger Konstante: bei 30 wie
    // bei 144 Hz dieselbe Trägheit. `1 - e^(-k·dt)` und nicht `k·dt` — Letzteres
    // wird bei großem `dt` instabil, und ein Frame von 200 ms kommt beim Laden
    // vor.
    this.#rpm += (zielRpm - this.#rpm) * (1 - Math.exp(-AUDIO.engine.rpmSmoothing * dt));

    const rpmNorm =
      (this.#rpm - AUDIO.engine.idleRpm) / (AUDIO.engine.maxRpm - AUDIO.engine.idleRpm);
    const hz = AUDIO.engine.minHz + rpmNorm * (AUDIO.engine.maxHz - AUDIO.engine.minHz);

    // Die Last, nicht die Drehzahl, bestimmt Lautstärke und Filteröffnung: ein
    // Motor im Schubbetrieb ist leise, auch wenn er hoch dreht.
    const last = fahrend ? Math.min(1, rpmNorm + (t.wheelspin > 1 ? 0.35 : 0)) : 0;
    const engineTarget = fahrend
      ? AUDIO.engine.idleGain + last * (AUDIO.engine.fullGain - AUDIO.engine.idleGain)
      : 0;
    const filterHz =
      AUDIO.engine.filterMinHz + last * (AUDIO.engine.filterMaxHz - AUDIO.engine.filterMinHz);

    // `setTargetAtTime` und nicht `value =` — Begründung im Kopf, Falle 2.
    this.#engineOsc?.frequency.setTargetAtTime(hz, now, 0.05);
    this.#engineOsc2?.frequency.setTargetAtTime(hz, now, 0.05);
    this.#engineFilter?.frequency.setTargetAtTime(filterHz, now, 0.08);
    this.#engineGain?.gain.setTargetAtTime(engineTarget, now, 0.08);

    // ── Rollen und Fahrtwind ─────────────────────────────────────────────
    //
    // Im Auto aus dem Tempo, im Flug aus dem Grundtempo der Kamera — dort ist
    // es Fahrtwind und deutlich leiser, sonst rauscht ein Standbild.
    const noiseSpeed = fahrend ? t.speed : 0;
    const norm = Math.min(1, noiseSpeed / AUDIO.noise.fullSpeed);
    let noiseTarget = fahrend ? norm * norm * AUDIO.noise.driveGain : 0;
    // Durchdrehende Räder sind hörbar, und zwar auch im Stand — genau dann ist
    // das Rauschen sonst null und der Burnout lautlos.
    if (fahrend && t.wheelspin > 1 && !t.airborne) {
      noiseTarget += Math.min(1, (t.wheelspin - 1) * 0.8) * AUDIO.noise.wheelspinGain;
    }
    // In der Luft gibt es kein Rollgeräusch — nur der Wind bleibt.
    if (fahrend && t.airborne) noiseTarget *= 0.35;

    this.#noiseGain?.gain.setTargetAtTime(noiseTarget, now, 0.1);
    this.#noiseFilter?.frequency.setTargetAtTime(
      AUDIO.noise.minHz + norm * (AUDIO.noise.maxHz - AUDIO.noise.minHz),
      now,
      0.12,
    );

    // ── Aufprall ─────────────────────────────────────────────────────────
    //
    // **Die Flanke, nicht der Zustand.** `lastPenetration` steht bei einem
    // Wagen, der an der Leitplanke entlangschrammt, über hunderte Schritte auf
    // einem Wert; ein Ton je Schritt wäre ein Presslufthammer. Ausgelöst wird
    // nur, wenn die Durchdringung *zunimmt* — und `AUDIO.impact.minInterval`
    // deckelt den Rest.
    if (fahrend) {
      const p = t.lastPenetration;
      if (p > AUDIO.impact.minPenetration && p > this.#lastPenetration * 1.5) {
        const s =
          (p - AUDIO.impact.minPenetration) /
          (AUDIO.impact.fullPenetration - AUDIO.impact.minPenetration);
        this.impact(s);
      }
      this.#lastPenetration = p;
    } else {
      this.#lastPenetration = 0;
    }
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.#onVisibility);
    this.#engineOsc?.stop();
    this.#engineOsc2?.stop();
    this.#engineOsc?.disconnect();
    this.#engineOsc2?.disconnect();
    this.#engineFilter?.disconnect();
    this.#engineGain?.disconnect();
    this.#noiseFilter?.disconnect();
    this.#noiseGain?.disconnect();
    this.#master?.disconnect();
    void this.#ctx?.close().catch(() => undefined);
    this.#ctx = null;
    this.#master = null;
    this.#engineOsc = null;
    this.#engineOsc2 = null;
    this.#engineFilter = null;
    this.#engineGain = null;
    this.#noiseFilter = null;
    this.#noiseGain = null;
    this.#noiseBuffer = null;
    this.#telemetry = null;
  }
}

/**
 * Tempo → Drehzahl über ein Scheingetriebe.
 *
 * Innerhalb eines Gangs steigt die Drehzahl linear von Leerlauf auf Höchstwert;
 * beim Gangwechsel fällt sie zurück. Genau dieser Sägezahn ist das, was ein Ohr
 * als Beschleunigung erkennt — Begründung bei `AUDIO.engine.gearTopSpeeds`.
 */
function gearedRpm(speed: number): number {
  const gears = AUDIO.engine.gearTopSpeeds;
  const { idleRpm, maxRpm } = AUDIO.engine;

  let low = 0;
  for (const top of gears) {
    if (speed < top) {
      const t = (speed - low) / (top - low);
      return idleRpm + t * (maxRpm - idleRpm);
    }
    low = top;
  }
  // Über dem letzten Gang: am Begrenzer. Nicht weiter steigen zu lassen ist
  // hier richtig — sonst klettert die Tonhöhe im Sturzflug ins Unhörbare.
  return maxRpm;
}
