/**
 * Materialpalette der Props — PLAN.md P5.1, Schritt 6.
 *
 * **Reines ESM mit Typen daneben in `.d.mts`**, nach demselben Muster wie
 * `splineSampler.mjs`: die Palette wird an zwei Orten gebraucht, und beide
 * müssen dieselben Zahlen sehen. `tools/process-assets.mjs` schreibt damit die
 * Materialien eingehender Fremdmodelle um, der Renderer baut damit die
 * prozeduralen Landmarks. Zwei Kopien liefen unweigerlich auseinander, und der
 * Stil-Bruch, vor dem SPEC §6 warnt, entstünde dann *innerhalb* des Projekts.
 *
 * SPEC-Leitprinzip: **flache Farben, der Look entsteht im Licht.** Deshalb
 * stehen hier Farbe, Rauheit und Metallizität und sonst nichts — keine
 * Texturen, keine Emissive-Kanäle. Ein Fremdmodell, das seine Albedo-Textur
 * behalten darf, ist die begründete Ausnahme und steht in der Rezeptur des
 * Werkzeugs, nicht hier.
 *
 * Die Farben sind auf die **blaue Stunde** hin gewählt (SPEC §3.1): bei 2,23°
 * Sonnenstand und einem Himmel, der den Hauptteil der Umgebungsbeleuchtung
 * stellt, wirkt alles kühler und dunkler als der Zahlenwert vermuten lässt.
 * Sie liegen deshalb durchweg etwas heller und wärmer, als man sie im
 * Farbwähler wählen würde.
 */

/**
 * @typedef {{ color: number, roughness: number, metalness: number }} PaletteEntry
 */

/** @type {Readonly<Record<string, PaletteEntry>>} */
export const PALETTE = {
  /** Gewachsener Fels — Findlinge, Klippen. Deckt sich mit `rock_face_03` im Terrain. */
  rock: { color: 0x6d6559, roughness: 0.95, metalness: 0 },

  /** Behauener Stein — Laternen, Treppenstufen, Sockel. Heller und gleichmäßiger als Fels. */
  stone: { color: 0x8f8b81, roughness: 0.82, metalness: 0 },

  /** Verwittertes Holz — Stege, Schuppen, Zäune. */
  wood: { color: 0x6a4c33, roughness: 0.8, metalness: 0 },

  /**
   * Zinnoberrot der Torii und Schreintore.
   *
   * Die eine Farbe, an der die Zone „Wald/Tempel" im Vorbeifliegen erkennbar
   * ist — und damit die einzige gesättigte in dieser Palette. Alles andere ist
   * gedämpft, damit sie es nicht ist.
   */
  vermilion: { color: 0xa8382a, roughness: 0.72, metalness: 0 },

  /** Dachziegel, dunkel und leicht bläulich — japanische Ziegel sind grau, nicht rot. */
  roofTile: { color: 0x39414b, roughness: 0.62, metalness: 0 },

  /** Putz und Papierwände — Bauernhaus, Tempelhalle. */
  plaster: { color: 0xd6d0c2, roughness: 0.9, metalness: 0 },

  /** Beton — Tetrapoden, Mole, Leuchtturm. */
  concrete: { color: 0x9b9a93, roughness: 0.88, metalness: 0 },

  /** Verzinkter Stahl — Leitplanken, Strommasten. Passt zu den Pfosten aus P3. */
  steel: { color: 0x717579, roughness: 0.42, metalness: 0.85 },

  /** Reisig, Stroh, Reetdach. */
  thatch: { color: 0x8d7a4e, roughness: 0.95, metalness: 0 },
};

/**
 * Eintrag holen, mit lauter Beschwerde statt stillem Rückfall.
 *
 * Ein Tippfehler im Materialnamen einer Rezeptur würde sonst als
 * Standardmaterial durchlaufen und erst im Bild auffallen — dort aber als
 * „sieht komisch aus", nicht als Fehler.
 *
 * @param {string} name
 * @returns {PaletteEntry}
 */
export function paletteEntry(name) {
  const entry = PALETTE[name];
  if (!entry) {
    throw new Error(
      `Unbekanntes Palettenmaterial „${name}". Bekannt: ${Object.keys(PALETTE).join(', ')}`,
    );
  }
  return entry;
}

/**
 * Hex-Farbe in lineares RGB, wie glTF es für `baseColorFactor` verlangt.
 *
 * Die Zahlen oben sind **sRGB** — so wählt man Farben, und so liest three sie
 * mit `setHex(value, 'srgb')`. glTF speichert den Faktor dagegen linear. Ohne
 * diese Umrechnung wäre jedes umgeschriebene Fremdmodell deutlich heller als
 * das prozedurale Modell daneben, obwohl beide dieselbe Zahl nennen.
 *
 * @param {number} hex
 * @returns {[number, number, number, number]}
 */
export function paletteLinearRgba(hex) {
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [
    toLinear(((hex >> 16) & 0xff) / 255),
    toLinear(((hex >> 8) & 0xff) / 255),
    toLinear((hex & 0xff) / 255),
    1,
  ];
}
