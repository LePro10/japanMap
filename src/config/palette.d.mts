/**
 * Typen zu `palette.mjs`.
 *
 * Die Implementierung ist reines ESM, damit Werkzeug und Renderer dieselben
 * Zahlen sehen (Begründung dort im Kopfkommentar). Diese Datei holt die
 * Typprüfung zurück, ohne die Datei zu verdoppeln.
 */

export interface PaletteEntry {
  /** Grundfarbe als sRGB-Hex — so, wie three sie mit `setHex(value, 'srgb')` liest. */
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
}

export type PaletteName =
  | 'rock'
  | 'stone'
  | 'wood'
  | 'vermilion'
  | 'roofTile'
  | 'plaster'
  | 'concrete'
  | 'steel'
  | 'thatch';

export declare const PALETTE: Readonly<Record<PaletteName, PaletteEntry>>;

/** Eintrag holen; wirft bei unbekanntem Namen, statt still zurückzufallen. */
export declare function paletteEntry(name: string): PaletteEntry;

/** sRGB-Hex → lineares RGBA, wie glTF es für `baseColorFactor` verlangt. */
export declare function paletteLinearRgba(
  hex: number,
): [number, number, number, number];
