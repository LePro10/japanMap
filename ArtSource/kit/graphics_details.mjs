// Details atlas graphics (task 6): street details, race furniture, garage,
// discovery props. Names and texts invented or generic (no real companies).
// Imported by graphics.mjs (prefix DT_).

const JP = "'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif";
const MIN = "'Hiragino Mincho ProN',serif";
const EN = "Helvetica, Arial, sans-serif";
const vt = (chars, x, y0, step) => [...chars].map((c, i) => `<tspan x="${x}" y="${y0 + i * step}">${c}</tspan>`).join('');

// the raindrop mark of the game (same as the player's jacket)
const drop = (cx, cy, r, fg = '#e8661a', ring = '#e0d8c8') => `<g transform="translate(${cx},${cy})">
  <circle r="${r}" fill="none" stroke="${ring}" stroke-width="${r * 0.12}"/>
  <path d="M0,${-r * 0.62} C${r * 0.32},${-r * 0.18} ${r * 0.42},${r * 0.05} ${r * 0.42},${r * 0.22} A${r * 0.42},${r * 0.42} 0 1 1 ${-r * 0.42},${r * 0.22} C${-r * 0.42},${r * 0.05} ${-r * 0.32},${-r * 0.18} 0,${-r * 0.62} Z" fill="${fg}"/></g>`;

