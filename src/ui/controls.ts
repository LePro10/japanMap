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
  ['W A S D', 'walk'],
  ['Mouse', 'look around'],
  ['Space', 'jump'],
  ['Shift', 'run'],
  ['F', 'get in / out of the car'],
  ['R', 'back to the sakura bowl'],
  ['V', 'free camera'],
  ['Esc', 'menu'],
];

/** Freiflug — nur noch Debug, der Play-Knopf startet zu Fuß. */
export const FLY_CONTROLS: readonly (readonly [string, string])[] = [
  ['W A S D', 'move'],
  ['Mouse', 'look around'],
  ['Space / Ctrl', 'up / down'],
  ['Shift', 'five times faster'],
  ['Wheel', 'base speed 1–500 m/s'],
  ['F', 'ground collision on / off'],
  ['R', 'back to start'],
  ['V', 'get in the car'],
  ['Esc', 'menu'],
];

/**
 * Der Fahrmodus — die Belegung steht im Kopf von `DriveSystem`.
 *
 * Eine **eigene** Tabelle und keine Ergänzung der obigen: `R` und `V` bedeuten in
 * beiden Modi etwas anderes, und `W` heißt einmal „fliegen" und einmal „Gas".
 * Zwei Spalten in einer Tabelle wären die Sorte Anleitung, die niemand liest.
 */
export const DRIVE_CONTROLS: readonly (readonly [string, string])[] = [
  ['W / S', 'throttle / brake (reverse when stopped)'],
  ['A / D', 'steer'],
  ['Space', 'handbrake'],
  ['Mouse', 'look around'],
  ['C', 'view: chase / hood'],
  ['R', 'respawn on the nearest road'],
  ['F', 'get out'],
  ['V', 'free camera'],
  ['Esc', 'menu'],
];

/** Dieselbe Tabelle für Finger — die Belegung steht in `TouchControls`. */
export const TOUCH_CONTROLS: readonly (readonly [string, string])[] = [
  ['Drag left', 'walk (stick)'],
  ['Drag right', 'look around'],
  ['↑', 'jump'],
  ['🚗', 'get in / out of the car'],
  ['⟲', 'back to the sakura bowl'],
  ['☰', 'menu'],
];

/**
 * Der Fahrmodus am Finger.
 *
 * Das Bedienfeld **tauscht** im Auto seine Knöpfe: ▲/▼ und ⇩ sind dort ohne
 * Bedeutung, dafür kommt die Handbremse. `⟲` bleibt stehen und bedeutet
 * weiterhin „zurück auf Anfang" — im Auto heißt das „auf die nächste Straße".
 */
export const TOUCH_DRIVE_CONTROLS: readonly (readonly [string, string])[] = [
  ['Drag left', 'throttle / brake / steer'],
  ['Drag right', 'look around'],
  ['✋', 'handbrake'],
  ['⟲', 'auf die nächste Straße'],
  ['🚗', 'get out'],
  ['☰', 'menu'],
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
