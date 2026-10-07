import { Vector3, type PerspectiveCamera } from 'three';
import { AUDIO, AUDIO_STORAGE_KEY, AUDIO_VOLUME_KEY, ENGINE_VOICES } from '@/config/audio.config';
import type { VehicleId } from '@/config/vehicles.config';
import type { EngineContext, System } from '@/core/System';
import type { Vehicle, VehicleTelemetry } from '@/game/Vehicle';
import { SURFACE_ID, type VehicleSoundParams } from './dsp/vehicleMixer';
import * as shots from './oneShots';
import type { VehicleAudioMessage } from './vehicleAudio.worklet';
import workletUrl from './vehicleAudio.worklet.ts?worker&url';

/**
 * Die Tonschicht — P16, neu gebaut als **Tonschicht 2**.
 *
 * ## Warum neu
 *
 * Die erste Fassung (P16) war zwei verstimmte Sägezähne durch einen Tiefpass
 * für den Motor und ein Bandpassrauschen für alles andere. Der Auftraggeber:
 * „jeder Sound hört sich nach AI Slop an, fast unspielbar, vor allem beim
 * Fahren und Schalten". Drei Befunde standen dahinter, alle drei nachgemessen:
 *
 * 1. **Die Tonhöhe sprang beim Schalten** in einem Frame, über fünf feste
 *    Tempobänder für alle zehn Autos; das Gas änderte an der Tonhöhe nichts.
 * 2. **Ein Sägezahn hat eine Klangfarbe** — egal ob Leerlauf, Vollgas, Schub.
 * 3. **Rauschen war lauter als der Motor** und auf jedem Belag gleich.
 *
 * ## Aufbau jetzt
 *
 * - `Gearbox` (in `Vehicle`) liefert Drehzahl, Gang, Last — mit Schaltpause,
 *   Zwischengas, Kupplung, Begrenzer. Anzeige und Ton lesen dasselbe.
 * - Ein **AudioWorklet** (`vehicleAudio.worklet.ts` → `dsp/`) rendert Motor,
 *   Reifen, Belag, Wind, Nitro, Schleifen und Fahrwerk je Abtastwert. Der
 *   Motor ist ein Modell aus Zündpulsen, Krümmer- und Endrohren
 *   (Wellenleiter) und Schalldämpferkammern, eine Stimme je Fahrzeug
 *   (`ENGINE_VOICES`).
 * - **Einzelgeräusche** (`oneShots.ts`) sind geschichtet: Körper, Material,
 *   Nachklang — Holz klingt nach Holz, eine Planke nach Stahl.
 * - Summe: Hall-Send → Kompressor als Begrenzer → Lautstärke → Ausgang.
 *
 * 0 Byte Download — Begründung in `audio.config.ts`.
 *
 * ## Die drei Fallen der Web Audio API (P16, gelten weiter)
 *
 * 1. Ein `AudioContext` startet suspendiert → angelegt in `unlock()`, also in
 *    der Nutzergeste.
 * 2. Sprünge an einem laufenden Parameter knacken → Rampen, und im Worklet
 *    wird ohnehin je Block geglättet.
 * 3. Oszillatoren sind Einwegteile → Einzelgeräusche legen je Ereignis Knoten
 *    an, die sich nach `onended` selbst abhängen.
 *
 * Und eine vierte, neu: **ein Worklet-Modul lädt asynchron.** Bis es da ist,
 * gibt es keinen Motor; die Parameter werden bis dahin verworfen, nicht
 * gepuffert — der erste Satz nach dem Laden ist ohnehin vollständig.
 */
interface RivalVoice {
  readonly node: AudioWorkletNode;
  readonly panner: PannerNode;
  id: VehicleId | null;
  readonly last: Vector3;
  /** Abstand zur Kamera im letzten Bild, m; −1 = unbekannt. */
  dist: number;
}

/** Höchstzahl gleichzeitiger Gegnermotoren. */
const RIVAL_VOICES = 3;

export class AudioSystem implements System {
  readonly name = 'AudioSystem';

