// MachiShop atlas graphics (task 5b): the modern town - car dealer Petal Motors
// and workshop Open Bay at Sakura Commons, modern prefab houses (nameplates,
// mailbox), the wooden izakaya of the Tokyo yokochō alleys (red lanterns,
// noren, signboards, interiors). Every name, brand and price is invented.
// Imported by graphics.mjs (names get the prefix MA_).

const JP = "'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif";
const MIN = "'Hiragino Mincho ProN',serif";
const SANS = "Helvetica, Arial, sans-serif";
const vt = (chars, x, y0, step) => [...chars].map((c, i) => `<tspan x="${x}" y="${y0 + i * step}">${c}</tspan>`).join('');

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// the dealer's mark: five petals (sakura) in a ring
const petal = (x, y, r, fill = '#e5487a', core = '#ffffff') => `<g transform="translate(${x},${y})">
  ${[0, 72, 144, 216, 288].map(a => `<path d="M0,${-r * 0.18} C${-r * 0.55},${-r * 0.55} ${-r * 0.32},${-r * 1.02} 0,${-r * 0.86}
    C${r * 0.32},${-r * 1.02} ${r * 0.55},${-r * 0.55} 0,${-r * 0.18} Z" fill="${fill}" transform="rotate(${a})"/>`).join('')}
  <circle r="${r * 0.16}" fill="${core}"/></g>`;

// izakaya interior (seen through the open door / glass): counter with stools,
// shelves of bottles, menu tags on the wall, a lamp, smoke over the grill
function izakaya(seed, wall, tags, grill = true) {
  const r = rng(seed);
  let s = `<rect width="256" height="128" fill="${wall}"/><rect y="0" width="256" height="10" fill="#2a1a10"/>`;
  s += `<rect y="20" width="256" height="26" fill="#5a3a22"/>`;
  for (let i = 0; i < tags.length; i++) {           // hand-written menu tags (tanzaku) on the wall
    const x = 6 + i * (244 / tags.length);
    s += `<rect x="${x}" y="22" width="14" height="22" fill="${r() < 0.2 ? '#f6d36a' : '#f4ecd8'}"/>
      <text font-family="${MIN}" font-weight="700" font-size="6.5" fill="#1a1410" text-anchor="middle">${vt(tags[i], x + 7, 29, 6.6)}</text>`;
  }
  for (let x = 4; x < 252; x += 7) {                // bottle shelf
    const h = 9 + r() * 6;
    s += `<rect x="${x}" y="${66 - h}" width="4" height="${h}" fill="${['#2a5a2a', '#6a3a1a', '#d8d0b8', '#1a2a4a', '#8a6a2a'][Math.floor(r() * 5)]}"/>`;
  }
  s += `<rect y="66" width="256" height="3" fill="#3a2414"/>`;
  s += `<rect y="82" width="256" height="10" fill="#c49a64"/><rect y="92" width="256" height="20" fill="#6a4426"/>`;  // counter
  for (let x = 18; x < 250; x += 30) s += `<rect x="${x}" y="104" width="14" height="4" fill="#b8202a"/><rect x="${x + 6}" y="108" width="2" height="20" fill="#222"/>`;
  for (let x = 30; x < 240; x += 52) s += `<rect x="${x}" y="76" width="8" height="6" fill="#f2efe6"/><rect x="${x + 14}" y="78" width="10" height="4" fill="#e8b51a"/>`;
  if (grill) s += `<rect x="160" y="70" width="60" height="8" fill="#1a1a1a"/><rect x="164" y="68" width="52" height="3" fill="#ff7a2a"/>
    <ellipse cx="190" cy="52" rx="34" ry="12" fill="#ffffff" opacity="0.18"/>`;
  s += `<circle cx="60" cy="14" r="5" fill="#ffd27a"/><circle cx="190" cy="14" r="5" fill="#ffd27a"/>`;
  return s;
}

// akachōchin: red paper lantern, wrapped round the body (128 x 64, text twice round)
function chochin(bg, ink, text, size = 26) {
  const ribs = Array.from({ length: 9 }, (_, i) => `<rect x="0" y="${4 + i * 7}" width="128" height="1.2" fill="#000" opacity="0.18"/>`).join('');
  const t = (x) => `<text font-family="${MIN}" font-weight="800" font-size="${size}" fill="${ink}" text-anchor="middle">${vt(text, x, 26, size * 0.95)}</text>`;
  return [128, 64, `<rect width="128" height="64" fill="${bg}"/>${ribs}${text.length > 1 ? `<g transform="scale(1,${Math.min(1, 52 / (text.length * size * 0.95))})">${t(32)}${t(96)}</g>` : `${t(32)}${t(96)}`}`];
}

// horizontal signboard over an izakaya door (256 x 64)
function kanban(bg, fg, big, small, edge = '#1a1410', font = MIN) {
  return [256, 64, `<rect width="256" height="64" fill="${edge}"/><rect x="4" y="4" width="248" height="56" fill="${bg}"/>
    <text x="128" y="44" font-family="${font}" font-weight="800" font-size="34" fill="${fg}" text-anchor="middle" letter-spacing="6">${big}</text>
    <text x="22" y="40" font-family="${JP}" font-weight="700" font-size="11" fill="${fg}" text-anchor="middle">${vt(small, 22, 22, 12)}</text>`];
}

// vertical signboard (64 x 256)
function tate(bg, fg, text, sub, size = 30) {
  return [64, 256, `<rect width="64" height="256" fill="#1a1410"/><rect x="3" y="3" width="58" height="250" fill="${bg}"/>
    <text font-family="${MIN}" font-weight="800" font-size="${size}" fill="${fg}" text-anchor="middle">${vt(text, 32, 40, size * 1.15)}</text>
    <text x="32" y="244" font-family="${JP}" font-size="9" fill="${fg}" text-anchor="middle">${sub}</text>`];
}

// noren: split curtain, text across (128 x 96)
function noren(bg, fg, text, size = 30, mark = '') {
  return [128, 96, `<rect width="128" height="96" fill="${bg}"/><rect width="128" height="10" fill="${fg}" opacity="0.25"/>
    ${mark}<text x="64" y="62" font-family="${MIN}" font-weight="800" font-size="${size}" fill="${fg}" text-anchor="middle" letter-spacing="4">${text}</text>
    ${[32, 64, 96].map(x => `<rect x="${x - 0.8}" y="18" width="1.6" height="78" fill="#000" opacity="0.35"/>`).join('')}`];
}

// nobori lying on its side (128 x 32, same layout as the Koedo flags): drawn upright, turned 90°
function nobori(bg, fg, band, text, size = 16, step = 19) {
  return [128, 32, `<g transform="translate(128,0) rotate(90)"><rect width="32" height="128" fill="${bg}"/>
    <rect width="4" height="128" fill="${band}"/><rect y="0" width="32" height="10" fill="${band}"/>
    <text font-family="${JP}" font-weight="800" font-size="${size}" fill="${fg}" text-anchor="middle">${vt(text, 18, 30, step)}</text></g>`];
}

// price card standing by each car (64 x 32): model, price
function price(model, yen, col) {
  return [64, 32, `<rect width="64" height="32" fill="#ffffff"/><rect width="64" height="8" fill="${col}"/>
    <text x="32" y="7" font-family="${SANS}" font-weight="700" font-size="6" fill="#fff" text-anchor="middle" letter-spacing="0.5">${model}</text>
    <text x="5" y="18" font-family="${JP}" font-size="5.5" fill="#333">車両本体価格</text>
    <text x="60" y="28" font-family="${SANS}" font-weight="900" font-size="11" fill="#c8102e" text-anchor="end">${yen}</text>
    <text x="61" y="18" font-family="${JP}" font-size="5" fill="#333" text-anchor="end">万円</text>`];
}

// house nameplate (hyōsatsu), 64 x 32
function nameplate(bg, ink, name, font = MIN) {
  return [64, 32, `<rect width="64" height="32" fill="${bg}"/><rect x="1.5" y="1.5" width="61" height="29" fill="none" stroke="#000" stroke-opacity="0.2" stroke-width="1"/>
    <text x="32" y="22" font-family="${font}" font-weight="700" font-size="14" fill="${ink}" text-anchor="middle" letter-spacing="3">${name}</text>`];
}

export const MACHI = {
  // ── izakaya interiors ──
  INT_IZA_A: [256, 128, izakaya(3, '#7a5a3a', ['焼鳥', 'もも', 'ねぎま', 'つくね', 'レバー', '皮', '砂肝', 'ハツ', '生ビール', 'ホッピー', '冷奴', 'お新香'])],
  INT_IZA_B: [256, 128, izakaya(7, '#8a6a46', ['おでん', '大根', 'たまご', 'ちくわ', 'がんも', '熱燗', '冷酒', '焼酎', 'ハイボール', 'もつ煮'], false)],
  INT_IZA_C: [256, 128, izakaya(11, '#6a4a30', ['もつ焼', 'かしら', 'たん', 'しろ', 'なんこつ', 'サワー', 'ホッピー', '煮込み', 'ポテサラ', '枝豆', '瓶ビール'])],
  INT_IZA_D: [256, 128, izakaya(17, '#5a4636', ['刺身', 'まぐろ', 'あじ', 'いか', '焼魚', '日本酒', '梅酒', '天ぷら', 'しめ', 'お茶漬'], false)],
  // ── izakaya signs, lanterns, noren, menus ──
  KB0: kanban('#f4ecd8', '#1a1410', '鳥よし', '焼鳥'),
  KB1: kanban('#b8202a', '#ffffff', 'ひょうたん', '呑処'),
  KB2: kanban('#1d2a4a', '#f4ecd8', 'まる八', 'もつ'),
  KB3: kanban('#e8b51a', '#1a1410', '千鳥', 'おでん'),
  KB4: kanban('#f4ecd8', '#b8202a', '大衆酒場', '昭和', '#b8202a', JP),
  KB5: kanban('#2a2a2a', '#ffd23f', '立呑 角', '酒', '#1a1a1a', JP),
  KV0: tate('#f4ecd8', '#b8202a', '焼とり', '鳥よし'),
  KV1: tate('#b8202a', '#ffffff', '酒処', 'ひょうたん'),
  KV2: tate('#1d2a4a', '#ffffff', 'もつ焼', 'まる八'),
  KV3: tate('#f4ecd8', '#1a1410', 'おでん', '千鳥'),
  CH0: chochin('#d8301f', '#141010', '焼鳥'),
  CH1: chochin('#d8301f', '#141010', '酒'),
  CH2: chochin('#d8301f', '#141010', 'おでん', 22),
  CH3: chochin('#efe6cf', '#b8202a', '生ビール', 18),
  NOREN0: noren('#1d2a4a', '#f4ecd8', '焼鳥'),
  NOREN1: noren('#b8202a', '#ffffff', '呑処'),
  NOREN2: noren('#f4ecd8', '#1a1410', 'もつ焼', 26),
  NOREN3: noren('#3a5a3a', '#f4ecd8', 'おでん', 28),
  NOREN4: noren('#2a2a2a', '#ffffff', '酒', 40),
  NOREN5: noren('#7a2a5a', '#f4ecd8', '酒場', 34),
  MENU: [64, 96, `<rect width="64" height="96" fill="#22302a"/><rect x="2" y="2" width="60" height="92" fill="none" stroke="#7a5a3a" stroke-width="4"/>
    <text x="32" y="18" font-family="${JP}" font-weight="700" font-size="7.5" fill="#f4ecd8" text-anchor="middle">本日のおすすめ</text>
    ${['生ビール 480', 'ハイボール 400', '焼鳥 5本 750', 'もつ煮込み 450', '冷奴 300', 'ポテサラ 380'].map((t, i) => `<text x="7" y="${34 + i * 10}" font-family="${JP}" font-size="7" fill="#f4ecd8">${t}</text>`).join('')}
    <circle cx="50" cy="86" r="4" fill="#ff6a8a"/>`],
  POSTER: [64, 96, `<rect width="64" height="96" fill="#f2c230"/><circle cx="32" cy="44" r="20" fill="#ffffff"/>
    <rect x="22" y="30" width="20" height="30" rx="3" fill="#e8a020"/><rect x="22" y="26" width="20" height="8" rx="3" fill="#ffffff"/>
    <text x="32" y="16" font-family="${JP}" font-weight="800" font-size="12" fill="#b8202a" text-anchor="middle">生ビール</text>
    <text x="32" y="82" font-family="${SANS}" font-weight="900" font-size="9" fill="#1a1410" text-anchor="middle">SAKURA LAGER</text>
    <text x="32" y="92" font-family="${JP}" font-size="6" fill="#1a1410" text-anchor="middle">お酒は二十歳になってから</text>`],
  CRATE: [64, 32, `<rect width="64" height="32" fill="#e8b51a"/><rect x="4" y="4" width="56" height="10" rx="2" fill="#b88a10"/>
    <text x="32" y="27" font-family="${SANS}" font-weight="900" font-size="9" fill="#7a2a10" text-anchor="middle" letter-spacing="1">SAKURA</text>`],
  // ── Petal Motors (car dealer) ──
  PETAL_FASCIA: [512, 64, `<rect width="512" height="64" fill="#f6f6f4"/><rect y="52" width="512" height="12" fill="#d4335f"/>
    ${petal(40, 28, 22)}<text x="76" y="40" font-family="${SANS}" font-weight="900" font-size="30" fill="#2a2a30" letter-spacing="3">PETAL MOTORS</text>
    <text x="496" y="34" font-family="${JP}" font-weight="700" font-size="16" fill="#2a2a30" text-anchor="end">ペタルモータース</text>
    <text x="496" y="48" font-family="${JP}" font-size="9" fill="#d4335f" text-anchor="end">さくらコモンズ店</text>`],
  PYLON: [128, 256, `<rect width="128" height="256" fill="#f6f6f4"/><rect width="128" height="150" fill="#d4335f"/>
    ${petal(64, 64, 42, '#ffffff', '#d4335f')}
    <text x="64" y="132" font-family="${SANS}" font-weight="900" font-size="19" fill="#ffffff" text-anchor="middle" letter-spacing="2">PETAL</text>
    <text x="64" y="178" font-family="${SANS}" font-weight="900" font-size="17" fill="#2a2a30" text-anchor="middle" letter-spacing="2">MOTORS</text>
    <text x="64" y="204" font-family="${JP}" font-weight="700" font-size="12" fill="#2a2a30" text-anchor="middle">新車・中古車</text>
    <text x="64" y="226" font-family="${JP}" font-weight="700" font-size="12" fill="#2a2a30" text-anchor="middle">車検・点検</text>
    <rect x="10" y="236" width="108" height="12" fill="#2a2a30"/><text x="64" y="246" font-family="${SANS}" font-size="9" fill="#fff" text-anchor="middle">0120-38-8800</text>`],
  DEALER_WALL: [256, 128, `<rect width="256" height="128" fill="#ecebe6"/><rect y="0" width="256" height="64" fill="#d4335f"/>
    ${petal(128, 30, 22, '#ffffff', '#d4335f')}<text x="128" y="60" font-family="${SANS}" font-weight="900" font-size="9" fill="#ffffff" text-anchor="middle" letter-spacing="3">PETAL MOTORS</text>
    <rect x="8" y="70" width="40" height="54" fill="#2a2a30"/><rect x="12" y="74" width="32" height="20" fill="#7fb0d8"/>
    <text x="28" y="104" font-family="${JP}" font-size="6" fill="#fff" text-anchor="middle">キッズ</text>
    <rect x="208" y="70" width="40" height="54" fill="#c9c6bc"/>${[0, 1, 2, 3].map(i => `<rect x="${212 + i * 9}" y="76" width="7" height="10" fill="${['#d4335f', '#2d8fd6', '#f39a1e', '#3a8a4a'][i]}"/>`).join('')}
    <text x="228" y="100" font-family="${JP}" font-size="6" fill="#333" text-anchor="middle">カタログ</text>`],
  ...Object.fromEntries([['PRICE0', 'BLOSSOM', '298', '#d4335f'], ['PRICE1', 'KAZE GT', '415', '#2a2a30'],
    ['PRICE2', 'MAME K', '159', '#2d8fd6'], ['PRICE3', 'YAMA 4WD', '520', '#3a6a3a']].map(([k, m, y, c]) => [k, price(m, y, c)])),
  NOBORI0: nobori('#d4335f', '#ffffff', '#ffffff', '新車フェア'),
  NOBORI1: nobori('#ffffff', '#d4335f', '#d4335f', '決算セール'),
  NOBORI2: nobori('#0b4ea2', '#ffffff', '#f5c400', '車検受付中'),
  NOBORI3: nobori('#f5c400', '#c8102e', '#c8102e', 'オイル交換'),
  // ── Open Bay (workshop) ──
  OPENBAY_FASCIA: [512, 64, `<rect width="512" height="64" fill="#1f3a5a"/><rect y="0" width="512" height="6" fill="#f5c400"/>
    <g transform="translate(36,34)"><circle r="20" fill="none" stroke="#f5c400" stroke-width="6"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<rect x="-3" y="-27" width="6" height="8" fill="#f5c400" transform="rotate(${a})"/>`).join('')}<circle r="7" fill="#f5c400"/></g>
    <text x="72" y="44" font-family="${SANS}" font-weight="900" font-size="32" fill="#ffffff" letter-spacing="4">OPEN BAY</text>
    <text x="496" y="30" font-family="${JP}" font-weight="800" font-size="17" fill="#f5c400" text-anchor="end">車検・整備・板金</text>
    <text x="496" y="50" font-family="${JP}" font-size="10" fill="#ffffff" text-anchor="end">オープンベイ自動車工業</text>`],
  TOOLWALL: [256, 128, (() => {
    const r = rng(23);
    let s = `<rect width="256" height="128" fill="#d9d4c6"/>`;
    for (let y = 6; y < 128; y += 8) for (let x = 6; x < 256; x += 8) s += `<circle cx="${x}" cy="${y}" r="0.9" fill="#8a8578"/>`;
    for (let i = 0; i < 18; i++) {      // spanners, hammers, screwdrivers on hooks
      const x = 10 + i * 13.5, h = 18 + r() * 22, y = 10 + (i % 2) * 36;
      s += `<rect x="${x}" y="${y}" width="${3 + (i % 3)}" height="${h}" rx="1.5" fill="${['#9ca0a4', '#c8102e', '#2d5fa8', '#e8b51a', '#2a2a2a'][i % 5]}"/>`;
    }
    s += `<rect x="0" y="86" width="256" height="42" fill="#b8202a"/>`;   // tool chest
    for (let k = 0; k < 4; k++) s += `<rect x="4" y="${89 + k * 9.5}" width="248" height="7.5" fill="#c8302e"/><rect x="110" y="${91 + k * 9.5}" width="36" height="2" fill="#d8d8d4"/>`;
    s += `<rect x="190" y="48" width="58" height="34" fill="#ffffff"/><text x="219" y="60" font-family="${JP}" font-weight="700" font-size="7" fill="#c8102e" text-anchor="middle">安全第一</text>
      <text x="219" y="72" font-family="${JP}" font-size="5.5" fill="#333" text-anchor="middle">整備記録 10月</text>`;
    return s;
  })()],
  INT_OFFICE: [256, 128, `<rect width="256" height="128" fill="#d8d6cc"/><rect y="0" width="256" height="8" fill="#f2f6ff"/>
    <rect x="10" y="66" width="236" height="16" fill="#8a8a86"/><rect x="10" y="82" width="236" height="46" fill="#5a5a58"/>
    <rect x="30" y="40" width="28" height="22" fill="#1a1a1a"/><rect x="32" y="42" width="24" height="16" fill="#5aa0d8"/>
    <rect x="150" y="24" width="60" height="30" fill="#ffffff"/><text x="180" y="36" font-family="${JP}" font-size="7" fill="#c8102e" text-anchor="middle">車検 ¥39,800〜</text>
    <text x="180" y="47" font-family="${JP}" font-size="6" fill="#333" text-anchor="middle">オイル交換 ¥2,980</text>
    <rect x="80" y="20" width="40" height="40" fill="#f6f2e6"/><text x="100" y="34" font-family="${JP}" font-size="7" fill="#333" text-anchor="middle">10月</text>
    <rect x="224" y="30" width="16" height="36" fill="#3a6a9a"/>`],
  // ── modern houses ──
  NAME0: nameplate('#2a2a2a', '#e8e4da', '佐藤', SANS),
  NAME1: nameplate('#e8e4da', '#2a2a2a', '高橋'),
  NAME2: nameplate('#b8a07a', '#2a1a10', '中村'),
  NAME3: nameplate('#6a6e72', '#ffffff', 'KOBAYASHI', SANS),
  MAILBOX: [64, 64, `<rect width="64" height="64" fill="#3a3a3a"/><rect x="4" y="4" width="56" height="56" fill="#4a4a4a"/>
    <rect x="12" y="14" width="40" height="5" rx="1" fill="#1a1a1a"/><text x="32" y="38" font-family="${SANS}" font-weight="700" font-size="9" fill="#c8c8c4" text-anchor="middle">POST</text>
    <rect x="44" y="46" width="10" height="4" fill="#8a8a86"/>`],
  INTERCOM: [32, 64, `<rect width="32" height="64" fill="#e8e6e0"/><rect x="6" y="6" width="20" height="14" fill="#1a1a1a"/><circle cx="16" cy="13" r="4" fill="#3a5a7a"/>
    ${[0, 1, 2, 3].map(i => `<rect x="8" y="${26 + i * 4}" width="16" height="1.5" fill="#9a9a96"/>`).join('')}<circle cx="16" cy="50" r="7" fill="#c8c6c0"/><circle cx="16" cy="50" r="2" fill="#3fa0e6"/>`],
};
