/**
 * Welche Datei auf welcher Stufe geladen wird — P15.2.
 *
 * ## Der Auftrag
 *
 * „Wenn jemand das Game als allererstes startet, downloadet er erstmals nur
 * Assets für den mittleren Modus. Erst wenn die Hardware gut genug ist, wird
 * automatisch hochgeschaltet, und dann wird im Hintergrund der Rest
 * runtergeladen."
 *
 * ## Was heute übertragen wird — gemessen am 2026-08-18, Port 4180
 *
 * `PerformanceResourceTiming.transferSize`, frisch geladen: **40,83 MB** in 47
 * Anfragen. Nicht die 53,4 MB aus P12.5 — das ist eine *Ordnersumme* über
 * `dist/`, hier stehen *übertragene Bytes*, und Vite legt gzip drüber.
 *
 * | Kategorie | übertragen |
 * |---|---|
 * | **Texturen** | **18,70 MB** |
 * | HDRIs | 14,30 MB |
 * | Weltdaten | 5,86 MB |
 * | Modelle | 1,50 MB |
 * | Code | 0,43 MB |
 *
 * Der größte Block sind die **Texturen**, nicht die HDRIs. Das stand vor P15 an
 * keiner Stelle der Doku und dreht die Rangfolge der Hebel um: P12.5 hat das
 * IBL halbiert — den zweitgrößten *Einzelposten* — und den größten *Block* nie
 * angefasst.
 *
 * ## Die drei Klassen, und warum die Unterscheidung die wichtigste Zeile ist
 *
 * | Klasse | Bedeutung |
 * |---|---|
 * | `welt` | bestimmt die **Form** der Welt. Nie gestuft |
 * | `bild` | bestimmt die **Güte**. Gestuft und nachladbar |
 * | `abgeleitet` | wird gerechnet statt geladen |
 *
 * `height.r16` in halber Auflösung zu laden spräche 2,9 MB — und verschöbe den
 * Boden unter dem Fahrzeug. P14 hat 0,00 cm Standhöhenfehler auf allen acht
 * Strecken gemessen; danach wäre das eine andere Zahl, und zwar eine, die
 * niemand sucht, weil sie in einer Ladeoptimierung entstanden ist. **Weltdaten
 * werden nicht gestuft** — auch dann nicht, wenn es billig aussieht.
 *
 * ## Warum der Start immer auf `mittel` beginnt
 *
 * Nicht auf einer geschätzten Stufe. `estimateDevice()` braucht einen
 * WebGL-Kontext und liefert erst eine Antwort, wenn der Renderer steht — zu
 * diesem Zeitpunkt sind die ersten Anfragen längst raus. Ein Erststart, der auf
 * die Schätzung wartet, tauscht Bytes gegen Zeit bis zum ersten Bild, und das
 * ist auf der Hardware, um die es hier geht, der schlechtere Handel.
 *
 * Für Wiederkehrer kostet das nichts: die URLs tragen einen Inhalts-Hash, der
 * volle Satz liegt nach dem ersten Besuch im HTTP-Cache und wird beim
 * Hochstufen nicht erneut übertragen.
 */

import layerRockAlbedo from '../../assets/generated/textures/rock_face_03/Diffuse.jpg?url';
import layerRockNormal from '../../assets/generated/textures/rock_face_03/nor_gl.jpg?url';
import layerRockArm from '../../assets/generated/textures/rock_face_03/arm.jpg?url';
import layerGrassAlbedo from '../../assets/generated/textures/aerial_grass_rock/Diffuse.jpg?url';
import layerGrassNormal from '../../assets/generated/textures/aerial_grass_rock/nor_gl.jpg?url';
import layerGrassArm from '../../assets/generated/textures/aerial_grass_rock/arm.jpg?url';
import layerSandAlbedo from '../../assets/generated/textures/coast_sand_01/Diffuse.jpg?url';
import layerSandNormal from '../../assets/generated/textures/coast_sand_01/nor_gl.jpg?url';
import layerSandArm from '../../assets/generated/textures/coast_sand_01/arm.jpg?url';
import layerPaddyAlbedo from '../../assets/generated/textures/brown_mud_02/Diffuse.jpg?url';
import layerPaddyNormal from '../../assets/generated/textures/brown_mud_02/nor_gl.jpg?url';
import layerPaddyArm from '../../assets/generated/textures/brown_mud_02/arm.jpg?url';

