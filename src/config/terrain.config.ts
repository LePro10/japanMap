/**
 * Terrain-Parameter — PLAN.md P1 / 1.3 und 1.4.
 *
 * Alles, was tools/bake-terrain.mjs erzeugt, wird hier interpretiert. Die
 * Maße selbst (Weltgröße, Höhenbereich, Heightmap-Auflösung) stehen in
 * world.config.ts und sind für beide Seiten verbindlich.
 */

export const TERRAIN = {
  // `gridVertices: 768` stand hier bis P4 und beschrieb das feste Rendergitter
  // aus P1 — ein einziges Gitter über die ganze Welt, 4,0 m pro Vertex,
  // 1.176.578 Dreiecke je Durchlauf. Es ist durch den Quadtree ersetzt
  // (lod.config.ts). Die Lehre daraus gehört mit:
  //
  //   PLAN.md nannte ursprünglich 1024 Stützstellen mit „~2,1 Mio. Dreiecke".
  //   Die Rechnung war unvollständig, weil das Gitter **zweimal** gerendert
  //   wurde, einmal fürs Bild und einmal für die Schattenkarte. Gemessen waren
  //   es 4.186.128 gegen 3 M Budget. Gefunden hat das nicht die Überlegung,
  //   sondern die Budget-Ampel aus P0.

  /** Kantenlänge einer Detailtextur-Kachel in Metern. */
  detailTileMeters: 11,
  /**
   * Zweite, sehr große Kachelung. Sie moduliert nur die Helligkeit und bricht
   * damit das sichtbare Wiederholungsmuster der Detailtextur auf — aus der
   * Luft ist eine 7-m-Kachel sonst als Gitter erkennbar.
   */
  macroTileMeters: 260,
  macroStrength: 0.28,

  /**
   * Triplanares Mapping ab dieser Neigung. Darunter wird von oben projiziert
   * (billiger, eine Textur-Abfrage statt drei).
   *
   * Ohne Triplanar zieht die Textur an Steilhängen zu langen senkrechten
   * Streifen — bei 450 m Höhenunterschied ist das die auffälligste
   * Bildstörung überhaupt.
   */
  triplanarStartDeg: 35,
  triplanarEndDeg: 60,

  /**
   * Stärke der Detail-Normalmap gegenüber der Geländenormale.
   *
   * Stand zunächst auf 0,75 und erzeugte ein grobes Rautenmuster über das ganze
   * Bild. Der Grund liegt an der Sonne: sie steht 2,2° über dem Horizont, und
   * bei so streifendem Licht wird aus jeder kleinen Normalen-Störung ein harter
   * Hell-Dunkel-Sprung. Was bei hochstehender Sonne als feine Struktur
   * durchgeht, wird hier zum Gitter.
   */
  detailNormalStrength: 0.35,

  /**
   * Ab dieser Entfernung blendet die Detail-Normalmap aus.
   *
   * Bewusst früh (100 m statt der ursprünglich angesetzten 420 m): jenseits
   * davon fällt eine 11-m-Kachel unter die Pixelgröße, und übrig bleibt nur
   * Flimmern. Kantenglättung gibt es erst ab P2 (SMAA), bis dahin ist
   * Ausblenden das einzige Mittel.
   */
  detailFadeStart: 100,
  detailFadeEnd: 420,
} as const;

/**
 * Splat-Kanäle in der Reihenfolge, in der zones.png sie speichert:
 * R = Fels, G = Gras, B = Sand, A = Reisfeld.
 *
 * Die Reihenfolge ist ein Vertrag mit tools/bake-terrain.mjs. Wer sie hier
 * ändert, muss dort `computeZones` mitändern — sonst liegt Sand im Gebirge.
 */
export const TERRAIN_LAYERS = [
  { id: 'rock', label: 'Fels', asset: 'rock_face_03', tileScale: 1.6 },
  { id: 'grass', label: 'Gras', asset: 'aerial_grass_rock', tileScale: 1 },
  { id: 'sand', label: 'Sand', asset: 'coast_sand_01', tileScale: 0.75 },
  { id: 'paddy', label: 'Reisfeld', asset: 'brown_mud_02', tileScale: 1.1 },
] as const;

export type TerrainLayerId = (typeof TERRAIN_LAYERS)[number]['id'];

export const TERRAIN_LAYER_COUNT = TERRAIN_LAYERS.length;

/** Struktur von assets/generated/terrain/meta.json. */
export interface TerrainMeta {
  readonly seed: number;
  readonly world: {
    readonly size: number;
    readonly seaLevel: number;
    readonly minHeight: number;
    readonly maxHeight: number;
  };
  readonly heightmap: {
    readonly file: string;
    readonly res: number;
    readonly spacing: number;
    readonly encoding: string;
    readonly heightRange: number;
  };
  readonly zones: { readonly res: number; readonly channels: readonly string[] };
  readonly measured: {
    readonly minHeight: number;
    readonly maxHeight: number;
    readonly clampedTexels: number;
  };
  readonly chunks: {
    readonly perAxis: number;
    readonly chunkSize: number;
    /** [min, max] je Chunk, zeilenweise von Nord nach Süd. Culling ab P4. */
    readonly minMax: readonly (readonly [number, number])[];
  };
}
