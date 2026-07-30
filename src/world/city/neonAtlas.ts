import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from 'three';

import { NEON } from '@/config/city.config';

/**
 * Schilder-Atlas — PLAN.md P6 / 6.3.
 *
 * Die Schriftzeichen werden **zur Laufzeit gezeichnet**, nicht als Bild
 * mitgeliefert. Der Grund ist derselbe wie beim Stadt-Generator: die Eingabe ist
 * eine Handvoll Zeichenketten, und ein Backschritt brächte eine weitere Datei
 * plus die Frage, mit welcher Schrift sie einmal entstanden ist. Ein Canvas
 * kennt die Schrift des Systems, und ob sie taugt, ist **messbar** — siehe
 * unten.
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
 * nichts, und damit trennt die Messung sauber. Deshalb steht in `NEON.font`
 * kein Schriftname, sondern die Vorgabe — nicht aus Bequemlichkeit, sondern
 * weil nur sie prüfbar ist.
 *
 * Fällt eine Zelle trotzdem durch, bekommt sie ein abstraktes Muster. Ein Schild
 * mit Streifen ist ein Schild; ein Schild mit einem leeren Kasten ist ein Fehler.
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
  /** Anteil gesetzter Pixel, in Prozent. Für die Debug-Anzeige. */
  readonly ink: number;
  /** Wurde die Zelle durch ein Ersatzmuster ersetzt? */
  readonly fallback: boolean;
}

export interface NeonAtlas {
  readonly texture: Texture;
  readonly cells: readonly AtlasCell[];
  /** Indizes der hochkanten Zellen (Kanban) bzw. der querliegenden. */
  readonly upright: readonly number[];
  readonly banner: readonly number[];
}

/** Hochkant, drei Zeichen übereinander — die Bauform, die eine Straße japanisch macht. */
const UPRIGHT_WORDS = ['居酒屋', '焼肉店', '喫茶店', '薬局'];

/** Querliegend über der Ladenfront. */
const BANNER_WORDS = [
  'ラーメン',
  'カラオケ',
  '珈琲',
  '電気',
  '温泉',
  'ホテル',
  '寿司',
  '銀行',
  '花屋',
  '文具',
  'コンビニ',
  '不動産',
];

function drawFallback(g: CanvasRenderingContext2D, w: number, h: number, index: number): void {
  // Drei Muster, damit die Ersatzschilder nicht alle gleich aussehen: Balken,
  // Ring, Raster. Sie sind bewusst geometrisch — ein Ersatz soll nicht so tun,
  // als wäre er Schrift.
  g.fillStyle = '#fff';
  const kind = index % 3;
  if (kind === 0) {
    const bars = 4;
    for (let i = 0; i < bars; i++) {
      const t = (i + 0.5) / bars;
      g.fillRect(w * 0.14, h * (t - 0.06), w * 0.72, h * 0.09);
    }
  } else if (kind === 1) {
    g.lineWidth = Math.min(w, h) * 0.11;
    g.strokeStyle = '#fff';
    g.beginPath();
    g.arc(w / 2, h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2);
    g.stroke();
    g.fillRect(w * 0.44, h * 0.12, w * 0.12, h * 0.76);
  } else {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if ((i + j) % 2 === 1) continue;
        g.fillRect(w * (0.16 + i * 0.24), h * (0.16 + j * 0.24), w * 0.16, h * 0.16);
      }
    }
  }
}

/** Anteil gesetzter Pixel in einem Rechteck, in Prozent. */
function measureInk(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const data = g.getImageData(x, y, w, h).data;
  let set = 0;
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 40) set++;
  return (set / (w * h)) * 100;
}

