// KoedoShop atlas graphics: shop fronts of the kura town (Kawagoe-like main
// street and the sweets lane). Every shop, brand and price is invented.
// Imported by graphics.mjs (names get the prefix KO_).
const JP = "'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif";
const MIN = "'Hiragino Mincho ProN',serif";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const vt = (chars, x, y0, step) => [...chars].map((c, i) => `<tspan x="${x}" y="${y0 + i * step}">${c}</tspan>`).join('');

// warm shop interior: dark wooden back wall, ceiling light, raised tatami/wood floor at the bottom
function room(bg = '#3a2617', floor = '#7a5532') {
  let s = `<rect width="256" height="128" fill="${bg}"/>`;
  s += `<rect width="256" height="10" fill="#1c130c"/>`;
  for (const x of [40, 128, 216]) s += `<rect x="${x - 14}" y="6" width="28" height="4" fill="#ffe2a8"/>`;
  s += `<rect y="108" width="256" height="20" fill="${floor}"/><rect y="108" width="256" height="2" fill="#2a1b10"/>`;
  return s;
}
function shelf(y, x0 = 4, x1 = 252) { return `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="3" fill="#6b4a2c"/>`; }

const INT = {
  // sake shop: isshōbin bottles on wall shelves, straw-wrapped casks below
  SAKE: (() => {
    const r = rng(3);
    let s = room();
    for (const y of [38, 66, 92]) {
      s += shelf(y);
      for (let x = 6; x < 250; x += 9) {
        const c = pick(r, ['#2c4a2a', '#5b3a1c', '#1f3550', '#c9d6c8', '#3a2a1a', '#6a2a1c']);
        const h = 18 + r() * 6;
        s += `<rect x="${x}" y="${y - h}" width="6" height="${h}" fill="${c}"/><rect x="${x + 2}" y="${y - h - 4}" width="2" height="4" fill="${c}"/>`;
        s += `<rect x="${x}" y="${y - h * 0.55}" width="6" height="7" fill="${pick(r, ['#f2ead8', '#f4f0e4', '#e8d9a8', '#ffffff'])}"/>`;
      }
    }
    for (let x = 10; x < 250; x += 30) {
      s += `<ellipse cx="${x + 12}" cy="114" rx="13" ry="12" fill="#d8c48e"/><rect x="${x}" y="104" width="24" height="3" fill="#7a2a1c"/>
        <rect x="${x}" y="120" width="24" height="3" fill="#7a2a1c"/><text x="${x + 12}" y="117" font-family="${MIN}" font-weight="700" font-size="9" fill="#1a1a1a" text-anchor="middle">酒</text>`;
    }
    s += `<rect x="78" y="12" width="100" height="16" fill="#efe6d0"/><text x="128" y="25" font-family="${MIN}" font-weight="700" font-size="11" fill="#1a1a1a" text-anchor="middle">地酒 小江戸鶴</text>`;
    return s;
  })(),
  // sweets shop: glass jars of candy on tiered wooden stands, paper bags hanging
  SWEETS: (() => {
    const r = rng(5);
    let s = room('#4a3020', '#8a6238');
    for (let x = 6; x < 250; x += 14) s += `<rect x="${x}" y="12" width="10" height="${10 + r() * 8}" fill="${pick(r, ['#e8412c', '#f2c230', '#3aa45a', '#f39ab3', '#2f7fd1', '#f7f3ea'])}"/>`;
    for (const [y, step] of [[64, 22], [88, 20], [108, 18]]) {
      s += shelf(y);
      for (let x = 6; x < 246; x += step) {
        const c = pick(r, ['#e8412c', '#f2c230', '#3aa45a', '#f39ab3', '#8a4fd1', '#f08a1c', '#7a4a2a']);
        s += `<rect x="${x}" y="${y - 18}" width="${step - 5}" height="18" rx="3" fill="#cfe2e6" opacity="0.9"/>`;
        s += `<rect x="${x + 2}" y="${y - 12}" width="${step - 9}" height="11" fill="${c}"/>`;
        s += `<rect x="${x + 1}" y="${y - 21}" width="${step - 7}" height="4" fill="#d8301f"/>`;
      }
    }
    s += `<rect x="90" y="24" width="76" height="16" fill="#f4ead2"/><text x="128" y="37" font-family="${JP}" font-weight="700" font-size="10" fill="#b3202a" text-anchor="middle">駄菓子 一個 十円</text>`;
    return s;
  })(),
  // souvenir shop: folding fans, tenugui towels hanging, lucky cats and boxes
  SOUVENIR: (() => {
    const r = rng(8);
    let s = room('#40301f', '#9a7a52');
    for (let x = 4; x < 252; x += 16) {
      const c = pick(r, ['#1d2a4a', '#b3202a', '#2a7a4a', '#e8b51a', '#f4efe4', '#6a3a8a']);
      s += `<rect x="${x}" y="12" width="13" height="30" fill="${c}"/><rect x="${x + 3}" y="18" width="7" height="2" fill="#f4efe4" opacity="0.7"/>
        <circle cx="${x + 6.5}" cy="30" r="3" fill="#f4efe4" opacity="0.6"/>`;
    }
    s += shelf(64) + shelf(88);
    for (let x = 8; x < 248; x += 20) {
      if (r() < 0.5) s += `<path d="M${x},62 L${x + 8},44 L${x + 16},62 Z" fill="${pick(r, ['#c8241c', '#1d2a4a', '#e8b51a'])}"/>`;
      else s += `<circle cx="${x + 8}" cy="54" r="7" fill="#f7f3ea"/><circle cx="${x + 8}" cy="46" r="5" fill="#f7f3ea"/><rect x="${x + 4}" y="55" width="8" height="2" fill="#c8241c"/>`;
      s += `<rect x="${x}" y="${72}" width="16" height="16" fill="${pick(r, ['#8a2a24', '#d8cdb4', '#2f5f5a', '#b8642c'])}"/>`;
    }
    for (let x = 4; x < 252; x += 24) s += `<rect x="${x}" y="94" width="20" height="14" fill="${pick(r, ['#e8b51a', '#c43b7a', '#3a6a9a'])}"/>`;
    return s;
  })(),
  // eel restaurant: counter, wooden tables, menu tags on the wall
  UNAGI: (() => {
    let s = room('#2e1f14', '#5a3e26');
    s += `<rect y="14" width="256" height="26" fill="#d8c9a6"/>`;
    ['うな重 松', 'うな重 竹', '白焼', 'う巻', '肝吸', '鰻丼', 'お新香', '冷酒'].forEach((t, i) => {
      s += `<rect x="${8 + i * 31}" y="16" width="26" height="22" fill="#f7f0de"/><text font-family="${MIN}" font-size="6" fill="#1a1a1a" text-anchor="middle">${vt(t.slice(0, 3), 21 + i * 31, 24, 7)}</text>`;
    });
    s += `<rect y="58" width="256" height="8" fill="#6b4a2c"/><rect y="66" width="256" height="42" fill="#3b2818"/>`;
    for (const x of [30, 110, 190]) s += `<rect x="${x}" y="78" width="40" height="5" fill="#8a6238"/><rect x="${x + 4}" y="83" width="4" height="25" fill="#2a1b10"/><rect x="${x + 32}" y="83" width="4" height="25" fill="#2a1b10"/>`;
    s += `<rect x="0" y="40" width="256" height="18" fill="#2a1b10"/><text x="128" y="53" font-family="${MIN}" font-size="11" fill="#e8c26a" text-anchor="middle">創業 明治十年</text>`;
    return s;
  })(),
  // sweet-potato sweets: purple and gold boxes stacked, a steaming roast pot
  IMO: (() => {
    const r = rng(13);
    let s = room('#3e2a1a', '#8a6238');
    s += shelf(48) + shelf(78);
    for (let x = 6; x < 250; x += 18) {
      s += `<rect x="${x}" y="30" width="15" height="18" fill="${pick(r, ['#5a2a6a', '#7a3a8a', '#e8b51a', '#c8241c'])}"/><rect x="${x}" y="36" width="15" height="3" fill="#f4ead2"/>`;
      s += `<rect x="${x}" y="58" width="15" height="20" fill="${pick(r, ['#e8b51a', '#5a2a6a', '#f4ead2', '#8a5a2a'])}"/>`;
    }
    for (let x = 10; x < 240; x += 26) s += `<ellipse cx="${x + 10}" cy="${96 + r() * 4}" rx="10" ry="5" fill="#7a2a5a"/><ellipse cx="${x + 10}" cy="${95}" rx="5" ry="2" fill="#e8b51a"/>`;
    s += `<rect x="96" y="12" width="64" height="14" fill="#5a2a6a"/><text x="128" y="23" font-family="${MIN}" font-weight="700" font-size="10" fill="#f4ead2" text-anchor="middle">名物 芋ようかん</text>`;
    return s;
  })(),
  // crafts: pottery, glass, bamboo baskets on low tables
  CRAFT: (() => {
    const r = rng(21);
    let s = room('#3a2c20', '#a07a50');
    s += shelf(52) + shelf(84);
    for (let x = 8; x < 248; x += 16) {
      const c = pick(r, ['#5a6a7a', '#8a5a3a', '#d8cdb4', '#2a4a5a', '#7a3a2a', '#c9b48a']);
      s += `<path d="M${x},52 Q${x - 2},${40 - r() * 8} ${x + 6},${34 - r() * 6} Q${x + 14},${40 - r() * 8} ${x + 12},52 Z" fill="${c}"/>`;
      s += `<rect x="${x}" y="${70 - r() * 6}" width="12" height="${14}" fill="${pick(r, ['#9ad2e6', '#3a8aa6', '#e6c35a', '#c9b48a'])}" opacity="0.9"/>`;
    }
    for (let x = 10; x < 246; x += 30) s += `<ellipse cx="${x + 12}" cy="100" rx="13" ry="7" fill="#b48a4a"/><path d="M${x},100 h24" stroke="#7a5a2a" stroke-width="1"/>`;
    return s;
  })(),
  // tea shop: canisters (chazutsu) on shelves, tea boxes, a brass scale on the counter
  TEA: (() => {
    const r = rng(31);
    let s = room('#3a2a1a', '#8a6a40');
    for (const y of [44, 72]) {
      s += shelf(y);
      for (let x = 6; x < 250; x += 13) {
        const c = pick(r, ['#2a4a2a', '#1a1a1a', '#8a1f1a', '#c9a874', '#4a6a2a', '#a08440']);
        s += `<rect x="${x}" y="${y - 22}" width="10" height="22" rx="1" fill="${c}"/><rect x="${x}" y="${y - 24}" width="10" height="3" fill="#a08440"/>
          <rect x="${x + 2}" y="${y - 16}" width="6" height="8" fill="#efe6d0"/>`;
      }
    }
    s += `<rect y="84" width="256" height="24" fill="#5a3e26"/>`;
    for (let x = 8; x < 248; x += 22) s += `<rect x="${x}" y="${86 + r() * 3}" width="18" height="10" fill="${pick(r, ['#4a6a2a', '#2a4a2a', '#efe6d0', '#c9a874'])}"/>`;
    s += `<rect x="96" y="12" width="64" height="16" fill="#24321e"/><text x="128" y="24" font-family="${MIN}" font-weight="700" font-size="10" fill="#e8d79a" text-anchor="middle">狭山茶 量り売り</text>`;
    return s;
  })(),
};

