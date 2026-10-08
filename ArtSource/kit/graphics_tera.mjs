// TeraShop atlas graphics: temples and shrines (Seiran-ji temple, Amemiya
// shrine - both invented). Plaques, interiors, flags, lanterns, ema, the
// offering box, the shrine notice board. Imported by graphics.mjs (prefix TE_).

const JP = "'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif";
const MIN = "'Hiragino Mincho ProN',serif";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const vt = (chars, x, y0, step) => [...chars].map((c, i) => `<tspan x="${x}" y="${y0 + i * step}">${c}</tspan>`).join('');

const INT = {
  // main hall seen through the open doors: dark hall, gilt altar canopy, a seated figure as a gold silhouette, candles, hanging lamps
  HONDO: (() => {
    let s = `<rect width="256" height="128" fill="#140e0a"/><rect width="256" height="14" fill="#0a0705"/>`;
    for (const x of [20, 236]) s += `<rect x="${x - 6}" y="14" width="12" height="114" fill="#2a1a10"/>`;
    s += `<rect x="70" y="18" width="116" height="10" fill="#8a6a2a"/><path d="M64,28 h128 l-8,8 h-112 Z" fill="#b8923a"/>`;
    for (let i = 0; i < 9; i++) s += `<rect x="${74 + i * 13}" y="36" width="2" height="${10 + (i % 2) * 6}" fill="#c9a24a"/>`;
    s += `<ellipse cx="128" cy="62" rx="22" ry="26" fill="#d8b04a" opacity="0.35"/>`;
    s += `<path d="M128,44 c8,0 10,8 9,14 c10,4 16,14 18,28 h-54 c2,-14 8,-24 18,-28 c-1,-6 1,-14 9,-14 Z" fill="#c99a3a"/>`;
    s += `<rect x="96" y="86" width="64" height="8" fill="#8a6a2a"/><rect x="88" y="94" width="80" height="16" fill="#3a2414"/><rect x="88" y="94" width="80" height="3" fill="#b8923a"/>`;
    for (const x of [92, 164]) s += `<rect x="${x - 2}" y="78" width="4" height="16" fill="#e8e0c8"/><ellipse cx="${x}" cy="74" rx="3" ry="5" fill="#ffd27a"/>`;
    for (const x of [46, 210]) s += `<line x1="${x}" y1="14" x2="${x}" y2="40" stroke="#6a4a20" stroke-width="1"/><rect x="${x - 7}" y="40" width="14" height="18" rx="3" fill="#d8a040"/><rect x="${x - 7}" y="40" width="14" height="18" rx="3" fill="#ffd890" opacity="0.5"/>`;
    s += `<rect y="110" width="256" height="18" fill="#2a1c12"/><rect y="110" width="256" height="2" fill="#4a3220"/>`;
    return s;
  })(),
  // prayer hall of the shrine: bare wood, round mirror on the altar, gohei, white curtain, lamps
  HAIDEN: (() => {
    let s = `<rect width="256" height="128" fill="#2a1e14"/><rect width="256" height="12" fill="#1a120c"/>`;
    for (let x = 0; x < 256; x += 32) s += `<rect x="${x}" y="12" width="2" height="80" fill="#1e150e"/>`;
    s += `<rect x="40" y="16" width="176" height="18" fill="#efeadf"/>`;
    for (let x = 44; x < 214; x += 18) s += `<path d="M${x},16 v18 h14 v-18" fill="none" stroke="#d8d0c0" stroke-width="1"/>`;
    s += `<rect x="96" y="54" width="64" height="40" fill="#3a2a1a"/><rect x="100" y="58" width="56" height="4" fill="#6a5030"/>`;
    s += `<circle cx="128" cy="70" r="12" fill="#c9c2a8"/><circle cx="128" cy="70" r="9" fill="#efe9d2"/>`;
    for (const x of [108, 148]) s += `<rect x="${x - 1}" y="44" width="2" height="30" fill="#c9a24a"/><path d="M${x},46 l6,4 l-6,4 l6,4 l-6,4" fill="none" stroke="#f4f0e4" stroke-width="2.5"/>`;
    for (const x of [30, 226]) s += `<rect x="${x - 6}" y="50" width="12" height="20" fill="#e8d8a8"/><rect x="${x - 6}" y="50" width="12" height="20" fill="#fff0c0" opacity="0.6"/>`;
    s += `<rect y="94" width="256" height="34" fill="#4a3624"/>`;
    for (let x = 0; x < 256; x += 24) s += `<rect x="${x}" y="94" width="1" height="34" fill="#3a2a1a"/>`;
    return s;
  })(),
  // amulet counter (juyosho): rows of omamori in brocade colours, ema, prices, a lamp
  JUYO: (() => {
    const r = rng(71);
    let s = `<rect width="256" height="128" fill="#3a2a1c"/><rect width="256" height="10" fill="#22180f"/>`;
    s += `<rect x="0" y="12" width="256" height="2" fill="#c9a24a"/>`;
    for (let row = 0; row < 3; row++) {
      const y = 22 + row * 26;
      s += `<rect x="6" y="${y + 18}" width="244" height="3" fill="#6a4a2a"/>`;
      for (let x = 10; x < 246; x += 12) {
        const c = pick(r, ['#b3202a', '#1d4a8a', '#c9a24a', '#e88aa8', '#3a7a4a', '#7a3a8a', '#efe8d6']);
        s += `<path d="M${x},${y + 4} q4,-4 8,0 v14 h-8 Z" fill="${c}"/><rect x="${x + 1}" y="${y + 6}" width="6" height="7" fill="#efe8d6" opacity="0.8"/><line x1="${x + 4}" y1="${y}" x2="${x + 4}" y2="${y + 3}" stroke="${c}" stroke-width="1"/>`;
      }
    }
    for (let i = 0; i < 5; i++) s += `<path d="M${30 + i * 44},104 l8,-6 l8,6 v12 h-16 Z" fill="#d8b888"/><circle cx="${38 + i * 44}" cy="${109}" r="3" fill="${pick(r, ['#b3202a', '#2a2a2a'])}"/>`;
    s += `<rect y="118" width="256" height="10" fill="#5a3e28"/>`;
    return s;
  })(),
};

