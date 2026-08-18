/**
 * Maße der Fingersteuerung — PLAN.md P12 / 12.4.
 *
 * Magische Zahlen gehören nach `src/config/` (CLAUDE.md), und bei einer
 * Eingabe ist das besonders wichtig: jeder dieser Werte ist ein Gefühl, das
 * sich nur am Gerät prüfen lässt. Sie stehen hier, damit man sie an *einer*
 * Stelle nachziehen kann, statt sie im Ereignis-Code zu suchen.
 */
export const TOUCH = {
  /**
   * Anteil der Bildbreite, der dem Stick gehört. Rechts davon wird geschaut.
   *
   * Bewusst kein halbes Bild: im Querformat liegt der linke Daumen weit außen,
   * und die Blickhälfte ist die, in der man etwas *sehen* will. 45 % gibt dem
   * Stick genug Fläche, ohne das Bild in der Mitte zu teilen.
   */
  stickZone: 0.45,

  /**
   * Radius des Sticks in CSS-Pixeln — der Weg vom Aufsetzpunkt bis Vollgas.
   *
   * 56 px sind rund 9 mm auf einem üblichen Telefon. Kleiner wird der Stick
   * zappelig (jede Daumenbewegung ist Vollgas), größer erreicht der Daumen den
   * Rand nicht mehr, ohne die Hand zu verschieben.
   */
  stickRadius: 56,

  /**
   * Anteil des Ausschlags, der als „nicht bewegt" gilt.
   *
   * Ein aufliegender Daumen wandert um ein bis zwei Pixel, und ohne Totzone
   * kriecht die Kamera dauernd. 0,12 von 56 px sind knapp 7 px — über dem
   * Zittern, unter einer gewollten Bewegung.
   */
  deadzone: 0.12,

  /**
   * Faktor auf den Wischweg beim Umsehen.
   *
   * Die Maus liefert `movementX` in Gerätepixeln bei gefangenem Zeiger, ein
   * Finger liefert CSS-Pixel eines viel kleineren Schirms. Ohne diesen Faktor
   * bräuchte man auf dem Telefon drei Wische für eine Vierteldrehung. Er sitzt
   * hier und nicht in `LOOK_SENSITIVITY`, damit Maus und Finger getrennt
   * einstellbar bleiben.
   */
  lookScale: 2.2,

  /**
   * Exponent der Zoom-Geste aufs Grundtempo.
   *
   * Unter 1, weil `scaleSpeed` bereits multiplikativ arbeitet: eine Geste, die
   * den Fingerabstand verdoppelt, soll das Tempo nicht verdoppeln, sondern um
   * rund 60 % anheben. Sonst ist man nach einer Handbewegung bei 500 m/s.
   */
  pinchStrength: 0.7,
} as const;
