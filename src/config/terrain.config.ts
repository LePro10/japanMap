/**
 * Terrain-Parameter — PLAN.md P1 / 1.3 und 1.4.
 *
 * Alles, was tools/bake-terrain.mjs erzeugt, wird hier interpretiert. Die
 * Maße selbst (Weltgröße, Höhenbereich, Heightmap-Auflösung) stehen in
 * world.config.ts und sind für beide Seiten verbindlich.
 */

export const TERRAIN = {
  /**
   * Stützstellen pro Achse im Rendergitter. 4,0 m pro Vertex.
   *
   * In P1 bewusst **ohne LOD**: ein einziges Gitter über die ganze Welt. Der
   * Wert ist die Messlatte, an der P4 zeigen muss, dass der Quadtree etwas
   * bringt.
   *
   * PLAN.md nannte hier 1024 mit „~2,1 Mio. Dreiecke". Die Rechnung war
   * unvollständig: das Gitter wird **zweimal** gerendert, einmal für das Bild
   * und einmal für die Schattenkarte. Gemessen wurden 4.186.128 Dreiecke pro
   * Frame — deutlich über dem Budget von 3 M aus SPEC §4. Mit 768 sind es
   * 2 × 767² × 2 = 2.352.578, und das Budget hält.
   *
   * Die Heightmap hat 1,5 m pro Texel, das Gitter tastet sie also gröber ab
   * als sie vorliegt. Genau das löst P4 auf: LOD0 kommt mit 2 m pro Vertex
   * nah heran, ohne die ganze Welt dafür zu bezahlen.
   */
  gridVertices: 768,

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
