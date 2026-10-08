// TokyoSigns atlas graphics: the sign skin of the dense centre (Kabukichō-like
// alleys). Every business, brand and phone line here is invented. Layouts are
// mixed on purpose (solid, white box, dark with glow, split, Mincho
// traditional) so a street full of them does not look like one sign repeated.
const JP = "'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif";
const MIN = "'Hiragino Mincho ProN',serif";
const LAT = "Helvetica, Arial, sans-serif";

// name, sub line (latin / short), floor, palette [bg, fg, accent], style
const BIZ = [
  ['居酒屋 赤ちょうちん', 'IZAKAYA', '2F', ['#c8241c', '#ffffff', '#1a1a1a'], 'solid'],
  ['焼肉 炎', 'YAKINIKU HOMURA', '3F', ['#111111', '#ff4a1c', '#ffd23f'], 'dark'],
  ['ラーメン 一番星', '豚骨', '1F', ['#f39a1e', '#141414', '#c8102e'], 'solid'],
  ['カラオケ ミラクル', 'KARAOKE 24H', '4F', ['#f5d000', '#c8102e', '#141414'], 'solid'],
  ['まんが喫茶 ゆめ', 'COMIC & NET', '5F', ['#ffffff', '#1f5fb2', '#e8412c'], 'box'],
  ['お好み焼 桜屋', '広島風', '2F', ['#fdf6e8', '#141414', '#c8241c'], 'mincho'],
  ['寿司 海鮮丸', 'SUSHI', '1F', ['#141414', '#ffffff', '#c8241c'], 'mincho'],
  ['ゲームセンター', 'GALAXY', 'B1', ['#1b0f3a', '#3fe6ff', '#ff3fa4'], 'dark'],
  ['焼鳥 鳥八', 'YAKITORI', '1F', ['#ffffff', '#b3202a', '#141414'], 'box'],
  ['スナック 夜桜', 'SNACK', '6F', ['#3b1f4a', '#ff9fd0', '#ffffff'], 'dark'],
  ['BAR NOIR', 'COCKTAIL', '7F', ['#0d0d0d', '#e8c26a', '#ffffff'], 'latin'],
  ['中華 龍門', '餃子 炒飯', '2F', ['#c8241c', '#ffd23f', '#141414'], 'solid'],
  ['ドラッグ ミドリ', '薬 化粧品', '1F', ['#1f5fb2', '#ffe14a', '#ffffff'], 'split'],
  ['さくら歯科', 'DENTAL', '3F', ['#ffffff', '#1f8a9a', '#f39ab3'], 'box'],
  ['整体 ほぐし処', '60分 2980円', '4F', ['#2a7a4a', '#ffffff', '#ffe14a'], 'solid'],
  ['英会話 ABC', 'ENGLISH', '5F', ['#ffffff', '#1f5fb2', '#e8412c'], 'box'],
  ['天ぷら 天心', 'TEMPURA', '2F', ['#f4ead2', '#3a2418', '#b3202a'], 'mincho'],
  ['そば処 更科庵', '手打ち', '1F', ['#2a2018', '#f4ead2', '#c89a4a'], 'mincho'],
  ['串カツ 福丸', '二度漬け禁止', '1F', ['#ffd23f', '#141414', '#c8241c'], 'split'],
  ['牛丼 はやみ', '並 390円', '1F', ['#e8792c', '#ffffff', '#141414'], 'solid'],
  ['ホテル ルナ', 'HOTEL LUNA', '', ['#24124a', '#ffd6ff', '#3fe6ff'], 'dark'],
  ['麻雀 白龍', 'MAHJONG', '3F', ['#145a32', '#ffffff', '#ffd23f'], 'solid'],
  ['占い 星の館', 'FORTUNE', '4F', ['#3a1f6a', '#ffd96a', '#ffffff'], 'dark'],
  ['ネイル Rose', 'NAIL', '5F', ['#f7c6d8', '#b3205a', '#ffffff'], 'box'],
  ['居酒屋 てっぺん', '飲み放題', '3F', ['#141414', '#ffffff', '#f39a1e'], 'split'],
  ['餃子の王様', 'GYOZA', '1F', ['#ffffff', '#c8241c', '#141414'], 'box'],
  ['うなぎ 川しま', '創業五十年', '2F', ['#1d2a4a', '#f4efe4', '#c89a4a'], 'mincho'],
  ['ダーツ&バー', 'DARTS', '6F', ['#0b2a3a', '#3fe6ff', '#ffffff'], 'dark'],
  ['ファミレス ぽぷら', 'FAMILY DINING', '2F', ['#e8412c', '#ffffff', '#ffd23f'], 'split'],
  ['質 まるや', '高価買取', '1F', ['#ffffff', '#141414', '#c8241c'], 'mincho'],
  ['カフェ 木漏れ日', 'CAFE', '2F', ['#5a3b22', '#f4e2c4', '#9fd89f'], 'box'],
  ['クリニック', '内科 皮膚科', '4F', ['#ffffff', '#1f8a5a', '#1f5fb2'], 'box'],
  ['焼酎バー 蔵', 'SHOCHU', '5F', ['#2a2018', '#e8c26a', '#ffffff'], 'mincho'],
  ['もつ鍋 博多', 'MOTSUNABE', '3F', ['#7a1f1f', '#ffffff', '#ffd23f'], 'solid'],
  ['ビリヤード', 'POOL 9', '7F', ['#145a32', '#ffffff', '#3fe6ff'], 'latin'],
  ['居酒屋 のんべえ', '生ビール 199円', '4F', ['#ffd23f', '#141414', '#c8241c'], 'solid'],
];

