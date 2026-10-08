// KosoShop atlas graphics (task 5c): Tokyo height and the rest - crown signs
// of the towers, rooftop heliport (H) and rescue space (R) markings, the
// cinema front (poster boxes, marquee, vertical name sign), the hotel
// entrance (canopy fascia, name signs), the shōtengai market hall (arch sign,
// hanging flags, shop signs, stall interiors) and the kei truck plate.
// Every name, film, brand and price is invented.
// Imported by graphics.mjs (names get the prefix KS_).

const JP = "'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif";
const MIN = "'Hiragino Mincho ProN',serif";
const SANS = "Helvetica, Arial, sans-serif";
const vt = (chars, x, y0, step) => [...chars].map((c, i) => `<tspan x="${x}" y="${y0 + i * step}">${c}</tspan>`).join('');

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// lit crown sign of a tower (512 x 64): letters on a dark band, glowing
function crown(text, fg, sub = '', bg = '#0d1014') {
  return [512, 64, `<rect width="512" height="64" fill="${bg}"/>
    <text x="256" y="${sub ? 40 : 46}" font-family="${SANS}" font-weight="800" font-size="${sub ? 34 : 40}" fill="${fg}" text-anchor="middle" letter-spacing="10">${text}</text>
    ${sub ? `<text x="256" y="58" font-family="${JP}" font-weight="700" font-size="12" fill="${fg}" opacity="0.85" text-anchor="middle" letter-spacing="4">${sub}</text>` : ''}`];
}

// rooftop marking 128 x 128: H = emergency heliport (緊急離着陸場),
// R = rescue space (緊急救助用スペース) - required on Japanese towers over 31 m
function pad(letter) {
  const H = letter === 'H';
  return [128, 128, `<rect width="128" height="128" fill="#5d6560"/>
    <rect x="4" y="4" width="120" height="120" fill="none" stroke="#e8e4d8" stroke-width="3"/>
    ${H ? `<circle cx="64" cy="64" r="48" fill="none" stroke="#e8e4d8" stroke-width="5"/>` : `<rect x="16" y="16" width="96" height="96" fill="none" stroke="#e8c020" stroke-width="5"/>`}
    <text x="64" y="${H ? 86 : 88}" font-family="${SANS}" font-weight="800" font-size="${H ? 62 : 66}" fill="${H ? '#e8e4d8' : '#e8c020'}" text-anchor="middle">${letter}</text>
    ${H ? `<text x="64" y="120" font-family="${SANS}" font-weight="700" font-size="9" fill="#e8e4d8" text-anchor="middle">10.0</text>` : ''}`];
}

// film poster (portrait 128 x 192): fictional titles, one big image block
function poster(seed, title, jp, palette) {
  const r = rng(seed);
  const [a, b, c] = palette;
  let s = `<rect width="128" height="192" fill="${a}"/>
    <defs><linearGradient id="g${seed}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="128" height="150" fill="url(#g${seed})"/>`;
  // a silhouette per poster: city, face, monster, car, wave
  const k = seed % 5;
  if (k === 0) for (let x = 0; x < 128; x += 9) { const h = 30 + r() * 70; s += `<rect x="${x}" y="${150 - h}" width="8" height="${h}" fill="#0a0c12"/>`; }
  if (k === 1) s += `<circle cx="64" cy="70" r="36" fill="${c}"/><rect x="40" y="96" width="48" height="54" fill="${c}"/><circle cx="52" cy="66" r="4" fill="${a}"/><circle cx="76" cy="66" r="4" fill="${a}"/>`;
  if (k === 2) s += `<path d="M10,150 L30,70 L46,96 L64,40 L84,94 L100,66 L120,150 Z" fill="#101410"/><circle cx="64" cy="58" r="4" fill="#ff3020"/><circle cx="74" cy="58" r="4" fill="#ff3020"/>`;
  if (k === 3) s += `<rect x="14" y="110" width="100" height="22" rx="8" fill="${c}"/><path d="M34,110 L48,92 L86,92 L100,110 Z" fill="${c}"/><circle cx="36" cy="132" r="9" fill="#111"/><circle cx="92" cy="132" r="9" fill="#111"/><rect x="0" y="140" width="128" height="10" fill="#222"/>`;
  if (k === 4) s += `<path d="M0,120 C20,60 50,60 64,96 C78,40 110,50 128,90 L128,150 L0,150 Z" fill="${c}"/><circle cx="96" cy="36" r="14" fill="#f6f0d8"/>`;
  s += `<rect y="150" width="128" height="42" fill="#0b0b0d"/>
    <text x="64" y="171" font-family="${SANS}" font-weight="800" font-size="${title.length > 9 ? 12 : 15}" fill="#f4f2ea" text-anchor="middle" letter-spacing="1">${title}</text>
    <text x="64" y="186" font-family="${JP}" font-weight="700" font-size="10" fill="${c}" text-anchor="middle">${jp}</text>
    <text x="8" y="16" font-family="${JP}" font-weight="700" font-size="9" fill="#ffffff" opacity="0.8">全国ロードショー</text>`;
  return [128, 192, s];
}

