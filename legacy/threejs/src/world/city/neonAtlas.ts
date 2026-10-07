import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from 'three';

import { NEON } from '@/config/city.config';

/**
 * Schilder-Atlas — PLAN.md P6 / 6.3, seit Neo-Tokio v2 neu (docs/TOKYO.md).
 *
 * Die Schriftzeichen werden **zur Laufzeit gezeichnet**, nicht als Bild
 * mitgeliefert. Der Grund ist derselbe wie beim Stadt-Generator: die Eingabe ist
 * eine Handvoll Zeichenketten, und ein Backschritt brächte eine weitere Datei
 * plus die Frage, mit welcher Schrift sie einmal entstanden ist. Ein Canvas
 * kennt die Schrift des Systems, und ob sie taugt, ist **messbar** — siehe
 * unten.
 *
 * ## v2: warum der Atlas neu ist
 *
 * v1 hatte vier Hochkant-Wörter und zwölf Querschilder, alle im selben Stil
 * (weiße Schrift auf fast durchsichtigem Grund, eingefärbt). Über 1000 Plätze
 * verteilt ergab das die Straße aus Bild 2 der Rückmeldung: links und rechts
 * dieselben Kästen „居酒屋 · 薬局 · 喫茶店" in gleichen Abständen — „random und
 * generisch". Die Vorbilder (`ref/web/01`, `04`, `05`, `24`) zeigen etwas
 * anderes: **Leuchtkästen** mit farbigem Grund, weiße Kästen mit roter oder
 * blauer Schrift, Mieterverzeichnisse (ein Kasten je Etage), dazwischen wenige
 * echte Neonröhren. v2 zeichnet deshalb vier Bauarten und rund 70 Felder, und
 * das `NeonSystem` entscheidet je Haus, *welche* Art dorthin gehört.
 *
 * Alle Namen sind erfunden oder Gattungsbegriffe — keine echten Marken.
 *
 * ## Die Tofu-Prüfung
 *
 * Eine fehlende Schrift ergibt kein Fehlerbild, sondern ein leeres Rechteck
 * („Tofu"), und das sähe auf einem Neonschild aus 40 m Entfernung wie ein
 * Absicht-Design aus. Deshalb wird jede Zelle nach dem Zeichnen **ausgemessen**:
 * Anteil gesetzter Pixel gegen einen Schwellwert. Gemessen auf dieser Maschine,
 * 96 px Schriftgrad auf 128²:
 *
 * | Schrift | 酒 | ラーメン | 居 | 温 | fehlendes Zeichen |
 * |---|---|---|---|---|---|
 * | Yu Gothic | 14,7 % | 6,3 % | 13,9 % | 14,0 % | 18,8 % ⚠ |
 * | MS Gothic | 22,8 % | 10,4 % | 22,0 % | 22,0 % | 13,4 % ⚠ |
 * | Systemvorgabe | 25,4 % | 6,3 % | 23,0 % | 24,5 % | **3,3 %** |
 *
 * Die beiden benannten Schriften zeichnen für ein fehlendes Zeichen einen
 * **Kasten mit Rand** — deren Tofu deckt mehr Fläche als manches echte Zeichen,
 * die Prüfung könnte sie also gar nicht unterscheiden. Die Systemvorgabe malt
 * nichts, und damit trennt die Messung sauber.
 *
 * > **v2: gemessen wird nur noch die Schrift, nicht die Zelle.** Die neuen
 * > Kästen haben einen vollen farbigen Grund; ein Anteil gesetzter Pixel über
 * > die ganze Zelle wäre immer 100 %. Die Probe zeichnet deshalb dieselbe
 * > Beschriftung einmal allein auf eine leere Hilfsfläche und misst dort.
 *
 * Fällt eine Beschriftung durch, bekommt die Zelle ein abstraktes Muster. Ein
 * Schild mit Streifen ist ein Schild; ein Schild mit einem leeren Kasten ist ein
 * Fehler.
 */

/** Ein Feld im Atlas, in UV-Koordinaten. */
export interface AtlasCell {
  readonly u: number;
  readonly v: number;
  readonly du: number;
  readonly dv: number;
  /** Breite geteilt durch Höhe — die Schilder-Geometrie richtet sich danach. */
  readonly aspect: number;
  readonly label: string;
  /** Anteil gesetzter Pixel der Beschriftung, in Prozent. Für die Debug-Anzeige. */
  readonly ink: number;
  /** Wurde die Zelle durch ein Ersatzmuster ersetzt? */
  readonly fallback: boolean;
  /**
   * Einfarbig (weiß gezeichnet, im Betrieb eingefärbt) — die echten
   * Neonröhren. Alle anderen tragen ihre Farben selbst und bekommen Weiß.
   */
  readonly mono: boolean;
  readonly style: SignStyle;
}

