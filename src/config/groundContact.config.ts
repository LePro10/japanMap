/** Arcade underside contact: shallow scrapes must not act like brake input. */
export const GROUND_CONTACT = {
  scrapeDecel: 2.5, // m/s² at full-depth grounding, independent of speed/frame rate
  scrapeFullDepth: 0.15,
  roadBlendWidth: 0.5,
  roadNormalProbe: 0.05,
  tyreProbeFraction: 0.65,
  supportSkin: 0.04,
  wheelContactIterations: 8,
} as const;