// roof signboards (yane-kanban): dark or natural wood, carved gilt Mincho letters
function kb(main, sub, bg, fg, frame) {
  return [256, 64, `<rect width="256" height="64" fill="${frame}"/><rect x="5" y="5" width="246" height="54" fill="${bg}"/>
    ${[12, 22, 34, 46].map(y => `<rect x="5" y="${y}" width="246" height="1" fill="#000" opacity="0.08"/>`).join('')}
    <text x="${sub ? 140 : 128}" y="45" font-family="${MIN}" font-weight="700" font-size="34" fill="${fg}" text-anchor="middle" letter-spacing="4">${main}</text>
    ${sub ? `<text font-family="${MIN}" font-size="11" fill="${fg}" text-anchor="middle">${vt(sub, 24, 22, 13)}</text>` : ''}`];
}
const KB = [
  kb('小江戸鶴', '清酒', '#1e1610', '#d9b45a', '#3a2818'),
  kb('福まる', '菓子', '#c9a874', '#1a120c', '#3a2818'),
  kb('鰻 川よし', '', '#141210', '#efe6d0', '#5a3a22'),
  kb('みやげ 蔵屋', '', '#2a1d14', '#e8c26a', '#141210'),
  kb('紅あか', '芋菓子', '#7a1f1a', '#f4e2b0', '#2a1d14'),
  kb('甘味処 さつき', '', '#d6c29a', '#2a1810', '#3a2818'),
  kb('土の香', '陶器', '#1e1610', '#e6dccb', '#4a3424'),
  kb('松葉園', '茶舗', '#24321e', '#e8d79a', '#141210'),
];

