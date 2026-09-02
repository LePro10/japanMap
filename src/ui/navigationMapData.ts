export type MapLandmarkIcon =
  | 'city'
  | 'temple'
  | 'mountain'
  | 'paddy'
  | 'village'
  | 'coast'
  | 'forest';

export interface MapLandmark {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly x: number;
  readonly z: number;
  readonly icon: MapLandmarkIcon;
  /** Ab welcher Kartenbreite der Text neben dem Icon stehen darf. */
  readonly labelMinPx: number;
}

/**
 * Markante Orte der echten Karte. Die Koordinaten kommen aus den Generator-
 * Zonen bzw. den reproduzierbaren Viewpoints; hier werden keine Fantasie-POIs
 * auf die Karte gestreut.
 */
export const MAP_LANDMARKS: readonly MapLandmark[] = [
  {
    id: 'stadt',
    label: 'Stadt',
    detail: 'Neonviertel',
    x: 620,
    z: 120,
    icon: 'city',
    labelMinPx: 520,
  },
  {
    id: 'tempel',
    label: 'Tempel',
    detail: 'Torii-Aufgang',
    x: 820,
    z: -940,
    icon: 'temple',
    labelMinPx: 540,
  },
  {
    id: 'bergpass',
    label: 'Bergpass',
    detail: 'Serpentinen',
    x: -536,
    z: -495,
    icon: 'mountain',
    labelMinPx: 600,
  },
  {
    id: 'reisfelder',
    label: 'Reisfelder',
    detail: 'Terrassen',
    x: -760,
    z: 60,
    icon: 'paddy',
    labelMinPx: 560,
  },
  {
    id: 'fischerdorf',
    label: 'Fischerdorf',
    detail: 'Steg & Boote',
    x: 780,
    z: 1030,
    icon: 'village',
    labelMinPx: 620,
  },
  {
    id: 'kueste',
    label: 'Küste',
    detail: 'Südküste',
    x: 100,
    z: 1400,
    icon: 'coast',
    labelMinPx: 660,
  },
  {
    id: 'wald',
    label: 'Wald',
    detail: 'Hochebene',
    x: 790,
    z: -760,
    icon: 'forest',
    labelMinPx: 700,
  },
] as const;

export function formatMapDistance(meters: number): string {
  const distance = Math.max(0, meters);
  if (distance < 999.5) return `${Math.round(distance)} m`;
  return `${(distance / 1000).toFixed(1)} km`;
}
