/**
 * Wasser — PLAN.md P2 / 2.4.
 *
 * Nur das Meer. Der Fluss läuft entlang eines Splines und wartet deshalb auf
 * das Spline-System aus P3.
 */

export const WATER = {
  /**
   * Kantenlänge der Wasserebene.
   *
   * Vier Weltbreiten. Die Kamera darf bis 3,5 km hoch, `CAMERA.far` reicht
   * 6 km weit — die Ebene muss über den sichtbaren Horizont hinausgehen, sonst
   * endet das Meer im Bild an einer geraden Kante.
   */
  extent: 12288,

  /**
   * Farbe des tiefen Wassers und der Flachzone.
   *
   * Beide bewusst dunkel: bei blauer Stunde ist Wasser fast ausschließlich
   * das, was es spiegelt. Eine hellere Grundfarbe überdeckt die Spiegelung und
   * lässt die Fläche wie lackiertes Plastik aussehen.
   */
  deepColor: 0x050d14,
  shallowColor: 0x0d2530,

  /** Tiefe in Metern, ab der die Tiefenfarbe voll durchschlägt. */
  depthFade: 5.5,

  /**
   * Rauheit. Nicht 0 — eine perfekt glatte Fläche spiegelt das Panorama
   * unverändert und wirkt wie ein Spiegel, nicht wie Wasser. Der Rest der
   * Unruhe kommt aus den Wellennormalen.
   */
  roughness: 0.075,

  /**
   * Wellen: drei Lagen mit unterschiedlicher Richtung, Wellenlänge und
   * Geschwindigkeit. Gegenläufig, damit kein wanderndes Streifenmuster entsteht.
   *
   * `steepness` ist die Neigung der Normale, nicht eine Auslenkung — die
   * Geometrie bleibt flach. Bei 3 km Sichtweite und einer Kamera, die meist
   * hoch steht, wäre echte Verschiebung verschenkte Vertex-Last.
   */
  waves: {
    /** Wellenlänge in Metern je Lage. */
    lengths: [37, 13, 4.6],
    /** Neigung je Lage. */
    steepness: [0.07, 0.052, 0.032],
    /** Richtung je Lage in Grad, von Norden im Uhrzeigersinn. */
    directions: [118, 74, 152],
    /** Geschwindigkeit in Metern pro Sekunde. */
    speeds: [1.15, 0.78, 0.42],
  },

  /**
   * Schaumsaum am Ufer.
   *
   * `depth` ist die Wassertiefe, bis zu der Schaum auftritt, `width` die
   * Weichheit des Übergangs. Ohne diesen Saum schneidet die Wasserebene hart
   * ins Gelände — die auffälligste Bildstörung, die eine Küste haben kann.
   */
  foam: {
    depth: 0.9,
    width: 0.9,
    intensity: 0.65,
    /** Die Wellen lassen den Saum atmen, statt ihn als Konturlinie stehen zu lassen. */
    waveInfluence: 1.2,
  },

  /**
   * Transparenz am Ufer. Bis zu dieser Tiefe blendet die Wasserfläche auf.
   *
   * Der Wert ist klein: nur die letzten Zentimeter sollen durchsichtig sein.
   * Ein weiter Verlauf sähe aus wie ein Filter über dem Strand.
   */
  edgeFade: 0.8,
} as const;

// ── Bekannte Grenze der Küstenlinie in P2 ───────────────────────────────────
//
// Schaumsaum und Transparenzverlauf werden aus der Heightmap gerechnet und sind
// dort stetig — die *sichtbare* Schnittkante folgt aber der Triangulierung des
// Terrain-Gitters, und das hat bei 768 Stützstellen 4 m pro Quad. Auf einem
// Strand mit 9 % Gefälle streckt sich ein einziges Quad über zig Meter
// Uferlinie, und die Grenze zerfällt in achsenparallele Stufen.
//
// Gemessen: mit 1536 Stützstellen (2 m pro Quad) halbiert sich die Stufenbreite
// sichtbar. Es ist also keine Frage des Shaders, sondern der Geometriedichte —
// die löst der LOD-Quadtree aus P4, der nahe der Kamera feiner auflöst. Bis
// dahin stimmt der Verlauf, die Kante darunter nicht.
