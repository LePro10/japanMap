// GasshoShop atlas graphics: the thatched farmhouse village (Shirakawa-gō /
// Gokayama-like). Every guest house, café, shop and price is invented.
// Imported by graphics.mjs (names get the prefix GA_).

const JP = "'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif";
const MIN = "'Hiragino Mincho ProN',serif";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const vt = (chars, x, y0, step) => [...chars].map((c, i) => `<tspan x="${x}" y="${y0 + i * step}">${c}</tspan>`).join('');

// smoke-dark farmhouse room: soot-black beams, earthen floor or boards
function room(bg = '#2a1e15', floor = '#5a4430') {
  let s = `<rect width="256" height="128" fill="${bg}"/><rect width="256" height="10" fill="#120d09"/>`;
  s += `<rect y="22" width="256" height="5" fill="#140f0b"/>`;
  s += `<rect y="110" width="256" height="18" fill="${floor}"/><rect y="110" width="256" height="2" fill="#1c140d"/>`;
  return s;
}

const INT = {
  // guest house: sunken hearth (irori) with hanging kettle on the jizai-kagi, fish on skewers, tatami, lit shoji at the back
  IRORI: (() => {
    let s = room('#241a12', '#4a3a28');
    s += `<rect x="12" y="30" width="232" height="52" fill="#efe1bd"/>`;
    for (let x = 12; x <= 244; x += 29) s += `<rect x="${x - 1}" y="30" width="3" height="52" fill="#2a1d14"/>`;
    for (const y of [43, 56, 69]) s += `<rect x="12" y="${y}" width="232" height="2" fill="#2a1d14"/>`;
    s += `<rect x="0" y="82" width="256" height="28" fill="#8a7a4a"/>`;
    for (let x = 0; x < 256; x += 64) s += `<rect x="${x}" y="82" width="2" height="28" fill="#4a3a1e"/>`;
    s += `<rect x="78" y="88" width="100" height="18" fill="#2a1d14"/><rect x="84" y="92" width="88" height="12" fill="#5a5048"/>
      <rect x="92" y="96" width="72" height="6" fill="#d8501f"/><rect x="100" y="97" width="56" height="3" fill="#ffb24a"/>`;
    s += `<rect x="127" y="10" width="2" height="62" fill="#1a1410"/><rect x="116" y="56" width="24" height="5" fill="#3a2a1c"/>
      <path d="M114,74 q14,-16 28,0 v6 q-14,6 -28,0 Z" fill="#141210"/><rect x="125" y="64" width="6" height="6" fill="#141210"/>`;
    for (const x of [94, 104, 152, 162]) s += `<rect x="${x}" y="80" width="1.6" height="16" fill="#c9a874"/><ellipse cx="${x + 1}" cy="83" rx="2.4" ry="5" fill="#8a6a3a"/>`;
    s += `<rect x="30" y="12" width="44" height="8" fill="#3a2a1c"/><rect x="182" y="12" width="44" height="8" fill="#3a2a1c"/>`;
    return s;
  })(),
  // café in an old farmhouse: counter with siphons, pendant lamps, wooden tables, a hearth corner
  CAFE: (() => {
    const r = rng(31);
    let s = room('#2c2017', '#6a5440');
    for (const x of [40, 128, 216]) s += `<rect x="${x - 1}" y="10" width="2" height="18" fill="#1a1410"/><path d="M${x - 12},38 l12,-10 l12,10 Z" fill="#f6d7a0"/><rect x="${x - 12}" y="38" width="24" height="3" fill="#ffcc80"/>`;
    s += `<rect x="0" y="66" width="256" height="6" fill="#7a5a3a"/><rect x="0" y="72" width="256" height="26" fill="#4a3424"/>`;
    for (let x = 12; x < 244; x += 24) s += `<rect x="${x}" y="52" width="6" height="14" fill="#cfe0e6" opacity="0.8"/><circle cx="${x + 3}" cy="50" r="4" fill="#cfe0e6" opacity="0.7"/><rect x="${x + 1}" y="44" width="4" height="3" fill="#3a2a1c"/>`;
    for (let x = 8; x < 248; x += 14) s += `<rect x="${x}" y="30" width="10" height="${10 + r() * 4}" fill="${pick(r, ['#efe6d0', '#c9a874', '#7a1f1a', '#2a3a5a'])}"/>`;
    s += `<rect x="4" y="27" width="248" height="3" fill="#5a3e26"/>`;
    for (const x of [40, 128, 216]) s += `<rect x="${x - 26}" y="100" width="52" height="5" fill="#8a6a48"/><rect x="${x - 22}" y="105" width="4" height="7" fill="#3a2a1c"/><rect x="${x + 18}" y="105" width="4" height="7" fill="#3a2a1c"/>`;
    s += `<rect x="96" y="76" width="64" height="15" fill="#efe6d0"/><text x="128" y="87" font-family="${MIN}" font-weight="700" font-size="9" fill="#1a1a1a" text-anchor="middle">自家焙煎 珈琲</text>`;
    return s;
  })(),
  // craft shop: washi sheets hanging, red dolls on shelves, straw crafts, a paper-making vat
  SHOP: (() => {
    const r = rng(37);
    let s = room('#2e2219', '#6a5843');
    for (let x = 6; x < 250; x += 20) s += `<rect x="${x}" y="12" width="16" height="${26 + r() * 8}" fill="${pick(r, ['#f4ecd8', '#efe0c0', '#e8d0d0', '#d8e0c8', '#f0e8f0'])}"/><rect x="${x}" y="12" width="16" height="2" fill="#5a3e26"/>`;
    for (const y of [64, 88]) {
      s += `<rect x="4" y="${y}" width="248" height="3" fill="#5a3e26"/>`;
      for (let x = 10; x < 246; x += 13) {
        if (r() < 0.5) s += `<circle cx="${x}" cy="${y - 10}" r="4.5" fill="#c42a22"/><rect x="${x - 3.5}" y="${y - 6}" width="7" height="6" fill="#c42a22"/><rect x="${x - 3}" y="${y - 13}" width="6" height="2" fill="#1a1410"/>`;
        else s += `<rect x="${x - 4}" y="${y - 14}" width="8" height="14" fill="${pick(r, ['#c9b07a', '#7a5a3a', '#2a3a5a', '#efe6d0'])}"/>`;
      }
    }
    s += `<rect x="80" y="96" width="96" height="14" fill="#5a4430"/><rect x="84" y="98" width="88" height="6" fill="#8ab0b8"/>`;
    s += `<rect x="100" y="40" width="56" height="14" fill="#1a1410"/><text x="128" y="51" font-family="${MIN}" font-weight="700" font-size="9" fill="#efe6d0" text-anchor="middle">手すき和紙</text>`;
    return s;
  })(),
};

