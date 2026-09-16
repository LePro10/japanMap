/**
 * Das Sparks-Zeichen — ein Original, kein ¥ und keine Münze.
 *
 * ASTRA_PLAN §9: zwei versetzte Bernstein-Facetten mit dunkler Kerbe, lesbar
 * bei 16 px. Welt-Token, HUD, Shop und Garage teilen **dieselbe** Silhouette,
 * sonst liest sich das eingesammelte Ding als etwas anderes als der Kontostand.
 *
 * SVG statt PNG, weil die Oberfläche DOM ist und bei jeder Pixeldichte scharf
 * bleiben muss. `currentColor` ist bewusst nicht die Füllung: die zwei Töne
 * und die Kerbe sind das Zeichen; einfarbig würde es zur Raute.
 */
export const SPARK_ICON = `<svg class="spark-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="spark-icon__a" d="M3.6 11.4 11.2 2.2 12.6 8.1 9.4 21.2z"/><path class="spark-icon__b" d="M12.1 7.4 20.6 10.2 13.2 21.4 10 13.1z"/><path class="spark-icon__notch" d="M11.05 6.6 13.15 7.55 11.35 18.9 9.7 17.85z"/></svg>`;

/** Ikon plus Betrag — eine Zeile, überall wo Sparks einen Preis tragen. */
export function sparkMark(amount: number): string {
  return `<span class="spark-mark">${SPARK_ICON}<span>${amount.toLocaleString('en-US')}</span></span>`;
}
