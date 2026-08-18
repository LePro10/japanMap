/**
 * Asset-URLs der Straßen. Gleiche Begründung wie in terrainAssets.ts:
 * `?url` statt `public/`, damit Vite hasht und ein Tippfehler beim Bauen
 * auffällt statt erst im Browser mit einem 404.
 *
 * **Seit P15.2 kommen die drei Asphalttexturen aus dem Manifest**, nicht mehr
 * aus eigenen Importen. Sie sind mit 6,31 MB der größte Textursatz der Karte
 * und damit der wichtigste Posten des gestuften Starts; `roads.json` bleibt,
 * wo es ist — es ist Weltdatum und wird nie gestuft.
 */

import { ROAD_TEXTURE_SETS, START_TIER } from '@/core/AssetManifest';

import roadsUrl from '../../../assets/generated/roads/roads.json?url';

export const ROAD_ASSETS = {
  /** Ausgabe von tools/gen-roads.mjs. */
  network: roadsUrl,
  albedo: ROAD_TEXTURE_SETS[START_TIER].albedo,
  normal: ROAD_TEXTURE_SETS[START_TIER].normal,
  arm: ROAD_TEXTURE_SETS[START_TIER].arm,
} as const;
