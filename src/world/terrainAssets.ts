/**
 * Asset-URLs an einer Stelle.
 *
 * Alles läuft über Vites `?url`-Import statt über einen `public/`-Ordner:
 * so bekommen die Dateien im Build einen Inhalts-Hash, landen im Manifest und
 * ein Tippfehler im Pfad fällt beim Bauen auf statt erst im Browser mit einem
 * 404. Die Reihenfolge der Layer-Arrays entspricht TERRAIN_LAYERS.
 */

import heightUrl from '../../assets/generated/terrain/height.r16?url';
import normalUrl from '../../assets/generated/terrain/normal.png?url';
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

import skyUrl from '../../assets/hdri/industrial_sunset_02_puresky_4k.hdr?url';
import iblUrl from '../../assets/hdri/rooftop_night_2k.hdr?url';
import iblSmallUrl from '../../assets/generated/hdri/rooftop_night_1k.hdr?url';
import sunUrl from '../../assets/generated/lighting/industrial_sunset_02_puresky_4k.sun.json?url';

import rockAlbedo from '../../assets/generated/textures/rock_face_03/Diffuse.jpg?url';
import rockNormal from '../../assets/generated/textures/rock_face_03/nor_gl.jpg?url';
import rockArm from '../../assets/generated/textures/rock_face_03/arm.jpg?url';

import grassAlbedo from '../../assets/generated/textures/aerial_grass_rock/Diffuse.jpg?url';
import grassNormal from '../../assets/generated/textures/aerial_grass_rock/nor_gl.jpg?url';
import grassArm from '../../assets/generated/textures/aerial_grass_rock/arm.jpg?url';

import sandAlbedo from '../../assets/generated/textures/coast_sand_01/Diffuse.jpg?url';
import sandNormal from '../../assets/generated/textures/coast_sand_01/nor_gl.jpg?url';
import sandArm from '../../assets/generated/textures/coast_sand_01/arm.jpg?url';

import paddyAlbedo from '../../assets/generated/textures/brown_mud_02/Diffuse.jpg?url';
import paddyNormal from '../../assets/generated/textures/brown_mud_02/nor_gl.jpg?url';
import paddyArm from '../../assets/generated/textures/brown_mud_02/arm.jpg?url';

export const TERRAIN_ASSETS = {
  height: heightUrl,
  normal: normalUrl,
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
 */
function iblForDevice(): string {
  const coarse =
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse ? iblSmallUrl : iblUrl;
}

export const HDRI_ASSETS = {
  /** Sichtbarer Himmel — scene.background. */
  sky: skyUrl,
  /** Beleuchtung — PMREM → scene.environment. Geräteabhängig, siehe oben. */
  ibl: iblForDevice(),
  /** Ausgabe von tools/hdri-sun.mjs für `sky`. */
  sun: sunUrl,
} as const;

/**
 * Detailtexturen, Reihenfolge = TERRAIN_LAYERS.
 *
 * `nor_gl` ist die OpenGL-Normalmap (WebGL braucht die, nicht `nor_dx`), `arm`
 * packt AO/Roughness/Metalness in eine Textur — ein Sampler statt drei.
 */
export const LAYER_TEXTURES = {
  albedo: [rockAlbedo, grassAlbedo, sandAlbedo, paddyAlbedo],
  normal: [rockNormal, grassNormal, sandNormal, paddyNormal],
  arm: [rockArm, grassArm, sandArm, paddyArm],
} as const;
