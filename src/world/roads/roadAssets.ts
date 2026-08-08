/**
 * Asset-URLs der Straßen. Gleiche Begründung wie in terrainAssets.ts:
 * `?url` statt `public/`, damit Vite hasht und ein Tippfehler beim Bauen
 * auffällt statt erst im Browser mit einem 404.
 */

import roadsUrl from '../../../assets/generated/roads/roads.json?url';

import asphaltAlbedo from '../../../assets/generated/textures/asphalt_02/Diffuse.jpg?url';
import asphaltNormal from '../../../assets/generated/textures/asphalt_02/nor_gl.jpg?url';
import asphaltArm from '../../../assets/generated/textures/asphalt_02/arm.jpg?url';

export const ROAD_ASSETS = {
  /** Ausgabe von tools/gen-roads.mjs. */
  network: roadsUrl,
  albedo: asphaltAlbedo,
  normal: asphaltNormal,
  arm: asphaltArm,
} as const;
