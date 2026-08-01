/**
 * Weltparameter. Einzige Quelle der Wahrheit für Maße — Baker (tools/), Sampler
 * und Renderer lesen alle hier, damit sie nicht auseinanderlaufen können.
 *
 * Koordinatensystem (PLAN.md, Konventionen):
 *   Y-up, rechtshändig, 1 Unit = 1 Meter. Y = 0 ist Meeresspiegel. Norden ist -Z.
 */

const SIZE = 3072;
const HEIGHTMAP_RES = 2048;
const CHUNK_SIZE = 256;

export const WORLD = {
  /** Kantenlänge der Welt in Metern (quadratisch). */
  size: SIZE,
  /** X und Z laufen von -half bis +half. */
  half: SIZE / 2,

  seaLevel: 0,
  /** Höchster Punkt (Gipfel im Nordwesten). */
  maxHeight: 450,
  /** Tiefster Punkt (Meeresboden vor der Südküste). */
  minHeight: -40,

  /** Kantenlänge eines Terrain-Chunks in Metern. */
  chunkSize: CHUNK_SIZE,
  /** Chunks pro Achse — 12 × 12 = 144. */
  chunksPerAxis: SIZE / CHUNK_SIZE,

  /** Auflösung der gebackenen Heightmap in Texeln pro Achse. */
  heightmapRes: HEIGHTMAP_RES,
  /**
   * Metrischer Abstand zweier Heightmap-Stützstellen — ≈1,5 m.
   *
   * Bewusst `size / (res - 1)` und nicht `size / res`: die Heightmap ist ein
   * **Gitter von Stützstellen**, dessen äußerste Reihe genau auf der Weltkante
   * liegt. Texel 0 sitzt auf −1536 m, Texel 2047 auf +1536 m. Nur so decken
   * CPU-Sampler und Vertex-Shader mit bilinearer Interpolation exakt denselben
   * Bereich ab; bei `size / res` fehlte am Rand ein halbes Texel und das
   * Terrain bekäme dort eine Naht.
   *
   * tools/bake-terrain.mjs rechnet identisch und schreibt den Wert zur
   * Kontrolle nach meta.json.
   */
  metersPerTexel: SIZE / (HEIGHTMAP_RES - 1),
} as const;

/** Gesamter Höhenbereich in Metern. Skalierungsfaktor für 16-bit-Höhenwerte. */
export const WORLD_HEIGHT_RANGE = WORLD.maxHeight - WORLD.minHeight;

export const CAMERA = {
  fov: 60,
  /**
   * near/far spannen 12 000 : 1. Das ist für einen 24-bit-Tiefenpuffer in
   * Ordnung; darunter (near = 0.1) fängt bei 2 km Sichtweite das Z-Fighting an.
   * Falls Props je näher als 50 cm an die Kamera kommen: hier nachziehen,
   * nicht am logarithmischen Tiefenpuffer (der bricht mehrere PostFX-Effekte).
   */
  near: 0.5,
  far: 6000,
  /**
   * Nickbereich in Grad, symmetrisch um die Waagerechte.
   *
   * Der Wert ist das Ergebnis einer Messung, nicht ein Gefühl: die Kamera
   * gierert um die Welt-Y-Achse, und schaut sie fast senkrecht nach oben oder
   * unten, liegt die Blickachse parallel zu dieser Drehachse — eine Drehung
   * um eine Achse parallel zur Blickrichtung ist auf dem Bild eine Drehung im
   * Kreis statt eines Schwenks. Mit dem alten Limit von 89,43° (π/2 − 0.01)
   * gemessen, jeweils 100 px Mausbewegung bei gleichem Gierdelta von 12,61°:
   *
   * | Blick | Bildwirkung |
   * |---|---|
   * | waagerecht | 2,4° — Schwenk, Szene schiebt sich |
   * | 89,43° (altes Limit) | 12,8° — die ganze Welt dreht sich um den Bildmittelpunkt |
   *
   * Die Drehung um die Blickachse skaliert mit `sin(Nick)` und ist selbst bei
   * 75° noch bei 97 % des Maus-Tempos — ein Nick-Limit allein behebt den
   * Effekt also nicht, man steht nur 15° früher still. Den Wirbel beseitigt
   * `yawSpinCap` im selben Block; dieses Limit begrenzt nur noch, wie steil
   * man überhaupt schauen kann (15° vor Zenit/Nadir bleibt sichtbar).
   */
  pitchLimitDeg: 75,
  /**
   * Obergrenze für den Anteil der Mausbewegung, der als Drehung um die
   * Blickachse ins Bild geht (1 = ungedämpft).
   *
   * Das Gieren dreht um die Welt-Senkrechte; schaut die Kamera um `θ` nach
   * oben oder unten, erscheint davon der Anteil `sin(θ)` als Drehung der
   * ganzen Welt um den Bildmittelpunkt statt als Schwenk. Gemessen am alten
   * Limit 89,43°: 12,8° Bildrotation pro 100 px bei 12,61° Gierdelta — der
   * Eindruck „die DPI wird 5× so schnell" ist genau dieser Faktor.
   *
   * Zwei frühere Ansätze waren zu schwach: ein Nick-Limit allein (die Drehung
   * bleibt bei 75° bei 97 %) und ein Fade, der erst ab 55° begann — bei
   * 55–60° Nick drehte die Welt noch mit 76–82 % des Maus-Tempos, der Wirbel
   * „kam auf einmal wieder". Dieses Cap greift deshalb von ~18° an und hält
   * die Bildrotation bei **jedem** Nick auf höchstens 30 % des Maus-Tempos
   * (`Faktor × sin(θ) ≤ 0,3`); darunter ist die Maus unverändert direkt.
   * Preis: Wer steil schaut, dreht sich entsprechend langsamer — ein Schwenk,
   * kein Wirbel.
   */
  yawSpinCap: 0.3,
} as const;

export const RENDER = {
  /** Über 2 wird Supersampling sinnlos teuer, ohne sichtbar besser zu werden. */
  maxPixelRatio: 2,
} as const;