import halfRockAlbedo from '../../assets/generated/textures-half/rock_face_03/Diffuse.jpg?url';
import halfRockNormal from '../../assets/generated/textures-half/rock_face_03/nor_gl.jpg?url';
import halfRockArm from '../../assets/generated/textures-half/rock_face_03/arm.jpg?url';
import halfGrassAlbedo from '../../assets/generated/textures-half/aerial_grass_rock/Diffuse.jpg?url';
import halfGrassNormal from '../../assets/generated/textures-half/aerial_grass_rock/nor_gl.jpg?url';
import halfGrassArm from '../../assets/generated/textures-half/aerial_grass_rock/arm.jpg?url';
import halfSandAlbedo from '../../assets/generated/textures-half/coast_sand_01/Diffuse.jpg?url';
import halfSandNormal from '../../assets/generated/textures-half/coast_sand_01/nor_gl.jpg?url';
import halfSandArm from '../../assets/generated/textures-half/coast_sand_01/arm.jpg?url';
import halfPaddyAlbedo from '../../assets/generated/textures-half/brown_mud_02/Diffuse.jpg?url';
import halfPaddyNormal from '../../assets/generated/textures-half/brown_mud_02/nor_gl.jpg?url';
import halfPaddyArm from '../../assets/generated/textures-half/brown_mud_02/arm.jpg?url';

import roadAlbedo from '../../assets/generated/textures/asphalt_02/Diffuse.jpg?url';
import roadNormal from '../../assets/generated/textures/asphalt_02/nor_gl.jpg?url';
import roadArm from '../../assets/generated/textures/asphalt_02/arm.jpg?url';
import roadHalfAlbedo from '../../assets/generated/textures-half/asphalt_02/Diffuse.jpg?url';
import roadHalfNormal from '../../assets/generated/textures-half/asphalt_02/nor_gl.jpg?url';
import roadHalfArm from '../../assets/generated/textures-half/asphalt_02/arm.jpg?url';

/**
 * Die zwei Sätze.
 *
 * Mehr als zwei wären eine Zahl ohne Messung dahinter. Zwei sind der Tausch,
 * den der Auftrag beschreibt: einer, der überall reicht, und einer, der alles
 * zeigt.
 */
export type AssetTier = 'mittel' | 'voll';

/** Die Stufe, mit der jeder Start beginnt — siehe Kopf der Datei. */
export const START_TIER: AssetTier = 'mittel';

export interface LayerTextureSet {
  readonly albedo: readonly string[];
  readonly normal: readonly string[];
  readonly arm: readonly string[];
}

/**
 * Detailtexturen des Geländes, Reihenfolge = `TERRAIN_LAYERS`.
 *
 * **Alle Ebenen einer Array-Textur müssen dieselbe Größe haben** —
 * `createLayerArray` wirft sonst. Die vier Quellen liegen bei 1024², der halbe
 * Satz bei 512²; die Gleichheit bleibt also innerhalb einer Stufe erhalten und
 * geht nur zwischen den Stufen verloren. Das ist auch der Grund, warum ein
 * Stufenwechsel die Array-Textur **neu baut**, statt einzelne Ebenen zu
 * tauschen.
 */
export const LAYER_TEXTURE_SETS: Readonly<Record<AssetTier, LayerTextureSet>> = {
  voll: {
    albedo: [layerRockAlbedo, layerGrassAlbedo, layerSandAlbedo, layerPaddyAlbedo],
    normal: [layerRockNormal, layerGrassNormal, layerSandNormal, layerPaddyNormal],
    arm: [layerRockArm, layerGrassArm, layerSandArm, layerPaddyArm],
  },
  mittel: {
    albedo: [halfRockAlbedo, halfGrassAlbedo, halfSandAlbedo, halfPaddyAlbedo],
    normal: [halfRockNormal, halfGrassNormal, halfSandNormal, halfPaddyNormal],
    arm: [halfRockArm, halfGrassArm, halfSandArm, halfPaddyArm],
  },
} as const;

export interface RoadTextureSet {
  readonly albedo: string;
  readonly normal: string;
  readonly arm: string;
}

