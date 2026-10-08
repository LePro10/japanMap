// Tokyo atlas graphics (shop fronts, tenant signs, plates). Imported by graphics.mjs.
// All names, brands and texts are fictional.
const JP = "'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif";
const MIN = "'Hiragino Mincho ProN',serif";

// small deterministic RNG so the interiors stay the same on every run
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const PROD = ['#e8412c', '#f2c230', '#2f7fd1', '#f7f3ea', '#3aa45a', '#e8792c', '#c43b7a', '#6a4fb3', '#222', '#9bd2ee'];

// vertical text: one tspan per character
const vt = (chars, x, y0, step) => [...chars].map((c, i) => `<tspan x="${x}" y="${y0 + i * step}">${c}</tspan>`).join('');

// shelves full of products seen through the shop window, lit from the ceiling
function shelves(r, x0, x1, y0, y1, rows) {
  let out = '';
  const rh = (y1 - y0) / rows;
  for (let k = 0; k < rows; k++) {
    const yb = y0 + (k + 1) * rh;
    out += `<rect x="${x0}" y="${yb - 2}" width="${x1 - x0}" height="2" fill="#bfc4c8"/>`;
    for (let x = x0 + 1; x < x1 - 2;) {
      const w = 2 + Math.floor(r() * 4), h = rh * (0.45 + 0.4 * r());
      out += `<rect x="${x}" y="${yb - 2 - h}" width="${w}" height="${h}" fill="${pick(r, PROD)}"/>`;
      x += w + (r() < 0.2 ? 1 : 0);
    }
  }
  return out;
}