// vertical boards beside the entrance (64 x 256)
function kv(text, bg, fg, step = 34, size = 30) {
  return [64, 256, `<rect width="64" height="256" fill="#2a1d14"/><rect x="4" y="4" width="56" height="248" fill="${bg}"/>
    <text font-family="${MIN}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle">${vt(text, 32, 42, step)}</text>`];
}
const KV = [kv('名物芋ようかん', '#efe6d0', '#1a1a1a', 32, 26), kv('元祖駄菓子', '#1e1610', '#e8c26a', 42), kv('御酒', '#c9a874', '#1a120c', 60, 44),
  kv('うなぎ蒲焼', '#141210', '#efe6d0', 42)];

// noren curtains (128 x 96): split into panels by the geometry
function noren(bg, fg, chars, crest) {
  const n = chars.length, w = 128 / n;
  return [128, 96, `<rect width="128" height="96" fill="${bg}"/><rect width="128" height="10" fill="#000" opacity="0.25"/>
    ${crest ? `<circle cx="64" cy="30" r="11" fill="none" stroke="${fg}" stroke-width="3"/><path d="M57,30 h14 M64,23 v14" stroke="${fg}" stroke-width="3"/>` : ''}
    <text font-family="${MIN}" font-weight="700" font-size="${Math.min(30, w * 0.75)}" fill="${fg}" text-anchor="middle">${[...chars].map((c, i) => `<tspan x="${w * (i + 0.5)}" y="${crest ? 74 : 62}">${c}</tspan>`).join('')}</text>`];
}
const NOREN = [noren('#1d2a4a', '#f4efe4', 'さけ', true), noren('#f4efe4', '#1a1a1a', 'うなぎ', false),
  noren('#6a3a22', '#f4efe4', '甘味', true), noren('#24324a', '#f4efe4', 'みやげ', false),
  noren('#b3202a', '#f4efe4', 'だがし', false), noren('#2a4a2a', '#f4efe4', 'お茶', true)];

