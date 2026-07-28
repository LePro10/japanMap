// Streulicht durch Blätter — Polish nach P4.
//
// Steht in einer eigenen Datei, weil **zwei** Materialien ihn brauchen: Mesh und
// Imposter. Liefe die Rechnung getrennt, wäre der Stufenwechsel ein
// Helligkeitssprung im Gegenlicht — also genau dort, wo er am meisten auffällt.
// Dieselbe Begründung wie beim Farbwurf in vegetation_tint.glsl.
//
// **Warum das bei dieser Beleuchtung kein Zierrat ist.** Die Sonne steht 2,2°
// über dem Horizont (SPEC §3.1). Alles, was man von der Ebene aus ansieht, hat
// sie fast waagerecht dahinter, und ein Blatt ist einen Zehntelmillimeter dick.
// Ohne diesen Anteil ist jeder Baum im Gegenlicht eine schwarze Silhouette —
// physikalisch nicht falsch für ein undurchsichtiges Material, aber Laub *ist*
// nicht undurchsichtig, und der Unterschied ist der zwischen Baum und
// Pappaufsteller.
//
// Zwei Terme, beide billig und beide ohne zusätzliche Textur:
//
//   *Rückstreuung* — eine schmale Keule in Richtung Sonne. Sie leuchtet auf,
//   wenn die Kamera in die Sonne schaut und das Blatt dazwischen steht.
//
//   *Umschlingung* — die abgewandte Seite fällt nicht auf null, sondern behält
//   einen Rest. Das ist die Näherung für Licht, das seitlich durch die
//   Blattfläche wandert; ein echtes Modell bräuchte Dicke und Streukoeffizient,
//   und keines von beiden würde man in diesem Bild sehen.

/**
 * @param albedo     Grundfarbe des Fragments.
 * @param normal     Normale im **Sichtraum**.
 * @param viewDir    `normalize(vViewPosition)`, also die Richtung zum
 *                   Betrachter im Sichtraum.
 * @param sunDir     `directionalLights[0].direction`, Sichtraum.
 * @param sunColor   Farbe des Sonnenlichts.
 * @param amount     Regler 0…1.
 * @param shade      Gebackene Sonnenverschattung — im Bergschatten leuchtet auch
 *                   kein Blatt.
 *
 * **Das Vorzeichen der Blickrichtung ist gemessen, nicht hergeleitet.** Aus der
 * Konvention „`vViewPosition` zeigt zum Betrachter, `direction` zur Lichtquelle"
 * folgt, dass man `-viewDir` nehmen müsste, um „Blick in die Sonne" zu treffen.
 * Nachgemessen an einer Kamera, die exakt in die Sonnenrichtung schaut, liegt
 * aber `dot(+viewDir, sunDir)` bei ≈ 1 und `dot(-viewDir, sunDir)` bei ≈ −1.
 * Zwei Konventionen ergeben zusammen ein Vorzeichen, und welche der beiden hier
 * anders liegt als angenommen, ist für das Ergebnis gleichgültig — die Messung
 * entscheidet.
 */
vec3 vegetationTranslucency(
    vec3 albedo, vec3 normal, vec3 viewDir, vec3 sunDir, vec3 sunColor, float amount, float shade) {
  if (amount <= 0.0) return vec3(0.0);

  // **Der Kern ist die Umschlingung, nicht die Keule.** Der erste Entwurf hatte
  // es umgekehrt: `pow(dot, 3)` auf die Blickrichtung, multipliziert mit der
  // Umschlingung. Nachgemessen über 125 336 maskierte Vegetationspixel hob das
  // den Mittelwert um **0,03 %** — die Keule ist so schmal, dass sie nur ein paar
  // Dutzend Pixel um die Sonnenscheibe herum trifft (größte Einzelaufhellung
  // 63,7). Sichtbar wird der Effekt erst, wenn die abgewandte Seite grundsätzlich
  // etwas abbekommt und die Blickrichtung ihn nur *verstärkt*.
  float wrap = clamp(0.5 - 0.5 * dot(normal, sunDir), 0.0, 1.0);
  wrap *= wrap;

  float back = clamp(dot(viewDir, sunDir), 0.0, 1.0);

  return albedo * sunColor * (amount * wrap * (0.3 + 0.7 * back * back) * shade);
}
