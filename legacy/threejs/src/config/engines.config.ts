import type { VehicleId, VehicleSpec } from './vehicles.config';

/**
 * Engine identity for Open Bay. Names follow ASTRA_PLAN §6.
 * Geometry lives in `garageEngine.ts`; this file is data only so tests
 * can import it without pulling GLSL through PropMaterial.
 */
export type EngineLayout = 'i3' | 'i4' | 'i4t' | 'i6t' | 'v6' | 'v6tt' | 'v8' | 'race';

export interface EngineLook {
  readonly layout: EngineLayout;
  readonly name: string;
  readonly note: string;
  readonly rear: boolean;
  readonly turbo: boolean;
  readonly pitch: number;
  readonly glow: number;
  readonly fanHz: number;
}

const LOOK: Readonly<Record<VehicleId, EngineLook>> = {
  touge: { layout: 'i4', name: 'Inline-four', note: 'Dry midrange rasp', rear: false, turbo: false, pitch: 1.05, glow: 0xff6a3a, fanHz: 18 },
  pip: { layout: 'i3', name: 'Turbo triple', note: 'Light compressor chirp', rear: false, turbo: true, pitch: 1.22, glow: 0xffb45e, fanHz: 22 },
  truck: { layout: 'i3', name: 'Inline-three', note: 'Low mechanical chatter', rear: false, turbo: false, pitch: 0.92, glow: 0xe08a4a, fanHz: 14 },
  offroad: { layout: 'i4t', name: 'Turbo four', note: 'Broad growl', rear: false, turbo: true, pitch: 0.88, glow: 0xff7a38, fanHz: 15 },
  torrent: { layout: 'i4t', name: 'Turbo four', note: 'Tight exhaust pulses', rear: false, turbo: true, pitch: 1.08, glow: 0xff8a40, fanHz: 20 },
  ribbon: { layout: 'i6t', name: 'Turbo six', note: 'Smooth rising howl', rear: false, turbo: true, pitch: 1.12, glow: 0xff9a55, fanHz: 19 },
  meridian: { layout: 'v6tt', name: 'Twin-turbo six', note: 'Insulated low tone', rear: false, turbo: true, pitch: 0.96, glow: 0xffc077, fanHz: 16 },
  morrow: { layout: 'v8', name: 'V8', note: 'Uneven idle, heavy bass', rear: false, turbo: false, pitch: 0.72, glow: 0xff5530, fanHz: 12 },
  gt: { layout: 'v6', name: 'High-rev V6', note: 'Bright pulses behind you', rear: true, turbo: false, pitch: 1.28, glow: 0xff4a2a, fanHz: 24 },
  needle: { layout: 'race', name: 'Race V6', note: 'Thin mechanical urgency', rear: true, turbo: false, pitch: 1.4, glow: 0xffd0a0, fanHz: 28 },
};

export function engineLook(id: VehicleId): EngineLook {
  return LOOK[id];
}

export function beltHeight(spec: VehicleSpec): number {
  const shape = spec.body.shape;
  return shape === 'suv' ? 1.16
    : shape === 'truck' ? 0.96
    : shape === 'hatch' ? 0.86
    : shape === 'rally' ? 0.88
    : shape === 'supercar' ? 0.65
    : 0.78;
}
