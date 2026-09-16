/**
 * First visit of a map region — ASTRA_PLAN §3, TODO zones.
 *
 * Dwell and movement exist so spawn, camera flight and a jump-over do not
 * count. Commons sits under the player at load; without both gates the toast
 * would fire before anyone had walked.
 */
export const EXPLORE_DWELL_S = 1.5;
/** Horizontal metres from the point of entry. Sitting still is not a visit. */
export const EXPLORE_MOVE_M = 4;
/** One-time Sparks per region. Wallet chrome stays as it is. */
export const EXPLORE_SPARKS = 200;
/** How long the toast stays — ASTRA 2.5 s, not the 3 s lap flash. */
export const EXPLORE_TOAST_MS = 2500;
