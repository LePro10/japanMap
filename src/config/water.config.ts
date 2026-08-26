/**
 * Wasser — PLAN.md P2 / 2.4 (Meer) und P8.6 (Fluss).
 *
 * ~~Nur das Meer. Der Fluss läuft entlang eines Splines und wartet deshalb auf
 * das Spline-System aus P3.~~ Der Fluss ist seit P8.6 da — und er brauchte das
 * Spline-System nie. Seine Trasse entsteht im Baker, indem sie dem Gefälle
 * folgt (`carveRiver`), und liegt als `river.json` neben der Heightmap.
 */

export const WATER = {
  /**
   * Kantenlänge der Wasserebene.
   *
   * Vier Weltbreiten. Die Kamera darf bis 3,5 km hoch, `CAMERA.far` reicht
   * 6 km weit — die Ebene muss über den sichtbaren Horizont hinausgehen, sonst
   * endet das Meer im Bild an einer geraden Kante.
   */
  extent: 12288,

  /**
   * Ausblenden zum Himmel am Horizont — P8.10.
   *
   * **Die Begründung über `extent` war richtig und trotzdem nicht genug.** Die
   * Ebene ist mit 12 288 m viermal so breit wie die Welt und reicht weit über
   * `CAMERA.far` (6000 m) hinaus; ihr eigener Rand ist also nie im Bild. Vom
   * Blickpunkt `start` stand am Horizont trotzdem eine schnurgerade Linie —
   * nicht der Rand der Ebene, sondern ihr **Schnitt an der fernen
   * Clipping-Ebene**.
   *
   * Gerechnet: der Distanznebel hat `density` 0,00021 je Meter, also bleibt auf
   * 6000 m eine Deckung von 1 − e^(−1,26) = **0,716**. Ein knappes Drittel der
   * Meeresfarbe steht dort noch gegen den Himmel, und weil die Schnittkante
   * schnurgerade ist, liest sie sich als Weltrand.
   *
   * Am Nebel selbst zu drehen wäre falsch gewesen: `FOG.maxOpacity` = 0,94
   * existiert ausdrücklich, damit die Kammlinie der Berge lesbar bleibt, und
   * die nötige Dichte (4,7 · 10⁻⁴) hätte das Massiv auf 2 km mitverschluckt.
   *
   * Das Wasser bekommt deshalb ein **eigenes** Ausblenden: ab `start` mischt es
   * zur Himmelsfarbe in Blickrichtung, ab `ende` ist es ununterscheidbar. Am
   * leeren Meer gibt es keine Silhouette zu erhalten — der Grund für die
   * Kappung trifft hier nicht zu. `ende` liegt unter `CAMERA.far`, damit die
   * Mischung **vor** dem Schnitt fertig ist.
   */
  horizonFade: { start: 3200, ende: 5600 },

  /**
   * Farbe des tiefen Wassers und der Flachzone.
   *
   * Beide bewusst dunkel: bei blauer Stunde ist Wasser fast ausschließlich
   * das, was es spiegelt. Eine hellere Grundfarbe überdeckt die Spiegelung und
   * lässt die Fläche wie lackiertes Plastik aussehen.
   */
  deepColor: 0x050d14,
  shallowColor: 0x0d2530,

  /** Tiefe in Metern, ab der die Tiefenfarbe voll durchschlägt. */
  depthFade: 5.5,

  /**
   * Rauheit. Nicht 0 — eine perfekt glatte Fläche spiegelt das Panorama
   * unverändert und wirkt wie ein Spiegel, nicht wie Wasser. Der Rest der
   * Unruhe kommt aus den Wellennormalen.
   */
  roughness: 0.075,

  /**
   * Wellen: drei Lagen mit unterschiedlicher Richtung, Wellenlänge und
   * Geschwindigkeit. Gegenläufig, damit kein wanderndes Streifenmuster entsteht.
   *
   * `steepness` ist die Neigung der Normale, nicht eine Auslenkung — die
   * Geometrie bleibt flach. Bei 3 km Sichtweite und einer Kamera, die meist
   * hoch steht, wäre echte Verschiebung verschenkte Vertex-Last.
   */
  waves: {
    /** Wellenlänge in Metern je Lage. */
    lengths: [37, 13, 4.6],
    /** Neigung je Lage. */
    steepness: [0.07, 0.052, 0.032],
    /** Richtung je Lage in Grad, von Norden im Uhrzeigersinn. */
    directions: [118, 74, 152],
    /** Geschwindigkeit in Metern pro Sekunde. */
    speeds: [1.15, 0.78, 0.42],
  },

  /**
   * Schaumsaum am Ufer.
   *
   * `depth` ist die Wassertiefe, bis zu der Schaum auftritt, `width` die
   * Weichheit des Übergangs. Ohne diesen Saum schneidet die Wasserebene hart
   * ins Gelände — die auffälligste Bildstörung, die eine Küste haben kann.
   */
  foam: {
    depth: 0.9,
    width: 0.9,
    intensity: 0.65,
    /** Die Wellen lassen den Saum atmen, statt ihn als Konturlinie stehen zu lassen. */
    waveInfluence: 1.2,
  },

  /**
   * Transparenz am Ufer. Bis zu dieser Tiefe blendet die Wasserfläche auf.
   *
   * Der Wert ist klein: nur die letzten Zentimeter sollen durchsichtig sein.
   * Ein weiter Verlauf sähe aus wie ein Filter über dem Strand.
   */
  edgeFade: 0.8,
} as const;

