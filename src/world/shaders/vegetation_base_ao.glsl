// Verdeckung am Fuß der Pflanze — die zweite Hälfte der Bodenverdeckung.
//
// Der Fleck auf dem Boden (GroundAoMaterial) kann die Pflanze selbst **nicht**
// erreichen: er liegt hinter ihr und fällt am Stamm durch den Tiefentest. Der
// Stamm bliebe damit bis zum Ansatz gleichmäßig hell, während der Boden um ihn
// herum dunkler wird — der Baum stünde dann in einer Pfütze aus Schatten statt
// darin zu verschwinden. Dasselbe gilt für Gräser und Büsche, die im
// Vordergrund den Boden ohnehin verdecken.
//
// Deshalb dieselbe Verdeckung noch einmal von innen, als Funktion der Höhe im
// Modell. Sie ist auch für sich richtig: der Fuß einer Pflanze sieht weniger
// Himmel als ihre Krone, ganz gleich, was um sie herum steht.
//
// Geteilt zwischen Mesh und Imposter, aus demselben Grund wie Wind und
// Streulicht — eine zweite Fassung liefe irgendwann auseinander, und der
// Stufenwechsel bei 180 m wäre dann ein Helligkeitssprung am Stammfuß.

uniform float uVegBaseAo;

/**
 * @param mask 0 an der Wurzel, 1 in der Krone — **quadratisch** angesetzt, also
 *             dasselbe `aWind` wie beim Wind bzw. dieselbe Rechnung im Imposter.
 */
float vegetationBaseAo(float mask) {
  // 0,16 als Auslaufpunkt: die Maske ist quadratisch, 0,16 entspricht damit
  // 40 % der Modellhöhe — darüber ist die Pflanze unverändert. Die Zahl ist
  // gesetzt, nicht gemessen; sie hält die Verdunkelung im unteren Drittel, wo
  // der Fleck auf dem Boden sie fortsetzt.
  float amount = clamp(uVegBaseAo * 0.45, 0.0, 0.9);
  return mix(1.0 - amount, 1.0, smoothstep(0.0, 0.16, mask));
}
