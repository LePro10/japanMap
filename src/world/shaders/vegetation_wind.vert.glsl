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
// **Die Windrichtung kommt im Modellraum herein, nicht im Weltraum.** Der erste
// Entwurf addierte `vec3(uWindDirection.x, 0, uWindDirection.y)` direkt auf
// `transformed` — also *vor* der Instanzmatrix, deren Y-Drehung je Instanz
// zufällig ist. Jeder Baum wiegte sich damit in eine andere Richtung, und aus
// der geforderten kohärenten Böe wurde ein Zittern ohne Richtung. Der Aufrufer
// dreht die Richtung deshalb in den Modellraum, bevor er sie übergibt.
//
// Die **Maske** ist ebenfalls ein Parameter: das Mesh liefert sie als Attribut
// `aWind` (null an der Wurzel, eins in der Krone), das Imposter-Quad rechnet sie
// aus seiner eigenen Höhe. Eine zweite Fassung der Formel für den Imposter wäre
// genau die Doppelimplementierung, die sonst auseinanderläuft.

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

/**
 * @param local       Vertexposition im Modellraum.
 * @param worldOrigin Weltposition des Instanzursprungs — trägt die Phase.
 * @param dirLocal    Windrichtung in die XZ-Ebene des Modellraums gedreht.
 * @param mask        Amplitudenmaske, 0 am Fuß bis 1 an der Spitze.
 */
vec3 vegetationWind(vec3 local, vec3 worldOrigin, vec2 dirLocal, float mask) {
  if (mask <= 0.0) return local;

  // Phase aus der Weltposition des **Instanzursprungs**, nicht des Vertex:
  // sonst verschöben sich die Vertices eines Baums gegeneinander und er
  // zerknautschte, statt sich zu biegen.
  float along = dot(worldOrigin.xz, uWindDirection);
  float gust = sin(along * 0.033 - uWindTime * 0.55);
  float flutter = sin(along * 0.9 + uWindTime * 3.1 + worldOrigin.y * 0.7);

  float amount = (gust * 0.75 + flutter * 0.25) * uWindStrength * uWindAmplitude * mask;
  return local + vec3(dirLocal.x, 0.0, dirLocal.y) * amount;
}

/** Weltrichtung des Windes in den Modellraum der Instanz drehen. */
vec2 vegetationWindLocal(mat4 instance) {
  vec3 axisX = normalize(instance[0].xyz);
  vec3 axisZ = normalize(instance[2].xyz);
  vec3 world = vec3(uWindDirection.x, 0.0, uWindDirection.y);
  return vec2(dot(world, axisX), dot(world, axisZ));
}
