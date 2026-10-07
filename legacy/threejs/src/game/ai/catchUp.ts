/**
 * Gummiband-Faktor aus Slot-Fehler.
 *
 * `gap` = Spielerfortschritt − Gegnerfortschritt, positiv = Gegner hinten.
 * Totzone ±12 m um den Slot (Game AI Pro Kap. 42, Region c): nah am Spieler
 * ist das Band aus, sonst sieht man es im Spiegel. Hinter dem Slot bis +10 %,
 * davor nur −6 % — wer führt, soll führen dürfen.
 *
 * Gemessen: tot 1,00, 80 m hinten 1,089, 80 m vorn 0,96.
 */
export function catchUpFactor(gap: number, slot: number, rubber: number): number {
  // Slot positiv = der Gegner will vorn liegen. Sollfortschritt = Spieler + Slot,
  // Fehler = wie weit er hinter diesem Soll zurück ist.
  const error = gap + slot;
  if (Math.abs(error) < 12) return 1;
  if (error > 0) return 1 + clamp(error / 90, 0, 1) * 0.10 * rubber;
  return 1 + clamp(error / 120, -1, 0) * 0.06 * rubber;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
