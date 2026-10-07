import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Tile } from '../wago/wagoKit';

/**
 * Eine 1024²-Seite für den Gassho-Weiler, gleiches Raster wie Funaura
 * (4 × 8 Kacheln zu 256 × 128 px, `funauraAtlas.ts`). Alle Namen erfunden.
 *
 * Der wichtigste Eintrag ist unscheinbar: `shoji`, das unbeleuchtete
 * Papierfenster. Die weißen Fensterreihen in den Giebeln sind neben dem
 * Strohdreieck das, woran man ein Gassho-Haus erkennt — als Vertexfarbe waren
 * sie weiße Rechtecke, erst mit Sprossen und Papierflecken sind sie Fenster.
 */
const W = 1024, H = 1024, TW = 256, TH = 128;

export const T = {
  soba: 0, minshuku: 1, doburoku: 2, farmStand: 3, gasshoInfo: 4, mapBoard: 5, wheelInfo: 6, bear: 7,
  festival: 8, notice: 9, vendRed: 10, vendBlue: 11, inIrori: 12, inSoba: 13, inShop: 14, room1: 15,
  room2: 16, room3: 17, manhole: 18, plates: 19, busStop: 20, shoji: 21, stop: 22, hydrant: 23,
  kanban: 24, crest: 25, shojiWarm: 26, shrine: 27, amado: 28, noren: 29, speed: 30, white: 31,
} as const;

export function tile(i: number, px0 = 0, py0 = 0, px1 = TW, py1 = TH): Tile {
  const x = (i % 4) * TW, y = Math.floor(i / 4) * TH;
  return [(x + px0) / W, 1 - (y + py1) / H, (x + px1) / W, 1 - (y + py0) / H];
}

const MINCHO = '"Yu Mincho", "Hiragino Mincho ProN", "MS Mincho", serif';
const GOTHIC = '"Yu Gothic", "Hiragino Sans", "Meiryo", sans-serif';

