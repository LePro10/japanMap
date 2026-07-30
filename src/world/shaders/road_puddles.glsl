// Pfützen auf dem Asphalt — PLAN.md P6 / 6.4.
//
// Die Maske entsteht aus zwei Quellen, und beide sind nötig:
//
//  * **Vertex-Kanal R.** Ihn legt `RoadMeshBuilder` seit P3 an: hoch an den
//    Fahrbahnkanten und auf geraden Abschnitten, niedrig in Kurven. Das ist die
//    Aussage „hier sammelt sich Wasser" und sie kommt aus der Geometrie, die
//    der Generator kennt — im Shader wäre sie nicht rekonstruierbar.
//  * **Weltrauschen.** Ohne es zöge die Nässe ein gleichmäßiges Band längs der
//    Fahrbahn. Pfützen sind Flecken, keine Streifen.
//
// Das Rauschen läuft über **Weltkoordinaten**, nicht über die UV der Fahrbahn.
// Sonst liefe die Pfützenverteilung mit der Bogenlänge mit und in einer Kurve
// säßen die Pfützen enger als auf der Geraden. Der Stadtboden und die Straßen
// teilen sich dadurch außerdem dasselbe Muster: an der Bordsteinkante geht die
// eine Fläche in die andere über, ohne dass die Nässe springt.

float puddleHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

/** Wertrauschen mit weicher Interpolation — eine Oktave. */
float puddleNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = puddleHash(i);
  float b = puddleHash(i + vec2(1.0, 0.0));
  float c = puddleHash(i + vec2(0.0, 1.0));
  float d = puddleHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/**
 * Pfützenmaske, 0 = trocken, 1 = Wasserfläche.
 *
 * `bias` ist der Vertex-Kanal, `amount` der Regler aus dem Look-Zustand.
 *
 * Der Übergang ist **eine Zone, keine Kante**: PLAN.md 6.4 verlangt das
 * ausdrücklich, und der Grund ist optisch. Eine harte Pfützengrenze sieht wie
 * ein Aufkleber aus; in Wirklichkeit läuft das Wasser an seinem Rand dünn aus,
 * der Asphalt ist dort nass, aber nicht spiegelnd. Genau das leistet der
 * weiche Rand: die Rauheit fällt dort schon, bevor die Fläche zur Pfütze wird.
 */
float roadPuddleMask(vec2 world, float bias, float amount, float edge) {
  // Zwei Skalen: ~17 m Flecken und ~3 m Ränder. Eine einzelne Oktave ergibt
  // runde Kleckse, die man als Rauschen erkennt.
  float wide = puddleNoise(world * 0.06);
  float fine = puddleNoise(world * 0.31);
  float level = wide * 0.72 + fine * 0.28;

  // Wie viel Fläche unter Wasser steht, steuert die **Schwelle**, nicht die
  // Amplitude. Über die Amplitude gesteuert würden bei wenig Wasser alle
  // Pfützen blasser statt kleiner — nasser Asphalt hat aber keine halben
  // Pfützen, sondern weniger.
  float wet = clamp(amount * mix(0.35, 1.0, bias), 0.0, 1.0);
  float threshold = mix(0.92, 0.18, wet);
  return smoothstep(threshold, threshold + edge, level);
}