/**
 * Der Fluss — PLAN.md P8.6.
 *
 * Das Band liest seine Mittellinie aus `assets/generated/terrain/river.json`;
 * hier steht nur, wie der Wasserspiegel darauf sitzt.
 */
export const RIVER = {
  /**
   * Wie hoch der Spiegel über der Bettsohle liegt, in Metern.
   *
   * `river.json` führt die **Sohle**. Läge das Band exakt darauf, wäre die
   * Wassertiefe null — und Farbe, Schaum und Uferblende kommen im Shader
   * allesamt aus der Tiefe; der Fluss wäre unsichtbar. Gemessen liegt die
   * Sohle im Median 2,68 m unter dem Ufer, ein Spiegel 0,9 m darüber bleibt
   * also mit Abstand im Bett.
   */
  surfaceRise: 0.9,

  /**
   * Wie tief ein Flussknoten das Gelände unter sich höchstens flutet, in Metern
   * — P21.
   *
   * ## Der Fehler, gegen den diese Zahl steht
   *
   * `WaterField.#inRiver` sucht den nächsten Knoten **in XZ** und nimmt dessen
   * Spiegelhöhe. Über die Höhe stand nichts darin — und dieser Fluss hat zwei
   * **Wasserfälle** (`river.json`, `falls`: 11,2 m und 39,7 m). Am Kopf eines
   * Falls liegt ein Knoten mit 7,5 m Halbbreite direkt über einer Felswand; für
   * jeden Punkt dort unten war er der nächste.
   *
   * Gemessen am Bergpass bei (−1085 | −512): Gelände 95,70 m, nächster Knoten
   * (Index 113) auf 116,00 m, 4,1 m entfernt. Die Abfrage meldete **21,24 m
   * Wassertiefe** — mitten im Berg, auf der Fahrbahn. Der Wagen schwamm dort
   * auf einem Phantom-See, und genau das ist die Zeile „`toge` meldet
   * 1804,7 cm Standhöhe", die seit P19 als offener Punkt in PLAN.md stand.
   *
   * ## Warum 6 m
   *
   * Gemessen über 13 229 Proben im Kanal (alle 422 Knoten, acht Richtungen bis
   * zur Halbbreite, gegen `height.r16`):
   *
   * | | Tiefe |
   * |---|---:|
   * | Median | 3,11 m |
   * | 90. Perzentil | 4,29 m |
   * | 99. Perzentil | 15,77 m |
   * | Maximum | 22,05 m |
   *
   * Zwischen 6 m und 10 m liegt genau **1,07 %** der Proben — das ist der
   * Knick zwischen „Bett" und „Fall". 6 m lässt 95,9 % des Kanals nass und
   * schneidet den Schwanz ab.
   *
   * Der Satz dahinter ist kein Grenzwert, sondern eine Aussage: **ein
   * Flussknoten beschreibt ein Bett, keinen Wasserfall.** Wo das Wasser fällt,
   * steht keines.
   */
  maxDepth: 6,

  /**
   * Anteil der Bettbreite, den der Spiegel einnimmt.
   *
   * Das Bett läuft als V aus. Ein Spiegel bis zur Bettkante stünde am Ufer
   * über dem Gelände — sichtbar als Wasser, das den Hang hinaufläuft.
   */
  widthFactor: 0.78,

  /**
   * Ab dieser Neigung der Wasserfläche schäumt es (Δh je Meter Lauf).
   *
   * Der Wert entscheidet, ob die beiden Stufen (11,2 m und 39,7 m) als
   * Wasserfall lesbar sind oder nur als steiles Band. Der Shader blendet
   * zwischen 0,10 und 0,45 auf; dieser Wert ist die Zählschwelle für die
   * Messung und muss dazu passen.
   */
  foamSlope: 0.1,
} as const;