// signboards (256 x 64): weathered wood, carved Mincho letters
function kb(main, sub, bg, fg, frame, size = 34) {
  return [256, 64, `<rect width="256" height="64" fill="${frame}"/><rect x="5" y="5" width="246" height="54" fill="${bg}"/>
    ${[11, 19, 31, 43, 52].map(y => `<rect x="5" y="${y}" width="246" height="1" fill="#000" opacity="0.1"/>`).join('')}
    <text x="${sub ? 140 : 128}" y="${32 + size * 0.38}" font-family="${MIN}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle" letter-spacing="4">${main}</text>
    ${sub ? `<text font-family="${MIN}" font-size="11" fill="${fg}" text-anchor="middle">${vt(sub, 24, 22, 13)}</text>` : ''}`];
}
const KB = [
  kb('民宿 かや乃', '合掌', '#2a2018', '#e8dcc0', '#141210'),
  kb('茶房 ゆい', '', '#c9b48a', '#1a120c', '#3a2818', 36),
  kb('みやげ 雪ん子', '', '#1e1610', '#efe6d0', '#4a3424', 28),
  kb('五箇山和紙', '紙漉', '#efe6d0', '#1a120c', '#3a2818', 32),
];

// vertical boards (64 x 256)
function kv(text, bg, fg, step = 34, size = 30) {
  return [64, 256, `<rect width="64" height="256" fill="#2a1d14"/><rect x="4" y="4" width="56" height="248" fill="${bg}"/>
    <text font-family="${MIN}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle">${vt(text, 32, 40, step)}</text>`];
}
const KV = [kv('民宿かや乃', '#1e1610', '#efe6d0', 44, 34), kv('珈琲ぜんざい', '#efe6d0', '#1a1a1a', 38, 30),
  kv('手漉き和紙', '#c9a874', '#1a120c', 44, 34)];

