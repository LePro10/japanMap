/**
 * Spielertexte des Ladebildschirms — englisch, wie alles im DOM.
 *
 * Die Engine sendet Systemnamen (`TerrainSystem`, `Shader übersetzen`). Die
 * sind für uns, nicht für CrazyGames. Hier werden sie zu einer Zeile, die sich
 * anfühlt wie Fortschritt durch die Welt, nicht durch die Boot-Liste.
 */
const STEPS: Readonly<Record<string, string>> = {
  FreeFlyController: 'Calibrating camera',
  DriveSystem: 'Warming the engine',
  DriveHudUpdate: 'Arming the hud',
  AudioSystem: 'Tuning the night',
  AtmosphereSystem: 'Painting the blue hour',
  LightingRig: 'Finding the sun',
  WaterSystem: 'Filling the coast',
  ScatterSystem: 'Growing the hills',
  PropSystem: 'Placing the villages',
  StuntSystem: 'Raising the ramps',
  RicePaddy: 'Flooding the paddies',
  CitySystem: 'Building neon city',
  NeonSystem: 'Striking the signs',
  TerrainSystem: 'Raising the massif',
  RoadSystem: 'Laying the ring',
  AssetUpgrader: 'Sharpening textures',
  PlanarReflection: 'Wetting the asphalt',
  PostFXPipeline: 'Grading the hour',
  LookController: 'Locking the look',
  Qualität: 'Reading your gpu',
  'Shader übersetzen': 'Compiling the light',
  fertig: 'Ready to drive',
};

export function startStepLabel(raw: string): string {
  return STEPS[raw] ?? raw;
}

export const START_ZONES: readonly {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly z: number;
}[] = [
  { id: 'paddy', label: 'Paddies', x: -760, z: 60 },
  { id: 'toge', label: 'Tōge', x: -536, z: -495 },
  { id: 'torii', label: 'Torii', x: 820, z: -940 },
  { id: 'city', label: 'Neon City', x: 620, z: 120 },
  { id: 'coast', label: 'Coast', x: 100, z: 1400 },
];
