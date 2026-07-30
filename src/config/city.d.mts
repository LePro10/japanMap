/**
 * Typen zu `city.mjs`.
 *
 * Die Implementierung ist reines ESM, damit `tools/gen-roads.mjs` und der
 * Renderer denselben Kasten und dieselbe Höhe sehen (Begründung dort im
 * Kopfkommentar). Diese Datei holt die Typprüfung zurück, ohne die Zahlen zu
 * verdoppeln.
 */

export interface CityDistrict {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly size: number;
}

export declare const CITY_DISTRICT: CityDistrict;

/** Höhe der Asphaltebene des Distrikts, in Metern. */
export declare const CITY_GROUND_Y: number;

/** Höhe der **Mittellinie** städtischer Strecken — um den Fahrbahnversatz tiefer. */
export declare const CITY_ROAD_LEVEL: number;

/** Höhe, auf die der Baker das Gelände im Distrikt legt (Schritt 5d). */
export declare const CITY_PAD_Y: number;

/** Auslaufstrecke der Einebnung in Metern. */
export declare const CITY_PAD_FEATHER: number;

export declare function inDistrict(x: number, z: number): boolean;

/** 1 im Distrikt, 0 weiter als `feather` außerhalb, dazwischen glatt. */
export declare function districtBlend(x: number, z: number, feather?: number): number;
