// MinatoShop atlas graphics: the fishing village and harbour (Ine no Funaya /
// Sanriku / Noto coast). Every port, co-op, shop, boat name and price is
// invented. Imported by graphics.mjs (names get the prefix MI_).

const JP = "'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif";
const MIN = "'Hiragino Mincho ProN',serif";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const vt = (chars, x, y0, step) => [...chars].map((c, i) => `<tspan x="${x}" y="${y0 + i * step}">${c}</tspan>`).join('');

// fish as seen from the side (crates, racks): silver back, light belly
const fish = (x, y, l, col = '#7d8a96', a = 0) => `<g transform="translate(${x},${y}) rotate(${a})">
  <path d="M${-l / 2},0 q${l * 0.35},${-l * 0.2} ${l * 0.8},0 l${l * 0.2},${-l * 0.12} v${l * 0.24} l${-l * 0.2},${-l * 0.12} q${-l * 0.45},${l * 0.2} ${-l * 0.8},0 Z" fill="${col}"/>
  <path d="M${-l / 2},0 q${l * 0.4},${l * 0.12} ${l * 0.8},0" fill="#d8dde0" opacity="0.7"/><circle cx="${-l * 0.36}" cy="${-l * 0.03}" r="${l * 0.03}" fill="#111"/></g>`;