export function buildNeonAtlas(): NeonAtlas {
  const size = NEON.atlasSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('Kein 2D-Kontext für den Neon-Atlas.');

  g.clearRect(0, 0, size, size);

  const cells: AtlasCell[] = [];
  const upright: number[] = [];
  const banner: number[] = [];

  // Obere Hälfte: vier hochkante Zellen, je size/4 breit und size/2 hoch.
  const uprightW = size / 4;
  const uprightH = size / 2;
  for (let i = 0; i < UPRIGHT_WORDS.length; i++) {
    const word = UPRIGHT_WORDS[i]!;
    const x = i * uprightW;
    const y = 0;
    drawCellFrame(g, x, y, uprightW, uprightH);

    g.save();
    g.beginPath();
    g.rect(x, y, uprightW, uprightH);
    g.clip();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const step = (uprightH * 0.82) / word.length;
    g.font = `${Math.round(step * 0.86)}px ${NEON.font}`;
    for (let k = 0; k < word.length; k++) {
      g.fillText(word[k]!, x + uprightW / 2, y + uprightH * 0.09 + step * (k + 0.5));
    }
    g.restore();

    let ink = measureInk(g, x, y, uprightW, uprightH);
    let fallback = false;
    if (ink < NEON.minInk) {
      g.clearRect(x, y, uprightW, uprightH);
      drawCellFrame(g, x, y, uprightW, uprightH);
      g.save();
      g.translate(x, y);
      drawFallback(g, uprightW, uprightH, i);
      g.restore();
      ink = measureInk(g, x, y, uprightW, uprightH);
      fallback = true;
    }

    upright.push(cells.length);
    cells.push({
      u: x / size,
      v: 1 - (y + uprightH) / size,
      du: uprightW / size,
      dv: uprightH / size,
      aspect: uprightW / uprightH,
      label: word,
      ink: Number(ink.toFixed(1)),
      fallback,
    });
  }

  // Untere Hälfte: 4 × 4 querliegende Zellen, je size/4 breit und size/8 hoch.
  const bannerW = size / 4;
  const bannerH = size / 8;
  for (let i = 0; i < BANNER_WORDS.length; i++) {
    const word = BANNER_WORDS[i]!;
    const x = (i % 4) * bannerW;
    const y = size / 2 + Math.floor(i / 4) * bannerH;
    drawCellFrame(g, x, y, bannerW, bannerH);

    g.save();
    g.beginPath();
    g.rect(x, y, bannerW, bannerH);
    g.clip();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Schriftgrad so, dass das längste Wort in die Zelle passt. Gemessen statt
    // geraten: `measureText` kennt die tatsächliche Breite der Systemschrift.
    let fontSize = Math.round(bannerH * 0.62);
    g.font = `${fontSize}px ${NEON.font}`;
    const available = bannerW * 0.84;
    const measured = g.measureText(word).width;
    if (measured > available) {
      fontSize = Math.max(8, Math.floor((fontSize * available) / measured));
      g.font = `${fontSize}px ${NEON.font}`;
    }
    g.fillText(word, x + bannerW / 2, y + bannerH * 0.54);
    g.restore();

    let ink = measureInk(g, x, y, bannerW, bannerH);
    let fallback = false;
    if (ink < NEON.minInk) {
      g.clearRect(x, y, bannerW, bannerH);
      drawCellFrame(g, x, y, bannerW, bannerH);
      g.save();
      g.translate(x, y);
      drawFallback(g, bannerW, bannerH, i);
      g.restore();
      ink = measureInk(g, x, y, bannerW, bannerH);
      fallback = true;
    }

    banner.push(cells.length);
    cells.push({
      u: x / size,
      v: 1 - (y + bannerH) / size,
      du: bannerW / size,
      dv: bannerH / size,
      aspect: bannerW / bannerH,
      label: word,
      ink: Number(ink.toFixed(1)),
      fallback,
    });
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // Kein Mipmapping: der Atlas hat Zellen mit Rand, und eine Mip-Stufe mischt
  // benachbarte Zellen ineinander. Bei 20 Zellen auf 1024² ist der Preis ein
  // leichtes Flimmern in der Ferne — sichtbar weniger störend als eine
  // Ladenzeile, deren Schilder sich gegenseitig ausbluten.
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  texture.name = 'NeonAtlas';

  return { texture, cells, upright, banner };
}

/**
 * Rand und Grundfläche einer Zelle.
 *
 * Der Rand wird **in den Atlas gezeichnet** statt als Geometrie gebaut: ein
 * Schild ist damit ein einziges Viereck, und 380 Schilder sind 760 Dreiecke
 * statt der zehnfachen Zahl für Rahmen und Rückwand.
 */
function drawCellFrame(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const inset = Math.max(2, Math.min(w, h) * 0.05);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  g.lineWidth = inset;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.strokeRect(x + inset * 1.5, y + inset * 1.5, w - inset * 3, h - inset * 3);
}
