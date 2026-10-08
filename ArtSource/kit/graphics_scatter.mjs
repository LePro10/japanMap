// Scatter atlas graphics (task 5a): sotoba boards, engraved grave faces,
// single nobori flags (car dealer / workshop at Sakura Commons), the
// snow-pole arrow plate (yabane), the event board, a Jizo plaque.
// Names and texts are invented or generic. Imported by graphics.mjs (prefix SC_).

const JP = "'Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif";
const MIN = "'Hiragino Mincho ProN',serif";
const vt = (chars, x, y0, step) => [...chars].map((c, i) => `<tspan x="${x}" y="${y0 + i * step}">${c}</tspan>`).join('');

// sotoba: thin wooden memorial board, five brush marks (the five rings in
// bonji) at the top, the dedication below in black brush script
function sotoba(bg, ink, text, op = 1) {
  const marks = [10, 20, 30, 40, 50].map((y, i) => `<path d="M10,${y} q6,-5 12,0 q-3,4 -7,5 ${i % 2 ? 'q4,1 5,3' : 'l-3,2'}"
     fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`).join('');
  return [32, 128, `<rect width="32" height="128" fill="${bg}"/>
    <g opacity="${op}">${marks}<text font-family="${MIN}" font-weight="700" font-size="9" fill="${ink}" text-anchor="middle">${vt(text, 16, 66, 9.2)}</text></g>
    <rect x="0" y="0" width="1.5" height="128" fill="#000" opacity="0.18"/><rect x="30.5" y="0" width="1.5" height="128" fill="#000" opacity="0.18"/>`];
}

// grave pillar (saoishi) face: engraved letters read lighter than polished stone
function grave(bg, ink, text, size = 15, step = 17, y0 = 20) {
  return [32, 96, `<rect width="32" height="96" fill="${bg}"/>
    <text font-family="${MIN}" font-weight="700" font-size="${size}" fill="${ink}" text-anchor="middle">${vt(text, 16, y0, step)}</text>`];
}

// nobori flag, vertical: sleeve band on the pole side (left), top band, text
function nobori(bg, fg, band, text, size = 15, step = 18) {
  return [32, 128, `<rect width="32" height="128" fill="${bg}"/><rect width="5" height="128" fill="${band}"/>
    <rect x="5" y="0" width="27" height="10" fill="${band}"/>
    <text font-family="${JP}" font-weight="800" font-size="${size}" fill="${fg}" text-anchor="middle">${vt(text, 19, 28, step)}</text>`];
}

export const SCATTER = {
  SOTOBA_A: sotoba('#d8c7a0', '#1b1712', '為先祖代々菩提'),
  SOTOBA_B: sotoba('#9a9184', '#2a2622', '南無阿弥陀仏', 0.6),
  SOTOBA_C: sotoba('#c9b791', '#1b1712', '南無妙法蓮華経'),
  GRAVE_A: grave('#3c3e41', '#b9bbbc', '桜井家之墓'),
  GRAVE_B: grave('#8f908c', '#3e3f40', '森本家墓', 16, 19, 24),
  GRAVE_C: grave('#76746c', '#5a5850', '先祖代々之墓', 12, 13, 15),
  NOBORI_A: nobori('#c8102e', '#ffffff', '#ffffff', '新車フェア'),
  NOBORI_B: nobori('#0b4ea2', '#ffffff', '#f5c400', '車検受付中'),
  NOBORI_C: nobori('#f5c400', '#c8102e', '#c8102e', '営業中', 17, 22),
  // snow pole arrow (yabane): red and white chevrons pointing down at the road edge
  YABANE: [32, 128, `<rect width="32" height="128" fill="#ffffff"/>
    ${[0, 1, 2, 3, 4, 5, 6].map(i => `<path d="M2,${4 + i * 18} L16,${14 + i * 18} L30,${4 + i * 18} L30,${13 + i * 18} L16,${23 + i * 18} L2,${13 + i * 18} Z" fill="#d0141f"/>`).join('')}
    <rect x="0.5" y="0.5" width="31" height="127" fill="none" stroke="#333" stroke-width="1"/>`],
  // event board (4 m x 2 m): invented night meet at Sakura Commons
  EVENT: [256, 128, `<defs><linearGradient id="ev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14183a"/>
    <stop offset="1" stop-color="#3a1f4a"/></linearGradient></defs>
    <rect width="256" height="128" fill="url(#ev)"/>
    ${[[18, 18], [40, 104], [214, 22], [236, 96], [120, 12], [196, 112]].map(([x, y]) => `<g transform="translate(${x},${y})" fill="#f6b3c8">
      ${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-4" rx="2.6" ry="4" transform="rotate(${a})"/>`).join('')}<circle r="1.6" fill="#ffe08a"/></g>`).join('')}
    <text x="128" y="34" font-family="${JP}" font-weight="700" font-size="13" fill="#f6b3c8" text-anchor="middle" letter-spacing="3">桜コモンズ 夜の走行会</text>
    <text x="128" y="62" font-family="Helvetica, Arial" font-weight="900" font-size="23" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">SAKURA COMMONS</text>
    <text x="128" y="84" font-family="Helvetica, Arial" font-weight="700" font-size="17" fill="#ffd36a" text-anchor="middle" letter-spacing="4">NIGHT MEET</text>
    <path d="M70,104 q8,-10 26,-11 l14,-6 q18,-4 36,0 l14,7 q14,1 18,6 l0,5 l-108,0 Z" fill="#0b0d1e" stroke="#7fd6ff" stroke-width="1.6"/>
    <circle cx="92" cy="106" r="5" fill="#0b0d1e" stroke="#7fd6ff" stroke-width="1.6"/><circle cx="162" cy="106" r="5" fill="#0b0d1e" stroke="#7fd6ff" stroke-width="1.6"/>
    <text x="128" y="122" font-family="Helvetica, Arial" font-weight="700" font-size="9" fill="#ffffff" text-anchor="middle" letter-spacing="2">EVERY SATURDAY 18:00 –  毎週土曜</text>`],
  // wooden plaque over the Jizo shelter
  NOTICE: [96, 64, `<rect width="96" height="64" fill="#3a2a1e"/><rect x="4" y="4" width="88" height="56" fill="#4a3627"/>
    <text x="48" y="41" font-family="${MIN}" font-weight="700" font-size="19" fill="#efe6d2" text-anchor="middle" letter-spacing="2">子安地蔵尊</text>`],
};
