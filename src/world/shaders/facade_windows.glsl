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

/**
 * Hash je Fenster — **ganzzahlig**, nicht über `fract(sin(…))`.
 *
 * > Hier stand der übliche Einzeiler `fract(sin(dot(p, k)) * 43758.5453)`. Er
 * > hat die Fassaden in ein dichtes Pixelrauschen verwandelt, und zwar mit
 * > einer Ursache, die man dem Code nicht ansieht:
 * >
 * > Der Startwert kommt als Vertex-Attribut und läuft als `varying` durch die
 * > Interpolation. An allen Ecken einer Wand steht **derselbe** Wert, das
 * > Ergebnis ist also mathematisch konstant — numerisch aber nicht: die
 * > perspektivisch korrekte Interpolation rechnet (a/w) / (1/w) und trifft
 * > damit je Pixel die letzten Bits unterschiedlich. Für sich genommen ist das
 * > ein Fehler in der siebten Stelle und völlig belanglos.
 * >
 * > `sin` bei großem Argument macht daraus einen Vollausschlag. Bei einem
 * > Argument um 3700 liegt die Auflösung von `float` bei 0,00024; mal 43758
 * > sind das über zehn ganze Einheiten, und `fract` davon ist eine gleichmäßig
 * > verteilte Zufallszahl. Aus einem Rundungsfehler wird so weißes Rauschen.
 * >
 * > Gefunden wurde es nicht durch Nachdenken, sondern durch eine
 * > Diagnose-Ausgabe: `fwidth` war nachweislich in Ordnung (1,0 in einem
 * > isolierten Test), der Detailanteil stand auf 1, die Fenstermaske war
 * > sauber — und der nackte Hash rauschte trotzdem. Erst dieses Bild hat die
 * > Frage beantwortet.
 *
 * Der Ersatz rechnet in `uint` und rührt mit Schiebe- und
 * Multiplikationsschritten (Variante von Chris Wellons' „lowbias32"). Ganze
 * Zahlen haben keine letzten Bits, die verrutschen können; der Startwert wird
 * dafür beim Eintritt auf eine ganze Zahl gerundet.
 */