export function buildGasshoAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  let seed = 0x6a55;
  const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const at = (i: number, draw: () => void): void => { g.save(); g.translate((i % 4) * TW, Math.floor(i / 4) * TH); g.beginPath(); g.rect(0, 0, TW, TH); g.clip(); draw(); g.restore(); };
  const board = (bg: string, rim: string): void => { g.fillStyle = rim; g.fillRect(0, 0, TW, TH); g.fillStyle = bg; g.fillRect(6, 6, TW - 12, TH - 12); };
  const text = (s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'center', max = 230): void => {
    g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y, max);
  };
  const wood = (base: string): void => {
    g.fillStyle = base; g.fillRect(0, 0, TW, TH);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(0,0,0,${0.05 + (i % 5) * 0.02})`; g.beginPath(); g.moveTo(0, i * 3.3); g.bezierCurveTo(80, i * 3.3 + 3, 170, i * 3.3 - 3, 256, i * 3.3 + 1); g.stroke(); }
  };
  const vertical = (s: string, x: number, y0: number, size: number, color: string): void => {
    g.font = `600 ${size}px ${MINCHO}`; g.fillStyle = color; g.textAlign = 'center';
    [...s].forEach((c, i) => g.fillText(c, x, y0 + i * size * 1.02));
  };
  // ── Schilder ──
  at(T.soba, () => { wood('#4a3322'); text('手打ちそば', 128, 64, `600 44px ${MINCHO}`, '#f3e6c6'); text('SAWADA · HAND-CUT SOBA', 128, 102, `bold 15px ${GOTHIC}`, '#e0c083'); });
  at(T.minshuku, () => { wood('#5a4231'); g.fillStyle = '#efe6d0'; g.fillRect(18, 14, 220, 100); text('民宿 かやぶき', 128, 62, `600 36px ${MINCHO}`, '#2a2019'); text('MINSHUKU KAYABUKI · IRORI DINNER', 128, 96, `bold 13px ${GOTHIC}`, '#7a3a2a'); });
  at(T.doburoku, () => { board('#2c2420', '#b3895a'); text('どぶろく', 128, 58, `600 42px ${MINCHO}`, '#f1e3c2'); text('土産・地酒  LOCAL SAKE & CRAFTS', 128, 100, `bold 14px ${GOTHIC}`, '#e8c07a'); });
  at(T.farmStand, () => {
    wood('#7a5a3a'); g.fillStyle = '#fbf6e6'; g.fillRect(14, 12, 228, 104);
    text('野菜直売', 128, 52, `bold 38px ${GOTHIC}`, '#2f6a2a'); text('100円', 70, 98, `bold 34px ${GOTHIC}`, '#c8301c'); text('FARM STAND · HONESTY BOX', 170, 96, `bold 12px ${GOTHIC}`, '#333', 'center', 130);
  });
  at(T.gasshoInfo, () => {
    board('#f2ecdc', '#5a4231'); text('合掌造り', 64, 42, `600 30px ${MINCHO}`, '#2a2019');
    text('GASSHO-ZUKURI', 64, 66, `bold 12px ${GOTHIC}`, '#6b3b22');
    // Kleines Schema: 60°-Dach mit vier Böden.
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 3; g.beginPath(); g.moveTo(140, 110); g.lineTo(190, 18); g.lineTo(240, 110); g.stroke();
    g.lineWidth = 1.5; for (const y of [92, 72, 52]) { const h = (110 - y) * 50 / 92; g.beginPath(); g.moveTo(140 + h, y); g.lineTo(240 - h, y); g.stroke(); }
    for (let i = 0; i < 5; i++) { g.fillStyle = '#555'; g.fillRect(14, 80 + i * 8, 110 - (i % 2) * 20, 2); }
  });
  at(T.mapBoard, () => {
    g.fillStyle = '#e9e3cd'; g.fillRect(0, 0, TW, TH);
    g.fillStyle = '#6aa8c8'; g.fillRect(88, 0, 22, TH);
    g.fillStyle = '#b8c98e'; for (let i = 0; i < 14; i++) g.fillRect(118 + (i % 5) * 26, 14 + Math.floor(i / 5) * 34, 22, 28);
    g.fillStyle = '#8a6a3a'; for (let i = 0; i < 9; i++) { const x = 130 + (i % 4) * 30, y = 30 + Math.floor(i / 4) * 34; g.beginPath(); g.moveTo(x, y + 10); g.lineTo(x + 7, y - 6); g.lineTo(x + 14, y + 10); g.fill(); }
    g.strokeStyle = '#9a8a70'; g.lineWidth = 4; g.beginPath(); g.moveTo(60, 0); g.bezierCurveTo(30, 60, 70, 90, 120, 128); g.stroke();
    g.beginPath(); g.moveTo(170, 0); g.lineTo(166, 128); g.stroke();
    text('静水 案内図', 44, 22, `bold 14px ${GOTHIC}`, '#2a2019'); text('三連水車', 98, 64, `bold 10px ${GOTHIC}`, '#1d3a5a');
    text('現在地 ●', 200, 118, `bold 12px ${GOTHIC}`, '#c8201c'); text('▼ FUNAURA', 44, 124, `bold 9px ${GOTHIC}`, '#2a2019');
  });
  at(T.wheelInfo, () => {
    board('#243a3a', '#bda77a'); text('三連水車', 128, 44, `600 36px ${MINCHO}`, '#f0e2c0');
    text('TRIPLE WATERWHEEL · LIFTS RIVER WATER', 128, 76, `bold 13px ${GOTHIC}`, '#d8e8e0');
    text('TO THE UPPER PADDIES SINCE 1789', 128, 98, `bold 13px ${GOTHIC}`, '#d8e8e0');
  });
  at(T.bear, () => {
    g.fillStyle = '#f5d33a'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, TW, 8); g.fillRect(0, TH - 8, TW, 8);
    g.beginPath(); g.ellipse(62, 72, 34, 24, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(92, 52, 16, 0, Math.PI * 2); g.fill();
    for (const x of [40, 56, 72, 86]) g.fillRect(x, 88, 8, 20);
    text('クマ出没注意', 170, 60, `bold 26px ${GOTHIC}`, '#c8201c', 'center', 160); text('BEARS · MAKE NOISE', 170, 94, `bold 13px ${GOTHIC}`, '#1a1a1a', 'center', 160);
  });
  // ── Plakate, Tafeln ──
  at(T.festival, () => {
    const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, '#f3e7c9'); gr.addColorStop(1, '#d9b27a'); g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
    g.fillStyle = '#b3261e'; g.beginPath(); g.arc(200, 60, 40, 0, Math.PI * 2); g.fill();
    vertical('どぶろく祭', 40, 30, 20, '#2a1a10'); text('DOBUROKU FESTIVAL', 128, 58, `bold 14px ${GOTHIC}`, '#2a1a10'); text('10/14 – 10/19 · 八幡神社', 128, 84, `bold 13px ${GOTHIC}`, '#6b1a12');
  });
  at(T.notice, () => {
    wood('#4a3a2c'); g.fillStyle = '#2f3e33'; g.fillRect(12, 12, 232, 104);
    const papers = [['#f5f1e6', 22, 20, 60, 44], ['#ffe9a8', 92, 24, 50, 36], ['#e8f0ff', 152, 18, 76, 50], ['#f7d6d0', 30, 70, 70, 38], ['#f5f1e6', 118, 66, 58, 42], ['#d9f2d9', 186, 72, 46, 36]] as const;
    for (const [c, x, y, w, h] of papers) { g.fillStyle = c; g.fillRect(x, y, w, h); g.fillStyle = '#555'; for (let l = 0; l < 4; l++) g.fillRect(x + 6, y + 8 + l * 8, w - 12 - (l % 2) * 10, 2); g.fillStyle = '#c33'; g.fillRect(x + w / 2 - 2, y + 2, 4, 4); }
  });
  const vending = (i: number, body: string): void => at(i, () => {
    g.fillStyle = body; g.fillRect(0, 0, TW, TH); g.fillStyle = '#f7fbff'; g.fillRect(10, 8, 236, 70);
    for (let row = 0; row < 3; row++) for (let j = 0; j < 9; j++) { g.fillStyle = ['#d84a3a', '#3a7ad8', '#f0c040', '#3aa06a', '#e8e8e8', '#8a4ad8'][(j + row * 2 + i) % 6]!; g.fillRect(18 + j * 25, 12 + row * 22, 12, 16); g.fillStyle = '#222'; g.fillRect(16 + j * 25, 29 + row * 22, 16, 3); }
    g.fillStyle = '#1b1b1b'; g.fillRect(30, 90, 196, 26); text('あったか〜い  HOT', 128, 108, `bold 14px ${GOTHIC}`, '#ff8a5a');
  });
  vending(T.vendRed, '#c93a31'); vending(T.vendBlue, '#2d62b3');
  // ── Innenräume (selbstleuchtend) ──
  const interior = (i: number, wall: string, draw: () => void): void => at(i, () => {
    const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, '#ffe7bf'); gr.addColorStop(0.2, wall); gr.addColorStop(1, '#1f1712'); g.fillStyle = gr; g.fillRect(0, 0, TW, TH); draw();
  });
  // Irori: Feuerstelle im Boden, Kessel am Jizaikagi, Rauch unter schwarzen Balken.
  interior(T.inIrori, '#6b4a30', () => {
    g.fillStyle = '#1c130d'; for (const y of [10, 34]) g.fillRect(0, y, TW, 8);
    g.fillStyle = '#3a2a1c'; g.fillRect(0, 96, TW, 32);
    g.fillStyle = '#5a4432'; g.fillRect(70, 88, 116, 22); g.fillStyle = '#2a2018'; g.fillRect(80, 92, 96, 14);
    const fire = g.createRadialGradient(128, 98, 2, 128, 98, 40); fire.addColorStop(0, 'rgba(255,190,90,1)'); fire.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = fire; g.fillRect(80, 60, 96, 50);
    g.fillStyle = '#111'; g.fillRect(126, 18, 4, 56); g.beginPath(); g.ellipse(128, 80, 16, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(220,210,200,0.18)'; g.beginPath(); g.ellipse(128, 30, 60, 20, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a1f18'; g.fillRect(24, 80, 26, 30); g.fillRect(206, 76, 24, 34);
  });
  interior(T.inSoba, '#c89a62', () => {
    g.fillStyle = '#5a3a22'; g.fillRect(0, 84, TW, 44); g.fillStyle = '#d8b27a'; g.fillRect(0, 80, TW, 6);
    for (let j = 0; j < 4; j++) { g.fillStyle = '#2a1e16'; g.fillRect(22 + j * 60, 92, 30, 20); g.fillStyle = '#f2ead6'; g.beginPath(); g.ellipse(37 + j * 60, 90, 12, 5, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#f3e3c0'; for (let j = 0; j < 6; j++) g.fillRect(10 + j * 42, 20, 30, 40); g.fillStyle = '#3a2618'; for (let j = 0; j < 6; j++) { g.fillRect(24 + j * 42, 26, 2, 28); g.fillRect(18 + j * 42, 26, 2, 22); }
  });
  interior(T.inShop, '#d8cdb4', () => {
    for (let s = 0; s < 3; s++) { g.fillStyle = '#8a6e4e'; g.fillRect(8, 36 + s * 30, 240, 4); for (let j = 0; j < 16; j++) { g.fillStyle = ['#7a4a2a', '#e8dcc0', '#b33a2a', '#4a6a8a', '#d9a441', '#3a5a3a'][(j * 5 + s) % 6]!; g.fillRect(12 + j * 15, 18 + s * 30, 11, 17); } }
    g.fillStyle = '#f1e6cc'; g.beginPath(); g.arc(210, 100, 14, 0, Math.PI * 2); g.fill();
  });
  const room = (i: number, tint: string, extra: () => void): void => at(i, () => {
    g.fillStyle = tint; g.fillRect(0, 0, TW, TH); g.fillStyle = 'rgba(255,245,220,0.55)'; g.fillRect(0, 0, TW, TH); extra();
    g.strokeStyle = '#3a2716'; g.lineWidth = 3; for (let x = 0; x <= TW; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, TH); g.stroke(); } for (let y = 0; y <= TH; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(TW, y); g.stroke(); }
  });
  room(T.room1, '#ffc27a', () => { g.fillStyle = 'rgba(60,40,30,0.35)'; g.beginPath(); g.ellipse(90, 90, 26, 40, 0, 0, Math.PI * 2); g.fill(); });
  room(T.room2, '#ffcf90', () => { g.fillStyle = 'rgba(40,30,20,0.3)'; g.fillRect(30, 70, 60, 58); g.fillRect(150, 30, 12, 98); });
  room(T.room3, '#f7b860', () => { g.fillStyle = 'rgba(60,40,30,0.25)'; g.fillRect(100, 40, 20, 88); g.beginPath(); g.arc(200, 40, 18, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,230,0.6)'; g.fill(); });
  // ── Boden, Kleinschilder ──
  at(T.manhole, () => {
    g.fillStyle = '#4a4c4d'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#5d6061'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a3c3d'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    // Gassho-Dach und Wasserrad — die Gemeinde zeigt, was sie hat.
    g.fillStyle = '#7b8182'; g.beginPath(); g.moveTo(30, 80); g.lineTo(64, 24); g.lineTo(98, 80); g.fill();
    g.strokeStyle = '#6a6f70'; g.lineWidth = 3; g.beginPath(); g.arc(64, 92, 12, 0, Math.PI * 2); g.stroke();
    for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; g.beginPath(); g.moveTo(64, 92); g.lineTo(64 + Math.cos(a) * 12, 92 + Math.sin(a) * 12); g.stroke(); }
    text('しずみ', 64, 118, `bold 11px ${GOTHIC}`, '#8a8f90');
  });
  at(T.plates, () => {
    const names = ['和田', '遠山', '神田', '長瀬', '尾上', '明善', '中谷', '大井'];
    names.forEach((n, i) => { const x = (i % 4) * 64, y = Math.floor(i / 4) * 64; g.fillStyle = i % 2 ? '#e8dcc0' : '#5a3e2a'; g.fillRect(x + 4, y + 4, 56, 56); text(n, x + 32, y + 42, `600 22px ${MINCHO}`, i % 2 ? '#2a2019' : '#f4e7c8', 'center', 52); });
  });
  at(T.busStop, () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, TW, TH); g.fillStyle = '#1c5a9a'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill(); text('バス停', 64, 60, `bold 22px ${GOTHIC}`, '#ffffff'); text('静水', 64, 90, `bold 20px ${GOTHIC}`, '#ffffff'); text('STILLWATER', 190, 60, `bold 15px ${GOTHIC}`, '#1c5a9a'); text('→ FUNAURA 1.2 km', 190, 84, `bold 11px ${GOTHIC}`, '#333'); });
  // Shōji bei Tag: Papier, Sprossen, ein paar geflickte Felder und Wasserflecken.
  const shoji = (i: number, paper: string): void => at(i, () => {
    g.fillStyle = paper; g.fillRect(0, 0, TW, TH);
    for (let j = 0; j < 18; j++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,250' : '190,170,130'},${0.1 + rnd() * 0.18})`; g.fillRect(Math.floor(rnd() * 8) * 32 + 2, Math.floor(rnd() * 4) * 32 + 2, 28, 28); }
    g.strokeStyle = '#3b2a1c'; g.lineWidth = 3;
    for (let x = 0; x <= TW; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, TH); g.stroke(); }
    for (let y = 0; y <= TH; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(TW, y); g.stroke(); }
    g.lineWidth = 8; g.strokeRect(0, 0, TW, TH); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, TH); g.stroke();
  });
  shoji(T.shoji, '#e6dfcb');
  shoji(T.shojiWarm, '#f2c98a');
  at(T.stop, () => { g.clearRect(0, 0, TW, TH); text('止まれ', 128, 96, `bold 88px ${GOTHIC}`, '#f4f2ea'); });
  at(T.hydrant, () => { board('#c8201c', '#8a1410'); text('消火栓', 90, 72, `bold 40px ${GOTHIC}`, '#ffffff'); text('放水銃', 200, 60, `bold 22px ${GOTHIC}`, '#ffe0a0'); text('HYDRANT', 200, 92, `bold 14px ${GOTHIC}`, '#ffffff'); });
  at(T.kanban, () => { wood('#3b2a1e'); text('蕎', 40, 88, `600 70px ${MINCHO}`, '#f4e7c8'); text('宿', 128, 88, `600 70px ${MINCHO}`, '#f4e7c8'); text('酒', 216, 88, `600 70px ${MINCHO}`, '#f4e7c8'); });
  // Kamon — das Familienwappen im Putz des Kura-Giebels.
  at(T.crest, () => {
    g.fillStyle = '#ebe6da'; g.fillRect(0, 0, TW, TH);
    const crest = (cx: number, kind: number): void => {
      g.strokeStyle = '#1e1c1a'; g.fillStyle = '#1e1c1a'; g.lineWidth = 6; g.beginPath(); g.arc(cx, 64, 46, 0, Math.PI * 2); g.stroke();
      if (kind === 0) { for (let j = 0; j < 3; j++) { g.beginPath(); g.ellipse(cx + Math.cos(j * 2.09) * 18, 64 + Math.sin(j * 2.09) * 18, 16, 9, j * 2.09, 0, Math.PI * 2); g.fill(); } }
      else { g.fillRect(cx - 26, 58, 52, 12); g.fillRect(cx - 6, 36, 12, 56); g.beginPath(); g.arc(cx, 64, 10, 0, Math.PI * 2); g.fillStyle = '#ebe6da'; g.fill(); }
    };
    crest(64, 0); crest(192, 1);
  });
  at(T.shrine, () => { wood('#3a2a1e'); vertical('八幡神社', 128, 26, 26, '#f1e3c2'); });
  // Amado: geschlossene Holzläden vor den Fenstern.
  at(T.amado, () => { g.fillStyle = '#4a3828'; g.fillRect(0, 0, TW, TH); for (let x = 0; x < TW; x += 16) { g.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.2})`; g.fillRect(x, 0, 2, TH); } for (const y of [4, 62, 120]) { g.fillStyle = '#2d2219'; g.fillRect(0, y, TW, 5); } });
  at(T.noren, () => { g.fillStyle = '#24344f'; g.fillRect(0, 0, TW, TH); text('そば', 128, 84, `600 60px ${MINCHO}`, '#f2eee4'); });
  at(T.speed, () => { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#c8201c'; g.lineWidth = 12; g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke(); text('30', 64, 86, `bold 56px ${GOTHIC}`, '#1c3b8a'); });
  at(T.white, () => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, TW, TH); });
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}
