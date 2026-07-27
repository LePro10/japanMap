/**
 * Parameter des Terrain-Quadtrees — PLAN.md P4 / 4.1.
 *
 * Verfahren ist **CDLOD** (Continuous Distance-Dependent Level of Detail): ein
 * Quadtree über die Welt, eine einzige geteilte Gittergeometrie, und ein
 * Vertex-Morphing, das die feinere Stufe *vor* dem Stufenwechsel auf die
 * gröbere zusammenzieht. Dadurch entstehen weder Popping noch Risse, und zwar
 * ohne Skirts — die wären bei 2,2° Sonnenstand als senkrechte Wände sichtbar.
 */

import { WORLD } from './world.config';

const LEAF_SIZE = 48;
const GRID_VERTICES = 33;

/**
 * Tiefe des Baums: wie oft 3072 m halbiert werden müssen, um bei 48 m zu landen.
 * 3072 / 48 = 64 = 2⁶ — die Wurzel hat Tiefe 0, das Blatt Tiefe 6.
 */
const MAX_DEPTH = Math.log2(WORLD.size / LEAF_SIZE);

if (!Number.isInteger(MAX_DEPTH)) {
  throw new Error(
    `LOD.leafSize (${LEAF_SIZE} m) teilt WORLD.size (${WORLD.size} m) nicht in Zweierpotenzen.`,
  );
}

/**
 * Aufteilungsfaktor: ein Knoten der Stufe `l` wird unterteilt, solange die
 * Kamera näher als `SPLIT_FACTOR · leafSize · 2^l` an seinem Quader liegt.
 *
 * **Der Wert folgt aus zwei Ungleichungen, nicht aus dem Augenmaß.** Der erste
 * Entwurf stand auf 3,0 und erfüllte nur die erste davon.
 *
 * *Erstens: höchstens eine Stufe Unterschied zwischen Nachbarn.* Sei A ein
 * gezeichneter Knoten der Stufe L, also `d(c, A) ≥ r[L−1]`. Ein Nachbar der
 * Stufe L−2 setzt voraus, dass dessen Elternknoten P (Stufe L−1, an A
 * angrenzend) unterteilt wurde, also `d(c, P) < r[L−2] = r[L−1]/2`. Weil P an A
 * grenzt, ist `d(c, A) ≤ d(c, P) + diam(P)`. Zusammen: `r[L−1] > 2√2·s_{L−1}`,
 * also **f > 2√2 ≈ 2,83**.
 *
 * *Zweitens — und das war der Fund: an der Naht zwischen zwei Stufen muss die
 * gröbere **ungemorpht** sein.* Nur dann liegen ihre Stützstellen dort, wo die
 * feinere ihre vollständig zusammengezogenen hinlegt. Ein Knoten A der Stufe L
 * kann aber an einen unterteilten Geschwisterknoten P grenzen, und für einen
 * Punkt v auf dieser gemeinsamen Kante gilt nur `d(v) ≤ d(c,P) + diam(P) <
 * r[L−1] + √2·s_L = (f/2 + √2)·s_L`. Damit A dort garantiert ungemorpht ist,
 * muss der Morph erst danach beginnen:
 *
 *     morphStart · f ≥ f/2 + √2   ⟺   morphStart ≥ 0,5 + √2/f
 *
 * Mit f = 3 verlangt das morphStart ≥ 0,971 — dann bleibt für den Morph fast
 * kein Weg mehr, und aus dem Riss würde ein Sprung. Mit **f = 6** sind es
 * 0,736, und der Morph hat noch ein Viertel des Stufenbereichs zur Verfügung.
 *
 * Sichtbar wurde die Lücke in der Debug-Ansicht „Morph-Faktor": mit f = 3 war
 * das Bild fast durchgehend weiß, also überall vollständig gemorpht. Das ist
 * für sich genommen nicht falsch — ein voll gemorphter Knoten *ist* die nächst-
 * gröbere Stufe —, aber es heißt, dass die Nähte nicht dort liegen, wo die
 * Rechnung sie annimmt.
 *
 * **Nachgemessen, nicht hergeleitet stehengelassen.** Sieben Blickpunkte, alles
 * außer dem Gelände ausgeblendet, Himmel auf Magenta, Kamera so gekippt, dass
 * kein Himmel im Bild steht; gezählt wurden Himmelspixel *unterhalb* des
 * obersten Geländepixels jeder Spalte — jedes davon ist ein Loch:
 *
 * | Einstellung                  | Löcher | schlimmster Blick | Knoten je Bild |
 * |------------------------------|--------|-------------------|----------------|
 * | f = 3, morphStart 0,66       |    207 |                86 |          34…49 |
 * | f = 6, morphStart 0,78       |      1 |                 1 |          73…105 |
 *
 * Das eine verbliebene Pixel liegt an einer Grat-Silhouette und ist von echtem
 * Himmel hinter einer Kante nicht zu unterscheiden.
 *
 * Der Preis sind mehr Knoten: die Zahl je Stufe wächst mit f² (π·f²·¾, also
 * 21 bei f = 3 und 85 bei f = 6) — im Bild gemessen etwa das Doppelte, weil das
 * Frustum vom gewachsenen Ring einen größeren Teil behält.
 */