// cinema marquee (512 x 128): bulbs round a board, film titles in letters
function marquee() {
  let s = `<rect width="512" height="128" fill="#1a0e0a"/><rect x="10" y="10" width="492" height="108" fill="#f3ead0"/>`;
  for (let x = 6; x < 512; x += 16) s += `<circle cx="${x}" cy="5" r="3.5" fill="#ffd27a"/><circle cx="${x}" cy="123" r="3.5" fill="#ffd27a"/>`;
  s += `<text x="256" y="44" font-family="${SANS}" font-weight="800" font-size="30" fill="#b01a1a" text-anchor="middle" letter-spacing="6">NOW SHOWING</text>
    <text x="256" y="78" font-family="${SANS}" font-weight="700" font-size="17" fill="#1a1a1a" text-anchor="middle" letter-spacing="2">NEON KAIJU · LAST TRAIN · BLUE HOUR</text>
    <text x="256" y="106" font-family="${JP}" font-weight="700" font-size="18" fill="#1a1a1a" text-anchor="middle" letter-spacing="2">上映中 ・ 本日レイトショー 21:30</text>`;
  return [512, 128, s];
}

// vertical name sign (64 x 256): one block per character, lit edges
function tate(chars, bg, fg, edge, small = '') {
  let s = `<rect width="64" height="256" fill="${edge}"/><rect x="4" y="4" width="56" height="248" fill="${bg}"/>`;
  const step = (small ? 212 : 240) / chars.length;
  s += `<text font-family="${MIN}" font-weight="800" font-size="${Math.min(46, step * 0.86)}" fill="${fg}" text-anchor="middle">${vt(chars, 32, 10 + step * 0.78, step)}</text>`;
  if (small) s += `<text x="32" y="246" font-family="${SANS}" font-weight="800" font-size="12" fill="${fg}" text-anchor="middle">${small}</text>`;
  return [64, 256, s];
}

// horizontal fascia (512 x 64)
function fascia(text, jp, bg, fg, font = SANS) {
  return [512, 64, `<rect width="512" height="64" fill="${bg}"/>
    <text x="${jp ? 180 : 256}" y="43" font-family="${font}" font-weight="800" font-size="${jp ? 26 : 32}" fill="${fg}" text-anchor="middle" letter-spacing="${jp ? 3 : 8}">${text}</text>
    ${jp ? `<rect x="344" y="14" width="2" height="36" fill="${fg}" opacity="0.6"/><text x="428" y="41" font-family="${JP}" font-weight="700" font-size="22" fill="${fg}" text-anchor="middle">${jp}</text>` : ''}`];
}

// cornerstone plaque (定礎) set into the granite by the entrance (64 x 64)
const teiso = [64, 64, `<rect width="64" height="64" fill="#4a4846"/><rect x="4" y="4" width="56" height="56" fill="#6a6764"/>
  <text x="32" y="30" font-family="${MIN}" font-weight="800" font-size="20" fill="#d8c890" text-anchor="middle">定礎</text>
  <text x="32" y="50" font-family="${SANS}" font-weight="700" font-size="10" fill="#d8c890" text-anchor="middle">1991.4</text>`];

// shōtengai arch sign (512 x 128): the name on a curved board, flowers
function arch() {
  let s = `<rect width="512" height="128" fill="#1d2a52"/><rect x="6" y="6" width="500" height="116" fill="#f6efd8"/>
    <rect x="6" y="6" width="500" height="18" fill="#c8202a"/><rect x="6" y="104" width="500" height="18" fill="#c8202a"/>`;
  for (let x = 20; x < 500; x += 40) s += `<circle cx="${x}" cy="15" r="5" fill="#ffd8e4"/><circle cx="${x + 20}" cy="113" r="5" fill="#ffd8e4"/>`;
  s += `<text x="256" y="80" font-family="${MIN}" font-weight="800" font-size="52" fill="#1d2a52" text-anchor="middle" letter-spacing="6">ひかり通り商店街</text>
    <text x="256" y="100" font-family="${SANS}" font-weight="700" font-size="12" fill="#c8202a" text-anchor="middle" letter-spacing="6">HIKARI-DORI SHOPPING STREET</text>`;
  return [512, 128, s];
}

// hanging flag in the arcade (64 x 128): seasonal sale banners
function flag(bg, fg, text, sub) {
  return [64, 128, `<rect width="64" height="128" fill="${bg}"/><rect x="0" y="0" width="64" height="8" fill="#222"/>
    <text font-family="${MIN}" font-weight="800" font-size="20" fill="${fg}" text-anchor="middle">${vt(text, 32, 34, 22)}</text>
    <text x="32" y="120" font-family="${JP}" font-weight="700" font-size="9" fill="${fg}" text-anchor="middle">${sub}</text>`];
}

