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
    label: 'Neon City',
    detail: 'City streets',
    x: 620,
    z: 120,
    icon: 'city',
    labelMinPx: 520,
  },
  {
    id: 'tempel',
    label: 'Hillside Temple',
    detail: 'Torii approach',
    x: 820,
    z: -940,
    icon: 'temple',
    labelMinPx: 540,
  },
  {
    id: 'bergpass',
    label: 'Mountain Pass',
    detail: 'Hairpin roads',
    x: -536,
    z: -495,
    icon: 'mountain',
    labelMinPx: 600,
  },
  {
    id: 'reisfelder',
    label: 'Western Paddies',
    detail: 'Rice terraces',
    x: -760,
    z: 60,
    icon: 'paddy',
    labelMinPx: 560,
  },
  {
    id: 'fischerdorf',
    label: 'Tideglass Harbour',
    detail: 'Working port and boats',
    x: 780,
    z: 1030,
    icon: 'village',
    labelMinPx: 620,
  },
  {
    id: 'kueste',
    label: 'South Coast',
    detail: 'Ocean shore',
    x: 100,
    z: 1400,
    icon: 'coast',
    labelMinPx: 660,
  },
  {
    id: 'wald',
    label: 'Highland Forest',
    detail: 'Wooded plateau',
    x: 790,
    z: -760,
    icon: 'forest',
    labelMinPx: 700,
  },
  { id: 'stillwater', label: 'Stillwater Village', detail: 'Walk-in mill, pond and bent stone lane', x: -1244, z: 409, icon: 'village', labelMinPx: 620 },
] as const;

export function formatMapDistance(meters: number): string {
  const distance = Math.max(0, meters);
  if (distance < 999.5) return `${Math.round(distance)} m`;
  return `${(distance / 1000).toFixed(1)} km`;
}
