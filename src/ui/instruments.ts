import { AUDIO } from "@/config/audio.config";

/** Dieselben virtuellen Automatikstufen wie der Motorton, keine neue Physik. */
export function instruments(forwardSpeed: number): {
  gear: string;
  rpm: number;
  fraction: number;
} {
  const speed = Math.abs(Number.isFinite(forwardSpeed) ? forwardSpeed : 0);
  const bands = AUDIO.engine.gearTopSpeeds;
  let index = bands.findIndex((top) => speed < top);
  if (index < 0) index = bands.length - 1;
  const low = index === 0 ? 0 : bands[index - 1]!;
  const fraction = Math.min(
    1,
    Math.max(0, (speed - low) / (bands[index]! - low)),
  );
  return {
    gear: forwardSpeed < -0.5 ? "R" : speed < 0.15 ? "N" : String(index + 1),
    rpm: Math.round(
      AUDIO.engine.idleRpm +
        fraction * (AUDIO.engine.maxRpm - AUDIO.engine.idleRpm),
    ),
    fraction,
  };
}
