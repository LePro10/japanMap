/**
 * Haken für gesetzte Kirschen — Commons-Schale und Stadt-Dressing.
 *
 * Die Streuung besitzt LOD, Imposter und Bruch. CityPlaces und StuntSystem
 * kennen die *Standorte*, nicht die Zeichenstufen. Der Haken ist absichtlich
 * ein Modul statt eines neuen Systems: ein zweites Canopy-System wäre eine
 * zweite Abfrage in DriveSystem und zwei Stellen, an denen `breakTree`
 * vergessen wird.
 *
 * `placeAuthoredCherry` liefert `false`, solange die Streuung nicht läuft
 * (Prüfstände ohne Renderer). Dann backt CityPlaces die Kirsche wie bisher
 * in den Kit — der Test sieht denselben Stand wie vor dem Haken.
 */

export interface AuthoredCherry {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly height: number;
  readonly seed: number;
}

type Sink = (tree: AuthoredCherry) => void;

let sink: Sink | null = null;

export function setAuthoredCherrySink(next: Sink | null): void {
  sink = next;
}

export function placeAuthoredCherry(tree: AuthoredCherry): boolean {
  if (!sink) return false;
  sink(tree);
  return true;
}