const esc = (t) => t.replace(/&/g, '&amp;');
// vertical writing: the long-vowel bar stands upright
const vert = (t) => [...t.replace(/ /g, '')].filter((c) => !/[A-Za-z&]/.test(c)).map((c) => (c === 'ー' ? '｜' : c));
const fit = (len, max) => `textLength="${max}" lengthAdjust="spacingAndGlyphs"`;

function yoko([name, sub, fl, [bg, fg, ac], style], w = 256, h = 64) {
  const font = style === 'mincho' ? MIN : style === 'latin' ? LAT : JP;
  const tw = w - (fl ? 52 : 20);
  let s = `<rect width="${w}" height="${h}" fill="${bg}"/>`;
  if (style === 'box') s += `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" fill="none" stroke="${ac}" stroke-width="3"/>`;
  if (style === 'split') s += `<rect width="${w * 0.28}" height="${h}" fill="${ac}"/>
    <text x="${w * 0.14}" y="${h * 0.75}" font-family="${font}" font-weight="900" font-size="${h * 0.7}" fill="${bg}" text-anchor="middle">${esc([...name][0])}</text>`;
  if (style === 'dark') s += `<rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="6" fill="none" stroke="${ac}" stroke-width="2.5"/>`;
  const x0 = style === 'split' ? w * 0.3 : 10;
  const glow = style === 'dark' ? `<text x="${x0}" y="40" font-family="${font}" font-weight="700" font-size="34" fill="none" stroke="${fg}" stroke-opacity="0.35" stroke-width="5" ${fit(0, tw - (x0 - 10))}>${esc(name)}</text>` : '';
  s += glow + `<text x="${x0}" y="40" font-family="${font}" font-weight="700" font-size="34" fill="${fg}" ${fit(0, tw - (x0 - 10))}>${esc(name)}</text>`;
  s += `<text x="${x0}" y="57" font-family="${LAT}" font-weight="700" font-size="11" fill="${style === 'split' ? fg : ac}" letter-spacing="1">${esc(sub)}</text>`;
  if (fl) s += `<rect x="${w - 40}" y="12" width="32" height="40" rx="4" fill="${ac}"/><text x="${w - 24}" y="40" font-family="${LAT}" font-weight="700" font-size="18" fill="${bg === ac ? fg : bg}" text-anchor="middle">${fl}</text>`;
  return [w, h, s];
}

function tate([name, sub, fl, [bg, fg, ac], style], w = 64, h = 320) {
  const font = style === 'mincho' ? MIN : JP;
  const chars = vert(name);
  const n = Math.max(chars.length, 1);
  const top = 14 + (style === 'split' ? h * 0.12 : 0), bottom = fl ? 64 : 22;
  const step = Math.min(46, (h - top - bottom) / n);
  let s = `<rect width="${w}" height="${h}" fill="${bg}"/>`;
  if (style === 'box' || style === 'mincho') s += `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" fill="none" stroke="${ac}" stroke-width="3"/>`;
  if (style === 'split') s += `<rect width="${w}" height="${h * 0.12}" fill="${ac}"/>`;
  if (style === 'dark') s += `<rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="5" fill="none" stroke="${ac}" stroke-width="2.5"/>`;
  s += `<text font-family="${font}" font-weight="700" font-size="${Math.min(44, step * 0.95)}" fill="${fg}" text-anchor="middle">`;
  chars.forEach((c, i) => { s += `<tspan x="${w / 2}" y="${top + step * (i + 0.85)}">${c}</tspan>`; });
  s += `</text>`;
  if (fl) s += `<rect x="8" y="${h - 50}" width="${w - 16}" height="40" rx="4" fill="${ac}"/><text x="${w / 2}" y="${h - 22}" font-family="${LAT}" font-weight="700" font-size="20" fill="${bg === ac ? fg : bg}" text-anchor="middle">${fl}</text>`;
  return [w, h, s];
}

function stand([name, sub, fl, [bg, fg, ac], style], w = 64, h = 128) {
  // standing sidewalk lightbox (oki-kanban): name vertical, price strip
  const chars = vert(name).slice(0, 5);
  const step = Math.min(20, 88 / chars.length);
  let s = `<rect width="${w}" height="${h}" fill="${bg}"/><rect y="${h - 26}" width="${w}" height="26" fill="${ac}"/>`;
  s += `<text font-family="${style === 'mincho' ? MIN : JP}" font-weight="700" font-size="${step * 0.95}" fill="${fg}" text-anchor="middle">`;
  chars.forEach((c, i) => { s += `<tspan x="${w / 2}" y="${8 + step * (i + 0.9)}">${c}</tspan>`; });
  s += `</text><text x="${w / 2}" y="${h - 9}" font-family="${LAT}" font-weight="700" font-size="9" fill="${bg}" text-anchor="middle" ${fit(0, w - 8)}>${esc(sub)}</text>`;
  return [w, h, s];
}

