// Sign faces and other flat graphics for the atlases, drawn as SVG and rendered
// to PNG by the headless Chromium the Tools already use (Japanese text needs a
// real font renderer; numpy cannot draw 止まれ). Output: ArtSource/kit/gfx/<name>.png,
// committed, loaded by kit/atlas.py.
//   node ArtSource/kit/graphics.mjs
// Designs follow the Japanese road sign standard in shape and colour, simplified.
// Text and plates are fictional - no real operator or company names.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../Tools/package.json'));
const { chromium } = require('playwright-core');
const OUT = join(here, 'gfx');

const JP = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Hiragino Sans GB',sans-serif";
const RED = '#c8102e', BLUE = '#0b4ea2', YEL = '#f5c400', WHITE = '#ffffff', BLACK = '#111111';
const walker = (c) => `<g fill="${c}"><circle cx="0" cy="-34" r="9"/>
  <path d="M-6,-24 L8,-24 L14,0 L26,22 L18,26 L4,4 L-2,26 L-24,40 L-28,33 L-12,22 L-6,0 L-16,10 L-22,4 Z"/></g>`;

const G = {
  // regulatory / warning signs, 128 px
  STOP: [128, 128, `<rect width="128" height="128" fill="#8d9096"/>
    <path d="M6,14 L122,14 L64,118 Z" fill="${WHITE}"/><path d="M15,19 L113,19 L64,107 Z" fill="${RED}"/>
    <text x="64" y="52" font-family="${JP}" font-weight="700" font-size="25" fill="${WHITE}" text-anchor="middle" letter-spacing="-1">止まれ</text>`],
  SPEED40: [128, 128, `<rect width="128" height="128" fill="#8d9096"/>
    <circle cx="64" cy="64" r="62" fill="${WHITE}"/><circle cx="64" cy="64" r="52" fill="none" stroke="${RED}" stroke-width="14"/>
    <text x="64" y="86" font-family="Helvetica, Arial" font-weight="700" font-size="58" fill="${BLUE}" text-anchor="middle" letter-spacing="-3">40</text>`],
  NO_PARKING: [128, 128, `<rect width="128" height="128" fill="#8d9096"/>
    <circle cx="64" cy="64" r="62" fill="${WHITE}"/><circle cx="64" cy="64" r="51" fill="${BLUE}" stroke="${RED}" stroke-width="12"/>
    <line x1="30" y1="30" x2="98" y2="98" stroke="${RED}" stroke-width="12"/>`],
  CROSSWALK: [128, 128, `<rect width="128" height="128" rx="8" fill="${WHITE}"/><rect x="5" y="5" width="118" height="118" rx="6" fill="${BLUE}"/>
    <path d="M64,14 L114,108 L14,108 Z" fill="${WHITE}"/>
    <g transform="translate(64,72) scale(0.75)">${walker(BLACK)}</g>
    <g fill="${BLACK}"><rect x="30" y="98" width="12" height="5"/><rect x="50" y="98" width="12" height="5"/><rect x="70" y="98" width="12" height="5"/><rect x="90" y="98" width="10" height="5"/></g>`],
  CURVE: [128, 128, `<rect width="128" height="128" fill="#8d9096"/>
    <path d="M64,2 L126,64 L64,126 L2,64 Z" fill="${BLACK}"/><path d="M64,9 L119,64 L64,119 L9,64 Z" fill="${YEL}"/>
    <path d="M52,96 L52,62 Q52,44 70,44 L74,44" fill="none" stroke="${BLACK}" stroke-width="10"/>
    <path d="M72,30 L92,44 L72,58 Z" fill="${BLACK}"/>`],
  ONE_WAY: [256, 128, `<rect width="256" height="128" rx="8" fill="${WHITE}"/><rect x="6" y="6" width="244" height="116" rx="6" fill="${BLUE}"/>
    <path d="M24,46 L176,46 L176,24 L234,64 L176,104 L176,82 L24,82 Z" fill="${WHITE}"/>
    <text x="100" y="74" font-family="${JP}" font-weight="700" font-size="28" fill="${BLUE}" text-anchor="middle">一方通行</text>`],
  // pedestrian signal lenses, 64 px
  PED_RED: [64, 64, `<rect width="64" height="64" fill="#0b0b0c"/><g transform="translate(32,36) scale(0.62)" fill="#ff3324">
    <circle cx="0" cy="-34" r="9"/><path d="M-12,-24 L12,-24 L12,4 L8,40 L1,40 L0,8 L-1,40 L-8,40 L-12,4 Z"/></g>`],
  PED_GREEN: [64, 64, `<rect width="64" height="64" fill="#0b0b0c"/><g transform="translate(32,36) scale(0.62)">${walker('#16d0b5')}</g>`],
  // small plates
  POLE_PLATE: [32, 64, `<rect width="32" height="64" fill="#f4f4f0"/><rect x="1" y="1" width="30" height="62" fill="none" stroke="#333" stroke-width="2"/>
    <text x="16" y="22" font-family="${JP}" font-size="13" font-weight="700" text-anchor="middle" fill="#222">幹</text>
    <text x="16" y="42" font-family="Helvetica" font-size="12" text-anchor="middle" fill="#222">23</text>
    <text x="16" y="57" font-family="Helvetica" font-size="10" text-anchor="middle" fill="#222">14L</text>`],
  // tiger stripes round the pole foot: 45° stripes, period 32 px in x and y -> tiles in both axes
  TORA: [128, 128, `<defs><pattern id="p" width="22.6274" height="22.6274" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="22.6274" height="22.6274" fill="${YEL}"/><rect width="11.3137" height="22.6274" fill="${BLACK}"/></pattern></defs>
    <rect width="128" height="128" fill="url(#p)"/>`],
  PLAQUE: [64, 128, `<rect width="64" height="128" fill="#15120f"/><rect x="4" y="4" width="56" height="120" fill="none" stroke="#c9a14a" stroke-width="4"/>
    <text font-family="'Hiragino Mincho ProN', serif" font-size="25" fill="#e2c26a" text-anchor="middle">
    <tspan x="32" y="34">稲</tspan><tspan x="32" y="61">荷</tspan><tspan x="32" y="88">神</tspan><tspan x="32" y="115">社</tspan></text>`],
  BUS_STOP: [128, 128, `<circle cx="64" cy="64" r="63" fill="${WHITE}"/><circle cx="64" cy="64" r="56" fill="#1f6fb2"/>
    <text x="64" y="60" font-family="${JP}" font-weight="700" font-size="22" fill="${WHITE}" text-anchor="middle">バス停</text>
    <text x="64" y="90" font-family="Helvetica" font-weight="700" font-size="20" fill="${WHITE}" text-anchor="middle">BUS</text>`],
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, [w, h, body]] of Object.entries(G)) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<style>html,body{margin:0;background:transparent}</style>
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
    await page.locator('svg').screenshot({ path: join(OUT, `${name}.png`), omitBackground: true });
  }
} finally { await browser.close(); }
console.log(`GRAPHICS OK · ${Object.keys(G).length} → ${OUT}`);
