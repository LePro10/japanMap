import type { QualityKey, QualityLevel } from './quality.config';

/**
 * Driftspuren, Gischt und Staub — die sichtbare Hälfte des Fahrgefühls.
 *
 * ## Warum das kein Partikelsystem aus dem Regal ist
 *
 * Die Fahrschicht kostet gemessen **+4 Draw-Calls und +1024 Dreiecke**
 * (CLAUDE.md, P14). Ein klassisches GPU-Partikelsystem (Points + Shader +
 * eigener Durchgang) wäre der fünfte teure Posten in einer Szene, deren
 * Budgets (800 Draw-Calls, 3 Mio. Dreiecke) schon die Vegetation und die
 * PostFX-Kette tragen. Hier entstehen **zwei** InstancedMeshes, die nur
 * existieren, solange jemand fährt — im Freiflug sind sie unsichtbar und
 * zählen nicht.
 *
 * | | Ultra | Minimal |
 * |---|---|---|
 * | Driftspuren (Quads) | 256 | 32 |
 * | Partikel (Quads) | 420 | 40 |
 * | Draw-Calls | 2 | 2 |
 * | Dreiecke | ~1350 | 145 |
 *
 * Das ist weniger als ein einziges Baum-Mesh. Die Puffer werden **einmal** auf
 * Ultra-Größe angelegt (derselbe Satz wie bei der Vegetation: ein späterer
 * Stufenwechsel darf nicht reallokieren). Weniger Stufe heißt weniger
 * *lebende* Instanzen, nicht ein kleinerer Puffer.
 *
 * ## Warum fünf Partikelsorten trotzdem **ein** Draw-Call sind — P19
 *
 * Bis P19 gab es genau eine Sorte: einen langgezogenen, additiv gemischten
 * Streifen. Er stand für Wasser **und** Staub, und im Bild ergab das die
 * gemeldete Beanstandung — weiße Stäbchen im Wasser, gelbe Stäbchen im Dreck.
 * Der Grund war nicht die Farbe, sondern die **Form**: ein Streifen ist die
 * Silhouette eines *schnellen Tropfens*, und alles andere, was ein Rad aufwirft
 * (Dunst, Staubwolke, Erdbrocken), hat sie nicht.
 *
 * Fünf Formen bräuchten normalerweise fünf Texturen und damit fünf Materialien.
 * Hier liegen sie als **2 × 2-Atlas** in einer einzigen Textur, und ein
 * Instanzattribut (`aTile`) wählt das Feld im Vertex-Shader aus. Kosten: ein
 * Float je Instanz und zwei Zeilen Shader. Draw-Calls: unverändert **einer**.
 *
 * ## Was hier bewusst nicht steht
 *
 *  - **Keine Kollision der Partikel.** Ein Tropfen, der von der Karosserie
 *    abprallt, wäre je Partikel eine Abfrage in der `CollisionWorld`.
 *  - **Keine Spiegelung.** Der planare Durchgang zeichnet die Szene ein
 *    zweites Mal; `FahrzeugFX` steht auf seiner Ausschlussliste.
 *  - **Kein Download.** Die Stempel entstehen in einem Canvas. CrazyGames
 *    zählt jedes Byte bis zum ersten Bild.
 */

export interface FxBudget {
  /** Lebende Driftspuren, Ringpuffer. */
  readonly skids: number;
  /** Lebende Partikel (Gischt, Dunst, Staub, Brocken zusammen). */
  readonly splash: number;
  /** Faktor auf die Spawnrate aller Partikel, 0…1. */
  readonly splashRate: number;
  /**
   * Wie viel **Dunst** entstehen darf, 0…1.
   *
   * Eine eigene Zahl und kein Anteil von `splashRate`, weil Dunst der teuerste
   * Posten je Partikel ist: er lebt am längsten, wird am größten und ist damit
   * das, was auf einer schwachen GPU Füllrate frisst. Auf Minimal steht er auf
   * 0 — dort gibt es Tropfen und Staubfahne, aber keine Wolke.
   */
  readonly mist: number;
}