// shop sign over a stall (256 x 64)
function shopsign(big, small, bg, fg) {
  return [256, 64, `<rect width="256" height="64" fill="#1a1a1a"/><rect x="3" y="3" width="250" height="58" fill="${bg}"/>
    <text x="128" y="42" font-family="${MIN}" font-weight="800" font-size="32" fill="${fg}" text-anchor="middle" letter-spacing="4">${big}</text>
    <text x="236" y="56" font-family="${JP}" font-weight="700" font-size="9" fill="${fg}" text-anchor="end">${small}</text>`];
}

// stall front (256 x 128): goods in boxes and price cards, lit from above
function stall(seed, kind) {
  const r = rng(seed);
  let s = `<rect width="256" height="128" fill="#3a3430"/><rect y="0" width="256" height="40" fill="#e8e0cc"/>`;
  for (let x = 10; x < 250; x += 50) s += `<rect x="${x}" y="4" width="30" height="5" fill="#fff6d8"/>`;
  const goods = {
    veg: ['#3a8a2a', '#d84a1a', '#e8c020', '#6a2a6a', '#e8e0b0', '#2a6a2a'],
    fish: ['#c8d0d8', '#d86a5a', '#e8e4dc', '#8a96a0', '#e89a6a', '#4a5a6a'],
    sweets: ['#e8a0b0', '#f4ead0', '#8a4a2a', '#e8d090', '#a0c878', '#ffffff'],
    goods: ['#2a5aa0', '#c8202a', '#e8c020', '#f4f2ea', '#2a2a2a', '#3a8a5a'],
  }[kind];
  for (let row = 0; row < 3; row++) {
    const y = 48 + row * 26;
    for (let x = 4; x < 252; x += 28) {
      const g = goods[Math.floor(r() * goods.length)];
      s += `<rect x="${x}" y="${y}" width="26" height="20" fill="#7a5a3a"/>`;
      for (let k = 0; k < 6; k++) s += `<circle cx="${x + 4 + r() * 18}" cy="${y + 4 + r() * 8}" r="${3 + r() * 2.5}" fill="${g}"/>`;
      if (r() < 0.45) s += `<rect x="${x + 6}" y="${y + 12}" width="14" height="8" fill="#ffe94a"/><text x="${x + 13}" y="${y + 19}" font-family="${SANS}" font-weight="800" font-size="6.5" fill="#c8202a" text-anchor="middle">${[98, 150, 198, 280, 380][Math.floor(r() * 5)]}</text>`;
    }
  }
  return [256, 128, s];
}

// lobby / interior seen through glass (256 x 128)
function lobby(warm = true) {
  const w = warm ? '#e8d6b0' : '#dfe6ea';
  return [256, 128, `<rect width="256" height="128" fill="${w}"/><rect y="0" width="256" height="14" fill="#f8f4ea"/>
    ${[30, 90, 150, 210].map(x => `<rect x="${x}" y="2" width="20" height="5" fill="#fffbe8"/>`).join('')}
    <rect x="70" y="58" width="116" height="34" fill="#5a3a22"/><rect x="70" y="56" width="116" height="5" fill="#c8a878"/>
    <rect x="96" y="22" width="64" height="24" fill="#3a2a1e"/><text x="128" y="40" font-family="${SANS}" font-weight="800" font-size="12" fill="#e8c878" text-anchor="middle">FRONT</text>
    <rect x="12" y="40" width="22" height="70" fill="#3a5a2a"/><rect x="222" y="40" width="22" height="70" fill="#3a5a2a"/>
    <rect y="110" width="256" height="18" fill="#7a6a5a"/>`];
}

// kei truck plate (64 x 32): commercial kei = black plate, yellow letters
const plate = [64, 32, `<rect width="64" height="32" rx="3" fill="#111"/><rect x="1.5" y="1.5" width="61" height="29" rx="2.5" fill="none" stroke="#e8c020" stroke-width="1"/>
  <text x="32" y="11" font-family="${JP}" font-weight="700" font-size="8" fill="#e8c020" text-anchor="middle">舟浦 480</text>
  <text x="10" y="27" font-family="${JP}" font-weight="700" font-size="9" fill="#e8c020" text-anchor="middle">え</text>
  <text x="38" y="28" font-family="${SANS}" font-weight="800" font-size="16" fill="#e8c020" text-anchor="middle">12-08</text>`];

