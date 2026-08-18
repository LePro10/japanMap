/**
 * Asset-URLs an einer Stelle.
 *
 * Alles läuft über Vites `?url`-Import statt über einen `public/`-Ordner:
 * so bekommen die Dateien im Build einen Inhalts-Hash, landen im Manifest und
 * ein Tippfehler im Pfad fällt beim Bauen auf statt erst im Browser mit einem
 * 404. Die Reihenfolge der Layer-Arrays entspricht TERRAIN_LAYERS.
 */

import heightUrl from '../../assets/generated/terrain/height.r16?url';
import zonesUrl from '../../assets/generated/terrain/zones.png?url';
import metaUrl from '../../assets/generated/terrain/meta.json?url';
import shadeUrl from '../../assets/generated/terrain/shade.png?url';
// Wassermaske der Reisfeld-Parzellen (P5.4). Entsteht im Terrain-Baker,
// Schritt 5c, und liegt deshalb bei den Terrain-Assets und nicht bei den Props.
import paddyUrl from '../../assets/generated/terrain/paddy.png?url';
import shadeMetaUrl from '../../assets/generated/terrain/shade.json?url';
// Flusstrasse (P8.5b). Entsteht im Terrain-Baker, Schritt 5b2 — der Fluss folgt
// dem Gefälle des Höhenfelds und gehört deshalb zu den Terrain-Assets, nicht zu
// den Straßen.
import riverUrl from '../../assets/generated/terrain/river.json?url';

import sunUrl from '../../assets/generated/lighting/industrial_sunset_02_puresky_4k.sun.json?url';

import { IBL_SETS, LAYER_TEXTURE_SETS, SKY_SETS, START_TIER } from '@/core/AssetManifest';

export const TERRAIN_ASSETS = {
  height: heightUrl,
  /*
   * ~~`normal: normalUrl` — die gebackenen Geländenormalen.~~
   * **Seit P15.3 kein Feld mehr.**
   *
   * Die Datei kostete 5,49 MB übertragen und war der zweitgrößte Posten des
   * Startdownloads. Ihr Inhalt steckt vollständig in `height.r16`, das ohnehin
   * geladen wird — `src/world/deriveNormalMap.ts` rechnet sie beim Start aus
   * denselben Daten mit derselben Sobel-Formel wie der Baker.
   *
   * Dass der Import oben **weg** ist, ist der eigentliche Punkt: solange ihn
   * jemand hält, gibt Vite die Datei mit aus, und die Ersparnis stünde nur in
   * der Absicht. Der Baker schreibt `normal.png` weiterhin — `npm run inspect`
   * liest sie, und sie ist die Vergleichsgrundlage der Messung in P15.6.
   */
  zones: zonesUrl,
  meta: metaUrl,
  /** Gebackene Verschattung aus tools/bake-shadows.mjs — PLAN.md P2 / 2.3. */
  shade: shadeUrl,
  paddy: paddyUrl,
  shadeMeta: shadeMetaUrl,
  river: riverUrl,
} as const;

