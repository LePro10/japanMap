// Gemeinsame Deklarationen des Imposter-Materials — PLAN.md P4 / 4.4.
//
// Wird in Vertex- **und** Fragment-Shader eingesetzt. Die Varyings stehen
// deshalb nur hier, nicht in beiden Einsatzstücken: eine Varying-Liste, die an
// zwei Stellen gepflegt werden muss, läuft irgendwann auseinander, und der
// Übersetzungsfehler nennt dann eine Zeile im generierten Shader.

uniform sampler2D uImposterAlbedo;
uniform sampler2D uImposterNormal;
/** Ansichten pro Achse im Atlas. */
uniform float uImposterTiles;
/** Kantenlänge des Atlas in Pixeln — für die Randeinrückung. */
uniform float uImposterAtlasPixels;
uniform float uImposterAlphaTest;
/**
 * x = Kantenlänge des Quads in Metern beim Maßstab 1, y = seine Unterkante über
 * dem Instanzursprung.
 *
 * Das Quad ist **quadratisch** und um die Modellmitte zentriert, weil der
 * Aufnahmerahmen des Bakers das ist (ImposterAtlas.frameHalf). Die Unterkante
 * liegt deshalb ein paar Zentimeter unter dem Boden — bei einem breiten, flachen
 * Busch entsprechend mehr. Vom Terrain verdeckt fällt das nicht auf; ein
 * Quad von Fuß bis Krone dagegen streckte das Bild und machte den Stufenwechsel
 * als Sprung sichtbar.
 */
uniform vec2 uImposterSize;
/** Modellhöhe in Metern beim Maßstab 1 — für die Verdeckung am Fuß. */
uniform float uImposterHeight;

/** Position im Quad: (0,0) unten links, (1,1) oben rechts. */
varying vec2 vImposterQuad;
varying vec3 vImposterWorld;
/** Blickrichtung im Modellraum der Instanz. */
varying vec3 vImposterLocalView;
/** x = cos, y = sin der Y-Drehung dieser Instanz. */
varying vec2 vImposterRot;
/** Farbwurf dieser Instanz — dieselbe Rechnung wie im Mesh-Material. */
varying float vImposterTint;
/**
 * Höhe über dem Boden, auf die Modellhöhe normiert und quadriert.
 *
 * Deckungsgleich mit `aWind` im Mesh — deshalb quadriert und nicht linear.
 * Ohne diese Gleichheit hätte der Stufenwechsel bei 180 m einen Sprung am
 * Stammfuß, also genau dort, wo die Verdeckung am stärksten ist.
 */
varying float vImposterBase;

/** Weltnormale aus dem Atlas, gesetzt in imposter.frag.glsl. */
vec3 gImposterNormal;

/**
 * Zelle (ganzzahlig) plus Position im Quad → UV im Atlas.
 *
 * Der Rand jeder Zelle wird um einen halben Texel eingerückt. Ohne das zieht die
 * bilineare Filterung die Nachbarzelle über die Kante — bei 128er Zellen ist das
 * ein ein Pixel breiter Streifen eines fremden Baums an jedem Rand, und der
 * fällt als Flimmern auf, sobald sich die Kamera bewegt.
 */
vec2 imposterTileUv(vec2 cell, vec2 quad) {
  vec2 clamped = clamp(cell, vec2(0.0), vec2(uImposterTiles - 1.0));
  float tilePixels = uImposterAtlasPixels / uImposterTiles;
  vec2 inset = mix(vec2(0.5), vec2(tilePixels - 0.5), quad) / tilePixels;
  return (clamped + inset) / uImposterTiles;
}