  #ctx: AudioContext | null = null;
  #warnedNaN = false;
  #master: GainNode | null = null;
  #bus: shots.ShotBus | null = null;
  #node: AudioWorkletNode | null = null;
  #workletFailed = false;
  readonly #params: Partial<VehicleSoundParams> = {};
  #sum: GainNode | null = null;
  #reverb: ConvolverNode | null = null;
  #moduleReady = false;
  #rivalSource: (() => readonly Vehicle[]) | null = null;
  readonly #rivalVoices: RivalVoice[] = [];
  readonly #fwd = new Vector3();

  #userMuted = false;
  #externallyMuted = false;
  #volume: number = AUDIO.masterVolume;
  #driveActive = false;
  #cabin = false;
  #telemetry: VehicleTelemetry | null = null;
  #vehicleId: VehicleId = 'touge';
  #camera: PerspectiveCamera | null = null;
  readonly #lastCam = new Vector3();
  #camSpeed = 0;
  #camInit = false;

  // Zustände für Flanken.
  #lastShifts = 0;
  #lastLimiter = 0;
  #wasAirborne = false;
  #airTime = 0;
  #lastCompression = 0;
  #lastPenetration = 0;
  #lastImpactAt = -1;
  #scrape = 0;
  #lastWater = 0;
  #sparkChain = 0;
  #sparkChainUntil = 0;
  #countdown: AudioScheduledSourceNode[] = [];

  // Anlassen, Abstellen, Gasstoß in der Garage.
  #startT = -1;
  #stopT = -1;
  #blipT = -1;
  #blipPitch = 1;
  #lastRpm = 800;

  constructor() {
    try {
      this.#userMuted = localStorage.getItem(AUDIO_STORAGE_KEY) === '1';
      const v = Number(localStorage.getItem(AUDIO_VOLUME_KEY));
      if (localStorage.getItem(AUDIO_VOLUME_KEY) !== null && Number.isFinite(v)) {
        this.#volume = Math.min(1, Math.max(0, v));
      }
    } catch {
      this.#userMuted = false;
    }
  }