/**
 * Das Beleuchtungs-HDRI in der Auflösung, die zum Gerät passt — P12.5.
 *
 * ## Warum überhaupt zwei
 *
 * Das IBL ist mit 6,21 MB der zweitgrößte Posten des Startdownloads (53,4 MB
 * gegen 15 MB aus SPEC §4). `tools/optimize-hdri.mjs` halbiert es auf **2,00
 * MB**; die Kodierung ist dabei geprüft, die mittlere Leuchtdichte weicht um
 * 0,0445 % ab.
 *
 * ## Warum es trotzdem nicht überall genommen wird — gemessen
 *
 * Die naheliegende Begründung wäre: „es wird ohnehin von `PMREMGenerator`
 * gefaltet, also ist die Quellauflösung egal." **Das stimmt für den diffusen
 * Anteil und nicht für den spiegelnden.** Ein weichgezeichnetes Umgebungsbild
 * hat flachere Glanzlichter, und nasser Asphalt hat genau die niedrige Rauheit,
 * bei der das auffällt.
 *
 * Bildvergleich bei 1280 × 720, Ultra, vollständig eingeschwungen (identische
 * Instanzzahlen in beiden Läufen), Rauschband aus zwei Aufnahmen desselben
 * Zustands:
 *
 * | Blickpunkt | Rauschband | 2k gegen 1k | mittlere Helligkeit |
 * |---|---|---|---|
 * | `stadt-neon` | 0,42 % der Pixel | **42,97 %**, Mittel 3,06/255 | 91,79 → 89,65 (**−2,3 %**) |
 * | `pass` | 0,14 % | 40,49 %, Mittel 3,67/255 | 68,68 → 67,98 (−1,0 %) |
 * | `kueste` | 0,65 % | 4,45 %, Mittel 0,56/255 | 104,74 → 104,73 (±0) |
 *
 * Im zehnfach verstärkten Differenzbild (`p12ibl_stadtneon_diff10x.png`) ist es
 * eine **gleichmäßige** Verschiebung über alle umgebungsbeleuchteten Flächen —
 * kein Artefakt, sondern die erwartete Folge. Sichtbar ist sie im Nebeneinander
 * nicht; **messbar ist sie**, und damit gehört sie nicht stillschweigend auf
 * jede Stufe.
 *
 * ## Die Auflösung
 *
 * Der Auftrag aus P12 lautet: auf einem 4K-Monitor darf man den Unterschied
 * sehen, auf einem schwachen Gerät nicht. Also bekommt das Telefon die kleine
 * Datei — dort sind 2 % Glanzlichtunterschied bei 1,25 Pixelfaktor ohnehin
 * jenseits des Sichtbaren, und 4,21 MB über Mobilfunk sind es nicht.
 *
 * **Es wird nur eine der beiden geladen.** Beide liegen im Build (Vite gibt
 * beide aus), geholt wird die, die hier zurückkommt.
 *
 * ---
 *
 * > **Seit P15.2 entscheidet nicht mehr das Zeigegerät, sondern die Stufe.**
 * > Der Text oben bleibt stehen, weil seine *Messung* unverändert gilt — 42,97 %
 * > geänderte Pixel am `stadt-neon`, mittlere Helligkeit −2,3 %. Falsch war
 * > nicht die Messung, sondern der **Auslöser**: `pointer: coarse` ist ein
 * > Hinweis auf die Hardware, keine Messung an ihr. Ein Tablet mit starker GPU
 * > bekam die kleine Datei, ein zehn Jahre alter Laptop mit Maus die große —
 * > also in beiden Fällen das Gegenteil der Absicht.
 * >
 * > `iblForDevice()` ist damit ersatzlos entfallen; die Tabelle steht in
 * > `core/AssetManifest.ts` unter `IBL_SETS`, und die Stufe entsteht aus einer
 * > gemessenen Bildrate statt aus einem Medienmerkmal.
 */

export const HDRI_ASSETS = {
  /**
   * Sichtbarer Himmel — scene.background. Gestuft seit P15.2, siehe
   * `SKY_SETS`: 4096 × 2048 auf `voll`, 2048 × 1024 auf `mittel`.
   */
  sky: SKY_SETS[START_TIER],
  /** Beleuchtung — PMREM → scene.environment. Gestuft, siehe oben. */
  ibl: IBL_SETS[START_TIER],
  /** Ausgabe von tools/hdri-sun.mjs für `sky`. */
  sun: sunUrl,
} as const;

/**
 * Detailtexturen, Reihenfolge = TERRAIN_LAYERS.
 *
 * `nor_gl` ist die OpenGL-Normalmap (WebGL braucht die, nicht `nor_dx`), `arm`
 * packt AO/Roughness/Metalness in eine Textur — ein Sampler statt drei.
 *
 * **Seit P15.2 ist das die Startstufe, nicht die einzige.** Die Tabelle beider
 * Stufen steht in `core/AssetManifest.ts`; wer hochstuft, holt sie sich dort
 * und baut die Array-Textur neu. Diese Konstante bleibt, weil sie an sechs
 * Stellen gelesen wird und der Erststart genau einen Satz braucht.
 */
export const LAYER_TEXTURES = LAYER_TEXTURE_SETS[START_TIER];