export type SignStyle = 'box' | 'white' | 'neon' | 'directory' | 'fascia';

export interface NeonAtlas {
  readonly texture: Texture;
  readonly cells: readonly AtlasCell[];
  /** Hochkante Zellen (Kanban, Verzeichnis). */
  readonly upright: readonly number[];
  /** Davon nur die Mieterverzeichnisse. */
  readonly directory: readonly number[];
  /** Querliegende Zellen (Ladenschild, Etagenband, Dachtafel). */
  readonly banner: readonly number[];
}

/** Gattungen, zwei bis vier Zeichen — senkrecht gelesen. */
const CATEGORIES = [
  '居酒屋', '焼肉', '喫茶', '薬局', 'カラオケ', 'ラーメン', '寿司', '焼鳥', '麻雀', '漫画',
  '歯科', '質屋', '酒場', '中華', '定食', '古着', '電器', 'ゲーム', '整体', '占い',
  'ホテル', '美容室', '眼鏡', '書店', '串カツ', 'うどん', '餃子', 'スナック', '天ぷら', '珈琲',
  '銭湯', '劇場', 'ビリヤード', '鉄板焼',
];
/** Erfundene Hausnamen, ein bis zwei Zeichen. */
const NAMES = ['月光', '銀河', '大黒', '夢', '竜宮', '北斗', '若葉', '丸福', '一番', '富士', '桜', '満月', '龍', '鶴亀', '紅', '梅', '千代', '宝', '昭和', '新星'];
/** Mieter im Verzeichnis. */
const TENANTS = ['BAR', 'スナック', '麻雀', '占い', '整体', 'カラオケ', '歯科', '英会話', '質屋', '喫茶', 'ネイル', '酒場', '鍼灸', '囲碁', '写真', 'クラブ', '食堂', '学習塾'];
/** Querschilder: Name plus Gattung, Kürzel, ein paar lateinische. */
const FASCIA = [
  'ラーメン 一番', 'カラオケ 夢', '珈琲 月光', '電気 北斗', '温泉', 'ホテル 銀河', '寿司 丸福', '居酒屋 鶴亀',
  'ドラッグ', 'コンビニ', '不動産', '24H', 'GAME', 'BOOKS', 'CAFE', 'KARAOKE', '焼肉 龍', '牛丼', '中華 紅',
  '眼鏡', '質 大黒', 'ゲームセンター', '古着', 'SALE', '100円', '酒', '定食 千代', '和菓子', 'パン', '花屋',
  'CAMERA', '中古', '書店',
];

/** Grundfarben für Leuchtkästen: kräftig, wie im Vorbild; Schrift weiß oder schwarz. */
const BOX_COLORS: readonly (readonly [string, string])[] = [
  ['#c8102e', '#ffffff'], ['#1f4fbf', '#ffffff'], ['#f2c200', '#141414'], ['#1d8a4a', '#ffffff'],
  ['#e8601c', '#ffffff'], ['#7b2fbf', '#ffffff'], ['#141414', '#ffd400'], ['#0a8fbf', '#ffffff'],
  ['#d61a7f', '#ffffff'], ['#2b2b2b', '#ff4d4d'],
];
/** Weiße Kästen mit farbiger Schrift (Kameraladen, `ref/web/23`). */
const INK_COLORS = ['#c8102e', '#1f4fbf', '#1d8a4a', '#141414', '#d61a7f'];

const UPRIGHT_W = 96;
const UPRIGHT_H = 384;
const BANNER_W = 256;
const BANNER_H = 64;
const WIDTH = 2048;
const HEIGHT = 1024;

function drawFallback(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, index: number, color: string): void {
  // Drei Muster, damit die Ersatzschilder nicht alle gleich aussehen: Balken,
  // Ring, Raster. Sie sind bewusst geometrisch — ein Ersatz soll nicht so tun,
  // als wäre er Schrift.
  g.fillStyle = color;
  g.strokeStyle = color;
  const kind = index % 3;
  if (kind === 0) {
    for (let i = 0; i < 4; i++) g.fillRect(x + w * 0.16, y + h * ((i + 0.5) / 4 - 0.05), w * 0.68, h * 0.08);
  } else if (kind === 1) {
    g.lineWidth = Math.min(w, h) * 0.11;
    g.beginPath();
    g.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2);
    g.stroke();
  } else {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) g.fillRect(x + w * (0.16 + i * 0.24), y + h * (0.16 + j * 0.24), w * 0.16, h * 0.16);
  }
}

/** Anteil gesetzter Pixel in einem Rechteck, in Prozent. */
function measureInk(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): number {
  const data = g.getImageData(x, y, w, h).data;
  let set = 0;
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 40) set++;
  return (set / (w * h)) * 100;
}