const INT = {
  // fish market floor: blue crates and white styrofoam boxes on pallets, ice, a scale, fluorescent tubes
  MARKET: (() => {
    const r = rng(41);
    let s = `<rect width="256" height="128" fill="#3a4044"/><rect width="256" height="12" fill="#1c2024"/>`;
    for (const x of [30, 100, 170, 240]) s += `<rect x="${x - 22}" y="12" width="44" height="3" fill="#f2f6ff"/>`;
    s += `<rect x="0" y="40" width="256" height="2" fill="#2a3034"/><rect x="0" y="96" width="256" height="32" fill="#6a7276"/>`;
    for (let x = 4; x < 252; x += 36) {
      const blue = r() < 0.55;
      for (let k = 0; k < 3; k++) {
        const y = 92 - k * 13;
        s += `<rect x="${x}" y="${y}" width="32" height="12" fill="${blue ? '#1f63b0' : '#eef0ee'}"/><rect x="${x}" y="${y}" width="32" height="2" fill="${blue ? '#174a85' : '#c9cccc'}"/>`;
        if (blue && k === 2) for (let f = 0; f < 3; f++) s += fish(x + 6 + f * 10, y - 1, 10, pick(r, ['#7d8a96', '#5a6c7a', '#b04a3a']), -10 + r() * 20);
      }
    }
    s += `<rect x="110" y="56" width="36" height="20" fill="#cfd4d6"/><rect x="116" y="60" width="24" height="8" fill="#1a2a1a"/><text x="128" y="67" font-family="Helvetica" font-size="7" fill="#7cff7c" text-anchor="middle">12.4</text>`;
    s += `<rect x="0" y="110" width="256" height="2" fill="#4a5256"/><text x="210" y="34" font-family="${JP}" font-weight="700" font-size="10" fill="#f2f2f2">せり場</text>`;
    return s;
  })(),
  // seafood diner: counter, menu tags on the wall, tables, lantern
  SHOKUDO: (() => {
    let s = `<rect width="256" height="128" fill="#3a2a1e"/><rect width="256" height="10" fill="#1c140e"/>`;
    s += `<rect x="0" y="16" width="256" height="30" fill="#e8dcc0"/>`;
    const menu = ['刺身定食', '海鮮丼', 'いか焼', 'あら汁', '焼魚定食', 'かき', 'さざえ', 'ビール'];
    menu.forEach((m, i) => { s += `<rect x="${6 + i * 31}" y="18" width="28" height="26" fill="${i % 3 === 1 ? '#f6e27a' : '#f8f4ea'}"/><text font-family="${MIN}" font-weight="700" font-size="7" fill="#1a1a1a" text-anchor="middle">${vt(m.slice(0, 3), 20 + i * 31, 27, 8)}</text>`; });
    s += `<rect x="0" y="62" width="256" height="6" fill="#8a6a48"/><rect x="0" y="68" width="256" height="30" fill="#5a3e28"/>`;
    for (let x = 14; x < 250; x += 30) s += `<rect x="${x}" y="54" width="10" height="8" fill="#e8e2d0"/><rect x="${x + 2}" y="52" width="6" height="3" fill="#1a1a1a"/>`;
    for (const x of [50, 140, 220]) s += `<rect x="${x - 24}" y="102" width="48" height="5" fill="#9a7a50"/><rect x="${x - 20}" y="107" width="4" height="12" fill="#2a1d14"/><rect x="${x + 16}" y="107" width="4" height="12" fill="#2a1d14"/>`;
    s += `<rect y="119" width="256" height="9" fill="#6a5a4a"/>`;
    return s;
  })(),
  // dark boat house ground floor: nets on the wall, buoys, oars, a work bench
  FUNAGURA: (() => {
    const r = rng(43);
    let s = `<rect width="256" height="128" fill="#1e1a16"/><rect width="256" height="16" fill="#120f0c"/>`;
    for (let x = 0; x < 256; x += 22) s += `<rect x="${x}" y="16" width="2" height="90" fill="#15110d"/>`;
    for (let i = 0; i < 6; i++) { const x = 10 + i * 42; s += `<path d="M${x},30 q12,40 0,70 h26 q-12,-30 0,-70 Z" fill="${pick(r, ['#2f5a3a', '#2a4a6a', '#3a5a2a'])}" opacity="0.85"/>`; }
    for (let i = 0; i < 9; i++) s += `<circle cx="${14 + i * 28}" cy="${22 + r() * 6}" r="5" fill="${pick(r, ['#e86a1a', '#d8301e', '#e8e0d0'])}"/>`;
    s += `<rect x="150" y="80" width="90" height="6" fill="#4a3424"/><rect x="154" y="86" width="4" height="22" fill="#2a1d14"/><rect x="232" y="86" width="4" height="22" fill="#2a1d14"/>`;
    s += `<rect y="106" width="256" height="22" fill="#3a3632"/>`;
    return s;
  })(),
  // general store: tackle on hooks, ice chest, drinks fridge, snacks
  SHOP: (() => {
    const r = rng(47);
    let s = `<rect width="256" height="128" fill="#d8d8d0"/><rect width="256" height="10" fill="#3a3a3a"/>`;
    for (const x of [40, 128, 216]) s += `<rect x="${x - 24}" y="10" width="48" height="3" fill="#ffffff"/>`;
    for (let y = 22; y < 70; y += 12) for (let x = 6; x < 110; x += 9) s += `<rect x="${x}" y="${y}" width="6" height="9" fill="${pick(r, ['#e84a2a', '#2a6ab0', '#f2c81a', '#3aa04a', '#efefef', '#8a3ab0'])}"/>`;
    s += `<rect x="4" y="18" width="108" height="2" fill="#7a7a7a"/>`;
    s += `<rect x="124" y="20" width="56" height="78" fill="#2a2a2e"/><rect x="128" y="24" width="48" height="70" fill="#9fd0e8" opacity="0.7"/>`;
    for (let y = 30; y < 90; y += 14) for (let x = 132; x < 172; x += 8) s += `<rect x="${x}" y="${y}" width="5" height="10" fill="${pick(r, ['#e83a2a', '#2a8ad0', '#f2f2f2', '#2aa04a'])}"/>`;
    s += `<rect x="188" y="62" width="62" height="36" fill="#f2f2f2"/><rect x="188" y="62" width="62" height="6" fill="#2a6ab0"/><text x="219" y="86" font-family="${JP}" font-weight="700" font-size="13" fill="#2a6ab0" text-anchor="middle">氷</text>`;
    s += `<rect y="98" width="256" height="30" fill="#8a8a82"/><rect x="0" y="98" width="120" height="16" fill="#c9b08a"/>`;
    return s;
  })(),
};

// signboards (256 x 64)
function kb(main, sub, bg, fg, frame, size = 32, font = MIN) {
  return [256, 64, `<rect width="256" height="64" fill="${frame}"/><rect x="5" y="5" width="246" height="54" fill="${bg}"/>
    <text x="${sub ? 140 : 128}" y="${32 + size * 0.38}" font-family="${font}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle" letter-spacing="3">${main}</text>
    ${sub ? `<text font-family="${font}" font-size="11" fill="${fg}" text-anchor="middle">${vt(sub, 22, 22, 13)}</text>` : ''}`];
}
const KB = [
  // fish market of the (fictional) Umineko port co-op
  [256, 64, `<rect width="256" height="64" fill="#f4f4f0"/><rect x="0" y="0" width="256" height="8" fill="#1f5aa0"/><rect x="0" y="56" width="256" height="8" fill="#1f5aa0"/>
    <text x="128" y="42" font-family="${JP}" font-weight="700" font-size="28" fill="#1f5aa0" text-anchor="middle" letter-spacing="2">海猫港 魚市場</text>`],
  kb('海鮮食堂 かもめ', '', '#f2ead6', '#7a1a14', '#2a1d14', 28),
  kb('釣具・氷 丸井商店', '', '#1f5aa0', '#ffffff', '#e8e8e2', 25, JP),
  kb('舟屋の宿 なぎさ', '民宿', '#2a2018', '#e8dcc0', '#141210', 26),
];

