import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Tile } from '../wago/wagoKit';

/**
 * Atlas für Kiso-Juku: 2048 × 1024, 8 × 8 Kacheln zu 256 × 128 px — doppelt so
 * breit wie Funaura und Stillwater, weil eine Poststation vor allem aus
 * **Schrift** besteht: jedes Haus war ein Gasthof oder ein Laden, und das Bild
 * von Tsumago sind die dunklen Bretter mit weißen Zeichen. Alle Namen erfunden.
 *
 * Die zweite Hälfte trägt den Innenraum des Honjin (Tatami, Fusuma mit Malerei,
 * Rollbild) — er ist das einzige begehbare Haus und wird aus der Nähe gesehen.
 */
const W = 2048, H = 1024, TW = 256, TH = 128, COLS = 8;

export const T = {
  honjin: 0, waki: 1, inn1: 2, inn2: 3, inn3: 4, soba: 5, gohei: 6, sake: 7,
  crafts: 8, lacquer: 9, sweets: 10, post: 11, shop: 12, mapBoard: 13, kosatsu: 14, marker: 15,
  teahouse: 16, lanternInn: 17, lanternTea: 18, lanternSake: 19, shoji: 20, shojiWarm: 21, koshiLit: 22, room1: 23,
  room2: 24, room3: 25, inIrori: 26, inShop: 27, inSoba: 28, inSake: 29, inGohei: 30, inCrafts: 31,
  amado: 32, noren1: 33, noren2: 34, noren3: 35, plates: 36, manhole: 37, sudare: 38, poster: 39,
  vendWood: 40, menu: 41, white: 42, maku: 43, fusuma: 44, tatami: 45, scroll: 46, bear: 47,
  busStop: 48, info: 49, hanging1: 50, hanging2: 51, crest: 52, shrine: 53, ema: 54, fusuma2: 55,
  postbox: 56, bellInfo: 57, wheelInfo: 58, woodGrain: 59, meter: 60, andon: 61, sugidama: 62, gutter: 63,
} as const;

export function tile(i: number, px0 = 0, py0 = 0, px1 = TW, py1 = TH): Tile {
  const x = (i % COLS) * TW, y = Math.floor(i / COLS) * TH;
  return [(x + px0) / W, 1 - (y + py1) / H, (x + px1) / W, 1 - (y + py0) / H];
}

const MINCHO = '"Yu Mincho", "Hiragino Mincho ProN", "MS Mincho", serif';
const GOTHIC = '"Yu Gothic", "Hiragino Sans", "Meiryo", sans-serif';

