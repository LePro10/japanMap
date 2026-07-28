import { WORLD } from '@/config/world.config';
import { TERRAIN_ASSETS } from '../terrainAssets';

/**
 * `zones.png` auf der CPU — PLAN.md P4 / 4.2, Filter 1.
 *
 * Die Splat-Gewichte liegen seit P1 als Textur auf der GPU, aber die Streuung
 * läuft auf der CPU und braucht sie dort. Die Karte ein zweites Mal zu
 * dekodieren kostet gemessen 21 ms und 4 MB; die Alternative wäre, das Biom aus
 * Höhe und Neigung *nachzubilden* — also dieselbe Regel ein zweites Mal
 * aufzuschreiben, mit der sicheren Aussicht, dass beide Fassungen mit der Zeit
 * auseinanderlaufen. Genau diese Sorte Doppelimplementierung hat in P3 die
 * eingeschnittene Rinne neben das Straßen-Mesh gelegt.
 *
 * Zeile 0 ist Norden (−Z), wie in der Textur: der Baker schreibt von Nord nach
 * Süd, das Material liest mit `flipY: false`, und `getImageData` liefert
 * ebenfalls die erste Dateizeile zuerst. Alle drei zeigen damit in dieselbe
 * Richtung — ein `flipY` an einer der drei Stellen hieße Strandvegetation im
 * Gebirge.
 */
export class ZoneMap {
  readonly #data: Uint8ClampedArray;
  readonly #res: number;
  readonly #last: number;
  readonly #invSpacing: number;

  private constructor(data: Uint8ClampedArray, res: number) {
    this.#data = data;
    this.#res = res;
    this.#last = res - 1;
    this.#invSpacing = (res - 1) / WORLD.size;
  }

  static async load(): Promise<ZoneMap> {
    const response = await fetch(TERRAIN_ASSETS.zones);
    if (!response.ok) throw new Error(`zones.png nicht ladbar (HTTP ${response.status}).`);
    const bitmap = await createImageBitmap(await response.blob());

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Kein 2D-Kontext zum Auslesen von zones.png.');
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();

    return new ZoneMap(image.data, bitmap.width);
  }

  /**
   * Gewicht eines Kanals an einer Weltposition, 0…1.
   *
   * Nächster Nachbar statt bilinear: die Karte hat 3 m pro Texel, die Streuung
   * fragt sie für Punkte ab, die im Mittel 1 bis 8 m auseinanderliegen, und ein
   * halber Texel Unschärfe an einer Biomgrenze ist bei einer Wahrscheinlichkeit
   * ohnehin nicht messbar. Bilinear kostete vier Zugriffe je Kandidat und bei
   * 60 000 Kandidaten also 240 000 statt 60 000.
   */
  weight(x: number, z: number, channel: 0 | 1 | 2 | 3): number {
    const ix = Math.min(Math.max(Math.round((x + WORLD.half) * this.#invSpacing), 0), this.#last);
    const iz = Math.min(Math.max(Math.round((z + WORLD.half) * this.#invSpacing), 0), this.#last);
    return this.#data[(iz * this.#res + ix) * 4 + channel]! / 255;
  }
}
