/**
 * Die Steuerungstabellen — eine Quelle für Startbildschirm und Pausenmenü.
 *
 * **Warum eine eigene Datei.** Bis P13 standen dieselben zwei Tabellen in
 * `PlayerUi` und wurden dort zweimal ausgegeben (Hinweiskasten und Menü). Seit
 * der Hinweiskasten dem Startbildschirm gewichen ist, braucht sie eine dritte
 * Stelle — und drei Kopien einer Tastenbelegung laufen garantiert auseinander.
 * Die Belegung selbst steht im Kopf von `FreeFlyController` bzw.
 * `TouchControls`; hier steht nur, wie sie einem Nutzer erklärt wird.
 */

/** Tastatur und Maus — dieselbe Belegung wie im Kopf von `FreeFlyController`. */
export const CONTROLS: readonly (readonly [string, string])[] = [
  ['W A S D', 'bewegen'],
  ['Maus', 'umsehen'],
  ['Leertaste / Strg', 'hoch / runter'],
  ['Umschalt', 'fünffaches Tempo'],
  ['Mausrad', 'Grundtempo 1–500 m/s'],
  ['F', 'Bodenkollision an / aus'],
  ['R', 'zurück zum Start'],
  ['V', 'ins Auto steigen'],
  ['Esc', 'Menü'],
];

/**
 * Der Fahrmodus — die Belegung steht im Kopf von `DriveSystem`.
 *
 * Eine **eigene** Tabelle und keine Ergänzung der obigen: `R` und `V` bedeuten in
 * beiden Modi etwas anderes, und `W` heißt einmal „fliegen" und einmal „Gas".
 * Zwei Spalten in einer Tabelle wären die Sorte Anleitung, die niemand liest.
 */
export const DRIVE_CONTROLS: readonly (readonly [string, string])[] = [
  ['W / S', 'Gas / Bremse (im Stand: Rückwärtsgang)'],
  ['A / D', 'lenken'],
  ['Leertaste', 'Handbremse'],
  ['Maus', 'umsehen'],
  ['C', 'Ansicht: Verfolger / Haube'],
  ['R', 'auf die nächste Straße setzen'],
  ['V', 'zurück zum Freiflug'],
  ['Esc', 'Menü'],
];

/** Dieselbe Tabelle für Finger — die Belegung steht in `TouchControls`. */
export const TOUCH_CONTROLS: readonly (readonly [string, string])[] = [
  ['Links ziehen', 'bewegen (Stick)'],
  ['Rechts ziehen', 'umsehen'],
  ['Zwei Finger rechts', 'Tempo'],
  ['▲ / ▼', 'steigen / sinken'],
  ['⟲ / ⇩', 'Start / Bodenkollision'],
  ['☰', 'Menü'],
];

/**
 * Hat das Gerät einen Finger als Zeiger?
 *
 * **Nicht `pointer: coarse` allein**, aus demselben Grund wie in
 * `TouchControls`: ein Laptop mit Touchscreen meldet `fine`, weil die Maus das
 * genauere Zeigegerät ist. Für die *Anzeige* darf das ruhig großzügig sein — ein
 * Gerät, das beides kann, bekommt beide Tabellen.
 */
export function hasTouch(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

/** Eine Tabelle als HTML. `class` bekommt die Tabelle vom Aufrufer. */
export function controlTable(
  rows: readonly (readonly [string, string])[],
  className: string,
): string {
  const body = rows.map(([key, what]) => `<tr><th>${key}</th><td>${what}</td></tr>`).join('');
  return `<table class="${className}">${body}</table>`;
}
