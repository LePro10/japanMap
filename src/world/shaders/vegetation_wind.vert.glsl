// Wind — PLAN.md P4 / 4.5.
//
// Zwei Frequenzen, wie im Plan gefordert, und der Grund dafür ist gestalterisch:
// eine einzelne Sinusschwingung liest sich als *Metronom*, sobald mehr als drei
// Bäume im Bild stehen. Erst die Überlagerung einer langsamen Böe mit einem
// schnellen Zittern wirkt wie Wind.
//
//   1. **Böe** — lange Wellenlänge (30 m), niedrige Frequenz. Wandert als ebene
//      Welle über die Karte, damit ganze Hänge gemeinsam nachgeben statt jeder
//      Baum für sich. Das ist der Anteil, den man aus der Ferne sieht.
//   2. **Zittern** — kurze Wellenlänge, hohe Frequenz, phasenverschoben je
//      Instanz. Der Anteil, den man aus der Nähe sieht.
//
// Ausgelenkt wird **quer zur Windrichtung mitschwingend**, aber ohne die
// Vertikale anzufassen: ein Baum, der sich biegt, wird oben minimal niedriger.
// Diese Verkürzung wegzulassen ist ein bewusster Fehler zugunsten von zwei
// gesparten Rechnungen je Vertex — bei 0,55 m Amplitude auf 5,4 m Höhe beträgt
// sie 2,8 cm.
//
// `aWind` ist die Amplitudenmaske aus vegetationMeshes.ts: null an der Wurzel,
// eins in der Krone, quadratisch dazwischen.

uniform vec2 uWindDirection;
/** Globaler Regler, gilt für alle Arten. */
uniform float uWindStrength;
uniform float uWindTime;
/**
 * Ausschlag dieser Art in Metern bei voller Höhe.
 *
 * Je Material, nicht global: ein Grasbüschel und eine Fichte im gleichen Maß zu
 * bewegen sieht bei einem von beiden falsch aus. 0,16 m am Halm sind viel, 0,16 m
 * an einer 8 m hohen Fichte sind nichts.
 */
uniform float uWindAmplitude;

attribute float aWind;

vec3 vegetationWind(vec3 local, vec3 worldOrigin) {
  float mask = aWind;
  if (mask <= 0.0) return local;

  // Phase aus der Weltposition des **Instanzursprungs**, nicht des Vertex:
  // sonst verschöben sich die Vertices eines Baums gegeneinander und er
  // zerknautschte, statt sich zu biegen.
  float along = dot(worldOrigin.xz, uWindDirection);
  float gust = sin(along * 0.033 - uWindTime * 0.55);
  float flutter = sin(along * 0.9 + uWindTime * 3.1 + worldOrigin.y * 0.7);

  float amount = (gust * 0.75 + flutter * 0.25) * uWindStrength * uWindAmplitude * mask;
  return local + vec3(uWindDirection.x, 0.0, uWindDirection.y) * amount;
}