// horizontal plaque (gaku) and signboards
function kb(main, bg, fg, frame, size = 30, font = MIN, w = 256, h = 64) {
  return [w, h, `<rect width="${w}" height="${h}" fill="${frame}"/><rect x="5" y="5" width="${w - 10}" height="${h - 10}" fill="${bg}"/>
    <text x="${w / 2}" y="${h / 2 + size * 0.36}" font-family="${font}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle" letter-spacing="4">${main}</text>`];
}

function nobori(bg, fg, text, top, step = 22, size = 17) {
  return [128, 32, `<g transform="translate(128,0) rotate(90)"><rect width="32" height="128" fill="${bg}"/>
    <rect width="4" height="128" fill="${top}"/><rect y="0" width="32" height="8" fill="${top}"/><rect y="120" width="32" height="8" fill="${top}"/>
    <text font-family="${MIN}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle">${vt(text, 18, 30, step)}</text></g>`];
}

// paper lanterns, unwrapped round the lantern (U = once round, V = height): text front and back
function chochin(bg, fg, text, band, crest) {
  const t = (x) => crest ? `<g transform="translate(${x},32)"><circle r="13" fill="none" stroke="${fg}" stroke-width="3"/>
      ${[0, 120, 240].map(a => `<path d="M0,0 q6,-10 0,-11 q-8,2 -4,9" fill="${fg}" transform="rotate(${a})"/>`).join('')}</g>`
    : `<text font-family="${MIN}" font-weight="700" font-size="17" fill="${fg}" text-anchor="middle">${vt(text, x, 26, 18)}</text>`;
  let s = `<rect width="128" height="64" fill="${bg}"/>`;
  for (let y = 4; y < 64; y += 5) s += `<rect y="${y}" width="128" height="0.8" fill="#000" opacity="0.12"/>`;
  s += `<rect width="128" height="5" fill="${band}"/><rect y="59" width="128" height="5" fill="${band}"/>`;
  s += t(32) + t(96);
  return [128, 64, s];
}