// nobori flags, lying on their side like the Tokyo ones
function nobori(bg, fg, text, top, step = 22, size = 17) {
  return [128, 32, `<g transform="translate(128,0) rotate(90)"><rect width="32" height="128" fill="${bg}"/>
    <rect width="4" height="128" fill="#ffffff"/><rect y="0" width="32" height="10" fill="${top}"/>
    <text font-family="${JP}" font-weight="700" font-size="${size}" fill="${fg}" text-anchor="middle">${vt(text, 18, 32, step)}</text></g>`];
}
const NOBORI = [nobori('#5a2a6a', '#ffffff', 'さつまいも', '#e8b51a', 19, 15), nobori('#f4efe4', '#b3202a', 'だんご', '#2a4a2a'),
  nobori('#e8b51a', '#5a2a1a', '甘味処', '#b3202a'), nobori('#2a4a7a', '#ffffff', '小江戸', '#b3202a')];

// white paper lanterns, unwrapped once round (text on both halves)
function chochin(text, size = 30) {
  return [128, 64, `<rect width="128" height="64" fill="#f4ecd8"/>
    ${[0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60].map(y => `<rect y="${y}" width="128" height="1" fill="#d6c8a8"/>`).join('')}
    <text font-family="${MIN}" font-weight="700" font-size="${size}" fill="#141210" text-anchor="middle"><tspan x="32" y="44">${text}</tspan><tspan x="96" y="44">${text}</tspan></text>`];
}