// noren (128 x 96)
function noren(bg, fg, chars, crest) {
  const n = chars.length, w = 128 / n;
  return [128, 96, `<rect width="128" height="96" fill="${bg}"/><rect width="128" height="10" fill="#000" opacity="0.25"/>
    ${crest ? `<path d="M64,14 l14,22 h-28 Z" fill="none" stroke="${fg}" stroke-width="3"/><path d="M64,20 v16" stroke="${fg}" stroke-width="2.4"/>` : ''}
    <text font-family="${MIN}" font-weight="700" font-size="${Math.min(34, w * 0.75)}" fill="${fg}" text-anchor="middle">${[...chars].map((c, i) => `<tspan x="${w * (i + 0.5)}" y="${crest ? 76 : 64}">${c}</tspan>`).join('')}</text>`];
}
const NOREN = [noren('#1d2a4a', '#f4efe4', '民宿', true), noren('#6a4a2a', '#f4efe4', '茶房', false),
  noren('#24324a', '#f4efe4', '和紙', true)];

// square wall lantern, paper lit from inside (64 x 64)
function andon(main, sub) {
  return [64, 64, `<rect width="64" height="64" fill="#f4e6c4"/><rect width="64" height="64" fill="none" stroke="#2a1d14" stroke-width="5"/>
    <rect x="0" y="0" width="64" height="7" fill="#2a1d14"/><rect x="0" y="57" width="64" height="7" fill="#2a1d14"/>
    <text font-family="${MIN}" font-weight="700" font-size="${main.length > 2 ? 15 : 19}" fill="#141210" text-anchor="middle">${vt(main, 38, main.length > 2 ? 24 : 30, main.length > 2 ? 15 : 20)}</text>
    ${sub ? `<text font-family="${MIN}" font-size="9" fill="#7a1f1a" text-anchor="middle">${vt(sub, 15, 22, 10)}</text>` : ''}`];
}

function nobori(bg, fg, text, top, step = 22, size = 17) {
  return [128, 32, `<g transform="translate(128,0) rotate(90)"><rect width="32" height="128" fill="${bg}"/>
    <rect width="4" height="128" fill="#ffffff"/><rect y="0" width="32" height="10" fill="${top}"/>
    <text font-family="${JP}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle">${vt(text, 18, 32, step)}</text></g>`];
}

export const GASSHO = {
  ...Object.fromEntries(Object.entries(INT).map(([k, v]) => [`INT_${k}`, [256, 128, v]])),
  ...Object.fromEntries(KB.map((v, i) => [`KB${i}`, v])),
  ...Object.fromEntries(KV.map((v, i) => [`KV${i}`, v])),
  ...Object.fromEntries(NOREN.map((v, i) => [`NOREN${i}`, v])),
  ANDON0: andon('かや乃', '民宿'),
  ANDON1: andon('茶房', ''),
  NOBORI0: nobori('#6a4a2a', '#ffffff', '甘味処', '#e8b51a', 26, 18),
  // café menu board
  MENU: [64, 96, `<rect width="64" height="96" fill="#5a3b22"/><rect x="4" y="4" width="56" height="88" fill="#efe6d0"/>
    <text x="32" y="16" font-family="${MIN}" font-weight="700" font-size="9" fill="#1a1a1a" text-anchor="middle">お品書き</text>
    ${['珈琲', '抹茶', 'ぜんざい', '五平餅', '甘酒'].map((t, i) => `<text x="7" y="${32 + i * 12}" font-family="${MIN}" font-size="7" fill="#1a1a1a">${t}</text>
    <text x="57" y="${32 + i * 12}" font-family="${MIN}" font-size="7" fill="#b3202a" text-anchor="end">${['五百', '六百', '七百', '四百', '三百'][i]}</text>`).join('')}`],
  // fire hut door sign: white on red, number of the water cannon
  HOSUI: [128, 64, `<rect width="128" height="64" fill="#b8261c"/><rect x="3" y="3" width="122" height="58" fill="none" stroke="#f4efe4" stroke-width="2"/>
    <text x="64" y="36" font-family="${JP}" font-weight="700" font-size="25" fill="#ffffff" text-anchor="middle" letter-spacing="3">放水銃</text>
    <text x="64" y="54" font-family="Helvetica" font-weight="700" font-size="12" fill="#ffffff" text-anchor="middle">No. 17</text>`],
  // shrine plaque: mountain god
  HOKORA: [64, 128, `<rect width="64" height="128" fill="#2a1d14"/><rect x="5" y="5" width="54" height="118" fill="#141210"/>
    <rect x="9" y="9" width="46" height="110" fill="none" stroke="#c9a14a" stroke-width="2"/>
    <text font-family="${MIN}" font-weight="700" font-size="26" fill="#e2c26a" text-anchor="middle">${vt('山之神', 32, 40, 32)}</text>`],
};
