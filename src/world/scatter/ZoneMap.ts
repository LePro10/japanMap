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

  /**
   * `url` ist ein Parameter, weil der Streu-Worker (P7 / 7.2) dieselbe Karte
   * braucht und seine eigene Basis-URL hat. Der Hauptthread reicht sie durch,
   * statt dass beide Seiten den Pfad kennen — dann kann er auch nicht
   * auseinanderlaufen.
   */
  static async load(url: string = TERRAIN_ASSETS.zones): Promise<ZoneMap> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`zones.png nicht ladbar (HTTP ${response.status}).`);
    const bitmap = await createImageBitmap(await response.blob());

    // **Zwei Fehler an dieser Stelle, und beide waren lautlos.**
    //
    // *Erstens*, die Auflösung: hier stand `new ZoneMap(image.data,
    // bitmap.width)` **nach** `bitmap.close()`. `close()` gibt die Ressource
    // frei und setzt `width` und `height` auf 0 — die Karte kam mit Auflösung 0
    // zur Welt, `weight()` klemmte auf `#last = −1`, griff auf Index −1 zu,
    // bekam `undefined` und lieferte **NaN**. Und `roll >= NaN` ist immer
    // `false`: die Zonenneigung hat damit **nie einen Kandidaten verworfen**.
    //
    // *Zweitens*, das Format: `zones.png` trug den vierten Splat-Kanal
    // (Reisfeld) im **Alphakanal**. Für die GPU ist das gleichgültig — three
    // lädt ohne Premultiplikation. Für jeden Weg über ein Canvas ist es fatal:
    // `drawImage` multipliziert RGB mit Alpha in den Puffer, `getImageData`
    // rechnet es wieder heraus, und wo Alpha null war — also fast überall —
    // kam RGB als **0** zurück. Nach der Reparatur des ersten Fehlers lieferte
    // die Karte deshalb überall 0/0/0/0 statt NaN, was nicht besser ist. Der
    // Baker schreibt seitdem RGB und lässt den vierten Kanal weg; er ergibt
    // sich als Rest (siehe `weight`).
    //
    // Aufgefallen ist beides erst, als in P5 die Reisfelder entstanden und der
    // Wald mitten im Wasser stand. Vorher hielten Höhen- und Neigungsfilter das
    // Bild plausibel: der Strand blieb kahl, weil Kiefern erst ab 12 m wachsen,
    // die Felswände, weil 38° Neigung die Grenze ist.
    const resolution = bitmap.width;

    const canvas = new OffscreenCanvas(resolution, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Kein 2D-Kontext zum Auslesen von zones.png.');
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, resolution, bitmap.height);
    bitmap.close();

    if (resolution < 2) {
      throw new Error(`zones.png kam mit Auflösung ${resolution} an — das kann nicht stimmen.`);
    }
    return new ZoneMap(image.data, resolution);
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
    const o = (iz * this.#res + ix) * 4;
    // **Reisfeld steht nicht in der Datei.** `zones.png` führt seit dem Wechsel
    // auf RGB nur drei Kanäle; der vierte ergibt sich als Rest, weil der Baker
    // auf 255 normiert. Der Grund für den Wechsel steht in `load()`.
    if (channel === 3) {
      const rest = 255 - this.#data[o]! - this.#data[o + 1]! - this.#data[o + 2]!;
      return rest > 0 ? rest / 255 : 0;
    }
    return this.#data[o + channel]! / 255;
  }
}
