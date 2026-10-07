/**
 * Das Sparks-Zeichen — ein Original, kein ¥ und keine Münze.
 *
 * Vierzackiger Stern, lesbar bei 16 px. Die Raute mit dunkler Falte las sich
 * als Riss; zwei überlagerte Rauten ohne Kerbe sind dasselbe Wort wie die
 * Währung. Der 3D-Kristall bleibt die Weltform — HUD und Shop teilen
 * **dieses** Zeichen.
 *
 * SVG statt PNG, weil die Oberfläche DOM ist und bei jeder Pixeldichte scharf
 * bleiben muss.
 */
export const SPARK_ICON = `<svg class="spark-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="spark-icon__b" d="M2 12 12 8.6 22 12 12 15.4z"/><path class="spark-icon__a" d="M12 1.6 15.4 12 12 22.4 8.6 12z"/></svg>`;

/** Ikon plus Betrag — eine Zeile, überall wo Sparks einen Preis tragen. */
export function sparkMark(amount: number): string {
  return `<span class="spark-mark">${SPARK_ICON}<span>${amount.toLocaleString('en-US')}</span></span>`;
}