/**
 * Die Straßendecke — mit 6,31 MB der größte Textursatz der Karte.
 *
 * `asphalt_02` liegt als einziger Satz bei 2048², weil die Fahrbahn im Bild
 * näher an der Kamera steht als alles andere. Auf der mittleren Stufe sind es
 * 1024², und das sind gemessen 4,52 MB weniger — der größte Einzelposten
 * dieser ganzen Phase.
 */
export const ROAD_TEXTURE_SETS: Readonly<Record<AssetTier, RoadTextureSet>> = {
  voll: { albedo: roadAlbedo, normal: roadNormal, arm: roadArm },
  mittel: { albedo: roadHalfAlbedo, normal: roadHalfNormal, arm: roadHalfArm },
} as const;

import skyFull from '../../assets/hdri/industrial_sunset_02_puresky_4k.hdr?url';
import skyHalf from '../../assets/generated/hdri/industrial_sunset_02_puresky_2k.hdr?url';
import iblFull from '../../assets/hdri/rooftop_night_2k.hdr?url';
import iblHalf from '../../assets/generated/hdri/rooftop_night_1k.hdr?url';

/**
 * Der sichtbare Himmel — mit 9,19 MB übertragen der größte Einzelposten.
 *
 * Halbiert von 4096 × 2048 auf 2048 × 1024. `tools/optimize-hdri.mjs` mittelt
 * dabei **linear** und liest seine eigene Ausgabe zur Prüfung wieder ein;
 * gemessen weicht die mittlere Leuchtdichte um 0,1016 % ab, der größte
 * Pixelfehler liegt bei 1,27 %.
 *
 * **Der Himmel steht in diesem Projekt hinter Höhennebel und Wolken**, und
 * genau deshalb ist er der Posten, bei dem die halbe Auflösung am wenigsten
 * kostet — anders als beim IBL, wo P12.5 sie am Glanzlicht auf nassem Asphalt
 * *messen* konnte. Der Nachlader holt ihn deshalb zuletzt.
 *
 * `sun.json` wird davon **nicht** berührt: die Sonnenrichtung rechnet
 * `npm run sun` aus der 4k-Quelle, unabhängig davon, welche Datei der Browser
 * später lädt.
 */
export const SKY_SETS: Readonly<Record<AssetTier, string>> = {
  voll: skyFull,
  mittel: skyHalf,
} as const;

/**
 * Das Beleuchtungs-HDRI — PMREM → `scene.environment`.
 *
 * ## Das hier ersetzt `iblForDevice()` aus P12.5
 *
 * Dort entschied `matchMedia('(pointer: coarse)')` zwischen 2k und 1k: das
 * Telefon bekam die kleine Datei, der Desktop die große. Die Messung dahinter
 * gilt unverändert und steht in `terrainAssets.ts` — 42,97 % geänderte Pixel am
 * `stadt-neon`, mittlere Helligkeit −2,3 %.
 *
 * **Was sich ändert, ist nicht die Messung, sondern wer die Frage stellt.** Ein
 * Zeigegerät ist ein Hinweis auf die Hardware, keine Messung an ihr; ein Tablet
 * mit starker GPU bekam die kleine Datei, ein zehn Jahre alter Laptop mit Maus
 * die große. Seit P15 entscheidet die Stufe, und die Stufe entsteht aus einer
 * gemessenen Bildrate.
 */
export const IBL_SETS: Readonly<Record<AssetTier, string>> = {
  voll: iblFull,
  mittel: iblHalf,
} as const;

/**
 * Wie viele Bytes eine Stufe an Texturen kostet — für Anzeige und Messung.
 *
 * Die Zahlen stammen aus `npm run textures` vom 2026-08-18 und sind **roh**,
 * nicht übertragen: JPEG komprimiert nicht weiter, gzip bringt darauf unter
 * einem Prozent. Sie stehen hier, damit der Nachlader melden kann, was er
 * gerade holt, ohne die Antworten zu wiegen.
 */
export const TIER_TEXTURE_BYTES: Readonly<Record<AssetTier, number>> = {
  mittel: Math.round(3.18 * 1048576),
  voll: Math.round(11.19 * 1048576),
} as const;
