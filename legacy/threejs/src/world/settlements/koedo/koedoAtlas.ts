import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Tile } from '../wago/wagoKit';

/**
 * Atlas für Koedo: 2048 × 1024, 8 × 8 Kacheln zu 256 × 128 px, wie Kiso-Juku.
 * Ein Handelsstädtchen besteht aus **Kanban**: in Kawagoe trägt jedes Kura ein
 * schweres Holzschild über dem Laden, dazu Noren mit Hauswappen und senkrechte
 * Schilder. Die zweite Hälfte trägt die Innenräume der offenen Läden und die
 * Brauerei (Flaschenregal, Tankbeschriftung, Fassbezug). Alle Namen erfunden.
 */
const W = 2048, H = 1024, TW = 256, TH = 128, COLS = 8;

export const T = {
  eel: 0, imo: 1, kimono: 2, pottery: 3, museum: 4, incense: 5, soba: 6, miso: 7,
  washi: 8, candy: 9, fabric: 10, cafe: 11, sweets: 12, tea: 13, dango: 14, crafts: 15,
  pharmacy: 16, hardware: 17, brewery: 18, tall1: 19, tall2: 20, candyGate: 21, bellInfo: 22, mapBoard: 23,
  noren1: 24, noren2: 25, noren3: 26, noren4: 27, lanternRed: 28, lanternWhite: 29, shoji: 30, shojiWarm: 31,
  koshiLit: 32, inShop: 33, inSweets: 34, inSake: 35, inKimono: 36, inPottery: 37, inEel: 38, inCandy: 39,
  inCafe: 40, room: 41, manhole: 42, sudare: 43, white: 44, vend: 45, komodaru: 46, sugidama: 47,
  bottles: 48, tank: 49, poster: 50, menu: 51, plates: 52, meter: 53, busStop: 54, info: 55,
  ema: 56, torii: 57, konbini: 58, flatLit: 59, crest: 60, signpost: 61, lamp: 62, plate: 63,
} as const;

export function tile(i: number, px0 = 0, py0 = 0, px1 = TW, py1 = TH): Tile {
  const x = (i % COLS) * TW, y = Math.floor(i / COLS) * TH;
  return [(x + px0) / W, 1 - (y + py1) / H, (x + px1) / W, 1 - (y + py0) / H];
}

const MINCHO = '"Yu Mincho", "Hiragino Mincho ProN", "MS Mincho", serif';
const GOTHIC = '"Yu Gothic", "Hiragino Sans", "Meiryo", sans-serif';