export function buildKisoAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  let seed = 0x4b15;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const at = (i: number, draw: () => void): void => {
    g.save(); g.translate((i % COLS) * TW, Math.floor(i / COLS) * TH); g.beginPath(); g.rect(0, 0, TW, TH); g.clip(); draw(); g.restore();
  };
  const text = (s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center', max = 240): void => {
    g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y, max);
  };
  /** Altes Zedernbrett: Maserung, ausgewaschene Kanten, dunkle Nagelköpfe. */
  const plank = (base: string, w = TW, h = TH): void => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.04 + rnd() * 0.08})`; g.lineWidth = 1 + rnd();
      const y = rnd() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd() * 6 - 3, w * 0.7, y + rnd() * 6 - 3, w, y + rnd() * 4 - 2); g.stroke();
    }
    const edge = g.createLinearGradient(0, 0, 0, h); edge.addColorStop(0, 'rgba(255,240,210,0.1)'); edge.addColorStop(0.5, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = edge; g.fillRect(0, 0, w, h);
  };
  /** Senkrechte Aufschrift in Mincho — so stehen die Hausnamen am Nakasendō. */
  const vertical = (s: string, x: number, y0: number, size: number, color: string): void => {
    g.font = `600 ${size}px ${MINCHO}`; g.fillStyle = color; g.textAlign = 'center';
    [...s].forEach((c, i) => g.fillText(c, x, y0 + i * size * 1.02));
  };
  /** Horizontales Hausschild: dunkles Brett, eingeschnittene helle Zeichen, Rahmen. */
  const board = (i: number, kanji: string, sub: string, bg = '#2e241c', ink = '#efe3c4', size = 58): void => at(i, () => {
    plank(bg); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 7; g.strokeRect(4, 4, TW - 8, TH - 8);
    g.strokeStyle = 'rgba(255,235,200,0.12)'; g.lineWidth = 2; g.strokeRect(11, 11, TW - 22, TH - 22);
    text(kanji, 128, 76, `600 ${size}px ${MINCHO}`, ink, 'center', 226);
    if (sub) text(sub, 128, 108, `bold 13px ${GOTHIC}`, 'rgba(239,227,196,0.78)', 'center', 226);
  });
  // ── Hausschilder ──
  board(T.honjin, '本陣', 'HONJIN · LODGING OF THE LORDS', '#241b15', '#f2e4c0', 70);
  board(T.waki, '脇本陣 奥屋', 'WAKI-HONJIN · OKUYA', '#2a2019', '#efe0bb', 46);
  board(T.inn1, '旅籠 松葉屋', 'HATAGO MATSUBAYA', '#302519', '#f1e4c2', 44);
  board(T.inn2, '御宿 大黒屋', 'INN · DAIKOKUYA', '#2b211a', '#f0e2c0', 44);
  board(T.inn3, '旅籠 いこま', 'HATAGO IKOMA · SINCE 1791', '#35291f', '#efe2c5', 46);
  board(T.soba, '手打そば', 'HAND-CUT SOBA · 木曽路', '#2a1f18', '#f3e6c6', 56);
  board(T.gohei, '五平餅', 'GOHEI-MOCHI · GRILLED ON CEDAR', '#3a2a1c', '#f5e2b8', 64);
  board(T.sake, '地酒 七笑', 'LOCAL SAKE · NANAWARAI', '#221a15', '#f4e0b0', 52);
  board(T.crafts, '木工 ひのき屋', 'HINOKI WOODCRAFT · COMBS', '#3b2c1f', '#f1e2bf', 42);
  board(T.lacquer, '木曽漆器', 'KISO LACQUERWARE', '#1c1512', '#e9c877', 56);
  board(T.sweets, '甘味処', 'SWEETS · KURI-KINTON · TEA', '#2f2319', '#f3e3c3', 58);
  board(T.shop, 'みやげ 山城屋', 'SOUVENIRS · YAMASHIROYA', '#33271d', '#f0e0bd', 44);
  at(T.post, () => {
    plank('#3a2d22'); g.fillStyle = '#f4efe2'; g.fillRect(14, 14, 228, 100);
    g.fillStyle = '#c8201c'; g.font = `bold 64px ${GOTHIC}`; g.textAlign = 'center'; g.fillText('〒', 50, 90);
    text('郵便局', 160, 70, `600 44px ${MINCHO}`, '#1d1712'); text('KISO-JUKU POST OFFICE', 160, 100, `bold 12px ${GOTHIC}`, '#6a1a14');
  });
  at(T.teahouse, () => { plank('#4a3726'); vertical('峠の茶屋', 40, 30, 24, '#f2e5c4'); text('PASS TEAHOUSE', 150, 56, `bold 20px ${GOTHIC}`, '#f2e5c4'); text('お茶・団子・甘酒', 150, 92, `600 22px ${MINCHO}`, '#e9d3a2'); });
  // ── Tafeln ──
  at(T.mapBoard, () => {
    g.fillStyle = '#ece4cc'; g.fillRect(0, 0, TW, TH);
    // Tal links, Hang rechts, die Straße diagonal — so wie man davorsteht.
    g.fillStyle = '#b9c98f'; g.fillRect(0, 0, 70, TH); g.fillStyle = '#7f9a62'; g.fillRect(190, 0, 66, TH);
    g.strokeStyle = '#8a7a60'; g.lineWidth = 7; g.beginPath(); g.moveTo(110, TH); g.lineTo(150, 0); g.stroke();
    g.fillStyle = '#5a4432'; for (let i = 0; i < 12; i++) { const t = i / 12; g.fillRect(84 + t * 40, TH - 8 - t * 118, 16, 7); g.fillRect(134 + t * 40, TH - 12 - t * 118, 14, 7); }
    g.fillStyle = '#b3261e'; g.fillRect(96, 58, 18, 12); text('本陣', 105, 52, `bold 11px ${GOTHIC}`, '#b3261e');
    g.strokeStyle = '#6a5a44'; g.lineWidth = 3; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(140, 70); g.lineTo(206, 44); g.lineTo(240, 20); g.stroke(); g.setLineDash([]);
    text('木曽宿 案内図', 50, 22, `bold 15px ${GOTHIC}`, '#2a2019'); text('茶屋 ▲', 222, 16, `bold 11px ${GOTHIC}`, '#2a2019');
    text('現在地 ●', 196, 120, `bold 12px ${GOTHIC}`, '#c8201c'); text('NAKASENDO', 36, 118, `bold 10px ${GOTHIC}`, '#2a2019');
  });
  // Kōsatsu: Holztafeln mit Verordnungen in senkrechten Spalten — Schrift als Textur, nicht als Inhalt.
  at(T.kosatsu, () => {
    plank('#6d5a44');
    for (let b = 0; b < 3; b++) {
      const x0 = 6 + b * 83; g.fillStyle = '#8a765c'; g.fillRect(x0, 8, 78, 112); g.strokeStyle = '#3a2a1c'; g.lineWidth = 2; g.strokeRect(x0, 8, 78, 112);
      text(['定', '覚', '掟'][b]!, x0 + 66, 32, `600 18px ${MINCHO}`, '#1f1812');
      for (let c = 0; c < 6; c++) for (let k = 0; k < 7; k++) if (rnd() < 0.82) { g.fillStyle = `rgba(25,18,12,${0.55 + rnd() * 0.35})`; g.fillRect(x0 + 52 - c * 9, 44 + k * 10, 5, 7); }
    }
  });
  at(T.marker, () => {
    g.fillStyle = '#8f8c83'; g.fillRect(0, 0, TW, TH);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.12})`; g.fillRect(rnd() * TW, rnd() * TH, 2, 2); }
    vertical('中山道', 40, 34, 30, '#2e2c28'); vertical('木曽宿', 96, 34, 30, '#2e2c28');
    text('NAKASENDO', 190, 52, `bold 17px ${GOTHIC}`, '#34322e'); text('← 峠 2 km', 190, 80, `bold 16px ${GOTHIC}`, '#34322e'); text('下の宿 6 km →', 190, 104, `bold 14px ${GOTHIC}`, '#34322e');
  });
  // ── Laternen (um den Zylinder gewickelt: zweimal beschriftet, vorn und hinten) ──
  const lantern = (i: number, paper: string, ink: string, label: string, band: string): void => at(i, () => {
    const gr = g.createLinearGradient(0, 0, TW, 0);
    gr.addColorStop(0, paper); gr.addColorStop(0.25, '#fff8e6'); gr.addColorStop(0.5, paper); gr.addColorStop(0.75, '#fff8e6'); gr.addColorStop(1, paper);
    g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
    g.strokeStyle = 'rgba(90,60,30,0.28)'; g.lineWidth = 1.5; for (let y = 8; y < TH; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(TW, y); g.stroke(); }
    g.fillStyle = band; g.fillRect(0, 0, TW, 10); g.fillRect(0, TH - 10, TW, 10);
    for (const x of [64, 192]) vertical(label, x, 50, 34, ink);
  });
  lantern(T.lanternInn, '#f4e9cf', '#1a1410', '御宿', '#1a1410');
  lantern(T.lanternTea, '#f3dfb8', '#8a1c14', '茶屋', '#8a1c14');
  lantern(T.lanternSake, '#f0e3c6', '#1a1410', '酒', '#6b1a12');
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
  // Hinter dem Koshi-Gitter: ein warmes Zimmer, das man nur in Streifen sieht.
  at(T.koshiLit, () => {
    const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, '#ffd89a'); gr.addColorStop(0.55, '#c98a4a'); gr.addColorStop(1, '#3a2416');
    g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
    g.fillStyle = 'rgba(40,24,14,0.5)'; g.fillRect(30, 70, 70, 58); g.fillRect(170, 40, 16, 88);
    g.fillStyle = 'rgba(255,240,200,0.5)'; g.beginPath(); g.arc(210, 30, 16, 0, Math.PI * 2); g.fill();
  });
  const room = (i: number, tint: string, extra: () => void): void => at(i, () => {
    g.fillStyle = tint; g.fillRect(0, 0, TW, TH); g.fillStyle = 'rgba(255,245,220,0.5)'; g.fillRect(0, 0, TW, TH); extra();
    g.strokeStyle = '#3a2716'; g.lineWidth = 3; for (let x = 0; x <= TW; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, TH); g.stroke(); } for (let y = 0; y <= TH; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(TW, y); g.stroke(); }
  });
  room(T.room1, '#ffc27a', () => { g.fillStyle = 'rgba(60,40,30,0.35)'; g.beginPath(); g.ellipse(90, 90, 26, 40, 0, 0, Math.PI * 2); g.fill(); });
  room(T.room2, '#ffcf90', () => { g.fillStyle = 'rgba(40,30,20,0.3)'; g.fillRect(30, 70, 60, 58); g.fillRect(150, 30, 12, 98); });
  room(T.room3, '#f7b860', () => { g.fillStyle = 'rgba(60,40,30,0.25)'; g.fillRect(100, 40, 20, 88); g.beginPath(); g.arc(200, 40, 18, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,230,0.6)'; g.fill(); });
  const interior = (i: number, wall: string, draw: () => void): void => at(i, () => {
    const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, '#ffe2b0'); gr.addColorStop(0.25, wall); gr.addColorStop(1, '#1d140e'); g.fillStyle = gr; g.fillRect(0, 0, TW, TH); draw();
  });
  interior(T.inIrori, '#6b4a30', () => {
    g.fillStyle = '#1a120c'; for (const y of [8, 30]) g.fillRect(0, y, TW, 8);
    g.fillStyle = '#3a2a1c'; g.fillRect(0, 96, TW, 32); g.fillStyle = '#5a4432'; g.fillRect(70, 88, 116, 22); g.fillStyle = '#2a2018'; g.fillRect(80, 92, 96, 14);
    const fire = g.createRadialGradient(128, 98, 2, 128, 98, 40); fire.addColorStop(0, 'rgba(255,190,90,1)'); fire.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = fire; g.fillRect(80, 60, 96, 50);
    g.fillStyle = '#111'; g.fillRect(126, 16, 4, 58); g.beginPath(); g.ellipse(128, 80, 16, 11, 0, 0, Math.PI * 2); g.fill();
  });
  interior(T.inShop, '#d8c8a8', () => {
    for (let s = 0; s < 3; s++) { g.fillStyle = '#6e5238'; g.fillRect(8, 38 + s * 28, 240, 4); for (let j = 0; j < 16; j++) { g.fillStyle = ['#7a4a2a', '#e8dcc0', '#b33a2a', '#4a6a8a', '#d9a441', '#3a5a3a'][(j * 5 + s) % 6]!; g.fillRect(12 + j * 15, 20 + s * 28, 11, 17); } }
  });
  interior(T.inSoba, '#c89a62', () => {
    g.fillStyle = '#5a3a22'; g.fillRect(0, 84, TW, 44); g.fillStyle = '#d8b27a'; g.fillRect(0, 80, TW, 6);
    for (let j = 0; j < 4; j++) { g.fillStyle = '#2a1e16'; g.fillRect(22 + j * 60, 92, 30, 20); g.fillStyle = '#f2ead6'; g.beginPath(); g.ellipse(37 + j * 60, 90, 12, 5, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f3e3c0'; for (let j = 0; j < 6; j++) g.fillRect(10 + j * 42, 20, 30, 40);
  });
  interior(T.inSake, '#9a6a3a', () => {
    for (let j = 0; j < 5; j++) { g.fillStyle = '#5a3a20'; g.beginPath(); g.ellipse(30 + j * 50, 96, 22, 30, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#e8e0cc'; g.fillRect(18 + j * 50, 86, 24, 16); }
    for (let j = 0; j < 14; j++) { g.fillStyle = ['#2a5a3a', '#6a2a1a', '#1a2a4a', '#8a6a2a'][j % 4]!; g.fillRect(14 + j * 17, 24, 10, 34); g.fillRect(17 + j * 17, 16, 4, 10); }
  });
  interior(T.inGohei, '#b0703a', () => {
    g.fillStyle = '#2a1a10'; g.fillRect(40, 70, 176, 30);
    const fire = g.createLinearGradient(0, 70, 0, 100); fire.addColorStop(0, 'rgba(255,150,60,0.9)'); fire.addColorStop(1, 'rgba(120,30,10,0.4)'); g.fillStyle = fire; g.fillRect(46, 76, 164, 18);
    for (let j = 0; j < 9; j++) { g.fillStyle = '#6a4a2a'; g.fillRect(52 + j * 18, 40, 3, 40); g.fillStyle = '#c98b4a'; g.beginPath(); g.ellipse(53 + j * 18, 52, 7, 13, 0, 0, Math.PI * 2); g.fill(); }
  });
  interior(T.inCrafts, '#c7a57a', () => {
    for (let s = 0; s < 2; s++) { g.fillStyle = '#6a4a2e'; g.fillRect(8, 56 + s * 34, 240, 5); for (let j = 0; j < 11; j++) { g.fillStyle = s ? '#b3261e' : '#2a1a14'; g.beginPath(); g.ellipse(22 + j * 21, 48 + s * 34, 8, 6, 0, 0, Math.PI); g.fill(); } }
    for (let j = 0; j < 20; j++) { g.fillStyle = '#d8b682'; g.fillRect(12 + j * 12, 16, 8, 16); }
  });
  at(T.amado, () => { g.fillStyle = '#463526'; g.fillRect(0, 0, TW, TH); for (let x = 0; x < TW; x += 16) { g.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.2})`; g.fillRect(x, 0, 2, TH); } for (const y of [4, 62, 120]) { g.fillStyle = '#2a1f17'; g.fillRect(0, y, TW, 5); } });
  // Noren: vorn bedruckt, in drei Bahnen geteilt (die Schlitze liefert die Geometrie).
  const noren = (i: number, bg: string, draw: () => void): void => at(i, () => { g.fillStyle = bg; g.fillRect(0, 0, TW, TH); g.fillStyle = 'rgba(255,255,255,0.05)'; for (let x = 0; x < TW; x += 3) g.fillRect(x, 0, 1, TH); draw(); });
  noren(T.noren1, '#23324d', () => { g.strokeStyle = '#efeae0'; g.lineWidth = 7; g.beginPath(); g.arc(128, 60, 34, 0, Math.PI * 2); g.stroke(); text('松', 128, 76, `600 44px ${MINCHO}`, '#efeae0'); });
  noren(T.noren2, '#5a2a1e', () => { text('御宿', 128, 84, `600 64px ${MINCHO}`, '#f2e8d8'); });
  noren(T.noren3, '#e9e3d4', () => { text('そば', 128, 86, `600 68px ${MINCHO}`, '#1f2a44'); });
  at(T.plates, () => {
    const names = ['島崎', '藤原', '北村', '奥田', '林', '大脇', '松原', '宮川'];
    names.forEach((n, i) => { const x = (i % 4) * 64, y = Math.floor(i / 4) * 64; g.fillStyle = i % 2 ? '#e8dcc0' : '#4a3424'; g.fillRect(x + 4, y + 4, 56, 56); text(n, x + 32, y + 42, `600 22px ${MINCHO}`, i % 2 ? '#2a2019' : '#f4e7c8', 'center', 52); });
  });
  at(T.manhole, () => {
    g.fillStyle = '#4a4c4d'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#5d6061'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a3c3d'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    // Bergkette und ein Packpferd — der Nakasendō war ein Saumpfad.
    g.fillStyle = '#7b8182'; g.beginPath(); g.moveTo(18, 70); g.lineTo(44, 34); g.lineTo(60, 52); g.lineTo(78, 26); g.lineTo(110, 70); g.fill();
    g.fillStyle = '#6a6f70'; g.fillRect(40, 80, 44, 14); g.fillRect(40, 94, 5, 14); g.fillRect(78, 94, 5, 14); g.fillRect(80, 70, 10, 14);
    text('きそじゅく', 64, 120, `bold 10px ${GOTHIC}`, '#8a8f90');
  });
  // Sudare / Yoshizu: Schilfmatte mit Lücken (Alpha), damit man die Wand dahinter ahnt.
  at(T.sudare, () => {
    g.clearRect(0, 0, TW, TH);
    for (let x = 0; x < TW; x += 3) { const v = 150 + rnd() * 50; g.fillStyle = `rgb(${v + 40},${v + 18},${v - 40})`; if (rnd() < 0.86) g.fillRect(x, 0, 2, TH); }
    g.fillStyle = '#5a4630'; for (const y of [10, 64, 118]) g.fillRect(0, y, TW, 3);
  });
  at(T.poster, () => {
    const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, '#f2e5c8'); gr.addColorStop(1, '#d9824a'); g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
    g.fillStyle = '#b3261e'; for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(150 + rnd() * 100, 10 + rnd() * 70, 5 + rnd() * 8, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#3a2a1c'; g.beginPath(); g.moveTo(120, 128); g.lineTo(180, 60); g.lineTo(256, 128); g.fill();
    vertical('木曽路の秋', 30, 24, 18, '#2a1a10'); text('KISO AUTUMN WALK', 86, 110, `bold 13px ${GOTHIC}`, '#2a1a10');
  });
  at(T.vendWood, () => {
    plank('#4a3626'); g.fillStyle = '#f5f8fb'; g.fillRect(22, 10, 212, 62);
    for (let row = 0; row < 2; row++) for (let j = 0; j < 8; j++) { g.fillStyle = ['#8a4a2a', '#3a6a3a', '#d9a441', '#2a3a6a', '#e8e0c8'][(j + row * 3) % 5]!; g.fillRect(30 + j * 25, 14 + row * 29, 12, 20); g.fillStyle = '#333'; g.fillRect(28 + j * 25, 35 + row * 29, 16, 3); }
    g.fillStyle = '#181818'; g.fillRect(60, 88, 136, 24); text('お茶  TEA', 128, 106, `bold 13px ${GOTHIC}`, '#7fd48a');
  });
  at(T.menu, () => {
    plank('#5a4430'); g.fillStyle = '#23302a'; g.fillRect(14, 12, 228, 104);
    text('五平餅  400円', 128, 46, `600 26px ${MINCHO}`, '#f2eee0'); text('栗おこわ 650円', 128, 78, `600 22px ${MINCHO}`, '#f2eee0'); text('GOHEI-MOCHI · CHESTNUT RICE', 128, 104, `bold 11px ${GOTHIC}`, '#e8c07a');
  });
  at(T.white, () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, TW, TH); });
  // Maku: violetter Vorhang mit weißem Wappen über dem Honjin-Tor.
  at(T.maku, () => {
    g.fillStyle = '#4a2a5a'; g.fillRect(0, 0, TW, TH); g.fillStyle = 'rgba(255,255,255,0.06)'; for (let x = 0; x < TW; x += 4) g.fillRect(x, 0, 1, TH);
    for (const cx of [64, 192]) {
      g.strokeStyle = '#f2eee8'; g.lineWidth = 5; g.beginPath(); g.arc(cx, 64, 36, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#f2eee8'; for (let k = 0; k < 3; k++) { const a = k * 2.094 - 1.57; g.beginPath(); g.ellipse(cx + Math.cos(a) * 14, 64 + Math.sin(a) * 14, 12, 6, a, 0, Math.PI * 2); g.fill(); }
    }
  });
  // Fusuma: Kiefer und Berge auf blassem Gold — die Wand, vor der der Daimyō saß.
  const fusuma = (i: number, night: boolean): void => at(i, () => {
    const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, night ? '#cdb784' : '#e2cf9c'); gr.addColorStop(1, night ? '#a88e5c' : '#c9b07a'); g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,240,190,${rnd() * 0.18})`; g.fillRect(rnd() * TW, rnd() * TH, 10 + rnd() * 20, 6); }
    g.fillStyle = 'rgba(70,80,70,0.55)'; g.beginPath(); g.moveTo(0, 96); g.lineTo(50, 52); g.lineTo(90, 78); g.lineTo(140, 40); g.lineTo(200, 84); g.lineTo(256, 70); g.lineTo(256, 128); g.lineTo(0, 128); g.fill();
    g.strokeStyle = '#2a2a1e'; g.lineWidth = 6; g.beginPath(); g.moveTo(night ? 200 : 40, 128); g.bezierCurveTo(60, 90, 30, 60, night ? 110 : 90, 36); g.stroke();
    g.fillStyle = 'rgba(40,70,40,0.8)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse((night ? 120 : 60) + k * 14, 36 + (k % 2) * 16, 22, 7, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#1c1812'; g.fillRect(0, 0, TW, 4); g.fillRect(0, TH - 4, TW, 4); g.fillRect(0, 0, 4, TH); g.fillRect(TW - 4, 0, 4, TH);
    g.fillStyle = '#8a7a50'; g.beginPath(); g.ellipse(night ? 30 : 226, 70, 5, 9, 0, 0, Math.PI * 2); g.fill();
  });
  fusuma(T.fusuma, false); fusuma(T.fusuma2, true);
  // Tatami: eine Matte je Kachel (2:1), Binsen quer, schwarzer Rand längs.
  at(T.tatami, () => {
    g.fillStyle = '#b6a568'; g.fillRect(0, 0, TW, TH);
    for (let x = 0; x < TW; x += 3) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,250,210' : '90,80,40'},${0.12 + rnd() * 0.12})`; g.fillRect(x, 0, 2, TH); }
    g.fillStyle = '#1e2420'; g.fillRect(0, 0, TW, 9); g.fillRect(0, TH - 9, TW, 9);
  });
  at(T.scroll, () => {
    g.fillStyle = '#6a5a3a'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#efe8d6'; g.fillRect(90, 6, 76, 116);
    g.fillStyle = '#2a2420'; g.fillRect(84, 0, 88, 6); g.fillRect(84, 122, 88, 6);
    vertical('山静', 128, 40, 30, '#1c1814'); g.fillStyle = '#b3261e'; g.fillRect(142, 100, 8, 8);
    // Rechts daneben: Ikebana in einer flachen Schale — für die zweite Hälfte der Kachel.
    g.fillStyle = '#3a2a20'; g.fillRect(196, 104, 50, 10);
    g.strokeStyle = '#3a5a2a'; g.lineWidth = 3; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(220, 104); g.lineTo(200 + k * 11, 40 + (k % 2) * 20); g.stroke(); }
    g.fillStyle = '#c8402a'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(200 + k * 11, 40 + (k % 2) * 20, 5, 0, Math.PI * 2); g.fill(); }
  });
  at(T.bear, () => {
    g.fillStyle = '#f5d33a'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, TW, 8); g.fillRect(0, TH - 8, TW, 8);
    g.beginPath(); g.ellipse(62, 72, 34, 24, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(92, 52, 16, 0, Math.PI * 2); g.fill();
    for (const x of [40, 56, 72, 86]) g.fillRect(x, 88, 8, 20);
    text('クマ出没注意', 170, 60, `bold 26px ${GOTHIC}`, '#c8201c', 'center', 160); text('BEARS · RING A BELL', 170, 94, `bold 13px ${GOTHIC}`, '#1a1a1a', 'center', 160);
  });
  at(T.busStop, () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#2a6a3a'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill(); text('バス停', 64, 60, `bold 22px ${GOTHIC}`, '#ffffff'); text('木曽宿', 64, 90, `bold 20px ${GOTHIC}`, '#ffffff'); text('KISO-JUKU', 190, 60, `bold 15px ${GOTHIC}`, '#2a6a3a'); text('→ TŌGE · STILLWATER', 190, 84, `bold 10px ${GOTHIC}`, '#333'); });
  at(T.info, () => {
    g.fillStyle = '#2a3a34'; g.fillRect(0, 0, TW, TH); g.strokeStyle = '#c9b48a'; g.lineWidth = 3; g.strokeRect(6, 6, TW - 12, TH - 12);
    text('木曽宿', 64, 48, `600 32px ${MINCHO}`, '#f3e6c8'); text('KISO-JUKU', 64, 72, `bold 13px ${GOTHIC}`, '#d8c49c');
    g.fillStyle = 'rgba(243,230,200,0.7)'; for (let l = 0; l < 7; l++) g.fillRect(130, 22 + l * 13, 110 - (l % 3) * 14, 4);
    text('POST TOWN ON THE NAKASENDO · 1602', 128, 112, `bold 10px ${GOTHIC}`, '#f3e6c8');
  });
  // Senkrechte Hängeschilder (Kake-kanban), wie „妻籠宿 松代屋“ im Referenzbild.
  at(T.hanging1, () => { plank('#2c221a'); g.save(); g.translate(128, 64); g.rotate(-Math.PI / 2); text('御宿 松葉屋', 0, 12, `600 34px ${MINCHO}`, '#efe2c2', 'center', 120); g.restore(); vertical('中山道', 40, 22, 22, '#d8c49c'); vertical('木曽路', 216, 22, 22, '#d8c49c'); });
  at(T.hanging2, () => { plank('#e6dcc4'); vertical('そば', 64, 36, 40, '#1a1410'); vertical('酒', 192, 50, 50, '#1a1410'); });
  at(T.crest, () => {
    g.fillStyle = '#ebe6da'; g.fillRect(0, 0, TW, TH);
    const crest = (cx: number, kind: number): void => {
      g.strokeStyle = '#1e1c1a'; g.fillStyle = '#1e1c1a'; g.lineWidth = 6; g.beginPath(); g.arc(cx, 64, 46, 0, Math.PI * 2); g.stroke();
      if (kind === 0) { for (let j = 0; j < 4; j++) { const a = j * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.ellipse(cx + Math.cos(a) * 16, 64 + Math.sin(a) * 16, 14, 8, a, 0, Math.PI * 2); g.fill(); } }
      else { g.beginPath(); g.moveTo(cx, 30); g.lineTo(cx + 30, 82); g.lineTo(cx - 30, 82); g.closePath(); g.fill(); g.fillStyle = '#ebe6da'; g.beginPath(); g.moveTo(cx, 50); g.lineTo(cx + 16, 76); g.lineTo(cx - 16, 76); g.closePath(); g.fill(); }
    };
    crest(64, 0); crest(192, 1);
  });
  at(T.shrine, () => { plank('#3a2a1e'); vertical('山神社', 128, 24, 32, '#f1e3c2'); });
  at(T.ema, () => {
    g.fillStyle = '#6a4a30'; g.fillRect(0, 0, TW, TH);
    for (let i = 0; i < 18; i++) { const x = 6 + (i % 9) * 28, y = 8 + Math.floor(i / 9) * 60; g.fillStyle = '#d8b882'; g.beginPath(); g.moveTo(x, y + 12); g.lineTo(x + 12, y); g.lineTo(x + 24, y + 12); g.lineTo(x + 24, y + 48); g.lineTo(x, y + 48); g.fill(); g.fillStyle = '#2a1a10'; g.fillRect(x + 6, y + 20, 12, 3); g.fillRect(x + 6, y + 28, 10, 3); g.fillStyle = '#b3261e'; g.fillRect(x + 8, y + 38, 8, 6); }
  });
  at(T.postbox, () => { g.fillStyle = '#c8201c'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#1a1a1a'; g.fillRect(40, 30, 176, 10); text('〒 POST', 128, 90, `bold 36px ${GOTHIC}`, '#ffffff'); });
  at(T.bellInfo, () => { plank('#3a2c20'); text('鐘楼', 128, 62, `600 44px ${MINCHO}`, '#f1e3c2'); text('BELL TOWER · RUNG AT DUSK', 128, 100, `bold 13px ${GOTHIC}`, '#e0c9a0'); });
  at(T.wheelInfo, () => { plank('#2f3a34'); text('水車', 128, 62, `600 46px ${MINCHO}`, '#f1e3c2'); text('WATERWHEEL · HUSKS BUCKWHEAT', 128, 100, `bold 12px ${GOTHIC}`, '#e0d8c0'); });
  // Wegweiser des Nakasendō: zwei Pfeilbretter übereinander (obere / untere Kachelhälfte).
  at(T.woodGrain, () => {
    for (const [y, left, jp, en] of [[0, true, '木曽宿 300m', 'KISO-JUKU'], [64, false, '峠 2.1km', 'TŌGE PASS']] as const) {
      g.save(); g.translate(0, y); g.fillStyle = '#6b5236'; g.beginPath();
      if (left) { g.moveTo(4, 32); g.lineTo(34, 4); g.lineTo(252, 4); g.lineTo(252, 60); g.lineTo(34, 60); }
      else { g.moveTo(252, 32); g.lineTo(222, 4); g.lineTo(4, 4); g.lineTo(4, 60); g.lineTo(222, 60); }
      g.closePath(); g.fill(); g.strokeStyle = '#3a2a1a'; g.lineWidth = 3; g.stroke();
      text((left ? '← ' : '') + jp + (left ? '' : ' →'), 128, 32, `600 22px ${MINCHO}`, '#f4ead2');
      text(en, 128, 52, `bold 11px ${GOTHIC}`, '#e6d6b0');
      g.restore();
    }
  });
  at(T.meter, () => { g.fillStyle = '#d8d8d2'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#2a2a2a'; g.fillRect(40, 20, 176, 50); g.fillStyle = '#bcd8c0'; g.fillRect(50, 28, 156, 34); });
  // Andon: Papierlampe mit Rahmen; die Standlampen am Straßenrand.
  at(T.andon, () => {
    const gr = g.createRadialGradient(128, 64, 10, 128, 64, 140); gr.addColorStop(0, '#fff3d2'); gr.addColorStop(1, '#f0c27a'); g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
    g.fillStyle = '#2a1e16'; g.fillRect(0, 0, TW, 8); g.fillRect(0, TH - 8, TW, 8); g.fillRect(124, 0, 8, TH);
    vertical('木曽', 64, 44, 30, 'rgba(40,24,14,0.85)'); vertical('宿場', 192, 44, 30, 'rgba(40,24,14,0.85)');
  });
  at(T.sugidama, () => {
    g.fillStyle = '#5a6a38'; g.fillRect(0, 0, TW, TH);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '140,150,80' : '40,50,20'},${0.3 + rnd() * 0.4})`; g.fillRect(rnd() * TW, rnd() * TH, 3, 1 + rnd() * 3); }
  });
  at(T.gutter, () => { g.fillStyle = '#6c6a64'; g.fillRect(0, 0, TW, TH); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.15})`; g.fillRect(rnd() * TW, rnd() * TH, 3, 3); } });
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8;
  return texture;
}

/**
 * Straßenbelag des Dorfes: Waschbeton mit Kies (wie Narai und Tsumago), in der
 * Mitte ein Band aus Granitplatten (wie Magome). Kachelt längs alle 6 m.
 * Liegt als eigenes Band 1,5 cm über dem Asphalt — die Fahrphysik sieht ihn nicht.
 */
export function buildPavingTexture(): CanvasTexture {
  const N = 512, canvas = document.createElement('canvas'); canvas.width = N; canvas.height = N * 2;
  const g = canvas.getContext('2d')!;
  let seed = 0x9a7e;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  g.fillStyle = '#8b8477'; g.fillRect(0, 0, N, N * 2);
  // Kies: tausende kleine Körner, hell und dunkel, dichter an den Rändern.
  for (let i = 0; i < 26000; i++) {
    const x = rnd() * N, y = rnd() * N * 2, v = 90 + rnd() * 110, r = 0.8 + rnd() * 2.2;
    g.fillStyle = `rgba(${v + 12},${v + 6},${v - 6},${0.35 + rnd() * 0.5})`; g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2); g.fill();
  }
  // Flecken, Reifenspuren, Nässe — sonst liest sich der Kies wie eine Tapete.
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(40,34,28,${0.03 + rnd() * 0.06})`; g.beginPath(); g.ellipse(rnd() * N, rnd() * N * 2, 20 + rnd() * 70, 10 + rnd() * 40, rnd() * 3, 0, Math.PI * 2); g.fill(); }
  for (const x of [0.3, 0.7]) { const gr = g.createLinearGradient(N * x - 30, 0, N * x + 30, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(30,26,22,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(N * x - 30, 0, 60, N * 2); }
  // Granitband in der Mitte: Platten im Verband, jede etwas anders getönt.
  const x0 = N * 0.39, x1 = N * 0.61;
  let y = 0;
  while (y < N * 2) {
    const h = 34 + rnd() * 40; let x = x0;
    while (x < x1 - 4) {
      const w = Math.min(x1 - x, 30 + rnd() * 50), v = 150 + rnd() * 40;
      g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '40,40,40'},${rnd() * 0.18})`; g.fillRect(x + rnd() * w, y + rnd() * h, 2, 2); }
      x += w;
    }
    y += h;
  }
  g.fillStyle = 'rgba(40,36,30,0.55)'; g.fillRect(x0 - 3, 0, 3, N * 2); g.fillRect(x1, 0, 3, N * 2);
  // Querfugen alle 3 m (halbe Kachel) im Waschbeton.
  g.fillStyle = 'rgba(30,26,22,0.4)'; for (const yy of [0, N]) { g.fillRect(0, yy, x0, 3); g.fillRect(x1, yy, N - x1, 3); }
  const t = new CanvasTexture(canvas); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
  return t;
}
