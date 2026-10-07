import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Tile } from '../wago/wagoKit';

/**
 * Eine 1024²-Seite für das ganze Dorf: Ladenschilder, Plakate, Tafeln,
 * Innenräume hinter Glas, Automatenfronten, Gullydeckel. Vorbild ist
 * `CityGraphicAtlas` (Tokio) — ein Atlas, zwei Materialien, kein Draw-Call je Schild.
 *
 * Raster 4 × 8 Kacheln zu 256 × 128 px. Alle Namen sind erfunden.
 */
const W = 1024, H = 1024, TW = 256, TH = 128;

export const T = {
  fishShop: 0, izakaya: 1, grocery: 2, inn: 3, tackle: 4, boatTours: 5, coop: 6, market: 7,
  festival: 8, tide: 9, notice: 10, fishChart: 11, vendRed: 12, vendBlue: 13, inFish: 14, inIzakaya: 15,
  inGrocery: 16, inGarage: 17, room1: 18, room2: 19, manhole: 20, noSwim: 21, plates: 22, kanban: 23,
  boatName: 24, crateStamp: 25, busStop: 26, mapBoard: 27, stop: 28, inTackle: 29, room3: 30, inInn: 31,
} as const;

/** UV-Rechteck einer Kachel; optional ein Ausschnitt in Pixeln innerhalb der Kachel. */
export function tile(i: number, px0 = 0, py0 = 0, px1 = TW, py1 = TH): Tile {
  const x = (i % 4) * TW, y = Math.floor(i / 4) * TH;
  return [(x + px0) / W, 1 - (y + py1) / H, (x + px1) / W, 1 - (y + py0) / H];
}

const MINCHO = '"Yu Mincho", "Hiragino Mincho ProN", "MS Mincho", serif';
const GOTHIC = '"Yu Gothic", "Hiragino Sans", "Meiryo", sans-serif';