/** Senkrechte Schrift in einem Rechteck, Zeichen für Zeichen. */
function verticalText(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, color: string): void {
  const chars = [...text];
  const step = Math.min(h / chars.length, w * 0.95);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(step * 0.84)}px ${NEON.font}`;
  const top = y + (h - step * chars.length) / 2;
  for (let k = 0; k < chars.length; k++) g.fillText(chars[k]!, x + w / 2, top + step * (k + 0.5));
}

function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, color: string, weight = 'bold'): void {
  let size = Math.round(h * 0.7);
  g.font = `${weight} ${size}px ${NEON.font}`;
  const measured = g.measureText(text).width;
  if (measured > w) {
    size = Math.max(8, Math.floor((size * w) / measured));
    g.font = `${weight} ${size}px ${NEON.font}`;
  }
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x + w / 2, y + h * 0.54);
}

export function buildNeonAtlas(): NeonAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('Kein 2D-Kontext für den Neon-Atlas.');
  // Hilfsfläche für die Tofu-Prüfung: dieselbe Schrift allein, ohne Grund.
  const probeCanvas = document.createElement('canvas');
  probeCanvas.width = UPRIGHT_H;
  probeCanvas.height = UPRIGHT_H;
  const probe = probeCanvas.getContext('2d', { willReadFrequently: true });
  if (!probe) throw new Error('Kein 2D-Kontext für die Tofu-Probe.');
  const legible = (draw: (p: CanvasRenderingContext2D) => void, w: number, h: number): number => {
    probe.clearRect(0, 0, probeCanvas.width, probeCanvas.height);
    draw(probe);
    return measureInk(probe, 0, 0, w, h);
  };

  g.clearRect(0, 0, WIDTH, HEIGHT);
  let seed = 0x5171a;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;

  const cells: AtlasCell[] = [];
  const upright: number[] = [];
  const directory: number[] = [];
  const banner: number[] = [];

  const push = (x: number, y: number, w: number, h: number, label: string, ink: number, fallback: boolean, mono: boolean, style: SignStyle): number => {
    cells.push({ u: x / WIDTH, v: 1 - (y + h) / HEIGHT, du: w / WIDTH, dv: h / HEIGHT, aspect: w / h, label, ink: Number(ink.toFixed(1)), fallback, mono, style });
    return cells.length - 1;
  };

  // ── Hochkant: zwei Reihen à 21 Felder ─────────────────────────────────
  const perRow = Math.floor(WIDTH / UPRIGHT_W);
  for (let n = 0; n < perRow * 2; n++) {
    const x = (n % perRow) * UPRIGHT_W;
    const y = Math.floor(n / perRow) * UPRIGHT_H;
    const w = UPRIGHT_W, h = UPRIGHT_H;
    const pad = 5;
    // Jedes fünfte Feld ein Mieterverzeichnis, jedes vierte ein Neon, sonst Kästen.
    const style: SignStyle = n % 5 === 2 ? 'directory' : n % 4 === 1 ? 'neon' : n % 3 === 0 ? 'white' : 'box';
    let label = '';
    let ink = 0;
    let fallback = false;
    if (style === 'directory') {
      // Ein Kasten je Etage, von oben nach unten — das Erkennungszeichen der
      // Kabukichō-Bürohäuser (ref/web/05): Mieter auf jeder Etage, jeder mit
      // eigener Farbe.
      const floors = 5 + Math.floor(random() * 2);
      const slot = (h - pad * 2) / floors;
      g.fillStyle = '#1b1d22';
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
      const names: string[] = [];
      for (let f = 0; f < floors; f++) {
        const [bg, fg] = pick(BOX_COLORS);
        const sy = y + pad + f * slot;
        g.fillStyle = bg;
        g.fillRect(x + pad, sy + 2, w - pad * 2, slot - 4);
        const tenant = pick(TENANTS);
        names.push(tenant);
        g.fillStyle = fg;
        g.font = `bold ${Math.round(slot * 0.26)}px ${NEON.font}`;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText(`${floors - f + 1}F`, x + pad + 3, sy + 4);
        fitText(g, tenant, x + pad + 2, sy + slot * 0.28, w - pad * 2 - 4, slot * 0.66, fg);
      }
      label = names.join('/');
      ink = legible((p) => fitText(p, names[0]!, 0, 0, w, h / floors, '#fff'), w, h / 5);
    } else {
      const word = random() < 0.45 ? `${pick(NAMES)}${pick(CATEGORIES)}`.slice(0, 5) : pick(CATEGORIES);
      label = word;
      const textArea = [x + pad + 4, y + pad + 14, w - pad * 2 - 8, h - pad * 2 - 28] as const;
      ink = legible((p) => verticalText(p, word, 0, 0, textArea[2], textArea[3], '#fff'), textArea[2], textArea[3]);
      if (style === 'box') {
        const [bg, fg] = pick(BOX_COLORS);
        g.fillStyle = '#16181c';
        g.fillRect(x + 1, y + 1, w - 2, h - 2);
        g.fillStyle = bg;
        g.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
        // Heller Rand oben und unten: der Blechkasten des Leuchtschilds.
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x + pad, y + pad, w - pad * 2, 6);
        g.fillRect(x + pad, y + h - pad - 6, w - pad * 2, 6);
        if (ink >= NEON.minInk) verticalText(g, word, ...textArea, fg);
        else { drawFallback(g, x, y, w, h, n, fg); fallback = true; }
      } else if (style === 'white') {
        g.fillStyle = '#2a2c30';
        g.fillRect(x + 1, y + 1, w - 2, h - 2);
        g.fillStyle = '#f4f1e8';
        g.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
        const ink2 = pick(INK_COLORS);
        g.strokeStyle = ink2;
        g.lineWidth = 3;
        g.strokeRect(x + pad + 5, y + pad + 5, w - pad * 2 - 10, h - pad * 2 - 10);
        if (ink >= NEON.minInk) verticalText(g, word, ...textArea, ink2);
        else { drawFallback(g, x, y, w, h, n, ink2); fallback = true; }
      } else {
        // Echte Röhre: dunkler Grund, weiße Schrift und Rahmen — im Betrieb eingefärbt.
        g.fillStyle = 'rgba(12,12,18,0.92)';
        g.fillRect(x + 2, y + 2, w - 4, h - 4);
        g.strokeStyle = '#ffffff';
        g.lineWidth = 4;
        g.strokeRect(x + pad + 2, y + pad + 2, w - pad * 2 - 4, h - pad * 2 - 4);
        if (ink >= NEON.minInk) verticalText(g, word, ...textArea, '#ffffff');
        else { drawFallback(g, x, y, w, h, n, '#ffffff'); fallback = true; }
      }
    }
    const index = push(x, y, w, h, label, ink, fallback, style === 'neon', style);
    upright.push(index);
    if (style === 'directory') directory.push(index);
  }

  // ── Querliegend: vier Reihen à acht Feldern ───────────────────────────
  const bannerTop = UPRIGHT_H * 2;
  const perBannerRow = Math.floor(WIDTH / BANNER_W);
  for (let n = 0; n < perBannerRow * Math.floor((HEIGHT - bannerTop) / BANNER_H); n++) {
    const x = (n % perBannerRow) * BANNER_W;
    const y = bannerTop + Math.floor(n / perBannerRow) * BANNER_H;
    const w = BANNER_W, h = BANNER_H;
    const word = FASCIA[n % FASCIA.length]!;
    const style: SignStyle = n % 4 === 3 ? 'neon' : n % 3 === 1 ? 'white' : 'fascia';
    const ink = legible((p) => fitText(p, word, 0, 0, w * 0.8, h * 0.8, '#fff'), w * 0.8, h * 0.8);
    let fallback = ink < NEON.minInk;
    let fg = '#ffffff';
    if (style === 'fascia') {
      const [bg, text] = pick(BOX_COLORS);
      fg = text;
      g.fillStyle = bg;
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
      // Ein Signet links — die meisten Ladenschilder haben eines.
      g.fillStyle = text;
      g.beginPath();
      g.arc(x + h * 0.55, y + h / 2, h * 0.26, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = bg;
      g.font = `bold ${Math.round(h * 0.34)}px ${NEON.font}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText([...word][0] ?? '', x + h * 0.55, y + h / 2 + 1);
      if (!fallback) fitText(g, word, x + h * 1.0, y + 4, w - h * 1.15, h - 8, text);
    } else if (style === 'white') {
      fg = pick(INK_COLORS);
      g.fillStyle = '#f4f1e8';
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
      g.fillStyle = fg;
      g.fillRect(x + 2, y + h - 10, w - 4, 6);
      if (!fallback) fitText(g, word, x + 10, y + 4, w - 20, h - 16, fg);
    } else {
      g.fillStyle = 'rgba(12,12,18,0.92)';
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      g.strokeRect(x + 6, y + 6, w - 12, h - 12);
      if (!fallback) fitText(g, word, x + 12, y + 6, w - 24, h - 12, '#ffffff');
    }
    if (fallback) drawFallback(g, x, y, w, h, n, fg);
    fallback = fallback || false;
    banner.push(push(x, y, w, h, word, ink, fallback, style === 'neon', style));
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // Kein Mipmapping: benachbarte Zellen bluteten sonst ineinander. Seit v2
  // tragen die Zellen einen vollen Grund, der Rand zwischen ihnen ist 1…2 px
  // dunkel — der Preis bleibt ein leichtes Flimmern in der Ferne.
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  texture.name = 'NeonAtlas';

  return { texture, cells, upright, directory, banner };
}