export const DETAILS = {
  // decorated manhole cover (design manhole): sakura over river waves, cast iron
  MANHOLE: [128, 128, `<rect width="128" height="128" fill="#3d3e40"/>
    <circle cx="64" cy="64" r="62" fill="#4a4b4e"/><circle cx="64" cy="64" r="56" fill="#55575a" stroke="#2c2d2f" stroke-width="2"/>
    ${[0, 1, 2, 3].map(i => `<path d="M14,${84 + i * 8} q12,-7 25,0 t25,0 t25,0 t25,0" fill="none" stroke="#3a3b3d" stroke-width="3"/>`).join('')}
    ${[[64, 50, 18], [36, 40, 10], [92, 38, 11], [44, 70, 8], [86, 66, 9]].map(([x, y, r]) => `<g transform="translate(${x},${y})" fill="#6c6e72" stroke="#2e2f31" stroke-width="1.2">
      ${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="${-r * 0.5}" rx="${r * 0.36}" ry="${r * 0.55}" transform="rotate(${a})"/>`).join('')}
      <circle r="${r * 0.22}" fill="#3a3b3d"/></g>`).join('')}
    <text x="64" y="118" font-family="${JP}" font-weight="700" font-size="9" fill="#2a2b2d" text-anchor="middle">おすい</text>`],
  // roadside tourist map (kankō annai-zu): coast, roads, the you-are-here dot
  MAP_PANEL: [128, 96, `<rect width="128" height="96" fill="#f1ede1"/>
    <rect x="0" y="0" width="128" height="16" fill="#1f4f7a"/>
    <text x="6" y="12" font-family="${JP}" font-weight="700" font-size="9" fill="#fff">観光案内図</text>
    <text x="122" y="12" font-family="${EN}" font-weight="700" font-size="7" fill="#fff" text-anchor="end">AREA MAP</text>
    <path d="M0,96 L0,70 q20,-6 32,4 t30,-2 t28,8 t38,-6 L128,96 Z" fill="#8cc3de"/>
    <path d="M0,40 q30,10 60,-2 t68,8" fill="none" stroke="#c9a76a" stroke-width="4"/>
    <path d="M58,16 q6,30 -6,56" fill="none" stroke="#c9a76a" stroke-width="3"/>
    <path d="M10,30 l10,-10 l10,10 Z M96,34 l12,-14 l12,14 Z" fill="#7a9a62"/>
    <rect x="70" y="46" width="8" height="6" fill="#b5402a"/><rect x="34" y="52" width="10" height="7" fill="#555"/>
    <circle cx="52" cy="44" r="4" fill="#e3261c" stroke="#fff" stroke-width="1.5"/>
    <text x="52" y="58" font-family="${JP}" font-weight="700" font-size="6" fill="#e3261c" text-anchor="middle">現在地</text>
    <text x="124" y="90" font-family="${EN}" font-size="6" fill="#1f4f7a" text-anchor="end">YOU ARE HERE ●</text>`],
  // paint chips board (garage): 4 x 4 swatches with codes
  PAINT_CHIPS: [128, 96, `<rect width="128" height="96" fill="#e9e7e0"/>
    <text x="64" y="11" font-family="${EN}" font-weight="700" font-size="8" fill="#222" text-anchor="middle" letter-spacing="1">COLOR SAMPLES</text>
    ${['#e9e8e3', '#a9acb0', '#17181a', '#9b1f22', '#22314f', '#3d6ea5', '#e8661a', '#e3b91d', '#2d6a46', '#9fcfc0', '#e3b6b8', '#5b4434', '#c9b996', '#6b2a6e', '#2fb5c9', '#cf1f5c']
      .map((c, i) => `<rect x="${8 + (i % 4) * 29}" y="${16 + Math.floor(i / 4) * 19}" width="25" height="13" fill="${c}" stroke="#999" stroke-width="0.6"/>
      <text x="${20 + (i % 4) * 29}" y="${33 + Math.floor(i / 4) * 19}" font-family="${EN}" font-size="4.5" fill="#333" text-anchor="middle">${['W01', 'S12', 'K02', 'R33', 'B21', 'B48', 'O05', 'Y11', 'G20', 'M07', 'P02', 'N13', 'C04', 'V09', 'T15', 'R70'][i]}</text>`).join('')}`],
  // construction A-board: the bowing worker (ojigi-man) apologising for the works
  KOJI: [64, 96, `<rect width="64" height="96" fill="#ffffff"/>
    <rect x="1" y="1" width="62" height="94" fill="none" stroke="#e8b41a" stroke-width="2"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<path d="M${i * 9 - 4},0 l8,0 l-8,8 l-8,0 Z" fill="#111" transform="translate(4,2)"/>`).join('')}
    <rect x="3" y="2" width="58" height="8" fill="#e8b41a" opacity="0.6"/>
    <text x="32" y="26" font-family="${JP}" font-weight="900" font-size="15" fill="#d0141f" text-anchor="middle">工事中</text>
    <g transform="translate(32,52)" fill="#1a1a1a"><circle cx="-2" cy="-12" r="4.5"/>
      <path d="M-3,-10 q-6,4 -2,10 l4,0 l-1,-4 l12,0 l0,-3 Z"/><path d="M-6,4 l-2,14 l3,0 l3,-12 l3,12 l3,0 l-3,-14 Z"/>
      <path d="M-8,-17 a6,4 0 0 1 12,0 Z" fill="#e8b41a"/></g>
    <text x="32" y="80" font-family="${JP}" font-weight="700" font-size="6.2" fill="#111" text-anchor="middle">ご迷惑をおかけします</text>
    <text x="32" y="90" font-family="${JP}" font-size="5" fill="#333" text-anchor="middle">ご協力をお願いします</text>`],
  // tide table board at the harbour
  TIDE: [64, 96, `<rect width="64" height="96" fill="#f4f2ea"/><rect width="64" height="14" fill="#1f63b0"/>
    <text x="32" y="11" font-family="${JP}" font-weight="700" font-size="9" fill="#fff" text-anchor="middle">潮見表</text>
    <path d="M4,40 q7,-16 14,0 t14,0 t14,0 t14,0" fill="none" stroke="#1f63b0" stroke-width="2"/>
    ${[0, 1, 2, 3, 4, 5].map(i => `<text x="6" y="${56 + i * 7}" font-family="${EN}" font-size="5" fill="#222">${['満潮 05:42', '干潮 11:58', '満潮 18:10', '干潮 --:--', 'TIDE  HIGH', 'TIDE  LOW'][i]}</text>`).join('')}`],
  // fire hydrant sign (shōkasen): red, vertical
  HYDRANT: [32, 64, `<rect width="32" height="64" fill="#d0141f"/><rect x="2" y="2" width="28" height="60" fill="none" stroke="#fff" stroke-width="1"/>
    <text font-family="${JP}" font-weight="900" font-size="12" fill="#fff" text-anchor="middle">${vt('消火栓', 16, 18, 15)}</text>
    <rect x="4" y="52" width="24" height="8" fill="#e8b41a"/>`],
  // life ring sign (kyūmei fukan)
  LIFERING: [32, 48, `<rect width="32" height="48" fill="#ffffff"/><rect width="32" height="12" fill="#1f63b0"/>
    <text x="16" y="9" font-family="${JP}" font-weight="700" font-size="6.5" fill="#fff" text-anchor="middle">救命浮環</text>
    <circle cx="16" cy="30" r="10" fill="none" stroke="#e8661a" stroke-width="5"/>
    <circle cx="16" cy="30" r="10" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="4 11.7"/>`],
  // bronze founder's plaque
  PLAQUE: [64, 48, `<rect width="64" height="48" fill="#7a5a2c"/><rect x="2" y="2" width="60" height="44" fill="#9a7638" stroke="#5a3f1c" stroke-width="1.2"/>
    <text x="32" y="18" font-family="${MIN}" font-weight="700" font-size="9" fill="#4a3216" text-anchor="middle">創業之地</text>
    <text x="32" y="30" font-family="${EN}" font-weight="700" font-size="6" fill="#4a3216" text-anchor="middle" letter-spacing="1">FOUNDED HERE</text>
    <text x="32" y="40" font-family="${EN}" font-size="6" fill="#4a3216" text-anchor="middle">1964</text>`],
  // old start-timing board of the retired circuit (unlit digits + five lamps)
  START_BOARD: [128, 48, `<rect width="128" height="48" fill="#141516"/>
    ${[0, 1, 2, 3, 4].map(i => `<circle cx="${18 + i * 23}" cy="12" r="7" fill="#3a0d0b" stroke="#555" stroke-width="1"/>`).join('')}
    <text x="64" y="40" font-family="Menlo, monospace" font-weight="700" font-size="17" fill="#5a1a14" text-anchor="middle">00:00.00</text>`],
  // lookout panorama panel: ridge line with the peaks named
  LOOKOUT: [128, 48, `<rect width="128" height="48" fill="#ece6d4"/>
    <path d="M0,40 L14,30 L22,33 L36,16 L46,26 L58,20 L72,8 L84,22 L98,18 L110,28 L128,24 L128,48 L0,48 Z" fill="#7d8a73"/>
    <path d="M0,40 L14,30 L22,33 L36,16 L46,26 L58,20 L72,8 L84,22 L98,18 L110,28 L128,24" fill="none" stroke="#2f3a2a" stroke-width="1.2"/>
    ${[[36, 16, '雨晴岳'], [72, 8, '霧ヶ峰'], [98, 18, '風森山']].map(([x, y, n]) => `<line x1="${x}" y1="${y - 2}" x2="${x}" y2="5" stroke="#333" stroke-width="0.5"/>
      <text x="${x}" y="5" font-family="${JP}" font-size="5" fill="#222" text-anchor="middle">${n}</text>`).join('')}`],
  CHECKER: [64, 64, `${[...Array(64).keys()].map(i => `<rect x="${(i % 8) * 8}" y="${Math.floor(i / 8) * 8}" width="8" height="8" fill="${(i + Math.floor(i / 8)) % 2 ? '#111' : '#f2f2ee'}"/>`).join('')}`],
  // race banners
  BANNER_MAIN: [256, 48, `<rect width="256" height="48" fill="#1f2a44"/><rect y="40" width="256" height="8" fill="#e8661a"/>
    ${drop(24, 21, 14)}<text x="148" y="27" font-family="${EN}" font-weight="900" font-size="18" fill="#ffffff" text-anchor="middle" letter-spacing="1.5">AMEAGARI DRIVE</text>
    <text x="148" y="37" font-family="${JP}" font-weight="700" font-size="7" fill="#e0d8c8" text-anchor="middle" letter-spacing="3">雨上がりドライブ</text>`],
  BANNER_START: [256, 48, `${[...Array(64).keys()].map(i => `<rect x="${(i % 32) * 8}" y="${Math.floor(i / 32) * 8}" width="8" height="8" fill="${(i + Math.floor(i / 32)) % 2 ? '#111' : '#f2f2ee'}"/>`).join('')}
    <rect y="16" width="256" height="32" fill="#1f2a44"/>
    <text x="128" y="41" font-family="${EN}" font-weight="900" font-size="21" fill="#ffffff" text-anchor="middle" letter-spacing="6">START · FINISH</text>`],
  BANNER_CP: [128, 32, `<rect width="128" height="32" fill="#e8661a"/>
    <text x="64" y="17" font-family="${EN}" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle" letter-spacing="2">CHECKPOINT</text>
    <text x="64" y="28" font-family="${JP}" font-weight="700" font-size="7" fill="#1f2a44" text-anchor="middle" letter-spacing="2">チェックポイント</text>`],
  BANNER_SPONSOR: [256, 48, `<rect width="256" height="48" fill="#e0d8c8"/>
    <text x="70" y="31" font-family="${EN}" font-weight="900" font-style="italic" font-size="18" fill="#1f2a44" text-anchor="middle">KAZEMORI</text>
    <text x="70" y="41" font-family="${EN}" font-size="6.5" fill="#1f2a44" text-anchor="middle" letter-spacing="2">TYRES</text>
    <rect x="132" y="6" width="2" height="36" fill="#1f2a44" opacity="0.4"/>
    <text x="196" y="29" font-family="${JP}" font-weight="900" font-size="16" fill="#b8333b" text-anchor="middle">峠オイル</text>
    <text x="196" y="40" font-family="${EN}" font-size="6.5" fill="#b8333b" text-anchor="middle" letter-spacing="2">TOGE OIL</text>`],
  GARAGE_SIGN: [256, 64, `<rect width="256" height="64" fill="#1f2a44"/><rect x="3" y="3" width="250" height="58" fill="none" stroke="#e8661a" stroke-width="2"/>
    ${drop(34, 32, 20)}<text x="150" y="34" font-family="${EN}" font-weight="900" font-size="26" fill="#ffffff" text-anchor="middle" letter-spacing="3">OPEN BAY</text>
    <text x="150" y="52" font-family="${JP}" font-weight="700" font-size="11" fill="#e0d8c8" text-anchor="middle" letter-spacing="3">チューニング・整備</text>`],
  PHONE: [64, 24, `<rect width="64" height="24" fill="#2e8b3e"/>
    <text x="32" y="15" font-family="${JP}" font-weight="700" font-size="11" fill="#fff" text-anchor="middle">公衆電話</text>
    <text x="32" y="22" font-family="${EN}" font-size="4.5" fill="#fff" text-anchor="middle" letter-spacing="1">PUBLIC TELEPHONE</text>`],
  POST: [48, 24, `<rect width="48" height="24" fill="#c8102e"/>
    <text x="13" y="17" font-family="${JP}" font-weight="900" font-size="15" fill="#fff" text-anchor="middle">〒</text>
    <text x="33" y="11" font-family="${JP}" font-weight="700" font-size="7" fill="#fff" text-anchor="middle">郵便</text>
    <text x="33" y="20" font-family="${EN}" font-weight="700" font-size="6" fill="#fff" text-anchor="middle">POST</text>`],
  SMOKING: [64, 32, `<rect width="64" height="32" fill="#1f63b0"/>
    <text x="32" y="16" font-family="${JP}" font-weight="700" font-size="11" fill="#fff" text-anchor="middle">喫煙所</text>
    <text x="32" y="26" font-family="${EN}" font-size="6" fill="#fff" text-anchor="middle" letter-spacing="1">SMOKING AREA</text>`],
  GOMI: [64, 32, `<rect width="64" height="32" fill="#f2efe4"/><rect width="64" height="9" fill="#2f7a3e"/>
    <text x="32" y="7" font-family="${JP}" font-weight="700" font-size="6" fill="#fff" text-anchor="middle">ごみ集積所</text>
    <text x="32" y="19" font-family="${JP}" font-weight="700" font-size="6" fill="#222" text-anchor="middle">燃えるごみ 月・木</text>
    <text x="32" y="28" font-family="${JP}" font-weight="700" font-size="6" fill="#222" text-anchor="middle">資源ごみ 水</text>`],
};
