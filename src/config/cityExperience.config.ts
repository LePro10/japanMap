/** Distance budgets for secondary architecture. Navigation and collision never depend on a preset. */
export const CITY_EXPERIENCE = {
  cellSize: 72,
  ranges: {
    ultra: { essential: 620, detail: 190 },
    high: { essential: 480, detail: 140 },
    medium: { essential: 340, detail: 100 },
    low: { essential: 240, detail: 65 },
    minimal: { essential: 180, detail: 40 },
    custom: { essential: 480, detail: 140 },
  },
  districts: [
    {name:'Old Neon',kanji:'夜街',description:'Crosslight Crossing · lantern lanes · late-night shops',color:0xe85876},
    {name:'Hill Steps',kanji:'丘町',description:'Terraced homes · quiet courtyards · Beacon Tower',color:0xe7b675},
    {name:'East Lantern',kanji:'東灯',description:'Garden streets · balconies · the quiet side of the city',color:0x7dbba2},
    {name:'South Market',kanji:'南市場',description:'Open market halls · workshops · the road to Tideglass',color:0xd79555},
    {name:'West Works',kanji:'西工房',description:'Small workshops · Rotor Court · roads to the hills',color:0x70aab5},
  ],
  palette: { metal:0x283139, wood:0x664333, stone:0x656b6d, cream:0xd5cbb6, warm:0xffc577, cyan:0x86d6de },
} as const;