// ema: pentagonal wooden prayer plaque with a picture, red cord
function ema(pic) {
  return [64, 64, `<rect width="64" height="64" fill="#c8a878"/><path d="M2,20 L32,4 L62,20 V62 H2 Z" fill="#d9bc8c" stroke="#8a6a40" stroke-width="2"/>
    <line x1="2" y1="22" x2="62" y2="22" stroke="#8a6a40" stroke-width="1.5"/><circle cx="32" cy="12" r="2.5" fill="#3a2a1a"/>
    ${pic}<text x="32" y="58" font-family="${MIN}" font-weight="700" font-size="8" fill="#b3202a" text-anchor="middle">祈願</text>`];
}
const HORSE = `<g fill="#f4f0e4" stroke="#2a1a12" stroke-width="1.3"><ellipse cx="30" cy="38" rx="13" ry="7"/>
  <path d="M40,34 l6,-10 l6,1 l1,4 l-5,1 l-4,8 Z"/>
  <path d="M20,43 v10 M25,44 v9 M35,44 v9 M40,43 v10" fill="none" stroke-width="2.2"/><path d="M17,36 q-6,2 -5,9" fill="none" stroke-width="2"/></g>
  <path d="M43,25 l3,-5 l2,6" fill="#2a1a12"/><path d="M41,30 q-3,5 -10,6" stroke="#b3202a" stroke-width="2" fill="none"/>
`;
const RABBIT = `<g fill="#f4f0e4" stroke="#2a1a12" stroke-width="1.2"><ellipse cx="34" cy="42" rx="12" ry="8"/><circle cx="22" cy="36" r="6"/>
  <ellipse cx="19" cy="26" rx="2.5" ry="7" transform="rotate(-12 19 26)"/><ellipse cx="24" cy="26" rx="2.5" ry="7" transform="rotate(8 24 26)"/></g>
  <circle cx="20" cy="35" r="1.2" fill="#b3202a"/><path d="M8,50 q24,-6 48,0" stroke="#3a7a4a" stroke-width="2" fill="none"/>`;