export function buildFunauraAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  const at = (i: number, draw: () => void): void => { g.save(); g.translate((i % 4) * TW, Math.floor(i / 4) * TH); g.beginPath(); g.rect(0, 0, TW, TH); g.clip(); draw(); g.restore(); };
  const board = (bg: string, rim: string): void => { g.fillStyle = rim; g.fillRect(0, 0, TW, TH); g.fillStyle = bg; g.fillRect(6, 6, TW - 12, TH - 12); };
  const text = (s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center', max = 230): void => {
    g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y, max);
  };
  const wood = (base: string): void => {
    g.fillStyle = base; g.fillRect(0, 0, TW, TH);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(0,0,0,${0.05 + (i % 5) * 0.02})`; g.beginPath(); g.moveTo(0, i * 3.3); g.bezierCurveTo(80, i * 3.3 + 3, 170, i * 3.3 - 3, 256, i * 3.3 + 1); g.stroke(); }
  };
  // ── Ladenschilder ──
  at(T.fishShop, () => { wood('#6b4a30'); text('浜口鮮魚店', 128, 70, `600 46px ${MINCHO}`, '#f4e7c8'); text('HAMAGUCHI · FRESH FISH', 128, 104, `bold 15px ${GOTHIC}`, '#e8c683'); });
  at(T.izakaya, () => { board('#7a1d17', '#2a1a14'); text('居酒屋', 70, 58, `600 34px ${MINCHO}`, '#f6e6c5'); text('うみねこ', 170, 58, `600 34px ${MINCHO}`, '#f6e6c5'); text('UMINEKO · GRILL & SAKE', 128, 100, `bold 15px ${GOTHIC}`, '#f1c27a'); });
  at(T.grocery, () => { board('#2e6b4f', '#e9e4d5'); text('浜屋', 70, 78, `bold 52px ${GOTHIC}`, '#ffffff'); text('HAMAYA', 180, 60, `bold 26px ${GOTHIC}`, '#ffe28a'); text('食料品・日用品', 180, 92, `16px ${GOTHIC}`, '#ffffff'); });
  at(T.inn, () => { wood('#5a4231'); g.fillStyle = '#f2ead6'; g.fillRect(20, 16, 216, 96); text('民宿 しおかぜ', 128, 66, `600 36px ${MINCHO}`, '#2a2019'); text('MINSHUKU SHIOKAZE · ROOMS', 128, 98, `bold 14px ${GOTHIC}`, '#7a3a2a'); });
  at(T.tackle, () => { board('#f0c93a', '#2a2a2a'); text('釣具', 64, 80, `bold 50px ${GOTHIC}`, '#1c3b68'); text('えさ・氷', 180, 58, `bold 24px ${GOTHIC}`, '#b0271f'); text('TACKLE · BAIT · ICE', 180, 92, `bold 14px ${GOTHIC}`, '#1c3b68'); });
  at(T.boatTours, () => { board('#1f4a74', '#f2f2ee'); text('遊覧船', 90, 70, `bold 40px ${GOTHIC}`, '#ffffff'); text('HARBOUR BOAT · 20 min', 128, 104, `bold 15px ${GOTHIC}`, '#b8e0ff'); g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(190, 70); g.lineTo(236, 70); g.lineTo(226, 84); g.lineTo(196, 84); g.fill(); });
  at(T.coop, () => { board('#f4f4f0', '#1d5da8'); g.fillStyle = '#1d5da8'; g.beginPath(); g.arc(52, 64, 34, 0, Math.PI * 2); g.fill(); text('JF', 52, 78, `bold 34px ${GOTHIC}`, '#ffffff'); text('舟浦漁業協同組合', 158, 60, `bold 20px ${GOTHIC}`, '#1d3050', 'center', 150); text('FUNAURA FISHERIES', 158, 92, `bold 13px ${GOTHIC}`, '#1d5da8', 'center', 150); });
  at(T.market, () => { board('#f6f3ea', '#9b2a22'); text('舟浦魚市場', 128, 72, `bold 44px ${GOTHIC}`, '#9b2a22'); text('FUNAURA FISH MARKET · AUCTION 5:00', 128, 104, `bold 13px ${GOTHIC}`, '#333333'); });
  // ── Plakate und Tafeln ──
  at(T.festival, () => {
    const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, '#1b2c55'); gr.addColorStop(1, '#6b2346'); g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
    for (let i = 0; i < 9; i++) { g.fillStyle = ['#ffd36b', '#ff7b5c', '#9ee6ff'][i % 3]!; g.beginPath(); g.arc(30 + i * 25, 30 + (i % 3) * 12, 6 + (i % 2) * 4, 0, Math.PI * 2); g.fill(); }
    text('港まつり', 128, 84, `bold 38px ${MINCHO}`, '#fff3d6'); text('HARBOUR FESTIVAL · 8/15 · FIREWORKS', 128, 112, `bold 12px ${GOTHIC}`, '#ffd36b');
  });
  at(T.tide, () => {
    board('#243a3a', '#bda77a'); text('潮見表  TIDE TABLE', 128, 28, `bold 16px ${GOTHIC}`, '#f0e2c0');
    const rows = [['満潮 HIGH', '05:42', '18:07'], ['干潮 LOW', '11:58', '23:41'], ['日の出', '05:21', ''], ['日の入', '18:44', '']];
    rows.forEach((r, i) => { text(r[0]!, 20, 54 + i * 18, `13px ${GOTHIC}`, '#d8e8e0', 'left'); text(r[1]!, 150, 54 + i * 18, `bold 13px ${GOTHIC}`, '#ffffff'); text(r[2]!, 210, 54 + i * 18, `bold 13px ${GOTHIC}`, '#ffffff'); });
  });
  at(T.notice, () => {
    wood('#4a3a2c'); g.fillStyle = '#2f3e33'; g.fillRect(12, 12, 232, 104);
    const papers = [['#f5f1e6', 22, 20, 60, 44], ['#ffe9a8', 92, 24, 50, 36], ['#e8f0ff', 152, 18, 76, 50], ['#f7d6d0', 30, 70, 70, 38], ['#f5f1e6', 118, 66, 58, 42], ['#d9f2d9', 186, 72, 46, 36]] as const;
    for (const [c, x, y, w, h] of papers) { g.fillStyle = c; g.fillRect(x, y, w, h); g.fillStyle = '#555'; for (let l = 0; l < 4; l++) g.fillRect(x + 6, y + 8 + l * 8, w - 12 - (l % 2) * 10, 2); g.fillStyle = '#c33'; g.fillRect(x + w / 2 - 2, y + 2, 4, 4); }
    text('お知らせ', 128, 124, `bold 10px ${GOTHIC}`, '#e8dcc0');
  });
  at(T.fishChart, () => {
    g.fillStyle = '#eef3f4'; g.fillRect(0, 0, TW, TH); text('舟浦の魚  FISH OF FUNAURA', 128, 20, `bold 13px ${GOTHIC}`, '#1d3a5a');
    const fish = ['#c8543d', '#6d8fa8', '#d9b24a', '#5a7a5e', '#b9c6cc', '#9a6aa0'];
    fish.forEach((c, i) => { const x = 40 + (i % 3) * 80, y = 50 + Math.floor(i / 3) * 45; g.fillStyle = c; g.beginPath(); g.ellipse(x, y, 26, 10, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(x + 22, y); g.lineTo(x + 36, y - 10); g.lineTo(x + 36, y + 10); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(x - 16, y - 2, 2, 0, Math.PI * 2); g.fill(); text(['タイ', 'アジ', 'ブリ', 'メバル', 'イカ', 'サザエ'][i]!, x, y + 24, `bold 11px ${GOTHIC}`, '#333'); });
  });
  // ── Automaten (selbstleuchtend) ──
  const vending = (i: number, body: string): void => at(i, () => {
    g.fillStyle = body; g.fillRect(0, 0, TW, TH); g.fillStyle = '#f7fbff'; g.fillRect(10, 8, 236, 70);
    for (let row = 0; row < 3; row++) for (let j = 0; j < 9; j++) { g.fillStyle = ['#d84a3a', '#3a7ad8', '#f0c040', '#3aa06a', '#e8e8e8', '#8a4ad8'][(j + row * 2 + i) % 6]!; g.fillRect(18 + j * 25, 12 + row * 22, 12, 16); g.fillStyle = '#222'; g.fillRect(16 + j * 25, 29 + row * 22, 16, 3); }
    g.fillStyle = '#1b1b1b'; g.fillRect(30, 90, 196, 26); text('つめた〜い  COLD', 128, 108, `bold 14px ${GOTHIC}`, '#6ad0ff');
  });
  vending(T.vendRed, '#c93a31'); vending(T.vendBlue, '#2d62b3');
  // ── Innenräume (selbstleuchtend) ──
  const interior = (i: number, wall: string, draw: () => void): void => at(i, () => {
    const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, '#fff0cf'); gr.addColorStop(0.18, wall); gr.addColorStop(1, '#2a2019'); g.fillStyle = gr; g.fillRect(0, 0, TW, TH); draw();
  });
  interior(T.inFish, '#9fb3b8', () => { g.fillStyle = '#e9eef0'; g.fillRect(10, 70, 236, 20); for (let j = 0; j < 10; j++) { g.fillStyle = ['#c8543d', '#8aa4b8', '#d9b24a'][j % 3]!; g.beginPath(); g.ellipse(24 + j * 22, 74, 9, 4, 0.2, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#35414a'; g.fillRect(10, 90, 236, 30); g.fillStyle = '#f7f3ea'; g.fillRect(90, 18, 76, 30); text('本日', 128, 40, `bold 16px ${GOTHIC}`, '#b02a20'); });
  interior(T.inIzakaya, '#b8834e', () => { g.fillStyle = '#6a4228'; g.fillRect(0, 82, TW, 46); g.fillStyle = '#d7b27a'; g.fillRect(0, 78, TW, 6); for (let j = 0; j < 5; j++) { g.fillStyle = '#3b2a1e'; g.fillRect(20 + j * 48, 94, 16, 34); g.fillStyle = '#f3e3c0'; g.fillRect(12 + j * 50, 20, 34, 18); g.fillStyle = '#5a3a24'; g.fillRect(16 + j * 50, 24, 26, 2); g.fillRect(16 + j * 50, 30, 20, 2); } g.fillStyle = '#e8a040'; g.beginPath(); g.arc(200, 60, 10, 0, Math.PI * 2); g.fill(); });
  interior(T.inGrocery, '#e8e2d0', () => { for (let s = 0; s < 3; s++) { g.fillStyle = '#9a8e78'; g.fillRect(8, 36 + s * 30, 240, 4); for (let j = 0; j < 20; j++) { g.fillStyle = ['#d84a3a', '#3a7ad8', '#f0c040', '#3aa06a', '#e8e8e8', '#e87ab0'][(j * 7 + s) % 6]!; g.fillRect(10 + j * 12, 18 + s * 30, 9, 17); } } });
  at(T.inGarage, () => { g.fillStyle = '#231e1a'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#3e5c50'; g.fillRect(20, 10, 60, 90); g.fillStyle = '#e0612d'; for (let j = 0; j < 5; j++) { g.beginPath(); g.arc(110 + j * 20, 40, 8, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#5a4a3a'; g.fillRect(100, 70, 140, 8); g.fillStyle = '#8a8a8a'; for (let j = 0; j < 6; j++) g.fillRect(110 + j * 20, 20 + (j % 2) * 4, 3, 40); g.fillStyle = '#2f6fb0'; g.fillRect(170, 90, 60, 30); g.fillStyle = 'rgba(255,220,160,0.35)'; g.beginPath(); g.arc(128, 0, 70, 0, Math.PI); g.fill(); });
  const room = (i: number, tint: string, extra: () => void): void => at(i, () => {
    g.fillStyle = tint; g.fillRect(0, 0, TW, TH);
    // Shōji: Papier mit Holzgitter, von innen beleuchtet.
    g.fillStyle = 'rgba(255,245,220,0.55)'; g.fillRect(0, 0, TW, TH);
    extra();
    g.strokeStyle = '#4a3522'; g.lineWidth = 3; for (let x = 0; x <= TW; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, TH); g.stroke(); } for (let y = 0; y <= TH; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(TW, y); g.stroke(); }
  });
  room(T.room1, '#ffcf8a', () => { g.fillStyle = 'rgba(60,40,30,0.35)'; g.beginPath(); g.ellipse(90, 90, 26, 40, 0, 0, Math.PI * 2); g.fill(); });
  room(T.room2, '#ffd9a0', () => { g.fillStyle = 'rgba(80,140,200,0.5)'; g.fillRect(160, 60, 50, 34); g.fillStyle = 'rgba(40,30,20,0.3)'; g.fillRect(30, 70, 60, 58); });
  room(T.room3, '#f7c070', () => { g.fillStyle = 'rgba(60,40,30,0.25)'; g.fillRect(100, 40, 20, 88); g.beginPath(); g.arc(200, 40, 18, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,230,0.6)'; g.fill(); });
  interior(T.inTackle, '#c9d6c8', () => { for (let j = 0; j < 14; j++) { g.strokeStyle = '#333'; g.lineWidth = 2; g.beginPath(); g.moveTo(14 + j * 17, 120); g.lineTo(24 + j * 17, 20); g.stroke(); } for (let j = 0; j < 12; j++) { g.fillStyle = ['#e0612d', '#f0c93a', '#3a7ad8', '#3aa06a'][j % 4]!; g.fillRect(20 + j * 19, 90, 14, 14); } });
  interior(T.inInn, '#e9c28a', () => { g.fillStyle = '#6a4a30'; g.fillRect(30, 80, 196, 8); g.fillStyle = '#c8a070'; g.fillRect(40, 88, 176, 40); g.fillStyle = '#3d6b5a'; g.fillRect(100, 24, 56, 40); g.fillStyle = '#f5f0e0'; g.fillRect(106, 30, 44, 28); text('いらっしゃいませ', 128, 116, `bold 12px ${GOTHIC}`, '#3a2a1a'); });
  // ── Boden, Warnungen, Kleinschilder ──
  at(T.manhole, () => {
    g.fillStyle = '#4a4c4d'; g.fillRect(0, 0, TW, TH);
    g.fillStyle = '#5d6061'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a3c3d'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    // Fischmotiv — jede japanische Gemeinde hat ihren eigenen Deckel.
    g.fillStyle = '#7b8182'; g.beginPath(); g.ellipse(58, 64, 30, 14, -0.3, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(84, 54); g.lineTo(104, 40); g.lineTo(100, 70); g.fill();
    for (let j = 0; j < 5; j++) { g.strokeStyle = '#6a6f70'; g.beginPath(); g.arc(64, 64, 14 + j * 8, 3.5, 4.4); g.stroke(); }
    text('ふなうら', 64, 112, `bold 12px ${GOTHIC}`, '#8a8f90');
  });
  at(T.noSwim, () => { board('#ffffff', '#c8201c'); g.strokeStyle = '#c8201c'; g.lineWidth = 8; g.beginPath(); g.arc(56, 64, 36, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(30, 38); g.lineTo(82, 90); g.stroke(); text('遊泳禁止', 170, 62, `bold 30px ${GOTHIC}`, '#c8201c'); text('NO SWIMMING', 170, 92, `bold 16px ${GOTHIC}`, '#222'); });
  at(T.plates, () => {
    const names = ['浜口', '中村', '山本', '小西', '田辺', '森', '岡田', '藤井'];
    names.forEach((n, i) => { const x = (i % 4) * 64, y = Math.floor(i / 4) * 64; g.fillStyle = i % 2 ? '#e8dcc0' : '#6b4a30'; g.fillRect(x + 4, y + 4, 56, 56); text(n, x + 32, y + 42, `600 22px ${MINCHO}`, i % 2 ? '#2a2019' : '#f4e7c8', 'center', 52); });
  });
  at(T.kanban, () => { wood('#3b2a1e'); text('魚', 40, 88, `600 70px ${MINCHO}`, '#f4e7c8'); text('酒', 128, 88, `600 70px ${MINCHO}`, '#f4e7c8'); text('宿', 216, 88, `600 70px ${MINCHO}`, '#f4e7c8'); });
  at(T.boatName, () => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, TW, TH); text('第八 舟浦丸', 128, 58, `bold 38px ${MINCHO}`, '#1a2a4a'); text('第三 えびす丸', 128, 108, `bold 34px ${MINCHO}`, '#8a1a1a'); });
  at(T.crateStamp, () => { g.fillStyle = '#2f6fb0'; g.fillRect(0, 0, TW, TH); text('舟浦漁協', 128, 56, `bold 34px ${GOTHIC}`, '#ffffff'); text('JF FUNAURA', 128, 96, `bold 20px ${GOTHIC}`, '#cfe6ff'); });
  at(T.busStop, () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#1c7a3e'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill(); text('バス停', 64, 60, `bold 22px ${GOTHIC}`, '#ffffff'); text('舟浦港', 64, 88, `bold 18px ${GOTHIC}`, '#ffffff'); text('FUNAURA PORT', 190, 60, `bold 14px ${GOTHIC}`, '#1c7a3e'); text('→ STILLWATER 1.2 km', 190, 84, `bold 11px ${GOTHIC}`, '#333'); });
  at(T.mapBoard, () => {
    g.fillStyle = '#e8e2cc'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#6aa8c8'; g.fillRect(0, 84, TW, 44);
    g.fillStyle = '#9ac080'; g.beginPath(); g.moveTo(0, 84); g.lineTo(0, 10); g.lineTo(256, 20); g.lineTo(256, 84); g.fill();
    g.fillStyle = '#7a6a5a'; for (let j = 0; j < 12; j++) g.fillRect(20 + j * 16, 70, 12, 12);
    g.fillStyle = '#c8201c'; g.fillRect(186, 30, 10, 10); g.strokeStyle = '#8a7a6a'; g.lineWidth = 3; g.beginPath(); g.moveTo(100, 0); g.lineTo(96, 70); g.stroke();
    g.fillStyle = '#ddd'; g.fillRect(24, 84, 4, 36); g.fillRect(226, 84, 4, 36);
    text('舟浦 案内図', 60, 24, `bold 14px ${GOTHIC}`, '#2a2019'); text('▲ STILLWATER', 100, 12, `bold 9px ${GOTHIC}`, '#2a2019'); text('恵比寿神社', 192, 52, `bold 10px ${GOTHIC}`, '#2a2019'); text('現在地 YOU ARE HERE ●', 150, 116, `bold 10px ${GOTHIC}`, '#c8201c');
  });
  at(T.stop, () => { g.clearRect(0, 0, TW, TH); text('止まれ', 128, 96, `bold 88px ${GOTHIC}`, '#f4f2ea'); });
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