// ── Was der Fluss am Unterlauf ist, und was er nicht ist ────────────────────
//
// Die Abnahme von P8.6 meldete am Unterlauf **2 geänderte Pixel** in der
// Differenz gegen ein Bild ohne Fluss. Daraus wurde zuerst „der Fluss ist nicht
// im Bild". Das war falsch, und drei Messungen haben es nacheinander widerlegt:
//
//   · vergraben von den Reisterrassen?  Nein — freier Bandanteil 100 %,
//     0 von 160 Knoten unter Gelände.
//   · durch die Uferblende transparent? Nein — Wassertiefe im Median 3,00 m,
//     Deckkraft 100 %.
//   · außerhalb des Bildes?             Nein — 151 von 422 Knoten im
//     Sichtvolumen, einer auf Pixel (1238, 543).
//
// Er wird gezeichnet: bei Differenzschwelle **0** sind es **0,869 % der
// Pixel**, bei Schwelle 2 nur noch 0,002 %. Er ist also **farblich nicht von
// den gefluteten Reisfeldern zu unterscheiden**, durch die er läuft. Das ist
// kein Fehler in der Geometrie und keiner im Shader, sondern eine Look-Frage.
//
// **Ein Rauheitsaufschlag (+0,085) war der naheliegende Versuch und ist
// gemessen wirkungslos**: 0,002 % bei Schwelle 2, vorher wie nachher. Er ist
// deshalb wieder ausgebaut — nach derselben Regel, an der in P8.5 schon eine
// „offensichtlich richtige" Erosionsreparatur gescheitert ist. Was den Fluss
// dort lesbar macht, muss eine andere Größe sein: Ufer, Böschungsbewuchs oder
// eine Strömungsstruktur, die ein stehendes Feld nicht hat. Offen.

// ── Bekannte Grenze der Küstenlinie in P2 ───────────────────────────────────
//
// Schaumsaum und Transparenzverlauf werden aus der Heightmap gerechnet und sind
// dort stetig — die *sichtbare* Schnittkante folgt aber der Triangulierung des
// Terrain-Gitters, und das hat bei 768 Stützstellen 4 m pro Quad. Auf einem
// Strand mit 9 % Gefälle streckt sich ein einziges Quad über zig Meter
// Uferlinie, und die Grenze zerfällt in achsenparallele Stufen.
//
// Gemessen: mit 1536 Stützstellen (2 m pro Quad) halbiert sich die Stufenbreite
// sichtbar. Es ist also keine Frage des Shaders, sondern der Geometriedichte —
// die löst der LOD-Quadtree aus P4, der nahe der Kamera feiner auflöst. Bis
// dahin stimmt der Verlauf, die Kante darunter nicht.
