/**
 * Wem gehört die Tastatur gerade — dem Spiel oder dem Menü?
 *
 * Bis 2026-09-26 hingen `FreeFlyController` und `DriveSystem` ihre Tasten an
 * `document.pointerLockElement` (Sperre seit P10.2: das Menü liegt über dem
 * Bild, eine Taste dort gehört dem Menü). Die Begründung stimmt, die Größe
 * war die falsche: der gefangene Zeiger ist ein **Mittel** für Mausblick,
 * nicht der Zustand „es wird gespielt". Scheiterte der Lock — beim Start im
 * Vollbild-Wechsel, nach Escape im Menü (Escape zählt in Chrome nicht als
 * Nutzergeste), nach einem Tab-Wechsel —, lief das Spiel ohne Menü und nahm
 * trotzdem keine Taste an. Der Spieler musste „erst ins Bild klicken".
 *
 * Jetzt entscheidet der Spielzustand: `PlayerUi` meldet sich hier mit seinem
 * `playing` an. Ohne Oberfläche (Prüfstände, frühe Dev-Wege) gilt das alte
 * Kriterium weiter.
 */
let source: (() => boolean) | null = null;

export function setGameInputSource(next: (() => boolean) | null): void {
  source = next;
}

export function gameInputActive(): boolean {
  return source ? source() : document.pointerLockElement !== null;
}