export const FX_BUDGET: Readonly<Record<QualityLevel, FxBudget>> = {
  ultra: { skids: 256, splash: 420, splashRate: 1, mist: 1 },
  high: { skids: 192, splash: 300, splashRate: 0.85, mist: 0.8 },
  medium: { skids: 128, splash: 180, splashRate: 0.6, mist: 0.5 },
  low: { skids: 64, splash: 90, splashRate: 0.4, mist: 0.25 },
  minimal: { skids: 32, splash: 40, splashRate: 0.25, mist: 0 },
};

/** Puffergröße — das Maximum über die Leiter, einmal angelegt. */
export const FX_SKID_CAPACITY = FX_BUDGET.ultra.skids;
export const FX_SPLASH_CAPACITY = FX_BUDGET.ultra.splash;

export function fxBudgetFor(level: QualityKey): FxBudget {
  // „Eigen" hat keine eigene Leiter. Hoch ist die Mitte der sichtbaren Stufen
  // und überschreitet keinen Puffer, den Ultra bemisst.
  return level === 'custom' ? FX_BUDGET.high : FX_BUDGET[level];
}

export const SKID = {
  /**
   * Mindestabstand zweier Stempel desselben Rades, in Metern.
   *
   * 0,40 m bei 20 m/s sind 50 Stempel/s und Rad, vier Räder wären 200/s —
   * der Ultra-Puffer wäre in 1,3 s voll. 0,42 m schließt die Lücken, die
   * im Draufblick als gestrichelte Bahn zu lesen waren (gemessen P18).
   */
  spacing: 0.42,

  /**
   * Breite eines Stempels als Vielfaches der **Reifenbreite** des Fahrzeugs.
   *
   * Bis P17 stand hier eine feste Zahl (0,28 m, „etwas über der Reifenbreite von
   * 0,21 m"). Mit vier Fahrzeugen ist das falsch: der Lastwagen hat 0,30 m
   * breite Räder und zöge eine Spur, die schmaler ist als sein Reifen, der
   * Supersportler mit 0,31 m ebenso. 1,33 ist genau das alte Verhältnis
   * (0,28 / 0,21) — für das Coupé ändert sich damit nichts.
   */
  widthPerTire: 1.33,
  /** Länge längs der Bahn. */
  length: 0.72,

  /**
   * Auf losem Boden ist die Spur breiter als der Reifen — er wirft Material
   * zur Seite, statt Gummi abzureiben. Faktor auf Breite und Länge.
   */
  looseSpread: 1.55,

  /**
   * Schräglauf, ab dem eine Spur entsteht, als Vielfaches von `peakSlipRear`.
   *
   * 0,70 heißt: erst im Plateau, nicht schon beim Einlenken. Sonst läge auf
   * jeder Kehre des Bergpasses eine Spur, und die *gemeinte* Driftspur wäre
   * nicht mehr zu lesen.
   */
  slipStart: 0.7,

  /** Durchdrehen, ab dem die Hinterräder markieren (1 = Haftgrenze). */
  spinStart: 1.08,

  /** Lebensdauer in Sekunden. Länger = dichtere Bahn, früherer Überlauf. */
  life: 6.5,
  /**
   * Auf losem Boden hält die Furche länger als Gummi auf Asphalt.
   *
   * Faktor auf `life`. Eine Fahrspur im Acker ist am nächsten Tag noch da; eine
   * Bremsspur auf Asphalt verweht. 1,8 ist so viel mehr, wie der Ringpuffer
   * hergibt, ohne dass die Spur vorn abreißt, während hinten noch gestempelt
   * wird.
   */
  looseLife: 1.8,

  /** Anheben über den Boden, zusätzlich zum polygonOffset. */
  lift: 0.045,

  /**
   * ## Die Spurfarben — P18, und warum sie neu bemessen sind
   *
   * Bis P17 gab es zwei: `asphalt: 0x2a221c` und `dirt: 0x6a4a32`, und an der
   * zweiten stand „**heller als der Boden, sonst verschwindet sie**". Diese
   * Begründung war falsch, und zwar messbar. Mittelwerte der tatsächlich
   * verlegten Belagstexturen (`tools/bench/surfcolor.mjs`, Helligkeit nach
   * Rec. 709 auf 0…255):
   *
   * | Fläche | Textur | Helligkeit | alte Spur | Verhältnis |
   * |---|---|---:|---:|---:|
   * | Asphalt | `asphalt_02/Diffuse` | 89,6 | 35,3 | 2,54 : 1 |
   * | Gras / Gelände | `aerial_grass_rock/Diffuse` | 96,3 | 79,1 | **1,22 : 1** |
   * | Kiesbelag | `ROAD_GRAVEL_COLOR` | 97,5 | 79,1 | **1,23 : 1** |
   *
   * Die „hellere" Spur war auf beiden losen Belägen **dunkler als der Boden**
   * und dabei so nah an ihm, dass 22 % Helligkeitsunterschied blieben — auf
   * einer texturierten Fläche mit Korn ist das nichts. Genau das ist der Befund
   * „die Driftspuren sieht man kaum".
   *
   * ## Was sich geändert hat, und warum es nicht nur andere Zahlen sind
   *
   * Eine hellere oder dunklere Farbe allein hätte das Problem nur halb gelöst.
   * Die Spur ist ein `MeshBasicMaterial` — sie wird **nicht beleuchtet**. Auf
   * einer Karte in der blauen Stunde (Sonnenstand 2,23°) ist die *beleuchtete*
   * Fahrbahn viel dunkler als ihre Albedo von 89,6, und eine unbeleuchtete Spur
   * mit fester Farbe kann je nach Tageszeit heller oder dunkler als der Boden
   * sein. Eine Farbe, die gegen die Albedo stimmt, stimmt gegen das Bild noch
   * lange nicht.
   *
   * Deshalb zeichnet die Spur seit P18 **multiplikativ**: sie *dämpft*, was
   * unter ihr liegt, statt darüber zu malen. Das ist zugleich das physikalisch
   * richtige Modell — ein Reifenabrieb ist eine Schicht auf der Fahrbahn, kein
   * Leuchten — und es macht die Spur von der Beleuchtung unabhängig: 0,45
   * heißt „hier ist es 45 % so hell wie daneben", bei Tag wie in der Dämmerung.
   *
   * Die Werte unten sind damit **Dämpfungsfaktoren**, keine Farben im üblichen
   * Sinn. Sie tragen einen leichten Farbstich, weil ein Abrieb nicht neutral
   * grau ist.
   */
  /** Gummi auf Asphalt: dunkel und leicht kühl. 0,38 ≙ Verhältnis 2,6 : 1. */
  asphalt: 0x635f66,
  /**
   * Aufgerissener Kies: die feuchte Unterlage kommt hoch, warm und dunkler.
   * 0,42 ≙ 2,4 : 1.
   */
  gravel: 0x7a6a58,
  /**
   * Furche im Gras: nasse Erde, der dunkelste der drei. 0,34 ≙ 2,9 : 1 — die
   * Grasnarbe hat das stärkste Korn und braucht den größten Abstand.
   */
  terrain: 0x5c5044,
} as const;