export const KOEDO = {
  ...Object.fromEntries(Object.entries(INT).map(([k, v]) => [`INT_${k}`, [256, 128, v]])),
  ...Object.fromEntries(KB.map((v, i) => [`KB${i}`, v])),
  ...Object.fromEntries(KV.map((v, i) => [`KV${i}`, v])),
  ...Object.fromEntries(NOREN.map((v, i) => [`NOREN${i}`, v])),
  ...Object.fromEntries(NOBORI.map((v, i) => [`NOBORI${i}`, v])),
  CHOCHIN0: chochin('御休処', 15),
  CHOCHIN1: chochin('小江戸', 17),
  // candy in a glass jar (wrapped round the jar cylinder)
  CANDY: [64, 64, (() => {
    const r = rng(9);
    let s = `<rect width="64" height="64" fill="#cfe2e6"/>`;
    for (let i = 0; i < 70; i++) s += `<circle cx="${r() * 64}" cy="${14 + r() * 50}" r="${2 + r() * 2.5}" fill="${pick(r, ['#e8412c', '#f2c230', '#3aa45a', '#f39ab3', '#8a4fd1', '#f08a1c', '#ffffff'])}"/>`;
    s += `<rect width="64" height="12" fill="#e6f2f4" opacity="0.8"/><rect x="0" y="0" width="64" height="4" fill="#d8301f"/>`;
    return s;
  })()],
  // bamboo blind (sudare)
  SUDARE: [64, 128, `<rect width="64" height="128" fill="#b39a62"/>
    ${Array.from({ length: 43 }, (_, i) => `<rect y="${i * 3}" width="64" height="1" fill="#7a6438"/>`).join('')}
    ${[10, 32, 54].map(x => `<rect x="${x}" width="1.5" height="128" fill="#3a2a18"/>`).join('')}
    <rect y="0" width="64" height="5" fill="#5a4024"/>`],
  // menu board on a stand (お品書き)
  MENU: [64, 96, `<rect width="64" height="96" fill="#5a3b22"/><rect x="4" y="4" width="56" height="88" fill="#efe6d0"/>
    <text x="32" y="16" font-family="${MIN}" font-weight="700" font-size="9" fill="#1a1a1a" text-anchor="middle">お品書き</text>
    ${['芋ようかん', 'みたらし団子', '抹茶', '芋ソフト', 'あんみつ'].map((t, i) => `<text x="7" y="${32 + i * 12}" font-family="${MIN}" font-size="6.5" fill="#1a1a1a">${t}</text>
    <text x="57" y="${32 + i * 12}" font-family="${MIN}" font-size="6.5" fill="#b3202a" text-anchor="end">${['四五〇', '三百', '六百', '四百', '七百'][i]}</text>`).join('')}`],
  // red fire buckets: 防火用水
  BUCKET: [64, 32, `<rect width="64" height="32" fill="#b3202a"/><rect y="0" width="64" height="3" fill="#7a1612"/>
    <text x="16" y="21" font-family="${JP}" font-weight="700" font-size="9" fill="#ffffff" text-anchor="middle">防火</text>
    <text x="48" y="21" font-family="${JP}" font-weight="700" font-size="9" fill="#ffffff" text-anchor="middle">用水</text>`],
};
