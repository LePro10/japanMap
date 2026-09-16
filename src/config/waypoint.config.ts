/**
 * Waypoint, GPS-Band und Speed-Hinweis — Zahlen an einer Stelle.
 *
 * Die alte Markierung war ein `Sprite` in Weltmetern
 * (`scale = clamp(22 + m·0.1, 28, 140)`). Aus 10 m Entfernung füllte ein
 * 28-m-Schild den Bildschirm, aus 2 km war dasselbe Schild unleserlich, und
 * von der Verfolgerkamera aus (2,35 m hoch, Blick auf die Straße) lag der
 * Text bei y = 18 m schlicht über dem Bild. Genau die drei Sätze, die der
 * Spieler gemeldet hat.
 *
 * Text gehört deshalb ins HUD (konstante Pixelgröße, `DriveHud` sagt dasselbe
 * seit P16). Was in der Welt bleibt, ist ein Pin plus ein **kurzes** Band —
 * Forza Drive Line, nicht die ganze GPS-Strecke auf den Asphalt. Die Minikarte
 * trägt den Rest.
 *
 * Farbe nach US8425293 / Forza: an jedem Punkt `Tempo jetzt` gegen das
 * **Solltempo dort**. Das Solltempo kommt aus dem Rückwärtslauf von
 * `RaceLine` (Bremsen liegt schon vor der Kurve). Wer `sqrt(v²+2as)` noch
 * einmal darüber legt, verschiebt das Rot in die Kurve — genau das, was die
 * Linie nicht tun darf. Forza: „If you brake after the red zone begins,
 * you will head off into the grass."
 */
export const WAYPOINT = {
  /** Ankunft: der Pin räumt sich selbst ab. */
  arriveMeters: 22,
  /** Welt-Pin, Meter. Kein Text — der steht im HUD. */
  pinHeight: 3.4,
  pinRadius: 0.55,
  /** Lichtschaft, damit das Ziel hinter einem Hang noch zu finden ist. */
  beamHeight: 220,
  beamOpacity: 0.14,
  /** Bodenring. */
  ringInner: 3.2,
  ringOuter: 6.4,

  /**
   * Bandbreite auf der Fahrbahn, Meter. Keine volle Spur: Forza-GPS ist ein
   * Streifen in der Mitte, keine zweite Fahrbahn.
   */
  lineWidth: 2.35,
  /**
   * Über dem Höhenfeld, Meter. Das Feld ist schon die Fahrbahn (Bake);
   * `surfaceOffset` nochmal drauf und der Streifen schwebt. 5 cm plus
   * `polygonOffset` reicht gegen Z-Fighting, auch am Hang.
   */
  lineLift: 0.05,
  /** Erste Meter am Auto ausblenden — sonst schneidet das Band durch die Haube. */
  lineNearFade: 6,
  lineNearSolid: 14,
  /** Hinter dem Wagen nicht zeichnen. */
  lineBehind: 8,
  /** Apex-Versatz, Meter, skaliert mit der Krümmung. */
  apexOffset: 1.15,

  /**
   * Aufbau und Fade. Lambda ist die Zeitkonstante der Exponentialglättung
   * (`1 − e^{−λ·dt}`): 7 ≈ 0,3 s, 5 ≈ 0,4 s. Kein Keyframe, ein Filter —
   * derselbe Trick wie bei der Drehzahlanzeige, und er kostet drei Uniforms.
   */
  fadeIn: 7,
  fadeOut: 5,
  /** Wie schnell das Fenster vor dem Auto ausrollt, m/s. */
  revealSpeed: 480,
  /**
   * Sichtfenster auf der Fahrbahn, Meter. Die Karte trägt die ganze Route;
   * auf dem Asphalt reichen ein paar Straßenzüge, nicht 37 km.
   * 240 m war zu knapp: die nächste Kreuzung lag oft schon hinter dem Fade,
   * und die Karte fiel auf die Luftlinie zurück.
   */
  lookAhead: 900,
  /** Weiche Spitze, Meter. */
  revealHead: 36,
  speedSmooth: 6,
  arcSmooth: 16,
  pinSmooth: 14,
  appearSmooth: 8,

  /**
   * Knotenabstand im Suchgraph, in Mittellinienpunkten.
   * `ROAD_MESH.sampleSpacing` ist 2 m; 2 heißt 4 m. 25 km Netz → ~6 000 Knoten,
   * Dijkstra beim Setzen, nicht je Frame.
   */
  graphStride: 2,
  /** Kreuzungen ohne Junction-Tag: andere Straße, näher als das, wird verbunden. */
  linkMeters: 14,
  /** Ab diesem Abstand vom Band gilt der Spieler als runter, und die Route neu. */
  offRouteMeters: 48,
  offRouteSeconds: 0.8,

  /**
   * Querbeschleunigung der Linie, Anteil an `latG`. Unter 1, damit das Rot
   * etwas vor der physikalischen Grenze liegt — Forza: nach dem Rot ist es
   * zu spät, nicht erst in der Kurve.
   */
  lineLatFactor: 0.85,
  lineBrakeFactor: 0.8,
  lineDriveAccel: 6,
  lineCrestAccel: 0.55,
  lineMaxSpeed: 72,

  /**
   * Rot, sobald das Tempo die Ankunftsgrenze um so viele m/s überschreitet.
   * US8425293 nennt 5 m/s als Vollrot — hier 6, etwas weniger nervös.
   */
  redExcess: 6,
  amberExcess: 1.5,

  /** Screen-Pin: unter dieser Distanz reicht der Chip, das Schild stört. */
  pinHideMeters: 28,
  pinMarginX: 0.08,
  pinMarginY: 0.1,
  /** Ab diesem Richtungswechsel (rad) in den nächsten Metern: Turn-Hinweis. */
  turnLookahead: 70,
  turnAngle: 0.55,
  aroundAngle: 2.1,
} as const;
