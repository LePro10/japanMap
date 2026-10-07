/**
 * Beleuchtung — SPEC §3.1 "Blaue Stunde nach Regen", PLAN.md P1 / 1.6.
 *
 * Zwei HDRIs statt einem: `scene.background` und `scene.environment` dürfen in
 * Three.js verschiedene Texturen sein. Der sichtbare Himmel kommt aus einem
 * PureSky-Panorama, das Licht aus einer echten Straßenaufnahme zur blauen
 * Stunde. Ein reines Himmels-HDRI beleuchtet zu flach — ihm fehlen die
 * Natriumdampf-Gelbtöne, die den Materialien den Look geben.
 */

export const LIGHTING = {
  /** Sichtbarer Himmel. Nur Hintergrund, trägt nicht zur Beleuchtung bei. */
  skyIntensity: 1,
  /**
   * Stärke des IBL aus dem PMREM-Envmap.
   *
   * Der Wert stand zunächst auf 1,15 und war damit zu hoch: das Umgebungslicht
   * hat die Sonne vollständig überstrahlt, das Gelände wirkte flach und ohne
   * erkennbare Schatten — obwohl die Schattenkarte die ganze Zeit korrekt
   * gerendert wurde. Erst 0,5 lässt das gestreifte Relief der Erosionsrinnen
   * sichtbar werden.
   */
  environmentIntensity: 0.5,

  /**
   * Farbe des Key-Lights.
   *
   * Bewusst **nicht** die von tools/hdri-sun.mjs gemessene Farbe. Die misst
   * `#ff1e00` — im HDRI ist die Sonnenscheibe samt Halo übersteuert, einzelne
   * Kanäle laufen in die Sättigung, und heraus kommt ein Rot, das kein
   * Sonnenlicht je hatte. Als Lichtfarbe würde es die ganze Szene einfärben.
   *
   * Übernommen wird aus der Messung deshalb nur die **Richtung** — die ist
   * geometrisch und nicht von der Belichtung des Panoramas betroffen. Der
   * Farbton hier ist die Art-Direction-Entscheidung: warmes Dämmerungslicht,
   * das gegen das kühle IBL steht (SPEC §3.1).
   */
  sunColor: 0xffb27a,
  /**
   * Startwert. Die Messung liefert 4,71 als Kontrastverhältnis; das ist eine
   * Kennzahl des Panoramas, keine Lichtstärke. Der belastbare Wert entsteht
   * beim Ansehen — deshalb hängt er im Debug-Panel am Regler.
   */
  sunIntensity: 5,

  /**
   * Echtzeit-Schatten. Seit P2 **aus**.
   *
   * Die Geländeverschattung ist gebacken (tools/bake-shadows.mjs). Zwei
   * gemessene Gründe stehen dort ausführlich; kurz: vier CSM-Kaskaden wären
   * 5,88 Mio. Dreiecke gegen ein Budget von 3 Mio., und ein 450-m-Gipfel wirft
   * bei 2,2° Sonnenstand 11,5 km Schatten, den keine Kaskade fasst.
   *
   * Der Schalter bleibt trotzdem im Debug-Panel: er stellt die P1-Variante zum
   * Vergleich wieder her. Dann liegen gebackene und gerechnete Verschattung
   * übereinander — der schnellste Weg zu sehen, dass beide dasselbe meinen.
   *
   * Echtzeit-Schatten kommen zurück, sobald es bewegliche Werfer gibt und der
   * LOD-Quadtree aus P4 die Kaskaden bezahlbar macht.
   */
  castShadow: false,

  /**
   * Parameter der Shadow-Map für den Vergleichsfall.
   *
   * `radius` ist die Kantenlänge des abgedeckten Quadrats in Metern. 700 m bei
   * 2048² sind 0,34 m pro Texel — scharf genug für Geländekanten und klein
   * genug, dass die Karte nicht die ganze Welt fassen muss.
   */
  shadow: {
    radius: 700,
    /** Wie weit die Shadow-Kamera hinter der Sonne beginnt. */
    distance: 1400,
    depth: 3000,
    bias: -0.0004,
    normalBias: 1.2,
  },
} as const;

/**
 * Ergebnis von tools/hdri-sun.mjs. Wird zur Laufzeit geladen und geprüft —
 * fehlt die Datei, greift LightingRig auf `FALLBACK_SUN` zurück, statt ohne
 * Key-Light zu rendern.
 */
export interface SunData {
  readonly direction: readonly [number, number, number];
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly color: readonly [number, number, number];
  readonly colorHex: string;
  readonly intensity: number;
}

/** Gemessen aus industrial_sunset_02_puresky_4k.hdr — siehe assets/generated/lighting/. */
export const FALLBACK_SUN: SunData = {
  direction: [0.80865, 0.03897, 0.58699],
  elevationDeg: 2.23,
  azimuthDeg: 125.98,
  color: [1, 0.1176, 0],
  colorHex: '#ff1e00',
  intensity: 4.71,
};
