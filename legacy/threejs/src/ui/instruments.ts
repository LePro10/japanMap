import { AUDIO } from "@/config/audio.config";

/**
 * Was ein Getriebe der Anzeige liefert — die Felder aus `VehicleTelemetry`,
 * die `Gearbox` schreibt. Optional, weil Prüfstände und Tests die Anzeige mit
 * einem nackten Tempo füttern.
 */
export interface GearboxReading {
  readonly rpm?: number;
  readonly gear?: number;
  readonly idleRpm?: number;
  readonly redline?: number;
}

/**
 * Gang, Drehzahl und Zeigerstellung für HUD und Cockpit.
 *
 * Seit der Tonschicht 2 liest die Anzeige das **Getriebe** (`Gearbox`), das
 * auch den Motorton treibt — Zeiger und Ohr sagen damit dasselbe, inklusive
 * Schaltpause, Zwischengas und Begrenzer. Ohne Getriebewerte (Tests, alter
 * Aufrufer) fällt sie auf die alten Tempobänder zurück.
 */
export function instruments(
  forwardSpeed: number,
  box?: GearboxReading,
): {
  gear: string;
  rpm: number;
  fraction: number;
} {
  const speed = Math.abs(Number.isFinite(forwardSpeed) ? forwardSpeed : 0);
  if (
    box &&
    typeof box.rpm === "number" &&
    Number.isFinite(box.rpm) &&
    typeof box.gear === "number" &&
    typeof box.redline === "number" &&
    box.redline > 0
  ) {
    const idle = box.idleRpm ?? 0;
    const fraction = Math.min(
      1,
      Math.max(0, (box.rpm - idle) / (box.redline - idle)),
    );
    return {
      gear: box.gear < 0 ? "R" : box.gear === 0 ? "N" : String(box.gear),
      rpm: Math.round(box.rpm),
      fraction,
    };
  }
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
