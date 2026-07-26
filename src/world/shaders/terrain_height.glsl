// Höhenabfrage aus der gebackenen Heightmap — PLAN.md P1 / 1.3.
//
// Bewusst **ohne Varying** und ohne Stufenbezug: derselbe Block läuft im
// Vertex-Shader des Terrains (dort verschiebt er die Geometrie) und im
// Fragment-Shader des Wassers (dort liefert er die Wassertiefe unter jedem
// Pixel). Deshalb steht hier nur, was beide brauchen.
//
// Die Heightmap ist eine **Integer-Textur** (R16UI), keine normalisierte.
// PLAN.md nannte ursprünglich RedFormat/UnsignedShortType, aber three bildet
// diese Kombination auf das Format R16 ab, und das gibt es in WebGL2 nur mit
// der Erweiterung EXT_texture_norm16. Ohne sie entsteht eine ungültige
// Format-Kombination — schwarze Textur statt Fehlermeldung. R16UI ist
// Kernbestand von WebGL2, braucht keine Erweiterung und liefert die exakten
// 16-bit-Werte; damit ist zugleich das Risiko "Treiber interpoliert
// UnsignedShort ungenau" gegenstandslos, weil gar nicht die Hardware
// interpoliert, sondern der Code unten.

uniform highp usampler2D uHeightmap;
uniform float uHeightRes;
uniform float uSpacing;
/** x = Kantenlänge der Welt, y = halbe Kantenlänge. */
uniform vec2 uWorldSize;
/** x = minHeight in Metern, y = Höhenbereich / 65535. */
uniform vec2 uHeightDecode;
uniform float uHeightScale;

float terrainTexel(ivec2 coord) {
  ivec2 c = clamp(coord, ivec2(0), ivec2(int(uHeightRes) - 1));
  return float(texelFetch(uHeightmap, c, 0).r);
}

/**
 * Höhe in Metern an einer Weltposition.
 *
 * Bilinear von Hand, nicht per Texturfilter. Zwei Gründe: Integer-Texturen
 * lassen sich in WebGL2 gar nicht filtern, und der TerrainSampler auf der CPU
 * rechnet genau dieselben vier Zeilen. Nur so liegen gerenderte Oberfläche und
 * `getHeightAt()` exakt aufeinander — sonst schwebt oder versinkt alles, was
 * später auf dem Boden platziert wird.
 *
 * Texel 0 liegt auf -half, Texel (res-1) auf +half (siehe world.config.ts).
 */
float terrainHeight(vec2 worldXZ) {
  vec2 g = clamp((worldXZ + uWorldSize.y) / uSpacing, vec2(0.0), vec2(uHeightRes - 1.0));
  ivec2 i = ivec2(floor(g));
  vec2 f = g - vec2(i);

  float h00 = terrainTexel(i);
  float h10 = terrainTexel(i + ivec2(1, 0));
  float h01 = terrainTexel(i + ivec2(0, 1));
  float h11 = terrainTexel(i + ivec2(1, 1));

  float raw = mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
  return uHeightDecode.x + raw * uHeightDecode.y;
}

/** Höhe inklusive der Debug-Skalierung — das ist die tatsächlich gerenderte Oberfläche. */
float terrainSurface(vec2 worldXZ) {
  return terrainHeight(worldXZ) * uHeightScale;
}