export const TOKYO = {
  // konbini fascia: white lightbox with stripes, fictional chain 'SORA MART'
  KONBINI_FASCIA: [512, 64, `<rect width="512" height="64" fill="#fbfbf8"/>
    <rect y="0" width="512" height="9" fill="#2d8fd6"/><rect y="9" width="512" height="5" fill="#ffffff"/>
    <rect y="14" width="512" height="5" fill="#f39a1e"/><rect y="56" width="512" height="8" fill="#2d8fd6"/>
    <g transform="translate(40,40)"><circle r="17" fill="#2d8fd6"/><path d="M-9,4 Q0,-14 9,4" fill="none" stroke="#fff" stroke-width="4"/>
    <circle cy="-3" r="4" fill="#f39a1e"/></g>
    <text x="70" y="49" font-family="Helvetica, Arial" font-weight="700" font-size="30" fill="#2d8fd6" letter-spacing="1">SORA MART</text>
    <text x="300" y="47" font-family="${JP}" font-weight="700" font-size="22" fill="#2d8fd6">ソラマート</text>
    <rect x="432" y="24" width="64" height="26" rx="4" fill="#f39a1e"/>
    <text x="464" y="44" font-family="Helvetica, Arial" font-weight="700" font-size="20" fill="#fff" text-anchor="middle">24h</text>`],
  // view into the konbini: magazine rack under the window, shelves, ceiling lights, posters on the glass
  KONBINI_INT_A: [192, 128, (() => {
    const r = rng(11);
    let s = `<rect width="192" height="128" fill="#eef0ec"/><rect y="0" width="192" height="16" fill="#f8f8f6"/>`;
    for (let x = 8; x < 192; x += 46) s += `<rect x="${x}" y="5" width="30" height="3" fill="#ffffff"/>`;
    s += `<rect y="16" width="192" height="66" fill="#e3e6e2"/>` + shelves(r, 4, 188, 22, 82, 4);
    s += `<rect y="82" width="192" height="46" fill="#9aa0a3"/>`;
    for (let x = 2; x < 190; x += 12) {           // magazine rack: covers face out
      s += `<rect x="${x}" y="${84 + r() * 4}" width="10" height="16" fill="${pick(r, PROD)}"/><rect x="${x + 1}" y="${88 + r() * 3}" width="8" height="3" fill="#fff"/>`;
      s += `<rect x="${x}" y="104" width="10" height="14" fill="${pick(r, PROD)}"/>`;
    }
    s += `<rect y="119" width="192" height="9" fill="#5d6366"/>`;
    s += `<rect x="6" y="20" width="34" height="46" fill="#f39a1e"/><text x="23" y="40" font-family="${JP}" font-weight="700" font-size="11" fill="#fff" text-anchor="middle">からあげ</text>
      <text x="23" y="58" font-family="Helvetica" font-weight="700" font-size="12" fill="#fff" text-anchor="middle">¥198</text>`;
    s += `<rect x="150" y="20" width="36" height="24" fill="#2d8fd6"/><text x="168" y="36" font-family="${JP}" font-weight="700" font-size="9" fill="#fff" text-anchor="middle">ATM</text>`;
    return s;
  })()],
  // second panel: counter, coffee machine, hot snacks case, cigarette wall behind
  KONBINI_INT_B: [192, 128, (() => {
    const r = rng(23);
    let s = `<rect width="192" height="128" fill="#eef0ec"/><rect y="0" width="192" height="16" fill="#f8f8f6"/>`;
    for (let x = 8; x < 192; x += 46) s += `<rect x="${x}" y="5" width="30" height="3" fill="#ffffff"/>`;
    s += `<rect x="70" y="18" width="120" height="44" fill="#d6d8d4"/>`;
    for (let y = 20; y < 60; y += 7) for (let x = 72; x < 188; x += 5) s += `<rect x="${x}" y="${y}" width="4" height="6" fill="${pick(r, PROD)}"/>`;
    s += shelves(r, 4, 66, 22, 70, 3);
    s += `<rect x="0" y="70" width="192" height="58" fill="#c9ced0"/><rect x="0" y="70" width="192" height="5" fill="#2d8fd6"/>`;
    s += `<rect x="12" y="76" width="22" height="34" fill="#2b2d30"/><rect x="16" y="80" width="14" height="8" fill="#9fd8ff"/>`;  // coffee machine
    s += `<rect x="44" y="78" width="46" height="26" fill="#f7d58c"/><rect x="46" y="80" width="42" height="22" fill="#e8a24a"/>`;  // hot case
    for (let x = 48; x < 86; x += 8) s += `<circle cx="${x + 3}" cy="91" r="3" fill="#b35a22"/>`;
    s += `<rect x="110" y="80" width="24" height="16" fill="#222"/><rect x="112" y="82" width="20" height="10" fill="#7fd4a8"/>`;  // register
    s += `<rect x="150" y="80" width="30" height="20" fill="#e8412c"/><text x="165" y="94" font-family="${JP}" font-weight="700" font-size="10" fill="#fff" text-anchor="middle">おでん</text>`;
    return s;
  })()],
  // automatic door: glass, lit interior behind, the round 自動ドア sticker
  AUTO_DOOR: [64, 128, `<rect width="64" height="128" fill="#e4e8e6"/><rect y="0" width="64" height="14" fill="#f8f8f6"/>
    <rect y="80" width="64" height="48" fill="#a9aeb0"/><rect x="4" y="22" width="26" height="54" fill="#d7dbd9"/><rect x="34" y="22" width="26" height="54" fill="#d7dbd9"/>
    <rect x="0" y="58" width="64" height="7" fill="#2d8fd6"/>
    <text x="32" y="64" font-family="${JP}" font-weight="700" font-size="6" fill="#fff" text-anchor="middle">自動ドア</text>
    <line x1="32" y1="0" x2="32" y2="128" stroke="#7d8488" stroke-width="2"/>`],
  // rolling shutter: galvanised ribs, darker at the foot, bottom bar with lock
  SHUTTER: [64, 128, `<rect width="64" height="128" fill="#a7abad"/>
    ${Array.from({ length: 32 }, (_, i) => `<rect y="${i * 4}" width="64" height="1.4" fill="#7f8487"/><rect y="${i * 4 + 1.4}" width="64" height="0.8" fill="#c4c8ca"/>`).join('')}
    <rect y="119" width="64" height="9" fill="#6d7174"/><rect x="28" y="121" width="8" height="4" fill="#2a2b2d"/>`],
  // noren curtain over the izakaya door: navy, three panels, white text
  NOREN: [128, 96, `<rect width="128" height="96" fill="#1d2a4a"/><rect y="0" width="128" height="12" fill="#141d34"/>
    <text font-family="${MIN}" font-weight="700" font-size="30" fill="#f4efe4" text-anchor="middle">
    <tspan x="21" y="58">焼</tspan><tspan x="64" y="58">き</tspan><tspan x="107" y="58">鳥</tspan></text>
    <rect x="8" y="76" width="112" height="1.5" fill="#f4efe4" opacity="0.6"/>`],
  // red paper lantern (akachōchin), unwrapped once round: 酒 on both halves
  LANTERN: [128, 64, `<rect width="128" height="64" fill="#c8241c"/>
    ${[0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60].map(y => `<rect y="${y}" width="128" height="1" fill="#a51a14"/>`).join('')}
    <text font-family="${MIN}" font-weight="700" font-size="34" fill="#141210" text-anchor="middle"><tspan x="32" y="45">酒</tspan><tspan x="96" y="45">酒</tspan></text>`],
  // menu stand board / chalk menu
  MENU: [64, 96, `<rect width="64" height="96" fill="#5a3b22"/><rect x="4" y="4" width="56" height="88" fill="#1f2a22"/>
    <text font-family="${JP}" font-weight="700" font-size="8" fill="#f2e9c9" text-anchor="middle"><tspan x="32" y="17">本日のおすすめ</tspan></text>
    ${['焼鳥盛合せ', '生ビール', 'ハイボール', '枝豆', '冷奴'].map((t, i) => `<text x="7" y="${33 + i * 12}" font-family="${JP}" font-size="6.5" fill="#f2e9c9">${t}</text>
    <text x="57" y="${33 + i * 12}" font-family="Helvetica" font-size="7" fill="#f6c3c3" text-anchor="end">${[680, 480, 420, 300, 280][i]}</text>`).join('')}`],
  // vertical tenant sign stacks (tate-kanban): one lightbox per floor
  TATE_A: [64, 384, `<rect width="64" height="384" fill="#e9e9e4"/>
    ${[['スナック蘭', '#d9447e', '#fff'], ['居酒屋鳥よし', '#f4efe4', '#b3202a'], ['カラオケ', '#f5c400', '#141414'], ['麻雀', '#1f7a3a', '#fff'], ['BAR', '#3b2a6a', '#f7d6ff']]
      .map(([t, bg, fg], i) => {
        const y = 4 + i * 76, chars = [...t], step = Math.min(15, 64 / chars.length);
        const body = t === 'BAR' ? `<text x="32" y="${y + 46}" font-family="Helvetica" font-weight="700" font-size="20" fill="${fg}" text-anchor="middle">BAR</text>`
          : `<text font-family="${JP}" font-weight="700" font-size="${Math.min(15, step + 1)}" fill="${fg}" text-anchor="middle">${vt(chars, 32, y + 17, step)}</text>`;
        return `<rect x="3" y="${y}" width="58" height="72" fill="${bg}"/>${body}<text x="56" y="${y + 68}" font-family="Helvetica" font-weight="700" font-size="8" fill="${fg}" text-anchor="end">${5 - i}F</text>`;
      }).join('')}`],
  TATE_B: [64, 384, `<rect width="64" height="384" fill="#e9e9e4"/>
    ${[['占い', '#5a2a7a', '#ffd96a'], ['ネイル', '#f7c6d8', '#b3205a'], ['英会話', '#1f5fb2', '#fff'], ['整体院', '#ffffff', '#1f8a7a'], ['ラーメン', '#f39a1e', '#141414']]
      .map(([t, bg, fg], i) => {
        const y = 4 + i * 76, chars = [...t], step = Math.min(17, 60 / chars.length);
        return `<rect x="3" y="${y}" width="58" height="72" fill="${bg}"/><text font-family="${JP}" font-weight="700" font-size="${Math.min(17, step + 1)}" fill="${fg}" text-anchor="middle">${vt(chars, 32, y + 20, step)}</text>
          <text x="56" y="${y + 68}" font-family="Helvetica" font-weight="700" font-size="8" fill="${fg}" text-anchor="end">${5 - i}F</text>`;
      }).join('')}`],
  // rooftop billboard (fictional estate agent)
  ROOF_SIGN: [256, 64, `<rect width="256" height="64" fill="#f7f6f1"/><rect width="256" height="10" fill="#1f8a5a"/>
    <text x="128" y="42" font-family="${JP}" font-weight="700" font-size="28" fill="#1f8a5a" text-anchor="middle">ひかり不動産</text>
    <text x="128" y="58" font-family="Helvetica" font-weight="700" font-size="10" fill="#333" text-anchor="middle" letter-spacing="3">HIKARI REALTY</text>`],
  // window lettering on lit office glass: 2F English school / hair salon
  SCHOOL: [256, 48, `<rect width="256" height="48" fill="#e9eef2"/>${[20, 70, 120, 170, 220].map(x => `<rect x="${x}" y="2" width="22" height="3" fill="#fff"/>`).join('')}
    <rect y="38" width="256" height="10" fill="#b8c0c6"/>
    <text x="128" y="29" font-family="${JP}" font-weight="700" font-size="20" fill="#1f5fb2" text-anchor="middle">英会話スクール  ENGLISH</text>`],
  SALON: [128, 48, `<rect width="128" height="48" fill="#f3ebe6"/><rect y="38" width="128" height="10" fill="#c9b9b0"/>
    <text x="64" y="22" font-family="${JP}" font-weight="700" font-size="14" fill="#c23b6a" text-anchor="middle">美容室</text>
    <text x="64" y="35" font-family="Georgia, serif" font-style="italic" font-size="11" fill="#c23b6a" text-anchor="middle">hair salon</text>`],
  // windows (64 px): lit with curtains, lit office blinds, dark with curtains, frosted bathroom
  WIN_CURTAIN: [64, 64, `<rect width="64" height="64" fill="#ffd9a0"/><rect width="64" height="64" fill="#ffc777" opacity="0.5"/>
    <path d="M0,0 L22,0 Q18,32 24,64 L0,64 Z" fill="#c9a77a"/><path d="M64,0 L44,0 Q48,32 40,64 L64,64 Z" fill="#c9a77a"/>
    ${[4, 9, 14, 52, 57].map(x => `<line x1="${x}" y1="0" x2="${x + (x < 32 ? 2 : -2)}" y2="64" stroke="#a88760" stroke-width="1"/>`).join('')}`],
  WIN_BLIND: [64, 64, `<rect width="64" height="64" fill="#eef4f6"/>${Array.from({ length: 16 }, (_, i) => `<rect y="${i * 4}" width="64" height="1.2" fill="#b9c3c8"/>`).join('')}
    <rect y="44" width="64" height="20" fill="#dfe6e9"/>`],
  WIN_DARK: [64, 64, `<rect width="64" height="64" fill="#1a2128"/><path d="M0,0 L64,0 L0,52 Z" fill="#26313b"/>
    <path d="M0,0 L16,0 Q13,32 18,64 L0,64 Z" fill="#2c2a28"/><path d="M64,0 L48,0 Q51,32 46,64 L64,64 Z" fill="#2c2a28"/>`],
  // AC outdoor unit front: ivory casing, round fan grille
  AC_FRONT: [64, 48, `<rect width="64" height="48" fill="#e7e4da"/><circle cx="25" cy="24" r="19" fill="#4a4c4e"/>
    ${[17, 13, 9, 5].map(r => `<circle cx="25" cy="24" r="${r}" fill="none" stroke="#c9c6bc" stroke-width="1.2"/>`).join('')}
    <line x1="6" y1="24" x2="44" y2="24" stroke="#c9c6bc" stroke-width="1.2"/><line x1="25" y1="5" x2="25" y2="43" stroke="#c9c6bc" stroke-width="1.2"/>
    ${[8, 14, 20, 26, 32, 38].map(y => `<rect x="49" y="${y}" width="11" height="2" fill="#bdb9ae"/>`).join('')}`],
  // collective mailboxes (shūgō posuto)
  MAILBOX: [64, 64, `<rect width="64" height="64" fill="#8c8f92"/>
    ${[0, 1, 2].map(c => [0, 1, 2, 3].map(r => `<rect x="${3 + c * 20}" y="${3 + r * 15}" width="18" height="13" fill="#c9cccf"/>
      <rect x="${6 + c * 20}" y="${5 + r * 15}" width="12" height="2" fill="#3a3c3e"/><text x="${12 + c * 20}" y="${14 + r * 15}" font-family="Helvetica" font-size="5" fill="#333" text-anchor="middle">${400 - r * 100 + c + 1}</text>`).join('')).join('')}`],
  // mansion name plate (fictional)
  NAMEPLATE: [128, 32, `<rect width="128" height="32" fill="#c4c6c6"/><rect x="2" y="2" width="124" height="28" fill="#d8dad9"/>
    <text x="64" y="17" font-family="${MIN}" font-weight="700" font-size="13" fill="#2a2a2a" text-anchor="middle">メゾン桜</text>
    <text x="64" y="27" font-family="Georgia, serif" font-size="8" fill="#2a2a2a" text-anchor="middle" letter-spacing="2">MAISON SAKURA</text>`],
  // balcony fire-escape partition: 'in an emergency break this panel to escape to the neighbour'
  PARTITION: [64, 96, `<rect width="64" height="96" fill="#e8e6df"/><rect x="2" y="2" width="60" height="92" fill="none" stroke="#b9b6ad" stroke-width="2"/>
    <text font-family="${JP}" font-size="5.5" fill="#c8102e" text-anchor="middle"><tspan x="32" y="34">非常の際は、ここを</tspan><tspan x="32" y="42">破って隣戸へ</tspan><tspan x="32" y="50">避難できます。</tspan></text>
    <rect x="12" y="56" width="40" height="1" fill="#c8102e"/>`],
  // electricity meter
  METER: [32, 32, `<rect width="32" height="32" fill="#9fa4a6"/><rect x="4" y="3" width="24" height="26" fill="#d6dadb"/>
    <circle cx="16" cy="13" r="7" fill="#f4f4f0"/><rect x="10" y="10" width="12" height="4" fill="#2a2a2a"/><rect x="9" y="23" width="14" height="3" fill="#333"/>`],
  // entrance lobby seen through the glass door
  LOBBY: [64, 128, `<rect width="64" height="128" fill="#f4e2c4"/><rect y="0" width="64" height="12" fill="#fff4e0"/>
    <rect y="92" width="64" height="36" fill="#8a7f72"/>${[0, 16, 32, 48].map(x => `<rect x="${x}" y="92" width="1" height="36" fill="#6f665c"/>`).join('')}
    <rect x="4" y="34" width="26" height="40" fill="#8c8f92"/>${[0, 1, 2, 3].map(r => `<rect x="6" y="${36 + r * 9}" width="22" height="7" fill="#c9cccf"/>`).join('')}
    <rect x="40" y="26" width="18" height="66" fill="#6b6f72"/><rect x="48" y="44" width="2" height="8" fill="#ccc"/>
    <line x1="32" y1="0" x2="32" y2="128" stroke="#6f7478" stroke-width="2"/>`],
  // round projecting sign: kissaten (coffee shop)
  KISSA: [64, 64, `<circle cx="32" cy="32" r="31" fill="#f4efe4"/><circle cx="32" cy="32" r="27" fill="#3a2418"/>
    <text x="32" y="30" font-family="${MIN}" font-weight="700" font-size="15" fill="#f4efe4" text-anchor="middle">喫茶</text>
    <text x="32" y="46" font-family="Georgia, serif" font-size="9" fill="#e8b86a" text-anchor="middle">COFFEE</text>`],
  // nobori flags, drawn lying on their side (pole side at the bottom, top of the flag to the right)
  NOBORI_A: [128, 32, `<g transform="translate(128,0) rotate(90)"><rect width="32" height="128" fill="#f39a1e"/>
    <rect width="4" height="128" fill="#ffffff"/><rect y="0" width="32" height="10" fill="#c8102e"/>
    <text font-family="${JP}" font-weight="700" font-size="17" fill="#ffffff" text-anchor="middle">${vt('おでん', 18, 34, 22)}</text>
    <text x="18" y="112" font-family="${JP}" font-weight="700" font-size="9" fill="#c8102e" text-anchor="middle">70円</text></g>`],
  NOBORI_B: [128, 32, `<g transform="translate(128,0) rotate(90)"><rect width="32" height="128" fill="#b3202a"/>
    <rect width="4" height="128" fill="#ffffff"/><rect y="0" width="32" height="10" fill="#1d2a4a"/>
    <text font-family="${JP}" font-weight="700" font-size="15" fill="#ffffff" text-anchor="middle">${vt('生ビール', 18, 30, 19)}</text></g>`],
};
