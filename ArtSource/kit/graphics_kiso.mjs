// KisoShop atlas graphics: inns and shops of a Nakasendō post town
// (Tsumago/Magome/Narai-like). Every inn, shop, brand and price is invented.
// Imported by graphics.mjs (names get the prefix KI_).
import { KOEDO } from './graphics_koedo.mjs';

const JP = "'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif";
const MIN = "'Hiragino Mincho ProN',serif";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const vt = (chars, x, y0, step) => [...chars].map((c, i) => `<tspan x="${x}" y="${y0 + i * step}">${c}</tspan>`).join('');

// dark wooden room, lamps under the ceiling, earthen floor (doma) or boards
function room(bg = '#2e2117', floor = '#5a4430') {
  let s = `<rect width="256" height="128" fill="${bg}"/><rect width="256" height="9" fill="#150f0a"/>`;
  for (const x of [48, 128, 208]) s += `<rect x="${x - 10}" y="9" width="20" height="13" fill="#f6d7a0"/><rect x="${x - 10}" y="9" width="20" height="2" fill="#2a1d14"/>`;
  s += `<rect y="110" width="256" height="18" fill="${floor}"/><rect y="110" width="256" height="2" fill="#1c140d"/>`;
  return s;
}
const shelf = (y, x0 = 4, x1 = 252) => `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="3" fill="#5a3e26"/>`;

