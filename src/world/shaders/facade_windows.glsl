// Fensterraster einer Fassade — PLAN.md P6 / 6.2.
//
// Eingang ist `vFacadeUv`: **eine Einheit ist genau ein Fenster**. Der
// Generator hat das Raster beim Bauen auf die tatsächliche Wandlänge gerundet
// (siehe `wall()` in CityGenerator.ts), deshalb kommt hier keine
// Rastermathematik mehr vor — nur `floor` für die Fensternummer und `fract`
// für die Lage darin. Ohne diese Vorarbeit stünde an jeder Gebäudeecke ein
// angeschnittenes Fenster, und das ist der Fehler, den man an einer
// prozeduralen Stadt zuerst sieht.
//
// v = 0 ist der Gebäudesockel, v ∈ [0,1] also immer das Erdgeschoss —
// unabhängig davon, in welchem Rücksprung die Wand steht.

float facadeHash(vec2 cell, float seed) {
  // Zwei Primzahlen und ein Sinus. Die Zahlen sind beliebig, aber fest: was
  // hier zählt, ist allein, dass benachbarte Fenster unkorrelierte Werte
  // bekommen — ein Verlauf über die Fassade sähe aus wie ein Farbverlauf, nicht
  // wie bewohnte Wohnungen.
  vec3 p = vec3(cell, seed * 71.7);
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

/**
 * Ergebnis der Fensterauswertung.
 *   x = Fenstermaske (1 = Glas, 0 = Wand)
 *   y = Leuchtstärke, bereits mit der Maske multipliziert
 *   z = Rahmenmaske (dunkler Sturz und Brüstungsband)
 */
vec3 facadeWindows(vec2 uv, float seed, float time) {
  vec2 cell = fract(uv);
  vec2 id = floor(uv);

  // Kantenweite in UV, damit die Fensterkante nicht aliast. `fwidth` ist hier
  // exakt richtig: eine Fassade aus 400 m Entfernung deckt ein Fenster mit
  // weniger als einem Pixel ab, und ohne die Verbreiterung flimmert genau dann
  // das ganze Haus.
  vec2 soften = max(fwidth(uv), vec2(1e-4)) * 1.2;

  bool ground = uv.y < 1.0;

  // Erdgeschoss ist Ladenfront: ein breites Band Glas statt einzelner Fenster.
  vec2 lo = ground ? vec2(0.06, 0.16) : vec2(0.19, 0.24);
  vec2 hi = ground ? vec2(0.94, 0.86) : vec2(0.81, 0.78);

  vec2 low = smoothstep(lo - soften, lo + soften, cell);
  vec2 high = 1.0 - smoothstep(hi - soften, hi + soften, cell);
  float glass = low.x * low.y * high.x * high.y;

  // Sturz- und Brüstungsband: ein schmaler dunkler Streifen ober- und unterhalb
  // des Fensters. Er kostet nichts und ist der Unterschied zwischen „Loch in
  // der Wand" und „Fenster".
  float bandLo = smoothstep(lo.y - 0.06 - soften.y, lo.y - 0.06 + soften.y, cell.y);
  float bandHi = 1.0 - smoothstep(hi.y + 0.06 - soften.y, hi.y + 0.06 + soften.y, cell.y);
  float frame = clamp(bandLo * bandHi - glass, 0.0, 1.0);

  float h = facadeHash(id, seed);

  // Anteil beleuchteter Fenster. Das Erdgeschoss ist fast durchgehend hell —
  // Läden haben abends Licht, Wohnungen nicht.
  float threshold = ground ? 0.12 : uWindowLitFraction;
  float lit = step(threshold, h);

  // Zwei Störungen auf der Helligkeit, beide billig und beide nötig:
  //  * `variance` gibt jedem Fenster eine eigene Grundhelligkeit. Ohne sie
  //    leuchten alle gleich stark, und die Fassade wird zum Lochblech.
  //  * `flicker` bewegt einen kleinen Teil der Fenster langsam — Fernseher,
  //    Leuchtstoffröhren. Nur wo `h` in einem schmalen Band liegt, sonst
  //    zappelte die ganze Stadt.
  float variance = 0.55 + 0.45 * facadeHash(id + 17.0, seed);
  float flickerPick = step(0.93, facadeHash(id + 41.0, seed));
  float flicker = mix(
    1.0,
    0.45 + 0.55 * abs(sin(time * (1.7 + 3.0 * h) + h * 31.0)),
    flickerPick
  );

  float emissive = lit * variance * flicker * (ground ? 1.35 : 1.0);
  return vec3(glass, emissive * glass, frame);
}

/**
 * Farbe eines beleuchteten Fensters.
 *
 * Drei Familien, weil eine Fassade mit einer einzigen Lichtfarbe wie ein
 * Bildschirm aussieht: warmes Glühlicht (Wohnung), kaltes Leuchtstofflicht
 * (Büro, Laden), und ein blasses Blau für die Fernseher. Die Mischung wird über
 * denselben Hash gezogen, damit sie zum An/Aus-Muster passt und nicht darüber
 * flimmert.
 */
vec3 facadeWindowColor(vec2 uv, float seed) {
  float pick = facadeHash(floor(uv) + 91.0, seed);
  vec3 warm = vec3(1.0, 0.72, 0.42);
  vec3 cool = vec3(0.78, 0.86, 1.0);
  vec3 tv = vec3(0.42, 0.62, 1.0);
  vec3 base = mix(warm, cool, smoothstep(0.45, 0.75, pick));
  return mix(base, tv, smoothstep(0.9, 0.98, pick));
}
