// Terrain-Material: 4-Kanal-Splat-Blending mit triplanarem Mapping an
// Steilhängen — PLAN.md P1 / 1.4.
//
// Die Texturen liegen als **Array-Texturen** (sampler2DArray) vor, eine Ebene
// je Splat-Kanal. Vier einzelne Sampler-Sätze wären 12 Textureinheiten allein
// fürs Terrain; WebGL2 garantiert nur 16 im Fragment-Shader, und Envmap,
// Shadow-Map und Lightmaps brauchen davon auch welche. Mit Arrays sind es drei.

uniform sampler2D uZones;
uniform sampler2D uTerrainNormal;
uniform sampler2DArray uAlbedoArray;
uniform sampler2DArray uNormalArray;
uniform sampler2DArray uArmArray;

uniform vec2 uWorldSize;
/** Auflösung der gebackenen Karten: x = zones.png, y = normal.png. */
uniform vec2 uMapRes;
/** Kacheln pro Meter. */
uniform float uDetailTile;
uniform float uMacroTile;
uniform float uMacroStrength;
/** Kachelfaktor je Ebene, Reihenfolge wie TERRAIN_LAYERS. */
uniform vec4 uLayerScale;
/** Debug: Ebenen einzeln aus-/einblenden. */
uniform vec4 uLayerMask;
/** x = cos(Endwinkel), y = cos(Startwinkel) des Triplanar-Übergangs. */
uniform vec2 uTriplanar;
uniform float uDetailNormalStrength;
/** x = Beginn, y = Ende des Detail-Ausblendens in Metern. */
uniform vec2 uDetailFade;

// Bewuchsfarbe des Bodens (P11). `uGroundTint.x` ist die Gesamtstärke,
// `uGroundTint.y` der Anteil Helligkeitserhalt — Herleitung bei `GROUND_TINT`.
uniform vec3 uGroundTintColor;
uniform vec4 uGroundTintWeights;
uniform vec2 uGroundTint;

uniform int uDebugMode;

varying vec3 vTerrainWorld;
/** Aus dem Quadtree (P4 / 4.1) — nur für die Debug-Ansichten. */
varying float vLodLevel;
varying float vLodMorph;

// Zwischenergebnisse aus <map_fragment>, gebraucht in den späteren Chunks.
vec3 gTerrainArm;
/** Geländenormale mit Detail-Normalmap — für die Schattierung. */
vec3 gTerrainNormal;
/** Geländenormale ohne Detail — für Schatten-Bias und Geometriefragen. */
vec3 gTerrainGeoNormal;
vec4 gTerrainSplat;
/** Gebackene Verschattung: x = Sonnenanteil, y = Himmelssicht. Aus atmoShade(). */
vec2 gTerrainShade;

/**
 * Eine Ebene abtasten, wahlweise triplanar.
 *
 * Unter dem Schwellwert wird nur von oben projiziert: eine Textur-Abfrage
 * statt drei. Auf einem Gelände ist der weit überwiegende Teil des Bildes
 * flach genug dafür — der Zweig ist deshalb kein Mikro-Optimieren, sondern
 * spart auf dem Großteil der Pixel zwei Drittel der Abfragen.
 */
vec4 terrainSampleLayer(sampler2DArray tex, float layer, float scale, float triplanar, vec3 blend) {
  vec3 p = vTerrainWorld * scale;
  vec4 top = texture(tex, vec3(p.xz, layer));
  if (triplanar < 0.002) return top;

  vec4 sideX = texture(tex, vec3(p.zy, layer));
  vec4 sideZ = texture(tex, vec3(p.xy, layer));
  return mix(top, sideX * blend.x + sideZ * blend.z, triplanar);
}

/**
 * Detail-Normale auf die Geländenormale legen.
 *
 * Die Tangente wird aus der Welt-X-Achse gewonnen und gegen die Normale
 * orthogonalisiert. Steht die Normale fast parallel zu X — eine nach Osten
 * oder Westen zeigende Steilwand — wird stattdessen Z genommen, sonst wäre das
 * Kreuzprodukt entartet und die Wand bekäme wandernde Streifen.
 */
vec3 terrainPerturbNormal(vec3 n, vec3 tangentNormal, float strength) {
  vec3 reference = abs(n.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 t = normalize(reference - n * dot(reference, n));
  vec3 b = cross(n, t);
  vec3 m = normalize(vec3(tangentNormal.xy * strength, tangentNormal.z));
  return normalize(t * m.x + b * m.y + n * m.z);
}

vec3 terrainDebugColor() {
  if (uDebugMode == 1) {
    return gTerrainSplat.r * vec3(0.95, 0.30, 0.25) +
           gTerrainSplat.g * vec3(0.30, 0.85, 0.35) +
           gTerrainSplat.b * vec3(0.95, 0.85, 0.45) +
           gTerrainSplat.a * vec3(0.35, 0.55, 0.95);
  }
  if (uDebugMode == 2) {
    return gTerrainNormal * 0.5 + 0.5;
  }
  if (uDebugMode == 4) {
    // Sonnenverschattung roh — ohne Material, ohne Nebel. Die Ansicht, in der
    // sich beurteilen lässt, ob die gebackene Karte zur Sonne passt.
    return vec3(gTerrainShade.x);
  }
  if (uDebugMode == 5) {
    return vec3(gTerrainShade.y);
  }
  if (uDebugMode == 6) {
    // LOD-Stufen. Zusammen mit dem Drahtgitter ist das die Ansicht, in der sich
    // der Quadtree überhaupt beurteilen lässt — PLAN.md nennt sie unter den
    // Risiken von P4 ausdrücklich: „Zuerst mit Wireframe und eingefärbten
    // LOD-Stufen entwickeln, nicht mit fertigem Material."
    float t = vLodLevel / 6.0;
    return vec3(
      clamp(1.5 - abs(t * 4.0 - 3.0), 0.0, 1.0),
      clamp(1.5 - abs(t * 4.0 - 2.0), 0.0, 1.0),
      clamp(1.5 - abs(t * 4.0 - 1.0), 0.0, 1.0)
    );
  }
  if (uDebugMode == 7) {
    // Morph-Faktor: schwarz = ungemorpht, weiß = vollständig auf die nächst-
    // gröbere Stufe zusammengezogen. Ein sichtbarer Sprung von Weiß auf
    // Schwarz über eine Knotengrenze hinweg ist genau der Riss, den 4.1
    // ausschließt.
    return vec3(vLodMorph);
  }
  // Neigung: flach = dunkelblau, senkrecht = rot.
  float slope = 1.0 - clamp(gTerrainNormal.y, 0.0, 1.0);
  return vec3(slope * 2.0, 1.0 - abs(slope * 2.0 - 1.0), 1.0 - slope * 2.0);
}