  init(context: EngineContext): void {
    this.#camera = context.camera;
    context.bus.on('pickup:collected', ({ kind }) => this.#sparkChime(kind));
    context.bus.on('race:checkpoint', () => {
      if (this.#bus && this.#audible()) shots.checkpoint(this.#bus);
    });
    context.bus.on('race:lap', () => {
      if (this.#bus && this.#audible()) shots.lap(this.#bus, false);
    });
    context.bus.on('race:state', ({ state }) => {
      for (const n of this.#countdown) {
        try {
          n.stop();
        } catch {
          // schon verklungen
        }
      }
      this.#countdown = [];
      if (state === 'countdown' && this.#bus && !this.muted) {
        this.#countdown = shots.countdown(this.#bus, AUDIO.countdownSeconds);
      }
    });
    context.bus.on('drive:stunt', ({ active }) => {
      if (active) this.stunt(true);
    });
    context.bus.on('drive:mode', ({ active }) => {
      if (active && !this.#driveActive) {
        this.#startT = 0;
        this.#stopT = -1;
      } else if (!active && this.#driveActive) {
        this.#stopT = 0;
        this.#startT = -1;
      }
      this.#driveActive = active;
    });
    context.bus.on('drive:view', ({ cabin }) => {
      this.#cabin = cabin;
    });
    context.bus.on('drive:vehicle', ({ id }) => this.setVehicle(id));
    context.bus.on('drive:broke', (e) => {
      if (!this.#bus || this.muted) return;
      shots.breakable(this.#bus, e.kind, Math.hypot(e.vx, e.vz));
    });
    context.bus.on('drive:rescued', () => {
      if (this.#bus && !this.muted) shots.whoosh(this.#bus, 0.12, false);
    });
    context.bus.on('drive:too-deep', () => {
      if (this.#bus && !this.muted) shots.splash(this.#bus, 0.8);
    });
    document.addEventListener('visibilitychange', this.#onVisibility);
    context.bus.on('engine:sleep', ({ sleeping }) => {
      const ctx = this.#ctx;
      if (!ctx) return;
      if (sleeping) void ctx.suspend().catch(() => undefined);
      else if (!document.hidden) void ctx.resume().catch(() => undefined);
    });
  }

  setTelemetry(telemetry: VehicleTelemetry): void {
    this.#telemetry = telemetry;
    this.#lastShifts = telemetry.shifts;
    this.#lastLimiter = telemetry.limiterHits;
  }

  /**
   * Woher die Gegner kommen — Tonschicht 2. Jeder Gegner bekommt seinen
   * eigenen Motor, räumlich und mit Doppler; bis dahin fuhr das Feld stumm
   * neben einem her, und ein Überholmanöver war nur zu *sehen*.
   */
  setRivals(source: () => readonly Vehicle[]): void {
    this.#rivalSource = source;
  }

  /** Welche Motorstimme spielt. Auch vor `unlock()` gültig — wird dann nachgereicht. */
  setVehicle(id: VehicleId): void {
    this.#vehicleId = id;
    this.#post({ t: 'profile', profile: ENGINE_VOICES[id] });
  }

  // ── Freischalten ────────────────────────────────────────────────────────

  unlock(): void {
    if (!this.#ctx) this.#build();
    void this.#ctx?.resume().catch(() => undefined);
  }

  armAutoUnlock(): void {
    const los = (): void => {
      this.unlock();
    };
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
      window.addEventListener(type, los, { once: true, capture: true });
    }
  }

  #build(): void {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    // `interactive` ist der Standard; ausdrücklich, weil der Motor auf Gas
    // reagieren muss — 10 ms Latenz sind spürbar, 100 ms nicht mehr spielbar.
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.#ctx = ctx;

    // Summe: [Quellen] → sum → Kompressor → master (Lautstärke/Stumm) → Ausgang.
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.#volume;
    master.connect(ctx.destination);
    this.#master = master;

    // Der Kompressor ist ein Begrenzer: Motor + Quietschen + Aufprall + Glocke
    // können gleichzeitig kommen, und ohne ihn übersteuert die Summe hörbar.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    comp.connect(master);

    const sum = ctx.createGain();
    sum.gain.value = 1;
    sum.connect(comp);

    const reverb = ctx.createConvolver();
    reverb.buffer = shots.makeImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    reverb.connect(wet);
    wet.connect(sum);

    this.#bus = { ctx, dry: sum, wet: reverb, noise: shots.makeNoise(ctx) };
    this.#sum = sum;
    this.#reverb = reverb;

    const worklet = ctx.audioWorklet;
    if (!worklet) {
      this.#workletFailed = true;
      console.warn('AudioSystem: kein AudioWorklet — Motor und Reifen bleiben stumm.');
      return;
    }
    worklet
      .addModule(workletUrl)
      .then(() => {
        if (this.#ctx !== ctx) return;
        this.#moduleReady = true;
        const node = new AudioWorkletNode(ctx, 'vehicle-audio', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        node.connect(sum);
        // Ein Hauch Raum für den Motor — trocken klingt er wie aus einem Kasten.
        const send = ctx.createGain();
        send.gain.value = 0.06;
        node.connect(send);
        send.connect(reverb);
        this.#node = node;
        node.port.postMessage({ t: 'profile', profile: ENGINE_VOICES[this.#vehicleId] } satisfies VehicleAudioMessage);
        node.port.postMessage({ t: 'p', p: this.#params } satisfies VehicleAudioMessage);
      })
      .catch((err: unknown) => {
        this.#workletFailed = true;
        console.warn('AudioSystem: Worklet konnte nicht geladen werden.', err);
      });
  }

  #post(m: VehicleAudioMessage): void {
    this.#node?.port.postMessage(m);
  }

  #audible(): boolean {
    const ctx = this.#ctx;
    return !!ctx && !this.muted && ctx.state === 'running';
  }

  // ── Stummschaltung und Lautstärke ──────────────────────────────────────

  get muted(): boolean {
    return this.#userMuted || this.#externallyMuted;
  }

  get volume(): number {
    return this.#volume;
  }

  setMuted(muted: boolean): void {
    this.#userMuted = muted;
    try {
      localStorage.setItem(AUDIO_STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // nur für diese Sitzung
    }
    this.#applyMute();
  }

  /** Gesamtlautstärke 0…1 — der Regler im Menü. */
  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    this.#volume = Math.min(1, Math.max(0, volume));
    try {
      localStorage.setItem(AUDIO_VOLUME_KEY, String(this.#volume));
    } catch {
      // nur für diese Sitzung
    }
    this.#applyMute();
  }

  /** Vorrang vor der Spieleinstellung — für das CrazyGames-SDK (P16). */
  setExternallyMuted(muted: boolean): void {
    this.#externallyMuted = muted;
    this.#applyMute();
  }

  #applyMute(): void {
    const ctx = this.#ctx;
    const master = this.#master;
    if (!ctx || !master) return;
    master.gain.setTargetAtTime(this.muted ? 0 : this.#volume, ctx.currentTime, 0.02);
  }

  readonly #onVisibility = (): void => {
    const ctx = this.#ctx;
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => undefined);
    else void ctx.resume().catch(() => undefined);
  };

  // ── Einzelgeräusche (öffentlich) ────────────────────────────────────────

  /** Aufprall gegen etwas Festes. `strength` 0…1. */
  impact(strength: number): void {
    const ctx = this.#ctx;
    if (!ctx || !this.#bus || this.muted) return;
    const now = ctx.currentTime;
    if (now - this.#lastImpactAt < AUDIO.impact.minInterval) return;
    this.#lastImpactAt = now;
    shots.carImpact(this.#bus, strength);
    this.#post({ t: 'thump', s: Math.min(1, strength * 0.8) });
  }

  lap(best: boolean): void {
    if (this.#bus && !this.muted) shots.lap(this.#bus, best);
  }

  finish(place: number, best: boolean): void {
    if (!this.#bus || this.muted) return;
    if (best || place === 1) shots.finish(this.#bus, 1);
    else shots.finish(this.#bus, place);
  }

  click(): void {
    if (this.#bus && !this.muted) shots.uiClick(this.#bus);
  }

  stunt(on: boolean): void {
    if (!this.#bus || this.muted) return;
    shots.whoosh(this.#bus, on ? 0.2 : 0.1, on);
    if (on) shots.bell(this.#bus, 587.33, 0.08, 0.06, 0.5);
  }

  /**
   * Gasstoß in der Tune-Bucht: der echte Motor des gewählten Fahrzeugs,
   * Leerlauf → hoch → zurück, samt Fehlzündungen im Schub. `pitch` ist der
   * Drehzahlcharakter des eingebauten Motors (`engines.config.ts`).
   */
  engineBlip(pitch = 1): void {
    if (this.#driveActive) return;
    this.#blipT = 0;
    this.#blipPitch = Math.max(0.6, Math.min(1.5, pitch));
  }

  #sparkChime(kind: 'coin' | 'boost'): void {
    const ctx = this.#ctx;
    if (!ctx || !this.#bus || !this.#audible()) return;
    const now = ctx.currentTime;
    if (now < this.#sparkChainUntil) this.#sparkChain += 1;
    else this.#sparkChain = 0;
    this.#sparkChainUntil = now + 0.32;
    const ladder = [1568, 1760, 1976, 2349, 2637, 3136];
    const hz = ladder[Math.min(this.#sparkChain, ladder.length - 1)]!;
    shots.pickup(this.#bus, hz, this.#sparkChain === 0, kind);
  }

  // ── Schleife ────────────────────────────────────────────────────────────

  update(dt: number): void {
    const ctx = this.#ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (!(dt > 0) || !Number.isFinite(dt)) return;

    // Kameratempo für den Wind zu Fuß und im Freiflug.
    const cam = this.#camera;
    if (cam) {
      if (!this.#camInit) {
        this.#lastCam.copy(cam.position);
        this.#camInit = true;
      }
      const v = cam.position.distanceTo(this.#lastCam) / dt;
      this.#lastCam.copy(cam.position);
      // Teleports (Blickpunkt, Respawn) sind keine Geschwindigkeit.
      if (v < 400) this.#camSpeed += (v - this.#camSpeed) * (1 - Math.exp(-dt / 0.3));
    }

    const t = this.#telemetry;
    const fahrend = this.#driveActive && t !== null;

    // ── Motorzustand: Telemetrie, überlagert von Anlassen/Abstellen/Blip ──
    let rpm = t ? t.rpm : 800;
    let load = t ? t.load : 0;
    let throttle = t ? t.throttle : 0;
    const idle = t ? t.idleRpm : 800;
    const redline = t ? t.redline : 7000;
    let on = fahrend ? 1 : 0;
    let starter = 0;

    if (this.#startT >= 0) {
      this.#startT += dt;
      const s = this.#startT;
      if (s < 0.55) {
        // Anlasser: der Motor wird mit ~200 min⁻¹ durchgedreht, die Zylinder
        // zünden noch nicht richtig.
        starter = 1;
        rpm = 170 + 90 * Math.abs(Math.sin(s * 22));
        load = 0.04;
        throttle = 0;
      } else if (s < 1.4) {
        // Er springt an: kurzes Hochdrehen über den Leerlauf, dann setzt er sich.
        const k = (s - 0.55) / 0.85;
        const flare = Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (1 - k);
        rpm = Math.max(rpm, idle * (1 + 1.1 * flare));
        load = Math.max(load, 0.5 * flare);
      } else {
        this.#startT = -1;
      }
    }
    if (this.#stopT >= 0) {
      this.#stopT += dt;
      const s = this.#stopT;
      if (s < 0.7) {
        on = 1 - s / 0.7;
        rpm = this.#lastRpm * (1 - s / 0.7) + 60;
        load = 0;
      } else {
        this.#stopT = -1;
      }
    }
    if (this.#blipT >= 0 && !fahrend) {
      this.#blipT += dt;
      const s = this.#blipT;
      const p = this.#blipPitch;
      const top = Math.min(redline * 0.9, idle + (redline - idle) * 0.72 * p);
      on = 1;
      if (s < 0.28) {
        rpm = idle + (top - idle) * (s / 0.28) ** 0.8;
        load = 1;
        throttle = 1;
      } else if (s < 1.3) {
        rpm = idle + (top - idle) * Math.exp(-(s - 0.28) / 0.28);
        load = 0;
        throttle = 0;
      } else if (s < 2.2) {
        rpm = idle;
        load = 0;
      } else {
        on = 0;
        this.#blipT = -1;
      }
    }

    if (!Number.isFinite(rpm) || !Number.isFinite(load)) {
      if (!this.#warnedNaN) {
        this.#warnedNaN = true;
        console.warn('AudioSystem: Drehzahl oder Last nicht endlich — Frame übersprungen.', { rpm, load, telemetrie: t });
      }
      return;
    }
    if (fahrend) this.#lastRpm = rpm;

    // ── Flanken: Schalten, Begrenzer, Landung, Bodenwelle, Aufprall ───────
    if (t && fahrend) {
      if (t.shifts !== this.#lastShifts) {
        const up = t.gear > this.#lastGear();
        this.#post({ t: 'clunk' });
        // Knall beim Hochschalten unter Last — nur Motoren, die dazu neigen.
        if (up && t.throttle > 0.8 && t.rpm > t.redline * 0.7 && ENGINE_VOICES[this.#vehicleId].crackle >= 0.35) {
          this.#post({ t: 'bang', s: 0.25 + 0.35 * ENGINE_VOICES[this.#vehicleId].crackle });
        }
        this.#lastShifts = t.shifts;
      }
      this.#gearNow = t.gear;
      if (t.limiterHits !== this.#lastLimiter) this.#lastLimiter = t.limiterHits;

      if (t.airborne) {
        this.#airTime += dt;
      } else {
        if (this.#wasAirborne && this.#airTime > 0.18) {
          this.#post({ t: 'thump', s: Math.min(1, 0.25 + this.#airTime * 0.9) });
        }
        this.#airTime = 0;
      }
      this.#wasAirborne = t.airborne;

      // Bodenwelle: schneller Anstieg der Federung.
      const dc = (t.compression - this.#lastCompression) / dt;
      if (!t.airborne && dc > 2.2 && t.speed > 4) {
        this.#post({ t: 'thump', s: Math.min(0.6, (dc - 2.2) * 0.08) });
      }
      this.#lastCompression = t.compression;

      // Aufprall ist die Flanke der Durchdringung (P16), Schleifen ihr Zustand.
      const p = t.lastPenetration;
      if (p > AUDIO.impact.minPenetration && p > this.#lastPenetration * 1.5) {
        const s =
          (p - AUDIO.impact.minPenetration) / (AUDIO.impact.fullPenetration - AUDIO.impact.minPenetration);
        this.impact(Math.min(1, s * Math.min(1, 0.3 + t.speed / 12)));
      }
      this.#lastPenetration = p;
      const scrapeT = t.contacts > 0 && t.speed > 2 ? Math.min(1, 0.4 + t.speed / 20) : 0;
      this.#scrape += (scrapeT - this.#scrape) * (1 - Math.exp(-dt / (scrapeT > this.#scrape ? 0.03 : 0.15)));

      // Ins Wasser fahren.
      if (t.waterDepth > 0.15 && this.#lastWater <= 0.15 && t.speed > 5 && this.#bus && !this.muted) {
        shots.splash(this.#bus, Math.min(1, t.speed / 20));
      }
      this.#lastWater = t.waterDepth;
    } else {
      this.#lastPenetration = 0;
      this.#scrape = 0;
      this.#wasAirborne = false;
      this.#airTime = 0;
    }

    this.#updateRivals(dt);

    // ── Parameter an den Worklet ──────────────────────────────────────────
    const P = this.#params;
    P.rpm = rpm;
    P.load = load;
    P.throttle = throttle;
    P.idle = idle;
    P.redline = redline;
    P.on = on;
    P.starter = starter;
    P.cabin = this.#cabin && fahrend ? 1 : 0;
    P.drive = fahrend ? 1 : 0;
    P.speed = fahrend ? t.speed : 0;
    P.surface = fahrend ? SURFACE_ID[t.surface] ?? 0 : 0;
    P.skid = fahrend ? t.skid : 0;
    P.slip = fahrend ? Math.abs(t.slip) : 0;
    P.wheelspin = fahrend ? t.wheelspin : 0;
    P.airborne = fahrend && t.airborne ? 1 : 0;
    P.water = fahrend ? t.waterDepth : 0;
    P.boost = fahrend && t.boosting ? 1 : 0;
    P.scrape = this.#scrape;
    P.circuit = fahrend ? t.circuit : 0;
    P.fly = fahrend ? 0 : this.#camSpeed;
    if (!this.muted) this.#post({ t: 'p', p: P });
    else this.#post({ t: 'p', p: { ...P, on: 0, drive: 0, fly: 0, starter: 0 } });
  }

  /**
   * Gegnerstimmen: je Gegner ein Worklet-Knoten (nur Motor) hinter einem
   * `PannerNode`. Höchstens `RIVAL_VOICES` — mehr hört man in einem Pulk
   * ohnehin nicht getrennt, und jede Stimme kostet rund 1,5 % eines Kerns.
   *
   * **Doppler von Hand**: die Web-Audio-API hat ihren eigenen Doppler
   * gestrichen. Die Annäherungsgeschwindigkeit skaliert hier die Drehzahl, und
   * weil das Motormodell alles aus der Drehzahl ableitet, verschiebt sich das
   * ganze Spektrum — genau das „Iiiiyowww" beim Vorbeifahren.
   */
  #updateRivals(dt: number): void {
    const ctx = this.#ctx;
    const cam = this.#camera;
    if (!ctx || !cam || !this.#moduleReady || !this.#sum) return;
    const now = ctx.currentTime;
    const L = ctx.listener;
    cam.getWorldDirection(this.#fwd);
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.position.x, now, 0.02);
      L.positionY.setTargetAtTime(cam.position.y, now, 0.02);
      L.positionZ.setTargetAtTime(cam.position.z, now, 0.02);
      L.forwardX.setTargetAtTime(this.#fwd.x, now, 0.02);
      L.forwardY.setTargetAtTime(this.#fwd.y, now, 0.02);
      L.forwardZ.setTargetAtTime(this.#fwd.z, now, 0.02);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(cam.position.x, cam.position.y, cam.position.z);
      L.setOrientation(this.#fwd.x, this.#fwd.y, this.#fwd.z, 0, 1, 0);
    }

    const rivals = this.#rivalSource?.() ?? [];
    const n = Math.min(RIVAL_VOICES, rivals.length);
    while (this.#rivalVoices.length < n) {
      const node = new AudioWorkletNode(ctx, 'vehicle-audio', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 7;
      panner.rolloffFactor = 1.15;
      panner.maxDistance = 500;
      const gain = ctx.createGain();
      gain.gain.value = 0.75;
      node.connect(panner);
      panner.connect(gain);
      gain.connect(this.#sum);
      if (this.#reverb) {
        const send = ctx.createGain();
        send.gain.value = 0.08;
        gain.connect(send);
        send.connect(this.#reverb);
      }
      this.#rivalVoices.push({ node, panner, id: null, last: new Vector3(), dist: -1 });
    }
    for (let i = 0; i < this.#rivalVoices.length; i++) {
      const voice = this.#rivalVoices[i]!;
      const car = i < n ? rivals[i] : undefined;
      if (!car || this.muted) {
        voice.dist = -1;
        voice.node.port.postMessage({ t: 'p', p: { on: 0, drive: 0 } } satisfies VehicleAudioMessage);
        continue;
      }
      const id = car.spec.id;
      if (voice.id !== id) {
        voice.id = id;
        voice.node.port.postMessage({ t: 'profile', profile: ENGINE_VOICES[id] } satisfies VehicleAudioMessage);
      }
      const pos = car.position;
      const dist = pos.distanceTo(cam.position);
      // Annäherung positiv → höher. Teleports (Start, Rettung) nicht als Tempo lesen.
      let closing = voice.dist >= 0 ? (voice.dist - dist) / dt : 0;
      if (!Number.isFinite(closing) || Math.abs(closing) > 120) closing = 0;
      voice.dist = dist;
      const doppler = Math.min(1.3, Math.max(0.75, 343 / (343 - closing)));
      voice.panner.positionX.setTargetAtTime(pos.x, now, 0.02);
      voice.panner.positionY.setTargetAtTime(pos.y + 0.5, now, 0.02);
      voice.panner.positionZ.setTargetAtTime(pos.z, now, 0.02);
      const tel = car.telemetry;
      voice.node.port.postMessage({
        t: 'p',
        p: {
          rpm: tel.rpm * doppler,
          load: tel.load,
          throttle: tel.throttle,
          idle: tel.idleRpm * doppler,
          redline: tel.redline * doppler,
          on: 1,
          drive: 0,
          cabin: 0,
          starter: 0,
          fly: 0,
        },
      } satisfies VehicleAudioMessage);
    }
  }

  #gearNow = 0;
  #lastGear(): number {
    return this.#gearNow;
  }

  /**
   * Zustand zum Nachsehen in der Konsole — `japanMap.engine.systems.find(s =>
   * s.name === 'AudioSystem').debugState`. Der Ton ist hier nicht hörbar
   * prüfbar; ob der Kontext läuft und der Worklet steht, schon.
   */
  get debugState(): {
    context: string;
    worklet: boolean;
    vehicle: VehicleId;
    rivals: number;
    params: Partial<VehicleSoundParams>;
  } {
    return {
      context: this.#ctx?.state ?? 'none',
      worklet: this.#node !== null,
      rivals: this.#rivalVoices.filter((v) => v.dist >= 0).length,
      vehicle: this.#vehicleId,
      params: { ...this.#params },
    };
  }

  /** `true`, wenn der Motor mangels AudioWorklet stumm bleibt — für die Konsole und Tests. */
  get degraded(): boolean {
    return this.#workletFailed;
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.#onVisibility);
    this.#node?.disconnect();
    for (const v of this.#rivalVoices) v.node.disconnect();
    this.#rivalVoices.length = 0;
    this.#master?.disconnect();
    void this.#ctx?.close().catch(() => undefined);
    this.#ctx = null;
    this.#master = null;
    this.#node = null;
    this.#bus = null;
    this.#telemetry = null;
    this.#camera = null;
  }
}
