/**
 * Der AudioWorklet der Fahrzeugschicht — Tonschicht 2.
 *
 * Läuft im Audio-Faden, nicht im Spielfaden: ein Frame, der 50 ms hängt
 * (Streuung, Shader-Übersetzung), lässt den Motor **nicht** stottern. Der
 * Hauptfaden schickt je Bild ein flaches Zahlenobjekt; geglättet wird hier.
 *
 * Diese Datei ist absichtlich dünn — alles Hörbare steht in `dsp/`, damit
 * `tools/bench/audio.mts` denselben Code offline rendern kann.
 */
import type { EngineVoiceProfile } from './dsp/engineVoice';
import { VehicleMixer, type VehicleSoundParams } from './dsp/vehicleMixer';

// Die Globals des AudioWorkletGlobalScope stehen nicht in lib.dom.
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

export type VehicleAudioMessage =
  | { t: 'p'; p: Partial<VehicleSoundParams> }
  | { t: 'profile'; profile: EngineVoiceProfile | null }
  | { t: 'thump'; s: number }
  | { t: 'clunk' }
  | { t: 'bang'; s: number };

class VehicleAudioProcessor extends AudioWorkletProcessor {
  #mixer = new VehicleMixer(sampleRate);
  #profile: EngineVoiceProfile | null = null;
  readonly #params: Partial<VehicleSoundParams> = {};

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<VehicleAudioMessage>): void => {
      const m = e.data;
      switch (m.t) {
        case 'p':
          Object.assign(this.#params, m.p);
          this.#mixer.setParams(m.p);
          break;
        case 'profile':
          this.#profile = m.profile;
          this.#mixer.setProfile(m.profile);
          break;
        case 'thump':
          this.#mixer.thump(m.s);
          break;
        case 'clunk':
          this.#mixer.clunk();
          break;
        case 'bang':
          this.#mixer.bang(m.s);
          break;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const l = out?.[0];
    if (!out || !l) return true;
    const r = out[1] ?? l;
    this.#mixer.render(l, r, l.length);
    // Notbremse wie in `AudioSystem.update`: ein NaN im Audio-Faden wäre ein
    // Dauerknall. Ein kaputter Block wird still, der nächste ist wieder gesund.
    for (let i = 0; i < l.length; i++) {
      if (!Number.isFinite(l[i]!) || !Number.isFinite(r[i]!)) {
        l.fill(0);
        if (r !== l) r.fill(0);
        this.#mixer = new VehicleMixer(sampleRate);
        this.#mixer.setProfile(this.#profile);
        this.#mixer.setParams(this.#params);
        break;
      }
    }
    return true;
  }
}

registerProcessor('vehicle-audio', VehicleAudioProcessor);