uint facadeMix(uint x) {
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

float facadeHash(vec2 cell, float seed) {
  // +512: Zellindizes sind nie negativ, aber die Rundung soll auch dann
  // definiert sein, wenn eine Wand einmal bei einer negativen UV anfängt.
  uvec2 c = uvec2(ivec2(cell) + 512);
  uint s = uint(seed + 0.5);
  uint h = facadeMix(c.x * 73856093u ^ c.y * 19349663u ^ facadeMix(s) * 83492791u);
  return float(h & 0xffffffu) / 16777216.0;
}

/**
 * Ergebnis der Fensterauswertung.
 *   x = Fenstermaske (1 = Glas, 0 = Wand)
 *   y = Leuchtstärke, bereits mit der Maske multipliziert
 *   z = Rahmenmaske (dunkler Sturz und Brüstungsband)
 *   w = Detailanteil, 1 nah und 0 fern — siehe unten
 */
vec4 facadeWindows(vec2 uv, float seed, float time) {
  vec2 cell = fract(uv);
  vec2 id = floor(uv);

  // Kantenweite in UV, damit die Fensterkante nicht aliast. `fwidth` ist hier
  // exakt richtig: eine Fassade aus 400 m Entfernung deckt ein Fenster mit
  // weniger als einem Pixel ab, und ohne die Verbreiterung flimmert genau dann
  // das ganze Haus.
  vec2 soften = max(fwidth(uv), vec2(1e-4)) * 1.2;

  bool ground = uv.y < 1.0;

  // Erdgeschoss ist Ladenfront: ein breites Band Glas statt einzelner Fenster.
  //
  // > Die erste Fassung ging von 0,06 bis 0,94 in der Breite und 0,16 bis 0,86
  // > in der Höhe — 62 % Glas, dazu Leuchtstärke ×1,35. Aus zwei Metern
  // > Entfernung war die Ladenzeile eine geschlossene weiße Wand ohne Struktur.
  // > Eine Schaufensterfront hat einen Sockel, einen Sturz und Pfosten
  // > dazwischen; ohne die drei ist sie kein Schaufenster, sondern eine Lampe.
  vec2 lo = ground ? vec2(0.09, 0.21) : vec2(0.19, 0.24);
  vec2 hi = ground ? vec2(0.91, 0.73) : vec2(0.81, 0.78);

  vec2 low = smoothstep(lo - soften, lo + soften, cell);
  vec2 high = 1.0 - smoothstep(hi - soften, hi + soften, cell);
  float glass = low.x * low.y * high.x * high.y;

  // Pfosten in der Schaufensterfront. Drei Scheiben je Fensterachse: das ist
  // der Maßstab, an dem man im Erdgeschoss erkennt, wie groß ein Laden ist —
  // ohne sie ist die Front eine einzige Scheibe von beliebiger Breite.
  if (ground) {
    float pane = fract((cell.x - lo.x) / max(hi.x - lo.x, 1e-4) * 3.0);
    float toPost = min(pane, 1.0 - pane);
    glass *= smoothstep(0.035, 0.035 + max(soften.x * 3.0, 0.012), toPost);
  }

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
  float variance = 0.55 + 0.45 * facadeHash(id, seed + 17.0);
  float flickerPick = step(0.93, facadeHash(id, seed + 41.0));
  float flicker = mix(
    1.0,
    0.45 + 0.55 * abs(sin(time * (1.7 + 3.0 * h) + h * 31.0)),
    flickerPick
  );

  float emissive = lit * variance * flicker * (ground ? 0.9 : 1.0);

  /**
   * **Detailverlust statt Rauschen.**
   *
   * Sobald ein Fenster unter Pixelgröße fällt, liefert `facadeHash` für
   * benachbarte Pixel unkorrelierte Werte und `step()` macht daraus ein hartes
   * An/Aus — die Fassade rauscht. Gemessen an einem Nahblick auf eine
   * Ladenzeile war das der auffälligste Fehler im Bild, und er wandert mit der
   * Kamera, wird also beim Fahren zum Flimmern.
   *
   * `fwidth` sagt, wie viele UV-Einheiten ein Pixel abdeckt. Über 0,35 —
   * knapp drei Fenster je Pixel — wird auf den **Erwartungswert** überblendet:
   * der Anteil brennender Fenster mal ihre mittlere Helligkeit. Aus der Ferne
   * bleibt damit die richtige Gesamthelligkeit stehen, nur eben ohne Muster.
   * Das ist dieselbe Antwort, die P1 den Detail-Normalen des Geländes gegeben
   * hat: was unter die Pixelgröße fällt, gehört gemittelt und nicht abgetastet.
   */
  float pixelSpan = max(soften.x, soften.y);
  float detail = 1.0 - smoothstep(0.35, 0.9, pixelSpan);
  float expectedLit = 1.0 - threshold;
  float expectedArea = (hi.x - lo.x) * (hi.y - lo.y);
  emissive = mix(expectedLit * 0.775 * (ground ? 0.9 : 1.0), emissive, detail);
  glass = mix(expectedArea, glass, detail);
  frame *= detail;

  return vec4(glass, emissive * glass, frame, detail);
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
  float pick = facadeHash(floor(uv), seed + 91.0);
  vec3 warm = vec3(1.0, 0.72, 0.42);
  vec3 cool = vec3(0.78, 0.86, 1.0);
  vec3 tv = vec3(0.42, 0.62, 1.0);
  vec3 base = mix(warm, cool, smoothstep(0.45, 0.75, pick));
  return mix(base, tv, smoothstep(0.9, 0.98, pick));
}