function kv(text, bg, fg, step = 34, size = 30, font = MIN) {
  return [64, 256, `<rect width="64" height="256" fill="#2a1d14"/><rect x="4" y="4" width="56" height="248" fill="${bg}"/>
    <text font-family="${font}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle">${vt(text, 32, 40, step)}</text>`];
}
const KV = [kv('本日の定食', '#f8f4ea', '#1a1a1a', 42, 30), kv('釣りエサ', '#f2c81a', '#b3202a', 52, 34, JP)];

function noren(bg, fg, chars, wave) {
  const n = chars.length, w = 128 / n;
  return [128, 96, `<rect width="128" height="96" fill="${bg}"/><rect width="128" height="10" fill="#000" opacity="0.25"/>
    ${wave ? `<path d="M0,86 q16,-10 32,0 t32,0 t32,0 t32,0 V96 H0 Z" fill="${fg}" opacity="0.85"/>` : ''}
    <text font-family="${MIN}" font-weight="700" font-size="${Math.min(36, w * 0.75)}" fill="${fg}" text-anchor="middle">${[...chars].map((c, i) => `<tspan x="${w * (i + 0.5)}" y="62">${c}</tspan>`).join('')}</text>`];
}
const NOREN = [noren('#1d2a4a', '#f4efe4', '海鮮', true), noren('#f4efe4', '#1d2a4a', 'めし', false)];

function nobori(bg, fg, text, top, step = 22, size = 17) {
  return [128, 32, `<g transform="translate(128,0) rotate(90)"><rect width="32" height="128" fill="${bg}"/>
    <rect width="4" height="128" fill="#ffffff"/><rect y="0" width="32" height="10" fill="${top}"/>
    <text font-family="${JP}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle">${vt(text, 18, 32, step)}</text></g>`];
}

// fish drying on a net tray (himono), seen from above: 128 x 64, tiles in neither axis
const HIMONO = (() => {
  const r = rng(53);
  let s = `<rect width="128" height="64" fill="#3a5a6a"/>`;
  for (let x = 0; x < 128; x += 4) s += `<rect x="${x}" y="0" width="1" height="64" fill="#2a3a44"/>`;
  for (let y = 0; y < 64; y += 4) s += `<rect x="0" y="${y}" width="128" height="1" fill="#2a3a44"/>`;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
    const x = 12 + i * 20 + r() * 3, y = 11 + row * 21;
    s += `<g transform="translate(${x},${y}) rotate(${-8 + r() * 16})"><ellipse rx="8.5" ry="5.2" fill="${pick(r, ['#c98a5a', '#d49a68', '#b8784a'])}"/>
      <ellipse rx="6" ry="2.6" fill="#e8b88a" opacity="0.8"/><path d="M8,0 l5,-4 v8 Z" fill="#8a5a3a"/><circle cx="-6" cy="-1" r="1.1" fill="#2a1a10"/></g>`;
  }
  return [128, 64, s];
})();

// squid opened flat for drying (surume / ichiya-boshi): 64 x 64, the mesh follows its outline
const IKA = [64, 64, `<rect width="64" height="64" fill="#e8d8c0"/>
  <path d="M32,2 L46,16 L44,40 L38,40 L36,62 L32,50 L28,62 L26,40 L20,40 L18,16 Z" fill="#f0dcc0"/>
  <path d="M32,6 L42,18 L40,38 L24,38 L22,18 Z" fill="#e6c8a0"/><path d="M32,8 v30" stroke="#c9a070" stroke-width="1.4"/>
  <path d="M26,40 l-3,20 M30,40 l-1,22 M34,40 l1,22 M38,40 l3,20" stroke="#d8b890" stroke-width="2"/>`];

