export type MapLandmarkIcon =
  | 'city'
  | 'temple'
  | 'mountain'
  | 'paddy'
  | 'village'
  | 'coast'
  | 'forest'
  | 'garage'
  | 'drift';

export interface MapLandmark {
  readonly id: string;
  readonly label: string;
  readonly kanji: string;
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
 *
 * Namen sind Spielernamen, keine Debug-IDs: Forza hängt Landmarken-Schilder
 * an echte Orte, nicht an generische „City / Forest"-Stempel.
 */
export const MAP_LANDMARKS: readonly MapLandmark[] = [
  { id: 'komorebi-diner', label: 'Komorebi Diner', kanji: '食堂', detail: 'Walk inside · counter seats and a warm kitchen', x: 505, z: 35, icon: 'village', labelMinPx: 720 },
  { id: 'corner-mart', label: 'Kōji Corner Mart', kanji: '小路', detail: 'Walk inside · neighborhood shop', x: 644, z: 145, icon: 'village', labelMinPx: 800 },
  { id: 'rain-garden', label: 'Rain Garden', kanji: '庭', detail: 'Pond bridge · pavilion · lantern paths', x: 705, z: 48, icon: 'forest', labelMinPx: 740 },
  { id: 'beacon-tower', label: 'Beacon Tower', kanji: '灯台', detail: 'Twin fins above the hillside courtyard', x: 1116.731, z: -322.865, icon: 'city', labelMinPx: 660 },
  { id: 'market-hall', label: 'Market Hall', kanji: '市場', detail: 'Open timber hall and produce stalls', x: 474.253, z: 723.877, icon: 'village', labelMinPx: 700 },
  { id: 'rotor-court', label: 'Rotor Court', kanji: '工房', detail: 'Workshop courtyard and rotary sculpture', x: 205.149, z: 265.145, icon: 'drift', labelMinPx: 700 },
  {
    id: 'stadt',
    label: 'Yoru Ward',
    kanji: '夜街',
    detail: 'Neon streets after rain',
    x: 620,
    z: 120,
    icon: 'city',
    labelMinPx: 520,
  },
  {
    id: 'tempel',
    label: 'Red Gate',
    kanji: '鳥居',
    detail: 'Torii on the ridge',
    x: 820,
    z: -940,
    icon: 'temple',
    labelMinPx: 540,
  },
  {
    id: 'bergpass',
    label: 'Tōge Seven',
    kanji: '峠',
    detail: 'Hairpins in the cloud',
    x: -536,
    z: -495,
    icon: 'mountain',
    labelMinPx: 600,
  },
  {
    id: 'reisfelder',
    label: 'Mizuta Steps',
    kanji: '水田',
    detail: 'Flooded rice terraces',
    x: -760,
    z: 60,
    icon: 'paddy',
    labelMinPx: 560,
  },
  {
    id: 'fischerdorf',
    label: 'Tideglass',
    kanji: '港',
    detail: 'Working harbour',
    x: 780,
    z: 1030,
    icon: 'village',
    labelMinPx: 620,
  },
  {
    id: 'kueste',
    label: 'Kuroshio',
    kanji: '黒潮',
    detail: 'Open ocean shore',
    x: 100,
    z: 1400,
    icon: 'coast',
    labelMinPx: 660,
  },
  {
    id: 'wald',
    label: 'Cedar High',
    kanji: '杉',
    detail: 'Wooded plateau',
    x: 790,
    z: -760,
    icon: 'forest',
    labelMinPx: 700,
  },
  {
    id: 'stillwater',
    label: 'Stillwater',
    kanji: '静水',
    detail: 'Mill, pond, bent stone lane',
    x: -1244,
    z: 409,
    icon: 'village',
    labelMinPx: 620,
  },
  {
    id: 'commons',
    label: 'Petal Commons',
    kanji: '花',
    detail: 'Garage, Open Bay, start bowl',
    x: 550,
    z: 510,
    icon: 'garage',
    labelMinPx: 540,
  },
] as const;

export function formatMapDistance(meters: number): string {
  const distance = Math.max(0, meters);
  if (distance < 999.5) return `${Math.round(distance)} m`;
  return `${(distance / 1000).toFixed(1)} km`;
}

export function nearestLandmark(x: number, z: number, max = 160): MapLandmark | null {
  let closest: MapLandmark | null = null;
  let best = max;
  for (const landmark of MAP_LANDMARKS) {
    const d = Math.hypot(landmark.x - x, landmark.z - z);
    if (d < best) {
      best = d;
      closest = landmark;
    }
  }
  return closest;
}
