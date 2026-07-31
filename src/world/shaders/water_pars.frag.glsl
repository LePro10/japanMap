// Wasser — PLAN.md P2 / 2.4.
//
// **Die Wassertiefe kommt aus der Heightmap, nicht aus dem Tiefenpuffer.**
//
// Der Plan sah „Szenentiefe gegen Wassertiefe" vor — der übliche Weg, weil man
// sonst keine Ahnung hat, wo der Grund liegt. Hier ist die Lage anders: die
// Heightmap steht ohnehin als Textur auf der GPU, und `terrainSurface()` liefert
// exakt dieselbe Höhe, die auch das Terrain-Gitter rendert. Das ist der
// Tiefentextur überlegen:
//
//   · keine Kopie des Tiefenpuffers, kein zusätzlicher Pass
//   · exakt statt aus einer nichtlinearen Tiefe zurückgerechnet
//   · funktioniert auch dort, wo der Grund gar nicht gerendert wurde
//
// Der Preis: nur das *Gelände* verdrängt Wasser. Ein Steg oder ein Boot bekäme
// keinen Schaumsaum. Solange nichts im Wasser steht, kostet das nichts — und
// wenn in P6 etwas hineingestellt wird, kommt der Tiefenpuffer dazu.

uniform vec3 uWaterDeepColor;
uniform vec3 uWaterShallowColor;
uniform float uWaterDepthFade;
uniform float uWaterRoughness;
uniform float uWaterEdgeFade;
/** x = Tiefe, y = Breite, z = Stärke, w = Wellenanteil des Schaumsaums. */
uniform vec4 uWaterFoam;
/** Je Lage: xy = Einheitsrichtung, z = Wellenzahl (rad/m), w = Kreisfrequenz. */
uniform vec4 uWaterWaves[3];
/** Neigung je Lage. */
uniform vec3 uWaterSteepness;

/** 0 = Meer, 1 = Fluss. Siehe water_surface.frag.glsl. */
uniform float uWaterRiver;

varying vec3 vWaterWorld;
varying vec3 vWaterSurfaceN;

vec3 gWaterNormal;
float gWaterRoughness;
vec2 gWaterShade;

/**
 * Wellennormale aus einer Summe gerichteter Sinuswellen.
 *
 * Die Ableitung wird analytisch gebildet, nicht per Differenzenquotient: für
 * `a·sin(k·x + ωt)` ist der Gradient `a·k·cos(k·x + ωt)`. Das kostet drei
 * Kosinus statt neun Abtastungen und bleibt bei jeder Entfernung stabil.
 *
 * **`fade` ist der wichtigste Parameter, nicht die Amplitude.** Der erste
 * Versuch ließ die längste Lage ungedämpft stehen — mit dem Ergebnis, dass das
 * Meer in ein bis zwei Kilometern Entfernung wie Wellblech aussah: harte
 * diagonale Streifen über die ganze Fläche. Der Grund ist derselbe wie bei den
 * Detail-Normalen des Geländes in P1: bei 2,2° Sonnenstand wird aus jeder
 * Normalen-Störung ein harter Hell-Dunkel-Sprung, und sobald eine Wellenlänge
 * unter wenige Pixel fällt, bleibt davon nur ein Moiré übrig.
 *
 * Physikalisch ist das Ausblenden zudem das Richtige: entferntes Wasser *ist*
 * ein Spiegel. Was die Wellen dort machen, ist keine sichtbare Struktur mehr,
 * sondern Streuung — und die kommt über die Rauheit dazu, nicht über die
 * Normale. Jede Lage bekommt deshalb ihren eigenen Bereich, proportional zu
 * ihrer Wellenlänge.
 */
vec3 waterNormal(vec2 position, float time, vec3 fade) {
  // Domänenverzerrung in zwei Maßstäben. Drei reine Sinuslagen ergeben ein
  // regelmäßiges Gitter, das das Auge sofort als Muster liest — auf dem ersten
  // Bild sah das Wasser aus wie eine Schuppentapete. Zwei Maßstäbe sind nötig,
  // weil eine einzelne langsame Verzerrung nahe der Kamera praktisch konstant
  // ist und dort gar nichts aufbricht.
  vec2 warped = position
    + vec2(
        sin(position.y * 0.013 + time * 0.11),
        cos(position.x * 0.011 - time * 0.09)
      ) * 7.0
    + vec2(
        sin(position.y * 0.087 - time * 0.23),
        cos(position.x * 0.079 + time * 0.19)
      ) * 1.6;

  vec2 gradient = vec2(0.0);

  for (int i = 0; i < 3; i++) {
    float amplitude = uWaterSteepness[i] * fade[i];
    if (amplitude < 1e-4) continue;

    vec4 wave = uWaterWaves[i];
    float phase = dot(wave.xy, warped) * wave.z + time * wave.w;
    gradient += wave.xy * (amplitude * cos(phase));
  }

  return normalize(vec3(-gradient.x, 1.0, -gradient.y));
}

/**
 * Auslenkung der Wellen in Metern.
 *
 * Wird **nicht** auf die Geometrie gelegt — die Ebene bleibt flach. Gebraucht
 * wird der Wert für den Schaumsaum: Schaum steht dort, wo die Wellenoberfläche
 * den Strand trifft, und diese Linie wandert mit dem Seegang.
 *
 * Der erste Versuch nahm dafür die Normale. Das war zu wenig: ihre Komponenten
 * liegen bei wenigen Hundertsteln, was die Schaumgrenze um Zentimeter
 * verschob — auf einem Strand mit 9 % Gefälle unsichtbar. Übrig blieb eine
 * Grenze, die stur der 1,5-m-Heightmap folgte und dadurch in Blöcke zerfiel.
 * Die Auslenkung liegt dagegen im Bereich eines halben Meters und verschiebt
 * die Linie um mehrere Meter.
 *
 * Amplitude aus Neigung und Wellenzahl: für a·sin(k·x) ist die maximale
 * Neigung a·k, also a = Neigung / k.
 */
float waterWaveHeight(vec2 position, float time, vec3 fade) {
  float height = 0.0;

  for (int i = 0; i < 3; i++) {
    vec4 wave = uWaterWaves[i];
    float amplitude = uWaterSteepness[i] * fade[i] / max(wave.z, 1e-4);
    height += amplitude * sin(dot(wave.xy, position) * wave.z + time * wave.w);
  }

  return height;
}