const SPLIT_FACTOR = 6;

/**
 * Bereichsgrenzen je LOD-Stufe, Stufe 0 ist die feinste.
 *
 * `ranges[l]` ist der Radius, innerhalb dessen ein Knoten der Stufe `l` noch
 * unterteilt werden darf. Die Verdopplung von Stufe zu Stufe ist das, was CDLOD
 * bezahlbar macht: der Flächeninhalt einer Stufe wächst mit dem Quadrat des
 * Radius, die Knotengröße aber auch — die Zahl der Knoten je Stufe bleibt
 * dadurch ungefähr konstant (π·f²·¾ ≈ 21) statt zu explodieren.
 */
function buildRanges(): readonly number[] {
  const ranges: number[] = [];
  let range = LEAF_SIZE * SPLIT_FACTOR;
  for (let level = 0; level <= MAX_DEPTH; level++) {
    ranges.push(range);
    range *= 2;
  }
  return ranges;
}

export const LOD = {
  /**
   * Stützstellen pro Achse in der geteilten Knotengeometrie. 33 Punkte = 32
   * Quads: eine gerade Zahl ist Voraussetzung fürs Morphing, das ungerade
   * Stützstellen auf ihre geraden Nachbarn zieht.
   *
   * Bei 48 m Blattgröße sind das **1,5 m pro Vertex** — genau der Texelabstand
   * der Heightmap (1,5007 m). Feiner abzutasten brächte nichts, gröber ließe
   * Information liegen; das feste Gitter aus P1 lag mit 4,0 m deutlich darüber.
   */
  gridVertices: GRID_VERTICES,
  /** Quads pro Achse. */
  gridQuads: GRID_VERTICES - 1,
  /** Kantenlänge des feinsten Knotens in Metern. */
  leafSize: LEAF_SIZE,
  /** Tiefe der Blätter. Wurzel = 0. */
  maxDepth: MAX_DEPTH,
  /** Zahl der LOD-Stufen (Stufe 0 = feinste). */
  levels: MAX_DEPTH + 1,
  ranges: buildRanges(),

  splitFactor: SPLIT_FACTOR,

  /**
   * Ab welchem Anteil von `ranges[l]` das Morphing einsetzt.
   *
   * Untergrenze ist `0,5 + √2/f = 0,736` — die zweite Ungleichung bei
   * `SPLIT_FACTOR`, dort hergeleitet. 0,78 lässt darüber hinaus Luft für die
   * **Höhe** der Knoten: die Herleitung rechnet mit dem Durchmesser in der
   * XZ-Ebene, ein Knoten im Massiv ist aber zusätzlich bis zu 400 m hoch, und
   * `diam` wächst damit. Genau ausrechnen ließe sich das nur pro Knoten; die
   * Zugabe ist billiger und wird unten am Bild geprüft, nicht angenommen.
   *
   * Nach oben ist 1,0 die Grenze: dort wäre das Morphing erst genau an der
   * Stufengrenze fertig, und das Popping wäre nur verschoben.
   */
  morphStart: 0.78,

  /**
   * Obergrenze für die Zahl gleichzeitig gezeichneter Knoten.
   *
   * Nicht als Sicherheitsnetz gedacht, sondern als Messgrenze: die
   * Instanzpuffer werden einmal in dieser Größe angelegt und danach nie wieder
   * umkopiert. Bei 24 Byte je Knoten kosten 2048 Stück 48 KB — der Wert darf
   * deshalb großzügig sein. Überzählige Knoten werden gezählt und im
   * Terrain-Ordner angezeigt (`stats.overflow`), statt lautlos zu fehlen.
   */
  maxNodes: 2048,
} as const;

/** Dreiecke, die ein einzelner Knoten kostet. */
export const LOD_TRIANGLES_PER_NODE = LOD.gridQuads * LOD.gridQuads * 2;