const INT = {
  // inn entrance: earthen doma, raised wooden step (agarikamachi), tatami room with lit shoji, hearth glow
  INN: (() => {
    let s = room('#2a1e15', '#6b5a48');
    s += `<rect x="20" y="24" width="216" height="62" fill="#efe1bd"/>`;
    for (let x = 20; x <= 236; x += 27) s += `<rect x="${x - 1}" y="24" width="3" height="62" fill="#3a2a1e"/>`;
    for (const y of [40, 56, 72]) s += `<rect x="20" y="${y}" width="216" height="2" fill="#3a2a1e"/>`;
    s += `<rect x="88" y="24" width="80" height="62" fill="#3a2a1e"/><rect x="92" y="28" width="72" height="56" fill="#c9a874"/>
      <rect x="92" y="62" width="72" height="22" fill="#8a7a4a"/><rect x="118" y="44" width="20" height="18" fill="#141210"/>
      <rect x="121" y="56" width="14" height="6" fill="#ff8a3a"/><rect x="126" y="28" width="4" height="16" fill="#1a1410"/>`;
    s += `<rect x="0" y="86" width="256" height="10" fill="#4a3424"/><rect x="0" y="96" width="256" height="14" fill="#3a2a1c"/>`;
    s += `<rect x="12" y="96" width="34" height="8" fill="#7a5a3a"/><rect x="210" y="96" width="34" height="8" fill="#7a5a3a"/>`;
    for (const x of [30, 226]) s += `<rect x="${x - 7}" y="66" width="14" height="20" fill="#f4ecd8"/><rect x="${x - 7}" y="64" width="14" height="3" fill="#1a1410"/>`;
    s += `<text x="128" y="20" font-family="${MIN}" font-weight="700" font-size="9" fill="#e8d7a8" text-anchor="middle">御宿</text>`;
    return s;
  })(),
  // soba shop: counter with noodle trays, low tables, menu tags along the wall
  SOBA: (() => {
    const r = rng(11);
    let s = room('#33251a', '#6a5640');
    for (let x = 8; x < 250; x += 12) s += `<rect x="${x}" y="16" width="9" height="${24 + r() * 6}" fill="#f2ead8"/>
      <rect x="${x + 2}" y="20" width="5" height="${14 + r() * 6}" fill="#1a1a1a" opacity="0.75"/>`;
    s += `<rect x="0" y="60" width="256" height="6" fill="#7a5a3a"/><rect x="0" y="66" width="256" height="30" fill="#4a3424"/>`;
    for (let x = 14; x < 244; x += 30) s += `<rect x="${x}" y="52" width="22" height="8" fill="#2a1d14"/><rect x="${x + 2}" y="50" width="18" height="3" fill="#c9b07a"/>`;
    for (const x of [30, 120, 210]) s += `<rect x="${x - 22}" y="98" width="44" height="6" fill="#7a5a3a"/><rect x="${x - 18}" y="104" width="4" height="8" fill="#3a2a1c"/><rect x="${x + 14}" y="104" width="4" height="8" fill="#3a2a1c"/>`;
    s += `<rect x="100" y="70" width="56" height="16" fill="#efe6d0"/><text x="128" y="82" font-family="${MIN}" font-weight="700" font-size="10" fill="#1a1a1a" text-anchor="middle">手打ち</text>`;
    return s;
  })(),
  // lacquer and wood crafts: red/black bowls on shelves, combs on boards, bentwood boxes
  CRAFT: (() => {
    const r = rng(17);
    let s = room('#2c2018', '#7a6040');
    for (const y of [40, 66, 92]) {
      s += shelf(y);
      for (let x = 8; x < 248; x += 15) {
        const red = r() < 0.55;
        s += `<path d="M${x},${y} q6,-14 12,0 Z" fill="${red ? '#8a1f1a' : '#1a1412'}"/><rect x="${x + 2}" y="${y - 3}" width="8" height="2" fill="${red ? '#b8342a' : '#3a2e28'}"/>`;
      }
    }
    for (let x = 6; x < 250; x += 22) s += `<rect x="${x}" y="12" width="18" height="16" fill="#c9a77a"/>${[0, 1, 2, 3, 4, 5].map(k => `<rect x="${x + 2 + k * 2.6}" y="20" width="1.2" height="7" fill="#5a3e26"/>`).join('')}`;
    for (let x = 10; x < 246; x += 26) s += `<ellipse cx="${x + 10}" cy="106" rx="11" ry="5" fill="#c9a77a"/><rect x="${x - 1}" y="100" width="22" height="6" fill="#b08a5c"/>`;
    return s;
  })(),
  // sake shop: casks on racks, big bottles, a tasting counter
  SAKE: (() => {
    const r = rng(23);
    let s = room('#2a1d14', '#5a4632');
    for (const y of [42, 70]) {
      s += shelf(y);
      for (let x = 6; x < 250; x += 10) {
        const c = pick(r, ['#2c4a2a', '#5b3a1c', '#1f3550', '#3a2a1a', '#6a5a2a']);
        const h = 20 + r() * 6;
        s += `<rect x="${x}" y="${y - h}" width="7" height="${h}" fill="${c}"/><rect x="${x + 2}" y="${y - h - 4}" width="3" height="4" fill="${c}"/>
          <rect x="${x}" y="${y - h * 0.55}" width="7" height="8" fill="${pick(r, ['#f2ead8', '#e8d9a8', '#ffffff'])}"/>`;
      }
    }
    for (let x = 6; x < 250; x += 32) s += `<ellipse cx="${x + 14}" cy="96" rx="15" ry="13" fill="#d2bc86"/><rect x="${x}" y="86" width="28" height="3" fill="#2a3a5a"/>
      <rect x="${x}" y="104" width="28" height="3" fill="#2a3a5a"/><text x="${x + 14}" y="100" font-family="${MIN}" font-weight="700" font-size="9" fill="#1a1a1a" text-anchor="middle">山霧</text>`;
    s += `<rect x="86" y="14" width="84" height="15" fill="#efe6d0"/><text x="128" y="26" font-family="${MIN}" font-weight="700" font-size="10" fill="#1a1a1a" text-anchor="middle">地酒 試飲</text>`;
    return s;
  })(),
  // general goods (aramonoya): straw sandals and baskets hanging, brooms, wooden tubs on the floor
  STRAW: (() => {
    const r = rng(29);
    let s = room('#30241a', '#6a5843');
    for (let x = 6; x < 250; x += 18) {
      s += `<rect x="${x + 7}" y="9" width="1" height="${8 + r() * 6}" fill="#c9b07a"/>`;
      if (r() < 0.5) s += `<rect x="${x}" y="18" width="14" height="26" rx="4" fill="#c9b07a"/>${[22, 28, 34, 40].map(y => `<rect x="${x + 1}" y="${y}" width="12" height="1.4" fill="#8a7444"/>`).join('')}`;
      else s += `<path d="M${x},20 h14 l-2,22 h-10 Z" fill="#a8895a"/>${[0, 3, 6, 9, 12].map(k => `<rect x="${x + 1 + k}" y="21" width="1" height="20" fill="#6a5430"/>`).join('')}`;
    }
    s += shelf(70);
    for (let x = 8; x < 248; x += 20) s += `<ellipse cx="${x + 8}" cy="64" rx="9" ry="6" fill="${pick(r, ['#b08a5c', '#c9a77a', '#7a5a3a'])}"/>`;
    for (let x = 4; x < 252; x += 16) s += `<rect x="${x}" y="76" width="3" height="34" fill="#a48d5e"/><path d="M${x - 4},96 h11 l-2,14 h-7 Z" fill="#c9b07a"/>`;
    for (let x = 30; x < 240; x += 50) s += `<rect x="${x}" y="94" width="26" height="16" fill="#9a7650"/><rect x="${x}" y="98" width="26" height="2" fill="#3a2a1c"/><rect x="${x}" y="105" width="26" height="2" fill="#3a2a1c"/>`;
    return s;
  })(),
  // tea house: charcoal grill with gohei-mochi skewers, kettle, benches with red cloth
  GOHEI: (() => {
    let s = room('#2e2118', '#6a5440');
    s += `<rect x="70" y="54" width="116" height="40" fill="#3a2a1c"/><rect x="74" y="58" width="108" height="10" fill="#d8501f"/><rect x="74" y="58" width="108" height="4" fill="#ffb24a"/>`;
    for (let x = 80; x < 180; x += 12) s += `<rect x="${x}" y="30" width="2" height="30" fill="#c9a874"/><ellipse cx="${x + 1}" cy="40" rx="5" ry="9" fill="#a8743a"/><ellipse cx="${x + 1}" cy="38" rx="4" ry="5" fill="#6a3e1a"/>`;
    s += `<ellipse cx="40" cy="64" rx="16" ry="12" fill="#1a1a1a"/><rect x="38" y="48" width="4" height="6" fill="#1a1a1a"/><rect x="30" y="76" width="20" height="20" fill="#3a2a1c"/>`;
    for (const x of [8, 196]) s += `<rect x="${x}" y="96" width="52" height="6" fill="#b3202a"/><rect x="${x + 4}" y="102" width="4" height="9" fill="#5a3e26"/><rect x="${x + 44}" y="102" width="4" height="9" fill="#5a3e26"/>`;
    s += `<rect x="96" y="14" width="64" height="14" fill="#efe6d0"/><text x="128" y="25" font-family="${MIN}" font-weight="700" font-size="9" fill="#1a1a1a" text-anchor="middle">五平餅 焼きたて</text>`;
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
  kb('旅籠 楓屋', '御宿', '#2a2018', '#e8dcc0', '#141210'),
  kb('山吹', '旅籠', '#c9b48a', '#1a120c', '#3a2818', 38),
  kb('そば処 木霊', '', '#1e1610', '#efe6d0', '#4a3424', 30),
  kb('塗師屋', '漆器', '#141210', '#d9b45a', '#5a1a14'),
  kb('山霧', '地酒', '#2a1d14', '#efe6d0', '#141210', 40),
  kb('荒物 ひさご屋', '', '#b8a07a', '#1a120c', '#3a2818', 26),
  kb('御休処', '茶屋', '#3a2418', '#f2e2b8', '#141210'),
];

// vertical boards (64 x 256)
function kv(text, bg, fg, step = 34, size = 30) {
  return [64, 256, `<rect width="64" height="256" fill="#2a1d14"/><rect x="4" y="4" width="56" height="248" fill="${bg}"/>
    <text font-family="${MIN}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle">${vt(text, 32, 40, step)}</text>`];
}
const KV = [kv('名物お六櫛', '#1e1610', '#e8c26a', 44, 34), kv('手打ちそば', '#efe6d0', '#1a1a1a', 44, 34),
  kv('名物五平餅', '#c9a874', '#1a120c', 44, 34), kv('木曽路旅籠', '#141210', '#efe6d0', 44, 34)];

// noren (128 x 96)
function noren(bg, fg, chars, crest) {
  const n = chars.length, w = 128 / n;
  return [128, 96, `<rect width="128" height="96" fill="${bg}"/><rect width="128" height="10" fill="#000" opacity="0.25"/>
    ${crest ? `<circle cx="64" cy="28" r="11" fill="none" stroke="${fg}" stroke-width="3"/><path d="M57,23 h14 M57,28 h14 M57,33 h14" stroke="${fg}" stroke-width="2.6"/>` : ''}
    <text font-family="${MIN}" font-weight="700" font-size="${Math.min(34, w * 0.75)}" fill="${fg}" text-anchor="middle">${[...chars].map((c, i) => `<tspan x="${w * (i + 0.5)}" y="${crest ? 76 : 64}">${c}</tspan>`).join('')}</text>`];
}
const NOREN = [noren('#1d2a4a', '#f4efe4', '御宿', true), noren('#24324a', '#f4efe4', 'そば', false),
  noren('#5a3a22', '#f4efe4', '酒', true), noren('#141210', '#d9b45a', 'うるし', false), noren('#7a1f1a', '#f4efe4', '茶屋', false)];

// kake-andon: square wall lantern with the inn's name, paper lit from inside (64 x 64)
function andon(main, sub) {
  return [64, 64, `<rect width="64" height="64" fill="#f4e6c4"/><rect width="64" height="64" fill="none" stroke="#2a1d14" stroke-width="5"/>
    <rect x="0" y="0" width="64" height="7" fill="#2a1d14"/><rect x="0" y="57" width="64" height="7" fill="#2a1d14"/>
    <text font-family="${MIN}" font-weight="700" font-size="${main.length > 2 ? 15 : 19}" fill="#141210" text-anchor="middle">${vt(main, 38, main.length > 2 ? 24 : 30, main.length > 2 ? 15 : 20)}</text>
    ${sub ? `<text font-family="${MIN}" font-size="9" fill="#7a1f1a" text-anchor="middle">${vt(sub, 15, 22, 10)}</text>` : ''}`];
}
const ANDON = [andon('楓屋', '御宿'), andon('山吹', '旅籠'), andon('そば', ''), andon('休処', 'お')];

// round paper lanterns, unwrapped once round
function chochin(text, size, bg = '#f4ecd8', fg = '#141210') {
  return [128, 64, `<rect width="128" height="64" fill="${bg}"/>
    ${[0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60].map(y => `<rect y="${y}" width="128" height="1" fill="#000" opacity="0.12"/>`).join('')}
    <text font-family="${MIN}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle"><tspan x="32" y="44">${text}</tspan><tspan x="96" y="44">${text}</tspan></text>`];
}

function nobori(bg, fg, text, top, step = 22, size = 17) {
  return [128, 32, `<g transform="translate(128,0) rotate(90)"><rect width="32" height="128" fill="${bg}"/>
    <rect width="4" height="128" fill="#ffffff"/><rect y="0" width="32" height="10" fill="${top}"/>
    <text font-family="${JP}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle">${vt(text, 18, 32, step)}</text></g>`];
}

export const KISO = {
  ...Object.fromEntries(Object.entries(INT).map(([k, v]) => [`INT_${k}`, [256, 128, v]])),
  ...Object.fromEntries(KB.map((v, i) => [`KB${i}`, v])),
  ...Object.fromEntries(KV.map((v, i) => [`KV${i}`, v])),
  ...Object.fromEntries(NOREN.map((v, i) => [`NOREN${i}`, v])),
  ...Object.fromEntries(ANDON.map((v, i) => [`ANDON${i}`, v])),
  CHOCHIN0: chochin('旅籠', 20),
  CHOCHIN1: chochin('山吹', 20, '#f4ecd8', '#7a1f1a'),
  NOBORI0: nobori('#7a1f1a', '#ffffff', '五平餅', '#e8b51a', 26, 18),
  NOBORI1: nobori('#1d2a4a', '#ffffff', '手打そば', '#f4efe4', 24, 17),
  // straw sandals (waraji) tied in bunches, hanging
  WARAJI: [64, 128, (() => {
    let s = `<rect width="64" height="128" fill="#3a2a1c"/>`;
    for (const [x, y] of [[4, 6], [34, 10], [4, 66], [34, 70]]) {
      s += `<rect x="${x + 12}" y="${y - 6}" width="2" height="10" fill="#c9b07a"/>
        <rect x="${x}" y="${y + 2}" width="26" height="52" rx="10" fill="#c9b07a"/>`;
      for (let k = 0; k < 9; k++) s += `<rect x="${x + 2}" y="${y + 6 + k * 5.4}" width="22" height="1.6" fill="#8a7444"/>`;
      s += `<rect x="${x + 11}" y="${y + 4}" width="4" height="48" fill="#a8895a"/><rect x="${x + 2}" y="${y + 18}" width="22" height="2" fill="#5a2a1a"/>`;
    }
    return s;
  })()],
  // firewood stack seen end-on: split log ends with rings, dark gaps
  LOGS: [128, 64, (() => {
    const r = rng(41);
    let s = `<rect width="128" height="64" fill="#1e1610"/>`;
    for (let y = 6; y < 64; y += 11) for (let x = (y % 2) * 6 + 5; x < 128; x += 12) {
      const rr = 4.6 + r() * 1.6, a = r() * 6.28;
      s += `<path d="M${x},${y} m${-rr},0 a${rr},${rr} 0 1,0 ${2 * rr},0 L${x},${y} Z" transform="rotate(${a * 57},${x},${y})" fill="#b08a5c"/>
        <circle cx="${x}" cy="${y}" r="${rr}" fill="none" stroke="#5a4028" stroke-width="1.1"/>
        <circle cx="${x}" cy="${y}" r="${rr * 0.55}" fill="none" stroke="#8a6a44" stroke-width="0.6"/><circle cx="${x}" cy="${y}" r="0.9" fill="#5a4028"/>`;
    }
    return s;
  })()],
  // woven basket (kago) wrap
  KAGO: [64, 64, (() => {
    let s = `<rect width="64" height="64" fill="#8a7040"/>`;
    for (let y = 0; y < 64; y += 6) for (let x = (y / 6 % 2) * 4; x < 64; x += 8) s += `<rect x="${x}" y="${y}" width="5" height="5" rx="1" fill="#c9ad74"/>`;
    s += `<rect width="64" height="5" fill="#5a4024"/>`;
    return s;
  })()],
  // tea house menu board
  MENU: [64, 96, `<rect width="64" height="96" fill="#5a3b22"/><rect x="4" y="4" width="56" height="88" fill="#efe6d0"/>
    <text x="32" y="16" font-family="${MIN}" font-weight="700" font-size="9" fill="#1a1a1a" text-anchor="middle">お品書き</text>
    ${['五平餅', '栗おこわ', 'ざるそば', '甘酒', 'お茶'].map((t, i) => `<text x="7" y="${32 + i * 12}" font-family="${MIN}" font-size="7" fill="#1a1a1a">${t}</text>
    <text x="57" y="${32 + i * 12}" font-family="${MIN}" font-size="7" fill="#b3202a" text-anchor="end">${['四百', '六百', '八百', '三百', '百'][i]}</text>`).join('')}`],
  BUCKET: KOEDO.BUCKET,
  SUDARE: KOEDO.SUDARE,
};
