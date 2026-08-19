/** Idealer Boden — isoliert die Physik von Gelände und Kollision (CLAUDE.md). */
export function flatGround(surface = 'asphalt') {
  return {
    height: () => 0,
    normal: (_x, _z, t) => t.set(0, 1, 0),
    surface: () => surface,
    waterDepth: () => 0,
  };
}

export const NO_INPUT = { throttle: 0, brake: 0, steer: 0, handbrake: false };
export const input = (o) => ({ ...NO_INPUT, ...o });
