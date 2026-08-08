/**
 * Asset-URLs an einer Stelle.
 *
 * Alles läuft über Vites `?url`-Import statt über einen `public/`-Ordner:
 * so bekommen die Dateien im Build einen Inhalts-Hash, landen im Manifest und
 * ein Tippfehler im Pfad fällt beim Bauen auf statt erst im Browser mit einem
 * 404. Die Reihenfolge der Layer-Arrays entspricht TERRAIN_LAYERS.
 */

import heightUrl from '../../assets/generated/terrain/height.r16?url';
import normalUrl from '../../assets/generated/terrain/normal.png?url';
import zonesUrl from '../../assets/generated/terrain/zones.png?url';
import metaUrl from '../../assets/generated/terrain/meta.json?url';
import shadeUrl from '../../assets/generated/terrain/shade.png?url';
// Wassermaske der Reisfeld-Parzellen (P5.4). Entsteht im Terrain-Baker,
// Schritt 5c, und liegt deshalb bei den Terrain-Assets und nicht bei den Props.
import paddyUrl from '../../assets/generated/terrain/paddy.png?url';
import shadeMetaUrl from '../../assets/generated/terrain/shade.json?url';
// Flusstrasse (P8.5b). Entsteht im Terrain-Baker, Schritt 5b2 — der Fluss folgt
// dem Gefälle des Höhenfelds und gehört deshalb zu den Terrain-Assets, nicht zu
// den Straßen.
import riverUrl from '../../assets/generated/terrain/river.json?url';

import skyUrl from '../../assets/hdri/industrial_sunset_02_puresky_4k.hdr?url';
import iblUrl from '../../assets/hdri/rooftop_night_2k.hdr?url';
import sunUrl from '../../assets/generated/lighting/industrial_sunset_02_puresky_4k.sun.json?url';

import rockAlbedo from '../../assets/generated/textures/rock_face_03/Diffuse.jpg?url';
import rockNormal from '../../assets/generated/textures/rock_face_03/nor_gl.jpg?url';
import rockArm from '../../assets/generated/textures/rock_face_03/arm.jpg?url';

import grassAlbedo from '../../assets/generated/textures/aerial_grass_rock/Diffuse.jpg?url';
import grassNormal from '../../assets/generated/textures/aerial_grass_rock/nor_gl.jpg?url';
import grassArm from '../../assets/generated/textures/aerial_grass_rock/arm.jpg?url';

import sandAlbedo from '../../assets/generated/textures/coast_sand_01/Diffuse.jpg?url';
import sandNormal from '../../assets/generated/textures/coast_sand_01/nor_gl.jpg?url';
import sandArm from '../../assets/generated/textures/coast_sand_01/arm.jpg?url';

import paddyAlbedo from '../../assets/generated/textures/brown_mud_02/Diffuse.jpg?url';
import paddyNormal from '../../assets/generated/textures/brown_mud_02/nor_gl.jpg?url';
import paddyArm from '../../assets/generated/textures/brown_mud_02/arm.jpg?url';

export const TERRAIN_ASSETS = {
  height: heightUrl,
  normal: normalUrl,
  zones: zonesUrl,
  meta: metaUrl,
  /** Gebackene Verschattung aus tools/bake-shadows.mjs — PLAN.md P2 / 2.3. */
  shade: shadeUrl,
  paddy: paddyUrl,
  shadeMeta: shadeMetaUrl,
  river: riverUrl,
} as const;

export const HDRI_ASSETS = {
  /** Sichtbarer Himmel — scene.background. */
  sky: skyUrl,
  /** Beleuchtung — PMREM → scene.environment. */
  ibl: iblUrl,
  /** Ausgabe von tools/hdri-sun.mjs für `sky`. */
  sun: sunUrl,
} as const;

/**
 * Detailtexturen, Reihenfolge = TERRAIN_LAYERS.
 *
 * `nor_gl` ist die OpenGL-Normalmap (WebGL braucht die, nicht `nor_dx`), `arm`
 * packt AO/Roughness/Metalness in eine Textur — ein Sampler statt drei.
 */
export const LAYER_TEXTURES = {
  albedo: [rockAlbedo, grassAlbedo, sandAlbedo, paddyAlbedo],
  normal: [rockNormal, grassNormal, sandNormal, paddyNormal],
  arm: [rockArm, grassArm, sandArm, paddyArm],
} as const;
