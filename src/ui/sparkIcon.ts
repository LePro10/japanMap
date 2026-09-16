/**
 * Das Sparks-Zeichen — ein Original, kein ¥ und keine Münze.
 *
 * ASTRA_PLAN §9, bei 16 px: eine Raute, zwei Facetten, eine dünne Falte.
 * Die erste Fassung war zwei versetzte Polygone plus ein dicker Keil — unter
 * 20 px las sich das als Riss, nicht als Kristall. Welt-Token, HUD, Shop und
 * Garage teilen **dieselbe** Silhouette.
 *
 * SVG statt PNG, weil die Oberfläche DOM ist und bei jeder Pixeldichte scharf
 * bleiben muss. `currentColor` ist bewusst nicht die Füllung: die zwei Töne
 * und die Kerbe sind das Zeichen; einfarbig würde es zur Raute.
 */
export const SPARK_ICON = `<svg class="spark-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="spark-icon__a" d="M12 2 4.2 12 12 22 12 2z"/><path class="spark-icon__b" d="M12 2 19.8 12 12 22 12 2z"/><path class="spark-icon__notch" d="M12 4.4 12.85 12 12 19.6 11.15 12z"/></svg>`;

/** Ikon plus Betrag — eine Zeile, überall wo Sparks einen Preis tragen. */
export function sparkMark(amount: number): string {
  return `<span class="spark-mark">${SPARK_ICON}<span>${amount.toLocaleString('en-US')}</span></span>`;
}
