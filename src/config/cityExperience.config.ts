/** Distance budgets for secondary architecture. Navigation and collision never depend on a preset. */
export const CITY_EXPERIENCE = {
  cellSize: 72,
  // Neo-Tokio (docs/TOKYO.md): die Reichweiten stammen aus der offenen 360-m-
  // Stadt mit 334 Häusern, in der man 600 m weit über Plätze sah. Im dichten
  // Raster stehen 2837 Häuser, und außer der Straßenflucht verdecken sie alles.
  // Gemessen mit den alten Werten auf Ultra an der Meiji-dōri: Ausstattung
  // 136 Draw-Calls / 472k Dreiecke — mehr als die Stadt selbst (13 / 391k).
  ranges: {
    ultra: { essential: 320, detail: 150 },
    high: { essential: 250, detail: 110 },
    medium: { essential: 190, detail: 80 },
    low: { essential: 140, detail: 55 },
    minimal: { essential: 110, detail: 35 },
    custom: { essential: 250, detail: 110 },
  },
  // Neo-Tokio v2: die Namen der Entdeckungskarte folgen den Vierteln aus
  // `tokyoLayout.mjs` (DISTRICTS, gleiche ids). Vorher standen hier die fünf
  // Bezirke der alten Stadt — „Old Neon" mitten in Ginza.
  districts: {
    'west-shinjuku': {name:'Nishi Towers',kanji:'西新宿',description:'Glass towers · Nishi Park · the business district after hours',color:0x70aab5},
    'kabukicho': {name:'Kabukichō',kanji:'歌舞伎町',description:'Sign towers · Hanamichi-dōri · the cinema plaza',color:0xe85876},
    'golden-gai': {name:'Golden Gai',kanji:'ゴールデン街',description:'Five-metre alleys · tiny bars · red lanterns',color:0xd79555},
    'omoide': {name:'Omoide Yokochō',kanji:'思い出横丁',description:'The smoky alley beside the tracks',color:0xd79555},
    'shibuya': {name:'Shibuya Scramble',kanji:'渋谷',description:'The crossing · video walls · Kōen-dōri up the hill',color:0x4fa3d9},
    'shuto': {name:'Under the Shuto',kanji:'首都高下',description:'Workshops and garages under the expressway',color:0x8a96a0},
    'akiba': {name:'Akiba Electric',kanji:'秋葉原',description:'Electric town · game centres · the diagonal Denki-gai',color:0x3fd6a8},
    'ginza': {name:'Ginza',kanji:'銀座',description:'Boulevards · flagship stores · orderly blocks',color:0xe7c675},
    'minato': {name:'Minato Hills',kanji:'港区',description:'Hill lanes · Hikawa shrine · quiet homes under the wires',color:0x7dbba2},
    'nishi-south': {name:'Nishi Park Side',kanji:'西公園',description:'Homes along Nishi Park',color:0x7dbba2},
    'outskirts': {name:'Outskirts',kanji:'郊外',description:'Suburbs · gardens · the road out of town',color:0xa7b98a},
  },
  palette: { metal:0x283139, wood:0x664333, stone:0x656b6d, cream:0xd5cbb6, warm:0xffc577, cyan:0x86d6de },
} as const;
