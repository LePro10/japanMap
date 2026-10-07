/** Typen zu `tokyoLayout.mjs` — Begründung dort im Kopfkommentar. */

export type StreetClass = 'boulevard' | 'avenue' | 'street' | 'lane' | 'alley';
export type Point2 = readonly [number, number];

export declare const RING_GRADE_Z: number;
export declare const STREET_CLASS: Readonly<Record<StreetClass, number>>;
export declare const CITY_CIRCUIT: {
  readonly width: number;
  readonly radius: number;
  readonly corners: readonly Point2[];
};
export declare const SCRAMBLE: { readonly x: number; readonly z: number; readonly radius: number };
export type StreetDef = readonly [string, StreetClass, readonly Point2[], number?];
export declare const GRID_STREETS: readonly StreetDef[];
export declare function streetPoints(street: StreetDef, step?: number): [number, number][];
export type OpenSpaceType = 'park' | 'shrine' | 'plaza' | 'parking';
export interface OpenSpace {
  readonly id: string;
  readonly type: OpenSpaceType;
  readonly polygon: readonly Point2[];
}
export declare const OPEN_SPACES: readonly OpenSpace[];
export declare function filletOpen(points: readonly Point2[], radius: number, step?: number): [number, number][];
export declare const EDGE_ROUTES: readonly (readonly [string, number, readonly Point2[]])[];

export type DistrictStyle =
  | 'towers'
  | 'neon'
  | 'yokocho'
  | 'scramble'
  | 'underpass'
  | 'electric'
  | 'ginza'
  | 'residential';

export interface TokyoDistrict {
  readonly id: string;
  readonly name: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly style: DistrictStyle;
}
export declare const DISTRICTS: readonly TokyoDistrict[];

export declare const LANDMARKS: {
  readonly tower: { readonly x: number; readonly z: number; readonly height: number };
};

export type SpecialSite =
  | { readonly id: string; readonly type: 'cylinder'; readonly x: number; readonly z: number; readonly radius: number; readonly floors: number }
  | {
      readonly id: string;
      readonly type: 'tower' | 'station';
      readonly minX: number;
      readonly maxX: number;
      readonly minZ: number;
      readonly maxZ: number;
      readonly floors: number;
    };
export declare const SPECIAL_SITES: readonly SpecialSite[];
export declare const RAIL_LINE: {
  readonly x: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly width: number;
  readonly deck: number;
};
export declare const KABUKI_GATE: { readonly x: number; readonly z: number; readonly span: number; readonly height: number };

export declare const URBAN_FADE: number;
export declare const CORE_BOX: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
export declare function urbanity(x: number, z: number, box?: typeof CORE_BOX): number;
export declare function densify(points: readonly Point2[], step?: number): [number, number][];
export declare function filletLoop(corners: readonly Point2[], radius: number, step?: number): [number, number][];

export interface InteriorSite {
  readonly id: 'diner' | 'mart';
  readonly dx: number;
  readonly dz: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}
export declare const INTERIOR_SITES: readonly InteriorSite[];
export declare function interiorOffset(oldX: number): InteriorSite;