export const TERA = {
  ...Object.fromEntries(Object.entries(INT).map(([k, v]) => [`INT_${k}`, [256, 128, v]])),
  // temple plaque: gold on black lacquer, framed (invented temple 'Seiran-ji')
  GAKU0: [128, 64, `<rect width="128" height="64" fill="#7a5a2a"/><rect x="4" y="4" width="120" height="56" fill="#141210"/>
    <rect x="8" y="8" width="112" height="48" fill="none" stroke="#b8923a" stroke-width="1.5"/>
    <text x="64" y="44" font-family="${MIN}" font-weight="700" font-size="30" fill="#d8b04a" text-anchor="middle" letter-spacing="4">青嵐寺</text>`],
  // shrine plaque: vertical, black ink on weathered wood (invented 'Amemiya-jinja')
  GAKU1: [64, 128, `<rect width="64" height="128" fill="#2a1d14"/><rect x="5" y="5" width="54" height="118" fill="#d8c8a8"/>
    <rect x="9" y="9" width="46" height="110" fill="none" stroke="#8a6a40" stroke-width="1"/>
    <text font-family="${MIN}" font-weight="700" font-size="22" fill="#141210" text-anchor="middle">${vt('雨宮神社', 32, 32, 26)}</text>`],
  KB0: kb('授与所', '#f2ead6', '#141210', '#2a1d14', 34),
  KB1: kb('御朱印 ・ 御守', '#141210', '#e8dcc0', '#7a5a2a', 26),
  NOBORI0: nobori('#b8261c', '#ffffff', '奉納雨宮稲荷', '#ffffff', 17, 15),
  NOBORI1: nobori('#b8261c', '#ffffff', '青嵐寺厄除', '#ffffff', 20, 16),
  NOBORI2: nobori('#f4f0e4', '#b8261c', '奉納大明神', '#b8261c', 20, 16),
  CHOCHIN0: chochin('#c4261c', '#141210', '雨宮', '#141210', false),
  CHOCHIN1: chochin('#f2ecdc', '#141210', '', '#141210', true),
  EMA0: ema(HORSE),
  EMA1: ema(RABBIT),
  // offering box front: dark wood, slatted top edge, gilt characters
  SAISEN: [128, 64, `<rect width="128" height="64" fill="#2a1a10"/><rect x="0" y="0" width="128" height="12" fill="#1a100a"/>
    ${Array.from({ length: 12 }, (_, i) => `<rect x="${4 + i * 10.5}" y="1" width="6" height="10" fill="#3a2414"/>`).join('')}
    <rect x="4" y="14" width="120" height="46" fill="#3a2414"/><rect x="4" y="14" width="120" height="46" fill="none" stroke="#b8923a" stroke-width="1.5"/>
    <text x="64" y="50" font-family="${MIN}" font-weight="700" font-size="28" fill="#d8b04a" text-anchor="middle" letter-spacing="10">賽銭</text>`],
  // notice board (yuisho): history of the shrine in small text under a title
  YUISHO: [128, 96, `<rect width="128" height="96" fill="#3a2a1c"/><rect x="5" y="5" width="118" height="86" fill="#efe8d8"/>
    <text x="64" y="22" font-family="${MIN}" font-weight="700" font-size="14" fill="#141210" text-anchor="middle" letter-spacing="2">雨宮神社 由緒</text>
    ${Array.from({ length: 12 }, (_, i) => `<rect x="${110 - i * 8.5}" y="30" width="2.5" height="${44 + (i * 7) % 12}" fill="#3a3430" opacity="0.75"/>`).join('')}
    <text x="64" y="88" font-family="Helvetica" font-size="6" fill="#3a3430" text-anchor="middle">AMEMIYA SHRINE</text>`],
  OMIKUJI: [64, 32, `<rect width="64" height="32" fill="#b8261c"/><rect x="3" y="3" width="58" height="26" fill="#f4f0e4"/>
    <text x="32" y="22" font-family="${MIN}" font-weight="700" font-size="14" fill="#b8261c" text-anchor="middle">おみくじ</text>`],
  // bell rope (suzu-no-o): twisted red, white and purple cloth, U round, V along
  SUZU_O: [32, 128, `<defs><pattern id="s" width="32" height="24" patternUnits="userSpaceOnUse" patternTransform="skewY(-30)">
    <rect width="32" height="8" fill="#b8261c"/><rect y="8" width="32" height="8" fill="#f2ecdc"/><rect y="16" width="32" height="8" fill="#5a2a6a"/></pattern></defs>
    <rect width="32" height="128" fill="url(#s)"/>`],
  // price board of the amulet counter (invented prices)
  PRICE: [64, 96, `<rect width="64" height="96" fill="#2a1d14"/><rect x="4" y="4" width="56" height="88" fill="#efe8d8"/>
    <text x="32" y="18" font-family="${MIN}" font-weight="700" font-size="9" fill="#b8261c" text-anchor="middle">御守</text>
    ${['交通安全', '学業成就', '厄除', '縁結び', '御朱印'].map((t, i) => `<text x="8" y="${34 + i * 12}" font-family="${MIN}" font-size="7.5" fill="#141210">${t}</text>
    <text x="56" y="${34 + i * 12}" font-family="${MIN}" font-size="7" fill="#141210" text-anchor="end">${['八百', '八百', '千', '八百', '五百'][i]}</text>`).join('')}`],
};
