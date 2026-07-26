/**
 * Weltparameter. Einzige Quelle der Wahrheit für Maße — Baker (tools/), Sampler
 * und Renderer lesen alle hier, damit sie nicht auseinanderlaufen können.
 *
 * Koordinatensystem (PLAN.md, Konventionen):
 *   Y-up, rechtshändig, 1 Unit = 1 Meter. Y = 0 ist Meeresspiegel. Norden ist -Z.
 */

const SIZE = 3072;
const HEIGHTMAP_RES = 2048;
const CHUNK_SIZE = 256;

export const WORLD = {
  /** Kantenlänge der Welt in Metern (quadratisch). */
  size: SIZE,
  /** X und Z laufen von -half bis +half. */
  half: SIZE / 2,

  seaLevel: 0,
  /** Höchster Punkt (Gipfel im Nordwesten). */
  maxHeight: 450,
  /** Tiefster Punkt (Meeresboden vor der Südküste). */
  minHeight: -40,

  /** Kantenlänge eines Terrain-Chunks in Metern. */
  chunkSize: CHUNK_SIZE,
  /** Chunks pro Achse — 12 × 12 = 144. */
  chunksPerAxis: SIZE / CHUNK_SIZE,

  /** Auflösung der gebackenen Heightmap in Texeln pro Achse. */
  heightmapRes: HEIGHTMAP_RES,
  /**
   * Metrischer Abstand zweier Heightmap-Stützstellen — ≈1,5 m.
   *
   * Bewusst `size / (res - 1)` und nicht `size / res`: die Heightmap ist ein
   * **Gitter von Stützstellen**, dessen äußerste Reihe genau auf der Weltkante
   * liegt. Texel 0 sitzt auf −1536 m, Texel 2047 auf +1536 m. Nur so decken
   * CPU-Sampler und Vertex-Shader mit bilinearer Interpolation exakt denselben
   * Bereich ab; bei `size / res` fehlte am Rand ein halbes Texel und das
   * Terrain bekäme dort eine Naht.
   *
   * tools/bake-terrain.mjs rechnet identisch und schreibt den Wert zur
   * Kontrolle nach meta.json.
   */
  metersPerTexel: SIZE / (HEIGHTMAP_RES - 1),
} as const;

/** Gesamter Höhenbereich in Metern. Skalierungsfaktor für 16-bit-Höhenwerte. */
export const WORLD_HEIGHT_RANGE = WORLD.maxHeight - WORLD.minHeight;

export const CAMERA = {
  fov: 60,
  /**
   * near/far spannen 12 000 : 1. Das ist für einen 24-bit-Tiefenpuffer in
   * Ordnung; darunter (near = 0.1) fängt bei 2 km Sichtweite das Z-Fighting an.
   * Falls Props je näher als 50 cm an die Kamera kommen: hier nachziehen,
   * nicht am logarithmischen Tiefenpuffer (der bricht mehrere PostFX-Effekte).
   */
  near: 0.5,
  far: 6000,
} as const;

export const RENDER = {
  /** Über 2 wird Supersampling sinnlos teuer, ohne sichtbar besser zu werden. */
  maxPixelRatio: 2,
} as const;