export function buildKoedoAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  let seed = 0xc0ed0;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const at = (i: number, draw: () => void): void => {
    g.save(); g.translate((i % COLS) * TW, Math.floor(i / COLS) * TH); g.beginPath(); g.rect(0, 0, TW, TH); g.clip(); draw(); g.restore();
  };
  const text = (s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center', max = 240): void => {
    g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y, max);
  };
  const plank = (base: string, w = TW, h = TH): void => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.04 + rnd() * 0.08})`; g.lineWidth = 1 + rnd();
      const y = rnd() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd() * 6 - 3, w * 0.7, y + rnd() * 6 - 3, w, y + rnd() * 4 - 2); g.stroke();
    }
    const edge = g.createLinearGradient(0, 0, 0, h); edge.addColorStop(0, 'rgba(255,240,210,0.1)'); edge.addColorStop(0.5, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = edge; g.fillRect(0, 0, w, h);
  };
  const vertical = (s: string, x: number, y0: number, size: number, color: string, font = MINCHO): void => {
    g.font = `600 ${size}px ${font}`; g.fillStyle = color; g.textAlign = 'center';
    [...s].forEach((c, i) => g.fillText(c, x, y0 + i * size * 1.02));
  };
  /**
   * Kanban: schweres Brett mit Rahmen, Schrift eingeschnitten und vergoldet oder
   * weiß gefasst. In Kawagoe hängen sie über dem Pultdach, oft schwarz lackiert.
   */
  const kanban = (i: number, kanji: string, sub: string, bg: string, ink: string, size = 56, gold = false): void => at(i, () => {
    plank(bg); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 8; g.strokeRect(4, 4, TW - 8, TH - 8);
    g.strokeStyle = gold ? 'rgba(212,172,90,0.55)' : 'rgba(255,235,200,0.14)'; g.lineWidth = 2; g.strokeRect(12, 12, TW - 24, TH - 24);
    if (gold) { g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowOffsetY = 2; g.shadowBlur = 2; }
    text(kanji, 128, 78, `600 ${size}px ${MINCHO}`, ink, 'center', 222);
    g.shadowColor = 'transparent';
    if (sub) text(sub, 128, 108, `bold 12px ${GOTHIC}`, gold ? 'rgba(220,190,120,0.85)' : 'rgba(240,228,200,0.78)', 'center', 222);
  });
  // ── Kanban der Läden ──
  kanban(T.eel, '鰻 川島屋', 'UNAGI · KAWASHIMAYA · 創業文化二年', '#1c1714', '#e2c27a', 52, true);
  kanban(T.imo, '芋十', 'SWEET POTATO SWEETS · KOEDO', '#3a2616', '#f3e2bb', 70);
  kanban(T.kimono, '着物 きぬや', 'KIMONO RENTAL · KINUYA', '#221c24', '#ece2d0', 46);
  kanban(T.pottery, '陶器 松本', 'POTTERY · MATSUMOTO', '#2c2620', '#efe3c6', 52);
  kanban(T.museum, '蔵造り資料館', 'KURAZUKURI MUSEUM', '#e9e4d8', '#1c1a18', 40);
  kanban(T.incense, '香 薫堂', 'INCENSE · KUNDŌ', '#261e22', '#e6cf94', 58, true);
  kanban(T.soba, '蕎麦 小江戸庵', 'HAND-CUT SOBA', '#2a1f18', '#f3e6c6', 44);
  kanban(T.miso, '味噌醤油 丸大', 'MISO & SOY · MARUDAI', '#1a1614', '#e2c27a', 44, true);
  kanban(T.washi, '和紙 紙屋', 'WASHI PAPER · KAMIYA', '#efe8d8', '#2a2420', 50);
  kanban(T.candy, '駄菓子', 'OLD-FASHIONED CANDY', '#5a2a1c', '#f7e6c0', 66);
  kanban(T.fabric, '呉服 大黒屋', 'KIMONO FABRIC · DAIKOKUYA', '#1e1a18', '#e8c985', 46, true);
  kanban(T.cafe, '珈琲 蔵', 'KURA COFFEE · SINCE 1978', '#2c241e', '#efe0c0', 56);
  kanban(T.sweets, '和菓子 亀屋', 'WAGASHI · KAMEYA', '#2a2019', '#f0e2bf', 52);
  kanban(T.tea, '日本茶 茶の木', 'JAPANESE TEA · CHANOKI', '#23302a', '#eee4c6', 44);
  kanban(T.dango, '団子 まつや', 'DANGO · GRILLED ON CHARCOAL', '#3a2a1c', '#f5e2b8', 50);
  kanban(T.crafts, '竹細工', 'BAMBOO CRAFT', '#3b2c1f', '#f1e2bf', 64);
  kanban(T.pharmacy, '薬 大和屋', 'PHARMACY · YAMATOYA', '#1a1818', '#e4c880', 50, true);
  kanban(T.hardware, '金物 堀江', 'IRONMONGER · HORIE', '#1d1b19', '#ddd6c6', 50);
  // Brauerei: das große Schild über dem Tor, schwarz mit Gold.
  kanban(T.brewery, '泉屋酒造', 'IZUMIYA BREWERY · 小江戸 · 1789', '#141210', '#e0bd70', 56, true);
  // Senkrechte Schilder (Kake-kanban): werden hochkant abgebildet (`portrait`).
  at(T.tall1, () => { plank('#1e1914'); g.save(); g.translate(128, 64); g.rotate(-Math.PI / 2); text('小江戸 名物', 0, 14, `600 36px ${MINCHO}`, '#e2c27a', 'center', 120); g.restore(); vertical('蔵造', 38, 22, 24, '#d8c49c'); vertical('一番街', 218, 16, 22, '#d8c49c'); });
  at(T.tall2, () => { plank('#e6dcc4'); vertical('酒', 64, 50, 54, '#1a1410'); vertical('茶', 192, 50, 54, '#1a1410'); });
  at(T.candyGate, () => {
    g.fillStyle = '#a8321e'; g.fillRect(0, 0, TW, TH);
    g.fillStyle = '#f4e3b8'; g.fillRect(8, 8, TW - 16, TH - 16);
    text('菓子屋横丁', 128, 70, `600 46px ${MINCHO}`, '#8a1e12'); text('KASHIYA YOKOCHŌ · CANDY ALLEY', 128, 104, `bold 12px ${GOTHIC}`, '#5a1a10');
  });
  at(T.bellInfo, () => { plank('#2e2419'); text('時の鐘', 128, 62, `600 46px ${MINCHO}`, '#f1e3c2'); text('TOKI NO KANE · RINGS FOUR TIMES A DAY', 128, 100, `bold 11px ${GOTHIC}`, '#e0c9a0'); });
  at(T.mapBoard, () => {
    g.fillStyle = '#ece4cc'; g.fillRect(0, 0, TW, TH);
    // Reisfeld links, Kanal, Straße B, Hang rechts — so, wie man davorsteht.
    g.fillStyle = '#a9c4a0'; g.fillRect(0, 0, 50, TH); g.fillStyle = '#7fa2b0'; g.fillRect(50, 20, 10, 108);
    g.fillStyle = '#9ab27c'; g.fillRect(200, 0, 56, TH);
    g.strokeStyle = '#8a7a60'; g.lineWidth = 8; g.beginPath(); g.moveTo(10, 0); g.lineTo(120, 24); g.lineTo(150, 128); g.stroke();
    g.fillStyle = '#2a2420'; for (let i = 0; i < 9; i++) { g.fillRect(100 + i * 5, 34 + i * 10, 14, 7); g.fillRect(150 + i * 3, 30 + i * 10, 14, 7); }
    g.fillStyle = '#b3261e'; g.fillRect(170, 18, 10, 18); text('時の鐘', 176, 14, `bold 10px ${GOTHIC}`, '#b3261e');
    g.fillStyle = '#6a4a2a'; g.fillRect(96, 70, 28, 22); text('泉屋', 110, 104, `bold 10px ${GOTHIC}`, '#6a4a2a');
    text('小江戸 案内図', 80, 16, `bold 13px ${GOTHIC}`, '#2a2019'); text('現在地 ●', 214, 120, `bold 11px ${GOTHIC}`, '#c8201c');
  });
  // ── Noren (in drei Bahnen geteilt; die Schlitze liefert die Geometrie) ──
  const noren = (i: number, bg: string, draw: () => void): void => at(i, () => { g.fillStyle = bg; g.fillRect(0, 0, TW, TH); g.fillStyle = 'rgba(255,255,255,0.05)'; for (let x = 0; x < TW; x += 3) g.fillRect(x, 0, 1, TH); draw(); });
  noren(T.noren1, '#1f2c48', () => { g.strokeStyle = '#efeae0'; g.lineWidth = 7; g.beginPath(); g.arc(128, 58, 34, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#efeae0'; g.fillRect(104, 52, 48, 12); g.fillRect(122, 30, 12, 56); });
  noren(T.noren2, '#4a2418', () => { text('小江戸', 128, 84, `600 56px ${MINCHO}`, '#f2e8d8'); });
  noren(T.noren3, '#e9e3d4', () => { text('あまい', 128, 86, `600 60px ${MINCHO}`, '#1f2a44'); });
  noren(T.noren4, '#2a2622', () => { g.strokeStyle = '#e8e2d4'; g.lineWidth = 6; g.beginPath(); g.arc(128, 60, 36, 0, Math.PI * 2); g.stroke(); text('泉', 128, 78, `600 50px ${MINCHO}`, '#e8e2d4'); });
  // ── Laternen ──
  const lantern = (i: number, paper: string, ink: string, label: string, band: string): void => at(i, () => {
    const gr = g.createLinearGradient(0, 0, TW, 0);
    gr.addColorStop(0, paper); gr.addColorStop(0.25, '#fff8e6'); gr.addColorStop(0.5, paper); gr.addColorStop(0.75, '#fff8e6'); gr.addColorStop(1, paper);
    g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
    g.strokeStyle = 'rgba(90,60,30,0.28)'; g.lineWidth = 1.5; for (let y = 8; y < TH; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(TW, y); g.stroke(); }
    g.fillStyle = band; g.fillRect(0, 0, TW, 10); g.fillRect(0, TH - 10, TW, 10);
    for (const x of [64, 192]) vertical(label, x, 50, 34, ink);
  });
  lantern(T.lanternRed, '#d8452e', '#1a0e0a', '酒', '#1a1410');
  lantern(T.lanternWhite, '#f4e9cf', '#1a1410', '小江戸', '#1a1410');
  // ── Fenster, Innenräume ──
  const shoji = (i: number, paper: string, warm: boolean): void => at(i, () => {
    g.fillStyle = paper; g.fillRect(0, 0, TW, TH);
    for (let j = 0; j < 16; j++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,250' : '180,160,120'},${0.08 + rnd() * 0.16})`; g.fillRect(Math.floor(rnd() * 8) * 32 + 2, Math.floor(rnd() * 4) * 32 + 2, 28, 28); }
    if (warm) { g.fillStyle = 'rgba(70,40,20,0.22)'; g.beginPath(); g.ellipse(80, 96, 22, 40, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = warm ? '#4a2e18' : '#3b2a1c'; g.lineWidth = 3;
    for (let x = 0; x <= TW; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, TH); g.stroke(); }
    for (let y = 0; y <= TH; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(TW, y); g.stroke(); }
    g.lineWidth = 8; g.strokeRect(0, 0, TW, TH); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, TH); g.stroke();
  });
  shoji(T.shoji, '#e4dcc8', false);
  shoji(T.shojiWarm, '#f4c784', true);
  at(T.koshiLit, () => {
    const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, '#ffd89a'); gr.addColorStop(0.55, '#c98a4a'); gr.addColorStop(1, '#3a2416');
    g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
    g.fillStyle = 'rgba(40,24,14,0.5)'; g.fillRect(30, 70, 70, 58); g.fillRect(170, 40, 16, 88);
    g.fillStyle = 'rgba(255,240,200,0.5)'; g.beginPath(); g.arc(210, 30, 16, 0, Math.PI * 2); g.fill();
  });
  const interior = (i: number, wall: string, draw: () => void): void => at(i, () => {
    const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, '#ffe2b0'); gr.addColorStop(0.25, wall); gr.addColorStop(1, '#1d140e'); g.fillStyle = gr; g.fillRect(0, 0, TW, TH); draw();
  });
  const shelves = (rows: number, colors: readonly string[], y0 = 20, step = 28, item: [number, number] = [11, 17]): void => {
    for (let s = 0; s < rows; s++) { g.fillStyle = '#6e5238'; g.fillRect(8, y0 + 18 + s * step, 240, 4); for (let j = 0; j < 16; j++) { g.fillStyle = colors[(j * 5 + s) % colors.length]!; g.fillRect(12 + j * 15, y0 + s * step, item[0], item[1]); } }
  };
  interior(T.inShop, '#d8c8a8', () => shelves(3, ['#7a4a2a', '#e8dcc0', '#b33a2a', '#4a6a8a', '#d9a441', '#3a5a3a']));
  interior(T.inSweets, '#e0c89a', () => {
    g.fillStyle = '#5a3a22'; g.fillRect(0, 80, TW, 48); g.fillStyle = '#e8dcc6'; g.fillRect(0, 76, TW, 6);
    for (let j = 0; j < 9; j++) { g.fillStyle = ['#e8a0b0', '#f2ead6', '#8ab070', '#c8783a', '#f0d070'][j % 5]!; g.beginPath(); g.arc(20 + j * 27, 68, 9, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f3e3c0'; for (let j = 0; j < 5; j++) g.fillRect(14 + j * 50, 18, 36, 34);
  });
  interior(T.inSake, '#9a6a3a', () => {
    for (let j = 0; j < 5; j++) { g.fillStyle = '#5a3a20'; g.beginPath(); g.ellipse(30 + j * 50, 96, 22, 30, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#e8e0cc'; g.fillRect(18 + j * 50, 86, 24, 16); }
    for (let j = 0; j < 14; j++) { g.fillStyle = ['#2a5a3a', '#6a2a1a', '#1a2a4a', '#8a6a2a'][j % 4]!; g.fillRect(14 + j * 17, 24, 10, 34); g.fillRect(17 + j * 17, 16, 4, 10); }
  });
  interior(T.inKimono, '#c8a878', () => {
    // Kimonos an Ständern, bunt — das Bild der Leihläden in Kawagoe.
    for (let j = 0; j < 7; j++) {
      const c = ['#c84a6a', '#e8a8c0', '#3a5aa8', '#e8c060', '#8a4ab0', '#d86a3a', '#4a8a7a'][j]!;
      g.fillStyle = c; g.beginPath(); g.moveTo(14 + j * 34, 34); g.lineTo(42 + j * 34, 34); g.lineTo(46 + j * 34, 116); g.lineTo(10 + j * 34, 116); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(20 + j * 34 + rnd() * 20, 50 + rnd() * 60, 3 + rnd() * 3, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#e8d8a0'; g.fillRect(12 + j * 34, 72, 32, 8);
    }
    g.fillStyle = '#3a2a1c'; g.fillRect(0, 28, TW, 4);
  });
  interior(T.inPottery, '#c7a57a', () => {
    for (let s = 0; s < 3; s++) { g.fillStyle = '#6a4a2e'; g.fillRect(8, 44 + s * 30, 240, 4); for (let j = 0; j < 12; j++) { g.fillStyle = ['#3a4a5a', '#b8a888', '#6a3a2a', '#e8e0d0', '#4a6a5a'][(j + s) % 5]!; g.beginPath(); g.ellipse(18 + j * 20, 36 + s * 30, 8, 8 + (j % 3) * 2, 0, 0, Math.PI * 2); g.fill(); } }
  });
  interior(T.inEel, '#b07a42', () => {
    g.fillStyle = '#4a2e1c'; g.fillRect(0, 86, TW, 42); g.fillStyle = '#c89a62'; g.fillRect(0, 82, TW, 6);
    for (let j = 0; j < 4; j++) { g.fillStyle = '#1a1210'; g.fillRect(24 + j * 58, 90, 36, 22); g.fillStyle = '#a8561e'; g.fillRect(28 + j * 58, 92, 28, 10); }
    const smoke = g.createRadialGradient(200, 40, 4, 200, 40, 50); smoke.addColorStop(0, 'rgba(255,250,240,0.5)'); smoke.addColorStop(1, 'rgba(255,250,240,0)'); g.fillStyle = smoke; g.fillRect(140, 0, 116, 90);
    g.fillStyle = '#f3e3c0'; for (let j = 0; j < 3; j++) g.fillRect(14 + j * 44, 18, 32, 40);
  });
  interior(T.inCandy, '#e0b070', () => {
    // Bonbongläser in Reihen, grelle Farben: der Kashiya Yokochō.
    for (let s = 0; s < 3; s++) for (let j = 0; j < 10; j++) {
      const x = 14 + j * 24, y = 26 + s * 32;
      g.fillStyle = 'rgba(230,240,245,0.55)'; g.fillRect(x, y, 18, 24);
      g.fillStyle = ['#e84a3a', '#f0c030', '#3ab0e0', '#e870b0', '#70c050', '#f08a30'][(j + s * 2) % 6]!; g.fillRect(x + 2, y + 8, 14, 14);
    }
  });
  interior(T.inCafe, '#b89060', () => {
    g.fillStyle = '#3a2618'; g.fillRect(0, 88, TW, 40);
    for (let j = 0; j < 3; j++) { g.fillStyle = '#6a4a2e'; g.fillRect(24 + j * 80, 76, 48, 8); g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(48 + j * 80, 72, 5, 0, Math.PI * 2); g.fill(); }
    for (let j = 0; j < 4; j++) { const lamp = g.createRadialGradient(32 + j * 64, 20, 1, 32 + j * 64, 20, 22); lamp.addColorStop(0, 'rgba(255,230,160,1)'); lamp.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = lamp; g.fillRect(j * 64, 0, 64, 44); }
  });
  at(T.room, () => {
    g.fillStyle = '#ffc890'; g.fillRect(0, 0, TW, TH); g.fillStyle = 'rgba(255,245,220,0.45)'; g.fillRect(0, 0, TW, TH);
    g.fillStyle = 'rgba(40,30,20,0.3)'; g.fillRect(30, 70, 60, 58); g.fillRect(150, 30, 12, 98);
    g.strokeStyle = '#3a2716'; g.lineWidth = 3; for (let x = 0; x <= TW; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, TH); g.stroke(); }
  });
  at(T.manhole, () => {
    g.fillStyle = '#4a4c4d'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#5d6061'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a3c3d'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    // Der Glockenturm auf dem Deckel — Kawagoe hat genau so einen.
    g.fillStyle = '#7b8182'; g.fillRect(56, 30, 16, 56); g.fillRect(48, 28, 32, 6); g.fillRect(50, 52, 28, 5); g.fillRect(46, 84, 36, 6);
    g.beginPath(); g.moveTo(44, 30); g.lineTo(64, 16); g.lineTo(84, 30); g.fill();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.beginPath(); g.arc(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40, 5, 0, Math.PI * 2); g.fill(); }
    text('こえど', 64, 118, `bold 10px ${GOTHIC}`, '#8a8f90');
  });
  at(T.sudare, () => {
    g.clearRect(0, 0, TW, TH);
    for (let x = 0; x < TW; x += 3) { const v = 150 + rnd() * 50; g.fillStyle = `rgb(${v + 40},${v + 18},${v - 40})`; if (rnd() < 0.86) g.fillRect(x, 0, 2, TH); }
    g.fillStyle = '#5a4630'; for (const y of [10, 64, 118]) g.fillRect(0, y, TW, 3);
  });
  at(T.white, () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, TW, TH); });
  at(T.vend, () => {
    g.fillStyle = '#c8201c'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#f5f8fb'; g.fillRect(16, 10, 224, 66);
    for (let row = 0; row < 2; row++) for (let j = 0; j < 8; j++) { g.fillStyle = ['#8a4a2a', '#3a6a3a', '#d9a441', '#2a3a6a', '#e8e0c8', '#c83a2a'][(j + row * 3) % 6]!; g.fillRect(26 + j * 27, 14 + row * 31, 13, 21); g.fillStyle = '#333'; g.fillRect(24 + j * 27, 37 + row * 31, 17, 3); }
    g.fillStyle = '#181818'; g.fillRect(40, 88, 176, 26); text('つめた〜い COLD', 128, 107, `bold 14px ${GOTHIC}`, '#6ad0ff');
  });
  // Komodaru: das Strohfass der Brauerei, mit Etikett — um den Zylinder gewickelt.
  at(T.komodaru, () => {
    g.fillStyle = '#d8c48a'; g.fillRect(0, 0, TW, TH);
    for (let x = 0; x < TW; x += 2) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,245,200' : '120,100,50'},${0.2 + rnd() * 0.2})`; g.fillRect(x, 0, 1, TH); }
    g.fillStyle = '#3a2a1a'; for (const y of [14, 56, 100]) g.fillRect(0, y, TW, 5);
    for (const cx of [64, 192]) { g.fillStyle = '#f2ead4'; g.fillRect(cx - 28, 26, 56, 70); g.strokeStyle = '#b3261e'; g.lineWidth = 4; g.strokeRect(cx - 24, 30, 48, 62); vertical('泉屋', cx, 54, 24, '#1a1410'); }
  });
  at(T.sugidama, () => {
    g.fillStyle = '#556433'; g.fillRect(0, 0, TW, TH);
    for (let i = 0; i < 1100; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '150,160,90' : '38,48,20'},${0.3 + rnd() * 0.4})`; g.fillRect(rnd() * TW, rnd() * TH, 3, 1 + rnd() * 3); }
  });
  // Brauerei innen: Flaschenregal (Isshōbin) und die Beschriftung der Tanks.
  at(T.bottles, () => {
    plank('#5a3e26');
    for (let s = 0; s < 3; s++) {
      g.fillStyle = '#3a2616'; g.fillRect(0, 38 + s * 42, TW, 5);
      for (let j = 0; j < 18; j++) { const c = ['#1e4a2e', '#4a1e14', '#1a2a4a', '#6a5a2a', '#e8e4d8'][(j * 3 + s) % 5]!; g.fillStyle = c; g.fillRect(6 + j * 14, 12 + s * 42, 9, 26); g.fillRect(8 + j * 14, 4 + s * 42, 5, 9); g.fillStyle = '#efe6cc'; g.fillRect(6 + j * 14, 22 + s * 42, 9, 9); }
    }
  });
  at(T.tank, () => {
    g.fillStyle = '#e4e6e0'; g.fillRect(0, 0, TW, TH);
    g.fillStyle = 'rgba(0,0,0,0.08)'; for (let x = 0; x < TW; x += 64) g.fillRect(x, 0, 18, TH);
    for (const cx of [64, 192]) { g.fillStyle = '#1a3a6a'; g.fillRect(cx - 34, 30, 68, 50); text(['一号', '二号'][cx > 100 ? 1 : 0]!, cx, 64, `600 30px ${MINCHO}`, '#f2f0e8'); text('3600L', cx, 100, `bold 14px ${GOTHIC}`, '#2a2a2a'); }
  });
  at(T.poster, () => {
    const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, '#f2e5c8'); gr.addColorStop(1, '#c8a060'); g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
    g.fillStyle = '#1a1410'; g.beginPath(); g.arc(196, 62, 36, 0, Math.PI * 2); g.fill(); g.fillStyle = '#e8e0cc'; g.beginPath(); g.arc(196, 62, 28, 0, Math.PI * 2); g.fill();
    vertical('新酒', 36, 30, 30, '#8a1e12'); text('NEW SAKE · 新酒できました', 120, 110, `bold 13px ${GOTHIC}`, '#2a1a10');
  });
  at(T.menu, () => {
    plank('#5a4430'); g.fillStyle = '#23302a'; g.fillRect(14, 12, 228, 104);
    text('芋ソフト  450円', 128, 46, `600 24px ${MINCHO}`, '#f2eee0'); text('だんご 3本 300円', 128, 78, `600 22px ${MINCHO}`, '#f2eee0'); text('SWEET POTATO · DANGO', 128, 104, `bold 11px ${GOTHIC}`, '#e8c07a');
  });
  at(T.plates, () => {
    const names = ['小林', '川島', '長谷川', '岡田', '石井', '大野', '中村', '堀'];
    names.forEach((n, i) => { const x = (i % 4) * 64, y = Math.floor(i / 4) * 64; g.fillStyle = i % 2 ? '#e8dcc0' : '#2a2420'; g.fillRect(x + 4, y + 4, 56, 56); text(n, x + 32, y + 42, `600 22px ${MINCHO}`, i % 2 ? '#2a2019' : '#f4e7c8', 'center', 52); });
  });
  at(T.meter, () => { g.fillStyle = '#d8d8d2'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#2a2a2a'; g.fillRect(40, 20, 176, 50); g.fillStyle = '#bcd8c0'; g.fillRect(50, 28, 156, 34); });
  at(T.busStop, () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#2a4a8a'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill(); text('バス停', 64, 60, `bold 22px ${GOTHIC}`, '#ffffff'); text('小江戸', 64, 90, `bold 20px ${GOTHIC}`, '#ffffff'); text('KOEDO', 190, 60, `bold 17px ${GOTHIC}`, '#2a4a8a'); text('→ TOKYO · MIZUTA', 190, 84, `bold 10px ${GOTHIC}`, '#333'); });
  at(T.info, () => {
    g.fillStyle = '#1e2a36'; g.fillRect(0, 0, TW, TH); g.strokeStyle = '#c9b48a'; g.lineWidth = 3; g.strokeRect(6, 6, TW - 12, TH - 12);
    text('小江戸', 64, 50, `600 34px ${MINCHO}`, '#f3e6c8'); text('KOEDO', 64, 74, `bold 14px ${GOTHIC}`, '#d8c49c');
    g.fillStyle = 'rgba(243,230,200,0.7)'; for (let l = 0; l < 7; l++) g.fillRect(130, 22 + l * 13, 110 - (l % 3) * 14, 4);
    text('KURA MERCHANT TOWN · CANAL QUARTER', 128, 112, `bold 10px ${GOTHIC}`, '#f3e6c8');
  });
  at(T.ema, () => {
    g.fillStyle = '#6a4a30'; g.fillRect(0, 0, TW, TH);
    for (let i = 0; i < 18; i++) { const x = 6 + (i % 9) * 28, y = 8 + Math.floor(i / 9) * 60; g.fillStyle = '#d8b882'; g.beginPath(); g.moveTo(x, y + 12); g.lineTo(x + 12, y); g.lineTo(x + 24, y + 12); g.lineTo(x + 24, y + 48); g.lineTo(x, y + 48); g.fill(); g.fillStyle = '#2a1a10'; g.fillRect(x + 6, y + 20, 12, 3); g.fillRect(x + 6, y + 28, 10, 3); g.fillStyle = '#b3261e'; g.fillRect(x + 8, y + 38, 8, 6); }
  });
  at(T.torii, () => { plank('#1c1814'); g.strokeStyle = '#c9a85a'; g.lineWidth = 4; g.strokeRect(10, 10, TW - 20, TH - 20); vertical('氷川', 128, 40, 36, '#e2c27a'); });
  // Konbini am Ortsrand: der Übergang zur Stadt in einem Schild.
  at(T.konbini, () => {
    g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, TW, TH);
    g.fillStyle = '#2a7a4a'; g.fillRect(0, 18, TW, 24); g.fillStyle = '#e8a020'; g.fillRect(0, 42, TW, 10); g.fillStyle = '#d83a2a'; g.fillRect(0, 52, TW, 10);
    text('HANA MART', 128, 100, `bold 34px ${GOTHIC}`, '#2a7a4a'); text('24H', 230, 36, `bold 14px ${GOTHIC}`, '#ffffff');
  });
  at(T.flatLit, () => {
    g.fillStyle = '#f0e2c0'; g.fillRect(0, 0, TW, TH);
    g.fillStyle = 'rgba(60,70,90,0.35)'; g.fillRect(20, 60, 80, 68); g.fillStyle = 'rgba(120,180,255,0.35)'; g.fillRect(170, 50, 50, 30);
    g.strokeStyle = '#8a8a86'; g.lineWidth = 6; g.strokeRect(0, 0, TW, TH); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, TH); g.stroke();
  });
  at(T.crest, () => {
    g.fillStyle = '#ebe6da'; g.fillRect(0, 0, TW, TH);
    const crest = (cx: number, kind: number): void => {
      g.strokeStyle = '#1e1c1a'; g.fillStyle = '#1e1c1a'; g.lineWidth = 6; g.beginPath(); g.arc(cx, 64, 46, 0, Math.PI * 2); g.stroke();
      if (kind === 0) { g.fillRect(cx - 26, 56, 52, 14); g.fillRect(cx - 7, 30, 14, 66); }
      else for (let j = 0; j < 3; j++) g.fillRect(cx - 28, 42 + j * 16, 56, 8);
    };
    crest(64, 0); crest(192, 1);
  });
  // Wegweiser: zwei Pfeilbretter (obere / untere Kachelhälfte).
  at(T.signpost, () => {
    for (const [y, left, jp, en] of [[0, true, '小江戸 蔵の街', 'KOEDO · KURA TOWN'], [64, false, '東京 12km', 'TOKYO']] as const) {
      g.save(); g.translate(0, y); g.fillStyle = '#5a4430'; g.beginPath();
      if (left) { g.moveTo(4, 32); g.lineTo(34, 4); g.lineTo(252, 4); g.lineTo(252, 60); g.lineTo(34, 60); }
      else { g.moveTo(252, 32); g.lineTo(222, 4); g.lineTo(4, 4); g.lineTo(4, 60); g.lineTo(222, 60); }
      g.closePath(); g.fill(); g.strokeStyle = '#2a1e14'; g.lineWidth = 3; g.stroke();
      text((left ? '← ' : '') + jp + (left ? '' : ' →'), 128, 32, `600 22px ${MINCHO}`, '#f4ead2');
      text(en, 128, 52, `bold 11px ${GOTHIC}`, '#e6d6b0');
      g.restore();
    }
  });
  // Straßenlampe: mattes Glas mit warmem Kern (die gusseisernen Laternen der Ichibangai).
  at(T.lamp, () => { const gr = g.createRadialGradient(128, 64, 8, 128, 64, 130); gr.addColorStop(0, '#fff6dc'); gr.addColorStop(1, '#f2c47e'); g.fillStyle = gr; g.fillRect(0, 0, TW, TH); g.fillStyle = 'rgba(40,30,20,0.35)'; g.fillRect(0, 0, TW, 6); g.fillRect(0, TH - 6, TW, 6); });
  at(T.plate, () => { g.fillStyle = '#8f8c83'; g.fillRect(0, 0, TW, TH); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.12})`; g.fillRect(rnd() * TW, rnd() * TH, 2, 2); } text('中橋', 128, 64, `600 44px ${MINCHO}`, '#2e2c28'); text('NAKABASHI', 128, 100, `bold 15px ${GOTHIC}`, '#34322e'); });
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8;
  return texture;
}

