// Vertex-Anteil des Terrain-Materials — PLAN.md P1 / 1.3, erweitert in P4 / 4.1.
//
// Die entscheidende Architekturentscheidung aus P1 steckt darin, dass hier so
// wenig steht: Geometrie und Höhe sind entkoppelt. Das Gitter ist eine ebene
// Fläche, die Höhe kommt aus der Textur (terrain_height.glsl, direkt darüber
// eingesetzt). P1 sagte voraus, in P4 werde „nur das Gitter gegen einen
// LOD-Quadtree getauscht — Material und Shader bleiben unverändert". Der erste
// Teil hat gehalten, der zweite nicht ganz: das Gitter ist jetzt ein Einheits-
// quadrat, das je Instanz an seinen Platz geschoben wird, und das Morphing
// braucht eine zweite Höhenabfrage. Material, Splat-Kette, Nebel und
// Verschattung sind aber tatsächlich unangetastet geblieben.

/** Kantenlänge des Einheitsgitters in Quads (33 Stützstellen → 32). */
uniform float uLodGridQuads;
/**
 * Kameraposition für die Morph-Entfernung.
 *
 * Bewusst **nicht** das eingebaute `cameraPosition`: das ist die Position der
 * gerade gerenderten Kamera, und beim Schattendurchlauf ist das die
 * Lichtkamera. Das Gelände würde dort anders gemorpht als im Bild, und der
 * Schatten läge um bis zu eine halbe Knotenbreite neben dem Berg, der ihn
 * wirft. Der ChunkManager setzt hier immer die Spielerkamera ein.
 */
uniform vec3 uLodCamera;

/** Nordwest-Ecke des Knotens in Weltkoordinaten. */
attribute vec2 aNodeOrigin;
/** Kantenlänge des Knotens in Metern. */
attribute float aNodeSize;
/** x = Entfernung, ab der gemorpht wird; y = 1 / Breite des Morph-Bereichs. */
attribute vec2 aNodeMorph;
/** LOD-Stufe, 0 ist die feinste. Nur für die Debug-Ansicht. */
attribute float aNodeLevel;

// Das Varying trägt die Weltposition in den Fragment-Shader. Dort hängt alles
// daran: Splat-Karten, Triplanar-Projektion, Verschattung und Nebel.
varying vec3 vTerrainWorld;
varying float vLodLevel;
varying float vLodMorph;
