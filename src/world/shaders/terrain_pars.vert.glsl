// Vertex-Anteil des Terrain-Materials — PLAN.md P1 / 1.3.
//
// Die entscheidende Architekturentscheidung der Phase steckt darin, dass hier
// so wenig steht: Geometrie und Höhe sind entkoppelt. Das Gitter ist eine ebene
// Fläche, die Höhe kommt aus der Textur (terrain_height.glsl, direkt darüber
// eingesetzt). In P4 wird nur das Gitter gegen einen LOD-Quadtree getauscht —
// Material und Shader bleiben unverändert.
//
// Das Varying trägt die Weltposition in den Fragment-Shader. Dort hängt alles
// daran: Splat-Karten, Triplanar-Projektion, Verschattung und Nebel.

varying vec3 vTerrainWorld;