const BILL = {
  BILL_LAGER: `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d3b78"/><stop offset="1" stop-color="#2fa8e0"/></linearGradient></defs>
    <rect width="256" height="128" fill="url(#g)"/><rect x="170" y="14" width="40" height="100" rx="8" fill="#f2c230"/><rect x="176" y="20" width="28" height="14" fill="#fff8e0"/>
    <text x="16" y="58" font-family="${LAT}" font-weight="900" font-size="30" fill="#ffffff">SAKURA</text><text x="16" y="88" font-family="${LAT}" font-weight="900" font-size="30" fill="#f2c230">LAGER</text>
    <text x="16" y="112" font-family="${JP}" font-weight="700" font-size="13" fill="#ffffff">キレのある、さくらの一杯。</text>`,
  BILL_MOBILE: `<rect width="256" height="128" fill="#ffffff"/><circle cx="200" cy="64" r="58" fill="#ff3fa4"/><rect x="178" y="22" width="44" height="84" rx="8" fill="#141414"/><rect x="182" y="28" width="36" height="70" fill="#3fe6ff"/>
    <text x="14" y="52" font-family="${LAT}" font-weight="900" font-size="28" fill="#141414">SORA</text><text x="14" y="80" font-family="${LAT}" font-weight="700" font-size="22" fill="#ff3fa4">mobile 5G</text>
    <text x="14" y="108" font-family="${JP}" font-weight="700" font-size="14" fill="#141414">月額 980円から</text>`,
  BILL_CAMERA: `<rect width="256" height="128" fill="#c8102e"/><rect y="96" width="256" height="32" fill="#141414"/>
    <text x="128" y="62" font-family="${JP}" font-weight="900" font-size="40" fill="#ffffff" text-anchor="middle">カメラのヒカリ</text>
    <text x="128" y="118" font-family="${LAT}" font-weight="700" font-size="16" fill="#ffd23f" text-anchor="middle" letter-spacing="3">CAMERA · PC · GAME</text>`,
  BILL_SODA: `<rect width="256" height="128" fill="#f2f8ee"/><circle cx="60" cy="64" r="48" fill="#3aa45a"/><circle cx="60" cy="64" r="36" fill="#f2f8ee"/><circle cx="60" cy="64" r="24" fill="#f2c230"/>
    <text x="124" y="58" font-family="${JP}" font-weight="900" font-size="30" fill="#3aa45a">みどり茶</text><text x="124" y="88" font-family="${LAT}" font-weight="700" font-size="16" fill="#141414">GREEN TEA</text>
    <text x="124" y="110" font-family="${JP}" font-size="12" fill="#141414">すっきり、無糖。</text>`,
};

const VIDEO = {
  VIDEO_A: `<defs><linearGradient id="v" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff3fa4"/><stop offset="0.5" stop-color="#6a4fff"/><stop offset="1" stop-color="#3fe6ff"/></linearGradient></defs>
    <rect width="256" height="128" fill="url(#v)"/><circle cx="70" cy="70" r="44" fill="#ffffff" opacity="0.25"/><circle cx="200" cy="30" r="22" fill="#ffd23f" opacity="0.7"/>
    <text x="128" y="72" font-family="${LAT}" font-weight="900" font-size="40" fill="#ffffff" text-anchor="middle" letter-spacing="2">NEO TOKYO</text>
    <text x="128" y="104" font-family="${JP}" font-weight="700" font-size="16" fill="#ffffff" text-anchor="middle">夜の街へ、ようこそ。</text>`,
  VIDEO_B: `<rect width="256" height="128" fill="#101820"/><rect x="0" y="0" width="128" height="128" fill="#f39a1e"/><circle cx="64" cy="64" r="40" fill="#c8241c"/>
    <path d="M44,60 Q64,30 84,60 Z" fill="#ffd23f"/><text x="192" y="58" font-family="${JP}" font-weight="900" font-size="26" fill="#ffffff" text-anchor="middle">新発売</text>
    <text x="192" y="92" font-family="${LAT}" font-weight="700" font-size="16" fill="#3fe6ff" text-anchor="middle">SPICY UDON</text>`,
};

export const SIGNS = {};
BIZ.slice(0, 24).forEach((b, i) => { SIGNS[`Y${String(i).padStart(2, '0')}`] = yoko(b); });
BIZ.slice(12, 28).forEach((b, i) => { SIGNS[`T${String(i).padStart(2, '0')}`] = tate(b); });
[0, 2, 8, 13, 19, 25, 29, 35].forEach((k, i) => { SIGNS[`S${i}`] = stand(BIZ[k]); });
for (const [k, v] of Object.entries(BILL)) SIGNS[k] = [256, 128, v];
for (const [k, v] of Object.entries(VIDEO)) SIGNS[k] = [256, 128, v];