/**
 * Die Partikel — P19.
 *
 * ## Die fünf Sorten und was jede leistet
 *
 * | Sorte | Feld im Atlas | wofür |
 * |---|---|---|
 * | `DROP` | Tropfen | die einzelnen Spritzer, die aus dem Wasser fliegen |
 * | `SHEET` | Streifen | der Fächer direkt am Reifen — die „Wand" aus Wasser |
 * | `MIST` | Wolke | der Dunst, der hinter dem Wagen stehen bleibt |
 * | `DUST` | Wolke | dasselbe in Erdfarbe: die Staubfahne |
 * | `CLOD` | Korn | Erdbrocken, die beim Durchdrehen wegfliegen |
 *
 * Die Zerlegung ist der eigentliche Punkt und nicht die Zahlen. Ein Rad im
 * Wasser erzeugt **drei** Dinge gleichzeitig, die sich in Lebensdauer,
 * Geschwindigkeit und Größe um mehr als eine Größenordnung unterscheiden: einen
 * Fächer (0,15 s, schnell, klein), Tropfen (0,5 s, ballistisch) und Dunst (1,4 s,
 * fast stehend, groß und wachsend). Mit *einer* Sorte kann man höchstens eines
 * davon treffen — und die alte Fassung traf den Tropfen und zeichnete ihn dann
 * so lang und so hell, dass er wie ein Leuchtstab aussah.
 *
 * ## Warum nicht mehr additiv gemischt wird
 *
 * Additiv heißt: die Partikel **addieren** Licht auf das Bild. Bei einer Karte
 * in der blauen Stunde ist der Hintergrund fast schwarz, und alles Additive wird
 * dort zu reinem Weiß — auch wenn die Instanzfarbe (0,82 / 0,90 / 0,96) das gar
 * nicht ist. Überlappen sich zwei Partikel, sind es 1,64 / 1,80 / 1,92, und nach
 * dem Tonemapping ist das Papierweiß. Genau so sahen die Streifen im Bild aus.
 *
 * Wasser ist keine Lichtquelle. Es ist ein Streuer: es **verdeckt**, was
 * dahinter liegt, mit seiner eigenen Helligkeit. Das ist normale
 * Alpha-Mischung, und mit ihr kann kein Stapel Partikel heller werden als das
 * hellste Einzelstück.
 */