// fishing net in a heap: knotted mesh over dark depth (green and blue nylon)
function net(col, dark, seed) {
  const r = rng(seed);
  let s = `<rect width="128" height="64" fill="${dark}"/>`;
  for (let i = 0; i < 40; i++) s += `<ellipse cx="${r() * 128}" cy="${r() * 64}" rx="${6 + r() * 14}" ry="${3 + r() * 6}" fill="${col}" opacity="0.35"/>`;
  for (let y = -8; y < 72; y += 5) s += `<path d="M0,${y} ${Array.from({ length: 17 }, (_, i) => `L${i * 8},${y + (i % 2 ? 2.5 : -2.5) + (r() - 0.5) * 2}`).join(' ')}" stroke="${col}" stroke-width="1" fill="none"/>`;
  for (let x = -4; x < 132; x += 8) s += `<path d="M${x},0 ${Array.from({ length: 9 }, (_, i) => `L${x + (i % 2 ? 2 : -2) + (r() - 0.5) * 2},${i * 8}`).join(' ')}" stroke="${col}" stroke-width="0.8" fill="none" opacity="0.8"/>`;
  return [128, 64, s];
}

// boat name on the bow (fictional), registration number below
function boatName(name, reg) {
  return [256, 32, `<rect width="256" height="32" fill="#f2f2ee"/>
    <text x="128" y="22" font-family="${MIN}" font-weight="700" font-size="22" fill="#141414" text-anchor="middle" letter-spacing="4">${name}</text>
    <text x="250" y="29" font-family="Helvetica" font-weight="700" font-size="7" fill="#141414" text-anchor="end">${reg}</text>`];
}

export const MINATO = {
  ...Object.fromEntries(Object.entries(INT).map(([k, v]) => [`INT_${k}`, [256, 128, v]])),
  ...Object.fromEntries(KB.map((v, i) => [`KB${i}`, v])),
  ...Object.fromEntries(KV.map((v, i) => [`KV${i}`, v])),
  ...Object.fromEntries(NOREN.map((v, i) => [`NOREN${i}`, v])),
  NOBORI0: nobori('#1f5aa0', '#ffffff', '海鮮丼', '#e8b51a', 26, 18),
  NOBORI1: nobori('#b3202a', '#ffffff', 'いか焼', '#f2f2f2', 26, 18),
  MENU: [64, 96, `<rect width="64" height="96" fill="#5a3b22"/><rect x="4" y="4" width="56" height="88" fill="#22302a"/>
    <text x="32" y="16" font-family="${MIN}" font-weight="700" font-size="9" fill="#f2f2e8" text-anchor="middle">本日のおすすめ</text>
    ${['あじ', 'さば', 'ぶり', 'いか', 'さざえ'].map((t, i) => `<text x="8" y="${32 + i * 12}" font-family="${JP}" font-size="8" fill="#f2f2e8">${t}</text>
    <text x="56" y="${32 + i * 12}" font-family="${JP}" font-size="7" fill="#f6d36a" text-anchor="end">${['八百', '九百', '千二百', '七百', '六百'][i]}</text>`).join('')}`],
  // blue plastic fish crate, side: moulded grip hole and the port mark
  FISHBOX: [64, 32, `<rect width="64" height="32" fill="#1f63b0"/><rect y="0" width="64" height="4" fill="#174a85"/>
    <rect x="22" y="7" width="20" height="6" rx="3" fill="#0e2a4a"/><text x="32" y="26" font-family="${JP}" font-weight="700" font-size="9" fill="#e8eef6" text-anchor="middle">海猫 23</text>
    <rect x="0" y="28" width="64" height="4" fill="#174a85"/>`],
  // styrofoam fish box, side: printed blue
  STYRO: [64, 32, `<rect width="64" height="32" fill="#eff0ec"/><rect y="0" width="64" height="5" fill="#dcdedb"/>
    <text x="32" y="23" font-family="${JP}" font-weight="700" font-size="12" fill="#2a5aa0" text-anchor="middle" letter-spacing="2">鮮魚</text>`],
  HIMONO,
  IKA,
  NET_GREEN: net('#5a9a6a', '#1a3022', 61),
  NET_BLUE: net('#6a9ad0', '#16263a', 67),
  BOAT0: boatName('第八 海幸丸', 'IS1-4521'),
  BOAT1: boatName('第三 なぎさ丸', 'KY2-1187'),
};