/**
 * Pflaster von Straße B und Platz: graue Granitsteine (Kopfsteine) im Reihenverband
 * in der Mitte, Granitplatten-Bänder zu den Rinnen. Kachelt längs alle 8 m; u 0…1
 * über die Fahrbahnbreite. Kawagoe ist asphaltiert, Kurashiki gepflastert — Straße
 * B gehört zum Kanalviertel und nimmt den Stein.
 */
export function buildStreetTexture(): CanvasTexture {
  const N = 512, canvas = document.createElement('canvas'); canvas.width = N; canvas.height = N * 2;
  const g = canvas.getContext('2d')!;
  let seed = 0x5e77;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  g.fillStyle = '#4c4a46'; g.fillRect(0, 0, N, N * 2);
  const x0 = N * 0.12, x1 = N * 0.88;
  // Kopfsteine: Reihen quer, jede Reihe versetzt, Steine ungleich breit.
  for (let y = 0; y < N * 2;) {
    const h = 18 + rnd() * 6; let x = x0 + (rnd() * 20 - 10);
    while (x < x1) {
      const w = 18 + rnd() * 14, v = 108 + rnd() * 42;
      g.fillStyle = `rgb(${v},${v - 2},${v - 8})`; g.beginPath(); g.roundRect?.(Math.max(x0, x) + 1.2, y + 1.2, Math.min(w, x1 - x) - 2.4, h - 2.4, 3); g.fill();
      for (let k = 0; k < 5; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.14})`; g.fillRect(x + rnd() * w, y + rnd() * h, 2, 2); }
      x += w;
    }
    y += h;
  }
  // Fahrspuren: leicht dunkler und glatter gefahren.
  for (const xc of [0.32, 0.68]) { const gr = g.createLinearGradient(N * xc - 40, 0, N * xc + 40, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(20,18,16,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(N * xc - 40, 0, 80, N * 2); }
  // Granitplatten-Bänder außen.
  for (const [a, b] of [[0, x0], [x1, N]] as const) {
    for (let y = 0; y < N * 2;) {
      const h = 40 + rnd() * 50, v = 150 + rnd() * 30;
      g.fillStyle = `rgb(${v},${v - 3},${v - 10})`; g.fillRect(a + 1.5, y + 1.5, b - a - 3, h - 3);
      for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '40,40,40'},${rnd() * 0.16})`; g.fillRect(a + rnd() * (b - a), y + rnd() * h, 2, 2); }
      y += h;
    }
  }
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(30,26,22,${0.03 + rnd() * 0.05})`; g.beginPath(); g.ellipse(rnd() * N, rnd() * N * 2, 20 + rnd() * 60, 10 + rnd() * 30, rnd() * 3, 0, Math.PI * 2); g.fill(); }
  const t = new CanvasTexture(canvas); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
  return t;
}