export const PARTICLES = {
  // ── Wasser ──────────────────────────────────────────────────────────────
  /**
   * Tropfen je Sekunde und Rad bei 20 m/s in tiefem Wasser.
   *
   * Hinten 1,7× (Antrieb). 70 · (2 + 2·1,7) ≈ 308/s; bei 0,50 s Leben sind rund
   * 154 gleichzeitig unterwegs — unter dem Ultra-Puffer von 420, in den auch
   * noch Fächer und Dunst passen müssen.
   */
  dropRateAt20: 70,
  dropLife: 0.5,
  dropLifeJitter: 0.16,
  /** Halbmesser eines Tropfens am Anfang und am Ende, in Metern. */
  dropSize: 0.07,
  dropSizeEnd: 0.035,
  /**
   * Streckung längs der Flugbahn, als Sekunden Flugweg.
   *
   * Ein Tropfen mit 8 m/s wird bei 0,022 s um 18 cm gestreckt — das ist die
   * Bewegungsunschärfe, die ihn als *fliegend* lesbar macht. Der alte Streifen
   * war mit 0,48 m fest und damit bei jedem Tempo gleich lang; er sah deshalb
   * bei langsamer Fahrt aus wie ein hingelegter Strohhalm.
   */
  dropStretch: 0.022,
  /** Höchste Streckung als Vielfaches der Breite — sonst wird der Tropfen zum Stab. */
  dropStretchMax: 5,

  /** Fächer am Reifen: kurz, breit, schnell wachsend. */
  sheetRateAt20: 22,
  sheetLife: 0.17,
  sheetSize: 0.14,
  sheetSizeEnd: 0.42,

  /** Dunst hinter dem Wagen. */
  mistRateAt20: 5,
  mistLife: 1.35,
  mistLifeJitter: 0.4,
  mistSize: 0.22,
  mistSizeEnd: 0.8,

  /** Extra-Tropfen, wenn ein Rad eintaucht. */
  entryBurst: 22,

  /** Aufwärts (m/s) plus Anteil des Tempos. */
  up: 2.4,
  upFromSpeed: 0.26,
  /** Nach außen, weg von der Fahrzeugmitte. */
  out: 3.0,
  outFromSpeed: 0.5,
  /** Nach hinten, gegen die Fahrtrichtung. */
  back: 2.0,
  backFromSpeed: 0.42,
  /** Wie viel der Wagengeschwindigkeit ein Tropfen mitnimmt. */
  inherit: 0.2,

  /**
   * Luftwiderstand je Sorte, als Abklingrate in 1/s.
   *
   * **Der Unterschied zwischen Tropfen und Dunst steckt fast vollständig hier.**
   * Ein 2-mm-Tropfen fliegt ballistisch (0,9/s — die Luft bremst ihn kaum), ein
   * 20-µm-Nebeltröpfchen steht nach einer Zehntelsekunde praktisch still (3,4/s).
   * Beides folgt aus demselben Gesetz, nur mit tausendfach anderem
   * Verhältnis von Oberfläche zu Masse. Ohne diesen Unterschied fliegt die
   * Staubwolke mit derselben Bahn wie der Erdbrocken, und dann ist es keine
   * Wolke.
   */
  dropDrag: 0.9,
  sheetDrag: 3.0,
  mistDrag: 3.4,
  clodDrag: 0.2,

  /** Schwere je Sorte, m/s². Dunst schwebt fast — er sinkt nur langsam. */
  dropGravity: 15,
  sheetGravity: 9,
  mistGravity: 0.5,
  clodGravity: 19,
  /**
   * Auftrieb des Dunstes, m/s².
   *
   * Aufgewirbeltes Wasser und Staub steigen — sie werden von der Luft
   * mitgenommen, die das Rad vor sich herschiebt. Ohne diesen Term liegt die
   * Fahne am Boden und sieht aus wie ein Teppich.
   */
  mistLift: 0.9,

  // ── Loser Boden ─────────────────────────────────────────────────────────
  /** Staubfahne je Sekunde und Rad bei 20 m/s. */
  dustRateAt20: 18,
  /** Ab diesem Tempo staubt es beim einfachen Fahren (m/s). */
  dustMinSpeed: 5,
  /** Vielfaches der Staubrate, wenn das Rad durchdreht oder quer steht. */
  dustSlipBoost: 3.2,
  dustLife: 1.15,
  dustLifeJitter: 0.45,
  /**
   * Anfangs- und Endgröße eines Staubballens, m.
   *
   * > **1,05 m Endgröße war zu klein, und das sah man nicht an der Zahl.** Bei
   * > 20 m/s und 18 Stück/s je Rad liegt zwischen zwei Ballen desselben Rades
   * > gut ein Meter — mit 1,05 m Durchmesser berühren sie sich gerade eben und
   * > lesen sich als **Perlenkette** statt als Fahne. Gemessen an
   * > `.cache/shots/drift.png` (P25): eine Reihe getrennter Scheiben hinter dem
   * > Wagen, jede mit erkennbarem Rand.
   * >
   * > 1,8 m ist die Zahl, die aus derselben Rechnung folgt: knapp doppelter
   * > Ballenabstand, also überlappen sich immer mindestens zwei. Die Rate zu
   * > verdoppeln wäre der andere Weg gewesen und ist verworfen — 230 Partikel/s
   * > sind schon 265 lebende, und der Puffer hält 420.
   */
  dustSize: 0.34,
  dustSizeEnd: 1.8,

  /** Erdbrocken — nur beim Durchdrehen. */
  clodRateAt20: 20,
  clodLife: 0.85,
  clodSize: 0.062,
  clodSizeEnd: 0.05,

  /** Ab dieser Wassertiefe gilt ein Rad als im Wasser (m). */
  minDepth: 0.04,
  /** Unter diesem Tempo spritzt nichts (m/s). */
  minSpeed: 1.2,

  // ── Farben ──────────────────────────────────────────────────────────────
  //
  // Alle als lineare RGB-Tripel und nicht als Hex: sie gehen unverändert in
  // `setColorAt`, und `Color.setHex` würde sie von sRGB nach linear drehen.
  // Was hier steht, ist die Helligkeit, die im Bild ankommt.
  //
  // Bemessen für die blaue Stunde dieser Karte (Sonnenstand 2,23°). Die Karte
  // hat **eine** Tageszeit — deshalb ist eine feste Farbe hier zulässig, wo sie
  // es bei der Driftspur nicht war (die liegt auf beliebig beleuchtetem Boden;
  // ein Partikel steht in der Luft und bekommt nur Himmelslicht).
  /** Gischt: blasses Blaugrau, nicht Weiß. Weiß gibt es im Bild sonst nirgends. */
  waterColor: [0.62, 0.70, 0.78] as readonly [number, number, number],
  waterAlpha: 0.8,
  sheetAlpha: 0.5,
  /** Dunst über Wasser: kühler und deutlich schwächer. */
  mistColor: [0.26, 0.3, 0.35] as readonly [number, number, number],
  mistAlpha: 0.16,
  /**
   * Staub über Erde: warmes Grau. Staub streut Himmelslicht, er leuchtet nicht.
   *
   * ## Die Zahl stammt aus einem Bild, und die alte war um den Faktor zehn daneben
   *
   * Hier stand `[0.55, 0.49, 0.4]`, und der Kommentar daneben sagte genau das
   * Richtige — *er leuchtet nicht*. Die Zahl sagte etwas anderes. Ein Partikel
   * ist ein `MeshBasicMaterial`: was hier steht, ist **direkt** die Helligkeit,
   * die im Bild ankommt, ohne Licht, ohne Schatten, ohne Abschwächung.
   *
   * Gemessen an `.cache/shots/drift.png` (P25, Werte linear):
   *
   * | | linear |
   * |---|---|
   * | Boden neben dem Wagen | 0,005 |
   * | Boden, besonnt, in der Ferne | 0,021 |
   * | hellster Staubfleck | **0,159** |
   * | Himmel | 0,43…0,78 |
   *
   * Der Staub stand also **31-mal** über dem Boden, aus dem er aufgewirbelt
   * wurde, und ein Drittel so hell wie der Himmel. Im Bild waren das weiße
   * Punkte auf schwarzer Erde. Wieder die Fehlerform aus CLAUDE.md — *es war im
   * Bild, nur als etwas anderes*.
   *
   * ## Und die erste Korrektur schoss über das Ziel hinaus
   *
   * Sie setzte 0,058 **und** halbierte zugleich `dustAlpha` — zwei Faktoren auf
   * einmal, zusammen 1/19 des alten Beitrags. Nachgemessen war danach **gar
   * keine** Fahne mehr im Bild, und zwar auch dann nicht, wenn man die
   * Partikelfarbe im Lauf verdreifachte (`material.color.setScalar(3)`,
   * `.cache/shots/staub-k3.png`): 300 lebende Instanzen, null Sichtbarkeit.
   *
   * Das ist die Fehlerform „am erstbesten plausiblen Regler gedreht" aus
   * CLAUDE.md, nur mit zwei Reglern gleichzeitig — und dann weiß man
   * hinterher nicht, welcher es war.
   *
   * Der Wert unten kommt aus der einen Messung, die belastbar ist: mit
   * `dustColor` 0,55 und `dustAlpha` 0,32 stand die Fahne bei **0,159** linear.
   * Der Beitrag ist in beiden Faktoren linear, also gilt
   *
   * ```
   *   Spitze ≈ 0,159 · (Farbe / 0,55) · (Alpha / 0,32)
   * ```
   *
   * Gewollt sind rund 0,045 — das Achtfache des Bodens daneben (0,005), also
   * deutlich sichtbar, und ein Viertel des Werts, der als weiße Punkte im Bild
   * stand. Mit Alpha 0,22 folgt daraus Farbe 0,20.
   *
   * Das Farbverhältnis (warm, 1,00 : 0,90 : 0,76) ist über alle drei Fassungen
   * unverändert; falsch war nie der Farbton, sondern der Pegel.
   */
  dustColor: [0.2, 0.18, 0.152] as readonly [number, number, number],
  /** Staub über Kies: derselbe Pegel, nur ohne den warmen Stich. */
  gravelColor: [0.19, 0.185, 0.176] as readonly [number, number, number],
  /**
   * Deckkraft eines einzelnen Staubballens.
   *
   * Aus demselben Bild: bei rund 265 lebenden Ballen liegen hinter dem Wagen
   * drei bis vier übereinander, und 1 − 0,68⁴ = 0,79 ist eine Wand. Mit 0,22
   * sind es 0,63 — eine Fahne, durch die man den Boden noch sieht.
   */
  dustAlpha: 0.22,
  /** Erdbrocken: fast schwarz, sie sind nasse Erde im Gegenlicht. */
  clodColor: [0.15, 0.12, 0.09] as readonly [number, number, number],
  clodAlpha: 0.95,
} as const;

/**
 * Felder des Partikel-Atlas. Die Reihenfolge ist die Anordnung in der Textur:
 * `x = tile % 2`, `y = floor(tile / 2)`, jedes Feld eine halbe Kantenlänge.
 */
export const FX_TILE = {
  drop: 0,
  streak: 1,
  cloud: 2,
  grain: 3,
} as const;