// fishing net bundled on the bed (128 x 64): green mesh over darker folds
function net(col, knot) {
  let s = `<rect width="128" height="64" fill="${col}"/>`;
  for (let y = 0; y < 64; y += 6) s += `<path d="M0,${y} ${Array.from({ length: 17 }, (_, i) => `L${i * 8},${y + (i % 2 ? 3 : 0)}`).join(' ')}" stroke="${knot}" stroke-width="1" fill="none" opacity="0.7"/>`;
  for (let i = 0; i < 6; i++) s += `<ellipse cx="${10 + i * 22}" cy="${20 + (i % 3) * 12}" rx="12" ry="5" fill="#000" opacity="0.18"/>`;
  return [128, 64, s];
}

export const KOSO = {
  CROWN0: crown('KAZEMORI', '#e8f2ff', '風森ビルディング'),
  CROWN1: crown('NEO ASTRA', '#ffffff'),
  CROWN2: crown('HOTEL MIZUHO', '#ffd58a', 'ホテル瑞穂'),
  CROWN3: crown('SORANO TOWER', '#bfe8ff', 'ソラノタワー'),
  PAD_H: pad('H'),
  PAD_R: pad('R'),
  POSTER0: poster(10, 'NEON KAIJU', '電光怪獣', ['#3a0a3a', '#d8304a', '#ff8aa8']),
  POSTER1: poster(11, 'LAST TRAIN', '終電の向こう', ['#0e1a2e', '#3a6a9a', '#f4e8c8']),
  POSTER2: poster(12, 'MIDNIGHT ROAR', '真夜中の咆哮', ['#0a1a0a', '#4a7a3a', '#e8c020']),
  POSTER3: poster(13, 'BLUE HOUR', 'ブルーアワー', ['#1a2a5a', '#e88a5a', '#f6e0c0']),
  POSTER4: poster(14, 'SEA OF LIGHT', '光の海', ['#06243a', '#1a8a9a', '#f4f2ea']),
  POSTER5: poster(15, 'TOUGE 86', '峠の夜明け', ['#2a0a0a', '#e85a1a', '#f4d84a']),
  MARQUEE: marquee(),
  CINEMA_TATE: tate('銀河座', '#b01a1a', '#ffe8a0', '#ffd27a', 'CINEMA'),
  CINEMA_FASCIA: fascia('GINGA-ZA', '銀河座', '#16121a', '#ffd27a'),
  HOTEL_TATE: tate('ホテル瑞穂', '#f6f2ea', '#1d2a52', '#b8a070', 'HOTEL'),
  HOTEL_FASCIA: fascia('HOTEL MIZUHO', 'ホテル瑞穂', '#1d2a52', '#f0e2b8', MIN),
  BIZ_TATE: tate('ビジネスホテル', '#2a6ab0', '#ffffff', '#e8eef6', 'INN'),
  BIZ_FASCIA: fascia('SKY INN 22', 'スカイイン', '#f4f4f0', '#2a6ab0'),
  ARCH: arch(),
  FLAG0: flag('#c8202a', '#ffffff', '大売出し', 'ひかり通り'),
  FLAG1: flag('#2a7a3a', '#ffffff', '夏祭り', '8月 全店'),
  FLAG2: flag('#e8b020', '#1a1a1a', '感謝祭', 'ひかり通り'),
  FLAG3: flag('#1d2a52', '#f6efd8', '歳末市', '商店街'),
  SHOP0: shopsign('八百勝', 'やおかつ 青果', '#2a6a2a', '#ffffff'),
  SHOP1: shopsign('魚辰', 'うおたつ 鮮魚', '#1d4a8a', '#ffffff'),
  SHOP2: shopsign('甘味 柚月', '和菓子', '#f4ead0', '#7a2a1a'),
  SHOP3: shopsign('雑貨 ポッケ', '日用品', '#e8b020', '#1a1a1a'),
  SHOP4: shopsign('惣菜 はな', 'おかず', '#c8202a', '#ffffff'),
  SHOP5: shopsign('茶舗 緑園', 'お茶', '#3a5a2a', '#f4ead0'),
  STALL_VEG: stall(1, 'veg'),
  STALL_FISH: stall(2, 'fish'),
  STALL_SWEETS: stall(3, 'sweets'),
  STALL_GOODS: stall(4, 'goods'),
  LOBBY_WARM: lobby(true),
  LOBBY_COOL: lobby(false),
  PLATE_KEI: plate,
  TEISO: teiso,
  NET_GREEN: net('#2f6a3a', '#a8d080'),
  NET_BLUE: net('#2a4a8a', '#a0c0f0'),
  MIKAN: [128, 64, `<rect width="128" height="64" fill="#a8845a"/>${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 37) % 128}" cy="${8 + ((i * 23) % 52)}" r="6" fill="${i % 5 ? '#e8861a' : '#d8701a'}"/>`).join('')}
    <rect x="0" y="0" width="128" height="4" fill="#7a5a3a"/>`],
};
